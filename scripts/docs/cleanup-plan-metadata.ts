#!/usr/bin/env tsx

/**
 * Repair plan metadata inconsistencies that the normal `plans-sync.ts` flow
 * does not (and should not) fix implicitly: duplicate plan IDs within a
 * domain, and implementation-notes files misplaced directly under
 * `docs/plans/` instead of `docs/plans/implementation-notes/`.
 *
 * Usage:
 *   pnpm docs:cleanup-plan-metadata           # dry-run report only
 *   pnpm docs:cleanup-plan-metadata --write   # apply the reported fixes
 *
 * This is a maintenance operation, not part of `docs:sync` — it is expected
 * to run rarely and to report a clean state ("no fix needed") the vast
 * majority of the time. It never overwrites an existing file and refuses
 * (throws) rather than guessing whenever it cannot determine a safe,
 * deterministic fix — see `pickCanonical` and `moveNotesFile`.
 *
 * @domain tools
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  LEGACY_PLAN_FILE_RE,
  NOTES_PATH,
  NOTES_SUFFIX,
  PLAN_CREATED_RE,
  PLAN_FILE_RE,
  PLANS_PATH,
  ROOT_DIR,
} from './config.js'

const REVIEW_SUFFIX = '-review.md'
const UPDATED_REVIEW_SUFFIX = '--updated-review.md'

type PlanEntry = {
  file: string
  domain: string
  id: number
  created?: string
}

type RenamePlan = {
  from: string
  to: string
  domain: string
  oldId: string
  newId: string
}

type NotesMove = {
  from: string
  to: string
}

const isSupportFile = (file: string): boolean =>
  file.endsWith(NOTES_SUFFIX) || file.endsWith(REVIEW_SUFFIX) || file.endsWith(UPDATED_REVIEW_SUFFIX)

const git = (args: string[]): string => {
  try {
    return execFileSync('git', args, { cwd: ROOT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** First commit date that added this path, via git history (oldest-first). Empty if unknown. */
const firstCommitDate = (relativePath: string): string => {
  const output = git(['log', '--follow', '--diff-filter=A', '--format=%aI', '--', relativePath])
  const dates = output.split('\n').filter(Boolean)
  return dates.length > 0 ? dates[dates.length - 1] : ''
}

const loadPlanEntries = async (): Promise<PlanEntry[]> => {
  const files = await readdir(PLANS_PATH)
  const entries: PlanEntry[] = []

  for (const file of files) {
    if (!file.endsWith('.md') || isSupportFile(file) || LEGACY_PLAN_FILE_RE.test(file)) continue

    const match = file.match(PLAN_FILE_RE)
    if (!match) continue

    const [, domain, id] = match
    const content = await readFile(resolve(PLANS_PATH, file), 'utf8')
    const created = content.match(PLAN_CREATED_RE)?.[1]?.trim()

    entries.push({ file, domain, id: Number(id), created })
  }

  return entries
}

/**
 * Decide which of two plans sharing an ID keeps it. Prefers the earlier
 * `Created:` date; falls back to the earlier first-commit date from git
 * history when `Created` can't distinguish them. Throws rather than guess
 * when neither signal is conclusive — per the plan's "fail rather than make
 * an arbitrary choice" requirement.
 */
export const pickCanonical = (a: PlanEntry, b: PlanEntry): { canonical: PlanEntry, duplicate: PlanEntry } => {
  if (a.created && b.created && a.created !== b.created) {
    return a.created < b.created ? { canonical: a, duplicate: b } : { canonical: b, duplicate: a }
  }

  const dateA = firstCommitDate(`docs/plans/${a.file}`)
  const dateB = firstCommitDate(`docs/plans/${b.file}`)

  if (dateA && dateB && dateA !== dateB) {
    return dateA < dateB ? { canonical: a, duplicate: b } : { canonical: b, duplicate: a }
  }

  throw new Error(
    `Cannot safely determine which of "${a.file}" / "${b.file}" is canonical ` +
    '(Created and git history do not disambiguate). Resolve manually.',
  )
}

export const findDuplicateRenames = (entries: PlanEntry[]): RenamePlan[] => {
  const byKey = new Map<string, PlanEntry[]>()

  for (const entry of entries) {
    const key = `${entry.domain}:${entry.id}`
    const group = byKey.get(key) ?? []
    group.push(entry)
    byKey.set(key, group)
  }

  const maxIdByDomain = new Map<string, number>()
  for (const entry of entries) {
    maxIdByDomain.set(entry.domain, Math.max(maxIdByDomain.get(entry.domain) ?? 0, entry.id))
  }

  const renames: RenamePlan[] = []

  for (const group of byKey.values()) {
    if (group.length < 2) continue
    if (group.length > 2) {
      throw new Error(`More than two plans share ID "${group[0].domain}-${String(group[0].id).padStart(3, '0')}": ${group.map(e => e.file).join(', ')}. Resolve manually.`)
    }

    const [first, second] = group
    const { duplicate } = pickCanonical(first, second)

    const nextId = (maxIdByDomain.get(duplicate.domain) ?? 0) + 1
    maxIdByDomain.set(duplicate.domain, nextId)

    const oldId = `${duplicate.domain}-${String(duplicate.id).padStart(3, '0')}`
    const newId = `${duplicate.domain}-${String(nextId).padStart(3, '0')}`
    const suffix = duplicate.file.slice(oldId.length)

    renames.push({
      from: duplicate.file,
      to: `${newId}${suffix}`,
      domain: duplicate.domain,
      oldId,
      newId,
    })
  }

  return renames
}

const findMisplacedNotes = async (): Promise<NotesMove[]> => {
  const files = await readdir(PLANS_PATH)
  const moves: NotesMove[] = []

  for (const file of files) {
    if (!file.endsWith(NOTES_SUFFIX)) continue

    const from = resolve(PLANS_PATH, file)
    const to = resolve(NOTES_PATH, file)

    if (existsSync(to)) {
      throw new Error(`Cannot move "${file}" to implementation-notes/: destination already exists.`)
    }

    moves.push({ from, to })
  }

  return moves
}

const applyRename = async (planRename: RenamePlan, allFiles: string[]): Promise<void> => {
  const fromPath = resolve(PLANS_PATH, planRename.from)
  const toPath = resolve(PLANS_PATH, planRename.to)

  if (existsSync(toPath)) {
    throw new Error(`Refusing to rename "${planRename.from}" -> "${planRename.to}": destination already exists.`)
  }

  await rename(fromPath, toPath)

  // Update the plan's own Domain-adjacent references and any other current
  // plan's "Depends on" that names the old ID in full `domain-XXX` form.
  // Bare same-domain numeric shorthand (e.g. "Depends on: 010") is not
  // rewritten automatically — it's ambiguous outside its own domain context
  // and is reported separately for manual review.
  for (const file of allFiles) {
    if (file === planRename.to) continue

    const path = resolve(PLANS_PATH, file)
    const content = await readFile(path, 'utf8')

    if (!content.includes(planRename.oldId)) continue

    const updated = content.split(planRename.oldId).join(planRename.newId)
    await writeFile(path, updated)
  }
}

const printReport = (renames: RenamePlan[], moves: NotesMove[]): void => {
  if (renames.length === 0 && moves.length === 0) {
    console.log('No plan metadata inconsistencies found.')
    return
  }

  for (const planRename of renames) {
    console.log(`Duplicate ID detected: ${planRename.oldId}`)
    console.log(`  duplicate: ${planRename.from}`)
    console.log(`  reassigned: ${planRename.to}`)
  }

  for (const move of moves) {
    console.log(`Misplaced implementation notes: ${move.from} -> ${move.to}`)
  }
}

const main = async (): Promise<void> => {
  const write = process.argv.includes('--write')

  const entries = await loadPlanEntries()
  const renames = findDuplicateRenames(entries)
  const moves = await findMisplacedNotes()

  printReport(renames, moves)

  if (!write) {
    if (renames.length > 0 || moves.length > 0) {
      console.log('Dry run only — rerun with --write to apply the changes listed above.')
    }
    return
  }

  const allFiles = entries.map(entry => entry.file)

  for (const planRename of renames) {
    await applyRename(planRename, allFiles)
  }

  for (const move of moves) {
    await rename(move.from, move.to)
  }

  console.log(`Renamed ${renames.length} plan(s), moved ${moves.length} notes file(s).`)
}

// Guard so importing this module's exported helpers for tests doesn't also
// run `main()` (which reads/renames real plan files) as a side effect.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

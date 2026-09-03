#!/usr/bin/env tsx

/**
 * Migrate `Status: planned` plans onto the full metadata contract described
 * in `docs/plans/PLAN-METADATA.md`.
 *
 * Usage:
 *   pnpm docs:migrate-plan-metadata           # dry-run report only
 *   pnpm docs:migrate-plan-metadata --write   # apply confident fixes
 *
 * Scope: only `Status: planned` plans are considered (legacy date-ID plans
 * are excluded — see `docs/plans/PLAN-METADATA.md` §14). For each plan this:
 *   - reports missing/invalid required fields;
 *   - proposes a `Type` when a confident keyword signal exists in the title
 *     (never guesses `feature` as a fallback — an unclear case is reported
 *     for manual review instead of silently defaulting);
 *   - normalizes `Subdomains`/`Tags` formatting (mixed backtick/comma/bracket
 *     styles seen in the repository) to the canonical `` `a` `b` `` form;
 *   - never fabricates `Implemented at`.
 *
 * Rerunning after a write is a no-op: a plan with a valid Type and
 * already-canonical Subdomains/Tags formatting produces no changes.
 *
 * @domain tools
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  AVAILABLE_TYPES,
  LEGACY_PLAN_FILE_RE,
  NOTES_SUFFIX,
  PLAN_FILE_RE,
  PLAN_STATUS_RE,
  PLANS_PATH,
  type PlanType,
  STATUS_ICONS,
} from './config.js'
import { parsePlanHeader, type PlanHeader } from './plan-metadata.js'

const REVIEW_SUFFIX = '-review.md'
const UPDATED_REVIEW_SUFFIX = '--updated-review.md'

/**
 * Confident title/goal keyword → Type inference. Deliberately narrow: a
 * plan whose title doesn't contain one of these signals is reported as
 * "needs review" rather than defaulted to `feature`, matching the plan's
 * "avoid silently inventing classifications" requirement.
 */
const TYPE_KEYWORDS: Array<{ type: PlanType, pattern: RegExp }> = [
  { type: 'bug', pattern: /\bbugfix\b/i },
  { type: 'optimization', pattern: /\b(optimi[sz]ation|performance|perf\b)/i },
  { type: 'refactor', pattern: /\brefactor/i },
  { type: 'polish', pattern: /\bpolish\b/i },
  { type: 'infrastructure', pattern: /\b(tooling|infrastructure|pipeline|generator|browser|observatory)\b/i },
]

type PlanFile = {
  file: string
  path: string
}

type TypeProposal = {
  type: PlanType
  confident: boolean
}

type MigrationResult = {
  file: string
  header: PlanHeader
  content: string
  typeProposal?: TypeProposal
  normalizedContent?: string
  changes: string[]
}

const isSupportFile = (file: string): boolean =>
  file.endsWith(NOTES_SUFFIX) || file.endsWith(REVIEW_SUFFIX) || file.endsWith(UPDATED_REVIEW_SUFFIX)

const getPlannedPlanFiles = async (): Promise<PlanFile[]> => {
  const allFiles = await readdir(PLANS_PATH)

  const candidates = allFiles.filter(
    file =>
      file.endsWith('.md') &&
      !isSupportFile(file) &&
      !LEGACY_PLAN_FILE_RE.test(file) &&
      PLAN_FILE_RE.test(file),
  )

  const result: PlanFile[] = []

  for (const file of candidates) {
    const path = resolve(PLANS_PATH, file)
    const content = await readFile(path, 'utf8')
    const status = content.match(PLAN_STATUS_RE)?.[1]?.trim()

    if (status === 'planned') {
      result.push({ file, path })
    }
  }

  return result
}

export const proposeType = (header: PlanHeader): TypeProposal | undefined => {
  const haystack = header.title ?? header.file

  for (const { type, pattern } of TYPE_KEYWORDS) {
    if (pattern.test(haystack)) {
      return { type, confident: true }
    }
  }

  return undefined
}

/** Canonical formatting: space-separated backtick tokens, e.g. `` `a` `b` ``. */
export const formatTokenList = (tokens: string[]): string => tokens.map(token => `\`${token}\``).join(' ')

const CANONICAL_SUBDOMAINS_LINE_RE = /^\*\*Subdomains:\*\*\s*(.+)$/m
const CANONICAL_TAGS_LINE_RE = /^\*\*Tags:\*\*\s*(.+)$/m

export const normalizeTokenListFormatting = (
  content: string,
  header: PlanHeader,
  changes: string[],
): string => {
  let next = content

  if (header.subdomains.length > 0) {
    const canonical = formatTokenList(header.subdomains)
    const current = next.match(CANONICAL_SUBDOMAINS_LINE_RE)?.[1]?.trimEnd()

    if (current !== canonical) {
      next = next.replace(CANONICAL_SUBDOMAINS_LINE_RE, `**Subdomains:** ${canonical}`)
      changes.push(`Subdomains: "${current}" -> "${canonical}"`)
    }
  }

  if (header.tags.length > 0) {
    const canonical = formatTokenList(header.tags)
    const current = next.match(CANONICAL_TAGS_LINE_RE)?.[1]?.trimEnd()

    if (current !== canonical) {
      next = next.replace(CANONICAL_TAGS_LINE_RE, `**Tags:** ${canonical}`)
      changes.push(`Tags: "${current}" -> "${canonical}"`)
    }
  }

  return next
}

const STATUS_LINE_RE = /^(\*\*Status:\*\*.*)$/m

const applyTypeProposal = (
  content: string,
  proposal: TypeProposal,
  changes: string[],
): string => {
  if (!STATUS_LINE_RE.test(content)) {
    // No anchor to insert after — leave content untouched, caller reports it.
    return content
  }

  changes.push(`Type: (missing) -> "${proposal.type}"`)

  return content.replace(STATUS_LINE_RE, `$1\n**Type:** ${proposal.type}`)
}

/** `**Status:** \`planned\`` missing the 📋 icon — cosmetic drift some plans
 *  picked up from hand-editing; several scripts historically matched the
 *  literal `` `planned` 📋 `` marker, so keeping this consistent avoids a
 *  plan silently falling out of marker-based detection again. */
const normalizeStatusIcon = (
  content: string,
  header: PlanHeader,
  changes: string[],
): string => {
  if (header.status !== 'planned') return content

  const icon = STATUS_ICONS.planned
  const line = content.match(/^\*\*Status:\*\*\s*`planned`(.*)$/m)

  if (!line || line[1].includes(icon)) return content

  changes.push(`Status: added missing "${icon}" icon`)

  return content.replace(/^(\*\*Status:\*\*\s*`planned`)(.*)$/m, `$1 ${icon}$2`.trimEnd())
}

const buildResult = (file: string, content: string): MigrationResult => {
  const header = parsePlanHeader(file, content)
  const changes: string[] = []

  let normalizedContent = normalizeStatusIcon(content, header, changes)
  normalizedContent = normalizeTokenListFormatting(normalizedContent, header, changes)

  let typeProposal: TypeProposal | undefined

  if (!header.type) {
    typeProposal = proposeType(header)

    if (typeProposal) {
      normalizedContent = applyTypeProposal(normalizedContent, typeProposal, changes)
    }
  } else if (!AVAILABLE_TYPES.includes(header.type as PlanType)) {
    changes.push(`Type: invalid value "${header.type}" — needs manual correction`)
  }

  return {
    file,
    header,
    content,
    typeProposal,
    normalizedContent: normalizedContent !== content ? normalizedContent : undefined,
    changes,
  }
}

const printReport = (results: MigrationResult[]): void => {
  const needsReview = results.filter(result => !result.header.type && !result.typeProposal)
  const changed = results.filter(result => result.changes.length > 0)
  const clean = results.filter(result => result.changes.length === 0 && result.header.type)

  console.log(`Planned plans scanned: ${results.length}`)
  console.log(`Already valid: ${clean.length}`)
  console.log(`With proposed changes: ${changed.length}`)
  console.log(`Needing manual review: ${needsReview.length}`)
  console.log('')

  for (const result of changed) {
    console.log(`## ${result.file}`)
    for (const change of result.changes) {
      console.log(`  - ${change}`)
    }
    console.log('')
  }

  if (needsReview.length > 0) {
    console.log('Manual review required (no confident Type signal found):')
    for (const result of needsReview) {
      console.log(`  - ${result.file} — "${result.header.title ?? result.file}"`)
    }
    console.log('')
  }
}

const main = async (): Promise<void> => {
  const write = process.argv.includes('--write')

  const planFiles = await getPlannedPlanFiles()
  const results: MigrationResult[] = []

  for (const { file, path } of planFiles) {
    const content = await readFile(path, 'utf8')
    results.push(buildResult(file, content))
  }

  printReport(results)

  if (!write) {
    console.log('Dry run only — rerun with --write to apply the changes listed above.')
    return
  }

  let written = 0

  for (const result of results) {
    if (!result.normalizedContent) continue

    await writeFile(resolve(PLANS_PATH, result.file), result.normalizedContent)
    written += 1
  }

  console.log(`Wrote ${written} plan file(s).`)
}

// Guard so importing this module's exported helpers for tests doesn't also
// run `main()` (which reads/writes real plan files) as a side effect.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

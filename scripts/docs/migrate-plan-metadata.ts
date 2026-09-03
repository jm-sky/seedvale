#!/usr/bin/env tsx

/**
 * Migrate `Status: planned` plans onto the full metadata contract described
 * in `docs/plans/PLAN-METADATA.md`, using the shared repair engine in
 * `plan-metadata.ts` (`repairPlanMetadata()`) — see that function's JSDoc
 * for what it can and cannot infer.
 *
 * Usage:
 *   pnpm plans:migrate-metadata           # dry-run report only
 *   pnpm plans:migrate-metadata --write   # apply the repaired metadata
 *
 * Scope: only `Status: planned` plans are considered (legacy date-ID plans
 * are excluded — see `docs/plans/PLAN-METADATA.md` §14).
 *
 * Rerunning after a write is a no-op: `repairPlanMetadata()` is idempotent.
 *
 * @domain tools
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LEGACY_PLAN_FILE_RE, NOTES_SUFFIX, PLAN_FILE_RE, PLAN_ID_RE, PLAN_STATUS_RE, PLANS_PATH } from './config.js'
import { listRoadmapFiles, type PlanRepair, repairPlanMetadata } from './plan-metadata.js'

const REVIEW_SUFFIX = '-review.md'
const UPDATED_REVIEW_SUFFIX = '--updated-review.md'

type PlanFile = {
  file: string
  path: string
}

type MigrationResult = {
  file: string
  content: string
  repairedContent: string
  repair: PlanRepair
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

/** Every current (non-legacy) `<domain>-<id>` plan ID on disk — see `RepairPlanMetadataOptions.existingPlanIds`. */
const getExistingPlanIds = async (): Promise<Set<string>> => {
  const allFiles = await readdir(PLANS_PATH)
  const ids = new Set<string>()

  for (const file of allFiles) {
    if (!file.endsWith('.md') || isSupportFile(file) || LEGACY_PLAN_FILE_RE.test(file) || !PLAN_FILE_RE.test(file)) continue

    const match = file.match(PLAN_ID_RE)
    if (match) ids.add(`${match[1]}-${match[2]}`)
  }

  return ids
}

const printReport = (results: MigrationResult[]): void => {
  const changed = results.filter(result => result.repair.changed)
  const withWarnings = results.filter(result => result.repair.warnings.length > 0)
  const clean = results.filter(result => !result.repair.changed && result.repair.warnings.length === 0)

  console.log(`Planned plans scanned: ${results.length}`)
  console.log(`Already valid: ${clean.length}`)
  console.log(`With proposed changes: ${changed.length}`)
  console.log(`With warnings (not auto-fixable): ${withWarnings.length}`)
  console.log('')

  for (const result of changed) {
    console.log(`## ${result.file}`)
    for (const change of result.repair.changes) {
      console.log(`  ${change.field}: ${change.from ?? 'missing'} → ${change.to} [${change.source}]`)
    }
    console.log('')
  }

  if (withWarnings.length > 0) {
    console.log('Warnings (review manually):')
    for (const result of withWarnings) {
      for (const warning of result.repair.warnings) {
        console.log(`  - ${result.file}: ${warning}`)
      }
    }
    console.log('')
  }
}

const main = async (): Promise<void> => {
  const write = process.argv.includes('--write')

  const roadmapFiles = await listRoadmapFiles()
  const existingPlanIds = await getExistingPlanIds()
  const planFiles = await getPlannedPlanFiles()
  const results: MigrationResult[] = []

  for (const { file, path } of planFiles) {
    const content = await readFile(path, 'utf8')
    const { content: repairedContent, repair } = repairPlanMetadata(file, content, { roadmapFiles, existingPlanIds })
    results.push({ file, content, repairedContent, repair })
  }

  printReport(results)

  if (!write) {
    console.log('Dry run only — rerun with --write to apply the changes listed above.')
    return
  }

  let written = 0

  for (const result of results) {
    if (!result.repair.changed) continue

    await writeFile(resolve(PLANS_PATH, result.file), result.repairedContent)
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

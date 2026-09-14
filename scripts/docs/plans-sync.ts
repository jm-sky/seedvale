import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  ARCHIVED_PLANS_PATH,
  AVAILABLE_DOMAINS,
  COMPLETED_STATUSES,
  LEGACY_PLAN_FILE_RE,
  LEGACY_PLAN_ID_RE,
  NOTES_PATH,
  NOTES_SUFFIX,
  PLAN_DEPENDS_RE,
  PLAN_EFFORT_RE,
  PLAN_FILE_RE,
  PLAN_PRIORITY_RE,
  PLAN_ROADMAP_RE,
  PLAN_STATUS_RE,
  PLANS_PATH,
  type Status,
} from './config.js'
import { listRoadmapFiles, repairPlanMetadata } from './plan-metadata.js'
import { parseDependencies } from './plans-recommended-order.js'

const README_PATH = resolve(PLANS_PATH, 'README.md')
const PLANNING_PATH = resolve(PLANS_PATH, 'PLANNING.md')

const UPDATED_REVIEW_SUFFIX = '--updated-review.md'
const REVIEW_SUFFIX = '-review.md'

const DRAFT_HEADING = '## Drafts'
const PLANNED_HEADING = '## Planned'
const PLAN_TITLE_PAD_END_SIZE = 78
const DEPENDS_HEADER = 'Depends'
const ROADMAP_HEADER = 'Roadmap'
const TABLE_HEADER_RE = /^\| File\s+\| Pri \| Effort \| Depends\s+\| Roadmap\s+\|$/
const NEXT_PLAN_ID_HEADING = '## Next plan IDs'
const NEXT_PLAN_ID_END_TAG = 'This ids section is maintained automatically from the plan files.'

const PRIORITY_EMOJI: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '⚪',
}

const CANONICAL_DOMAINS = new Set(Object.keys(AVAILABLE_DOMAINS))

type PlanInfo = {
  file: string
  domain: string
  id: number
}

type TableRowCells = {
  depends: string
  effort: string
  pri: string
  roadmap: string
  title: string
}

type TableColumnWidths = {
  dependsWidth: number
  roadmapWidth: number
}

const hasImplementationNotes = (
  planFile: string,
  implementationNotesFiles: string[],
): boolean => {
  const baseName = planFile.slice(0, -'.md'.length)
  return implementationNotesFiles.includes(`${baseName}${NOTES_SUFFIX}`)
}

const isSupportFile = (file: string): boolean =>
  file.endsWith(NOTES_SUFFIX) ||
  file.endsWith(UPDATED_REVIEW_SUFFIX) ||
  file.endsWith(REVIEW_SUFFIX)

const isLegacyPlanFile = (file: string): boolean =>
  LEGACY_PLAN_FILE_RE.test(file) && !isSupportFile(file)

const parsePlanFile = (file: string): PlanInfo | null => {
  if (isSupportFile(file) || isLegacyPlanFile(file)) return null

  const match = file.match(PLAN_FILE_RE)
  if (!match) return null

  const [, domain, id] = match

  if (!CANONICAL_DOMAINS.has(domain)) {
    throw new Error(
      `Unknown plan domain "${domain}" in "${file}". ` +
      `Expected one of: ${[...CANONICAL_DOMAINS].join(', ')}`,
    )
  }

  return {
    file,
    domain,
    id: Number(id),
  }
}

const extractHeaderBlock = (content: string): string => {
  const idx = content.search(/^##\s/m)
  return idx === -1 ? content : content.slice(0, idx)
}

const matchOne = (
  text: string,
  re: RegExp,
  file: string,
  label: string,
): string => {
  const match = text.match(re)

  if (!match) {
    throw new Error(`Cannot find "${label}" in ${file}`)
  }

  return match[1]
}

const getNotesMarker = (isPlanned: boolean, hasNotes: boolean): string => !isPlanned ? '' : hasNotes ? '💡' : '◼️'
const getPlanTitle = (marker: string, file: string): string => marker ? `${marker} \`${file}\`` : `\`${file}\``
const getPaddedPlanTitle = (marker: string, file: string): string => getPlanTitle(marker, file).padEnd(PLAN_TITLE_PAD_END_SIZE)

const formatDependsCell = (
  raw: string,
  statusById: Map<string, Status>,
): string => {
  const tokens = parseDependencies(raw)

  if (tokens.length === 0) return '-'

  return tokens
    .map(id => {
      const status = statusById.get(id)

      return status !== undefined && COMPLETED_STATUSES.has(status)
        ? `~~${id}~~`
        : id
    })
    .join(', ')
}

const buildRowCells = (
  file: string,
  content: string,
  hasNotes: boolean,
  statusById: Map<string, Status>,
): TableRowCells => {
  const headerBlock = extractHeaderBlock(content)
  const isPlanned = headerBlock.match(PLAN_STATUS_RE)?.[1]?.trim() === 'planned'
  let roadmap: string

  const priorityWord = matchOne(
    headerBlock,
    PLAN_PRIORITY_RE,
    file,
    'Priority',
  )

  try {
    roadmap = matchOne(
      headerBlock,
      PLAN_ROADMAP_RE,
      file,
      'Roadmap',
    )?.replaceAll('`', '').replace('.md', '') ?? '-'
  } catch {
    roadmap = '-'
  }

  const priorityEmoji = PRIORITY_EMOJI[priorityWord.toLowerCase()]

  if (!priorityEmoji) {
    throw new Error(`Unknown priority "${priorityWord}" in ${file}`)
  }

  const effort = matchOne(
    headerBlock,
    PLAN_EFFORT_RE,
    file,
    'Effort',
  )

  const dependsRaw = matchOne(
    headerBlock,
    PLAN_DEPENDS_RE,
    file,
    'Depends on',
  ).trim()

  const marker = getNotesMarker(isPlanned, hasNotes)

  return {
    depends: formatDependsCell(dependsRaw, statusById),
    effort,
    pri: priorityEmoji,
    roadmap,
    title: getPaddedPlanTitle(marker, file),
  }
}

const computeColumnWidths = (rows: TableRowCells[]): TableColumnWidths => {
  let dependsWidth = DEPENDS_HEADER.length
  let roadmapWidth = ROADMAP_HEADER.length

  for (const row of rows) {
    dependsWidth = Math.max(dependsWidth, row.depends.length)
    roadmapWidth = Math.max(roadmapWidth, row.roadmap.length)
  }

  return {
    dependsWidth,
    roadmapWidth,
  }
}

const formatTableHeader = (widths: TableColumnWidths): string =>
  `| ${'File'.padEnd(PLAN_TITLE_PAD_END_SIZE)} | Pri | Effort | ${DEPENDS_HEADER.padEnd(widths.dependsWidth)} | ${ROADMAP_HEADER.padEnd(widths.roadmapWidth)} |`

const formatTableSeparator = (widths: TableColumnWidths): string =>
  `| ${'-'.repeat(PLAN_TITLE_PAD_END_SIZE)} | --- | ------ | ${'-'.repeat(widths.dependsWidth)} | ${'-'.repeat(widths.roadmapWidth)} |`

const formatTableRow = (row: TableRowCells, widths: TableColumnWidths): string =>
  `| ${row.title} | ${row.pri} | ${row.effort.padEnd(6)} | ${row.depends.padEnd(widths.dependsWidth)} | ${row.roadmap.padEnd(widths.roadmapWidth)} |`

const recordPlanStatus = (
  statusById: Map<string, Status>,
  file: string,
  content: string,
): void => {
  const status = (content.match(PLAN_STATUS_RE)?.[1]?.trim() ?? 'done') as Status
  const modern = file.match(PLAN_FILE_RE)

  if (modern) {
    statusById.set(`${modern[1]}-${modern[2]}`, status)
  }

  const legacyId = file.match(LEGACY_PLAN_ID_RE)?.[1]

  if (legacyId) {
    statusById.set(legacyId, status)
  }
}

/**
 * Status lookup for Depends strikethrough: current plans, archive, and
 * legacy date-ID files (numeric IDs such as `155`).
 */
const buildStatusById = async (
  plans: PlanInfo[],
  legacyPlans: string[],
): Promise<Map<string, Status>> => {
  const statusById = new Map<string, Status>()

  for (const plan of plans) {
    const content = await readFile(resolve(PLANS_PATH, plan.file), 'utf8')

    recordPlanStatus(statusById, plan.file, content)
  }

  for (const file of legacyPlans) {
    const content = await readFile(resolve(PLANS_PATH, file), 'utf8')

    recordPlanStatus(statusById, file, content)
  }

  const archivedFiles = await readdir(ARCHIVED_PLANS_PATH)

  for (const file of archivedFiles) {
    if (isSupportFile(file)) continue

    const content = await readFile(resolve(ARCHIVED_PLANS_PATH, file), 'utf8')

    recordPlanStatus(statusById, file, content)
  }

  return statusById
}

const validateUniqueIds = (plans: PlanInfo[]): void => {
  const seen = new Map<string, string>()

  for (const plan of plans) {
    const key = `${plan.domain}:${plan.id}`
    const existing = seen.get(key)

    if (existing) {
      throw new Error(
        `Duplicate plan ID "${plan.domain}-${String(plan.id).padStart(3, '0')}" ` +
        `in "${existing}" and "${plan.file}"`,
      )
    }

    seen.set(key, plan.file)
  }
}

const computeNextPlanIds = (
  plans: PlanInfo[],
): Map<string, number> => {
  const maxByDomain = new Map<string, number>()

  for (const plan of plans) {
    const current = maxByDomain.get(plan.domain) ?? 0

    if (plan.id > current) {
      maxByDomain.set(plan.domain, plan.id)
    }
  }

  return new Map(
    [...CANONICAL_DOMAINS].map(domain => [
      domain,
      (maxByDomain.get(domain) ?? 0) + 1,
    ]),
  )
}

/**
 * Locate a status section's table body (the row range between its `| --- |`
 * separator and its last data row) inside the README lines, bounded by the
 * next `##` heading. Shared by every generated status section (`Draft`,
 * `Planned`) so the table-parsing contract has exactly one implementation —
 * see the plan's "Generic status-section synchronization" design.
 *
 * @domain tools
 */
const findStatusTableRange = (
  lines: string[],
  heading: string,
): { headerIdx: number; separatorIdx: number; lastRowIdx: number } => {
  const headingIdx = lines.findIndex(
    line => line.trim() === heading,
  )

  if (headingIdx === -1) {
    throw new Error(
      `"${heading}" section not found in README`,
    )
  }

  let sectionEndIdx = lines.length

  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      sectionEndIdx = i
      break
    }
  }

  const headerIdx = lines.findIndex(
    (line, i) =>
      i > headingIdx &&
      i < sectionEndIdx &&
      TABLE_HEADER_RE.test(line.trim()),
  )

  if (headerIdx === -1) {
    throw new Error(`Table header not found in README section "${heading}"`)
  }

  const separatorIdx = headerIdx + 1

  let lastRowIdx = separatorIdx

  for (let i = separatorIdx + 1; i < sectionEndIdx; i++) {
    if (lines[i].trim().startsWith('|')) {
      lastRowIdx = i
    } else {
      break
    }
  }

  return {
    headerIdx,
    lastRowIdx,
    separatorIdx,
  }
}

const findPlannedTableRange = (
  lines: string[],
): { separatorIdx: number; lastRowIdx: number } =>
  findStatusTableRange(lines, PLANNED_HEADING)

const getFilesByStatus = async (
  plans: PlanInfo[],
  status: string,
): Promise<string[]> => {
  const files: string[] = []

  for (const plan of plans) {
    const content = await readFile(
      resolve(PLANS_PATH, plan.file),
      'utf8',
    )

    // Derived from the parsed Status field rather than the literal status
    // marker string — a plan missing the emoji (e.g. a typo) must still be
    // recognized by status, not silently dropped from sync.
    const planStatus = content.match(PLAN_STATUS_RE)?.[1]?.trim()

    if (planStatus === status) {
      files.push(plan.file)
    }
  }

  files.sort()

  return files
}

const getPlannedFiles = (
  plans: PlanInfo[],
): Promise<string[]> => getFilesByStatus(plans, 'planned')

/**
 * Fully rebuild a generated status section's table rows from the current
 * set of rows, replacing whatever data rows are currently present between
 * the table separator and the next heading. Used for sections (`Draft`)
 * that are entirely derived and have no incremental/manual state to
 * preserve — see the plan's "Generated section ownership" design.
 *
 * @domain tools
 */
/**
 * Fully rebuild a generated status section's table (header, separator and
 * data rows) from the current set of cells. Shared by Draft and Planned so
 * both tables share the same Depends/Roadmap column widths.
 *
 * @domain tools
 */
const rebuildStatusSection = (
  lines: string[],
  heading: string,
  rows: TableRowCells[],
  widths: TableColumnWidths,
): string[] => {
  const { headerIdx, lastRowIdx } = findStatusTableRange(lines, heading)
  const formatted = [
    formatTableHeader(widths),
    formatTableSeparator(widths),
    ...rows.map(row => formatTableRow(row, widths)),
  ]

  lines.splice(headerIdx, lastRowIdx - headerIdx + 1, ...formatted)

  return lines
}

const getRowCells = async (
  files: string[],
  implementationNotesFiles: string[],
  statusById: Map<string, Status>,
): Promise<TableRowCells[]> => {
  const rows: TableRowCells[] = []

  for (const file of files) {
    const content = await readFile(resolve(PLANS_PATH, file), 'utf8')
    const hasNotes = hasImplementationNotes(file, implementationNotesFiles)

    rows.push(buildRowCells(file, content, hasNotes, statusById))
  }

  return rows
}

/**
 * Repair every current (non-legacy) plan's metadata in place before any
 * other generator consumes it — see the plan's "Repair before sync" design
 * principle. Missing/invalid/conflicting metadata is a data-quality issue,
 * not a pipeline error: this never throws for it, it fixes what it safely
 * can and logs the rest as warnings (`repairPlanMetadata()` in
 * `plan-metadata.ts` owns the actual repair logic).
 *
 * Legacy date-ID plans (`LEGACY_PLAN_FILE_RE`) predate the contract and are
 * excluded here the same way the rest of this script already treats them —
 * see the "Ignoring N legacy plan file(s)" log in `main()`.
 *
 * @domain tools
 */
const repairPlans = async (
  plans: PlanInfo[],
): Promise<void> => {
  const roadmapFiles = await listRoadmapFiles()

  // Bare numeric `Depends on` IDs are ambiguous with pre-domain legacy
  // global IDs (see `RepairPlanMetadataOptions.existingPlanIds`) — only
  // expand one to `<domain>-<id>` when that plan actually exists.
  const existingPlanIds = new Set(
    plans.map(plan => `${plan.domain}-${String(plan.id).padStart(3, '0')}`),
  )

  const warnings: string[] = []
  let repairedCount = 0

  for (const plan of plans) {
    const path = resolve(PLANS_PATH, plan.file)
    const content = await readFile(path, 'utf8')

    const { content: repairedContent, repair } = repairPlanMetadata(plan.file, content, {
      domainFromFilename: plan.domain,
      roadmapFiles,
      existingPlanIds,
    })

    if (repair.changed) {
      await writeFile(path, repairedContent)
      repairedCount += 1

      console.log(`[plan-repair] ${plan.file}`)
      for (const change of repair.changes) {
        console.log(`  ${change.field}: ${change.from ?? 'missing'} → ${change.to} [${change.source}]`)
      }
    }

    for (const warning of repair.warnings) {
      warnings.push(`${plan.file}: ${warning}`)
    }
  }

  if (repairedCount > 0) {
    console.log(`Repaired metadata in ${repairedCount} plan(s).`)
  }

  if (warnings.length > 0) {
    console.warn(`Plan metadata warnings (${warnings.length}) — not fixed automatically, review manually:\n${warnings.join('\n')}`)
  }
}

const getExistingFiles = (
  lines: string[],
  lastRowIdx: number,
  separatorIdx: number,
): string[] => {
  const existingFiles: string[] = []

  for (let i = separatorIdx + 1; i <= lastRowIdx; i++) {
    const match = lines[i].match(/`([^`]+\.md)`/)

    if (match) {
      existingFiles.push(match[1])
    }
  }

  return existingFiles
}

const handleMissingPlans = (
  missing: string[],
  lines: string[],
  lastRowIdx: number,
): string[] => {
  if (missing.length > 0) {
    const placeholders = missing.map(file => `| \`${file}\` |`)

    lines.splice(lastRowIdx + 1, 0, ...placeholders)
  }

  return lines
}

const removeCompletedPlansFromPlannedSection = async (
  lines: string[],
): Promise<string[]> => {
  const { separatorIdx, lastRowIdx } =
    findPlannedTableRange(lines)

  for (let i = lastRowIdx; i > separatorIdx; i--) {
    const match = lines[i].match(
      /^\|\s*(?:💡|◼️)?\s*`([^`]+\.md)`\s*\|/,
    )

    if (!match) continue

    const file = match[1]
    const planPath = resolve(PLANS_PATH, file)

    let content: string

    try {
      content = await readFile(planPath, 'utf8')
    } catch {
      throw new Error(
        `Planned README entry points to missing file: ${file}`,
      )
    }

    const statusMatch = content.match(PLAN_STATUS_RE)

    if (!statusMatch) {
      throw new Error(
        `Cannot find "**Status:**" in planned plan ${file}`,
      )
    }

    const status = statusMatch[1]

    if (status !== 'planned') {
      console.log(
        `Removing completed plan from README Planned section: ${file} ` +
        `(status: "${status}")`,
      )

      lines.splice(i, 1)
    }
  }

  return lines
}

const updateNextPlanIds = (
  lines: string[],
  plans: PlanInfo[],
): string[] => {
  const nextPlanIds = computeNextPlanIds(plans)

  const startIdx = lines.findIndex(
    line => line.trim() === NEXT_PLAN_ID_HEADING,
  )

  const endIdx = lines.findIndex(
    (line, index) =>
      index > startIdx &&
      line.trim() === NEXT_PLAN_ID_END_TAG,
  )

  if (startIdx === -1) {
    throw new Error(
      `"${NEXT_PLAN_ID_HEADING}" section not found`,
    )
  }

  if (endIdx === -1) {
    throw new Error(
      `"${NEXT_PLAN_ID_END_TAG}" heading not found`,
    )
  }

  const rows = [...CANONICAL_DOMAINS]
    .toSorted()
    .map(domain => {
      const nextId = nextPlanIds.get(domain)

      return `- ${domain}: \`${String(nextId).padStart(3, '0')}\``
    })

  lines.splice(
    startIdx + 1,
    endIdx - startIdx - 1,
    '',
    ...rows,
    '',
  )

  return lines
}

const updatePlanningNextPlanIds = (
  lines: string[],
  plans: PlanInfo[],
): string[] => updateNextPlanIds(lines, plans)

const getSourceFiles = async () => {
  const allFiles: string[] = await readdir(PLANS_PATH)

  const implementationNotesFiles: string[] = (
    await readdir(NOTES_PATH)
  ).filter((file: string) => file.endsWith(NOTES_SUFFIX))

  const plans = allFiles
    .map((file: string) => parsePlanFile(file))
    .filter(
      (plan: PlanInfo | null): plan is PlanInfo =>
        plan !== null,
    )

  const legacyPlans = allFiles.filter(file =>
    isLegacyPlanFile(file),
  )

  return {
    allFiles,
    implementationNotesFiles,
    plans,
    legacyPlans,
  }
}

const main = async () => {
  const {
    implementationNotesFiles,
    plans,
    legacyPlans,
  } = await getSourceFiles()

  if (legacyPlans.length > 0) {
    console.log(
      `Ignoring ${legacyPlans.length} legacy plan file(s).`,
    )
  }

  validateUniqueIds(plans)
  await repairPlans(plans)

  const statusById = await buildStatusById(plans, legacyPlans)

  const plannedFiles: string[] =
    await getPlannedFiles(plans)

  const draftFiles: string[] =
    await getFilesByStatus(plans, 'draft')

  // README.md — existing human-facing synchronization.
  const readmeContent = await readFile(
    README_PATH,
    'utf8',
  )
  let readmeLines = readmeContent.split('\n')

  const {
    lastRowIdx,
    separatorIdx,
  } = findPlannedTableRange(readmeLines)

  const existingFiles = getExistingFiles(
    readmeLines,
    lastRowIdx,
    separatorIdx,
  )
  const existingFileSet = new Set(existingFiles)

  const missing = plannedFiles.filter(
    file => !existingFileSet.has(file),
  )

  readmeLines = handleMissingPlans(
    missing,
    readmeLines,
    lastRowIdx,
  )

  readmeLines =
    await removeCompletedPlansFromPlannedSection(
      readmeLines,
    )

  const plannedRange = findPlannedTableRange(readmeLines)
  const plannedOrder = getExistingFiles(
    readmeLines,
    plannedRange.lastRowIdx,
    plannedRange.separatorIdx,
  )

  const draftRows = await getRowCells(
    draftFiles,
    implementationNotesFiles,
    statusById,
  )
  const plannedRows = await getRowCells(
    plannedOrder,
    implementationNotesFiles,
    statusById,
  )
  const widths = computeColumnWidths([...draftRows, ...plannedRows])

  readmeLines = rebuildStatusSection(
    readmeLines,
    DRAFT_HEADING,
    draftRows,
    widths,
  )
  readmeLines = rebuildStatusSection(
    readmeLines,
    PLANNED_HEADING,
    plannedRows,
    widths,
  )

  readmeLines = updatePlanningNextPlanIds(
    readmeLines,
    plans,
  )

  const nextReadmeContent = readmeLines.join('\n')

  if (nextReadmeContent !== readmeContent) {
    await writeFile(README_PATH, nextReadmeContent)
    console.log(
      `Updated ${README_PATH}: +${missing.length} planned row(s), ${draftFiles.length} draft row(s)`,
    )
  } else {
    console.log(`${README_PATH} already up to date`)
  }

  // PLANNING.md — AI-facing synchronization.
  const planningContent = await readFile(
    PLANNING_PATH,
    'utf8',
  )
  let planningLines = planningContent.split('\n')

  planningLines = updatePlanningNextPlanIds(
    planningLines,
    plans,
  )

  const nextPlanningContent = planningLines.join('\n')

  if (nextPlanningContent !== planningContent) {
    await writeFile(PLANNING_PATH, nextPlanningContent)
    console.log(`Updated ${PLANNING_PATH}`)
  } else {
    console.log(`${PLANNING_PATH} already up to date`)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

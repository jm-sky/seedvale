import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AVAILABLE_DOMAINS, LEGACY_PLAN_FILE_RE, NOTES_PATH, NOTES_SUFFIX, PLAN_DEPENDS_RE, PLAN_DOMAIN_RE, PLAN_EFFORT_RE, PLAN_FILE_RE, PLAN_PRIORITY_RE, PLAN_STATUS_RE, PLANS_PATH } from './config.js'
import { formatValidationIssues, listRoadmapFiles, parsePlanHeader, validatePlanHeader, type ValidationIssue } from './plan-metadata.js'

const README_PATH = resolve(PLANS_PATH, 'README.md')
const PLANNING_PATH = resolve(PLANS_PATH, 'PLANNING.md')

const UPDATED_REVIEW_SUFFIX = '--updated-review.md'
const REVIEW_SUFFIX = '-review.md'

const PLANNED_HEADING = '## Planned'
const PLAN_TITLE_PAD_END_SIZE = 70
const TABLE_HEADER = '| File                                                                   | Summary | Pri | Effort | Depends |'
const NEXT_PLAN_ID_HEADING = '## Next plan IDs'
const NEXT_PLAN_ID_END_TAG = 'This ids section is maintained automatically from the plan files.'
const PLANNED_END_TAG = '## Verification needed'

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
const getPlanTitle = (marker: string, file: string): string => `${marker} \`${file}\``
const getPaddedPlanTitle = (marker: string, file: string): string => getPlanTitle(marker, file).padEnd(PLAN_TITLE_PAD_END_SIZE)

const buildRow = (
  file: string,
  content: string,
  hasNotes: boolean,
): string => {
  const headerBlock = extractHeaderBlock(content)
  const isPlanned = headerBlock.match(PLAN_STATUS_RE)?.[1]?.trim() === 'planned'

  const priorityWord = matchOne(
    headerBlock,
    PLAN_PRIORITY_RE,
    file,
    'Priority',
  )

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

  const depends = dependsRaw.toLowerCase() === 'none' ? '-' : dependsRaw
  const marker = getNotesMarker(isPlanned, hasNotes)
  const title = getPaddedPlanTitle(marker, file)

  return `| ${title} | -       | ${priorityEmoji} | ${effort.padEnd(6)} | ${depends.padEnd(6)} |`
}

const validatePlan = async (plan: PlanInfo): Promise<void> => {
  const content = await readFile(resolve(PLANS_PATH, plan.file), 'utf8')

  const match = content.match(PLAN_DOMAIN_RE)

  if (!match) {
    console.warn(
      `Warning: missing "domain:" in \`${plan.file}\`; ` +
      `using filename domain "${plan.domain}"`,
    )
    return
  }

  const domain = match[1].trim()

  if (domain !== plan.domain) {
    throw new Error(
      `Domain mismatch in ${plan.file}: ` +
      `filename says "${plan.domain}", frontmatter says "${domain}"`,
    )
  }
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

const findPlannedTableRange = (
  lines: string[],
): { separatorIdx: number; lastRowIdx: number } => {
  const plannedHeadingIdx = lines.findIndex(
    line => line.trim() === PLANNED_HEADING,
  )

  if (plannedHeadingIdx === -1) {
    throw new Error(
      `"${PLANNED_HEADING}" section not found in README`,
    )
  }

  let sectionEndIdx = lines.length

  for (let i = plannedHeadingIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      sectionEndIdx = i
      break
    }
  }

  const headerIdx = lines.findIndex(
    (line, i) =>
      i > plannedHeadingIdx &&
      i < sectionEndIdx &&
      line.trim() === TABLE_HEADER,
  )

  if (headerIdx === -1) {
    throw new Error('Planned table header not found in README')
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
    lastRowIdx,
    separatorIdx,
  }
}

const getPlannedFiles = async (
  plans: PlanInfo[],
): Promise<string[]> => {
  const plannedFiles: string[] = []

  for (const plan of plans) {
    const content = await readFile(
      resolve(PLANS_PATH, plan.file),
      'utf8',
    )

    // Derived from the parsed Status field rather than the literal
    // "`planned` 📋" marker string — a plan missing the emoji (e.g. a typo)
    // must still be recognized as planned, not silently dropped from sync.
    const status = content.match(PLAN_STATUS_RE)?.[1]?.trim()

    if (status === 'planned') {
      plannedFiles.push(plan.file)
    }
  }

  plannedFiles.sort()

  return plannedFiles
}

/**
 * Validate every current (non-legacy) plan against the plan metadata
 * contract (`docs/plans/PLAN-METADATA.md`), collecting every issue rather
 * than failing on the first one so a single sync run surfaces the complete
 * cleanup list.
 *
 * Legacy date-ID plans (`LEGACY_PLAN_FILE_RE`) predate the contract and are
 * excluded here the same way the rest of this script already treats them —
 * see the "Ignoring N legacy plan file(s)" log in `main()`.
 *
 * @domain tools
 */
const validateMetadataContract = async (
  plans: PlanInfo[],
): Promise<void> => {
  const roadmapFiles = await listRoadmapFiles()
  const issues: ValidationIssue[] = []

  for (const plan of plans) {
    const content = await readFile(resolve(PLANS_PATH, plan.file), 'utf8')
    const header = parsePlanHeader(plan.file, content)

    issues.push(
      ...validatePlanHeader(header, {
        domainFromFilename: plan.domain,
        roadmapFiles,
      }),
    )
  }

  if (issues.length > 0) {
    throw new Error(
      `Plan metadata contract violations (${issues.length}):\n${formatValidationIssues(issues)}`,
    )
  }
}

const getExistingFiles = (
  lines: string[],
  lastRowIdx: number,
  separatorIdx: number,
): Set<string> => {
  const existingFiles = new Set<string>()

  for (let i = separatorIdx + 1; i <= lastRowIdx; i++) {
    const match = lines[i].match(/`([^`]+\.md)`/)

    if (match) {
      existingFiles.add(match[1])
    }
  }

  return existingFiles
}

const handleMissingPlans = async (
  missing: string[],
  implementationNotesFiles: string[],
  lines: string[],
  lastRowIdx: number,
): Promise<string[]> => {
  if (missing.length > 0) {
    const newRows: string[] = []

    for (const file of missing) {
      const content = await readFile(resolve(PLANS_PATH, file), 'utf8')
      const hasNotes = hasImplementationNotes(file, implementationNotesFiles)

      newRows.push(buildRow(file, content, hasNotes))
    }

    lines.splice(lastRowIdx + 1, 0, ...newRows)
  }

  return lines
}

const syncImplementationNotesMarkers = (
  lines: string[],
  plans: PlanInfo[],
  implementationNotesFiles: string[],
): string[] => {
  const planFiles = new Set(plans.map(plan => plan.file))
  const startIdx = lines.findIndex(line => line.trim() === PLANNED_HEADING)
  const endIdx = lines.findIndex(line => line.trim() === PLANNED_END_TAG)

  return lines.map((line, idx) => {
    if (idx < startIdx || idx > endIdx) return line

    const match = line.match(/^\|\s*(💡|◼️)?\s*`([^`]+\.md)`\s*\|/)

    if (!match) return line

    const file = match[2]

    if (!planFiles.has(file)) return line

    const hasNotes = hasImplementationNotes(
      file,
      implementationNotesFiles,
    )
    const marker = getNotesMarker(true, hasNotes)
    const title = getPaddedPlanTitle(marker, file)

    return line.replace(
      /^\|\s*(💡|◼️)?\s*`([^`]+\.md)`\s*\|/,
      `| ${title} |`,
    )
  })
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

const validatePlans = async (
  plans: PlanInfo[],
): Promise<void> => {
  validateUniqueIds(plans)

  for (const plan of plans) {
    await validatePlan(plan)
  }
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

  await validatePlans(plans)
  await validateMetadataContract(plans)

  const plannedFiles: string[] =
    await getPlannedFiles(plans)

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

  const missing = plannedFiles.filter(
    file => !existingFiles.has(file),
  )

  readmeLines = await handleMissingPlans(
    missing,
    implementationNotesFiles,
    readmeLines,
    lastRowIdx,
  )

  readmeLines =
    await removeCompletedPlansFromPlannedSection(
      readmeLines,
    )

  readmeLines = syncImplementationNotesMarkers(
    readmeLines,
    plans,
    implementationNotesFiles,
  )

  readmeLines = updatePlanningNextPlanIds(
    readmeLines,
    plans,
  )

  const nextReadmeContent = readmeLines.join('\n')

  if (nextReadmeContent !== readmeContent) {
    await writeFile(README_PATH, nextReadmeContent)
    console.log(
      `Updated ${README_PATH}: +${missing.length} planned row(s)`,
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

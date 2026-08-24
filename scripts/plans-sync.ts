import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(SCRIPT_DIR, '..')
const PLANS_DIR = 'docs/plans'
const PLANS_PATH = resolve(ROOT_DIR, PLANS_DIR)
const README_PATH = resolve(PLANS_PATH, 'README.md')

const PLAN_FILE_RE = /^([a-z0-9-]+)-(\d{3})-.+\.md$/
const LEGACY_PLAN_FILE_RE = /^\d{4}-\d{2}-\d{2}--\d{3}--.+\.md$/

const NOTES_SUFFIX = '-implementation-notes.md'
const UPDATED_REVIEW_SUFFIX = '--updated-review.md'
const REVIEW_SUFFIX = '-review.md'

const PLANNED_STATUS_MARKER = '**Status:** `planned` 📋'
const PLANNED_STATUS_RE = /^\*\*Status:\*\*\s*`([^`]+)`/m
const PLANNED_HEADING = '## Planned'
const TABLE_HEADER = '| File | Summary | Pri | Effort | Depends |'
const NEXT_PLAN_ID_SUBHEADING = 'Next IDs are tracked separately for each canonical domain. Until the first new plan is created in a domain, its next ID is `001`.'
const NEXT_PLAN_ID_END_TAG = 'This ids section is maintained automatically from the plan files.'

const PRIORITY_EMOJI: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '⚪',
}

const CANONICAL_DOMAINS = new Set([
  'ai',
  'fauna',
  'items-player',
  'npc',
  'persistence',
  'quests-progression',
  'settlements',
  'settlements-npcs',
  'tools',
  'ui-input',
  'world',
  'world-terrain'
])

type PlanInfo = {
  file: string
  domain: string
  id: number
}

const isSupportFile = (file: string): boolean =>
  file.endsWith(NOTES_SUFFIX) ||
  file.endsWith(UPDATED_REVIEW_SUFFIX) ||
  file.endsWith(REVIEW_SUFFIX)

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

const isLegacyPlanFile = (file: string): boolean =>
  LEGACY_PLAN_FILE_RE.test(file) && !isSupportFile(file)

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

const buildRow = (file: string, content: string, hasNotes: boolean): string => {
  const headerBlock = extractHeaderBlock(content)

  const priorityWord = matchOne(
    headerBlock,
    /\*\*Priority:\*\*\s*[^\w]*([A-Za-z]+)/,
    file,
    'Priority',
  )

  const priorityEmoji = PRIORITY_EMOJI[priorityWord.toLowerCase()]

  if (!priorityEmoji) {
    throw new Error(`Unknown priority "${priorityWord}" in ${file}`)
  }

  const effort = matchOne(
    headerBlock,
    /\*\*Effort:\*\*\s*`?([A-Za-z]{1,3})`?/,
    file,
    'Effort',
  )

  const dependsRaw = matchOne(
    headerBlock,
    /\*\*Depends on:\*\*\s*(.+)/,
    file,
    'Depends on',
  ).trim()

  const depends =
    dependsRaw.toLowerCase() === 'none' ? '-' : dependsRaw

  return `| \`${file}\` ${hasNotes ? '💡' : '◼️'} | - | ${priorityEmoji} | ${effort} | ${depends} |`
}

const validatePlan = async (plan: PlanInfo): Promise<void> => {
  const content = await readFile(resolve(PLANS_PATH, plan.file), 'utf8')

  const match = content.match(/^\*\*domain:\*\*\s*`?([^`\s]+)`?\s*$/im)

  if (!match) {
    console.warn(
      `Warning: missing "domain:" in \`${plan.file}\`; using filename domain "${plan.domain}"`,
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

const getPlannedFiles = async (plans: PlanInfo[]): Promise<string[]> => {
  const plannedFiles: string[] = []

  for (const plan of plans) {
    const content = await readFile(
      resolve(PLANS_PATH, plan.file),
      'utf8',
    )

    if (content.includes(PLANNED_STATUS_MARKER)) {
      plannedFiles.push(plan.file)
    }
  }

  plannedFiles.sort()

  return plannedFiles
}

const getExistingFiles = (lines: string[], lastRowIdx: number, separatorIdx: number): Set<string> => {
  const existingFiles = new Set<string>()

  for (let i = separatorIdx + 1; i <= lastRowIdx; i++) {
    const match = lines[i].match(/`([^`]+\.md)`/)

    if (match) {
      existingFiles.add(match[1])
    }
  }

  return existingFiles
}

const handleMissingPlans = async (missing: string[], implementationNotesFiles: string[], lines: string[], lastRowIdx: number): Promise<string[]> => {
  if (missing.length > 0) {
    const newRows: string[] = []

    for (const file of missing) {
      const content = await readFile(resolve(PLANS_PATH, file), 'utf8')
      const hasNotes = implementationNotesFiles.some(notesFile => notesFile.startsWith(file.replace(NOTES_SUFFIX, '')))

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

  return lines.map(line => {
    const match = line.match(
      /^\|\s*`([^`]+\.md)`\s*(💡|◼️)?\s*\|/,
    )

    if (!match) return line

    const file = match[1]

    if (!planFiles.has(file)) return line

    const baseName = file.slice(0, -'.md'.length)

    const hasNotes = implementationNotesFiles.some(
      notesFile =>
        notesFile === `${baseName}${NOTES_SUFFIX}`,
    )

    const marker = hasNotes ? '💡' : '◼️'

    return line.replace(
      /^\|\s*`([^`]+\.md)`\s*(💡|◼️)?\s*\|/,
      `| \`${file}\` ${marker} |`,
    )
  })
}

const removeCompletedPlansFromPlannedSection = async (
  lines: string[],
): Promise<string[]> => {
  const { separatorIdx, lastRowIdx } = findPlannedTableRange(lines)

  for (let i = lastRowIdx; i > separatorIdx; i--) {
    const match = lines[i].match(/^\|\s*`([^`]+\.md)`\s*\|/)

    if (!match) continue

    const file = match[1]
    const planPath = resolve(PLANS_PATH, file)

    let content: string

    try {
      content = await readFile(planPath, 'utf8')
    } catch {
      throw new Error(`Planned README entry points to missing file: ${file}`)
    }

    const statusMatch = content.match(PLANNED_STATUS_RE)

    if (!statusMatch) {
      throw new Error(`Cannot find "**Status:**" in planned plan ${file}`)
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

const validatePlans = async (plans: PlanInfo[]): Promise<void> => {
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
    line => line.trim() === NEXT_PLAN_ID_SUBHEADING,
  )

  const endIdx = lines.findIndex(
    (line, index) =>
      index > startIdx &&
      line.trim() === NEXT_PLAN_ID_END_TAG,
  )

  if (startIdx === -1) {
    throw new Error(`"${NEXT_PLAN_ID_SUBHEADING}" section not found`)
  }

  if (endIdx === -1) {
    throw new Error(`"${NEXT_PLAN_ID_END_TAG}" heading not found`)
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

const getSourceFiles = async () => {
  const allFiles: string[] = await readdir(PLANS_PATH)

  const implementationNotesFiles: string[] = allFiles.filter(file => file.endsWith(NOTES_SUFFIX))

  const plans = allFiles
    .map(parsePlanFile)
    .filter((plan: PlanInfo | null): plan is PlanInfo => plan !== null)

  const legacyPlans = allFiles.filter(isLegacyPlanFile)

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
    console.log(`Ignoring ${legacyPlans.length} legacy plan file(s).`)
  }

  await validatePlans(plans)

  const plannedFiles: string[] = await getPlannedFiles(plans)

  const readmeContent = await readFile(README_PATH, 'utf8')
  let lines = readmeContent.split('\n')

  const { lastRowIdx, separatorIdx } = findPlannedTableRange(lines)

  const existingFiles = getExistingFiles(lines, lastRowIdx, separatorIdx)

  const missing = plannedFiles.filter(file => !existingFiles.has(file))

  lines = await handleMissingPlans(missing, implementationNotesFiles, lines, lastRowIdx)
  lines = await removeCompletedPlansFromPlannedSection(lines)
  lines = await updateNextPlanIds(lines, plans)
  lines = syncImplementationNotesMarkers(lines, plans, implementationNotesFiles)

  const nextContent = lines.join('\n')

  if (nextContent !== readmeContent) {
    await writeFile(README_PATH, nextContent)

    console.log(`Updated ${README_PATH}: +${missing.length} planned row(s)`)
  } else {
    console.log(`${README_PATH} already up to date`)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

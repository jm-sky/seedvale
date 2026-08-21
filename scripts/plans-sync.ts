import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(SCRIPT_DIR, '..')
const PLANS_DIR = 'docs/plans'
const PLANS_PATH = resolve(ROOT_DIR, PLANS_DIR)
const README_PATH = resolve(PLANS_PATH, 'README.md')

const PLAN_FILE_RE = /^\d{4}-\d{2}-\d{2}--(\d{3})--.+\.md$/
const NOTES_SUFFIX = '-implementation-notes.md'
const UPDATED_REVIEW_SUFFIX = '--updated-review.md'
const REVIEW_SUFFIX = '-review.md'
const PLANNED_STATUS_MARKER = '**Status:** `planned` 📋'
const PLANNED_HEADING = '## Planned'
const NEXT_PLAN_ID_HEADING = '## Next plan ID'
const PLAN_DOMAINS_HEADING = '## Plan domains'
const TABLE_HEADER = '| File | Summary | Pri | Effort | Depends |'

const PRIORITY_EMOJI: Record<string, string> = {
  high: '🔴',
  low: '⚪',
  medium: '🟡',
}

const isBasePlanFile = (file: string): boolean =>
  PLAN_FILE_RE.test(file) &&
  !file.endsWith(NOTES_SUFFIX) &&
  !file.endsWith(UPDATED_REVIEW_SUFFIX) &&
  !file.endsWith(REVIEW_SUFFIX)

const extractPlanId = (file: string): number => {
  const match = file.match(PLAN_FILE_RE)
  if (!match) throw new Error(`Cannot extract plan id from "${file}"`)
  return Number(match[1])
}

const extractHeaderBlock = (content: string): string => {
  const idx = content.search(/^##\s/m)
  return idx === -1 ? content : content.slice(0, idx)
}

const matchOne = (text: string, re: RegExp, file: string, label: string): string => {
  const match = text.match(re)
  if (!match) throw new Error(`Cannot find "${label}" in ${file}`)
  return match[1]
}

const truncate = (text: string, max: number): string => {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`
}

const extractSummary = (content: string, file: string): string => {
  const headingMatch = content.match(/^##\s+(?:\d+\.\s*)?(?:Cel|Goal)\s*$/m)
  const fallback = content.match(/^#\s+Plan:\s*(.+)$/m)?.[1]?.trim() ?? file

  if (!headingMatch || headingMatch.index === undefined) return fallback

  const afterHeading = content.slice(headingMatch.index + headingMatch[0].length)
  const body = afterHeading.replace(/^\s+/, '')
  const paragraphEnd = body.search(/\n\s*\n/)
  const paragraph = paragraphEnd === -1 ? body : body.slice(0, paragraphEnd)
  const oneLine = paragraph.replace(/\s+/g, ' ').trim()

  return oneLine ? truncate(oneLine, 400) : fallback
}

const buildRow = (file: string, content: string): string => {
  const headerBlock = extractHeaderBlock(content)

  const priorityWord = matchOne(headerBlock, /\*\*Priority:\*\*\s*[^\w]*([A-Za-z]+)/, file, 'Priority')
  const priorityEmoji = PRIORITY_EMOJI[priorityWord.toLowerCase()]
  if (!priorityEmoji) throw new Error(`Unknown priority "${priorityWord}" in ${file}`)

  const effort = matchOne(headerBlock, /\*\*Effort:\*\*\s*`?([A-Za-z]{1,3})`?/, file, 'Effort')

  const dependsRaw = matchOne(headerBlock, /\*\*Depends on:\*\*\s*(.+)/, file, 'Depends on').trim()
  const depends = dependsRaw.toLowerCase() === 'none' ? '-' : dependsRaw

  const summary = extractSummary(content, file).replace(/\|/g, '\\|')

  return `| \`${file}\` | ${summary} | ${priorityEmoji} | ${effort} | ${depends} |`
}

const computeNextPlanId = (baseFiles: string[]): number => {
  const ids = baseFiles.map(extractPlanId)
  return Math.max(...ids) + 1
}

const upsertNextPlanIdSection = (lines: string[], nextId: number): string[] => {
  const headingIdx = lines.findIndex(l => l.trim() === NEXT_PLAN_ID_HEADING)

  if (headingIdx !== -1) {
    for (let i = headingIdx + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) break
      const trimmed = lines[i].trim()
      if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
        lines[i] = `\`${nextId}\``
        return lines
      }
    }
    lines.splice(headingIdx + 1, 0, '', `\`${nextId}\``)
    return lines
  }

  const domainsIdx = lines.findIndex(l => l.trim() === PLAN_DOMAINS_HEADING)
  const insertion = [NEXT_PLAN_ID_HEADING, '', `\`${nextId}\``, '']
  if (domainsIdx === -1) {
    lines.push('', ...insertion)
  } else {
    lines.splice(domainsIdx, 0, ...insertion)
  }
  return lines
}

const findPlannedTableRange = (
  lines: string[],
): { separatorIdx: number; lastRowIdx: number } => {
  const plannedHeadingIdx = lines.findIndex(l => l.trim() === PLANNED_HEADING)
  if (plannedHeadingIdx === -1) throw new Error(`"${PLANNED_HEADING}" section not found in README`)

  let sectionEndIdx = lines.length
  for (let i = plannedHeadingIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      sectionEndIdx = i
      break
    }
  }

  const headerIdx = lines.findIndex(
    (l, i) => i > plannedHeadingIdx && i < sectionEndIdx && l.trim() === TABLE_HEADER,
  )
  if (headerIdx === -1) throw new Error('Planned table header not found in README')
  const separatorIdx = headerIdx + 1

  let lastRowIdx = separatorIdx
  for (let i = separatorIdx + 1; i < sectionEndIdx; i++) {
    if (lines[i].trim().startsWith('|')) {
      lastRowIdx = i
    } else {
      break
    }
  }

  return { lastRowIdx, separatorIdx }
}

const main = async () => {
  const allFiles = await readdir(PLANS_PATH)
  const baseFiles = allFiles.filter(isBasePlanFile)
  const nextPlanId = computeNextPlanId(baseFiles)

  const plannedFiles: string[] = []
  for (const file of baseFiles) {
    const content = await readFile(resolve(PLANS_PATH, file), 'utf8')
    if (content.includes(PLANNED_STATUS_MARKER)) plannedFiles.push(file)
  }
  plannedFiles.sort()

  const readmeContent = await readFile(README_PATH, 'utf8')
  let lines = readmeContent.split('\n')

  lines = upsertNextPlanIdSection(lines, nextPlanId)

  const { lastRowIdx, separatorIdx } = findPlannedTableRange(lines)
  const existingFiles = new Set<string>()
  for (let i = separatorIdx + 1; i <= lastRowIdx; i++) {
    const match = lines[i].match(/`([^`]+\.md)`/)
    if (match) existingFiles.add(match[1])
  }

  const missing = plannedFiles.filter(file => !existingFiles.has(file))

  if (missing.length > 0) {
    const newRows: string[] = []
    for (const file of missing) {
      const content = await readFile(resolve(PLANS_PATH, file), 'utf8')
      newRows.push(buildRow(file, content))
    }
    lines.splice(lastRowIdx + 1, 0, ...newRows)
  }

  const nextContent = lines.join('\n')

  if (nextContent !== readmeContent) {
    await writeFile(README_PATH, nextContent)
    console.log(`Updated ${README_PATH}: +${missing.length} planned row(s), Next plan ID = ${nextPlanId}`)
  } else {
    console.log(`${README_PATH} already up to date (Next plan ID = ${nextPlanId})`)
  }
}

main()

import {
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  resolve,
} from 'node:path'
import {
  DOCS_DIR,
} from './utils.js'

const DEPENDENCY_DIR = resolve(
  DOCS_DIR,
  'code-map/dependencies',
)

const CODE_INDEX_PATH = resolve(
  DOCS_DIR,
  'CODE_INDEX.md',
)

const AI_NAVIGATION_INDEX_START =
  '<!-- AI_NAVIGATION_INDEX_START -->'

const AI_NAVIGATION_INDEX_END =
  '<!-- AI_NAVIGATION_INDEX_END -->'

const MAX_INDEX_ENTRIES = 20
const MAX_CANDIDATES_PER_DOMAIN = 3
const MIN_SCORE = 20

const IGNORE_FILE_PATTERNS = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /^types\.ts$/,
  /^constants\.ts$/,
  /^kinds\.ts$/,
  /^index\.ts$/,
  /^main\.ts$/,
  /^vite-env\.d\.ts$/,
]

const ROLE_PATTERNS = [
  { pattern: /Agent\.ts$/, score: 40, role: 'agent' },
  { pattern: /Controller\.ts$/, score: 40, role: 'controller' },
  { pattern: /Manager\.ts$/, score: 38, role: 'manager' },
  { pattern: /^create[A-Z].*\.ts$/, score: 36, role: 'factory' },
  { pattern: /Generator\.ts$/, score: 36, role: 'generator' },
  { pattern: /Resolver\.ts$/, score: 32, role: 'resolver' },
  { pattern: /Lifecycle\.ts$/, score: 32, role: 'lifecycle' },
  { pattern: /System\.ts$/, score: 30, role: 'system' },
  { pattern: /Service\.ts$/, score: 28, role: 'service' },
]

const DOMAIN_ENTRY_NAMES = new Set([
  'Inventory.ts',
  'itemCatalog.ts',
  'mount.ts',
  'PlayerNeeds.ts',
  'PlayerSkills.ts',
  'saveData.ts',
  'settlementEconomy.ts',
  'store.ts',
  'worldConfig.ts',
])

const TECHNICAL_PATTERNS = [
  { pattern: /^types\.ts$/, penalty: 20 },
  { pattern: /^constants\.ts$/, penalty: 18 },
  { pattern: /^kinds\.ts$/, penalty: 18 },
  { pattern: /^index\.ts$/, penalty: 15 },
  { pattern: /\.test\.ts$/, penalty: 30 },
  { pattern: /\.spec\.ts$/, penalty: 30 },
  { pattern: /Example\.ts$/, penalty: 20 },
  { pattern: /Preview\.ts$/, penalty: 15 },
  { pattern: /Visual\.ts$/, penalty: 10 },
  { pattern: /Debug/i, penalty: 12 },
]

type DependencyInfo = {
  file: string
  imports: string[]
  importedBy: string[]
}

type Candidate = {
  domain: string
  file: string
  score: number
  imports: number
  importedBy: number
  reasons: string[]
  role: string
}

function importedByScore(
  importedBy: number,
): number {
  if (importedBy >= 40) return 40
  if (importedBy >= 30) return 35
  if (importedBy >= 20) return 30
  if (importedBy >= 15) return 24
  if (importedBy >= 10) return 18
  if (importedBy >= 5) return 10
  if (importedBy >= 2) return 5

  return 0
}

function importsScore(
  imports: number,
): number {
  if (imports >= 30) return 10
  if (imports >= 20) return 8
  if (imports >= 10) return 6
  if (imports >= 5) return 4
  if (imports >= 2) return 2

  return 0
}

function calculateScore(
  dependency: DependencyInfo,
): Candidate {
  const fileName =
    getFileName(dependency.file)

  let roleScore = 0
  let role = ''

  for (const rule of ROLE_PATTERNS) {
    if (!rule.pattern.test(fileName)) {
      continue
    }

    if (rule.score > roleScore) {
      roleScore = rule.score
      role = rule.role
    }
  }

  if (
    DOMAIN_ENTRY_NAMES.has(fileName) &&
    roleScore < 26
  ) {
    roleScore = 26
    role = 'domain entry'
  }

  let penalty = 0

  for (const rule of TECHNICAL_PATTERNS) {
    if (rule.pattern.test(fileName)) {
      penalty += rule.penalty
    }
  }

  const consumers =
    importedByScore(
      dependency.importedBy.length,
    )

  const dependencies =
    importsScore(
      dependency.imports.length,
    )

  const score = Math.max(
    0,
    Math.round(
      roleScore +
      consumers +
      dependencies -
      penalty,
    ),
  )

  const reasons: string[] = []

  if (role) {
    reasons.push(
      `role: ${role} +${roleScore}`,
    )
  }

  if (consumers > 0) {
    reasons.push(
      `importedBy +${consumers}`,
    )
  }

  if (dependencies > 0) {
    reasons.push(
      `imports +${dependencies}`,
    )
  }

  if (penalty > 0) {
    reasons.push(
      `technical -${penalty}`,
    )
  }

  if (
    dependency.importedBy.length >= 20
  ) {
    reasons.push('widely used')
  }

  return {
    domain: getDomain(
      dependency.file,
    ),
    file: dependency.file,
    score,
    imports:
      dependency.imports.length,
    importedBy:
      dependency.importedBy.length,
    reasons,
    role,
  }
}

function shouldIgnore(
  file: string,
): boolean {
  const name =
    getFileName(file)

  return IGNORE_FILE_PATTERNS.some(
    pattern => pattern.test(name),
  )
}

function getDomain(
  file: string,
): string {
  return file.split('/')[0] ?? 'other'
}

function getFileName(
  file: string,
): string {
  return (
    file.split('/').at(-1) ??
    file
  )
}

function parseDependencyMap(
  content: string,
): DependencyInfo[] {
  const lines =
    content.split(/\r?\n/)

  const result: DependencyInfo[] = []

  let current:
    | DependencyInfo
    | null = null

  let section:
    | 'imports'
    | 'importedBy'
    | null = null

  const flush = (): void => {
    if (current) {
      result.push(current)
    }

    current = null
    section = null
  }

  for (const line of lines) {
    const heading =
      line.match(
        /^##\s+`([^`]+\.tsx?)`$/,
      )

    if (heading) {
      flush()

      current = {
        file: heading[1],
        imports: [],
        importedBy: [],
      }

      continue
    }

    if (!current) {
      continue
    }

    if (
      line.trim() ===
      '**Imports**'
    ) {
      section = 'imports'
      continue
    }

    if (
      line.trim() ===
      '**Imported by**'
    ) {
      section = 'importedBy'
      continue
    }

    if (
      line.startsWith('- `') &&
      line.endsWith('`')
    ) {
      const file =
        line.trim().slice(2, -1)

      if (
        section === 'imports'
      ) {
        current.imports.push(file)
      } else if (
        section === 'importedBy'
      ) {
        current.importedBy.push(file)
      }
    }
  }

  flush()

  return result
}

async function readDependencyMaps(): Promise<
  DependencyInfo[]
> {
  const entries =
    await readdir(
      DEPENDENCY_DIR,
      {
        withFileTypes: true,
      },
    )

  const files = entries
    .filter(
      entry =>
        entry.isFile() &&
        entry.name.endsWith('.md'),
    )
    .map(entry =>
      resolve(
        DEPENDENCY_DIR,
        entry.name,
      ),
    )
    .toSorted()

  const result: DependencyInfo[] = []

  for (const file of files) {
    const content =
      await readFile(
        file,
        'utf8',
      )

    result.push(
      ...parseDependencyMap(
        content,
      ),
    )
  }

  return result
}

function parseIndexedFiles(
  content: string,
): Set<string> {
  const indexed = new Set<string>()

  const start =
    content.indexOf(
      AI_NAVIGATION_INDEX_START,
    )

  const end =
    content.indexOf(
      AI_NAVIGATION_INDEX_END,
    )

  if (
    start === -1 ||
    end === -1 ||
    end <= start
  ) {
    return indexed
  }

  const section =
    content.slice(
      start,
      end,
    )

  const pattern =
    /\]\(\.\.\/src\/([^)\s]+\.tsx?)\)/g

  for (
    const match of section.matchAll(
      pattern,
    )
  ) {
    const file =
      match[1]

    if (file) {
      indexed.add(file)
    }
  }

  return indexed
}

async function readCodeIndex(): Promise<{
  content: string
  indexedFiles: Set<string>
}> {
  const content =
    await readFile(
      CODE_INDEX_PATH,
      'utf8',
    )

  const start =
    content.indexOf(
      AI_NAVIGATION_INDEX_START,
    )

  const end =
    content.indexOf(
      AI_NAVIGATION_INDEX_END,
    )

  if (
    start === -1 ||
    end === -1 ||
    end <= start
  ) {
    throw new Error(
      'CODE_INDEX.md does not contain a valid AI navigation index marker pair.',
    )
  }

  return {
    content,
    indexedFiles:
      parseIndexedFiles(content),
  }
}

function sortCandidates(
  a: Candidate,
  b: Candidate,
): number {
  return (
    b.score - a.score ||
    b.importedBy -
      a.importedBy ||
    b.imports -
      a.imports ||
    a.file.localeCompare(
      b.file,
    )
  )
}

function selectRecommended(
  candidates: Candidate[],
): Candidate[] {
  const byDomain =
    new Map<
      string,
      Candidate[]
    >()

  for (const candidate of candidates) {
    const list =
      byDomain.get(
        candidate.domain,
      ) ?? []

    list.push(candidate)
    byDomain.set(
      candidate.domain,
      list,
    )
  }

  for (const list of byDomain.values()) {
    list.sort(sortCandidates)
  }

  const selected: Candidate[] = []
  const selectedFiles = new Set<string>()
  const selectedPerDomain = new Map<string, number>()

  /*
   * First pass:
   * give every domain one chance.
   *
   * Domains are sorted by name, so the result is
   * deterministic when there are more domains than slots.
   */
  const domains =
    [...byDomain.keys()].toSorted()

  for (const domain of domains) {
    if (
      selected.length >=
      MAX_INDEX_ENTRIES
    ) {
      break
    }

    const candidate =
      byDomain.get(domain)?.[0]

    if (!candidate) {
      continue
    }

    selected.push(candidate)
    selectedFiles.add(candidate.file)
    selectedPerDomain.set(domain, 1)
  }

  /*
   * Remaining slots:
   * select globally strongest candidates.
   *
   * MAX_CANDIDATES_PER_DOMAIN is enforced here as
   * well as during the first pass.
   */
  const remaining =
    candidates
      .filter(
        candidate =>
          !selectedFiles.has(
            candidate.file,
          ),
      )
      .toSorted(
        sortCandidates,
      )

  for (const candidate of remaining) {
    if (
      selected.length >=
      MAX_INDEX_ENTRIES
    ) {
      break
    }

    const count =
      selectedPerDomain.get(
        candidate.domain,
      ) ?? 0

    if (
      count >=
      MAX_CANDIDATES_PER_DOMAIN
    ) {
      continue
    }

    selected.push(candidate)
    selectedFiles.add(candidate.file)
    selectedPerDomain.set(
      candidate.domain,
      count + 1,
    )
  }

  return selected.sort(
    sortCandidates,
  )
}

function formatCandidate(
  candidate: Candidate,
): string {
  return [
    `  ${candidate.file}`,
    `    score: ${candidate.score} | imports: ${candidate.imports} | importedBy: ${candidate.importedBy}`,
    `    ${candidate.reasons.join(', ') || 'domain module'}`,
  ].join('\n')
}

function formatNavigationDescription(
  candidate: Candidate,
): string {
  const fileName =
    getFileName(candidate.file)

  const symbol =
    fileName.replace(
      /\.tsx?$/,
      '',
    )

  switch (candidate.role) {
    case 'agent':
      return `primary ${candidate.domain} agent; open first for runtime behaviour and agent state.`

    case 'controller':
      return `primary ${candidate.domain} controller; open first for coordination and control flow.`

    case 'domain entry':
      return `${candidate.domain} domain entry; open first for the main ${candidate.domain} data and API surface.`

    case 'factory':
      return `${candidate.domain} factory; open first when tracing creation and setup of domain objects.`

    case 'generator':
      return `primary ${candidate.domain} generator; open first for domain generation logic.`

    case 'lifecycle':
      return `primary ${candidate.domain} lifecycle; open first for entity lifecycle behaviour.`

    case 'manager':
      return `primary ${candidate.domain} manager; open first for domain coordination and state management.`

    case 'resolver':
      return `primary ${candidate.domain} resolver; open first for domain resolution logic.`

    case 'service':
      return `primary ${candidate.domain} service; open first for domain service operations.`

    case 'system':
      return `primary ${candidate.domain} system; open first for core runtime system behaviour.`

    default:
      return `${symbol}; open first for the primary ${candidate.domain} domain logic.`
  }
}

function formatNavigationEntry(
  candidate: Candidate,
): string {
  return `- \`../src/${candidate.file}\` — ${formatNavigationDescription(candidate)}`
}

function formatNavigationSection(
  candidates: Candidate[],
): string {
  const byDomain =
    new Map<
      string,
      Candidate[]
    >()

  for (const candidate of candidates) {
    const list =
      byDomain.get(
        candidate.domain,
      ) ?? []

    list.push(candidate)
    byDomain.set(
      candidate.domain,
      list,
    )
  }

  const sections: string[] = []

  for (
    const domain of [
      ...byDomain.keys(),
    ].toSorted()
  ) {
    const domainCandidates =
      byDomain.get(domain) ?? []

    domainCandidates.sort(
      sortCandidates,
    )

    sections.push(
      [
        `### ${domain}`,
        '',
        ...domainCandidates.map(
          formatNavigationEntry,
        ),
      ].join('\n'),
    )
  }

  return [
    AI_NAVIGATION_INDEX_START,
    '',
    ...sections.flatMap(
      section => [
        section,
        '',
      ],
    ),
    AI_NAVIGATION_INDEX_END,
  ].join('\n')
}

function updateCodeIndex(
  content: string,
  candidates: Candidate[],
): string {
  const start =
    content.indexOf(
      AI_NAVIGATION_INDEX_START,
    )

  const end =
    content.indexOf(
      AI_NAVIGATION_INDEX_END,
    )

  if (
    start === -1 ||
    end === -1 ||
    end <= start
  ) {
    throw new Error(
      'CODE_INDEX.md does not contain a valid AI navigation index marker pair.',
    )
  }

  const before =
    content.slice(
      0,
      start,
    )

  const after =
    content.slice(
      end +
      AI_NAVIGATION_INDEX_END.length,
    )

  const section =
    formatNavigationSection(
      candidates,
    )

  return [
    before.trimEnd(),
    '',
    section,
    after.trimStart(),
  ].join('\n') + '\n'
}

async function main(): Promise<void> {
  console.log(
    'Documentation navigation candidates v9',
  )
  console.log('')

  const dependencies =
    await readDependencyMaps()

  const {
    content: codeIndex,
    indexedFiles,
  } =
    await readCodeIndex()

  const candidates =
    dependencies
      .filter(
        dependency =>
          dependency.file &&
          !shouldIgnore(
            dependency.file,
          ) &&
          !indexedFiles.has(
            dependency.file,
          ),
      )
      .map(calculateScore)
      .filter(
        candidate =>
          candidate.score >=
          MIN_SCORE,
      )

  const recommended =
    selectRecommended(
      candidates,
    )

  const domains =
    new Set(
      candidates.map(
        candidate =>
          candidate.domain,
      ),
    )

  const updatedCodeIndex =
    updateCodeIndex(
      codeIndex,
      recommended,
    )

  await writeFile(
    CODE_INDEX_PATH,
    updatedCodeIndex,
    'utf8',
  )

  console.log(
    `Dependency entries: ${dependencies.length}`,
  )

  console.log(
    `Indexed files:      ${indexedFiles.size}`,
  )

  console.log(
    `Already indexed:    ${indexedFiles.size}`,
  )

  console.log(
    `Candidates:         ${candidates.length}`,
  )

  console.log(
    `Domains analysed:   ${domains.size}`,
  )

  console.log(
    `Recommended entries: ${recommended.length}`,
  )

  console.log('')

  console.log(
    'Recommended CODE_INDEX additions',
  )

  console.log('')

  for (const candidate of recommended) {
    console.log(
      `- ${candidate.domain}: ${candidate.file} (${candidate.score})`,
    )
  }

  console.log('')

  console.log(
    'Selected candidates',
  )

  console.log('')

  for (const candidate of recommended) {
    console.log(
      `${candidate.domain}`,
    )

    console.log(
      formatCandidate(candidate),
    )

    console.log('')

  }

  console.log(
    `Updated: ${CODE_INDEX_PATH}`,
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

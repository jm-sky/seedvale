import {
  readdir,
  readFile,
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

const CODE_INDEX_FILE = resolve(
  DOCS_DIR,
  'CODE_INDEX.md',
)

const MAX_CANDIDATES_PER_DOMAIN = 3
const MAX_INDEX_ENTRIES = 20
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
    if (rule.pattern.test(fileName)) {
      if (rule.score > roleScore) {
        roleScore = rule.score
        role = rule.role
      }
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
  }
}

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

async function readIndexedFiles(): Promise<
  Set<string>
> {
  const content =
    await readFile(
      CODE_INDEX_FILE,
      'utf8',
    )

  const indexed =
    new Set<string>()

  const linkPattern =
    /\]\(\.\.\/src\/([^)]+\.tsx?)\)/g

  for (
    const match of content.matchAll(
      linkPattern,
    )
  ) {
    const file = match[1]

    if (file) {
      indexed.add(
        normalizePath(file),
      )
    }
  }

  return indexed
}

function normalizePath(
  file: string,
): string {
  return file
    .replaceAll('\\', '/')
    .replace(/^src\//, '')
    .replace(/^\/+/, '')
}

function sortCandidates(
  a: Candidate,
  b: Candidate,
): number {
  return (
    b.score - a.score ||
    b.importedBy -
      a.importedBy ||
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
  const domainCounts =
    new Map<string, number>()

  // First pass:
  // give each domain one chance.
  for (
    const domain of [
      ...byDomain.keys(),
    ].toSorted()
  ) {
    const candidate =
      byDomain.get(domain)?.[0]

    if (!candidate) {
      continue
    }

    selected.push(candidate)
    domainCounts.set(
      domain,
      1,
    )
  }

  // Remaining slots:
  // prefer strongest candidates globally,
  // while respecting the per-domain cap.
  const remaining =
    candidates
      .filter(
        candidate =>
          !selected.includes(
            candidate,
          ),
      )
      .toSorted(sortCandidates)

  for (const candidate of remaining) {
    if (
      selected.length >=
      MAX_INDEX_ENTRIES
    ) {
      break
    }

    const count =
      domainCounts.get(
        candidate.domain,
      ) ?? 0

    if (
      count >=
      MAX_CANDIDATES_PER_DOMAIN
    ) {
      continue
    }

    selected.push(candidate)

    domainCounts.set(
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

async function main(): Promise<void> {
  console.log(
    'Documentation navigation candidates v6',
  )
  console.log('')

  const [
    dependencies,
    indexedFiles,
  ] = await Promise.all([
    readDependencyMaps(),
    readIndexedFiles(),
  ])

  const allCandidates =
    dependencies
      .filter(
        dependency =>
          dependency.file &&
          !shouldIgnore(
            dependency.file,
          ),
      )
      .map(calculateScore)
      .filter(
        candidate =>
          candidate.score >=
          MIN_SCORE,
      )

  const alreadyIndexed =
    allCandidates.filter(
      candidate =>
        indexedFiles.has(
          normalizePath(
            candidate.file,
          ),
        ),
    )

  const candidates =
    allCandidates.filter(
      candidate =>
        !indexedFiles.has(
          normalizePath(
            candidate.file,
          ),
        ),
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

  console.log(
    `Dependency entries: ${dependencies.length}`,
  )
  console.log(
    `Indexed files:      ${indexedFiles.size}`,
  )
  console.log(
    `Already indexed:    ${alreadyIndexed.length}`,
  )
  console.log(
    `Candidates:          ${candidates.length}`,
  )
  console.log(
    `Domains analysed:    ${domains.size}`,
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
    'No files were modified.',
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

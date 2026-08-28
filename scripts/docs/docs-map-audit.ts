import {
  readdir,
  readFile,
} from 'node:fs/promises'
import {
  extname,
  resolve,
} from 'node:path'
import {
  CODE_MAP_DIR,
  createProgram,
  DOCS_DIR,
  getExportedSymbols,
  loadSourceFiles,
  SRC_DIR,
  walk,
} from './utils.js'

const APPROX_CHARS_PER_TOKEN = 4

const CODE_INDEX_PATH = resolve(
  DOCS_DIR,
  'CODE_INDEX.md',
)

const SYMBOLS_DIR = resolve(
  CODE_MAP_DIR,
  'symbols',
)

const DEPENDENCIES_DIR = resolve(
  CODE_MAP_DIR,
  'dependencies',
)

type MapStats = {
  name: string
  chars: number
  words: number
  tokens: number
}

type CodeIndexEntry = {
  label: string
  path: string
  absolutePath: string
  description: string
}

type EntryStatus = {
  entry: CodeIndexEntry
  fileExists: boolean
  domain: string | null
}

type DomainStats = {
  domain: string
  sourceFiles: number
  exportedSymbols: number
  codeIndexEntries: number
  symbolMap: boolean
  dependencyMap: boolean
}

async function getMarkdownFiles(
  directory: string,
): Promise<string[]> {
  const entries = await readdir(
    directory,
    { withFileTypes: true },
  )

  const files: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(
        ...await getMarkdownFiles(
          resolve(
            directory,
            entry.name,
          ),
        ),
      )

      continue
    }

    if (
      entry.isFile() &&
      extname(entry.name) === '.md'
    ) {
      files.push(
        resolve(
          directory,
          entry.name,
        ),
      )
    }
  }

  return files.toSorted()
}

async function getMarkdownStats(
  files: string[],
): Promise<{
  files: number
  chars: number
  words: number
  tokens: number
}> {
  let chars = 0
  let words = 0

  for (const file of files) {
    const content =
      await readFile(file, 'utf8')

    chars += content.length

    words += content
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .length
  }

  return {
    files: files.length,
    chars,
    words,
    tokens: Math.ceil(
      chars /
        APPROX_CHARS_PER_TOKEN,
    ),
  }
}

async function getMapStats(
  directory: string,
): Promise<MapStats[]> {
  const files =
    await getMarkdownFiles(
      directory,
    )

  const stats: MapStats[] = []

  for (const file of files) {
    const content =
      await readFile(file, 'utf8')

    const name =
      file
        .slice(
          directory.length + 1,
        )
        .replace(/\.md$/, '')

    const chars =
      content.length

    const words =
      content
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .length

    stats.push({
      name,
      chars,
      words,
      tokens: Math.ceil(
        chars /
          APPROX_CHARS_PER_TOKEN,
      ),
    })
  }

  return stats.toSorted(
    (a, b) =>
      b.tokens - a.tokens,
  )
}

async function pathExists(
  path: string,
): Promise<boolean> {
  try {
    await readFile(
      path,
      'utf8',
    )

    return true
  } catch {
    return false
  }
}

/**
 * Extract Markdown links to source files
 * from CODE_INDEX.
 *
 * Expected:
 *
 *   - [PlayerController](../src/player/PlayerController.ts) — ...
 *
 * The link target is the source of truth.
 * The label is descriptive and does not
 * need to match an exported TypeScript symbol.
 */
function parseCodeIndexEntries(
  content: string,
): CodeIndexEntry[] {
  const entries: CodeIndexEntry[] = []

  const regex =
    /\[([^\]]+)\]\((\.\.\/src\/[^)#\s]+)\)(?:\s*[—-]\s*(.*))?/g

  for (
    const match of content.matchAll(regex)
  ) {
    const label =
      match[1]

    const relativePath =
      match[2]

    const description =
      match[3]?.trim() ?? ''

    const absolutePath =
      resolve(
        DOCS_DIR,
        relativePath,
      )

    entries.push({
      label,
      path: relativePath,
      absolutePath,
      description,
    })
  }

  return entries
}

function getDomainFromSourcePath(
  absolutePath: string,
): string | null {
  const relative =
    absolutePath
      .slice(
        `${SRC_DIR}/`.length,
      )
      .replaceAll('\\', '/')

  const slash =
    relative.indexOf('/')

  if (slash === -1) {
    return null
  }

  return relative.slice(
    0,
    slash,
  )
}

function getDomainMapPath(
  directory: string,
  domain: string,
): string {
  return resolve(
    directory,
    `${domain}.md`,
  )
}

async function createDomainStats(
  sourceFiles: ReturnType<typeof loadSourceFiles>,
  entryStatuses: EntryStatus[],
): Promise<DomainStats[]> {
  const domains = new Map<
    string,
    {
      sourceFiles: number
      exportedSymbols: number
      codeIndexEntries: number
    }
  >()

  for (const sourceFile of sourceFiles) {
    const domain =
      getDomainFromSourcePath(
        sourceFile.absolutePath,
      )

    if (!domain) {
      continue
    }

    const current =
      domains.get(domain) ?? {
        sourceFiles: 0,
        exportedSymbols: 0,
        codeIndexEntries: 0,
      }

    current.sourceFiles++

    current.exportedSymbols +=
      getExportedSymbols(
        sourceFile.sourceFile,
      ).length

    domains.set(
      domain,
      current,
    )
  }

  for (const entry of entryStatuses) {
    if (!entry.domain) {
      continue
    }

    const current =
      domains.get(entry.domain)

    if (current) {
      current.codeIndexEntries++
    }
  }

  const result: DomainStats[] = []

  for (
    const [domain, stats]
      of domains.entries()
  ) {
    result.push({
      domain,
      sourceFiles:
        stats.sourceFiles,
      exportedSymbols:
        stats.exportedSymbols,
      codeIndexEntries:
        stats.codeIndexEntries,
      symbolMap:
        await pathExists(
          getDomainMapPath(
            SYMBOLS_DIR,
            domain,
          ),
        ),
      dependencyMap:
        await pathExists(
          getDomainMapPath(
            DEPENDENCIES_DIR,
            domain,
          ),
        ),
    })
  }

  return result.toSorted(
    (a, b) =>
      b.sourceFiles -
      a.sourceFiles,
  )
}

function formatNumber(
  value: number,
): string {
  return value.toLocaleString(
    'en-US',
  )
}

function printStats(
  label: string,
  stats: {
    files: number
    chars: number
    words: number
    tokens: number
  },
): void {
  console.log(
    `${label}:`,
  )

  console.log(
    `    files:  ${formatNumber(
      stats.files,
    )}`,
  )

  console.log(
    `    chars:  ${formatNumber(
      stats.chars,
    )}`,
  )

  console.log(
    `    words:  ${formatNumber(
      stats.words,
    )}`,
  )

  console.log(
    `    tokens: ~${formatNumber(
      stats.tokens,
    )}`,
  )
}

async function main(): Promise<void> {
  console.log(
    'Documentation map audit v3',
  )

  console.log('')

  /*
   * --------------------------------------------------
   * Source model
   * --------------------------------------------------
   */

  const files =
    await walk(SRC_DIR)

  const program =
    createProgram(files)

  const sourceFiles =
    loadSourceFiles(
      program,
      files,
    )

  let exportedSymbols = 0

  for (const sourceFile of sourceFiles) {
    exportedSymbols +=
      getExportedSymbols(
        sourceFile.sourceFile,
      ).length
  }

  console.log('Source')

  console.log(
    `  TypeScript files: ${sourceFiles.length}`,
  )

  console.log(
    `  Exported symbols: ${exportedSymbols}`,
  )

  console.log('')

  /*
   * --------------------------------------------------
   * CODE_INDEX
   * --------------------------------------------------
   */

  const codeIndex =
    await readFile(
      CODE_INDEX_PATH,
      'utf8',
    )

  const entries =
    parseCodeIndexEntries(
      codeIndex,
    )

  const entryStatuses: EntryStatus[] =
    []

  for (const entry of entries) {
    const fileExists =
      await pathExists(
        entry.absolutePath,
      )

    entryStatuses.push({
      entry,
      fileExists,
      domain:
        fileExists
          ? getDomainFromSourcePath(
              entry.absolutePath,
            )
          : null,
    })
  }

  const missingFiles =
    entryStatuses.filter(
      item => !item.fileExists,
    )

  console.log(
    'CODE_INDEX entry points',
  )

  console.log(
    `  Entries:           ${entries.length}`,
  )

  console.log(
    `  Valid files:       ${
      entries.length -
      missingFiles.length
    }`,
  )

  console.log(
    `  Missing files:     ${missingFiles.length}`,
  )

  if (missingFiles.length > 0) {
    console.log('')

    console.log(
      '  Missing files:',
    )

    for (
      const item
        of missingFiles
    ) {
      console.log(
        `    - ${item.entry.label}: ${item.entry.path}`,
      )
    }
  }

  console.log('')

  /*
   * --------------------------------------------------
   * Domain routing
   * --------------------------------------------------
   */

  const domainStats =
    await createDomainStats(
      sourceFiles,
      entryStatuses,
    )

  console.log(
    'Domain routing',
  )

  console.log(
    '  Domain                 Source   Symbols   CODE_INDEX   Symbol map   Dependency map',
  )

  for (const item of domainStats) {
    console.log(
      `  ${item.domain.padEnd(22)} ${String(
        item.sourceFiles,
      ).padStart(6)}   ${String(
        item.exportedSymbols,
      ).padStart(7)}   ${String(
        item.codeIndexEntries,
      ).padStart(10)}   ${item.symbolMap ? '✓' : '✗'}            ${item.dependencyMap ? '✓' : '✗'}`,
    )
  }

  const unmappedDomains =
    domainStats.filter(
      item =>
        item.codeIndexEntries === 0 &&
        item.sourceFiles >= 5,
    )

  if (
    unmappedDomains.length > 0
  ) {
    console.log('')

    console.log(
      '  Significant domains without CODE_INDEX entry:',
    )

    for (
      const item
        of unmappedDomains
    ) {
      console.log(
        `    - ${item.domain} (${item.sourceFiles} files, ${item.exportedSymbols} exports)`,
      )
    }
  }

  console.log('')

  /*
   * --------------------------------------------------
   * Map size
   * --------------------------------------------------
   */

  const symbolStats =
    await getMapStats(
      SYMBOLS_DIR,
    )

  const dependencyStats =
    await getMapStats(
      DEPENDENCIES_DIR,
    )

  console.log(
    'Largest symbol maps',
  )

  for (
    const stat
      of symbolStats.slice(0, 10)
  ) {
    console.log(
      `  ${stat.name.padEnd(24)} ~${formatNumber(
        stat.tokens,
      )} tokens`,
    )
  }

  console.log('')

  console.log(
    'Largest dependency maps',
  )

  for (
    const stat
      of dependencyStats.slice(0, 10)
  ) {
    console.log(
      `  ${stat.name.padEnd(24)} ~${formatNumber(
        stat.tokens,
      )} tokens`,
    )
  }

  console.log('')

  /*
   * --------------------------------------------------
   * Navigation context
   * --------------------------------------------------
   */

  const symbolFiles =
    await getMarkdownFiles(
      SYMBOLS_DIR,
    )

  const dependencyFiles =
    await getMarkdownFiles(
      DEPENDENCIES_DIR,
    )

  const codeIndexStats =
    await getMarkdownStats([
      CODE_INDEX_PATH,
    ])

  const symbolContext =
    await getMarkdownStats(
      symbolFiles,
    )

  const dependencyContext =
    await getMarkdownStats(
      dependencyFiles,
    )

  const navigationChars =
    codeIndexStats.chars +
    symbolContext.chars +
    dependencyContext.chars

  console.log(
    'Navigation context',
  )

  printStats(
    '  CODE_INDEX.md',
    codeIndexStats,
  )

  printStats(
    '  symbols/',
    symbolContext,
  )

  printStats(
    '  dependencies/',
    dependencyContext,
  )

  console.log('')

  console.log(
    `  Total navigation context: ${formatNumber(
      navigationChars,
    )} chars`,
  )

  console.log(
    `  Approx. tokens:            ${formatNumber(
      Math.ceil(
        navigationChars /
          APPROX_CHARS_PER_TOKEN,
      ),
    )}`,
  )

  console.log('')

  /*
   * --------------------------------------------------
   * All documentation
   * --------------------------------------------------
   */

  const documentationFiles =
    await getMarkdownFiles(
      DOCS_DIR,
    )

  const documentationStats =
    await getMarkdownStats(
      documentationFiles,
    )

  console.log(
    'All documentation',
  )

  printStats(
    '  docs/**/*.md',
    documentationStats,
  )

  console.log('')

  console.log(
    'Audit complete',
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

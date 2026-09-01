import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'
import { ASSETS_DIR, ROOT_DIR } from './config.js'

const REPORT_FILE = resolve(ROOT_DIR, 'docs/assets/LOCAL_ASSETS.md')

const REPORT_START = '<!-- BEGIN GENERATED ASSET REPORT -->'
const REPORT_END = '<!-- END GENERATED ASSET REPORT -->'

const TOP_N = 10

const CATEGORIES = [
  'nature',
  'settlement',
  'items',
  'fauna',
  'fx',
  'people',
  'packs',
  'animations',
] as const

const IGNORED_DIRECTORIES = new Set([
  '_temp/Performance'
])

const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db'])
const INGORED_LARGE_FILES = new Set([
  'Sounds/Sonniss-GameAudioBundle',
])

const IGNORED_EXTENSIONS = new Set([
  // Misc / unknown
  '.3',
  '.bin',
  '.bnf',
  '.cc',
  '.cjs',
  '.cts',
  '.ds_store',
  '.gyp',
  '.gz',
  '.h',
  '.html',

  '.js',
  // glTF support / metadata
  '.json',
  '.jsonl',
  // Build / package artifacts
  '.map',
  // Documentation / metadata
  '.md',
  '.mjs',
  '.mts',

  '.node',
  '.pdf',

  // Source / build files
  '.ts',
  '.tx',

  '.txt',
  '.wasm',
  '.yml',
  '[none]',
])

type FileEntry = {
  path: string;
  size: number;
  extension: string;
}

type DirectoryStats = {
  path: string;
  files: number;
  bytes: number;
}

async function walk(directory: string): Promise<FileEntry[]> {
  if ([...IGNORED_DIRECTORIES].some(i => directory.endsWith(i))) {
    console.log('- directory is ignored:', directory)
    return []
  }

  const entries = await readdir(directory, { withFileTypes: true })
  const files: FileEntry[] = []

  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) {
      continue
    }

    const fullPath = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const fileStat = await stat(fullPath)

    files.push({
      path: relative(ASSETS_DIR, fullPath).replaceAll('\\', '/'),
      size: fileStat.size,
      extension: extname(entry.name).toLowerCase() || '[none]',
    })
  }

  return files
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(1)} KiB`
  }

  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
  }

  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

function code(value: string): string {
  return `\`${value}\``
}

function topDirectories(
  files: FileEntry[],
  depth: number,
): DirectoryStats[] {
  const stats = new Map<string, DirectoryStats>()

  for (const file of files) {
    const parts = file.path.split('/')
    const maxDepth = Math.min(depth, parts.length - 1)

    for (let i = 1; i <= maxDepth; i += 1) {
      const path = parts.slice(0, i).join('/')

      const current = stats.get(path) ?? {
        path,
        files: 0,
        bytes: 0,
      }

      current.files += 1
      current.bytes += file.size

      stats.set(path, current)
    }
  }

  return [...stats.values()]
    .sort((a, b) => b.files - a.files || b.bytes - a.bytes)
    .slice(0, TOP_N)
}

function topFiles(files: FileEntry[]): FileEntry[] {
  return [...files]
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, TOP_N)
}

function extensions(files: FileEntry[]): Array<[string, number]> {
  const counts = new Map<string, number>()

  for (const file of files) {
    if (IGNORED_EXTENSIONS.has(file.extension)) {
      continue
    }

    counts.set(file.extension, (counts.get(file.extension) ?? 0) + 1)
  }

  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
}

function renderDirectories(files: FileEntry[]): string {
  const rows = topDirectories(files, 3).toSorted((a, b) => a.path.localeCompare(b.path))

  if (rows.length === 0) {
    return 'No directories found.'
  }

  return [
    '| #  | Directory                                | Files | Size      |',
    '|---:|------------------------------------------|------:|----------:|',
    ...rows.map(
      (row, index) =>
        `| ${(index + 1).toString().padStart(2)} | ${code(row.path).padEnd(40)} | ${formatNumber(row.files).padStart(5)} | ${formatBytes(row.bytes).padStart(9)} |`,
    ),
  ].join('\n')
}

function renderFiles(files: FileEntry[], sortBy: 'size' | 'path' = 'path'): string {
  const rows = topFiles(files).toSorted((a, b) => sortBy === 'size' ? b.size - a.size : a.path.localeCompare(b.path))

  if (rows.length === 0) {
    return 'No files found.'
  }

  return [
    '| #  | File | Size      |',
    '|---:|------|----------:|',
    ...rows.map(
      (row, index) =>
        `| ${(index + 1).toString().padStart(2)} | ${code(row.path)} | ${formatBytes(row.size).padStart(9)} |`,
    ),
  ].join('\n')
}

function renderExtensions(files: FileEntry[]): string {
  const rows = extensions(files)

  if (rows.length === 0) {
    return 'No files found.'
  }

  return [
    '| Extension  | Files |',
    '|------------|------:|',
    ...rows.map(
      ([extension, count]) =>
        `| ${code(extension).padEnd(10)} | ${formatNumber(count).padStart(5)} |`,
    ),
  ].join('\n')
}

function categoryFiles(
  files: FileEntry[],
  category: string,
): FileEntry[] {
  const prefix = `${category}/`

  return files.filter((file) => file.path.startsWith(prefix))
}

function renderCategories(files: FileEntry[]): string {
  return CATEGORIES
    .filter((category) => categoryFiles(files, category).length > 0)
    .map((category) => {
      const filesInCategory = categoryFiles(files, category)
      const size = filesInCategory.reduce(
        (total, file) => total + file.size,
        0,
      )

      return [
        `#### ${code(`${category}/`)}`,
        '',
        `- Files: **${formatNumber(filesInCategory.length)}**`,
        `- Size: **${formatBytes(size)}**`,
        '',
        'Top 10 largest files:',
        '',
        renderFiles(filesInCategory),
      ].join('\n')
    })
    .join('\n\n')
}

function renderReport(files: FileEntry[]): string {
  const totalSize = files.reduce((total, file) => total + file.size, 0)

  const detectedCategories = CATEGORIES.filter(
    (category) => categoryFiles(files, category).length > 0,
  )

  return [
    REPORT_START,
    '',
    `> Generated: ${new Date().toISOString()}`,
    '> Do not edit this section manually.',
    '',
    '### Summary',
    '',
    `- Total files: **${formatNumber(files.length)}**`,
    `- Total size: **${formatBytes(totalSize)}**`,
    `- Categories: **${detectedCategories.length}**`,
    '',
    '### File types',
    '',
    renderExtensions(files),
    '',
    '### Top 10 directories',
    '',
    renderDirectories(files),
    '',
    '### Top 10 largest files (without sound packs)',
    '',
    renderFiles(files.filter(file => ![...INGORED_LARGE_FILES].some(i => file.path.includes(i))), 'size'),
    '',
    '### Category inventory',
    '',
    renderCategories(files),
    '',
    REPORT_END,
  ].join('\n')
}

async function main(): Promise<void> {
  const assetsStat = await stat(ASSETS_DIR).catch(() => null)

  if (!assetsStat?.isDirectory()) {
    throw new Error(
      `Missing local asset directory: ${ASSETS_DIR}`,
    )
  }

  const files = await walk(ASSETS_DIR)
  const report = renderReport(files)

  const document = await readFile(REPORT_FILE, 'utf8')

  const start = document.indexOf(REPORT_START)
  const end = document.indexOf(REPORT_END)

  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Missing generated-report markers in ${relative(ROOT_DIR, REPORT_FILE)}.`,
    )
  }

  const endOfMarker = end + REPORT_END.length

  const updated = [
    document.slice(0, start),
    report,
    document.slice(endOfMarker),
  ].join('')

  await writeFile(REPORT_FILE, updated, 'utf8')

  const totalSize = files.reduce((total, file) => total + file.size, 0)

  console.log(
    `Updated ${relative(ROOT_DIR, REPORT_FILE)} — ${formatNumber(files.length)} files, ${formatBytes(totalSize)}.`,
  )
}

await main()

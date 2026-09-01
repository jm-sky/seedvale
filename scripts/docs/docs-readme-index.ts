import {
  readdir,
  readFile,
} from 'node:fs/promises'
import { resolve } from 'node:path'
import { DOCS_DIR } from './config.js'
import {
  repoRelative,
  updateGeneratedSection,
} from './utils.js'
import type { Dirent } from 'node:fs'

const INDEXED_READMES = [
  'state/README.md',
  'roadmap/README.md',
  'vision/README.md',
]

const DEFAULT_COLUMNS = ['File']

const START_MARKER_REGEX =
  /<!--\s*AUTO-GENERATED:START(?:\s+columns:\s*(.+?))?\s*-->/

const TABLE_ROW_REGEX =
  /^\s*\|(.+)\|\s*$/

type IndexConfig = {
  columns: string[]
}

type ExistingRow = {
  values: Map<string, string>
}

function parseConfig(
  content: string,
): IndexConfig | null {
  const match = content.match(
    START_MARKER_REGEX,
  )

  if (!match) {
    return null
  }

  const columns = match[1]
    ?.split(',')
    .map(column => column.trim())
    .filter(Boolean)

  return {
    columns:
      columns && columns.length > 0
        ? columns
        : DEFAULT_COLUMNS,
  }
}

function normalizeHeading(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function extractSection(
  content: string,
  heading: string,
): string | null {
  const normalizedHeading =
    normalizeHeading(heading)

  const lines = content.split(/\r?\n/)

  let insideSection = false
  const sectionLines: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(
      /^##\s+(.+?)\s*$/,
    )

    if (headingMatch) {
      if (insideSection) {
        break
      }

      insideSection =
        normalizeHeading(
          headingMatch[1],
        ) === normalizedHeading

      continue
    }

    if (insideSection) {
      sectionLines.push(line)
    }
  }

  if (!insideSection) {
    return null
  }

  const value = sectionLines
    .join('\n')
    .trim()

  return value || null
}

function extractMetadata(
  content: string,
  column: string,
): string | null {
  if (
    normalizeHeading(column) ===
    'description'
  ) {
    return extractSection(
      content,
      'Short Description',
    )
  }

  return extractSection(
    content,
    column,
  )
}

function splitTableRow(
  line: string,
): string[] | null {
  const match =
    line.match(TABLE_ROW_REGEX)

  if (!match) {
    return null
  }

  return match[1]
    .split('|')
    .map(value => value.trim())
}

function isSeparatorRow(
  values: string[],
): boolean {
  return values.every(value =>
    /^:?-{3,}:?$/.test(value),
  )
}

function extractExistingRows(
  content: string,
  columns: string[],
): Map<string, ExistingRow> {
  const result = new Map<
    string,
    ExistingRow
  >()

  const startMatch =
    content.match(START_MARKER_REGEX)

  if (!startMatch) {
    return result
  }

  const start =
    startMatch.index ??
    -1

  if (start === -1) {
    return result
  }

  const contentAfterStart =
    content.slice(
      start + startMatch[0].length,
    )

  const end =
    contentAfterStart.indexOf(
      '<!-- AUTO-GENERATED:END -->',
    )

  if (end === -1) {
    return result
  }

  const tableContent =
    contentAfterStart.slice(0, end)

  const lines =
    tableContent.split(/\r?\n/)

  const headerIndex =
    lines.findIndex(line => {
      const values =
        splitTableRow(line)

      return (
        values !== null &&
        values.length > 0 &&
        normalizeHeading(values[0]) ===
          normalizeHeading(columns[0])
      )
    })

  if (headerIndex === -1) {
    return result
  }

  const headers =
    splitTableRow(
      lines[headerIndex],
    )

  if (!headers) {
    return result
  }

  for (
    let index = headerIndex + 1;
    index < lines.length;
    index++
  ) {
    const values =
      splitTableRow(lines[index])

    if (!values) {
      continue
    }

    if (isSeparatorRow(values)) {
      continue
    }

    if (values.length !== headers.length) {
      continue
    }

    const fileIndex =
      headers.findIndex(
        header =>
          normalizeHeading(header) ===
          'file',
      )

    if (fileIndex === -1) {
      continue
    }

    const file = normalizeFileName(
      values[fileIndex],
    )

    if (!file) {
      continue
    }

    const rowValues =
      new Map<string, string>()

    headers.forEach(
      (header, columnIndex) => {
        rowValues.set(
          normalizeHeading(header),
          values[columnIndex],
        )
      },
    )

    result.set(file, {
      values: rowValues,
    })
  }

  return result
}

function normalizeFileName(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /^\[([^\]]+)\]\([^)]*\)$/,
      '$1',
    )
    .replace(/^`(.+)`$/, '$1')
    .trim()
}

function escapeTableCell(
  value: string,
): string {
  return value
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, '<br>')
}

async function getMarkdownFiles(
  directory: string,
): Promise<string[]> {
  const entries: Dirent[] = await readdir(directory, { withFileTypes: true })

  return entries
    .filter(
      entry =>
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        entry.name !== 'README.md',
    )
    .map(entry =>
      resolve(
        directory,
        entry.name,
      ),
    )
    .toSorted((a, b) =>
      a.localeCompare(b),
    )
}

async function generateIndex(
  readmePath: string,
  config: IndexConfig,
  existingRows: Map<
    string,
    ExistingRow
  >,
): Promise<string> {
  const directory = resolve(
    readmePath,
    '..',
  )

  const files =
    await getMarkdownFiles(directory)

  const documents =
    await Promise.all(
      files.map(async file => ({
        file,
        content:
          await readFile(
            file,
            'utf8',
          ),
      })),
    )

  const header = config.columns
    .map(
      column =>
        ` ${column} `,
    )
    .join('|')

  const separator =
    config.columns
      .map(() => '---')
      .join('|')

  const rows =
    documents.map(document => {
      const fileName =
        document.file
          .split(/[\\/]/)
          .at(-1) ?? ''

      const existing =
        existingRows.get(fileName)

      const values =
        config.columns.map(column => {
          if (
            normalizeHeading(
              column,
            ) === 'file'
          ) {
            return `\`${fileName}\``
          }

          // Existing manual value wins.
          const existingValue =
            existing?.values.get(
              normalizeHeading(
                column,
              ),
            )

          if (
            existingValue !==
              undefined &&
            existingValue !== ''
          ) {
            return existingValue
          }

          // Otherwise use document metadata.
          return (
            extractMetadata(
              document.content,
              column,
            ) ?? '—'
          )
        })

      return `| ${values
        .map(escapeTableCell)
        .join(' | ')} |`
    })

  return [
    `|${header}|`,
    `|${separator}|`,
    ...rows,
  ].join('\n')
}

async function main(): Promise<void> {
  console.log(
    'README index sync',
  )
  console.log('')

  let changed = 0
  let processed = 0

  for (
    const relativePath
      of INDEXED_READMES
  ) {
    const readmePath =
      resolve(
        DOCS_DIR,
        relativePath,
      )

    const content =
      await readFile(
        readmePath,
        'utf8',
      )

    const config =
      parseConfig(content)

    if (!config) {
      console.log(
        `skip ${repoRelative(readmePath)} — marker not found`,
      )
      continue
    }

    processed++

    const existingRows =
      extractExistingRows(
        content,
        config.columns,
      )

    const generated =
      await generateIndex(
        readmePath,
        config,
        existingRows,
      )

    if (
      await updateGeneratedSection(
        readmePath,
        generated,
      )
    ) {
      changed++

      console.log(
        `updated ${repoRelative(readmePath)}`,
      )
    } else {
      console.log(
        `unchanged ${repoRelative(readmePath)}`,
      )
    }
  }

  console.log('')
  console.log(
    `README files processed: ${processed}`,
  )
  console.log(
    `README files changed: ${changed}`,
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

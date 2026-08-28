import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  createProgram,
  FILES_MARKER,
  findReadmes,
  getDirectSourceFiles,
  getExportedSymbols,
  loadSourceFiles,
  repoRelative,
  SRC_DIR,
  updateGeneratedSection,
  walk,
} from './utils.js'

function formatIndex(
  files: ReturnType<typeof getDirectSourceFiles>,
): string {
  const rows = files.map(file => {
    const symbols = getExportedSymbols(
      file.sourceFile,
    )
      .map(symbol => symbol.name)
      .toSorted()

    const exports =
      symbols.length > 0
        ? symbols.map(name => `\`${name}\``).join(', ')
        : '—'

    const fileName =
      file.relativePath.split('/').at(-1) ??
      file.relativePath

    return `| \`${fileName}\` | ${exports} |`
  })

  return [
    '## Files',
    '',
    '| File | Exports |',
    '|---|---|',
    ...rows,
  ].join('\n')
}

async function main(): Promise<void> {
  console.log('README index sync')
  console.log('')

  const files = await walk(SRC_DIR)
  const program = createProgram(files)
  const sourceFiles = loadSourceFiles(
    program,
    files,
  )

  const readmes = await findReadmes(SRC_DIR)

  let candidates = 0
  let changed = 0

  for (const readme of readmes) {
    const content = await readFile(readme, 'utf8')

    if (!content.includes(FILES_MARKER)) {
      continue
    }

    candidates++

    const directFiles = getDirectSourceFiles(
      dirname(readme),
      sourceFiles,
    )

    const generated = formatIndex(directFiles)

    if (
      await updateGeneratedSection(
        readme,
        generated,
      )
    ) {
      changed++
      console.log(
        `updated ${repoRelative(readme)}`,
      )
    }
  }

  console.log('')
  console.log(`README candidates: ${candidates}`)
  console.log(`README files changed: ${changed}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

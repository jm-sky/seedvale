import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  CODE_MAP_DIR,
  createProgram,
  getExportedSymbols,
  loadSourceFiles,
  repoRelative,
  SRC_DIR,
  walk,
} from './utils.js'

function formatSymbols(
  symbols: ReturnType<typeof getExportedSymbols>,
): string {
  const groups = new Map<
    string,
    ReturnType<typeof getExportedSymbols>
  >()

  for (const symbol of symbols) {
    const group = groups.get(symbol.file) ?? []
    group.push(symbol)
    groups.set(symbol.file, group)
  }

  const lines = [
    '# Symbols',
    '',
    'Generated from exported TypeScript symbols.',
    '',
  ]

  for (
    const [file, fileSymbols]
      of [...groups.entries()].toSorted(
        ([a], [b]) => a.localeCompare(b),
      )
  ) {
    lines.push(`## \`${file}\``, '')

    for (
      const symbol
        of fileSymbols.toSorted((a, b) =>
          a.name.localeCompare(b.name),
        )
    ) {
      lines.push(
        `- \`${symbol.name}\` — ${symbol.kind} — line ${symbol.line}`,
      )
    }

    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

async function main(): Promise<void> {
  console.log('Symbol index generation')
  console.log('')

  const files = await walk(SRC_DIR)
  const program = createProgram(files)
  const sourceFiles = loadSourceFiles(
    program,
    files,
  )

  const byDomain = new Map<
    string,
    ReturnType<typeof getExportedSymbols>
  >()

  for (const sourceFile of sourceFiles) {
    const symbols = getExportedSymbols(
      sourceFile.sourceFile,
    )

    if (symbols.length === 0) {
      continue
    }

    const group =
      byDomain.get(sourceFile.domain) ?? []

    group.push(...symbols)

    byDomain.set(
      sourceFile.domain,
      group,
    )
  }

  const symbolsDir = resolve(
    CODE_MAP_DIR,
    'symbols',
  )

  await mkdir(symbolsDir, {
    recursive: true,
  })

  const domains = [...byDomain.keys()].toSorted()

  for (const domain of domains) {
    const path = resolve(
      symbolsDir,
      `${domain}.md`,
    )

    await writeFile(
      path,
      `${formatSymbols(
        byDomain.get(domain) ?? [],
      )}\n`,
      'utf8',
    )

    console.log(
      `generated ${repoRelative(path)}`,
    )
  }

  const index = [
    '# Symbol Index',
    '',
    'Generated symbol maps by source domain.',
    '',
    ...domains.map(
      domain =>
        `- [\`${domain}\`](./${domain}.md)`,
    ),
  ].join('\n')

  const indexPath = resolve(
    symbolsDir,
    'README.md',
  )

  await writeFile(
    indexPath,
    `${index}\n`,
    'utf8',
  )

  console.log(
    `generated ${repoRelative(indexPath)}`,
  )

  console.log('')
  console.log(`Domains: ${domains.length}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

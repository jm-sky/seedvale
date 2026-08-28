import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  CODE_MAP_DIR,
  repoRelative,
} from './utils.js'
import type { Dirent } from 'node:fs'

async function main(): Promise<void> {
  const symbolsDir = resolve(
    CODE_MAP_DIR,
    'symbols',
  )

  await mkdir(CODE_MAP_DIR, { recursive: true })

  const domains: string[] = (await readdir(symbolsDir, { withFileTypes: true }))
    .filter(
      (entry: Dirent) =>
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        entry.name !== 'README.md',
    )
    .map((entry: Dirent) => entry.name.slice(0, -3))
    .toSorted()

  const content = [
    '# Code Map',
    '',
    'Generated navigation map for the Seedvale TypeScript codebase.',
    '',
    '## By domain',
    '',
    ...domains.map(
      domain =>
        `- [\`${domain}\`](./symbols/${domain}.md) · [dependencies](./dependencies/${domain}.md)`,
    ),
    '',
    '## Detailed indexes',
    '',
    '- [All symbols](./symbols/README.md)',
    '- [All dependencies](./dependencies/README.md)',
  ].join('\n')

  const path = resolve(
    CODE_MAP_DIR,
    'README.md',
  )

  await writeFile(
    path,
    `${content}\n`,
    'utf8',
  )

  console.log(
    `generated ${repoRelative(path)}`,
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

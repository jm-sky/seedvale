import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as ts from 'typescript'
import {
  CODE_MAP_DIR,
  createProgram,
  type DependencyInfo,
  loadSourceFiles,
  repoRelative,
  resolveImport,
  SRC_DIR,
  walk,
} from './utils.js'

function getImports(
  sourceFile: ts.SourceFile,
  program: ts.Program,
): string[] {
  const imports = new Set<string>()

  const add = (
    moduleSpecifier: ts.Expression,
  ): void => {
    if (!ts.isStringLiteral(moduleSpecifier)) {
      return
    }

    const resolved = resolveImport(
      moduleSpecifier.text,
      sourceFile.fileName,
      program,
    )

    if (resolved) {
      imports.add(
        resolved
          .replace(`${SRC_DIR}/`, '')
          .replaceAll('\\', '/'),
      )
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier)
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier
    ) {
      add(node.moduleSpecifier)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return [...imports].toSorted()
}

function formatDependencies(
  dependencies: DependencyInfo[],
): string {
  const lines = [
    '# Dependencies',
    '',
    'Generated from TypeScript imports.',
    '',
  ]

  for (const dependency of dependencies) {
    lines.push(
      `## \`${dependency.file}\``,
      '',
    )

    if (dependency.imports.length > 0) {
      lines.push('**Imports**', '')

      for (const imported of dependency.imports) {
        lines.push(`- \`${imported}\``)
      }

      lines.push('')
    }

    if (dependency.importedBy.length > 0) {
      lines.push('**Imported by**', '')

      for (const importer of dependency.importedBy) {
        lines.push(`- \`${importer}\``)
      }

      lines.push('')
    }
  }

  return lines.join('\n').trimEnd()
}

async function main(): Promise<void> {
  console.log('Dependency map generation')
  console.log('')

  const files = await walk(SRC_DIR)
  const program = createProgram(files)
  const sourceFiles = loadSourceFiles(
    program,
    files,
  )

  const importsByFile = new Map<
    string,
    Set<string>
  >()

  for (const sourceFile of sourceFiles) {
    importsByFile.set(
      sourceFile.relativePath,
      new Set(
        getImports(
          sourceFile.sourceFile,
          program,
        ),
      ),
    )
  }

  const importedBy = new Map<
    string,
    Set<string>
  >()

  for (
    const [file, imports]
      of importsByFile
  ) {
    for (const imported of imports) {
      const users =
        importedBy.get(imported) ?? new Set()

      users.add(file)
      importedBy.set(imported, users)
    }
  }

  const byDomain = new Map<
    string,
    DependencyInfo[]
  >()

  for (const sourceFile of sourceFiles) {
    const file = sourceFile.relativePath

    const info: DependencyInfo = {
      file,
      imports: [
        ...(importsByFile.get(file) ?? []),
      ].toSorted(),
      importedBy: [
        ...(importedBy.get(file) ?? []),
      ].toSorted(),
    }

    const group =
      byDomain.get(sourceFile.domain) ?? []

    group.push(info)

    byDomain.set(
      sourceFile.domain,
      group,
    )
  }

  const dependenciesDir = resolve(
    CODE_MAP_DIR,
    'dependencies',
  )

  await mkdir(dependenciesDir, {
    recursive: true,
  })

  const domains = [...byDomain.keys()].toSorted()

  for (const domain of domains) {
    const path = resolve(
      dependenciesDir,
      `${domain}.md`,
    )

    await writeFile(
      path,
      `${formatDependencies(
        byDomain.get(domain) ?? [],
      )}\n`,
      'utf8',
    )

    console.log(
      `generated ${repoRelative(path)}`,
    )
  }

  const index = [
    '# Dependency Map',
    '',
    'Generated dependency maps by source domain.',
    '',
    ...domains.map(
      domain =>
        `- [\`${domain}\`](./${domain}.md)`,
    ),
  ].join('\n')

  const indexPath = resolve(
    dependenciesDir,
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

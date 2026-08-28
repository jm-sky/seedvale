import {
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  dirname,
  extname,
  relative,
  resolve,
  sep,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = resolve(SCRIPT_DIR, '../..')
export const SRC_DIR = resolve(ROOT_DIR, 'src')
export const DOCS_DIR = resolve(ROOT_DIR, 'docs')
export const CODE_MAP_DIR = resolve(DOCS_DIR, 'code-map')

export const GENERATED_START =
  '<!-- AUTO-GENERATED:START -->'
export const GENERATED_END =
  '<!-- AUTO-GENERATED:END -->'

export const FILES_MARKER =
  '<!-- AUTO-GENERATED:FILES -->'

const TS_EXTENSIONS = new Set(['.ts', '.tsx'])

const SKIP_DIRECTORIES = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
])

export type SourceFile = {
  absolutePath: string
  relativePath: string
  domain: string
  sourceFile: ts.SourceFile
}

export type SymbolInfo = {
  name: string
  kind: string
  file: string
  line: number
}

export type DependencyInfo = {
  file: string
  imports: string[]
  importedBy: string[]
}

export const toPosix = (path: string): string =>
  path.split(sep).join('/')

export const srcRelative = (path: string): string =>
  toPosix(relative(SRC_DIR, path))

export const repoRelative = (path: string): string =>
  toPosix(relative(ROOT_DIR, path))

export const getDomain = (path: string): string =>
  path.split('/')[0] ?? 'other'

export const isTsFile = (name: string): boolean =>
  TS_EXTENSIONS.has(extname(name))

export async function walk(
  directory: string,
): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  const files: string[] = []

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      SKIP_DIRECTORIES.has(entry.name)
    ) {
      continue
    }

    const absolutePath = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await walk(absolutePath))
    } else if (
      entry.isFile() &&
      isTsFile(entry.name)
    ) {
      files.push(absolutePath)
    }
  }

  return files.toSorted()
}

export async function findReadmes(
  directory: string,
): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  const files: string[] = []

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      SKIP_DIRECTORIES.has(entry.name)
    ) {
      continue
    }

    const absolutePath = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await findReadmes(absolutePath))
    } else if (
      entry.isFile() &&
      entry.name === 'README.md'
    ) {
      files.push(absolutePath)
    }
  }

  return files.toSorted()
}

export function createProgram(
  files: string[],
): ts.Program {
  const configPath = ts.findConfigFile(
    ROOT_DIR,
    ts.sys.fileExists,
    'tsconfig.json',
  )

  if (!configPath) {
    throw new Error('Cannot find tsconfig.json')
  }

  const config = ts.readConfigFile(
    configPath,
    ts.sys.readFile,
  )

  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(
        config.error.messageText,
        '\n',
      ),
    )
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    ROOT_DIR,
  )

  return ts.createProgram({
    rootNames: files,
    options: parsed.options,
  })
}

export function loadSourceFiles(
  program: ts.Program,
  files: string[],
): SourceFile[] {
  return files.map(absolutePath => {
    const sourceFile =
      program.getSourceFile(absolutePath)

    if (!sourceFile) {
      throw new Error(
        `Cannot load TypeScript source: ${absolutePath}`,
      )
    }

    const relativePath =
      srcRelative(absolutePath)

    return {
      absolutePath,
      relativePath,
      domain: getDomain(relativePath),
      sourceFile,
    }
  })
}

export function isExported(
  node: ts.Node,
): boolean {
  const modifiers = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)
    : undefined

  return (
    modifiers?.some(
      modifier =>
        modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false
  )
}

export function getExportedSymbols(
  sourceFile: ts.SourceFile,
): SymbolInfo[] {
  const symbols: SymbolInfo[] = []

  const add = (
    name: string,
    kind: string,
    node: ts.Node,
  ): void => {
    const position =
      sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      )

    symbols.push({
      name,
      kind,
      file: srcRelative(sourceFile.fileName),
      line: position.line + 1,
    })
  }

  const visit = (node: ts.Node): void => {
    if (isExported(node)) {
      if (
        ts.isClassDeclaration(node) &&
        node.name
      ) {
        add(node.name.text, 'class', node)
      } else if (
        ts.isFunctionDeclaration(node) &&
        node.name
      ) {
        add(node.name.text, 'function', node)
      } else if (
        ts.isInterfaceDeclaration(node)
      ) {
        add(node.name.text, 'interface', node)
      } else if (
        ts.isTypeAliasDeclaration(node)
      ) {
        add(node.name.text, 'type', node)
      } else if (
        ts.isEnumDeclaration(node)
      ) {
        add(node.name.text, 'enum', node)
      } else if (
        ts.isVariableStatement(node)
      ) {
        for (
          const declaration
            of node.declarationList.declarations
        ) {
          if (ts.isIdentifier(declaration.name)) {
            add(
              declaration.name.text,
              'const',
              declaration,
            )
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return symbols
}

export function resolveImport(
  importPath: string,
  containingFile: string,
  program: ts.Program,
): string | null {
  const result = ts.resolveModuleName(
    importPath,
    containingFile,
    program.getCompilerOptions(),
    ts.sys,
  )

  const resolved =
    result.resolvedModule?.resolvedFileName

  if (!resolved) {
    return null
  }

  const normalized = resolve(resolved)

  if (
    !normalized.startsWith(
      `${SRC_DIR}${sep}`,
    )
  ) {
    return null
  }

  if (!TS_EXTENSIONS.has(extname(normalized))) {
    return null
  }

  return normalized
}

export function replaceGeneratedSection(
  content: string,
  generated: string,
): string {
  const start = content.indexOf(GENERATED_START)
  const end = content.indexOf(GENERATED_END)

  if (
    start !== -1 &&
    end !== -1 &&
    end > start
  ) {
    return [
      content.slice(0, start),
      GENERATED_START,
      generated,
      GENERATED_END,
      content.slice(end + GENERATED_END.length),
    ].join('\n')
  }

  return [
    content.trimEnd(),
    '',
    GENERATED_START,
    generated,
    GENERATED_END,
    '',
  ].join('\n')
}

export async function updateGeneratedSection(
  path: string,
  generated: string,
): Promise<boolean> {
  const current = await readFile(path, 'utf8')

  const next = replaceGeneratedSection(
    current,
    generated,
  )

  if (current === next) {
    return false
  }

  await writeFile(path, next, 'utf8')
  return true
}

export function getDirectSourceFiles(
  directory: string,
  sourceFiles: SourceFile[],
): SourceFile[] {
  return sourceFiles
    .filter(
      file => dirname(file.absolutePath) === directory,
    )
    .toSorted((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    )
}

export async function ensureDir(
  directory: string,
): Promise<void> {
  await mkdir(directory, {
    recursive: true,
  })
}

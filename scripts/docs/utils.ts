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
import * as ts from 'typescript'
import { ROOT_DIR, SRC_DIR } from './config.js'

export const GENERATED_START = /<!--\s*AUTO-GENERATED:START(?:\s+columns:\s*.+?)?\s*-->/
export const GENERATED_END = '<!-- AUTO-GENERATED:END -->'

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

const ARCHITECTURAL_LIST_TAGS = [
  'owns',
  'uses',
  'produces',
  'consumes',
] as const

const ARCHITECTURAL_SCALAR_TAGS = [
  'domain',
  'system',
  'role',
  'simulation',
  'performance',
  'lifecycle',
  'integration',
] as const

type ArchitecturalListTag = typeof ARCHITECTURAL_LIST_TAGS[number]
type ArchitecturalScalarTag = typeof ARCHITECTURAL_SCALAR_TAGS[number]

const ARCHITECTURAL_TAG_NAMES: readonly string[] = [
  ...ARCHITECTURAL_LIST_TAGS,
  ...ARCHITECTURAL_SCALAR_TAGS,
]

const IDENTIFIER_LIST_ITEM = /^[A-Za-z][A-Za-z0-9_.]*$/

export type ArchitecturalMetadata =
  & { [K in ArchitecturalListTag]?: string[] }
  & { [K in ArchitecturalScalarTag]?: string }

export type SymbolInfo = {
  name: string
  kind: string
  file: string
  line: number
  metadata?: ArchitecturalMetadata
}

export type DependencyInfo = {
  file: string
  imports: string[]
  importedBy: string[]
}

export const toPosix = (path: string): string => path.split(sep).join('/')

export const srcRelative = (path: string): string => toPosix(relative(SRC_DIR, path))

export const repoRelative = (path: string): string => toPosix(relative(ROOT_DIR, path))

export const getDomain = (path: string): string => path.split('/')[0] ?? 'other'

export const isTsFile = (name: string): boolean => TS_EXTENSIONS.has(extname(name))

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

function jsDocTagText(tag: ts.JSDocTag): string {
  const comment = typeof tag.comment === 'string'
    ? tag.comment
    : ts.getTextOfJSDocComment(tag.comment)

  return (comment ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Reads architectural JSDoc tags (`@domain`, `@system`, `@role`, `@owns`,
 * `@uses`, `@produces`, `@consumes`, `@simulation`, `@performance`,
 * `@lifecycle`, `@integration`) attached to a declaration.
 *
 * A file-header doc block stacked directly above the first declaration in a
 * file (no code between them) is parsed by TypeScript as additional leading
 * `jsDoc` entries on that declaration, so it is picked up the same way as a
 * block written immediately above the declaration itself. Tags are read
 * as-is — no semantics are inferred beyond the list/scalar split below.
 */
export function getArchitecturalMetadata(
  node: ts.Node,
): ArchitecturalMetadata | undefined {
  const jsDocBlocks = (node as { jsDoc?: ts.JSDoc[] }).jsDoc

  if (!jsDocBlocks?.length) {
    return undefined
  }

  const metadata: ArchitecturalMetadata = {}

  for (const block of jsDocBlocks) {
    for (const tag of block.tags ?? []) {
      const name = tag.tagName.text

      if (!ARCHITECTURAL_TAG_NAMES.includes(name)) {
        continue
      }

      const text = jsDocTagText(tag)

      if (!text) {
        continue
      }

      if ((ARCHITECTURAL_LIST_TAGS as readonly string[]).includes(name)) {
        const key = name as ArchitecturalListTag
        const tokens = text.split(/\s+/)
        const isIdentifierList = tokens.every(token =>
          IDENTIFIER_LIST_ITEM.test(token),
        )

        metadata[key] = [
          ...(metadata[key] ?? []),
          ...(isIdentifierList ? tokens : [text]),
        ]
      } else {
        metadata[name as ArchitecturalScalarTag] = text
      }
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

export function getExportedSymbols(
  sourceFile: ts.SourceFile,
): SymbolInfo[] {
  const symbols: SymbolInfo[] = []

  const add = (
    name: string,
    kind: string,
    node: ts.Node,
    metadataNode: ts.Node,
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
      metadata: getArchitecturalMetadata(metadataNode),
    })
  }

  const visit = (node: ts.Node): void => {
    if (isExported(node)) {
      if (
        ts.isClassDeclaration(node) &&
        node.name
      ) {
        add(node.name.text, 'class', node, node)
      } else if (
        ts.isFunctionDeclaration(node) &&
        node.name
      ) {
        add(node.name.text, 'function', node, node)
      } else if (
        ts.isInterfaceDeclaration(node)
      ) {
        add(node.name.text, 'interface', node, node)
      } else if (
        ts.isTypeAliasDeclaration(node)
      ) {
        add(node.name.text, 'type', node, node)
      } else if (
        ts.isEnumDeclaration(node)
      ) {
        add(node.name.text, 'enum', node, node)
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
              node,
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

export type InternalSymbolInfo = {
  /** Enclosing class name, when the symbol is a method. */
  owner?: string
  /** Node text (signature + body, no leading JSDoc) — used by callers to
   *  detect call-site connections to other candidate symbols without a
   *  second parse pass. */
  bodyText: string
} & SymbolInfo

/**
 * Non-exported symbols eligible for preflight discovery: every class method,
 * plus top-level functions that carry at least one architectural JSDoc tag
 * (`@domain`/`@role`/`@uses`/etc, via `getArchitecturalMetadata` — the same
 * bar `getExportedSymbols` callers already apply via
 * `ARCHITECTURAL_METADATA_ORDER` filtering).
 *
 * Top-level functions still require a tag: most large functions in this
 * codebase carry heavy prose comments on inner declarations, and a "has any
 * comment" bar would dump most of a large file's internals. A tag is an
 * explicit, opt-in signal that a specific internal function is worth
 * surfacing.
 *
 * Class methods are not tag-gated (v8): an untagged method with no other
 * discovery route (e.g. `Inventory.instancesToJSON()`) is still the correct
 * implementation anchor when a plan/implementation-notes explicitly names it
 * — requiring a tag would hide exactly the seam a plan is most likely to
 * touch. Noise control for the untagged majority of methods is the caller's
 * job: `pre-implementation.ts`'s selection tiers only surface an untagged
 * method when it is explicitly referenced or reachable from one that is,
 * never as a blanket "every method of this class" dump. `metadata` is
 * `undefined` for an untagged method, same as an untagged top-level symbol
 * elsewhere in this file.
 */
export function getInternalSymbols(
  sourceFile: ts.SourceFile,
): InternalSymbolInfo[] {
  const symbols: InternalSymbolInfo[] = []

  const add = (
    name: string,
    kind: string,
    node: ts.Node,
    owner: string | undefined,
    metadata: ArchitecturalMetadata | undefined,
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
      metadata,
      owner,
      bodyText: node.getText(sourceFile),
    })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name) {
      const owner = node.name.text

      for (const member of node.members) {
        if (
          !ts.isMethodDeclaration(member) ||
          !member.name ||
          !ts.isIdentifier(member.name)
        ) {
          continue
        }

        add(member.name.text, 'method', member, owner, getArchitecturalMetadata(member))
      }
    } else if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      !isExported(node)
    ) {
      const metadata = getArchitecturalMetadata(node)

      if (metadata) {
        add(node.name.text, 'function', node, undefined, metadata)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return symbols
}

/**
 * Parses a single file's content without building a full `ts.Program`
 * (no module resolution or type-checking). Cheap enough to call per-file
 * for a handful of candidate files, e.g. from the preflight tool — reuses
 * the same AST/JSDoc handling as the full symbol-index pipeline.
 */
export function parseStandaloneSourceFile(
  absolutePath: string,
  content: string,
): ts.SourceFile {
  return ts.createSourceFile(
    absolutePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  )
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

/**
 * Parses a generated `docs/code-map/dependencies/<domain>.md` file (the
 * format written by `docs-dependency-map.ts`) back into structured import
 * relationships. Shared by the navigation-candidate scoring and the
 * preflight tool so there is a single reader for that format.
 */
export function parseDependencyMap(
  content: string,
): DependencyInfo[] {
  const lines = content.split(/\r?\n/)
  const result: DependencyInfo[] = []

  let current: DependencyInfo | null = null
  let section: 'imports' | 'importedBy' | null = null

  const flush = (): void => {
    if (current) {
      result.push(current)
    }

    current = null
    section = null
  }

  for (const line of lines) {
    const heading = line.match(/^##\s+`([^`]+\.tsx?)`$/)

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

    if (line.trim() === '**Imports**') {
      section = 'imports'
      continue
    }

    if (line.trim() === '**Imported by**') {
      section = 'importedBy'
      continue
    }

    if (line.startsWith('- `') && line.endsWith('`')) {
      const file = line.trim().slice(3, -1)

      if (section === 'imports') {
        current.imports.push(file)
      } else if (section === 'importedBy') {
        current.importedBy.push(file)
      }
    }
  }

  flush()

  return result
}

export const ARCHITECTURAL_METADATA_ORDER: readonly (
  ArchitecturalScalarTag | ArchitecturalListTag
)[] = [
  'domain',
  'system',
  'role',
  'owns',
  'uses',
  'produces',
  'consumes',
  'simulation',
  'performance',
  'lifecycle',
  'integration',
]

/** Renders architectural metadata as indented `- key: value` lines, in a fixed field order, skipping absent fields. */
export function formatArchitecturalMetadata(
  metadata: ArchitecturalMetadata,
  indent = '  ',
): string[] {
  const lines: string[] = []

  for (const key of ARCHITECTURAL_METADATA_ORDER) {
    const value = metadata[key]

    if (value === undefined) {
      continue
    }

    lines.push(
      `${indent}- ${key}: ${Array.isArray(value) ? value.join(', ') : value}`,
    )
  }

  return lines
}

export function replaceGeneratedSection(
  content: string,
  generated: string,
): string {
  const startMatch = content.match(GENERATED_START)

  const start = startMatch?.index ?? -1

  const end = content.indexOf(GENERATED_END)

  if (
    start === -1 ||
    end === -1 ||
    end <= start
  ) {
    return content
  }

  return [
    content.slice(
      0,
      start + (startMatch?.[0].length ?? 0),
    ),
    '\n',
    generated,
    '\n',
    content.slice(end),
  ].join('')
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

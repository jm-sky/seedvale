#!/usr/bin/env tsx

/**
 * Seedvale implementation preflight v7.
 *
 * Purpose:
 *   Compile a small, targeted briefing for Claude Code before implementation.
 *
 * Usage:
 *   pnpm claude:preflight npc-002
 *   pnpm claude:preflight docs/plans/npc-002-npc-healing.md
 *
 *   For clean redirected output (no pnpm/corepack lifecycle banner in the
 *   file), pass --silent to pnpm itself:
 *     pnpm --silent claude:preflight npc-002 > docs/tmp/npc-002-preflight.md
 *
 * Important:
 *   This script is intentionally context-oriented. It should produce
 *   navigation information, not a copy of the repository.
 *
 *   Symbol/architecture data is derived directly from source via the same
 *   AST helpers `docs-symbol-index.ts` uses (`scripts/docs/utils.ts`), not
 *   from a separately generated index — those helpers are cheap enough to
 *   call per-file for the small set of files a plan actually names.
 *
 *   v7 extends symbol discovery beyond exported top-level declarations:
 *   `getInternalSymbols` (reusing the same `getArchitecturalMetadata` tag
 *   parsing) surfaces documented internal methods of an already-relevant
 *   exported class/function — e.g. `NpcAgent.takeDamage()` — so a plan's
 *   real implementation seam isn't hidden behind one large exported class.
 *   See `findRelevantSymbols` for the four-tier selection this enables.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  ARCHITECTURAL_METADATA_ORDER,
  type ArchitecturalMetadata,
  type DependencyInfo,
  formatArchitecturalMetadata,
  getExportedSymbols,
  getInternalSymbols,
  type InternalSymbolInfo,
  parseDependencyMap,
  parseStandaloneSourceFile,
  type SymbolInfo,
} from '../docs/utils.js'

const ROOT = process.cwd()

const LIMITS = {
  maxSymbols: 12,
  maxFiles: 12,
  maxSnippets: 8,
  snippetLines: 8,
  maxOutputChars: 18_000,
  maxFallbackTerms: 4,
  maxFallbackMatchesPerTerm: 3,
  maxDependencyFiles: 6,
  maxDependencyEdges: 6,
} as const

type FileReference = {
  file: string
}

type Snippet = {
  symbol: string
  file: string
  line: number
  lines: string[]
}

type DependencyEdges = {
  label: string
  file: string
  imports: string[]
  importedBy: string[]
}

function absolute(file: string): string {
  return path.join(ROOT, file)
}

function exists(file: string): boolean {
  return fs.existsSync(absolute(file))
}

function readFile(file: string): string {
  return fs.readFileSync(absolute(file), 'utf8')
}

function normalizePath(file: string): string {
  return file
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function findPlan(input: string): string {
  const normalized = normalizePath(input)

  if (exists(normalized)) {
    return normalized
  }

  const plansDir = absolute('docs/plans')

  if (!fs.existsSync(plansDir)) {
    throw new Error(`Plans directory not found: ${plansDir}`)
  }

  const candidates = fs
    .readdirSync(plansDir)
    .filter((name) => name.endsWith('.md'))

  const match = candidates.find(
    (name) =>
      name === normalized ||
      name.startsWith(`${normalized}-`) ||
      name.replace(/\.md$/, '') === normalized,
  )

  if (!match) {
    throw new Error(`Plan not found: ${input}`)
  }

  return `docs/plans/${match}`
}

function findImplementationNotes(
  plan: string,
): string | undefined {
  const notesDir = absolute(
    'docs/plans/implementation-notes',
  )

  if (!fs.existsSync(notesDir)) {
    return undefined
  }

  const planBase = path.basename(plan, '.md')

  const exact =
    `docs/plans/implementation-notes/${planBase}-implementation-notes.md`

  if (exists(exact)) {
    return exact
  }

  const id = planBase.match(
    /^([a-z]+-\d+)/,
  )?.[1]

  if (!id) {
    return undefined
  }

  const match = fs
    .readdirSync(notesDir)
    .find(
      (name) =>
        name.startsWith(`${id}-`) &&
        name.endsWith('-implementation-notes.md'),
    )

  return match
    ? `docs/plans/implementation-notes/${match}`
    : undefined
}

function collectExplicitFiles(
  text: string,
): FileReference[] {
  const result: FileReference[] = []

  for (const match of text.matchAll(
    /(?:`)?((?:src|scripts|docs)\/[\w./-]+\.(?:ts|tsx|js|vue|md))(?:`)?/g,
  )) {
    result.push({
      file: normalizePath(match[1]),
    })
  }

  return unique(
    result.map((item) => item.file),
  ).map((file) => ({ file }))
}

/**
 * A qualified call reference, e.g. `` `NpcAgent.takeDamage()` `` — the
 * plan/notes prose form for naming a specific internal method, as opposed
 * to a bare exported identifier. Extracted separately from the identifier
 * check below since the trailing `()` (and leading `Owner.`) fails that
 * regex outright.
 *
 * Requires the dotted owner qualifier on purpose: an unqualified call like
 * `` `healHealth()` `` is far more common in this repo's prose as an
 * incidental mention of an already-exported function, and would otherwise
 * compete with genuinely internal-method references for the small key-symbol
 * budget (`LIMITS.maxSymbols`).
 */
const METHOD_REFERENCE = /^(?:[A-Za-z_$][\w$]*\.)+([A-Za-z_$][\w$]*)\(\)$/

function collectBacktickTerms(
  text: string,
): string[] {
  const terms: string[] = []

  for (const match of text.matchAll(
    /`([^`\n]+)`/g,
  )) {
    const value = match[1].trim()

    const methodReference = value.match(METHOD_REFERENCE)

    if (methodReference) {
      terms.push(methodReference[1])
      continue
    }

    if (
      value.length < 3 ||
      value.length > 80 ||
      /\s{2,}/.test(value) ||
      value.includes('/') ||
      value.includes('.') ||
      value.startsWith('http')
    ) {
      continue
    }

    if (
      /^(planned|complete|medium|high|low|small|large|none|unknown)$/i.test(
        value,
      )
    ) {
      continue
    }

    /*
     * Strong identifier-like terms only.
     *
     * Do not turn normal prose into repository searches.
     */
    if (
      /^[A-Z][A-Za-z0-9_$]*$/.test(value) ||
      /^[a-z][A-Za-z0-9_$]*[A-Z][A-Za-z0-9_$]*$/.test(value)
    ) {
      terms.push(value)
    }
  }

  return unique(terms)
}

/**
 * Build both symbol indexes directly from source, for a small, bounded set
 * of files — reusing the exact AST helpers `docs-symbol-index.ts` uses
 * (`parseStandaloneSourceFile` + `getExportedSymbols` + `getInternalSymbols`,
 * which already read `@domain`/`@owns`/etc. JSDoc via
 * `getArchitecturalMetadata`). Each file is parsed once and both indexes are
 * derived from that single AST.
 *
 * Intentionally does not scan `src/` — only the files the plan/notes
 * actually named. Cheap enough to parse per-file for a handful of files.
 */
function buildSymbolIndexes(
  files: string[],
): { exported: SymbolInfo[], internal: InternalSymbolInfo[] } {
  const exported: SymbolInfo[] = []
  const internal: InternalSymbolInfo[] = []

  for (const file of files) {
    if (!file.startsWith('src/')) {
      continue
    }

    if (!exists(file)) {
      continue
    }

    let sourceFile

    try {
      sourceFile = parseStandaloneSourceFile(
        absolute(file),
        readFile(file),
      )
    } catch {
      continue
    }

    // `getExportedSymbols`/`getInternalSymbols` report paths relative to
    // `src/`; the rest of this script works with repo-root-relative paths.
    for (const symbol of getExportedSymbols(sourceFile)) {
      exported.push({ ...symbol, file: `src/${symbol.file}` })
    }

    for (const symbol of getInternalSymbols(sourceFile)) {
      internal.push({ ...symbol, file: `src/${symbol.file}` })
    }
  }

  return { exported, internal }
}

function symbolMetadata(
  symbol: SymbolInfo,
): ArchitecturalMetadata {
  return symbol.metadata ?? {}
}

function formatValue(
  value: string | string[] | undefined,
): string {
  if (!value) return ''

  return Array.isArray(value)
    ? value.join(', ')
    : value
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Symbols explicitly named in the plan/notes.
 *
 * Exact identifier matches have the strongest signal. Runs over the
 * combined exported+internal pool, so a method named directly (e.g.
 * `` `NpcAgent.applyIncomingCombatDamage()` `` in prose — see
 * `METHOD_REFERENCE`) is found the same way an exported type is.
 */
function findExactSymbols(
  index: SymbolInfo[],
  terms: string[],
): SymbolInfo[] {
  const termSet = new Set(terms)

  return index
    .filter((symbol) =>
      termSet.has(symbol.name),
    )
    .sort(
      (a, b) =>
        terms.indexOf(a.name) -
          terms.indexOf(b.name) ||
        normalizePath(a.file).localeCompare(
          normalizePath(b.file),
        ),
    )
}

/**
 * Symbols from explicitly referenced files.
 *
 * Only architecturally documented symbols are promoted.
 * This prevents a large file from expanding into dozens of symbols.
 */
function findDocumentedSymbolsInFiles(
  index: SymbolInfo[],
  files: string[],
): SymbolInfo[] {
  const fileSet = new Set(
    files.map(normalizePath),
  )

  return index
    .filter((symbol) =>
      fileSet.has(normalizePath(symbol.file)),
    )
    .filter((symbol) =>
      ARCHITECTURAL_METADATA_ORDER.some(
        (tag) =>
          formatValue(
            symbolMetadata(symbol)[tag],
          ).length > 0,
      ),
    )
    .sort(
      (a, b) =>
        normalizePath(a.file).localeCompare(
          normalizePath(b.file),
        ) ||
        (a.line ?? 0) -
          (b.line ?? 0) ||
        a.name.localeCompare(b.name),
    )
}

/** A metadata value token "matches" a plan-concept term on either a plain
 *  equal, or a substring in either direction — covers e.g. an `@consumes
 *  NpcPlannedAction` tag against the plan's bare `PlannedAction` term, and a
 *  `@role` sentence that names the concept in passing. */
function valueMatchesTerm(value: string, term: string): boolean {
  return value === term || value.includes(term) || term.includes(value)
}

function metadataMatchesTerms(
  metadata: ArchitecturalMetadata,
  terms: string[],
): boolean {
  if (terms.length === 0) return false

  for (const tag of ARCHITECTURAL_METADATA_ORDER) {
    const value = metadata[tag]

    if (!value) continue

    const tokens = Array.isArray(value) ? value : [value]

    if (
      tokens.some((token) =>
        terms.some((term) => valueMatchesTerm(token, term)),
      )
    ) {
      return true
    }
  }

  return false
}

/**
 * Priority 2: a documented internal symbol (method) whose owning class has
 * already been selected as a relevant symbol, and whose own architectural
 * metadata matches a plan concept — e.g. `NpcAgent.beginNeed()` once
 * `NpcAgent` itself is already a key symbol.
 */
function findConceptMatchedOwnedSymbols(
  internalIndex: InternalSymbolInfo[],
  ownerNames: Set<string>,
  terms: string[],
): InternalSymbolInfo[] {
  return internalIndex
    .filter((symbol) =>
      symbol.owner !== undefined && ownerNames.has(symbol.owner),
    )
    .filter((symbol) =>
      metadataMatchesTerms(symbolMetadata(symbol), terms),
    )
    .sort(
      (a, b) =>
        (a.line ?? 0) - (b.line ?? 0) ||
        a.name.localeCompare(b.name),
    )
}

/**
 * Priority 3: a documented internal symbol directly connected — by an
 * actual call site, in either direction — to a symbol already selected.
 * Cheap text scan over each candidate's own node text (`bodyText`,
 * captured once during the AST walk in `getInternalSymbols`); no second
 * parse and no full call-graph, just "does the source literally call it".
 */
function findConnectedInternalSymbols(
  internalIndex: InternalSymbolInfo[],
  selectedNames: Set<string>,
): InternalSymbolInfo[] {
  const calls = (bodyText: string, name: string): boolean =>
    new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`).test(bodyText)

  return internalIndex
    .filter((symbol) => !selectedNames.has(symbol.name))
    .filter((symbol) =>
      [...selectedNames].some((name) => calls(symbol.bodyText, name)) ||
      internalIndex.some(
        (other) =>
          selectedNames.has(other.name) &&
          calls(other.bodyText, symbol.name),
      ),
    )
    .sort(
      (a, b) =>
        (a.line ?? 0) - (b.line ?? 0) ||
        a.name.localeCompare(b.name),
    )
}

/**
 * Priority 4: broadest net — any not-yet-selected symbol (exported or
 * internal) whose JSDoc architectural metadata matches a plan concept,
 * regardless of file or owner selection.
 */
function findConceptMatchedSymbols(
  index: SymbolInfo[],
  terms: string[],
): SymbolInfo[] {
  return index
    .filter((symbol) =>
      metadataMatchesTerms(symbolMetadata(symbol), terms),
    )
    .sort(
      (a, b) =>
        normalizePath(a.file).localeCompare(
          normalizePath(b.file),
        ) ||
        (a.line ?? 0) - (b.line ?? 0) ||
        a.name.localeCompare(b.name),
    )
}

/**
 * Resolve relevant symbols.
 *
 * Priority:
 *   1. symbol name explicitly mentioned in plan/notes (exported or
 *      internal — `findExactSymbols` over the combined pool);
 *   2. documented symbols in explicit files (existing v6 mechanism,
 *      unchanged — kept in its original position right after exact match);
 *   3. documented internal symbol belonging to an already-selected exported
 *      symbol and matching a plan concept;
 *   4. symbol directly connected to an already-selected key symbol;
 *   5. symbol whose JSDoc architectural metadata matches a plan concept.
 *
 * (Steps 3-5 above are v7's addition and correspond to the plan's priority
 * list items 2-4; step 2 is v6's existing file-scoped mechanism, preserved
 * unchanged per the plan's instruction not to disturb it.)
 */
function findRelevantSymbols(
  exportedIndex: SymbolInfo[],
  internalIndex: InternalSymbolInfo[],
  files: string[],
  terms: string[],
): SymbolInfo[] {
  const result: SymbolInfo[] = []
  const seen = new Set<string>()
  const selectedNames = new Set<string>()

  const add = (
    symbol: SymbolInfo,
  ): void => {
    const key =
      `${normalizePath(symbol.file)}:${symbol.line ?? 0}:${symbol.name}`

    if (seen.has(key)) return

    seen.add(key)
    selectedNames.add(symbol.name)
    result.push(symbol)
  }

  const atLimit = (): boolean =>
    result.length >= LIMITS.maxSymbols

  const combinedIndex: SymbolInfo[] = [
    ...exportedIndex,
    ...internalIndex,
  ]

  for (const symbol of findExactSymbols(
    combinedIndex,
    terms,
  )) {
    add(symbol)
    if (atLimit()) return result
  }

  for (const symbol of findDocumentedSymbolsInFiles(
    exportedIndex,
    files,
  )) {
    add(symbol)
    if (atLimit()) return result
  }

  for (const symbol of findConceptMatchedOwnedSymbols(
    internalIndex,
    selectedNames,
    terms,
  )) {
    add(symbol)
    if (atLimit()) return result
  }

  for (const symbol of findConnectedInternalSymbols(
    internalIndex,
    selectedNames,
  )) {
    add(symbol)
    if (atLimit()) return result
  }

  for (const symbol of findConceptMatchedSymbols(
    combinedIndex,
    terms,
  )) {
    add(symbol)
    if (atLimit()) return result
  }

  return result
}

function readSnippet(
  symbol: SymbolInfo,
): Snippet | undefined {
  if (!symbol.line) {
    return undefined
  }

  if (!exists(symbol.file)) {
    return undefined
  }

  const lines =
    readFile(symbol.file)
      .split(/\r?\n/)

  const start =
    Math.max(0, symbol.line - 1)

  const end =
    Math.min(
      lines.length,
      start + LIMITS.snippetLines,
    )

  return {
    symbol: symbol.name,
    file: symbol.file,
    line: start + 1,
    lines: lines.slice(
      start,
      end,
    ),
  }
}

function sourceSnippets(
  symbols: SymbolInfo[],
): Snippet[] {
  const result: Snippet[] = []

  for (const symbol of symbols) {
    const snippet =
      readSnippet(symbol)

    if (snippet) {
      result.push(snippet)
    }

    if (
      result.length >=
      LIMITS.maxSnippets
    ) {
      break
    }
  }

  return result
}

function formatArchitecture(
  symbols: SymbolInfo[],
): string {
  const blocks: string[] = []

  for (const symbol of symbols) {
    const metadata =
      formatArchitecturalMetadata(
        symbolMetadata(symbol),
        '',
      )

    if (
      metadata.length === 0
    ) {
      continue
    }

    blocks.push(
      [
        `### \`${symbol.name}\` — ${symbol.file}${
          symbol.line
            ? `:${symbol.line}`
            : ''
        }`,
        ...metadata,
      ].join('\n'),
    )
  }

  if (
    blocks.length === 0
  ) {
    return ''
  }

  return [
    '## Relevant architecture',
    '',
    blocks.join('\n\n'),
  ].join('\n')
}

function domainOfSrcFile(
  file: string,
): string {
  return (
    file.replace(/^src\//, '').split('/')[0] ??
    'other'
  )
}

/** Reads `docs/code-map/dependencies/<domain>.md` — generated by
 *  `docs-dependency-map.ts` — and parses it with the shared
 *  `parseDependencyMap` reader (also used by `docs-navigation-candidates.ts`). */
function loadDependencyMap(
  domain: string,
): DependencyInfo[] {
  const file =
    `docs/code-map/dependencies/${domain}.md`

  if (!exists(file)) {
    return []
  }

  try {
    return parseDependencyMap(
      readFile(file),
    )
  } catch {
    return []
  }
}

function truncateList(
  items: string[],
  max: number,
): string {
  if (items.length === 0) {
    return 'none'
  }

  const shown =
    items.slice(0, max)

  const extra =
    items.length - shown.length

  const text =
    shown
      .map((item) => `\`${item}\``)
      .join(', ')

  return extra > 0
    ? `${text}, +${extra} more`
    : text
}

/**
 * Real import graph edges for relevant files, from the generated dependency
 * map — not a substitute for JSDoc metadata, a complement to it.
 */
function findRelevantDependencies(
  symbols: SymbolInfo[],
  files: string[],
): DependencyEdges[] {
  const labelByFile = new Map<string, string>()

  for (const symbol of symbols) {
    const file = normalizePath(symbol.file)

    if (!labelByFile.has(file)) {
      labelByFile.set(file, symbol.name)
    }
  }

  const domainCache = new Map<string, DependencyInfo[]>()
  const result: DependencyEdges[] = []

  for (const file of files) {
    if (!file.startsWith('src/')) {
      continue
    }

    const domain = domainOfSrcFile(file)

    if (!domainCache.has(domain)) {
      domainCache.set(
        domain,
        loadDependencyMap(domain),
      )
    }

    const relPath = file.replace(/^src\//, '')

    const entry = (
      domainCache.get(domain) ?? []
    ).find((dep) => dep.file === relPath)

    if (
      !entry ||
      (entry.imports.length === 0 &&
        entry.importedBy.length === 0)
    ) {
      continue
    }

    result.push({
      label: labelByFile.get(file) ?? relPath,
      file,
      imports: entry.imports,
      importedBy: entry.importedBy,
    })

    if (
      result.length >=
      LIMITS.maxDependencyFiles
    ) {
      break
    }
  }

  return result
}

function formatDependencies(
  edges: DependencyEdges[],
): string {
  if (edges.length === 0) {
    return ''
  }

  const blocks =
    edges.map(
      (edge) =>
        [
          `### \`${edge.label}\` — ${edge.file}`,
          `- imports: ${truncateList(edge.imports, LIMITS.maxDependencyEdges)}`,
          `- imported by: ${truncateList(edge.importedBy, LIMITS.maxDependencyEdges)}`,
        ].join('\n'),
    )

  return [
    '## Dependencies',
    '',
    blocks.join('\n\n'),
  ].join('\n')
}

function formatSnippets(
  snippets: Snippet[],
): string {
  if (snippets.length === 0) {
    return ''
  }

  const blocks =
    snippets.map(
      (snippet) =>
        [
          `### \`${snippet.symbol}\` — ${snippet.file}:${snippet.line}`,
          '```ts',
          ...snippet.lines,
          '```',
        ].join('\n'),
    )

  return [
    '## Implementation anchors',
    '',
    blocks.join('\n\n'),
  ].join('\n')
}

function fallbackSearch(
  terms: string[],
  knownFiles: Set<string>,
): Array<{
  term: string
  matches: string[]
}> {
  const result: Array<{
    term: string
    matches: string[]
  }> = []

  for (
    const term of terms.slice(
      0,
      LIMITS.maxFallbackTerms,
    )
  ) {
    let output

    try {
      output = git([
        'grep',
        '-n',
        '-I',
        '-E',
        `\\b${term.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        )}\\b`,
        '--',
        'src',
      ])
    } catch {
      continue
    }

    const matches =
      output
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((line) => {
          const file =
            normalizePath(
              line.split(':')[0],
            )

          return !knownFiles.has(file)
        })
        .filter((line) => {
          const content =
            line.replace(
              /^[^:]+:\d+:/,
              '',
            ).trim()

          return (
            !content.startsWith('*') &&
            !content.startsWith('//')
          )
        })
        .slice(
          0,
          LIMITS.maxFallbackMatchesPerTerm,
        )

    if (
      matches.length > 0
    ) {
      result.push({
        term,
        matches,
      })
    }
  }

  return result
}

function formatFallback(
  fallback: Array<{
    term: string
    matches: string[]
  }>,
): string {
  if (
    fallback.length === 0
  ) {
    return ''
  }

  const lines = [
    '## Limited text-search fallback',
    '',
  ]

  for (const item of fallback) {
    lines.push(
      `- \`${item.term}\``,
    )

    for (
      const match of item.matches
    ) {
      lines.push(
        `  - ${match}`,
      )
    }
  }

  return lines.join('\n')
}

function extractIntent(
  planText: string,
): string {
  for (
    const heading of [
      'Cel',
      'Goal',
      'Purpose',
      'Intent',
    ]
  ) {
    const value =
      section(
        planText,
        heading,
      )

    if (value) {
      return value.slice(
        0,
        2_500,
      )
    }
  }

  return ''
}

function extractConstraints(
  notesText: string,
): string {
  if (!notesText) {
    return ''
  }

  for (
    const heading of [
      'Final implementation guidance',
      'Implementation constraints',
      'Zakres implementacyjny',
      'Implementation scope',
    ]
  ) {
    const value =
      section(
        notesText,
        heading,
      )

    if (value) {
      return value.slice(
        0,
        4_000,
      )
    }
  }

  return ''
}

function section(
  text: string,
  heading: string,
): string {
  const escaped =
    heading.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )

  const match =
    text.match(
      new RegExp(
        `^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|$)`,
        'm',
      ),
    )

  return (
    match?.[1]?.trim() ?? ''
  )
}

function trimToLimit(
  text: string,
): string {
  if (
    text.length <=
    LIMITS.maxOutputChars
  ) {
    return text
  }

  const marker =
    '\n\n[Preflight output truncated — lower-priority evidence omitted.]\n'

  return (
    text.slice(
      0,
      LIMITS.maxOutputChars -
        marker.length,
    ) + marker
  )
}

function main(): void {
  const input =
    process.argv[2]

  if (!input) {
    console.error(
      'Usage: pnpm claude:preflight <plan-id-or-filename>',
    )
    process.exit(1)
  }

  const plan =
    findPlan(input)

  const notes =
    findImplementationNotes(
      plan,
    )

  const planText =
    readFile(plan)

  const notesText =
    notes
      ? readFile(notes)
      : ''

  const combined =
    `${planText}\n${notesText}`

  const explicitFiles =
    collectExplicitFiles(
      combined,
    )

  const terms =
    collectBacktickTerms(
      combined,
    )

  const candidateSrcFiles =
    explicitFiles
      .map((item) => item.file)
      .filter((file) => file.startsWith('src/'))
      .slice(0, LIMITS.maxFiles)

  const { exported: symbolIndex, internal: internalSymbolIndex } =
    buildSymbolIndexes(
      candidateSrcFiles,
    )

  const relevantSymbols =
    findRelevantSymbols(
      symbolIndex,
      internalSymbolIndex,
      explicitFiles.map(
        (item) => item.file,
      ),
      terms,
    )

  const relevantFiles =
    unique([
      ...explicitFiles.map(
        (item) => item.file,
      ),
      ...relevantSymbols.map(
        (symbol) =>
          normalizePath(
            symbol.file,
          ),
      ),
    ]).slice(
      0,
      LIMITS.maxFiles,
    )

  const snippets =
    sourceSnippets(
      relevantSymbols,
    )

  const dependencyEdges =
    findRelevantDependencies(
      relevantSymbols,
      relevantFiles,
    )

  const fallback =
    fallbackSearch(
      terms,
      new Set(relevantFiles),
    )

  const intent =
    extractIntent(
      planText,
    )

  const constraints =
    extractConstraints(
      notesText,
    )

  const output: string[] = [
    '# SEEDVALE — IMPLEMENTATION PREFLIGHT',
    '',
    '## Target',
    `Plan: \`${plan}\``,
    `Implementation notes: ${
      notes
        ? `\`${notes}\``
        : 'MISSING'
    }`,
    `HEAD: ${
      git([
        'rev-parse',
        '--short',
        'HEAD',
      ]) || 'unknown'
    } | branch: ${
      git([
        'branch',
        '--show-current',
      ]) || 'unknown'
    }`,
    `Working tree: ${
      git([
        'status',
        '--porcelain',
      ])
        ? 'HAS CHANGES — preserve them'
        : 'clean'
    }`,
  ]

  if (intent) {
    output.push(
      '',
      '## Intent',
      '',
      intent,
    )
  }

  const architecture =
    formatArchitecture(
      relevantSymbols,
    )

  if (architecture) {
    output.push(
      '',
      architecture,
    )
  }

  if (
    relevantFiles.length > 0
  ) {
    output.push(
      '',
      '## Relevant files',
      '',
      ...relevantFiles.map(
        (file) =>
          `- \`${file}\``,
      ),
    )
  }

  const dependenciesText =
    formatDependencies(
      dependencyEdges,
    )

  if (dependenciesText) {
    output.push(
      '',
      dependenciesText,
    )
  }

  if (constraints) {
    output.push(
      '',
      '## Important implementation-note constraints',
      '',
      constraints,
    )
  }

  const snippetText =
    formatSnippets(
      snippets,
    )

  if (snippetText) {
    output.push(
      '',
      snippetText,
    )
  }

  const fallbackText =
    formatFallback(
      fallback,
    )

  if (fallbackText) {
    output.push(
      '',
      fallbackText,
    )
  }

  output.push(
    '',
    '## Rules',
    'Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.',
  )

  process.stdout.write(
    trimToLimit(
      output.join('\n') +
        '\n',
    ),
  )
}

main()

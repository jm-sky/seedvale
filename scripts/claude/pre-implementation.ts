#!/usr/bin/env tsx

/**
 * Seedvale implementation preflight v5.
 *
 * Purpose:
 *   Compile a small, targeted briefing for Claude Code before implementation.
 *
 * Usage:
 *   pnpm claude:preflight npc-002
 *   pnpm claude:preflight docs/plans/npc-002-npc-healing.md
 *
 * Important:
 *   This script is intentionally context-oriented. It should produce
 *   navigation information, not a copy of the repository.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const LIMITS = {
  maxSymbols: 10,
  maxFiles: 12,
  maxSnippets: 8,
  snippetLines: 8,
  maxOutputChars: 18_000,
  maxFallbackTerms: 4,
  maxFallbackMatchesPerTerm: 3,
} as const

const ARCH_TAGS = [
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
] as const

type ArchTag = (typeof ARCH_TAGS)[number]

type ArchitecturalDoc = Partial<
  Record<ArchTag, string | string[]>
>

type SymbolRecord = {
  name: string
  kind?: string
  file: string
  line?: number
  documentation?: ArchitecturalDoc
  docBlock?: string
  [key: string]: unknown
}

type FileReference = {
  file: string
  line?: number
}

type Snippet = {
  symbol: string
  file: string
  line: number
  lines: string[]
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

function collectBacktickTerms(
  text: string,
): string[] {
  const terms: string[] = []

  for (const match of text.matchAll(
    /`([^`\n]+)`/g,
  )) {
    const value = match[1].trim()

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
 * Locate the repository's existing generated symbol index.
 *
 * We intentionally do not assume a particular directory layout.
 * The repository's own docs tooling is the source of truth.
 */
function findExistingSymbolIndex(): string | undefined {
  const candidates = [
    'docs/code-map/symbol-index.json',
    'docs/code-map/symbols.json',
    'docs/code-map/symbols/index.json',
    'docs/code-map/symbols/symbols.json',
    'docs/generated/symbol-index.json',
    'docs/generated/symbols.json',
  ]

  for (const file of candidates) {
    if (exists(file)) {
      return file
    }
  }

  return undefined
}

function normalizeSymbol(
  value: Record<string, unknown>,
): SymbolRecord | undefined {
  const name =
    typeof value.name === 'string'
      ? value.name
      : typeof value.symbol === 'string'
        ? value.symbol
        : undefined

  const file =
    typeof value.file === 'string'
      ? value.file
      : typeof value.path === 'string'
        ? value.path
        : undefined

  if (!name || !file) {
    return undefined
  }

  const line =
    typeof value.line === 'number'
      ? value.line
      : typeof value.startLine === 'number'
        ? value.startLine
        : undefined

  const documentation =
    typeof value.documentation === 'object' &&
    value.documentation !== null
      ? value.documentation as ArchitecturalDoc
      : typeof value.doc === 'object' &&
          value.doc !== null
        ? value.doc as ArchitecturalDoc
        : undefined

  return {
    ...value,
    name,
    file: normalizePath(file),
    line,
    documentation,
  }
}

/**
 * Load the existing symbol index.
 *
 * Supports the common shapes used by generated documentation:
 *
 *   [...]
 *   { symbols: [...] }
 *   { entries: [...] }
 *
 * No repository scan is performed here.
 */
function loadSymbolIndex(): SymbolRecord[] {
  const indexFile =
    findExistingSymbolIndex()

  if (!indexFile) {
    return []
  }

  try {
    const parsed =
      JSON.parse(readFile(indexFile)) as unknown

    const values =
      Array.isArray(parsed)
        ? parsed
        : typeof parsed === 'object' &&
            parsed !== null &&
            Array.isArray(
              (parsed as { symbols?: unknown[] }).symbols,
            )
          ? (parsed as { symbols: unknown[] }).symbols
          : typeof parsed === 'object' &&
              parsed !== null &&
              Array.isArray(
                (parsed as { entries?: unknown[] }).entries,
              )
            ? (parsed as { entries: unknown[] }).entries
            : []

    return values
      .filter(
        (value): value is Record<string, unknown> =>
          typeof value === 'object' &&
          value !== null,
      )
      .map(normalizeSymbol)
      .filter(
        (value): value is SymbolRecord =>
          value !== undefined,
      )
  } catch {
    return []
  }
}

function symbolDocumentation(
  symbol: SymbolRecord,
): ArchitecturalDoc {
  return symbol.documentation ?? {}
}

function formatValue(
  value: string | string[] | undefined,
): string {
  if (!value) return ''

  return Array.isArray(value)
    ? value.join(', ')
    : value
}

/**
 * Symbols explicitly named in the plan/notes.
 *
 * Exact identifier matches have the strongest signal.
 */
function findExactSymbols(
  index: SymbolRecord[],
  terms: string[],
): SymbolRecord[] {
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
  index: SymbolRecord[],
  files: string[],
): SymbolRecord[] {
  const fileSet = new Set(
    files.map(normalizePath),
  )

  return index
    .filter((symbol) =>
      fileSet.has(normalizePath(symbol.file)),
    )
    .filter((symbol) =>
      ARCH_TAGS.some(
        (tag) =>
          formatValue(
            symbolDocumentation(symbol)[tag],
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

/**
 * Resolve relevant symbols.
 *
 * Priority:
 *   1. exact symbol references,
 *   2. documented symbols in explicit files.
 */
function findRelevantSymbols(
  index: SymbolRecord[],
  files: string[],
  terms: string[],
): SymbolRecord[] {
  const result: SymbolRecord[] = []
  const seen = new Set<string>()

  const add = (
    symbol: SymbolRecord,
  ): void => {
    const key =
      `${normalizePath(symbol.file)}:${symbol.line ?? 0}:${symbol.name}`

    if (seen.has(key)) return

    seen.add(key)
    result.push(symbol)
  }

  for (const symbol of findExactSymbols(
    index,
    terms,
  )) {
    add(symbol)

    if (
      result.length >=
      LIMITS.maxSymbols
    ) {
      return result
    }
  }

  for (const symbol of findDocumentedSymbolsInFiles(
    index,
    files,
  )) {
    add(symbol)

    if (
      result.length >=
      LIMITS.maxSymbols
    ) {
      return result
    }
  }

  return result
}

function readSnippet(
  symbol: SymbolRecord,
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
  symbols: SymbolRecord[],
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
  symbols: SymbolRecord[],
): string {
  const blocks: string[] = []

  for (const symbol of symbols) {
    const doc =
      symbolDocumentation(symbol)

    const metadata =
      ARCH_TAGS
        .map((tag) => {
          const value =
            formatValue(doc[tag])

          return value
            ? `- ${tag}: ${value}`
            : ''
        })
        .filter(Boolean)

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
    ...blocks,
  ].join('\n\n')
}

function formatRelationships(
  symbols: SymbolRecord[],
): string {
  const lines: string[] = []

  for (const symbol of symbols) {
    const doc =
      symbolDocumentation(symbol)

    const relationships: string[] = []

    const owns =
      formatValue(doc.owns)

    const uses =
      formatValue(doc.uses)

    const produces =
      formatValue(doc.produces)

    const consumes =
      formatValue(doc.consumes)

    if (owns) {
      relationships.push(
        `owns ${owns}`,
      )
    }

    if (uses) {
      relationships.push(
        `uses ${uses}`,
      )
    }

    if (produces) {
      relationships.push(
        `produces ${produces}`,
      )
    }

    if (consumes) {
      relationships.push(
        `consumes ${consumes}`,
      )
    }

    if (
      relationships.length > 0
    ) {
      lines.push(
        `- \`${symbol.name}\` ${relationships.join('; ')}`,
      )
    }
  }

  if (lines.length === 0) {
    return ''
  }

  return [
    '## Relationships',
    '',
    '### Architectural (JSDoc)',
    ...lines,
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
    ...blocks,
  ].join('\n\n')
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

  const symbolIndex =
    loadSymbolIndex()

  const relevantSymbols =
    findRelevantSymbols(
      symbolIndex,
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

  const relationships =
    formatRelationships(
      relevantSymbols,
    )

  if (relationships) {
    output.push(
      '',
      relationships,
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

  /*
   * Keep navigation explicit, but do not repeat it as a
   * second full list of "recommended reads".
   */
  if (
    relevantFiles.length > 0
  ) {
    output.push(
      '',
      '## Recommended reads',
      '',
      ...relevantFiles
        .slice(0, 8)
        .map(
          (file) =>
            `- \`${file}\``,
        ),
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

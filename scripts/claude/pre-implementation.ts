#!/usr/bin/env tsx

/**
 * Seedvale implementation preflight.
 *
 * Compiles a small, targeted briefing for Claude Code before implementation.
 *
 * Usage:
 *   pnpm claude:preflight npc-002
 *   pnpm claude:preflight docs/plans/npc-002-npc-healing.md
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
  [key: string]: unknown
}

type FileReference = {
  file: string
  line?: number
  reason?: string
}

type Snippet = {
  symbol?: string
  file: string
  line: number
  lines: string[]
}

function readFile(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

function exists(file: string): boolean {
  return fs.existsSync(path.join(ROOT, file))
}

function normalizePath(file: string): string {
  return file
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function section(text: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const match = text.match(
    new RegExp(
      `^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|$)`,
      'm',
    ),
  )

  return match?.[1]?.trim() ?? ''
}

function findPlan(input: string): string {
  const normalized = normalizePath(input)

  if (exists(normalized)) return normalized

  const plansDir = path.join(ROOT, 'docs/plans')

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

function findImplementationNotes(plan: string): string | undefined {
  const planBase = path.basename(plan, '.md')
  const notesDir = path.join(ROOT, 'docs/plans/implementation-notes')

  if (!fs.existsSync(notesDir)) return undefined

  const exact = `docs/plans/implementation-notes/${planBase}-implementation-notes.md`

  if (exists(exact)) return exact

  const id = planBase.match(/^([a-z]+-\d+)/)?.[1]

  if (!id) return undefined

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

function loadSymbolIndex(): SymbolRecord[] {
  const candidates = [
    'docs/code-map/symbols.json',
    'docs/code-map/symbols/index.json',
    'docs/code-map/symbols/symbols.json',
  ]

  for (const file of candidates) {
    if (!exists(file)) continue

    try {
      const parsed = JSON.parse(readFile(file))

      if (Array.isArray(parsed)) return parsed

      if (Array.isArray(parsed.symbols)) {
        return parsed.symbols
      }
    } catch {
      // Continue to the next generated index candidate.
    }
  }

  return []
}

function collectExplicitFiles(text: string): FileReference[] {
  const result: FileReference[] = []

  for (const match of text.matchAll(
    /(?:`)?((?:src|scripts|docs)\/[\w./-]+\.(?:ts|tsx|js|vue|md))(?:`)?/g,
  )) {
    const file = normalizePath(match[1])

    if (
      file.startsWith('src/') ||
      file.startsWith('scripts/') ||
      file.startsWith('docs/')
    ) {
      result.push({ file })
    }
  }

  return unique(
    result.map((item) => item.file),
  ).map((file) => ({ file }))
}

function collectBacktickTerms(text: string): string[] {
  const terms: string[] = []

  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
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

    if (
      /^[A-Z][A-Za-z0-9_$]*$/.test(value) ||
      /^[a-z][A-Za-z0-9_$]*[A-Z][A-Za-z0-9_$]*$/.test(value) ||
      /^[A-Z][A-Za-z0-9_$]*(?:Manager|System|State|Agent|Action)$/.test(
        value,
      )
    ) {
      terms.push(value)
    }
  }

  return unique(terms)
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
 * Resolve symbols from explicit files first.
 *
 * This is intentionally separate from text-search fallback.
 * A referenced file is strong evidence; symbols inside that file
 * should be inspected before fuzzy repository search.
 */
function findSymbolsInFiles(
  index: SymbolRecord[],
  files: string[],
): SymbolRecord[] {
  const fileSet = new Set(files.map(normalizePath))

  return index
    .filter((symbol) => fileSet.has(normalizePath(symbol.file)))
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
 * Resolve symbols by exact identifier.
 */
function findSymbolsByTerms(
  index: SymbolRecord[],
  terms: string[],
): SymbolRecord[] {
  const termSet = new Set(terms)

  return index
    .filter((symbol) => termSet.has(symbol.name))
    .sort(
      (a, b) =>
        terms.indexOf(a.name) - terms.indexOf(b.name),
    )
}

/**
 * Build the small set of symbols actually worth exposing.
 *
 * Priority:
 *   1. symbols from explicit files,
 *   2. exact symbol references,
 *   3. symbols carrying architectural metadata,
 *   4. nothing else.
 *
 * Do not expand into every symbol from a referenced file.
 */
function findRelevantSymbols(
  index: SymbolRecord[],
  files: string[],
  terms: string[],
): SymbolRecord[] {
  const fromFiles = findSymbolsInFiles(index, files)
  const exactTerms = findSymbolsByTerms(index, terms)

  const result: SymbolRecord[] = []
  const seen = new Set<string>()

  const add = (symbol: SymbolRecord) => {
    const key = `${normalizePath(symbol.file)}:${symbol.line ?? 0}:${symbol.name}`

    if (seen.has(key)) return

    seen.add(key)
    result.push(symbol)
  }

  // First: symbols explicitly named by the plan/notes.
  for (const symbol of exactTerms) {
    add(symbol)

    if (result.length >= LIMITS.maxSymbols) {
      return result
    }
  }

  // Second: only architecturally documented symbols from referenced files.
  for (const symbol of fromFiles) {
    const doc = symbolDocumentation(symbol)

    const hasArchitecture = ARCH_TAGS.some(
      (tag) => formatValue(doc[tag]).length > 0,
    )

    if (!hasArchitecture) continue

    add(symbol)

    if (result.length >= LIMITS.maxSymbols) {
      return result
    }
  }

  return result
}

function readSnippet(
  file: string,
  line: number,
  symbol?: string,
): Snippet | undefined {
  if (!exists(file)) return undefined

  const lines = readFile(file).split(/\r?\n/)
  const start = Math.max(0, line - 1)
  const end = Math.min(
    lines.length,
    start + LIMITS.snippetLines,
  )

  return {
    symbol,
    file,
    line: start + 1,
    lines: lines.slice(start, end),
  }
}

function sourceSnippets(
  symbols: SymbolRecord[],
): Snippet[] {
  const result: Snippet[] = []

  for (const symbol of symbols) {
    if (!symbol.line) continue

    const snippet = readSnippet(
      symbol.file,
      symbol.line,
      symbol.name,
    )

    if (snippet) result.push(snippet)

    if (result.length >= LIMITS.maxSnippets) break
  }

  return result
}

function formatArchitecture(
  symbols: SymbolRecord[],
): string {
  if (symbols.length === 0) return ''

  const lines = ['## Relevant architecture', '']

  for (const symbol of symbols) {
    const doc = symbolDocumentation(symbol)

    const metadata = ARCH_TAGS
      .map((tag) => {
        const value = formatValue(doc[tag])

        return value
          ? `- ${tag}: ${value}`
          : ''
      })
      .filter(Boolean)

    if (metadata.length === 0) continue

    lines.push(
      `### \`${symbol.name}\` — ${normalizePath(symbol.file)}${
        symbol.line ? `:${symbol.line}` : ''
      }`,
      ...metadata,
      '',
    )
  }

  return lines.join('\n').trim()
}

function formatRelationships(
  symbols: SymbolRecord[],
): string {
  const lines: string[] = []

  for (const symbol of symbols) {
    const doc = symbolDocumentation(symbol)

    const relationships: string[] = []

    const owns = formatValue(doc.owns)
    const uses = formatValue(doc.uses)
    const produces = formatValue(doc.produces)
    const consumes = formatValue(doc.consumes)

    if (owns) relationships.push(`owns ${owns}`)
    if (uses) relationships.push(`uses ${uses}`)
    if (produces) relationships.push(`produces ${produces}`)
    if (consumes) relationships.push(`consumes ${consumes}`)

    if (relationships.length > 0) {
      lines.push(
        `- \`${symbol.name}\` ${relationships.join('; ')}`,
      )
    }
  }

  return lines.length
    ? [
        '## Relationships',
        '',
        '### Architectural (JSDoc)',
        ...lines,
      ].join('\n')
    : ''
}

function formatSnippets(
  snippets: Snippet[],
): string {
  if (snippets.length === 0) return ''

  const lines = [
    '## Implementation anchors',
    '',
  ]

  for (const snippet of snippets) {
    lines.push(
      `### \`${snippet.symbol ?? 'source'}\` — ${snippet.file}:${snippet.line}`,
      '```ts',
      ...snippet.lines,
      '```',
      '',
    )
  }

  return lines.join('\n').trim()
}

function fallbackSearch(
  terms: string[],
  knownFiles: Set<string>,
): Array<{ term: string; matches: string[] }> {
  const candidates = terms.slice(
    0,
    LIMITS.maxFallbackTerms,
  )

  const result: Array<{
    term: string
    matches: string[]
  }> = []

  for (const term of candidates) {
    let output

    try {
      output = git([
        'grep',
        '-n',
        '-I',
        '-E',
        `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        '--',
        'src',
      ])
    } catch {
      continue
    }

    const matches = output
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => {
        const file = normalizePath(line.split(':')[0])

        return !knownFiles.has(file)
      })
      .filter((line) => {
        // Prefer actual code over comments/docs.
        const content = line
          .replace(/^[^:]+:\d+:/, '')
          .trim()

        return !content.startsWith('*')
      })
      .slice(
        0,
        LIMITS.maxFallbackMatchesPerTerm,
      )

    if (matches.length > 0) {
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
  if (fallback.length === 0) return ''

  const lines = [
    '## Limited text-search fallback',
    '',
  ]

  for (const item of fallback) {
    lines.push(`- \`${item.term}\``)

    for (const match of item.matches) {
      lines.push(`  - ${match}`)
    }
  }

  return lines.join('\n').trim()
}

function extractIntent(
  planText: string,
): string {
  const candidates = [
    'Cel',
    'Goal',
    'Purpose',
    'Intent',
  ]

  for (const heading of candidates) {
    const content = section(planText, heading)

    if (content) {
      return content.slice(0, 2_500)
    }
  }

  return ''
}

function extractConstraints(
  notesText: string,
): string {
  if (!notesText) return ''

  const candidates = [
    'Final implementation guidance',
    'Implementation constraints',
    'Zakres implementacyjny',
    'Implementation scope',
  ]

  for (const heading of candidates) {
    const content = section(
      notesText,
      heading,
    )

    if (content) {
      return content.slice(0, 4_000)
    }
  }

  return ''
}

function trimToLimit(text: string): string {
  if (text.length <= LIMITS.maxOutputChars) {
    return text
  }

  const marker =
    '\n\n[Preflight output truncated — lower-priority evidence omitted.]\n'

  return (
    text.slice(
      0,
      Math.max(
        0,
        LIMITS.maxOutputChars - marker.length,
      ),
    ) + marker
  )
}

function main(): void {
  const input = process.argv[2]

  if (!input) {
    console.error(
      'Usage: pnpm claude:preflight <plan-id-or-filename>',
    )
    process.exit(1)
  }

  const plan = findPlan(input)
  const notes = findImplementationNotes(plan)

  const planText = readFile(plan)
  const notesText = notes
    ? readFile(notes)
    : ''

  const combined = `${planText}\n${notesText}`

  /*
   * Strong signals only.
   *
   * We intentionally do not use every backtick term as a
   * repository search query.
   */
  const explicitFiles =
    collectExplicitFiles(combined)

  const terms =
    collectBacktickTerms(combined)

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

  const relevantFiles = unique([
    ...explicitFiles.map(
      (item) => item.file,
    ),
    ...relevantSymbols.map(
      (symbol) =>
        normalizePath(symbol.file),
    ),
  ]).slice(0, LIMITS.maxFiles)

  /*
   * Important:
   * source snippets come from resolved symbols,
   * not from fallback grep matches.
   */
  const snippets =
    sourceSnippets(relevantSymbols)

  const fallback =
    fallbackSearch(
      terms,
      new Set(relevantFiles),
    )

  const intent =
    extractIntent(planText)

  const constraints =
    extractConstraints(notesText)

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
      git(['rev-parse', '--short', 'HEAD']) ||
      'unknown'
    } | branch: ${
      git(['branch', '--show-current']) ||
      'unknown'
    }`,
    `Working tree: ${
      git(['status', '--porcelain'])
        ? 'HAS CHANGES — preserve them'
        : 'clean'
    }`,
  ]

  if (intent) {
    output.push(
      '',
      '## Intent',
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

  if (relevantFiles.length > 0) {
    output.push(
      '',
      '## Relevant files',
      '',
      ...relevantFiles.map(
        (file) => `- \`${file}\``,
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
    formatSnippets(snippets)

  if (snippetText) {
    output.push(
      '',
      snippetText,
    )
  }

  const fallbackText =
    formatFallback(fallback)

  if (fallbackText) {
    output.push(
      '',
      fallbackText,
    )
  }

  /*
   * Do not duplicate Relevant files as Recommended reads.
   * The files themselves are the navigation targets.
   */
  if (relevantFiles.length > 0) {
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
      output.join('\n') + '\n',
    ),
  )
}

main()

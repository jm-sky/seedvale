#!/usr/bin/env tsx

/**
 * Seedvale implementation preflight.
 *
 * Purpose:
 *   Compile a small, targeted briefing for Claude Code before implementation.
 *
 * Design goals:
 *   - Prefer explicit file/symbol references over fuzzy text search.
 *   - Consume architectural JSDoc metadata when available.
 *   - Never dump large repository documents into the briefing.
 *   - Keep source evidence small and deterministic.
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
  const id = planBase.split('-')[0] === 'implementation'
    ? undefined
    : planBase.match(/^([a-z]+-\d+)/)?.[1]

  const candidates = [
    `docs/plans/implementation-notes/${planBase}-implementation-notes.md`,
    ...(id
      ? fs
          .readdirSync(
            path.join(ROOT, 'docs/plans/implementation-notes'),
          )
          .filter((name) => name.startsWith(`${id}-`))
          .map(
            (name) =>
              `docs/plans/implementation-notes/${name}`,
          )
      : []),
  ]

  return candidates.find(exists)
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
      if (Array.isArray(parsed.symbols)) return parsed.symbols
    } catch {
      // Ignore invalid/generated index and continue.
    }
  }

  return []
}

function collectExplicitFiles(text: string): FileReference[] {
  const result: FileReference[] = []

  const patterns = [
    /\b(?:src|scripts|docs)\/[\w./-]+\.(?:ts|tsx|js|vue|md)\b/g,
    /`((?:src|scripts|docs)\/[^`\s]+)`/g,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const file = normalizePath(match[1] ?? match[0])

      if (
        file.startsWith('src/') ||
        file.startsWith('scripts/') ||
        file.startsWith('docs/')
      ) {
        result.push({ file })
      }
    }
  }

  return result
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

    // Avoid prose words and Markdown metadata.
    if (
      /^(planned|complete|medium|high|low|small|large|none|unknown)$/i.test(
        value,
      )
    ) {
      continue
    }

    // Prefer identifier-like terms.
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

function symbolDocumentation(symbol: SymbolRecord): ArchitecturalDoc {
  return symbol.documentation ?? {}
}

function formatValue(value: string | string[] | undefined): string {
  if (!value) return ''

  return Array.isArray(value)
    ? value.join(', ')
    : value
}

function formatArchitecture(
  symbols: SymbolRecord[],
): string {
  if (symbols.length === 0) return ''

  const lines = ['## Relevant architecture', '']

  for (const symbol of symbols) {
    const doc = symbolDocumentation(symbol)

    lines.push(
      `### \`${symbol.name}\` — ${symbol.file}${
        symbol.line ? `:${symbol.line}` : ''
      }`,
    )

    for (const tag of ARCH_TAGS) {
      const value = formatValue(doc[tag])
      if (value) lines.push(`- ${tag}: ${value}`)
    }

    lines.push('')
  }

  return lines.join('\n').trim()
}

function findRelevantSymbols(
  index: SymbolRecord[],
  files: string[],
  terms: string[],
): SymbolRecord[] {
  const normalizedFiles = new Set(files)

  const scored = index
    .filter((symbol) => symbol.file)
    .map((symbol) => {
      let score = 0

      if (normalizedFiles.has(normalizePath(symbol.file))) score += 100

      if (terms.includes(symbol.name)) score += 80

      const doc = symbolDocumentation(symbol)

      const searchable = [
        symbol.name,
        formatValue(doc.domain),
        formatValue(doc.system),
        formatValue(doc.role),
        formatValue(doc.owns),
        formatValue(doc.uses),
        formatValue(doc.produces),
        formatValue(doc.consumes),
        formatValue(doc.simulation),
        formatValue(doc.performance),
        formatValue(doc.lifecycle),
        formatValue(doc.integration),
      ]
        .join(' ')
        .toLowerCase()

      for (const term of terms) {
        if (searchable.includes(term.toLowerCase())) score += 10
      }

      return { symbol, score }
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.symbol.file.localeCompare(b.symbol.file) ||
        a.symbol.name.localeCompare(b.symbol.name),
    )

  return unique(
    scored
      .slice(0, LIMITS.maxSymbols)
      .map((entry) => entry.symbol),
  )
}

function readSnippet(file: string, line: number): Snippet | undefined {
  if (!exists(file)) return undefined

  const lines = readFile(file).split(/\r?\n/)
  const start = Math.max(0, line - 1)
  const end = Math.min(
    lines.length,
    start + LIMITS.snippetLines,
  )

  return {
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

    const snippet = readSnippet(symbol.file, symbol.line)
    if (snippet) result.push(snippet)

    if (result.length >= LIMITS.maxSnippets) break
  }

  return result
}

function fallbackSearch(
  terms: string[],
  knownFiles: Set<string>,
): Array<{ term: string; matches: string[] }> {
  const candidates = terms.slice(0, LIMITS.maxFallbackTerms)
  const result: Array<{ term: string; matches: string[] }> = []

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
        const file = line.split(':')[0]
        return !knownFiles.has(normalizePath(file))
      })
      .slice(0, LIMITS.maxFallbackMatchesPerTerm)

    if (matches.length > 0) {
      result.push({ term, matches })
    }
  }

  return result
}

function formatSnippets(snippets: Snippet[]): string {
  if (snippets.length === 0) return ''

  const lines = ['## Current implementation anchors', '']

  for (const snippet of snippets) {
    lines.push(`\`${snippet.file}:${snippet.line}\``)
    lines.push('```ts')
    lines.push(...snippet.lines)
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n').trim()
}

function formatFallback(
  fallback: Array<{ term: string; matches: string[] }>,
): string {
  if (fallback.length === 0) return ''

  const lines = ['## Limited text-search fallback', '']

  for (const item of fallback) {
    lines.push(`- \`${item.term}\``)
    for (const match of item.matches) {
      lines.push(`  - ${match}`)
    }
  }

  return lines.join('\n').trim()
}

function trimToLimit(text: string): string {
  if (text.length <= LIMITS.maxOutputChars) return text

  const marker =
    '\n\n[Preflight output truncated — lower-priority evidence omitted.]\n'

  return text.slice(
    0,
    Math.max(0, LIMITS.maxOutputChars - marker.length),
  ) + marker
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
  const notesText = notes ? readFile(notes) : ''

  const combined = `${planText}\n${notesText}`

  const explicitFiles = collectExplicitFiles(combined)
  const terms = collectBacktickTerms(combined)

  const index = loadSymbolIndex()

  const relevantSymbols = findRelevantSymbols(
    index,
    explicitFiles.map((item) => item.file),
    terms,
  )

  const relevantFiles = unique([
    ...explicitFiles.map((item) => item.file),
    ...relevantSymbols.map((symbol) => symbol.file),
  ]).slice(0, LIMITS.maxFiles)

  const snippets = sourceSnippets(relevantSymbols)

  const fallback = fallbackSearch(
    terms,
    new Set(relevantFiles),
  )

  const planSections = planText
    .match(/^##\s+.+$/gm)
    ?.map((line) => line.replace(/^##\s+/, '').trim())
    .slice(0, 20) ?? []

  const intent = section(planText, 'Cel') ||
    section(planText, 'Goal') ||
    section(planText, 'Purpose')

  const lines = [
    '# SEEDVALE — IMPLEMENTATION PREFLIGHT',
    '',
    '## Target',
    `Plan: \`${plan}\``,
    `Implementation notes: ${
      notes ? `\`${notes}\`` : 'MISSING'
    }`,
    `HEAD: ${git(['rev-parse', '--short', 'HEAD']) || 'unknown'} | branch: ${
      git(['branch', '--show-current']) || 'unknown'
    }`,
    `Working tree: ${
      git(['status', '--porcelain'])
        ? 'HAS CHANGES — preserve them'
        : 'clean'
    }`,
    '',
    `Plan sections: ${planSections.join(' · ') || 'none'}`,
  ]

  if (intent) {
    lines.push('', '## Intent', intent)
  }

  const architecture = formatArchitecture(relevantSymbols)
  if (architecture) lines.push('', architecture)

  if (relevantFiles.length > 0) {
    lines.push(
      '',
      '## Relevant files',
      ...relevantFiles.map((file) => `- \`${file}\``),
    )
  }

  const architecturalRelationships = relevantSymbols
    .map((symbol) => {
      const doc = symbolDocumentation(symbol)
      const parts: string[] = []

      const owns = formatValue(doc.owns)
      const uses = formatValue(doc.uses)
      const produces = formatValue(doc.produces)

      if (owns) parts.push(`owns ${owns}`)
      if (uses) parts.push(`uses ${uses}`)
      if (produces) parts.push(`produces ${produces}`)

      return parts.length
        ? `- \`${symbol.name}\` ${parts.join('; ')}`
        : ''
    })
    .filter(Boolean)

  if (architecturalRelationships.length > 0) {
    lines.push(
      '',
      '## Relationships',
      '### Architectural (JSDoc)',
      ...architecturalRelationships,
    )
  }

  const constraints =
    section(notesText, 'Final implementation guidance') ||
    section(notesText, 'Implementation constraints') ||
    section(notesText, 'Zakres implementacyjny')

  if (constraints) {
    lines.push(
      '',
      '## Important implementation-note constraints',
      constraints.slice(0, 4_000),
    )
  }

  const snippetText = formatSnippets(snippets)
  if (snippetText) lines.push('', snippetText)

  const fallbackText = formatFallback(fallback)
  if (fallbackText) lines.push('', fallbackText)

  if (notesText) {
    const warningText =
      section(notesText, 'Review verdict') ||
      section(notesText, 'Warnings')

    if (warningText) {
      lines.push(
        '',
        '## Warnings',
        warningText.slice(0, 3_000),
      )
    }
  }

  if (relevantFiles.length > 0) {
    lines.push(
      '',
      '## Recommended reads',
      ...relevantFiles
        .slice(0, 8)
        .map((file) => `- \`${file}\``),
    )
  }

  lines.push(
    '',
    '## Rules',
    'Current source code is authoritative. Use this briefing to navigate to targeted code rather than reading large repository documents wholesale.',
  )

  process.stdout.write(trimToLimit(lines.join('\n') + '\n'))
}

main()

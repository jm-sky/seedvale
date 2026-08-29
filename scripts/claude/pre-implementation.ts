#!/usr/bin/env tsx

/**
 * Seedvale implementation preflight v8.
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
 *   v7 extended symbol discovery beyond exported top-level declarations:
 *   `getInternalSymbols` (reusing the same `getArchitecturalMetadata` tag
 *   parsing) surfaces documented internal methods of an already-relevant
 *   exported class/function — e.g. `NpcAgent.takeDamage()` — so a plan's
 *   real implementation seam isn't hidden behind one large exported class.
 *   See `findRelevantSymbols` for the resulting five-tier selection.
 *
 *   v8 closes two gaps that still stopped discovery too early on plans whose
 *   implementation seam is a *method* rather than a *class* (e.g.
 *   `Inventory.instancesToJSON()`):
 *     - `collectExplicitFiles` now also resolves the domain-relative file
 *       form this repo's implementation notes use interchangeably with the
 *       `src/`-rooted one (`` `items/Inventory.ts` `` as well as
 *       `` `src/items/Inventory.ts` ``), and existence-checks every match —
 *       a file plans/notes actually name can no longer be silently dropped
 *       just because it's referenced without the `src/` prefix, or lose its
 *       candidate-file slot to a stale/typo'd path that no longer resolves.
 *     - `getInternalSymbols` no longer requires an architectural tag on a
 *       *class method* (top-level functions are unchanged) — an untagged
 *       method explicitly named by the plan/notes (`collectCallReferenceTerms`
 *       now finds `Owner.method()`/`method()` call syntax anywhere in the
 *       prose, not only inside backticks) is exactly the implementation
 *       anchor a plan is likely to touch, and `findExactSymbols` already
 *       ranks an explicit reference above everything else. The broader,
 *       lower-signal call-graph tier (`findConnectedInternalSymbols`) stays
 *       restricted to tagged methods only, so this doesn't turn a large
 *       interconnected class into a method dump.
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
  /** Soft cap on how many of `maxSymbols` one file can contribute. A plan
   *  naming several explicit methods on the same class (e.g. `Inventory`'s
   *  serialization boundary) can otherwise exhaust the whole budget before a
   *  second, equally-explicit concept (e.g. `liquidContainer.ts`'s domain
   *  rules) gets a single slot — this keeps the output spread across the
   *  distinct concepts a plan actually names instead of exhausting it on
   *  the first one encountered. */
  maxSymbolsPerFile: 2,
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

/**
 * File-path mentions in plan/notes prose. Accepts both the repo-root-relative
 * form (`` `src/items/Inventory.ts` ``) and the domain-relative form this
 * repo's implementation notes also use interchangeably
 * (`` `items/Inventory.ts` `` — a `src/`-relative path without the `src/`
 * prefix), resolved against `src/` when the literal path isn't already
 * rooted at `src`/`scripts`/`docs`.
 *
 * Every match is existence-checked (not just the resolved-relative ones), so
 * a stale path in prose (e.g. a plan naming a since-moved/renamed file)
 * doesn't silently occupy a candidate-file slot for nothing.
 */
const FILE_REFERENCE = /(?:`)?((?:[\w-]+\/)+[\w.-]+\.(?:ts|tsx|js|vue|md))(?:`)?/g

function resolveExplicitFile(raw: string): string | undefined {
  const normalized = normalizePath(raw)

  const candidate =
    normalized.startsWith('src/') ||
    normalized.startsWith('scripts/') ||
    normalized.startsWith('docs/')
      ? normalized
      : `src/${normalized}`

  return exists(candidate) ? candidate : undefined
}

function collectExplicitFiles(
  text: string,
): FileReference[] {
  const result: string[] = []

  for (const match of text.matchAll(FILE_REFERENCE)) {
    const resolved = resolveExplicitFile(match[1])

    if (resolved) {
      result.push(resolved)
    }
  }

  return unique(result).map((file) => ({ file }))
}

/**
 * Explicit method/function-call references anywhere in plan/notes prose —
 * qualified (`` `Inventory.instancesToJSON()` ``) or bare
 * (`` `cloneItemInstance()` ``) — with or without surrounding backticks.
 *
 * Call syntax is a much stronger signal than a bare identifier (see
 * `collectBacktickTerms` below), so unlike that generic-identifier
 * extraction this does not require backtick quoting: this repo's
 * implementation notes name methods in plain bullet lists just as often as
 * in backtick spans (e.g. `` - Inventory.instancesToJSON() ``). Only the
 * final (method) name is kept — the owner qualifier, if any, is discarded
 * here; owner-scoped selection happens separately in `findRelevantSymbols`.
 */
const CALL_REFERENCE = /\b(?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*)\(\)/g

function collectCallReferenceTerms(
  text: string,
): string[] {
  return unique(
    [...text.matchAll(CALL_REFERENCE)].map(
      (match) => match[1]!,
    ),
  )
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
 * `CALL_REFERENCE`) is found the same way an exported type is. This is also
 * where an explicitly plan/notes-referenced but otherwise undocumented
 * method (e.g. `Inventory.instancesToJSON()`) gets picked up — `internal`
 * now includes every class method (see `getInternalSymbols`), not only
 * tagged ones, so a real name match here doesn't depend on the method
 * carrying architectural metadata.
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
function hasArchitecturalMetadata(symbol: SymbolInfo): boolean {
  return ARCHITECTURAL_METADATA_ORDER.some(
    (tag) => formatValue(symbolMetadata(symbol)[tag]).length > 0,
  )
}

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
    .filter(hasArchitecturalMetadata)
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
 *
 * Restricted to *tagged* internal symbols, same as v7 — `internalIndex` now
 * also carries every untagged class method (see `getInternalSymbols`), and
 * without this filter a large interconnected class (e.g. `NpcAgent`) would
 * pull in most of its own method set through call-site connectivity alone.
 * An untagged method explicitly named by the plan/notes is still found —
 * via `findExactSymbols`, which is not restricted this way.
 */
function findConnectedInternalSymbols(
  internalIndex: InternalSymbolInfo[],
  selectedNames: Set<string>,
): InternalSymbolInfo[] {
  const calls = (bodyText: string, name: string): boolean =>
    new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`).test(bodyText)

  const tagged = internalIndex.filter(hasArchitecturalMetadata)

  return tagged
    .filter((symbol) => !selectedNames.has(symbol.name))
    .filter((symbol) =>
      [...selectedNames].some((name) => calls(symbol.bodyText, name)) ||
      tagged.some(
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
 * Priority (v8 reorders this to match the plan's explicit ranking —
 * "explicitly referenced implementation point > directly related API >
 * lifecycle/integration boundary > generic architectural symbol > broad
 * dependency" — rather than a single flat exact-match pass):
 *   1. call/qualified-method reference explicitly named in plan/notes, e.g.
 *      `` `Inventory.instancesToJSON()` `` (`priorityTerms` —
 *      `collectCallReferenceTerms`). As of v8 this also reaches an untagged
 *      class method, since `internal` now carries every method (see
 *      `getInternalSymbols`) — an explicit call reference is the strongest
 *      signal there is, tag or no tag;
 *   2. documented symbols in explicit files (existing v6 mechanism,
 *      unchanged — kept in its original position right after exact match);
 *   3. documented internal symbol belonging to an already-selected exported
 *      symbol and matching a plan concept (a lifecycle/integration
 *      boundary, e.g. `NpcAgent.beginNeed()` once `NpcAgent` is selected);
 *   4. bare-identifier exact match not already covered above — a real
 *      explicit mention, but of a type/const name rather than a call, so it
 *      ranks below the more specific tiers above (section 9's "generic
 *      architectural symbol");
 *   5. tagged internal symbol directly connected to an already-selected key
 *      symbol (restricted to tagged methods even in v8 — see
 *      `findConnectedInternalSymbols`);
 *   6. symbol whose JSDoc architectural metadata matches a plan concept.
 *
 * Steps 1 and 4 together are what v7 did as a single undifferentiated
 * "exact match" tier; splitting them stops a low-signal bare-identifier hit
 * (e.g. a plain `ActionId` mention) from claiming a budget slot ahead of a
 * higher-signal call reference or lifecycle-boundary method just because
 * both happen to be found by the same underlying name-match mechanism.
 */
function findRelevantSymbols(
  exportedIndex: SymbolInfo[],
  internalIndex: InternalSymbolInfo[],
  files: string[],
  terms: string[],
  priorityTerms: string[],
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

  // Soft per-file cap (`LIMITS.maxSymbolsPerFile`), shared across the two
  // exact-match passes below (steps 1 and 4). Exact-name matches are the
  // mechanism most prone to piling onto a single class's own boundary (e.g.
  // several of `Inventory`'s own methods named individually) at the expense
  // of a second, equally-explicit concept in a different file (e.g.
  // `liquidContainer.ts`'s domain rules). The concept/connectivity tiers
  // (3, 5, 6) are already narrowly scoped by their own tag/relationship
  // requirements and stay uncapped — that's what lets `NpcAgent` legitimately
  // contribute more than this many of its own tagged methods
  // (`update`/`startAction`/`beginNeed`/...) once it's the plan's one
  // clearly central symbol.
  const exactMatchFileCounts = new Map<string, number>()

  const addExactMatch = (symbol: SymbolInfo): boolean => {
    const file = normalizePath(symbol.file)
    const fileCount = exactMatchFileCounts.get(file) ?? 0

    if (fileCount >= LIMITS.maxSymbolsPerFile) return false

    exactMatchFileCounts.set(file, fileCount + 1)
    add(symbol)
    return true
  }

  // 1. Explicit call/qualified-method references.
  for (const symbol of findExactSymbols(
    combinedIndex,
    priorityTerms,
  )) {
    addExactMatch(symbol)
    if (atLimit()) return result
  }

  // 2. Documented symbols in explicit files.
  for (const symbol of findDocumentedSymbolsInFiles(
    exportedIndex,
    files,
  )) {
    add(symbol)
    if (atLimit()) return result
  }

  // 3. Owner-concept-matched internal (lifecycle/integration boundary).
  for (const symbol of findConceptMatchedOwnedSymbols(
    internalIndex,
    selectedNames,
    terms,
  )) {
    add(symbol)
    if (atLimit()) return result
  }

  // 4. Remaining bare-identifier exact matches (generic architectural
  //    symbol) — `seen`/`exactMatchFileCounts` naturally skip anything step
  //    1 already placed or capped.
  for (const symbol of findExactSymbols(
    combinedIndex,
    terms,
  )) {
    addExactMatch(symbol)
    if (atLimit()) return result
  }

  // 5. Call-graph-connected tagged internal symbol.
  for (const symbol of findConnectedInternalSymbols(
    internalIndex,
    selectedNames,
  )) {
    add(symbol)
    if (atLimit()) return result
  }

  // 6. Broadest net: architectural-metadata concept match.
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

/**
 * `LIMITS.maxSnippets` (8) is smaller than `LIMITS.maxSymbols` (12), so not
 * every selected symbol gets a code snippet. A symbol with architectural
 * JSDoc metadata already has a full description in the (unbounded)
 * "Relevant architecture" section — role/uses/produces/consumes — so the
 * scarce snippet budget is better spent on a symbol with none, whose code
 * is its *only* description (e.g. an explicitly-referenced but undocumented
 * method like `Inventory.instancesToJSON()`). Stable partition: relative
 * priority order within each group (already reflecting `findRelevantSymbols`'
 * tiers) is preserved.
 */
function prioritizeForSnippets(
  symbols: SymbolInfo[],
): SymbolInfo[] {
  return [...symbols].sort(
    (a, b) =>
      Number(hasArchitecturalMetadata(a)) -
        Number(hasArchitecturalMetadata(b)),
  )
}

function sourceSnippets(
  symbols: SymbolInfo[],
): Snippet[] {
  const result: Snippet[] = []

  for (const symbol of prioritizeForSnippets(symbols)) {
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

  // Explicit call/qualified-method references (`Owner.method()`/`method()`)
  // are the strongest implementation-anchor signal there is — kept separate
  // from `terms` so `findRelevantSymbols` can give them a selection pass of
  // their own ahead of a plain bare-identifier mention (see its docstring).
  const callReferenceTerms =
    collectCallReferenceTerms(combined)

  const terms =
    unique([
      ...callReferenceTerms,
      ...collectBacktickTerms(combined),
    ])

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
      callReferenceTerms,
    )

  // Symbol-backed files first: they're proven relevant (a selected symbol
  // actually lives there — see the anchors/architecture sections), so an
  // unrelated explicit doc mention (`docs/assets/MODELS.md`) earlier in the
  // plan's prose must not claim a `LIMITS.maxFiles` slot ahead of them.
  const relevantFiles =
    unique([
      ...relevantSymbols.map(
        (symbol) =>
          normalizePath(
            symbol.file,
          ),
      ),
      ...explicitFiles.map(
        (item) => item.file,
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

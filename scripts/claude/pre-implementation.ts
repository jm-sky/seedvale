import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { relative as pathRelative, resolve } from 'node:path'
import {
  CODE_MAP_DIR,
  formatArchitecturalMetadata,
  getDomain,
  getExportedSymbols,
  parseDependencyMap,
  parseStandaloneSourceFile,
  repoRelative,
  ROOT_DIR,
  SRC_DIR,
  type SymbolInfo,
} from '../docs/utils.js'

const PLANS_DIR = resolve(ROOT_DIR, 'docs/plans')
const NOTES_DIR = resolve(PLANS_DIR, 'implementation-notes')
const SYMBOLS_DIR = resolve(CODE_MAP_DIR, 'symbols')
const DEPENDENCIES_DIR = resolve(CODE_MAP_DIR, 'dependencies')

const MAX_OUTPUT_CHARS = 18000
const MAX_RELEVANT_SYMBOLS = 10
const MAX_RELEVANT_FILES = 12
const MAX_SOURCE_SNIPPETS = 8
const SOURCE_SNIPPET_RADIUS = 2
const MAX_GREP_TERMS = 8
const MAX_SEARCH_RESULTS_PER_TERM = 8
const MAX_DOMAINS = 4
const MAX_NOTE_SECTIONS = 4
const MAX_WARNINGS = 6

// ---------------------------------------------------------------------------
// Small file/git helpers (same shape as v1)
// ---------------------------------------------------------------------------

const readText = async (path: string): Promise<string | null> => {
  try { return await readFile(path, 'utf8') } catch { return null }
}

const findPlan = async (input: string): Promise<{ path: string, content: string }> => {
  const files = (await readdir(PLANS_DIR)).filter(file => file.endsWith('.md'))
  const normalized = input.replace(/\\/g, '/').replace(/\.md$/, '')
  const exact = files.find(file => file.replace(/\.md$/, '') === normalized)
  const matches = exact ? [exact] : files.filter(file => file.replace(/\.md$/, '').includes(normalized))
  if (matches.length !== 1) {
    if (matches.length === 0) throw new Error('Plan not found: ' + input)
    throw new Error('Plan input is ambiguous: ' + input + '\n' + matches.join('\n'))
  }
  const path = resolve(PLANS_DIR, matches[0])
  const content = await readText(path)
  if (!content) throw new Error('Cannot read plan: ' + path)
  return { path, content }
}

const findImplementationNotes = async (planPath: string) => {
  const base = pathRelative(PLANS_DIR, planPath).replace(/\.md$/, '')
  const expected = resolve(NOTES_DIR, base + '-implementation-notes.md')
  const expectedContent = await readText(expected)
  if (expectedContent) return { path: expected, content: expectedContent }
  const files = await readdir(NOTES_DIR)
  const matches = files.filter(file => file.endsWith('-implementation-notes.md') && file.includes(base))
  if (matches.length !== 1) return null
  const path = resolve(NOTES_DIR, matches[0])
  const content = await readText(path)
  return content ? { path, content } : null
}

const runGit = (args: string[]): string => {
  try { return execFileSync('git', args, { cwd: ROOT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return '' }
}

const searchGit = (term: string): string[] => {
  const result = runGit(['grep', '-n', '-I', '-F', '--', term, 'src'])
  return result.split('\n').filter(Boolean).slice(0, MAX_SEARCH_RESULTS_PER_TERM)
}

// ---------------------------------------------------------------------------
// Plan / notes text extraction — no hardcoded section names, no "any
// backticked word is a symbol" heuristic.
// ---------------------------------------------------------------------------

const extractPaths = (content: string): string[] => {
  const matches = content.match(/(?:src|docs)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|md)/g) ?? []
  return [...new Set(matches)]
}

/** Backticked tokens shaped like a real identifier — plain lowercase prose words (`planned`, `food`, `dead`) never qualify. */
const extractIdentifierLikeTerms = (content: string): string[] => {
  const values = content.match(/`([^`]{2,60})`/g) ?? []
  return [...new Set(values.map(value => value.slice(1, -1)))].filter(value =>
    /^[A-Za-z][A-Za-z0-9_.]*$/.test(value) && /[A-Z]/.test(value),
  )
}

const tokenizeIdentifiers = (content: string): string[] =>
  [...new Set(content.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [])]

const extractHeadings = (content: string): string[] =>
  content.split('\n').filter(line => /^#{1,3}\s/.test(line)).map(line => line.trim())

const parseMetadata = (content: string): string[] => {
  const keys = ['Created', 'Status', 'Priority', 'Depends on', 'Domain']
  return content.split('\n').filter(line => keys.some(key => line.startsWith('**' + key + ':**'))).slice(0, keys.length)
}

type Section = { heading: string, level: number, bodyLines: string[] }

/** Splits on any `##`/`###` heading — plans and notes do not share a fixed section vocabulary, so nothing here assumes one. */
const splitSections = (content: string): Section[] => {
  const sections: Section[] = []
  let current: Section | null = null

  for (const rawLine of content.split('\n')) {
    const match = rawLine.match(/^(#{2,3})\s+(.*)$/)
    if (match) {
      if (current) sections.push(current)
      current = { heading: match[2].trim(), level: match[1].length, bodyLines: [] }
      continue
    }
    if (current && rawLine.trim()) current.bodyLines.push(rawLine.trim())
  }
  if (current) sections.push(current)
  return sections
}

const WARNING_MARKERS = /\b(do not|don't|never|must not|should not|avoid)\b|nie (twórz|powinien|może|zakładaj|hardcode|zmieniaj)/i

const extractWarningLines = (content: string): string[] =>
  content.split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('-') || line.startsWith('*') || /^[A-ZŁŚŻŹĆŃÓĄĘ]/.test(line))
    .filter(line => WARNING_MARKERS.test(line))

// ---------------------------------------------------------------------------
// Symbol name index — read from the already-generated symbol maps
// (`pnpm docs:symbol-index`) rather than re-walking the whole src tree.
// ---------------------------------------------------------------------------

type SymbolLocation = { file: string, line: number }

const loadSymbolNameIndex = async (): Promise<Map<string, SymbolLocation[]>> => {
  const index = new Map<string, SymbolLocation[]>()
  let entries: string[]
  try {
    entries = (await readdir(SYMBOLS_DIR)).filter(name => name.endsWith('.md') && name !== 'README.md')
  } catch {
    return index
  }

  for (const entry of entries) {
    const content = await readText(resolve(SYMBOLS_DIR, entry))
    if (!content) continue

    let currentFile = ''
    for (const line of content.split('\n')) {
      const heading = line.match(/^##\s+`([^`]+)`$/)
      if (heading) { currentFile = heading[1]; continue }
      if (line.startsWith('  ')) continue // indented JSDoc-metadata sub-bullet

      const symbolLine = line.match(/^- `([^`]+)` — \S+ — line (\d+)$/)
      if (symbolLine && currentFile) {
        const list = index.get(symbolLine[1]) ?? []
        list.push({ file: currentFile, line: Number(symbolLine[2]) })
        index.set(symbolLine[1], list)
      }
    }
  }

  return index
}

// ---------------------------------------------------------------------------
// Targeted AST parsing — only the handful of candidate files this run
// actually needs, reusing the same TS AST + JSDoc pipeline as the symbol
// index (`scripts/docs/utils.ts`), not a second parser.
// ---------------------------------------------------------------------------

type ParsedSrcFile = { lines: string[], symbols: SymbolInfo[] }

const parseCache = new Map<string, ParsedSrcFile | null>()

const parseSrcFile = async (srcRelFile: string): Promise<ParsedSrcFile | null> => {
  if (parseCache.has(srcRelFile)) return parseCache.get(srcRelFile) ?? null

  const absolutePath = resolve(SRC_DIR, srcRelFile)
  const content = await readText(absolutePath)
  if (content === null) { parseCache.set(srcRelFile, null); return null }

  const sourceFile = parseStandaloneSourceFile(absolutePath, content)
  const parsed: ParsedSrcFile = { lines: content.split('\n'), symbols: getExportedSymbols(sourceFile) }
  parseCache.set(srcRelFile, parsed)
  return parsed
}

const toSrcRel = (repoRelPath: string): string | null =>
  repoRelPath.startsWith('src/') ? repoRelPath.slice('src/'.length) : null

type ResolvedSymbol = SymbolInfo & { origin: 'name-match' | 'explicit-file' | 'ast-grep' }

const snippetFor = (parsed: ParsedSrcFile, line: number): string => {
  const start = Math.max(1, line - SOURCE_SNIPPET_RADIUS)
  const end = Math.min(parsed.lines.length, line + SOURCE_SNIPPET_RADIUS)
  return parsed.lines.slice(start - 1, end)
    .map((value, index) => '  ' + String(start + index).padStart(4, ' ') + ' | ' + value)
    .join('\n')
}

const trimOutput = (value: string): string => value.length <= MAX_OUTPUT_CHARS
  ? value
  : value.slice(0, MAX_OUTPUT_CHARS) + '\n\n[output truncated at ' + MAX_OUTPUT_CHARS + ' chars]'

const main = async () => {
  const input = process.argv[2]
  if (!input) { console.error('Usage: pnpm claude:preflight <plan-id-or-filename>'); process.exitCode = 1; return }

  const plan = await findPlan(input)
  const notes = await findImplementationNotes(plan.path)
  const state = await readText(resolve(ROOT_DIR, 'docs/STATE.md'))
  const plansReadme = await readText(resolve(PLANS_DIR, 'README.md'))
  const combined = plan.content + '\n' + (notes?.content ?? '')

  const branch = runGit(['branch', '--show-current'])
  const head = runGit(['rev-parse', '--short', 'HEAD'])
  const status = runGit(['status', '--short'])

  // --- Priority 1: explicit repository paths --------------------------------

  const referencedPaths = extractPaths(combined)
  const explicitDocPaths = referencedPaths.filter(path => path.startsWith('docs/'))
  const explicitSrcFiles = referencedPaths
    .map(toSrcRel)
    .filter((path): path is string => path !== null)

  // --- Priority 2: real symbols — direct name mentions against the ----------
  // --- generated symbol index (not "any backticked word") -------------------

  const symbolNameIndex = await loadSymbolNameIndex()
  const mentionedTokens = tokenizeIdentifiers(combined)

  const resolvedSymbols = new Map<string, ResolvedSymbol>()

  const addResolved = async (name: string, file: string, origin: ResolvedSymbol['origin']): Promise<void> => {
    const key = file + '#' + name
    if (resolvedSymbols.has(key)) return
    const parsed = await parseSrcFile(file)
    const found = parsed?.symbols.find(symbol => symbol.name === name)
    if (found) resolvedSymbols.set(key, { ...found, origin })
  }

  for (const token of mentionedTokens) {
    const locations = symbolNameIndex.get(token)
    if (!locations) continue
    for (const location of locations) await addResolved(token, location.file, 'name-match')
  }

  // Explicit files: surface their own exports even without a name mention —
  // the plan/notes named the file itself, capped so one large file can't
  // flood the symbol list.
  for (const file of explicitSrcFiles) {
    const parsed = await parseSrcFile(file)
    if (!parsed) continue
    for (const symbol of parsed.symbols.slice(0, 4)) {
      await addResolved(symbol.name, file, 'explicit-file')
    }
  }

  // --- Priority 3/6: AST-promoted grep hits, then raw text-search fallback --

  const resolvedNames = new Set([...resolvedSymbols.values()].map(symbol => symbol.name))
  const grepTerms = extractIdentifierLikeTerms(combined)
    .filter(term => !resolvedNames.has(term))
    .slice(0, MAX_GREP_TERMS)

  const searchResults = new Map<string, string[]>()
  const rawSnippetHits: string[] = []

  for (const term of grepTerms) {
    const matches = searchGit(term)
    if (!matches.length) continue
    searchResults.set(term, matches)

    for (const match of matches) {
      const parsedMatch = match.match(/^(.+?):(\d+):/)
      if (!parsedMatch) continue
      const srcRelFile = toSrcRel(parsedMatch[1])
      const line = Number(parsedMatch[2])

      const parsed = srcRelFile ? await parseSrcFile(srcRelFile) : null
      const nearby = parsed?.symbols.find(symbol => Math.abs(symbol.line - line) <= 12)

      if (srcRelFile && nearby) {
        await addResolved(nearby.name, srcRelFile, 'ast-grep')
      } else {
        rawSnippetHits.push(match)
      }
    }
  }

  const originRank: Record<ResolvedSymbol['origin'], number> = { 'name-match': 0, 'explicit-file': 1, 'ast-grep': 2 }
  const relevantSymbols = [...resolvedSymbols.values()]
    .toSorted((a, b) => originRank[a.origin] - originRank[b.origin])
    .slice(0, MAX_RELEVANT_SYMBOLS)

  // --- Relevant files (paths ∪ files owning relevant symbols ∪ grep hits) ---

  const relevantFiles: string[] = []
  const addFile = (file: string): void => { if (!relevantFiles.includes(file)) relevantFiles.push(file) }
  for (const file of explicitSrcFiles) addFile(file)
  for (const symbol of relevantSymbols) addFile(symbol.file)
  for (const hit of rawSnippetHits) {
    const srcRelFile = toSrcRel(hit.match(/^(.+?):(\d+):/)?.[1] ?? '')
    if (srcRelFile) addFile(srcRelFile)
  }
  const cappedRelevantFiles = relevantFiles.slice(0, MAX_RELEVANT_FILES)

  // --- Relationships: architectural (JSDoc) vs. import dependencies ---------

  const architecturalSymbols = relevantSymbols.filter(symbol => symbol.metadata)

  const domains = [...new Set(cappedRelevantFiles.map(getDomain))].slice(0, MAX_DOMAINS)
  const dependencyByFile = new Map<string, { imports: string[], importedBy: string[] }>()
  for (const domain of domains) {
    const content = await readText(resolve(DEPENDENCIES_DIR, domain + '.md'))
    if (!content) continue
    for (const info of parseDependencyMap(content)) {
      dependencyByFile.set(info.file, { imports: info.imports, importedBy: info.importedBy })
    }
  }

  const relevantFileSet = new Set(cappedRelevantFiles)
  const importRelationships: string[] = []
  for (const file of cappedRelevantFiles) {
    const info = dependencyByFile.get(file)
    if (!info) continue
    const imports = info.imports.filter(imported => relevantFileSet.has(imported))
    const importedBy = info.importedBy.filter(importer => relevantFileSet.has(importer))
    if (imports.length === 0 && importedBy.length === 0) continue
    const parts: string[] = []
    if (imports.length) parts.push('imports ' + imports.map(value => '`' + value + '`').join(', '))
    if (importedBy.length) parts.push('imported by ' + importedBy.map(value => '`' + value + '`').join(', '))
    importRelationships.push('- `' + file + '` — ' + parts.join('; '))
  }

  // --- Implementation-note constraints: score sections by relevance, -------
  // --- don't assume any section name exists. --------------------------------

  const relevanceTerms = [...new Set([
    ...relevantSymbols.map(symbol => symbol.name),
    ...cappedRelevantFiles.map(file => file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''),
  ])].filter(Boolean)

  const scoreText = (text: string): number =>
    relevanceTerms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0)

  const noteSections = notes
    ? splitSections(notes.content)
      .map(section => ({ section, score: scoreText(section.heading + ' ' + section.bodyLines.join(' ')) }))
      .filter(entry => entry.score > 0)
      .toSorted((a, b) => b.score - a.score)
      .slice(0, MAX_NOTE_SECTIONS)
    : []

  const warnings = [...new Set([
    ...extractWarningLines(plan.content),
    ...(notes ? extractWarningLines(notes.content) : []),
  ])]
    .toSorted((a, b) => scoreText(b) - scoreText(a))
    .slice(0, MAX_WARNINGS)

  // --- Source snippets: relevant symbols first, then raw grep evidence ------

  const snippets: string[] = []
  for (const symbol of relevantSymbols) {
    if (snippets.length >= MAX_SOURCE_SNIPPETS) break
    const parsed = await parseSrcFile(symbol.file)
    if (!parsed) continue
    snippets.push('src/' + symbol.file + ':' + symbol.line + '\n' + snippetFor(parsed, symbol.line))
  }
  for (const hit of rawSnippetHits) {
    if (snippets.length >= MAX_SOURCE_SNIPPETS) break
    const match = hit.match(/^(.+?):(\d+):/)
    if (!match) continue
    const srcRelFile = toSrcRel(match[1])
    const parsed = srcRelFile ? await parseSrcFile(srcRelFile) : null
    if (!parsed) continue
    snippets.push(match[1] + ':' + match[2] + '\n' + snippetFor(parsed, Number(match[2])))
  }

  // --- Assemble ---------------------------------------------------------

  const output: string[] = []
  output.push('# SEEDVALE — IMPLEMENTATION PREFLIGHT', '')

  output.push('## Target')
  output.push('Plan: `' + repoRelative(plan.path) + '`')
  output.push('Implementation notes: ' + (notes ? '`' + repoRelative(notes.path) + '`' : 'MISSING'))
  output.push('HEAD: ' + (head || 'unknown') + ' | branch: ' + (branch || 'unknown'))
  output.push('Working tree: ' + (status ? 'HAS CHANGES — preserve them' : 'clean'))
  output.push(...parseMetadata(plan.content).map(line => line))
  const planSectionTitles = splitSections(plan.content).map(section => section.heading)
  if (planSectionTitles.length) output.push('Plan sections: ' + planSectionTitles.slice(0, 14).join(' · '))
  output.push('')

  const firstSection = splitSections(plan.content)[0]
  output.push('## Intent')
  if (firstSection) {
    output.push('### ' + firstSection.heading)
    output.push(...firstSection.bodyLines.slice(0, 8).map(line => '- ' + line))
  } else {
    output.push('- no plan sections found')
  }
  output.push('')

  if (architecturalSymbols.length) {
    output.push('## Relevant architecture', '')
    for (const symbol of architecturalSymbols) {
      output.push('### `' + symbol.name + '` — src/' + symbol.file + ':' + symbol.line)
      if (symbol.metadata) output.push(...formatArchitecturalMetadata(symbol.metadata, ''))
      output.push('')
    }
  }

  output.push('## Relevant files')
  output.push(...(cappedRelevantFiles.length
    ? cappedRelevantFiles.map(file => '- `src/' + file + '`')
    : ['- none identified']))
  if (explicitDocPaths.length) output.push(...explicitDocPaths.map(path => '- `' + path + '`'))
  output.push('')

  if (architecturalSymbols.length || importRelationships.length) {
    output.push('## Relationships')
    if (architecturalSymbols.length) {
      output.push('### Architectural (JSDoc)')
      for (const symbol of architecturalSymbols) {
        const meta = symbol.metadata ?? {}
        const parts: string[] = []
        if (meta.owns) parts.push('owns ' + meta.owns.join(', '))
        if (meta.uses) parts.push('uses ' + meta.uses.join(', '))
        if (meta.produces) parts.push('produces ' + meta.produces.join(', '))
        if (meta.consumes) parts.push('consumes ' + meta.consumes.join(', '))
        if (parts.length) output.push('- `' + symbol.name + '` ' + parts.join('; '))
      }
      output.push('')
    }
    if (importRelationships.length) {
      output.push('### Import dependencies (within relevant files)')
      output.push(...importRelationships)
      output.push('')
    }
  }

  if (warnings.length) {
    output.push('## Warnings')
    output.push(...warnings.map(line => '- ' + line))
    output.push('')
  }

  if (noteSections.length) {
    output.push('## Implementation-note constraints')
    for (const { section } of noteSections) {
      output.push('### ' + section.heading)
      output.push(...section.bodyLines.slice(0, 8).map(line => '- ' + line))
    }
    output.push('')
  }

  if (state) {
    output.push('## Current implementation anchors')
    output.push(...extractHeadings(state).slice(0, 16).map(line => '- ' + line), '')
  }

  output.push('## Source evidence')
  output.push(...(snippets.length ? snippets.map(snippet => '```text\n' + snippet + '\n```') : ['- none']), '')

  if (searchResults.size) {
    output.push('## Text-search fallback (unresolved terms)')
    for (const [term, matches] of searchResults) {
      output.push('- `' + term + '`: ' + matches.length + ' match(es), e.g. `' + matches[0] + '`')
    }
    output.push('')
  }

  if (plansReadme) {
    const needle = plan.path.split('/').pop() ?? ''
    const lines = plansReadme.split('\n').filter(line => line.includes(needle)).slice(0, 10)
    if (lines.length) {
      output.push('## Plan index context')
      output.push(...lines.map(line => '- ' + line.trim()), '')
    }
  }

  output.push('## Recommended next reads')
  output.push(...(cappedRelevantFiles.length
    ? cappedRelevantFiles.slice(0, 12).map(file => '- `src/' + file + '`')
    : ['- Select the smallest relevant files from source evidence above.']))

  console.log(trimOutput(output.join('\n')))
}

main().catch(error => { console.error(error); process.exitCode = 1 })

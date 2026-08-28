import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, relative as pathRelative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(SCRIPT_DIR, '../..')
const PLANS_DIR = resolve(ROOT_DIR, 'docs/plans')
const NOTES_DIR = resolve(PLANS_DIR, 'implementation-notes')
const CODE_MAP_DIR = resolve(ROOT_DIR, 'docs/code-map')

const MAX_OUTPUT_CHARS = 18000
const MAX_TERMS = 12
const MAX_SEARCH_RESULTS_PER_TERM = 8
const MAX_SOURCE_SNIPPETS = 10
const SOURCE_SNIPPET_RADIUS = 2

const readText = async (path: string): Promise<string | null> => {
  try { return await readFile(path, 'utf8') } catch { return null }
}

const findPlan = async (input: string): Promise<{ path: string; content: string }> => {
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

const repoPath = (path: string): string => pathRelative(ROOT_DIR, path).replaceAll('\\', '/')

const extractPaths = (content: string): string[] => {
  const matches = content.match(/(?:src|docs)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|md)/g) ?? []
  return [...new Set(matches)]
}

const extractTerms = (content: string): string[] => {
  const values = content.match(/`([^`]{2,80})`/g) ?? []
  return [...new Set(values.map(value => value.slice(1, -1)).filter(value =>
    /^[A-Za-z][A-Za-z0-9_.:/-]*$/.test(value) &&
    !value.includes('http') && !value.endsWith('.md') && !value.endsWith('.ts')
  ))]
}

const extractHeadings = (content: string): string[] =>
  content.split('\n').filter(line => /^#{1,3}\s/.test(line)).map(line => line.trim()).slice(0, 40)

const parseMetadata = (content: string): string[] => {
  const keys = ['Created', 'Status', 'Priority', 'Depends on', 'Domain']
  return content.split('\n').filter(line => keys.some(key => line.startsWith('**' + key + ':**'))).slice(0, keys.length)
}

const compactSection = (content: string, heading: string): string[] => {
  const lines = content.split('\n')
  const index = lines.findIndex(line => line.trim() === heading)
  if (index === -1) return []
  const result: string[] = []
  for (let i = index + 1; i < lines.length && result.length < 8; i++) {
    if (/^#{1,3}\s/.test(lines[i])) break
    if (lines[i].trim()) result.push(lines[i].trim())
  }
  return result
}

const searchGit = (term: string): string[] => {
  const result = runGit(['grep', '-n', '-I', '-F', '--', term, 'src'])
  return result.split('\n').filter(Boolean).slice(0, MAX_SEARCH_RESULTS_PER_TERM)
}

const sourceSnippet = async (match: string): Promise<string | null> => {
  const parsed = match.match(/^(.+?):(\d+):(.*)$/)
  if (!parsed) return null
  const path = parsed[1]
  const line = Number(parsed[2])
  const content = await readText(resolve(ROOT_DIR, path))
  if (!content) return null
  const lines = content.split('\n')
  const start = Math.max(1, line - SOURCE_SNIPPET_RADIUS)
  const end = Math.min(lines.length, line + SOURCE_SNIPPET_RADIUS)
  return [path + ':' + line, ...lines.slice(start - 1, end).map((value, index) =>
    '  ' + String(start + index).padStart(4, ' ') + ' | ' + value
  )].join('\n')
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
  const claude = await readText(resolve(ROOT_DIR, 'CLAUDE.md'))
  const combined = plan.content + '\n' + (notes?.content ?? '')
  const referencedPaths = extractPaths(combined)
  const terms = [...new Set([...extractTerms(combined), ...referencedPaths.map(path => path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '')]
  )].filter(term => term.length >= 3).slice(0, MAX_TERMS)
  const domain = plan.content.match(/^\*\*Domain:\*\*\s*`?([^`\s]+)`?/im)?.[1] ?? null

  const codeSymbols = domain ? await readText(resolve(CODE_MAP_DIR, 'symbols', domain + '.md')) : null
  const codeDeps = domain ? await readText(resolve(CODE_MAP_DIR, 'dependencies', domain + '.md')) : null
  const branch = runGit(['branch', '--show-current'])
  const head = runGit(['rev-parse', '--short', 'HEAD'])
  const status = runGit(['status', '--short'])

  const searchResults = new Map<string, string[]>()
  for (const term of terms) { const matches = searchGit(term); if (matches.length) searchResults.set(term, matches) }

  const snippets: string[] = []
  const seen = new Set<string>()
  for (const matches of searchResults.values()) {
    for (const match of matches) {
      const key = match.split(':').slice(0, 2).join(':')
      if (seen.has(key)) continue
      seen.add(key)
      const snippet = await sourceSnippet(match)
      if (snippet) snippets.push(snippet)
      if (snippets.length >= MAX_SOURCE_SNIPPETS) break
    }
    if (snippets.length >= MAX_SOURCE_SNIPPETS) break
  }

  const mapEvidence = (map: string | null): string[] => map
    ? map.split('\n').filter(line => referencedPaths.some(path => line.includes(path.split('/').pop() ?? path))).slice(0, 30)
    : []

  const output: string[] = []
  output.push('# SEEDVALE — IMPLEMENTATION PREFLIGHT', '')
  output.push('Plan: `' + repoPath(plan.path) + '`')
  output.push('Implementation notes: ' + (notes ? '`' + repoPath(notes.path) + '`' : 'MISSING'))
  output.push('HEAD: ' + (head || 'unknown') + ' | branch: ' + (branch || 'unknown'))
  output.push('Working tree: ' + (status ? 'HAS CHANGES — preserve them' : 'clean'), '')

  output.push('## Plan metadata')
  output.push(...parseMetadata(plan.content).map(line => '- ' + line), '')
  output.push('## Plan structure')
  output.push(...extractHeadings(plan.content).map(line => '- ' + line), '')

  if (notes) {
    output.push('## Implementation notes — key sections')
    for (const heading of ['## Summary', '## Timer model: absolute day anchors, not a per-frame decrementing timer', '## Eggs', '## Milk', '## Integration', '## Verification']) {
      const lines = compactSection(notes.content, heading)
      if (lines.length) { output.push('### ' + heading.slice(3)); output.push(...lines.map(line => '- ' + line)) }
    }
    output.push('')
  }

  output.push('## Referenced repository paths')
  output.push(...(referencedPaths.length ? referencedPaths.map(path => '- `' + path + '`') : ['- none']), '')

  const evidence = mapEvidence(codeSymbols)
  if (evidence.length) { output.push('## Code-map evidence'); output.push(...evidence.map(line => '- ' + line.trim()), '') }
  const deps = mapEvidence(codeDeps)
  if (deps.length) { output.push('## Dependency-map evidence'); output.push(...deps.map(line => '- ' + line.trim()), '') }

  output.push('## Source search')
  if (!searchResults.size) output.push('- no direct source matches for extracted terms')
  for (const [term, matches] of searchResults) { output.push('### `' + term + '`'); output.push(...matches.map(match => '- ' + match)) }
  output.push('')

  output.push('## Targeted source snippets')
  output.push(...(snippets.length ? snippets.map(snippet => '```text\n' + snippet + '\n```') : ['- none']), '')

  output.push('## Current documentation anchors')
  output.push(...(state ? extractHeadings(state).slice(0, 18).map(line => '- ' + line) : ['- docs/STATE.md unavailable']))
  output.push('')

  if (plansReadme && domain) {
    const lines = plansReadme.split('\n').filter(line => line.includes(domain) || line.includes(plan.path.split('/').pop() ?? '')).slice(0, 20)
    output.push('## Plan index context'); output.push(...(lines.length ? lines.map(line => '- ' + line.trim()) : ['- no matching plan index lines']), '')
  }

  output.push('## Agent rules distilled from CLAUDE.md')
  if (claude) {
    output.push('- Current source code is authoritative over plans/notes.')
    output.push('- Narrow navigation: use indexes and targeted source inspection instead of broad reads.')
    output.push('- Reuse existing mechanisms; do not create parallel systems.')
    output.push('- Preserve deterministic simulation, ownership/lifecycle boundaries and performance.')
    output.push('- Distinguish implemented, technically verified and browser/manual verified.')
  }
  output.push('')

  output.push('## Recommended next reads')
  output.push(...(referencedPaths.length ? referencedPaths.slice(0, 12).map(path => '- `' + path + '`') : ['- Select the smallest relevant files from source-search results.']))

  console.log(trimOutput(output.join('\n')))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
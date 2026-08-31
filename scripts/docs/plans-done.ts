import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PLANS = resolve(ROOT, 'docs/plans')
const README = resolve(PLANS, 'README.md')
const DONE = resolve(PLANS, 'DONE.md')
const STATUS = /^\\*\\*Status:\\*\\*\\s*`([^`]+)`/m
const DOMAIN = /^\\*\\*Domain:\\*\\*\\s*`([^`]+)`/m

type Record = { plan: string; domain: string; opened: string[]; verificationNeeded: string | null; done: string | null }
type Event = { commit: string; date: string }

const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const rel = (p: string) => p.replace(ROOT, '').replace(/^[/\\\\]/, '').replaceAll('\\\\', '/')
const idOf = (file: string) => file.replace(/\\.md$/, '')
const statusOf = (text: string) => text.match(STATUS)?.[1]?.trim().toLowerCase() ?? null
const domainOf = (text: string) => text.match(DOMAIN)?.[1]?.trim() ?? ''

const fileAt = (path: string, commit: string): string | null => { try { return git('show', commit + ':' + rel(resolve(ROOT, path))) } catch { return null } }
const commitsOf = (file: string) => { const out = git('log', '--follow', '--format=%H', '--', rel(resolve(PLANS, file))); return out ? out.split('\n').reverse() : [] }
const dateOf = (commit: string) => git('show', '-s', '--format=%aI', commit).replace('T', ' ').slice(0, 19)

/** Find first verification-needed and done transitions in Git history. @domain tools */
const eventsOf = (file: string) => {
  let previous: string | null = null
  let verificationNeeded: Event | null = null
  let done: Event | null = null
  for (const commit of commitsOf(file)) {
    const text = fileAt(resolve(PLANS, file), commit)
    if (!text) continue
    const status = statusOf(text)
    if (status === 'verification needed' && previous !== status && !verificationNeeded) verificationNeeded = { commit, date: dateOf(commit) }
    if (status === 'done' && previous !== status && !done) done = { commit, date: dateOf(commit) }
    previous = status
  }
  return { verificationNeeded, done }
}

const aliasesOf = (id: string) => {
  const aliases = new Set([id])
  const modern = id.match(/^(.+)-(\\d{3})-/)
  if (modern) { aliases.add(modern[1] + '-' + modern[2]); aliases.add(modern[2]) }
  const legacy = id.match(/^\\d{4}-\\d{2}-\\d{2}--(\\d{3})--/)
  if (legacy) aliases.add(legacy[1])
  return aliases
}
const dependencyMatches = (dependency: string, id: string) => [...aliasesOf(id)].some(alias => alias.toLowerCase() === dependency.toLowerCase())

const plannedRows = (readme: string) => {
  const lines = readme.split('\n')
  const start = lines.findIndex(line => line.trim() === '## Planned')
  if (start < 0) throw new Error('Cannot find ## Planned in README.md')
  const end = lines.findIndex((line, i) => i > start && /^##\\s/.test(line))
  const result: Array<{ file: string; depends: string }> = []
  for (const line of lines.slice(start + 1, end < 0 ? lines.length : end)) {
    if (!line.trim().startsWith('|')) continue
    const columns = line.split('|').slice(1, -1).map(x => x.trim())
    if (columns.length < 5 || columns[0] === 'File') continue
    const match = columns[0].match(/`([^`]+\\.md)`/)
    if (match) result.push({ file: match[1], depends: columns[4] })
  }
  return result
}

const openedOf = (id: string, commit: string) => {
  const readme = fileAt('docs/plans/README.md', commit)
  if (!readme) return []
  return plannedRows(readme).filter(row => (row.depends.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g) ?? []).some(dep => dependencyMatches(dep, id))).map(row => row.file.replace(/\\.md$/, ''))
}

const parseDone = async (): Promise<Record[]> => {
  try {
    const text = await readFile(DONE, 'utf8')
    return text.split('\n').filter(x => x.trim().startsWith('|')).map(x => x.split('|').slice(1, -1).map(y => y.trim())).filter(x => x.length === 5 && x[0] !== 'Plan').map(x => ({ plan: x[0], domain: x[1].replaceAll('`', ''), opened: x[2] === '—' ? [] : x[2].split(',').map(y => y.trim()), verificationNeeded: x[3] === '—' ? null : x[3], done: x[4] === '—' ? null : x[4] }))
  } catch { return [] }
}

const planFiles = (readme: string) => plannedRows(readme).map(row => row.file)
const update = (records: Record[], next: Record) => { const i = records.findIndex(x => x.plan === next.plan); if (i < 0) return [...records, next]; const out = [...records]; out[i] = { plan: out[i].plan, domain: out[i].domain || next.domain, opened: out[i].opened.length ? out[i].opened : next.opened, verificationNeeded: out[i].verificationNeeded ?? next.verificationNeeded, done: out[i].done ?? next.done }; return out }

const markDependencies = async (planId: string, opened: string[]) => {
  const aliases = [...aliasesOf(planId)]
  for (const id of opened) {
    const path = resolve(PLANS, id + '.md')
    let text: string
    try { text = await readFile(path, 'utf8') } catch { continue }
    let next = text
    for (const alias of aliases) { const escaped = alias.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'); next = next.replace(new RegExp('(?<!~~)(?<![A-Za-z0-9-])' + escaped + '(?![A-Za-z0-9-])(?!~~)', 'gi'), '~~' + alias + '~~') }
    if (next !== text) await writeFile(path, next, 'utf8')
  }
}

const generate = (records: Record[]) => {
  const sorted = [...records].sort((a, b) => (b.done ?? b.verificationNeeded ?? '').localeCompare(a.done ?? a.verificationNeeded ?? ''))
  return ['# Completed Plans', '', '> Automatically generated from plan history and Git. Do not edit manually.', '', '| Plan | Domain | Opened | Verification needed | Done |', '|---|---|---|---|---|', ...sorted.map(x => '| ' + x.plan + ' | `' + x.domain + '` | ' + (x.opened.length ? x.opened.join(', ') : '—') + ' | ' + (x.verificationNeeded ?? '—') + ' | ' + (x.done ?? '—') + ' |'), ''].join('\n')
}

const main = async () => {
  const readme = await readFile(README, 'utf8')
  const candidates = new Set(planFiles(readme))
  const existing = await parseDone()
  const existingByPlan = new Map(existing.map(x => [x.plan, x]))
  let records = existing
  for (const file of candidates) {
    const id = idOf(file)
    if (existingByPlan.get(id)?.done) continue
    const content = await readFile(resolve(PLANS, file), 'utf8')
    const domain = domainOf(content)
    const events = eventsOf(file)
    if (!events.verificationNeeded && !events.done) continue
    const opened = events.done ? openedOf(id, events.done.commit) : []
    records = update(records, { plan: id, domain, opened, verificationNeeded: events.verificationNeeded?.date ?? null, done: events.done?.date ?? null })
    if (events.done) await markDependencies(id, opened)
  }
  await writeFile(DONE, generate(records), 'utf8')
  console.log('Updated ' + rel(DONE) + ' (' + records.length + ' records).')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
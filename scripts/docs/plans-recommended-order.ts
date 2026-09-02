import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  LEGACY_PLAN_FILE_RE,
  LEGACY_PLAN_ID_RE,
  PLAN_FILE_RE,
  PLANS_PATH,
} from './config.js'

type Status = 'in progress' | 'verification needed' | 'planned' | 'done'
type Priority = 'high' | 'medium' | 'low'
type Effort = 'XS' | 'S' | 'M' | 'L' | 'XL'

type Plan = {
  file: string
  id: string
  title: string
  status: Status
  priority: Priority
  effort: Effort
  dependencies: string[]
}

const STATUS_RE = /^\*\*Status:\*\*\s*\x60([^\x60]+)\x60/im
const PRIORITY_RE = /^\*\*Priority:\*\*\s*[^\w]*([A-Za-z]+)/im
const EFFORT_RE = /^\*\*Effort:\*\*\s*\x60?([A-Za-z]{1,3})\x60?/im
const DEPENDS_RE = /^\*\*Depends on:\*\*\s*(.+)$/im
const TITLE_RE = /^# Plan:\s*(.+)$/m

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 30, medium: 20, low: 10 }
const EFFORT_PENALTY: Record<Effort, number> = { XS: 0, S: 1, M: 3, L: 6, XL: 10 }
const COMPLETED = new Set<Status>(['done', 'verification needed'])

const parseDependencies = (raw: string): string[] =>
  raw.toLowerCase() === 'none' || raw.trim() === '-'
    ? []
    : raw
        .split(/\s+/)
        .map(value => value.replaceAll('~~', '').replaceAll('\x60', '').replace(/[(),;]/g, '').trim())
        .filter(Boolean)

const parsePlan = (file: string, content: string): Plan | null => {
  const match = file.match(PLAN_FILE_RE)
  if (!match) return null

  const status = content.match(STATUS_RE)?.[1] as Status | undefined
  const priority = content.match(PRIORITY_RE)?.[1]?.toLowerCase() as Priority | undefined
  const effort = content.match(EFFORT_RE)?.[1]?.toUpperCase() as Effort | undefined
  const title = content.match(TITLE_RE)?.[1]?.trim() ?? file
  const depends = content.match(DEPENDS_RE)?.[1]

  if (!status || !['in progress', 'verification needed', 'planned', 'done'].includes(status))
    throw new Error('Invalid or missing Status in ' + file)
  if (!priority || !(priority in PRIORITY_WEIGHT))
    throw new Error('Invalid or missing Priority in ' + file)
  if (!effort || !(effort in EFFORT_PENALTY))
    throw new Error('Invalid or missing Effort in ' + file)
  if (!depends)
    throw new Error('Missing Depends on in ' + file)

  return {
    file,
    id: match[1] + '-' + match[2],
    title,
    status,
    priority,
    effort,
    dependencies: parseDependencies(depends),
  }
}

const loadPlans = async (): Promise<{ plans: Plan[]; byId: Map<string, Plan> }> => {
  const files = await readdir(PLANS_PATH)
  const plans: Plan[] = []
  const byId = new Map<string, Plan>()

  for (const file of files) {
    if (
      file === 'README.md' ||
      file === 'PLANNING.md' ||
      file === 'NEXT-IDEAS.md' ||
      file === 'LOOSE-ENDS.md' ||
      file.endsWith('-implementation-notes.md') ||
      file.endsWith('-review.md') ||
      file.endsWith('-updated-review.md') ||
      LEGACY_PLAN_FILE_RE.test(file)
    ) continue

    const plan = parsePlan(file, await readFile(resolve(PLANS_PATH, file), 'utf8'))
    if (plan) {
      plans.push(plan)
      byId.set(plan.id, plan)
    }
  }

  // Legacy plans use a global numeric ID (for example 177), still referenced by new plans.
  for (const file of files.filter(file => LEGACY_PLAN_FILE_RE.test(file))) {
    const id = file.match(LEGACY_PLAN_ID_RE)?.[1]
    if (!id) continue

    const content = await readFile(resolve(PLANS_PATH, file), 'utf8')
    const status = (content.match(STATUS_RE)?.[1] ?? 'done') as Status

    byId.set(id, {
      file,
      id,
      title: content.match(TITLE_RE)?.[1]?.trim() ?? file,
      status,
      priority: 'low',
      effort: 'S',
      dependencies: parseDependencies(content.match(DEPENDS_RE)?.[1] ?? 'none'),
    })
  }

  return { plans, byId }
}

const validateDependencies = (plans: Plan[], byId: Map<string, Plan>): void => {
  for (const plan of plans) {
    for (const dependency of plan.dependencies) {
      if (!byId.has(dependency))
        throw new Error('Unknown dependency "' + dependency + '" in ' + plan.file)
    }
  }
}

const buildDependents = (byId: Map<string, Plan>): Map<string, Set<string>> => {
  const result = new Map<string, Set<string>>()
  for (const id of byId.keys()) result.set(id, new Set())

  for (const plan of byId.values()) {
    for (const dependency of plan.dependencies)
      result.get(dependency)?.add(plan.id)
  }

  return result
}

const countTransitiveDependents = (
  id: string,
  dependents: Map<string, Set<string>>,
): number => {
  const seen = new Set<string>()
  const queue = [...(dependents.get(id) ?? [])]

  while (queue.length) {
    const current = queue.shift()!
    if (seen.has(current)) continue
    seen.add(current)
    queue.push(...(dependents.get(current) ?? []))
  }

  return seen.size
}

const depthOf = (
  id: string,
  byId: Map<string, Plan>,
  visiting = new Set<string>(),
): number => {
  const plan = byId.get(id)
  if (!plan || plan.dependencies.length === 0) return 0
  if (visiting.has(id)) throw new Error('Dependency cycle involving ' + id)

  const next = new Set(visiting).add(id)
  return 1 + Math.max(...plan.dependencies.map(dep => depthOf(dep, byId, next)))
}

const score = (
  plan: Plan,
  byId: Map<string, Plan>,
  dependents: Map<string, Set<string>>,
): number => {
  const direct = dependents.get(plan.id)?.size ?? 0
  const transitive = countTransitiveDependents(plan.id, dependents)

  return (
    PRIORITY_WEIGHT[plan.priority] +
    direct * 4 +
    transitive * 10 +
    depthOf(plan.id, byId) * 2 -
    EFFORT_PENALTY[plan.effort]
  )
}

const ready = (
  plan: Plan,
  completed: Set<string>,
  byId: Map<string, Plan>,
): boolean =>
  plan.dependencies.every(dep =>
    completed.has(dep) || COMPLETED.has(byId.get(dep)?.status ?? 'planned'),
  )

const recommend = (
  plans: Plan[],
  byId: Map<string, Plan>,
  dependents: Map<string, Set<string>>,
): Plan[] => {
  const remaining = new Set(
    plans.filter(plan => plan.status === 'planned').map(plan => plan.id),
  )
  const completed = new Set(
    [...byId.values()]
      .filter(plan => COMPLETED.has(plan.status))
      .map(plan => plan.id),
  )
  const order: Plan[] = []

  while (remaining.size) {
    const candidates = [...remaining]
      .map(id => byId.get(id)!)
      .filter(plan => ready(plan, completed, byId))
      .sort((a, b) =>
        score(b, byId, dependents) - score(a, byId, dependents) ||
        a.id.localeCompare(b.id),
      )

    if (!candidates.length)
      throw new Error(
        'Dependency cycle or unresolved blocker among: ' + [...remaining].join(', '),
      )

    const next = candidates[0]
    remaining.delete(next.id)
    completed.add(next.id)
    order.push(next)
  }

  return order
}

const main = async (): Promise<void> => {
  const { plans, byId } = await loadPlans()
  validateDependencies(plans, byId)

  const dependents = buildDependents(byId)
  const order = recommend(plans, byId, dependents)

  console.log('Recommended plan execution order')
  console.log('================================')
  console.log('')
  console.log('Only planned plans are ranked.')
  console.log('done / verification needed satisfy dependencies.')
  console.log('Score = priority + direct unlocks + transitive unlocks + depth - effort.')
  console.log('')

  order.forEach((plan, index) => {
    const direct = dependents.get(plan.id)?.size ?? 0
    const transitive = countTransitiveDependents(plan.id, dependents)

    console.log(
      String(index + 1).padStart(2) +
      '. ' + plan.id.padEnd(32) +
      plan.priority.padEnd(7) +
      plan.effort.padEnd(3) +
      ' score=' + String(score(plan, byId, dependents)).padStart(3) +
      ' unlocks=' + direct + '/' + transitive,
    )
    console.log('   ' + plan.title)
  })

  const initiallyReady = new Set(
    plans
      .filter(plan => plan.status === 'planned' && ready(plan, new Set(), byId))
      .map(plan => plan.id),
  )

  console.log('')
  console.log('Initially blocked')
  console.log('=================')

  plans
    .filter(plan => plan.status === 'planned' && !initiallyReady.has(plan.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach(plan => {
      const blockers = plan.dependencies
        .filter(dep => !COMPLETED.has(byId.get(dep)?.status ?? 'planned'))
        .join(', ')
      console.log('- ' + plan.id + ': ' + blockers)
    })

  console.log('')
  console.log('Dependency graph (planned + their dependencies)')
  console.log('================================================')
  console.log('\x60\x60\x60mermaid')
  console.log('graph TD')

  for (const plan of plans) {
    const node = plan.id.replaceAll('-', '_')
    console.log('  ' + node + '["' + plan.id + '"]')

    for (const dep of plan.dependencies) {
      console.log('  ' + dep.replaceAll('-', '_') + ' --> ' + node)
    }
  }

  console.log('\x60\x60\x60')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

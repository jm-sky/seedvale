import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  ARCHIVED_PLANS_PATH,
  AVAILABLE_STATUSES,
  COMPLETED_STATUSES,
  type Effort,
  LEGACY_PLAN_FILE_RE,
  LEGACY_PLAN_ID_RE,
  NOTES_SUFFIX,
  PLAN_DEPENDS_RE,
  PLAN_EFFORT_RE,
  PLAN_FILE_RE,
  PLAN_PRIORITY_RE,
  PLAN_STATUS_RE,
  PLANS_DEPENDENCIES_PATH,
  PLANS_PATH,
  type Priority,
  PRIORITY_ICONS,
  type Status,
} from './config.js'

type Plan = {
  file: string
  id: string
  title: string
  status: Status
  priority: Priority
  effort: Effort
  dependencies: string[]
}

type PlanFile = {
  file: string
  path: string
  archive: boolean
}

const TITLE_RE = /^# Plan:\s*(.+)$/m

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 30, medium: 20, low: 10 }
const EFFORT_PENALTY: Record<Effort, number> = { XS: 0, S: 1, M: 3, L: 6, XL: 10 }
const COMPLETED = new Set<Status>(['done', 'verification needed'])

const REVIEW_SUFFIX = '--review.md'

const getPriorityLabel = (priority: Priority): string => {
  return PRIORITY_ICONS[priority]
}

const parseDependencies = (raw: string): string[] => {
  if (!raw || raw.trim().toLowerCase() === 'none' || raw.trim() === '-') {
    return []
  }

  return raw
      .split(/\s+/)
      .map(value => value.replaceAll('~~', '').replaceAll('\x60', '').replace(/[(),;]/g, '').trim())
      .filter(value => value !== '' && value !== '-' && value !== 'none')
      .filter(Boolean)
}


const parsePlan = (file: string, content: string, archive: boolean): Plan | null => {
  const match = file.match(PLAN_FILE_RE)
  if (!match) return null

  const status = content.match(PLAN_STATUS_RE)?.[1] as Status | undefined
  const priority = (content.match(PLAN_PRIORITY_RE)?.[1]?.toLowerCase() ?? 'medium') as Priority
  const effort = content.match(PLAN_EFFORT_RE)?.[1]?.toUpperCase() as Effort | undefined
  const title = content.match(TITLE_RE)?.[1]?.trim() ?? file
  const depends = content.match(PLAN_DEPENDS_RE)?.[1]
  const isCompleted: boolean = (status && COMPLETED_STATUSES.has(status)) || archive

  if (!status || !AVAILABLE_STATUSES.includes(status))
    throw new Error('Invalid or missing Status in ' + file)
  if ((!priority || !(priority in PRIORITY_WEIGHT)) && !isCompleted)
    throw new Error('Invalid or missing Priority in ' + file)
  if ((!effort || !(effort in EFFORT_PENALTY)) && !isCompleted)
    throw new Error('Invalid or missing Effort in ' + file)
  if (!depends) {
    console.warn('Missing Depends on in ' + file)
    return null
  }

  return {
    file,
    id: match[1] + '-' + match[2],
    title,
    status,
    priority: priority ?? 'medium',
    effort: effort ?? 'M',
    dependencies: parseDependencies(depends),
  }
}

const loadPlans = async (): Promise<{ plans: Plan[]; byId: Map<string, Plan> }> => {
  const files = await readdir(PLANS_PATH)
  const archivedFiles = await readdir(ARCHIVED_PLANS_PATH)
  const allFiles: PlanFile[] = [
    ...files
      .filter(file => !file.endsWith(NOTES_SUFFIX))
      .filter(file => !file.endsWith(REVIEW_SUFFIX))
      .map(file => ({ file, path: resolve(PLANS_PATH, file), archive: false })),
    ...archivedFiles
      .filter(file => !file.endsWith(NOTES_SUFFIX))
      .filter(file => !file.endsWith(REVIEW_SUFFIX))
      .map(file => ({ file, path: resolve(ARCHIVED_PLANS_PATH, file), archive: true })),
  ]

  const plans: Plan[] = []
  const byId = new Map<string, Plan>()

  for (const { file, path, archive } of allFiles) {
    if (!PLAN_FILE_RE.test(file)) continue
    if (LEGACY_PLAN_FILE_RE.test(file)) continue

    const plan = parsePlan(file, await readFile(path, 'utf8'), archive)

    if (plan) {
      plans.push(plan)
      byId.set(plan.id, plan)
    }
  }

  // Legacy plans use a global numeric ID (for example 177), still referenced by new plans.
  for (const { file, path } of allFiles.filter(({ file }) => LEGACY_PLAN_FILE_RE.test(file))) {
    const id = file.match(LEGACY_PLAN_ID_RE)?.[1]
    if (!id) continue

    const content = await readFile(path, 'utf8')
    const status = (content.match(PLAN_STATUS_RE)?.[1] ?? 'done') as Status

    byId.set(id, {
      file,
      id,
      title: content.match(TITLE_RE)?.[1]?.trim() ?? file,
      status,
      priority: 'low',
      effort: 'S',
      dependencies: parseDependencies(content.match(PLAN_DEPENDS_RE)?.[1] ?? 'none'),
    })
  }

  return { plans, byId }
}

const validateDependencies = (plans: Plan[], byId: Map<string, Plan>): void => {
  for (const plan of plans) {
    for (const dependency of plan.dependencies) {
      if (!byId.has(dependency)) {
        throw new Error('Unknown dependency "' + dependency + '" in ' + plan.file)
      }
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
  const output: string[] = []

  output.push('Recommended plan execution order')
  output.push('================================')
  output.push('')
  output.push('Only planned plans are ranked.')
  output.push('done / verification needed satisfy dependencies.')
  output.push('Score = priority + direct unlocks + transitive unlocks + depth - effort.')
  output.push('')

  order.forEach((plan, index) => {
    const direct = dependents.get(plan.id)?.size ?? 0
    const transitive = countTransitiveDependents(plan.id, dependents)

    output.push(
      String(index + 1) +
      '. ' + `\`${plan.id}\` - **${plan.title}**  \n` +

      ''.padStart(2) + getPriorityLabel(plan.priority) + ' ' + plan.effort + ' · ' +
      '**Score:** ' + String(score(plan, byId, dependents)).padStart(3) + '  \n' +

      ''.padStart(2) + ' → **unlocks:** ' + direct + '/' + transitive,
    )
    output.push('')
  })

  const initiallyReady = new Set(
    plans
      .filter(plan => plan.status === 'planned' && ready(plan, new Set(), byId))
      .map(plan => plan.id),
  )

  output.push('')
  output.push('Initially blocked')
  output.push('=================')

  plans
    .filter(plan => plan.status === 'planned' && !initiallyReady.has(plan.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach(plan => {
      const blockers = plan.dependencies
        .filter(dep => !COMPLETED.has(byId.get(dep)?.status ?? 'planned'))
        .join(', ')
      output.push('- ' + plan.id + ': ' + blockers)
    })

  output.push('')
  output.push('Dependency graph (planned + their dependencies)')
  output.push('================================================')
  output.push('\x60\x60\x60mermaid')
  output.push('graph TD')

  for (const plan of plans) {
    const node = plan.id.replaceAll('-', '_')
    output.push('  ' + node + '["' + plan.id + '"]')

    for (const dep of plan.dependencies) {
      output.push('  ' + dep.replaceAll('-', '_') + ' --> ' + node)
    }
  }

  output.push('\x60\x60\x60')

  await writeFile(PLANS_DEPENDENCIES_PATH, output.join('\n') + '\n', 'utf8')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

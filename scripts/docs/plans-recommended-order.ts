import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ARCHIVED_PLANS_PATH,
  AVAILABLE_STATUSES,
  AVAILABLE_TYPES,
  COMPLETED_STATUSES,
  type Effort,
  EFFORT_PENALTIES,
  LEGACY_PLAN_FILE_RE,
  LEGACY_PLAN_ID_RE,
  NOTES_SUFFIX,
  PLAN_DEPENDS_RE,
  PLAN_EFFORT_RE,
  PLAN_FILE_RE,
  PLAN_PRIORITY_RE,
  PLAN_STATUS_RE,
  PLANS_PATH,
  PLANS_RECOMMENDED_ORDER_PATH,
  type PlanType,
  type Priority,
  PRIORITY_ICONS,
  PRIORITY_WEIGHTS,
  type Status,
} from './config.js'
import { parsePlanHeader } from './plan-metadata.js'

export type Plan = {
  file: string
  id: string
  title: string
  status: Status
  priority: Priority
  effort: Effort
  dependencies: string[]
  type?: PlanType
  roadmap?: string
}

type PlanFile = {
  file: string
  path: string
  archive: boolean
}

const TITLE_RE = /^# Plan:\s*(.+)$/m

const COMPLETED = COMPLETED_STATUSES

const REVIEW_SUFFIX = '--review.md'

/** Metrics derived from the dependency graph and metadata, shared by every ranking perspective. */
export type PlanMetrics = {
  priorityWeight: number
  effortPenalty: number
  direct: number
  transitive: number
  depth: number
  ready: boolean
  overallScore: number
}

const getPriorityLabel = (priority: Priority): string => {
  return PRIORITY_ICONS[priority]
}

export const parseDependencies = (raw: string): string[] => {
  if (!raw || raw.trim().toLowerCase() === 'none' || raw.trim() === '-') {
    return []
  }

  return raw
      .split(/\s+/)
      .map(value => value.replaceAll('~~', '').replaceAll('\x60', '').replace(/[(),;]/g, '').trim())
      .filter(value => value !== '' && value !== '-' && value !== 'none')
      .filter(Boolean)
}

const parseRoadmap = (header: ReturnType<typeof parsePlanHeader>): string | undefined =>
  header.roadmap?.replace(/\.md$/, '')

const parseType = (header: ReturnType<typeof parsePlanHeader>): PlanType | undefined =>
  header.type && AVAILABLE_TYPES.includes(header.type as PlanType) ? (header.type as PlanType) : undefined

export const parsePlan = (file: string, content: string, archive: boolean): Plan | null => {
  const match = file.match(PLAN_FILE_RE)
  if (!match) return null

  const status = content.match(PLAN_STATUS_RE)?.[1] as Status | undefined
  const priority = (content.match(PLAN_PRIORITY_RE)?.[1]?.toLowerCase() ?? 'medium') as Priority
  const effort = content.match(PLAN_EFFORT_RE)?.[1]?.toUpperCase() as Effort | undefined
  const title = content.match(TITLE_RE)?.[1]?.trim() ?? file
  const depends = content.match(PLAN_DEPENDS_RE)?.[1]
  const isCompleted: boolean = (status && COMPLETED_STATUSES.has(status)) || archive
  const header = parsePlanHeader(file, content)

  if (!status || !AVAILABLE_STATUSES.includes(status))
    throw new Error('Invalid or missing Status in ' + file)
  if ((!priority || !(priority in PRIORITY_WEIGHTS)) && !isCompleted)
    throw new Error('Invalid or missing Priority in ' + file)
  if ((!effort || !(effort in EFFORT_PENALTIES)) && !isCompleted)
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
    type: parseType(header),
    roadmap: parseRoadmap(header),
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

export const buildDependents = (byId: Map<string, Plan>): Map<string, Set<string>> => {
  const result = new Map<string, Set<string>>()
  for (const id of byId.keys()) result.set(id, new Set())

  for (const plan of byId.values()) {
    for (const dependency of plan.dependencies)
      result.get(dependency)?.add(plan.id)
  }

  return result
}

export const countTransitiveDependents = (
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

export const depthOf = (
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

/** Preserves the original execution-order score verbatim: priority + direct*4 + transitive*10 + depth*2 - effort. */
export const score = (
  plan: Plan,
  byId: Map<string, Plan>,
  dependents: Map<string, Set<string>>,
): number => {
  const direct = dependents.get(plan.id)?.size ?? 0
  const transitive = countTransitiveDependents(plan.id, dependents)

  return (
    PRIORITY_WEIGHTS[plan.priority] +
    direct * 4 +
    transitive * 10 +
    depthOf(plan.id, byId) * 2 -
    EFFORT_PENALTIES[plan.effort]
  )
}

export const ready = (
  plan: Plan,
  completed: Set<string>,
  byId: Map<string, Plan>,
): boolean =>
  plan.dependencies.every(dep =>
    completed.has(dep) || COMPLETED.has(byId.get(dep)?.status ?? 'planned'),
  )

/** Builds the shared metric object every Top 5 profile ranks on top of. Computed once per plan, not per profile. */
export const buildMetrics = (
  plans: Plan[],
  byId: Map<string, Plan>,
  dependents: Map<string, Set<string>>,
): Map<string, PlanMetrics> => {
  const metrics = new Map<string, PlanMetrics>()

  for (const plan of plans) {
    const direct = dependents.get(plan.id)?.size ?? 0

    metrics.set(plan.id, {
      priorityWeight: PRIORITY_WEIGHTS[plan.priority],
      effortPenalty: EFFORT_PENALTIES[plan.effort],
      direct,
      transitive: countTransitiveDependents(plan.id, dependents),
      depth: depthOf(plan.id, byId),
      ready: ready(plan, new Set(), byId),
      overallScore: score(plan, byId, dependents),
    })
  }

  return metrics
}

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

// --- Top 5 perspectives -----------------------------------------------------
//
// A modest, additive bonus over the shared `overallScore` — small enough to
// never override a real priority-tier or unlock-count difference, just to
// break ties in favour of the perspective's focus.
const ROADMAP_BONUS = 8
const READY_BONUS = 5

type Reason = (plan: Plan, metrics: PlanMetrics) => string

const baseReason: Reason = (plan, metrics) =>
  [
    getPriorityLabel(plan.priority) + ' ' + plan.effort,
    metrics.ready ? 'ready' : 'blocked',
    `unlocks ${metrics.direct}/${metrics.transitive}`,
  ].join(' · ')

export type Profile = {
  heading: string
  qualifies: (plan: Plan, metrics: PlanMetrics) => boolean
  rank: (plan: Plan, metrics: PlanMetrics) => number
  reason: Reason
  limit: number
}

export const PROFILES: Profile[] = [
  {
    heading: 'Overall',
    qualifies: plan => plan.status === 'planned',
    rank: (_plan, metrics) => metrics.overallScore,
    reason: baseReason,
    limit: 5,
  },
  {
    heading: 'Roadmap Focus',
    qualifies: plan => plan.status === 'planned',
    rank: (plan, metrics) => metrics.overallScore + (plan.roadmap ? ROADMAP_BONUS : 0),
    reason: (plan, metrics) =>
      [baseReason(plan, metrics), plan.roadmap ? `roadmap: ${plan.roadmap}` : 'no roadmap'].join(' · '),
    limit: 5,
  },
  {
    heading: 'Bug Fixes',
    qualifies: plan => plan.status === 'planned' && (plan.type === 'bug' || plan.type === 'fix'),
    rank: (_plan, metrics) => metrics.overallScore + (metrics.ready ? READY_BONUS : 0),
    reason: (plan, metrics) => [baseReason(plan, metrics), `type: ${plan.type}`].join(' · '),
    limit: 5,
  },
  {
    heading: 'Polish',
    qualifies: plan => plan.status === 'planned' && plan.type === 'polish',
    rank: (_plan, metrics) => metrics.overallScore + (metrics.ready ? READY_BONUS : 0),
    reason: baseReason,
    limit: 5,
  },
  {
    heading: 'Ready Now',
    qualifies: (plan, metrics) => plan.status === 'planned' && metrics.ready,
    rank: (_plan, metrics) => metrics.overallScore,
    reason: baseReason,
    limit: 5,
  },
]

export const rankProfile = (
  profile: Profile,
  plans: Plan[],
  metrics: Map<string, PlanMetrics>,
): Plan[] =>
  plans
    .filter(plan => profile.qualifies(plan, metrics.get(plan.id)!))
    .sort((a, b) =>
      profile.rank(b, metrics.get(b.id)!) - profile.rank(a, metrics.get(a.id)!) ||
      a.id.localeCompare(b.id),
    )
    .slice(0, profile.limit)

const renderTop5 = (plans: Plan[], metrics: Map<string, PlanMetrics>): string[] => {
  const output: string[] = []

  output.push('## Top 5')
  output.push('')

  for (const profile of PROFILES) {
    output.push(`### ${profile.heading}`)
    output.push('')

    const ranked = rankProfile(profile, plans, metrics)

    if (!ranked.length) {
      output.push('_No qualifying plans._')
      output.push('')
      output.push('---')
      output.push('')
      continue
    }

    ranked.forEach((plan, index) => {
      const m = metrics.get(plan.id)!
      output.push(`${index + 1}. \`${plan.id}\` — **${plan.title}**  `)
      output.push(`   ${profile.reason(plan, m)}`)
    })

    output.push('')
    output.push('---')
    output.push('')
  }

  return output
}

// --- Mermaid dependency graph ------------------------------------------------

const toNodeId = (id: string): string => id.replaceAll('-', '_')

export const escapeMermaidLabel = (label: string): string =>
  label
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, ' ')

const nodeLabel = (id: string, byId: Map<string, Plan>): string => {
  const plan = byId.get(id)
  return escapeMermaidLabel(plan ? `${id} — ${plan.title}` : id)
}

const renderDependencyGraph = (plans: Plan[], byId: Map<string, Plan>): string[] => {
  const output: string[] = []

  const nodeIds = new Set<string>()
  for (const plan of plans) {
    nodeIds.add(plan.id)
    for (const dep of plan.dependencies) nodeIds.add(dep)
  }

  const edges: Array<[string, string]> = []
  for (const plan of plans) {
    for (const dep of plan.dependencies) edges.push([dep, plan.id])
  }
  edges.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))

  output.push('## Dependency Graph')
  output.push('')
  output.push('Planned plans and their dependencies.')
  output.push('')
  output.push('\x60\x60\x60mermaid')
  output.push('graph TD')

  for (const id of [...nodeIds].sort((a, b) => a.localeCompare(b))) {
    output.push(`  ${toNodeId(id)}["${nodeLabel(id, byId)}"]`)
  }

  for (const [from, to] of edges) {
    output.push(`  ${toNodeId(from)} --> ${toNodeId(to)}`)
  }

  output.push('\x60\x60\x60')

  return output
}

// --- Document assembly -------------------------------------------------------

const main = async (): Promise<void> => {
  const { plans, byId } = await loadPlans()
  validateDependencies(plans, byId)

  const dependents = buildDependents(byId)
  const metrics = buildMetrics(plans, byId, dependents)
  const order = recommend(plans, byId, dependents)
  const output: string[] = []

  output.push('# Plan Recommendations')
  output.push('')

  output.push(...renderTop5(plans, metrics))

  output.push('## How to read this')
  output.push('')
  output.push(
    'The Top 5 sections above are independent perspectives on the same plan set — ' +
    'each answers "what is worth looking at now" from a different angle. They are ' +
    'not alternative execution orders and may overlap or disagree with each other.',
  )
  output.push('')
  output.push(
    'The Recommended Execution Order below is the single dependency-aware schedule: ' +
    'it is the order in which `planned` plans can actually be implemented, respecting ' +
    'prerequisites. Use the Top 5 to decide what to prioritize; use the execution order ' +
    'to see what is unblocked next.',
  )
  output.push('')

  output.push('---')
  output.push('')
  output.push('## Recommended Execution Order')
  output.push('')
  output.push('Only planned plans are ranked.  ')
  output.push('done / verification needed satisfy dependencies.  ')
  output.push('Score = priority + direct unlocks + transitive unlocks + depth - effort.')
  output.push('')

  order.forEach((plan, index) => {
    const m = metrics.get(plan.id)!

    output.push(
      String(index + 1) +
      '. ' + `\`${plan.id}\` — **${plan.title}**  \n` +

      ''.padStart(2) + getPriorityLabel(plan.priority) + ' ' + plan.effort + ' · ' +
      '**Score:** ' + String(m.overallScore).padStart(3) + '  \n' +

      ''.padStart(2) + ' → **unlocks:** ' + m.direct + '/' + m.transitive,
    )
    output.push('')
  })

  const initiallyReady = new Set(
    plans
      .filter(plan => plan.status === 'planned' && ready(plan, new Set(), byId))
      .map(plan => plan.id),
  )

  output.push('---')
  output.push('')
  output.push('## Initially Blocked')
  output.push('')

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
  output.push('---')
  output.push('')

  output.push(...renderDependencyGraph(plans, byId))

  await writeFile(PLANS_RECOMMENDED_ORDER_PATH, output.join('\n') + '\n', 'utf8')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

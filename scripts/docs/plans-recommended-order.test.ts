import { describe, expect, it } from 'vitest'
import {
  buildDependents,
  buildMetrics,
  escapeMermaidLabel,
  parseDependencies,
  type Plan,
  PROFILES,
  rankProfile,
  ready,
  score,
} from './plans-recommended-order.js'

const plan = (overrides: Partial<Plan> & Pick<Plan, 'id'>): Plan => ({
  file: `${overrides.id}.md`,
  title: overrides.id,
  status: 'planned',
  priority: 'medium',
  effort: 'M',
  dependencies: [],
  ...overrides,
})

describe('parseDependencies', () => {
  it('treats "-" and "none" as no dependencies', () => {
    expect(parseDependencies('-')).toEqual([])
    expect(parseDependencies('none')).toEqual([])
  })

  it('strips strikethrough and backtick wrapping from tokens', () => {
    expect(parseDependencies('~~001~~ `002`')).toEqual(['001', '002'])
  })
})

describe('escapeMermaidLabel', () => {
  it('escapes quotes, backslashes and newlines', () => {
    expect(escapeMermaidLabel('a "quoted" \\ title\nsecond line')).toBe(
      'a &quot;quoted&quot; \\\\ title second line',
    )
  })
})

describe('ready', () => {
  it('is true when every dependency is completed or already in the completed set', () => {
    const byId = new Map<string, Plan>([
      ['a', plan({ id: 'a', status: 'done' })],
      ['b', plan({ id: 'b', dependencies: ['a'] })],
    ])

    expect(ready(byId.get('b')!, new Set(), byId)).toBe(true)
  })

  it('is false when a dependency is still planned and not yet completed', () => {
    const byId = new Map<string, Plan>([
      ['a', plan({ id: 'a', status: 'planned' })],
      ['b', plan({ id: 'b', dependencies: ['a'] })],
    ])

    expect(ready(byId.get('b')!, new Set(), byId)).toBe(false)
    expect(ready(byId.get('b')!, new Set(['a']), byId)).toBe(true)
  })
})

describe('score', () => {
  it('matches the preserved execution-order formula', () => {
    const a = plan({ id: 'a', priority: 'high', effort: 'L', dependencies: [] })
    const b = plan({ id: 'b', dependencies: ['a'] })
    const byId = new Map([['a', a], ['b', b]])
    const dependents = buildDependents(byId)

    // priority(30) + direct(1)*4 + transitive(1)*10 + depth(0)*2 - effort(6)
    expect(score(a, byId, dependents)).toBe(30 + 4 + 10 + 0 - 6)
  })
})

describe('rankProfile qualification', () => {
  const plans: Plan[] = [
    plan({ id: 'bug-1', type: 'bug', priority: 'low' }),
    plan({ id: 'fix-1', type: 'fix', priority: 'low' }),
    plan({ id: 'polish-1', type: 'polish', priority: 'low' }),
    plan({ id: 'feature-1', type: 'feature', priority: 'high' }),
    plan({ id: 'blocked-1', type: 'feature', priority: 'high', dependencies: ['feature-1'] }),
    plan({ id: 'done-1', status: 'done', type: 'bug', priority: 'high' }),
  ]
  const byId = new Map(plans.map(p => [p.id, p]))
  const dependents = buildDependents(byId)
  const metrics = buildMetrics(plans, byId, dependents)

  const profile = (heading: string) => PROFILES.find(p => p.heading === heading)!

  it('Bug Fixes only qualifies planned bug/fix plans', () => {
    const ranked = rankProfile(profile('Bug Fixes'), plans, metrics).map(p => p.id)
    expect(ranked.sort()).toEqual(['bug-1', 'fix-1'])
  })

  it('Polish only qualifies planned polish plans', () => {
    const ranked = rankProfile(profile('Polish'), plans, metrics).map(p => p.id)
    expect(ranked).toEqual(['polish-1'])
  })

  it('Ready Now excludes blocked planned plans', () => {
    const ranked = rankProfile(profile('Ready Now'), plans, metrics).map(p => p.id)
    expect(ranked).not.toContain('blocked-1')
    expect(ranked).toContain('feature-1')
  })

  it('no profile ever surfaces a completed plan', () => {
    for (const p of PROFILES) {
      const ranked = rankProfile(p, plans, metrics).map(r => r.id)
      expect(ranked).not.toContain('done-1')
    }
  })

  it('breaks ties deterministically by id', () => {
    const tied = [plan({ id: 'z-tied' }), plan({ id: 'a-tied' })]
    const tiedById = new Map(tied.map(p => [p.id, p]))
    const tiedDependents = buildDependents(tiedById)
    const tiedMetrics = buildMetrics(tied, tiedById, tiedDependents)

    const ranked = rankProfile(profile('Overall'), tied, tiedMetrics).map(p => p.id)
    expect(ranked).toEqual(['a-tied', 'z-tied'])
  })
})

import { describe, expect, it } from 'vitest'
import type { AnimalKind } from './animalDefs'
import type { PreySpawner } from './AnimalSpawner'
import { depletionThreshold } from './AnimalSpawner'
import {
  HABITAT_FOOD_PRESSURE_RADIUS,
  HABITAT_FOOD_SUFFICIENT_COUNT,
  HABITAT_PREDATOR_PRESSURE_FULL_COUNT,
  HABITAT_PREDATOR_PRESSURE_RADIUS,
  HABITAT_PRESSURE_CRITICAL_AT,
  HABITAT_PRESSURE_STRAINED_AT,
  HABITAT_PRESSURE_TTL_DAYS,
  type HabitatPressureScanAgent,
  isHabitatPressureCacheFresh,
  resolveHabitatPressure,
  scanHabitatPressureAgents,
  scoreHabitatPressure,
} from './habitatPressure'

function score(overrides: Partial<Parameters<typeof scoreHabitatPressure>[0]> = {}) {
  return scoreHabitatPressure({
    habitatId: 'home:thicket',
    kind: 'deer',
    state: 'active',
    live: 3,
    capacity: 3,
    deathsThisCycle: 0,
    mortalityThreshold: depletionThreshold(3),
    nearbyPredators: 0,
    forageAvailable: HABITAT_FOOD_SUFFICIENT_COUNT,
    ...overrides,
  })
}

function spawner(overrides: Partial<PreySpawner> = {}): PreySpawner {
  return {
    id: 'home:thicket',
    x: 0,
    z: 0,
    type: 'thicket',
    kind: 'deer',
    respawnIntervalDays: 1,
    maxPreyCount: 3,
    daysSinceLastRespawn: 0,
    state: 'active',
    deathsThisCycle: 0,
    disabledAtDay: null,
    pressure: 0,
    humanTaste: false,
    canRecover: true,
    lastSettlementTripOpportunityDay: null,
    ...overrides,
  }
}

function agent(overrides: {
  kind?: AnimalKind
  spawnPointId?: string
  dead?: boolean
  x?: number
  z?: number
} = {}): HabitatPressureScanAgent {
  const kind = overrides.kind ?? 'deer'
  return {
    isDead: () => overrides.dead === true,
    spawnPointId: overrides.spawnPointId,
    def: { kind },
    mesh: { position: { x: overrides.x ?? 0, z: overrides.z ?? 0 } },
  }
}

describe('scoreHabitatPressure', () => {
  it('returns healthy with no dominant pressure when every signal is calm', () => {
    const snapshot = score()
    expect(snapshot.condition).toBe('healthy')
    expect(snapshot.dominantPressure).toBeNull()
    expect(snapshot.population.pressure).toBe(0)
    expect(snapshot.population.ratio).toBe(1)
    expect(snapshot.mortality.pressure).toBe(0)
    expect(snapshot.predators.pressure).toBe(0)
    expect(snapshot.food.pressure).toBe(0)
  })

  it('raises population pressure as live count falls below ordinary capacity', () => {
    const empty = score({ live: 0, capacity: 4 })
    expect(empty.population.live).toBe(0)
    expect(empty.population.capacity).toBe(4)
    expect(empty.population.ratio).toBe(0)
    expect(empty.population.pressure).toBe(1)
    expect(empty.condition).toBe('critical')
    expect(empty.dominantPressure).toBe('population-loss')
  })

  it('does not treat a reserved-full (zero-capacity) habitat as empty', () => {
    const reserved = score({ live: 0, capacity: 0 })
    expect(reserved.population.pressure).toBe(0)
    expect(reserved.population.ratio).toBe(1)
    expect(reserved.condition).toBe('healthy')
    expect(reserved.dominantPressure).toBeNull()
  })

  it('normalizes mortality against the depletion threshold', () => {
    const threshold = depletionThreshold(3)
    const half = score({ deathsThisCycle: threshold, live: 3, capacity: 3 })
    expect(half.mortality.threshold).toBe(threshold)
    expect(half.mortality.pressure).toBe(1)
    expect(half.dominantPressure).toBe('mortality')
    expect(half.condition).toBe('critical')
  })

  it('lets predator pressure dominate when other signals are healthy', () => {
    const snapshot = score({
      nearbyPredators: HABITAT_PREDATOR_PRESSURE_FULL_COUNT,
    })
    expect(snapshot.predators.nearby).toBe(HABITAT_PREDATOR_PRESSURE_FULL_COUNT)
    expect(snapshot.predators.pressure).toBe(1)
    expect(snapshot.population.pressure).toBe(0)
    expect(snapshot.mortality.pressure).toBe(0)
    expect(snapshot.food.pressure).toBe(0)
    expect(snapshot.dominantPressure).toBe('predators')
    expect(snapshot.condition).toBe('critical')
  })

  it('lets food shortage dominate when forage is absent', () => {
    const snapshot = score({ forageAvailable: 0 })
    expect(snapshot.food.available).toBe(0)
    expect(snapshot.food.pressure).toBe(1)
    expect(snapshot.dominantPressure).toBe('food-shortage')
    expect(snapshot.condition).toBe('critical')
  })

  it('treats missing/not-applicable forage as neutral, not a shortage', () => {
    const snapshot = score({ forageAvailable: null })
    expect(snapshot.food.available).toBe(0)
    expect(snapshot.food.pressure).toBe(0)
    expect(snapshot.condition).toBe('healthy')
    expect(snapshot.dominantPressure).toBeNull()
  })

  it('strengthens condition for depleted/recovering without rewriting components', () => {
    const depleted = score({
      state: 'depleted',
      live: 3,
      capacity: 3,
      forageAvailable: null,
    })
    expect(depleted.population.pressure).toBe(0)
    expect(depleted.mortality.pressure).toBe(0)
    expect(depleted.condition).toBe('critical')
    expect(depleted.dominantPressure).toBeNull()

    const recovering = score({
      state: 'recovering',
      live: 3,
      capacity: 3,
      forageAvailable: null,
    })
    expect(recovering.population.pressure).toBe(0)
    expect(recovering.condition).toBe('strained')
    expect(recovering.dominantPressure).toBeNull()
  })

  it('breaks equal component pressures by a fixed kind order', () => {
    const tied = score({
      live: 0,
      capacity: 3,
      deathsThisCycle: depletionThreshold(3),
      nearbyPredators: HABITAT_PREDATOR_PRESSURE_FULL_COUNT,
      forageAvailable: 0,
    })
    expect(tied.population.pressure).toBe(1)
    expect(tied.mortality.pressure).toBe(1)
    expect(tied.predators.pressure).toBe(1)
    expect(tied.food.pressure).toBe(1)
    expect(tied.dominantPressure).toBe('mortality')
  })

  it('uses strained/critical cutoffs on the strongest component', () => {
    const strained = score({
      live: 13,
      capacity: 20,
      forageAvailable: null,
    })
    expect(strained.population.pressure).toBeCloseTo(HABITAT_PRESSURE_STRAINED_AT)
    expect(strained.condition).toBe('strained')
    expect(strained.dominantPressure).toBe('population-loss')

    const critical = score({
      live: 3,
      capacity: 10,
      forageAvailable: null,
    })
    expect(critical.population.pressure).toBeCloseTo(HABITAT_PRESSURE_CRITICAL_AT)
    expect(critical.condition).toBe('critical')
  })
})

describe('scanHabitatPressureAgents', () => {
  it('counts only live members of this spawnPointId and kind', () => {
    const counts = scanHabitatPressureAgents(
      [
        agent({ spawnPointId: 'home:thicket', kind: 'deer' }),
        agent({ spawnPointId: 'home:thicket', kind: 'deer', dead: true }),
        agent({ spawnPointId: 'other:thicket', kind: 'deer' }),
        agent({ spawnPointId: 'home:thicket', kind: 'stag' }),
        agent({ kind: 'deer', x: 1, z: 0 }),
      ],
      'home:thicket',
      'deer',
      0,
      0,
    )
    expect(counts.live).toBe(1)
    expect(counts.nearbyPredators).toBe(0)
  })

  it('counts live predators inside the X/Z radius and ignores own-habitat predators', () => {
    const inside = HABITAT_PREDATOR_PRESSURE_RADIUS
    const outside = HABITAT_PREDATOR_PRESSURE_RADIUS + 1
    const counts = scanHabitatPressureAgents(
      [
        agent({ kind: 'wolf', x: inside, z: 0 }),
        agent({ kind: 'wolf', x: outside, z: 0 }),
        agent({ kind: 'wolf', x: 0, z: 0, dead: true }),
        agent({ kind: 'bear', x: 0, z: inside }),
        agent({ kind: 'wolf', spawnPointId: 'home:thicket', x: 0, z: 0 }),
        agent({ kind: 'deer', spawnPointId: 'home:thicket', x: 0, z: 0 }),
      ],
      'home:thicket',
      'deer',
      0,
      0,
    )
    expect(counts.nearbyPredators).toBe(2)
    expect(counts.live).toBe(1)
  })
})

describe('isHabitatPressureCacheFresh', () => {
  it('is fresh inside the TTL and stale after it or when time moves backwards', () => {
    expect(isHabitatPressureCacheFresh(1, 1)).toBe(true)
    expect(isHabitatPressureCacheFresh(1, 1 + HABITAT_PRESSURE_TTL_DAYS / 2)).toBe(true)
    expect(isHabitatPressureCacheFresh(1, 1 + HABITAT_PRESSURE_TTL_DAYS)).toBe(false)
    expect(isHabitatPressureCacheFresh(2, 1)).toBe(false)
  })
})

describe('resolveHabitatPressure', () => {
  it('returns null for an unknown spawner without scanning or querying forage', () => {
    let agentWalks = 0
    let forageCalls = 0
    const agents = {
      *[Symbol.iterator](): IterableIterator<HabitatPressureScanAgent> {
        agentWalks++
        yield agent()
      },
    }
    const snapshot = resolveHabitatPressure({
      spawnerId: 'missing',
      nowDays: 3,
      cache: new Map(),
      getSpawner: () => undefined,
      agents,
      slotCountFor: () => 0,
      queryForage: () => {
        forageCalls++
        return []
      },
    })
    expect(snapshot).toBeNull()
    expect(agentWalks).toBe(0)
    expect(forageCalls).toBe(0)
  })

  it('scans agents once and queries forage once on an uncached grass-diet habitat', () => {
    let agentWalks = 0
    let forageCalls = 0
    const s = spawner()
    const agents = {
      *[Symbol.iterator](): IterableIterator<HabitatPressureScanAgent> {
        agentWalks++
        yield agent({ spawnPointId: s.id, kind: 'deer' })
        yield agent({ spawnPointId: s.id, kind: 'deer' })
        yield agent({ kind: 'wolf', x: 4, z: 0 })
      },
    }
    const snapshot = resolveHabitatPressure({
      spawnerId: s.id,
      nowDays: 4,
      cache: new Map(),
      getSpawner: (id) => (id === s.id ? s : undefined),
      agents,
      slotCountFor: () => 0,
      queryForage: (x, z, radius, nowDays) => {
        forageCalls++
        expect(x).toBe(s.x)
        expect(z).toBe(s.z)
        expect(radius).toBe(HABITAT_FOOD_PRESSURE_RADIUS)
        expect(nowDays).toBe(4)
        return { length: HABITAT_FOOD_SUFFICIENT_COUNT }
      },
    })
    expect(snapshot).not.toBeNull()
    expect(agentWalks).toBe(1)
    expect(forageCalls).toBe(1)
    expect(snapshot?.population.live).toBe(2)
    expect(snapshot?.population.capacity).toBe(3)
    expect(snapshot?.predators.nearby).toBe(1)
    expect(snapshot?.food.available).toBe(HABITAT_FOOD_SUFFICIENT_COUNT)
    expect(snapshot?.food.pressure).toBe(0)
  })

  it('reuses the cached snapshot inside the TTL without a forage query', () => {
    const s = spawner()
    const cache = new Map()
    let forageCalls = 0
    let agentWalks = 0
    const agents = {
      *[Symbol.iterator](): IterableIterator<HabitatPressureScanAgent> {
        agentWalks++
        yield agent({ spawnPointId: s.id })
      },
    }
    const args = {
      spawnerId: s.id,
      cache,
      getSpawner: (id: string) => (id === s.id ? s : undefined),
      agents,
      slotCountFor: () => 0,
      queryForage: () => {
        forageCalls++
        return { length: 1 }
      },
    }
    const first = resolveHabitatPressure({ ...args, nowDays: 10 })
    const second = resolveHabitatPressure({
      ...args,
      nowDays: 10 + HABITAT_PRESSURE_TTL_DAYS / 2,
    })
    expect(second).toBe(first)
    expect(forageCalls).toBe(1)
    expect(agentWalks).toBe(1)
  })

  it('recomputes after the TTL', () => {
    const s = spawner()
    const cache = new Map()
    let forageCalls = 0
    const args = {
      spawnerId: s.id,
      cache,
      getSpawner: (id: string) => (id === s.id ? s : undefined),
      agents: [agent({ spawnPointId: s.id })],
      slotCountFor: () => 0,
      queryForage: () => {
        forageCalls++
        return { length: forageCalls }
      },
    }
    const first = resolveHabitatPressure({ ...args, nowDays: 10 })
    const second = resolveHabitatPressure({
      ...args,
      nowDays: 10 + HABITAT_PRESSURE_TTL_DAYS + 1e-6,
    })
    expect(second).not.toBe(first)
    expect(first?.food.available).toBe(1)
    expect(second?.food.available).toBe(2)
    expect(forageCalls).toBe(2)
  })

  it('does not query forage for a species without a grass diet', () => {
    const s = spawner({ kind: 'wolf', type: 'wolfDen', id: 'home:wolfDen' })
    let forageCalls = 0
    const snapshot = resolveHabitatPressure({
      spawnerId: s.id,
      nowDays: 1,
      cache: new Map(),
      getSpawner: () => s,
      agents: [agent({ kind: 'wolf', spawnPointId: s.id })],
      slotCountFor: () => 0,
      queryForage: () => {
        forageCalls++
        return []
      },
    })
    expect(forageCalls).toBe(0)
    expect(snapshot?.food.pressure).toBe(0)
    expect(snapshot?.food.available).toBe(0)
    expect(snapshot?.kind).toBe('wolf')
  })

  it('treats a missing forage service as neutral food, not a shortage', () => {
    const s = spawner()
    const snapshot = resolveHabitatPressure({
      spawnerId: s.id,
      nowDays: 1,
      cache: new Map(),
      getSpawner: () => s,
      agents: [],
      slotCountFor: () => 0,
    })
    expect(snapshot?.food.pressure).toBe(0)
    expect(snapshot?.dominantPressure).not.toBe('food-shortage')
  })

  it('uses ordinary capacity minus reserved persistent slots', () => {
    const s = spawner({ maxPreyCount: 4 })
    const snapshot = resolveHabitatPressure({
      spawnerId: s.id,
      nowDays: 1,
      cache: new Map(),
      getSpawner: () => s,
      agents: [agent({ spawnPointId: s.id }), agent({ spawnPointId: s.id })],
      slotCountFor: () => 1,
    })
    expect(snapshot?.population.capacity).toBe(3)
    expect(snapshot?.population.live).toBe(2)
  })
})

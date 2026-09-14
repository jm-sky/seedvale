import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  advanceAnimalCorpse,
  buryCorpse,
  canHarvestMeatFrom,
  claimCorpseAsFood,
  claimCorpseForCleanup,
  CORPSE_BONES_ONSET_DAYS,
  CORPSE_REMOVE_DAYS,
  CORPSE_ROT_ONSET_DAYS,
  type CorpseHost,
  type CorpseNeighbour,
  corpsePhaseFromElapsed,
  corpseReadyToRemove,
  createAnimalCorpseState,
  disposeAnimalCorpse,
  harvestCorpseMeat,
  HARVESTED_REMAINS_LINGER_DAYS,
  hideLivingVisual,
  markCorpseFoodConsumed,
  releaseCorpseClaim,
  releaseCorpseCleanupClaim,
  rotFxRelevant,
} from './animalCorpse'

function makeHost(overrides: Partial<CorpseHost> = {}): CorpseHost {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial()
  const mesh = new THREE.Mesh(geometry, material)
  const scene = new THREE.Scene()
  scene.add(mesh)
  return {
    animalId: 'host-1',
    mesh,
    isCapsule: true,
    def: { kind: 'wolf', modelHeight: 0.95 },
    sampleHeight: () => 0,
    settleRootForRemains: () => { mesh.rotation.z = 0 },
    ...overrides,
  }
}

function makeNeighbour(overrides: Partial<CorpseNeighbour> = {}): CorpseNeighbour & { infected: boolean } {
  const state = { dead: false, rabid: false, infected: false }
  return {
    animalId: 'neighbour-1',
    mesh: { position: { x: 0, z: 0 } },
    life: { stamina: { current: 1, max: 1 } },
    isDead: () => state.dead,
    isRabid: () => state.rabid,
    infectWithRabies: () => { state.infected = true; state.rabid = true },
    get infected() { return state.infected },
    ...overrides,
  }
}

function tickCorpse(
  state: ReturnType<typeof createAnimalCorpseState>,
  host: CorpseHost,
  nowDays: number,
  extras: {
    dt?: number
    rabid?: boolean
    nearby?: readonly CorpseNeighbour[]
    observer?: THREE.Vector3
  } = {},
): void {
  advanceAnimalCorpse(
    state,
    host,
    extras.dt ?? 0,
    extras.rabid ?? false,
    extras.nearby ?? [],
    extras.observer ?? new THREE.Vector3(),
    nowDays,
  )
}

describe('corpsePhaseFromElapsed / advanceAnimalCorpse (plan fauna-029 — world-day phases)', () => {
  it('stays fresh until the rot-onset threshold, then rotting until bones-onset', () => {
    expect(corpsePhaseFromElapsed(0)).toBe('fresh')
    expect(corpsePhaseFromElapsed(CORPSE_ROT_ONSET_DAYS - 1e-9)).toBe('fresh')
    expect(corpsePhaseFromElapsed(CORPSE_ROT_ONSET_DAYS)).toBe('rotting')
    expect(corpsePhaseFromElapsed(CORPSE_BONES_ONSET_DAYS - 1e-9)).toBe('rotting')
    expect(corpsePhaseFromElapsed(CORPSE_BONES_ONSET_DAYS)).toBe('bones')
  })

  it('advances state.phase as elapsed world-days cross each threshold', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.deathAtDays = 0
    tickCorpse(state, host, CORPSE_ROT_ONSET_DAYS - 1e-9)
    expect(state.phase).toBe('fresh')
    tickCorpse(state, host, CORPSE_ROT_ONSET_DAYS)
    expect(state.phase).toBe('rotting')
    tickCorpse(state, host, CORPSE_BONES_ONSET_DAYS)
    expect(state.phase).toBe('bones')
  })

  it('never advances once meatHarvested or buried', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.deathAtDays = 0
    state.meatHarvested = true
    tickCorpse(state, host, CORPSE_BONES_ONSET_DAYS + 1)
    expect(state.phase).toBe('fresh')

    const buriedState = createAnimalCorpseState()
    buriedState.deathAtDays = 0
    buriedState.buried = true
    tickCorpse(buriedState, host, CORPSE_BONES_ONSET_DAYS + 1)
    expect(buriedState.phase).toBe('fresh')
  })

  it('hides the living visual exactly once, on the bones transition', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    const materialOf = () => (host.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial
    state.deathAtDays = 0
    tickCorpse(state, host, CORPSE_ROT_ONSET_DAYS)
    // Still rotting, not bones yet — `onCorpsePhaseChanged`'s rotting branch
    // only tints (clones+replaces the material), never hides.
    expect(materialOf().visible).toBe(true)
    tickCorpse(state, host, CORPSE_BONES_ONSET_DAYS)
    expect(materialOf().visible).toBe(false)
    // Re-running further ticks at the same (or later) phase must not toggle
    // it back or otherwise re-trigger the hide.
    materialOf().visible = true
    tickCorpse(state, host, CORPSE_BONES_ONSET_DAYS + 1)
    expect(materialOf().visible).toBe(true)
  })

  it('uprights a tipped corpse root when natural bones attach (plan fauna-029)', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    host.mesh.rotation.z = Math.PI / 2
    let settled = false
    host.settleRootForRemains = () => {
      host.mesh.rotation.z = 0
      settled = true
    }
    state.deathAtDays = 0
    tickCorpse(state, host, CORPSE_BONES_ONSET_DAYS)
    expect(state.phase).toBe('bones')
    expect(settled).toBe(true)
    expect(host.mesh.rotation.z).toBe(0)
  })
})

describe('buryCorpse (plan 188 — burial permanently stops decay)', () => {
  it('marks buried without hacking a linger timer (plan fauna-029)', () => {
    const state = createAnimalCorpseState()
    buryCorpse(state)
    expect(state.buried).toBe(true)
    expect(state.deathAtDays).toBeNull()
  })

  it('a buried corpse never later decays into bones, even ticked far past onset', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    buryCorpse(state)
    tickCorpse(state, host, CORPSE_BONES_ONSET_DAYS + 10)
    expect(state.phase).toBe('fresh')
  })
})

describe('canHarvestMeatFrom / harvestCorpseMeat (plan 188 follow-up — meat only from fresh corpses)', () => {
  it('allows harvest only while dead, fresh, unharvested and unburied', () => {
    const base = { dead: true, meatHarvested: false, buried: false, corpsePhase: 'fresh' as const }
    expect(canHarvestMeatFrom(base)).toBe(true)
    expect(canHarvestMeatFrom({ ...base, dead: false })).toBe(false)
    expect(canHarvestMeatFrom({ ...base, meatHarvested: true })).toBe(false)
    expect(canHarvestMeatFrom({ ...base, buried: true })).toBe(false)
    expect(canHarvestMeatFrom({ ...base, corpsePhase: 'rotting' })).toBe(false)
    expect(canHarvestMeatFrom({ ...base, corpsePhase: 'bones' })).toBe(false)
  })

  it('harvestCorpseMeat marks meatHarvested, resets phase to fresh and hides the living visual', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    const material = (host.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial
    state.deathAtDays = 0
    state.phase = 'rotting'
    harvestCorpseMeat(state, host, 3)
    expect(state.meatHarvested).toBe(true)
    expect(state.harvestedAtDays).toBe(3)
    expect(state.phase).toBe('fresh')
    expect(material.visible).toBe(false)
  })
})

describe('corpseReadyToRemove (plan fauna-029 — harvested vs. natural linger)', () => {
  it('uses the harvested-remains world-time linger once meat is harvested', () => {
    const state = createAnimalCorpseState()
    state.meatHarvested = true
    state.harvestedAtDays = 0
    expect(corpseReadyToRemove(state, true, HARVESTED_REMAINS_LINGER_DAYS - 1e-9)).toBe(false)
    expect(corpseReadyToRemove(state, true, HARVESTED_REMAINS_LINGER_DAYS)).toBe(true)
  })

  it('uses the natural-corpse world-time linger otherwise', () => {
    const state = createAnimalCorpseState()
    state.deathAtDays = 0
    expect(corpseReadyToRemove(state, true, CORPSE_REMOVE_DAYS - 1e-9)).toBe(false)
    expect(corpseReadyToRemove(state, true, CORPSE_REMOVE_DAYS)).toBe(true)
  })

  it('never ready while held, regardless of linger elapsed', () => {
    const state = createAnimalCorpseState()
    state.deathAtDays = 0
    state.held = true
    expect(corpseReadyToRemove(state, true, CORPSE_REMOVE_DAYS + 10)).toBe(false)
  })

  it('never ready while the agent is still alive', () => {
    const state = createAnimalCorpseState()
    state.deathAtDays = 0
    expect(corpseReadyToRemove(state, false, CORPSE_REMOVE_DAYS + 10)).toBe(false)
  })

  it('a buried corpse is ready immediately unless held', () => {
    const state = createAnimalCorpseState()
    buryCorpse(state)
    expect(corpseReadyToRemove(state, true, 0)).toBe(true)
  })
})

describe('rotFxRelevant (plan 188 — presentation is distance-gated, lifecycle is not)', () => {
  it('is only relevant while rotting and within FX range', () => {
    expect(rotFxRelevant('rotting', 5)).toBe(true)
    expect(rotFxRelevant('fresh', 5)).toBe(false)
    expect(rotFxRelevant('bones', 5)).toBe(false)
    expect(rotFxRelevant('rotting', 1000)).toBe(false)
  })
})

describe('rot influence (plan 188 §4 — bounded stamina drain on nearby live fauna)', () => {
  it('drains stamina only within CORPSE_ROT_INFLUENCE_RADIUS while rotting', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.deathAtDays = 0
    const near = makeNeighbour({ animalId: 'near', mesh: { position: { x: 1, z: 0 } } })
    const far = makeNeighbour({ animalId: 'far', mesh: { position: { x: 100, z: 0 } } })
    tickCorpse(state, host, CORPSE_ROT_ONSET_DAYS, { dt: 1, nearby: [near, far] })
    expect(near.life.stamina.current).toBeLessThan(1)
    expect(far.life.stamina.current).toBe(1)
  })

  it('does not drain a dead neighbour', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.deathAtDays = 0
    const deadNeighbour = makeNeighbour({ animalId: 'dead', mesh: { position: { x: 1, z: 0 } }, isDead: () => true })
    tickCorpse(state, host, CORPSE_ROT_ONSET_DAYS, { dt: 1, nearby: [deadNeighbour] })
    expect(deadNeighbour.life.stamina.current).toBe(1)
  })

  it('never drains while still fresh', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.deathAtDays = 0
    const near = makeNeighbour({ mesh: { position: { x: 1, z: 0 } } })
    tickCorpse(state, host, CORPSE_ROT_ONSET_DAYS - 1e-9, { dt: 1, nearby: [near] })
    expect(near.life.stamina.current).toBe(1)
  })
})

describe('rabies corpse exposure (plan fauna-001 — at most one roll per pair)', () => {
  it('exposes a nearby live animal at most once, even across many ticks', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.deathAtDays = 0
    const neighbour = makeNeighbour({ mesh: { position: { x: 0.1, z: 0 } } })
    for (let i = 0; i < 10; i++) {
      tickCorpse(state, host, CORPSE_ROT_ONSET_DAYS, { dt: 1, rabid: true, nearby: [neighbour] })
    }
    expect(state.exposedAnimalIds.size).toBe(1)
  })

  it('never exposes anything while not rabid', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.deathAtDays = 0
    const neighbour = makeNeighbour({ mesh: { position: { x: 0.1, z: 0 } } })
    tickCorpse(state, host, CORPSE_ROT_ONSET_DAYS, { dt: 1, nearby: [neighbour] })
    expect(state.exposedAnimalIds.size).toBe(0)
  })

  it('never exposes an already-rabid neighbour', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.deathAtDays = 0
    const neighbour = makeNeighbour({ mesh: { position: { x: 0.1, z: 0 } }, isRabid: () => true })
    tickCorpse(state, host, CORPSE_ROT_ONSET_DAYS, { dt: 1, rabid: true, nearby: [neighbour] })
    expect(state.exposedAnimalIds.size).toBe(0)
  })

  it('never exposes an animal outside the contact radius', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.deathAtDays = 0
    const neighbour = makeNeighbour({ mesh: { position: { x: 5, z: 0 } } })
    tickCorpse(state, host, CORPSE_ROT_ONSET_DAYS, { dt: 1, rabid: true, nearby: [neighbour] })
    expect(state.exposedAnimalIds.size).toBe(0)
  })
})

describe('claimCorpseAsFood / releaseCorpseClaim / markCorpseFoodConsumed (plan 094/fauna-005)', () => {
  it('claim → consume → re-claimable once the corpse decays into a new phase', () => {
    const state = createAnimalCorpseState()
    const wolfA = {}
    const wolfB = {}
    expect(claimCorpseAsFood(state, wolfA)).toBe(true)
    // A second predator cannot claim the same still-unconsumed phase.
    expect(claimCorpseAsFood(state, wolfB)).toBe(false)
    markCorpseFoodConsumed(state, state.phase)
    // Consumed at this phase — neither predator can claim it again yet.
    expect(claimCorpseAsFood(state, wolfA)).toBe(false)
    expect(claimCorpseAsFood(state, wolfB)).toBe(false)
    // The corpse decays into a new phase — claimable again.
    state.phase = 'rotting'
    expect(claimCorpseAsFood(state, wolfB)).toBe(true)
  })

  it('releasing a claim held by someone else is a no-op', () => {
    const state = createAnimalCorpseState()
    const wolfA = {}
    const wolfB = {}
    claimCorpseAsFood(state, wolfA)
    releaseCorpseClaim(state, wolfB)
    expect(state.claimedBy).toBe(wolfA)
    releaseCorpseClaim(state, wolfA)
    expect(state.claimedBy).toBeNull()
  })

  it('the claim holder itself can always re-claim (idempotent)', () => {
    const state = createAnimalCorpseState()
    const wolfA = {}
    expect(claimCorpseAsFood(state, wolfA)).toBe(true)
    expect(claimCorpseAsFood(state, wolfA)).toBe(true)
  })
})

describe('sanitation cleanup reservation (plan settlements-npcs-029)', () => {
  it('allows only one sanitation claimant', () => {
    const state = createAnimalCorpseState()
    expect(claimCorpseForCleanup(state, 'npc-a')).toBe(true)
    expect(claimCorpseForCleanup(state, 'npc-b')).toBe(false)
    expect(claimCorpseForCleanup(state, 'npc-a')).toBe(true)
  })

  it('makes food claim and sanitation mutually exclusive', () => {
    const foodFirst = createAnimalCorpseState()
    expect(claimCorpseAsFood(foodFirst, {})).toBe(true)
    expect(claimCorpseForCleanup(foodFirst, 'npc-a')).toBe(false)

    const cleanupFirst = createAnimalCorpseState()
    expect(claimCorpseForCleanup(cleanupFirst, 'npc-a')).toBe(true)
    expect(claimCorpseAsFood(cleanupFirst, {})).toBe(false)
  })

  it('refuses a player-held corpse that is not already this NPC\'s claim', () => {
    const state = createAnimalCorpseState()
    state.held = true
    expect(claimCorpseForCleanup(state, 'npc-a')).toBe(false)
  })

  it('releases only the matching claimant', () => {
    const state = createAnimalCorpseState()
    claimCorpseForCleanup(state, 'npc-a')
    releaseCorpseCleanupClaim(state, 'npc-b')
    expect(state.cleanupClaimantNpcId).toBe('npc-a')
    releaseCorpseCleanupClaim(state, 'npc-a')
    expect(state.cleanupClaimantNpcId).toBeNull()
  })

  it('a held cleanup corpse is not ready to remove until hold is released', () => {
    const state = createAnimalCorpseState()
    claimCorpseForCleanup(state, 'npc-a')
    state.held = true
    state.deathAtDays = 0
    expect(corpseReadyToRemove(state, true, CORPSE_REMOVE_DAYS + 10)).toBe(false)
    state.held = false
    expect(corpseReadyToRemove(state, true, CORPSE_REMOVE_DAYS + 10)).toBe(true)
  })
})

describe('hideLivingVisual (capsule vs. GLB mesh)', () => {
  it('hides a capsule mesh by toggling its material visibility', () => {
    const host = makeHost({ isCapsule: true })
    hideLivingVisual(host)
    expect(((host.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial).visible).toBe(false)
  })

  it('hides GLB mesh children but leaves remains/label children alone', () => {
    const root = new THREE.Group()
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    root.add(bodyMesh)
    const remains = new THREE.Group()
    remains.name = 'harvested-remains'
    const remainsMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    remains.add(remainsMesh)
    root.add(remains)
    const host = makeHost({ isCapsule: false, mesh: root })
    hideLivingVisual(host)
    expect(bodyMesh.visible).toBe(false)
    expect(remainsMesh.visible).toBe(true)
  })
})

describe('disposeAnimalCorpse (dispose invalidates every in-flight token)', () => {
  it('bumps every async token so a late-resolving spawn is rejected as stale', () => {
    const state = createAnimalCorpseState()
    const before = {
      bloodSplatToken: state.bloodSplatToken,
      harvestedRemainsToken: state.harvestedRemainsToken,
      naturalRemainsToken: state.naturalRemainsToken,
    }
    disposeAnimalCorpse(state)
    expect(state.bloodSplatToken).toBe(before.bloodSplatToken + 1)
    expect(state.harvestedRemainsToken).toBe(before.harvestedRemainsToken + 1)
    expect(state.naturalRemainsToken).toBe(before.naturalRemainsToken + 1)
  })

  it('is safe to call on a state with nothing spawned yet', () => {
    const state = createAnimalCorpseState()
    expect(() => disposeAnimalCorpse(state)).not.toThrow()
  })
})

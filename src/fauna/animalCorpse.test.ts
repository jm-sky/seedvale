import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  advanceAnimalCorpse,
  buryCorpse,
  canHarvestMeatFrom,
  claimCorpseAsFood,
  type CorpseHost,
  type CorpseNeighbour,
  corpsePhaseFromElapsed,
  corpseReadyToRemove,
  createAnimalCorpseState,
  disposeAnimalCorpse,
  harvestCorpseMeat,
  hideLivingVisual,
  markCorpseFoodConsumed,
  releaseCorpseClaim,
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

describe('corpsePhaseFromElapsed / advanceAnimalCorpse (plan 188 — phase transitions)', () => {
  it('stays fresh until the rot-onset threshold, then rotting until bones-onset', () => {
    expect(corpsePhaseFromElapsed(19.9)).toBe('fresh')
    expect(corpsePhaseFromElapsed(20)).toBe('rotting')
    expect(corpsePhaseFromElapsed(39.9)).toBe('rotting')
    expect(corpsePhaseFromElapsed(40)).toBe('bones')
  })

  it('advances state.phase as timeSinceDeath crosses each threshold', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.timeSinceDeath = 19.9
    advanceAnimalCorpse(state, host, 0, false, [], new THREE.Vector3())
    expect(state.phase).toBe('fresh')
    state.timeSinceDeath = 20
    advanceAnimalCorpse(state, host, 0, false, [], new THREE.Vector3())
    expect(state.phase).toBe('rotting')
    state.timeSinceDeath = 40
    advanceAnimalCorpse(state, host, 0, false, [], new THREE.Vector3())
    expect(state.phase).toBe('bones')
  })

  it('never advances once meatHarvested or buried', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.timeSinceDeath = 100
    state.meatHarvested = true
    advanceAnimalCorpse(state, host, 0, false, [], new THREE.Vector3())
    expect(state.phase).toBe('fresh')

    const buriedState = createAnimalCorpseState()
    buriedState.timeSinceDeath = 100
    buriedState.buried = true
    advanceAnimalCorpse(buriedState, host, 0, false, [], new THREE.Vector3())
    expect(buriedState.phase).toBe('fresh')
  })

  it('hides the living visual exactly once, on the bones transition', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    const materialOf = () => (host.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial
    state.timeSinceDeath = 20
    advanceAnimalCorpse(state, host, 0, false, [], new THREE.Vector3())
    // Still rotting, not bones yet — `onCorpsePhaseChanged`'s rotting branch
    // only tints (clones+replaces the material), never hides.
    expect(materialOf().visible).toBe(true)
    state.timeSinceDeath = 40
    advanceAnimalCorpse(state, host, 0, false, [], new THREE.Vector3())
    expect(materialOf().visible).toBe(false)
    // Re-running further ticks at the same (or later) phase must not toggle
    // it back or otherwise re-trigger the hide.
    materialOf().visible = true
    state.timeSinceDeath = 50
    advanceAnimalCorpse(state, host, 0, false, [], new THREE.Vector3())
    expect(materialOf().visible).toBe(true)
  })
})

describe('buryCorpse (plan 188 — burial permanently stops decay)', () => {
  it('marks buried and jumps timeSinceDeath past every natural-decay threshold', () => {
    const state = createAnimalCorpseState()
    buryCorpse(state)
    expect(state.buried).toBe(true)
    expect(state.timeSinceDeath).toBeGreaterThan(40)
  })

  it('a buried corpse never later decays into bones, even ticked far past onset', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    buryCorpse(state)
    for (let i = 0; i < 5; i++) {
      state.timeSinceDeath += 1000
      advanceAnimalCorpse(state, host, 1, false, [], new THREE.Vector3())
    }
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
    state.timeSinceDeath = 25
    state.phase = 'rotting'
    harvestCorpseMeat(state, host)
    expect(state.meatHarvested).toBe(true)
    expect(state.timeSinceDeath).toBe(0)
    expect(state.phase).toBe('fresh')
    expect(material.visible).toBe(false)
  })
})

describe('corpseReadyToRemove (plan 137 — harvested vs. natural linger)', () => {
  it('uses the longer harvested-remains TTL once meat is harvested', () => {
    const state = createAnimalCorpseState()
    state.meatHarvested = true
    state.timeSinceDeath = 61
    expect(corpseReadyToRemove(state, true)).toBe(false)
    state.timeSinceDeath = 90
    expect(corpseReadyToRemove(state, true)).toBe(true)
  })

  it('uses the shorter natural-corpse TTL otherwise', () => {
    const state = createAnimalCorpseState()
    state.timeSinceDeath = 60
    expect(corpseReadyToRemove(state, true)).toBe(true)
  })

  it('never ready while held, regardless of linger elapsed', () => {
    const state = createAnimalCorpseState()
    state.timeSinceDeath = 1000
    state.held = true
    expect(corpseReadyToRemove(state, true)).toBe(false)
  })

  it('never ready while the agent is still alive', () => {
    const state = createAnimalCorpseState()
    state.timeSinceDeath = 1000
    expect(corpseReadyToRemove(state, false)).toBe(false)
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
    state.timeSinceDeath = 20 // rotting
    const near = makeNeighbour({ animalId: 'near', mesh: { position: { x: 1, z: 0 } } })
    const far = makeNeighbour({ animalId: 'far', mesh: { position: { x: 100, z: 0 } } })
    advanceAnimalCorpse(state, host, 1, false, [near, far], new THREE.Vector3())
    expect(near.life.stamina.current).toBeLessThan(1)
    expect(far.life.stamina.current).toBe(1)
  })

  it('does not drain a dead neighbour', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.timeSinceDeath = 20
    const deadNeighbour = makeNeighbour({ animalId: 'dead', mesh: { position: { x: 1, z: 0 } }, isDead: () => true })
    advanceAnimalCorpse(state, host, 1, false, [deadNeighbour], new THREE.Vector3())
    expect(deadNeighbour.life.stamina.current).toBe(1)
  })

  it('never drains while still fresh', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.timeSinceDeath = 5 // fresh
    const near = makeNeighbour({ mesh: { position: { x: 1, z: 0 } } })
    advanceAnimalCorpse(state, host, 1, false, [near], new THREE.Vector3())
    expect(near.life.stamina.current).toBe(1)
  })
})

describe('rabies corpse exposure (plan fauna-001 — at most one roll per pair)', () => {
  it('exposes a nearby live animal at most once, even across many ticks', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.timeSinceDeath = 20 // rotting
    const neighbour = makeNeighbour({ mesh: { position: { x: 0.1, z: 0 } } })
    for (let i = 0; i < 10; i++) {
      advanceAnimalCorpse(state, host, 1, true, [neighbour], new THREE.Vector3())
    }
    expect(state.exposedAnimalIds.size).toBe(1)
  })

  it('never exposes anything while not rabid', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.timeSinceDeath = 20
    const neighbour = makeNeighbour({ mesh: { position: { x: 0.1, z: 0 } } })
    advanceAnimalCorpse(state, host, 1, false, [neighbour], new THREE.Vector3())
    expect(state.exposedAnimalIds.size).toBe(0)
  })

  it('never exposes an already-rabid neighbour', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.timeSinceDeath = 20
    const neighbour = makeNeighbour({ mesh: { position: { x: 0.1, z: 0 } }, isRabid: () => true })
    advanceAnimalCorpse(state, host, 1, true, [neighbour], new THREE.Vector3())
    expect(state.exposedAnimalIds.size).toBe(0)
  })

  it('never exposes an animal outside the contact radius', () => {
    const state = createAnimalCorpseState()
    const host = makeHost()
    state.timeSinceDeath = 20
    const neighbour = makeNeighbour({ mesh: { position: { x: 5, z: 0 } } })
    advanceAnimalCorpse(state, host, 1, true, [neighbour], new THREE.Vector3())
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

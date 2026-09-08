// @vitest-environment jsdom
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { AnimalAgent, type AnimalAgentDeps } from './AnimalAgent'
import { ANIMAL_DEFS } from './animalDefs'

const sampleHeight = () => 0
const sampleLocalWater = () => DRY_WATER_SAMPLE
const collidersNear = () => []

/** Minimal `AnimalAgentDeps` — no `visual`/`animations`, so the constructor
 *  takes its capsule-mesh fallback path (no GLB, no scene) and stays
 *  reachable from a plain unit test (plan fauna-017 step 2/3, review §P10). */
function makeDeps(overrides: Partial<AnimalAgentDeps> = {}): AnimalAgentDeps {
  return {
    def: ANIMAL_DEFS.horse,
    animalId: 'test-animal',
    sampleHeight,
    waterLevel: -10,
    sampleLocalWater,
    collidersNear,
    x: 0,
    z: 0,
    ...overrides,
  }
}

describe('AnimalAgent', () => {
  it('constructs via the capsule fallback with AnimalAgentDeps', () => {
    const agent = new AnimalAgent(makeDeps())
    expect(agent.mesh).toBeTruthy()
    expect(agent.isDead()).toBe(false)
    expect(agent.def.kind).toBe('horse')
  })

  it('update() advances needs from a minimal AnimalUpdateContext and does not throw', () => {
    const agent = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'test-deer' }))
    agent.life.hunger = 0.5
    agent.life.thirst = 0.5
    expect(() => agent.update({
      dt: 1,
      others: [],
      observerPos: new THREE.Vector3(),
      dayFactor: 1,
      forestFactor: 0,
      litFires: [],
    })).not.toThrow()
    expect(agent.life.hunger).toBeGreaterThan(0.5)
    expect(agent.life.thirst).toBeGreaterThan(0.5)
  })

  // D1 (plan fauna-017 step 6b): a predator that dies while holding a
  // carcass claim used to lock that carcass unclaimed-but-inedible for its
  // entire linger, because `update()` early-returns for a dead agent and
  // `cancelSourceTarget()` (the only path that released the claim) was
  // never called from `collapse()`/`dispose()`.
  it('releases a held carcass claim when the claiming predator dies, so another predator can claim it', () => {
    const corpse = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.rabbit, animalId: 'corpse-rabbit', x: 2, z: 0 }))
    corpse.takeDamage(9999)
    expect(corpse.isDead()).toBe(true)

    const wolfA = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf-a', x: 0, z: 0 }))
    wolfA.life.hunger = 0.9 // elevated — routes into pursueNeeds -> findCarcassTarget
    // Observer (player) placed far away so `senseEnvironment` doesn't detect
    // it as active and divert the decision away from `predator-normal`.
    wolfA.update({
      dt: 1,
      others: [wolfA, corpse],
      observerPos: new THREE.Vector3(1000, 0, 1000),
      dayFactor: 1,
      forestFactor: 0,
      litFires: [],
    })
    // wolfA claimed the fresh corpse — a second predator cannot also claim it.
    expect(corpse.claimAsFood({})).toBe(false)

    wolfA.takeDamage(9999) // kill wolfA — collapse() must release its claim
    expect(wolfA.isDead()).toBe(true)

    expect(corpse.claimAsFood({})).toBe(true)
  })

  // D2 (plan fauna-017 step 3): `driveMounted()` used to always pass `{}`
  // (rate 1) to `tickAnimalLife`, so a ridden animal at night burned
  // hunger/thirst at 2x a free-roaming one's rate. Both callers now share
  // `tickPresentationAndLife()`, so the same night rate applies either way.
  it('applies the same night hunger/thirst rate whether mounted or free-roaming', () => {
    const free = new AnimalAgent(makeDeps({ animalId: 'free-horse' }))
    const mounted = new AnimalAgent(makeDeps({ animalId: 'mounted-horse' }))
    mounted.setMounted(true)
    free.life.hunger = 0.5
    free.life.thirst = 0.5
    mounted.life.hunger = 0.5
    mounted.life.thirst = 0.5

    const dt = 1
    const nightDayFactor = -1
    const observerPos = new THREE.Vector3()

    free.update({
      dt,
      others: [],
      observerPos,
      dayFactor: nightDayFactor,
      forestFactor: 0,
      litFires: [],
    })
    // Stationary (wishX/wishZ both 0) — isolates the needs-tick rate from
    // any position-dependent side effects (water/drowning) movement could add.
    mounted.driveMounted(dt, 0, 0, false, 1, nightDayFactor, observerPos)

    expect(mounted.life.hunger).toBeCloseTo(free.life.hunger, 10)
    expect(mounted.life.thirst).toBeCloseTo(free.life.thirst, 10)
    // Sanity: the shared night rate actually kicked in (less than the full
    // day rate would have drained) — guards against a future regression
    // that silently drops the night slowdown for both callers at once.
    const dayRateAgent = new AnimalAgent(makeDeps({ animalId: 'day-horse' }))
    dayRateAgent.life.hunger = 0.5
    dayRateAgent.life.thirst = 0.5
    dayRateAgent.update({
      dt,
      others: [],
      observerPos,
      dayFactor: 1,
      forestFactor: 0,
      litFires: [],
    })
    expect(free.life.hunger).toBeLessThan(dayRateAgent.life.hunger)
  })

  // R1 (plan fauna-017 step 4b): adopting the shared AgentAnimationSet must
  // not silently drop cow/sheep-style "Armature|Walk" clip names — step 4a's
  // suffix-match fallback is what makes this resolve.
  it('resolves an "Armature|Walk"-style clip name via the shared animation set', () => {
    const walkClip = new THREE.AnimationClip('Armature|Walk', 1, [])
    const agent = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.cow, animalId: 'test-cow', animations: [walkClip] }))
    agent.life.hunger = 0
    agent.life.thirst = 0
    expect(() => agent.update({
      dt: 1,
      others: [],
      observerPos: new THREE.Vector3(),
      dayFactor: 1,
      forestFactor: 0,
      litFires: [],
    })).not.toThrow()
  })

  // D2: a hurt mount's `hurtAnimTimer` must count down while ridden instead
  // of freezing until dismount — before this fix, `driveMounted()` skipped
  // every timer decrement entirely, so `updateAnim()`'s hurt-clip gate
  // (`hurtAnimTimer > 0`) never cleared until the animal was dismounted.
  it('decrements the hurt-clip timer while mounted', () => {
    const hurtClip = new THREE.AnimationClip('Idle_HitReact1', 1, [])
    const mounted = new AnimalAgent(makeDeps({ animalId: 'hurt-horse', animations: [hurtClip] }))
    mounted.setMounted(true)
    mounted.takeDamage(1)
    expect(mounted.getDebugInfo().presentation.current).toBe('hurt')

    mounted.driveMounted(2, 0, 0, false)

    expect(mounted.getDebugInfo().presentation.current).toBeNull()
  })
})

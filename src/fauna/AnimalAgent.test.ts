// @vitest-environment jsdom
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { AnimalAgent, type AnimalAgentDeps } from './AnimalAgent'
import { ANIMAL_DEFS, ANIMAL_LABELS } from './animalDefs'
import { FAUNA_PLAYER_HUMAN_ID } from './animalHumanAffinity'
import { NEED_ELEVATED_THRESHOLD } from './AnimalLife'
import { horseNameForAnimal } from './animalNames'
import { JUVENILE_MATURITY_SECONDS, JUVENILE_SCALE_FACTOR } from './herdCohesion'

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

  // D3 (plan fauna-017 step 10): `age` used to advance only through
  // `tickMaturity()` inside `update()`, and `update()` is gated off for the
  // whole skip (plan 196). `resolveTimeSkip` now calls the same
  // `advanceAge()` the live tick uses, so an 8 h skip matures a juvenile
  // (restores adult mesh scale and drops `motherId`) instead of leaving it
  // following its mother at cub size.
  it('resolveTimeSkip(8 h) matures a juvenile to adult scale', () => {
    const juvenile = new AnimalAgent(makeDeps({
      def: ANIMAL_DEFS.deer,
      animalId: 'juv-deer',
      lifeStage: 'juvenile',
      motherId: 'mom-deer',
    }))
    const adult = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'adult-deer' }))
    const juvenileFactor = JUVENILE_SCALE_FACTOR.deer ?? 1
    expect(juvenile.mesh.scale.x).toBeCloseTo(adult.mesh.scale.x * juvenileFactor, 10)

    juvenile.resolveTimeSkip(JUVENILE_MATURITY_SECONDS - 1)
    expect(juvenile.mesh.scale.x).toBeCloseTo(adult.mesh.scale.x * juvenileFactor, 10)

    juvenile.resolveTimeSkip(8 * 3600)
    expect(juvenile.mesh.scale.x).toBeCloseTo(adult.mesh.scale.x, 10)

    const scaleAfterMaturity = juvenile.mesh.scale.x
    juvenile.resolveTimeSkip(8 * 3600)
    expect(juvenile.mesh.scale.x).toBeCloseTo(scaleAfterMaturity, 10)
  })

  describe('hand-feed and human affinity (plan fauna-013)', () => {
    it('dog feed increments only the feeding human affinity', () => {
      const dog = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.dog, animalId: 'dog-1' }))
      dog.life.hunger = 0.9
      expect(dog.tryHandFeed(FAUNA_PLAYER_HUMAN_ID, 'raw_meat')).toBe(true)
      expect(dog.getHumanAffinityValue(FAUNA_PLAYER_HUMAN_ID)).toBe(0.25)
      expect(dog.getHumanAffinityValue('npc:other')).toBe(0)
    })

    it('horse hand-feed does not allocate affinity state', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'horse-1' }))
      horse.life.hunger = 0.9
      expect(horse.tryHandFeed(FAUNA_PLAYER_HUMAN_ID, 'hay')).toBe(true)
      expect(horse.getDebugInfo().humanAffinity).toBeNull()
    })

    it('rejects hand-feed when not hungry enough', () => {
      const dog = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.dog, animalId: 'dog-2' }))
      dog.life.hunger = NEED_ELEVATED_THRESHOLD - 0.05
      expect(dog.tryHandFeed(FAUNA_PLAYER_HUMAN_ID, 'raw_meat')).toBe(false)
    })

    it('affinity round-trips through snapshot and hydrate', () => {
      const dog = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.dog, animalId: 'dog-3' }))
      dog.life.hunger = 0.9
      dog.tryHandFeed(FAUNA_PLAYER_HUMAN_ID, 'raw_meat')
      const snap = dog.snapshot()
      expect(snap.affinity).toEqual([{ humanId: FAUNA_PLAYER_HUMAN_ID, value: 0.25 }])

      const loaded = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.dog, animalId: 'dog-4' }))
      loaded.hydrate({ ...snap, x: 0, z: 0, yaw: 0 })
      expect(loaded.getHumanAffinityValue(FAUNA_PLAYER_HUMAN_ID)).toBe(0.25)
    })
  })

  describe('horse given name on player ownership', () => {
    it('assigns a deterministic name to an unnamed horse on transfer', () => {
      const animal = new AnimalAgent(makeDeps({ animalId: 'merchant-horse-home' }))
      expect(animal.getName()).toBeUndefined()
      animal.transferOwnershipToPlayer()
      expect(animal.getName()).toBe(horseNameForAnimal(animal.animalId))
      expect(animal.getDisplayName()).toBe(`${ANIMAL_LABELS.horse}: ${horseNameForAnimal(animal.animalId)}`)
    })

    it('does not overwrite an existing name on ownership transfer', () => {
      const animal = new AnimalAgent(makeDeps({ animalId: 'named-horse' }))
      animal.hydrate({
        ...animal.snapshot(),
        name: 'Storm',
      })
      animal.transferOwnershipToPlayer()
      expect(animal.getName()).toBe('Storm')
    })

    it('round-trips name through snapshot and hydrate', () => {
      const animal = new AnimalAgent(makeDeps({ animalId: 'persist-horse' }))
      animal.hydrate({
        ...animal.snapshot(),
        name: 'Storm',
      })
      expect(animal.getName()).toBe('Storm')
      expect(animal.snapshot().name).toBe('Storm')
    })

    it('hydrates a legacy save without name', () => {
      const animal = new AnimalAgent(makeDeps({ animalId: 'legacy-horse' }))
      const state = animal.snapshot()
      expect(state.name).toBeUndefined()
      animal.hydrate(state)
      expect(animal.getName()).toBeUndefined()
      expect(animal.getDisplayName()).toBe(ANIMAL_LABELS.horse)
    })
  })
})

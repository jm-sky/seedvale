// @vitest-environment jsdom
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { GrassForageService } from '../world/createGrassForagePatches'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { AnimalAgent, type AnimalAgentDeps } from './AnimalAgent'
import { ANIMAL_DEFS, ANIMAL_LABELS } from './animalDefs'
import { FAUNA_PLAYER_HUMAN_ID } from './animalHumanAffinity'
import { LEAD_START_DISTANCE } from './animalLead'
import { NEED_ELEVATED_THRESHOLD } from './AnimalLife'
import { horseNameForAnimal } from './animalNames'
import { type AnimalScareStimulus, scareFleeOrigin, shouldScare } from './animalScare'
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

  describe('durable snapshot fields (plan fauna-018)', () => {
    it('round-trips rabies through snapshot and hydrate', () => {
      const animal = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf-rabid' }))
      animal.infectWithRabies()
      const snap = animal.snapshot()
      expect(snap.rabid).toBe(true)

      const loaded = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf-rabid' }))
      loaded.hydrate({ ...snap, x: 2, z: 3, yaw: 0.4 })
      expect(loaded.isRabid()).toBe(true)
      expect(loaded.snapshot().rabid).toBe(true)
    })

    it('hydrates a legacy save without rabid as not infected', () => {
      const animal = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'wolf-legacy' }))
      const { rabid: _rabid, ...legacy } = animal.snapshot()
      animal.infectWithRabies()
      animal.hydrate(legacy)
      expect(animal.isRabid()).toBe(false)
    })

    it('round-trips corpse linger state without requiring transient foraging/roaming', () => {
      const animal = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.bear, animalId: 'bear-corpse' }))
      const snap = animal.snapshot()
      animal.hydrate({
        ...snap,
        health: { current: 0, max: snap.health.max, dead: true },
        corpse: { timeSinceDeath: 90, meatHarvested: true },
      })
      expect(animal.isDead()).toBe(true)
      expect(animal.snapshot().corpse).toEqual({ timeSinceDeath: 90, meatHarvested: true })
      expect(animal.snapshot()).not.toHaveProperty('sourceTarget')
      expect(animal.snapshot()).not.toHaveProperty('trip')
    })
  })

  describe('player-owned follow (plan fauna-020)', () => {
    const farObserver = new THREE.Vector3(1000, 0, 1000)

    it('defaults to follow and moves toward the player instead of roaming away', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'owned-follow' }))
      horse.transferOwnershipToPlayer()
      expect(horse.getOwnedControlMode()).toBe('follow')
      horse.life.thirst = 0
      horse.life.hunger = 0
      const playerPos = { x: 20, z: 0 }
      horse.update({
        dt: 1,
        others: [],
        observerPos: farObserver,
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
        playerControlPos: playerPos,
      })
      expect(horse.mesh.position.x).toBeGreaterThan(1)
    })

    it('stay mode does not wander away from the anchor', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'owned-stay', x: 5, z: 5 }))
      horse.transferOwnershipToPlayer()
      horse.setOwnedControlMode('stay')
      const anchorX = horse.mesh.position.x
      for (let i = 0; i < 8; i++) {
        horse.update({
          dt: 1,
          others: [],
          observerPos: farObserver,
          dayFactor: 1,
          forestFactor: 0,
          litFires: [],
          playerControlPos: { x: 100, z: 100 },
        })
      }
      expect(Math.hypot(horse.mesh.position.x - anchorX, horse.mesh.position.z - 5)).toBeLessThan(4)
    })
  })

  describe('leading (plan fauna-007)', () => {
    const farObserver = new THREE.Vector3(1000, 0, 1000)
    const stubGrass = (x: number, z: number): GrassForageService => ({
      queryNear: () => [{ id: 'patch:test', x, z }],
      isAvailable: () => true,
      consume: () => true,
      tickVisuals: () => {},
      serialize: () => ({}),
      dispose: () => {},
    })

    it('does not change AnimalOwner or persisted Follow/Stay', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'lead-owner' }))
      expect(horse.getOwner()).toBeNull()
      horse.setLeadAttached(true)
      expect(horse.isLeadAttached()).toBe(true)
      expect(horse.getOwner()).toBeNull()
      horse.transferOwnershipToPlayer()
      horse.setOwnedControlMode('stay')
      horse.setLeadAttached(true)
      expect(horse.getOwner()).toEqual({ kind: 'player' })
      expect(horse.getOwnedControlMode()).toBe('stay')
      expect(horse.isLeadAttached()).toBe(true)
    })

    it('clears lead on mount and death', () => {
      const mounted = new AnimalAgent(makeDeps({ animalId: 'lead-mount' }))
      mounted.setLeadAttached(true)
      mounted.setMounted(true)
      expect(mounted.isLeadAttached()).toBe(false)

      const dying = new AnimalAgent(makeDeps({ animalId: 'lead-death' }))
      dying.setLeadAttached(true)
      dying.takeDamage(9999)
      expect(dying.isDead()).toBe(true)
      expect(dying.isLeadAttached()).toBe(false)
    })

    it('follows the player while attached and defers ordinary elevated needs', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'lead-follow' }))
      horse.life.hunger = 0
      horse.life.thirst = 0
      horse.setLeadAttached(true)
      const playerFar = { x: LEAD_START_DISTANCE + 8, z: 0 }
      horse.update({
        dt: 1,
        others: [],
        observerPos: farObserver,
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
        playerControlPos: playerFar,
      })
      expect(horse.mesh.position.x).toBeGreaterThan(0)

      horse.life.hunger = NEED_ELEVATED_THRESHOLD + 0.2
      const beforeNeed = horse.mesh.position.x
      horse.update({
        dt: 1,
        others: [],
        observerPos: farObserver,
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
        playerControlPos: playerFar,
        grassForage: stubGrass(-12, 0),
      })
      expect(horse.mesh.position.x).toBeGreaterThan(beforeNeed)

      horse.life.hunger = 0
      const beforeResume = horse.mesh.position.x
      horse.update({
        dt: 1,
        others: [],
        observerPos: farObserver,
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
        playerControlPos: playerFar,
      })
      expect(horse.mesh.position.x).toBeGreaterThan(beforeResume)
      expect(horse.isLeadAttached()).toBe(true)
    })
  })

  describe('thunder scare (plan world-026)', () => {
    const farObserver = new THREE.Vector3(1000, 0, 1000)

    function thunder(eventId: string, overrides: Partial<AnimalScareStimulus> = {}): AnimalScareStimulus {
      return { source: 'thunder', eventId, strength: 1, simulatedDistanceM: 120, ...overrides }
    }

    it('does not change movement state when the scare roll fails', () => {
      const cow = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.cow,
        animalId: 'calm-cow',
        ownerHouseId: 'home:home:0',
      }))
      const fail = thunder('lightning:fail:calm', { strength: 0.15, simulatedDistanceM: 1400 })
      expect(shouldScare(fail, {
        animalId: 'calm-cow',
        x: 0,
        z: 0,
        home: { x: 0, z: 0 },
        fearBaseline: ANIMAL_DEFS.cow.fearBaseline ?? 0.4,
        ownerNearby: true,
        herdmatesNearby: 3,
      })).toBe(false)
      cow.update({
        dt: 0.2,
        others: [],
        observerPos: farObserver,
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
        nearbySettlementNpcs: [{ id: 'npc-1', x: 1, z: 0, homeId: 'home:home:0' }],
        scareStimulus: fail,
      })
      expect(cow.getDebugInfo().aiBranch).not.toBe('scare-flee')
      expect(cow.getDebugInfo().intent).not.toBe('flee')
    })

    it('uses the existing flee seam when the scare roll succeeds', () => {
      const chicken = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.chicken,
        animalId: 'spooked-chicken',
        x: 0,
        z: 0,
      }))
      chicken.mesh.position.set(40, 0, 0)
      let hit: AnimalScareStimulus | null = null
      for (let i = 0; i < 80; i++) {
        const candidate = thunder(`lightning:hit:${i}`, { simulatedDistanceM: 90, strength: 1 })
        if (shouldScare(candidate, {
          animalId: 'spooked-chicken',
          x: 40,
          z: 0,
          home: { x: 0, z: 0 },
          fearBaseline: ANIMAL_DEFS.chicken.fearBaseline ?? 0.88,
          ownerNearby: false,
          herdmatesNearby: 0,
        })) {
          hit = candidate
          break
        }
      }
      expect(hit).not.toBeNull()
      chicken.update({
        dt: 0.2,
        others: [],
        observerPos: farObserver,
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
        scareStimulus: hit,
      })
      expect(chicken.getDebugInfo().aiBranch).toBe('scare-flee')
      expect(chicken.getDebugInfo().intent).toBe('flee')
    })

    it('allows scare-flee to leave the ordinary home roam band', () => {
      const chicken = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.chicken,
        animalId: 'edge-chicken',
        x: 48,
        z: 0,
      }))
      let hit: AnimalScareStimulus | null = null
      for (let i = 0; i < 200; i++) {
        const candidate = thunder(`lightning:edge:${i}`, { simulatedDistanceM: 90, strength: 1 })
        const origin = scareFleeOrigin(candidate.eventId, 'edge-chicken', 48, 0)
        if (origin.x >= 48) continue
        if (shouldScare(candidate, {
          animalId: 'edge-chicken',
          x: 48,
          z: 0,
          home: { x: 0, z: 0 },
          fearBaseline: ANIMAL_DEFS.chicken.fearBaseline ?? 0.88,
          ownerNearby: false,
          herdmatesNearby: 0,
        })) {
          hit = candidate
          break
        }
      }
      expect(hit).not.toBeNull()
      for (let step = 0; step < 25; step++) {
        chicken.update({
          dt: 0.2,
          others: [],
          observerPos: farObserver,
          dayFactor: 1,
          forestFactor: 0,
          litFires: [],
          scareStimulus: step === 0 ? hit : null,
        })
      }
      expect(chicken.mesh.position.x).toBeGreaterThan(50)
    })
  })

  describe('lost livestock stray (fauna-024)', () => {
    it('starts a stray episode on existing household livestock without changing id or owner', () => {
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-house0-0',
        ownerHouseId: 'home:home:0',
      }))
      const owner = sheep.getOwner()
      expect(sheep.startLivestockStray({ random: () => 0.2 })).toBe(true)
      expect(sheep.animalId).toBe('sheep-house0-0')
      expect(sheep.getOwner()).toEqual(owner)
      expect(sheep.isStrayActive()).toBe(true)
      expect(Math.hypot(sheep.mesh.position.x, sheep.mesh.position.z)).toBeGreaterThanOrEqual(36)
      expect(sheep.startLivestockStray({ random: () => 0.9 })).toBe(false)
      expect(sheep.isLeadable()).toBe(true)
    })

    it('round-trips stray/dead/inspection through snapshot hydrate and clears assist on return', () => {
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-house0-1',
        ownerHouseId: 'home:home:0',
      }))
      sheep.startLivestockStray({ random: () => 0.3 })
      const live = sheep.snapshot()
      expect(live.stray?.active).toBe(true)
      const loaded = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-house0-1',
        ownerHouseId: 'home:home:0',
      }))
      loaded.hydrate(live)
      expect(loaded.isStrayActive()).toBe(true)
      expect(loaded.mesh.position.x).toBe(live.x)
      expect(loaded.mesh.position.z).toBe(live.z)

      loaded.takeDamage(9999)
      expect(loaded.readyToRemove()).toBe(false)
      loaded.hydrate({
        ...loaded.snapshot(),
        health: { current: 0, max: live.health.max, dead: true },
        corpse: { timeSinceDeath: 90, meatHarvested: false },
      })
      expect(loaded.readyToRemove()).toBe(false)
      expect(loaded.inspectStrayedCorpse()).toBe(true)
      expect(loaded.snapshot().stray?.corpseInspected).toBe(true)

      const returned = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-house0-2',
        ownerHouseId: 'home:home:0',
      }))
      returned.startLivestockStray({ random: () => 0.4 })
      returned.clearLivestockStray()
      expect(returned.isStrayActive()).toBe(false)
      expect(returned.snapshot().stray?.survivalAssist).toBe(false)
      expect(returned.isLeadable()).toBe(false)
      const x = returned.mesh.position.x
      const z = returned.mesh.position.z
      expect(returned.startLivestockStray({ random: () => 0.9 })).toBe(false)
      expect(returned.mesh.position.x).toBe(x)
      expect(returned.mesh.position.z).toBe(z)
    })
  })

  describe('natural stray return (fauna-025)', () => {
    /** Player kept far enough away that `senseEnvironment` never reports it
     *  active — same convention as the other `update()` tests in this file. */
    function tick(agent: AnimalAgent, others: AnimalAgent[], dt = 1): void {
      agent.update({
        dt,
        others,
        observerPos: new THREE.Vector3(1000, 0, 1000),
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
      })
    }

    it('does not classify a displacement that stays inside the home band as stray', () => {
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-natural-0',
        ownerHouseId: 'home:home:0',
      }))
      sheep.mesh.position.set(20, 0, 0) // inside STRAY_MIN_DISTANCE (36)
      for (let i = 0; i < 60; i++) tick(sheep, [sheep])
      expect(sheep.isStrayActive()).toBe(false)
    })

    it('never latches from a single tick just past the boundary', () => {
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-natural-1',
        ownerHouseId: 'home:home:0',
      }))
      sheep.mesh.position.set(37, 0, 0)
      tick(sheep, [sheep], 0.016)
      expect(sheep.isStrayActive()).toBe(false)
    })

    it('classifies a natural stray episode after sustained displacement past the grace window, preserving identity', () => {
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-natural-2',
        ownerHouseId: 'home:home:0',
      }))
      const owner = sheep.getOwner()
      // Re-anchored every tick to simulate a sustained displacement (a real
      // flee/scare keeps re-triggering it) — classification reads position
      // at the top of `update()`, before this tick's own wander/steering, so
      // this isolates the grace/distance logic from ordinary wander-home
      // drift, which is a separate, already-covered concern.
      for (let i = 0; i < 20 && !sheep.isStrayActive(); i++) {
        sheep.mesh.position.set(50, 0, 0)
        tick(sheep, [sheep])
      }
      expect(sheep.isStrayActive()).toBe(true)
      expect(sheep.animalId).toBe('sheep-natural-2')
      expect(sheep.getOwner()).toEqual(owner)
      expect(sheep.getStrayState()?.originX).toBe(0)
      expect(sheep.getStrayState()?.originZ).toBe(0)
    })

    it('resets grace when the animal re-enters the band before the threshold', () => {
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-natural-3',
        ownerHouseId: 'home:home:0',
      }))
      for (let i = 0; i < 8; i++) {
        sheep.mesh.position.set(50, 0, 0)
        tick(sheep, [sheep])
      }
      expect(sheep.isStrayActive()).toBe(false)
      sheep.mesh.position.set(1, 0, 0) // back inside the band — resets grace
      tick(sheep, [sheep])
      for (let i = 0; i < 8; i++) {
        sheep.mesh.position.set(50, 0, 0)
        tick(sheep, [sheep])
      }
      expect(sheep.isStrayActive()).toBe(false)
    })

    it('never naturally classifies a guard dog or a currently lead-attached animal', () => {
      const dog = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.dog,
        animalId: 'dog-natural-0',
        ownerHouseId: 'home:home:0',
      }))
      for (let i = 0; i < 20; i++) {
        dog.mesh.position.set(80, 0, 0)
        tick(dog, [dog])
      }
      expect(dog.isStrayActive()).toBe(false)

      const horse = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.horse,
        animalId: 'horse-natural-0',
        ownerHouseId: 'home:home:0',
      }))
      horse.setLeadAttached(true)
      for (let i = 0; i < 20; i++) {
        horse.mesh.position.set(80, 0, 0)
        tick(horse, [horse])
      }
      expect(horse.isStrayActive()).toBe(false)
    })

    it('defers a committed return trip while a predator threat is active, then commits once calm', () => {
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-natural-4',
        ownerHouseId: 'home:home:0',
      }))
      expect(sheep.startLivestockStray({ random: () => 0.2 })).toBe(true)
      expect(sheep.isStrayActive()).toBe(true)

      const wolf = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.wolf,
        animalId: 'wolf-natural-0',
        x: sheep.mesh.position.x + 2,
        z: sheep.mesh.position.z,
      }))
      tick(sheep, [sheep, wolf])
      expect(sheep.hasActiveTrip()).toBe(false)
      expect(sheep.isStrayActive()).toBe(true)

      tick(sheep, [sheep])
      expect(sheep.hasActiveTrip()).toBe(true)
    })

    it('arriving inside the return radius clears the episode via the existing predicate', () => {
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-natural-6',
        ownerHouseId: 'home:home:0',
      }))
      expect(sheep.startLivestockStray({ random: () => 0.2 })).toBe(true)
      const origin = sheep.getStrayState()!
      sheep.mesh.position.set(origin.originX, 0, origin.originZ)
      tick(sheep, [sheep])
      expect(sheep.isStrayActive()).toBe(false)
    })

    it('a failed destination probe never teleports or clears an active stray episode', () => {
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-natural-7',
        ownerHouseId: 'home:home:0',
        // Blocks the origin and every candidate the return probe could pick
        // near it (radius 20 covers the whole `STRAY_RETURN_SEARCH_RADIUS`
        // of 12) while leaving the far-away displacement ring (36-90m out)
        // walkable, so the initial `startLivestockStray()` teleport still
        // succeeds and only the later home-return probe fails.
        collidersNear: () => [{
          type: 'circle' as const,
          x: 0,
          z: 0,
          radius: 20,
        }],
      }))
      expect(sheep.startLivestockStray({ random: () => 0.2 })).toBe(true)
      tick(sheep, [sheep])
      expect(sheep.isStrayActive()).toBe(true)
      expect(sheep.hasActiveTrip()).toBe(false)
      expect(Math.hypot(sheep.mesh.position.x, sheep.mesh.position.z)).toBeGreaterThan(6)
    })
  })
})

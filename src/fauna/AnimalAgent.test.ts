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
import { CARCASS_EAT_DURATION_SEC } from './animalForaging'
import { JUVENILE_MATURITY_SECONDS, JUVENILE_SCALE_FACTOR } from './herdCohesion'
import { senseOwnedFlockThreat } from './shepherdFlock'

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

  it('relocateOnGround snaps through sampleHeight and keeps the same identity', () => {
    const agent = new AnimalAgent(makeDeps({ animalId: 'owned-horse', x: 100, z: -40 }))
    agent.relocateOnGround(8, 12)
    expect(agent.animalId).toBe('owned-horse')
    expect(agent.mesh.position.x).toBe(8)
    expect(agent.mesh.position.z).toBe(12)
    expect(agent.mesh.position.y).toBeCloseTo(0.45 * agent.def.scale)
  })

  it('reviveForDebug restores the same dead agent without changing ownership', () => {
    const agent = new AnimalAgent(makeDeps({ animalId: 'owned-horse', ownerHouseId: 'home:home:0' }))
    agent.transferOwnershipToPlayer()
    const name = agent.getName()
    agent.takeDamage(9999)
    expect(agent.isDead()).toBe(true)
    expect(agent.reviveForDebug()).toBe(true)
    expect(agent.isDead()).toBe(false)
    expect(agent.health.currentHp).toBe(agent.health.maxHp)
    expect(agent.isPlayerOwned()).toBe(true)
    expect(agent.getName()).toBe(name)
    expect(agent.reviveForDebug()).toBe(false)
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

  describe('horse training and paddock stay (plan settlements-013)', () => {
    const paddockStay = {
      settlementId: 'home',
      slotIndex: 0,
      x: 0,
      z: 0,
      radius: 10,
      entranceX: 10,
      entranceZ: 0,
      entranceWidth: 2.4,
      hayX: -3,
      hayZ: 3,
    }

    it('round-trips training through snapshot and hydrate without persisting a tier', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'train-horse', training: { progress: 0.2 } }))
      horse.addTrainingProgress(0.7)
      expect(horse.trainingTier()).toBe('warhorse')
      const snap = horse.snapshot()
      expect(snap.training?.progress).toBeCloseTo(0.9)
      expect(snap).not.toHaveProperty('trainingTier')

      const loaded = new AnimalAgent(makeDeps({ animalId: 'train-horse', training: { progress: 0 } }))
      loaded.hydrate(snap)
      expect(loaded.trainingState()?.progress).toBeCloseTo(0.9)
      expect(loaded.trainingTier()).toBe('warhorse')
      expect(loaded.life.stamina.max).toBeCloseTo(horse.life.stamina.max)
    })

    it('keeps training across ownership transfer', () => {
      const horse = new AnimalAgent(makeDeps({
        animalId: 'vendor-horse-home-0',
        training: { progress: 0.5 },
      }))
      horse.transferOwnershipToPlayer()
      expect(horse.isPlayerOwned()).toBe(true)
      expect(horse.trainingState()?.progress).toBeCloseTo(0.5)
      expect(horse.trainingTier()).toBe('trained')
    })

    it('does not clear paddock stay on purchase, only after lead/ride exit', () => {
      const horse = new AnimalAgent(makeDeps({
        animalId: 'vendor-horse-home-0',
        training: { progress: 0.1 },
        paddockStay,
      }))
      horse.transferOwnershipToPlayer()
      expect(horse.paddockStay()?.settlementId).toBe('home')
      expect(horse.getOwnedControlMode()).toBe('stay')

      horse.mesh.position.set(0, 0, 16)
      horse.update({
        dt: 1 / 60,
        others: [],
        observerPos: new THREE.Vector3(),
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
      })
      expect(horse.paddockStay()?.settlementId).toBe('home')
      expect(Math.hypot(horse.mesh.position.x, horse.mesh.position.z)).toBeLessThanOrEqual(10.01)

      horse.setLeadAttached(true)
      horse.mesh.position.set(0, 0, 16)
      horse.update({
        dt: 1 / 60,
        others: [],
        observerPos: new THREE.Vector3(),
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
        playerControlPos: { x: 0, z: 16 },
      })
      expect(horse.paddockStay()).toBeUndefined()
    })

    it('hydrates a legacy save without training as ordinary baseline', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'legacy-train' }))
      const { training: _training, paddockStay: _stay, ...legacy } = horse.snapshot()
      horse.hydrate(legacy)
      expect(horse.trainingState()).toBeUndefined()
      expect(horse.trainingTier()).toBe('ordinary')
      expect(horse.trainingModifiers().speed).toBe(1)
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
        corpse: { deathAtDays: 1.5, meatHarvested: true, harvestedAtDays: 1.6 },
      })
      expect(animal.isDead()).toBe(true)
      expect(animal.snapshot().corpse).toEqual({
        deathAtDays: 1.5,
        meatHarvested: true,
        harvestedAtDays: 1.6,
      })
      expect(animal.snapshot()).not.toHaveProperty('sourceTarget')
      expect(animal.snapshot()).not.toHaveProperty('trip')
    })
  })

  describe('player-owned follow/stay (plan fauna-020 / fauna-030)', () => {
    const farObserver = new THREE.Vector3(1000, 0, 1000)

    function tickOwned(
      animal: AnimalAgent,
      extras: Partial<Parameters<AnimalAgent['update']>[0]> = {},
    ): void {
      animal.update({
        dt: 1,
        others: extras.others ?? [],
        observerPos: farObserver,
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
        playerControlPos: extras.playerControlPos ?? { x: 100, z: 100 },
        ...extras,
      })
    }

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

    it('stay mode stays near the anchor instead of roaming off with the player', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'owned-stay', x: 5, z: 5 }))
      horse.transferOwnershipToPlayer()
      horse.setOwnedControlMode('stay')
      horse.life.thirst = 0
      horse.life.hunger = 0
      const anchorX = horse.mesh.position.x
      const anchorZ = horse.mesh.position.z
      for (let i = 0; i < 8; i++) tickOwned(horse)
      expect(Math.hypot(horse.mesh.position.x - anchorX, horse.mesh.position.z - anchorZ))
        .toBeLessThan(16)
    })

    it('snapshot/hydrate keeps Stay mode and stayAnchor', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'owned-stay-snap', x: 4, z: 7 }))
      horse.transferOwnershipToPlayer()
      horse.setOwnedControlMode('stay')
      const snap = horse.snapshot()
      expect(snap.control).toEqual({
        mode: 'stay',
        stayAnchor: { x: 4, z: 7 },
      })
      const loaded = new AnimalAgent(makeDeps({ animalId: 'owned-stay-snap', x: 0, z: 0 }))
      loaded.hydrate(snap)
      expect(loaded.getOwnedControlMode()).toBe('stay')
      expect(loaded.snapshot().control?.stayAnchor).toEqual({ x: 4, z: 7 })
    })

    it('a Stay animal displaced past the return band walks back toward the anchor', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'owned-stay-return', x: 0, z: 0 }))
      horse.transferOwnershipToPlayer()
      horse.setOwnedControlMode('stay')
      horse.life.thirst = 0
      horse.life.hunger = 0
      horse.mesh.position.set(20, 0, 0)
      tickOwned(horse)
      expect(horse.mesh.position.x).toBeLessThan(20)
    })

    it('Stay hunger can walk to a local grass patch, then return after relief', () => {
      const patchX = 8
      const grassForage: GrassForageService = {
        queryNear: () => [{ id: 'patch:stay', x: patchX, z: 0 }],
        isAvailable: () => true,
        consume: () => true,
        tickVisuals: () => {},
        serialize: () => ({}),
        dispose: () => {},
      }
      const horse = new AnimalAgent(makeDeps({ animalId: 'owned-stay-need', x: 0, z: 0 }))
      horse.transferOwnershipToPlayer()
      horse.setOwnedControlMode('stay')
      horse.life.hunger = NEED_ELEVATED_THRESHOLD + 0.2
      horse.life.thirst = 0
      tickOwned(horse, { grassForage })
      expect(horse.mesh.position.x).toBeGreaterThan(0.4)

      horse.life.hunger = 0
      horse.mesh.position.set(20, 0, 0)
      tickOwned(horse, { grassForage })
      expect(horse.mesh.position.x).toBeLessThan(20)
    })

    it('Stay flee can leave the leash; after the threat ends the horse returns', () => {
      const horse = new AnimalAgent(makeDeps({ animalId: 'owned-stay-threat', x: 0, z: 0 }))
      horse.transferOwnershipToPlayer()
      horse.setOwnedControlMode('stay')
      horse.life.hunger = 0
      horse.life.thirst = 0
      const wolf = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.wolf,
        animalId: 'stay-threat-wolf',
        x: 2,
        z: 0,
      }))
      for (let i = 0; i < 6; i++) tickOwned(horse, { others: [horse, wolf] })
      expect(Math.hypot(horse.mesh.position.x, horse.mesh.position.z)).toBeGreaterThan(4)

      horse.mesh.position.set(22, 0, 0)
      tickOwned(horse, { others: [horse] })
      expect(horse.mesh.position.x).toBeLessThan(22)
    })

    it('player-owned Stay does not start a routine water trip when a wild deer would', () => {
      const sampleHeight = (x: number) => (Math.abs(x) >= 6 ? -1 : 2)
      const stay = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.deer,
        animalId: 'owned-stay-trip',
        x: 0,
        z: 0,
        sampleHeight,
        waterLevel: 0,
      }))
      stay.transferOwnershipToPlayer()
      stay.setOwnedControlMode('stay')
      stay.life.hunger = 0
      stay.life.thirst = 0
      tickOwned(stay, { nowDays: 20 })
      expect(stay.hasActiveTrip()).toBe(false)

      const wild = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.deer,
        animalId: 'wild-water-trip',
        x: 0,
        z: 0,
        sampleHeight,
        waterLevel: 0,
      }))
      wild.life.hunger = 0
      wild.life.thirst = 0
      tickOwned(wild, { nowDays: 20, playerControlPos: undefined })
      expect(wild.hasActiveTrip()).toBe(true)
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

    it('fires onDeathSound from collapse with kind and position', () => {
      const heard: string[] = []
      const dying = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.wolf,
        animalId: 'sfx-wolf',
        x: 3,
        z: 4,
        onDeathSound: (kind, x, z) => { heard.push(`${kind}:${x}:${z}`) },
      }))
      dying.takeDamage(9999)
      expect(heard).toEqual(['wolf:3:4'])
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

    it('authored zagubiona-owca trigger starts or reuses a real fauna stray episode', () => {
      // Mirrors createApp onAnimalTargetBound for zagubiona-owca (plan 030):
      // start only when no compatible episode exists; never invent a second one.
      const ensureAuthoredStray = (animal: AnimalAgent): boolean => {
        if (animal.isStrayActive()) return false
        return animal.startLivestockStray({ random: () => 0.2 })
      }

      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-house0-authored',
        ownerHouseId: 'home:home:0',
      }))
      expect(ensureAuthoredStray(sheep)).toBe(true)
      expect(sheep.isStrayActive()).toBe(true)
      const x = sheep.mesh.position.x
      const z = sheep.mesh.position.z
      expect(ensureAuthoredStray(sheep)).toBe(false)
      expect(sheep.mesh.position.x).toBe(x)
      expect(sheep.mesh.position.z).toBe(z)
      expect(sheep.isStrayActive()).toBe(true)
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
        corpse: { deathAtDays: 1.5, meatHarvested: false },
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

  // Plan fauna-028: the cadence split must reduce how often the expensive
  // sections run without changing a single gameplay rule. Everything here is
  // driven with a real 60 Hz `dt`, because that is the only regime in which
  // any gate can actually close (an interval is a *seconds* budget, so a slow
  // frame runs every section, exactly as before).
  describe('update cadence (plan fauna-028)', () => {
    const FRAME = 1 / 60
    const FAR = new THREE.Vector3(1000, 0, 1000)

    function tickFrames(agent: AnimalAgent, frames: number, ctx: Record<string, unknown> = {}): void {
      for (let i = 0; i < frames; i++) {
        agent.update({
          dt: FRAME,
          others: [agent],
          observerPos: FAR,
          dayFactor: 1,
          forestFactor: 0,
          litFires: [],
          ...ctx,
        } as Parameters<AnimalAgent['update']>[0])
      }
    }

    it('runs every section at full rate for an animal right next to the player', () => {
      // `observerPos` inside the direct-interaction radius ⇒ `immediate`.
      const deer = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'near-deer', x: 0, z: 0 }))
      const near = new THREE.Vector3(3, 0, 0)
      let moved = 0
      for (let i = 0; i < 12; i++) {
        const before = deer.mesh.position.x
        deer.update({
          dt: FRAME,
          others: [deer],
          observerPos: near,
          dayFactor: 1,
          forestFactor: 0,
          litFires: [],
        })
        if (deer.mesh.position.x !== before) moved++
      }
      expect(deer.getDebugInfo().updateImportance).toBe('immediate')
      expect(moved).toBe(12)
    })

    it('keeps a threatened prey animal frame-responsive instead of throttling it', () => {
      // A player-noticed prey animal resolves `player-flee-prey`, a
      // high-priority branch — it must steer on every single frame even
      // though the observer is far outside the proximity radius.
      const rabbit = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.rabbit, animalId: 'fleeing-rabbit', x: 0, z: 0 }))
      const hunter = new THREE.Vector3(2.5, 0, 0)
      let stepped = 0
      for (let i = 0; i < 12; i++) {
        const before = rabbit.mesh.position.clone()
        rabbit.update({
          dt: FRAME,
          others: [rabbit],
          observerPos: hunter,
          dayFactor: 1,
          forestFactor: 0,
          litFires: [],
        })
        if (!rabbit.mesh.position.equals(before)) stepped++
      }
      expect(rabbit.getDebugInfo().aiBranch).toBe('player-flee-prey')
      expect(rabbit.getDebugInfo().updateImportance).toBe('immediate')
      expect(stepped).toBe(12)
    })

    it('gives a far, idle wild animal reduced behaviour cadence but the same travel over time', () => {
      const deer = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'far-deer', x: 0, z: 0 }))
      let stepped = 0
      const frames = 60
      for (let i = 0; i < frames; i++) {
        const before = deer.mesh.position.clone()
        tickFrames(deer, 1)
        if (!deer.mesh.position.equals(before)) stepped++
      }
      expect(deer.getDebugInfo().updateImportance).toBe('routine')
      // Fewer movement steps than frames — that is the whole point — but the
      // animal is still genuinely simulating and moving off-screen.
      expect(stepped).toBeLessThan(frames)
      expect(stepped).toBeGreaterThan(0)
      expect(deer.mesh.position.distanceTo(new THREE.Vector3(0, deer.mesh.position.y, 0))).toBeGreaterThan(0.5)
    })

    it('keeps gameplay timers on real time regardless of cadence', () => {
      // `attackCooldown` lives in the always-full-rate life tick. Sixty 1/60 s
      // frames must burn exactly one second of it whether or not the
      // behaviour/presentation gates closed in between.
      const wolf = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: 'cooldown-wolf', x: 0, z: 0 }))
      const prey = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.rabbit, animalId: 'bitten-rabbit', x: 0.2, z: 0 }))
      wolf.update({ dt: 1, others: [wolf, prey], observerPos: FAR, dayFactor: 1, forestFactor: 0, litFires: [] })
      const cooled = wolf.getDebugInfo()
      expect(cooled.aiBranch).toBe('predator-normal')
      // One attack has happened, so the cooldown is armed; run it down at 60 Hz.
      const beforeHp = prey.health.currentHp
      tickFrames(wolf, 60, { others: [wolf, prey] })
      // Cooldown (0.6 s) elapsed well inside one second, so the wolf bit again.
      expect(prey.health.currentHp).toBeLessThan(beforeHp)
    })

    it('advances hunger/thirst identically whether or not the cadence gates close', () => {
      // Same species, same id (⇒ same cadence phase), same starting needs and
      // the same two seconds of simulated time — but one is driven at 60 Hz,
      // where the routine gates actually close, and the other at 1 Hz, where
      // every `dt` already exceeds every interval so nothing is ever gated.
      const throttled = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'needs-far', x: 0, z: 0 }))
      const ungated = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'needs-far', x: 0, z: 0 }))
      for (const agent of [throttled, ungated]) {
        agent.life.hunger = 0.4
        agent.life.thirst = 0.3
        agent.life.stamina.current = agent.life.stamina.max
      }
      for (let i = 0; i < 120; i++) {
        throttled.update({ dt: FRAME, others: [throttled], observerPos: FAR, dayFactor: 1, forestFactor: 0, litFires: [] })
      }
      for (let i = 0; i < 2; i++) {
        ungated.update({ dt: 1, others: [ungated], observerPos: FAR, dayFactor: 1, forestFactor: 0, litFires: [] })
      }
      expect(throttled.getDebugInfo().updateImportance).toBe('routine')
      expect(throttled.life.hunger).toBeCloseTo(ungated.life.hunger, 10)
      expect(throttled.life.thirst).toBeCloseTo(ungated.life.thirst, 10)
    })

    it('does not delay drowning damage — deep water is never throttled', () => {
      const deepWater = () => ({ present: true as const, waterSurfaceHeight: 0, floorHeight: -8, depth: 8 })
      const deer = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.deer,
        animalId: 'drowning-deer',
        sampleLocalWater: deepWater,
      }))
      deer.life.stamina.current = 0
      const before = deer.health.currentHp
      let damagedFrames = 0
      for (let i = 0; i < 10; i++) {
        const hp = deer.health.currentHp
        deer.update({ dt: FRAME, others: [deer], observerPos: FAR, dayFactor: 1, forestFactor: 0, litFires: [] })
        if (deer.health.currentHp < hp) damagedFrames++
      }
      expect(deer.health.currentHp).toBeLessThan(before)
      // Every frame, not one in N: `swimming` alone forces `immediate`, and
      // `tickDrowning()` is in the full-rate life tick either way.
      expect(damagedFrames).toBe(10)
      expect(deer.getDebugInfo().updateImportance).toBe('immediate')
    })

    it('keeps a death clip on real time while corpse phase follows world days', () => {
      const deer = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'dead-deer', x: 0, z: 0 }))
      deer.takeDamage(9999)
      expect(deer.isDead()).toBe(true)
      tickFrames(deer, 60)
      expect(deer.getDebugInfo().position).toBeTruthy()
      expect(deer.corpsePhase()).toBe('fresh')
      // 60 × 1/60 s of real time is far below 4 world-hours of fresh.
      expect(deer.getDebugInfo().dead).toBe(true)
      deer.resolveTimeSkip(8 * 3600)
      expect(deer.corpsePhase()).toBe('fresh')
      deer.update({
        dt: FRAME,
        others: [deer],
        observerPos: FAR,
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
        nowDays: 40 / 24,
      })
      expect(deer.corpsePhase()).toBe('bones')
    })

    it('never throttles a mounted, led or player-owned animal', () => {
      const led = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.horse, animalId: 'led-horse', x: 0, z: 0 }))
      led.setLeadAttached(true)
      tickFrames(led, 1)
      expect(led.getDebugInfo().updateImportance).toBe('immediate')

      const owned = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.horse, animalId: 'owned-horse', x: 0, z: 0 }))
      owned.transferOwnershipToPlayer()
      tickFrames(owned, 1, { playerControlPos: { x: 40, z: 0 } })
      expect(owned.getDebugInfo().updateImportance).toBe('immediate')

      // A ridden mount bypasses `update()` entirely and is driven every frame
      // by `driveMounted()`, which runs all three sections unconditionally.
      const mount = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.horse, animalId: 'ridden-horse', x: 0, z: 0 }))
      mount.setMounted(true)
      const startX = mount.mesh.position.x
      for (let i = 0; i < 10; i++) mount.driveMounted(FRAME, 1, 0, false)
      expect(mount.mesh.position.x).toBeGreaterThan(startX)
    })

    it('uses the same mechanism for livestock as for wild fauna', () => {
      const cow = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.cow,
        animalId: 'cadence-cow',
        ownerHouseId: 'home:home:0',
      }))
      tickFrames(cow, 1)
      expect(cow.getDebugInfo().updateImportance).toBe('routine')
      tickFrames(cow, 1, { observerPos: new THREE.Vector3(2, 0, 0) })
      expect(cow.getDebugInfo().updateImportance).toBe('immediate')
    })

    it('bases cadence on observer distance, never on camera visibility', () => {
      // There is no camera/frustum input on `AnimalUpdateContext` at all, and
      // the simulation-critical half runs at full rate for every classification
      // — so an animal nobody is looking at still ages, feeds and decides.
      const deer = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'offscreen-deer', x: 0, z: 0 }))
      const beforeHunger = deer.life.hunger
      tickFrames(deer, 60)
      expect(deer.getDebugInfo().updateImportance).toBe('routine')
      expect(deer.life.hunger).toBeGreaterThan(beforeHunger)
      expect(deer.getDebugInfo().aiBranch).toBe('prey-normal')
    })
  })

  describe('predator ↔ livestock encounter set (plan fauna-026)', () => {
    /** Player kept far enough away that `senseEnvironment` never reports it
     *  active, and `others`/`huntableLivestock` are two genuinely separate
     *  arrays — never merged — matching the plan's "two production pools"
     *  requirement instead of a single shared array. */
    function tick(
      wolf: AnimalAgent,
      others: AnimalAgent[],
      huntableLivestock: readonly AnimalAgent[],
      dt = 1,
    ): void {
      wolf.update({
        dt,
        others,
        huntableLivestock,
        observerPos: new THREE.Vector3(1000, 0, 1000),
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
      })
    }

    function makeWolf(id: string, x = 0, z = 0): AnimalAgent {
      return new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.wolf, animalId: id, x, z }))
    }

    function makeSheep(id: string, x: number, z: number, ownerHouseId?: string): AnimalAgent {
      return new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.sheep, animalId: id, x, z, ownerHouseId }))
    }

    it('a wild wolf with only wild agents in `others` can commit to a household sheep passed separately as `huntableLivestock`', () => {
      const wolf = makeWolf('wolf-1')
      const sheep = makeSheep('sheep-1', 5, 0, 'house-1')
      tick(wolf, [wolf], [sheep])
      expect(wolf.huntingPrey()).toEqual({ animalId: 'sheep-1', ownerHouseId: 'house-1' })
      // The fix is a composition seam, not a taxonomy migration.
      expect(sheep.def.role).toBe(ANIMAL_DEFS.sheep.role)
    })

    it('picks the nearer of a wild-pool prey and a livestock-pool candidate', () => {
      const wolfNear = makeWolf('wolf-near')
      const deerFar = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'deer-far', x: 10, z: 0 }))
      const sheepClose = makeSheep('sheep-close', 2, 0, 'house-1')
      tick(wolfNear, [wolfNear, deerFar], [sheepClose])
      expect(wolfNear.huntingPrey()?.animalId).toBe('sheep-close')

      const wolfFarLivestock = makeWolf('wolf-far-livestock')
      const deerClose = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'deer-close', x: 2, z: 0 }))
      const sheepFar = makeSheep('sheep-far', 10, 0, 'house-1')
      tick(wolfFarLivestock, [wolfFarLivestock, deerClose], [sheepFar])
      expect(wolfFarLivestock.huntingPrey()?.animalId).toBe('deer-close')
    })

    it('resolves an exact-distance tie deterministically by animalId, never Math.random()', () => {
      const wolf = makeWolf('wolf-tie')
      const deer = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'deer-1', x: 5, z: 0 }))
      const sheep = makeSheep('sheep-1', 0, 5, 'house-1')
      tick(wolf, [wolf, deer], [sheep])
      // 'deer-1' <= 'sheep-1' lexicographically — the wild candidate wins the tie.
      expect(wolf.huntingPrey()?.animalId).toBe('deer-1')
    })

    it('never targets a livestock candidate outside detectRange', () => {
      const wolf = makeWolf('wolf-range')
      const sheep = makeSheep('sheep-out-of-range', ANIMAL_DEFS.wolf.detectRange + 5, 0, 'house-1')
      tick(wolf, [wolf], [sheep])
      expect(wolf.huntingPrey()).toBeNull()
    })

    it('drops a committed livestock target the instant it disappears from the next encounter set, without one more hit', () => {
      const wolf = makeWolf('wolf-drop')
      const sheep = makeSheep('sheep-drop', 0.5, 0, 'house-1') // inside CONTACT_RANGE
      tick(wolf, [wolf], [sheep])
      expect(wolf.huntingPrey()?.animalId).toBe('sheep-drop')
      const hpAfterCommit = sheep.health.currentHp

      // Settlement stream-out: sheep is no longer in this frame's encounter set.
      tick(wolf, [wolf], [])
      expect(wolf.huntingPrey()).toBeNull()
      expect(sheep.health.currentHp).toBe(hpAfterCommit)
    })

    it('chases and kills a household sheep through the real update/attack/damage/death path, firing onDeath exactly once', () => {
      const deaths: string[] = []
      const wolf = makeWolf('wolf-killer')
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-victim',
        x: 0.5,
        z: 0, // inside CONTACT_RANGE from the start — isolates combat from movement/stamina.
        ownerHouseId: 'house-1',
        onDeath: (id) => deaths.push(id),
      }))
      for (let i = 0; i < 10 && !sheep.isDead(); i++) tick(wolf, [wolf], [sheep])
      expect(sheep.isDead()).toBe(true)
      expect(deaths).toEqual(['sheep-victim'])
      // Once dead, the wolf can no longer be "hunting" it.
      expect(wolf.huntingPrey()).toBeNull()
    })

    it('persistence regression: a predator-killed household sheep still captures with dead state preserved, through the same LivestockRegistry every other death cause uses', async () => {
      const { createLivestockRegistry } = await import('../settlement/livestock')
      const wolf = makeWolf('wolf-persist')
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-persist',
        x: 0.5,
        z: 0,
        ownerHouseId: 'house-1',
      }))
      for (let i = 0; i < 10 && !sheep.isDead(); i++) tick(wolf, [wolf], [sheep])
      expect(sheep.isDead()).toBe(true)

      const registry = createLivestockRegistry()
      registry.capture('home', [sheep])
      const { entries } = registry.serialize()
      expect(entries).toHaveLength(1)
      expect(entries[0]!.animalId).toBe('sheep-persist')
      expect(entries[0]!.health.dead).toBe(true)
    })

    it('never appends a livestock candidate into the wild pool or ticks it from Fauna\'s own loop (no double interaction)', () => {
      const wolf = makeWolf('wolf-no-merge')
      const sheep = makeSheep('sheep-no-merge', 5, 0, 'house-1')
      const others = [wolf]
      tick(wolf, others, [sheep])
      expect(others).toEqual([wolf]) // untouched — livestock never appended to `others`
    })

    it('a real committed household-livestock kill flows into `senseOwnedFlockThreat()` for the right household and not a foreign one', () => {
      const wolf = makeWolf('wolf-shepherd')
      const sheep = makeSheep('sheep-flock', 3, 0, 'house-1')
      tick(wolf, [wolf], [sheep])
      const prey = wolf.huntingPrey()
      expect(prey).not.toBeNull()

      const candidate = {
        animalId: wolf.animalId,
        kind: wolf.def.kind,
        x: wolf.mesh.position.x,
        z: wolf.mesh.position.z,
        preyAnimalId: prey!.animalId,
        preyOwnerHouseId: prey!.ownerHouseId,
      }
      expect(senseOwnedFlockThreat(0, 0, 'house-1', [candidate])).toEqual(candidate)
      expect(senseOwnedFlockThreat(0, 0, 'house-2', [candidate])).toBeNull()
    })

    it('own household dog guard picks up a wolf hunting its own household\'s livestock, and drops it once the prey is gone (plan fauna-026 §7 / fauna-011)', () => {
      const wolf = makeWolf('wolf-guarded', 5, 0)
      const sheep = makeSheep('sheep-guarded', 7, 0, 'house-1')
      tick(wolf, [wolf], [sheep]) // wolf commits to the household's sheep
      expect(wolf.huntingPrey()?.animalId).toBe('sheep-guarded')

      const dog = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.dog, animalId: 'dog-1', x: 0, z: 0, ownerHouseId: 'house-1' }))
      dog.update({
        dt: 1,
        others: [dog],
        nearbyPredators: [wolf],
        observerPos: new THREE.Vector3(1000, 0, 1000),
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
      })
      expect(dog.getDebugInfo().dogGuard).toEqual({
        protectedNpcId: undefined,
        protectedAnimalId: 'sheep-guarded',
        ownHousehold: true,
      })

      // Kill the sheep outright — the wolf has nothing left to hunt.
      sheep.takeDamage(9999)
      tick(wolf, [wolf], [])
      expect(wolf.huntingPrey()).toBeNull()

      dog.update({
        dt: 1,
        others: [dog],
        nearbyPredators: [wolf],
        observerPos: new THREE.Vector3(1000, 0, 1000),
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
      })
      expect(dog.getDebugInfo().dogGuard).toBeNull()
    })

    it('a wolf hunting a foreign household\'s livestock does not trigger this dog\'s own-household guard', () => {
      const wolf = makeWolf('wolf-foreign', 5, 0)
      const sheep = makeSheep('sheep-foreign', 7, 0, 'house-2')
      tick(wolf, [wolf], [sheep])
      expect(wolf.huntingPrey()?.ownerHouseId).toBe('house-2')

      const dog = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.dog, animalId: 'dog-2', x: 0, z: 0, ownerHouseId: 'house-1' }))
      dog.update({
        dt: 1,
        others: [dog],
        nearbyPredators: [wolf],
        observerPos: new THREE.Vector3(1000, 0, 1000),
        dayFactor: 1,
        forestFactor: 0,
        litFires: [],
      })
      expect(dog.getDebugInfo().dogGuard).toBeNull()
    })
  })

  describe('corpse linger pose (Death last frame; tip only without a clip)', () => {
    const deadTick = (
      agent: AnimalAgent,
      dt = 1,
      nowDays = 0,
    ) => agent.update({
      dt,
      others: [],
      observerPos: new THREE.Vector3(),
      dayFactor: 1,
      forestFactor: 0,
      litFires: [],
      nowDays,
    })

    it('tips a species with no Death clip on collapse', () => {
      const sheep = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.sheep, animalId: 'sheep-corpse' }))
      sheep.takeDamage(9999)
      expect(sheep.isDead()).toBe(true)
      expect(Math.abs(sheep.mesh.rotation.z)).toBeCloseTo(Math.PI / 2)
    })

    it('keeps the Death last frame after the clip ends, without a root tip', () => {
      const stag = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.stag,
        animalId: 'stag-corpse',
        animations: [new THREE.AnimationClip('Death', 0.4, [])],
      }))
      stag.takeDamage(9999)
      expect(stag.isDead()).toBe(true)
      expect(stag.mesh.rotation.z).toBe(0)
      deadTick(stag, 0.5)
      expect(stag.mesh.rotation.z).toBe(0)
    })

    it('settles Death immediately on time-skip without tipping', () => {
      const stag = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.stag,
        animalId: 'stag-skip',
        animations: [new THREE.AnimationClip('Death', 2, [])],
      }))
      const y0 = stag.mesh.position.y
      stag.takeDamage(9999)
      expect(stag.mesh.rotation.z).toBe(0)
      stag.resolveTimeSkip(8 * 3600)
      expect(stag.mesh.rotation.z).toBe(0)
      expect(stag.mesh.position.y).toBe(y0)
      stag.resolveTimeSkip(8 * 3600)
      expect(stag.mesh.position.y).toBe(y0)
      deadTick(stag, 1)
      expect(stag.mesh.rotation.z).toBe(0)
    })

    it('does not stack the tip Y offset on a later time-skip', () => {
      const sheep = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.sheep, animalId: 'sheep-skip' }))
      const y0 = sheep.mesh.position.y
      sheep.takeDamage(9999)
      const y1 = sheep.mesh.position.y
      expect(y1).toBeGreaterThan(y0)
      sheep.resolveTimeSkip(8 * 3600)
      expect(sheep.mesh.position.y).toBe(y1)
      expect(Math.abs(sheep.mesh.rotation.z)).toBeCloseTo(Math.PI / 2)
    })

    it('hydrates an unharvested corpse to the Death end pose when a clip exists', () => {
      const live = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.stag,
        animalId: 'stag-save',
        animations: [new THREE.AnimationClip('Death', 1, [])],
      }))
      live.takeDamage(9999)
      expect(live.mesh.rotation.z).toBe(0)
      const saved = live.snapshot()
      const restored = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.stag,
        animalId: 'stag-save',
        animations: [new THREE.AnimationClip('Death', 1, [])],
      }))
      restored.hydrate(saved)
      expect(restored.mesh.rotation.z).toBe(0)
    })

    it('settleRootForRemains uprights a tipped corpse without re-tipping on later ticks', () => {
      const sheep = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.sheep, animalId: 'sheep-bones' }))
      sheep.takeDamage(9999)
      sheep.settleRootForRemains()
      expect(sheep.mesh.rotation.z).toBe(0)
      const y = sheep.mesh.position.y
      deadTick(sheep, 1)
      expect(sheep.mesh.rotation.z).toBe(0)
      expect(sheep.mesh.position.y).toBe(y)
    })

    it('offsets GLB corpse interaction XZ to the tipped visual mid-height for both sides', () => {
      const visual = new THREE.Object3D()
      const sheep = new AnimalAgent(makeDeps({
        def: ANIMAL_DEFS.sheep,
        animalId: 'sheep-interact',
        visual,
        x: 4,
        z: -3,
      }))
      sheep.takeDamage(9999)
      sheep.mesh.rotation.y = 0
      const half = ANIMAL_DEFS.sheep.modelHeight * 0.5
      sheep.mesh.rotation.z = Math.PI / 2
      sheep.mesh.updateMatrixWorld(true)
      expect(sheep.interactionPosition().x).toBeCloseTo(4 - half)
      expect(sheep.interactionPosition().z).toBeCloseTo(-3)
      sheep.mesh.rotation.z = -Math.PI / 2
      sheep.mesh.updateMatrixWorld(true)
      expect(sheep.interactionPosition().x).toBeCloseTo(4 + half)
      expect(sheep.interactionPosition().z).toBeCloseTo(-3)
    })

    it('keeps capsule corpses on the root XZ', () => {
      const sheep = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.sheep, animalId: 'sheep-capsule' }))
      const x = sheep.mesh.position.x
      const z = sheep.mesh.position.z
      sheep.takeDamage(9999)
      expect(sheep.interactionPosition()).toEqual({ x, z })
    })
  })
})

describe('AnimalAgent interruptible carcass feeding (plan fauna-036)', () => {
  const farObserver = () => new THREE.Vector3(1000, 0, 1000)

  function makeCorpseAt(x: number, z: number, animalId = 'corpse-rabbit'): AnimalAgent {
    const corpse = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.rabbit, animalId, x, z }))
    corpse.takeDamage(9999)
    expect(corpse.isDead()).toBe(true)
    return corpse
  }

  function tickPredator(
    predator: AnimalAgent,
    others: AnimalAgent[],
    observerPos: THREE.Vector3,
    dt: number,
  ): void {
    predator.update({
      dt,
      others,
      observerPos,
      dayFactor: 1,
      forestFactor: 0,
      litFires: [],
    })
  }

  /** Co-locate a hungry predator on a fresh corpse and advance until the
   *  carcass food target is claimed and the eat action has started. */
  function startCarcassFeed(opts: {
    def: typeof ANIMAL_DEFS.wolf
    animalId: string
    hunger?: number
  }): { predator: AnimalAgent, corpse: AnimalAgent } {
    const corpse = makeCorpseAt(0, 0)
    const predator = new AnimalAgent(makeDeps({
      def: opts.def,
      animalId: opts.animalId,
      x: 0,
      z: 0,
    }))
    predator.life.hunger = opts.hunger ?? 0.9
    predator.life.thirst = 0.2
    const others = [predator, corpse]
    for (let i = 0; i < 12; i++) {
      tickPredator(predator, others, farObserver(), 0.5)
      const food = predator.getDebugInfo().foodTarget
      if (food != null && food.actionElapsed > 0) {
        expect(corpse.claimAsFood({})).toBe(false)
        expect(corpse.foodConsumedPhase).toBeNull()
        return { predator, corpse }
      }
    }
    throw new Error('predator never started carcass feeding')
  }

  it('does not consume a carcass before CARCASS_EAT_DURATION_SEC', () => {
    const { predator, corpse } = startCarcassFeed({ def: ANIMAL_DEFS.wolf, animalId: 'wolf-mid-feed' })
    const hungerBefore = predator.life.hunger
    const already = predator.getDebugInfo().foodTarget!.actionElapsed
    // Advance almost to completion but stay strictly below the duration.
    const remaining = CARCASS_EAT_DURATION_SEC - already - 0.25
    expect(remaining).toBeGreaterThan(0)
    tickPredator(predator, [predator, corpse], farObserver(), remaining)
    expect(corpse.foodConsumedPhase).toBeNull()
    expect(corpse.claimAsFood({})).toBe(false)
    expect(predator.life.hunger).toBeGreaterThanOrEqual(hungerBefore - 0.01)
    const food = predator.getDebugInfo().foodTarget
    expect(food).not.toBeNull()
    expect(food!.actionDuration).toBe(CARCASS_EAT_DURATION_SEC)
    expect(food!.actionElapsed).toBeGreaterThan(0)
    expect(food!.actionElapsed).toBeLessThan(CARCASS_EAT_DURATION_SEC)
  })

  it('consumes the carcass exactly once after the full feeding duration', () => {
    const { predator, corpse } = startCarcassFeed({ def: ANIMAL_DEFS.wolf, animalId: 'wolf-finish-feed' })
    const hungerBefore = predator.life.hunger
    tickPredator(predator, [predator, corpse], farObserver(), CARCASS_EAT_DURATION_SEC + 1)
    expect(corpse.foodConsumedPhase).toBe('fresh')
    expect(predator.life.hunger).toBeLessThan(hungerBefore)
    // Claim is released on completion; consumed phase still blocks re-eat.
    expect(predator.getDebugInfo().foodTarget).toBeNull()
    expect(corpse.claimAsFood({})).toBe(false)
  })

  it('releases the claim without consuming when player-attack or player-flee wins', () => {
    const { predator, corpse } = startCarcassFeed({ def: ANIMAL_DEFS.wolf, animalId: 'wolf-interrupt' })
    // Inside panic range — notice is near-certain and hungry wolf resolves
    // attack or close-range flee; both cancel the source target.
    const closePlayer = new THREE.Vector3(1, 0, 0)
    let interrupted = false
    for (let i = 0; i < 20; i++) {
      tickPredator(predator, [predator, corpse], closePlayer, 0.25)
      const branch = predator.getDebugInfo().aiBranch
      if (branch === 'player-attack' || branch === 'player-flee') {
        interrupted = true
        break
      }
    }
    expect(interrupted).toBe(true)
    expect(corpse.foodConsumedPhase).toBeNull()
    expect(corpse.foodClaimedBy == null).toBe(true)
    expect(predator.getDebugInfo().foodTarget).toBeNull()
  })

  it('keeps feeding under player-ignore instead of cancelling the carcass claim', () => {
    // Hunger just elevated (needs) but below the human-attack floor so a
    // distant bear scores ignore rather than attack/flee.
    const { predator, corpse } = startCarcassFeed({
      def: ANIMAL_DEFS.bear,
      animalId: 'bear-ignore-feed',
      hunger: 0.52,
    })
    // Ahead of default yaw (forward −Z), outside panic (5) but inside notice (13).
    const calmPlayer = new THREE.Vector3(0, 0, -10)
    let sawIgnore = false
    for (let i = 0; i < 24; i++) {
      tickPredator(predator, [predator, corpse], calmPlayer, 0.25)
      if (predator.getDebugInfo().aiBranch === 'player-ignore') {
        sawIgnore = true
        expect(corpse.foodConsumedPhase).toBeNull()
        expect(corpse.foodClaimedBy).toBe(predator)
        expect(predator.getDebugInfo().foodTarget).not.toBeNull()
        break
      }
    }
    expect(sawIgnore).toBe(true)
  })

  it('restarts feeding from zero after an interrupt and reclaim', () => {
    const { predator, corpse } = startCarcassFeed({ def: ANIMAL_DEFS.wolf, animalId: 'wolf-restart' })
    expect(predator.getDebugInfo().foodTarget!.actionElapsed).toBeGreaterThan(0)

    const closePlayer = new THREE.Vector3(1, 0, 0)
    for (let i = 0; i < 20; i++) {
      tickPredator(predator, [predator, corpse], closePlayer, 0.25)
      const branch = predator.getDebugInfo().aiBranch
      if (branch === 'player-attack' || branch === 'player-flee') break
    }
    expect(corpse.foodConsumedPhase).toBeNull()
    expect(corpse.foodClaimedBy == null).toBe(true)
    expect(predator.getDebugInfo().foodTarget).toBeNull()

    // Leave the carcass while alert hold drains so we cannot accidentally
    // finish a full feed on the cool-down ticks.
    predator.mesh.position.set(40, predator.mesh.position.y, 40)
    for (let i = 0; i < 8; i++) {
      tickPredator(predator, [predator, corpse], farObserver(), 1)
      if (predator.getDebugInfo().aiBranch === 'predator-normal') break
    }
    expect(corpse.foodConsumedPhase).toBeNull()

    predator.mesh.position.set(0, predator.mesh.position.y, 0)
    predator.life.hunger = 0.9
    for (let i = 0; i < 16; i++) {
      tickPredator(predator, [predator, corpse], farObserver(), 0.25)
      const food = predator.getDebugInfo().foodTarget
      if (food != null && food.actionElapsed > 0) {
        expect(food.actionElapsed).toBeLessThanOrEqual(0.5)
        expect(corpse.foodConsumedPhase).toBeNull()
        return
      }
    }
    throw new Error('predator never reclaimed carcass after interrupt')
  })
})

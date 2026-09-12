// @vitest-environment jsdom
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { AnimalAgent, type AnimalAgentDeps } from './AnimalAgent'
import {
  advanceCaveRoute,
  type AnimalCaveContext,
  animalCaveEntityDimensions,
  type AnimalCaveWorldContract,
  resolveAnimalCaveHabitat,
} from './animalCaveHabitat'
import { ANIMAL_DEFS } from './animalDefs'

/**
 * Focused fauna-side tests for plan fauna-019's cave-aware movement/journey
 * seam. Constructs real `AnimalAgent` instances directly (capsule fallback,
 * no GLB/scene) against a small synthetic cave world contract — the same
 * "plain unit test, no Three.js scene" idiom `AnimalAgent.test.ts` already
 * uses, extended with a fake `AnimalCaveWorldContract` instead of a real
 * `Caves` instance (world-side behaviour is covered by
 * `world/caves/caveHabitat.test.ts`).
 */

const FAR_OBSERVER = new THREE.Vector3(5000, 0, 5000)
const surfaceSampleHeight = () => 5 // flat "outside" ground, far below the cave floor
const sampleLocalWater = () => DRY_WATER_SAMPLE
const collidersNear = () => []

const CAVE_ID = 'test-cave'
const HOME = { x: 100, y: 20, z: 100 }
const MID = { x: 130, y: 20, z: 115 }
const ENTRANCE = { x: 100, y: 20, z: 130 }

/** Interior/mouth void is every point with `z <= 132` — the destination used
 *  below (`z: 200`) is well past it, so "arrived at the real surface target"
 *  and "still inside this cave" can never both be true at once. */
function fakeCaveWorld(): AnimalCaveWorldContract {
  return {
    resolveHabitat: () => null,
    queryGroundIn: (_caveId, _x, _y, z) => {
      if (z > 132) return null
      return { floorY: HOME.y, ceilingY: HOME.y + 5, intervals: [{ floorY: HOME.y, ceilingY: HOME.y + 5 }] }
    },
    resolveHorizontalIn: (_caveId, x, z) => ({ x, z }),
  }
}

function caveContext(overrides: Partial<AnimalCaveContext> = {}): AnimalCaveContext {
  return {
    world: fakeCaveWorld(),
    caveId: CAVE_ID,
    homeNodeId: 'chamber',
    home: HOME,
    entrance: ENTRANCE,
    homeToEntrance: [HOME, MID, ENTRANCE],
    entranceToHome: [ENTRANCE, MID, HOME],
    homeToPoolRoute: null,
    poolWater: null,
    poolFish: null,
    entityRadius: 0.4,
    entityHeight: 1.5,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<AnimalAgentDeps> = {}): AnimalAgentDeps {
  return {
    def: ANIMAL_DEFS.bear,
    animalId: 'test-bear',
    sampleHeight: surfaceSampleHeight,
    waterLevel: -10,
    sampleLocalWater,
    collidersNear,
    x: HOME.x,
    z: HOME.z,
    ...overrides,
  }
}

function idleUpdate(agent: AnimalAgent): void {
  agent.update({
    dt: 1,
    others: [],
    observerPos: FAR_OBSERVER,
    dayFactor: 1,
    forestFactor: 0,
    litFires: [],
  })
}

describe('animalCaveHabitat pure helpers (plan fauna-019)', () => {
  it('resolves a habitat binding into a cacheable context via the narrow world contract', () => {
    const world: AnimalCaveWorldContract = {
      resolveHabitat: (caveId, entityHeight) => {
        expect(caveId).toBe(CAVE_ID)
        expect(entityHeight).toBeCloseTo(ANIMAL_DEFS.bear.modelHeight)
        return { caveId, entrance: { ...ENTRANCE, yaw: 0 }, home: HOME, routeToEntrance: [HOME, MID, ENTRANCE] }
      },
      queryGroundIn: () => null,
      resolveHorizontalIn: (_id, x, z) => ({ x, z }),
    }
    const resolved = resolveAnimalCaveHabitat(
      { habitatId: 'habitat-1', source: { kind: 'cave', caveId: CAVE_ID } },
      world,
      animalCaveEntityDimensions(ANIMAL_DEFS.bear),
    )
    expect(resolved).not.toBeNull()
    expect(resolved!.context.home).toEqual(HOME)
    expect(resolved!.context.homeToEntrance).toEqual([HOME, MID, ENTRANCE])
    expect(resolved!.context.entranceToHome).toEqual([ENTRANCE, MID, HOME])
  })

  it('fails safely (null) rather than fabricating a position when the world contract cannot resolve the cave', () => {
    const world: AnimalCaveWorldContract = {
      resolveHabitat: () => null,
      queryGroundIn: () => null,
      resolveHorizontalIn: (_id, x, z) => ({ x, z }),
    }
    const resolved = resolveAnimalCaveHabitat(
      { habitatId: 'habitat-1', source: { kind: 'cave', caveId: 'missing' } },
      world,
      animalCaveEntityDimensions(ANIMAL_DEFS.bear),
    )
    expect(resolved).toBeNull()
  })

  it('advanceCaveRoute walks the route in order via its cursor and returns null once every waypoint is reached', () => {
    const route = [HOME, MID, ENTRANCE]
    const step1 = advanceCaveRoute(route, 0, HOME.x, HOME.z, 2)
    expect(step1.point).toEqual(MID)
    const step2 = advanceCaveRoute(route, step1.index, MID.x, MID.z, 2)
    expect(step2.point).toEqual(ENTRANCE)
    const step3 = advanceCaveRoute(route, step2.index, ENTRANCE.x, ENTRANCE.z, 2)
    expect(step3.point).toBeNull()
  })

  it('degrades to "steer straight at the first waypoint" while still far from every point', () => {
    const route = [ENTRANCE, MID, HOME]
    // Far outside the cave entirely — same shape a return leg sees while
    // still crossing open surface toward the entrance.
    expect(advanceCaveRoute(route, 0, 100, 500, 2).point).toEqual(ENTRANCE)
  })

  it('does not regress to an earlier waypoint once the cursor has advanced past it', () => {
    const route = [HOME, MID, ENTRANCE]
    // Cursor already at MID (index 1) — even though HOME is geometrically
    // "far" from MID too, the cursor must never re-target it.
    const progress = advanceCaveRoute(route, 1, MID.x, MID.z, 2)
    expect(progress.point).toEqual(ENTRANCE)
  })
})

describe('AnimalAgent cave habitat integration (plan fauna-019)', () => {
  it('places a cave-bound resident at the resolved interior home Y, not surface sampleHeight or 0', () => {
    // The constructor's own initial `snapY()` pass already resolves this
    // through the cave-scoped floor query (capsule offset included) — the
    // fix under test is that it does *not* fall back to `surfaceSampleHeight`
    // (5) or a bare 0, which it would if the pre-snap Y were not seeded from
    // `cave.home.y`.
    const agent = new AnimalAgent(makeDeps({ cave: caveContext() }))
    expect(agent.mesh.position.y).toBeCloseTo(HOME.y + 0.45 * ANIMAL_DEFS.bear.scale, 5)
  })

  it("snapY() prefers this cave's own floor while interior, and falls back to surface sampleHeight once outside it", () => {
    const agent = new AnimalAgent(makeDeps({ cave: caveContext() }))
    agent.life.hunger = 0
    agent.life.thirst = 0
    idleUpdate(agent)
    // Capsule offset: +0.45 * scale (`snapY()`'s own doc) above the resolved floor.
    expect(agent.mesh.position.y).toBeCloseTo(HOME.y + 0.45 * ANIMAL_DEFS.bear.scale, 5)

    // Teleport it past the fake cave's void (z > 132) and re-snap: it must
    // now read ordinary surface height, never a stale cave floor.
    agent.mesh.position.set(100, HOME.y, 200)
    idleUpdate(agent)
    expect(agent.mesh.position.y).toBeCloseTo(surfaceSampleHeight() + 0.45 * ANIMAL_DEFS.bear.scale, 5)
  })

  it('rejects an interior wander candidate outside this cave\'s void while resolved as cave-interior, without blocking ordinary movement steps', () => {
    const agent = new AnimalAgent(makeDeps({ cave: caveContext() }))
    agent.life.hunger = 0
    agent.life.thirst = 0
    idleUpdate(agent) // one snapY() pass confirms caveInteriorNow
    // @ts-expect-error -- reaching the private method directly for a focused unit check
    expect(agent.caveWanderAccept(100, 100)).toBe(true) // inside the fake void (z <= 132)
    // @ts-expect-error -- reaching the private method directly for a focused unit check
    expect(agent.caveWanderAccept(100, 500)).toBe(false) // "rock" from this resident's own wander search
    // The shared `isWalkable()` (also used by per-tick movement stepping)
    // must stay permissive here — only wander-target *selection* is
    // cave-void-gated (plan fauna-019 §4's mouth-crossing note).
    // @ts-expect-error -- reaching the private method directly for a focused unit check
    expect(agent.isWalkable(100, 500)).toBe(true)
  })

  it('an outbound committed trip detours through the interior route before the direct surface leg', () => {
    const agent = new AnimalAgent(makeDeps({ cave: caveContext() }))
    agent.life.hunger = 0
    agent.life.thirst = 0
    agent.startSettlementDirectedTrip({ x: 100, z: 200 }, 5)
    let maxX = agent.mesh.position.x
    for (let i = 0; i < 20; i++) {
      idleUpdate(agent)
      maxX = Math.max(maxX, agent.mesh.position.x)
    }
    // Home and the real destination share x=100; only routing through MID
    // (x=130) explains the detour — a direct beeline would never move x.
    expect(maxX).toBeGreaterThan(115)
  })

  it('a non-lethal hit mid-journey does not discard trip/habitat identity — the journey still completes', () => {
    const agent = new AnimalAgent(makeDeps({ cave: caveContext() }))
    agent.life.hunger = 0
    agent.life.thirst = 0
    agent.startSettlementDirectedTrip({ x: 100, z: 200 }, 1)
    for (let i = 0; i < 5; i++) idleUpdate(agent)
    expect(agent.hasActiveTrip()).toBe(true)
    agent.takeDamage(1) // sub-lethal — must not clear the committed trip
    expect(agent.hasActiveTrip()).toBe(true)
    // Round trip is ~270m of travel at the bear's own walkSpeed (2.6 m/s);
    // generous tick budget so this is about completion, not tuned timing.
    // Stop as soon as the trip clears — ordinary post-trip wander (home is
    // a band, not a point) would otherwise drift the assertion below.
    let ticks = 0
    while (agent.hasActiveTrip() && ticks < 150) {
      idleUpdate(agent)
      ticks++
    }
    // Reached the real destination and returned all the way to interior home
    // (within the same trip/route arrival tolerance `continueTrip()` itself
    // uses to end the journey).
    expect(agent.hasActiveTrip()).toBe(false)
    expect(Math.hypot(agent.mesh.position.x - HOME.x, agent.mesh.position.z - HOME.z)).toBeLessThan(3)
  })

  it('clampBounds does not clamp position to ROAM_RADIUS while a trip is committed', () => {
    // Plain surface animal (no cave) — the same fix also unblocks any future
    // species whose water-trip searchRadius exceeds ROAM_RADIUS (plan
    // fauna-019 §6), not only a cave resident.
    const agent = new AnimalAgent(makeDeps({ cave: undefined, x: 0, z: 0 }))
    agent.life.hunger = 0
    agent.life.thirst = 0
    agent.startSettlementDirectedTrip({ x: 0, z: 200 }, 1) // well past ROAM_RADIUS (50)
    for (let i = 0; i < 60; i++) idleUpdate(agent)
    expect(Math.abs(agent.mesh.position.z)).toBeGreaterThan(50)
  })

  it('an ordinary surface animal keeps existing sampleHeight-only ground/movement (no cave)', () => {
    const agent = new AnimalAgent(makeDeps({ cave: undefined }))
    idleUpdate(agent)
    expect(agent.mesh.position.y).toBeCloseTo(surfaceSampleHeight() + 0.45 * ANIMAL_DEFS.bear.scale, 5)
    // @ts-expect-error -- reaching the private method directly for a focused unit check
    expect(agent.isWalkable(100, 500)).toBe(true)
  })
})

describe('AnimalDef.trips.water for bear (plan fauna-019 §7)', () => {
  it('is configured declaratively, same seam as deer, past its own roaming/ROAM_RADIUS band', () => {
    const config = ANIMAL_DEFS.bear.trips?.water
    expect(config).toBeDefined()
    expect(config!.searchRadius).toBeGreaterThan(0)
  })
})

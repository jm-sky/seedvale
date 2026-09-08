import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { LocalWaterSample } from '../terrain/waterSample'
import type { Household } from './household'
import { disposeObject3D } from '../assets/loadGltf'
import { type SettlementEconomy } from '../economy'
import { ANIMAL_DEFS, AnimalAgent, type VillageInfo } from '../fauna/AnimalAgent'
import { createRatModel } from '../fauna/proceduralAnimals'
import { createSeededRandom } from '../world/parseSeed'
import type { Scene } from 'three'
import type * as THREE from 'three'

/**
 * @domain fauna
 * @system settlement-rats
 * @role Settlement-local rat population pressure/reconciliation (plan
 *  fauna-016 §7/§8/§9) — deliberately not a `RatManager`: rats are plain
 *  `AnimalAgent('rat')` instances this module spawns/despawns toward a
 *  small, deterministic-target population and periodically drains real
 *  household/settlement food from. Ownership mirrors `livestock.ts`'s shape
 *  (owned by `createSettlement.ts`'s per-settlement lifecycle) without any
 *  of its household-ownership semantics — a rat is wild fauna, never
 *  `ownerHouseId`-tagged, ticked/reconciled here instead of persisted.
 */

/** Hard cap on visible active rats per settlement (plan fauna-016 §7) —
 *  "0-5 aktywnych osobników", not a hard invariant elsewhere, just the
 *  ceiling `ratPopulationTarget` clamps to. */
const RAT_POPULATION_CAP = 5
/** Food units of pressure per rat of target population (plan fauna-016 §7) —
 *  tuned so a modestly-stocked settlement (a couple dozen food units total)
 *  can reach the cap, a nearly-empty one settles near 0. */
const RAT_FOOD_PER_PRESSURE = 6
/** Pressure removed per alive settlement dog (plan fauna-016 §7/§9). */
const RAT_DOG_SUPPRESSION = 1.5

export type RatPressureInputs = {
  /** Summed `Household.foodCount()` across this settlement's households. */
  householdFoodCount: number
  /** `SettlementEconomy.query('food')` — the settlement-level store. */
  settlementFoodCount: number
  /** Alive dogs owned by this settlement's households. */
  dogCount: number
}

/** Pure target population size for a settlement's rats (plan fauna-016 §7) —
 *  scales with food availability, suppressed by dog presence, clamped to a
 *  small visible population. Pure/testable; `createSettlementRats` only
 *  calls this at its own low-frequency reconciliation cadence. */
export function ratPopulationTarget(inputs: RatPressureInputs): number {
  const pressure =
    (inputs.householdFoodCount + inputs.settlementFoodCount) / RAT_FOOD_PER_PRESSURE
    - inputs.dogCount * RAT_DOG_SUPPRESSION
  return Math.max(0, Math.min(RAT_POPULATION_CAP, Math.floor(pressure)))
}

/** Reconciliation/food-drain cadence (in-game days) — population target and
 *  food loss are only re-evaluated this often, never per-frame (plan
 *  fauna-016 §10). */
const RAT_RECONCILE_INTERVAL_DAYS = 0.5
/** Chance a given live rat eats on a reconciliation tick it's due for (see
 *  `hash01` below) — keeps food loss small/occasional instead of a flat
 *  per-rat-per-tick drain. */
const RAT_EAT_CHANCE = 0.5
/** [min,max] distance (m) from the chosen household site a newly-spawned rat
 *  appears at. */
const RAT_SPAWN_OFFSET: readonly [number, number] = [2, 6]

/** FNV-1a hash + `[0,1)` roll — same local-per-module idiom as e.g.
 *  `world/fishing.ts`'s `hashString`/`hash01` (duplicated rather than
 *  shared, matching that convention). Used only for the deterministic daily
 *  eat-roll below, so food loss doesn't depend on frame timing/order. */
function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hash01(a: number, b: number, salt: number): number {
  let h = Math.imul(a ^ salt, 2654435761) ^ Math.imul(b + 0x9e3779b9, 1597334677)
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

const RAT_EAT_ROLL_SALT = 0x52415431

export type RatFoodSite = { household: Household, x: number, z: number }

export type SettlementRatsDeps = {
  scene: Scene
  sampleHeight: HeightSampler
  waterLevel: number
  sampleLocalWater: (x: number, z: number) => LocalWaterSample
  collidersNear: ColliderSource
  /** Household + home-position pairs (plan fauna-016 §7/§8) — reused as both
   *  spawn anchors and the nearest-household food-drain target, same shape
   *  `createSettlement.ts` already builds for `householdExchangeCandidates`. */
  householdSites: readonly RatFoodSite[]
  economy: SettlementEconomy
  settlementId: string
  settlementSeed: number
  /** Reports any rat death (any cause) — mirrors `livestock.ts`'s own
   *  `onAnimalDeath` forwarding, so a rat killed by a dog/NPC/player still
   *  reaches whatever quest/telemetry hook the settlement wires in. */
  onAnimalDeath?: (animalId: string) => void
}

export type SettlementRats = {
  update: (ctx: {
    dt: number
    observerPos: THREE.Vector3
    dayFactor: number
    litFires: readonly { x: number, z: number }[]
    villages: readonly VillageInfo[]
    nowDays: number
    timeOfDay: number
    /** Alive dogs owned by this settlement, recomputed by the caller from
     *  its own `livestock` array (plan fauna-016 §7/§9) — this module never
     *  scans for dogs itself. */
    dogCount: number
  }) => void
  getAgents: () => AnimalAgent[]
  dispose: () => void
}

/** Plan fauna-016 §7/§8/§9 — see this module's own doc comment. Spawns
 *  nothing up front; the first `update()` reconciliation tick grows the
 *  population toward its pressure-derived target the same gradual way it's
 *  later shrunk. */
export function createSettlementRats(deps: SettlementRatsDeps): SettlementRats {
  let agents: AnimalAgent[] = []
  let nextRatIndex = 0
  let lastReconcileDay = -Infinity
  const random = createSeededRandom(deps.settlementSeed ^ 0x2a7d)

  function spawnOne(): void {
    if (deps.householdSites.length === 0) return
    const site = deps.householdSites[Math.floor(random() * deps.householdSites.length)]!
    const [minDist, maxDist] = RAT_SPAWN_OFFSET
    const angle = random() * Math.PI * 2
    const dist = minDist + random() * (maxDist - minDist)
    const x = site.x + Math.cos(angle) * dist
    const z = site.z + Math.sin(angle) * dist
    const animalId = `rat-${deps.settlementId}-${nextRatIndex++}`
    const agent = new AnimalAgent({
      def: ANIMAL_DEFS.rat,
      animalId,
      sampleHeight: deps.sampleHeight,
      waterLevel: deps.waterLevel,
      sampleLocalWater: deps.sampleLocalWater,
      collidersNear: deps.collidersNear,
      x,
      z,
      visual: createRatModel(),
      animations: [],
      onDeath: deps.onAnimalDeath,
    })
    deps.scene.add(agent.mesh)
    agents.push(agent)
  }

  /** Removes one live rat furthest from `observerPos` — a population
   *  shrinking toward a lower pressure target reads as "wandered off"
   *  rather than a visible pop right in front of the player. */
  function despawnFarthest(observerPos: { x: number, z: number }): void {
    let index = -1
    let bestDist = -1
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]!
      if (agent.isDead()) continue
      const d = Math.hypot(agent.mesh.position.x - observerPos.x, agent.mesh.position.z - observerPos.z)
      if (d > bestDist) {
        bestDist = d
        index = i
      }
    }
    if (index === -1) return
    const [agent] = agents.splice(index, 1)
    agent!.dispose()
    agent!.mesh.removeFromParent()
    disposeObject3D(agent!.mesh)
  }

  function reconcile(dogCount: number, observerPos: { x: number, z: number }): void {
    const householdFoodCount = deps.householdSites.reduce((sum, site) => sum + site.household.foodCount(), 0)
    const settlementFoodCount = deps.economy.query('food')
    const target = ratPopulationTarget({ householdFoodCount, settlementFoodCount, dogCount })
    const alive = agents.reduce((n, a) => n + (a.isDead() ? 0 : 1), 0)
    if (alive < target) spawnOne()
    else if (alive > target) despawnFarthest(observerPos)
  }

  /** Real food loss (plan fauna-016 §8) — routes through the exact same
   *  atomic "remove one concrete food unit" primitives every other consumer
   *  uses (`Household.takeFood`/`SettlementEconomy.withdrawFood`), never a
   *  shadow `ratFoodDamage` counter. Deterministic nearest-household
   *  selection + a hashed per-rat-per-bucket roll (not `Math.random()`) so
   *  outcomes don't depend on iteration order or frame timing. */
  function maybeEatFood(nowDays: number): void {
    if (deps.householdSites.length === 0 && deps.economy.query('food') <= 0) return
    const dayBucket = Math.floor(nowDays / RAT_RECONCILE_INTERVAL_DAYS)
    for (const rat of agents) {
      if (rat.isDead()) continue
      if (hash01(hashString(rat.animalId), dayBucket, RAT_EAT_ROLL_SALT) >= RAT_EAT_CHANCE) continue
      let nearest: Household | null = null
      let bestDist = Infinity
      for (const site of deps.householdSites) {
        const d = Math.hypot(site.x - rat.mesh.position.x, site.z - rat.mesh.position.z)
        if (d < bestDist) {
          bestDist = d
          nearest = site.household
        }
      }
      if (nearest && nearest.foodCount() > 0) {
        nearest.takeFood(nowDays)
      } else {
        deps.economy.withdrawFood(1, nowDays)
      }
    }
  }

  return {
    update(ctx) {
      for (const rat of agents) {
        rat.update({
          dt: ctx.dt,
          others: agents,
          observerPos: ctx.observerPos,
          dayFactor: ctx.dayFactor,
          forestFactor: 0,
          litFires: ctx.litFires,
          villages: ctx.villages,
          nowDays: ctx.nowDays,
          timeOfDay: ctx.timeOfDay,
        })
      }
      if (agents.some((a) => a.readyToRemove())) {
        const kept: AnimalAgent[] = []
        for (const agent of agents) {
          if (agent.readyToRemove()) {
            agent.dispose()
            agent.mesh.removeFromParent()
            disposeObject3D(agent.mesh)
          } else {
            kept.push(agent)
          }
        }
        agents = kept
      }
      if (ctx.nowDays - lastReconcileDay >= RAT_RECONCILE_INTERVAL_DAYS) {
        lastReconcileDay = ctx.nowDays
        reconcile(ctx.dogCount, ctx.observerPos)
        maybeEatFood(ctx.nowDays)
      }
    },
    getAgents: () => agents,
    dispose() {
      for (const agent of agents) {
        agent.dispose()
        agent.mesh.removeFromParent()
        disposeObject3D(agent.mesh)
      }
      agents = []
    },
  }
}

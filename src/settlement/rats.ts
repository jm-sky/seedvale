import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { LocalWaterSample } from '../terrain/waterSample'
import type { Household } from './household'
import type { RatPersistence } from './ratPersistence'
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
 *  fauna-016 §7/§8/§9, quests-progression-006, quests-progression-013) —
 *  deliberately not a `RatManager`: rats are plain `AnimalAgent('rat')`
 *  instances this module spawns toward a small, food-driven target
 *  population. Infestation replenishment is a separate nest-gated roll;
 *  excess live rats are never deleted just because the target falls.
 */

/** Hard cap on the *normal* food-driven target (plan fauna-016 §7) —
 *  damaged infestation storage may exceed it (plan quests-progression-006 §2). */
export const RAT_POPULATION_CAP = 5
/** Food units of pressure per rat of target population (plan fauna-016 §7). */
const RAT_FOOD_PER_PRESSURE = 6
/** Closed V1 contract (plan quests-progression-006 §2). */
export const RAT_INFESTATION_PRESSURE_BONUS = 3
/** Closed V1 contract (plan quests-progression-006 §2). */
export const RAT_INFESTATION_FLOOR = 7
/** Living-dog penalty on infestation replenishment only (plan
 *  quests-progression-013 §4) — not on carrying capacity. */
export const RAT_DOG_REPRODUCTION_PRESSURE = 0.10
/** Floor for the infestation replenishment multiplier at 5+ dogs. */
export const RAT_MIN_REPRODUCTION_MULTIPLIER = 0.50

export const RAT_RECONCILE_INTERVAL_DAYS = 0.5
const RAT_EAT_CHANCE = 0.5
const RAT_SPAWN_OFFSET: readonly [number, number] = [2, 6]
const RAT_EAT_ROLL_SALT = 0x52415431
const RAT_INFESTATION_REPRO_SALT = 0x52415432

export type RatPressureInputs = {
  householdFoodCount: number
  settlementFoodCount: number
}

export type RatReconcileAction = 'none' | 'spawn-infestation' | 'spawn-normal'

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

/** Pure normal target — food pressure only, independent of dogs (plan
 *  quests-progression-013 §2). */
export function ratNormalPopulationTarget(inputs: RatPressureInputs): number {
  const pressure = (inputs.householdFoodCount + inputs.settlementFoodCount) / RAT_FOOD_PER_PRESSURE
  return Math.max(0, Math.min(RAT_POPULATION_CAP, Math.floor(pressure)))
}

/** Pure target population size — damaged storage applies `max(normalTarget + 3, 7)`
 *  (plan quests-progression-006 §2 / quests-progression-013 §2). The nest
 *  does not change carrying capacity. */
export function ratPopulationTarget(inputs: RatPressureInputs, storageDamaged = false): number {
  const normalTarget = ratNormalPopulationTarget(inputs)
  if (!storageDamaged) return normalTarget
  return Math.max(normalTarget + RAT_INFESTATION_PRESSURE_BONUS, RAT_INFESTATION_FLOOR)
}

/** Infestation replenishment multiplier from living settlement dogs. */
export function ratDogReproductionMultiplier(dogCount: number): number {
  return Math.max(
    RAT_MIN_REPRODUCTION_MULTIPLIER,
    1 - Math.max(0, dogCount) * RAT_DOG_REPRODUCTION_PRESSURE,
  )
}

/** Deterministic `[0, 1)` infestation replenishment roll for one
 *  reconciliation bucket. Independent of the mutable spawn RNG so
 *  reconstruction cannot shift the outcome. */
export function infestationReplenishmentRoll(
  settlementId: string,
  settlementSeed: number,
  dayBucket: number,
): number {
  return hash01(hashString(settlementId) ^ (settlementSeed >>> 0), dayBucket, RAT_INFESTATION_REPRO_SALT)
}

/** Whether infestation replenishment succeeds this bucket. At zero dogs the
 *  multiplier is `1`, so every `[0, 1)` roll passes (plan
 *  quests-progression-013 §3). */
export function shouldInfestationReplenish(args: {
  settlementId: string
  settlementSeed: number
  dayBucket: number
  dogCount: number
}): boolean {
  return infestationReplenishmentRoll(args.settlementId, args.settlementSeed, args.dayBucket)
    < ratDogReproductionMultiplier(args.dogCount)
}

/** Pure below-target spawn decision (plan quests-progression-013 §3/§6) —
 *  never despawns. Nest-gated infestation replenishment is the only path
 *  toward the damaged-storage target; destroyed nest still allows ordinary
 *  food-driven recovery up to the normal target. */
export function ratReconcileAction(args: {
  alive: number
  normalTarget: number
  storageDamaged: boolean
  nestDestroyed: boolean
  infestationReplenish: boolean
}): RatReconcileAction {
  const target = args.storageDamaged
    ? Math.max(args.normalTarget + RAT_INFESTATION_PRESSURE_BONUS, RAT_INFESTATION_FLOOR)
    : args.normalTarget
  if (args.alive >= target) return 'none'
  // Food-driven recovery is independent of the nest and dog roll.
  if (args.alive < args.normalTarget) return 'spawn-normal'
  if (!args.nestDestroyed && args.infestationReplenish) return 'spawn-infestation'
  return 'none'
}

export type RatFoodSite = { household: Household, x: number, z: number }

export type SettlementRatsDeps = {
  scene: Scene
  sampleHeight: HeightSampler
  waterLevel: number
  sampleLocalWater: (x: number, z: number) => LocalWaterSample
  collidersNear: ColliderSource
  householdSites: readonly RatFoodSite[]
  economy: SettlementEconomy
  settlementId: string
  settlementSeed: number
  onAnimalDeath?: (animalId: string) => void
  /** Live storage-damage fact for this settlement — read every
   *  reconciliation tick, never cached here. */
  storageDamaged: () => boolean
  /** Live nest-destroyed fact — infestation replenishment only; must not
   *  suppress normal food-driven recovery. */
  nestDestroyed: () => boolean
  /** Optional persistence seam (plan quests-progression-006 §7). */
  ratPersistence?: RatPersistence
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
    dogCount: number
  }) => void
  getAgents: () => AnimalAgent[]
  dispose: () => void
}

function nextRatIndexFromSaved(saved: ReadonlyMap<string, import('./ratPersistence').RatSaveRecord> | undefined): number {
  if (!saved?.size) return 0
  let max = -1
  for (const id of saved.keys()) {
    const match = /^rat-[^-]+-(\d+)$/.exec(id)
    if (!match) continue
    const n = Number.parseInt(match[1]!, 10)
    if (n > max) max = n
  }
  return max + 1
}

export function createSettlementRats(deps: SettlementRatsDeps): SettlementRats {
  let agents: AnimalAgent[] = []
  const saved = deps.ratPersistence?.getSaved(deps.settlementId)
  const removed = deps.ratPersistence?.getRemoved(deps.settlementId)
  let nextRatIndex = nextRatIndexFromSaved(saved)
  let lastReconcileDay = -Infinity
  const random = createSeededRandom(deps.settlementSeed ^ 0x2a7d)

  function spawnOne(x: number, z: number, animalId: string, hydrate?: import('../fauna/AnimalAgent').AnimalSaveState): void {
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
    if (hydrate) agent.hydrate(hydrate)
    deps.scene.add(agent.mesh)
    agents.push(agent)
  }

  for (const record of saved?.values() ?? []) {
    if (removed?.has(record.animalId)) continue
    spawnOne(record.x, record.z, record.animalId, record)
  }

  function spawnNew(): void {
    if (deps.householdSites.length === 0) return
    const site = deps.householdSites[Math.floor(random() * deps.householdSites.length)]!
    const [minDist, maxDist] = RAT_SPAWN_OFFSET
    const angle = random() * Math.PI * 2
    const dist = minDist + random() * (maxDist - minDist)
    const x = site.x + Math.cos(angle) * dist
    const z = site.z + Math.sin(angle) * dist
    const animalId = `rat-${deps.settlementId}-${nextRatIndex++}`
    spawnOne(x, z, animalId)
  }

  function reconcile(dogCount: number, nowDays: number): void {
    const householdFoodCount = deps.householdSites.reduce((sum, site) => sum + site.household.foodCount(), 0)
    const settlementFoodCount = deps.economy.query('food')
    const normalTarget = ratNormalPopulationTarget({ householdFoodCount, settlementFoodCount })
    const alive = agents.reduce((n, a) => n + (a.isDead() ? 0 : 1), 0)
    const dayBucket = Math.floor(nowDays / RAT_RECONCILE_INTERVAL_DAYS)
    const action = ratReconcileAction({
      alive,
      normalTarget,
      storageDamaged: deps.storageDamaged(),
      nestDestroyed: deps.nestDestroyed(),
      infestationReplenish: shouldInfestationReplenish({
        settlementId: deps.settlementId,
        settlementSeed: deps.settlementSeed,
        dayBucket,
        dogCount,
      }),
    })
    if (action !== 'none') spawnNew()
  }

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
            deps.ratPersistence?.markRemoved(deps.settlementId, agent.animalId)
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
        reconcile(ctx.dogCount, ctx.nowDays)
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

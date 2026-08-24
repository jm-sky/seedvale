import type { CombatTargetHandle } from '../combat/combatIntent'
import type { Inventory } from '../items/Inventory'
import type { AnimalKind } from './AnimalAgent'
import type { Fauna } from './createFauna'
import { createSeededRandom } from '../world/parseSeed'
import { type AnimalHarvestResult, harvestAnimalIntoInventory } from './animalHarvest'
import { SPAWNER_RADIUS } from './AnimalSpawner'
import { combatTargetForAnimal } from './faunaCombat'

/**
 * Hunter target discovery + harvest hooks (plan 178) — same narrow-view shape
 * as `SettlementMiningHooks`/`SettlementFoodSourceHooks`: a bounded query +
 * a re-validated action, threaded into every `NpcAgent.create` call the same
 * way. Keeps `AnimalAgent` fully behind the hook boundary — `NpcAgent`/
 * `ai/npcHunting.ts` only ever see `AnimalKind` (a plain string union) and
 * the existing `CombatTargetHandle` seam, never the concrete class.
 */
export type HuntTarget = {
  animalId: string
  kind: AnimalKind
  target: CombatTargetHandle
}

export type SettlementHuntingHooks = {
  /** Nearest valid huntable animal within `range` of `(x, z)`, or `null` —
   *  a bounded scan over the small, already-loaded live fauna population
   *  (same cost class as `ResourceDeposits.queryNearest`'s linear scan over
   *  its own streamed-small candidate set), never a per-NPC-tick global scan.
   *  Only ever called from a Hunter's own food-need decision (plan 178 §13). */
  queryTarget: (x: number, z: number, range: number) => HuntTarget | null
  /** Re-validates and knife-harvests `target`'s corpse into `inventory` —
   *  `null` when it's no longer harvestable (already harvested/decayed since
   *  discovery) or `inventory` has no room, mirroring
   *  `SettlementFoodSourceHooks.harvest`'s re-validation contract. Closes
   *  over the same `getWorldDays` as `queryTarget` for the harvested meat's
   *  freshness stamp — callers don't need their own day source. */
  harvest: (target: HuntTarget, inventory: Inventory) => AnimalHarvestResult | null
}

/** Default preferred quarry (plan 178 §2), most- to least-preferred —
 *  everything else (predators, livestock, `bear`) is never a hunt target.
 *  Polish names in the plan: zając=rabbit, sarna=deer, jeleń=stag, dzik=boar. */
const HUNT_PREFERRED_KINDS: readonly AnimalKind[] = ['rabbit', 'deer', 'stag', 'boar']

export function huntPreferenceRank(kind: AnimalKind): number {
  const i = HUNT_PREFERRED_KINDS.indexOf(kind)
  return i === -1 ? Infinity : i
}

/** Same FNV-1a string→uint32 idiom as `terrain/resourceDeposits.ts`'s local
 *  `hashId` — a numeric seed for `createSeededRandom`. */
function hashId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** ~15 in-game-minute buckets — coarse enough that the population-protection
 *  roll (below) doesn't reroll every frame for the same encounter, fine
 *  enough that it varies across genuinely different hunt attempts over time. */
const POPULATION_PROTECTION_TIME_BUCKET = 96

/** Single-animal population protection (plan 178 §3): if the candidate's
 *  spawn point currently has exactly one living animal of its kind nearby,
 *  a deterministic, seeded 50% roll decides whether to skip it. `null`
 *  `spawnPointId` (ring spawns) or an unmatched spawner id skip the check
 *  entirely — there's no population state to protect. Never `Math.random()`
 *  (plan 178 implementation notes §5 — this is a persisted-simulation
 *  decision, seeded from the animal id + a coarse time bucket so it's
 *  reproducible for a given world state, not chosen fresh every frame). */
export function shouldSkipForPopulationProtection(
  animal: { animalId: string, spawnPointId?: string },
  kind: AnimalKind,
  agents: readonly { isDead: () => boolean, def: { kind: AnimalKind }, spawnPointId?: string, mesh: { position: { x: number, z: number } } }[],
  spawners: readonly { id: string, kind: AnimalKind, x: number, z: number }[],
  worldDays: number,
): boolean {
  if (!animal.spawnPointId) return false
  const spawner = spawners.find((s) => s.id === animal.spawnPointId)
  if (!spawner) return false
  let nearbyCount = 0
  for (const a of agents) {
    if (a.isDead() || a.def.kind !== spawner.kind) continue
    if (Math.hypot(a.mesh.position.x - spawner.x, a.mesh.position.z - spawner.z) < SPAWNER_RADIUS) nearbyCount++
  }
  if (nearbyCount !== 1) return false
  const dayBucket = Math.floor(worldDays * POPULATION_PROTECTION_TIME_BUCKET)
  const roll = createSeededRandom(hashId(`${animal.animalId}:${kind}:${dayBucket}`))()
  return roll < 0.5
}

/** Binds target discovery + harvest to a live `Fauna` (plan 178) — `getFauna`
 *  is a late-bound accessor rather than a direct `Fauna` reference because
 *  `Fauna` is constructed *after* `SettlementsManager`/every `NpcAgent` in
 *  `app/worldBundle.ts` (it needs the home settlement's center); returning
 *  `null` before that assignment lands is the same "no hooks yet" no-op a
 *  hunter with no fauna nearby already falls back from. */
export function createHuntingHooks(getFauna: () => Fauna | null, getWorldDays: () => number): SettlementHuntingHooks {
  return {
    queryTarget(x, z, range) {
      const fauna = getFauna()
      if (!fauna) return null
      const agents = fauna.getAgents()
      const spawners = fauna.getSpawners()
      const candidates = agents
        .filter((a) => !a.isDead() && HUNT_PREFERRED_KINDS.includes(a.def.kind))
        .map((a) => ({ agent: a, dist: Math.hypot(a.mesh.position.x - x, a.mesh.position.z - z) }))
        .filter((c) => c.dist <= range)
        .sort((a, b) =>
          huntPreferenceRank(a.agent.def.kind) - huntPreferenceRank(b.agent.def.kind)
          || a.dist - b.dist
          || a.agent.animalId.localeCompare(b.agent.animalId))

      for (const { agent } of candidates) {
        if (shouldSkipForPopulationProtection(agent, agent.def.kind, agents, spawners, getWorldDays())) continue
        return { animalId: agent.animalId, kind: agent.def.kind, target: combatTargetForAnimal(agent) }
      }
      return null
    },
    harvest(target, inventory) {
      const fauna = getFauna()
      if (!fauna) return null
      const animal = fauna.getAgents().find((a) => a.animalId === target.animalId)
      if (!animal) return null
      return harvestAnimalIntoInventory(animal, inventory, getWorldDays())
    },
  }
}

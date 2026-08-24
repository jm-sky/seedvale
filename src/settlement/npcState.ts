import { createNeedState, type NeedState } from '../ai/Needs'
import { MAX_VIGOR } from '../ai/npcVigor'
import { createHealthState, type HealthState } from '../shared/HealthState'
import { createStaminaState, type StaminaState } from '../shared/StaminaState'
import { createVigorState, type VigorState } from '../shared/VigorState'

export type NpcId = string

/** Baseline/fallback capacities — real NPC construction paths pass generated
 *  `NpcPhysicalMaxima` instead (plan npc-001's `generatePhysicalProfile`).
 *  Exported for the isolated-fallback default in `NpcAgent.create()`. */
export const MAX_HP = 100
export const MAX_STAMINA = 100

/**
 * Authoritative NPC entity state (plan 197) — everything an `NpcAgent`
 * mutates during simulation that must outlive that specific `NpcAgent`
 * instance across settlement unload/reload and `WorldBundle` rebuild.
 * `NpcAgent` holds direct references into these objects and mutates them in
 * place; there is no separate copy step and no second source of truth (plan
 * 197 §4), the same "shared mutable object, not a snapshot" pattern
 * `Household`/`SettlementEconomy` already use.
 *
 * Deliberately narrow — `phase`/`pendingAction`/pathfinding/combat-intent/
 * `carried` (the ore-carry inventory) stay owned by `NpcAgent` itself and
 * reset on reconstruction: transient presentation/navigation state, not
 * authoritative entity state (plan 197 §1).
 */
export type NpcAuthoritativeState = {
  readonly id: NpcId
  readonly health: HealthState
  readonly stamina: StaminaState
  readonly vigor: VigorState
  readonly needs: NeedState
}

/** Plain-data carry snapshot — mirrors `SettlementEconomy.snapshot()` /
 *  `Household.snapshot()`. Used only to seed a freshly-constructed registry
 *  across a `WorldBundle` rebuild (`rebuildWorldBundle`'s `carried*` idiom);
 *  not part of `SaveData` (plan 197 explicitly excludes full NPC save/load). */
export type NpcStateSnapshot = {
  health: { current: number, max: number, dead: boolean }
  stamina: { current: number, max: number }
  vigor: { current: number, max: number }
  needs: NeedState
}

function fromSnapshot(id: NpcId, snapshot: NpcStateSnapshot): NpcAuthoritativeState {
  return {
    id,
    health: { maxHp: snapshot.health.max, currentHp: snapshot.health.current, dead: snapshot.health.dead },
    stamina: { max: snapshot.stamina.max, current: snapshot.stamina.current },
    vigor: { max: snapshot.vigor.max, current: snapshot.vigor.current },
    needs: { ...snapshot.needs },
  }
}

/** Max HP/stamina/vigor for a newly created `NpcAuthoritativeState` — the
 *  `maxHp`/`maxStamina`/`maxVigor` subset of `npcPhysicalProfile.ts`'s
 *  `PhysicalProfile` (kept as its own narrow type here so this module
 *  doesn't need to import that standalone generator). */
export type NpcPhysicalMaxima = {
  maxHp: number
  maxStamina: number
  maxVigor: number
}

const DEFAULT_MAXIMA: NpcPhysicalMaxima = { maxHp: MAX_HP, maxStamina: MAX_STAMINA, maxVigor: MAX_VIGOR }

/** Also used directly as `NpcAgent.create()`'s isolated-fallback default
 *  (no `SettlementsManager`-backed registry available), mirroring how
 *  `economy`/`household` default to `null` there. `maxima` defaults to the
 *  flat 100/100/100 baseline only for callers with no physical profile to
 *  hand in; every real NPC construction path (`createSettlement.ts`) passes
 *  a generated one so this default is never silently relied upon there. */
export function createNpcAuthoritativeState(
  id: NpcId,
  needOffset: number,
  maxima: NpcPhysicalMaxima = DEFAULT_MAXIMA,
): NpcAuthoritativeState {
  return {
    id,
    health: createHealthState(maxima.maxHp),
    stamina: createStaminaState(maxima.maxStamina),
    vigor: createVigorState(maxima.maxVigor),
    needs: createNeedState(needOffset),
  }
}

/**
 * Per-manager NPC state map (mirrors `economy/registry.ts`'s `EconomyRegistry`
 * and `household.ts`'s `HouseholdRegistry`). Lives on `SettlementsManager`,
 * not per-`Settlement` or per-`NpcAgent` — streaming a settlement out/in, or
 * disposing/recreating its `NpcAgent`s, reuses the same state objects so
 * HP/needs/stamina/vigor (and death) survive (plan 197).
 */
export type NpcStateRegistry = {
  /** `needOffset`/`maxima` only matter the first time a given `id` is ever
   *  seen in this registry (true initial creation, no carried snapshot
   *  either) — every later call (agent dispose/recreate, settlement
   *  unload/reload) returns the same object regardless of what's passed. */
  getOrCreate: (id: NpcId, needOffset: number, maxima?: NpcPhysicalMaxima) => NpcAuthoritativeState
  get: (id: NpcId) => NpcAuthoritativeState | undefined
  clear: () => void
  /** Plain-data snapshot of every NPC state created so far — see
   *  `NpcStateSnapshot`'s doc comment. */
  serialize: () => Record<NpcId, NpcStateSnapshot>
}

export function createNpcStateRegistry(initial?: Record<NpcId, NpcStateSnapshot>): NpcStateRegistry {
  const byId = new Map<NpcId, NpcAuthoritativeState>()
  return {
    getOrCreate(id, needOffset, maxima) {
      const existing = byId.get(id)
      if (existing) return existing
      const seed = initial?.[id]
      const created = seed ? fromSnapshot(id, seed) : createNpcAuthoritativeState(id, needOffset, maxima)
      byId.set(id, created)
      return created
    },
    get(id) {
      return byId.get(id)
    },
    clear() {
      byId.clear()
    },
    serialize() {
      const out: Record<NpcId, NpcStateSnapshot> = {}
      for (const [id, state] of byId) {
        out[id] = {
          health: { current: state.health.currentHp, max: state.health.maxHp, dead: state.health.dead },
          stamina: { current: state.stamina.current, max: state.stamina.max },
          vigor: { current: state.vigor.current, max: state.vigor.max },
          needs: { ...state.needs },
        }
      }
      return out
    },
  }
}

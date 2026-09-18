import type { HelperAssignment } from '../ai/helperAssignment'
import type { NpcPlan } from '../ai/npcPlan'
import { createNeedState, type NeedState } from '../ai/Needs'
import {
  cloneNpcAccompanyCommitment,
  type NpcAccompanyCommitment,
} from '../ai/npcAccompanyCommitment'
import { cloneNpcPlayerFollowUp, type NpcPlayerFollowUp } from '../ai/npcPlayerFollowUp'
import { cloneNpcTravel, type NpcTravelContinuity } from '../ai/npcTravel'
import { MAX_VIGOR } from '../ai/npcVigor'
import {
  Inventory,
  type InventoryContentsSnapshot,
  inventoryFromContents,
  snapshotInventoryContents,
} from '../items/Inventory'
import { applyDerivedStaminaMax } from '../shared/enduranceStamina'
import { createHealthState, type HealthState } from '../shared/HealthState'
import { createStaminaState, type StaminaState } from '../shared/StaminaState'
import {
  createEmptyTemporaryConditions,
  restoreTemporaryConditions,
  type SaveTemporaryConditionsSnapshot,
  snapshotTemporaryConditions,
  type TemporaryConditionsState,
} from '../shared/temporaryConditions'
import { createVigorState, type VigorState } from '../shared/VigorState'
import { BASE_TRANSPORT_CARGO_MAX_WEIGHT_KG } from '../world/transportCapacity'
import { cloneMerchantJourney, type MerchantJourneyState } from './merchantJourney'
import {
  cloneNpcPostDeath,
  createLegacyTerminalNpcPostDeath,
  type NpcPostDeathState,
} from './npcPostDeath'

export type { SaveTemporaryConditionsSnapshot } from '../shared/temporaryConditions'

export type { NpcPostDeathState } from './npcPostDeath'

export type NpcId = string

/** Per-deceased grave-visit cooldown history (plan npc-026) — bounded to
 *  family graves this visitor has actually completed a stay at. */
export type NpcGraveVisitRecord = {
  deceasedNpcId: NpcId
  lastVisitedAtDays: number
}

/** Baseline/fallback capacities — real NPC construction paths pass generated
 *  `NpcPhysicalMaxima` instead (plan npc-001's `generatePhysicalProfile`).
 *  Exported for the isolated-fallback default in `NpcAgent.create()`. */
export const MAX_HP = 100
export const MAX_STAMINA = 100

/** Transport cargo capacity (plan settlements-npcs-019, baseline raised by
 *  settlements-npcs-047) — the no-pack-animal capacity every carrier starts
 *  with. Sourced from the shared transport-capacity resolver so a future
 *  real pack-animal assignment (plan settlements-npcs-048) can recompute
 *  this same `Inventory`'s limit via `setBaseMaxWeight()` without a second
 *  constant. */
const TRANSPORT_CARGO_MAX_WEIGHT = BASE_TRANSPORT_CARGO_MAX_WEIGHT_KG

/** Merchant shop goods are not carried on a person — no weight/gabarite cap. */
const MERCHANT_STOCK_MAX_WEIGHT = Infinity

/**
 * Authoritative NPC entity state (plan 197 / persistence-001 /
 * settlements-npcs-026) — everything an `NpcAgent` mutates during simulation
 * that must outlive that specific `NpcAgent` instance across settlement
 * unload/reload, `WorldBundle` rebuild and `SaveData.npcStates`.
 * `NpcAgent` holds direct references into these objects and mutates them in
 * place; there is no separate copy step and no second source of truth (plan
 * 197 §4), the same "shared mutable object, not a snapshot" pattern
 * `Household`/`SettlementEconomy` already use.
 *
 * Deliberately narrow — `phase`/`pendingAction`/pathfinding/combat-intent/
 * `carried` (transient work/logistics payload) stay owned by `NpcAgent`
 * itself and reset on reconstruction. Personal belongings live on
 * `personalInventory` here, not on `carried`. Transport-order cargo (plan
 * settlements-npcs-019) is a third, still-distinct owner: `transportCargo`
 * below — never mixed with `personalInventory` (personal belongings) or
 * `carried` (transient per-profession work payload). The accompany
 * commitment (plan npc-029) is semantic intent, not execution internals;
 * `travel` is the generic spatial continuity checkpoint shared with
 * off-screen handoff, not a companion-specific engine. Optional purpose /
 * survival / arrival fields (plan settlements-npcs-028) are caller context
 * on that same record, never a second travel registry.
 *
 * @domain settlements-npcs
 */
export type NpcAuthoritativeState = {
  readonly id: NpcId
  readonly health: HealthState
  readonly stamina: StaminaState
  readonly vigor: VigorState
  readonly needs: NeedState
  /** Authoritative personal belongings (plan settlements-npcs-026) — every
   *  NPC always has this container, including when it is empty. Direct
   *  reference shared with the live `NpcAgent`; reconstruction must reuse
   *  this object, never reseed a loadout. Distinct from transient
   *  `NpcAgent.carried` work cargo. */
  readonly personalInventory: Inventory
  /** Runtime-only latch: true on genuine first creation so `NpcAgent` can
   *  seed starting personal belongings once. Snapshot restore is always
   *  false — legacy saves stay empty and reconstruction never reseeds.
   *  Never persisted. */
  needsInitialPersonalLoadout: boolean
  /** Outstanding healable-physical-injury HP loss (plan npc-002) — separate
   *  from `health` itself (which stays combat/AI-agnostic): registered from
   *  accepted physical damage, relieved by actual restored HP, never derived
   *  from `health.maxHp - health.currentHp` (would conflate it with future
   *  non-physical deprivation damage). Mutable in place, same "shared
   *  object, no snapshot copy" pattern as `activePlan`. Round-trips via
   *  `NpcStateSnapshot` / `SaveData.npcStates`. */
  physicalInjury: number
  /** Lazy natural-recovery clock (plan npc-025). Optional so older snapshots
   *  initialize on first resolution to current world time without retroactive
   *  healing. Not a second injury amount — severity stays derived. */
  injuryRecoveryUpdatedAtDays?: number
  /** Helper resource-delivery assignment (plan 167) — `null` when this NPC
   *  has none. Mutable in place (assigned/cleared from the Villagers screen),
   *  the same "shared object, no snapshot copy" pattern as the other fields
   *  here. Round-trips via `NpcStateSnapshot` / `SaveData.npcStates`. */
  helperAssignment: HelperAssignment | null
  /** Persistent Goal + Strategy + progress (plan ai-004) — `null` when this
   *  NPC has no current Plan (e.g. `idle`). Mutable in place, same
   *  "shared object, no snapshot copy" pattern as `helperAssignment`.
   *  Round-trips via `NpcStateSnapshot` / `SaveData.npcStates`. */
  activePlan: NpcPlan | null
  /** Post-death / corpse record (plan npc-010) — `null` while alive. Mutable
   *  in place like `activePlan`. Survives settlement unload, `WorldBundle`
   *  rebuild and `SaveData.npcStates`; `NpcAgent` is only the loaded
   *  presentation. */
  postDeath: NpcPostDeathState | null
  /** Temporary physical conditions (plan npc-024) — shared mutable object,
   *  same lifecycle pattern as `physicalInjury`. */
  temporaryConditions: TemporaryConditionsState
  /** Completed family-grave visit timestamps (plan npc-026) — per-deceased,
   *  keyed by semantic `deceasedNpcId`, not grave mesh identity. */
  graveVisits: NpcGraveVisitRecord[]
  /** Authoritative transport-order cargo (plan settlements-npcs-019) — the
   *  carrier-owned goods of an active `TransportOrder`, once claimed on
   *  pickup. Every NPC always has this container, including when it is
   *  empty. Direct reference shared with the live `NpcAgent`'s transport
   *  flow; reconstruction must reuse this object, never re-derive contents
   *  from `TransportOrder.claimedQuantity`. Distinct from `personalInventory`
   *  (personal belongings) and `carried` (transient per-profession work
   *  payload) — never mixed. */
  readonly transportCargo: Inventory
  /**
   * Finite Merchant shop stock (plan settlements-012) — catalog-backed kinds
   * owned by this Trader, generated once and depleted by real purchases.
   * Distinct from `personalInventory`. Non-traders keep an empty container.
   */
  readonly merchantStock: Inventory
  /**
   * Persisted latch so a sold-out shop is not reseeded on stream/reload.
   * Absent/false on legacy snapshots; true after generation-time seeding.
   */
  merchantStockInitialized: boolean
  /** Source-neutral accompany/follow commitment (plan npc-029) — `null` when
   *  this NPC is not accompanying anyone. Mutable in place like `activePlan`.
   *  One NPC, one commitment. Round-trips via `NpcStateSnapshot`. */
  accompanyCommitment: NpcAccompanyCommitment | null
  /** Generic spatial continuity (plan npc-029 / settlements-npcs-028,
   *  reusing settlements-npcs-019 off-screen duration math). `null` when
   *  there is nothing to preserve across reconstruction. Absent `execution`
   *  means detailed simulation owns progress. Optional `purpose` is caller
   *  arrival context; optional `survivalResolvedAtDays` is the last settled
   *  off-screen survival checkpoint. */
  travel: NpcTravelContinuity | null
  /** Travelling Merchant journey lifecycle (plan settlements-npcs-038) —
   *  `null` while this NPC has no active journey (the common case, and every
   *  non-Trader). Mutable in place like `activePlan`. Semantic phase/context
   *  only — never a second cargo/travel clock, see `merchantJourney.ts`. */
  merchantJourney: MerchantJourneyState | null
  /** Outstanding NPC-initiated Player follow-up (plan npc-050) — `null`
   *  while this NPC has nothing pending. Mutable in place like `activePlan`.
   *  At most one active follow-up; a producer (e.g. `guardLocalKnowledge`)
   *  arms it once ready and stops being the delivery owner (implementation
   *  notes §1/§3). Round-trips via `NpcStateSnapshot`. */
  playerFollowUp: NpcPlayerFollowUp | null
}

/** Plain-data snapshot — mirrors `SettlementEconomy.snapshot()` /
 *  `Household.snapshot()`. Used both to seed a freshly-constructed registry
 *  across a `WorldBundle` rebuild (`rebuildWorldBundle`'s `carried*` idiom)
 *  and as `SaveData.npcStates` (plan persistence-001 / settlements-npcs-026). */
export type NpcStateSnapshot = {
  health: { current: number, max: number, dead: boolean }
  stamina: { current: number, max: number }
  vigor: { current: number, max: number }
  needs: NeedState
  /** Optional so an older in-session snapshot (pre-npc-002) still loads —
   *  defaults to 0, same "no outstanding injury" starting point as a freshly
   *  created state. */
  physicalInjury?: number
  /** Optional recovery-time anchor (plan npc-025). Absent means "initialize
   *  on first lazy resolution". */
  injuryRecoveryUpdatedAtDays?: number
  helperAssignment?: HelperAssignment | null
  activePlan?: NpcPlan | null
  /** Required on current saves; older in-session snapshots default below. */
  postDeath?: NpcPostDeathState | null
  /** Optional — absent means no active temporary conditions. */
  temporaryConditions?: SaveTemporaryConditionsSnapshot
  /** Optional — absent means no completed grave visits yet (plan npc-026). */
  graveVisits?: NpcGraveVisitRecord[]
  /** Required on current saves. Absent (legacy / older in-session snapshot)
   *  restores as an empty personal inventory — never a profession/role seed. */
  personalInventory?: InventoryContentsSnapshot
  /** Transport-order cargo (plan settlements-npcs-019). Absent (legacy /
   *  older in-session snapshot, or an NPC that never carried transport
   *  cargo) restores as an empty inventory — never reconstructed from a
   *  `TransportOrder`'s `claimedQuantity`. */
  transportCargo?: InventoryContentsSnapshot
  /** Finite Merchant shop stock (plan settlements-012). Absent restores empty
   *  and uninitialized, then generation-time seeding may fill it once. */
  merchantStock?: InventoryContentsSnapshot
  merchantStockInitialized?: boolean
  /** Optional accompany commitment (plan npc-029). Absent means `null`. */
  accompanyCommitment?: NpcAccompanyCommitment | null
  /** Optional generic travel checkpoint (plan npc-029). Absent means `null`. */
  travel?: NpcTravelContinuity | null
  /** Optional merchant journey (plan settlements-npcs-038). Absent (including
   *  every pre-038 save) means no active journey. */
  merchantJourney?: MerchantJourneyState | null
  /** Optional Player follow-up (plan npc-050). Absent (including every
   *  pre-050 save) means `null` — no follow-up. */
  playerFollowUp?: NpcPlayerFollowUp | null
}

function fromSnapshot(id: NpcId, snapshot: NpcStateSnapshot, maxima?: NpcPhysicalMaxima): NpcAuthoritativeState {
  const state: NpcAuthoritativeState = {
    id,
    health: { maxHp: snapshot.health.max, currentHp: snapshot.health.current, dead: snapshot.health.dead },
    stamina: { max: snapshot.stamina.max, current: snapshot.stamina.current },
    vigor: { max: snapshot.vigor.max, current: snapshot.vigor.current },
    needs: { ...snapshot.needs },
    physicalInjury: snapshot.physicalInjury ?? 0,
    injuryRecoveryUpdatedAtDays: snapshot.injuryRecoveryUpdatedAtDays,
    helperAssignment: snapshot.helperAssignment ?? null,
    activePlan: snapshot.activePlan ?? null,
    postDeath: snapshot.postDeath !== undefined
      ? cloneNpcPostDeath(snapshot.postDeath)
      : (snapshot.health.dead ? createLegacyTerminalNpcPostDeath() : null),
    temporaryConditions: restoreTemporaryConditions(snapshot.temporaryConditions),
    graveVisits: snapshot.graveVisits?.map((entry) => ({ ...entry })) ?? [],
    personalInventory: inventoryFromContents(snapshot.personalInventory),
    transportCargo: inventoryFromContents(snapshot.transportCargo, TRANSPORT_CARGO_MAX_WEIGHT),
    merchantStock: inventoryFromContents(snapshot.merchantStock, MERCHANT_STOCK_MAX_WEIGHT, Infinity),
    merchantStockInitialized: snapshot.merchantStockInitialized === true,
    accompanyCommitment: cloneNpcAccompanyCommitment(snapshot.accompanyCommitment),
    travel: cloneNpcTravel(snapshot.travel),
    merchantJourney: cloneMerchantJourney(snapshot.merchantJourney),
    playerFollowUp: cloneNpcPlayerFollowUp(snapshot.playerFollowUp),
    needsInitialPersonalLoadout: false,
  }
  if (maxima) applyDerivedStaminaMax(state.stamina, maxima.maxStamina)
  return state
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
    physicalInjury: 0,
    helperAssignment: null,
    activePlan: null,
    postDeath: null,
    temporaryConditions: createEmptyTemporaryConditions(),
    graveVisits: [],
    personalInventory: new Inventory(),
    transportCargo: new Inventory(undefined, TRANSPORT_CARGO_MAX_WEIGHT),
    merchantStock: new Inventory(undefined, MERCHANT_STOCK_MAX_WEIGHT, undefined, undefined, Infinity),
    merchantStockInitialized: false,
    accompanyCommitment: null,
    travel: null,
    merchantJourney: null,
    playerFollowUp: null,
    needsInitialPersonalLoadout: true,
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
  /** Plain-data snapshot of every NPC state created so far — used for both
   *  in-session `WorldBundle` rebuild and `SaveData.npcStates`. */
  serialize: () => Record<NpcId, NpcStateSnapshot>
  forEach: (fn: (state: NpcAuthoritativeState, id: NpcId) => void) => void
}

export function createNpcStateRegistry(initial?: Record<NpcId, NpcStateSnapshot>): NpcStateRegistry {
  const byId = new Map<NpcId, NpcAuthoritativeState>()
  return {
    getOrCreate(id, needOffset, maxima) {
      const existing = byId.get(id)
      if (existing) return existing
      const seed = initial?.[id]
      const created = seed
        ? fromSnapshot(id, seed, maxima)
        : createNpcAuthoritativeState(id, needOffset, maxima)
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
          physicalInjury: state.physicalInjury,
          injuryRecoveryUpdatedAtDays: state.injuryRecoveryUpdatedAtDays,
          helperAssignment: state.helperAssignment,
          activePlan: state.activePlan,
          postDeath: cloneNpcPostDeath(state.postDeath),
          temporaryConditions: snapshotTemporaryConditions(state.temporaryConditions),
          graveVisits: state.graveVisits.length > 0
            ? state.graveVisits.map((entry) => ({ ...entry }))
            : undefined,
          personalInventory: snapshotInventoryContents(state.personalInventory),
          transportCargo: snapshotInventoryContents(state.transportCargo),
          merchantStock: snapshotInventoryContents(state.merchantStock),
          merchantStockInitialized: state.merchantStockInitialized || undefined,
          accompanyCommitment: cloneNpcAccompanyCommitment(state.accompanyCommitment) ?? undefined,
          travel: cloneNpcTravel(state.travel) ?? undefined,
          merchantJourney: cloneMerchantJourney(state.merchantJourney) ?? undefined,
          playerFollowUp: cloneNpcPlayerFollowUp(state.playerFollowUp) ?? undefined,
        }
      }
      return out
    },
    forEach(fn) {
      for (const [id, state] of byId) fn(state, id)
    },
  }
}

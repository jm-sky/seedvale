import type { NpcId } from './npcState'

/**
 * Manager-lifetime record of a colony bootstrapped from an arrived
 * expedition (plan settlements-003) — the persisted "this nonprocedural
 * settlement exists" fact. Deliberately narrow: economy, households, NPC
 * state, tents and site infrastructure stay owned by their existing
 * registries (`EconomyRegistry`, `HouseholdRegistry`, `NpcStateRegistry`,
 * `PlacedTents`, `siteInfrastructure.ts`) and are never duplicated here.
 *
 * @domain settlements
 */
export type FoundedSettlementRecord = {
  readonly id: string
  readonly siteId: string
  readonly x: number
  readonly z: number
  readonly sponsorSettlementId: string
  readonly residentNpcIds: readonly NpcId[]
  readonly foundedAtDays: number
}

/**
 * Deterministic founded-settlement id from a stable site identity — a
 * namespaced id, never a random/timestamp one, so bootstrap stays idempotent
 * by construction. A `siteId` that ever resolved to a different existing
 * record is a contract error, not a reason to mint a new id.
 *
 * @domain settlements
 */
export function foundedSettlementId(siteId: string): string {
  return `settlement:founded:${siteId}`
}

/** Deterministic one-founder-per-household id (plan settlements-003 §"Households"). */
export function foundedHouseholdId(settlementId: string, npcId: NpcId): string {
  return `${settlementId}:household:founder:${npcId}`
}

/** Deterministic physical-tent id for one founder's home (plan settlements-003 §"Tents"). */
export function foundedTentId(settlementId: string, npcId: NpcId): string {
  return `${settlementId}:tent:${npcId}`
}

/** Plain-data carry/save snapshot — same `initial*`/`serialize()` idiom as
 *  `HouseholdRegistry`/`NpcStateRegistry`. `residency` is the explicit
 *  `NpcId -> settlementId` membership override; only migrated/founded
 *  residents ever get an entry. */
export type FoundedSettlementRegistrySnapshot = {
  records: Record<string, FoundedSettlementRecord>
  residency: Record<NpcId, string>
}

/**
 * Manager-owned registry of founded (nonprocedural) settlements plus the
 * explicit NPC residency override they require. Lives on
 * `SettlementsManager` for the world's lifetime, the same "long-lived
 * registry, stock-only carry snapshot on rebuild/save" contract as
 * `HouseholdRegistry`/`NpcStateRegistry`.
 *
 * @domain settlements
 * @system founded-settlement
 * @role Owns founded-settlement records and NPC settlement-residency overrides.
 * @owns FoundedSettlementRecord
 */
export type FoundedSettlementRegistry = {
  get: (settlementId: string) => FoundedSettlementRecord | undefined
  getBySiteId: (siteId: string) => FoundedSettlementRecord | undefined
  list: () => readonly FoundedSettlementRecord[]
  /** Throws on an id collision — a stable-id conflict is a contract error
   *  (plan settlements-003), never a reason to mint a second id. Callers
   *  must check `get`/`getBySiteId` first (idempotency boundary lives in
   *  `bootstrapFoundedSettlement`, not here). */
  create: (record: FoundedSettlementRecord) => void
  /** Explicit `NpcId -> settlementId` residency override. `undefined` means
   *  this NPC keeps its ordinary procedural source-settlement
   *  interpretation. */
  residencyOf: (npcId: NpcId) => string | undefined
  setResidency: (npcId: NpcId, settlementId: string) => void
  clear: () => void
  serialize: () => FoundedSettlementRegistrySnapshot
}

export function createFoundedSettlementRegistry(
  initial?: FoundedSettlementRegistrySnapshot,
): FoundedSettlementRegistry {
  const byId = new Map<string, FoundedSettlementRecord>(
    initial?.records ? Object.entries(initial.records) : [],
  )
  const residency = new Map<NpcId, string>(
    initial?.residency ? Object.entries(initial.residency) : [],
  )
  return {
    get: (settlementId) => byId.get(settlementId),
    getBySiteId: (siteId) => byId.get(foundedSettlementId(siteId)),
    list: () => [...byId.values()],
    create(record) {
      if (byId.has(record.id)) {
        throw new Error(`[foundedSettlement] settlement id already exists: ${record.id}`)
      }
      byId.set(record.id, record)
    },
    residencyOf: (npcId) => residency.get(npcId),
    setResidency(npcId, settlementId) {
      residency.set(npcId, settlementId)
    },
    clear() {
      byId.clear()
      residency.clear()
    },
    serialize() {
      return {
        records: Object.fromEntries(byId),
        residency: Object.fromEntries(residency),
      }
    },
  }
}

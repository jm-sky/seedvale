import type { ItemKind } from '../items/items'
import type { EconomicKind } from './kinds'
import type { SettlementEconomy } from './settlementEconomy'
import { Inventory } from '../items/Inventory'
import { productionDefById } from './production'
import {
  preflightProductionInputs,
  type ProductionBlockedCategory,
  type ProductionContext,
  type ProductionResult,
} from './productionExecutor'

/**
 * Compact observation of a still-blocked production input (plan
 * settlements-npcs-017). Economy-owned, not NPC-owned; no queued action.
 *
 * @domain settlements-npcs
 */
export type ProductionShortageRecord = {
  recipeId: string
  category: ProductionBlockedCategory
  kind: EconomicKind | ItemKind
  /** Set only when the missing owner is household-scoped item storage. */
  householdId?: string
  firstBlockedSimTime: number
  lastBlockedSimTime: number
}

/** Three typical workplace bouts (`WORK_DURATION_RANGE` 2–4s). Simulation time, not frames. */
export const PRODUCTION_SHORTAGE_PERSISTENCE_SEC = 12

export function productionShortageKey(record: {
  recipeId: string
  category: ProductionBlockedCategory
  kind: string
  householdId?: string
}): string {
  return `${record.recipeId}|${record.category}|${record.kind}|${record.householdId ?? ''}`
}

export function isProductionShortagePersistent(
  record: ProductionShortageRecord,
  simTime: number = record.lastBlockedSimTime,
): boolean {
  return simTime - record.firstBlockedSimTime >= PRODUCTION_SHORTAGE_PERSISTENCE_SEC
}

/**
 * Record or refresh a blocked-input observation. Repeated failures reuse one key.
 *
 * @domain settlements-npcs
 */
export function observeProductionShortage(
  byKey: Map<string, ProductionShortageRecord>,
  record: Omit<ProductionShortageRecord, 'firstBlockedSimTime' | 'lastBlockedSimTime'> & {
    simTime: number
  },
): ProductionShortageRecord {
  const key = productionShortageKey(record)
  const existing = byKey.get(key)
  const next: ProductionShortageRecord = {
    recipeId: record.recipeId,
    category: record.category,
    kind: record.kind,
    firstBlockedSimTime: existing?.firstBlockedSimTime ?? record.simTime,
    lastBlockedSimTime: record.simTime,
    ...(record.householdId !== undefined ? { householdId: record.householdId } : {}),
  }
  byKey.set(key, next)
  return next
}

export function clearProductionShortageByRecipe(
  byKey: Map<string, ProductionShortageRecord>,
  recipeId: string,
  householdId?: string,
): void {
  for (const [key, record] of byKey) {
    if (record.recipeId !== recipeId) continue
    if ((record.householdId ?? '') !== (householdId ?? '')) continue
    byKey.delete(key)
  }
}

/**
 * Apply one executor outcome: success clears that recipe; `insufficient-input`
 * observes the executor's exact blocked kind.
 *
 * @domain settlements-npcs
 */
export function applyProductionOutcome(
  byKey: Map<string, ProductionShortageRecord>,
  result: ProductionResult,
  simTime: number,
  householdId?: string,
): void {
  if (result.ok) {
    clearProductionShortageByRecipe(byKey, result.recipeId, householdId)
    return
  }
  if (result.reason !== 'insufficient-input' || !result.category || result.kind === undefined) return
  observeProductionShortage(byKey, {
    recipeId: result.recipeId,
    category: result.category,
    kind: result.kind,
    simTime,
    ...(householdId !== undefined ? { householdId } : {}),
  })
}

export type ProductionShortageRevalidateContext = {
  simTime: number
  economy: SettlementEconomy
  itemOwner?: { householdId: string, inventory: Inventory }
}

/**
 * Drop shortage entries whose required inputs are available again.
 * Item-scoped rows wait for a matching household inventory; stock rows
 * revalidate against the settlement economy immediately.
 *
 * @domain settlements-npcs
 */
export function revalidateProductionShortages(
  byKey: Map<string, ProductionShortageRecord>,
  ctx: ProductionShortageRevalidateContext,
): void {
  for (const [key, record] of [...byKey]) {
    const def = productionDefById(record.recipeId)
    if (!def) {
      byKey.delete(key)
      continue
    }
    if (record.category === 'item') {
      if (!record.householdId || ctx.itemOwner?.householdId !== record.householdId) continue
    }
    const preflightCtx: ProductionContext = { economy: ctx.economy }
    if (record.category === 'item') {
      if (ctx.itemOwner) preflightCtx.inventory = ctx.itemOwner.inventory
    } else {
      preflightCtx.inventory = ctx.itemOwner?.inventory ?? new Inventory()
    }
    const result = preflightProductionInputs(def, preflightCtx)
    if (result.ok) {
      byKey.delete(key)
      continue
    }
    if (result.reason === 'insufficient-input' && result.category === record.category && result.kind === record.kind) {
      continue
    }
    if (result.reason === 'insufficient-input' && result.category && result.kind !== undefined) {
      byKey.delete(key)
      observeProductionShortage(byKey, {
        recipeId: record.recipeId,
        category: result.category,
        kind: result.kind,
        simTime: record.firstBlockedSimTime,
        ...(record.householdId !== undefined ? { householdId: record.householdId } : {}),
      })
      const refreshed = byKey.get(productionShortageKey({
        recipeId: record.recipeId,
        category: result.category,
        kind: result.kind,
        householdId: record.householdId,
      }))
      if (refreshed) refreshed.lastBlockedSimTime = ctx.simTime
      continue
    }
    if (result.reason === 'unavailable-destination' && record.category === 'item' && !preflightCtx.inventory) {
      continue
    }
    byKey.delete(key)
  }
}

export function snapshotProductionShortages(
  byKey: Map<string, ProductionShortageRecord>,
): ProductionShortageRecord[] {
  return [...byKey.values()].map((record) => ({ ...record }))
}

export function loadProductionShortages(
  rows: readonly ProductionShortageRecord[] | undefined,
): Map<string, ProductionShortageRecord> {
  const byKey = new Map<string, ProductionShortageRecord>()
  if (!rows) return byKey
  for (const row of rows) {
    byKey.set(productionShortageKey(row), { ...row })
  }
  return byKey
}

import type { Inventory, ItemAmount } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { EconomicKind } from './kinds'
import type { ProductionDef } from './production'
import type { SettlementEconomy } from './settlementEconomy'
import type { StockAmount } from './stock'

/**
 * Explicit owners for one synchronous recipe commit. The executor never
 * searches the world, other households, the trader, or the player inventory.
 *
 * @domain settlements-npcs
 */
export type ProductionContext = {
  /** Settlement bulk stock owner for `inputs` / `outputs`. */
  economy?: SettlementEconomy
  /** Concrete item owner for `itemInputs` / `itemOutputs`. */
  inventory?: Inventory
  /** Completion time for stock history and perishable acquisition. */
  simTime?: number
}

export type ProductionBlockedCategory = 'stock' | 'item'

export type ProductionFailureReason =
  | 'invalid-recipe'
  | 'insufficient-input'
  | 'unavailable-destination'
  | 'transaction-failed'

/**
 * Plain-data outcome of one recipe attempt. `insufficient-input` is the
 * blocked-by-input signal downstream 017 can read; nothing here is persisted.
 *
 * @domain settlements-npcs
 */
export type ProductionResult =
  | { ok: true, recipeId: string }
  | {
      ok: false
      recipeId: string
      reason: ProductionFailureReason
      category?: ProductionBlockedCategory
      kind?: EconomicKind | ItemKind
    }

type Aggregated<K extends string> = { kind: K, amount: number }

type NormalizedRecipe = {
  stockInputs: readonly Aggregated<EconomicKind>[]
  stockOutputs: readonly Aggregated<EconomicKind>[]
  itemInputs: readonly Aggregated<ItemKind>[]
  itemOutputs: readonly Aggregated<ItemKind>[]
}

/**
 * Stateless all-or-nothing production commit (plan settlements-npcs-015).
 * Validates and aggregates the recipe, preflights every participating owner,
 * then mutates once. Empty recipes are successful no-ops and do not require
 * owners.
 *
 * @domain settlements-npcs
 */
export function executeProduction(
  def: ProductionDef,
  ctx: ProductionContext = {},
): ProductionResult {
  const recipeId = def.id
  const simTime = ctx.simTime ?? 0
  const normalized = normalizeRecipe(def)
  if (!normalized.ok) {
    return {
      ok: false,
      recipeId,
      reason: 'invalid-recipe',
      category: normalized.category,
      kind: normalized.kind,
    }
  }

  const { stockInputs, stockOutputs, itemInputs, itemOutputs } = normalized.recipe
  const needsStock = stockInputs.length > 0 || stockOutputs.length > 0
  const needsItems = itemInputs.length > 0 || itemOutputs.length > 0

  if (needsStock && !ctx.economy) {
    return fail(recipeId, 'unavailable-destination', 'stock', stockKind(stockInputs, stockOutputs))
  }
  if (needsItems && !ctx.inventory) {
    return fail(recipeId, 'unavailable-destination', 'item', itemKind(itemInputs, itemOutputs))
  }

  const economy = ctx.economy
  const inventory = ctx.inventory

  if (economy) {
    for (const { kind, amount } of stockInputs) {
      if (economy.query(kind) < amount) {
        return fail(recipeId, 'insufficient-input', 'stock', kind)
      }
    }
  }

  if (inventory) {
    for (const { kind, amount } of itemInputs) {
      if (!inventory.has(kind, amount)) {
        return fail(recipeId, 'insufficient-input', 'item', kind)
      }
    }
    if (needsItems && !inventory.canApplyRecipe(itemInputs, itemOutputs)) {
      return fail(recipeId, 'unavailable-destination', 'item', itemKind(itemInputs, itemOutputs))
    }
  }

  if (inventory && needsItems && !inventory.applyRecipe(itemInputs, itemOutputs, simTime)) {
    return { ok: false, recipeId, reason: 'transaction-failed' }
  }

  if (economy && needsStock) {
    for (const { kind, amount } of stockInputs) {
      if (!economy.remove(kind, amount, simTime)) {
        return { ok: false, recipeId, reason: 'transaction-failed', category: 'stock', kind }
      }
    }
    for (const { kind, amount } of stockOutputs) {
      economy.add(kind, amount, simTime)
    }
  }

  return { ok: true, recipeId }
}

function fail(
  recipeId: string,
  reason: ProductionFailureReason,
  category?: ProductionBlockedCategory,
  kind?: EconomicKind | ItemKind,
): ProductionResult {
  return { ok: false, recipeId, reason, category, kind }
}

function stockKind(
  inputs: readonly Aggregated<EconomicKind>[],
  outputs: readonly Aggregated<EconomicKind>[],
): EconomicKind | undefined {
  return inputs[0]?.kind ?? outputs[0]?.kind
}

function itemKind(
  inputs: readonly Aggregated<ItemKind>[],
  outputs: readonly Aggregated<ItemKind>[],
): ItemKind | undefined {
  return inputs[0]?.kind ?? outputs[0]?.kind
}

function normalizeRecipe(
  def: ProductionDef,
):
  | { ok: true, recipe: NormalizedRecipe }
  | { ok: false, category?: ProductionBlockedCategory, kind?: EconomicKind | ItemKind } {
  const stockInputs = aggregateStock(def.inputs)
  if (!stockInputs.ok) return stockInputs
  const stockOutputs = aggregateStock(def.outputs)
  if (!stockOutputs.ok) return stockOutputs
  const itemInputs = aggregateItems(def.itemInputs ?? [])
  if (!itemInputs.ok) return itemInputs
  const itemOutputs = aggregateItems(def.itemOutputs ?? [])
  if (!itemOutputs.ok) return itemOutputs
  return {
    ok: true,
    recipe: {
      stockInputs: stockInputs.rows,
      stockOutputs: stockOutputs.rows,
      itemInputs: itemInputs.rows,
      itemOutputs: itemOutputs.rows,
    },
  }
}

function aggregateStock(
  rows: readonly StockAmount[],
):
  | { ok: true, rows: Aggregated<EconomicKind>[] }
  | { ok: false, category?: ProductionBlockedCategory, kind?: EconomicKind | ItemKind } {
  const aggregated = aggregateAmounts(rows)
  if (!aggregated) return { ok: false }
  for (const row of aggregated) {
    if (row.kind === 'food') return { ok: false, category: 'stock', kind: 'food' }
  }
  return { ok: true, rows: aggregated }
}

function aggregateItems(
  rows: readonly ItemAmount[],
):
  | { ok: true, rows: Aggregated<ItemKind>[] }
  | { ok: false, category?: ProductionBlockedCategory, kind?: EconomicKind | ItemKind } {
  const aggregated = aggregateAmounts(rows)
  if (!aggregated) return { ok: false }
  return { ok: true, rows: aggregated }
}

function aggregateAmounts<K extends string>(
  rows: readonly { kind: K, amount: number }[],
): Aggregated<K>[] | null {
  const byKind = new Map<K, number>()
  const order: K[] = []
  for (const { kind, amount } of rows) {
    if (!Number.isFinite(amount) || amount < 0) return null
    if (amount === 0) continue
    if (!byKind.has(kind)) order.push(kind)
    byKind.set(kind, (byKind.get(kind) ?? 0) + amount)
  }
  return order.map((kind) => ({ kind, amount: byKind.get(kind)! }))
}

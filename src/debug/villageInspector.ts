import type { SettlementDef } from '../settlement/settlementGenerator'
import type { SettlementsManager } from '../settlement/SettlementsManager'
import { cellFromId } from '../settlement/settlementGenerator'

/**
 * Read-only lookup layer over settlement defs for `debug.village`/`villages`
 * (plan `ui-input-001`) — mirrors `npcInspector.ts`'s "never cache, re-derive
 * from the live manager every call" contract. `peekDef` is cheap/cached and
 * works whether or not the settlement is currently streamed in, so this
 * never needs to force-load anything.
 */

/** Resolves a `debug.village(id)` id back to its `SettlementDef`, whether or
 *  not that settlement is currently loaded. `null` for a malformed id or a
 *  cell with no def (e.g. open ocean). */
export function findVillageDef(settlementsManager: SettlementsManager, id: string): SettlementDef | null {
  const cell = cellFromId(id)
  if (!cell) return null
  return settlementsManager.peekDef(cell)
}

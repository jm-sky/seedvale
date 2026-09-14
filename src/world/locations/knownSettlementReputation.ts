import type { LocationKnowledge } from './locationKnowledge'
import type { WorldLocationCatalog } from './worldLocationCatalog'
import { worldLocationKindFromId } from './worldLocationTypes'

/**
 * One known settlement the Character Screen can select (plan ui-input-019).
 * `settlementId` is `SettlementDef.id` / `ReputationManager`'s key — not the
 * `WorldLocation.id` (`settlement:<def.id>`).
 *
 * @domain ui-input
 */
export type KnownSettlementOption = {
  settlementId: string
  settlementName: string
}

/**
 * Reads `SettlementDef.id` out of a `WorldLocation.id` of kind `settlement`.
 * `null` for any other location id.
 *
 * @domain ui-input
 */
export function settlementIdFromLocationId(locationId: string): string | null {
  if (worldLocationKindFromId(locationId) !== 'settlement') return null
  const sep = locationId.indexOf(':')
  const settlementId = locationId.slice(sep + 1)
  return settlementId.length > 0 ? settlementId : null
}

/**
 * Known settlements for Character Screen reputation: `LocationKnowledge`
 * entries of kind `settlement` that still resolve through the world catalog.
 * Unknown generated settlements never appear. Neutral known settlements do.
 *
 * Sorted by display name (`pl`), then stable settlement id.
 *
 * @domain ui-input
 */
export function listKnownSettlementOptions(
  knowledge: Pick<LocationKnowledge, 'list'>,
  catalog: Pick<WorldLocationCatalog, 'getById'>,
): KnownSettlementOption[] {
  const options: KnownSettlementOption[] = []
  for (const entry of knowledge.list()) {
    const settlementId = settlementIdFromLocationId(entry.id)
    if (!settlementId) continue
    const location = catalog.getById(entry.id)
    if (!location || location.kind !== 'settlement') continue
    options.push({ settlementId, settlementName: location.name })
  }
  options.sort((a, b) => {
    const byName = a.settlementName.localeCompare(b.settlementName, 'pl')
    return byName !== 0 ? byName : a.settlementId.localeCompare(b.settlementId)
  })
  return options
}

/**
 * Default Character Screen settlement: current area, else a still-known
 * previous selection, else last visited, else home, else the first known
 * option. `null` only when there are no known settlements.
 *
 * @domain ui-input
 */
export function resolveCharacterReputationSettlementId(input: {
  options: readonly KnownSettlementOption[]
  currentSettlementId: string | null
  lastVisitedSettlementId: string | null
  homeSettlementId: string | null
  previousSelectedSettlementId: string | null
}): string | null {
  const known = new Set(input.options.map((option) => option.settlementId))
  const pick = (id: string | null): string | null => (id && known.has(id) ? id : null)
  return pick(input.currentSettlementId)
    ?? pick(input.previousSelectedSettlementId)
    ?? pick(input.lastVisitedSettlementId)
    ?? pick(input.homeSettlementId)
    ?? input.options[0]?.settlementId
    ?? null
}

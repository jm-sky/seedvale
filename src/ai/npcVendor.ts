import type { Role } from './characters'

/**
 * Semantic vendor identity — profession/profile, not trade eligibility
 * (plan settlements-npcs-042). Ordinary owned-goods trade stays on
 * `npcTradeAvailability`; this marker only names NPCs the world presents
 * as a stable source of a kind of goods.
 *
 * @domain settlements-npcs
 */
export type NpcVendorKind = 'merchant' | 'blacksmith' | 'hunter'

/** Presentation token for the shared NPC label vendor marker. */
export const NPC_VENDOR_MARKER = '◈'

/**
 * Resolves whether an NPC is a recognizable vendor from authoritative
 * `Role`. Independent of live stock, offers, and Merchant specialization.
 *
 * @domain settlements-npcs
 */
export function resolveNpcVendorKind(role: Role): NpcVendorKind | null {
  switch (role) {
    case 'blacksmith':
      return 'blacksmith'
    case 'hunter':
      return 'hunter'
    case 'trader':
      return 'merchant'
    default:
      return null
  }
}

/** Label token for a vendor role, or `null` when the NPC is not a vendor. */
export function npcVendorMarker(role: Role): string | null {
  return resolveNpcVendorKind(role) ? NPC_VENDOR_MARKER : null
}

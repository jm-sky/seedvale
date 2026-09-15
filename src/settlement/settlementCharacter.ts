import type { SettlementTerrain } from '../shared/SettlementName'
import type { VillageSize } from './families'
import type { SettlementCharacter } from './villagePlan'
import { createSeededRandom } from '../world/parseSeed'

/** Isolated from family/layout/staffing/fauna seed streams. */
export const SETTLEMENT_CHARACTER_SALT = 0x10c105ed

/** Forest is the cautious/closed biome — distinctly higher than other terrains. */
const FOREST_CLOSED_CHANCE = 0.42
/** Low background chance on non-forest terrain. */
const OTHER_CLOSED_CHANCE = 0.08

/**
 * Generation-time inputs for {@link resolveSettlementCharacter}. Terrain
 * weighting is a pure resolver so distribution can be tested without a full
 * village.
 *
 * @domain settlements
 */
export type SettlementCharacterInput = {
  seedForCell: number
  isHome: boolean
  size: VillageSize
  terrain: SettlementTerrain
}

/**
 * Deterministic settlement archetype for one cell. Home and OUTPOST stay
 * `default`. Character does not depend on live world state.
 *
 * @domain settlements
 */
export function resolveSettlementCharacter(input: SettlementCharacterInput): SettlementCharacter {
  if (input.isHome || input.size === 'OUTPOST') return 'default'
  const random = createSeededRandom(input.seedForCell ^ SETTLEMENT_CHARACTER_SALT)
  const chance = input.terrain === 'forest' ? FOREST_CLOSED_CHANCE : OTHER_CLOSED_CHANCE
  return random() < chance ? 'closed' : 'default'
}

/** Closed-chance used by distribution tests — not a runtime tuning knob. */
export const SETTLEMENT_CHARACTER_CHANCES = {
  forest: FOREST_CLOSED_CHANCE,
  other: OTHER_CLOSED_CHANCE,
} as const

import type { Role } from '../ai/characters'
import type { CaveArchetype } from '../world/caves/caveArchetype'
import { cardinalDirectionPhrase } from './cardinalDirection'

/** Roles that may speak a cave's canonical world-location name. */
const CAVE_NAME_ROLES: ReadonlySet<Role> = new Set(['guard', 'hunter', 'miner', 'trader'])

const ARCHETYPE_PHRASE: Record<CaveArchetype, string> = {
  natural: 'mała jaskinia',
  adventure: 'głęboka jaskinia',
  dungeon: 'stary loch',
}

const MISSING_DIRECTION_FALLBACK = 'poza osadą'

export type CaveLocationDescriptionInput = {
  archetype: CaveArchetype
  /** Raw output of `cardinalDirectionPhrase()` (`na północ`), or `null`. */
  directionPhrase: string | null
  canonicalName: string | null
  speakerRole: Role | null
}

/**
 * Pure player-facing cave location phrase from already-resolved presentation
 * inputs. Callers own world identity, cave lookup, settlement origin and
 * speaker role; this helper never searches the world, samples terrain, or
 * persists a chosen wording.
 *
 * @domain quests-progression
 */
export function describeCaveLocation(input: CaveLocationDescriptionInput): string {
  const direction = input.directionPhrase
    ? `${input.directionPhrase} od osady`
    : MISSING_DIRECTION_FALLBACK
  const name = input.canonicalName?.trim() || null
  if (name && input.speakerRole != null && CAVE_NAME_ROLES.has(input.speakerRole)) {
    return `${name}, ${direction}`
  }
  return `${ARCHETYPE_PHRASE[input.archetype]} ${direction}`
}

export type CaveQuestPresentationInput = {
  archetype: CaveArchetype | null
  location: { x: number, z: number, name: string } | null
  settlementX: number
  settlementZ: number
  speakerRole: Role | null
}

/**
 * Resolves direction from already-fetched location coordinates, then formats
 * the player-facing cave phrase. Does not look up caves or world locations.
 *
 * @domain quests-progression
 */
export function resolveCaveQuestPresentation(input: CaveQuestPresentationInput): string {
  const directionPhrase = input.location
    ? cardinalDirectionPhrase(
      input.location.x - input.settlementX,
      input.location.z - input.settlementZ,
    )
    : null
  return describeCaveLocation({
    archetype: input.archetype ?? 'natural',
    directionPhrase,
    canonicalName: input.location?.name ?? null,
    speakerRole: input.speakerRole,
  })
}

import type { LandmarkKind } from '../terrain/chunkEnvironment'
import { LANDMARK_LABELS } from '../terrain/chunkEnvironment'
import { cardinalDirectionPhrase } from './cardinalDirection'

const MISSING_DIRECTION_FALLBACK = 'w okolicy osady'

export type LandmarkLocationDescriptionInput = {
  landmarkKind: LandmarkKind
  landmarkX: number
  landmarkZ: number
  originX: number
  originZ: number
  settlementName?: string | null
}

/**
 * Deterministic player-facing place phrase for a static landmark relative to
 * a settlement origin. Callers own world identity and coordinates; this helper
 * never searches the world or persists a chosen wording.
 *
 * @domain quests-progression
 */
export function describeLandmarkLocation(input: LandmarkLocationDescriptionInput): string {
  const place = LANDMARK_LABELS[input.landmarkKind].toLowerCase()
  const direction = cardinalDirectionPhrase(
    input.landmarkX - input.originX,
    input.landmarkZ - input.originZ,
  )
  const settlement = input.settlementName?.trim()
  if (direction && settlement) return `${place} ${direction} od ${settlement}`
  if (direction) return `${place} ${direction} od osady`
  if (settlement) return `${place} przy osadzie ${settlement}`
  return `${place} ${MISSING_DIRECTION_FALLBACK}`
}

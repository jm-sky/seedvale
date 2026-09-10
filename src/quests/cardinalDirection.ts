/** Eight compass sectors used by cheap quest location hints
 *  (plan quests-progression-014). */
export const CARDINAL_SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export type CardinalSector = (typeof CARDINAL_SECTORS)[number]

const POLISH_PHRASE: Record<CardinalSector, string> = {
  N: 'na północ',
  NE: 'na północny wschód',
  E: 'na wschód',
  SE: 'na południowy wschód',
  S: 'na południe',
  SW: 'na południowy zachód',
  W: 'na zachód',
  NW: 'na północny zachód',
}

/**
 * Eight-way compass from origin to target.
 *
 * World north is −Z (the same camera-forward convention as `yawToward`);
 * east is +X. Returns `null` when origin and target coincide.
 *
 * @domain quests-progression
 */
export function cardinalSector(dx: number, dz: number): CardinalSector | null {
  if (dx === 0 && dz === 0) return null
  const angleDeg = Math.atan2(dx, -dz) * (180 / Math.PI)
  const normalized = ((angleDeg % 360) + 360) % 360
  const index = Math.round(normalized / 45) % 8
  return CARDINAL_SECTORS[index]!
}

/** Polish directional phrase such as `na północny wschód`, or `null` when coincident. */
export function cardinalDirectionPhrase(dx: number, dz: number): string | null {
  const sector = cardinalSector(dx, dz)
  return sector ? POLISH_PHRASE[sector] : null
}

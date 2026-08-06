import type { HeightSampler } from '../player/PlayerController'
import { createSeededRandom } from '../world/parseSeed'

export type SettlementSite = {
  x: number
  z: number
  y: number
}

/**
 * Pick a walkable, relatively flat patch above water for the village.
 * Seeded search — same seed ⇒ same site.
 */
export function findSettlementSite(
  sampleHeight: HeightSampler,
  waterLevel: number,
  halfExtent: number,
  seed: number,
): SettlementSite {
  const random = createSeededRandom(seed ^ 0xc0ffee)
  const margin = Math.min(24, halfExtent * 0.55)
  let best: SettlementSite | null = null
  let bestScore = -Infinity

  for (let i = 0; i < 80; i++) {
    const x = (random() * 2 - 1) * margin
    const z = (random() * 2 - 1) * margin
    const y = sampleHeight(x, z)
    if (y <= waterLevel + 0.8) continue

    const step = 2.5
    const samples = [
      sampleHeight(x + step, z),
      sampleHeight(x - step, z),
      sampleHeight(x, z + step),
      sampleHeight(x, z - step),
    ]
    const maxDelta = Math.max(...samples.map((h) => Math.abs(h - y)))
    if (maxDelta > 2.2) continue

    // Prefer slightly inland flats closer to origin.
    const dist = Math.hypot(x, z)
    const score = 8 - maxDelta * 3 - dist * 0.05 + (y - waterLevel) * 0.15
    if (score > bestScore) {
      bestScore = score
      best = { x, z, y }
    }
  }

  if (best) return best

  // Fallback: origin (may be wet — still better than nothing).
  return { x: 0, z: 0, y: sampleHeight(0, 0) }
}

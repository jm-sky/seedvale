import type { NoiseFunction2D } from 'simplex-noise'

export type FbmParams = {
  octaves: number
  /** Amplitude decay per octave (typical ~0.5–0.7). */
  persistence: number
  /** Frequency growth per octave (typical ~2). */
  lacunarity: number
  /** Remap after normalize: pow(n, exponentiation). >1 → flatter valleys, sharper peaks. */
  exponentiation: number
}

/** FBM in [0, 1], then pow — SimonDev / 3d-portfolio style. */
export function fbm01(
  noise: NoiseFunction2D,
  x: number,
  z: number,
  params: FbmParams,
): number {
  const { octaves, persistence, lacunarity, exponentiation } = params
  const gain = 2 ** -persistence
  let total = 0
  let amplitude = 1
  let frequency = 1
  let norm = 0

  for (let i = 0; i < octaves; i++) {
    const n = noise(x * frequency, z * frequency) * 0.5 + 0.5
    total += n * amplitude
    norm += amplitude
    amplitude *= gain
    frequency *= lacunarity
  }

  const normalized = norm > 0 ? total / norm : 0
  return Math.pow(Math.max(0, normalized), exponentiation)
}

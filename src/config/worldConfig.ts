import type { FbmParams } from '../terrain/fbm'
import { parseSeedFromUrl } from '../world/parseSeed'

/**
 * Tunables for Seedvale — edit here or via the on-screen GUI.
 *
 * **resolution** = vertices along one edge of the terrain mesh.
 * More vertices ⇒ denser mesh ⇒ more triangles (≈ 2 × (res−1)²).
 * Examples: 65 ≈ low, 129 ≈ default, 257 ≈ high (heavier CPU gen).
 */
export type WorldConfig = {
  seed: number
  terrain: {
    /** World size on XZ (units). */
    size: number
    /** Vertices per side (prefer odd: 65 / 129 / 193 / 257). */
    resolution: number
    heightScale: number
    waterLevel: number
    /** Larger = smoother hills. */
    noiseScale: number
    fbm: FbmParams
    biome: {
      noiseScale: number
      fbm: FbmParams
    }
  }
  sky: {
    inclination: number
    azimuth: number
    turbidity: number
    rayleigh: number
  }
  /** Show lil-gui panel (`?gui=0` to hide). */
  showGui: boolean
}

export function createWorldConfig(): WorldConfig {
  const params = new URLSearchParams(window.location.search)
  const seed = parseSeedFromUrl()
  const resRaw = Number(params.get('res'))
  const resolution =
    Number.isFinite(resRaw) && resRaw >= 33
      ? Math.floor(resRaw)
      : 129

  return {
    seed,
    terrain: {
      size: 128,
      resolution,
      heightScale: 18,
      waterLevel: 0.45,
      noiseScale: 72,
      fbm: {
        octaves: 5,
        persistence: 0.55,
        lacunarity: 2.0,
        exponentiation: 2.4,
      },
      biome: {
        noiseScale: 96,
        fbm: {
          octaves: 3,
          persistence: 0.5,
          lacunarity: 2.0,
          exponentiation: 1.0,
        },
      },
    },
    sky: {
      inclination: 0.36,
      azimuth: 0.25,
      turbidity: 2.2,
      rayleigh: 2.4,
    },
    showGui: params.get('gui') !== '0',
  }
}

export function triangleCount(resolution: number): number {
  const seg = Math.max(1, resolution - 1)
  return 2 * seg * seg
}

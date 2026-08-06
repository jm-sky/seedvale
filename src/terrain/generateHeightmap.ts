import { createNoise2D } from 'simplex-noise'
import { createSeededRandom } from '../world/parseSeed'

export type HeightmapParams = {
  /** World size along X and Z. */
  size: number
  /** Vertices per side (segments + 1). Prefer power-of-two-ish, e.g. 129. */
  resolution: number
  seed: number
  /** Peak-ish vertical scale. */
  heightScale: number
  /** Heights at or below this become flat water. */
  waterLevel: number
}

export type Heightmap = {
  params: HeightmapParams
  /** Row-major, length = resolution², world Y. */
  heights: Float32Array
  sample: (worldX: number, worldZ: number) => number
}

function fbm(
  noise: (x: number, y: number) => number,
  x: number,
  z: number,
  octaves: number,
): number {
  let value = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    value += noise(x * freq, z * freq) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return value / norm
}

export function generateHeightmap(params: HeightmapParams): Heightmap {
  const { size, resolution, seed, heightScale, waterLevel } = params
  const noise = createNoise2D(createSeededRandom(seed))
  const warp = createNoise2D(createSeededRandom(seed ^ 0x9e3779b9))
  const heights = new Float32Array(resolution * resolution)
  const half = size / 2
  const step = size / (resolution - 1)

  for (let iz = 0; iz < resolution; iz++) {
    for (let ix = 0; ix < resolution; ix++) {
      const wx = -half + ix * step
      const wz = -half + iz * step
      // Domain warp for less grid-like ridges.
      const wxw = wx + warp(wx * 0.02, wz * 0.02) * 12
      const wzw = wz + warp(wx * 0.02 + 40, wz * 0.02 + 40) * 12
      const n = fbm(noise, wxw * 0.012, wzw * 0.012, 5)
      // Gentle island falloff so edges tend toward water.
      const nx = wx / half
      const nz = wz / half
      const falloff = 1 - Math.min(1, Math.sqrt(nx * nx + nz * nz) ** 1.4 * 0.85)
      let h = n * heightScale * (0.35 + 0.65 * falloff)
      if (h < waterLevel) h = waterLevel
      heights[iz * resolution + ix] = h
    }
  }

  const sample = (worldX: number, worldZ: number): number => {
    const fx = (worldX + half) / step
    const fz = (worldZ + half) / step
    const x0 = Math.floor(fx)
    const z0 = Math.floor(fz)
    const x1 = x0 + 1
    const z1 = z0 + 1
    const tx = fx - x0
    const tz = fz - z0

    const clampi = (v: number) =>
      Math.max(0, Math.min(resolution - 1, v))

    const h00 = heights[clampi(z0) * resolution + clampi(x0)]!
    const h10 = heights[clampi(z0) * resolution + clampi(x1)]!
    const h01 = heights[clampi(z1) * resolution + clampi(x0)]!
    const h11 = heights[clampi(z1) * resolution + clampi(x1)]!

    const hx0 = h00 * (1 - tx) + h10 * tx
    const hx1 = h01 * (1 - tx) + h11 * tx
    return hx0 * (1 - tz) + hx1 * tz
  }

  return { params, heights, sample }
}

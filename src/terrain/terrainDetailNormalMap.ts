import { createNoise2D } from 'simplex-noise'
import { DataTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType, Vector3 } from 'three'
import { createSeededRandom } from '../world/parseSeed'

const SIZE = 256
/** Fixed seed — this is a generic surface-grain detail, not part of world
 *  generation, so it doesn't need to vary with `worldConfig.seed`. */
const NOISE_SEED = 0x7a11e5

/**
 * Bakes a small tileable detail normal map from a couple of layered noise
 * octaves (no external asset — same reasoning as `createOcean.ts`'s
 * procedural water normals) so flat/gently-sloped terrain reads as having a
 * bit of surface grain up close, instead of perfectly smooth geometry
 * (plan 044 §4.5, "teren wygląda płasko"). Tiles seamlessly by sampling the
 * noise on a torus (wrap the sample coordinates through a full turn) rather
 * than by mirroring/cropping.
 */
export function createTerrainNormalMap(): DataTexture {
  const noise = createNoise2D(createSeededRandom(NOISE_SEED))

  const data = new Uint8Array(SIZE * SIZE * 4)
  const normal = new Vector3()
  const heightAt = (u: number, v: number): number => {
    // Sample on a circle in each axis so the noise field is periodic over
    // [0,1) — u/v wrap around a full 2π turn at two different radii per
    // octave, giving a seamless tile without any blending pass.
    const a = u * Math.PI * 2
    const b = v * Math.PI * 2
    // Finer octaves weighted down further (0.45/0.2 → 0.3/0.1) — high-frequency
    // content is what the N8AO pass amplifies into visible speckle/noise, more
    // than `buildChunkGeometry.ts`'s `normalScale` alone can fix.
    let h = 0
    h += noise(Math.cos(a) * 3.2, Math.sin(a) * 3.2 + Math.cos(b) * 3.2) * 1.0
    h += noise(Math.cos(a) * 7.1 + 40, Math.sin(a) * 7.1 + Math.sin(b) * 7.1 + 40) * 0.3
    h += noise(Math.cos(a) * 15.3 + 90, Math.sin(a) * 15.3 + Math.sin(b) * 15.3 + 90) * 0.1
    return h
  }

  const step = 1 / SIZE
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE
      const hL = heightAt(u - step, v)
      const hR = heightAt(u + step, v)
      const hD = heightAt(u, v - step)
      const hU = heightAt(u, v + step)
      normal.set(-(hR - hL), 2, -(hU - hD)).normalize()

      const idx = (y * SIZE + x) * 4
      data[idx] = Math.round((normal.x * 0.5 + 0.5) * 255)
      data[idx + 1] = Math.round((normal.y * 0.5 + 0.5) * 255)
      data[idx + 2] = Math.round((normal.z * 0.5 + 0.5) * 255)
      data[idx + 3] = 255
    }
  }

  const tex = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

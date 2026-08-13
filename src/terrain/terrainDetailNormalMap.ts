import { createNoise4D } from 'simplex-noise'
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from 'three'
import { createSeededRandom } from '../world/parseSeed'

const SIZE = 256
/** Fixed seed — this is a generic surface-grain detail, not part of world
 *  generation, so it doesn't need to vary with `worldConfig.seed`. */
const NOISE_SEED = 0x7a11e5

/**
 * Bakes a small tileable detail normal map from a couple of layered noise
 * octaves (no external asset — same reasoning as the water shader's sine
 * ripples) so flat/gently-sloped terrain reads as having a
 * bit of surface grain up close, instead of perfectly smooth geometry
 * (plan 044 §4.5, "teren wygląda płasko"). Tiles seamlessly by sampling the
 * noise on a torus (wrap the sample coordinates through a full turn) rather
 * than by mirroring/cropping.
 */
export function createTerrainNormalMap(): DataTexture {
  const noise4D = createNoise4D(createSeededRandom(NOISE_SEED))

  const data = new Uint8Array(SIZE * SIZE * 4)
  const normal = new Vector3()
  // Each axis gets its own independent circle (cos/sin pair) fed into a true
  // 4D noise field — the standard technique for seamlessly tileable 2D noise.
  // A prior version combined both axes into one 2D noise call, which isn't a
  // real 2D field and produced coherent flow-line/ring artifacts (visible as
  // "zebra stripe" banding under directional light) instead of organic grain.
  const heightAt = (u: number, v: number): number => {
    let h = 0
    const octave = (freq: number, weight: number): void => {
      const a = u * Math.PI * 2 * freq
      const b = v * Math.PI * 2 * freq
      h += noise4D(Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)) * weight
    }
    // Amplitude here is the *shape* of the grain, not its visible strength —
    // strength is `config.terrain.detailNormal.strength` (→ `normalScale`),
    // which is the knob to turn. Keep these fixed unless you want a different
    // patch size/roughness mix; changing them and the strength in the same
    // pass is what made the earlier tuning rounds unattributable (issue 014).
    octave(6, 0.16)
    octave(14, 0.08)
    octave(30, 0.03)
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
      // OpenGL tangent-space convention: R/G carry the two in-plane slopes and
      // **B carries the surface normal** (so a correct map is flat lavender-
      // blue, mean ≈ (128, 128, ~250)). This used to write the up-vector into
      // G — the map came out green, and three.js's `normal_fragment_maps`
      // (`mapN.xy *= normalScale; normal = normalize(tbn * mapN)`) then read a
      // sign-flipping *slope* as the up axis, tilting shading normals ~90° off
      // the surface at noise frequency. That was the "camo"/high-contrast
      // blotching, and it got *worse* as `normalScale` was lowered, since
      // scaling xy only shrank the (misplaced) up-vector further. See
      // `docs/issues/2026-08-10--014--terrain-detail-normal-map-green-channel.md`.
      normal.set(-(hR - hL), -(hU - hD), 2).normalize()

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
  // Mipmapping + anisotropy: standard minification handling for a texture
  // that repeats many times across the visible terrain.
  tex.generateMipmaps = true
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  // Renderer clamps this to the device's actual max anisotropy — a generous
  // request here is safe and sharpens the common "ground plane stretching
  // toward the horizon" viewing angle specifically, where minification is
  // worst in one direction (screen-space V) but not the other (U).
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

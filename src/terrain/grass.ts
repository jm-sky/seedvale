import * as THREE from 'three'
import type { ChunkCoord } from './chunkGrid'
import { createSeededRandom } from '../world/parseSeed'
import { ROCK_SLOPE_FULL, SAND_BAND } from './biomeColors'
import { biomeWeightsAt } from './biomeRegions'
import { apronOriginWorld, type ChunkTileData, type RegionParams, sampleApronGrid } from './chunkHeightmap'

export type WorldGrassChunk = {
  mesh: THREE.InstancedMesh
  dispose: () => void
}

export type GrassSystem = {
  createChunkGrass: (
    coord: ChunkCoord,
    tile: ChunkTileData,
    resolution: number,
    chunkSize: number,
    chunkOriginX: number,
    chunkOriginZ: number,
    waterLevel: number,
    heightScale: number,
    seed: number,
    /** Raw position candidates rolled before eligibility/density rejection —
     *  the GUI-exposed "density" knob (`config.terrain.grass.density`). */
    candidatesPerChunk: number,
    region: RegionParams,
  ) => WorldGrassChunk | null
  /** Advances the shared wind clock — call once per frame, not per chunk. */
  update: (dt: number) => void
  /** 0 = full night, 1 = full day — darkens grass in step with sky/fog/lights. */
  setDayNight: (dayFactor: number) => void
  dispose: () => void
}

const SLOPE_SAMPLE_STEP = 1.2
/** Altitude (fraction of `heightScale` above `waterLevel`) above which grass stops —
 *  lower than vegetation's treeline since grass reads oddly climbing into bare rock. */
const TREELINE_ALTITUDE = 0.5
/** Fade grass out over the last 40% below the treeline instead of a hard cutoff. */
const TREELINE_FADE_START = TREELINE_ALTITUDE * 0.6
/** Reject candidates sitting on a strong mountain ridge crest, regardless of altitude. */
const MOUNTAIN_RIDGE_REJECT = 0.3
/** Reject candidates sitting on a road/path corridor (`tile.roadTint`, `chunkHeightmap.ts`). */
const ROAD_TINT_REJECT = 0.15

/** Small upward bias on the blade base — the sampled height is bilinearly
 *  interpolated across a heightmap cell while the *rendered* terrain surface is
 *  triangulated (planar per triangle), so on anything but dead-flat ground the two
 *  disagree slightly; an un-lifted blade base can end up a hair below the visible
 *  surface (reads as "grass sunk into the ground"). */
const GROUND_LIFT = 0.05

const BASE_HALF_WIDTH = 0.5
const TIP_HALF_WIDTH = 0.14
/** Rows along the blade's height (segments + 1) — more than 2 so the baked-in
 *  rest curve below reads as an actual bend, not a straight-edged triangle. */
const BLADE_SEGMENTS = 4
/** Local-space lean at the tip (t=1), in the same units as `BASE_HALF_WIDTH` —
 *  deliberately larger than the width itself since it gets scaled by the
 *  instance's `bladeWidth` (not `bladeHeight`) at render time; tuned so the
 *  resulting world-space bend reads as a fraction of a typical blade's height. */
const CURVE_STRENGTH = 1.2

const ARID_GRASS = new THREE.Color(0x9c9a54)
const HUMID_GRASS = new THREE.Color(0x5fb03f)
/** Swamp tint — darker, more olive than even `HUMID_GRASS`. */
const SWAMP_GRASS = new THREE.Color(0x4a5c34)

/** Per-chunk hash so nearby chunks don't get correlated blade layouts (own salt,
 *  decorrelated from `chunkVegetation.ts`'s hash/salt for the same chunk). */
function hashChunk(cx: number, cz: number): number {
  let h = (cx * 668265263 + cz * 374761393) | 0
  h = (h ^ (h >>> 13)) * 2246822519
  return (h ^ (h >>> 16)) >>> 0
}

/** Unit "blade" — two crossed vertical strips (base at y=0, tapered tip at y=1),
 *  each `BLADE_SEGMENTS` segments tall with a fixed rest curve baked into the
 *  local coordinates, shared by every chunk's `InstancedMesh`; only the
 *  per-instance matrix/attributes differ per chunk. Quad A bends into +Z as it
 *  rises, quad B bends into +X, so the cross as a whole leans one consistent
 *  diagonal direction in its own local frame — after each instance's random
 *  Y rotation that reads as a random-but-natural lean per blade, not a razor-
 *  straight triangle. */
function createBladeTemplate(): {
  position: THREE.BufferAttribute
  index: THREE.BufferAttribute
} {
  const rows = BLADE_SEGMENTS + 1
  const positions: number[] = []
  const indices: number[] = []

  for (let quad = 0; quad < 2; quad++) {
    const base = positions.length / 3
    for (let r = 0; r < rows; r++) {
      const t = r / BLADE_SEGMENTS
      const halfWidth = BASE_HALF_WIDTH + (TIP_HALF_WIDTH - BASE_HALF_WIDTH) * t
      const curve = CURVE_STRENGTH * t * t
      if (quad === 0) {
        positions.push(-halfWidth, t, curve, halfWidth, t, curve)
      } else {
        positions.push(curve, t, -halfWidth, curve, t, halfWidth)
      }
    }
    for (let r = 0; r < BLADE_SEGMENTS; r++) {
      const i0 = base + r * 2
      const i1 = i0 + 1
      const i2 = i0 + 2
      const i3 = i0 + 3
      indices.push(i0, i1, i2, i1, i3, i2)
    }
  }

  return {
    position: new THREE.BufferAttribute(new Float32Array(positions), 3),
    index: new THREE.BufferAttribute(new Uint16Array(indices), 1),
  }
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute vec3 aBaseColor;
  attribute vec3 aTipColor;

  uniform float uTime;

  varying vec3 vColor;

  void main() {
    float bladeT = position.y;
    vColor = mix(aBaseColor, aTipColor, bladeT);

    // attribute mat4 instanceMatrix is injected automatically by three.js
    // whenever USE_INSTANCING is defined (i.e. the material is used on an
    // InstancedMesh) — no explicit declaration needed, unlike most other
    // per-vertex inputs.
    vec3 transformed = position;
    #ifdef USE_INSTANCING
      transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    #endif

    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);

    // Base stays planted; sway grows toward the tip (quadratic falloff).
    float bend = bladeT * bladeT;
    float sway = sin(uTime * 1.6 + aPhase + worldPos.x * 0.12 + worldPos.z * 0.09);
    float swayZ = cos(uTime * 1.3 + aPhase * 1.3 + worldPos.x * 0.09);
    worldPos.x += sway * 0.14 * bend;
    worldPos.z += swayZ * 0.1 * bend;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uDayFactor;
  varying vec3 vColor;

  void main() {
    float brightness = mix(0.4, 1.0, uDayFactor);
    gl_FragColor = vec4(vColor * brightness, 1.0);
  }
`

/**
 * Owns the shared blade geometry/material (one draw call's worth of GPU state
 * reused by every chunk) and builds per-chunk `InstancedMesh`es from a tile's
 * heights/biomes/mountainRidge grids — deterministic from `(seed, cx, cz)`, same
 * pattern as `chunkVegetation.ts`. Positions are generated on the main thread
 * (see grass-rendering plan phase 5 for the deferred worker-offload follow-up).
 */
export function createGrassSystem(): GrassSystem {
  const template = createBladeTemplate()
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDayFactor: { value: 1 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  })

  const tmpColor = new THREE.Color()
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const axisY = new THREE.Vector3(0, 1, 0)
  const matrix = new THREE.Matrix4()

  function createChunkGrass(
    coord: ChunkCoord,
    tile: ChunkTileData,
    resolution: number,
    chunkSize: number,
    chunkOriginX: number,
    chunkOriginZ: number,
    waterLevel: number,
    heightScale: number,
    seed: number,
    candidatesPerChunk: number,
    region: RegionParams,
  ): WorldGrassChunk | null {
    const o = apronOriginWorld(coord.cx, coord.cz, chunkSize, resolution)
    const sample = (grid: Float32Array, x: number, z: number) =>
      sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)

    const random = createSeededRandom(seed ^ hashChunk(coord.cx, coord.cz) ^ 0x9f2c3b)
    const half = chunkSize / 2

    const matrices: THREE.Matrix4[] = []
    const phases: number[] = []
    const baseColors: number[] = []
    const tipColors: number[] = []

    for (let i = 0; i < candidatesPerChunk; i++) {
      const localX = (random() * 2 - 1) * half
      const localZ = (random() * 2 - 1) * half
      const wx = coord.cx * chunkSize + localX
      const wz = coord.cz * chunkSize + localZ

      const h = sample(tile.heights, wx, wz)
      if (h <= waterLevel + SAND_BAND) continue // underwater/shoreline sand

      const d = SLOPE_SAMPLE_STEP
      const slope =
        (Math.abs(sample(tile.heights, wx + d, wz) - sample(tile.heights, wx - d, wz)) +
          Math.abs(sample(tile.heights, wx, wz + d) - sample(tile.heights, wx, wz - d))) /
        (2 * d)
      if (slope > ROCK_SLOPE_FULL) continue // cliff/rock face

      const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
      if (altitude > TREELINE_ALTITUDE) continue // above treeline

      const ridge = sample(tile.mountainRidge, wx, wz)
      if (ridge > MOUNTAIN_RIDGE_REJECT) continue // bare ridge crest

      if (sample(tile.roadTint, wx, wz) > ROAD_TINT_REJECT) continue // road/path corridor

      const moisture = sample(tile.biomes, wx, wz)
      const moistureRegion = sample(tile.moistureRegion, wx, wz)
      const biome = biomeWeightsAt(moistureRegion, altitude, region)
      const altitudeFade =
        1 -
        Math.max(
          0,
          Math.min(1, (altitude - TREELINE_FADE_START) / (TREELINE_ALTITUDE - TREELINE_FADE_START)),
        )
      // Sparse-but-present even on dry ground; thick on humid lowlands. Desert
      // thins it out to near-nothing (bare sand, not a lawn).
      const density =
        Math.max(0, Math.min(1, 0.55 + moisture * 0.45)) * altitudeFade * (1 - biome.desert * 0.9)
      if (random() > density) continue

      const bladeHeight = 0.22 + random() * 0.22
      const bladeWidth = 0.08 + random() * 0.06
      const rotationY = random() * Math.PI * 2
      const jitter = 1 + (random() * 2 - 1) * 0.15

      pos.set(localX, h + GROUND_LIFT, localZ)
      quat.setFromAxisAngle(axisY, rotationY)
      scale.set(bladeWidth, bladeHeight, bladeWidth)
      matrix.compose(pos, quat, scale)
      matrices.push(matrix.clone())

      phases.push(random() * Math.PI * 2)

      tmpColor.copy(ARID_GRASS).lerp(HUMID_GRASS, moisture)
      if (biome.swamp > 0) tmpColor.lerp(SWAMP_GRASS, biome.swamp)
      baseColors.push(tmpColor.r * 0.55 * jitter, tmpColor.g * 0.55 * jitter, tmpColor.b * 0.55 * jitter)
      tipColors.push(tmpColor.r * 1.3 * jitter, tmpColor.g * 1.3 * jitter, tmpColor.b * 1.3 * jitter)
    }

    const count = matrices.length
    if (count === 0) return null

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', template.position)
    geometry.setIndex(template.index)
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1))
    geometry.setAttribute(
      'aBaseColor',
      new THREE.InstancedBufferAttribute(new Float32Array(baseColors), 3),
    )
    geometry.setAttribute(
      'aTipColor',
      new THREE.InstancedBufferAttribute(new Float32Array(tipColors), 3),
    )

    const mesh = new THREE.InstancedMesh(geometry, material, count)
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, matrices[i]!)
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere() // instance matrices spread well beyond the unit template's own bounds
    mesh.position.set(chunkOriginX, 0, chunkOriginZ)
    mesh.name = 'chunk-grass'

    return {
      mesh,
      dispose: () => {
        mesh.removeFromParent()
        geometry.dispose()
        mesh.dispose() // frees instanceMatrix's own GPU buffer — geometry.dispose() alone does not
      },
    }
  }

  return {
    createChunkGrass,
    update(dt) {
      material.uniforms.uTime!.value += dt
    },
    setDayNight(dayFactor) {
      material.uniforms.uDayFactor!.value = dayFactor
    },
    dispose() {
      material.dispose()
    },
  }
}

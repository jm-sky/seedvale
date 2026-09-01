/** Plan world-009 — chunk-agnostic instanced renderer for blood traces.
 *  Deliberately NOT wired into `chunkManager.ts`'s `ChunkRecord`/streaming
 *  pipeline (see `world/bloodTraces.ts`'s header comment: world-level state
 *  never lives in a `ChunkRecord`) — a full terrain-shader/vertex-mask
 *  overlay would need a disproportionate rebuild for something this dynamic
 *  (every combat hit, continuous weather-driven fading), so this follows the
 *  plan's explicit fallback instead: one bounded, capacity-fixed
 *  `InstancedMesh` (same "narrow `.count`, never reallocate" technique
 *  `grass.ts`/`instancedProps.ts` already use), rebuilt from whichever
 *  traces are currently within the caller-chosen active radius — never one
 *  mesh/material/draw call per trace. */

import * as THREE from 'three'
import type { HeightSampler } from '../player/PlayerController'

/** Matches `world/bloodTraces.ts`'s `BLOOD_GLOBAL_CAP` — the renderer never
 *  needs more instances than the world state can ever hold at once. Kept as
 *  an independent constant (not imported) so this module has no dependency
 *  on `world/bloodTraces.ts`'s domain types, only on the plain placement
 *  shape below — `world/bloodTraces.ts` is the one that composes both. */
const OVERLAY_CAPACITY = 200

const ATLAS_COLS = 2
const ATLAS_ROWS = 2
const ATLAS_CELL_PX = 128
/** Lifts the decal slightly above the sampled terrain height to avoid
 *  z-fighting — same order of magnitude as `fauna/bloodSplat.ts`'s death
 *  splat (`y + 0.02`) and combined with the material's own polygon offset. */
const Y_EPSILON = 0.015

export type BloodOverlayPlacement = {
  x: number
  z: number
  rotation: number
  scale: number
  variant: number
  /** 0..1 — combined lifetime-fade × per-trace opacity jitter. */
  opacity: number
}

export type BloodOverlaySystem = {
  group: THREE.Group
  /** Full rebuild from the given (already active-area-filtered, already
   *  capacity-bounded by the caller) placement list. Cheap: fixed-capacity
   *  attribute arrays are rewritten in place, never reallocated. */
  sync: (placements: readonly BloodOverlayPlacement[]) => void
  dispose: () => void
}

/** Small seeded LCG — local to texture generation, unrelated to the world
 *  seed (this is a placeholder-texture detail, not world state). */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

/** Procedural placeholder atlas (plan §4: "Nie wymagać produkcji nowych
 *  assetów... jeżeli placeholder textures wystarczą do weryfikacji
 *  pipeline") — a 2×2 grid of irregular dark-red splat shapes, each built
 *  from a handful of overlapping soft-edged blobs so the four variants read
 *  as distinct marks rather than identical circles. Built once and shared by
 *  every `BloodOverlaySystem` instance's material. */
function buildBloodAtlasTexture(): THREE.CanvasTexture {
  const size = ATLAS_CELL_PX * ATLAS_COLS
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = ATLAS_CELL_PX * ATLAS_ROWS
  const ctx = canvas.getContext('2d')!
  const random = makeRandom(0x8007a1)

  for (let row = 0; row < ATLAS_ROWS; row++) {
    for (let col = 0; col < ATLAS_COLS; col++) {
      const cx = col * ATLAS_CELL_PX + ATLAS_CELL_PX / 2
      const cy = row * ATLAS_CELL_PX + ATLAS_CELL_PX / 2
      const blobCount = 5 + Math.floor(random() * 3)
      for (let i = 0; i < blobCount; i++) {
        const angle = random() * Math.PI * 2
        const dist = random() * ATLAS_CELL_PX * 0.26
        const bx = cx + Math.cos(angle) * dist
        const by = cy + Math.sin(angle) * dist
        const r = ATLAS_CELL_PX * (0.12 + random() * 0.16)
        const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, r)
        gradient.addColorStop(0, 'rgba(54,4,4,0.92)')
        gradient.addColorStop(0.55, 'rgba(68,6,6,0.55)')
        gradient.addColorStop(1, 'rgba(68,6,6,0)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(bx, by, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aVariant;
  attribute float aOpacity;
  varying vec2 vUv;
  varying float vVariant;
  varying float vOpacity;
  varying float vFogDepth;

  void main() {
    vUv = uv;
    vVariant = aVariant;
    vOpacity = aOpacity;

    vec3 transformed = position;
    // attribute mat4 instanceMatrix is injected automatically by three.js
    // whenever USE_INSTANCING is defined (i.e. this material is used on an
    // InstancedMesh) — same convention as terrain/grass.ts's shader.
    #ifdef USE_INSTANCING
      transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    #endif

    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vec4 mvPosition = viewMatrix * worldPos;
    vFogDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec2 vUv;
  varying float vVariant;
  varying float vOpacity;
  varying float vFogDepth;

  void main() {
    float col = mod(vVariant, 2.0);
    float row = floor(vVariant / 2.0);
    vec2 cellUv = (vUv + vec2(col, row)) * 0.5;
    vec4 tex = texture2D(uMap, cellUv);
    float alpha = tex.a * vOpacity;
    if (alpha < 0.02) discard;
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    vec3 color = mix(tex.rgb, fogColor, fogFactor);
    gl_FragColor = vec4(color, alpha);
  }
`

export function createBloodOverlaySystem(sampleHeight: HeightSampler): BloodOverlaySystem {
  const geometry = new THREE.PlaneGeometry(1, 1)
  geometry.rotateX(-Math.PI / 2)

  const aVariant = new THREE.InstancedBufferAttribute(new Float32Array(OVERLAY_CAPACITY), 1)
  const aOpacity = new THREE.InstancedBufferAttribute(new Float32Array(OVERLAY_CAPACITY), 1)
  geometry.setAttribute('aVariant', aVariant)
  geometry.setAttribute('aOpacity', aOpacity)

  const texture = buildBloodAtlasTexture()
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: texture } }]),
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  })

  const mesh = new THREE.InstancedMesh(geometry, material, OVERLAY_CAPACITY)
  mesh.count = 0
  mesh.name = 'blood-overlay-instances'
  // No shadows — thin ground decals, same reasoning as grass.ts.
  mesh.castShadow = false
  mesh.receiveShadow = false

  const group = new THREE.Group()
  group.name = 'blood-overlay'
  group.add(mesh)

  const scratch = new THREE.Object3D()

  function sync(placements: readonly BloodOverlayPlacement[]): void {
    const count = Math.min(placements.length, OVERLAY_CAPACITY)
    for (let i = 0; i < count; i++) {
      const p = placements[i]!
      const y = sampleHeight(p.x, p.z) + Y_EPSILON
      scratch.position.set(p.x, y, p.z)
      scratch.rotation.set(0, p.rotation, 0)
      scratch.scale.set(p.scale, 1, p.scale)
      scratch.updateMatrix()
      mesh.setMatrixAt(i, scratch.matrix)
      aVariant.setX(i, p.variant)
      aOpacity.setX(i, p.opacity)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    aVariant.needsUpdate = true
    aOpacity.needsUpdate = true
    if (count > 0) mesh.computeBoundingSphere()
  }

  return {
    group,
    sync,
    dispose() {
      group.removeFromParent()
      mesh.dispose() // frees instanceMatrix's own GPU buffer — geometry.dispose() alone does not
      geometry.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}

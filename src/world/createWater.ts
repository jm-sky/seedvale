import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DoubleSide,
  FloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  type Scene,
  ShaderMaterial,
} from 'three'
import type { Heightmap } from '../terrain/generateHeightmap'

export type WorldWater = {
  mesh: Mesh
  update: (dt: number) => void
  /** 0 = full night, 1 = full day — darkens/tints water in step with sky/fog/lights. */
  setDayNight: (dayFactor: number) => void
  addTo: (scene: Scene) => void
  dispose: () => void
}

const DAY_DEEP = new Color(0x1a4d6b)
const DAY_SHALLOW = new Color(0x4fa3c8)
const DAY_FOAM = new Color(0xc8e8f4)
const NIGHT_DEEP = new Color(0x060f18)
const NIGHT_SHALLOW = new Color(0x14283a)
const NIGHT_FOAM = new Color(0x4a6a78)

function createHeightTexture(heightmap: Heightmap): DataTexture {
  const { resolution } = heightmap.params
  const data = new Float32Array(heightmap.heights)
  const tex = new DataTexture(data, resolution, resolution, RedFormat, FloatType)
  tex.wrapS = ClampToEdgeWrapping
  tex.wrapT = ClampToEdgeWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

function createBodyScaleTexture(heightmap: Heightmap): DataTexture {
  const { resolution } = heightmap.params
  const data = new Float32Array(heightmap.bodyScale)
  const tex = new DataTexture(data, resolution, resolution, RedFormat, FloatType)
  tex.wrapS = ClampToEdgeWrapping
  tex.wrapT = ClampToEdgeWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

/**
 * Stylized water — waves only where terrain ≤ waterLevel (heightmap mask).
 * Fixes flicker of the plane poking through land.
 */
/** Cap on water mesh segments — keeps the shoreline mask sharp without matching
 *  the terrain 1:1 at very high resolutions (water doesn't need that much detail). */
const MAX_WATER_SEGMENTS = 256

export function createWater(heightmap: Heightmap): WorldWater {
  const { size, waterLevel, resolution } = heightmap.params
  // Track terrain resolution so the vCover mask (sampled per water-mesh vertex,
  // then linearly interpolated) follows the actual shoreline shape closely enough
  // to avoid "holes" where a whole water quad falls on land vertices despite
  // submerged terrain between them — see docs/reviews/2026-08-07-water-quality.md
  // Finding 3.
  const segments = Math.min(resolution - 1, MAX_WATER_SEGMENTS)
  const geometry = new PlaneGeometry(size * 1.02, size * 1.02, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const heightTex = createHeightTexture(heightmap)
  const bodyScaleTex = createBodyScaleTexture(heightmap)

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: DAY_DEEP.clone() },
      uShallow: { value: DAY_SHALLOW.clone() },
      uFoam: { value: DAY_FOAM.clone() },
      uOpacity: { value: 0.82 },
      uHeightmap: { value: heightTex },
      uBodyScale: { value: bodyScaleTex },
      uMapSize: { value: size },
      uWaterLevel: { value: waterLevel },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uHeightmap;
      uniform sampler2D uBodyScale;
      uniform float uMapSize;
      uniform float uWaterLevel;
      varying float vWave;
      varying float vCover;
      varying float vAmpScale;
      varying float vBodyScale;
      varying vec3 vViewDir;

      void main() {
        vec3 pos = position;
        vec2 uv = pos.xz / uMapSize + 0.5;
        float terrainH = texture2D(uHeightmap, uv).r;
        vCover = 1.0 - smoothstep(uWaterLevel - 0.05, uWaterLevel + 0.35, terrainH);

        // 0 = small lake .. 1 = ocean; blends wave amplitude between the two.
        float bodyScale = texture2D(uBodyScale, uv).r;
        vBodyScale = bodyScale;
        float ampScale = mix(0.06, 0.24, bodyScale);
        vAmpScale = ampScale;

        float w1 = sin(pos.x * 0.18 + uTime * 1.1) * 0.1;
        float w2 = cos(pos.z * 0.22 + uTime * 0.85) * 0.08;
        float w3 = sin((pos.x + pos.z) * 0.09 + uTime * 0.6) * 0.06;
        vWave = (w1 + w2 + w3) * (ampScale / 0.24) * vCover;
        pos.y += vWave;

        vec4 world = modelMatrix * vec4(pos, 1.0);
        vViewDir = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      uniform float uOpacity;
      varying float vWave;
      varying float vCover;
      varying float vAmpScale;
      varying float vBodyScale;
      varying vec3 vViewDir;

      void main() {
        if (vCover < 0.02) discard;
        // True ocean cells are rendered by the reflective Water.js mesh instead —
        // step aside so the two don't double-render/z-fight over the same area.
        if (vBodyScale > 0.9) discard;

        float fresnel = pow(1.0 - max(dot(normalize(vViewDir), vec3(0.0, 1.0, 0.0)), 0.0), 2.2);
        vec3 col = mix(uDeep, uShallow, fresnel);
        float foam = smoothstep(vAmpScale * 0.5, vAmpScale * 0.92, abs(vWave));
        col = mix(col, uFoam, foam * 0.4);
        float alpha = mix(uOpacity, 0.95, fresnel) * vCover;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  })

  const mesh = new Mesh(geometry, material)
  mesh.position.y = waterLevel + 0.07
  mesh.renderOrder = 1
  mesh.name = 'water'

  return {
    mesh,
    update(dt) {
      material.uniforms.uTime!.value += dt
    },
    setDayNight(dayFactor) {
      const deep = material.uniforms.uDeep!.value as Color
      const shallow = material.uniforms.uShallow!.value as Color
      const foam = material.uniforms.uFoam!.value as Color
      deep.copy(NIGHT_DEEP).lerp(DAY_DEEP, dayFactor)
      shallow.copy(NIGHT_SHALLOW).lerp(DAY_SHALLOW, dayFactor)
      foam.copy(NIGHT_FOAM).lerp(DAY_FOAM, dayFactor)
    },
    addTo(scene) {
      scene.add(mesh)
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      heightTex.dispose()
      bodyScaleTex.dispose()
      mesh.removeFromParent()
    },
  }
}

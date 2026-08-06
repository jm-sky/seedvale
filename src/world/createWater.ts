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
  addTo: (scene: Scene) => void
  dispose: () => void
}

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

/**
 * Stylized water — waves only where terrain ≤ waterLevel (heightmap mask).
 * Fixes flicker of the plane poking through land.
 */
export function createWater(heightmap: Heightmap): WorldWater {
  const { size, waterLevel } = heightmap.params
  const geometry = new PlaneGeometry(size * 1.02, size * 1.02, 96, 96)
  geometry.rotateX(-Math.PI / 2)

  const heightTex = createHeightTexture(heightmap)

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new Color(0x1a4d6b) },
      uShallow: { value: new Color(0x4fa3c8) },
      uFoam: { value: new Color(0xc8e8f4) },
      uOpacity: { value: 0.82 },
      uHeightmap: { value: heightTex },
      uMapSize: { value: size },
      uWaterLevel: { value: waterLevel },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uHeightmap;
      uniform float uMapSize;
      uniform float uWaterLevel;
      varying float vWave;
      varying float vCover;
      varying vec3 vViewDir;

      void main() {
        vec3 pos = position;
        vec2 uv = pos.xz / uMapSize + 0.5;
        float terrainH = texture2D(uHeightmap, uv).r;
        vCover = 1.0 - smoothstep(uWaterLevel - 0.05, uWaterLevel + 0.35, terrainH);

        float w1 = sin(pos.x * 0.18 + uTime * 1.1) * 0.1;
        float w2 = cos(pos.z * 0.22 + uTime * 0.85) * 0.08;
        float w3 = sin((pos.x + pos.z) * 0.09 + uTime * 0.6) * 0.06;
        vWave = (w1 + w2 + w3) * vCover;
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
      varying vec3 vViewDir;

      void main() {
        if (vCover < 0.02) discard;

        float fresnel = pow(1.0 - max(dot(normalize(vViewDir), vec3(0.0, 1.0, 0.0)), 0.0), 2.2);
        vec3 col = mix(uDeep, uShallow, fresnel);
        float foam = smoothstep(0.12, 0.22, abs(vWave));
        col = mix(col, uFoam, foam * 0.4);
        float alpha = mix(uOpacity, 0.95, fresnel) * vCover;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  })

  const mesh = new Mesh(geometry, material)
  mesh.position.y = waterLevel + 0.04
  mesh.renderOrder = 1
  mesh.name = 'water'

  return {
    mesh,
    update(dt) {
      material.uniforms.uTime!.value += dt
    },
    addTo(scene) {
      scene.add(mesh)
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      heightTex.dispose()
      mesh.removeFromParent()
    },
  }
}

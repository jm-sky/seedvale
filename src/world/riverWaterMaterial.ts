import { DoubleSide, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three'
import {
  DAY_LAKE_DEEP,
  DAY_LAKE_FOAM,
  DAY_LAKE_SHALLOW,
  DAY_OCEAN_DEEP,
  DAY_OCEAN_FOAM,
  DAY_OCEAN_SHALLOW,
} from './waterMaterial'

/**
 * Minimal river-ribbon water material (plan 181, Etap 6). Deliberately a
 * distinct, lightweight variant rather than forcing `createWaterMaterial`'s
 * flat-plane/heightmap-mask shader onto a curved, varying-width ribbon (see
 * implementation notes §11). Reuses the shared lake day/night palette and the
 * existing `tickWaterTime`/`setWaterDayNight` uniform-setters from
 * `waterMaterial.ts` **unmodified** — this material defines the same uniform
 * names those functions already write to (`uTime`, the six lake/ocean colors,
 * `uSunDirection`), even though only the lake colors are actually sampled in
 * the fragment shader below (a river reads as fresh water, not ocean).
 */

const VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>

  varying vec2 vUv;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(cameraPosition - world.xyz);
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>

  uniform float uTime;
  uniform vec3 uLakeDeep;
  uniform vec3 uLakeShallow;
  uniform vec3 uLakeFoam;
  uniform vec3 uOceanDeep;
  uniform vec3 uOceanShallow;
  uniform vec3 uOceanFoam;
  uniform vec3 uSunDirection;

  varying vec2 vUv;
  varying vec3 vViewDir;

  void main() {
    // Ribbon is roughly horizontal — a fixed up-normal is a fine approximation
    // for a lightweight V1 fresnel term (no per-vertex normal attribute needed).
    vec3 N = vec3(0.0, 1.0, 0.0);
    vec3 V = normalize(vViewDir);
    float facing = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - facing, 2.2);

    float edgeDist = min(vUv.x, 1.0 - vUv.x);
    float edge = 1.0 - smoothstep(0.0, 0.28, edgeDist);
    vec3 col = mix(uLakeShallow, uLakeDeep, 0.4);
    col = mix(col, uLakeFoam, edge * 0.6);

    float flow = fract(vUv.y * 0.18 - uTime * 0.9);
    col += smoothstep(0.85, 1.0, flow) * 0.25;

    float sunUp = step(0.0, uSunDirection.y);
    col += vec3(0.5, 0.65, 0.75) * fresnel * 0.25 * sunUp;

    float alpha = mix(0.55, 0.8, fresnel);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`

export function createRiverWaterMaterial(): ShaderMaterial {
  const uniforms: ShaderMaterial['uniforms'] = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uTime: { value: 0 },
      uLakeDeep: { value: DAY_LAKE_DEEP.clone() },
      uLakeShallow: { value: DAY_LAKE_SHALLOW.clone() },
      uLakeFoam: { value: DAY_LAKE_FOAM.clone() },
      uOceanDeep: { value: DAY_OCEAN_DEEP.clone() },
      uOceanShallow: { value: DAY_OCEAN_SHALLOW.clone() },
      uOceanFoam: { value: DAY_OCEAN_FOAM.clone() },
      uSunDirection: { value: new Vector3(0, 1, 0) },
    },
  ])

  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  })
}

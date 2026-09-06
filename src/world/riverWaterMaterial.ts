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

  attribute float aFlow;
  attribute float aFall;

  varying vec2 vUv;
  varying vec3 vViewDir;
  varying float vFlow;
  varying float vFall;

  void main() {
    vUv = uv;
    vFlow = aFlow;
    vFall = aFall;
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
  varying float vFlow;
  varying float vFall;

  // Cheap 2D value noise (hash + bilinear smoothstep interpolation) — the
  // irregularity source for the flow highlights below. Deliberately no
  // texture/extra uniform: this material stays a lightweight variant.
  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    // Ribbon is roughly horizontal — a fixed up-normal is a fine approximation
    // for a lightweight V1 fresnel term (no per-vertex normal attribute needed).
    vec3 N = vec3(0.0, 1.0, 0.0);
    vec3 V = normalize(vViewDir);
    float facing = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - facing, 2.2);

    // A small stream fades out well before the geometric edge of its (already
    // narrow) ribbon — a soft, wispy trickle blending into the bank instead of
    // a hard-edged "canal on top of the terrain". A big river keeps a crisper,
    // more confident shoreline. Addresses plan 181 Etap 7's "zbyt ostre i
    // nienaturalne brzegi" / "efekt kanału położonego na terenie".
    float edgeDist = min(vUv.x, 1.0 - vUv.x);
    float bankSoftness = mix(0.55, 0.14, vFlow);
    float bankFade = smoothstep(0.0, bankSoftness, edgeDist);
    float foamBand = 1.0 - smoothstep(0.0, 0.28, edgeDist);

    vec3 col = mix(uLakeShallow, uLakeDeep, 0.3 + 0.3 * vFlow);
    col = mix(col, uLakeFoam, foamBand * 0.5 * mix(0.35, 1.0, vFlow));

    // Multiply by the (already day/night-lerped, dark at night) foam colour
    // instead of adding a flat scalar — an unconditional additive constant here
    // ignored ambient light entirely, so the sparkle read as a night-time glow.
    // Small streams get a much fainter flow streak — visual "dominance" should
    // scale with actual flow, not read the same for a trickle and a river.
    //
    // Two octaves of advected value noise rather than the old
    // fract(vUv.y * k - t) ramp: that was constant across the ribbon's whole
    // width, so it read as evenly spaced white bars marching across the river
    // (segment seams, not water). Sampling at a much lower frequency along the
    // flow axis (vUv.y, arc length in metres) than across it (vUv.x, 0..1)
    // stretches each highlight along the current, so it reads as a drifting
    // glint on moving water.
    vec2 flowUv = vec2(vUv.x * 3.0, vUv.y * 0.45 - uTime * 0.55);
    float streakField =
      valueNoise(flowUv) * 0.65 +
      valueNoise(vec2(flowUv.x * 2.3 + 11.7, flowUv.y * 2.7 - uTime * 0.35)) * 0.35;
    float streak = smoothstep(0.62, 0.95, streakField);
    col += uLakeFoam * streak * 0.35 * mix(0.2, 1.0, vFlow);

    float sunUp = step(0.0, uSunDirection.y);
    col += vec3(0.5, 0.65, 0.75) * fresnel * 0.25 * sunUp;

    // Baseline alpha also scales with flow so a barely-classified trickle
    // reads as translucent, not a solid bright-blue stripe.
    float alpha = mix(0.35, 0.8, fresnel) * mix(0.5, 1.0, vFlow) * bankFade;

    // Waterfalls (plan 181 Etap 4/6): vFall (0 = ordinary flow, 1 = a steep
    // drop) drives the same ribbon toward churning whitewater instead of a new
    // geometry/object — a faster, multi-directional mist pattern on top of the
    // existing directional flow streak, blended toward near-opaque foam.
    float mist = fract(vUv.x * 3.0 + vUv.y * 0.4 - uTime * 1.6);
    float mistBand = smoothstep(0.7, 1.0, mist) * vFall;
    col += uLakeFoam * mistBand * 0.6;
    col = mix(col, uLakeFoam, vFall * 0.6);
    alpha = mix(alpha, 0.92, vFall);

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

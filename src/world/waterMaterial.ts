import {
  Color,
  DoubleSide,
  ShaderMaterial,
  type Texture,
  Vector3,
} from 'three'

export const DAY_LAKE_DEEP = new Color(0x1a4d6b)
export const DAY_LAKE_SHALLOW = new Color(0x4fa3c8)
export const DAY_LAKE_FOAM = new Color(0xc8e8f4)
export const NIGHT_LAKE_DEEP = new Color(0x060f18)
export const NIGHT_LAKE_SHALLOW = new Color(0x14283a)
export const NIGHT_LAKE_FOAM = new Color(0x4a6a78)

export const DAY_OCEAN_DEEP = new Color(0x0a3044)
export const DAY_OCEAN_SHALLOW = new Color(0x2a6e84)
export const DAY_OCEAN_FOAM = new Color(0xb8dce8)
export const NIGHT_OCEAN_DEEP = new Color(0x040a10)
export const NIGHT_OCEAN_SHALLOW = new Color(0x0c1c28)
export const NIGHT_OCEAN_FOAM = new Color(0x3a5864)

const _sun = new Vector3()

export type WaterMaterialOptions = {
  /** 0 = lake (chunk water may still promote ocean cells via bodyScale). */
  ocean: number
  waterLevel: number
  mapSize?: number
  heightmap?: Texture
  floorHeights?: Texture
  bodyScale?: Texture
  /** Ocean singleton: fully hidden inside this radius (loaded chunks own the shore). */
  fadeInner?: number
  /** Ocean singleton: fully visible beyond this radius (open sea / unload ring). */
  fadeOuter?: number
}

const VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>

  uniform float uTime;
  uniform float uOcean;
  uniform float uFadeInner;
  uniform float uFadeOuter;
  #ifdef USE_CHUNK_MASK
    uniform sampler2D uHeightmap;
    uniform sampler2D uBodyScale;
    uniform float uMapSize;
    uniform float uWaterLevel;
  #endif

  varying float vCover;
  varying float vOcean;
  varying float vRing;
  varying vec2 vMapUv;
  varying vec3 vViewDir;
  varying vec3 vNormalW;

  vec3 lakeRipple(vec2 w, float t) {
    float a1 = 0.038;
    float k1 = 0.42;
    float a2 = 0.028;
    float k2 = 0.51;
    float a3 = 0.022;
    float k3 = 0.23;
    float p1 = w.x * k1 + t * 1.15;
    float p2 = w.y * k2 + t * 0.92;
    float p3 = (w.x + w.y) * k3 + t * 0.62;
    float h = sin(p1) * a1 + cos(p2) * a2 + sin(p3) * a3;
    float dx = cos(p1) * a1 * k1 + cos(p3) * a3 * k3;
    float dz = -sin(p2) * a2 * k2 + cos(p3) * a3 * k3;
    return vec3(h, dx, dz);
  }

  vec3 oceanSwell(vec2 w, float t) {
    float a1 = 0.16;
    float k1 = 0.075;
    float a2 = 0.12;
    float k2 = 0.055;
    float a3 = 0.09;
    float k3 = 0.038;
    float a4 = 0.032;
    float k4x = 0.18;
    float k4z = 0.14;
    float p1 = w.x * k1 + t * 0.42;
    float p2 = w.y * k2 + t * 0.31;
    float p3 = (w.x * 0.65 + w.y) * k3 + t * 0.21;
    float p4 = w.x * k4x + w.y * k4z + t * 0.85;
    float h = sin(p1) * a1 + cos(p2) * a2 + sin(p3) * a3 + sin(p4) * a4;
    float dx = cos(p1) * a1 * k1 + cos(p3) * a3 * k3 * 0.65 + cos(p4) * a4 * k4x;
    float dz = -sin(p2) * a2 * k2 + cos(p3) * a3 * k3 + cos(p4) * a4 * k4z;
    return vec3(h, dx, dz);
  }

  void main() {
    vec3 pos = position;
    float cover = 1.0;
    float ocean = uOcean;
    float lakeScale = 0.65;
    vMapUv = vec2(0.5);

    #ifdef USE_CHUNK_MASK
      vec2 uv = pos.xz / uMapSize + 0.5;
      vMapUv = uv;
      float terrainH = texture2D(uHeightmap, uv).r;
      cover = 1.0 - smoothstep(uWaterLevel - 0.05, uWaterLevel + 0.35, terrainH);
      float bodyScale = texture2D(uBodyScale, uv).r;
      ocean = max(ocean, smoothstep(0.85, 0.96, bodyScale));
      lakeScale = bodyScale;
    #endif

    vCover = cover;
    vOcean = ocean;
    vRing = 1.0;
    #ifndef USE_CHUNK_MASK
      vRing = smoothstep(uFadeInner, max(uFadeOuter, uFadeInner + 0.001), length(pos.xz));
    #endif

    vec4 world0 = modelMatrix * vec4(pos, 1.0);
    vec3 lake = lakeRipple(world0.xz, uTime) * mix(0.40, 1.0, clamp(lakeScale, 0.0, 1.0));
    vec3 swell = oceanSwell(world0.xz, uTime);
    vec3 wave = mix(lake, swell, ocean) * cover;
    pos.y += wave.x;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vViewDir = normalize(cameraPosition - world.xyz);
    vNormalW = normalize(vec3(-wave.y, 1.0, -wave.z));

    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>

  uniform vec3 uLakeDeep;
  uniform vec3 uLakeShallow;
  uniform vec3 uLakeFoam;
  uniform vec3 uOceanDeep;
  uniform vec3 uOceanShallow;
  uniform vec3 uOceanFoam;
  uniform vec3 uSunDirection;
  #ifdef USE_CHUNK_MASK
    uniform sampler2D uFloorHeights;
    uniform float uWaterLevel;
  #endif

  varying float vCover;
  varying float vOcean;
  varying float vRing;
  varying vec2 vMapUv;
  varying vec3 vViewDir;
  varying vec3 vNormalW;

  void main() {
    if (vCover < 0.02) discard;
    if (vRing < 0.02) discard;

    float depthT = 1.0;
    #ifdef USE_CHUNK_MASK
      float floorH = texture2D(uFloorHeights, vMapUv).r;
      float depth = max(0.0, uWaterLevel - floorH);
      float depthSat = mix(2.2, 6.0, vOcean);
      depthT = clamp(depth / max(depthSat, 0.001), 0.0, 1.0);
    #endif

    vec3 deep = mix(uLakeDeep, uOceanDeep, vOcean);
    vec3 shallow = mix(uLakeShallow, uOceanShallow, vOcean);
    vec3 foamCol = mix(uLakeFoam, uOceanFoam, vOcean);

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);
    float facing = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - facing, 2.2);

    vec3 body = mix(shallow, deep, depthT);
    vec3 col = mix(body, shallow, fresnel * 0.35);

    vec3 L = normalize(uSunDirection);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), mix(48.0, 80.0, vOcean)) * step(0.0, L.y);
    col += vec3(0.55, 0.72, 0.82) * spec * mix(0.16, 0.30, vOcean);

    float shore = 1.0 - vCover;
    float foamBand = smoothstep(0.08, 0.42, shore) * (1.0 - smoothstep(0.55, 0.95, shore));
    float foamEdge = min(1.0, fwidth(vCover) * 8.0);
    float foam = clamp(foamBand * 0.7 + foamEdge * 0.55, 0.0, 1.0);
    col = mix(col, foamCol, foam * 0.55);

    float shallowA = mix(0.26, 0.40, vOcean);
    float deepA = mix(0.62, 0.88, vOcean);
    float baseA = mix(shallowA, deepA, depthT);
    float alpha = mix(baseA, min(0.95, baseA + 0.18), fresnel) * vCover * vRing;

    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`

/**
 * Shared lake/ocean ShaderMaterial. Chunk water passes height/floor/bodyScale
 * textures (USE_CHUNK_MASK). The ocean singleton omits them and sets ocean=1.
 * Planar scene reflections are phase 3 — this is sky + depth + sun specular.
 */
export function createWaterMaterial(opts: WaterMaterialOptions): ShaderMaterial {
  const chunkMask = opts.heightmap != null
  const uniforms: ShaderMaterial['uniforms'] = {
    uTime: { value: 0 },
    uOcean: { value: opts.ocean },
    uWaterLevel: { value: opts.waterLevel },
    uLakeDeep: { value: DAY_LAKE_DEEP.clone() },
    uLakeShallow: { value: DAY_LAKE_SHALLOW.clone() },
    uLakeFoam: { value: DAY_LAKE_FOAM.clone() },
    uOceanDeep: { value: DAY_OCEAN_DEEP.clone() },
    uOceanShallow: { value: DAY_OCEAN_SHALLOW.clone() },
    uOceanFoam: { value: DAY_OCEAN_FOAM.clone() },
    uSunDirection: { value: new Vector3(0, 1, 0) },
    uFadeInner: { value: opts.fadeInner ?? 0 },
    uFadeOuter: { value: opts.fadeOuter ?? 0 },
  }

  if (chunkMask) {
    uniforms.uHeightmap = { value: opts.heightmap }
    uniforms.uFloorHeights = { value: opts.floorHeights }
    uniforms.uBodyScale = { value: opts.bodyScale }
    uniforms.uMapSize = { value: opts.mapSize ?? 1 }
  }

  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    defines: chunkMask ? { USE_CHUNK_MASK: 1 } : {},
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  })
}

export function tickWaterTime(material: ShaderMaterial, dt: number): void {
  material.uniforms.uTime!.value += dt
}

export function setWaterDayNight(
  material: ShaderMaterial,
  dayFactor: number,
  sunDirection: Vector3,
): void {
  const u = material.uniforms
  ;(u.uLakeDeep!.value as Color).copy(NIGHT_LAKE_DEEP).lerp(DAY_LAKE_DEEP, dayFactor)
  ;(u.uLakeShallow!.value as Color).copy(NIGHT_LAKE_SHALLOW).lerp(DAY_LAKE_SHALLOW, dayFactor)
  ;(u.uLakeFoam!.value as Color).copy(NIGHT_LAKE_FOAM).lerp(DAY_LAKE_FOAM, dayFactor)
  ;(u.uOceanDeep!.value as Color).copy(NIGHT_OCEAN_DEEP).lerp(DAY_OCEAN_DEEP, dayFactor)
  ;(u.uOceanShallow!.value as Color).copy(NIGHT_OCEAN_SHALLOW).lerp(DAY_OCEAN_SHALLOW, dayFactor)
  ;(u.uOceanFoam!.value as Color).copy(NIGHT_OCEAN_FOAM).lerp(DAY_OCEAN_FOAM, dayFactor)
  _sun.copy(sunDirection)
  if (_sun.lengthSq() < 1e-8) _sun.set(0, 1, 0)
  else _sun.normalize()
  ;(u.uSunDirection!.value as Vector3).copy(_sun)
}

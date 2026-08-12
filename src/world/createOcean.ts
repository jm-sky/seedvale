import {
  Color,
  DataTexture,
  LinearFilter,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  type Scene,
  UnsignedByteType,
  Vector3,
} from 'three'
import { Water } from 'three/addons/objects/Water.js'

export type WorldOcean = {
  mesh: Water
  update: (dt: number) => void
  setDayNight: (dayFactor: number, sunDirection: Vector3) => void
  /** Recenters the ocean plane under the player — cheap (position only, no
   *  geometry/texture rebuild), unlike a chunked world's terrain/water. */
  follow: (x: number, z: number) => void
  addTo: (scene: Scene) => void
  dispose: () => void
}

const DAY_WATER_COLOR = new Color(0x0f3a52)
const NIGHT_WATER_COLOR = new Color(0x050c14)
const DAY_SUN_COLOR = new Color(0xffffff)
const NIGHT_SUN_COLOR = new Color(0x445566)

const NORMAL_MAP_SIZE = 256

/**
 * Bakes a tileable water normal map from a handful of periodic sine ripples
 * (integer cycle counts over the texture ⇒ seamless wrap) instead of loading
 * an external asset — keeps the project self-contained.
 */
function createProceduralWaterNormals(): DataTexture {
  const size = NORMAL_MAP_SIZE
  const data = new Uint8Array(size * size * 4)
  const ripples = [
    { cycles: 3, amp: 1.0, angle: 0.3 },
    { cycles: 7, amp: 0.5, angle: 1.7 },
    { cycles: 13, amp: 0.25, angle: 2.6 },
    { cycles: 21, amp: 0.12, angle: 0.9 },
  ]
  const normal = new Vector3()

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2
      const v = (y / size) * Math.PI * 2
      let dhdu = 0
      let dhdv = 0
      for (const r of ripples) {
        const dirU = Math.cos(r.angle)
        const dirV = Math.sin(r.angle)
        const phase = r.cycles * (u * dirU + v * dirV)
        const slope = r.amp * Math.cos(phase) * r.cycles
        dhdu += slope * dirU
        dhdv += slope * dirV
      }
      normal.set(-dhdu, 1, -dhdv).normalize()

      const idx = (y * size + x) * 4
      data[idx] = Math.round((normal.x * 0.5 + 0.5) * 255)
      data[idx + 1] = Math.round((normal.y * 0.5 + 0.5) * 255)
      data[idx + 2] = Math.round((normal.z * 0.5 + 0.5) * 255)
      data[idx + 3] = 255
    }
  }

  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

/** Mirror RT resolution — Water.js re-renders the scene into this every frame.
 *  256 is enough for stylized reflections and ~4× cheaper than 512. */
const OCEAN_MIRROR_SIZE = 256

/**
 * Reflective ocean (three/addons Water.js) — a single app-level plane sized to
 * generously cover the loaded chunk region and re-centered under the player via
 * `follow()` rather than rebuilt per chunk (Water.js does its own mirror-camera
 * render pass per frame; per-chunk instances would mean dozens of extra scene
 * renders per frame). Only ever becomes visible where nothing else occludes it:
 * opaque terrain hides it under dry land, and each chunk's stylized water
 * (createChunkWater) sits above it and discards itself over large-body cells, so
 * this is only seen where the flood-fill classified a body as large.
 *
 * Transparency: Water.js writes `alpha` into `gl_FragColor` but does not set
 * `material.transparent`, so blending never ran. We enable real blending with
 * `depthWrite: false` (foliage is alpha-tested / opaque — see foliageWind) and
 * fresnel-modulate opacity in the patched fragment shader. No extra passes or
 * heightmap sampling — keeps the mirror pass as the only ocean cost.
 */
export function createOcean(size: number, waterLevel: number): WorldOcean {
  const geometry = new PlaneGeometry(size, size)
  const waterNormals = createProceduralWaterNormals()

  const water = new Water(geometry, {
    textureWidth: OCEAN_MIRROR_SIZE,
    textureHeight: OCEAN_MIRROR_SIZE,
    waterNormals,
    sunDirection: new Vector3(0, 1, 0),
    sunColor: DAY_SUN_COLOR.clone(),
    waterColor: DAY_WATER_COLOR.clone(),
    distortionScale: 2.2,
    // Base opacity when looking straight down; grazing angles go denser via the
    // shader patch below.
    alpha: 0.78,
    fog: true,
  })
  water.material.uniforms.size!.value = 3.5
  // Water.js never sets these — without them `alpha` is ignored by the blender.
  water.material.transparent = true
  water.material.depthWrite = false
  water.rotation.x = -Math.PI / 2
  water.position.y = waterLevel + 0.02
  water.name = 'ocean'

  // Water.js's Fresnel reflectance climbs to ~1 at grazing angles, which for
  // water viewed from above at a distance (the common case here) means "almost
  // pure mirrored sky" — reads as a flat bright/silver sheet rather than
  // ocean-colored water. Three.js doesn't expose a hook to tune this, so patch
  // the compiled fragment shader: cap max reflectance and tint the reflection
  // sample toward waterColor so the sky bleed-through stays colored. Also
  // fresnel-modulate alpha (denser edge-on, more see-through from above).
  water.material.fragmentShader = water.material.fragmentShader
    .replace(
      'float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );',
      'float reflectance = min( 0.4, rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 ) );',
    )
    .replace(
      'vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );',
      'vec3 reflectionSample = mix( vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) ), waterColor, 0.55 );',
    )
    .replace(
      'vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);',
      'vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( waterColor * 0.15 + reflectionSample * 0.55 + reflectionSample * specularLight * 0.5 ), reflectance);',
    )
    .replace(
      'gl_FragColor = vec4( outgoingLight, alpha );',
      // theta≈1 looking down → more transparent; theta≈0 grazing → denser.
      'float waterAlpha = mix( min( 0.94, alpha + 0.14 ), alpha * 0.72, theta );\n'
      + '\t\t\t\t\tgl_FragColor = vec4( outgoingLight, waterAlpha );',
    )
  water.material.needsUpdate = true

  return {
    mesh: water,
    update(dt) {
      water.material.uniforms.time!.value += dt
    },
    setDayNight(dayFactor, sunDirection) {
      const sunColor = water.material.uniforms.sunColor!.value as Color
      const waterColor = water.material.uniforms.waterColor!.value as Color
      sunColor.copy(NIGHT_SUN_COLOR).lerp(DAY_SUN_COLOR, dayFactor)
      waterColor.copy(NIGHT_WATER_COLOR).lerp(DAY_WATER_COLOR, dayFactor)
      const uniformSunDir = water.material.uniforms.sunDirection!.value as Vector3
      uniformSunDir.copy(sunDirection)
    },
    follow(x, z) {
      water.position.x = x
      water.position.z = z
    },
    addTo(scene) {
      scene.add(water)
    },
    dispose() {
      geometry.dispose()
      water.material.dispose()
      waterNormals.dispose()
      const mirrorSampler = water.material.uniforms.mirrorSampler!.value as {
        dispose?: () => void
      } | null
      mirrorSampler?.dispose?.()
      water.removeFromParent()
    },
  }
}

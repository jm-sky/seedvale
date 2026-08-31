import { Color, Group, type Scene, Sprite, SpriteMaterial, type Texture } from 'three'
import type { WeatherState, WeatherType } from './weather'
import { loadTexture } from '../assets/loadTexture'
import { isSystemEnabled } from '../debug/debugMode'

/** Sky-level cloud billboards (plan world-terrain-001). No literal cloud
 *  geometry existed before this — `weatherVisuals.ts` only faked "cloudy" as
 *  dimmer light/hazier fog, and `createSky.ts` explicitly zeroes the Sky
 *  addon's own procedural clouds in favor of this system. Plain
 *  `THREE.Sprite`/`SpriteMaterial` billboards, not GPU-driven like
 *  `weatherParticles.ts` — coverage/tint only need to change a few times per
 *  weather cycle rather than per-particle every frame, so a custom shader
 *  buys nothing here. */

const CLOUD_TEXTURE_URLS = [
  '/images/clouds/cloud1.png',
  '/images/clouds/cloud2.png',
  '/images/clouds/cloud3.png',
  '/images/clouds/cloud4.png',
]

const CLOUD_COUNT = 28
const CLOUD_HEIGHT = 120
const CLOUD_HEIGHT_JITTER = 18
/** Wind-axis (X) wrap bound. Recycling must land outside `camera.far`
 *  (`createCamera.ts`: 500) so the reroll is never visible: worst-case
 *  distance from the player at wrap is
 *  sqrt(AREA_HALF_WIDTH² + DEPTH_HALF_WIDTH² + (CLOUD_HEIGHT+JITTER)²) ≈ 527.
 *  Ignores the few-unit camera offset from the player — an intentional
 *  approximation at this scale. */
const AREA_HALF_WIDTH = 480
const DEPTH_HALF_WIDTH = 180
const WIND_SPEED = 1.4
const SCALE_MIN = 70
const SCALE_MAX = 150
const BASE_COVERAGE = 0.15
const BASE_TINT = 0xffffff

type CloudVisualProfile = {
  coverage: number
  tint: number
}

/** `weather.intensity` is always 0 for `clear` (`weather.ts`), so
 *  `BASE_COVERAGE`/`BASE_TINT` already is the "few or no clouds" resting
 *  state the plan calls for — the `clear` entry below is unreachable in
 *  practice and kept only for `Record` completeness. `fog`'s "no special
 *  cloud behaviour" (plan §3) means it stays at the baseline too — the
 *  existing ground-fog overlay (`weatherVisuals.ts`) remains the only
 *  fog-specific visual. */
const CLOUD_VISUAL_PROFILES: Record<WeatherType, CloudVisualProfile> = {
  clear: { coverage: 0.15, tint: 0xffffff },
  cloudy: { coverage: 0.85, tint: 0xe8ecf1 },
  rain: { coverage: 0.95, tint: 0x5b6673 },
  snow: { coverage: 0.75, tint: 0xf4f7fa },
  fog: { coverage: 0.15, tint: 0xffffff },
}

export type CloudAppearance = {
  coverage: number
  tint: number
}

/** Ambient "light" clouds are multiplied by across the day/night cycle —
 *  not a replacement tint (that would erase weather-tint differences, e.g.
 *  rain clouds vs clear clouds would look identical at night) but an RGB
 *  multiplier applied on top of whatever `CLOUD_VISUAL_PROFILES` picked, the
 *  same way real clouds dim/cool under a darker sky. Day is a no-op
 *  (1,1,1); dusk/dawn warms and dims slightly; night is a dark cool
 *  blue-grey, chosen bright enough to still read against `dayNight.ts`'s
 *  `NIGHT_FOG` (0x1a2233) instead of blending into it. */
const DAY_CLOUD_LIGHT = new Color(0xffffff)
const DUSK_CLOUD_LIGHT = new Color(0xffdcc0)
const NIGHT_CLOUD_LIGHT = new Color(0x5a6b8c)
const tmpLightColor = new Color()
const tmpBaseColor = new Color()
const tmpTargetColor = new Color()

/** Mirrors `dayNight.ts`'s `fogColorFromElev` 3-stop smooth blend (same
 *  -0.3/0/0.3 elevation breakpoints) so clouds and fog transition through
 *  dusk/dawn in lockstep instead of drifting apart. `elev` (not `dayFactor`)
 *  because `dayFactor` is clamped to 0 for the entire below-horizon range —
 *  multiplying by it would make clouds vanish at night rather than just
 *  darken. */
function cloudLightFromElev(elev: number): Color {
  if (elev <= -0.3) return tmpLightColor.copy(NIGHT_CLOUD_LIGHT)
  if (elev >= 0.3) return tmpLightColor.copy(DAY_CLOUD_LIGHT)
  if (elev <= 0) {
    return tmpLightColor.copy(NIGHT_CLOUD_LIGHT).lerp(DUSK_CLOUD_LIGHT, (elev + 0.3) / 0.3)
  }
  return tmpLightColor.copy(DUSK_CLOUD_LIGHT).lerp(DAY_CLOUD_LIGHT, elev / 0.3)
}

/** Pure — mirrors `weatherVisuals.ts`'s `applyWeatherOverlay`: linearly
 *  blends the baseline toward the active weather type's profile by
 *  `weather.intensity`, then applies the day/night ambient multiplier so
 *  night clouds read as dark/cool rather than staying white (plan
 *  world-terrain-001). */
export function cloudAppearanceFor(weather: WeatherState, elev: number): CloudAppearance {
  const profile = CLOUD_VISUAL_PROFILES[weather.type]
  const t = weather.intensity
  const coverage = BASE_COVERAGE + (profile.coverage - BASE_COVERAGE) * t
  tmpBaseColor.setHex(BASE_TINT)
  tmpTargetColor.setHex(profile.tint)
  tmpBaseColor.lerp(tmpTargetColor, t)
  tmpBaseColor.multiply(cloudLightFromElev(elev))
  return { coverage, tint: tmpBaseColor.getHex() }
}

type CloudSprite = {
  sprite: Sprite
  localX: number
  /** Fixed at creation, `i / CLOUD_COUNT` — same trick as
   *  `weatherParticles.ts`'s `aRandom.w` draw-order slot, evaluated on the
   *  CPU instead of in-shader since each cloud is a real `Object3D`. */
  visibilityThreshold: number
}

function randomize(cs: CloudSprite, materials: SpriteMaterial[]): void {
  const material = materials[Math.floor(Math.random() * materials.length)]
  cs.sprite.material = material
  const image = material.map!.image as { width: number, height: number }
  const width = SCALE_MIN + Math.random() * (SCALE_MAX - SCALE_MIN)
  cs.sprite.scale.set(width, width * (image.height / image.width), 1)
  cs.sprite.position.z = (Math.random() * 2 - 1) * DEPTH_HALF_WIDTH
  cs.sprite.position.y = CLOUD_HEIGHT + (Math.random() * 2 - 1) * CLOUD_HEIGHT_JITTER
}

export type CloudSystem = {
  addTo: (scene: Scene) => void
  update: (dt: number, weather: WeatherState, elev: number, playerX: number, playerZ: number) => void
  dispose: () => void
}

export function createClouds(): CloudSystem {
  const group = new Group()
  const sprites: CloudSprite[] = []
  let sharedMaterials: SpriteMaterial[] = []

  void Promise.all(CLOUD_TEXTURE_URLS.map(loadTexture)).then((textures: Texture[]) => {
    sharedMaterials = textures.map((map) => new SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      // Sky-layer object, not a ground-level one — matches `createSky.ts`'s
      // `sky.material.fog = false` ("Don't let scene fog wash out the
      // dome"). Ground fog (`fogNear`/`fogFar` ~160-300) would otherwise
      // wash clouds out; weather-driven appearance instead comes entirely
      // from `cloudAppearanceFor`'s tint/coverage.
      fog: false,
      color: BASE_TINT,
    }))

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const sprite = new Sprite(sharedMaterials[0])
      // `.position` is set on the CPU every frame below, so Sprite's default
      // per-object frustum culling is correct and saves draw calls — do NOT
      // copy `weatherParticles.points.frustumCulled = false`, which exists
      // there only because rain/snow move in the vertex shader (stale CPU
      // bounds three.js can't see).
      const cs: CloudSprite = {
        sprite,
        localX: (Math.random() * 2 - 1) * AREA_HALF_WIDTH,
        visibilityThreshold: i / CLOUD_COUNT,
      }
      randomize(cs, sharedMaterials)
      sprites.push(cs)
      group.add(sprite)
    }
  }).catch(() => { /* clouds stay absent if textures fail to load */ })

  function update(dt: number, weather: WeatherState, elev: number, playerX: number, playerZ: number): void {
    group.visible = isSystemEnabled('weather')
    // XZ-follow only; altitude is baked into each sprite's local Y.
    group.position.set(playerX, 0, playerZ)
    if (sprites.length === 0) return
    const appearance = cloudAppearanceFor(weather, elev)
    for (const cs of sprites) {
      cs.localX += WIND_SPEED * dt
      if (cs.localX > AREA_HALF_WIDTH) {
        cs.localX -= AREA_HALF_WIDTH * 2
        randomize(cs, sharedMaterials)
      }
      cs.sprite.position.x = cs.localX
      cs.sprite.visible = cs.visibilityThreshold < appearance.coverage
    }
    for (const material of sharedMaterials) material.color.setHex(appearance.tint)
  }

  return {
    addTo: (scene) => scene.add(group),
    update,
    dispose: () => {
      group.removeFromParent()
      for (const material of sharedMaterials) material.dispose()
    },
  }
}

import { Color, Group, type Scene, Sprite, SpriteMaterial } from 'three'
import type { Season, WeatherState, WeatherType } from './weather'
import { loadTexture } from '../assets/loadTexture'
import { isSystemEnabled } from '../debug/debugMode'

/** Sky-level cloud billboards (plan world-terrain-001, cloud variety per plan
 *  world-terrain-014). No literal cloud geometry existed before this —
 *  `weatherVisuals.ts` only faked "cloudy" as dimmer light/hazier fog, and
 *  `createSky.ts` explicitly zeroes the Sky addon's own procedural clouds in
 *  favor of this system. Plain `THREE.Sprite`/`SpriteMaterial` billboards,
 *  not GPU-driven like `weatherParticles.ts` — coverage/tint only need to
 *  change a few times per weather cycle rather than per-particle every
 *  frame, so a custom shader buys nothing here. */

/** Rendering-only visual families (plan world-terrain-014 §1) — not a
 *  meteorological cloud-type simulation. `textures` accepts 1+ paths so
 *  assets can be reclassified/expanded through config alone. Height/scale/
 *  drift ranges are deliberately per-category so the two families read as
 *  visually distinct without per-sprite materials or a shader. Asset
 *  membership below is a first tuning pass (`docs/plans/implementation-notes`
 *  — "classify only the PNGs actually chosen"), not a gameplay contract. */
export type CloudCategory = 'light' | 'dense'

type CloudCategoryConfig = {
  textures: readonly string[]
  heightRange: readonly [number, number]
  scaleRange: readonly [number, number]
  driftSpeedRange: readonly [number, number]
}

const CLOUD_CATEGORIES: Record<CloudCategory, CloudCategoryConfig> = {
  light: {
    textures: ['/images/clouds/cloud1.png', '/images/clouds/cloud2.png'],
    heightRange: [126, 146],
    scaleRange: [70, 115],
    driftSpeedRange: [1.3, 1.7],
  },
  dense: {
    textures: ['/images/clouds/cloud3.png', '/images/clouds/cloud4.png'],
    heightRange: [100, 125],
    scaleRange: [115, 160],
    driftSpeedRange: [0.9, 1.3],
  },
}

const CLOUD_COUNT = 28
/** Wind-axis (X) wrap bound. Recycling must land outside `camera.far`
 *  (`createCamera.ts`: 500) so the reroll is never visible: worst-case
 *  distance from the player at wrap is
 *  sqrt(AREA_HALF_WIDTH² + DEPTH_HALF_WIDTH² + (maxCategoryHeight)²) ≈ 527.
 *  Ignores the few-unit camera offset from the player — an intentional
 *  approximation at this scale. */
const AREA_HALF_WIDTH = 480
const DEPTH_HALF_WIDTH = 180
const BASE_COVERAGE = 0.15
const BASE_TINT = 0xffffff

/** Neutral/clear-baseline category mix and each weather type's target mix
 *  (plan §2 table) — `cloudCategoryWeightsFor` blends baseline toward the
 *  active weather's target by `weather.intensity`, so low-intensity rain
 *  doesn't instantly read identical to a downpour. `fog` keeps the clear
 *  mix since coverage stays low and ground fog (`groundFog.ts`) carries the
 *  weather's visual identity instead (plan §2/§9). Exact values are tuning
 *  parameters, not gameplay contracts. */
const NEUTRAL_CATEGORY_WEIGHTS: Readonly<Record<CloudCategory, number>> = { light: 0.85, dense: 0.15 }

const WEATHER_CATEGORY_WEIGHTS: Record<WeatherType, Readonly<Record<CloudCategory, number>>> = {
  clear: { light: 0.85, dense: 0.15 },
  cloudy: { light: 0.35, dense: 0.65 },
  rain: { light: 0.05, dense: 0.95 },
  snow: { light: 0.2, dense: 0.8 },
  fog: { light: 0.85, dense: 0.15 },
}

/** Small optional seasonal nudge (plan §5) — positive shifts weight toward
 *  `light`, negative toward `dense`. Deliberately tiny relative to the
 *  weather-driven swing above so weather stays the primary signal. */
const SEASON_CATEGORY_BIAS: Record<Season, number> = {
  spring: 0,
  summer: 0.05,
  autumn: -0.05,
  winter: -0.05,
}

export type CloudCategoryWeights = Readonly<Record<CloudCategory, number>>

/** Pure — coverage (`cloudAppearanceFor`) and category selection are
 *  deliberately independent (plan §2): this only decides which family a
 *  cloud uses when it is assigned/recycled, never how many are visible.
 *  Defensively re-normalized so a future config edit that doesn't sum to 1
 *  (or a season bias push past 0/1) can't silently skew selection odds. */
export function cloudCategoryWeightsFor(weather: WeatherState, season?: Season): CloudCategoryWeights {
  const target = WEATHER_CATEGORY_WEIGHTS[weather.type]
  const t = weather.intensity
  let light = NEUTRAL_CATEGORY_WEIGHTS.light + (target.light - NEUTRAL_CATEGORY_WEIGHTS.light) * t
  let dense = NEUTRAL_CATEGORY_WEIGHTS.dense + (target.dense - NEUTRAL_CATEGORY_WEIGHTS.dense) * t
  if (season !== undefined) {
    const bias = SEASON_CATEGORY_BIAS[season]
    light += bias
    dense -= bias
  }
  light = Math.max(0, light)
  dense = Math.max(0, dense)
  const total = light + dense
  if (total <= 0) return { light: 0.5, dense: 0.5 }
  return { light: light / total, dense: dense / total }
}

type CloudVisualProfile = {
  coverage: number
  tint: number
}

/** `weather.intensity` is always 0 for `clear` (`weather.ts`), so
 *  `BASE_COVERAGE`/`BASE_TINT` already is the "few or no clouds" resting
 *  state the plan calls for — the `clear` entry below is unreachable in
 *  practice and kept only for `Record` completeness. `fog`'s "few clouds;
 *  category mix is secondary to ground fog" (plan §2) means coverage stays
 *  at the baseline too — `groundFog.ts`'s local layer carries fog weather's
 *  visual identity instead. */
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
  speed: number
  /** Presentation metadata only, kept for recycling/debugging — category
   *  identity lives on the sprite until it wraps (plan §3: no global
   *  reassignment on weather change). */
  category: CloudCategory
  /** Fixed at creation, `i / CLOUD_COUNT` — same trick as
   *  `weatherParticles.ts`'s `aRandom.w` draw-order slot, evaluated on the
   *  CPU instead of in-shader since each cloud is a real `Object3D`. */
  visibilityThreshold: number
}

type CategoryMaterials = Record<CloudCategory, SpriteMaterial[]>

/** Picks a category weighted by `weights`, but falls back to whichever
 *  category actually has loaded materials — guards the
 *  `Math.floor(Math.random() * 0)` / undefined-material case from an empty
 *  or not-yet-loaded category (plan pitfall list) without requiring every
 *  category to ship at least one texture. */
function pickCategory(weights: CloudCategoryWeights, materials: CategoryMaterials): CloudCategory {
  const lightAvailable = materials.light.length > 0
  const denseAvailable = materials.dense.length > 0
  if (!lightAvailable) return 'dense'
  if (!denseAvailable) return 'light'
  return Math.random() < weights.light ? 'light' : 'dense'
}

function randomize(cs: CloudSprite, materials: CategoryMaterials, weights: CloudCategoryWeights): void {
  const category = pickCategory(weights, materials)
  const categoryMaterials = materials[category]
  const material = categoryMaterials[Math.floor(Math.random() * categoryMaterials.length)]
  const config = CLOUD_CATEGORIES[category]
  cs.category = category
  cs.sprite.material = material
  const image = material.map!.image as { width: number, height: number }
  const [scaleMin, scaleMax] = config.scaleRange
  const width = scaleMin + Math.random() * (scaleMax - scaleMin)
  cs.sprite.scale.set(width, width * (image.height / image.width), 1)
  cs.sprite.position.z = (Math.random() * 2 - 1) * DEPTH_HALF_WIDTH
  const [heightMin, heightMax] = config.heightRange
  cs.sprite.position.y = heightMin + Math.random() * (heightMax - heightMin)
  const [speedMin, speedMax] = config.driftSpeedRange
  cs.speed = speedMin + Math.random() * (speedMax - speedMin)
}

export type CloudSystem = {
  addTo: (scene: Scene) => void
  update: (dt: number, weather: WeatherState, elev: number, playerX: number, playerZ: number, season?: Season) => void
  dispose: () => void
}

/** Loads one category's textures independently via `Promise.allSettled` —
 *  one bad/missing candidate PNG in a category must not disable the whole
 *  cloud system (plan implementation-notes pitfall list), unlike the plain
 *  `Promise.all` this mirrors for the single-list case `weatherParticles.ts`
 *  doesn't need. */
async function loadCategoryMaterials(config: CloudCategoryConfig): Promise<SpriteMaterial[]> {
  const results = await Promise.allSettled(config.textures.map(loadTexture))
  const materials: SpriteMaterial[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    materials.push(new SpriteMaterial({
      map: result.value,
      transparent: true,
      depthWrite: false,
      // Sky-layer object, not a ground-level one — matches `createSky.ts`'s
      // `sky.material.fog = false` ("Don't let scene fog wash out the
      // dome"). Ground fog (`groundFog.ts`) would otherwise wash clouds out;
      // weather-driven appearance instead comes entirely from
      // `cloudAppearanceFor`'s tint/coverage.
      fog: false,
      color: BASE_TINT,
    }))
  }
  return materials
}

export function createClouds(): CloudSystem {
  const group = new Group()
  const sprites: CloudSprite[] = []
  const materials: CategoryMaterials = { light: [], dense: [] }

  void Promise.all([
    loadCategoryMaterials(CLOUD_CATEGORIES.light),
    loadCategoryMaterials(CLOUD_CATEGORIES.dense),
  ]).then(([light, dense]) => {
    materials.light = light
    materials.dense = dense
    if (light.length === 0 && dense.length === 0) return // clouds stay absent

    // Initial assignment uses the clear-sky baseline; the first real
    // `update()` call will already have the live weather profile for
    // whatever gets recycled after that.
    const initialWeights = NEUTRAL_CATEGORY_WEIGHTS
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const sprite = new Sprite()
      // `.position` is set on the CPU every frame below, so Sprite's default
      // per-object frustum culling is correct and saves draw calls — do NOT
      // copy `weatherParticles.points.frustumCulled = false`, which exists
      // there only because rain/snow move in the vertex shader (stale CPU
      // bounds three.js can't see).
      const cs: CloudSprite = {
        sprite,
        localX: (Math.random() * 2 - 1) * AREA_HALF_WIDTH,
        speed: 1,
        category: 'light',
        visibilityThreshold: i / CLOUD_COUNT,
      }
      randomize(cs, materials, initialWeights)
      sprites.push(cs)
      group.add(sprite)
    }
  }).catch(() => { /* clouds stay absent if textures fail to load */ })

  function update(dt: number, weather: WeatherState, elev: number, playerX: number, playerZ: number, season?: Season): void {
    group.visible = isSystemEnabled('weather')
    // XZ-follow only; altitude is baked into each sprite's local Y.
    group.position.set(playerX, 0, playerZ)
    if (sprites.length === 0) return
    const appearance = cloudAppearanceFor(weather, elev)
    const weights = cloudCategoryWeightsFor(weather, season)
    for (const cs of sprites) {
      cs.localX += cs.speed * dt
      if (cs.localX > AREA_HALF_WIDTH) {
        cs.localX -= AREA_HALF_WIDTH * 2
        randomize(cs, materials, weights)
      }
      cs.sprite.position.x = cs.localX
      cs.sprite.visible = cs.visibilityThreshold < appearance.coverage
    }
    for (const categoryMaterials of [materials.light, materials.dense]) {
      for (const material of categoryMaterials) material.color.setHex(appearance.tint)
    }
  }

  return {
    addTo: (scene) => scene.add(group),
    update,
    dispose: () => {
      group.removeFromParent()
      for (const categoryMaterials of [materials.light, materials.dense]) {
        for (const material of categoryMaterials) material.dispose()
      }
    },
  }
}

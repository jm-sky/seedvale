import { Color, MathUtils } from 'three'
import type { BiomeWeights } from './biomeRegions'
import { LinearSpline } from '../math/linearSpline'

const SEABED = new Color(0x2f5244)
const SAND = new Color(0xd4c090)
const ROCK = new Color(0x6a6560)
const SNOW = new Color(0xdfe6ee)
const ABYSS = new Color(0x122622)
/** Swamp shoreline — replaces the default tan `SAND` band with muddy ground. */
const MUD = new Color(0x4a3f2a)

/** Shore sand band above water (world units). */
export const SAND_BAND = 0.6

/** Half-width of the smoothed seabed → sand transition (world units). */
const SEABED_BLEND = 0.25
/** Half-width of the smoothed sand → land transition (world units). */
const LAND_BLEND = 0.35

const landTmp = new Color()

/** Steepness (1 - normal.y) where rock starts / fully takes over. */
export const ROCK_SLOPE_START = 0.35
export const ROCK_SLOPE_FULL = 0.55

const colourLerp = (t: number, a: Color, b: Color): Color => {
  const c = a.clone()
  return c.lerpHSL(b, t)
}

/** Arid (dry) height ramp — warm dust / clay → pale peaks. */
function createAridSpline(): LinearSpline<Color> {
  const s = new LinearSpline(colourLerp)
  s.addPoint(0.0, new Color(0xc4a574))
  s.addPoint(0.3, new Color(0xd9b87a))
  s.addPoint(0.55, new Color(0xa89070))
  s.addPoint(0.8, new Color(0x8a8070))
  s.addPoint(1.0, SNOW.clone())
  return s
}

/** Humid height ramp — saturated forest → meadow → rock/snow. */
function createHumidSpline(): LinearSpline<Color> {
  const s = new LinearSpline(colourLerp)
  s.addPoint(0.0, new Color(0x2d5c32))
  s.addPoint(0.3, new Color(0x4f9a3e))
  s.addPoint(0.55, new Color(0x8bc45a))
  s.addPoint(0.75, new Color(0xb8d47a))
  s.addPoint(0.88, new Color(0x7a7a72))
  s.addPoint(1.0, SNOW.clone())
  return s
}

/** Desert height ramp — pale dune sand → sun-baked clay/rock, low-lying (no
 *  lush growth, no early snow — deserts stay bare well into the highlands). */
function createDesertSpline(): LinearSpline<Color> {
  const s = new LinearSpline(colourLerp)
  s.addPoint(0.0, new Color(0xdcc27a))
  s.addPoint(0.35, new Color(0xe3c98a))
  s.addPoint(0.6, new Color(0xc9986a))
  s.addPoint(0.85, new Color(0x9a7a5c))
  s.addPoint(1.0, SNOW.clone())
  return s
}

/** Swamp height ramp — dark, murky, narrow band near `waterLevel` (swamp
 *  is gated out at altitude by `biomeWeightsAt`, so the top of this ramp
 *  rarely shows). */
function createSwampSpline(): LinearSpline<Color> {
  const s = new LinearSpline(colourLerp)
  s.addPoint(0.0, new Color(0x3a3524))
  s.addPoint(0.3, new Color(0x4a4a2e))
  s.addPoint(0.6, new Color(0x5c6b3a))
  s.addPoint(1.0, new Color(0x6f7a4a))
  return s
}

const arid = createAridSpline()
const humid = createHumidSpline()
const desert = createDesertSpline()
const swamp = createSwampSpline()

/**
 * Biome × height coloring (wzór z 3d-portfolio / SimonDev).
 * `moisture` ∈ [0,1] (fine detail arid↔humid blend). `biomeWeights` (macro
 * desert/swamp/forest, see `biomeRegions.ts`) overrides on top where their
 * weight is > 0 — zero change where both are ~0 (today's default "forest").
 * Does not apply slope rock or micro-tint.
 */
export function colorForTerrain(
  height: number,
  moisture: number,
  waterLevel: number,
  heightScale: number,
  biomeWeights: BiomeWeights,
  out: Color,
): void {
  const hNorm = Math.min(
    1,
    Math.max(0, (height - waterLevel) / Math.max(heightScale, 0.001)),
  )
  const cArid = arid.get(hNorm)
  const cHumid = humid.get(hNorm)
  landTmp.copy(cArid).lerpHSL(cHumid, moisture)
  if (biomeWeights.desert > 0) landTmp.lerpHSL(desert.get(hNorm), biomeWeights.desert)
  if (biomeWeights.swamp > 0) landTmp.lerpHSL(swamp.get(hNorm), biomeWeights.swamp)

  const seabedToSand = MathUtils.smoothstep(
    height,
    waterLevel - SEABED_BLEND,
    waterLevel + SEABED_BLEND,
  )
  out.copy(SEABED).lerpHSL(SAND, seabedToSand)
  if (biomeWeights.swamp > 0) out.lerpHSL(MUD, biomeWeights.swamp * 0.6)

  const sandToLand = MathUtils.smoothstep(
    height,
    waterLevel + SAND_BAND - LAND_BLEND,
    waterLevel + SAND_BAND + LAND_BLEND,
  )
  out.lerpHSL(landTmp, sandToLand)
}

/**
 * Blend toward rock on steep faces. Skips seabed; softens on shore sand.
 * `steepness` = 1 - normal.y (0 = flat, ~1 = cliff).
 */
export function applySlopeRock(
  color: Color,
  height: number,
  waterLevel: number,
  steepness: number,
): void {
  if (height <= waterLevel + 0.05) return

  const t = Math.min(
    1,
    Math.max(
      0,
      (steepness - ROCK_SLOPE_START) / (ROCK_SLOPE_FULL - ROCK_SLOPE_START),
    ),
  )
  if (t <= 0) return

  // Shore sand: weaker rock so beaches stay sandy
  const shoreFade =
    height < waterLevel + SAND_BAND
      ? Math.max(0, (height - waterLevel - 0.05) / (SAND_BAND - 0.05))
      : 1

  color.lerp(ROCK, t * shoreFade)
}

/**
 * Blends toward bare rock/snow on mountain-range ridge crests (`mountainRidge`,
 * the gated Worley-ridge value from `chunkHeightmap.ts`) — makes a "mountain
 * range" region read as bare stone/snow even before `applySlopeRock`'s
 * steepness-driven rock kicks in on individual steep faces, visually
 * distinguishing a whole range from an ordinary steep hill.
 */
export function applyMountainRock(
  color: Color,
  mountainRidge: number,
  height: number,
  waterLevel: number,
  heightScale: number,
): void {
  if (height <= waterLevel + 0.05 || mountainRidge <= 0) return

  const altitude = Math.max(0, (height - waterLevel) / Math.max(heightScale, 0.001))
  const rockT = Math.min(1, mountainRidge * 1.4)
  color.lerp(ROCK, rockT * 0.85)

  const snowT = Math.max(0, Math.min(1, (altitude - 0.55) / 0.3)) * mountainRidge
  if (snowT > 0) color.lerp(SNOW, snowT)
}

/**
 * Darkens submerged seabed further as `continentalness` drops well below the
 * ocean/coast boundary — distinguishes deep abyssal ocean floor from shallow
 * coastal seabed, so the ocean *region* reads visually distinct, not just
 * "wherever noise happened to dip below waterLevel" as before regions existed.
 */
export function applyOceanDepthTint(
  color: Color,
  continentalness: number,
  height: number,
  waterLevel: number,
): void {
  if (height > waterLevel - 0.05) return
  const abyssT = 1 - MathUtils.smoothstep(continentalness, 0.0, 0.3)
  if (abyssT <= 0) return
  color.lerpHSL(ABYSS, abyssT * 0.7)
}

/**
 * Cheap spatial hash → [-1, 1] for micro lightness variation.
 * Avoids flat fill on large biome plates without a second FBM pass.
 */
export function terrainTintNoise(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
  return (n - Math.floor(n)) * 2 - 1
}

/** ±amount lightness jitter on land (seabed unchanged). */
export function applyMicroTint(
  color: Color,
  height: number,
  waterLevel: number,
  x: number,
  z: number,
  amount = 0.045,
): void {
  if (height <= waterLevel + 0.05) return
  const n = terrainTintNoise(x * 0.35, z * 0.35)
  const f = 1 + n * amount
  color.r = Math.min(1, Math.max(0, color.r * f))
  color.g = Math.min(1, Math.max(0, color.g * f))
  color.b = Math.min(1, Math.max(0, color.b * f))
}

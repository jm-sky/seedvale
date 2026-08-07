import { Color, MathUtils } from 'three'
import { LinearSpline } from '../math/linearSpline'

const SEABED = new Color(0x2f5244)
const SAND = new Color(0xd4c090)
const ROCK = new Color(0x6a6560)
const SNOW = new Color(0xdfe6ee)

/** Shore sand band above water (world units). */
const SAND_BAND = 0.6

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

const arid = createAridSpline()
const humid = createHumidSpline()

/**
 * Biome × height coloring (wzór z 3d-portfolio / SimonDev).
 * `moisture` ∈ [0,1]. Does not apply slope rock or micro-tint.
 */
export function colorForTerrain(
  height: number,
  moisture: number,
  waterLevel: number,
  heightScale: number,
  out: Color,
): void {
  const hNorm = Math.min(
    1,
    Math.max(0, (height - waterLevel) / Math.max(heightScale, 0.001)),
  )
  const cArid = arid.get(hNorm)
  const cHumid = humid.get(hNorm)
  landTmp.copy(cArid).lerpHSL(cHumid, moisture)

  const seabedToSand = MathUtils.smoothstep(
    height,
    waterLevel - SEABED_BLEND,
    waterLevel + SEABED_BLEND,
  )
  out.copy(SEABED).lerpHSL(SAND, seabedToSand)

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

import { Color } from 'three'
import { LinearSpline } from '../math/linearSpline'

const SEABED = new Color(0x3d5c4a)
const SAND = new Color(0xc2b280)
const SNOW = new Color(0xdfe6ee)
const FOREST = new Color(0x3f6b3a)

const colourLerp = (t: number, a: Color, b: Color): Color => {
  const c = a.clone()
  return c.lerpHSL(b, t)
}

/** Arid (dry) height ramp — sandy lows → pale peaks. */
function createAridSpline(): LinearSpline<Color> {
  const s = new LinearSpline(colourLerp)
  s.addPoint(0.0, new Color(0xb7a67d))
  s.addPoint(0.35, new Color(0xd4c49a))
  s.addPoint(0.7, new Color(0x8a8070))
  s.addPoint(1.0, SNOW.clone())
  return s
}

/** Humid height ramp — forest → meadow → rock/snow. */
function createHumidSpline(): LinearSpline<Color> {
  const s = new LinearSpline(colourLerp)
  s.addPoint(0.0, FOREST.clone())
  s.addPoint(0.35, new Color(0x6fa84e))
  s.addPoint(0.65, new Color(0xcee59c))
  s.addPoint(0.85, new Color(0x7a7a72))
  s.addPoint(1.0, SNOW.clone())
  return s
}

const arid = createAridSpline()
const humid = createHumidSpline()

/**
 * Biome × height coloring (wzór z 3d-portfolio / SimonDev).
 * `hNorm` ≈ height above water / heightScale; `moisture` ∈ [0,1].
 */
export function colorForTerrain(
  height: number,
  moisture: number,
  waterLevel: number,
  heightScale: number,
  out: Color,
): void {
  if (height <= waterLevel + 0.05) {
    out.copy(SEABED)
    return
  }
  if (height < waterLevel + 1.0) {
    out.copy(SAND)
    return
  }

  const hNorm = Math.min(
    1,
    Math.max(0, (height - waterLevel) / Math.max(heightScale, 0.001)),
  )
  const cArid = arid.get(hNorm)
  const cHumid = humid.get(hNorm)
  out.copy(cArid).lerpHSL(cHumid, moisture)
}

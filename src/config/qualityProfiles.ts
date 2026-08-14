/** Mirrors `WorldConfig['postProcessing']['aoQuality']` — kept local so this
 *  module does not import `worldConfig` (that file imports us). */
type AoQuality = 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'

export type QualityPreset = 'Low' | 'Medium' | 'High' | 'Custom'

/** Live graphics knobs a quality preset owns. Changing any of these without
 *  matching a named preset flips the stored preset to `Custom`. World-gen
 *  fields (terrain resolution, grass density, load radius) are intentionally
 *  absent — those rebuild the world. */
export type QualityKnobs = {
  pixelRatioCap: number
  aoEnabled: boolean
  aoQuality: AoQuality
  bloomEnabled: boolean
  godRaysEnabled: boolean
  waterReflections: boolean
  terrainCastsShadow: boolean
  shadowMapSize: number
  lodScale: number
}

export const QUALITY_PRESETS: Record<Exclude<QualityPreset, 'Custom'>, QualityKnobs> = {
  Low: {
    pixelRatioCap: 1,
    aoEnabled: false,
    aoQuality: 'Performance',
    bloomEnabled: false,
    godRaysEnabled: false,
    waterReflections: false,
    terrainCastsShadow: false,
    shadowMapSize: 512,
    lodScale: 0.5,
  },
  Medium: {
    pixelRatioCap: 1.5,
    aoEnabled: true,
    aoQuality: 'Performance',
    bloomEnabled: true,
    godRaysEnabled: false,
    waterReflections: true,
    terrainCastsShadow: true,
    shadowMapSize: 1024,
    lodScale: 0.75,
  },
  High: {
    pixelRatioCap: 2,
    aoEnabled: false,
    aoQuality: 'Low',
    bloomEnabled: true,
    godRaysEnabled: true,
    waterReflections: true,
    terrainCastsShadow: true,
    shadowMapSize: 1024,
    lodScale: 1,
  },
}

export const QUALITY_PRESET_IDS: readonly QualityPreset[] = ['Low', 'Medium', 'High', 'Custom']

export function isQualityPreset(value: unknown): value is QualityPreset {
  return typeof value === 'string' && (QUALITY_PRESET_IDS as readonly string[]).includes(value)
}

export function knobsFromConfig(input: {
  postProcessing: {
    pixelRatioCap: number
    aoEnabled: boolean
    aoQuality: AoQuality
    bloomEnabled: boolean
    godRaysEnabled: boolean
    waterReflections: boolean
    terrainCastsShadow: boolean
    shadowMapSize: number
  }
  quality: { lodScale: number }
}): QualityKnobs {
  const { postProcessing: p, quality } = input
  return {
    pixelRatioCap: p.pixelRatioCap,
    aoEnabled: p.aoEnabled,
    aoQuality: p.aoQuality,
    bloomEnabled: p.bloomEnabled,
    godRaysEnabled: p.godRaysEnabled,
    waterReflections: p.waterReflections,
    terrainCastsShadow: p.terrainCastsShadow,
    shadowMapSize: p.shadowMapSize,
    lodScale: quality.lodScale,
  }
}

export function knobsMatch(a: QualityKnobs, b: QualityKnobs): boolean {
  return (
    a.pixelRatioCap === b.pixelRatioCap
    && a.aoEnabled === b.aoEnabled
    && a.aoQuality === b.aoQuality
    && a.bloomEnabled === b.bloomEnabled
    && a.godRaysEnabled === b.godRaysEnabled
    && a.waterReflections === b.waterReflections
    && a.terrainCastsShadow === b.terrainCastsShadow
    && a.shadowMapSize === b.shadowMapSize
    && Math.abs(a.lodScale - b.lodScale) < 0.001
  )
}

export function matchQualityPreset(knobs: QualityKnobs): QualityPreset {
  if (knobsMatch(knobs, QUALITY_PRESETS.Low)) return 'Low'
  if (knobsMatch(knobs, QUALITY_PRESETS.Medium)) return 'Medium'
  if (knobsMatch(knobs, QUALITY_PRESETS.High)) return 'High'
  return 'Custom'
}

export function applyQualityKnobs(
  target: {
    postProcessing: {
      pixelRatioCap: number
      aoEnabled: boolean
      aoQuality: AoQuality
      bloomEnabled: boolean
      godRaysEnabled: boolean
      waterReflections: boolean
      terrainCastsShadow: boolean
      shadowMapSize: number
    }
    quality: { preset: QualityPreset; lodScale: number }
  },
  knobs: QualityKnobs,
  preset: QualityPreset,
): void {
  const p = target.postProcessing
  p.pixelRatioCap = knobs.pixelRatioCap
  p.aoEnabled = knobs.aoEnabled
  p.aoQuality = knobs.aoQuality
  p.bloomEnabled = knobs.bloomEnabled
  p.godRaysEnabled = knobs.godRaysEnabled
  p.waterReflections = knobs.waterReflections
  p.terrainCastsShadow = knobs.terrainCastsShadow
  p.shadowMapSize = knobs.shadowMapSize
  target.quality.lodScale = knobs.lodScale
  target.quality.preset = preset
}

export function applyQualityPreset(
  target: {
    postProcessing: {
      pixelRatioCap: number
      aoEnabled: boolean
      aoQuality: AoQuality
      bloomEnabled: boolean
      godRaysEnabled: boolean
      waterReflections: boolean
      terrainCastsShadow: boolean
      shadowMapSize: number
    }
    quality: { preset: QualityPreset; lodScale: number }
  },
  preset: Exclude<QualityPreset, 'Custom'>,
): void {
  applyQualityKnobs(target, QUALITY_PRESETS[preset], preset)
}

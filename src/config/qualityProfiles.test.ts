import { describe, expect, it } from 'vitest'
import type { QualityPreset } from './qualityProfiles'
import {
  applyQualityPreset,
  knobsFromConfig,
  knobsMatch,
  matchQualityPreset,
  QUALITY_PRESETS,
} from './qualityProfiles'

function target(preset: QualityPreset = 'High') {
  return {
    postProcessing: {
      pixelRatioCap: 2,
      aoEnabled: true,
      aoQuality: 'Performance' as const,
      bloomEnabled: true,
      godRaysEnabled: true,
      waterReflections: true,
      terrainCastsShadow: true,
      shadowMapSize: 1024,
    },
    quality: { preset, lodScale: 1, adaptiveEnabled: false, grassFillerCoverage: 0.6 },
  }
}

describe('qualityProfiles', () => {
  it('High knobs match the default High snapshot', () => {
    expect(matchQualityPreset(knobsFromConfig(target('High')))).toBe('High')
  })

  it('applyQualityPreset writes Low knobs and labels the preset', () => {
    const cfg = target()
    applyQualityPreset(cfg, 'Low')
    expect(cfg.quality.preset).toBe('Low')
    expect(cfg.postProcessing.pixelRatioCap).toBe(1)
    expect(cfg.postProcessing.aoEnabled).toBe(false)
    expect(cfg.postProcessing.waterReflections).toBe(false)
    expect(cfg.quality.lodScale).toBe(0.5)
    expect(cfg.quality.grassFillerCoverage).toBe(0)
    expect(knobsMatch(knobsFromConfig(cfg), QUALITY_PRESETS.Low)).toBe(true)
  })

  it('a single knob tweak is Custom', () => {
    const cfg = target()
    applyQualityPreset(cfg, 'Medium')
    cfg.postProcessing.bloomEnabled = false
    expect(matchQualityPreset(knobsFromConfig(cfg))).toBe('Custom')
  })
})

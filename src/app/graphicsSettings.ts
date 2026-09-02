import type { WorldConfig } from '../config/worldConfig'
import type { PostProcessing } from '../render/createPostProcessing'
import type { WorldLights } from '../world/createLights'
import type { WorldSky } from '../world/createSky'
import type { DayNightState } from '../world/dayNight'
import type { WorldBundle } from './worldBundle'
import { saveGraphics, saveWorld } from '../config/persistConfig'
import { applyQualityPreset, knobsFromConfig, matchQualityPreset, type QualityPreset } from '../config/qualityProfiles'
import type { WebGLRenderer } from 'three'

/** The live graphics/quality handlers shared by the lil-gui debug panel, the
 *  Vue "Świat → Grafika" screen and the benchmark runner — one implementation
 *  each, not a second copy per surface. Each handler applies its change to the
 *  running renderer/world and persists the graphics domain of `WorldConfig`.
 *
 *  They deliberately read `bundle.chunkManager` / `bundle.ocean` fresh on every
 *  call instead of capturing them, since `rebuildWorld()` replaces those fields
 *  in place (see `worldBundle.ts`). */
export type GraphicsSettings = {
  /** Re-applies every graphics knob at once (used by quality presets and
   *  after a world rebuild), without persisting on its own. */
  applyLiveGraphics: () => void
  /** Manual sun position from the debug GUI — disables the day/night cycle. */
  updateSkyFromGui: () => void
  updatePostProcessingFromGui: () => void
  updateRenderQualityFromGui: () => void
  updateTerrainShadowFromGui: () => void
  updateShadowMapFromGui: () => void
  updateLodScaleFromGui: () => void
  updateGrassFillerCoverageFromGui: () => void
  applyNamedQualityPreset: (preset: Exclude<QualityPreset, 'Custom'>) => void
  onQualityPresetChange: (preset: QualityPreset) => void
  /** Day/night toggle — re-syncs sky/light/fog immediately when re-enabled. */
  onDayNightChange: () => void
}

export type GraphicsSettingsDeps = {
  config: WorldConfig
  bundle: WorldBundle
  renderer: WebGLRenderer
  postProcessing: PostProcessing
  lights: WorldLights
  sky: WorldSky
  dayNight: DayNightState
  /** Applies the current `timeOfDay` right away — the game loop owns it, and
   *  it does not exist yet when these handlers are created. */
  resyncDayNight: () => void
}

export function createGraphicsSettings(deps: GraphicsSettingsDeps): GraphicsSettings {
  const { config, bundle, renderer, postProcessing, lights, sky, dayNight } = deps

  const updateSkyFromGui = () => {
    dayNight.enabled = false
    sky.setParams(config.sky, lights.sun)
    saveWorld(config)
  }

  const syncQualityLabel = () => {
    config.quality.preset = matchQualityPreset(knobsFromConfig(config))
  }

  const applyLiveGraphics = () => {
    postProcessing.applyConfig(config.postProcessing)
    bundle.ocean.setReflections(config.postProcessing.waterReflections)
    bundle.chunkManager.setWaterReflections(config.postProcessing.waterReflections)
    const pixelRatio = Math.min(window.devicePixelRatio, config.postProcessing.pixelRatioCap)
    renderer.setPixelRatio(pixelRatio)
    postProcessing.setPixelRatio(pixelRatio)
    lights.setShadowMapSize(config.postProcessing.shadowMapSize)
    bundle.chunkManager.setTerrainCastsShadow(config.postProcessing.terrainCastsShadow)
    bundle.chunkManager.setLodScale(config.quality.lodScale)
    bundle.chunkManager.setGrassFillerCoverage(config.quality.grassFillerCoverage)
  }

  const updatePostProcessingFromGui = () => {
    postProcessing.applyConfig(config.postProcessing)
    bundle.ocean.setReflections(config.postProcessing.waterReflections)
    bundle.chunkManager.setWaterReflections(config.postProcessing.waterReflections)
    syncQualityLabel()
    saveGraphics(config)
  }

  // Separate from `updatePostProcessingFromGui`: this one reallocates the
  // renderer's drawing buffer + every composer render target, so it must not
  // run on every bloom/AO slider tick — only when the render-scale control
  // itself changes (perf review A3.2).
  const updateRenderQualityFromGui = () => {
    const pixelRatio = Math.min(window.devicePixelRatio, config.postProcessing.pixelRatioCap)
    renderer.setPixelRatio(pixelRatio)
    postProcessing.setPixelRatio(pixelRatio)
    syncQualityLabel()
    saveGraphics(config)
  }

  // Separate from `updatePostProcessingFromGui`: applies to `ChunkManager`'s
  // already-loaded chunk meshes, not the post-processing composer (perf
  // review A2/#13).
  const updateTerrainShadowFromGui = () => {
    bundle.chunkManager.setTerrainCastsShadow(config.postProcessing.terrainCastsShadow)
    syncQualityLabel()
    saveGraphics(config)
  }

  const updateShadowMapFromGui = () => {
    lights.setShadowMapSize(config.postProcessing.shadowMapSize)
    syncQualityLabel()
    saveGraphics(config)
  }

  const updateLodScaleFromGui = () => {
    bundle.chunkManager.setLodScale(config.quality.lodScale)
    syncQualityLabel()
    saveGraphics(config)
  }

  // Live re-sync on already-loaded chunks (`ChunkManager.setGrassFillerCoverage`)
  // — filler instances already exist for every grass chunk, so this only
  // changes their draw fraction, no world rebuild (plan world-terrain-005).
  const updateGrassFillerCoverageFromGui = () => {
    bundle.chunkManager.setGrassFillerCoverage(config.quality.grassFillerCoverage)
    syncQualityLabel()
    saveGraphics(config)
  }

  const applyNamedQualityPreset = (preset: Exclude<QualityPreset, 'Custom'>) => {
    applyQualityPreset(config, preset)
    applyLiveGraphics()
    saveGraphics(config)
  }

  const onQualityPresetChange = (preset: QualityPreset) => {
    if (preset === 'Custom') {
      config.quality.preset = 'Custom'
      saveGraphics(config)
      return
    }
    applyNamedQualityPreset(preset)
  }

  const onDayNightChange = () => {
    if (dayNight.enabled) deps.resyncDayNight()
  }

  return {
    applyLiveGraphics,
    updateSkyFromGui,
    updatePostProcessingFromGui,
    updateRenderQualityFromGui,
    updateTerrainShadowFromGui,
    updateShadowMapFromGui,
    updateLodScaleFromGui,
    updateGrassFillerCoverageFromGui,
    applyNamedQualityPreset,
    onQualityPresetChange,
    onDayNightChange,
  }
}

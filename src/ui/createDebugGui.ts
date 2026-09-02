import GUI, { type Controller } from 'lil-gui'
import type { QualityPreset } from '../config/qualityProfiles'
import type { WorldConfig } from '../config/worldConfig'
import type { DayNightState } from '../world/dayNight'
import type { ClimateState } from '../world/weather'
import {
  FOOTSTEP_PACK_IDS,
  type FootstepPackId,
  getFootstepPack,
  getLastFootstepSurface,
  setFootstepPack,
} from '../audio/playerMoveSounds'
import { QUALITY_PRESET_IDS } from '../config/qualityProfiles'
import { triangleCount } from '../config/worldConfig'
import { getMonitor } from '../perf/active'
import { BENCHMARK_SCENARIO_IDS, type BenchmarkScenarioId } from '../perf/benchmarkScenarios'
import { SEASON_LABELS, WEATHER_LABELS } from '../world/weather'
import type { WebGLRenderer } from 'three'

export type DebugGuiHandlers = {
  onTerrainChange: () => void
  onSkyChange: () => void
  onDayNightChange?: () => void
  onPostProcessingChange: () => void
  /** Fires only for the render-scale control — reallocates the renderer's
   *  drawing buffer + composer render targets, unlike the cheap uniform
   *  updates `onPostProcessingChange` handles (perf review A3.2). */
  onRenderQualityChange: () => void
  /** Fires only for the terrain-self-shadow toggle — flips `castShadow` on
   *  already-loaded chunk meshes via `ChunkManager`, unlike the composer-only
   *  updates `onPostProcessingChange` handles (perf review A2/#13). */
  onTerrainShadowChange: () => void
  /** Log the home settlement's VillagePlan summary to the console (plan 047). */
  onDumpVillagePlan?: () => void
  onQualityPresetChange: (preset: QualityPreset) => void
  onShadowMapSizeChange: () => void
  onLodScaleChange: () => void
  onPerfTimingsToggle: (enabled: boolean) => void
  onRunBenchmark: (id: BenchmarkScenarioId) => void
}

export type DebugGuiHandle = {
  dispose: () => void
  /** Returns whether the panel is visible after the toggle. */
  toggle: () => boolean
  setBusy: (busy: boolean) => void
  /** Pushes this frame's simulate/render split (ms) into the Performance
   *  folder — `renderer.info` is read live via `.listen()` getters below, but
   *  frame timing has to be measured by the caller (`gameLoop.tick`) around
   *  the actual simulate/render boundary. See perf review M1. */
  setFrameTiming: (simulateMs: number, renderMs: number) => void
}

/** On-screen panel; mutates `config` / `dayNight` in place, then calls handlers. */
export function createDebugGui(
  config: WorldConfig,
  dayNight: DayNightState,
  climate: ClimateState,
  renderer: WebGLRenderer,
  handlers: DebugGuiHandlers,
): DebugGuiHandle {
  const gui = new GUI({ title: 'Seedvale' })
  gui.close()
  // Hidden by default on every device (review 007 C11). `createApp` shows it
  // when `config.showGui` is true (`?debug=1` / `?gui=1`); Settings → "Panel
  // debug" toggles it either way.
  gui.hide()

  const info = {
    get triangles() {
      return triangleCount(config.terrain.resolution).toLocaleString()
    },
  }

  /** Every controller that triggers a terrain regen — disabled while one is in flight. */
  const terrainControllers: Controller[] = []
  const status = {
    busy: false,
    get state() {
      return status.busy ? 'Regenerating…' : 'Idle'
    },
  }

  const world = gui.addFolder('World')
  world.add(status, 'state').name('Terrain status').listen().disable()
  terrainControllers.push(
    world
      .add(config, 'seed', 0, 9999, 1)
      .name('Seed')
      .onFinishChange(handlers.onTerrainChange),
  )

  const clock = gui.addFolder('Day / night')
  clock
    .add(dayNight, 'enabled')
    .name('Enabled')
    .onChange(() => handlers.onDayNightChange?.())
  clock
    .add(dayNight, 'timeMultiplier', 0, 20, 0.1)
    .name('Time multiplier')
    .onChange(() => handlers.onDayNightChange?.())
  clock
    .add(dayNight, 'dayLengthSec', 60, 1200, 10)
    .name('Day length (s)')
    .onChange(() => handlers.onDayNightChange?.())
  clock
    .add(dayNight, 'timeOfDay', 0, 1, 0.001)
    .name('Time of day')
    .listen()
    .onChange(() => handlers.onDayNightChange?.())

  // Plan 040 — season/weather are pure functions of (seed, elapsedDays)
  // (`tickClimate` replaces `climate.weather` wholesale on each cycle
  // change, so these are getter-wrapper readouts rather than binding
  // directly to `climate.weather`'s fields — a direct binding would go
  // stale the first time `.weather` is replaced with a new object).
  // `forced` can be overridden for testing rain/snow/fog without waiting.
  const seasonWeather = gui.addFolder('Pora roku / Pogoda')
  const seasonInfo = {
    get season() {
      return SEASON_LABELS[climate.season]
    },
  }
  seasonWeather.add(seasonInfo, 'season').name('Sezon').listen().disable()
  const weatherInfo = {
    get label() {
      return WEATHER_LABELS[climate.weather.type]
    },
    get intensity() {
      return climate.weather.intensity
    },
    get temperature() {
      return climate.weather.temperature
    },
  }
  seasonWeather.add(weatherInfo, 'label').name('Pogoda (aktualna)').listen().disable()
  seasonWeather.add(weatherInfo, 'intensity', 0, 1, 0.01).name('Intensywność').listen().disable()
  seasonWeather.add(weatherInfo, 'temperature', -20, 40, 0.1).name('Temperatura (°C)').listen().disable()
  seasonWeather
    .add(climate, 'forced', ['auto', 'clear', 'cloudy', 'rain', 'fog', 'snow'])
    .name('Wymuś pogodę')

  const terrain = gui.addFolder('Terrain mesh')
  terrainControllers.push(
    terrain
      .add(config.terrain, 'resolution', {
        'Low (33)': 33,
        'Medium (49)': 49,
        'High (65)': 65,
        'Higher (97)': 97,
        'Ultra (129)': 129,
        'Insane (193)': 193,
      })
      .name('Resolution')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'flatShading')
      .name('Flat shading (low-poly)')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrain.add(info, 'triangles').name('Triangles / chunk').listen().disable()
  terrainControllers.push(
    terrain
      .add(config.terrain, 'chunkSize', 32, 128, 8)
      .name('Chunk size')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'loadRadius', 1, 6, 1)
      .name('Load radius')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'unloadRadius', 2, 8, 1)
      .name('Unload radius')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'heightScale', 4, 40, 0.5)
      .name('Height scale')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'waterLevel', 0, 4, 0.05)
      .name('Water level')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'noiseScale', 24, 200, 1)
      .name('Noise scale')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    terrain
      .add(config.terrain, 'detailAmplitude', 0, 1.5, 0.01)
      .name('Detail amplitude')
      .onFinishChange(handlers.onTerrainChange),
  )

  const hills = terrain.addFolder('Hills / valleys')
  terrainControllers.push(
    hills
      .add(config.terrain, 'hillsScale', 80, 1200, 10)
      .name('Hills scale')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    hills
      .add(config.terrain, 'hillsAmplitude', 0, 1, 0.01)
      .name('Hills amplitude')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    hills
      .add(config.terrain.hillsFbm, 'octaves', 1, 6, 1)
      .name('Hills octaves')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    hills
      .add(config.terrain.hillsFbm, 'persistence', 0.2, 0.9, 0.01)
      .name('Hills persistence')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    hills
      .add(config.terrain.hillsFbm, 'lacunarity', 1.2, 3, 0.05)
      .name('Hills lacunarity')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    hills
      .add(config.terrain.hillsFbm, 'exponentiation', 0.5, 3, 0.05)
      .name('Hills exponentiation')
      .onFinishChange(handlers.onTerrainChange),
  )

  const fbm = terrain.addFolder('FBM')
  terrainControllers.push(
    fbm.add(config.terrain.fbm, 'octaves', 1, 8, 1).onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    fbm
      .add(config.terrain.fbm, 'persistence', 0.2, 0.9, 0.01)
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    fbm
      .add(config.terrain.fbm, 'lacunarity', 1.2, 3, 0.05)
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    fbm
      .add(config.terrain.fbm, 'exponentiation', 0.5, 5, 0.05)
      .name('Exponentiation')
      .onFinishChange(handlers.onTerrainChange),
  )

  const region = terrain.addFolder('Regions')
  terrainControllers.push(
    region
      .add(config.terrain.region, 'oceanThreshold', 0, 1, 0.01)
      .name('Ocean threshold')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'coastThreshold', 0, 1, 0.01)
      .name('Coast threshold')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'oceanDetailWeight', 0, 1, 0.01)
      .name('Ocean detail weight')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'continentScale', 400, 6000, 50)
      .name('Continent scale')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'mountainScale', 400, 6000, 50)
      .name('Mountain scale')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'mountainThreshold', 0, 1, 0.01)
      .name('Mountain threshold')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'mountainThresholdWidth', 0.01, 0.5, 0.01)
      .name('Mountain blend width')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'worleyCellSize', 40, 800, 10)
      .name('Ridge cell size')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'ridgeSharpness', 0.5, 6, 0.1)
      .name('Ridge sharpness')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'mountainGain', 0, 2, 0.05)
      .name('Mountain gain')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'moistureRegionScale', 400, 6000, 50)
      .name('Moisture region scale')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'desertThreshold', 0, 1, 0.01)
      .name('Desert threshold')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'desertThresholdWidth', 0.01, 0.5, 0.01)
      .name('Desert blend width')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'swampThreshold', 0, 1, 0.01)
      .name('Swamp threshold')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    region
      .add(config.terrain.region, 'swampThresholdWidth', 0.01, 0.5, 0.01)
      .name('Swamp blend width')
      .onFinishChange(handlers.onTerrainChange),
  )

  const roads = terrain.addFolder('Roads')
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'roadHalfWidth', 1, 12, 0.5)
      .name('Road half-width')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'roadHeightStrength', 0, 1, 0.01)
      .name('Road height strength')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'roadTintStrength', 0, 1, 0.01)
      .name('Road tint strength')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'pathHalfWidth', 0.5, 6, 0.25)
      .name('Path half-width')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'pathHeightStrength', 0, 1, 0.01)
      .name('Path height strength')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'pathTintStrength', 0, 1, 0.01)
      .name('Path tint strength')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'smoothingWindow', 2, 40, 1)
      .name('Smoothing window')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'maxNeighborRoads', 0, 4, 1)
      .name('Max neighbor roads')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'dockSearchRadius', 20, 300, 10)
      .name('Dock search radius')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'edgeWobbleAmplitude', 0, 0.4, 0.01)
      .name('Edge wobble amp')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'edgeWobbleScale', 0.01, 0.2, 0.005)
      .name('Edge wobble scale')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'potholeDepth', 0, 0.4, 0.01)
      .name('Pothole depth')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'potholeThreshold', 0.4, 0.95, 0.01)
      .name('Pothole threshold')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'meanderAmplitude', 0, 6, 0.25)
      .name('Meander amplitude')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    roads
      .add(config.terrain.region.roadNetwork, 'meanderScale', 0.01, 0.15, 0.005)
      .name('Meander scale')
      .onFinishChange(handlers.onTerrainChange),
  )

  const village = terrain.addFolder('Village')
  if (handlers.onDumpVillagePlan) {
    village
      .add({ dump: () => handlers.onDumpVillagePlan?.() }, 'dump')
      .name('Log home VillagePlan')
  }
  terrainControllers.push(
    village
      .add(config.settlements, 'homeSize', ['auto', 'SM', 'MD', 'LG', 'XL'])
      .name('Home village size')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    village
      .add(config.terrain.region.village, 'coreRadius', 4, 20, 0.5)
      .name('Core clearing radius')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    village
      .add(config.terrain.region.village, 'houseRadius', 2, 10, 0.5)
      .name('House clearing radius')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    village
      .add(config.terrain.region.village, 'heightStrength', 0, 1, 0.01)
      .name('Clearing height strength')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    village
      .add(config.terrain.region.village, 'tintStrength', 0, 1, 0.01)
      .name('Clearing tint strength')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    village
      .add(config.terrain.region.village, 'regionalHeightStrengthFlat', 0, 1, 0.01)
      .name('Regional smoothing (flat)')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    village
      .add(config.terrain.region.village, 'regionalHeightStrengthMountain', 0, 1, 0.01)
      .name('Regional smoothing (mountain)')
      .onFinishChange(handlers.onTerrainChange),
  )

  const grass = gui.addFolder('Grass')
  terrainControllers.push(
    grass
      .add(config.terrain.grass, 'enabled')
      .name('Enabled')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    grass
      .add(config.terrain.grass, 'radius', 1, 4, 1)
      .name('Render radius (chunks)')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    grass
      .add(config.terrain.grass, 'density', 40000, 250000, 1000)
      .name('Density (candidates/chunk)')
      .onFinishChange(handlers.onTerrainChange),
  )

  // Surface grain (detail normal map). Exposed as sliders on purpose: this
  // effect was previously tuned by editing constants and reloading, which made
  // every round unattributable — see issue 014.
  const detail = gui.addFolder('Surface grain (detail normal)')
  terrainControllers.push(
    detail
      .add(config.terrain.detailNormal, 'enabled')
      .name('Enabled')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    detail
      .add(config.terrain.detailNormal, 'strength', 0, 4, 0.05)
      .name('Strength (normalScale)')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    detail
      .add(config.terrain.detailNormal, 'tilesGrass', 1, 24, 1)
      .name('Tiles/chunk — grass')
      .onFinishChange(handlers.onTerrainChange),
  )
  terrainControllers.push(
    detail
      .add(config.terrain.detailNormal, 'tilesBare', 1, 24, 1)
      .name('Tiles/chunk — road/sand')
      .onFinishChange(handlers.onTerrainChange),
  )

  const sky = gui.addFolder('Sky (manual)')
  sky
    .add(config.sky, 'inclination', 0, 1, 0.01)
    .onChange(handlers.onSkyChange)
  sky
    .add(config.sky, 'azimuth', 0, 1, 0.01)
    .onChange(handlers.onSkyChange)
  sky
    .add(config.sky, 'turbidity', 0.1, 20, 0.1)
    .onChange(handlers.onSkyChange)
  sky
    .add(config.sky, 'rayleigh', 0.1, 4, 0.05)
    .onChange(handlers.onSkyChange)

  const postFx = gui.addFolder('Post-processing')
  postFx
    .add(config.quality, 'preset', [...QUALITY_PRESET_IDS])
    .name('Quality preset')
    .onChange((preset: QualityPreset) => handlers.onQualityPresetChange(preset))
  postFx
    .add(config.postProcessing, 'aoEnabled')
    .name('Ambient occlusion')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'aoQuality', ['Performance', 'Low', 'Medium', 'High', 'Ultra'])
    .name('AO quality')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'aoRadius', 0.2, 10, 0.1)
    .name('AO radius')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'aoIntensity', 0.5, 8, 0.1)
    .name('AO intensity')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'aoTransparencyAware')
    .name('AO transparency-aware')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'bloomEnabled')
    .name('Bloom')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'bloomStrength', 0, 1.5, 0.01)
    .name('Bloom strength')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'bloomRadius', 0, 1, 0.01)
    .name('Bloom radius')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'bloomThreshold', 0, 1, 0.01)
    .name('Bloom threshold')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'godRaysEnabled')
    .name('God rays')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'godRaysExposure', 0, 1, 0.01)
    .name('God rays exposure')
    .onChange(handlers.onPostProcessingChange)
  // Reallocates GPU render targets, so this gets its own handler and
  // `onFinishChange` (not the live `onChange` the sliders above use) — see
  // perf review A3.2.
  postFx
    .add(config.postProcessing, 'pixelRatioCap', {
      '1x': 1,
      '1.25x': 1.25,
      '1.5x': 1.5,
      '1.75x': 1.75,
      '2x (default)': 2,
    })
    .name('Render scale cap')
    .onFinishChange(handlers.onRenderQualityChange)
  // Live toggle on already-loaded chunks (`ChunkManager.setTerrainCastsShadow`)
  // — no rebuild, so its own handler rather than `onTerrainChange`. Default
  // on; perf review #13 found this a real, if small, visual tradeoff on
  // steep slopes at low sun angle, so it's opt-in rather than forced off.
  postFx
    .add(config.postProcessing, 'terrainCastsShadow')
    .name('Terrain self-shadow')
    .onChange(handlers.onTerrainShadowChange)
  postFx
    .add(config.postProcessing, 'waterReflections')
    .name('Water reflections')
    .onChange(handlers.onPostProcessingChange)
  postFx
    .add(config.postProcessing, 'shadowMapSize', { '512': 512, '1024': 1024, '2048': 2048 })
    .name('Shadow map size')
    .onFinishChange(handlers.onShadowMapSizeChange)
  postFx
    .add(config.quality, 'lodScale', 0.25, 1, 0.05)
    .name('Vegetation LOD scale')
    .onFinishChange(handlers.onLodScaleChange)

  terrainControllers.push(
    gui.add({ rebuild: handlers.onTerrainChange }, 'rebuild').name('Rebuild world'),
  )

  // `renderer.info` is free (three.js already tracks these counters) but
  // nothing in the app read it before — read live via `.listen()`, same
  // pattern as `info.triangles` above. Frame timing isn't on `renderer.info`
  // (three.js doesn't measure CPU time), so it's pushed in by the caller —
  // see `setFrameTiming`. Perf review M1: "can't measure what this review
  // describes" was the actual finding; this is the fix.
  const perf = {
    simulateMs: 0,
    renderMs: 0,
    enableTimings: false,
    benchmark: 'current' as BenchmarkScenarioId,
    run: () => handlers.onRunBenchmark(perf.benchmark),
    get fps() {
      const stats = getMonitor().getLiveStats()
      return stats.frameMs > 0 ? Math.round((1000 / stats.frameMs) * 10) / 10 : 0
    },
    get p95() {
      return Math.round(getMonitor().getLiveStats().p95 * 100) / 100
    },
    get loadedChunks() {
      return getMonitor().getLiveStats().loadedChunks
    },
    get drawCalls() {
      return getMonitor().getLiveStats().drawCalls
    },
    get triangles() {
      return getMonitor().getLiveStats().triangles.toLocaleString()
    },
    get geometries() {
      return getMonitor().getLiveStats().geometries || renderer.info.memory.geometries
    },
    get textures() {
      return getMonitor().getLiveStats().textures || renderer.info.memory.textures
    },
  }
  const audio = {
    pack: getFootstepPack(),
    get surface() {
      return getLastFootstepSurface() ?? '—'
    },
  }
  const audioFolder = gui.addFolder('Audio')
  audioFolder
    .add(audio, 'pack', [...FOOTSTEP_PACK_IDS])
    .name('Footstep pack')
    .onChange((pack: FootstepPackId) => setFootstepPack(pack))
  audioFolder.add(audio, 'surface').name('Footstep surface').listen().disable()

  const perfFolder = gui.addFolder('Performance')
  perfFolder
    .add(perf, 'enableTimings')
    .name('Enable timings')
    .onChange((on: boolean) => handlers.onPerfTimingsToggle(on))
  perfFolder.add(perf, 'fps').name('FPS').listen().disable()
  perfFolder.add(perf, 'p95').name('Frame p95 (ms)').listen().disable()
  perfFolder.add(perf, 'loadedChunks').name('Chunks loaded').listen().disable()
  perfFolder.add(perf, 'drawCalls').name('Draw calls').listen().disable()
  perfFolder.add(perf, 'triangles').name('Triangles (rendered)').listen().disable()
  perfFolder.add(perf, 'geometries').name('Geometries (GPU)').listen().disable()
  perfFolder.add(perf, 'textures').name('Textures (GPU)').listen().disable()
  perfFolder.add(perf, 'simulateMs').name('Simulate (ms)').listen().disable()
  perfFolder.add(perf, 'renderMs').name('Render (ms)').listen().disable()
  perfFolder.add(perf, 'benchmark', [...BENCHMARK_SCENARIO_IDS]).name('Benchmark')
  perfFolder.add(perf, 'run').name('Run benchmark')

  function setFrameTiming(simulateMs: number, renderMs: number): void {
    perf.simulateMs = Math.round(simulateMs * 100) / 100
    perf.renderMs = Math.round(renderMs * 100) / 100
  }

  function setBusy(busy: boolean): void {
    status.busy = busy
    for (const c of terrainControllers) c.disable(busy)
  }

  return {
    dispose: () => gui.destroy(),
    toggle: () => {
      gui.show(gui._hidden)
      return !gui._hidden
    },
    setBusy,
    setFrameTiming,
  }
}

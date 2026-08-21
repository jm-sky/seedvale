import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { WorldConfig } from '../config/worldConfig'
import type { ProgramCensus } from '../perf/programCensus'
import type { PostProcessing } from '../render/createPostProcessing'
import type { WorldLights } from '../world/createLights'
import type { WorldSky } from '../world/createSky'
import type { PointLightBudget } from '../world/pointLightBudget'
import { isNoShadowsDebugMode } from '../debug/debugMode'
import { benchmarkScenarioFromUrl, createProgramCensus, isProgramCensusUrlEnabled, pointLightBudgetFromUrl } from '../perf'
import { createPostProcessing } from '../render/createPostProcessing'
import { createRenderer } from '../render/createRenderer'
import { createCamera } from '../scene/createCamera'
import { createScene } from '../scene/createScene'
import { createLights } from '../world/createLights'
import { createSky } from '../world/createSky'
import { createPointLightBudget } from '../world/pointLightBudget'
import { AGENT_RENDER_LAYER, REFLECTION_DISTANT_LAYER, REFLECTION_SKIPPED_LAYER, WATER_RENDER_LAYER } from '../world/waterMirror'
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'

/** The presentation objects that exist for the whole lifetime of one
 *  `createApp()` call and survive `rebuildWorldBundle()`: renderer + CSS2D
 *  label layer, scene, camera, post-processing chain, lights, sky dome and the
 *  scene-level `PointLightBudget` pad.
 *
 *  Grouped here only as *construction*: disposal stays in `createApp.ts`'s
 *  teardown, where the ordering against world/audio/UI teardown matters. */
export type RenderStack = {
  renderer: WebGLRenderer
  labelRenderer: CSS2DRenderer
  scene: Scene
  camera: PerspectiveCamera
  postProcessing: PostProcessing
  lights: WorldLights
  sky: WorldSky
  /** Plan 157 — production NUM_POINT_LIGHTS stabilization. Lives on `scene`
   *  (not in `WorldBundle`) because its pad survives a world rebuild; only the
   *  settlement/placed-fire *registrations* are rebuilt. */
  pointLightBudget: PointLightBudget
  /** Plan 149 Phase 0 — dev/benchmark-only WebGLProgram/material census. */
  programCensus: ProgramCensus
}

export function createRenderStack(container: HTMLElement, config: WorldConfig): RenderStack {
  const renderer = createRenderer(container, config.postProcessing.pixelRatioCap)
  if (isNoShadowsDebugMode()) {
    renderer.shadowMap.enabled = false
  }

  const labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(container.clientWidth, container.clientHeight)
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.inset = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  // Below every UI overlay (lowest is .seedvale-hud at z-index:5, index.html) so
  // NPC labels never draw over modals (pause menu, quest log, villagers, dialog).
  labelRenderer.domElement.style.zIndex = '1'
  container.appendChild(labelRenderer.domElement)

  const scene = createScene()
  // `?benchmark=stream` enables the census automatically; `?programCensus=1`
  // enables it standalone. No-op renderer/scene change either way
  // (`src/perf/programCensus.ts`).
  const programCensus = createProgramCensus(
    renderer,
    scene,
    benchmarkScenarioFromUrl() === 'stream' || isProgramCensusUrlEnabled(),
  )

  const camera = createCamera(container.clientWidth / container.clientHeight)
  camera.layers.enable(WATER_RENDER_LAYER)
  camera.layers.enable(AGENT_RENDER_LAYER)
  camera.layers.enable(REFLECTION_SKIPPED_LAYER)
  camera.layers.enable(REFLECTION_DISTANT_LAYER)

  const postProcessing = createPostProcessing(
    renderer,
    scene,
    camera,
    container.clientWidth,
    container.clientHeight,
    config.postProcessing,
  )

  const lights = createLights(config.postProcessing.shadowMapSize)
  lights.addTo(scene)

  // `?pointLightBudget=off` disables the pad without tearing down registration.
  const pointLightBudget = createPointLightBudget(scene, pointLightBudgetFromUrl())

  const sky = createSky(config.sky)
  sky.addTo(scene)
  sky.applySun(lights.sun)

  return { renderer, labelRenderer, scene, camera, postProcessing, lights, sky, pointLightBudget, programCensus }
}

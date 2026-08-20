import { Fog, Raycaster, Timer, Vector3 } from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NpcAgent } from '../ai/NpcAgent'
import type { createAmbientAudio } from '../audio/createAmbientAudio'
import type { createWorldAudio } from '../audio/createWorldAudio'
import type { createHouseDoorTracker } from '../audio/doorSounds'
import type { createFireAudio } from '../audio/fireSounds'
import type { WeatherAudio } from '../audio/weatherSounds'
import type { NpcInspectTrigger } from '../debug/npcInspectTrigger'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { PreySpawner } from '../fauna/AnimalSpawner'
import type { TouchControls } from '../input/createTouchControls'
import type { createKeyboard } from '../input/Keyboard'
import type { Interactable } from '../interaction/Interactable'
import type { HeldTool } from '../items/HeldTool'
import type { Inventory } from '../items/Inventory'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { QuestManager } from '../quests/QuestManager'
import type { PostProcessing } from '../render/createPostProcessing'
import type { LandOwnershipRegistry } from '../settlement/landOwnership'
import type { VillageFire } from '../settlement/VillageFire'
import type { VueUi } from '../ui-vue/mount'
import type { BusyOverlay } from '../ui/createBusyOverlay'
import type { Hud } from '../ui/createHud'
import type { InventoryScreen } from '../ui/createInventoryScreen'
import type { Minimap, MinimapSettlement } from '../ui/createMinimap'
import type { NpcDialog } from '../ui/createNpcDialog'
import type { NpcInspector } from '../ui/createNpcInspector'
import type { PauseMenu } from '../ui/createPauseMenu'
import type { QuestLog } from '../ui/createQuestLog'
import type { QuickActions } from '../ui/createQuickActions'
import type { TimeSkipOverlay } from '../ui/createTimeSkipOverlay'
import type { Toast } from '../ui/createToast'
import type { WorldLights } from '../world/createLights'
import type { WorldSky } from '../world/createSky'
import type { DayNightState } from '../world/dayNight'
import type { MapDiscovery } from '../world/map/mapDiscovery'
import type { TimeSkip } from '../world/timeSkip'
import type { WaterSource } from '../world/WaterSource'
import type { ClimateState, WeatherState } from '../world/weather'
import type { WeatherParticles } from '../world/weatherParticles'
import type { BusyAction } from './busyAction'
import type { RestCampSequence } from './restCampSequence'
import type { WorldBundle } from './worldBundle'
import { NPC_SHADOW_DISTANCE } from '../ai/NpcAgent'
import { playActionMeleeHit, playActionMeleeKill, playActionWell } from '../audio/actionSounds'
import { playAnimalSound } from '../audio/animalSounds'
import { playInventoryDrop, playInventoryPickUp } from '../audio/inventorySounds'
import { isCameraMeshDebugMode, isDebugMode } from '../debug/debugMode'
import { setCameraMeshHit } from '../debug/renderStateDebug'
import { ANIMAL_LABELS, FAUNA_SHADOW_DISTANCE } from '../fauna/AnimalAgent'
import { WOLF_DEN_ID } from '../fauna/AnimalSpawner'
import { isMeleeTool } from '../fauna/faunaCombat'
import { countNearbyHumans } from '../fauna/predatorHumanDecision'
import { type createMouseLook, exitGamePointerLock } from '../input/MouseLook'
import { pickInGaze } from '../interaction/findInteractionTarget'
import { resolveInteraction } from '../interaction/resolveInteraction'
import { treeInspectionCanYieldBranch } from '../interaction/treeInspection'
import { ITEM_CATALOG } from '../items/itemCatalog'
import { canCancelRestProgress, ITEM_DEFS, type ItemKind } from '../items/items'
import { getMonitor, getProgramCensus, withCategory, withProgramCensusStage } from '../perf'
import {
  collectLivingCombatTargets,
  createPlayerCombat,
  filterWorldCycleTargets,
  findLivingTargetById,
  livingTargetIdForAnimal,
  resolveLivingInteractable,
} from '../player/playerCombat'
import {
  applyDownedRecovery,
  applyPlayerDamage,
  tickPlayerStarvationDamage,
} from '../player/playerDamage'
import {
  createPlayerMelee,
  type MeleeHitCandidate,
  meleeSwingAngle,
  resolveMeleeHits,
  yawToward,
} from '../player/playerMelee'
import {
  tickHealthRegen,
  tickPlayerNeeds,
} from '../player/PlayerNeeds'
import {
  anyWithinRadius,
  createShadowBudgetState,
  recordShadowBudgetFrame,
  shouldUpdateShadowMap,
} from '../render/shadowBudget'
import { villageSizeConfig } from '../settlement/families'
import { purchaseLandPlot } from '../settlement/landPurchase'
import { getHungerRatio } from '../shared/HungerState'
import { getStaminaRatio } from '../shared/StaminaState'
import { getThirstRatio } from '../shared/ThirstState'
import { getVigorRatio } from '../shared/VigorState'
import { skyParamsFromTime, tickDayNight } from '../world/dayNight'
import { updateFoliageWind } from '../world/foliageWind'
import { createWaterSource } from '../world/WaterSource'
import { computeSurfaceWeather, tickClimate } from '../world/weather'
import { applyWeatherOverlay } from '../world/weatherVisuals'
import {
  buildCombatTarget,
  buildDigTarget,
  buildInteractables,
  collectItem,
  type CombatAimMode,
  GAZE_RANGE,
  INTERACT_MIN_DOT,
  INTERACT_RANGE,
  KNIFE_BRANCH_BONUS,
  TREE_BRANCH_CHANCE,
} from './interactables'
import { activeModal } from './modalState'
import type { Object3D, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

type Highlightable = NpcAgent | AnimalAgent

function interactableAgent(target: Interactable | null): Highlightable | null {
  if (!target) return null
  if (target.kind === 'npc') return target.npc
  if (target.kind === 'animal' || target.kind === 'corpse') return target.animal
  return null
}

/** Smallest `timeOfDay` change (fraction of a day) worth reapplying sky/light/fog/water
 *  uniforms for — below this the visual change is sub-pixel at any `dayLengthSec`
 *  worth playing at, so re-running `applyDayNight` every frame is wasted work. */
const DAY_NIGHT_APPLY_THRESHOLD = 1 / 2000

/** Wraparound-aware distance between two `timeOfDay` values (both in [0,1)). */
function timeOfDayDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 1
  return Math.min(diff, 1 - diff)
}

function applyDayNight(
  timeOfDay: number,
  weather: WeatherState,
  sky: WorldSky,
  lights: WorldLights,
  scene: Scene,
  chunkManager: WorldBundle['chunkManager'],
  ocean: WorldBundle['ocean'],
): ReturnType<typeof skyParamsFromTime> {
  const p = skyParamsFromTime(timeOfDay)
  sky.setParams(
    {
      inclination: p.inclination,
      azimuth: p.azimuth,
      turbidity: p.turbidity,
      rayleigh: p.rayleigh,
    },
    lights.sun,
  )
  // Weather overlays fog/light on top of the day/night result — `dayFactor`/
  // `elev` (returned below) and the sky dome itself stay weather-independent
  // in Etap 1 (see `weatherVisuals.ts`'s header comment).
  const overlay = applyWeatherOverlay({ fogColor: p.fogColor, fogNear: p.fogNear, fogFar: p.fogFar }, weather)
  lights.sun.intensity = p.sunIntensity * overlay.lightScale
  lights.ambient.intensity = p.ambientIntensity * overlay.lightScale
  lights.hemi.intensity = p.hemiIntensity * overlay.lightScale
  const fog = scene.fog
  if (fog instanceof Fog) {
    fog.color.setHex(overlay.fogColor)
    fog.near = overlay.fogNear
    fog.far = overlay.fogFar
  }
  chunkManager.setWaterDayNight(p.dayFactor, sky.sunPosition)
  chunkManager.setGrassDayNight(p.dayFactor, sky.sunPosition)
  ocean.setDayNight(p.dayFactor, sky.sunPosition)
  return p
}

export type GameLoopDeps = {
  bundle: WorldBundle
  player: PlayerController
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  labelRenderer: CSS2DRenderer
  scene: Scene
  sky: WorldSky
  lights: WorldLights
  postProcessing: PostProcessing
  dayNight: DayNightState
  climate: ClimateState
  weatherParticles: WeatherParticles
  weatherAudio: WeatherAudio
  /** Current world seed — weather is a pure function of `(seed, elapsedDays)`
   *  (plan 040 §7), and `config.seed` can change on `rebuildWorld()`, so this
   *  is a live accessor rather than a captured value. */
  getSeed: () => number
  keyboard: ReturnType<typeof createKeyboard>
  mouseLook: ReturnType<typeof createMouseLook>
  touchControls: TouchControls | null
  pauseMenu: PauseMenu
  npcDialog: NpcDialog
  /** Debug-only NPC Simulation Inspector modal + its Ctrl+click trigger
   *  (plan 170 §5) — `undefined` outside `?debug`, so the feature has zero
   *  runtime presence in production. */
  npcInspector?: NpcInspector
  npcInspectTrigger?: NpcInspectTrigger
  questLog: QuestLog
  vueUi: VueUi
  inventoryScreen: InventoryScreen
  quickActions: QuickActions
  timeSkip: TimeSkip
  timeSkipOverlay: TimeSkipOverlay
  busy: BusyAction
  busyOverlay: BusyOverlay
  restCamp: RestCampSequence
  inventory: Inventory
  heldTool: HeldTool
  /** Persistent land-plot ownership (plan 129) — read by `buildInteractables`
   *  and mutated by the `[E]` purchase handler below. */
  landOwnership: LandOwnershipRegistry
  toast: Toast
  hud: Hud
  questManager: QuestManager
  ambientAudio: ReturnType<typeof createAmbientAudio>
  fireAudio: ReturnType<typeof createFireAudio>
  houseDoors: ReturnType<typeof createHouseDoorTracker>
  worldAudio: ReturnType<typeof createWorldAudio>
  playerTorch: PlayerTorch
  minimap: Minimap
  mapDiscovery: MapDiscovery
  openQuestLog: () => void
  openInventory: () => void
  openSkills: () => void
  openCharacter: () => void
  startGroundWork: (mode: 'dig' | 'level', x: number, z: number) => void
  /** Start the axe chop channel for a gaze-selected tree (plan 057). */
  startTreeChop: (treeId: string, x: number, z: number) => void
  /** Start the pickaxe mine channel for a gaze-selected ore deposit (plan 090). */
  startDepositMine: (depositId: string, x: number, z: number) => void
  /** Shovel-bury a dead animal corpse (busy channel). */
  startBuryCorpse: (animal: AnimalAgent) => void
  /** Knife-harvest raw_meat from a dead animal corpse (busy channel, plan 106). */
  startHarvestMeat?: (animal: AnimalAgent) => void
  /** Busy-channel `[E] Zniszcz` on a `depleted` spawn point (plan 137). */
  startDestroySpawner: (spawner: PreySpawner) => void
  /** Cook the first held recipe's input at a lit campfire (busy channel, plan 106 §6). */
  startCookAt?: (fire: VillageFire) => void
  /** Light an unlit campfire (busy channel, blurred). Adding fuel to an
   *  already-lit fire stays instant/inline — not routed through this. */
  startIgniteFire?: (fire: VillageFire) => void
  /** Instant drink from a well/lake `WaterSource` — restores thirst (plan 106 §4). */
  drinkFromWaterSource?: (source: WaterSource) => void
  /** Instant fill of a carried empty waterskin at a well/lake (plan 106 §4). */
  fillWaterskin?: () => void
  /** Consumes an item already in inventory (eat/drink/use) — reused by the
   *  world `[R]` quick-action so pickup+use is one keypress (plan 153). */
  consumeItem?: (kind: ItemKind) => void
  startTentRest: (id: string) => void
  packTent: (id: string) => void
  /** Arm / disarm / pick up a placed animal trap (plan 141 §9). */
  armTrap: (id: string) => void
  disarmTrap: (id: string) => void
  collectTrap: (id: string) => void
  /** Cast at a lake shore with `fishing_rod` held (busy channel, plan 159 §9). */
  startFishing?: (x: number, z: number) => void
  /** Consumes one bait-capable food item from inventory and applies/refreshes
   *  the current fishing spot's bait (plan 159 §10). */
  applyFishingBait?: (x: number, z: number) => void
  /** Start/collect a drying rack's process (plan 159 §8) — single `[E]`
   *  action like `campfire`'s "add fuel"/ignite cycling. */
  interactDryingRack?: (id: string) => void
  /** Collect accrued honey from a wild hive (plan 159 §11). */
  collectHive?: (id: string) => void
  /** Burn a wild hive down for its one-time reward — only while a lit torch/
   *  branch is held. */
  burnHive?: (id: string) => void
  /** A full night's sleep (`fadeStrength === 1` skip) just finished — owner
   *  (`createApp.ts`) applies the rest outcome for whatever camp it resolved
   *  when the rest started, and awards any Survival XP (plan 128 §5-§7). */
  onSleepFinished: () => void
  onInventoryChanged: () => void
  /** Reports this frame's simulate/render split (ms) to the debug GUI's
   *  Performance folder (perf review M1). */
  setFrameTiming: (simulateMs: number, renderMs: number) => void
  /** Plan 157 — recounts real registered `PointLight`s and pads/culls to the
   *  production budget (16, unless `?pointLightBudget` overrides) before any
   *  render pass. See `src/world/pointLightBudget.ts`. */
  syncPointLightBudget?: () => void
}

export type GameLoop = {
  /** Runs one frame's worth of simulation + render. The caller owns the
   *  `requestAnimationFrame` scheduling (and the frame id needed to cancel
   *  it) — this is deliberately just "do one frame," not a self-scheduling
   *  loop, so `createApp.ts`'s `dispose()` can stop it the same way it
   *  always has. */
  tick: () => void
  /** Re-applies sky/light/fog/water/settlement-fire-glow for the current
   *  `dayNight.timeOfDay` right away, instead of waiting for `tick()`'s own
   *  throttled check to notice a large-enough change. Callers (initial
   *  setup, `rebuildWorld`, the day/night GUI toggle) decide whether
   *  `dayNight.enabled` gates the call — this always applies unconditionally
   *  when invoked. */
  resyncDayNight: () => void
  /** Drops the currently gaze-highlighted NPC/animal reference without
   *  toggling its highlight class off — for use right before its underlying
   *  mesh is disposed (`rebuildWorld`), where touching the soon-to-be-gone
   *  object is pointless. */
  forgetHighlight: () => void
}

/** Owns the per-frame simulation/render pass — assembled once in
 *  `createApp.ts` after every dependency it closes over already exists.
 *  `deps.bundle` is the one mutable-container exception (see
 *  `worldBundle.ts`): every other dependency here is a stable reference for
 *  the lifetime of one `createApp()` call. */
export function createGameLoop(deps: GameLoopDeps): GameLoop {
  const {
    bundle, player, camera, renderer, labelRenderer, scene, sky, lights, postProcessing, dayNight,
    climate, weatherParticles, weatherAudio, getSeed,
    keyboard, mouseLook, touchControls, pauseMenu, npcDialog, npcInspector, npcInspectTrigger, questLog, vueUi, inventoryScreen,
    quickActions, timeSkip, timeSkipOverlay, busy, busyOverlay, restCamp, inventory, heldTool, landOwnership, toast, hud,
    questManager, ambientAudio, fireAudio, houseDoors, worldAudio, playerTorch, minimap, mapDiscovery, openQuestLog, openInventory, openSkills, openCharacter,
    startGroundWork, startTreeChop, startDepositMine, startBuryCorpse, startHarvestMeat, startCookAt, startIgniteFire,
    startDestroySpawner,
    drinkFromWaterSource, fillWaterskin, consumeItem, startTentRest, packTent, armTrap, disarmTrap, collectTrap,
    startFishing, applyFishingBait, interactDryingRack, collectHive, burnHive,
    onSleepFinished, onInventoryChanged, setFrameTiming, syncPointLightBudget,
  } = deps

  renderer.shadowMap.autoUpdate = false

  const timer = new Timer()
  let lastAppliedTimeOfDay = dayNight.timeOfDay
  /** Last weather values `resyncDayNight()` applied to fog/lights — a change
   *  here (not just the day/night threshold) also has to trigger a resync,
   *  or weather-driven fog would only "pop" in on the next unrelated
   *  threshold crossing instead of when the weather actually changes. */
  let lastAppliedWeatherType = climate.weather.type
  let lastAppliedWeatherIntensity = climate.weather.intensity
  /** Cached `skyParamsFromTime(dayNight.timeOfDay)` — recomputed at most once
   *  per frame (only while unpaused, since `timeOfDay` is frozen otherwise),
   *  instead of once per call site (`ambientAudio`, `dayFactor`, `godRays`). */
  let cachedSky = skyParamsFromTime(dayNight.timeOfDay)
  /** EMA of instantaneous FPS; HUD text refreshes at most ~4×/s. */
  let fpsEma = 60
  let fpsHudAge = 0
  /** Previous frame's `composer.render()` cost — drives N8AO auto-budget. */
  let lastRenderMs = 0
  /** Pull-based, fail-open shadow-map update budget (plan 145 R1) — see
   *  `render/shadowBudget.ts`. */
  const shadowBudgetState = createShadowBudgetState(player.mesh.position.x, player.mesh.position.z)

  /** `true` if any NPC (from a loaded settlement) or fauna agent is currently
   *  within its own per-agent shadow-casting distance of the player
   *  (`NPC_SHADOW_DISTANCE`/`FAUNA_SHADOW_DISTANCE`, `NpcAgent.ts`/
   *  `AnimalAgent.ts`) — reusing those exact radii keeps this consistent by
   *  construction with the per-agent `castShadow` toggling those already do.
   *  Fail-open: an agent in range is assumed to be moving (see
   *  `shadowBudget.ts` module doc), not tracked for actual displacement. */
  function hasNearbyShadowCaster(playerX: number, playerZ: number): boolean {
    for (const settlement of bundle.settlementsManager.getLoaded()) {
      if (anyWithinRadius(playerX, playerZ, settlement.npcs, NPC_SHADOW_DISTANCE, (n) => n.mesh.position)) {
        return true
      }
    }
    return anyWithinRadius(playerX, playerZ, bundle.fauna.getAgents(), FAUNA_SHADOW_DISTANCE, (a) => a.mesh.position)
  }

  // `?debugCameraMesh=1` — identify the mesh in front of the camera.
  const cameraMeshRaycaster = new Raycaster()
  const cameraMeshDirection = new Vector3()
  let lastCameraMeshUuid: string | null = null

  /** Universal melee attack lifecycle (plan 123) — owns wind-up/hit/recovery
   *  timing shared by every melee tool; `ITEM_CATALOG[kind].melee` supplies
   *  the per-weapon config. */
  const playerMelee = createPlayerMelee()
  const playerCombat = createPlayerCombat()

  /** Touch rigs aim with the same finger that moves and attacks, so combat
   *  acquisition/facing is loosened for them (plan 142). Derived from the
   *  touch chrome actually being mounted, not re-sniffed per frame. */
  const aimMode: CombatAimMode = touchControls ? 'touch' : 'pointer'
  /** Yaw the in-flight attack was committed to when it started (plan 142 §2),
   *  or `null` when the hit should resolve against live camera yaw — always
   *  the case on `pointer`, which keeps its original behaviour exactly. Set at
   *  `requestAttack` time and consumed one hit window later, so a touch swing
   *  lands on the target the player actually tapped rather than on wherever
   *  the camera happened to drift during wind-up. */
  let attackYaw: number | null = null

  /** Currently gaze-highlighted NPC/animal, if any — tracked so we only toggle
   *  the CSS class on change instead of writing every frame. */
  let highlightedTarget: Highlightable | null = null
  /** Dedupes `?debug=1` house console spam while gazing at the same building. */
  let lastDebugHouseId: string | null = null
  /** Interaction-cycling state (plan 153) — `Tab` steps through
   *  `cycleCandidates` (every interactable within `INTERACT_RANGE`, not just
   *  the gaze winner) so a crowded spot (NPCs stacked in front of the well)
   *  can still target something other than whichever candidate the facing
   *  cone happens to prefer. `cycleActive` clears itself once the candidate
   *  list shrinks back to trivial (moved away / crowd thinned) so gaze
   *  picking silently resumes — no separate targeting system, just an
   *  alternate source for the same `target` variable. */
  let cycleActive = false
  let cycleIndex = 0
  const setHighlight = (next: Highlightable | null): void => {
    if (highlightedTarget === next) return
    highlightedTarget?.setHighlighted(false)
    next?.setHighlighted(true)
    highlightedTarget = next
  }

  const resyncDayNight = (): void => {
    cachedSky = applyDayNight(dayNight.timeOfDay, climate.weather, sky, lights, scene, bundle.chunkManager, bundle.ocean)
    bundle.settlementsManager.setDayNight(1 - cachedSky.dayFactor)
    lastAppliedTimeOfDay = dayNight.timeOfDay
    lastAppliedWeatherType = climate.weather.type
    lastAppliedWeatherIntensity = climate.weather.intensity
  }

  const tick = (): void => {
    const frameStart = performance.now()
    const monitor = getMonitor()
    const programCensus = getProgramCensus()
    timer.update()
    const rawDt = timer.getDelta()
    const dt = Math.min(rawDt, 0.05)
    if (rawDt > 0) {
      fpsEma = fpsEma * 0.9 + (1 / rawDt) * 0.1
      fpsHudAge += rawDt
      if (fpsHudAge >= 0.25) {
        fpsHudAge = 0
        hud.setFps(fpsEma)
      }
    }

    // Runs regardless of any modal/pause state — the clock has to keep
    // advancing (boosted) for the skip to actually pass game-time. Only
    // player input is blocked below; world simulation stays on its normal
    // per-frame path (see world/timeSkip.ts for why dt itself isn't scaled).
    const skip = timeSkip.tick(dt)
    if (skip) {
      timeSkipOverlay.show(skip.label, skip.fadeStrength)
      if (skip.fadeStrength === 1) {
        const progress = timeSkip.progress()
        vueUi.updateTimeSkipRestUi(progress, canCancelRestProgress(progress))
      } else {
        vueUi.updateTimeSkipRestUi(null, false)
      }
      if (skip.justFinished) {
        timeSkipOverlay.hide()
        if (restCamp.isActive()) {
          restCamp.notifySleepFinished()
        } else {
          player.standUp()
        }
        bundle.settlementsManager.resolveTimeSkip(skip.startTimeOfDay, skip.hours, dayNight.dayLengthSec)
        // Player needs freeze (worldDt=0 below) while a skip is in flight,
        // same convention as fauna/settlements — catch up in one lump here.
        // `fadeStrength === 1` is rest/sleep (`world/timeSkip.ts`'s doc
        // comment): a full night restores vigor/stamina on top of the drain
        // the skipped hours would otherwise apply — how much depends on the
        // camp, which `onSleepFinished` owns.
        tickPlayerNeeds(player.needs, skip.hours * 3600)
        if (skip.fadeStrength === 1) onSleepFinished()
      }
      keyboard.state.forward = false
      keyboard.state.backward = false
      keyboard.state.left = false
      keyboard.state.right = false
      keyboard.state.sprint = false
    }

    const campTick = restCamp.tick(dt)
    if (campTick) {
      if (restCamp.isBusy()) busyOverlay.show(campTick.label)
      if (campTick.justFinishedBusy) busyOverlay.hide()
      keyboard.state.forward = false
      keyboard.state.backward = false
      keyboard.state.left = false
      keyboard.state.right = false
      keyboard.state.sprint = false
    } else if (restCamp.isBusy()) {
      // Keep clearing movement while setup/teardown timers run between ticks
      // that return a result every frame.
      keyboard.state.forward = false
      keyboard.state.backward = false
      keyboard.state.left = false
      keyboard.state.right = false
      keyboard.state.sprint = false
    }

    const busyTick = busy.tick(dt)
    if (busyTick) {
      busyOverlay.show(busyTick.label, busyTick.blurred, busyTick.progress)
      if (busyTick.justFinished) busyOverlay.hide()
      keyboard.state.forward = false
      keyboard.state.backward = false
      keyboard.state.left = false
      keyboard.state.right = false
      keyboard.state.sprint = false
    }

    const modal = activeModal(
      pauseMenu, npcDialog, questLog, vueUi, inventoryScreen, quickActions, timeSkip, busy, restCamp,
    )
    touchControls?.setInputEnabled(
      modal === null && !timeSkip.isActive() && !busy.isActive() && !restCamp.isActive(),
    )

    if (modal !== null) {
      // Every modal drops stale presses so they can't fire right after it
      // closes, and blocks the gaze highlight — only the per-modal reaction
      // to *which* key was pressed differs, in the switch below.
      const interactConsumed = keyboard.consumeInteract()
      keyboard.consumeAltInteract()
      const questLogConsumed = keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      keyboard.consumeJump()
      const inventoryConsumed = keyboard.consumeInventory()
      const quickActionsConsumed = keyboard.consumeQuickActions()
      const minimapConsumed = keyboard.consumeMinimap()
      const skillsConsumed = keyboard.consumeSkills()
      const characterConsumed = keyboard.consumeCharacter()
      setHighlight(null)
      vueUi.setCycleTargetAvailable(false)
      // Modal safety (plan 123): cancel any in-flight attack rather than let
      // it keep timing out/resolving while input is blocked.
      if (playerMelee.isAttacking()) {
        playerMelee.reset()
        player.endMeleeAttack()
        player.setMeleeSwing(null)
        attackYaw = null
      }

      switch (modal) {
        case 'busy':
        case 'menu':
        case 'merchant':
        case 'notes':
        case 'npcDialogueMenu':
        case 'timeSkip':
        case 'villagers':
        case 'worldConfig':
          break
        case 'character':
          if (characterConsumed) vueUi.closeCharacterScreen()
          break
        case 'inventory':
          if (inventoryConsumed) inventoryScreen.close()
          break
        case 'npcDialog':
          npcDialog.setPrompt(null)
          if (interactConsumed) {
            if (npcDialog.isOffer()) npcDialog.accept()
            else npcDialog.close()
          }
          break
        case 'questLog':
          if (questLogConsumed) questLog.close()
          break
        case 'quickActions':
          if (quickActionsConsumed) quickActions.close()
          break
        case 'skills':
          if (skillsConsumed) vueUi.closeSkillsScreen()
          break
        case 'worldMap':
          if (minimapConsumed) vueUi.closeWorldMap()
          break
      }
    } else {
      const held = heldTool.held()
      const interactables = buildInteractables(
        bundle.settlementsManager.getLoaded(),
        bundle.fauna,
        bundle.chunkManager,
        bundle.itemSpawners,
        bundle.droppedItems,
        bundle.placedFires,
        bundle.placedTents,
        bundle.placedTraps,
        bundle.resourceDeposits,
        bundle.dryingRacks,
        bundle.hives,
        dayNight.elapsedDays,
        player.mesh.position,
        held,
        landOwnership,
        inventory.has('knife', 1) || inventory.has('damascus_knife', 1),
        (kind) => questManager.activeSpotAnimalRange(kind),
      )

      // Universal melee tick (plan 123) — runs every frame regardless of
      // input. Candidates are read from `interactables`'s already-filtered
      // `animal` entries (GAZE_RANGE, currently 5, comfortably covers every
      // weapon's configured `range`, currently <=2.6), not a fresh world
      // query — the hit test itself is independent of whichever single
      // target `pickInGaze` would pick below.
      const meleeCandidates: MeleeHitCandidate[] = []
      const meleeAnimalById = new Map<string, AnimalAgent>()
      for (const item of interactables) {
        if (item.kind !== 'animal') continue
        meleeCandidates.push({ id: item.animal.animalId, x: item.position.x, z: item.position.z, alive: true })
        meleeAnimalById.set(item.animal.animalId, item.animal)
      }
      const meleeTick = playerMelee.update(dt)
      if (player.isDowned()) {
        playerMelee.reset()
        player.endMeleeAttack()
        player.setMeleeSwing(null)
        attackYaw = null
      } else if (!playerMelee.isAttacking()) {
        player.endMeleeAttack()
        player.setMeleeSwing(null)
      } else if (!player.hasMeleeAttackClip()) {
        player.setMeleeSwing({
          x: 0,
          y: meleeSwingAngle(playerMelee.state(), playerMelee.phaseProgress()),
          z: 0,
        })
      } else {
        player.setMeleeSwing(null)
      }
      if (meleeTick.hitReady && meleeTick.config) {
        const hitIds = resolveMeleeHits(
          player.mesh.position.x,
          player.mesh.position.z,
          attackYaw ?? mouseLook.state.yaw,
          meleeTick.config,
          meleeCandidates,
        )
        for (const id of hitIds) {
          const animal = meleeAnimalById.get(id)
          if (!animal || animal.isDead()) continue
          playerMelee.rememberHit(id)
          playerCombat.enter()
          playerCombat.noteActivity()
          playerCombat.setSoftLock(livingTargetIdForAnimal(id))
          animal.takeDamage(meleeTick.config.damage, 'player')
          const killed = animal.isDead()
          if (killed) playActionMeleeKill(worldAudio.playAt, animal.mesh.position)
          else playActionMeleeHit(worldAudio.playAt, animal.mesh.position)
          const label = ANIMAL_LABELS[animal.def.kind]
          if (killed) {
            const override = questManager.onInteractObjective({
              type: 'animal_died',
              animalId: animal.animalId,
            })
            const denOverride = bundle.fauna.isWolfDenCleared()
              ? questManager.onInteractObjective({ type: 'wolf_den_cleared', denId: WOLF_DEN_ID })
              : null
            toast.show(denOverride?.line ?? override?.line ?? `${label} pada.`)
          } else {
            toast.show(`Trafiono: ${label}`)
          }
        }
        // One attack commits to one yaw; the rest of the swing (and the next
        // request) is free to use live camera yaw again.
        attackYaw = null
      }

      playerCombat.update(dt)

      const livingTargets = collectLivingCombatTargets(
        bundle.settlementsManager.getLoaded(),
        bundle.fauna,
        player.mesh.position,
        mouseLook.state.yaw,
        aimMode,
        playerMelee.recentTargetIds(),
      )
      if (playerCombat.softLockId() && !findLivingTargetById(livingTargets, playerCombat.softLockId())) {
        playerCombat.setSoftLock(null)
      }

      const cycleRangeSq = INTERACT_RANGE * INTERACT_RANGE
      const cycleCandidates = interactables.filter((c) => {
        const dx = c.position.x - player.mesh.position.x
        const dz = c.position.z - player.mesh.position.z
        return dx * dx + dz * dz <= cycleRangeSq
      })
      const worldCycleCandidates = filterWorldCycleTargets(cycleCandidates)
      const cycleTargetPressed = keyboard.consumeCycleTarget()
      const shiftHeld = keyboard.state.sprint

      if (playerCombat.isActive()) {
        if (cycleTargetPressed && !shiftHeld && livingTargets.length > 0) {
          let next: number
          const lockId = playerCombat.softLockId()
          if (lockId) {
            const cur = livingTargets.findIndex((t) => t.id === lockId)
            next = cur >= 0 ? (cur + 1) % livingTargets.length : 0
          } else {
            next = playerCombat.livingCycleIndex()
          }
          playerCombat.setLivingCycleIndex(next)
          playerCombat.setWorldCycleActive(false)
          playerCombat.setSoftLock(livingTargets[next]!.id)
          playerCombat.enter()
          playerCombat.noteActivity()
          cycleActive = false
          cycleIndex = 0
        } else if (cycleTargetPressed && shiftHeld) {
          if (worldCycleCandidates.length <= 1) {
            playerCombat.setWorldCycleIndex(0)
            playerCombat.setWorldCycleActive(worldCycleCandidates.length === 1)
          } else {
            const next = playerCombat.worldCycleActive()
              ? (playerCombat.worldCycleIndex() + 1) % worldCycleCandidates.length
              : 0
            playerCombat.setWorldCycleIndex(next)
            playerCombat.setWorldCycleActive(true)
          }
          playerCombat.setSoftLock(null)
          playerCombat.enter()
          playerCombat.noteActivity()
        }
      } else if (cycleTargetPressed && !shiftHeld && livingTargets.length > 0) {
        playerCombat.setLivingCycleIndex(0)
        playerCombat.setSoftLock(livingTargets[0]!.id)
        playerCombat.setWorldCycleActive(false)
        playerCombat.enter()
        playerCombat.noteActivity()
        cycleActive = false
        cycleIndex = 0
      } else if (cycleTargetPressed && shiftHeld && worldCycleCandidates.length > 0) {
        playerCombat.setWorldCycleIndex(0)
        playerCombat.setWorldCycleActive(true)
        playerCombat.setSoftLock(null)
        playerCombat.enter()
        playerCombat.noteActivity()
        cycleActive = false
        cycleIndex = 0
      } else if (cycleCandidates.length <= 1) {
        cycleActive = false
        cycleIndex = 0
      } else if (cycleTargetPressed) {
        cycleIndex = cycleActive ? (cycleIndex + 1) % cycleCandidates.length : 0
        cycleActive = true
      } else if (cycleIndex >= cycleCandidates.length) {
        cycleIndex = 0
      }

      let target: (typeof interactables)[number] | null = null
      if (playerCombat.isActive()) {
        if (playerCombat.worldCycleActive() && worldCycleCandidates.length > 0) {
          target = worldCycleCandidates[playerCombat.worldCycleIndex() % worldCycleCandidates.length] ?? null
        } else {
          target = resolveLivingInteractable(playerCombat.softLockId(), interactables)
            ?? (livingTargets.length > 0
              ? resolveLivingInteractable(
                  livingTargets[playerCombat.livingCycleIndex() % livingTargets.length]!.id,
                  interactables,
                )
              : null)
            ?? buildCombatTarget(
              bundle.settlementsManager.getLoaded(),
              bundle.fauna,
              player.mesh.position,
              mouseLook.state.yaw,
              held,
              playerMelee.recentTargetIds(),
              aimMode,
            )
            ?? buildDigTarget(
              player.mesh.position,
              mouseLook.state.yaw,
              held,
              bundle.chunkManager,
            )
        }
      } else {
        target = (cycleActive ? cycleCandidates[cycleIndex]! : null) ?? pickInGaze(
          interactables,
          player.mesh.position,
          mouseLook.state.yaw,
          INTERACT_RANGE,
          INTERACT_MIN_DOT,
        ) ?? buildDigTarget(
          player.mesh.position,
          mouseLook.state.yaw,
          held,
          bundle.chunkManager,
        ) ?? buildCombatTarget(
          bundle.settlementsManager.getLoaded(),
          bundle.fauna,
          player.mesh.position,
          mouseLook.state.yaw,
          held,
          playerMelee.recentTargetIds(),
          aimMode,
        )
      }

      const cycleHint = playerCombat.isActive()
        ? (livingTargets.length > 1 ? ' · [Tab] Cel · [Shift+Tab] Świat' : ' · [Shift+Tab] Świat')
        : (target && cycleCandidates.length > 1 ? ` · [Tab] Dalej (${cycleIndex + 1}/${cycleCandidates.length})` : '')
      const promptHighlighted = Boolean(
        target && (
          cycleActive
          || (playerCombat.isActive() && (playerCombat.softLockId() != null || playerCombat.worldCycleActive()))
        ),
      )
      npcDialog.setPrompt(target ? `${target.promptLabel}${cycleHint}` : null, promptHighlighted)
      vueUi.setCycleTargetAvailable(
        playerCombat.isActive()
          ? livingTargets.length > 1
          : cycleCandidates.length > 1,
      )

      if (isDebugMode()) {
        if (target?.kind === 'house') {
          if (target.houseId !== lastDebugHouseId) {
            lastDebugHouseId = target.houseId
            console.info('[house:gaze]', {
              id: target.houseId,
              model: target.modelUrl,
              label: target.label,
              lampSource: target.lampMountSource,
              lampMount: target.lampMount
                ? {
                    x: +target.lampMount.x.toFixed(3),
                    y: +target.lampMount.y.toFixed(3),
                    z: +target.lampMount.z.toFixed(3),
                  }
                : null,
              paste: target.lampMount
                ? `lampMount: { x: ${target.lampMount.x.toFixed(3)}, y: ${target.lampMount.y.toFixed(3)}, z: ${target.lampMount.z.toFixed(3)} }`
                : null,
            })
          }
        } else {
          lastDebugHouseId = null
        }
      }

      const gazeCandidates: { position: { x: number, z: number }, agent: Highlightable }[] = []
      for (const item of interactables) {
        if (item.kind === 'npc') gazeCandidates.push({ position: item.position, agent: item.npc })
        else if (item.kind === 'animal' || item.kind === 'corpse') {
          gazeCandidates.push({ position: item.position, agent: item.animal })
        }
      }
      const gazed = pickInGaze(
        gazeCandidates,
        player.mesh.position,
        mouseLook.state.yaw,
        GAZE_RANGE,
        INTERACT_MIN_DOT,
      )
      setHighlight(interactableAgent(target) ?? gazed?.agent ?? null)
      if (target?.kind === 'npc' && npcInspectTrigger?.consume()) {
        exitGamePointerLock(renderer.domElement)
        npcInspector?.open(target.npc, target.settlement.name)
      }
      const interactPressed = keyboard.consumeInteract()
      const altInteractPressed = keyboard.consumeAltInteract()
      if (target?.kind === 'dig') {
        if (interactPressed && target.profile) {
          startGroundWork('dig', target.position.x, target.position.z)
        } else if (interactPressed && !target.profile) {
          toast.show('Tu nie da się kopać.', 'error')
        }
        if (altInteractPressed && target.canLevel) {
          startGroundWork('level', target.position.x, target.position.z)
        } else if (altInteractPressed && !target.canLevel) {
          toast.show('Nie ma tu czego wyrównać.', 'error')
        }
      } else if (target?.kind === 'tent') {
        if (interactPressed) startTentRest(target.id)
        if (altInteractPressed) packTent(target.id)
      } else if (target?.kind === 'trap') {
        if (interactPressed) {
          if (target.state === 'active') disarmTrap(target.id)
          else if (target.state === 'placed') armTrap(target.id)
          else toast.show('Ta pułapka jest zniszczona.', 'error')
        }
        if (altInteractPressed && target.state !== 'active') collectTrap(target.id)
        else if (altInteractPressed) toast.show('Najpierw rozbrój pułapkę.', 'error')
      } else if (target?.kind === 'campfire') {
        if (interactPressed) {
          if (target.fire.isLit()) {
            if (inventory.remove('branch', 1)) {
              target.fire.addFuel()
              hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
              onInventoryChanged()
              toast.show('Dołożono gałąź do ogniska.')
            } else {
              toast.show('Potrzebujesz gałęzi, żeby je zapalić.', 'error')
            }
          } else {
            startIgniteFire?.(target.fire)
          }
        }
        if (altInteractPressed) startCookAt?.(target.fire)
      } else if (target?.kind === 'well') {
        if (interactPressed) {
          const outcome = resolveInteraction(target, questManager)
          playActionWell(worldAudio.playAt, target.position)
          npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
          drinkFromWaterSource?.(createWaterSource('well'))
        }
        if (altInteractPressed) fillWaterskin?.()
      } else if (target?.kind === 'waterEdge') {
        if (heldTool.held() === 'fishing_rod') {
          if (interactPressed) startFishing?.(target.position.x, target.position.z)
          if (altInteractPressed) applyFishingBait?.(target.position.x, target.position.z)
        } else {
          if (interactPressed) drinkFromWaterSource?.(target.source)
          if (altInteractPressed) fillWaterskin?.()
        }
      } else if (target?.kind === 'dryingRack') {
        if (interactPressed) interactDryingRack?.(target.id)
      } else if (target?.kind === 'hive') {
        if (interactPressed) collectHive?.(target.id)
        if (altInteractPressed) burnHive?.(target.id)
      } else if (target?.kind === 'item') {
        if (interactPressed || altInteractPressed) {
          if (!inventory.canAdd(target.item.kind)) {
            toast.show('Ekwipunek jest za ciężki.', 'error')
          } else {
            const collected = collectItem(target.item, bundle.chunkManager, bundle.itemSpawners, bundle.droppedItems)
            if (collected) {
              inventory.add(collected.kind, 1, dayNight.elapsedDays)
              playInventoryPickUp(worldAudio.playOnce)
              hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
              onInventoryChanged()
              // `[R]` quick-action (plan 153): pickup → inventory → use in one
              // keypress, reusing the same `consumeItem` flow the inventory
              // screen's "Zjedz"/"Wypij" button calls — no separate quick-use
              // system. Silently falls back to a plain pickup if the item
              // isn't consumable (the `[R]` hint never showed for it).
              if (altInteractPressed && ITEM_CATALOG[collected.kind].consumable) {
                consumeItem?.(collected.kind)
              }
            }
          }
        }
      } else if (target && interactPressed) {
        if (target.kind === 'tree') {
          if (target.canHarvest) {
            startTreeChop(target.id, target.position.x, target.position.z)
          } else {
            const outcome = resolveInteraction(target, questManager)
            if (treeInspectionCanYieldBranch(target.stage)) {
              const branchChance = TREE_BRANCH_CHANCE + (inventory.has('knife', 1) || inventory.has('damascus_knife', 1) ? KNIFE_BRANCH_BONUS : 0)
              if (Math.random() < branchChance && inventory.canAdd('branch')) {
                inventory.add('branch')
                playInventoryPickUp(worldAudio.playOnce)
                hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
                onInventoryChanged()
                toast.show('+1 Gałąź', 'pickup')
              }
            }
            npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
          }
        } else if (target.kind === 'deposit') {
          startDepositMine(target.id, target.position.x, target.position.z)
        } else if (target.kind === 'corpse') {
          if (target.action === 'bury') startBuryCorpse(target.animal)
          else startHarvestMeat?.(target.animal)
        } else if (target.kind === 'npc') {
          // Buttons need a visible cursor — same pointer-lock release the
          // pause menu already does on open (createPauseMenu's onPause).
          exitGamePointerLock(renderer.domElement)
          vueUi.openNpcDialogueMenu(target.npc, target.settlement, questManager, dayNight.timeOfDay)
        } else if (target.kind === 'animal') {
          if (isMeleeTool(held) && !player.isDowned()) {
            // `[E]` over a gazed live animal is the attack *trigger* (keeps
            // the existing "Atakuj: X" prompt UX) — the actual hit/damage is
            // resolved geometrically above, independent of this single
            // gazed target (plan 123 §3).
            const config = ITEM_CATALOG[held].melee
            if (config && !playerMelee.isAttacking()) {
              if (player.needs.stamina.current < config.staminaCost) {
                toast.show('Brak siły na atak.', 'error')
              } else {
                const result = playerMelee.requestAttack(
                  config,
                  player.needs.stamina,
                  player.mesh.position.x,
                  player.mesh.position.z,
                  target.position.x,
                  target.position.z,
                )
                if (result.started) {
                  playerCombat.enter()
                  playerCombat.noteActivity()
                  playerCombat.setSoftLock(livingTargetIdForAnimal(target.animal.animalId))
                  player.beginMeleeAttack(config.windUp + config.hitWindow + config.recovery)
                  player.faceToward(target.position.x, target.position.z)
                  if (result.moveX !== 0 || result.moveZ !== 0) {
                    player.gapClose(result.moveX, result.moveZ)
                  }
                  // Touch auto-facing (plan 142 §2): the character already
                  // turns to the target above, but the hit test runs off aim
                  // yaw — commit that too, so a target acquired inside the
                  // wider touch cone but outside the weapon's arc still
                  // connects. Computed after the gap-close, since a collision
                  // can slide the player off the straight line to the target.
                  // Camera and movement control stay untouched.
                  attackYaw = aimMode === 'touch'
                    ? yawToward(
                        player.mesh.position.x,
                        player.mesh.position.z,
                        target.position.x,
                        target.position.z,
                      )
                    : null
                }
              }
            }
          } else {
            const outcome = resolveInteraction(target, questManager)
            playAnimalSound(target.animal.def.kind, worldAudio.playAt, target.position)
            npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
          }
        } else if (target.kind === 'spawner') {
          if (target.spawner.state !== 'depleted') {
            const outcome = resolveInteraction(target, questManager)
            npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
          } else {
            // Still resolves any `interact_spawner` quest objective bound to
            // this spawner type (plan 093's "wilcza jama" onward) even though
            // `depleted` repurposes `[E]` for the destroy action below — a
            // quest step shouldn't become unreachable just because the player
            // exhausted the habitat first. No dialog is opened for it here.
            resolveInteraction(target, questManager)
            startDestroySpawner(target.spawner)
          }
        } else if (target.kind === 'landPlot') {
          const settlement = bundle.settlementsManager.getLoaded().find((s) => s.id === target.settlementId)
          const result = settlement
            ? purchaseLandPlot(settlement, target.plotId, inventory, landOwnership)
            : 'not_found'
          if (result === 'ok') {
            hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
            onInventoryChanged()
            toast.show('Działka kupiona!', 'pickup')
          } else if (result === 'cannot_afford') {
            toast.show('Nie stać cię na tę działkę.', 'error')
          } else if (result === 'already_owned') {
            toast.show('Ta działka jest już Twoja.', 'error')
          } else {
            toast.show('Nie można kupić tej działki.', 'error')
          }
        } else {
          const outcome = resolveInteraction(target, questManager)
          npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
        }
      }
      if (keyboard.consumeQuestLog()) openQuestLog()
      if (keyboard.consumeInventory()) openInventory()
      if (keyboard.consumeSkills()) openSkills()
      if (keyboard.consumeCharacter()) openCharacter()
      if (keyboard.consumeQuickActions()) quickActions.toggle()
      if (keyboard.consumeMinimap()) {
        vueUi.toggleWorldMap(player.mesh.position.x, player.mesh.position.z)
      }
      if (keyboard.consumeJump()) player.jump()
      if (keyboard.consumeDrop()) {
        let dropOffset = 0
        const itemKinds = Object.keys(ITEM_DEFS) as ItemKind[]
        for (const kind of itemKinds) {
          if (!inventory.remove(kind, 1)) continue
          const angle = dropOffset * ((Math.PI * 2) / itemKinds.length)
          bundle.droppedItems.drop(
            kind,
            player.mesh.position.x + Math.cos(angle) * 0.6,
            player.mesh.position.z + Math.sin(angle) * 0.6,
          )
          dropOffset++
        }
        if (dropOffset > 0) {
          playInventoryDrop(worldAudio.playOnce)
          heldTool.syncWithInventory()
          hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
          onInventoryChanged()
        }
      }
    }

    if (
      !pauseMenu.isPaused() &&
      !npcDialog.isOpen() &&
      !questLog.isOpen() &&
      !vueUi.isVillagersOpen() &&
      !inventoryScreen.isOpen() &&
      !quickActions.isOpen() &&
      !vueUi.isWorldConfigScreenOpen() &&
      !vueUi.isNotesOpen() &&
      !vueUi.isWorldMapOpen()
    ) {
      const loaded = bundle.settlementsManager.getLoaded()
      if (questManager.isDirty()) {
        for (const s of loaded) {
          for (const npc of s.npcs) {
            npc.setQuestMarker(questManager.labelMarker(npc.name))
          }
        }
        for (const spawner of bundle.fauna.getSpawners()) {
          bundle.fauna.setSpawnerMarker(spawner.type, questManager.spawnerMarker(spawner.type))
        }
        questManager.clearDirty()
      }
      // While a `timeSkip` is in flight, NPCs/fauna freeze instead of
      // continuing to walk/steer in real time underneath the label/filter —
      // `NpcAgent.resolveTimeSkip` (called above on `skip.justFinished`)
      // catches them up to the new schedule/needs/position in one shot, so
      // nothing is lost by not ticking them meanwhile. `dt` below (for the
      // clock itself) stays real — the sky/clock still has to race ahead.
      const worldDt = timeSkip.isActive() ? 0 : dt
      tickDayNight(dayNight, dt)
      // Cheap: `tickClimate` only recomputes `weather` from the deterministic
      // hash when `elapsedDays` crosses into a new weather cycle (plan §17);
      // `season`/`seasonProgress` are trivial arithmetic recomputed every call.
      tickClimate(climate, getSeed(), dayNight.elapsedDays)
      // Pure + bounded (plan 133 — `computeSurfaceWeather`'s lookback is a
      // fixed cycle count, not proportional to `elapsedDays`), so this is
      // cheap enough to re-derive every frame for a smooth rise/dry curve
      // rather than only at weather-cycle boundaries. Two shared uniform
      // writes, no per-chunk work.
      const surfaceWeather = computeSurfaceWeather(getSeed(), dayNight.elapsedDays)
      bundle.chunkManager.setWeatherSurface(surfaceWeather.wetness, surfaceWeather.snowAmount)
      const weatherVisualChanged =
        climate.weather.type !== lastAppliedWeatherType ||
        Math.abs(climate.weather.intensity - lastAppliedWeatherIntensity) >= 0.03
      if (
        dayNight.enabled &&
        (timeOfDayDelta(dayNight.timeOfDay, lastAppliedTimeOfDay) >= DAY_NIGHT_APPLY_THRESHOLD ||
          weatherVisualChanged)
      ) {
        resyncDayNight()
      }
      // Single `skyParamsFromTime` call for the frame — `tickDayNight` just
      // advanced `timeOfDay`, so this reflects the current frame and is
      // reused below (`dayFactor`) and after this block (`postProcessing`)
      // instead of each call site recomputing the same params object.
      cachedSky = skyParamsFromTime(dayNight.timeOfDay)
      weatherParticles.update(
        dt, climate.weather, player.mesh.position.x, player.mesh.position.y, player.mesh.position.z,
        camera.fov, renderer.domElement.clientHeight,
      )
      weatherAudio.update(climate.weather)
      ambientAudio.update(
        dt,
        cachedSky.dayFactor,
        player.mesh.position.x,
        player.mesh.position.z,
      )
      hud.setTime(dayNight.timeOfDay)
      hud.setExp(questManager.getExp())
      withCategory(monitor, 'PHYSICS', () => { player.update(dt) })
      // Hunger/thirst/vigor freeze during an active time-skip (worldDt=0,
      // caught up in one lump above on `skip.justFinished`) — stamina keeps
      // ticking inside `player.update(dt)` on raw `dt` (tied to sprint).
      tickPlayerNeeds(player.needs, worldDt)
      if (!player.isDowned()) {
        tickPlayerStarvationDamage(player, player.needs, worldDt, heldTool.held(), mouseLook.state.yaw)
        tickHealthRegen(player.needs, player.health, worldDt)
      }
      if (player.tickDowned(worldDt)) {
        applyDownedRecovery(player.health)
      }
      hud.setPlayerNeeds({
        hp: player.health.maxHp > 0 ? player.health.currentHp / player.health.maxHp : 0,
        stamina: getStaminaRatio(player.needs.stamina),
        vigor: getVigorRatio(player.needs.vigor),
        hunger: getHungerRatio(player.needs.hunger),
        thirst: getThirstRatio(player.needs.thirst),
      })
      hud.setCharacterStats({
        hp: { current: player.health.currentHp, max: player.health.maxHp },
        stamina: { current: player.needs.stamina.current, max: player.needs.stamina.max },
        vigor: { current: player.needs.vigor.current, max: player.needs.vigor.max },
        hunger: { current: player.needs.hunger.current, max: player.needs.hunger.max },
        thirst: { current: player.needs.thirst.current, max: player.needs.thirst.max },
      })
      // Sneak's `active` flag can flip outside the Skills screen's own
      // toggle (rest auto-deactivates it, `PlayerController.crouch`/
      // `lieDown`) — pushed every frame with the same cheap-bail convention
      // as the stats above so the UI never goes stale.
      vueUi.setSkillsState(
        player.skills.sneak.value,
        player.skills.sneak.active,
        player.skills.sneak.xp,
        player.skills.survival.value,
        player.skills.survival.xp,
        player.skills.traps.value,
        player.skills.traps.xp,
        player.skills.defense.value,
        player.skills.defense.xp,
      )
      houseDoors.update(
        player.mesh.position.x,
        player.mesh.position.z,
        loaded.flatMap((s) =>
          s.landmarks.houses.map((house) => ({
            id: `${s.id}:${house.position.x.toFixed(2)}:${house.position.z.toFixed(2)}`,
            x: house.position.x,
            z: house.position.z,
            radius: house.footprintRadius,
          })),
        ),
        worldAudio.playAt,
      )
      mapDiscovery.update(player.mesh.position.x, player.mesh.position.z)
      withCategory(monitor, 'TERRAIN', () => {
        bundle.chunkManager.update(player.mesh.position.x, player.mesh.position.z)
      })
      lights.follow(player.mesh.position.x, player.mesh.position.z)
      bundle.ocean.follow(player.mesh.position.x, player.mesh.position.z)
      // Computed before `settlementsManager.update` (not after, as before
      // livestock existed) so its per-settlement livestock `update()` calls
      // can also use them — neither depends on `update()`'s effect this same
      // frame (fire-lit state only changes via `setDayNight`, not `update`).
      const dayFactor = cachedSky.dayFactor
      const litFires: { x: number, z: number }[] = [
        ...loaded.flatMap((s) => (s.fire?.isLit() ? [s.fire.position] : [])),
        ...bundle.placedFires.list().filter((f) => f.fire.isLit()).map((f) => f.fire.position),
      ]
      fireAudio.update(player.mesh.position.x, player.mesh.position.z, litFires)
      // Portable torch counts as a fire source for fauna fear (plan 056 / 050).
      if (playerTorch.isLit()) {
        litFires.push({ x: player.mesh.position.x, z: player.mesh.position.z })
      }
      const villages = loaded.map((s) => ({
        x: s.center.x,
        z: s.center.z,
        radius: villageSizeConfig(s.size).footprintRadius,
      }))
      const nearbyHumanCount = countNearbyHumans(
        player.mesh.position.x,
        player.mesh.position.z,
        loaded.flatMap((s) =>
          s.npcs
            .filter((npc) => !npc.health.dead)
            .map((npc) => ({ x: npc.mesh.position.x, z: npc.mesh.position.z })),
        ),
      )
      withCategory(monitor, 'NPC', () => {
        bundle.settlementsManager.update(
          worldDt,
          player.mesh.position,
          mouseLook.state.yaw,
          dayNight.timeOfDay,
          dayFactor,
          litFires,
          villages,
        )
      })
      bundle.resourceDeposits.update(
        player.mesh.position.x,
        player.mesh.position.z,
        loaded.map((s) => ({ x: s.center.x, z: s.center.z })),
      )
      withCategory(monitor, 'FAUNA', () => {
        bundle.fauna.update(
          worldDt,
          player.mesh.position,
          dayNight.timeOfDay,
          dayNight.elapsedDays,
          litFires,
          villages,
          nearbyHumanCount,
          (amount, attackerX, attackerZ) => {
            const dmg = applyPlayerDamage({
              player,
              amount,
              attackerX,
              attackerZ,
              attackerKey: 'fauna',
              heldTool: heldTool.held(),
              defenseSkillValue: player.skills.defense.value,
              playerYaw: mouseLook.state.yaw,
              onCombatHit: () => {
                playerCombat.enter()
                playerCombat.noteActivity()
              },
            })
            if (dmg.enteredDowned) {
              playerMelee.reset()
              player.endMeleeAttack()
              player.setMeleeSwing(null)
              attackYaw = null
            }
          },
          {
            sneakValue: player.skills.sneak.value,
            sneakActive: player.skills.sneak.active,
            movement: player.movementState(),
          },
        )
      })
      // Traps run inside the fauna pass's own cadence (plan 141 §11): the
      // system throttles itself and early-outs when nothing is armed, and it
      // reuses the agent list fauna just updated instead of a second query.
      bundle.placedTraps.update(worldDt, dayNight.elapsedDays, bundle.fauna.getAgents())
      bundle.itemSpawners.update(dt, player.mesh.position, dayFactor)
      bundle.droppedItems.tick(dt)
      bundle.placedFires.update(dt)
      playerTorch.update(dt)
      withCategory(monitor, 'WATER', () => { bundle.chunkManager.tickWater(dt) })
      withCategory(monitor, 'GRASS', () => { bundle.chunkManager.tickGrass(dt) })
      updateFoliageWind(dt)
      withCategory(monitor, 'WATER', () => { bundle.ocean.update(dt) })
      worldAudio.update(dt)
      minimap.update(
        player.mesh.position,
        loaded.map((s): MinimapSettlement => ({ position: s.center, npcs: s.npcs, name: s.name })),
        mouseLook.state.yaw,
      )
    }
    if (isCameraMeshDebugMode()) {
      camera.getWorldDirection(cameraMeshDirection)
      cameraMeshRaycaster.set(camera.position, cameraMeshDirection)
      const hits = cameraMeshRaycaster.intersectObjects(scene.children, true)
      const hit = hits.find((h) => (h.object as { isMesh?: boolean }).isMesh)
      const hitUuid = hit?.object.uuid ?? null
      let rootName = ''
      if (hit) {
        let root: Object3D | null = hit.object.parent
        rootName = hit.object.parent?.name || ''
        while (root && root !== scene) {
          if (root.name) rootName = root.name
          root = root.parent
        }
      }
      // `?debugRenderState=1` reads this every frame (distance changes even
      // when the hit mesh doesn't) — reuses this raycast rather than running
      // a second independent one.
      setCameraMeshHit(
        hit
          ? {
              name: hit.object.name || '(unnamed)',
              uuid: hit.object.uuid,
              parentName: rootName || '(scene root)',
              distance: hit.distance,
            }
          : null,
      )
      if (hitUuid !== lastCameraMeshUuid) {
        lastCameraMeshUuid = hitUuid
        if (hit) {
          console.info(
            `[CameraMeshDebug]\nname=${hit.object.name || '(unnamed)'}\ntype=${hit.object.type}\nuuid=${hit.object.uuid}\nparent=${rootName || '(scene root)'}\ndistance=${hit.distance.toFixed(3)}`,
          )
        } else {
          console.info('[CameraMeshDebug]\nname=(none)\ntype=-\nuuid=-\nparent=-\ndistance=-')
        }
      }
    }

    syncPointLightBudget?.()
    const renderStart = performance.now()
    renderer.info.reset()
    postProcessing.applyFrameBudget(lastRenderMs)
    withCategory(monitor, 'WATER', () => {
      withProgramCensusStage(programCensus, 'mirror-render', () => {
        bundle.ocean.renderMirror(renderer, scene, camera)
      })
    })
    const mirrorDrawCalls = renderer.info.render.calls
    const mirrorTriangles = renderer.info.render.triangles
    // Shadow map at most once, against the beauty camera — not during the
    // mirror pass, which keeps `autoUpdate` off (plan 113 P1). `needsUpdate`
    // resets to `false` after `WebGLRenderer` consumes it, so leaving it
    // unset below is a no-op skip, not a missed update (plan 145 R1).
    const shadowPlayerX = player.mesh.position.x
    const shadowPlayerZ = player.mesh.position.z
    const shadowWanted = shouldUpdateShadowMap(
      shadowBudgetState,
      shadowPlayerX,
      shadowPlayerZ,
      hasNearbyShadowCaster(shadowPlayerX, shadowPlayerZ),
    )
    if (shadowWanted) renderer.shadowMap.needsUpdate = true
    recordShadowBudgetFrame(shadowBudgetState, shadowPlayerX, shadowPlayerZ, shadowWanted)
    postProcessing.updateGodRays(camera, sky.sunPosition, cachedSky.elev)
    withCategory(monitor, 'RENDER', () => {
      withProgramCensusStage(programCensus, 'postprocess-render', () => {
        postProcessing.render()
      })
      labelRenderer.render(scene, camera)
    })
    const renderEnd = performance.now()
    const simulateMs = renderStart - frameStart
    const renderMs = renderEnd - renderStart
    lastRenderMs = renderMs
    monitor.endFrame({
      simulateMs,
      renderMs,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      mirrorDrawCalls,
      mirrorTriangles,
    })
    programCensus.tickFrame()
    setFrameTiming(simulateMs, renderMs)
  }

  return {
    tick,
    resyncDayNight,
    forgetHighlight: () => { highlightedTarget = null },
  }
}

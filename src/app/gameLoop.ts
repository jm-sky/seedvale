import { Fog, Raycaster, Timer, Vector3 } from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NpcAgent } from '../ai/NpcAgent'
import type { createAmbientAudio } from '../audio/createAmbientAudio'
import type { ActiveSound, createWorldAudio } from '../audio/createWorldAudio'
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
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { QuestManager } from '../quests/QuestManager'
import type { PostProcessing } from '../render/createPostProcessing'
import type { LandOwnershipRegistry } from '../settlement/landOwnership'
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
import type { CloudSystem } from '../world/clouds'
import type { WorldLights } from '../world/createLights'
import type { WorldSky } from '../world/createSky'
import type { CropGrowthStage, CropId } from '../world/cropLifecycle'
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
import { playActionBowDraw, playActionBowRelease, playActionMeleeHit, playActionMeleeKill, playActionWell } from '../audio/actionSounds'
import { playAnimalAggroSound, playAnimalSound } from '../audio/animalSounds'
import { playInventoryDrop, playInventoryPickUp } from '../audio/inventorySounds'
import { MELEE_CRITICAL_CHANCE, MELEE_CRITICAL_MULTIPLIER, resolveCriticalHit } from '../combat/criticalHit'
import { advanceProjectile, type Projectile, sweptProjectileHit } from '../combat/projectile'
import { rangedAccuracy, rangedDeviationRoll, resolveRangedDirection } from '../combat/rangedAttack'
import {
  clampToViewportMargin,
  projectToViewportFraction,
  RANGED_RETICLE_TARGET_HEIGHT,
} from '../combat/rangedReticle'
import { createColliderDebugView } from '../debug/colliderDebugView'
import { isCameraMeshDebugMode, isColliderDebugMode, isDebugMode } from '../debug/debugMode'
import { setCameraMeshHit } from '../debug/renderStateDebug'
import { ANIMAL_LABELS, FAUNA_SHADOW_DISTANCE } from '../fauna/AnimalAgent'
import { WOLF_DEN_ID } from '../fauna/AnimalSpawner'
import { combatTargetForAnimal, isMeleeTool } from '../fauna/faunaCombat'
import { countNearbyHumans } from '../fauna/predatorHumanDecision'
import { type createMouseLook, exitGamePointerLock } from '../input/MouseLook'
import { pickInGaze } from '../interaction/findInteractionTarget'
import { resolveInteraction } from '../interaction/resolveInteraction'
import { treeInspectionCanYieldBranch } from '../interaction/treeInspection'
import { Inventory, inventoryFullToastText, type SaveItemInstance, toSaveItemInstance } from '../items/Inventory'
import { ARROW_DAMAGE_BONUS, hasItemCapability, isRangedTool, ITEM_CATALOG } from '../items/itemCatalog'
import { isInstanceBackedKind, isWeaponItemInstance } from '../items/itemInstances'
import { canCancelRestProgress, ITEM_DEFS, type ItemKind } from '../items/items'
import { createAcquiredInstance } from '../items/trade'
import { applySharpnessWear, getSharpnessDamageModifier, getWeaponMaintenanceProfile } from '../items/weaponMaintenance'
import { getMonitor, getProgramCensus, withCategory, withProgramCensusStage } from '../perf'
import {
  collectLivingCombatTargets,
  collectRangedAnimalCandidates,
  createPlayerCombat,
  filterWorldCycleTargets,
  findLivingTargetById,
  livingTargetIdForAnimal,
  resolveLivingInteractable,
  resolveRangedAimYaw,
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
import { createPlayerRanged } from '../player/playerRanged'
import { awardSkillXp, SKILL_XP_AWARD } from '../player/PlayerSkills'
import {
  anyWithinRadius,
  createShadowBudgetState,
  recordShadowBudgetFrame,
  shouldUpdateShadowMap,
} from '../render/shadowBudget'
import { villageSizeConfig } from '../settlement/families'
import { purchaseLandPlot } from '../settlement/landPurchase'
import { FIRE_FUEL_KINDS, type VillageFire } from '../settlement/VillageFire'
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
  COMBAT_TARGET_RANGE,
  type CombatAimMode,
  GAZE_RANGE,
  INTERACT_MIN_DOT,
  INTERACT_RANGE,
  KNIFE_BRANCH_BONUS,
  TREE_BRANCH_CHANCE,
} from './interactables'
import { activeModal } from './modalState'
import type { Object3D, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

/** Candidate-gathering radius for ranged projectile collision (plan 162) —
 *  a fixed generous bound covering `long_bow`'s 20-unit range plus margin,
 *  independent of `GAZE_RANGE`/`COMBAT_TARGET_RANGE` (both far shorter and
 *  scoped to gaze/soft-lock acquisition, not projectile flight). */
const RANGED_CANDIDATE_RANGE = 26

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
  clouds: CloudSystem
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
  /** Harvest a naturally-generated wild crop (plan 172). `cropId`/`stage` come
   *  straight from the `Interactable` snapshot so the capacity check can
   *  happen before any world mutation, same "check before you cut" order as
   *  the `item` branch below. */
  harvestCrop?: (id: string, cropId: CropId, stage: CropGrowthStage, x: number, z: number) => void
  /** "Zrób porządek" on a player garden plot (plan 176 §4/§10) — restores
   *  care after a short busy channel, shortened by a held shovel/pitchfork. */
  tidyGardenPlot?: (id: string) => void
  /** Opens the generic container transfer screen for a placed `chest`
   *  (plan 164 §7). */
  openContainer?: (id: string) => void
  /** Picks a placed container up (with contents) — carried state (plan 164
   *  §8/§15), not an inventory item. */
  pickUpContainer?: (id: string) => void
  /** Runs one active-work session on a player-built well (plan 127, revised
   *  — active work, not elapsed world time) — validates tool/materials,
   *  transitions into the next stage when needed, and starts a work-bout
   *  busy channel that credits `workProgress` for however long it actually
   *  runs before completing or being cancelled. */
  workOnWell?: (id: string) => void
  /** Terrain-preparation preview mode (plan `world-terrain-002` §2) — called
   *  unconditionally, before the gaze/interact dispatch, so a confirming
   *  `[E]` press is consumed here rather than falling through to it. No-ops
   *  when the preview isn't active. */
  tickTerrainPreparationPreview?: () => void
  /** `[E]` on an active preparation's marker — starts/resumes its work
   *  session (plan `world-terrain-002` §8). */
  resumeTerrainPreparationWork?: (id: string) => void
  /** Per-frame progressive-deformation tick for the active preparation work
   *  session — called unconditionally, alongside `tickLodging()`, regardless
   *  of `modal` state (mirrors `timeSkip.tick()`'s own "the clock keeps
   *  advancing" contract). No-ops when no session is running. */
  tickTerrainPreparationWork?: () => void
  /** The active `timeSkip` finished naturally — owner applies the
   *  preparation's final exact heights/XP if the finished skip belongs to an
   *  active preparation-work session (no-ops otherwise, same "only acts if
   *  it recognizes the finished skip as its own" contract as
   *  `onSleepFinished`). */
  onTerrainPreparationWorkFinished?: () => void
  /** A full night's sleep (`fadeStrength === 1` skip) just finished — owner
   *  (`createApp.ts`) applies the rest outcome for whatever camp it resolved
   *  when the rest started, and awards any Survival XP (plan 128 §5-§7). */
  onSleepFinished: () => void
  /** Per-frame: walks the player to the resolved "Nocuj w mieście" lodging
   *  target and starts Sleep on arrival (plan 168) — ticked the same way
   *  `restCamp.tick` is. */
  tickLodging: () => void
  /** True while walking to a resolved lodging target (plan 168) — folded
   *  into `activeModal` the same way `restCamp.isActive()` is. */
  isLodgingActive: () => boolean
  /** A long activity (rest/sleep/wait skip, or a busy channel — dig/chop/
   *  well work bout/etc.) is still active while the player takes damage
   *  (combat hit or starvation/dehydration) — cancels it through the same
   *  Esc route (`RestActions.abortRest`/`abortBusy`) and reports whether
   *  anything was actually cancelled, so the caller can toast about it
   *  (plan 186 §3 — "obrażenia" is one of the interrupting conditions). */
  interruptLongActivityOnDamage: () => boolean
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
    climate, clouds, weatherParticles, weatherAudio, getSeed,
    keyboard, mouseLook, touchControls, pauseMenu, npcDialog, npcInspector, npcInspectTrigger, questLog, vueUi, inventoryScreen,
    quickActions, timeSkip, timeSkipOverlay, busy, busyOverlay, restCamp, inventory, heldTool, landOwnership, toast, hud,
    questManager, ambientAudio, fireAudio, houseDoors, worldAudio, playerTorch, minimap, mapDiscovery, openQuestLog, openInventory, openSkills, openCharacter,
    startGroundWork, startTreeChop, startDepositMine, startBuryCorpse, startHarvestMeat, startCookAt, startIgniteFire,
    startDestroySpawner,
    drinkFromWaterSource, fillWaterskin, consumeItem, startTentRest, packTent, armTrap, disarmTrap, collectTrap,
    startFishing, applyFishingBait, interactDryingRack, collectHive, burnHive, harvestCrop, tidyGardenPlot,
    openContainer, pickUpContainer, workOnWell,
    tickTerrainPreparationPreview, resumeTerrainPreparationWork, tickTerrainPreparationWork, onTerrainPreparationWorkFinished,
    onSleepFinished, tickLodging, isLodgingActive, interruptLongActivityOnDamage, onInventoryChanged, setFrameTiming, syncPointLightBudget,
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
  /** `?debugColliders=1` — zero runtime presence outside that flag, same
   *  pattern as `npcInspector` above. Lives for the app session (no
   *  `GameLoop.dispose`, mirroring the other debug-only deps here). */
  const colliderDebugView = isColliderDebugMode() ? createColliderDebugView(scene) : null

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

  /** Ranged attack lifecycle (plan 162) — same draw/release/recovery shape
   *  as `playerMelee`, `ITEM_CATALOG[kind].ranged` supplies the per-bow
   *  config. */
  const playerRanged = createPlayerRanged()
  /** Live in-flight arrows — ticked every unpaused frame regardless of the
   *  currently held tool, so switching weapons mid-flight doesn't freeze or
   *  drop an already-fired shot. */
  let activeProjectiles: Projectile[] = []
  /** Soft-locked living-target id the current draw is aimed at, resolved to
   *  a live position again at fire time (the target may have moved) —
   *  `null` fires straight along the live aim yaw instead. */
  let rangedTargetId: string | null = null
  /** Handle for the currently-playing bow-draw clip, so a cancelled/
   *  interrupted draw can cut it short instead of letting it play out. */
  let bowDrawSound: ActiveSound | null = null
  function stopBowDrawSound(): void {
    bowDrawSound?.stop()
    bowDrawSound = null
  }
  /** Any player HP loss (fauna hit, starvation/dehydration) interrupts a long
   *  activity in progress (plan 186 §3) — reuses the exact same Esc route
   *  (`RestActions.abortRest`/`abortBusy`) rather than a second cancellation
   *  path, so partial well-work-bout progress etc. is credited exactly as an
   *  Esc cancel would credit it. */
  function onPlayerDamaged(): void {
    if (interruptLongActivityOnDamage()) {
      toast.show('Coś przerwało twoją aktywność!', 'error')
    }
  }
  /** Monotonic counter feeding every deterministic combat roll (critical hit,
   *  ranged aim deviation) this frame loop makes — never resets, so the same
   *  attempt index is never reused for two different shots/swings. */
  let attackAttemptCounter = 0

  /** Shared kill-consequence line for both melee and ranged (plan 162 §"Do
   *  not duplicate melee damage/kill logic") — quest hook + wolf-den check,
   *  same as the original melee-only inline version. */
  function animalDeathToastLine(animal: AnimalAgent): string {
    const label = ANIMAL_LABELS[animal.def.kind]
    const override = questManager.onInteractObjective({ type: 'animal_died', animalId: animal.animalId })
    const denOverride = bundle.fauna.isWolfDenCleared()
      ? questManager.onInteractObjective({ type: 'wolf_den_cleared', denId: WOLF_DEN_ID })
      : null
    return denOverride?.line ?? override?.line ?? `${label} pada.`
  }

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
    // Progressive terrain deformation (plan `world-terrain-002` §6) — ticks
    // every frame the skip is active, independent of which flavor (wait/
    // sleep/lodging/terrain-prep) is actually running; no-ops unless the
    // running skip belongs to an active preparation-work session.
    tickTerrainPreparationWork?.()
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
        // Fauna never live-ticks during a skip (see the `worldDt`/gating
        // comment below) — this is its sole catch-up for the skipped period,
        // mirroring the NPC catch-up above (plan 196).
        bundle.fauna.resolveTimeSkip(skip.hours, dayNight.dayLengthSec)
        // Player needs already progressed through the skip via `worldDt`
        // below (plan 165 — scaled by `dayNight.timeMultiplier` instead of
        // frozen, so no separate lump catch-up is needed here). `fadeStrength
        // === 1` is rest/sleep (`world/timeSkip.ts`'s doc comment): a full
        // night restores vigor/stamina on top of the drain the skipped hours
        // already applied — how much depends on the camp, which
        // `onSleepFinished` owns.
        if (skip.fadeStrength === 1) onSleepFinished()
        onTerrainPreparationWorkFinished?.()
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

    // Plan 168 — steers the player toward the resolved lodging target by
    // forcing `keyboard.state.forward`/`mouseLook.state.yaw`, the same
    // `KeyState`/`LookState` objects `player.update()` below already reads;
    // no second movement pipeline. Mutually exclusive with restCamp/busy
    // (`restActions.ts`'s `startRest` won't arm a walk while either is
    // active), so it never fights their key-clearing above.
    tickLodging()

    const modal = activeModal(
      pauseMenu, npcDialog, questLog, vueUi, inventoryScreen, quickActions, timeSkip, busy, restCamp,
      { isActive: isLodgingActive },
    )
    touchControls?.setInputEnabled(
      modal === null && !timeSkip.isActive() && !busy.isActive() && !restCamp.isActive() && !isLodgingActive(),
    )

    if (modal !== null) {
      // Every modal drops stale presses so they can't fire right after it
      // closes, and blocks the gaze highlight — only the per-modal reaction
      // to *which* key was pressed differs, in the switch below.
      const interactConsumed = keyboard.consumeInteract()
      keyboard.consumeInteractRelease()
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
      if (playerRanged.isDrawing()) {
        playerRanged.reset()
        player.endRangedDraw()
        rangedTargetId = null
        stopBowDrawSound()
        hud.setAiming(false, null)
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
      // Consumes a confirming `[E]` press itself when the preview is active,
      // before the gaze/interact dispatch below gets a chance to see it
      // (plan `world-terrain-002` §2).
      tickTerrainPreparationPreview?.()
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
        bundle.placedContainers,
        bundle.resourceDeposits,
        bundle.dryingRacks,
        bundle.hives,
        bundle.playerWells,
        bundle.playerGardens,
        bundle.terrainPreparations,
        dayNight.elapsedDays,
        player.mesh.position,
        held,
        landOwnership,
        inventory.hasCapability('meat_harvesting'),
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
        // Plan 161 — current held instance's sharpness (if any) modifies this
        // swing's damage; wear is applied once per resolved hit below, never
        // on a miss (no `hitIds`) and never more than once per target.
        const heldInstanceId = heldTool.heldInstanceId()
        const heldInstance = heldInstanceId ? inventory.getInstance(heldInstanceId) : null
        const weaponInstance = heldInstance && isWeaponItemInstance(heldInstance) ? heldInstance : null
        const sharpnessModifier = weaponInstance ? getSharpnessDamageModifier(weaponInstance.sharpness) : 1
        for (const id of hitIds) {
          const animal = meleeAnimalById.get(id)
          if (!animal || animal.isDead()) continue
          playerMelee.rememberHit(id)
          playerCombat.enter()
          playerCombat.noteActivity()
          playerCombat.setSoftLock(livingTargetIdForAnimal(id))
          attackAttemptCounter++
          // Plan 162 — critical is a shared modifier, not ranged-only; melee
          // opts into the flat baseline chance instead of a per-weapon knob.
          const critResult = resolveCriticalHit(
            meleeTick.config.damage * sharpnessModifier,
            MELEE_CRITICAL_CHANCE,
            MELEE_CRITICAL_MULTIPLIER,
            'player',
            `melee:${id}`,
            attackAttemptCounter,
          )
          animal.takeDamage(critResult.damage, 'player')
          if (weaponInstance) {
            const profile = getWeaponMaintenanceProfile(weaponInstance.kind)
            inventory.updateInstance(weaponInstance.id, (inst) => (
              isWeaponItemInstance(inst) ? applySharpnessWear(inst, profile) : inst
            ))
          }
          const killed = animal.isDead()
          if (killed) playActionMeleeKill(worldAudio.playAt, animal.mesh.position)
          else playActionMeleeHit(worldAudio.playAt, animal.mesh.position)
          const label = ANIMAL_LABELS[animal.def.kind]
          if (killed) {
            toast.show(animalDeathToastLine(animal))
          } else {
            toast.show(critResult.critical ? `Trafienie krytyczne: ${label}!` : `Trafiono: ${label}`)
          }
        }
        // One attack commits to one yaw; the rest of the swing (and the next
        // request) is free to use live camera yaw again.
        attackYaw = null
      }

      // Ranged attack tick (plan 162) — same shape as the melee tick above:
      // lifecycle advance, then a single `fireReady` edge that spawns a
      // projectile. Candidate gathering is gated behind an actual reason to
      // pay for it (bow currently held, or an arrow already in flight after
      // a weapon switch) — see `collectRangedAnimalCandidates`'s own doc for
      // why it can't reuse `meleeCandidates` (`GAZE_RANGE` is far shorter
      // than any bow's range).
      // Fire is release-gated (press → draw, release → fire): `update()`
      // only ticks timers for a player draw and never itself produces
      // `fireReady` — that edge comes from `releaseDraw()`, called on the
      // frame `E`/LMB/mobile-E is released (shared `interactReleased` signal
      // across all three input sources, see `Keyboard.ts`/`MouseLook.ts`/
      // `createTouchControls.ts`).
      const interactReleased = keyboard.consumeInteractRelease()
      const wasDrawing = playerRanged.state() === 'draw'
      const releaseTick = interactReleased ? playerRanged.releaseDraw() : { fireReady: false, config: null }
      // An early release (held less than `drawTime`) cancels the shot back to
      // `idle` with no `fireReady` edge — cut the draw clip short instead of
      // letting it play out over a shot that never happened.
      if (interactReleased && wasDrawing && !releaseTick.fireReady) stopBowDrawSound()
      playerRanged.update(dt) // ticks release/recovery timers forward — no fire edge of its own for a player draw

      // One candidate gather per frame, shared by draw-time facing, the fire
      // resolve and the projectile tick below (plan 186 §1/§2) — replaces
      // three separate `collectRangedAnimalCandidates` calls that all read
      // the same settlements/fauna state within the same frame.
      const rangedActive = playerRanged.state() !== 'idle' || activeProjectiles.length > 0
      const rangedCandidates = rangedActive
        ? collectRangedAnimalCandidates(
            bundle.settlementsManager.getLoaded(),
            bundle.fauna,
            player.mesh.position,
            RANGED_CANDIDATE_RANGE,
          )
        : []
      // Committed aim direction for this frame (plan 186 §1) — see
      // `resolveRangedAimYaw`'s own doc. Read fresh at draw-time (for visual
      // facing) and again at fire time below, from the same live inputs, so
      // visual facing and the fired direction can never diverge
      // (`docs/plans/LOOSE-ENDS.md`'s melee-yaw entry called this out for
      // melee; closed here for ranged).
      const currentRangedAimYaw = (): number => resolveRangedAimYaw(
        rangedTargetId, rangedCandidates, player.mesh.position.x, player.mesh.position.z, mouseLook.state.yaw,
      )
      if (player.isDowned()) {
        playerRanged.reset()
        player.endRangedDraw()
        rangedTargetId = null
        stopBowDrawSound()
      } else if (playerRanged.state() === 'draw') {
        // Holds the aim-draw pose loop every frame while actually drawing —
        // idempotent, mirrors the melee tick's per-frame animation sync.
        player.beginRangedDraw()
        player.faceAimYaw(currentRangedAimYaw())
      } else if (playerRanged.state() === 'idle') {
        player.endRangedDraw()
      }
      // Soft-lock reticle screen position (reticle-positioning follow-up to
      // plan 186 §1) — reprojects the same `rangedTargetId`/`rangedCandidates`
      // aim resolves from, every frame the target may have moved. `null`
      // (no lock, or the lock is behind the camera) falls back to the HUD's
      // fixed Free Aim position — presentation only, never touches
      // `resolveRangedAimYaw()`/accuracy/the fired direction.
      const drawing = playerRanged.state() === 'draw'
      let aimTargetScreen: { x: number, y: number } | null = null
      if (drawing && rangedTargetId) {
        const locked = rangedCandidates.find((c) => c.id === rangedTargetId)
        if (locked) {
          const projected = projectToViewportFraction(
            locked.x, RANGED_RETICLE_TARGET_HEIGHT, locked.z, camera,
          )
          aimTargetScreen = projected ? clampToViewportMargin(projected) : null
        }
      }
      hud.setAiming(drawing, aimTargetScreen)
      if (releaseTick.fireReady && releaseTick.config) {
        const config = releaseTick.config
        const ammoKind = config.ammoKinds.find((k) => inventory.has(k, 1)) ?? null
        if (!ammoKind) {
          toast.show('Brak strzał w ekwipunku.', 'error')
        } else {
          stopBowDrawSound()
          playActionBowRelease(worldAudio.playAt, player.mesh.position)
          player.playRangedRelease(config.recovery)
          const aimYaw = currentRangedAimYaw()
          inventory.remove(ammoKind, 1)
          hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
          toast.show(`Zostało ${inventory.count(ammoKind)} strzał`)
          attackAttemptCounter++
          const archeryValue = player.skills.archery.value
          const accuracy = rangedAccuracy(config, archeryValue)
          const deviationRoll = rangedDeviationRoll('player', attackAttemptCounter)
          const { dirX, dirZ } = resolveRangedDirection(aimYaw, accuracy, deviationRoll)
          activeProjectiles.push({
            id: `proj:${attackAttemptCounter}`,
            sourceId: 'player',
            x: player.mesh.position.x,
            z: player.mesh.position.z,
            dirX,
            dirZ,
            speed: config.projectileSpeed,
            maxDistance: config.range,
            travelled: 0,
            damage: config.damage + (ARROW_DAMAGE_BONUS[ammoKind] ?? 0),
            criticalChance: config.criticalChance ?? 0,
            criticalMultiplier: config.criticalMultiplier ?? MELEE_CRITICAL_MULTIPLIER,
            attackKey: `ranged:${ammoKind}`,
            attempt: attackAttemptCounter,
            ammoKind,
          })
        }
        rangedTargetId = null
      }
      if (activeProjectiles.length > 0) {
        const nextProjectiles: Projectile[] = []
        for (const projectile of activeProjectiles) {
          const prevX = projectile.x
          const prevZ = projectile.z
          const expired = advanceProjectile(projectile, dt)
          const hitId = sweptProjectileHit(
            prevX, prevZ, projectile.x, projectile.z,
            rangedCandidates.map((c) => ({ id: c.id, x: c.x, z: c.z, alive: true })),
          )
          const hitCandidate = hitId ? rangedCandidates.find((c) => c.id === hitId) : undefined
          if (hitCandidate && !hitCandidate.animal.isDead()) {
            const animal = hitCandidate.animal
            const critResult = resolveCriticalHit(
              projectile.damage,
              projectile.criticalChance,
              projectile.criticalMultiplier,
              projectile.sourceId,
              projectile.attackKey,
              projectile.attempt,
            )
            animal.takeDamage(critResult.damage, 'player')
            awardSkillXp(player.skills, 'archery', SKILL_XP_AWARD.rangedHit)
            playerCombat.enter()
            playerCombat.noteActivity()
            playerCombat.setSoftLock(livingTargetIdForAnimal(animal.animalId))
            const killed = animal.isDead()
            if (killed) playActionMeleeKill(worldAudio.playAt, animal.mesh.position)
            else playActionMeleeHit(worldAudio.playAt, animal.mesh.position)
            const label = ANIMAL_LABELS[animal.def.kind]
            toast.show(killed
              ? animalDeathToastLine(animal)
              : critResult.critical ? `Trafienie krytyczne: ${label}!` : `Trafiono: ${label}`)
            continue
          }
          if (!expired) {
            nextProjectiles.push(projectile)
          } else {
            // Miss/expiry (plan 186 §2) — lands as an ordinary world pickup
            // through the existing `DroppedItems`/interaction path, never a
            // second arrow-recovery system. A hit always `continue`s above
            // before reaching here, so a shot is never both a hit and a drop.
            bundle.droppedItems.drop(projectile.ammoKind, projectile.x, projectile.z)
          }
        }
        activeProjectiles = nextProjectiles
      }

      playerCombat.update(dt)

      // A held bow's own range widens `[Tab]`/soft-lock acquisition beyond
      // melee-scale `COMBAT_TARGET_RANGE` — see `collectLivingCombatTargets`'s
      // own doc for why this is needed.
      const livingTargetRange = Math.max(COMBAT_TARGET_RANGE, isRangedTool(held) ? ITEM_CATALOG[held].ranged?.range ?? 0 : 0)
      const livingTargets = collectLivingCombatTargets(
        bundle.settlementsManager.getLoaded(),
        bundle.fauna,
        player.mesh.position,
        mouseLook.state.yaw,
        aimMode,
        playerMelee.recentTargetIds(),
        livingTargetRange,
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
      const rangedDrawProgress = playerRanged.state() === 'draw' ? playerRanged.phaseProgress() : null
      npcDialog.setPrompt(target ? `${target.promptLabel}${cycleHint}` : null, promptHighlighted, rangedDrawProgress)
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
            const fuelKind = FIRE_FUEL_KINDS.find((kind) => inventory.has(kind, 1))
            if (fuelKind && inventory.remove(fuelKind, 1)) {
              target.fire.addFuel()
              hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
              onInventoryChanged()
              toast.show(`Dołożono ${ITEM_DEFS[fuelKind].label} do ogniska.`)
            } else {
              toast.show('Potrzebujesz gałęzi lub belki, żeby je zapalić.', 'error')
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
        if (hasItemCapability(heldTool.held(), 'fishing')) {
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
      } else if (target?.kind === 'crop') {
        if (interactPressed) harvestCrop?.(target.id, target.cropId, target.stage, target.position.x, target.position.z)
      } else if (target?.kind === 'gardenPlot') {
        if (interactPressed) tidyGardenPlot?.(target.id)
      } else if (target?.kind === 'container') {
        if (interactPressed) openContainer?.(target.id)
        if (altInteractPressed) pickUpContainer?.(target.id)
      } else if (target?.kind === 'playerWell') {
        if (interactPressed) workOnWell?.(target.id)
      } else if (target?.kind === 'terrainPreparation') {
        if (interactPressed) resumeTerrainPreparationWork?.(target.id)
      } else if (target?.kind === 'item') {
        if (interactPressed || altInteractPressed) {
          if (!inventory.canAdd(target.item.kind)) {
            toast.show(inventoryFullToastText(inventory, target.item.kind), 'error')
          } else {
            const collected = collectItem(target.item, bundle.chunkManager, bundle.itemSpawners, bundle.droppedItems)
            if (collected) {
              // Plan 199 — a dropped instance-backed item carries its own
              // durability/sharpness; only mint a fresh default instance when
              // this pickup never had one (world-generated/spawner items).
              const restoredInstance = collected.instance
                ? Inventory.instancesFromJSON([collected.instance])[0] ?? null
                : null
              const acquiredInstance = restoredInstance ?? createAcquiredInstance(collected.kind)
              if (acquiredInstance) inventory.addInstance(acquiredInstance)
              else inventory.add(collected.kind, 1, dayNight.elapsedDays)
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
              const branchChance = TREE_BRANCH_CHANCE + (inventory.hasCapability('branch_trimming') ? KNIFE_BRANCH_BONUS : 0)
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
          } else if (isRangedTool(held) && !player.isDowned()) {
            // Same trigger UX as melee above: `[E]` over a gazed live animal
            // starts the draw; the actual hit/miss is resolved by the
            // in-flight projectile, independent of this gazed target.
            const config = ITEM_CATALOG[held].ranged
            if (config && !playerRanged.isDrawing()) {
              const hasAmmo = config.ammoKinds.some((k) => inventory.has(k, 1))
              if (!hasAmmo) {
                toast.show('Brak strzał w ekwipunku.', 'error')
              } else if (player.needs.stamina.current < config.staminaCost) {
                toast.show('Brak siły na strzał.', 'error')
              } else if (playerRanged.requestDraw(config, player.needs.stamina)) {
                playerCombat.enter()
                playerCombat.noteActivity()
                playerCombat.setSoftLock(livingTargetIdForAnimal(target.animal.animalId))
                rangedTargetId = livingTargetIdForAnimal(target.animal.animalId)
                player.faceToward(target.position.x, target.position.z)
                bowDrawSound = playActionBowDraw(worldAudio.playAtCancelable, player.mesh.position)
                player.beginRangedDraw()
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
          // Plan 199 — instance-backed kinds (traps/weapons) aren't tracked in
          // `counts`, so `remove()` always no-ops for them; drop one carried
          // instance (with its identity/condition) instead of silently
          // skipping the kind.
          let instance: SaveItemInstance | undefined
          if (isInstanceBackedKind(kind)) {
            const held = inventory.getInstances(kind)[0]
            if (!held) continue
            inventory.removeInstance(held.id)
            instance = toSaveItemInstance(held)
          } else if (!inventory.remove(kind, 1)) {
            continue
          }
          const angle = dropOffset * ((Math.PI * 2) / itemKinds.length)
          bundle.droppedItems.drop(
            kind,
            player.mesh.position.x + Math.cos(angle) * 0.6,
            player.mesh.position.z + Math.sin(angle) * 0.6,
            instance,
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
      // While a `timeSkip` is in flight, NPC/fauna/trap simulation is gated
      // off entirely below (`if (!timeSkip.isActive())`, plan 196) — not fed
      // an accelerated `worldDt`, not ticked at all, so nothing walks/steers/
      // fights/decays in hidden fast-forward underneath the label/filter.
      // `settlementsManager.resolveTimeSkip`/`fauna.resolveTimeSkip` (called
      // above on `skip.justFinished`) apply the skipped period's effect
      // exactly once, deterministically, instead of a live per-frame tick.
      // `dt` for the clock itself stays real — the sky/clock still has to
      // race ahead. Player needs (`worldDt`) instead keep ticking through
      // the skip, scaled by the same `dayNight.timeMultiplier` the clock
      // itself races ahead by, so Hunger/Thirst/Vigor — and the HUD bars
      // reflecting them — progress visibly across a rest/sleep skip instead
      // of jumping only once it finishes (plan 165 §5); this is a
      // deliberate, unchanged exception to the freeze-and-catch-up rule
      // above; see `NpcAgent.resolveTimeSkip` / `Fauna.resolveTimeSkip`
      // (`docs/plans/2026-08-22--196--arch--time-skip-simulation-semantics.md`).
      const worldDt = timeSkip.isActive() ? dt * dayNight.timeMultiplier : dt
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
      clouds.update(dt, climate.weather, player.mesh.position.x, player.mesh.position.z)
      weatherAudio.update(climate.weather)
      ambientAudio.update(
        dt,
        cachedSky.dayFactor,
        player.mesh.position.x,
        player.mesh.position.z,
      )
      hud.setTime(dayNight.timeOfDay)
      hud.setExp(questManager.getExp())
      // Plan 164 §9 — one authoritative load calc, recomputed every frame
      // (cheap: `totalWeight()`/`carriedWeightKg()` are small-map sums, same
      // order of cost as the HUD weight readout already updated on every
      // inventory mutation) rather than threaded through every mutation site.
      player.setEncumbrance(inventory.totalWeight() + bundle.placedContainers.carriedWeightKg(), inventory.maxWeight)
      withCategory(monitor, 'PHYSICS', () => { player.update(dt, dayNight.dayLengthSec) })
      // Hunger/thirst/vigor progress on `worldDt` (scaled during a time-skip,
      // see above) — stamina keeps ticking inside `player.update(dt)` on raw
      // `dt` (tied to sprint) regardless of any skip.
      tickPlayerNeeds(player.needs, worldDt, dayNight.dayLengthSec)
      if (!player.isDowned()) {
        tickPlayerStarvationDamage(player, player.needs, worldDt, heldTool.held(), mouseLook.state.yaw, dayNight.dayLengthSec, onPlayerDamaged)
        tickHealthRegen(player.needs, player.health, worldDt, dayNight.dayLengthSec)
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
        player.skills.archery.value,
        player.skills.archery.xp,
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
      colliderDebugView?.update(player.mesh.position.x, player.mesh.position.z, bundle.chunkManager.collidersNear)
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
      bundle.resourceDeposits.update(
        player.mesh.position.x,
        player.mesh.position.z,
        loaded.map((s) => ({ x: s.center.x, z: s.center.z })),
      )
      // NPC/fauna/trap simulation is gated off entirely during an active
      // time-skip (plan 196) — see the `worldDt` comment above. Nothing in
      // this block runs faster or slower than real time; it simply does not
      // run at all while `timeSkip.isActive()`, and `worldDt === dt` here in
      // every case it does run (the ternary above only ever diverges while a
      // skip is active), so `dt` is used directly to make that explicit.
      if (!timeSkip.isActive()) {
        const villages = loaded.map((s) => ({
          x: s.center.x,
          z: s.center.z,
          radius: villageSizeConfig(s.size).footprintRadius,
        }))
        const nearbyNpcCandidates = loaded.flatMap((s) =>
          s.npcs
            .filter((npc) => !npc.health.dead)
            .map((npc) => ({ id: npc.id, x: npc.mesh.position.x, z: npc.mesh.position.z })),
        )
        const nearbyHumanCount = countNearbyHumans(
          player.mesh.position.x,
          player.mesh.position.z,
          nearbyNpcCandidates,
        )
        // Bounded/local (plan 179 §7/§9/§10/§20): typically empty — only a
        // predator whose own throttled decision is currently `attack` (see
        // `AnimalAgent.isThreateningHuman()`) shows up here, never every
        // loaded animal. `combatTargetForAnimal` is the same 177 target seam
        // NPC defense uses, so a `defend` decision can hand it straight to
        // `beginCombat()` with no second animal lookup.
        const threateningAnimals = bundle.fauna.getAgents()
          .filter((a) => a.isThreateningHuman())
          .map((a) => ({ animalId: a.animalId, kind: a.def.kind, x: a.mesh.position.x, z: a.mesh.position.z, target: combatTargetForAnimal(a) }))
        withCategory(monitor, 'NPC', () => {
          bundle.settlementsManager.update(
            dt,
            player.mesh.position,
            mouseLook.state.yaw,
            dayNight.timeOfDay,
            dayFactor,
            litFires,
            villages,
            dayNight.dayLengthSec,
            threateningAnimals,
          )
        })
        withCategory(monitor, 'FAUNA', () => {
          bundle.fauna.update(
            dt,
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
                  onPlayerDamaged()
                },
              })
              if (dmg.enteredDowned) {
                playerMelee.reset()
                player.endMeleeAttack()
                player.setMeleeSwing(null)
                attackYaw = null
                playerRanged.reset()
                player.endRangedDraw()
                rangedTargetId = null
                stopBowDrawSound()
              }
            },
            {
              sneakValue: player.skills.sneak.value,
              sneakActive: player.skills.sneak.active,
              movement: player.movementState(),
            },
            nearbyNpcCandidates,
            (targetId, amount, attackerX, attackerZ) => {
              for (const settlement of loaded) {
                const target = settlement.npcs.find((npc) => npc.id === targetId)
                if (!target) continue
                target.applyIncomingCombatDamage({ amount, attackerX, attackerZ, attackerKey: 'fauna' })
                return
              }
            },
            (kind, x, z) => playAnimalAggroSound(kind, worldAudio.playAt, { x, z }),
          )
        })
        // Traps run inside the fauna pass's own cadence (plan 141 §11): the
        // system throttles itself and early-outs when nothing is armed, and
        // it reuses the agent list fauna just updated instead of a second
        // query — frozen alongside fauna during a skip for the same reason.
        bundle.placedTraps.update(dt, dayNight.elapsedDays, bundle.fauna.getAgents())
      }
      bundle.itemSpawners.update(dt, player.mesh.position, dayFactor)
      bundle.droppedItems.tick(dt)
      bundle.placedFires.update(dt)
      // Plan 176 §6/§20 — bounded to however many plots the player has
      // actually built (never a world-wide field scan); removal is a lazy
      // world-object mutation, not a per-frame maintenance tick.
      bundle.playerGardens.pruneDecayed(dayNight.elapsedDays)
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

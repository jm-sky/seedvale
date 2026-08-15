import { Clock, Fog } from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NpcAgent } from '../ai/NpcAgent'
import type { createAmbientAudio } from '../audio/createAmbientAudio'
import type { createWorldAudio } from '../audio/createWorldAudio'
import type { createHouseDoorTracker } from '../audio/doorSounds'
import type { createFireAudio } from '../audio/fireSounds'
import type { WeatherAudio } from '../audio/weatherSounds'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { TouchControls } from '../input/createTouchControls'
import type { createKeyboard } from '../input/Keyboard'
import type { HeldTool } from '../items/HeldTool'
import type { Inventory } from '../items/Inventory'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { QuestManager } from '../quests/QuestManager'
import type { PostProcessing } from '../render/createPostProcessing'
import type { VillageFire } from '../settlement/VillageFire'
import type { VueUi } from '../ui-vue/mount'
import type { BusyOverlay } from '../ui/createBusyOverlay'
import type { Hud } from '../ui/createHud'
import type { InventoryScreen } from '../ui/createInventoryScreen'
import type { Minimap, MinimapSettlement } from '../ui/createMinimap'
import type { NpcDialog } from '../ui/createNpcDialog'
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
import { playActionMeleeHit, playActionMeleeKill, playActionWell } from '../audio/actionSounds'
import { playAnimalSound } from '../audio/animalSounds'
import { playInventoryDrop, playInventoryPickUp } from '../audio/inventorySounds'
import { isDebugMode } from '../debug/debugMode'
import { ANIMAL_LABELS } from '../fauna/AnimalAgent'
import { WOLF_DEN_ID } from '../fauna/AnimalSpawner'
import { isMeleeTool, playerToolDamage } from '../fauna/faunaCombat'
import { countNearbyHumans } from '../fauna/predatorHumanDecision'
import { type createMouseLook, exitGamePointerLock } from '../input/MouseLook'
import { pickInGaze } from '../interaction/findInteractionTarget'
import { resolveInteraction } from '../interaction/resolveInteraction'
import { treeInspectionCanYieldBranch } from '../interaction/treeInspection'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { getMonitor, withCategory } from '../perf'
import {
  applyStarvationDamage,
  restoreNeedsFromSleep,
  tickPlayerNeeds,
} from '../player/PlayerNeeds'
import { villageSizeConfig } from '../settlement/families'
import { damageHealth } from '../shared/HealthState'
import { getHungerRatio } from '../shared/HungerState'
import { getStaminaRatio } from '../shared/StaminaState'
import { getThirstRatio } from '../shared/ThirstState'
import { getVigorRatio } from '../shared/VigorState'
import { skyParamsFromTime, tickDayNight } from '../world/dayNight'
import { updateFoliageWind } from '../world/foliageWind'
import { createWaterSource } from '../world/WaterSource'
import { tickClimate } from '../world/weather'
import { applyWeatherOverlay } from '../world/weatherVisuals'
import {
  buildDigTarget,
  buildInteractables,
  collectItem,
  GAZE_RANGE,
  INTERACT_MIN_DOT,
  INTERACT_RANGE,
  KNIFE_BRANCH_BONUS,
  TREE_BRANCH_CHANCE,
} from './interactables'
import { activeModal } from './modalState'
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'

type Highlightable = NpcAgent | AnimalAgent

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
  startGroundWork: (mode: 'dig' | 'level', x: number, z: number) => void
  /** Start the axe chop channel for a gaze-selected tree (plan 057). */
  startTreeChop: (treeId: string, x: number, z: number) => void
  /** Start the pickaxe mine channel for a gaze-selected ore deposit (plan 090). */
  startDepositMine: (depositId: string, x: number, z: number) => void
  /** Shovel-bury a dead animal corpse (busy channel). */
  startBuryCorpse: (animal: AnimalAgent) => void
  /** Knife-harvest raw_meat from a dead animal corpse (busy channel, plan 106). */
  startHarvestMeat?: (animal: AnimalAgent) => void
  /** Cook the first held recipe's input at a lit campfire (busy channel, plan 106 §6). */
  startCookAt?: (fire: VillageFire) => void
  /** Light an unlit campfire (busy channel, blurred). Adding fuel to an
   *  already-lit fire stays instant/inline — not routed through this. */
  startIgniteFire?: (fire: VillageFire) => void
  /** Instant drink from a well/lake `WaterSource` — restores thirst (plan 106 §4). */
  drinkFromWaterSource?: (source: WaterSource) => void
  /** Instant fill of a carried empty waterskin at a well/lake (plan 106 §4). */
  fillWaterskin?: () => void
  startTentRest: (id: string) => void
  packTent: (id: string) => void
  onInventoryChanged: () => void
  /** Reports this frame's simulate/render split (ms) to the debug GUI's
   *  Performance folder (perf review M1). */
  setFrameTiming: (simulateMs: number, renderMs: number) => void
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
    keyboard, mouseLook, touchControls, pauseMenu, npcDialog, questLog, vueUi, inventoryScreen,
    quickActions, timeSkip, timeSkipOverlay, busy, busyOverlay, restCamp, inventory, heldTool, toast, hud,
    questManager, ambientAudio, fireAudio, houseDoors, worldAudio, playerTorch, minimap, mapDiscovery, openQuestLog, openInventory,
    startGroundWork, startTreeChop, startDepositMine, startBuryCorpse, startHarvestMeat, startCookAt, startIgniteFire,
    drinkFromWaterSource, fillWaterskin, startTentRest, packTent, onInventoryChanged, setFrameTiming,
  } = deps

  renderer.shadowMap.autoUpdate = false

  const clock = new Clock()
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

  /** Currently gaze-highlighted NPC/animal, if any — tracked so we only toggle
   *  the CSS class on change instead of writing every frame. */
  let highlightedTarget: Highlightable | null = null
  /** Dedupes `?debug=1` house console spam while gazing at the same building. */
  let lastDebugHouseId: string | null = null
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
    const rawDt = clock.getDelta()
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
        // comment): a full night fully restores vigor/stamina on top of the
        // drain the skipped hours would otherwise apply.
        tickPlayerNeeds(player.needs, skip.hours * 3600)
        if (skip.fadeStrength === 1) restoreNeedsFromSleep(player.needs)
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
      busyOverlay.show(busyTick.label, busyTick.blurred)
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
      setHighlight(null)

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
        bundle.resourceDeposits,
        player.mesh.position,
        held,
      )
      // Ground-work (shovel soil / pickaxe rock) is a fallback, not a competing
      // candidate — only synthesized when nothing else is being gazed at.
      const target = pickInGaze(
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
      )
      npcDialog.setPrompt(target ? target.promptLabel : null)

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
      setHighlight(gazed?.agent ?? null)
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
        if (interactPressed) drinkFromWaterSource?.(target.source)
        if (altInteractPressed) fillWaterskin?.()
      } else if (target && interactPressed) {
        if (target.kind === 'item') {
          if (!inventory.canAdd(target.item.kind)) {
            toast.show('Ekwipunek jest za ciężki.', 'error')
          } else {
            const collected = collectItem(target.item, bundle.chunkManager, bundle.itemSpawners, bundle.droppedItems)
            if (collected) {
              inventory.add(collected.kind)
              playInventoryPickUp(worldAudio.playOnce)
              hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
              onInventoryChanged()
            }
          }
        } else if (target.kind === 'tree') {
          if (target.canHarvest) {
            startTreeChop(target.id, target.position.x, target.position.z)
          } else {
            const outcome = resolveInteraction(target, questManager)
            if (treeInspectionCanYieldBranch(target.stage)) {
              const branchChance = TREE_BRANCH_CHANCE + (inventory.has('knife', 1) ? KNIFE_BRANCH_BONUS : 0)
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
          if (isMeleeTool(held)) {
            const beforeDead = target.animal.isDead()
            target.animal.takeDamage(playerToolDamage(held), 'player')
            const killed = !beforeDead && target.animal.isDead()
            if (killed) playActionMeleeKill(worldAudio.playAt, target.position)
            else playActionMeleeHit(worldAudio.playAt, target.position)
            const label = ANIMAL_LABELS[target.animal.def.kind]
            if (killed) {
              const override = questManager.onInteractObjective({
                type: 'animal_died',
                animalId: target.animal.animalId,
              })
              const denOverride = bundle.fauna.isWolfDenCleared()
                ? questManager.onInteractObjective({ type: 'wolf_den_cleared', denId: WOLF_DEN_ID })
                : null
              toast.show(denOverride?.line ?? override?.line ?? `${label} pada.`)
            } else {
              toast.show(`Trafiono: ${label}`)
            }
          } else {
            const outcome = resolveInteraction(target, questManager)
            playAnimalSound(target.animal.def.kind, worldAudio.playAt, target.position)
            npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
          }
        } else {
          const outcome = resolveInteraction(target, questManager)
          npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
        }
      }
      if (keyboard.consumeQuestLog()) openQuestLog()
      if (keyboard.consumeInventory()) openInventory()
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
      applyStarvationDamage(player.needs, player.health, worldDt)
      hud.setPlayerNeeds({
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
      bundle.resourceDeposits.update(player.mesh.position.x, player.mesh.position.z)
      withCategory(monitor, 'FAUNA', () => {
        bundle.fauna.update(
          worldDt,
          player.mesh.position,
          dayNight.timeOfDay,
          litFires,
          villages,
          nearbyHumanCount,
          (amount) => damageHealth(player.health, amount),
        )
      })
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
    const renderStart = performance.now()
    renderer.info.reset()
    postProcessing.applyFrameBudget(lastRenderMs)
    withCategory(monitor, 'WATER', () => {
      bundle.ocean.renderMirror(renderer, scene, camera)
    })
    const mirrorDrawCalls = renderer.info.render.calls
    const mirrorTriangles = renderer.info.render.triangles
    // Shadow map once, against the beauty camera — not during the mirror
    // pass, which keeps `autoUpdate` off (plan 113 P1).
    renderer.shadowMap.needsUpdate = true
    postProcessing.updateGodRays(camera, sky.sunPosition, cachedSky.elev)
    withCategory(monitor, 'RENDER', () => {
      postProcessing.render()
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
    setFrameTiming(simulateMs, renderMs)
  }

  return {
    tick,
    resyncDayNight,
    forgetHighlight: () => { highlightedTarget = null },
  }
}

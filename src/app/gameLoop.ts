import { Clock, Fog } from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NpcAgent } from '../ai/NpcAgent'
import type { createAmbientAudio } from '../audio/createAmbientAudio'
import type { createWorldAudio } from '../audio/createWorldAudio'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { TouchControls } from '../input/createTouchControls'
import type { createKeyboard } from '../input/Keyboard'
import type { HeldTool } from '../items/HeldTool'
import type { Inventory } from '../items/Inventory'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { QuestManager } from '../quests/QuestManager'
import type { PostProcessing } from '../render/createPostProcessing'
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
import type { TimeSkip } from '../world/timeSkip'
import type { BusyAction } from './busyAction'
import type { WorldBundle } from './worldBundle'
import { playActionMeleeHit, playActionMeleeKill, playActionWell } from '../audio/actionSounds'
import { playAnimalSound } from '../audio/animalSounds'
import { playInventoryDrop, playInventoryPickUp } from '../audio/inventorySounds'
import { isDebugMode } from '../debug/debugMode'
import { ANIMAL_LABELS } from '../fauna/AnimalAgent'
import { isMeleeTool, playerToolDamage } from '../fauna/faunaCombat'
import { countNearbyHumans } from '../fauna/predatorHumanDecision'
import { type createMouseLook, exitGamePointerLock } from '../input/MouseLook'
import { pickInGaze } from '../interaction/findInteractionTarget'
import { resolveInteraction } from '../interaction/resolveInteraction'
import { treeInspectionCanYieldBranch } from '../interaction/treeInspection'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { damageHealth } from '../shared/HealthState'
import { skyParamsFromTime, tickDayNight } from '../world/dayNight'
import { updateFoliageWind } from '../world/foliageWind'
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
  sky: WorldSky,
  lights: WorldLights,
  scene: Scene,
  chunkManager: WorldBundle['chunkManager'],
  ocean: WorldBundle['ocean'],
): void {
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
  lights.sun.intensity = p.sunIntensity
  lights.ambient.intensity = p.ambientIntensity
  lights.hemi.intensity = p.hemiIntensity
  const fog = scene.fog
  if (fog instanceof Fog) {
    fog.color.setHex(p.fogColor)
    fog.near = p.fogNear
    fog.far = p.fogFar
  }
  chunkManager.setWaterDayNight(p.dayFactor)
  chunkManager.setGrassDayNight(p.dayFactor, sky.sunPosition)
  ocean.setDayNight(p.dayFactor, sky.sunPosition)
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
  inventory: Inventory
  heldTool: HeldTool
  toast: Toast
  hud: Hud
  questManager: QuestManager
  ambientAudio: ReturnType<typeof createAmbientAudio>
  worldAudio: ReturnType<typeof createWorldAudio>
  playerTorch: PlayerTorch
  minimap: Minimap
  openQuestLog: () => void
  openInventory: () => void
  startGroundWork: (mode: 'dig' | 'level', x: number, z: number) => void
  /** Start the axe chop channel for a gaze-selected tree (plan 057). */
  startTreeChop: (treeId: string, x: number, z: number) => void
  /** Shovel-bury a dead animal corpse (busy channel). */
  startBuryCorpse: (animal: AnimalAgent) => void
  onInventoryChanged: () => void
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
    keyboard, mouseLook, touchControls, pauseMenu, npcDialog, questLog, vueUi, inventoryScreen,
    quickActions, timeSkip, timeSkipOverlay, busy, busyOverlay, inventory, heldTool, toast, hud,
    questManager, ambientAudio, worldAudio, playerTorch, minimap, openQuestLog, openInventory,
    startGroundWork, startTreeChop, startBuryCorpse, onInventoryChanged,
  } = deps

  const clock = new Clock()
  let lastAppliedTimeOfDay = dayNight.timeOfDay
  /** EMA of instantaneous FPS; HUD text refreshes at most ~4×/s. */
  let fpsEma = 60
  let fpsHudAge = 0

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
    applyDayNight(dayNight.timeOfDay, sky, lights, scene, bundle.chunkManager, bundle.ocean)
    bundle.settlementsManager.setDayNight(1 - skyParamsFromTime(dayNight.timeOfDay).dayFactor)
    lastAppliedTimeOfDay = dayNight.timeOfDay
  }

  const tick = (): void => {
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
      timeSkipOverlay.show(skip.label, skip.fade)
      if (skip.justFinished) {
        timeSkipOverlay.hide()
        player.standUp()
        bundle.settlementsManager.resolveTimeSkip(skip.startTimeOfDay, skip.hours, dayNight.dayLengthSec)
      }
      keyboard.state.forward = false
      keyboard.state.backward = false
      keyboard.state.left = false
      keyboard.state.right = false
      keyboard.state.sprint = false
    }

    const busyTick = busy.tick(dt)
    if (busyTick) {
      busyOverlay.show(busyTick.label)
      if (busyTick.justFinished) busyOverlay.hide()
      keyboard.state.forward = false
      keyboard.state.backward = false
      keyboard.state.left = false
      keyboard.state.right = false
      keyboard.state.sprint = false
    }

    const modal = activeModal(pauseMenu, npcDialog, questLog, vueUi, inventoryScreen, quickActions, timeSkip, busy)
    touchControls?.setInputEnabled(modal === null && !timeSkip.isActive() && !busy.isActive())

    if (modal !== null) {
      // Every modal drops stale presses so they can't fire right after it
      // closes, and blocks the gaze highlight — only the per-modal reaction
      // to *which* key was pressed differs, in the switch below.
      const interactConsumed = keyboard.consumeInteract()
      keyboard.consumeAltInteract()
      const questLogConsumed = keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      const inventoryConsumed = keyboard.consumeInventory()
      const quickActionsConsumed = keyboard.consumeQuickActions()
      setHighlight(null)

      switch (modal) {
        case 'busy':
        case 'menu':
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
        player.mesh.position,
        held,
      )
      // The shovel's dig/level target is a fallback, not a competing candidate —
      // only synthesized when nothing else is being gazed at, and only while
      // the shovel is held (quick actions cover ownership without holding).
      const target = pickInGaze(
        interactables,
        player.mesh.position,
        mouseLook.state.yaw,
        INTERACT_RANGE,
        INTERACT_MIN_DOT,
      ) ?? buildDigTarget(
        player.mesh.position,
        mouseLook.state.yaw,
        held === 'shovel',
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
              touchControls?.setDropAvailable(!inventory.isEmpty())
              onInventoryChanged()
            }
          }
        } else if (target.kind === 'campfire') {
          const wasLit = target.fire.isLit()
          if (!wasLit && !inventory.has('firestarter', 1)) {
            toast.show('Potrzebujesz krzesiwa, żeby rozpalić ogień.', 'error')
          } else if (inventory.remove('branch', 1)) {
            if (wasLit) target.fire.addFuel()
            else target.fire.light()
            hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
            touchControls?.setDropAvailable(!inventory.isEmpty())
            onInventoryChanged()
            toast.show(wasLit ? 'Dołożono gałąź do ogniska.' : 'Ognisko zapłonęło.')
          } else {
            toast.show('Potrzebujesz gałęzi, żeby je zapalić.', 'error')
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
                touchControls?.setDropAvailable(!inventory.isEmpty())
                onInventoryChanged()
                toast.show('+1 Gałąź', 'pickup')
              }
            }
            npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
          }
        } else if (target.kind === 'corpse') {
          startBuryCorpse(target.animal)
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
              toast.show(`${label} pada.`)
            } else {
              toast.show(`Trafiono: ${label}`)
            }
          } else {
            const outcome = resolveInteraction(target, questManager)
            playAnimalSound(target.animal.def.kind, worldAudio.playAt, target.position)
            npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
          }
        } else if (target.kind === 'well') {
          const outcome = resolveInteraction(target, questManager)
          playActionWell(worldAudio.playAt, target.position)
          npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
        } else {
          const outcome = resolveInteraction(target, questManager)
          npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
        }
      }
      if (keyboard.consumeQuestLog()) openQuestLog()
      if (keyboard.consumeInventory()) openInventory()
      if (keyboard.consumeQuickActions()) quickActions.toggle()
      if (keyboard.consumeMinimap()) minimap.toggle()
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
          touchControls?.setDropAvailable(!inventory.isEmpty())
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
      !vueUi.isNotesOpen()
    ) {
      for (const s of bundle.settlementsManager.getLoaded()) {
        for (const npc of s.npcs) {
          npc.setQuestMarker(questManager.labelMarker(npc.name))
        }
      }
      for (const spawner of bundle.fauna.getSpawners()) {
        bundle.fauna.setSpawnerMarker(spawner.type, questManager.spawnerMarker(spawner.type))
      }
      // While a `timeSkip` is in flight, NPCs/fauna freeze instead of
      // continuing to walk/steer in real time underneath the label/filter —
      // `NpcAgent.resolveTimeSkip` (called above on `skip.justFinished`)
      // catches them up to the new schedule/needs/position in one shot, so
      // nothing is lost by not ticking them meanwhile. `dt` below (for the
      // clock itself) stays real — the sky/clock still has to race ahead.
      const worldDt = timeSkip.isActive() ? 0 : dt
      tickDayNight(dayNight, dt)
      if (
        dayNight.enabled &&
        timeOfDayDelta(dayNight.timeOfDay, lastAppliedTimeOfDay) >= DAY_NIGHT_APPLY_THRESHOLD
      ) {
        resyncDayNight()
      }
      ambientAudio.update(
        dt,
        skyParamsFromTime(dayNight.timeOfDay).dayFactor,
        player.mesh.position.x,
        player.mesh.position.z,
      )
      hud.setTime(dayNight.timeOfDay)
      hud.setExp(questManager.getExp())
      player.update(dt)
      bundle.chunkManager.update(player.mesh.position.x, player.mesh.position.z)
      lights.follow(player.mesh.position.x, player.mesh.position.z)
      bundle.ocean.follow(player.mesh.position.x, player.mesh.position.z)
      // Computed before `settlementsManager.update` (not after, as before
      // livestock existed) so its per-settlement livestock `update()` calls
      // can also use them — neither depends on `update()`'s effect this same
      // frame (fire-lit state only changes via `setDayNight`, not `update`).
      const dayFactor = skyParamsFromTime(dayNight.timeOfDay).dayFactor
      const litFires: { x: number, z: number }[] = [
        ...bundle.settlementsManager.getLoaded().flatMap((s) => (s.fire?.isLit() ? [s.fire.position] : [])),
        ...bundle.placedFires.list().filter((f) => f.fire.isLit()).map((f) => f.fire.position),
      ]
      // Portable torch counts as a fire source for fauna fear (plan 056 / 050).
      if (playerTorch.isLit()) {
        litFires.push({ x: player.mesh.position.x, z: player.mesh.position.z })
      }
      const villages = bundle.settlementsManager.getLoaded().map((s) => ({ x: s.center.x, z: s.center.z }))
      const nearbyHumanCount = countNearbyHumans(
        player.mesh.position.x,
        player.mesh.position.z,
        bundle.settlementsManager.getLoaded().flatMap((s) =>
          s.npcs
            .filter((npc) => !npc.health.dead)
            .map((npc) => ({ x: npc.mesh.position.x, z: npc.mesh.position.z })),
        ),
      )
      bundle.settlementsManager.update(
        worldDt,
        player.mesh.position,
        mouseLook.state.yaw,
        dayNight.timeOfDay,
        dayFactor,
        litFires,
        villages,
      )
      bundle.resourceDeposits.update(player.mesh.position.x, player.mesh.position.z)
      bundle.fauna.update(
        worldDt,
        player.mesh.position,
        dayNight.timeOfDay,
        litFires,
        villages,
        nearbyHumanCount,
        (amount) => damageHealth(player.health, amount),
      )
      bundle.itemSpawners.update(dt, player.mesh.position, dayFactor)
      bundle.placedFires.update(dt)
      playerTorch.update(dt)
      bundle.chunkManager.tickWater(dt)
      bundle.chunkManager.tickGrass(dt)
      updateFoliageWind(dt)
      bundle.ocean.update(dt)
      worldAudio.update(dt)
      minimap.update(
        player.mesh.position,
        bundle.settlementsManager
          .getLoaded()
          .map((s): MinimapSettlement => ({ position: s.center, npcs: s.npcs, name: s.name })),
        mouseLook.state.yaw,
      )
    }
    postProcessing.updateGodRays(camera, sky.sunPosition, skyParamsFromTime(dayNight.timeOfDay).elev)
    postProcessing.render()
    labelRenderer.render(scene, camera)
  }

  return {
    tick,
    resyncDayNight,
    forgetHighlight: () => { highlightedTarget = null },
  }
}

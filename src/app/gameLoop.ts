import { Clock, Fog } from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NpcAgent } from '../ai/NpcAgent'
import type { createAmbientAudio } from '../audio/createAmbientAudio'
import type { createWorldAudio } from '../audio/createWorldAudio'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { TouchControls } from '../input/createTouchControls'
import type { createKeyboard } from '../input/Keyboard'
import type { createMouseLook } from '../input/MouseLook'
import type { Inventory } from '../items/Inventory'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { QuestManager } from '../quests/QuestManager'
import type { PostProcessing } from '../render/createPostProcessing'
import type { VueUi } from '../ui-vue/mount'
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
import type { WorldBundle } from './worldBundle'
import { pickInGaze } from '../interaction/findInteractionTarget'
import { resolveInteraction } from '../interaction/resolveInteraction'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { DIG_RADIUS } from '../terrain/dig'
import { skyParamsFromTime, tickDayNight } from '../world/dayNight'
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
  chunkManager.setGrassDayNight(p.dayFactor)
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
  inventory: Inventory
  toast: Toast
  hud: Hud
  questManager: QuestManager
  ambientAudio: ReturnType<typeof createAmbientAudio>
  worldAudio: ReturnType<typeof createWorldAudio>
  playerTorch: PlayerTorch
  minimap: Minimap
  openQuestLog: () => void
  openInventory: () => void
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
    quickActions, timeSkip, timeSkipOverlay, inventory, toast, hud, questManager, ambientAudio,
    worldAudio, playerTorch, minimap, openQuestLog, openInventory,
  } = deps

  const clock = new Clock()
  let lastAppliedTimeOfDay = dayNight.timeOfDay

  /** Currently gaze-highlighted NPC/animal, if any — tracked so we only toggle
   *  the CSS class on change instead of writing every frame. */
  let highlightedTarget: Highlightable | null = null
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
    const dt = Math.min(clock.getDelta(), 0.05)

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
      }
      keyboard.state.forward = false
      keyboard.state.backward = false
      keyboard.state.left = false
      keyboard.state.right = false
      keyboard.state.sprint = false
    }

    const modal = activeModal(pauseMenu, npcDialog, questLog, vueUi, inventoryScreen, quickActions, timeSkip)
    touchControls?.setInputEnabled(modal === null && !timeSkip.isActive())

    if (modal !== null) {
      // Every modal drops stale presses so they can't fire right after it
      // closes, and blocks the gaze highlight — only the per-modal reaction
      // to *which* key was pressed differs, in the switch below.
      const interactConsumed = keyboard.consumeInteract()
      const questLogConsumed = keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      const inventoryConsumed = keyboard.consumeInventory()
      setHighlight(null)

      switch (modal) {
        case 'inventory':
          if (inventoryConsumed) inventoryScreen.close()
          break
        case 'menu':
        case 'notes':
        case 'npcDialogueMenu':
        case 'quickActions':
        case 'timeSkip':
        case 'villagers':
        case 'worldConfig':
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
      }
    } else {
      const interactables = buildInteractables(
        bundle.settlementsManager.getLoaded(),
        bundle.fauna,
        bundle.chunkManager,
        bundle.itemSpawners,
        bundle.droppedItems,
        bundle.placedFires,
        player.mesh.position,
      )
      // The shovel's dig target is a fallback, not a competing candidate — only
      // synthesized when nothing else is being gazed at, so it can never
      // outcompete a real interactable the player is glancing near (see
      // `buildDigTarget`'s doc comment).
      const target = pickInGaze(
        interactables,
        player.mesh.position,
        mouseLook.state.yaw,
        INTERACT_RANGE,
        INTERACT_MIN_DOT,
      ) ?? buildDigTarget(player.mesh.position, mouseLook.state.yaw, inventory.has('shovel', 1), bundle.chunkManager)
      npcDialog.setPrompt(target ? target.promptLabel : null)

      const gazeCandidates: { position: { x: number, z: number }, agent: Highlightable }[] = []
      for (const item of interactables) {
        if (item.kind === 'npc') gazeCandidates.push({ position: item.position, agent: item.npc })
        else if (item.kind === 'animal') gazeCandidates.push({ position: item.position, agent: item.animal })
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
      if (target && interactPressed) {
        if (target.kind === 'item') {
          if (!inventory.canAdd(target.item.kind)) {
            toast.show('Ekwipunek jest za ciężki.', 'error')
          } else {
            const collected = collectItem(target.item, bundle.chunkManager, bundle.itemSpawners, bundle.droppedItems)
            if (collected) {
              inventory.add(collected.kind)
              hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
              touchControls?.setDropAvailable(!inventory.isEmpty())
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
            toast.show(wasLit ? 'Dołożono gałąź do ogniska.' : 'Ognisko zapłonęło.')
          } else {
            toast.show('Potrzebujesz gałęzi, żeby je zapalić.', 'error')
          }
        } else if (target.kind === 'tree') {
          const outcome = resolveInteraction(target, questManager)
          const branchChance = TREE_BRANCH_CHANCE + (inventory.has('knife', 1) ? KNIFE_BRANCH_BONUS : 0)
          if (Math.random() < branchChance && inventory.canAdd('branch')) {
            inventory.add('branch')
            hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
            touchControls?.setDropAvailable(!inventory.isEmpty())
            toast.show('+1 Gałąź', 'pickup')
          }
          npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
        } else if (target.kind === 'npc') {
          // Buttons need a visible cursor — same pointer-lock release the
          // pause menu already does on open (createPauseMenu's onPause).
          if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
          vueUi.openNpcDialogueMenu(target.npc, target.settlement, questManager, dayNight.timeOfDay)
        } else if (target.kind === 'dig') {
          // `target.profile` was already resolved when this target was
          // synthesized this same frame (`buildDigTarget`) — no need to
          // re-classify the surface here.
          bundle.chunkManager.modifyTerrain(target.position.x, target.position.z, DIG_RADIUS, target.profile.depth)
          if (Math.random() < target.profile.stoneChance) {
            if (inventory.canAdd('stone')) {
              inventory.add('stone')
              hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
              touchControls?.setDropAvailable(!inventory.isEmpty())
              toast.show('+1 Kamień', 'pickup')
            } else {
              toast.show('Ekwipunek jest za ciężki na kamień.', 'error')
            }
          } else {
            toast.show('Wykopano dołek.')
          }
        } else {
          const outcome = resolveInteraction(target, questManager)
          npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
        }
      }
      if (keyboard.consumeQuestLog()) openQuestLog()
      if (keyboard.consumeInventory()) openInventory()
      if (keyboard.consumeQuickActions()) quickActions.toggle()
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
          hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
          touchControls?.setDropAvailable(!inventory.isEmpty())
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
      const litFires = [
        ...bundle.settlementsManager.getLoaded().flatMap((s) => (s.fire?.isLit() ? [s.fire.position] : [])),
        ...bundle.placedFires.list().filter((f) => f.fire.isLit()).map((f) => f.fire.position),
      ]
      const villages = bundle.settlementsManager.getLoaded().map((s) => ({ x: s.center.x, z: s.center.z }))
      bundle.settlementsManager.update(
        dt,
        player.mesh.position,
        mouseLook.state.yaw,
        dayNight.timeOfDay,
        dayFactor,
        litFires,
        villages,
      )
      bundle.resourceDeposits.update(player.mesh.position.x, player.mesh.position.z)
      bundle.fauna.update(dt, player.mesh.position, dayNight.timeOfDay, litFires, villages)
      bundle.itemSpawners.update(dt, player.mesh.position, dayFactor)
      bundle.placedFires.update(dt)
      playerTorch.update(dt)
      bundle.chunkManager.tickWater(dt)
      bundle.chunkManager.tickGrass(dt)
      bundle.ocean.update(dt)
      worldAudio.update(dt)
      minimap.update(
        player.mesh.position,
        bundle.settlementsManager
          .getLoaded()
          .map((s): MinimapSettlement => ({ position: s.center, npcs: s.npcs, name: s.name })),
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

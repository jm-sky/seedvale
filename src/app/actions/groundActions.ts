import { playActionChop, playActionDig, playActionMine } from '../../audio/actionSounds'
import { playInventoryPickUp } from '../../audio/inventorySounds'
import { isChopTool } from '../../items/itemCatalog'
import { ITEM_DEFS } from '../../items/items'
import { MINE_DURATION_SEC, yieldForOre } from '../../terrain/depositMining'
import { canLevelAt, DIG_DURATION_SEC, getDigProfileAt, getRockDigProfileAt, isRockGround } from '../../terrain/dig'
import { applyDigAt, applyLevelAt } from '../../terrain/digAction'
import { advanceWorldTreeHarvest, CHOP_DURATION_SEC } from '../../world/treeHarvest'
import { isChoppableStage, yieldForChopStage } from '../../world/treeLifecycle'
import { DIG_REACH } from '../interactables'
import { isActionBlocked, isChannelBusy, type PlayerActionContext } from './actionContext'

/** Terrain/resource extraction actions: shovel dig + level, their pickaxe
 *  counterparts, the multi-stage tree chop and ore-deposit mining. They share
 *  one shape — validate tool/target, open a `busy` channel, then apply the
 *  world mutation and the inventory/HUD sync on completion. */
export type GroundActions = {
  /** The ground point the player is currently aiming at, used by the Quick
   *  Actions dig/level entries (the gaze-picked target comes from
   *  `app/interactables.ts` instead). */
  aimGroundPoint: () => { x: number, z: number }
  startDigAt: (x: number, z: number) => void
  startPickaxeDigAt: (x: number, z: number) => void
  startLevelAt: (x: number, z: number) => void
  startPickaxeLevelAt: (x: number, z: number) => void
  startTreeChop: (treeId: string, x: number, z: number) => void
  startDepositMine: (depositId: string, x: number, z: number) => void
}

export function createGroundActions(ctx: PlayerActionContext): GroundActions {
  const { bundle, player, inventory, heldTool, hud, toast, busy, dayNight, mouseLook, worldAudio } = ctx

  const digFeedback = () => ({
    inventory,
    droppedItems: bundle.droppedItems,
    toast,
    hud,
    playOnce: worldAudio.playOnce,
  })

  const aimGroundPoint = (): { x: number, z: number } => ({
    x: player.mesh.position.x - Math.sin(mouseLook.state.yaw) * DIG_REACH,
    z: player.mesh.position.z - Math.cos(mouseLook.state.yaw) * DIG_REACH,
  })

  const startDigAt = (x: number, z: number): void => {
    if (!inventory.has('shovel', 1) || isActionBlocked(ctx)) return
    const profile = getDigProfileAt(x, z, bundle.chunkManager)
    if (!profile) {
      toast.show('Tu nie da się kopać.', 'error')
      return
    }
    playActionDig(worldAudio.playOnce)
    busy.start(DIG_DURATION_SEC, 'Kopanie…', () => {
      applyDigAt(bundle.chunkManager, x, z, profile, digFeedback())
      ctx.syncQuickActionAvailability()
    })
  }

  const startPickaxeDigAt = (x: number, z: number): void => {
    if (heldTool.held() !== 'pickaxe' || isActionBlocked(ctx)) return
    const profile = getRockDigProfileAt(x, z, bundle.chunkManager)
    if (!profile) {
      toast.show('Tu nie da się kopać kilofem.', 'error')
      return
    }
    playActionMine(worldAudio.playAt, { x, z })
    busy.start(DIG_DURATION_SEC, 'Kucie…', () => {
      applyDigAt(bundle.chunkManager, x, z, profile, digFeedback())
      ctx.syncQuickActionAvailability()
    })
  }

  const startLevelAt = (x: number, z: number): void => {
    if (!inventory.has('shovel', 1) || isActionBlocked(ctx)) return
    if (isRockGround(x, z, bundle.chunkManager)) {
      toast.show('Łopata nie bierze skały.', 'error')
      return
    }
    if (!canLevelAt(x, z, bundle.chunkManager)) {
      toast.show('Nie ma tu czego wyrównać.', 'error')
      return
    }
    busy.start(DIG_DURATION_SEC, 'Wyrównywanie…', () => {
      applyLevelAt(bundle.chunkManager, x, z, toast)
    })
  }

  const startPickaxeLevelAt = (x: number, z: number): void => {
    if (heldTool.held() !== 'pickaxe' || isActionBlocked(ctx)) return
    if (!isRockGround(x, z, bundle.chunkManager) || !canLevelAt(x, z, bundle.chunkManager)) {
      toast.show('Nie ma tu czego wyrównać.', 'error')
      return
    }
    busy.start(DIG_DURATION_SEC, 'Wyrównywanie…', () => {
      applyLevelAt(bundle.chunkManager, x, z, toast)
    })
  }

  const startTreeChop = (treeId: string, x: number, z: number): void => {
    if (!isChopTool(heldTool.held()) || isChannelBusy(ctx)) return
    // Pre-check choppability without mutating — advanceHarvest is the authority.
    const nearby = bundle.chunkManager.getNearbyTrees({ x, z }, 0.5)
    const target = nearby.find((t) => t.id === treeId)
    if (!target || !isChoppableStage(target.stage)) {
      toast.show('To drzewo nie nadaje się do ścięcia.', 'error')
      return
    }
    const stepYield = yieldForChopStage(target.stage)
    if (!stepYield || !inventory.canAdd(stepYield.kind, stepYield.count)) {
      toast.show('Ekwipunek jest za ciężki.', 'error')
      return
    }
    const busyLabel =
      target.stage === 'mature' || target.stage === 'old'
        ? 'Oczyszczanie…'
        : target.stage === 'limbed'
          ? 'Ścinanie…'
          : 'Rąbanie…'
    playActionChop(worldAudio.playAt, { x, z })
    busy.start(CHOP_DURATION_SEC, busyLabel, () => {
      if (!inventory.canAdd(stepYield.kind, stepYield.count)) {
        toast.show('Ekwipunek jest za ciężki.', 'error')
        return
      }
      const landmark = bundle.settlementsManager
        .getLoaded()
        .flatMap((s) => s.landmarks.trees)
        .find((t) => t.id === treeId)
      const result = advanceWorldTreeHarvest(
        ctx.getTreeLifecycle(),
        treeId,
        dayNight.elapsedDays,
        bundle.chunkManager.sampleTreeEnv(x, z),
        landmark
          ? { landmark }
          : { refreshChunkVisual: (id) => bundle.chunkManager.refreshTreeVisual(id) },
      )
      if (!result.ok) {
        toast.show(
          result.reason === 'not-choppable' || result.reason === 'already-harvested'
            ? 'To drzewo nie nadaje się do ścięcia.'
            : 'Nie udało się ściąć drzewa.',
          'error',
        )
        return
      }
      inventory.add(result.yield.kind, result.yield.count)
      playInventoryPickUp(worldAudio.playOnce)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      heldTool.syncWithInventory()
      ctx.syncHeldHud()
      ctx.syncQuickActionAvailability()
      toast.show(`+${result.yield.count} Gałąź`, 'pickup')
    })
  }

  const startDepositMine = (depositId: string, x: number, z: number): void => {
    if (heldTool.held() !== 'pickaxe' || isActionBlocked(ctx)) return
    const target = bundle.resourceDeposits.queryNearest(x, z, 0.75)
    if (!target || target.id !== depositId || target.remaining <= 0) {
      toast.show('Tu nie ma już czego wydobywać.', 'error')
      return
    }
    const stepYield = yieldForOre(target.type)
    if (!inventory.canAdd(stepYield.kind, stepYield.count)) {
      toast.show('Ekwipunek jest za ciężki.', 'error')
      return
    }
    playActionMine(worldAudio.playAt, { x, z })
    busy.start(MINE_DURATION_SEC, 'Wydobywanie…', () => {
      if (!inventory.canAdd(stepYield.kind, stepYield.count)) {
        toast.show('Ekwipunek jest za ciężki.', 'error')
        return
      }
      const result = bundle.resourceDeposits.mine(depositId)
      if (!result.ok) {
        toast.show('Tu nie ma już czego wydobywać.', 'error')
        return
      }
      inventory.add(result.yield.kind, result.yield.count)
      playInventoryPickUp(worldAudio.playOnce)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      heldTool.syncWithInventory()
      ctx.syncHeldHud()
      toast.show(`+${result.yield.count} ${ITEM_DEFS[result.yield.kind].label}`, 'pickup')
    })
  }

  return {
    aimGroundPoint,
    startDigAt,
    startPickaxeDigAt,
    startLevelAt,
    startPickaxeLevelAt,
    startTreeChop,
    startDepositMine,
  }
}

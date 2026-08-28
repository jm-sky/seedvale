import type { ItemKind } from '../../items/items'
import { playActionChop, playActionDig, playActionMine } from '../../audio/actionSounds'
import { playInventoryPickUp } from '../../audio/inventorySounds'
import { inventoryFullToastText } from '../../items/Inventory'
import { hasItemCapability } from '../../items/itemCatalog'
import { ITEM_DEFS } from '../../items/items'
import { BUSY_ACTION_STAMINA_COST_PER_SEC } from '../../player/PlayerNeeds'
import { HIDDEN_TREASURE_MARKER_COUNT, hiddenTreasureDigHit } from '../../settlement/hiddenTreasure'
import { MINE_DURATION_SEC, yieldForOre } from '../../terrain/depositMining'
import { DIG_DURATION_SEC, getDigProfileAt, getRockDigProfileAt } from '../../terrain/dig'
import { applyDigAt, applyLevelAt, applyMoundAt } from '../../terrain/digAction'
import { advanceWorldTreeHarvest, CHOP_DURATION_SEC } from '../../world/treeHarvest'
import { bonusYieldForChopStage, isChoppableStage, yieldForChopStage } from '../../world/treeLifecycle'
import { DIG_REACH } from '../interactables'
import { isActionBlocked, isChannelBusy, type PlayerActionContext } from './actionContext'

/** Hidden-treasure reward (quick task) — ground drop is the buried loot's
 *  visual reveal; kept as a `chest` (existing container mechanism) rather
 *  than ~250 individual dropped coin meshes, which `droppedItems` was never
 *  meant to spawn at that volume (see `CLAUDE.md`'s performance rules). */
const HIDDEN_TREASURE_COIN_MIN = 200
const HIDDEN_TREASURE_COIN_MAX = 300
const HIDDEN_TREASURE_SWORD_KINDS: readonly ItemKind[] = [
  'obsidian_sword',
  'damascus_short_sword',
  'damascus_long_sword',
]

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
  /** "Zrób górkę" (plan `world-terrain-002` §1) — inverse of `startDigAt`. */
  startMoundAt: (x: number, z: number) => void
  startTreeChop: (treeId: string, x: number, z: number) => void
  startDepositMine: (depositId: string, x: number, z: number) => void
  /** Clears the in-session hidden-treasure dig progress (New Game only).
   *  A discovered treasure's own one-shot flag lives in `worldFlags`.
   */
  resetTreasureProgress: () => void
}

export type GroundActionsDeps = {
  /** Same persisted one-shot bag `inventoryWiring.ts`'s guard-sword gift
   *  uses — `hiddenTreasureFound` blocks a second reward chest after reload. */
  worldFlags: { hiddenTreasureFound: boolean }
}

export function createGroundActions(ctx: PlayerActionContext, deps: GroundActionsDeps): GroundActions {
  const { bundle, player, inventory, heldTool, hud, toast, busy, dayNight, mouseLook, worldAudio } = ctx
  const { worldFlags } = deps

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

  // Hidden-treasure dig progress (quick task) — successful digs in the
  // hidden-treasure area during this session.
  let hiddenTreasureDigCount = 0

  const checkHiddenTreasureDig = (x: number, z: number): void => {
    if (worldFlags.hiddenTreasureFound) return
    const markers = bundle.settlementsManager.home?.landmarks.hiddenTreasureMarkers

    if (!markers || markers.length === 0) return

    const hitIndex = hiddenTreasureDigHit(markers, x, z)

    if (hitIndex === -1) return

    hiddenTreasureDigCount++

    if (hiddenTreasureDigCount < HIDDEN_TREASURE_MARKER_COUNT) return

    worldFlags.hiddenTreasureFound = true
    const cx = markers.reduce((sum, m) => sum + m.x, 0) / markers.length
    const cz = markers.reduce((sum, m) => sum + m.z, 0) / markers.length
    const record = bundle.placedContainers.place('chest', cx, cz, mouseLook.state.yaw)
    const coinCount = HIDDEN_TREASURE_COIN_MIN + Math.floor(
      Math.random() * (HIDDEN_TREASURE_COIN_MAX - HIDDEN_TREASURE_COIN_MIN + 1),
    )
    const swordKind = HIDDEN_TREASURE_SWORD_KINDS[Math.floor(Math.random() * HIDDEN_TREASURE_SWORD_KINDS.length)]!
    // Sword first, so it always claims its space before coins fill the rest
    // of the chest's gabarite capacity (`items/container.ts` — 24 units,
    // never a "whole stack is one slot" exemption). Coins beyond that don't
    // fit physically in one chest; the remainder goes straight to the player
    // the same way a quest reward that overflows the player's own inventory
    // already does (`grantItem` — spills any leftover as individual ground
    // drops rather than losing it).
    bundle.placedContainers.deposit(record.id, swordKind, 1)
    const depositedCoins = bundle.placedContainers.deposit(record.id, 'coin', coinCount)
    const remainingCoins = coinCount - depositedCoins
    if (remainingCoins > 0) ctx.grantItem('coin', remainingCoins)
    toast.show('Odkopano ukryty skarb!', 'pickup')
  }

  const startDigAt = (x: number, z: number): void => {
    if (!inventory.hasCapability('soil_digging') || isActionBlocked(ctx)) return
    const profile = getDigProfileAt(x, z, bundle.chunkManager)
    if (!profile) {
      toast.show('Tu nie da się kopać.', 'error')
      return
    }
    playActionDig(worldAudio.playOnce)
    busy.start(DIG_DURATION_SEC, 'Kopanie…', () => {
      applyDigAt(bundle.chunkManager, x, z, profile, digFeedback())
      checkHiddenTreasureDig(x, z)
      ctx.syncQuickActionAvailability()
    }, { staminaCostPerSec: BUSY_ACTION_STAMINA_COST_PER_SEC })
  }

  const startPickaxeDigAt = (x: number, z: number): void => {
    if (!hasItemCapability(heldTool.held(), 'rock_mining') || isActionBlocked(ctx)) return
    const profile = getRockDigProfileAt(x, z, bundle.chunkManager)
    if (!profile) {
      toast.show('Tu nie da się kopać kilofem.', 'error')
      return
    }
    playActionMine(worldAudio.playAt, { x, z })
    busy.start(DIG_DURATION_SEC, 'Kucie…', () => {
      applyDigAt(bundle.chunkManager, x, z, profile, digFeedback())
      ctx.syncQuickActionAvailability()
    }, { staminaCostPerSec: BUSY_ACTION_STAMINA_COST_PER_SEC })
  }

  const startLevelAt = (x: number, z: number): void => {
    if (!inventory.hasCapability('soil_digging') || isActionBlocked(ctx)) return
    if (!getDigProfileAt(x, z, bundle.chunkManager)) {
      toast.show('Nie ma tu czego wyrównać.', 'error')
      return
    }
    busy.start(DIG_DURATION_SEC, 'Wyrównywanie…', () => {
      applyLevelAt(bundle.chunkManager, x, z, toast)
    }, { staminaCostPerSec: BUSY_ACTION_STAMINA_COST_PER_SEC })
  }

  const startPickaxeLevelAt = (x: number, z: number): void => {
    if (!hasItemCapability(heldTool.held(), 'rock_mining') || isActionBlocked(ctx)) return
    if (!getRockDigProfileAt(x, z, bundle.chunkManager)) {
      toast.show('Nie ma tu czego wyrównać.', 'error')
      return
    }
    busy.start(DIG_DURATION_SEC, 'Wyrównywanie…', () => {
      applyLevelAt(bundle.chunkManager, x, z, toast)
    }, { staminaCostPerSec: BUSY_ACTION_STAMINA_COST_PER_SEC })
  }

  /** "Zrób górkę" (plan `world-terrain-002` §1) — inverse of `startDigAt`:
   *  same shovel/rock/water eligibility, same busy-channel shape, but raises
   *  instead of lowering. */
  const startMoundAt = (x: number, z: number): void => {
    if (!inventory.hasCapability('soil_digging') || isActionBlocked(ctx)) return
    const profile = getDigProfileAt(x, z, bundle.chunkManager)
    if (!profile) {
      toast.show('Tu nie da się usypać górki.', 'error')
      return
    }
    playActionDig(worldAudio.playOnce)
    busy.start(DIG_DURATION_SEC, 'Usypywanie…', () => {
      applyMoundAt(bundle.chunkManager, x, z, profile.depth, toast)
    }, { staminaCostPerSec: BUSY_ACTION_STAMINA_COST_PER_SEC })
  }

  const startTreeChop = (treeId: string, x: number, z: number): void => {
    if (!hasItemCapability(heldTool.held(), 'wood_chopping') || isChannelBusy(ctx)) return
    // Pre-check choppability without mutating — advanceHarvest is the authority.
    const nearby = bundle.chunkManager.getNearbyTrees({ x, z }, 0.5)
    const target = nearby.find((t) => t.id === treeId)
    if (!target || !isChoppableStage(target.stage)) {
      toast.show('To drzewo nie nadaje się do ścięcia.', 'error')
      return
    }
    const stepYield = yieldForChopStage(target.stage)
    if (!stepYield) return
    const bonusYield = bonusYieldForChopStage(target.stage)
    if (!inventory.canAdd(stepYield.kind, stepYield.count)) {
      toast.show(inventoryFullToastText(inventory, stepYield.kind, stepYield.count), 'error')
      return
    }
    if (bonusYield && !inventory.canAdd(bonusYield.kind, bonusYield.count)) {
      toast.show(inventoryFullToastText(inventory, bonusYield.kind, bonusYield.count), 'error')
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
        toast.show(inventoryFullToastText(inventory, stepYield.kind, stepYield.count), 'error')
        return
      }
      if (bonusYield && !inventory.canAdd(bonusYield.kind, bonusYield.count)) {
        toast.show(inventoryFullToastText(inventory, bonusYield.kind, bonusYield.count), 'error')
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
      let message = `+${result.yield.count} ${ITEM_DEFS[result.yield.kind].label}`
      if (result.bonusYield) {
        inventory.add(result.bonusYield.kind, result.bonusYield.count)
        message += `, +${result.bonusYield.count} ${ITEM_DEFS[result.bonusYield.kind].label}`
      }
      playInventoryPickUp(worldAudio.playOnce)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      heldTool.syncWithInventory()
      ctx.syncHeldHud()
      ctx.syncQuickActionAvailability()
      toast.show(message, 'pickup')
    })
  }

  const startDepositMine = (depositId: string, x: number, z: number): void => {
    if (!hasItemCapability(heldTool.held(), 'rock_mining') || isActionBlocked(ctx)) return
    const target = bundle.resourceDeposits.queryNearest(x, z, 0.75)
    if (!target || target.id !== depositId || target.remaining <= 0) {
      toast.show('Tu nie ma już czego wydobywać.', 'error')
      return
    }
    const stepYield = yieldForOre(target.type)
    if (!inventory.canAdd(stepYield.kind, stepYield.count)) {
      toast.show(inventoryFullToastText(inventory, stepYield.kind, stepYield.count), 'error')
      return
    }
    playActionMine(worldAudio.playAt, { x, z })
    busy.start(MINE_DURATION_SEC, 'Wydobywanie…', () => {
      if (!inventory.canAdd(stepYield.kind, stepYield.count)) {
        toast.show(inventoryFullToastText(inventory, stepYield.kind, stepYield.count), 'error')
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
    startMoundAt,
    startTreeChop,
    startDepositMine,
    resetTreasureProgress: () => hiddenTreasureDigCount = 0,
  }
}

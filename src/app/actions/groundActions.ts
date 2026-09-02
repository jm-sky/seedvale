import type { BadgeDef, BadgeManager } from '../../badges/badges'
import type { ItemKind } from '../../items/items'
import {
  playActionBranchBreak,
  playActionChop,
  playActionDig,
  playActionMine,
  playActionTreeFall,
} from '../../audio/actionSounds'
import { playInventoryPickUp } from '../../audio/inventorySounds'
import { villageNearest } from '../../debug/locationQueries'
import { inventoryFullToastText } from '../../items/Inventory'
import { hasItemCapability } from '../../items/itemCatalog'
import { ITEM_DEFS } from '../../items/items'
import { createAcquiredInstance } from '../../items/trade'
import { physicalEffortBusyOptions } from '../../player/PlayerNeeds'
import { HIDDEN_TREASURE_MARKER_COUNT, hiddenTreasureDigHit } from '../../settlement/hiddenTreasure'
import { MINE_DURATION_SEC, yieldForOre } from '../../terrain/depositMining'
import { DIG_DURATION_SEC, getDigProfileAt, getRockDigProfileAt } from '../../terrain/dig'
import { applyDigAt, applyLevelAt, applyMoundAt } from '../../terrain/digAction'
import { findHiddenFindSpot, HIDDEN_FIND_SEARCH_RADIUS, resolveHiddenFindLoot } from '../../world/hiddenFinds'
import { createSeededRandom } from '../../world/parseSeed'
import { advanceWorldTreeHarvest, CHOP_DURATION_SEC } from '../../world/treeHarvest'
import { isChoppableStage } from '../../world/treeLifecycle'
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
  /** Reputation Badges / Achievements (plan world-007 §7) — a stable
   *  instance never reassigned; `createApp.ts` calls `.reset()` on New Game,
   *  same contract as `QuestManager`. */
  badges: BadgeManager
  /** Sparse set of already-resolved Hidden Find spot ids (plan world-007
   *  §10) — `${landmarkId}:${graveIndex}` for cemetery graves, `landmarkId`
   *  for single-roll landmarks (stoneCircle/monolith). Never reassigned;
   *  `createApp.ts` clears it on New Game, same "mutated in place" contract
   *  as `landOwnership`/`mapDiscovery`. */
  resolvedHiddenFindSpotIds: Set<string>
}

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function createGroundActions(ctx: PlayerActionContext, deps: GroundActionsDeps): GroundActions {
  const { bundle, player, inventory, heldTool, hud, toast, busy, dayNight, mouseLook, worldAudio } = ctx
  const { worldFlags, badges, resolvedHiddenFindSpotIds } = deps

  /** Pushes the current earned-badges list + the UI-facing standing reading
   *  (plan world-007 §9) — `QuestManager.getPlayerStanding()` combined with
   *  the cemetery-disturbance penalty, computed here rather than inside
   *  `QuestManager` itself (see `badges.ts`'s `communityOffensePenalty` doc).
   *  Event-driven only (called after a Hidden Find resolves), never per
   *  frame. */
  const refreshBadgesUi = (): void => {
    hud.setPlayerBadges(ctx.getPlayerStanding() - badges.communityOffensePenalty(), badges.listEarned())
  }
  const announceBadges = (newlyEarned: readonly BadgeDef[]): void => {
    for (const badge of newlyEarned) toast.show(`Nowa odznaka: ${badge.icon} ${badge.label}`, 'info')
  }

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
    // Deterministic (plan world-007 §2) — seeded from the home settlement's
    // own stable id, not `Math.random()`, so the reward doesn't depend on
    // when during the session the last marker is dug.
    const treasureRandom = createSeededRandom(hashString(`${bundle.settlementsManager.home?.id ?? 'home'}:hiddenTreasure`))
    const coinCount = HIDDEN_TREASURE_COIN_MIN + Math.floor(
      treasureRandom() * (HIDDEN_TREASURE_COIN_MAX - HIDDEN_TREASURE_COIN_MIN + 1),
    )
    const swordKind = HIDDEN_TREASURE_SWORD_KINDS[Math.floor(treasureRandom() * HIDDEN_TREASURE_SWORD_KINDS.length)]!
    // The 3 sword kinds are all `WEAPON_MAINTENANCE_KINDS` (durability +
    // sharpness) — `isInstanceBackedKind`. Their container/inventory UI reads
    // only `getInstances(kind)`, never the plain `counts` map, so a real
    // `ItemInstance` via `createAcquiredInstance` (same dispatch quest
    // rewards/purchases/world pickups already use) is required for it to show
    // up at all, not just `deposit()`'s count-based add.
    const swordInstance = createAcquiredInstance(swordKind)
    if (swordInstance) bundle.placedContainers.depositInstance(record.id, swordInstance)
    // `coin` is gabarite-exempt (`items/items.ts`'s `itemSizeUnits`), so the
    // full 200-300 always fits in the chest's capacity; `remainingCoins` is a
    // defensive fallback (`grantItem`, same overflow path a quest reward
    // already uses), not the expected case.
    const depositedCoins = bundle.placedContainers.deposit(record.id, 'coin', coinCount)
    const remainingCoins = coinCount - depositedCoins
    if (remainingCoins > 0) ctx.grantItem('coin', remainingCoins)
    toast.show('Odkopano ukryty skarb!', 'pickup')
    announceBadges(badges.recordHiddenFindDiscovered(false))
    refreshBadgesUi()
  }

  /** Generic Hidden Finds (plan world-007) — cemetery graves and
   *  stoneCircle/monolith landmark treasures, resolved as a side effect of
   *  the same ordinary shovel dig every other ground action uses. No
   *  separate dig pipeline, no grave `Interactable`/prompt, no visible
   *  marker: a miss (`findHiddenFindSpot` returns `null`) is silently a
   *  no-op, identical to digging any other patch of ground. */
  const checkHiddenFindDig = (x: number, z: number): void => {
    const landmarks = bundle.chunkManager.getNearbyLandmarks({ x, z }, HIDDEN_FIND_SEARCH_RADIUS)
    const match = findHiddenFindSpot(landmarks, x, z, (spotId) => resolvedHiddenFindSpotIds.has(spotId))
    if (!match) return
    resolvedHiddenFindSpotIds.add(match.spotId)

    const isGraveDisturbance = match.landmark.kind === 'cemetery'
    const settlementSize = isGraveDisturbance
      ? villageNearest({ x, z }, bundle.settlementsManager)?.size
      : undefined
    const loot = resolveHiddenFindLoot(match.landmark, match.spotId, match.spotIndex, settlementSize)

    const newlyEarned: BadgeDef[] = []
    // The act of disturbing a grave is the offense (plan §6) — independent
    // of whether it turned out to hold anything.
    if (isGraveDisturbance) newlyEarned.push(...badges.recordGraveDisturbed())

    if (loot.kind === 'coins') {
      ctx.grantItem('coin', loot.amount)
      toast.show(`Znaleziono ${loot.amount} monet!`, 'pickup')
      newlyEarned.push(...badges.recordHiddenFindDiscovered(false))
    } else if (loot.kind === 'item') {
      ctx.grantItem(loot.item, 1)
      toast.show(`Znaleziono: ${ITEM_DEFS[loot.item].label}!`, 'pickup')
      newlyEarned.push(...badges.recordHiddenFindDiscovered(loot.rare))
    }

    announceBadges(newlyEarned)
    refreshBadgesUi()
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
      checkHiddenFindDig(x, z)
      ctx.syncQuickActionAvailability()
    }, physicalEffortBusyOptions('moderate', dayNight.dayLengthSec))
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
    }, physicalEffortBusyOptions('moderate', dayNight.dayLengthSec))
  }

  const startLevelAt = (x: number, z: number): void => {
    if (!inventory.hasCapability('soil_digging') || isActionBlocked(ctx)) return
    if (!getDigProfileAt(x, z, bundle.chunkManager)) {
      toast.show('Nie ma tu czego wyrównać.', 'error')
      return
    }
    busy.start(DIG_DURATION_SEC, 'Wyrównywanie…', () => {
      applyLevelAt(bundle.chunkManager, x, z, toast)
    }, physicalEffortBusyOptions('moderate', dayNight.dayLengthSec))
  }

  const startPickaxeLevelAt = (x: number, z: number): void => {
    if (!hasItemCapability(heldTool.held(), 'rock_mining') || isActionBlocked(ctx)) return
    if (!getRockDigProfileAt(x, z, bundle.chunkManager)) {
      toast.show('Nie ma tu czego wyrównać.', 'error')
      return
    }
    busy.start(DIG_DURATION_SEC, 'Wyrównywanie…', () => {
      applyLevelAt(bundle.chunkManager, x, z, toast)
    }, physicalEffortBusyOptions('moderate', dayNight.dayLengthSec))
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
    }, physicalEffortBusyOptions('moderate', dayNight.dayLengthSec))
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
    // Inventory capacity is deliberately not gated here: `ctx.grantItem`
    // spills any reward that doesn't fit to `droppedItems` at the player's
    // feet, so a full inventory must never block or lose a harvest.
    const busyLabel =
      target.stage === 'mature' || target.stage === 'old'
        ? 'Oczyszczanie…'
        : target.stage === 'limbed'
          ? 'Ścinanie…'
          : 'Rąbanie…'
    playActionChop(worldAudio.playAt, { x, z })
    busy.start(CHOP_DURATION_SEC, busyLabel, () => {
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
      // `ctx.grantItem` — never `inventory.add` directly — so overflow spills
      // to `droppedItems` instead of being silently lost (plan 199's contract).
      ctx.grantItem(result.yield.kind, result.yield.count)
      let message = `+${result.yield.count} ${ITEM_DEFS[result.yield.kind].label}`
      if (result.bonusYield) {
        ctx.grantItem(result.bonusYield.kind, result.bonusYield.count)
        message += `, +${result.bonusYield.count} ${ITEM_DEFS[result.bonusYield.kind].label}`
      }
      // `target.stage` is the pre-chop stage captured above — identifies
      // which transition this completed step is, for the two stage-specific
      // SFX (delimbing vs. the fell itself).
      if (target.stage === 'mature' || target.stage === 'old') {
        playActionBranchBreak(worldAudio.playAt, { x, z })
      } else if (target.stage === 'limbed') {
        playActionTreeFall(worldAudio.playAt, { x, z })
      }
      playInventoryPickUp(worldAudio.playOnce)
      toast.show(message, 'pickup')
    }, physicalEffortBusyOptions('moderate', dayNight.dayLengthSec))
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
    }, physicalEffortBusyOptions('moderate', dayNight.dayLengthSec))
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

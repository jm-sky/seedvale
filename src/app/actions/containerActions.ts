import type { VueUi } from '../../ui-vue/mount'
import type { PlacementBlocker, PlacementPreviewResult } from './placementActions'
import { exitGamePointerLock } from '../../input/MouseLook'
import {
  CONTAINER_DEFS,
  CONTAINER_PLACE_REACH,
  CONTAINER_PLACEMENT_MESSAGE,
  CONTAINER_SETUP_DURATION_SEC,
  containerTotalWeight,
} from '../../items/container'
import { inventoryFullToastText } from '../../items/Inventory'
import { buildInventoryGroups, inventoryCountsForUi } from '../../items/inventoryView'
import { evaluateGroundPlacement } from '../../items/tentPlacement'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

/** Everything the generic player storage (plan 164) does from the app layer:
 *  putting a bought chest down, carrying one, and the transfer screen that
 *  moves items between a `PlacedContainerEntry`'s own `Inventory` and the
 *  player's. Contents never pass through player `Inventory` when a container
 *  is picked up — they travel with the entry. */
export type ContainerActions = {
  /** Read-only preview of a new-chest placement at the player's current aim
   *  (plan `ui-input-004` §2) — backs the shared placement-preview
   *  ghost/UI; `placeContainerAtAim` remains the only mutation seam. Does
   *  not apply to `putDownContainerAtAim` (the carried-container put-down
   *  path), which stays its own instant action. */
  previewContainerPlacement: () => PlacementPreviewResult
  placeContainerAtAim: () => void
  putDownContainerAtAim: () => void
  openContainer: (id: string) => void
  pickUpContainer: (id: string) => void
}

export type ContainerActionDeps = {
  vueUi: VueUi
  /** Shared ground-placement blockers (see `placementActions.ts`). */
  tentBlockers: (x: number, z: number) => PlacementBlocker[]
  /** Renderer canvas — released from pointer lock when the container screen
   *  opens, same as inventory/skills/character (`createApp.ts`). */
  rendererElement: HTMLElement
}

export function createContainerActions(
  ctx: PlayerActionContext,
  deps: ContainerActionDeps,
): ContainerActions {
  const { bundle, player, inventory, hud, toast, busy, mouseLook } = ctx
  const { vueUi, tentBlockers, rendererElement } = deps

  /** The container currently shown by the transfer screen — set on open,
   *  cleared when that same container is picked up, so `configureContainerScreen`'s
   *  handlers (registered once, below) always act on the right
   *  `PlacedContainerEntry` without the screen itself knowing container ids.
   *  Opening a different container overwrites it; a stale id left behind by
   *  an Esc/backdrop close is harmless since the transfer buttons are only
   *  rendered while `ui.containerScreen.open` is true. */
  let openContainerId: string | null = null

  /** Sets a purchased, empty `chest` down in front of the player (plan 164
   *  §4) — same busy-channel shape as pitching a tent/setting a trap: the
   *  inventory item is only spent when the channel completes. `peers` is
   *  containers only (not tents/traps) — `CONTAINER_PLACEMENT_MESSAGE`'s
   *  `container` reason is specifically "another chest already stands here". */
  const previewContainerPlacement = (): PlacementPreviewResult => {
    const def = CONTAINER_DEFS.chest
    const yaw = mouseLook.state.yaw
    const x = player.mesh.position.x - Math.sin(yaw) * CONTAINER_PLACE_REACH
    const z = player.mesh.position.z - Math.cos(yaw) * CONTAINER_PLACE_REACH
    const reason = evaluateGroundPlacement({
      x,
      z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(x, z),
      peers: bundle.placedContainers.nodes(),
      footprintRadius: def.footprintRadius,
      separation: def.separation,
    })
    return {
      x,
      z,
      yaw,
      footprintRadius: def.footprintRadius,
      valid: reason === 'ok',
      reasonLabel: reason === 'ok' ? '' : CONTAINER_PLACEMENT_MESSAGE[reason === 'occupied' ? 'container' : reason],
    }
  }

  const placeContainerAtAim = (): void => {
    if (!inventory.has('chest', 1) || isActionBlocked(ctx)) return
    const def = CONTAINER_DEFS.chest
    const yaw = mouseLook.state.yaw
    const x = player.mesh.position.x - Math.sin(yaw) * CONTAINER_PLACE_REACH
    const z = player.mesh.position.z - Math.cos(yaw) * CONTAINER_PLACE_REACH
    const reason = evaluateGroundPlacement({
      x,
      z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(x, z),
      peers: bundle.placedContainers.nodes(),
      footprintRadius: def.footprintRadius,
      separation: def.separation,
    })
    if (reason !== 'ok') {
      toast.show(CONTAINER_PLACEMENT_MESSAGE[reason === 'occupied' ? 'container' : reason], 'error')
      return
    }
    busy.start(CONTAINER_SETUP_DURATION_SEC, 'Stawianie skrzyni…', () => {
      if (!inventory.remove('chest', 1)) return
      bundle.placedContainers.place('chest', x, z, yaw)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      toast.show('Postawiono skrzynię.')
    })
  }

  /** Sets the carried container back down in front of the player (plan 164
   *  §8/§15) — the put-down counterpart of `placeContainerAtAim`; contents
   *  travel with the same `PlacedContainerEntry`, never touching player
   *  `Inventory`. Quick Actions' "Odłóż skrzynię" (only shown while
   *  carrying) is the sole caller. */
  const putDownContainerAtAim = (): void => {
    const kind = bundle.placedContainers.carriedKind()
    if (!kind || isActionBlocked(ctx)) return
    const def = CONTAINER_DEFS[kind]
    const yaw = mouseLook.state.yaw
    const x = player.mesh.position.x - Math.sin(yaw) * CONTAINER_PLACE_REACH
    const z = player.mesh.position.z - Math.cos(yaw) * CONTAINER_PLACE_REACH
    const reason = evaluateGroundPlacement({
      x,
      z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(x, z),
      peers: bundle.placedContainers.nodes(),
      footprintRadius: def.footprintRadius,
      separation: def.separation,
    })
    if (reason !== 'ok') {
      toast.show(CONTAINER_PLACEMENT_MESSAGE[reason === 'occupied' ? 'container' : reason], 'error')
      return
    }
    busy.start(CONTAINER_SETUP_DURATION_SEC, 'Stawianie skrzyni…', () => {
      if (!bundle.placedContainers.putDownCarried(x, z, yaw)) return
      ctx.syncQuickActionAvailability()
      toast.show('Odłożono skrzynię.')
    })
  }

  const openContainer = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const entry = bundle.placedContainers.find(id)
    if (!entry) return
    exitGamePointerLock(rendererElement)
    openContainerId = id
    const def = CONTAINER_DEFS[entry.kind]
    vueUi.openContainerScreen(
      def.label,
      entry.contents.toJSON(),
      buildInventoryGroups(entry.contents),
      containerTotalWeight(def, entry.contents.totalWeight()),
      def.capacityUnits,
      inventoryCountsForUi(inventory),
      buildInventoryGroups(inventory),
      inventory.totalWeight(),
      inventory.maxWeight,
    )
  }

  const refreshContainerScreenFor = (id: string): void => {
    const entry = bundle.placedContainers.find(id)
    if (!entry || !vueUi.isContainerScreenOpen()) return
    const def = CONTAINER_DEFS[entry.kind]
    vueUi.refreshContainerScreen(
      entry.contents.toJSON(),
      buildInventoryGroups(entry.contents),
      containerTotalWeight(def, entry.contents.totalWeight()),
      def.capacityUnits,
      inventoryCountsForUi(inventory),
      buildInventoryGroups(inventory),
      inventory.totalWeight(),
      inventory.maxWeight,
    )
  }

  const pickUpContainer = (id: string): void => {
    if (isActionBlocked(ctx)) return
    if (!bundle.placedContainers.pickUp(id)) return
    if (openContainerId === id) {
      vueUi.closeContainerScreen()
      openContainerId = null
    }
    ctx.syncQuickActionAvailability()
    toast.show('Podniesiono skrzynię.')
  }

  vueUi.configureContainerScreen({
    onDeposit: (kind, amount) => {
      if (!openContainerId) return
      const accepted = bundle.placedContainers.deposit(openContainerId, kind, amount, inventory.oldestAcquiredAtDays(kind) ?? undefined)
      if (accepted <= 0) {
        toast.show('Brak miejsca w skrzyni.', 'error')
        return
      }
      if (!inventory.remove(kind, accepted)) return
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      refreshContainerScreenFor(openContainerId)
    },
    onWithdraw: (kind, amount) => {
      if (!openContainerId) return
      if (!inventory.canAdd(kind, amount)) {
        toast.show(inventoryFullToastText(inventory, kind, amount), 'error')
        return
      }
      const entry = bundle.placedContainers.find(openContainerId)
      const acquiredAtDays = entry?.contents.oldestAcquiredAtDays(kind) ?? undefined
      const removed = bundle.placedContainers.withdraw(openContainerId, kind, amount)
      if (removed <= 0) return
      inventory.add(kind, removed, acquiredAtDays)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      refreshContainerScreenFor(openContainerId)
    },
    onDepositInstance: (instanceId) => {
      if (!openContainerId) return
      const instance = inventory.getInstance(instanceId)
      if (!instance) return
      if (!bundle.placedContainers.depositInstance(openContainerId, instance)) {
        toast.show('Brak miejsca w skrzyni.', 'error')
        return
      }
      if (!inventory.removeInstance(instanceId)) return
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      refreshContainerScreenFor(openContainerId)
    },
    onWithdrawInstance: (instanceId) => {
      if (!openContainerId) return
      const instance = bundle.placedContainers.find(openContainerId)?.contents.getInstance(instanceId)
      if (!instance) return
      if (!inventory.canAddInstance(instance)) {
        toast.show(inventoryFullToastText(inventory, instance.kind, 1), 'error')
        return
      }
      const withdrawn = bundle.placedContainers.withdrawInstance(openContainerId, instanceId)
      if (!withdrawn) return
      if (!inventory.addInstance(withdrawn)) return
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      refreshContainerScreenFor(openContainerId)
    },
  })

  return { previewContainerPlacement, placeContainerAtAim, putDownContainerAtAim, openContainer, pickUpContainer }
}

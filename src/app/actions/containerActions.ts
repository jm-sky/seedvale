import type { NpcAgent } from '../../ai/NpcAgent'
import type { VueUi } from '../../ui-vue/mount'
import type { GroundPlacementDefinition, PlacementBlocker, PlacementPreviewResult } from './placementActions'
import { exitGamePointerLock } from '../../input/MouseLook'
import {
  CONTAINER_DEFS,
  CONTAINER_PLACE_REACH,
  CONTAINER_PLACEMENT_MESSAGE,
  CONTAINER_SETUP_DURATION_SEC,
  type ContainerKind,
  containerTotalWeight,
} from '../../items/container'
import { skipBatchCount } from '../../items/foodItems'
import { inventoryFullToastText } from '../../items/Inventory'
import { buildInventoryGroups, inventoryCountsForUi } from '../../items/inventoryView'
import { evaluateGroundPlacement, type GroundPlacementReason } from '../../items/tentPlacement'
import { canLootNpcCorpse, corpseLootInventory, transferCorpseCountTo, transferCorpseInstanceTo } from '../../settlement/npcPostDeath'
import { CHEST_DEPTH, CHEST_WIDTH } from '../../world/containerProp'
import { isActionBlocked, type PlayerActionContext } from './actionContext'
import { evaluatePlacementSite, previewGroundPlacement } from './placementActions'
import { placementAimSite } from './placementYaw'

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
  previewContainerPlacement: (objectYaw?: number) => PlacementPreviewResult
  placeContainerAtAim: (objectYaw?: number) => void
  putDownContainerAtAim: () => void
  openContainer: (id: string) => void
  openNpcCorpse: (npc: NpcAgent) => void
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

  /** The transfer screen currently shown — a placed chest or an NPC corpse
   *  (plan npc-010). Opening one overwrites the other; handlers below always
   *  act on this session so the Vue screen stays inventory-agnostic. */
  let openTransfer: { kind: 'container', id: string } | { kind: 'npcCorpse', npc: NpcAgent } | null = null

  /** Shared placement contract for a container (plan `world-008`) — one
   *  `aim` + `evaluate` pair `previewContainerPlacement`, `placeContainerAtAim`
   *  and `putDownContainerAtAim` all build from, so the three can never
   *  validate a site differently. `peers` is containers only (not
   *  tents/traps) — `CONTAINER_PLACEMENT_MESSAGE`'s `container` reason is
   *  specifically "another chest already stands here". */
  const containerPlacementDefinition = (
    kind: ContainerKind,
    objectYaw?: number,
  ): GroundPlacementDefinition<GroundPlacementReason> => {
    const def = CONTAINER_DEFS[kind]
    return {
      aim: () => placementAimSite(
        player.mesh.position.x,
        player.mesh.position.z,
        mouseLook.state.yaw,
        CONTAINER_PLACE_REACH,
        objectYaw,
      ),
      evaluate: (site) => evaluateGroundPlacement({
        x: site.x,
        z: site.z,
        sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
        waterLevel: bundle.chunkManager.waterLevel,
        blockers: tentBlockers(site.x, site.z),
        peers: bundle.placedContainers.nodes(),
        footprintRadius: def.footprintRadius,
        separation: def.separation,
      }),
      footprintRadius: def.footprintRadius,
      previewFootprint: { kind: 'box', width: CHEST_WIDTH, depth: CHEST_DEPTH },
      reasonLabel: (reason) => CONTAINER_PLACEMENT_MESSAGE[reason === 'occupied' ? 'container' : reason],
    }
  }

  /** Sets a purchased, empty `chest` down in front of the player (plan 164
   *  §4) — same busy-channel shape as pitching a tent/setting a trap: the
   *  inventory item is only spent when the channel completes. */
  const previewContainerPlacement = (objectYaw?: number): PlacementPreviewResult =>
    previewGroundPlacement(containerPlacementDefinition('chest', objectYaw))

  const placeContainerAtAim = (objectYaw?: number): void => {
    if (!inventory.has('chest', 1) || isActionBlocked(ctx)) return
    const { site, reason } = evaluatePlacementSite(containerPlacementDefinition('chest', objectYaw))
    if (reason !== 'ok') {
      toast.show(CONTAINER_PLACEMENT_MESSAGE[reason === 'occupied' ? 'container' : reason], 'error')
      return
    }
    busy.start(CONTAINER_SETUP_DURATION_SEC, 'Stawianie skrzyni…', () => {
      if (!inventory.remove('chest', 1)) return
      bundle.placedContainers.place('chest', site.x, site.z, site.yaw)
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
    const { site, reason } = evaluatePlacementSite(containerPlacementDefinition(kind))
    if (reason !== 'ok') {
      toast.show(CONTAINER_PLACEMENT_MESSAGE[reason === 'occupied' ? 'container' : reason], 'error')
      return
    }
    busy.start(CONTAINER_SETUP_DURATION_SEC, 'Stawianie skrzyni…', () => {
      if (!bundle.placedContainers.putDownCarried(site.x, site.z, site.yaw)) return
      ctx.syncQuickActionAvailability()
      toast.show('Odłożono skrzynię.')
    })
  }

  const openContainer = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const entry = bundle.placedContainers.find(id)
    if (!entry) return
    exitGamePointerLock(rendererElement)
    openTransfer = { kind: 'container', id }
    const def = CONTAINER_DEFS[entry.kind]
    vueUi.openContainerScreen(
      def.label,
      entry.contents.toJSON(),
      buildInventoryGroups(entry.contents, ctx.dayNight.elapsedDays),
      containerTotalWeight(def, entry.contents.totalWeight()),
      def.capacityUnits,
      inventoryCountsForUi(inventory),
      buildInventoryGroups(inventory, ctx.dayNight.elapsedDays),
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
      buildInventoryGroups(entry.contents, ctx.dayNight.elapsedDays),
      containerTotalWeight(def, entry.contents.totalWeight()),
      def.capacityUnits,
      inventoryCountsForUi(inventory),
      buildInventoryGroups(inventory, ctx.dayNight.elapsedDays),
      inventory.totalWeight(),
      inventory.maxWeight,
    )
  }

  const refreshNpcCorpseScreen = (npc: NpcAgent): void => {
    const post = npc.getPostDeath()
    if (!post || !vueUi.isContainerScreenOpen()) return
    const contents = corpseLootInventory(post.loot)
    vueUi.refreshContainerScreen(
      contents.toJSON(),
      buildInventoryGroups(contents, ctx.dayNight.elapsedDays),
      contents.totalWeight(),
      Math.max(contents.totalSize(), 1),
      inventoryCountsForUi(inventory),
      buildInventoryGroups(inventory, ctx.dayNight.elapsedDays),
      inventory.totalWeight(),
      inventory.maxWeight,
    )
  }

  const openNpcCorpse = (npc: NpcAgent): void => {
    if (isActionBlocked(ctx)) return
    if (!canLootNpcCorpse(npc.id) || !npc.hasLootableCorpse()) return
    const post = npc.getPostDeath()
    if (!post) return
    exitGamePointerLock(rendererElement)
    openTransfer = { kind: 'npcCorpse', npc }
    const contents = corpseLootInventory(post.loot)
    vueUi.openContainerScreen(
      `Zwłoki: ${npc.displayName}`,
      contents.toJSON(),
      buildInventoryGroups(contents, ctx.dayNight.elapsedDays),
      contents.totalWeight(),
      Math.max(contents.totalSize(), 1),
      inventoryCountsForUi(inventory),
      buildInventoryGroups(inventory, ctx.dayNight.elapsedDays),
      inventory.totalWeight(),
      inventory.maxWeight,
    )
  }

  const pickUpContainer = (id: string): void => {
    if (isActionBlocked(ctx)) return
    if (!bundle.placedContainers.pickUp(id)) return
    if (openTransfer?.kind === 'container' && openTransfer.id === id) {
      vueUi.closeContainerScreen()
      openTransfer = null
    }
    ctx.syncQuickActionAvailability()
    toast.show('Podniesiono skrzynię.')
  }

  vueUi.configureContainerScreen({
    onDeposit: (kind, amount) => {
      if (!openTransfer) return
      if (openTransfer.kind === 'npcCorpse') {
        toast.show('Nie możesz zostawiać przedmiotów przy zwłokach.', 'error')
        return
      }
      const nowDays = ctx.dayNight.elapsedDays
      const batches = inventory.removeWithFreshness(kind, amount, nowDays)
      if (!batches) return
      const accepted = bundle.placedContainers.deposit(openTransfer.id, kind, amount, nowDays, batches)
      if (accepted <= 0) {
        inventory.addWithFreshness(kind, amount, batches, nowDays)
        toast.show('Brak miejsca w skrzyni.', 'error')
        return
      }
      if (accepted < amount) {
        inventory.addWithFreshness(kind, amount - accepted, skipBatchCount(batches, accepted), nowDays)
      }
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      refreshContainerScreenFor(openTransfer.id)
    },
    onWithdraw: (kind, amount) => {
      if (!openTransfer) return
      if (!inventory.canAdd(kind, amount)) {
        toast.show(inventoryFullToastText(inventory, kind, amount), 'error')
        return
      }
      if (openTransfer.kind === 'npcCorpse') {
        const post = openTransfer.npc.getPostDeath()
        if (!post || !transferCorpseCountTo(post, inventory, kind, amount)) return
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        refreshNpcCorpseScreen(openTransfer.npc)
        return
      }
      const nowDays = ctx.dayNight.elapsedDays
      const withdrawn = bundle.placedContainers.withdraw(openTransfer.id, kind, amount, nowDays)
      if (withdrawn.amount <= 0) return
      inventory.addWithFreshness(kind, withdrawn.amount, withdrawn.batches, nowDays)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      refreshContainerScreenFor(openTransfer.id)
    },
    onDepositInstance: (instanceId) => {
      if (!openTransfer) return
      if (openTransfer.kind === 'npcCorpse') {
        toast.show('Nie możesz zostawiać przedmiotów przy zwłokach.', 'error')
        return
      }
      const instance = inventory.getInstance(instanceId)
      if (!instance) return
      if (!bundle.placedContainers.depositInstance(openTransfer.id, instance)) {
        toast.show('Brak miejsca w skrzyni.', 'error')
        return
      }
      if (!inventory.removeInstance(instanceId)) return
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      refreshContainerScreenFor(openTransfer.id)
    },
    onWithdrawInstance: (instanceId) => {
      if (!openTransfer) return
      if (openTransfer.kind === 'npcCorpse') {
        const post = openTransfer.npc.getPostDeath()
        const instance = post ? corpseLootInventory(post.loot).getInstance(instanceId) : null
        if (!post || !instance) return
        if (!inventory.canAddInstance(instance)) {
          toast.show(inventoryFullToastText(inventory, instance.kind, 1), 'error')
          return
        }
        if (!transferCorpseInstanceTo(post, inventory, instanceId)) {
          toast.show(inventoryFullToastText(inventory, instance.kind, 1), 'error')
          return
        }
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        refreshNpcCorpseScreen(openTransfer.npc)
        return
      }
      const instance = bundle.placedContainers.find(openTransfer.id)?.contents.getInstance(instanceId)
      if (!instance) return
      if (!inventory.canAddInstance(instance)) {
        toast.show(inventoryFullToastText(inventory, instance.kind, 1), 'error')
        return
      }
      const withdrawn = bundle.placedContainers.withdrawInstance(openTransfer.id, instanceId)
      if (!withdrawn) return
      if (!inventory.addInstance(withdrawn)) return
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      refreshContainerScreenFor(openTransfer.id)
    },
  })

  return { previewContainerPlacement, placeContainerAtAim, putDownContainerAtAim, openContainer, openNpcCorpse, pickUpContainer }
}

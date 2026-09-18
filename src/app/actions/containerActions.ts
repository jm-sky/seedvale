import type { NpcAgent } from '../../ai/NpcAgent'
import type { AnimalAgent } from '../../fauna/AnimalAgent'
import type { FoodBatch, Inventory } from '../../items/Inventory'
import type { ItemKind } from '../../items/items'
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
import { resolveEquipmentModifiers } from '../../items/equipment'
import { skipBatchCount } from '../../items/foodItems'
import { inventoryFullToastText } from '../../items/Inventory'
import { buildInventoryGroups, inventoryCountsForUi } from '../../items/inventoryView'
import { CAPABILITY_NEED_LABEL, hasItemCapability } from '../../items/itemCatalog'
import { INSTANCE_BACKED_KINDS } from '../../items/itemInstances'
import { ITEM_DEFS } from '../../items/items'
import { evaluateGroundPlacement, type GroundPlacementReason } from '../../items/tentPlacement'
import {
  commitForcedEntry,
  describeTreasureContainerInteraction,
  FORCE_ENTRY_DURATION_SEC,
  quantizeStrength,
  type TreasureChestMutation,
  treasureWorldContainerPrompt,
} from '../../items/treasureGameplay'
import { physicalWorkDuration } from '../../player/physicalWorkStrength'
import { applyPlayerDamage } from '../../player/playerDamage'
import { physicalEffortBusyOptions } from '../../player/PlayerNeeds'
import { canLootNpcCorpse, corpseLootInventory, transferCorpseCountTo, transferCorpseInstanceTo } from '../../settlement/npcPostDeath'
import { CHEST_DEPTH, CHEST_WIDTH } from '../../world/containerProp'
import { attemptTreasureUnlock, treasureSiteForContainer } from '../../world/treasureSites'
import { isActionBlocked, type PlayerActionContext } from './actionContext'
import { withdrawInstanceRollbackSafe } from './containerInstanceTransfer'
import { evaluatePlacementSite, previewGroundPlacement } from './placementActions'
import { placementAimSite } from './placementYaw'

/** How many more of `kind` (up to `available`) would actually fit in
 *  `inventory` right now — used by "Weź wszystko" (plan items-player-024) to
 *  request only the capacity-legal amount instead of an all-or-nothing
 *  transfer. Walks one unit at a time (bounded by a chest/corpse's own small
 *  contents) rather than a closed-form calc, since a carried backpack can
 *  grow `maxWeight` mid-walk. */
function maxTransferable(inventory: Inventory, kind: ItemKind, available: number): number {
  let n = 0
  while (n < available && inventory.canAdd(kind, n + 1)) n++
  return n
}

/** Same batch-preserving partial-accept algorithm as
 *  `PlacedContainers.deposit()` (`world/createPlacedContainers.ts`),
 *  reused directly against a live pack `Inventory` (plan fauna-039 §12) —
 *  an equipped pack has no `id`-keyed store of its own to route through
 *  `containerContents()`, just the animal's own `Inventory`. Returns the
 *  amount actually accepted so the caller can return any remainder to the
 *  player, same "partial success, never lost" contract. */
function depositBatchesInto(
  target: Inventory,
  kind: ItemKind,
  amount: number,
  nowDays: number,
  batches?: readonly FoodBatch[],
): number {
  if (amount <= 0) return 0
  if (batches && batches.length > 0) {
    let accepted = 0
    let remaining = amount
    for (const batch of batches) {
      if (remaining <= 0) break
      const take = Math.min(batch.count, remaining)
      if (!target.addWithFreshness(kind, take, [{ ...batch, count: take }], nowDays)) break
      accepted += take
      remaining -= take
    }
    return accepted
  }
  let accepted = 0
  while (accepted < amount && target.add(kind, 1, nowDays)) accepted++
  return accepted
}

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
  /** Opens an equipped animal's pack in the shared transfer screen (plan
   *  fauna-039 §10) — `animalId` is re-resolved to the live `AnimalAgent`
   *  on every subsequent mutation, never held as a direct reference. */
  openAnimalPack: (animalId: string) => void
  /** Załóż juki (plan fauna-039 §7) — spends exactly one `saddlebags` from
   *  the player's inventory; rolls it back if pack installation fails. */
  equipAnimalPack: (animalId: string) => void
  /** Zdejmij juki (plan fauna-039 §14) — only legal for an empty pack;
   *  grants exactly one `saddlebags` back to the player. */
  unequipAnimalPack: (animalId: string) => void
  /** Recovers an empty *ground* saddlebags container as a carried item
   *  (plan fauna-039 §26) — the `empty-to-item` pickup policy transaction. */
  pickUpGroundSaddlebags: (id: string) => void
  /** Plan items-player-026 — force a locked systemic treasure chest. Returns
   *  true when this chest is a force-entry candidate (so `[R]` must not fall
   *  through to pick-up). */
  forceOpenContainer: (id: string) => boolean
  describeWorldGeneratedContainer: (id: string) => string | null
}

export type ContainerActionDeps = {
  vueUi: VueUi
  /** Shared ground-placement blockers (see `placementActions.ts`). */
  tentBlockers: (x: number, z: number) => PlacementBlocker[]
  /** Renderer canvas — released from pointer lock when the container screen
   *  opens, same as inventory/skills/character (`createApp.ts`). */
  rendererElement: HTMLElement
  /** Plan world-024 — mutated in place; never reassigned. */
  unlockedTreasureContainerIds: Set<string>
  /** Plan items-player-026 — mutated in place; never reassigned. */
  treasureChestMutations: Map<string, TreasureChestMutation>
  tryExtractTreasureMapBearCasket?: (containerId: string) => boolean
  confirmOpenAuthoredCasket?: (containerId: string, open: () => void) => void
}

export function createContainerActions(
  ctx: PlayerActionContext,
  deps: ContainerActionDeps,
): ContainerActions {
  const { bundle, player, inventory, hud, toast, busy, mouseLook } = ctx
  const { vueUi, tentBlockers, rendererElement, unlockedTreasureContainerIds, treasureChestMutations, tryExtractTreasureMapBearCasket, confirmOpenAuthoredCasket } = deps

  /** The transfer screen currently shown — a placed chest, an NPC corpse
   *  (plan npc-010), or an equipped animal's pack (plan fauna-039 §11).
   *  Opening one overwrites the others; handlers below always act on this
   *  session so the Vue screen stays inventory-agnostic. `animalPack` keeps
   *  only the stable `animalId`, never a live `AnimalAgent` reference — the
   *  animal is re-resolved (`resolveAnimalPack`) before every mutation. */
  let openTransfer: { kind: 'container', id: string } | { kind: 'npcCorpse', npc: NpcAgent } | { kind: 'animalPack', animalId: string } | null = null

  const containerContents = (id: string) => {
    if (bundle.placedContainers.find(id)) return bundle.placedContainers
    if (bundle.worldGeneratedContainers.find(id)) return bundle.worldGeneratedContainers
    return null
  }

  /** Re-resolves an equipped pack's live `Inventory` by stable `animalId`
   *  (plan fauna-039 §11/§29) — `null` once the animal is gone or no
   *  longer carries a pack (dead + handed off, unequipped elsewhere, ...). */
  const resolveAnimalPack = (animalId: string): { animal: AnimalAgent, contents: Inventory } | null => {
    const animal = bundle.settlementsManager.resolvePersistentAnimal(animalId)
    const contents = animal?.getPackContents() ?? null
    return animal && contents ? { animal, contents } : null
  }

  const refreshAnimalPackScreen = (contents: Inventory): void => {
    if (!vueUi.isContainerScreenOpen()) return
    vueUi.refreshContainerScreen(
      contents.toJSON(),
      buildInventoryGroups(contents, ctx.dayNight.elapsedDays),
      contents.totalWeight(),
      contents.maxSize,
      inventoryCountsForUi(inventory),
      buildInventoryGroups(inventory, ctx.dayNight.elapsedDays),
      inventory.totalWeight(),
      inventory.maxWeight,
    )
  }

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
    if (tryExtractTreasureMapBearCasket?.(id)) return
    const placed = bundle.placedContainers.find(id)
    const world = placed ? undefined : bundle.worldGeneratedContainers.find(id)
    const entry = placed ?? world
    if (!entry) return
    const treasure = describeTreasureContainerInteraction(
      bundle.treasureSites,
      unlockedTreasureContainerIds,
      treasureChestMutations,
      id,
    )
    if (treasure.kind === 'locked') {
      const unlock = attemptTreasureUnlock(
        bundle.treasureSites,
        unlockedTreasureContainerIds,
        id,
        (requiredKeyId) => inventory.getInstance(requiredKeyId) != null,
      )
      if (unlock.kind === 'locked') {
        toast.show('Skrzynia jest zamknięta. Potrzebujesz pasującego klucza albo wyłam zamek.', 'error')
        return
      }
      if (unlock.kind === 'unlocked') toast.show('Otwarto skrzynię kluczem.')
    }
    const showScreen = (): void => {
      exitGamePointerLock(rendererElement)
      openTransfer = { kind: 'container', id }
      const def = placed ? CONTAINER_DEFS[placed.kind] : CONTAINER_DEFS.chest
      vueUi.openContainerScreen(
        treasure.kind === 'remains' ? 'Szczątki skrzyni' : def.label,
        'container',
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
    if (confirmOpenAuthoredCasket) confirmOpenAuthoredCasket(id, showScreen)
    else showScreen()
  }

  const describeWorldGeneratedContainer = (id: string): string | null =>
    treasureWorldContainerPrompt(
      bundle.treasureSites,
      unlockedTreasureContainerIds,
      treasureChestMutations,
      id,
    )

  const forceOpenContainer = (id: string): boolean => {
    const treasure = describeTreasureContainerInteraction(
      bundle.treasureSites,
      unlockedTreasureContainerIds,
      treasureChestMutations,
      id,
    )
    if (treasure.kind === 'not-treasure' || treasure.kind === 'open') return false
    if (treasure.kind === 'remains') return true
    if (isActionBlocked(ctx)) return true
    const held = ctx.heldTool.held()
    if (!hasItemCapability(held, 'prying') || held == null) {
      toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL.prying}.`, 'error')
      return true
    }
    const site = treasureSiteForContainer(bundle.treasureSites, id)
    const entry = bundle.worldGeneratedContainers.find(id)
    if (!site || !entry) return true
    const strengthBucket = quantizeStrength(player.effectiveAttributes(ctx.dayNight.elapsedDays).strength)
    const heldKind = held
    busy.start(
      physicalWorkDuration(FORCE_ENTRY_DURATION_SEC, player.effectiveAttributes(ctx.dayNight.elapsedDays).strength),
      'Wyłamywanie zamka…',
      () => {
        const live = bundle.worldGeneratedContainers.find(id)
        const liveSite = treasureSiteForContainer(bundle.treasureSites, id)
        const liveTreasure = describeTreasureContainerInteraction(
          bundle.treasureSites,
          unlockedTreasureContainerIds,
          treasureChestMutations,
          id,
        )
        if (!live || !liveSite || liveTreasure.kind !== 'locked') return
        if (!hasItemCapability(ctx.heldTool.held(), 'prying') || ctx.heldTool.held() !== heldKind) {
          toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL.prying}.`, 'error')
          return
        }
        const result = commitForcedEntry({
          worldSeed: ctx.getWorldSeed(),
          site: liveSite,
          inventory: live.contents,
          unlockedIds: unlockedTreasureContainerIds,
          mutations: treasureChestMutations,
          snapshot: { heldKind, strengthBucket },
        })
        if (result.mechanical === 'opened_clean') toast.show('Wyłamano zamek.')
        else if (result.mechanical === 'opened_damaged') toast.show('Skrzynia ustąpiła, ale zawartość ucierpiała.')
        else toast.show('Zamek się nie poddał.', 'error')
        if (result.trapTriggeredNow && result.trap === 'fire') {
          if (result.destroyed) toast.show('Pułapka ogniowa zniszczyła skrzynię.')
          else if (result.fireSeverity === 'chest_damaged') toast.show('Pułapka ogniowa uszkodziła skrzynię.')
          else toast.show('Pułapka ogniowa spaliła kruche przedmioty.')
        }
        if (result.bladeDamage > 0) {
          applyPlayerDamage({
            player,
            amount: result.bladeDamage,
            attackerKey: 'env',
            heldTool: ctx.heldTool.held(),
            defenseSkillValue: player.skills.defense.value,
            playerYaw: mouseLook.state.yaw,
            nowDays: ctx.dayNight.elapsedDays,
            equipmentModifiers: resolveEquipmentModifiers(ctx.equipment, ctx.inventory),
          })
          toast.show('Ostrze pułapki cię zraniło.', 'error')
        }
        const lost = Object.entries(result.destroyedVulnerable)
          .filter(([, n]) => (n ?? 0) > 0)
          .map(([kind, n]) => `${n}× ${ITEM_DEFS[kind as ItemKind].label}`)
        if (lost.length > 0 && result.mechanical === 'opened_damaged' && !(result.trapTriggeredNow && result.trap === 'fire')) {
          toast.show(`Zniszczono: ${lost.join(', ')}.`)
        }
        if (result.opened || result.destroyed) openContainer(id)
      },
      physicalEffortBusyOptions('moderate', ctx.dayNight.dayLengthSec),
    )
    return true
  }

  const refreshContainerScreenFor = (id: string): void => {
    const placed = bundle.placedContainers.find(id)
    const world = placed ? undefined : bundle.worldGeneratedContainers.find(id)
    const entry = placed ?? world
    if (!entry || !vueUi.isContainerScreenOpen()) return
    const def = placed ? CONTAINER_DEFS[placed.kind] : CONTAINER_DEFS.chest
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
      'corpse',
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
    if (bundle.worldGeneratedContainers.find(id)) return
    if (!bundle.placedContainers.pickUp(id)) return
    if (openTransfer?.kind === 'container' && openTransfer.id === id) {
      vueUi.closeContainerScreen()
      openTransfer = null
    }
    ctx.syncQuickActionAvailability()
    toast.show('Podniesiono skrzynię.')
  }

  /** Otwórz juki (plan fauna-039 §10) — the equipped-pack counterpart of
   *  `openContainer`; a *ground* saddlebags container is a normal
   *  `PlacedContainerEntry` and already opens through `openContainer`
   *  unchanged. */
  const openAnimalPack = (animalId: string): void => {
    if (isActionBlocked(ctx)) return
    const resolved = resolveAnimalPack(animalId)
    if (!resolved) return
    exitGamePointerLock(rendererElement)
    openTransfer = { kind: 'animalPack', animalId }
    const name = resolved.animal.getName()
    vueUi.openContainerScreen(
      name ? `Juki — ${name}` : 'Juki',
      'pack',
      resolved.contents.toJSON(),
      buildInventoryGroups(resolved.contents, ctx.dayNight.elapsedDays),
      resolved.contents.totalWeight(),
      resolved.contents.maxSize,
      inventoryCountsForUi(inventory),
      buildInventoryGroups(inventory, ctx.dayNight.elapsedDays),
      inventory.totalWeight(),
      inventory.maxWeight,
    )
  }

  /** Załóż juki (plan fauna-039 §6/§7) — commit-last from the item side:
   *  every fallible check runs before the `saddlebags` item ever leaves the
   *  player's inventory, and installation itself (`AnimalAgent.equipPack`)
   *  cannot fail once eligibility already held, but the item is still
   *  rolled back defensively if it somehow does. */
  const equipAnimalPack = (animalId: string): void => {
    if (isActionBlocked(ctx)) return
    const animal = bundle.settlementsManager.resolvePersistentAnimal(animalId)
    if (!animal) return
    if (!animal.canEquipPack()) {
      toast.show('Nie można teraz założyć juk temu zwierzęciu.', 'error')
      return
    }
    if (!inventory.has('saddlebags', 1)) {
      toast.show('Potrzebujesz juk.', 'error')
      return
    }
    if (!inventory.remove('saddlebags', 1)) return
    if (!animal.equipPack()) {
      inventory.add('saddlebags', 1)
      return
    }
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    ctx.syncQuickActionAvailability()
    toast.show('Założono juki.')
  }

  /** Zdejmij juki (plan fauna-039 §14) — only legal for an empty pack;
   *  never auto-empties or drops contents. */
  const unequipAnimalPack = (animalId: string): void => {
    if (isActionBlocked(ctx)) return
    const animal = bundle.settlementsManager.resolvePersistentAnimal(animalId)
    if (!animal) return
    if (!animal.canUnequipPack()) {
      toast.show('Najpierw opróżnij juki.', 'error')
      return
    }
    if (!inventory.canAdd('saddlebags', 1)) {
      toast.show(inventoryFullToastText(inventory, 'saddlebags', 1), 'error')
      return
    }
    if (!animal.unequipPack()) return
    inventory.add('saddlebags', 1)
    if (openTransfer?.kind === 'animalPack' && openTransfer.animalId === animalId) {
      vueUi.closeContainerScreen()
      openTransfer = null
    }
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    ctx.syncQuickActionAvailability()
    toast.show('Zdjęto juki.')
  }

  /** Podnieś juki (plan fauna-039 §23/§26) — the `empty-to-item` pickup
   *  policy transaction for a *ground* saddlebags container: legal only
   *  when empty, never auto-triggered by emptying it out. */
  const pickUpGroundSaddlebags = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const entry = bundle.placedContainers.find(id)
    if (!entry || entry.kind !== 'saddlebags') return
    if (!entry.contents.isEmpty()) {
      toast.show('Najpierw opróżnij juki.', 'error')
      return
    }
    if (!inventory.canAdd('saddlebags', 1)) {
      toast.show(inventoryFullToastText(inventory, 'saddlebags', 1), 'error')
      return
    }
    if (!bundle.placedContainers.remove(id)) return
    inventory.add('saddlebags', 1)
    if (openTransfer?.kind === 'container' && openTransfer.id === id) {
      vueUi.closeContainerScreen()
      openTransfer = null
    }
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    ctx.onInventoryChanged()
    ctx.syncQuickActionAvailability()
    toast.show('Podniesiono juki.')
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
      if (openTransfer.kind === 'animalPack') {
        const resolved = resolveAnimalPack(openTransfer.animalId)
        if (!resolved) {
          inventory.addWithFreshness(kind, amount, batches, nowDays)
          return
        }
        const acceptedIntoPack = depositBatchesInto(resolved.contents, kind, amount, nowDays, batches)
        if (acceptedIntoPack <= 0) {
          inventory.addWithFreshness(kind, amount, batches, nowDays)
          toast.show('Brak miejsca w jukach.', 'error')
          return
        }
        if (acceptedIntoPack < amount) {
          inventory.addWithFreshness(kind, amount - acceptedIntoPack, skipBatchCount(batches, acceptedIntoPack), nowDays)
        }
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        refreshAnimalPackScreen(resolved.contents)
        return
      }
      const store = containerContents(openTransfer.id)
      if (!store) return
      const accepted = store.deposit(openTransfer.id, kind, amount, nowDays, batches)
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
        if (!post || !transferCorpseCountTo(post, inventory, kind, amount, ctx.dayNight.elapsedDays)) return
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        refreshNpcCorpseScreen(openTransfer.npc)
        return
      }
      if (openTransfer.kind === 'animalPack') {
        const resolved = resolveAnimalPack(openTransfer.animalId)
        if (!resolved) return
        const nowDays = ctx.dayNight.elapsedDays
        const take = Math.min(resolved.contents.count(kind), amount)
        if (take <= 0) return
        const withdrawnBatches = resolved.contents.removeWithFreshness(kind, take, nowDays)
        if (!withdrawnBatches) return
        inventory.addWithFreshness(kind, take, withdrawnBatches, nowDays)
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        refreshAnimalPackScreen(resolved.contents)
        return
      }
      const nowDays = ctx.dayNight.elapsedDays
      const store = containerContents(openTransfer.id)
      if (!store) return
      const withdrawn = store.withdraw(openTransfer.id, kind, amount, nowDays)
      if (withdrawn.amount <= 0) return
      inventory.addWithFreshness(kind, withdrawn.amount, withdrawn.batches, nowDays)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      ctx.onWorldContainerWithdraw?.(openTransfer.id, kind, withdrawn.amount)
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
      if (openTransfer.kind === 'animalPack') {
        const resolved = resolveAnimalPack(openTransfer.animalId)
        if (!resolved || !resolved.contents.addInstance(instance)) {
          toast.show('Brak miejsca w jukach.', 'error')
          return
        }
        if (!inventory.removeInstance(instanceId)) return
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        refreshAnimalPackScreen(resolved.contents)
        return
      }
      const store = containerContents(openTransfer.id)
      if (!store) return
      if (!store.depositInstance(openTransfer.id, instance)) {
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
      if (openTransfer.kind === 'animalPack') {
        const resolved = resolveAnimalPack(openTransfer.animalId)
        const instance = resolved?.contents.getInstance(instanceId)
        if (!resolved || !instance) return
        if (!inventory.canAddInstance(instance)) {
          toast.show(inventoryFullToastText(inventory, instance.kind, 1), 'error')
          return
        }
        if (!resolved.contents.removeInstance(instanceId)) return
        if (!inventory.addInstance(instance)) {
          resolved.contents.addInstance(instance)
          return
        }
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        refreshAnimalPackScreen(resolved.contents)
        return
      }
      const store = containerContents(openTransfer.id)
      const entry = store?.find(openTransfer.id)
      const instance = entry?.contents.getInstance(instanceId)
      if (!instance || !store) return
      if (!inventory.canAddInstance(instance)) {
        toast.show(inventoryFullToastText(inventory, instance.kind, 1), 'error')
        return
      }
      const withdrawn = withdrawInstanceRollbackSafe(store, openTransfer.id, instanceId, inventory)
      if (!withdrawn) return
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      ctx.onWorldContainerWithdraw?.(openTransfer.id, withdrawn.kind, 1)
      refreshContainerScreenFor(openTransfer.id)
    },
    /** "Weź wszystko" (plan items-player-024) — transfers as much of the
     *  source's contents as legally fits (`maxTransferable`), leaving any
     *  capacity-limited remainder in place. Preserves food freshness (via
     *  the same `withdraw`/`transferCorpseCountTo` primitives regular
     *  transfers use) and instance identity (per-instance withdraw, never a
     *  bulk copy). Partial success is intended, not a failure. */
    onTakeAll: () => {
      if (!openTransfer) return
      let transferredAny = false
      if (openTransfer.kind === 'npcCorpse') {
        const post = openTransfer.npc.getPostDeath()
        if (!post) return
        const nowDays = ctx.dayNight.elapsedDays
        const loot = corpseLootInventory(post.loot)
        for (const [kind, count] of Object.entries(loot.toJSON()) as [ItemKind, number][]) {
          if (count <= 0) continue
          const n = maxTransferable(inventory, kind, count)
          if (n > 0 && transferCorpseCountTo(post, inventory, kind, n, nowDays)) transferredAny = true
        }
        for (const kind of INSTANCE_BACKED_KINDS) {
          for (const instance of loot.getInstances(kind)) {
            if (inventory.canAddInstance(instance) && transferCorpseInstanceTo(post, inventory, instance.id)) transferredAny = true
          }
        }
        if (!transferredAny) return
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        refreshNpcCorpseScreen(openTransfer.npc)
        return
      }
      if (openTransfer.kind === 'animalPack') {
        const resolved = resolveAnimalPack(openTransfer.animalId)
        if (!resolved) return
        const nowDays = ctx.dayNight.elapsedDays
        for (const [kind, count] of Object.entries(resolved.contents.toJSON()) as [ItemKind, number][]) {
          if (count <= 0) continue
          const n = maxTransferable(inventory, kind, count)
          if (n <= 0) continue
          const withdrawnBatches = resolved.contents.removeWithFreshness(kind, n, nowDays)
          if (!withdrawnBatches) continue
          inventory.addWithFreshness(kind, n, withdrawnBatches, nowDays)
          transferredAny = true
        }
        for (const kind of INSTANCE_BACKED_KINDS) {
          for (const instance of resolved.contents.getInstances(kind)) {
            if (!inventory.canAddInstance(instance)) continue
            if (!resolved.contents.removeInstance(instance.id)) continue
            if (!inventory.addInstance(instance)) { resolved.contents.addInstance(instance); continue }
            transferredAny = true
          }
        }
        if (!transferredAny) return
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        ctx.onInventoryChanged()
        refreshAnimalPackScreen(resolved.contents)
        return
      }
      const nowDays = ctx.dayNight.elapsedDays
      const store = containerContents(openTransfer.id)
      const entry = store?.find(openTransfer.id)
      if (!store || !entry) return
      for (const [kind, count] of Object.entries(entry.contents.toJSON()) as [ItemKind, number][]) {
        if (count <= 0) continue
        const n = maxTransferable(inventory, kind, count)
        if (n <= 0) continue
        const withdrawn = store.withdraw(openTransfer.id, kind, n, nowDays)
        if (withdrawn.amount <= 0) continue
        inventory.addWithFreshness(kind, withdrawn.amount, withdrawn.batches, nowDays)
        ctx.onWorldContainerWithdraw?.(openTransfer.id, kind, withdrawn.amount)
        transferredAny = true
      }
      for (const kind of INSTANCE_BACKED_KINDS) {
        for (const instance of entry.contents.getInstances(kind)) {
          if (!inventory.canAddInstance(instance)) continue
          const withdrawn = withdrawInstanceRollbackSafe(store, openTransfer.id, instance.id, inventory)
          if (!withdrawn) continue
          ctx.onWorldContainerWithdraw?.(openTransfer.id, withdrawn.kind, 1)
          transferredAny = true
        }
      }
      if (!transferredAny) return
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      ctx.onInventoryChanged()
      refreshContainerScreenFor(openTransfer.id)
    },
  })

  return {
    previewContainerPlacement,
    placeContainerAtAim,
    putDownContainerAtAim,
    openContainer,
    openNpcCorpse,
    pickUpContainer,
    forceOpenContainer,
    describeWorldGeneratedContainer,
    openAnimalPack,
    equipAnimalPack,
    unequipAnimalPack,
    pickUpGroundSaddlebags,
  }
}

import type { NpcAgent } from '../ai/NpcAgent'
import type { createWorldAudio } from '../audio/createWorldAudio'
import type { EquipmentSlot, EquipmentState } from '../items/equipment'
import type { HeldTool } from '../items/HeldTool'
import type { Inventory } from '../items/Inventory'
import type { InventoryGroupView } from '../items/inventoryView'
import type { ItemKind } from '../items/items'
import type { PrimaryWeaponSelection } from '../items/primaryWeapons'
import type { TradeResult } from '../items/trade'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { QuestManager } from '../quests/QuestManager'
import type { ReputationManager } from '../reputation/ReputationManager'
import type { Settlement } from '../settlement/createSettlement'
import type { VueUi } from '../ui-vue/mount'
import type { MerchantPricing } from '../ui-vue/store'
import type { MerchantHorseOffer } from '../ui-vue/store'
import type { Hud } from '../ui/createHud'
import type { Toast } from '../ui/createToast'
import type { DayNightState } from '../world/dayNight'
import type { LocationKnowledge } from '../world/locations/locationKnowledge'
import type { NavigationTargets } from '../world/locations/navigationTargets'
import type { WorldLocationCatalog } from '../world/locations/worldLocationCatalog'
import type { WorldBundle } from './worldBundle'
import { aboutAreaLine, requestAssistanceLine, voluntaryJoinResponseLine } from '../ai/dialogueTemplates'
import { isVoluntaryJoinAccepted, type VoluntaryExpeditionTerms } from '../ai/voluntaryExpeditionJoin'
import { playInventoryDrop } from '../audio/inventorySounds'
import { readBook } from '../items/books'
import { expandFoodBatchesToUnits } from '../items/foodItems'
import { toSaveItemInstance } from '../items/Inventory'
import { buildInventoryGroups, inventoryCountsForUi } from '../items/inventoryView'
import { isMeleeToolKind, isRangedTool, ITEM_CATALOG } from '../items/itemCatalog'
import { isInstanceBackedKind } from '../items/itemInstances'
import { ITEM_DEFS } from '../items/items'
import { inventoryOwnsPrimaryWeaponChoice } from '../items/primaryWeapons'
import { previewPricedPurchaseNetCoins, previewTransactionNetCoins, resolveOfferLineBuyback, sellInstancesForCoins, settlePricedPurchase, settleTransaction } from '../items/trade'
import { NEUTRAL_SELL_PRICE_CONTEXT, sellPrice, type SellPriceContext } from '../items/tradeCatalog'
import { type SharpenResult, sharpenWeapon } from '../items/weaponMaintenance'
import { SKILL_LABEL } from '../player/PlayerSkills'
import {
  applyGuardClaimMutation,
  getGuardClaimState,
  type GuardWorldProgress,
} from '../quests/guardPersistence'
import { guardRewardTopicAvailable, resolveNextGuardReward } from '../quests/guardRewards'
import {
  getHorseAcquisitionState,
  horseOfferStatusHint,
  MERCHANT_HORSE_PRICE,
  merchantHorseAnimalId,
  resolveMerchantHorseAnimal,
} from '../settlement/horseAcquisition'
import { hideBusy, showBusy, ui } from '../ui-vue/store'
import {
  FAR_RANGE_KM,
  GUARD_LANDMARK_POOL_SIZE,
  GUARD_REVEAL_MAX,
  GUARD_REVEAL_MIN,
  MEDIUM_RANGE_KM,
  MERCHANT_MAP_LANDMARK_POOL_SIZE,
  NEAR_RANGE_KM,
} from '../world/locations/locationConfig'
import {
  landmarksInBandAsync,
  pickRandomReveal,
  settlementsInBand,
  weightedTopN,
} from '../world/locations/locationDiscovery'
import { revealLocationKnowledge } from '../world/locations/revealLocationKnowledge'
import { settlementLocationId } from '../world/locations/worldLocationCatalog'
import { payWorkContractAssignment } from './actions/workContractPayment'

/** Nearest settlements the home guard always mentions each conversation
 *  (plan §8 — no pool/scarcity mechanic, unlike landmarks). */
const GUARD_SETTLEMENT_REVEAL_COUNT = 3

/** Delay BusyOverlay so Near/NPC queries that finish immediately never flicker. */
const LOCATION_DISCOVERY_BUSY_DELAY_MS = 80
const LOCATION_DISCOVERY_BUSY_LABEL = 'Przeszukuję okolicę…'

async function withLocationDiscoveryBusy<T>(
  work: (onProgress: (progress: number) => void) => Promise<T>,
): Promise<T> {
  let shown = false
  let lastProgress = 0
  const timer = setTimeout(() => {
    shown = true
    showBusy(LOCATION_DISCOVERY_BUSY_LABEL, false, lastProgress)
  }, LOCATION_DISCOVERY_BUSY_DELAY_MS)
  try {
    return await work((progress) => {
      lastProgress = progress
      if (shown) showBusy(LOCATION_DISCOVERY_BUSY_LABEL, false, progress)
    })
  } finally {
    clearTimeout(timer)
    if (shown) hideBusy()
  }
}

export type MerchantInventoryView = {
  counts: Partial<Record<ItemKind, number>>
  groups: InventoryGroupView[]
}

/** Player-inventory screen and home-trader wiring: the handlers behind
 *  "Wyrzuć"/"Załóż"/"Naostrz" and every buy/sell path of `MerchantScreen`,
 *  plus the guard's sword line in the NPC dialogue menu (which shares the same
 *  `Inventory`/relation state).
 *
 *  It is deliberately *not* a `PlayerActionContext` consumer: these are UI
 *  handlers over `Inventory` + `vueUi`, not world interactions. Map/area
 *  discovery may reuse `showBusy` progress (plan world-022) but never
 *  `BusyAction`. */
export type InventoryWiring = {
  /** Counts + grouped view the merchant screen renders the player bag from. */
  merchantInventoryView: () => MerchantInventoryView
  /** Re-pushes the player bag into an already-open merchant screen. */
  syncMerchantIfOpen: () => void
  sellInventoryInstances: (instanceIds: readonly string[]) => TradeResult
  sharpenInventoryWeapon: (instanceId: string) => SharpenResult
  /** "Czytaj" (plan items-player-016) — interprets `kind` against
   *  `ITEM_CATALOG[kind].book` + `player.skills`, then resyncs the Skills
   *  screen state and shows the outcome via the existing toast pipeline. */
  readBookItem: (kind: ItemKind) => void
  /** "Odczytaj" on a treasure-map item (plan quests-progression-009). */
  readTreasureMapItem: (kind: ItemKind) => void
  /** "Wyrzuć" (plan items-player-024) — drops exactly `amount` of `kind`
   *  back into the world; `amount` is clamped to what's actually carried. */
  dropItems: (kind: ItemKind, amount: number) => void
  /** `instanceId` picks which concrete instance to equip for a weapon-
   *  maintenance kind — falls back to `HeldTool.equip()`'s own first-available
   *  resolution when omitted. */
  equipTool: (kind: ItemKind, instanceId?: string) => void
  unequipTool: () => void
  /** "Załóż" (plan items-player-030) — equips a concrete armor instance. */
  equipArmor: (instanceId: string) => void
  /** "Zdejmij" on an equipment slot (defaults to body when omitted). */
  unequipArmor: (slot?: EquipmentSlot) => void
  /** HUD primary-weapon shortcuts (plan `ui-input-002` §6) — equip whichever
   *  weapon `primaryWeapons` currently remembers, no-op if none is set. */
  equipPrimaryMeleeWeapon: () => void
  equipPrimaryRangedWeapon: () => void
  setPrimaryMeleeWeapon: (kind: ItemKind, instanceId: string | null) => void
  setPrimaryRangedWeapon: (kind: ItemKind, instanceId: string | null) => void
}

export type InventoryWiringDeps = {
  bundle: WorldBundle
  player: PlayerController
  inventory: Inventory
  heldTool: HeldTool
  equipment: EquipmentState
  primaryWeapons: PrimaryWeaponSelection
  playerTorch: PlayerTorch
  hud: Hud
  toast: Toast
  vueUi: VueUi
  questManager: QuestManager
  reputationManager: ReputationManager
  /** Persisted world flags (`SaveData.worldFlags`) — mutated in place. */
  worldFlags: {
    guardSwordGifted: boolean
    treasureMapDarkForestRead: boolean
    alphaWolfDeedEarned: boolean
    guardClaims: GuardWorldProgress['guardClaims']
  }
  guardProgress: GuardWorldProgress
  homeSettlementId: string
  homeGuardNpcId: string | undefined
  playOnce: ReturnType<typeof createWorldAudio>['playOnce']
  /** Adds an acquired item (creating an `ItemInstance` when the kind needs
   *  one) and re-syncs HUD/held tool — owned by `createApp.ts` because quest
   *  rewards use the same entry point. */
  grantItem: (kind: ItemKind, count: number) => void
  syncHeldHud: () => void
  syncQuickActionAvailability: () => void
  refreshInventoryScreen: () => void
  /** World Locations catalog/knowledge (plan world-012) — the guard's
   *  "Opowiedz mi coś o okolicy" topic and the merchant's Near/Far map
   *  purchases both reveal into the same player-wide `LocationKnowledge`. */
  locationCatalog: WorldLocationCatalog
  locationKnowledge: LocationKnowledge
  navigationTargets: NavigationTargets
  dayNight: DayNightState
  /** Opens the Player → NPC give sheet (plan items-player-027). */
  openNpcGiveItem: (npcId: string, displayName: string) => void
}

export function createInventoryWiring(deps: InventoryWiringDeps): InventoryWiring {
  const {
    bundle, player, inventory, heldTool, equipment, primaryWeapons, playerTorch, hud, toast, vueUi,
    questManager, reputationManager, worldFlags, guardProgress, homeSettlementId, homeGuardNpcId, playOnce, grantItem,
    locationCatalog, locationKnowledge, navigationTargets, dayNight, openNpcGiveItem,
  } = deps

  let activeMerchantPricing: MerchantPricing | null = null

  const findSettlementForNpc = (npc: NpcAgent | null): Settlement | null => {
    if (!npc) return null
    for (const settlement of bundle.settlementsManager.getLoaded()) {
      if (settlement.npcs.includes(npc)) return settlement
    }
    return null
  }

  const buildSellPriceContext = (npc: NpcAgent | null): SellPriceContext => {
    if (!npc) return NEUTRAL_SELL_PRICE_CONTEXT
    const settlement = findSettlementForNpc(npc)
    const settlementId = settlement?.id ?? null
    return {
      relation: questManager.getRelation(npc.id),
      relationLevel: questManager.getRelationLevel(npc.id),
      reputation: settlementId ? reputationManager.getReputation(settlementId) : NEUTRAL_SELL_PRICE_CONTEXT.reputation,
      renown: settlementId ? reputationManager.getRenown(settlementId) : 0,
    }
  }

  const createMerchantPricing = (npc: NpcAgent | null): MerchantPricing => {
    const context = buildSellPriceContext(npc)
    return {
      context,
      unitOfferPrice: (kind) => sellPrice(kind, context),
      offerLineTotal: (kind, count) => resolveOfferLineBuyback(inventory, kind, count, context).value,
      previewNetCoins: (purchases, offer) => previewTransactionNetCoins(inventory, purchases, offer, context),
    }
  }

  const merchantSellContext = (): SellPriceContext => (
    vueUi.isMerchantOpen() && activeMerchantPricing
      ? activeMerchantPricing.context
      : NEUTRAL_SELL_PRICE_CONTEXT
  )

  const nowDays = (): number => dayNight.elapsedDays

  const merchantInventoryView = () => ({
    counts: inventoryCountsForUi(inventory),
    groups: buildInventoryGroups(inventory, nowDays()),
  })

  const syncMerchantIfOpen = (): void => {
    if (vueUi.isMerchantOpen()) {
      const view = merchantInventoryView()
      vueUi.refreshMerchant(view.counts, view.groups)
    }
  }

  const sellInventoryInstances = (instanceIds: readonly string[]) => {
    const result = sellInstancesForCoins(inventory, instanceIds, merchantSellContext())
    if (result.result === 'ok') {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      heldTool.syncWithInventory()
      deps.syncHeldHud()
      deps.syncQuickActionAvailability()
      syncMerchantIfOpen()
      deps.refreshInventoryScreen()
      toast.show(`+${result.totalCoins} monet`, 'pickup')
      return 'ok' as const
    }
    return result.result
  }

  const sharpenInventoryWeapon = (instanceId: string): SharpenResult => {
    const result = sharpenWeapon(inventory, instanceId, 'whetstone')
    if (result === 'ok') {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      deps.refreshInventoryScreen()
      toast.show('Naostrzono broń.', 'pickup')
    }
    return result
  }

  const percent = (value: number): string => `${Math.round(value * 100)}%`

  /** "Czytaj" (plan items-player-016). The book is never consumed — only
   *  `player.skills` (via `readBook`'s `raiseSkillToValue`) and the UI can
   *  change. Inventory stays open (no `close()` call, unlike `onPlaceTrap`/
   *  `onPlaceContainer`), so this pushes its own resyncs instead of waiting
   *  for the next gated `gameLoop.ts` frame. */
  const readTreasureMapItem = (kind: ItemKind): void => {
    const map = ITEM_CATALOG[kind].treasureMap
    if (!map) return
    const result = revealLocationKnowledge(
      map.locationId,
      locationCatalog,
      locationKnowledge,
      navigationTargets,
      { setNavigation: true },
    )
    if (kind === 'treasure_map_dark_forest') worldFlags.treasureMapDarkForestRead = true
    questManager.onReadItem(kind)
    questManager.pollWorldProgressionObjectives()
    const name = result.locationName ?? 'ruiny'
    toast.show(
      result.newlyDiscovered ? `Odkryto: ${name}` : `Cel nawigacji: ${name}`,
      'pickup',
    )
  }

  const readBookItem = (kind: ItemKind): void => {
    const result = readBook(player.skills, kind)
    if (result.outcome === 'not_a_book' || !result.skill) return
    const label = SKILL_LABEL[result.skill]
    if (result.outcome === 'learned') {
      vueUi.pushSkillsState(player.skills)
      toast.show(
        `„${ITEM_DEFS[kind].label}” — ${label} ${percent(result.previousValue!)} → ${percent(result.value!)}`,
        'pickup',
      )
    } else if (result.outcome === 'too_low') {
      toast.show(
        `Ta książka jest dla ciebie zbyt zaawansowana. Wymagane: ${label} ${percent(result.requiredValue!)}, masz ${percent(result.previousValue!)}`,
        'error',
      )
    } else {
      toast.show(`Nie dowiadujesz się z tej książki niczego nowego. ${label}: ${percent(result.previousValue!)}`, 'info')
    }
    deps.refreshInventoryScreen()
  }

  /** Drops exactly `amount` of `kind` back into the world at the player's
   *  feet, scattered slightly — the "Wyrzuć" action in
   *  `createInventoryScreen.ts`. `amount` is clamped to what's actually
   *  carried; for an instance-backed kind the first `amount` instances (in
   *  `Inventory.getInstances()` order) are the ones dropped — a deterministic
   *  choice, since the shared quantity dialog only names a count, not
   *  concrete instances. Re-`refresh()`es the (already-open) screen
   *  immediately since world simulation is frozen while it's open (see the
   *  tick loop's modal-gating in `gameLoop.ts`) — nothing else will update it.
   *  Instance-backed kinds (weapons/traps/tents/containers) each carry their
   *  own identity and durability/sharpness/fill across the drop, same as a
   *  plain world pickup (plan 199). */
  const dropItems = (kind: ItemKind, amount: number): void => {
    const instanceBacked = isInstanceBackedKind(kind)
    const allInstances = instanceBacked ? inventory.getInstances(kind) : []
    const available = instanceBacked ? allInstances.length : inventory.count(kind)
    const count = Math.min(Math.max(0, Math.floor(amount)), available)
    if (count <= 0) return
    const instances = instanceBacked ? allInstances.slice(0, count) : []
    let unitBatches: ReturnType<typeof expandFoodBatchesToUnits> = []
    if (instanceBacked) {
      for (const instance of instances) inventory.removeInstance(instance.id)
    } else {
      const removed = inventory.removeWithFreshness(kind, count, nowDays())
      if (!removed) return
      unitBatches = expandFoodBatchesToUnits(removed)
    }
    heldTool.syncWithInventory()
    if (playerTorch.isLit() && playerTorch.source() === 'wooden_torch' && heldTool.held() !== 'wooden_torch') {
      playerTorch.extinguish()
    }
    for (let i = 0; i < count; i++) {
      const angle = i * ((Math.PI * 2) / count)
      bundle.droppedItems.drop(
        kind,
        player.mesh.position.x + Math.cos(angle) * 0.6,
        player.mesh.position.z + Math.sin(angle) * 0.6,
        instanceBacked ? toSaveItemInstance(instances[i]!) : undefined,
        undefined,
        unitBatches[i],
      )
    }
    playInventoryDrop(playOnce)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    deps.syncHeldHud()
    deps.syncQuickActionAvailability()
    deps.refreshInventoryScreen()
  }

  const equipTool = (kind: ItemKind, instanceId?: string): void => {
    if (playerTorch.isLit()) playerTorch.extinguish()
    if (!heldTool.equip(kind, instanceId)) return
    primaryWeapons.noteEquipped(kind, heldTool.heldInstanceId())
    deps.syncHeldHud()
    deps.refreshInventoryScreen()
  }

  const unequipTool = (): void => {
    if (playerTorch.isLit()) playerTorch.extinguish()
    heldTool.unequip()
    deps.syncHeldHud()
    deps.refreshInventoryScreen()
  }

  /** "Załóż"/"Zdejmij" for wearable armor (plan items-player-030) —
   *  independent of `HeldTool`/`playerTorch`: worn equipment has no hand-slot
   *  interaction and isn't a light source. */
  const equipArmor = (instanceId: string): void => {
    if (!equipment.equip(instanceId, inventory)) return
    deps.refreshInventoryScreen()
  }

  const unequipArmor = (slot: EquipmentSlot = 'body'): void => {
    equipment.unequip(slot)
    deps.refreshInventoryScreen()
  }

  const equipPrimary = (choice: ReturnType<PrimaryWeaponSelection['primaryMelee']>): void => {
    if (!choice) return
    if (playerTorch.isLit()) playerTorch.extinguish()
    if (!heldTool.equip(choice.kind, choice.instanceId ?? undefined)) return
    deps.syncHeldHud()
    deps.refreshInventoryScreen()
  }
  const equipPrimaryMeleeWeapon = (): void => equipPrimary(primaryWeapons.primaryMelee())
  const equipPrimaryRangedWeapon = (): void => equipPrimary(primaryWeapons.primaryRanged())

  const setPrimaryMeleeWeapon = (kind: ItemKind, instanceId: string | null): void => {
    if (!isMeleeToolKind(kind) || !inventoryOwnsPrimaryWeaponChoice(inventory, kind, instanceId)) return
    primaryWeapons.setPrimaryMelee({ kind, instanceId })
    deps.syncHeldHud()
    deps.refreshInventoryScreen()
  }

  const setPrimaryRangedWeapon = (kind: ItemKind, instanceId: string | null): void => {
    if (!isRangedTool(kind) || !inventoryOwnsPrimaryWeaponChoice(inventory, kind, instanceId)) return
    primaryWeapons.setPrimaryRanged({ kind, instanceId })
    deps.syncHeldHud()
    deps.refreshInventoryScreen()
  }

  /** Shared by every merchant buy/sell path: weight/held-tool/quick-action
   *  resync plus a full merchant re-render. */
  const horseAcquisitionStatus = (settlement: Settlement): ReturnType<typeof getHorseAcquisitionState> => {
    const animalId = merchantHorseAnimalId(settlement.id)
    const animal = resolveMerchantHorseAnimal(
      (id) => bundle.settlementsManager.resolvePersistentAnimal(id),
      settlement.id,
    )
    return getHorseAcquisitionState({
      animal,
      isReservedByQuest: questManager.isHorseRewardReserving(animalId),
    })
  }

  const buildMerchantHorseOffer = (settlement: Settlement | null): MerchantHorseOffer | null => {
    if (!settlement) return null
    const animalId = merchantHorseAnimalId(settlement.id)
    const status = horseAcquisitionStatus(settlement)
    return {
      label: 'Koń przy wozie',
      price: MERCHANT_HORSE_PRICE,
      status,
      statusHint: horseOfferStatusHint(status),
      previewNetCoins: (offer) => previewPricedPurchaseNetCoins(inventory, MERCHANT_HORSE_PRICE, offer, merchantSellContext()),
      onPurchase: (offer) => {
        if (horseAcquisitionStatus(settlement) !== 'available') return 'not_sold'
        const result = settlePricedPurchase(
          inventory,
          MERCHANT_HORSE_PRICE,
          offer,
          merchantSellContext(),
          () => bundle.settlementsManager.transferAnimalOwnership(animalId, { kind: 'player' }),
        )
        if (result === 'ok') {
          afterTrade(buildMerchantHorseOffer(settlement))
          toast.show('Koń jest teraz twój.', 'pickup')
        }
        return result
      },
    }
  }

  const afterTrade = (horseOffer?: MerchantHorseOffer | null): void => {
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    heldTool.syncWithInventory()
    deps.syncHeldHud()
    deps.syncQuickActionAvailability()
    const view = merchantInventoryView()
    const npc = ui.merchant.npc as NpcAgent | null
    const settlement = findSettlementForNpc(npc)
    vueUi.refreshMerchant(view.counts, view.groups, horseOffer ?? buildMerchantHorseOffer(settlement))
  }

  /** Applies a purchased Near/Far map's knowledge immediately (plan §9/§10)
   *  — the item itself is just a knowledge-delivery token; keeping or
   *  selling it afterwards never revokes what it already revealed. Origin
   *  is wherever the player is standing (the home trader), matching the
   *  guard's own "wherever this conversation is happening" reference point. */
  const applyLocationMap = async (range: 'map_near' | 'map_far'): Promise<number> => {
    const originX = player.mesh.position.x
    const originZ = player.mesh.position.z
    const minKm = range === 'map_near' ? 0 : MEDIUM_RANGE_KM
    const maxKm = range === 'map_near' ? NEAR_RANGE_KM : FAR_RANGE_KM
    const landmarks = await withLocationDiscoveryBusy((onProgress) =>
      landmarksInBandAsync(locationCatalog, originX, originZ, minKm, maxKm, { onProgress }),
    )
    const settlements = range === 'map_near'
      ? settlementsInBand(locationCatalog, originX, originZ, 0, NEAR_RANGE_KM)
      : settlementsInBand(locationCatalog, originX, originZ, MEDIUM_RANGE_KM, FAR_RANGE_KM)
    let newly = 0
    for (const location of [...weightedTopN(landmarks, MERCHANT_MAP_LANDMARK_POOL_SIZE), ...settlements]) {
      if (locationKnowledge.reveal(location.id, 'discovered', 'map')) newly++
    }
    return newly
  }

  vueUi.configureMerchant({
    onSettleTransaction: async (purchases, offer) => {
      const result = settleTransaction(inventory, purchases, offer, merchantSellContext())
      if (result === 'ok') {
        afterTrade()
        const needsNear = (purchases.map_near ?? 0) > 0
        const needsFar = (purchases.map_far ?? 0) > 0
        if (!needsNear && !needsFar) {
          toast.show('Transakcja zakończona.', 'pickup')
          return result
        }
        let newlyDiscovered = 0
        if (needsNear) newlyDiscovered += await applyLocationMap('map_near')
        if (needsFar) newlyDiscovered += await applyLocationMap('map_far')
        toast.show(newlyDiscovered > 0 ? `Odkryto ${newlyDiscovered} nowych miejsc.` : 'Transakcja zakończona.', 'pickup')
      }
      return result
    },
    onSellInstances: sellInventoryInstances,
  })

  /** Plan 152 — "Poproś o jedzenie"/"Poproś o wodę". `npc.resolveAssistanceRequest`
   *  only decides (reading the NPC's own carried `Inventory`/relation/needs);
   *  the actual transfer happens here, only once the player's inventory can
   *  actually receive the item (plan's "Inventory atomicity" ordering). */
  const resolveAssistanceDialogue = (npc: NpcAgent, kind: 'food' | 'water'): string => {
    const result = npc.resolveAssistanceRequest(kind)
    if (result.outcome !== 'given' || !result.itemKind) return requestAssistanceLine(kind, result.outcome)
    const itemKind = result.itemKind
    if (!inventory.canAdd(itemKind, 1)) return requestAssistanceLine(kind, 'inventory_full')
    if (!npc.takeCarriedConsumable(itemKind)) return requestAssistanceLine(kind, 'no_item')
    inventory.add(itemKind, 1)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    deps.syncHeldHud()
    deps.syncQuickActionAvailability()
    toast.show(`+1 ${ITEM_DEFS[itemKind].label}`, 'pickup')
    return requestAssistanceLine(kind, 'given')
  }

  const resolveHomeGuardRewardInput = (npc: NpcAgent) => {
    const settlement = findSettlementForNpc(npc)
    if (!homeGuardNpcId || npc.id !== homeGuardNpcId || settlement?.id !== homeSettlementId) return null
    const claims = getGuardClaimState(guardProgress, npc.id)
    return {
      guardNpcId: npc.id,
      relationLevel: questManager.getRelationLevel(npc.id),
      settlementRenown: reputationManager.getRenown(homeSettlementId),
      alphaWolfDeedEarned: guardProgress.alphaWolfDeedEarned,
      playerHasLongSword: inventory.holdsAny('long_sword'),
      claims,
      legacySwordGifted: guardProgress.guardSwordGifted,
    }
  }

  vueUi.configureNpcDialogueMenu({
    onClaimGuardReward: () => {
      const npc = ui.npcDialogueMenu.npc as NpcAgent | null
      if (!npc) return ''
      const input = resolveHomeGuardRewardInput(npc)
      if (!input) return 'To nie jest strażnik z twojej osady.'
      const decision = resolveNextGuardReward(input)
      if (decision.kind === 'none') return decision.line
      for (const item of decision.items) grantItem(item.kind, item.count)
      if (decision.markTorchGift) applyGuardClaimMutation(guardProgress, npc.id, { torchGiftClaimed: true })
      if (decision.markRenownRoute) applyGuardClaimMutation(guardProgress, npc.id, { renownRouteClaimed: true })
      if (decision.markAlphaRoute) applyGuardClaimMutation(guardProgress, npc.id, { alphaRouteClaimed: true })
      if (decision.markSwordConsumed) {
        applyGuardClaimMutation(guardProgress, npc.id, { swordRewardConsumed: true })
        guardProgress.guardSwordGifted = true
        worldFlags.guardSwordGifted = true
      }
      worldFlags.guardClaims = guardProgress.guardClaims
      return decision.line
    },
    getCanClaimGuardReward: () => {
      const npc = ui.npcDialogueMenu.npc as NpcAgent | null
      if (!npc) return false
      const input = resolveHomeGuardRewardInput(npc)
      if (!input) return false
      return guardRewardTopicAvailable(input)
    },
    onOpenTrade: () => {
      const view = merchantInventoryView()
      const npc = ui.npcDialogueMenu.npc as NpcAgent | null
      const pricing = createMerchantPricing(npc)
      activeMerchantPricing = pricing
      const settlement = findSettlementForNpc(npc)
      vueUi.openMerchantFromDialogue(view.counts, view.groups, pricing, buildMerchantHorseOffer(settlement))
    },
    onRequestFood: (npc) => resolveAssistanceDialogue(npc, 'food'),
    onRequestWater: (npc) => resolveAssistanceDialogue(npc, 'water'),
    onAskAboutArea: async () => {
      const originX = player.mesh.position.x
      const originZ = player.mesh.position.z
      const homeId = bundle.settlementsManager.home ? settlementLocationId(bundle.settlementsManager.home) : null

      const pool = weightedTopN(
        await withLocationDiscoveryBusy((onProgress) =>
          locationCatalog.landmarksInRangeAsync(originX, originZ, 0, MEDIUM_RANGE_KM, { onProgress }),
        ),
        GUARD_LANDMARK_POOL_SIZE,
      )
      const revealedLandmarks = pickRandomReveal(pool, GUARD_REVEAL_MIN, GUARD_REVEAL_MAX, Math.random)
        .filter((location) => locationKnowledge.reveal(location.id, 'discovered', 'npc'))

      const nearbySettlements = locationCatalog.nearestSettlements(originX, originZ, MEDIUM_RANGE_KM)
        .filter((location) => location.id !== homeId)
        .slice(0, GUARD_SETTLEMENT_REVEAL_COUNT)
      const revealedSettlements = nearbySettlements.filter((location) => locationKnowledge.reveal(location.id, 'discovered', 'npc'))

      return aboutAreaLine([...revealedLandmarks, ...revealedSettlements].map((location) => location.name))
    },
    onPayWage: () => {
      const npc = ui.npcDialogueMenu.npc as NpcAgent | null
      const claim = ui.npcDialogueMenu.paymentClaim
      if (!npc || !claim) return 'Nie mam nic do wypłaty.'
      const result = payWorkContractAssignment(
        {
          workContracts: bundle.workContracts,
          getNpcState: (id) => bundle.settlementsManager.getNpcState(id),
          playerInventory: inventory,
        },
        { contractId: claim.contractId, npcId: npc.id, nowDays: dayNight.elapsedDays },
      )
      if (result.status === 'paid') {
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        deps.syncQuickActionAvailability()
        toast.show(`Zapłacono ${result.coins} monet.`, 'info')
        ui.npcDialogueMenu.paymentClaim = null
        return `Dziękuję. ${result.coins} monet — to zgadza się z umową.`
      }
      if (result.status === 'insufficient_coins') {
        toast.show('Za mało monet, żeby zapłacić za pracę.', 'error')
        return 'Nie masz przy sobie tyle monet.'
      }
      if (result.status === 'destination_full') {
        toast.show('Najemnik nie uniesie już więcej.', 'error')
        return 'Nie dam rady wziąć tyle monet — nie mam miejsca.'
      }
      if (result.status === 'worker_missing') {
        toast.show('Nie można teraz wypłacić wynagrodzenia.', 'error')
        return 'Coś jest nie tak — spróbuj za chwilę.'
      }
      ui.npcDialogueMenu.paymentClaim = null
      return 'Ta należność nie jest już aktualna.'
    },
    onGiveItem: () => {
      const npc = ui.npcDialogueMenu.npc as NpcAgent | null
      if (!npc) return
      openNpcGiveItem(npc.id, npc.displayName)
    },
    onRespondToJoinProposal: (accept) => {
      const npc = ui.npcDialogueMenu.npc as NpcAgent | null
      if (!npc) return 'Coś jest nie tak — spróbuj za chwilę.'
      const evaluation = npc.respondToVoluntaryJoinProposal(accept, dayNight.timeOfDay)
      ui.npcDialogueMenu.joinProposal = null
      // `accept: false` is the player declining the NPC's own offer — an
      // ordinary social result, not the NPC refusing (plan "Refusal should
      // be an ordinary social result... not create a permanent anti-
      // companion state or relationship penalty by default").
      if (!accept) return 'Rozumiem, innym razem.'
      if (!evaluation) return 'Ta propozycja już nieaktualna.'
      return voluntaryJoinResponseLine(isVoluntaryJoinAccepted(evaluation), evaluation.blockers)
    },
    onProposeJoin: (durationDays) => {
      const npc = ui.npcDialogueMenu.npc as NpcAgent | null
      if (!npc) return 'Coś jest nie tak — spróbuj za chwilę.'
      const terms: VoluntaryExpeditionTerms = { completionPolicy: 'duration', durationDays }
      const evaluation = npc.respondToVoluntaryJoinInvitation(terms, dayNight.timeOfDay)
      return voluntaryJoinResponseLine(isVoluntaryJoinAccepted(evaluation), evaluation.blockers)
    },
  })

  return {
    merchantInventoryView,
    syncMerchantIfOpen,
    sellInventoryInstances,
    sharpenInventoryWeapon,
    readBookItem,
    readTreasureMapItem,
    dropItems,
    equipTool,
    unequipTool,
    equipArmor,
    unequipArmor,
    equipPrimaryMeleeWeapon,
    equipPrimaryRangedWeapon,
    setPrimaryMeleeWeapon,
    setPrimaryRangedWeapon,
  }
}

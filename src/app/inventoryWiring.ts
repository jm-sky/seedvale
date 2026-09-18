import type { NpcAgent } from '../ai/NpcAgent'
import type { NpcWorldKnowledgeFollowUpSource } from '../ai/npcPlayerFollowUp'
import type { createWorldAudio } from '../audio/createWorldAudio'
import type { EquipmentSlot, EquipmentState } from '../items/equipment'
import type { HeldTool } from '../items/HeldTool'
import type { Inventory } from '../items/Inventory'
import type { InventoryGroupView } from '../items/inventoryView'
import type { ItemKind } from '../items/items'
import type { PrimaryWeaponSelection } from '../items/primaryWeapons'
import type { TradeResult } from '../items/trade'
import type { CombatWeaponCategory, PlayerCombatMode } from '../player/playerCombatMode'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { QuestManager } from '../quests/QuestManager'
import type { ReputationManager } from '../reputation/ReputationManager'
import type { Settlement } from '../settlement/createSettlement'
import type { VueUi } from '../ui-vue/mount'
import type { MerchantPricing } from '../ui-vue/store'
import type { MerchantHorseOffer } from '../ui-vue/store'
import type { NpcTradeStockRow } from '../ui-vue/store'
import type { Hud } from '../ui/createHud'
import type { Toast } from '../ui/createToast'
import type { DayNightState } from '../world/dayNight'
import type { GuardLocalKnowledge } from '../world/locations/guardLocalKnowledge'
import type { LocationKnowledge } from '../world/locations/locationKnowledge'
import type { NavigationTargets } from '../world/locations/navigationTargets'
import type { WorldLocationCatalog } from '../world/locations/worldLocationCatalog'
import type { WorldBundle } from './worldBundle'
import { requestAssistanceLine, voluntaryJoinResponseLine } from '../ai/dialogueTemplates'
import { npcTradeSourceInventory, resolveNpcTradeOffers } from '../ai/npcTradeAvailability'
import { isVoluntaryJoinAccepted, type VoluntaryExpeditionTerms } from '../ai/voluntaryExpeditionJoin'
import { playActionGrindstoneSharpen, playActionWhetstoneSharpen } from '../audio/actionSounds'
import { playInventoryDrop } from '../audio/inventorySounds'
import { resolveEffectiveArmorPiece } from '../items/armorItemInstances'
import { readBook } from '../items/books'
import { expandFoodBatchesToUnits } from '../items/foodItems'
import { toSaveItemInstance } from '../items/Inventory'
import { buildInventoryGroups, inventoryCountsForUi } from '../items/inventoryView'
import { isMeleeToolKind, isRangedTool, ITEM_CATALOG } from '../items/itemCatalog'
import {
  ARMOR_QUALITY_LABELS,
  isArmorItemInstance,
  isArmorKind,
  isInstanceBackedKind,
} from '../items/itemInstances'
import { ITEM_DEFS } from '../items/items'
import { inventoryOwnsPrimaryWeaponChoice } from '../items/primaryWeapons'
import {
  type OwnedGoodsPurchaseLine,
  previewPricedPurchaseNetCoins,
  previewTransactionNetCoins,
  resolveOfferLineBuyback,
  sellInstancesForCoins,
  settleMerchantStockTransaction,
  settleOwnedGoodsPurchase,
  settlePricedPurchase,
} from '../items/trade'
import { MERCHANT_STOCK, merchantInstancePrice, merchantPrice, NEUTRAL_SELL_PRICE_CONTEXT, npcSalePrice, sellPrice, type SellPriceContext } from '../items/tradeCatalog'
import { applyPurchaseMarkup, type TradeGrievanceStore } from '../items/tradeGrievance'
import { listOwnedWeaponMaintenance, type SharpenResult, sharpenWeapon } from '../items/weaponMaintenance'
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
  listVendorHorseAnimals,
  MERCHANT_HORSE_PRICE,
  merchantHorseAnimalId,
  resolveMerchantHorseAnimal,
  vendorHorseOfferLabel,
  vendorHorseOfferPrice,
} from '../settlement/horseAcquisition'
import { horseVendorNpcId } from '../settlement/merchantTrade'
import { hideBusy, showBusy, ui } from '../ui-vue/store'
import { GUARD_AREA_RESEARCH_PENDING } from '../world/locations/guardLocalKnowledge'
import {
  FAR_RANGE_KM,
  MEDIUM_RANGE_KM,
  MERCHANT_MAP_LANDMARK_POOL_SIZE,
  NEAR_RANGE_KM,
} from '../world/locations/locationConfig'
import {
  landmarksInBandAsync,
  settlementsInBand,
  weightedTopN,
} from '../world/locations/locationDiscovery'
import { deliverNpcWorldKnowledgeFollowUp } from '../world/locations/npcPlayerFollowUpDelivery'
import { revealLocationKnowledge } from '../world/locations/revealLocationKnowledge'
import { payWorkContractAssignment } from './actions/workContractPayment'

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
  /** `[E]` on a blacksmith grind workbench — FlavorDialog over live instances. */
  openGrindstoneSharpen: () => void
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
  /** HUD primary-weapon shortcuts (plan `ui-input-002` §6 / ui-input-018) —
   *  draw the configured primary, or sheathe when Combat Mode is active. */
  equipPrimaryMeleeWeapon: () => void
  equipPrimaryRangedWeapon: () => void
  sheatheCombatWeapon: () => void
  /** Keyboard `X` — sheathe when active, otherwise draw lastActiveWeapon
   *  with fallback to the other configured primary. */
  toggleCombatMode: () => void
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
  playerCombatMode: PlayerCombatMode
  playerTorch: PlayerTorch
  hud: Hud
  toast: Toast
  vueUi: VueUi
  questManager: QuestManager
  reputationManager: ReputationManager
  /** Temporary merchant purchase markup (plan items-player-042). */
  tradeGrievances: TradeGrievanceStore
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
  /** Body-armor → UBC Peasant/Ranger (plan items-player-034). */
  syncPlayerAppearance: () => void
  /** World Locations catalog/knowledge (plan world-012) — the guard's
   *  "Opowiedz mi coś o okolicy" topic and the merchant's Near/Far map
   *  purchases both reveal into the same player-wide `LocationKnowledge`. */
  locationCatalog: WorldLocationCatalog
  locationKnowledge: LocationKnowledge
  navigationTargets: NavigationTargets
  dayNight: DayNightState
  /** Per-asking-NPC deferred local-knowledge research (plan
   *  quests-progression-047, generalized by npc-050). */
  guardLocalKnowledge: Pick<GuardLocalKnowledge, 'askAboutArea'>
  /** Opens the Player → NPC give sheet (plan items-player-027). */
  openNpcGiveItem: (npcId: string, displayName: string) => void
}

/** Dialogue `Handel` is available for any living NPC in a normal dialogue
 *  session. Live stock must not hide the trade surface; empty offers open
 *  `npcGoods` with an empty-state screen instead.
 *
 * @domain settlements-npcs
 */
export function npcDialogueCanTrade(npc: NpcAgent | null): boolean {
  return !!npc && !npc.health.dead
}

export function createInventoryWiring(deps: InventoryWiringDeps): InventoryWiring {
  const {
    bundle, player, inventory, heldTool, equipment, primaryWeapons, playerCombatMode, playerTorch, hud, toast, vueUi,
    questManager, reputationManager, tradeGrievances, worldFlags, guardProgress, homeSettlementId, homeGuardNpcId, playOnce, grantItem,
    locationCatalog, locationKnowledge, navigationTargets, dayNight, openNpcGiveItem,
    guardLocalKnowledge,
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

  const merchantPurchaseMarkup = (npc: NpcAgent | null): number => (
    npc ? tradeGrievances.markupFor(npc.id, dayNight.elapsedDays) : 0
  )

  const createMerchantPricing = (npc: NpcAgent | null): MerchantPricing => {
    const context = buildSellPriceContext(npc)
    const purchaseMarkup = merchantPurchaseMarkup(npc)
    return {
      context,
      unitOfferPrice: (kind) => sellPrice(kind, context),
      offerLineTotal: (kind, count) => resolveOfferLineBuyback(inventory, kind, count, context).value,
      previewNetCoins: (purchases, offer, instanceBuyCost = 0) => (
        previewTransactionNetCoins(inventory, purchases, offer, context, instanceBuyCost, purchaseMarkup)
      ),
    }
  }

  const merchantSellContext = (): SellPriceContext => (
    vueUi.isMerchantOpen() && activeMerchantPricing
      ? activeMerchantPricing.context
      : NEUTRAL_SELL_PRICE_CONTEXT
  )

  /** Any live Trader is a Merchant (plan settlements-012). Home-only extras
   *  (wagon horse) stay gated separately. Ordinary non-trader NPCs never
   *  receive catalog merchant stock. */
  const isMerchantNpc = (npc: NpcAgent | null): boolean => {
    return !!npc && npc.role === 'trader'
  }

  const buildNpcTradeStock = (npc: NpcAgent | null): NpcTradeStockRow[] => {
    if (!npc) return []
    const settlementNpcs = findSettlementForNpc(npc)?.npcs ?? []
    const context = buildSellPriceContext(npc)
    return resolveNpcTradeOffers(npc, settlementNpcs).map((offer) => ({
      kind: offer.kind,
      quantity: offer.quantity,
      unitPrice: npcSalePrice(offer.kind, context),
      owner: offer.owner,
    }))
  }

  const armorPenaltyLabel = (value: number): string => {
    const delta = Math.round((value - 1) * 100)
    return delta === 0 ? '±0%' : `${delta > 0 ? '+' : ''}${delta}%`
  }

  /** Live BUY rows from finite Merchant stock — catalog order and
   *  instance-aware prices, never minted at open time (plan settlements-012 /
   *  items-player-040). Armor is one row per physical instance. */
  const buildMerchantTradeStock = (npc: NpcAgent | null): NpcTradeStockRow[] => {
    if (!npc) return []
    const merchantStock = bundle.settlementsManager.getNpcState(npc.id)?.merchantStock
    if (!merchantStock) return []
    const rows: NpcTradeStockRow[] = []
    for (const kind of MERCHANT_STOCK) {
      if (isArmorKind(kind)) {
        const instances = merchantStock.getInstances(kind)
          .filter(isArmorItemInstance)
          .sort((a, b) => a.id.localeCompare(b.id))
        for (const instance of instances) {
          const unitPrice = merchantInstancePrice(instance)
          if (unitPrice == null) continue
          const armor = ITEM_CATALOG[instance.kind].armor
          const effective = armor
            ? resolveEffectiveArmorPiece(armor, instance.quality, ITEM_DEFS[instance.kind].weight)
            : null
          rows.push({
            kind,
            quantity: 1,
            unitPrice: applyPurchaseMarkup(unitPrice, merchantPurchaseMarkup(npc)),
            instanceId: instance.id,
            quality: instance.quality,
            qualityLabel: ARMOR_QUALITY_LABELS[instance.quality],
            weightKg: effective?.weightKg ?? ITEM_DEFS[kind].weight,
            protectionPercent: effective ? Math.round(effective.damageReduction * 100) : undefined,
            staminaPenaltyLabel: effective ? armorPenaltyLabel(effective.staminaCostMultiplier) : undefined,
            movementPenaltyLabel: effective ? armorPenaltyLabel(effective.movementSpeedMultiplier) : undefined,
            recoveryPenaltyLabel: effective ? armorPenaltyLabel(effective.meleeRecoveryMultiplier) : undefined,
          })
        }
        continue
      }
      const quantity = isInstanceBackedKind(kind)
        ? merchantStock.countInstances(kind)
        : merchantStock.count(kind)
      if (quantity <= 0) continue
      const unitPrice = merchantPrice(kind)
      if (unitPrice == null) continue
      rows.push({
        kind,
        quantity,
        unitPrice: applyPurchaseMarkup(unitPrice, merchantPurchaseMarkup(npc)),
        weightKg: ITEM_DEFS[kind].weight,
      })
    }
    return rows
  }

  /** Ordinary NPC trade commit (plan settlements-npcs-033 §4 /
   *  settlements-npcs-036) — re-resolves live owner, sellable quantity and
   *  live social price for every requested kind right before mutating
   *  anything (the plan's live revalidation contract), then hands the
   *  revalidated basket to `settleOwnedGoodsPurchase`. Coin-only V1 (§8):
   *  any non-empty `offer` is rejected rather than silently dropped, since
   *  ordinary NPCs have no established barter-goods owner. */
  const settleNpcGoodsTransaction = (
    purchases: Partial<Record<ItemKind, number>>,
    offer: Partial<Record<ItemKind, number>>,
  ): TradeResult => {
    if ((Object.values(offer) as number[]).some((count) => count > 0)) return 'invalid_offer'
    const npc = ui.merchant.npc as NpcAgent | null
    if (!npc || npc.health.dead) return 'not_sold'
    const settlementNpcs = findSettlementForNpc(npc)?.npcs ?? []
    const context = buildSellPriceContext(npc)
    const liveOffers = resolveNpcTradeOffers(npc, settlementNpcs)
    const lines: OwnedGoodsPurchaseLine[] = []
    for (const [kind, count] of Object.entries(purchases) as [ItemKind, number][]) {
      if (count <= 0) continue
      const live = liveOffers.find((row) => row.kind === kind)
      if (!live || count > live.quantity) return 'not_sold'
      const source = npcTradeSourceInventory(live.owner, npc)
      if (!source) return 'not_sold'
      lines.push({ kind, count, unitPrice: npcSalePrice(kind, context), source })
    }
    if (lines.length === 0) return 'invalid_offer'
    const npcState = bundle.settlementsManager.getNpcState(npc.id)
    if (!npcState) return 'not_sold'
    const defaultSource = npc.household?.items ?? npcState.personalInventory
    const result = settleOwnedGoodsPurchase(inventory, defaultSource, npcState.personalInventory, lines)
    if (result === 'ok') {
      afterTrade()
      const totalPrice = lines.reduce((sum, line) => sum + line.unitPrice * line.count, 0)
      toast.show(`Zapłacono ${totalPrice} monet.`, 'pickup')
    }
    return result
  }

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
      deps.syncPlayerAppearance()
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
      playActionWhetstoneSharpen(playOnce)
      toast.show('Naostrzono broń.', 'pickup')
    }
    return result
  }

  const applyGrindstoneSharpen = (instanceId: string): SharpenResult => {
    const result = sharpenWeapon(inventory, instanceId, 'grindstone')
    if (result === 'ok') {
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      deps.refreshInventoryScreen()
      playActionGrindstoneSharpen(playOnce)
      toast.show('Naostrzono broń.', 'pickup')
    } else if (result === 'already_max') {
      toast.show('Ostrość jest już maksymalna.', 'error')
    } else {
      toast.show('Nie można naostrzyć tej broni.', 'error')
    }
    return result
  }

  const openGrindstoneSharpen = (): void => {
    const weapons = listOwnedWeaponMaintenance(inventory)
    if (weapons.length === 0) {
      toast.show('Nie masz broni do naostrzenia.', 'info')
      return
    }
    vueUi.openFlavorDialog(
      'Kamień szlifierski',
      'Wybierz broń do naostrzenia.',
      weapons.map((weapon) => {
        const maxed = weapon.sharpness >= 1
        return {
          label: `${ITEM_DEFS[weapon.kind].label} · Ostrość ${weapon.sharpnessPercent}%`,
          enabled: !maxed,
          reasonLabel: maxed ? 'Naostrzona' : '',
          run: () => {
            const result = applyGrindstoneSharpen(weapon.instanceId)
            if (result === 'ok') openGrindstoneSharpen()
          },
        }
      }),
    )
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
    deps.syncPlayerAppearance()
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
    deps.syncPlayerAppearance()
    deps.refreshInventoryScreen()
  }

  const unequipArmor = (slot: EquipmentSlot = 'body'): void => {
    equipment.unequip(slot)
    deps.syncPlayerAppearance()
    deps.refreshInventoryScreen()
  }

  const equipPrimary = (
    choice: ReturnType<PrimaryWeaponSelection['primaryMelee']>,
    category: CombatWeaponCategory,
  ): boolean => {
    if (!choice) return false
    if (playerTorch.isLit()) playerTorch.extinguish()
    if (!heldTool.equip(choice.kind, choice.instanceId ?? undefined)) return false
    playerCombatMode.noteDrawn(category)
    deps.syncHeldHud()
    deps.refreshInventoryScreen()
    return true
  }
  const equipPrimaryMeleeWeapon = (): void => {
    equipPrimary(primaryWeapons.primaryMelee(), 'melee')
  }
  const equipPrimaryRangedWeapon = (): void => {
    equipPrimary(primaryWeapons.primaryRanged(), 'ranged')
  }

  /** Sheathes the drawn primary combat weapon and leaves the hand empty (V1). */
  const sheatheCombatWeapon = (): void => {
    if (!playerCombatMode.isActive()) return
    playerCombatMode.noteSheathed()
    unequipTool()
  }

  const toggleCombatMode = (): void => {
    if (playerCombatMode.isActive()) {
      sheatheCombatWeapon()
      return
    }
    const last = playerCombatMode.lastActiveWeapon()
    const other: CombatWeaponCategory = last === 'melee' ? 'ranged' : 'melee'
    const draw = (category: CombatWeaponCategory): boolean =>
      equipPrimary(
        category === 'melee' ? primaryWeapons.primaryMelee() : primaryWeapons.primaryRanged(),
        category,
      )
    if (draw(last) || draw(other)) return
    toast.show('Nie masz skonfigurowanej broni.', 'info')
  }

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

  const buildMerchantHorseOffer = (settlement: Settlement | null, npc: NpcAgent | null = null): MerchantHorseOffer | null => {
    if (!settlement?.isHome) return null
    const animalId = merchantHorseAnimalId(settlement.id)
    const status = horseAcquisitionStatus(settlement)
    const price = applyPurchaseMarkup(MERCHANT_HORSE_PRICE, merchantPurchaseMarkup(npc))
    return {
      label: 'Koń przy wozie',
      price,
      status,
      statusHint: horseOfferStatusHint(status),
      previewNetCoins: (offer) => previewPricedPurchaseNetCoins(
        inventory,
        applyPurchaseMarkup(MERCHANT_HORSE_PRICE, merchantPurchaseMarkup(npc)),
        offer,
        merchantSellContext(),
      ),
      onPurchase: (offer) => {
        if (horseAcquisitionStatus(settlement) !== 'available') return 'not_sold'
        const livePrice = applyPurchaseMarkup(MERCHANT_HORSE_PRICE, merchantPurchaseMarkup(npc))
        const result = settlePricedPurchase(
          inventory,
          livePrice,
          offer,
          merchantSellContext(),
          () => bundle.settlementsManager.transferAnimalOwnership(animalId, { kind: 'player' }),
        )
        if (result === 'ok') {
          afterTrade(buildHorseOffers(settlement, npc))
          toast.show('Koń jest teraz twój.', 'pickup')
        }
        return result
      },
    }
  }

  const buildVendorPaddockHorseOffers = (settlement: Settlement, npc: NpcAgent | null): MerchantHorseOffer[] => {
    const horses = listVendorHorseAnimals(
      settlement.livestock,
      settlement.id,
      (animalId) => questManager.isHorseRewardReserving(animalId),
    )
    return horses.map((animal) => {
      const animalId = animal.animalId
      const basePrice = vendorHorseOfferPrice(animal)
      const status = getHorseAcquisitionState({
        animal,
        isReservedByQuest: questManager.isHorseRewardReserving(animalId),
      })
      return {
        label: vendorHorseOfferLabel(animal),
        price: applyPurchaseMarkup(basePrice, merchantPurchaseMarkup(npc)),
        status,
        statusHint: horseOfferStatusHint(status),
        previewNetCoins: (offer) => previewPricedPurchaseNetCoins(
          inventory,
          applyPurchaseMarkup(vendorHorseOfferPrice(
            bundle.settlementsManager.resolvePersistentAnimal(animalId) ?? animal,
          ), merchantPurchaseMarkup(npc)),
          offer,
          merchantSellContext(),
        ),
        onPurchase: (offer) => {
          const live = bundle.settlementsManager.resolvePersistentAnimal(animalId)
          if (!live || live.isDead() || live.isPlayerOwned()) return 'not_sold'
          if (live.paddockStay()?.settlementId !== settlement.id) return 'not_sold'
          const livePrice = applyPurchaseMarkup(vendorHorseOfferPrice(live), merchantPurchaseMarkup(npc))
          const result = settlePricedPurchase(
            inventory,
            livePrice,
            offer,
            merchantSellContext(),
            () => bundle.settlementsManager.transferAnimalOwnership(animalId, { kind: 'player' }),
          )
          if (result === 'ok') {
            afterTrade(buildHorseOffers(settlement, npc))
            toast.show('Koń jest teraz twój.', 'pickup')
          }
          return result
        },
      }
    })
  }

  const buildHorseOffers = (settlement: Settlement | null, npc: NpcAgent | null = null): MerchantHorseOffer[] => {
    if (!settlement) return []
    const traderIds = settlement.npcs.filter((agent) => agent.role === 'trader').map((agent) => agent.id)
    const vendorId = horseVendorNpcId(traderIds, settlement.terrain, !!settlement.landmarks.paddock)
    if (npc && vendorId && npc.id === vendorId) {
      return buildVendorPaddockHorseOffers(settlement, npc)
    }
    const wagon = buildMerchantHorseOffer(settlement, npc)
    return wagon ? [wagon] : []
  }

  const afterTrade = (horseOffer?: MerchantHorseOffer | MerchantHorseOffer[] | null): void => {
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    heldTool.syncWithInventory()
    deps.syncHeldHud()
    deps.syncQuickActionAvailability()
    deps.syncPlayerAppearance()
    const view = merchantInventoryView()
    const npc = ui.merchant.npc as NpcAgent | null
    if (ui.merchant.mode === 'npcGoods') {
      vueUi.refreshMerchant(view.counts, view.groups, null, buildNpcTradeStock(npc))
      return
    }
    const settlement = findSettlementForNpc(npc)
    vueUi.refreshMerchant(
      view.counts,
      view.groups,
      horseOffer ?? buildHorseOffers(settlement, npc),
      buildMerchantTradeStock(npc),
    )
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
    onSettleTransaction: async (purchases, offer, instanceIds = []) => {
      if (ui.merchant.mode === 'npcGoods') return settleNpcGoodsTransaction(purchases, offer)
      const npc = ui.merchant.npc as NpcAgent | null
      const merchantStock = npc ? bundle.settlementsManager.getNpcState(npc.id)?.merchantStock : undefined
      if (!npc || npc.health.dead || !merchantStock) return 'not_sold'
      const result = settleMerchantStockTransaction(
        inventory,
        merchantStock,
        purchases,
        offer,
        merchantSellContext(),
        instanceIds,
        merchantPurchaseMarkup(npc),
      )
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
    getCanTrade: () => npcDialogueCanTrade(ui.npcDialogueMenu.npc as NpcAgent | null),
    onOpenTrade: () => {
      const view = merchantInventoryView()
      const npc = ui.npcDialogueMenu.npc as NpcAgent | null
      if (npc && npc.health.dead) return
      if (isMerchantNpc(npc)) {
        const pricing = createMerchantPricing(npc)
        activeMerchantPricing = pricing
        const settlement = findSettlementForNpc(npc)
        vueUi.openMerchantFromDialogue(
          view.counts,
          view.groups,
          'merchant',
          pricing,
          buildHorseOffers(settlement, npc),
          buildMerchantTradeStock(npc),
        )
        return
      }
      activeMerchantPricing = null
      vueUi.openMerchantFromDialogue(view.counts, view.groups, 'npcGoods', null, null, buildNpcTradeStock(npc))
    },
    onRequestFood: (npc) => resolveAssistanceDialogue(npc, 'food'),
    onRequestWater: (npc) => resolveAssistanceDialogue(npc, 'water'),
    onAskAboutArea: (npc) => {
      const npcState = bundle.settlementsManager.getNpcState(npc.id)
      if (!npcState) return GUARD_AREA_RESEARCH_PENDING
      const deliveryDeps = { getLocation: (id: string) => locationCatalog.getById(id), locationKnowledge }
      const pending = npcState.playerFollowUp
      if (pending) return deliverNpcWorldKnowledgeFollowUp(deliveryDeps, npcState, pending.id) ?? GUARD_AREA_RESEARCH_PENDING
      const source: NpcWorldKnowledgeFollowUpSource = { kind: npc.role === 'hunter' ? 'hunter' : 'guard' }
      const line = guardLocalKnowledge.askAboutArea(npc.id, player.mesh.position.x, player.mesh.position.z, source)
      const justArmed = npcState.playerFollowUp
      return justArmed ? (deliverNpcWorldKnowledgeFollowUp(deliveryDeps, npcState, justArmed.id) ?? line) : line
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
    openGrindstoneSharpen,
    readBookItem,
    readTreasureMapItem,
    dropItems,
    equipTool,
    unequipTool,
    equipArmor,
    unequipArmor,
    equipPrimaryMeleeWeapon,
    equipPrimaryRangedWeapon,
    sheatheCombatWeapon,
    toggleCombatMode,
    setPrimaryMeleeWeapon,
    setPrimaryRangedWeapon,
  }
}

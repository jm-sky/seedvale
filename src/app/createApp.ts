import type { Role } from '../ai/characters'
import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { SaveData, SaveTerrainModification } from '../persistence/saveData'
import type { TerrainModification } from '../terrain/chunkManager'
import type { ResourceDepletionState } from '../terrain/depositMining'
import type { RenewableWorldItemOverrides } from '../terrain/renewableWorldItems'
import type { TrapCaptureEvent } from '../world/createPlacedTraps'
import type { GrassForageOverrides } from '../world/grassForage'
import type { NearbyPlayerWellLookup } from '../world/playerWell'
import type { PlayerActionContext } from './actions/actionContext'
import { configureNpcPlayerReactionAudio } from '../ai/NpcAgent'
import { NpcBarkLimiter } from '../ai/npcBarkLimiter'
import { configureRequestNpcBark, createRequestNpcBark } from '../ai/npcBarkRequest'
import { configureRequestNpcInitiatedDialogue } from '../ai/npcInitiatedDialogueRequest'
import { armNpcPlayerFollowUp } from '../ai/npcPlayerFollowUp'
import { NEUTRAL_PLAYER_SOCIAL_STATE } from '../ai/reactionChance'
import { playAnimalCombatDeath } from '../audio/actionSounds'
import { playNegativeConsequence } from '../audio/consequenceSounds'
import { createAmbientAudio } from '../audio/createAmbientAudio'
import { createWorldAudio } from '../audio/createWorldAudio'
import { createHouseDoorTracker } from '../audio/doorSounds'
import { createFireAudio, playActionFireExtinguish, playActionFireIgnite } from '../audio/fireSounds'
import { applyFootstepPackFromUrl } from '../audio/playerMoveSounds'
import { createWeatherAudio } from '../audio/weatherSounds'
import { BadgeManager, type SettlementBadgeUnlock } from '../badges/badges'
import { saveAllDomains, savePlayer, saveWorld } from '../config/persistConfig'
import {
  applyStoredPlayer,
  applyStoredSettlements,
  applyStoredSky,
  applyStoredTerrain,
  createBenchmarkWorldConfig,
  createWorldConfig,
  defaultTerrainConfig,
} from '../config/worldConfig'
import { createCaveHeightfieldTestScene } from '../debug/createCaveHeightfieldTestScene'
import { createModelTestScene } from '../debug/createModelTestScene'
import { isAdminMode, isDebugMode, isSystemEnabled } from '../debug/debugMode'
import { installNpcDebugApi } from '../debug/npcDebugApi'
import { createNpcInspectTrigger } from '../debug/npcInspectTrigger'
import { createPlayerGroundTraceBuffer } from '../debug/playerGroundTrace'
import { createPlayerMovementTraceBuffer } from '../debug/playerMovementTrace'
import { findHomeCaveSpawner } from '../fauna/createFauna'
import { createTouchControls, type TouchControls } from '../input/createTouchControls'
import { isTouchDevice } from '../input/isTouchDevice'
import { createKeyboard } from '../input/Keyboard'
import { createMouseLook, exitGamePointerLock, requestGamePointerLock } from '../input/MouseLook'
import { migrateArmorCountsToInstances } from '../items/armorItemInstances'
import { CONTAINER_DEFS } from '../items/container'
import { createEquipmentState, equippedBodyArmor, equippedInstanceId, equippedInstanceIds, resolveEquipmentModifiers } from '../items/equipment'
import {
  createForeignPropertyUse,
  resolveMerchantHorseForeignUse,
} from '../items/foreignProperty'
import { createHeldTool } from '../items/HeldTool'
import { DEFAULT_MAX_SIZE, Inventory, toSaveItemInstance } from '../items/Inventory'
import { buildInventoryGroups, inventoryCountsForUi } from '../items/inventoryView'
import { CAPABILITY_NEED_LABEL, hasItemCapability, ITEM_CATALOG } from '../items/itemCatalog'
import { isWeaponMaintenanceKind } from '../items/itemInstances'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { migrateLegacyWaterskinsToInstances } from '../items/liquidContainer'
import { createPrimaryWeaponSelection } from '../items/primaryWeapons'
import { createAcquiredInstance } from '../items/trade'
import { createTradeGrievanceStore } from '../items/tradeGrievance'
import { type TreasureChestMutation } from '../items/treasureGameplay'
import { createWeaponInstance, migrateWeaponCountsToInstances } from '../items/weaponMaintenance'
import {
  type BenchmarkFixture,
  benchmarkScenarioFromUrl,
  createAgentCpuDiag,
  createBenchmarkRunner,
  createGrassFinalizationDiag,
  createPerfMonitor,
  isPerfUrlEnabled,
  setActiveAgentCpuDiag,
  setActiveGpuTimer,
  setActiveGrassFinalizationDiag,
  setActiveMonitor,
  setActiveProgramCensus,
} from '../perf'
import {
  beginNewSave,
  createSave,
  deleteSave,
  listSaveManagementEntries,
  listSaves,
  setActiveSaveId,
} from '../persistence/saveDb'
import { buildCharacterPresentation } from '../player/characterPresentation'
import { humanBodyCarryCapacityKg } from '../player/humanCarryCapacity'
import { createPlayerCombatMode } from '../player/playerCombatMode'
import {
  type CaveFloorSampler,
  type CaveGroundQuery,
  type CaveHorizontalResolver,
  type CaveOccupancyQuery,
  PLAYER_STARTING_ATTRIBUTES,
  PlayerController,
} from '../player/PlayerController'
import { resolvePlayerEquipmentVisual } from '../player/playerEquipmentVisual'
import {
  resetPlayerNeeds,
  restorePersistedNeeds,
} from '../player/PlayerNeeds'
import { restorePersistedSkills, toggleSneak } from '../player/PlayerSkills'
import { createPlayerTorch } from '../player/PlayerTorch'
import {
  resolvePlayerAppearance,
  ubcPreloadUrls,
} from '../player/playerVisualPreset'
import { createTargetedSkillSelection } from '../player/targetedSkillSelection'
import { cardinalDirectionPhrase } from '../quests/cardinalDirection'
import { resolveCaveQuestPresentation } from '../quests/caveLocationDescription'
import {
  buildDungeonBanditTreasureQuest,
  DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME,
  DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME,
  DUNGEON_BANDIT_LEDGER_KIND,
  DUNGEON_BANDIT_MARKED_VALUABLE_KIND,
  DUNGEON_BANDIT_RETURN_MARKED_PROPERTY_OUTCOME,
  dungeonBanditOrphanedInstances,
  isDungeonBanditDeepStashLooted,
} from '../quests/dungeonBanditTreasure'
import { getActiveDungeonBanditTreasureBinding } from '../quests/dungeonBanditTreasureRuntime'
import {
  type GuardWorldProgress,
  migrateLegacyGuardSwordGift,
} from '../quests/guardPersistence'
import { buildHuntersBrotherhoodIntroductionQuest } from '../quests/huntersBrotherhoodIntroduction'
import {
  buildLostHunterNaturalCaveQuest,
  isLostHunterPackLooted,
} from '../quests/lostHunterNaturalCave'
import { getActiveLostHunterNaturalCaveBinding } from '../quests/lostHunterNaturalCaveRuntime'
import {
  buildLostTreasureChronicleDecipheringQuest,
} from '../quests/lostTreasureChronicleDeciphering'
import { getActiveLostTreasureChronicleDecipheringBinding } from '../quests/lostTreasureChronicleDecipheringRuntime'
import {
  buildLostTreasureChronicleSearchQuests,
  CHRONICLE_SEARCH_EVIDENCE_KIND,
  ENCODED_CHRONICLE_KIND,
  isChronicleSearchSourceLooted,
  isLostTreasureGraveAccessGranted,
  lostTreasureChronicleGravePlacement,
} from '../quests/lostTreasureChronicleSearch'
import { getActiveLostTreasureChronicleSearchBinding } from '../quests/lostTreasureChronicleSearchRuntime'
import {
  buildLostTreasureChroniclesElderQuests,
  findLostTreasureChroniclesElderSettlement,
  resolveLostTreasureChroniclesElderBinding,
} from '../quests/lostTreasureChroniclesElder'
import {
  buildLostTreasureExpeditionQuest,
  isLostTreasureExpeditionCampLooted,
  isLostTreasureExpeditionEvidenceLooted,
  isLostTreasureExpeditionFinalTreasureLooted,
  isLostTreasureExpeditionJournalPackLooted,
  LOST_TREASURE_EXPEDITION_JOURNAL_KIND,
  LOST_TREASURE_EXPEDITION_JOURNAL_TO_FAMILY_OUTCOME,
  LOST_TREASURE_EXPEDITION_JOURNAL_TO_SPONSOR_OUTCOME,
  LOST_TREASURE_EXPEDITION_KEEP_JOURNAL_OUTCOME,
} from '../quests/lostTreasureExpedition'
import { getActiveLostTreasureExpeditionBinding } from '../quests/lostTreasureExpeditionRuntime'
import { materializeAuthoredQuestDefs, normalizeLegacyQuestRelations } from '../quests/materializeAuthoredQuests'
import {
  buildOldBonesAdventureCaveQuest,
  isOldBonesRemainsLooted,
  OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME,
  OLD_BONES_KEEP_SIGNET_OUTCOME,
  OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME,
  OLD_BONES_SIGNET_KIND,
} from '../quests/oldBonesAdventureCave'
import { getActiveOldBonesAdventureCaveBinding } from '../quests/oldBonesAdventureCaveRuntime'
import { buildGuardEveningDutyQuest, selectGuardQuestGiver } from '../quests/opportunities/guardProfessionQuests'
import {
  buildHunterProfessionQuests,
  parseHunterProfessionQuestId,
} from '../quests/opportunities/hunterProfessionQuests'
import {
  nearbyRpgSettlementDefs,
  OLD_PLACE_LANDMARK_KINDS,
  type RpgLandmarkRef,
  type RpgSettlementRef,
} from '../quests/opportunities/rpgQuestMatrices'
import {
  settlementOpportunityNpcsFromDef,
} from '../quests/opportunities/settlementNpcMaterialization'
import {
  parseLostLivestockQuestId,
  parseWolfDenPressureQuestId,
  wolfDenPressureStatusFromSpawners,
} from '../quests/opportunities/settlementQuestOpportunities'
import {
  buildWorldDrivenSettlementQuests,
  opportunityNpcsFromSettlement,
} from '../quests/opportunities/worldQuestMaterialization'
import { QuestManager } from '../quests/QuestManager'
import { bindDarkForestTreasureQuest, bindExactCaveQuests, bindTreasureMapBearCaveQuest, buildDarkForestTreasureQuest, buildHorseAcquisitionQuest, buildLandmarkQuests, buildTreasureMapBearCaveQuest, QUESTS, questStageObjectiveSlots } from '../quests/quests'
import {
  isSuspiciousTransportCacheLooted,
  SUSPICIOUS_TRANSPORT_EVIDENCE_KIND,
  SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME,
  SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME,
  SUSPICIOUS_TRANSPORT_REPORT_IT_OUTCOME,
} from '../quests/suspiciousTransportCaveCache'
import { getActiveSuspiciousTransportCaveCacheBinding } from '../quests/suspiciousTransportCaveCacheRuntime'
import { createQuestWorldKnowledgeResolver } from '../quests/worldKnowledgeResolver'
import { prewarmRenderPrograms } from '../render/programPrewarm'
import {
  type PlayerAnimalKillContext,
  resolveAnimalDeedSignal,
} from '../reputation/animalDeeds'
import { applySocialConsequence, ReputationManager } from '../reputation/ReputationManager'
import { createSocialNewsLedger } from '../reputation/SocialNewsLedger'
import { settlementSpawnPoint } from '../settlement/createSettlement'
import { getHorseAcquisitionState, merchantHorseAnimalId } from '../settlement/horseAcquisition'
import { createLandOwnershipRegistry } from '../settlement/landOwnership'
import { livestockStrayCandidateFromAgent } from '../settlement/livestock'
import { LOST_TREASURE_ELDER_SETTLEMENT_SEARCH_RADIUS } from '../settlement/lostTreasureChroniclesElderResident'
import { settlementNpcDescriptors } from '../settlement/npcIdentity'
import { cellsWithinRadius } from '../settlement/settlementGenerator'
import { summarizeVillagePlan } from '../settlement/villagePlanDebug'
import { useBootMark } from '../shared/bootMark'
import { drainStamina } from '../shared/StaminaState'
import { drainVigor } from '../shared/VigorState'
import { chunksNear } from '../terrain/chunkGrid'
import { disposeChunkWorkerPool } from '../terrain/chunkWorkerPool'
import { sampleFootstepSurface } from '../terrain/footstepSurface'
import { mountVueUi } from '../ui-vue/mount'
import { configureAudioVolumes, configureNpcVoiceSounds, configureUiSounds } from '../ui-vue/store'
import { createBusyOverlay } from '../ui/createBusyOverlay'
import { createDebugGui } from '../ui/createDebugGui'
import { createHud } from '../ui/createHud'
import { createInventoryScreen, type InventoryScreenHandlers } from '../ui/createInventoryScreen'
import { createLoadingScreen } from '../ui/createLoadingScreen'
import { createMinimap } from '../ui/createMinimap'
import { createNpcDialog } from '../ui/createNpcDialog'
import { createNpcInspector } from '../ui/createNpcInspector'
import { createPauseMenu } from '../ui/createPauseMenu'
import { createQuestLog } from '../ui/createQuestLog'
import { createQuickActions } from '../ui/createQuickActions'
import { createTimeSkipOverlay } from '../ui/createTimeSkipOverlay'
import { createToast } from '../ui/createToast'
import { reconcileAnimalPackHandoff } from '../world/animalPackHandoff'
import { TRAP_DEFS } from '../world/animalTraps'
import { type BeehiveRecord } from '../world/beehives'
import { createClouds } from '../world/clouds'
import { createDayNightState, parseTimeOfDayFromUrl, resetDayNightForNewGame } from '../world/dayNight'
import { type DryingRackRecord } from '../world/dryingRacks'
import { type FishingBaitState } from '../world/fishing'
import { createGroundFog } from '../world/groundFog'
import {
  abandonedCemeteryFingerprint,
  createAbandonedCemeteryCache,
} from '../world/locations/abandonedCemeteryCache'
import { isDarkForestTreasureChestLooted } from '../world/locations/darkForestTreasureSite'
import { getActiveDarkForestTreasureSite } from '../world/locations/darkForestTreasureSiteRuntime'
import { createGuardLocalKnowledge, normalizeSaveGuardLocalKnowledge } from '../world/locations/guardLocalKnowledge'
import { listKnownSettlementOptions, resolveCharacterReputationSettlementId } from '../world/locations/knownSettlementReputation'
import { createLocationKnowledge, setActiveLocationKnowledge } from '../world/locations/locationKnowledge'
import {
  confirmHomeSettlement,
  createLocationProximityDiscovery,
  findSettlementContainingPlayer,
  revealSettlementsInRange,
} from '../world/locations/locationProximityDiscovery'
import { createCoarseCachePersistence, locationsCoarseFingerprint } from '../world/locations/locationsCoarseCache'
import { getActiveLostTreasureEstateSearchArea } from '../world/locations/lostTreasureEstateSearchAreaRuntime'
import { createNavigationTargets, setActiveNavigationTargets } from '../world/locations/navigationTargets'
import { revealLocationKnowledge } from '../world/locations/revealLocationKnowledge'
import {
  isTreasureMapBearCaveAuthoredCasket,
  TREASURE_MAP_BEAR_CAVE_KEPT_OUTCOME_ID,
  TREASURE_MAP_BEAR_CAVE_QUEST_ID,
  treasureMapBearCaveSealedCasketCarried,
} from '../world/locations/treasureMapBearCave'
import {
  getActiveTreasureMapBearCaveBinding,
} from '../world/locations/treasureMapBearCaveRuntime'
import { createWorldKnowledgeResearch } from '../world/locations/worldKnowledgeResearch'
import { createWorldLocationCatalog, settlementLocationId } from '../world/locations/worldLocationCatalog'
import { createMapData, setActiveMapData } from '../world/map/mapData'
import { createMapDiscovery } from '../world/map/mapDiscovery'
import { createMapProjection, rawSampleParamsFromWorld } from '../world/map/mapProjection'
import { PALISADE_MATERIAL_REQUIREMENTS } from '../world/palisade'
import { hasExplicitUrlSeed, randomSeed, setUrlSearchParam, syncSeedInUrl } from '../world/parseSeed'
import { parsePlantedCrops } from '../world/plantedCrops'
import { parsePlantedTrees } from '../world/plantedTrees'
import { PLAYER_TROUGH_MATERIAL_REQUIREMENTS } from '../world/playerTrough'
import { createResourceSiteInventories } from '../world/resourceSiteInventory'
import { listSeedRecords, resolveNewGameSeed } from '../world/seedLibrary'
import { BEDROLL_MATERIAL_REQUIREMENTS, PLATFORM_MATERIAL_REQUIREMENTS } from '../world/sleepingUtilities'
import { createTimeSkip } from '../world/timeSkip'
import { createTreeLifecycle, parseTreeOverrides } from '../world/treeLifecycle'
import { createClimateState } from '../world/weather'
import { createWeatherParticles } from '../world/weatherParticles'
import { createWorldContext } from '../world/worldContext'
import { createContainerActions } from './actions/containerActions'
import { createCookMealIntent, runEatAnything } from './actions/cookMealIntent'
import { createFullCampIntent } from './actions/fullCampIntent'
import { createGatheringActions } from './actions/gatheringActions'
import { createGroundActions } from './actions/groundActions'
import { createHouseholdResourceTransferActions } from './actions/householdResourceTransferActions'
import { createInspectionActions } from './actions/inspectionActions'
import { createLeadActions } from './actions/leadActions'
import { createMedicalTreatmentActions } from './actions/medicalTreatmentActions'
import { createMountActions } from './actions/mountActions'
import { giveItemCountToNpc, giveItemInstanceToNpc } from './actions/npcItemTransfer'
import { createNpcItemTransferActions } from './actions/npcItemTransferActions'
import { createPlacementActions } from './actions/placementActions'
import { createPlacementPreviewActions } from './actions/placementPreviewActions'
import { createRestActions } from './actions/restActions'
import { createStorageInfestationActions } from './actions/storageInfestationActions'
import { createSurvivalActions } from './actions/survivalActions'
import { createTerrainPreparationActions } from './actions/terrainPreparationActions'
import { createWorkContractActions } from './actions/workContractActions'
import { createAppRenderLoop } from './appRenderLoop'
import { createBusyAction } from './busyAction'
import { createGameLoop } from './gameLoop'
import { createGraphicsSettings } from './graphicsSettings'
import { createSettlementLightLookup, syncGuardEveningNightPolicies } from './guardQuestWiring'
import { createInventoryWiring } from './inventoryWiring'
import { createRenderStack } from './renderStack'
import { createRestCampSequence } from './restCampSequence'
import { createSaveState } from './saveState'
import { getUserActions } from './userActions'
import { createWorldBundle, disposeWorldBundle, rebuildWorldBundle } from './worldBundle'

/** Player-inventory tools/utility granted for free if missing — covers both a
 *  brand-new game and saves from before this feature existed (plan §11's
 *  "stare save'y muszą nadal działać"). Doesn't fire for a player who has
 *  simply dropped one — `count` only hits 0 there if they also never picked
 *  it back up, an acceptable v1 edge case for tools that never consume. */
const STARTING_LOADOUT: Partial<Record<ItemKind, number>> = {
  knife: 1,
  firestarter: 1,
  blanket: 1,
  wooden_torch: 1,
  coin: 10,
}
/** Bound on `buildLandmarkQuests`' one-off world-setup search — chunk rings
 *  outward from the home settlement's center (plan 132). Generous enough
 *  that even the rarest landmark tier (~0.8% per chunk) is very likely to
 *  resolve, while still a small, explicit region rather than a full-world
 *  scan; `findLandmarkNear` stops at the first hit, so most worlds settle
 *  far short of this cap. */
const LANDMARK_QUEST_SEARCH_CHUNK_RADIUS = 10

let touchControls: TouchControls | null = null

/** Adds any `STARTING_LOADOUT` kind the inventory doesn't already have —
 *  called both for a fresh `Inventory` and after `inventory.clear()` (New
 *  Game), so the player is never left without knife/firestarter/blanket/torch. */
function grantStartingLoadout(inventory: Inventory): void {
  for (const [kind, count] of Object.entries(STARTING_LOADOUT) as [ItemKind, number][]) {
    const has = inventory.count(kind) + inventory.countInstances(kind)
    if (has > 0) continue
    if (isWeaponMaintenanceKind(kind)) {
      for (let i = 0; i < count; i++) inventory.addInstance(createWeaponInstance(kind))
    } else {
      const effectiveCount = isDebugMode() && kind === 'coin' ? count * 100 : count
      inventory.add(kind, effectiveCount)
    }
  }
}

/** Restores persisted terrain modifications (plan `world-terrain-save`) —
 *  everything in `SaveData.terrainModifications` is, by construction, player-
 *  caused (`saveState.ts`'s `buildSaveData()` only ever serializes
 *  `source: 'player'` entries), so every restored entry is tagged `'player'`
 *  here without re-deriving it. `'prepare'`-mode entries carry no `x`/`z`/
 *  `radius`/`depth` in the save shape (unused for that mode); the `0`
 *  placeholders mirror `ChunkManager.applyExactHeights`'s own convention. */
function terrainModificationsFromSave(saved: readonly SaveTerrainModification[]): TerrainModification[] {
  return saved.map((m) => (
    m.mode === 'prepare'
      ? { x: 0, z: 0, radius: 0, depth: 0, mode: 'prepare' as const, id: m.id, samples: m.samples, source: 'player' as const }
      : { x: m.x, z: m.z, radius: m.radius, depth: m.depth, mode: m.mode, source: 'player' as const }
  ))
}

/** Boot-time options for `createApp()` (plan ui-input-011 §7) — the explicit
 *  New Game configuration seam. `seed` is an already-resolved Seed Library
 *  choice, `playerName` the per-save `WorldConfig.player.name` the boot Start
 *  Screen collected; both are honoured only for a genuine new world
 *  (`newGame`, no `initialSave`, no benchmark fixture). */
export type NewAppOptions = {
  newGame?: boolean
  modelTest?: boolean
  caveHeightfieldTest?: boolean
  benchmarkFixture?: BenchmarkFixture
  seed?: number
  playerName?: string
}

/**
 * Application composition root. It creates the long-lived systems (render
 * stack, world bundle, player, quests, UI, audio, persistence), threads their
 * dependencies together and configures the app lifecycle — the detailed
 * behaviour of each area lives in its own module:
 *
 * - `renderStack.ts` — renderer/scene/camera/post/lights/sky construction.
 * - `graphicsSettings.ts` — live graphics + quality-preset handlers.
 * - `inventoryWiring.ts` — inventory screen + home-trader handlers.
 * - `actions/` — the player's world interactions (dig/chop, placement,
 *   survival, gathering, containers, rest).
 * - `saveState.ts` — `SaveData` assembly and autosave lifecycle.
 * - `gameLoop.ts` — one frame of simulation + render.
 * - `appRenderLoop.ts` — rAF scheduling, resize and WebGL context loss.
 *
 * @system app-composition
 * @role Composition root: builds every long-lived system, threads their
 *  dependencies and owns app-level lifecycle (boot, rebuild, dispose).
 * @owns WorldBundle GameLoop AppRenderLoop
 * @lifecycle boot
 * @integration Wires world, player, UI, persistence and audio systems together.
 */
export async function createApp(
  container: HTMLElement,
  initialSave?: SaveData | null,
  options?: NewAppOptions,
): Promise<() => void> {
  const { bootMark, bootMarkEnd, bootMarksSummary } = useBootMark('createApp')

  // `?caveHeightfieldTest` — isolated cave heightfield harness.
  // Bails out before any world/save/UI bootstrap; see
  // `createCaveHeightfieldTestScene.ts`.
  if (options?.caveHeightfieldTest) {
    return createCaveHeightfieldTestScene(container)
  }

  // `?modelTest` — ultra-minimal NPC/player model+animation preview. Bails out
  // before any world/save/UI bootstrap below; see `createModelTestScene.ts`.
  if (options?.modelTest) {
    return createModelTestScene(container)
  }

  // NB: must NOT be `seedvale-touch` — that's the touch-overlay component's own
  // block class (`.seedvale-touch { position:absolute; inset:0; z-index:7;
  // pointer-events:none }` in index.html). Putting it on <body> made the whole
  // document `pointer-events: none`, and since that property inherits, every
  // modal (pause menu, quest log, villagers, NPC dialog) and its buttons became
  // untappable and unscrollable on touch devices — only the few elements with an
  // explicit `pointer-events: auto` (the joystick/look-zone/action buttons) still
  // responded, which is why taps appeared to "fall through" the modal onto RUN.
  document.body.classList.toggle('seedvale-touch-device', isTouchDevice())

  const loadingScreen = createLoadingScreen(container)

  const fixture = options?.benchmarkFixture
  // A canonical `?benchmark=` run must not inherit the user's save or
  // localStorage-derived world/graphics preferences — `createBenchmarkWorldConfig`
  // builds straight from the fixture, bypassing `createWorldConfig()`'s URL/
  // localStorage overlay entirely (plan tools-001; a fresh save alone is not
  // enough, since `createWorldConfig()` reads localStorage independently of
  // any save).
  const config = fixture
    ? createBenchmarkWorldConfig(fixture)
    : createWorldConfig()
  const perfMonitor = createPerfMonitor()
  setActiveMonitor(perfMonitor)
  const agentCpuDiag = createAgentCpuDiag()
  setActiveAgentCpuDiag(agentCpuDiag)
  const grassFinalizationDiag = createGrassFinalizationDiag()
  setActiveGrassFinalizationDiag(grassFinalizationDiag)
  if (isPerfUrlEnabled()) perfMonitor.setSource('url', true)
  // Seed-source precedence (plan persistence-004 §9, world-015 §3): a caller-
  // resolved Seed Library choice (`options.seed`, boot `StartScreen`'s New
  // Game) is always authoritative for a fresh New Game — it already went
  // through `resolveNewGameSeed()`. Without one, an explicit `?seed=` still
  // survives (deterministic reproduction for development/shared seeds,
  // `createWorldConfig()` already resolved `config.seed` to it above); only
  // the remaining fallback case (no explicit param, no resolved choice) gets
  // a fresh `randomSeed()` — a stale localStorage-remembered seed must not
  // leak into a genuinely new world either.
  if (!initialSave && !fixture && options?.newGame) {
    if (options.seed != null) {
      config.seed = options.seed
    } else if (!hasExplicitUrlSeed()) {
      config.seed = randomSeed()
    }
    // Per-save player name chosen on the boot New Game form (plan
    // ui-input-011 §5/§7). Applied here, before `PlayerController` and
    // `player.setName(config.player.name)` below, so the new world is built
    // from it and `saveAllDomains`/`SaveConfig.player` serialize it like any
    // other config value — no global player profile involved.
    // `applyStoredPlayer` keeps the existing "blank never overwrites the
    // default" guarantee.
    applyStoredPlayer(config.player, { name: options.playerName })
  }
  if (initialSave) {
    // A loaded save's own seed is always authoritative — it must win over
    // any `?seed=` left over in the URL from a previous session (plan
    // persistence-004 §9/§10).
    config.seed = initialSave.config.seed
    // Merge field-by-field rather than replacing `config.terrain` wholesale —
    // an older save can predate `RegionParams` fields added since (e.g.
    // `moistureRegionScale`), and a wholesale replace would leave those
    // `undefined` instead of keeping the game's hardcoded default. Ground the
    // merge in a fresh `defaultTerrainConfig`, not `config.terrain` as it
    // stands here — `createWorldConfig()` already overlaid *localStorage's*
    // cached terrain (from whichever world was last played) onto it, and a
    // field this save predates must fall back to the true default, not that
    // other world's tuning (plan 195 data-consistency audit, finding C2).
    config.terrain = defaultTerrainConfig(config.terrain.resolution)
    applyStoredTerrain(config.terrain, initialSave.config.terrain)
    if (typeof initialSave.config.terrain.resolution === 'number') {
      config.terrain.resolution = initialSave.config.terrain.resolution
    }
    applyStoredSky(config.sky, initialSave.config.sky)
    applyStoredPlayer(config.player, initialSave.config.player)
    applyStoredSettlements(config.settlements, initialSave.config.settlements)
  }
  // A benchmark fixture must not mutate the user's saved world/graphics
  // preferences (plan tools-001 trap #14).
  if (!fixture) saveAllDomains(config)
  // The URL must always reflect the seed of the actually active world (plan
  // persistence-004 §9) — a Load, a resolved New Game seed, or the plain
  // boot seed all land here once `config.seed` is final. Benchmarks
  // deliberately bypass the URL entirely (see `createBenchmarkWorldConfig`).
  if (!fixture) syncSeedInUrl(config.seed)

  const timeOverride = parseTimeOfDayFromUrl()
  const dayNight = createDayNightState(
    fixture
      ? { timeOfDay: timeOverride ?? fixture.timeOfDay, elapsedDays: fixture.elapsedDays, enabled: false }
      : initialSave
        ? {
            timeOfDay: timeOverride ?? initialSave.timeOfDay,
            elapsedDays: initialSave.elapsedDays,
            ...(timeOverride != null ? { enabled: false } : {}),
          }
        : timeOverride != null
          ? { timeOfDay: timeOverride, enabled: false }
          : undefined,
  )
  // Climate (season + weather) is a pure function of (seed, elapsedDays) —
  // no save field, "restored" for free by re-deriving from the values above
  // (plan 040 §7/§19). See `world/weather.ts`'s header comment.
  const climate = createClimateState(config.seed, dayNight.elapsedDays)

  let treeLifecycle = createTreeLifecycle(
    config.seed,
    parseTreeOverrides(initialSave?.treeOverrides),
  )
  const getWorldDays = () => dayNight.elapsedDays


  bootMark('createRenderStack')
  const { renderer, labelRenderer, scene, camera, postProcessing, lights, sky, pointLightBudget, programCensus, gpuTimer } = createRenderStack(container, config)
  bootMarkEnd('createRenderStack')

  setActiveProgramCensus(programCensus)
  setActiveGpuTimer(gpuTimer)

  if (typeof window !== 'undefined') {
    window.__seedvaleProgramCensus = programCensus
    window.__seedvalePointLightBudget = pointLightBudget
  }

  // Vue/Tailwind UI overlay (plan 046) — dynamically imported so it doesn't
  // delay first paint (see `mountVueUi`'s doc comment).
  const vueUi = mountVueUi(container)

  const worldAudio = createWorldAudio(camera)
  configureAudioVolumes(worldAudio.getVolumes(), (volumes) => {
    worldAudio.setVolumes(volumes)
  })
  applyFootstepPackFromUrl()

  // Plan world-007 — Hidden Finds resolved spot ids: never reassigned (unlike
  // `collectedItemIds` below), only `.clear()`-ed on a genuinely new world —
  // same "mutated in place" contract as `landOwnership`/`mapDiscovery`, since
  // it must stay the same reference `ground` (created once, below) captured.
  const resolvedHiddenFindSpotIds = new Set<string>(initialSave?.resolvedHiddenFindSpotIds ?? [])
  // Plan world-024 — sparse unlocked systemic treasure chests: never
  // reassigned, only `.clear()`-ed on a genuinely new world, same mutated-in-
  // place contract as `resolvedHiddenFindSpotIds` (container actions capture
  // this reference once).
  const unlockedTreasureContainerIds = new Set<string>(initialSave?.unlockedTreasureContainerIds ?? [])
  const consumedWorldPickupIds = new Set<string>(initialSave?.consumedWorldPickupIds ?? [])
  const treasureChestMutations = new Map<string, TreasureChestMutation>()
  for (const row of initialSave?.treasureChestMutations ?? []) {
    treasureChestMutations.set(row.containerId, {
      attemptIndex: row.attemptIndex,
      trapTriggered: row.trapTriggered === true,
      damaged: row.damaged === true,
      destroyed: row.destroyed === true,
    })
  }
  const badges = new BadgeManager(initialSave?.badges)
  const reputation = new ReputationManager(initialSave?.reputation)
  // Lazy social-news propagation (plan quests-progression-022) — app/session
  // owned, same lifetime contract as `reputation` just above: an in-session
  // `rebuildWorldBundle()` of the same world must not clear pending news, so
  // this deliberately lives here rather than inside `WorldBundle`.
  const socialNews = createSocialNewsLedger(initialSave?.socialNews)
  const tradeGrievances = createTradeGrievanceStore(initialSave?.tradeGrievances)
  let collectedItemIds = new Set<string>(initialSave?.collectedItemIds ?? [])
  // Plan items-player-043 — sparse renewable medicinal flora overrides, same
  // "shared/mutated in place, reset only on a genuinely new world" contract
  // as `collectedItemIds` / `grassForageOverrides`.
  let renewableWorldItems: RenewableWorldItemOverrides = {
    ...(initialSave?.renewableWorldItems ?? {}),
  }
  // Plan 172 — natural crop lifecycle: harvested/removed wild crops, same
  // "shared/mutated in place, reset only on a genuinely new world" contract
  // as `collectedItemIds` above.
  let removedCropIds = new Set<string>(initialSave?.harvestedCropIds ?? [])
  // Plan 126 — player-planted trees/crops: same "carried across rebuild,
  // reset only on a genuinely new world" contract as the two `Set`s above,
  // but arrays since each record needs more than an id (position/species/
  // stage anchor for trees; position/cropId/stage anchor for crops).
  let plantedTrees = parsePlantedTrees(initialSave?.plantedTrees)
  let plantedCrops = parsePlantedCrops(initialSave?.plantedCrops)
  // Plan `world-terrain-save` — runtime terrain-deformation records (dig/
  // scorch/prepare), same "carried across rebuild, reset only on a
  // genuinely new world" contract as `plantedTrees`/`plantedCrops` above.
  let modifications: TerrainModification[] = terrainModificationsFromSave(initialSave?.terrainModifications ?? [])
  // Plan 198/201 — authoritative ore-deposit mining-hits-remaining, sparse
  // and keyed by `NaturalResource.id`: same "carried across rebuild, reset
  // only on a genuinely new world" contract as the ids/arrays above, and
  // persisted the same way (`SaveData.resourceDeposits`).
  let resourceDepletion: ResourceDepletionState = new Map(Object.entries(initialSave?.resourceDeposits ?? {}))
  // Plan settlements-npcs-021 — extracted goods waiting at remote resource
  // sites, same "carried across rebuild, reset only on a genuinely new
  // world" contract as `resourceDepletion` above. Independent of deposit
  // depletion (`SaveData.resourceDeposits`).
  let resourceSiteInventories = createResourceSiteInventories(initialSave?.resourceSiteInventories ?? {})
  // Plan fauna-010 §3/§4 — sparse grass forage patch depletion overrides,
  // same "long-lived object owned here, mutated in place by the live
  // service, carried across `rebuildWorldBundle`" contract as
  // `resourceDepletion` above (patch *placement* is never persisted).
  let grassForageOverrides: GrassForageOverrides = { ...(initialSave?.grassForagePatches ?? {}) }
  // Persistent player land ownership (plan 129) — sparse, doesn't need the
  // `bundle`-rebuild indirection `onAnimalDeath`/`getPlayerSocial` use below
  // (it never depends on `questManager`), so it's threaded straight through.
  const landOwnership = createLandOwnershipRegistry(initialSave?.ownedLandPlots ?? [])
  // `questManager` doesn't exist yet at this point (fauna/settlements build
  // before it does), so `onAnimalDeath` can't close over it directly —
  // mirrors the existing `bundle`-not-destructured indirection just below:
  // a mutable binding assigned once, read through a stable closure that
  // survives `rebuildWorldBundle()` (plan 110).
  let onAnimalDeathTarget: ((animalId: string) => void) | null = null
  const onAnimalDeath = (animalId: string): void => { onAnimalDeathTarget?.(animalId) }
  // Same indirection as `onAnimalDeath` above, for the same reason — `NpcAgent`
  // reads this every reaction check (plan 117), before `questManager` exists.
  let getPlayerSocialTarget: PlayerSocialLookup | null = null
  const getPlayerSocial: PlayerSocialLookup = (context) =>
    getPlayerSocialTarget?.(context) ?? NEUTRAL_PLAYER_SOCIAL_STATE
  // Same indirection again — a quest's `applySocialConsequence` callback
  // (built alongside `questManager` below) needs to push a fresh Character
  // Screen reputation view, but the settlement lookup/`hud` it needs are
  // only wired up further down.
  let refreshCharacterReputationTarget: ((mode?: 'open' | 'standing') => void) | null = null
  const refreshCharacterReputation = (mode: 'open' | 'standing' = 'standing'): void => {
    refreshCharacterReputationTarget?.(mode)
  }
  // Session presentation/last-visit memory for Character Screen reputation
  // (plan ui-input-019) — not persisted; survives in-session WorldBundle
  // rebuild. Do not derive this from ReputationManager's sparse entries.
  let lastVisitedSettlementId: string | null = null
  let selectedSettlementId: string | null = null
  // Same "target assigned later" indirection as `onAnimalDeath` above (plan
  // quests-progression-022 §8) — `SettlementsManager` fires this the moment a
  // settlement (home or a streamed-in neighbor) actually finishes building,
  // but the social-news catch-up this drives needs `bundle`, which doesn't
  // exist until just below.
  let onSettlementAvailableTarget: ((settlement: { id: string, x: number, z: number }) => void) | null = null
  const onSettlementAvailable = (settlement: { id: string, x: number, z: number }): void => {
    onSettlementAvailableTarget?.(settlement)
  }
  // Same "target assigned later" indirection as `onAnimalDeath` above — the
  // trap system is built with the bundle, but awarding Traps XP / toasting
  // the catch needs `player`/`toast`, which only exist further down
  // (`actions/gatheringActions.ts` owns both handlers).
  let onTrapCaptureTarget: ((event: TrapCaptureEvent) => void) | null = null
  const onTrapCapture = (event: TrapCaptureEvent): void => { onTrapCaptureTarget?.(event) }
  // Plan 159 §12 — same indirection: bait is returned to inventory, which
  // doesn't exist until after `bundle` is built.
  let onTrapBaitReturnedTarget: ((kind: ItemKind) => void) | null = null
  const onTrapBaitReturned = (kind: ItemKind): void => { onTrapBaitReturnedTarget?.(kind) }
  // Plan 127 §10 — `bundle.playerWells` doesn't exist until just below, same
  // "target assigned later" indirection as `onAnimalDeath`/`getPlayerSocial`
  // above. Reads `bundle.playerWells` lazily (not captured), so it keeps
  // working across `rebuildWorldBundle()` for free (see `worldBundle.ts`'s
  // header comment).
  let nearbyPlayerWellTarget: NearbyPlayerWellLookup | null = null
  const getNearbyPlayerWell: NearbyPlayerWellLookup = (x, z, maxDistance) => nearbyPlayerWellTarget?.(x, z, maxDistance) ?? null

  // World-003 "faster application startup" — bumped by the rebuild handler
  // and by this function's own teardown below, so a `createWorldBundle()`
  // background phase (fauna/item spawners/drying racks/hives, still
  // building when this changes) knows to dispose what it built instead of
  // assigning it onto a `bundle` a rebuild has already replaced, or that's
  // already torn down. See `worldBundle.ts`'s `buildWorldSystems` doc
  // comment for the full mechanism.
  let worldGeneration = 0
  const initialWorldGeneration = worldGeneration

  const onAnimalDeathSound = (
    kind: import('../fauna/AnimalAgent').AnimalKind,
    x: number,
    z: number,
  ): void => {
    playAnimalCombatDeath(worldAudio.playAt, { x, z }, kind)
  }

  loadingScreen.setStage('terrain')
  bootMark('createWorldBundle')
  const { bundle, backgroundReady: worldBundleBackgroundReady } = await createWorldBundle(
    scene,
    config,
    collectedItemIds,
    renewableWorldItems,
    removedCropIds,
    plantedTrees,
    plantedCrops,
    modifications,
    worldAudio.playAt,
    initialSave?.droppedItems ?? [],
    (initialSave?.placedFires ?? []).map((f) => ({ ...f, grate: f.grate === true })),
    initialSave?.placedTents ?? [],
    (initialSave?.placedTraps ?? []).map((t) => ({ ...t, baitKind: t.baitKind ?? null })),
    initialSave?.graves ?? [],
    initialSave?.placedContainers ?? [],
    initialSave?.worldGeneratedContainers ?? [],
    initialSave?.carriedContainer ?? null,
    initialSave?.playerWells ?? [],
    treeLifecycle,
    getWorldDays,
    dayNight,
    (initialSave?.dryingRacks ?? []) as DryingRackRecord[],
    (initialSave?.hives ?? []) as BeehiveRecord[],
    initialSave?.settlementEconomies,
    onAnimalDeath,
    getPlayerSocial,
    landOwnership.isOwned,
    onTrapCapture,
    onTrapBaitReturned,
    new Map((initialSave?.spawnPoints ?? []).map((s) => [s.id, s])),
    pointLightBudget,
    getNearbyPlayerWell,
    initialSave?.playerGardens ?? [],
    resourceDepletion,
    (initialSave?.terrainPreparations ?? []).map((p) => ({
      id: p.id,
      center: { x: p.x, z: p.z },
      size: p.size,
      targetHeight: p.targetHeight,
      originalHeights: p.originalHeights,
      requiredWork: p.requiredWork,
      completedWork: p.completedWork,
      status: 'active' as const,
    })),
    () => worldGeneration !== initialWorldGeneration,
    initialSave?.standingTorches ?? [],
    initialSave?.playerTroughs ?? [],
    initialSave?.palisades ?? [],
    initialSave?.bedrolls ?? [],
    initialSave?.platforms ?? [],
    initialSave?.workContracts ?? [],
    initialSave?.households,
    initialSave?.npcStates,
    initialSave?.npcRelationships,
    initialSave?.livestock,
    initialSave?.removedLivestockIds,
    initialSave?.rats,
    initialSave?.removedRatIds,
    initialSave?.storageInfestation,
    initialSave === undefined,
    initialSave?.structureStates,
    grassForageOverrides,
    (initialSave?.completedTerrainPreparations ?? []).map((p) => ({
      id: p.id,
      center: { x: p.x, z: p.z },
      size: p.size,
    })),
    initialSave?.residentialBuildings ?? [],
    (initialSave?.carts ?? []).map((c) => ({ ...c, pulledByAnimalId: null })),
    initialSave
      ? {
          entries: initialSave.persistentHabitatOccupants ?? [],
          removedSlots: initialSave.removedPersistentOccupantSlots ?? [],
        }
      : undefined,
    initialSave?.transportOrders ?? [],
    initialSave?.expeditionAssignments ?? [],
    initialSave?.worldFlags?.treasureMapBearCaveSourceExtracted ?? false,
    initialSave?.worldFlags?.treasureMapBearCaveCasketConsumed ?? false,
    onSettlementAvailable,
    resourceSiteInventories,
    consumedWorldPickupIds,
    onAnimalDeathSound,
    loadingScreen.setStage,
  )
  bootMarkEnd('createWorldBundle')
  // Already logged inside `worldBundle.ts` on failure — nothing else to do
  // here. On success, `bundle`'s stub fauna/item spawners/drying racks/
  // hives have already been replaced in place by the time this resolves.
  worldBundleBackgroundReady.catch(() => {})

  nearbyPlayerWellTarget = (x, z, maxDistance) => bundle.playerWells.nearestCompleted(x, z, maxDistance)

  // Plan quests-progression-022 §8 — settlement-lifecycle catch-up: reads
  // `bundle.settlementsManager.getLoaded()` (cheap, no grid scan, no
  // procedural settlement generation) rather than trusting the single
  // settlement `SettlementsManager` just reported, since an earlier-loaded
  // settlement can become newly eligible once *this* one becomes a fresh
  // knowledge carrier (see `SocialNewsLedger.catchUpSettlements`'s doc).
  const catchUpLoadedSettlements = (): void => {
    const loaded = bundle.settlementsManager.getLoaded().map((s) => ({ id: s.id, x: s.center.x, z: s.center.z }))
    const consequences = socialNews.catchUpSettlements(loaded, dayNight.elapsedDays)
    if (consequences.length === 0) return
    for (const consequence of consequences) applySocialConsequence(reputation, consequence)
    refreshCharacterReputation()
  }
  onSettlementAvailableTarget = () => catchUpLoadedSettlements()
  // One-time catch-up for whatever's already loaded (home/eager neighbors
  // built before this closure was wired) — idempotent no-op otherwise.
  catchUpLoadedSettlements()
  // Plan 159 §10 — fishing bait per spot (flat map, survives stream-out/in
  // for free) and a runtime-only per-spot cast counter feeding the
  // deterministic catch roll (same "not persisted, wild fauna isn't either"
  // convention as `createPlacedTraps.ts`'s `attempts`).
  const fishingBait = new Map<string, FishingBaitState>(Object.entries(initialSave?.fishingBait ?? {}))
  const fishingAttempts = new Map<string, number>()

  // Indirection (not a direct destructure) so this keeps sampling whichever
  // bundle.chunkManager/config.terrain are current across `rebuildWorld()`
  // mutating `bundle`'s fields in place — see `worldBundle.ts`'s `WorldBundle`
  // doc comment.
  bootMark('createWorldContext')
  const worldContext = createWorldContext(() => bundle.chunkManager, config, dayNight)
  bootMarkEnd('createWorldContext')

  const ambientAudio = createAmbientAudio(worldAudio, worldContext)
  const fireAudio = createFireAudio(worldAudio)
  const weatherAudio = createWeatherAudio(worldAudio)
  const weatherParticles = createWeatherParticles({ getLodScale: () => config.quality.lodScale })
  weatherParticles.addTo(scene)
  const clouds = createClouds()
  clouds.addTo(scene)
  const groundFog = createGroundFog()
  groundFog.addTo(scene)
  const houseDoors = createHouseDoorTracker()
  configureUiSounds(worldAudio.playOnce)
  configureNpcVoiceSounds(worldAudio.playAt)
  configureNpcPlayerReactionAudio(worldAudio.playAtCancelable)
  configureRequestNpcBark(createRequestNpcBark(new NpcBarkLimiter()))

  const mapDiscovery = createMapDiscovery(initialSave?.map.discoveredCells)
  const mapProjection = createMapProjection(rawSampleParamsFromWorld(config))
  const lookupSettlementCell = (cell: { gx: number, gz: number }) => bundle.settlementsManager.peekDef(cell)
  // Persistent worldgen cache for the coarse terrain tiles above (plan
  // world-015 §11/§15) — the catalog stays fully synchronous; this owns the
  // async IndexedDB hydrate/dirty-write side behind a sync seam.
  const coarseCachePersistence = createCoarseCachePersistence()
  const abandonedCemeteryCache = createAbandonedCemeteryCache()
  const worldLocationCatalog = createWorldLocationCatalog({
    getSeed: () => config.seed,
    getCaves: () => bundle.caves,
    getChunkManager: () => bundle.chunkManager,
    lookupSettlement: lookupSettlementCell,
    getSampleParams: () => rawSampleParamsFromWorld(config),
    getChunkSize: () => config.terrain.chunkSize,
    hydrateTile: (tx, tz) => coarseCachePersistence.hydrateTile(tx, tz),
    onTileDirty: (tx, tz, tile) => coarseCachePersistence.onTileDirty(tx, tz, tile),
    abandonedCemeteryCache,
    getDarkForestTreasureSite: () => {
      const site = getActiveDarkForestTreasureSite()
      return site ? { locationId: site.locationId, x: site.x, z: site.z } : null
    },
    getChronicleSearchRuinsSite: () => {
      const binding = getActiveLostTreasureChronicleSearchBinding()
      return binding
        ? { locationId: binding.ruinsLocationId, x: binding.ruinsX, z: binding.ruinsZ }
        : null
    },
    getEstateSearchArea: () => getActiveLostTreasureEstateSearchArea(),
    getAbandonedMine: () => bundle.caves.abandonedMine(),
  })
  const worldKnowledgeResearch = createWorldKnowledgeResearch({
    buildParams: (query) => bundle.chunkManager.buildWorldKnowledgeWorkerParams({
      queryKind: query.kind,
      landmarkKinds: query.landmarkKinds,
      originX: query.originX,
      originZ: query.originZ,
      maxChunkRadius: query.maxChunkRadius,
    }),
    fingerprint: () => `${config.seed}:${worldGeneration}`,
  })
  const bindReadyExpeditionDispatch = (): void => {
    const dispatch = bundle.dispatchReadyExpedition.bind(bundle)
    bundle.dispatchReadyExpedition = (assignmentId, locationAt) => dispatch(
      assignmentId,
      locationAt ?? ((locationId) => {
        const loc = worldLocationCatalog.getById(locationId)
        return loc ? { x: loc.x, z: loc.z } : null
      }),
    )
  }
  bindReadyExpeditionDispatch()
  coarseCachePersistence.activate(config.seed, locationsCoarseFingerprint(rawSampleParamsFromWorld(config)))
  abandonedCemeteryCache.activate(
    config.seed,
    abandonedCemeteryFingerprint(rawSampleParamsFromWorld(config), config.terrain.chunkSize),
  )
  const locationKnowledge = createLocationKnowledge(initialSave?.map.discoveredLocations)
  setActiveLocationKnowledge(locationKnowledge)
  // Home village is physically known from spawn — confirm before the game
  // loop so the first proximity tick is a no-op (no boot toast). Missing
  // home entries in older saves are normalized the same way.
  confirmHomeSettlement(bundle.settlementsManager.getHomeDef(), locationKnowledge)
  const guardLocalKnowledge = createGuardLocalKnowledge({
    research: worldKnowledgeResearch,
    getElapsedDays: () => dayNight.elapsedDays,
    getWorldSeed: () => config.seed,
    locationKnowledge,
    getLocation: (id) => worldLocationCatalog.getById(id),
    listStableLocations: (originX, originZ, maxKm) => worldLocationCatalog.stableLandmarksInRange(originX, originZ, 0, maxKm),
    nearestSettlements: (originX, originZ, maxKm) => worldLocationCatalog.nearestSettlements(originX, originZ, maxKm),
    homeLocationId: () => settlementLocationId(bundle.settlementsManager.getHomeDef()),
    searchChunkRadius: LANDMARK_QUEST_SEARCH_CHUNK_RADIUS,
    // Ready research transfers into the asking NPC's own authoritative
    // follow-up (plan npc-050 §8) — this service stops being a second
    // owner of the deliverable result once armed.
    armFollowUp: (npcId, followUp) => {
      const state = bundle.settlementsManager.getNpcState(npcId)
      if (!state) return null
      return armNpcPlayerFollowUp(state, { kind: 'deliver_world_knowledge', ...followUp }, npcId)
    },
  })
  // Restored once `homeGuardNpcId` is resolved further below — a legacy
  // (pre-npc-050) save's anonymous single record needs that stable id to
  // migrate onto (plan npc-050 §10).
  const locationProximityDiscovery = createLocationProximityDiscovery({
    getCaveDefinitions: () => bundle.caves.definitions(),
    lookupSettlement: lookupSettlementCell,
    catalog: worldLocationCatalog,
    knowledge: locationKnowledge,
    onInsideSettlement: (settlementId) => {
      if (settlementId) lastVisitedSettlementId = settlementId
    },
  })
  const navigationTargets = createNavigationTargets()
  navigationTargets.restore(
    initialSave?.map.targets ?? [],
    (id) => locationKnowledge.has(id) && worldLocationCatalog.getById(id) != null,
  )
  setActiveNavigationTargets(navigationTargets)
  const mapData = createMapData({
    projection: mapProjection,
    discovery: mapDiscovery,
    catalog: worldLocationCatalog,
    knowledge: locationKnowledge,
  })
  setActiveMapData(mapData)

  const inventory = new Inventory(
    initialSave?.inventory,
    humanBodyCarryCapacityKg(PLAYER_STARTING_ATTRIBUTES.strength),
    initialSave ? Inventory.instancesFromJSON(initialSave.inventoryInstances ?? []) : undefined,
    initialSave?.foodBatches,
    DEFAULT_MAX_SIZE,
  )

  // Plan 161 — pre-existing count-based weapons (starting knife, older saves)
  // have no recoverable condition; every unit becomes a fresh full-condition
  // instance. Idempotent, so safe to run unconditionally on every load.
  migrateWeaponCountsToInstances(inventory)
  // Plan items-player-001 — pre-existing plan-106 waterskin_empty/
  // waterskin_full counts predate the sized/partial-content model; every unit
  // becomes a fresh `waterskin_medium` instance. Idempotent (a fresh game or
  // an already-migrated save has zero count for these legacy kinds).
  migrateLegacyWaterskinsToInstances(inventory)
  // Plan items-player-030 — count-backed armor → common instances (idempotent).
  migrateArmorCountsToInstances(inventory)
  grantStartingLoadout(inventory)
  const heldTool = createHeldTool(inventory, initialSave?.heldTool ?? null)
  const equipment = createEquipmentState(inventory, initialSave?.playerEquipment)
  const primaryWeapons = createPrimaryWeaponSelection()
  if (initialSave) {
    primaryWeapons.restoreState(initialSave)
  }
  primaryWeapons.syncWithInventory(inventory)
  const playerCombatMode = createPlayerCombatMode()
  /** Whether the player could build a palisade segment right now, ignoring
   *  position — same "own the rare/costly component, full cost re-checked at
   *  build time" gate `hasWoodenTorch` uses, just against a count instead of
   *  a single item (plan items-player-010). */
  const hasPalisadeMaterial = (): boolean =>
    PALISADE_MATERIAL_REQUIREMENTS.every((r) => inventory.has(r.kind, r.count))
  const hasTroughMaterial = (): boolean =>
    PLAYER_TROUGH_MATERIAL_REQUIREMENTS.every((r) => inventory.has(r.kind, r.count))
  /** Same "own the material, full cost re-checked at build time" gate as
   *  `hasPalisadeMaterial`, for the two sleeping utilities (plan
   *  items-player-013). */
  const hasBedrollMaterial = (): boolean =>
    BEDROLL_MATERIAL_REQUIREMENTS.every((r) => inventory.has(r.kind, r.count))
  const hasPlatformMaterial = (): boolean =>
    PLATFORM_MATERIAL_REQUIREMENTS.every((r) => inventory.has(r.kind, r.count))
  // Renamed from `syncShovelQuickActions` — now the single post-inventory-
  // mutation refresh for every Quick Actions / Pause→Akcje availability flag
  // (review 007 C4), not just shovel/tent. `canBuild*`/`canLight*` come from
  // `getUserActions()` below; safe to reference here despite the earlier
  // declaration since this function is only ever *called* from closures that
  // run after `createApp`'s synchronous setup (including `getUserActions`)
  // has finished.
  const syncQuickActionAvailability = (): void => {
    vueUi.setQuickActionsHasDiggingTool(inventory.hasCapability('soil_digging'))
    vueUi.setQuickActionsHasTent(inventory.countInstances('tent') > 0)
    vueUi.setQuickActionsHasChest(inventory.has('chest', 1))
    vueUi.setQuickActionsHasWoodenTorch(inventory.has('wooden_torch', 1))
    vueUi.setQuickActionsHasPalisadeMaterial(hasPalisadeMaterial())
    vueUi.setQuickActionsHasTroughMaterial(hasTroughMaterial())
    vueUi.setQuickActionsHasBedrollMaterial(hasBedrollMaterial())
    vueUi.setQuickActionsHasPlatformMaterial(hasPlatformMaterial())
    vueUi.setQuickActionsTraps({
      simple: inventory.countInstances(TRAP_DEFS.simple.itemKind) > 0,
      good: inventory.countInstances(TRAP_DEFS.good.itemKind) > 0,
    })
    vueUi.setQuickActionsFireAvailability({
      buildSimpleFire: availableSimpleFire(),
      buildFirePit: availableFirePit(),
      buildWoodPile: availableWoodPile(),
      buildGrate: availableGrate(),
      lightBranch: availableLightBranch(),
      lightWoodenTorch: availableLightWoodenTorch(),
    })
    vueUi.setQuickActionsHasCarriedContainer(bundle.placedContainers.hasCarried())
    vueUi.setQuickActionsHasTreeSeed(inventory.has('tree_seed', 1))
    vueUi.setQuickActionsCropSeeds({
      carrot: inventory.has('seed_carrot', 1),
      potato: inventory.has('seed_potato', 1),
      cabbage: inventory.has('seed_cabbage', 1),
    })
    vueUi.setQuickActionsHasFishingRod(inventory.has('fishing_rod', 1))
    vueUi.setQuickActionsWorkContracts(contracts.quickActionsList())
  }

  const keyboard = createKeyboard()
  const mouseLook = createMouseLook(renderer.domElement, keyboard.state)

  // Reads `bundle.caves` fresh on every call (never captures it up front) —
  // same "stable container, live field reads" contract `WorldBundle`'s own
  // doc comment requires, so this stays correct across `rebuildWorldBundle`
  // without needing to be re-passed to `player.setGround()` below.
  const caveGroundQuery: CaveGroundQuery = (x, y, z) => {
    const hit = bundle.caves.queryGround(x, y, z)
    if (!hit) return null
    return { floorY: hit.floorY, ceilingY: hit.openSky ? null : hit.ceilingY }
  }
  const caveFloorSampler: CaveFloorSampler = (x, z) => bundle.caves.sampleFloor(x, z)
  const caveOccupancyQuery: CaveOccupancyQuery = (x, y, z) => bundle.caves.occupancyAt(x, y, z)
  const caveHorizontalResolver: CaveHorizontalResolver = (x, z, y, radius, entityHeight) =>
    bundle.caves.resolveHorizontal(x, z, y, radius, entityHeight)

  loadingScreen.setStage('player')
  bootMark('PlayerController.create')
  const playerAppearance = resolvePlayerAppearance({
    bodyKind: equippedBodyArmor(equipment, inventory),
  })
  const player = await PlayerController.create(
    camera,
    keyboard.state,
    mouseLook.state,
    bundle.chunkManager.sampleSurfaceGround,
    bundle.chunkManager.sampleFloor,
    bundle.chunkManager.waterLevel,
    bundle.chunkManager.collidersNear,
    caveGroundQuery,
    caveFloorSampler,
    caveOccupancyQuery,
    caveHorizontalResolver,
    (x, z) => sampleFootstepSurface(bundle.chunkManager, x, z),
    playerAppearance.modelUrl,
    playerAppearance.animationUrl,
    ubcPreloadUrls(playerAppearance.modelUrl),
  )
  const syncArmsEquipmentVisual = (): Promise<void> => {
    const armsId = equippedInstanceId(equipment, inventory, 'arms')
    const armsKind = armsId ? inventory.getInstance(armsId)?.kind : null
    return player.applyEquipmentVisuals(
      'arms',
      armsKind ? resolvePlayerEquipmentVisual(armsKind) : null,
    )
  }
  const syncPlayerAppearance = (): void => {
    const appearance = resolvePlayerAppearance({
      bodyKind: equippedBodyArmor(equipment, inventory),
    })
    void player.applyAppearance({
      modelUrl: appearance.modelUrl,
      animationUrl: appearance.animationUrl,
      tintUrl: appearance.tintUrl,
    })
    void syncArmsEquipmentVisual()
  }
  await player.applyAppearance({
    modelUrl: playerAppearance.modelUrl,
    animationUrl: playerAppearance.animationUrl,
    tintUrl: playerAppearance.tintUrl,
  })
  await syncArmsEquipmentVisual()
  bootMarkEnd('PlayerController.create')

  if (initialSave) {
    // Set look before position — setPosition() calls syncCamera(), which reads yaw/pitch.
    mouseLook.state.yaw = initialSave.player.yaw
    mouseLook.state.pitch = initialSave.player.pitch
    player.setPosition(initialSave.player.x, initialSave.player.z)
    restorePersistedNeeds(player.needs, initialSave.playerNeeds)
    restorePersistedSkills(player.skills, initialSave.skills)
    player.restoreTemporaryConditionsState(
      initialSave.playerConditions,
      initialSave.waterDrinkEventCount ?? 0,
      initialSave.unsafeFoodEventCount ?? 0,
    )
    player.syncDerivedPhysicalCapabilities(initialSave.elapsedDays, (kg) => inventory.setBaseMaxWeight(kg))
  } else {
    // Computed straight from `homeDef` (site position, sync the moment
    // `SettlementsManager` resolves it) rather than waiting on
    // `bundle.settlementsManager.home` — the home settlement's full build
    // (houses/NPCs/livestock) is deferred to the background (world-003
    // "faster application startup" §3) and isn't needed for the player's
    // spawn point, which `settlementSpawnPoint` computes identically to
    // `createSettlement.ts`'s own `spawn` field.
    const homeSpawn = settlementSpawnPoint(bundle.settlementsManager.getHomeDef(), bundle.chunkManager.sampleHeight)
    player.setPosition(homeSpawn.x, homeSpawn.z)
  }

  const currentAtSpawn = findSettlementContainingPlayer(
    player.mesh.position.x,
    player.mesh.position.z,
    lookupSettlementCell,
  )
  lastVisitedSettlementId = currentAtSpawn?.id ?? bundle.settlementsManager.getHomeDef().id

  player.setName(config.player.name)
  player.setMoveAudio(worldAudio.playAt)
  scene.add(player.mesh)
  player.mesh.visible = isSystemEnabled('playerModel')
  const targetedSkillSelection = createTargetedSkillSelection()
  vueUi.configureSkillsScreen({
    onToggleSneak: () => toggleSneak(player.skills),
    onSelectTargetedSkill: (id) => {
      targetedSkillSelection.toggle(id)
      const selected = targetedSkillSelection.get()
      vueUi.setSelectedTargetedSkill(selected)
      // Free-cursor skill aim: unlock pointer so the crosshair can follow the mouse.
      mouseLook.setPointerLockEnabled(selected == null)
    },
  })
  const hud = createHud(container)
  hud.setTime(dayNight.timeOfDay)
  const toast = createToast(container)

  // Assigned below; PlayerTorch onChange closes over the live binding.
  let syncHeldHud = (): void => {}
  const playerTorch = createPlayerTorch({
    handSocket: () => player.handSocket(),
    heldToolObject: () => player.getHeldToolObject(),
    onChange: () => syncHeldHud(),
    onIgnite: () => playActionFireIgnite(worldAudio.playAt, player.mesh.position),
    onExtinguish: () => playActionFireExtinguish(worldAudio.playAt, player.mesh.position),
    // Strict occupancy — not hysteretic `queryGround`. Torch must not
    // mutate ground hysteresis by sharing `contains` with the player floor.
    isInCave: () => bundle.caves.contains(
      player.mesh.position.x,
      player.mesh.position.y,
      player.mesh.position.z,
    ),
  }, pointLightBudget)

  syncHeldHud = (): void => {
    if (playerTorch.isLit() && playerTorch.source() === 'branch') {
      hud.setHeldTool('płonąca gałąź')
      // Lit branch owns the wrist — clear tool mesh so they don't stack.
      if (heldTool.held() !== null) {
        heldTool.unequip()
      }
      player.setHeldTool(null)
      playerCombatMode.reconcile(
        { kind: heldTool.held(), instanceId: heldTool.heldInstanceId() },
        { melee: primaryWeapons.primaryMelee(), ranged: primaryWeapons.primaryRanged() },
      )
      hud.setCombatWeapon(playerCombatMode.activeWeapon())
      return
    }
    const held = heldTool.held()
    if (playerTorch.isLit() && playerTorch.source() === 'wooden_torch' && held === 'wooden_torch') {
      hud.setHeldTool('pochodnia (płonie)')
      player.setHeldTool(held)
      playerCombatMode.reconcile(
        { kind: held, instanceId: heldTool.heldInstanceId() },
        { melee: primaryWeapons.primaryMelee(), ranged: primaryWeapons.primaryRanged() },
      )
      hud.setCombatWeapon(playerCombatMode.activeWeapon())
      return
    }
    hud.setHeldTool(held ? ITEM_DEFS[held].label : '')
    player.setHeldTool(held)
    primaryWeapons.syncWithInventory(inventory)
    playerCombatMode.reconcile(
      { kind: heldTool.held(), instanceId: heldTool.heldInstanceId() },
      { melee: primaryWeapons.primaryMelee(), ranged: primaryWeapons.primaryRanged() },
    )
    hud.setPrimaryWeapons(
      primaryWeapons.primaryMelee() ? ITEM_DEFS[primaryWeapons.primaryMelee()!.kind].label : '',
      primaryWeapons.primaryRanged() ? ITEM_DEFS[primaryWeapons.primaryRanged()!.kind].label : '',
    )
    hud.setCombatWeapon(playerCombatMode.activeWeapon())
  }
  syncHeldHud()

  // Restore mid-burn hand light after held-tool HUD sync.
  if (initialSave?.playerTorch) {
    const saved = initialSave.playerTorch
    let canRestore = true
    if (saved.source === 'wooden_torch') {
      if (heldTool.held() !== 'wooden_torch') {
        canRestore = inventory.has('wooden_torch', 1) && heldTool.equip('wooden_torch')
      }
    } else {
      // Lit branch occupies the hand — clear any restored tool slot.
      heldTool.unequip()
    }
    if (canRestore) {
      void playerTorch.light(saved.source, { fuelRemaining: saved.fuelRemaining, silent: true }).then(() => {
        syncHeldHud()
      })
    }
  }

  const worldFlags = {
    guardSwordGifted: initialSave?.worldFlags?.guardSwordGifted ?? false,
    hiddenTreasureFound: initialSave?.worldFlags?.hiddenTreasureFound ?? false,
    treasureMapDarkForestRead: initialSave?.worldFlags?.treasureMapDarkForestRead ?? false,
    treasureMapBearCaveSourceExtracted: initialSave?.worldFlags?.treasureMapBearCaveSourceExtracted ?? false,
    treasureMapBearCaveCasketOpened: initialSave?.worldFlags?.treasureMapBearCaveCasketOpened ?? false,
    treasureMapBearCaveCasketConsumed: initialSave?.worldFlags?.treasureMapBearCaveCasketConsumed ?? false,
    alphaWolfDeedEarned: initialSave?.worldFlags?.alphaWolfDeedEarned ?? false,
    guardClaims: { ...(initialSave?.worldFlags?.guardClaims ?? {}) },
  }
  const guardProgress: GuardWorldProgress = {
    alphaWolfDeedEarned: worldFlags.alphaWolfDeedEarned,
    guardClaims: worldFlags.guardClaims,
    guardSwordGifted: worldFlags.guardSwordGifted,
  }

  const grantItem = (kind: ItemKind, count: number): void => {
    for (let i = 0; i < count; i++) {
      const instance = createAcquiredInstance(kind)
      const added = instance ? inventory.addInstance(instance) : inventory.add(kind)
      if (!added) {
        // Plan 199 — an overflow drop still carries the instance identity
        // that was just minted for it, so a later pickup doesn't reset it.
        bundle.droppedItems.drop(
          kind,
          player.mesh.position.x,
          player.mesh.position.z,
          instance ? toSaveItemInstance(instance) : undefined,
        )
      }
    }
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    heldTool.syncWithInventory()
    syncHeldHud()
    syncQuickActionAvailability()
  }

  bootMark('createMinimap')
  const minimap = createMinimap(container)
  bootMarkEnd('createMinimap')

  // Immediate landmark quests still resolve once here (not injected into
  // `QuestManager`, which stays chunk/terrain-agnostic). `slad-przy-monolicie`
  // opts out and binds later through the deferred world-knowledge resolver
  // (plan quests-progression-047). Landmarks never change once generated, so
  // immediate ids stay stable across boot unlike `kill_target_animal`/
  // `find_animal`'s live `AnimalTargetResolver` below (plan 132).
  const landmarkQuests = buildLandmarkQuests((kind) => {
    // `getHomeDef()` (not `.home.center`) — always available, independent of
    // whether the home settlement's background build (world-003 §3) has
    // finished; `homeDef.x/z` is the same value `Settlement.center` resolves
    // to (see `createSettlement.ts`'s `center: new Vector3(site.x, site.y,
    // site.z)`).
    const homeDef = bundle.settlementsManager.getHomeDef()
    return bundle.chunkManager.findLandmarkNear(
      kind,
      homeDef.x,
      homeDef.z,
      LANDMARK_QUEST_SEARCH_CHUNK_RADIUS,
    )?.id
  })

  // Every quest defined so far belongs to the home settlement (plan
  // quests-progression-001 — `QuestDef` itself stays settlement-agnostic
  // data; the composition root resolves the real settlement here, once,
  // rather than hardcoding a settlement id inside `QuestManager`/
  // `ReputationManager`).
  const homeDef = bundle.settlementsManager.getHomeDef()
  const homeSettlementId = homeDef.id
  const homeCave = findHomeCaveSpawner(bundle.fauna.getSpawners(), homeSettlementId)
  const caveDirection = homeCave
    ? cardinalDirectionPhrase(homeCave.x - homeDef.x, homeCave.z - homeDef.z)
    : null
  const caveBinding = {
    id: homeCave?.id ?? `${homeSettlementId}:cave`,
    directionPhrase: caveDirection ? `${caveDirection} od osady` : null,
  }
  const treasureMapSource = getActiveDarkForestTreasureSite()?.treasureMap
  const treasureMapDirection = treasureMapSource
    ? cardinalDirectionPhrase(treasureMapSource.x - homeDef.x, treasureMapSource.z - homeDef.z)
    : null
  const treasureMapBinding = treasureMapSource
    ? {
        kind: treasureMapSource.kind,
        directionPhrase: treasureMapDirection ? `${treasureMapDirection} od osady` : null,
      }
    : null
  const merchantHorseId = merchantHorseAnimalId(homeSettlementId)
  const homeNpcDescriptors = settlementNpcDescriptors(homeDef)
  const bearCaveBinding = getActiveTreasureMapBearCaveBinding()
  const lostHunterBinding = getActiveLostHunterNaturalCaveBinding()
  const oldBonesBinding = getActiveOldBonesAdventureCaveBinding()
  const dungeonBanditBinding = getActiveDungeonBanditTreasureBinding()
  const lostTreasureExpeditionBinding = getActiveLostTreasureExpeditionBinding()
  const suspiciousTransportCaveCache = getActiveSuspiciousTransportCaveCacheBinding()
  const bearCaveQuestBinding = bearCaveBinding
    ? {
        mapGraveSpotId: bearCaveBinding.mapGraveSpotId,
        casketId: bearCaveBinding.casketId,
        locationId: bearCaveBinding.locationId,
        directionPhrase: bearCaveBinding.directionPhrase,
        authoredCoinAmount: bearCaveBinding.authoredCoinAmount,
      }
    : null
  const authoredQuestDefs = materializeAuthoredQuestDefs(
    bindExactCaveQuests([
      ...QUESTS,
      ...landmarkQuests,
      bindDarkForestTreasureQuest(buildDarkForestTreasureQuest(), treasureMapBinding),
      buildHorseAcquisitionQuest(merchantHorseId),
      ...(bearCaveQuestBinding
        ? [bindTreasureMapBearCaveQuest(buildTreasureMapBearCaveQuest(bearCaveQuestBinding), bearCaveQuestBinding)]
        : []),
    ], caveBinding).map((def) => ({ ...def, settlementId: homeSettlementId })),
    homeNpcDescriptors,
  )
  const occupiedLandmarkIds = new Set<string>()
  const occupyLandmarkObjective = (objective: { type: string, landmarkId?: string }): void => {
    if (objective.type === 'interact_landmark' && objective.landmarkId) {
      occupiedLandmarkIds.add(objective.landmarkId)
    }
  }
  const occupyQuestLandmarks = (quest: {
    worldKnowledge?: readonly { bind: { landmarkId?: string } }[]
    stages: readonly {
      objective: { type: string, landmarkId?: string }
      objectives?: readonly { objective: { type: string, landmarkId?: string } }[]
    }[]
  }): void => {
    for (const slot of quest.worldKnowledge ?? []) {
      if (slot.bind.landmarkId) occupiedLandmarkIds.add(slot.bind.landmarkId)
    }
    for (const stage of quest.stages) {
      const slots = stage.objectives && stage.objectives.length > 0
        ? stage.objectives
        : [{ objective: stage.objective }]
      for (const entry of slots) occupyLandmarkObjective(entry.objective)
    }
  }
  for (const quest of landmarkQuests) occupyQuestLandmarks(quest)
  const neighborDefs = nearbyRpgSettlementDefs(homeDef, (cell) => bundle.settlementsManager.peekDef(cell))
  const opportunitySettlements = [homeDef, ...neighborDefs]
  const npcsBySettlement = new Map(
    opportunitySettlements.map((def) => [def.id, opportunityNpcsFromSettlement(def)] as const),
  )
  const settlementNameById = new Map(opportunitySettlements.map((def) => [def.id, def.name] as const))
  const rpgSettlementRefs: RpgSettlementRef[] = opportunitySettlements.map((def) => ({
    id: def.id,
    name: def.name,
    x: def.x,
    z: def.z,
    npcs: npcsBySettlement.get(def.id) ?? [],
  }))
  const boundCaveDescription = (
    caveId: string,
    caveLocationId: string,
    settlementX: number,
    settlementZ: number,
    speakerRole: Role | null,
  ): string => resolveCaveQuestPresentation({
    archetype: bundle.caves.archetypeOf(caveId),
    location: worldLocationCatalog.getById(caveLocationId),
    settlementX,
    settlementZ,
    speakerRole,
  })
  const suspiciousTransportGiver = suspiciousTransportCaveCache
    ? (npcsBySettlement.get(suspiciousTransportCaveCache.settlementId) ?? [])
      .find((npc) => npc.id === suspiciousTransportCaveCache.giverNpcId)
    : undefined
  const suspiciousTransportSettlement = suspiciousTransportCaveCache
    ? opportunitySettlements.find((entry) => entry.id === suspiciousTransportCaveCache.settlementId)
    : undefined
  const suspiciousTransportCaveDescription = suspiciousTransportCaveCache && suspiciousTransportSettlement
    ? boundCaveDescription(
      suspiciousTransportCaveCache.caveId,
      suspiciousTransportCaveCache.caveLocationId,
      suspiciousTransportSettlement.x,
      suspiciousTransportSettlement.z,
      suspiciousTransportGiver?.role ?? null,
    )
    : null
  const rpgContext = {
    npcsBySettlement,
    settlementNameById,
    suspiciousTransportCaveCache,
    suspiciousTransportCaveDescription,
  }
  const persistedQuestIds = initialSave?.quests.progress.map((entry) => entry.id)
  const opportunityQuestDefs: ReturnType<typeof buildWorldDrivenSettlementQuests> = []
  for (const def of opportunitySettlements) {
    const landmarks: RpgLandmarkRef[] = []
    for (const kind of OLD_PLACE_LANDMARK_KINDS) {
      const found = bundle.chunkManager.findLandmarkNear(
        kind,
        def.x,
        def.z,
        LANDMARK_QUEST_SEARCH_CHUNK_RADIUS,
      )
      if (found) landmarks.push({ id: found.id, kind })
    }
    const npcs = npcsBySettlement.get(def.id) ?? []
    const generated = buildWorldDrivenSettlementQuests({
      settlementId: def.id,
      settlementName: def.name,
      spawners: def.isHome ? bundle.fauna.getSpawners() : [],
      npcs,
      persistedQuestIds,
      includeWorldDriven: def.isHome,
      livestock: def.isHome
        ? (bundle.settlementsManager.getLoaded().find((settlement) => settlement.id === def.id)?.livestock ?? [])
          .map((animal) => livestockStrayCandidateFromAgent(def.id, animal))
        : [],
      rpg: {
        settlementId: def.id,
        settlementX: def.x,
        settlementZ: def.z,
        npcs,
        landmarks,
        occupiedLandmarkIds,
        otherSettlements: rpgSettlementRefs,
        persistedQuestIds,
        context: rpgContext,
      },
    })
    for (const quest of generated) {
      opportunityQuestDefs.push(quest)
      occupyQuestLandmarks(quest)
    }

    if (def.isHome) {
      const hunterProfessionQuests = buildHunterProfessionQuests({
        settlementId: def.id,
        settlementName: def.name,
        npcs,
        spawners: bundle.fauna.getSpawners(),
        persistedQuestIds,
      })

      opportunityQuestDefs.push(...hunterProfessionQuests)

      const hasHunterIII = hunterProfessionQuests.some((quest) => {
        const parsed = parseHunterProfessionQuestId(quest.id)
        return parsed?.step === 3
      })

      if (hasHunterIII) {
        const huntersBrotherhoodQuest = buildHuntersBrotherhoodIntroductionQuest({
          home: { id: def.id, name: def.name, npcs },
          neighbors: neighborDefs.map((neighbor) => ({
            id: neighbor.id,
            name: neighbor.name,
            npcs: npcsBySettlement.get(neighbor.id) ?? [],
          })),
        })

        if (huntersBrotherhoodQuest) {
          opportunityQuestDefs.push(huntersBrotherhoodQuest)
        }
      }

      const loadedHome = bundle.settlementsManager.getLoaded().find((settlement) => settlement.id === def.id)
      const eveningQuest = buildGuardEveningDutyQuest({
        settlementId: def.id,
        settlementName: def.name,
        npcs,
        villageTorches: loadedHome?.villageTorches ?? [],
        hasCampfire: Boolean(loadedHome?.fire),
        persistedQuestIds,
      })

      if (eveningQuest) opportunityQuestDefs.push(eveningQuest)
      if (lostHunterBinding) {
        const homeNpcs = settlementOpportunityNpcsFromDef(def)
        const witness = homeNpcs.find((npc) => npc.id === lostHunterBinding.witnessNpcId)
        opportunityQuestDefs.push(buildLostHunterNaturalCaveQuest(
          lostHunterBinding,
          homeNpcs,
          def.name,
          boundCaveDescription(
            lostHunterBinding.caveId,
            lostHunterBinding.caveLocationId,
            def.x,
            def.z,
            witness?.role ?? null,
          ),
        ))
      }

      if (oldBonesBinding) {
        const homeNpcs = settlementOpportunityNpcsFromDef(def)
        const giver = homeNpcs.find((npc) => npc.id === oldBonesBinding.giverNpcId)
        opportunityQuestDefs.push(buildOldBonesAdventureCaveQuest(
          oldBonesBinding,
          homeNpcs,
          def.name,
          boundCaveDescription(
            oldBonesBinding.caveId,
            oldBonesBinding.caveLocationId,
            def.x,
            def.z,
            giver?.role ?? null,
          ),
        ))
      }

      if (dungeonBanditBinding) {
        const homeNpcs = settlementOpportunityNpcsFromDef(def)
        const neighborNpcs = neighborDefs.flatMap((neighbor) => (
          settlementOpportunityNpcsFromDef(neighbor)
        ))
        const allNpcs = [...homeNpcs, ...neighborNpcs]
        const giver = allNpcs.find((npc) => npc.id === dungeonBanditBinding.giverNpcId)
        opportunityQuestDefs.push(buildDungeonBanditTreasureQuest(
          dungeonBanditBinding,
          allNpcs,
          def.name,
          boundCaveDescription(
            dungeonBanditBinding.caveId,
            dungeonBanditBinding.caveLocationId,
            def.x,
            def.z,
            giver?.role ?? null,
          ),
        ))
      }

      if (lostTreasureExpeditionBinding) {
        const homeNpcs = settlementOpportunityNpcsFromDef(def)
        const neighborNpcs = neighborDefs.flatMap((neighbor) => (
          settlementOpportunityNpcsFromDef(neighbor)
        ))
        const allNpcs = [...homeNpcs, ...neighborNpcs]
        const sponsor = allNpcs.find((npc) => npc.id === lostTreasureExpeditionBinding.sponsorNpcId)
        opportunityQuestDefs.push(buildLostTreasureExpeditionQuest(
          lostTreasureExpeditionBinding,
          allNpcs,
          def.name,
          boundCaveDescription(
            lostTreasureExpeditionBinding.caveId,
            lostTreasureExpeditionBinding.caveLocationId,
            def.x,
            def.z,
            sponsor?.role ?? null,
          ),
        ))
      }

      const homeGuard = selectGuardQuestGiver(npcs)
      migrateLegacyGuardSwordGift(guardProgress, homeGuard?.id)
    }
  }

  const elderCandidateDefs = []
  for (const cell of cellsWithinRadius(
    { gx: homeDef.gx, gz: homeDef.gz },
    LOST_TREASURE_ELDER_SETTLEMENT_SEARCH_RADIUS,
  )) {
    if (cell.gx === homeDef.gx && cell.gz === homeDef.gz) continue
    const def = bundle.settlementsManager.peekDef(cell)
    if (def) elderCandidateDefs.push(def)
  }

  const elderSettlement = findLostTreasureChroniclesElderSettlement(elderCandidateDefs)
  if (elderSettlement) {
    const elderBinding = resolveLostTreasureChroniclesElderBinding(elderSettlement)
    if (elderBinding) opportunityQuestDefs.push(...buildLostTreasureChroniclesElderQuests(elderBinding))
  }

  const chronicleSearchBinding = getActiveLostTreasureChronicleSearchBinding()
  if (chronicleSearchBinding) {
    opportunityQuestDefs.push(...buildLostTreasureChronicleSearchQuests(chronicleSearchBinding))
  }

  const chronicleDecipheringBinding = getActiveLostTreasureChronicleDecipheringBinding()
  if (chronicleDecipheringBinding) {
    opportunityQuestDefs.push(buildLostTreasureChronicleDecipheringQuest(chronicleDecipheringBinding))
  }

  const homeGuardNpcId = selectGuardQuestGiver(npcsBySettlement.get(homeSettlementId) ?? [])?.id
  guardLocalKnowledge.restore(normalizeSaveGuardLocalKnowledge(initialSave?.map.guardLocalKnowledge, homeGuardNpcId))
  const questDefs = [...authoredQuestDefs, ...opportunityQuestDefs]
  const initialQuestState = initialSave?.quests
    ? {
        ...initialSave.quests,
        relations: normalizeLegacyQuestRelations(initialSave.quests.relations, homeNpcDescriptors),
      }
    : undefined

  const physicalOutcomeResolver = {
    canResolve(
      questId: string,
      outcomeId: string,
      context: {
        requireCarriedContainerId?: string
        requireCarriedUnopened?: boolean
        requireItemInstanceId?: string
      },
    ): boolean {
      if (context.requireItemInstanceId && !inventory.getInstance(context.requireItemInstanceId)) {
        return false
      }

      if (context.requireCarriedContainerId) {
        if (bearCaveBinding && context.requireCarriedContainerId === bearCaveBinding.casketId) {
          if (worldFlags.treasureMapBearCaveCasketConsumed) return false
          if (context.requireCarriedUnopened && worldFlags.treasureMapBearCaveCasketOpened) return false
        }
        if (bundle.placedContainers.carriedId() !== context.requireCarriedContainerId) return false
      }

      if (oldBonesBinding && questId === oldBonesBinding.questId) {
        const requiredId = context.requireItemInstanceId ?? oldBonesBinding.signetInstanceId
        const signet = inventory.getInstance(requiredId)
        if (signet?.kind !== OLD_BONES_SIGNET_KIND) return false
        if (outcomeId === OLD_BONES_KEEP_SIGNET_OUTCOME) return true
        const npcId = outcomeId === OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME
          ? oldBonesBinding.claimantANpcId
          : outcomeId === OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME
            ? oldBonesBinding.claimantBNpcId
            : undefined
        if (!npcId) return false
        const npcState = bundle.settlementsManager.getNpcState(npcId)
        if (!npcState || npcState.health.dead) return false
        return npcState.personalInventory.canAddInstance(signet)
      }

      if (dungeonBanditBinding && questId === dungeonBanditBinding.questId) {
        const marked = inventory.getInstance(dungeonBanditBinding.markedValuableInstanceId)
        const ledger = inventory.getInstance(dungeonBanditBinding.ledgerInstanceId)
        if (marked?.kind !== DUNGEON_BANDIT_MARKED_VALUABLE_KIND) return false
        if (ledger?.kind !== DUNGEON_BANDIT_LEDGER_KIND) return false
        if (outcomeId === DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME) return true
        if (outcomeId === DUNGEON_BANDIT_RETURN_MARKED_PROPERTY_OUTCOME) {
          const npcState = bundle.settlementsManager.getNpcState(dungeonBanditBinding.claimantNpcId)
          if (!npcState || npcState.health.dead) return false
          return npcState.personalInventory.canAddInstance(marked)
        }
        if (outcomeId === DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME) {
          const npcState = bundle.settlementsManager.getNpcState(dungeonBanditBinding.giverNpcId)
          if (!npcState || npcState.health.dead) return false
          return npcState.personalInventory.canAddInstance(marked)
            && npcState.personalInventory.canAddInstance(ledger)
        }
        return false
      }

      if (lostTreasureExpeditionBinding && questId === lostTreasureExpeditionBinding.questId) {
        const requiredId = context.requireItemInstanceId ?? lostTreasureExpeditionBinding.journalInstanceId
        const journal = inventory.getInstance(requiredId)
        if (journal?.kind !== LOST_TREASURE_EXPEDITION_JOURNAL_KIND) return false
        if (outcomeId === LOST_TREASURE_EXPEDITION_KEEP_JOURNAL_OUTCOME) return true
        const npcId = outcomeId === LOST_TREASURE_EXPEDITION_JOURNAL_TO_FAMILY_OUTCOME
          ? lostTreasureExpeditionBinding.stakeholderNpcId
          : outcomeId === LOST_TREASURE_EXPEDITION_JOURNAL_TO_SPONSOR_OUTCOME
            ? lostTreasureExpeditionBinding.sponsorNpcId
            : undefined
        if (!npcId) return false
        const npcState = bundle.settlementsManager.getNpcState(npcId)
        if (!npcState || npcState.health.dead) return false
        return npcState.personalInventory.canAddInstance(journal)
      }

      if (suspiciousTransportCaveCache && questId === suspiciousTransportCaveCache.questId) {
        const requiredId = context.requireItemInstanceId ?? suspiciousTransportCaveCache.evidenceInstanceId
        const evidence = inventory.getInstance(requiredId)
        if (evidence?.kind !== SUSPICIOUS_TRANSPORT_EVIDENCE_KIND) return false
        if (outcomeId === SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME) return true
        const npcId = outcomeId === SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME
          ? suspiciousTransportCaveCache.giverNpcId
          : outcomeId === SUSPICIOUS_TRANSPORT_REPORT_IT_OUTCOME
            ? suspiciousTransportCaveCache.counterpartNpcId
            : null
        if (!npcId) return false
        const npcState = bundle.settlementsManager.getNpcState(npcId)
        if (!npcState || npcState.health.dead) return false
        return npcState.personalInventory.canAddInstance(evidence)
      }

      return Boolean(context.requireItemInstanceId || context.requireCarriedContainerId)
    },
    onResolve(questId: string, outcomeId: string): void {
      if (oldBonesBinding && questId === oldBonesBinding.questId) {
        if (outcomeId === OLD_BONES_KEEP_SIGNET_OUTCOME) return
        const npcId = outcomeId === OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME
          ? oldBonesBinding.claimantANpcId
          : outcomeId === OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME
            ? oldBonesBinding.claimantBNpcId
            : undefined
        if (!npcId) return
        giveItemInstanceToNpc(
          {
            playerInventory: inventory,
            getNpcState: (id) => bundle.settlementsManager.getNpcState(id),
          },
          { npcId, instanceId: oldBonesBinding.signetInstanceId },
        )
        return
      }
      if (dungeonBanditBinding && questId === dungeonBanditBinding.questId) {
        if (outcomeId === DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME) return
        const transferDeps = {
          playerInventory: inventory,
          getNpcState: (id: string) => bundle.settlementsManager.getNpcState(id),
        }
        if (outcomeId === DUNGEON_BANDIT_RETURN_MARKED_PROPERTY_OUTCOME) {
          giveItemInstanceToNpc(transferDeps, {
            npcId: dungeonBanditBinding.claimantNpcId,
            instanceId: dungeonBanditBinding.markedValuableInstanceId,
          })
          return
        }
        if (outcomeId === DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME) {
          giveItemInstanceToNpc(transferDeps, {
            npcId: dungeonBanditBinding.giverNpcId,
            instanceId: dungeonBanditBinding.markedValuableInstanceId,
          })
          giveItemInstanceToNpc(transferDeps, {
            npcId: dungeonBanditBinding.giverNpcId,
            instanceId: dungeonBanditBinding.ledgerInstanceId,
          })
        }
        return
      }
      if (lostTreasureExpeditionBinding && questId === lostTreasureExpeditionBinding.questId) {
        if (outcomeId === LOST_TREASURE_EXPEDITION_KEEP_JOURNAL_OUTCOME) return
        const npcId = outcomeId === LOST_TREASURE_EXPEDITION_JOURNAL_TO_FAMILY_OUTCOME
          ? lostTreasureExpeditionBinding.stakeholderNpcId
          : outcomeId === LOST_TREASURE_EXPEDITION_JOURNAL_TO_SPONSOR_OUTCOME
            ? lostTreasureExpeditionBinding.sponsorNpcId
            : undefined
        if (!npcId) return
        giveItemInstanceToNpc(
          {
            playerInventory: inventory,
            getNpcState: (id) => bundle.settlementsManager.getNpcState(id),
          },
          { npcId, instanceId: lostTreasureExpeditionBinding.journalInstanceId },
        )
        return
      }
      if (suspiciousTransportCaveCache && questId === suspiciousTransportCaveCache.questId) {
        if (outcomeId === SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME) return
        const npcId = outcomeId === SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME
          ? suspiciousTransportCaveCache.giverNpcId
          : outcomeId === SUSPICIOUS_TRANSPORT_REPORT_IT_OUTCOME
            ? suspiciousTransportCaveCache.counterpartNpcId
            : null
        if (!npcId) return
        giveItemInstanceToNpc(
          {
            playerInventory: inventory,
            getNpcState: (id) => bundle.settlementsManager.getNpcState(id),
          },
          { npcId, instanceId: suspiciousTransportCaveCache.evidenceInstanceId },
        )
      }
    },
  }

  const questLifecycleHooks = {
    revealLocation: (locationId: string, options?: { setNavigation?: boolean }) => {
      revealLocationKnowledge(
        locationId,
        worldLocationCatalog,
        locationKnowledge,
        navigationTargets,
        options,
      )
    },
    transferItemInstance: (instanceId: string, npcId: string) => (
      giveItemInstanceToNpc(
        {
          playerInventory: inventory,
          getNpcState: (id) => bundle.settlementsManager.getNpcState(id),
        },
        { npcId, instanceId },
      ).status === 'ok'
    ),
    transferItemCount: (kind: ItemKind, count: number, npcId: string) => (
      giveItemCountToNpc(
        {
          playerInventory: inventory,
          getNpcState: (id) => bundle.settlementsManager.getNpcState(id),
        },
        { npcId, kind, amount: count, nowDays: dayNight.elapsedDays },
      ).status === 'ok'
    ),
    discardCarriedContainer: (containerId: string) => {
      if (bundle.placedContainers.carriedId() !== containerId) return false
      if (bearCaveBinding && containerId === bearCaveBinding.casketId) {
        worldFlags.treasureMapBearCaveCasketConsumed = true
      }
      return bundle.placedContainers.discardCarried()
    },
    // Authored `zagubiona-owca` may start a real fauna-owned stray for its
    // bound sheep (plan quests-progression-030). Generated lost-livestock
    // never uses this hook — it only observes existing stray/corpse state.
    onAnimalTargetBound: (questId: string, animalId: string) => {
      if (questId !== 'zagubiona-owca') return
      const animal = bundle.settlementsManager.resolvePersistentAnimal(animalId)
      if (!animal || animal.isStrayActive()) return
      const predators = bundle.fauna.getAgents()
        .filter((agent) => agent.def.role === 'predator' && !agent.isDead())
        .map((agent) => ({ x: agent.mesh.position.x, z: agent.mesh.position.z }))
      animal.startLivestockStray({ predators })
    },
  }

  const questManager: QuestManager = new QuestManager(
    questDefs,
    worldAudio.playOnce,
    inventory,
    initialQuestState,
    (kind, count) => {
      grantItem(kind, count)
      toast.show(`+${count} ${ITEM_DEFS[kind].label}`, 'pickup')
    },
    // Reads `bundle` (not a destructured `bundle.fauna`) so this stays valid
    // across `rebuildWorldBundle()` — see `worldBundle.ts`'s header comment.
    // Wild fauna and settlement livestock are disjoint populations by kind
    // (wolf/deer/etc. are never livestock, sheep/chicken/etc. are never wild
    // — see `AnimalAgent.ts`'s `ANIMAL_DEFS`), so trying wild fauna first and
    // falling back to loaded settlements' livestock covers both without the
    // resolver needing to know which population a given kind belongs to
    // (plan 093 Etap G — lets `find_animal: { kind: 'sheep' }` resolve).
    (kind) => {
      const wild = bundle.fauna.getAgents().find((a) => a.def.kind === kind && !a.isDead())
      if (wild) return wild.animalId
      for (const settlement of bundle.settlementsManager.getLoaded()) {
        const owned = settlement.livestock.find((a) => a.def.kind === kind && !a.isDead())
        if (owned) return owned.animalId
      }
      return undefined
    },
    // Wolves are wild-fauna-only (see the resolver above), so no need to also
    // scan settlement livestock here (plan 110's `grozny-wilk` trait).
    (animalId) => {
      bundle.fauna.getAgents().find((a) => a.animalId === animalId)?.markDangerous()
    },
    // The persistent quest → reputation seam (plan quests-progression-001
    // §10) — `QuestManager` never imports `ReputationManager` directly.
    (consequence) => {
      applySocialConsequence(reputation, consequence)
      refreshCharacterReputation()
    },
    {
      getReputationDimension: (settlementId, dimension) => reputation.getReputationDimension(settlementId, dimension),
      getRenown: (settlementId) => reputation.getRenown(settlementId),
    },
    {
      getSnapshot: (settlementId) => ({
        storageDamaged: bundle.settlementsManager.isStorageDamaged(settlementId),
        nestDestroyed: bundle.settlementsManager.isNestDestroyed(settlementId),
        aliveRatCount: bundle.settlementsManager.countAliveRats(settlementId),
      }),
    },
    (animalId) => bundle.settlementsManager.transferAnimalOwnership(animalId, { kind: 'player' }),
    (animalId) => getHorseAcquisitionState({
      animal: bundle.settlementsManager.resolvePersistentAnimal(animalId),
      isReservedByQuest: questManager.isHorseRewardReserving(animalId),
    }) === 'available',
    {
      isPermanentlyDestroyed: (spawnerId) => bundle.fauna.isQuestSpawnPointPermanentlyDestroyed(spawnerId),
    },
    {
      hasReadItem: (itemKind) => itemKind === 'treasure_map_dark_forest' && worldFlags.treasureMapDarkForestRead,
      hasDiscoveredLocation: (locationId) => locationKnowledge.has(locationId),
      isWorldContainerLooted: (containerId) => {
        if (lostHunterBinding && containerId === lostHunterBinding.packContainerId) {
          const instances = bundle.worldGeneratedContainers.containerInstances(containerId, 'hunting_bow')
          return isLostHunterPackLooted(instances, lostHunterBinding.bowInstanceId)
        }
        if (oldBonesBinding && containerId === oldBonesBinding.containerId) {
          const instances = bundle.worldGeneratedContainers.containerInstances(
            containerId,
            OLD_BONES_SIGNET_KIND,
          )
          return isOldBonesRemainsLooted(instances, oldBonesBinding.signetInstanceId)
        }
        if (dungeonBanditBinding && containerId === dungeonBanditBinding.deepContainerId) {
          const instances = bundle.worldGeneratedContainers.containerInstances(
            containerId,
            DUNGEON_BANDIT_MARKED_VALUABLE_KIND,
          )
          return isDungeonBanditDeepStashLooted(
            instances,
            dungeonBanditBinding.markedValuableInstanceId,
          )
        }
        if (suspiciousTransportCaveCache && containerId === suspiciousTransportCaveCache.cacheContainerId) {
          const instances = bundle.worldGeneratedContainers.containerInstances(
            containerId,
            SUSPICIOUS_TRANSPORT_EVIDENCE_KIND,
          )
          return isSuspiciousTransportCacheLooted(instances, suspiciousTransportCaveCache.evidenceInstanceId)
        }
        if (lostTreasureExpeditionBinding && containerId === lostTreasureExpeditionBinding.campContainerId) {
          return isLostTreasureExpeditionCampLooted(
            bundle.worldGeneratedContainers.containerCounts(containerId),
          )
        }
        if (lostTreasureExpeditionBinding && containerId === lostTreasureExpeditionBinding.journalContainerId) {
          const instances = bundle.worldGeneratedContainers.containerInstances(
            containerId,
            LOST_TREASURE_EXPEDITION_JOURNAL_KIND,
          )
          return isLostTreasureExpeditionJournalPackLooted(instances, lostTreasureExpeditionBinding.journalInstanceId)
        }
        if (lostTreasureExpeditionBinding && containerId === lostTreasureExpeditionBinding.evidenceContainerId) {
          return isLostTreasureExpeditionEvidenceLooted(
            bundle.worldGeneratedContainers.containerCounts(containerId),
          )
        }
        if (lostTreasureExpeditionBinding && containerId === lostTreasureExpeditionBinding.finalTreasureContainerId) {
          return isLostTreasureExpeditionFinalTreasureLooted(
            bundle.worldGeneratedContainers.containerCounts(containerId),
          )
        }
        const chronicleSearch = getActiveLostTreasureChronicleSearchBinding()
        if (chronicleSearch && containerId === chronicleSearch.ruinsContainerId) {
          const kind = chronicleSearch.truth === 'ruins' ? ENCODED_CHRONICLE_KIND : CHRONICLE_SEARCH_EVIDENCE_KIND
          const instanceId = chronicleSearch.truth === 'ruins'
            ? chronicleSearch.chronicleInstanceId
            : chronicleSearch.evidenceInstanceId
          return isChronicleSearchSourceLooted(
            bundle.worldGeneratedContainers.containerInstances(containerId, kind),
            instanceId,
          )
        }
        return isDarkForestTreasureChestLooted(
          bundle.worldGeneratedContainers.containerCounts(containerId),
        )
      },
      hasResolvedHiddenFindSpot: (spotId) => resolvedHiddenFindSpotIds.has(spotId),
      hasAcquiredPortableContainer: (containerId) => {
        if (!bearCaveBinding || containerId !== bearCaveBinding.casketId) return false
        if (worldFlags.treasureMapBearCaveCasketConsumed) return false
        if (bundle.placedContainers.carriedId() === containerId) return true
        if (bundle.placedContainers.find(containerId)) return true
        return worldFlags.treasureMapBearCaveSourceExtracted
      },
    },
    {
      getStatus: (questId) => {
        const parsed = parseWolfDenPressureQuestId(questId)
        if (!parsed) return 'untracked'
        return wolfDenPressureStatusFromSpawners(parsed.spawnerId, bundle.fauna.getSpawners())
      },
    },
    {
      getSnapshot: (questId) => {
        const parsed = parseLostLivestockQuestId(questId)
        // Recognized generated lost-livestock ids must return a concrete
        // fauna snapshot (never `untracked`) so calm/returned/unavailable
        // animals stay non-offerable (plan quests-progression-030).
        if (!parsed) return 'untracked'
        const animal = bundle.settlementsManager.resolvePersistentAnimal(parsed.animalId)
        if (!animal) return 'unavailable'
        return animal.lostLivestockStatus()
      },
    },
    {
      getWorldSeed: () => config.seed,
      getTimeOfDay: () => dayNight.timeOfDay,
      getElapsedDays: () => dayNight.elapsedDays,
    },
    createSettlementLightLookup(() => bundle.settlementsManager.getLoaded()),
    physicalOutcomeResolver,
    questLifecycleHooks,
    createQuestWorldKnowledgeResolver({
      getHost: () => bundle,
      getDefs: () => questDefs,
      searchRadius: LANDMARK_QUEST_SEARCH_CHUNK_RADIUS,
      chunkSize: config.terrain.chunkSize,
      getChronicleSearch: () => getActiveLostTreasureChronicleSearchBinding(),
      research: worldKnowledgeResearch,
    }),
  )

  const refreshGuardEveningPolicies = (): void => {
    syncGuardEveningNightPolicies(questManager, () => bundle.settlementsManager.getLoaded())
  }
  refreshGuardEveningPolicies()

  // Plan quests-progression-056 — conservative one-time repair for legacy
  // saves that reached the dungeon-bandit deep-stash acquisition/decision
  // boundary without owning both exact story items anywhere legal. No-op for
  // healthy saves; recreates a proven-orphaned instance back into the bound
  // deep stash only, never directly into Player Inventory.
  if (dungeonBanditBinding) {
    const dungeonBanditDef = questDefs.find((entry) => entry.id === dungeonBanditBinding.questId)
    const acquisitionStageIndex = dungeonBanditDef?.stages.findIndex((stage) => (
      questStageObjectiveSlots(stage).some((slot) => (
        slot.objective.type === 'loot_world_container'
        && slot.objective.containerId === dungeonBanditBinding.deepContainerId
      ))
    )) ?? -1
    const dungeonBanditProgress = questManager.exportProgress()
      .find((entry) => entry.id === dungeonBanditBinding.questId)
    const orphanedInstances = dungeonBanditOrphanedInstances(
      dungeonBanditBinding,
      {
        questState: dungeonBanditProgress?.state ?? 'not_offered',
        questStageIndex: dungeonBanditProgress?.stageIndex ?? 0,
        acquisitionStageIndex,
      },
      {
        playerInventory: inventory,
        worldGeneratedContainers: bundle.worldGeneratedContainers,
        placedContainers: bundle.placedContainers,
      },
    )
    for (const instance of orphanedInstances) {
      bundle.worldGeneratedContainers.depositInstance(dungeonBanditBinding.deepContainerId, instance)
    }
  }

  // Now that `questManager` exists, the closures passed into `createWorldBundle`
  // above can actually reach it — see those call sites' comments.
  getPlayerSocialTarget = (context) => ({
    relationLevel: questManager.getRelationLevel(context.npcId),
    standing: questManager.getPlayerStanding(),
    reputation: reputation.getReputation(context.settlementId),
    renown: reputation.getRenown(context.settlementId),
  })
  onAnimalDeathTarget = (animalId) => {
    const agent = bundle.fauna.getAgents().find((a) => a.animalId === animalId)
      ?? bundle.settlementsManager.resolvePersistentAnimal(animalId)
    if (agent) {
      const originSettlementId = bundle.settlementsManager.resolvePersistentAnimalOrigin(animalId) ?? 'detached'
      reconcileAnimalPackHandoff(agent, originSettlementId, bundle.placedContainers)
    }
    questManager.onInteractObjective({
      type: 'animal_died',
      animalId,
      ...(agent ? { kind: agent.def.kind } : {}),
    })
    questManager.onHorseRewardTargetDied(animalId)
    questManager.pollSettlementRatInfestationObjectives()
    questManager.pollLostLivestockSources()
  }
  // Restore-time reconciliation (plan fauna-039 §21) — a save taken between
  // an animal's death and a successful handoff (or one written by a build
  // predating this plan) could restore a dead player-owned animal that
  // still thinks it's carrying a pack. `reconcileAnimalPackHandoff` is the
  // exact same idempotent helper `onAnimalDeathTarget` calls at runtime, so
  // running it once here for every already-restored detached animal is safe
  // regardless of whether a handoff already happened.
  for (const animal of bundle.settlementsManager.getDetachedLivestock()) {
    const originSettlementId = bundle.settlementsManager.resolvePersistentAnimalOrigin(animal.animalId) ?? 'detached'
    reconcileAnimalPackHandoff(animal, originSettlementId, bundle.placedContainers)
  }
  // Character Screen's known-settlement reputation view (plan ui-input-019) —
  // refreshed on screen open (`openCharacter` below), on selector change, and
  // after a social consequence, never per-frame. Known options come from
  // `LocationKnowledge` ∩ the world-location catalog; standing is read from
  // `ReputationManager` for the selected id only.
  refreshCharacterReputationTarget = (mode = 'standing'): void => {
    let currentId: string | null = null
    if (mode === 'open') {
      revealSettlementsInRange(
        player.mesh.position.x,
        player.mesh.position.z,
        lookupSettlementCell,
        worldLocationCatalog,
        locationKnowledge,
      )
      currentId = findSettlementContainingPlayer(
        player.mesh.position.x,
        player.mesh.position.z,
        lookupSettlementCell,
      )?.id ?? null
      if (currentId) lastVisitedSettlementId = currentId
    }
    const options = listKnownSettlementOptions(locationKnowledge, worldLocationCatalog)
    selectedSettlementId = resolveCharacterReputationSettlementId({
      options,
      currentSettlementId: mode === 'open' ? currentId : null,
      lastVisitedSettlementId,
      homeSettlementId,
      previousSelectedSettlementId: selectedSettlementId,
    })
    const selected = options.find((option) => option.settlementId === selectedSettlementId) ?? null
    hud.setCharacterReputation({
      settlements: options,
      selectedSettlementId: selected?.settlementId ?? null,
      selected: selected
        ? {
            settlementId: selected.settlementId,
            settlementName: selected.settlementName,
            reputation: reputation.getReputation(selected.settlementId),
            renown: reputation.getRenown(selected.settlementId),
            settlementBadges: badges.listSettlementEarned(selected.settlementId),
          }
        : null,
    })
  }
  vueUi.configureCharacterScreen({
    onSelectSettlement: (settlementId) => {
      const options = listKnownSettlementOptions(locationKnowledge, worldLocationCatalog)
      if (!options.some((option) => option.settlementId === settlementId)) return
      selectedSettlementId = settlementId
      refreshCharacterReputation('standing')
    },
  })

  hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
  hud.setPlayerBadges(badges.listEarned())

  const foreignPropertyUse = createForeignPropertyUse({
    resolveContext: (animal) => resolveMerchantHorseForeignUse(
      animal,
      bundle.settlementsManager.getLoaded(),
      (id) => bundle.settlementsManager.resolvePersistentAnimal(id),
    ),
    getRelation: (npcId) => questManager.getRelation(npcId),
    getRelationLevel: (npcId) => questManager.getRelationLevel(npcId),
    adjustRelation: (npcId, amount) => questManager.adjustRelation(npcId, amount),
    applyGrievance: (merchantKey, markup, elapsedDays) => {
      tradeGrievances.applyUnauthorizedUse(merchantKey, markup, elapsedDays)
    },
    nowDays: () => dayNight.elapsedDays,
    playNegativeConsequence: () => playNegativeConsequence(worldAudio.playOnce),
  })

  // Assigned once `inventoryScreen` exists further down; every caller runs
  // later, so the initial no-op is never the one that fires.
  let refreshInventoryScreen: () => void = () => {}
  // Assigned once `npcItemTransfer` exists (needs `actionCtx` below).
  let openNpcGiveItem: (npcId: string, displayName: string) => void = () => {}

  const inventoryWiring = createInventoryWiring({
    bundle,
    player,
    inventory,
    heldTool,
    equipment,
    primaryWeapons,
    playerCombatMode,
    playerTorch,
    hud,
    toast,
    vueUi,
    questManager,
    reputationManager: reputation,
    tradeGrievances,
    worldFlags,
    playOnce: worldAudio.playOnce,
    grantItem,
    syncHeldHud: () => syncHeldHud(),
    syncQuickActionAvailability,
    refreshInventoryScreen: () => refreshInventoryScreen(),
    syncPlayerAppearance,
    locationCatalog: worldLocationCatalog,
    locationKnowledge,
    navigationTargets,
    dayNight,
    openNpcGiveItem: (npcId, displayName) => openNpcGiveItem(npcId, displayName),
    guardProgress,
    homeSettlementId,
    homeGuardNpcId,
    guardLocalKnowledge,
  })
  vueUi.configurePrimaryWeaponShortcuts({
    equipMelee: inventoryWiring.equipPrimaryMeleeWeapon,
    equipRanged: inventoryWiring.equipPrimaryRangedWeapon,
    sheathe: inventoryWiring.sheatheCombatWeapon,
  })

  const timeSkip = createTimeSkip(dayNight)
  const timeSkipOverlay = createTimeSkipOverlay(container)
  const busy = createBusyAction(
    (amount) => drainStamina(player.needs.stamina, amount),
    (amount) => drainVigor(player.needs.vigor, amount),
  )
  const busyOverlay = createBusyOverlay(container)
  const restCamp = createRestCampSequence(scene, player, (x, z) => bundle.chunkManager.sampleHeight(x, z))

  /** The single post-inventory-mutation sync every action/trade path calls —
   *  held tool, HUD label, Quick Actions availability and an open merchant. */
  const onInventoryChanged = (): void => {
    heldTool.syncWithInventory()
    syncHeldHud()
    syncQuickActionAvailability()
    inventoryWiring.syncMerchantIfOpen()
    questManager.notifyInventoryChanged()
    syncPlayerAppearance()
  }

  // Settlement Known Deeds unlock fan-out (plan quests-progression-059) — the
  // single seam every deed producer's newly-earned local badge routes
  // through: announce the toast, apply its optional one-shot consequence,
  // and refresh the Character Screen's reputation + local-badge projection.
  // Do not repeat this triple separately per producer.
  const handleSettlementBadgeUnlock = (unlock: SettlementBadgeUnlock): void => {
    toast.show(`Nowa odznaka: ${unlock.badge.icon} ${unlock.badge.label}`, 'info')
    if (unlock.consequence) applySocialConsequence(reputation, unlock.consequence)
    refreshCharacterReputation()
  }

  const actionCtx: PlayerActionContext = {
    bundle,
    player,
    inventory,
    heldTool,
    equipment,
    playerTorch,
    hud,
    toast,
    busy,
    timeSkip,
    restCamp,
    dayNight,
    mouseLook,
    keyboard,
    getPlayerSocial,
    worldAudio,
    getTreeLifecycle: () => treeLifecycle,
    onInventoryChanged,
    grantItem,
    syncQuickActionAvailability,
    syncHeldHud: () => syncHeldHud(),
    refreshInventoryScreen: () => refreshInventoryScreen(),
    getWorldSeed: () => config.seed,
    onSpawnPointDestroyed: () => {
      questManager.pollDestroySpawnPointObjectives()
      questManager.pollWorldDrivenSources()
    },
    onWorldContainerWithdraw: () => {
      questManager.pollWorldProgressionObjectives()
    },
    onPlayerAnimalHarvested: (context) => {
      questManager.onAnimalHarvested(context)
    },
    onPlayerAnimalCorpseBuried: ({ x, z }) => {
      const settlementId = findSettlementContainingPlayer(x, z, lookupSettlementCell)?.id
      if (!settlementId) return
      const unlock = badges.recordAnimalCorpseBuried(settlementId)
      if (unlock) handleSettlementBadgeUnlock(unlock)
    },
    onPlayerMedicalTreatmentCompleted: ({ settlementId }) => {
      const unlock = badges.recordSuccessfulTreatment(settlementId)
      if (unlock) handleSettlementBadgeUnlock(unlock)
    },
    onSettlementBadgeUnlock: handleSettlementBadgeUnlock,
    onCampfireLit: () => {
      questManager.recheckSettlementLightObjectives()
      refreshGuardEveningPolicies()
    },
  }

  questManager.pollDestroySpawnPointObjectives()
  questManager.pollWorldDrivenSources()
  questManager.pollWorldProgressionObjectives()
  const syncLostLivestockQuests = (): void => {
    // World-driven lost-livestock only observes fauna episodes — never starts
    // them. Authored `zagubiona-owca` starts stray via onAnimalTargetBound.
    questManager.pollLostLivestockSources()
  }
  syncLostLivestockQuests()

  // Riding (plan fauna-003) — livestock has a deterministic per-house
  // `animalId` (`settlement/livestock.ts`), so a saved `mountedAnimalId`
  // resolves back to the same individual after reload; a wild-fauna id would
  // not (see `LIVESTOCK_KINDS`), but only `mount`-configured kinds (horse/
  // donkey, both livestock-only today) can ever be the target in the first
  // place.
  const resolveMountAnimal = (animalId: string): AnimalAgent | null =>
    bundle.settlementsManager.resolvePersistentAnimal(animalId)
    ?? bundle.fauna.getAgents().find((a) => a.animalId === animalId)
    ?? null
  const mount = createMountActions(actionCtx, resolveMountAnimal, {
    beginMountedUse: foreignPropertyUse.beginMountedUse,
    updateMountedUse: foreignPropertyUse.updateMountedUse,
    endMountedUse: foreignPropertyUse.endMountedUse,
  }, {
    // Plan fauna-035: conscious dismount redefines Stay as "here" through the
    // same owned-control seam contextual Follow/Stay actions already use.
    refreshStayOnPlayerDismount: (animal) => {
      bundle.settlementsManager.setOwnedAnimalControl(animal.animalId, 'stay')
    },
  })
  if (initialSave?.player.mountedAnimalId) {
    mount.restoreMountedAnimalId(initialSave.player.mountedAnimalId)
  }
  const lead = createLeadActions(
    actionCtx,
    resolveMountAnimal,
    (id) => mount.mountedAnimalId() === id,
  )

  const placement = createPlacementActions(actionCtx)
  const storageInfestation = createStorageInfestationActions({
    ctx: actionCtx,
    bundle,
    inventory,
    hud,
    toast,
    questManager,
    onInventoryChanged,
  })
  const containers = createContainerActions(actionCtx, {
    vueUi,
    tentBlockers: placement.tentBlockers,
    rendererElement: renderer.domElement,
    unlockedTreasureContainerIds,
    treasureChestMutations,
    tryExtractTreasureMapBearCasket: (containerId) => {
      if (!bearCaveBinding || containerId !== bearCaveBinding.sourceContainerId) return false
      if (worldFlags.treasureMapBearCaveSourceExtracted || worldFlags.treasureMapBearCaveCasketConsumed) return false
      if (bundle.placedContainers.hasCarried()) {
        toast.show('Nie możesz nieść dwóch pojemników naraz.', 'error')
        return true
      }
      if (!bundle.placedContainers.adoptCarried(treasureMapBearCaveSealedCasketCarried(bearCaveBinding))) return false
      bundle.worldGeneratedContainers.remove(bearCaveBinding.sourceContainerId)
      worldFlags.treasureMapBearCaveSourceExtracted = true
      questManager.notifyPortableContainerAcquired(bearCaveBinding.casketId)
      toast.show('Podniesiono zapieczętowaną trumnę.')
      actionCtx.syncQuickActionAvailability()
      return true
    },
    confirmOpenAuthoredCasket: (containerId, open) => {
      if (!isTreasureMapBearCaveAuthoredCasket(bearCaveBinding, containerId)) {
        open()
        return
      }
      if (worldFlags.treasureMapBearCaveCasketOpened || worldFlags.treasureMapBearCaveCasketConsumed) {
        open()
        return
      }
      vueUi.openActionConfirm(
        'Otworzyć trumnę?',
        'Po otwarciu zatrzymasz cały skarb. Tej decyzji nie cofniesz.',
        () => {
          worldFlags.treasureMapBearCaveCasketOpened = true
          questManager.tryResolvePhysicalOutcome(TREASURE_MAP_BEAR_CAVE_QUEST_ID, TREASURE_MAP_BEAR_CAVE_KEPT_OUTCOME_ID)
          open()
        },
        'Otwórz',
      )
    },
  })
  const householdTransfer = createHouseholdResourceTransferActions(actionCtx, {
    vueUi,
    rendererElement: renderer.domElement,
  })
  const npcItemTransfer = createNpcItemTransferActions(actionCtx, {
    vueUi,
    rendererElement: renderer.domElement,
  })
  openNpcGiveItem = npcItemTransfer.openNpcGiveItem
  const contracts = createWorkContractActions(actionCtx, {
    vueUi,
    tentBlockers: placement.tentBlockers,
  })
  const gathering = createGatheringActions(actionCtx, { vueUi, fishingBait, fishingAttempts })
  const survival = createSurvivalActions(actionCtx)
  const medicalTreatment = createMedicalTreatmentActions(actionCtx)
  const ground = createGroundActions(actionCtx, {
    worldFlags,
    badges,
    resolvedHiddenFindSpotIds,
    applySocialConsequence: (consequence) => {
      applySocialConsequence(reputation, consequence)
      refreshCharacterReputation()
    },
    extraBuriedPlacements: () => {
      const binding = getActiveLostTreasureChronicleSearchBinding()
      return binding ? [lostTreasureChronicleGravePlacement(binding)] : []
    },
    isGraveDisturbanceAuthorized: (cemeteryId, graveSpotId) => {
      const binding = getActiveLostTreasureChronicleSearchBinding()
      if (!binding) return false
      if (cemeteryId !== binding.cemeteryLandmarkId || graveSpotId !== binding.graveSpotId) return false
      return isLostTreasureGraveAccessGranted((questId) => questManager.getResolvedOutcomeId(questId))
    },
    treasureMapBearCave: bearCaveBinding ? (() => {
      const cemeteryRef = bundle.chunkManager.resolveCemeteryForSettlement(homeSettlementId)
      const cemeteryDetail = cemeteryRef ? bundle.chunkManager.resolveCemeteryById(cemeteryRef.id) : undefined
      if (!cemeteryDetail) return undefined
      return {
        binding: bearCaveBinding,
        cemetery: {
          id: cemeteryDetail.id,
          x: cemeteryDetail.x,
          z: cemeteryDetail.z,
          rotationY: 0,
          scale: 1,
          cemeterySize: cemeteryDetail.cemeterySize ?? 'SM',
        },
        onMapRecovered: () => questManager.notifyHiddenFindSpotResolved(bearCaveBinding.mapGraveSpotId),
      }
    })() : undefined,
  })
  const rest = createRestActions(actionCtx, {
    timeSkipOverlay,
    busyOverlay,
    openLodgingPanel: (title, description, actions, details) => vueUi.openFlavorDialog(title, description, actions, details),
  })
  // Mutual exclusion between the two world preview modes (plan `ui-input-004`
  // §9) — `terrainPrep` is constructed first but needs a check against
  // `placementPreview`, which needs `terrainPrep` itself; the forward
  // reference is filled in once `placementPreview` exists below (both
  // closures are only ever called later, during the tick loop).
  let placementPreviewIsActive: () => boolean = () => false
  const terrainPrep = createTerrainPreparationActions(actionCtx, {
    scene,
    timeSkipOverlay,
    wheelTarget: renderer.domElement,
    blockersNear: placement.tentBlockers,
    showPreview: (view) => vueUi.showTerrainPreparationPreview(view),
    hidePreview: () => vueUi.hideTerrainPreparationPreview(),
    isOtherPreviewActive: () => placementPreviewIsActive(),
  })

  const inspection = createInspectionActions(actionCtx, {
    vueUi,
    workOnWell: placement.workOnWell,
    workOnWellRoofRepair: placement.workOnWellRoofRepair,
    describeWellWork: placement.describeWellWork,
    describeWellRoofRepair: placement.describeWellRoofRepair,
    workOnPalisade: placement.workOnPalisade,
    previewPalisadeRemoval: placement.previewPalisadeRemoval,
    removePalisadeSegment: placement.removePalisadeSegment,
    workOnStandingTorch: placement.workOnStandingTorch,
    igniteStandingTorch: placement.igniteStandingTorch,
    previewStandingTorchRemoval: placement.previewStandingTorchRemoval,
    removeStandingTorch: placement.removeStandingTorch,
    supplyResidentialBuildingMaterials: placement.supplyResidentialBuildingMaterials,
    workOnResidentialBuilding: placement.workOnResidentialBuilding,
    describeResidentialWork: placement.describeResidentialWork,
    previewResidentialCancel: placement.previewResidentialCancel,
    cancelResidentialBuilding: placement.cancelResidentialBuilding,
    previewWellCancel: placement.previewWellCancel,
    cancelPlayerWell: placement.cancelPlayerWell,
    describePalisadeWork: placement.describePalisadeWork,
    describeStandingTorchWork: placement.describeStandingTorchWork,
    describePlayerTroughWork: placement.describePlayerTroughWork,
    describePlayerTroughFill: placement.describePlayerTroughFill,
    workOnPlayerTrough: placement.workOnPlayerTrough,
    fillPlayerTrough: placement.fillPlayerTrough,
    previewPlayerTroughRemoval: placement.previewPlayerTroughRemoval,
    removePlayerTrough: placement.removePlayerTrough,
    previewBedrollRemoval: placement.previewBedrollRemoval,
    removeBedroll: placement.removeBedroll,
    previewPlatformRemoval: placement.previewPlatformRemoval,
    removePlatform: placement.removePlatform,
    sleepInOwnedHouse: rest.sleepInOwnedHouse,
    resumeTerrainPreparationWork: terrainPrep.resumeWork,
    beginHireHelpForTarget: contracts.beginHireHelpForTarget,
    drinkFromWaterSource: survival.drinkFromWaterSource,
    fillWaterContainer: survival.fillWaterContainer,
    describeCampRepair: rest.describeCampRepair,
    campInspectionSnapshot: rest.campInspectionSnapshot,
    workOnCampRepair: rest.workOnCampRepair,
    packTent: rest.packTent,
  })

  onTrapCaptureTarget = gathering.onTrapCapture
  onTrapBaitReturnedTarget = gathering.onTrapBaitReturned
  vueUi.configureAbortRest(rest.abortRest)
  vueUi.configureAbortBusy(rest.abortBusy)
  vueUi.configureAbortTargetedSkill(() => {
    if (targetedSkillSelection.get() == null) return false
    targetedSkillSelection.clear()
    vueUi.setSelectedTargetedSkill(null)
    mouseLook.setPointerLockEnabled(true)
    return true
  })
  vueUi.configureAbortTerrainPreparation(terrainPrep.cancelActive)
  vueUi.configureTerrainPreparationControls({
    grow: terrainPrep.growSize,
    shrink: terrainPrep.shrinkSize,
    raise: terrainPrep.raiseHeight,
    lower: terrainPrep.lowerHeight,
    confirm: terrainPrep.confirmPreview,
  })

  const { buildSaveData, saveNow, refreshActiveSaveName, installAutoSave, runExclusive } = createSaveState({
    config,
    bundle,
    player,
    mouseLook,
    inventory,
    heldTool,
    equipment,
    primaryWeapons,
    playerTorch,
    questManager,
    dayNight,
    mapDiscovery,
    locationKnowledge,
    navigationTargets,
    getGuardLocalKnowledge: () => guardLocalKnowledge.serialize(),
    landOwnership,
    vueUi,
    worldFlags,
    resolvedHiddenFindSpotIds,
    unlockedTreasureContainerIds,
    consumedWorldPickupIds,
    treasureChestMutations,
    badges,
    reputation,
    socialNews,
    tradeGrievances,
    fishingBait,
    getCollectedItemIds: () => collectedItemIds,
    getRenewableWorldItems: () => renewableWorldItems,
    getRemovedCropIds: () => removedCropIds,
    getPlantedTrees: () => plantedTrees,
    getPlantedCrops: () => plantedCrops,
    getModifications: () => modifications,
    getTreeLifecycle: () => treeLifecycle,
    getResourceDepletion: () => resourceDepletion,
    getMountedAnimalId: () => mount.mountedAnimalId(),
  })

  let rebuilding = false
  /** Pass `resetCollectedItems: true` only for a genuinely new world (new seed,
   *  e.g. "New Game") — an unrelated terrain-param rebuild on the same seed
   *  should keep it, since item ids are seed-derived and stay meaningful. */
  bootMark('rebuildWorld')
  let cancelActivePlayerIntent: () => void = () => {}
  const rebuildWorld = async (resetCollectedItems = false) => {
    if (rebuilding) return
    rebuilding = true
    cancelActivePlayerIntent()
    gui.setBusy(true)
    try {
      syncSeedInUrl(config.seed)
      saveWorld(config)
      // Old agents are about to be disposed — drop the reference rather than
      // toggling a class on a DOM node that's going away anyway.
      gameLoop.forgetHighlight()
      if (resetCollectedItems) {
        collectedItemIds = new Set()
        renewableWorldItems = {}
        removedCropIds = new Set()
        plantedTrees = []
        plantedCrops = []
        modifications = []
        resourceDepletion = new Map()
        resourceSiteInventories = createResourceSiteInventories()
        grassForageOverrides = {}
        resetDayNightForNewGame(dayNight)
        treeLifecycle = createTreeLifecycle(config.seed, {})
        landOwnership.clear()
      }

      // Marks the initial `createWorldBundle()` boot's own background phase
      // (fauna/item spawners/drying racks/hives) stale if it's somehow still
      // in flight — see this file's `worldGeneration` doc comment above.
      worldGeneration++
      const thisRebuildGeneration = worldGeneration
      await rebuildWorldBundle(
        bundle,
        scene,
        config,
        resetCollectedItems,
        collectedItemIds,
        renewableWorldItems,
        removedCropIds,
        plantedTrees,
        plantedCrops,
        modifications,
        worldAudio.playAt,
        treeLifecycle,
        getWorldDays,
        dayNight,
        onAnimalDeath,
        getPlayerSocial,
        landOwnership.isOwned,
        onTrapCapture,
        onTrapBaitReturned,
        pointLightBudget,
        getNearbyPlayerWell,
        resourceDepletion,
        () => worldGeneration !== thisRebuildGeneration,
        grassForageOverrides,
        onSettlementAvailable,
        worldFlags.treasureMapBearCaveSourceExtracted,
        worldFlags.treasureMapBearCaveCasketConsumed,
        resourceSiteInventories,
        consumedWorldPickupIds,
        onAnimalDeathSound,
      )
      mapProjection.setParams(rawSampleParamsFromWorld(config))
      worldLocationCatalog.invalidateScanCache()
      worldKnowledgeResearch.invalidate()
      guardLocalKnowledge.invalidate()
      bindReadyExpeditionDispatch()
      // New seed and/or terrain params — re-activate the persistence
      // controller so a late-arriving hydrate from the *old* identity never
      // gets applied to the rebuilt catalog (plan world-015 §9).
      coarseCachePersistence.activate(config.seed, locationsCoarseFingerprint(rawSampleParamsFromWorld(config)))
      abandonedCemeteryCache.activate(
        config.seed,
        abandonedCemeteryFingerprint(rawSampleParamsFromWorld(config), config.terrain.chunkSize),
      )

      // Plan 199 — a same-seed rebuild recreates fauna with fresh per-kind
      // id counters; `reset()` below already clears `animalTargets` on a
      // genuinely new world, so this only needs to run for the in-session
      // terrain-param rebuild path.
      if (!resetCollectedItems) questManager.invalidateStaleAnimalTargets()

      if (resetCollectedItems) {
        inventory.clear()
        grantStartingLoadout(inventory)
        heldTool.unequip()
        syncPlayerAppearance()
        questManager.reset()
        mapDiscovery.clear()
        locationKnowledge.clear()
        confirmHomeSettlement(bundle.settlementsManager.getHomeDef(), locationKnowledge)
        navigationTargets.clear()
        guardLocalKnowledge.reset()
        worldKnowledgeResearch.invalidate()
        playerTorch.extinguish()
        worldFlags.guardSwordGifted = false
        worldFlags.alphaWolfDeedEarned = false
        worldFlags.guardClaims = {}
        guardProgress.guardSwordGifted = false
        guardProgress.alphaWolfDeedEarned = false
        guardProgress.guardClaims = {}
        worldFlags.hiddenTreasureFound = false
        worldFlags.treasureMapDarkForestRead = false
        worldFlags.treasureMapBearCaveSourceExtracted = false
        worldFlags.treasureMapBearCaveCasketOpened = false
        worldFlags.treasureMapBearCaveCasketConsumed = false
        ground.resetTreasureProgress()
        resolvedHiddenFindSpotIds.clear()
        unlockedTreasureContainerIds.clear()
        consumedWorldPickupIds.clear()
        treasureChestMutations.clear()
        badges.reset()
        reputation.reset()
        socialNews.reset()
        tradeGrievances.reset()
        selectedSettlementId = null
        lastVisitedSettlementId = bundle.settlementsManager.getHomeDef().id
        hud.setPlayerBadges(badges.listEarned())
        refreshCharacterReputation('standing')
        resetPlayerNeeds(player.needs)
        fishingBait.clear()
        fishingAttempts.clear()
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        syncHeldHud()
        syncQuickActionAvailability()
      }
      // New chunkManager/ocean instances start with default (untinted) water —
      // resync immediately rather than waiting for the tick loop's throttled
      // apply to notice a large-enough timeOfDay delta.
      if (dayNight.enabled) gameLoop.resyncDayNight()
      pointLightBudget.sync(camera)
      const rebuiltPrewarm = await prewarmRenderPrograms(renderer, scene, camera)
      if (typeof window !== 'undefined') window.__seedvaleProgramPrewarm = rebuiltPrewarm
      player.setGround(
        bundle.chunkManager.sampleSurfaceGround,
        bundle.chunkManager.sampleFloor,
        bundle.chunkManager.waterLevel,
        bundle.chunkManager.collidersNear,
        caveGroundQuery,
        caveFloorSampler,
        caveOccupancyQuery,
        caveHorizontalResolver,
        (x, z) => sampleFootstepSurface(bundle.chunkManager, x, z),
      )
      // Only a genuinely new world (new seed / New Game) relocates the player
      // to home spawn — an in-session terrain-param rebuild on the same seed
      // must leave the player's actual position alone; `setGround` above
      // already re-snapped it to the rebuilt terrain's height via
      // `snapToGround()` (plan 194 §12 finding: this used to run
      // unconditionally, silently teleporting the player home on e.g. a
      // flat-shading toggle).
      if (resetCollectedItems) {
        const homeSpawn = settlementSpawnPoint(bundle.settlementsManager.getHomeDef(), bundle.chunkManager.sampleHeight)
        player.setPosition(homeSpawn.x, homeSpawn.z)
      }
      pauseMenu.setSeed(config.seed)
    } finally {
      gui.setBusy(false)
      rebuilding = false
    }
  }
  bootMarkEnd('rebuildWorld')

  const graphics = createGraphicsSettings({
    config,
    bundle,
    renderer,
    postProcessing,
    lights,
    sky,
    dayNight,
    resyncDayNight: () => gameLoop.resyncDayNight(),
  })

  // Shared with the World config screen (`ui-vue/screens/WorldConfigScreen.vue`)
  // via `configureWorldConfigScreen` below — same costly-rebuild handler as
  // debug GUI's seed/flat-shading controls, not a second implementation.
  const onTerrainChange = () => {
    void rebuildWorld()
  }

  const benchmark = createBenchmarkRunner({
    config,
    chunkManager: () => bundle.chunkManager,
    home: () => {
      const def = bundle.settlementsManager.getHomeDef()
      return { x: def.x, z: def.z }
    },
    settlements: () => ({
      getHomeDef: () => bundle.settlementsManager.getHomeDef(),
      peekDef: (cell) => bundle.settlementsManager.peekDef(cell),
    }),
    dayNight,
    player,
    monitor: perfMonitor,
    applyQualityPreset: graphics.applyNamedQualityPreset,
    isolation: {
      scene,
      sun: lights.sun,
      applyPostConfig: () => {
        postProcessing.applyConfig(config.postProcessing)
        bundle.ocean.setReflections(config.postProcessing.waterReflections)
        bundle.chunkManager.setWaterReflections(config.postProcessing.waterReflections)
      },
      setAoEnabled: (on) => {
        postProcessing.setPassEnabled('ao', on)
      },
      setReflections: (on) => {
        bundle.ocean.setReflections(on)
        bundle.chunkManager.setWaterReflections(on)
      },
      setBloomEnabled: (on) => {
        postProcessing.setPassEnabled('bloom', on)
      },
      setSmaaEnabled: (on) => {
        postProcessing.setPassEnabled('smaa', on)
      },
      setGodRaysEnabled: (on) => {
        postProcessing.setPassEnabled('godRays', on)
      },
      setFilmGradeEnabled: (on) => {
        postProcessing.setPassEnabled('filmGrade', on)
      },
      setPostProcessingBypass: (on) => {
        postProcessing.setBypassEnabled(on)
      },
      gpuTimer,
    },
  })

  const labelObservationDebug = { fullLabelInfo: isDebugMode() }

  const gui = createDebugGui(config, dayNight, climate, renderer, {
    onTerrainChange,
    onSkyChange: graphics.updateSkyFromGui,
    onDayNightChange: graphics.onDayNightChange,
    onPostProcessingChange: graphics.updatePostProcessingFromGui,
    onRenderQualityChange: graphics.updateRenderQualityFromGui,
    onTerrainShadowChange: graphics.updateTerrainShadowFromGui,
    onDumpVillagePlan: () => {
      console.log(summarizeVillagePlan(bundle.settlementsManager.getHomeDef().plan))
    },
    onQualityPresetChange: graphics.onQualityPresetChange,
    onShadowMapSizeChange: graphics.updateShadowMapFromGui,
    onLodScaleChange: graphics.updateLodScaleFromGui,
    onGrassFillerCoverageChange: graphics.updateGrassFillerCoverageFromGui,
    onDetailedGrassDebugVisibleChange: graphics.setDetailedGrassDebugVisible,
    onFillerGrassDebugVisibleChange: graphics.setFillerGrassDebugVisible,
    onPerfTimingsToggle: (enabled) => { perfMonitor.setSource('gui', enabled) },
    onRunBenchmark: (id) => { void benchmark.run(id) },
  }, labelObservationDebug)

  if (config.showGui) gui.toggle()
  vueUi.configureWorldConfigScreen(config, dayNight, {
    onTerrainChange,
    onDayNightChange: graphics.onDayNightChange,
    onPostProcessingChange: graphics.updatePostProcessingFromGui,
    onRenderQualityChange: graphics.updateRenderQualityFromGui,
    onTerrainShadowChange: graphics.updateTerrainShadowFromGui,
    onQualityPresetChange: graphics.onQualityPresetChange,
    onShadowMapSizeChange: graphics.updateShadowMapFromGui,
    onLodScaleChange: graphics.updateLodScaleFromGui,
  })

  // Created before pauseMenu so their Escape listeners register first — see
  // createNpcDialog's onKeyDown comment for why registration order matters here.
  const npcDialog = createNpcDialog(container)
  const questLog = createQuestLog(container)
  // Plan 170 — NPC simulation inspector and trace. Debug-only: no modal, no
  // Ctrl+click listener, no `window.seedvale.debug` outside `?debug`.
  const npcInspector = isDebugMode() ? createNpcInspector(container, bundle, () => dayNight.timeOfDay) : undefined
  const npcInspectTrigger = createNpcInspectTrigger(renderer.domElement)
  const playerGroundTrace = (isDebugMode() || isAdminMode()) ? createPlayerGroundTraceBuffer() : null
  const playerMovementTrace = (isDebugMode() || isAdminMode()) ? createPlayerMovementTraceBuffer() : null
  if (playerGroundTrace) {
    player.setGroundTraceRecorder(
      playerGroundTrace.record,
      () => bundle.caves.peekGroundQueryDebug(),
    )
  }
  if (playerMovementTrace) {
    player.setMovementTraceRecorder(
      (tick) => { playerMovementTrace.record(tick) },
      (x, z, playerY) => bundle.caves.peekHeightfieldMovementSample(x, z, playerY),
    )
  }
  installNpcDebugApi(
    bundle,
    worldContext,
    config,
    () => dayNight.timeOfDay,
    () => ({ x: player.mesh.position.x, z: player.mesh.position.z }),
    async (x, z) => {
      await bundle.chunkManager.waitForChunks(chunksNear(x, z, config.terrain.chunkSize))
      const surfaceY = bundle.chunkManager.sampleHeight(x, z)
      player.setPosition(x, z, { groundQuerySeedY: surfaceY })
    },
    worldFlags,
    { catalog: worldLocationCatalog, knowledge: locationKnowledge },
    () => player.skills,
    () => player,
    () => dayNight.elapsedDays,
    questManager,
    playerGroundTrace,
    playerMovementTrace,
  )

  const inventoryScreenHandlers: InventoryScreenHandlers = {
    onDrop: inventoryWiring.dropItems,
    onEquip: inventoryWiring.equipTool,
    onUnequip: inventoryWiring.unequipTool,
    onEquipArmor: inventoryWiring.equipArmor,
    onUnequipArmor: inventoryWiring.unequipArmor,
    onConsume: (kind) => survival.consumeItem(kind),
    onRead: (kind) => {
      if (ITEM_CATALOG[kind].treasureMap) inventoryWiring.readTreasureMapItem(kind)
      else inventoryWiring.readBookItem(kind)
    },
    onSellInstances: inventoryWiring.sellInventoryInstances,
    onSharpen: inventoryWiring.sharpenInventoryWeapon,
    onSetPrimaryMelee: inventoryWiring.setPrimaryMeleeWeapon,
    onSetPrimaryRanged: inventoryWiring.setPrimaryRangedWeapon,
    onPlaceTrap: (kind) => {
      inventoryScreen.close()
      placement.placeTrapAtAim(kind)
    },
    onPlaceContainer: () => {
      inventoryScreen.close()
      containers.placeContainerAtAim()
    },
    onPlaceTent: () => {
      inventoryScreen.close()
      placement.placeTentAtAim()
    },
  }

  const inventoryScreen = createInventoryScreen(container, inventoryScreenHandlers)

  refreshInventoryScreen = () => {
    inventoryScreen.refresh(
      inventoryCountsForUi(inventory),
      inventory.totalWeight(),
      inventory.maxWeight,
      inventory.totalSize(),
      inventory.maxSize,
      heldTool.held(),
      heldTool.heldInstanceId(),
      buildInventoryGroups(inventory, dayNight.elapsedDays),
      primaryWeapons.primaryMelee(),
      primaryWeapons.primaryRanged(),
      equippedInstanceIds(equipment, inventory),
    )
  }

  const {
    previewFirePlacement, buildSimpleFire, buildFirePit, buildWoodPile, buildGrate, lightBranch, lightWoodenTorch,
    availableSimpleFire, availableFirePit, availableWoodPile, availableGrate, availableLightBranch, availableLightWoodenTorch,
  } = getUserActions(
    inventory,
    bundle,
    playerTorch,
    player,
    hud,
    heldTool,
    syncHeldHud,
    mouseLook,
    placement.tentBlockers,
  )

  const placementPreview = createPlacementPreviewActions(actionCtx, {
    scene,
    placement,
    containers,
    workContract: contracts,
    previewFire: previewFirePlacement,
    buildSimpleFire,
    buildFirePit,
    buildWoodPile,
    showPreview: (view) => vueUi.showPlacementPreview(view),
    hidePreview: () => vueUi.hidePlacementPreview(),
    isOtherPreviewActive: () => terrainPrep.isPreviewActive(),
  })
  placementPreviewIsActive = placementPreview.isActive
  vueUi.configureAbortPlacementPreview(placementPreview.cancel)
  vueUi.configurePlacementPreviewConfirm(placementPreview.confirm)
  vueUi.configurePlacementPreviewRotation({
    rotateLeft: placementPreview.rotateLeft,
    rotateRight: placementPreview.rotateRight,
  })
  vueUi.configurePlacementPreviewRepeat(placementPreview.toggleRepeat)
  inventoryScreenHandlers.onPlaceTrap = (kind) => {
    inventoryScreen.close()
    placementPreview.start(kind === 'simple' ? 'trapSimple' : 'trapGood')
  }
  inventoryScreenHandlers.onPlaceContainer = () => {
    inventoryScreen.close()
    placementPreview.start('chest')
  }
  inventoryScreenHandlers.onPlaceTent = () => {
    inventoryScreen.close()
    placementPreview.start('tent')
  }

  const cookMealIntent = createCookMealIntent({
    ctx: actionCtx,
    bundle,
    player,
    inventory,
    dayNight,
    survival,
    placementPreview,
    busy,
    toast,
  })
  const fullCampIntent = createFullCampIntent({
    ctx: actionCtx,
    bundle,
    player,
    inventory,
    dayNight,
    survival,
    placementPreview,
    busy,
    toast,
  })
  cancelActivePlayerIntent = () => {
    cookMealIntent.cancel()
    fullCampIntent.cancel()
  }

  const syncNearTownQuickActions = (): void => {
    vueUi.setQuickActionsNearTown(rest.isNearTown())
  }

  /** When quick actions opened under pointer lock, restore lock on close so
   *  camera look resumes without requiring an extra canvas click. */
  let restorePointerLockAfterQuickActions = false
  const quickActions = createQuickActions(container, {
    hasDiggingTool: inventory.hasCapability('soil_digging'),
    hasTent: inventory.countInstances('tent') > 0,
    hasChest: inventory.has('chest', 1),
    hasWoodenTorch: inventory.has('wooden_torch', 1),
    hasPalisadeMaterial: hasPalisadeMaterial(),
    hasTroughMaterial: hasTroughMaterial(),
    hasBedrollMaterial: hasBedrollMaterial(),
    hasPlatformMaterial: hasPlatformMaterial(),
    hasCarriedContainer: bundle.placedContainers.hasCarried(),
    hasTreeSeed: inventory.has('tree_seed', 1),
    cropSeeds: {
      carrot: inventory.has('seed_carrot', 1),
      potato: inventory.has('seed_potato', 1),
      cabbage: inventory.has('seed_cabbage', 1),
    },
    hasFishingRod: inventory.has('fishing_rod', 1),
    nearTown: rest.isNearTown(),
    onOpen: () => {
      restorePointerLockAfterQuickActions = exitGamePointerLock(renderer.domElement)
      syncNearTownQuickActions()
      // Plan 175 — `buildGrate` availability is position-dependent (nearest
      // fire in range), same "only trustworthy resolved fresh at popup-open
      // time" reasoning as `nearTown` above.
      syncQuickActionAvailability()
    },
    onClose: () => {
      if (!restorePointerLockAfterQuickActions) return
      restorePointerLockAfterQuickActions = false
      requestGamePointerLock(renderer.domElement)
    },
    onBuildSimpleFire: buildSimpleFire,
    onBuildFirePit: buildFirePit,
    onBuildWoodPile: buildWoodPile,
    onBuildGrate: buildGrate,
    onLightBranch: lightBranch,
    onLightWoodenTorch: lightWoodenTorch,
    onWait: rest.startWait,
    onRest: rest.startRest,
    onDig: () => {
      const p = ground.aimGroundPoint()
      ground.startDigAt(p.x, p.z)
    },
    onLevel: () => {
      const p = ground.aimGroundPoint()
      ground.startLevelAt(p.x, p.z)
    },
    onMound: () => {
      const p = ground.aimGroundPoint()
      ground.startMoundAt(p.x, p.z)
    },
    onPrepareTerrain: terrainPrep.startPreview,
    onStartPlacementPreview: placementPreview.start,
    onPlaceTrap: (kind) => placementPreview.start(kind === 'simple' ? 'trapSimple' : 'trapGood'),
    onPutDownContainer: containers.putDownContainerAtAim,
    onBuildWell: () => placementPreview.start('well'),
    onBuildGarden: () => placementPreview.start('garden'),
    onPlantTree: placement.plantTreeAtAim,
    onPlantCrop: placement.plantCropAtAim,
    onEquipFishingRod: () => inventoryWiring.equipTool('fishing_rod'),
    onCancelWorkContract: contracts.cancelContract,
    onHireHelp: contracts.openHireHelp,
    onHireEscort: contracts.openEscortHire,
    onEatAnything: () => runEatAnything(inventory, player, dayNight, survival.consumeItem),
    onCookMeal: () => {
      fullCampIntent.cancel()
      cookMealIntent.startCookMeal()
    },
    onStartFullCamp: () => {
      cookMealIntent.cancel()
      fullCampIntent.startFullCamp()
    },
  })
  syncQuickActionAvailability()
  syncNearTownQuickActions()

  // Close on Q inside the keydown gesture so onClose can re-request pointer
  // lock. gameLoop only consumes the edge on the next frame, which is too late
  // for requestPointerLock's transient user activation.
  const onQuickActionsKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'KeyQ' || event.repeat) return
    if (!quickActions.isOpen()) return
    quickActions.close()
    keyboard.consumeQuickActions()
  }
  window.addEventListener('keydown', onQuickActionsKeyDown)

  const openQuestLog = () => {
    questLog.open()
    questLog.refresh(questManager.list(), (npcId) =>
      questManager.getRelation(npcId),
    )
  }

  const openVillagers = () => {
    vueUi.openVillagers()
    vueUi.refreshVillagers(
      bundle.settlementsManager
        .getLoaded()
        .flatMap((s) => s.npcs.map((npc) => ({ npc, settlementName: s.name, foodSourceType: s.foodSourceType }))),
      // Helper assignment targets (plan 167 §14) — every player-placed chest,
      // labelled by its def so a player with more than one can tell them
      // apart without a full container-naming feature.
      bundle.placedContainers.list().map((c) => ({ id: c.id, label: CONTAINER_DEFS[c.kind].label })),
    )
  }
  const openInventory = () => {
    exitGamePointerLock(renderer.domElement)
    inventoryScreen.open()
    refreshInventoryScreen()
  }
  const openSkills = () => {
    exitGamePointerLock(renderer.domElement)
    vueUi.openSkillsScreen()
  }
  const openCharacter = () => {
    exitGamePointerLock(renderer.domElement)
    // Known-settlement reputation is resolved fresh on open: current
    // settlement wins when the player is inside one; otherwise the previous
    // selection / last visited / home fallback (plan ui-input-019).
    refreshCharacterReputation('open')
    const detailedAttributes = player.effectiveAttributesDetailed(dayNight.elapsedDays)
    hud.setCharacterStats({
      hp: { current: player.health.currentHp, max: player.health.maxHp },
      stamina: { current: player.needs.stamina.current, max: player.needs.stamina.max },
      vigor: { current: player.needs.vigor.current, max: player.needs.vigor.max },
      hunger: { current: player.needs.hunger.current, max: player.needs.hunger.max },
      thirst: { current: player.needs.thirst.current, max: player.needs.thirst.max },
      attributes: detailedAttributes.effective,
      presentation: buildCharacterPresentation({
        base: player.attributes,
        result: detailedAttributes,
        skills: player.skills,
        conditions: player.temporaryConditions,
        equipmentModifiers: resolveEquipmentModifiers(equipment, inventory),
        equipment,
        inventory,
      }),
    })
    vueUi.openCharacterScreen()
  }

  const pauseMenu = createPauseMenu(container, config.seed, config.player.name, {
    onPause: () => {
      exitGamePointerLock(renderer.domElement)
      // Plan 175 — `buildGrate`'s availability is position-dependent (nearest
      // fire in range); refresh it whenever Pauza → Akcje can be opened, same
      // reasoning as Quick Actions' own `onOpen`.
      syncQuickActionAvailability()
    },
    onResume: () => {},
    onQuestLog: openQuestLog,
    onVillagers: openVillagers,
    onInventory: openInventory,
    onCharacter: openCharacter,
    onWorldMap: () => {
      vueUi.openWorldMap(player.mesh.position.x, player.mesh.position.z)
    },
    onToggleGui: () => {
      const visible = gui.toggle()
      setUrlSearchParam('gui', visible ? '1' : '0')
    },
    onNameChange: (name) => player.setName(name),
    onNameCommit: (name) => {
      config.player.name = name
      savePlayer(config)
    },
    // Manual Save's failure must reach the player (plan persistence-004 §6) —
    // the pause menu awaits this and toasts on `!result.ok` instead of the
    // old fire-and-forget `saveNow` that always showed "Zapisano".
    onSave: () => saveNow('manual'),
    onSaveAs: async (name) => {
      const protect = await saveNow('save-as')
      if (!protect.ok) {
        vueUi.showToast('Nie udało się zaktualizować bieżącego zapisu.', 'error')
      }
      const result = await createSave(name, buildSaveData())
      if (result.ok) vueUi.setPauseActiveSaveName(result.name)
      return result
    },
    // Wrapped in `runExclusive` (plan persistence-004 §7/§11): once
    // `setActiveSaveId(id)` switches the target slot, a background autosave
    // (`visibilitychange`/`pagehide`, which the reload below itself triggers)
    // must not fire and overwrite it with the *old* world's state — it's
    // suspended for the rest of this page's lifetime, which ends at reload.
    onLoadSave: (id) => {
      void runExclusive(async () => {
        const protect = await saveNow('load-transition')
        if (!protect.ok) {
          vueUi.showToast('Nie udało się zapisać bieżącej gry przed wczytaniem innego zapisu.', 'error')
        }
        setActiveSaveId(id)
        window.location.reload()
      })
    },
    onListSaves: () => listSaves(),
    onListSaveManagement: () => listSaveManagementEntries(),
    onListSeeds: () => listSeedRecords(),
    onDeleteSave: (id) => deleteSave(id),
    onRefresh: () => window.location.reload(),
    onBuildSimpleFire: buildSimpleFire,
    onBuildFirePit: buildFirePit,
    onBuildWoodPile: buildWoodPile,
    onBuildGrate: buildGrate,
    onLightBranch: lightBranch,
    onLightWoodenTorch: lightWoodenTorch,
    // Wrapped in `runExclusive` for the same reason as `onLoadSave` — the
    // world-transition contract (plan persistence-004 §7) must not let an
    // autosave capture the old world under `beginNewSave`'s pending name/the
    // new seed while `rebuildWorld(true)` is still resetting world-scoped
    // state. Unlike `onLoadSave` this doesn't reload, so autosave resumes
    // normally once the transition finishes.
    onNewGame: (name, seedChoice) => {
      void runExclusive(async () => {
        const protect = await saveNow('new-game-transition')
        if (!protect.ok) {
          vueUi.showToast('Nie udało się zapisać bieżącej gry przed rozpoczęciem nowej.', 'error')
        }
        beginNewSave(name)
        // Seed Library intent (plan world-015 §3) resolves to either the
        // chosen existing seed or a fresh `randomSeed()` — deliberately not
        // gated on `hasExplicitUrlSeed()` either way; that URL precedence
        // (plan persistence-004 §9) only applies to the boot-time New Game
        // flow (`createApp`'s own `options?.newGame` branch above). An
        // in-session pause-menu New Game reusing whatever `?seed=` happened
        // to still be in the address bar from the original boot would be
        // surprising, not deterministic-on-purpose.
        config.seed = await resolveNewGameSeed(seedChoice, (seed) => rawSampleParamsFromWorld({ ...config, seed }))
        await rebuildWorld(true)
        const created = await saveNow('new-game-transition')
        if (!created.ok) {
          vueUi.showToast('Nie udało się zapisać nowej gry.', 'error')
        }
        await refreshActiveSaveName()
      })
    },
  }, () => vueUi.isNpcDialogueMenuOpen())
  void refreshActiveSaveName()

  /** When a flavor dialog opened under pointer lock, restore lock only after
   *  the whole dialog chain closes and no other clickable UI still needs the
   *  cursor — deferred so a synchronous close→open chain never re-locks
   *  between steps. */
  let restorePointerLockAfterFlavorDialog = false
  const blocksGamePointerLockRestore = (): boolean =>
    vueUi.isFlavorDialogOpen() ||
    quickActions.isOpen() ||
    pauseMenu.isPaused() ||
    inventoryScreen.isOpen() ||
    vueUi.isMerchantOpen() ||
    vueUi.isContainerScreenOpen() ||
    vueUi.isNpcDialogueMenuOpen() ||
    npcDialog.isOpen() ||
    questLog.isOpen() ||
    vueUi.isVillagersOpen() ||
    vueUi.isWorldConfigScreenOpen() ||
    vueUi.isNotesOpen() ||
    vueUi.isSkillsScreenOpen() ||
    vueUi.isCharacterScreenOpen() ||
    vueUi.isWorldMapOpen() ||
    vueUi.isWorldInspectionOpen() ||
    vueUi.isActionConfirmOpen()
  // NPC-initiated dialogue-open runtime seam (plan npc-050 §6) — `NpcAgent`
  // never imports Vue; on `approachPlayer` arrival for an outstanding Player
  // follow-up it calls this instead. Reuses the same "another modal already
  // has the cursor" gate as `blocksGamePointerLockRestore` rather than a
  // second ad hoc UI-busy check; a denial leaves the follow-up pending for a
  // later idle-duty attempt.
  configureRequestNpcInitiatedDialogue((npcId) => {
    if (blocksGamePointerLockRestore() || player.isDowned()) return false
    for (const settlement of bundle.settlementsManager.getLoaded()) {
      const npc = settlement.npcs.find((entry) => entry.id === npcId)
      if (!npc) continue
      if (npc.health.dead) return false
      exitGamePointerLock(renderer.domElement)
      vueUi.openNpcDialogueMenu(npc, settlement, questManager, dayNight.timeOfDay)
      return true
    }
    return false
  })
  const scheduleRestorePointerLockAfterFlavorDialog = (): void => {
    queueMicrotask(() => {
      if (!restorePointerLockAfterFlavorDialog) return
      if (blocksGamePointerLockRestore()) return
      restorePointerLockAfterFlavorDialog = false
      requestGamePointerLock(renderer.domElement)
    })
  }
  vueUi.configureFlavorDialog({
    onOpen: () => {
      if (exitGamePointerLock(renderer.domElement)) {
        restorePointerLockAfterFlavorDialog = true
      }
    },
    onClose: () => {
      scheduleRestorePointerLockAfterFlavorDialog()
      inspection.syncOpenView()
    },
  })
  vueUi.configureWorldInspection({
    onOpen: () => {
      if (exitGamePointerLock(renderer.domElement)) {
        restorePointerLockAfterFlavorDialog = true
      }
    },
    onClose: () => {
      scheduleRestorePointerLockAfterFlavorDialog()
    },
  })
  vueUi.configureActionConfirm({
    onOpen: () => {
      if (exitGamePointerLock(renderer.domElement)) {
        restorePointerLockAfterFlavorDialog = true
      }
    },
    onClose: () => {
      scheduleRestorePointerLockAfterFlavorDialog()
    },
  })

  /** Guard against the ☰ / Quick Actions buttons opening their overlay on top
   *  of another already-open full-screen modal (npc dialog/quest log/
   *  villagers) — those don't disable the button the way they disable the rest
   *  of the touch layer, since it now lives outside `.seedvale-touch`. */
  const noFullScreenModalOpen = (): boolean =>
    !npcDialog.isOpen() &&
    !questLog.isOpen() &&
    !vueUi.isVillagersOpen() &&
    !inventoryScreen.isOpen() &&
    !vueUi.isNpcDialogueMenuOpen() &&
    !vueUi.isWorldConfigScreenOpen() &&
    !vueUi.isNotesOpen() &&
    !vueUi.isWorldInspectionOpen()

  touchControls = isTouchDevice()
    ? createTouchControls(container, keyboard.state, mouseLook.state, {
        onPauseToggle: () => {
          if (noFullScreenModalOpen()) pauseMenu.togglePause()
        },
        onQuickActions: () => {
          if (noFullScreenModalOpen()) quickActions.toggle()
        },
      })
    : null

  // Pause + minimap chrome for touch live in Vue (TouchChrome / MinimapScreen).

  // NOTE: a Fullscreen-API-on-first-touch call used to live here (address-bar
  // hiding for Chrome/Firefox Android). Removed — confirmed via automated
  // touch-hit-test diagnostics that once document.documentElement enters
  // fullscreen, document.elementFromPoint() (and therefore all subsequent tap
  // hit-testing) degrades to returning <html> for every coordinate, which is
  // exactly the "pause menu won't respond to any tap" symptom reported after
  // this was added. True chrome-less fullscreen on mobile web reliably needs
  // "Add to Home Screen" (see the apple-mobile-web-app-capable meta tag in
  // index.html + the manifest's display:standalone) — that path doesn't hit
  // this bug since it isn't the live Fullscreen API.

  // A benchmark fixture boots with no active save slot pinned to it — periodic
  // autosave would write the fresh benchmark world over whatever save was last
  // active (plan tools-001 trap #14), so it stays off for a fixture run.
  const removeAutoSave = fixture ? (() => {}) : installAutoSave()

  bootMark('createGameLoop')
  const gameLoop = createGameLoop({
    bundle, player, camera, renderer, labelRenderer, scene, sky, lights, postProcessing, dayNight,
    climate, clouds, groundFog, weatherParticles, weatherAudio, getSeed: () => config.seed,
    keyboard, mouseLook, touchControls, pauseMenu, npcDialog, npcInspector, npcInspectTrigger, questLog, vueUi, inventoryScreen,
    quickActions, timeSkip, timeSkipOverlay, busy, busyOverlay, restCamp, inventory, heldTool, equipment, mount, lead, landOwnership, toast, hud,
    questManager, syncLostLivestockQuests, onQuestStateSynced: refreshGuardEveningPolicies, ambientAudio, fireAudio, houseDoors, worldAudio, playerTorch, minimap, mapDiscovery, locationProximityDiscovery, openQuestLog, openInventory, openSkills, openCharacter,
    targetedSkillSelection,
    toggleCombatMode: inventoryWiring.toggleCombatMode,
    // Plan quests-progression-019, lazy propagation by quests-progression-022
    // — resolves the generic dangerous-animal-kill signal, enqueues it as
    // pending social news, and only ever catches up currently *loaded*
    // settlements (`getLoaded()`, no grid scan, no `peekDef`/settlement
    // generation) — never `settlementsWithinDistance()`, which used to
    // synchronously materialize every unknown `SettlementDef` within 3km and
    // freeze the main thread on a cold-cache kill. Settlements outside the
    // loaded set catch up lazily via `onSettlementAvailable` above once they
    // actually stream in.
    onPlayerAnimalKill: (kill: PlayerAnimalKillContext, socialOutcomeClaimed: boolean) => {
      if (kill.animalKind === 'wolf' && kill.variant === 'alpha') {
        guardProgress.alphaWolfDeedEarned = true
        worldFlags.alphaWolfDeedEarned = true
      }
      const signal = resolveAnimalDeedSignal(kill, { socialOutcomeClaimed })
      if (!signal) return
      socialNews.enqueue(signal, kill.position, dayNight.elapsedDays)
      catchUpLoadedSettlements()
    },
    startGroundWork: (mode, x, z) => {
      if (hasItemCapability(heldTool.held(), 'rock_mining')) {
        if (mode === 'level') ground.startPickaxeLevelAt(x, z)
        else ground.startPickaxeDigAt(x, z)
      } else if (mode === 'level') ground.startLevelAt(x, z)
      else ground.startDigAt(x, z)
    },
    startTreeChop: ground.startTreeChop,
    gatherBranch: ground.gatherBranch,
    startDepositMine: ground.startDepositMine,
    startBuryCorpse: survival.startBuryCorpse,
    startHarvestMeat: survival.startHarvestMeat,
    startMilkAnimal: survival.startMilkAnimal,
    startShearAnimal: survival.startShearAnimal,
    startCookAt: survival.startCookAt,
    startIgniteFire: survival.startIgniteFire,
    startDestroySpawner: survival.startDestroySpawner,
    drinkFromWaterSource: survival.drinkFromWaterSource,
    fillWaterskin: survival.fillWaterskin,
    consumeItem: survival.consumeItem,
    startTentRest: rest.startTentRest,
    inspectTent: rest.inspectTent,
    inspectCamp: rest.inspectCamp,
    inspectBedroll: rest.inspectBedroll,
    inspectPlatform: rest.inspectPlatform,
    workOnCampRepair: rest.workOnCampRepair,
    campRepairAvailable: rest.campRepairAvailable,
    startMedicalTreatment: medicalTreatment.startMedicalTreatment,
    sleepInHay: rest.sleepInHay,
    sleepInOwnedHouse: rest.sleepInOwnedHouse,
    openTrapArmDialog: gathering.openTrapArmDialog,
    disarmTrap: gathering.disarmTrap,
    collectTrap: gathering.collectTrap,
    startFishing: gathering.startFishing,
    applyFishingBait: gathering.applyFishingBait,
    interactDryingRack: gathering.interactDryingRack,
    collectHive: gathering.collectHive,
    burnHive: gathering.burnHive,
    harvestCrop: gathering.harvestCrop,
    tidyGardenPlot: placement.tidyGardenPlot,
    waterGardenPlot: placement.waterGardenPlot,
    openContainer: containers.openContainer,
    openHouseholdResourceTransfer: householdTransfer.openHouseholdResourceTransfer,
    openNpcCorpse: containers.openNpcCorpse,
    pickUpContainer: containers.pickUpContainer,
    forceOpenContainer: containers.forceOpenContainer,
    describeWorldGeneratedContainer: containers.describeWorldGeneratedContainer,
    openAnimalPack: containers.openAnimalPack,
    equipAnimalPack: containers.equipAnimalPack,
    unequipAnimalPack: containers.unequipAnimalPack,
    pickUpGroundSaddlebags: containers.pickUpGroundSaddlebags,
    workOnWell: placement.workOnWell,
    describeWellWork: placement.describeWellWork,
    describeWellRoofRepair: placement.describeWellRoofRepair,
    workOnWellRoofRepair: placement.workOnWellRoofRepair,
    describeStructureRepair: placement.describeStructureRepair,
    workOnStructureRepair: placement.workOnStructureRepair,
    igniteStandingTorch: placement.igniteStandingTorch,
    igniteVillageTorch: (settlementId, torchId) => {
      if (!inventory.hasCapability('fire_starting')) {
        toast.show(`Potrzebujesz ${CAPABILITY_NEED_LABEL.fire_starting}.`, 'error')
        return
      }
      const settlement = bundle.settlementsManager.getLoaded().find((entry) => entry.id === settlementId)
      const entry = settlement?.villageTorches.find((torch) => torch.id === torchId)
      if (!entry || entry.torch.isLit()) return
      entry.torch.setLit(true)
      toast.show('Zapalono pochodnię.')
      questManager.recheckSettlementLightObjectives()
      refreshGuardEveningPolicies()
    },
    workOnStandingTorch: placement.workOnStandingTorch,
    describeStandingTorchWork: placement.describeStandingTorchWork,
    previewStandingTorchRemoval: placement.previewStandingTorchRemoval,
    removeStandingTorch: placement.removeStandingTorch,
    workOnPlayerTrough: placement.workOnPlayerTrough,
    describePlayerTroughWork: placement.describePlayerTroughWork,
    describePlayerTroughFill: placement.describePlayerTroughFill,
    fillPlayerTrough: placement.fillPlayerTrough,
    previewPlayerTroughRemoval: placement.previewPlayerTroughRemoval,
    removePlayerTrough: placement.removePlayerTrough,
    workOnPalisade: placement.workOnPalisade,
    describePalisadeWork: placement.describePalisadeWork,
    previewPalisadeRemoval: placement.previewPalisadeRemoval,
    removePalisadeSegment: placement.removePalisadeSegment,
    supplyResidentialBuildingMaterials: placement.supplyResidentialBuildingMaterials,
    workOnResidentialBuilding: placement.workOnResidentialBuilding,
    describeResidentialWork: placement.describeResidentialWork,
    previewActionConsequence: (target, action) => foreignPropertyUse.previewInteractableAction(target, action),
    previewForeignMount: (animal) => foreignPropertyUse.previewAnimalAction(animal, 'mount'),
    previewResidentialCancel: placement.previewResidentialCancel,
    cancelResidentialBuilding: placement.cancelResidentialBuilding,
    previewBedrollRemoval: placement.previewBedrollRemoval,
    removeBedroll: placement.removeBedroll,
    previewPlatformRemoval: placement.previewPlatformRemoval,
    removePlatform: placement.removePlatform,
    repairSettlementStorage: storageInfestation.repairSettlementStorage,
    destroyRatNest: storageInfestation.destroyRatNest,
    openNoticeBoard: contracts.openNoticeBoard,
    openGrindstoneSharpen: inventoryWiring.openGrindstoneSharpen,
    openWorldInspection: inspection.openFromTarget,
    syncWorldInspection: inspection.syncOpenView,
    tickTerrainPreparationPreview: terrainPrep.tickPreview,
    tickPlacementPreview: placementPreview.tick,
    resumeTerrainPreparationWork: terrainPrep.resumeWork,
    tickTerrainPreparationWork: terrainPrep.tickWork,
    isTerrainPreparationWorkActive: terrainPrep.isWorkActive,
    onTerrainPreparationWorkFinished: terrainPrep.onWorkSkipFinished,
    onSleepFinished: rest.onSleepFinished,
    tickLodging: rest.tickLodging,
    isLodgingActive: rest.isLodgingActive,
    canCancelRest: rest.canCancelRest,
    interruptLongActivityOnDamage: () => rest.interruptRestForDamage() || terrainPrep.interruptForDamage() || rest.abortBusy(),
    onInventoryChanged,
    consumedWorldPickupIds,
    setFrameTiming: gui.setFrameTiming,
    syncPointLightBudget: () => { pointLightBudget.sync(camera) },
    getPlayerObservation: () => ({
      perception: player.attributes.perception,
      fullLabelInfo: isDebugMode() && labelObservationDebug.fullLabelInfo,
    }),
  })
  bootMarkEnd('createGameLoop')

  gameLoop.resyncDayNight()
  // Plan 149 Phase 1 A — compile the already-built home-scene program
  // families before gameplay streaming starts. `tick()` has not run yet, so
  // this stays inside the loading overlay and never blocks chunk attach.
  pointLightBudget.sync(camera)
  loadingScreen.setStage('render')
  const programPrewarm = await prewarmRenderPrograms(renderer, scene, camera)
  if (typeof window !== 'undefined') window.__seedvaleProgramPrewarm = programPrewarm

  const renderLoop = createAppRenderLoop({
    container,
    renderer,
    labelRenderer,
    postProcessing,
    camera,
    scene,
    sampleHeight: (x, z) => bundle.chunkManager.sampleHeight(x, z),
    onTick: () => {
      gameLoop.tick()
      mouseLook.commitFrame()
    },
  })

  loadingScreen.setStage('ready')
  renderLoop.start()
  loadingScreen.hide()
  if (typeof window !== 'undefined') {
    window.__seedvaleReady = true
  }

  perfMonitor.setContextProvider(() => ({
    loadedChunks: bundle.chunkManager.loadedChunkCount(),
    npcCount: bundle.settlementsManager.getLoaded().reduce((n, s) => n + s.npcs.length, 0),
    faunaCount: bundle.fauna.getAgents().length,
    pixelRatio: renderer.getPixelRatio(),
    quality: config.quality.preset,
    seed: config.seed,
    terrainResolution: config.terrain.resolution,
    loadRadius: config.terrain.loadRadius,
    grassMacroVariation: config.terrain.grass.macroVariationEnabled,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    // Reproducibility fields (plan tools-001 §4) — only meaningful/populated
    // for a `?benchmark=` fixture run; `elapsedDays`/season/weather still
    // apply to a `?perf=1` gameplay session too, since they're cheap and
    // already tracked live.
    fixtureVersion: fixture?.version,
    elapsedDays: dayNight.elapsedDays,
    season: climate.season,
    weather: climate.weather.type,
  }))

  const autoBench = benchmarkScenarioFromUrl()

  if (typeof window !== 'undefined') {
    window.__seedvaleRunBenchmark = (id, durationSec) => benchmark.run(id, durationSec)
  }

  if (autoBench) void benchmark.run(autoBench)

  bootMarksSummary()

  return () => {
    renderLoop.dispose()
    removeAutoSave()
    vueUi.configureAbortRest(null)
    vueUi.configureAbortTargetedSkill(null)
    timeSkip.cancel()
    timeSkipOverlay.dispose()
    cookMealIntent.cancel()
    fullCampIntent.cancel()
    busy.cancel()
    busyOverlay.dispose()
    restCamp.dispose()
    gui.dispose()
    pauseMenu.dispose()
    npcDialog.dispose()
    npcInspector?.dispose()
    npcInspectTrigger.dispose()
    questLog.dispose()
    inventoryScreen.dispose()
    restorePointerLockAfterQuickActions = false
    window.removeEventListener('keydown', onQuickActionsKeyDown)
    quickActions.dispose()
    hud.dispose()
    toast.dispose()
    minimap.dispose()
    setActiveMapData(null)
    setActiveLocationKnowledge(null)
    setActiveNavigationTargets(null)
    keyboard.dispose()
    mouseLook.dispose()
    touchControls?.dispose()
    sky.dispose()
    ambientAudio.dispose()
    fireAudio.dispose()
    weatherAudio.dispose()
    weatherParticles.dispose()
    clouds.dispose()
    groundFog.dispose()
    configureUiSounds(null)
    configureNpcVoiceSounds(null)
    configureNpcPlayerReactionAudio(null)
    configureRequestNpcBark(null)
    configureRequestNpcInitiatedDialogue(null)
    configureAudioVolumes(worldAudio.getVolumes(), null)
    worldAudio.dispose()
    // Marks a still-in-flight initial-boot background phase stale before
    // tearing down — see this file's `worldGeneration` doc comment above.
    worldGeneration++
    coarseCachePersistence.dispose()
    abandonedCemeteryCache.dispose()
    disposeWorldBundle(bundle)
    setActiveMonitor(null)
    setActiveAgentCpuDiag(null)
    setActiveGrassFinalizationDiag(null)
    setActiveProgramCensus(null)
    setActiveGpuTimer(null)
    gpuTimer.dispose()
    if (typeof window !== 'undefined') window.__seedvaleProgramCensus = undefined
    playerTorch.dispose()
    pointLightBudget.dispose()
    if (typeof window !== 'undefined') window.__seedvalePointLightBudget = undefined
    if (typeof window !== 'undefined') window.__seedvaleProgramPrewarm = undefined
    player.dispose()
    worldKnowledgeResearch.dispose()
    disposeChunkWorkerPool()
    postProcessing.dispose()
    lights.dispose()
    labelRenderer.domElement.remove()
    vueUi.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}

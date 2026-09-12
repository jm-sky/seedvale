# Symbols

Generated from exported TypeScript symbols.

## `app/actions/actionContext.ts`

- `isActionBlocked` — function — line 80
- `isChannelBusy` — function — line 87
- `PlayerActionContext` — type — line 31

## `app/actions/actionContracts.ts`

- `ActionAvailability` — type — line 21
- `ActionRequirement` — type — line 9
- `ActionResult` — type — line 25
- `capabilityRequirement` — function — line 34
- `itemRequirement` — function — line 30
- `targetRequirement` — function — line 38
- `toAvailability` — function — line 46
- `toResult` — function — line 51

## `app/actions/constructionWorkSession.ts`

- `ConstructionWorkSessionSpec` — type — line 12
- `maxSafeConstructionHours` — function — line 28
  - domain: ui-input
- `startConstructionWorkSession` — function — line 52
  - domain: ui-input

## `app/actions/containerActions.ts`

- `ContainerActionDeps` — type — line 77
- `ContainerActions` — type — line 58
- `createContainerActions` — function — line 90

## `app/actions/cookMealIntent.ts`

- `CookMealIntentController` — type — line 28
- `CookMealIntentPhase` — type — line 19
- `createCookMealIntent` — function — line 55
  - domain: ui-input
- `runEatAnything` — function — line 201

## `app/actions/fullCampIntent.ts`

- `createFullCampIntent` — function — line 55
  - domain: items-player
- `FullCampIntentController` — type — line 29
- `FullCampIntentPhase` — type — line 19

## `app/actions/gatheringActions.ts`

- `createGatheringActions` — function — line 67
- `GatheringActionDeps` — type — line 56
- `GatheringActions` — type — line 35

## `app/actions/groundActions.ts`

- `createGroundActions` — function — line 107
- `GroundActions` — type — line 55
- `GroundActionsDeps` — type — line 79

## `app/actions/householdResourceTransferActions.ts`

- `createHouseholdResourceTransferActions` — function — line 30
- `HouseholdResourceTransferActions` — type — line 15
- `HouseholdResourceTransferDeps` — type — line 19

## `app/actions/inspectionActions.ts`

- `createInspectionActions` — function — line 94
- `InspectionActionDeps` — type — line 29
- `InspectionActions` — type — line 81

## `app/actions/leadActions.ts`

- `createLeadActions` — function — line 21
- `LeadActions` — type — line 10
  - domain: fauna
  - role: Temporary player→animal lead attach/detach and cart hitch, keyed by stable `animalId`. Does not own Follow/Stay or AnimalOwner.

## `app/actions/mountActions.ts`

- `createMountActions` — function — line 45
- `DismountReason` — type — line 19
- `MountActions` — type — line 21

## `app/actions/placementActions.ts`

- `ConstructionActionView` — type — line 335
- `createPlacementActions` — function — line 499
- `evaluatePlacementSite` — function — line 279
- `GroundPlacementDefinition` — type — line 262
  - domain: world
- `GroundPlacementSite` — type — line 246
- `PlacementActions` — type — line 354
- `PlacementBlocker` — type — line 212
- `PlacementMutationLifecycle` — type — line 273
- `PlacementPreviewResult` — type — line 223
- `previewGroundPlacement` — function — line 289
- `RemovalPreview` — type — line 347
- `ResidentialWorkView` — type — line 340
- `StructureRepairView` — type — line 327
- `WellRoofRepairView` — type — line 315
- `WellWorkView` — type — line 308

## `app/actions/placementPreviewActions.ts`

- `createPlacementPreviewActions` — function — line 232
- `FirePreviewKind` — type — line 157
- `PlacementPreviewActionDeps` — type — line 159
- `PlacementPreviewActions` — type — line 199
- `PlacementPreviewConfirmResult` — type — line 60
- `PlacementPreviewKind` — type — line 25
  - domain: ui-input
- `PlacementPreviewLifecycle` — type — line 66
- `PlacementPreviewUiView` — type — line 44

## `app/actions/placementRequirementView.ts`

- `derivePlacementPresentation` — function — line 95
  - domain: ui-input
- `formatMaterialCost` — function — line 80
- `formatPlacementRequirement` — function — line 70
- `formatRecoveryLines` — function — line 84
- `missingMaterialsReason` — function — line 74
- `PlacementConfirmKind` — type — line 19
- `PlacementPresentation` — type — line 31
- `PlacementPreviewState` — type — line 17
- `placementRequirementView` — function — line 46
  - domain: ui-input
- `PlacementRequirementView` — type — line 21
- `placementRequirementViews` — function — line 58

## `app/actions/placementYaw.ts`

- `PLACEMENT_YAW_STEP` — const — line 10
  - domain: ui-input
- `placementAimSite` — function — line 24
- `placementObjectYaw` — function — line 18
- `snapPlacementYaw45` — function — line 13

## `app/actions/restActions.ts`

- `CampRepairView` — type — line 70
- `createRestActions` — function — line 158
- `LodgingChoiceAction` — type — line 60
- `REST_IN_TOWN_RADIUS` — const — line 68
- `RestActionDeps` — type — line 141
- `RestActions` — type — line 82

## `app/actions/storageInfestationActions.ts`

- `createStorageInfestationActions` — function — line 29

## `app/actions/survivalActions.ts`

- `createSurvivalActions` — function — line 168
- `FeedableAnimal` — type — line 143
- `feedAnimal` — function — line 157
- `hasCarriedMilkContainer` — function — line 133
- `SurvivalActionLifecycle` — type — line 91
- `SurvivalActions` — type — line 101

## `app/actions/terrainPreparationActions.ts`

- `createTerrainPreparationActions` — function — line 141
- `TerrainPreparationActionDeps` — type — line 81
- `TerrainPreparationActions` — type — line 97
- `TerrainPreparationPreviewView` — type — line 74

## `app/actions/workContractActions.ts`

- `createWorkContractActions` — function — line 107
- `WorkContractActionDeps` — type — line 101
- `WorkContractActions` — type — line 69
- `WorkContractQuickActionEntry` — type — line 67

## `app/actions/workContractPayment.ts`

- `payWorkContractAssignment` — function — line 30
  - domain: npc
- `PayWorkContractDeps` — type — line 16
- `PayWorkContractResult` — type — line 9

## `app/appRenderLoop.ts`

- `AppRenderLoop` — type — line 26
  - system: app-render-loop
  - role: Drives `requestAnimationFrame` scheduling, viewport/DPR resize and WebGL context loss/restore around the game loop.
  - uses: GameLoop
  - lifecycle: frame-scheduling
- `AppRenderLoopDeps` — type — line 32
- `createAppRenderLoop` — function — line 46

## `app/busyAction.ts`

- `BusyAction` — type — line 35
- `BusyStartOptions` — type — line 12
- `BusyTickResult` — type — line 1
- `createBusyAction` — function — line 73

## `app/campRest.ts`

- `CAMP_REST_BASE_QUALITY` — const — line 105
- `CampRestContext` — type — line 13
  - domain: items-player
- `CampRestExplanation` — type — line 41
- `CampRestExplanationLine` — type — line 33
- `campRestQuality` — function — line 219
- `explainCampRest` — function — line 177
  - domain: items-player
- `formatCampRestBreakdown` — function — line 224
- `hasTentNear` — function — line 77
- `hasWarmFireNear` — function — line 64
- `RAISED_BEDROLL_FACTOR_MAX` — const — line 119
- `RAISED_BEDROLL_FACTOR_MIN` — const — line 118
- `TENT_SHELTER_RADIUS` — const — line 52
- `tentShelterFactor` — function — line 95
  - domain: items-player
- `WARM_FIRE_RADIUS` — const — line 48

## `app/campRestSnapshot.ts`

- `CampInspectionDetailRow` — type — line 152
  - domain: items-player
- `campInspectionRepairTargets` — function — line 229
- `CampRestSnapshot` — type — line 34
  - domain: items-player
- `CampRestSnapshotInput` — type — line 48
- `CampSnapshotFire` — type — line 20
- `findNearestPlayerFire` — function — line 84
- `formatCampInspectionDescription` — function — line 289
- `formatCampInspectionDetails` — function — line 173
  - domain: items-player
- `resolveCampInteractionMembers` — function — line 130
  - domain: items-player
- `resolveCampRestSnapshot` — function — line 247
  - domain: items-player

## `app/createApp.ts`

- `createApp` — function — line 290
  - system: app-composition
  - role: Composition root: builds every long-lived system, threads their dependencies and owns app-level lifecycle (boot, rebuild, dispose).
  - owns: WorldBundle, GameLoop, AppRenderLoop
  - lifecycle: boot
  - integration: Wires world, player, UI, persistence and audio systems together.
- `NewAppOptions` — type — line 259

## `app/gameLoop.ts`

- `createGameLoop` — function — line 639
  - system: game-loop
  - role: Runs one frame's worth of simulation update + render.
  - uses: WorldBundle, PlayerController
  - simulation: tick
- `GameLoop` — type — line 607
- `GameLoopDeps` — type — line 297

## `app/graphicsSettings.ts`

- `createGraphicsSettings` — function — line 54
- `GraphicsSettings` — type — line 19
- `GraphicsSettingsDeps` — type — line 41

## `app/inspection/buildWorldInspection.ts`

- `buildWorldInspection` — function — line 127
- `listWaterContainerOptions` — function — line 831
- `liveWellWaterSource` — function — line 877
- `WorldInspectionLookup` — type — line 91

## `app/inspection/inspectionTarget.ts`

- `contractTargetFor` — function — line 33
- `inspectionTargetRef` — function — line 10

## `app/inspection/worldInspectionView.ts`

- `InspectionAction` — type — line 80
- `InspectionActionId` — type — line 64
- `InspectionContractRow` — type — line 46
- `InspectionInfoRow` — type — line 4
- `InspectionLiquidContainerOption` — type — line 32
- `InspectionLiquidContainersRow` — type — line 40
- `InspectionMaterialItem` — type — line 18
- `InspectionMaterialsRow` — type — line 26
- `InspectionProgressRow` — type — line 10
- `InspectionRow` — type — line 52
- `InspectionSection` — type — line 59
- `InspectionTargetKind` — type — line 96
- `InspectionTargetRef` — type — line 107
- `WorldInspectionView` — type — line 88

## `app/interactables.ts`

- `buildCombatTarget` — function — line 1185
- `buildDigTarget` — function — line 1132
- `buildInteractables` — function — line 454
- `collectItem` — function — line 1235
- `COMBAT_TARGET_CONE_DOT` — const — line 99
- `COMBAT_TARGET_RANGE` — const — line 84
- `CombatAimMode` — type — line 89
- `DIG_REACH` — const — line 78
- `DROPPED_ITEM_GROUP_RADIUS` — const — line 304
- `GAZE_RANGE` — const — line 74
- `groupDroppedItemCandidates` — function — line 314
  - domain: items-player
- `INTERACT_MIN_DOT` — const — line 71
- `INTERACT_RANGE` — const — line 68
- `itemPromptLabel` — function — line 293
- `resolveHaySpot` — function — line 390
- `worldItemAllowsAltInteract` — function — line 278
  - domain: ui-input

## `app/inventoryWiring.ts`

- `createInventoryWiring` — function — line 175
- `InventoryWiring` — type — line 109
- `InventoryWiringDeps` — type — line 142
- `MerchantInventoryView` — type — line 95

## `app/modalState.ts`

- `activeModal` — function — line 32
- `ActiveModal` — type — line 13

## `app/npcEngagement.ts`

- `engagedNpc` — function — line 13
- `isEngagedNpc` — function — line 19
- `isNpcEngagementOpen` — function — line 9
- `NpcEngagementState` — type — line 2

## `app/renderStack.ts`

- `createRenderStack` — function — line 48
- `RenderStack` — type — line 29

## `app/restCampSequence.ts`

- `createRestCampSequence` — function — line 47
- `RestCampSequence` — type — line 25
- `RestCampSequenceTickResult` — type — line 18

## `app/saveState.ts`

- `createSaveState` — function — line 118
  - domain: persistence
  - system: save-state
  - role: Assembles the live runtime state into `SaveData` and owns when it is written.
  - produces: SaveData
  - integration: Reads across WorldBundle, player and UI state to build one save.
- `SaveState` — type — line 37
- `SaveStateDeps` — type — line 58

## `app/userActions.ts`

- `FIRE_FOOTPRINT_RADIUS` — const — line 38
- `FIRE_PIT_FOOTPRINT_RADIUS` — const — line 39
- `FIRE_PIT_STONE_COST` — const — line 25
- `FIRE_PLACE_REACH` — const — line 37
- `FIRE_SEPARATION` — const — line 41
- `GRATE_BUILD_RANGE` — const — line 59
- `GRATE_COST` — const — line 53
- `SIMPLE_FIRE_BRANCH_COST` — const — line 24
- `TORCH_BRANCH_COST` — const — line 26
- `WOOD_PILE_BEAM_COST` — const — line 31
- `WOOD_PILE_FOOTPRINT_RADIUS` — const — line 40

## `app/worldBundle.ts`

- `BuiltWorldSystems` — type — line 829
- `caveTreasureContainerSpecs` — function — line 159
  - domain: world-terrain
- `createWorldBundle` — function — line 1393
- `disposeWorldBundle` — function — line 1834
- `HOME_RADIUS` — const — line 138
- `homeChunks` — function — line 182
- `rebuildWorldBundle` — function — line 1611
- `WorldBundle` — type — line 205
  - system: world-bundle
  - role: Owns the lifetime/rebuild boundary for all world systems (terrain, settlements, fauna, items, player-placed structures).
  - owns: WorldBundle
  - lifecycle: rebuild

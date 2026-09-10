# Symbols

Generated from exported TypeScript symbols.

## `app/actions/actionContext.ts`

- `isActionBlocked` — function — line 71
- `isChannelBusy` — function — line 78
- `PlayerActionContext` — type — line 30

## `app/actions/actionContracts.ts`

- `ActionAvailability` — type — line 21
- `ActionRequirement` — type — line 9
- `ActionResult` — type — line 25
- `capabilityRequirement` — function — line 34
- `itemRequirement` — function — line 30
- `targetRequirement` — function — line 38
- `toAvailability` — function — line 46
- `toResult` — function — line 51

## `app/actions/containerActions.ts`

- `ContainerActionDeps` — type — line 42
- `ContainerActions` — type — line 28
- `createContainerActions` — function — line 51

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

- `createGroundActions` — function — line 105
- `GroundActions` — type — line 53
- `GroundActionsDeps` — type — line 77

## `app/actions/inspectionActions.ts`

- `createInspectionActions` — function — line 53
- `InspectionActionDeps` — type — line 20
- `InspectionActions` — type — line 40

## `app/actions/mountActions.ts`

- `createMountActions` — function — line 44
- `DismountReason` — type — line 18
- `MountActions` — type — line 20

## `app/actions/placementActions.ts`

- `createPlacementActions` — function — line 415
- `evaluatePlacementSite` — function — line 252
- `GroundPlacementDefinition` — type — line 235
  - domain: world
- `GroundPlacementSite` — type — line 219
- `PlacementActions` — type — line 294
- `PlacementBlocker` — type — line 194
- `PlacementMutationLifecycle` — type — line 246
- `PlacementPreviewResult` — type — line 205
- `previewGroundPlacement` — function — line 262
- `WellRoofRepairView` — type — line 285
- `WellWorkView` — type — line 278

## `app/actions/placementPreviewActions.ts`

- `createPlacementPreviewActions` — function — line 153
- `PlacementPreviewActionDeps` — type — line 96
- `PlacementPreviewActions` — type — line 132
- `PlacementPreviewConfirmResult` — type — line 49
- `PlacementPreviewKind` — type — line 23
  - domain: ui-input
- `PlacementPreviewLifecycle` — type — line 55
- `PlacementPreviewUiView` — type — line 39

## `app/actions/placementYaw.ts`

- `PLACEMENT_YAW_STEP` — const — line 10
  - domain: ui-input
- `placementAimSite` — function — line 24
- `placementObjectYaw` — function — line 18
- `snapPlacementYaw45` — function — line 13

## `app/actions/restActions.ts`

- `createRestActions` — function — line 141
- `LodgingChoiceAction` — type — line 59
- `REST_IN_TOWN_RADIUS` — const — line 67
- `RestActionDeps` — type — line 129
- `RestActions` — type — line 73

## `app/actions/storageInfestationActions.ts`

- `createStorageInfestationActions` — function — line 27

## `app/actions/survivalActions.ts`

- `createSurvivalActions` — function — line 156
- `FeedableAnimal` — type — line 134
- `feedAnimal` — function — line 147
- `hasCarriedMilkContainer` — function — line 124
- `SurvivalActionLifecycle` — type — line 84
- `SurvivalActions` — type — line 94

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

- `CampRestSnapshot` — type — line 34
  - domain: items-player
- `CampRestSnapshotInput` — type — line 48
- `CampSnapshotFire` — type — line 20
- `findNearestPlayerFire` — function — line 84
- `formatCampInspectionDescription` — function — line 171
- `resolveCampRestSnapshot` — function — line 129
  - domain: items-player

## `app/createApp.ts`

- `createApp` — function — line 248
  - system: app-composition
  - role: Composition root: builds every long-lived system, threads their dependencies and owns app-level lifecycle (boot, rebuild, dispose).
  - owns: WorldBundle, GameLoop, AppRenderLoop
  - lifecycle: boot
  - integration: Wires world, player, UI, persistence and audio systems together.
- `NewAppOptions` — type — line 218

## `app/gameLoop.ts`

- `createGameLoop` — function — line 569
  - system: game-loop
  - role: Runs one frame's worth of simulation update + render.
  - uses: WorldBundle, PlayerController
  - simulation: tick
- `GameLoop` — type — line 537
- `GameLoopDeps` — type — line 276

## `app/graphicsSettings.ts`

- `createGraphicsSettings` — function — line 54
- `GraphicsSettings` — type — line 19
- `GraphicsSettingsDeps` — type — line 41

## `app/inspection/buildWorldInspection.ts`

- `buildWorldInspection` — function — line 97
- `listWaterContainerOptions` — function — line 595
- `liveWellWaterSource` — function — line 641
- `WorldInspectionLookup` — type — line 80

## `app/inspection/inspectionTarget.ts`

- `contractTargetFor` — function — line 24
- `inspectionTargetRef` — function — line 10

## `app/inspection/worldInspectionView.ts`

- `InspectionAction` — type — line 72
- `InspectionActionId` — type — line 61
- `InspectionContractRow` — type — line 43
- `InspectionInfoRow` — type — line 4
- `InspectionLiquidContainerOption` — type — line 29
- `InspectionLiquidContainersRow` — type — line 37
- `InspectionMaterialItem` — type — line 18
- `InspectionMaterialsRow` — type — line 23
- `InspectionProgressRow` — type — line 10
- `InspectionRow` — type — line 49
- `InspectionSection` — type — line 56
- `InspectionTargetKind` — type — line 88
- `InspectionTargetRef` — type — line 95
- `WorldInspectionView` — type — line 80

## `app/interactables.ts`

- `buildCombatTarget` — function — line 964
- `buildDigTarget` — function — line 911
- `buildInteractables` — function — line 322
- `collectItem` — function — line 1011
- `COMBAT_TARGET_CONE_DOT` — const — line 89
- `COMBAT_TARGET_RANGE` — const — line 74
- `CombatAimMode` — type — line 79
- `DIG_REACH` — const — line 68
- `GAZE_RANGE` — const — line 64
- `INTERACT_MIN_DOT` — const — line 61
- `INTERACT_RANGE` — const — line 58
- `resolveHaySpot` — function — line 258

## `app/inventoryWiring.ts`

- `createInventoryWiring` — function — line 135
- `InventoryWiring` — type — line 81
- `InventoryWiringDeps` — type — line 104
- `MerchantInventoryView` — type — line 68

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

- `createSaveState` — function — line 110
  - domain: persistence
  - system: save-state
  - role: Assembles the live runtime state into `SaveData` and owns when it is written.
  - produces: SaveData
  - integration: Reads across WorldBundle, player and UI state to build one save.
- `SaveState` — type — line 34
- `SaveStateDeps` — type — line 55

## `app/userActions.ts`

- `FIRE_FOOTPRINT_RADIUS` — const — line 35
- `FIRE_PIT_STONE_COST` — const — line 23
- `FIRE_PLACE_REACH` — const — line 34
- `FIRE_SEPARATION` — const — line 36
- `GRATE_BUILD_RANGE` — const — line 48
- `GRATE_COST` — const — line 42
- `SIMPLE_FIRE_BRANCH_COST` — const — line 22
- `TORCH_BRANCH_COST` — const — line 24
- `WOOD_PILE_BEAM_COST` — const — line 28

## `app/worldBundle.ts`

- `BuiltWorldSystems` — type — line 622
- `createWorldBundle` — function — line 1005
- `disposeWorldBundle` — function — line 1406
- `HOME_RADIUS` — const — line 95
- `homeChunks` — function — line 106
- `rebuildWorldBundle` — function — line 1203
- `WorldBundle` — type — line 129
  - system: world-bundle
  - role: Owns the lifetime/rebuild boundary for all world systems (terrain, settlements, fauna, items, player-placed structures).
  - owns: WorldBundle
  - lifecycle: rebuild

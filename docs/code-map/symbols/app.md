# Symbols

Generated from exported TypeScript symbols.

## `app/actions/actionContext.ts`

- `isActionBlocked` — function — line 69
- `isChannelBusy` — function — line 76
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

- `ContainerActionDeps` — type — line 39
- `ContainerActions` — type — line 26
- `createContainerActions` — function — line 48

## `app/actions/cookMealIntent.ts`

- `CookMealIntentController` — type — line 28
- `CookMealIntentPhase` — type — line 19
- `createCookMealIntent` — function — line 55
  - domain: ui-input
- `runEatAnything` — function — line 197

## `app/actions/gatheringActions.ts`

- `createGatheringActions` — function — line 67
- `GatheringActionDeps` — type — line 56
- `GatheringActions` — type — line 35

## `app/actions/groundActions.ts`

- `createGroundActions` — function — line 104
- `GroundActions` — type — line 52
- `GroundActionsDeps` — type — line 76

## `app/actions/mountActions.ts`

- `createMountActions` — function — line 44
- `DismountReason` — type — line 18
- `MountActions` — type — line 20

## `app/actions/placementActions.ts`

- `createPlacementActions` — function — line 335
- `evaluatePlacementSite` — function — line 196
- `GroundPlacementDefinition` — type — line 186
  - domain: world
- `GroundPlacementSite` — type — line 170
- `PlacementActions` — type — line 229
- `PlacementBlocker` — type — line 145
- `PlacementPreviewResult` — type — line 156
- `previewGroundPlacement` — function — line 206
- `WellWorkView` — type — line 222

## `app/actions/placementPreviewActions.ts`

- `createPlacementPreviewActions` — function — line 130
- `PlacementPreviewActionDeps` — type — line 79
- `PlacementPreviewActions` — type — line 109
- `PlacementPreviewKind` — type — line 23
  - domain: ui-input
- `PlacementPreviewLifecycle` — type — line 44
- `PlacementPreviewUiView` — type — line 36

## `app/actions/placementYaw.ts`

- `PLACEMENT_YAW_STEP` — const — line 10
  - domain: ui-input
- `placementAimSite` — function — line 24
- `placementObjectYaw` — function — line 18
- `snapPlacementYaw45` — function — line 13

## `app/actions/restActions.ts`

- `createRestActions` — function — line 109
- `LodgingChoiceAction` — type — line 34
- `REST_IN_TOWN_RADIUS` — const — line 42
- `RestActionDeps` — type — line 97
- `RestActions` — type — line 48

## `app/actions/survivalActions.ts`

- `createSurvivalActions` — function — line 131
- `FeedableAnimal` — type — line 109
- `feedAnimal` — function — line 122
- `hasCarriedMilkContainer` — function — line 99
- `SurvivalActionLifecycle` — type — line 63
- `SurvivalActions` — type — line 73

## `app/actions/terrainPreparationActions.ts`

- `createTerrainPreparationActions` — function — line 141
- `TerrainPreparationActionDeps` — type — line 81
- `TerrainPreparationActions` — type — line 97
- `TerrainPreparationPreviewView` — type — line 74

## `app/actions/workContractActions.ts`

- `createWorkContractActions` — function — line 99
- `WorkContractActionDeps` — type — line 93
- `WorkContractActions` — type — line 66
- `WorkContractQuickActionEntry` — type — line 64

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

- `CampRestContext` — type — line 11
- `campRestQuality` — function — line 128
- `hasTentNear` — function — line 62
- `hasWarmFireNear` — function — line 49
- `TENT_SHELTER_RADIUS` — const — line 37
- `WARM_FIRE_RADIUS` — const — line 33

## `app/createApp.ts`

- `createApp` — function — line 240
  - system: app-composition
  - role: Composition root: builds every long-lived system, threads their dependencies and owns app-level lifecycle (boot, rebuild, dispose).
  - owns: WorldBundle, GameLoop, AppRenderLoop
  - lifecycle: boot
  - integration: Wires world, player, UI, persistence and audio systems together.
- `NewAppOptions` — type — line 210

## `app/gameLoop.ts`

- `createGameLoop` — function — line 525
  - system: game-loop
  - role: Runs one frame's worth of simulation update + render.
  - uses: WorldBundle, PlayerController
  - simulation: tick
- `GameLoop` — type — line 493
- `GameLoopDeps` — type — line 263

## `app/graphicsSettings.ts`

- `createGraphicsSettings` — function — line 54
- `GraphicsSettings` — type — line 19
- `GraphicsSettingsDeps` — type — line 41

## `app/interactables.ts`

- `buildCombatTarget` — function — line 896
- `buildDigTarget` — function — line 843
- `buildInteractables` — function — line 312
- `collectItem` — function — line 943
- `COMBAT_TARGET_CONE_DOT` — const — line 80
- `COMBAT_TARGET_RANGE` — const — line 65
- `CombatAimMode` — type — line 70
- `DIG_REACH` — const — line 59
- `GAZE_RANGE` — const — line 55
- `INTERACT_MIN_DOT` — const — line 52
- `INTERACT_RANGE` — const — line 49
- `resolveHaySpot` — function — line 248

## `app/inventoryWiring.ts`

- `createInventoryWiring` — function — line 119
- `InventoryWiring` — type — line 66
- `InventoryWiringDeps` — type — line 89
- `MerchantInventoryView` — type — line 53

## `app/modalState.ts`

- `activeModal` — function — line 31
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

- `BuiltWorldSystems` — type — line 576
- `createWorldBundle` — function — line 930
- `disposeWorldBundle` — function — line 1289
- `HOME_RADIUS` — const — line 88
- `homeChunks` — function — line 99
- `rebuildWorldBundle` — function — line 1104
- `WorldBundle` — type — line 122
  - system: world-bundle
  - role: Owns the lifetime/rebuild boundary for all world systems (terrain, settlements, fauna, items, player-placed structures).
  - owns: WorldBundle
  - lifecycle: rebuild

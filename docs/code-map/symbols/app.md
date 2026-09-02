# Symbols

Generated from exported TypeScript symbols.

## `app/actions/actionContext.ts`

- `isActionBlocked` — function — line 74
- `isChannelBusy` — function — line 81
- `PlayerActionContext` — type — line 30

## `app/actions/containerActions.ts`

- `ContainerActionDeps` — type — line 36
- `ContainerActions` — type — line 23
- `createContainerActions` — function — line 45

## `app/actions/gatheringActions.ts`

- `createGatheringActions` — function — line 58
- `GatheringActionDeps` — type — line 51
- `GatheringActions` — type — line 34

## `app/actions/groundActions.ts`

- `createGroundActions` — function — line 93
- `GroundActions` — type — line 44
- `GroundActionsDeps` — type — line 68

## `app/actions/mountActions.ts`

- `createMountActions` — function — line 40
- `DismountReason` — type — line 18
- `MountActions` — type — line 20

## `app/actions/placementActions.ts`

- `createPlacementActions` — function — line 291
- `evaluatePlacementSite` — function — line 170
- `GroundPlacementDefinition` — type — line 162
  - domain: world
- `GroundPlacementSite` — type — line 146
- `PlacementActions` — type — line 202
- `PlacementBlocker` — type — line 126
- `PlacementPreviewResult` — type — line 134
- `previewGroundPlacement` — function — line 180
- `WellWorkView` — type — line 195

## `app/actions/placementPreviewActions.ts`

- `createPlacementPreviewActions` — function — line 84
- `PlacementPreviewActionDeps` — type — line 40
- `PlacementPreviewActions` — type — line 67
- `PlacementPreviewKind` — type — line 20
- `PlacementPreviewUiView` — type — line 22

## `app/actions/restActions.ts`

- `createRestActions` — function — line 109
- `LodgingChoiceAction` — type — line 34
- `REST_IN_TOWN_RADIUS` — const — line 42
- `RestActionDeps` — type — line 97
- `RestActions` — type — line 48

## `app/actions/survivalActions.ts`

- `createSurvivalActions` — function — line 83
- `hasCarriedMilkContainer` — function — line 77
- `SurvivalActions` — type — line 51

## `app/actions/terrainPreparationActions.ts`

- `createTerrainPreparationActions` — function — line 142
- `TerrainPreparationActionDeps` — type — line 82
- `TerrainPreparationActions` — type — line 98
- `TerrainPreparationPreviewView` — type — line 75

## `app/actions/workContractActions.ts`

- `createWorkContractActions` — function — line 64
- `WorkContractActionDeps` — type — line 58
- `WorkContractActions` — type — line 38
- `WorkContractQuickActionEntry` — type — line 36

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

- `createApp` — function — line 211
  - system: app-composition
  - role: Composition root: builds every long-lived system, threads their dependencies and owns app-level lifecycle (boot, rebuild, dispose).
  - owns: WorldBundle, GameLoop, AppRenderLoop
  - lifecycle: boot
  - integration: Wires world, player, UI, persistence and audio systems together.

## `app/gameLoop.ts`

- `createGameLoop` — function — line 501
  - system: game-loop
  - role: Runs one frame's worth of simulation update + render.
  - uses: WorldBundle, PlayerController
  - simulation: tick
- `GameLoop` — type — line 469
- `GameLoopDeps` — type — line 253

## `app/graphicsSettings.ts`

- `createGraphicsSettings` — function — line 49
- `GraphicsSettings` — type — line 19
- `GraphicsSettingsDeps` — type — line 36

## `app/interactables.ts`

- `buildCombatTarget` — function — line 867
- `buildDigTarget` — function — line 814
- `buildInteractables` — function — line 314
- `collectItem` — function — line 914
- `COMBAT_TARGET_CONE_DOT` — const — line 76
- `COMBAT_TARGET_RANGE` — const — line 61
- `CombatAimMode` — type — line 66
- `DIG_REACH` — const — line 55
- `GAZE_RANGE` — const — line 51
- `INTERACT_MIN_DOT` — const — line 48
- `INTERACT_RANGE` — const — line 45
- `resolveHaySpot` — function — line 227
- `resolveWaterBodyKind` — function — line 261

## `app/inventoryWiring.ts`

- `createInventoryWiring` — function — line 80
- `InventoryWiring` — type — line 39
- `InventoryWiringDeps` — type — line 56
- `MerchantInventoryView` — type — line 26

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

- `createSaveState` — function — line 93
  - domain: persistence
  - system: save-state
  - role: Assembles the live runtime state into `SaveData` and owns when it is written.
  - produces: SaveData
  - integration: Reads across WorldBundle, player and UI state to build one save.
- `SaveState` — type — line 35
- `SaveStateDeps` — type — line 45

## `app/userActions.ts`

- `FIRE_FOOTPRINT_RADIUS` — const — line 28
- `FIRE_PIT_STONE_COST` — const — line 20
- `FIRE_PLACE_REACH` — const — line 27
- `FIRE_SEPARATION` — const — line 29
- `GRATE_BUILD_RANGE` — const — line 41
- `GRATE_COST` — const — line 35
- `LightActionResult` — type — line 43
- `SIMPLE_FIRE_BRANCH_COST` — const — line 19
- `TORCH_BRANCH_COST` — const — line 21

## `app/worldBundle.ts`

- `BuiltWorldSystems` — type — line 505
- `createWorldBundle` — function — line 824
- `disposeWorldBundle` — function — line 1147
- `HOME_RADIUS` — const — line 83
- `homeChunks` — function — line 94
- `rebuildWorldBundle` — function — line 975
- `WorldBundle` — type — line 117
  - system: world-bundle
  - role: Owns the lifetime/rebuild boundary for all world systems (terrain, settlements, fauna, items, player-placed structures).
  - owns: WorldBundle
  - lifecycle: rebuild

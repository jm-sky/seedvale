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

- `createGatheringActions` — function — line 57
- `GatheringActionDeps` — type — line 50
- `GatheringActions` — type — line 33

## `app/actions/groundActions.ts`

- `createGroundActions` — function — line 82
- `GroundActions` — type — line 38
- `GroundActionsDeps` — type — line 57

## `app/actions/mountActions.ts`

- `createMountActions` — function — line 40
- `DismountReason` — type — line 18
- `MountActions` — type — line 20

## `app/actions/placementActions.ts`

- `createPlacementActions` — function — line 259
- `evaluatePlacementSite` — function — line 153
- `GroundPlacementDefinition` — type — line 145
  - domain: world
- `GroundPlacementSite` — type — line 129
- `PlacementActions` — type — line 185
- `PlacementBlocker` — type — line 109
- `PlacementPreviewResult` — type — line 117
- `previewGroundPlacement` — function — line 163
- `WellWorkView` — type — line 178

## `app/actions/placementPreviewActions.ts`

- `createPlacementPreviewActions` — function — line 75
- `PlacementPreviewActionDeps` — type — line 36
- `PlacementPreviewActions` — type — line 58
- `PlacementPreviewKind` — type — line 19
- `PlacementPreviewUiView` — type — line 21

## `app/actions/restActions.ts`

- `createRestActions` — function — line 104
- `LodgingChoiceAction` — type — line 29
- `REST_IN_TOWN_RADIUS` — const — line 37
- `RestActionDeps` — type — line 92
- `RestActions` — type — line 43

## `app/actions/survivalActions.ts`

- `createSurvivalActions` — function — line 83
- `hasCarriedMilkContainer` — function — line 77
- `SurvivalActions` — type — line 51

## `app/actions/terrainPreparationActions.ts`

- `createTerrainPreparationActions` — function — line 142
- `TerrainPreparationActionDeps` — type — line 82
- `TerrainPreparationActions` — type — line 98
- `TerrainPreparationPreviewView` — type — line 75

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
- `campRestQuality` — function — line 99
- `hasTentNear` — function — line 52
- `hasWarmFireNear` — function — line 39
- `TENT_SHELTER_RADIUS` — const — line 27
- `WARM_FIRE_RADIUS` — const — line 23

## `app/createApp.ts`

- `createApp` — function — line 208
  - system: app-composition
  - role: Composition root: builds every long-lived system, threads their dependencies and owns app-level lifecycle (boot, rebuild, dispose).
  - owns: WorldBundle, GameLoop, AppRenderLoop
  - lifecycle: boot
  - integration: Wires world, player, UI, persistence and audio systems together.

## `app/gameLoop.ts`

- `createGameLoop` — function — line 497
  - system: game-loop
  - role: Runs one frame's worth of simulation update + render.
  - uses: WorldBundle, PlayerController
  - simulation: tick
- `GameLoop` — type — line 465
- `GameLoopDeps` — type — line 255

## `app/graphicsSettings.ts`

- `createGraphicsSettings` — function — line 49
- `GraphicsSettings` — type — line 19
- `GraphicsSettingsDeps` — type — line 36

## `app/interactables.ts`

- `buildCombatTarget` — function — line 846
- `buildDigTarget` — function — line 793
- `buildInteractables` — function — line 320
- `collectItem` — function — line 893
- `COMBAT_TARGET_CONE_DOT` — const — line 82
- `COMBAT_TARGET_RANGE` — const — line 67
- `CombatAimMode` — type — line 72
- `DIG_REACH` — const — line 61
- `GAZE_RANGE` — const — line 51
- `INTERACT_MIN_DOT` — const — line 48
- `INTERACT_RANGE` — const — line 45
- `KNIFE_BRANCH_BONUS` — const — line 57
- `resolveHaySpot` — function — line 233
- `resolveWaterBodyKind` — function — line 267
- `TREE_BRANCH_CHANCE` — const — line 54

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

- `createRenderStack` — function — line 43
- `RenderStack` — type — line 27

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

- `BuiltWorldSystems` — type — line 484
- `createWorldBundle` — function — line 776
- `disposeWorldBundle` — function — line 1068
- `HOME_RADIUS` — const — line 78
- `homeChunks` — function — line 89
- `rebuildWorldBundle` — function — line 915
- `WorldBundle` — type — line 112
  - system: world-bundle
  - role: Owns the lifetime/rebuild boundary for all world systems (terrain, settlements, fauna, items, player-placed structures).
  - owns: WorldBundle
  - lifecycle: rebuild

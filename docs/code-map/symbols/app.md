# Symbols

Generated from exported TypeScript symbols.

## `app/actions/actionContext.ts`

- `isActionBlocked` — function — line 69
- `isChannelBusy` — function — line 76
- `PlayerActionContext` — type — line 30

## `app/actions/containerActions.ts`

- `ContainerActionDeps` — type — line 28
- `ContainerActions` — type — line 21
- `createContainerActions` — function — line 37

## `app/actions/gatheringActions.ts`

- `createGatheringActions` — function — line 56
- `GatheringActionDeps` — type — line 49
- `GatheringActions` — type — line 32

## `app/actions/groundActions.ts`

- `createGroundActions` — function — line 59
- `GroundActions` — type — line 34
- `GroundActionsDeps` — type — line 53

## `app/actions/mountActions.ts`

- `createMountActions` — function — line 40
- `DismountReason` — type — line 18
- `MountActions` — type — line 20

## `app/actions/placementActions.ts`

- `createPlacementActions` — function — line 119
- `PlacementActions` — type — line 80
- `PlacementBlocker` — type — line 71
- `WellWorkView` — type — line 73

## `app/actions/restActions.ts`

- `createRestActions` — function — line 101
- `LodgingChoiceAction` — type — line 27
- `REST_IN_TOWN_RADIUS` — const — line 35
- `RestActionDeps` — type — line 89
- `RestActions` — type — line 41

## `app/actions/survivalActions.ts`

- `createSurvivalActions` — function — line 83
- `hasCarriedMilkContainer` — function — line 77
- `SurvivalActions` — type — line 51

## `app/actions/terrainPreparationActions.ts`

- `createTerrainPreparationActions` — function — line 123
- `TerrainPreparationActionDeps` — type — line 72
- `TerrainPreparationActions` — type — line 84
- `TerrainPreparationPreviewView` — type — line 65

## `app/appRenderLoop.ts`

- `AppRenderLoop` — type — line 26
  - system: app-render-loop
  - role: Drives `requestAnimationFrame` scheduling, viewport/DPR resize and WebGL context loss/restore around the game loop.
  - uses: GameLoop
  - lifecycle: frame-scheduling
- `AppRenderLoopDeps` — type — line 32
- `createAppRenderLoop` — function — line 46

## `app/busyAction.ts`

- `BusyAction` — type — line 28
- `BusyStartOptions` — type — line 12
- `BusyTickResult` — type — line 1
- `createBusyAction` — function — line 60

## `app/campRest.ts`

- `CampRestContext` — type — line 11
- `campRestQuality` — function — line 99
- `hasTentNear` — function — line 52
- `hasWarmFireNear` — function — line 39
- `TENT_SHELTER_RADIUS` — const — line 27
- `WARM_FIRE_RADIUS` — const — line 23

## `app/createApp.ts`

- `createApp` — function — line 204
  - system: app-composition
  - role: Composition root: builds every long-lived system, threads their dependencies and owns app-level lifecycle (boot, rebuild, dispose).
  - owns: WorldBundle, GameLoop, AppRenderLoop
  - lifecycle: boot
  - integration: Wires world, player, UI, persistence and audio systems together.

## `app/gameLoop.ts`

- `createGameLoop` — function — line 425
  - system: game-loop
  - role: Runs one frame's worth of simulation update + render.
  - uses: WorldBundle, PlayerController
  - simulation: tick
- `GameLoop` — type — line 393
- `GameLoopDeps` — type — line 204

## `app/graphicsSettings.ts`

- `createGraphicsSettings` — function — line 49
- `GraphicsSettings` — type — line 19
- `GraphicsSettingsDeps` — type — line 36

## `app/interactables.ts`

- `buildCombatTarget` — function — line 778
- `buildDigTarget` — function — line 725
- `buildInteractables` — function — line 280
- `collectItem` — function — line 825
- `COMBAT_TARGET_CONE_DOT` — const — line 80
- `COMBAT_TARGET_RANGE` — const — line 65
- `CombatAimMode` — type — line 70
- `DIG_REACH` — const — line 59
- `GAZE_RANGE` — const — line 49
- `INTERACT_MIN_DOT` — const — line 46
- `INTERACT_RANGE` — const — line 43
- `KNIFE_BRANCH_BONUS` — const — line 55
- `resolveHaySpot` — function — line 230
- `TREE_BRANCH_CHANCE` — const — line 52

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

- `createSaveState` — function — line 87
  - domain: persistence
  - system: save-state
  - role: Assembles the live runtime state into `SaveData` and owns when it is written.
  - produces: SaveData
  - integration: Reads across WorldBundle, player and UI state to build one save.
- `SaveState` — type — line 34
- `SaveStateDeps` — type — line 44

## `app/userActions.ts`

- `FIRE_PIT_STONE_COST` — const — line 16
- `GRATE_BUILD_RANGE` — const — line 29
- `GRATE_COST` — const — line 23
- `LightActionResult` — type — line 31
- `SIMPLE_FIRE_BRANCH_COST` — const — line 15
- `TORCH_BRANCH_COST` — const — line 17

## `app/worldBundle.ts`

- `BuiltWorldSystems` — type — line 476
- `createWorldBundle` — function — line 756
- `disposeWorldBundle` — function — line 1028
- `HOME_RADIUS` — const — line 74
- `homeChunks` — function — line 85
- `rebuildWorldBundle` — function — line 885
- `WorldBundle` — type — line 108
  - system: world-bundle
  - role: Owns the lifetime/rebuild boundary for all world systems (terrain, settlements, fauna, items, player-placed structures).
  - owns: WorldBundle
  - lifecycle: rebuild

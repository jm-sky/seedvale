# Symbols

Generated from exported TypeScript symbols.

## `app/actions/actionContext.ts`

- `isActionBlocked` — function — line 74
- `isChannelBusy` — function — line 81
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

- `ContainerActionDeps` — type — line 36
- `ContainerActions` — type — line 23
- `createContainerActions` — function — line 45

## `app/actions/gatheringActions.ts`

- `createGatheringActions` — function — line 67
- `GatheringActionDeps` — type — line 56
- `GatheringActions` — type — line 35

## `app/actions/groundActions.ts`

- `createGroundActions` — function — line 93
- `GroundActions` — type — line 44
- `GroundActionsDeps` — type — line 68

## `app/actions/mountActions.ts`

- `createMountActions` — function — line 40
- `DismountReason` — type — line 18
- `MountActions` — type — line 20

## `app/actions/placementActions.ts`

- `createPlacementActions` — function — line 312
- `evaluatePlacementSite` — function — line 179
- `GroundPlacementDefinition` — type — line 171
  - domain: world
- `GroundPlacementSite` — type — line 155
- `PlacementActions` — type — line 211
- `PlacementBlocker` — type — line 135
- `PlacementPreviewResult` — type — line 143
- `previewGroundPlacement` — function — line 189
- `WellWorkView` — type — line 204

## `app/actions/placementPreviewActions.ts`

- `createPlacementPreviewActions` — function — line 87
- `PlacementPreviewActionDeps` — type — line 42
- `PlacementPreviewActions` — type — line 70
- `PlacementPreviewKind` — type — line 21
- `PlacementPreviewUiView` — type — line 23

## `app/actions/restActions.ts`

- `createRestActions` — function — line 109
- `LodgingChoiceAction` — type — line 34
- `REST_IN_TOWN_RADIUS` — const — line 42
- `RestActionDeps` — type — line 97
- `RestActions` — type — line 48

## `app/actions/survivalActions.ts`

- `createSurvivalActions` — function — line 117
- `FeedableAnimal` — type — line 95
- `feedAnimal` — function — line 108
- `hasCarriedMilkContainer` — function — line 85
- `SurvivalActions` — type — line 59

## `app/actions/terrainPreparationActions.ts`

- `createTerrainPreparationActions` — function — line 141
- `TerrainPreparationActionDeps` — type — line 81
- `TerrainPreparationActions` — type — line 97
- `TerrainPreparationPreviewView` — type — line 74

## `app/actions/workContractActions.ts`

- `createWorkContractActions` — function — line 98
- `WorkContractActionDeps` — type — line 92
- `WorkContractActions` — type — line 65
- `WorkContractQuickActionEntry` — type — line 63

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

- `createApp` — function — line 219
  - system: app-composition
  - role: Composition root: builds every long-lived system, threads their dependencies and owns app-level lifecycle (boot, rebuild, dispose).
  - owns: WorldBundle, GameLoop, AppRenderLoop
  - lifecycle: boot
  - integration: Wires world, player, UI, persistence and audio systems together.

## `app/gameLoop.ts`

- `createGameLoop` — function — line 519
  - system: game-loop
  - role: Runs one frame's worth of simulation update + render.
  - uses: WorldBundle, PlayerController
  - simulation: tick
- `GameLoop` — type — line 487
- `GameLoopDeps` — type — line 260

## `app/graphicsSettings.ts`

- `createGraphicsSettings` — function — line 54
- `GraphicsSettings` — type — line 19
- `GraphicsSettingsDeps` — type — line 41

## `app/interactables.ts`

- `buildCombatTarget` — function — line 905
- `buildDigTarget` — function — line 852
- `buildInteractables` — function — line 333
- `collectItem` — function — line 952
- `COMBAT_TARGET_CONE_DOT` — const — line 78
- `COMBAT_TARGET_RANGE` — const — line 63
- `CombatAimMode` — type — line 68
- `DIG_REACH` — const — line 57
- `GAZE_RANGE` — const — line 53
- `INTERACT_MIN_DOT` — const — line 50
- `INTERACT_RANGE` — const — line 47
- `resolveHaySpot` — function — line 246
- `resolveWaterBodyKind` — function — line 280

## `app/inventoryWiring.ts`

- `createInventoryWiring` — function — line 113
- `InventoryWiring` — type — line 63
- `InventoryWiringDeps` — type — line 84
- `MerchantInventoryView` — type — line 50

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

- `createSaveState` — function — line 106
  - domain: persistence
  - system: save-state
  - role: Assembles the live runtime state into `SaveData` and owns when it is written.
  - produces: SaveData
  - integration: Reads across WorldBundle, player and UI state to build one save.
- `SaveState` — type — line 32
- `SaveStateDeps` — type — line 53

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

- `BuiltWorldSystems` — type — line 569
- `createWorldBundle` — function — line 921
- `disposeWorldBundle` — function — line 1280
- `HOME_RADIUS` — const — line 87
- `homeChunks` — function — line 98
- `rebuildWorldBundle` — function — line 1095
- `WorldBundle` — type — line 121
  - system: world-bundle
  - role: Owns the lifetime/rebuild boundary for all world systems (terrain, settlements, fauna, items, player-placed structures).
  - owns: WorldBundle
  - lifecycle: rebuild

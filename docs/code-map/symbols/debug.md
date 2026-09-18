# Symbols

Generated from exported TypeScript symbols.

## `debug/caves/caveHeightfieldFixtures.ts`

- `buildCaveHeightfieldFixture` — function — line 317
  - domain: world-terrain
- `CAVE_HEIGHTFIELD_ENTRANCE` — const — line 80
- `CAVE_HEIGHTFIELD_FIXTURE_IDS` — const — line 89
- `CAVE_HEIGHTFIELD_MODES` — const — line 92
- `caveHeightfieldBaseSurfaceAt` — function — line 102
  - domain: world-terrain
- `CaveHeightfieldFixtureId` — type — line 90
- `CaveHeightfieldMode` — type — line 93
- `caveHeightfieldWalkSurfaceAt` — function — line 112
  - domain: world-terrain
- `parseCaveHeightfieldFixtureId` — function — line 351
- `parseCaveHeightfieldMode` — function — line 358

## `debug/caves/caveHeightfieldMesh.ts`

- `createHeightfieldCaveMesh` — function — line 35
- `createMouthUndersideMask` — function — line 48

## `debug/caves/caveHeightfieldPlayer.ts`

- `CaveHeightfieldWalker` — type — line 43
- `createCaveHeightfieldWalker` — function — line 57
  - domain: world-terrain

## `debug/caves/caveHeightfieldTerrain.ts`

- `CAVE_HEIGHTFIELD_TERRAIN_ANCHOR` — const — line 36
- `CAVE_HEIGHTFIELD_TERRAIN_SEED` — const — line 24
- `sampleCaveHeightfieldBaseSurface` — function — line 73
  - domain: world-terrain
- `sampleCaveHeightfieldWalkSurface` — function — line 90
  - domain: world-terrain

## `debug/caves/caveHeightfieldTraversal.ts`

- `createDebugCaveGroundResolver` — function — line 83
  - domain: world-terrain
- `DebugCaveColumnQuery` — type — line 58
- `DebugCaveGround` — type — line 60
- `HEIGHTFIELD_MIN_STANDING_GAP` — const — line 45
- `HEIGHTFIELD_PLAYER_HEIGHT` — const — line 41
- `HEIGHTFIELD_PLAYER_RADIUS` — const — line 40
- `heightfieldCapsuleHitsCeiling` — function — line 156
  - domain: world-terrain
- `heightfieldFloorAt` — function — line 49
- `HeightfieldVerticalState` — type — line 119
- `integrateDebugVertical` — function — line 132
  - domain: world-terrain
- `queryHeightfieldColumn` — function — line 109

## `debug/caves/caveHeightfieldWalkWorld.ts`

- `CaveWalkWorld` — type — line 26
- `createHeightfieldWalkWorld` — function — line 48
  - domain: world-terrain

## `debug/colliderDebugView.ts`

- `ColliderDebugView` — type — line 14
- `createColliderDebugView` — function — line 21

## `debug/colliderInstancedVisual.ts`

- `ColliderInstancedVisual` — type — line 33
- `ColliderInstancedVisualOptions` — type — line 17
- `createColliderInstancedVisual` — function — line 43

## `debug/createCameraDebugOverlay.ts`

- `CameraDebugOverlay` — type — line 20
- `CameraDebugSnapshot` — type — line 3
- `createCameraDebugOverlay` — function — line 26

## `debug/createCaveHeightfieldTestScene.ts`

- `CaveHeightfieldSpikeMetrics` — type — line 63
- `createCaveHeightfieldTestScene` — function — line 491
  - domain: world-terrain

## `debug/createModelTestScene.ts`

- `createModelTestScene` — function — line 40

## `debug/debugMode.ts`

- `DEBUG_HOUSE_LAMP_POSITION` — const — line 3
- `DebugSystemName` — type — line 131
- `isAdminMode` — function — line 45
- `isBootMarkMode` — function — line 35
- `isCameraDebugMode` — function — line 65
- `isCameraMeshDebugMode` — function — line 78
- `isCaveHeightfieldTestMode` — function — line 59
- `isColliderDebugMode` — function — line 94
- `isDebugMode` — function — line 40
- `isModelTestMode` — function — line 52
- `isNoShadowsDebugMode` — function — line 72
- `isNpcCombatDebugMode` — function — line 108
- `isRenderStateDebugMode` — function — line 86
- `isSystemEnabled` — function — line 152
- `isWildBoarGlbEnabled` — function — line 117
- `urlParamValue` — function — line 21

## `debug/domainHistory.ts`

- `BoundedHistoryBuffer` — type — line 14
  - domain: settlements-npcs
  - system: domain-history
  - role: Generic bounded ring buffer + ordering/filter helpers reused by every per-domain history buffer.
- `createBoundedHistoryBuffer` — function — line 23
- `createSequenceAllocator` — function — line 48
- `filterHistory` — function — line 65
- `HistoryFilter` — type — line 56
- `SequenceAllocator` — type — line 46

## `debug/faunaInspector.ts`

- `FrenzyWolfCandidate` — type — line 41
- `getCurrentFrenzyWolf` — function — line 72
- `getFrenzyWolves` — function — line 65
- `getNextFrenzyWolf` — function — line 84
- `logNpcThreatBranch` — function — line 24
- `pickNextFrenzyWolfId` — function — line 49

## `debug/householdHistory.ts`

- `createHouseholdHistoryBuffer` — function — line 36
- `HOUSEHOLD_HISTORY_CAPACITY` — const — line 32
- `HouseholdHistoryBuffer` — type — line 34
- `HouseholdHistoryEvent` — type — line 18
- `HouseholdHistoryEventType` — type — line 28

## `debug/locationQueries.ts`

- `deepForestNearest` — function — line 60
- `LocationKind` — type — line 21
- `LocationResult` — type — line 26
- `mountainNearest` — function — line 45
- `oceanNearest` — function — line 73
- `riverNearest` — function — line 135
- `riversNearby` — function — line 230
  - domain: ui-input
- `villageNearest` — function — line 260

## `debug/locationSearch.ts`

- `cellRingSteps` — function — line 80
- `RingStep` — type — line 13
- `searchNearest` — function — line 24
- `WorldPoint` — type — line 37
- `worldRingSteps` — function — line 47

## `debug/npcDebugApi.ts`

- `ConditionsDebugApi` — type — line 251
- `HiddenTreasureDebugApi` — type — line 223
- `HorseDebugApi` — type — line 319
- `HouseholdDebugHandle` — type — line 128
- `HouseholdFoodSupplyDebugSnapshot` — type — line 110
- `InjuryDebugApi` — type — line 259
- `installNpcDebugApi` — function — line 560
- `LocationsDebugApi` — type — line 168
- `NpcDebugHandle` — type — line 96
- `PlayerDebugApi` — type — line 325
- `QuestsDebugApi` — type — line 308
- `QuestSpawnPointDebugSnapshot` — type — line 281
- `QuestTargetDebugSnapshot` — type — line 296
- `SeedvaleDebugApi` — type — line 410
- `SettlementFoodTransportDebugSnapshot` — type — line 116
- `SettlementHistoryDebugHandle` — type — line 139
- `SkillsDebugApi` — type — line 241
- `StructureDebugApi` — type — line 271
- `TeleportToDebugApi` — type — line 180
- `TransportOrderDebugSnapshot` — type — line 343
- `VillageDebugHandle` — type — line 151
- `WorldLocationDebugEntry` — type — line 204
- `WorldLocationsDebugApi` — type — line 205

## `debug/npcDecisionReport.ts`

- `buildNpcDecisionDiagnostics` — function — line 234
- `NPC_TRACE_LIFETIME_NOTE` — const — line 14
  - domain: tools
- `NpcAnimalThreatProjection` — type — line 41
- `NpcAnimalThreatResponseProjection` — type — line 28
- `NpcCombatSummaryProjection` — type — line 59
- `NpcContractEvaluationProjection` — type — line 53
- `NpcDecisionCycleProjection` — type — line 20
- `NpcDecisionDiagnostics` — type — line 66
- `projectNpcAnimalThreat` — function — line 155
- `projectNpcCombatSummary` — function — line 199
- `projectNpcContractEvaluations` — function — line 211
- `projectNpcDecisionCycles` — function — line 101
- `SettlementDecisionReport` — type — line 75

## `debug/npcInspector.ts`

- `DomainHistoryEnvelope` — type — line 191
- `findNpcById` — function — line 73
- `freezeNpc` — function — line 316
- `FrenzyWolfDebugResult` — type — line 57
- `FrenzyWolvesDebugResult` — type — line 377
- `householdHistory` — function — line 173
- `isNpcRegistered` — function — line 84
- `matchesNpcFilter` — function — line 94
- `npcDecisionReport` — function — line 131
- `npcHistory` — function — line 124
- `NpcQueryFilter` — type — line 44
- `NpcQueryResult` — type — line 52
- `NpcRegistryEntry` — type — line 42
- `npcWhy` — function — line 120
- `queryNpcs` — function — line 110
- `reevaluateNpc` — function — line 332
- `setFrenzyWolf` — function — line 349
- `setFrenzyWolves` — function — line 386
- `settlementDecisionReport` — function — line 143
- `settlementHistory` — function — line 255
- `sortDomainHistory` — function — line 228
- `unfreezeNpc` — function — line 324

## `debug/npcInspectTrigger.ts`

- `createNpcInspectTrigger` — function — line 21
- `NpcInspectTrigger` — type — line 15

## `debug/npcTrace.ts`

- `createNpcTraceBuffer` — function — line 162
- `NPC_TRACE_CAPACITY` — const — line 160
- `NpcTraceBuffer` — type — line 153
- `NpcTraceEvent` — type — line 15
- `NpcTraceEventType` — type — line 145

## `debug/playerGroundTrace.ts`

- `CaveGroundQueryDebug` — type — line 69
- `createPlayerGroundTraceBuffer` — function — line 178
- `detectPlayerGroundSnap` — function — line 158
- `emptyPlayerGroundTrace` — function — line 303
- `PLAYER_GROUND_SNAP_Y` — const — line 16
- `PLAYER_GROUND_TRACE_CAPACITY` — const — line 12
  - domain: debug
- `PLAYER_GROUND_TRACE_POST_TICKS` — const — line 14
- `PlayerGroundHitSnapshot` — type — line 20
- `PlayerGroundSnapReason` — type — line 28
- `PlayerGroundSource` — type — line 18
- `PlayerGroundTraceBuffer` — type — line 82
- `PlayerGroundTraceSnapshot` — type — line 61
- `PlayerGroundTraceTick` — type — line 31
- `PlayerGroundTraceWriter` — type — line 26
- `snapshotCaveGroundHit` — function — line 284
- `writeHitSnapshot` — function — line 292

## `debug/playerMovementTrace.ts`

- `classifyMovementBackward` — function — line 175
- `colliderToMovementSnapshot` — function — line 124
- `createPlayerMovementTraceBuffer` — function — line 385
- `emptyPlayerMovementTrace` — function — line 445
- `findLargestBackwardEvent` — function — line 293
- `MOVEMENT_BACKWARD_EPSILON` — const — line 12
- `movementBackwardAmount` — function — line 155
- `MovementBackwardClassification` — type — line 166
- `MovementColliderSnapshot` — type — line 31
- `MovementGroundSource` — type — line 43
- `MovementHeightfieldSnapshot` — type — line 21
- `MovementSnapStage` — type — line 14
- `PLAYER_MOVEMENT_TRACE_CAPACITY` — const — line 10
- `PlayerMovementTraceBuffer` — type — line 114
- `PlayerMovementTraceRecordInput` — type — line 103
- `PlayerMovementTraceSnapshot` — type — line 98
- `PlayerMovementTraceTick` — type — line 45
- `selectMovementTraceWindow` — function — line 302

## `debug/renderStateDebug.ts`

- `CameraMeshHit` — type — line 12
- `getRenderStateDebugText` — function — line 188
- `sampleRenderState` — function — line 82
- `setCameraMeshHit` — function — line 23

## `debug/settlementHistory.ts`

- `createSettlementHistoryBuffer` — function — line 31
- `SETTLEMENT_HISTORY_CAPACITY` — const — line 27
- `SettlementHistoryBuffer` — type — line 29
- `SettlementHistoryEvent` — type — line 16
- `SettlementHistoryEventType` — type — line 22

## `debug/villageInspector.ts`

- `findVillageDef` — function — line 16

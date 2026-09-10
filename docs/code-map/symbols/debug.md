# Symbols

Generated from exported TypeScript symbols.

## `debug/caves/caveHeightfieldFixtures.ts`

- `buildCaveHeightfieldFixture` — function — line 125
  - domain: world-terrain
- `CAVE_HEIGHTFIELD_ENTRANCE` — const — line 17
- `CAVE_HEIGHTFIELD_FIXTURE_IDS` — const — line 26
- `CAVE_HEIGHTFIELD_MODES` — const — line 32
- `CAVE_HEIGHTFIELD_OVERBURDEN` — const — line 36
- `CAVE_HEIGHTFIELD_VARIANTS` — const — line 29
- `CaveHeightfieldFixtureId` — type — line 27
- `CaveHeightfieldMode` — type — line 33
- `CaveHeightfieldVariant` — type — line 30
- `parseCaveHeightfieldFixtureId` — function — line 176
- `parseCaveHeightfieldMode` — function — line 190
- `parseCaveHeightfieldVariant` — function — line 183
- `sampleCaveHeightfieldSurface` — function — line 91
  - domain: world-terrain

## `debug/caves/caveHeightfieldMesh.ts`

- `buildHeightfieldMeshBuffers` — function — line 117
  - domain: world-terrain
- `createHeightfieldCaveGeometry` — function — line 151
  - domain: world-terrain
- `createHeightfieldCaveMaterial` — function — line 161
- `createHeightfieldCaveMesh` — function — line 171
- `HeightfieldMeshBuffers` — type — line 21

## `debug/caves/caveHeightfieldPlayer.ts`

- `CaveHeightfieldWalker` — type — line 60
- `createCaveHeightfieldWalker` — function — line 74
  - domain: world-terrain
- `HeightfieldWalkCollision` — type — line 47

## `debug/caves/caveHeightfieldRepresentation.ts`

- `buildCaveHeightfieldRepresentation` — function — line 302
  - domain: world-terrain
- `CaveHeightfieldBounds` — type — line 29
- `CaveHeightfieldBuildResult` — type — line 92
- `CaveHeightfieldConfig` — type — line 13
- `CaveHeightfieldRepresentation` — type — line 42
  - domain: world-terrain
- `DEFAULT_HEIGHTFIELD_CONFIG` — const — line 21
- `extractHeightfieldBoundaryEdges` — function — line 409
  - domain: world-terrain
- `HeightfieldBoundaryEdge` — type — line 67
- `heightfieldCellCenter` — function — line 571
- `heightfieldCellIndex` — function — line 567
- `HeightfieldSample` — type — line 84
- `HeightfieldStation` — type — line 59
- `resampleSegmentStations` — function — line 157
  - domain: world-terrain
- `sampleHeightfieldAt` — function — line 525
  - domain: world-terrain

## `debug/caves/caveHeightfieldTraversal.ts`

- `HEIGHTFIELD_PLAYER_HEIGHT` — const — line 19
- `HEIGHTFIELD_PLAYER_RADIUS` — const — line 18
- `heightfieldCapsuleHitsCeiling` — function — line 209
  - domain: world-terrain
- `HeightfieldGroundHit` — type — line 25
- `heightfieldOccupancyAt` — function — line 186
  - domain: world-terrain
- `HeightfieldSpaceQuery` — type — line 21
- `HeightfieldVerticalState` — type — line 147
- `integrateHeightfieldVertical` — function — line 158
  - domain: world-terrain
- `queryHeightfieldGround` — function — line 120
  - domain: world-terrain
- `queryHeightfieldSpace` — function — line 53
  - domain: world-terrain
- `resolveHeightfieldHorizontal` — function — line 84
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

- `CaveHeightfieldSpikeMetrics` — type — line 59
- `createCaveHeightfieldTestScene` — function — line 263
  - domain: world-terrain

## `debug/createModelTestScene.ts`

- `createModelTestScene` — function — line 44

## `debug/debugMode.ts`

- `DebugSystemName` — type — line 114
- `isAdminMode` — function — line 43
- `isBootMarkMode` — function — line 33
- `isCameraDebugMode` — function — line 63
- `isCameraMeshDebugMode` — function — line 76
- `isCaveHeightfieldTestMode` — function — line 57
- `isColliderDebugMode` — function — line 92
- `isDebugMode` — function — line 38
- `isModelTestMode` — function — line 50
- `isNoShadowsDebugMode` — function — line 70
- `isNpcCombatDebugMode` — function — line 106
- `isRenderStateDebugMode` — function — line 84
- `isSystemEnabled` — function — line 120
- `urlParamValue` — function — line 19

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

- `ConditionsDebugApi` — type — line 193
- `HiddenTreasureDebugApi` — type — line 165
- `HouseholdDebugHandle` — type — line 84
- `InjuryDebugApi` — type — line 201
- `installNpcDebugApi` — function — line 371
- `LocationsDebugApi` — type — line 116
- `NpcDebugHandle` — type — line 69
- `PlayerDebugApi` — type — line 208
- `SeedvaleDebugApi` — type — line 246
- `SettlementHistoryDebugHandle` — type — line 92
- `SkillsDebugApi` — type — line 183
- `TeleportToDebugApi` — type — line 128
- `TransportOrderDebugSnapshot` — type — line 220
- `VillageDebugHandle` — type — line 99
- `WorldLocationDebugEntry` — type — line 149
- `WorldLocationsDebugApi` — type — line 150

## `debug/npcInspector.ts`

- `DomainHistoryEnvelope` — type — line 149
- `findNpcById` — function — line 67
- `freezeNpc` — function — line 274
- `FrenzyWolfDebugResult` — type — line 51
- `householdHistory` — function — line 131
- `isNpcRegistered` — function — line 78
- `matchesNpcFilter` — function — line 88
- `npcHistory` — function — line 118
- `NpcQueryFilter` — type — line 38
- `NpcQueryResult` — type — line 46
- `NpcRegistryEntry` — type — line 36
- `npcWhy` — function — line 114
- `queryNpcs` — function — line 104
- `reevaluateNpc` — function — line 290
- `setFrenzyWolf` — function — line 307
- `settlementHistory` — function — line 213
- `sortDomainHistory` — function — line 186
- `unfreezeNpc` — function — line 282

## `debug/npcInspectTrigger.ts`

- `createNpcInspectTrigger` — function — line 21
- `NpcInspectTrigger` — type — line 15

## `debug/npcTrace.ts`

- `createNpcTraceBuffer` — function — line 114
- `NPC_TRACE_CAPACITY` — const — line 112
- `NpcTraceBuffer` — type — line 105
- `NpcTraceEvent` — type — line 14
- `NpcTraceEventType` — type — line 97

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

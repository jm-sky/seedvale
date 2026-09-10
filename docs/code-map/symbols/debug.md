# Symbols

Generated from exported TypeScript symbols.

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

## `debug/createModelTestScene.ts`

- `createModelTestScene` — function — line 44

## `debug/debugMode.ts`

- `DebugSystemName` — type — line 107
- `isAdminMode` — function — line 43
- `isBootMarkMode` — function — line 33
- `isCameraDebugMode` — function — line 56
- `isCameraMeshDebugMode` — function — line 69
- `isColliderDebugMode` — function — line 85
- `isDebugMode` — function — line 38
- `isModelTestMode` — function — line 50
- `isNoShadowsDebugMode` — function — line 63
- `isNpcCombatDebugMode` — function — line 99
- `isRenderStateDebugMode` — function — line 77
- `isSystemEnabled` — function — line 113
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

- `ConditionsDebugApi` — type — line 192
- `HiddenTreasureDebugApi` — type — line 164
- `HouseholdDebugHandle` — type — line 83
- `InjuryDebugApi` — type — line 200
- `installNpcDebugApi` — function — line 340
- `LocationsDebugApi` — type — line 115
- `NpcDebugHandle` — type — line 68
- `PlayerDebugApi` — type — line 207
- `SeedvaleDebugApi` — type — line 219
- `SettlementHistoryDebugHandle` — type — line 91
- `SkillsDebugApi` — type — line 182
- `TeleportToDebugApi` — type — line 127
- `VillageDebugHandle` — type — line 98
- `WorldLocationDebugEntry` — type — line 148
- `WorldLocationsDebugApi` — type — line 149

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
- `createPlayerGroundTraceBuffer` — function — line 177
- `detectPlayerGroundSnap` — function — line 157
- `emptyPlayerGroundTrace` — function — line 302
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
- `snapshotCaveGroundHit` — function — line 283
- `writeHitSnapshot` — function — line 291

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

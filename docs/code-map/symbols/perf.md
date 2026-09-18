# Symbols

Generated from exported TypeScript symbols.

## `perf/active.ts`

- `getMonitor` — function — line 12
- `setActiveMonitor` — function — line 8

## `perf/agentCpuDiag.ts`

- `AgentCpuDiag` — type — line 253
- `AgentCpuDiagTotals` — type — line 33
- `AgentCpuReport` — type — line 146
- `buildAgentCpuReport` — function — line 807
- `createAgentCpuDiag` — function — line 404
- `emptyAgentCpuDiagTotals` — function — line 325
- `formatAgentCpuReport` — function — line 964
- `getAgentCpuDiag` — function — line 803
- `setActiveAgentCpuDiag` — function — line 799

## `perf/benchmark.ts`

- `BenchmarkHost` — type — line 54
- `BenchmarkRunner` — type — line 42
- `createBenchmarkRunner` — function — line 136

## `perf/benchmarkFixture.ts`

- `BENCHMARK_FIXTURE` — const — line 25
- `BenchmarkFixture` — type — line 14

## `perf/benchmarkScenarios.ts`

- `BENCHMARK_SCENARIO_IDS` — const — line 1
- `BenchmarkScenarioId` — type — line 12

## `perf/detector.ts`

- `detectFrame` — function — line 76
- `DetectFrameInput` — type — line 15
- `primaryCategory` — function — line 97
- `rankSuspects` — function — line 45

## `perf/flags.ts`

- `benchmarkScenarioFromUrl` — function — line 78
- `DEFAULT_POINT_LIGHT_BUDGET` — const — line 40
- `isPerfUrlEnabled` — function — line 21
- `isProgramCensusUrlEnabled` — function — line 31
- `parseBenchmarkScenarioId` — function — line 71
- `parsePointLightBudgetFlag` — function — line 52
- `pointLightBudgetFromUrl` — function — line 65

## `perf/gpuTimer.ts`

- `createGpuTimer` — function — line 51
- `getGpuTimer` — function — line 131
- `GpuTimer` — type — line 11
- `setActiveGpuTimer` — function — line 127

## `perf/grassFinalizationDiag.ts`

- `buildGrassFinalizationReport` — function — line 335
- `createGrassFinalizationDiag` — function — line 217
- `formatGrassFinalizationReport` — function — line 401
- `getGrassFinalizationDiag` — function — line 325
- `GrassBucketStageSample` — type — line 114
- `GrassBuildSample` — type — line 123
- `GrassFinalizationDiag` — type — line 138
- `GrassFinalizationDiagTotals` — type — line 35
- `GrassFinalizationReport` — type — line 68
- `GrassFinalizationStageStats` — type — line 19
- `GrassSpeciesFinalizationStats` — type — line 25
- `readJsHeapUsedBytes` — function — line 329
- `setActiveGrassFinalizationDiag` — function — line 321

## `perf/heavySettlementScenario.ts`

- `HEAVY_SETTLEMENT_SEARCH_RADIUS` — const — line 16
  - domain: tools
- `HeavySettlementPeek` — type — line 32
- `HeavySettlementSelectFail` — type — line 29
- `HeavySettlementSelectOk` — type — line 28
- `HeavySettlementSelectResult` — type — line 30
- `scenarioSettlementFromDef` — function — line 105
- `selectHeavySettlement` — function — line 51
  - domain: tools
- `settlementResidentCount` — function — line 35

## `perf/isolationProbe.ts`

- `formatIsolationReport` — function — line 205
- `IsolationHost` — type — line 23
- `runIsolationProbes` — function — line 95

## `perf/log.ts`

- `createPerfLog` — function — line 29
- `PerfLog` — type — line 7

## `perf/longFrameFormat.ts`

- `formatLongFrameAttribution` — function — line 42
- `formatLongFrameRecord` — function — line 13

## `perf/monitor.ts`

- `createPerfMonitor` — function — line 169
- `FrameEndInput` — type — line 35
- `PerfMonitor` — type — line 77
- `SessionTotals` — type — line 53
- `withCategory` — function — line 501
- `withStage` — function — line 515

## `perf/percentile.ts`

- `copyAndSort` — function — line 16
- `percentile` — function — line 3

## `perf/programCensus.ts`

- `createProgramCensus` — function — line 372
- `formatProgramAttributionReport` — function — line 667
- `formatProgramCensusReport` — function — line 598
- `formatProgramCompileCostReport` — function — line 844
- `getProgramCensus` — function — line 904
- `ProgramCensus` — type — line 174
- `ProgramCensusAttachEvent` — type — line 16
- `ProgramCensusAttachKind` — type — line 13
- `ProgramCensusEvent` — type — line 130
- `ProgramCensusFamilyBreakdown` — type — line 137
- `ProgramCensusFirstUseEvent` — type — line 39
- `ProgramCensusFrameSnapshot` — type — line 112
- `ProgramCensusMaterialSnapshot` — type — line 120
- `ProgramCensusStageEvent` — type — line 29
- `ProgramCensusStageKind` — type — line 14
- `ProgramCensusSummary` — type — line 146
- `setActiveProgramCensus` — function — line 900
- `withProgramCensusStage` — function — line 885

## `perf/report.ts`

- `buildReport` — function — line 18
- `formatReport` — function — line 145

## `perf/sceneCensus.ts`

- `BucketStats` — type — line 20
- `censusScene` — function — line 239
- `censusSettlementShadowCasters` — function — line 271
  - domain: world-terrain
- `censusShadowCasters` — function — line 255
  - domain: world-terrain
- `censusTotals` — function — line 282
- `classifyObject` — function — line 175
- `classifySettlementContent` — function — line 163
  - domain: world-terrain
- `emptyCensus` — function — line 67
- `emptySettlementShadowCensus` — function — line 73
- `hideBuckets` — function — line 296
- `restoreVisibility` — function — line 309
- `SCENE_BUCKETS` — const — line 5
- `SceneBucket` — type — line 18
- `SceneCensus` — type — line 28
- `SETTLEMENT_CONTENT_KINDS` — const — line 32
- `SETTLEMENT_SHADOW_KIND_USERDATA` — const — line 59
- `SettlementContentKind` — type — line 54
- `SettlementShadowCensus` — type — line 56
- `VisibilityRestore` — type — line 61

## `perf/types.ts`

- `BudgetKind` — type — line 197
- `HitchEvent` — type — line 57
- `HitchReportRow` — type — line 147
- `IsolationProbeRow` — type — line 155
- `LONG_FRAME_MS` — const — line 69
- `LongFrameAttribution` — type — line 87
- `LongFrameRecord` — type — line 77
- `LongFrameStage` — type — line 71
- `PERF_CATEGORIES` — const — line 9
- `PERF_CATEGORY_COUNT` — const — line 26
- `PERF_CATEGORY_INDEX` — const — line 28
- `PERF_SEVERITY_RANK` — const — line 45
- `PerfAttribution` — type — line 227
- `PerfCategory` — type — line 24
- `PerfContext` — type — line 115
- `PerfDetection` — type — line 205
- `PerfFilter` — type — line 52
- `PerfLiveStats` — type — line 176
- `PerfLogEvent` — type — line 214
- `PerfReportJson` — type — line 233
- `PerfSeverity` — type — line 43
- `PerfSuspect` — type — line 199
- `ScenarioAnchor` — type — line 93
- `ScenarioRoute` — type — line 95
- `ScenarioSettlement` — type — line 104

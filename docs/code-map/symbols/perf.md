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

- `BenchmarkHost` — type — line 49
- `BenchmarkRunner` — type — line 37
- `createBenchmarkRunner` — function — line 124

## `perf/benchmarkFixture.ts`

- `BENCHMARK_FIXTURE` — const — line 25
- `BenchmarkFixture` — type — line 14

## `perf/benchmarkScenarios.ts`

- `BENCHMARK_SCENARIO_IDS` — const — line 1
- `BenchmarkScenarioId` — type — line 11

## `perf/detector.ts`

- `detectFrame` — function — line 76
- `DetectFrameInput` — type — line 15
- `primaryCategory` — function — line 97
- `rankSuspects` — function — line 45

## `perf/flags.ts`

- `benchmarkScenarioFromUrl` — function — line 69
- `DEFAULT_POINT_LIGHT_BUDGET` — const — line 38
- `isPerfUrlEnabled` — function — line 19
- `isProgramCensusUrlEnabled` — function — line 29
- `parsePointLightBudgetFlag` — function — line 50
- `pointLightBudgetFromUrl` — function — line 63

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
- `formatReport` — function — line 141

## `perf/sceneCensus.ts`

- `BucketStats` — type — line 20
- `censusScene` — function — line 86
- `censusTotals` — function — line 105
- `classifyObject` — function — line 42
- `emptyCensus` — function — line 36
- `hideBuckets` — function — line 119
- `restoreVisibility` — function — line 132
- `SCENE_BUCKETS` — const — line 5
- `SceneBucket` — type — line 18
- `SceneCensus` — type — line 28
- `VisibilityRestore` — type — line 30

## `perf/types.ts`

- `BudgetKind` — type — line 183
- `HitchEvent` — type — line 57
- `HitchReportRow` — type — line 133
- `IsolationProbeRow` — type — line 141
- `LONG_FRAME_MS` — const — line 69
- `LongFrameAttribution` — type — line 87
- `LongFrameRecord` — type — line 77
- `LongFrameStage` — type — line 71
- `PERF_CATEGORIES` — const — line 9
- `PERF_CATEGORY_COUNT` — const — line 26
- `PERF_CATEGORY_INDEX` — const — line 28
- `PERF_SEVERITY_RANK` — const — line 45
- `PerfAttribution` — type — line 213
- `PerfCategory` — type — line 24
- `PerfContext` — type — line 103
- `PerfDetection` — type — line 191
- `PerfFilter` — type — line 52
- `PerfLiveStats` — type — line 162
- `PerfLogEvent` — type — line 200
- `PerfReportJson` — type — line 219
- `PerfSeverity` — type — line 43
- `PerfSuspect` — type — line 185
- `ScenarioAnchor` — type — line 93
- `ScenarioRoute` — type — line 95

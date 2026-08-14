export const BENCHMARK_SCENARIO_IDS = [
  'current',
  'forest',
  'settlement',
  'water',
  'night',
  'stress',
] as const

export type BenchmarkScenarioId = (typeof BENCHMARK_SCENARIO_IDS)[number]

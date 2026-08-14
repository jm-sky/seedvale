export const BENCHMARK_SCENARIO_IDS = [
  'current',
  'forest',
  'settlement',
  'water',
  'night',
  'stress',
  'stream',
] as const

export type BenchmarkScenarioId = (typeof BENCHMARK_SCENARIO_IDS)[number]

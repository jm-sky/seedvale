import type { TreeEnvSample, TreeLifecycle } from './treeLifecycle'

/** Hooks settlements/NPCs use to participate in the living-forest system. */
export type SettlementForestHooks = {
  lifecycle: TreeLifecycle
  getWorldDays: () => number
  sampleEnv: (x: number, z: number) => TreeEnvSample
}

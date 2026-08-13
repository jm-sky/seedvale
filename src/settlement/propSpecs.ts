/** Leaf URL/size constants shared by settlement props and the asset index. */

export const TREE_SPECS = [
  { url: '/models/nature/tree_a.glb', height: 4.2 },
  { url: '/models/nature/tree_b.glb', height: 3.8 },
  { url: '/models/nature/tree_c.glb', height: 4.6 },
  { url: '/models/nature/birch_1.glb', height: 4.4 },
  { url: '/models/nature/maple_1.glb', height: 4.8 },
  { url: '/models/nature/deadtree_1.glb', height: 3.6 },
] as const

export const BUSH_SPECS = [
  { url: '/models/nature/bush_a.glb', height: 1.4 },
  { url: '/models/nature/bush_b.glb', height: 1.8 },
  { url: '/models/nature/flower_clump_1.glb', height: 0.4 },
  { url: '/models/nature/flower_clump_2.glb', height: 0.4 },
  { url: '/models/nature/bush_flowers_1.glb', height: 0.6 },
] as const

export const CACTUS_SPECS = [
  { url: '/models/nature/cactus_a.glb', height: 1.4 },
  { url: '/models/nature/cactus_b.glb', height: 2.0 },
] as const

export const REED_SPECS = [
  { url: '/models/nature/reed_a.glb', height: 1.1 },
] as const

export const DOCK_SPECS = [
  { url: '/models/settlement/dock_a.glb', height: 1.0 },
] as const

export const ROCK_SPECS = [
  { url: '/models/nature/rock_a.glb', height: 1.2 },
] as const

export const ROCK_CLUSTER_SPECS = [
  { url: '/models/nature/rock_cluster_a.glb', height: 0.9 },
] as const

export const FALLEN_LOG_SPECS = [
  { url: '/models/nature/fallen_log_a.glb', height: 0.55 },
] as const

export const RESOURCE_GOLD_SPECS = [
  { url: '/models/nature/resource_gold_1.glb', height: 1.1 },
] as const

export const RESOURCE_ROCK_SPECS = [
  { url: '/models/nature/resource_rock_1.glb', height: 1.1 },
] as const

export const FARM_URL = '/models/settlement/farm.glb'
/** Taller than a garden bed. Same GLB bytes as unused `garden.glb` — keep this
 *  modest so the wheat plot stays near `FOOD_PLOT_RADIUS` (6). */
export const FARM_HEIGHT = 1.6

export const CROPS_URL = '/models/settlement/crops.glb'
/** Longest-axis fit for one vegetable bed (~`createGarden` bed width 2.4). */
export const CROPS_FIT_MAX = 2.4

export const WALL_URL = '/models/settlement/wall.glb'
export const LANTERN_URL = '/models/settlement/lantern.glb'
export const VILLAGE_TORCH_URL = '/models/settlement/torch.glb'
export const FIRE_FX_URL = '/models/fx/fire.glb'
export const LANTERN_FLOOR_MAX = 0.28
export const LANTERN_WALL_MAX = 0.16
export const VILLAGE_TORCH_HEIGHT = 1.55

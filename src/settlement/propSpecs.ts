/** Leaf URL/size constants shared by settlement props and the asset index. */

/** Indices 6-8 are the pine variants (`PINE_SPECIES_INDICES`, `chunkVegetation.ts`)
 *  — appended, not interleaved, so existing `speciesIndex` values stay stable.
 *  Indices 9-12 are extra dead-tree silhouettes. */
export const TREE_SPECS = [
  { url: '/models/nature/tree_a.glb', height: 4.2 },
  { url: '/models/nature/tree_b.glb', height: 3.8 },
  { url: '/models/nature/tree_c.glb', height: 4.6 },
  { url: '/models/nature/birch_1.glb', height: 4.4 },
  { url: '/models/nature/maple_1.glb', height: 4.8 },
  { url: '/models/nature/deadtree_1.glb', height: 3.6 },
  { url: '/models/nature/pine_1.glb', height: 4.6 },
  { url: '/models/nature/pine_3.glb', height: 5.2 },
  { url: '/models/nature/pine_5.glb', height: 4.0 },
  /** Appended dead-tree silhouettes (USN) — indices stay after pines so
   *  `PINE_SPECIES_INDICES` 6–8 remain stable. */
  { url: '/models/nature/deadtree_3.glb', height: 3.5 },
  { url: '/models/nature/deadtree_5.glb', height: 3.8 },
  { url: '/models/nature/deadtree_8.glb', height: 3.4 },
  { url: '/models/nature/deadtree_10.glb', height: 3.7 },
] as const

/** Deciduous living trees for the fauna `thicket` (zagajnik) marker —
 *  `TREE_SPECS` 0–3. Deadtree/pines stay on the vegetation catalog only. */
export const THICKET_TREE_SPECS = [
  TREE_SPECS[0],
  TREE_SPECS[1],
  TREE_SPECS[2],
  TREE_SPECS[3],
] as const

export const BUSH_SPECS = [
  { url: '/models/nature/bush_a.glb', height: 1.4 },
  { url: '/models/nature/bush_b.glb', height: 1.8 },
  { url: '/models/nature/flower_clump_1.glb', height: 0.4 },
  { url: '/models/nature/flower_clump_2.glb', height: 0.4 },
  { url: '/models/nature/bush_flowers_1.glb', height: 0.6 },
  /** Extra shrub silhouettes — appended so meadow flower indices 2–4 stay put. */
  { url: '/models/nature/bush_c.glb', height: 1.5 },
  { url: '/models/nature/bush_berries_1.glb', height: 1.2 },
] as const

/** Forest-floor undergrowth (plan 140) — its own `VegetationKind`, not folded
 *  into `BUSH_SPECS` (which also seeds desert flower clumps). */
export const FERN_SPECS = [
  { url: '/models/nature/fern_a.glb', height: 0.4 },
] as const

export const CACTUS_SPECS = [
  { url: '/models/nature/cactus_a.glb', height: 1.4 },
  { url: '/models/nature/cactus_b.glb', height: 2.0 },
] as const

/** Index 1 is the denser cluster variant (plan world-terrain-010 Phase 5,
 *  `reed_cluster_a.glb` — a merged multi-stalk mesh, ~2.6 m authored height)
 *  — appended, not interleaved, so existing `speciesIndex` 0 stays a single
 *  reed. Both cast no shadow (`noShadow`, `chunkManager.ts`'s
 *  `getReedTemplates`) — a fraction of a shadow-map texel either way, and the
 *  cluster's authored bbox diagonal is well past `SMALL_MESH_SHADOW_THRESHOLD`. */
export const REED_SPECS = [
  { url: '/models/nature/reed_a.glb', height: 1.1 },
  { url: '/models/nature/reed_cluster_a.glb', height: 1.3 },
] as const

/** Shallow-water surface vegetation (plan world-terrain-010). Flat/wide, not
 *  tall — loaded with `preparePropFitMax` (longest-axis fit), not the height
 *  fit every other `*_SPECS` table here uses; `height` is reused as that
 *  fit-max target (pad diameter, not vertical height). */
export const LILY_SPECS = [
  { url: '/models/parked/Lilypad-01.glb', height: 0.55 },
] as const

/** Shallow coastal-ocean rooted vegetation (plan world-terrain-010 Phase 7)
 *  — its own `VegetationKind`, anchored to the seabed (`floorHeights`), not
 *  the water-surface-clamped `heights` every other vegetation kind uses (see
 *  `chunkManager.ts`'s `attachChunkContent`). Casts no shadow, same reasoning
 *  as `REED_SPECS`'s cluster variant. */
export const SEAWEED_SPECS = [
  { url: '/models/nature/seaweed_cluster_a.glb', height: 0.5 },
] as const

export const DOCK_SPECS = [
  { url: '/models/settlement/dock_a.glb', height: 1.0 },
] as const

export const ROCK_SPECS = [
  { url: '/models/nature/rock_a.glb', height: 1.2 },
  { url: '/models/nature/rock_b.glb', height: 1.1 },
  { url: '/models/nature/rock_c.glb', height: 1.0 },
  { url: '/models/nature/rock_d.glb', height: 1.15 },
  { url: '/models/nature/rock_e.glb', height: 1.05 },
] as const

export const ROCK_CLUSTER_SPECS = [
  { url: '/models/nature/rock_cluster_a.glb', height: 0.9 },
] as const

export const FALLEN_LOG_SPECS = [
  { url: '/models/nature/fallen_log_a.glb', height: 0.55 },
  { url: '/models/nature/fallen_log_b.glb', height: 0.5 },
  /** Last index is the mossy/wet variant — `chunkManager` prefers it near water. */
  { url: '/models/nature/fallen_log_moss.glb', height: 0.5 },
] as const

export const CEMETERY_SPECS = [
  { url: '/models/nature/cemetery.glb', height: 1.6 },
] as const

export const GRAVE_SPECS = [
  { url: '/models/nature/grave_a.glb', height: 0.95 },
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
/** Longest-axis fit for one vegetable bed (~`createGarden` bed width 4.8). */
export const CROPS_FIT_MAX = 4.8

export const WELL_URL = '/models/settlement/well.glb'
/** Roofed well — matches procedural `createWell` overall height (~roof y=2). */
export const WELL_HEIGHT = 2.0

export const ANIMAL_TROUGH_URL = '/models/settlement/animal_trough.glb'
/** Open basin height — matches procedural `createTroughVisual` (~0.28 m basin). */
export const ANIMAL_TROUGH_HEIGHT = 0.35

/** Bear trap GLB wired on the `good` trap tier only (`TrapDef.modelUrl`, M40). */
export const TRAP_GOOD_URL = '/models/world/bear_trap.glb'
export const TRAP_GOOD_FIT_MAX = 0.55

export const WOOD_PILE_URL = '/models/settlement/wood_pile.glb'
/** Quantity-driven primary stockpile — five alternative `Pile_*` variants. */
export const WOOD_PILE_PROGRESSIVE_URL = '/models/settlement/wood_pile_progressive.glb'
/** 1.5× the first drop-in height (0.9) so stacked beams read at village scale. */
export const WOOD_PILE_HEIGHT = 1.35
/** Player/NPC collision disk (issue 036). Wagon placement uses a larger 2.5 m
 *  keep-out; this is the visual bulk (~1.4 m logs), not that buffer. */
export const WOOD_PILE_COLLISION_RADIUS = 1.2
/** Village plaza pit (issue 036) — world remaining campfires use 0.5. */
export const VILLAGE_CAMPFIRE_COLLISION_RADIUS = 0.6

export const CAMPFIRE_UNLIT_URL = '/models/settlement/campfire_unlit.glb'
/** Longest-axis fit ≈ procedural stone-ring diameter (`createCampfire` radius 0.6 × 2). */
export const CAMPFIRE_FIT_MAX = 1.2

/** Procedural landmark GLBs (plan world-terrain-027). */
export const LANDMARK_BOAT_URL = '/models/parked/boat.glb'
export const LANDMARK_BOAT_FIT_MAX = 3.2
export const LANDMARK_SHIPWRECK_URL = '/models/world/shipwreck.glb'
export const LANDMARK_SHIPWRECK_FIT_MAX = 12
export const LANDMARK_TOWER_URL = '/models/world/tower_stone.glb'
export const LANDMARK_TOWER_FIT_MAX = 10
export const LANDMARK_OLD_TREE_URL = '/models/nature/old_tree.glb'
export const LANDMARK_OLD_TREE_FIT_MAX = 14
export const LANDMARK_WAGON_URL = '/models/settlement/megakit/wagon.glb'
export const LANDMARK_WAGON_FIT_MAX = 3.6

export const COBBLE_URL = '/models/nature/rock_path_round_wide.glb'
/** Longest-axis fit for one plaza cobble plate (plan 140) — a loose patch of
 *  utrwardzone ground near the well, not a road tile. */
export const COBBLE_FIT_MAX = 1.5

export const TREE_STUMP_URL = '/models/nature/tree_stump.glb'
/** Fit height matches procedural `createTreeStump` at scale 1 (trunk 0.45 +
 *  top disc 0.06, feet-to-crown ≈ 0.5). */
export const TREE_STUMP_HEIGHT = 0.5

export const WALL_URL = '/models/settlement/wall.glb'
export const LANTERN_URL = '/models/settlement/lantern.glb'
export const VILLAGE_TORCH_URL = '/models/settlement/torch.glb'
export const FIRE_FX_URL = '/models/fx/fire.glb'
export const LANTERN_FLOOR_MAX = 0.28
/** Longest-axis fit for a wall lantern (world metres). WIP: 0.45 still reads
 *  small in-game — see `createHouseLight` notes in `houseLighting.ts`. */
export const LANTERN_WALL_MAX = 0.45
export const VILLAGE_TORCH_HEIGHT = 1.55

/** Plan 169 house interior table lamp (Quaternius Furniture Pack, converted
 *  `FBX2glTF` → `gltfpack -cc`). Native longest axis ≈1.04 m (a floor/standing
 *  lamp shape, not a small table lamp) — `furnitureAudit.generated.json`.
 *  Fit down to a plausible small table-lamp height via `preparePropFitMax`,
 *  same technique/precedent as `LANTERN_FLOOR_MAX`/`LANTERN_WALL_MAX`. */
export const TABLE_LAMP_URL = '/models/settlement/furniture/lamp.glb'
export const TABLE_LAMP_FIT_MAX = 0.35

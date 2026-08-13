/** Logical map cell size in world units — independent of terrain chunk resolution. */
export const MAP_CELL_SIZE = 8

/** Exploration reveal radius around the player (world units). */
export const MAP_DISCOVERY_RADIUS = 48

/** Half-extent of the world-map canvas, centred on the origin. Outside this
 *  the map draws an unavailable fill instead of sampling more terrain. */
export const MAP_EXTENT_HALF = 4096

/** Minimap zoom is a multiplier on the existing `MINIMAP_SCALE` (1×–3×). */
export const MAP_MINIMAP_ZOOM_MIN = 1
export const MAP_MINIMAP_ZOOM_MAX = 3

/** World-map Canvas zoom: world units → CSS pixels. */
export const MAP_WORLD_ZOOM_MIN = 0.08
export const MAP_WORLD_ZOOM_MAX = 8
export const MAP_WORLD_ZOOM_DEFAULT = 1.25

/** Cap fillRect count on one world-map draw (per axis). Larger viewports skip cells. */
export const MAP_WORLD_MAX_CELLS_PER_AXIS = 128

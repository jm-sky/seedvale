import type { WorldLocationKind } from '../../world/locations/worldLocationTypes'
import type { MapBiomeKind, MapCellData, MapTerrainKind } from '../../world/map/mapTypes'

/** Fog / unknown terrain — do not reveal biome underneath. */
export const MAP_FOG_FILL = '#12161a'
export const MAP_UNAVAILABLE_FILL = '#0b0d10'

const TERRAIN_FILL: Record<MapTerrainKind, string> = {
  ocean: '#1a3d5c',
  inland_water: '#2a6a78',
  shore: '#d4c090',
  lowland: '#4f9a3e',
  highland: '#8a8070',
  mountain: '#6a6560',
}

const BIOME_FILL: Record<MapBiomeKind, string | null> = {
  none: null,
  forest: '#2d5c32',
  desert: '#dcc27a',
  swamp: '#3a4a2e',
  meadow: '#4f9a3e',
}

/** Stable per-slot colour (plan world-012 §13 "Każdy cel ma osobny
 *  kolor/slot") — index 0 unused, slots are 1-3 (`NavigationTargetEntry.slot`). */
export const TARGET_SLOT_COLORS: readonly string[] = ['', '#e0b34a', '#4ac8e0', '#e0578a']

export function targetSlotColor(slot: number): string {
  return TARGET_SLOT_COLORS[slot] ?? TARGET_SLOT_COLORS[1]!
}

/** Per-kind marker colour (world-012 map-markers follow-up) — shared by the
 *  canvas marker fill (`drawMap.ts`) and the DOM kind badge
 *  (`WorldMapScreen.vue`) so a kind reads the same colour everywhere on the
 *  map. Distinct from `TARGET_SLOT_COLORS`, which marks *navigation target*
 *  slot, not location kind — a target overrides this colour on the canvas. */
export const LOCATION_KIND_COLOR: Record<WorldLocationKind, string> = {
  settlement: '#e0b34a',
  cave: '#9b7fd4',
  cemetery: '#9a9a9a',
  lake: '#3f9fd1',
  mountainPeak: '#6f8f52',
}

/** Fallback for a marker whose kind can't be resolved from its id (should
 *  not happen for a real `WorldLocation`, see `worldLocationKindFromId`). */
export const LOCATION_KIND_COLOR_FALLBACK = '#e0b34a'

export function locationKindColor(kind: WorldLocationKind | null): string {
  return kind ? LOCATION_KIND_COLOR[kind] : LOCATION_KIND_COLOR_FALLBACK
}

/** Small glyph drawn on the canvas marker itself (plain text via
 *  `ctx.fillText`, not an `<img>`/SVG — canvas can't render the Lucide
 *  components used for the same kinds in `worldLocationDisplay.ts`). Native
 *  emoji colour gives markers a second, colour-independent cue (avoid
 *  relying on fill colour alone). */
export const LOCATION_KIND_EMOJI: Record<WorldLocationKind, string> = {
  settlement: '🏘️',
  cave: '🕳️',
  cemetery: '⚰️',
  lake: '💧',
  mountainPeak: '⛰️',
}

export function mapCellFillStyle(cell: MapCellData): string {
  if (cell.water) return TERRAIN_FILL[cell.terrain]
  if (cell.terrain === 'mountain') return TERRAIN_FILL.mountain
  if (cell.terrain === 'shore') return TERRAIN_FILL.shore
  return BIOME_FILL[cell.biome] ?? TERRAIN_FILL[cell.terrain]
}

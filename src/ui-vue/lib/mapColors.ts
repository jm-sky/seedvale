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

export function mapCellFillStyle(cell: MapCellData): string {
  if (cell.water) return TERRAIN_FILL[cell.terrain]
  if (cell.terrain === 'mountain') return TERRAIN_FILL.mountain
  if (cell.terrain === 'shore') return TERRAIN_FILL.shore
  return BIOME_FILL[cell.biome] ?? TERRAIN_FILL[cell.terrain]
}

export type MapCellKey = string

/** Coarse terrain class for map colouring — mapped from existing sample axes. */
export type MapTerrainKind =
  | 'ocean'
  | 'inland_water'
  | 'shore'
  | 'lowland'
  | 'highland'
  | 'mountain'

/** Dominant biome on land. `none` for water cells. */
export type MapBiomeKind = 'none' | 'forest' | 'desert' | 'swamp' | 'meadow'

export type MapCellData = {
  key: MapCellKey
  cx: number
  cz: number
  terrain: MapTerrainKind
  biome: MapBiomeKind
  water: boolean
}

/** Where a known location came from. v1 only produces `exploration`. */
export type MapSource = 'exploration' | 'npc' | 'book' | 'map'

/** Confidence of a known location. v1 only produces `confirmed`. */
export type MapConfidence = 'estimated' | 'discovered' | 'confirmed'

export type MapLocationKind = 'settlement' | 'landmark'

export type MapKnownLocation = {
  id: string
  kind: MapLocationKind
  x: number
  z: number
  state: MapConfidence
  source: MapSource
  label?: string
  description?: string
}

export type MapViewport = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** Sample every Nth cell (1 = full resolution). */
  lodStep?: number
}

export type MapSettlementLookup = (
  gx: number,
  gz: number,
) => { id: string, x: number, z: number, name: string } | null

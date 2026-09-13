import type { TreasureMapBearCaveBinding } from './treasureMapBearCave'

let activeBinding: TreasureMapBearCaveBinding | null = null

export function setActiveTreasureMapBearCaveBinding(binding: TreasureMapBearCaveBinding | null): void {
  activeBinding = binding
}

export function getActiveTreasureMapBearCaveBinding(): TreasureMapBearCaveBinding | null {
  return activeBinding
}

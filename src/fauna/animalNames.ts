export const HORSE_NAMES = [
  'Storm',
  'Ash',
  'Bramble',
  'Willow',
  'Flint',
  'Rowan',
  'Ember',
  'Hazel',
  'Shadow',
  'Clover',
  'Oak',
  'Mist',
] as const

/** FNV-1a string hash — same local-per-module idiom as `animalRoaming.ts`. */
function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic given name for a player-owned horse, derived from `animalId`. */
export function horseNameForAnimal(animalId: string): string {
  const index = hashString(animalId) % HORSE_NAMES.length
  return HORSE_NAMES[index]!
}

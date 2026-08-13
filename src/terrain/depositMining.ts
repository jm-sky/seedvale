import type { ItemKind } from '../items/items'

/** Visible ore piles streamed by `ResourceDeposits` (plan 090). */
export type MineableOre = 'coal' | 'gold' | 'iron'

export const ORE_ITEM: Record<MineableOre, ItemKind> = {
  coal: 'coal',
  gold: 'gold',
  iron: 'iron',
}

export const ORE_YIELD_LABEL: Record<MineableOre, string> = {
  coal: 'Węgiel',
  gold: 'Złoto',
  iron: 'Żelazo',
}

/** Real-time seconds for the player pickaxe channel (plan 090). */
export const MINE_DURATION_SEC = 1.6

export function isMineableOre(type: string): type is MineableOre {
  return type === 'coal' || type === 'gold' || type === 'iron'
}

/** 3–7 hits from deposit richness (0..1). */
export function hitsForRichness(richness: number): number {
  const t = Math.min(1, Math.max(0, richness))
  return 3 + Math.round(t * 4)
}

export function yieldForOre(type: MineableOre): { kind: ItemKind, count: number } {
  return { kind: ORE_ITEM[type], count: 1 }
}

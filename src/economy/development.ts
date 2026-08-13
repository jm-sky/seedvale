import type { StockAmount } from './stock'

export type DevelopmentStatus = 'complete' | 'reserved' | 'unmet'

export type DevelopmentDef = {
  id: string
  required: readonly StockAmount[]
}

/**
 * First concrete settlement-development step (plan 071 F): spend surplus wood
 * on a second, smaller pile beside the existing stockpile.
 */
export const WOODSHED_DEVELOPMENT: DevelopmentDef = {
  id: 'woodshed',
  required: [{ kind: 'wood', amount: 6 }],
}

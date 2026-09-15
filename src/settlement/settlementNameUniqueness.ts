import { cellsWithinRadius, type SettlementCell } from './settlementGenerator'

/** Bounded candidate retries before the cell-identity fallback (plan settlements-017). */
export const SETTLEMENT_NAME_ATTEMPT_LIMIT = 24

function chebyshevFromHome(cell: SettlementCell): number {
  return Math.max(Math.abs(cell.gx), Math.abs(cell.gz))
}

/**
 * Stable settlement-name order: Chebyshev ring from home, then `gx`, then `gz`.
 * Independent of stream / `settlementDefFor` lookup order.
 *
 * @domain settlements
 */
export function compareSettlementNameOrder(a: SettlementCell, b: SettlementCell): number {
  const distA = chebyshevFromHome(a)
  const distB = chebyshevFromHome(b)
  if (distA !== distB) return distA - distB
  if (a.gx !== b.gx) return a.gx - b.gx
  return a.gz - b.gz
}

/**
 * Cells that claim names before `cell` in {@link compareSettlementNameOrder}.
 * Finite for every cell: the disk out to its ring, excluding later same-ring cells.
 *
 * @domain settlements
 */
export function predecessorSettlementCells(cell: SettlementCell): SettlementCell[] {
  const radius = chebyshevFromHome(cell)
  return cellsWithinRadius({ gx: 0, gz: 0 }, radius)
    .filter((candidate) => compareSettlementNameOrder(candidate, cell) < 0)
    .sort(compareSettlementNameOrder)
}

/**
 * Last-resort unique name after the candidate pool is exhausted.
 *
 * @domain settlements
 */
export function fallbackSettlementName(attempt0Name: string, cell: SettlementCell): string {
  return `${attempt0Name} ${cell.gx}:${cell.gz}`
}

/**
 * Pick the first candidate not in `takenNames`, then the cell-identity fallback.
 * `candidate(0)` is the historical generator output for this cell.
 *
 * @domain settlements
 */
export function pickUniqueSettlementName(args: {
  takenNames: ReadonlySet<string>
  candidate: (attempt: number) => string
  fallback: string
  maxAttempts?: number
}): string {
  const maxAttempts = args.maxAttempts ?? SETTLEMENT_NAME_ATTEMPT_LIMIT
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const name = args.candidate(attempt)
    if (!args.takenNames.has(name)) return name
  }
  if (!args.takenNames.has(args.fallback)) return args.fallback
  let suffix = 2
  let disambiguated = `${args.fallback}~${suffix}`
  while (args.takenNames.has(disambiguated)) {
    suffix += 1
    disambiguated = `${args.fallback}~${suffix}`
  }
  return disambiguated
}

/** Hysteresis for N8AO auto-budget (plan 113 P0).
 *  Heavy frames (settlement / night in review 012) suppress AO; light frames
 *  restore it. The gap avoids flicker around the threshold. */
export const AO_SUPPRESS_MS = 15
export const AO_RESTORE_MS = 10

export function shouldSuppressAo(prevSuppressed: boolean, renderMs: number): boolean {
  if (renderMs >= AO_SUPPRESS_MS) return true
  if (renderMs <= AO_RESTORE_MS) return false
  return prevSuppressed
}

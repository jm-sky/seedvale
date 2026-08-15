/** Hysteresis for N8AO auto-budget (plan 113 P0).
 *  Heavy frames (settlement / night in review 012) suppress AO; light frames
 *  restore it. The gap avoids flicker around the threshold. */
export const AO_SUPPRESS_MS = 15
export const AO_RESTORE_MS = 10
// Toggling the AO pass itself changes render cost by more than the 5ms
// suppress/restore gap (review 017): AO-off frames can measure below
// AO_RESTORE_MS while AO-on frames measure above AO_SUPPRESS_MS, so a
// threshold check alone can flip every single frame once triggered — read
// as the whole screen's shading changing every frame, not a one-shot
// suppress. This floor blocks a second flip until the previous one has held
// for a minimum stretch, so a transient heavy frame produces at most one
// visible change, not a sustained flicker.
export const AO_MIN_STABLE_MS = 250

export function shouldSuppressAo(
  prevSuppressed: boolean,
  renderMs: number,
  msSinceLastChange: number,
): boolean {
  if (msSinceLastChange < AO_MIN_STABLE_MS) return prevSuppressed
  if (renderMs >= AO_SUPPRESS_MS) return true
  if (renderMs <= AO_RESTORE_MS) return false
  return prevSuppressed
}

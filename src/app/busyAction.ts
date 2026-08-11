export type BusyTickResult = {
  label: string
  /** True on the exact frame the busy period completes — caller's cue to hide
   *  the overlay and run the deferred completion callback. */
  justFinished: boolean
}

export type BusyAction = {
  isActive: () => boolean
  /** No-op if already busy. `onComplete` runs once when the timer elapses
   *  (from `tick`), not on cancel. */
  start: (durationSec: number, label: string, onComplete: () => void) => void
  /** Call once per frame. Returns null when idle. */
  tick: (dt: number) => BusyTickResult | null
  /** Aborts without running `onComplete` — for app teardown. */
  cancel: () => void
}

/** Short timed "channel" (dig, level, …) that blocks player input via
 *  `activeModal(..., busy)` without advancing day/night like `timeSkip`. */
export function createBusyAction(): BusyAction {
  let active: { remainingSec: number, label: string, onComplete: () => void } | null = null

  return {
    isActive: () => active !== null,
    start(durationSec, label, onComplete) {
      if (active) return
      active = { remainingSec: durationSec, label, onComplete }
    },
    tick(dt) {
      if (!active) return null
      active.remainingSec -= dt
      const { label, onComplete } = active
      if (active.remainingSec > 0) return { label, justFinished: false }
      active = null
      onComplete()
      return { label, justFinished: true }
    },
    cancel() {
      active = null
    },
  }
}

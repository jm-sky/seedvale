export type BusyTickResult = {
  label: string
  /** True on the exact frame the busy period completes — caller's cue to hide
   *  the overlay and run the deferred completion callback. */
  justFinished: boolean
  /** Vision blur+desaturate, same visual as `rest` — opt-in per action. */
  blurred: boolean
}

export type BusyStartOptions = {
  /** Vision blur+desaturate for the overlay, same look `rest` uses — for
   *  actions long enough to warrant it (fire-lighting, cooking, butchering). */
  blurred?: boolean
}

export type BusyAction = {
  isActive: () => boolean
  /** No-op if already busy. `onComplete` runs once when the timer elapses
   *  (from `tick`), not on cancel. */
  start: (durationSec: number, label: string, onComplete: () => void, options?: BusyStartOptions) => void
  /** Call once per frame. Returns null when idle. */
  tick: (dt: number) => BusyTickResult | null
  /** Aborts without running `onComplete` — for app teardown / player cancel. */
  cancel: () => void
}

/** Short timed "channel" (dig, level, …) that blocks player input via
 *  `activeModal(..., busy)` without advancing day/night like `timeSkip`. */
export function createBusyAction(): BusyAction {
  let active: { remainingSec: number, label: string, onComplete: () => void, blurred: boolean } | null = null

  return {
    isActive: () => active !== null,
    start(durationSec, label, onComplete, options) {
      if (active) return
      active = { remainingSec: durationSec, label, onComplete, blurred: options?.blurred ?? false }
    },
    tick(dt) {
      if (!active) return null
      active.remainingSec -= dt
      const { label, onComplete, blurred } = active
      if (active.remainingSec > 0) return { label, justFinished: false, blurred }
      active = null
      onComplete()
      return { label, justFinished: true, blurred }
    },
    cancel() {
      active = null
    },
  }
}

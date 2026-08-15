export type BusyTickResult = {
  label: string
  /** True on the exact frame the busy period completes — caller's cue to hide
   *  the overlay and run the deferred completion callback. */
  justFinished: boolean
  /** Vision blur+desaturate, same visual as `rest` — opt-in per action. */
  blurred: boolean
  /** 0 at start → 1 when finished. Overlay progress bar. */
  progress: number
}

export type BusyStartOptions = {
  /** Vision blur+desaturate for the overlay, same look `rest` uses — for
   *  actions long enough to warrant it (fire-lighting, cooking, butchering). */
  blurred?: boolean
  /** Runs on `cancel()` only — never on a successful complete. Used to
   *  release holds (e.g. a corpse pinned for harvest). */
  onCancel?: () => void
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

type ActiveBusy = {
  remainingSec: number
  durationSec: number
  label: string
  onComplete: () => void
  onCancel: (() => void) | null
  blurred: boolean
}

function progressOf(active: ActiveBusy): number {
  if (active.durationSec <= 0) return 1
  return Math.min(1, Math.max(0, 1 - active.remainingSec / active.durationSec))
}

/** Short timed "channel" (dig, level, …) that blocks player input via
 *  `activeModal(..., busy)` without advancing day/night like `timeSkip`. */
export function createBusyAction(): BusyAction {
  let active: ActiveBusy | null = null

  return {
    isActive: () => active !== null,
    start(durationSec, label, onComplete, options) {
      if (active) return
      active = {
        remainingSec: durationSec,
        durationSec,
        label,
        onComplete,
        onCancel: options?.onCancel ?? null,
        blurred: options?.blurred ?? false,
      }
    },
    tick(dt) {
      if (!active) return null
      active.remainingSec -= dt
      const { label, onComplete, blurred } = active
      if (active.remainingSec > 0) {
        return { label, justFinished: false, blurred, progress: progressOf(active) }
      }
      const finished = { label, justFinished: true, blurred, progress: 1 }
      active = null
      onComplete()
      return finished
    },
    cancel() {
      if (!active) return
      const onCancel = active.onCancel
      active = null
      onCancel?.()
    },
  }
}

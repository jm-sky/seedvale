import type { DayNightState } from './dayNight'
import { gameHoursToRealSeconds } from './timeConversion'

/** Real seconds held per skipped game-hour — 1h skip ≈ 1s, 8h skip ≈ 8s. */
const SECONDS_PER_SKIPPED_HOUR = 1

/** Overlay filter intensity: `0` = label only, `0.5` = wait, `1` = rest. */
export type TimeSkipFadeStrength = 0 | 0.5 | 1

export type TimeSkipTickResult = {
  label: string
  fadeStrength: TimeSkipFadeStrength
  /** True on the exact frame the skip completes — the caller's cue to hide
   *  the overlay (see `createTimeSkipOverlay.ts`). */
  justFinished: boolean
  /** Total hours this skip advances the clock by. Combined with
   *  `startTimeOfDay`, lets a `justFinished` caller (`SettlementsManager.
   *  resolveTimeSkip`) replay the skipped period for NPC needs/stamina/
   *  position catch-up (`docs/plans/archive/2026-08-12--075...`). */
  hours: number
  /** `dayNight.timeOfDay` (0-1) at the moment this skip started. */
  startTimeOfDay: number
}

export type TimeSkip = {
  isActive: () => boolean
  /** No-op if a skip is already in progress. `fadeStrength` picks the visual
   *  filter intensity (`app/createApp.ts` wires this to
   *  `createTimeSkipOverlay`) — the underlying mechanism is identical. */
  start: (hours: number, opts: { fadeStrength: TimeSkipFadeStrength, label: string }) => void
  /** Call once per frame regardless of any modal/pause state — this is what
   *  keeps `dayNight.timeMultiplier` boosted while the skip runs. Returns
   *  null when no skip is active. */
  tick: (dt: number) => TimeSkipTickResult | null
  /** Overlay intensity of the in-flight skip, or `null` when idle. Rest
   *  uses `1`; wait uses `0.5`. */
  fadeStrength: () => TimeSkipFadeStrength | null
  /** Elapsed fraction of the in-flight skip (`0`–`1`), or `null` when idle. */
  progress: () => number | null
  /** Restores `timeMultiplier` immediately without finishing normally — for
   *  app teardown mid-skip. */
  cancel: () => void
}

/**
 * A "wait N hours" / "rest N hours" mechanism shared by both Quick Actions
 * flavors (`createQuickActions.ts`) — advances the clock by temporarily
 * boosting `dayNight.timeMultiplier` for `hours * SECONDS_PER_SKIPPED_HOUR`
 * real seconds, then restoring it. This module only ever touches the clock
 * itself; it does not scale anyone else's `dt`. `gameLoop.ts` is the one
 * that decides what each system does with `dayNight.timeMultiplier` while a
 * skip is active — today that's: NPC/fauna/traps are not ticked at all
 * (fully frozen, not merely slowed or sped up — see the `worldDt`/gating
 * comment in `gameLoop.ts`'s `tick()`), while player needs keep live-ticking
 * through a scaled `worldDt` (plan 165 §5). `hours`/`startTimeOfDay` on the
 * `justFinished` result let the caller replay the skipped period afterward
 * instead — see `NpcAgent.resolveTimeSkip` / `SettlementsManager.
 * resolveTimeSkip` / `Fauna.resolveTimeSkip`
 * (`docs/plans/archive/2026-08-12--075--time-skip-npc-catchup.md`,
 * `docs/plans/2026-08-22--196--arch--time-skip-simulation-semantics.md`),
 * which apply each system's needs/stamina/position/corpse-lifecycle effect
 * for that period exactly once, deterministically, instead of a live
 * per-frame tick. `app/createApp.ts` is responsible for blocking player
 * input while active and for not gating this out of the per-frame
 * world-update block (the clock needs to keep ticking).
 */
export function createTimeSkip(dayNight: DayNightState): TimeSkip {
  let active: {
    remainingSec: number
    previousMultiplier: number
    fadeStrength: TimeSkipFadeStrength
    label: string
    hours: number
    startTimeOfDay: number
  } | null = null

  return {
    isActive: () => active !== null,
    fadeStrength: () => active?.fadeStrength ?? null,
    progress: () => {
      if (!active) return null
      const total = active.hours * SECONDS_PER_SKIPPED_HOUR
      if (total <= 0) return null
      return 1 - active.remainingSec / total
    },
    start(hours, opts) {
      if (active) return
      active = {
        remainingSec: hours * SECONDS_PER_SKIPPED_HOUR,
        previousMultiplier: dayNight.timeMultiplier,
        fadeStrength: opts.fadeStrength,
        label: opts.label,
        hours,
        startTimeOfDay: dayNight.timeOfDay,
      }
      dayNight.timeMultiplier = gameHoursToRealSeconds(1, dayNight.dayLengthSec) / SECONDS_PER_SKIPPED_HOUR
    },
    tick(dt) {
      if (!active) return null
      active.remainingSec -= dt
      const { label, fadeStrength, hours, startTimeOfDay } = active
      if (active.remainingSec > 0) {
        return { label, fadeStrength, justFinished: false, hours, startTimeOfDay }
      }
      dayNight.timeMultiplier = active.previousMultiplier
      active = null
      return { label, fadeStrength, justFinished: true, hours, startTimeOfDay }
    },
    cancel() {
      if (!active) return
      dayNight.timeMultiplier = active.previousMultiplier
      active = null
    },
  }
}

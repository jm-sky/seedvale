import type { Role, Trait } from './characters'

/**
 * Schedule Template (`docs/plans/2026-08-07--020--npc-2-daily-routine-and-place.md`,
 * overlays: `docs/plans/2026-08-11--060--npc-schedule-actions-and-trait-overlays.md`)
 *
 * Per-role daily plan. `NpcAgent` stores the **effective** per-NPC schedule
 * (`effectiveScheduleFor` of this template + traits) and consumes it at
 * `choose`: `sleep` → `goSleep`, `work` → workplace action, `eat` → garden
 * eat action, `home`/`wake`/`social` → stay near home (social place is not
 * generated yet, so `social` falls back to home). Needs (`pickNeed`) win
 * over the schedule at the decision point.
 *
 * Role templates below are the global base. Trait overlays never mutate them.
 */
export type ScheduleActivity = 'eat' | 'home' | 'sleep' | 'social' | 'wake' | 'work'

export type ScheduleEntry = {
  /** 24h clock hour, 0-23.99 — may be given out of chronological order
   *  within a template (e.g. `guard`'s night shift wraps past midnight);
   *  `activityAt` resolves it cyclically regardless of array order. */
  hour: number
  activity: ScheduleActivity
}

export type ScheduleTemplate = readonly ScheduleEntry[]

/** Inputs that are not traits but still affect the pure overlay. */
export type EffectiveScheduleOptions = {
  /**
   * When true, `sociable` may replace the start of a `home` block with
   * `social`. Current settlements have no social Place, so runtime passes
   * false and `sociable` leaves `home` unchanged.
   */
  hasSocialPlace?: boolean
}

/** `night_owl`: shift every entry later by this many hours (modulo 24). */
export const NIGHT_OWL_SHIFT_HOURS = 2

/**
 * `fast_worker` schedule overlay (distinct from `FAST_WORKER_WAIT_MULT` in
 * `NpcAgent`, which only speeds per-action waits). Delay a `home` that
 * follows `work` so the work block runs this many hours longer.
 */
export const FAST_WORKER_WORK_EXTEND_HOURS = 1

/**
 * `sociable` + available social place: the first this-many hours of a `home`
 * block become `social`. Shorter home blocks convert entirely to `social`.
 */
export const SOCIABLE_SOCIAL_HOURS = 2

/** Overlay application order — fixed so multi-trait results are deterministic. */
const OVERLAY_ORDER = ['fast_worker', 'night_owl', 'sociable'] as const

const HOUR_EPS = 1e-6

/** `timeOfDay` unit used by `world/dayNight.ts` — 0 = midnight, 0.5 = noon. */
export function hourToTimeOfDay(hour: number): number {
  return hourMod24(hour) / 24
}

export function hourMod24(hour: number): number {
  return ((hour % 24) + 24) % 24
}

export const SCHEDULE_TEMPLATES: Record<Role, ScheduleTemplate> = {
  woodcutter: [
    { hour: 6, activity: 'wake' },
    { hour: 7, activity: 'work' },
    { hour: 12, activity: 'eat' },
    { hour: 13, activity: 'work' },
    { hour: 18, activity: 'home' },
    { hour: 22, activity: 'sleep' },
  ],
  farmer: [
    { hour: 6, activity: 'wake' },
    { hour: 7, activity: 'work' },
    { hour: 12, activity: 'eat' },
    { hour: 13, activity: 'work' },
    { hour: 18, activity: 'home' },
    { hour: 22, activity: 'sleep' },
  ],
  miner: [
    { hour: 5.5, activity: 'wake' },
    { hour: 6.5, activity: 'work' },
    { hour: 12, activity: 'eat' },
    { hour: 13, activity: 'work' },
    { hour: 19, activity: 'home' },
    { hour: 22.5, activity: 'sleep' },
  ],
  fisher: [
    { hour: 5, activity: 'wake' },
    { hour: 6, activity: 'work' },
    { hour: 12, activity: 'eat' },
    { hour: 13, activity: 'work' },
    { hour: 18, activity: 'home' },
    { hour: 21.5, activity: 'sleep' },
  ],
  /** Stall hours are longer than other roles: short evening at home, same
   *  1 h midday meal and 8 h sleep. `night_owl` (Kasia) still shifts +2 h. */
  trader: [
    { hour: 7, activity: 'wake' },
    { hour: 8, activity: 'work' },
    { hour: 13, activity: 'eat' },
    { hour: 14, activity: 'work' },
    { hour: 21, activity: 'home' },
    { hour: 23, activity: 'sleep' },
  ],
  /** Night watch — `wake`/`work` land in the evening, `eat`/`work` past
   *  midnight, `home`/`sleep` in the morning. Individual `night_owl` guards
   *  still get the trait overlay on top of this base shift. */
  guard: [
    { hour: 17, activity: 'wake' },
    { hour: 18, activity: 'work' },
    { hour: 0, activity: 'eat' },
    { hour: 1, activity: 'work' },
    { hour: 6, activity: 'home' },
    { hour: 8, activity: 'sleep' },
  ],
}

/**
 * Derive the per-NPC schedule from a role template + traits.
 * Pure data: no NPC/Place/Three.js. Never mutates `template`.
 *
 * Overlay order: `fast_worker` (longer work, shorter home) → `night_owl`
 * (uniform +2h shift) → `sociable` (home→social when a social place exists).
 * `energetic` does not change the schedule.
 */
export function effectiveScheduleFor(
  template: ScheduleTemplate,
  traits: readonly Trait[],
  options: EffectiveScheduleOptions = {},
): ScheduleTemplate {
  let entries: ScheduleEntry[] = template.map((entry) => ({ ...entry }))
  const has = (trait: Trait) => traits.includes(trait)

  for (const overlay of OVERLAY_ORDER) {
    if (overlay === 'fast_worker' && has('fast_worker')) {
      entries = applyFastWorker(entries)
    } else if (overlay === 'night_owl' && has('night_owl')) {
      entries = applyNightOwl(entries)
    } else if (overlay === 'sociable' && has('sociable')) {
      entries = applySociable(entries, options.hasSocialPlace === true)
    }
  }
  return entries
}

/**
 * Idle-path intent for a scheduled activity after `pickNeed()` returned idle.
 * `wake` is a decision boundary, not an action — it stays at home.
 */
export function idleIntentFor(
  activity: ScheduleActivity,
): Exclude<ScheduleActivity, 'wake'> {
  if (activity === 'wake') return 'home'
  return activity
}

function applyNightOwl(entries: ScheduleEntry[]): ScheduleEntry[] {
  return entries.map((entry) => ({
    hour: hourMod24(entry.hour + NIGHT_OWL_SHIFT_HOURS),
    activity: entry.activity,
  }))
}

function applyFastWorker(entries: ScheduleEntry[]): ScheduleEntry[] {
  const result = entries.map((entry) => ({ ...entry }))
  for (const entry of result) {
    if (entry.activity !== 'home') continue
    const prev = previousEntryCyclic(result, entry)
    if (prev?.activity !== 'work') continue
    const next = nextEntryCyclic(result, entry)
    if (!next) continue
    const duration = cyclicHoursBetween(entry.hour, next.hour)
    if (duration <= FAST_WORKER_WORK_EXTEND_HOURS) continue
    const delayed = hourMod24(entry.hour + FAST_WORKER_WORK_EXTEND_HOURS)
    if (result.some((other) => other !== entry && hoursClose(other.hour, delayed))) continue
    entry.hour = delayed
  }
  return result
}

function applySociable(entries: ScheduleEntry[], hasSocialPlace: boolean): ScheduleEntry[] {
  if (!hasSocialPlace) return entries
  const result: ScheduleEntry[] = []
  for (const entry of entries) {
    if (entry.activity !== 'home') {
      result.push({ ...entry })
      continue
    }
    const next = nextEntryCyclic(entries, entry)
    const duration = next ? cyclicHoursBetween(entry.hour, next.hour) : 24
    result.push({ hour: entry.hour, activity: 'social' })
    if (duration > SOCIABLE_SOCIAL_HOURS + HOUR_EPS) {
      const homeHour = hourMod24(entry.hour + SOCIABLE_SOCIAL_HOURS)
      const collision =
        result.some((other) => hoursClose(other.hour, homeHour))
        || entries.some((other) => other !== entry && hoursClose(other.hour, homeHour))
      if (!collision) {
        result.push({ hour: homeHour, activity: 'home' })
      }
    }
  }
  return result
}

function cyclicHoursBetween(fromHour: number, toHour: number): number {
  return hourMod24(toHour - fromHour)
}

function hoursClose(a: number, b: number): boolean {
  const delta = Math.min(cyclicHoursBetween(a, b), cyclicHoursBetween(b, a))
  return delta < HOUR_EPS
}

function nextEntryCyclic(
  entries: readonly ScheduleEntry[],
  from: ScheduleEntry,
): ScheduleEntry | null {
  let best: ScheduleEntry | null = null
  let bestUntil = Infinity
  const startTod = hourToTimeOfDay(from.hour)
  for (const entry of entries) {
    if (entry === from) continue
    const until = ((hourToTimeOfDay(entry.hour) - startTod) + 1) % 1
    if (until > HOUR_EPS / 24 && until < bestUntil) {
      bestUntil = until
      best = entry
    }
  }
  return best
}

function previousEntryCyclic(
  entries: readonly ScheduleEntry[],
  from: ScheduleEntry,
): ScheduleEntry | null {
  let best: ScheduleEntry | null = null
  let bestElapsed = Infinity
  const startTod = hourToTimeOfDay(from.hour)
  for (const entry of entries) {
    if (entry === from) continue
    const elapsed = ((startTod - hourToTimeOfDay(entry.hour)) + 1) % 1
    if (elapsed > HOUR_EPS / 24 && elapsed < bestElapsed) {
      bestElapsed = elapsed
      best = entry
    }
  }
  return best
}

/** The schedule entry active at `timeOfDay` (0-1, `dayNight.ts` convention) —
 *  the entry whose start has most recently passed, wrapping cyclically at
 *  midnight regardless of the template array's own order. */
export function activityAt(template: ScheduleTemplate, timeOfDay: number): ScheduleActivity {
  let best: ScheduleEntry | null = null
  let bestElapsed = Infinity
  for (const entry of template) {
    const startTod = hourToTimeOfDay(entry.hour)
    const elapsed = ((timeOfDay - startTod) + 1) % 1
    if (elapsed < bestElapsed) {
      bestElapsed = elapsed
      best = entry
    }
  }
  return best?.activity ?? 'home'
}

/** The schedule entry that starts next after `timeOfDay` — the complement of
 *  `activityAt` (which looks backward to "what most recently started"), used
 *  for "...until HH:MM" dialogue lines (`docs/plans/2026-08-09--048...`).
 *  Wraps cyclically at midnight regardless of the template array's own
 *  order, same as `activityAt`. `null` only for an empty template. */
export function nextBoundary(template: ScheduleTemplate, timeOfDay: number): ScheduleEntry | null {
  let best: ScheduleEntry | null = null
  let bestUntil = Infinity
  for (const entry of template) {
    const startTod = hourToTimeOfDay(entry.hour)
    const until = ((startTod - timeOfDay) + 1) % 1
    if (until < bestUntil) {
      bestUntil = until
      best = entry
    }
  }
  return best
}

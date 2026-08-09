import type { Role } from './characters'

/**
 * Schedule Template v1 (`docs/plans/2026-08-07--020--npc-2-daily-routine-and-place.md`,
 * "v2 stage 1" 2026-08-09 decision) — a per-role daily plan, data only. No
 * `NpcAgent` behavior reads this yet; wiring it into the phase FSM
 * (`goWell`/`goGarden`/`goTree`/`goStock` → a generic `goTo`/`execute`) is a
 * deliberately separate follow-up step. Traits (`night_owl`/`hardworking`/
 * `sociable`) modifying the template per-NPC are also deferred — v1 is one
 * uniform template per role.
 */
export type ScheduleActivity = 'eat' | 'home' | 'sleep' | 'wake' | 'work'

export type ScheduleEntry = {
  /** 24h clock hour, 0-23.99 — may be given out of chronological order
   *  within a template (e.g. `guard`'s night shift wraps past midnight);
   *  `activityAt` resolves it cyclically regardless of array order. */
  hour: number
  activity: ScheduleActivity
}

export type ScheduleTemplate = readonly ScheduleEntry[]

/** `timeOfDay` unit used by `world/dayNight.ts` — 0 = midnight, 0.5 = noon. */
export function hourToTimeOfDay(hour: number): number {
  return ((hour % 24) + 24) % 24 / 24
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
  trader: [
    { hour: 7, activity: 'wake' },
    { hour: 8, activity: 'work' },
    { hour: 13, activity: 'eat' },
    { hour: 14, activity: 'work' },
    { hour: 19, activity: 'home' },
    { hour: 23, activity: 'sleep' },
  ],
  /** Night watch — `wake`/`work` land in the evening, `eat`/`work` past
   *  midnight, `home`/`sleep` in the morning. Not a trait modifier (that's
   *  deliberately deferred); guards just keep a different base shift. */
  guard: [
    { hour: 17, activity: 'wake' },
    { hour: 18, activity: 'work' },
    { hour: 0, activity: 'eat' },
    { hour: 1, activity: 'work' },
    { hour: 6, activity: 'home' },
    { hour: 8, activity: 'sleep' },
  ],
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

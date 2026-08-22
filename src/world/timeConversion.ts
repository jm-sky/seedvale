/**
 * Stateless real-time ⇄ game-time conversions, parameterized by
 * `dayLengthSec` (real seconds for a full day/night cycle at
 * `timeMultiplier = 1` — `DayNightState.dayLengthSec`, `world/dayNight.ts`).
 *
 * `dayNight.ts` stays the sole owner of World Time (`elapsedDays`/
 * `timeOfDay`); this module only converts durations between real-seconds,
 * game-hours and game-days — it holds no clock state of its own. Callers
 * that only need this ratio should take `dayLengthSec: number`, not the
 * whole `DayNightState`.
 */

export const GAME_HOURS_PER_DAY = 24

export function gameHoursToGameDays(gameHours: number): number {
  return gameHours / GAME_HOURS_PER_DAY
}

export function gameDaysToGameHours(gameDays: number): number {
  return gameDays * GAME_HOURS_PER_DAY
}

export function realSecondsToGameDays(realSeconds: number, dayLengthSec: number): number {
  return realSeconds / dayLengthSec
}

export function gameDaysToRealSeconds(gameDays: number, dayLengthSec: number): number {
  return gameDays * dayLengthSec
}

export function realSecondsToGameHours(realSeconds: number, dayLengthSec: number): number {
  return gameDaysToGameHours(realSecondsToGameDays(realSeconds, dayLengthSec))
}

export function gameHoursToRealSeconds(gameHours: number, dayLengthSec: number): number {
  return gameDaysToRealSeconds(gameHoursToGameDays(gameHours), dayLengthSec)
}

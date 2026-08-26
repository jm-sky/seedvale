import { healHealth, type HealthState } from '../shared/HealthState'
import { createHungerState, drainHunger, type HungerState, isStarving, restoreHunger } from '../shared/HungerState'
import { createStaminaState, drainStamina, restoreStamina, type StaminaState } from '../shared/StaminaState'
import { createThirstState, drainThirst, isDehydrated, restoreThirst, type ThirstState } from '../shared/ThirstState'
import { createVigorState, drainVigor, type VigorState } from '../shared/VigorState'
import { gameDaysToRealSeconds } from '../world/timeConversion'

/** Plan 106 — the player's four survival pools. `stamina`/`vigor` reuse the
 *  existing NPC/fauna `shared/*State` shape verbatim; `hunger`/`thirst` are
 *  new pools of the same `{max, current}` family (see `HungerState.ts`'s doc
 *  comment for why they aren't the 0-1 "urge" shape NPC `Needs.ts`/fauna
 *  `AnimalLife.ts` use — those track *when to act*, this tracks *a bar the
 *  player watches and refills by eating/drinking real items*).
 *
 *  `starvationDuration`/`dehydrationDuration` (plan 165) are simulation-time
 *  counters, not UI state: how long Hunger/Thirst has continuously sat at or
 *  below its critical threshold (`isStarving`/`isDehydrated`). They gate the
 *  capability penalty and eventual HP loss in `tickPlayerNeeds` below and
 *  reset to 0 the moment the pool climbs back above critical — including via
 *  `eatFood`/`drinkWater`, since those raise `hunger.current`/`thirst.current`
 *  directly and the very next tick observes the pool is no longer critical. */
export type PlayerNeeds = {
  stamina: StaminaState
  vigor: VigorState
  hunger: HungerState
  thirst: ThirstState
  starvationDuration: number
  dehydrationDuration: number
}

export const PLAYER_MAX_STAMINA = 100
export const PLAYER_MAX_VIGOR = 100
export const PLAYER_MAX_HUNGER = 100
export const PLAYER_MAX_THIRST = 100

/** Game-time tuning (plan 106/165) — expressed as an amount over a number of
 *  *game-days*, not a raw per-second rate, so the drain still empties the
 *  pool in the same number of game-days regardless of the world's current
 *  `dayLengthSec` (plan 192). `ratePerSecond` below converts against the
 *  live `dayLengthSec` passed into each tick function. Hunger empties over
 *  ~3 game days, thirst over ~2.5 (thirst always outpaces hunger). */
const HUNGER_EMPTY_GAME_DAYS = 3
const THIRST_EMPTY_GAME_DAYS = 2.5

/** Vigor passive drain while idle/resting (plan 165 §1) — `-1 point` per
 *  game day, so a standing-still PC no longer visibly loses Vigor within
 *  seconds. */
const VIGOR_IDLE_DRAIN_PER_GAME_DAY = 1

/** Extra Vigor drain on top of the idle baseline while the player is
 *  actually moving/sprinting (`PlayerController.update`'s `tickPlayerMovementVigor`
 *  call) — the old flat "drains across a day of activity" rate (mirrors
 *  `ai/npcVigor.ts`'s framing), correctly scoped to activity instead of
 *  applying while standing still. Sprinting costs more than a walk, matching
 *  "cięższe aktywności mogą mieć jeszcze większy koszt". */
const VIGOR_WALK_EXTRA_DRAIN_PER_GAME_DAY = 100
const VIGOR_SPRINT_EXTRA_DRAIN_MULTIPLIER = 1.5

/** Stamina is short-term (sprint) effort, not daily budget — fast drain, fast
 *  regen, same "twitchy" order of magnitude as fauna's 0-1-scale sprint
 *  drain/regen in `fauna/AnimalLife.ts` rescaled to this 0-100 pool. Flat
 *  real-seconds rates — not game-time tuned, so `dayLengthSec` doesn't apply. */
const STAMINA_SPRINT_DRAIN_PER_SEC = 20
const STAMINA_REGEN_PER_SEC = 12

/** Continuous Stamina cost for a long physical `BusyAction` channel (playtest
 *  fixes plan §1 — terrain prep / well work had no Stamina cost at all).
 *  Flat real-seconds rate, same "twitchy short-term pool" framing as the
 *  sprint drain above: a single dig/level/mound (`DIG_DURATION_SEC` = 2s)
 *  costs a modest ~12% of the pool, while a full well-work bout
 *  (`WELL_WORK_SESSION_SEC` = 8s) costs a clearly-felt ~48% — proportional to
 *  the actual elapsed work time, never a lump sum on start. */
export const BUSY_ACTION_STAMINA_COST_PER_SEC = 6

/** How long Hunger/Thirst must stay continuously critical (plan 165 §2/§3)
 *  before slow HP loss begins — before this, the only consequence is the
 *  growing Vigor/Stamina penalty below. Thirst's window is deliberately
 *  shorter than hunger's ("skala czasowa odwodnienia jest krótsza"). */
const HUNGER_SEVERE_GAME_DAYS = 3
const THIRST_SEVERE_GAME_DAYS = 1.5

/** `HUNGER_SEVERE_GAME_DAYS`/`THIRST_SEVERE_GAME_DAYS` converted to a real/
 *  simulation-seconds duration against the *current* `dayLengthSec` — the
 *  gate compared against `starvationDuration`/`dehydrationDuration` (both
 *  simulation-time counters, see the type doc above). */
export function hungerSevereDurationSec(dayLengthSec: number): number {
  return gameDaysToRealSeconds(HUNGER_SEVERE_GAME_DAYS, dayLengthSec)
}
export function thirstSevereDurationSec(dayLengthSec: number): number {
  return gameDaysToRealSeconds(THIRST_SEVERE_GAME_DAYS, dayLengthSec)
}

/** HP/sec lost once a deprivation duration has crossed its severe gate above
 *  — applied by `player/playerDamage.ts`'s `tickPlayerStarvationDamage`
 *  (routed through the player defense/downed lifecycle, unlike the plain
 *  `damageHealth` fauna bites use), so sustained starvation/dehydration deals
 *  real but slow damage with no new death/UI system. Flat — not game-time
 *  tuned. */
export const STARVATION_HP_PER_SEC = 0.5
export const DEHYDRATION_HP_PER_SEC = 0.5

/** Extra Vigor/Stamina drain at full deprivation severity (duration at or
 *  past its severe-duration gate above), ramped linearly from 0 as
 *  `starvationDuration`/`dehydrationDuration` grow — a capability penalty
 *  ("spadek wydolności") rather than a permanent max reduction, so eating/
 *  drinking (which resets duration to 0) immediately restores normal
 *  capability. `deprivationSeverity` below derives the [0,1] ramp. Vigor
 *  penalty is game-time tuned (same "100 over a game day" shape as walking);
 *  Stamina penalty is a flat short-term twitch cost. */
const DEPRIVATION_VIGOR_PENALTY_PER_GAME_DAY = 100
const DEPRIVATION_STAMINA_PENALTY_PER_SEC = 8

/** Amount of a pool drained/restored over `gameDays` game-days, converted to
 *  a per-second rate against the current `dayLengthSec` — the one place this
 *  file turns a game-time tuning number into a real/simulation-seconds rate. */
function ratePerSecond(amount: number, gameDays: number, dayLengthSec: number): number {
  return amount / gameDaysToRealSeconds(gameDays, dayLengthSec)
}

/** Light passive HP regen (plan 153 — mobile playtest found no way to
 *  recover HP at all short of a full sleep skip). Slow on purpose: a full
 *  heal takes minutes, not seconds, so healing items/herbs stay meaningfully
 *  faster. Suppressed once starvation/dehydration HP loss is active so it
 *  never partially cancels that same-tick damage. */
const HP_REGEN_PER_SEC = 0.3

export function createPlayerNeeds(): PlayerNeeds {
  return {
    stamina: createStaminaState(PLAYER_MAX_STAMINA),
    vigor: createVigorState(PLAYER_MAX_VIGOR),
    hunger: createHungerState(PLAYER_MAX_HUNGER),
    thirst: createThirstState(PLAYER_MAX_THIRST),
    starvationDuration: 0,
    dehydrationDuration: 0,
  }
}

/** New Game — refills every pool, same as a brand-new `createPlayerNeeds()`. */
export function resetPlayerNeeds(needs: PlayerNeeds): void {
  needs.stamina.current = needs.stamina.max
  needs.vigor.current = needs.vigor.max
  needs.hunger.current = needs.hunger.max
  needs.thirst.current = needs.thirst.max
  needs.starvationDuration = 0
  needs.dehydrationDuration = 0
}

/** [0,1] ramp of how severe a continuous deprivation duration is — 0 the
 *  instant a pool turns critical, 1 once it reaches its severe-duration gate
 *  (`hungerSevereDurationSec`/`thirstSevereDurationSec`, where HP loss
 *  starts). Drives the Vigor/Stamina penalty below. */
function deprivationSeverity(duration: number, severeDurationSec: number): number {
  if (severeDurationSec <= 0) return duration > 0 ? 1 : 0
  return Math.max(0, Math.min(1, duration / severeDurationSec))
}

/** Restores a save's persisted hunger/thirst/vigor and deprivation-duration
 *  counters onto a fresh pool (stamina stays transient — plan §8). Clamps
 *  defensively in case of a hand-edited save. */
export function restorePersistedNeeds(
  needs: PlayerNeeds,
  saved: { hunger: number, thirst: number, vigor: number, starvationDuration: number, dehydrationDuration: number },
): void {
  needs.hunger.current = Math.max(0, Math.min(needs.hunger.max, saved.hunger))
  needs.thirst.current = Math.max(0, Math.min(needs.thirst.max, saved.thirst))
  needs.vigor.current = Math.max(0, Math.min(needs.vigor.max, saved.vigor))
  needs.starvationDuration = Math.max(0, saved.starvationDuration)
  needs.dehydrationDuration = Math.max(0, saved.dehydrationDuration)
}

/** Coarse per-tick drain — called every frame with `worldDt` (`gameLoop.ts`
 *  scales `dt` by `dayNight.timeMultiplier` during an active time-skip
 *  instead of freezing it, so Hunger/Thirst/Vigor and their consequences
 *  keep progressing — and the HUD keeps reflecting them — through a rest/
 *  sleep skip rather than jumping only once it finishes). `dayLengthSec`
 *  is the live `DayNightState.dayLengthSec` (plan 192) — every drain rate
 *  below is tuned in game-days/game-day-fractions, converted against it
 *  each tick so the tuning doesn't drift if day length changes.
 *
 *  Tick order (plan 165): advance the pools, derive whether each is
 *  currently critical, advance/reset the matching deprivation duration,
 *  then apply the duration-derived Vigor/Stamina penalty. `eatFood`/
 *  `drinkWater` don't need to touch duration themselves — raising a pool
 *  back above critical means the very next tick here resets it to 0. */
export function tickPlayerNeeds(needs: PlayerNeeds, dt: number, dayLengthSec: number): void {
  if (dt <= 0) return
  drainHunger(needs.hunger, ratePerSecond(100, HUNGER_EMPTY_GAME_DAYS, dayLengthSec) * dt)
  drainThirst(needs.thirst, ratePerSecond(100, THIRST_EMPTY_GAME_DAYS, dayLengthSec) * dt)

  needs.starvationDuration = isStarving(needs.hunger) ? needs.starvationDuration + dt : 0
  needs.dehydrationDuration = isDehydrated(needs.thirst) ? needs.dehydrationDuration + dt : 0

  drainVigor(needs.vigor, ratePerSecond(VIGOR_IDLE_DRAIN_PER_GAME_DAY, 1, dayLengthSec) * dt)

  const severity = Math.max(
    deprivationSeverity(needs.starvationDuration, hungerSevereDurationSec(dayLengthSec)),
    deprivationSeverity(needs.dehydrationDuration, thirstSevereDurationSec(dayLengthSec)),
  )
  if (severity > 0) {
    drainVigor(needs.vigor, severity * ratePerSecond(DEPRIVATION_VIGOR_PENALTY_PER_GAME_DAY, 1, dayLengthSec) * dt)
    drainStamina(needs.stamina, severity * DEPRIVATION_STAMINA_PENALTY_PER_SEC * dt)
  }
}

export function tickPlayerStamina(stamina: StaminaState, dt: number, sprinting: boolean): void {
  if (sprinting) drainStamina(stamina, STAMINA_SPRINT_DRAIN_PER_SEC * dt)
  else restoreStamina(stamina, STAMINA_REGEN_PER_SEC * dt)
}

/** Extra Vigor cost for actually moving, on top of the idle baseline
 *  `tickPlayerNeeds` already applies every tick — called from
 *  `PlayerController.update` only while `moving` is true, with the same
 *  per-frame `dt` used for movement/stamina that frame (plan 165 §1). */
export function tickPlayerMovementVigor(vigor: VigorState, dt: number, sprinting: boolean, dayLengthSec: number): void {
  if (dt <= 0) return
  const walkRate = ratePerSecond(VIGOR_WALK_EXTRA_DRAIN_PER_GAME_DAY, 1, dayLengthSec)
  drainVigor(vigor, (sprinting ? walkRate * VIGOR_SPRINT_EXTRA_DRAIN_MULTIPLIER : walkRate) * dt)
}

/** Full night's sleep (tent/camp/town rest quick actions, all 8h skips) —
 *  a flat restore is simpler and just as deterministic as rate-matching the
 *  drain that happened during the same skip, and matches how NPC sleep is
 *  framed (`ai/npcVigor.ts`'s `VIGOR_WAKE_THRESHOLD` wake-up).
 *
 *  `quality` (plan 128 §6, from `app/campRest.ts`) is how good the bivouac
 *  was: 1 for a bed in town / a full camp, less for a blanket on bare ground.
 *  It caps the *vigor* the night gives back — sleeping rough never lowers
 *  vigor below where it already was, it just fails to fill the bar. Stamina
 *  is short-term effort and always comes back in full. */
export function restoreNeedsFromSleep(needs: PlayerNeeds, quality = 1): void {
  const fraction = Number.isFinite(quality) ? Math.max(0, Math.min(1, quality)) : 1
  needs.vigor.current = Math.max(needs.vigor.current, needs.vigor.max * fraction)
  needs.stamina.current = needs.stamina.max
}

export function eatFood(needs: PlayerNeeds, hungerRelief: number): void {
  restoreHunger(needs.hunger, hungerRelief)
}

export function drinkWater(needs: PlayerNeeds, thirstRelief: number): void {
  restoreThirst(needs.thirst, thirstRelief)
}

/** True once a deprivation duration has crossed its severe gate — the point
 *  `player/playerDamage.ts`'s `tickPlayerStarvationDamage` starts dealing HP
 *  loss (plan 165 §2/§3). Exported so that live path and `tickHealthRegen`'s
 *  suppression below share one definition of "currently taking damage". */
export function isTakingDeprivationDamage(needs: PlayerNeeds, dayLengthSec: number): boolean {
  return needs.starvationDuration >= hungerSevereDurationSec(dayLengthSec)
    || needs.dehydrationDuration >= thirstSevereDurationSec(dayLengthSec)
}

/** Passive HP regen (plan 153) — mirrors `tickPlayerStamina`'s "cheap
 *  per-tick pool nudge" shape. No-ops while deprivation HP loss is active
 *  (that tick already takes starvation/dehydration damage) or once already
 *  full. */
export function tickHealthRegen(needs: PlayerNeeds, health: HealthState, dt: number, dayLengthSec: number): void {
  if (dt <= 0) return
  if (isTakingDeprivationDamage(needs, dayLengthSec)) return
  healHealth(health, HP_REGEN_PER_SEC * dt)
}

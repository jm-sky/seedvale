import { damageHealth, healHealth, type HealthState } from '../shared/HealthState'
import { createHungerState, drainHunger, type HungerState, isStarving, restoreHunger } from '../shared/HungerState'
import { createStaminaState, drainStamina, restoreStamina, type StaminaState } from '../shared/StaminaState'
import { createThirstState, drainThirst, isDehydrated, restoreThirst, type ThirstState } from '../shared/ThirstState'
import { createVigorState, drainVigor, type VigorState } from '../shared/VigorState'

/** Plan 106 — the player's four survival pools. `stamina`/`vigor` reuse the
 *  existing NPC/fauna `shared/*State` shape verbatim; `hunger`/`thirst` are
 *  new pools of the same `{max, current}` family (see `HungerState.ts`'s doc
 *  comment for why they aren't the 0-1 "urge" shape NPC `Needs.ts`/fauna
 *  `AnimalLife.ts` use — those track *when to act*, this tracks *a bar the
 *  player watches and refills by eating/drinking real items*). */
export type PlayerNeeds = {
  stamina: StaminaState
  vigor: VigorState
  hunger: HungerState
  thirst: ThirstState
}

export const PLAYER_MAX_STAMINA = 100
export const PLAYER_MAX_VIGOR = 100
export const PLAYER_MAX_HUNGER = 100
export const PLAYER_MAX_THIRST = 100

/** Per-second drain while awake — tuned against the default `dayLengthSec`
 *  (480s, `world/dayNight.ts`): hunger empties over ~3 game days, thirst over
 *  ~2.5 (thirst always outpaces hunger), vigor over a single day (mirrors
 *  `ai/npcVigor.ts`'s "drains across a day of activity, restored by sleep"). */
const HUNGER_DRAIN_PER_SEC = 100 / (3 * 480)
const THIRST_DRAIN_PER_SEC = 100 / (2.5 * 480)
const VIGOR_DRAIN_PER_SEC = 100 / 480

/** Stamina is short-term (sprint) effort, not daily budget — fast drain, fast
 *  regen, same "twitchy" order of magnitude as fauna's 0-1-scale sprint
 *  drain/regen in `fauna/AnimalLife.ts` rescaled to this 0-100 pool. */
const STAMINA_SPRINT_DRAIN_PER_SEC = 20
const STAMINA_REGEN_PER_SEC = 12

/** HP/sec lost while a pool is fully depleted (§1: "should affect gameplay,
 *  but this plan should not introduce a broad disease/death framework") —
 *  reuses the existing combat-agnostic `damageHealth`, the same path fauna
 *  bites already use, so a starving/dehydrated player takes real but slow
 *  damage with no new death/UI system. */
const STARVATION_HP_PER_SEC = 0.5
const DEHYDRATION_HP_PER_SEC = 0.5

/** Light passive HP regen (plan 153 — mobile playtest found no way to
 *  recover HP at all short of a full sleep skip). Slow on purpose: a full
 *  heal takes minutes, not seconds, so healing items/herbs stay meaningfully
 *  faster. Suppressed while starving/dehydrated so it never partially cancels
 *  `applyStarvationDamage` in the same tick. */
const HP_REGEN_PER_SEC = 0.3

export function createPlayerNeeds(): PlayerNeeds {
  return {
    stamina: createStaminaState(PLAYER_MAX_STAMINA),
    vigor: createVigorState(PLAYER_MAX_VIGOR),
    hunger: createHungerState(PLAYER_MAX_HUNGER),
    thirst: createThirstState(PLAYER_MAX_THIRST),
  }
}

/** New Game — refills every pool, same as a brand-new `createPlayerNeeds()`. */
export function resetPlayerNeeds(needs: PlayerNeeds): void {
  needs.stamina.current = needs.stamina.max
  needs.vigor.current = needs.vigor.max
  needs.hunger.current = needs.hunger.max
  needs.thirst.current = needs.thirst.max
}

/** Restores a save's persisted hunger/thirst/vigor onto a fresh pool (stamina
 *  stays transient — plan §8). Clamps defensively in case of a hand-edited
 *  save. */
export function restorePersistedNeeds(
  needs: PlayerNeeds,
  saved: { hunger: number, thirst: number, vigor: number },
): void {
  needs.hunger.current = Math.max(0, Math.min(needs.hunger.max, saved.hunger))
  needs.thirst.current = Math.max(0, Math.min(needs.thirst.max, saved.thirst))
  needs.vigor.current = Math.max(0, Math.min(needs.vigor.max, saved.vigor))
}

/** Coarse per-tick drain — called every frame with `worldDt` (frozen during
 *  an active time-skip, same convention as fauna/settlements) and once more
 *  with the skipped duration when a skip finishes (`gameLoop.ts`), matching
 *  the existing NPC/fauna "freeze then catch up in one lump" pattern instead
 *  of paying per-frame cost while the skip overlay is up. */
export function tickPlayerNeeds(needs: PlayerNeeds, dt: number): void {
  if (dt <= 0) return
  drainHunger(needs.hunger, HUNGER_DRAIN_PER_SEC * dt)
  drainThirst(needs.thirst, THIRST_DRAIN_PER_SEC * dt)
  drainVigor(needs.vigor, VIGOR_DRAIN_PER_SEC * dt)
}

export function tickPlayerStamina(stamina: StaminaState, dt: number, sprinting: boolean): void {
  if (sprinting) drainStamina(stamina, STAMINA_SPRINT_DRAIN_PER_SEC * dt)
  else restoreStamina(stamina, STAMINA_REGEN_PER_SEC * dt)
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

/** Applies §1's HP consequence for a fully-depleted pool. Cheap no-op the
 *  vast majority of frames (both checks are simple comparisons), so this is
 *  safe to call unconditionally every tick rather than gating it behind a
 *  coarser schedule. */
export function applyStarvationDamage(needs: PlayerNeeds, health: HealthState, dt: number): void {
  let perSec = 0
  if (isStarving(needs.hunger)) perSec += STARVATION_HP_PER_SEC
  if (isDehydrated(needs.thirst)) perSec += DEHYDRATION_HP_PER_SEC
  if (perSec > 0) damageHealth(health, perSec * dt)
}

/** Passive HP regen (plan 153) — mirrors `tickPlayerStamina`'s "cheap
 *  per-tick pool nudge" shape. No-ops while starving/dehydrated (those ticks
 *  already take starvation damage the same frame) or once already full. */
export function tickHealthRegen(needs: PlayerNeeds, health: HealthState, dt: number): void {
  if (dt <= 0) return
  if (isStarving(needs.hunger) || isDehydrated(needs.thirst)) return
  healHealth(health, HP_REGEN_PER_SEC * dt)
}

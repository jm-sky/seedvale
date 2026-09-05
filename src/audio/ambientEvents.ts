import type { AudioBusId, PlayAt } from './createWorldAudio'

/**
 * @domain world
 * @system ambient-audio
 * @role Shared runtime for sporadic ambient one-shots (owl hoot; future
 *   distant wolf howl, single bird calls, etc. — plan world-016). A
 *   definition is data plus a pure eligibility predicate; this module owns
 *   cooldown/recheck/chance/variant-selection/placement/playback so adding
 *   another event needs a definition, not a new dedicated timer in
 *   `createAmbientAudio.ts`.
 */

/** Throttled world snapshot an `AmbientEventDefinition.isEligible` predicate
 *  reads — the caller (`createAmbientAudio.ts`) assembles this once per
 *  update from state it already samples. */
export type AmbientEventContext = {
  /** `[0, 1)` progress from dusk to the next dawn, `null` during the day
   *  half (`nightPhase.ts`). */
  nightPhase: number | null
  /** Broad forest weight at the player's position (`ambientWeightsAt().forest`). */
  forestWeight: number
  playerX: number
  playerZ: number
}

export type AmbientEventDefinition = {
  id: string
  /** Candidate clip URLs — one is chosen per successful roll. */
  sounds: readonly string[]
  volume: number
  /** Defaults to `playAt`'s own default (`'sfx'`) when omitted. */
  bus?: AudioBusId
  /** Random radial placement (world units) around the player. */
  offset: { min: number, max: number }
  cooldown: { min: number, max: number }
  /** Once the cooldown clears without a successful roll, how soon to retry. */
  recheckSec: number
  /** Roll chance per recheck once the cooldown has elapsed. */
  chance: number
  isEligible: (ctx: AmbientEventContext) => boolean
}

export type AmbientEventRuntime = {
  /** Call once per frame — `dt` ticks every definition's own cooldown. */
  update: (dt: number, ctx: AmbientEventContext) => void
}

/**
 * `rng` is injectable (defaults to `Math.random`) so eligibility/cooldown/
 * chance/variant/placement are all deterministically testable without
 * mocking globals.
 */
export function createAmbientEventRuntime(
  worldAudio: { playAt: PlayAt },
  definitions: readonly AmbientEventDefinition[],
  rng: () => number = Math.random,
): AmbientEventRuntime {
  // Starts partway through a cooldown draw so a fresh session doesn't stay
  // silent for a full cooldown before the first possible event (same
  // reasoning the owl's previous standalone timer used).
  const cooldowns = new Map<string, number>(
    definitions.map((def) => [def.id, rng() * def.cooldown.max]),
  )

  function update(dt: number, ctx: AmbientEventContext): void {
    for (const def of definitions) {
      let cooldownSec = (cooldowns.get(def.id) ?? 0) - dt
      if (cooldownSec <= 0) {
        if (def.isEligible(ctx) && rng() < def.chance) {
          const angle = rng() * Math.PI * 2
          const radius = def.offset.min + rng() * (def.offset.max - def.offset.min)
          const sound = def.sounds[Math.floor(rng() * def.sounds.length)]
          worldAudio.playAt(
            sound,
            { x: ctx.playerX + Math.cos(angle) * radius, z: ctx.playerZ + Math.sin(angle) * radius },
            def.volume,
            def.bus,
          )
          cooldownSec = def.cooldown.min + rng() * (def.cooldown.max - def.cooldown.min)
        } else {
          cooldownSec = def.recheckSec
        }
      }
      cooldowns.set(def.id, cooldownSec)
    }
  }

  return { update }
}

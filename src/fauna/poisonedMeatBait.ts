import { createSeededRandom } from '../world/parseSeed'

/**
 * @domain fauna
 * @role Deterministic poisoned-meat detection and damage tuning for dropped-food
 * consumption (plan items-player-049).
 */

/** Share of consume attempts where the animal detects poison before eating. */
export const POISONED_MEAT_DETECTION_CHANCE = 0.1

/** Seconds to ignore a rejected poisoned-meat source after a successful detection roll. */
export const POISONED_MEAT_REJECT_IGNORE_SEC = 20

/** One-shot HP loss after undetected consumption — meaningful on wolf/fox, not a healthy bear one-shot (150 HP). */
export const POISONED_MEAT_DAMAGE_HP = 35

const POISONED_MEAT_DETECTION_SALT = 'poisoned-meat-detection'

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Stable `[0,1)` roll for one animal/dropped-item consume encounter. */
export function poisonedMeatDetectionRoll(input: {
  worldSeed: number
  animalId: string
  droppedItemId: string
}): number {
  const key = `${input.worldSeed}:${input.animalId}:${input.droppedItemId}:${POISONED_MEAT_DETECTION_SALT}`
  return createSeededRandom(hashString(key))()
}

export function poisonedMeatDetected(roll: number): boolean {
  return roll < POISONED_MEAT_DETECTION_CHANCE
}

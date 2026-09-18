/**
 * Pure contextual safe-anchor resolution for domestic household livestock
 * fleeing a live predator threat (plan fauna-037). `AnimalAgent.fleeFrom()`
 * remains the ordinary away-from-threat movement primitive and fallback;
 * this module only decides whether a caller-supplied anchor (responsible
 * household member, home, owning settlement) is a safer initial direction
 * than that fallback. Three.js-free and allocation-light so the directional
 * gate stays cheap to call every tick a threatened animal is fleeing.
 *
 * @domain fauna
 */

export type FleeAnchorPoint = { x: number, z: number }

export type DomesticFleeTargetInput = {
  animalPosition: FleeAnchorPoint
  threatPosition: FleeAnchorPoint
  /** Responsible household member's live position, if one is currently
   *  present nearby — never "nearest NPC in the world"; the caller must
   *  already scope this to the animal's own owning household. */
  shepherdAnchor?: FleeAnchorPoint | null
  /** Owning household/livestock home context. */
  homeAnchor?: FleeAnchorPoint | null
  /** Owning settlement's safe-area context (e.g. the nearest village). */
  settlementAnchor?: FleeAnchorPoint | null
}

/** An anchor within this distance of the animal has no stable direction to
 *  commit to and is treated as degenerate rather than producing a jittery
 *  near-zero-length step. */
const MIN_ANCHOR_DISTANCE = 0.5

/**
 * True when the first step toward `anchor` does not reduce separation from
 * `threat` — the directional safety gate every candidate must pass before
 * `resolveDomesticFleeTarget` accepts it. Compares the anchor direction
 * against the existing away-from-threat direction via their dot product, so
 * an anchor on the far side of the threat (negative dot) is rejected without
 * simulating any travel distance. Pure and deterministic.
 *
 * @domain fauna
 */
export function fleeAnchorIsSafe(
  animalPosition: FleeAnchorPoint,
  threatPosition: FleeAnchorPoint,
  anchor: FleeAnchorPoint,
): boolean {
  const towardX = anchor.x - animalPosition.x
  const towardZ = anchor.z - animalPosition.z
  if (towardX * towardX + towardZ * towardZ < MIN_ANCHOR_DISTANCE * MIN_ANCHOR_DISTANCE) return false
  const awayX = animalPosition.x - threatPosition.x
  const awayZ = animalPosition.z - threatPosition.z
  return awayX * towardX + awayZ * towardZ >= 0
}

/**
 * Preferred domestic-livestock flee anchor in shepherd/handler → home →
 * settlement order (plan fauna-037), or `null` when no candidate is present
 * or every present candidate fails `fleeAnchorIsSafe` — the caller falls
 * back to its ordinary away-from-threat flee in that case. Never persisted:
 * intended to be recomputed fresh every tick from the live threat position.
 *
 * @domain fauna
 */
export function resolveDomesticFleeTarget(input: DomesticFleeTargetInput): FleeAnchorPoint | null {
  const candidates = [input.shepherdAnchor, input.homeAnchor, input.settlementAnchor]
  for (const candidate of candidates) {
    if (!candidate) continue
    if (fleeAnchorIsSafe(input.animalPosition, input.threatPosition, candidate)) {
      return { x: candidate.x, z: candidate.z }
    }
  }
  return null
}

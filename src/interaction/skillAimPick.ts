import type { Interactable } from './Interactable'
import { projectToViewportFraction, RANGED_RETICLE_TARGET_HEIGHT } from '../combat/rangedReticle'
import type { PerspectiveCamera } from 'three'

/**
 * Screen-proximity pick for free-cursor targeted-skill aiming.
 * Projects candidate world positions and picks the nearest on-screen match
 * within range — used when Medicine/Traps/Repair keep a free mouse cursor.
 *
 * @domain items-player
 * @system interaction
 */

/** Max distance in viewport fractions (0-1) from the aim point to a projected candidate. */
export const SKILL_AIM_SCREEN_RADIUS = 0.08

function candidateAimHeight(target: Interactable): number {
  if (target.kind === 'npc' || target.kind === 'npcCorpse') return RANGED_RETICLE_TARGET_HEIGHT
  if (target.kind === 'animal' || target.kind === 'corpse') {
    return Math.min(RANGED_RETICLE_TARGET_HEIGHT, target.animal.def.modelHeight * 0.55)
  }
  return 0.4
}

/**
 * Picks the interactable whose projected screen position is closest to
 * `aim` (viewport fractions, y from top), among candidates within world
 * `range` of the player. Returns null when none are near enough on screen.
 */
export function pickInteractableNearScreen(
  candidates: readonly Interactable[],
  playerPos: { x: number, z: number },
  camera: PerspectiveCamera,
  aim: { x: number, y: number },
  range: number,
  screenRadius: number = SKILL_AIM_SCREEN_RADIUS,
): Interactable | null {
  let best: Interactable | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const dx = candidate.position.x - playerPos.x
    const dz = candidate.position.z - playerPos.z
    const dist = Math.hypot(dx, dz)
    const maxRange = 'interactRange' in candidate && candidate.interactRange != null
      ? candidate.interactRange
      : range
    if (dist > maxRange) continue
    const projected = projectToViewportFraction(
      candidate.position.x,
      candidateAimHeight(candidate),
      candidate.position.z,
      camera,
    )
    if (!projected) continue
    const sx = projected.x - aim.x
    const sy = projected.y - aim.y
    const screenDist = Math.hypot(sx, sy)
    if (screenDist > screenRadius) continue
    // Prefer closer on-screen matches; break world-distance ties.
    const score = screenDist * 1000 + dist
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

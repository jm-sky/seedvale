/** Generic "what is the player looking at" picker — distance + facing-dot, highest
 *  dot wins so a dense cluster resolves to whichever candidate the player is
 *  actually looking at. Extracted from `app/createApp.ts`'s original NPC-only
 *  `findInteractionTarget` so NPCs, animals, landmarks, spawners, and items can
 *  all share one picker via `Interactable`. */
export function pickInGaze<T extends { position: { x: number, z: number } }>(
  candidates: readonly T[],
  playerPos: { x: number, z: number },
  playerYaw: number,
  range: number,
  minDot: number,
): T | null {
  const forwardX = -Math.sin(playerYaw)
  const forwardZ = -Math.cos(playerYaw)
  let best: T | null = null
  let bestDot = minDot
  for (const candidate of candidates) {
    const dx = candidate.position.x - playerPos.x
    const dz = candidate.position.z - playerPos.z
    const dist = Math.hypot(dx, dz)
    if (dist < 1e-4 || dist > range) continue
    const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ
    if (dot > bestDot) {
      bestDot = dot
      best = candidate
    }
  }
  return best
}

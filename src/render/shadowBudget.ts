/** Shadow-map update budget (plan 145 R1).
 *
 * `renderer.shadowMap.needsUpdate = true` was otherwise set unconditionally
 * every frame (`gameLoop.ts`) — the only pass in the render pipeline without
 * any form of throttling/hysteresis (contrast `waterMirror.ts`'s
 * `shouldRenderMirror` and `aoBudget.ts`'s `shouldSuppressAo`, both of which
 * this module follows the same pure/testable shape as).
 *
 * Deliberately pull-based, not push-based: nothing (chunk streaming, tree
 * chop, terrain scorch) needs to remember to call a "mark dirty" hook —
 * every frame re-answers "does the shadow map need a fresh render?" from
 * cheap, already-available signals. A missed edge case (e.g. a tree chopped
 * while the player stands still, outside `SHADOW_DIRTY_PLAYER_EPS_M` and with
 * no NPC/animal in range) only delays that one shadow update by at most
 * `SHADOW_DIRTY_MAX_STALE_FRAMES` frames — never leaves a permanently stale
 * shadow. See docs/plans/2026-08-17--145--shadow-budget-optimization.md R1.
 */

/** Player movement below this (world units, squared-compared) since the last
 *  shadow update does not by itself justify a re-render — covers the case
 *  where the player is genuinely stationary (menus, dialogue, aiming). */
export const SHADOW_DIRTY_PLAYER_EPS_M = 0.05

/** Safety-net cap: force a refresh at least this often even if every other
 *  signal says "clean", bounding the worst-case staleness from a missed
 *  streaming/tree/terrain event to a fraction of a second. */
export const SHADOW_DIRTY_MAX_STALE_FRAMES = 10

export type ShadowBudgetState = {
  /** Player X/Z at the last shadow-map update (not the last frame). */
  lastPlayerX: number
  lastPlayerZ: number
  /** Frames since the shadow map last actually updated. */
  framesSinceUpdate: number
}

export function createShadowBudgetState(playerX: number, playerZ: number): ShadowBudgetState {
  return { lastPlayerX: playerX, lastPlayerZ: playerZ, framesSinceUpdate: 0 }
}

/** Pure decision — extracted so it's unit-testable without a WebGL context or
 *  live agents (same split as `shouldRenderMirror`/`shouldSuppressAo`).
 *  `hasNearbyShadowCaster` is computed by the caller (see `anyWithinRadius`)
 *  from whatever NPC/fauna lists it already has on hand this frame. */
export function shouldUpdateShadowMap(
  state: ShadowBudgetState,
  playerX: number,
  playerZ: number,
  hasNearbyShadowCaster: boolean,
): boolean {
  if (state.framesSinceUpdate >= SHADOW_DIRTY_MAX_STALE_FRAMES) return true
  // Fail-open by design: an NPC/animal in shadow-casting range is treated as
  // "assume moving" rather than tracked for actual per-frame displacement —
  // see module doc. At current populations this is almost always `true` near
  // settlements, which is the expected/measured trade-off, not a bug.
  if (hasNearbyShadowCaster) return true
  const dx = playerX - state.lastPlayerX
  const dz = playerZ - state.lastPlayerZ
  return dx * dx + dz * dz > SHADOW_DIRTY_PLAYER_EPS_M * SHADOW_DIRTY_PLAYER_EPS_M
}

/** Call once per frame after acting on `shouldUpdateShadowMap`'s result, so
 *  the next frame's check compares against the right baseline. */
export function recordShadowBudgetFrame(
  state: ShadowBudgetState,
  playerX: number,
  playerZ: number,
  updated: boolean,
): void {
  if (updated) {
    state.lastPlayerX = playerX
    state.lastPlayerZ = playerZ
    state.framesSinceUpdate = 0
  } else {
    state.framesSinceUpdate += 1
  }
}

/** Generic, allocation-free proximity scan: `true` as soon as one `item` maps
 *  (via `positionOf`, no array copy) within `radius` of `(originX, originZ)`.
 *  Used to reuse `NPC_SHADOW_DISTANCE`/`FAUNA_SHADOW_DISTANCE` — the exact
 *  radii NPC/AnimalAgent already use for their own per-agent `castShadow`
 *  toggling — without needing `{x,z}`-shaped copies of live agent lists. */
export function anyWithinRadius<T>(
  originX: number,
  originZ: number,
  items: Iterable<T>,
  radius: number,
  positionOf: (item: T) => { x: number, z: number },
): boolean {
  const r2 = radius * radius
  for (const item of items) {
    const p = positionOf(item)
    const dx = p.x - originX
    const dz = p.z - originZ
    if (dx * dx + dz * dz <= r2) return true
  }
  return false
}

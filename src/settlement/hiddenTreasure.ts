import { DIG_RADIUS } from '../terrain/dig'
import type * as THREE from 'three'

/** Hidden-treasure easter egg (quick task): 3 flower clumps planted just past
 *  the main settlement's plaza edge double as invisible dig markers. The
 *  flowers themselves are purely decorative (`props.ts` adds them with no
 *  collider/`Interactable`) — this module only owns the shared marker
 *  geometry so `props.ts` (placement) and `groundActions.ts` (dig-hit test)
 *  agree on the same 3 spots without either one re-deriving them. */
export const HIDDEN_TREASURE_MARKER_COUNT = 3

/** Digging within this many world units of a marker counts as hitting it.
 *  The actual dig point (`interactables.ts`'s `DIG_REACH`) is a fixed
 *  distance projected from the player's feet/yaw, not a crosshair raycast —
 *  there's no ground-position preview, so the player's only feedback is the
 *  hole itself. Matched to `DIG_RADIUS` (the hole's own visible radius) so
 *  "my dig hole visibly reaches the flower" is exactly the rule, not a
 *  tighter invisible sub-region. */
export const HIDDEN_TREASURE_DIG_TOLERANCE = (DIG_RADIUS * 0.8) + 0.2

/** How far past the plaza's packed-dirt edge (`ClearingLayout.core.radius`)
 *  the flower cluster sits — on the grass just behind the square, not in the
 *  middle of it. */
const EDGE_MARGIN = 1.8

/** Angular offset (radians) from the campfire's own direction (when the
 *  settlement has one) so the flowers land beside it rather than on top of
 *  its collision disk/torch ring — still close enough to read as "near the
 *  well and the campfire". */
const CAMPFIRE_ANGLE_OFFSET = 0.55

/** Fixed local (forward/side) offsets around the anchor point, in the
 *  anchor's own radial ("forward", further from the plaza center) / tangential
 *  ("side", along the plaza edge) frame — deterministic for every load, not
 *  random. Spread wide enough that the 3 dig-tolerance circles above don't
 *  fully coincide (nearest-marker matching in `hiddenTreasureDigHit` still
 *  resolves the residual overlap deterministically), while staying a small,
 *  readable cluster next to the plaza. */
const MARKER_LOCAL_OFFSETS: ReadonlyArray<{ forward: number, side: number }> = [
  { forward: 0, side: -1 },
  { forward: 0, side: 1 },
  { forward: 1.2, side: 0 },
]

export type HiddenTreasureAnchorSource = {
  /** The settlement's plaza clearing (`ClearingLayout.core`) — the treasure
   *  cluster is anchored just outside its `radius`, not at its center. */
  core: { x: number, z: number, radius: number }
  campfire?: { position: Pick<THREE.Vector3, 'x' | 'z'> }
}

/** World-space (x, z) for each of the 3 markers — `props.ts` samples its own
 *  terrain height on top of these to place the flowers. */
export function hiddenTreasureMarkerPositions(
  source: HiddenTreasureAnchorSource,
): { x: number, z: number }[] {
  const { core, campfire } = source
  const baseAngle = campfire
    ? Math.atan2(campfire.position.z - core.z, campfire.position.x - core.x)
    : 0
  const angle = baseAngle + CAMPFIRE_ANGLE_OFFSET
  const dist = core.radius + EDGE_MARGIN
  const anchorX = core.x + Math.cos(angle) * dist
  const anchorZ = core.z + Math.sin(angle) * dist
  // Tangential ("side") / radial ("forward") unit vectors at the anchor.
  const tx = -Math.sin(angle)
  const tz = Math.cos(angle)
  return MARKER_LOCAL_OFFSETS.map(({ forward, side }) => ({
    x: anchorX + Math.cos(angle) * forward + tx * side,
    z: anchorZ + Math.sin(angle) * forward + tz * side,
  }))
}

/** Index of the nearest marker within `HIDDEN_TREASURE_DIG_TOLERANCE` of
 *  `(x, z)`, or -1 if the dig missed all of them. */
export function hiddenTreasureDigHit(
  markerPositions: readonly { x: number, z: number }[],
  x: number,
  z: number,
): number {
  let best = -1
  let bestDist = HIDDEN_TREASURE_DIG_TOLERANCE

  for (let i = 0; i < markerPositions.length; i++) {
    const m = markerPositions[i]!
    const dist = Math.hypot(m.x - x, m.z - z)
    if (dist <= bestDist) {
      best = i
      bestDist = dist
    }
  }

  return best
}

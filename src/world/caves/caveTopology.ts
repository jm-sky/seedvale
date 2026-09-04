/** Plan world-terrain-008 Milestone A — representation-neutral cave layout
 *  intent, shared by both spike variants (Sweep, SDF). Describes gameplay
 *  topology (entrance/passages/chambers/connections/features), never mesh or
 *  field parameters — see the plan's `CaveTopology` architecture split
 *  (seed+context → CaveTopology → CaveSpatialRepresentation → CavePresentation).
 *  Reuses `CaveEntrance` from `caveVolume.ts` rather than a second entrance
 *  type. No Three.js import, no representation-specific fields (SDF cell
 *  size, marching-cubes resolution, sweep profile index, noise octave
 *  count, ...) — a field that would only make sense to one spike belongs in
 *  that spike's own params type instead.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'

export type CaveTopologyNodeKind = 'entrance' | 'passage' | 'constriction' | 'widening' | 'chamber'

export type CaveTopologyFeatureKind = 'shelf' | 'overhang'

export type CaveTopologyPoint = { x: number, y: number, z: number }

/** One semantic waypoint along the cave (a chamber, a widening, ...).
 *  `targetWidth`/`targetHeight` are gameplay intent ("should be walkable and
 *  about this big"), not a wall position — each spike is free to interpret
 *  them. */
export type CaveTopologyNode = {
  id: string
  kind: CaveTopologyNodeKind
  position: CaveTopologyPoint
  targetWidth: number
  targetHeight: number
}

/** A connection between two nodes. `centerline` is a polyline of >= 2
 *  control points (world space), not a swept radius — it is what makes a
 *  bend or an irregular descent expressible without either spike inventing
 *  its own path model. */
export type CaveTopologySegment = {
  id: string
  from: string
  to: string
  centerline: readonly CaveTopologyPoint[]
}

/** A genuine 3D feature (plan §7/§28: at least one shelf or overhang per L1
 *  cave), stated as intent so a spike cannot quietly skip it. */
export type CaveTopologyFeature = {
  id: string
  kind: CaveTopologyFeatureKind
  anchorNodeId: string
  position: CaveTopologyPoint
  size: { width: number, height: number, depth: number }
}

/**
 * Representation-neutral cave layout: what a cave *is*, not what it looks
 * like. Both `sweepCaveMesh.ts` and `sdfCaveMesh.ts` consume exactly the
 * same `CaveTopology` instance for a given seed/entrance, so representation
 * is the only variable in the Milestone A comparison (plan §12).
 *
 * @domain world-terrain
 */
export type CaveTopology = {
  caveId: string
  seed: number
  entrance: CaveEntrance
  nodes: readonly CaveTopologyNode[]
  segments: readonly CaveTopologySegment[]
  features: readonly CaveTopologyFeature[]
  /** Minimum walkable clearance (metres) any spike must preserve along
   *  every segment/node — third-person gameplay floor, not a hard collision
   *  rule. */
  minClearance: number
}

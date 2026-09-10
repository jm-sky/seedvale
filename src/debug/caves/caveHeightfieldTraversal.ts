/** Experimental cave heightfield spike — traversal / collision queries
 *  derived from the same 2.5D representation as the mesh. Not production
 *  cave collision ownership.
 *
 * @domain world-terrain
 */

import { integrateVerticalMotion } from '../../player/verticalMotion'
import { mouthAlong, mouthLateral } from '../../world/caves/mouthCarve'
import {
  type CaveHeightfieldRepresentation,
  type HeightfieldSample,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'

/** Copied from production player constants so this module does not import
 *  `PlayerController` (WorldBundle / gameplay ownership). */
export const HEIGHTFIELD_PLAYER_RADIUS = 0.35
export const HEIGHTFIELD_PLAYER_HEIGHT = 1.8

export type HeightfieldSpaceQuery = HeightfieldSample & {
  blocked: boolean
}

export type HeightfieldGroundHit = {
  floorY: number
  ceilingY: number | null
  inside: boolean
  openSky: boolean
}

const SD_EPS = 1e-4

function isMouthCorridor(representation: CaveHeightfieldRepresentation, x: number, z: number, pad: number): boolean {
  const along = mouthAlong(x, z, representation.entrance)
  const lateral = mouthLateral(x, z, representation.entrance)
  return along > -0.55 && Math.abs(lateral) < representation.entrance.width * 0.55 + pad
}

function rockCeilingMaxY(ceilingY: number | null | undefined, floorY: number, playerHeight: number): number | undefined {
  if (ceilingY == null) return undefined
  const maxY = ceilingY - playerHeight
  if (maxY < floorY - 1e-6) return undefined
  return maxY
}

/**
 * Space query used by Walk mode and unit tests. `blocked` is true in solid
 * rock beyond the footprint, false in the doorway/approach corridor.
 *
 * @domain world-terrain
 */
export function queryHeightfieldSpace(
  representation: CaveHeightfieldRepresentation,
  x: number,
  z: number,
  radius = HEIGHTFIELD_PLAYER_RADIUS,
): HeightfieldSpaceQuery {
  const sample = sampleHeightfieldAt(representation, x, z)
  const mouth = isMouthCorridor(representation, x, z, radius)
  const blocked = sample.signedDistance > -radius + SD_EPS && !mouth
  return { ...sample, blocked }
}

function signedDistanceGradient(
  representation: CaveHeightfieldRepresentation,
  x: number,
  z: number,
): { gx: number, gz: number } {
  const e = Math.max(0.08, representation.cellSize * 0.35)
  const dx = sampleHeightfieldAt(representation, x + e, z).signedDistance
    - sampleHeightfieldAt(representation, x - e, z).signedDistance
  const dz = sampleHeightfieldAt(representation, x, z + e).signedDistance
    - sampleHeightfieldAt(representation, x, z - e).signedDistance
  return { gx: dx / (2 * e), gz: dz / (2 * e) }
}

/**
 * Pushes an XZ capsule out of heightfield rock. The doorway/approach is
 * left open so Walk mode can enter from the surface fixture.
 *
 * @domain world-terrain
 */
export function resolveHeightfieldHorizontal(
  representation: CaveHeightfieldRepresentation,
  x: number,
  z: number,
  radius = HEIGHTFIELD_PLAYER_RADIUS,
): { x: number, z: number } {
  let px = x
  let pz = z
  for (let iter = 0; iter < 24; iter++) {
    const sample = sampleHeightfieldAt(representation, px, pz)
    if (isMouthCorridor(representation, px, pz, radius) && sample.signedDistance > -radius) {
      return { x: px, z: pz }
    }
    const penetration = sample.signedDistance + radius
    if (penetration <= SD_EPS) return { x: px, z: pz }
    const { gx, gz } = signedDistanceGradient(representation, px, pz)
    const len = Math.hypot(gx, gz)
    const step = Math.min(Math.max(penetration, representation.cellSize * 0.25), 2.5)
    if (len < 1e-6) {
      px += Math.sign(representation.entrance.x - px || 0) * step
      pz += Math.sign(representation.entrance.z - pz || 0) * step
      continue
    }
    const push = step / len
    px -= gx * push
    pz -= gz * push
  }
  return { x: px, z: pz }
}

/**
 * Picks cave floor/ceiling when the entity is in the heightfield void,
 * otherwise the local surface fixture. Y disambiguates hillside-over-cave.
 *
 * @domain world-terrain
 */
export function queryHeightfieldGround(
  representation: CaveHeightfieldRepresentation,
  surfaceAt: (x: number, z: number) => number,
  x: number,
  y: number,
  z: number,
): HeightfieldGroundHit {
  const sample = sampleHeightfieldAt(representation, x, z)
  const surfaceY = surfaceAt(x, z)
  if (!sample.inside && sample.signedDistance > 0.15) {
    return { floorY: surfaceY, ceilingY: null, inside: false, openSky: true }
  }
  if (sample.inside || sample.signedDistance < 0.2) {
    const ceiling = sample.openSky ? null : sample.ceilingY
    const inColumn = y < (ceiling ?? surfaceY) + 0.6 && y > sample.floorY - 2
    if (inColumn) {
      return {
        floorY: sample.floorY,
        ceilingY: ceiling,
        inside: sample.inside || sample.signedDistance < 0,
        openSky: sample.openSky,
      }
    }
  }
  return { floorY: surfaceY, ceilingY: null, inside: false, openSky: true }
}

export type HeightfieldVerticalState = {
  y: number
  verticalVelocity: number
  grounded: boolean
}

/**
 * One frame of gravity / ground-stick / ceiling clamp over heightfield space.
 *
 * @domain world-terrain
 */
export function integrateHeightfieldVertical(
  representation: CaveHeightfieldRepresentation,
  surfaceAt: (x: number, z: number) => number,
  x: number,
  z: number,
  state: HeightfieldVerticalState,
  dt: number,
  jumpRequested: boolean,
  playerHeight = HEIGHTFIELD_PLAYER_HEIGHT,
): HeightfieldVerticalState {
  const ground = queryHeightfieldGround(representation, surfaceAt, x, state.y, z)
  const next = integrateVerticalMotion({
    y: state.y,
    verticalVelocity: state.verticalVelocity,
    grounded: state.grounded,
    groundY: ground.floorY,
    dt,
    jumpRequested,
    maxY: rockCeilingMaxY(ground.ceilingY, ground.floorY, playerHeight),
  })
  return { y: next.y, verticalVelocity: next.verticalVelocity, grounded: next.grounded }
}

/**
 * Occupancy sample for `resolveCameraBoom`. Null means "not cave void".
 *
 * @domain world-terrain
 */
export function heightfieldOccupancyAt(
  representation: CaveHeightfieldRepresentation,
  x: number,
  y: number,
  z: number,
): { floorY: number, ceilingY: number, openSky?: boolean } | null {
  const sample = sampleHeightfieldAt(representation, x, z)
  if (sample.signedDistance >= 0.05 && !sample.openSky) return null
  if (y < sample.floorY - 0.05) return null
  if (!sample.openSky && y > sample.ceilingY + 0.05) return null
  return {
    floorY: sample.floorY,
    ceilingY: sample.openSky ? sample.floorY + 8 : sample.ceilingY,
    openSky: sample.openSky,
  }
}

/**
 * Axis-aligned capsule vs ceiling test used by unit tests. Returns true
 * when the capsule top would sit above rock ceiling.
 *
 * @domain world-terrain
 */
export function heightfieldCapsuleHitsCeiling(
  representation: CaveHeightfieldRepresentation,
  x: number,
  y: number,
  z: number,
  height: number,
): boolean {
  const sample = sampleHeightfieldAt(representation, x, z)
  if (!sample.inside || sample.openSky) return false
  return y + height > sample.ceilingY + 1e-4
}

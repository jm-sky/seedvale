import { resolveFollowHysteresis } from '../shared/followHysteresis'

/** Per-animal Follow/Stay control state for player-owned livestock (plan fauna-020). */
export type OwnedAnimalControlMode = 'follow' | 'stay'

export type OwnedAnimalControlState = {
  mode: OwnedAnimalControlMode
  stayAnchor?: { x: number, z: number }
  /** Runtime-only hysteresis commitment — not persisted. Follow uses this
   *  for player-chase; Stay reuses it for return-to-anchor (modes are exclusive). */
  following?: boolean
}

export const FOLLOW_START_DISTANCE = 12
export const FOLLOW_STOP_DISTANCE = 6

/** Distance from `stayAnchor` at which Stay starts walking back (plan fauna-030). */
export const STAY_RETURN_START = 12
/** Distance from `stayAnchor` at which Stay stops return movement (plan fauna-030). */
export const STAY_RETURN_STOP = 6

export function createDefaultOwnedAnimalControlState(): OwnedAnimalControlState {
  return { mode: 'follow', following: false }
}

export function createFollowOwnedAnimalControlState(): OwnedAnimalControlState {
  return { mode: 'follow', following: false }
}

export type OwnedControlMovement =
  | { kind: 'none' }
  | { kind: 'follow', x: number, z: number }
  | { kind: 'returnToAnchor', x: number, z: number }

/**
 * @domain fauna
 * @role Follow/Stay movement policy for player-owned livestock (fauna-020 / fauna-030).
 *  Stay uses the same hysteresis primitive as Follow, targeting `stayAnchor`.
 */
export function resolveOwnedControlMovement(
  state: OwnedAnimalControlState,
  isPlayerOwned: boolean,
  animalPos: { x: number, z: number },
  playerPos: { x: number, z: number } | null | undefined,
  mounted: boolean,
  dead: boolean,
): OwnedControlMovement {
  if (dead || mounted || !isPlayerOwned) return { kind: 'none' }
  if (state.mode === 'stay') {
    const ret = resolveFollowHysteresis(
      state,
      animalPos,
      state.stayAnchor,
      STAY_RETURN_START,
      STAY_RETURN_STOP,
    )
    if (ret.kind === 'follow') return { kind: 'returnToAnchor', x: ret.x, z: ret.z }
    return { kind: 'none' }
  }
  const follow = resolveFollowHysteresis(
    state,
    animalPos,
    playerPos,
    FOLLOW_START_DISTANCE,
    FOLLOW_STOP_DISTANCE,
  )
  if (follow.kind === 'follow') return { kind: 'follow', x: follow.x, z: follow.z }
  return { kind: 'none' }
}

/**
 * @domain fauna
 * @role True when player-owned Stay must refuse routine AnimalTrip start/continue.
 */
export function isOwnedStayBlockingRoutineTrips(
  state: OwnedAnimalControlState,
  isPlayerOwned: boolean,
): boolean {
  return isPlayerOwned && state.mode === 'stay'
}

export function setOwnedAnimalControlMode(
  state: OwnedAnimalControlState,
  mode: OwnedAnimalControlMode,
  anchor?: { x: number, z: number },
): void {
  state.mode = mode
  state.following = false
  if (mode === 'stay' && anchor) state.stayAnchor = { x: anchor.x, z: anchor.z }
}

export function snapshotOwnedAnimalControl(state: OwnedAnimalControlState): {
  mode: OwnedAnimalControlMode
  stayAnchor?: { x: number, z: number }
} {
  const out: { mode: OwnedAnimalControlMode, stayAnchor?: { x: number, z: number } } = { mode: state.mode }
  if (state.stayAnchor) out.stayAnchor = { x: state.stayAnchor.x, z: state.stayAnchor.z }
  return out
}

export function hydrateOwnedAnimalControl(
  state: OwnedAnimalControlState,
  saved: { mode?: OwnedAnimalControlMode, stayAnchor?: { x: number, z: number } } | undefined,
): void {
  if (!saved?.mode) return
  state.mode = saved.mode
  state.following = false
  state.stayAnchor = saved.stayAnchor ? { x: saved.stayAnchor.x, z: saved.stayAnchor.z } : undefined
}

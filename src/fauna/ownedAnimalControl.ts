/** Per-animal Follow/Stay control state for player-owned livestock (plan fauna-020). */
export type OwnedAnimalControlMode = 'follow' | 'stay'

export type OwnedAnimalControlState = {
  mode: OwnedAnimalControlMode
  stayAnchor?: { x: number, z: number }
  /** Runtime-only hysteresis commitment — not persisted. */
  following?: boolean
}

export const FOLLOW_START_DISTANCE = 12
export const FOLLOW_STOP_DISTANCE = 6

export function createDefaultOwnedAnimalControlState(): OwnedAnimalControlState {
  return { mode: 'follow', following: false }
}

export function createFollowOwnedAnimalControlState(): OwnedAnimalControlState {
  return { mode: 'follow', following: false }
}

export type OwnedControlMovement =
  | { kind: 'none' }
  | { kind: 'follow', x: number, z: number }
  | { kind: 'stay' }

export function resolveOwnedControlMovement(
  state: OwnedAnimalControlState,
  isPlayerOwned: boolean,
  animalPos: { x: number, z: number },
  playerPos: { x: number, z: number } | null | undefined,
  mounted: boolean,
  dead: boolean,
): OwnedControlMovement {
  if (dead || mounted || !isPlayerOwned) return { kind: 'none' }
  if (state.mode === 'stay') return { kind: 'stay' }
  if (!playerPos) return { kind: 'none' }

  const dist = Math.hypot(playerPos.x - animalPos.x, playerPos.z - animalPos.z)
  let following = state.following ?? false
  if (!following && dist > FOLLOW_START_DISTANCE) following = true
  if (following && dist < FOLLOW_STOP_DISTANCE) following = false
  state.following = following

  if (following) return { kind: 'follow', x: playerPos.x, z: playerPos.z }
  return { kind: 'none' }
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

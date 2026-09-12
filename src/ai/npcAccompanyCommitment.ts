/**
 * Source-neutral accompany/follow commitment (plan npc-029). Lives on
 * `NpcAuthoritativeState`, not on `NpcPlan` / `activePlan` and not on
 * `NpcAgent` runtime action state. One NPC may hold at most one active
 * commitment. Execution (follow hysteresis, path rescue, current distance)
 * stays transient on the live agent.
 *
 * @domain npc
 */

export type NpcAccompanyTarget = { kind: 'player' }

export type NpcAccompanySourceRef =
  | { kind: 'voluntary' }
  | { kind: 'work-contract', contractId: string }

export type NpcAccompanyMode = 'follow' | 'stay'

export type NpcAccompanyEndReason = 'abandoned' | 'cancelled' | 'death' | 'finished'

export type NpcAccompanyRejectReason = 'already-active' | 'dead' | 'incompatible-work' | 'missing-anchor'

export type NpcAccompanyWorldPoint = { x: number, y: number, z: number }

export type NpcAccompanyCommitment = {
  target: NpcAccompanyTarget
  source: NpcAccompanySourceRef
  mode: NpcAccompanyMode
  stayAnchor?: NpcAccompanyWorldPoint
  startedAtDays: number
}

export type StartNpcAccompanyParams = {
  source: NpcAccompanySourceRef
  startedAtDays: number
  mode?: NpcAccompanyMode
  stayAnchor?: NpcAccompanyWorldPoint
}

export type StartNpcAccompanyConstraints = {
  /** Active Work Contract id, if any. Incompatible with a voluntary
   *  accompany (and with a work-contract source that is not this id). */
  activeWorkContractId?: string | null
}

export type StartNpcAccompanyResult =
  | { ok: true, commitment: NpcAccompanyCommitment }
  | { ok: false, reason: NpcAccompanyRejectReason }

/** Narrow authoritative slice so this module does not import `npcState.ts`. */
export type NpcAccompanyHost = {
  accompanyCommitment: NpcAccompanyCommitment | null
  health: { dead: boolean }
  postDeath: unknown | null
}

function cloneSource(source: NpcAccompanySourceRef): NpcAccompanySourceRef {
  return source.kind === 'work-contract'
    ? { kind: 'work-contract', contractId: source.contractId }
    : { kind: 'voluntary' }
}

function cloneAnchor(anchor: NpcAccompanyWorldPoint | undefined): NpcAccompanyWorldPoint | undefined {
  return anchor ? { x: anchor.x, y: anchor.y, z: anchor.z } : undefined
}

/** Plain-data clone for snapshot/restore — never shares object identity. */
export function cloneNpcAccompanyCommitment(
  commitment: NpcAccompanyCommitment | null | undefined,
): NpcAccompanyCommitment | null {
  if (!commitment) return null
  return {
    target: { kind: commitment.target.kind },
    source: cloneSource(commitment.source),
    mode: commitment.mode,
    stayAnchor: cloneAnchor(commitment.stayAnchor),
    startedAtDays: commitment.startedAtDays,
  }
}

function isIncompatibleWork(
  source: NpcAccompanySourceRef,
  activeWorkContractId: string | null | undefined,
): boolean {
  if (!activeWorkContractId) return false
  if (source.kind === 'work-contract' && source.contractId === activeWorkContractId) return false
  return true
}

/**
 * Creates the single active accompany commitment. Rejects a second
 * commitment, a dead NPC, stay-without-anchor, and an incompatible Work
 * Contract already assigned to this NPC.
 *
 * @domain npc
 */
export function startNpcAccompanyCommitment(
  state: NpcAccompanyHost,
  params: StartNpcAccompanyParams,
  constraints: StartNpcAccompanyConstraints = {},
): StartNpcAccompanyResult {
  if (state.health.dead || state.postDeath) return { ok: false, reason: 'dead' }
  if (state.accompanyCommitment) return { ok: false, reason: 'already-active' }
  if (isIncompatibleWork(params.source, constraints.activeWorkContractId)) {
    return { ok: false, reason: 'incompatible-work' }
  }
  const mode = params.mode ?? 'follow'
  if (mode === 'stay' && !params.stayAnchor) return { ok: false, reason: 'missing-anchor' }
  const commitment: NpcAccompanyCommitment = {
    target: { kind: 'player' },
    source: cloneSource(params.source),
    mode,
    stayAnchor: mode === 'stay' ? cloneAnchor(params.stayAnchor) : undefined,
    startedAtDays: params.startedAtDays,
  }
  state.accompanyCommitment = commitment
  return { ok: true, commitment }
}

/**
 * Switches follow/stay on the existing commitment without creating a new
 * one. Stay records the supplied world-space anchor once; follow clears it.
 *
 * @domain npc
 */
export function setNpcAccompanyMode(
  state: NpcAccompanyHost,
  mode: NpcAccompanyMode,
  stayAnchor?: NpcAccompanyWorldPoint,
): boolean {
  const current = state.accompanyCommitment
  if (!current) return false
  if (mode === 'stay' && !stayAnchor && !current.stayAnchor) return false
  current.mode = mode
  if (mode === 'stay') {
    current.stayAnchor = cloneAnchor(stayAnchor) ?? current.stayAnchor
  } else {
    current.stayAnchor = undefined
  }
  return true
}

/**
 * Clears the accompany commitment. Idempotent: a second call against an
 * already-empty slot returns false and changes nothing. Does not invent a
 * companion-specific returning lifecycle — callers that need a spatial
 * return use the shared NPC travel checkpoint.
 *
 * @domain npc
 */
export function endNpcAccompanyCommitment(
  state: NpcAccompanyHost,
  _reason: NpcAccompanyEndReason,
): boolean {
  if (!state.accompanyCommitment) return false
  state.accompanyCommitment = null
  return true
}

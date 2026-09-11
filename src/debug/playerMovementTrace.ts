/**
 * Opt-in debug ring buffer for the player horizontal movement pipeline
 * (Cave V2 mouth snap-back recon). Records only while tracing is active.
 *
 * @domain debug
 */

import type { Collider } from '../world/collision'

export const PLAYER_MOVEMENT_TRACE_CAPACITY = 250
/** Minimum backward component (m) along intended movement to flag a stage. */
export const MOVEMENT_BACKWARD_EPSILON = 0.02

export type MovementSnapStage =
  | 'slope'
  | 'ordinary-collider'
  | 'cave-horizontal'
  | 'final'
  | 'none'

export type MovementHeightfieldSnapshot = {
  outsideGrid: boolean
  openSky: boolean
  gap: number
  floorY: number
  ceilY: number
  surfaceY: number
  playerY: number
} | null

export type MovementColliderSnapshot = {
  type: Collider['type']
  x: number
  z: number
  radius?: number
  halfWidth?: number
  halfDepth?: number
  rotationY?: number
  minY?: number
  maxY?: number
} | null

export type MovementGroundSource = 'cave' | 'hysteresis' | 'surface' | 'water'

export type PlayerMovementTraceTick = {
  seq: number
  frame: number
  startX: number
  startY: number
  startZ: number
  grounded: boolean
  verticalVelocity: number
  rawWishX: number
  rawWishZ: number
  slopeBeforeX: number
  slopeBeforeZ: number
  slopeAfterX: number
  slopeAfterZ: number
  slopeDeltaX: number
  slopeDeltaZ: number
  slopeAngleDeg: number | null
  candidateX: number
  candidateZ: number
  ordinaryBeforeX: number
  ordinaryBeforeZ: number
  ordinaryAfterX: number
  ordinaryAfterZ: number
  ordinaryDeltaX: number
  ordinaryDeltaZ: number
  activeColliderCount: number
  influencingCollider: MovementColliderSnapshot
  caveBeforeX: number
  caveBeforeZ: number
  caveAfterX: number
  caveAfterZ: number
  caveDeltaX: number
  caveDeltaZ: number
  heightfield: MovementHeightfieldSnapshot
  groundSource: MovementGroundSource
  groundY: number
  yBeforeVertical: number
  yAfterVertical: number
  groundedAfter: boolean
  verticalVelocityAfter: number
  finalX: number
  finalY: number
  finalZ: number
  intendedX: number
  intendedZ: number
  backwardSlope: number
  backwardOrdinary: number
  backwardCave: number
  backwardFinal: number
  worstStage: MovementSnapStage
  worstBackward: number
}

export type PlayerMovementTraceSnapshot = {
  recording: boolean
  ticks: PlayerMovementTraceTick[]
}

export type PlayerMovementTraceRecordInput = Omit<
  PlayerMovementTraceTick,
  | 'seq'
  | 'worstStage'
  | 'worstBackward'
  | 'backwardSlope'
  | 'backwardOrdinary'
  | 'backwardCave'
  | 'backwardFinal'
>

export type PlayerMovementTraceBuffer = {
  start: () => void
  stop: () => void
  isRecording: () => boolean
  record: (tick: PlayerMovementTraceRecordInput) => void
  snapshot: () => PlayerMovementTraceSnapshot
  clear: () => void
  printReport: () => string
}

export function colliderToMovementSnapshot(collider: Collider | null): MovementColliderSnapshot {
  if (!collider) return null
  if (collider.type === 'circle') {
    return {
      type: 'circle',
      x: collider.x,
      z: collider.z,
      radius: collider.radius,
      minY: collider.minY,
      maxY: collider.maxY,
    }
  }
  return {
    type: 'obb',
    x: collider.x,
    z: collider.z,
    halfWidth: collider.halfWidth,
    halfDepth: collider.halfDepth,
    rotationY: collider.rotationY,
    minY: collider.minY,
    maxY: collider.maxY,
  }
}

function norm2(x: number, z: number): { x: number, z: number, len: number } {
  const len = Math.hypot(x, z)
  if (len < 1e-8) return { x: 0, z: 0, len: 0 }
  return { x: x / len, z: z / len, len }
}

/** Backward component of `delta` relative to intended movement direction. */
export function movementBackwardAmount(
  deltaX: number,
  deltaZ: number,
  intendedX: number,
  intendedZ: number,
): number {
  const dir = norm2(intendedX, intendedZ)
  if (dir.len < 1e-6) return 0
  return - (deltaX * dir.x + deltaZ * dir.z)
}

export type MovementBackwardClassification = {
  backwardSlope: number
  backwardOrdinary: number
  backwardCave: number
  backwardFinal: number
  worstStage: MovementSnapStage
  worstBackward: number
}

export function classifyMovementBackward(tick: {
  slopeDeltaX: number
  slopeDeltaZ: number
  ordinaryDeltaX: number
  ordinaryDeltaZ: number
  caveDeltaX: number
  caveDeltaZ: number
  startX: number
  startZ: number
  finalX: number
  finalZ: number
  intendedX: number
  intendedZ: number
}): MovementBackwardClassification {
  const intendedX = tick.intendedX
  const intendedZ = tick.intendedZ
  const backwardSlope = movementBackwardAmount(tick.slopeDeltaX, tick.slopeDeltaZ, intendedX, intendedZ)
  const backwardOrdinary = movementBackwardAmount(tick.ordinaryDeltaX, tick.ordinaryDeltaZ, intendedX, intendedZ)
  const backwardCave = movementBackwardAmount(tick.caveDeltaX, tick.caveDeltaZ, intendedX, intendedZ)
  const netX = tick.finalX - tick.startX
  const netZ = tick.finalZ - tick.startZ
  const explainedX = intendedX + tick.ordinaryDeltaX + tick.caveDeltaX
  const explainedZ = intendedZ + tick.ordinaryDeltaZ + tick.caveDeltaZ
  const residualX = netX - explainedX
  const residualZ = netZ - explainedZ
  const backwardFinal = movementBackwardAmount(residualX, residualZ, intendedX, intendedZ)

  let worstStage: MovementSnapStage = 'none'
  let worstBackward = 0
  const horizontalStages: [MovementSnapStage, number][] = [
    ['slope', backwardSlope],
    ['ordinary-collider', backwardOrdinary],
    ['cave-horizontal', backwardCave],
  ]
  for (const [stage, amount] of horizontalStages) {
    if (amount > worstBackward) {
      worstBackward = amount
      worstStage = stage
    }
  }
  if (backwardFinal > worstBackward && backwardFinal >= MOVEMENT_BACKWARD_EPSILON) {
    worstBackward = backwardFinal
    worstStage = 'final'
  }
  if (worstBackward < MOVEMENT_BACKWARD_EPSILON) {
    worstStage = 'none'
    worstBackward = 0
  }
  return {
    backwardSlope,
    backwardOrdinary,
    backwardCave,
    backwardFinal,
    worstStage,
    worstBackward,
  }
}

function copyTick(src: PlayerMovementTraceTick): PlayerMovementTraceTick {
  return { ...src, influencingCollider: src.influencingCollider ? { ...src.influencingCollider } : null,
    heightfield: src.heightfield ? { ...src.heightfield } : null }
}

function emptyTick(): PlayerMovementTraceTick {
  return {
    seq: 0,
    frame: 0,
    startX: 0,
    startY: 0,
    startZ: 0,
    grounded: false,
    verticalVelocity: 0,
    rawWishX: 0,
    rawWishZ: 0,
    slopeBeforeX: 0,
    slopeBeforeZ: 0,
    slopeAfterX: 0,
    slopeAfterZ: 0,
    slopeDeltaX: 0,
    slopeDeltaZ: 0,
    slopeAngleDeg: null,
    candidateX: 0,
    candidateZ: 0,
    ordinaryBeforeX: 0,
    ordinaryBeforeZ: 0,
    ordinaryAfterX: 0,
    ordinaryAfterZ: 0,
    ordinaryDeltaX: 0,
    ordinaryDeltaZ: 0,
    activeColliderCount: 0,
    influencingCollider: null,
    caveBeforeX: 0,
    caveBeforeZ: 0,
    caveAfterX: 0,
    caveAfterZ: 0,
    caveDeltaX: 0,
    caveDeltaZ: 0,
    heightfield: null,
    groundSource: 'surface',
    groundY: 0,
    yBeforeVertical: 0,
    yAfterVertical: 0,
    groundedAfter: false,
    verticalVelocityAfter: 0,
    finalX: 0,
    finalY: 0,
    finalZ: 0,
    intendedX: 0,
    intendedZ: 0,
    backwardSlope: 0,
    backwardOrdinary: 0,
    backwardCave: 0,
    backwardFinal: 0,
    worstStage: 'none',
    worstBackward: 0,
  }
}

export function findLargestBackwardEvent(ticks: readonly PlayerMovementTraceTick[]): PlayerMovementTraceTick | null {
  let best: PlayerMovementTraceTick | null = null
  for (const tick of ticks) {
    if (tick.worstBackward <= 0) continue
    if (!best || tick.worstBackward > best.worstBackward) best = tick
  }
  return best
}

export function selectMovementTraceWindow(
  ticks: readonly PlayerMovementTraceTick[],
  centerSeq: number,
  before = 5,
  after = 4,
): PlayerMovementTraceTick[] {
  const index = ticks.findIndex((t) => t.seq === centerSeq)
  if (index < 0) return ticks.slice(-Math.min(ticks.length, before + 1 + after))
  const start = Math.max(0, index - before)
  const end = Math.min(ticks.length, index + after + 1)
  return ticks.slice(start, end).map(copyTick)
}

function fmt(n: number, digits = 3): string {
  return Number(n.toFixed(digits)).toString()
}

function formatMovementTraceReport(ticks: readonly PlayerMovementTraceTick[]): string {
  const lines: string[] = []
  const event = findLargestBackwardEvent(ticks)
  if (!event) {
    lines.push('No backward displacement >= ' + MOVEMENT_BACKWARD_EPSILON + ' m in buffer (' + ticks.length + ' ticks).')
    if (ticks.length > 0) {
      const last = ticks[ticks.length - 1]!
      lines.push('Last tick seq=' + last.seq + ' pos=(' + fmt(last.finalX) + ',' + fmt(last.finalY) + ',' + fmt(last.finalZ) + ')')
    }
    return lines.join('\n')
  }

  lines.push('Largest backward event:')
  lines.push('  tick: seq=' + event.seq + ' frame=' + event.frame)
  lines.push('  stage: ' + event.worstStage)
  if (event.worstStage !== 'none') {
    lines.push('  SNAP SOURCE: ' + event.worstStage)
  }
  lines.push('  backward: ' + fmt(event.worstBackward, 4) + ' m')
  lines.push('')
  lines.push('  start: (' + fmt(event.startX) + ', ' + fmt(event.startY) + ', ' + fmt(event.startZ) + ') grounded=' + event.grounded + ' vy=' + fmt(event.verticalVelocity))
  lines.push('  desired (raw wish): (' + fmt(event.rawWishX) + ', ' + fmt(event.rawWishZ) + ')')
  lines.push('  intended (post-slope): (' + fmt(event.intendedX) + ', ' + fmt(event.intendedZ) + ')')
  lines.push('  slope: before=(' + fmt(event.slopeBeforeX) + ',' + fmt(event.slopeBeforeZ) + ') after=(' + fmt(event.slopeAfterX) + ',' + fmt(event.slopeAfterZ) + ') Δ=(' + fmt(event.slopeDeltaX) + ',' + fmt(event.slopeDeltaZ) + ') backward=' + fmt(event.backwardSlope, 4) + (event.slopeAngleDeg != null ? ' angleDeg=' + fmt(event.slopeAngleDeg, 1) : ''))
  lines.push('  ordinary: before=(' + fmt(event.ordinaryBeforeX) + ',' + fmt(event.ordinaryBeforeZ) + ') after=(' + fmt(event.ordinaryAfterX) + ',' + fmt(event.ordinaryAfterZ) + ') Δ=(' + fmt(event.ordinaryDeltaX) + ',' + fmt(event.ordinaryDeltaZ) + ') backward=' + fmt(event.backwardOrdinary, 4) + ' activeColliders=' + event.activeColliderCount)
  lines.push('  cave: before=(' + fmt(event.caveBeforeX) + ',' + fmt(event.caveBeforeZ) + ') after=(' + fmt(event.caveAfterX) + ',' + fmt(event.caveAfterZ) + ') Δ=(' + fmt(event.caveDeltaX) + ',' + fmt(event.caveDeltaZ) + ') backward=' + fmt(event.backwardCave, 4))
  lines.push('  final: (' + fmt(event.finalX) + ', ' + fmt(event.finalY) + ', ' + fmt(event.finalZ) + ') residual-backward=' + fmt(event.backwardFinal, 4))
  lines.push('  playerY: beforeVertical=' + fmt(event.yBeforeVertical) + ' afterVertical=' + fmt(event.yAfterVertical))
  lines.push('  ground source: ' + event.groundSource + ' groundY=' + fmt(event.groundY))
  if (event.heightfield) {
    const h = event.heightfield
    lines.push('  heightfield:')
    lines.push('    outsideGrid: ' + h.outsideGrid)
    lines.push('    openSky: ' + h.openSky)
    lines.push('    gap: ' + fmt(h.gap, 3))
    lines.push('    floorY: ' + fmt(h.floorY))
    lines.push('    ceilY: ' + fmt(h.ceilY))
    lines.push('    surfaceY: ' + fmt(h.surfaceY))
    lines.push('    playerY: ' + fmt(h.playerY))
  } else {
    lines.push('  heightfield: (null / outside cave grid)')
  }
  if (event.influencingCollider) {
    lines.push('  influencing collider: ' + JSON.stringify(event.influencingCollider))
  } else {
    lines.push('  influencing collider: none')
  }

  lines.push('')
  lines.push('Context ticks (seq | stage | back m | start→final xz | cave Δ | slope back | ord back):')
  const window = selectMovementTraceWindow(ticks, event.seq)
  for (const t of window) {
    const mark = t.seq === event.seq ? '*' : ' '
    lines.push(
      mark + ' ' + t.seq
      + ' | ' + (t.worstStage === 'none' ? '-' : t.worstStage)
      + ' | ' + fmt(t.worstBackward, 3)
      + ' | (' + fmt(t.startX) + ',' + fmt(t.startZ) + ')→(' + fmt(t.finalX) + ',' + fmt(t.finalZ) + ')'
      + ' | caveΔ(' + fmt(t.caveDeltaX) + ',' + fmt(t.caveDeltaZ) + ')'
      + ' | slopeB=' + fmt(t.backwardSlope, 3)
      + ' | ordB=' + fmt(t.backwardOrdinary, 3),
    )
  }
  return lines.join('\n')
}

export function createPlayerMovementTraceBuffer(
  capacity: number = PLAYER_MOVEMENT_TRACE_CAPACITY,
): PlayerMovementTraceBuffer {
  const size = Math.max(1, capacity)
  const slots: PlayerMovementTraceTick[] = Array.from({ length: size }, emptyTick)
  let next = 0
  let filled = 0
  let seq = 0
  let recording = false
  let frame = 0

  function writeSlot(partial: PlayerMovementTraceRecordInput): void {
    seq += 1
    frame += 1
    const classified = classifyMovementBackward(partial)
    const slot = slots[next]!
    Object.assign(slot, partial, classified, { seq, frame })
    next = (next + 1) % size
    if (filled < size) filled += 1
  }

  function snapshotRing(): PlayerMovementTraceTick[] {
    const out: PlayerMovementTraceTick[] = []
    const start = filled < size ? 0 : next
    for (let i = 0; i < filled; i++) {
      out.push(copyTick(slots[(start + i) % size]!))
    }
    return out
  }

  return {
    start() {
      recording = true
    },
    stop() {
      recording = false
    },
    isRecording() {
      return recording
    },
    record(tick) {
      if (!recording) return
      writeSlot(tick)
    },
    snapshot() {
      return { recording, ticks: snapshotRing() }
    },
    clear() {
      next = 0
      filled = 0
      seq = 0
      frame = 0
      recording = false
    },
    printReport() {
      return formatMovementTraceReport(snapshotRing())
    },
  }
}

export function emptyPlayerMovementTrace(): PlayerMovementTraceSnapshot {
  return { recording: false, ticks: [] }
}

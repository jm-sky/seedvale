import { copyVec3, type Vec3, vec3 } from './types'

/**
 * Shared FIFO interaction queue (plan 079) — well drink is the first client;
 * garden / stall / stockpile can reuse the same type with a new `id` + config.
 *
 * Pure simulation data: no Three.js. Agents are opaque string ids.
 */

export type InteractionQueueConfig = {
  /** World anchor (well / stall / stockpile). */
  anchor: Vec3
  /** Horizontal direction of the waiting line (unit xz preferred). */
  lineDir: { x: number, z: number }
  /**
   * Distance along `lineDir` from `anchor` to the serving stand point.
   * Keeps agents clear of the prop mesh (e.g. well rim + margin).
   */
  servingOffset: number
  /** Distance between waiting slots (world units). */
  spacing: number
  /** Waiting indices beyond this share the last visible slot. */
  maxVisibleSlots: number
  /** How many agents may occupy the serving point at once (v1 well = 1). */
  servingCapacity: number
}

export type InteractionQueue = {
  readonly id: string
  readonly config: Readonly<InteractionQueueConfig>
  join(agentId: string): void
  leave(agentId: string): void
  /** Move head of waiting into serving when capacity allows. */
  claimServing(agentId: string): boolean
  /** Drop from serving (and waiting, if somehow still listed). */
  releaseServing(agentId: string): void
  indexOf(agentId: string): number
  isServing(agentId: string): boolean
  isMember(agentId: string): boolean
  canEnterServing(agentId: string): boolean
  /** Destination for this agent: serving point when eligible/serving, else waiting slot. */
  worldDestination(agentId: string): Vec3
  servingPoint(): Vec3
}

type MutableQueue = InteractionQueue & {
  waiting: string[]
  serving: Set<string>
}

function normalizeLineDir(dir: { x: number, z: number }): { x: number, z: number } {
  const len = Math.hypot(dir.x, dir.z)
  if (len < 1e-6) return { x: 0, z: 1 }
  return { x: dir.x / len, z: dir.z / len }
}

function offsetAlong(
  anchor: Vec3,
  lineDir: { x: number, z: number },
  dist: number,
): Vec3 {
  return vec3(
    anchor.x + lineDir.x * dist,
    anchor.y,
    anchor.z + lineDir.z * dist,
  )
}

function waitingSlotPosition(
  config: Readonly<InteractionQueueConfig>,
  lineDir: { x: number, z: number },
  waitingIndex: number,
): Vec3 {
  const slot = Math.min(Math.max(0, waitingIndex), Math.max(0, config.maxVisibleSlots - 1))
  // Head of queue stands one spacing behind the serving point along lineDir.
  const dist = config.servingOffset + config.spacing * (slot + 1)
  return offsetAlong(config.anchor, lineDir, dist)
}

export function createInteractionQueue(
  id: string,
  config: InteractionQueueConfig,
): InteractionQueue {
  const lineDir = normalizeLineDir(config.lineDir)
  const frozenConfig: InteractionQueueConfig = {
    anchor: copyVec3(config.anchor),
    lineDir: { ...lineDir },
    servingOffset: Math.max(0, config.servingOffset),
    spacing: config.spacing,
    maxVisibleSlots: Math.max(1, config.maxVisibleSlots),
    servingCapacity: Math.max(1, config.servingCapacity),
  }

  const queue: MutableQueue = {
    id,
    config: frozenConfig,
    waiting: [],
    serving: new Set(),
    join(agentId) {
      if (queue.serving.has(agentId) || queue.waiting.includes(agentId)) return
      queue.waiting.push(agentId)
    },
    leave(agentId) {
      queue.serving.delete(agentId)
      const i = queue.waiting.indexOf(agentId)
      if (i >= 0) queue.waiting.splice(i, 1)
    },
    claimServing(agentId) {
      if (queue.serving.has(agentId)) return true
      if (queue.waiting[0] !== agentId) return false
      if (queue.serving.size >= frozenConfig.servingCapacity) return false
      queue.waiting.shift()
      queue.serving.add(agentId)
      return true
    },
    releaseServing(agentId) {
      queue.serving.delete(agentId)
      const i = queue.waiting.indexOf(agentId)
      if (i >= 0) queue.waiting.splice(i, 1)
    },
    indexOf(agentId) {
      return queue.waiting.indexOf(agentId)
    },
    isServing(agentId) {
      return queue.serving.has(agentId)
    },
    isMember(agentId) {
      return queue.serving.has(agentId) || queue.waiting.includes(agentId)
    },
    canEnterServing(agentId) {
      return (
        queue.waiting[0] === agentId
        && queue.serving.size < frozenConfig.servingCapacity
      )
    },
    servingPoint() {
      return offsetAlong(frozenConfig.anchor, lineDir, frozenConfig.servingOffset)
    },
    worldDestination(agentId) {
      if (queue.serving.has(agentId) || queue.canEnterServing(agentId)) {
        return queue.servingPoint()
      }
      const i = queue.waiting.indexOf(agentId)
      if (i < 0) return queue.servingPoint()
      return waitingSlotPosition(frozenConfig, lineDir, i)
    },
  }

  return queue
}

/** Convenience id for a settlement's well drink queue. */
export function wellQueueId(settlementId: string): string {
  return `${settlementId}:well`
}

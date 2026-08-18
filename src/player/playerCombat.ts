import type { Interactable } from '../interaction/Interactable'
import type { Fauna } from '../fauna/createFauna'
import type { Settlement } from '../settlement/createSettlement'
import type { Vector3 } from 'three'
import { type MeleeHitCandidate, rankCombatTargets } from './playerMelee'
import { COMBAT_TARGET_CONE_DOT, COMBAT_TARGET_RANGE, type CombatAimMode } from '../app/interactables'

/** Seconds without combat activity before combat mode ends (plan 150 §1). */
export const COMBAT_MODE_TIMEOUT_SEC = 8

export type LivingCombatTarget = {
  /** Prefixed id — `animal:<animalId>` or `npc:<npcId>`. */
  id: string
  x: number
  z: number
  interactable: Interactable
}

export type PlayerCombat = {
  isActive: () => boolean
  enter: () => void
  noteActivity: () => void
  update: (dt: number) => void
  softLockId: () => string | null
  setSoftLock: (id: string | null) => void
  livingCycleIndex: () => number
  setLivingCycleIndex: (index: number) => void
  worldCycleActive: () => boolean
  setWorldCycleActive: (active: boolean) => void
  worldCycleIndex: () => number
  setWorldCycleIndex: (index: number) => void
}

function withinRange(x: number, z: number, playerPos: Vector3, range: number): boolean {
  const dx = x - playerPos.x
  const dz = z - playerPos.z
  return dx * dx + dz * dz <= range * range
}

export function livingTargetIdForAnimal(animalId: string): string {
  return `animal:${animalId}`
}

export function livingTargetIdForNpc(npcId: string): string {
  return `npc:${npcId}`
}

/** Living combat targets inside acquisition range/cone (plan 150 §2). */
export function collectLivingCombatTargets(
  settlements: readonly Settlement[],
  fauna: Fauna,
  playerPos: Vector3,
  playerYaw: number,
  aim: CombatAimMode,
  recentTargetIds: readonly string[],
): LivingCombatTarget[] {
  const candidates: MeleeHitCandidate[] = []
  const byId = new Map<string, LivingCombatTarget>()

  const addAnimal = (animal: { animalId: string, mesh: { position: { x: number, z: number } }, isDead: () => boolean }, interactable: Interactable): void => {
    if (animal.isDead()) return
    const { x, z } = animal.mesh.position
    if (!withinRange(x, z, playerPos, COMBAT_TARGET_RANGE)) return
    const id = livingTargetIdForAnimal(animal.animalId)
    candidates.push({ id, x, z, alive: true })
    byId.set(id, { id, x, z, interactable })
  }

  for (const settlement of settlements) {
    for (const animal of settlement.livestock) {
      addAnimal(animal, {
        kind: 'animal',
        position: animal.mesh.position,
        promptLabel: '',
        animal,
      })
    }
    for (const npc of settlement.npcs) {
      if (npc.health.dead) continue
      const { x, z } = npc.mesh.position
      if (!withinRange(x, z, playerPos, COMBAT_TARGET_RANGE)) continue
      const id = livingTargetIdForNpc(npc.id)
      candidates.push({ id, x, z, alive: true })
      byId.set(id, {
        id,
        x,
        z,
        interactable: {
          kind: 'npc',
          position: npc.mesh.position,
          promptLabel: '',
          npc,
          settlement,
        },
      })
    }
  }
  for (const animal of fauna.getAgents()) {
    addAnimal(animal, {
      kind: 'animal',
      position: animal.mesh.position,
      promptLabel: '',
      animal,
    })
  }

  const memoryIds = recentTargetIds.map((raw) => (
    raw.startsWith('animal:') || raw.startsWith('npc:') ? raw : livingTargetIdForAnimal(raw)
  ))
  const rankedIds = rankCombatTargets(
    candidates,
    playerPos.x,
    playerPos.z,
    playerYaw,
    COMBAT_TARGET_RANGE,
    COMBAT_TARGET_CONE_DOT[aim],
    memoryIds,
  )
  return rankedIds.map((id) => byId.get(id)!).filter(Boolean)
}

/** Non-living interactables eligible for `Shift+Tab` (plan 150 §2). */
export function filterWorldCycleTargets(interactables: readonly Interactable[]): Interactable[] {
  return interactables.filter((c) => c.kind !== 'animal' && c.kind !== 'npc')
}

export function findLivingTargetById(
  targets: readonly LivingCombatTarget[],
  id: string | null,
): LivingCombatTarget | null {
  if (!id) return null
  return targets.find((t) => t.id === id) ?? null
}

/** Rejoins a soft-lock id to this frame's fully-built interactable (prompt
 *  labels, quest ranges, etc.) — `collectLivingCombatTargets` only carries
 *  geometry. */
export function resolveLivingInteractable(
  softLockId: string | null,
  interactables: readonly Interactable[],
): Interactable | null {
  if (!softLockId) return null
  if (softLockId.startsWith('animal:')) {
    const animalId = softLockId.slice('animal:'.length)
    return interactables.find((c) => c.kind === 'animal' && c.animal.animalId === animalId) ?? null
  }
  if (softLockId.startsWith('npc:')) {
    const npcId = softLockId.slice('npc:'.length)
    return interactables.find((c) => c.kind === 'npc' && c.npc.id === npcId) ?? null
  }
  return null
}

export function createPlayerCombat(): PlayerCombat {
  let active = false
  let idleTimer = 0
  let softLock: string | null = null
  let livingIndex = 0
  let worldActive = false
  let worldIndex = 0

  return {
    isActive: () => active,
    enter() {
      active = true
      idleTimer = COMBAT_MODE_TIMEOUT_SEC
    },
    noteActivity() {
      if (!active) active = true
      idleTimer = COMBAT_MODE_TIMEOUT_SEC
    },
    update(dt) {
      if (!active) return
      idleTimer -= dt
      if (idleTimer <= 0) {
        active = false
        softLock = null
        livingIndex = 0
        worldActive = false
        worldIndex = 0
      }
    },
    softLockId: () => softLock,
    setSoftLock(id) { softLock = id },
    livingCycleIndex: () => livingIndex,
    setLivingCycleIndex(index) { livingIndex = index },
    worldCycleActive: () => worldActive,
    setWorldCycleActive(value) { worldActive = value },
    worldCycleIndex: () => worldIndex,
    setWorldCycleIndex(index) { worldIndex = index },
  }
}

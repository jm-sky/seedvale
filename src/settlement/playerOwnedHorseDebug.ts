import type { AnimalAgent } from '../fauna/AnimalAgent'
import {
  isPlayerOwnedLivestockRecord,
  type LivestockSaveRecord,
  type PersistentLivestockContext,
  resolveLivePersistentAnimal,
} from './livestock'

/** Offset so a teleported horse is next to the player, not inside the capsule. */
const TELEPORT_OFFSET_X = 3

export type PlayerOwnedHorseDebugStatus = 'live' | 'live-dead' | 'saved-only' | 'tombstoned'

export type PlayerOwnedHorseDebugSnapshot = {
  animalId: string
  name?: string
  originSettlementId: string
  live: boolean
  dead: boolean
  owner: LivestockSaveRecord['owner']
  mode?: NonNullable<LivestockSaveRecord['control']>['mode']
  stayAnchor?: { x: number, z: number }
  x?: number
  y?: number
  z?: number
  health?: { current: number, max: number }
  hunger?: number
  thirst?: number
  stamina?: number
  status: PlayerOwnedHorseDebugStatus
}

export type HorseDebugCandidate = {
  animalId: string
  name?: string
  originSettlementId: string
}

export type HorseDebugCommandResult =
  | { ok: true, reason: string, animalId: string }
  | { ok: false, reason: string, animalId?: string, candidates?: HorseDebugCandidate[] }

function isPlayerOwnedHorseRecord(record: LivestockSaveRecord): boolean {
  return record.kind === 'horse' && isPlayerOwnedLivestockRecord(record)
}

function isPlayerOwnedHorseAgent(animal: AnimalAgent): boolean {
  return animal.def.kind === 'horse' && animal.isPlayerOwned()
}

function candidateOf(animalId: string, originSettlementId: string, name?: string): HorseDebugCandidate {
  return name ? { animalId, originSettlementId, name } : { animalId, originSettlementId }
}

function fail(reason: string, candidates?: HorseDebugCandidate[]): Extract<HorseDebugCommandResult, { ok: false }> {
  return candidates && candidates.length > 0 ? { ok: false, reason, candidates } : { ok: false, reason }
}

function ok(animalId: string, reason: string): Extract<HorseDebugCommandResult, { ok: true }> {
  return { ok: true, reason, animalId }
}

type HorseSelection =
  | { ok: true, animalId: string, originSettlementId: string }
  | Extract<HorseDebugCommandResult, { ok: false }>

function livePlayerOwnedHorses(ctx: PersistentLivestockContext): { animal: AnimalAgent, originSettlementId: string }[] {
  const out: { animal: AnimalAgent, originSettlementId: string }[] = []
  for (const animal of ctx.detached) {
    const origin = ctx.detachedOriginById.get(animal.animalId)
    if (origin && isPlayerOwnedHorseAgent(animal)) out.push({ animal, originSettlementId: origin })
  }
  for (const settlement of ctx.getLoadedSettlements()) {
    for (const animal of settlement.livestock) {
      if (isPlayerOwnedHorseAgent(animal)) out.push({ animal, originSettlementId: settlement.id })
    }
  }
  return out
}

function collectPlayerOwnedHorseIds(ctx: PersistentLivestockContext): Map<string, HorseDebugCandidate> {
  const byId = new Map<string, HorseDebugCandidate>()
  for (const { animal, originSettlementId } of livePlayerOwnedHorses(ctx)) {
    byId.set(animal.animalId, candidateOf(animal.animalId, originSettlementId, animal.getName()))
  }
  for (const record of ctx.registry.serialize().entries) {
    if (!isPlayerOwnedHorseRecord(record) || byId.has(record.animalId)) continue
    byId.set(record.animalId, candidateOf(record.animalId, record.settlementId, record.name))
  }
  for (const [settlementId, ids] of collectRemovedHorseSnapshots(ctx)) {
    for (const record of ids) {
      if (byId.has(record.animalId)) continue
      byId.set(record.animalId, candidateOf(record.animalId, settlementId, record.name))
    }
  }
  return byId
}

function collectRemovedHorseSnapshots(ctx: PersistentLivestockContext): Map<string, LivestockSaveRecord[]> {
  const out = new Map<string, LivestockSaveRecord[]>()
  const { removedIds } = ctx.registry.serialize()
  for (const composite of removedIds) {
    const sep = composite.indexOf(':')
    if (sep < 0) continue
    const settlementId = composite.slice(0, sep)
    const animalId = composite.slice(sep + 1)
    const snapshot = ctx.registry.getRemovedSnapshot(settlementId, animalId)
    if (!snapshot || !isPlayerOwnedHorseRecord(snapshot)) continue
    const list = out.get(settlementId) ?? []
    list.push(snapshot)
    out.set(settlementId, list)
  }
  return out
}

function resolveHorseSelection(
  ctx: PersistentLivestockContext,
  animalId: string | undefined,
): HorseSelection {
  const candidates = [...collectPlayerOwnedHorseIds(ctx).values()]
  if (animalId) {
    const hit = candidates.find((c) => c.animalId === animalId)
    if (!hit) {
      const live = resolveLivePersistentAnimal(ctx, animalId)
      if (live && !isPlayerOwnedHorseAgent(live.animal)) {
        return fail(live.animal.isPlayerOwned() ? 'not-horse' : 'not-player-owned')
      }
      const saved = ctx.registry.serialize().entries.find((e) => e.animalId === animalId)
      if (saved && saved.kind === 'horse' && !isPlayerOwnedLivestockRecord(saved)) {
        return fail('not-player-owned')
      }
      return fail('not-found')
    }
    return { ok: true, animalId: hit.animalId, originSettlementId: hit.originSettlementId }
  }
  if (candidates.length === 1) {
    const only = candidates[0]!
    return { ok: true, animalId: only.animalId, originSettlementId: only.originSettlementId }
  }
  if (candidates.length === 0) return fail('not-found')
  return fail('ambiguous', candidates)
}

function snapshotFromAgent(
  animal: AnimalAgent,
  originSettlementId: string,
): PlayerOwnedHorseDebugSnapshot {
  const save = animal.snapshot()
  const dead = animal.isDead()
  return {
    animalId: animal.animalId,
    name: animal.getName(),
    originSettlementId,
    live: true,
    dead,
    owner: animal.getOwner(),
    mode: save.control?.mode,
    stayAnchor: save.control?.stayAnchor,
    x: animal.mesh.position.x,
    y: animal.mesh.position.y,
    z: animal.mesh.position.z,
    health: { current: animal.health.currentHp, max: animal.health.maxHp },
    hunger: animal.life.hunger,
    thirst: animal.life.thirst,
    stamina: animal.life.stamina.current,
    status: dead ? 'live-dead' : 'live',
  }
}

function snapshotFromRecord(
  record: LivestockSaveRecord,
  status: PlayerOwnedHorseDebugStatus,
): PlayerOwnedHorseDebugSnapshot {
  return {
    animalId: record.animalId,
    name: record.name,
    originSettlementId: record.settlementId,
    live: false,
    dead: record.health.dead || status === 'tombstoned',
    owner: record.owner,
    mode: record.control?.mode,
    stayAnchor: record.control?.stayAnchor,
    x: record.x,
    z: record.z,
    health: { current: record.health.current, max: record.health.max },
    hunger: record.life.hunger,
    thirst: record.life.thirst,
    stamina: record.life.stamina,
    status,
  }
}

function aliveRecord(record: LivestockSaveRecord, x: number, z: number): LivestockSaveRecord {
  return {
    ...record,
    x,
    z,
    health: { ...record.health, current: Math.max(1, record.health.max), dead: false },
    life: { ...record.life, stamina: 1 },
    corpse: null,
    owner: record.owner ?? { kind: 'player' },
  }
}

/**
 * @domain fauna
 * @role Plain diagnostic list of player-owned horses from persistent livestock
 *  authority (live, saved-only, tombstoned). Never returns `AnimalAgent`.
 */
export function listPlayerOwnedHorses(ctx: PersistentLivestockContext): PlayerOwnedHorseDebugSnapshot[] {
  const byId = new Map<string, PlayerOwnedHorseDebugSnapshot>()
  for (const { animal, originSettlementId } of livePlayerOwnedHorses(ctx)) {
    byId.set(animal.animalId, snapshotFromAgent(animal, originSettlementId))
  }
  for (const record of ctx.registry.serialize().entries) {
    if (!isPlayerOwnedHorseRecord(record) || byId.has(record.animalId)) continue
    byId.set(record.animalId, snapshotFromRecord(record, 'saved-only'))
  }
  for (const [settlementId, records] of collectRemovedHorseSnapshots(ctx)) {
    for (const record of records) {
      if (byId.has(record.animalId)) continue
      byId.set(record.animalId, snapshotFromRecord({ ...record, settlementId }, 'tombstoned'))
    }
  }
  return [...byId.values()]
}

/**
 * @domain fauna
 * @role Debug teleport of an existing live player-owned horse through the
 *  agent's ground-snap seam. Preserves identity/owner/name/control.
 */
export function teleportPlayerOwnedHorseToPlayer(
  ctx: PersistentLivestockContext,
  playerPos: { x: number, z: number },
  animalId?: string,
): HorseDebugCommandResult {
  const selected = resolveHorseSelection(ctx, animalId)
  if (!selected.ok) return selected
  const resolved = resolveLivePersistentAnimal(ctx, selected.animalId)
  if (!resolved || !isPlayerOwnedHorseAgent(resolved.animal)) return fail('not-live', [candidateOf(selected.animalId, selected.originSettlementId)])
  if (resolved.animal.isMounted()) return fail('mounted', [candidateOf(selected.animalId, resolved.originSettlementId, resolved.animal.getName())])
  resolved.animal.relocateOnGround(playerPos.x + TELEPORT_OFFSET_X, playerPos.z)
  ctx.registry.upsert(resolved.originSettlementId, resolved.animal)
  return ok(resolved.animal.animalId, 'teleported')
}

/**
 * @domain fauna
 * @role Debug resurrection of a player-owned horse identity. Live corpses are
 *  revived in place; tombstoned individuals restore one saved record and one
 *  spawned agent. Never creates a second `animalId`.
 */
export async function resurrectPlayerOwnedHorse(
  ctx: PersistentLivestockContext,
  spawnFromRecord: (record: LivestockSaveRecord) => Promise<AnimalAgent>,
  playerPos: { x: number, z: number },
  animalId?: string,
): Promise<HorseDebugCommandResult> {
  const selected = resolveHorseSelection(ctx, animalId)
  if (!selected.ok) return selected
  const live = resolveLivePersistentAnimal(ctx, selected.animalId)
  if (live && isPlayerOwnedHorseAgent(live.animal)) {
    if (!live.animal.isDead()) return ok(live.animal.animalId, 'already-alive')
    live.animal.reviveForDebug()
    ctx.registry.upsert(live.originSettlementId, live.animal)
    return ok(live.animal.animalId, 'revived')
  }

  const snapshot = ctx.registry.getRemovedSnapshot(selected.originSettlementId, selected.animalId)
    ?? ctx.registry.serialize().entries.find((e) => e.animalId === selected.animalId && e.settlementId === selected.originSettlementId)
  if (!snapshot || !isPlayerOwnedHorseRecord(snapshot)) {
    return fail('tombstone-record-unavailable')
  }

  const restored = aliveRecord(snapshot, playerPos.x + TELEPORT_OFFSET_X, playerPos.z)
  ctx.registry.restoreRemoved(restored)
  const agent = await spawnFromRecord(restored)
  if (!ctx.detachedById.has(agent.animalId)) {
    ctx.detached.push(agent)
    ctx.detachedById.set(agent.animalId, agent)
  }
  ctx.detachedOriginById.set(agent.animalId, restored.settlementId)
  ctx.registry.upsert(restored.settlementId, agent)
  return ok(agent.animalId, 'restored')
}

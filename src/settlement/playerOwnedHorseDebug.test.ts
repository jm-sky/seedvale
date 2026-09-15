import { describe, expect, it, vi } from 'vitest'
import type { AnimalAgent, AnimalSaveState } from '../fauna/AnimalAgent'
import {
  createLivestockRegistry,
  type PersistentLivestockContext,
} from './livestock'
import {
  listPlayerOwnedHorses,
  resurrectPlayerOwnedHorse,
  teleportPlayerOwnedHorseToPlayer,
} from './playerOwnedHorseDebug'

function fakeHorse(
  animalId: string,
  opts: {
    owner?: AnimalSaveState['owner']
    dead?: boolean
    mounted?: boolean
    x?: number
    z?: number
    name?: string
    control?: AnimalSaveState['control']
    kind?: 'horse' | 'chicken'
  } = {},
): AnimalAgent {
  const owner = opts.owner ?? { kind: 'player' as const }
  const kind = opts.kind ?? 'horse'
  let dead = opts.dead ?? false
  const pos = { x: opts.x ?? 40, y: 1, z: opts.z ?? -8 }
  const state: AnimalSaveState = {
    x: pos.x,
    z: pos.z,
    yaw: 0,
    health: { current: dead ? 0 : 10, max: 10, dead },
    life: { hunger: 0.2, thirst: 0.1, stamina: 1 },
    productionReadyAtDays: null,
    eggPending: false,
    corpse: dead ? { deathAtDays: 1, meatHarvested: false } : null,
    owner,
    name: opts.name,
    control: opts.control,
  }
  const agent = {
    animalId,
    def: { kind },
    mesh: { position: pos },
    health: { currentHp: state.health.current, maxHp: 10, dead },
    life: { hunger: 0.2, thirst: 0.1, stamina: { current: 8, max: 10 } },
    getOwner: () => owner,
    isPlayerOwned: () => owner?.kind === 'player',
    isDead: () => dead,
    isMounted: () => opts.mounted === true,
    getName: () => opts.name,
    snapshot: () => ({ ...state, health: { ...state.health, dead }, x: pos.x, z: pos.z }),
    relocateOnGround: vi.fn((x: number, z: number) => {
      pos.x = x
      pos.z = z
    }),
    reviveForDebug: vi.fn(() => {
      if (!dead) return false
      dead = false
      agent.health.dead = false
      agent.health.currentHp = 10
      return true
    }),
  }
  return agent as unknown as AnimalAgent
}

function ctxFor(opts: {
  animals?: AnimalAgent[]
  origin?: string
  loaded?: { id: string, livestock: AnimalAgent[] }[]
}): PersistentLivestockContext {
  const origin = opts.origin ?? 'home'
  const animals = opts.animals ?? []
  const detachedById = new Map(animals.map((a) => [a.animalId, a]))
  const detachedOriginById = new Map(animals.map((a) => [a.animalId, origin]))
  const registry = createLivestockRegistry()
  for (const animal of animals) registry.upsert(origin, animal)
  return {
    getLoadedSettlements: () => opts.loaded ?? [],
    detached: [...animals],
    detachedById,
    detachedOriginById,
    registry,
  }
}

describe('player-owned horse debug operations', () => {
  it('list includes a detached player-owned horse as plain data', () => {
    const horse = fakeHorse('horse-house0-0', { name: 'Bucefał', x: 9, z: 4 })
    const listed = listPlayerOwnedHorses(ctxFor({ animals: [horse] }))
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      animalId: 'horse-house0-0',
      name: 'Bucefał',
      originSettlementId: 'home',
      live: true,
      dead: false,
      status: 'live',
      x: 9,
      z: 4,
    })
    expect(listed[0]).not.toHaveProperty('mesh')
  })

  it('ambiguous no-id teleport refuses with candidates', () => {
    const a = fakeHorse('horse-a')
    const b = fakeHorse('horse-b')
    const result = teleportPlayerOwnedHorseToPlayer(
      ctxFor({ animals: [a, b] }),
      { x: 0, z: 0 },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('ambiguous')
    expect(result.candidates?.map((c) => c.animalId).sort()).toEqual(['horse-a', 'horse-b'])
  })

  it('teleport preserves identity/owner/control and persists new position', () => {
    const horse = fakeHorse('horse-house0-0', {
      name: 'Iskra',
      control: { mode: 'stay', stayAnchor: { x: 1, z: 2 } },
    })
    const ctx = ctxFor({ animals: [horse] })
    const result = teleportPlayerOwnedHorseToPlayer(ctx, { x: 100, z: 50 })
    expect(result).toEqual({ ok: true, reason: 'teleported', animalId: 'horse-house0-0' })
    expect(horse.relocateOnGround).toHaveBeenCalledWith(103, 50)
    expect(horse.isPlayerOwned()).toBe(true)
    expect(horse.getName()).toBe('Iskra')
    expect(horse.snapshot().control).toEqual({ mode: 'stay', stayAnchor: { x: 1, z: 2 } })
    expect(ctx.registry.getSaved('home')?.get('horse-house0-0')?.x).toBe(103)
  })

  it('refuses to teleport a household-owned horse', () => {
    const horse = fakeHorse('horse-house0-0', { owner: { kind: 'household', houseId: 'home:home:0' } })
    const ctx = ctxFor({ animals: [horse] })
    expect(teleportPlayerOwnedHorseToPlayer(ctx, { x: 0, z: 0 }, 'horse-house0-0')).toEqual({
      ok: false,
      reason: 'not-player-owned',
    })
  })

  it('resurrect live corpse keeps the same agent id', async () => {
    const horse = fakeHorse('merchant-horse-home', { dead: true, name: 'Gniady' })
    const ctx = ctxFor({ animals: [horse] })
    const spawn = vi.fn()
    const result = await resurrectPlayerOwnedHorse(ctx, spawn, { x: 0, z: 0 })
    expect(result).toEqual({ ok: true, reason: 'revived', animalId: 'merchant-horse-home' })
    expect(horse.reviveForDebug).toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
    expect(ctx.detached).toHaveLength(1)
    expect(ctx.detached[0]).toBe(horse)
  })

  it('resurrect tombstoned horse restores one record and no conflicting tombstone', async () => {
    const horse = fakeHorse('horse-house0-0', { dead: true, name: 'Wichura' })
    const ctx = ctxFor({ animals: [horse] })
    ctx.registry.markRemoved('home', 'horse-house0-0')
    ctx.detached.length = 0
    ctx.detachedById.clear()
    ctx.detachedOriginById.clear()

    const spawned = fakeHorse('horse-house0-0', { name: 'Wichura', x: 3, z: 0 })
    const result = await resurrectPlayerOwnedHorse(
      ctx,
      async () => spawned,
      { x: 0, z: 0 },
      'horse-house0-0',
    )
    expect(result).toEqual({ ok: true, reason: 'restored', animalId: 'horse-house0-0' })
    expect(ctx.detached).toEqual([spawned])
    expect(ctx.detachedById.get('horse-house0-0')).toBe(spawned)
    const snap = ctx.registry.serialize()
    expect(snap.entries).toHaveLength(1)
    expect(snap.entries[0]!.animalId).toBe('horse-house0-0')
    expect(snap.removedIds).toEqual([])
    expect(listPlayerOwnedHorses(ctx).filter((h) => h.animalId === 'horse-house0-0')).toHaveLength(1)
  })
})

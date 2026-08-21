import { describe, expect, it } from 'vitest'
import type { AnimalAgent } from './AnimalAgent'
import { combatTargetForAnimal, createHealthState, damageFor, damageVsHuman, isMeleeTool, MAX_HP } from './faunaCombat'

/** Narrow fake covering only what `combatTargetForAnimal` touches — a full
 *  `AnimalAgent` needs a GLTF/scene graph this test doesn't want. */
function fakeAnimal(overrides: { dead?: boolean, x?: number, z?: number } = {}): AnimalAgent & { damages: [number, string | undefined][] } {
  const damages: [number, string | undefined][] = []
  const dead = overrides.dead ?? false
  return {
    animalId: 'wolf-1',
    mesh: { position: { x: overrides.x ?? 3, z: overrides.z ?? 4 } },
    isDead: () => dead,
    takeDamage: (amount: number, source?: 'npc' | 'player') => damages.push([amount, source]),
    damages,
  } as unknown as AnimalAgent & { damages: [number, string | undefined][] }
}

describe('faunaCombat (createHealthState re-exported from shared, MAX_HP/damageFor fauna-local)', () => {
  it('createHealthState still builds a full-health state after the shared/ extraction', () => {
    expect(createHealthState(MAX_HP.wolf)).toEqual({ maxHp: 50, currentHp: 50, dead: false })
  })

  it('has a MAX_HP entry for every animal kind', () => {
    expect(MAX_HP).toEqual({
      wolf: 50,
      fox: 25,
      deer: 30,
      stag: 40,
      rabbit: 10,
      duck: 8,
      boar: 35,
      horse: 80,
      donkey: 55,
      cow: 70,
      sheep: 22,
      chicken: 6,
    })
  })

  it('looks up predator/prey damage, falling back to the default', () => {
    expect(damageFor('wolf', 'deer')).toBe(15)
    expect(damageFor('fox', 'stag')).toBe(6)
    expect(damageFor('wolf', 'fox')).toBe(8) // no table entry -> DEFAULT_DAMAGE
  })

  it('looks up predator→human damage (plan 056)', () => {
    expect(damageVsHuman('wolf')).toBe(12)
    expect(damageVsHuman('fox')).toBe(6)
    expect(damageVsHuman('boar')).toBe(8) // no table entry -> DEFAULT_DAMAGE
  })

  it('flags melee-capable tools via ITEM_CATALOG (plan 123 — damage/timing assertions moved to playerMelee.test.ts)', () => {
    expect(isMeleeTool('long_sword')).toBe(true)
    expect(isMeleeTool('axe')).toBe(true)
    expect(isMeleeTool('pitchfork')).toBe(true)
    expect(isMeleeTool('sickle')).toBe(true)
    expect(isMeleeTool('knife')).toBe(true)
    expect(isMeleeTool('shovel')).toBe(true)
    expect(isMeleeTool('damascus_knife')).toBe(true)
    expect(isMeleeTool('damascus_short_sword')).toBe(true)
    expect(isMeleeTool('damascus_long_sword')).toBe(true)
    expect(isMeleeTool('masterwork_sword')).toBe(true)
    expect(isMeleeTool('obsidian_sword')).toBe(true)
    expect(isMeleeTool('battle_axe')).toBe(true)
    expect(isMeleeTool('pickaxe')).toBe(false)
    expect(isMeleeTool('firestarter')).toBe(false)
    expect(isMeleeTool(null)).toBe(false)
  })
})

describe('combatTargetForAnimal (plan 177)', () => {
  it('exposes id, position and alive state from the live agent', () => {
    const animal = fakeAnimal({ x: 3, z: 4 })
    const target = combatTargetForAnimal(animal)
    expect(target.ref).toEqual({ id: 'wolf-1', kind: 'animal' })
    expect(target.getPosition()).toEqual({ x: 3, z: 4 })
    expect(target.isAlive()).toBe(true)
  })

  it('reports no position and not alive once the animal is dead', () => {
    const animal = fakeAnimal({ dead: true })
    const target = combatTargetForAnimal(animal)
    expect(target.getPosition()).toBeNull()
    expect(target.isAlive()).toBe(false)
  })

  it('routes applyDamage through takeDamage with source "npc"', () => {
    const animal = fakeAnimal()
    combatTargetForAnimal(animal).applyDamage(12)
    expect(animal.damages).toEqual([[12, 'npc']])
  })
})

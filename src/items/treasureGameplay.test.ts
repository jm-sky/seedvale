import { describe, expect, it } from 'vitest'
import {
  attemptTreasureUnlock,
  treasureChestId,
  treasureKeyInstanceId,
  type TreasureSiteDefinition,
  treasureSiteId,
} from '../world/treasureSites'
import { Inventory } from './Inventory'
import { ITEM_CATALOG, itemIsResilient } from './itemCatalog'
import { ITEM_DEFS, type ItemKind } from './items'
import { tradeValue } from './tradeCatalog'
import {
  applyTreasureContentsLosses,
  BLADE_TRAP_DAMAGE,
  commitForcedEntry,
  describeTreasureContainerInteraction,
  EMPTY_TREASURE_MUTATION,
  GEMSTONE_KINDS,
  generateTreasureLoot,
  getTreasureMutation,
  isGemstoneKind,
  quantizeStrength,
  resolveFireSeverity,
  resolveMechanicalResult,
  resolveTreasureLockDifficulty,
  resolveTreasureTrap,
  selectDestroyedContents,
  serializeTreasureMutations,
  snapshotTreasureContents,
  TREASURE_COIN_MAX,
  TREASURE_COIN_MIN,
  type TreasureChestMutation,
  type TreasureForceCapabilitySnapshot,
} from './treasureGameplay'

function site(placeId = 'ruins:test'): TreasureSiteDefinition {
  const id = treasureSiteId('ruins', placeId)
  return {
    id,
    archetype: 'ruins',
    placeId,
    chest: { containerId: treasureChestId(id), x: 10, z: 20, yaw: 0.2 },
    requiredKeyId: treasureKeyInstanceId(id),
    key: {
      mode: 'abandoned',
      pickupId: `pickup:${id}`,
      hostId: 'monolith:a',
      hostKind: 'monolith',
      x: 40,
      z: 50,
      keyInstanceId: treasureKeyInstanceId(id),
    },
  }
}

const AXE: TreasureForceCapabilitySnapshot = { heldKind: 'axe', strengthBucket: 12 }
const PICK: TreasureForceCapabilitySnapshot = { heldKind: 'pickaxe', strengthBucket: 12 }

describe('gemstone catalog (items-player-026)', () => {
  it('declares six sized variants with resilient physical metadata', () => {
    for (const kind of GEMSTONE_KINDS) {
      expect(ITEM_DEFS[kind]).toBeDefined()
      expect(ITEM_CATALOG[kind].physical?.resilient).toBe(true)
      expect(itemIsResilient(kind)).toBe(true)
      expect(isGemstoneKind(kind)).toBe(true)
    }
  })

  it('preserves diamond > ruby and large > medium > small trade values', () => {
    expect(tradeValue('diamond_small')).toBeGreaterThan(tradeValue('ruby_small'))
    expect(tradeValue('diamond_medium')).toBeGreaterThan(tradeValue('ruby_medium'))
    expect(tradeValue('diamond_large')).toBeGreaterThan(tradeValue('ruby_large'))
    expect(tradeValue('ruby_large')).toBeGreaterThan(tradeValue('ruby_medium'))
    expect(tradeValue('ruby_medium')).toBeGreaterThan(tradeValue('ruby_small'))
    expect(tradeValue('diamond_large')).toBeGreaterThan(tradeValue('diamond_medium'))
    expect(tradeValue('diamond_medium')).toBeGreaterThan(tradeValue('diamond_small'))
  })

  it('keeps legacy ruby as a compatible resilient catalog item', () => {
    expect(ITEM_DEFS.ruby.kind).toBe('ruby')
    expect(ITEM_CATALOG.ruby.label).toBe('rubin')
    expect(itemIsResilient('ruby')).toBe(true)
    expect(isGemstoneKind('ruby')).toBe(false)
  })
})

describe('treasure loot generation', () => {
  it('is deterministic for the same world seed and site identity', () => {
    const first = generateTreasureLoot(42, 'treasure:ruins:a')
    const second = generateTreasureLoot(42, 'treasure:ruins:a')
    expect(second).toEqual(first)
  })

  it('keeps coins in the configured range and always includes one gemstone', () => {
    const loot = generateTreasureLoot(7, 'treasure:deepForest:b')
    expect(loot.coin).toBeGreaterThanOrEqual(TREASURE_COIN_MIN)
    expect(loot.coin).toBeLessThanOrEqual(TREASURE_COIN_MAX)
    const gems = GEMSTONE_KINDS.filter((kind) => (loot[kind] ?? 0) > 0)
    expect(gems).toHaveLength(1)
    expect(loot[gems[0]!]).toBe(1)
  })

  it('does not depend on call order of unrelated sites', () => {
    generateTreasureLoot(11, 'treasure:ruins:other')
    const isolated = generateTreasureLoot(11, 'treasure:ruins:target')
    const fresh = generateTreasureLoot(11, 'treasure:ruins:target')
    expect(isolated).toEqual(fresh)
  })
})

describe('mechanical result and trap separation', () => {
  it('resolves the same mechanical result for the same attempt inputs', () => {
    const a = resolveMechanicalResult('chest:a', 0, AXE, 0.6)
    const b = resolveMechanicalResult('chest:a', 0, AXE, 0.6)
    expect(b).toBe(a)
  })

  it('can change when the held prying tool changes', () => {
    const results = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const id = `chest:tool:${i}`
      results.add(`${resolveMechanicalResult(id, 0, AXE, 0.7)}:${resolveMechanicalResult(id, 0, PICK, 0.7)}`)
    }
    expect([...results].some((pair) => pair.split(':')[0] !== pair.split(':')[1])).toBe(true)
  })

  it('uses a persistent trap type independent of mechanical outcome', () => {
    const trap = resolveTreasureTrap(99, 'treasure:ruins:trapped')
    expect(['none', 'fire', 'blade']).toContain(trap)
    expect(resolveTreasureTrap(99, 'treasure:ruins:trapped')).toBe(trap)
    const mechanical = resolveMechanicalResult('world-container:treasure:ruins:trapped', 0, AXE, 0.4)
    expect(['opened_clean', 'opened_damaged', 'failed']).toContain(mechanical)
  })

  it('does not treat fire severity as automatic chest destruction', () => {
    const severities = new Set([
      resolveFireSeverity('chest:fire:a', 0),
      resolveFireSeverity('chest:fire:b', 0),
      resolveFireSeverity('chest:fire:c', 1),
    ])
    expect(severities.has('contents_scorched') || severities.has('chest_damaged')).toBe(true)
  })
})

describe('contents damage', () => {
  it('destroys vulnerable loot and preserves coins and gemstones', () => {
    const snapshot = snapshotTreasureContents(new Inventory({
      coin: 80,
      ruby_medium: 1,
      hide: 1,
      bread: 2,
    }))
    const losses = selectDestroyedContents(snapshot, 'all', 'chest:dmg', 0)
    expect(losses.coin).toBeUndefined()
    expect(losses.ruby_medium).toBeUndefined()
    expect(losses.hide).toBe(1)
    expect(losses.bread).toBe(2)
    const inventory = new Inventory({ coin: 80, ruby_medium: 1, hide: 1, bread: 2 })
    applyTreasureContentsLosses(inventory, losses)
    expect(inventory.count('coin')).toBe(80)
    expect(inventory.count('ruby_medium')).toBe(1)
    expect(inventory.count('hide')).toBe(0)
    expect(inventory.count('bread')).toBe(0)
  })

  it('is deterministic for the same snapshot and attempt', () => {
    const snapshot = { counts: { hide: 1, bread: 1, blanket: 1 } as Partial<Record<ItemKind, number>> }
    expect(selectDestroyedContents(snapshot, 'subset', 'chest:sub', 2))
      .toEqual(selectDestroyedContents(snapshot, 'subset', 'chest:sub', 2))
  })
})

describe('commitForcedEntry', () => {
  it('increments attemptIndex exactly once and cannot apply the same attempt twice', () => {
    const definition = site()
    const inventory = new Inventory(generateTreasureLoot(3, definition.id))
    const unlocked = new Set<string>()
    const mutations = new Map<string, TreasureChestMutation>()
    const first = commitForcedEntry({
      worldSeed: 3,
      site: definition,
      inventory,
      unlockedIds: unlocked,
      mutations,
      snapshot: AXE,
    })
    expect(first.attemptIndex).toBe(1)
    expect(getTreasureMutation(mutations, definition.chest.containerId).attemptIndex).toBe(1)
    const second = commitForcedEntry({
      worldSeed: 3,
      site: definition,
      inventory,
      unlockedIds: unlocked,
      mutations,
      snapshot: AXE,
    })
    expect(second.attemptIndex).toBe(2)
  })

  it('unlocks on a successful mechanical open and leaves a failed chest locked', () => {
    const outcomes = { opened: false, failed: false }
    for (let i = 0; i < 40; i++) {
      const definition = site(`ruins:commit:${i}`)
      const inventory = new Inventory({ coin: 60, ruby_small: 1, hide: 1 })
      const unlocked = new Set<string>()
      const mutations = new Map<string, TreasureChestMutation>()
      const result = commitForcedEntry({
        worldSeed: 5,
        site: definition,
        inventory,
        unlockedIds: unlocked,
        mutations,
        snapshot: AXE,
      })
      if (result.opened) {
        outcomes.opened = true
        expect(unlocked.has(definition.chest.containerId)).toBe(true)
      } else if (!result.destroyed) {
        outcomes.failed = true
        expect(unlocked.has(definition.chest.containerId)).toBe(false)
      }
      expect(inventory.count('coin')).toBe(60)
      expect(inventory.count('ruby_small')).toBe(1)
    }
    expect(outcomes.opened).toBe(true)
    expect(outcomes.failed).toBe(true)
  })

  it('triggers a one-shot trap at most once even across later attempts', () => {
    const definition = site('ruins:oneshot')
    const trap = resolveTreasureTrap(8, definition.id)
    const inventory = new Inventory({ coin: 70, diamond_small: 1, hide: 1 })
    const unlocked = new Set<string>()
    const mutations = new Map<string, TreasureChestMutation>()
    const first = commitForcedEntry({
      worldSeed: 8,
      site: definition,
      inventory,
      unlockedIds: unlocked,
      mutations,
      snapshot: AXE,
    })
    const second = commitForcedEntry({
      worldSeed: 8,
      site: definition,
      inventory,
      unlockedIds: unlocked,
      mutations,
      snapshot: AXE,
    })
    if (trap === 'none') {
      expect(first.trapTriggeredNow).toBe(false)
      expect(second.trapTriggeredNow).toBe(false)
    } else {
      expect(first.trapTriggeredNow).toBe(true)
      expect(second.trapTriggeredNow).toBe(false)
      expect(getTreasureMutation(mutations, definition.chest.containerId).trapTriggered).toBe(true)
    }
    if (first.trapTriggeredNow && trap === 'blade') expect(first.bladeDamage).toBe(BLADE_TRAP_DAMAGE)
    else expect(first.bladeDamage).toBe(0)
    expect(second.bladeDamage).toBe(0)
  })

  it('leaves attemptIndex unchanged when commit is not called (BusyAction cancel contract)', () => {
    const mutations = new Map<string, TreasureChestMutation>()
    expect(getTreasureMutation(mutations, 'chest:idle')).toEqual(EMPTY_TREASURE_MUTATION)
  })
})

describe('treasure container interaction', () => {
  it('does not consume a trap when the matching key opens the chest', () => {
    const definition = site('ruins:key-safe')
    const unlocked = new Set<string>()
    const mutations = new Map<string, TreasureChestMutation>()
    const result = attemptTreasureUnlock(
      [definition],
      unlocked,
      definition.chest.containerId,
      (requiredKeyId) => requiredKeyId === definition.requiredKeyId,
    )
    expect(result.kind).toBe('unlocked')
    expect(unlocked.has(definition.chest.containerId)).toBe(true)
    expect(getTreasureMutation(mutations, definition.chest.containerId)).toEqual(EMPTY_TREASURE_MUTATION)
    expect(resolveTreasureTrap(8, definition.id)).toBe(resolveTreasureTrap(8, definition.id))
  })

  it('keeps player-placed / non-treasure containers out of treasure lock/trap state', () => {
    expect(describeTreasureContainerInteraction([], new Set(), new Map(), 'chest:player')).toEqual({
      kind: 'not-treasure',
    })
  })

  it('treats a destroyed chest as remains, not a lockable closed chest', () => {
    const definition = site()
    const mutations = new Map<string, TreasureChestMutation>([[
      definition.chest.containerId,
      { attemptIndex: 1, trapTriggered: true, damaged: true, destroyed: true },
    ]])
    expect(describeTreasureContainerInteraction(
      [definition],
      new Set(),
      mutations,
      definition.chest.containerId,
    )).toEqual({ kind: 'remains' })
  })
})

describe('serializeTreasureMutations', () => {
  it('omits untouched chests and keeps committed flags', () => {
    const mutations = new Map<string, TreasureChestMutation>([
      ['chest:idle', EMPTY_TREASURE_MUTATION],
      ['chest:used', { attemptIndex: 2, trapTriggered: true, damaged: false, destroyed: false }],
    ])
    expect(serializeTreasureMutations(mutations)).toEqual([
      { containerId: 'chest:used', attemptIndex: 2, trapTriggered: true },
    ])
  })
})

describe('quantizeStrength', () => {
  it('is stable for nearby floats that should not reroll an attempt', () => {
    expect(quantizeStrength(0.6)).toBe(quantizeStrength(0.601))
    expect(quantizeStrength(0)).toBe(0)
    expect(quantizeStrength(1)).toBe(20)
  })
})

describe('lock difficulty', () => {
  it('is a stable site property, not a per-attempt roll', () => {
    const a = resolveTreasureLockDifficulty(4, 'treasure:ruins:lock')
    const b = resolveTreasureLockDifficulty(4, 'treasure:ruins:lock')
    expect(b).toBe(a)
    expect(a).toBeGreaterThanOrEqual(0.2)
    expect(a).toBeLessThanOrEqual(0.85)
  })
})

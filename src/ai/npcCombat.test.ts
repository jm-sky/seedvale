import { describe, expect, it } from 'vitest'
import type { CombatTargetHandle } from '../combat/combatIntent'
import type { Projectile } from '../combat/projectile'
import type { ItemKind } from '../items/items'
import type { Role } from './characters'
import { MELEE_CRITICAL_MULTIPLIER } from '../combat/criticalHit'
import { MELEE_STRENGTH_NEUTRAL } from '../combat/meleeStrength'
import { createArmorInstance } from '../items/armorItemInstances'
import { NEUTRAL_EQUIPMENT_MODIFIERS, resolveEquipmentModifiers } from '../items/equipment'
import { Inventory } from '../items/Inventory'
import { ITEM_CATALOG } from '../items/itemCatalog'
import {
  applyNpcMeleeHit,
  applyNpcRangedHit,
  npcMeleeWeaponFamily,
  npcRangedWeaponFamily,
  resolveIncomingNpcDamage,
  resolveNpcAmmo,
  resolveNpcAmmoKind,
  resolveNpcArmorEquipment,
  resolveNpcDefenseConfig,
  resolveNpcMeleeWeapon,
  resolveNpcRangedWeapon,
} from './npcCombat'

const KNIFE = ITEM_CATALOG.knife.melee!
const SHORT_BOW = ITEM_CATALOG.short_bow.ranged!

const ALL_CURRENT_MELEE_KINDS: readonly ItemKind[] = (Object.keys(ITEM_CATALOG) as ItemKind[])
  .filter((kind) => ITEM_CATALOG[kind].melee != null)

function fakeTarget(overrides: Partial<CombatTargetHandle> = {}): CombatTargetHandle & { damages: number[] } {
  const damages: number[] = []
  return {
    ref: { id: 'target', kind: 'animal' },
    getPosition: () => ({ x: 0, z: 0 }),
    isAlive: () => true,
    applyDamage: (amount) => damages.push(amount),
    damages,
    ...overrides,
  }
}

describe('resolveNpcMeleeWeapon', () => {
  it('returns null when carrying nothing melee-capable', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('stone', 1)
    expect(resolveNpcMeleeWeapon(carried, 'trader')).toBeNull()
  })

  it('resolves a melee-capable carried kind straight from ITEM_CATALOG', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('knife', 1)
    const weapon = resolveNpcMeleeWeapon(carried, 'trader')
    expect(weapon?.kind).toBe('knife')
    expect(weapon?.melee).toBe(KNIFE)
  })

  it('guard picks the best owned sword rather than a higher-raw-damage battle_axe', () => {
    const carried = new Inventory(undefined, 20)
    carried.add('short_sword', 1)
    carried.add('long_sword', 1)
    carried.add('masterwork_sword', 1)
    carried.add('battle_axe', 1)
    expect(resolveNpcMeleeWeapon(carried, 'guard')?.kind).toBe('masterwork_sword')
  })

  it('trader picks the best owned compact weapon', () => {
    const carried = new Inventory(undefined, 20)
    carried.add('knife', 1)
    carried.add('dagger', 1)
    carried.add('damascus_knife', 1)
    expect(resolveNpcMeleeWeapon(carried, 'trader')?.kind).toBe('damascus_knife')
  })

  it('applies the ×1.5 preferred-family bonus over a higher-base non-preferred weapon', () => {
    // guard prefers `sword`. short_sword baseScore = 18/(0.18+0.1+0.26) ≈ 33.33,
    // effective ≈ 50. dagger (`compact`, not preferred) baseScore
    // = 14/(0.11+0.08+0.17) ≈ 38.89 — a genuinely higher *base* score than
    // short_sword, but well short of short_sword's bonused 50.
    const carried = new Inventory(undefined, 20)
    carried.add('short_sword', 1)
    carried.add('dagger', 1)
    expect(resolveNpcMeleeWeapon(carried, 'guard')?.kind).toBe('short_sword')
  })

  it('lets a clearly superior non-preferred weapon win once it beats the ×1.5 threshold', () => {
    // trader prefers `compact`. damascus_knife baseScore
    // = 16/(0.11+0.08+0.16) ≈ 45.71, effective ≈ 68.57. obsidian_sword
    // (`sword`, not preferred) baseScore = 46/(0.24+0.11+0.32) ≈ 68.66 — just
    // over that bonused threshold, so it wins despite being outside trader's
    // preferred family.
    const carried = new Inventory(undefined, 20)
    carried.add('damascus_knife', 1)
    carried.add('obsidian_sword', 1)
    expect(resolveNpcMeleeWeapon(carried, 'trader')?.kind).toBe('obsidian_sword')
  })

  it('is deterministic for the same role/inventory regardless of add order', () => {
    const roles: Role[] = ['guard', 'trader', 'hunter', 'woodcutter', 'farmer', 'blacksmith', 'miner', 'fisher', 'shepherd', 'textile_worker', 'herbalist']
    for (const role of roles) {
      const a = new Inventory(undefined, 10000)
      const b = new Inventory(undefined, 10000)
      for (const kind of ALL_CURRENT_MELEE_KINDS) {
        a.add(kind, 1)
      }
      for (const kind of [...ALL_CURRENT_MELEE_KINDS].reverse()) {
        b.add(kind, 1)
      }
      expect(resolveNpcMeleeWeapon(a, role)?.kind).toBe(resolveNpcMeleeWeapon(b, role)?.kind)
    }
  })
})

describe('npcMeleeWeaponFamily', () => {
  it('classifies every current melee-capable ItemKind intentionally (explicit family or tool fallback)', () => {
    const expectedTool = new Set<ItemKind>(['shears', 'shovel', 'sickle'])
    for (const kind of ALL_CURRENT_MELEE_KINDS) {
      const family = npcMeleeWeaponFamily(kind)
      expect(family).toBeTruthy()
      if (expectedTool.has(kind)) expect(family).toBe('tool')
    }
  })

  it('classifies items-player-047 additions (dagger, hatchet) and the ranged masterwork bow', () => {
    expect(npcMeleeWeaponFamily('dagger')).toBe('compact')
    expect(npcMeleeWeaponFamily('hatchet')).toBe('axe')
    expect(npcRangedWeaponFamily('masterwork_hunting_bow')).toBe('bow')
  })

  it('classifies known families as documented in the plan', () => {
    expect(npcMeleeWeaponFamily('knife')).toBe('compact')
    expect(npcMeleeWeaponFamily('damascus_knife')).toBe('compact')
    expect(npcMeleeWeaponFamily('short_sword')).toBe('sword')
    expect(npcMeleeWeaponFamily('long_sword')).toBe('sword')
    expect(npcMeleeWeaponFamily('damascus_short_sword')).toBe('sword')
    expect(npcMeleeWeaponFamily('damascus_long_sword')).toBe('sword')
    expect(npcMeleeWeaponFamily('masterwork_sword')).toBe('sword')
    expect(npcMeleeWeaponFamily('obsidian_sword')).toBe('sword')
    expect(npcMeleeWeaponFamily('axe')).toBe('axe')
    expect(npcMeleeWeaponFamily('battle_axe')).toBe('axe')
    expect(npcMeleeWeaponFamily('spear')).toBe('spear')
    expect(npcMeleeWeaponFamily('pitchfork')).toBe('spear')
  })
})

describe('resolveNpcRangedWeapon', () => {
  it('returns null when carrying no bow', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('arrow', 5)
    expect(resolveNpcRangedWeapon(carried, 'hunter')).toBeNull()
  })

  it('resolves a carried bow straight from ITEM_CATALOG, regardless of ammo', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('short_bow', 1)
    const weapon = resolveNpcRangedWeapon(carried, 'hunter')
    expect(weapon?.kind).toBe('short_bow')
    expect(weapon?.ranged).toBe(SHORT_BOW)
  })

  it('hunter picks the best owned bow by score, not catalog/insertion order', () => {
    const carried = new Inventory(undefined, 20)
    carried.add('short_bow', 1)
    carried.add('hunting_bow', 1)
    carried.add('masterwork_hunting_bow', 1)
    carried.add('long_bow', 1)
    // scores: short_bow 14/0.54≈25.9, hunting_bow 20/0.75≈26.7,
    // masterwork_hunting_bow 24/0.63≈38.1, long_bow 28/1.05≈26.7
    expect(resolveNpcRangedWeapon(carried, 'hunter')?.kind).toBe('masterwork_hunting_bow')
  })

  it('is deterministic regardless of add order', () => {
    const bows: ItemKind[] = ['short_bow', 'hunting_bow', 'masterwork_hunting_bow', 'long_bow']
    const a = new Inventory(undefined, 20)
    const b = new Inventory(undefined, 20)
    for (const kind of bows) a.add(kind, 1)
    for (const kind of [...bows].reverse()) b.add(kind, 1)
    expect(resolveNpcRangedWeapon(a, 'hunter')?.kind).toBe(resolveNpcRangedWeapon(b, 'hunter')?.kind)
  })
})

describe('resolveNpcAmmoKind', () => {
  it('returns null when no compatible ammo is carried', () => {
    const carried = new Inventory(undefined, 5)
    expect(resolveNpcAmmoKind(carried, SHORT_BOW)).toBeNull()
  })

  it('resolves the first compatible ammo kind actually carried', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('broadhead_arrow', 2)
    expect(resolveNpcAmmoKind(carried, SHORT_BOW)).toBe('broadhead_arrow')
  })
})

describe('resolveNpcAmmo', () => {
  it('prefers the first inventory that holds compatible ammo', () => {
    const personal = new Inventory({ arrow: 1 })
    const carried = new Inventory({ broadhead_arrow: 2 })
    const ammo = resolveNpcAmmo([personal, carried], SHORT_BOW)
    expect(ammo).toEqual({ kind: 'arrow', inventory: personal })
  })

  it('falls through to a later inventory when the first is empty of ammo', () => {
    const personal = new Inventory()
    const carried = new Inventory({ arrow: 1 })
    const ammo = resolveNpcAmmo([personal, carried], SHORT_BOW)
    expect(ammo).toEqual({ kind: 'arrow', inventory: carried })
  })
})

describe('resolveNpcDefenseConfig', () => {
  it('returns null when carrying nothing that can block', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('branch', 1)
    expect(resolveNpcDefenseConfig(carried)).toBeNull()
  })

  it('resolves a defense config from a carried blocking item', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('long_sword', 1)
    const defense = resolveNpcDefenseConfig(carried)
    expect(defense?.canBlock).toBe(true)
  })
})

describe('applyNpcMeleeHit', () => {
  it('applies damage to the target exactly once', () => {
    const target = fakeTarget()
    const result = applyNpcMeleeHit(target, KNIFE, MELEE_STRENGTH_NEUTRAL, 'npc:1', 'melee:target', 1)
    expect(target.damages).toHaveLength(1)
    expect(target.damages[0]).toBe(result.damage)
    expect(result.damage).toBeGreaterThanOrEqual(KNIFE.damage)
  })

  it('is deterministic for the same attacker/attackKey/attempt/strength', () => {
    const a = applyNpcMeleeHit(fakeTarget(), KNIFE, MELEE_STRENGTH_NEUTRAL, 'npc:1', 'melee:target', 7)
    const b = applyNpcMeleeHit(fakeTarget(), KNIFE, MELEE_STRENGTH_NEUTRAL, 'npc:1', 'melee:target', 7)
    expect(a).toEqual(b)
  })

  it('preserves legacy melee damage at neutral Strength (0.5)', () => {
    const result = applyNpcMeleeHit(fakeTarget(), KNIFE, MELEE_STRENGTH_NEUTRAL, 'npc:1', 'melee:target', 1)
    expect(result.damage).toBeCloseTo(result.critical ? KNIFE.damage * MELEE_CRITICAL_MULTIPLIER : KNIFE.damage, 5)
  })

  it('applies the shared Strength contribution before critical resolution (same roll, so the critical multiplier cancels out in the ratio)', () => {
    const attackerId = 'npc:1'
    const attackKey = 'melee:target'
    const attempt = 1
    const neutral = applyNpcMeleeHit(fakeTarget(), KNIFE, 0.5, attackerId, attackKey, attempt)
    const low = applyNpcMeleeHit(fakeTarget(), KNIFE, 0.0, attackerId, attackKey, attempt)
    const high = applyNpcMeleeHit(fakeTarget(), KNIFE, 1.0, attackerId, attackKey, attempt)
    expect(low.damage).toBeCloseTo(neutral.damage * 0.7, 5)
    expect(high.damage).toBeCloseTo(neutral.damage * 1.3, 5)
  })
})

function fakeProjectile(overrides: Partial<Projectile> = {}): Projectile {
  return {
    id: 'proj:1',
    sourceId: 'npc:1',
    x: 0,
    z: 0,
    dirX: 0,
    dirZ: -1,
    speed: 20,
    maxDistance: 10,
    travelled: 0,
    damage: SHORT_BOW.damage,
    criticalChance: 0,
    criticalMultiplier: 1.6,
    attackKey: 'ranged:arrow',
    attempt: 1,
    ammoKind: 'arrow',
    ...overrides,
  }
}

describe('applyNpcRangedHit', () => {
  it('applies damage to the target exactly once', () => {
    const target = fakeTarget()
    const result = applyNpcRangedHit(target, fakeProjectile())
    expect(target.damages).toHaveLength(1)
    expect(target.damages[0]).toBe(result.damage)
    expect(result.damage).toBeGreaterThanOrEqual(SHORT_BOW.damage)
  })

  it('is deterministic for the same sourceId/attackKey/attempt', () => {
    const a = applyNpcRangedHit(fakeTarget(), fakeProjectile())
    const b = applyNpcRangedHit(fakeTarget(), fakeProjectile())
    expect(a).toEqual(b)
  })
})

describe('resolveNpcArmorEquipment', () => {
  it('resolves no armor modifiers when personalInventory holds no armor instances', () => {
    const inventory = new Inventory(undefined, 20)
    const equipment = resolveNpcArmorEquipment(inventory)
    expect(resolveEquipmentModifiers(equipment, inventory)).toEqual(NEUTRAL_EQUIPMENT_MODIFIERS)
  })

  it('picks up a single worn armor instance and reduces incoming damage', () => {
    const inventory = new Inventory(undefined, 20)
    inventory.addInstance(createArmorInstance('leather_armor', 'common'))
    const equipment = resolveNpcArmorEquipment(inventory)
    const modifiers = resolveEquipmentModifiers(equipment, inventory)
    expect(modifiers.incomingDamageMultiplier).toBeLessThan(1)
  })

  it('chainmail reduces damage more than leather at the same quality', () => {
    const leatherInventory = new Inventory(undefined, 20)
    leatherInventory.addInstance(createArmorInstance('leather_armor', 'common'))
    const chainmailInventory = new Inventory(undefined, 20)
    chainmailInventory.addInstance(createArmorInstance('chainmail', 'common'))
    const leatherModifiers = resolveEquipmentModifiers(resolveNpcArmorEquipment(leatherInventory), leatherInventory)
    const chainmailModifiers = resolveEquipmentModifiers(resolveNpcArmorEquipment(chainmailInventory), chainmailInventory)
    expect(chainmailModifiers.incomingDamageMultiplier).toBeLessThan(leatherModifiers.incomingDamageMultiplier)
  })

  it('picks the best of two owned pieces for the same slot', () => {
    const inventory = new Inventory(undefined, 20)
    inventory.addInstance(createArmorInstance('leather_armor', 'common'))
    inventory.addInstance(createArmorInstance('chainmail', 'common'))
    const soloChainmail = new Inventory(undefined, 20)
    soloChainmail.addInstance(createArmorInstance('chainmail', 'common'))
    const bothModifiers = resolveEquipmentModifiers(resolveNpcArmorEquipment(inventory), inventory)
    const chainmailOnlyModifiers = resolveEquipmentModifiers(resolveNpcArmorEquipment(soloChainmail), soloChainmail)
    // Same body slot, one piece wins — owning the weaker leather piece too
    // must not stack additional reduction on top of chainmail.
    expect(bothModifiers.incomingDamageMultiplier).toBeCloseTo(chainmailOnlyModifiers.incomingDamageMultiplier, 10)
  })

  it('composes multiple slots (body + arms) instead of only the best single piece', () => {
    const inventory = new Inventory(undefined, 20)
    inventory.addInstance(createArmorInstance('leather_armor', 'common'))
    inventory.addInstance(createArmorInstance('ranger_pauldron', 'common'))
    const bodyOnly = new Inventory(undefined, 20)
    bodyOnly.addInstance(createArmorInstance('leather_armor', 'common'))
    const combined = resolveEquipmentModifiers(resolveNpcArmorEquipment(inventory), inventory)
    const bodyOnlyModifiers = resolveEquipmentModifiers(resolveNpcArmorEquipment(bodyOnly), bodyOnly)
    expect(combined.incomingDamageMultiplier).toBeLessThan(bodyOnlyModifiers.incomingDamageMultiplier)
  })

  it('stops mitigating the instant the armor instance is removed from personalInventory', () => {
    const inventory = new Inventory(undefined, 20)
    const armor = createArmorInstance('chainmail', 'common')
    inventory.addInstance(armor)
    expect(resolveEquipmentModifiers(resolveNpcArmorEquipment(inventory), inventory).incomingDamageMultiplier).toBeLessThan(1)
    inventory.removeInstance(armor.id)
    expect(resolveEquipmentModifiers(resolveNpcArmorEquipment(inventory), inventory)).toEqual(NEUTRAL_EQUIPMENT_MODIFIERS)
  })
})

describe('resolveIncomingNpcDamage', () => {
  const baseParams = {
    amount: 20,
    carried: new Inventory(undefined, 5),
    defenderId: 'npc:1',
    defenderX: 0,
    defenderZ: 0,
    defenderFacingYaw: 0,
    attackerKey: 'wolf',
    attempt: 1,
  }

  it('deals full damage with no carried defense item', () => {
    const result = resolveIncomingNpcDamage(baseParams)
    expect(result).toEqual({ outcome: 'none', finalDamage: 20, attempted: false })
  })

  it('applies derived armor mitigation on top of the (unblocked) active defense result', () => {
    const carried = new Inventory(undefined, 20)
    carried.addInstance(createArmorInstance('chainmail', 'common'))
    const result = resolveIncomingNpcDamage({ ...baseParams, carried })
    expect(result.outcome).toBe('none')
    expect(result.attempted).toBe(false)
    expect(result.finalDamage).toBeLessThan(20)
    expect(result.finalDamage).toBeGreaterThan(0)
  })

  it('active block happens before passive armor: a full block still leaves zero final damage with armor worn', () => {
    const carried = new Inventory(undefined, 20)
    carried.add('long_sword', 1)
    carried.addInstance(createArmorInstance('chainmail', 'common'))
    let attempt = 1
    let result = resolveIncomingNpcDamage({
      ...baseParams, carried, attackerX: 0, attackerZ: 2, attempt,
    })
    while (result.outcome !== 'full' && attempt < 500) {
      attempt += 1
      result = resolveIncomingNpcDamage({ ...baseParams, carried, attackerX: 0, attackerZ: 2, attempt })
    }
    expect(result.outcome).toBe('full')
    expect(result.finalDamage).toBe(0)
  })

  it('converts steerTo facing convention correctly — an attacker ahead of a forward-facing NPC is in arc', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('long_sword', 1)
    // defenderFacingYaw 0 means facing +Z under steerTo's atan2(dirX, dirZ)
    // convention — an attacker further along +Z stands in front.
    let attempt = 1
    let result = resolveIncomingNpcDamage({
      ...baseParams, carried, defenderFacingYaw: 0, attackerX: 0, attackerZ: 2, attempt,
    })
    while (!result.attempted && attempt < 200) {
      attempt += 1
      result = resolveIncomingNpcDamage({ ...baseParams, carried, defenderFacingYaw: 0, attackerX: 0, attackerZ: 2, attempt })
    }
    expect(result.attempted).toBe(true)
  })

  it('an attacker behind a forward-facing NPC is out of arc — never attempted', () => {
    const carried = new Inventory(undefined, 5)
    carried.add('long_sword', 1)
    for (let attempt = 1; attempt < 50; attempt++) {
      const result = resolveIncomingNpcDamage({
        ...baseParams, carried, defenderFacingYaw: 0, attackerX: 0, attackerZ: -2, attempt,
      })
      expect(result.attempted).toBe(false)
      expect(result.finalDamage).toBe(20)
    }
  })
})

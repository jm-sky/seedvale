// @vitest-environment jsdom
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DRY_WATER_SAMPLE } from '../terrain/waterSample'
import { AnimalAgent, type AnimalAgentDeps, type VillageInfo } from './AnimalAgent'
import { ANIMAL_DEFS } from './animalDefs'
import {
  ANIMAL_VARIANT_DEFS,
  DANGEROUS_TRAIT_MODIFIERS,
  resolveAnimalVariantStats,
  variantTintHex,
  wolfDenInitialFillVariant,
} from './animalVariants'
import { damageFor, damageVsHuman, MAX_HP } from './faunaCombat'
import { JUVENILE_SCALE_FACTOR } from './herdCohesion'

const sampleHeight = () => 0
const sampleLocalWater = () => DRY_WATER_SAMPLE
const collidersNear = () => []

function makeDeps(overrides: Partial<AnimalAgentDeps> = {}): AnimalAgentDeps {
  return {
    def: ANIMAL_DEFS.wolf,
    animalId: 'test-wolf',
    sampleHeight,
    waterLevel: -10,
    sampleLocalWater,
    collidersNear,
    x: 0,
    z: 0,
    ...overrides,
  }
}

function walkSpeedNow(agent: AnimalAgent): number {
  return (agent as unknown as { walkSpeedNow(): number }).walkSpeedNow()
}

function sprintSpeedNow(agent: AnimalAgent): number {
  return (agent as unknown as { sprintSpeedNow(): number }).sprintSpeedNow()
}

describe('animalVariants resolver', () => {
  it('gives normal the identity multipliers and no darkening', () => {
    expect(resolveAnimalVariantStats('normal')).toEqual({
      scaleMultiplier: 1,
      healthMultiplier: 1,
      damageMultiplier: 1,
      speedMultiplier: 1,
      visualDarken: 0,
      dangerMultiplier: 1,
    })
    expect(resolveAnimalVariantStats()).toEqual(ANIMAL_VARIANT_DEFS.normal)
  })

  it('gives alpha the V1 tunables from fauna-022', () => {
    expect(resolveAnimalVariantStats('alpha')).toEqual({
      scaleMultiplier: 1.15,
      healthMultiplier: 1.60,
      damageMultiplier: 1.45,
      speedMultiplier: 1.05,
      visualDarken: 0.20,
      dangerMultiplier: 1.75,
    })
  })

  it('does not invent an alpha_wolf AnimalKind', () => {
    expect('alpha_wolf' in ANIMAL_DEFS).toBe(false)
    expect(ANIMAL_DEFS.wolf.kind).toBe('wolf')
  })

  it('composes the quest dangerous trait by max, never as a product', () => {
    const stacked = resolveAnimalVariantStats('alpha', true)
    expect(stacked.healthMultiplier).toBe(DANGEROUS_TRAIT_MODIFIERS.healthMultiplier)
    expect(stacked.healthMultiplier).not.toBe(
      ANIMAL_VARIANT_DEFS.alpha.healthMultiplier * DANGEROUS_TRAIT_MODIFIERS.healthMultiplier,
    )
    expect(stacked.damageMultiplier).toBe(DANGEROUS_TRAIT_MODIFIERS.damageMultiplier)
    expect(stacked.scaleMultiplier).toBe(DANGEROUS_TRAIT_MODIFIERS.scaleMultiplier)
    expect(stacked.speedMultiplier).toBe(ANIMAL_VARIANT_DEFS.alpha.speedMultiplier)
    expect(stacked.dangerMultiplier).toBe(DANGEROUS_TRAIT_MODIFIERS.dangerMultiplier)
    expect(stacked.visualDarken).toBe(ANIMAL_VARIANT_DEFS.alpha.visualDarken)
  })

  it('wolfDen initial fill assigns exactly one alpha at slot 0, independent of animalId', () => {
    const pack = [0, 1].map(wolfDenInitialFillVariant)
    expect(pack.filter((v) => v === 'alpha')).toHaveLength(1)
    expect(pack[0]).toBe('alpha')
    expect(pack[1]).toBe('normal')
    expect(wolfDenInitialFillVariant(0)).toBe(wolfDenInitialFillVariant(0))
    expect(wolfDenInitialFillVariant(3)).toBe('normal')
  })

  it('darkens a base colour toward black without Three.js', () => {
    expect(variantTintHex(0x5a5a62, 0)).toBeNull()
    expect(variantTintHex(0x5a5a62, 0.20)).toBe(0x48484e)
  })
})

describe('AnimalAgent individual variants (plan fauna-022)', () => {
  it('keeps a normal wolf on species baseline HP/damage/speed/scale', () => {
    const wolf = new AnimalAgent(makeDeps())
    expect(wolf.variant).toBe('normal')
    expect(wolf.def.kind).toBe('wolf')
    expect(wolf.health.maxHp).toBe(MAX_HP.wolf)
    expect(wolf.outgoingDamageFor('deer')).toBe(damageFor('wolf', 'deer'))
    expect(wolf.outgoingDamageVsHuman()).toBe(damageVsHuman('wolf'))
    expect(walkSpeedNow(wolf)).toBe(ANIMAL_DEFS.wolf.walkSpeed)
    expect(sprintSpeedNow(wolf)).toBe(ANIMAL_DEFS.wolf.sprintSpeed)
    expect(wolf.mesh.scale.x).toBe(1)
    expect(wolf.dangerSignificance).toBe(1)
  })

  it('applies alpha multipliers on top of the wolf species baseline', () => {
    const alpha = new AnimalAgent(makeDeps({ variant: 'alpha', animalId: 'alpha-wolf' }))
    const stats = ANIMAL_VARIANT_DEFS.alpha
    expect(alpha.variant).toBe('alpha')
    expect(alpha.def.kind).toBe('wolf')
    expect(alpha.health.maxHp).toBe(MAX_HP.wolf * stats.healthMultiplier)
    expect(alpha.health.maxHp).toBeGreaterThan(MAX_HP.wolf)
    expect(alpha.outgoingDamageFor('deer')).toBe(damageFor('wolf', 'deer') * stats.damageMultiplier)
    expect(alpha.outgoingDamageVsHuman()).toBe(damageVsHuman('wolf') * stats.damageMultiplier)
    expect(walkSpeedNow(alpha)).toBeCloseTo(ANIMAL_DEFS.wolf.walkSpeed * stats.speedMultiplier, 10)
    expect(sprintSpeedNow(alpha)).toBeCloseTo(ANIMAL_DEFS.wolf.sprintSpeed * stats.speedMultiplier, 10)
    expect(alpha.mesh.scale.x).toBeCloseTo(stats.scaleMultiplier, 10)
    expect(alpha.dangerSignificance).toBe(stats.dangerMultiplier)
    expect(alpha.dangerSignificance).toBeGreaterThan(1)
  })

  it('leaves other species unchanged when no variant is supplied', () => {
    const fox = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.fox, animalId: 'fox-1' }))
    expect(fox.variant).toBe('normal')
    expect(fox.health.maxHp).toBe(MAX_HP.fox)
    expect(fox.outgoingDamageFor('rabbit')).toBe(damageFor('fox', 'rabbit'))
    expect(fox.outgoingDamageVsHuman()).toBe(damageVsHuman('fox'))
    expect(walkSpeedNow(fox)).toBe(ANIMAL_DEFS.fox.walkSpeed)
  })

  it('applies incoming player/NPC damage through the shared HealthState pipeline', () => {
    const alpha = new AnimalAgent(makeDeps({ variant: 'alpha', animalId: 'alpha-hit' }))
    const before = alpha.health.currentHp
    expect(before).toBe(alpha.health.maxHp)
    alpha.takeDamage(10, 'player')
    expect(alpha.health.currentHp).toBe(before - 10)
    expect(alpha.health.maxHp).toBe(MAX_HP.wolf * ANIMAL_VARIANT_DEFS.alpha.healthMultiplier)
    expect(alpha.isDead()).toBe(false)
  })

  it('keeps spawnPointId and wolf kind when constructed as a den alpha', () => {
    const alpha = new AnimalAgent(makeDeps({
      variant: 'alpha',
      spawnPointId: 'home:wolfDen',
      animalId: 'den-alpha',
    }))
    expect(alpha.def.kind).toBe('wolf')
    expect(alpha.spawnPointId).toBe('home:wolfDen')
    expect(alpha.variant).toBe('alpha')
  })

  it('does not double-stack markDangerous() on an alpha wolf', () => {
    const alpha = new AnimalAgent(makeDeps({ variant: 'alpha', animalId: 'alpha-quest' }))
    const alphaHp = alpha.health.maxHp
    const alphaScale = alpha.mesh.scale.x
    alpha.markDangerous()
    expect(alpha.health.maxHp).toBe(MAX_HP.wolf * DANGEROUS_TRAIT_MODIFIERS.healthMultiplier)
    expect(alpha.health.maxHp).not.toBe(alphaHp * DANGEROUS_TRAIT_MODIFIERS.healthMultiplier)
    expect(alpha.outgoingDamageVsHuman()).toBe(
      damageVsHuman('wolf') * DANGEROUS_TRAIT_MODIFIERS.damageMultiplier,
    )
    expect(alpha.outgoingDamageFor('deer')).toBe(
      damageFor('wolf', 'deer') * DANGEROUS_TRAIT_MODIFIERS.damageMultiplier,
    )
    expect(alpha.mesh.scale.x).toBeCloseTo(DANGEROUS_TRAIT_MODIFIERS.scaleMultiplier, 10)
    expect(alpha.mesh.scale.x).not.toBeCloseTo(alphaScale * DANGEROUS_TRAIT_MODIFIERS.scaleMultiplier, 5)
    expect(walkSpeedNow(alpha)).toBeCloseTo(
      ANIMAL_DEFS.wolf.walkSpeed * ANIMAL_VARIANT_DEFS.alpha.speedMultiplier,
      10,
    )
  })

  it('keeps markDangerous() behaviour for a normal wolf', () => {
    const wolf = new AnimalAgent(makeDeps({ animalId: 'quest-wolf' }))
    wolf.markDangerous()
    expect(wolf.health.maxHp).toBe(MAX_HP.wolf * DANGEROUS_TRAIT_MODIFIERS.healthMultiplier)
    expect(wolf.outgoingDamageVsHuman()).toBe(
      damageVsHuman('wolf') * DANGEROUS_TRAIT_MODIFIERS.damageMultiplier,
    )
    expect(wolf.mesh.scale.x).toBeCloseTo(DANGEROUS_TRAIT_MODIFIERS.scaleMultiplier, 10)
    expect(wolf.dangerSignificance).toBe(DANGEROUS_TRAIT_MODIFIERS.dangerMultiplier)
  })

  it('keeps frenzy and rabies independent of variant', () => {
    const village: VillageInfo = { x: 0, z: 0, radius: 20 }
    const alpha = new AnimalAgent(makeDeps({ variant: 'alpha', animalId: 'alpha-state' }))
    expect(alpha.isFrenzied()).toBe(false)
    expect(alpha.isRabid()).toBe(false)
    alpha.setFrenzied(village)
    alpha.infectWithRabies()
    expect(alpha.isFrenzied()).toBe(true)
    expect(alpha.isRabid()).toBe(true)
    expect(alpha.variant).toBe('alpha')
    expect(alpha.dangerSignificance).toBe(ANIMAL_VARIANT_DEFS.alpha.dangerMultiplier)

    const normal = new AnimalAgent(makeDeps({ animalId: 'normal-state' }))
    normal.setFrenzied(village)
    normal.infectWithRabies()
    expect(normal.variant).toBe('normal')
    expect(normal.isFrenzied()).toBe(true)
    expect(normal.isRabid()).toBe(true)
  })

  it('composes juvenile and variant scale without double-application', () => {
    const factor = JUVENILE_SCALE_FACTOR.deer ?? 1
    const juvenileAlpha = new AnimalAgent(makeDeps({
      def: ANIMAL_DEFS.deer,
      animalId: 'juv-alpha-deer',
      lifeStage: 'juvenile',
      variant: 'alpha',
    }))
    const juvenile = new AnimalAgent(makeDeps({
      def: ANIMAL_DEFS.deer,
      animalId: 'juv-deer',
      lifeStage: 'juvenile',
    }))
    const adultAlpha = new AnimalAgent(makeDeps({
      def: ANIMAL_DEFS.deer,
      animalId: 'adult-alpha-deer',
      variant: 'alpha',
    }))
    expect(juvenileAlpha.mesh.scale.x).toBeCloseTo(factor * ANIMAL_VARIANT_DEFS.alpha.scaleMultiplier, 10)
    expect(juvenileAlpha.mesh.scale.x).toBeCloseTo(juvenile.mesh.scale.x * ANIMAL_VARIANT_DEFS.alpha.scaleMultiplier, 10)
    expect(juvenileAlpha.mesh.scale.x).toBeCloseTo(adultAlpha.mesh.scale.x * factor, 10)
  })

  it('darkens one wolf without mutating a shared material on another', () => {
    const shared = new THREE.MeshStandardMaterial({ color: 0x5a5a62 })
    const alphaMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), shared)
    const normalMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), shared)
    const alpha = new AnimalAgent(makeDeps({
      variant: 'alpha',
      animalId: 'alpha-tint',
      visual: alphaMesh,
    }))
    const normal = new AnimalAgent(makeDeps({
      animalId: 'normal-tint',
      visual: normalMesh,
    }))
    expect((normal.mesh as THREE.Mesh).material).toBe(shared)
    expect((shared.color as THREE.Color).getHex()).toBe(0x5a5a62)
    expect((alpha.mesh as THREE.Mesh).material).not.toBe(shared)
    expect(((alpha.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x48484e)
  })

  it('exposes kill-context significance without an alpha_wolf kind', () => {
    const normal = new AnimalAgent(makeDeps({ animalId: 'kill-normal' }))
    const alpha = new AnimalAgent(makeDeps({ variant: 'alpha', animalId: 'kill-alpha' }))
    const normalCtx = {
      animalId: normal.animalId,
      animalKind: normal.def.kind,
      dangerSignificance: normal.dangerSignificance,
      position: { x: normal.mesh.position.x, z: normal.mesh.position.z },
    }
    const alphaCtx = {
      animalId: alpha.animalId,
      animalKind: alpha.def.kind,
      dangerSignificance: alpha.dangerSignificance,
      position: { x: alpha.mesh.position.x, z: alpha.mesh.position.z },
    }
    expect(normalCtx.animalKind).toBe('wolf')
    expect(alphaCtx.animalKind).toBe('wolf')
    expect(normalCtx.dangerSignificance).toBe(1)
    expect(alphaCtx.dangerSignificance).toBeGreaterThan(normalCtx.dangerSignificance)
  })

  it('keeps night prey slowdown and then applies the variant speed multiplier', () => {
    const deer = new AnimalAgent(makeDeps({ def: ANIMAL_DEFS.deer, animalId: 'night-deer' }))
    const alphaDeer = new AnimalAgent(makeDeps({
      def: ANIMAL_DEFS.deer,
      animalId: 'night-alpha-deer',
      variant: 'alpha',
    }))
    const observerPos = new THREE.Vector3(1000, 0, 1000)
    deer.update({ dt: 0, others: [], observerPos, dayFactor: -1, forestFactor: 0, litFires: [] })
    alphaDeer.update({ dt: 0, others: [], observerPos, dayFactor: -1, forestFactor: 0, litFires: [] })
    expect(walkSpeedNow(deer)).toBeCloseTo(ANIMAL_DEFS.deer.walkSpeed * 0.5, 10)
    expect(walkSpeedNow(alphaDeer)).toBeCloseTo(
      ANIMAL_DEFS.deer.walkSpeed * 0.5 * ANIMAL_VARIANT_DEFS.alpha.speedMultiplier,
      10,
    )
  })
})

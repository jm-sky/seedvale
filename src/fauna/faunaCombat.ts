import type { CombatTargetHandle } from '../combat/combatIntent'
import type { ToolKind } from '../items/HeldTool'
import type { AnimalAgent, AnimalKind } from './AnimalAgent'
import { ITEM_CATALOG } from '../items/itemCatalog'

export type { HealthState } from '../shared/HealthState'
export { createHealthState } from '../shared/HealthState'

export const MAX_HP: Record<AnimalKind, number> = {
  wolf: 50,
  fox: 25,
  deer: 30,
  stag: 40,
  rabbit: 10,
  duck: 8,
  boar: 35,
  bear: 150,
  horse: 80,
  donkey: 55,
  cow: 70,
  sheep: 22,
  chicken: 6,
  rooster: 7,
}

/** Predator kind -> prey kind -> damage per attack. */
const DAMAGE_TABLE: Partial<Record<AnimalKind, Partial<Record<AnimalKind, number>>>> = {
  wolf: { deer: 15, stag: 12, boar: 10, sheep: 14, donkey: 14, chicken: 20, rooster: 20 },
  fox: { deer: 10, stag: 6, rabbit: 20, duck: 18, chicken: 20, rooster: 20 },
  // Large omnivorous predator — hits harder than wolf across the board (plan 188).
  bear: { deer: 26, stag: 22, boar: 20, sheep: 24, donkey: 22, cow: 20, chicken: 28, rooster: 28 },
}

const DEFAULT_DAMAGE = 8

/** Flat predator → human damage (plan 056). Not keyed by prey kind — humans
 *  are not `AnimalKind`. Keep local until shared combat (045) replaces it. */
const HUMAN_DAMAGE: Partial<Record<AnimalKind, number>> = {
  wolf: 12,
  fox: 6,
  bear: 22,
}

/** Held tools that can hit an animal on `[E]` (sword > axe > pitchfork > knife = sickle > shovel).
 *  Roadmap: branch melee + item durability — see
 *  `docs/items/CATALOG.md` / `items/itemCatalog.ts` (`ITEM_SYSTEM_ROADMAP`). */
export type MeleeToolKind = Extract<
  ToolKind,
  | 'long_sword'
  | 'spear'
  | 'short_sword'
  | 'axe'
  | 'pitchfork'
  | 'knife'
  | 'sickle'
  | 'shovel'
  | 'damascus_knife'
  | 'damascus_short_sword'
  | 'damascus_long_sword'
  | 'obsidian_sword'
  | 'battle_axe'
  | 'masterwork_sword'
>

/** `ITEM_CATALOG[kind].melee` is the single source of truth for which tools
 *  are melee-capable and their damage/timing (plan 123) — this is a thin type
 *  guard over that, not a parallel list. */
export function isMeleeTool(kind: ToolKind | null | undefined): kind is MeleeToolKind {
  return kind != null && ITEM_CATALOG[kind]?.melee != null
}

export function damageFor(predator: AnimalKind, prey: AnimalKind): number {
  return DAMAGE_TABLE[predator]?.[prey] ?? DEFAULT_DAMAGE
}

export function damageVsHuman(predator: AnimalKind): number {
  return HUMAN_DAMAGE[predator] ?? DEFAULT_DAMAGE
}

/** `CombatTargetHandle` for an `AnimalAgent` (plan 177 §5/§14) — the NPC
 *  Combat's own target seam over the existing animal HealthState/death path,
 *  not a second animal-combat system. `AnimalAgent.takeDamage`'s
 *  `source: 'npc'` reuses its existing player-attack provocation reaction. */
export function combatTargetForAnimal(animal: AnimalAgent): CombatTargetHandle {
  return {
    ref: { id: animal.animalId, kind: 'animal' },
    getPosition: () => (animal.isDead() ? null : { x: animal.mesh.position.x, z: animal.mesh.position.z }),
    isAlive: () => !animal.isDead(),
    applyDamage: (amount) => animal.takeDamage(amount, 'npc'),
  }
}

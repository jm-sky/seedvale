import type { DungeonChamber } from '../world/caves/dungeonChambers'
import type { AnimalKind } from './AnimalAgent'
import type { AnimalHabitatBinding } from './animalCaveHabitat'
import type { PersistentOccupantDecl } from './persistentOccupants'
import { ANIMAL_DEFS } from './animalDefs'

/** Fauna-owned deterministic namespace for dungeon resident rolls (plan fauna-027). */
const FAUNA_DUNGEON_RESIDENT_SALT = 0xfa27a001

function fnv1a32(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Unit interval roll hashed per `(caveId, chamberNodeId, purpose)` — iteration-order independent. */
export function dungeonResidentRoll(caveId: string, chamberNodeId: string, purpose: string): number {
  const h = fnv1a32(`${caveId}:${chamberNodeId}:${purpose}:${FAUNA_DUNGEON_RESIDENT_SALT}`)
  return (h % 10_000) / 10_000
}

export function dungeonChamberHabitatId(caveId: string, chamberNodeId: string): string {
  return `${caveId}:dungeon-chamber:${chamberNodeId}`
}

export type DungeonCaveResidentInput = {
  caveId: string
  entrance: { x: number, z: number }
  chambers: readonly DungeonChamber[]
}

export type DungeonResidentsPlan = {
  decls: readonly PersistentOccupantDecl[]
  bindings: readonly AnimalHabitatBinding[]
}

const OPTIONAL_CHAMBER_CHANCE = 0.75
const BEAR_SPECIES_WEIGHT = 0.72

function isHomeEligible(chamber: DungeonChamber): boolean {
  return chamber.class !== 'entrance-adjacent'
}

function chamberDistanceToEntrance(chamber: DungeonChamber, entrance: { x: number, z: number }): number {
  return Math.hypot(chamber.position.x - entrance.x, chamber.position.z - entrance.z)
}

function pickReservedChamber(
  caveId: string,
  eligible: readonly DungeonChamber[],
  entrance: { x: number, z: number },
): DungeonChamber {
  const scored = eligible.map((chamber) => {
    const dist = chamberDistanceToEntrance(chamber, entrance)
    const biasRoll = dungeonResidentRoll(caveId, chamber.nodeId, 'reserved-bias')
    return { chamber, score: dist * (0.55 + biasRoll * 0.9) }
  })
  scored.sort((a, b) => a.score - b.score || a.chamber.nodeId.localeCompare(b.chamber.nodeId))
  const bucket = dungeonResidentRoll(caveId, 'reserved', 'chamber-pick')
  const index = Math.min(scored.length - 1, Math.floor(bucket * scored.length))
  return scored[index]!.chamber
}

function pickSpecies(caveId: string, chamberNodeId: string): AnimalKind {
  const roll = dungeonResidentRoll(caveId, chamberNodeId, 'species')
  return roll < BEAR_SPECIES_WEIGHT ? 'bear' : 'wolf'
}

function isPredatorKind(kind: AnimalKind): boolean {
  return ANIMAL_DEFS[kind].role === 'predator'
}

/**
 * Pure planner for deterministic dungeon cave persistent residents (plan fauna-027).
 *
 * @domain fauna
 */
export function buildDungeonResidentsPlan(dungeons: readonly DungeonCaveResidentInput[]): DungeonResidentsPlan {
  const decls: PersistentOccupantDecl[] = []
  const bindings: AnimalHabitatBinding[] = []

  for (const dungeon of dungeons) {
    const homeEligible = dungeon.chambers.filter(isHomeEligible)
    if (homeEligible.length === 0) continue

    const reserved = pickReservedChamber(dungeon.caveId, homeEligible, dungeon.entrance)
    const assignable = homeEligible.filter((c) => c.nodeId !== reserved.nodeId)
    const maxResidents = Math.min(dungeon.chambers.length - 1, assignable.length)
    if (maxResidents <= 0) continue

    const selected: DungeonChamber[] = []
    const guaranteed = assignable.reduce((best, chamber) => {
      if (!best) return chamber
      const rollA = dungeonResidentRoll(dungeon.caveId, chamber.nodeId, 'guaranteed-pick')
      const rollB = dungeonResidentRoll(dungeon.caveId, best.nodeId, 'guaranteed-pick')
      return rollA < rollB ? chamber : best
    }, assignable[0]!)
    selected.push(guaranteed)

    for (const chamber of assignable) {
      if (chamber.nodeId === guaranteed.nodeId) continue
      if (selected.length >= maxResidents) break
      if (dungeonResidentRoll(dungeon.caveId, chamber.nodeId, 'optional-chamber') < OPTIONAL_CHAMBER_CHANCE) {
        selected.push(chamber)
      }
    }

    const speciesByChamber = new Map<string, AnimalKind>()
    for (const chamber of selected) {
      speciesByChamber.set(chamber.nodeId, pickSpecies(dungeon.caveId, chamber.nodeId))
    }
    if (!selected.some((chamber) => isPredatorKind(speciesByChamber.get(chamber.nodeId)!))) {
      const fixChamber = selected.reduce((best, chamber) => {
        if (!best) return chamber
        const rollA = dungeonResidentRoll(dungeon.caveId, chamber.nodeId, 'predator-fix')
        const rollB = dungeonResidentRoll(dungeon.caveId, best.nodeId, 'predator-fix')
        return rollA < rollB ? chamber : best
      }, selected[0]!)
      speciesByChamber.set(fixChamber.nodeId, 'bear')
    }

    for (const chamber of selected) {
      const habitatId = dungeonChamberHabitatId(dungeon.caveId, chamber.nodeId)
      const kind = speciesByChamber.get(chamber.nodeId)!
      decls.push({ habitatId, occupantKey: 'resident', kind })
      bindings.push({
        habitatId,
        source: { kind: 'cave', caveId: dungeon.caveId, homeNodeId: chamber.nodeId },
      })
    }
  }

  return { decls, bindings }
}

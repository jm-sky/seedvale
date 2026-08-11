import * as THREE from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { ANIMAL_DEFS, AnimalAgent } from '../fauna/AnimalAgent'
import {
  createChickenModel,
  createCowModel,
  createHorseModel,
  createSheepModel,
} from '../fauna/proceduralAnimals'
import { createSeededRandom } from '../world/parseSeed'
import { type VillageSize, villageSizeConfig } from './families'

/** Owned farm animal kinds — the only `AnimalKind`s this module ever spawns. */
type LivestockKind = 'horse' | 'cow' | 'sheep' | 'chicken'

const MODEL_BUILDERS: Record<LivestockKind, () => THREE.Object3D> = {
  horse: createHorseModel,
  cow: createCowModel,
  sheep: createSheepModel,
  chicken: createChickenModel,
}

/** Given ownership, chance of 2 animals instead of 1. */
const LIVESTOCK_TWO_CHANCE = 0.4
/** Species weights when a house rolls an animal — common (chicken) to rare
 *  (horse). Order matters: cumulative-sum picking below walks this list. */
const SPECIES_WEIGHTS: readonly [LivestockKind, number][] = [
  ['chicken', 0.42],
  ['sheep', 0.28],
  ['cow', 0.17],
  ['horse', 0.13],
]
/** Outposts get a much poorer roll than a normal house — at most a single
 *  chicken (chance from `VILLAGE_SIZE_CONFIG.OUTPOST.livestockOwnershipChance`),
 *  never a cow/horse/sheep (no room/need for a herd at a 1-person cabin). */
/** `[min, max]` wander radius (world units) from the owning house — tight
 *  enough that even on the closest realistic house spacing (LG villages,
 *  `villageClearing.ts`'s ring math), two neighboring farmyards' wander
 *  circles don't overlap. Overrides `AnimalAgent`'s wider wild-animal
 *  default (see `AnimalAgent.ts`'s `DEFAULT_WANDER_RADIUS`). */
const LIVESTOCK_WANDER_RADIUS: readonly [number, number] = [3, 6]
/** `[min, max]` distance from the house position a spawned animal's initial
 *  point is offset by — close enough to read as "belongs to this house",
 *  not literally standing in the doorway. */
const SPAWN_OFFSET_RANGE: readonly [number, number] = [1.5, 4]

/** Deterministic per-house seed, same xor/imul idiom as `families.ts`'s
 *  `familySeed` — every house's ownership/count/species/placement rolls
 *  come from one seeded stream, in that order, so a given settlement seed
 *  always produces the same livestock. */
function houseSeed(settlementSeed: number, houseIndex: number): number {
  return (settlementSeed ^ Math.imul(houseIndex + 1, 0xc2b2ae35) ^ 0x4c4956) >>> 0
}

function pickSpecies(random: () => number): LivestockKind {
  const roll = random()
  let cumulative = 0
  for (const [kind, weight] of SPECIES_WEIGHTS) {
    cumulative += weight
    if (roll < cumulative) return kind
  }
  return SPECIES_WEIGHTS[SPECIES_WEIGHTS.length - 1]![0]
}

/** Random walkable point near `home`, within `SPAWN_OFFSET_RANGE` — mirrors
 *  `createFauna.ts`'s `findWalkableNear`, just anchored on a house instead
 *  of the settlement center. Falls back to the house's own position if no
 *  walkable offset is found (e.g. house right at the shoreline). */
function findSpotNearHouse(
  home: THREE.Vector3,
  sampleHeight: HeightSampler,
  waterLevel: number,
  random: () => number,
): { x: number, z: number } {
  const [minR, maxR] = SPAWN_OFFSET_RANGE
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = random() * Math.PI * 2
    const dist = minR + random() * (maxR - minR)
    const x = home.x + Math.cos(angle) * dist
    const z = home.z + Math.sin(angle) * dist
    if (sampleHeight(x, z) > waterLevel + 0.6) return { x, z }
  }
  return { x: home.x, z: home.z }
}

function kindsForHouse(size: VillageSize, random: () => number): LivestockKind[] {
  const ownershipChance = villageSizeConfig(size).livestockOwnershipChance
  if (size === 'OUTPOST') {
    return random() < ownershipChance ? ['chicken'] : []
  }
  if (random() >= ownershipChance) return []
  const count = random() < LIVESTOCK_TWO_CHANCE ? 2 : 1
  const kinds: LivestockKind[] = []
  for (let i = 0; i < count; i++) kinds.push(pickSpecies(random))
  return kinds
}

/**
 * Spawns one house-anchored `AnimalAgent` per rolled farm animal, one
 * deterministic roll per house in `homes` (1:1 with the settlement's
 * `families`, see `createSettlement.ts`). Purely synchronous — the
 * `LivestockKind` visuals are all procedural builders (`proceduralAnimals.ts`),
 * no GLB/async loading involved.
 */
export function spawnLivestock(
  scene: THREE.Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  homes: readonly THREE.Vector3[],
  size: VillageSize,
  settlementSeed: number,
): AnimalAgent[] {
  const agents: AnimalAgent[] = []
  homes.forEach((home, i) => {
    const random = createSeededRandom(houseSeed(settlementSeed, i))
    for (const kind of kindsForHouse(size, random)) {
      const { x, z } = findSpotNearHouse(home, sampleHeight, waterLevel, random)
      const visual = MODEL_BUILDERS[kind]()
      const agent = new AnimalAgent(
        ANIMAL_DEFS[kind],
        sampleHeight,
        waterLevel,
        x,
        z,
        visual,
        [],
        LIVESTOCK_WANDER_RADIUS,
      )
      scene.add(agent.mesh)
      agents.push(agent)
    }
  })
  return agents
}

/** Unlike `createFauna.ts`'s `disposeAgent` (which only frees capsule
 *  geometry, since GLB clones share the loader's cached GPU resources),
 *  every livestock visual here is a fresh procedural build
 *  (`proceduralAnimals.ts`) with its own geometry/material — always safe,
 *  and necessary, to dispose. */
export function disposeLivestock(agents: readonly AnimalAgent[]): void {
  for (const agent of agents) {
    agent.dispose()
    agent.mesh.removeFromParent()
    disposeObject3D(agent.mesh)
  }
}

import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { Household } from './household'
import {
  disposeObject3D,
  type GltfAsset,
  loadGltfAsset,
  prepareProp,
} from '../assets/loadGltf'
import { isSystemEnabled } from '../debug/debugMode'
import { ANIMAL_DEFS, AnimalAgent, type AnimalKind } from '../fauna/AnimalAgent'
import {
  createChickenModel,
  createCowModel,
  createDonkeyModel,
  createHorseModel,
  createSheepModel,
} from '../fauna/proceduralAnimals'
import { createSeededRandom } from '../world/parseSeed'
import { type VillageSize, villageSizeConfig } from './families'
import { homePlaceId } from './places'

/** Owned farm animal kinds — the only `AnimalKind`s this module ever spawns. */
type LivestockKind = 'horse' | 'donkey' | 'cow' | 'sheep' | 'chicken'

export const LIVESTOCK_URLS: Record<LivestockKind, string> = {
  horse: '/models/fauna/horse.glb',
  donkey: '/models/fauna/donkey.glb',
  cow: '/models/fauna/cow.glb',
  sheep: '/models/fauna/sheep.glb',
  chicken: '/models/fauna/chicken.glb',
}

/** Single source of truth for "is this kind's `animalId` trustworthy after a
 *  reload" — livestock respawns deterministically per settlement/house seed,
 *  wild fauna does not (plan 110, `QuestManager`'s restore loop). */
export const LIVESTOCK_KINDS: ReadonlySet<AnimalKind> = new Set(Object.keys(LIVESTOCK_URLS) as AnimalKind[])

const MODEL_BUILDERS: Record<LivestockKind, () => THREE.Object3D> = {
  horse: createHorseModel,
  donkey: createDonkeyModel,
  cow: createCowModel,
  sheep: createSheepModel,
  chicken: createChickenModel,
}

/** Given ownership, chance of 2 animals instead of 1. */
const LIVESTOCK_TWO_CHANCE = 0.4
/** Species weights when a house rolls an animal — chicken common, horse rare.
 *  Order matters: cumulative-sum picking below walks this list. */
const SPECIES_WEIGHTS: readonly [LivestockKind, number][] = [
  ['chicken', 0.40],
  ['sheep', 0.26],
  ['cow', 0.16],
  ['donkey', 0.12],
  ['horse', 0.06],
]
/** Outposts get a much poorer roll than a normal house — at most a single
 *  chicken (chance from `VILLAGE_SIZE_CONFIG.OUTPOST.livestockOwnershipChance`),
 *  never a cow/horse/sheep/donkey (no room/need for a herd at a 1-person cabin). */
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

const livestockTemplates: Partial<Record<LivestockKind, GltfAsset>> = {}
let livestockTemplatesPromise: Promise<void> | null = null

function wrapModel(model: THREE.Object3D): THREE.Group {
  const wrap = new THREE.Group()
  wrap.add(model)
  return wrap
}

async function ensureLivestockTemplates(): Promise<void> {
  if (livestockTemplatesPromise) {
    await livestockTemplatesPromise
    return
  }
  livestockTemplatesPromise = (async () => {
    const entries = await Promise.all(
      (Object.entries(LIVESTOCK_URLS) as [LivestockKind, string][]).map(async ([kind, url]) => {
        try {
          const asset = await loadGltfAsset(url)
          // Clone before prepareProp so the shared GLTF cache stays unscaled
          // (merchant horse.glb also clones from that cache).
          const prepared = asset.clone()
          prepareProp(prepared, ANIMAL_DEFS[kind].modelHeight)
          const wrapped: GltfAsset = {
            root: prepared,
            animations: asset.animations,
            clone: () => cloneSkinned(prepared) as THREE.Group,
          }
          return [kind, wrapped] as const
        } catch (err) {
          console.warn(`[livestock] failed to load ${url}, procedural fallback`, err)
          return [kind, null] as const
        }
      }),
    )
    for (const [kind, asset] of entries) {
      if (asset) livestockTemplates[kind] = asset
    }
  })()
  await livestockTemplatesPromise
}

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

function visualFor(kind: LivestockKind): { visual: THREE.Object3D, animations: THREE.AnimationClip[] } {
  const tpl = livestockTemplates[kind]
  if (tpl) {
    return { visual: wrapModel(tpl.clone()), animations: tpl.animations }
  }
  return { visual: MODEL_BUILDERS[kind](), animations: [] }
}

/**
 * Spawns one house-anchored `AnimalAgent` per rolled farm animal, one
 * deterministic roll per house in `homes` (1:1 with the settlement's
 * `families`, see `createSettlement.ts`). Loads livestock GLBs once, then
 * clones; procedural builders remain the fallback.
 */
export async function spawnLivestock(
  scene: THREE.Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  collidersNear: ColliderSource,
  homes: readonly THREE.Vector3[],
  size: VillageSize,
  settlementSeed: number,
  settlementId: string,
  /** Reports any livestock death (any cause) by `animalId` — forwarded into
   *  every `AnimalAgent` this factory spawns (plan 110). */
  onAnimalDeath?: (animalId: string) => void,
  /** `homeId -> Household` (plan 122), built by `createSettlement.ts` before
   *  this call — gives house-anchored livestock their owning household's
   *  water reserve so thirst can prefer the `AnimalTrough` over a shoreline
   *  search. `undefined`/missing entries fall back to the pre-122 shoreline
   *  behaviour (same as wild fauna). */
  householdByHomeId?: ReadonlyMap<string, Household>,
): Promise<AnimalAgent[]> {
  if (!isSystemEnabled('animals')) return []
  await ensureLivestockTemplates()
  const agents: AnimalAgent[] = []
  homes.forEach((home, i) => {
    const random = createSeededRandom(houseSeed(settlementSeed, i))
    let houseAnimalIndex = 0
    // Same index `i` the settlement uses for `homePlaces[i]`/households
    // (`createSettlement.ts`) — so a livestock's owner is the same house a
    // quest could later look up via `Household`/`Place` (plan 093 Etap G).
    const ownerHouseId = homePlaceId(settlementId, i)
    const household = householdByHomeId?.get(ownerHouseId)
    for (const kind of kindsForHouse(size, random)) {
      const { x, z } = findSpotNearHouse(home, sampleHeight, waterLevel, random)
      const { visual, animations } = visualFor(kind)
      const animalId = `${kind}-house${i}-${houseAnimalIndex++}`
      const agent = new AnimalAgent(
        ANIMAL_DEFS[kind],
        animalId,
        sampleHeight,
        waterLevel,
        collidersNear,
        x,
        z,
        visual,
        animations,
        LIVESTOCK_WANDER_RADIUS,
        undefined,
        ownerHouseId,
        onAnimalDeath,
        undefined,
        undefined,
        undefined,
        household,
      )
      scene.add(agent.mesh)
      agents.push(agent)
    }
  })
  return agents
}

/** GLB clones share the loader's cached GPU resources (`sharedGpu`);
 *  procedural fallbacks own their geometry — `disposeObject3D` skips shared. */
export function disposeLivestock(agents: readonly AnimalAgent[]): void {
  for (const agent of agents) {
    agent.dispose()
    agent.mesh.removeFromParent()
    disposeObject3D(agent.mesh)
  }
}

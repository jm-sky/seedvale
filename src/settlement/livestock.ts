import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { AnimalSaveState, NearbyNpcCandidate, VillageInfo } from '../fauna/AnimalAgent'
import type { DropLivestockProductHook } from '../fauna/livestockProduction'
import type { OwnedAnimalControlMode } from '../fauna/ownedAnimalControl'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { LocalWaterSample } from '../terrain/waterSample'
import type { GrassForageService } from '../world/createGrassForagePatches'
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
  type AnimalOwner,
  deriveOwnerHouseId,
  isPlayerOwned as isPlayerOwnedOwner,
  parseAnimalOwnerFromRecord,
} from '../fauna/animalOwnership'
import {
  createChickenModel,
  createCowModel,
  createDogModel,
  createDonkeyModel,
  createHorseModel,
  createRoosterModel,
  createSheepModel,
} from '../fauna/proceduralAnimals'
import { SHEPHERD_FLOCK_SALT, shepherdFlockSize } from '../fauna/shepherdFlock'
import { createSeededRandom } from '../world/parseSeed'
import { type VillageSize, villageSizeConfig } from './families'
import { homePlaceId } from './places'

/** Append sheep onto a house's rolled kinds until the shepherd flock size is
 *  met. Extra sheep are appended so earlier house rolls keep their animal
 *  ids; existing sheep already in `kinds` count toward the flock. */
export function fillShepherdFlockKinds<T extends string>(kinds: T[], flockSize: number): void {
  let sheep = 0
  for (const kind of kinds) if (kind === 'sheep') sheep++
  while (sheep < flockSize) {
    kinds.push('sheep' as T)
    sheep++
  }
}

/** Owned farm animal kinds — the only `AnimalKind`s this module ever spawns. */
type LivestockKind = 'horse' | 'donkey' | 'cow' | 'sheep' | 'chicken' | 'rooster' | 'dog'

/** One or more visual variants per kind — every `LivestockKind` but `dog`
 *  has exactly one (kept as a 1-element array so `ensureLivestockTemplates`/
 *  `visualFor` don't need a special case). `dog` has two (Husky/Shiba, plan
 *  fauna-011 §1) — same simulation kind/behaviour, `visualFor` just picks a
 *  deterministic variant per `animalId`, never a second `AnimalKind`. */
export const LIVESTOCK_URLS: Record<LivestockKind, readonly string[]> = {
  horse: ['/models/fauna/horse.glb'],
  donkey: ['/models/fauna/donkey.glb'],
  cow: ['/models/fauna/cow.glb'],
  sheep: ['/models/fauna/sheep.glb'],
  chicken: ['/models/fauna/chicken.glb'],
  // No dedicated GLB yet (plan fauna-009 §3) — `ensureLivestockTemplates`'s
  // existing load-failure fallback resolves this to `createRoosterModel()`
  // until one is dropped in here; no logic change needed when it is.
  rooster: ['/models/fauna/rooster.glb'],
  dog: ['/models/fauna/dog_husky.glb', '/models/fauna/dog_shiba.glb'],
}

/** Single source of truth for "is this kind's `animalId` trustworthy after a
 *  reload" — livestock respawns deterministically per settlement/house seed,
 *  wild fauna does not (plan 110, `QuestManager`'s restore loop). */
export const LIVESTOCK_KINDS: ReadonlySet<AnimalKind> = new Set(Object.keys(LIVESTOCK_URLS) as AnimalKind[])

/**
 * Seed salt for the guaranteed sheep.
 */
const GUARANTEED_SHEEP_SEED_SALT = 0x53484545

/** One persisted livestock/merchant-horse individual (plan persistence-001) —
 *  `AnimalAgent.snapshot()`'s authoritative fields plus the identity needed
 *  to reconnect it to the right settlement/house on load. `kind`/
 *  `ownerHouseId` are validated against the deterministically-recomputed
 *  identity at hydration time (`spawnLivestock`'s per-individual kind/owner
 *  check below), never trusted blindly. */
export type LivestockSaveRecord = {
  settlementId: string
  animalId: string
  kind: AnimalKind
  /** Legacy household slot id — derived from `owner` on write (plan fauna-020). */
  ownerHouseId?: string
  /** Authoritative ownership when present (plan fauna-020). */
  owner?: AnimalOwner
} & AnimalSaveState

export function isPlayerOwnedLivestockRecord(record: LivestockSaveRecord): boolean {
  return isPlayerOwnedOwner(parseAnimalOwnerFromRecord(record))
}

export function livestockRecordMatchesHouseholdSlot(
  record: LivestockSaveRecord,
  kind: AnimalKind,
  ownerHouseId: string,
): boolean {
  if (isPlayerOwnedLivestockRecord(record)) return false
  const recordOwner = parseAnimalOwnerFromRecord(record)
  return record.kind === kind
    && recordOwner?.kind === 'household'
    && recordOwner.houseId === ownerHouseId
}

/** Narrow view `spawnLivestock()`/`createSettlement.ts` need over the
 *  per-manager livestock persistence store (see `createLivestockRegistry`
 *  below) — deliberately excludes `capture`/`serialize`, which only
 *  `SettlementsManager` calls. */
export type LivestockPersistence = {
  /** This settlement's saved individuals, keyed by `animalId` — `undefined`
   *  when nothing was ever saved for it (a fresh settlement, or an old save
   *  predating this collection). */
  getSaved: (settlementId: string) => ReadonlyMap<string, LivestockSaveRecord> | undefined
  /** `animalId`s whose corpse/removal lifecycle already completed before
   *  save — deterministic spawning must never recreate them. */
  getRemoved: (settlementId: string) => ReadonlySet<string> | undefined
  /** Called once, the instant `Settlement.update()` disposes an animal whose
   *  `readyToRemove()` became true — records the tombstone immediately so a
   *  later stream-out/stream-in (or a save right after) can't resurrect it. */
  markRemoved: (settlementId: string, animalId: string) => void
}

/** Per-`SettlementsManager` livestock persistence store (plan
 *  persistence-001) — mirrors `HouseholdRegistry`/`NpcStateRegistry`'s
 *  "same-manager-lifetime registry, `capture`/`serialize` at save time"
 *  shape, applied to livestock: unlike households/NPC state, an
 *  `AnimalAgent` has no live object that survives a settlement unload today,
 *  so `capture()` must snapshot the currently-loaded array explicitly
 *  (`SettlementsManager.unload()`/`snapshotLivestock()`) rather than reading
 *  a state object that outlives the agent. */
export type LivestockRegistry = LivestockPersistence & {
  /** Overwrites this settlement's saved individuals with a fresh snapshot of
   *  its currently-live `AnimalAgent`s — called right before disposing a
   *  streamed-out settlement, and again (to refresh loaded settlements) right
   *  before a save. Removed/tombstoned animals are absent from `animals`
   *  already (`Settlement.update()`'s own array splice), so this never
   *  resurrects one dropped via `markRemoved`. */
  capture: (settlementId: string, animals: readonly AnimalAgent[]) => void
  /** Upserts one live individual under its origin namespace (plan fauna-020). */
  upsert: (settlementId: string, animal: AnimalAgent) => void
  /** Flat `SaveData`-shaped snapshot of everything captured so far. */
  serialize: () => { entries: LivestockSaveRecord[], removedIds: string[] }
  clear: () => void
}

function livestockToSaveRecord(settlementId: string, animal: AnimalAgent): LivestockSaveRecord {
  const owner = animal.getOwner()
  return {
    settlementId,
    animalId: animal.animalId,
    kind: animal.def.kind,
    owner,
    ownerHouseId: deriveOwnerHouseId(owner),
    ...animal.snapshot(),
  }
}

export type SpawnAnimalFromRecordDeps = {
  scene: THREE.Scene
  sampleHeight: HeightSampler
  waterLevel: number
  sampleLocalWater: (x: number, z: number) => LocalWaterSample
  collidersNear: ColliderSource
  onAnimalDeath?: (animalId: string) => void
}

/** Spawns one persistent livestock individual from a saved record (plan fauna-020). */
export async function spawnAnimalFromRecord(
  deps: SpawnAnimalFromRecordDeps,
  record: LivestockSaveRecord,
): Promise<AnimalAgent> {
  await ensureLivestockTemplates()
  const kind = record.kind as LivestockKind
  const { visual, animations } = visualFor(kind, record.animalId)
  const agent = new AnimalAgent({
    def: ANIMAL_DEFS[kind],
    animalId: record.animalId,
    sampleHeight: deps.sampleHeight,
    waterLevel: deps.waterLevel,
    sampleLocalWater: deps.sampleLocalWater,
    collidersNear: deps.collidersNear,
    x: record.x,
    z: record.z,
    visual,
    animations,
    wanderRadius: LIVESTOCK_WANDER_RADIUS,
    ownerHouseId: deriveOwnerHouseId(parseAnimalOwnerFromRecord(record)),
    onDeath: deps.onAnimalDeath,
  })
  agent.hydrate({
    ...record,
    owner: parseAnimalOwnerFromRecord(record),
  })
  deps.scene.add(agent.mesh)
  return agent
}

/** `removedLivestockIds` composite key — `animalId` alone collides across
 *  settlements (see `LivestockSaveRecord`'s doc), so every persisted
 *  removed-id is namespaced the same way. */
function removedKey(settlementId: string, animalId: string): string {
  return `${settlementId}:${animalId}`
}

function createGuaranteedSheep(
  homes: readonly THREE.Vector3[],
  settlementSeed: number,
  settlementId: string,
  householdByHomeId: ReadonlyMap<string, Household> | undefined,
  sampleHeight: HeightSampler,
  waterLevel: number,
  sampleLocalWater: (x: number, z: number) => LocalWaterSample,
  collidersNear: ColliderSource,
  onAnimalDeath: ((animalId: string) => void) | undefined,
  removed: ReadonlySet<string> | undefined,
  saved: ReadonlyMap<string, LivestockSaveRecord> | undefined,
): AnimalAgent | null {
  const homeIndex = 0
  const home = homes[homeIndex]!

  // Dedicated RNG stream: adding this sheep must not alter existing
  // livestock rolls or positions.
  const random = createSeededRandom(settlementSeed ^ GUARANTEED_SHEEP_SEED_SALT)

  const ownerHouseId = homePlaceId(settlementId, homeIndex)
  const household = householdByHomeId?.get(ownerHouseId)

  const { x, z } = findSpotNearHouse(
    home,
    sampleHeight,
    waterLevel,
    random,
  )

  const animalId = `sheep-home${homeIndex}-guaranteed`

  if (removed?.has(animalId)) return null
  const savedRecord = saved?.get(animalId)
  if (savedRecord && isPlayerOwnedLivestockRecord(savedRecord)) return null

  const { visual, animations } = visualFor('sheep', animalId)

  const agent = new AnimalAgent({
    def: ANIMAL_DEFS.sheep,
    animalId,
    sampleHeight,
    waterLevel,
    sampleLocalWater,
    collidersNear,
    x,
    z,
    visual,
    animations,
    wanderRadius: LIVESTOCK_WANDER_RADIUS,
    ownerHouseId,
    onDeath: onAnimalDeath,
    household,
  })

  const record = saved?.get(animalId)

  if (record && livestockRecordMatchesHouseholdSlot(record, 'sheep', ownerHouseId)) {
    agent.hydrate({ ...record, owner: parseAnimalOwnerFromRecord(record) })
  }

  return agent
}

export function createLivestockRegistry(initial?: {
  entries: readonly LivestockSaveRecord[]
  removedIds: readonly string[]
}): LivestockRegistry {
  const bySettlement = new Map<string, Map<string, LivestockSaveRecord>>()
  const removedBySettlement = new Map<string, Set<string>>()

  function savedFor(settlementId: string): Map<string, LivestockSaveRecord> {
    let m = bySettlement.get(settlementId)
    if (!m) {
      m = new Map()
      bySettlement.set(settlementId, m)
    }
    return m
  }

  for (const entry of initial?.entries ?? []) savedFor(entry.settlementId).set(entry.animalId, entry)
  for (const composite of initial?.removedIds ?? []) {
    const sep = composite.indexOf(':')
    if (sep < 0) continue
    const settlementId = composite.slice(0, sep)
    const animalId = composite.slice(sep + 1)
    let s = removedBySettlement.get(settlementId)
    if (!s) {
      s = new Set()
      removedBySettlement.set(settlementId, s)
    }
    s.add(animalId)
  }

  return {
    capture(settlementId, animals) {
      const m = savedFor(settlementId)
      for (const animal of animals) m.set(animal.animalId, livestockToSaveRecord(settlementId, animal))
    },
    upsert(settlementId, animal) {
      savedFor(settlementId).set(animal.animalId, livestockToSaveRecord(settlementId, animal))
    },
    markRemoved(settlementId, animalId) {
      bySettlement.get(settlementId)?.delete(animalId)
      let s = removedBySettlement.get(settlementId)
      if (!s) {
        s = new Set()
        removedBySettlement.set(settlementId, s)
      }
      s.add(animalId)
    },
    getSaved: (settlementId) => bySettlement.get(settlementId),
    getRemoved: (settlementId) => removedBySettlement.get(settlementId),
    serialize() {
      const entries: LivestockSaveRecord[] = []
      for (const m of bySettlement.values()) entries.push(...m.values())
      const removedIds: string[] = []
      for (const [settlementId, ids] of removedBySettlement) {
        for (const animalId of ids) removedIds.push(removedKey(settlementId, animalId))
      }
      return { entries, removedIds }
    },
    clear() {
      bySettlement.clear()
      removedBySettlement.clear()
    },
  }
}

const MODEL_BUILDERS: Record<LivestockKind, () => THREE.Object3D> = {
  horse: createHorseModel,
  donkey: createDonkeyModel,
  cow: createCowModel,
  sheep: createSheepModel,
  chicken: createChickenModel,
  rooster: createRoosterModel,
  dog: createDogModel,
}

/** Independent per-house chance of a guard dog (plan fauna-011 §2) — a
 *  separate deterministic draw appended *after* every existing species-
 *  count/species-pick/rooster-companion roll for this house, same "never
 *  perturbs an existing save's roll sequence" reasoning as
 *  `ROOSTER_COMPANION_CHANCE` above. Not conditioned on owning other
 *  livestock — applies to every house, including an `OUTPOST`'s single
 *  cabin. */
const DOG_OWNERSHIP_CHANCE = 0.35

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

/** One entry per successfully-loaded URL in `LIVESTOCK_URLS[kind]`, same
 *  order — `visualFor()` picks an index deterministically per `animalId`.
 *  A kind whose only URL failed to load has no entry here at all (falls
 *  through to `MODEL_BUILDERS`), same as before this became an array. */
const livestockTemplates: Partial<Record<LivestockKind, GltfAsset[]>> = {}
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
      (Object.entries(LIVESTOCK_URLS) as [LivestockKind, readonly string[]][]).flatMap(([kind, urls]) =>
        urls.map(async (url) => {
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
      ),
    )
    for (const [kind, asset] of entries) {
      if (asset) (livestockTemplates[kind] ??= []).push(asset)
    }
  })()
  await livestockTemplatesPromise
}

/** Deterministic string hash (FNV-1a) — picks a stable visual variant per
 *  `animalId` (plan fauna-011 §1) so the same individual always renders as
 *  the same Husky/Shiba across a reload, without persisting a variant index. */
function hashAnimalId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
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

/** Chance a house that rolled at least one chicken also gets a companion
 *  rooster (plan fauna-009 §2) — a separate deterministic draw appended
 *  *after* the existing species-count/species-pick rolls above, so it never
 *  perturbs their sequence: the persisted `animalId` of any existing
 *  chicken/sheep/cow/donkey/horse individual is built from `kind` +
 *  `houseAnimalIndex`, both already fixed by the time this roll runs
 *  (fauna-009 implementation notes — must not change existing species-roll
 *  outcomes for an existing save). */
const ROOSTER_COMPANION_CHANCE = 0.5

function kindsForHouse(size: VillageSize, random: () => number): LivestockKind[] {
  const ownershipChance = villageSizeConfig(size).livestockOwnershipChance
  let kinds: LivestockKind[]
  if (size === 'OUTPOST') {
    kinds = random() < ownershipChance ? ['chicken'] : []
  } else if (random() >= ownershipChance) {
    kinds = []
  } else {
    const count = random() < LIVESTOCK_TWO_CHANCE ? 2 : 1
    kinds = []
    for (let i = 0; i < count; i++) kinds.push(pickSpecies(random))
    if (kinds.includes('chicken') && random() < ROOSTER_COMPANION_CHANCE) kinds.push('rooster')
  }
  // Plan fauna-011 §2: always the last draw for this house, in every branch
  // above (including `OUTPOST`) — see `DOG_OWNERSHIP_CHANCE`'s doc.
  if (random() < DOG_OWNERSHIP_CHANCE) kinds.push('dog')
  return kinds
}

/** `animalId` picks which loaded variant this individual renders as (plan
 *  fauna-011 §1) — deterministic and stable across a reload (no variant
 *  index needs persisting), a no-op for every kind with a single URL. */
function visualFor(kind: LivestockKind, animalId: string): { visual: THREE.Object3D, animations: THREE.AnimationClip[] } {
  const variants = livestockTemplates[kind]
  if (variants && variants.length > 0) {
    const tpl = variants[hashAnimalId(animalId) % variants.length]!
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
  sampleLocalWater: (x: number, z: number) => LocalWaterSample,
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
  /** Merchant wagon's horse spawn point (`props.ts`'s
   *  `landmarks.merchantHorseSpawn`, plan fauna-003 follow-up) — `undefined`
   *  for a settlement with no merchant wagon. Spawned through this same
   *  factory (not a decorative mesh, not a separate spawn path) so it's a
   *  normal `AnimalAgent('horse')`: mountable, wandering, with its own
   *  needs/lifecycle, just like any house-owned horse. Not tied to a house
   *  (`ownerHouseId`/`household` stay unset, same as wild fauna). */
  merchantHorseSpawn?: { x: number, z: number, yaw: number },
  /** Saved livestock state + tombstones for this settlement (plan
   *  persistence-001) — `undefined` for a settlement with nothing saved yet
   *  (fresh world, or an old save predating this collection). */
  persistence?: LivestockPersistence,
  /** Home settlement always starts with at least one sheep. */
  ensureSheep = false,
  /** Family index of the generated shepherd household, or `null`. */
  shepherdHouseIndex: number | null = null,
): Promise<AnimalAgent[]> {
  if (!isSystemEnabled('animals')) return []
  await ensureLivestockTemplates()
  const saved = persistence?.getSaved(settlementId)
  const removed = persistence?.getRemoved(settlementId)
  const agents: AnimalAgent[] = []
  const rolledEnsuredAnimals = {
    sheep: false,
  }

  homes.forEach((home, i) => {
    const random = createSeededRandom(houseSeed(settlementSeed, i))
    let houseAnimalIndex = 0
    // Same index `i` the settlement uses for `homePlaces[i]`/households
    // (`createSettlement.ts`) — so a livestock's owner is the same house a
    // quest could later look up via `Household`/`Place` (plan 093 Etap G).
    const ownerHouseId = homePlaceId(settlementId, i)
    const household = householdByHomeId?.get(ownerHouseId)
    const kinds = kindsForHouse(size, random)
    if (shepherdHouseIndex === i) {
      const flockRandom = createSeededRandom(settlementSeed ^ SHEPHERD_FLOCK_SALT ^ houseSeed(settlementSeed, i))
      fillShepherdFlockKinds(kinds, shepherdFlockSize(flockRandom))
    }

    if (kinds.includes('sheep')) {
      rolledEnsuredAnimals.sheep = true
    }

    for (const kind of kinds) {
      // Position/yaw rolls always happen, even for a tombstoned individual —
      // deterministic spawning must stay in sync for any later kind rolled
      // at this same house (plan persistence-001 §7).
      const { x, z } = findSpotNearHouse(home, sampleHeight, waterLevel, random)
      const animalId = `${kind}-house${i}-${houseAnimalIndex++}`
      if (removed?.has(animalId)) continue
      const record = saved?.get(animalId)
      if (record && isPlayerOwnedLivestockRecord(record)) continue
      const { visual, animations } = visualFor(kind, animalId)
      const agent = new AnimalAgent({
        def: ANIMAL_DEFS[kind],
        animalId,
        sampleHeight,
        waterLevel,
        sampleLocalWater,
        collidersNear,
        x,
        z,
        visual,
        animations,
        wanderRadius: LIVESTOCK_WANDER_RADIUS,
        ownerHouseId,
        onDeath: onAnimalDeath,
        household,
      })
      // Persisted household-owned state is authoritative for an existing
      // individual — player-owned records restore via the detached path.
      if (record && livestockRecordMatchesHouseholdSlot(record, kind, ownerHouseId)) {
        agent.hydrate({ ...record, owner: parseAnimalOwnerFromRecord(record) })
      }
      scene.add(agent.mesh)
      agents.push(agent)
    }
  })

  if (ensureSheep && !rolledEnsuredAnimals.sheep && homes.length > 0) {
    const sheep = createGuaranteedSheep(
      homes, settlementSeed,
      settlementId,
      householdByHomeId,
      sampleHeight,
      waterLevel,
      sampleLocalWater,
      collidersNear,
      onAnimalDeath,
      removed,
      saved
    )
    if (sheep) {
      scene.add(sheep.mesh)
      agents.push(sheep)
    }
  }

  if (merchantHorseSpawn) {
    const animalId = `merchant-horse-${settlementId}`
    const record = saved?.get(animalId)
    if (!removed?.has(animalId) && !(record && isPlayerOwnedLivestockRecord(record))) {
      const { visual, animations } = visualFor('horse', animalId)
      const agent = new AnimalAgent({
        def: ANIMAL_DEFS.horse,
        animalId,
        sampleHeight,
        waterLevel,
        sampleLocalWater,
        collidersNear,
        x: merchantHorseSpawn.x,
        z: merchantHorseSpawn.z,
        visual,
        animations,
        wanderRadius: LIVESTOCK_WANDER_RADIUS,
      })
      agent.mesh.rotation.y = merchantHorseSpawn.yaw
      if (record && record.kind === 'horse') {
        agent.hydrate({ ...record, owner: parseAnimalOwnerFromRecord(record) })
      }
      scene.add(agent.mesh)
      agents.push(agent)
    }
  }
  return agents
}

/** GLB clones share the loader's cached GPU resources (`sharedGpu`);
 *  procedural fallbacks own their geometry — `disposeObject3D` skips shared. */
/** Restores every player-owned saved record as a detached live agent (plan fauna-020). */
export type PersistentLivestockContext = {
  getLoadedSettlements: () => readonly { id: string, livestock: readonly AnimalAgent[] }[]
  detached: AnimalAgent[]
  detachedById: Map<string, AnimalAgent>
  detachedOriginById: Map<string, string>
  registry: LivestockRegistry
}

export function resolveLivePersistentAnimal(
  ctx: PersistentLivestockContext,
  animalId: string,
): {
  animal: AnimalAgent
  originSettlementId: string
  settlementLivestock: readonly AnimalAgent[] | null
} | null {
  const detached = ctx.detachedById.get(animalId)
  if (detached) {
    const origin = ctx.detachedOriginById.get(animalId)
    if (!origin) return null
    return { animal: detached, originSettlementId: origin, settlementLivestock: null }
  }
  for (const settlement of ctx.getLoadedSettlements()) {
    const found = settlement.livestock.find((a) => a.animalId === animalId)
    if (found) {
      return {
        animal: found,
        originSettlementId: settlement.id,
        settlementLivestock: settlement.livestock,
      }
    }
  }
  return null
}

export function transferAnimalOwnership(
  ctx: PersistentLivestockContext,
  animalId: string,
  newOwner: AnimalOwner,
): boolean {
  const resolved = resolveLivePersistentAnimal(ctx, animalId)
  if (!resolved || newOwner?.kind !== 'player' || resolved.animal.isPlayerOwned()) return false

  resolved.animal.transferOwnershipToPlayer()

  if (resolved.settlementLivestock) {
    const list = resolved.settlementLivestock as AnimalAgent[]
    const idx = list.indexOf(resolved.animal)
    if (idx >= 0) list.splice(idx, 1)
  }

  if (!ctx.detachedById.has(animalId)) {
    ctx.detached.push(resolved.animal)
    ctx.detachedById.set(animalId, resolved.animal)
  }
  ctx.detachedOriginById.set(animalId, resolved.originSettlementId)
  ctx.registry.upsert(resolved.originSettlementId, resolved.animal)
  return true
}

export function setOwnedAnimalControl(
  ctx: PersistentLivestockContext,
  animalId: string,
  mode: OwnedAnimalControlMode,
): boolean {
  const resolved = resolveLivePersistentAnimal(ctx, animalId)
  if (!resolved || !resolved.animal.isPlayerOwned() || resolved.animal.isDead()) return false
  resolved.animal.setOwnedControlMode(mode)
  ctx.registry.upsert(resolved.originSettlementId, resolved.animal)
  return true
}

export async function restoreDetachedPlayerOwnedLivestock(
  deps: SpawnAnimalFromRecordDeps,
  registry: LivestockRegistry,
  detached: AnimalAgent[],
  detachedById: Map<string, AnimalAgent>,
  detachedOriginById: Map<string, string>,
): Promise<void> {
  for (const record of registry.serialize().entries) {
    if (!isPlayerOwnedLivestockRecord(record)) continue
    if (detachedById.has(record.animalId)) continue
    const agent = await spawnAnimalFromRecord(deps, record)
    detached.push(agent)
    detachedById.set(record.animalId, agent)
    detachedOriginById.set(record.animalId, record.settlementId)
  }
}

export function disposeLivestock(agents: readonly AnimalAgent[]): void {
  for (const agent of agents) {
    agent.dispose()
    agent.mesh.removeFromParent()
    disposeObject3D(agent.mesh)
  }
}

/**
 * Per-frame livestock tick for one settlement (createSettlement refactor
 * review, E5) — moved out of `createSettlement.ts`'s `update()` verbatim so
 * it lives next to `spawnLivestock`/`disposeLivestock`/`LivestockRegistry`,
 * the persistence contract the corpse-removal tombstoning belongs to.
 * `livestock` is mutated in place (corpses spliced out) — `Settlement
 * .livestock` and `LivestockRegistry.capture` both hold that same array
 * reference, so this must never replace it with a new array.
 */
export function tickSettlementLivestock(
  livestock: AnimalAgent[],
  ctx: {
    dt: number
    settlementId: string
    observerPos: THREE.Vector3
    dayFactor: number
    timeOfDay: number
    nowDays: number
    litFires: readonly { x: number, z: number }[]
    villages: readonly VillageInfo[]
    /** Reads the *latest* `nowDays` at collection time, not lay time — a
     *  chicken's egg can be collected an arbitrary number of frames/days
     *  after it was laid, so a frozen `nowDays` from lay time would be wrong. */
    getNowDays: () => number
    dropLivestockProduct?: DropLivestockProductHook
    onAnimalVocalize?: (kind: AnimalKind, x: number, z: number) => void
    persistence?: LivestockPersistence
    /** Shared world-owned grass forage service (plan fauna-010 §3/§4) —
     *  forwarded unchanged into every `AnimalAgent.update()` call below, same
     *  contract as `createFauna.ts`'s wild-fauna loop. */
    grassForage?: GrassForageService
    /** Shared world-owned player-trough water provider (plan items-player-020
     *  §4) — same forwarding contract as `grassForage` above. */
    waterSourceProvider?: import('../fauna/animalForaging').AnimalWaterSourceProvider
    /** Bounded/local live wild predators (plan fauna-011 §9/§10/§11) — only
     *  meaningful for an owned `dog` (`AnimalAgent.resolveGuardTarget()`);
     *  every other livestock kind never reads this. The caller
     *  (`createSettlement.ts`) is responsible for keeping this small (a
     *  per-frame filter over `Fauna.getAgents()`, not a scan per dog). */
    nearbyPredators?: readonly AnimalAgent[]
    /** This settlement's own live NPCs, as bounded bark-perception
     *  candidates (plan fauna-011 §7) — only meaningful for an owned `dog`'s
     *  stranger-bark check (`resolveBarkStimulus`). Cheaper than the global
     *  cross-settlement `nearbyNpcs` wolves use: a dog only cares about
     *  strangers right by its own house. */
    nearbySettlementNpcs?: readonly NearbyNpcCandidate[]
    /** This settlement's own live rats (plan fauna-016 §9) — only meaningful
     *  for an owned `dog`'s idle pest-chase (`AnimalAgent.pursuePest`), same
     *  "small caller-bounded population, not a scan" contract as
     *  `nearbyPredators`/`nearbySettlementNpcs` above. */
    nearbyRats?: readonly AnimalAgent[]
    /** Player-as-observer presentation inputs (npc-023). */
    playerObservation?: import('../simulation/observation').PlayerObservationInput
    /** Narrow player position for player-owned Follow control (plan fauna-020). */
    playerControlPos?: { x: number, z: number }
    /** Origin namespace for detached individuals (plan fauna-020). */
    resolvePersistenceSettlementId?: (animal: AnimalAgent) => string
  },
): void {
  const { dt, settlementId, observerPos, dayFactor, timeOfDay, nowDays, litFires, villages, getNowDays, dropLivestockProduct, onAnimalVocalize, persistence, grassForage, waterSourceProvider, nearbyPredators, nearbySettlementNpcs, nearbyRats, playerObservation, playerControlPos, resolvePersistenceSettlementId } = ctx
  // `forestFactor` is hardcoded to 0 — every owned-livestock `AnimalDef` has
  // `playerNoticeRange`/`playerPanicRange` 0, so the forestFactor-modified
  // branch of `isPlayerNoticed()` is structurally unreachable for these
  // kinds regardless of the value passed.
  for (const animal of livestock) {
    animal.update({
      dt,
      others: livestock,
      observerPos,
      dayFactor,
      forestFactor: 0,
      litFires,
      villages,
      onVocalize: onAnimalVocalize,
      nowDays,
      timeOfDay,
      grassForage,
      waterSourceProvider,
      nearbyPredators,
      nearbySettlementNpcs,
      nearbyRats,
      playerObservation,
      playerControlPos,
    })
    // Plan fauna-002 §2 — a `chicken`'s egg becomes a normal world item the
    // instant its cycle completes, at wherever it's currently standing; the
    // animal only learns it was collected via the `onCollected` hook, never
    // by polling.
    if (animal.readyToLayEgg(nowDays) && dropLivestockProduct) {
      dropLivestockProduct('egg', animal.mesh.position.x, animal.mesh.position.z, () => animal.notifyEggCollected(getNowDays()))
      animal.markEggLaid()
      // Contextual vocalization (plan settlements-npcs-004 §2) — reuses the
      // same throttled hook as the spontaneous roll above rather than a
      // second UI/simulation trigger for the same clip.
      onAnimalVocalize?.(animal.def.kind, animal.mesh.position.x, animal.mesh.position.z)
    }
  }
  if (livestock.some((a) => a.readyToRemove())) {
    const kept: AnimalAgent[] = []
    for (const animal of livestock) {
      if (animal.readyToRemove()) {
        persistence?.markRemoved(resolvePersistenceSettlementId?.(animal) ?? settlementId, animal.animalId)
        animal.dispose()
        animal.mesh.removeFromParent()
        disposeObject3D(animal.mesh)
      } else {
        kept.push(animal)
      }
    }
    livestock.length = 0
    livestock.push(...kept)
  }
}

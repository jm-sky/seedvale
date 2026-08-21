import { type Object3D, type Scene, Vector3 } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { ThreateningAnimalCandidate } from '../ai/npcAnimalThreat'
import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { PlayAt } from '../audio/createWorldAudio'
import type { HomeVillageSize } from '../config/worldConfig'
import type { EconomicKind } from '../economy/kinds'
import type { VillageInfo } from '../fauna/AnimalAgent'
import type { ColliderSource, HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { SettlementMiningHooks } from '../terrain/resourceDeposits'
import type { Collider } from '../world/collision'
import type { NearbyPlayerWellLookup } from '../world/playerWell'
import type { SettlementForestHooks } from '../world/settlementForestHooks'
import type { TerrainSamplers } from './settlementTerrain'
import { disposeObject3D } from '../assets/loadGltf'
import { createEconomyRegistry } from '../economy'
import { type ChunkCoord, worldToChunk } from '../terrain/chunkGrid'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { createNullPointLightBudget, type PointLightBudget } from '../world/pointLightBudget'
import { createSettlement, type Settlement } from './createSettlement'
import { createHouseholdRegistry } from './household'
import { createSignpost, placeOnGround } from './props'
import {
  type MidpointSignpost,
  midpointSignpostsFor,
  neighborsFor,
  type RoadNetworkContext,
} from './roadNetwork'
import {
  cellsWithinRadius,
  SETTLEMENT_GRID_STEP,
  type SettlementCell,
  type SettlementDef,
  worldToCell,
} from './settlementGenerator'
import { settlementDefFor } from './settlementPlanCache'

type Entry = {
  def: SettlementDef
  settlement: Settlement | null
  pendingPromise: Promise<void> | null
}

/** 3×3 block of chunks around a settlement's site — mirrors `worldBundle.ts`'s
 *  `homeChunks()`, generalized to any world position. A non-home settlement's
 *  props (huts/lamps/forest belt) get positioned with `sampleHeight`, which
 *  silently falls back to clearing-agnostic raw terrain height for chunks
 *  that haven't generated yet (see `chunkManager.ts`'s `readField`) — that
 *  fallback ignores the village-clearing flattening baked into the real
 *  mesh, so anything placed before this settlement's own chunks are ready
 *  ends up floating relative to the (differently-shaped) terrain that loads
 *  in moments later. Awaiting this in `ensureLoaded` before building closes
 *  that race. */
function chunksNear(x: number, z: number, chunkSize: number): ChunkCoord[] {
  const center = worldToChunk(x, z, chunkSize)
  const coords: ChunkCoord[] = []
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) coords.push({ cx: center.cx + dx, cz: center.cz + dz })
  }
  return coords
}

/** How many of the home settlement's nearest neighbor settlements get
 *  streamed in immediately at world start, instead of waiting for the player
 *  to wander within `loadRadius` — guarantees there's a village (and a road
 *  to it, see `roadNetwork.ts`) findable right away. Deliberately independent
 *  of `RegionParams.roadNetwork.maxNeighborRoads` (the wider regional road
 *  network's fan-out), which can be tuned higher without also inflating
 *  startup load cost. */
const EAGER_NEIGHBOR_COUNT = 2

export type SettlementsManager = {
  /** Settlement at grid cell (0,0) — always loaded, where the player spawns.
   *  Fauna/item spawners anchor to this one only (v1 scope: no per-settlement
   *  resource distribution, see multi-settlements plan). */
  home: Settlement
  /** Streams settlements in/out by distance and ticks every loaded one's NPCs
   *  (and owned livestock, see `createSettlement.ts`). `timeOfDay`/`dayFactor`/
   *  `litFires`/`villages` are forwarded straight through to each loaded
   *  `Settlement.update` — same values `app/createApp.ts` already computes
   *  for the global `Fauna.update` call. */
  update: (
    dt: number,
    playerPos: Vector3,
    playerYaw: number,
    timeOfDay: number,
    dayFactor: number,
    litFires: readonly { x: number, z: number }[],
    villages: readonly VillageInfo[],
    dayLengthSec: number,
    /** Bounded/local currently-threatening animals (plan 179 §7/§10/§20) —
     *  forwarded straight to each loaded `Settlement.update`/`NpcAgent.update`.
     *  Defaults to none so existing callers/tests are unaffected. */
    nearbyAnimalThreats?: readonly ThreateningAnimalCandidate[],
  ) => void
  /** Forwarded to every loaded settlement's `setDayNight` (house window
   *  glow) — also remembered so a settlement streamed in later starts at the
   *  current time of day instead of flashing on/off at its own default. */
  setDayNight: (t: number) => void
  /** Called once when a `world/timeSkip.ts` skip finishes — replays the
   *  skipped period for every loaded settlement's NPCs (needs/stamina/
   *  position catch-up) instead of leaving them to walk it off in real time.
   *  Only loaded settlements' NPCs exist to update; unloaded ones re-seed
   *  from scratch on load regardless. See `NpcAgent.resolveTimeSkip`
   *  (`docs/plans/archive/2026-08-12--075--time-skip-npc-catchup.md`). */
  resolveTimeSkip: (startTimeOfDay: number, hours: number, dayLengthSec: number) => void
  getLoaded: () => Settlement[]
  /** Home settlement definition (includes authoritative `VillagePlan`). */
  getHomeDef: () => SettlementDef
  /** Resolve a settlement def from the shared plan cache without loading meshes. */
  peekDef: (cell: SettlementCell) => SettlementDef | null
  /** Stock-only snapshot of every settlement economy created so far (loaded
   *  or previously streamed out) — see `EconomyRegistry.serialize`. */
  snapshotEconomies: () => Record<string, Partial<Record<EconomicKind, number>>>
  dispose: () => void
}

export async function createSettlementsManager(
  scene: Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  localRadius: number,
  seed: number,
  playAt: PlayAt,
  loadRadius: number,
  unloadRadius: number,
  terrainSamplers: TerrainSamplers,
  heightScale: number,
  region: RegionParams,
  /** Forces + awaits generation of the terrain chunks around a settlement
   *  site before that settlement is built — see `chunksNear`'s comment. */
  waitForChunks: (coords: ChunkCoord[]) => Promise<void>,
  chunkSize: number,
  collidersNear: ColliderSource,
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void,
  clearColliders: (ownerKey: string) => void,
  forest?: SettlementForestHooks,
  homeSize: HomeVillageSize = 'auto',
  initialEconomies?: Record<string, Partial<Record<EconomicKind, number>>>,
  /** Reports any settlement's livestock deaths (any cause) by `animalId` —
   *  forwarded into every `createSettlement` call, home and streamed-in
   *  alike (plan 110). */
  onAnimalDeath?: (animalId: string) => void,
  /** Resolves an NPC's relation level + general player standing by name —
   *  forwarded into every `createSettlement` call the same way as
   *  `onAnimalDeath` above (plan 117). */
  getPlayerSocial?: PlayerSocialLookup,
  /** NPC ore-mining hooks over `ResourceDeposits` (plan 131) — forwarded into
   *  every `createSettlement` call the same way as `forest` above. */
  mining?: SettlementMiningHooks,
  /** Persistent land-plot ownership query (plan 129) — forwarded into every
   *  `createSettlement` call the same way as `mining` above. */
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean,
  /** Plan 157 — forwarded into every `createSettlement` call, home and
   *  streamed-in alike, the same way `mining`/`isLandPlotOwned` are above. */
  pointLightBudget: PointLightBudget = createNullPointLightBudget(),
  /** Bounded lookup for a nearby completed player-built well (plan 127 §10)
   *  — forwarded into every `createSettlement` call → every `NpcAgent`, the
   *  same way `getPlayerSocial` is above. */
  getNearbyPlayerWell?: NearbyPlayerWellLookup,
): Promise<SettlementsManager> {
  const roadCtx: RoadNetworkContext = {
    seed,
    sampleHeight,
    waterLevel,
    terrainSamplers,
    heightScale,
    region,
    localSearchRadius: localRadius,
    homeSize,
  }

  // Defs resolve through the shared settlement plan cache (plan 047 §9.15).
  function defFor(cell: SettlementCell): SettlementDef | null {
    return settlementDefFor(cell, {
      seed,
      sampleHeight,
      waterLevel,
      localSearchRadius: localRadius,
      terrainSamplers,
      heightScale,
      region,
      homeSize,
    })
  }

  const economies = createEconomyRegistry(initialEconomies)
  function economyFor(def: SettlementDef) {
    return economies.getOrCreate({
      id: def.id,
      size: def.size,
      foodSourceType: def.foodSourceType,
      familyCount: def.families.length,
      dominantResource: def.dominantResource,
    })
  }

  // Households (plan 069) live here, not per-`Settlement` — same reason as
  // `economies`: streaming a settlement out/in must reuse the same stock.
  const households = createHouseholdRegistry()

  const homeDef = defFor({ gx: 0, gz: 0 })
  if (!homeDef) {
    throw new Error('[SettlementsManager] home settlement (0,0) failed to generate')
  }
  const homeSettlement = await createSettlement(
    scene,
    sampleHeight,
    waterLevel,
    localRadius,
    seed,
    homeDef,
    economyFor(homeDef),
    households,
    collidersNear,
    registerColliders,
    clearColliders,
    playAt,
    roadCtx,
    forest,
    onAnimalDeath,
    getPlayerSocial,
    mining,
    isLandPlotOwned,
    pointLightBudget,
    getNearbyPlayerWell,
  )

  const entries = new Map<string, Entry>()
  entries.set(homeDef.id, { def: homeDef, settlement: homeSettlement, pendingPromise: null })

  // Remembered so a settlement that streams in later (or finishes its async
  // build after `setDayNight` already ran for this tick) starts its house
  // lights at the current time of day instead of the door default.
  let lastDayNight = 0

  // Midpoint road signposts (roads-and-paths plan, part 2) don't belong to
  // either settlement's own group/lifecycle — a pair only needs *some* known
  // entry on each end (not even fully built) to place, and should persist
  // until *neither* end is a known entry anymore, so they're tracked here
  // rather than inside `createSettlement`. `midpointSignpostsFor` only reads
  // each side's `SettlementDef` (cheap/deterministic), so this doesn't have
  // to wait for either settlement's async build to finish.
  type MidpointInstance = {
    prop: Object3D
    labelEl: HTMLDivElement
    label: CSS2DObject
    position: Vector3
    /** Last opacity written to `labelEl` — guards the DOM write like
     *  `NpcAgent`/`AnimalAgent` do, quantized so it actually catches repeats
     *  while the player is in continuous motion. */
    lastOpacity: number
  }
  const midpoints = new Map<string, MidpointInstance[]>()

  function midpointPairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }

  function buildMidpointInstance(sp: MidpointSignpost): MidpointInstance {
    const prop = createSignpost()
    prop.rotation.y = sp.angle
    placeOnGround(prop, sp.position.x, sp.position.z, sampleHeight)
    scene.add(prop)

    const labelEl = document.createElement('div')
    labelEl.className = 'npc-label'
    labelEl.textContent = sp.targetName
    const label = new CSS2DObject(labelEl)
    label.position.set(0, 2.5, 0)
    prop.add(label)

    return {
      prop,
      labelEl,
      label,
      position: new Vector3(sp.position.x, sampleHeight(sp.position.x, sp.position.z), sp.position.z),
      lastOpacity: -1,
    }
  }

  function disposeMidpointInstance(inst: MidpointInstance): void {
    inst.label.removeFromParent()
    inst.labelEl.remove()
    disposeObject3D(inst.prop)
    inst.prop.removeFromParent()
  }

  function syncMidpoints(): void {
    const wanted = new Set<string>()
    for (const entry of entries.values()) {
      for (const neighborDef of neighborsFor({ gx: entry.def.gx, gz: entry.def.gz }, roadCtx)) {
        if (!entries.has(neighborDef.id)) continue
        const key = midpointPairKey(entry.def.id, neighborDef.id)
        wanted.add(key)
        if (midpoints.has(key)) continue
        const result = midpointSignpostsFor(entry.def, neighborDef, roadCtx)
        if (!result) continue
        midpoints.set(key, result.map((sp) => buildMidpointInstance(sp)))
      }
    }
    for (const [key, instances] of [...midpoints]) {
      if (wanted.has(key)) continue
      for (const inst of instances) disposeMidpointInstance(inst)
      midpoints.delete(key)
    }
  }
  syncMidpoints()

  const cellRadius = Math.max(1, Math.ceil(loadRadius / SETTLEMENT_GRID_STEP) + 1)
  let lastCheckX = Number.POSITIVE_INFINITY
  let lastCheckZ = Number.POSITIVE_INFINITY
  const recheckDistance = loadRadius * 0.25

  function ensureLoaded(def: SettlementDef): void {
    if (entries.has(def.id)) return
    const entry: Entry = { def, settlement: null, pendingPromise: null }
    entries.set(def.id, entry)
    syncMidpoints()
    entry.pendingPromise = waitForChunks(chunksNear(def.x, def.z, chunkSize))
      .then(() => createSettlement(
        scene,
        sampleHeight,
        waterLevel,
        localRadius,
        seed,
        def,
        economyFor(def),
        households,
        collidersNear,
        registerColliders,
        clearColliders,
        playAt,
        roadCtx,
        forest,
        onAnimalDeath,
        getPlayerSocial,
        mining,
        isLandPlotOwned,
        pointLightBudget,
        getNearbyPlayerWell,
      ))
      .then((settlement) => {
        const cur = entries.get(def.id)
        if (!cur) {
          // Player wandered back out of range while this was building.
          settlement.dispose()
          return
        }
        cur.settlement = settlement
        settlement.setDayNight(lastDayNight)
      })
      .catch((err: unknown) => {
        console.error('[SettlementsManager] failed to build settlement', def.id, err)
        entries.delete(def.id)
      })
      .finally(() => {
        const cur = entries.get(def.id)
        if (cur) cur.pendingPromise = null
      })
  }

  // Same async streaming path `recheck` uses once the player wanders into
  // range — just triggered immediately so the nearest village(s) are already
  // built (or well underway) long before the player could reach them on foot.
  for (const neighborDef of neighborsFor({ gx: 0, gz: 0 }, roadCtx).slice(0, EAGER_NEIGHBOR_COUNT)) {
    ensureLoaded(neighborDef)
  }

  function unload(id: string, entry: Entry): void {
    entry.settlement?.dispose()
    entries.delete(id)
    syncMidpoints()
  }

  function recheck(playerX: number, playerZ: number): void {
    lastCheckX = playerX
    lastCheckZ = playerZ
    const playerCell = worldToCell(playerX, playerZ)

    for (const cell of cellsWithinRadius(playerCell, cellRadius)) {
      const def = defFor(cell)
      if (!def) continue
      const dist = Math.hypot(def.x - playerX, def.z - playerZ)
      if (dist <= loadRadius) ensureLoaded(def)
    }
    for (const [id, entry] of [...entries]) {
      if (entry.def.isHome || entry.pendingPromise) continue
      const dist = Math.hypot(entry.def.x - playerX, entry.def.z - playerZ)
      if (dist > unloadRadius) unload(id, entry)
    }
  }

  return {
    home: homeSettlement,
    setDayNight(t) {
      lastDayNight = t
      for (const entry of entries.values()) entry.settlement?.setDayNight(t)
    },
    resolveTimeSkip(startTimeOfDay, hours, dayLengthSec) {
      for (const entry of entries.values()) {
        if (!entry.settlement) continue
        for (const npc of entry.settlement.npcs) npc.resolveTimeSkip(startTimeOfDay, hours, dayLengthSec)
      }
    },
    update(dt, playerPos, playerYaw, timeOfDay, dayFactor, litFires, villages, dayLengthSec, nearbyAnimalThreats) {
      if (Math.hypot(playerPos.x - lastCheckX, playerPos.z - lastCheckZ) >= recheckDistance) {
        recheck(playerPos.x, playerPos.z)
      }
      for (const entry of entries.values()) {
        entry.settlement?.update(
          dt,
          playerPos,
          playerYaw,
          timeOfDay,
          dayFactor,
          litFires,
          villages,
          dayLengthSec,
          nearbyAnimalThreats,
        )
      }
      for (const instances of midpoints.values()) {
        for (const inst of instances) {
          const opacity = Math.round(labelOpacityForDistance(inst.position.distanceTo(playerPos)) * 32) / 32
          if (opacity !== inst.lastOpacity) {
            inst.lastOpacity = opacity
            inst.labelEl.style.opacity = String(opacity)
          }
        }
      }
    },
    getLoaded() {
      const out: Settlement[] = []
      for (const entry of entries.values()) {
        if (entry.settlement) out.push(entry.settlement)
      }
      return out
    },
    getHomeDef: () => homeDef,
    peekDef: (cell) => defFor(cell),
    snapshotEconomies: () => economies.serialize(),
    dispose() {
      for (const entry of entries.values()) entry.settlement?.dispose()
      for (const instances of midpoints.values()) {
        for (const inst of instances) disposeMidpointInstance(inst)
      }
      midpoints.clear()
      entries.clear()
      economies.clear()
      households.clear()
    },
  }
}

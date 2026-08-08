import { type Object3D, type Scene, Vector3 } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { TerrainSamplers } from './settlementTerrain'
import { disposeObject3D } from '../assets/loadGltf'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { createSettlement, type Settlement } from './createSettlement'
import { createSignpost, placeOnGround } from './props'
import {
  type MidpointSignpost,
  midpointSignpostsFor,
  neighborsFor,
  type RoadNetworkContext,
} from './roadNetwork'
import {
  cellsWithinRadius,
  generateSettlementDef,
  SETTLEMENT_GRID_STEP,
  type SettlementCell,
  type SettlementDef,
  worldToCell,
} from './settlementGenerator'

type Entry = {
  def: SettlementDef
  settlement: Settlement | null
  pendingPromise: Promise<void> | null
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
  /** Streams settlements in/out by distance and ticks every loaded one's NPCs. */
  update: (dt: number, playerPos: Vector3) => void
  getLoaded: () => Settlement[]
  dispose: () => void
}

export async function createSettlementsManager(
  scene: Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  localRadius: number,
  seed: number,
  playSound: (url: string, volume?: number) => void,
  loadRadius: number,
  unloadRadius: number,
  terrainSamplers: TerrainSamplers,
  heightScale: number,
  region: RegionParams,
): Promise<SettlementsManager> {
  const roadCtx: RoadNetworkContext = {
    seed,
    sampleHeight,
    waterLevel,
    terrainSamplers,
    heightScale,
    region,
    localSearchRadius: localRadius,
  }

  // Defs are pure functions of (seed, cell) — cached so repeated streaming
  // rechecks don't redo the ~80-sample flat-site search for cells we've
  // already visited.
  const defCache = new Map<string, SettlementDef>()
  function defFor(cell: SettlementCell): SettlementDef {
    const key = `${cell.gx}_${cell.gz}`
    let def = defCache.get(key)
    if (!def) {
      def = generateSettlementDef(
        cell,
        seed,
        sampleHeight,
        waterLevel,
        localRadius,
        terrainSamplers,
        heightScale,
        region,
      )
      defCache.set(key, def)
    }
    return def
  }

  const homeDef = defFor({ gx: 0, gz: 0 })
  const homeSettlement = await createSettlement(
    scene,
    sampleHeight,
    waterLevel,
    localRadius,
    seed,
    homeDef,
    playSound,
    roadCtx,
  )

  const entries = new Map<string, Entry>()
  entries.set(homeDef.id, { def: homeDef, settlement: homeSettlement, pendingPromise: null })

  // Midpoint road signposts (roads-and-paths plan, part 2) don't belong to
  // either settlement's own group/lifecycle — a pair only needs *some* known
  // entry on each end (not even fully built) to place, and should persist
  // until *neither* end is a known entry anymore, so they're tracked here
  // rather than inside `createSettlement`. `midpointSignpostsFor` only reads
  // each side's `SettlementDef` (cheap/deterministic), so this doesn't have
  // to wait for either settlement's async build to finish.
  type MidpointInstance = { prop: Object3D, labelEl: HTMLDivElement, label: CSS2DObject, position: Vector3 }
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
    entry.pendingPromise = createSettlement(
      scene,
      sampleHeight,
      waterLevel,
      localRadius,
      seed,
      def,
      playSound,
      roadCtx,
    )
      .then((settlement) => {
        const cur = entries.get(def.id)
        if (!cur) {
          // Player wandered back out of range while this was building.
          settlement.dispose()
          return
        }
        cur.settlement = settlement
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
    update(dt, playerPos) {
      if (Math.hypot(playerPos.x - lastCheckX, playerPos.z - lastCheckZ) >= recheckDistance) {
        recheck(playerPos.x, playerPos.z)
      }
      for (const entry of entries.values()) entry.settlement?.update(dt, playerPos)
      for (const instances of midpoints.values()) {
        for (const inst of instances) {
          inst.labelEl.style.opacity = String(labelOpacityForDistance(inst.position.distanceTo(playerPos)))
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
    dispose() {
      for (const entry of entries.values()) entry.settlement?.dispose()
      for (const instances of midpoints.values()) {
        for (const inst of instances) disposeMidpointInstance(inst)
      }
      midpoints.clear()
      entries.clear()
    },
  }
}

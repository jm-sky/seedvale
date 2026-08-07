import { type Scene, type Vector3 } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import { createSettlement, type Settlement } from './createSettlement'
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
): Promise<SettlementsManager> {
  // Defs are pure functions of (seed, cell) — cached so repeated streaming
  // rechecks don't redo the ~80-sample flat-site search for cells we've
  // already visited.
  const defCache = new Map<string, SettlementDef>()
  function defFor(cell: SettlementCell): SettlementDef {
    const key = `${cell.gx}_${cell.gz}`
    let def = defCache.get(key)
    if (!def) {
      def = generateSettlementDef(cell, seed, sampleHeight, waterLevel, localRadius)
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
  )

  const entries = new Map<string, Entry>()
  entries.set(homeDef.id, { def: homeDef, settlement: homeSettlement, pendingPromise: null })

  const cellRadius = Math.max(1, Math.ceil(loadRadius / SETTLEMENT_GRID_STEP) + 1)
  let lastCheckX = Number.POSITIVE_INFINITY
  let lastCheckZ = Number.POSITIVE_INFINITY
  const recheckDistance = loadRadius * 0.25

  function ensureLoaded(def: SettlementDef): void {
    if (entries.has(def.id)) return
    const entry: Entry = { def, settlement: null, pendingPromise: null }
    entries.set(def.id, entry)
    entry.pendingPromise = createSettlement(
      scene,
      sampleHeight,
      waterLevel,
      localRadius,
      seed,
      def,
      playSound,
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

  function unload(id: string, entry: Entry): void {
    entry.settlement?.dispose()
    entries.delete(id)
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
      entries.clear()
    },
  }
}

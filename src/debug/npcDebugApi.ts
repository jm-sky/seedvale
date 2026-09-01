import type { NpcInspectionSnapshot, NpcWhy } from '../ai/NpcAgent'
import type { WorldBundle } from '../app/worldBundle'
import type { WorldConfig } from '../config/worldConfig'
import type { VillageSize } from '../settlement/families'
import type { WorldContext } from '../world/worldContext'
import type { WorldPoint } from './locationSearch'
import type { NpcTraceEvent } from './npcTrace'
import { getNavigationStats, type NavigationStats } from '../navigation/navigationStats'
import { isAdminMode, isDebugMode } from './debugMode'
import {
  deepForestNearest,
  type LocationResult,
  mountainNearest,
  oceanNearest,
  riverNearest,
  villageNearest,
} from './locationQueries'
import {
  findNpcById,
  freezeNpc,
  type FrenzyWolfDebugResult,
  type NpcQueryFilter,
  type NpcQueryResult,
  queryNpcs,
  reevaluateNpc,
  setFrenzyWolf,
  unfreezeNpc,
} from './npcInspector'
import { findVillageDef } from './villageInspector'

/**
 * Browser console / automation surface (plan 170 §4, extended by plan
 * `ui-input-001`) — `window.seedvale.debug`. Only installed while `?debug`
 * is enabled; returns plain JSON-serializable data so it works equally from
 * a browser devtools console and a scripted agent driving the page. No
 * dependency on Vue component state.
 */

export type NpcDebugHandle = {
  state: () => NpcInspectionSnapshot | null
  history: () => readonly NpcTraceEvent[] | null
  why: () => NpcWhy | null
  freeze: () => boolean
  unfreeze: () => boolean
  reevaluate: () => boolean
}

export type { LocationKind, LocationResult } from './locationQueries'

export type VillageDebugHandle = {
  id: string
  name: string
  size: VillageSize
  position: WorldPoint
  /** `[]` for a currently-unloaded village — no live `NpcAgent` instances
   *  exist for it (only deterministic def/household data does). */
  npcs: () => NpcQueryResult[]
  /** Re-resolves the village fresh at call time before teleporting — never
   *  reuses a def/position captured when the handle was created. */
  teleportHere: () => Promise<boolean>
  /** Per-house `HouseDefinition` id + whether it has a plan 168/169 bed
   *  lodging source — `null` while the settlement isn't currently loaded
   *  (same "streamed in" caveat as `npcs()`). */
  houses: () => { definitionId: string, hasBed: boolean }[] | null
}

export type LocationsDebugApi = {
  mountainNearest: () => LocationResult | null
  deepForestNearest: () => LocationResult | null
  riverNearest: () => LocationResult | null
  villageNearest: () => LocationResult | null
  oceanNearest: () => LocationResult | null
}

export type TeleportToDebugApi = {
  (location: LocationResult): Promise<boolean>
  mountainNearest: () => Promise<boolean>
  deepForestNearest: () => Promise<boolean>
  riverNearest: () => Promise<boolean>
  villageNearest: () => Promise<boolean>
  oceanNearest: () => Promise<boolean>
}

export type HiddenTreasureDebugApi = {
  /** The 3 flower/dig-marker positions for the home settlement's hidden
   *  treasure (quick task, `settlement/hiddenTreasure.ts`) — `null` while the
   *  home settlement hasn't finished its own build yet. */
  markers: () => WorldPoint[] | null
  /** Same one-shot flag `groundActions.ts` checks/sets — `true` once the
   *  reward chest has already been spawned. */
  found: () => boolean
  /** Teleports to marker `index` (default 0). `false` if markers aren't
   *  available yet. */
  teleport: (index?: number) => Promise<boolean>
}

export type SeedvaleDebugApi = {
  npc: (id: string) => NpcDebugHandle | null
  npcs: (filter?: NpcQueryFilter) => NpcQueryResult[]
  /** `setFrenzyWolf()` (plan 179 §3) — see `npcInspector.ts`'s doc. */
  setFrenzyWolf: () => FrenzyWolfDebugResult | string
  /** Resolves by id whether or not the village is currently loaded — `npcs()`
   *  is `[]` when unloaded. `null` for an unrecognized id. */
  village: (id: string) => VillageDebugHandle | null
  /** Currently loaded (streamed-in) villages only — use `village(id)` or
   *  `locations.villageNearest()` to reach one that hasn't streamed in. */
  villages: () => VillageDebugHandle[]
  /** Bounded, deterministic "nearest feature" queries from the player's
   *  current position — `null` if nothing qualifying is found within the
   *  search budget. */
  locations: LocationsDebugApi
  /** Teleport to a `locations.*` result, or run the matching `locations.*`
   *  query and teleport to it directly. Awaits terrain readiness first;
   *  resolves `false` (no teleport) if the location is `null`. */
  teleportTo: TeleportToDebugApi
  /** Hidden-treasure dig markers (quick task) — inspect/teleport for testing. */
  hiddenTreasure: HiddenTreasureDebugApi
  /** Lightweight `navigation/navigationStats.ts` counters (plan npc-006) —
   *  path requests/successes/failures, search time, visited nodes,
   *  waypoints, repaths and currently-active routes, session-wide across
   *  every `NpcAgent`/`AnimalAgent`. */
  navigation: () => Readonly<NavigationStats>
  help: () => string
}

declare global {
  interface Window {
    seedvale?: { debug: SeedvaleDebugApi }
  }
}

type VillageIdentityLike = { id: string, name: string, size: VillageSize, x: number, z: number }

const HELP_TEXT = [
  'window.seedvale.debug — developer console API (?debug=1 only)',
  'npc(id) / npcs(filter?) — inspect a live NPC by id / query all loaded NPCs',
  'village(id) — resolves by id even if the village is currently unloaded (npcs() is [] then)',
  'villages() — lists currently loaded villages only',
  'village(id).houses() / villages()[i].houses() — per-house definitionId + hasBed; null while unloaded',
  'locations.{mountainNearest,deepForestNearest,riverNearest,villageNearest,oceanNearest}() — bounded deterministic nearest-feature search from the player; null if none found within budget',
  'teleportTo(locationResult) / teleportTo.{mountainNearest,deepForestNearest,riverNearest,villageNearest,oceanNearest}() — teleport to a location query result; awaits terrain load first, resolves false if no such location exists',
  'setFrenzyWolf() — debug combat trigger',
  'hiddenTreasure.markers() / .found() / .teleport(index?) — hidden-treasure flower/dig-marker positions, one-shot found flag, teleport to marker index (default 0)',
  'navigation() — pathfinding counters (requests/successes/failures, search time, visited nodes, waypoints, repaths, active routes)',
].join('\n')

/** Installs `window.seedvale.debug` when `?debug` is enabled; a no-op
 *  outside debug mode, so the mutation surface does not exist in production
 *  builds. `bundle`/`worldContext`/`config` are stable containers/façades
 *  read fresh on every call (their fields are reassigned in place on
 *  `rebuildWorld()`, the references themselves never change); `getTimeOfDay`
 *  and `getPlayerPosition` are live accessors — so every call here reflects
 *  the current world without re-installing after a rebuild. `teleport` is a
 *  narrow async callback (built in `createApp.ts` from `PlayerController`
 *  + `ChunkManager.waitForChunks`) — this module never sees the player
 *  controller itself. */
export function installNpcDebugApi(
  bundle: WorldBundle,
  worldContext: WorldContext,
  config: WorldConfig,
  getTimeOfDay: () => number,
  getPlayerPosition: () => WorldPoint,
  teleport: (x: number, z: number) => Promise<void>,
  /** Same persisted one-shot bag `groundActions.ts` reads/writes — lets
   *  `hiddenTreasure.found()` reflect the real state. */
  worldFlags: { hiddenTreasureFound: boolean },
): void {
  if (!isDebugMode() && !isAdminMode()) return

  async function teleportToLocation(location: LocationResult | null): Promise<boolean> {
    if (!location) return false
    await teleport(location.position.x, location.position.z)
    return true
  }

  const locations: LocationsDebugApi = {
    mountainNearest: () => mountainNearest(getPlayerPosition(), worldContext),
    deepForestNearest: () => deepForestNearest(getPlayerPosition(), worldContext),
    riverNearest: () => riverNearest(getPlayerPosition(), config),
    villageNearest: () => villageNearest(getPlayerPosition(), bundle.settlementsManager),
    oceanNearest: () => oceanNearest(getPlayerPosition(), worldContext),
  }

  const teleportTo = Object.assign(
    (location: LocationResult) => teleportToLocation(location),
    {
      mountainNearest: () => teleportToLocation(locations.mountainNearest()),
      deepForestNearest: () => teleportToLocation(locations.deepForestNearest()),
      riverNearest: () => teleportToLocation(locations.riverNearest()),
      villageNearest: () => teleportToLocation(locations.villageNearest()),
      oceanNearest: () => teleportToLocation(locations.oceanNearest()),
    },
  ) as TeleportToDebugApi

  function villageHandle(identity: VillageIdentityLike): VillageDebugHandle {
    return {
      id: identity.id,
      name: identity.name,
      size: identity.size,
      position: { x: identity.x, z: identity.z },
      npcs: () => queryNpcs(bundle, getTimeOfDay(), { settlementId: identity.id }),
      houses: () => {
        const loaded = bundle.settlementsManager.getLoaded().find((s) => s.id === identity.id)
        if (!loaded) return null
        return loaded.landmarks.houses.map((h) => ({ definitionId: h.definitionId, hasBed: h.bed != null }))
      },
      teleportHere: async () => {
        const fresh = findVillageDef(bundle.settlementsManager, identity.id)
        if (!fresh) return false
        return teleportToLocation({
          kind: 'village',
          position: { x: fresh.x, z: fresh.z },
          distance: 0,
          id: fresh.id,
          name: fresh.name,
          size: fresh.size,
        })
      },
    }
  }

  const api: SeedvaleDebugApi = {
    npc: (id) => {
      if (!findNpcById(bundle, id)) return null
      return {
        state: () => findNpcById(bundle, id)?.npc.createInspectionSnapshot(getTimeOfDay()) ?? null,
        history: () => findNpcById(bundle, id)?.npc.history() ?? null,
        why: () => findNpcById(bundle, id)?.npc.why(getTimeOfDay()) ?? null,
        freeze: () => freezeNpc(bundle, id),
        unfreeze: () => unfreezeNpc(bundle, id),
        reevaluate: () => reevaluateNpc(bundle, id),
      }
    },
    npcs: (filter) => queryNpcs(bundle, getTimeOfDay(), filter),
    setFrenzyWolf: () => setFrenzyWolf(bundle),
    village: (id) => {
      const def = findVillageDef(bundle.settlementsManager, id)
      return def ? villageHandle(def) : null
    },
    villages: () => bundle.settlementsManager.getLoaded().map((s) =>
      villageHandle({ id: s.id, name: s.name, size: s.size, x: s.center.x, z: s.center.z })),
    locations,
    teleportTo,
    hiddenTreasure: {
      markers: () => {
        const markers = bundle.settlementsManager.home?.landmarks.hiddenTreasureMarkers
        return markers ? markers.map((m) => ({ x: m.x, z: m.z })) : null
      },
      found: () => worldFlags.hiddenTreasureFound,
      teleport: async (index = 0) => {
        const markers = bundle.settlementsManager.home?.landmarks.hiddenTreasureMarkers
        const target = markers?.[index]
        if (!target) return false
        await teleport(target.x, target.z)
        return true
      },
    },
    navigation: () => getNavigationStats(),
    help: () => HELP_TEXT,
  }
  window.seedvale = { ...window.seedvale, debug: api }
}

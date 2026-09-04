import type { NpcInspectionSnapshot, NpcWhy } from '../ai/NpcAgent'
import type { WorldBundle } from '../app/worldBundle'
import type { WorldConfig } from '../config/worldConfig'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { VillageSize } from '../settlement/families'
import type { HouseholdId } from '../settlement/household'
import type { LocationKnowledge } from '../world/locations/locationKnowledge'
import type { WorldLocationCatalog } from '../world/locations/worldLocationCatalog'
import type { WorldLocation } from '../world/locations/worldLocationTypes'
import type { WorldContext } from '../world/worldContext'
import type { HouseholdHistoryEvent } from './householdHistory'
import type { WorldPoint } from './locationSearch'
import type { NpcTraceEvent } from './npcTrace'
import { getNavigationStats, type NavigationStats } from '../navigation/navigationStats'
import { awardSkillXp, type PlayerSkills, setSkillValueForDebug, type SkillId } from '../player/PlayerSkills'
import { FAR_RANGE_KM } from '../world/locations/locationConfig'
import { isAdminMode, isDebugMode } from './debugMode'
import { type HistoryFilter } from './domainHistory'
import { getCurrentFrenzyWolf, getFrenzyWolves, getNextFrenzyWolf } from './faunaInspector'
import {
  deepForestNearest,
  type LocationResult,
  mountainNearest,
  oceanNearest,
  riverNearest,
  riversNearby,
  villageNearest,
} from './locationQueries'
import {
  type DomainHistoryEnvelope,
  findNpcById,
  freezeNpc,
  type FrenzyWolfDebugResult,
  householdHistory,
  npcHistory,
  type NpcQueryFilter,
  type NpcQueryResult,
  queryNpcs,
  reevaluateNpc,
  setFrenzyWolf,
  settlementHistory,
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
  history: (filter?: HistoryFilter) => readonly NpcTraceEvent[] | null
  why: () => NpcWhy | null
  freeze: () => boolean
  unfreeze: () => boolean
  reevaluate: () => boolean
}

/** `debug.household(id).history()` (plan settlements-npcs-013) — the
 *  household's own bounded mutation history; see `npcInspector.ts`'s
 *  `householdHistory` doc for why this stays separate from member NPCs'
 *  traces. Fresh-resolving: works whether or not the owning settlement is
 *  currently loaded, since `Household` is registry-owned (survives
 *  streaming) — only `null` when this household id has never been built. */
export type HouseholdDebugHandle = {
  history: (filter?: HistoryFilter) => readonly HouseholdHistoryEvent[] | null
}

/** `debug.settlement(id).history()` — the merged NPC/household/economy
 *  timeline; see `npcInspector.ts`'s `settlementHistory` doc for ordering
 *  and the "currently-loaded NPCs only" caveat. `null` only for an
 *  unrecognized settlement id, not merely an unbuilt one (`[]` then). */
export type SettlementHistoryDebugHandle = {
  history: (filter?: HistoryFilter) => readonly DomainHistoryEnvelope[] | null
}

export type { AnimalAgentDebugInfo } from '../fauna/AnimalAgent'
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
  /** Plan `ui-input-008` — several *different* qualifying rivers near the
   *  player, bounded and deduplicated; see `locationQueries.ts`'s
   *  `riversNearby` doc. */
  riversNearby: () => LocationResult[]
  villageNearest: () => LocationResult | null
  oceanNearest: () => LocationResult | null
}

export type TeleportToDebugApi = {
  (location: LocationResult): Promise<boolean>
  mountainNearest: () => Promise<boolean>
  deepForestNearest: () => Promise<boolean>
  riverNearest: () => Promise<boolean>
  /** Plan `ui-input-008` — cycles to the next *different* qualifying river
   *  (`locations.riversNearby()`) on each call, wrapping back to the first
   *  past the end. The cursor lives only in this debug closure — it never
   *  touches world/simulation state — and resets whenever `config.seed`
   *  changes (world rebuild / new seed), re-binding to a fresh list from the
   *  player's current position. */
  nextRiver: () => Promise<boolean>
  villageNearest: () => Promise<boolean>
  oceanNearest: () => Promise<boolean>
}

/** `debug.worldLocations` (plan world-012 §19) — inspects/mutates
 *  `LocationKnowledge` directly, never `MapDiscovery`'s cell Fog of War
 *  (notes §19: "Reveal" powinno mutować wyłącznie location knowledge). All
 *  queries are bounded to `FAR_RANGE_KM` around the player — there is no
 *  bounded "every location in an infinite world" query. */
export type WorldLocationDebugEntry = WorldLocation & { discovered: boolean }
export type WorldLocationsDebugApi = {
  /** Every cave/cemetery/lake/mountainPeak/settlement within `FAR_RANGE_KM`
   *  of the player, each flagged with whether it's currently known. */
  list: () => WorldLocationDebugEntry[]
  listUndiscovered: () => WorldLocationDebugEntry[]
  /** Marks one location `confirmed`/`exploration` — a no-op (returns
   *  `false`) if `id` doesn't resolve to a real location. */
  reveal: (id: string) => boolean
  /** Reveals everything `list()` currently returns; returns how many were
   *  newly revealed. */
  revealAll: () => number
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

/** Plan items-player-016 — dev-console access to `PlayerSkills`, needed to
 *  set up test states like "riding = 0.39" (just below a book's 40%
 *  requirement) without hours of real play. Every mutation goes through a
 *  public `PlayerSkills` operation (`awardSkillXp`/`setSkillValueForDebug`),
 *  never a direct `xp`/`value` write. */
export type SkillsDebugApi = {
  /** Read-only snapshot of every skill's current value/xp. */
  getSkills: () => Record<SkillId, { value: number, xp: number }>
  /** Dev-only direct set via `setSkillValueForDebug` — unlike real gameplay,
   *  this can also *lower* a skill. Clamped to `[SKILL_MIN_VALUE, 1]`. */
  setSkillValue: (id: SkillId, value: number) => void
  /** Awards raw XP through the same public `awardSkillXp` real actions use. */
  addSkillXp: (id: SkillId, xp: number) => void
}

export type SeedvaleDebugApi = {
  npc: (id: string) => NpcDebugHandle | null
  npcs: (filter?: NpcQueryFilter) => NpcQueryResult[]
  /** Household-level mutation history (plan settlements-npcs-013) —
   *  fresh-resolving by id, works whether or not the owning settlement is
   *  currently loaded. `null` for a household id never created. */
  household: (id: HouseholdId) => HouseholdDebugHandle | null
  /** Merged NPC/household/economy timeline for a settlement (plan
   *  settlements-npcs-013) — resolves by id whether or not the settlement is
   *  currently loaded (NPC-scope entries are then just absent, same as
   *  `village(id).npcs()`). `null` only for an unrecognized settlement id. */
  settlement: (id: string) => SettlementHistoryDebugHandle | null
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
  /** World Locations discovery (plan world-012) — bounded to `FAR_RANGE_KM`
   *  of the player, see `WorldLocationsDebugApi`'s doc. */
  worldLocations: WorldLocationsDebugApi
  /** Lightweight `navigation/navigationStats.ts` counters (plan npc-006) —
   *  path requests/successes/failures, search time, visited nodes,
   *  waypoints, repaths and currently-active routes, session-wide across
   *  every `NpcAgent`/`AnimalAgent`. */
  navigation: () => Readonly<NavigationStats>
  /** Live, frenzied, non-dead wolves (fauna debug tooling —
   *  `debug/faunaInspector.ts`) — `Fauna`'s own stable order, never a world
   *  scan. Each returned `AnimalAgent` carries its own
   *  `showDebug()`/`hideDebug()`/`toggleDebug()`/`getDebugInfo()`. */
  getFrenzyWolves: () => AnimalAgent[]
  /** Currently DevTools-selected frenzied wolf, or `null` if nothing is
   *  selected or the selection is no longer live/frenzied. */
  getCurrentFrenzyWolf: () => AnimalAgent | null
  /** Cycles the DevTools selection to the next live frenzied wolf, clearing
   *  the previous selection's highlight and setting the new one's — wraps
   *  back to the first past the end, `null` when none is loaded. */
  getNextFrenzyWolf: () => AnimalAgent | null
  /** Plan items-player-016 — see `SkillsDebugApi`'s doc. */
  skills: SkillsDebugApi
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
  'npc(id).history(filter?) — NPC decision/action trace (plan 170); household(id).history(filter?) — household resource mutations; settlement(id).history(filter?) — merged NPC+household+economy timeline (plan settlements-npcs-013); filter: {since?, limit?, types?}',
  'village(id) — resolves by id even if the village is currently unloaded (npcs() is [] then)',
  'villages() — lists currently loaded villages only',
  'village(id).houses() / villages()[i].houses() — per-house definitionId + hasBed; null while unloaded',
  'locations.{mountainNearest,deepForestNearest,riverNearest,villageNearest,oceanNearest}() — bounded deterministic nearest-feature search from the player; null if none found within budget',
  'locations.riversNearby() — several different qualifying rivers near the player, bounded and deduplicated (never multiple fragments of the same river)',
  'teleportTo(locationResult) / teleportTo.{mountainNearest,deepForestNearest,riverNearest,villageNearest,oceanNearest}() — teleport to a location query result; awaits terrain load first, resolves false if no such location exists',
  'teleportTo.nextRiver() — cycles to the next different qualifying river on each call, wrapping at the end; cursor is debug-only and resets on world rebuild/reseed',
  'setFrenzyWolf() — debug combat trigger',
  'hiddenTreasure.markers() / .found() / .teleport(index?) — hidden-treasure flower/dig-marker positions, one-shot found flag, teleport to marker index (default 0)',
  'worldLocations.list() / .listUndiscovered() — cave/cemetery/lake/mountainPeak/settlement locations within 200km of the player, each flagged {discovered}; worldLocations.reveal(id) / .revealAll() — mark as confirmed/exploration (mutates location knowledge only, never map Fog of War)',
  'navigation() — pathfinding counters (requests/successes/failures, search time, visited nodes, waypoints, repaths, active routes)',
  'getFrenzyWolves() / getCurrentFrenzyWolf() / getNextFrenzyWolf() — frenzied-wolf DevTools selection; each returned wolf has showDebug()/hideDebug()/toggleDebug()/getDebugInfo()',
  'skills.getSkills() — every skill\'s current {value, xp}; skills.setSkillValue(id, value) — dev-only direct set (can lower, unlike real gameplay); skills.addSkillXp(id, xp) — award raw XP through the normal path',
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
  worldLocations: { catalog: WorldLocationCatalog, knowledge: LocationKnowledge },
  /** Live accessor, same convention as `getPlayerPosition` — reflects the
   *  current player without re-installing after a rebuild (plan
   *  items-player-016). */
  getPlayerSkills: () => PlayerSkills,
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
    riversNearby: () => riversNearby(getPlayerPosition(), config),
    villageNearest: () => villageNearest(getPlayerPosition(), bundle.settlementsManager),
    oceanNearest: () => oceanNearest(getPlayerPosition(), worldContext),
  }

  /** `teleportTo.nextRiver()` cursor (plan `ui-input-008`) — debug-layer-only
   *  state, never read by the simulation. Recomputed from the player's
   *  current position the first time it's needed and whenever `config.seed`
   *  changes (the live signal `rebuildWorld()` already updates in place —
   *  see `gameLoop.ts`'s `getSeed` doc for the same convention), so a world
   *  rebuild/reseed can't leave the cursor pointing at a stale candidate
   *  list. */
  let riverCursor: { seed: number, candidates: LocationResult[], index: number } | null = null

  async function nextRiver(): Promise<boolean> {
    if (!riverCursor || riverCursor.seed !== config.seed) {
      riverCursor = { seed: config.seed, candidates: locations.riversNearby(), index: -1 }
    }
    if (riverCursor.candidates.length === 0) return false
    riverCursor.index = (riverCursor.index + 1) % riverCursor.candidates.length
    return teleportToLocation(riverCursor.candidates[riverCursor.index] ?? null)
  }

  const teleportTo = Object.assign(
    (location: LocationResult) => teleportToLocation(location),
    {
      mountainNearest: () => teleportToLocation(locations.mountainNearest()),
      deepForestNearest: () => teleportToLocation(locations.deepForestNearest()),
      riverNearest: () => teleportToLocation(locations.riverNearest()),
      nextRiver,
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

  const worldLocationsDebug: WorldLocationsDebugApi = {
    list: () => {
      const { x, z } = getPlayerPosition()
      const all = [
        ...worldLocations.catalog.landmarksWithin(x, z, FAR_RANGE_KM),
        ...worldLocations.catalog.nearestSettlements(x, z, FAR_RANGE_KM),
      ]
      return all.map((location) => ({ ...location, discovered: worldLocations.knowledge.has(location.id) }))
    },
    listUndiscovered: () => worldLocationsDebug.list().filter((location) => !location.discovered),
    reveal: (id) => {
      const location = worldLocations.catalog.getById(id)
      if (!location) return false
      return worldLocations.knowledge.reveal(id, 'confirmed', 'exploration')
    },
    revealAll: () => worldLocationsDebug.list().filter((location) => worldLocations.knowledge.reveal(location.id, 'confirmed', 'exploration')).length,
  }

  const skillsDebug: SkillsDebugApi = {
    getSkills: () => {
      const skills = getPlayerSkills()
      const out = {} as Record<SkillId, { value: number, xp: number }>
      for (const id of Object.keys(skills) as SkillId[]) out[id] = { value: skills[id].value, xp: skills[id].xp }
      return out
    },
    setSkillValue: (id, value) => setSkillValueForDebug(getPlayerSkills(), id, value),
    addSkillXp: (id, xp) => awardSkillXp(getPlayerSkills(), id, xp),
  }

  const api: SeedvaleDebugApi = {
    npc: (id) => {
      if (!findNpcById(bundle, id)) return null
      return {
        state: () => findNpcById(bundle, id)?.npc.createInspectionSnapshot(getTimeOfDay()) ?? null,
        history: (filter) => npcHistory(bundle, id, filter),
        why: () => findNpcById(bundle, id)?.npc.why(getTimeOfDay()) ?? null,
        freeze: () => freezeNpc(bundle, id),
        unfreeze: () => unfreezeNpc(bundle, id),
        reevaluate: () => reevaluateNpc(bundle, id),
      }
    },
    npcs: (filter) => queryNpcs(bundle, getTimeOfDay(), filter),
    household: (id) => (bundle.settlementsManager.getHousehold(id) ? { history: (filter) => householdHistory(bundle, id, filter) } : null),
    settlement: (id) => (findVillageDef(bundle.settlementsManager, id) ? { history: (filter) => settlementHistory(bundle, id, filter) } : null),
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
    worldLocations: worldLocationsDebug,
    navigation: () => getNavigationStats(),
    getFrenzyWolves: () => getFrenzyWolves(bundle),
    getCurrentFrenzyWolf: () => getCurrentFrenzyWolf(bundle),
    getNextFrenzyWolf: () => getNextFrenzyWolf(bundle),
    skills: skillsDebug,
    help: () => HELP_TEXT,
  }
  window.seedvale = { ...window.seedvale, debug: api }
}

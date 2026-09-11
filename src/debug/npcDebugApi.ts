import type { NpcInspectionSnapshot, NpcWhy } from '../ai/NpcAgent'
import type { WorldBundle } from '../app/worldBundle'
import type { WorldConfig } from '../config/worldConfig'
import type { AnimalAgent, AnimalKind } from '../fauna/AnimalAgent'
import type { PreySpawner } from '../fauna/AnimalSpawner'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerNeeds } from '../player/PlayerNeeds'
import type { QuestListEntry, QuestManager } from '../quests/QuestManager'
import type { VillageSize } from '../settlement/families'
import type { HouseholdId } from '../settlement/household'
import type { HealthState } from '../shared/HealthState'
import type { TreatableInjurySeverity } from '../shared/injurySeverity'
import type { PhysicalAttributes } from '../shared/PhysicalAttributes'
import type { LocationKnowledge } from '../world/locations/locationKnowledge'
import type { WorldLocationCatalog } from '../world/locations/worldLocationCatalog'
import type { WorldLocation } from '../world/locations/worldLocationTypes'
import type { TransportOrder } from '../world/transportOrder'
import type { WorldContext } from '../world/worldContext'
import type { HouseholdHistoryEvent } from './householdHistory'
import type { WorldPoint } from './locationSearch'
import type { NpcTraceEvent } from './npcTrace'
import { matchesQuestSpawnPointId } from '../fauna/wolfDenScenario'
import { getNavigationStats, type NavigationStats } from '../navigation/navigationStats'
import { awardSkillXp, type PlayerSkills, setSkillValueForDebug, type SkillId } from '../player/PlayerSkills'
import {
  applyPoisoningExposure,
  clearCondition,
  getResolvedPoisoningSeverity,
  POISONING_INITIAL_EXPOSURE_SEVERITY,
  type TemporaryConditionsState,
} from '../shared/temporaryConditions'
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
import { emptyPlayerGroundTrace, type PlayerGroundTraceBuffer, type PlayerGroundTraceSnapshot } from './playerGroundTrace'
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
  list: (rangeKm?: number) => WorldLocationDebugEntry[]
  listUndiscovered: () => WorldLocationDebugEntry[]
  /** Marks one location `confirmed`/`exploration` — a no-op (returns
   *  `false`) if `id` doesn't resolve to a real location. */
  reveal: (id: string) => boolean
  /** Reveals everything `list()` currently returns; returns how many were
   *  newly revealed. */
  revealAll: (rangeKm?: number) => number
  listCaves: (rangeKm?: number) => WorldLocationDebugEntry[]
  teleportToFirstCave: () => Promise<boolean>
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

export type ConditionsDebugApi = {
  player: () => { poisoning: number }
  applyPlayerPoisoning: (severity?: number) => void
  clearPlayerPoisoning: () => void
  applyNpcPoisoning: (npcId: string, severity?: number) => void
  clearNpcPoisoning: (npcId: string) => void
}

export type InjuryDebugApi = {
  npc: (npcId: string) => ReturnType<import('../ai/NpcAgent').NpcAgent['debugInjuryState']> | null
  applyNpcInjury: (npcId: string, severity: TreatableInjurySeverity) => void
  clearNpcInjury: (npcId: string) => void
  giveNpcBandage: (npcId: string) => boolean
}

/** Plain snapshot of a spawn-point quest target (`PreySpawner`) — never the
 *  live object, so DevTools / automation can JSON-serialize the result. */
export type QuestSpawnPointDebugSnapshot = {
  id: string
  type: PreySpawner['type']
  animalKind: AnimalKind
  position: { x: number, z: number }
  state: PreySpawner['state']
  deathsThisCycle: number
  maxPreyCount: number
  pressure: number
  humanTaste: boolean
  canRecover: boolean
}

/** Resolved quest world target. Unresolvable ids return `null` rather than a
 *  `{ resolved: false }` payload, matching the rest of this debug API. */
export type QuestTargetDebugSnapshot = {
  targetId: string
  resolved: true
  kind: 'spawnPoint'
  spawner: QuestSpawnPointDebugSnapshot
  /** Present for `wolfDen` only. `packCleared` is `Fauna.isWolfDenCleared()`
   *  (initial pack dead — `clear_wolf_den`). `permanentlyDestroyed` is
   *  `Fauna.isQuestSpawnPointPermanentlyDestroyed()` (`destroy_spawn_point`).
   *  These are two different world facts; neither is derived from the other. */
  questState?: { packCleared: boolean, permanentlyDestroyed: boolean }
}

export type QuestsDebugApi = {
  /** Current quest log via `QuestManager.list()` — no parallel snapshot. */
  list: () => QuestListEntry[]
  /** Resolve a quest world target id (stable aliases such as `wolf-den`
   *  included) to a spawn-point snapshot. `null` if nothing matches. */
  target: (targetId: string) => QuestTargetDebugSnapshot | null
  /** Teleport to the resolved spawn-point `x/z`. `false` if unresolved. */
  teleportToTarget: (targetId: string) => Promise<boolean>
}

export type PlayerDebugApi = {
  position: () => { x: number, y: number, z: number }
  health: () => HealthState
  attributes: () => PhysicalAttributes
  needs: () => PlayerNeeds
  skills: () => PlayerSkills
  temporaryConditions: () => TemporaryConditionsState
  /** Last ~120 player ground-resolution ticks; latches on a cave surface snap. */
  groundTrace: () => PlayerGroundTraceSnapshot
  clearGroundTrace: () => void
}

export type TransportOrderDebugSnapshot = {
  id: string
  state: string
  source: TransportOrder['source']
  destination: TransportOrder['destination']
  item: TransportOrder['itemKind']
  requested: number
  claimed: number
  delivered: number
  carrier: string | null
}

function transportOrderSnapshot(order: TransportOrder): TransportOrderDebugSnapshot {
  return {
    id: order.id,
    state: order.state,
    source: order.source,
    destination: order.destination,
    item: order.itemKind,
    requested: order.requestedQuantity,
    claimed: order.claimedQuantity,
    delivered: order.deliveredQuantity,
    carrier: order.carrierNpcId,
  }
}

/** Fresh-resolves a quest target id against the current `WorldBundle`
 *  spawners. Reads `bundle.fauna` on every call so a rebuild/reseed cannot
 *  leave a stale `PreySpawner` in the debug layer. */
function resolveQuestSpawnPoint(bundle: WorldBundle, targetId: string): PreySpawner | undefined {
  return bundle.fauna.getSpawners().find((spawner) => matchesQuestSpawnPointId(spawner, targetId))
}

function questTargetSnapshot(bundle: WorldBundle, targetId: string): QuestTargetDebugSnapshot | null {
  const spawner = resolveQuestSpawnPoint(bundle, targetId)
  if (!spawner) return null
  const snapshot: QuestTargetDebugSnapshot = {
    targetId,
    resolved: true,
    kind: 'spawnPoint',
    spawner: {
      id: spawner.id,
      type: spawner.type,
      animalKind: spawner.kind,
      position: { x: spawner.x, z: spawner.z },
      state: spawner.state,
      deathsThisCycle: spawner.deathsThisCycle,
      maxPreyCount: spawner.maxPreyCount,
      pressure: spawner.pressure,
      humanTaste: spawner.humanTaste,
      canRecover: spawner.canRecover,
    },
  }
  if (spawner.type === 'wolfDen') {
    snapshot.questState = {
      packCleared: bundle.fauna.isWolfDenCleared(),
      permanentlyDestroyed: bundle.fauna.isQuestSpawnPointPermanentlyDestroyed(targetId),
    }
  }
  return snapshot
}

export type SeedvaleDebugApi = {
  player: PlayerDebugApi
  npc: (id: string) => NpcDebugHandle | null
  npcs: (filter?: NpcQueryFilter) => NpcQueryResult[]
  /** Authoritative NPC state including post-death/corpse (plan npc-010) —
   *  reads `NpcStateRegistry`, so it works for terminal/unloaded NPCs that
   *  have no live `NpcAgent`. */
  npcState: (id: string) => import('../settlement/npcState').NpcStateSnapshot | null
  /** Household-level mutation history (plan settlements-npcs-013) —
   *  fresh-resolving by id, works whether or not the owning settlement is
   *  currently loaded. `null` for a household id never created. */
  household: (id: HouseholdId) => HouseholdDebugHandle | null
  /** Merged NPC/household/economy timeline for a settlement (plan
   *  settlements-npcs-013) — resolves by id whether or not the settlement is
   *  currently loaded (NPC-scope entries are then just absent, same as
   *  `village(id).npcs()`). `null` only for an unrecognized settlement id. */
  settlement: (id: string) => SettlementHistoryDebugHandle | null
  /** Physical transport commitments (plan settlements-npcs-018) — runtime-only. */
  transport: (id: string) => TransportOrderDebugSnapshot | null
  transports: () => TransportOrderDebugSnapshot[]
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
  /** Temporary physical conditions (plan npc-024) — deterministic shared API. */
  conditions: ConditionsDebugApi
  /** Physical injury severity / treatment (plan npc-025). */
  injury: InjuryDebugApi
  /** Quest log + spawn-point world-target lookup/teleport. Resolves stable
   *  aliases such as `wolf-den` through `matchesQuestSpawnPointId`. */
  quests: QuestsDebugApi
  spotAnimal: (kind: AnimalKind) => void
  help: () => string
  /** Alias of `player.groundTrace()` — rolling ticks, latched after a snap. */
  getPlayerGroundTrace: () => PlayerGroundTraceSnapshot
  /** Alias of `player.clearGroundTrace()`. */
  clearPlayerGroundTrace: () => void
}

declare global {
  interface Window {
    seedvale?: { debug: SeedvaleDebugApi }
  }
}

type VillageIdentityLike = { id: string, name: string, size: VillageSize, x: number, z: number }

const HELP_TEXT = [
  'window.seedvale.debug — developer console API (?debug=1 only)',
  'player.position() — current player world position {x, y, z}',
  'player.groundTrace() / getPlayerGroundTrace() — last ~120 player ground-resolution ticks; auto-freezes on a >2m upward Y snap or cave→surface takeover. copy(JSON.stringify(seedvale.debug.getPlayerGroundTrace(), null, 2))',
  'player.clearGroundTrace() / clearPlayerGroundTrace() — empty the ring and reset the snap latch before a repro',
  'player.health() — current player health {hp, maxHp, status}',
  'player.attributes() — current player attributes {strength, agility, endurance, intelligence, wisdom, charisma}',
  'player.needs() — current player needs {hunger, thirst, sleep, rest}',
  'player.skills() — current player skills {sneak, stealth, sneakUse, sneakUseDistance, sneakUseDuration, sneakUseRange, sneakUseSpeed, sneakUseAccuracy, sneakUseCriticalChance, sneakUseCriticalDamage, sneakUseCriticalMultiplier, sneakUseCriticalChance, sneakUseCriticalDamage, sneakUseCriticalMultiplier}',
  'player.temporaryConditions() — current player temporary conditions {poisoning, bleeding, infection,饥饿, 口渴, 疲劳, 寒冷, 炎热, 中毒, 出血, 感染, 饥饿, 口渴, 疲劳, 寒冷, 炎热, 中毒, 出血, 感染, 饥饿, 口渴, 疲劳, 寒冷, 炎热, 中毒, 出血, 感染}',
  'npc(id) / npcs(filter?) — inspect a live NPC by id / query all loaded NPCs',
  'npcState(id) — authoritative NPC snapshot including post-death/corpse (works without a live agent)',
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
  'conditions.player() — current player poisoning severity; conditions.applyPlayerPoisoning(severity?) / clearPlayerPoisoning() — test hooks',
  'conditions.applyNpcPoisoning(npcId, severity?) / clearNpcPoisoning(npcId) — authoritative NPC condition state',
  'injury.npc(id) — physicalInjury, derived severity, SPEA modifiers, treatment eligibility',
  'injury.applyNpcInjury(id, "minor"|"serious"|"critical") / clearNpcInjury(id) — real damage/heal accounting',
  'injury.giveNpcBandage(id) — add a bandage so self-treatment is feasible',
  'transport(id) / transports() — physical goods TransportOrder snapshot {id,state,source,destination,item,requested,claimed,delivered,carrier}',
  'spotAnimal(kind) — simulate spotting an animal for quest progression',
  'quests.list() — quest log/debug snapshot',
  'quests.target(id) — resolve quest world target; e.g. quests.target(\'wolf-den\')',
  'quests.teleportToTarget(id) — teleport to resolved quest target; e.g. quests.teleportToTarget(\'wolf-den\')',
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
  getPlayer: () => PlayerController,
  getElapsedDays: () => number,
  questManager: QuestManager,
  groundTrace?: PlayerGroundTraceBuffer | null,
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
    list: (rangeKm?: number) => {
      const { x, z } = getPlayerPosition()
      const all = [
        ...worldLocations.catalog.landmarksWithin(x, z, rangeKm ?? FAR_RANGE_KM),
        ...worldLocations.catalog.nearestSettlements(x, z, rangeKm ?? FAR_RANGE_KM),
      ]
      return all.map((location) => ({ ...location, discovered: worldLocations.knowledge.has(location.id) }))
    },
    listUndiscovered: () => worldLocationsDebug.list().filter((location) => !location.discovered),
    reveal: (id) => {
      const location = worldLocations.catalog.getById(id)
      if (!location) return false
      return worldLocations.knowledge.reveal(id, 'confirmed', 'exploration')
    },
    revealAll: (rangeKm?: number) => worldLocationsDebug.list(rangeKm).filter((location) => worldLocations.knowledge.reveal(location.id, 'confirmed', 'exploration')).length,
    listCaves: (rangeKm?: number) => worldLocationsDebug.list(rangeKm).filter(l => l.kind === 'cave'),
    teleportToFirstCave: async () => {
      // Cave definitions are already resolved by `createCaves()` — no need
      // for the 200 km location-catalog scan `listCaves()` does. Nearest
      // entrance to the player wins.
      const { x: px, z: pz } = getPlayerPosition()
      const cave = bundle.caves.definitions()
        .map((def) => ({ def, distance: Math.hypot(def.entrance.x - px, def.entrance.z - pz) }))
        .sort((a, b) => a.distance - b.distance)
        .at(0)
      if (!cave) {
        console.log('No caves found')
        return false
      }
      console.log(`Teleporting to cave ${cave.def.caveId} (${cave.distance.toFixed(0)} m)`, cave.def.entrance)
      return teleportToLocation({
        kind: 'village',
        position: { x: cave.def.entrance.x, z: cave.def.entrance.z },
        distance: 0,
      })
    },
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

  const conditionsDebug: ConditionsDebugApi = {
    player: () => ({
      poisoning: getResolvedPoisoningSeverity(getPlayer().temporaryConditions, getElapsedDays()),
    }),
    applyPlayerPoisoning: (severity = POISONING_INITIAL_EXPOSURE_SEVERITY) => {
      applyPoisoningExposure(getPlayer().temporaryConditions, getElapsedDays(), severity)
      getPlayer().syncDerivedPhysicalCapabilities(getElapsedDays())
    },
    clearPlayerPoisoning: () => {
      clearCondition(getPlayer().temporaryConditions, 'poisoning', getElapsedDays())
      getPlayer().syncDerivedPhysicalCapabilities(getElapsedDays())
    },
    applyNpcPoisoning: (npcId, severity = POISONING_INITIAL_EXPOSURE_SEVERITY) => {
      findNpcById(bundle, npcId)?.npc.applyPoisoningForDebug(getElapsedDays(), severity)
    },
    clearNpcPoisoning: (npcId) => {
      findNpcById(bundle, npcId)?.npc.clearPoisoningForDebug(getElapsedDays())
    },
  }

  const injuryDebug: InjuryDebugApi = {
    npc: (npcId) => findNpcById(bundle, npcId)?.npc.debugInjuryState(getElapsedDays()) ?? null,
    applyNpcInjury: (npcId, severity) => {
      findNpcById(bundle, npcId)?.npc.applyInjuryForDebug(severity, getElapsedDays())
    },
    clearNpcInjury: (npcId) => {
      findNpcById(bundle, npcId)?.npc.clearInjuryForDebug(getElapsedDays())
    },
    giveNpcBandage: (npcId) => findNpcById(bundle, npcId)?.npc.giveBandageForDebug() ?? false,
  }

  const api: SeedvaleDebugApi = {
    player: {
      position: () => {
        const { x, y, z } = getPlayer().mesh.position
        return { x, y, z }
      },
      health: () => getPlayer().health,
      attributes: () => getPlayer().attributes,
      needs: () => getPlayer().needs,
      skills: () => getPlayer().skills,
      temporaryConditions: () => getPlayer().temporaryConditions,
      groundTrace: () => groundTrace?.snapshot() ?? emptyPlayerGroundTrace(),
      clearGroundTrace: () => { groundTrace?.clear() },
    },
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
    npcState: (id) => bundle.settlementsManager.snapshotNpcStates()[id] ?? null,
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
    conditions: conditionsDebug,
    injury: injuryDebug,
    quests: {
      list: () => questManager.list(),
      target: (targetId) => questTargetSnapshot(bundle, targetId),
      teleportToTarget: async (targetId) => {
        const spawner = resolveQuestSpawnPoint(bundle, targetId)
        if (!spawner) return false
        await teleport(spawner.x, spawner.z)
        return true
      },
    },
    transport: (id) => {
      const order = bundle.transportOrders.find(id)
      return order ? transportOrderSnapshot(order) : null
    },
    transports: () => bundle.transportOrders.list().map(transportOrderSnapshot),
    spotAnimal: (kind) => {
      questManager.onInteractObjective({
        type: 'spot_animal',
        kind,
      })
    },
    help: () => HELP_TEXT,
    getPlayerGroundTrace: () => groundTrace?.snapshot() ?? emptyPlayerGroundTrace(),
    clearPlayerGroundTrace: () => { groundTrace?.clear() },
  }
  window.seedvale = { ...window.seedvale, debug: api }
}

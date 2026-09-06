# State Documentation Audit — Persistence / Authoritative Runtime State

**Date:** 2026-09-06
**Baseline:** `6d5ae470d8452ce80f5c550aff3af7b659a74faf`
**Agent:** Claude Code — Sonnet 5
**Scope:** `src/persistence/*` (all 8 non-test files, full read: `db.ts`, `saveData.ts` — full 1601 lines, every validator/migration —, `saveDb.ts`, `saveSlots.ts`, `seedDb.ts`, `seedRecord.ts`, `worldgenCacheDb.ts`); `src/app/saveState.ts` (full, serialize side); targeted full read of `src/app/createApp.ts`'s `initialSave`-consuming call sites (restore side, boot path) and `src/app/worldBundle.ts`'s `createWorldBundle`/`rebuildWorldBundle` (in-session carry path); `docs/architecture/ARCHITECTURE.md`'s "Persistence"/"Save schema"/"Rebuild / lifetime invariants" sections; `docs/STATE.md`'s "Persistence" section; targeted reads of `src/player/PlayerController.ts` (health field), `src/settlement/household.ts`/`src/economy/settlementEconomy.ts` (snapshot type definitions), `src/world/map/mapConfig.ts`/`mapDiscovery.ts` (map-schema-version claim check); `docs/plans/persistence-00{1,2,3,4}-*.md` (status/title only, not full read). Read in full: `docs/reviews/2026-09-06-state-documentation-audit.md`, `docs/reviews/state-audit/01-inventory.md` through `07-combat.md` — this audit is a synthesis pass over their persistence-relevant findings plus direct `src/persistence/` recon, not a repeat of their domain recon. No subagents used; no repo-wide scan performed. No gameplay code, `docs/STATE.md`, `docs/state/*.md`, `docs/state/README.md`, or prior audit artifacts (`01`–`07`) were modified.

---

## 1. Confirmed current state

- **Persistence is not one module but a small, cleanly-separated family**, all physically under `src/persistence/` plus one app-layer assembly module:
  - `db.ts` — single shared IndexedDB database (`seedvale`, `DB_VERSION = 2`), three stores (`saves`, `seeds`, `worldgenCache`), one `onupgradeneeded`.
  - `saveData.ts` — the `SaveData` type, its full runtime structural validator (`isSaveData`), and the version-migration pipeline. The sole schema authority in the codebase.
  - `saveDb.ts` — IndexedDB CRUD over the `saves` store: named slots, active-slot id, legacy-row migration, and the write-time integrity guard.
  - `saveSlots.ts` — envelope/slot-status types and pure helpers (`inspectStoredSave`, name validation, recency sort) consumed by `saveDb.ts`.
  - `seedDb.ts`/`seedRecord.ts` — an **adjacent, non-`SaveData` catalog**: seed metadata (name/tags/description/last-used), keyed by `seed: number`. Explicitly never required to load a save.
  - `worldgenCacheDb.ts` — a **generic, disposable derived-data cache**, also not part of `SaveData`. Confirmed unchanged from `02-world-terrain-water.md`'s finding: `(seed, namespace, version, fingerprint) → payload`, one current namespace owner (`world/locations/locationsCoarseCache.ts`), every operation swallows its own errors and falls back to procedural generation.
  - `src/app/saveState.ts` — the **one and only** `SaveData` assembly point (`buildSaveData()`), plus autosave scheduling (`installAutoSave`) and write-serialization (`saveNow`'s `saveQueue` chaining).
- **`CURRENT_SAVE_VERSION = 6`** with a five-step migration pipeline (`SAVE_MIGRATIONS`, keyed by source version) and a typed pipeline result (`ok`/`invalid`/`migration-failed`/`unsupported-version`) — confirmed directly against `saveData.ts`, not taken on trust from `STATE.md`.
- **Restore has no separate hydration phase — it *is* construction.** `createApp(container, initialSave)` reads every one of `SaveData`'s ~40 fields exactly once, each at its own `initialSave?.<field> ?? <fresh-game-default>` call site, feeding straight into the constructor of that field's one owning runtime system. There is no "load `SaveData`, then walk it applying values onto already-built systems" pass anywhere in the codebase.
- **In-session `WorldBundle` rebuild (`rebuildWorldBundle`) reuses the exact same constructor parameters and the exact same snapshot methods `buildSaveData()` itself calls** — confirmed by direct inspection, not inferred. This is the concrete mechanism that closes the hazard shape the audit brief named (`SaveData → restore → runtime manager → later runtime mutation → next save`): the save path and the in-session-rebuild-carry path are the same code, gated only by a `resetCollectedItems` boolean, not two independent implementations that could drift apart.
- **Two concrete, previously-unflagged gaps found by this audit** (not caught by any of `01`–`07`): the player's own `HealthState` is never persisted (always full HP on Continue/Load), and household/settlement-economy/placed-container food loses its per-batch freshness anchor across a save/load (only the player's own inventory calls `Inventory.foodBatchesToJSON()`). Both are detailed in §3/§5.

---

## 2. Persistence architecture

```text
                         ┌─────────────────────────────┐
                         │   src/app/saveState.ts       │
                         │   buildSaveData()             │  ← the ONLY SaveData constructor
                         │   saveNow() / installAutoSave │
                         └───────────────┬───────────────┘
                                         │ SaveData (schema-shaped object)
                                         ▼
                         ┌─────────────────────────────┐
                         │ src/persistence/saveData.ts   │  ← schema authority
                         │ SaveData type                 │
                         │ isSaveData() (runtime guard)   │
                         │ SAVE_MIGRATIONS / loadStoredSave│
                         └───────────────┬───────────────┘
                                         │ validated / migrated
                                         ▼
                         ┌─────────────────────────────┐
                         │ src/persistence/saveDb.ts      │  ← IndexedDB CRUD
                         │ writeSave() / readSave()       │
                         │ integrity guard (persistence-002)│
                         └───────────────┬───────────────┘
                                         │
                                         ▼
                              IndexedDB `seedvale` / `saves`
                                         │
                                         ▼ (Continue / Load Save)
                         ┌─────────────────────────────┐
                         │ src/app/createApp.ts           │
                         │ initialSave?.<field> ?? default│  ← restore IS construction
                         │ → owning system's constructor   │
                         └─────────────────────────────┘
```

Adjacent, deliberately outside this diagram: `seedDb.ts`/`seedRecord.ts` (seed catalog metadata, same physical database, no `SaveData` dependency either direction) and `worldgenCacheDb.ts` (disposable derived-data cache, same physical database, never a correctness dependency).

### Migration mechanism (current architecture, not changelog)

- `SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>>` — one entry per *source* version, each a pure `(data: unknown) => unknown` step.
- `migrateStoredSave(value, fromVersion, toVersion, migrations)` walks the chain one exact step at a time against a fresh `structuredClone` per step — deterministic, side-effect-free, fails closed on a missing or throwing step (returns `{ ok: false }` rather than skipping ahead).
- `loadStoredSave(value)` is the single pipeline entry point: detect stored `version` → reject if newer than `CURRENT_SAVE_VERSION` (`unsupported-version`) → migrate to current → validate against current schema (`isSaveData`) → `StoredSaveResult`. Only `status: 'ok'` ever reaches runtime.
- **Five migrations currently registered** (v1→v2 through v5→v6) — each defaults exactly one new field/collection to a value that reproduces the pre-migration behaviour (e.g. a pre-`completedWork` torch defaults to "already complete," never to unfinished). This audit does not re-narrate each migration's rationale (that's `STATE.md`'s job, already done accurately there — see §5) — the point for this document is the *mechanism*: one small pure step per version bump, chained, fails closed, never silently guesses.
- `isSaveData()` re-validates on **write**, not just read (`writeSave`/`createSave` refuse an outgoing snapshot that fails validation, persistence-004 §1) — a `SaveData`-typed value in TypeScript is not proof it satisfies the runtime contract.
- The write-time **integrity guard** (persistence-002) additionally refuses to overwrite an *existing* slot whose current stored record can't itself be read as `ok` — original bytes untouched, write reports `invalid-existing-slot`. A slot with no existing row is unaffected.
- **Save-slot management is a separate four-way status layer** (`saveSlots.ts`'s `InspectedSaveSlot`: `ok`/`invalid`/`migration-failed`/`unsupported-version`) sitting on top of the schema/migration layer — simple callers (`listSaves()`, `readSave()`) still collapse failures to `[]`/`null`; callers that must make a destructive/lifecycle decision (boot, the save-management screen) use the result-typed counterparts (`listSavesResult()`, `listSaveManagementEntries()`) instead, so "confirmed zero saves" and "a read failure" never collapse into the same signal for a caller that needs to tell them apart.
- **Worldgen-cache namespace/versioning** (plan world-015, `worldgenCacheDb.ts`) is a structurally separate versioning concept from `SaveData`'s: `(seed, namespace, version, fingerprint)` keys a disposable payload, a fingerprint mismatch is a cache miss (never migrated), and a namespace owner decides its own payload shape/fingerprint/version independently of `CURRENT_SAVE_VERSION`. The two mechanisms never interact and must not be conflated — `CLAUDE.md`'s Determinism-section convention ("bump that namespace's version/fingerprint") governs this cache, not `SaveData`'s migration pipeline.

---

## 3. State classification by domain

Per the brief's five categories. A domain with more than one layer is split across rows rather than forced into one category.

| Domain/state | Runtime owner | Persistence | Reconstruction | Classification |
|---|---|---|---|---|
| Terrain heightmap/biome/river/road geometry | `ChunkManager`/`terrain/*` (pure functions) | None — no terrain-grid field in `SaveData` | Full: pure function of `(seed, region params)` | **Deterministically reconstructed** |
| Season / weather / climate | `world/weather.ts` (pure) | `elapsedDays` only (needed by every lazy system, not weather-specific) | Full: `computeClimate(seed, elapsedDays)` | **Deterministically reconstructed** |
| Player terrain modifications (dig/scorch/prepare) | `ChunkManager`'s `TerrainModification[]` | `SaveData.terrainModifications`, `source: 'player'`-only (system-caused entries filtered out at save time) | Deterministic base + this delta reapplied | **Persisted delta/override** |
| Resource deposits (mining-hits-remaining) | `ResourceDepletionState` (`Map`) | `SaveData.resourceDeposits`, sparse `id → remaining` | Deterministic initial-from-richness for any absent id | **Persisted delta/override** |
| Persistent worldgen cache | `worldgenCacheDb.ts` | IndexedDB `worldgenCache` store, outside `SaveData` entirely | N/A — a miss just re-runs procedural generation | **Derived / cache** |
| Settlement generation (`VillagePlan`/`SettlementDef`) | `settlementGenerator.ts` (pure, memoized) | None | Full: pure function of `(seed, cell, terrain samplers)` | **Deterministically reconstructed** |
| Settlement economy | `SettlementEconomy` (`EconomyRegistry`) | `SaveData.settlementEconomies` (required field) | N/A — canonical | **Persisted authoritative** |
| Households | `Household` (`HouseholdRegistry`) | `SaveData.households` (optional, plan persistence-001; sparse) | Fresh deterministic household for any absent id | **Persisted authoritative** (sparse-optional, not a delta) |
| Land ownership | `LandOwnershipRegistry` | `SaveData.ownedLandPlots`, flat top-level array (different idiom from the other 4 settlement registries) | N/A | **Persisted authoritative** |
| NPC authoritative state (health/stamina/vigor/needs/physicalInjury/helperAssignment/activePlan) | `NpcAuthoritativeState` (`NpcStateRegistry`) | `SaveData.npcStates` (optional, plan persistence-001; all 7 fields validated) | Fresh deterministic state for any absent id | **Persisted authoritative** |
| NPC identity (name/role/personality/traits) | `families.ts`/`characters.ts` (pure) | None | Full: pure function of settlement seed | **Deterministically reconstructed** |
| NPC↔NPC relationships | `NpcRelationships` | `SaveData.npcRelationships` (optional, sparse — non-zero pairs only) | Absent pair ⇒ 0 | **Persisted authoritative** |
| NPC↔player relationships | `QuestManager.relations` | `SaveData.quests.relations` (required, keyed by NPC name) | N/A | **Persisted authoritative** |
| NPC phase/pending-action/pathfinding/watchdog/combatIntent/carried inventory | `NpcAgent` (own fields) | None — explicitly excluded by design | Reset fresh on every reconstruction (reload or in-session rebuild alike) | **Runtime authoritative** |
| NPC death/corpse | `NpcAgent` | None | No disposal path exists at all — not merely unpersisted, there is no well-defined runtime end-state to persist | **Runtime authoritative** (standing gap, not a persistence omission) |
| Livestock (owned animals + merchant horse) | `AnimalAgent` instances (`LivestockRegistry`) | `SaveData.livestock`/`removedLivestockIds` (optional, plan persistence-001) — full per-individual `AnimalSaveState` | Deterministic spawn for any id not in `removedLivestockIds`/`livestock` | **Persisted authoritative** |
| Wild fauna (individual position/health/hunger/rabies/frenzy) | `AnimalAgent` instances | None at all | Population re-spawns from the fixed `SPAWNS` table; **no specific individual's history survives** | **Runtime authoritative, no reconstruction guarantee** (deliberate — `AnimalSaveState`/`snapshot()`/`hydrate()` exist generically on the class but are policy-gated to livestock-only call sites) |
| Fauna spawn-point lifecycle | `PreySpawner` (`AnimalSpawner.ts`) | `SaveData.spawnPoints` (required) — state/deathsThisCycle/disabledAtDay only | Position/type/kind always deterministic; only the FSM+clock round-trips | **Persisted authoritative** (thin — excludes anything deterministic) |
| Grass forage patch depletion | `GrassForageService` | `SaveData.grassForagePatches` (optional, sparse) | Patch placement itself is deterministic and never persisted | **Persisted delta/override** |
| Rats (settlement pest population) | plain `AnimalAgent` instances, `rats.ts`'s reconciliation loop | **None** — no `SaveData.rats` field of any kind | Population is *not* deterministic from seed either — a live formula over current food/dog count, reconciled from zero every load | **Runtime authoritative, intentionally not persisted, not deterministically reconstructed** (a fourth, distinct shape — worse than "not persisted," since even the population count isn't reproducible from `(seed, elapsedDays)` alone) |
| Player inventory (counts/instances) | `Inventory` (player's own) | `SaveData.inventory`/`inventoryInstances` (required) | N/A | **Persisted authoritative** |
| Player food-batch freshness | `Inventory.foodBatches` (player's own) | `SaveData.foodBatches` (required) — **player only**, see §5 | N/A | **Persisted authoritative — asymmetric with household/settlement/container food** |
| Held tool slot | `HeldTool` | `SaveData.heldTool` (`ItemKind` only) | Concrete instance re-resolved from the (separately persisted) inventory | **Persisted authoritative, minimal** |
| Player survival pools (hunger/thirst/vigor + starvation/dehydration duration) | `PlayerNeeds` | `SaveData.playerNeeds` (required) | Stamina deliberately excluded — always full on load | **Persisted authoritative** (stamina layer is **Runtime authoritative**) |
| **Player HP (`HealthState`)** | `PlayerController.health` | **None** — no `SaveData` field, no write, no restore line | Always constructs fresh at `PLAYER_MAX_HP = 100` | **Runtime authoritative, unpersisted** — undocumented anywhere, inconsistent with NPC/livestock HP which do persist; see §5 |
| Player skills | `PlayerSkills` | `SaveData.skills` (required, `xp` only, all 6 incl. `riding`) | `value` always re-derived from `xp` | **Persisted authoritative, minimal** |
| Encumbrance | `playerEncumbrance.ts` (pure) | None | Full: recomputed every frame from already-persisted `Inventory`/container weight | **Derived / cache** |
| Player-built world objects (wells/torches/palisades/bedrolls/platforms/gardens/terrain-preparations) | Each object's own `world/*.ts` record + `WorldBundle` collection | One `SaveData.<x>` array each (required) | Visual mesh/collider is a rebuildable projection, never authoritative | **Persisted authoritative** |
| Placed containers (chests) + carried container | `PlacedContainerRecord`/`PlacedContainers` | `SaveData.placedContainers`/`carriedContainer` (required) — `counts`+`instances`, **no foodBatches equivalent** | N/A | **Persisted authoritative** (same freshness-loss asymmetry as household/settlement food) |
| Work contracts (commitment) | `WorkContractRecord` (`world/workContract.ts`) | `SaveData.workContracts` (required) | N/A | **Persisted authoritative** |
| Work contracts (target progress) | Each buildable's own record (well/torch/palisade/terrain-prep) | Already covered by that buildable's own `SaveData.<x>` entry, referenced by id, never duplicated onto the contract | N/A | **Persisted authoritative** (single source, by design — see §4 duplicated-state check) |
| Combat itself (in-flight `CombatIntent`/attack phase/projectile) | `combat/*` (stateless resolvers) + `NpcAgent`'s transient combat phase | **None** | N/A — only downstream consequences persist | **Runtime authoritative, no persistence at all** (deliberate — combat is a resolution pass, not a stored state) |
| Quests / progression | `QuestManager` | `SaveData.quests` (`progress`/`exp`/`relations`, required — base schema, predates persistence-001) | N/A | **Persisted authoritative** |
| Time / clock | `DayNightState` | `SaveData.timeOfDay`/`elapsedDays` (required) | N/A — this *is* the anchor everything else reconstructs from | **Persisted authoritative** |
| World locations / discovery (map) | `MapDiscovery`/`LocationKnowledge`/`NavigationTargets` | `SaveData.map.{discoveredCells,discoveredLocations,targets}` (required) — state/source/id only | Position/name/weight of a location always re-derived from `(world seed, location id)` | **Persisted authoritative (knowledge) + Deterministically reconstructed (geometry)** |
| Hidden Finds / Badges | `resolvedHiddenFindSpotIds` set, `BadgeManager` | `SaveData.resolvedHiddenFindSpotIds`/`badges` (required) | A spot's position/outcome always re-derives from `(landmark id, spot index)` | **Persisted authoritative (resolution/progress) + Deterministically reconstructed (position/outcome)** |

**Coverage check against the brief's domain list:** every named domain has persistence of some kind classified above, except two, both **confirmed deliberate by their own module doc comments, not silent gaps**: rats (genuinely and permanently unpersisted, not even deterministically reconstructed) and wild-fauna individual history (population is deterministic; no specific individual's runtime state survives). Both are called out explicitly rather than left implicit.

---

## 4. Save / restore runtime flow

**Boot with a save (Continue):**
```text
readSave() [saveDb.ts] → loadStoredSave() [saveData.ts: detect version →
  migrate chain → validate] → StoredSaveResult.ok → SaveData
→ createApp(container, initialSave: SaveData)
→ every field read exactly once, at its one call site, straight into the
  constructor of its owning runtime system
→ (no separate "apply" pass — construction IS restore)
```

**Save (manual, autosave, or transition):**
```text
saveNow(reason) → saveQueue chains behind any in-flight write
→ buildSaveData() [one read per live system; bundle.settlementsManager
  .snapshotLivestock() called first, since livestock has no live object
  surviving an unload]
→ writeSave(data) [isSaveData(data) outgoing guard → re-validate existing
  slot record (invalid-existing-slot guard) → storePut()]
```

**In-session `WorldBundle` rebuild (config change, not save/load):**
```text
rebuildWorldBundle(bundle, ..., resetCollectedItems)
→ for each of ~20 collections: carried = live snapshot (the SAME snapshot
  method buildSaveData() itself calls) [emptied only if resetCollectedItems
  — a genuinely new world]
→ dispose old collection
→ buildWorldSystems({ ...carried })  [same parameter shape createWorldBundle
  accepts from initialSave]
→ Object.assign(bundle, fresh)   [bundle keeps its object identity]
```

Flows 1 and 3 terminate at the **same constructor parameters on the same runtime managers**. A mutation made during play is always applied to the one live object graph those managers own; flow 2 always reads that same live graph fresh at save time. There is no cached/stale intermediate copy anywhere a save could read instead of the live value — verified by inspecting every `buildSaveData()` field for a capture that isn't a direct live-object read (the one exception, livestock's explicit pre-capture, is necessitated by livestock having no surviving live object across an *unload* specifically, and uses the identical snapshot method on both the save side and the rebuild side).

### Architectural questions — direct answers

1. **Is `SaveData` a central source of truth, or a serialization format for state owned by individual runtime systems?**
   The latter, unambiguously. `SaveData` has no behavior and is never mutated in place by gameplay code — `saveData.ts` only defines its shape/validation/migration. Every field's *actual* source of truth is the one runtime system that owns it (`Inventory`, `NpcStateRegistry`, `Household`, etc.); `buildSaveData()` reads those systems once per save, and restore constructs those same systems from the prior save's values. `SaveData` is a serialization contract, not a live authority.

2. **Where is the boundary between persisted authoritative state and deterministic reconstruction?**
   The boundary tracks a simple rule confirmed consistently across every domain in §3: **if a value is a pure function of `(seed, [elapsedDays/region params])`, it is never a `SaveData` field** (terrain, weather, settlement plans, NPC identity, location geometry). **If a value depends on player/NPC/world *history* that can't be re-derived from the seed alone, it is persisted** (health, needs, inventory, relationships, constructed objects, resolved knowledge). The few "sparse delta" fields (`terrainModifications`, `resourceDeposits`, `grassForagePatches`) sit exactly on this boundary by design: the base is deterministic, only the *deviation* from it persists.

3. **Do any systems have two competing sources of truth?**
   **None found.** This audit specifically checked for a value assembled from more than one live owner and found none — every `SaveData` field in `buildSaveData()` traces to exactly one runtime system. The one case that structurally invites this risk (work contracts) is explicitly designed to avoid it: the contract holds only its own commitment fields, the target holds its own progress, connected by id, never duplicated.

4. **Does `WorldBundle` rebuild correctly restore authoritative state?**
   Yes, by construction rather than by convention — see §4's flow diagrams. `rebuildWorldBundle` and `createWorldBundle` are proven (by direct code inspection, not inferred) to share the same constructor parameter names and the same snapshot methods `buildSaveData()` uses. There is no drift risk between "what survives a rebuild" and "what survives a save," because both are produced by the same functions.

5. **Can runtime caches be safely cleared and rebuilt?**
   Yes for every cache found in this and prior audits: `worldgenCacheDb.ts` (own doc comment: "runtime correctness must never depend on this succeeding"), `riverTileCache.ts`/`chunkMeshCache.ts` (per `02-world-terrain-water.md`, pure performance caches over deterministic functions), `settlementPlanCache.ts` (memoization over a pure function). None is a second source of truth; all are safe to evict.

6. **Are there runtime-only states whose lack of persistence looks intentional?**
   Yes, and this is the majority of the "Runtime authoritative" rows in §3: player stamina (own doc comment: "short-term, not worth persisting"), NPC phase/pathfinding/pending-action (explicitly excluded per `04-npc.md`), combat in-flight state (a resolution pass, not stored state, per `07-combat.md`), wild-fauna individual history (population-level determinism is the intentional substitute), rats (own doc comment states this is deliberate).

7. **Are there runtime-only states whose lack of persistence looks like a potential gap?**
   Two, both newly found by this audit and not previously flagged by `01`–`07`: **player HP** (never persisted, full heal on every Continue, inconsistent with NPC/livestock HP which do persist, no comment anywhere states this is intentional) and **household/settlement-economy/placed-container food freshness** (the player's own inventory persists per-batch `acquiredAtDays`; the structurally identical `Inventory` instances owned by `Household`/`SettlementEconomy`/`PlacedContainerEntry` do not). Neither is stated as a deliberate choice anywhere in code or docs — see §5, Documentation discrepancies #5/#6.

8. **Does persistence across domains use a consistent ownership model?**
   Mostly yes, with one confirmed exception. The dominant pattern — confirmed identical across `EconomyRegistry`/`HouseholdRegistry`/`NpcStateRegistry`/`NpcRelationships`/`LivestockRegistry` and, per this audit's own check of `worldBundle.ts`, every other `WorldBundle`-owned collection (wells/torches/palisades/etc.) — is the `initial*`(constructor-param)/`snapshot*`(serialize) idiom: a collection accepts its restored/carried state as a constructor argument and exposes a matching snapshot method `buildSaveData()`/`rebuildWorldBundle()` both call. **Land ownership (`ownedLandPlots`) is the one confirmed exception**: a flat top-level `SaveData` field written directly from `LandOwnershipRegistry.toJSON()`, not routed through the same idiom. This is a **format** inconsistency, not a correctness problem (confirmed no duplication or drift risk) — see §9.

9. **Is the worldgen cache correctly separated from gameplay persistence?**
   Yes. `worldgenCacheDb.ts` lives in the same physical directory and shares the same IndexedDB database as `saveDb.ts`, but is a structurally distinct store (`worldgenCache`, keyed by `(seed, namespace, version, fingerprint)`), has its own versioning concept independent of `CURRENT_SAVE_VERSION`, is never referenced from `SaveData`'s type or validator, and its own doc comment states plainly that gameplay correctness must never depend on it. `seedDb.ts`'s seed-catalog metadata is likewise confirmed structurally separate (`seedRecord.ts`'s own doc: "never a requirement to load a save").

10. **Does current documentation clearly distinguish gameplay persistence, deterministic reconstruction, sparse deltas, runtime state, and derived caches?**
    **Unevenly.** `docs/STATE.md`'s Persistence section is accurate and does distinguish these (see §5) but is dense prose, not a structured taxonomy, and covers only a subset (it doesn't mention worldgen-cache separation at all, nor the "restore is construction" fact). `docs/architecture/ARCHITECTURE.md`'s "Save schema" section is the nominal canonical owner of this distinction but is severely stale (§5, discrepancy #1) and does not mention deterministic-reconstruction vs. persisted-delta as a named distinction either. No document currently contains the classification table this audit produced. See §8, recommendation to create `docs/state/persistence.md` as the canonical home for exactly this taxonomy.

---

## 5. Documentation discrepancies

| # | Claim (location) | Classification | Finding |
|---|---|---|---|
| 1 | `docs/architecture/ARCHITECTURE.md` §"Persistence"/"Save schema": *"`SaveData` is a single-contract schema with **no** migration/compatibility story for older saves... Current schema version: **v1**"* | **Outdated — the single largest documentation/code mismatch found in this audit series** | Code confirms `CURRENT_SAVE_VERSION = 6` with a real, working, five-step migration pipeline (plan persistence-003) that predates this baseline. This section still describes the *pre*-persistence-003 "plan 201 hard cut" world, which persistence-003 explicitly superseded. It also never mentions the persistence-002 write-integrity guard or the persistence-004 `SaveManagementEntry`/unhealthy-save-status layer. `docs/STATE.md`'s own Persistence section, by contrast, is fully current (see row 4) — this is a single-document staleness, not repo-wide. |
| 2 | `docs/architecture/ARCHITECTURE.md` §"Save schema": *"Map discovery cells have their own, separately-versioned sub-schema inside `SaveData.map` (currently schema v11)"* | **Unverifiable against current code — likely stale** | No "version"/"schema" concept was found anywhere in `src/world/map/*.ts` or in `saveData.ts`'s `SaveMap`/`SaveLocationKnowledge` types; `SaveMap` has no version field and nothing in the restore path (`createMapDiscovery(initialSave?.map.discoveredCells)`) branches on one. Flagged as unverified/likely-stale, not definitively wrong — this audit did not search git history for a removed mechanism (see §9 open question). |
| 3 | `CLAUDE.md` (project root, "Architecture invariants"): *"Persistence uses `CURRENT_SAVE_VERSION`... currently `1`... with a real migration pipeline (plan persistence-003)"* | **Outdated, same root cause as row 1** | The constant is `6`, not `1`. `CLAUDE.md` is outside this audit's editing scope, but is flagged since it's the project's own steering document and repeats the identical stale number a future agent would read first. |
| 4 | `docs/STATE.md` §"Persistence" | **Accurate and current** | Every specific claim (v6, all five migrations named individually with correct plan ids and correct default-value rationale, persistence-002's exact refusal semantics, persistence-004's `SaveManagementEntry`/`hasUnreadableSaves()`) checked directly against `saveData.ts`/`saveDb.ts`/`saveSlots.ts` and matches exactly, including function/field names. **Not implementation-history leakage** in the sense other domain audits flagged elsewhere — it narrates *current mechanism* (what each migration defaults and why, which is load-bearing for understanding the pipeline's contract), not a plan-by-plan changelog of unrelated work. It is, however, unusually dense for `STATE.md`'s "concise snapshot" mandate — a natural candidate to trim once `docs/state/persistence.md` exists to hold the depth (see row 4's overlap with recommendation §8.6). |
| 5 | No document states that **player HP is not persisted** | **Missing — genuine, previously unflagged gap** | `PlayerController.health` always constructs fresh at `PLAYER_MAX_HP` (100); no `SaveData` field, no `buildSaveData()` write, no `createApp.ts` restore line. `07-combat.md`'s claim ("only downstream consequences — `HealthState`, `physicalInjury`, corpse/death state — persist, each owned by its own domain") holds for NPC/livestock `HealthState` but not for the player's own, which this audit found persists nowhere. Net effect: **every Continue/Load fully heals the player**, unremarked anywhere. |
| 6 | No document states that household/settlement-economy/chest food loses freshness batches across save/load | **Missing — second previously unflagged asymmetry** | `Inventory.foodBatchesToJSON()` is called exactly once, for the player's own inventory. `HouseholdSnapshot.items`/`SettlementEconomySnapshot.food`/`SavePlacedContainer` all persist only `counts`+`instances`, with no `foodBatches`-equivalent field or call. A household/settlement/chest food item's `acquiredAtDays` freshness anchor does not survive a save/load, while the identical item in the player's own bag does. |
| 7 | Should `ARCHITECTURE.md` remain the canonical owner of the save schema, with `STATE.md` only pointing to it? | **Yes — current cross-reference direction is correct; only the target content is stale** | `STATE.md`'s Persistence section already explicitly defers ("The exact field list is in ARCHITECTURE.md#save-schema, not here") — this is the right documentation-ownership shape (one canonical detail owner, one concise pointer) and should not change. The problem is entirely that `ARCHITECTURE.md`'s target content is stale (rows 1–2), not that the pointer relationship itself is wrong. Fixing rows 1–2 in place preserves this correct structure; it does not need `STATE.md` to absorb the detail instead. |

No other discrepancy was found between `src/persistence/*`'s current behaviour and either `docs/STATE.md`'s Persistence section or the domain-side persistence claims already verified by `03`–`07` (all re-confirmed directly against `saveData.ts` in this audit rather than taken on trust).

---

## 6. Integration seams discovered

### Cross-domain persistence seams

| Owner | Persisted representation | Restore consumer | Classification | Documentation |
|---|---|---|---|---|
| `NpcStateRegistry` (`settlement/npcState.ts`) | `SaveData.npcStates` (optional, sparse, plan persistence-001) | `createWorldBundle`/`rebuildWorldBundle`'s `initialNpcStates`/`carriedNpcStates` → `SettlementsManager` constructor | Persisted authoritative | `STATE.md` accurate; `settlements.md` was stale until `03`/`04`'s fix recommendation (not yet applied) |
| `HouseholdRegistry` (`settlement/household.ts`) | `SaveData.households` (optional, sparse, plan persistence-001) — **missing `foodBatches`** | Same path as above, `initialHouseholds`/`carriedHouseholds` | Persisted authoritative (with a freshness-tracking gap, row 6 above) | Undocumented gap (this audit) |
| `NpcRelationships` (`settlement/npcRelationships.ts`) | `SaveData.npcRelationships` (optional, sparse — non-zero pairs, plan persistence-001) | `initialNpcRelationships`/`carriedNpcRelationships` | Persisted authoritative | `STATE.md` accurate; `settlements.md` was stale (per `03`/`04`) |
| `LivestockRegistry` (`settlement/livestock.ts`) | `SaveData.livestock`/`removedLivestockIds` (optional, plan persistence-001) — full `AnimalSaveState` per individual, **explicit pre-`snapshotLivestock()` capture step required** (no live object survives an unload) | `initialLivestock`/`initialRemovedLivestockIds` → `carriedLivestock` on rebuild | Persisted authoritative | Documented accurately in `STATE.md`/`05-fauna.md` |
| Wild-fauna spawn population (`createFauna.ts`'s `SPAWNS` table) | None | Deterministic re-spawn from `(seed, settlement)` every load/rebuild | Deterministically reconstructed | Accurate in `STATE.md`; no dedicated `fauna.md` exists yet (per `05`'s recommendation) |
| `PreySpawner` lifecycle (`fauna/AnimalSpawner.ts`) | `SaveData.spawnPoints` (required) — FSM + recovery clock only | `initialSave?.spawnPoints ?? []` → `AnimalSpawner` construction | Persisted authoritative (thin) | Accurate in `STATE.md` |
| Rats (`settlement/rats.ts`) | **None** | Population reconciled live from `(household food + settlement food + dog count)` every settlement load — **not from a seed-deterministic formula**, unlike wild fauna | Runtime authoritative, not persisted, not deterministically reconstructed | Own doc comment states this plainly; no `docs/state/*.md` names it as a distinct fourth category (per `05`) |
| Player `Inventory` (counts/instances/foodBatches) | `SaveData.inventory`/`inventoryInstances`/`foodBatches` (all required) | `initialSave?.inventory`/`Inventory.instancesFromJSON`/`initialSave?.foodBatches` → `Inventory` constructor | Persisted authoritative | Accurate in `player-systems.md` (per `06`) |
| Player `HealthState` | **None** | Always `createHealthState(PLAYER_MAX_HP)` | Runtime authoritative, unpersisted | **Undocumented anywhere** (this audit, row 5) |
| Buildable records (well/torch/palisade/bedroll/platform/garden/terrain-prep) | One `SaveData.<x>` array each (required) | `initialSave?.<x> ?? []` → `WorldBundle`'s per-object collection constructor | Persisted authoritative | Accurate in `player-systems.md`/`STATE.md` (per `06`) |
| Work contract commitment (`world/workContract.ts`) | `SaveData.workContracts` (required) — commitment fields only, target progress referenced by id, never duplicated | `initialSave?.workContracts ?? []` → `WorkContracts` constructor | Persisted authoritative | `STATE.md` prose only, split across two sections (per `06`); no single canonical home yet |
| `physicalInjury` (combat→NPC-health handoff) | Part of `SaveData.npcStates` (the `physicalInjury` field) | Same path as `NpcStateRegistry` above | Persisted authoritative | Combat's own responsibility ends at the one-line write into this field (per `07`); persists as part of NPC state, not a combat-owned field |
| Combat in-flight state (`CombatIntent`, attack phase, projectile) | **None** | N/A — always starts fresh | Runtime authoritative, no persistence | Correctly implied by omission in `combat.md` (per `07`); this audit confirms no `SaveData` field exists anywhere for it |
| `terrainModifications` (dig/scorch/prepare) | `SaveData.terrainModifications`, `source: 'player'`-only | `terrainModificationsFromSave()` re-tags every restored entry `'player'` → `ChunkManager` modification list | Persisted delta/override | Accurate in `ARCHITECTURE.md`'s persistence paragraph and `STATE.md` |
| `resourceDeposits` (mining-hits-remaining) | `SaveData.resourceDeposits`, sparse `id → remaining` | `new Map(Object.entries(initialSave?.resourceDeposits ?? {}))` | Persisted delta/override | Accurate |
| `worldgenCacheDb.ts` (locations-coarse namespace) | IndexedDB `worldgenCache` store, outside `SaveData` | `createCoarseCachePersistence`/`locationsCoarseFingerprint` (world/locations side, not `initialSave`-threaded at all) | Derived / cache | Missing from both `terrain-and-world-generation.md`/`water.md` (per `02`) and from `ARCHITECTURE.md`'s persistence module list (this audit) |

### Reconciliation against `02`–`07`'s own findings

- **World/terrain (`02`):** deterministic terrain/hydrology, sparse terrain-modification deltas, resource-deposit deltas, and the worldgen-cache separation are all reconfirmed unchanged by direct `saveData.ts` inspection. `02`'s own recommendation (add a pointer to `worldgenCacheDb.ts` from `terrain-and-world-generation.md`/`water.md`) stands; this audit adds that `ARCHITECTURE.md`'s persistence module list should gain the same pointer.
- **Settlements/economy (`03`):** the five-registry `initial*`/`snapshot*` idiom, the land-ownership flat-field exception, and the three now-stale `settlements.md` claims (npcStates/households/npcRelationships all now persisted since persistence-001) are all reconfirmed directly against `saveData.ts`. This audit's own verdict on the land-ownership inconsistency: not a correctness risk (§4, Q3/Q8), a style question only.
- **NPC (`04`):** `NpcAuthoritativeState`'s full 7-field persisted shape (including `helperAssignment`/`activePlan`, which `03` had not yet individually confirmed) is reconfirmed directly against `isNpcStateSnapshot()`. The two independent relationship stores (`NpcRelationships` vs. `QuestManager.relations`) are both confirmed persisted, via different `SaveData` fields, with different sparsity/optionality contracts (see §3 rows).
- **Fauna (`05`):** the three-tier fauna persistence picture (livestock persisted / wild-fauna-and-rats deterministically-or-not-reconstructed / no wild-individual-state survives) is reconfirmed exactly, with this audit adding the explicit note that rats are a *fourth* shape, not a subset of "wild fauna unpersisted" — their population isn't even seed-deterministic, unlike a wild wolf pack's.
- **Player/items (`06`):** player inventory/instances/foodBatches, buildable records, and work-contract commitment persistence are all reconfirmed. This audit adds the two new findings (`06` did not catch): player HP never persists, and only the player's own `Inventory` gets `foodBatches` treatment — household/settlement/chest `Inventory` instances do not.
- **Combat (`07`):** `HealthState` as the shared primitive, the `physicalInjury` combat→NPC-health handoff, and "combat itself has no persisted state" are all reconfirmed directly. This audit's correction to `07`'s own framing: its claim that only "downstream consequences... each owned by its own domain" persist is accurate for NPC/livestock but **not for the player** — the player's own `HealthState` is a downstream consequence that does *not* persist, which `07`'s combat-scoped pass had no reason to notice (it was checking NPC-side `takeDamage()`, not the player's own).

---

## 7. Shared mechanisms / invariants

- **Outgoing-validation-before-write** (`isSaveData()` before any `SaveData` write, `isSeedRecord()` before any `SeedRecord` write) — a deliberate, repeated convention across both `saveDb.ts` and `seedDb.ts`, not independently invented per store.
- **Sparse-delta-over-deterministic-base** (`terrainModifications`, `resourceDeposits`, `grassForagePatches`, `spawnPoints`, `map.discoveredLocations`) — the same "absent id/entry ⇒ untouched deterministic default" contract, applied independently across world/terrain, economy, fauna, and world-locations domains. Each domain audit (`02`/`03`/`05`) described its own instance correctly; none named it as a cross-domain convention worth documenting once.
- **`initial*`(constructor)/`snapshot*`(serialize) idiom** — confirmed by this audit's own read of `worldBundle.ts` to be a repository-wide convention (every `WorldBundle`-owned collection uses it: settlement registries *and* every buildable collection), not settlement-domain-specific as `03` implicitly framed it.
- **Restore-as-construction** — no domain in this codebase has a two-phase "construct, then apply save values" restore. Every system's constructor accepts its restored state directly as a parameter. This is a consistent, load-bearing architectural choice, not an accident of one system's implementation.
- **`logSaveDiagnostic()`'s never-log-the-payload discipline** — every diagnostic call site in `saveDb.ts` passes an operation+slot-id string and, at most, a caught error object, never the `SaveData`/envelope value itself. Consistent across every call site.
- **Worldgen-cache namespace/version/fingerprint** is a structurally separate versioning mechanism from `SaveData.version`, deliberately: a namespace owner's fingerprint mismatch is a cache miss (silent, safe), never a migration (which would imply a correctness obligation this cache explicitly disclaims).

---

## 8. Recommended documentation changes

1. **Rewrite `ARCHITECTURE.md`'s "Save schema" subsection.** Highest-value fix in this audit series: replace the "v1, no migration story" framing with the current v6/five-migration/persistence-002-guard/persistence-004-status-layer picture. `STATE.md`'s own Persistence prose is accurate and can be condensed/reused as the source.
2. **Fix `CLAUDE.md`'s "currently `1`" line** to `6` — same root cause as #1, and it's read before `ARCHITECTURE.md` per the project's own navigation flow.
3. **Add `db.ts`/`seedDb.ts`/`seedRecord.ts`/`worldgenCacheDb.ts` to `ARCHITECTURE.md`'s persistence module list** — currently only `saveState.ts`/`saveData.ts`/`saveDb.ts` are named, despite the other four physically living in the same directory and sharing the same database.
4. **State explicitly that player HP does not persist** (discrepancy #5) — a real behavioural fact (full heal on every Continue) inconsistent with NPC/livestock HP's own persisted status, undocumented anywhere today.
5. **State explicitly that household/settlement/chest food loses freshness batches on save/load** (discrepancy #6).
6. **Create `docs/state/persistence.md`.** `01-inventory.md` left this conditional on whether this audit found persistence-specific invariants beyond a field list — it did: the restore-as-construction fact, the `rebuildWorldBundle`/`createWorldBundle` shared-parameter mechanism that closes the brief's named hazard, the four-way `InspectedSaveSlot` status model, and the full domain-classification table in §3. None of this fits `ARCHITECTURE.md`'s general-architecture scope or `STATE.md`'s concise-snapshot scope. Recommend `ARCHITECTURE.md`'s "Save schema" trim to a pointer + version/migration-count headline once this file exists, preserving the correct `STATE.md → ARCHITECTURE.md` pointer direction confirmed in discrepancy #7 — `docs/state/persistence.md` becomes a third, deeper layer underneath both, not a replacement for either.
7. **§3's classification table should be the canonical reference** for future domain audits/plans that touch persistence status — recommend keeping it current rather than letting per-domain docs (e.g. `settlements.md`) each maintain their own partial, driftable copy, which is exactly the failure mode `03`/`04` found (three stale claims from one missed persistence-001 update).

---

## 9. Open questions

- **Is the player's unpersisted HP intentional?** No document, plan, or code comment found states a reason (unlike stamina's own "not worth persisting" comment). Recommend a maintainer decision: persist it (one field, one migration), or add a comment stating the choice is deliberate.
- **Is household/settlement/chest food-freshness loss on save/load intentional?** Same shape as above — recommend either extending `foodBatchesToJSON()`-equivalent tracking to `Household`/`SettlementEconomy`/`PlacedContainerEntry`, or documenting the choice.
- **Should land ownership's flat-field persistence idiom be unified with the other four settlement registries' pattern?** Not a correctness problem (§4 Q3/Q8) — a low-priority stylistic question for a future refactor, not a persistence-audit action item.
- **Does `ARCHITECTURE.md`'s "map schema v11" claim describe a mechanism that was genuinely removed, or was it never accurate?** No trace of any map-schema-versioning concept found in current code, but this audit did not search git history to distinguish stale-by-removal from stale-by-inaccuracy. Recommend a quick `git log -p` check on `SaveMap`/`mapConfig.ts` before finalizing the `ARCHITECTURE.md` rewrite (recommendation #1).

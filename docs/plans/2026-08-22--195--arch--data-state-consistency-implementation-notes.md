# Implementation notes — 195 — Data & State Consistency Audit

Audit only, per plan scope ("Celem nie jest jeszcze refactor"). Investigation was split into five parallel, read-only sub-audits, each covering a cluster of plan sections against the current codebase (not against docs/plans 193/194, which have not themselves been executed yet — this audit is self-contained against the code):

1. **Core architecture** — `WorldBundle`/`WorldContext`/`createApp.ts`, mutable-reference and closure/stale-accessor audit, New Game/rebuild lifecycle (plan §1-2, §4-7, §11).
2. **Persistence/serialization boundary** — `saveState.ts`, `saveData.ts`/`saveDb.ts`/`saveSlots.ts`, `worldConfig.ts`/`persistConfig.ts` (plan §13-15, config precedence).
3. **NPC/settlement/household/economy** — ownership, source of truth, derived state, cross-system mutation (plan §2-3, §8-10).
4. **Fauna/world/trees/crops/chunks** — ownership, cache/invalidation, streaming/unload/reload continuity (plan §2-3, §8-9, §12).
5. **Player/items/inventory/quests** — ownership, persistent-vs-derived, cross-system mutation, light entity-state-boundary check (plan §2-3, §8, §10, §16).

Each finding below carries its own Evidence/Priority per the plan's Evidence Standard; only findings with a concrete, demonstrable failure scenario were kept — several suspected issues (e.g. `WorldContext`, `SettlementEconomy`'s derived shortage/surplus, `Inventory.maxWeight` caching, quest target-state duplication) were investigated and found **clean**, matching the documented/intended architecture, and are recorded as negative findings rather than problems.

---

## 1. State Contract Matrix (plan §17 — primary artifact, consolidated across all five clusters)

| State | Owner | Source of truth | Persistent | Derived | Sim runtime | Presentation | Cache | New Game | Rebuild |
|---|---|---|---|---|---|---|---|---|---|
| `WorldBundle` container | `createApp.ts` | itself, mutated in place | no | no | yes | no | no | fields replaced | fields replaced |
| `ChunkManager` instance | `WorldBundle.chunkManager` | `worldBundle.ts` | no | derived from seed/config | yes | yes | internal chunk cache | recreated | recreated |
| `collectedItemIds`/`removedCropIds`/`plantedTrees`/`plantedCrops` | `createApp.ts` `let` bindings, shared by reference into `ChunkManager` | the live `Set`/array | yes | no | yes | no | no | reset | carried (same object) unless reset |
| `treeLifecycle` | `createApp.ts` `let` | sparse `overrides` + procedural derivation from `elapsedDays` | yes (overrides only) | yes (base stage) | yes | yes | self-pruning memo | new instance | presence index cleared every rebuild; overrides carried unless reset |
| Wild crop stage | pure fn `resolveCropStage` | `elapsedDays` + deterministic `stageStartedAt` | no (implicit) | 100% derived | — | yes | no | regenerated | regenerated |
| Fauna spawn-point lifecycle (`PreySpawner`) | `AnimalSpawner.ts` | explicit fields | yes (`spawnPoints`, v17) | no | yes | tint/label only | lookup maps only | reset unless carried | snapshotted → carried |
| Individual `AnimalAgent` | `Fauna.agents` | live object | **no** | no | yes | yes | no | full respawn | full respawn (dispose-then-rebuild) |
| NPC identity/needs/HP/carried `Inventory` | `NpcAgent` | class fields | **no** (documented gap) | no | yes | label/HP bar | no | reset | reset |
| `SettlementEconomy` bulk stock | `EconomyRegistry` on `SettlementsManager` | `EconomicStock` closure | **yes** (`settlementEconomies`, save v12+) | shortage/surplus derived | yes | dialogue text | no | reset to seeded initial | **carried** (`carriedEconomies`) |
| `Household.stock`/`.water` | `HouseholdRegistry` on `SettlementsManager` | `EconomicStock`+`WaterReserve` closures | no (deliberate, no `SaveData` field) | no | yes | dialogue text | no | reset | **not carried — Finding B (P1)** |
| Relation level / EXP | `QuestManager.relations`/`.exp` | persisted map/field | yes | tier/standing derived live | — | dialogue gating | no | reset | N/A |
| `QuestManager.animalTargets` | `QuestManager` | opaque `animalId` binding | no (deliberate) | re-derived on load | yes | quest markers | no | cleared | re-derived via resolver |
| Player needs: hunger/thirst/vigor | `PlayerNeeds` | live pools | yes | no | yes | HUD | no | reset | N/A |
| Player needs: stamina, starvationDuration, dehydrationDuration | `PlayerNeeds` | live counters | **no** — stamina deliberate; duration fields undocumented gap — **Finding P1 (persistence, P1)** | no | yes (gates HP loss) | HUD | no | reset to 0 | N/A |
| Player skill `xp` / `value` / `active` | `PlayerSkills` | `xp` persisted; `value` derived at every write site; `active` never restored | `xp` yes | `value` yes | `active` yes | HUD | write-time-cached derivation, verified never stale | reset | N/A |
| `Inventory` counts/instances/foodBatches | `Inventory` (1 per player/NPC/container) | internal Maps | yes | no | yes | UI | no | reset | survives (rebuilt from save) |
| `Inventory.maxWeight`/`maxSize` | same | getter (weight) / ctor config (size) | no | weight: yes, recomputed every access; size: no (config) | n/a | HUD | no | n/a | n/a |
| `HeldTool` kind / instance id | closure per `PlayerController` | closure var | kind: yes; **instance id: no — P3 gap** | instance id derived on equip/sync | yes | HUD | no | reset | re-resolved (first-match fallback) |
| Dropped instance-backed item durability/sharpness | **none** — destroyed on drop | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a — **confirmed prior P0, deferred** |
| `worldConfig` terrain (fields an older save predates) | `createWorldConfig()`/`applyStoredTerrain` | intended: hardcoded `baseConfig` default; actual (pre-fix): last-played world's localStorage cache | n/a (config, not save-domain state) | n/a | — | — | localStorage (`WORLD_KEY`) | new seed | **Fixed — see §3 below** |
| `BenchmarkHost.chunkManager` (debug/perf tooling) | `createApp.ts` closure | should be `bundle.chunkManager` | no | no | no | debug only | was a stale captured value | not refreshed pre-fix | **Fixed — see §3 below** |
| Seed-keyed noise caches (`grassPlacement.ts`, `chunkHeightmap.ts`) | module-level `Map<seed,…>` | correct per key, never wrong | no | derived | yes | no | unbounded across repeated New Games (P3, acceptable) | new entry added | new entry added |

---

## 2. Findings, by priority, with decisions

### P0 — Correctness

| Finding | Status |
|---|---|
| Dropped instance-backed items (axe/knife/sickle/traps) lose `durability`/`sharpness` on drop → pickup (`inventoryWiring.ts`'s `dropItemStack` → `droppedItems.drop()`, `DroppedItem`/`SaveDroppedItem` have no instance-state fields at all) | **Confirmed prior finding**, already tracked in `LOOSE-ENDS.md` (2026-08-21) and re-verified accurate against current code. **Decision: follow-up plan** (already staged; not fixed here — requires extending `DroppedItem`/`SaveDroppedItem` with optional `durability`/`sharpness` and threading it through drop→collect, a save-schema-adjacent change out of this audit's minimal-fix scope) |

### P1 — Architectural

| Finding | Evidence | Decision |
|---|---|---|
| **A — `BenchmarkHost.chunkManager` captured by value in `createApp.ts`, stale after any `WorldBundle` rebuild** | `createApp.ts`'s benchmark-runner construction passed `bundle.chunkManager` (a value) instead of an accessor, unlike every other `bundle.x` consumer in the file. A disposed `ChunkManager`'s `chunks` Map/instance material are torn down by `dispose()`, but its chunk-worker pool is not (only full app teardown does that) — so the stale instance stays functionally callable and would regenerate old-seed terrain into the live scene, reusing a disposed material, if a benchmark runs after a terrain rebuild or New Game. | **Fixed now** — `BenchmarkHost.chunkManager` is now `() => TerrainProbe`, matching the codebase's existing accessor convention (`src/perf/benchmark.ts`, `src/app/createApp.ts`) |
| **B — `Household` stock not carried across an in-session `WorldBundle` rebuild, unlike `SettlementEconomy`** | `rebuildWorldBundle` explicitly snapshots+carries `SettlementEconomy` (`carriedEconomies`, `worldBundle.ts:538`) but `SettlementsManager.ts`'s `households = createHouseholdRegistry()` has no equivalent carry parameter — reachable via any in-session terrain/world-config change (`onTerrainChange`/debug GUI), not just New Game | **Follow-up plan** — needs a `HouseholdRegistry.serialize()`/carry pair mirroring `EconomyRegistry`'s existing pattern; logged to `LOOSE-ENDS.md` (2026-08-22) and `docs/SETTLEMENTS.md` |
| **C2 — `worldConfig` terrain fallback pulled from the last-played world's localStorage cache, not the hardcoded default, for a field an older save predates** | `createApp.ts` merged a restored save's `config.terrain` onto `config.terrain` as already built by `createWorldConfig()` — which had already overlaid localStorage's cached terrain onto the hardcoded `baseConfig()` defaults — contradicting `applyStoredTerrain`'s own doc comment ("keeps target's current default") | **Fixed now** — new `defaultTerrainConfig(resolution)` export in `worldConfig.ts`; `createApp.ts` now merges a restored save's terrain onto a *fresh* default, not onto the localStorage-tainted config |
| **P1 (needs) — `PlayerNeeds.starvationDuration`/`.dehydrationDuration` not persisted, while the correlated `hunger.current`/`thirst.current` are** | `SavePlayerNeeds`'s doc comment only names *stamina* as the intentionally-transient field; the two duration counters (plan 165) are silently dropped by `restorePersistedNeeds`/`createPlayerNeeds`, resetting to 0 on every load regardless of save-time value, while `playerDamage.ts` gates real HP loss on them — a save/reload during active starvation/dehydration HP-drain silently pauses that drain for a full grace period | **Follow-up plan** (or explicit "intentional, like stamina" doc decision) — needs a save-schema field addition + version bump, out of this audit's minimal-fix scope; logged to `LOOSE-ENDS.md` (2026-08-22) |

### P2 — Maintainability

| Finding | Decision |
|---|---|
| Hand-duplicated `Set<T>` validator allow-lists in `saveData.ts` for 5 closed unions (`TrapKind`, `ContainerKind`, `WellStage`, `TreeSizeClass`, `CropId`) — not exhaustiveness-checked against their source types; currently in sync, but a missed update on a future new variant would fail the *whole* save slot's load, not just that record | **Acceptable** — no current impact; flagged as a process note (grep `saveData.ts` when adding a variant to any of these five types) rather than a structural change |
| `NpcAgent.beginOreGathering` gates on a 1-unit `canAdd` but adds a multi-unit yield without checking `add()`'s success before the paired `remove()` | **Follow-up** (logged to `LOOSE-ENDS.md`) — narrow edge case (near-full NPC carry capacity + multi-unit yield), not fixed here to keep this audit's code changes minimal and reviewable |
| `docs/STATE.md`/`docs/ARCHITECTURE.md` documentation drift: save schema said v25 (code is v26, `playerGardens` missing from both the version table and `WorldBundle`'s member list); `docs/STATE.md`/`docs/SETTLEMENTS.md` said `SettlementEconomy` is "not in save data yet" (persisted since v12) | **Fixed now** — see §3 |

### P3 — Optional

| Finding | Decision |
|---|---|
| `HeldTool.heldInstanceId` not persisted; reload with 2+ identical-kind weapon-maintenance instances re-equips an arbitrary (first-in-Map-order) one | **Acceptable** — narrow, cosmetic (durability display only), mechanism to fix it already exists (`createHeldTool`'s `initialInstanceId` param) if ever prioritized |
| `docs/STATE.md`'s "`QuestManager` has no fauna import" overstates what's true (a type-only `AnimalKind` import exists; zero runtime coupling) | **Fixed now** — wording tightened, see §3 |
| Seed-keyed noise caches (`noiseHandlesFor`, `sandBandNoiseCache`, `speciesNoiseCache`) never evicted across repeated New-Game-with-different-seed in one session | **Acceptable** — memory-only, no correctness impact (a given seed always maps to a correct cached value) |
| `SettlementEconomy.water` `EconomicKind` is inert seed data with no producer/consumer (real reserve lives on `Household.water`) | **Acceptable** — already self-documented in code comments and `docs/SETTLEMENTS.md` |
| `iron`/`coal`/`gold` always report `shortage: false` (no `SettlementDemand` entry for them) | **Acceptable** — already a documented, known incompleteness |
| Config precedence (URL/localStorage/defaults) isn't literally uniform per-field (`showGui` has no localStorage source) vs. CLAUDE.md's one-line summary | **Acceptable** — the summary is directionally accurate; not worth a CLAUDE.md rewrite over one field |
| `isSkillsField` validator doesn't check `traps`/`defense`/`archery` shape, but `restorePersistedSkills` safely defaults malformed entries to 0 | **Acceptable** — the gap exists but the actual failure mode is already handled safely one layer down |

### Verified clean (no finding — recorded per Evidence Standard)

`WorldBundle` ownership boundary (pure container, no convenience-migrated state); `WorldContext` (genuinely read-only, consistent accessor pattern, no parallel adapters, correct across rebuild); `saveState.ts` (pure assembler, no field computed/cached in the assembler itself, no dead-write fields across the full `SaveData` surface); tree/crop lazy-derivation pattern (self-pruning overrides, single-sourced env sampling, no stale-cache risk); fauna streaming/unload/reload continuity (presence correctly split runtime-index vs. persisted override; spawn-point lifecycle genuinely continuous, matching the already-fixed 2026-08-18 loose end); `Inventory` cross-system mutation discipline (capability-gate checks consistently paired with mutation on every player action path; NPC gathering's capability-agnostic design confirmed intentional, not a bypass); `PlayerSkills.value` derivation (no stale-read window between construction and restore); quest target binding (no cached/duplicated live state, event-driven progress only).

---

## 3. Changes made

**Code (2 fixes, both small and localized, mirroring an existing convention already used elsewhere in the same file):**

- **`src/perf/benchmark.ts`** / **`src/app/createApp.ts`** — `BenchmarkHost.chunkManager` changed from a captured `TerrainProbe` value to a `() => TerrainProbe` accessor (`createApp.ts` now passes `() => bundle.chunkManager`); all four internal call sites in `benchmark.ts` now read it live. Fixes Finding A.
- **`src/config/worldConfig.ts`** / **`src/app/createApp.ts`** — new exported `defaultTerrainConfig(resolution)` (fresh `baseConfig(0, resolution).terrain`, no seed/localStorage/save influence); `createApp.ts`'s save-restore path now merges a loaded save's terrain config onto this fresh default instead of onto `config.terrain` as already overlaid with localStorage's last-played-world cache. Fixes Finding C2.

**Documentation (drift corrections, code already matched the corrected text):**

- `docs/ARCHITECTURE.md` — added `PlayerGardens` to `WorldBundle`'s member list; added the missing v26 row (`playerGardens`, plan 174) to the save-schema version-history table; bumped "Current schema version" v25→v26; bumped "Last verified" to 2026-08-22.
- `docs/STATE.md` — bumped "Canonical save schema is v25" → v26; corrected `SettlementEconomy`'s "Not in save data yet" claim (persisted since v12, carried across in-session rebuild) and clarified `Household`'s gap (no `SaveData` field, *and* — new finding — no in-session-rebuild carry either, unlike `SettlementEconomy`); tightened the "`QuestManager` has no fauna import" wording to match the file's own more precise comment (no *runtime* fauna coupling; a type-only import exists).
- `docs/SETTLEMENTS.md` — corrected the "Ekonomia" section's stale claim that `SettlementEconomy` stock isn't in `SaveData`; added a note to the "Gospodarstwa" section about `Household`'s missing rebuild-carry mechanism (Finding B).
- `docs/plans/LOOSE-ENDS.md` — four new entries: Finding B (household rebuild-carry gap), the starvation/dehydration-duration persistence gap, the `NpcAgent.beginOreGathering` add/remove mismatch, cross-referenced with plan `195`.

**Not changed:** all P0/P1 findings requiring a save-schema change, a new registry carry mechanism, or balance/exploit judgment were left as follow-up items rather than fixed in-line, per the plan's explicit "not yet a refactor" scope and its instruction not to implement a large change during the audit.

---

## 4. Follow-up plan candidates

Per plan §18/§20, each requiring more than a minimal fix:

```text
arch--household-economy-rebuild-carry       (Finding B — mirror EconomyRegistry's carry pattern)
persistence--player-needs-deprivation-duration  (starvation/dehydration duration fields — schema bump + decision)
items--dropped-instance-item-condition       (already staged in LOOSE-ENDS 2026-08-21 — durability/sharpness lost on drop)
```

Names are illustrative; not created as plan files here — logged to `LOOSE-ENDS.md` for triage, per plan §10's instruction for out-of-scope threads found mid-plan.

---

## 5. Verification

- **Technically verified**: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` — see command output in this session; all green (see below).
- **Not browser/manually verified** — both code fixes are narrow-blast-radius (debug/perf tooling; a config-merge fallback path that only differs from prior behavior for a field an older save predates *and* a different world was played since). Suggested manual checks if a human wants to confirm:
  1. Change a terrain setting mid-session (World Config screen or debug GUI), then run a benchmark (`window.__seedvaleRunBenchmark(...)` or the debug GUI's Run Benchmark control) — should probe the *current* terrain, not regenerate old-seed geometry into the scene.
  2. Load an older save (pre-dating a `RegionParams`/terrain field) after having played a different, GUI-tuned world in the same browser session — the loaded save's terrain should match its own original hardcoded defaults for that field, not the other world's tuned value. (Narrow to reproduce manually; the code-path fix is the primary verification here.)
- This was an audit-and-triage session, not a feature implementation — most of the "verification" is the evidence trail in §1-2 above (code paths traced, not gameplay tested).

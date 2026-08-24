# Implementation notes — 201 — Deferred Architecture & State Cleanup

Reconciliation/cleanup plan, not a new audit. Reconciled every finding from audits 192–195 against current `main` and against what plans 196–200 actually closed (their implementation notes + `docs/plans/LOOSE-ENDS.md`'s current `[x]`/`[ ]` state), then did the small remaining fixes this plan's scope allows.

---

## 1–2. Reconciliation matrix (findings 192–195 vs. 196–200)

Verified against current code, not just the historical audit text. Only rows with a change or a decision worth recording are listed in detail; the full per-finding evidence lives in each of 192–195's own implementation notes.

| Finding | Origin | Current status | Covered by | Action | Reason |
|---|---|---|---|---|---|
| Time-conversion duplication (`24/dayLengthSec` re-derived in 5 places) | 192 | resolved | 192 itself | none | fixed directly in the audit session (`world/timeConversion.ts`) |
| `PlayerNeeds` hardcoded `480` instead of live `dayLengthSec` | 192 | resolved | 192 itself | none | fixed directly |
| Time-skip double-counting NPC needs (live tick + `resolveTimeSkip` replay) | 192 | resolved | 196 | none | `gameLoop.ts` gates `settlementsManager.update`/`fauna.update`/`placedTraps.update` behind `!timeSkip.isActive()`; replay is now the sole mutator |
| Fauna full behavior tree unthrottled during time-skip (193 Finding 0, P0) | 193 | resolved | 196 | none | same gating fix; new `AnimalAgent.resolveTimeSkip`/`Fauna.resolveTimeSkip` give fauna a minimal catch-up |
| Time-skip replay also duplicates household/economy stock quantities (193 Finding 1) | 193 | resolved | 196 | none | same root-cause fix — live tick no longer runs, so no double mutation |
| Time-skip water-drink replay unconditional (193 Finding 3) | 193 | obsolete | 196 | none | moot — live tick doesn't run during a skip anymore, so this replay branch is the only one and was already gated correctly |
| Fauna had no `resolveTimeSkip` equivalent (193 Finding 9) | 193 | resolved | 196 | none | added |
| `NpcAgent.die()` no death-propagation hook (193 Finding 2 / P1) | 193 | intentionally deferred | 197 §6 | none | decided **not** to add a hook: `Household`/`SettlementEconomy` are running balances mutated by live actions, not derived from headcount, so a dead NPC (already a no-op in `update()`) needs no propagation for those two systems; the one real consequence found (dialogue still opening on a dead NPC) was fixed directly. A narrow `onNpcDeath?` hook stays a documented option if a future feature (reputation, population UI) needs one. |
| `DecisionContext.extras`/`.entity` write-only/dead in both consumers (193 Finding 4, P2) | 193 | **fixed this plan** | 201 | trimmed | see §3 below |
| NPC bypasses `adoptPlannedAction` (193 Finding 5, P2) | 193 | intentionally deferred | — | none | behavior-affecting (same-kind-preserves-active vs. always-replace), not a pure trim — left for a future decision when action-lifecycle code is next touched; noted in `LOOSE-ENDS.md` |
| Two parallel combat execution shapes, player-vs-animal vs. NPC-initiated (193 Finding 6, P2) | 193 | acceptable, no action | — | none | already the audit's own disposition — maintainability note, no correctness impact, not reopened |
| `resourceDeposits` no rebuild-carry snapshot (193 Finding 7 / 194 Finding 6) | 193/194 | resolved | 198 | none | `ResourceDepletionState`, carried across rebuild and own streaming radius |
| Shared-resource contention order undocumented (193 Finding 8, P2) | 193 | acceptable, no action | — | none | deterministic, just unstated; already the audit's own disposition |
| P3 items 10–16 (193: callback scan, positional args, one-frame lag, doc fix, orphaned test file, mutable readonly fields) | 193 | acceptable, no action | — | none | audit's own disposition, no correctness impact |
| NPC runtime state (incl. death) doesn't survive settlement stream-out/in (194 Finding 1, P0) | 194 | resolved | 197 | none | `NpcStateRegistry`, mirrors `HouseholdRegistry`/`EconomyRegistry` |
| Dropped instance-backed items lose durability/sharpness (194 Finding 2, P0) | 194 | resolved | 199 | none | `SaveDroppedItem.instance?`, all 4 call sites fixed |
| Quest-giver reserved names collide with procedural name pool (194 Finding 3, P1) | 194 | resolved | 199 | none | `generateNpcName()` excludes reserved names |
| `QuestManager.animalTargets` not invalidated on mid-session rebuild (194 Finding 4, P1) | 194 | resolved | 199 | none | `invalidateStaleAnimalTargets()` called from `rebuildWorld()` too |
| Ore deposit resets on ordinary walk-away/return, farming exploit (194 Finding 5, P0/P1) | 194 | resolved | 198 | none | `ResourceDepletionState` |
| Ore deposit no rebuild-carry (194 Finding 6) | 194 | resolved | 198 | none | same fix as above |
| `ResourceDeposits` rebuild-carry doc gap (194 Finding 7) | 194 | resolved | 198 | none | documented in that plan's notes |
| Dead NPC has no removal/disposal path (194 Finding 8, P2) | 194 | intentionally deferred | 197 §6 | none | moot in practice — no corpse/loot system exists for NPCs; excluded from the O(n²) separation loop and dialogue targeting instead, matching what combat already did |
| Fauna has no chunk streaming, undocumented (194 Finding 9, P2, doc-only) | 194 | **fixed this plan** | 201 | doc added | see §4 below |
| Tree/crop visual catch-up lag, needs an explicit decision (194 Finding 10, P2, doc-only) | 194 | **fixed this plan** | 201 | doc added | decided "acceptable as-is", documented; see §4 |
| Two divergent "drop everything" mechanisms (194 Finding 11) | 194 | resolved | 199 | none | both `dropItemStack` and `consumeDrop()` now instance-aware |
| P3 items (194: player HP/stamina not persisted, `bury()` hold-channel gap, mutable readonly fields, `TreeLifecycle.resolve()` read/write conflation, settlement tree-id namespace sharing, stale `activeProjectiles` on rebuild, cosmetic remains-count mismatch, per-frame linear scans) | 194 | acceptable, no action | — | none | audit's own disposition |
| Dropped instance-backed items lose durability (195 P0, same as 194 Finding 2) | 195 | resolved | 199 | none | see above |
| `BenchmarkHost.chunkManager` stale closure (195 P1 Finding A) | 195 | resolved | 195 itself | none | fixed directly in the audit session |
| `Household` stock not carried across in-session rebuild (195 P1 Finding B) | 195 | resolved | 197 §8 | none | `snapshotHouseholds()`/`carriedHouseholds`, mirrors `carriedEconomies` |
| `worldConfig` terrain fallback from stale localStorage cache (195 P1 Finding C2) | 195 | resolved | 195 itself | none | fixed directly (`defaultTerrainConfig`) |
| `PlayerNeeds.starvationDuration`/`.dehydrationDuration` not persisted (195 P1) | 195 | resolved | 200 | none | added to `SavePlayerNeeds` |
| Hand-duplicated `Set<T>` validator allow-lists in `saveData.ts` (195 P2) | 195 | acceptable, no action | — | none | still true after the v1 hard cut (§7) — same disposition as the original audit: no current impact, a grep-on-new-variant process note, not a structural change |
| `NpcAgent.beginOreGathering` add/remove mismatch (195 P2) | 195 | **fixed this plan** | 201 | fixed | see §3 below |
| Doc drift: save schema version, `SettlementEconomy` persistence claim (195 P2) | 195 | resolved | 195 itself | none | fixed directly at the time; superseded again by this plan's v1 hard cut (§7/§5) |
| P3 items (195: `HeldTool.heldInstanceId` not persisted, `QuestManager` fauna-import doc wording, unbounded seed-keyed noise caches, inert `SettlementEconomy.water`, `iron`/`coal`/`gold` no shortage target, config-precedence doc nuance, `isSkillsField` gap) | 195 | acceptable, no action | — | none | audit's own disposition |

No active finding from 192–195 was found unaccounted for. Every P0/P1 is either resolved by 196–200, or intentionally deferred with a recorded reason (NPC death-propagation hook, dead-NPC removal path). Every remaining P2/P3 keeps the original audits' own "acceptable, no action" disposition — none of them independently justify a new plan per this plan's own scope rule (§4 of the plan: don't spin up a plan for every P2/P3).

---

## 3. Small fixes made (plan §3)

1. **`NpcAgent.beginOreGathering`** (`src/ai/NpcAgent.ts`, mine `onComplete`) — gated `minedCount` on the actual return value of `this.carried.add(result.yield.kind, result.yield.count)` instead of assuming it always succeeds. Previously, if `add()` failed (e.g. weight/capacity room for only 1 unit when the yield is >1), the chained `deposit` step's `remove(itemKind, minedCount)` would still fire and could remove units that were never added. No regression test added: `NpcAgent` has zero existing unit tests in this codebase (it requires a full Three.js/world-context construction that nothing else in `src/ai/*.test.ts` attempts — matches `CLAUDE.md`'s own note that unit coverage here is "primarily pure logic rather than Three.js/DOM integration"); adding one just for this one-line guard would be disproportionate scaffolding relative to the fix.

2. **`src/simulation/types.ts`'s `DecisionContext.entity`/`.extras`** — removed both fields. `.entity` was never populated by either consumer (`NpcAgent`/`AnimalAgent`); `.extras` was written by both `buildDecisionContext` methods but never read anywhere (confirmed by repo-wide grep). `SimulationEntityRef` itself stays — it's genuinely load-bearing elsewhere (`CombatTargetHandle.ref` in `combat/combatIntent.ts`, read via `.ref.id` in `NpcAgent.ts`'s combat trace/target-list code). Updated `src/simulation/types.test.ts` to drop the now-removed `entity` field from its fixture. The other half of the same original finding — NPC bypassing `adoptPlannedAction` — was **not** touched (see reconciliation matrix): it's a behavior question, not a trim.

3. **`SaveData.resourceDeposits`** — plan 198 explicitly deferred cross-session persistence of ore-deposit depletion to this plan (its own notes: "poza zakresem: resource deposit continuity — 198" → "follow-up przenosi się do 201"). The in-session `ResourceDepletionState` (`Map<id, remaining>`) already existed and was already threaded through `createWorldBundle`/`rebuildWorldBundle`; this plan only extended it to `SaveData`:
   - `SaveData.resourceDeposits: Record<string, number>` (sparse — same "absent id = untouched" contract as the in-memory `Map`).
   - `createApp.ts` seeds `resourceDepletion` from `initialSave?.resourceDeposits` at startup, and resets it to an empty `Map` only on `resetCollectedItems` (genuinely new world), same as `collectedItemIds`/`removedCropIds`.
   - `saveState.ts`'s `buildSaveData()` serializes it via a new `getResourceDepletion()` live accessor (same pattern as `getCollectedItemIds`/`getRemovedCropIds`).

---

## 4. Documentation fixes made (doc-only follow-ups from 194)

Two P2 doc-only follow-ups named explicitly by plan 194's own notes, each a short paragraph:

- **`docs/architecture/performance-and-workers.md`** — new "Fauna simulation granularity" section documenting that `Fauna` has no chunk-based streaming (flat whole-world array, always simulated regardless of distance), which is what makes off-screen corpse decay/behavior correct today; flags that a future distance-culling optimization must preserve "still ticks off-screen," not silently freeze out-of-range animals.
- **`docs/state/terrain-and-world-generation.md`** — added a line noting that a loaded chunk's tree/crop mesh only re-syncs to a newly-derived lifecycle stage on a chop event or chunk reload, not periodically; decided **acceptable as-is** (visual lag only, no data/correctness impact) rather than building a periodic re-resolve pass.

---

## 5. `LOOSE-ENDS.md` cleanup (plan §6)

- Marked the `NpcAgent.beginOreGathering` entry `[x]`, describing the fix in §3.
- Marked the `DecisionContext.extras`/`SimulationEntityRef` entry `[x]` for the trim, but kept the `adoptPlannedAction` half of the same original entry as explicitly **still open** (its own sentence, not silently dropped) — it's a real, separate decision that this plan chose not to make.
- Appended a closing note to the `ResourceDeposits` entry (already `[x]` from plan 198) recording that the cross-session `SaveData.resourceDeposits` follow-up it named is now also done.
- Left every other entry as-is: the remaining open items (garden footprint radius, cave-predator bear species, vegetation instancing, N8AO double-render, melee attack-direction desync, trap durability-on-pickup, off-screen trapping, shader prewarm, `gameLoop.ts`/`interactables.ts` split candidates, river network Etap 7, `trade.ts` gabaryt check) all predate or are unrelated to audits 192–195 and are out of this plan's scope.

---

## 6. Save format — hard cut to v1 (plan §7)

Rewrote `src/persistence/saveData.ts` from scratch: it previously carried a full `v1`→`v27` migration chain (26 versioned type aliases, 26 `isSaveDataVN` guards, ~18 `toVN` migration functions, several `@deprecated` legacy shapes like `LegacySavePlacedFire`/v23's `playerWells` shape). All of that is gone. The module now defines exactly one contract:

- `SaveData` (`version: 1`) — the same field set the old v27 shape had (nothing was dropped; this is a rename/flatten, not a data-loss cut), plus the new `resourceDeposits` field from §3.
- `isSaveData(value)` — a single flat validator (reuses the same per-field structural checks the old code had — `isSaveConfig`, `isPlacedTrapsField`, `isPlayerWellsField`, etc. — none of those were migration-specific, so they carried over unchanged).
- `loadSaveData(value)` — returns the value as-is if `isSaveData(value)` passes, `null` otherwise. **No migration path of any kind.** A save from before this plan (or any real player's existing save, since this ships to production) simply fails to load — this is a deliberate, accepted break, not an oversight; see the plan's own instruction that "ucinamy przeszłość."
- `SaveConfig.settlements` became required (was optional "older saves predate issue 020") — every current save-writer always populates it.

Other files touched to match:
- `src/app/saveState.ts` — `SAVE_VERSION` constant `27` → `1`; added the `getResourceDepletion` dependency and `resourceDeposits` field to `buildSaveData()`.
- `src/app/createApp.ts` — seeds `resourceDepletion` from `initialSave?.resourceDeposits`.
- `src/app/worldBundle.ts` — one doc-comment update (no longer claims `resourceDepletion` is outside `SaveData`).
- `src/persistence/saveData.test.ts` — fully rewritten: the old file was ~30 `describe` blocks exercising the migration chain version-by-version; replaced with round-trip + per-field rejection tests against the single v1 contract.
- `src/persistence/saveSlots.test.ts` — its `config`/save fixtures needed `settlements`/every other now-required field; updated, plus the one `version` expectation (`27` → `1`).
- `src/simulation/types.test.ts` — see §3.

Nothing in `src/persistence/saveDb.ts`/`saveSlots.ts` needed to change — they're already schema-version-agnostic (they call `loadSaveData`/inspect `SaveData` structurally, never a specific version number), except the envelope-vs-legacy-raw-storage detection in `saveSlots.ts` (`isSaveSlotEnvelope`'s `record.version === undefined` check), which is an unrelated, still-current mechanism (envelope vs. flat storage under the old `'current'` key) — left untouched, it isn't part of the save-*data*-version migration chain this plan cut.

---

## 7. Architecture documentation (plan §8)

- **`docs/architecture/ARCHITECTURE.md`** — replaced the "Save schema version history" table (v14→v27 migration-by-migration) with a "Save schema" section describing the v1 hard cut and a few non-obvious persisted/non-persisted facts (NPC runtime state, quest-animal-binding non-persistence, weather's no-save-field design, the new `resourceDeposits` field). Updated the "Persistence" prose to say there is no migration/compatibility story rather than "preserve compatibility with older saves." Updated the "Adding a new system" checklist's persistence question (item 6) to match — no more "what's the compatibility story," just "add the field to v1."
- **`docs/STATE.md`** — "Canonical save schema is v27" → "v1 — a hard cut (plan 201)"; `Household`'s bullet updated to reflect plan 197's rebuild-carry fix (it no longer says "not carried, known gap" — only "not in `SaveData`" remains true); bumped "Last verified" to 2026-08-22.
- **`docs/state/settlements.md`** — the `SettlementEconomy` "Ekonomia" section's trailing "W przeciwieństwie do `Household`" sentence was stale (plan 197 gave `Household` the same in-session carry mechanism, the `Gospodarstwa` section two paragraphs below already said so correctly) — corrected to name the one difference that's actually still true (`SaveData` persistence).
- **`docs/items/CATALOG.md`** — dropped a now-meaningless `(v25)` version citation for `plantedTrees`/`plantedCrops`.

No other documentation needed a correction — `docs/architecture/performance-and-workers.md` and `docs/state/terrain-and-world-generation.md` got the two new doc-only fixes in §4, not corrections of stale claims.

---

## 8. Final consistency check (plan §9)

Checked the full chain `World Time → simulation → authoritative state → entity lifecycle → streaming/rebuild → reconstruction → persistence` for an obvious new seam broken by 196–200 or by this plan's own changes:

- **World Time → simulation**: unchanged by this plan; 196's time-skip gating already verified end-to-end in its own notes.
- **Simulation → authoritative state**: the one new mutation this plan adds (`ResourceDepletionState` now also flows into `SaveData`) uses the exact same map that `mine()` already treats as the single source of truth for player and NPC mining alike — no second writer introduced.
- **Authoritative state → entity lifecycle**: `NpcStateRegistry` (197)/`HouseholdRegistry` carry/`ResourceDepletionState` carry all follow the identical "caller-owned, mutated in place, carried across rebuild, reset only on `resetCollectedItems`" shape — verified `resourceDepletion`'s reset-on-new-world line sits in the same `if (resetCollectedItems)` block as the other three carried collections in `createApp.ts`'s `rebuildWorld()`.
- **Streaming/rebuild → reconstruction**: `createWorldBundle`/`rebuildWorldBundle`'s `resourceDepletion` parameter was already threaded through before this plan (198); this plan didn't touch that wiring, only added the save-time seed/serialize step around it.
- **Reconstruction → persistence**: the v1 hard cut (§6) removes an entire axis of possible drift (26 migration functions that had to stay mutually consistent) without changing what's captured — every field the old v27 shape had is still in v1 under the same name.

No new cross-system inconsistency found. No new plan spun off from this check.

---

## Verification

### Technical

`npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` all green (1619 tests). `saveData.test.ts`'s ~30 migration-chain `describe` blocks were replaced by round-trip/rejection tests for the single v1 contract, at roughly the same test count.

### Not browser/manually verified

- The `beginOreGathering` fix only changes behavior in the already-narrow edge case (near-full NPC carry + multi-unit yield); not reproduced in a live session.
- `resourceDeposits` save/load round-trip is covered by the `saveData.test.ts` unit tests (serialization shape + rejection of malformed entries) but not exercised through an actual Save → Continue cycle in the browser.
- The save-format hard cut means **any existing save from before this change will fail to load** (`loadSaveData` returns `null`) — this is intentional per the plan, but is a real, user-visible consequence the first time this ships. Suggested manual check: save a game, reload the page, Continue — should round-trip cleanly on a fresh (post-cut) save; an old save (if one exists in a test browser profile) should be reported as unreadable rather than silently corrupting anything.

### Documentation

`LOOSE-ENDS.md`, `STATE.md`, `ARCHITECTURE.md` all verified against current code as part of this plan (§4/§5/§7 above).

---

## Final reconciliation report

| Finding | Final status | Resolution |
|---|---|---|
| Time-conversion duplication | resolved | 192 |
| `PlayerNeeds` hardcoded day length | resolved | 192 |
| Time-skip needs/economy double-counting | resolved | 196 |
| Fauna unthrottled during time-skip (P0) | resolved | 196 |
| Fauna missing time-skip catch-up | resolved | 196 |
| Time-skip water-drink replay unconditional | obsolete | superseded by 196's gating fix |
| `NpcAgent.die()` no propagation hook | intentionally deferred | 197 §6 (reasoned decision, not a gap) |
| `DecisionContext.extras`/`.entity` dead | resolved | 201 (this plan) |
| NPC bypasses `adoptPlannedAction` | deferred | future plan, if/when action-lifecycle code is next touched |
| Two combat execution shapes | intentionally deferred | acceptable per 193's own disposition |
| Resource-contention order undocumented | intentionally deferred | acceptable per 193's own disposition |
| NPC runtime state / death not surviving streaming | resolved | 197 |
| Dropped instance items lose durability | resolved | 199 |
| Quest-giver name collision | resolved | 199 |
| `QuestManager.animalTargets` stale on rebuild | resolved | 199 |
| Ore-deposit farming exploit + rebuild reset | resolved | 198 |
| Dead NPC no removal path | intentionally deferred | 197 §6 (moot without a corpse/loot system) |
| Fauna non-chunk-streaming undocumented | resolved | 201 (doc added) |
| Tree/crop visual catch-up lag | intentionally deferred, documented | 201 (decided acceptable as-is, doc added) |
| Two "drop everything" mechanisms | resolved | 199 |
| `BenchmarkHost.chunkManager` stale closure | resolved | 195 |
| `Household` rebuild-carry gap | resolved | 197 §8 |
| `worldConfig` terrain fallback bug | resolved | 195 |
| Player starvation/dehydration duration not persisted | resolved | 200 |
| `NpcAgent.beginOreGathering` add/remove mismatch | resolved | 201 (this plan) |
| Save schema documentation drift (v25/v26) | resolved | 195, then superseded by 201's hard cut |
| Save format v1–v27 migration chain | removed | 201 (hard cut) |
| `ResourceDeposits` cross-session persistence | resolved | 201 (this plan) |
| All remaining P2/P3 findings from 192–195 not listed above | intentionally deferred (acceptable) | original audits' own disposition, unchanged |

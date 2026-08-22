# Implementation notes — 194 — Entity Identity & Lifecycle Architecture

Audit only, per plan scope ("Nie implementować dużego refaktoru w ramach audytu"). Investigation was split into four parallel, read-only sub-audits, one per entity family named in the plan's own taxonomy, run after plan `193` (simulation architecture) was merged to `main`:

1. **NPC / Player / Settlements / Households** — `src/ai/NpcAgent.ts`, `src/settlement/*`, `SettlementsManager`/`EconomyRegistry`/`HouseholdRegistry`, player identity/lifecycle only (plan §1-9, §11-17).
2. **Fauna full lifecycle** (living → dead → corpse → remains → removed) — `src/fauna/*`, `AnimalSpawner.ts`, `harvestedRemains.ts`, `corpseDecayFx.ts` — the plan's own named "important point of comparison" for render/simulation separation (plan §13).
3. **Trees / Crops / World resources** — `treeLifecycle.ts`, `cropLifecycle.ts`, `plantedTrees.ts`/`plantedCrops.ts`, `resourceDeposits.ts`, `chunkManager.ts` streaming.
4. **Items / dropped-world-items / projectiles / traps / temporary world objects** + a dedicated repo-wide §14 disposal sweep (Three.js/DOM resource cleanup across every entity family, not just this sub-audit's own scope).

Per plan instruction, this audit does **not** repeat plans 192/193/195 findings without need — each sub-audit was briefed with those audits' relevant findings and told to build on them only where its own deeper identity/lifecycle-specific trace added material not previously captured. Two small, well-isolated correctness bugs surfaced during the audit were fixed directly in this session (§6); everything else is scoped to a named follow-up plan or recorded as acceptable per §7.

---

## 1. Entity Taxonomy (consolidated)

| Entity | Persistent? | Simulated? | Rendered? | Streamed? | Reconstructable? | Lifecycle model | Identity model |
|---|---|---|---|---|---|---|---|
| NPC (`NpcAgent`) | No (needs/HP/vigor/phase/inventory never in `SaveData`) | Yes, per-frame | Yes (GLB/capsule + CSS2D label) | Yes — full dispose+recreate on settlement stream-out/in | Deterministic id/role/name; **not** runtime physiology/phase | Living, single terminal `dead`, no removal | Stable derived id `${settlementId}:npc:${i}`; quest/dialogue instead key on `name` (non-unique) |
| Player (`PlayerController`) | Partial — position/yaw/pitch, hunger/thirst/vigor, inventory, skills persist; HP/stamina do not | Yes | Yes | No — singleton, outlives `WorldBundle` | N/A (never destroyed mid-session) | No FSM; app-session-long | No id — process-singleton, object-reference identity |
| Settlement | Derived (deterministic seed+cell) | N/A (container) | Yes | Yes, home exempt | Fully, pure fn of cell | load → active → unload → (reload = fresh build) | `cellKey(cell)`, seed-scoped via cache invalidation |
| Household | No (`SaveData` has no household fields) | Yes (mutated by NPC actions) | No (props presentation-only) | **No** — registry-scoped, survives settlement stream-out/in | Deterministic id, fresh jittered stock only on `SettlementsManager` recreation | Created once per manager lifetime, mutated forever | Deterministic string id, registry-backed |
| SettlementEconomy | Yes (`SaveData.settlementEconomies` v12+), carried across in-session rebuild | Yes | No | No — same registry pattern | Snapshot-restorable | Same as Household + save + rebuild-carry | Deterministic string id |
| Wild `AnimalAgent` | No | Yes, unconditionally | Yes | No (flat whole-world array, no chunk streaming) | No — full respawn, no state carried | alive → dead → corpse(fresh→rotting→bones) → removed | `${kind}-${n}` per-build counter, **not stable across rebuild** |
| Livestock `AnimalAgent` | No (agent itself) | Yes | Yes | No | Full respawn, but deterministically re-derivable | Same state machine | Same counter scheme, but re-derivable from `homePlaceId` |
| `PreySpawner` (habitat) | **Yes** (`SaveData.spawnPoints` v17) | Yes (day-granularity) | Yes (prop) | No | Yes — genuinely reconstructed | `active→depleted→disabled→recovering→active` | Deterministic (settlement+type) |
| Corpse (unharvested) | No | Yes, same object as living agent | Yes, distance-gated FX only | No | No — lost on any rebuild | `fresh→rotting→bones→removed` | Same `animalId` as the animal |
| Procedural tree | Overrides only (sparse) | Lazy, pure fn of `elapsedDays` | Yes | Yes (chunk) | Yes — seed+terrain+overrides | Procedural default + sparse override | Deterministic `seed:x:z:species` |
| Planted tree | Fully persistent (placement) + override (stage) | Same, anchored at plant time | Same | Yes (chunk) | Yes | Same state machine, planted placement source | Namespaced `planted:seed:x:z` |
| Wild crop | Removal only (`removedCropIds`) | Lazy, pure cyclic fn | Yes | Yes (chunk) | Yes — cycles forever unless removed | Pure cyclic derivation | Deterministic `cx:cz:cropN` |
| Planted crop | Fully persistent (placement) | Same cyclic derivation | Same | Yes (chunk) | Yes | Same, no removal-id needed | Namespaced `planted-crop:seed:x:z` |
| World resource / ore deposit | **Not persisted at all** — session-only | No time-derivation; mutated by `mine()` | Yes (GLB pile + label) | Yes, own radius streaming (not chunk) | Fresh type/richness every dispose/rebuild, **depletion lost** | Finite, event-driven-only counter | `resource_{rx}_{rz}` — **no seed folded in** |
| Inventory item (stack) | Yes | No | HUD only | n/a | Yes | Count-only | None — fungible |
| `ItemInstance` (traps/weapon-maintenance) | Yes | No | Held/placed only | n/a | Yes | created → held/stored → (placed\|sold\|dropped\|broken) → removed | Stable `id` (`item:<ts>:<n>`) |
| `DroppedItem` | Yes (`SaveDroppedItem`) | Minimal (fall tween) | Yes | No | Yes | spawned → landed → collected → removed | Own id, **disconnected from any source `ItemInstance.id`** |
| `PlacedTrapRecord` | Yes | Yes (weather wear/detection) | Yes | No | Yes | place → active → (captured\|broken) → collected | **Reuses source `ItemInstance.id`** — the reference pattern |
| `PlacedFire`/`Tent`/`Container`/`PlayerWell`/`PlayerGarden`/`DryingRack`/`Hive` | Yes (field-level, verified) | Varies (real-time / lazy) | Yes | No, own carry-across-rebuild snapshot | Yes | See §4 | Own deterministic/monotonic id |
| Projectile | **No** | Yes, per-frame | **No mesh at all** | n/a | n/a (sub-second) | fired → flight → (hit\|expire) → removed | Ephemeral, `gameLoop.ts`-local only |

---

## 2. Entity Contract Map (primary deliverable, plan §17)

| Entity | Identity | Persistent state | Runtime state | Lifecycle owner | Streamed | Time-skip | Render |
|---|---|---|---|---|---|---|---|
| NPC | Stable id + non-unique display `name` used for quest/relation identity (Finding 2) | None | `NpcAgent` fields, authoritative only while instance alive | `SettlementsManager`/`createSettlement` (construction), `NpcAgent` (transitions) | Yes — full dispose+recreate, **loses all runtime state including death** (Finding 1, P0) | `resolveTimeSkip`, dead-guard **fixed this session** | GLB/capsule + CSS2D label |
| Player | None (singleton) | Position/yaw/pitch, hunger/thirst/vigor, inventory, skills; not HP/stamina | `PlayerController` instance | `createApp.ts` (creation/dispose) | No | Via `dayNight`/`gameLoop` | Mesh + label |
| Household | Deterministic id, registry-backed | None (known gap, plan 195 Finding B) | `.stock`/`.water`, mutated in place | `HouseholdRegistry` on `SettlementsManager` | Survives settlement stream-out/in | N/A | Presentation-only props |
| SettlementEconomy | Deterministic id | Yes, v12+, carried across rebuild | Mutated in place | `EconomyRegistry` | Survives settlement stream-out/in | N/A | None directly |
| Settlement | Deterministic `cellKey` | Derived, not stored | Props/group/queues/npcs/livestock | `SettlementsManager` | Yes, home exempt | Forwarded per-NPC | Prop group |
| Wild `AnimalAgent` | Per-build counter, **not stable across rebuild** | None | health/life/corpsePhaseValue/timeSinceDeath | `AnimalAgent` (alive↔dead↔decay) + `Fauna` (removal) | No (flat array) | Runs at `worldDt` — unthrottled during skip (plan 193 P0, shared root cause) | mesh + rotFx/remains/bloodSplat |
| `PreySpawner` | Deterministic | **Yes**, v17 | `daysSinceLastRespawn` (not persisted) | `createFauna.ts`'s `updateSpawners` | No | Day-granularity, resilient to large `dayDelta` | Prop + label |
| Corpse | = its animal's id | None (lost on any rebuild — deliberate) | phase/timer/buried | `AnimalAgent` (phase) + `Fauna` (removal) | No | Scaled during skip (Finding, P1 — see §5) | Tinted mesh → rot FX → bones |
| Quest animal binding | `questId → animalId` string | Not persisted (deliberate) | Map entry | `QuestManager` | N/A | N/A | — **stale across mid-session rebuild** (Finding, P1) |
| Procedural/planted tree | Deterministic or stored namespace, never collides | Sparse override / full placement | None (no separate runtime object — lazy) | `TreeLifecycle` (growth) + `advanceHarvest` (chop) | Yes, via chunk | Correct — pure fn of `elapsedDays` | Instanced/individual mesh, lags organic growth until reload/chop (Finding T1, P2) |
| Wild/planted crop | Deterministic or stored namespace | Removal-only / full placement | None | `resolveCropStage` + `chunkManager.harvestCrop` | Yes, via chunk | Correct — pure cyclic fn | Per-placement mesh, same lag as trees |
| World resource / ore deposit | `resource_{rx}_{rz}`, no seed folded in | **None** | `remaining` hit count, lives only on live `DepositInstance` | `ResourceDeposits.mine()`/radius `update()` | Yes, own radius streaming | N/A (event-driven only) | GLB pile + label, discarded every unload/reload **including `remaining`** (Findings W1/W2, P1/P2) |
| `ItemInstance` | Stable `id` | `Inventory.instances`/`PlacedTrapRecord`/container contents | Same object, no copy | `Inventory`/`PlacedTraps`/`PlacedContainers` | No | n/a | Held-tool visual or placed-trap prop |
| `DroppedItem` | Own id, disconnected from source `ItemInstance.id` | `SaveDroppedItem[]` | Fall-tween state | `DroppedItems` | No | n/a | `createItemMesh` — **loses instance identity/durability on round-trip** (P0, already tracked, extended) |
| `PlacedTrapRecord` | Reuses source `ItemInstance.id` — reference pattern | Full record incl. durability | Cooldowns/attempts (runtime-only, intentional) | `PlacedTraps` | No | Yes, via `worldDt` | `trapProp.ts` |
| Projectile | Ephemeral, `gameLoop`-local | None | `activeProjectiles` array | `gameLoop.ts` inline | n/a | n/a | None — no mesh at all |

---

## 3. World Existence → Runtime → Render (plan §2/§4/§5, by family)

- **NPC/Settlement**: `World truth (seed+cell) → SettlementDef (pure fn) → Household/SettlementEconomy (registry, survives settlement unload) → NpcAgent instances (constructed fresh, no registry, DOES NOT survive settlement unload) → mesh/label`. The registry split is deliberate and correct for Household/Economy; NPC has no equivalent registry underneath it, which is the root of Finding 1.
- **Fauna**: no independent world-truth layer distinct from the runtime entity for individual animals — simulation entity and runtime representation are the *same object*. The only thing that survives above an `AnimalAgent`'s lifetime is `PreySpawner` (genuinely persisted/reconstructed).
- **Trees/crops**: `World truth (seed+terrain+override|placement) → Simulation entity (presence + override Map, pure resolve()) → Render (built fresh from resolve() each time)`. The "simulation entity" essentially collapses into "world truth + a pure function" — the intended lazy model, and it holds correctly (§5 below).
- **Ore deposits**: world truth is only `(seed,cell)→type/richness` (pure/deterministic); *depletion* (`remaining`) lives only in the runtime `DepositInstance` — there is no persistent-state layer for it at all, unlike every other family in this audit.
- **Items/placed objects**: `SaveData.<x> → manager.spawn(record) → mutation via manager methods → manager.nodes() → SaveData`, uniform and symmetric across all 9 placed-object managers. `Inventory` itself has no separate "runtime" vs "saved" representation at all — mutations *are* the persistent state, read straight through by `toJSON()`. Cited as the cleanest identity/persistence model in the whole audit.

---

## 4. Lifecycle State Machines (plan §6, condensed)

```text
NPC:        created → active (phase FSM) → dead (terminal, no removal, no further transition)
Fauna:      alive → dead → corpse(fresh→rotting→bones) → removed
              also: dead → buried (short-circuit) | dead → harvested (own 90s TTL)
Tree:       sapling → young → mature → old (time-driven)
              mature/old → limbed → felled → harvested (event-driven, chop)
              harvested → sapling (time-driven, self-regenerating — same mechanism as growth)
Crop:       young → mature → spoiled → young ... (purely cyclic, time-driven, no terminal state;
              removal modeled entirely outside the state machine via removedCropIds/splice)
Ore deposit: spawned(remaining=N) → spawned(remaining-1) → depleted (finite, event-driven-only,
              NO time-derivation — deliberate asymmetry vs. wood's renewability)
Item:       acquired → held → (consumed|traded|dropped|crafted-input)
ItemInstance: created → held → (placed-as-trap|sold|dropped|broken@durability 0)
DroppedItem: dropped(falling) → landed → collected
Projectile: fired → flight → (hit|expired) → removed
```

Every transition funnel in every family traced to a single owner function, with two exceptions worth naming: (a) `TreeLifecycle.resolve()` is simultaneously a getter and a self-pruning override writer (a "pure query" that isn't pure w.r.t. the override Map — documented, safe, idempotent, P3); (b) settlement/chunk both call `treeLifecycle.registerPresence`/`unregisterPresence` against the one shared instance — a duplicated call-site pattern, not a duplicated mechanism (acceptable, two genuinely different streaming systems).

---

## 5. Streaming, Time-Skip, and Off-Screen Continuity (plan §8/§9/§12)

| Family | Chunk/settlement streaming | Time-skip behavior | Off-screen/reload continuity |
|---|---|---|---|
| NPC | Full dispose+recreate on settlement unload/reload — **loses all runtime state incl. death** (Finding 1, P0) | `resolveTimeSkip` now dead-guarded (fixed this session); needs/vigor/schedule still double-tick vs. live update during a skip (plan 193, unchanged, out of this plan's scope) | Reload continuity broken (Finding 1); off-screen (settlement still loaded) is correct — full FSM keeps ticking |
| Fauna | **No chunk streaming at all** — flat whole-world array, always simulated regardless of distance (undocumented — new doc-gap finding, P2) | Full behavior tree unthrottled during skip (plan 193 P0, unchanged); corpse decay inherits it and can be **fully disposed within a few real seconds** of an 8h skip (extends 193's P0 with a disposal-level consequence, P1) | No true streaming boundary exists to test; off-screen continuity within a session is correct (nothing ever stops ticking); across a rebuild, individual animal/corpse state is deliberately not preserved (acceptable, matches livestock/QuestManager's own documented assumptions) |
| Settlement quest bindings | `QuestManager.animalTargets` invalidated only on save/load construction, **not** on mid-session rebuild | N/A | Mid-session same-seed rebuild can silently misbind or soft-lock a wild-fauna quest (new finding, P1) |
| Trees/crops | Chunk unload/reload correctly reuses the same deterministic/stored id — **cannot create a duplicate entity**, override survives unload (verified end-to-end) | N/A — pure fn of `elapsedDays`, zero per-frame cost, correct through any skip length by construction | Both reload and off-screen continuity traced and confirmed correct — the reference-quality case in this audit |
| Ore deposits | Own radius-based streaming (not chunk) discards `remaining` on every despawn/respawn cycle — **resets to full on ordinary walk-away/return** (Finding W2, P1, farming exploit) | N/A (event-driven only) | Broken at both its own streaming radius (W2) and full `WorldBundle` rebuild (Finding W1, P2 — reachable via a cosmetic flat-shading toggle with no confirm dialog) |
| Placed objects (fires/traps/containers/wells/gardens/racks/hives) | Not chunk-streamed; full dispose+recreate only on `rebuildWorldBundle`, with a field-level-verified carry snapshot (`nodes()` before dispose, threaded into the new `create*` call) | `PlacedTraps` correctly scales with `worldDt`; `DryingRacks`/`Hives` are lazy absolute-timestamp-derived (zero ticking, correct through any gap by construction — the strongest positive pattern found for this plan's central "no observer must not stop simulation truth" principle) | Verified correct at the field level for `PlacedTraps`/`PlacedContainers`; `PlacedFires`' lit/fuel state is deliberately not persisted (documented) |
| Dropped items | Not chunk-streamed, flat array always live | N/A | Reload continuity provably broken for instance-backed kinds — see §6/LOOSE-ENDS |
| Projectiles | N/A (sub-second lifetime) | N/A | `activeProjectiles` not cleared on `rebuildWorldBundle` — cosmetic cross-world continuity glitch only, no leak (P3, acceptable) |

---

## 6. Fixes made this session

Both are small, isolated, one-directional guards with no design decision attached — matching the plan's "fix now" bar (distinct from the several P0/P1 findings below that need a dedicated follow-up plan because they touch save schema, a new registry, or balance judgment).

1. **`src/ai/NpcAgent.ts`'s `resolveTimeSkip()`** — added `if (this.health.dead) return` at the top, mirroring the identical guard `update()` already has (`:1712`). Before this fix, a rest/wait time-skip performed after any NPC died would teleport that NPC's corpse (still tipped on its side) to its scheduled destination and reset `phase` to `'choose'` — inert again on the next `update()` call, so not a resurrection, but a reproducible visual bug. Sub-audit finding: plan 194 §9/§12 (NPC/Settlements sub-audit, Finding 2).
2. **`src/app/createApp.ts`'s `rebuildWorld()`** — `player.setPosition(...)` (teleport to home spawn) is now gated behind `if (resetCollectedItems)`, matching every other "this is a genuinely new world" reset in the same function. Before this fix, any in-session terrain-param rebuild on the *same* seed (e.g. the World Config screen's flat-shading toggle, or any debug-GUI terrain control) unconditionally teleported the player back to the home settlement's spawn point, discarding their actual position — contradicting `docs/ARCHITECTURE.md`'s documented "`PlayerController` ... survives a terrain rebuild" contract. `player.setGround(...)`, called immediately above, already re-snaps the player's height at their *existing* x/z via `snapToGround()`, so no additional height-resample call was needed for the `false` branch. Sub-audit finding: plan 194 §12 (NPC/Settlements sub-audit, Finding 5) — code was brought into compliance with the already-correct documented contract rather than updating the doc.

No other code was changed. Everything else below is recorded as a finding with an explicit follow-up/acceptable classification, per the plan's "Nie implementować dużego refaktoru w ramach audytu" scope limit.

---

## 7. Prioritized Findings, P0–P3

### P0 — Correctness

| # | Finding | Evidence | Impact | Decision |
|---|---|---|---|---|
| 1 | **NPC runtime state (incl. death) does not survive ordinary settlement streaming, only save/load.** Every non-home settlement is fully disposed and reconstructed on unload/reload (walking >420m away and back is enough, same session) — no registry backs NPCs the way `HouseholdRegistry`/`EconomyRegistry` do. | `SettlementsManager.ts:378-400`, `createSettlement.ts:510-540,712-733`, `NpcAgent.ts:930-947` (unconditional fresh construction); contrast `household.ts:171-194`/`economy/registry.ts:19-33`'s explicit survive-this-cycle design | A killed NPC is **fully alive again with full HP** the next time the player revisits that settlement, no reload required. Needs/vigor/stamina/schedule/quest-marker/carried inventory silently reset every such cycle. Undermines any future feature depending on NPC death being durable within a session (defense quests, "protect the village" objectives). Strictly worse than the already-logged "no death-propagation hook" (plan 193) — even with that hook, death itself doesn't stick. | **follow-up plan** (`arch--npc-streaming-state-continuity`, fold with plan 193's recommended `arch--npc-death-propagation` since both concern death durability) |
| 2 | **Dropped instance-backed items (traps, weapon-maintenance kinds) lose `durability`/`sharpness` identity on drop→pickup**, confirmed across 4 call sites. | `dropItemStack` (`inventoryWiring.ts:122-148`), pickup (`gameLoop.ts:1219-1223`), `grantItem`'s overflow fallback (`createApp.ts:493-500`), and `consumeDrop()`'s hotkey (`gameLoop.ts:1381-1393`, silently *skips* instance-backed kinds instead of losing data) | A player who drops a sharpened/worn axe/knife/trap gets it back at full default condition — silent value/consequence loss. Already tracked (`LOOSE-ENDS.md`, 2026-08-21); this audit reframes it as a **§3 identity-loss problem** (the world-side record was never given the instance's identity to preserve, so pickup creates a logically new entity, not a lossy reconstruction of the old one) and confirms the exact blast radius. `PlacedTraps.place()`/`.collect()` (`createPlacedTraps.ts:201-217`, `gatheringActions.ts:94,101`) solves the identical problem correctly one file away — the reference pattern to copy. | **follow-up plan** (already staged; extend `DroppedItem`/`SaveDroppedItem` with an optional `instance?: SaveItemInstance` field mirroring `PlacedContainerRecord`'s shape) |

### P1 — Architectural

| # | Finding | Evidence | Impact | Decision |
|---|---|---|---|---|
| 3 | Quest-giver/relation identity is a non-unique display-name string, not the stable `NpcAgent.id`, and collides with the general procedural name pool. | `characters.ts:41-51` (4 reserved names), `nameCultures.ts:12-21`/`families.ts:271-309` (`generateNpcName` draws from the same pool, no exclusion list), `QuestManager.ts:242-485` (name-keyed lookups) | For an unlucky seed, an unrelated procedural NPC anywhere in the world could get the real quest giver's marker/dialogue and share their relation score. Plausible (seed-dependent), not exotic. | **follow-up plan** (cheapest fix: exclude the 4 reserved names from `generateNpcName`'s candidate pool) |
| 4 | Mid-session `rebuildWorldBundle()` doesn't invalidate `QuestManager.animalTargets` for wild-fauna kill/find quests — only the save/load constructor path does. | `QuestManager.ts:159-176` (constructor-only invalidation) vs. `createApp.ts:707-722` (rebuild skips `questManager.reset()` when `resetCollectedItems=false`, the World Config screen's default); `createFauna.ts:506,532` (`nextAnimalId` resets to 0 per kind per build) | A same-seed rebuild (e.g. a non-seed terrain toggle sharing this handler) can silently rebind an active `kill_target_animal`/`find_animal` quest to an unrelated new animal, or soft-lock it permanently. | **follow-up plan** (reuse the existing constructor-side invalidation logic, call it from `rebuildWorld()`/`rebuildWorldBundle()` too) |
| 5 | Fauna's already-known unthrottled-time-skip bug (plan 193 P0) has a **disposal-level**, not just behavioral, consequence for corpses: decay is fed the same over-scaled `worldDt` as movement/combat. | `AnimalAgent.ts:1307-1313`, `gameLoop.ts:1437,1602`, `timeSkip.ts:49-52`'s contradicted design comment | A corpse produced right before an 8-hour rest skip can fully decay and be **permanently disposed** (mesh/GLB pile gone, unrecoverable) within a few real seconds — before the skip overlay even finishes fading in. | **follow-up plan** (tracked together with plan 193's fauna time-skip-gating fix — not a fauna-lifecycle-only patch, since the root cause is shared with movement/combat) |
| 6 | Partially-mined ore deposits reset to fully stocked on **ordinary walk-away/return** within the deposit's own streaming radius (not just a settings/rebuild trigger). | `resourceDeposits.ts:183-219,239-248` (`despawn()` discards the live `remaining`; `spawnSync` always recomputes `hitsForRichness` fresh) | Makes ore effectively infinitely farmable by walking back and forth across `UNLOAD_RADIUS` (220 units) — reachable through ordinary play, not an edge case. The concrete, more severe cousin of plan 193's previously-unconfirmed Finding 7/8. | **follow-up plan** (small internal `Map<id, remaining>` consulted by `spawnSync`, same shape as `TreeLifecycle`'s override Map) |

### P2 — Maintainability / narrower correctness

| # | Finding | Evidence | Decision |
|---|---|---|---|
| 7 | `rebuildWorldBundle` has no carry-snapshot for `ResourceDeposits` depletion, unlike every other session-durable `WorldBundle` member — confirms/sharpens plan 193's unconfirmed Finding 7/8. Concrete, unguarded trigger: the World Config screen's flat-shading toggle has no confirm dialog (unlike seed/home-size changes in the same file). | `worldBundle.ts:540,570`; `WorldConfigScreen.vue:18-19,46-62` | **follow-up** (fold into the same plan as Finding 6 above — both are `ResourceDeposits` durability gaps, likely fixed together) |
| 8 | Dead NPC has no removal/disposal path at all (taxonomy inconsistency vs. fauna's full corpse pipeline) — currently moot in practice because Finding 1 already erases the state before it could accumulate, but becomes directly relevant once Finding 1 is fixed. | `createSettlement.ts:597-623` (dead NPCs stay in the per-frame O(n²) separation loop forever); contrast `createSettlement.ts:634-647`'s `readyToRemove()`-array-compaction for `livestock` | **acceptable today**; bundle into Finding 1's follow-up as "do this too if fixing durability" |
| 9 | Fauna has no chunk-based streaming at all (flat whole-world array, always simulated) — architecturally sound, but not stated anywhere in `docs/architecture/performance-and-workers.md`/`ARCHITECTURE.md` (not exhaustively re-checked, but not found during this fauna-scoped pass). | `createFauna.ts:810-827`, `gameLoop.ts:1602` | **follow-up (doc-only)** — a short paragraph would prevent a future distance-culling optimization from silently breaking corpse decay's currently-correct "off-screen still ticks" property |
| 10 | Living-stage tree/crop growth (sapling→young→mature→old, crop cycling) is always correctly *derived*, but the rendered mesh for an already-loaded chunk never opportunistically re-syncs to a newly-derived stage — only chop events or a chunk reload refresh the visual. No data/correctness impact, purely a presentation lag. | `chunkManager.ts:1714-1721` (update loop never re-walks already-loaded chunks' tree/crop meshes) | **acceptable**, pending an explicit doc decision (either implement periodic catch-up, or document the "visual catches up on next rebuild/chop" contract as intentional) |
| 11 | Two independent, behaviorally-divergent "drop everything" mechanisms: `dropItemStack` (instance-aware) vs. the raw `[G]`-style `consumeDrop()` hotkey (stack-only, silently skips instance-backed kinds). No data loss today, but risks the P0 fix (Finding 2) only landing in one path. | `gameLoop.ts:1381-1393` vs. `inventoryWiring.ts:122-148` | **follow-up**, bundle with Finding 2's fix so both drop paths get the instance-aware behavior in one pass |

### P3 — Optional / cosmetic (all classified acceptable — recorded for completeness per the plan's Evidence Standard, no action taken)

- Player HP/stamina not persisted across save/load, unlike hunger/thirst/vigor which do carry over (`saveData.ts:28,234`) — likely intentional (avoids reloading into a near-death state), undocumented; suggest a one-line doc note next time `docs/state/player-systems.md` is touched.
- `bury()`'s corpse-interaction channel doesn't call `holdCorpse()`/`releaseCorpseHold()` the way `harvestMeat()` does — a ~1.5s window where a corpse's natural linger timer could expire mid-bury; the existing re-check prevents any crash, only a silent no-op with no player feedback (`survivalActions.ts:58-62` vs. `88-105`).
- `NpcAgent`'s public `readonly health`/`stamina`/`vigor` fields expose mutable inner objects — convention-enforced boundary, not type-enforced (already logged, plan 193).
- `TreeLifecycle.resolve()` conflates read and write (self-pruning override) — intentional, documented, always converges, safe.
- Settlement landmark trees share the procedural tree-id namespace (`makeTreeId(seed,x,z,species)`) — safe today only because settlement/chunk-vegetation placement footprints are mutually exclusive; no observed collision, worth a comment if that invariant is ever weakened.
- `activeProjectiles` not cleared on `rebuildWorldBundle` — a stale in-flight arrow keeps flying into the new world and drops its ammo there on expiry; no leak (no GPU resource on a projectile), no crash, trivial one-line fix if anyone is already touching that call site.
- Harvested-remains meat-scrap visual count doesn't track the actual granted item count — purely cosmetic, correctly separated from the real grant logic (`harvestedRemains.ts`'s decorative `meatScrapCount()` vs. `survivalActions.ts`'s actual `inventory.add(...)` call).
- Per-frame linear scans for item-target resolution (`interactables.ts:554-573`) and the fauna→NPC damage callback's O(settlements×NPCs) scan (plan 193) — not a demonstrated problem at current scale, full perf audit explicitly out of scope.

### Verified clean (no finding — recorded per Evidence Standard)

Render/simulation separation for corpse decay (unit-tested design contract, `corpseDecay.test.ts`); fauna disposal/GLB-template-sharing (no leaks, async-load races correctly token-guarded); tree/crop reload and off-screen continuity (traced end-to-end, override survives unload, no duplication risk); every placed-object manager's disposal ordering (entity-removed vs. mesh-detached vs. GPU-disposed correctly separated, `AnimalAgent`/`createFauna.ts`'s `disposeAgent()` cited as the reference pattern); no listener/callback-registration leaks found anywhere in scope (every hook is a plain function reference passed once at construction, never `addEventListener`/`subscribe`); `PlacedTraps`/`PlacedContainers` carry-across-rebuild verified correct at the *field* level, not just existence; cross-system consequence chains (trap capture→animal death, bait return, harvest→inventory, corpse→predator-diet gating, tree-chop→resource yield) all single-owner, no propagation gap found; `Inventory`'s persistence model (mutation *is* the persisted state, no reconstruction step) is the cleanest pattern in the whole audit.

---

## 8. Refactor Candidates (plan §21, consolidated)

| Candidate | Problem | Proposed boundary | Risk | Effort | Priority |
|---|---|---|---|---|---|
| NPC runtime-state registry mirroring `HouseholdRegistry`/`EconomyRegistry` | Finding 1 | Small `NpcStateRegistry` on `SettlementsManager`, `getOrCreate(id, seedFields)`, snapshotted in `NpcAgent.dispose()`, consumed in the constructor | Medium — must not reopen plan 193's `resolveTimeSkip` double-counting | M | P0 |
| Extend `DroppedItem`/`SaveDroppedItem` with an optional instance payload; route `consumeDrop()` through the same instance-aware logic | Findings 2, 11 | `instance?: SaveItemInstance` field, threaded through `drop()`/`collect()`, both drop entry points | Low — additive, optional field | S–M | P0 |
| Reserved-name exclusion in `generateNpcName`'s candidate pool | Finding 3 | Filter `RESERVED_CHARACTERS` out per culture before rolling | Low | S | P1 |
| Invalidate `QuestManager.animalTargets` from `rebuildWorld()`, not just the constructor | Finding 4 | Reuse the existing non-livestock-kind invalidation logic at a second call site | Low | S | P1 |
| `ResourceDeposits` sparse `remaining` snapshot, both across `rebuildWorldBundle` and across its own despawn/respawn streaming cycle | Findings 6, 7 | Internal `Map<id, remaining>` consulted by `spawnSync`; separately, a carry-snapshot mirroring `worldBundle.ts:532-536`'s existing pattern | Low | S | P1/P2 |
| Fauna time-skip throttling/catch-up (gate `worldDt` behind `timeSkip.isActive()`, or add a fauna-side catch-up mirroring `NpcAgent.resolveTimeSkip`) | Finding 5 | Belongs with plan 193's already-recommended `arch--timeskip-simulation-gating` — not a fauna-lifecycle-only patch | Medium — gameplay-balance-sensitive | M | P1 (tracked via plan 193's follow-up) |
| Document fauna's whole-world (non-chunk-streamed) simulation granularity | Finding 9 | One paragraph in `docs/architecture/performance-and-workers.md` | None (doc-only) | XS | P2 |
| Explicit decision on living-stage tree/crop visual catch-up | Finding 10 | Doc-only if "acceptable as-is" is confirmed; otherwise a periodic re-resolve pass | None (doc) / Low (implement) | XS / M | P2 |

No shared `EntityLifecycle`, no common `Entity` base class, no ECS, no global lifecycle manager, no global event bus, no NPC/fauna lifecycle rewrite, and no full save/load rewrite is proposed for any of the above — every candidate reuses an existing narrow mechanism already established elsewhere in the codebase (`HouseholdRegistry`/`EconomyRegistry`'s carry pattern, `PlacedTraps`' instance-identity pattern, `TreeLifecycle`'s override-Map pattern, `QuestManager`'s own existing invalidation logic).

---

## 9. Documentation

No `docs/ARCHITECTURE.md` correction was needed for the player-teleport discrepancy found during the audit (sub-audit A's Finding 5) — the code was brought into compliance with the doc's already-correct stated contract instead (§6 above). The one remaining doc gap from this audit (`ResourceDeposits`' rebuild-carry contract, Finding 7) is left for whichever follow-up plan implements Findings 6/7, so the doc update and the behavior it describes land together rather than documenting an intentionally-temporary state.

---

## 10. Follow-up Architecture

```text
fix now:
  - NpcAgent.resolveTimeSkip() dead-NPC guard (Finding 2 of sub-audit A) — done, see §6
  - createApp.ts's rebuildWorld() player-teleport gating (Finding 5 of sub-audit A) — done, see §6

follow-up plan:
  - arch--npc-streaming-state-continuity (Finding 1, P0)
    NPC runtime state, including death, does not survive settlement unload/reload.
    Fold with plan 193's already-recommended arch--npc-death-propagation — both concern
    death durability, and the death-propagation hook is moot until death itself sticks.
    Also covers Finding 8 (dead-NPC removal path) as a "do this too" addendum.

  - items--dropped-instance-item-condition (Finding 2, P0 — already staged, LOOSE-ENDS 2026-08-21)
    Extends with: exact 4-call-site blast radius, PlacedTraps as the reference pattern,
    and Finding 11 (consumeDrop() hotkey divergence) as a bundle-in.

  - arch--npc-quest-identity-hardening (Findings 3, 4, P1)
    Reserved-name exclusion in generateNpcName, and QuestManager.animalTargets
    invalidation on mid-session rebuild — two small, independent identity-collision
    fixes that share a "quest binding survives a rebuild it shouldn't assume stability
    across" theme, worth one small plan.

  - arch--resource-deposit-durability (Findings 6, 7, P1/P2)
    ResourceDeposits needs both an own-streaming-radius-survives-despawn snapshot
    (the farming-exploit-severity finding) and a rebuildWorldBundle carry snapshot
    (the settings-toggle-severity finding) — same underlying gap, one small plan,
    update docs/ARCHITECTURE.md's WorldBundle rebuild-invariants section as part of it.

  - arch--timeskip-simulation-gating (already recommended by plan 193; Finding 5 above
    adds the corpse-disposal-severity detail — no new plan needed, just richer scope)

acceptable (record, no action required):
  - Findings 9, 10 (P2 doc gaps / visual-lag decision) and every P3 item in §7 —
    no correctness impact today, opportunistic cleanup when next touching the
    relevant code, per plan instruction not to make P2/P3 fixes mandatory.
```

Names are illustrative, per plan's own instruction — not created as separate numbered plan files this session; logged to `docs/plans/LOOSE-ENDS.md` for triage, matching the convention plans 192/193/195 used.

---

## 11. Verification

- **Code changes this session** (§6): two small, isolated guards. `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` (1619 tests) all green.
- **Not browser/manually verified** — both fixes are narrow-blast-radius (a one-line early-return guard; gating an existing teleport call behind a condition already used for every sibling reset in the same function). Suggested manual checks if a human wants to confirm:
  1. Kill an NPC, then trigger a rest/wait time-skip — the corpse should stay exactly where it fell, not teleport to a schedule destination.
  2. Toggle a non-seed World Config setting (e.g. flat shading) mid-session while standing away from the home settlement — the player should stay at their current position (height re-snapped to the rebuilt terrain), not teleport home. Starting a genuinely new seed / "New Game" should still relocate to home spawn as before.
- This was an audit-and-triage session, not a feature implementation — the primary "verification" is the evidence trail in §1-7 above (code paths traced with file:line references, not gameplay-tested), consistent with plans 192/193/195's own verification sections.

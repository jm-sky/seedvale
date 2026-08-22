# Implementation notes — 197 — NPC Runtime State & Lifecycle Continuity

Closes plan 194's headline P0 finding (Finding 1): NPC runtime state, including death, did not survive ordinary settlement unload/reload — a killed NPC came back fully alive on revisit, same session, no reload required. Also closes plan 195's Finding B (`Household` stock not carried across an in-session `WorldBundle` rebuild) and plan 193's Finding 2 (`NpcAgent.die()` has no death-propagation hook), per plan 194's own recommendation to fold all three into one plan.

## 1. Authoritative NPC state (plan §1)

Audited `NpcAgent`'s fields against the plan's own taxonomy (identity / persistent state / runtime simulation state / transient presentation state):

| Field | Classification | Reasoning |
|---|---|---|
| `id` | identity | Already stable (`${settlementId}:npc:${i}`), unchanged by this plan |
| `health` (HP, dead) | **authoritative** | Death must survive reconstruction — the plan's central finding |
| `stamina` | **authoritative** | Physical exertion state, mutated continuously during simulation |
| `vigor` | **authoritative** | Daily-collapse state, same reasoning as stamina |
| `needs` (hunger/thirst/woodDuty/waterDuty) | **authoritative** | Drives NPC decision-making; resetting on every stream cycle would make needs meaningless |
| `phase`/`pendingAction`/`combatIntent`/pathfinding/watchdog | transient | FSM/navigation state, re-derived from `choose()` on the next tick regardless — no world-visible consequence if reset |
| `carried` (ore-carry `Inventory`) | transient (decision, see §1a) | |
| `schedule` | derived, not state | Pure function of role+traits, recomputed identically every construction |
| `questMarker` | external, transient | Set every tick by `QuestManager` from the outside; not owned by `NpcAgent` |

Result: `health`/`stamina`/`vigor`/`needs` moved to a new authoritative-state layer (`src/settlement/npcState.ts`); everything else stays exactly as it was (field initializers on `NpcAgent`, reset on every construction).

### 1a. `carried` (ore-carry inventory) — classified transient

`carried`'s own existing doc comment already states it's "a brief hold between extracting a world resource (ore) and delivering it, not a persistent belongings system." It's reseeded via `seedDefaultRoleWeapon()` on every construction (unchanged). Kept transient because: (a) it was already documented as non-persistent, (b) an NPC's mine→deposit round trip is short enough that a mid-trip settlement unload was already an edge case before this plan, (c) `equipment/tools` persistence (a role's default weapon condition, e.g. a worn axe) was not previously stateful either — `seedDefaultRoleWeapon` always seeds a fresh default. No regression; explicitly out of scope for the same reason `ItemInstance` durability transfer is plan 199's territory, not this plan's.

## 2. Owner (plan §2)

Reused the exact existing pattern: `HouseholdRegistry`/`EconomyRegistry` already live on `SettlementsManager`, keyed by stable id, surviving settlement stream-out/in by construction (a per-manager `Map`, not per-`Settlement`). Added `NpcStateRegistry` (`src/settlement/npcState.ts`) as a third registry of the same shape — no new abstraction invented, no `EntityManager`/`StateManager`.

```text
SettlementsManager
  ├── EconomyRegistry    (existing)
  ├── HouseholdRegistry  (existing, now carries across WorldBundle rebuild too — §8)
  └── NpcStateRegistry   (new — this plan)
```

## 3. Identity vs. runtime representation (plan §3)

`createSettlement.ts`'s per-NPC construction loop now resolves `npcStateRegistry.getOrCreate(npcId, needOffset)` **before** calling `NpcAgent.create(...)`, exactly mirroring how `household`/`economy` are already resolved before being passed in. `NpcAgent`'s constructor no longer calls `createHealthState`/`createStaminaState`/`createVigorState`/`createNeedState` itself — it assigns `this.health = npcState.health` etc., holding a **direct reference** into the registry's object, not a copy.

Consequence: an id seen before (agent dispose/recreate) hydrates from the same object; a genuinely new id gets `NpcAuthoritativeState`'s usual fresh-state construction (same values as before this plan). `NpcAgent.create()`'s public signature defaults `npcState` to a freshly-constructed one (`createNpcAuthoritativeState(npcId, needOffset)`) for the small number of isolated-fallback callers with no `SettlementsManager`-backed registry to hand in — same "isolated fallback" idiom `economy`/`household` already use (`null` defaults).

## 4. State ↔ NpcAgent synchronization (plan §4)

No synchronization step exists because none is needed: `NpcAgent` mutates `this.health`/`this.stamina`/`this.vigor`/`this.needs` in place (unchanged call sites — `damageHealth(this.health, ...)`, `tickNeeds(this.needs, ...)`, etc.), and those are the *same objects* the registry holds. `dispose()` does not need to snapshot anything back into the registry — there was never a second copy to reconcile. This directly satisfies the plan's explicit constraint: "unikać dwóch niezależnych mutable copies state."

## 5. Death as a lifecycle transition (plan §5)

`health.dead` lives on the shared `HealthState` object, so it survives dispose/recreate automatically via §3/§4 above. The one gap this doesn't close by itself: a freshly-constructed `NpcAgent` still runs its normal alive-pose constructor logic (idle animation playing, upright rotation) even when hydrating an already-dead state. Fixed with a one-line hook at the very end of the constructor:

```ts
if (this.health.dead) this.die()
```

Safe to call `die()` here — every field it touches (`pendingAction`, `combatIntent`, `combatAttack`/`combatRangedAttack`, `actionLifecycle`, `activeQueueId` via `leaveActiveQueue()`, `mixer`, `mesh.rotation`, `hpFillEl`/`labelBarsEl`, `trace`) is already at its just-constructed default at that point in the constructor, so re-running `die()`'s cleanup is idempotent, not just "probably fine."

Verified no path exists from `dead NPC → rebuild → new NpcAgent(default alive state)`: `createSettlement.ts` always resolves `npcState` from the registry before constructing, and the registry's `getOrCreate` never re-runs `createNpcAuthoritativeState` for an id it has already created.

## 6. Death consequences (plan §6)

Audited the concrete list the plan names (household membership, settlement population, relationships, quests, profession/work assignments, other active references):

- **Household/SettlementEconomy**: both are running balances mutated by live NPC actions (`deposit()`/`add()`/`remove()`), never derived from a live member count. A dead NPC's `update()` already no-ops on `health.dead` (pre-existing guard, unchanged), so it simply stops contributing/consuming — nothing "goes stale" without an explicit propagation hook. **No hook added** — plan 193's recommended `onNpcDeath` callback would have no live consumer today; adding one now would be speculative, not a fix for a demonstrated bug. If a future feature (reputation, population UI) needs to react to death, add it then, mirroring `onAnimalDeath`'s existing injection path.
- **Quests/relationships**: explicitly deferred to plan 199 per this plan's own scope boundary (quest-giver identity is a non-unique `name` string, tracked separately).
- **Profession/work assignments**: no-op automatically — `update()` returning early means a dead NPC never resumes its `work` schedule slot.
- **Settlement population / "other active references" — concrete bug found and fixed**: `interactables.ts`'s NPC gaze-candidate loop did not filter `health.dead`, so a corpse remained targetable for dialogue (`"Rozmawiaj z <name>"` prompt, `[E]` opened `npcDialog`). This was latent before this plan (death didn't survive a reload anyway) and became directly reachable once death persists. Fixed with the same one-line filter combat targeting already uses (`player/playerCombat.ts:87`): `if (npc.health.dead) continue`.
- **O(n²) separation loop (plan 194 Finding 8's "do this too" addendum)**: `createSettlement.ts`'s per-frame NPC-pair separation math previously processed a dead NPC only for the few frames before the whole settlement reset it away. Now that a dead NPC stays in `agents` for the settlement's full lifetime, it would otherwise participate in that loop forever. Fixed by excluding a dead NPC from the physical push (`dist < NPC_SEPARATION_RADIUS && !ai.health.dead && !aj.health.dead`) — a corpse no longer shoves living NPCs or gets shoved. `nearbyNpcCounts` (reaction-chance dampening) is left unaffected — a minor, deliberately unchanged behavior, not a correctness issue.
- **Removal/disposal path**: deliberately **not** added. A dead NPC has no corpse/loot system (matches the existing, unchanged `die()` doc comment — "rather than a corpse/loot system, which stays out of this plan's scope," originally plan 177's decision). The NPC now persists as a permanent "corpse in place" — visually inert (`mixer.stopAllAction()`, tipped rotation, hidden bars from the existing `die()`), simulation-inert (`update()` no-ops), interaction-inert (dialogue filter above), and physically inert (separation-loop exclusion above). No `readyToRemove()`-style compaction was implemented since nothing currently needs the array slot freed.

## 7. Streaming and `WorldBundle` rebuild (plan §7)

| Boundary | What's destroyed | What stays authoritative | Reconstruction source |
|---|---|---|---|
| Settlement unload (stream-out) | `NpcAgent` instances (mesh/label/mixer disposed) | `NpcStateRegistry` entries (lives on `SettlementsManager`, untouched by `unload()`) | `NpcStateRegistry.getOrCreate` on the next `ensureLoaded` |
| Settlement reload (stream-in) | — | same registry entries | same |
| `WorldBundle` rebuild | Whole `SettlementsManager` (registry included) | Plain-data snapshot captured *before* `dispose()` (`snapshotNpcStates()`) | `createNpcStateRegistry(initialNpcStates)` on the freshly-built manager |
| Settlement regeneration (new seed) | Whole `SettlementsManager` | Nothing (deliberate — `resetCollectedItems: true` path never captures a snapshot, same as `carriedEconomies`) | Fresh `createNpcAuthoritativeState` |

`rebuildWorldBundle()` now captures `carriedHouseholds`/`carriedNpcStates` alongside the pre-existing `carriedEconomies`, using the exact same `resetCollectedItems ? undefined : bundle.settlementsManager.snapshot*()` idiom, and threads them into the rebuilt `buildSettlementsManager(...)` call. `createWorldBundle` (the fresh-boot/new-game/load-save path) does not pass these two params — there is no `SaveData` source for them (see §"Not implemented" below), so a genuinely fresh bundle has nothing to carry, same as how `initialEconomies` is the only one of the three actually sourced from `SaveData` there.

No change to the streaming mechanism itself (load/unload radii, `ensureLoaded`/`unload` control flow) — only what backs the NPC state that gets destroyed and recreated across it.

## 8. Household — confirmed continuity gap (plan §8)

Fixed the one confirmed gap named by the plan: `Household.stock`/`.water` had no carry-across-`WorldBundle`-rebuild mechanism, unlike `SettlementEconomy`. Applied the identical pattern:

- `Household` gained `snapshot(): HouseholdSnapshot` (`{ stock, water }`), mirroring `SettlementEconomy.snapshot()`.
- `createHousehold(id, settlementId, homeId, initial?)` accepts an optional carried snapshot instead of always rolling the jittered starting reserve.
- `HouseholdRegistry` gained `serialize()`, mirroring `EconomyRegistry.serialize()`.
- `rebuildWorldBundle()` captures `carriedHouseholds` and threads it through, same call as `carriedEconomies`.

Not touched: `SaveData` (household stays session-only, as documented — this was never in scope, only the in-session rebuild gap was).

## 9. Identity references (plan §9)

No change — `npc.id` was already the stable key used for interaction queues and simulation membership; this plan's registry keys off that same id. Quest-giver `name`-based identity and fauna quest-id collisions remain plan 199's scope, untouched here.

## What was *not* done (explicit plan exclusions, confirmed still out of scope)

- No `SaveData` schema change — NPC state and household stock remain session-only (plan explicitly excludes "pełny save/load system NPC").
- No global `EntityManager`/`StateManager`, no event bus, no NPC corpse/removal pipeline, no quest/relationship identity migration (plan 199), no resource-deposit continuity (plan 198).

## Files changed

- **New**: `src/settlement/npcState.ts` (`NpcAuthoritativeState`, `NpcStateSnapshot`, `NpcStateRegistry`), `src/settlement/npcState.test.ts`.
- `src/settlement/household.ts` — `HouseholdSnapshot`, `Household.snapshot()`, `createHousehold`/`createHouseholdRegistry` accept an optional carried snapshot, `HouseholdRegistry.serialize()`. Tests extended in `household.test.ts`.
- `src/settlement/SettlementsManager.ts` — owns `npcStates` registry alongside `households`/`economies`; threads it into both `createSettlement` call sites; exposes `snapshotHouseholds()`/`snapshotNpcStates()`; `dispose()` clears the new registry too.
- `src/settlement/createSettlement.ts` — accepts `npcStateRegistry`; resolves `npcState` per member before `NpcAgent.create()`; excludes a dead NPC from the separation-loop physical push.
- `src/ai/NpcAgent.ts` — `create()`/`createCapsuleFallback()`/constructor take `npcState: NpcAuthoritativeState`; `health`/`stamina`/`vigor`/`needs` are now references into it instead of freshly constructed; constructor hydrates the dead pose immediately when needed; removed the now-dead `needOffset` constructor param and the local `MAX_HP`/`MAX_STAMINA` constants (moved into `npcState.ts`).
- `src/app/worldBundle.ts` — `buildSettlementsManager`/`createWorldBundle`/`rebuildWorldBundle` thread `initialHouseholds`/`initialNpcStates` (rebuild path only) through to `createSettlementsManager`.
- `src/app/interactables.ts` — excludes a dead NPC from dialogue gaze targeting (death consequence, §6).
- `docs/SETTLEMENTS.md` — documented the new `NpcStateRegistry` and the closed `HouseholdRegistry` rebuild-carry gap.
- `docs/plans/LOOSE-ENDS.md` — closed the three loose ends this plan folds together (NPC streaming continuity, household rebuild carry, death-propagation hook decision).

## Verification

- **Technical**: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` (1628 tests, +8 new: `npcState.test.ts` ×6, `household.test.ts` ×2) all green.
- **Not browser-verified.** Suggested manual check (matches the plan's own steps):
  1. Note a specific NPC's HP/needs bar state in a nearby (non-home) settlement, walk far enough to unload it (>420 m), walk back — state should match what was left, not reset.
  2. Kill an NPC in a non-home settlement, walk away until it unloads, walk back — it should remain a fallen corpse (not alive, not targetable for dialogue), and the settlement's household/population should stay consistent (no crash, no duplicate).
  3. Toggle a non-seed World Config setting (e.g. flat shading) while a non-home settlement is loaded with a partially-fed household and/or a dead NPC — after the rebuild, household stock and the dead NPC's state should both survive.

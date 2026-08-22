# Implementation notes — 199 — Entity Identity & Transfer Continuity

Closes plan 194's Finding 2 (dropped instance-backed items lose durability/sharpness identity on drop→pickup) and Findings 3/4 (quest-giver name-collision risk, mid-session `rebuildWorldBundle()` not invalidating `QuestManager.animalTargets`). Section-by-section against the plan:

## 1. `ItemInstance` — transfer identity

Traced the full lifecycle (`inventory item → drop → world representation → pickup → inventory item`) across all 4 real call sites and fixed the one actual gap: `bundle.droppedItems.drop(kind, x, z)` never carried the source `ItemInstance`, so a picked-up item always went through `createAcquiredInstance()` and got a **new** id/default condition — the world-side record never had the instance's identity to preserve in the first place, not a lossy round trip of an existing one.

- `DroppedItem` (`src/items/createDroppedItems.ts`) and `SaveDroppedItem` (`src/persistence/saveData.ts`) both gained an optional `instance?: SaveItemInstance` field — same "absent on every pre-plan save" idiom as `SavePlacedFire.grate`, no save-schema version bump needed (shallow `Array.isArray` validators, no migration).
- New `toSaveItemInstance(instance: ItemInstance): SaveItemInstance` on `Inventory.ts` — the single conversion, also now used internally by `instancesToJSON()` (was inlined there before, no behavior change).
- `createDroppedItems.ts`'s `drop()`/`collect()` thread `instance` through unchanged.
- All 4 call sites fixed:
  - `inventoryWiring.ts`'s `dropItemStack` ("Wyrzuć") — zips each dropped unit with its own `inventory.getInstances(kind)` entry instead of dropping `count` identical plain items.
  - `gameLoop.ts`'s pickup handler (`~1218`) — restores via `Inventory.instancesFromJSON([collected.instance])[0]` when present, falling back to `createAcquiredInstance()` only for pickups that never had one (world-generated/spawner items).
  - `gameLoop.ts`'s `consumeDrop()` hotkey (`[G]`-style "drop one of everything") — previously silently *skipped* instance-backed kinds entirely (`inventory.remove()` only touches the stackable `counts` map, never `instances`); now drops one held instance per kind, same as the other path.
  - `createApp.ts`'s `grantItem()` overflow fallback — the instance it already minted before finding the inventory full is now carried into the drop instead of being discarded and re-minted fresh on pickup.
- Reference pattern followed: `PlacedTraps.place()`/`.collect()` (`src/world/createPlacedTraps.ts`), which already reused `source.id` as the placed record's own id — the "reuse the existing id, don't mint a new one" idiom this plan applied one layer earlier (world *drop*, not just world *placement*).

### Streaming boundary

Checked whether dropped items are covered by any streaming/rebuild boundary at all: `bundle.droppedItems.nodes()` (the full `DroppedItem[]`, `instance` included) is passed straight through both `rebuildWorldBundle()`'s carry-snapshot (`worldBundle.ts:538`) and the save/load round trip (`saveState.ts`/`createApp.ts`'s `initialSave?.droppedItems`) — both already preserve the whole record unchanged, so adding `instance` to the type was sufficient; no streaming-specific code needed touching. Dropped items were already correctly exempt from chunk streaming (flat array, always live) — verified, not changed.

## 2-4. Quest references to NPC / minimal NPC resolution / specific vs category semantics

Audited every quest reference to an NPC (`QuestDef.giverName`, `QuestAvailability.relation.npcName`, `QuestObjective['talk_to_npc'].npcName`) and confirmed plan 194 Finding 3 exactly: these are matched against `NpcAgent.name` (`ui-vue/store.ts:472`'s `questManager.onInteract(npc.name)`, `gameLoop.ts:1441`'s `questManager.labelMarker(npc.name)`), a plain string with **no** guaranteed uniqueness — `generateNpcName()` (`nameCultures.ts`) drew from the same cultural pool as the 4 reserved quest-critical names (`Anna`/`Piotr`/`Kasia`/`Marek`, `characters.ts`'s `RESERVED_SEEDS`), so an unrelated procedural NPC anywhere in the world could roll one of those names for an unlucky seed and get treated as the real quest giver (shared relation score, wrong dialogue/marker).

**Decision: fixed the uniqueness bug at the source instead of migrating `QuestDef`/save-data relations to `NpcId`.** Reasoning:
- The 4 reserved characters are assigned their name directly in `families.ts`'s `reservedHomeFamilies()` (`piotr!.name`, etc.), never through `generateNpcName()` — so excluding those 4 names from the procedural pool (`nameCultures.ts`) makes the name a de facto stable+unique identity again for exactly the NPCs the quest system cares about, with a small, isolated, no-new-framework fix.
- These 4 NPCs are always in the **home settlement**, which is exempt from settlement streaming (never unloaded — `docs/state/settlements.md`) — so the identity-reconstruction problem this plan is centrally about doesn't even apply to them at the streaming boundary. The one boundary that does apply — a `WorldBundle` rebuild — is already covered by plan 197's `NpcStateRegistry`: it survives a rebuild keyed by the NPC's stable `${settlementId}:npc:${i}` id, so the same *object identity* concern this plan asks about ("NpcId → current NpcAgent must resolve to the same entity") is already closed.
- A full migration would mean rewriting `QuestDef`/`QuestObjective`'s static content schema (every `giverName`/`npcName` field) and `QuestManager.relations`' string keys — a much larger, riskier change for a bug whose actual, demonstrated cause is non-uniqueness, not the use of a name as such. Out of scope per the plan's own exclusions ("nowy quest framework", "pełny save/load redesign") and CLAUDE.md's "don't design for hypothetical future requirements."

Fix: `nameCultures.ts`'s `generateNpcName()` now filters `RESERVED_CHARACTERS`' names out of the candidate pool (`namesForCulture(culture, gender).filter((name) => !RESERVED_NAMES.has(name))`) before rolling. Verified with a sweep test (`nameCultures.test.ts`) across 200 seeds × 5 indices × both genders × all 3 cultures — never returns a reserved name.

**Minimal NPC resolution (plan §3):** audited whether a "given `NpcId`, get the current `NpcAgent`" utility is actually needed anywhere. Every current NPC/quest interaction (dialogue, label marker, relation read) operates on an already-live `NpcAgent` object obtained by scanning currently-loaded settlements (`interactables.ts`'s gaze candidates) — nothing in the codebase resolves an NPC by id when it might be unloaded. Plan 197 already guarantees the one invariant that matters structurally: whenever a live `NpcAgent` *is* (re)constructed for a previously-seen id, it hydrates from the same authoritative `NpcStateRegistry` entry rather than a fresh one. Building a speculative `findNpcById()` with no caller would be exactly the kind of unrequested abstraction CLAUDE.md and this plan's own scope note ("nie tworzyć globalnego `EntityManager` ani ogólnego lookup frameworka") warn against — recorded as **verified, no new utility needed**, not implemented.

**Specific vs. category quest targets (plan §4):** classified every `QuestObjective` variant:

| Objective | Semantics |
|---|---|
| `kill_target_animal`, `find_animal` | **specific entity** — bound to one concrete `animalId` at stage-activation via `bindAnimalTargetIfNeeded()` |
| `talk_to_npc` (npcName) | **specific entity** — one of the 4 reserved NPCs, name now unique (see above) |
| `spot_animal`, `gather_item`, `interact_well`, `interact_tree`, `interact_spawner`, `interact_landmark`, `clear_wolf_den` | **category/predicate** — kind, action, or a stable-but-non-individual id (spawner type, den id, landmark id); no per-individual identity needed or implied |

This classification already matches the existing code exactly — no objective needed migrating either direction. Recorded per the plan's own instruction not to convert category targets to stable ids just because the mechanism exists.

## 5-6. Fauna as a specific quest target / dead-removed targets

Traced fauna quest-target identity end-to-end: `animalId = \`${kind}-${nextAnimalId++}\`` is a per-`WorldBundle`-build monotonic counter (`createFauna.ts`), so **within one build's lifetime** two animals can never share an id — "Animal A dies → Animal B spawns → quest must not silently target B" already holds by construction (B always gets a strictly higher counter value than A). Death/removal semantics were already correct and untouched:

- `kill_target_animal`: `animal_died` with the bound id is treated as **success** (`isObjectiveSatisfiedBy`'s `'animal_died'` case).
- `find_animal`: `animal_died` with the bound id is treated as **failure** (`QuestManager.onInteractObjective` — `s.state = 'failed'`, terminal, no reward, distinct from the `kill_target_animal` case one line above it).
- Both clear `animalTargets` on their terminal transition, so a stale id can never re-trigger anything (existing tests: `QuestManager.test.ts`'s "failed lifecycle" describe block).

**The one real gap found (plan 194 Finding 4):** a same-session `WorldBundle` rebuild (e.g. the World Config screen's flat-shading toggle — same handler as any terrain-param change, not gated behind a confirm dialog) fully disposes and recreates fauna, resetting each kind's id counter to 0. An `active` quest's `animalTargets` entry survives the rebuild untouched (only `QuestManager`'s *constructor* — the save/load path — has the invalidation check; `rebuildWorld()` skips `questManager.reset()` whenever `resetCollectedItems` is `false`, which is the common case for this handler). A newly spawned animal after the rebuild can coincidentally reuse the exact same id string the old bound animal had, silently and incorrectly satisfying/soft-locking the quest — the cross-rebuild version of the exact "must not silently target B" invariant the plan names, just triggered by a rebuild instead of a death.

Fix: new `QuestManager.invalidateStaleAnimalTargets()` mirrors the constructor's existing save/load-restore handling of the identical case:
- Wild-fauna-kind bindings (`!LIVESTOCK_KINDS.has(kind)`) → `invalidated` (terminal, matches `quests.ts`'s existing "world binding can't be trusted" semantics — doc comment widened to also mention this call site, not just save/load restore).
- Livestock-kind bindings → cleared and rebound via the live `AnimalTargetResolver` (livestock is deterministically re-derivable via `homePlaceId`, same reasoning as the constructor path).

Called from `createApp.ts`'s `rebuildWorld()` right after `rebuildWorldBundle()` completes, gated on `!resetCollectedItems` (the `true`/genuinely-new-world path already clears `animalTargets` entirely via `questManager.reset()`, so calling both would be redundant, not incorrect).

## 7. Focused identity audit

Scope was kept to exactly the 3 areas above (`ItemInstance` transfer, NPC quest references, fauna quest references) plus their reconstruction/hydration boundaries, per the plan's own scope fence. No repo-wide identity refactor performed; no `EntityManager`, no UUID migration, no new quest framework, no full dropped-item persistence expansion beyond what already existed.

## What was *not* done (explicit plan exclusions, confirmed still out of scope)

- No `NpcId` migration of `QuestDef.giverName`/`QuestObjective.npcName`/`QuestManager.relations` — see §2-4 reasoning above.
- No new `findNpcById()`/resolution utility — verified unnecessary given plan 197's existing continuity guarantee and the absence of any off-screen-by-id caller.
- No change to fauna's per-build id scheme itself (still resets per rebuild) — only the quest-side consequence of that reset is now handled.
- No `SaveData` schema change (`instance` on `SaveDroppedItem` is additive/optional, same idiom as several prior plans).
- No global dropped-item persistence expansion — the existing carry-across-rebuild/save-load contract was already complete; this plan only widened what's inside the already-carried record.

## Files changed

- `src/items/createDroppedItems.ts` — `DroppedItem.instance?`, `drop()`/`collect()` thread it through.
- `src/items/Inventory.ts` — new exported `toSaveItemInstance()`, `instancesToJSON()` now built from it.
- `src/persistence/saveData.ts` — `SaveDroppedItem.instance?: SaveItemInstance`.
- `src/app/interactables.ts` — `collectItem()`'s return type carries `instance?` through from the `'dropped'` source.
- `src/app/inventoryWiring.ts` — `dropItemStack` is instance-aware per unit dropped.
- `src/app/gameLoop.ts` — pickup handler restores the carried instance; `consumeDrop()` hotkey now handles instance-backed kinds instead of silently skipping them.
- `src/app/createApp.ts` — `grantItem()`'s overflow drop carries the already-minted instance; `rebuildWorld()` calls `questManager.invalidateStaleAnimalTargets()`.
- `src/ai/nameCultures.ts` — `generateNpcName()` excludes `RESERVED_CHARACTERS`' names from the candidate pool.
- `src/quests/QuestManager.ts` — new `invalidateStaleAnimalTargets()`.
- `src/quests/quests.ts` — `'invalidated'` state doc comment widened to cover the new call site.
- New tests: `src/items/createDroppedItems.test.ts`, `src/ai/nameCultures.test.ts`; extended `src/quests/QuestManager.test.ts` (`invalidateStaleAnimalTargets` describe block).
- `docs/plans/LOOSE-ENDS.md` — closed the 3 loose ends this plan resolves (dropped-instance-item condition loss, quest-giver name collision, mid-rebuild `animalTargets` invalidation).

## Verification

- **Technical**: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` (1640 tests, +7 new: `createDroppedItems.test.ts` ×3, `nameCultures.test.ts` ×1, `QuestManager.test.ts` ×3) all green.
- **Not browser-verified.** Suggested manual checks (matching the plan's own steps):
  1. Sharpen/wear a knife (or arm-then-partially-wear a trap), drop it, pick it back up — durability/sharpness should match what was dropped, not reset to full.
  2. Drop a worn instance-backed item with the `[G]`-style "drop one of everything" hotkey (not just the inventory screen's "Wyrzuć") — same check.
  3. Start a quest bound to a specific NPC (e.g. talk to the giver), toggle a non-seed World Config setting (e.g. flat shading) to trigger a same-seed rebuild, confirm the quest still targets the same NPC correctly.
  4. Start a `kill_target_animal`/`find_animal` quest, toggle a non-seed World Config setting mid-quest — the quest should become clearly invalidated (or, for a livestock target, silently rebind and remain completable), never silently bind to an unrelated new animal.
  5. Kill the bound animal for a `find_animal` quest before finding it — quest should fail (pre-existing behavior, re-verified unchanged).

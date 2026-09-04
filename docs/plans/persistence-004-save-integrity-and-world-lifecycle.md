# Plan: Save Integrity and World Lifecycle

**Created:** 2026-09-05
**Status:** `planned` 📋
**Type:** bug
**Priority:** high · **Effort:** M
**Depends on:** ~~persistence-002~~ persistence-003
**Domain:** `persistence`
**Subdomains:** `save-data` `storage`
**Tags:** `autosave` `new-game` `seed` `world-reset`

## Problem

Three user-visible failures point at the same missing lifecycle guarantees around persistence and world identity:

1. save slots can disappear during an active game;
2. state from the previous world can survive `New Game` — observed as an old navigation target/marker remaining after switching to a new seed where that location does not exist;
3. an explicit `?seed=1234` cannot currently be used to start a new deterministic world because the start flow either loads the selected save's seed or replaces the URL seed with `randomSeed()`.

The current integrity guard from `persistence-002` protects an existing slot that is already unreadable, but it does not establish that the newly assembled `SaveData` is valid before replacing a previously valid record. `listSaves()` also filters unreadable records out of the normal slot list, so a record that becomes invalid can appear to have vanished even when the IndexedDB row still exists.

At the application boundary, `New Game` resets many systems through the existing rebuild path, but the transition is not expressed as one explicit world-lifecycle contract. The same flow also lacks an explicit seed-source policy.

## Goal

Make save writes and world transitions fail-safe and deterministic without introducing a second persistence or world-state manager.

After this plan:

- invalid outgoing snapshots never replace the last valid save;
- storage/read failures are not presented as "there are no saves";
- manual save failures are visible to the player and autosave failures are diagnosable;
- `New Game` starts from clean world-scoped/player-world state rather than inheriting state from the previous world;
- seed ownership follows one explicit rule for load, new game and URL-driven deterministic starts;
- the URL reflects the seed of the actually active world.

## 1. Validate the outgoing snapshot before persistence

Add a runtime validation boundary for the complete current `SaveData` before every write that can create or replace a slot.

This includes at minimum:

- normal/manual save;
- autosave;
- Save As / named-slot creation;
- first save of a newly created world.

Reuse the current canonical save validation/migration boundary in `src/persistence/saveData.ts`; do not introduce a parallel schema definition.

A TypeScript `SaveData` type is not sufficient runtime validation. Values such as `NaN`, malformed nested snapshots or semantically invalid collections can still reach persistence from runtime systems.

If the outgoing snapshot is invalid:

- do not call the destructive IndexedDB put for the target slot;
- preserve the previous stored record unchanged;
- return an explicit typed failure;
- emit bounded development diagnostics identifying the failing persistence domain/path as precisely as practical;
- never log the complete save payload.

The validation API should remain usable by future save-schema versions established by `persistence-003`.

## 2. Determine the actual invalid-snapshot source

The integrity guard prevents data loss but is not the end of the bug.

During implementation, reproduce or instrument the current `buildSaveData()` output and determine which field/domain can produce an invalid current-schema snapshot during normal play.

Trace the runtime owners serialized by `src/app/saveState.ts`, especially recently added simulation state.

Fix the producing system at its authoritative ownership boundary rather than sanitizing arbitrary invalid values inside the storage layer.

If no deterministic producer can be reproduced, keep the validation/diagnostic guard and document the observed diagnostics needed for the next browser reproduction.

## 3. Preserve the last valid save

A failed save attempt must leave the previous valid slot readable.

Required behavior:

```text
valid stored slot
    ↓
build invalid runtime snapshot
    ↓
validation fails
    ↓
write rejected
    ↓
old stored slot remains valid and loadable
```

This complements `persistence-002`, which protects the inverse case: an already-invalid existing slot must not be overwritten.

Do not silently replace invalid data with defaults merely to make the save pass validation.

## 4. Separate empty/missing state from storage failure

Review the persistence API so callers can distinguish at least:

- successful list with zero saves;
- missing requested slot;
- invalid/unreadable slot;
- migration failure;
- unsupported save version;
- IndexedDB read/list failure.

Do not let `listSaves()` or equivalent application-facing logic turn an IndexedDB failure into an ordinary empty list.

Do not blank the active-save UI merely because refreshing save metadata failed.

Keep unreadable rows preserved unless the player explicitly deletes them or a separately designed recovery/migration path safely replaces them.

## 5. Surface save failures according to intent

`saveNow()` currently allows write failures to be effectively diagnostic-only.

Separate caller intent where necessary:

- **manual Save / Save As** — surface a concise player-visible failure and keep the old save intact;
- **autosave/lifecycle save** — do not spam the player, but record bounded diagnostics and retain enough state for the next manual save/UI action to indicate that saving is unhealthy;
- **New Game / Load transition** — a failed attempt to protect/save the current world must not silently mutate or overwrite the wrong slot.

Reuse existing toast/pause-menu feedback mechanisms rather than adding a persistence-specific notification framework.

## 6. Define an explicit world-transition contract

Treat changing from one world identity to another as a deliberate lifecycle boundary.

The implementation must audit the existing `New Game` flow and ensure all state whose identity belongs to the current world is reset or rehydrated from the selected world before simulation continues.

At minimum verify the current owners for:

- map discovery;
- location knowledge;
- navigation targets;
- quests/world flags tied to the old world;
- collected/depleted world resources and terrain/player-built state;
- settlement/NPC/household/fauna state;
- other state already reset by `rebuildWorld(true)`.

Do not create a second list of duplicated authoritative state. Prefer one explicit reset/orchestration entrypoint that delegates to each existing owner.

The transition should be reason-aware enough to distinguish:

- rebuild of the same world/seed for technical or debug reasons;
- genuine `New Game` / different world identity;
- loading an existing save.

## 7. Fix navigation-target leakage across New Game

The observed regression is:

```text
world A
→ discover location
→ set navigation target
→ New Game / world B with another seed
→ old target marker must not exist
```

`NavigationTargets.clear()` already exists and must remain the authoritative target reset mechanism.

Trace why the current `New Game` path can still display the previous target after the clear call. Check both authoritative state and presentation/reactivity boundaries for the world map and minimap.

Do not solve this only by hiding an unresolved marker. World B must genuinely have zero inherited navigation targets unless restored from its own save.

## 8. Establish seed-source precedence

Define one explicit policy for determining world seed:

### Load existing save

`SaveData.config.seed` is authoritative.

Any `?seed=` currently present in the URL must not override the loaded save. After selection/load, synchronize the URL to the loaded world's actual seed.

### New Game with explicit URL seed

If a valid `?seed=<number>` was explicitly present when starting the new-world flow, use it as the new world's seed.

Example:

```text
?seed=1234
→ New Game
→ create clean world with seed 1234
→ create/save that world normally
```

This preserves deterministic reproduction for development and player-shared seeds.

### New Game without explicit URL seed

Generate `randomSeed()` as today, then synchronize that selected seed into the URL.

Do not confuse the parser's fallback value with an explicitly supplied URL seed; the lifecycle must know whether the user actually provided `seed`.

## 9. Seed and save identity remain separate concepts

A seed identifies deterministic world generation input, not a save slot.

Multiple saves may legitimately share the same seed while containing different history/state.

Do not use the seed as a save ID and do not infer that matching seeds mean the saves are interchangeable.

When loading a save, persisted world history remains authoritative even if the URL previously described another seed.

## 10. Save-operation ordering

Audit concurrent write entrypoints:

- 60-second autosave;
- `visibilitychange`;
- `pagehide` / unload lifecycle;
- manual save;
- Save As;
- New Game / Load transitions.

Guarantee that overlapping writes cannot let an older or invalid snapshot win after a newer valid save.

Prefer the smallest existing-compatible serialization/coalescing mechanism if ordering is currently unsafe. Do not move persistence to a worker merely for this plan.

## 11. Diagnostics

Add bounded development diagnostics for at least:

- outgoing snapshot validation failure;
- exact save operation (`manual`, `autosave`, `save-as`, `new-game transition`) when useful;
- slot ID/name where safe and useful;
- persistence read/list/write failure category;
- world transition source and resolved seed in debug builds where useful.

Diagnostics should answer:

> Why was this save not written, and which persistence/world domain should be inspected next?

Do not dump complete inventory, NPC state, relationships or other potentially large save contents.

## 12. Verification

Add focused automated regression coverage for persistence and lifecycle behavior.

### Outgoing snapshot integrity

- create a valid slot;
- attempt to overwrite it with runtime-invalid current-schema data;
- assert the write fails explicitly;
- assert the original slot remains byte-for-byte or semantically unchanged and loadable;
- verify invalid data cannot create a new named slot through Save As.

Use an invalid field already rejected by the current runtime validator rather than adding a test-only validation rule.

### Read/list semantics

- IndexedDB list failure is distinguishable from a valid empty database;
- unreadable slot remains preserved;
- active-save metadata is not silently cleared because of a transient read failure.

### New Game isolation

Starting from a mutated world, execute the application-level new-world reset and verify the new world does not inherit at minimum:

- navigation targets;
- map/location knowledge intended to be world-scoped;
- representative world-state flags/resources already owned by the reset path.

Do not attempt browser rendering verification in automated tests; the user performs final browser verification.

### Seed precedence

Cover:

- `?seed=1234` + New Game → seed `1234`;
- no explicit seed + New Game → generated seed;
- `?seed=1234` + Load Save(seed `5678`) → active seed `5678`;
- URL synchronized to the actually active world after New Game/Load;
- invalid/missing URL seed follows the normal random-new-game path rather than accidentally using parser fallback as explicit intent.

### Write ordering

If multiple save requests can overlap, add a regression test proving the chosen ordering rule preserves the latest valid authoritative snapshot.

## Acceptance criteria

- A newly assembled invalid `SaveData` cannot replace a valid existing save.
- Invalid Save As data cannot create a slot that immediately disappears from the save list.
- The previous valid slot remains loadable after a rejected manual/autosave attempt.
- Read/list failures are not represented as an ordinary empty save database.
- Manual save failure is visible to the player; autosave failure is safely diagnosable without destructive fallback.
- The concrete invalid-snapshot producer is fixed when reproducible, or sufficient bounded diagnostics remain to identify it on the next reproduction.
- `New Game` does not inherit navigation targets or other audited world-scoped state from the previous world.
- Same-world rebuilds do not unnecessarily erase state that belongs to the same world identity.
- Loading a save always uses the save's persisted seed.
- `?seed=1234` + New Game creates a clean new world with seed `1234`.
- New Game without an explicit URL seed still generates a random seed.
- The URL is synchronized to the seed of the actually active world.
- No second persistence manager, seed manager or duplicate world-state store is introduced.

## Non-goals

- Save export/import or recovery UI.
- Cloud saves.
- Multiplayer persistence.
- Restoring pre-hard-cut historical save formats.
- Redesigning the IndexedDB backend.
- Generic runtime schema/sanitization framework for every simulation system.
- Persisting rendering/UI cache state.
- Treating URL query params as authoritative over an explicitly loaded save.
- Browser verification by the AI agent.

## Implementation constraint

When adding or changing important architectural/public functions or classes, add concise JSDoc where useful for preflight discovery and consider the `@domain` tag.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

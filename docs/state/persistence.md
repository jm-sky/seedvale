# Seedvale — Persistence

**Purpose:** canonical current-state reference for how Seedvale saves, loads, and reconstructs the world — the classification taxonomy every domain doc's persistence claim should point at rather than restate, the save/restore/rebuild mechanism, and the known persistence gaps.

**Not:** a field-by-field `SaveData` schema dump (that's [ARCHITECTURE.md](../architecture/ARCHITECTURE.md#save-schema)'s job), a per-migration changelog narrating why each version bump happened (that belongs in the migration plans themselves), or a domain's own detailed persistence status (each domain doc states its own facts and links here for the taxonomy).

**Last verified:** 2026-09-09

When this file and the code disagree, the code wins — update this file.

---

## The central fact: `SaveData` is a serialization format, not a runtime authority

`SaveData` has no behaviour and is never mutated in place by gameplay code. Every field's actual source of truth is the one runtime system that owns it (an `Inventory`, a state registry, a household record, …); the save assembly step reads those systems once per save, and restore constructs those same systems from the prior save's values. No `SaveData` field is assembled from more than one live owner anywhere in the codebase — the one case that structurally invites this (work contracts) is explicitly designed against it: the contract holds only its own commitment fields, the target holds its own progress, connected by id, never duplicated.

The correct mental model is "each domain owns its state and knows how to serialize it," not "a central blob the world is loaded from."

## Persistence model

Five categories. A given domain concept can span more than one row — state it per-concept, not per-domain.

### Persisted authoritative
The save is the only copy; nothing regenerates it. *Examples:* settlement economies, households, NPC authoritative state (health/stamina/vigor/needs/injury/helper-assignment/active-plan/post-death/personal inventory), NPC↔NPC and player↔NPC relationships, player↔settlement reputation/renown, livestock individuals, player inventory/needs/skills, every player-built world object (wells, torches, palisades, residential houses, gardens, containers, …), work-contract commitments, quests, the game clock, map discovery/knowledge.

### Persisted delta / override
A deterministic base plus only the deviation from it. *Examples:* player-sourced terrain modifications (system-caused carves like caves are filtered out at save time and re-derived), mining-hits-remaining on resource deposits, grass-forage-patch depletion, a fauna spawn point's FSM/recovery clock (position/type/kind stay deterministic), livestock removal tombstones, discovered map cells.

### Deterministic reconstruction
A pure function of `(seed, [elapsedDays/region params])`; never persisted, because it never needs to be. *Examples:* terrain heightmap/biome/river/road geometry, season/weather/climate, settlement generation (`VillagePlan`), NPC identity/physical profile, family composition, wild-fauna spawn population, world-location geometry.

### Runtime authoritative
Real, meaningful state that is deliberately not persisted. *Examples:* NPC phase/pending-action/pathfinding/watchdog/combat-intent/`carried` work inventory (reset fresh on every reconstruction, by design), combat's own in-flight state (no `CombatIntent`/attack-phase/projectile field exists anywhere), player stamina, wild-fauna individuals (see [fauna.md](./fauna.md)'s four-tier picture), and — the one case in this category that is *not* believed deliberate — player HP (see [Known persistence limitations](#known-persistence-limitations)). Personal NPC belongings are **not** in this category — they persist on `NpcAuthoritativeState.personalInventory`.

### Derived / cache
Safely evictable, never a source of truth. *Examples:* the persistent worldgen cache, in-session terrain/mesh caches, settlement-plan memoization, encumbrance, shortage/surplus, a skill's derived value from its XP.

**Rats** are the one concept that fits none of these cleanly: runtime authoritative, not persisted, **and not deterministically reconstructed** — even the population count is a live formula over current food/dog state, not reproducible from `(seed, elapsedDays)` alone. Treat it as its own, fourth shape rather than a subset of "wild fauna, unpersisted" — see [fauna.md](./fauna.md).

## Save/load lifecycle

```text
domain runtime state (the one live owner of each field)
→ serialization into SaveData (one read per system, at save time)
→ storage (IndexedDB)
→ load: version check → migration chain → schema validation
→ domain reconstruction — restore IS construction, not a two-phase load-then-apply
→ runtime ownership resumes (the restored object is the live object from here on)
```

**Restore has no separate hydration phase.** Every one of `SaveData`'s fields is read exactly once, at its one call site, feeding straight into the constructor of the one runtime system that owns it. No system anywhere is built empty and then walked/filled from a save afterward.

**In-session `WorldBundle` rebuild reuses the exact same mechanism a save does.** A config change that rebuilds the world (not a save/load) carries forward live state through the same snapshot methods the save-assembly step itself calls, into the same constructor parameters the boot path accepts. This is the structural guarantee that "what survives a save" and "what survives a `WorldBundle` rebuild" cannot drift apart — they are produced by the same functions, not two independently-maintained code paths.

## Deterministic base + deltas

```text
seed/config
→ deterministic world reconstruction (terrain, hydrology, settlement plans,
  NPC identity, wild-fauna population, location geometry — none of this
  is ever a SaveData field)
+ persisted modifications/deltas (only the deviation from the deterministic
  base: player terrain edits, resource-deposit depletion, forage-patch
  depletion, spawn-point FSM, removed-livestock tombstones)
→ the current world, reconstructed identically every session except where
  a delta says otherwise
```

The boundary rule this codebase applies consistently: **a value that is a pure function of `(seed, [history-free params])` is never a `SaveData` field; a value that depends on player/NPC/world history that can't be re-derived from the seed alone is persisted.** The delta rows above sit exactly on this boundary by design — the base stays deterministic, only the deviation persists.

## Domain summary

| Domain | Representative persistence status |
|---|---|
| Terrain/hydrology | Deterministic reconstruction; player-sourced modifications and resource-deposit depletion persist as deltas. |
| Settlements/households/economy | Persisted authoritative (economies required; households sparse-optional). Settlement generation itself is deterministic. Land ownership persists as a flat top-level field — the one settlement-domain concept not using the shared registry idiom below (a style asymmetry, not a correctness risk). |
| NPCs | Authoritative state (health/stamina/vigor/needs/injury/helper-assignment/active-plan/post-death/personal inventory) and both relationship stores persist. Identity/physical profile is deterministic. Decision/execution runtime state and `carried` work inventory never persist (loadout belongings become corpse loot at death). See [npc.md](./npc.md). |
| Player | Inventory (counts, item instances, *and* food-batch freshness), survival needs, and skills (XP) persist. **HP does not** — see [Known persistence limitations](#known-persistence-limitations). Stamina is deliberately not persisted. |
| Inventory/items | A generic `Inventory` class is reused by the player, NPCs, households, the settlement economy, and every placed container — persistence fidelity differs by owner (see limitations below), not by mechanism. |
| World objects/buildables | Persisted authoritative, one array per object type; construction progress lives on the object's own entry, never duplicated onto a work contract. |
| Fauna: livestock/wild/rats | Four distinct shapes — livestock persisted per individual (with an explicit pre-save capture step), spawner lifecycle persisted thin, wild individuals unpersisted-but-population-deterministic, rats unpersisted-and-not-deterministic. See [fauna.md](./fauna.md). |
| Combat/health | `HealthState` is the shared primitive; combat itself holds zero persisted state anywhere — only each target's own consequence field persists (NPC `physicalInjury`, livestock HP inside its snapshot; nothing for the player). |
| Quests/progression | Persisted authoritative (progress including `resolvedOutcomeId` after a complete/failed outcome, player↔NPC relations). Global quest EXP is not persisted. |
| Reputation/renown | Persisted authoritative, sparse-optional (own top-level `SaveData.reputation`, keyed by settlement id — absent settlement/save restores neutral, no version bump needed, same idiom as `npcStates`/`households`). Owned by `ReputationManager`, independent of `QuestManager`; changes only through an explicit, already-resolved consequence a caller applies. See [npc.md](./npc.md#relationships-social-and-dialogue). |
| Time/weather | The clock persists; weather/climate is a deterministic function of the clock and is never itself stored. |
| World locations/discovery | Discovery/knowledge state persists; location geometry itself is always deterministically re-derived from `(world seed, location id)`. See [world-locations.md](./world-locations.md). |

## Migrations/versioning

One pure `(data) => data` step per source schema version, chained in order against a fresh clone at each step — deterministic, side-effect-free, and **fails closed**: a missing or throwing step rejects the load rather than guessing or skipping ahead. Each currently-registered migration defaults exactly one new field/collection to a value that reproduces the pre-migration behaviour.

Validation runs on **write as well as read** — an outgoing save is checked against the runtime schema before it's stored, and a write-time integrity guard additionally refuses to overwrite an *existing* slot whose current stored record can't itself be read successfully (the original bytes are left untouched; the write reports the failure instead of silently clobbering a healthy save with a broken one).

Save-slot inspection is a separate four-way status layer on top of the schema/migration mechanism (a slot is `ok`, `invalid`, `migration-failed`, or `unsupported-version`) — simple callers collapse this to a flat list/null, while callers that must make a destructive or lifecycle decision (boot, the save-management screen) use the result-typed variant so "confirmed zero saves" and "a read failure" are never confused.

Don't restate the current schema-version number in more than one place — it belongs to [ARCHITECTURE.md](../architecture/ARCHITECTURE.md#save-schema); every other document should point there instead of copying the number, which is exactly how it has gone stale independently before.

## Worldgen cache

**The persistent worldgen cache is not gameplay persistence and must not be confused with it.** It is a separate, disposable, `(seed, namespace, version, fingerprint) → payload` key-value cache living in its own database store — structurally outside `SaveData` entirely, never referenced from its type or validator, and never required to load a save. A fingerprint mismatch is treated as a cache miss (silently regenerate), never as something to migrate — migrating would imply a correctness obligation this cache explicitly disclaims. This is the mechanism the project's Determinism convention ("bump that namespace's version/fingerprint when generation rules change") governs — it applies independently, per namespace, and has nothing to do with `SaveData`'s own version number.

Today there is exactly one namespace (coarse world-location classification, used by [world-locations.md](./world-locations.md)'s discovery system) — core terrain/hydrology generation itself has no persistent cache of this kind; its own in-session caches (chunk mesh data, river tiles, settlement-plan memoization) are ordinary evictable performance caches over pure functions, not versioned across sessions.

## Known persistence limitations

- **Player HP is not persisted.** Every Continue/Load fully heals the player, while NPC and livestock HP both persist. Unlike player stamina — which carries an explicit "not worth persisting" rationale — nothing states this is a deliberate choice. This is a maintainer decision (persist it, or document the omission as deliberate), not resolved here.
- **Rats have no persistence and are not seed-derivable.** A settlement's rat population is entirely rebuilt from a live formula every time that settlement streams back in — see [fauna.md](./fauna.md).
- **Wild-fauna individual state is not persisted.** Population reconstruction is deterministic; no specific individual's position, health, hunger, disease state, or life stage survives a session boundary. The generic per-individual snapshot mechanism exists on the fauna runtime class itself but is only ever invoked for livestock — see [fauna.md](./fauna.md).

None of the three items above is a "bug" in the sense of contradicting a stated invariant — the first is an undocumented gap with no stated rationale either way; the latter two are documented, deliberate scope decisions. Treat them accordingly rather than uniformly as defects.

## Entry points

```text
src/persistence/db.ts
src/persistence/saveData.ts
src/persistence/saveDb.ts
src/persistence/saveSlots.ts
src/persistence/seedDb.ts
src/persistence/seedRecord.ts
src/persistence/worldgenCacheDb.ts
src/app/saveState.ts
src/app/createApp.ts
src/app/worldBundle.ts
```

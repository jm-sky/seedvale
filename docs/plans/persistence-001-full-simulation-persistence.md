# Plan: Full Simulation Persistence

**Created:** 2026-09-01
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** none
**Domain:** `persistence`
**Subdomains:** `npc` `household` `fauna` `simulation`
**Tags:** `SaveData` `continuity` `hydration` `World Time`

## Goal

Close the major simulation persistence gap for NPCs, households, NPC relationships and house-owned livestock.

After Save → Load, the world should continue its existing history instead of reconstructing these systems from default state.

The implementation should reuse existing registries, snapshots, deterministic spawning and time-anchor mechanisms rather than introducing a parallel persistence system.

## 1. SaveData contracts

Extend the existing `SaveData` v1 with plain-data state for:
- NPC authoritative state
- households
- NPC relationships
- house-owned livestock

Keep the existing ownership boundary:
- `saveState.ts` assembles SaveData
- `saveData.ts` defines/validates the persistence contract
- IndexedDB remains the persistence backend

Do not introduce a generic entity serializer or a new persistence manager.

## 2. NPC authoritative state

Use the existing `NpcStateRegistry` and its snapshot/serialization mechanism.

Persist authoritative state such as:
- health
- needs
- vigor/stamina state represented by the existing snapshot contract
- helper assignment
- active plan

Do not persist runtime state such as:
- phase
- pending action
- pathfinding/navigation
- movement state
- transient combat state
- animation state

`activePlan` must remain resumable without persisting the currently executing action.

On load, restore NPC state into the existing `NpcStateRegistry` before NPC runtime agents begin normal simulation.

## 3. Household state

Use the existing `Household.snapshot()` mechanism.

Persist the existing authoritative household state, including:
- stock
- water
- item counts
- item instances

`HouseholdRegistry` remains the owner of runtime household state.

Hydrate the registry from SaveData rather than applying persistence later to already-running households.

## 4. NPC relationships

Add an explicit snapshot/import boundary to `NpcRelationships`.

Persist relationship values as plain data while keeping the existing map and pair-key implementation internal to the runtime system.

Restore relationships before NPC behaviour can make decisions based on them.

## 5. Livestock persistence model

Add a plain-data persistence contract for house-owned livestock.

The contract should contain only authoritative state required to preserve individual continuity, including:
- stable `animalId`
- animal kind
- `ownerHouseId`
- world position (`x`, `z`) and yaw
- health/death state
- persistent life/need state that materially affects simulation
- production readiness anchor
- lifecycle information required to prevent resurrection or incorrect cleanup

Do not copy the entire `AnimalAgent` into SaveData.

In particular, do not persist navigation, targets, wandering state, animation, Three.js objects or other runtime AI/presentation state.

The exact field set should be derived from the current `AnimalAgent`/health/lifecycle implementation rather than introducing duplicate state models.

## 6. Livestock position and terrain

Persist livestock `x`, `z` and yaw.

Do not persist terrain-derived `y`.

On reconstruction, resolve `y` from the current terrain height at the persisted position.

Persisted position takes precedence over the deterministic initial spawn position so that livestock does not teleport back to its original home location after loading.

## 7. Livestock spawn, hydration and identity reconciliation

Extend the existing livestock spawning flow rather than creating a second loader.

The runtime must support:
- normal deterministic spawn when no saved entity exists
- hydration of an existing saved entity when one exists

For every persisted livestock entity, guarantee:
- exactly one runtime `AnimalAgent`
- stable identity
- correct house ownership
- no duplicate deterministic spawn
- no accidental recreation of an entity that was removed before save

Reconcile generated, saved and removed entities explicitly. Persisted state is authoritative for an existing individual.

## 8. Livestock lifecycle and death

Use the existing health/lifecycle mechanisms as the source of truth.

A livestock animal that was dead before Save must not resurrect after Load.

Persist only the authoritative lifecycle information required to reconstruct the entity correctly.

Do not persist corpse presentation state such as mesh/FX/animation phase when it can be derived from authoritative lifecycle and World Time.

Entities that have completed their existing removal lifecycle must not reappear because deterministic spawning is run again.

## 9. Livestock production and World Time

Persist the existing `productionReadyAtDays` time anchor.

Do not add a countdown or offline simulation replay.

Production readiness must continue to be evaluated against current `elapsedDays`, so an animal whose production became ready while the game was closed is immediately in the correct state after load.

Apply the same principle to other time-based livestock lifecycle state where the current implementation already uses absolute World Time anchors.

## 10. Wild fauna scope

Do not add individual wild-animal persistence in this plan.

Keep the existing persistence of fauna spawn-point lifecycle, including depletion/recovery state and related counters/anchors.

Wild individual agents continue to be reconstructed by the existing deterministic fauna spawning system.

This keeps SaveData bounded and preserves the hybrid/off-screen simulation model.

## 11. Merchant horse scope

Do not persist the individual merchant horse in this plan.

It is an `AnimalAgent`, but it is not house-owned livestock and is currently deterministically reconstructed without a gameplay requirement for individual continuity.

A future persistent merchant/transport animal system can extend the model separately if its gameplay state becomes authoritative.

## 12. Settlement lifecycle and ownership

Keep persistence ownership in the existing `SettlementsManager` registries:
- `EconomyRegistry`
- `HouseholdRegistry`
- `NpcStateRegistry`
- `NpcRelationships`

Do not add persistence responsibility to `Settlement` or create a settlement-specific persistence manager.

`createSettlement()` should continue receiving the registries from the manager.

## 13. Load ordering

Restore authoritative state before dependent runtime systems begin normal simulation.

The intended lifecycle is:

```text
SaveData
  ↓
World Time
  ↓
settlement registries
  ├── economy
  ├── households
  ├── NPC state
  └── relationships
  ↓
settlement/runtime construction
  ↓
NPC and livestock hydration
  ↓
derived/presentation state
```

The exact existing load entrypoint should be integrated rather than replaced.

## 14. Save assembly

Extend the existing save assembly to collect:
- NPC registry snapshot
- household registry snapshots
- NPC relationship snapshot
- livestock snapshots

Each state must continue to have one authoritative runtime owner.

Do not introduce an intermediate global cache solely for persistence.

## 15. Backward compatibility

Keep the current `SaveData` v1 model.

Do not introduce a general migration framework as part of this work.

New collections may safely default to empty where that preserves current semantics.

Missing individual state must not cause duplicate entity generation or loss of stable identity.

## 16. Verification

Add focused Save → Load tests for:

### NPC
- changed needs
- health
- active plan
- helper assignment

### Household
- changed stock
- water
- item counts
- item instances

### Relationships
- changed relationship values

### Livestock
- stable identity
- ownership
- persisted position
- health/death
- persistent need state
- production anchor
- lifecycle

### Time continuity
Verify Save → advance `elapsedDays` → Load for:
- NPC time-dependent state
- livestock needs/lifecycle
- livestock production
- corpse lifecycle
- fauna spawn recovery

## 17. Regression and reconciliation cases

Cover at minimum:
- NPC with an active plan
- NPC with a helper assignment
- modified household inventory
- livestock away from its deterministic spawn position
- livestock mid-production
- livestock already production-ready
- injured livestock
- dead livestock
- livestock whose corpse/removal lifecycle has completed
- depleted fauna spawn point
- recovering/disabled fauna spawn point
- Save/Load around settlement runtime rebuild

## Acceptance criteria

- NPC authoritative state survives Save → Load.
- Household authoritative state survives Save → Load.
- NPC relationships survive Save → Load.
- Existing livestock retains identity, ownership and authoritative state.
- Livestock retains its meaningful world position without persisting terrain-derived height.
- Dead/removed livestock does not resurrect or duplicate.
- Livestock production correctly resolves from `elapsedDays` after loading.
- Existing fauna spawn-point persistence continues to work.
- No runtime navigation, animation or presentation state is added to SaveData.
- No second persistence ownership layer is introduced.
- Load does not allow default state to influence simulation before persisted state is hydrated.

## Non-goals

- Individual wild fauna persistence
- Merchant horse individual persistence
- Pathfinding persistence
- Pending-action persistence
- Animation persistence
- Generic entity serialization
- Full offline simulation replay
- Multiplayer/cloud persistence
- New persistence backend
- General SaveData migration framework

## Implementation constraint

When adding or changing important architectural/public functions or classes, add concise JSDoc where useful for preflight discovery and consider the `@domain` tag.

**Zrób git commit i push do main, rebase jeżeli trzeba**
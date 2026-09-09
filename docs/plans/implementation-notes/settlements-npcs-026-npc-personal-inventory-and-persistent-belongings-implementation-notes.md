# Implementation notes: NPC personal inventory and persistent belongings

Plan: `docs/plans/settlements-npcs-026-npc-personal-inventory-and-persistent-belongings.md`

## 1. Authoritative ownership is already decided by current architecture

`src/settlement/npcState.ts` is the correct ownership boundary. `NpcAuthoritativeState` is keyed by stable `NpcId`, lives in `NpcStateRegistry`, and survives settlement unload/reload, `WorldBundle` rebuild and save/load. `NpcAgent` receives direct references to the mutable authoritative objects; there is no copy/hydration layer after construction.

Add `readonly personalInventory: Inventory` to `NpcAuthoritativeState`. Do not add a second `NpcInventoryRegistry`, a manager-level map keyed by the same NPC id, or an `NpcAgent`-owned persistent copy.

`createNpcAuthoritativeState()` must always construct an empty personal inventory. `fromSnapshot()` must always construct one as well, restoring the snapshot when present and otherwise creating an empty inventory for legacy state. This guarantees that every NPC has the container even when it owns nothing.

`NpcStateRegistry.getOrCreate()` already has the right idempotency semantics: an existing id returns the same state object, so stream-in/reconstruction must obtain the same `personalInventory` object instead of reseeding it.

## 2. Reuse the existing Inventory snapshot shape, not a new serializer

`src/items/Inventory.ts` already exposes the full persistence primitives needed here:

- `toJSON()` — plain counts,
- `instancesToJSON()` — stable item-instance ids plus trap/weapon/liquid state,
- `foodBatchesToJSON()` — perishable provenance/decay state,
- `Inventory.instancesFromJSON()` — item-instance restore,
- constructor arguments for counts, max weight, instances, food batches, max size and decay modifier.

Use one nested snapshot shape equivalent to the existing household/container patterns, e.g. counts + instances + optional food batches. Prefer a named reusable type only if there is already a natural shared home; do not introduce an NPC-specific item serialization format.

`HouseholdSnapshot.items` in `src/settlement/household.ts` is the closest persistence precedent: it stores `counts`, `instances` and optional `foodBatches`, then reconstructs a normal `Inventory`. Follow that pattern.

Important: liquid content is stored inside `SaveItemInstance` and is already restored by `Inventory.instancesFromJSON()`. Do not add parallel liquid fields to the NPC snapshot.

## 3. Capacity is runtime configuration, contents are persisted

`Inventory.maxWeight`/`baseMaxWeight`, `maxSize` and decay modifier are configuration/runtime semantics, not persisted state. Only contents belong in `NpcStateSnapshot`.

When constructing `personalInventory`, derive/pass the intended NPC carry baseline from the existing physical-profile/Strength path if the current code already has a canonical helper for NPC body capacity. Do not persist the numeric limit and do not create a second encumbrance model in this plan.

If a correct personal-inventory size cap is not already defined, keep the current generic `Inventory` behaviour rather than inventing a new gabarite balance rule here. The plan is ownership/persistence, not carry-balance redesign.

## 4. `NpcAgent.carried` must remain a separate transient work payload

Current architecture explicitly excludes `carried` from `NpcAuthoritativeState`; it is owned by `NpcAgent` and resets on reconstruction. Existing logistics/work code reads and mutates it, including `src/ai/npcLogistics.ts`, `src/ai/npcProfessionWork.ts` and assistance/loadout paths.

Do not mechanically replace those call sites with `personalInventory`.

The key split for this implementation is:

- `personalInventory` — authoritative belongings owned by the NPC,
- `carried` — temporary custody/payload used by an executing action or logistics flow.

This matters because current `carried` includes both real work cargo and historical combat/loadout items. The latter is the area that needs focused adjustment: personal weapons/supplies that conceptually belong to the NPC must stop being seeded as fresh runtime ownership on every reconstruction. Preserve combat APIs where practical, but make their source authoritative personal belongings rather than a second ownership store.

Do not move harvested ore/wood/food deliveries, household exchange payloads or other job cargo into `personalInventory` merely because they are physically carried by the NPC during an action.

## 5. Loadout seeding is the main reconstruction duplication trap

`src/ai/NpcAgent.ts` currently imports `ensureKnifeCarried`, `seedDefaultRoleWeapon` and `seedHunterSupplies` from `src/ai/npcLoadout.ts`. Those helpers historically populate runtime `carried` state.

During 026, inspect every call to those helpers before changing inventory wiring. Any item that becomes a personal belonging must be seeded only on genuine first creation of authoritative NPC state, never on ordinary `NpcAgent` construction/stream-in.

The safe invariant is:

```text
first authoritative NPC creation
  → optional initial personal-belongings seed

NpcAgent reconstruction
  → reuse existing personalInventory
  → no role/profession reseed
```

Do not infer legacy personal belongings during load from profession, role or household. Existing saves restore an empty personal inventory by design.

## 6. Persistence path: extend `NpcStateSnapshot`, not `SaveData` top level

The existing path is already complete:

```text
NpcAuthoritativeState
  → NpcStateRegistry.serialize()
  → SettlementsManager.snapshotNpcStates()
  → app/saveState.ts
  → SaveData.npcStates
  → createWorldBundle(... npcStates ...)
  → createNpcStateRegistry(initial)
```

`src/app/saveState.ts` already writes `bundle.settlementsManager.snapshotNpcStates()`; it should not gain a second personal-inventory field.

Extend `NpcStateSnapshot` with nested personal-inventory contents and serialize it inside `NpcStateRegistry.serialize()`.

`src/persistence/saveData.ts` has explicit `isNpcStateSnapshot()` validation. Extend that validator to validate the nested counts/instances/food-batches structure using the existing item-instance and food-batch validators rather than loose-casting it.

The codebase has a real save-version migration chain. Because this changes the persisted current snapshot contract, bump `CURRENT_SAVE_VERSION` and add the normal migration. The migration for every existing NPC snapshot is deterministic: add an empty personal-inventory snapshot. Do not generate equipment during migration.

Do not solve backward compatibility by silently accepting a malformed current-version record. Follow the current migration + validation contract.

## 7. WorldBundle rebuild should work automatically if the snapshot is correct

The same `NpcStateRegistry.serialize()` snapshot is used for persistence and in-session carry/rebuild. Therefore do not add a separate rebuild-specific inventory copy path.

A correct implementation in `NpcStateSnapshot` should make these two cases identical structurally:

```text
save/load        → serialize → restore
WorldBundle rebuild → serialize → restore
```

Tests should specifically prove that an instance-backed item retains the same instance id and liquid/condition state across both paths.

## 8. Transactional transfer: compose existing Inventory operations carefully

`Inventory.add()` / `addInstance()` can fail on capacity. `remove()` / `removeInstance()` mutate immediately. Therefore source → NPC transfer must check destination acceptance before mutating source, or use a small helper that preserves all-or-nothing semantics.

For plain stack items, capacity-check before removal. For item instances, `canAddInstance()` before `removeInstance()`. For perishable food, preserve the existing `removeWithFreshness()` → `addWithFreshness()` checkpoint semantics and `nowDays` so storage decay does not reset.

Do not implement transfer as “remove from source, then try add to NPC” without rollback.

If several authoritative owners need the same operation and no existing generic transfer helper already covers it, prefer one small item-layer helper over NPC-specific duplicated transfer code.

## 9. Corpse integration is downstream and currently has a persistence mismatch to remember

`src/settlement/npcPostDeath.ts` / `npc-010` already own corpse state. Do not implement corpse lifecycle in 026.

However, current corpse loot validation in `src/persistence/saveData.ts` stores corpse `counts` + `instances` only; it does not include food freshness batches. Personal inventory does include freshness. Therefore the later `npc-010` follow-up must either extend corpse-loot persistence to preserve food batches or provide another lossless ownership-handoff representation before moving perishable belongings.

026 must not silently discard freshness at death just to fit the current corpse shape.

Likewise, `NpcAgent.carried` is not the future source of personal corpse loot. The downstream one-shot transfer is `NpcAuthoritativeState.personalInventory → authoritative corpse loot`.

## 10. Files worth opening during implementation

Focused set; broader repo recon should not be necessary unless current code has changed:

- `src/settlement/npcState.ts` — authoritative state, snapshot, registry create/restore/serialize.
- `src/items/Inventory.ts` — contents, capacity, freshness and instance serialization.
- `src/settlement/household.ts` — closest existing nested `Inventory` snapshot/restore pattern.
- `src/ai/NpcAgent.ts` — wire the authoritative reference; find current loadout seeding and `carried` construction.
- `src/ai/npcLoadout.ts` — distinguish genuine personal starting belongings from runtime reseeding.
- `src/ai/npcLogistics.ts`, `src/ai/npcProfessionWork.ts`, `src/ai/npcAssistance.ts` — confirm work cargo stays on `carried`.
- `src/app/saveState.ts` — confirm no new top-level save field is needed.
- `src/persistence/saveData.ts` — snapshot validation, save version and migration chain.
- `src/settlement/npcPostDeath.ts` and `docs/plans/npc-010-death-and-corpse-lifecycle.md` — downstream ownership contract only; do not broaden 026 into corpse work.

## 11. Suggested implementation order

1. Add the nested personal-inventory snapshot type and `personalInventory` to `NpcAuthoritativeState`.
2. Implement empty creation + snapshot restore + registry serialization using existing `Inventory` serializers.
3. Extend save validation and add the save-version migration that inserts empty legacy inventories.
4. Wire `NpcAgent` to the authoritative inventory without changing work-cargo semantics.
5. Move only genuine personal loadout/belongings initialization away from reconstruction-time `carried` seeding; keep transport payload logic untouched.
6. Add focused transfer helper/tests if no reusable transactional helper already exists.
7. Add round-trip tests for counts, instance ids/state, liquid state and food freshness, plus stream/rebuild idempotency.
8. Update state/JSDoc comments that still claim NPC authoritative state is not in `SaveData` and document `personalInventory` vs `carried`.

## 12. Tests with the highest value

Prefer focused unit/integration tests over browser automation:

- `createNpcAuthoritativeState()` gives each NPC a distinct empty `Inventory` object.
- `NpcStateRegistry.serialize()` → `createNpcStateRegistry(snapshot)` preserves plain counts.
- Same round-trip preserves weapon/trap instance id + condition and waterskin liquid state.
- Same round-trip preserves food batches/provenance/decay state.
- Legacy snapshot migrated/restored without the new field yields empty personal inventory.
- Repeated `getOrCreate(id)` returns the same personal inventory and does not reseed loadout.
- Two NPC ids never share inventory contents by object aliasing.
- Failed source → NPC transfer leaves both inventories unchanged.
- Successful perishable transfer preserves freshness semantics.
- Existing logistics tests still prove work cargo uses `carried` and is not silently moved into personal belongings.

Manual browser verification remains for the user; the implementation agent should run the relevant automated tests/build only.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

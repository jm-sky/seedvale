# Implementation notes: Lossless NPC inventory → corpse loot handoff

Plan: `docs/plans/npc-036-lossless-npc-inventory-corpse-loot-handoff.md`

## 1. Ownership is already correct; representation is not

Do not redesign NPC death lifecycle.

Current authoritative boundaries are already right:

- live personal belongings: `NpcAuthoritativeState.personalInventory`,
- post-death truth: `NpcAuthoritativeState.postDeath`,
- death one-shot seam: `commitNpcDeath()`,
- runtime death presentation/cleanup: `NpcAgent.die()`,
- work cargo: `NpcAgent.carried`,
- transport-order cargo: `NpcAuthoritativeState.transportCargo`.

The fix is to make the existing `personalInventory → postDeath.loot` handoff complete and lossless.

## 2. Current lossy code path

`src/settlement/npcPostDeath.ts` currently defines:

```ts
NpcCorpseLootSnapshot = {
  counts: Partial<Record<ItemKind, number>>
  instances: SaveItemInstance[]
}
```

and `commitNpcDeath()` calls:

```ts
extractNpcLoadoutLoot(personalInventory, role)
```

`extractNpcLoadoutLoot()` enumerates only `isNpcLoadoutBelonging()` kinds. This is now stale relative to `settlements-npcs-026`, where `personalInventory` became the authoritative owner of all personal belongings.

Delete/retire the classifier from corpse ownership. Role should no longer be needed by `commitNpcDeath()` merely to decide what belongings survive death.

## 3. Reuse `InventoryContentsSnapshot`

`src/items/Inventory.ts` already owns the canonical full persisted inventory shape:

```ts
InventoryContentsSnapshot {
  counts
  instances
  foodBatches?
}
```

and generic helpers for full snapshot/restore.

Use that shape for `NpcPostDeathState.loot`. Prefer direct type reuse or a transparent alias; do not duplicate the fields into another corpse-specific interface.

When cloning `NpcPostDeathState`, clone the full generic contents including nested `foodBatches`. Do not shallow-copy only counts/instances.

Check the existing generic snapshot/restore helpers in `Inventory.ts` before writing manual clone/serialization logic.

## 4. Death transfer should move, not copy

The target invariant is ownership transfer, not snapshot duplication:

```text
before death: personalInventory owns A
commit death: A is moved
post death: personalInventory empty, corpse owns A
```

A tempting implementation is:

```ts
const loot = snapshotInventoryContents(personalInventory)
postDeath.loot = loot
// then somehow clear personalInventory
```

Avoid this unless clearing is itself proven lossless and atomic. Prefer moving the contents through generic transfer primitives so the same transfer semantics protect freshness and instances.

`src/items/inventoryTransfer.ts` already provides:

- `transferInventoryCount()` — freshness-aware for perishables,
- `transferInventoryInstance()` — stable instance id/state.

If no generic move-all helper exists, add one in `inventoryTransfer.ts`, not `npcPostDeath.ts`. It should enumerate all current stack kinds + instance ids, transfer into an unbounded destination inventory, and fail without partial ownership ambiguity.

Because the destination corpse inventory is freshly created with effectively unlimited weight/size, normal capacity failure should be impossible; still keep failure semantics explicit/testable.

## 5. Perishables: `nowDays` matters

`transferInventoryCount()` takes `nowDays` and internally uses `removeWithFreshness()` / `addWithFreshness()`.

Pass the same authoritative world-day value used as `deathAtDays` into the handoff. This checkpoints batches at the death moment and preserves effective age while changing owner/decay modifier.

Do not use default `nowDays = 0` in death or corpse-looting paths.

For corpse runtime inventory, decide the decay modifier deliberately by reusing existing carried/world-item semantics; do not persist the modifier itself. The persisted snapshot stores batch checkpoint state, not container configuration.

## 6. Corpse → receiver transfer also needs freshness

Current `transferCorpseCountTo()` does manual `has/canAdd/remove/add`, which loses freshness once corpse snapshots start containing batches.

After restoring the full corpse `Inventory`, call `transferInventoryCount(corpse, receiver, kind, amount, nowDays)` and re-snapshot the corpse only on success.

Similarly `transferCorpseInstanceTo()` can delegate to `transferInventoryInstance()`.

This keeps one transactional implementation for NPC personal transfer, corpse looting and other inventory owners.

Any caller of `transferCorpseCountTo()` will need to supply authoritative `nowDays`. Trace callers before editing the signature; do not invent another clock.

## 7. Corpse cleanup → world drops is another loss point

`dropNpcCorpseLoot()` currently:

- preserves `SaveItemInstance` when dropping instances,
- loops `counts` and drops plain kinds one-by-one.

Once corpse loot has `foodBatches`, this second branch would flatten perishables again.

`src/items/createDroppedItems.ts` already has a `foodBatch` argument on `drop(...)`.
`src/items/foodItems.ts` already has `expandFoodBatchesToUnits()` for lossless per-unit batch splitting.

Reuse those seams:

- perishable kind with batches → split batches into unit batches and pass each batch to `DroppedItems.drop`,
- non-perishable count → current plain loop,
- instance-backed item → current saved instance row.

After successful drop handoff clear the corpse snapshot exactly once.

## 8. Persistence path stays nested under NPC state

No changes should be needed in `src/app/saveState.ts` or a new top-level save field.

Current path remains:

```text
postDeath.loot
→ NpcStateRegistry.serialize()
→ SaveData.npcStates
→ restore via createNpcStateRegistry()
```

`cloneNpcPostDeath()` and save validation are the important boundaries.

## 9. Save version / migration

Recon on 2026-09-12 found `CURRENT_SAVE_VERSION = 32`; re-read it before implementation because main moves quickly.

Changing current corpse loot schema requires one normal version bump and migration.

Migration rule is intentionally conservative:

```ts
oldLoot = { counts, instances }
newLoot = { counts, instances }
```

`foodBatches` remains absent because historical freshness was never saved.

Do not synthesize provenance/acquired-at timestamps in the migration.

The existing generic Inventory restore fallback for perishable counts without batches is the correct compatibility behavior unless current code has changed.

Extend the existing `isNpcStateSnapshot` / post-death validation using the same inventory-contents validators already used for `personalInventory` rather than a second corpse validator with different rules.

## 10. Item-instance coverage

`SaveItemInstance` currently round-trips the instance metadata relevant here, including:

- stable `id`,
- `kind`,
- durability,
- sharpness,
- liquid + amount,
- tent condition.

The implementation should not special-case these in NPC death code. Moving/restoring a generic `Inventory` automatically preserves them.

Tests should include at least one weapon-like instance and one liquid/tent instance so the corpse path proves it is not accidentally kind-only.

## 11. Fauna reuse boundary

Do not try to unify NPC corpse inventory with `AnimalAgent`.

Useful fauna/shared reuse remains:

- `shared/corpseLifecycle.ts` for derived phases,
- optional presentation building blocks.

Animal corpse fields such as `corpseHeld` / `meatHarvested` are harvest lifecycle state, not a generic item ownership container.

For this plan the stronger reuse is the item layer (`Inventory`, transfer helpers, food batches, dropped items), not fauna.

## 12. Tests to modify first

`src/settlement/npcPostDeath.test.ts` currently encodes old role-filter behavior (e.g. loadout instances move while ore remains). Replace those assertions with the new ownership invariant:

- every personal stack moves,
- every personal instance moves,
- role is irrelevant,
- freshness batches move,
- source personal inventory is empty after successful commit,
- second commit is a no-op,
- carried/transport cargo are not involved.

Add partial-loot + re-snapshot tests and cleanup-to-world-drop perishable coverage.

Persistence tests should cover previous-version migration and full death → save/load → loot round-trip.

## 13. Keep these out of scope

Do not solve transport carrier death here. `transportCargo` is intentionally a separate owner and current code comments already record that unresolved gap.

Do not move `NpcAgent.carried` into corpse; that would steal settlement/work goods from their actual domain.

Do not redesign burial, legal ownership, inheritance, NPC equipment slots or personal inventory seeding.

## 14. Suggested implementation order

1. Reuse/alias `InventoryContentsSnapshot` for `NpcPostDeathState.loot` and make clone/restore full-fidelity.
2. Add/reuse generic move-all inventory helper.
3. Replace `extractNpcLoadoutLoot()` in `commitNpcDeath()` with full `personalInventory` transfer using `nowDays`.
4. Convert corpse → receiver transfer to generic transactional helpers with `nowDays`.
5. Make corpse cleanup → dropped items preserve food batches.
6. Update save validation/version/migration.
7. Rewrite focused corpse tests for full ownership + freshness + instances + idempotency.
8. Run focused tests, TypeScript/build as needed, and update state/JSDoc only where current docs become stale.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

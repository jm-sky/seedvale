# Implementation Notes: Merchant transport capacity infrastructure

**Plan:** `settlements-npcs-047-merchant-transport-capacity-infrastructure.md`  
**Reviewed against:** current `main`, 2026-09-18

## Recon conclusion

Plan is materially stale in two places:

- `fauna-039` already implemented `PackConfig`, `AnimalDef.pack`, horse `50 kg / 32 units`, donkey `40 kg / 24 units`, and real persistent `AnimalPackState` / saddlebags inventory in `src/fauna/animalPack.ts`.
- `Inventory` already has the required mutable-capacity seam: `setBaseMaxWeight()`. It preserves object identity and contents; lowering the limit below current weight does not delete goods, while `canAdd()`/ `add()` reject further overweight additions.

Do not reimplement either mechanism. The remaining 047 work is small: transport baseline + shared resolver + focused integration/tests.

## Current ownership to preserve

- `TransportOrder` owns the delivery commitment, not goods.
- `NpcAuthoritativeState.transportCargo` remains the merchant/carrier cargo authority.
- `AnimalDef.pack` is species capability/tuning only for this plan.
- Existing `AnimalPackState.contents` is a separate fauna/player saddlebags inventory. Do **not** move merchant transport goods into it in 047.
- `NpcAgent.carried` remains unrelated transient work cargo.

## Recommended implementation

### 1. Shared transport capacity helper

Add a small pure helper, preferably `src/world/transportCapacity.ts`:

- export one baseline constant: `10` kg;
- resolve `PackConfig | undefined` to effective transport capacity;
- absent pack => baseline;
- present pack => `pack.cargoCapacityKg` as the **total** capacity, not baseline + pack;
- no species-name branching.

Keep the input at capability/config level. Plan 048 can later resolve a real `packAnimalId` to an `AnimalDef.pack` and feed this helper without changing it.

Do not couple merchant transport to `cargoCapacityUnits` yet. `transportCargo` is currently weight-gated with unbounded `maxSize`; 047 changes weight semantics only.

### 2. NPC transport cargo initialization / restore

In `src/settlement/npcState.ts`, replace the private hard-coded `TRANSPORT_CARGO_MAX_WEIGHT = 5` with the shared 10 kg baseline (or construct through the shared helper).

Both fresh creation and snapshot hydration already recreate the same authoritative `Inventory` from persisted contents with runtime-derived capacity. Preserve that shape; do not persist capacity.

Existing save compatibility therefore needs no migration: old snapshots contain cargo contents, not the old 5 kg limit.

### 3. Reuse `Inventory.setBaseMaxWeight()`

Do not add `setMaxWeight()` or a second mutable-capacity API. Future pack assignment should update the existing `transportCargo` instance with:

`transportCargo.setBaseMaxWeight(resolveNpcTransportCargoCapacity(...))`

This keeps object identity and all existing references stable.

Important nuance: `Inventory.maxWeight` is `baseMaxWeight + carryCapacityBonus` from held items. Current transport orders move food/ore, so this does not affect 047 today. Do not redesign `Inventory` for this plan; if generic transport later allows capacity-granting items such as backpacks, that path must decide whether transport cargo should suppress equipment bonuses.

## Existing code to reuse

- `src/items/Inventory.ts` — `setBaseMaxWeight()`, `maxWeight`, `canAdd()`, `totalWeight()`.
- `src/settlement/npcState.ts` — authoritative `transportCargo` construction + hydration.
- `src/fauna/animalDefs.ts` — existing `PackConfig` and horse/donkey pack tuning from fauna-039.
- `src/fauna/animalPack.ts` — evidence that pack inventory already exists; **not** a merchant cargo integration point for 047.
- `src/ai/npcProfessionWork.ts` — current order sizing already checks `ctx.transportCargo.canAdd(...)`; raising/reconciling that inventory's base limit automatically feeds existing pickup planning.
- `src/world/transportOrder.ts` / `src/world/transportTravelArrival.ts` — no lifecycle change required.

## Tests worth adding

Keep tests focused on changed contracts:

- resolver: no pack = 10, donkey = 40, horse = 50;
- `Inventory.setBaseMaxWeight()`: lowering below current weight preserves contents, blocks further additions, removals still work, additions resume once back under limit; add here only if equivalent coverage is still absent;
- `npcState.test.ts`: fresh and hydrated `transportCargo.maxWeight === 10` and persisted contents survive;
- regression: `NpcAgent.carried` capacity is untouched.

Do not duplicate fauna-039 tests for `AnimalDef.pack` existence/config unless 047 changes those definitions.

## Pitfalls / non-goals clarified by current code

- Do not add another `PackConfig`, `pack?` field, animal pack inventory, saddlebags state, or saddlebags presentation.
- Do not delete or bypass `AnimalPackState`; it is real current architecture even though the source plan predates it.
- Do not wire a concrete animal or `packAnimalId` here; that remains plan 048.
- Do not make `TransportOrder` own capacity or cargo.
- Do not change transport travel/off-screen clocks; 038/037 already own that lifecycle.
- No save schema field for capacity.

## Suggested implementation order

1. Add shared baseline/resolver + unit tests.
2. Point `npcState.ts` creation/hydration at the shared baseline and update regression tests.
3. Add only missing `Inventory.setBaseMaxWeight()` behavior tests; no Inventory production change should be necessary.
4. Run focused tests for transport/npc state/inventory, then normal typecheck/test gates required by repo workflow.

Browser verification remains User-owned.

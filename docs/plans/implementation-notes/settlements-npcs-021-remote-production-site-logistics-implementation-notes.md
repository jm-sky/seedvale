# Implementation Notes: settlements-npcs-021 — Remote Production Site Logistics

## 1. Current transport contracts to preserve

### `src/world/transportOrder.ts`

`TransportEndpointRef` currently supports only:

```ts
{ type: 'household', householdId }
{ type: 'settlement-storage', settlementId }
```

Extend this union with one resource-site variant keyed by the existing resource/deposit id. Do not put position, inventory snapshots or settlement ownership on the endpoint record.

`TransportOrder` is a commitment only. It must continue to never own cargo.

Ownership remains:

```text
source Inventory
→ NpcAuthoritativeState.transportCargo
→ destination Inventory
```

### `src/world/createTransportOrders.ts`

Reuse the existing `TransportOrders` registry unchanged where possible:

- `create()`
- `find()`
- `findByCarrier()`
- `completePickup()`
- `completeDelivery()`
- `fail()`
- off-screen execution state

Do not add matching, resource scanning or remote-site state to this registry.

### `src/world/transportTransactions.ts`

Both new resource-site pickup and existing household pickup must go through `executeTransportPickup()`.

Do not create a specialized ore transfer transaction. `executeTransportPickup()` already handles:

- live transferable quantity,
- carrier capacity,
- shared `Inventory` transfer,
- rollback if lifecycle commit fails,
- transition `assigned → in-transit`.

Unload remains `executeTransportUnload()` into `SettlementEconomy.items`.

## 2. Existing mining seam

### `src/terrain/resourceDeposits.ts`

Relevant types/symbols:

- `DepositTarget`
- `MineResult`
- `ResourceDeposits.queryNearest()`
- `ResourceDeposits.mine()`
- `SettlementMiningHooks`

`DepositTarget.id` is the existing stable `NaturalResource.id` used for depletion persistence. Reuse it as resource-site identity.

Important ownership boundary:

- `ResourceDeposits` owns/render-resolves a loaded deposit and delegates authoritative remaining amount to `ResourceDepletionState`.
- It must not become the owner of extracted ore inventories or transport commitments.

The resource-site inventory must survive when the rendered `DepositInstance` is absent.

### `src/terrain/depositMining.ts`

Reuse existing mappings such as:

- `ORE_ITEM`
- `oreEconomicKind()`

Do not duplicate ore-kind conversion in the new logistics code.

## 3. Current Miner flow to replace

### `src/ai/npcProfessionWork.ts::planOreGathering()`

Current flow:

```text
queryNearest()
→ mining.mine(target.id)
→ ctx.carried.add(...)
→ chained deposit action at landmarks.stockpile
→ ctx.carried.remove(...)
→ economy.add(oreEconomicKind(...))
```

This is the exact seam to change.

After 021, successful `mining.mine(target.id)` should deposit the returned item/count into the authoritative resource-site `Inventory` for `target.id`.

Remove the ore-specific dependency on transient `ctx.carried` and the chained direct settlement deposit for this path.

The Miner should finish extraction at the site. The Trader owns later movement.

Do not change unrelated profession uses of `NpcAgent.carried` (farmer, fisher, shepherd, herbalist, etc.).

## 4. Add one world-owned resource-site inventory store

Use a small dedicated owner keyed by resource id. Recommended shape is a focused module rather than adding another responsibility to `ResourceDeposits` or `TransportOrders`.

A suitable contract would be roughly:

```ts
type ResourceSiteInventories = {
  get(resourceId: string): Inventory | undefined
  getOrCreate(resourceId: string): Inventory
  entries(): ...
  serialize(): ...
}
```

Exact names are flexible, but ownership must be explicit and world-lifetime.

Use shared:

- `Inventory`
- `InventoryContentsSnapshot`
- `inventoryFromContents()`

from `src/items/Inventory.ts`.

Persist only non-empty sites.

Do not persist capacity metadata. The inventory is a storage ownership boundary, not a biological carry limit.

## 5. Persistence integration

### `src/persistence/saveData.ts`

`SaveData.resourceDeposits` already stores depletion only:

```ts
Record<string, number>
```

Keep that field unchanged. Add a separate optional/sparse field for extracted resource-site inventory snapshots, keyed by the same resource id.

Reason: natural-resource depletion and ownership of already-extracted goods are different authoritative concepts.

Use `InventoryContentsSnapshot`; do not invent a second item serialization shape.

Backward compatibility should follow the normal optional-field pattern: absent field = no stored remote goods.

### `src/app/createApp.ts`

The current long-lived `resourceDepletion` object survives world-bundle rebuild and resets only for a genuinely new world. The resource-site inventory owner needs the same lifetime semantics.

Restore it from the initial save and pass it into `WorldBundle` creation rather than reconstructing it from rendered deposits.

### `src/app/worldBundle.ts`

Thread the resource-site inventory owner as a world-owned dependency alongside `resourceDeposits` / `transportOrders`.

Do not let settlement load/unload own this store.

### `src/app/saveState.ts`

Serialize the sparse remote-site inventories from the world-owned store.

Keep `resourceDeposits` depletion serialization separate.

## 6. Endpoint inventory resolution

### `src/world/transportOffscreen.ts`

`TransportEndpointLookup` currently exposes:

```ts
getHousehold(id)
getEconomy(settlementId)
```

Extend the lookup narrowly for resource-site inventory resolution, e.g. a `getResourceSiteInventory(resourceId)` callback.

Then extend:

```ts
resolveTransportEndpointInventory()
```

to handle the new endpoint variant.

Critical constraint: off-screen unload currently only needs the destination, but this resolver is the shared endpoint-to-inventory seam. Resource-site resolution must not require a loaded `ResourceDeposits` render instance.

Do not add world searching inside this function.

## 7. Endpoint position resolution for detailed pickup

Detailed Trader execution currently hard-codes household source resolution inside:

```ts
src/ai/npcProfessionWork.ts::planTransportOrderExecution()
```

For the new endpoint, factor the minimum shared source resolution needed so the Trader can obtain:

- source world position,
- source authoritative `Inventory`.

Do not put position onto `TransportOrder`.

The resource position should be derived from the deterministic resource identity/world resource model. If the existing resource query API does not resolve a resource id directly, add the smallest deterministic resolver around the existing natural-resource generation mechanism rather than requiring the visual deposit instance to be loaded.

Avoid a global scan of all generated resources.

## 8. Derived ore commitment accounting

`src/economy/foodTransportDemand.ts` is the pattern to copy, not necessarily the file to overload.

Food currently derives:

- incoming committed quantity,
- outgoing pre-pickup committed quantity,
- uncovered shortage,
- uncommitted source supply.

Create equivalent ore/resource-site accounting in a focused economy module if adding ore concerns to `foodTransportDemand.ts` would make the name/API misleading.

Required rules:

```text
incoming active order:
pending/assigned → requestedQuantity
in-transit       → claimedQuantity
terminal         → 0

outgoing site commitment:
pending/assigned only
```

After pickup, source inventory already lost the goods, so do not subtract the order again.

Support `excludeOrderId` during pickup revalidation, matching the food pattern.

## 9. Determine actual ore demand from existing economy state

Do not add a persistent `OreDemand`, `MineDeliveryNeed` or registry.

Inspect the existing `SettlementEconomy` production-shortage observations and concrete ore economic kinds. Use the smallest real demand signal already generated by current production.

Blacksmith currently consumes existing economy/item inputs through `preflightProductionInputs()` / `commitBlacksmithProduction()`; delivered ore should become visible through the normal economy state, not through a remote-source shortcut.

If multiple ore kinds are technically possible but only one currently produces a real downstream shortage, support that concrete kind first.

## 10. Trader integration

### `src/ai/npcProfessionWork.ts`

Existing `planTraderWork()` order is:

```text
resume active TransportOrder
→ food collection
→ local wood fallback
```

Preserve `findByCarrier()` as the first branch.

Add remote ore opportunity after urgent/current food collection unless current economy semantics provide a stronger priority reason.

Recommended first ordering:

```text
resume active order
→ settlement food shortage transport
→ remote ore transport
→ existing wood fallback
```

This prevents ore logistics from starving an already-working food-shortage slice.

Order creation must still create one immediately assigned order for this Trader and then call the same `planTransportOrderExecution()`.

## 11. Generalize `planTransportOrderExecution()` minimally

Current implementation assumes:

- every assigned source is `household`,
- every unload uses `settlement-storage`,
- household lookup comes from `HouseholdExchangeHooks`,
- pickup live quantity is food-specific.

021 should generalize source handling without creating a parallel executor.

A practical shape:

```text
assigned order
→ resolve source endpoint
→ resolve source position + Inventory
→ calculate source-specific live transferable quantity
→ executeTransportPickup()
→ shared unload action
```

Food source revalidation must continue using household surplus rules.
Resource-site revalidation must use site inventory minus other pre-pickup commitments.

Keep those calculations source-specific; keep movement/order lifecycle shared.

## 12. Resource-site inventory write must be atomic with mining result

`mining.mine(target.id)` mutates depletion before returning the yield.

After that succeeds, the yield must not be allowed to disappear because a temporary carrier rejects it.

Ensure the site inventory can accept the mining output by construction or preflight before mutation. Do not recreate the current failure mode in a new container.

For the first ore-only slice, an effectively unbounded site storage inventory is acceptable and simpler than inventing mine storage capacity.

## 13. Tests to touch

Prefer focused tests near the changed modules.

Add coverage for:

- `TransportEndpointRef` validation/save round-trip with `resource-site`,
- resource-site inventory serialization/restoration,
- Miner extraction deposits into site inventory and does not mutate settlement stock,
- reconstructed Miner cannot lose already-extracted site goods,
- outgoing commitment accounting does not double-promise ore,
- `planTransportOrderExecution()` handles household food and resource-site source variants,
- pickup uses the shared transaction seam,
- off-screen delivery still works with the new endpoint type present,
- old household-food tests remain unchanged/passing.

Persistence fixtures that explicitly construct full `SaveData` may need the new field only if it is required; prefer an optional field if architecture permits to avoid unnecessary migration churn.

## 14. Likely implementation order

1. Add resource-site inventory owner + tests.
2. Thread owner through app/world lifetime and persistence.
3. Extend `TransportEndpointRef` and endpoint inventory lookup.
4. Add deterministic resource-id → position resolution needed for detailed pickup.
5. Change Miner extraction to resource-site ownership.
6. Add derived remote-ore supply/commitment accounting.
7. Generalize Trader transport execution for resource-site pickup.
8. Add ore opportunity creation to `planTraderWork()`.
9. Run transport, mining, economy and persistence regression tests.

This order establishes authoritative ownership before changing NPC behavior.

## 15. Guardrails

Do not:

- create `RemoteSite`, `MineDeliveryManager` or a remote-logistics registry,
- put cargo into `TransportOrder`,
- make `ResourceDeposits` own transport decisions,
- attach extracted inventory only to streamed `DepositInstance`,
- keep ore in `NpcAgent.carried` after successful extraction,
- expose remote ore directly to production before delivery,
- add a global logistics tick,
- duplicate `ORE_ITEM` / `oreEconomicKind()` mappings,
- modify unrelated profession carry flows.

## 16. Documentation after implementation

Update state docs only for implemented behavior. In particular, `docs/state/npc.md` currently describes Miner ore as travelling in `NpcAgent.carried` straight to `SettlementEconomy`; that statement must change once 021 lands.

If new architectural/public functions/classes are introduced, add concise JSDoc and `@domain settlements-npcs` where useful for preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

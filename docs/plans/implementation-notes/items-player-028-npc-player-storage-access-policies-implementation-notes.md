# Implementation notes: NPC player-storage access policies

Plan: `items-player-028-npc-player-storage-access-policies.md`

## Current-code findings

- `items-player-027` is still `planned`. Its UI/application action for direct Player → NPC transfer does not exist yet, but the important lower-level primitive already does: `src/items/inventoryTransfer.ts::{transferInventoryCount, transferInventoryInstance}`. Reuse those for final ownership moves into `NpcAuthoritativeState.personalInventory`; do not wait for or duplicate the future 027 UI layer.
- `src/world/createPlacedContainers.ts` is the authoritative owner of player-container contents. `PlacedContainerEntry.contents` is an `Inventory`; `deposit/withdraw` and instance variants already preserve capacity, freshness and concrete instance identity.
- The same physical container identity survives pickup/re-placement via `id`, but current carried state keeps only `{ id, kind, contents }`. `PlacedContainerRecord`, `SaveCarriedContainer`, runtime `CarriedContainer`, `toRecord()` and `carriedNode()` currently know nothing about access policy. If policy is container-owned, all of those lifecycle shapes must preserve it or pickup will silently drop permissions.
- `WorldBundle` already carries `placedContainers.nodes()` plus `placedContainers.carriedNode()` through rebuilds. Keep policy inside that existing state path rather than adding a parallel bundle-level registry unless implementation proves the record shape materially worse.
- Persistence mirrors container shapes in `src/persistence/saveData.ts` (`SavePlacedContainer` / `SaveCarriedContainer`). Old saves must restore with a deny-by-default/empty policy. Do not make missing policy mean broad access.
- `src/world/helperDeliveryHooks.ts` is currently a narrow write-only NPC seam: target lookup, `hasRoom`, `deposit`. `npcLogistics.ts::planPlayerStorageDelivery` uses it for the existing helper food-delivery flow. This is the natural first consumer to migrate to policy-aware deposit semantics; do not leave a bypass where helper delivery can write into a container while the new policy says deposit is forbidden.
- `NpcAgent.carried` remains transient work/logistics cargo. `NpcAuthoritativeState.personalInventory` remains persistent personal ownership. The storage access layer must not choose between them; the caller/purpose does.

## Recommended ownership and types

Keep the policy owned by the physical player container, using one shared policy type imported by both runtime and save shapes. A practical placement is a small module near `createPlacedContainers.ts`, e.g. `src/world/playerStorageAccess.ts`, rather than embedding authorization logic in `NpcAgent` or Vue.

Prefer a persisted shape roughly equivalent to:

```ts
type StorageAccessGrant = {
  npcId: NpcId
  source: { type: 'manual' } | { type: 'work_contract', id: string } | { type: 'expedition', id: string }
}

type StorageResourceRule = {
  withdraw: StorageAccessMode
  deposit: StorageAccessMode
  minimumReserve?: number
  maxPerWithdrawal?: number
}

type PlayerStorageAccessPolicy = {
  grants: StorageAccessGrant[]
  // resource/default rules, kept minimal to actual V1 consumers
}
```

The important part is grant identity: revoke by `(npcId, source)` rather than by NPC alone, so ending an expedition cannot erase a separate manual grant.

Do not introduce persisted transient authorization state derived from an active assignment if the owning assignment system can recreate/remove the grant reliably. If temporary grants are persisted, their source id must be sufficient to validate/prune stale grants on restore.

## Container lifecycle

Extend the existing container lifecycle consistently:

- `PlacedContainerRecord.accessPolicy?`
- `SaveCarriedContainer.accessPolicy?`
- `PlacedContainerEntry.accessPolicy`
- runtime `CarriedContainer.accessPolicy`
- `spawn()` restores it;
- `place()` creates the restrictive default;
- `pickUp()` moves the same policy with the same `id`;
- `putDownCarried()` restores the same policy;
- `toRecord()` / `carriedNode()` serialize it.

Do not make NPC access possible while the container is carried. `PlacedContainers.find(id)` already naturally enforces this because carried containers are removed from `containers`; the policy can survive while `findTarget`/commit returns unavailable.

## Policy seam and mutation boundary

Do not expose raw `PlacedContainers.withdraw()` to NPC callers that are meant to obey policy. Add a policy-aware application/domain seam which performs the final revalidation immediately before mutation.

Keep read and commit separate:

```ts
evaluateStorageAccess(request) // advisory only
tryWithdraw(request)
tryWithdrawInstance(request)
tryDeposit(request)
tryDepositInstance(request)
```

The commit operation should re-resolve the placed container by id and then validate, in current state:

1. actor grant;
2. operation permission;
3. structured purpose/authority when mode is `assigned_only`;
4. concrete resource classification;
5. current amount/instance;
6. destination capacity;
7. `maxPerWithdrawal`;
8. reserve floor;
9. authoritative transfer.

Return semantic failure/result codes; NPC planners and UI should not infer failure reason from `0` alone.

For count-backed withdrawals into another `Inventory`, prefer `transferInventoryCount(entry.contents, destination, ...)` after computing the policy-safe amount. For concrete instances use `transferInventoryInstance(...)`. This avoids the existing dangerous shape `withdraw -> destination.add` and preserves freshness/identity atomically.

Deposits from an `Inventory` should likewise use the generic transfer helpers where the source is a real inventory (`NpcAgent.carried` or `personalInventory`). Keep raw `PlacedContainers.deposit*` as lower-level container mutation for existing player/container operations if needed; the NPC-facing seam is where authorization belongs.

## Resource classification

Do not create a second broad item taxonomy. Current `ITEM_CATALOG` already exposes intrinsic signals that can be composed:

- food / consumable metadata;
- `melee`, `ranged`, `defense` for weapons;
- `capabilities` for tools;
- `container` for liquid containers;
- treatment metadata for medicine.

One caveat: ammunition is not currently an intrinsic item flag; it is declared by ranged weapons through `RangedConfig.ammoKinds`. If V1 needs an `ammunition` policy class, derive it centrally from catalog ranged configs or add one canonical helper. Do not add a manually maintained ammo list beside the catalog.

Reserve keys should stay concrete/fungible (`ItemKind` for count-backed items). Do not apply one numeric reserve to heterogeneous `food` or `tool` categories.

For instance-backed resources, especially filled liquid containers and maintained weapons, access checks must operate on the concrete instance. A water rule must never turn a liquid-container instance into scalar water.

## `assigned_only` authority

Keep `StorageAccessPurpose` as small as the first real consumers require. It should carry identifiers, not booleans such as `assigned: true`.

The storage module must not import and interpret complete Work Contract / expedition / quest state. Prefer injected/narrow validators owned by those systems, or a validated authority token/id whose owner can confirm it at commit time.

Because `items-player-027` is not implemented yet, avoid coupling 028 to any future 027 UI/action type. Depend only on stable shared primitives (`NpcId`, `Inventory`, item metadata, transfer helpers).

## Existing helper-delivery migration

`HelperDeliveryHooks.deposit()` currently bypasses any future policy. Change this consumer as part of 028 so there is one authorization path for NPC → player-container deposits.

Preserve its current logistics behavior:

- planning checks target/room only as advisory;
- NPC physically travels;
- commit rechecks the live container;
- partial capacity acceptance remains possible where that flow expects it;
- undelivered cargo stays with the NPC.

The existing helper assignment itself can provide the structured deposit purpose/authority; it must not automatically imply withdrawal access.

## Tests worth adding

Focus unit tests on boundaries rather than NPC pathfinding:

- policy survives placed → carried → placed and save-shape serialization;
- old/missing policy restores restrictive defaults;
- two independent grants for one NPC; revoking one source preserves the other;
- withdraw denied after policy changes between advisory evaluation and commit;
- reserve + `maxPerWithdrawal` under sequential NPC commits;
- failed destination capacity leaves source unchanged;
- concrete instance withdrawal preserves instance id/state;
- carried container is unavailable to NPCs while keeping its policy;
- deposit allowed while withdrawal forbidden;
- existing helper delivery cannot bypass deposit policy.

Use existing `inventoryTransfer` tests as the atomic-transfer contract; do not duplicate all Inventory behavior in storage-policy tests.

## Main implementation risk

The largest risk is creating two mutation paths: policy-aware NPC storage access plus legacy helper/direct calls to `PlacedContainers.deposit/withdraw`. During implementation, search all NPC-side callers of those raw methods/hooks and route them through the policy seam. Player UI/container interactions may remain direct because the player is the owner, but NPC access must have one authoritative gate.
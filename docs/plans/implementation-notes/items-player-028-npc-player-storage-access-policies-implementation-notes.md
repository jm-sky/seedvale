# Implementation notes: NPC player-storage access policies

Plan: `items-player-028-npc-player-storage-access-policies.md`

## Recon outcome

The two-stage split is supported by the current codebase.

Stage 1 can be implemented without inventing new NPC role state or item ownership:

- actor authorization can be resolved from existing authoritative systems;
- the container already has stable identity and one authoritative `Inventory`;
- generic atomic inventory transfer helpers already exist;
- helper delivery is a real NPC-side deposit consumer that can prove the policy gate;
- resource/category rules and assignment-aware authority are independent complexity and can safely move to `items-player-032`.

Do not pull Stage 2 concerns back into this implementation unless current code makes the Stage 1 seam impossible without them.

## Current verified ownership

### Player containers

`src/world/createPlacedContainers.ts` is authoritative for player-owned chest contents.

Current relevant shapes:

- `PlacedContainerRecord` — persisted placed container;
- `SaveCarriedContainer` — persisted carried container;
- `PlacedContainerEntry` — live placed container with `contents: Inventory`;
- internal `CarriedContainer` — currently `{ id, kind, contents }`;
- `toRecord()` / `nodes()` — placed serialization;
- `carriedNode()` — carried serialization;
- `spawn()` — restore placed record;
- `pickUp()` — moves the same `Inventory` from placed to carried;
- `putDownCarried()` — moves it back;
- `adoptCarried()` — restores carried save state.

The same `id` survives pickup and re-placement. Store the policy on the same lifecycle path. A parallel registry keyed by id is unnecessary unless implementation finds a concrete blocker.

Expected Stage 1 extensions:

```text
PlacedContainerRecord.accessPolicy?
SaveCarriedContainer.accessPolicy?
PlacedContainerEntry.accessPolicy
CarriedContainer.accessPolicy
```

`place()` should create the restrictive default. Missing/legacy `accessPolicy` in `spawn()` / `adoptCarried()` must restore the same restrictive default.

### WorldBundle / persistence

Existing rebuild flow already carries `placedContainers.nodes()` and `placedContainers.carriedNode()`. Keeping policy inside those shapes automatically follows the established world-bundle ownership path.

`src/persistence/saveData.ts` mirrors placed/carried container save data. Update its corresponding validation/normalization without adding a new top-level storage-policy registry.

Do not bump save version mechanically for an additive optional field if current persistence conventions allow defaulting missing data.

## Stage 1 policy shape

Keep the persisted policy deliberately small:

```ts
type StorageAccessEffect = 'allow' | 'deny'

type StorageActorPolicy = {
  default: StorageAccessEffect
  companions?: StorageAccessEffect
  hired?: StorageAccessEffect
  npcs?: Partial<Record<NpcId, StorageAccessEffect>>
}

type PlayerStorageAccessPolicy = {
  withdraw: StorageActorPolicy
  deposit: StorageActorPolicy
}
```

A small module such as `src/world/playerStorageAccess.ts` is the natural owner for:

- types;
- default construction/normalization;
- pure actor policy evaluation;
- policy-aware transfer seam.

Do not embed evaluator logic in Vue, `NpcAgent`, or `createPlacedContainers.ts` beyond storage/lifecycle plumbing.

### Canonical precedence

Pure evaluator semantics:

```text
explicit npc rule
→ matching group rules
→ default
```

If multiple groups match:

```text
any deny → deny
else any allow → allow
else default
```

This avoids ordered-array semantics and produces a safe deterministic result for NPCs that are both companion and hired.

## Dynamic group resolution

### `companions`

`src/settlement/npcState.ts::NpcAuthoritativeState.accompanyCommitment` is the authoritative source-neutral accompany fact.

Do not add/persist:

```ts
npc.isCompanion
```

or a storage-specific companion membership cache.

The policy layer should receive/access a narrow resolver keyed by `NpcId`, backed by the authoritative NPC state registry. Membership is evaluated again at commit.

### `hired`

`src/world/createWorkContracts.ts::WorkContracts.findActiveWorkByNpc(npcId)` is the authoritative active paid-work lookup.

Do not duplicate assignment state into the NPC or storage policy.

Use a narrow resolver/predicate so `playerStorageAccess.ts` does not need to understand full Work Contract records. The resolver can answer only whether the actor currently has an active paid assignment.

Because an escort can also have an accompany commitment, the actor may match both groups. The deny-safe group merge handles this without introducing group priority.

### Missing/unloaded NPCs

The policy is keyed by stable `NpcId`; runtime mesh/agent presence is not authorization state.

Explicit `npcs[npcId]` entries remain harmless if the NPC is unloaded, dead, or no longer present in runtime presentation.

Dynamic group membership should resolve `false` when its authoritative source cannot establish active membership.

## Policy-aware transfer seam

Keep read/evaluate separate from commit.

Suggested conceptual API:

```ts
evaluateStorageAccess(request)
tryWithdraw(request)
tryWithdrawInstance(request)
tryDeposit(request)
tryDepositInstance(request)
```

Do not over-generalize request purpose in Stage 1. `StorageAccessPurpose`, assignment tokens, resource classes and reserve rules are Stage 2.

A Stage 1 transfer request needs only what is necessary to authorize actor + operation and execute the concrete inventory move.

### Commit ordering

At commit, re-resolve in this order:

1. placed container by id;
2. current policy;
3. explicit actor override;
4. current companion/hired predicates;
5. selected operation permission;
6. current source resource / instance;
7. destination capacity;
8. authoritative inventory mutation.

Advisory evaluation must never become a reservation or durable authorization token.

### Carried containers

`PlacedContainers.find(id)` naturally returns nothing for the currently carried container because pickup removes it from the placed collection.

Preserve that property. The policy follows the carried record but NPC access should return a semantic unavailable/not-world-accessible failure until the chest is put down again.

## Atomic transfer reuse

`src/items/inventoryTransfer.ts` already exposes:

- `transferInventoryCount(source, destination, kind, n, nowDays)`;
- `transferInventoryInstance(source, destination, instanceId)`.

Both preflight destination capacity and preserve source state on failure. Count transfers preserve freshness through `removeWithFreshness` / `addWithFreshness`; instance transfers preserve concrete instance identity.

Use these whenever both ownership sides are real `Inventory`s.

Do not implement NPC withdrawal as:

```text
PlacedContainers.withdraw()
→ destination.add()
```

because the second step can fail after source mutation.

Raw `PlacedContainers.deposit*` / `withdraw*` can remain for existing player container actions; the important boundary is that NPC-side access covered by this feature has one policy-aware gate.

## Helper delivery migration

`src/world/helperDeliveryHooks.ts` currently exposes:

```ts
findTarget(containerId)
hasRoom(containerId, kind)
deposit(containerId, kind, amount, nowDays?, batches?)
```

`deposit()` directly delegates to `containers.deposit()` and therefore has no actor identity.

`src/ai/npcLogistics.ts::planPlayerStorageDelivery` is the existing consumer.

Change the narrow helper seam so commit can identify the delivering `NpcId` and pass through Stage 1 deposit authorization.

Preserve existing logistics semantics:

- candidate generation remains advisory;
- physical travel remains unchanged;
- commit rechecks live target and capacity;
- partial deposit stays possible where current helper flow expects it;
- remainder stays with `NpcAgent.carried`;
- helper assignment by itself does not imply withdrawal access.

Do not add a `helpers` storage group in Stage 1 unless current implementation proves there is no practical way to configure the existing consumer through explicit NPC/group policy. The agreed public selectors are `companions`, `hired`, plus explicit NPC override.

## Destination ownership stays with caller

Stage 1 does not choose between:

- `NpcAuthoritativeState.personalInventory`,
- `NpcAgent.carried`,
- `NpcAuthoritativeState.transportCargo`.

Caller/action owns that semantic decision and passes the correct inventory to the transfer seam.

This avoids turning storage access into another logistics or equipment owner.

## UI integration

Existing `src/ui-vue/screens/ContainerScreen.vue` and the container action/store flow already own chest interaction presentation. Extend that surface rather than adding a separate companion/storage manager screen.

Relevant current integration points to verify during implementation:

- `src/ui-vue/screens/ContainerScreen.vue`;
- `src/ui-vue/store.ts` container-screen state/actions;
- `src/app/actions/containerActions.ts` opening/refreshing a placed chest;
- existing NPC/villager presentation data if a selector is needed for per-NPC override.

Prefer a compact permissions section with operation-level controls.

Do not expose a generic ordered rule editor in Stage 1.

All writes should route through an application action such as a focused `updatePlayerStorageAccessPolicy(containerId, patch)` rather than mutating a Vue copy and hoping save state catches up.

## Persistence/default normalization

Provide one canonical `createDefaultPlayerStorageAccessPolicy()` / normalization helper and reuse it for:

- fresh `place()`;
- missing policy on `spawn()`;
- missing policy on `adoptCarried()`;
- save-data validation/defaulting;
- tests.

Avoid several independent `{ default: 'deny' }` literals that may diverge when Stage 2 extends the schema.

Stage 2 should be able to migrate/extend this type additively rather than replacing container ownership.

## Tests worth adding

Focus on pure boundaries:

- default policy is withdraw deny + deposit deny;
- explicit NPC allow/deny beats groups;
- companion + hired with one deny resolves deny;
- only allow matches resolves allow;
- no match uses default;
- companion result changes when `accompanyCommitment` changes before commit;
- hired result changes when active work assignment changes before commit;
- placed → carried → placed preserves the exact policy;
- save/restore preserves policy;
- missing old-save policy defaults restrictive;
- carried container cannot be committed against by NPC;
- count transfer failure leaves source unchanged;
- instance transfer preserves id/state;
- withdraw and deposit are independent;
- helper delivery cannot bypass deposit policy;
- player-side chest actions are unaffected.

Use existing `inventoryTransfer` tests as the transfer contract rather than duplicating all `Inventory` behavior.

## Stage 2 boundary

Do not implement these in 028:

- item/category classifier;
- resource-specific overrides;
- `assigned_only`;
- `StorageAccessPurpose`;
- Work Contract / expedition authority validation beyond the `hired` boolean selector;
- source-identity grants;
- reserve floors;
- per-withdrawal maximum;
- autonomous food/water acquisition from player storage;
- work-material or expedition provisioning semantics.

The Stage 1 seam should accept concrete item/instance transfer requests without interpreting why that resource is being moved. `items-player-032` will add that second authorization dimension.

## Main implementation risks

1. **Policy loss during pickup.** Current carried shape has no policy; update every placed/carried conversion path together.
2. **Duplicated companion/hired state.** Resolve from existing authoritative systems at evaluation/commit.
3. **Legacy NPC bypass.** `HelperDeliveryHooks.deposit()` must not remain a direct unguarded write path.
4. **Unsafe withdraw-then-add.** Reuse `inventoryTransfer` for true ownership moves.
5. **Stage 2 leakage.** Keep Stage 1 actor authorization independent of resource taxonomy and assignment authority.
6. **UI becoming source of truth.** Persist policy on container state; Vue only edits through actions.

## Recommended implementation order

1. Add policy types/default/evaluator tests.
2. Thread policy through placed/carried/runtime/save container shapes.
3. Add narrow authoritative group resolvers.
4. Add policy-aware transfer API using inventory transfer primitives.
5. Migrate helper delivery deposit.
6. Add UI editing and refresh wiring.
7. Add persistence/TOCTOU/regression tests.

Add JSDoc to public policy evaluation/transfer functions and the central policy type when useful for preflight discovery; prefer `@domain items-player`.

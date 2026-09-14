# Implementation notes: NPC player-storage resource and context rules

Plan: `items-player-032-npc-player-storage-resource-and-context-rules.md`

## Current-code findings relevant to Stage 2

This plan deliberately depends on `items-player-028` rather than rebuilding storage authorization.

The current codebase already provides the lower-level pieces Stage 2 should compose:

- `src/world/createPlacedContainers.ts` — authoritative physical player-container identity and `Inventory` contents;
- `src/items/inventoryTransfer.ts` — atomic count/instance ownership moves;
- `src/items/Inventory.ts` — freshness, instances, capacity and concrete inventory ownership;
- `src/settlement/npcState.ts::NpcAuthoritativeState.personalInventory` — persistent personal NPC ownership;
- `NpcAgent.carried` — transient work/logistics cargo;
- `NpcAuthoritativeState.transportCargo` — distinct transport-order cargo; do not merge it with the other two;
- `src/world/createWorkContracts.ts::WorkContracts.findActiveWorkByNpc()` — canonical active paid-work lookup;
- `NpcAuthoritativeState.accompanyCommitment` — canonical source-neutral current accompany fact;
- existing NPC need/work/equipment/provisioning consumers should remain owners of why/how much an NPC needs.

The Stage 2 implementation must first inspect the final API produced by `items-player-028` and extend that concrete seam. Do not preserve speculative names from this document if Stage 1 landed with an equivalent but different API.

## Required Stage 1 contract

Before implementing Stage 2, verify that `items-player-028` provides:

1. container-owned persistent `accessPolicy`;
2. separate actor-level `withdraw` and `deposit` decisions;
3. default/group/explicit-NPC authorization;
4. current-state actor/group revalidation;
5. one NPC-facing evaluate/commit seam;
6. atomic count/instance transfer path;
7. no NPC-side raw-container mutation bypass for the migrated consumers.

If any of those invariants differ in the final Stage 1 code, adapt this plan to the implemented ownership rather than introducing a second seam.

## Additive policy shape

Stage 2 should extend the existing policy rather than nest a new independent policy object beside it.

A reasonable conceptual shape is:

```ts
type StorageAccessMode = 'forbidden' | 'allowed' | 'assigned_only'

type StorageResourceRule = {
  withdraw?: StorageAccessMode
  deposit?: StorageAccessMode
  minimumReserve?: number
  maxPerWithdrawal?: number
}

type PlayerStorageAccessPolicy = {
  // Stage 1 actor rules
  withdraw: StorageActorPolicy
  deposit: StorageActorPolicy

  // Stage 2 additions
  categoryRules?: Partial<Record<ItemCategory, StorageResourceRule>>
  itemRules?: Partial<Record<ItemKind, StorageResourceRule>>
  grants?: StorageAccessGrant[]
}
```

Exact fields should follow the final Stage 1 code and the canonical category type that exists at implementation time.

Do not encode Stage 2 as a parallel `advancedAccessPolicy` with separate evaluation order.

## Authorization ordering

Keep authorization dimensions explicit.

Recommended evaluation order:

```text
1. Stage 1 actor-level operation permission
2. concrete resource identification/classification
3. specific item rule
4. category rule
5. fallback to Stage 1 operation result
6. structured purpose/authority validation when mode == assigned_only
7. destination capacity
8. maxPerWithdrawal
9. minimumReserve
10. atomic transfer
```

Important: a resource rule may narrow an actor-level `allow`, but must not widen an actor-level `deny`.

This avoids confusing cases where `food: allowed` accidentally lets an otherwise unauthorized stranger use the chest.

## Canonical item classification

Before adding any classifier, inspect the current item-category implementation.

Current repository already contains canonical item categorization work (including `src/items/itemCategories.ts` and its tests from `items-player-031`). Reuse that if it covers the needed classes.

Also inspect `src/items/items.ts` / the current catalog for intrinsic metadata such as:

- consumable/food;
- melee/ranged/defense;
- armor;
- tool capabilities;
- container/liquid-container metadata;
- treatment/medicine metadata.

Do not add a second manual list such as:

```ts
const STORAGE_WEAPONS = [...]
const STORAGE_TOOLS = [...]
const STORAGE_AMMO = [...]
```

unless no canonical source exists and the missing category is deliberately added to the item domain itself.

### Ammunition caveat

Historically ammunition is referenced by ranged-weapon configs rather than always represented by one standalone intrinsic flag. If that remains true, derive an `ammunition` category centrally from canonical ranged configs or extend the canonical item-category helper. Do not keep storage-only ammo knowledge.

## Specific item vs category precedence

Specific `ItemKind` rule should override a matching broad category rule.

Example:

```text
food: allowed
bread: forbidden
```

means all food is allowed except bread.

If an item matches more than one canonical category, avoid hidden category ordering. Prefer one of:

- explicit conflict resolution with `forbidden` winning; or
- categories designed to be mutually meaningful for the storage cases being exposed.

Choose and test one deterministic rule. Do not rely on object iteration order.

## Structured purpose / authority

Only `assigned_only` requires Stage 2 semantic authority.

Keep `StorageAccessPurpose` small and consumer-driven. Avoid a generic bag of booleans.

Good shape:

```ts
type StorageAccessPurpose =
  | { type: 'personal_need'; need: 'food' | 'water' }
  | { type: 'work_material'; workId: string; authorityId: string; itemKind: ItemKind; requiredAmount: number }
  | { type: 'assigned_item'; authorityId: string; itemKind: ItemKind }
  | { type: 'expedition_provisioning'; assignmentId: string; memberNpcId: NpcId; authorityId: string; itemKind: ItemKind; requiredAmount: number }
```

But do not add variants before a real consumer exists.

### Authority validation ownership

The storage module should not import a complete Work Contract/expedition/quest aggregate and decide whether it is valid.

Prefer narrow callbacks/resolvers injected into the storage-access seam, such as conceptually:

```ts
validateStorageAuthority(purpose, npcId, containerId): boolean
```

or separate validators owned by each domain.

The owning system remains authoritative for:

- assignment existence;
- assignment lifecycle;
- required quantity/loadout;
- work target;
- expedition member status;
- cancellation/completion.

The storage module asks whether the presented context is valid **now**.

## Work Contract integration

`WorkContracts.findActiveWorkByNpc(npcId)` is already the canonical broad `hired` predicate used by Stage 1.

Stage 2 must not confuse that broad group selector with a specific `assigned_only` authority.

For example:

```text
hired actor-level allow
+ tools assigned_only
```

means being hired is necessary for actor access, but the concrete tool still requires a valid work/assignment context.

If a Work Contract-specific `authorityId` is used, validate it against the current contract/assignment at commit rather than persisting a duplicate `activeContractId` on the NPC just for storage.

## Expedition provisioning integration

Before coding, inspect the final implementation state of `settlements-npcs-027-npc-expedition-assignment-and-provisioning.md` and its notes/code consumers. Plans are not source of truth.

The storage-access seam should expose enough read-only preflight to answer whether a required item/quantity is currently available under policy, but it must not own the complete multi-item provisioning transaction.

Recommended responsibility split:

```text
provisioning system:
  required loadout
  member
  completeness
  sequence/idempotency

storage access:
  source permission
  resource rule
  authority validity
  reserve/limit
  transfer
```

Do not mark an expedition member provisioned after only part of a required multi-item loadout succeeded.

If the current provisioning implementation already has a claim/transaction helper, reuse it. Do not introduce storage-specific long-lived reservations unless actual code proves they are necessary.

## Food need integration

Inspect the current food strategy path before integrating player storage.

The correct integration is as another bounded candidate in the existing strategy evaluation, not a new early branch on `NpcAgent`.

The storage candidate must be constrained by normal knowledge/context; do not scan every player chest each decision tick.

Useful candidate sources include only contexts the NPC already has reason to know, e.g.:

- assigned storage;
- camp/place context;
- current work target;
- explicit provisioning source;
- nearby known authorized chest.

The exact lookup should reuse current world/place/location mechanisms rather than adding a global container registry query loop.

Withdrawal of count-backed food should use the same atomic transfer path into `NpcAuthoritativeState.personalInventory` and preserve freshness.

Normal eat logic consumes it later.

## Water integration

Water must remain instance-backed where current item semantics require a filled liquid container.

Inspect current liquid-container helpers and NPC water-use flow before integrating.

Do not implement:

```text
chest.water -= 1
npc.water += 1
```

Instead transfer the concrete filled container instance into the caller-selected destination inventory and let existing water-use logic mutate/consume its contained liquid normally.

## Weapon/tool integration

Storage access does not decide equipment slots or desired loadout.

Before adding a consumer, inspect current post-`items-player-027` NPC equipment APIs. The caller should already know:

- which item is desired/assigned;
- why it is needed;
- destination inventory;
- whether it can be equipped/used.

The storage seam only authorizes and transfers.

Avoid importing equipment UI/state into `playerStorageAccess.ts`.

## Work-material integration

A work-material request should be bounded by the active work action.

The caller determines `requiredAmount` from the actual work recipe/step. Policy then only narrows it further.

Do not let `maxPerWithdrawal` become the requested amount.

Correct order:

```text
work says need 2 wood
→ destination can accept 2
→ policy max is 5
→ reserve allows 1
→ transfer 1 (or fail if the work consumer requires all-or-nothing)
```

Whether partial material pickup is semantically acceptable belongs to the work consumer, not the generic storage policy.

## Reserve implementation

Reserve should use a concrete fungible key with unambiguous count semantics, normally `ItemKind` for count-backed items.

At commit:

```ts
available = Math.max(0, currentCount - minimumReserve)
allowed = Math.min(requested, maxPerWithdrawal ?? Infinity, available)
```

Then apply the caller's all-or-nothing/partial semantics explicitly.

Do not cache `available` from planning.

For instance-backed items, do not invent numeric reserve semantics unless a concrete use case defines them cleanly.

## Temporary/source grants

Do not implement source grants automatically for every Work Contract/expedition.

First ask whether the relevant authority can be derived from the owning system at commit. Derived authority is cheaper and avoids stale duplicated lifecycle state.

Use persisted source grants only if a real requirement is:

> this specific source explicitly granted storage access, independently of broad actor group membership.

If added, key revocation by both actor and source identity.

Conceptually:

```ts
revokeGrant({ npcId, source: { type: 'expedition', id } })
```

must not remove:

```ts
{ npcId, source: { type: 'manual' } }
```

### Restore/pruning

A stale persisted source id must be harmless. Prefer lazy validation/pruning against the owning system over requiring all referenced source objects to be loaded at deserialization time.

## Deposit rules

Stage 1 helper delivery proves the actor-level deposit gate.

Stage 2 may add resource/purpose restrictions to the same path. Do not create a second deposit API.

When deposit source is a real `Inventory`, prefer the generic transfer primitives where their all-or-nothing semantics match the caller.

If existing helper delivery intentionally supports partial acceptance, preserve that behavior with a policy-aware bounded transfer wrapper rather than silently changing logistics semantics.

Reserve floors apply only to withdrawal.

## Failure/result model

Extend the Stage 1 semantic result rather than throwing for expected gameplay denials.

Useful reasons:

```text
actor_denied
resource_forbidden
assigned_context_required
invalid_assignment_authority
reserve_reached
operation_limit
resource_unavailable
destination_capacity
container_missing
container_not_world_accessible
action_no_longer_relevant
```

Keep technical details available to diagnostics/tests without spamming the player UI.

If Stage 1 already has a result type, extend it rather than creating a new Stage 2 result union.

## UI/persistence integration

Use the existing Stage 1 ContainerScreen permissions section.

Expose only rules that the runtime actually supports. Avoid a generic expression builder.

Persistence should remain additive on the same container-owned `accessPolicy`.

Normalization requirements:

- missing Stage 2 fields preserve Stage 1 behavior;
- unknown/invalid rule keys are rejected/defaulted consistently with save-data conventions;
- explicit zero reserve is valid;
- negative/non-finite reserve/limit values are rejected or clamped in one canonical normalization path;
- source-grant ids remain stable strings, not runtime object refs.

## Performance notes

Permission evaluation is expected to occur during bounded candidate evaluation and commit, not for every NPC against every chest every frame.

Avoid:

- scanning all player containers globally per NPC tick;
- recomputing broad category maps repeatedly if canonical helpers can answer O(1);
- serializing derived companion/hired/assignment membership into every chest;
- worker offload — this authorization/mutation path is small, synchronous and coupled to authoritative inventory state.

## Tests worth adding

### Rule resolution

- actor deny remains final even when resource says allowed;
- item rule overrides category rule;
- missing item/category rule falls back to actor-level operation permission;
- deterministic handling when multiple categories match;
- withdraw/deposit rule independence.

### Authority

- `assigned_only` without purpose is denied;
- invalid/stale authority is denied;
- valid authority allows only the requested bounded resource/context;
- authority revoked after planning but before commit is denied;
- being broadly `hired` is not enough for a specific `assigned_only` item unless validator accepts the context.

### Reserve/limits

- reserve never drops below configured floor across sequential NPC commits;
- max-per-withdrawal limits one request only;
- requested quantity smaller than max stays smaller;
- reserve and max combine correctly;
- failed/zero allowed quantity leaves inventories unchanged.

### Instances/freshness

- food freshness survives count transfer;
- liquid-container instance keeps id and liquid state;
- maintained/equipped-capable instance keeps current state;
- denied instance transfer does not mutate source.

### Grants

If source grants are implemented:

- two sources for one NPC coexist;
- revoking one source leaves the other;
- stale source after restore is harmless;
- manual override/grant remains independent from temporary source lifecycle.

### Consumer integration

- food/water strategy considers only bounded known/reachable authorized storage;
- work request cannot take unrelated resources;
- helper deposit still uses the same Stage 1 seam with Stage 2 resource checks layered on;
- provisioning does not mark complete after partial failure;
- no raw NPC-side `PlacedContainers.deposit/withdraw` bypass remains for integrated consumers.

## Main implementation risks

1. **Second taxonomy.** Reuse canonical item categories/capabilities.
2. **Authority duplication.** Validate against owning systems instead of persisting copied assignment truth.
3. **Policy widening.** Resource `allow` must never bypass Stage 1 actor `deny`.
4. **Planning/commit drift.** Re-resolve resource, authority, reserve and limits at mutation time.
5. **Over-generalized purpose union.** Add only variants needed by real consumers.
6. **Global storage search.** Integrate as bounded strategy candidates only.
7. **Provisioning ownership leak.** Storage access does not own multi-item completeness/lifecycle.
8. **Source-grant lifecycle complexity.** Prefer derived authority unless an explicit independent grant is really required.

## Recommended implementation order

1. Read final `items-player-028` code/tests and lock the extension point.
2. Reuse/extend canonical item category helpers.
3. Implement pure resource-rule resolution tests.
4. Add reserve/max enforcement to current commit path.
5. Add one narrow `assigned_only` authority consumer and validator.
6. Integrate additional consumers one by one, keeping their decision/quantity ownership outside storage.
7. Add source grants only if a concrete consumer cannot be represented safely by derived authority.
8. Extend UI/persistence after runtime semantics are stable.

Add JSDoc to the public rule-resolution/authority boundaries where useful for preflight discovery and prefer `@domain items-player`.

# Implementation Notes: NPC expedition assignment and provisioning

**Plan:** `docs/plans/settlements-npcs-027-npc-expedition-assignment-and-provisioning.md`  
**Reviewed:** 2026-09-15  
**Codebase:** `main`

## Review outcome

Plan can move to `planned`. The dependencies and reusable seams needed for the first slice are already present:

- `settlements-npcs-026` provides authoritative `NpcAuthoritativeState.personalInventory` plus generic inventory transfer helpers.
- `settlements-npcs-023` is implemented and owns generation-time role composition; there is no runtime profession-minimum manager to reuse.
- `settlements-npcs-019` is implemented and establishes the world-owned persistent-registry pattern and generic NPC travel continuity that `028` will consume later.
- `WorkContracts` and `TransportOrders` already expose active-assignment lookup by NPC, so expedition eligibility can avoid conflicting commitments without introducing a new global assignment framework.

The implementation should add one small world-owned expedition-assignment registry and a deterministic resolver/provisioning transaction around existing settlement/NPC/inventory state. It should not modify `NpcAgent` decision ownership or implement travel.

## 1. Authoritative data and identity

### Settlement population

Use `SettlementDef.families` as the authoritative generated population definition.

Relevant helpers:

- `src/settlement/npcIdentity.ts`
  - `settlementNpcId(settlementId, memberIndex)`
  - `flattenedSettlementMembers(def)`
  - `settlementNpcDescriptors(def)`

`flattenedSettlementMembers()` preserves the same family/member order used when assigning stable `${settlementId}:npc:${i}` identities. Candidate discovery therefore does not require a live `NpcAgent` or loaded settlement.

Candidate static facts come from each `FamilyMember` / `CharacterDef`:

- `age`
- `gender`
- `character.role`
- generated physical/personality data already attached to the member

Do not derive a second NPC identity from household, name or runtime-agent order.

### NPC mutable state

Use `SettlementsManager.getNpcState(npcId)` / `NpcStateRegistry` for authoritative mutable state.

`src/settlement/npcState.ts` currently owns:

- `health`
- `personalInventory`
- `helperAssignment`
- `activePlan`
- `postDeath`
- `temporaryConditions`
- `transportCargo`
- `accompanyCommitment`
- `travel`

Do not put the expedition assignment itself into each NPC state. It is a group commitment with one sponsor, destination and ordered member list, so duplicating it per member would create synchronization/idempotency problems.

## 2. Expedition assignment ownership

Follow the existing world-owned registry shape used by:

- `src/world/createTransportOrders.ts`
- `src/world/createWorkContracts.ts`

Recommended files:

- `src/world/expeditionAssignment.ts` — pure record/lifecycle helpers
- `src/world/createExpeditionAssignments.ts` — registry/store

Keep the registry plain-data and non-rendering.

Recommended record shape:

```ts
export type ExpeditionAssignmentState = 'forming' | 'provisioned' | 'ready'

export type ExpeditionAssignment = {
  id: string
  sponsorSettlementId: string
  destination: ExpeditionDestinationRef
  memberNpcIds: readonly [NpcId, NpcId, NpcId]
  state: ExpeditionAssignmentState
  createdAtDays: number
  provisionedAtDays?: number
  readyAtDays?: number
}
```

`destination` should be a small plain-data world/location reference accepted from the caller. Do not make this plan own cave/quest lookup or pathfinding. The exact destination union should reuse an existing stable location reference if one already fits; otherwise define the minimum generic `{ kind, id/x/z }` shape needed by downstream `028`, not a quest-specific object.

Registry invariants:

- one active expedition assignment per NPC;
- ordered member IDs remain stable once committed;
- no silent member replacement after commit;
- repeated restore does not create a second record;
- terminal/travel states are not added here — `028` owns movement lifecycle.

## 3. Candidate discovery and deterministic ordering

Create a pure resolver over a sponsor `SettlementDef` plus fresh authoritative lookups.

Candidate static filter:

- `age >= 18`;
- member belongs to the sponsoring `SettlementDef`;
- stable NPC id resolves through `settlementNpcId()`;
- male-only hierarchy remains intentional for this first abandoned-mine use case.

Mutable hard filter:

- `npcState.health.dead === false` and `postDeath === null`;
- no existing expedition assignment in the new registry;
- `npcState.helperAssignment === null`;
- `npcState.accompanyCommitment === null`;
- `npcState.travel === null`;
- `workContracts.findActiveWorkByNpc(npcId) === undefined`;
- `transportOrders.findByCarrier(npcId) === undefined`.

Do **not** reject merely because `activePlan !== null`; plans are normal NPC behaviour state, not an external long-lived commitment.

Do not invent `healthy`, `fit`, `miningSkill`, profession experience or an `incapacitated` flag. If a current temporary condition explicitly makes travel impossible at implementation time, add a narrow helper over that existing condition; otherwise health gating is alive/dead only in this plan.

Deterministic rank:

1. male, age 18–35, `role === 'miner'`;
2. male, age 18–35;
3. male, age 36–45.

Within a tier use stable settlement member order / NPC id as the final tie-break. Do not use `Math.random()` or the settlement generation RNG.

Physical SPEA values are not required for V1 ranking. Leaving them out makes the rule easier to reason about and avoids turning general strength/endurance into an undocumented mining-skill proxy.

## 4. Staffing safety is a dispatch-time household constraint, not a runtime profession manager

`src/settlement/professionStaffing.ts` owns only generation-time initial role composition. Its role preferences are not hard runtime minimums and should not be reused as if they were a live workforce manager.

For `027`, use a small pure `canDispatchParty()` policy over the actual current population:

- expedition members must all be adults;
- at least one non-expedition living adult must remain in the sponsor settlement;
- no household containing a minor may be left with zero living non-expedition adults;
- reserved home inhabitants should not be selected when their identity is marked/recognizable as reserved by the existing generation data;
- the full party is validated together, never one NPC at a time in isolation.

This naturally rejects a one-adult OUTPOST and most tiny settlements without adding size-specific magic numbers.

Do not enforce "one Farmer/Guard/etc. must remain" in this plan. The current code does not have a runtime profession-coverage contract, and inventing one here would create a second staffing system beside `professionStaffing.ts`.

## 5. Assignment commit order

Keep candidate resolution pure until the complete trio has passed every check.

Recommended sequence:

```text
resolve candidates
→ pick ordered top 3
→ validate incompatible commitments again
→ validate whole-party household safety
→ create one `forming` assignment
```

The second validation immediately before create is important because resolver output must not be treated as a reservation.

In JS the synchronous create operation is the commit boundary; do not mutate NPC inventories or external assignments before the registry accepts the expedition record.

If validation fails before create, return a typed failure reason and create nothing.

## 6. Provisioning source

Use the sponsoring `SettlementEconomy.items` as the V1 expedition provisioning source.

Why:

- `docs/state/settlements.md` defines it as the settlement-level concrete-item inventory;
- `Household.items` is family-owned pantry/property and should not be silently confiscated;
- it is already persistent through `EconomyRegistry` / `SettlementsManager`;
- it uses the same generic `Inventory` semantics as NPC personal inventory.

Resolve it through `SettlementsManager.getEconomy(sponsorSettlementId)`.

Do not fall back to arbitrary household inventories. If settlement storage lacks required equipment, provisioning fails explicitly. Acquisition/production/restocking is a separate economic problem, which is preferable to minting equipment or stealing it from a household.

## 7. Provisioning manifest

V1 manifest should be explicit and testable.

Per NPC:

- `pickaxe` ×1
- `knife` ×1
- `blanket` ×1
- `bandage` ×2
- food ×3, accepting `dried_meat` and/or `dried_fish` through one deterministic policy
- one filled `waterskin_medium` liquid-container instance

Shared expedition gear, owned by the first ordered member rather than a new group inventory:

- `shovel` ×1
- `firestarter` ×1
- `tent` ×1 instance

The first-member convention is deliberately simple and deterministic. `028`/later camp work can transfer ownership if needed; `027` should not introduce group inventory.

Use real existing item kinds/instances. Waterskins are instance-backed liquid containers (`src/items/itemInstances.ts`, `src/items/liquidContainer.ts`); require a real filled medium waterskin instance from source storage rather than adding a stack count or creating one during provisioning.

## 8. Provisioning transaction

Existing helpers in `src/items/inventoryTransfer.ts` are atomic per count/instance:

- `transferInventoryCount()`
- `transferInventoryInstance()`

`027` needs all-or-nothing semantics across the complete manifest.

Implement one narrow synchronous expedition provisioning transaction that:

1. resolves all three destination `personalInventory` objects;
2. selects exact source counts/instances, including exact waterskin/tent instance IDs;
3. preflights the **entire** manifest against source availability and cumulative destination capacity;
4. only after successful preflight performs transfers using existing generic helpers;
5. marks assignment `provisioned` only after every transfer succeeds.

Because source/destinations are all in-memory synchronous `Inventory` objects on the same main-thread call, preflight + commit has no async race window. Still treat an unexpected transfer failure after preflight as an invariant failure and roll back already moved entries before returning failure.

If rollback support becomes generic and clean, add a reusable batch transfer helper near `inventoryTransfer.ts`; otherwise keep the orchestration expedition-specific while reusing the primitive transfer functions. Do not duplicate freshness or instance transfer logic.

Provisioning must be idempotent by assignment state. Calling it again on `provisioned`/`ready` returns the existing result and performs no inventory mutations.

## 9. Food selection

Do not create `expedition_food`.

Use a deterministic preference, for example:

```text
dried_meat first
then dried_fish for any remaining required units
```

Preflight the combined requirement for all members before moving any food. `transferInventoryCount(..., nowDays)` preserves freshness batches.

## 10. Persistence and WorldBundle integration

Follow the same constructor-seed + snapshot pattern used by `TransportOrders`, `NpcStateRegistry`, households and economies.

Expected integration points:

- `src/app/worldBundle.ts`
  - create the registry once;
  - carry active records through rebuild;
- `src/app/saveState.ts`
  - include a synchronous assignment snapshot in save construction;
- `src/persistence/saveData.ts`
  - optional field for backward compatibility;
  - validate plain data conservatively;
- `SettlementsManager` or `WorldBundle`
  - expose only the narrow lookup/create/provision operations needed by quest/travel callers.

Do not create a second persistence path on each `NpcAuthoritativeState`; member ids are references to the existing registry-owned NPC state.

Legacy save without the field restores an empty expedition registry.

## 11. Interaction with downstream travel

`settlements-npcs-028` should consume only assignments in `ready` state.

`027` should not:

- write `NpcAuthoritativeState.travel`;
- estimate journey duration;
- move/reposition NPCs;
- change settlement membership/home;
- consume expedition provisions over time.

Those belong to shared travel/survival semantics already established by `019` and extended by `028`.

## 12. Failure result

Prefer a typed result instead of booleans so quest/debug callers can distinguish why dispatch is blocked:

```ts
type ExpeditionAssignmentFailure =
  | 'not-enough-candidates'
  | 'conflicting-assignment'
  | 'staffing-unsafe'
  | 'missing-settlement-storage'
  | 'missing-equipment'
  | 'inventory-capacity'
```

Do not encode user-facing Polish strings in the simulation layer.

## 13. Highest-value tests

Pure resolver/safety tests:

- tier ordering and stable tie-break;
- dead / child / existing-assignment / work-contract / transport exclusion;
- no household-with-children is left without an adult;
- one-adult outpost cannot dispatch;
- validation uses the full trio atomically.

Registry/persistence tests:

- member ids stay identical across snapshot/restore;
- one active assignment per NPC;
- repeated create for the same committed trio does not duplicate;
- legacy save/default gives empty registry.

Provisioning tests:

- exact per-member/shared manifest transfer from `SettlementEconomy.items`;
- filled waterskin/tent instances preserve instance ids/state;
- mixed dried meat/fish deterministic selection;
- missing one final item leaves source and all three personal inventories unchanged;
- destination-capacity failure leaves everything unchanged;
- repeated provisioning after success is a no-op;
- save/load after provisioning keeps assignment state and personal inventories without re-transfer.

## 14. Implementation order

1. Pure assignment types + registry.
2. Persistence/rebuild plumbing for the empty registry.
3. Candidate resolver + household safety helpers.
4. Commit API with conflict revalidation.
5. Provisioning manifest/preflight/rollback transaction.
6. Mark `provisioned` / `ready` and expose downstream lookup for `028`.
7. Focused tests, then update state docs only where a new authoritative boundary needs documenting.

## Pitfalls

- Do not put expedition state on `NpcAgent`.
- Do not treat `professionStaffing.ts` as a runtime workforce manager.
- Do not use `Household.items` as village provisioning stock.
- Do not use `transportCargo` or `NpcAgent.carried` for expedition belongings.
- Do not seed missing gear during provisioning.
- Do not create a group inventory.
- Do not replace a committed dead member silently.
- Do not let `028` travel states leak into this registry.
- Do not rely on incidental iteration order without stable NPC-id/member-order fallback.

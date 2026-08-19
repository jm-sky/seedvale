# Implementation Notes: NPC Helper Resource Delivery

**Plan:** `docs/plans/2026-08-19--167--npc-helper-resource-delivery.md`
**Reviewed:** 2026-08-19
**Status:** `planned`

## Review summary

Plan 167 has the correct architectural direction, but its most important constraint is stronger than the plan wording may initially suggest: **plan 164 is a real implementation dependency, not merely a future compatibility target**.

The current code already has most of the NPC-side transport seam needed for this feature. `NpcAgent` uses the shared `PlannedAction` / `ActionLifecycle` mechanism, and plan 156 established that wood, water and ore already use chained `goTo → execute → deposit` actions rather than separate transport frameworks. `NpcAgent` already owns a temporary `Inventory` for carried ore, while food currently follows a different path: gathering goes directly into `Household.stock` instead of becoming carried inventory. fileciteturn12file0L2-L3

The implementation should therefore **not create a Helper AI, Helper transport layer, Companion framework or new logistics manager**. The likely work is to add a player-storage destination to the existing action/decision flow and extend the already-generic resource transport seam so food can be carried to a generic `Container` once plan 164 provides that API.

The current `Inventory` is already generic and reusable by NPCs, but today its capacity is weight-based only. `ItemSize` and generic `Container` are part of plan 164, not current runtime contracts. The helper implementation must not invent a second capacity model or assume APIs from plan 164 before that plan lands. fileciteturn10file0L2-L2

---

## 1. Dependency on plan 164

### 1.1 Treat 164 as a hard prerequisite

Plan 167 depends on 164 because the helper target is explicitly a player `Container` / storage object. Plan 164 defines the generic `Container`, stable `containerId`, contents, capacity, `ItemSize`, persistence and NPC/logistics compatibility. fileciteturn3file0L2-L2

Implementation order should therefore be:

```text
164 Player Storage & Container
        ↓
validated Container runtime/save API
        ↓
167 NPC Helper Resource Delivery
```

Do **not** implement a temporary `PlayerStorage` interface in plan 167 and later migrate it to `Container`. That would create exactly the parallel mechanism both plans are trying to avoid.

If plan 164 has not actually been implemented when work on 167 begins, stop at the dependency boundary or implement only the portions of 167 that can be proven independent. Do not fake a storage API just to make the helper flow compile.

### 1.2 What 167 should consume from 164

The helper code should depend on the final generic storage contract, approximately at the domain level:

```text
container identity
container availability / existence
capacity check
accept item / quantity
stable world position
```

The exact method names must be taken from the **implemented 164 code**, not copied from this document or guessed from the plan.

The helper should not know whether the target is visually a chest, crate, barrel or another future container type.

### 1.3 Do not duplicate Container ownership

The authoritative quantity should remain owned by the container/storage model introduced by 164. A Three.js mesh is presentation/interaction only, consistent with the existing household/settlement storage decision. Plan 156 explicitly established this ownership pattern: physical storage props represent existing simulation state rather than owning it. fileciteturn12file0L2-L3

The helper action should therefore perform a domain transfer into the container, not mutate mesh state or maintain a second inventory hidden inside the helper system.

---

## 2. Existing NPC transport seam to reuse

`NpcAgent` already imports and uses:

- `ActionLifecycle`,
- `PlannedAction`,
- `DecisionContext`,
- `completeActionLifecycle`,
- `failActionLifecycle`,
- `replaceActionLifecycle`,
- `InteractionQueue`.

The agent's generic action model is explicitly documented as a `goTo → execute` pair parameterized by `PlannedAction`. Chained actions use `next`, and chain classification is already preserved with `chainKind`. fileciteturn8file0L2-L2 fileciteturn9file0L1-L2

Plan 156 confirms that this mechanism already handles:

```text
wood: chop → deposit
water: well → deposit
ore: mine → deposit
```

using the same chained action pattern. It also explicitly records that this generic transport contract was already implemented and should not be refactored just because another resource needs it. fileciteturn12file0L2-L3

### Implementation rule

Prefer extending the existing `NpcPlannedAction` / action-chain machinery with a generic destination representation over adding:

```text
HelperAction
HelperTransport
HelperDeliveryAction
HelperAI
```

A helper delivery should look conceptually like an ordinary NPC action chain:

```text
decision
  ↓
select food source
  ↓
goTo source
  ↓
execute gather
  ↓
carry food
  ↓
goTo player Container
  ↓
execute deposit
  ↓
complete
```

The helper-specific part should primarily be **why the decision was selected and which destination/resource it targets**, not how movement or execution works.

---

## 3. Important difference: food does not currently use NPC carrying

This is the most important existing-code discrepancy to account for.

Current NPC household logistics already have:

```text
ore → NPC Inventory → settlement deposit
```

and the same generic transport lifecycle is used for wood/water, but food currently gathers directly into `Household.stock`. Plan 156 explicitly notes that food already gathers straight into household stock. fileciteturn12file0L2-L3

Therefore plan 167 cannot simply "reuse the food transport code" because there is currently no player-storage food transport path.

The correct extension is to reuse the **generic transport/action mechanism**, while changing only the resource-source completion semantics needed for the helper target.

Possible conceptual seam:

```text
food source
   ↓
produce amount
   ↓
helper carrying
   ↓
player Container
```

rather than:

```text
food source
   ↓
Household.deposit(food)
```

Do not modify normal NPC food gathering so every farmer/helper suddenly uses player containers. The existing household food flow must remain unchanged for ordinary NPCs.

The helper target should determine the destination path.

---

## 4. Inventory: reuse the existing class, but do not overextend it

`src/items/Inventory.ts` is already explicitly generic and is already reused by `NpcAgent` for temporary ore carrying. It supports item counts and item instances, `canAdd`, `add`, `remove`, `totalWeight`, and a caller-supplied `maxWeight`. fileciteturn10file0L2-L2

This is the correct temporary carrier for helper deliveries if the chosen food is represented as an `ItemKind`.

Do not create:

```text
HelperInventory
DeliveryInventory
SupplierInventory
```

However, do not prematurely retrofit `Inventory` with player-storage semantics. Plan 164 owns the container capacity/`ItemSize` work.

### Conservation invariant

At every transfer boundary:

```text
source amount
+ NPC carried amount
+ target amount
= previous total
```

For failed actions, the item must remain in exactly one authoritative location.

Especially avoid this sequence:

```text
remove from source
→ add to NPC
→ add to target fails
→ forget to restore
```

Use the same atomic/conservation discipline already used by plan 156 transport flows. fileciteturn12file0L2-L3

---

## 5. Food ownership and household obligations

Plan 167 correctly says the NPC must not blindly donate all available food. The current household model is important here.

`Household` owns its own food/wood stock, with capacity/target/minimum policy, while `NpcAgent` is only a temporary carrier. Plan 156 explicitly preserves this ownership separation. fileciteturn12file0L2-L3

The helper should therefore not reason as:

```text
NPC inventory > 0 → donate everything
```

Instead, the decision/source layer must only offer food that is legitimately available for this purpose.

Prefer:

```text
household need / reserve
        ↓
existing household food policy
        ↓
available surplus
        ↓
helper delivery candidate
```

If the current food source API does not expose surplus independently from household stock, do not invent a second food-ownership model inside 167. Extend the existing domain boundary minimally so the amount available for external delivery can be calculated once.

The exact ownership rule should be based on the implemented `Household` API, not a duplicated numeric threshold in `NpcAgent`.

---

## 6. Decision integration: helper is a goal/pressure, not an AI mode

The plan's strongest architectural requirement is correct:

```text
NPC state
+ needs
+ problems
+ goals
+ pressures
+ relationships
+ profession
+ schedule
        ↓
existing decision
        ↓
existing strategy/action
```

The current `NpcAgent` already has explicit `choose` state and action selection, plus critical-need interruption. Critical needs can interrupt an action in flight, while normal schedule changes do not arbitrarily interrupt it. fileciteturn7file0L2-L2

Helper delivery should plug into this same decision point.

Do not add:

```ts
if (npc.helper) runHelperAI()
```

or a permanent helper branch before normal needs/schedule evaluation.

Instead, conceptually:

```text
choose()
  ├─ critical need?
  ├─ normal need?
  ├─ scheduled responsibility?
  ├─ existing work/action?
  └─ helper delivery candidate?
```

The actual ordering must follow the existing pressure/decision implementation. Do not hardcode the hierarchy from plan 167 if the current decision scorer already provides a reusable mechanism.

---

## 7. Critical interruption must remain authoritative

`NpcAgent` already has a critical-need interruption path. The current settlement architecture explicitly states that critical needs can interrupt `goTo` / `execute` actions, while ordinary schedule transitions do not. fileciteturn7file0L2-L2

A helper delivery must therefore behave like any other ordinary NPC action:

```text
helper delivery in progress
        ↓
critical own need
        ↓
existing interrupt mechanism
        ↓
helper action fails/pauses according to existing lifecycle semantics
        ↓
NPC handles need
```

Do not add a special helper interrupt path.

Also ensure interruption cannot duplicate or lose the carried food. If the NPC is interrupted after gathering but before depositing, the carried amount must remain represented in the existing NPC temporary inventory/state and must be handled by the normal action recovery rules.

This is likely one of the highest-value regression tests for 167.

---

## 8. Target storage must be a stable domain reference

Plan 167 explicitly requires a stable storage target. Plan 164 defines `containerId` as the identity to preserve through persistence. fileciteturn3file0L2-L2

Use:

```text
helper assignment
    ↓
targetContainerId
```

not:

```text
x/y/z position
```

and not:

```text
Object3D reference
```

The runtime lookup should resolve the current container object/state from the stable ID.

This is important for:

- world rebuilds,
- streaming,
- save/load,
- future multiple storage containers,
- avoiding stale Three.js references.

If the container is currently streamed out, the helper's decision should not depend on the mesh being present.

---

## 9. Container full / partial transfer

Do not model "storage full" as a helper-specific state.

The generic container contract from 164 should answer whether and how much can be accepted.

Preferred transfer shape:

```text
requested amount
        ↓
container capacity calculation
        ↓
accepted amount
        ↓
atomic transfer
```

If only part fits:

```text
NPC carries 2
container accepts 1
→ transfer 1
→ NPC still carries 1
```

Then the normal action/decision system decides what happens next.

If the target accepts zero:

```text
transfer 0
→ action fails/finishes cleanly
→ no retry loop
→ next decision cycle
```

Do not write:

```text
while (!storageFull) { ... }
```

inside helper logic.

The existing `ActionLifecycle` / action failure path should be the recovery boundary.

---

## 10. Player storage must not become a special NPC-only target

The container should remain generic:

```text
Container
 ├── player chest
 ├── household storage
 ├── settlement storage
 └── future containers
```

The helper should merely receive a target reference.

This is particularly important because plan 164 explicitly defines the container as something that future NPCs, household systems, settlement logistics and companions can all use. fileciteturn3file0L2-L2

A clean future shape is:

```text
NpcPlannedAction
  destination = container
```

rather than:

```text
NpcHelperPlannedAction
  playerChest = ...
```

The exact type should follow the existing action type contract and avoid making `PlannedAction` depend directly on UI/player concepts.

---

## 11. Position resolution

The current NPC movement code uses plain `THREE.Vector3` destination snapshots for actions, while stable domain objects are kept outside the movement target itself. `NpcAgent` documents this explicitly for landmarks. fileciteturn8file0L2-L2

Use the same separation for player storage:

```text
domain target: containerId
        ↓
resolve current world position
        ↓
NpcPlannedAction.destination = Vector3 snapshot
        ↓
goTo
```

Do not put a mutable `Object3D` into `NpcPlannedAction` just because the chest has a mesh.

If the container is not currently rendered, resolution must still be possible from simulation state when the existing hybrid/off-screen simulation requires it.

---

## 12. Relationship to the player

The plan says to reuse the existing player/NPC relationship mechanism. This should remain a decision input, not a separate assignment system.

Avoid:

```ts
helper.relationshipScore
```

if the repository already has a relation representation.

Instead, derive willingness/priority from the existing relationship lookup and existing decision/pressure mechanism.

The assignment itself may still need a small persistent record such as:

```text
helperAssignment:
  playerId / player reference
  targetContainerId
  resource
```

but this record is **not** a relationship. Keep those concepts separate:

```text
relationship → why NPC may want to help
assignment   → what NPC has been asked/allowed to deliver
```

Do not create `HelperRelationship`.

---

## 13. Persistence

Plan 167 requires helper assignment persistence, while plan 164 requires container persistence.

Keep them as separate pieces of state:

```text
NPC persistent state
  └── helper assignment → targetContainerId

Container persistent state
  └── contents
```

Do not serialize the entire container object into the NPC assignment.

On load/rebuild:

```text
NPC assignment
    ↓
containerId
    ↓
container registry/state lookup
    ↓
current target
```

If the target no longer exists, the assignment should degrade gracefully through the existing action failure/decision mechanism instead of producing a permanently stuck NPC.

Follow the repository's existing `SaveData` version/migration rules. Do not introduce a helper-specific save system.

---

## 14. Streaming and off-screen behaviour

The current settlement architecture already treats NPC simulation as independent of player proximity: `HOME_RADIUS` is independent from terrain loading, and settlements/NPCs are intended to behave when the player is far away. fileciteturn7file0L2-L2

The helper must preserve this.

Important distinction:

```text
simulation target exists
≠
rendered target mesh exists
```

Do not make helper delivery depend on:

- camera visibility,
- player being nearby,
- an active interaction prompt,
- a rendered chest mesh.

At the same time, do not add a helper-specific off-screen simulation loop. Reuse the existing NPC simulation fidelity and existing storage state model.

If a future 164 implementation only creates a container mesh when streamed in, the helper needs a domain-level container lookup that remains valid outside the render lifetime.

---

## 15. Multiple helpers and contention

The plan correctly says not to build a coordinator.

Start with independent NPC decisions:

```text
NPC A → same target
NPC B → same target
```

The transfer boundary must be safe under sequential simulation updates and capacity checks.

If the existing action/resource system has reservations, reuse them. Do not add `HelperCoordinator` or `HelperReservationManager` just for this feature.

A useful test is:

```text
container capacity = 1 item
helper A carries 1
helper B carries 1
A deposits
B attempts deposit
```

Expected:

- no duplication,
- no negative capacity,
- B retains or safely abandons its carried item according to the existing action failure policy.

The important invariant is conservation, not a sophisticated scheduling solution.

---

## 16. Assignment model: keep it minimal

The plan intentionally says that if no existing NPC goal/assignment mechanism exists, add only the minimum required mechanism.

Before adding a new type, inspect the current NPC state/decision/goal representation and existing player/NPC interaction commands.

If a reusable assignment structure already exists, extend it.

If it does not, the smallest useful shape is likely a data-only assignment, for example conceptually:

```text
resource delivery assignment
  targetContainerId
  resourceKind
  enabled
```

Do not create a generic command framework such as:

```text
NpcCommandManager
NpcOrderSystem
NpcTaskBoard
NpcAssignmentFramework
```

Those would be broader than plan 167 and would make the feature more expensive without solving a current problem.

---

## 17. Resource representation: prefer the existing domain vocabulary

Plan 164's `Container` is item-oriented, while settlement economy uses `EconomicKind` and household stock uses its own resource vocabulary. The current code deliberately keeps these layers distinct. `SettlementEconomy` is not player inventory, and `Household` stock is not NPC inventory. fileciteturn7file0L2-L2

Do not collapse these into one universal resource type merely to make helper delivery convenient.

The helper should bridge the existing concepts at a clear boundary:

```text
resource source / household policy
        ↓
ItemKind + quantity
        ↓
NPC Inventory
        ↓
Container contents
```

If food is currently represented by a specific item kind in the implemented item catalog, use that existing kind. Do not create `HelperFood` or `FoodResource` solely for this plan.

---

## 18. Water should be a configuration of the same mechanism

The plan's food-first approach is correct.

After food works, water should only require a different source/`ItemKind`/resource policy if the existing item/resource model supports it.

Do not copy the food delivery implementation into `deliverWaterToPlayer()`.

Target architecture:

```text
assignment.resource
        ↓
existing resource selection
        ↓
existing gather/collect action
        ↓
existing carry
        ↓
existing container deposit
```

If water's current household reserve is intentionally not an `ItemKind`/inventory resource, do not force it into player-container delivery merely to satisfy symmetry. The plan explicitly allows water to remain out of scope if the required bridge would need a new system.

---

## 19. Suggested implementation sequence

### Step 1 — Verify plan 164's actual implementation

Before touching NPC code, inspect:

- `Container` domain type/API,
- container registry/ownership,
- `containerId` lifecycle,
- capacity calculation,
- item transfer API,
- persistence,
- world-position lookup,
- streaming/rebuild integration.

Use the code as the source of truth.

### Step 2 — Trace the existing NPC transport chain

Read the current `NpcAgent` paths for:

- food gathering,
- wood chop/deposit,
- water duty/deposit,
- ore mine/deposit,
- `startAction`,
- `goTo`,
- `execute`,
- `next`,
- action failure/interruption.

Plan 156 already establishes that these flows share the generic action-chain contract. fileciteturn12file0L2-L3

### Step 3 — Identify the smallest generic delivery seam

The seam should answer:

```text
Can this action deliver ItemKind + amount to a Container target?
```

Keep it independent from the reason the NPC is delivering.

### Step 4 — Add helper assignment data

Only after confirming there is no existing assignment mechanism suitable for reuse.

Persist stable IDs, not object references.

### Step 5 — Add helper pressure/goal to existing decision selection

Do not create a helper mode or loop.

### Step 6 — Route food through the existing transport mechanism

Preserve ordinary household food gathering for non-helper NPCs.

### Step 7 — Add storage-capacity failure handling

Use the generic Container API and existing action lifecycle.

### Step 8 — Add persistence/rebuild handling

Verify assignment and target resolution after save/load and world rebuild.

### Step 9 — Add focused tests

Prefer pure/action/domain tests over large Three.js integration tests.

### Step 10 — Only then consider water

Implement water only if the existing resource/item contracts make it a direct reuse of the same mechanism.

---

## 20. Tests worth adding

### Assignment

- assignment can reference a stable container ID;
- missing target does not crash the NPC;
- assignment survives save/load if assignments are persistent state;
- loading/rebuilding does not leave a stale `Object3D` reference.

### Decision

- helper delivery is considered only when the assignment is active;
- critical own needs still win through the existing interruption/decision mechanism;
- normal schedule/profession continues to work when helper pressure is inactive;
- helper does not enter a permanent delivery loop.

### Food transfer

- food is gathered through the existing food source mechanism;
- helper carrying uses existing `Inventory` rather than a new carrier;
- successful deposit increases the target container;
- failed deposit does not lose food;
- partial capacity transfers only the accepted quantity;
- ordinary NPC household food gathering remains unchanged.

### Capacity

- full container causes clean action failure/completion;
- helper does not retry the same impossible transfer every decision tick;
- `ItemSize` and weight restrictions are delegated to the plan 164 container/inventory implementation rather than duplicated in helper code.

### Multiple helpers

- two helpers can target one container;
- no duplication/loss occurs when the second transfer finds the container full;
- each NPC retains correct carried state after a failed transfer.

### Interruptions

- helper gathers food;
- a critical NPC need interrupts before delivery;
- carried food remains accounted for;
- later decision-making can recover or abandon the delivery without duplication.

### Persistence

- assignment survives save/load;
- target container ID resolves after world rebuild;
- target disappearance results in a safe inactive/failing assignment rather than an NPC stuck in `goTo`.

---

## 21. Browser verification focus

This feature crosses simulation, world objects and UI/storage, so browser verification should focus on observable state rather than merely seeing an NPC walk.

Recommended scenario:

1. create/place a player container using plan 164;
2. assign an existing NPC as helper;
3. select food;
4. observe the NPC gathering it;
5. observe the NPC travelling to the target;
6. verify the container contents increase;
7. verify the NPC leaves and resumes normal activity;
8. make the container full and verify no infinite retry loop;
9. interrupt the helper with a critical need and verify carried resources are conserved;
10. save/load and verify the assignment and target survive;
11. move far enough away to exercise the existing off-screen/streaming behaviour where applicable.

Do not add a helper-specific frame loop or require the camera to observe the action.

---

## 22. Likely files / code areas to inspect

Confirm exact paths against current `main` before editing. The most relevant areas are:

- `src/ai/NpcAgent.ts` — action FSM, decision selection, temporary inventory, needs/interruptions;
- `src/items/Inventory.ts` — existing generic carrier already reused by NPCs; weight-based current contract; fileciteturn10file0L2-L2
- `src/simulation/types.ts` — `PlannedAction` contract;
- `src/simulation/actionLifecycle.ts` — action lifecycle/failure/completion;
- `src/simulation/actionControl.ts` — action interruption/control;
- `src/simulation/interactionQueue.ts` — only if a target interaction genuinely requires serialized access;
- `src/settlement/household.ts` — household food ownership/capacity;
- existing resource gathering/deposit code used by `NpcAgent`;
- plan 164's actual `Container` implementation and persistence once available;
- player/NPC relationship lookup already used by dialogue/reactions;
- existing NPC assignment/interaction UI, if any;
- persistence/save data only if helper assignment is made persistent.

Do not assume a new `src/helper/`, `src/logistics/` or `src/companion/` directory is appropriate.

---

## 23. Things to explicitly avoid

- `HelperAI` / `CompanionAI`;
- helper-specific movement;
- helper-specific transport;
- helper-specific inventory;
- helper-specific storage;
- `HelperStorage` / `CompanionStorage`;
- `HelperRelationship`;
- `HelperManager` / `LogisticsManager`;
- player-only food gathering implementation duplicated from NPC food gathering;
- direct mutation of Three.js container meshes as authoritative storage;
- position-based storage references instead of stable IDs;
- a helper `while` loop that repeatedly gathers/delivers;
- bypassing `PlannedAction` / `ActionLifecycle`;
- bypassing critical-need interruption;
- duplicating `ItemSize`, weight or capacity calculations from plan 164;
- making ordinary NPCs behave as helpers merely because the food transport path was generalized;
- making the NPC leave its household or become a companion;
- LLM-driven helper decisions.

---

## 24. Review conclusion

Plan 167 should be implemented as a **small extension of the existing NPC decision/action and resource-transport mechanisms**, with plan 164 supplying the generic storage destination.

The critical architectural shape is:

```text
existing NPC decision
        ↓
helper goal/pressure
        ↓
existing PlannedAction chain
        ↓
existing resource gathering
        ↓
existing NPC temporary Inventory
        ↓
generic Container from plan 164
        ↓
existing decision cycle
```

The most important implementation detail is that **food currently bypasses NPC carrying and goes directly into household stock**, while ore already uses `NpcAgent`'s temporary `Inventory`. Plan 167 should bridge that difference without replacing the normal household food pipeline. Plan 156 confirms the generic transport action chain already exists and should be reused rather than refactored into a helper-specific framework. fileciteturn12file0L2-L3

Plan 164 should therefore be completed first and treated as the storage contract. Once its `Container` API is real, 167 should add only the missing connection between an existing NPC decision and that generic container destination.

The resulting feature should feel like something the existing NPC simulation can decide to do — **not a new AI subsystem attached to NPCs**.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

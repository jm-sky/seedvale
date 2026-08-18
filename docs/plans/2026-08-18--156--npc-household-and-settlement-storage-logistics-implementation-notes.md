# Plan 156 — NPC Household and Settlement Storage Logistics — Implementation Notes

> Review against the current codebase and `docs/STATE.md`. These notes are implementation guidance for an AI agent: reuse existing ownership, action, inventory and economy mechanisms; do not create parallel systems.

## 1. Review decisions

The plan is valid, with these explicit decisions:

1. **Physical settlement storage is in scope.** It is a real world container representing the existing settlement stock, not a decorative prop.
2. **Ore remains settlement-level.** `iron`, `coal` and `gold` belong to `SettlementEconomy`; they do **not** become household resources.
3. **Household stock remains `food` + `wood`.** Do not broaden `HouseholdResourceKind` to all `EconomicKind` values.
4. **Water must use the generic transport path if its current implementation is bespoke.** First inspect the actual plan-122 implementation. If water already uses the same generic NPC `PlannedAction` / carrying / deposit contract introduced by this plan, leave it alone. If it has a dedicated water-only transport path, migrate it to the generic path rather than maintaining two mechanisms.
5. `Household.water` remains separate from economic stock unless there is an existing reason to change that ownership model. Water is a finite household reserve, not an `EconomicKind` merely because it is transported.

## 2. Current ownership model — preserve it

The current `Household` already owns household `food`/`wood` stock and a separate water reserve. Its registry lives with settlement state so streaming does not recreate household quantities.

```text
Settlement state
├── SettlementEconomy
│     └── settlement-wide EconomicStock
│
└── HouseholdRegistry
      └── Household
            ├── food / wood stock
            └── water reserve

NpcAgent
└── temporary carrying only
```

`EconomicStock` is already the common quantity primitive. `SettlementEconomy` already wraps settlement stock, reservations, production and shortage/surplus queries. Do not create another stock ledger.

The important distinction is:

```text
Household stock       = family pantry: food + wood
Household water       = separate finite reserve
SettlementEconomy     = settlement-wide economic stock, including ore
Physical storage      = world-facing representation of the above state
NPC carrying          = temporary transfer state
```

## 3. Do not make physical storage authoritative

A storage container is a view of simulation state.

Correct:

```text
Household / Settlement state
        ↓
Storage prop
        ↓
interaction UI
```

Incorrect:

```text
Storage Object3D
        ↓
quantity stored in mesh/userData
```

After stream-out/in, the prop must be recreated from the existing simulation owner and display the same quantity.

Do not add a second `StorageInventory` that duplicates `EconomicStock`.

## 4. Generic transport contract

The central implementation should be a small reusable transport representation on top of the existing `NpcAgent` action system, not a new logistics manager.

The conceptual payload is:

```ts
type CarriedResource = {
  kind: ItemKind / existing resource kind
  amount: number
}
```

Use the existing `Inventory` where it is already the canonical carrier. Do not introduce `ResourceInventory` or a second NPC inventory.

The generic action flow should remain:

```text
Decision
  ↓
source target
  ↓
goTo source
  ↓
source-specific gather/extract
  ↓
NPC carrying
  ↓
goTo destination
  ↓
destination-specific deposit
  ↓
carrying reduced atomically
```

The source remains authoritative for depletion/yield. The NPC action layer coordinates the transfer; it must not duplicate tree/deposit/water depletion logic.

## 5. Destination abstraction — keep it small

The generic transport needs to distinguish at least:

```text
Household destination
Settlement destination
```

Do not introduce a large destination framework unless the existing action code actually needs it.

A destination should provide the minimum operation required by the transfer:

```text
canAccept(kind, amount)
accept(kind, amount)
```

For household resources, this ultimately calls the existing household stock APIs.

For settlement resources, this ultimately calls `SettlementEconomy.add/remove/query` or a narrowly scoped extension if capacity is introduced.

The destination is a simulation target. The physical container is its presentation/interaction object.

## 6. Household semantics

`HouseholdResourceKind` must remain:

```ts
'food' | 'wood'
```

Do not change it to `EconomicKind`.

Existing household policy is intentionally small and family-sized. Preserve its `minimum`, `target` and `capacity` semantics.

For food/wood:

```text
NPC carrying
    ↓
Household.deposit(kind, amount, settlementEconomy)
    ↓
accepted up to household capacity
    ↓
overflow → SettlementEconomy
```

The current `Household.deposit()` already implements this ownership rule. Reuse it instead of adding another household deposit method with different semantics.

For ore:

```text
NPC carrying ore
    ↓
SettlementEconomy
```

Do not route ore through `Household.deposit()` because ore is deliberately not household stock.

## 7. Settlement storage semantics

The physical settlement storage is a **representation of settlement-wide stock**, not a new stock owner.

```text
SettlementEconomy
      ↓
Settlement storage prop
```

The settlement container may display:

```text
food
wood
iron
coal
gold
```

and water only if the chosen UI/storage model explicitly represents the separate settlement water state. Do not invent settlement water economic stock just to fill the UI.

The plan's desired future flow is valid:

```text
Household overflow → Settlement storage/economy
Settlement stock    → NPC carrying → Household
NPC ore             → Settlement storage/economy
```

The second direction (settlement → household) should only be implemented where the NPC decision/action flow actually needs it. Merely creating the storage does not require an automatic redistribution loop.

## 8. Capacity rules

The plan introduces physical storage capacity, but capacity must not accidentally create a second stock model.

For household storage, the existing household capacity is authoritative.

For settlement storage, decide capacity at the settlement-storage layer only if the plan requires a real full-storage case. If settlement stock currently has no capacity, do not silently add one to `SettlementEconomy` just because the prop is called a storage container.

If a physical settlement capacity is required, use a small explicit policy associated with the settlement storage concept and make overflow handling explicit. Do not modify `EconomicStock` into a universal capacity-aware inventory; that would affect unrelated economy users.

Important edge case:

```text
NPC carrying 5
Destination accepts 2
NPC keeps 3
```

Never delete the rejected remainder and never credit both source and destination.

## 9. Physical household containers

Each household needs a stable world-facing storage object associated with the household identity, not with a particular live NPC.

Use the existing settlement `Place` / prop / interaction architecture. Search the current code for how settlement places and interactables are registered and streamed before adding a new mechanism.

The stable association should be conceptually:

```text
householdId → storage place/prop
```

Do not use NPC id as the storage identity.

When a household streams back in:

```text
HouseholdRegistry.get(householdId)
        ↓
create/rebuild storage prop
        ↓
UI reads current stock
```

The household storage does not need its own independent lifecycle state beyond its identity and presentation configuration.

## 10. Physical settlement container

Settlement storage should be one stable container per settlement.

Identity:

```text
settlementId → settlement storage
```

Do not create one storage container per NPC, profession or resource.

Its world position should come from the existing settlement/place/landmark model where possible. Do not invent a parallel placement registry.

The visual can initially be simple. Correct simulation ownership and interaction are more important than a complex model.

## 11. Interaction / UI

Use the existing interaction and `Place` systems rather than creating a storage-specific interaction framework.

Initial interaction is read-only observation:

```text
Household Storage
food   N
wood   N
water  N
```

and:

```text
Settlement Storage
food   N
wood   N
iron   N
coal   N
gold   N
```

Only show resource kinds that are actually meaningful to that owner. Avoid misleading `0` rows for resources the storage does not own.

The UI should query current simulation state when opened, not maintain a cached quantity updated by rendering frames.

## 12. Water migration rule

Plan 122 already introduced a `Household.water` reserve and water presentation through barrel/trough concepts. The current code explicitly keeps this reserve separate from `EconomicStock`.

Before changing water, inspect the actual plan-122 action implementation in `NpcAgent`.

### If water already follows the generic contract

If it is already:

```text
NPC decision
 → PlannedAction
 → goTo source
 → collect
 → NPC carrying
 → goTo household
 → deposit
```

then **do not refactor it just for the sake of refactoring**. Reuse it as the first proven generic transport path and only connect it to the new physical household storage representation if necessary.

### If water has a dedicated transport path

If water uses special-case state transitions/FSM phases that duplicate generic carrying/deposit behaviour, migrate it to the generic transport contract.

Keep water-specific domain semantics:

```text
WaterSource = acquisition source
Household.water = finite household reserve
WaterBarrel / AnimalTrough = presentation/interaction
```

Do not turn water into `EconomicKind` merely to make the transport generic.

After migration, there must be one water transport mechanism, not a generic path plus a legacy water path.

## 13. Wood

Wood is already tied to the authoritative tree harvest/lifecycle path.

Preserve:

```text
Tree
 ↓
harvestWorldTreeFully / existing tree lifecycle
 ↓
wood yield
 ↓
NPC carrying
 ↓
Household.deposit('wood', ...)
```

Do not mint wood in the generic transport code.

The generic code should receive the successful yield from the tree domain operation.

## 14. Food

First locate the current food/garden gathering implementation.

Do not create a second food gather system.

The desired final ownership is:

```text
food source
 ↓
existing source/gather logic
 ↓
NPC carrying
 ↓
Household food stock
```

Consumption remains separate:

```text
NPC need
 ↓
Household food
 ↓
consume
```

If the current food path already performs these operations, adapt only the missing transport/storage representation.

## 15. Ore

Ore is explicitly different from food/wood.

Current economic model already treats:

```text
iron
coal
gold
```

as settlement-level `EconomicKind` stock.

The target is therefore:

```text
ResourceDeposits
 ↓
existing mining/depletion API
 ↓
NPC carrying iron/coal/gold
 ↓
SettlementEconomy
```

Do not create:

```text
Household ore stock
HouseholdResourceKind = all EconomicKind
```

The physical settlement storage simply exposes the resulting settlement stock.

## 16. NPC decision integration

Do not add `LogisticsManager`, `ResourceManager`, `TransportManager` or another AI manager.

The existing NPC decision architecture remains responsible for deciding **why** an NPC should gather/transport something.

The transport action is responsible for **how** the already selected resource gets moved.

Keep responsibilities distinct:

```text
Needs              → personal state
Household          → household stock/shortage/target
SettlementEconomy  → settlement stock/demand
Decision            → select useful work
PlannedAction       → execute movement + transfer
Source API          → authoritative depletion/yield
Storage destination → authoritative stock mutation
```

This is important for emergent behaviour: household shortage, settlement demand, profession and schedule can influence decisions without the logistics code becoming an AI planner.

## 17. Settlement → household transfer

The plan mentions:

```text
Settlement stock → Household
```

Do not implement a global automatic balancing loop.

When this direction is needed, an NPC should have an ordinary transport action:

```text
decision
 ↓
settlement storage/economy source
 ↓
NPC carrying
 ↓
household
```

This keeps both directions inside the same simulation model and allows later trade, shortages and social logistics to build on it.

## 18. Streaming and interruption

Simulation state must survive settlement stream-out according to the existing settlement registry model.

The most important invariant is conservation:

```text
source decrease == carrying increase
carrying decrease == destination increase
```

For an interrupted action, there must be one explicit owner of the carried amount. Never simultaneously restore the source and keep the NPC carrying amount.

Before implementing recovery behaviour, inspect how current NPC action cancellation/abandonment works. Reuse that lifecycle instead of creating a logistics-specific cancellation mechanism.

For stream-out during transport, prefer the existing NPC/settlement simulation ownership rules. Do not silently reset an in-flight carrier to zero.

## 19. Performance

Do not introduce a global per-frame logistics scan.

Use the existing NPC decision cadence and local target queries. Storage objects should be passive most of the time.

Avoid:

- scanning every storage every frame;
- scanning every resource for every NPC every frame;
- continuously rebuilding storage UI;
- creating a worker just for simple transfer bookkeeping.

A transfer is small state mutation and belongs on the existing simulation path unless profiling later proves otherwise.

## 20. Suggested implementation order

### Phase 1 — focused audit

Inspect only the concrete paths needed to answer:

1. Current NPC carrying representation and `Inventory` usage.
2. Existing `goTo → execute` action lifecycle.
3. Current water gathering/transport implementation from plan 122.
4. Current wood `chop → deposit` path.
5. Current food/garden gathering path.
6. Current ore extraction path and NPC ore work.
7. `HouseholdRegistry` access from settlement/NPC code.
8. `SettlementEconomy` registry/access.
9. Existing `Place` / interactable / settlement prop creation.
10. Settlement stream-out/in lifecycle for props and simulation state.

After these are answered, stop broad repository exploration.

### Phase 2 — generic carrying/deposit contract

Use the existing NPC action architecture to make one reusable transport path. Prefer adapting the already-working water or wood path rather than inventing a new abstraction from scratch.

The first generic path must support:

```text
source → carrying → destination
```

with explicit amount conservation.

### Phase 3 — household physical storage

Add the household storage prop and interaction as a representation of existing household state.

Then make wood and food visibly complete end-to-end flows.

### Phase 4 — settlement physical storage

Add one settlement storage container per settlement and bind it to `SettlementEconomy`.

Household overflow should become visible there.

### Phase 5 — water audit/migration

Do not automatically rewrite water. Compare its current implementation with the generic transport contract.

- already generic → reuse;
- bespoke → migrate;
- preserve `Household.water` ownership.

### Phase 6 — ore

Connect NPC ore carrying to `SettlementEconomy` using the same transport mechanism.

### Phase 7 — settlement → household logistics

Only add this direction if it is required by the acceptance criteria/current decision flow. Use the same generic action in reverse rather than another system.

## 21. Acceptance criteria corrections

The original plan's criteria should be interpreted as follows:

- "generic ItemKind" means generic transport/carrying, **not** that every resource becomes household stock;
- household storage contains `food`/`wood` and the separate water reserve representation;
- ore terminates in settlement stock;
- physical containers reflect simulation state but do not own it;
- water is migrated only if its current transport path is non-generic;
- no duplicate water, inventory, economy or logistics system is allowed.

## 22. Verification priorities

Browser verification should prove the simulation flow, not just that props render.

### Household

```text
NPC gathers wood
 ↓
NPC visibly carries it
 ↓
NPC reaches household destination
 ↓
Household wood increases
 ↓
NPC carrying decreases
 ↓
container UI shows new value
```

### Household overflow

```text
Household nearly/full
 ↓
NPC deposits
 ↓
household reaches capacity
 ↓
overflow appears in SettlementEconomy
 ↓
settlement container shows increased stock
```

### Ore

```text
NPC mines ore
 ↓
NPC carries ore
 ↓
SettlementEconomy increases
 ↓
settlement container shows ore
```

No household ore should appear.

### Water

Verify whichever result the audit requires:

```text
existing generic water path
→ no transport refactor
```

or:

```text
legacy water path
→ generic carrying/deposit path
→ same water reserve behaviour
```

### Streaming

At minimum:

- stream household out/in and verify stock is unchanged;
- stream settlement out/in and verify settlement stock is unchanged;
- interrupt/cancel transport and verify no duplication/loss;
- test two NPCs targeting the same source;
- test full household destination;
- test depleted source;
- verify no gather/deposit infinite loop.

## 23. Files likely relevant

Start with the actual current files rather than searching repository-wide:

- `src/ai/NpcAgent.ts`
- `src/settlement/household.ts`
- `src/economy/stock.ts`
- `src/economy/settlementEconomy.ts`
- `src/economy/npcWork.ts`
- `src/world/treeHarvest.ts`
- `src/terrain/resourceDeposits.ts`
- `src/terrain/depositMining.ts`
- `src/world/WaterSource.ts`
- settlement `Place` / prop / interaction files
- settlement streaming/manager files
- the plan-122 implementation notes and the actual code added for plan 122

These files are guidance, not a mandate to modify all of them. Modify the smallest existing set that owns each behaviour.

## 24. Anti-pattern checklist

Do **not**:

- create `LogisticsManager`;
- create `ResourceManager`;
- create `HouseholdInventory` alongside `EconomicStock`;
- create a second NPC inventory;
- put ore into household stock;
- make Three.js storage props authoritative;
- add water to `EconomicKind` solely for generic transport;
- duplicate water transport if it is already generic;
- create separate Wood/Food/Water/Ore transport systems;
- add a global per-frame logistics scan;
- introduce a new FSM parallel to `NpcAgent`;
- add SaveData persistence unless explicitly required and implemented.

## 25. Final implementation target

The desired architecture is:

```text
                         ┌─────────────────────┐
                         │   World source      │
                         │ tree / food / well  │
                         │ / ore deposit       │
                         └──────────┬──────────┘
                                    │
                              source API
                                    │
                                    ▼
                            ┌──────────────┐
                            │   NpcAgent   │
                            │ decision +   │
                            │ PlannedAction│
                            └──────┬───────┘
                                   │
                              carrying
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
             Household destination       Settlement destination
                    │                             │
             food / wood / water            EconomicStock
                    │                         via Economy
                    ▼                             ▼
          Household simulation state     Settlement simulation state
                    │                             │
                    ▼                             ▼
          Household storage prop        Settlement storage prop
                    │                             │
                    └───────────┬─────────────────┘
                                ▼
                         player observation
```

The key property is that **transport becomes generic while ownership stays domain-specific**. That gives plan 156 a reusable logistics mechanism without flattening the existing distinction between household pantry, household water and settlement economy.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

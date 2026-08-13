# Plan 069 — NPC Household Resources — Implementation Notes

> Review and implementation notes based on the current Seedvale codebase and
> `docs/STATE.md`, `docs/ROADMAP.md`, `docs/plans/README.md` and related plans.
>
> This document is intended to reduce agent exploration time and prevent
> duplicated/parallel systems.

## 1. Review summary

Plan 069 remains a valid and important foundation, but the original plan should
**not** be implemented as an independent economy/storage system.

The correct architectural direction is:

```text
World resources
      ↓
SettlementEconomy
      ↓
HouseholdStock
      ↓
NPC carrying / actions
      ↓
Needs / consumption
```

Where:

- `SettlementEconomy` represents settlement-level resources and development.
- `HouseholdStock` represents resources owned/stored by one family.
- NPC carrying represents temporary transport state, not another permanent store.
- `Needs` consume resources through household storage rather than directly from
  world sources.

Plan 069 should therefore establish the **household layer** while reusing the
existing settlement economy and action infrastructure.

Plan 071 should later extend this foundation into production, specialization,
surplus/shortage and settlement development.

---

## 2. Current relevant architecture

The current codebase already contains several pieces that 069 must extend rather
than replace.

### NPC

`NpcAgent` is the central integration point for:

- needs
- FSM/actions
- schedules
- personality/traits
- family context
- home/workplace
- resource actions
- stamina
- dialogue/relations

Do not introduce a separate household AI or resource manager.

Household resource decisions should eventually feed into the existing NPC
action/need pipeline.

### Needs

Current needs are intentionally simple:

```text
need increases
    ↓
threshold reached
    ↓
NPC finds/visits source
    ↓
need satisfied
```

069 changes the middle of this chain.

Target:

```text
need increases
    ↓
household stock checked
    ↓
resource available?
    ├─ yes → consume household resource
    └─ no  → create resource acquisition problem/action
```

Do not rewrite the entire `Needs` system.

### Settlement

Settlement creation already has:

- homes
- families
- NPCs
- livestock
- settlement economy
- development state
- interaction queues
- resource context

`createSettlement.ts` already passes the settlement economy into
`NpcAgent.create(...)`.

This is the preferred integration point.

### SettlementEconomy

The existing settlement economy should remain the owner of settlement-wide
stocks and development state.

069 must not create:

- another settlement inventory,
- another resource ledger,
- another development manager,
- another economy manager.

Households should reference/use the existing settlement economy.

---

# 3. Architectural decision

## 3.1 Ownership model

Use three distinct ownership levels.

### Settlement stock

Owned by the settlement:

```text
SettlementEconomy
```

Examples:

- communal wood
- communal food
- communal development resources

### Household stock

Owned by one family:

```text
HouseholdStock
```

Examples:

- food reserved for the family
- firewood at home
- household materials

### NPC carrying

Temporary transport:

```text
NPC carries resource
```

The carried resource should not become a fourth persistent storage system.

The important invariant is:

```text
resource has one owner/location at a time
```

Avoid duplicating the same quantity in:

- settlement stock,
- household stock,
- NPC inventory.

---

# 4. Household identity

A household should have a stable identity independent from individual NPC
agents.

Recommended conceptual structure:

```ts
type HouseholdId = string

type HouseholdStock = {
  id: HouseholdId
  resources: ResourceStock
}
```

The household should be derived from the existing family definition rather
than creating an unrelated family model.

Current settlement generation already has:

```text
settlement
  → families
      → members
          → NPC
```

069 should make this relationship explicit:

```text
Family
  ↓
Household
  ↓
home
  ↓
members
```

Do not duplicate family membership inside several systems.

---

# 5. Household ↔ home mapping

Existing settlement generation already assigns one family to one home.

Preserve this invariant:

```text
1 family = 1 household = 1 home
```

The existing `Place`/home abstraction should be reused.

Do not introduce a second home lookup mechanism.

The household should hold a reference/ID to the existing home `Place` rather
than duplicating its position.

---

# 6. Resource representation

069 should use the project's existing resource/item concepts wherever possible.

Do not introduce another enum with duplicate values such as:

```ts
HouseholdResourceType
```

if an existing resource/item type already represents the same concept.

The household stock should store quantities keyed by the canonical resource
kind.

Conceptually:

```ts
type ResourceStock = Map<ResourceKind, number>
```

or the project's existing equivalent.

Keep the representation intentionally simple.

069 is not the time to build a generic logistics framework.

---

# 7. Required household operations

The minimum API should support:

```text
get(resource)
has(resource, amount)
add(resource, amount)
remove(resource, amount)
transfer(...)
```

The exact API should follow existing project conventions.

Important:

- quantities must never become negative;
- transfers must be atomic from the perspective of simulation logic;
- zero/empty stock should be handled naturally;
- avoid creating objects for every tiny resource operation.

Prefer deterministic data structures.

---

# 8. Resource flow

The first useful flow should be:

```text
world resource
    ↓
NPC harvest/collect
    ↓
NPC carries resource
    ↓
household storage
```

and later:

```text
settlement stock
    ↓
NPC transports
    ↓
household stock
```

and:

```text
household stock
    ↓
NPC consumes
    ↓
need satisfied
```

This creates the first meaningful household economy without implementing
production chains.

---

# 9. Food and wood

Do not implement every possible resource in 069.

The first implementation should focus on resources that already participate
in NPC survival behaviour.

Recommended initial scope:

```text
food
wood
water
```

But treat water carefully.

Water is currently strongly tied to a world source/well interaction. It does
not necessarily need to become a persistent household stock in the first
increment.

Recommended distinction:

### Food

Persistent household resource.

```text
household food → NPC eats
```

### Wood

Persistent household resource.

```text
household wood → household consumption / future heating
```

### Water

Initially keep the existing source-based drinking behaviour.

Only add household water storage if the existing architecture clearly benefits
from it.

This keeps 069 small and avoids turning it into a general resource logistics
project.

---

# 10. NPC resource acquisition

The important behavioural change is:

Current:

```text
hungry
  → find food source
  → eat
```

Target:

```text
hungry
  → check household food
      ├─ available → take/eat
      └─ unavailable → acquire food
```

Likewise for wood:

```text
wood shortage
  → check household stock
      ├─ sufficient → no collection
      └─ insufficient → perform wood acquisition
```

The existing FSM/action system should remain responsible for executing these
actions.

Do not create a parallel:

```text
HouseholdAI
ResourceAI
EconomyAI
```

---

# 11. Acquisition should remain action-driven

A resource shortage should produce an existing/planned action.

Conceptually:

```ts
Need
  → goal
  → PlannedAction
  → resource acquisition
```

For example:

```text
Need: household food below target
        ↓
Goal: acquire food
        ↓
Action: gather food
        ↓
Action completes
        ↓
resource deposited into household
```

The agent should not teleport resources into the household.

The resource flow should correspond to visible world behaviour.

---

# 12. NPC carrying

NPC carrying should remain temporary state.

Example:

```text
household food = 2
NPC gathers 3 food
NPC carries 3
NPC returns home
NPC deposits 3
household food = 5
NPC carries 0
```

Avoid:

```text
household = 5
NPC inventory = 3
```

during the entire transport operation unless the 5 already included the 3.

The resource must have a single authoritative location.

---

# 13. Deposit location

The household's storage location should initially be abstract/logical.

Do **not** require a physical chest/storage prop for 069.

The existing home `Place` is sufficient as the logical destination.

Future plans may introduce:

```text
household
  → storage building
  → visual storage
  → capacity
```

but this is not required for 069.

This keeps the simulation decoupled from presentation.

---

# 14. Household resource targets

A household needs a small amount of policy describing desired stock.

Example:

```text
food target
wood target
```

Do not build a general-purpose economic planner.

The first implementation can use deterministic constants/configuration.

Conceptually:

```ts
type HouseholdResourcePolicy = {
  minimum: number
  target: number
}
```

The distinction is useful:

```text
below minimum → urgent problem
below target  → acquisition desirable
above target  → no acquisition
```

This gives the NPC simulation a simple source of emergent priorities.

---

# 15. Relationship with Needs

Do not duplicate needs and household shortages as two unrelated systems.

Recommended model:

```text
NPC personal need
    +
household resource state
    ↓
action selection
```

Examples:

### Hunger

```text
NPC hungry
    ↓
household has food?
    ├─ yes → eat
    └─ no  → acquire food
```

### Household wood

```text
household wood below minimum
    ↓
appropriate household member
    ↓
collect wood
```

This allows existing `Needs` to remain personal while household stocks become
shared family state.

This is preferable to making `Needs` itself the storage system.

---

# 16. Who acquires household resources?

Do not introduce a dedicated "household worker" role yet.

Use existing NPC role/action selection.

The household shortage should become a reason for an NPC to act.

Existing:

```text
profession
schedule
personality
traits
needs
```

can later influence who performs the task.

For 069, a deterministic/simple selection is sufficient.

Plan 060 can later improve this through schedule and trait overlays.

---

# 17. Relationship with plan 060

Plan 060 — NPC schedule/actions + trait overlays — should remain compatible.

069 should not require the full 060 implementation.

Instead:

```text
069
  → provides household resource state + acquisition goals

060
  → improves when/how/who performs those goals
```

This prevents 069 from becoming blocked by schedule work.

---

# 18. Relationship with plan 071

071 is the most important architectural dependency/consumer.

069 should provide the basic primitives that 071 can extend:

```text
HouseholdStock
SettlementEconomy
resource transfer
consumption
shortage
surplus
```

071 can later add:

```text
production
jobs
workshops
farms
specialization
trade
settlement development
```

Therefore 069 must avoid hardcoding assumptions that prevent production
resources from entering household stocks later.

---

# 19. Relationship with settlement development

Existing `SettlementEconomy` already has development concepts.

069 should integrate with these rather than replacing them.

Potential future flow:

```text
household/settlement surplus
        ↓
development requirement
        ↓
settlement economy
        ↓
building/development
```

For 069, only the storage/resource-flow foundation is required.

Do not implement autonomous settlement expansion here.

---

# 20. Relationship with plan 047

047 has already established deterministic village structure.

069 should consume the generated structure:

```text
VillagePlan
  ↓
families
homes
  ↓
Households
```

Do not modify village generation unless required to expose missing household
information.

Household simulation belongs above village generation.

---

# 21. Relationship with persistence

Current NPC runtime state is not generally persisted as a complete simulation
snapshot.

Therefore 069 should **not** attempt to solve complete NPC persistence.

However, household stock is a persistent-world concept and its architecture
should not make future persistence difficult.

Use stable identifiers:

```text
settlementId
householdId
resourceKind
quantity
```

rather than relying on runtime object references.

Future persistence can then serialize household state directly.

---

# 22. Streaming implications

Settlements can stream in/out.

Household state must therefore belong to the settlement simulation state, not
only to live `NpcAgent` objects.

Avoid:

```text
NpcAgent.householdStock
```

as the sole source of truth.

Prefer:

```text
Settlement
  → Household
      → Stock
```

and:

```text
NpcAgent
  → householdId
```

This is important for stream-out/stream-in correctness.

---

# 23. Performance

069 should be cheap.

Do not run a household resource planner every frame.

Prefer:

```text
per NPC:
    normal update

periodically:
    evaluate household resource state
```

Possible cadence:

```text
~0.5–2 seconds
```

or piggyback on existing decision/action evaluation.

The exact interval should follow existing NPC update architecture.

Do not introduce a timer per household.

A settlement-level scheduler or existing decision cadence is preferable.

---

# 24. Avoid unnecessary events

Do not create a large event bus just for household resources.

Simple method calls are preferable for the initial implementation.

Example:

```text
household.stock.add(...)
household.stock.remove(...)
```

If later systems need observability, an event/notification layer can be added
around the existing model.

---

# 25. Suggested implementation structure

The exact filenames should follow existing conventions, but conceptually:

```text
src/
  settlement/
    ...
    household.ts
    householdStock.ts
```

or an equivalent location matching the current domain organisation.

Possible types:

```ts
Household
HouseholdStock
HouseholdResourcePolicy
```

Keep the number of files small.

Do not create a directory hierarchy for every tiny concept.

---

# 26. Suggested Household model

Conceptually:

```ts
type Household = {
  id: HouseholdId
  settlementId: string
  home: Place
  memberIds: string[]
  stock: HouseholdStock
}
```

However, prefer existing family/member structures where possible.

If `Household` would duplicate family data, use the existing family as the
authoritative identity and add only the missing runtime household state.

This is an important review point:

> Do not create `Family`, `Household`, `FamilyData`, and `HouseholdData` as
> four overlapping representations of the same thing.

---

# 27. Initial API

The implementation should expose only what is needed.

Suggested conceptual API:

```ts
household.stock.get(kind)
household.stock.has(kind, amount)
household.stock.add(kind, amount)
household.stock.remove(kind, amount)

household.needsResource(kind)
household.shouldAcquire(kind)
```

If the existing architecture has better naming conventions, use those.

Avoid prematurely adding:

```text
market()
trade()
price()
production()
sell()
buy()
reserve()
forecast()
```

Those belong to later systems.

---

# 28. Resource reservation

Do not implement a sophisticated reservation system initially.

However, avoid multiple NPCs simultaneously deciding that the same resource is
available.

A simple solution is enough:

```text
check stock
remove/transfer resource when action actually starts/completes
```

If contention becomes a real problem, add reservations later.

---

# 29. Initial gameplay loop

The implementation is successful when this becomes observable:

```text
NPC family starts with small food/wood stock
        ↓
NPCs consume resources
        ↓
stock decreases
        ↓
household shortage appears
        ↓
NPC acquires resource
        ↓
resource is transported home
        ↓
stock increases
        ↓
NPCs continue normal life
```

This is more important than adding UI.

---

# 30. Debugging / observability

Because household simulation can otherwise be difficult to diagnose, add
developer-facing observability.

At minimum it should be possible to inspect:

```text
settlement
household
members
food
wood
minimum/target
current shortage
current acquisition action
```

Do not spam `console.log`.

Use the project's existing debug/logging mechanism if available.

Prefer structured information that can be filtered by:

```text
system = household
settlement = ...
household = ...
npc = ...
resource = ...
```

This will also help later work on the project's broader simulation observability.

---

# 31. Tests

Add focused tests for the pure household/resource layer.

Minimum cases:

### Stock

```text
empty stock
add resource
remove resource
cannot remove more than available
multiple resource kinds
```

### Transfers

```text
source → destination
correct quantities
source cannot become negative
```

### Policies

```text
below minimum → shortage
between minimum and target → acquisition desired
at/above target → no acquisition
```

### Household identity

```text
family → household
members share same household
one family maps to one home
```

### NPC integration

At least one integration-level test should verify:

```text
NPC acquires resource
resource reaches household
household stock changes
```

Avoid testing Three.js rendering for these cases.

---

# 32. Implementation order

Recommended sequence:

## Step 1 — Inspect existing resource/economy APIs

Before writing code, inspect:

```text
NpcAgent
Needs
PlannedAction
SettlementEconomy
family generation
createSettlement
Place
resource/item definitions
existing inventory/transfer code
```

Do not explore the entire repository.

Only inspect files directly involved in these boundaries.

---

## Step 2 — Define household ownership

Implement the smallest household representation that connects:

```text
family
home
members
householdId
```

Do not change behaviour yet.

---

## Step 3 — Add HouseholdStock

Implement:

```text
get
has
add
remove
```

with tests.

No rendering.

No new UI.

---

## Step 4 — Seed initial stock

Give households deterministic initial resources.

Keep quantities small and configurable.

Example:

```text
food: small starting reserve
wood: small starting reserve
```

Do not create artificial infinite supplies.

---

## Step 5 — Connect households to settlement creation

During `createSettlement`:

```text
family
  → household
  → home
```

Pass the household reference/ID to relevant NPCs.

Avoid making `NpcAgent` own the stock.

---

## Step 6 — Connect consumption

Modify the existing food consumption path so that food can come from:

```text
household stock
```

instead of only a world source.

Preserve existing drinking/water behaviour initially.

---

## Step 7 — Connect acquisition

When household stock falls below the target:

```text
NPC gets acquisition goal
```

Reuse the existing action system.

The NPC must physically travel and collect the resource.

---

## Step 8 — Deposit

On returning home:

```text
NPC carrying
    ↓
household stock
```

Make the transfer atomic.

---

## Step 9 — Wood

Apply the same pattern to household wood.

Keep the first implementation intentionally simple.

---

## Step 10 — Debugging

Add structured debug visibility.

Verify at least:

```text
initial stock
consumption
shortage
acquisition
transport
deposit
```

---

## Step 11 — Performance verification

Check:

- NPC update cost
- number of household checks
- allocations
- pathfinding frequency
- number of acquisition actions
- behaviour when many NPCs become hungry simultaneously

Do not add workers unless profiling shows a real need.

---

# 33. Explicit non-goals

Do **not** implement these as part of 069:

- market prices
- money
- trading between settlements
- production chains
- workshops
- farming simulation
- livestock production
- migration
- population growth
- births/deaths
- complete NPC persistence
- physical storage buildings
- full inventory UI for households
- autonomous settlement construction
- inter-settlement logistics
- complex resource reservation
- generic economic planner
- new AI architecture
- LLM-driven behaviour

These are future systems.

---

# 34. Agent guidance — minimise exploration

Before implementation, read only:

```text
docs/STATE.md
docs/plans/README.md
docs/plans/2026-08-11--069--npc-household-resources.md
docs/plans/2026-08-??--071--...
```

and then inspect the concrete implementation of:

```text
NpcAgent
Needs
SettlementEconomy
createSettlement
family generation
PlannedAction
Place
resource/item definitions
```

Do not recursively inspect unrelated plans.

Use existing names and types whenever possible.

Search first, then modify.

---

# 35. Important invariants

The implementation must preserve:

1. One family has one household.
2. One household has one logical home.
3. NPCs reference households; they do not own household state.
4. A resource quantity has one authoritative owner/location.
5. Settlement stock remains owned by `SettlementEconomy`.
6. Household stock remains owned by the household.
7. NPC carrying is temporary.
8. Existing `Needs` remain the personal-need mechanism.
9. Existing FSM/actions remain the behaviour mechanism.
10. 071 must be able to extend this system without replacing it.
11. Household state must be serializable in the future.
12. Household checks must not run expensively every render frame.

---

# 36. Definition of done

069 is complete when:

- [ ] households exist for generated families;
- [ ] households have stable IDs;
- [ ] households are associated with existing homes;
- [ ] household members resolve to the same household;
- [ ] household stock supports at least food and wood;
- [ ] initial household stock is deterministic;
- [ ] NPC food consumption can use household stock;
- [ ] household shortages can trigger resource acquisition;
- [ ] NPCs can transport resources to the household;
- [ ] resources are deposited into household stock;
- [ ] wood follows the same basic flow;
- [ ] no duplicate settlement economy was introduced;
- [ ] no duplicate inventory/resource model was introduced;
- [ ] existing FSM/action architecture remains in control;
- [ ] focused unit tests exist;
- [ ] at least one NPC/household integration path is verified;
- [ ] debug information allows household resource flow to be diagnosed;
- [ ] performance remains acceptable with the current settlement population.

---

# 37. Final architectural target

After 069, the important new simulation chain should be:

```text
WORLD
  │
  ├── natural resources
  │
  ▼
NPC ACTIONS
  │
  ├── gather
  ├── transport
  └── deposit
  │
  ▼
HOUSEHOLD
  │
  ├── food
  ├── wood
  └── future goods
  │
  ▼
NPC NEEDS
  │
  ├── eat
  ├── rest
  └── future consumption
  │
  ▼
HOUSEHOLD SHORTAGE / SURPLUS
  │
  ▼
SETTLEMENT ECONOMY
  │
  ▼
PLAN 071+
  │
  ├── production
  ├── specialization
  ├── development
  ├── trade
  └── settlement growth
```

The key goal of 069 is therefore **not to build an economy**.

It is to introduce the missing **household resource layer** in a way that
connects today's NPC needs/actions with the future settlement economy without
creating a parallel architecture.
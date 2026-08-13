# Plan 071 — Implementation Notes: Local Economy & Settlement Development

**Status:** `reviewed` 🟡 — ready after 092 and 094.
**Created:** 2026-08-13
**Order:** `092 → 071 → 069`

## Review verdict

The direction of 071 is correct, but the original plan is too broad for one implementation pass. The key decision is:

> **071 builds the shared settlement economy; 069 adds farming as one producer on top of it.**

The current code already provides the integration points: NPC needs/FSM/actions, `Place`/`workplaceFor()`, settlement landmarks, natural resources and local specialisation from 032, player `Inventory`, and shared `StaminaState`. Plan 092 will add the daily-effort layer (`VigorState`).

The missing layer is a small settlement-owned economic state connecting work, quantities, storage, production and consumption. Do not build another AI, scheduler or inventory system.

## Target architecture

```text
natural source
    ↓
NPC work/action
    ↓
resource / good
    ↓
settlement stock
   ↙          ↘
consumption   production
   ↓             ↓
needs         new goods
                 ↓
              stock
                 ↓
       settlement development
```

Economic quantities belong to the **settlement**, not NPCs. NPCs perform work and transport/consume resources, while the settlement owns bulk stock.

## Recommended domain model

Add a small shared economy domain, preferably under `src/economy/` following repository conventions:

- `EconomicKind` / `GoodKind` — economic material identifiers;
- `EconomicStock` — quantity by kind;
- `SettlementEconomy` — stock, demands, deficits/surpluses;
- `ProductionDef` — inputs, outputs, role/work requirements;
- `SettlementDemand` — target stock or consumption rate.

Do **not** make `ItemKind` the universal economy type. Player inventory and settlement bulk storage have different semantics. Use explicit mappings later where needed.

Avoid a generic ECS/database/commodity framework and avoid a global `EconomyManager` singleton. Economy state should be owned by the settlement runtime state.

## Scope for 071

### Implement

1. One economic state per settlement.
2. Shared stock API: add/remove/query, reserve/consume, shortage/surplus.
3. Existing NPC work can produce settlement stock.
4. Existing settlement stockpile remains the physical/visual storage point for now.
5. Generic production/processing operation reusable by later systems.
6. Basic settlement demands for critical goods.
7. One concrete settlement-development hook driven by population/resources/stock.
8. Deterministic tests for all accounting rules.

### Prepare, but defer

- inter-settlement trade;
- player crafting integration;
- complete building construction;
- advanced transport/caravan simulation;
- prices/currency;
- complex supply-chain optimisation.

Trade should consume future surplus/deficit signals rather than introduce another economy.

## Important boundaries

### No NPC inventory rewrite

Do not introduce a second item-by-item NPC inventory merely to support the economy. Bulk settlement stock is sufficient for v1. If carrying later becomes important, add a small explicit transfer/carrying state instead of copying player `Inventory`.

### No second AI/FSM

Keep the existing chain:

```text
needs / economic shortage
        ↓
existing decision + schedule
        ↓
existing action
        ↓
existing workplace/source
        ↓
stock mutation on successful completion
```

Resource output must happen when the action completes successfully, not when it starts.

### No full village generator rewrite

Plan 032 already provides `NaturalResource`, `dominantResource`, `richness`, food-source specialisation and role hints. 071 should consume these outputs rather than redesign generation.

## Implementation stages

### A — Economy domain

Create the minimal types and `SettlementEconomy` state. Keep the API deterministic and easy to unit-test.

### B — Settlement integration

Attach one economy state to each runtime settlement. Initial stock must be deterministic and must not create infinite resources.

### C — Existing NPC work

Extend current work actions rather than creating an economy worker. At minimum, verify:

- woodcutter → wood stock;
- farmer/fisher/miner have a shared production hook ready for later producers;
- stockpile is the common storage destination;
- stamina/vigor are drained through existing action logic.

### D — Demand

Add simple shortage/surplus signals such as `food shortage`, `wood shortage`, `surplus wood`. Do not turn `pickNeed()` into a giant economic planner.

### E — First production chain

Implement one complete chain end-to-end:

```text
wood source → woodcutter → wood stock
```

Add another processed good only when there is already a natural consumer. Do not create a large catalogue just to prove the abstraction.

### F — Settlement development

Represent development as a requirement:

```text
development target
→ required goods
→ reserve/consume stock
→ existing settlement-development action
```

Start with one concrete visible development step, not a generic village tech tree or `level++` system.

## 092 dependency

After 092:

- `StaminaState` = short burst effort;
- `VigorState` = daily work capacity;
- economy work uses these existing states;
- no `workEnergy` or economy-specific fatigue field.

A long work session should naturally affect the existing NPC action/stamina/vigor system.

## 094 dependency

094 is assumed complete before 071. Animal hunger/thirst should remain part of the fauna model. Domestic livestock can later become an economic consumer/producer in 069, but wild fauna must not be coupled to settlement stock.

## 069 dependency

069 should use 071's generic production and stock model:

```text
farm / field / farmer work
        ↓
production definition
        ↓
food good
        ↓
settlement stock
        ↓
NPC / livestock consumption
```

069 must not create a farm-specific inventory, food-storage system, production scheduler or parallel resource model.

## Data ownership

| Data | Owner |
|---|---|
| NPC needs | NPC |
| NPC stamina/vigor | NPC |
| NPC role/schedule | NPC |
| physical workplace | Settlement landmarks / Place |
| bulk economic stock | Settlement economy |
| production definitions | Shared static definitions |
| settlement demand | Settlement economy |
| development requirements | Settlement/development state |
| player inventory | Player |
| wild animal hunger/thirst | Animal |

Avoid mirrored quantities unless their semantics are explicitly different.

## Persistence / streaming

Economy belongs to a settlement and must not change merely because a settlement streams out and back in.

Use the existing settlement/save lifecycle where possible. Do not create a separate save system. If settlement persistence is not yet available, keep initial economy deterministic from settlement identity and clearly separate transient action state from persistent stock.

## Performance

Do not use a worker for economy bookkeeping. The expected scale is settlements × a handful of goods × NPCs.

Prefer action-completion events and bounded-rate updates. Avoid per-frame scans over all production definitions and avoid allocations in the hot NPC loop where practical.

## Testing

Minimum unit coverage:

- add/remove stock;
- insufficient stock cannot be consumed;
- production consumes inputs and adds outputs atomically;
- failed production does not partially consume inputs;
- shortage/surplus calculation;
- deterministic initial stock;
- development requirement can be reserved/paid once;
- settlements cannot affect each other's stock.

Then add at least one NPC integration test proving that completed work changes settlement stock.

## Acceptance criteria

071 is complete when:

- every settlement has a real economic state;
- one shared API supports production, storage and consumption;
- at least one existing NPC work action produces real stock;
- output is committed on successful action completion;
- shortage/surplus is explicit;
- 092's stamina/vigor is reused;
- 069 can implement farming without a second economy;
- no second AI/FSM/scheduler is introduced;
- no per-frame expensive economy simulation is required;
- core accounting rules have deterministic tests.

## Review conclusions

Keep from the original plan:

- `needs → work → resources → storage → consumption`;
- local specialisation from 032;
- shared production;
- development driven by actual settlement state;
- future trade driven by surplus/deficit.

Narrow the implementation by:

1. making storage settlement-owned bulk state;
2. building production as a reusable operation first;
3. deferring actual trade while implementing its surplus/deficit prerequisite;
4. starting settlement growth with one concrete development hook;
5. extending existing NPC actions instead of adding an economy AI;
6. making 069 the first substantial domain-specific producer;
7. keeping economy bookkeeping on the main thread.

## Relevant files

- `docs/STATE.md`
- `docs/plans/2026-08-11--071--local-economy-and-settlement-development.md`
- `docs/plans/2026-08-13--092--npc-stamina-and-daily-vigor.md`
- `docs/plans/2026-08-13--094--fauna-food-water-for-satiety-hydration.md`
- `docs/plans/2026-08-08--032--natural-resources-economy.md`
- `src/ai/NpcAgent.ts`
- `src/settlement/places.ts`
- `src/items/itemCatalog.ts`

## Agreed implementation order

```text
092 — stamina + daily vigor
        ↓
071 — shared local economy + settlement stock/production/demand
        ↓
069 — NPC farms + resource flow on top of 071
```

The success test for 071 is simple: **after 071, implementing 069 should feel like adding a new producer to an existing economy, not creating a second economy for farms.**

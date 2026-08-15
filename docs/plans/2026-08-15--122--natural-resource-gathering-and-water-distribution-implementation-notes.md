# Plan 122 — Natural Resource Gathering & Water Distribution — Implementation Notes

> Review against the current codebase, `docs/STATE.md` and `docs/plans/README.md`. Purpose: reduce agent exploration and prevent duplicate systems.

## 1. Review verdict

The direction is correct, but the plan currently combines three increments: generic gathering, persistent household water logistics, and village-wide physical storage. The implementation should be narrower.

**Recommended rule:** first make one complete water path work through the existing NPC decision/action architecture, then generalise only the proven parts to other resources.

Current foundations already exist and must be extended, not replaced:

- `Inventory` / `ItemKind`.
- `WaterSource` (`src/world/WaterSource.ts`) for well/lake interaction.
- `Household` (`src/settlement/household.ts`) with `food`/`wood` stock, shortage/target/capacity and overflow to `SettlementEconomy`.
- `SettlementEconomy` as settlement-wide stock.
- `TreeLifecycle` / `treeHarvest`.
- shared `PlannedAction`, `ActionLifecycle`, `DecisionContext`, `pickHighestScore` contracts.
- `NpcAgent` as the NPC behaviour integration point.
- livestock `ownerHouseId` linking animals to household homes.

## 2. Household storage already exists — do not duplicate it

Plan 069 is implemented. `HouseholdRegistry` lives with settlement state rather than live NPCs, specifically so streaming does not recreate household stock.

Existing ownership model:

```text
SettlementEconomy
      ↓
Household stock
      ↓
NPC temporary carrying
```

Do not add `HouseholdInventory`, `HouseholdStorage`, another economy ledger, or a resource manager. For food/wood, reuse `Household.deposit(kind, amount, economy)`.

## 3. Water abstraction already exists

`src/world/WaterSource.ts` is deliberately data-only:

```ts
{ kind: 'well' | 'lake', quality: 'safe' | 'unsafe' }
```

Actual inventory/player-need mutation remains in `gameLoop.ts`. Do not create `WaterSystem`, another `WaterSource`, or separate well/lake managers.

Keep the semantic distinction:

```text
WaterSource  = where water can be obtained/drunk
WaterStorage = finite stored quantity
```

If water storage is needed, introduce only the smallest state required by the existing simulation/action architecture.

## 4. Water should not automatically become economic stock

`HouseholdResourceKind` currently explicitly excludes `water`; household economic stock is `food` + `wood`.

Do **not** blindly add water to `EconomicKind` just because NPCs transport it. For the current goal, a dedicated finite household water reserve is cleaner:

```text
Household
 ├─ EconomicStock: food, wood
 └─ water storage state
```

Only make water an `EconomicKind` if later production/trade actually needs it.

## 5. Barrel/trough state ownership

`WaterBarrel` and `AnimalTrough` are world-facing presentation/interaction objects. Their quantity must have one authoritative simulation owner.

Prefer:

```text
Household water state
        ↓
barrel/trough presentation
```

not duplicated quantities in household + prop + NPC/animal.

During transport the quantity moves atomically:

```text
well → NPC carrying → household water state
```

Do not store authoritative quantity only in Three.js `Object3D`s. The prop must be reconstructible after settlement streaming.

## 6. Do not add Village Storehouse in the first increment

The proposed physical village storehouse is premature. `SettlementEconomy` already represents settlement-wide stock and household overflow already routes there.

First implement:

```text
NPC carrying → Household / existing SettlementEconomy
```

A physical communal storehouse should be a later increment when there is a concrete gameplay flow requiring physical communal logistics.

## 7. Generic gathering should reuse existing actions

Do not create `ResourceGatheringManager` or another FSM.

Use the existing simulation contracts:

```text
NPC decision
  ↓
PlannedAction
  ↓
find/validate target
  ↓
goTo
  ↓
gather
  ↓
NPC carrying
  ↓
goTo destination
  ↓
deposit
```

The agent should search for the existing `goTo`/action completion implementation and extend it rather than building another movement/action layer.

## 8. Start concrete, then generalise

Recommended implementation order:

### A — Water

```text
well → NPC gathers → NPC carries → household water storage
                                    ↓
                              NPC / animal drinks
```

### B — Generalise

Extract only what the working water path proves is reusable:

```text
source target / amount / collect / carry / destination / transfer
```

### C — Other resources

Connect wood, branches, food and ore one at a time using their existing lifecycle/depletion APIs.

Do not design a large generic resource framework before the first real path exists.

## 9. NPC carrying: verify before changing

The plan assumes `NPC Inventory`. The player `Inventory` is not automatically the correct NPC carrying model.

Before coding, answer from code:

1. Does `NpcAgent` already have canonical carrying/resource state?
2. Which existing action performs `goTo` and completion?
3. Where is `DecisionContext` created for NPCs?
4. Where are NPC needs scored/retargeted?

If NPC carrying does not exist, add the smallest temporary carrying state needed for transport. Do not give every NPC the complete player inventory/tool system merely to carry resources.

## 10. Needs and shortages

Keep personal needs and household shortages distinct.

Existing household API already has:

```text
shortage(kind)       = urgent below minimum
shouldAcquire(kind)  = below target
```

Reuse this pattern for water without inventing `ResourceRequest`.

Preferred flow:

```text
NPC thirst
  ↓
usable local stored water?
  ├─ yes → drink
  └─ no  → acquisition action
```

Separately:

```text
household water below target
  ↓
existing decision scoring
  ↓
eligible NPC gathers water
```

Do not turn `thirst` itself into a household resource planner.

## 11. Animals: reuse fauna thirst logic

Fauna already has hunger/thirst and retargets elevated needs to real sources. Livestock already carry `ownerHouseId`.

Do not create livestock-specific watering AI. Add the trough as another usable source candidate:

```text
animal thirst
  ↓
existing fauna source selection
  ↓
household trough if usable
  ↓
consume quantity
```

The first source hierarchy can be deterministic (local stored water before natural fallback), but should remain compatible with existing scoring rather than becoming a large hardcoded chain.

## 12. Preserve existing water behaviour

The existing player well/lake path must keep working. Lake water is currently `unsafe` only as a gameplay/UI warning; there is no illness system. Do not introduce disease or water-quality simulation in this plan.

## 13. Natural resources are heterogeneous

The plan assumes an existing universal `NaturalResource`. Do not assume that type exists merely because several resource systems exist.

Before coding, locate the concrete implementations for:

- tree harvest/lifecycle,
- resource deposits,
- existing food sources,
- branches/rocks/ore.

If they are heterogeneous, add a small behavioural adapter only if the action layer truly needs a common contract. Do not create a central resource registry merely for naming consistency.

## 14. Tree/deposit lifecycle remains authoritative

Wood gathering must call the existing tree harvest/lifecycle API. Do not mutate meshes directly or create another depletion flag.

Target:

```text
NPC gather wood
  ↓
existing tree harvest
  ↓
existing lifecycle/depletion state
  ↓
resource quantity
```

Apply the same principle to deposits.

## 15. Streaming vs SaveData

Household state already follows the correct streaming model: simulation state is owned by settlement-level registries, not live NPCs.

Use the same principle for water storage. Do not claim full save/load persistence unless `SaveData` is deliberately extended and restore is tested.

Keep this distinction explicit:

```text
streaming persistence ≠ SaveData persistence
```

## 16. Performance

Do not scan all resources for every NPC every frame.

Prefer:

- settlement-local candidates first,
- nearby/spatial queries,
- existing decision cadence/throttling,
- deterministic selection.

Do not add a global resource index or worker pipeline unless profiling proves it necessary. Gathering transfers are stateful and should remain in the current NPC simulation architecture initially.

## 17. Reduced implementation phases

1. **Focused audit:** `NpcAgent`, NPC actions, carrying state, needs/thirst, fauna thirst, livestock `ownerHouseId`, `WaterSource`, well interaction, `Household`, `SettlementEconomy`, `Place`/`Interactable`, tree lifecycle, deposits, settlement streaming and persistence.
2. **Water transport:** well → NPC carrying → household water state, with real movement and atomic transfer.
3. **Water consumption:** NPC/animal drinks from stored local water; preserve natural-source fallback.
4. **Shortage-driven refill:** household water shortage enters existing NPC decision/action scoring.
5. **Generalise:** extract only the reusable gather/transport/deposit pieces proven by water.
6. **Expand:** wood → branches → food → ore, one resource family at a time.
7. **Later:** physical village storehouse only when a real communal logistics flow requires it.

## 18. Verification priorities

First browser smoke test:

```text
well
 ↓
NPC gathers
 ↓
NPC carries
 ↓
NPC returns home
 ↓
stored quantity increases
 ↓
NPC/animal drinks
 ↓
quantity decreases
 ↓
NPC gathers again
```

Then test:

- empty source,
- full storage,
- interrupted transport,
- stream-out/in during transport,
- multiple NPCs targeting one source,
- multiple animals using one trough,
- natural-source fallback,
- no infinite gather/deposit loop.

Only after this works test wood/branches/food/ore and concurrent gathering.

## 19. Agent short-path checklist

Before implementation, inspect only the files/functions answering these questions:

1. Exact NPC carrying representation?
2. Existing `goTo` + action lifecycle?
3. NPC `DecisionContext` construction?
4. NPC need/source selection?
5. Fauna thirst source selection?
6. `ownerHouseId` → household/home mapping?
7. Access path from `NpcAgent` to `HouseholdRegistry` / `SettlementEconomy`?
8. Existing well interaction API?
9. Existing tree harvest and deposit/depletion APIs?
10. Settlement prop streaming lifecycle?
11. Actual SaveData coverage?

Once these are answered, stop broad repository exploration and implement within the existing boundaries.

## 20. Plan corrections

The proposed plan should be updated accordingly:

- reconsider `Depends on: ~~032~~`; use only real implementation prerequisites;
- remove/ defer the physical Village Storehouse;
- do not create a parallel household/economy/storage system;
- do not force water into `EconomicKind` without a concrete economic use;
- make water the first complete gathering/transport example;
- generalise only after the concrete path works;
- explicitly distinguish runtime streaming persistence from SaveData persistence;
- treat barrel/trough as world presentation over simulation-owned quantity.

The resulting feature is best understood as **water logistics + a small reusable gathering foundation**, not a new economy system.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

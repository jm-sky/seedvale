# Plan: Local Resource Exchange

**Created:** 2026-08-28
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** M
**Depends on:** ~~156~~ ~~settlements-npcs-002~~
**Domain:** `settlements-npcs`
**Roadmap:** `economy-production`

## Goal

Add autonomous local resource exchange using the existing settlement economy, household stock, inventory and NPC action infrastructure.

The implementation must extend existing mechanisms rather than create a parallel economy or trading system.

## Recon / current implementation

The repository already provides:

- `SettlementEconomy` as the settlement-level owner of economic stock.
- `EconomicKind` for settlement resources such as `food`, `water`, `wood`, `iron`, `coal` and `gold`.
- `Household` economic stock plus a separate `Inventory` for concrete item instances.
- Household surplus flowing into settlement storage.
- Existing shortage/surplus and stock reservation mechanisms.
- Existing NPC carrying / collect / deposit action infrastructure.
- Existing production through the settlement economy.
- Existing Local Trader and item trade transaction infrastructure.

Do not introduce a second `StorageInventory`, `TradeManager`, `TraderEconomy` or parallel NPC trade AI.

## Scope

### 1. Define local resource exchange

Create a generic exchange/transfer flow for economic resources between existing stock owners.

Initial scope:

```text
Household ↔ Village Storage
Household ↔ Household
Profession/Household ↔ Local Trader
Profession ↔ Profession
```

The mechanism must operate on existing `SettlementEconomy` / `Household` state.

### 2. Household ↔ Village Storage

Keep the existing household-surplus → settlement-storage behaviour.

Add the complementary flow:

```text
Household shortage
       ↑
Village Storage
```

A household should be able to obtain an available local resource when this is required by its existing needs/stock thresholds.

### 3. Surplus and shortage

Use the existing surplus/shortage concepts.

Example:

```text
Household A
food = 20
target = 10
→ surplus = 10

Household B
food = 2
target = 8
→ shortage = 6
```

The exchange layer should use these states to identify useful local exchanges.

Do not introduce a new parallel need model.

### 4. Profession ↔ Profession

Prepare a generic mechanism for local producer/consumer exchange:

```text
producer surplus
       ↓
local exchange
       ↓
consumer shortage
```

Examples for later systems:

```text
Miner      → ore  → Blacksmith
Woodcutter → wood  → Carpenter
Farmer     → food  → Household
```

Blacksmith, Carpenter and the new mining production chain are outside this plan.

### 5. NPC action integration

Exchange between NPC-owned stock must use the existing action/carrying pipeline where possible:

```text
shortage
   ↓
find local supply
   ↓
planned action
   ↓
pickup
   ↓
carry
   ↓
deposit
```

Do not add a separate trade scheduler or trade-specific AI.

Exchange should emerge from existing decision/pressure/action architecture.

### 6. Local Trader

Extend the existing Local Trader to participate in the same local resource flow where appropriate.

Reuse existing trading mechanisms and settlement stock.

Do not create:

- `TraderEconomy`
- `TraderInventory` without a demonstrated existing architectural need
- `TradeManager`
- a second pricing/economy model

Coins and monetary pricing are outside this plan.

### 7. EconomicKind vs ItemKind

Keep the existing distinction.

```text
EconomicKind
food / wood / iron / coal / gold / ...

ItemKind
arrow / hide / beam / axe / ...
```

F1 focuses on economic-resource exchange.

Concrete item trading continues to use the existing item trade infrastructure and is not redesigned here.

### 8. Conservation and atomicity

Transfers must not duplicate or lose resources.

Required properties:

- source can only transfer currently available stock,
- destination receives exactly the transferred amount,
- failed/cancelled actions do not destroy stock,
- reservations are released correctly,
- no item/resource can remain both in source and carried state after a completed transfer.

Reuse existing reservation/transfer semantics where possible.

## Files / systems to inspect and modify

Confirm exact paths against the current code before implementation. Expected areas include:

- settlement economy / `SettlementEconomy`
- `EconomicKind`
- household stock and surplus handling
- household / NPC inventory
- NPC work/action planning
- existing carrying / collect / deposit actions
- Local Trader
- existing item trade transaction code
- relevant tests
- `docs/plans/README.md`

Avoid unrelated refactors.

## Verification

### Automated

Add/update tests covering:

- household surplus → village storage,
- village storage → household,
- shortage detection,
- surplus detection,
- valid local resource exchange,
- insufficient source stock,
- failed/cancelled exchange,
- conservation of resource quantities,
- Local Trader regression,
- existing item-trade regression.

Run the repository's relevant lint, typecheck, test and build commands.

### Browser/manual

Verify in a running settlement that:

1. one household can have a real surplus;
2. another household can have a real shortage;
3. an exchange is selected through normal NPC simulation;
4. the resource physically moves through the existing action/carrying flow where applicable;
5. the destination stock changes correctly;
6. no duplication/loss occurs;
7. the player does not need to trigger the exchange;
8. existing professions and Local Trader continue to work.

Distinguish automated verification from browser/manual verification in the implementation notes.

## Out of scope

- Blacksmith production
- full Miner profession/production chain
- ore/coal transport from mines
- carts/wagons
- horses/donkeys
- inter-settlement trade
- Travelling Merchant
- Courier
- coins
- Mint
- monetary pricing
- Carpenter
- new crafting recipes
- LLM-driven economic decisions
- parallel economy/trading managers

## Expected result

The village has one coherent local resource flow:

```text
Household
    ↕
Village Storage
    ↕
Professions
    ↕
Local Trader
```

Shortages and surpluses can result in real local exchanges while preserving existing deterministic NPC simulation and stock ownership.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

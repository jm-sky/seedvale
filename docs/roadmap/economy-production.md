# Economy & Production Roadmap

## Goal

Gradually build an economy based on real flows of resources, production, storage, exchange, transport and crafting.

```text
resources
    ↓
gathering / production
    ↓
storage / surplus
    ↓
exchange / demand
    ↓
processing / crafting
    ↓
goods
    ↓
consumption / trade
```

The roadmap is directional. Existing systems should be reused and extended rather than replaced with parallel profession-, economy- or transport-specific systems.

## Existing foundations

| Profession / system | Current state | Existing economic role |
|---|---|---|
| Woodcutter | ✅ | gathers wood resources |
| Farmer | ✅ | produces crops / food |
| Hunter | ✅ | hunts and produces meat / hide |
| Local Trader | ✅ | local trade |
| Household surplus → Village Storage | ✅ | central village resource buffer |
| Items / item instances / inventory | ✅ | resources, tools, food and equipment |
| Production / crafting foundations | 🟡 | reusable foundation; profession-specific chains still incomplete |
| Mining-related resources/tools | 🟡 | `coal`, `iron`, `gold`, `pickaxe` and `rock_mining` exist; full Miner profession flow still needs verification |
| Fish / fishing-related items | 🟡 | `fish`, `dried_fish`, `fishing_rod` exist; full Fisher profession flow still needs verification |

### Existing Hunter flow

```text
fauna
 ↓
Hunter
 ↓
meat / hide
 ↓
NPC inventory
 ↓
household / storage
 ↓
consumption / processing / trade
```

Bow and arrow items already exist, but NPC production of bows/arrows was deliberately cut from the implemented Hunter scope and should not be treated as currently implemented.

## Phase 1 — Local Resource Exchange

Build the local economic exchange layer on top of the existing household/storage/trading mechanisms.

### 1.1 Household → Village Storage

Already implemented: household surpluses can enter village storage. ✅

### 1.2 Village Storage → Household

Allow households to obtain locally available resources they need from village storage.

### 1.3 Profession ↔ Profession

Allow direct exchange of resources between professions when a useful local trade can be satisfied directly.

Example:

```text
Miner ↔ Blacksmith
Farmer ↔ Trader
Woodcutter ↔ Carpenter
```

Do not create a profession-specific trading system.

### 1.4 Local Trader

Extend the existing Local Trader to participate in the same local resource economy. ✅

The village should have one coherent local flow:

```text
Household ↔ Village Storage ↔ Professions ↔ Local Trader
```

## Phase 2 — Blacksmith & Processing

Add Blacksmith and the first complete material-processing chain.

```text
Mine
 ↓
Miner
 ↓
ore / coal
 ↓
Blacksmith
 ↓
metal / ingots
 ↓
tools / weapons / components
```

Blacksmith creates real demand for `ore` and `coal`.

Initially, try to satisfy demand from locally available village storage:

```text
Village Storage → Blacksmith
```

If the required resources are unavailable locally, this becomes a logistics problem rather than a failed/teleported transfer.

## Phase 3 — Physical Transport

Solve movement of resources between distant production sites and the settlement.

Example:

```text
Mine
 ↓
Miner
 ↓
ore / coal
 ↓
transport demand
 ↓
cart + horse / donkey
 ↓
Village Storage
 ↓
Blacksmith
```

Transport should be a general goods-transport mechanism, not a coal-specific system.

It should eventually support flows such as:

```text
Mine → Village
Forest → Carpenter
Farm → Village
Village → another settlement
Merchant → settlement
```

Minimum concepts:

- transport demand,
- source and destination,
- cargo / capacity,
- cart or wagon,
- horse / donkey,
- pickup,
- travel,
- unload,
- real movement of item quantities.

Transport should be triggered by real economic demand.

## Phase 4 — Carpenter

Add Carpenter and wood processing using the mechanisms established in earlier phases.

```text
Woodcutter
 ↓
logs
 ↓
Carpenter
 ├─ planks
 ├─ beams
 └─ furniture
```

Carpenter should reuse storage, demand, exchange, transport and production mechanisms.

Do not assume `logs → planks` or `hide → leather` already exist unless confirmed by the codebase.

## Phase 5 — Mint & Coins

Replace the currently abstract / magical origin of coins with a world-based production flow.

```text
gold / silver
 ↓
Miner
 ↓
transport
 ↓
Mint
 ↓
coins
```

The Mint should be a workplace/institution; `Minter` can be the profession/worker responsible for coin production.

Goldsmith remains a separate future profession for valuable goods such as jewellery.

Eventually:

```text
goods ↔ coins
```

and:

```text
production
 → trade
 → coins
 → purchases / wages / wealth
 → demand
 → production
```

## Future directions

Potential later additions, building on the same systems:

- Fisher
- Goldsmith
- Guard
- Travelling Merchant
- Courier / carrier role
- caravans
- inter-settlement trade
- leather processing
- broader tool and equipment production
- maintenance and replacement of worn tools

## Design principles

- Real resources should have real sources, destinations and transformations.
- Local exchange should use existing household, storage, inventory, production and trading mechanisms.
- Shortages and surpluses should create pressures and decisions rather than scripted transfers.
- Transport should solve real distance/logistics problems.
- Production should create demand for inputs and outputs that other systems can consume.
- Professions should strengthen the existing NPC decision/action architecture rather than create parallel AI systems.
- The same mechanisms should work for NPCs, settlements and eventually player-facing systems where practical.
- The world must continue functioning without the player.

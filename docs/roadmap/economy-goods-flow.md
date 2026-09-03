# Economy — Goods Flow, Production and Trade

## Goal

Domknąć lokalną pętlę ekonomiczną Seedvale tak, aby dobra powstające w świecie mogły przechodzić przez realny obieg gospodarczy i wywoływać konsekwencje:

```text
world resources → work / production → household stock → surplus
                                      ↓
                               local goods flow
                                      ↓
                           settlement storage / trader
                                      ↓
                             household demand
                                      ↓
                                  consumption
```

Dalszy etap rozszerza ten sam mechanizm o processing i fizyczny transport.

Roadmapa nie wprowadza osobnego `TradeSystem`. Istniejące `Household`, `Inventory`, `SettlementEconomy`, `ProductionDef`, shortage/surplus i NPC action flow pozostają podstawą.

## Current state

### Already implemented

- `Household` owns real `Inventory` items plus household wood stock.
- `SettlementEconomy` owns settlement bulk stock and concrete food `Inventory`.
- Household and settlement shortage/surplus already exist.
- Local shortage pulls already work: settlement storage → household and household → household within one settlement.
- Transfers reuse existing NPC `goTo` / `execute` / `deposit` action flow.
- Transfers use live source claims/revalidation.
- `storageDestinations.ts` resolves current physical wood/food destinations.
- `Trader` already moves its own household surplus to settlement economy when a matching shortage exists.
- Hunter produces concrete items in `Household.items`, including hunted meat/hide and crafted arrows.
- Livestock can produce concrete food items such as eggs and milk.
- `ProductionDef` is already a reusable production foundation with generic item recipes.
- Food is represented by concrete `ItemKind`s rather than the former scalar food quantity.

### Important boundaries

```text
Household          → family goods
SettlementEconomy  → settlement bulk stock + concrete food
Inventory          → concrete item quantities / instances
ProductionDef      → transformations
NpcAgent           → decisions and actions
trade.ts/catalog   → player ↔ merchant transactions and valuation
```

These ownership boundaries should be preserved.

## Current gap

The local economy is still incomplete as a goods circulation loop:

```text
producer surplus → trader / collector → settlement storage
                                           ↓
                                      consumer demand
                                           ↓
                                     household items
                                           ↓
                                        NPC eats
```

Main gaps:

- Hunter output can remain in the household instead of becoming generally available local supply.
- Trader is not yet a general surplus-collection mechanism.
- Settlement storage is not yet a coherent circulation buffer for all useful concrete goods.
- `items/trade.ts` and `tradeCatalog.ts` should remain player/merchant transaction and valuation systems, not become the internal economy.
- Production foundations exist, but processing chains remain incomplete.
- There is no generic physical goods transport between distant sources and destinations.
- Inter-settlement trade is not implemented.
- Coins are not required to close the first local goods loop.

## Design principles

### 1. Real goods, not abstract economic numbers

When a producer creates a concrete item, the same item should be transferable and consumable.

```text
Hunter → meat / hide → Household.items → surplus → Trader
      → SettlementEconomy.items → Household.items → consumption
```

Do not introduce a parallel market quantity that can diverge from inventories.

### 2. Reuse existing exchange mechanisms

Use the existing claim/revalidation model:

```text
choose source → re-check live surplus → claim → move goods → deliver
```

Claims remain atomic at the source and deterministic where possible.

### 3. Trader is a world actor

The NPC Trader should become a local economic role that identifies useful surplus, collects it, delivers it to the appropriate local destination and responds to shortage/demand. It must not magically create or destroy goods.

### 4. No premature generic transport system

Local household ↔ settlement movement can reuse the existing NPC movement/action system. A dedicated transport model becomes necessary when distance creates a real logistics problem: mine → village, farm → village, village → village, merchant → settlement.

### 5. Production creates demand

Processing must consume real inputs and produce real outputs. For example:

```text
ore + coal → Blacksmith → metal/components → tools/weapons
logs       → Carpenter  → planks/beams/furniture
```

Exact recipes must be verified against current code before implementation.

### 6. Coins come later

The first local loop is goods-based: `surplus ↔ shortage`. Coin production, Mint and broader monetary exchange remain later work.

# Roadmap stages

## Stage 1 — Local Goods Circulation

**Purpose:** close the first useful local economic loop using existing settlement, household, inventory and NPC action systems.

### Target

```text
producer household → surplus → Trader / local collector
                                      ↓
                              settlement storage
                                      ↓ shortage
                               consumer household
                                      ↓
                                     NPC
                                      ↓
                                 consumption
```

### Scope

- Generalise existing local exchange helpers where necessary to move concrete `ItemKind` goods, not only current wood/food cases.
- Extend Trader from moving its own surplus to a bounded local goods-collection role.
- Define which concrete goods participate in local circulation.
- Use concrete food as the first important category because it already has consumption semantics.
- Use Hunter-produced meat as the first producer → trader → consumer example.
- Preserve physical NPC movement for pickup/delivery.
- Reuse `storageDestinations` and settlement storage ownership.
- Revalidate live source stock at claim time.
- Keep `trade.ts` / `tradeCatalog.ts` focused on player↔merchant transactions and valuation.

### Non-goals

- coins
- dynamic market pricing
- inter-settlement trade
- wagons/carts
- generic long-distance transport
- Blacksmith/Carpenter production chains

### Implementation plan

- `settlements-npcs-014` — local goods flow and Trader/consumer integration.

## Stage 2 — Production & Processing as Economic Chains

**Purpose:** turn production into a network of real inputs and outputs.

### Target

```text
raw resource → producer → input stock → processing workplace
                                            ↓
                                      processed good
                                            ↓
                                  local storage / trader
                                            ↓
                                  consumer / producer
```

### Initial chains

Prefer a small number of complete chains over many half-implemented professions.

Candidate chains:

- ore + coal → Blacksmith → metal/components → tools/weapons/maintenance
- wood/logs → Carpenter → planks/beams/furniture

Exact recipes and currently implemented transformations must be confirmed from code before planning implementation.

### Scope

- Connect `ProductionDef` inputs to real economic availability.
- Make production consume real inputs.
- Make outputs enter an owned household/settlement inventory or stock.
- Create downstream demand from production and consumption.
- Reuse local exchange and settlement storage from Stage 1.
- Add bounded deterministic production priorities when inputs are scarce.
- Preserve the existing NPC decision/action architecture.

### Non-goals

- full inter-settlement logistics
- dynamic global prices
- complete crafting catalogue
- monetary simulation

### Implementation plans

- `settlements-npcs-015` — economic production and transactional input integration.
- `settlements-npcs-016` — first complete processing chain and Blacksmith production.
- `settlements-npcs-017` — production demand and economic pressures.

## Stage 3 — Physical Goods Transport

**Purpose:** make distance a real economic constraint.

### Target

```text
source → surplus / demand → transport demand → carrier + cargo
                                                  ↓
                                             pickup / travel
                                                  ↓
                                               unload
                                                  ↓
                                            destination
```

### Scope

Introduce a generic transport mechanism with source, destination, goods, quantity, cargo capacity, carrier, pickup, travel, unload and completion/failure state.

Initial useful cases:

- mine → settlement
- farm → settlement
- remote resource site → workplace
- settlement → settlement
- merchant → settlement

Transport is created by real economic demand/surplus, not fixed scripted routes. Cargo represents actual goods. Failed/interrupted transport must not duplicate or silently delete goods.

Nearby local transfers should continue using the cheaper existing NPC movement path where appropriate. Off-screen transport must eventually preserve the same economic consequences without requiring every carrier to run every frame.

### Non-goals

- fully simulated caravans from day one
- global commodity market
- advanced road network
- dynamic monetary exchange

### Implementation plan

- A dedicated transport plan should be created after Stages 1–2 expose the actual source/destination and demand requirements. It should use the next available `settlements-npcs` plan ID after the Stage 2 work (currently `018`).

## Relationship with existing economy roadmap

`docs/roadmap/economy-production.md` remains the broader economy roadmap. This roadmap focuses specifically on the missing goods circulation loop and turns that direction into an implementation sequence:

```text
existing: resource → work → household → settlement storage

new:      surplus → local goods flow → consumption
                              ↓
                       production demand
                              ↓
                       physical transport
```

It complements rather than replaces the existing economy-production, household/local exchange, production foundation and physical storage/logistics work.

## Architectural constraints

1. Do not create a parallel `TradeManager` or market inventory.
2. Do not make `tradeCatalog.ts` authoritative for NPC economic decisions.
3. Do not duplicate `Inventory` state.
4. Do not make Trader a teleportation mechanism.
5. Do not introduce global household scans when a bounded settlement-local lookup is sufficient.
6. Keep source claims live and atomic.
7. Reuse `NpcAgent` decision/action architecture.
8. Keep concrete item ownership explicit.
9. Prefer deterministic selection and tie-breaking.
10. Preserve off-screen simulation compatibility.
11. Add JSDoc with `@domain` to important new public architectural functions/classes.
12. Verify current code before assuming any roadmap recipe, transformation or profession is implemented.

## Verification strategy

### Stage 1

- Hunter produces real meat/hide.
- Surplus can leave the Hunter household.
- Trader physically collects and delivers goods.
- Settlement storage receives the exact claimed quantity.
- Another household can acquire the goods.
- NPC consumes the acquired food.
- Concurrent actors cannot duplicate the same surplus.
- No player interaction is required.

### Stage 2

- Processing consumes real inputs.
- Outputs are real inventory/stock quantities.
- Input shortage blocks or delays production.
- Downstream demand can create pressure for upstream production.
- No free material appears.

### Stage 3

- Transport demand is created by a real shortage/surplus situation.
- Cargo is conserved through pickup/travel/unload.
- Interrupted transport does not duplicate/delete goods.
- Distant sources affect settlement supply.
- Off-screen progression remains coherent.

## Success criterion

The economy is meaningfully closed when a player can observe a causal chain such as:

```text
deer population → Hunter hunts → meat enters household
      → household surplus → Trader collects
      → settlement food stock rises → another household obtains meat
      → NPC consumes it → shortage falls
      → production/decision pressures change
```

The goal is not a sophisticated market UI. The goal is that goods created by the world can move through the world, satisfy real needs, and create new pressures and production consequences.

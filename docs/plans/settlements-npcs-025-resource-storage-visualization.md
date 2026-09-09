# Plan: Resource storage visualization

**Created:** 2026-09-07
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~settlements-npcs-009~~, ~~settlements-npcs-010~~
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `logistics`
**Tags:** `storage` `visualization` `assets`

## Goal

Make settlement and household storage visuals communicate actual stored quantity naturally while keeping representation bounded, deterministic and cheap to update.

Authoritative quantities remain in `Household` / `SettlementEconomy`; presentation remains derived from those owners. Do not add parallel storage state or persist visual fill/reveal state.

The work is staged:

1. **Stage 1 — progressive wood pile**: implemented authored discrete wood pile variants;
2. **Stage 1 follow-up — split settlement vs household wood storage**: correct the old shared-stockpile assumption so settlement wood and each household's wood have separate physical destinations and separate progressive piles;
3. **Stage 2 — pooled food representatives**: replace scale-only food quantity cues with bounded discrete representatives and stable cached pools;
4. **Stage 3A — container-ready food layout foundation**: deterministic local/container-relative layout;
5. **Stage 3B — actual container fill visualization**: only after a suitable open container asset is checked in and verified;
6. audit remaining `EconomicKind`s and defer those without real storage semantics/assets.

## Current verified state

`src/economy/kinds.ts` defines:

- `food`
- `water`
- `wood`
- `iron`
- `coal`
- `gold`
- `copper_ore`

`SettlementEconomy` owns settlement bulk stock and concrete settlement food. `Household` owns household wood/water/items.

Stage 1 is already implemented on current `main`:

- `public/models/settlement/wood_pile_progressive.glb`
- root `wood_pile_progressive`
- children `Pile_01`, `Pile_05`, `Pile_10`, `Pile_18`, `Pile_29`
- pure quantity → stage mapping
- cached named nodes
- no quantity-driven primary-pile scaling
- bounded overflow

However, Stage 1 preserved the older physical-storage assumption from `settlements-npcs-009/010`:

- `householdStorageDestination('wood', ...)` resolves to the shared settlement `landmarks.stockpile`;
- settlement wood also resolves to `landmarks.stockpile`;
- `physicalWoodStockpileQuantity()` sums `Σ Household.stock.wood + SettlementEconomy.wood`;
- `createSettlement.ts` feeds that total to one `storageVisual.wood` controller;
- the settlement wood interactable reports the same aggregate total.

That old assumption is now superseded. The intended world model is:

```text
SettlementEconomy.wood
    → settlement wood destination
    → settlement progressive wood pile

Household A.stock.wood
    → Household A wood destination
    → Household A progressive wood pile

Household B.stock.wood
    → Household B wood destination
    → Household B progressive wood pile
```

The same `wood_pile_progressive.glb` and `createWoodPileVisual()` mechanism should be reused for all instances.

`landmarks.householdStorages` already provides deterministic, household-index-aligned yard storage anchors. Do not create a parallel household-place system. A separate nearby deterministic yard slot for household wood should extend the existing yard placement mechanism rather than overlap the household crate.

Food continues to use `FOOD_ITEM_KINDS` + `createItemMesh(kind)`. The current crate is closed; a low-poly Fruit Crate candidate from Poly Pizza (`https://poly.pizza/m/aXulVWHOeV`) is promising for Stage 3B but remains unapproved until checked in and inspected.

Nature assets `resource_rock_1.glb` and `resource_gold_1.glb` are terrain deposits and must not be used as stored-resource visuals.

## Scope

### 1. Stage 1 — progressive wood pile — implemented

Keep the authored contract:

```text
wood_pile_progressive
├── Pile_01
├── Pile_05
├── Pile_10
├── Pile_18
└── Pile_29
```

Mapping:

| Stored wood | Visible variant |
|---:|---|
| 0 | none |
| 1 | `Pile_01` |
| 2–5 | `Pile_05` |
| 6–10 | `Pile_10` |
| 11–20 | `Pile_18` |
| 21+ | `Pile_29` |

Stage nodes remain cached by stable authored names. Hidden stages do not render. High-stock overflow remains bounded.

### 1F. Stage 1 follow-up — separate settlement and household wood storage

This is the next wood correction.

#### Ownership and visual source

- settlement pile quantity = `SettlementEconomy.query('wood')` only;
- household pile quantity = that household's `Household.stock.query('wood')` only;
- do not aggregate household and settlement wood into one visible pile.

#### Physical destinations

Change wood delivery semantics so:

- settlement-scope wood → settlement `landmarks.stockpile`;
- household-scope wood → that household's own wood storage point in its yard.

Do not alter authoritative stock ownership: household deposits still credit `Household.stock.wood`; settlement deposits still credit `SettlementEconomy.wood`.

#### Household yard placement

Reuse existing deterministic yard geometry and house/home indexing.

Add a dedicated household wood slot/offset rather than placing the pile directly on the existing household crate anchor. Prefer extending `HOUSEHOLD_YARD_PROP_OFFSETS` / `houseYardPlacements()` or an equivalent existing yard helper.

Requirements:

- deterministic position per household;
- same ordering as `homes`, `houses`, `householdStorages`, and `households`;
- no overlap with crate/barrel/trough/blacksmith yard equipment;
- update household yard clearance if the new slot extends the required radius;
- do not invent a new general landmark system.

Expose the physical positions explicitly, e.g. `SettlementLandmarks.householdWoodStorages` (exact name may follow current conventions), so delivery, visuals and interactions resolve the same point rather than recomputing offsets independently.

#### Visual controllers

Evolve `SettlementStorageVisuals` conceptually from one shared wood controller to:

```ts
settlementWood: WoodPileVisual
householdWood: WoodPileVisual[]
settlementFood: FoodStorageVisual
householdFood: FoodStorageVisual[]
```

Reuse the same progressive asset/controller. Do not duplicate wood stage logic.

`createSettlement.ts::update()` should conceptually drive:

```text
settlementWood.sync(economy.query('wood'))
householdWood[i].sync(households[i].stock.query('wood'))
```

#### Inspection/interactions

The settlement wood pile must report only settlement-owned wood.

Household storage inspection should continue reporting that household's own stock and therefore naturally include its own wood. If a dedicated household wood-pile interactable is useful, reuse the household reference and do not introduce duplicate quantity state.

`physicalWoodStockpileQuantity()` no longer represents one physical pile after this follow-up. Remove it if unused, or rename/re-scope it only if a real aggregate-total caller still needs it. Do not keep it as the visual/inspection source for the settlement pile.

#### Performance

This adds one progressive pile per household, so keep it bounded and cheap:

- clone/load through the existing template path;
- resolve stage nodes once per controller;
- normal sync only toggles cached visibility;
- no per-sync traversal/creation/disposal;
- overflow must remain bounded per pile;
- no worker.

### 2. Stage 2 — pooled food representatives

Keep one shared food visualization mechanism for household and settlement storage.

Keep:

- `FOOD_ITEM_KINDS` as deterministic source ordering;
- `createItemMesh(kind)` as authoritative item visual factory/fallback;
- current bounded kind selection.

Starting representative policy:

| Stored quantity | Visible representatives |
|---:|---:|
| 0 | 0 |
| 1 | 1 |
| 2 | 2 |
| 3–4 | 3 |
| 5–7 | 4 |
| 8–12 | 5 |
| 13–20 | 6 |
| 21+ | 8 max |

**8 is the global visible-mesh cap per storage location, not per kind.** Allocate it deterministically among selected kinds.

Requirements:

- low quantities remain close to one visible rep per unit;
- growth becomes sub-linear at higher quantities;
- scale is not the primary quantity signal;
- cached/lazy representative pools replace normal recreate/dispose churn;
- stable identities and deterministic layout;
- no separate household vs settlement food renderer.

### 3. Stage 3A — container-ready food layout foundation

Keep separation:

`Inventory → selected kinds/counts → representative allocation → deterministic local slots → visibility/transforms`

Use local/container-relative slot data such as `{ x, y, z, yaw }`. Do not bake guessed current-crate interior bounds into quantity logic.

### 4. Stage 3B — actual open-container fill

Current `crate.glb` is closed/merged and unsuitable for truthful internal fill.

Candidate:

- Fruit Crate by BlenderVoyage / Poly Pizza
- `https://poly.pizza/m/aXulVWHOeV`
- low-poly, GLTF/FBX, CC0/public-domain listing

Treat as candidate until checked in and verify hierarchy, dimensions, origin/orientation, usable interior/rim bounds, camera readability and clipping behavior.

### 5. Remaining `EconomicKind`s

- `wood`: Stage 1 + Stage 1 follow-up;
- `food`: Stage 2 + 3A + 3B;
- `iron`, `coal`, `gold`, `copper_ore`: defer until real destinations and semantically correct stored-material visuals exist;
- `water`: defer until stored-water container/destination exists.

Do not reuse terrain deposits as storage and do not map stored water onto the well.

## Tests

### Stage 1 follow-up

Cover at minimum:

- settlement pile reads only `SettlementEconomy.wood`;
- each household pile reads only its own `Household.stock.wood`;
- changing Household A wood does not affect Household B or settlement pile;
- changing settlement wood does not affect household piles;
- household wood destination resolves to that household's dedicated yard wood point;
- settlement wood destination remains `landmarks.stockpile`;
- NPC chop/deposit path uses household wood destination;
- household wood positions remain deterministic and index-aligned;
- yard clearance/spacing tests cover the new slot;
- one positive quantity selects exactly one `Pile_*` per controller;
- repeated sync preserves object identity;
- old aggregate shared-pile test expectations are removed/replaced.

### Stage 2 / 3A

- threshold boundaries;
- global visible food cap ≤ 8 per storage location;
- deterministic multi-kind budget allocation;
- stable pooled identities;
- no normal sync dispose/recreate;
- deterministic local layout;
- shared controller mechanism for household and settlement food.

## Focused files

Stage 1 follow-up is expected to touch mainly:

- `src/settlement/storageDestinations.ts`
- `src/settlement/storageDestinations.test.ts`
- `src/settlement/storageVisuals.ts`
- `src/settlement/storageVisuals.test.ts`
- `src/settlement/props.ts`
- `src/settlement/householdYard.ts`
- `src/settlement/householdYard.test.ts`
- `src/settlement/createSettlement.ts`
- `src/ai/NpcAgent.ts` and focused tests/callers that resolve household wood delivery
- interaction types/resolution only where the old aggregate settlement wood inspection must be corrected.

Avoid unrelated economy, persistence, NPC decision-system or rendering refactors.

## Verification

Automated verification:

- focused storage destination/visual/yard tests;
- relevant NPC delivery tests;
- repository TypeScript/test/build checks.

Manual browser verification is performed by the User, not the AI agent.

Verify manually:

- settlement has its own progressive wood pile reflecting only settlement stock;
- each household has its own progressive wood pile reflecting only that household stock;
- household NPC wood delivery visibly ends at its own yard pile;
- piles do not overlap crate/barrel/trough/house/blacksmith equipment;
- progressive stages and bounded overflow still behave correctly.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
# Plan: Resource storage visualization

**Created:** 2026-09-07
**Status:** `planned` 📋
**Type:** feature
**Priority:** low · **Effort:** M
**Depends on:** ~~settlements-npcs-009~~, ~~settlements-npcs-010~~
**Domain:** `settlements-npcs`
**Subdomains:** `economy` `logistics`
**Tags:** `storage` `visualization` `assets`
**Model:** Sonnet, Composer

## Goal

Make settlement and household storage visuals communicate actual stored quantity naturally while keeping representation bounded, deterministic and cheap to update.

Authoritative quantities remain in `Household` / `SettlementEconomy`; presentation remains derived from those owners. Do not add parallel storage state or persist visual fill/reveal state.

The work is staged:

1. **Stage 1 — progressive wood pile**: implemented authored discrete wood pile variants;
2. **Stage 1 follow-up — split settlement vs household wood storage**: implemented — settlement wood and each household's wood have separate physical destinations and separate progressive piles;
3. **Stage 2 — pooled food representatives**: **next implementation stage** — replace scale-only food quantity cues with bounded discrete representatives and stable cached pools;
4. **Stage 3A — container-ready food layout foundation**: implement together with Stage 2 as neutral local/container-relative slot layout, without depending on an open-container asset;
5. **Stage 3B — actual container fill visualization**: separate later stage, only after a suitable open container asset is checked in and verified;
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

Stage 1 follow-up is implemented on current `main`. The physical model is:

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

The same `wood_pile_progressive.glb` and `createWoodPileVisual()` mechanism is reused for all instances.

`landmarks.householdStorages` already provides deterministic, household-index-aligned yard storage anchors. Household wood extends the same yard-placement mechanism through `landmarks.householdWoodStorages` rather than creating a parallel place system.

Food currently uses `FOOD_ITEM_KINDS` + `createItemMesh(kind)`. `src/settlement/storageVisuals.ts` still represents at most four food kinds by scaling one mesh per selected kind and recreates/disposes meshes when the signature changes. Stage 2 replaces that behaviour.

Current food item GLBs are not a blocker. `createItemMesh(kind)` remains the visual factory and already provides a usable fallback when a dedicated food model is absent. Dedicated carrot/cabbage/potato/tomato/fish models may improve presentation later but are not required for Stage 2/3A.

The current `crate.glb` is closed/merged and unsuitable for truthful internal fill. A low-poly Fruit Crate candidate from Poly Pizza (`https://poly.pizza/m/aXulVWHOeV`) is promising for Stage 3B but remains unapproved until checked in and inspected.

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

### 1F. Stage 1 follow-up — separate settlement and household wood storage — implemented

Settlement pile quantity is `SettlementEconomy.query('wood')` only. Household pile quantity is that household's `Household.stock.query('wood')` only. Household wood delivery uses the dedicated deterministic `SettlementLandmarks.householdWoodStorages` yard point; settlement wood continues to use `landmarks.stockpile`.

The shared controller shape is:

```ts
type SettlementStorageVisuals = {
  settlementWood: WoodPileVisual
  householdWood: WoodPileVisual[]
  settlementFood: FoodStorageVisual
  householdFood: FoodStorageVisual[]
}
```

Do not reintroduce aggregate physical wood state or duplicate progressive-pile logic.

### 2. Stage 2 — pooled food representatives — next implementation stage

Implement Stage 2 without waiting for new models/assets.

Keep one shared food visualization mechanism for household and settlement storage.

Reuse:

- `FOOD_ITEM_KINDS` as deterministic source ordering;
- `createItemMesh(kind)` as the authoritative item visual factory/fallback;
- `createFoodStorageVisual()` as the shared controller for household and settlement storage.

Replace the current one-mesh-per-kind + quantity scaling behaviour with discrete representatives.

#### 2.1 Representative count

Use one pure total-quantity mapping:

| Total stored food quantity | Visible representatives |
|---:|---:|
| 0 | 0 |
| 1 | 1 |
| 2 | 2 |
| 3–4 | 3 |
| 5–7 | 4 |
| 8–12 | 5 |
| 13–20 | 6 |
| 21+ | 8 |

The implementation should expose an equivalent pure helper such as:

```ts
foodRepresentativeCount(totalQuantity: number): number // 0..8
```

**8 is the global visible-mesh cap per storage location, not per kind.**

#### 2.2 Kind selection and deterministic allocation

Use at most four distinct food kinds per storage location. Rename the current ambiguous slot limit if useful so the two limits remain explicit conceptually:

```ts
FOOD_STORAGE_MAX_KINDS = 4
FOOD_STORAGE_MAX_REPRESENTATIVES = 8
```

Selection/allocation contract:

1. iterate positive-count kinds in stable `FOOD_ITEM_KINDS` order;
2. select at most the first four positive kinds;
3. compute the global representative budget from total stored food quantity;
4. allocate one representative to each selected kind while budget remains, preserving kind diversity;
5. distribute the remaining budget deterministically in stable selected-kind order, never allocating more representatives of a kind than its real stored count;
6. repeat stable passes until the budget is exhausted or every selected kind has reached its stored count.

Expose this as pure logic equivalent to:

```ts
allocateFoodRepresentatives(
  items: Inventory,
): Array<{ kind: ItemKind; count: number }>
```

The returned `count` is visible representative count for that kind, not stored quantity.

#### 2.3 Cached representative pools

Replace normal `sync()` dispose/recreate churn with stable cached/lazy pools.

Requirements:

- representatives are created lazily through `createItemMesh(kind)`;
- once materialized for a kind/location, normal quantity changes reuse object identity;
- `sync()` primarily toggles visibility and updates deterministic transforms;
- one-time bounded creation when a location first needs an additional representative is allowed;
- `dispose()` still releases every representative owned by that controller;
- no model loading, scene traversal, random layout, geometry/material recreation or disposal during ordinary unchanged sync;
- no worker.

Do not share actual `Object3D` instances between storage locations. Pool ownership remains per `FoodStorageVisual` controller.

### 3. Stage 3A — container-ready food layout foundation — implement with Stage 2

Keep separation:

```text
Inventory
→ representative budget
→ selected kinds/allocation
→ deterministic local slots
→ visibility/transforms
```

Define exactly eight deterministic local/container-relative slots, one for each possible visible representative:

```ts
type FoodStorageLocalSlot = {
  x: number
  y: number
  z: number
  yaw: number
}
```

Requirements:

- slot identity/order is stable;
- placement is deterministic and contains no randomness;
- slots are local to the food-storage anchor/controller, not world-layout policy;
- do not bake guessed interior bounds of the current closed crate into quantity/allocation logic;
- for the current closed crate, place representatives in a compact readable arrangement around/above the existing storage anchor as today, using the neutral slot transforms;
- Stage 3B must be able to replace only the slot geometry/anchor transform without changing representative-count/allocation/pooling logic.

Stage 2 + Stage 3A are one coherent implementation pass.

### 4. Stage 3B — actual open-container fill — separate later stage

Do **not** implement Stage 3B as part of the next implementation pass.

Current `crate.glb` is closed/merged and unsuitable for truthful internal fill.

Candidate:

- Fruit Crate by BlenderVoyage / Poly Pizza
- `https://poly.pizza/m/aXulVWHOeV`
- low-poly, GLTF/FBX, CC0/public-domain listing

Before Stage 3B begins, the chosen asset must be checked into the repository and verified for:

- runtime file path;
- hierarchy/root node names where relevant;
- actual openness;
- origin/orientation;
- bounding box and intended world scale;
- usable interior/rim bounds;
- camera readability;
- clipping behaviour with up to eight representatives.

Only then adapt Stage 3A local slots to truthful inside-container placement. Do not make Stage 2 depend on this asset.

### 5. Remaining `EconomicKind`s

- `wood`: Stage 1 + Stage 1 follow-up — implemented;
- `food`: Stage 2 + 3A next; 3B after asset verification;
- `iron`, `coal`, `gold`, `copper_ore`: defer until real destinations and semantically correct stored-material visuals exist;
- `water`: defer until stored-water container/destination exists.

Do not reuse terrain deposits as storage and do not map stored water onto the well.

## Non-goals for the next implementation pass

- no new GLB assets;
- no Stage 3B/open-container integration;
- no ore/mineral/water storage visuals;
- no changes to authoritative `Household` / `SettlementEconomy` ownership;
- no new generic storage-place framework;
- no persistence changes;
- no NPC decision/economy refactor;
- no unrelated rendering refactor.

## Tests

### Existing Stage 1 / follow-up behaviour

Keep existing coverage ensuring settlement and household wood remain independent, destinations remain owner-correct, positions remain deterministic/index-aligned and positive quantity selects exactly one primary `Pile_*` stage.

### Stage 2 / 3A

Cover at minimum:

- every representative-count threshold boundary;
- quantity 0 → no visible representatives;
- low quantities 1 and 2 remain one visible representative per stored unit;
- global visible food cap is ≤ 8 per storage location;
- at most four distinct kinds are represented;
- deterministic kind selection follows `FOOD_ITEM_KINDS` order;
- initial allocation preserves kind diversity while budget permits;
- remaining budget distribution is deterministic;
- no kind receives more visible representatives than its stored count;
- repeated `sync()` with same effective representation preserves object identity;
- increasing/decreasing quantities reuses already-materialized representatives;
- normal sync does not dispose/recreate cached representatives;
- deterministic local slot assignment and transforms;
- household and settlement food use the same controller mechanism;
- `dispose()` cleans every object owned by the controller.

## Focused files for the next implementation stage

Expected primary files:

- `src/settlement/storageVisuals.ts`
- `src/settlement/storageVisuals.test.ts`

Touch callers only if the existing `createFoodStorageVisual()` API needs a small compatible adjustment for local-slot placement. Avoid broad changes: current household and settlement callers should continue using one shared food visual mechanism.

Add/update JSDoc for important pure allocation/layout helpers and `FoodStorageVisual` ownership/lifecycle where it improves preflight discovery; use `@domain settlements-npcs` on important architectural/public symbols where appropriate.

## Verification

Automated verification for the next stage:

- focused `storageVisuals` tests;
- TypeScript check;
- relevant repository test/build checks according to `CLAUDE.md`.

Manual browser verification is performed by the User, not the AI agent.

Verify manually after Stage 2/3A:

- food quantity grows through discrete representative count rather than inflated mesh scale;
- household and settlement food both behave consistently;
- up to eight representatives remain readable and bounded;
- repeated stock changes do not visibly recreate/flicker the whole representation;
- current closed crate remains visually acceptable without pretending items are truthfully inside it.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

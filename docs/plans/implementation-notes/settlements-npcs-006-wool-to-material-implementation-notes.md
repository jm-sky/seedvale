# Implementation notes: settlements-npcs-006 — Wool to material

Plan: `docs/plans/settlements-npcs-006-wool-to-material.md`

## Review outcome

The plan is **not currently implementable as written** without depending on the planned production foundation. The repository has `ProductionDef` and an atomic item-recipe primitive, but there is no unified production executor that can consume real inputs and create outputs across ownership boundaries. That is the purpose of planned `settlements-npcs-015`.

Therefore:

- treat `settlements-npcs-015` as a real implementation dependency for this plan, or implement this plan only after 015;
- do **not** create a wool-specific production executor/system as a workaround;
- the plan's current `Depends on: fauna-004` is incomplete and should eventually include `settlements-npcs-015`.

## Existing mechanisms to reuse

### Production

`src/economy/production.ts` already defines `ProductionDef` with both `itemInputs/itemOutputs` and stock inputs/outputs. `produceFirstAvailableItemRecipe()` is currently the generic item-recipe selector used by Hunter, and `Inventory.applyRecipe()` is atomic for a **single Inventory**.

Wool material should become an ordinary item recipe:

`itemInputs: wool × N → itemOutputs: wool_material × M`

The actual cross-owner/work execution should use the executor delivered by 015 once available. Do not duplicate Hunter's direct `Inventory.applyRecipe()` path for this feature.

### Item ownership

`Household.items` is the correct owner for both raw wool and produced wool material. It is an unbounded generic `Inventory`, unlike `Household.stock`, which is now effectively wood-only.

Do not add:

- `EconomicKind: wool`,
- `SettlementEconomy.wool`,
- a textile-specific storage,
- a production inventory.

This also means the plan's “Household/storage/economy flow” should be interpreted as existing concrete-item storage semantics; wool is not food and must not go through `depositFood()`.

### Livestock / wool input

After `fauna-004`, sheep wool should already be represented as a normal `ItemKind` and produced into the owning household's concrete inventory. Use that state directly.

Do not scan the world for wool. Production input resolution should use the known household owner/source, consistent with the production boundary from 015.

### NPC work

`NpcAgent` already owns the normal scheduled work pipeline and uses `PlannedAction` for movement + execution. Textile Worker should be another role dispatch inside that pipeline, not a new scheduler/FSM.

The important separation is:

`NpcAgent` selects/executes work → production executor performs recipe transaction.

The NPC should not implement recipe consumption/output mutation itself.

### Tool capability

`src/items/itemCatalog.ts` is the single capability source of truth. Current capabilities include `wood_chopping`, `meat_harvesting`, `soil_digging`, `rock_mining`, `fire_starting` and `fishing`; `shearing` does not exist yet.

Add `shearing` there and gate the action through `Inventory.hasCapability()` / `findWithCapability()`, not `inventory.has('shears')`.

The existing `npcLoadout.ts` centralizes role-specific carried tools/weapons. If Textile Worker needs shears autonomously, provision them through this existing loadout seam rather than a textile-specific inventory/workplace. Revalidate the capability at action completion.

## Important architecture decisions

### Role assignment

Adding `textile_worker` to `Role` is an exhaustive-type change. At minimum inspect/update:

- `src/ai/characters.ts`,
- `src/ai/schedule.ts`,
- role dispatch in `src/ai/NpcAgent.ts`,
- role loadout mappings,
- any exhaustive role tests/maps.

Do not merely add the role to `RANDOM_ROLES` without considering fauna ownership. A random Textile Worker can otherwise appear in a household with no sheep and a sheep household can have nobody producing its wool.

Prefer the existing deterministic character/family generation seams and make the assignment livestock-aware, analogous to the shepherd constraint documented in `fauna-004`. Do not introduce a second profession-assignment system.

### Production destination

For the first implementation, produced wool material should remain in the Textile Worker's owning `Household.items`. There is no need to route it through `SettlementEconomy`.

If 015's executor introduces explicit source/destination adapters, pass the existing household inventory as the destination; do not invent textile-specific delivery semantics.

### Physical workplace

The plan intentionally leaves a workplace optional. Current architecture does not have a textile workplace. Do not introduce a new building/landmark merely to make the recipe visible.

If the production executor/work flow requires a workplace, use the smallest existing generic workplace contract. Otherwise Textile Worker can perform a normal work action without a new physical station.

## Production transaction / capacity

Raw wool is a concrete stack item, so the recipe must consume it atomically with the output. The existing `Inventory.applyRecipe()` protects single-inventory recipes, but the future production executor is needed if input and output ownership/transaction boundaries span different objects.

The safe sequence is:

1. preview availability during work selection;
2. begin normal NPC work action;
3. revalidate live input/capability at completion;
4. atomically consume wool and create wool material;
5. only report success after output is committed.

Do not remove wool when the action starts.

`NpcAgent.carried` is only 5 kg today. If the intended recipe consumes raw wool from the household and produces directly into `Household.items`, the worker does **not** need to carry the production input/output. Avoid adding unnecessary physical transport just for this plan.

If the implementation instead chooses a carried-material interpretation, capacity must be checked against the actual `ITEM_DEFS.wool.weight`; do not hard-code the 1 kg assumption from the roadmap.

## Recipe definition

Keep the conversion quantity explicit in the recipe rather than introducing a yarn abstraction. The roadmap reference of 1 kg wool → ~200 yarn units → ~3 m² cloth is informational only.

There should be exactly one broad Textile Worker role; do not create spinner/weaver/cloth-maker roles.

The resulting `wool_material` should be a normal stackable `ItemKind` with ordinary `ITEM_DEFS` and catalog metadata. No ItemInstance/durability is justified by the current design.

## Potential pitfalls

- **Dependency mismatch:** `settlements-npcs-006` currently depends only on `fauna-004`, while its “existing production pipeline” is not yet a complete execution system. This is the largest issue in the plan.
- **Do not use `SettlementEconomy.produce()`:** it only applies stock-based recipes to `EconomicStock`, which is the wrong owner for wool/items.
- **Do not generalize `SettlementEconomy` just for wool:** concrete item storage already exists.
- **Do not use food helpers:** wool/material are non-food concrete items.
- **Exhaustive Role changes:** adding Textile Worker will require all role maps/switches to compile.
- **Tool provisioning:** adding the capability without putting a capable tool in an autonomous worker's carried inventory makes the profession permanently blocked.
- **Role usefulness:** random assignment without sheep awareness produces idle Textile Workers and unmanaged sheep households.
- **No per-frame production:** recipe discovery/execution belongs to work/decision boundaries.
- **No partial transaction:** failed/revalidated production must leave both wool and output unchanged.
- **Persistence:** follow current fauna/household runtime semantics; do not add special wool-cycle or production persistence unless the shared architecture requires it.

## Recommended implementation order

1. Land/verify `fauna-004` so sheep expose real wool and the owning household receives it.
2. Land `settlements-npcs-015` production execution before implementing this plan.
3. Add `wool_material` item definition/catalog entry and the concrete recipe.
4. Add `textile_worker` role, schedule and livestock-aware assignment.
5. Add/provision shearing/production tool capability only where required by the actual work contract.
6. Integrate recipe selection/execution into the existing NPC work pipeline.
7. Verify input consumption, output ownership, failure/revalidation and repeated/off-screen work.
8. Keep browser verification manual as specified by project workflow.

## Relevant current files

- `src/economy/production.ts` — current `ProductionDef` and item-recipe helper; execution is still split.
- `src/items/Inventory.ts` — atomic single-inventory `applyRecipe()` and capability lookup.
- `src/items/itemCatalog.ts` — `ItemCapability` / `ITEM_CATALOG`.
- `src/items/items.ts` — authoritative `ItemKind` / `ITEM_DEFS`.
- `src/ai/characters.ts` — exhaustive `Role` and random role selection.
- `src/ai/schedule.ts` — role schedule templates.
- `src/ai/NpcAgent.ts` — scheduled work, `PlannedAction`, carried inventory and existing production work.
- `src/ai/npcLoadout.ts` — centralized role tool/weapon provisioning.
- `src/settlement/household.ts` — authoritative `Household.items`.
- `src/economy/settlementEconomy.ts` — settlement bulk stock; not the owner for wool.
- `src/fauna/livestockProduction.ts` — existing absolute-day livestock production primitives.
- `src/settlement/livestock.ts` / `src/settlement/createSettlement.ts` — livestock ownership and NPC/household construction seams.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

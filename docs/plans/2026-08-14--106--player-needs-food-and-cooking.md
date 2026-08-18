# Plan 106 — Player Needs, Food & Cooking

**Status:** `done` ✅ — playtest accepted 2026-08-18
**Priority:** 🔴 high
**Effort:** L
**Date:** 2026-08-14
**Depends on:** ?

## Goal

Introduce the first coherent player survival loop built on the existing `HealthState`, stamina/vigor concepts and item/inventory systems:

`needs → resources → items → consumption/processing`

The player gains four basic needs/resources of state:

- stamina — short-term physical effort
- vigor — longer-term daily effort budget
- hunger — need for food
- thirst — need for water

Food and water should be real inventory items rather than a parallel consumable system.

## Scope

### 1. Player needs

Add player state for:

- `stamina`
- `vigor`
- `hunger`
- `thirst`

Define deterministic drain, recovery and thresholds appropriate for the existing player simulation. Reuse existing shared state concepts where possible instead of creating a second stamina/vigor implementation.

Hunger and thirst should affect gameplay, but this plan should not introduce a broad disease/death framework. Integrate with the existing player `HealthState` only where necessary.

### 2. Food items

Add food as normal inventory items:

- `tomato` — collected from settlement gardens
- `raw_meat` — obtained from an animal/carcass
- `roasted_meat` — cooked meat
- `bread` — item prepared for future/emergency use

Consuming a food item reduces hunger according to its definition.

Do not create a separate food inventory or food manager.

### 3. Water and containers

Add a reusable water container:

- `waterskin` / bukłak
- empty → can be filled
- filled → can be consumed to reduce thirst

Water itself is represented as an item/state suitable for the existing inventory model.

### 4. Water sources

Introduce a shared `WaterSource` interaction abstraction rather than separate well/lake implementations.

A water source supports:

- `drink()` — immediately reduces player thirst
- `fill(container)` — fills an empty/partially empty suitable container

#### Well

Safe water source.

Interaction behaviour:

- player may fill a waterskin and immediately drink, if appropriate
- player may only drink when there is no suitable container or the available container is already full
- player may choose between drinking and filling when both actions are possible

The existing settlement well and interaction queue should remain the source of truth for access to the well.

#### Lake

Lake water supports the same drink/fill abstraction.

When drinking from a lake, show a warning such as:

> Woda z jeziora może powodować chorobę.

The actual disease/illness system is **out of scope** for this plan. The warning is a gameplay/UI hook for future implementation.

Lake water should be represented as an unsafe/lower-quality water source, e.g. through a source quality property, rather than a separate mechanic.

Future sources such as rivers, streams, polluted water or treated water should be able to reuse the same abstraction.

### 5. Animal → meat

Connect the existing animal death/carcass flow to food acquisition.

A suitable animal corpse can provide `raw_meat`.

Reuse existing corpse interaction and inventory mechanisms rather than adding a second harvesting system.

### 6. Cooking

Implement the first processing recipe:

`raw_meat + campfire → roasted_meat`

Use the existing placed-fire/campfire system as the processing station.

The processing mechanism should be small and extensible, e.g. conceptually:

`input item(s) → processing station → output item`

Do **not** implement a general crafting system in this plan.

### 7. UI

Expose the four player needs clearly in the existing player UI:

- stamina
- vigor
- hunger
- thirst

Add contextual interaction labels/actions for water and cooking where required.

Keep the UI implementation aligned with the existing Vue/DOM architecture rather than migrating unrelated screens.

### 8. Persistence

Persist player needs where appropriate through the existing `SaveData` mechanism.

At minimum:

- hunger
- thirst
- vigor

Stamina may remain transient if that matches the existing short-term state model.

Update save schema/version handling if required.

## Explicitly out of scope

- general crafting system
- full farming/crop simulation changes beyond exposing existing garden tomatoes
- disease/illness implementation
- nutrition simulation
- spoilage
- food durability
- complex water purification
- player death/respawn overhaul
- NPC food consumption changes

## Future note — Emergency rescue

Record, but do not implement in this plan.

### Angel rescue

A future emergency mechanism may prevent a survival-related player death by having an **angel descend from the sky** and intervene:

- brings a jug/container of water
- brings bread
- kills the attacking wolf

This should be treated as a future diegetic emergency/rescue system, not as part of the normal survival loop.

It should only be designed/implemented once player death and emergency-state semantics are mature enough to support it.

## Architectural constraints

- Extend existing `Inventory`, item definitions/catalog and player state.
- Reuse existing `HealthState`, stamina/vigor concepts and settlement well interaction queue.
- Reuse existing animal corpse/death flow.
- Reuse existing placed-fire/campfire system.
- Prefer a shared `WaterSource` abstraction with source properties such as `quality: safe | unsafe`.
- Do not create parallel `FoodManager`, `WaterManager` or player-only crafting architecture.
- Keep high-frequency need simulation lightweight; event-driven or coarse simulation is preferred over unnecessary per-frame work.

## Assets

Review `docs/assets/MODELS.md` and `docs/assets/SOUNDS.md` during implementation.

Potential new assets:

- waterskin/bukłak model
- tomato/food item models if existing assets are insufficient
- cooked meat model if needed

If new assets are required, add them to the relevant asset backlog as required by `CLAUDE.md`.

## Verification

Technical checks:

    npx tsc --noEmit
    npm run lint
    npm run build
    npm run test

Manual/browser verification: playtest accepted 2026-08-18.

1. needs change over time and recover according to their intended rules
2. tomato can be collected and consumed
3. animal corpse can yield raw meat
4. raw meat can be cooked at a campfire
5. roasted meat restores hunger appropriately
6. well drinking works
7. waterskin can be filled at the well
8. full/missing container falls back to drinking
9. lake drinking/filling works
10. lake drinking shows the illness-risk warning
11. player state persists across save/load where specified
12. no unrelated NPC/fauna behaviour regresses

Separate **implemented**, **technically verified** and **browser/manual verified** status in the implementation notes.

# Plan: Functional adventure cave crates

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** polish
**Priority:** medium · **Effort:** S
**Depends on:** ~~world-terrain-020~~, ~~world-terrain-028~~
**Domain:** `world-terrain`
**Subdomains:** `landmarks` `interaction`
**Tags:** `caves` `containers` `loot`
**Roadmap:** -
**Model:** Sonnet, Composer

## Problem

Adventure caves currently mix two systemic treasure chests with up to two presentation-only `crate` props. The treasure chests are real `WorldGeneratedContainers`, while the crate anchors are rendered by `caveAdventureProps.ts` only and therefore cannot be opened. Visually similar storage objects consequently have different interaction semantics.

## Goal

Make adventure-cave `crate` anchors use the existing world-generated container/inventory interaction instead of remaining decorative props. Their contents should be deliberately low-value and deterministic: they may be empty or contain small utility/junk supplies such as rope, a torch, basic food or similarly inexpensive existing items. Treasure anchors retain their existing richer profiles and quest/content-policy behavior.

## Scope

1. Materialize each accepted adventure `crate` anchor as a `WorldGeneratedContainerSpec` with the anchor's stable id, exact cave `x/y/z/yaw`, and `{ kind: 'cave', caveId }` spatial context.
2. Add one deterministic low-value cave-crate loot resolver driven by world seed + stable anchor id. It must support an explicit empty outcome and small ordinary-item outcomes; it must never roll treasure-tier coins, gemstones, gold or quest items.
3. Keep ownership in `WorldGeneratedContainers` so transfer UI, inventory capacity, save/load and depletion persistence work exactly like other fixed world containers.
4. Stop `caveAdventureProps.ts` from independently rendering `crate` anchors once those anchors are systemic containers, preventing duplicate overlapping visuals/targets.
5. Preserve the existing `sideTreasure` / `finalTreasure` materialization and `CaveAdventureContentPolicy` behavior unchanged.
6. Add focused unit coverage for deterministic crate contents, allowed loot/quantity bounds, empty outcome support, exact underground placement descriptors, stable ids, and non-interference with treasure-policy filtering.

## Architecture decisions

- Do **not** add a separate cave-crate inventory, interaction handler, persistence model or loot manager.
- `CaveContentAnchor` remains the placement authority. No new coordinates or runtime random placement.
- `WorldGeneratedContainers` remains the gameplay/storage owner. A crate is a low-value container, not a new treasure-site archetype.
- Loot generation must be pure and deterministic. Rebuilding the world bundle must not reroll a crate.
- Presentation must have exactly one owner per crate anchor. Once materialized as a world-generated container, the presentation-only cave prop path must exclude that role.
- Do not make ordinary cave crates participate in `CaveAdventureContentPolicy`; that policy controls treasure/story claims, whereas these crates are environmental supplies present independently of quest reservation profiles.
- Prefer existing `ItemKind`s already supported by `Inventory`; candidate ordinary items include `rope`, `torch`, `bread`, `branch` or similarly cheap non-instance goods after checking current catalog values/semantics during implementation.
- Empty crates are valid. Opening one and finding nothing is preferable to an inert decorative fake.

## Relevant code

- `src/world/caves/caveContentAnchors.ts` — adventure `crate` anchors; currently up to two are resolved around the wagon with stable `${caveId}:crate:<ordinal>` ids.
- `src/world/caves/caveAdventureProps.ts` — currently includes `crate` in `CAVE_PRESENTATION_PROP_ROLES` and clones the crate GLB/fallback as presentation-only scenery.
- `src/app/worldBundle.ts` — existing `caveTreasureContainerSpecs()` seam and composition of `worldGeneratedSpecs`.
- `src/world/worldGeneratedContainers.ts` — authoritative fixed-container contents, underground explicit-Y placement, cave spatial context, persistence and transfer API.
- `src/items/treasureGameplay.ts` — example of deterministic seeded loot generation; ordinary cave crates must remain separate from treasure profiles.
- `src/items/items.ts` / `src/items/itemCatalog.ts` — validate candidate low-value item kinds and economics.
- `src/app/worldBundle.caveTreasure.test.ts` and cave-content tests — extend or add focused tests near the materialization helper.

## Implementation outline

1. Extract/add a pure helper for adventure crate loot and a pure helper mapping `crate` anchors to `WorldGeneratedContainerSpec`s. Keep it close to the existing cave-container composition unless a small cave-specific pure module gives cleaner ownership.
2. Append crate specs to the existing `worldGeneratedSpecs` list before `createWorldGeneratedContainers()` is constructed. Reuse each anchor id directly and preserve its explicit Y/spatial context.
3. Remove `crate` from the presentation-only anchor path in `caveAdventureProps.ts` and stop preloading/holding the crate template there if no other presentation role uses it.
4. If preserving the current crate visual inside `WorldGeneratedContainers` requires a small presentation discriminator, keep that discriminator presentation-only and optional so existing chest/casket callers are unchanged. Do not create a second container kind solely for cave loot unless runtime capacity/semantics genuinely differ.
5. Add tests proving deterministic rebuild behavior and that treasure containers/quest reservations are unaffected.
6. Add JSDoc with `@domain world-terrain` to the new public/pure cave-container helpers where useful for preflight discovery.

## Loot constraints

The exact weighted table may be tuned during implementation from current item prices, but keep these invariants:

- meaningful chance of an empty crate;
- otherwise only 1–2 low-value item kinds and small stack counts;
- rope/torch/basic provisions are appropriate outcomes when their current catalog semantics permit;
- no gemstones, gold, large coin rewards, keys, maps, unique/quest items or high-tier equipment;
- loot is deterministic from world seed + anchor id and does not respawn after withdrawal because container state is already persisted.

## Non-goals

- Changing the two adventure treasure chest tiers.
- New lock/trap mechanics.
- Respawning cave crate loot.
- General crate/barrel/sack container taxonomy for the whole game.
- Making wagon/support/lantern props interactive.
- Reworking cave topology or anchor placement.

## Verification

Automated:

- crate-anchor → container-spec mapping preserves id/x/y/z/yaw/cave spatial context;
- same seed + anchor id always gives the same contents;
- loot stays inside the allowed low-value set and bounded quantities;
- an empty result is representable;
- `sideTreasure`/`finalTreasure` helper behavior and adventure content-policy tests stay green;
- no duplicate `crate` presentation anchor remains in `createCaveAdventurePropsGroup()`.

Manual browser verification by the User:

- enter an Adventure cave containing wagon/crates;
- each visible crate intended as storage can be targeted/opened through the normal container interaction;
- crates can be empty or contain small plausible supplies such as rope/torch/basic food;
- taking items persists across save/load/re-entry;
- the two real treasure chests still have clearly richer loot and quest-reserved cave profiles still behave normally;
- there is no overlapping decorative crate plus functional chest at one anchor.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
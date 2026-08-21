# Plan 175 — Implementation notes

**Created:** 2026-08-21  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~106~~

## Review summary

Plan 175 is compatible with the current architecture, but the plan is slightly behind the actual codebase in two important places:

1. Cooking already supports **five additional meat kinds** (`deer_meat`, `wolf_meat`, `boar_meat`, `rabbit_meat`, `beef`) in addition to `raw_meat`; do not implement capacity only for `raw_meat`.
2. Player-built fires are currently represented by `PlacedFires` with `PlacedFireKind = 'simple' | 'pit'`, while settlement fires use the shared `VillageFire` state machine. The grate should therefore be an **optional capability/state of a fire instance**, not a new global `GrateManager` and not a hard-coded `firepit` type check.

Plan 106 is already implemented in the codebase. Its cooking mechanism is intentionally a flat recipe lookup, not a crafting system: `src/items/campfireCooking.ts` defines `CookingRecipe { input, output, count }`, `COOKING_RECIPES`, and `findCookingRecipe(inventory)`. The existing player interaction is `[R]` on a lit campfire and cooking currently consumes one input and produces one output. fileciteturn16file0L2-L2

The existing item system is also centralized: `ItemKind` lives in `src/items/items.ts`, while gameplay-facing item metadata lives in `src/items/itemCatalog.ts`. `iron` already exists as a normal resource item, so **do not introduce an `iron` resource abstraction** merely to support rods. A new `iron_rod` item should follow the same two-source item definition pattern. fileciteturn6file0L2-L2 fileciteturn5file0L2-L2

## Existing systems to reuse

### Cooking

Use `src/items/campfireCooking.ts` as the single source of truth for cooking recipes and input/output mapping. Extend the existing recipe lookup to work with a requested quantity/capacity rather than creating `raw_meat_x2`, `raw_meat_x4`, or separate recipes for every batch size.

Recommended shape:

- keep one recipe per input kind;
- derive the maximum batch from station capability;
- consume `N` units of the selected recipe input;
- grant `N` units of the recipe output;
- clamp `N` by inventory availability.

Do not encode pan/grate as recipe rows. They are **equipment/capability**, not recipes.

The current recipe table already proves why this matters: all species-specific meat kinds map to the common `roasted_meat` output. fileciteturn4file0L2-L2

### Interaction

`src/app/interactables.ts` currently owns the campfire prompt. The plan-106 prompt is static: `[E] Dołóż gałąź · [R] Upiecz mięso`. The interaction layer intentionally does not inspect inventory for the prompt; `gameLoop.ts` validates the action and reports errors. Preserve that convention rather than adding per-frame inventory-dependent prompt logic. fileciteturn7file0L2-L2

However, the prompt may now need to communicate the available capacity, e.g. `Upiecz mięso (4)` if that fits the established UX. Do not make the prompt itself the source of truth; the action must re-resolve capability and inventory at execution time.

### Fires

`src/settlement/PlacedFires.ts` is the authoritative player-built fire collection. It currently has two fire kinds (`simple`, `pit`), persists position/kind, creates a shared `VillageFire`, and exposes live entries through `list()`. Player fires are explicitly distinguished from habitat-burn fires by `isPlayerPlacedFire()`. fileciteturn10file0L2-L2

The grate should be attached to the **individual fire record**, not inferred from its type. The persisted state should therefore become conceptually:

`PlacedFire { id, x, z, kind, grate: boolean }`

or an equivalent optional capability field. Avoid a separate registry keyed by fire id. The fire owns whether it has the upgrade.

If settlement campfires are also intended to support grates, use the same capability contract on the settlement-fire representation rather than checking `PlacedFireKind`. The plan explicitly says not to merge `firepit` and `campfire`, so preserve the distinction.

### Building / persistence pattern

The existing player-well implementation is a useful reference for persistent world construction: it keeps a small pure domain record (`PlayerWellRecord`), derives visuals/runtime state from that record, and charges material costs when a stage starts. It also evaluates world-time progress lazily instead of maintaining a per-frame construction timer. fileciteturn18file0L2-L2

For a grate, no multi-day construction stage is required unless the implementation deliberately chooses to make it a busy-channel action. The important part is the same ownership rule: **persistent state says whether the upgrade exists; visuals and interaction are derived from it**.

Do not make the grate a generic placed object that merely happens to be near a fire. Its identity belongs to the fire it upgrades.

## Recommended architecture

Introduce a small, data-oriented cooking capability instead of another manager. For example:

```text
CookingStationCapability
  cookingCapacity: 1 | 2 | 4
  supportsGrate: boolean
  hasGrate: boolean
```

The exact type/name can be simpler. The important rule is that cooking asks the station for a capability and does not know whether the station is `firepit`, `campfire`, or a player `pit`.

Resolve capacity in this order:

```text
base fire capacity = 1
if pan is available to the cook → max 2
if this fire has grate → max 4
```

Do **not** add the values. The grate wins over the pan.

Prefer a pure resolver such as:

```text
resolveCookingCapacity({ station, inventory }) → 1 | 2 | 4
```

This keeps the rule testable and prevents `gameLoop.ts` from becoming another source of cooking rules.

## Pan

The plan says the pan is a normal inventory item, but the current `ItemKind` union shown in `src/items/items.ts` does **not** contain a pan. Add `pan` through the normal item pipeline:

- `ItemKind` in `src/items/items.ts`;
- `ITEM_DEFS` entry: label/categories/weight/size/color;
- `ITEM_CATALOG` entry: holdability/spawn/model metadata as appropriate;
- acquisition only if an existing mechanism can provide it; do not invent a new crafting/metalworking system just to make the pan obtainable.

A pan does not need to occupy the `HeldTool` slot merely to affect cooking. Treat it as an inventory capability, as the plan explicitly describes it as an inventory item rather than a station.

If a pan model is unavailable, follow the existing asset policy instead of blocking the gameplay implementation on an asset. The runtime item should still be a normal inventory item.

## Iron rod

`iron` already exists as a resource item. `iron_rod` should be a separate `ItemKind` representing a processed material/product, not a new resource category and not an integer material counter.

At minimum update:

- `src/items/items.ts` — union + `ITEM_DEFS`;
- `src/items/itemCatalog.ts` — catalog entry;
- `docs/items/CATALOG.md` if the catalog is maintained manually;
- item model registration only if a real model exists.

The plan intentionally does not include metallurgy. Therefore **do not add an `iron → iron_rod` production chain** unless an already-existing production/crafting mechanism can express it without introducing a new system. If no such production path exists, leave `iron_rod` obtainable only through an existing/explicitly appropriate source or mark production as a future dependency. Do not fake an iron-smelting system inside plan 175.

This distinction is important: `iron_rod` being a valid inventory/material item is in scope; inventing a new way to manufacture it is not.

## Grate construction

Use the existing world-interaction/building conventions. A grate is a one-time upgrade to an existing compatible fire.

Recommended domain flow:

```text
player targets fire
→ resolve fire capability
→ if already has grate: no construction / no material consumption
→ validate material inventory
→ start construction/busy action if appropriate
→ consume materials exactly once
→ set fire.grate = true
→ create/attach grate visual
```

The final mutation should be atomic from the player's perspective: do not consume materials before a construction action has successfully started/committed unless that is already the convention of the existing building system.

The critical invariant is:

```text
hasGrate === true ⇒ construction is no longer available
```

The interaction must check the persisted/live fire state rather than relying on whether a mesh currently exists.

Do not create `GrateManager`, `CookingManager`, or a generic construction manager for this feature.

## Material costs

The plan deliberately leaves quantities open. Pick values using existing resource/economy balance, especially current branch/stone availability and the existing `iron` resource. Avoid introducing a new material type.

The implementation should centralize the chosen cost in one constant/type, e.g.:

```text
GRATE_COST = { branch: N, stone: N, iron_rod: N }
```

Do not duplicate the numbers between prompt, validation, consumption, tests and UI.

## Visual implementation

The grate should be a child of the fire's visual group or otherwise be owned by the fire entry. This makes it naturally follow fire lifecycle/disposal and avoids orphaned meshes.

For player-built fires, `PlacedFires` already creates the fire mesh and registers it with the point-light budget. The grate should not independently register lights. It is geometry attached to an existing light source. fileciteturn10file0L2-L2

If the fire despawns, its grate must be disposed with it. If a saved fire is restored with `grate: true`, the grate visual must be reconstructed automatically.

Check `docs/assets/MODELS.md` before choosing or adding assets. If there is no suitable grate/pan/rod asset, follow the project's existing placeholder/fallback policy rather than adding a large asset abstraction.

## Save / rebuild implications

Because player-built fires are persisted world objects, `grate` must survive:

- save → load;
- `rebuildWorldBundle()` / world reconstruction;
- normal fire mesh recreation.

Do not persist a Three.js object, cooking capacity, or derived capability. Persist only the minimal fact that the fire has the grate. Capacity should be derived from `grate` at runtime.

Review the current `SaveData` fire serialization before implementation; the exact save version and field location should be changed there rather than creating a second persistence path.

Settlement-owned fires are different: do not accidentally add player-save fields to static settlement definitions unless settlement grates are explicitly brought into scope.

## NPC integration

NPC cooking already needs to remain on the same station/cooking mechanism if it exists. Do not create an NPC-specific recipe/capacity path.

The ideal boundary is:

```text
NPC/player cooking actor
    ↓
resolve cooking station capability
    ↓
resolve batch size
    ↓
existing cooking recipe
```

The NPC does not need to own a pan if the existing NPC cooking flow can use a station capability. If NPC inventory/equipment is already consulted for cooking, reuse it; otherwise do not invent NPC pan ownership just for plan 175.

The plan explicitly says NPCs should not automatically build grates, so construction remains player-driven.

## Important edge cases

- Cooking must require the fire to be lit, preserving plan 106 behaviour.
- Batch size must be clamped by available input quantity.
- Capacity must never exceed 4.
- Pan + grate must resolve to 4, never 6.
- A grate on one fire must not affect another fire.
- A saved grate must not be lost after world rebuild.
- Repeating the grate interaction must not consume materials again.
- If construction is cancelled/fails, materials must follow the existing busy-channel/building convention; avoid partial consumption.
- Existing meat variants must continue cooking to `roasted_meat`, not only `raw_meat`. fileciteturn4file0L2-L2
- Cooking should remain a processing action, not become a general crafting UI.
- Drying/preservation from plan 159 must remain untouched. Plan 106 already includes the separate food/freshness infrastructure; plan 175 should not duplicate it. fileciteturn16file0L2-L2
- Do not make `iron_rod` automatically available just because `iron` exists.
- Do not infer grate ownership from proximity to a fire mesh; use the fire's persistent identity.

## Suggested implementation order

1. Re-read current `PlacedFires` save/restore wiring and locate the exact `SaveData` representation.
2. Add `pan` and `iron_rod` to the existing item definitions/catalog, without inventing acquisition systems.
3. Add a small pure cooking-capability resolver and tests for `1 / 2 / 4` capacity and priority.
4. Extend `campfireCooking.ts` to process a batch while preserving the existing recipe table.
5. Add `grate` state to the fire record and restore/rebuild path.
6. Add grate construction to the existing fire interaction/build action, with centralized material cost and one-time guard.
7. Attach/recreate the grate visual as part of the fire visual lifecycle.
8. Update NPC cooking only if the existing NPC path actually bypasses the shared cooking logic; otherwise no special NPC changes are needed.
9. Update item/model documentation only for assets that actually exist.

## Files most likely to change

Expected, not guaranteed:

- `src/items/items.ts`
- `src/items/itemCatalog.ts`
- `src/items/campfireCooking.ts`
- `src/app/interactables.ts`
- `src/app/gameLoop.ts` and/or the relevant action module
- `src/settlement/PlacedFires.ts`
- save-state module / `SaveData` definition
- existing fire visual/props module
- tests around cooking, inventory and fire persistence
- `docs/items/CATALOG.md`
- `docs/assets/MODELS.md` only if asset status changes

Do not touch unrelated settlement/fire architecture.

## Verification guidance

### Technical

Run the repository-standard checks from `CLAUDE.md` and use the exact package-manager commands currently configured by the repository. The plan's generic `pnpm` commands should not be blindly copied if the current package configuration uses another command convention.

At minimum cover:

- typecheck;
- lint;
- build;
- tests;
- focused cooking/fire persistence tests.

### Browser/manual

Verify the actual runtime because grate visuals and interaction ownership cannot be established by TypeScript alone:

1. normal lit fire cooks one unit;
2. pan raises capacity to two;
3. grate raises capacity to four;
4. pan + grate remains four;
5. batch cooking consumes/produces matching quantities;
6. all currently supported meat input kinds still cook;
7. grate construction consumes the selected materials exactly once;
8. a second construction attempt consumes nothing;
9. grate is visible on the correct fire;
10. grate remains attached after save/load and world rebuild;
11. another fire remains unaffected;
12. unlit fire cannot cook;
13. existing drying/preservation behaviour remains unchanged.

Keep implementation status separate from technical verification and browser/manual verification, as required by the plan.

**Zrób git commit i push do main, rebase jeżeli trzeba**

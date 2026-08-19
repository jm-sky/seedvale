# Plan 169 — implementation notes

**Date:** 2026-08-19  
**Plan:** [2026-08-19--169--house-interior-furniture-and-bed-anchors.md](./2026-08-19--169--house-interior-furniture-and-bed-anchors.md)  
**Depends on:** `168` — Settlement Lodging and Sleep; `111` — House Construction

## Review verdict

Plan 169 is well scoped and follows the existing Seedvale architecture. The most important implementation constraint is already correct: furniture must extend the existing `HouseDefinition` / `HouseAssembly` pipeline and must not introduce a second furniture-placement system.

The main point to make explicit for the implementation agent is that `HouseDefinition` is already a data-only contract and `HouseAssembly` already separates static and interactive content and exposes `interactionPoints`. The implementation should extend those mechanisms rather than add an `InteriorBuilder`, furniture manager, or another asset registry.

The dependency on plan 168 is contractual rather than visual: plan 168 owns lodging selection, movement-to-place and Sleep. Plan 169 only makes a physical bed available as a lodging source. The bed should therefore register or expose the data needed by the existing lodging resolver; it must not start sleep itself.

## Current codebase facts

### House Builder

`src/settlement/houseBuilder.ts` already provides the correct assembly layer:

- resolves assets through `ConstructionCatalog`;
- loads/reuses GLB templates through the existing asset loading path;
- keeps static and interactive content separate;
- batches repeated static furniture candidates through `InstancedMesh`;
- returns `HouseAssembly.interactionPoints`;
- keeps settlement ownership outside the builder.

`HouseAssembly` already has:

```ts
interactionPoints: HouseInteractionPoint[]
```

and `HouseDefinition` already has:

```ts
interactionPoints?: readonly HouseInteractionPoint[]
decorations?: readonly HouseDecoration[]
```

This is the natural extension point for furniture. Do not add a second list such as `furniture[]` consumed by a separate runtime builder unless the existing data shape genuinely cannot express the required transform/relationship. Prefer extending the existing data contract with a reusable furniture/attachment representation if necessary.

### Existing definition shape

`src/assets/houseDefinitionExample.ts` currently describes:

- footprint;
- floor;
- wall placements;
- corners;
- openings;
- roof parts;
- decorations;
- interaction points;
- existing house lamp metadata.

Village houses are already generated from this definition and are scaled uniformly by `HOUSE_ASSEMBLY_SCALE = 1.1` in the assembly path. Furniture transforms must therefore be expressed in the same house-local coordinate space as the rest of the definition. Do not author world-space coordinates.

### ConstructionCatalog / MegaKit

Plan 111 established `ConstructionCatalog` as the asset source for the House Builder. Do not bypass it with direct paths, a new furniture catalog, or ad-hoc GLB loading.

The existing MegaKit verification also established that asset names do not necessarily describe physical dimensions. In particular, the roof-cap naming was shown not to represent the 2 m house grid. The same rule applies to furniture: use measured browser/catalog data, not filenames or visual guesses.

### Asset Alignment Browser and anchors

The existing Asset Alignment Browser is the authoritative authoring aid for asset dimensions, prepared transforms, pivots and anchors. `docs/assets/ANCHORS.md` defines the existing anchor convention:

- `mount` = outward surface normal + world-up;
- `interaction` = optional facing direction + world-up;
- `origin` = asset forward direction when known.

Anchors live in the asset domain and are consumed by gameplay and the browser. Existing house lighting already uses the anchor resolver and has an anchor-first path for house lamp mounting. Reuse that mechanism where an asset has a suitable anchor instead of adding furniture-specific offset logic.

## Recommended data model

Keep furniture as part of `HouseDefinition` assembly data. The exact shape should follow the existing transform conventions, but a useful target is conceptually:

```ts
type HouseFurniturePlacement = {
  assetId: string
  position: HouseVec3
  rotationY?: number
  role?: 'bed' | 'table' | 'lamp' | 'chest'
  parent?: string
  anchor?: string
  interactionPoints?: readonly HouseInteractionPoint[]
}
```

This is guidance, not a requirement to copy this exact type. Before adding a new type, check whether `HouseDecoration`, `HousePartTransform`, existing anchor definitions, and `HouseInteractionPoint` can be extended cleanly.

The important ownership rules are:

1. visual placement belongs to `HouseDefinition`;
2. assembly belongs to `HouseBuilder`;
3. asset identity/dimensions belong to `ConstructionCatalog` + asset metadata;
4. anchors belong to the asset domain;
5. gameplay interaction belongs to the existing interaction/lodging systems;
6. settlement/world code consumes the resulting assembly and registers gameplay places.

Do not put sleep/storage state into the static house definition.

## Furniture placement should reuse House Builder placement

The implementation agent should first inspect how `decorations` are currently instantiated and whether the existing `StaticSpec` / `instantiateStatics()` path can consume furniture directly.

Preferred flow:

```text
HouseDefinition
  → asset ids
  → HouseBuilder
  → prepared/cached GLB templates
  → local transforms
  → static / interactive split
  → HouseAssembly
  → settlement registration
```

For static furniture such as the table, ordinary decoration/static placement is sufficient.

For a bed or chest, the visual model may still be assembled through the same path, while its interaction point is exposed separately. Do not make the entire furniture object interactive merely because it has an interaction point if that increases draw calls or complicates batching unnecessarily.

If the existing builder already distinguishes interactive objects from static objects, use that distinction only where runtime behaviour actually requires it.

## Anchored relationships

### Table → lamp

The table lamp is the clearest case where a relative relationship is preferable to two independent coordinates.

Preferred authoring order:

1. place the table in house-local space;
2. resolve a suitable `mount` anchor on the table if one exists;
3. place the lamp using the existing anchor-resolution/mount convention;
4. only fall back to an explicit local offset if the asset has no usable anchor;
5. keep the lamp transform relative to the table rather than relative to the house walls.

Do not create one hardcoded lamp position per house variant merely because the current lamp has no anchor. If an asset genuinely lacks a suitable anchor, record the explicit local mount offset in the house definition so the relationship remains data-driven.

If adding an anchor to an asset is the correct long-term fix, prefer authoring the asset anchor and validating it in the Asset Alignment Browser over compensating for the missing anchor in runtime code.

### Bed → sleep point

The bed should provide the physical basis for the lodging contract from plan 168.

Do not introduce a new `SleepInteraction` class or a bed-specific movement system.

The recommended separation is:

```text
bed visual placement
    ↓
HouseAssembly
    ↓
bed interaction / approach / facing data
    ↓
plan 168 lodging-place adapter/registration
    ↓
existing lodging resolver
    ↓
existing movement
    ↓
existing Sleep
```

The bed definition should contain enough local data to derive:

- a stable bed identity;
- the interaction/approach position;
- facing/yaw for the sleeping pose;
- sleep quality = `high`.

The exact `id` should be stable and derived from the owning house/bed placement rather than generated from object identity or frame order.

Plan 168 explicitly owns the common lodging contract, so if its implementation introduces a `LodgingPlace`-style type, Plan 169 should adapt the house/bed data to that contract instead of defining another bed-place contract.

### Chest → future storage point

The chest should be prepared similarly, but without implementing storage in Plan 169.

Expose a stable interaction point and enough identity/ownership information for the later storage system to consume. If plan 156/164 already defines the expected container interaction contract, reuse that contract directly when possible.

Do not create a chest inventory, container manager, storage resolver, or persistence state here.

## Interaction kind compatibility

The current `HouseInteractionKind` in `houseDefinitionExample.ts` is a small house-level set (`door`, `entrance`, `work`, `storage`). Plan 169 should not blindly add a second interaction enum just for furniture.

Before changing it, check the actual consumer of `HouseInteractionPoint`.

For the bed, prefer the common interaction/lodging contract from plan 168 if it is already implemented by then. If a house-level interaction point must remain generic, add the smallest compatible extension and make the conversion to lodging happen at the settlement/gameplay boundary.

The important rule is that `HouseBuilder` should expose a location and transform; it should not own the gameplay meaning of sleep.

## Asset discovery workflow

Before authoring the first house, use the existing Asset Alignment Browser for the four requested asset classes:

- bed;
- table;
- table lamp;
- chest.

For each selected asset record at least:

| Property | Why it matters |
|---|---|
| native dimensions | validates real-world scale |
| prepared dimensions | validates runtime asset space |
| origin/pivot | determines whether direct placement is safe |
| floor contact | prevents floating/sinking |
| +Z orientation | determines facing and interaction direction |
| bounding box | validates wall/footprint clearance |
| anchors | enables mount/interaction placement |

Use the browser's actual report rather than inferring values from the GLB filename.

If the selected furniture has a bad origin, first determine whether the existing asset preparation/anchor pipeline can correct it. Do not scatter compensating offsets across house definitions and runtime code.

## Scale and coordinate-space warning

The house is assembled in local metres and then receives the existing assembly scale. Furniture coordinates must follow the same convention.

Do not mix:

- native GLB units;
- prepared asset-local metres;
- house-local metres;
- settlement world coordinates.

A common failure mode would be to measure a prepared model in the browser and then apply a world-space correction after the house has already received `HOUSE_ASSEMBLY_SCALE`. Keep the transform in the same space as the existing house definition and let the established assembly transform do the final conversion.

## First-house authoring

Use one small, visually representative village house first. Do not author all variants immediately.

Suggested sequence:

1. choose one existing village `HouseDefinition` that is known to be structurally valid;
2. confirm its current House Builder assembly visually;
3. select the four furniture assets in Asset Alignment Browser;
4. author bed/table/chest transforms in house-local metres;
5. mount the lamp relative to the table;
6. add bed approach/facing data;
7. add chest interaction data without storage implementation;
8. build the house;
9. verify the interior in browser;
10. only then copy/revise placement for other footprints.

This is especially important because Plan 111 implementation notes explicitly record that some house variants still had visual assembly problems. Do not use an already-broken house variant as the furniture-placement baseline.

## Placement constraints

For each furniture item validate:

- floor contact;
- wall clearance;
- door/entrance clearance;
- enough free space for the interaction point;
- correct yaw;
- no overlap with other furniture;
- no accidental placement outside the house footprint.

Do not introduce a general collision/packing solver. The number of required furniture items is small and the plan explicitly excludes an automatic furniture solver.

Use explicit local transforms for each house variant when geometry differs. Shared placement rules are appropriate only where the same footprint and orientation make the rule actually correct.

## Lighting integration

The current house lighting path already has asset-anchor support and a wall/floor lamp placement mechanism. Reuse it.

Do not create a second interior-light manager.

For a table lamp, determine whether the requested visual lamp is:

1. only a static furniture mesh while existing house lighting supplies illumination; or
2. an actual light source that can be integrated into `houseLighting`.

Prefer the smallest integration that satisfies the plan. If a real point light is required, follow the existing house-light lifecycle and visibility conventions. Avoid one always-visible PointLight per furniture mesh; the existing house lighting code already contains explicit handling to keep inactive lights from consuming WebGL light slots.

## Performance / batching

The existing builder already has the right optimization direction:

- shared GLB templates;
- static instancing;
- separate interactive objects.

Furniture should use this path.

Recommended classification:

- table: static;
- lamp mesh: static unless it has independent runtime animation/state;
- chest: static visual + interaction point;
- bed: static visual + lodging interaction point.

Do not turn every piece into an individual `Object3D` merely because it has gameplay metadata.

If the existing static batch can instance repeated furniture across houses, keep that behaviour. Do not introduce a settlement-wide furniture manager solely to batch these four assets.

## Streaming / lifecycle

`HouseAssembly.dispose()` and the existing GLB template/cache ownership remain authoritative.

Furniture must not:

- load the same GLB through a separate loader;
- retain references after house disposal;
- create independent caches;
- leave point lights, interaction objects or anchor helpers attached after the house is unloaded.

Interaction registration should have a clear owner and cleanup path tied to the house/settlement lifecycle. Prefer the existing settlement registration/disposal mechanisms rather than adding a furniture-specific manager.

## Plan 168 integration boundary

Plan 168 should be treated as the consumer contract.

Plan 169 supplies:

```text
house → bed → physical interaction/approach/facing data → high-quality lodging source
```

Plan 169 does **not** supply:

```text
lodging resolver
movement to bed
sleep state machine
sleep regeneration
payment/friend/hay selection
```

The bed registration should happen at the same boundary where the settlement currently turns house/landmark data into gameplay places. Avoid making `HouseBuilder` aware of player sleep, `PlayerController`, or the lodging UI.

If plan 168 has not yet landed when Plan 169 implementation starts, the agent should not invent a temporary sleep system. It should either implement the shared physical data needed by the plan 168 contract or wait at the integration point until that contract exists.

## Review findings / changes to plan interpretation

The plan itself should remain unchanged. These notes clarify how to execute it:

1. **Do not create `InteriorBuilder`.** Extend `HouseDefinition` and `HouseBuilder`.
2. **Do not create `FurnitureManager`.** Reuse house assembly and settlement ownership.
3. **Do not create `FurniturePlacement`.** Reuse existing house-local transform/placement and anchor resolution.
4. **Do not create `BedSleepInteraction`.** Adapt the bed to plan 168's common lodging contract.
5. **Do not create a second asset registry.** Use `ConstructionCatalog` and the existing GLB cache.
6. **Do not infer furniture scale from filenames.** Validate it in Asset Alignment Browser.
7. **Do not compensate bad pivots in multiple consumers.** Fix the asset/anchor/preparation layer where appropriate.
8. **Do not make the lamp an independent wall-relative placement.** Prefer table-relative mounting/anchor data.
9. **Do not add storage implementation for the chest.** Expose the future interaction point only.
10. **Do not add a generic furniture solver.** Author explicit local transforms where necessary.

## Suggested implementation checkpoints

### Checkpoint A — asset truth

- [ ] Four candidate assets identified through Asset Alignment Browser.
- [ ] Native/prepared dimensions recorded.
- [ ] Pivot/origin and floor contact confirmed.
- [ ] +Z orientation confirmed.
- [ ] Existing anchors checked.
- [ ] Any missing/bad anchor documented before runtime work.

### Checkpoint B — House Builder extension

- [ ] Existing `HouseDefinition` / `HouseAssembly` remains the only house placement pipeline.
- [ ] Furniture asset ids are resolved through `ConstructionCatalog`.
- [ ] Furniture uses house-local transforms.
- [ ] Static furniture follows existing static batching.
- [ ] Interactive metadata is exposed without turning all furniture into separate render objects.

### Checkpoint C — relationships

- [ ] Lamp placement is derived from table-relative data/anchor where available.
- [ ] Bed interaction point is derived from bed placement.
- [ ] Bed facing direction is explicit and deterministic.
- [ ] Chest interaction point is exposed for future storage.

### Checkpoint D — plan 168 integration

- [ ] Bed can be converted to the common lodging-place contract.
- [ ] Stable bed id exists.
- [ ] Position and approach point are in the correct world/house space after assembly.
- [ ] Facing direction is correct.
- [ ] Quality is `high`.
- [ ] House Builder does not call Sleep.

### Checkpoint E — lifecycle and verification

- [ ] House unload removes furniture and interaction registrations.
- [ ] Shared GLB templates are not duplicated.
- [ ] No unexpected draw-call increase from furniture.
- [ ] First house is visually verified in browser.
- [ ] Bed approach point is reachable.
- [ ] Existing lodging flow can find the bed.
- [ ] Build/tests/lint pass according to `CLAUDE.md`.

## Files worth inspecting first

- `src/settlement/houseBuilder.ts`
- `src/assets/houseDefinitionExample.ts`
- `src/assets/constructionCatalog.ts`
- `src/assets/anchorResolve.ts`
- `src/assets/assetAnchorData.ts`
- `src/assets/assetAnchors.ts`
- `src/settlement/houseLighting.ts`
- `src/tools/assetBrowser/`
- `docs/assets/ANCHORS.md`
- `docs/plans/2026-08-19--168--settlement-lodging-and-sleep.md`
- `docs/plans/2026-08-14--111--house-construction.md`
- `docs/plans/2026-08-14--111--house-construction-implementation-notes.md`
- `docs/reviews/2026-08-14--011--megakit-construction-browser-verification.md`

## Important existing House Builder facts

The current builder already contains several patterns that should be copied conceptually rather than reimplemented:

- `houseDefinitionAssetIds()` collects catalog asset ids from a definition;
- `loadHousePartTemplates()` resolves them through `ConstructionCatalog` and `loadGltf`;
- `instantiateStatics()` groups repeated asset placements and creates `InstancedMesh` buckets;
- `HouseAssembly` exposes both static/interactive groups and interaction points;
- known MegaKit offsets are kept in one builder-level place (`fillOffsetFor`) instead of scattered through house definitions.

Furniture should follow the same discipline. If a furniture asset needs a verified non-identity offset, keep that knowledge at the smallest appropriate asset/authoring layer and document why it exists.

## Final recommendation

The plan is ready to implement, with one architectural emphasis: **Plan 169 is an extension of the existing House Builder, not the beginning of a furniture system.** The House Builder should assemble furniture and expose its physical interaction data; settlement/gameplay systems should interpret that data. Plan 168 remains the owner of lodging selection and Sleep.

The first implementation target should be one verified house with bed + table + table lamp + chest. Only after that visual and gameplay boundary is correct should the placement data be expanded to other house variants.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

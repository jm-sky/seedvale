# Implementation notes: world-terrain-037 functional adventure cave crates

**Reviewed:** 2026-09-16  
**Plan:** `docs/plans/world-terrain-037-functional-adventure-cave-crates.md`

## Recon findings

### Current crate ownership

`src/world/caves/caveContentAnchors.ts::resolveAdventureCaveContentAnchors()` already resolves the relevant positions deterministically. Around the deep-chamber wagon it tries bounded `crateCandidatesAround(...)` placements and emits at most two anchors with ids from `caveContentAnchorId(caveId, 'crate', ordinal)`. Their Y comes from the retained cave heightfield, so no new placement logic is needed.

`src/world/caves/caveAdventureProps.ts` then treats `crate` as one of `CAVE_PRESENTATION_PROP_ROLES`. `presentationAnchorsFromContent()` includes it, and `createCaveAdventurePropsGroup()` clones the preloaded `/models/settlement/crate.glb` template (fallback `createCrate(1)`). This path explicitly owns presentation only: no inventory, interaction, persistence or collision.

Therefore the bug is not missing anchors; it is split semantics at materialization time.

### Existing functional-container seam

`src/world/worldGeneratedContainers.ts` already provides everything needed for gameplay ownership:

- `WorldGeneratedContainerSpec` supports stable `id`, `kind`, `initialCounts`, exact underground `y`, and `WorldSpatialContext`;
- when `y` exists it bypasses surface `placeOnGround` and uses the cave-authored position exactly;
- fresh contents are an ordinary `Inventory`;
- saved snapshots override initial contents, so withdrawn loot stays withdrawn after save/load;
- interaction/transfer code consumes `worldGeneratedContainers.list()` rather than requiring a cave-specific action path.

Do not duplicate this state.

### Existing cave treasure composition

`src/app/worldBundle.ts::caveTreasureContainerSpecs()` is the closest existing pattern. It maps cave anchors to `WorldGeneratedContainerSpec`, preserves x/y/z/yaw, sets `spatialContext: { kind: 'cave', caveId }`, and uses deterministic initial loot. It intentionally only materializes `sideTreasure` / `finalTreasure` when `CaveAdventureContentPolicy.profileOf(caveId) === 'DOUBLE_TREASURE'`.

The new ordinary crate path should be a peer to this helper, not folded into treasure policy. Crates are environmental supplies and should exist for Adventure caves regardless of `EMPTY`, `QUEST_TREASURE` or `DOUBLE_TREASURE` treasure reservation.

`worldGeneratedSpecs` already spreads `caveTreasureContainerSpecs(...)` before constructing `createWorldGeneratedContainers()`. Append the crate specs to this same array; do not instantiate another container owner.

### Presentation duplication hazard

If a `crate` anchor becomes a `WorldGeneratedContainerSpec` but remains in `CAVE_PRESENTATION_PROP_ROLES`, both systems will render at the same coordinates. Remove `crate` from the presentation-only cave-prop filtering/materialization once the functional container owns that anchor.

The current cave crate presentation uses a GLB while `createWorldGeneratedContainers()` always calls `createPlacedContainerProp()` and therefore renders the procedural chest visual regardless of spec `kind`. This is the only design detail that may require a small presentation seam.

Preferred implementation:

- add an optional presentation discriminator to `WorldGeneratedContainerSpec` (for example `visual?: 'chest' | 'crate'`, defaulting to current chest behavior);
- make `createWorldGeneratedContainers()` choose a prop factory from that discriminator while keeping `ContainerKind`, inventory capacity and interaction semantics unchanged;
- keep this discriminator out of save data because the stable world spec recreates the visual and save state owns contents only;
- reuse the existing crate presentation asset/fallback without introducing a new gameplay `ContainerKind` merely for appearance.

If reusing the async-preloaded cave crate GLB from the synchronous world-generated-container constructor would create an awkward cross-module dependency, prefer a small shared crate-prop factory/template seam over importing `caveAdventureProps` into `worldGeneratedContainers`. Avoid making the generic world container owner depend on cave presentation internals.

### Loot

`src/items/treasureGameplay.ts::generateTreasureLoot()` is a useful deterministic RNG precedent but its profiles are intentionally treasure-rich. Do not add the ordinary crate table to `TreasureLootProfile`; these crates are not treasure sites.

Use a small pure resolver keyed by `(worldSeed, anchor.id)`. The result type can remain `Partial<Record<ItemKind, number>>`, which drops directly into `WorldGeneratedContainerSpec.initialCounts`.

Known existing ordinary candidate kinds include `rope`, `torch`, `bread`, `branch`, `hide` and `blanket`; verify current catalog price/size/semantics before fixing the final table. Keep the table deliberately cheap. Recommended invariant shape:

- 20–35% empty;
- otherwise one primary low-value item, occasionally a second;
- stack sizes typically 1–2, only cheap consumable/material kinds may exceed that;
- never coin/gold/gemstones, keys/maps, unique items, high-tier tools/weapons or quest-instance items.

No respawn mechanism is needed or wanted: initial loot is only used when no saved container snapshot exists.

## Files likely to change

- `src/app/worldBundle.ts` — pure crate-spec helper + append specs to `worldGeneratedSpecs`.
- `src/world/caves/caveAdventureProps.ts` — stop presentation-only rendering/preloading of crate anchors after ownership moves.
- `src/world/worldGeneratedContainers.ts` — only if needed for a presentation discriminator/prop factory; do not change persistence ownership.
- `src/world/containerProp.ts` or a small shared prop module — only if needed to render functional containers as crates cleanly.
- focused tests near `src/app/worldBundle.caveTreasure.test.ts` or a new cave-container test file.

No topology, heightfield, cave streaming, quest policy or persistence schema migration should be necessary.

## Tests worth adding

1. Two identical `(seed, crate anchor)` inputs return identical contents.
2. Different stable crate ids can vary without runtime randomness.
3. Generated contents contain only the allow-listed cheap kinds and bounded quantities.
4. At least one known deterministic test seed/id exercises the empty outcome.
5. `crate` anchor mapping preserves exact `id/x/y/z/yaw` and cave spatial context.
6. Non-`crate` anchors are ignored by the ordinary crate helper.
7. `caveTreasureContainerSpecs()` behavior for `EMPTY`, `QUEST_TREASURE`, and `DOUBLE_TREASURE` remains unchanged.
8. `presentationAnchorsFromContent()` no longer returns `crate` anchors after migration.
9. If a visual discriminator is added, default specs still render the existing chest path while crate specs select only the crate visual path.

## Guardrails

- Do not invent new crate coordinates; use the current anchors.
- Do not turn `crate` into a quest-reservable treasure role.
- Do not persist generated loot separately from `WorldGeneratedContainers`.
- Do not create a cave-specific transfer UI/action.
- Do not convert wagon/support/lantern props as part of this plan.
- Do not broaden this into a global barrel/crate/sack container taxonomy.
- Keep helpers pure where possible and add `@domain world-terrain` JSDoc to important exported/preflight-relevant functions.
- Browser verification belongs to the User, not the implementation agent.
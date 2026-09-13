# Plan: Archetype-aware cave story and loot anchors

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~world-terrain-020~~, ~~world-terrain-024~~, ~~world-terrain-025~~
**Domain:** `world-terrain`
**Subdomains:** `terrain` `landmarks`
**Tags:** `caves` `content-anchors` `loot` `quests`
**Roadmap:** -

## Goal

Extend the existing cave-owned semantic placement contract so `natural` and `dungeon` caves can host persistent story evidence and loot without quest code inventing underground coordinates.

Current production state:

- `adventure` caves expose deterministic `Caves.contentAnchorsOf(caveId)` placements such as `sideTreasure` and `finalTreasure`;
- `natural` caves currently return no content anchors;
- `dungeon` caves expose stable semantic chambers through `Caves.dungeonChambersOf(caveId)`, but chamber centres are topology semantics, not safe final placement coordinates.

The target contract is:

```text
stable cave identity
+ archetype / semantic topology node
+ retained cave heightfield
→ deterministic, floor-snapped, collision-aware content anchor
→ world/quest content may consume anchor identity
```

This plan is shared infrastructure for cave stories such as:

- natural cave: missing hunter / contraband cache,
- dungeon cave: bandit treasure / lost treasure expedition,
- future non-quest cave loot and environmental storytelling.

Do not add quest knowledge to cave topology or cave generation.

## Existing authority to preserve

Reuse and extend:

- `src/world/caves/caveContentAnchors.ts` — current adventure semantic placement and fit logic;
- `src/world/caves/caveHeightfieldPlacement.ts` — bounded placement candidates and footprint checks;
- `src/world/caves/dungeonChambers.ts` — stable dungeon chamber identity/classification;
- `src/world/caves/productionTopology.ts` — stable natural node ids (`chamber`, optional `branch-chamber`);
- `src/world/createCaves.ts` — public `contentAnchorsOf()` world contract;
- retained `CaveHeightfieldRepresentation` — final floor/clearance authority.

Do not use:

- surface `sampleHeight()` for underground content,
- topology node Y as final floor Y,
- presentation mesh raycasts,
- player/camera state,
- streamed mesh activation,
- quest-owned cached coordinates.

## Shared anchor vocabulary

Keep the current adventure roles and ids backward-compatible. Do not rename or invalidate existing `sideTreasure`, `finalTreasure`, `wagon`, `support`, `crate` or `lantern` anchors.

Add the smallest shared roles required by story content:

```text
storyFind
loot
```

`storyFind` means a safe location for narrative evidence/props such as remains, an abandoned pack or expedition traces.

`loot` means a safe location for a container or compact authored loot source that is not semantically the final treasure.

Existing `sideTreasure` / `finalTreasure` remain stronger semantic roles where the topology provides them.

A role describes content placement semantics, not quest state. Cave code must not know concepts such as `hunter`, `bandit`, `contraband` or `expedition`.

## Source-node identity

Extend `CaveContentAnchor` with stable semantic source information sufficient to distinguish repeated roles in different chambers.

Preferred shape:

```ts
sourceNodeId?: string
```

For new natural/dungeon anchors this should be populated from the stable topology node id.

Anchor identity for repeated roles must derive from:

```text
caveId + role + sourceNodeId
```

rather than topology array index or iteration-order ordinal.

Preserve existing adventure anchor ids where changing them would invalidate current authored bindings/saves. A separate node-keyed id helper is acceptable for new repeated anchors.

## Natural cave anchors

For every accepted `natural` cave, derive anchors only from stable natural topology nodes.

Required V1 set:

- main `chamber`:
  - one `storyFind`,
  - one `loot`;
- optional `branch-chamber` when present:
  - optional `storyFind`,
  - optional `loot`.

The main chamber placements are required for a natural cave to be eligible for authored story binding. Optional branch anchors may be omitted when no safe footprint fits.

Do not alter the natural topology recipe or acceptance rules merely to make content fit. Placement must adapt inside the already accepted cave.

## Dungeon cave anchors

Use `Caves.dungeonChambersOf()` semantics / the equivalent retained topology view. Do not rediscover dungeon chamber meaning from array positions.

Required V1 set:

- every usable non-entrance dungeon chamber:
  - one `storyFind`,
  - one `loot` where a safe placement fits;
- every `side` chamber:
  - one `sideTreasure` where a safe placement fits;
- `final` chamber:
  - one required `finalTreasure`;
- `deep` chamber:
  - ensure at least one usable `loot` anchor so a major non-final stash can exist independently of the final reward.

Entrance-adjacent chambers may expose `storyFind` when safe, but should not receive a required treasure anchor solely to satisfy this plan.

This allows multiple stories to use the same dungeon without fighting for one final point, for example:

```text
bandit caches → side/deep loot anchors
lost expedition traces → storyFind anchors
true expedition treasure → finalTreasure
```

## Placement and overlap rules

Reuse the existing bounded deterministic candidate search and footprint/clearance logic.

Add inter-anchor footprint avoidance for anchors sharing one chamber/node so `storyFind` and `loot` cannot resolve to overlapping placements.

Required properties:

- deterministic for the same world seed + accepted cave topology;
- bounded candidate count;
- floor Y from retained cave heightfield;
- enough clearance for compact world props/containers;
- keep required anchors away from through-lines/doorways where existing helpers support it;
- no overlap with already accepted anchors in the same semantic area;
- optional anchors fail closed rather than forcing invalid placement.

If a required final dungeon treasure placement genuinely cannot be resolved, the cave must be ineligible for authored content requiring it; do not invent coordinates or mutate topology at runtime.

## Public cave contract

Keep `Caves.contentAnchors()` / `contentAnchorsOf(caveId)` as the shared public lookup rather than adding quest-specific cave APIs.

Update comments/types that still describe the contract as adventure-only.

Consumers should be able to filter by:

- `caveId`,
- `role`,
- `sourceNodeId` where relevant.

`Caves.dungeonChambersOf()` remains the chamber/classification authority. Content anchors complement it; they do not replace it.

## Ownership and persistence

Anchors are deterministic derived world data and must not be serialized.

Persist only actual world content placed at them through its owning system, e.g. `WorldGeneratedContainers` contents/removal state.

Do not persist:

- anchor XYZ,
- source node ids as duplicated quest coordinates,
- anchor-generation RNG state,
- dungeon chamber arrays.

After rebuild/load, re-resolve the same anchor identity from the world seed/cave data.

## Performance

Anchor generation happens once per accepted cave during world construction, not per frame.

Keep work bounded per cave. Dungeon anchors may be more numerous than adventure anchors but the number of dungeon chambers is already small and fixed by the dungeon recipe.

Do not introduce mesh raycasts, scene scans or streaming-triggered recomputation.

## Integration targets

Implementation recon should start from:

- `src/world/caves/caveContentAnchors.ts`,
- `src/world/caves/caveHeightfieldPlacement.ts`,
- `src/world/caves/dungeonChambers.ts`,
- `src/world/caves/productionTopology.ts`,
- `src/world/caves/dungeonTopology.ts`,
- `src/world/createCaves.ts`,
- current cave-anchor tests.

Add JSDoc for new/changed public architectural helpers and use `@domain world-terrain` where useful for preflight discovery.

## Verification

Automated verification should cover at least:

- existing adventure anchor ids/roles remain stable;
- natural caves expose required main `storyFind` + `loot` anchors;
- optional natural branch anchors only exist when the branch exists and placement fits;
- dungeon anchors map to stable `sourceNodeId` values and correct chamber classes;
- dungeon final chamber exposes one stable `finalTreasure`;
- side/deep loot anchors are deterministic;
- same-chamber anchors do not overlap footprints;
- underground Y is resolved from the cave heightfield, not surface height or topology Y;
- anchors are independent of presentation streaming and player/camera position;
- no new serialization is required for derived anchor geometry.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
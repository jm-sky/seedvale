# world-terrain-017 — Abandoned mountain mine landmark — implementation notes

**Reviewed:** 2026-09-14  
**Plan:** `docs/plans/world-terrain-017-abandoned-mountain-mine-landmark.md`

## Recon baseline

`world-terrain-019-cave-heightfield-production-migration.md` is done. Cave V2 has a stable production authority and `world-terrain-017` should build on it rather than introducing another cave representation.

Current flow:

```text
pickLargeCaveSites()
→ assignCaveArchetypes()
→ buildProductionCaveTopology()
→ CaveTopology
→ CaveHeightfieldRepresentation
→ terrain cutout / presentation / gameplay queries
→ semantic content anchors / dungeon chamber view
```

Relevant files:

```text
src/world/largeCaves.ts
src/world/createCaves.ts
src/world/caves/caveArchetype.ts
src/world/caves/productionTopology.ts
src/world/caves/caveIdentity.ts
src/world/caves/caveTopology.ts
src/world/caves/caveHeightfieldRepresentation.ts
src/world/caves/caveHeightfieldQuery.ts
src/world/caves/caveHabitat.ts
src/world/caves/caveContentAnchors.ts
src/world/caves/caveAuthoredAnchorClaims.ts
src/world/locations/worldLocationCatalog.ts
src/world/locations/worldLocationTypes.ts
src/world/locations/worldLocationNames.ts
src/terrain/chunkHeightmap.ts
```

## Cave siting is still the main seam

`src/world/largeCaves.ts::pickLargeCaveSites()` remains the production generic siting owner.

Current generic policy still:

- uses deterministic seed salt `0xca7e51`;
- samples the fixed `130..620` home ring;
- targets `10` sites by default;
- bounds attempts per site;
- rejects settlements, nearby caves, coasts and roads;
- requires local slope;
- rejects `sampleMountainRidge(x, z) > 0.55`.

That last rule directly conflicts with the abandoned-mountain-mine requirement.

Do not remove the generic mountain rejection globally and do not reuse `pickLargeCaveSites()` unchanged as the mine search algorithm. Factor/reuse only the safety validation that is genuinely shared, then add a deterministic bounded mountain-site query in the same worldgen/cave domain.

## Production cave authority

`CaveTopology` is the structural contract and `CaveHeightfieldRepresentation` is the production spatial authority. Presentation is streamed, but topology/heightfield runtime data remains available independently of presentation activation.

`CaveVolume` is not a production gameplay/spatial authority. `topologyToCaveDefinition()` remains only a compatibility view for consumers that still need definition/bounds data.

Useful existing `Caves` APIs include:

```text
archetypeOf(caveId)
contentAnchorsOf(caveId)
dungeonChambersOf(caveId)
resolveHabitat(caveId, entityHeight)
queryGroundIn(caveId, x, y, z)
resolveHorizontalIn(caveId, ...)
```

Prefer topology data for structural-capacity checks and retained heightfield queries only when final spatial validation needs them. Do not add mesh scans or duplicate containment logic.

## Stable cave identity

`buildProductionCaveTopology()` derives stable identity through `makeCaveId(seed, site)` before recipe-specific structural RNG.

Preserve:

```text
site + world seed
→ stable caveId
→ topology
```

For the landmark keep:

```text
mineId != caveId
mine landmark → caveId
```

`mineId` should derive from world seed plus a stable semantic mine slot/salt, not from cave array position, presentation lifetime or by simply prefixing the selected `caveId`.

## Archetypes changed since the previous recon

Current production cave archetypes are:

```text
natural
adventure
dungeon
```

`src/world/caves/caveArchetype.ts::assignCaveArchetypes()` currently:

1. tries existing sites for one guaranteed accepted home `adventure` cave;
2. reserves that cave, then tries remaining sites for one guaranteed accepted `dungeon`;
3. evaluates independent dungeon/adventure rolls for remaining sites;
4. falls back to `natural` when richer recipes reject.

This is a critical regression boundary for 017.

### Mine eligibility decision

For V1:

```text
natural | adventure → eligible when spatially suitable and not occupied by incompatible authored world content

dungeon → excluded
```

Do not introduce `mine` as a `CaveArchetype`.

Excluding `dungeon` is intentional: dungeon already has guaranteed assignment, chamber semantics, resident/content consumers and authored-anchor use. The abandoned mine is a semantic world landmark, not another dungeon recipe.

## Do not perturb archetype assignment

The previous notes warned only about perturbing guaranteed adventure assignment. The current code also has a guaranteed dungeon and independent per-cave archetype rolls.

Do not simply prepend/insert a mountain mine site into the ordinary generic site array before `assignCaveArchetypes()`. That could change:

- which cave becomes guaranteed adventure;
- which cave becomes guaranteed dungeon;
- which candidates are reserved from later assignment;
- final archetype outcomes for otherwise unchanged generic sites.

Preferred integration boundary:

```text
generic sites
→ unchanged assignCaveArchetypes()

landmark-required mountain site, only if needed
→ dedicated shared siting validation
→ explicit natural/adventure topology attempt
→ merge accepted result into normal Cave V2 runtime lifecycle
```

An equivalent extension of `assignCaveArchetypes()` is acceptable only if landmark-required inputs are separated explicitly and tests prove that the existing generic population receives identical cave ids/archetypes with and without the mine guarantee.

Do not consume or reorder the existing cave RNG streams to choose mine semantics.

## world-terrain-028 is already implemented

Current production now includes:

- natural/adventure/dungeon content anchors;
- deterministic `storyFind`, `loot`, treasure and prop anchors where appropriate;
- authored anchor claim/arbitration in `src/world/caves/caveAuthoredAnchorClaims.ts`;
- dungeon chamber semantics through `dungeonChambersOf()`;
- adventure content profile/reservation logic in world composition.

017 must not invent another claim registry or content-reservation system.

The mine landmark itself needs only a stable `mineId → caveId` binding. It does not require a story/loot anchor.

When selecting an already-existing cave:

- reject a cave only when an existing deterministic authored world-content binding makes it semantically incompatible with becoming the mine;
- do not inspect mutable chest/container contents;
- do not use quest acceptance, player discovery or save-state progress as selection input;
- do not mutate/re-roll content profiles or anchor claims to make a candidate fit.

If later abandoned-mine content needs anchors, that later plan should submit claims through the shared authored-claim mechanism.

## World-location ownership

`WorldLocationCatalog` remains the canonical deterministic semantic-place owner. Its long-lived rebuild contract still matters: seed/caves/chunk-manager/sample params are supplied through live thunks.

Current `WorldLocationKind` remains:

```text
settlement | cave | cemetery | lake | mountainPeak | ruins
```

If 017 adds `abandonedMine`, update `WorldLocationKind`, `WORLD_LOCATION_KINDS`, naming, map/exhaustive switches and discovery/filtering tests.

`WorldLocation` remains generic and has no `caveId` source-reference field. Keep a small catalog-owned mine semantic value/resolver and derive the normal `WorldLocation` view from it. Do not put topology/heightfield objects into `WorldLocation` and do not create `MineRegistry`.

Preserve `WorldLocationCatalog.getById()` self-describing deterministic reconstruction; do not persist `mineId → caveId` in `SaveData` if it is reproducible.

## Terrain / massif evaluation

Use the analytic terrain path in `src/terrain/chunkHeightmap.ts` via `RawSampleParams`. Do not instantiate chunks to classify candidates.

`sampleMountainRidgeAt()` is a ridge-strength signal, not a massif identity. Keep its semantics unchanged.

Prefer a pure bounded helper:

```text
candidate center
→ fixed deterministic neighbourhood samples
→ ridge/mountain presence
→ elevation + relief
→ coherence / extent
→ suitability score + reason
```

Keep sample count, radii and thresholds explicit constants. The classifier should reject isolated hills, steep riverbanks and locally steep lowlands while accepting coherent mountain terrain.

Do not automatically involve `locationsCoarseCache.ts`; correctness must remain procedural on cache miss.

## Candidate ranking

Do not choose the strongest massif first and search for a cave afterwards.

Required priority:

```text
existing suitable massif + accepted suitable eligible cave
> existing suitable massif + guaranteed eligible cave
> generated massif + suitable/guaranteed eligible cave
```

Useful factors include massif score/coherence, cave entrance position, structural capacity, entrance approach, settlement/road/coast conflicts, deterministic authored-content incompatibility and a stable tie-break.

Do not overfit selection to future quest stages or gold placement.

## Cave guarantee

A guaranteed mine cave must still be an ordinary accepted production cave.

Preferred flow:

```text
selected massif
→ deterministic bounded mountain-site candidates
→ shared site-safety validation
→ buildProductionCaveTopology(...)
→ accepted natural/adventure topology
→ normal retained heightfield/runtime/presentation lifecycle
```

Do not bypass topology acceptance and do not force `dungeon` for capacity.

If the site is created only for the landmark, give its topology recipe an explicit deterministic policy independent from generic adventure/dungeon guarantee assignment. Keep that policy narrow; 017 should not redesign cave population/archetype probabilities.

## Macro-terrain fallback

This remains the highest-risk part of the plan.

The massif cannot be created with runtime `ChunkManager.modifyTerrain()` because it must exist identically for analytic/off-screen sampling and chunk generation before streaming state matters.

First implement bounded natural search and prove whether fallback is needed for required seed coverage.

If fallback requires a new macro constraint in terrain params, audit at least `RawSampleParams` / `ChunkTileParams`, worker-safe terrain payloads, analytic samplers, cache fingerprints and persistent worldgen cache invalidation assumptions.

If that seam becomes broad, update effort from `M` to `L` before implementing the fallback.

Normal Cave V2 mouth recess + `TerrainCutout` are allowed; the prohibition applies only to creating the mountain massif through runtime terrain edits.

## Tests with highest value

Prioritise deterministic regression boundaries:

- same seed/config ⇒ same `mineId`, `caveId`, entrance;
- presentation/streaming/order cannot change the binding;
- massif classifier distinguishes coherent mountain terrain from isolated/steep lowland cases;
- ranking prefers an existing suitable eligible cave over generating another one;
- fallback order stays natural massif+cave → natural massif+guaranteed cave → generated massif;
- guaranteed mountain site still passes `buildProductionCaveTopology()`;
- `dungeon` is always excluded;
- adding 017 leaves all pre-existing generic cave ids unchanged;
- adding 017 leaves guaranteed adventure and dungeon cave ids unchanged;
- adding 017 leaves per-cave archetype results unchanged;
- existing authored anchor/profile decisions remain unchanged;
- an incompatible deterministic authored binding rejects a candidate without stealing/releasing claims;
- catalog lookup survives `WorldBundle` dependency-thunk rebuild;
- quest/discovery/save/container state does not participate in generation.

For macro fallback add a deterministic test proving analytic sampling and chunk/worker terrain generation observe the same feature parameters.

## Suggested implementation order

1. Add pure massif suitability/ranking helpers and focused tests.
2. Add the catalog-owned mine semantic contract and deterministic identity.
3. Add existing-cave selection over eligible natural/adventure caves.
4. Factor shared cave-site safety and add the dedicated mountain-site guarantee without perturbing generic archetype assignment.
5. Wire the accepted landmark-required cave into the ordinary Cave V2 runtime lifecycle.
6. Integrate deterministic authored-content incompatibility checks using existing claims/contracts only.
7. Add catalog/world-location exposure and rebuild tests.
8. Implement macro-terrain fallback only if bounded search/guarantee coverage proves it necessary; reclassify effort to `L` first if the terrain contract must broaden materially.

## Implementation-agent recon boundary

Do not repeat a repo-wide cave recon. Start with the plan, this file, `largeCaves.ts`, `createCaves.ts`, `caveArchetype.ts`, `productionTopology.ts`, `caveIdentity.ts`, `caveHabitat.ts`, `caveContentAnchors.ts`, `caveAuthoredAnchorClaims.ts`, `worldLocationCatalog.ts`, `worldLocationTypes.ts` and `chunkHeightmap.ts`.

Only widen recon if the macro fallback, world bootstrap or current authored-content composition wiring genuinely requires it.

Browser/gameplay verification remains manual by the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

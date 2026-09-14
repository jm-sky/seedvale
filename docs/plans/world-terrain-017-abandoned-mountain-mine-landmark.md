# Plan: Abandoned mountain mine landmark

**Created:** 2026-09-08
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~world-terrain-019~~
**Domain:** `world-terrain`  
**Type:** `feature`  
**Model:** Opus, Sonnet
**Subdomains:** `terrain` `landmarks`
**Tags:** `caves` `mountains` `worldgen` `landmark`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

## Goal

Create the deterministic world-generation foundation for the abandoned mountain mine from `docs/roadmap/quests-abandoned-gold-mine-colony.md`.

For every supported world where this landmark is required, world generation provides:

```text
genuine mountain massif
→ suitable production Cave V2
→ stable semantic abandoned-mine landmark
```

The mine exists as world state before any related quest begins. Quest code may discover/reference it, but never creates, moves or reshapes it.

## Current production baseline (reconfirmed 2026-09-14)

`world-terrain-019` is complete and the dependency is fulfilled.

Current cave ownership is:

```text
src/world/largeCaves.ts
  pickLargeCaveSites()
  → generic cave site placement

src/world/caves/caveArchetype.ts
  assignCaveArchetypes()
  → deterministic natural / adventure / dungeon recipe assignment

src/world/caves/productionTopology.ts
  buildProductionCaveTopology()
  → accepted CaveTopology + stable caveId

src/world/createCaves.ts
  CaveTopology
  → CaveHeightfieldRepresentation
  → terrain cutout / presentation / gameplay spatial queries
  → cave content anchors / dungeon chamber view
```

Important current facts:

- `pickLargeCaveSites()` is still the production siting owner.
- Its current generic policy samples the fixed `130..620` home ring and rejects `sampleMountainRidge(x, z) > 0.55`; it therefore cannot by itself place the required mountain mine.
- `CaveTopology` + `CaveHeightfieldRepresentation` are the production cave spatial authority.
- `CaveVolume` is not a gameplay/spatial authority. `topologyToCaveDefinition()` remains a compatibility view used by `Caves.definitions()`, world-location cave lookup and streaming bounds.
- `Caves` already exposes stable cave-scoped contracts including `archetypeOf()`, `contentAnchorsOf()`, `dungeonChambersOf()`, `resolveHabitat()`, `queryGroundIn()` and `resolveHorizontalIn()`.
- Production archetypes are currently `natural | adventure | dungeon`.
- `world-terrain-028` is implemented: cave content anchors and authored anchor claims now provide deterministic story/loot placement and claim arbitration across natural/adventure/dungeon caves.
- Mine semantics must not become a cave archetype. In V1 the abandoned mine should bind only to a suitable `natural` or `adventure` cave; `dungeon` is excluded from mine selection so its guaranteed role, chamber semantics and authored-content ecosystem remain independent.
- `WorldLocationCatalog` remains the canonical deterministic semantic-place owner and survives `WorldBundle` rebuilds through thunk dependencies.
- `WorldLocationKind` currently includes `settlement | cave | cemetery | lake | mountainPeak | ruins`; the mine requires a new semantic kind or an equivalent catalog-owned mine-specific contract.

## Core invariants

> **No quest code creates, moves or modifies the mountain, cave or mine landmark.**

> **The mine is located in a genuine mountain massif, not an isolated hill, river bank or quest-created terrain bump.**

> **Mountain suitability is evaluated over a bounded neighbourhood, not from one terrain sample.**

> **The mine reuses the production Cave V2 topology/heightfield lifecycle. No mine-specific cave geometry or spatial engine.**

> **`mineId` is semantic identity; `caveId` is cave identity. They remain distinct and are bound deterministically.**

> **Selection is independent of player/camera position, streaming order, quest state and mutable global RNG order.**

> **Adding the mine must not perturb existing generic cave identities, guaranteed adventure/dungeon assignment, per-cave archetype rolls or authored content claims.**

## Scope

This plan covers:

- bounded deterministic regional search for the abandoned mine;
- massif suitability based on existing analytic terrain signals;
- preference for a suitable already-accepted production cave when possible;
- deterministic cave-site guarantee inside a suitable massif when necessary;
- deterministic macro-terrain massif fallback only when bounded search finds no suitable existing massif;
- stable `mineId → caveId` binding;
- deterministic exclusion of `dungeon` caves from mine selection;
- compatibility with current cave authored-content/profile/anchor-claim systems;
- `WorldLocationCatalog` integration;
- deterministic reconstruction across streaming and `WorldBundle` rebuild;
- focused tests and documentation.

## Non-goals

Do not implement here:

- gold deposits, reserve/capacity or depletion;
- Player/NPC mining changes;
- quest stages, old map discovery, sponsor NPC or colony systems;
- mine ownership/profit sharing;
- generic cave-pathfinding redesign;
- new cave story/loot-anchor vocabulary or authored-content arbitration;
- a new `GoldMineCave`, `QuestCave`, `MineCaveGenerator` or `MineRegistry`;
- runtime terrain modification to create the massif.

Follow-up resource work consumes the stable mine landmark and production Cave V2 APIs.

## Ownership

| Concern | Owner |
|---|---|
| base terrain / massif shape | terrain worldgen (`chunkHeightmap.ts` path) |
| generic cave siting | `largeCaves.ts` / shared siting seam |
| archetype assignment | `caveArchetype.ts` |
| topology acceptance / cave identity | production Cave V2 topology |
| cave spatial representation | production heightfield |
| cave story/loot anchors and claims | existing Cave V2/world-composition content contracts |
| semantic mine identity and lookup | world-location domain |
| `mineId → caveId` binding | catalog-owned mine landmark contract |
| quest knowledge/discovery | later quest plan |
| gold/resources/mining | follow-up resource plan |

No abandoned-mine manager owns all of these systems.

## Phase 1 — Mine landmark contract

Add the smallest catalog-owned semantic contract required by downstream systems, conceptually:

```text
AbandonedMineLandmark
  mineId
  caveId
  x / z representative entrance position
  semantic location kind
```

Requirements:

- `mineId` derives from world seed + a stable semantic mine slot/salt, not from `caveId`.
- `caveId` references an accepted production `CaveTopology`.
- no topology, heightfield, mesh or transient runtime object is copied into the landmark.
- the binding is deterministic and does not need `SaveData` persistence when it can be reconstructed.
- `WorldLocationCatalog.getById()` keeps the existing self-describing deterministic lookup property.

If adding `abandonedMine` to `WorldLocationKind`, update `WORLD_LOCATION_KINDS`, ID parsing, naming/map/exhaustive handling and tests.

Do not add a parallel `MineRegistry`.

## Phase 2 — Bounded massif suitability

Use analytic terrain sampling from `src/terrain/chunkHeightmap.ts` through the same `RawSampleParams` world path used by world locations/maps.

Do not create chunks to classify candidates.

`sampleMountainRidgeAt()` is a ridge-strength signal, not a semantic massif ID. Keep its meaning unchanged.

Evaluate a fixed-radius/fixed-sample neighbourhood and combine enough existing signals to distinguish a coherent mountain massif from isolated hills, steep river banks, small ridges and locally steep lowland.

At minimum consider ridge/mountain strength across the neighbourhood, fraction of mountain-classified samples, local/regional relief, elevation relative to surrounding samples and spatial coherence/extent.

Keep sample pattern, radii and thresholds explicit constants so cost and tests are bounded.

## Phase 3 — Existing cave candidate preference

Evaluate massif and accepted cave candidates together rather than selecting a massif first and discovering cave suitability afterwards.

Preference order:

```text
1. suitable existing massif + suitable accepted production cave
2. suitable existing massif + guaranteed production cave site
3. guaranteed massif + suitable/guaranteed production cave site
```

For an already-accepted cave, use production metadata/topology/spatial contracts rather than `CaveDefinition` geometry assumptions.

Useful current contracts include stable `CaveTopology.caveId` and entrance, topology nodes/segments, `Caves.archetypeOf()`, `Caves.contentAnchorsOf()` / authored claim contracts and cave-scoped heightfield queries.

V1 candidate rule:

```text
natural | adventure → eligible if spatially suitable and not already reserved by an incompatible authored world-content binding

dungeon → ineligible for abandoned-mine binding
```

Do not require an `adventure` cave merely because it is larger. Natural or adventure may qualify if it satisfies generic spatial/capacity requirements.

Do not make mine selection depend on mutable container contents, quest acceptance or player discovery. Only deterministic world-composition reservations/claims may make a cave unavailable.

## Phase 4 — Shared cave-site guarantee inside an existing massif

Current `pickLargeCaveSites()` cannot provide the guarantee because it intentionally rejects strong ridge terrain and its fixed home ring/count are generic cave-population policy.

Extend the shared cave siting seam instead of creating a mine-specific generator.

Required flow:

```text
selected valid massif
→ deterministic bounded candidate sites within massif
→ ordinary production topology acceptance
→ accepted CaveTopology
→ normal heightfield/runtime lifecycle
```

The guaranteed site must still satisfy usable entrance/slope, coast/settlement/road conflicts, topology acceptance and overburden, sufficient structural/spatial capacity, stable cave identity and duplicate prevention.

Prefer factoring reusable site validation/ranking out of `largeCaves.ts` if needed. Do not preserve its `MOUNTAIN_RIDGE_MAX` restriction for the dedicated mountain-site query.

Do not bypass `buildProductionCaveTopology()` acceptance.

### Archetype-assignment integration guardrail

`assignCaveArchetypes()` currently guarantees one accepted home `adventure` cave, then one accepted `dungeon`, then evaluates independent per-cave dungeon/adventure rolls for remaining sites.

The mine guarantee must not change those decisions for the pre-existing generic cave population.

Do **not** prepend/insert the mine site into the ordinary `pickLargeCaveSites()` array and feed the expanded/reordered array through the unchanged assignment flow.

Use an explicit stable integration strategy that preserves existing generic cave assignment: either build the accepted mine topology through a dedicated shared siting input and explicit non-dungeon recipe choice before merging it into the common runtime lifecycle, or extend the assignment API with a clearly separate landmark-required input whose presence cannot alter guarantee ordering or RNG decisions of generic sites.

The resulting mine cave still joins the same `Caves` runtime map/heightfield/presentation lifecycle. Mine semantics remain outside `CaveArchetype`.

## Phase 5 — Search expansion and macro-terrain fallback

Search bounded deterministic regional envelopes before modifying macro worldgen.

```text
initial envelope
→ expanded bounded envelope
→ existing massif + cave guarantee if needed
→ only then macro-terrain fallback
```

If no suitable massif exists, the fallback must enter the deterministic analytic terrain path before cave/location consumers run.

Do not use `ChunkManager.modifyTerrain()` to create the mountain. Cave mouth recess/cutout remains ordinary Cave V2 lifecycle and is not the prohibited macro fallback.

Any macro constraint must be observed consistently by off-screen analytic sampling, chunk generation, worker-safe terrain generation/input and cache fingerprints whose correctness depends on terrain parameters.

Before widening `RawSampleParams`/worker/cache contracts, reconfirm the narrowest viable seam. If guaranteeing the massif requires a broad new shared terrain contract, change this plan effort from `M` to `L` before implementation rather than hiding that expansion.

Do not build a generic authored-landmark terrain framework unless current code clearly justifies it.

## Phase 6 — Stable binding, content compatibility and catalog integration

After the massif and accepted production cave are stable, expose:

```text
mineId
→ caveId
→ representative entrance position
→ WorldLocation view / deterministic lookup
```

The same binding must resolve after cave presentation unload/reload, chunk streaming changes, `WorldBundle` rebuild and save/load reconstruction where relevant.

Never derive identity from array index, chunk activation order, Three.js UUID/object identity or presentation lifetime.

`WorldLocationCatalog` dependencies must remain rebuild-safe thunks. Do not capture a `Caves` instance, seed or sampler permanently at catalog construction.

### Existing cave content systems

`world-terrain-028` already owns deterministic cave story/loot anchors and authored anchor claims. 017 must integrate with those contracts rather than create a mine-local reservation mechanism.

Rules:

- mine selection must not mutate or re-roll cave content profiles;
- mine selection must not steal anchors already claimed by an incompatible authored binding;
- if abandoned-mine content later needs anchors, it must use the shared authored claim/arbitration mechanism;
- the landmark binding itself does not require any story/loot anchor to exist;
- mutable container/loot state never decides whether a cave is the mine.

## Determinism and performance

Use purpose-specific deterministic hashing/RNG from stable inputs such as world seed, semantic mine salt/slot, stable regional coordinates and candidate identity. Avoid shared mutable RNG streams.

The selector must be bounded, use analytic samples rather than generated chunks, avoid cave mesh creation, run only at world-build/catalog-resolution frequency, remain player/camera independent, remain correct without persistent worldgen cache and not consume/reorder RNG streams used by generic cave archetype/profile/content decisions.

Do not automatically extend `locationsCoarseCache.ts` for a unique mine result.

## Likely implementation areas

Focused recon should start from:

```text
src/terrain/chunkHeightmap.ts
src/world/largeCaves.ts
src/world/createCaves.ts
src/world/caves/caveIdentity.ts
src/world/caves/productionTopology.ts
src/world/caves/caveTopology.ts
src/world/caves/caveArchetype.ts
src/world/caves/caveHabitat.ts
src/world/caves/caveContentAnchors.ts
src/world/caves/caveAuthoredAnchorClaims.ts
src/world/locations/worldLocationCatalog.ts
src/world/locations/worldLocationTypes.ts
src/world/locations/worldLocationNames.ts
```

Potential bootstrap/worker/cache files are involved only if the macro fallback requires them.

Do not mechanically modify all listed files and do not refactor unrelated cave/terrain systems.

For important new architectural/public helpers, add focused JSDoc with `@domain world-terrain` where useful for preflight discovery.

## Verification

Add focused automated tests for:

- same seed/config ⇒ same `mineId`, `caveId` and representative position;
- different streaming/query order does not change selection;
- `mineId` remains independent of cave-array order and cave semantic identity;
- natural massif + accepted cave wins over cave generation elsewhere;
- natural massif + cave guarantee wins over macro massif generation;
- bounded search expands before fallback;
- mountain suitability rejects isolated hills/steep lowlands;
- guaranteed mountain site still passes ordinary production topology acceptance;
- `dungeon` caves are never selected as the abandoned mine;
- adding the mine guarantee does not change pre-existing generic cave ids;
- adding the mine guarantee does not change which generic cave is guaranteed `adventure` or `dungeon`;
- adding the mine guarantee does not perturb per-cave archetype rolls;
- incompatible existing authored anchor claims exclude a candidate without changing claim/profile RNG;
- catalog resolves the mine after dependency thunks switch to a rebuilt `WorldBundle`;
- quest/discovery/save/container state does not participate in generation.

For a deterministic macro-fallback seed verify analytically that the same feature is visible through the terrain generation paths used by chunks/workers.

Run the smallest relevant automated verification set, including as applicable:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Browser/gameplay verification is performed manually by the User.

`pnpm docs:sync` does not need to be run manually when the repository workflow already performs it.

## Success criteria

For every supported world seed where the landmark is required:

```text
bounded deterministic regional search
→ genuine existing mountain massif where possible
→ suitable accepted natural/adventure production cave where possible
→ shared production cave-site guarantee on existing massif when necessary
→ macro-worldgen massif fallback only when no suitable existing massif exists
→ no perturbation of generic adventure/dungeon assignment or authored cave content
→ stable semantic mineId
→ stable mineId → caveId binding
→ deterministic lookup through WorldLocationCatalog
```

The resulting landmark exists independently of quests and provides the stable contract required by later resource/mining/quest systems without forcing them to rescan terrain or rediscover the cave.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

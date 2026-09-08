# Plan: Abandoned mountain mine landmark

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** world-terrain-008
**Domain:** `world-terrain`
**Subdomains:** `terrain` `landmarks`
**Tags:** `mountains` `caves` `worldgen` `mine`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

## Goal

Create the deterministic world-generation foundation for the abandoned mountain mine from `docs/roadmap/quests-abandoned-gold-mine-colony.md`.

For every world where this landmark is required, world generation should provide:

```text
genuine mountain massif
→ suitable Cave V2
→ stable semantic abandoned-mine landmark
```

The mine landmark must exist as part of the world before any related quest begins.

This plan deliberately stops before adding rich gold deposits, mining changes or resource depletion. Those belong to a follow-up world/resources plan.

## Core invariants

> **No quest code creates, moves or modifies the mountain, cave or mine landmark.**

> **The mine must be located in a genuine mountain massif, not on flatland, an ordinary hill or a quest-created terrain bump.**

> **Mountain suitability is evaluated over a bounded surrounding area, not from a single terrain sample.**

> **Mine placement normally follows terrain. Only the final deterministic worldgen fallback may influence macro terrain generation.**

> **The mine uses ordinary Cave V2 infrastructure rather than introducing a mine-specific cave implementation.**

> **The mine has its own stable semantic identity while retaining an explicit stable binding to its Cave V2 identity.**

## Scope

This plan covers:

- deterministic regional selection for the abandoned mountain mine;
- classification of genuinely suitable mountain massifs using existing terrain signals over a bounded surrounding area;
- joint massif/cave candidate evaluation so naturally suitable caves are preferred;
- deterministic search expansion when the initial region has no suitable candidate;
- a macro-terrain massif guarantee as the final fallback when required;
- selection of a suitable existing Cave V2 inside the massif;
- deterministic guarantee of a suitable Cave V2 when a suitable massif has none;
- stable `mineId → caveId` binding;
- integration with the canonical world-place/location mechanism;
- deterministic reconstruction across world generation, streaming and rebuild;
- focused tests and documentation.

## Non-goals

Do not implement:

- gold deposits;
- deposit reserve/capacity;
- `richness` changes;
- cave-aware `ResourceDeposit`;
- Player mining changes;
- NPC miner changes;
- resource depletion or its persistence;
- the abandoned-mine questline;
- old map / quest discovery;
- sponsor NPC;
- expedition;
- mining colony;
- mine ownership;
- infrastructure;
- profit sharing;
- generic cave pathfinding beyond what Cave V2 requires;
- runtime terrain modification.

The follow-up resource plan will consume the stable mine landmark produced here.

## Existing architecture to reuse

### Terrain generation

Real mountain terrain is currently owned by the deterministic analytic terrain pipeline around:

```text
src/terrain/chunkHeightmap.ts
```

The current terrain model already exposes mountain-related structure through the same generation path used by chunks and analytic world queries, including continental, mountain-envelope, ridge, massif and peak effects.

Reuse those signals. Do not implement a second mountain classifier from unrelated noise.

### World locations

The existing world-location system consumes deterministic terrain sampling and represents semantic places in the world.

It must remain a consumer of terrain rather than becoming another terrain generator.

During implementation, reconfirm whether `WorldLocationCatalog` remains the canonical owner for stable semantic world places after `world-terrain-008`. If so, extend it for the abandoned mine instead of introducing a parallel `MineRegistry`. If ownership has moved, use the current canonical mechanism.

### Cave generation

Existing cave infrastructure already provides deterministic cave siting and stable cave identity.

`world-terrain-008-underground-caves-v2.md` is the production direction and a hard dependency.

Current transitional V1/spike APIs are not the target architecture for this plan.

## Ownership boundaries

| Concern | Owner |
|---|---|
| base terrain shape | terrain worldgen |
| mountain/massif signals | terrain worldgen |
| optional deterministic massif guarantee | terrain worldgen |
| regional landmark selection | world/location generation |
| cave siting | Cave V2 |
| cave topology/interior | Cave V2 |
| cave stable identity | Cave V2/world |
| semantic abandoned-mine identity | canonical world-place/location layer |
| `mineId → caveId` binding | mine landmark definition |
| quest knowledge/discovery | later quest plan |
| gold deposits/resources | follow-up resource plan |

No single abandoned-mine manager should take ownership of all these systems.

## Stage A — Define the mine landmark contract

Introduce or extend the smallest canonical representation needed for the abandoned mine as a semantic world place.

The landmark must expose or deterministically provide at least:

```text
AbandonedMineLandmark
  stable mine identity
  stable cave identity
  representative entrance/location position
  semantic location kind
  deterministic lookup
```

This is a required semantic contract, not a prescribed TypeScript interface or type name.

Do not store cave topology, terrain samples or presentation objects inside the landmark.

### Semantic identity

Keep mine and cave identity separate:

```text
caveId
= Cave V2 geometry/spatial identity

mineId
= semantic world-place identity

mine landmark
→ references caveId
```

`mineId` must derive from stable landmark/world-generation inputs and must not rely on the cave ID as its semantic identity. The exact representation should follow existing world-location conventions.

### Why the identities remain separate

A cave system may eventually contain several semantic places:

```text
cave
├── abandoned mine
├── natural chamber
├── underground lake
└── collapsed workings
```

Later quest/history/discovery systems should be able to reference the mine without treating the entire cave as semantically identical to it.

## Stage B — Deterministic regional search

Choose the mine location through deterministic regional world generation.

The first strategy is always to use suitable terrain and caves that already exist.

Conceptually:

```text
deterministic regional envelope
→ evaluate mountain areas over bounded neighbourhoods
→ collect suitable massif candidates
→ evaluate Cave V2 suitability for those candidates
→ rank combined massif/cave candidates
→ select stable best candidate
```

The selection must not depend on:

- Player position;
- camera position;
- quest state;
- chunk loading order;
- runtime exploration order;
- mutable global RNG call order.

## Mountain suitability

The abandoned mine requires a genuine mountain massif.

Suitability must be evaluated over a bounded surrounding area, not from one height or mountain-ridge sample.

Use existing terrain-generation signals to measure enough surrounding terrain to distinguish:

```text
real coherent massif
```

from:

```text
isolated hill
steep river bank
small ridge
locally steep lowland
```

Candidate evaluation may combine existing analytic signals such as:

- mountain/ridge strength across the neighbourhood;
- proportion of samples representing mountain terrain;
- local and regional relief;
- elevation relative to surrounding terrain;
- spatial coherence/extent of elevated mountain terrain.

Do not prescribe a new terrain equation in landmark code. Reuse existing analytic samplers and keep scoring thresholds/constants local to the selection mechanism.

Use a bounded deterministic sampling pattern so evaluation cost is predictable and testable.

## Joint massif/cave candidate ranking

Do not select the highest-scoring massif first and only then discover whether it contains a useful cave.

Prefer a combined selection where cave availability contributes to candidate quality.

The intended preference order is:

```text
1. suitable existing massif + suitable existing Cave V2
2. suitable existing massif + deterministically guaranteed Cave V2
3. deterministically guaranteed massif + suitable/guaranteed Cave V2
```

This prevents generating a new cave in the numerically strongest massif when another comparably suitable natural massif already contains an appropriate cave.

Relevant ranking factors may include:

- strength and extent of mountain terrain;
- massif coherence;
- surrounding elevation/relief;
- suitable natural Cave V2 availability;
- meaningful mountain overburden;
- usable entrance approach;
- distance from coast;
- conflicts with settlements or important roads.

Do not overfit scoring to the future quest. The goal is a believable world landmark, not a hand-authored quest arena.

## Search expansion

Do not generate a mountain merely because the first local search finds none.

Use bounded deterministic expansion:

```text
1. Search intended deterministic regional envelope for existing massif + cave candidates.
2. Expand the deterministic search envelope for suitable existing massifs.
3. If a suitable massif exists but none has a suitable cave, allow a Cave V2 guarantee.
4. Only when bounded search finds no suitable massif at all, use the macro-terrain fallback.
```

The search must remain bounded and predictable. Do not perform an unbounded world scan during startup.

## Stage C — Macro-terrain fallback

If the world-generation contract requires the abandoned mine but bounded deterministic search cannot find any suitable massif, guarantee one through the base terrain system.

This is the final fallback, not the normal placement mechanism.

### Requirements

The guaranteed terrain feature must:

- be a genuine broad mountain massif;
- participate in normal analytic terrain generation;
- be deterministic from stable world inputs;
- exist before cave/location generation consumes terrain;
- produce identical results for chunk generation and off-screen sampling;
- work with worker-based terrain generation where applicable;
- blend coherently into surrounding terrain;
- avoid obvious isolated quest-hill geometry;
- remain independent of quest state.

### Ownership

Prefer a narrow deterministic macro-worldgen constraint consumed by existing mountain generation over direct per-landmark height overrides.

Conceptually:

```text
world seed
→ deterministic macro feature constraints
→ existing terrain sampler
→ resulting massif
```

rather than:

```text
mine landmark
→ modifyTerrain()
→ local mountain
```

Do not use runtime terrain modification APIs.

### Scope discipline

Do not turn this work into a generic authored-landmark terrain framework unless current code clearly benefits from such an extension.

Implement the smallest reusable mechanism that preserves terrain ownership and could naturally support another rare macro feature later.

If this fallback requires a substantial change to the shared terrain-generation contract rather than a narrow extension of an existing seam, reassess this plan from `M` to `L` before implementation instead of silently expanding scope.

## Stage D — Select a suitable Cave V2

For existing massif candidates, prefer a suitable naturally generated Cave V2 as part of combined candidate ranking.

A suitable cave should provide:

- entrance within the mountain/massif;
- meaningful mountain overburden;
- valid Cave V2 topology;
- enough interior space for later mine content;
- usable surface approach;
- stable identity;
- normal Cave V2 lifecycle.

The exact spatial requirements must use the completed Cave V2 APIs rather than assumptions from transitional V1 geometry.

## Existing cave-siting limitation

Recheck cave siting after `world-terrain-008`.

At recon time, the existing pre-V2 siting logic was designed for generic sloped inland caves and could reject strong mountain-ridge values.

Do not simply choose one of those sites and call it a mountain mine. The mine needs a cave whose placement is explicitly valid for the selected massif.

## Stage E — Guarantee a Cave V2 when necessary

If bounded search finds one or more valid existing massifs but none provides a suitable natural cave, extend the shared Cave V2 siting/generation mechanism so the selected massif deterministically receives an appropriate cave.

Required flow:

```text
valid existing massif
+ no suitable natural Cave V2 after bounded candidate evaluation
→ deterministic guaranteed cave site
→ ordinary Cave V2 generation
```

The guarantee must not introduce:

```text
GoldMineCave
QuestCave
MineCaveGenerator
```

The result remains an ordinary Cave V2 with ordinary cave identity, topology, collision, traversal and lifecycle.

### Cave-site requirements

The guaranteed site must satisfy Cave V2's normal safety constraints, including whatever production equivalents exist for:

- overburden;
- terrain intersection;
- entrance validity;
- topology validity;
- collision;
- world boundaries;
- incompatible nearby world features.

Do not bypass Cave V2 validation merely to guarantee the landmark.

If the initially selected point is invalid, deterministically search valid alternatives within the selected massif.

For a fallback-generated massif, apply the same ordinary Cave V2 selection/guarantee rules after the massif exists in the base terrain contract.

## Stage F — Bind mine identity to cave identity

After terrain and cave selection are stable, create the semantic mine binding.

Conceptually:

```text
mineId
representative entrance/location position
caveId reference
```

This binding must be deterministically reconstructible.

Do not rely on:

- cave array index;
- chunk index;
- activation order;
- Three.js object UUID;
- transient mesh identity.

The mine should remain the same world place after:

- leaving and returning;
- cave deactivation/reactivation;
- chunk streaming;
- `WorldBundle` rebuild;
- save/load reconstruction where relevant.

## Canonical world-place/location integration

Reconfirm `WorldLocationCatalog` ownership on current `main` during Phase 1.

If it remains the canonical representation for stable semantic world places, extend/reuse it for the mine. If current code establishes another canonical owner, integrate there instead.

Do not create:

```text
canonical world-place/location mechanism
+
AbandonedMineRegistry
```

The location should contain only semantic/location information appropriate to that system. Do not copy Cave V2 topology into it.

## No quest dependency

Mine generation must not read:

- active quests;
- completed quests;
- quest flags;
- Player discovery state;
- dialogue state.

The dependency direction must remain:

```text
world
→ mine landmark
→ later discovery / quest systems
```

never:

```text
quest
→ creates mine
```

The future quest may discover/reference `mineId`, but cannot own it.

## Contract for the follow-up resource plan

This plan is complete when the follow-up resource plan can obtain a stable mine landmark without knowing how the mountain or cave was selected.

The required semantic output is:

```text
stable mine identity
stable cave identity
representative entrance/location position
semantic location kind
canonical deterministic lookup
```

The follow-up resource plan must not rescan terrain or independently rediscover/reselect the cave. It consumes this landmark contract plus Cave V2's normal spatial APIs.

The resource plan will then own:

- exterior gold placement;
- interior gold placement;
- cave-aware deposit positioning;
- finite reserve;
- `richness` versus reserve;
- Player/NPC mining;
- depletion persistence.

Do not pre-implement those concerns here.

## Determinism

All selection and fallback decisions must derive from stable inputs.

Use purpose-specific deterministic RNG where randomness is useful.

Suitable inputs include:

```text
worldSeed
semantic operation salt
stable regional coordinates / landmark selection identity
```

Avoid shared mutable RNG whose output changes when unrelated world-generation calls are reordered.

Important deterministic outputs include:

- selected regional search result;
- massif choice;
- fallback massif placement, if needed;
- cave candidate choice;
- guaranteed cave site, if needed;
- `caveId`;
- `mineId`.

## Performance

The landmark must not require expensive unbounded world scanning.

Regional evaluation should:

- use analytic terrain samplers rather than generating chunks;
- use bounded candidate sets and bounded neighbourhood sampling;
- avoid creating cave meshes during selection;
- avoid requiring Player/camera presence;
- cache or derive results consistently with existing worldgen architecture where appropriate.

Do not add per-frame mine-location work.

Selection should happen at world-generation/catalog construction frequency, not simulation tick frequency.

## Implementation phases

### Phase 1 — Reconfirm Cave V2 and location contracts

After `world-terrain-008` is complete:

- identify final Cave V2 siting owner;
- identify stable cave identity;
- identify topology/spatial suitability queries;
- identify entrance and overburden validation;
- identify Cave V2 lifecycle/rebuild behaviour;
- recheck `WorldLocationCatalog` and canonical world-place ownership;
- identify existing deterministic regional/location selection patterns.

Do not base implementation on transitional spike/V1 compatibility types.

### Phase 2 — Define landmark identity and output contract

Add the smallest semantic representation for stable mine identity and its `caveId` reference through the canonical world-place/location mechanism.

Keep it independent from quest state and expose the contract required by the follow-up resource plan.

### Phase 3 — Existing-world candidate selection

Implement bounded deterministic neighbourhood sampling, massif classification and combined massif/cave ranking.

Prefer existing massif + existing suitable cave before any generation guarantee.

Do not generate chunks merely to inspect candidates.

### Phase 4 — Cave guarantee on existing terrain

If suitable existing massifs exist but none has a valid natural cave, deterministically guarantee an ordinary Cave V2 in the best valid massif through the shared Cave V2 siting/generation path.

### Phase 5 — Macro fallback

Only if bounded search finds no suitable existing massif, introduce the smallest deterministic terrain-worldgen constraint necessary to guarantee a genuine massif.

Ensure all analytic/chunk/worker terrain paths observe the same feature, then apply ordinary Cave V2 selection/guarantee rules to it.

### Phase 6 — Stable binding and lookup

Finalize deterministic semantic mine identity, `caveId` reference and canonical world-place lookup.

Verify that the follow-up resource plan does not need to repeat terrain/cave selection.

### Phase 7 — Documentation

Update relevant current-state documentation and implementation notes.

Do not describe gold deposits, mining or quest stages as implemented.

`pnpm docs:sync` does not need to be run manually when repository workflow already performs it.

Add JSDoc for important architectural/public functions and classes introduced by the implementation where it improves preflight discovery. Use the `@domain world-terrain` tag where appropriate.

## Likely implementation areas

Exact files must be reconfirmed against current `main` after `world-terrain-008`.

Current likely integration areas include:

```text
src/terrain/chunkHeightmap.ts
src/world/largeCaves.ts
src/world/createCaves.ts
src/world/caves/*
src/world/locations/*
src/world/locations/seedProfile.ts
```

Potential world bundle/bootstrap wiring may also be involved depending on final Cave V2 ownership.

Do not mechanically modify every listed file. Avoid unrelated terrain, cave or world-location refactors.

## Verification

### Deterministic selection

Test representative seeds and verify:

- same seed selects the same massif;
- same seed selects/generates the same cave;
- same seed produces the same `mineId`;
- `mineId → caveId` remains stable;
- unrelated generation order does not affect selection;
- different seeds produce meaningful variation.

### Mountain suitability

Verify:

- suitability is based on bounded neighbourhood sampling rather than a single point;
- selected natural candidates are genuine mountain massifs;
- isolated hills are rejected;
- steep lowland terrain is rejected;
- search expansion occurs before fallback;
- selection remains bounded.

Include deterministic test seeds covering:

```text
suitable massif + cave in initial search
suitable massif + cave found after search expansion
suitable massif but no cave → cave guarantee
no suitable massif → macro fallback
```

### Preference order

Verify explicitly:

- an existing massif with a suitable natural cave wins over generating a cave in another comparable massif;
- an existing suitable massif with a guaranteed cave wins over generating a new massif;
- macro-terrain fallback occurs only when bounded search finds no suitable existing massif.

### Macro fallback

For a seed requiring fallback, verify:

- massif is generated through normal terrain worldgen;
- analytic sampling sees the massif before chunks exist;
- chunk terrain matches analytic sampling;
- worker terrain generation observes the same feature where applicable;
- suitability sampling classifies the result as a genuine massif;
- it blends with surrounding terrain;
- it does not depend on quest state.

### Cave selection

Verify:

- inappropriate lowland/foothill caves are rejected;
- selected cave satisfies production Cave V2 validity rules;
- cave has sufficient interior spatial capacity for later mine content.

Do not test future gold placement here.

### Cave guarantee

Use a deterministic case where:

```text
valid massif
+ no suitable existing cave
```

and verify:

- a cave is guaranteed;
- site is inside the selected massif;
- ordinary Cave V2 generation is used;
- normal cave validation remains active;
- generated cave identity is stable;
- no duplicate cave appears after rebuild.

### Landmark identity and lookup

Verify:

- `mineId` is stable;
- `caveId` is stable;
- mine identity does not depend on `caveId` as its semantic identity;
- identities remain distinct concepts;
- canonical world-place lookup resolves the same mine after rebuild;
- no transient mesh/object identity participates.

### Quest independence

Verify mine generation produces identical results with no quest state involved.

There should be no dependency from terrain/cave/location generation into quest modules.

### Lifecycle

Verify semantic identity remains stable across:

- chunk streaming;
- cave activation/deactivation;
- world bundle reconstruction where supported;
- save/load reconstruction where relevant.

The landmark itself should not require persistence when it is completely deterministic.

### Follow-up contract

Verify that a consumer can resolve the mine landmark and associated Cave V2 without:

- rescanning terrain;
- reranking massif candidates;
- rediscovering the cave;
- depending on quest state.

## Technical verification

Run the smallest relevant automated verification set, including:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Add focused tests around neighbourhood suitability, candidate preference order, fallback generation, cave guarantee and stable identity rather than relying only on broad integration tests.

Browser/gameplay verification is performed manually by the User.

## Dependency / blocker

`world-terrain-008-underground-caves-v2.md` is a hard dependency.

Before implementation, verify that completed Cave V2 provides production ownership for:

- stable cave identity;
- cave siting or an explicit site-input seam;
- entrance validation;
- overburden/terrain validation;
- topology/spatial representation;
- deterministic reconstruction;
- streaming/rebuild lifecycle.

If one of these contracts is still missing, extend Cave V2's generic ownership rather than introducing an abandoned-mine-specific workaround.

## Success criteria

For every supported world seed where the landmark is required:

```text
bounded deterministic regional search
→ genuine existing mountain massif where possible
→ suitable existing Cave V2 where possible
→ Cave V2 guarantee on existing massif when necessary
→ macro-worldgen massif fallback only when no suitable massif exists
→ ordinary suitable/guaranteed Cave V2
→ stable semantic mineId
→ stable mineId → caveId binding
→ lookup through the canonical world-place/location mechanism
```

The resulting landmark exposes a stable semantic contract containing mine identity, cave identity, representative location and deterministic lookup.

All of this exists before any quest begins.

The follow-up resource plan consumes this contract and must not independently rescan terrain or rediscover the cave.

Removing or disabling the future abandoned-gold-mine quest must have no effect on the massif, cave or mine landmark.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

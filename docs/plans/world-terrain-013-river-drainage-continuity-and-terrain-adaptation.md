# Plan: River Drainage Continuity and Terrain Adaptation

**Created:** 2026-09-05
**Status:** `planned` 📋
**Type:** fix
**Priority:** high · **Effort:** M
**Depends on:** world-terrain-011
**Domain:** `world-terrain`
**Subdomains:** `terrain`
**Tags:** `rivers` `hydrology` `drainage` `erosion`
**Roadmap:** -

## Goal

Make meaningful rivers end in a hydrologically coherent way without redesigning the river system: preserve valid downstream drainage where it already exists, and allow small, bounded terrain adaptation where long-term erosion would plausibly create a stable outlet.

The motivating observed regression is seed `3`: a visually good river approaches the coast but appears to terminate roughly 50–100 m before the sea. The exact river coordinates are not known yet, so seed `3` is a manual verification case rather than an automated golden test.

The plan must not assume one cause before diagnostics. A visible dry gap may come from chain extraction/filtering, independent river-tile analysis, an unresolved dry sink, or another terminal condition.

The guiding world-generation rule is:

> A river is the result of the final hydrology of a shaped world, not a line fitted after the fact to immutable raw terrain.

Seedvale worldgen represents a landscape after long-running drainage and erosion processes. Raw sampled terrain is therefore input to hydrology, not an untouchable final surface. Small local barriers may be conditioned when that produces a plausible stable drainage network; large barriers and genuinely closed basins must not be forced open.

## Background

`world-terrain-011` already introduced the foundation this work should extend rather than duplicate:

- raw D8 flow and accumulation,
- meaningful dry-sink eligibility from accumulation,
- bounded deterministic shallow-breach search,
- hard search/path/cut budgets,
- conditioned working elevation,
- one final D8 + accumulation recompute after accepted conditioning,
- defensive rejection of unresolved dry terminals.

The current river tile analyses a 256 m core with a 384 m halo at an 8 m cell step. The hydrology workspace already contains `elevation`, `flowDir`, `flags` and `accumulation`; it is disposable after `computeRiverTile()` converts it into compact `RiverChain[]`.

This means local downstream reasoning can normally inspect tens or hundreds of metres beyond a river endpoint using data already computed for the tile. It should not require another chunk, a neighbouring river tile, a global river graph or persistent hydrology state.

## Design direction

Keep hydrological reasoning in the hydrology/conditioning stage and keep `buildChains()` primarily an extraction/representation step.

Target flow:

```text
analytic terrain
      ↓
raw D8 + accumulation
      ↓
meaningful drainage analysis
      ↓
already reaches valid receiver?
      │
      ├─ yes → preserve normal drainage
      │
      └─ no / problematic terminal
              ↓
       bounded outlet analysis
              ↓
       ┌──────┴─────────┐
       │                │
existing cheap     shallow terrain
route              adaptation
       │                │
       └──────┬─────────┘
              ↓
       conditioned elevation
              ↓
      final D8 + accumulation
              ↓
         classification
              ↓
          RiverChain
```

Do not create independent post-processing systems such as `connectRiverToOcean`, visual endpoint snapping or a second terminal-carving representation.

## Scope

### 1. Diagnose river terminal failure modes

Before changing terminal policy, make the existing failure modes observable in focused tests/debug diagnostics.

Distinguish at least:

- normal core exit,
- valid existing water receiver,
- unresolved dry `SINK`,
- hydrology-window `BOUNDARY_EXIT`,
- chain filtered as rendering noise/too short,
- any extraction stop caused by classification or defensive graph guards.

Use this to determine what actually prevents a coherent final outlet. Do not encode seed `3` assumptions into production logic.

Diagnostics must remain bounded/test-oriented and must not add terminal metadata to every cached `RiverChain` unless implementation proves a production consumer needs it.

### 2. Reuse already-computed downstream hydrology as the cheap path

For meaningful drainage approaching a problematic terminal, allow a small bounded downstream inspection using the existing `HydrologyRegion`.

The cheap path should follow existing drainage topology rather than search geometrically for the nearest water body. Prefer walking `flowDir` and inspecting existing terminal flags/elevation over BFS or broad neighbourhood scans.

Its purpose is to answer questions such as:

- does the existing D8 path already reach a valid receiver shortly downstream?
- is the apparent endpoint only an extraction/ownership artefact?
- does the path instead reach a genuine dry sink?
- is the result incomplete because the analysis boundary was reached?

The probe/search budget must be explicit and small. A value around the observed 50–100 m gap may be useful for diagnostics, but do not tune the production rule specifically to seed `3`. Choose the final budget from the existing river-tile/halo geometry and measured cost.

Do not recompute a whole chunk/tile merely to answer a local terminal question.

### 3. Keep classification and drainage responsibilities distinct

Stream classification answers whether accumulated drainage is meaningful enough to become a visible river. D8 topology answers where water drains.

Do not introduce a rule where proximity to water alone promotes arbitrary short threshold noise into a river.

Conversely, once diagnostics prove a meaningful river is being lost solely because extraction/filtering stops before a valid downstream receiver, fix the responsible representation/extraction rule rather than creating a second river path.

Within one coherent hydrology region, accumulation should not decrease downstream. Treat an unexpected classified-to-unclassified downstream transition as a defect/ownership signal to diagnose, not as an assumed normal case requiring a generic workaround.

### 4. Extend existing bounded terrain conditioning where needed

If meaningful drainage reaches a genuine local dry sink or small terrain barrier, extend the `world-terrain-011` shallow-breach/conditioning mechanism rather than creating another carving system.

Terrain adaptation is valid when a stable outlet can be created within conservative local budgets representing long-term erosion.

Candidate evaluation should prefer hydrologic/terrain cost over simple geometric distance. Consider at least:

- path length / affected cell count,
- maximum required cut depth,
- total required cut,
- existing downstream slope/drainage,
- whether the target is a valid downstream receiver,
- meaningful accumulated flow as an eligibility gate.

For example, a 110 m route requiring a shallow 0.7 m cut may be preferable to a 60 m route through an 8 m ridge.

Do not route a sink uphill by changing only `flowDir`. Any accepted breach must produce coherent conditioned elevation and strictly descending final drainage.

### 5. Preserve actual water-receiver semantics

Keep `OCEAN_OUTLET` narrow: it represents an existing water-backed terminal, despite the historical name. Do not mark a dry sink as an outlet merely to preserve a chain.

The system may discover or condition a route toward an actual water receiver, but the receiver must remain grounded in existing water/height semantics.

Do not implement "find nearest sea and connect to it".

### 6. Preserve river-tile ownership

Normal river continuation across the 256 m core boundary remains owned by neighbouring river tiles. Hydrology-window `BOUNDARY_EXIT` is not the normal cross-tile continuation mechanism.

Use the 384 m halo for local reasoning where useful, but do not render arbitrary geometry owned by a neighbouring core and do not introduce persistent cross-tile connectivity state unless diagnostics prove the current ownership model itself defective.

Any conditioning decision near a core edge must be deterministic from world-space terrain/local drainage, not seeded from tile coordinates. Keep repair/search radii comfortably within the existing halo where practical so neighbouring analyses can reach the same local conclusion.

### 7. Leave genuinely closed basins for lake semantics

Do not force every meaningful river to the sea.

If a basin cannot be resolved within the bounded local conditioning budget, preserve the hydrological fact that it is closed rather than tunnelling through a major ridge.

Such cases are candidates for future lake/spill-level semantics:

```text
inflow
  ↓
closed basin
  ↓
lake fills to spill level
  ↓
outflow
```

Full lake filling, spill-level computation and runtime lake simulation are outside this plan.

## Terrain adaptation policy

The system should distinguish small landscape irregularities from major geography.

Conceptually:

```text
meaningful drainage
      ↓
problematic terminal
      ↓
cheap existing downstream route?
      ├─ yes → preserve/fix continuity
      └─ no
          ↓
small bounded terrain correction?
      ├─ yes → condition terrain → recompute drainage
      └─ no  → unresolved basin / future lake semantics
```

Acceptable examples:

- shallow local depression,
- small sill between a drainage path and lower terrain,
- short low ridge that a long-lived river could plausibly erode,
- small terrain noise preventing an otherwise coherent route to a receiver.

Reject examples:

- deep basin,
- high or wide ridge,
- long artificial canal to the sea,
- route selected only because water is geographically nearby,
- terrain modification exceeding explicit cut/search budgets.

## Architecture constraints

Preserve and reuse the existing river stack unless diagnostics prove a separate defect:

- `sampleFloorAt()` / analytic terrain source,
- D8 flow direction,
- accumulation,
- accumulation-based classification,
- `HydrologyRegion`,
- `resolveMeaningfulDrySinks()` and bounded breach search,
- conditioned elevation + final recompute,
- fixed river tile core + halo ownership,
- `riverTileCache`,
- canonical `RiverChain`,
- deterministic smoothing/meandering,
- accumulation-derived width/flow,
- canonical cross-section from `world-terrain-010`,
- shared chain for channel carving and water rendering,
- shoreline and vegetation consumers.

Hydrology must remain generation-time, deterministic and independent of player/camera/load order.

Do not introduce:

- global heightfield hydrology,
- persistent hydrology grids,
- global river connectivity manager,
- per-frame erosion simulation,
- second river representation,
- visual snapping to shoreline,
- special-case coordinates or seed-specific fixes.

## Performance budget

The normal path must stay cheap.

Prefer:

```text
raw hydrology
→ sparse terminal candidates only
→ bounded existing-data probe
→ bounded breach search only when justified
→ at most one final D8 + accumulation recompute after accepted conditioning
```

Do not:

- run outlet searches for every cell,
- flood-fill whole hydrology regions repeatedly,
- generate neighbour chunks/tiles for endpoint checks,
- retain hydrology arrays in runtime state,
- move the work to a Web Worker without profiling evidence.

Reuse already allocated hydrology arrays/workspace where practical. Any new search must have hard caps for visited cells, path length, maximum cut depth and total cut cost.

## Tests

Add focused deterministic tests based on the actual diagnosed failure modes.

### Existing valid downstream route

A meaningful river whose hydrology already reaches a valid receiver must remain continuous and must not require terrain modification.

### Repairable shallow barrier

A meaningful drainage path ends in a shallow local basin/sill with a plausible downstream receiver within the conditioning budget.

Expected:

- conditioning accepted,
- final elevation supports descending flow,
- final D8 reaches the receiver,
- accumulation remains coherent,
- river chain remains continuous.

### Expensive nearby route

Water may be geometrically close, but reaching it requires a large cut.

Expected:

- repair rejected,
- no artificial canyon/tunnel merely because the coast is nearby.

### Prefer low-cost outlet

When two candidate escapes exist, prefer the hydrologically cheaper terrain adaptation rather than simply the shortest geometric route.

### Weak/noisy drainage

A weak short stream near water must not be promoted into a significant river solely by terminal handling.

### Cross-tile/core ownership

A river crossing a river-tile core boundary must keep normal one-owner continuation semantics. Terminal logic must not duplicate geometry into the neighbouring core.

### Determinism

Same seed/region/config must produce identical conditioned elevation, D8, accumulation and chains.

### Hydrology invariants

After accepted conditioning:

- downstream elevation strictly descends where required by current river contracts,
- accumulation is conserved/coherent,
- water receiver flags remain truthful,
- canonical water/bed/carving representation stays aligned.

### Regression coverage

Keep or extend representative multi-seed/tile tests so future changes cannot silently restore dry-ending meaningful rivers or remove inland drainage wholesale.

Do not create an automated `seed=3` golden test until the affected river/tile coordinates are identified reliably.

## Manual verification

Browser verification is performed by the player.

Primary regression case:

- seed `3`,
- previously observed river ending roughly 50–100 m before the sea,
- verify whether the endpoint now reaches/merges naturally with the receiver or is revealed as a genuinely closed basin.

Also inspect several representative seeds for:

- inland plains and valleys,
- coastal drainage,
- mountain drainage,
- river-tile boundaries,
- small streams vs. major rivers,
- channel/water alignment after conditioning.

The visual goal is coherent drainage, not maximum river count.

## Non-goals

This plan does not aim to:

- replace D8 with a new hydrology solver,
- rewrite the river network,
- simulate geological erosion physically,
- add runtime erosion,
- implement full lake filling/spill simulation,
- guarantee every river reaches the ocean,
- eliminate every dry basin,
- create global watershed state,
- redesign river rendering/shaders,
- redesign vegetation,
- tune terrain generation globally merely to hide hydrology failures.

## Suggested implementation order

1. Add focused terminal diagnostics/tests and identify the actual failure modes behind visible dry gaps.
2. Verify whether any case is purely chain extraction/filtering or river-tile ownership before modifying hydrology.
3. Add the smallest bounded downstream inspection helper over the existing `HydrologyRegion` if diagnostics show it provides useful receiver/terminal information.
4. Fix any proven representation/extraction continuity defect without creating a second river path.
5. Extend the existing `world-terrain-011` bounded breach/conditioning policy for meaningful terminal drainage where a shallow, low-cost outlet exists.
6. Keep terrain-adaptation choice cost-based and bounded rather than proximity-to-sea based.
7. Recompute final D8 + accumulation coherently after accepted conditioning using the existing hydrology pipeline.
8. Add deterministic shallow-barrier, expensive-barrier, outlet-choice, ownership and invariant regression tests.
9. Update current terrain/water state documentation only after implementation establishes the final behaviour.
10. Leave browser verification, especially seed `3`, to the player.

When introducing or materially changing important public/architectural hydrology functions, add concise JSDoc where it improves AI preflight discovery; use `@domain world-terrain` where useful.

Do not run `pnpm docs:sync` manually; generated documentation is synchronized by the GitHub workflow.

## Completion criteria

The plan is complete when:

- the actual causes of meaningful river terminal gaps are identified and covered by tests,
- existing valid downstream drainage is not lost by chain extraction/filtering,
- shallow local terrain barriers can be conditioned through the existing bounded hydrology mechanism where justified,
- terrain adaptation uses explicit cost/budget constraints rather than nearest-water snapping,
- large barriers and genuinely closed basins remain unresolved rather than being artificially tunnelled through,
- final conditioned drainage remains deterministic, descending and accumulation-consistent,
- river-tile ownership remains bounded and deterministic,
- canonical carving/rendering/shoreline/vegetation consumers remain coherent,
- no new global/runtime/parallel river system is introduced,
- technical verification passes,
- browser verification is left to the player.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
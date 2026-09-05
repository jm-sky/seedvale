# Plan: River Sink Resolution and Inland Drainage Recovery

**Created:** 2026-09-05
**Status:** `planned` 📋
**Type:** fix
**Priority:** high · **Effort:** M
**Depends on:** world-terrain-010
**Domain:** `world-terrain`
**Subdomains:** `terrain`
**Tags:** `rivers` `hydrology` `drainage` `sinks`
**Roadmap:** -

## Goal

Restore meaningful inland river coverage after the river-terminal fix started dropping whole river chains that end in dry D8 sinks, while preserving the valid improvements already delivered by the river system.

The fix must keep the original intent of the terminal correction:

> a river must not visibly terminate at an arbitrary dry point on land.

But a problematic terminal must no longer imply that an otherwise meaningful upstream drainage network should be discarded wholesale.

The intended direction is:

```text
terrain
  ↓
D8 drainage
  ↓
flow accumulation
  ↓
river candidates
  ↓
terminal classification
  ↓
valid receiver → keep
weak dry-sink drainage → drop
meaningful dry-sink drainage → bounded repair
```

This is a repair of the existing hydrology pipeline, not a river-system redesign.

## Background

The current river stack already provides valuable behaviour that must remain intact:

- deterministic D8 drainage from analytic terrain,
- flow accumulation and accumulation-based stream classification,
- fixed river-tile ownership with bounded halo analysis,
- deterministic cross-chunk/cross-tile behaviour,
- canonical smoothed and meandered river chains,
- flow-scaled width through the existing `flowFactor()`/accumulation model,
- channel carving from the same canonical river chain used by rendering,
- the canonical river cross-section from `world-terrain-010`, including separate bed, water-surface, water-width and channel-width concepts,
- shoreline/gameplay queries and river-aware vegetation based on that same representation.

The current regression is narrower: a dry closed D8 depression can mark a chain as having an invalid receiver, causing the whole chain to be removed even when it represents substantial inland drainage.

Naive D8 sinks were already identified as a known limitation in the original river work. The appropriate next step is deterministic, bounded depression handling for meaningful drainage — not reverting to rivers that simply stop on dry land and not generating replacement rivers independently of terrain.

## Scope

### 1. Diagnose the real loss caused by dry sinks

Before choosing final repair thresholds, add bounded deterministic diagnostics/tests that distinguish at least:

- candidate river chains,
- chains that leave the river-tile core normally,
- chains that reach a valid water receiver,
- chains terminated by a dry `SINK`,
- rendered/kept chains,
- inland river coverage above `waterLevel`.

For dry-sink chains, capture enough aggregate information to understand whether meaningful drainage is being discarded, especially:

- downstream/max accumulation,
- chain length,
- inland extent.

The important metric is not only the percentage of hydrology cells that are sinks. One sink can terminate a large upstream catchment, so the plan must evaluate how much river network is lost because of dry-sink terminals.

Diagnostics must remain test/debug data, not persistent runtime world state.

### 2. Distinguish weak artefacts from meaningful drainage

Replace the current all-or-nothing policy:

```text
dry sink → drop entire chain
```

with a small explicit policy based on existing hydrology signals.

A dry-sink drainage should be considered meaningful primarily from existing accumulation data, with chain length/inland extent as supporting signals where useful.

Prefer explicit bounded rules over a large generic scoring framework.

Conceptually:

```text
weak / short drainage + dry sink
→ may be dropped as noise

meaningful accumulated drainage + dry sink
→ repair candidate
```

Do not introduce random replacement rivers or a separate river-density compensation system. River existence must continue to emerge from terrain and drainage.

### 3. Add bounded deterministic depression resolution

For meaningful drainage ending in a dry sink, attempt a deterministic local depression/spill resolution before final river-chain extraction.

The repair should identify whether the sink is a local depression with a plausible spill path and, where possible, establish a downstream route that allows drainage to continue.

The repair must operate within a bounded analysis budget and reuse the existing hydrology workspace/analytic terrain sampling rather than creating a global world heightfield.

Important requirements:

- deterministic for the same seed and world region,
- bounded by explicit search/cell limits,
- generation-time only,
- no per-frame or per-simulation-tick hydrology,
- no dependency on loaded chunk order or camera/player position,
- no persistent global basin map,
- no unbounded flood fill.

The repair must preserve hydrological consistency. Do not merely append visual polyline points after a sink if downstream accumulation, flow strength or carving would then disagree with the drainage graph.

Prefer resolving drainage before final accumulation/classification/chain output, or an equivalent architecture that keeps downstream accumulation and the canonical river representation coherent.

### 4. Preserve normal river-tile continuation semantics

Do not redesign river-tile stitching unless recon during implementation proves a separate defect.

Current river chains are owned by a tile core and normally stop at the core boundary while the neighbouring tile owns continuation. The outer hydrology-window `BOUNDARY_EXIT` is not the same thing as normal core-to-neighbour continuation.

The fix must preserve:

- one owner per world-space river point,
- bounded core + halo analysis,
- deterministic tile results,
- existing cache lifecycle,
- current cross-tile continuity mechanism.

Do not convert every `BOUNDARY_EXIT` into a rendered outlet/continuation rule.

### 5. Keep lakes as an optional result, not the first repair strategy

A meaningful river reaching a genuinely closed basin may eventually justify an inland lake/wetland representation, but this plan must first attempt bounded spill/depression resolution and measure how many meaningful closed basins remain.

Do not make "every unresolved sink becomes a lake" part of the mandatory fix.

If implementation recon shows that a minimal lake/basin descriptor fits naturally into the existing hydrology and water architecture without expanding scope materially, it may be included only if it remains:

- deterministic,
- compact,
- bounded,
- generation-time,
- compatible with existing water/terrain mechanisms.

Otherwise record hydrologically valid closed basins as follow-up work rather than building a parallel lake system inside this fix.

## Architecture constraints

Preserve and reuse the existing river pipeline. In particular, do not replace without demonstrated need:

- `sampleFloorAt()` as the analytic geography source,
- D8 flow direction,
- flow accumulation,
- accumulation-based stream classification,
- river tile ownership,
- core + halo analysis,
- `riverTileCache`,
- deterministic smoothing/meandering,
- `flowFactor()`,
- canonical river chains,
- channel carving from the canonical chain,
- the `world-terrain-010` canonical cross-section,
- shoreline queries and river-aware vegetation consumers.

The target architecture remains conceptually:

```text
analytic terrain
      ↓
bounded hydrology region
      ↓
initial D8 drainage
      ↓
meaningful sink detection
      ↓
bounded depression resolution where needed
      ↓
resolved accumulation
      ↓
stream classification
      ↓
canonical river chains
      ↓
carving + water rendering + shoreline consumers
```

Avoid introducing a second hydrology representation or a `RiverManager`/`LakeHydrologyManager` style God Object.

## Performance budget

Performance is a hard constraint.

The solution must not run an expensive basin search for every terrain cell. Prefer a sparse path in which only sinks receiving meaningful accumulated drainage trigger additional analysis.

Do not:

- generate a global hydrology map,
- flood-fill the whole world,
- retain full hydrology grids as persistent simulation state,
- recalculate sink resolution every frame/tick,
- add a Web Worker solely as a precaution.

Reuse the existing bounded river-tile lifecycle and cache. Add worker offload only if profiling shows the bounded repair materially blocks the main thread and communication overhead is justified.

Any basin/depression search must have explicit hard limits so pathological terrain cannot produce unbounded CPU or memory work.

## Regression tests

Add or update deterministic tests covering at least:

- a weak stream ending in a small dry sink may still be dropped,
- a meaningful accumulated river ending in a repairable local depression is preserved through deterministic repair,
- a wet sink / existing water receiver remains valid,
- a river leaving the tile core remains a normal cross-tile continuation,
- repair preserves deterministic output,
- repaired downstream flow/accumulation remains coherent,
- canonical river-chain elevation still descends appropriately,
- existing river-channel/canonical-cross-section invariants remain valid.

Add a higher-level regression test across representative deterministic seeds/tiles that verifies meaningful **inland** river coverage, not merely `totalChains > 0`.

The regression guard should make it difficult for a future terminal change to leave only ocean/coastal river ribbons while silently removing most inland river chains.

## Preserve previous river improvements

The implementation must not regress the earlier river work. Verify that the following contracts continue to hold:

- deterministic river tiles,
- cross-chunk and cross-tile continuity,
- accumulation-derived river width/flow,
- deterministic smoothing and meandering,
- shared chain between water geometry and channel carving,
- `bedY < waterY < bankTopY`,
- `waterWidth < channelWidth`,
- recessed small streams from the canonical cross-section,
- shoreline interaction queries,
- river-channel vegetation exclusion,
- riparian/aquatic vegetation introduced by `world-terrain-010`.

Do not restore the old large visual river Y offset or rendered-terrain sampling as a workaround for hydrology failures.

## Non-goals

This plan does not aim to:

- replace D8 with a new global hydrology solver,
- redesign the full river network,
- generate random replacement rivers,
- tune mountain generation merely to eliminate every depression,
- remove all sinks from the terrain,
- implement full physical water simulation,
- simulate lake filling/evaporation at runtime,
- build a global basin/lake database,
- redesign river shaders,
- revert the canonical river cross-section,
- restore `sampleTerrainY(...) + 0.2`,
- redesign river tile ownership,
- perform unrelated terrain or vegetation refactors.

## Suggested implementation order

1. Add regression diagnostics/tests that quantify dry-sink river loss and inland coverage.
2. Define the smallest explicit meaningful-vs-weak dry-sink policy using existing accumulation/chain data.
3. Implement bounded deterministic depression/spill resolution for meaningful sinks while keeping flow accumulation coherent.
4. Replace the old unconditional dry-sink chain-drop regression test with cases covering weak-drop and meaningful-repair behaviour.
5. Add deterministic multi-seed inland-river regression coverage.
6. Evaluate remaining genuinely closed meaningful basins; only then decide whether a minimal lake descriptor belongs in this plan or a follow-up.
7. Update relevant water/terrain state documentation after implementation reflects the new terminal policy.

When introducing or materially changing important public/architectural hydrology functions, add concise JSDoc where it improves AI preflight discovery; use `@domain world-terrain` where useful.

## Verification

Run the repository's standard technical verification for the affected TypeScript code and tests.

The player performs browser verification. Manual verification should cover several seeds and especially:

- inland plains/valleys,
- mountain drainage,
- river-tile boundaries,
- small streams,
- large accumulated rivers,
- areas that previously showed river ribbons only after reaching ocean/coastal water,
- channel/water alignment after sink repair.

Confirm visually that the fix restores believable inland river continuity without reintroducing rivers that simply disappear on arbitrary dry ground.

## Completion criteria

The plan is complete when:

- meaningful inland river drainage is no longer discarded solely because it reaches a repairable dry D8 sink,
- weak/noisy dry-sink streams may still be filtered,
- repaired drainage remains deterministic and accumulation-consistent,
- no river is visually allowed to terminate arbitrarily on dry land as a workaround,
- inland river coverage has deterministic regression protection,
- river tile ownership/cache architecture remains bounded and unchanged unless a proven defect requires otherwise,
- previous carving/cross-section/rendering/vegetation river improvements remain intact,
- no global or runtime hydrology system has been introduced,
- technical verification passes,
- browser verification is left to the player.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
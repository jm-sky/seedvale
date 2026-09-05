# World Terrain 011 — River Sink Resolution and Inland Drainage Recovery — Implementation Notes

> Recon against current `main` on 2026-09-05. Code is the source of truth. These notes deliberately narrow the implementation path where the plan text leaves alternatives open.

## 1. Actual regression boundary

The regression is in `src/terrain/riverNetwork.ts::buildChains()`, introduced by `world-terrain-006`.

Current extraction walks classified D8 cells inside the owning 256 m river-tile core. If an in-core terminal carries `SINK` or `BOUNDARY_EXIT` without `OCEAN_OUTLET`, `reachedInvalidReceiver` becomes true and the **entire** chain is discarded:

```text
classified chain
  -> dry terminal
  -> reachedInvalidReceiver = true
  -> no RiverChain output
```

This fixed the previous visible bug where rivers could simply stop on dry land, but it converts a local terminal defect into loss of the whole upstream visible chain.

Do not revert `world-terrain-006` wholesale. Its receiver-safety intent is correct; only the all-or-nothing handling of meaningful dry sinks needs replacement.

## 2. `BOUNDARY_EXIT` is not normal river-tile continuation

Do not implement the earlier tempting fix `BOUNDARY_EXIT => keep/continue neighbour tile`.

`computeRiverTile()` analyses a 256 m core with a 384 m halo at 8 m cells:

- `CORE_CELLS = 32`,
- `HALO_CELLS = 48`,
- `WINDOW_CELLS = 128`,
- analysis window = 1024 m per side.

`buildChains()` stops as soon as the D8 walk leaves the **core**. That is the normal cross-tile continuation mechanism: the neighbouring river tile owns the next world-space section. `HydrologyFlag.BOUNDARY_EXIT`, by contrast, is assigned only when D8 leaves the outer boundary of the full 128×128 hydrology window.

Therefore a chain walking from an in-core head normally reaches the core edge hundreds of metres before it could reach the hydrology-window boundary. Treat `BOUNDARY_EXIT` as an analysis-window terminal/incomplete condition, not as the ordinary tile seam mechanism. Preserve the existing core ownership and meander taper.

## 3. Hydrology data ownership and lifecycle

`src/terrain/hydrology.ts::computeHydrologyRegion()` is the correct ownership boundary for drainage conditioning:

- samples `sampleFloorAt()` into a disposable `Float32Array elevation`,
- computes `Int8Array flowDir`,
- stores terminal `Uint8Array flags`,
- computes `Int32Array accumulation`,
- has no Three.js, ChunkManager or persistent world state.

`src/terrain/riverNetwork.ts::computeRiverTile()` is its only production caller. It immediately classifies the returned region and converts it into compact `RiverChain[]`.

`src/terrain/riverTileCache.ts` caches only those compact chains, reference-counted by loaded chunks; it does **not** retain hydrology grids. Keep that contract. A sink-resolution workspace should die with `computeRiverTile()` and must not be added to `RiverTileCache`.

`ChunkManager.retainRiverTilesFor()` retains overlapping tiles before terrain generation, derives `riverChannelSegmentsNear(...)`, and reuses the same chains later for ribbon rendering. Do not change this lifecycle for 011.

## 4. Important algorithmic constraint: a dry sink cannot simply be routed uphill

This is the main implementation trap.

Current river correctness relies on a strong invariant:

```text
RiverPoint.elevation strictly decreases downstream
```

`RiverChannelSegment` then derives water and bed heights from that elevation. `chunkHeightmap.ts` explicitly relies on descending D8 elevation plus non-decreasing accumulation to guarantee downstream-descending `waterH`/`bedH` without another correction pass.

A genuine D8 sink has **no lower neighbour**. Repointing its `flowDir` toward the lowest rim/spill cell without changing the hydrologic elevation would make the chain climb uphill. That would break:

- `riverNetwork.test.ts`'s descending-chain invariant,
- canonical water/bed monotonicity,
- plan 189's continuous-downhill channel contract,
- potentially the terrain carving profile.

So do **not** implement sink repair as only `flowDir[sink] = directionToSpill`.

A repaired dry sink needs one of two physically coherent outcomes:

1. **bounded breach/conditioning** — lower a small working-elevation path through a shallow obstruction, then recompute D8 + accumulation on the conditioned workspace; or
2. **closed basin/lake semantics** — water occupies the depression up to a spill level, with an outlet only when the basin fills to that level.

For 011, prefer the first only for shallow, tightly bounded depressions. Deep/large basins should remain unresolved/follow-up lake candidates rather than being carved into arbitrary canyons.

## 5. Recommended two-pass architecture

The plan asks to repair only sinks receiving meaningful drainage, but meaningfulness is known from accumulation, while correct accumulation should ultimately be computed after repair. The clean solution is a bounded two-pass analysis, not a per-cell expensive search.

Recommended shape inside `hydrology.ts`:

```text
sample raw elevation once
      ↓
raw D8 + raw accumulation
      ↓
find dry sinks with meaningful accumulated inflow
      ↓
for each selected sink:
  bounded shallow-breach probe on working elevation
      ↓
if any working elevation changed:
  recompute D8 + accumulation once
      ↓
return final HydrologyRegion
```

Do not resample the whole terrain for the second pass. Reuse the already allocated elevation/work arrays.

Factor the existing direction/flag and accumulation loops into small pure/internal helpers rather than duplicating them. Useful boundaries would be conceptually equivalent to:

- `resolveFlowDirections(elevation, ...)`,
- `computeAccumulation(elevation, flowDir, flags, ...)`,
- `resolveMeaningfulDrySinks(...)`.

Exact names are flexible. Add concise JSDoc / `@domain world-terrain` to any exported architectural helper; keep repair helpers private unless tests genuinely need a public seam.

## 6. Meaningful sink selection: use terminal accumulation first

Do not classify a sink from a `RiverChain` after extraction: by then `buildChains()` has already fragmented/filtered the graph, and `MIN_CHAIN_POINTS` is explicitly only a rendering-worthiness cutoff.

The best existing signal is `region.accumulation[sinkIdx]`: it is the complete raw catchment cell count reaching that terminal within the bounded analysis window.

Use this as the primary gate for whether a dry sink deserves the extra repair probe. Supporting diagnostics can report chain/inland length later, but they should not be required to discover the sink.

Keep the threshold tied conceptually to existing `StreamThresholds`/river classification rather than introducing an unrelated world-density system. In particular, a sink receiving less than stream-scale accumulation should never trigger expensive repair. If empirical tests show that repair should be reserved for `river` rather than `stream` scale, make that an explicit small policy constant and document why.

Do not use `MIN_CHAIN_POINTS` as a hydrology threshold.

## 7. Bounded shallow-breach probe

The repair should be deliberately conservative. It is not a general global depression solver.

For a selected dry sink:

- search only a bounded neighbourhood inside the already-sampled hydrology window;
- find a low-cost route from the sink/basin to a cell that can drain outside the depression;
- measure required breach depth relative to the raw sampled terrain;
- accept only when path length/cell count and maximum/total cut remain under explicit hard limits;
- deterministically tie-break equal candidates by stable cell/direction ordering;
- modify only a **working hydrology elevation** for accepted shallow breaches;
- reject/leave unresolved if the search reaches its budget, the required cut is too deep, or the basin is too large.

A priority-queue/minimax search (lowest required spill/breach cost first) is a natural fit, but keep it local and sparse; do not priority-flood all 16,384 cells unless profiling and simplicity justify it. The existing D8 direction order provides a stable tie-break convention worth reusing.

The accepted breach profile must descend strictly enough that the recomputed D8 graph has no uphill edge. Avoid equal-height flats unless the implementation also adds a deterministic flat-routing rule; current D8 intentionally requires strictly positive slope.

Do not mutate `sampleFloorAt()` or global terrain generation. Conditioning belongs to the disposable hydrology workspace.

## 8. Hydrologic elevation vs. rendered terrain: keep one coherent chain

If the repair lowers working hydrology elevation along an accepted breach, final `RiverPoint.elevation` must come from the **conditioned final hydrology region**, because that value drives canonical `waterH` and `bedH`.

This is desirable for a shallow breach: the existing `riverChannelSegmentsNear()` → `applyRiverChannel()` stage will physically lower the rendered terrain along the same canonical chain. The channel-carving stage is already lowering-only (`Math.min`) and is the correct place for that visual terrain cut.

However, hard-limit breach depth. A deep conditioned cut would otherwise turn a basin rim into an implausible canyon. That case should not be silently forced through the river-carving system.

Do not add a second `resolvedElevation` field to `RiverPoint` unless implementation proves it necessary. The current architecture benefits from one canonical elevation feeding rendering and carving.

## 9. Recompute, do not patch, accumulation

After an accepted breach changes the drainage graph, recompute accumulation from scratch over the bounded region using the existing iterative typed-array algorithm.

Do not attempt to incrementally subtract/add catchments around the repaired sink. The grid is only 128×128 for production river tiles, and a full linear accumulation pass is cheap relative to terrain sampling and much easier to reason about.

Preserve mass conservation:

```text
sum(accumulation of terminal cells) == cellCount
```

This existing hydrology test is a valuable invariant after repair.

If multiple sinks are repaired, prefer applying all accepted working-elevation changes from the bounded selection phase and then doing **one** final D8/accumulation recompute, rather than recomputing the full region after every sink.

## 10. Avoid repair interactions and cycles

Multiple nearby sinks may belong to the same depression/catchment. A naive loop can probe or modify the same area repeatedly.

Keep a small per-computation typed marker/visited array for cells already claimed/inspected by an accepted repair. If two repair candidates overlap, resolve them in a deterministic order (recommended: higher terminal accumulation first, then lower flat cell index) and let the later candidate re-evaluate or skip the already-conditioned area.

After final recompute, assert/test that every non-terminal edge points in-grid to a strictly lower working elevation and that terminal mass conservation still holds. Do not rely only on the defensive `visited` Set in `buildChains()`.

## 11. `OCEAN_OUTLET` semantics must remain narrow

Current `OCEAN_OUTLET` is slightly misnamed but intentionally means "terminal backed by an existing water body":

- dry sink above `waterLevel` → not an outlet,
- sink at/below `waterLevel` → valid water receiver,
- boundary exit whose outside `sampleHeightAt` is at/below `waterLevel` → valid receiver.

Do not mark a repaired dry sink as `OCEAN_OUTLET` merely to make `buildChains()` keep it. That would hide the topology problem and bypass accumulation correctness.

After a successful breach, the former sink should simply cease to be a sink when final D8 is recomputed. `OCEAN_OUTLET` should continue to describe actual existing water receivers only.

## 12. `buildChains()` should become simpler after hydrology repair, not smarter

Keep `buildChains()` as extraction/representation logic. It should not own basin search, terrain sampling or breach decisions.

After hydrology conditioning, retain receiver safety as a final defensive filter: an unresolved dry terminal must still not render as a finished river. The old `reachedInvalidReceiver` concept can remain as the last guard for unrepaired sinks.

This gives the intended policy without duplicating hydrology rules:

```text
weak/unresolved dry sink
  -> remains SINK
  -> buildChains defensive drop

meaningful shallow repairable sink
  -> hydrology conditioning removes SINK
  -> final accumulation/classification
  -> buildChains extracts normal chain
```

Do not teach `buildChains()` separate strong/weak scoring if the same decision already happened in hydrology.

## 13. Diagnostics: expose only what tests/debugging need

Current production API returns only `RiverChain[]`. Keep that compact contract for `riverTileCache` and ChunkManager.

For regression diagnostics, prefer one of:

- a private/internal stats helper exercised through `hydrology.test.ts`, or
- an optional pure diagnostic function returning aggregate counts from a `HydrologyRegion`, or
- a test-only helper local to the test file.

Do not attach terminal stats, sink lists or basin footprints to every cached `RiverChain`.

Useful metrics across representative real seeds/tiles:

- dry sink count,
- dry sinks with `accumulation >= stream/river threshold`,
- total accumulation captured by dry sinks,
- accepted shallow repairs,
- rejected deep/oversized repairs,
- final inland chain count / inland point or length proxy.

The goal is to prove the regression mechanism and guard it, not to create a runtime telemetry subsystem.

## 14. Tests to change in `hydrology.test.ts`

Preserve existing tests for:

- deterministic region output,
- strictly lower downstream neighbour,
- mass conservation,
- `OCEAN_OUTLET` only on terminal water receivers,
- plausible sink ratio/source candidates.

Add focused synthetic terrain tests for the conditioning step:

1. **weak dry pit** — insufficient accumulated inflow; remains a sink, no repair work accepted;
2. **meaningful shallow depression with low rim** — repair is accepted, former sink gets a valid downstream route after final recompute;
3. **deep/large depression** — exceeds breach budget and remains unresolved rather than producing a deep artificial cut;
4. **determinism** — same synthetic/real region gives identical conditioned elevation/flow/accumulation/flags;
5. **mass conservation after repair**;
6. **strictly descending final flow edges after repair**;
7. **wet sink** — remains a valid `OCEAN_OUTLET` and is not breached unnecessarily.

Use `vi.spyOn(chunkHeightmap, 'sampleFloorAt')` as existing tests already do. Synthetic surfaces are preferable to magic real-world coordinates for algorithm semantics.

## 15. Tests to change in `riverNetwork.test.ts`

The current `world-terrain-006` test explicitly constructs a dry radial basin and expects `computeRiverTile()` to return `[]`. Do not simply delete it. Split its meaning:

- a weak/unrepairable dry terminal must still not produce a river that visibly dies on land;
- a meaningful **shallow repairable** depression should now preserve a chain through the conditioned outlet;
- a meaningful but too-deep basin should remain absent/unresolved until lake semantics exist.

Keep these existing invariants:

- tile determinism,
- all chain points remain inside core,
- chain elevation strictly descends,
- terminal receiver correctness,
- canonical cross-section tests,
- channel segment continuity.

Strengthen the current real-generation smoke test (`totalChains > 0`). Add a deterministic inland-coverage regression over several seeds/tiles. Prefer a robust aggregate such as count/length proxy of chain segments whose canonical/natural elevation is clearly above global `waterLevel`, with generous lower bounds; avoid exact golden chain counts that will become brittle under harmless terrain tuning.

## 16. Cross-tile seam risk after conditioning

This is the highest architectural risk of a local repair.

Neighbouring river tiles compute separate 1024 m hydrology windows. Their core sections overlap only through analysis halos, and accumulation already relies on the large halo to make seam classification agree. A breach near one tile's core edge can be seen from both windows, but candidate significance/repair ordering may differ because each window has different far-upstream coverage.

Mitigations:

- repair decisions must depend on world-space terrain and local bounded basin geometry as much as possible;
- do not seed repair from tile coordinates;
- keep repair radius comfortably smaller than `RIVER_TILE_HALO` so a basin affecting a core edge is fully visible in both neighbouring analyses;
- use accumulation only as an eligibility gate, not to choose a different geometric breach route once eligible;
- keep deterministic world/grid tie-breaking;
- retain existing endpoint/meander taper behaviour.

Add a seam regression using adjacent tiles around a known/synthetic repairable depression if practical. At minimum, extend the existing endpoint-continuation tests so repaired chains do not introduce a new gap at a tile edge.

If a basin cannot be resolved consistently within a radius well below the 384 m halo, reject it as out of scope rather than expanding analysis globally.

## 17. Performance and memory budget

Production river tile currently samples a 128×128 = 16,384-cell hydrology grid. Existing persistent arrays are compact typed arrays (`elevation`, `flowDir`, `accumulation`, `flags`) and are discarded after chain extraction.

Keep additional repair memory O(cellCount) with reusable typed arrays at most — e.g. one working elevation plus marker/cost/predecessor storage if required. Do not allocate `{x,z,...}` objects per grid cell.

The expensive path should be sparse:

```text
raw D8/accumulation
  -> small list of meaningful dry terminals
  -> bounded probes only for that list
  -> one final D8/accumulation recompute if changed
```

No per-frame/tick work. No global cache. No worker in this plan unless profiling after the bounded implementation shows a material main-thread regression. `riverTileCache` already ensures a loaded tile is computed once and shared.

Avoid `Set<number>`/object-heavy search structures inside large basin probes if a typed marker array + numeric heap/queue is straightforward. `buildChains()`'s per-chain `Set` is not a model for a potentially larger hydrology search.

## 18. Lakes are a follow-up unless the repair proves they are unavoidable for correctness

The current local lake/ocean system (`waterBodies.ts` / chunk `bodyScale`) is not a stable cross-chunk hydrologic basin identity. `world-terrain-010` notes explicitly warn against treating it as one.

Do not make a new global lake registry while implementing 011.

For a deep/large closed basin rejected by the shallow-breach budget, the correct 011 result is:

```text
meaningful closed basin
  -> unresolved dry sink
  -> no arbitrary dry-ending river
  -> diagnostic/follow-up lake candidate
```

If real-seed diagnostics show that most lost important rivers end in such genuine basins, stop and report that evidence rather than weakening breach limits. That would justify a separate hydrologic-lake plan (basin fill/spill level + cross-chunk water representation) instead of turning 011 into a large hidden lake system.

## 19. Files expected to change

Primary:

- `src/terrain/hydrology.ts` — factor raw D8/accumulation helpers; meaningful dry-sink selection; bounded shallow conditioning; final recompute.
- `src/terrain/hydrology.test.ts` — synthetic repair semantics, determinism, mass/descending invariants.
- `src/terrain/riverNetwork.test.ts` — replace all-or-nothing dry-sink expectation with weak/unrepairable vs shallow-repairable cases; inland coverage regression.

Likely small/no behavioural change:

- `src/terrain/riverNetwork.ts` — ideally only comments/JSDoc or defensive terminal handling; keep chain extraction, smoothing, meandering, cross-section logic intact.

Documentation after implementation:

- `docs/state/water.md` — record final dry-sink policy, bounded conditioning and measured constraints.
- `docs/state/terrain-and-world-generation.md` / `docs/STATE.md` only if their short architecture summary becomes inaccurate.

Files that should **not** need changes for the hydrology fix unless a failing invariant proves otherwise:

- `src/terrain/riverTileCache.ts`,
- `src/terrain/chunkManager.ts`,
- `src/terrain/chunkHeightmap.ts` / `applyRiverChannel()`,
- `src/world/riverGeometry.ts`,
- `src/world/riverWaterMaterial.ts`,
- vegetation placement/batching.

A need to modify those is a signal to re-check whether the repair is leaking out of its intended ownership boundary.

## 20. Implementation sequence

1. Refactor `computeHydrologyRegion()` internally so elevation sampling, D8/flags and accumulation can be rerun without resampling terrain; keep behaviour identical first.
2. Add diagnostics/tests that demonstrate meaningful accumulation currently terminating in dry sinks and establish non-brittle real-seed inland coverage.
3. Add meaningful-sink eligibility from raw terminal accumulation.
4. Implement the bounded shallow-breach/conditioning probe with hard radius/cell/cut-depth limits and deterministic tie-breaking.
5. Apply accepted conditioning to the working elevation, recompute D8 + accumulation once, and verify mass/strict-descent invariants.
6. Update `riverNetwork.test.ts` terminal cases; keep unresolved/deep sinks receiver-safe while preserving shallow repairable rivers.
7. Add/extend adjacent-tile and inland-coverage regression tests.
8. Measure `computeRiverTile()` cost before/after on representative seeds/tiles. Only consider a worker if the bounded repair materially worsens the already synchronous tile-generation cost.
9. Update `docs/state/water.md` with the implemented policy and measured limits/results.
10. Leave browser verification to the user: follow several restored inland rivers, inspect repaired shallow outlets, tile seams, channel depth/alignment and ensure no river visibly ends on arbitrary dry ground.

## 21. Stop conditions / do not paper over failures

Stop and reconsider rather than broadening the fix if recon during implementation shows any of these:

- important sinks commonly require breach radius near/exceeding the 384 m halo;
- accepted breaches require large terrain cuts that read as artificial canyons;
- neighbouring tiles choose different breach geometry for the same basin;
- most meaningful dry sinks are genuine large closed basins;
- final conditioned chains cannot preserve strict downstream water/bed descent without a second elevation representation;
- synchronous river-tile cost increases enough to harm streaming despite sparse bounded probes.

Those are evidence for a separate basin/lake or hydrology-architecture plan, not reasons to remove limits, restore arbitrary dry endings or add global state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

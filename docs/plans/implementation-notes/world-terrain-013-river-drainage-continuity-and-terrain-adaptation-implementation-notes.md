# World Terrain 013 — River Drainage Continuity and Terrain Adaptation — Implementation Notes

> Recon against `main` at `1b2899554ba22a03caf9a62fc236a91995668dc6` on 2026-09-05. Current code wins over plan text.

## 1. Start with extraction diagnostics, not more carving

The visible coastal gap does **not** yet prove a hydrology failure. There is one especially important current-code hypothesis to test first in `src/terrain/riverNetwork.ts::buildChains()`:

- `MIN_CHAIN_POINTS = 8` is applied to every **tile-local** raw chain fragment;
- a river entering a neighbouring 256 m core is intentionally treated as a new local head because `hasClassifiedUpstream` only considers classified **core** cells;
- therefore a perfectly valid downstream continuation can be discarded if the fragment from the core edge to its water receiver is shorter than 8 D8 cells (~64 m at `RIVER_CELL_STEP = 8`).

This can create exactly the class of visible gap described by the plan without any dry sink. Add a focused synthetic/diagnostic test for “classified continuation enters core → short fragment → valid water receiver”. If confirmed, fix the extraction rule rather than hydrology.

Do not simply lower/remove `MIN_CHAIN_POINTS`: it is still useful for isolated threshold-noise blips. Prefer distinguishing an isolated local source from a chain that has classified halo/upstream inflow or otherwise demonstrably continues existing meaningful drainage.

Other `buildChains()` stops worth instrumenting before changing policy:

- core exit — normal ownership hand-off;
- `SINK` / `BOUNDARY_EXIT` with and without `OCEAN_OUTLET`;
- `classes[curIdx] === 0`;
- defensive `visited` break;
- final `MIN_CHAIN_POINTS` rejection.

Within one final `HydrologyRegion`, accumulation is non-decreasing downstream, so a classified → unclassified transition should not be treated as normal behaviour; if observed, investigate ownership/recompute assumptions rather than adding a workaround.

## 2. Current hydrology repair is narrower than the new plan requires

`src/terrain/hydrology.ts` already has the correct ownership boundary from `world-terrain-011`:

```text
sampleFloorAt
→ raw D8 + accumulation
→ resolveMeaningfulDrySinks
→ optional conditioned elevation
→ one final D8 + accumulation recompute
→ HydrologyRegion
```

Keep this shape. `computeRiverTile()` is the production caller and passes `thresholds.stream` as `minAccumulationForRepair`; `RiverTileCache` must continue caching only compact `RiverChain[]`, never hydrology grids/workspaces.

Important current implementation details:

- `findBreachPath()` accepts only elevation + budgets; it does **not** currently know `flowDir`, terminal flags or receiver validity;
- escape success is currently just “found a cell below the original sink elevation”;
- it therefore does not prove that the chosen escape drains to an actual water receiver or even avoids another unresolved dry sink;
- the code comment describes a minimax/cheapest-rim search, but the implementation does not maintain a path cost or relax predecessors: it chooses the currently lowest-elevation frontier cell and fixes predecessor on first discovery. Do not assume this already implements the plan's cost-based outlet selection.

If 013 needs terrain adaptation beyond 011, extend this mechanism rather than adding another carver.

## 3. Add receiver-aware downstream reasoning before widening search

A cheap downstream probe should operate on the already computed `HydrologyRegion` and follow D8 topology with a hard step cap. It should answer only terminal/continuity questions, for example:

- reaches `OCEAN_OUTLET`;
- reaches dry `SINK`;
- reaches hydrology-window `BOUNDARY_EXIT`;
- exits the river-tile core normally;
- exceeds the bounded probe budget.

Keep it pure and allocation-light. Do not generate neighbouring tiles/chunks and do not BFS for nearest water.

For breach candidate evaluation, a lower escape cell is not enough. Prefer escape candidates whose existing downstream topology resolves to a valid receiver or clearly lower continuing drainage. If receiver-aware validation cannot be proven within the bounded workspace, reject rather than manufacture an outlet.

## 4. Cost-based terrain adaptation: evolve `findBreachPath()`, do not bolt on a second search system

The current options are already the right public policy surface:

- `maxSearchCells`;
- `maxPathCells`;
- `maxCutDepth`;
- `maxTotalCut`;
- `minAccumulationForRepair`.

013 should preserve those concepts and, if needed, make candidate ranking actually reflect terrain cost. A useful deterministic ordering is based on a tuple such as:

```text
(max cut depth, total cut, path cells, receiver quality, stable cell index)
```

or another explicit monotonic cost function with the same intent. Geometric distance alone must not win over a much shallower route.

Any accepted path must still lower only the disposable hydrology `elevation`, then use the existing single final `resolveFlowDirections()` + `computeAccumulation()` recompute. Never patch only `flowDir` uphill.

Current `BREACH_MIN_STEP = 0.02` is what guarantees a strictly descending conditioned profile. Preserve the descending invariant unless the D8 flat-routing model is deliberately redesigned (out of scope).

Small implementation-contract mismatch to be aware of: `findBreachPath()`'s `reversePath` includes the sink cell even though comments/options describe path length as interior cells. `maxPathCells` therefore currently counts differently than the prose suggests. Clarify/fix this before tuning new budgets so tests and production policy use one definition.

## 5. Keep water receiver semantics exactly where they are

`HydrologyFlag.OCEAN_OUTLET` currently means a terminal backed by actual water, despite the historical name:

- wet sink: own conditioned/raw floor at/below `waterLevel`;
- boundary exit: outside drainage sample resolves at/below `waterLevel`.

Do not set it merely because a dry chain should survive extraction. After a successful breach, the former sink should simply cease to be a sink after the final D8 recompute.

The existing `sampleHeightAt()` check for an off-window receiver and `sampleFloorAt()` hydrology source are part of the current water/height semantics; reuse them rather than introducing a separate coastline test.

## 6. River-tile ownership is already deliberate

Current production geometry:

- `RIVER_TILE_SIZE = 256`;
- `RIVER_TILE_HALO = 384`;
- `RIVER_CELL_STEP = 8`;
- hydrology window = 128×128 cells = 1024 m square.

`buildChains()` stops at the **core** edge; that is normal continuation. `BOUNDARY_EXIT` is only the outer hydrology-window boundary and should remain an incomplete-analysis terminal, not a tile seam signal.

Conditioning near a core edge is the main consistency risk because adjacent tiles have different 1024 m analysis windows and therefore potentially different accumulation totals. Keep the 011 rule: accumulation may gate whether a repair is meaningful, but once eligible the geometric/cost decision should depend on local world-space terrain and stable tie-breaks, not tile coordinates or far-upstream accumulation magnitude.

Do not render halo-owned geometry and do not add persistent cross-tile river state for this plan.

## 7. Preserve the canonical river representation

Do not change the downstream consumer model unless diagnostics prove it necessary:

- `RiverPoint.elevation` comes from final conditioned hydrology;
- `riverChannelSegmentsNear()` derives canonical bank/water/bed from the same chain;
- `chunkHeightmap.ts` channel carving consumes those same segments and lowers terrain only;
- river rendering, shoreline interaction, vegetation rejection and water-depth consumers all rely on that canonical geometry.

A second “terminal connector”, coast snap or renderer-only extension would desynchronise carving and water/gameplay geometry.

## 8. Tests that provide the most value

Prefer extending `src/terrain/hydrology.test.ts` and `src/terrain/riverNetwork.test.ts`; the synthetic terrain helpers added by 011 are already suitable.

High-value additions:

1. **Short valid continuation across core ownership** — entering classified flow with <8 local points to a real water receiver must not disappear if diagnostics confirm `MIN_CHAIN_POINTS` is the cause.
2. **Isolated short noise still filtered** — guards against weakening the rendering cutoff globally.
3. **Existing D8 route to receiver** — downstream probe reports receiver with zero conditioning.
4. **Escape to lower terrain but unresolved dry sink** — must not count as successful receiver-aware repair.
5. **Two repair routes** — shorter/deeper vs longer/shallower; verify the explicit terrain-cost policy.
6. **Budget rejection** — nearby water behind an excessive cut remains unresolved.
7. **Adjacent/core-edge case** — no duplicated geometry and deterministic ownership after conditioning.
8. Keep existing invariants: strict descent, terminal mass conservation, determinism, truthful `OCEAN_OUTLET`, inland coverage.

Do not add a brittle seed-3 golden until the actual tile/river coordinates are known. Seed `3` remains browser verification by the player.

## 9. Likely files

Primary:

- `src/terrain/hydrology.ts`
- `src/terrain/hydrology.test.ts`
- `src/terrain/riverNetwork.ts`
- `src/terrain/riverNetwork.test.ts`

Read/verify contracts, likely little or no behavioural change:

- `src/terrain/riverTileCache.ts`
- `src/terrain/chunkHeightmap.ts`
- `docs/state/water.md`
- `docs/plans/world-terrain-011-river-sink-resolution-and-inland-drainage-recovery.md`
- `docs/plans/implementation-notes/world-terrain-011-river-sink-resolution-and-inland-drainage-recovery-implementation-notes.md`

## 10. Recommended implementation order

1. Instrument/test exact `buildChains()` terminal/filter reasons.
2. Reproduce the short downstream-fragment case and determine whether it explains the regression class before touching breach policy.
3. Fix proven extraction/ownership continuity defects first, preserving isolated-noise filtering.
4. Add a bounded D8 downstream/receiver probe only if needed by the diagnosed cases.
5. Make breach selection receiver-aware and genuinely cost-based only for remaining meaningful dry sinks/barriers.
6. Keep one final D8 + accumulation recompute and the existing canonical chain/carving path.
7. Add cross-tile + deterministic invariants; update `docs/state/water.md` only after the final behaviour is established.

Do not run `pnpm docs:sync` manually; GitHub workflow owns generated-doc synchronization.

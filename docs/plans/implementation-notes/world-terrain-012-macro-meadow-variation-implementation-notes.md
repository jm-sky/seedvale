# Implementation notes — world-terrain-012 macro meadow variation

## Relevant code

- `src/terrain/grassPlacement.ts`
  - owns deterministic, worker-safe grass placement and per-instance colour generation,
  - already imports `createNoise2D`, `createSeededRandom`, `fbm01` and keeps a per-seed `speciesNoiseCache`,
  - `computeChunkGrass()` works in world coordinates (`wx`, `wz`) and is the correct place for a chunk-seam-free macro signal,
  - current colour path already interpolates terrain/biome-related grass tints and then applies per-instance HSL jitter in `pushInstance()`,
  - existing species patch noise is for `tri`/`grain`/`herb` distribution; do not overload that signal if it makes species composition and macro colour variation unintentionally correlated.

- `src/terrain/grass.ts`
  - presentation layer only: shared species geometries/materials + `InstancedMesh` buckets,
  - should not need new meshes/materials/buckets for this feature,
  - benchmark invariant should remain the same instance/draw-call/triangle structure.

- `src/config/worldConfig.ts`
  - `WorldConfig.terrain.grass` currently owns `enabled`, `radius`, `density`,
  - add the boolean feature switch here with an explicit default,
  - this config is already shared by debug GUI and benchmark runner.

- `src/ui/createDebugGui.ts`
  - existing Grass folder exposes `config.terrain.grass.density` and routes terrain-affecting changes through `handlers.onTerrainChange`,
  - add the macro-variation checkbox beside the existing grass controls and reuse the same rebuild lifecycle unless current code offers a narrower grass-only rebuild path.

- `src/perf/benchmark.ts`
  - benchmark runner receives live `WorldConfig`, runs canonical scenarios with controlled quality, preloads chunks, warms up, measures, then records context/census,
  - add the macro-variation state to benchmark/report context (directly or through the existing monitor-context mechanism) so exported A/B reports self-identify,
  - do not add a new scenario just for this feature.

- `docs/reviews/2026-08-18--020--water-grass-gpu-benchmark.md`
  - useful baseline precedent: `current` had 315,789 grass instances and 84 grass draw calls; geometry LOD changed grass triangles without changing instance/draw-call counts,
  - its conclusion is important for interpretation: raw FPS can drift with host load, while census/structural metrics are stable. Treat matching scene census and repeated timings as stronger evidence than one FPS delta.

## Architectural decisions

1. Keep macro meadow variation entirely inside the existing grass generation/colour path.
2. Use a dedicated deterministic low-frequency world-space signal keyed by world seed. A separate noise salt/cache is preferable to coupling colour regions to the existing species patch noise.
3. Apply the macro result before the existing fine HSL jitter so the large region remains readable while individual instances still vary.
4. Disabled mode should avoid the extra noise/FBM sample rather than calculating it and multiplying by zero; the benchmark switch is intended to measure the real incremental CPU generation cost.
5. The toggle changes generated per-instance colour data, so rebuilding affected grass/chunks is acceptable. Do not invent per-frame mutation of instance colours only to make the checkbox live.
6. Keep season work (`world-terrain-009`) orthogonal. Spatial macro tint should be generated/stored as the base instance colour; future seasonal modulation can remain a shared render-time presentation effect on top.

## Suggested implementation order

1. Extend `WorldConfig.terrain.grass` and defaults/tests with `macroVariationEnabled`.
2. Add a dedicated macro meadow signal/helper in `grassPlacement.ts` and integrate it into existing tint generation behind the flag.
3. Thread the boolean through the existing grass worker/request parameters rather than reading global config from worker code.
4. Add the lil-gui checkbox using existing terrain-change/rebuild handling.
5. Add the flag to benchmark report context.
6. Add focused deterministic/bounded tests and confirm disabled mode keeps placement counts unchanged.

## Performance trap to avoid

The desired visual effect does not justify extra species buckets, extra `InstancedMesh` objects or an additional dense sampling grid. One low-frequency sample per accepted/candidate grass position in the existing worker path is the intended baseline. If FBM proves unnecessarily expensive, benchmark a single simplex sample before considering more elaborate caching; do not pre-optimise with a parallel macro-field cache unless measurement shows generation cost is material.

## Verification boundary

Automated checks and benchmark instrumentation belong to implementation. Visual judgement of patch size, yellow/green balance and transition quality is manual browser verification by the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

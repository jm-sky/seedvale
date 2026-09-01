# Implementation Notes: Mountain Peaks & Mountain Massifs

**Plan:** [2026-08-21--191--mountain-peaks-and-massifs.md](./2026-08-21--191--mountain-peaks-and-massifs.md)

**Review basis:** current `main` codebase, `docs/STATE.md`, terrain state and the implemented 181 changes. Code is authoritative when it differs from the plan.

## 1. Current implementation to extend

Plan 181 is already implemented for the mountain portion. Do **not** start from the older picture in the plan:

- `src/terrain/chunkHeightmap.ts` already has independent `continent` and `mountain` macro noise fields.
- `sampleRawTexel()` already builds the current mountain shape as:
  `continentalness → land gate → mountain FBM gate → Worley ridge → hills/local detail`.
- `mountainRidge` is already a worker-safe, deterministic 0..1 field exposed through `sampleMountainRidgeAt()` and consumed by terrain/environment systems.
- `worleyRidge()` is the existing connected-ridge primitive; it is intentionally world-space and seed-global.
- Current defaults from `worldConfig.ts`: `mountainScale=1800`, `mountainThreshold=0.62`, `mountainThresholdWidth=0.2`, `worleyCellSize=400`, `ridgeSharpness=1.4`, `mountainGain=1.8`.
- Chunk generation already runs through the existing worker pipeline and uses apron samples for seam-safe normals.

The actual missing piece is therefore **composition/hierarchy inside the existing mountain field**, not another mountain generator.

## 2. Recommended mountain model

Keep one analytic terrain function. Prefer reshaping the existing hierarchy rather than adding a `MountainSystem`, global mountain map, per-chunk mountain state, or object scatter.

Target concept:

```text
continent / land gate
        ↓
large mountain-region envelope
        ↓
connected Worley ridge structure
        ↓
medium hills/valleys
        ↓
peak dominance / controlled irregularity
        ↓
local detail (already damped on ridges)
```

The existing `mountain` FBM should remain the macro envelope. `worleyRidge()` should remain the connected structural field. A peak should be a **height modulation of an existing massif/ridge**, not a separate mesh/object or independent world feature.

If another noise evaluation is needed for peak variation, first check whether the existing `mountain`/`hills` fields can be reused at a different frequency or through an existing FBM call. Avoid adding another permanent noise handle unless tuning proves it necessary.

## 3. Massifs, valleys and passes

The current `ridge01 * mountainGate` gives connected ridges but does not itself establish a strong hierarchy of broad massifs → subordinate ridges → valleys → dominant peaks.

Prefer these changes in `sampleRawTexel()`:

- broaden the mountain envelope before the ridge contribution becomes strong;
- use the existing `hillsTerm` more deliberately inside mountain regions to create lower saddles/valleys between major forms;
- keep the ridge field continuous across the world;
- vary mountain contribution by the macro mountain envelope so an entire massif can rise/fall instead of every ridge reaching a similar height;
- keep transitions smooth with `smoothstep`/bounded interpolation rather than hard thresholds.

Do not flatten the whole mountain contribution to solve bad peaks. The desired result is broader terrain with lower connecting terrain and a few stronger maxima.

A useful invariant is: **the highest point of a massif should be produced by the same terrain function as the surrounding massif, with neighbouring ridge/valley terrain remaining continuous.**

## 4. Peak shaping

Do not create peaks from standalone radial falloffs. That would reintroduce the "cones/pyramids" problem explicitly excluded by the plan.

Peak shaping should operate on existing mountain geometry and be bounded by the mountain envelope. Suitable ingredients are:

- low-frequency modulation of ridge amplitude;
- existing hills/valleys to lower saddles between peaks;
- restrained high-altitude detail;
- a smooth, asymmetric modulation rather than a radial stamp.

Different peak profiles should emerge from the same deterministic field. If explicit peak classification is introduced, keep it numeric/analytic and derived from terrain fields; do not persist peak objects or generate meshes for them.

## 5. Preserve `mountainRidge` semantics

`ChunkTileData.mountainRidge` and `sampleMountainRidgeAt()` are existing shared terrain queries. Other systems use this signal for environmental/placement decisions. Do not silently change it into a completely different semantic field.

If it is changed from "ridge strength" to a composite "mountainness" value, audit all consumers first and either preserve the old meaning or update the contract deliberately. Prefer keeping `mountainRidge` as the connected ridge-strength signal and keeping peak/massif modulation internal to height calculation unless a consumer actually needs it.

## 6. Chunk continuity and analytic sampling

The most important existing seam contract is already correct:

- all noise handles are seed-global;
- terrain is evaluated from `(seed, worldX, worldZ)`;
- no chunk-local seed/randomness;
- apron samples are used for normals;
- `sampleHeightAt()` / `sampleFloorAt()` use the same analytic function as chunk generation.

Any new mountain term must satisfy the same contract. Never derive peak positions from chunk coordinates or from the currently loaded chunk set.

Do not add a cached per-chunk mountain layout. A cache can be added later for performance only if its result is a pure function of the same world-space inputs.

## 7. Integration with existing systems

Reuse the existing pipeline unchanged:

```text
world-space sampleRawTexel()
        ↓
computeChunkTile()
        ↓
existing chunk worker protocol
        ↓
ChunkManager
        ↓
terrain mesh / biome / rocks / vegetation
```

There is no need for a new terrain worker or a new mountain pass.

Existing integrations should automatically benefit from the improved height field:

- slope and movement already sample terrain height/slope;
- biome/material placement already consumes mountain-related terrain fields;
- rock placement already uses the existing environment pipeline;
- rivers/hydrology from 181 consume the terrain geography and should not get a separate mountain representation.

Do not add special mountain rock generation. If steep/high terrain needs different rock density or species, extend the existing rock/environment predicates only where the current inputs are insufficient.

## 8. World config / persistence

New tunables belong in `WorldConfig.terrain.region` only when they represent a genuinely independent control. `applyStoredTerrain()` intentionally merges fields individually so new config fields can be introduced safely.

Prefer re-tuning the existing parameters first:

- `mountainScale`
- `mountainThreshold`
- `mountainThresholdWidth`
- `worleyCellSize`
- `ridgeSharpness`
- `mountainGain`
- `hillsScale`
- `hillsAmplitude`

Do not add several knobs merely to expose every implementation detail. A small parameter surface is easier to tune across seeds and avoids config/save compatibility churn.

## 9. Important interaction with rivers

Plan 181's river system is already implemented as a downstream consumer of deterministic terrain/hydrology. Plan 191 must not introduce a second terrain representation or alter river ownership.

Mountain changes can legitimately change river drainage because they change the sampled terrain. Therefore verify river continuity/flow after mountain tuning, especially around valleys and passes. Do not compensate by modifying river geometry independently.

Likewise, do not make mountain generation depend on river paths; that would create a circular dependency and violate the terrain sampler contract.

## 10. Performance traps

`sampleRawTexel()` is hot code: it runs for every terrain texel in worker generation and is also used by analytic height queries. Avoid:

- allocations inside the sample loop;
- per-sample object creation;
- new Three.js objects;
- expensive searches over nearby peaks/massifs;
- per-chunk seeded RNG;
- additional noise fields without evidence they are needed.

A second/third FBM evaluation can materially affect chunk generation because the terrain is sampled many times. Prefer reusing existing noise handles and fields, then benchmark before adding another expensive field.

Do not trade CPU cost for more geometry. Mountain shape is primarily a heightfield change; existing terrain resolution/LOD should remain the rendering control.

## 11. Suggested implementation order

1. Inspect the exact current `sampleRawTexel()` mountain combination and all `mountainRidge` consumers.
2. Tune the existing macro envelope + Worley ridge + hills combination to establish massif/valley hierarchy.
3. Add only the minimum deterministic peak modulation needed for clear dominant peaks.
4. Keep `mountainRidge` contract stable unless a consumer audit justifies a contract change.
5. Verify several seeds before introducing additional parameters/noise.
6. Measure worker/chunk generation cost against the current baseline.
7. Verify mountain/rivers/rocks/biomes at chunk boundaries and from gameplay camera height.

## 12. Verification focus

The visual checks should specifically look for:

- broad connected massifs rather than repeated individual hills;
- valleys and saddles separating major peaks;
- a clear height hierarchy inside one massif;
- asymmetric/irregular silhouettes, not cones or pyramids;
- smooth foothills and transitions;
- no seam at streamed chunk boundaries;
- unchanged deterministic output for the same seed;
- no obvious degradation of river paths, rock placement or biome transitions.

For performance, compare terrain/chunk generation time and streaming hitching before/after. Do not infer performance from draw calls alone; the mountain feature changes the heightfield, not necessarily draw-call count.

Technical verification and browser/manual verification should remain separate, as required by the plan.

## 13. Implemented (2026-09-01)

All changes are confined to `sampleRawTexel()` in `src/terrain/chunkHeightmap.ts` — no new noise handle, worker, config field, or `mountainRidge` semantic change. `mountainRidge`'s returned value is untouched; only the height computation (`nCombined`) that consumes it changed.

- **Massif amplitude variety** — `envelopeStrength = smoothstep(mt, mountainThreshold + mountainThresholdWidth, 1)` (reuses the already-computed `mt` field, no extra noise call) feeds `massifGainFactor` (`MASSIF_ENVELOPE_MIN_GAIN`/`MAX_GAIN` = 0.8/1.25). This lets whole massifs read as taller or more modest depending on how far `mt` sits past the existing gate's blend band, instead of every gated massif converging on the same ridge height.
- **Peak dominance** — one extra `fbm01` call reusing the `mountain` noise handle at `mountainScale * PEAK_DOMINANCE_SCALE_FACTOR` (0.4, i.e. a finer sub-massif frequency), smoothstepped into `peakDominance` (`PEAK_DOMINANCE_THRESHOLD`/`_WIDTH` = 0.55/0.3). This scales ridge gain per-point between `PEAK_DOMINANCE_MIN_GAIN`/`MAX_GAIN` (0.55/1.3), so a handful of zones per massif dominate while the rest stay subordinate. Gated behind `mountainGate > 0` so this costs nothing outside mountain regions.
- **Peak detail** — a second extra `fbm01` call reusing the `hills` noise handle at `hillsScale * PEAK_DETAIL_SCALE_FACTOR` (0.5), added as `peakDetailTerm`, weighted by `peakDominance * mountainRidge * PEAK_DETAIL_AMPLITUDE` (0.4) — only visible on/near actual dominant peaks, restrained elsewhere. Gated behind `peakDominance > 0`, itself inside the `mountainGate > 0` branch.
- **Valleys/saddles** — `hillsTerm` now carries `hillsMountainBoost = mountainGate * (1 - mountainRidge) * HILLS_MOUNTAIN_VALLEY_BOOST` (1.2), reusing the already-computed `hills01`/`mountainGate`/`mountainRidge` (zero extra noise calls). Boost peaks in the "in-between" ground of a massif (envelope active, ridge weak) and fades to 0 both on strong ridge crests and outside mountain regions — deepens saddles without fighting the Worley ridge shape.
- Every new term is bounded and multiplies through `mountainGate`/`mountainRidge`/`peakDominance`, all of which are themselves continuous `smoothstep`/FBM functions of `(seed, wx, wz)` — no hard thresholds were introduced, so the seam/determinism contract (`sampleHeightAt`/`sampleFloorAt` use the same function as chunk generation, no chunk-local state) holds by construction.
- Extra `fbm01` evaluations (peak dominance, peak detail) only run when `mountainGate > 0`, i.e. inside/near mountain regions — no added cost across ocean/plains/desert/swamp.

## 14. Technically verified (2026-09-01)

- `npx tsc --noEmit` — clean.
- `pnpm lint:fix` — clean, no changes needed beyond the edit itself.
- `pnpm test` (full suite, 224 files / 2236 tests) — all pass. `grassPlacement.test.ts`'s golden snapshot (`computeChunkGrass`, locks in current terrain output) was intentionally updated (`vitest -u`) since the height field change is the intended effect of this plan; no other snapshot/behavioral test needed updating, and `chunkHeightmap.test.ts`'s seam-continuity/determinism tests passed unmodified.
- `pnpm build` — clean production build.

## 15. Not yet verified — needs browser/manual pass

- Visual appearance of massifs/peaks across several seeds.
- Peak silhouettes from ground level (irregular vs. cone-like).
- Valley/pass readability between dominant peaks.
- Chunk-boundary seams during streaming (expected seamless per the analytic-function argument above, but not eyeballed).
- Terrain/chunk generation time and streaming hitching with the two extra gated `fbm01` calls in mountain regions.
- River continuity through the reshaped mountain terrain (plan 181's rivers consume this same height field).

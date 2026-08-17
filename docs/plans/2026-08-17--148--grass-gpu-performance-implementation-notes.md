# Implementation notes — Plan 148 (Grass GPU performance and geometry LOD)

**Status:** S (Geometry LOD) implemented and technically verified (tsc/build/test green). No browser/benchmark verification yet — see "Not yet done". M (density LOD tuning) and M (far shader simplification) are explicitly gated on S's benchmark result per the plan's own ordering and were not started.

## What changed (S — Geometry LOD)

The plan's own "Ustalenia z analizy" already established the actual repo shape before implementation: grass renders through `InstancedMesh` buckets with shared geometry/material — the cost is vertex processing per instance, not draw-call submission — and the existing distance LOD (`src/terrain/distanceLod.ts`'s `densityLodFraction`) only narrows `InstancedMesh.count`, leaving every instance's geometry (24–36 triangles/instance depending on species) unchanged regardless of distance. That matched the plan's premise exactly, so no scope adjustment was needed against the codebase.

- `src/terrain/distanceLod.ts` — new `grassGeometryLodTier(dist, radius): 'near' | 'mid' | 'far'`, reusing `densityLodFraction`'s own near-field breakpoint (`t <= 0.35`) as the near/mid line and `t <= 0.7` as mid/far, so geometry LOD's thresholds are anchored to the existing density curve instead of an independent, uncoordinated one (plan requirement: "Ustalić progi LOD na podstawie istniejącego distance LOD"). Purely a function of `(dist, radius)` — not `lodScale` — so quality-preset changes (`setLodScale`) don't need to touch geometry tier.
- `src/terrain/grass.ts`:
  - For each of the three non-filler species (`tri`/`grain`/`herb`), added `mid`/`far` fin-cluster variants alongside the existing (now implicitly "near") one: `withSegments()` overrides each fin's `segments` (bend-resolution triangle count) to `2` (mid) / `1` (far), keeping the same fin arrangement/silhouette so a LOD transition doesn't visibly change the blade's outline, only its curve resolution. `grain`'s far variant additionally drops the third (peeling-leaf) fin, since a 2-fin stem cross is the minimal recognizable shape for that species — the leaf fin at 1 segment would just be a flat triangle with no shape to read.
  - The `filler` bucket is untouched — it stays the single existing cheap near-only shape, exactly as the plan requires ("Zachować istniejący filler jako osobny, tani near-field bucket"); `WorldGrassChunk.setGeometryLod` is a no-op on it.
  - `WorldGrassChunk` gains `setGeometryLod(tier)`, orthogonal to the existing `setLodFraction(mainFrac, fillerFrac)` (instance-count LOD is unchanged and still applies on top). Per species bucket, `buildGrassChunkMeshes` now builds `BufferGeometry` **per tier, lazily and cached** (`geometryForTier`/`geometryCache`): a chunk built already `mid`/`far` away never pays for the `near` geometry it won't use, and re-entering a previously visited tier is a cheap reference swap rather than a rebuild. The four per-instance attributes (`aPhase`/`aBaseColor`/`aTipColor`/`aWindFactor`) are constructed once per bucket and attached **by reference** to every tier's geometry — three.js's `WebGLAttributes` caches GPU buffers by attribute object identity, so the same instance data uploads once regardless of how many tier-geometries reference it; only the tiny position/index buffers differ per tier and get cloned from a system-level template cache (`tieredTemplate`, keyed `species:tier`, built once per tier ever touched across the whole grass system, not once per chunk).
  - `dispose()` now iterates every tier geometry actually built for a bucket (not just the currently-active one) and disposes each — safe to dispose the shared instanced attributes more than once, since three.js's disposal path is keyed by attribute identity and no-ops past the first free.
- `src/terrain/chunkManager.ts` — `grassLodForDistance` now also returns `geometryTier` (`grassGeometryLodTier(dist, effectiveGrassRadius)`); the three call sites that already apply `setLodFraction` per chunk (initial grass-worker resolution, `syncGrassForRecord` on player movement, and the `setLodScale` quality-preset sweep) call `setGeometryLod` alongside it. The `setLodScale` site was left calling only the existing density fraction — geometry tier doesn't depend on `lodScale`, so nothing to update there.

No changes to placement (`grassPlacement.ts`/`computeChunkGrass`), chunk streaming, or the worker protocol — geometry LOD is purely a presentation-layer swap on top of the existing per-chunk placement data, exactly as scoped ("Zachować istniejący placement, transformacje, `InstancedMesh`, materiał i shader jako punkt wyjścia").

## Why per-tier `BufferGeometry` swap instead of extra `InstancedMesh` buckets

The plan flags "dodatkowe `InstancedMesh` buckets mogą zwiększyć draw calls" as a risk. Building 3 separate `InstancedMesh` per species (one per tier, toggled via `visible`) would avoid that specific risk (an invisible mesh isn't drawn) but would triple the per-chunk instanced attribute memory (`aPhase`/colors/`instanceMatrix`) for buckets that never need it. Swapping `mesh.geometry` on a single `InstancedMesh` keeps draw-call count exactly as it was before this change (one `InstancedMesh` per species bucket per chunk, same as before) and keeps the per-instance attribute buffers single-owned and shared across tiers.

## Technical verification (green)

```
npx tsc --noEmit
npm run build   # vue-tsc + vite build, succeeds
npm run test    # 120 files, 1000 tests, 0 failures (3 new in distanceLod.test.ts)
```

ESLint intentionally not run (out of scope for this session per instructions).

## Not yet done

- **No baseline/S-stage census or benchmark.** The plan's own "Kolejność prac" step 1 (baseline census + benchmark) and step 4 (benchmark S) call for `?benchmark=current|forest|stress|water&seed=42&res=193` runs before/after, recording FPS avg, frame p95, RENDER, drawCallsAvg, triangles and grass mesh/instance census. None of this has been run — browser verification was explicitly out of scope for this implementation pass.
- **No visual regression test.** The plan's "Visual test" scenarios (dense meadow, forest, open terrain, 360° camera rotation, distant flat viewing, top-down, sprint-through, Near→Mid→Far transitions) are unverified — LOD popping risk (flagged by the plan itself) is unconfirmed either way.
- **M (Density LOD tuning) and M (Far shader simplification) not started** — both are explicitly gated in the plan on S's benchmark result ("Wykonać dopiero po S i tylko jeśli...", "Wykonać tylko jeśli pomiary/profilowanie pokażą..."). Since S itself has no benchmark yet, there's no basis to decide whether either is needed.
- **L (Billboard/impostor) not started**, per the plan's own explicit deferral ("Nie implementować w pierwszym podejściu").
- The plan's success criterion ("30%+ redukcji grass triangles... mierzalna poprawa RENDER/FPS") is therefore unverified. The only thing established mechanically is that per-instance triangle count now decreases with distance (near: unchanged 24–36 tri/instance; mid: ~50% segment reduction; far: ~75–83% segment reduction, plus grain's leaf drop) — actual aggregate triangle savings depend on how instances are distributed across the near/mid/far bands at typical view distances, which the benchmark step exists to measure.

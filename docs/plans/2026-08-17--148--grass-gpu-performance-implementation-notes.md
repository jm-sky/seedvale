# Implementation notes — Plan 148 (Grass GPU performance and geometry LOD)

**Status:** S (Geometry LOD) implemented, technically verified (tsc/build/test green), and benchmarked (`current` scenario, one before/after run — see below). Triangle reduction landed as predicted; FPS/frame-time did **not** improve and the tail got measurably worse in this single run pair — per the plan's own closing rule, that's a signal *not* to chase further optimization blindly, not a request to jump straight to M. M (density LOD tuning) and M (far shader simplification) remain gated on this result and were not started — see "Reading this" below for the recommended next step. Only `forest`/`stress`/`water` and repeat runs remain unrun (see "Not yet done").

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

## Benchmark: `?benchmark=current`, seed 42, res 193, quality High, single run each

Run via `agent-browser` against two `vite` dev servers, one browser tab at a time (never concurrently — see [agent-browser-benchmarking.md](../performance/agent-browser-benchmarking.md), which also documents the pitfalls hit getting to a clean run: headless start-menu hang on a reused profile, `eval`'s CDP timeout on a direct `await` of the 30s+ benchmark call, benchmark-runner reentrancy, and — the one that actually cost the most time — three orphaned full Chrome processes from earlier `--session` churn left running and starving the host of CPU/RAM, which is what made an early attempt take literally 4 minutes for a 30s benchmark). Before = `main`@`cfdb83a` (the commit immediately prior to this plan's geometry-LOD commit) in a throwaway `git worktree` + `PORT=5578` dev server, `node_modules` symlinked (safe — lockfile unchanged between the two commits). After = this change, the already-running dev server. Both worktree and extra dev server were torn down after the run.

| Metric | Before (`cfdb83a`) | After (`68e1bf4`) | Δ |
|---|---:|---:|---:|
| **`grass` bucket triangles** | 8,537,018 | 4,529,954 | **−47.0%** |
| Scene triangles total (census) | 15,983,750 | 11,976,686 | **−25.1%** |
| `grass` bucket draw calls / instancedMeshes / instances | 84 / 84 / 315,789 | 84 / 84 / 315,789 | = |
| Draw calls avg (whole scene) | 1413 | 1447 | +2.4% |
| FPS avg / min | 60.6 / 44 | 57.5 / 32 | −5.1% / −27% |
| Frame time avg / p95 / max | 16.5 / 22.9 / 22.9 ms | 17.4 / 28.9 / 31.4 ms | +5.5% / +26% / +37% |
| RENDER (CPU system) | 11.6 ms | 11.8 ms | +1.7% (flat) |
| Loaded chunks / NPCs / fauna | 61 / 13 / 23 | 61 / 13 / 23 | = |

**Reading this:**

- The triangle reduction landed almost exactly on the plan's predicted mechanism: grass triangles dropped 47% (within the plan's 25–60% target band for S), and the whole-scene triangle total dropped by the **identical absolute count** (−4,007,064 in both rows) — confirming the change is fully isolated to grass geometry, nothing else in the scene moved, and draw calls didn't increase (`grass` stayed at exactly 84/84/315,789 in both runs — same instance count, same bucket count, only the geometry each `InstancedMesh` points at changed).
- **FPS/frame-time did not improve, and the tail got measurably worse** — frame p95 +26%, max +37%, min FPS 44→32. RENDER (the CPU-side render-submission system timer) is essentially flat (+1.7%), which is the most telling number: the CPU cost of *submitting* the scene didn't change, consistent with draw calls being flat. This points at the bottleneck in this scenario **not** being raw grass vertex/triangle throughput — matching the plan's own explicit closing guidance: *"Jeżeli triangles spadną, ale RENDER/FPS prawie się nie zmieni, nie należy dodawać kolejnych optymalizacji w ciemno — będzie to sygnał, że głównym ograniczeniem jest inna część GPU pipeline."*
- **Caveats that keep this from being a confident verdict either way:** single run per state (no repeats to separate signal from run-to-run noise), headless Chrome + SwiftShader **software** rendering (no real GPU — vertex throughput and fragment/fill costs scale very differently than on real hardware, so a triangle-count win that would show up on a real GPU may simply not register here), and the host had just recovered from a period of heavy resource contention earlier in the same session (three orphaned Chrome processes, load average >6, <250 MB free RAM) — fully resolved before this pair of runs (confirmed via `free`/`uptime`/process list immediately before), but still worth flagging as a reason to treat a single pair of numbers cautiously rather than as ground truth.
- **Recommendation:** don't treat this as either "S succeeded" or "S failed" on FPS grounds alone. The mechanical result (triangles down 47% in the targeted bucket, nothing else regressed structurally) is solid and worth keeping. Whether it's worth pursuing M (density LOD tuning) or M (far shader simplification) next should wait on either (a) a real-GPU browser benchmark (not headless SwiftShader) or (b) a few repeat runs of this same headless comparison to see if the FPS/frame-time delta is consistent or just noise — per the plan's own gate, M is explicitly "only if S doesn't give a sufficient result," and this single run doesn't cleanly establish that either way.

## Not yet done

- **Repeat runs** to separate the FPS/frame-time delta above from run-to-run noise — only one run per state was captured.
- **Real-GPU verification.** This benchmark ran headless (SwiftShader software rendering) end-to-end — see the caveats above. A browser benchmark on real hardware would be more representative of the plan's actual target environment.
- **`forest`/`stress`/`water` scenarios** from the plan's own benchmark protocol — only `current` was run.
- **No visual regression test.** The plan's "Visual test" scenarios (dense meadow, forest, open terrain, 360° camera rotation, distant flat viewing, top-down, sprint-through, Near→Mid→Far transitions) are unverified — LOD popping risk (flagged by the plan itself) is unconfirmed either way.
- **M (Density LOD tuning) and M (Far shader simplification) not started** — both are explicitly gated in the plan on S's benchmark result ("Wykonać dopiero po S i tylko jeśli...", "Wykonać tylko jeśli pomiary/profilowanie pokażą..."). S now has one benchmark run (see above); it shows a real triangle win but no RENDER/FPS win, which per the plan's own text is a reason to *pause and diagnose*, not a green light to add M in the dark. See "Recommendation" above.
- **L (Billboard/impostor) not started**, per the plan's own explicit deferral ("Nie implementować w pierwszym podejściu").
- The plan's success criterion ("30%+ redukcji grass triangles... mierzalna poprawa RENDER/FPS") is **partially met**: grass triangles −47% (target 30%+, met) but RENDER/FPS did not measurably improve (target: "mierzalna poprawa", not met in this single headless run). Per repeat-run/real-GPU caveats above, this isn't a final verdict.

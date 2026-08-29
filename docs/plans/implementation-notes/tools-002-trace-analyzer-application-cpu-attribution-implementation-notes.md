# Implementation Notes: Trace Analyzer — Real Application CPU Attribution

**Reviewed:** 2026-08-29
**Plan:** tools-002-trace-analyzer-application-cpu-attribution.md
**Repository:** seedvale, main

## Data verification (plan section 6)

Checked against the reference trace (`_temp/Performance/Trace-20260820T085349.json`):

- V8 CPU profile call frames carry real `url`/`lineNumber`/`columnNumber` for Seedvale's own source (`http://localhost:5577/src/...ts`), separate from `node_modules` vendor chunks and native/no-URL bindings — enough to attribute samples to real application source locations.
- Found and fixed a pre-existing bug in `iter_cpu_profiles`: Chrome trace format splits one logical V8 CPU profile into many `ProfileChunk` events sharing a profiler `id`; only some chunks introduce new `nodes`, later chunks reuse ids defined by earlier chunks of the same profile. The old code treated every `ProfileChunk` as an independent profile and resolved `samples` only against that chunk's own `nodes`, silently dropping the vast majority of samples (observed: only a few dozen samples resolved per top WebGL function out of 621k total samples in the reference trace). Fixed by grouping chunks by `(pid, id)` and merging `nodes`/`samples`/`timeDeltas` before analysis — same data, same `ProfileOperation` pipeline, no second parser. This also improved the pre-existing WebGL/Three.js profile numbers (e.g. `projectObject` samples went from 23 to 5,176 in the reference trace).
- **Limitation found and surfaced in the report, not hidden:** every `ProfileChunk` in the reference trace has an empty `timeDeltas` array (0 across all 6,639 chunks). Per-function sampled CPU time (`duration_ms`) is therefore always 0 for this trace — not a bug, a real gap in what this specific recording captured. `TOP APPLICATION CPU OPERATIONS` ranks by `duration_ms` first (preferred per plan) but falls back to sample/node count when total duration is 0, and prints an explicit note naming the missing field (`timeDeltas` on `disabled-by-default-v8.cpu_profiler` `ProfileChunk` events) instead of presenting `0.0 ms` as if it were a real measurement. If a future trace does carry `timeDeltas`, the same ranking automatically switches to real CPU time with no code change.

## What changed

- `scripts/trace_analyzer/categorize.py` — new URL-based `classify_source_ownership()` axis (`APPLICATION` / `FRAMEWORK / RUNTIME` / `CHROME / V8 / PROFILER` / `AMBIGUOUS`), separate from the existing name-based `normalize_category()` (WebGL/SHADER/THREE.JS RENDERER, unchanged). Conservative: anything not clearly under `/src/`, `node_modules`, empty, or `chrome-extension://` is `AMBIGUOUS`, never guessed.
- `scripts/trace_analyzer/v8_profiles.py` — `iter_cpu_profiles` now merges `ProfileChunk`s per profiler id (see above). `profile_node_operation` always returns an operation (previously returned `None` and dropped anything outside the WebGL family): WebGL/shader/Three.js-renderer functions keep their existing name-based category; everything else gets the URL-based ownership category. Added `application_profile_operations()` (category `APPLICATION`, ranked by `duration_ms` then `samples` then `node_occurrences`).
- `scripts/trace_analyzer/report.py` / `scripts/analyze_trace.py` — new `TOP APPLICATION CPU OPERATIONS` section, printed after the existing WebGL/Three.js section. Nothing existing was removed or reordered.
- `scripts/tests/test_v8_profiles.py` (new) — ownership classification, url+line+column identity (same name/different location not merged, same location aggregated), missing url/line/column, empty/incomplete profiles, chunk-merging across `ProfileChunk`s, ranking preferring real CPU time over sample count, and a regression check that WebGL/SHADER/THREE.JS RENDERER extraction is unchanged.
- Regenerated `docs/performance/trace-results/Trace-20260820T085349.md` from the fixed analyzer so the stored historical result matches current tool output.

## Verification

- `python3 -m unittest discover -s scripts/tests -p "test_*.py"` — 65 tests, all passing (41 pre-existing + 24 new).
- Ran `scripts/analyze_trace.py` against the reference trace: `TOP APPLICATION CPU OPERATIONS` now shows real Seedvale functions with source locations (e.g. `fbm01` at `src/terrain/fbm.ts:1:22`, `sampleApronGridWeighted` at `src/terrain/chunkHeightmap.ts:139:40`, `computeChunkGrass` at `src/terrain/grassPlacement.ts:129:34`), i.e. the report now goes from `RunTask`/`FunctionCall` containers to Seedvale function → source location → sample evidence, as required. No TypeScript/build-relevant files changed, so `tsc`/lint/build were not run.

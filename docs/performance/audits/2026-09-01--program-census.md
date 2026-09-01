# Program / Material Census — 2026-09-01

**Date:** 2026-09-01  
**Scope:** WebGL program and material first-use behaviour during `benchmark=stream`  
**Source:** `docs/performance/results/2026-09-01--001--benchmark-stream-program-census-dump.json` and `docs/performance/results/2026-09-01--001--benchmark-stream-program-census-summary.json`

## Summary

The census shows a real shader/program first-use hitch, but does **not** currently justify blind program/material consolidation.

Key observations:

- **773 materials** were observed.
- **72 programs** remained at the end of the census, with **73** as the maximum observed count.
- `MeshStandardMaterial`: 722 materials, across **31 program families**.
- `ShaderMaterial`: 50 materials, across **24 program families**.
- `MeshDepthMaterial`: **14** program families/program variants were observed.
- Programs are created progressively as streamed content becomes visible rather than all at startup.

## First-use behaviour

The strongest evidence is the correlation between program creation and long frames:

| Frame | Program count | New programs | Post-process render |
|---:|---:|---:|---:|
| 0 | 11 → 30 | +19 | ~147 ms |
| 5 | 34 → 36 | +2 | ~60 ms |
| 12 | 38 → 43 | +5 | ~46 ms |
| 50 | 43 → 54 | **+11** | **~183 ms** |
| 58 | 56 → 63 | +7 | ~107 ms |

The frame-50 event is the clearest candidate for the known first-use shader/program hitch.

After the later streaming events, the program count approaches a stable plateau around 72–73 programs.

## Interpretation

The material count is much larger than the program count:

`773 materials → ~72 programs`

Therefore the census does **not** indicate a simple one-material/one-program proliferation problem. Three.js is already sharing programs across many materials.

The observed program families are nevertheless worth investigating before considering consolidation. In particular:

- foliage/wind shader variants,
- depth/shadow-related variants,
- differences in material flags and shader defines that cause separate cache keys,
- programs introduced specifically by streamed assets.

However, the census alone does not establish that any of these variants are redundant or safe to merge.

## Decision

**Do not implement program/material consolidation based on this census alone.**

The next useful step, if this topic is revisited, is a focused investigation of the programs introduced during the largest first-use events (especially the `43 → 54` transition), comparing their cache keys, material inputs, shader defines and originating assets.

Safe shader/program pre-warming should likewise remain separate from this census. Earlier experiments did not establish a generally useful pre-warm solution, so another `compileAsync` pass should not be added without evidence.

## Related performance conclusion

The census confirms that shader/program first-use is a genuine **frame-hitch** problem. It should therefore be treated separately from sustained FPS/render-cost optimization.

Current rule:

`measure → identify specific variant/cause → make one targeted change → benchmark again`

## Source data

- `docs/performance/results/2026-09-01--001--benchmark-stream-program-census-dump.json`
- `docs/performance/results/2026-09-01--001--benchmark-stream-program-census-summary.json`
- `docs/performance/results/2026-09-01--001--benchmark-stream.json`
- `docs/performance/trace-results/Trace-20260901T090153.md`

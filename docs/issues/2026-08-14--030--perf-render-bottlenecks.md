# 030 — Render bottlenecks (diagnosis 012)

**Status:** `todo`  
**Date:** 2026-08-14  
**Source:** [review 012](../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md)

Nie implementować „przy okazji”. To lista potwierdzonych kosztów po naprawie instrumentacji.

## P0

- N8AO na High zjada ~40–50% `Render ms` przy prawie niezmienionej liczbie draw calli.

## P1

- Osada: 500–780 nieinstanced meshy, ~50% draws w wiosce.
- Shadow map renderuje się przy każdym `renderer.render()` (mirror + beauty).
- `buildAndAttachMesh` przy Insane 193: hitch avg ~30 ms, max ~54 ms (`?benchmark=stream`).
- Water mirror: drugi przebieg sceny (w `water` ~44% submissions).

## Ignore (pomiar)

- NPC/fauna **AI** (0.3–2 ms / 0.5–0.7 ms).
- Przenoszenie renderu do workerów.

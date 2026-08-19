# Reviews

Planned review runs — **one AI session per file**. Split scopes where useful.

## Status values

`todo` · `planned` · `in progress` · `done` · `verification needed`

## Queue for Claude (`to-do--*`)

Tematy wymagające **głębszej analizy** (nie quick fix w tej samej sesji): plik  
`docs/reviews/to-do--<slug>.md`  
→ użytkownik zleca Claude osobno. Po starcie: przenieś/przemianuj na `YYYY-MM-DD--{NNN}--slug.md` (next sequential number in reviews) i zaktualizuj tabelę.

| Review | Scope | Status | File |
|--------|-------|--------|------|
| — | — | — | — |

## Completed / scheduled

| Review | Scope | Status | File |
|--------|-------|--------|------|
| Water quality | Stylized woda — brzegi, shader, vs Water.js | `done` | [2026-08-07--001--water-quality.md](./2026-08-07--001--water-quality.md) |
| App performance & code health | Całość aplikacji — perf, refactoring, błędy (pierwsze ogólne review) | `done` | [2026-08-08--002--app-performance-and-code-health.md](./2026-08-08--002--app-performance-and-code-health.md) |
| Terrain surface detail | Detal powierzchni terenu („teren wygląda płasko") — normal-mapa, micro-tint, trawa, AO; **+ instrukcja strojenia dla kolejnych agentów** | `verification needed` | [2026-08-10--003--terrain-surface-detail.md](./2026-08-10--003--terrain-surface-detail.md) |
| Dedicated union types | Audyt inline union types (`kind: 'a' \| 'b'` na polu/parametrze zamiast nazwanego type alias) w `src/` | `done` | [2026-08-10--004--to-do--dedicated-union-types.md](./2026-08-10--004--to-do--dedicated-union-types.md) |
| Performance, architecture & assets | Wydajność całości — draw calls/instancing, pass cieni, post-processing, streaming, rozmiary modeli/dźwięków, persystencja; follow-up do 002 | `done` | [2026-08-12--005--performance-architecture-and-assets.md](./2026-08-12--005--performance-architecture-and-assets.md) |
| Architecture alignment | Zgodność obecnej architektury z docelowym modelem systemów (`docs/roadmap/02-systems-fixed.md`) — system boundaries, WorldContext, NPC→Household→Settlement, needs/pressure, economy/actions, events/ecosystem, time/persistence, player/quests | `done` | [2026-08-14--006--architecture-alignment.md](./2026-08-14--006--architecture-alignment.md) |
| UI/UX audit | Desktop + A55 landscape — HUD, pauza, QA, inventory, Vue/CSS/shadcn; plan implementacji w [105](../plans/2026-08-14--105--ui-ux-review.md) §8 | `done` | [2026-08-14--007--ui-ux.md](./2026-08-14--007--ui-ux.md) |
| Asset Browser × modular cottage | Czy agent znajdzie/oceni części jednego domku MegaKit; **fix first** — plan [107](../plans/2026-08-14--107--asset-browser-agent-discovery.md) | `done` | [2026-08-14--008--asset-browser-modular-cottage.md](./2026-08-14--008--asset-browser-modular-cottage.md) |
| MegaKit construction audit | Audyt wymiarów/modularności wszystkich 176 GLB (Node, bez przeglądarki) + `ConstructionCatalog` nad `AssetIndex` — plan [109](../plans/2026-08-14--109--megakit-construction-catalog.md) | `done` | [2026-08-14--009--megakit-construction-audit.md](./2026-08-14--009--megakit-construction-audit.md) |
| Perf benchmark raw data | Surowe wyniki `?benchmark=*` + krótki `?perf=1` (bez wniosków / bez zmian w kodzie) | `done` | [2026-08-14--010--perf-benchmark-data.md](./2026-08-14--010--perf-benchmark-data.md) |
| MegaKit Construction Catalog (browser) | Wizualna weryfikacja 4 założeń katalogu, których nie dało się potwierdzić z AABB — plan [109](../plans/2026-08-14--109--megakit-construction-catalog.md) | `done` | [2026-08-14--011--megakit-construction-browser-verification.md](./2026-08-14--011--megakit-construction-browser-verification.md) |
| Perf bottleneck diagnosis v2 | Naprawa `drawCalls=1`, ponowne benchmarki, spis sceny, izolacja, streaming — follow-up do [010](./2026-08-14--010--perf-benchmark-data.md) | `done` | [2026-08-14--012--perf-bottleneck-diagnosis.md](./2026-08-14--012--perf-bottleneck-diagnosis.md) |
| Architecture & performance audit | Pełny lokalny audyt (bez przeglądarki) po ostatnich 20 commitach — CPU/GPU hot paths, chunk streaming, NPC/fauna scaling, instancing, memory, workers | `done` | [2026-08-15--013--architecture-and-performance-audit.md](./2026-08-15--013--architecture-and-performance-audit.md) |
| AI agent workflow audit | Repo audit for Claude Code / Cursor Agent context & cost optimization — doc duplication, plan domains, automation, skills, MCP, Claude vs Cursor split, multi-agent git workflow | `done` | [2026-08-15--014--ai-agent-workflow-audit.md](./2026-08-15--014--ai-agent-workflow-audit.md) |
| Browser performance benchmark | Powtórzenie `?benchmark=*` po review 013 (GPU/streaming) — porównanie z [010](./2026-08-14--010--perf-benchmark-data.md), bez optymalizacji | `done` | [2026-08-15--015--browser-performance-benchmark.md](./2026-08-15--015--browser-performance-benchmark.md) |
| GPU-fix runtime verification | Czy N8AO/cienie/lustro/instancing osady z `c4c8c9d`/`94874a5`/`080fd3f` są aktywne w `?benchmark=*` — preambuła planu [119](../plans/2026-08-15--119--chunk-streaming-performance.md) | `done` | [2026-08-15--016--gpu-fix-runtime-verification.md](./2026-08-15--016--gpu-fix-runtime-verification.md) |
| Rendering regression audit | Black frames (mobile) / grass flicker (desktop) po `0c318b0`/`e25cce9`/`080fd3f`/`14ee5c7`/`7a90408` — static analysis, brak fixu, 2 hipotezy do potwierdzenia w przeglądarce | `verification needed` | [2026-08-15--017--rendering-regression-audit.md](./2026-08-15--017--rendering-regression-audit.md) |
| Streaming hitch trace analysis | Perfetto/PerfettoSQL analiza `stream` hitcha (Chrome trace) — main thread idle podczas `water-mirror`/`postprocessing`, korelacja z `chunk-finalize`, prawdopodobny synchroniczny shader compile/link | `verification needed` | [2026-08-16--019--streaming-hitch-trace-analysis.md](./2026-08-16--019--streaming-hitch-trace-analysis.md) |
| Water × grass GPU benchmark | Cursor-browser real GPU (Intel Arc 140V): baseline `cfdb83a` vs grass LOD `68e1bf4` vs grass+water S `c834210` — `current`/`water`/`stream` | `done` | [2026-08-18--020--water-grass-gpu-benchmark.md](./2026-08-18--020--water-grass-gpu-benchmark.md) |
| Plan 149 Phase 0 real GPU | Cold `?benchmark=stream` ×3 on Intel Arc 140V + program census — first-use hitch confirmed; recommend loading-time prewarm (A) | `done` | [2026-08-18--021--plan-149-phase-0-real-gpu.md](./2026-08-18--021--plan-149-phase-0-real-gpu.md) |
| Plan 149 program family dump | Real-GPU `cacheKey`/`name` dump ×3 — ~210 unique keys, ~25 names; streaming variants are `numPointLights` × instancing, not new GLTF families. Recommend B (pin lights) before A | `done` | [2026-08-18--022--plan-149-program-family-dump.md](./2026-08-18--022--plan-149-program-family-dump.md) |
| Plan 149 PointLight variant axis | Diagnostic pin/pad `NUM_POINT_LIGHTS=16` vs baseline, real GPU ×3+3 — unique keys 210→62, streaming hitch bursts gone; RENDER/p95 worse. Hypothesis **PASS**, pad is not the shippable fix | `done` | [2026-08-18--023--plan-149-pointlight-variant-axis.md](./2026-08-18--023--plan-149-pointlight-variant-axis.md) |
| Plan 149 PointLight budget 8/12/16 | Cheap pin (no `traverseVisible`) ×3+3+3+3 on Intel Arc 140V — 8/12/16 all collapse to 62 programs; 8/12 cull lights; 16 is the only visual-safe budget; traverse was most of the 023 RENDER tax. **C for next plan, D for shipping today** | `done` | [2026-08-18--024--plan-149-pointlight-budget-curve.md](./2026-08-18--024--plan-149-pointlight-budget-curve.md) |
| Plan 149 Phase 1 A `compileAsync` prewarm | Loading-window staging + `compileAsync` on Intel Arc 140V ×3 — streaming first-use after frame 0 **65–99.5 ms** (was 316–382); `glError` 0; program count 65–68. Phase C leftover: `Green` / glass / `Wood` | `done` | [2026-08-19--025--plan-149-phase-1a-compileasync-prewarm.md](./2026-08-19--025--plan-149-phase-1a-compileasync-prewarm.md) |

## After each run

1. Set status in this table and in the review file.
2. Record findings under **Findings** (severity + file refs).
3. Add or update rows in [issues/README.md](../issues/README.md) for actionable follow-ups.

# Review 013: Architecture & performance audit (local, read-only)

**Status:** `done`
**Date:** 2026-08-15
**Scope:** Pełny lokalny audyt architektury i wydajności — ostatnie 20 commitów (`77fab7d`..`c7bfa22` i wstecz), CPU/GPU hot paths, chunk streaming, NPC/fauna simulation scaling, instancing, memory/GC, workers. Bez przeglądarki/Playwright/DevTools — wyłącznie source, docs, git history, `tsc`/`vitest`.
**Not in scope:** implementacja fixów, plany implementacyjne, weryfikacja wizualna.
**Tools used:** `npx tsc --noEmit`, `npm run test` (726/726 passing), `git log/show/diff/blame`.
**Artifact:** published report — https://claude.ai/code/artifact/3a9d7724-a3ab-4e45-abeb-74f488312823

**Evidence tags:** `[MEASURED]` = ran locally this session or a prior session's recorded benchmark output. `[STATIC ANALYSIS]` = derived from reading current code/tests, not executed. `[UNMEASURED]` = would require the in-browser `?benchmark=`/`?perf=1` tooling, not run in this session.

---

## Executive Summary

1. **Two unthrottled O(N²) per-frame loops exist today**, both matching the exact anti-pattern this review was asked to hunt for: `AnimalAgent.nearest()` (predator/prey detection, every fauna agent, every frame) and the per-settlement NPC pairwise-distance loop in `createSettlement.ts`'s `update()` (group-reaction dampening). Both are cheap at current populations (≤34 NPC, ≤28 fauna) and both become the dominant CPU cost at 5–10× population without any code change required to trigger it — no spatial partitioning exists for either. **[STATIC ANALYSIS]**
2. **The GPU-cost commit (`080fd3f`) and the streaming-hitch commit (`0c318b0`) are both correctly wired**, not just documented as done. Render-layer separation for the water mirror (`AGENT_RENDER_LAYER`), the once-per-frame shadow update ordering, and the settlement palisade/barrel/hay instancing all trace cleanly through to their consumers, and `npx tsc --noEmit` / `npm run test` (726/726) are green. **[MEASURED]**
3. Review 012's own numbers (RENDER 7–17 ms, WATER 3–6 ms, simulation ≤2 ms) are **not re-validated post-commit** in this review — they predate `080fd3f`, `0c318b0`, `c4f7ed1`, and `77fab7d`. The plan-113/112 "Before → After" benchmark tables that the plans themselves demand were not filled in. Docs mark these `verification needed`, which is accurate and consistent with the code. **[STATIC ANALYSIS]**
4. **Chunk streaming's "1 finalize per frame" cap bounds the number of *new* `attachGeneratedChunk` starts per frame, not total synchronous work per frame.** A chunk with no vegetation/no GLB-environment content runs its entire finalize (mesh + water + items + environment + colliders) synchronously with no `await` in between, and a previous finalize's warm-cache `Promise.all` continuation can resume as a microtask inside the same frame a new finalize starts. Review 012 measured everything except `buildAndAttachMesh` as cheap when warm, so this is a real but currently low-severity gap, not a broken fix. **[STATIC ANALYSIS]**
5. **Fauna and NPC simulation architecture is not duplicated** — plan 118 (herds/juveniles) extended `AnimalAgent`/`AnimalLife` in place rather than adding a parallel `HerdManager`/FSM, exactly as its own scope-guard demanded. `pickHerdLeader()` is deliberately stateless (no stored leader field), a good design call — but it's invoked from inside the same `currentOthers` array that already drives the O(N²) predator/prey scan, so herd cohesion inherits the same scaling ceiling.
6. **Rendering ownership is clean**: `WorldBundle`'s disposal contract is honored in the chunk-unload path — `finalizeWaiter`, `treeInstances`, `vegetationInstances`, `environmentInstances`, water, grass and colliders are all explicitly disposed and nulled on unload, including the mid-flight-finalize-then-unload race. No leak found in this path.
7. **NPC reactions (`c4f7ed1`) and critical-need interruption (`eac097a`) are both correctly throttled** — `getPlayerSocial`/`computeReactionChance` only run for NPCs already gated by proximity + phase + a 1.5 s retry cooldown; `tickCriticalInterrupt` has its own explicit 1 s throttle. Neither is a scaling risk at any plausible NPC count, because their cost scales with *nearby* NPCs, not total NPCs.
8. **`getPlayerStanding()` recomputes a full sum over `QuestManager.relations` on every call** rather than maintaining a running total. Currently invisible (relations are bounded by NPCs actually met, and the call is throttled by the reaction-check cooldown), but it's an O(known-NPCs) scan sitting inside a per-NPC, per-frame-adjacent code path — worth a mental note, not a fix.
9. Two of the last 20 commits are **pure GPU/streaming cost work with no gameplay change**, and two are **pure gameplay additions with deliberate, explicit non-goals** (no new FSM, no persistence, no reproduction). Healthy commit pattern for a project treating performance as an architectural constraint rather than a late optimization pass.
10. Nothing found in this review rises to "the architecture is wrong." The two O(N²) loops are the one finding that actually threatens the stated 5×/10× scaling goal; everything else is either already-mitigated, correctly scoped, or genuinely not worth touching yet.

---

## Current Architecture (as read from code, not docs)

`createApp.ts` composes the renderer/scene/camera/UI/audio/player/quests/day-night state, then wires `WorldBundle` (`ChunkManager`, `WorldOcean`, `SettlementsManager`, `Fauna`, item/resource/fire/tent/cave systems) and the game loop together. `WorldBundle` is mutated in place on rebuild; this matches `docs/architecture/ARCHITECTURE.md`'s stated invariant and nothing in the last 20 commits violates it.

Per-frame flow (`gameLoop.ts`), confirmed by reading the loop body directly:

```
input / player controller
        ↓
ChunkManager.update()          — drainLoadQueue (2 starts/frame) + drainFinalizeQueue (1/frame)
        ↓
Fauna.update()                 — every agent, every frame, unthrottled, O(N) others-array scan each
        ↓
SettlementsManager → per-settlement update() — every NPC, every frame, O(N²) pairwise distance scan
        ↓
QuestManager / day-night / persistence hooks
        ↓
renderer.info.reset()
postProcessing.applyFrameBudget(lastRenderMs)   — AO hysteresis from last frame's cost
ocean.renderMirror()                            — 30 Hz cap, layer 0 only (no NPC/fauna, no water-on-water)
renderer.shadowMap.needsUpdate = true           — one shadow update, after mirror, before beauty
postProcessing.render()                         — beauty + AO + SMAA + bloom + god rays + film grade
```

This is a single main-thread loop with one worker pool (`chunkWorkerPool.ts` / `chunkHeightmap.worker.ts`) offloading terrain heightmap generation. No other workers exist in the codebase — vegetation placement, grass, NPC/fauna simulation, and quest logic are all main-thread. That matches `docs/architecture/performance-and-workers.md`'s own conclusion in review 012 that simulation is not the bottleneck, so the absence of additional workers is a defensible current state, not an oversight.

---

## Performance Findings

| Priority | Area | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|---|
| 🟠 High | Fauna simulation | `AnimalAgent.updatePredator`/`updatePrey` call `nearest(others, role, range)` every frame, every agent; `nearest()` linearly scans the *entire* fauna population (`src/fauna/AnimalAgent.ts:1220-1276,1567-1586`). No spatial partitioning, no throttle. | [STATIC ANALYSIS] confirmed by reading `createFauna.ts:592-607` (whole `agents` array passed as `others` every frame) and `nearest()`'s implementation. | O(N²)/frame. At current N≤28 this is ~800 distance calcs/frame (negligible). At N=500 it's 250k; at N=2000 it's 4M distance calcs/frame on the main thread, with no other work removed to compensate. | Bucket fauna into a coarse spatial grid (chunk-sized cells already exist) and query only neighboring cells for `nearest()`. Keep the per-agent API identical; only the candidate set changes. Don't do this until population actually approaches the point where it matters. |
| 🟠 High | NPC simulation | `createSettlement.ts`'s `update()` runs a full O(N²) pairwise-distance double loop over that settlement's NPCs *every frame, unconditionally*, purely to compute `nearbyNpcCount` for reaction-chance dampening (`src/settlement/createSettlement.ts:466-475`). | [STATIC ANALYSIS] confirmed by direct read. | Same shape as the fauna finding, scoped per-settlement. At 13–34 NPC (review 012 range) this is ≤1156 calls/frame, invisible. A settlement holding 100+ NPC (5× current largest observed) would run ~10k calls/frame *even when the player is nowhere near that settlement* — unlike the fauna case, there's no distance/threat gate around it at all. | Same fix class as fauna: bucket by proximity, or cheaper — only recompute `nearbyNpcCount` when an NPC is inside the reaction pause-trigger distance of the player (it's only consumed by the reaction-chance branch, which is already gated that way). This second option needs no spatial structure at all. |
| 🟡 Medium | Chunk streaming finalize | `CHUNKS_FINALIZED_PER_FRAME = 1` (`src/terrain/chunkManager.ts:463`) caps new `attachGeneratedChunk` *starts* per frame, but `attachGeneratedChunk` itself does mesh + water + grass sync + (conditionally) vegetation/environment/colliders in one synchronous stretch before its first `await`, and warm-cache `Promise.all` continuations resume as same-tick microtasks. Two finalizes can therefore still land sync work in one real frame under the right timing. | [STATIC ANALYSIS] — confirmed by reading `drainFinalizeQueue`/`runFinalize`/`attachGeneratedChunk` (`chunkManager.ts:754-1003`); not reproduced with a live benchmark. | Review 012's own numbers put non-`buildAndAttachMesh` streaming work under the 8 ms hitch threshold when warm, so this is currently a latent gap, not an observed regression. It would matter most on a cold cache (fast travel into never-visited terrain) — exactly the case review 012 flagged as unmeasured. | Not urgent. If a future benchmark shows hitches surviving plan 112, look here first before assuming `buildAndAttachMesh` itself regressed. |
| 🟡 Medium | Post-plan-112/113 re-verification | Review 012's baseline (RENDER 7–17ms, hitch avg 29.9/max 53.6ms) predates the shadow-once, mirror-30Hz, settlement-instancing, and finalize-queue changes it was meant to fix. No `?benchmark=stream`/`?benchmark=settlement` re-run exists in the repo to confirm the fixes worked in practice. | [STATIC ANALYSIS] — plans 112/113 both have empty "After" columns in their own before/after tables; `docs/plans/README.md` correctly lists both as `verification needed`. | Can't currently distinguish "fixed" from "looks fixed on paper." Docs are honest about this, which is good, but the gap is real. | Run the existing `?benchmark=stream` and `?benchmark=settlement` scenarios (they already exist, no new tooling needed) before trusting the P0/P1 wins are real in the browser, not just in the diff. |
| 🟢 Low | `QuestManager.getPlayerStanding()` | Recomputes `sum(relations.values()) / relations.size` on every call rather than maintaining a running average (`src/quests/QuestManager.ts:225-231`). | [STATIC ANALYSIS] | Bounded by "NPCs the player has ever interacted with," and only called from the already-throttled reaction path — currently invisible. | Not worth fixing now; would only matter if `getPlayerStanding()` gained a new, unthrottled caller. |
| 🔵 Minor | Water mirror / AGENT_RENDER_LAYER naming | `assignRenderLayer`/`setSubtreeCastShadow`, general-purpose agent-rendering helpers used by both `NpcAgent` and `AnimalAgent`, live in `src/world/waterMirror.ts` — a file named for a different, narrower concern. | [STATIC ANALYSIS] | None functionally; pure discoverability/cohesion nit. | Not worth a dedicated change; consider relocating next time that file is touched for an unrelated reason. |

## Architecture Findings

| Priority | Area | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|---|
| 🟡 Medium | Fauna / NPC — shared O(N²) shape | Both O(N²) findings above stem from the same root cause: neither `Fauna` nor `SettlementsManager` maintains any spatial index, so every proximity query (`nearest()`, `nearbyNpcCount`, `pickHerdLeader`) degrades to a full scan of the owning collection. This is architecturally consistent (no duplicate/parallel spatial systems exist — there's exactly one way proximity is computed in each domain), just not yet scalable. | [STATIC ANALYSIS] | Consolidated into one fix if/when it's needed: a shared coarse-grid utility usable by both `Fauna` and `SettlementsManager`, rather than two bespoke fixes. | Defer until population targets are actually set (see Scalability). When it's time, build one small spatial-bucket helper, not two. |
| 🔵 Minor | Herd/juvenile integration | `herdCohesion.ts` is a pure, dependency-free module in the same style as `predatorHumanDecision.ts` (no Three.js/DOM, fully unit-testable), and `AnimalAgent` consumes it through one new `pickFollowTarget()` method inserted ahead of the existing wander-target selection — no parallel FSM, no new manager, matches `docs/plans/2026-08-14--118` and its own explicit "poza zakresem" list. | [STATIC ANALYSIS] confirmed by reading `herdCohesion.ts` (95 lines) and its call sites in `AnimalAgent.ts`. | None — this is the "did it right" case. | Nothing to change. |
| 🔵 Minor | `AnimalAgent.ts` / `NpcAgent.ts` size | 1673 / 2022 lines respectively. Both remain single-responsibility (one entity's full behavior), not god-managers coordinating other entities — the actual cross-entity orchestration (`others`, `currentVillages`) is passed in from `createFauna.ts`/`createSettlement.ts`, not owned by the agent classes. | [STATIC ANALYSIS] | Line count alone isn't a smell here; splitting would fragment one entity's cohesive lifecycle across files without reducing complexity. | Not worth fixing — matches the CLAUDE.md guidance against premature abstraction. |

---

## Scalability

Baseline for "current scale": review 012's measured context — up to 76 loaded chunks, 34 NPC, 28 fauna, drawCalls ~1300–1950, triangles ~7–19M, RENDER 7–17ms, WATER 3–6ms `[MEASURED, pre-080fd3f/0c318b0]`. Everything below is `[STATIC ANALYSIS]` extrapolation unless marked otherwise — no live benchmark was run in this review.

**CPU.** Current fauna/NPC simulation cost is confirmed negligible (review 012: NPC 0.3–2.0ms, fauna 0.5–0.7ms). That number is not a fixed simulation cost — it scales with the two O(N²) loops above. At 5× fauna (~140) the scan cost is ~25× today's, still likely sub-millisecond given how cheap `Math.hypot` is; at 10× fauna (~280, well under the review's 500-animal reference point) it stays small. The review's 500/2000-animal reference points are the ones that actually threaten this: 500 fauna ≈ 250k distance calcs/frame, 2000 ≈ 4M/frame, and that's *before* accounting for the same shape existing independently per-settlement for NPCs. **Breaking point:** not reliably pinpointable without a live benchmark — `Math.hypot` cost per call and JS engine optimization make a confident millisecond estimate irresponsible from static analysis alone. What's confirmed is that the growth curve is quadratic, not linear, and no code currently prevents reaching it.

**GPU.** Review 012 attributed frame cost to RENDER (N8AO + shadow + mirror submits) and WATER (mirror), not simulation — and `080fd3f` directly targeted exactly those three (AO auto-budget, shadow-once, mirror skips agents + halved to 30Hz) plus settlement draw-call count (palisade/barrel/hay instancing). Right target list per review 012's own priority table. Whether it actually halves the settlement draw-call count and whether the AO auto-budget avoids visible flicker are `[UNMEASURED]` — needs the in-browser benchmark plan 113 itself calls for.

**Memory.** Chunk unload path disposes every owned resource including the plan-112 `finalizeWaiter` race case — no leak found. `InstancedMesh` disposal (`treeInstances`/`vegetationInstances`/`environmentInstances`) is symmetric with construction. No other systemic leak pattern was found in the time available; this review did not exhaustively audit NPC/fauna disposal or the settlement/house-builder GLB template caches.

**Simulation.** Needs/FSM/schedule/quest logic is event- and timer-throttled throughout (`CRITICAL_INTERRUPT_CHECK_INTERVAL_SEC`, `SUPPRESSED_REACTION_RETRY_COOLDOWN`, `humanDecisionTimer`, wander retarget cadence) — this is the one area of the simulation layer that already follows `docs/architecture/performance-and-workers.md`'s batching guidance correctly at every entity-local decision point. The two O(N²) loops are the exception, not the pattern.

**Rendering architecture.** Instancing is used deliberately and only where the plan's own A/B split calls for it (static, non-interactive, non-animated props); NPCs/doors/lights correctly stay individual. This split is followed consistently, not just in the newest commit.

**Chunk streaming.** The finalize-queue fix targets the right operation (review 012's actual measured hitch source) with a minimal, in-place change to the existing pipeline — no parallel streaming system was introduced. The gap noted above (synchronous work inside one finalize isn't itself sliced) is real but secondary to the fix that was made.

---

## Top 5 Actions

1. **Re-run the existing `?benchmark=stream` and `?benchmark=settlement` scenarios in-browser before trusting `080fd3f`/`0c318b0` are done.** *Why now:* both plans explicitly demand a before/after table that's currently blank; the docs already flag this (`verification needed`), so this is closing a known gap, not discovering a new one. *Benefit:* turns two "looks correct in the diff" commits into "confirmed correct" ones. *Risk:* none — measurement only. *Effort:* S (tooling already exists).
2. **Gate `createSettlement.ts`'s `nearbyNpcCount` loop behind the same proximity check that already gates its only consumer** (the reaction-chance branch in `NpcAgent.update()`). *Why now:* cheapest possible fix (no new data structure) for the one O(N²) loop that runs with zero distance gating at all, unlike its fauna counterpart. *Benefit:* removes a scaling cliff for settlement size specifically, which is a stated direction (House Builder, bigger settlements). *Risk:* very low — purely restricts *when* an already-correct computation runs. *Effort:* S.
3. **Don't build the fauna spatial-grid fix yet — but decide the actual NPC/fauna population targets first.** *Why now:* can't respect "resist over-engineering" and also confidently size a fix without knowing whether 5×/10× means "280 fauna" or "2000 fauna." *Benefit:* avoids either premature optimization or a late scramble. *Risk:* none, it's a decision not a change. *Effort:* discussion only.
4. **When the population target is set high enough to warrant it, build one shared coarse-grid proximity helper, used by both `Fauna` and `SettlementsManager`.** *Why now (conditionally):* both O(N²) sites are structurally identical; solving them separately would be exactly the "parallel mechanism" pattern this project's own CLAUDE.md warns against. *Benefit:* one fix, one tested utility, reusable by any future proximity query (quests, dialogue). *Risk:* medium — touches a hot path in two systems; needs its own before/after benchmark like the plan-112/113 gates require. *Effort:* M.
5. **Slice `attachGeneratedChunk`'s post-mesh work (vegetation/environment/colliders) behind its own per-frame budget, not just the mesh-build start.** *Why now:* only worth doing *after* action 1 confirms whether this gap is actually observable — plan 112 itself says "register this as a separate follow-up, don't expand scope automatically" if `buildAndAttachMesh` alone doesn't explain a remaining hitch. *Benefit:* closes the last theoretical gap in the streaming fix. *Risk:* low, same pattern as the existing fix. *Effort:* S–M, conditional on action 1's result.

---

## Things Already Done Well

- **Water-mirror agent exclusion via render layers** (`AGENT_RENDER_LAYER`) is correctly wired end-to-end (main camera, shadow camera, mirror camera, both `NpcAgent` and `AnimalAgent`) — don't touch this without re-verifying all four attachment points.
- **Shadow-once-per-frame ordering** (`autoUpdate = false`, explicit `needsUpdate = true` between mirror and beauty) is a one-line-intent fix implemented exactly where review 012 said the cost was — leave it alone.
- **Settlement static-prop instancing** correctly reuses `instancedProps.ts`/`buildInstancedProps` rather than inventing a second batching system, exactly per plan 113's explicit instruction — reuse-over-parallel-mechanism working as intended.
- **Chunk unload disposal**, including the plan-112 finalize-in-flight race, is complete and symmetric with construction. Don't add new chunk-owned resources without extending this same function.
- **Fauna herd/juvenile work extends `AnimalAgent`/`AnimalLife` in place** rather than adding a `HerdManager` or second FSM, and `pickHerdLeader()`'s stateless-recomputation design (no stored leader, no reassignment bookkeeping) is a genuinely elegant way to handle leader death for free.
- **NPC critical-need interrupt and reaction-chance work are both correctly throttled at the entity level** — this is the pattern the rest of the codebase should be measured against, not the exception.
- **`WorldBundle` rebuild invariants** are still respected across all 20 commits — no long-lived closure was found capturing a replaceable bundle field.

## Not Worth Fixing Yet

- The two O(N²) loops themselves, *today* — at 13–34 NPC and ≤28 fauna they are not measurably the bottleneck (review 012 confirms simulation ≤2ms). Fixing them now, before a population target exists, risks exactly the kind of premature spatial-indexing infrastructure the project's CLAUDE.md warns against.
- `getPlayerStanding()`'s O(relations) recompute — bounded, throttled, invisible.
- `attachGeneratedChunk`'s lack of internal slicing beyond `buildAndAttachMesh` — plan 112 itself explicitly deferred this pending evidence it matters, and review 012's data doesn't yet show it does.
- `AnimalAgent.ts`/`NpcAgent.ts` file size — cohesive, not god-objects; splitting would cost more than it returns.
- The `waterMirror.ts` naming/location of `assignRenderLayer`/`setSubtreeCastShadow` — a real but cosmetic nit, not worth a standalone change.

## Recent 20 Commits — Overall Impact

Improved architecture: yes, incrementally and consistently — every feature commit in this window (fauna herds, NPC reactions, critical-need interrupt, House Builder) extended an existing owning system rather than adding a parallel one, matching the project's own stated principle.

Improved performance: yes for the two GPU/streaming commits (`080fd3f`, `0c318b0`), on paper and by static trace; not yet confirmed in the browser (see Top Action 1).

New performance risk created: no *new* risk — the two O(N²) loops predate this window (they're inherent to how `Fauna`/`SettlementsManager` have always distributed proximity data), but the herd/juvenile and NPC-reaction features *use* the same `others`/`agents` arrays those loops already scan, so they inherit the ceiling rather than raising it further.

Increased scalability: yes for GPU/rendering (draw-call reduction, shadow/mirror dedup); not yet for CPU simulation at high population, where the ceiling is unchanged.

Technical debt created: minimal — the main debt is *documentation* debt (blank before/after benchmark tables in two `verification needed` plans), not code debt.

---

## Final Score

```
Architecture:            8/10
CPU scalability:         6/10   (fine to ~150-300 entities; unmitigated O(N²) beyond that)
GPU scalability:         7/10   (right fixes landed, unverified in-browser)
Memory:                  8/10   (clean disposal everywhere checked)
Chunk streaming:         7/10   (right fix, one unaddressed edge case, unverified in-browser)
Simulation scalability:  6/10   (throttling is excellent everywhere except the two O(N²) sites)
Rendering architecture:  8/10   (instancing/layers/shadow ordering all correctly reused, not duplicated)
Overall:                 7/10
```

**What I would fix next, and what I would deliberately leave alone:** fix next — the settlement `nearbyNpcCount` loop's missing proximity gate, and re-running the existing benchmarks to confirm the last two GPU/streaming commits actually deliver what their diffs promise. Leave alone — the fauna `nearest()` scan and any new spatial-indexing infrastructure, until an actual NPC/fauna population target makes that ceiling something the game will really hit, not just something the code permits.

## Findings

Tracked as [issue 031](../issues/2026-08-15--031--unbounded-proximity-scans-fauna-settlement.md).

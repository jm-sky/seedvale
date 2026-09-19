# Plan: Codebase domain and flow audit master

**Created:** 2026-09-19  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** XL  
**Depends on:** none  
**Domain:** `tools`  
**Subdomains:** `diagnostics` `development`  
**Type:** `infrastructure`  
**Roadmap:** -

## Goal

Perform a systematic code audit of Seedvale by coherent ownership/flow areas rather than by source directory alone.

The audit is intended to find:

- incorrect behaviour and latent bugs,
- permissive or incorrect predicates/defaults/guards,
- duplicated or conflicting sources of truth,
- broken ownership/lifecycle boundaries,
- inconsistent normal/off-screen/time-skip behaviour,
- save/load/rebuild continuity defects,
- duplicated mechanisms and architectural drift,
- asymmetric cross-entity flows,
- stale runtime projections,
- avoidable performance hazards in recurring paths.

The recent water mirror defect where a predicate effectively always evaluated to `true` is a representative failure class: reviews must trace what queries mean, all important call sites, fallback behaviour and the consumers that depend on the result rather than only checking whether code is locally plausible.

## Audit principles

1. Current code on `main` is authoritative.
2. Review complete flows, not isolated files.
3. Follow state ownership and lifecycle across domain boundaries when required.
4. Do not redesign unrelated systems during a review.
5. Record evidence before proposing a fix.
6. Reuse existing mechanisms; flag parallel state/mechanisms explicitly.
7. Distinguish a confirmed defect from a risk, architectural concern or documentation mismatch.
8. Do not infer browser/gameplay correctness from static inspection or automated tests.
9. Each audit session updates this master plan and writes one dedicated review artifact.
10. Confirmed implementation work should become a focused plan in the domain that owns the fix; do not turn this master plan into an implementation backlog.
11. This audit is about code correctness, architecture, lifecycle/persistence and performance — not feature completeness or conformance to `VISION.md`.
12. Do not report a gameplay/design/Vision mismatch as a finding unless it exposes a concrete correctness, architecture, lifecycle, persistence or performance defect in the current code.

## Required review flow

Each area should trace the applicable path end-to-end:

```text
entry point / producer
→ authoritative input state
→ query / decision / transformation
→ mutation
→ downstream consumers
→ runtime projection
→ cleanup / unload / rebuild
→ persistence / load
→ off-screen / time-skip equivalent
```

Not every step applies to every area, but omitted steps should be consciously ruled out.

### Required checks

Every review should inspect, where applicable:

- authoritative state owner,
- runtime/projection owner,
- lifecycle owner and cleanup,
- important callers and consumers,
- boolean predicates, guards, fallbacks and defaults,
- permissive patterns such as unconditional success, `?? true`, `|| true`, silent catch-and-continue or “safe” fallback values,
- stale/missing-data behaviour,
- initialization order and temporary/background-init stubs,
- normal vs off-screen vs time-skip semantics,
- create/update/destroy/rebuild continuity,
- save/load/migration continuity,
- stable entity identity vs transient runtime identity,
- duplicated state or duplicated calculations,
- asymmetric player/NPC/fauna flows,
- dead/legacy alternative implementations,
- recurring/per-frame/per-entity work and avoidable allocation/GC,
- documentation discrepancies only when they reveal or can cause a concrete code correctness, architecture, lifecycle, persistence or performance defect.

## Finding scope

In-scope findings are concrete defects or risks evidenced in current code, especially:

- incorrect predicates, guards, defaults, fallbacks or control flow,
- duplicated/conflicting authoritative state,
- broken ownership, cleanup, rebuild or identity lifecycle,
- save/load/migration or off-screen/time-skip continuity defects,
- stale references and invalid runtime projections,
- duplicated/parallel mechanisms that can diverge,
- expensive recurring work, poor algorithmic complexity, unnecessary allocations/GC, repeated calculations, avoidable rebuilds or over-frequent updates.

Out of scope as standalone findings:

- missing gameplay features,
- differences from `VISION.md`, roadmap or intended design,
- subjective gameplay/design quality,
- "this system could be more realistic/deeper" observations,
- documentation drift that has no concrete impact on code correctness, architecture, lifecycle/persistence or performance.

Use `VISION.md` only when necessary to understand an existing code contract; do not use it as a compliance checklist.

## Finding classification

Use these severities consistently:

- **critical** — corrupts authoritative/persisted state, causes broad systemic failure, or can make major simulation flows invalid.
- **high** — confirmed gameplay/system defect with meaningful impact or a serious architecture boundary violation.
- **medium** — confirmed defect with bounded impact, or architecture debt likely to create defects.
- **low** — minor correctness/maintainability issue with limited current impact.
- **observation** — noteworthy design/architecture fact, unconfirmed risk or documentation discrepancy.

For every confirmed finding record:

- severity,
- affected flow,
- exact files/symbols,
- evidence from current code,
- why the behaviour is wrong or fragile,
- affected callers/consumers,
- likely owner domain,
- whether an existing plan already covers it,
- recommended next action.

Avoid speculative findings without code evidence.

## Review artifact

Each session creates one file under:

`docs/reviews/codebase-domain-audit/`

Naming:

`2026-09-19--NN--<area-slug>.md`

Each review should contain:

1. **Scope**
2. **Entry points and state owners**
3. **Flows traced**
4. **Findings**
5. **Architecture observations**
6. **Cross-domain dependencies / follow-ups**
7. **Existing plans that already cover findings**
8. **New plans required**
9. **Verification limits**
10. **Master status update**

If no defect is found, say so explicitly and record what was actually traced.

## Master audit coverage

Status vocabulary:

- ⬜ **not reviewed**
- 🔄 **in review**
- ✅ **reviewed**
- ⚠️ **reviewed with unresolved high/critical findings**

| # | Review area | Primary scope | Status | Review | Follow-up plans |
|---|---|---|---|---|---|
| 01 | Runtime architecture & WorldBundle | composition root, `WorldBundle`, init/rebuild/dispose, background init, ownership boundaries | ⚠️ reviewed with unresolved high/critical findings | [review](../reviews/codebase-domain-audit/2026-09-19--01--runtime-architecture-and-worldbundle.md) | [world-003](./world-003-faster-application-startup.md), [world-033](./world-033-worldbundle-rebuild-transaction-and-lifecycle-safety.md) |
| 02 | Simulation, time & deterministic state | simulation clocks/ticks, update rates, RNG, time-skip, off-screen semantics | ⚠️ reviewed with unresolved high/critical findings | [review](../reviews/codebase-domain-audit/2026-09-19--02--simulation-time-and-deterministic-state.md) | [world-034](./world-034-time-skip-clock-exactness-and-catch-up-coverage.md), [npc-058](./npc-058-time-skip-resource-and-interrupt-parity.md), [fauna-040](./fauna-040-settlement-rat-reconciliation-checkpoint.md), [fauna-028](./fauna-028-animal-agent-update-cadence.md), [fauna-029](./fauna-029-animal-water-route-preference-and-corpse-world-time.md) |
| 03 | Persistence & lifecycle continuity | save/load, serialization, migrations, rebuild continuity, persistent identity | ⬜ not reviewed | - | - |
| 04 | Terrain, chunks & ground queries | chunk streaming/rebuild, height/ground authority, terrain modifications and surface queries | ⚠️ reviewed with unresolved high/critical findings | [review](../reviews/codebase-domain-audit/2026-09-19--04--terrain-chunks-and-ground-queries.md) | [world-terrain-043](./world-terrain-043-system-terrain-modification-rebuild-idempotency.md), [world-terrain-044](./world-terrain-044-runtime-ground-query-authority-and-missing-chunk-fallbacks.md) |
| 05 | Water system | ocean/lakes/rivers/wells, water queries/quality, drinking/swimming, reflection/mirror predicates | ⬜ not reviewed | - | - |
| 06 | Rendering & graphics runtime | renderer/scene/post-processing, visibility, LOD, shadows/reflections, GPU resource lifecycle | ⬜ not reviewed | - | - |
| 07 | World locations & caves | locations, landmarks, caves, spatial authority, occupancy, streaming, interaction | ⬜ not reviewed | - | - |
| 08 | Navigation & movement surface | navigation, routes, roads/bridges/fords, shared movement-ground queries, recovery | ⬜ not reviewed | - | - |
| 09 | Settlements — identity & world state | generation, IDs, names, bootstrap, lifecycle, founded settlements | ⚠️ reviewed with unresolved high/critical findings | [review](../reviews/codebase-domain-audit/2026-09-19--09--settlements-identity-and-world-state.md) | [settlements-017](./settlements-017-deterministically-unique-settlement-names.md), [settlements-020](./settlements-020-founded-settlement-bootstrap-integrity.md), [settlements-021](./settlements-021-shared-settlement-resident-runtime.md), [settlements-022](./settlements-022-founded-settlement-live-runtime-and-streaming.md) |
| 10 | Settlements — buildings/resources/infrastructure | buildings, wells, gardens, storage, resource sites, placement and ownership | ✅ reviewed | [review](../reviews/codebase-domain-audit/2026-09-19--10--settlements-buildings-resources-and-infrastructure.md) | [settlements-npcs-043](./settlements-npcs-043-settlement-cultivation-hydration-rain-and-farmer-watering.md), [settlements-npcs-025](./settlements-npcs-025-resource-storage-visualization.md), [settlements-npcs-021](./settlements-npcs-021-remote-production-site-logistics.md), [settlements-021](./settlements-021-shared-settlement-resident-runtime.md), [settlements-022](./settlements-022-founded-settlement-live-runtime-and-streaming.md) |
| 11 | Economy, trade & logistics | pricing, inventory flows, production/consumption, merchants, transport, atomic transfers | ⚠️ reviewed with unresolved high/critical findings | [review](../reviews/codebase-domain-audit/2026-09-19--11--economy-trade-and-logistics.md) | [settlements-npcs-052](./settlements-npcs-052-persistent-economic-work-cargo-and-local-transfer-conservation.md), [settlements-npcs-053](./settlements-npcs-053-active-transport-order-registry-lifecycle.md), [settlements-npcs-018](./settlements-npcs-018-physical-goods-transport-foundation.md), [settlements-npcs-019](./settlements-npcs-019-persistent-and-off-screen-transport.md), [settlements-npcs-020](./settlements-npcs-020-economy-driven-transport-demand-integration.md), [settlements-npcs-021](./settlements-npcs-021-remote-production-site-logistics.md), [settlements-npcs-034](./settlements-npcs-034-household-wood-authority-and-repair-correctness.md), [settlements-npcs-037](./settlements-npcs-037-inter-settlement-goods-transport.md) |
| 12 | NPC cognition | needs, problems, pressures, goals, decisions, strategies and action selection | ⚠️ reviewed with unresolved high/critical findings | [review](../reviews/codebase-domain-audit/2026-09-19--12--npc-cognition.md) | [npc-059](./npc-059-need-action-result-revalidation-and-atomic-relief.md), [npc-058](./npc-058-time-skip-resource-and-interrupt-parity.md), [npc-011](./npc-011-npc-burial-and-graves.md), [npc-032](./npc-032-expedition-needs-and-survival.md) |
| 13 | NPC movement, schedules & work | destination selection, locomotion, schedules, professions, interruption/resume, off-screen work | ⚠️ reviewed with unresolved high/critical findings | [review](../reviews/codebase-domain-audit/2026-09-19--13--npc-movement-schedules-and-work.md) | [npc-037](./npc-037-stale-work-contract-target-discovery-and-notice-cleanup.md), [npc-058](./npc-058-time-skip-resource-and-interrupt-parity.md), [settlements-npcs-052](./settlements-npcs-052-persistent-economic-work-cargo-and-local-transfer-conservation.md), [npc-032](./npc-032-expedition-needs-and-survival.md) |
| 14 | NPC social, households & dialogue | households, relationships, memory, social state and dialogue integration | ⬜ not reviewed | - | - |
| 15 | Combat — shared pipeline | player/NPC/fauna damage, threat, death, corpses, rewards and cross-actor symmetry | ⬜ not reviewed | - | - |
| 16 | Fauna ecosystem | spawn/population, habitat, hunger, predation, reproduction, migration and lifecycle | ⬜ not reviewed | - | - |
| 17 | Domestic animals & ownership | horses/livestock, ownership/assignment, persistence, following, death/disappearance | ⬜ not reviewed | - | - |
| 18 | Items, inventory & world items | item identity, stacks, pickup/drop, containers, transfers, tools and resource collection | ⬜ not reviewed | - | - |
| 19 | Player systems | needs, stamina/HP, equipment, skills, mounting, respawn/new-game continuity | ⬜ not reviewed | - | - |
| 20 | Interaction & input routing | target acquisition/cycling, prompts, priority, action dispatch, stale/invalid targets | ⬜ not reviewed | - | - |
| 21 | Quests, opportunities, reputation & badges | trigger/lifecycle state, idempotency, rewards, consequences and world-state coupling | ⬜ not reviewed | - | - |
| 22 | Audio | loading, lifecycle, spatial/environment state, cave transitions and shared loader behaviour | ⬜ not reviewed | - | - |
| 23 | UI ↔ simulation contracts | Vue/DOM projections, state synchronization, action boundaries, rebuild/stale references | ⬜ not reviewed | - | - |
| 24 | Performance & workers | recurring work, complexity, allocations, cache ownership, workers and off-screen scaling | ⬜ not reviewed | - | - |
| 25 | Shared utilities, config & debug tooling | shared helpers, defaults, cross-domain utilities, production/debug separation | ⬜ not reviewed | - | - |
| 26 | Cross-domain integration synthesis | findings and boundaries across world/settlements/NPC/fauna/player/quests/persistence | ⬜ not reviewed | - | - |

## Per-session procedure

At the start of each audit session:

1. Read `CLAUDE.md`.
2. Read this master plan and confirm the selected row is not already complete unless explicitly re-auditing it.
3. Read relevant sections of `docs/CODE_INDEX.md`, `docs/STATE.md`, domain state docs and `docs/architecture/`.
4. Check `docs/plans/README.md` and related active/planned work so existing plans are not rediscovered as new work.
5. Set the selected master row to **🔄 in review** before or as part of the review work.
6. Recon current source on `main`, following callers/consumers as needed.
7. Trace the required flows and record evidence.
8. Write the dedicated review artifact.
9. Create new implementation plans only for confirmed findings that are not already covered, following `docs/plans/PLANNING.md`.
10. Update the master row:
   - ✅ when reviewed and there are no unresolved high/critical findings;
   - ⚠️ when reviewed but high/critical findings remain unresolved.
11. Link the review artifact and any new/existing relevant plans in the row.
12. Commit and push all review/master/plan changes together to `main`, rebasing if needed.

## Guardrails

- Do not make broad production refactors as part of an audit session.
- Tiny correctness fixes should still be separated from review work unless the user explicitly requests implementation.
- Do not create duplicate plans for findings already covered by active/planned work.
- Do not mark an area reviewed from documentation alone.
- Tests are supporting evidence, not a substitute for tracing production code.
- Do not force a review to remain inside a source directory when the flow crosses ownership boundaries.
- Do not broaden one session into adjacent audit rows unless required to understand the selected flow; record adjacent issues as follow-ups instead.
- Area 26 should consume the completed review artifacts and inspect unresolved cross-domain seams; it should not repeat all 25 source audits from scratch.

## Completion criteria

This master plan is complete when:

- all 25 primary areas have a dedicated review artifact,
- each row has a final status and review link,
- confirmed findings are either linked to an existing plan, have a new focused plan, or explicitly document why no implementation plan is appropriate,
- area 26 synthesizes cross-domain seams and unresolved findings,
- no high/critical finding is left without an owner and next action.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

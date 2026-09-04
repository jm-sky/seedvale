# Refactoring Log

Central ledger of code refactoring work in Seedvale.

The log records **what was refactored, when, and in which commit**. It also tracks refactoring candidates discovered during architectural/code reviews so that useful findings do not disappear after the review is completed.

## Purpose

Use this file to answer two questions quickly:

1. **What code has already been refactored?**
2. **What code has been identified as worth refactoring but is still waiting?**

This is a lightweight historical ledger, not a replacement for implementation plans or reviews.

## Status

- `done` — refactoring was implemented and committed.
- `planned` — refactoring was identified and should be implemented later.
- `review requested` — an architectural review has been requested; the actual refactoring scope is not yet established.
- `deferred` — explicitly postponed because another dependency or larger redesign should happen first.
- `wontfix` — reviewed and intentionally not worth refactoring.

## Completed refactors

| Date | File / area | What changed | Commit | Review / Plan |
|------|-------------|--------------|--------|---------------|
| 2026-09-01 | `src/fauna/AnimalAgent.ts` | Threat-evaluation logic simplified/extracted as part of the fauna decision flow. | `0fb2f7b81aadc4e47740c4f7f9e207cb82ec2183` | fauna decision refactor history |
| 2026-09-02 | `src/fauna/AnimalAgent.ts` | Behaviour arbitration extracted into data-driven `faunaDecision.ts`; intent throttling partially extracted; tests added. | `d84e62ca9deac1f76d6af8a61f0f2d9ba570967d` | fauna decision refactor history |
| 2026-08-23 | `src/fauna/AnimalAgent.ts`, `src/ai/NpcAgent.ts` | Shared movement helper extracted/reused. | `dcbde607b7346eb4a1193321de95dcb7393f50d6` | shared agent infrastructure |
| 2026-08-23 | `src/fauna/AnimalAgent.ts`, `src/ai/NpcAgent.ts` | Shared status-label helper extracted/reused. | `1dfe769bec6ca79129557abe4a1696c24dc95986` | shared agent infrastructure |
| 2026-09-04 | — | Initial refactoring ledger created. | `305490fe057b7136be8243fe6131f88ce50f26d3` | `docs/REFACTORING.md` |

### AnimalAgent refactoring history

`AnimalAgent.ts` has already undergone incremental refactoring. The current architectural review must therefore treat the remaining responsibilities as the target, rather than proposing a duplicate rewrite.

Known areas previously identified for further work include the NPC interaction branches (`npc-attack` / `npc-ignore` / `npc-flee`), asymmetric `cancelSourceTarget()` ownership, and other responsibilities that may still belong outside the agent. The 2026-09-03 review prompt explicitly asks to verify current ownership against the codebase.

## Refactoring candidates

These are findings from code/architecture reviews or pending review requests that have not yet been implemented.

| Priority | File / area | Finding / reason | Suggested direction | Source | Status |
|----------|-------------|------------------|---------------------|--------|--------|
| 🔴 High | `src/settlement/createSettlement.ts` | 933-line orchestrator; 26-parameter positional constructor duplicated at two `SettlementsManager` call sites; multiple runtime subsystems are inlined in `update()` / `setDayNight()`; signpost/CSS2D-label idiom duplicated 4×; per-frame allocations in `update()`. | Extract cohesive runtime subsystems, replace the positional constructor with a structured dependency object, centralize repeated signpost/label creation, and remove avoidable per-frame allocations while preserving orchestration ownership. | `docs/reviews/` architectural review, 2026-09-04 | `planned` |
| 🔴 High | `src/ai/NpcAgent.ts` | Deep architectural review requested to determine whether the agent implements logic that belongs to existing NPC/world systems rather than coordinating them. | Review ownership, AI/decision/action logic, needs, movement, routines, household/social, interactions, presentation, lifecycle, config/helpers and cross-domain coupling before deciding what to extract. | `docs/prompts/2026-09-03--011--NpcAgent-refactor-review.md` | `review requested` |
| 🔴 High | `src/fauna/AnimalAgent.ts` | Deep architectural review requested despite previous incremental refactors. Remaining responsibilities must be distinguished from already-extracted behaviour arbitration and shared helpers. | Review state/lifecycle, movement, needs, predator/prey, combat, livestock, production, corpse/death, mounting, vocalization, presentation, player interaction and cross-domain coupling; do not duplicate previous refactors. | `docs/prompts/2026-09-03--012--AnimalAgent-refactor-review.md` | `review requested` |
| 🟠 Medium | `src/settlement/createSettlement.ts` | Review requested independently of the existing candidate entry so the final implementation scope can be based on current code rather than file size alone. | Validate orchestration vs monolith, ownership, initialization/cleanup, dependencies and existing reusable mechanisms. | `docs/prompts/2026-09-03--010--createSettlement-refactor-review.md` | `review requested` |

## Review → refactoring workflow

When an architectural/code review identifies a refactoring opportunity:

1. Record the candidate in **Refactoring candidates**.
2. Link the originating review and implementation plan when one exists.
3. Do not mark it `done` until the code is actually changed and committed.
4. After implementation, move the candidate to **Completed refactors** and record the implementation commit SHA.
5. If the refactoring is no longer appropriate, mark it `wontfix` and briefly record why.
6. For files that have already been refactored, record the incremental history instead of treating a new review as a first-time refactor.

## Commit convention

Use the full commit SHA when recording history, for example:

`d6df6e3d12caffdce04c84fc1eeafb8a13b69c20`

The date should be the implementation/commit date, not the date of the original review.

## Notes

- Refactoring means structural improvement of existing code without being primarily a new gameplay feature.
- Bug fixes and feature work may include incidental cleanup; only record it here when the structural change is meaningful enough to be useful as future maintenance history.
- Keep this file concise. Detailed reasoning belongs in `docs/reviews/`; implementation sequencing belongs in `docs/plans/`.

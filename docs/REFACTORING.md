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

| Date       | File / area                           | Commit     | Review / Plan                                     | What changed |
|------------|---------------------------------------|------------|---------------------------------------------------|--------------|
| 2026-09-04 | `src/settlement/createSettlement.ts`  | `e6c9fce1` | `2026-09-03--createSettlement-refactor-review.md` | -            |
| 2026-09-02 | `src/fauna/AnimalAgent.ts`            | `d84e62ca` | fauna decision refactor history                   | Behaviour arbitration extracted into data-driven `faunaDecision.ts`; intent throttling partially extracted; tests added. |
| 2026-09-01 | `src/fauna/AnimalAgent.ts`            | `0fb2f7b8` | fauna decision refactor history                   | Threat-evaluation logic simplified/extracted as part of the fauna decision flow. |
| 2026-08-23 | `src/fauna/AnimalAgent.ts`            | `dcbde607` | shared agent infrastructure                       | Shared movement helper extracted/reused. |
| 2026-08-23 | `src/ai/NpcAgent.ts`                  | `dcbde607` | shared agent infrastructure                       | Shared movement helper extracted/reused. |
| 2026-08-23 | `src/fauna/AnimalAgent.ts`            | `1dfe769b` | shared agent infrastructure                       | Shared status-label helper extracted/reused. |
| 2026-08-23 | `src/ai/NpcAgent.ts`                  | `1dfe769b` | shared agent infrastructure                       | Shared status-label helper extracted/reused. |

### AnimalAgent refactoring history

`AnimalAgent.ts` has already undergone incremental refactoring. The current architectural review must therefore treat the remaining responsibilities as the target, rather than proposing a duplicate rewrite.

Known areas previously identified for further work include the NPC interaction branches (`npc-attack` / `npc-ignore` / `npc-flee`), asymmetric `cancelSourceTarget()` ownership, and other responsibilities that may still belong outside the agent. The 2026-09-03 review prompt explicitly asks to verify current ownership against the codebase.

## Refactoring candidates

These are findings from code/architecture reviews or pending review requests that have not yet been implemented.

| Priority    | File / area                           | Status              | Finding / reason | Suggested direction | Source |
|-------------|---------------------------------------|---------------------|------------------|---------------------|--------|
| 🔴 High     | `src/ai/NpcAgent.ts`                  | `review requested`  | Deep architectural review requested to determine whether the agent implements logic that belongs to existing NPC/world systems rather than coordinating them. | Review ownership, AI/decision/action logic, needs, movement, routines, household/social, interactions, presentation, lifecycle, config/helpers and cross-domain coupling before deciding what to extract. | `docs/prompts/2026-09-03--011--NpcAgent-refactor-review.md` |
| 🔴 High     | `src/fauna/AnimalAgent.ts`            | `review requested`  | Deep architectural review requested despite previous incremental refactors. Remaining responsibilities must be distinguished from already-extracted behaviour arbitration and shared helpers. | Review state/lifecycle, movement, needs, predator/prey, combat, livestock, production, corpse/death, mounting, vocalization, presentation, player interaction and cross-domain coupling; do not duplicate previous refactors. | `docs/prompts/2026-09-03--012--AnimalAgent-refactor-review.md` |
| 🟠 Medium   | `src/settlement/createSettlement.ts`  | `review requested`  | Review requested independently of the existing candidate entry so the final implementation scope can be based on current code rather than file size alone. | Validate orchestration vs monolith, ownership, initialization/cleanup, dependencies and existing reusable mechanisms. | `docs/prompts/2026-09-03--010--createSettlement-refactor-review.md` |

## Review → refactoring workflow

When an architectural/code review identifies a refactoring opportunity:

1. Record the candidate in **Refactoring candidates**.
2. Link the originating review and implementation plan when one exists.
3. Do not mark it `done` until the code is actually changed and committed.
4. After implementation, move the candidate to **Completed refactors** and record the implementation commit SHA.
5. If the refactoring is no longer appropriate, mark it `wontfix` and briefly record why.
6. For files that have already been refactored, record the incremental history instead of treating a new review as a first-time refactor.

## Commit convention

Use the short commit SHA when recording history, for example:

`d6df6e3d12caffdce04c84fc1eeafb8a13b69c20`

The date should be the implementation/commit date, not the date of the original review.

## Notes

- Refactoring means structural improvement of existing code without being primarily a new gameplay feature.
- Bug fixes and feature work may include incidental cleanup; only record it here when the structural change is meaningful enough to be useful as future maintenance history.
- Keep this file concise. Detailed reasoning belongs in `docs/reviews/`; implementation sequencing belongs in `docs/plans/`.

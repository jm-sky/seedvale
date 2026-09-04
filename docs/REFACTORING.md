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
- `deferred` — explicitly postponed because another dependency or larger redesign should happen first.
- `wontfix` — reviewed and intentionally not worth refactoring.

## Completed refactors

| Date | File / area | What changed | Commit | Review / Plan |
|------|-------------|--------------|--------|---------------|
| 2026-09-04 | — | Initial refactoring ledger created. Existing history is not yet retroactively exhaustive. | `TBD` | — |

> Add one row per meaningful refactoring commit. If a commit changes several tightly coupled files, use one row with the main area and list the files below it when useful.

## Refactoring candidates

These are findings from code/architecture reviews that have not yet been implemented.

| Priority | File / area | Finding | Suggested direction | Source | Status |
|----------|-------------|---------|---------------------|--------|--------|
| 🔴 High | `src/settlement/createSettlement.ts` | 933-line orchestrator; 26-parameter positional constructor duplicated at two `SettlementsManager` call sites; multiple runtime subsystems are inlined in `update()` / `setDayNight()`; signpost/CSS2D-label idiom duplicated 4×; per-frame allocations in `update()`. | Extract cohesive runtime subsystems, replace the positional constructor with a structured dependency object, centralize the repeated signpost/label creation, and remove avoidable per-frame allocations while preserving orchestration ownership. | `docs/reviews/` architectural review, 2026-09-04 | `planned` |

## Review → refactoring workflow

When an architectural/code review identifies a refactoring opportunity:

1. Record the candidate in **Refactoring candidates**.
2. Link the originating review and implementation plan when one exists.
3. Do not mark it `done` until the code is actually changed and committed.
4. After implementation, move the candidate to **Completed refactors** and record the implementation commit SHA.
5. If the refactoring is no longer appropriate, mark it `wontfix` and briefly record why.

## Commit convention

Use the full commit SHA when recording history, for example:

`d6df6e3d12caffdce04c84fc1eeafb8a13b69c20`

The date should be the implementation/commit date, not the date of the original review.

## Notes

- Refactoring means structural improvement of existing code without being primarily a new gameplay feature.
- Bug fixes and feature work may include incidental cleanup; only record it here when the structural change is meaningful enough to be useful as future maintenance history.
- Keep this file concise. Detailed reasoning belongs in `docs/reviews/`; implementation sequencing belongs in `docs/plans/`.

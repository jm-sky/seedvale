# Plan: AnimalAgent refactor after architectural review

**Created:** 2026-09-06
**Status:** `draft` 📝
**Type:** refactor
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `fauna`
**Subdomains:** `behavior` `lifecycle`
**Tags:** `AnimalAgent` `architecture` `refactor`

## Goal

Refactor `src/fauna/AnimalAgent.ts` only where the dedicated architectural review demonstrates that responsibilities should be extracted, simplified, or moved to existing shared mechanisms.

This is intentionally a working implementation plan. The exact implementation scope must not be finalized before the review below is completed.

## Required review first

Before implementing this plan, execute:

`docs/prompts/2026-09-03--012--AnimalAgent-refactor-review.md`

The review must produce:

`docs/reviews/2026-09-03--AnimalAgent-refactor-review.md`

Treat that report as the implementation discovery for this plan. It should identify what belongs in `AnimalAgent`, what should move elsewhere, existing mechanisms to reuse, proposed structure, implementation order, affected files, risks, and verification.

Do **not** start the refactor before this review exists.

## Implementation scope

After the review is complete:

1. Read its final verdict (`REFRACTOR`, `MINOR REFACTOR`, or `KEEP AS IS`) and effort estimate.
2. Update this plan from `draft` to a concrete implementation plan based on the review findings.
3. Keep `AnimalAgent` as the central orchestrator where that ownership is appropriate; do not split responsibilities merely because the file is large.
4. Implement only the concrete extractions, simplifications, ownership fixes, or reuse opportunities justified by the review.
5. Prefer existing fauna, combat, movement/navigation, world, settlement, NPC, lifecycle, persistence, audio, animation, and interaction mechanisms over parallel abstractions.
6. Preserve animal behaviour, persistence semantics, deterministic simulation, and existing integration boundaries unless the review explicitly identifies a defect in them.
7. Add or adjust focused tests around moved/extracted logic and regression-sensitive behaviour.
8. Add JSDoc for important architectural/public functions or classes introduced or materially changed by the refactor; use `@domain fauna` where useful for preflight discovery.

If the review concludes `KEEP AS IS`, do not manufacture refactor work. Update this plan accordingly and close it without unnecessary code changes.

## Constraints

- Repository code is the source of truth; the review and this plan must follow current code rather than older plans or docs.
- Avoid a replacement God Object, duplicated state, parallel behaviour pipelines, or speculative architecture.
- Preserve world independence from the player and compatibility with off-screen/hybrid simulation.
- Avoid unrelated fauna redesigns or feature work.
- Keep performance-sensitive hot paths explicit; do not introduce extra per-animal allocations or cross-system indirection without justification.

## Expected implementation workflow

### Phase 0 — Architectural review

Run the existing review prompt and commit its report. No production refactor in this phase.

### Phase 1 — Finalize this plan

Translate the accepted review findings into concrete implementation steps in this file, including exact scope, files/systems involved, dependencies, migration concerns, tests, and verification. Adjust `Effort`, metadata, and dependencies if the review reveals better values.

### Phase 2 — Implement the refactor

Apply the approved changes incrementally. Keep behaviour-compatible steps small enough that regressions can be attributed to a specific extraction or ownership change.

### Phase 3 — Automated verification

Run the relevant unit tests plus project typecheck/build/test commands required by the current repository configuration. Add focused regression tests for extracted pure logic and changed integration seams.

### Phase 4 — Manual verification handoff

Document the browser/manual checks required for the affected animal behaviours. Manual browser verification is performed by the user, not the AI agent.

## Out of scope

- New animal behaviours or species.
- Balance changes unrelated to a refactor regression.
- Rewriting shared NPC, combat, settlement, navigation, persistence, audio, or animation systems unless the review proves a narrowly required integration fix.
- Broad architectural cleanup outside the responsibility boundaries touched by `AnimalAgent`.

## Completion criteria

- `docs/reviews/2026-09-03--AnimalAgent-refactor-review.md` exists and was used as the implementation basis.
- This plan was updated with the concrete accepted findings before production refactor work began.
- Accepted refactor work is implemented without introducing parallel state or duplicate systems.
- Relevant automated checks pass.
- Required manual browser verification is documented for the user.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

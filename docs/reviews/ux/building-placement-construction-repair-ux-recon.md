# UX Recon: Building, Placement, Construction & Repair

**Model:** Claude Code — Opus
**Scope:** focused recon/review only; no implementation.

## Goal

Review the complete player-facing build lifecycle from choosing a buildable through placement, construction, inspection, completion, deterioration, repair and removal.

## Review scope

- selecting/starting a build action,
- material/tool/work requirements and how they are communicated,
- placement preview lifecycle,
- footprint/orientation/door direction and rotation controls,
- placement validity and invalid-placement feedback,
- confirm/cancel behaviour,
- consistency across different buildable types,
- unfinished construction state and progress readability,
- player and NPC contribution through the shared `contributeWork(id, amount)` seam,
- inspection via `[V]` / `WorldInspection`,
- contextual construction actions through `[E]` / `[R]`,
- completed structure state and ownership where relevant,
- condition/damage/component state where applicable,
- repair quote/start/progress/completion flows,
- removing unfinished objects and material recovery,
- relationship between `placementPreview`, buildable domain rules, work contracts, condition and repair mechanisms,
- duplicated build/repair UI or action paths that should reuse existing shared mechanisms.

## Key questions

- Can the player understand what will be built and exactly where/how it will be oriented before confirming?
- Is invalid placement explained clearly enough to correct it?
- Is required material/work progress visible at the right time?
- Are unfinished and completed structures visually and interactively distinct?
- Is `[V]` inspection useful and consistent with E/R actions?
- Does repair expose what is damaged, what is required and what the result will be?
- Do all buildables use shared placement/work/condition/repair mechanisms where applicable?

## Output

Produce a concise review with concrete findings, affected files/systems, severity (`P0 blocker`, `P1 confusing`, `P2 friction`, `P3 polish`) and recommendations based on existing mechanisms. Separate UX problems from implementation/architecture problems.

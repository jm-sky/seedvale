# UX Recon: Interactions & Targeting

**Model:** ChatGPT — GPT-5.6 Sol
**Scope:** focused recon/review only; no implementation.

## Goal

Review the full player interaction flow for consistency, discoverability and feedback across the current codebase.

## Review scope

- gaze/target acquisition and interactable selection,
- conflicts when multiple nearby targets are valid,
- prioritisation of interactables,
- `[E]` primary, `[R]` alternate and `[V]` inspect/details,
- contextual actions and action availability,
- blocked/disabled actions and explanation of why an action cannot be performed,
- consistency between desktop and mobile interaction controls,
- relationship between `interactables`, gameplay actions and `WorldInspection`,
- repeated/parallel interaction mechanisms that should reuse shared seams,
- interaction feedback before, during and after an action,
- representative cases: camp equipment, containers, NPCs, animals, buildables, water, corpses, resources and quest-related interactions.

## Key questions

- Does the player reliably understand what is currently targeted?
- Is the selected action predictable when several objects overlap?
- Are E/R/V roles consistent across systems?
- Can the player discover alternate and inspect actions without trial and error?
- When an action is blocked, is the reason visible and actionable?
- Are interaction rules implemented centrally where an existing shared mechanism already exists?

## Output

Produce a concise review with concrete findings, affected files/systems, severity (`P0 blocker`, `P1 confusing`, `P2 friction`, `P3 polish`) and recommendations based on existing mechanisms. Separate UX problems from implementation/architecture problems.

# NPC Burial & Graves — Implementation Notes

## Current-state findings

- `npc-010` is still `planned` in `docs/plans/README.md`. The repository has authoritative `HealthState` and NPC death state (`NpcAuthoritativeState.health.dead`), but the planned NPC corpse lifecycle is not yet present. 011 must consume the actual 010 implementation/API rather than inventing a parallel corpse representation.
- `NpcAuthoritativeState` already survives settlement unload/reload and same-session `WorldBundle` rebuilds, but is intentionally not persisted to `SaveData`.
- The current NPC planning model is narrower than the 011 plan: `NpcPlan` maps `NeedId` to `NpcGoalId`; `NpcGoalId` currently contains only `fulfilWorkDuty`, `obtainWood`, `secureFood`, `secureWater`; `NpcStrategyId` is a closed need-strategy union. There is no separate generic Problem model.
- Do not force burial through a fake physiological `NeedId`. If burial needs a persistent goal/strategy, extend the existing plan/decision seams minimally so a social/world problem can coexist with needs.
- `NpcAgent` already owns the generic action FSM: `goTo` → `execute`, `PlannedAction`, `ActionLifecycle`, cancellation/failure/completion and movement watchdog/repath. Burial should become another action chain, not another FSM.
- Shared navigation is `src/navigation/navigation.ts`: bounded local A*, request-driven, with caller-provided walkability. Do not add burial-specific navigation.
- NPC construction is settlement-owned (`createSettlement.ts`). Each settlement already has materialized agents, households, NPC state and NPC↔NPC relationship data. This is the natural locality boundary for death awareness; avoid a world-wide NPC scan/registry.
- Household state is shared real state (`src/settlement/household.ts`). Use household membership/relationships as the first awareness/responsibility source.
- NPC↔NPC relations live separately from player-facing `QuestManager` relations (`settlement/npcRelationships.ts`). Do not mix burial social context into player quest relations.
- `WorldBundle` is the lifetime/rebuild owner for world objects. Existing persistent world-object systems use record → runtime collection → `WorldBundle` field → save/load input → carry across rebuild. Graves should follow this pattern if persisted; do not put grave state inside `NpcAgent`.
- `SaveData` currently has no grave record. Persistent graves therefore require a small save-record addition and wiring through the existing persistence/build path; this is separate from NPC runtime persistence.
- `HealthState` is combat-agnostic. Do not put burial hooks, corpse lifecycle or grave creation there.

## Death → awareness

There is no need for a global event bus. Prefer a settlement-local notification after 010 creates/owns the corpse: death transition → settlement-local death/corpse notification → relevant household/relationship NPCs.

Keep awareness bounded: same household first, then existing relationship/role context if already represented. Do not implement global 'everyone knows' propagation. Awareness should reference the actual 010 corpse/world-object ID, not copy corpse state.

Choose the exact callback only after 010 lands because 010 owns corpse creation/lifecycle.

## Decision / plan integration

The current pipeline is `Needs → pressures → NeedId → strategy → PlannedAction`. It has no native Problem input. Burial is therefore a real architectural extension, but it should stay small.

Preferred shape: keep Needs for physiological/resource arbitration; add a small social/world-pressure candidate seam to the existing choice flow; represent burial as an ordinary `NpcPlan`/strategy/action once selected. Do not create `BurialManager` or burial-specific scoring.

If `NpcPlan`/`NpcStrategyId` is extended, allow `buryDeceased` to exist independently of `goalForNeed()` rather than inventing a bogus NeedId.

Responsibility can reuse existing household relationship, role, current workload/plan, distance and ability data. Do not invent grief, inheritance, legal ownership or another relationship model.

## Corpse handoff

010 owns corpse lifecycle. 011 needs a narrow handoff contract with it.

Core invariant: one corpse → at most one burial execution → at most one grave.

Prefer the claim/reservation on the 010-owned corpse record (or its smallest lifecycle object), not a global lock manager. Re-check at execution time: corpse exists, remains eligible, is not buried, is not claimed by another NPC, and still references the expected deceased NPC.

Natural decay in 010 must respect a legitimate burial claim/transition and must not remove a corpse during active burial.

If the corpse disappears first, use normal plan/action cancellation or obsolescence. Never leave an NPC stuck at a dead destination.

## Burial action

Use the existing NPC action contract: destination = corpse interaction/approach point; normal `goTo`; existing destination-aware approach/navigation; `execute` performs the atomic burial transition; completion records consequences only after success.

Do not teleport or directly modify `mesh.position`. No burial animation is required for correctness if an existing timed interaction fallback is sufficient.

The world transition should be one idempotent 010-owned operation returning success/failure rather than several loosely ordered writes.

## Grave representation

A grave is a persistent world object, not NPC state.

Minimal record: stable ID, position, deceased NPC/death-record reference, and burial/creation time only if an existing world-time convention needs it. Do not duplicate corpse state.

Do not create a global grave database. A local `Graves` world-object collection owned by `WorldBundle` follows the existing placed-object architecture. IDs must be stable and must not depend on array position.

## Persistence / rebuild

Current `SaveData` has no grave type, so the plan's persistence requirement is not already satisfied.

Follow the existing persistent world-object pattern: `SaveGrave[]` ↔ runtime `GraveRecord[]` ↔ `WorldBundle.graves`.

Save only minimal grave state. Never recreate a grave from a dead NPC, rerun burial on load, or deduplicate by array position. A corpse reference should remain informational unless 010 explicitly persists death records.

During `rebuildWorldBundle()`, snapshot graves before disposal and pass them into the new world build. Preserve them for same-session rebuilds; reset them for a genuinely new world/seed.

## Off-screen constraint

This is the biggest current mismatch with the plan. `SettlementsManager` streams settlements by player distance and NPC agents are created with streamed settlements; there is no general full-fidelity off-screen NPC action executor.

Do not fake off-screen burial by pretending an unloaded NPC navigated. If strict off-screen burial remains mandatory, make the missing adaptive/off-screen simulation seam explicit before implementation. Otherwise scope the first implementation to the simulation level actually supported by current settlement loading.

## Debug / verification

Reuse existing NPC trace/debug facilities. Useful events: death awareness + corpse ID, burial candidate/goal, selected executor, claim acquired/rejected, approach/action started, burial transition result, grave ID/position, cancellation reason.

Important failure cases: corpse with no eligible NPC; unreachable corpse; two NPCs targeting one corpse; corpse disappearing/decaying; successful burial with exactly one grave; save/reload and WorldBundle rebuild preserving exactly one grave.

## Non-goals

Do not expand this work into full NPC persistence, mourning/grief/funeral, inheritance, household restructuring, global death/memory registry, new pathfinding, a second corpse lifecycle, a burial-specific AI/FSM, or player-only quest logic.
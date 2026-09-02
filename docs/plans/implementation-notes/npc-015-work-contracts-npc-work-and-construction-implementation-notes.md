# Implementation Notes: Work Contracts — NPC Work & Construction

**Reviewed:** 2026-09-02
**Plan:** npc-015-work-contracts-npc-work-and-construction.md

## Critical precondition

- **npc-014 is not implemented in the current codebase.** It is still planned in docs/plans/README.md. The current repo contains the 014 plan and its implementation notes, but no runtime WorkContract/notice-board/contract-flag implementation. Therefore this plan cannot be implemented coherently until 014 lands.
- Treat 014's implementation-notes as intended architecture only; verify its actual implementation after it lands. Do not code against file names or APIs suggested there as if they already exist.
- The current main HEAD is already newer than the 014/015 planning commits (2026-09-02); repository code remains the source of truth.

## Current NPC architecture to extend

- src/ai/NpcAgent.ts is the existing NPC execution point. Its flow is: update() → choose → pressure/personality arbitration → beginNeed()/beginIdle() → startAction() → goTo → execute.
- startAction() is the generic goTo → execute seam for NPC work. Do not add a contract-specific FSM, scheduler, or movement implementation.
- NpcAgent already has persistent goal/strategy state through src/ai/npcPlan.ts, but that system is explicitly need-driven. A work contract is a commitment/opportunity, not a new NeedId or a new NpcPlan goal by default.
- tickCriticalInterrupt() is the existing interruption seam. It cancels an in-flight action only for critical need/vigor conditions and returns to normal arbitration; this is the behaviour the contract commitment should preserve.
- Existing schedule work is selected by beginIdle() from src/ai/schedule.ts. Contract work should override/augment the idle/work opportunity only through the existing decision point, not by adding a second scheduler.
- NpcAuthoritativeState in src/settlement/npcState.ts is the cross-reconstruction state boundary, but full NPC SaveData persistence is deliberately not implemented. Avoid adding a second copy of contract state to both NPC state and a world contract record.

## Recommended contract ownership

- The authoritative contract should remain a world-level system, carried by WorldBundle, because contracts are player-created world state and may target arbitrary locations.
- The contract record should own the worker assignment (workerNpcId) and lifecycle. The NPC's commitment can be resolved from the contract system by NPC id instead of storing a second authoritative contractId inside NpcAuthoritativeState.
- If a hot lookup is needed, maintain an internal npcId → contractId index inside the contract system and rebuild it from authoritative records. Do not make the index persistent state.
- After 014 lands, reuse its exact target/advertisement/flag APIs. Do not recreate target references, board publication state, or contract lifecycle types in npc-015.

## Decision integration

- The current decision system only generates candidates from needs and then selects a need. A contract is a new opportunity/commitment candidate, so first identify the existing decision seam in NpcAgent.update() and its diagnostics rather than inserting contract logic into Needs.ts.
- Do not add NeedId = work. Work pressure is not a physiological need and would distort existing need arbitration.
- A practical integration is: normal pressure arbitration remains authoritative; when no urgent need wins, evaluate an advertised contract as an additional opportunity at the same decision point, using the existing deterministic scoring/decision trace infrastructure. An accepted contract then becomes a commitment that can be resumed after interruption.
- The contract score should be pure/deterministic and based on values already available to the NPC: reward, travel estimate, work estimate, suitability/role/ability, current pressure, and existing commitment. Avoid a hard reward threshold.
- Keep evaluation separate from acceptance/mutation. The board/contract system owns lifecycle transitions; NPC decision code asks for available opportunities and chooses one.

## Discovery and scope

- Only contracts whose advertisement is actually posted on a notice board are discoverable. Do not scan all world contracts and do not expose unposted contracts through a global NPC hook.
- Prefer a bounded/local lookup supplied by the settlement/board that currently contains the NPC. The NPC should not perform a world-wide contract scan every decision.
- Since settlements are streamed, the discovery API must work when the settlement is present and must not depend on player proximity beyond the existing settlement simulation lifetime.
- Do not add a special read-board FSM unless the landed 014 implementation already establishes one. Discovery can be a decision opportunity sourced from the NPC's settlement/board state.

## Travel and navigation

- Reuse NpcAgent.startAction() and the existing steerWithRescue()/findPath() navigation stack. The current navigation layer is bounded local-grid A* used as a rescue route, not a global navmesh.
- The contract destination must resolve from the authoritative contract target/flag. Never copy the target position into NPC state as a second authority.
- If the NPC must approach a construction target with a specific interaction offset, expose that as part of the target/construction resolver; do not hard-code a contract-specific offset in NpcAgent.
- Reuse the existing movement watchdog. A stuck contract action must eventually enter the existing failure/abandon path rather than remain in goTo forever.

## Construction: important current-code discrepancy

- There is **no generic NPC construction pipeline** in the current codebase.
- Player-built construction is object-specific. The clearest example is src/world/playerWell.ts + src/app/actions/placementActions.ts: PlayerWellRecord owns stage/progress, while placementActions.ts owns player busy-channel execution, capability/material checks and mutation.
- NpcAgent already performs several profession work actions, but those are domain-specific NpcPlannedAction callbacks (farmer/fisher/miner/etc.), not a reusable construction executor.
- Therefore do not call the player action workOnWell() from NPC AI and do not duplicate its player-inventory/busy-channel assumptions. Extract/reuse the domain-level construction rules from the target object and add the smallest actor-neutral work seam required for NPC execution.
- For a construction target, keep authoritative progress/material/state in the existing world-object record. NPC construction should advance that same record; it must not create a worker-only progress field.
- Reuse items/constructionMaterials.ts for material semantics where applicable, but decide explicitly whose inventory supplies contract materials. The current plan excludes advanced provisioning, so do not silently invent a worker supply chain.
- The first implementation should probably be constrained to construction targets for which the existing world-object domain can already represent incremental work (for example the player-built well). If 014 supports arbitrary construction target references, add a capability/adapter layer rather than a giant switch in NpcAgent.

## Needs, interruptions and resumption

- tickNeeds() already runs regardless of goTo/execute, so contract travel/work naturally continues to age hunger/thirst.
- tickCriticalInterrupt() already provides the intended urgent-need interruption behaviour. Reuse it; do not add a contract-specific hunger/thirst interrupt.
- A critical interruption currently calls interruptCurrentAction(), clears the concrete action and marks the current need-plan interrupted. A contract commitment must survive this cleanup so the next decision can resume the contract.
- Distinguish temporary interruption from abandonment. Do not transition the contract to failure merely because interruptCurrentAction() ran.
- Existing vigor exhaustion also resumes the previous phase. Contract work should use the same path rather than inventing a worker rest state.

## Re-evaluation and failure

- Re-evaluate before starting work after travel and when a meaningful contract/target condition changes. Do not continuously rescore every frame.
- If the NPC is dead, the contract must leave its active worker state through an explicit cancellation/failure transition; NpcAgent.die() currently clears transient actions and has no contract knowledge.
- Invalid/missing target, construction no longer possible, or an NPC no longer able to fulfil the commitment must have a terminal/abandoned contract transition. Never leave travelling/working indefinitely.
- Use explicit lifecycle transition functions in the contract domain. Do not mutate state directly from NpcAgent, board interaction, or rendering code.

## Persistence and WorldBundle lifecycle

- The current architecture intentionally does not persist complete NPC runtime state. Do not broaden this plan into full NPC persistence.
- The contract itself is persistent world state, so 014's SaveData + src/app/saveState.ts integration must be extended with the worker/lifecycle fields required here.
- Prefer restoring the authoritative contract first, then deriving the NPC's outstanding commitment from workerNpcId. This avoids adding a second persisted NPC contract field.
- Verify stable NPC ids: NpcStateRegistry already keys NPC authoritative runtime state by stable id; use the same id, never settlement array index or NPC object identity.
- Same-session WorldBundle rebuild is separate from save/load. Carry the live contract records through createWorldBundle()/rebuildWorldBundle() just like other player-created world state. Do not reset accepted contracts when settlements/NPC agents are recreated.
- On settlement unload/reload, the contract commitment must survive agent reconstruction. This is another reason to keep assignment authoritative outside the NpcAgent instance.

## Debugging

- Reuse NpcAgent's existing NpcTraceBuffer, inspection snapshot and ?debug=1 diagnostics. Extend these only with the minimum contract fields needed to explain: discovered contract id, evaluation score/factors, acceptance, current contract stage, interruption vs abandonment, construction completion/failure.
- Keep evaluation output deterministic and plain-data so it can be logged/tested without rendering.
- Do not create a dedicated contract debug UI for this plan.

## Focused tests / pitfalls

- Test pure contract lifecycle transitions separately from NPC decision scoring.
- Test that only posted advertisements enter NPC candidates.
- Test deterministic score ordering and that travel/work duration materially affect the result.
- Test duplicate/conflicting acceptance cannot assign one NPC to two active contracts.
- Test critical need interruption preserves the commitment and later resumes it.
- Test invalid target/dead NPC/stuck work cannot leave an active contract permanently stranded.
- Test construction completion produces payment_due and does not pay.
- Test save/load and same-session WorldBundle rebuild preserve the accepted worker and contract stage.
- Avoid a global contract scan per NPC/frame, a second scheduler, a work NeedId, a contract-specific navigation system, or a second construction progress model.

## Suggested implementation order

1. Land and verify npc-014 first; inspect its actual APIs rather than assuming the implementation-notes names.
2. Define the smallest contract-domain query/assignment seams needed by NPC decision code.
3. Integrate contract opportunities into the existing NPC decision/trace path without adding a new scheduler or NeedId.
4. Add commitment-aware resume/interruption handling.
5. Add target travel through existing startAction()/navigation.
6. Extract the smallest actor-neutral construction-work seam from the existing target object; keep progress/material authority in the world object.
7. Add completion → payment_due transition.
8. Extend persistence and WorldBundle rebuild handling.
9. Add focused unit tests and then browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
# Plan: NPC accompany/follow commitment

**Created:** 2026-09-11
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-019~~
**Domain:** `npc`
**Subdomains:** `behavior` `decision-making` `lifecycle`
**Tags:** `companions` `follow` `commitment` `travel`
**Roadmap:** `companions.md`

## Goal

Introduce one shared, persistent `accompany/follow commitment` for an ordinary NPC. It is the execution foundation for later paid Work Contract accompaniment and voluntary joining.

The NPC remains an ordinary inhabitant using the existing needs/pressures, decision arbitration, actions, navigation, combat/flee, schedules, places, household and persistence systems.

`follow` is execution of a commitment by a normal NPC. It is not a separate companion AI mode.

Do not create `CompanionAI`, `CompanionManager`, `PartyManager`, separate companion needs/navigation/combat, or separate paid/voluntary follow implementations.

## Current architecture and reuse

### Authoritative NPC state

`src/settlement/npcState.ts::NpcAuthoritativeState`, owned through `NpcStateRegistry` by `SettlementsManager`, is the persistent cross-reconstruction NPC state boundary. It already owns needs, health/vigor/injury/conditions, personal inventory and `activePlan`, and is serialized through `SaveData.npcStates`.

The accompany commitment belongs on this authoritative boundary, not only on `NpcAgent`.

### Active Plan is not the commitment owner

`src/ai/npcPlan.ts::NpcPlan` is a single persistent plan for the currently pursued Goal, primarily driven by needs. It may be interrupted, resumed, completed or made obsolete when arbitration selects another Goal.

Accompaniment must coexist with temporary plans such as obtaining food/water or other survival responses. Do not model accompaniment as a new exclusive `activePlan` Goal that suppresses ordinary NPC decision-making.

### Decision and action pipeline

`NpcAgent` currently follows the established path:

```text
pressures
→ arbitration
→ decision
→ beginNeed / beginHeal / beginSeekShelter / beginIdle
→ PlannedAction
→ startAction()
→ goTo / execute
```

Work Contracts already provide the relevant commitment pattern: `NpcAgent.beginIdle()` calls `tryPursueWorkContract()` only after more important pressures have had a chance to win arbitration. The authoritative contract assignment survives an ordinary action interruption and is found again on a later decision cycle.

Accompaniment should use the same principle: urgent needs, weather, combat or fleeing may interrupt current follow execution without deleting the underlying commitment.

### Navigation and follow-like behaviour

Reuse `NpcAgent.startAction()` and the existing `goTo` / `steerWithRescue()` navigation stack. Do not create companion locomotion or a second navigation system.

`src/fauna/followHysteresis.ts::resolveFollowHysteresis()` already implements start/stop-distance hysteresis used by animal Follow/Lead behaviour. Move or expose this as a neutral shared primitive if necessary and reuse it for NPC follow rather than duplicating the distance logic.

Existing `NpcAgent` player-approach behaviour is also a precedent for an action whose target is the player's current position. Extend the generic movement path narrowly for a moving target where needed.

### Schedule and return to normal life

Existing schedule/place behaviour in `src/ai/schedule.ts`, `src/settlement/places.ts` and `NpcAgent.beginIdle()` already returns ordinary NPCs to home, workplace, social place, eating and sleep activities.

Ending accompaniment must hand the NPC back to ordinary world life. Do not create companion-specific homes, schedules or return managers.

### Work Contract ownership

Work Contracts remain world-owned through `src/world/workContract.ts` / `src/world/createWorkContracts.ts`. `findActiveWorkByNpc()` is the authoritative lookup for active work assignments; `NpcAgent` does not duplicate that assignment in `NpcAuthoritativeState`.

Future paid accompaniment must preserve this separation:

- Work Contract owns offer, acceptance, employer, reward/payment and contractual completion/failure.
- Accompany commitment owns the shared NPC execution intent: follow/stay, interruption/resume and termination semantics.

A voluntary join is another source of the same accompany commitment, not a zero-price Work Contract and not another follow implementation.

### Persistent/off-screen travel dependency

Current NPC position is runtime state on the live `NpcAgent` rather than part of `NpcAuthoritativeState`, and `SettlementsManager` can dispose streamed-out settlements and their live NPC agents.

`settlements-npcs-019-persistent-and-off-screen-transport.md` is therefore a prerequisite. Implement it first and ensure it exposes/reuses a generic persistent/off-screen NPC travel continuity primitive rather than transport-specific movement only.

`npc-029` must consume that shared mechanism for spatial handoff, off-screen continuity and reification. It must not create `CompanionOffscreenEngine` or another parallel travel simulation.

## Architectural decisions

### 1. One source-neutral accompany commitment

Extend `NpcAuthoritativeState` with one optional persistent accompany commitment. Keep the type small and semantic: target/source reference, follow/stay mode, lifecycle/end semantics and only continuity data required by the shared travel mechanism.

Do not persist mesh references, path waypoints, animation state, navigation watchdog state or action closures.

One NPC may have at most one active accompany commitment in this plan.

### 2. First target is the player

The first implementation follows the player. Store a stable semantic target such as `player`, never a `PlayerController`, mesh or `THREE.Vector3` reference.

Resolve the player's current position from the existing simulation inputs.

Do not generalize into a party/actor framework unless a tiny target abstraction is directly useful to the current implementation.

### 3. Commitment and execution state stay distinct

Persistent commitment answers why/whom/how the NPC is accompanying.

Transient execution such as current follow movement, local path rescue, current distance and action lifecycle stays runtime state unless the shared travel dependency explicitly requires a minimal persistent continuity checkpoint.

Do not build a persistent companion FSM around local movement details.

### 4. Follow/stay are modes of the same commitment

Support:

- `follow` — maintain a sensible distance band from the player using shared hysteresis and ordinary NPC movement;
- `stay` — retain a stable world anchor while the commitment remains active.

Both modes remain interruptible by ordinary NPC survival/danger decisions. After the interruption, execution resumes from the still-active commitment.

Changing follow/stay does not create a new commitment.

### 5. Accompaniment is an idle-tier duty, not a NeedId

Integrate accompaniment after ordinary higher-priority pressures have been arbitrated, alongside the existing commitment/schedule boundary rather than inventing a physiological need.

Conceptually:

```text
needs / danger / weather / survival
→ normal arbitration
→ idle-duty opportunity
→ active accompany commitment? pursue it
→ otherwise existing work/schedule/idle
```

Do not change ordinary need thresholds for accompanying NPCs.

Avoid two unrelated `first wins` commitment checks. If needed, introduce a small idle-duty dispatch seam that can represent existing Work Contract execution and accompany execution without becoming a general policy framework.

A new incompatible Work Contract/accompany commitment should be rejected at its creation/acceptance boundary rather than arbitrated every frame.

### 6. Follow uses ordinary NPC movement

Follow resolves the current target position, applies shared follow hysteresis and executes through the normal `NpcAgent` action/navigation path.

Do not position-lock or teleport the NPC to the player.

A moving target may require narrowly extending the existing dynamic-destination handling, but not a companion-specific movement FSM.

### 7. Separation and recovery do not equal abandonment

Distinguish normal trailing, temporary separation/recovery and genuine abandonment.

Short separation and local pathfinding rescue keep the commitment alive. Recovery uses the existing movement/rescue stack and the persistent/off-screen travel primitive supplied by `settlements-npcs-019` when detailed simulation is unavailable.

Do not terminate on a single distance threshold and do not use teleport catch-up.

Genuine termination requires an explicit source cancellation, NPC death, an explicit bounded failure/abandon rule, or a later social/contract rule that deliberately ends the commitment.

### 8. Existing pressures interrupt execution, not commitment

Hunger, thirst, vigor/rest, severe weather, combat and fleeing continue through existing NPC mechanisms.

Example:

```text
follow
→ critical thirst
→ existing action interruption
→ normal water strategy
→ need relieved
→ next decision cycle
→ same accompany commitment resumes
```

No companion-specific survival decision system.

### 9. Ending accompaniment returns control to normal NPC life

Ending the accompany commitment must not change household, profession or ordinary schedule ownership.

Prefer ending the commitment itself and using/reusing a neutral return/travel intent supplied by existing/shared NPC travel infrastructure rather than keeping a companion-specific `returning` lifecycle alive solely until home is reached.

The return destination should come from existing home/place context. Needs and danger may interrupt the return. Once the NPC is back in normal locality, ordinary schedule/place behaviour is authoritative again.

If the dependency implementation exposes a different generic return/travel contract, use it instead of introducing another one here.

### 10. Persistence and off-screen continuity come from the shared travel foundation

The semantic accompany commitment persists through the existing `NpcAuthoritativeState → NpcStateSnapshot → SaveData.npcStates` path.

Use the generic continuity mechanism from `settlements-npcs-019` for detailed/off-screen handoff, coarse travel progress and reconstruction. Exactly one execution owner may advance an NPC at a time: detailed XOR off-screen.

Do not add top-level `SaveCompanions`, `SaveParty` or another off-screen simulation registry.

Optional additive snapshot fields should remain backward-compatible where possible; do not bump the save version mechanically.

### 11. Death terminates accompaniment through existing NPC lifecycle

NPC death ends executable accompaniment. It does not teleport, respawn or replace the NPC and does not introduce companion-specific corpse semantics.

### 12. Existing observability is extended

Expose useful accompany state through the existing NPC trace/debug/inspection mechanisms: mode, target/source, lifecycle/end reason and current detailed/off-screen execution state where available.

Do not create a separate companion debug UI.

## Expected integration points

Implementation should verify and adapt these current seams rather than performing broad refactors:

- `src/settlement/npcState.ts` — authoritative commitment state, snapshot/restore/serialization.
- `src/ai/NpcAgent.ts` — idle-duty integration, follow/stay execution, interruption/resume, ending and debug trace.
- `src/ai/npcDecision.ts` — only if the existing idle-tier sequencing cannot represent the commitment cleanly.
- `src/ai/npcAction.ts` — only the minimum semantic action/dynamic-target support required by follow.
- `src/navigation/navigation.ts` — reuse existing navigation/rescue; no global routing rewrite.
- `src/fauna/followHysteresis.ts` — extract/move to a neutral shared location if required, preserving existing fauna behaviour.
- `src/settlement/SettlementsManager.ts` — consume the generic off-screen/reification contract implemented by `settlements-npcs-019`; do not add companion-specific streaming ownership.
- `src/settlement/createSettlement.ts` — reconstruction/reification integration only as required by the shared travel mechanism.
- `src/persistence/saveData.ts` — validation/defaulting for the additive NPC snapshot field where needed.

During implementation, current code remains source of truth. If `settlements-npcs-019` changes these integration seams, use its implemented contract rather than the pre-dependency assumptions recorded here.

## Scope

- one persistent, source-neutral accompany commitment per NPC;
- player target;
- follow/stay;
- sensible follow distance and hysteresis;
- moving-target follow through ordinary NPC movement;
- temporary separation and physical recovery without teleport;
- interruption by existing needs/weather/combat/flee;
- automatic resume through the existing decision cycle;
- explicit finish/cancel/abandon semantics;
- return/handoff to normal NPC locality and schedule using shared travel infrastructure;
- persistence through NPC state/save/load;
- off-screen/streaming continuity by reusing `settlements-npcs-019`;
- existing debug/trace observability.

## Non-goals

- paid escort Work Contract objective, UI, reward or payment;
- voluntary joining evaluation, relationship/personality scoring or dialogue;
- companion equipment/inventory UI or player storage permissions;
- companion-specific combat AI;
- relationship consequences of travelling together;
- household/profession relocation;
- multiple-companion coordination or formations;
- party UI or PartyManager;
- global route planning/navmesh;
- companion teleport catch-up;
- a second off-screen travel engine;
- cave-specific traversal work owned by other plans;
- random off-screen encounters;
- general rewrite of all NPC spatial persistence;
- LLM-driven behaviour.

## Related plans

### `settlements-npcs-019-persistent-and-off-screen-transport`

Hard dependency. Implement first. Its detailed/off-screen handoff and persistent travel continuity must be generic enough for accompanying NPCs rather than tied exclusively to transport orders.

### `npc-017-work-contracts-food-and-drink`

Reuse ordinary NPC provisions and needs behaviour. Accompaniment does not get a separate survival model.

### `npc-028-work-contracts-multiple-workers`

Preserve assignment-aware Work Contract ownership. Future paid accompaniment must not restore single-worker or duplicate assignment semantics.

### `settlements-npcs-028-long-distance-npc-travel-and-expedition-movement`

Architectural alignment, not a dependency. It should share the same generic off-screen travel foundation rather than introducing an expedition-only movement engine.

### `npc-027-spatial-context-and-cave-traversal`

Not a dependency for surface accompaniment. Complex cave traversal remains bounded by the NPC navigation/spatial capabilities implemented at that time.

## Implementation order

1. Confirm the implemented `settlements-npcs-019` travel/handoff contract and update implementation notes if its final seams differ from this plan.
2. Add the pure accompany commitment type/lifecycle and authoritative NPC persistence.
3. Extract/reuse shared follow hysteresis and implement detailed follow/stay through existing NPC movement.
4. Integrate accompaniment into the existing idle-duty decision seam.
5. Verify needs/weather/combat/flee interruption and automatic resume.
6. Add separation/recovery using local navigation plus the shared persistent/off-screen travel foundation.
7. Implement explicit ending and neutral return-to-normal-life handoff.
8. Extend trace/debug observability and complete automated regression coverage.

## Verification

### Automated — commitment lifecycle

Verify creation, follow/stay transitions, explicit ending/cancellation/abandonment and idempotent terminal cleanup.

### Automated — decision integration

Verify an active commitment executes when no higher-priority pressure wins, while critical hunger/thirst/vigor/weather and combat/flee interrupt current follow execution without deleting the commitment. After the interruption resolves, the same commitment resumes.

### Automated — follow/stay

Verify hysteresis prevents start/stop jitter, moving player targets update correctly, the NPC is not position-locked, and Stay does not chase the player.

### Automated — separation/recovery

Verify short separation preserves commitment, navigation rescue does not immediately abandon it, recovery remains physical rather than teleporting, and genuine abandonment requires an explicit rule.

### Automated — ending/return

Verify ending accompaniment hands the NPC into the shared return/travel mechanism, ordinary needs can interrupt that travel, and the NPC ultimately returns to normal locality/schedule without companion-specific home state.

### Automated — persistence/off-screen

Using the `settlements-npcs-019` foundation, verify:

- commitment survives `NpcAgent` reconstruction and save/load;
- settlement stream-out does not reset the NPC to its home spawn;
- detailed → off-screen → detailed handoff preserves coherent position/progress;
- exactly one execution owner advances travel;
- Stay remains stationary off-screen;
- repeated handoff/restore does not double progress;
- no companion-specific off-screen engine or duplicate persisted position authority is introduced.

### Automated — regressions

Verify NPCs without accompany commitments retain existing schedules, Work Contracts, needs, healing, social behaviour and combat/flee behaviour. Verify fauna Follow/Lead behaviour remains unchanged after sharing the hysteresis primitive.

### Manual browser verification — User

AI does not perform browser verification.

User should verify at least:

1. NPC follows naturally at a sensible distance without sticking to the player.
2. Follow remains stable around the start/stop thresholds.
3. Follow handles turns, obstacles and player speed changes through ordinary navigation.
4. Stay keeps the NPC near the selected anchor.
5. Resuming Follow catches up physically without teleporting.
6. Hunger/thirst/rest/combat/flee can interrupt follow and follow resumes afterwards.
7. Larger separation enters recovery rather than instant catch-up.
8. Ending accompaniment returns the NPC toward ordinary life.
9. Save/load and settlement stream-out/in during accompaniment do not reset or duplicate the NPC.
10. Ordinary NPCs without a commitment behave as before.

## Completion criteria

The plan is complete when an ordinary NPC can hold one persistent temporary accompany commitment and:

```text
ordinary NPC
→ accompany commitment
→ follow/stay using normal navigation
→ need/danger interruption
→ ordinary NPC response
→ same commitment resumes
→ separation/recovery without teleport
→ commitment ends
→ shared travel returns NPC toward normal locality
→ ordinary schedule/life resumes
```

The behaviour must survive reconstruction, save/load and off-screen/streaming transitions through the shared `settlements-npcs-019` travel foundation, without introducing `CompanionAI`, PartyManager, duplicate follow/navigation/needs systems or companion-specific off-screen simulation.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Implementation Notes: settlements-npcs-051 — Travelling Merchant road-party travel and threat cooperation

**Plan:** `docs/plans/settlements-npcs-051-travelling-merchant-road-party-travel-and-threat-cooperation.md`  
**Reviewed:** 2026-09-19  
**Status:** `planned` 📋

## Verified current seams

- Merchant 038 already owns `MerchantJourneyState` and uses generic `NpcTravelContinuity`; do not create another travel clock.
- `src/ai/npcTravel.ts` has `beginOffscreenNpcTravel()`, reification/checkpoint semantics and idempotent arrival observation.
- `src/ai/npcAccompanyCommitment.ts` currently targets only Player; 049 is the dependency that generalizes target/source for NPC/world-party.
- `src/ai/npcAccompanyExecution.ts` is pure transient follow/hysteresis and is the correct execution seam once NPC targets exist.
- `src/ai/npcDestinationThreat.ts` is pure/decision-time-only and explicitly forbids per-frame danger assessment.
- `src/ai/npcAnimalThreat.ts` already consumes caller-bounded `ThreateningAnimalCandidate[]`; `senseLocalThreatAssistance()` is cheap radius filtering over that bounded list.
- Current npc-048 forwarding is settlement-local. 051 should generalize composition for an active detailed travelling party, not add a global event bus.

## Architecture decision

Detailed Merchant travel is a consumer of `world-035`; remote Merchant travel remains a consumer of `NpcTravelContinuity`.

The party threat bridge should be constructed once at the existing fauna/runtime composition boundary for the currently detailed area and shared by Merchant/escorts. Do not let each NPC call `Fauna.getAgents()`.

## Implementation order

1. consume world-035 itinerary and add transient Merchant leg/waypoint cursor;
2. hook detailed/aggregated handoff without changing MerchantJourney ownership;
3. use 049 actor-neutral accompany for escorts;
4. add decision-time npc-057 gate for concrete next-leg targets;
5. generalize bounded local-assistance candidate forwarding for travelling party;
6. tests for call counts, stream/reify and defend/flee behaviour.

## Critical performance assertions

Instrument/test call counts where practical:

- regional resolver: zero calls on ordinary ticks after journey start;
- destination threat query: zero calls while merely advancing a committed leg;
- fauna source scan: once per bounded detailed composition pass, not once per party member;
- waypoint advance: constant-time cursor progression.

No browser verification by AI.

# Implementation Notes — 151

## Review summary

Plan 151 remains well aligned with the current architecture, but its implementation notes must reflect the AI work completed after the original plan was written.

The important new boundaries are:

- `ai-002` makes NPC need arbitration personality/role-aware while preserving the existing candidate generator.
- `ai-003` introduces explicit candidate strategy selection for resolving existing Needs.
- `social` is a Schedule activity, not a Need strategy.
- `conversation` is a temporary shared interaction performed inside the `social` activity.

The implementation should extend existing seams rather than introduce a social subsystem.

Repository evidence reviewed:

- `src/settlement/places.ts` already defines `PlaceType = 'home' | 'workplace' | 'food' | 'social'`; `social` is currently reserved and has no producer.
- `src/ai/schedule.ts` already defines `social` and `effectiveScheduleFor(..., { hasSocialPlace })`; the `sociable` trait can already convert part of a `home` block to `social` when a Social Place exists.
- `SettlementLandmarks` already owns the settlement's campfire, so no new campfire generator is required.
- `NpcAgent` remains the owner of NPC FSM, schedule arbitration, planned-action lifecycle and current activity.
- Existing AI flow remains needs first, then schedule when idle. `ai-002` adds personality/role-aware modifiers to the existing need candidates; `ai-003` adds strategy selection for Need resolution.

## Main implementation principle

Treat social behaviour as an extension of the existing NPC activity/action pipeline:

```text
settlement.landmarks.campfire
        ↓
Place(type: 'social')
        ↓
NpcAgent.socialPlace
        ↓
ScheduleActivity: 'social'
        ↓
existing choose() arbitration
        ↓
existing goTo / execute FSM
        ↓
social activity at the campfire
        ↓
local partner discovery
        ↓
atomic reservation of A + B
        ↓
shared conversation action
        ↓
relationship mutation
        ↓
return to social activity
```

Do not introduce:

- `SocialManager`;
- `SocialScheduler`;
- a second NPC update loop;
- a social-specific FSM;
- a global list of all social participants;
- a second relationship model;
- a social-specific strategy engine.

The existing Settlement/NpcAgent ownership boundaries remain authoritative.

## AI integration boundary

The original notes predate `ai-002` and `ai-003`; do not treat the old statement that the plan itself should remain unchanged as an architectural constraint.

### ai-002

`ai-002` owns personality/role-aware scoring of existing **Need candidates**. Do not duplicate `decisionModifiers` or create another general-purpose personality scoring engine for social behaviour.

Plan 151 creates one useful social seam for `extraversion`: it may influence the **frequency/probability of attempting to start a conversation** while an NPC is already in the social activity.

Keep this deliberately small:

```text
social activity
    ↓
shouldAttemptConversation(personality, local activity state)
    ↓
partner discovery
```

`extraversion` should not become a full partner-ranking mechanism in V1.

### ai-003

`ai-003` makes Strategy Selection explicit for Need resolution. Do not force Plan 151 through that layer.

The distinction is:

```text
Need → candidate strategies → selected strategy → PlannedAction
```

versus:

```text
idle → Schedule activity → social → conversation interaction
```

`conversation` is not a `NeedStrategy` merely because it is a way an NPC spends time. If future social behaviour starts solving an explicit Need/Problem, it can use Strategy Selection then.

## 1. Settlement campfire → Place

The existing settlement campfire is already materialized through `SettlementLandmarks.campfire`.

Add the smallest resolver possible, preferably in `src/settlement/places.ts`, conceptually:

```ts
socialPlaceFor(settlementId, landmarks): Place | null
```

Expected behaviour:

- return `null` when `landmarks.campfire` is absent;
- otherwise return a `Place` with `type: 'social'`;
- derive a stable id such as `${settlementId}:social:campfire`;
- use the existing campfire position directly;
- do not create or clone the campfire visual;
- do not make `Place` own the flame or presentation state.

When NPCs are created, wire the Social Place from the same settlement landmarks used for existing home/workplace wiring.

An NPC must receive the campfire belonging to **its own settlement only**. Do not search nearby settlements, world campfires, chunks or generic interactables.

## 2. Schedule integration

`ScheduleActivity` already contains `social`, and `effectiveScheduleFor()` already supports `hasSocialPlace`.

Do not add another schedule type or representation.

Use the existing schedule transformer. The runtime capability should be equivalent to:

```text
hasSocialPlace = npc.socialPlace != null
```

The `sociable` overlay remains the mechanism that can turn part of a `home` block into `social`.

If the schedule is constructed once, compute it after the place capability is known. Do not recalculate it every frame.

Important distinction:

> `social` is a scheduled activity meaning "go to / remain at the settlement campfire". A `conversation` is a temporary shared action occurring inside that activity.

## 3. Social activity in NpcAgent

`NpcAgent` remains the correct owner for local NPC decision/execution state.

Do not add `goSocial`, `conversationApproach`, `conversationTalk` or `conversationFinish` FSM phases.

Recommended flow:

```text
choose()
  ↓
pickNeed()
  ├─ need → existing need behaviour
  └─ idle
       ↓
    activityAt(schedule, timeOfDay)
       ↓
      social
       ↓
    socialPlace
       ↓
 existing goTo / arrival handling
       ↓
 social-at-place behaviour
```

At the campfire, the NPC remains part of the normal social activity. It should not recreate movement/action lifecycles after every failed partner search.

Use a small cooldown/next-attempt timestamp if necessary. This is local activity state, not a scheduler.

Avoid partner checks every simulation frame.

## 4. Finding NPCs at the same campfire

Do not introduce a global social registry.

Prefer the existing settlement-local NPC collection already used by the settlement update.

Candidate predicate:

```text
candidate !== self
candidate belongs to same settlement
candidate is at the same Social Place
candidate has arrived / is available
candidate has no active conversation reservation
```

Prefer stable Place identity:

```text
candidate.socialPlace?.id === self.socialPlace?.id
```

Use existing arrival/distance semantics only to determine whether the NPC has actually reached the place.

V1 partner selection stays intentionally simple and reproducible. Do not rank by personality, traits, profession, family, relationship, interests or memory.

## 5. Conversation reservation

Reservation is the critical race-prevention point and must happen before either NPC starts the conversation action.

Unsafe:

```text
A finds B
A starts conversation
B later discovers C
B starts conversation with C
```

Required semantics:

```text
tryReserveConversation(A, B)
  if A unavailable → false
  if B unavailable → false
  if A reserved → false
  if B reserved → false
  reserve A ↔ B atomically
  return true
```

Keep the reservation on the participants or in an ordinary simulation/action value owned by the existing action lifecycle. Do not create a manager whose only purpose is to coordinate two NPCs.

## 6. Shared conversation action

Represent one logical interaction with two participants, even though the FSM remains per NPC.

A dedicated `ConversationSession` is optional. Use it only if the existing `PlannedAction`/interaction lifecycle cannot represent the shared state cleanly.

If a session is needed, it should own only the shared simulation state, for example:

```text
participantA
participantB
endTime / remainingSec
result
```

Both participants must use the same generated duration. Generate **2–5 world minutes** once; never let each participant independently sample a duration.

Keep:

```text
Conversation shared state = synchronization
NpcAgent phase            = existing FSM execution
```

## 7. Conversation execution without a new FSM

Adapt the existing generic action mechanism so both NPCs execute a conversation interaction through their normal `execute` path.

Do not create social-specific FSM phases or a second execution loop.

When the conversation ends:

1. calculate one outcome;
2. apply one symmetric relationship delta;
3. clear both reservations;
4. leave both NPCs in the scheduled social activity;
5. start/continue a local retry cooldown;
6. do not immediately force another conversation.

If the schedule boundary changes during the conversation, preserve existing action interruption semantics. Needs and established interrupt rules remain authoritative.

## 8. Relationship integration

Locate the canonical relationship owner before implementation.

If the current model only supports NPC↔player, extend it generically rather than adding `SocialRelationshipManager`.

Required properties:

- stable NPC-to-NPC keying;
- one authoritative owner;
- symmetric update for this interaction;
- no duplicate relation model;
- compatibility with future social behaviour.

For a symmetric scalar model:

```text
relation(A, B) += delta
relation(B, A) += delta
```

Do not add conversation memory entries in Plan 151.

### Conversation outcome

Keep V1 deliberately small.

A pure helper may be appropriate if it makes the result testable, conceptually:

```text
conversationOutcome(personalityA, personalityB, existingRelation, rng)
```

Use canonical personality/trait data. Do not duplicate personality definitions or create a general compatibility engine.

The outcome may be positive or negative and should remain deterministic for the same simulation inputs/random stream.

## 9. Extraversion integration

This is the main new AI integration introduced by the update to these notes.

`ai-002` intentionally did not need to use every Big Five trait. Plan 151 gives `extraversion` a meaningful first seam.

Recommended V1 semantics:

```text
low extraversion  → fewer attempts to initiate
high extraversion → more attempts to initiate
```

This should affect **whether/when an attempt is made**, not which candidate is selected.

Do not copy the Need decision modifier pipeline into social interaction. If a small pure helper is required, keep it local to the social behaviour and test it independently.

## 10. NPC availability and Needs remain authoritative

Preserve:

```text
pickNeed()
  ↓
if need selected:
    existing need behaviour
else:
    schedule behaviour
```

A conversation must not suppress a high-priority Need.

Likewise, do not add a social-specific override that bypasses the normal FSM decision point.

For an already-running conversation, use the existing action interruption semantics rather than inventing continuous need polling that forcefully tears down the interaction.

## 11. Current activity / diagnostics

Reuse the existing current-activity/debug representation.

Target semantics:

```text
walking to campfire              → existing movement/activity state
at campfire, waiting             → social-compatible idle/activity state
conversation active              → talking
```

If an existing `talking` value is presentation-specific, do not silently change its meaning. Extend the current activity contract minimally if required rather than introducing a second social/debug API.

Diagnostics should make it possible to see the social path without creating a new diagnostics system:

```text
schedule: social
socialPlace: settlement:social:campfire
conversation: none | npc-id
```

Use the existing NPC trace/debug mechanisms where available.

## 12. Campfire position and movement

Use the settlement landmark position directly.

Do not create a second interaction anchor unless the existing movement/collider system requires a safe approach point.

Reuse existing movement/pathing and arrival semantics. The social interaction radius should not be derived from the visual flame radius.

## 13. Suggested invariants

### Place

```text
campfire exists → exactly one social Place for that settlement
no campfire    → no social Place
```

### Schedule

```text
social place available → existing sociable overlay may produce social
social place unavailable → social is not an executable destination
```

### Candidate discovery

```text
same campfire + available → eligible
other campfire             → ineligible
reserved                   → ineligible
self                       → ineligible
not arrived                → ineligible
```

### Reservation

```text
A reserves B → B cannot reserve A/C again
A/B ends     → both become available
```

### Conversation

```text
one generated duration → both finish together
```

### Relationship

```text
positive outcome → equal positive delta on both sides
negative outcome → equal negative delta on both sides
```

### AI boundary

```text
Need resolution → ai-002 / ai-003 path
idle schedule   → social activity path
```

The second path must not introduce a parallel Need/Strategy system.

## 14. Tests

Prefer extending tests next to the owning modules.

Suggested coverage:

- `src/settlement/places.test.ts` — campfire → social Place resolver;
- `src/ai/schedule.test.ts` — existing social/`hasSocialPlace`/sociable behaviour;
- pure social candidate/reservation/outcome helpers — candidate filtering, atomic reservation and symmetric outcome;
- NPC tests — social activity uses the existing FSM/action path;
- AI tests — existing ai-002/ai-003 tests remain green and social behaviour does not alter Need candidate generation or Strategy Selection semantics.

At minimum verify:

- same-campfire filtering;
- no self/other-settlement candidates;
- unavailable/reserved candidates are rejected;
- reservation is atomic;
- one shared duration is used;
- conversation ends for both participants;
- relationship delta is symmetric;
- retry cooldown prevents immediate pairing churn;
- `extraversion` affects initiation tendency only if implemented in V1.

## 15. Verification

Run:

```text
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Then browser/gameplay verification is required because this feature changes visible Three.js NPC behaviour.

Verify at least:

- NPCs with a social schedule go to their settlement campfire;
- several NPCs gather naturally;
- a lone NPC remains at the campfire without constantly recreating actions;
- two NPCs converse without a third NPC stealing either participant;
- both participants finish together;
- they return to the social activity and can later converse again;
- relationships change symmetrically;
- a higher-priority Need still wins at the normal decision boundary;
- no second scheduler, social manager or social FSM has appeared.

## Architectural guardrails

The implementation should preserve these boundaries:

```text
Needs / Pressures
    ↓
ai-002 personality-aware candidate scoring
    ↓
ai-003 strategy selection where applicable
    ↓
existing PlannedAction
```

and separately:

```text
idle
    ↓
Schedule
    ↓
social
    ↓
Social Place
    ↓
conversation interaction
    ↓
relationship change
```

Do not collapse these into one generic social/strategy framework prematurely.

The goal of Plan 151 is a small, observable vertical slice that strengthens the existing Place/Schedule/FSM/relationship systems and provides a real social seam for future personality-driven behaviour.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
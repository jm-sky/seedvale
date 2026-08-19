# Implementation Notes — 151

## Review summary

Plan 151 is well aligned with the current architecture, but the implementation needs to be careful about one important boundary: `social` already exists as a `PlaceType` and as a `ScheduleActivity`, while the current settlement runtime does not yet expose the settlement campfire as a `Place`. The existing NPC runtime is also intentionally centralized in `NpcAgent`, with schedule arbitration and execution already flowing through the existing FSM/action lifecycle.

The implementation should therefore extend those seams rather than introduce a social subsystem.

Repository evidence reviewed:

- `src/settlement/places.ts` already defines `PlaceType = 'home' | 'workplace' | 'food' | 'social'`; `social` is currently only a reserved type and has no producer. fileciteturn6file0L2-L2
- `src/ai/schedule.ts` already defines `social` and `effectiveScheduleFor(..., { hasSocialPlace })`; the `sociable` trait currently only converts part of a `home` block when a social place is available. fileciteturn11file0L2-L2
- `SettlementLandmarks` already contains the settlement's own `campfire?: { position, flame }`, so the world content does not need a new campfire generator. fileciteturn14file0L2-L2
- `NpcAgent` already owns the FSM, schedule, planned-action lifecycle and current-activity representation. The existing phase model uses generic `goTo`/`execute` rather than activity-specific navigation phases. fileciteturn9file0L2-L2
- Plan 060's implementation notes establish the intended architecture: needs arbitrate first, then effective schedule, then the existing FSM/action system; no second scheduler or FSM should be introduced. fileciteturn16file0L2-L2

The plan itself should remain unchanged. These notes are implementation guidance only.

## Main implementation principle

Treat a social interaction as an extension of the existing NPC activity/action pipeline:

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
- a second relationship model.

The existing `Settlement`/`NpcAgent` ownership boundaries should remain authoritative.

## 1. Settlement campfire → Place

The existing settlement campfire is already materialized through `SettlementLandmarks.campfire`. It is explicitly distinct from decorative world campfires. fileciteturn14file0L2-L2

Add the smallest resolver possible, preferably in `src/settlement/places.ts`, for example conceptually:

```ts
socialPlaceFor(settlementId, landmarks): Place | null
```

Expected behaviour:

- return `null` when `landmarks.campfire` is absent;
- otherwise return a `Place` with `type: 'social'`;
- derive a stable id from the settlement id, e.g. `${settlementId}:social:campfire`;
- use the existing campfire position directly;
- do not create or clone the campfire visual;
- do not make the `Place` own the flame or other presentation state.

The exact helper name can follow the existing naming conventions. The important part is that `Place` remains a lightweight location descriptor while `SettlementLandmarks` remains the source of settlement presentation/world landmarks.

### Settlement wiring

When `createSettlement.ts` creates an NPC, resolve the social place from the same settlement landmarks already used for its workplace/home wiring.

The NPC must receive the campfire belonging to **its own settlement only**.

Do not search nearby settlements, world campfires, chunks or interactables to find a social place. This is explicitly outside plan 151.

A useful invariant for tests is:

```text
NPC settlementId === socialPlace settlement namespace
```

There should be no runtime fallback from one settlement to another.

## 2. Schedule integration

`ScheduleActivity` already contains `social`, and `effectiveScheduleFor()` already supports a `hasSocialPlace` option. fileciteturn11file0L2-L2

Do not add another schedule type or another schedule representation.

The key change is runtime availability:

```text
hasSocialPlace = npc.socialPlace !== null
```

The effective schedule should be created using the existing schedule transformer, not by adding a special `if (sociable)` branch inside `NpcAgent.choose()`.

The current `sociable` overlay converts the first part of a `home` block to `social` when a social place exists. That is exactly the seam plan 151 needs. Preserve the existing deterministic overlay mechanism rather than adding social-specific schedule mutation.

If the current constructor already computes `NpcAgent.schedule` once, recompute it only when the place capability is known. Do not recalculate the schedule every frame.

### Important distinction

`social` is a scheduled **activity**, not a conversation.

A social activity means:

> go to / remain at the settlement campfire and periodically attempt a social interaction.

A conversation is a temporary shared **action** occurring inside that activity.

Keeping these distinct prevents the FSM from becoming a collection of special-case social states.

## 3. Social activity in `NpcAgent`

The existing `NpcAgent` is already the correct owner for the local NPC decision/execution state. The current architecture uses phases such as `choose`, `goTo`, `execute`, `sleep`, and `wander`; do not add `goSocial` or `conversation` FSM phases merely to represent the new behaviour. fileciteturn9file0L2-L2

The recommended structure is:

```text
choose()
  ↓
pickNeed()
  ├─ need → existing need action
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

At the campfire, the NPC remains part of the normal `social` activity. It should not continuously recreate a movement/action lifecycle after every failed partner search.

Use a small cooldown/next-attempt timestamp as local activity state if necessary. This is **not** a scheduler: it only throttles repeated partner discovery while the NPC is already in the same scheduled activity.

Avoid checking for a partner every simulation frame.

A sensible first implementation is an attempt interval measured in world seconds/minutes, with the exact value chosen to make several NPCs naturally interact without producing constant pairing churn.

## 4. Finding NPCs at the same campfire

The plan requires partner discovery among NPCs already present at the same campfire.

Do not introduce a global social registry.

Prefer an existing settlement-local collection already used to update NPCs. During a settlement update, the settlement already has access to its NPC agents. Use that existing collection to query candidates when an NPC needs a partner.

The candidate predicate should be approximately:

```text
candidate !== self
candidate belongs to same settlement
candidate is currently executing / occupying this social place
candidate has no active conversation reservation
candidate is not otherwise unavailable
```

The exact runtime test should be derived from existing `NpcAgent` state rather than duplicating state.

### Avoid position-only matching

Do not define "same campfire" as `distance < arbitrary radius` if the NPC already has a current `Place` or current destination representing the campfire.

Prefer stable place identity:

```text
candidate.socialPlace?.id === self.socialPlace?.id
```

Then use distance/arrival state only to determine whether the NPC has actually arrived and is available for interaction.

This prevents two nearby campfires or two nearby settlement areas from accidentally becoming one social group.

## 5. Conversation reservation is the critical race-prevention point

The plan correctly requires atomic reservation of both participants.

This must happen **before** either NPC starts a conversation action.

Avoid this unsafe sequence:

```text
A finds B
A starts conversation
B later discovers C
B starts conversation with C
```

Instead, use a shared, explicit reservation state owned by the participants' existing runtime state.

Conceptually:

```ts
conversationPartnerId: NpcId | null
```

or an equivalent action/interaction token already supported by the existing simulation contracts.

The reservation operation should behave like:

```text
tryReserveConversation(A, B)
  if A unavailable → false
  if B unavailable → false
  if A already reserved → false
  if B already reserved → false
  reserve A ↔ B
  return true
```

The operation must not expose a half-reserved state to later candidate searches.

### Ownership

Prefer keeping this state on the NPC agents if that is consistent with the existing `NpcAgent` state model. Do not create a manager whose only purpose is to coordinate two NPCs.

If a shared interaction token is cleaner, it should be an ordinary simulation/action value owned by the existing action lifecycle, not a new social subsystem.

## 6. Shared conversation action

The conversation should be represented as one logical interaction with two participants, even though the existing FSM is per NPC.

Recommended mental model:

```text
ConversationSession
  participantA
  participantB
  remainingSec
  result
```

Whether this exact type is needed depends on the existing action model. Do not introduce it if the existing `PlannedAction`/interaction lifecycle can represent the state cleanly.

The important invariant is that both NPCs share the **same end condition**.

Do not let A randomly choose `180s` and B randomly choose `240s`.

Generate the duration once when the conversation is created:

```text
2–5 world minutes
```

and make both participants reference the same duration/end time.

This can be a deterministic/random value generated by the initiating decision, provided it is stored in the shared conversation state rather than independently sampled by each participant.

## 7. Conversation execution without a new FSM

Do not add:

```text
conversationApproach
conversationTalk
conversationFinish
```

phases.

Instead, adapt the existing generic action mechanism so both NPCs can execute a conversation action whose domain effect is local to the NPC relationship state.

If the existing `PlannedAction` contract is intentionally one-NPC-owned, the minimal implementation can use a shared conversation token/session plus two ordinary `execute` states. The session owns the synchronization; `NpcAgent` still owns execution.

The important separation is:

```text
Conversation state = shared simulation data
NpcAgent phase     = existing per-agent FSM execution
```

This preserves the architecture's current ownership model.

## 8. Returning to social activity

When the shared conversation ends:

1. calculate the single conversation outcome;
2. apply the relationship change symmetrically;
3. clear both reservations;
4. leave both NPCs in the scheduled `social` activity;
5. allow a later partner-attempt cooldown to expire;
6. do not immediately force another conversation.

This prevents a group of NPCs from producing an endless chain of instant conversations.

If the schedule boundary changes during the conversation, follow the existing arbitration rule: do not interrupt an in-flight action merely because a lower-priority schedule boundary was crossed. Existing needs/interrupt semantics remain authoritative.

## 9. Relationship integration

The plan is right to reuse the existing relationship architecture rather than copy the NPC↔player relationship mechanism.

Before implementation, locate the canonical relationship state and determine whether NPC↔NPC is already represented. If the current model only accepts player relationships, extend that model generically instead of introducing `SocialRelationshipManager`.

Required properties:

- stable NPC-to-NPC keying;
- one authoritative owner for relationship state;
- symmetric update for this interaction;
- no duplicate A→B and B→A state unless the existing model explicitly requires directed relations;
- values remain compatible with future social behaviour.

For a symmetric scalar model, the conversation outcome should conceptually perform:

```text
relation(A, B) += delta
relation(B, A) += delta
```

where `delta` is positive or negative.

Do not add memory entries in plan 151.

### Outcome generation

Keep the first version deliberately small.

The plan allows a simple positive/negative roll influenced by existing character data. Do not build a full compatibility/ranking system.

A good implementation seam is a pure helper such as:

```text
conversationOutcome(personalityA, personalityB, existingRelation, rng)
```

but only introduce such a helper if it keeps the relationship mutation code testable.

Do not duplicate personality definitions. Use the canonical `CharacterDef.personality` and existing trait data.

## 10. Partner selection should stay intentionally simple

The plan explicitly postpones weighted matching.

V1 should therefore be:

```text
same campfire
+ arrived
+ available
+ not self
→ pick one candidate
```

A deterministic/stable candidate order is preferable to iterating an unordered structure if the simulation's reproducibility matters.

Do not add weights for:

- personality;
- traits;
- profession;
- family;
- relationship;
- interests;
- memory.

Those are future extensions.

One small exception: existing availability rules such as sleeping, being in a need action, or already being reserved must still apply. These are execution constraints, not social matching intelligence.

## 11. NPC availability and needs remain authoritative

The plan explicitly states that needs and their priority remain above Schedule.

Preserve the existing pattern:

```text
pickNeed()
  ↓
if need selected:
    existing need behaviour
else:
    schedule behaviour
```

A conversation must not suppress a high-priority need simply because the NPC is socially engaged.

Likewise, do not add a social-specific override that bypasses the normal FSM decision point.

For an already-running conversation, follow the existing action interruption semantics. If the codebase currently allows only decision-point changes, do not invent continuous need polling that forcefully tears down the conversation.

## 12. Current activity / debug representation

`NpcAgent` already exposes a stable current-activity summary, including `talking`. The current activity model should be reused rather than introducing a second social/debug state.

Useful target semantics:

```text
at campfire, waiting for partner → idle / social-compatible state
conversation active              → talking
walking to campfire              → existing movement/activity state
```

If `talking` already exists but is currently used only for player-facing dialogue, make its meaning explicit before reusing it. Do not silently overload a presentation-only state if callers assume it means player dialogue.

If necessary, extend the existing `CurrentActivityKind` contract minimally, but avoid adding a second `socialActivity` API.

## 13. Campfire position and movement

The campfire position comes from settlement landmarks. Do not create a second interaction anchor unless the existing movement/collider system requires a safe approach point.

The NPC should use the same movement/pathing infrastructure as other places.

If the campfire itself is collidable, reuse the existing destination-on-collider-rim/approach logic already used by `NpcAgent` rather than special-casing campfire movement.

The social interaction radius should be based on actual arrival/availability semantics, not on a visual effect radius.

## 14. Suggested state invariants

Add tests around invariants rather than only implementation details.

### Place

```text
campfire exists
→ exactly one social Place for that settlement
```

```text
no settlement campfire
→ no social Place
```

### Schedule

```text
social place available
→ existing sociable overlay may produce social
```

```text
social place unavailable
→ social does not become an executable destination
```

### Candidate discovery

```text
same campfire + available → eligible
other campfire             → ineligible
same campfire + reserved   → ineligible
self                       → ineligible
not arrived                → ineligible
```

### Reservation

```text
A reserves B → B cannot reserve A/C again
A/B conversation ends → both become available
```

### Conversation

```text
one duration
→ both finish together
```

### Relationship

```text
positive outcome → equal positive delta on both sides
negative outcome → equal negative delta on both sides
```

## 15. Tests and likely test locations

Prefer extending existing tests next to the owning modules.

Suggested locations:

- `src/settlement/places.test.ts` — campfire → social `Place` resolver;
- `src/ai/schedule.test.ts` — existing `social`/`sociable` schedule behaviour;
- `src/ai/NpcAgent.test.ts` or the existing NPC FSM test suite — arrival, social state, reservation and action completion;
- relationship tests next to the existing relationship implementation;
- settlement tests where campfire landmarks/NPC construction are already covered.

Do not create a single large `social.test.ts` that becomes a second ownership boundary.

## 16. Browser verification focus

The gameplay verification should specifically distinguish these cases:

1. **Single NPC:** arrives at its settlement campfire and remains there when no partner exists.
2. **Two NPCs:** both arrive at the same campfire and eventually form one conversation.
3. **Three NPCs:** one conversation occupies two NPCs; the third must not steal either participant.
4. **After conversation:** both remain in social activity and can later talk again.
5. **Different settlements:** NPCs never form a conversation across settlement campfires.
6. **Need pressure:** an NPC with a stronger need continues to use the existing need path instead of social behaviour.
7. **Schedule boundary:** social activity ends according to the normal schedule boundary without a parallel scheduler.
8. **Relationship:** repeated conversations visibly/observably modify the NPC↔NPC relationship value.

For visual verification, the important result is not a new social UI. It is that NPCs visibly travel using the existing navigation/FSM, gather at the existing settlement campfire, remain there naturally, and pair off without third-party contention.

## 17. Performance guidance

The social query can become expensive if every NPC scans every NPC every update.

Do not implement:

```text
for every NPC every frame:
    scan every NPC
```

Instead:

- only attempt partner selection while an NPC is in the `social` activity;
- throttle attempts with a cooldown;
- query the settlement-local NPC collection;
- optionally prefilter by the current social place id before checking detailed availability;
- keep the first implementation simple before adding spatial indexing.

For typical settlement populations, a throttled local scan is preferable to introducing a global social spatial index prematurely.

If future population scale proves problematic, the existing settlement update/partitioning architecture is the place to optimize it; do not pre-build a `SocialManager` for hypothetical scale.

## 18. Implementation order

Recommended order for the agent:

1. Inspect the exact current relationship ownership/model.
2. Add the campfire → social `Place` resolver.
3. Wire the settlement's own social `Place` into each NPC.
4. Feed social-place availability into the existing effective schedule path.
5. Make `social` resolve to the existing campfire movement/activity path.
6. Add local, throttled partner discovery.
7. Add atomic two-participant reservation.
8. Add the shared conversation duration/state using the existing action lifecycle where possible.
9. Apply the symmetric relationship result on completion.
10. Add focused unit tests.
11. Run typecheck/lint/tests/build.
12. Perform browser/gameplay verification for 1/2/3-NPC and interruption cases.

Keep each step small. Do not refactor unrelated NPC code while implementing this plan.

## 19. Review conclusions / risks

### Low risk

- `PlaceType: 'social'` already exists.
- `ScheduleActivity: 'social'` already exists.
- `effectiveScheduleFor()` already has the social-place capability seam.
- settlement campfire already exists as a landmark.
- generic NPC movement/action execution already exists.

### Main risk

The main architectural risk is implementing conversation as a new subsystem instead of treating it as a synchronized extension of the existing per-NPC action lifecycle.

The second risk is relationship duplication: if the current relationship model is extended incorrectly, the project could end up with separate NPC↔player and NPC↔NPC relationship stores that later become difficult to reconcile.

### Scope guard

Do not expand this plan into:

- group conversations;
- dialogue text generation;
- dialogue audio;
- memory entries;
- weighted compatibility ranking;
- other social places;
- cross-settlement socialization;
- social needs;
- LLM-driven behaviour;
- a social manager/scheduler;
- new campfire generation.

Those are future systems and should remain outside this implementation.

## Final guidance for the implementation agent

The simplest correct implementation should feel like an ordinary extension of the existing NPC architecture:

```text
Place
  → Schedule
  → choose / needs arbitration
  → existing FSM
  → existing movement/action lifecycle
  → small local social interaction state
  → existing relationship model
```

If an implementation step starts requiring a manager, registry, scheduler, new FSM phase family, or parallel NPC update loop, stop and re-check the existing ownership boundaries first. Plan 151 is specifically intended to demonstrate that social behaviour can emerge from the systems already present rather than becoming a separate AI subsystem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

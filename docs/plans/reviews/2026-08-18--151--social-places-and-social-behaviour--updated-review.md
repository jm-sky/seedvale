# Updated Review — Plan 151: Social Places and Social Behaviour

**Reviewed:** 2026-08-19  
**Against:** current `main` repository state  
**Decision:** `update`

## Executive summary

Plan 151 remains architecturally valid in its core idea — extend the existing `Place → Schedule → FSM/action` pipeline and use the settlement's existing campfire — but its ownership boundaries are now too broad for the newer NPC architecture direction.

The original plan should **not** be implemented literally as written.

The main changes required are:

1. `social` remains a Schedule activity, but Plan 151 should not own the long-lived social routine itself once the newer social-routine layer is introduced.
2. `conversation` should be treated as a shared interaction/action primitive, not as a new FSM phase or a second social FSM.
3. Partner discovery, social-at-place cadence and re-entry into social behaviour belong with the newer social-routines work, not with Place plumbing.
4. Relationship mutation should be delegated to the canonical relationship system. Plan 151 should not become the owner of NPC↔NPC relationship state or a parallel relationship model.
5. Memory should remain outside Plan 151; the newer relationship/memory work should own whether a conversation produces memory.
6. Needs/rest remain authoritative. Social activity must yield at the normal NPC decision/arbitration boundary and must not create a social-specific interruption system.

The original implementation notes were directionally correct about reusing the existing FSM and avoiding a `SocialManager`, but they predate the newer separation of social routines and relationship/memory responsibilities.

## Repository truth / important discrepancy

The current `main` repository does **not** contain the plan filenames described in the review request as 169/170:

- `2026-08-19--169--npc-lodging-and-sleep.md`
- `2026-08-19--169--npc-social-routines.md`
- `2026-08-19--170--npc-relationships-and-memory.md`

Current `main` instead contains:

- `2026-08-19--168--settlement-lodging-and-sleep.md`
- `2026-08-19--169--house-interior-furniture-and-bed-anchors.md`
- `2026-08-19--170--npc-simulation-inspector-and-trace.md`

`docs/plans/README.md` confirms that mapping. Therefore this review cannot verify the implementation text of the requested future social-routines / relationship-memory plans from the current repository. Their existence/ownership is treated here as the architectural direction stated in the review request, while repository-specific findings are based only on the actual current `main` code and plans.

This discrepancy should be resolved before implementation planning proceeds.

## 1. Schedule — still reusable, but not owned by Plan 151

The existing Schedule already has:

- `ScheduleActivity: 'social'`;
- `effectiveScheduleFor(..., { hasSocialPlace })`;
- the `sociable` trait overlay;
- deterministic `activityAt()` resolution;
- needs winning at the NPC decision point.

The current `schedule.ts` still documents that `social` has no producer and currently falls back to home. This means Plan 151 still needs to provide the missing Place capability, but it does **not** need to invent another scheduler or schedule representation.

The correct boundary is:

```text
Place availability
    ↓
existing effectiveScheduleFor()
    ↓
ScheduleActivity: social
    ↓
existing NPC decision/FSM
```

The new social-routines layer should own what an NPC does while executing the scheduled `social` activity.

### Required update

Remove wording that makes Plan 151 responsible for the complete social routine. Limit Plan 151 to:

- exposing the settlement campfire as a `social` Place;
- wiring the NPC's own settlement social Place;
- enabling the existing `sociable` Schedule overlay;
- supplying the generic action/interaction seam required by the social-routines system.

Do not add `social`-specific scheduler logic to `NpcAgent.choose()`.

## 2. FSM — no new social FSM

The current `NpcAgent` still uses the generic FSM:

```text
choose → goTo → execute
```

with separate sleep/follow/wander phases where required. `PlannedAction`, `ActionLifecycle` and `InteractionQueue` are already shared simulation primitives.

This confirms the original Plan 151 decision to avoid `goSocial`, `conversationApproach`, `conversationTalk`, etc.

However, the original plan's description of "social activity" as an implementation responsibility should now be narrowed.

The desired architecture is:

```text
Schedule says social
        ↓
existing goTo(campfire)
        ↓
arrived at social Place
        ↓
social-routines system decides whether to wait / interact
        ↓
shared interaction/action lifecycle
        ↓
existing FSM execute
```

The social-routines layer may own local cooldown/attempt timing, but it must not become another update loop or FSM.

## 3. Places — still a genuine Plan 151 responsibility

`src/settlement/places.ts` currently defines:

```ts
PlaceType = 'home' | 'workplace' | 'food' | 'social'
```

but `social` has no producer yet. `workplaceFor()` is the existing pattern for deriving a Place from settlement landmarks.

The settlement already has its own `SettlementLandmarks.campfire`, so no new campfire generator is needed.

Therefore this part of Plan 151 remains correct and should stay:

```text
SettlementLandmarks.campfire
        ↓
social Place
        ↓
NPC from the same settlement
```

Recommended invariant remains:

```text
NPC.settlementId === socialPlace settlement namespace
```

No cross-settlement lookup, global social-place registry or world-campfire search should be added.

## 4. Campfire — keep the existing settlement landmark as source of truth

The current architecture already separates settlement landmarks from lightweight `Place` descriptors.

Plan 151 should therefore create a stable `Place` descriptor from the existing campfire position, without moving ownership of the actual campfire visual/landmark into `Place`.

This is still the smallest correct implementation.

No new campfire entity, generator or interaction manager is justified.

## 5. Social routine — major ownership change

This is the largest architectural change relative to the original plan.

The original plan makes Plan 151 responsible for:

- waiting at the campfire;
- periodically searching for partners;
- deciding whether to converse;
- returning to social activity after conversation;
- throttling repeated attempts.

With a dedicated social-routines plan, these responsibilities should move there.

Plan 151 should instead expose the **place capability** and the integration seam.

Recommended ownership:

```text
Plan 151
  settlement campfire → Place(type: social)
  NPC → own social Place
  Schedule → social activity capability

Social routines plan
  social-at-place behaviour
  attempt cadence
  candidate discovery
  partner selection
  interaction initiation
  return to social routine
```

This avoids making Plan 151 a hidden second social-AI plan.

## 6. Partner selection — move out of Plan 151

The original V1 rule of selecting only from NPCs at the same campfire is still a good **first rule**, but the selection algorithm itself belongs to the social-routines layer.

Plan 151 should not own:

- candidate filtering;
- partner ranking;
- social cooldowns;
- personality/trait matching;
- repeated conversation attempts.

The social-routines plan can initially use the minimal rule:

```text
same social Place
+ arrived
+ available
+ not self
+ not already reserved
```

This preserves the original simplicity without coupling Place implementation to social decision logic.

## 7. Conversation — keep as a shared interaction concept, not a Plan 151-owned gameplay rule

The original plan correctly identifies a conversation as a temporary shared action involving two NPCs and requiring atomic reservation.

That invariant remains important.

However, the newer architecture means Plan 151 should not own the full conversation lifecycle.

Recommended ownership:

```text
social routines
    ↓
request/start conversation
    ↓
shared interaction/action primitive
    ↓
NpcAgent A + NpcAgent B execute through existing FSM
    ↓
interaction completion
    ↓
relationship system resolves outcome
```

There should still be:

- one active conversation per participant;
- atomic reservation of both participants;
- one shared duration/end condition;
- release of both reservations on completion/cancellation.

But these are interaction semantics, not Place semantics.

If the existing `InteractionQueue`/action lifecycle can express the reservation cleanly, extend it rather than creating a `SocialManager` or another global registry.

## 8. Relationships — remove ownership from Plan 151

The original Plan 151 explicitly says that a conversation changes NPC↔NPC relationship symmetrically.

That is now too much ownership for this plan if the newer relationship/memory work is the canonical owner.

Plan 151 should **request/report the completed interaction**, but should not directly own relationship state or define a second relationship model.

Recommended flow:

```text
conversation completes
        ↓
interaction result
        ↓
canonical relationship system
        ↓
relationship delta
```

The relationship system should own:

- relationship storage/keying;
- valid range/clamping;
- directed vs symmetric semantics;
- relationship delta application;
- future relationship effects;
- memory creation if applicable.

Plan 151 should not implement a helper such as:

```text
relation(A, B) += delta
relation(B, A) += delta
```

unless the canonical relationship API explicitly exposes that operation as its public contract.

The plan should call the canonical operation instead.

## 9. Conversation outcome — also move to relationship/social interaction ownership

The original plan allows a simple random positive/negative result influenced by personality and relationships.

That should not become an implementation detail embedded in campfire code.

A future relationship/social-interaction layer can decide:

```text
participants + relationship + personality/traits + interaction type
        ↓
interaction outcome
        ↓
relationship effect
        ↓
optional memory/event
```

Plan 151 only needs to define that a `conversation` can complete with an interaction result.

Do not duplicate personality or relationship logic inside `places.ts` or basic campfire handling.

## 10. Memory — explicitly outside Plan 151

The original plan already excluded new conversation memory entries. That remains correct and becomes even more important with a dedicated relationship/memory system.

Plan 151 should not:

- create memory entries;
- define memory schemas;
- decide which conversations are memorable;
- write relationship history directly.

The relationship/memory owner can later decide that ordinary conversations do or do not create memories.

## 11. Needs and rest — still authoritative

Plan 165 currently remains `planned` and is primarily about Vigor/Hunger/Thirst/Rest semantics. It explicitly preserves existing Rest/Sleep ownership and says not to create a parallel regeneration system.

Plan 168 is about player settlement lodging/sleep and explicitly excludes the NPC lodging system.

Therefore neither plan should become a social dependency merely because social NPCs can rest.

The invariant for Plan 151 should remain:

```text
needs / urgent action
        >
schedule activity
        >
social interaction
```

A social conversation must not bypass the normal NPC arbitration/interrupt semantics.

If a higher-priority need is selected at the existing decision point, the NPC leaves the social routine through the normal action lifecycle.

Do not add a social-specific hunger/thirst/rest interrupt mechanism.

## 12. Rest while at campfire

The original plan says that a lone NPC remains at the campfire and rests.

This wording should be changed.

"Rest" has an existing gameplay meaning and may become tied to Vigor/Rest semantics. Social V1 should not silently define campfire presence as a new Rest implementation.

Prefer:

```text
no partner available
    → remain in social activity / idle at Place
```

If actual Vigor restoration is desired, it should use the existing Rest mechanism and be explicitly owned by that system, not by Plan 151.

## 13. Current activity / `talking`

`NpcAgent.CurrentActivityKind` already contains `talking`.

This is potentially useful, but Plan 151 should not assume that the existing `talking` label automatically means "NPC↔NPC conversation".

Before implementation, establish whether `talking` is currently a presentation/dialogue-facing state. If it is semantically player-dialogue-specific, do not overload it silently.

A minimal shared activity classification can be introduced only if the existing consumers are updated consistently.

Plan 170 in the current repository is the NPC simulation inspector/trace plan. Its planned diagnostic snapshot explicitly observes `CurrentActivity`, phase, planned action, queues and history. Therefore any new conversation state should be designed as authoritative simulation state that the inspector can observe, not as UI-only state.

## 14. InteractionQueue / reservation ownership

The current repository already has shared `InteractionQueue` primitives in the simulation layer.

This is a stronger architectural seam than the original Plan 151 proposal of storing an ad-hoc `conversationPartnerId` directly on `NpcAgent`.

Before adding a new reservation field, implementation should check whether the existing interaction/action lifecycle can represent:

```text
A + B reserved for one shared interaction
```

If it can, reuse it.

If it cannot, introduce the smallest shared interaction token/state needed by the existing simulation layer — not a social manager.

The owner should be the interaction/simulation lifecycle, while `NpcAgent` remains responsible for executing its side of the action.

## 15. Diagnostics / Plan 170 overlap

The current repository's Plan 170 is not the relationship/memory plan described in the review request. It is the NPC simulation inspector/trace plan.

Nevertheless, Plan 151 should be designed to fit it:

The inspector should eventually be able to observe:

```text
social schedule selected
→ social Place target
→ arrived
→ candidate selected
→ conversation reserved
→ conversation active
→ conversation completed
→ interaction result
```

Plan 151 should not add a separate debug state or logging system. Any social events should use the same authoritative trace/diagnostic seams established by the NPC simulation architecture.

## 16. Dependencies — update required

### Existing dependency

`020` remains conceptually relevant because it provides the Place/Schedule/FSM architecture. It is already done.

### 165 — Vigor/Hunger/Thirst/Rest

Do **not** make 165 a hard dependency for the Place/social integration.

The important contract is only that social behaviour obeys the existing needs/rest arbitration. If 165 later changes shared NPC needs APIs, implementation must adapt to that API.

### 168 — Settlement Lodging and Sleep

Do not make 168 a hard dependency for Plan 151.

The current 168 explicitly concerns player settlement lodging and excludes NPC lodging. Social NPC sleep should remain under the NPC schedule/needs architecture.

### 169 — as named by the review request

If the intended new Plan 169 is **NPC social routines**, it should become the primary gameplay dependency for the social-at-campfire behaviour described above.

Plan 151 should provide the social Place capability and then hand social execution to Plan 169.

### 170 — as named by the review request

If the intended new Plan 170 is **NPC relationships and memory**, it should become the owner of relationship mutation and memory consequences of conversation.

Plan 151 should depend on its canonical relationship interaction API rather than implement relationship state itself.

### Current repository Plan 170

The actual current Plan 170 is NPC simulation inspector/trace. It should remain independent; Plan 151 only needs to expose authoritative state that the inspector can observe.

## 17. Revised architecture

The architecture should now be treated as:

```text
SettlementLandmarks.campfire
        ↓
Place(type: social)
        ↓
NPC social Place capability
        ↓
existing Schedule / effectiveScheduleFor()
        ↓
existing choose() arbitration
        ↓
existing goTo / execute FSM
        ↓
Social Routines
        ↓
partner discovery / reservation
        ↓
shared Conversation interaction
        ↓
Relationship system
        ↓
relationship delta
        ↓
optional Memory / event
```

Ownership:

```text
Plan 151
  Place + settlement wiring + Schedule capability

Social Routines plan
  social-at-place behaviour + partner selection + interaction initiation

Relationships/Memory plan
  relationship state + outcome effects + memory/event consequences

NpcAgent / simulation
  authoritative per-NPC execution + action lifecycle

Needs / Rest
  need arbitration + rest/regeneration semantics
```

## 18. What should be removed from Plan 151

The updated plan should remove or substantially narrow:

- periodic partner search as a Plan 151 implementation step;
- partner matching logic;
- conversation duration selection as campfire-specific logic;
- direct relationship mutation;
- direct relationship outcome calculation;
- any implication that campfire presence itself is Rest;
- ad-hoc social reservation state if shared interaction primitives can own it.

## 19. What should remain in Plan 151

Keep:

- settlement campfire → `PlaceType: 'social'`;
- stable social Place identity;
- own-settlement-only wiring;
- existing `social` Schedule activity;
- existing needs-over-schedule arbitration;
- generic `goTo` / `execute` FSM;
- no SocialManager/SocialScheduler/second FSM;
- tests proving Place/Schedule integration;
- browser verification that NPCs with a social schedule actually travel to their own campfire once the downstream social-routine implementation exists.

## 20. Recommended Plan 151 scope after update

Plan 151 should become a **social-place integration plan**, not the complete social-behaviour implementation.

Its implementation can be substantially smaller:

1. Add `socialPlaceFor()` using the settlement's existing campfire landmark.
2. Wire the social Place into NPC creation for the NPC's own settlement.
3. Pass `hasSocialPlace` through the existing effective schedule path.
4. Ensure the existing generic FSM can navigate to the resulting social Place without special FSM phases.
5. Expose only the minimal interaction capability needed by the social-routines layer.
6. Add focused Place/Schedule/NPC integration tests.
7. Verify in browser that social-scheduled NPCs gather at their settlement campfire once the social-routines layer is present.

Conversation, partner selection and relationship effects should be implemented through their newer owning plans rather than duplicated here.

## Final decision

**`update`**

Plan 151 should remain a separate plan, but its scope must be reduced and its dependencies/ownership updated.

It should no longer be treated as the complete implementation of NPC social behaviour. The campfire/Place/Schedule integration is still a clean, useful unit; social routines and relationship/memory consequences should live in their newer owning systems.

The biggest current repository discrepancy is that the requested 169/170 filenames and responsibilities are not present on `main`; before implementation, the planning map should be reconciled so the actual dependency graph matches the intended architecture.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Plan: NPC-initiated player follow-ups and proactive dialogue

**Created:** 2026-09-17
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** M
**Depends on:** ~~quests-progression-047~~, ~~world-030~~
**Domain:** `npc`
**Type:** `feature`
**Subdomains:** `behavior` `dialogue` `memory`
**Tags:** `player-follow-up` `proactive-dialogue` `world-knowledge` `approach-player`
**Roadmap:** -
**Model:** Opus, Sonnet

## Implementation status

Implemented on `main` (2026-09-18):

- `ai/npcPlayerFollowUp.ts`: the discriminated `NpcPlayerFollowUp` contract (V1 only `deliver_world_knowledge`) plus `armNpcPlayerFollowUp()`/`consumeNpcPlayerFollowUp()`/`cloneNpcPlayerFollowUp()` — stable ids/source only, at most one active follow-up per NPC, idempotent arm.
- `settlement/npcState.ts`: optional `playerFollowUp` on `NpcAuthoritativeState`/`NpcStateSnapshot`, cloned in `fromSnapshot()`/`serialize()`; absent on old saves means `null`.
- `settlement/npcPostDeath.ts::commitNpcDeath()`: clears an undelivered follow-up exactly once on the alive→dead edge.
- `world/locations/guardLocalKnowledge.ts`: generalized from a home-guard-only singleton to an owner-keyed `npcId → request state` map (`askAboutArea(npcId, originX, originZ, source)`); the resolved+delay-elapsed stage now arms the asking NPC's follow-up via an injected `armFollowUp` dep instead of revealing directly. Legacy single-record saves migrate onto the stable home-guard id in `createApp.ts` at restore time (`normalizeSaveGuardLocalKnowledge()`).
- `world/locations/npcPlayerFollowUpDelivery.ts::deliverNpcWorldKnowledgeFollowUp()`: the one delivery/consume seam — revalidates id/kind, re-resolves each location id against the current catalog, reveals through `LocationKnowledge.reveal(..., 'npc')`, consumes only after that commits. Idempotent.
- `ai/NpcAgent.ts`: `tryDeliverPlayerFollowUp()` wired into `tryPursueIdleDuty()` (after Work Contract, before voluntary-join initiative) — approaches via the existing `approachPlayer` local-range/arrival helpers, then requests dialogue open through a narrow runtime seam; `pendingPlayerFollowUp()` read-only projection.
- `ai/npcInitiatedDialogueRequest.ts`: module-level `configureRequestNpcInitiatedDialogue()`/shared getter (same shape as `npcBarkRequest.ts`) so `NpcAgent` never imports Vue. Wired in `createApp.ts` to `vueUi.openNpcDialogueMenu()`, gated by the existing `blocksGamePointerLockRestore()` modal check.
- `ui-vue/store.ts` / `NpcDialogueMenu.vue`: typed `followUp` snapshot on dialogue-open state (never auto-selected/consumed by `resolveNpcDialogueOpenTopic()`); `onAskAboutArea` now takes the open NPC explicitly and, in `app/inventoryWiring.ts`, delivers an already-pending or just-armed follow-up through the same seam before falling back to `guardLocalKnowledge`'s own pending/immediate-known lines.
- The "Opowiedz mi coś o okolicy" topic is now available to the selected home guard and to living adult local hunters (`isAdultAge`), through the same mechanism — no separate `hunterLocalKnowledge` copy.
- `persistence/saveData.ts`: validates `NpcStateSnapshot.playerFollowUp` and the per-npc `guardLocalKnowledge` map (fail-closed); no save-version bump (both stay optional/sparse).
- Diagnostics: `playerFollowUp.approachStarted`/`playerFollowUp.dialogueOpened` trace events and a `playerFollowUp` inspection-snapshot field.
- Automated tests: `ai/npcPlayerFollowUp.test.ts`, `world/locations/npcPlayerFollowUpDelivery.test.ts`, `world/locations/guardLocalKnowledge.test.ts` (rewritten for the per-npc/arm-not-reveal contract), `settlement/npcState.test.ts` and `settlement/npcPostDeath.test.ts` round-trip/death-clear cases, `persistence/saveData.test.ts` validation cases, and an `ui-vue/npcDialogueOpen.test.ts` case for "surfaced but never auto-consumed on open".
- Not unit-tested directly: `NpcAgent.tryDeliverPlayerFollowUp()`'s idle-duty integration itself — matching the existing precedent for `tryProposeVoluntaryJoin()` (plan npc-031), which also has no isolated unit test; the pure/data-owning pieces around it are fully covered instead.

Browser/gameplay verification remains manual (see Manual verification § below).

## Problem

Seedvale already has two halves of the desired behaviour, but they are not connected generically:

1. deferred world knowledge can run asynchronously and finish later (`quests-progression-047` / `world-030`);
2. NPCs can already approach a nearby Player for NPC-initiated interactions.

Today, however, a finished deferred result does not create a durable NPC intention to return to the Player. For the home-guard local-knowledge flow the Player must come back and ask again after research resolves.

Desired flow:

```text
Player asks an NPC about something
→ NPC starts deferred work/research
→ result becomes ready later
→ NPC remembers that it owes the Player a follow-up
→ normal NPC decisions notice the opportunity
→ if the Player is locally reachable and higher-priority duties allow it, NPC approaches
→ existing NPC dialogue opens in the follow-up context
→ result is delivered exactly once
→ resulting world/quest/social state changes through the system that already owns it
```

The first pilot is local world knowledge, but this must be an NPC interaction primitive rather than a guard-specific script.

## Goal

Add one reusable **NPC-initiated Player follow-up** mechanism that lets an NPC persist the fact that it has something to tell the Player later, then deliver it through the existing approach and dialogue systems.

The mechanism must:

- preserve Player independence from the NPC and NPC independence from the camera;
- survive settlement stream-out/reload, `NpcAgent` reconstruction, WorldBundle rebuild and save/load where gameplay meaning requires it;
- reuse the existing NPC decision/action pipeline and `approachPlayer` movement;
- never let a worker control NPC behaviour or UI;
- have one idempotent delivery/consume seam shared by NPC-initiated and Player-initiated dialogue;
- avoid global Player tracking or world-wide NPC pursuit;
- keep the actual consequence owned by the relevant system (`LocationKnowledge`, quests, relationships, etc.), not by the follow-up mechanism.

V1 implements only the world-knowledge delivery payload plus the generic foundation required to extend it later.

## Architectural decision

### Persistent intent, transient execution

A gameplay-meaningful follow-up belongs with the NPC's authoritative state, not only on `NpcAgent`.

Conceptually:

```ts
type NpcPlayerFollowUp =
  | {
      kind: 'deliver_world_knowledge'
      id: string
      createdAtDays: number
      source: NpcWorldKnowledgeFollowUpSource
      selectedLocationIds: string[]
    }
```

Exact names may adapt to current code, but the ownership rule does not:

- **authoritative/persisted:** the fact that this NPC still owes this follow-up and the stable payload required to finish it;
- **transient:** current approach action, path, retry timing, animation, whether the NPC is physically walking toward the Player right now.

V1 should allow at most one active Player follow-up per NPC unless current code reveals a simpler safe bounded collection. Do not build a generic mailbox/event bus.

### Producer does not own delivery lifecycle

`guardLocalKnowledge` / future deferred systems may produce a ready result, but must not become a second owner of whether an NPC still owes the Player that result.

After the deferred result becomes gameplay-ready, ownership transfers into the NPC follow-up record. The producer may keep only the minimal state it already needs to make research deterministic and restart-safe.

There must not be two independent booleans such as `guard result pending delivery` plus `npc follow-up pending` that can diverge.

### One delivery/consume seam

Automatic approach and manual Player interaction must converge on one operation, conceptually:

```text
peek pending follow-up
→ present dialogue payload
→ explicit delivery action succeeds
→ apply owned consequence
→ consume follow-up atomically/idempotently
```

Do not clear the follow-up merely because a dialogue menu opened. If the dialogue is interrupted/closed before delivery, it remains pending.

## 1. Extend authoritative NPC state

Relevant owner: `src/settlement/npcState.ts`.

Add optional persisted Player follow-up state to `NpcAuthoritativeState`.

Requirements:

- keyed implicitly by the stable NPC id that already owns the state;
- payload uses stable ids, never Three.js objects, Worker handles, closures or rendered prose;
- absent field on old saves means no follow-up;
- dead/terminal NPCs cannot retain a deliverable follow-up;
- normal NPC state reconstruction exposes the same pending follow-up to the recreated `NpcAgent`.

Do not persist the current `approachPlayer` action or pathfinding state.

## 2. World-knowledge readiness → NPC follow-up

Reuse the existing worker-backed `WorldKnowledgeResearch` and the existing deterministic local-knowledge selection.

The local-knowledge lifecycle should become:

```text
idle
→ requested
→ worker result selected
→ authored world-time delay satisfied
→ NPC follow-up armed
→ delivered
```

Important separation:

- worker completion alone is not Player knowledge;
- authored delay still applies even if the Worker finishes immediately;
- selected location ids remain stable across save/load;
- `LocationKnowledge.reveal()` occurs only when the information is actually delivered;
- arming must be idempotent so repeated ticks/interactions cannot enqueue duplicates.

If the Player talks to the NPC after the result is ready but before the NPC starts/finishes its approach, that normal conversation should deliver the same follow-up through the same consume seam.

## 3. Do not create a new Worker path

Reuse:

```text
WorldKnowledgeResearch
→ chunkWorkerPool
→ worldKnowledge job
```

Do not add:

- an NPC Worker;
- a dialogue Worker;
- a second world-location scan;
- synchronous landmark lookup from `NpcAgent`;
- Promise/Worker state inside persisted NPC data.

Worker responsibilities end at returning deterministic data. It never chooses whether an NPC approaches, never opens dialogue and never mutates Player knowledge.

## 4. NPC decision opportunity

A ready follow-up is an NPC opportunity/commitment to communicate, not an unconditional interrupt.

Integrate it at the existing bounded decision/idle-duty boundary used for NPC-initiated social actions. Do not scan every NPC every render frame.

It may run only when current behaviour permits it. At minimum it must yield to:

- death;
- combat/flee;
- collapse/critical needs;
- higher-priority non-interruptible commitments;
- states where ordinary Player interaction is already disallowed.

Do not create a new Need, Goal or long-lived active Plan solely for this. The durable follow-up record already represents the communication intent; the physical walk remains an ordinary single-use action.

## 5. Reuse existing `approachPlayer`

Relevant files include `src/ai/approachPlayer.ts` and `src/ai/NpcAgent.ts`.

Reuse the established local-range and arrival-range semantics and the existing `startAction({ kind: 'approachPlayer', ... })` execution path.

Rules:

- NPC only attempts delivery while the Player is locally eligible;
- no world-wide chase;
- destination may update from the current observer/player position using the existing behaviour;
- if Player leaves local range, cancel only the transient approach attempt;
- the authoritative follow-up remains pending and may be retried on a later decision cycle/meeting;
- do not duplicate the approach FSM.

Whether `ApproachPlayerIntent` itself should be generalized or the follow-up remains separate bookkeeping should follow the current `NpcAgent` implementation. `npc-031` already demonstrated that a dedicated pending payload plus the generic approach action can be preferable to overloading payment-specific intent state.

## 6. App/runtime seam for NPC-initiated dialogue

`NpcAgent` must not import or directly control Vue/UI.

Add or extend a narrow app/runtime callback supplied to NPC behaviour, conceptually:

```ts
requestNpcInitiatedDialogue(npcId, reason): boolean
```

On approach arrival it should:

1. revalidate that the follow-up is still pending;
2. revalidate that Player/NPC can currently enter dialogue;
3. resolve the live `NpcAgent`/settlement context through existing app ownership;
4. open the existing NPC dialogue menu;
5. select/present the follow-up as the initial dialogue context without consuming it yet.

A failed open leaves the follow-up pending.

Do not add a separate proactive-dialogue screen or overlay.

## 7. Dialogue integration and atomic delivery

Relevant files include `src/ui-vue/store.ts`, `src/ui-vue/NpcDialogueMenu.vue` and `src/app/inventoryWiring.ts`.

Add a typed pending-follow-up presentation path to the existing NPC dialogue state.

For `deliver_world_knowledge`, the first line may be authored/generated from the existing dialogue templates, e.g. the equivalent of:

```text
„Hej, przypomniałem sobie, o co pytałeś.”
```

The concrete location description should continue to use existing location/direction presentation logic rather than persisted prose.

Delivery must be one explicit idempotent operation that:

1. revalidates the pending follow-up id/kind;
2. validates the stable location ids against current world-location state;
3. reveals the valid locations through existing `LocationKnowledge` ownership;
4. produces the dialogue result from what was actually revealed/known;
5. consumes exactly that follow-up only after the consequence is committed.

Manual Player-initiated dialogue and NPC-initiated dialogue call this same operation.

Opening the menu, previewing a topic or merely arriving near the Player must not consume it.

## 8. Guard local-knowledge pilot

Adapt `src/world/locations/guardLocalKnowledge.ts` rather than replacing its deterministic research logic.

Existing responsibilities to preserve:

- deciding when a cold lookup is required;
- dispatching through `WorldKnowledgeResearch`;
- deterministic candidate merge/selection;
- authored world-time delay;
- stable selected ids across save/load.

Change the final stage:

```text
research resolved + delay elapsed
→ arm the asking NPC's follow-up
→ return/present pending-ready semantics
→ actual reveal waits for follow-up delivery
```

The service should no longer be the authoritative owner of an already-armed NPC communication obligation.

The same selected ids must not be both directly revealable from `guardLocalKnowledge` and independently deliverable from the NPC follow-up.

## 9. Hunter pilot / role scope

The current `Opowiedz mi coś o okolicy` seam is home-guard-specific. Extend the interaction so appropriate local hunters can use the same deferred-research/follow-up mechanism.

Do **not** create `hunterLocalKnowledge` as a copy of `guardLocalKnowledge`.

Extract/generalize only the smallest policy seam needed so a caller can provide the NPC/source context while reusing:

- `WorldKnowledgeResearch`;
- deterministic location selection primitives;
- world-time delay semantics;
- the same NPC follow-up delivery lifecycle.

V1 may use the same supported location kinds/pool for guard and hunter if no existing gameplay rule already distinguishes them. Role-specific knowledge quality or separate landmark pools are a later design/content concern unless current code makes the distinction cheap and explicit.

## 10. Persistence and restore

Update the existing NPC state persistence/validation path (`src/persistence/saveData.ts` and current NPC-state serialization seams).

Persist only gameplay-meaningful follow-up data.

On load:

- old save without the field remains valid;
- a ready follow-up remains ready;
- no movement/action is restored;
- recreated NPC may later decide to approach again;
- already consumed follow-up never reappears.

If local-knowledge producer state and NPC state are restored independently, normalization must ensure there is one owner once a follow-up has been armed. Do not let restore duplicate the same delivery.

New Game / world reset must prevent stale async completion from arming a follow-up for a previous world epoch.

## 11. Death, invalidation and lifecycle

A follow-up is not more important than entity lifecycle.

At minimum:

- alive→dead transition clears/cancels undelivered follow-up state;
- stale world-research completion after reset cannot arm it;
- invalid/missing location ids are skipped/revalidated at delivery rather than blindly trusted;
- if no valid payload remains, consume/cancel the follow-up without inventing knowledge;
- streaming out an alive NPC does **not** erase the follow-up.

Do not store raw coordinates as authoritative identity when a stable location id exists.

## 12. Diagnostics

Extend existing NPC trace/inspector; do not create another debug UI.

Useful inspection fields:

```text
player follow-up:
  kind: deliver_world_knowledge
  id: ...
  locations: 2
```

Useful trace events, exact naming may follow current conventions:

```text
playerFollowUp.armed
playerFollowUp.approachStarted
playerFollowUp.approachInterrupted
playerFollowUp.dialogueOpened
playerFollowUp.delivered
playerFollowUp.cancelled
```

Diagnostics must expose stable ids/kinds, not persist presentation text.

## 13. Relevant implementation areas

Verified/current likely integration areas:

```text
src/settlement/npcState.ts
src/ai/NpcAgent.ts
src/ai/approachPlayer.ts
src/world/locations/guardLocalKnowledge.ts
src/world/locations/worldKnowledgeResearch.ts
src/world/locations/locationKnowledge.ts
src/app/inventoryWiring.ts
src/ui-vue/store.ts
src/ui-vue/NpcDialogueMenu.vue
src/persistence/saveData.ts
src/ui/createNpcInspector.ts
```

Implementation notes must verify the exact NPC-state serialization call-sites, current dialogue-open callback ownership and the least-invasive guard→generic-local-knowledge seam before coding.

Add concise JSDoc with useful `@domain` tags to important new public/architectural seams where needed for AI preflight discovery.

## 14. Automated tests

### Authoritative follow-up state

1. arming creates exactly one follow-up for the intended NPC;
2. repeated readiness checks do not duplicate or replace it unexpectedly;
3. payload retains stable selected location ids;
4. NPC reconstruction sees the same pending follow-up;
5. save/load preserves it;
6. older save without the field restores normally;
7. death clears it;
8. stale world/reset completion cannot arm it.

### Decision / approach

9. ready follow-up + locally eligible Player can produce the existing `approachPlayer` action;
10. combat/flee/critical need or equivalent higher-priority commitment blocks the attempt;
11. Player outside local range is not chased;
12. Player leaving range cancels only approach execution, not follow-up intent;
13. a later eligible meeting can retry;
14. no per-frame follow-up scan is introduced.

### Dialogue / delivery

15. arrival requests the existing NPC dialogue through the app seam;
16. failed dialogue open leaves follow-up pending;
17. opening/closing dialogue without delivery leaves it pending;
18. NPC-initiated and manual dialogue expose the same follow-up id/payload;
19. successful delivery reveals valid locations exactly once and consumes the follow-up;
20. repeated delivery call is idempotent;
21. quest/payment/voluntary-join contexts are not implicitly accepted/consumed by opening the follow-up;
22. invalid location ids cannot create false Player knowledge.

### Local-knowledge pilots

23. cold guard request still returns immediately and dispatches existing background research;
24. worker result before authored delay does not arm delivery early;
25. authored delay before worker result does not arm delivery early;
26. ready guard result arms the requesting NPC rather than revealing immediately;
27. selected ids do not reroll across save/load;
28. Player returning manually can receive the same ready result before automatic approach;
29. hunter path uses the same research/follow-up mechanism rather than duplicated state;
30. already-known/immediate knowledge remains allowed to answer immediately where current rules permit it.

Do not use wall-clock timing assertions.

## 15. Manual verification

User verifies in browser:

1. start a new game;
2. ask the home guard about the surroundings on a cold world;
3. confirm the initial response returns immediately and research proceeds without a visible freeze;
4. move away from the guard but remain within the settlement/local encounter area;
5. wait/advance world time until research is ready;
6. confirm the guard approaches on its own when ordinary NPC priorities allow it;
7. confirm the existing dialogue UI opens with the follow-up context;
8. receive the locations and verify they become known exactly once;
9. repeat but manually talk to the guard before it reaches the Player — the same result must be delivered once;
10. walk out of local range during approach — guard stops pursuing, retains the follow-up and can retry later;
11. save/load with a ready undelivered follow-up and confirm it still exists;
12. repeat the flow with an eligible hunter;
13. confirm combat/critical NPC state prevents inappropriate proactive conversation.

AI does not perform browser verification.

## Non-goals

- LLM-generated dialogue;
- a generic async-job framework;
- generic NPC↔NPC messaging;
- an unbounded NPC message queue;
- world-wide Player tracking/pursuit;
- teleporting NPCs to the Player;
- a new pathfinding or movement FSM;
- a new Worker or worker pool;
- redesigning `WorldKnowledgeResearch`;
- redesigning the entire NPC decision pipeline;
- implementing every future follow-up kind now;
- role-specific encyclopedic knowledge simulation for guards/hunters;
- making every deferred quest automatically proactive in V1.

## Future consumers enabled by this foundation

Not implemented by this plan, but the discriminated follow-up contract should permit later consumers such as:

```text
quest update / discovered lead
warning about a local threat
request for help
work completion / payment-related information
found or recovered item
social/family news
continuation of an interrupted conversation
```

Each future consumer remains responsible for its own authoritative consequence and should only reuse the communication lifecycle.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

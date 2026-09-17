# Implementation notes: NPC-initiated player follow-ups and proactive dialogue

**Reviewed:** 2026-09-18  
**Source plan:** `npc-050-npc-initiated-player-follow-ups-and-proactive-dialogue.md`

## Current architecture confirmed

### 1. Authoritative follow-up ownership belongs in `NpcStateRegistry`

`src/settlement/npcState.ts` is already the correct lifetime boundary.

- `NpcAuthoritativeState` is the mutable long-lived NPC entity state reused by reconstructed `NpcAgent` instances.
- `NpcStateSnapshot` is the plain-data save/rebuild shape.
- `createNpcAuthoritativeState()` owns genuine-new-NPC defaults.
- `fromSnapshot()` owns restore/defaulting.
- `createNpcStateRegistry().serialize()` is the single NPC-state serialization path used both for WorldBundle rebuild continuity and `SaveData.npcStates`.

Implement the follow-up contract here rather than in app/UI state. Add an optional snapshot field so old saves naturally mean “no follow-up”; do not create another registry.

Recommended shape remains a small discriminated union owned by the NPC, e.g. `NpcPlayerFollowUp`, with V1 only `deliver_world_knowledge`. Store stable ids and semantic source/context only. Do not store rendered lines, coordinates as authoritative identity, Promise/Worker state, path state or an “approaching” flag.

Clone the nested payload explicitly in `fromSnapshot()` and `serialize()`; do not retain caller-owned mutable arrays such as `selectedLocationIds`.

### 2. Death clearing should happen on the existing alive→dead transaction

`src/settlement/npcPostDeath.ts::commitNpcDeath()` is the one-shot alive→dead handoff used by `NpcAgent.takeDamage()`. It currently receives only the narrow state slice required for corpse creation.

Do not make `NpcAgent.die()` the authoritative clearing point: hydration of an already-dead NPC also uses death presentation paths, while `commitNpcDeath()` is the actual one-shot transition.

Extend the narrow state accepted by `commitNpcDeath()` (or add an adjacent NPC-state helper called from the same edge) so an undelivered Player follow-up is cleared exactly once when the NPC dies. Keep corpse logic otherwise unrelated.

### 3. `guardLocalKnowledge` currently both researches and reveals

`src/world/locations/guardLocalKnowledge.ts::createGuardLocalKnowledge()` currently owns:

- `requested` / `resolved` research state;
- `requestedAtDays` / `revealAtDays`;
- deterministic `selectedIds`;
- worker dispatch through injected `WorldKnowledgeResearch`;
- stale-completion protection through its local `epoch`;
- direct final reveal via `revealSelected()`, which calls `LocationKnowledge.reveal(..., 'npc')`;
- immediate reveal for `alreadyKnownInRange()`.

The current resolved path is:

`askAboutArea() -> delay satisfied -> revealSelected(state.selectedIds)`.

For npc-050, do not keep this direct resolved reveal in parallel with the new NPC follow-up. The deferred path must instead transfer the ready selected ids into the requesting NPC's authoritative follow-up.

Important ownership detail: `GuardLocalKnowledge` is currently global/home-guard scoped and its API is `askAboutArea(originX, originZ)`; it does not know the asking NPC id. The caller must therefore supply stable NPC identity/source context when starting the deferred request, either by generalizing this service narrowly or by adding a caller-owned adapter. Do not infer the NPC later from “who currently has the dialogue open”.

The existing immediate-known path may remain immediate per the plan. Only deferred work needs the later communication obligation.

### 4. Existing worker path is already sufficient

Do not change worker architecture.

`WorldKnowledgeResearch` already dispatches into the existing terrain worker pool; `chunkWorkerPool` has a dedicated `worldKnowledge` queue below tile/mesh work and above grass with bounded background headroom.

`world-030` already moved expensive preparation/reconstruction off the main thread. npc-050 should consume ready stable refs/selected ids only.

No new Worker, scheduler, async framework or NPC-specific lookup belongs in this implementation.

## NPC behaviour integration

### 5. Reuse the existing idle-duty initiative boundary

`src/ai/NpcAgent.ts::tryPursueIdleDuty(scheduledActivity)` is the existing bounded dispatch point for lower-priority proactive behaviour. `npc-031` already wires `tryProposeVoluntaryJoin()` there after higher-priority escort/accompany/work commitments.

Use the same boundary for follow-up delivery. Do not add a per-frame scan and do not add a new Need/Goal/Plan.

Implementation ordering should preserve existing commitments. A ready follow-up should be attempted only when the NPC reaches this existing low-priority/idle opportunity seam and ordinary blockers allow it. Keep combat/flee/critical-need/non-interruptible behaviour above it.

Prefer a focused helper such as `tryDeliverPlayerFollowUp()` that:

1. reads `this.npcState.playerFollowUp`;
2. rejects dead/ineligible/currently unavailable cases;
3. requires the observed Player position to be locally eligible;
4. starts the existing `approachPlayer` action;
5. leaves the authoritative follow-up untouched until actual dialogue delivery.

Do not copy the whole voluntary-join evaluator; follow-up delivery is an outstanding communication obligation, not willingness scoring.

### 6. Reuse `approachPlayer`, but do not overload payment state

`src/ai/approachPlayer.ts` contains the shared distance semantics:

- `PLAYER_APPROACH_LOCAL_RANGE = 24`;
- `PLAYER_APPROACH_ARRIVE_RANGE = 2.5`;
- `isPlayerLocallyEligible()`;
- `isPlayerApproachArrived()`.

`NpcAgent` already executes ordinary `startAction({ kind: 'approachPlayer', ... })` for payment and voluntary joining. npc-031 intentionally did **not** overload the payment-specific `ApproachPlayerIntent` union for its proposal; it used dedicated pending proposal bookkeeping plus the generic action.

Follow that precedent unless implementation reveals that payment intent has since been generalized. Do not rename payment-only state just to fit this feature.

Transient follow-up approach bookkeeping can live on the loaded `NpcAgent` only if needed to know why the current approach was started. The durable payload remains on `npcState`.

When the Player leaves local range, cancel/reset only the current action. Do not clear `npcState.playerFollowUp`.

## Dialogue and app seams

### 7. Existing menu-open contract is explicit and must remain side-effect-light

`src/ui-vue/store.ts::openNpcDialogueMenu()` currently captures the live NPC/settlement/quest context and reads:

- `npc.preparePaymentRequest()`;
- `npc.pendingVoluntaryJoinProposal()`.

`resolveNpcDialogueOpenTopic()` deliberately auto-opens only payment and the NPC-initiated voluntary join proposal; ordinary quest presence does not auto-advance anything.

For npc-050, add a typed follow-up snapshot/reference to the dialogue state at open time, but do **not** consume it from `openNpcDialogueMenu()` or from `resolveNpcDialogueOpenTopic()`.

A proactive arrival may request that the menu opens directly on a follow-up topic, but the same follow-up must also be reachable when the Player manually opens dialogue first. Both routes must resolve against the same stable follow-up id still present on the NPC.

Do not call quest accept/report actions, payment settlement or voluntary-join response merely as a side effect of opening the follow-up.

### 8. Delivery belongs behind one app/runtime operation

`src/app/inventoryWiring.ts` is the current bridge from Vue dialogue actions to world/NPC systems. Its `onAskAboutArea` presently calls:

`guardLocalKnowledge.askAboutArea(player.mesh.position.x, player.mesh.position.z)`.

This callback has no NPC argument because the old topic is home-guard-only. npc-050 needs stable asking-NPC identity, so change the contract to pass/resolve the currently open NPC explicitly rather than relying on the historical no-argument seam.

Add one app-level delivery function for the V1 follow-up. It should:

1. fetch the authoritative current follow-up by NPC id;
2. compare the requested follow-up id/kind to prevent stale UI actions;
3. resolve each stored location id through the current world location catalog;
4. reveal through existing `LocationKnowledge.reveal(..., 'npc')`;
5. build the result line from the locations that are actually valid/known;
6. clear exactly that follow-up only after consequence commit.

Repeated calls with an already-consumed id must be harmless.

The UI should not mutate `NpcAuthoritativeState` directly.

### 9. NPC-initiated opening needs a runtime callback, not a Vue import

`NpcAgent` must remain independent of Vue. Inject a narrow callback through the existing NPC construction/runtime dependency surface. On `approachPlayer` arrival for a follow-up it should request an NPC dialogue open and receive success/failure.

Resolve live settlement/NPC context at the app/manager side. If another UI/modal/dialogue makes opening invalid, return false and leave the follow-up pending for retry.

Do not create an event bus solely for this. A direct injected callback matches current dependency style and keeps ownership explicit.

## Local-knowledge generalization

### 10. Guard state cannot stay globally anonymous once hunters can ask

The current `createGuardLocalKnowledge()` instance is constructed once in `createApp.ts`, restored from `initialSave?.map.guardLocalKnowledge`, serialized through `getGuardLocalKnowledge`, reset on New Game and invalidated on world rebuild/terrain identity change.

That singleton model was safe only while one home guard owned the interaction.

For the hunter pilot, do not simply let every hunter call the same anonymous singleton: two NPCs could then share one request/result and the eventual delivery owner would be ambiguous.

Use the smallest generalization that preserves deterministic research while giving each deferred request a stable owner. Two viable implementation shapes are acceptable, in this preference order:

1. turn the current service into owner-keyed local-knowledge research state (`npcId -> requested/resolved`) while preserving its existing world-research/selection logic; or
2. keep the deterministic selection/research primitive shared and store per-NPC request state with the NPC follow-up lifecycle.

Do **not** create a copied `hunterLocalKnowledge.ts`.

Whichever shape is chosen, the old save field `map.guardLocalKnowledge` must be migrated/normalized into the home guard's request context without losing an already-started delay or selected ids. This is the one place where V1 compatibility may require explicit mapping from the legacy singleton to the stable `homeGuardNpcId`.

### 11. Hunter eligibility should reuse real role identity

NPC roles already expose `role === 'hunter'`; multiple quest modules use that canonical role. The old about-area topic is documented in `store.ts` as home-guard-only.

Expose the topic for:

- the existing selected home guard;
- living local NPCs whose canonical role is `hunter`.

Do not introduce a separate “knows area” boolean in V1.

Keep the current immediate/deferred location pool semantics unless a pre-existing rule already differentiates guard and hunter knowledge.

## Persistence details

### 12. Follow-up persistence can remain inside `NpcStateSnapshot`

`SaveData.npcStates` already delegates each entry to `NpcStateSnapshot`. Therefore:

- add the optional follow-up field to `NpcStateSnapshot`;
- restore/default in `fromSnapshot()`;
- clone/serialize in `NpcStateRegistry.serialize()`;
- update current-save structural validation in `src/persistence/saveData.ts`.

A save-version bump is **not automatically required** for this optional field: current persistence conventions already use optional sparse fields where absence has an unambiguous default. Only bump if implementation changes the existing legacy `map.guardLocalKnowledge` shape in a way current validation cannot accept.

If the legacy guard singleton is retained in SaveMap during transition, ensure that an armed NPC follow-up is not also serialized as “resolved and waiting for reveal” in that field. One delivery obligation must have one owner after save/load.

### 13. Validation contract for `deliver_world_knowledge`

Validate at least:

- non-empty string follow-up id;
- finite non-negative `createdAtDays`;
- recognized `kind`;
- stable source shape;
- `selectedLocationIds` is a bounded string array;
- no runtime objects/functions.

Validation should be fail-closed for malformed current saves, following the existing `isSaveData()` pipeline.

Do not validate that every location id currently exists at file-load time; world catalog truth is revalidated at delivery.

## Tests and existing fixtures

Extend existing suites rather than building a parallel integration harness:

- `src/settlement/npcState.test.ts` — default, snapshot clone/round-trip and reconstruction;
- `src/settlement/npcPostDeath.test.ts` — alive→dead clears follow-up exactly once;
- `src/ai/approachPlayer.test.ts` only if distance helper semantics change (they should not);
- focused `NpcAgent` test near existing voluntary-join/payment initiative tests for idle-duty approach/retry/blockers;
- `src/world/locations/guardLocalKnowledge.test.ts` — deferred readiness transfers rather than reveals, delay ordering, owner identity, save/reload stability;
- `src/ui-vue/npcDialogueOpen.test.ts` — opening/previews do not consume; initial follow-up topic coexists safely with payment/join/quest state;
- existing dialogue component/store tests for manual vs proactive delivery;
- `src/persistence/saveData.test.ts` — valid optional field, malformed field rejection, legacy absence accepted.

Do not use wall-clock assertions. Worker completion and world-time readiness are separate conditions and should remain separately controllable in tests.

## Implementation order

1. Add the `NpcPlayerFollowUp` data contract + clone/validation helpers and wire it through `NpcAuthoritativeState` / `NpcStateSnapshot`.
2. Add the one-shot clear on NPC death.
3. Introduce the app-level peek/deliver/consume seam for `deliver_world_knowledge`.
4. Generalize local-knowledge research so the requesting NPC id is part of ownership; preserve old home-guard save compatibility.
5. Replace deferred `guardLocalKnowledge` direct reveal with idempotent follow-up arming.
6. Wire `NpcAgent` idle-duty attempt + existing `approachPlayer` arrival to the runtime dialogue-open callback.
7. Add dialogue-state presentation/open-topic handling without consume-on-open.
8. Enable the about-area topic for eligible hunters through the same path.
9. Extend inspector/trace and update `docs/state/npc.md` plus world-location state docs if ownership text changed.
10. Run targeted tests, type-check, lint/build according to repository conventions. Do not run browser verification and do not run `pnpm docs:sync`.

## Pitfalls / guardrails

- Do not let `guardLocalKnowledge` and `NpcAuthoritativeState` both remain authoritative for an armed delivery.
- Do not use currently-open Vue NPC as the owner of an async result; capture stable NPC id at request time.
- Do not clear the follow-up on menu open, approach arrival, failed reveal, stream-out or interrupted approach.
- Do not reveal locations from worker completion callbacks.
- Do not put proactive follow-up into Needs/Plan or create a second approach FSM.
- Do not chase the Player outside existing local eligibility.
- Do not make hunter support share one anonymous singleton request.
- Do not persist localized dialogue prose.
- Add concise JSDoc/`@domain` on the new public architectural helpers so preflight can find the ownership/delivery seam.

## Model recommendation

**Opus, Sonnet**

This touches a large `NpcAgent`, authoritative persistence, async ownership transfer, UI/app boundaries and a legacy singleton-to-per-NPC compatibility edge. Opus is the safer primary model; Sonnet is a reasonable fallback once these notes constrain the architecture.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

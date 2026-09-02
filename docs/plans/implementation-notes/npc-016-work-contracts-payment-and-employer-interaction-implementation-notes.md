# Implementation Notes: Work Contracts — Payment & Employer Interaction

## Current-code discrepancies

- **npc-014 and npc-015 are still planned and there is no WorkContract implementation in current main.** There is no WorkContract, payment_due, contract registry, or contract persistence yet. Treat npc-015 as a hard prerequisite; do not implement payment state as ad-hoc fields on NpcAgent.
- The plan's reference to an existing **NPC → Player interaction/approach system is not accurate**. Current NPC/player interaction is player-initiated: gameLoop.ts resolves a gazed NPC and opens vueUi.openNpcDialogueMenu(...); NpcAgent only has the existing lookAtPlayer reaction/pause. There is no existing NPC-initiated approach-to-player interaction.
- There is **no player coin/economy transaction API**. Coins are ordinary ItemKind: coin inventory units. Merchant transactions use items/trade.ts settleTransaction(), which is atomic for player inventory but is not a general payer→recipient economy ledger. Do not invent a settlement-economy payment path just because the plan calls it an economy transaction.

## Contract ownership / lifecycle

- Keep the authoritative contract record separate from NpcAgent runtime state. A contract can outlive settlement stream-out/in and must reference stable worker/employer identities.
- Prefer a small contract registry owned at the app/world-state level, with explicit carry across WorldBundle rebuilds if the registry is threaded through the bundle. Do not put the contract collection inside an individual Settlement or NpcAgent.
- The worker reference should use the stable NPC id (${settlementId}:npc:${i}), not the NPC name. Names are currently dialogue/quest keys and are not unique enough for authoritative world identity.
- The employer is the player in v1. Keep this explicit in the contract model rather than introducing a generic actor/entity abstraction.
- Use one authoritative lifecycle reducer/mutation seam for state transitions. Payment must atomically validate payment_due, funds, worker/employer identity and reward, then transition to completed. Never expose remove coins and complete contract as unrelated callers.

## NPC integration

- NpcAgent.choose() is the existing pressure arbitration point. Payment should enter as a bounded pressure/candidate, not as a new phase or permanent mode.
- Existing need arbitration is already personality/role aware through Needs.ts + decisionModifiers.ts. Payment should be another pressure input/candidate and must remain below critical hunger/thirst/sleep/combat interruptions.
- Do not add a payment need. The contract is a problem/pressure with explicit lifecycle state.
- The existing NpcPlan system is the right place only if the payment approach needs resumable intent. Do not create a second payment-specific planner.
- NpcAgent already receives the real player position in update(observerPos, ...), but that must not be treated as implicit global knowledge. Gate payment consideration through the existing player-reaction/perception conditions first. reactionChance.ts provides personal relation + general standing and is already injected into every NPC through PlayerSocialLookup.
- Existing player-facing relationship data is in QuestManager: getRelation(), getRelationLevel() and getPlayerStanding(). Reuse the existing PlayerSocialLookup seam rather than importing QuestManager into NpcAgent.

## NPC → Player approach: important architectural decision

- Because there is currently no NPC-initiated physical interaction, add the **smallest extension of the existing movement/interaction seams**, not a new interaction framework.
- Reuse NpcAgent's existing movement/navigation/watchdog machinery for the approach. The approach target should be a live player position snapshot captured when the payment opportunity is selected, then refreshed only while the player remains perceptible/eligible.
- Reuse the existing interaction-range/facing conventions from src/app/interactables.ts / interaction/resolveInteraction.ts for the final physical interaction. Do not create a second range constant or teleport/rescue shortcut for payment.
- A payment attempt must be transient: interruption by critical needs, death, failed navigation or loss of player visibility returns the NPC to normal decision flow. Do not add a permanent payment FSM phase.
- The current lookAtPlayer phase is a useful precedent for player-facing behaviour, but it is **not sufficient** for this plan because it is only a pause/reaction and does not move the NPC.

## Player payment interaction

- The existing NPC dialogue surface is split: gameLoop.ts handles player-gazed NPC interaction, while vueUi.openNpcDialogueMenu() opens the current Vue NPC dialogue screen. Reuse that UI seam for the payment choice rather than creating another modal.
- The payment UI should receive a contract id/reference and resolve the contract again at confirmation time. Do not trust a stale amount shown when the dialog opened.
- Insufficient funds should leave the contract untouched and report failure through the existing toast/dialog feedback path.
- Since the player owns the coins, payment v1 can be an atomic player-inventory transfer: validate inventory.has('coin', reward), remove coins, then transition the contract. If the design requires a worker-owned coin balance, that would be a **new economic ownership mechanism** and should be explicitly added to the plan instead of silently storing coins on NpcAgent.
- Do not reuse settleTransaction() unless the payment is intentionally modelled as a normal trade basket; it currently models merchant purchase/barter, not employer→worker wages.

## Persistence

- Current SaveData is v1 and has no contract field. saveState.ts is the assembly point and persistence/saveData.ts owns the schema.
- Add a dedicated workContracts save section rather than mixing contract data into quests, settlement economy or NPC runtime state.
- Persist only authoritative contract state: stable id, worker/employer references, target reference, reward, lifecycle/advertisement state, payment-request timestamp, patience/deadline and any other state required to make the transition deterministic after reload.
- Do not persist NpcAgent.phase, pendingAction, pathfinding or other transient runtime state. Current architecture intentionally keeps those transient while stable NPC state lives in NpcStateRegistry.
- Current save schema is version 1 with no migration history. Follow the existing validation/defaulting conventions in persistence/saveData.ts; old saves must load with an empty contract collection.
- Autosave is already centralized in app/saveState.ts; contract mutations therefore only need to participate in the existing SaveData snapshot.

## WorldBundle / streaming

- WorldBundle is rebuilt during certain world changes, while SettlementsManager deliberately carries settlement economies, households and authoritative NPC state across rebuilds.
- A contract registry must follow the same ownership/lifetime reasoning. If placed in WorldBundle, explicitly carry it through rebuildWorldBundle; otherwise keep the registry outside the rebuild boundary and pass narrow hooks into NPC/settlement systems.
- Worker NPCs can be in streamed-out settlements. Payment state must remain authoritative even when no NpcAgent instance currently exists.

## Timing / patience

- Use dayNight.elapsedDays / simulation world time for lastPaymentRequestAt and patience/deadline, not render seconds.
- Reuse existing time conversion helpers only when converting a world-time duration to a real action duration; do not decrement a payment timer every frame.
- A one-world-hour retry throttle should be represented as an absolute timestamp/anchor (for example nextPaymentRequestAt or lastPaymentRequestAt), allowing save/load and time skip to remain deterministic.
- Patience should be stored as a deadline/absolute expiry, not a continuously decremented field.
- Time skip handling matters: contract state must be resolved from current world time after a skip rather than replaying every missed request.

## Transaction / idempotency pitfalls

- The critical invariant is payment_due → completed only after the coin removal succeeds.
- Re-check contract state and reward immediately before mutation. A second dialog, stale UI callback or repeated input must return a no-op/invalid result once state is no longer payment_due.
- Do not infer completion from the player's current coin count or from the existence of an interaction dialog.
- Keep unpaid terminal and distinct from completed; no future payment action should be offered once patience has expired unless a later plan explicitly reopens the contract.

## Debugging

- The existing NPC inspector/debug path is preferable to a new debug UI. NpcAgent.createInspectionSnapshot() already exposes pressures, strategy, plan, action, queue and watchdog state.
- Add contract/payment information to the same diagnostic surface or to a small world-level contract debug snapshot. Avoid a second payment-specific inspector.
- Trace important transitions using the existing NpcTraceBuffer pattern: payment opportunity selected, approach started/interrupted, request shown, insufficient funds, successful payment and patience expiry.

## Suggested implementation order

1. Land/verify npc-014 + npc-015 contract foundation and construction completion state.
2. Add persistent contract registry + SaveData round-trip for lifecycle/payment metadata.
3. Add the atomic player coin-payment mutation seam.
4. Add the bounded NPC pressure/candidate for payment, using existing perception and relation lookup.
5. Add transient NPC approach using existing navigation/watchdog.
6. Reuse the Vue NPC dialogue interaction surface for the explicit Pay action.
7. Add throttling/patience and terminal unpaid handling.
8. Extend existing NPC diagnostics and test idempotency/persistence.

## Review conclusion

The plan's system direction is sound, but several reuse-existing statements refer to mechanisms that **do not currently exist**: NPC-initiated player approach and a general player→NPC economic transaction. The implementation should extend the existing NPC FSM/navigation, perception, Vue dialogue and player inventory seams minimally, while introducing only the genuinely missing contract registry/persistence/payment mutation primitives.

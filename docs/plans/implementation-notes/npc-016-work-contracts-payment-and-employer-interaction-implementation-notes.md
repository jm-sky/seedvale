# Implementation Notes: Work Contracts — Payment & Employer Interaction

**Reviewed:** 2026-09-06
**Plan:** npc-016-work-contracts-payment-and-employer-interaction.md

## Current contract foundation

- `npc-014`, `npc-015` and `npc-018` are implemented on current `main`. The old notes saying there is no Work Contract runtime/persistence are obsolete.
- `src/world/workContract.ts` owns the authoritative `WorkContractRecord` and pure lifecycle mutations. Current states are `available | advertised | accepted | travelling | working | payment_due | completed | cancelled | invalidated`; `npc-016` needs to add terminal `unpaid` rather than reuse `cancelled`/`invalidated`.
- `src/world/createWorkContracts.ts` owns the `WorldBundle` runtime and all mutations. It already exposes `find`, `findByWorker`, `findByTarget`, `accept`, `beginTravel`, `beginWork`, `completeWork`, `creditNpcWork`, `release`, etc. Add payment/unpaid transitions here instead of introducing another registry or mutating records from UI/NpcAgent.
- `WorkContractRecord.workerNpcId` is already the sole worker assignment authority. `NpcAgent` resolves its outstanding commitment via `WorkContracts.findByWorker()`; do not duplicate payment state on the agent.
- `employer`, `rewardCoins`, target identity and work-share metadata already live on the record and are persisted.

## Important npc-018 semantic change

- `npc-018` changed a contract from "NPC owns completion of the whole construction" to a frozen work commitment against a shared existing target.
- Authoritative fields are `requestedWorkShare`, `remainingWorkAtCreation`, `committedWork` and `npcWorkCompleted`.
- The underlying world object remains the sole owner of actual progress; player and NPC can contribute independently.
- `NpcAgent` ends contractual work when the NPC's commitment is fulfilled or the target is otherwise completed, and the contract can reach `payment_due` while the target still has useful work remaining.
- Therefore payment must **not** re-check whether the well/preparation/palisade/torch itself is completed. `payment_due + rewardCoins` is already the contract authority for what is owed.
- Current `ContractTarget` variants are `construction`, `terrain_preparation`, `palisade`, and `standing_torch`; payment code should be target-agnostic.

## NPC contract integration

- `NpcAgent.pursueAcceptedContract()` explicitly returns `false` for `payment_due` today: the agent keeps normal life and there is no active payment behaviour yet. This is the intended integration point to extend indirectly through normal decision/arbitration, not by turning `payment_due` back into the construction execution path.
- `NpcAgent.choose()` / existing arbitration remains the owner of competing pressures. Do not add a `NeedId` for wages and do not create a permanent payment FSM phase.
- Critical hunger/thirst/sleep, combat/threat response and other higher-priority behaviour must be able to prevent/interrupt the payment opportunity.
- Existing `NpcPlan`/movement/watchdog machinery should be reused only for the transient approach intent if needed; avoid a payment-specific planner.

## Player locality / perception

- `NpcAgent.update(observerPos, ...)` already receives the real player position for nearby simulation/reaction, so no new global player-position service is required.
- That position is not permission for omniscient chasing. Gate payment consideration through the same local/proximity assumptions used by the existing player reaction path.
- `src/ai/reactionChance.ts` already provides `PlayerSocialLookup`, carrying `{ relationLevel, standing }` from `QuestManager` without importing quests into `NpcAgent`. Reuse this seam for patience tuning and, if useful, opportunity weighting.
- `reactionChance.ts` is a social probability model, not a line-of-sight/nav API. Do not treat a successful reaction chance as proof that an arbitrary world-space approach is valid.

## NPC → Player approach

- There is still no generic NPC-initiated physical interaction framework. Current player/NPC dialogue is player-initiated.
- Add the smallest reusable approach seam needed for a locally eligible NPC interaction. The reusable concept should be "approach nearby player for interaction", with payment supplying context, rather than `goCollectPayment()` owning movement rules.
- Reuse the existing NpcAgent navigation/goTo/watchdog patterns and existing interaction-distance conventions; do not teleport or add a payment-only range constant if an existing local interaction range can be reused.
- The approach should hold transient intent only. Contract obligation remains authoritative on `WorkContractRecord` if the path fails, the player leaves, or a critical pressure interrupts.
- No approach should be simulated for a streamed-out NPC; the contract remains `payment_due` until the worker is active and locally encounters the player.

## Existing dialogue surface

- `src/app/gameLoop.ts` currently resolves a gazed NPC and calls `vueUi.openNpcDialogueMenu(...)` after releasing pointer lock.
- `src/ui-vue/store.ts::openNpcDialogueMenu()` owns the Vue NPC dialogue state; it currently derives the normal help/quest line from `QuestManager.onInteract(npc.name)` / `npc.getDialogueLine()`.
- `configureNpcDialogueMenu()` is the existing app→Vue callback seam for NPC actions such as trade/food/water/area questions. Prefer extending this surface/configuration rather than creating another payment modal.
- NPC-initiated payment still needs an app-level way to open the same dialogue UI once the NPC reaches interaction range. Keep the UI entry point shared even if the initiator differs.
- The UI should retain only a contract id/reference and re-resolve through `WorkContracts.find()` on confirmation; never trust a reward amount captured when the dialog first opened.

## Player coins / payment ownership

- There is no general persistent actor-to-actor currency ledger and no dedicated player wallet. `coin` is a normal player inventory item.
- Merchant `items/trade.ts::settleTransaction()` is a trade/barter operation; do not reuse it merely because both paths remove coins.
- `NpcAgent.carried` is an `Inventory`, but current authoritative NPC state deliberately does **not** persist carried inventory across reconstruction/streaming. Do not credit wages into `NpcAgent.carried` as a fake persistent NPC wallet.
- Household/settlement economy currently has no established persistent coin balance suitable for wages either.
- For this plan, durable payment semantics should therefore be: remove `rewardCoins` from player inventory exactly once and transition the authoritative contract to `completed`. Persistent worker wealth can be introduced later by the economy owner without changing the already-recorded fact that the wage was paid.

## Atomic payment seam

- Do not expose a UI path that separately calls `inventory.remove(...)` and later `contracts.completePayment(...)` with no guard between them.
- Add one narrow orchestration seam at the app/action layer (or another existing owner with both dependencies) that synchronously:
  1. resolves contract by id,
  2. validates `state === 'payment_due'`, expected employer/worker and `rewardCoins`,
  3. validates player coin count,
  4. removes exactly the reward,
  5. performs the existing-registry lifecycle mutation to `completed`,
  6. returns a typed result for UI feedback.
- Re-resolve immediately before mutation so stale dialogs/repeated callbacks become no-op/invalid results.
- If the inventory API cannot guarantee removal after the pre-check, structure the function so contract completion cannot occur on a failed debit.

## Lifecycle additions

- Add pure domain transitions in `src/world/workContract.ts`, then corresponding mutation methods in `src/world/createWorkContracts.ts`.
- Recommended responsibilities:
  - `completeContractPayment(record)` accepts only `payment_due` and returns `completed`.
  - `markContractUnpaid(record, now)` or equivalent accepts only expired `payment_due` and returns `unpaid`.
- Keep debit orchestration outside the pure domain module; `workContract.ts` should not import player inventory.
- Add `unpaid` to terminal-state handling so contract flags/active-target queries behave consistently and no new active contract is blocked forever by an old unpaid one.
- Decide flag cleanup by the existing terminal-state rule rather than special-casing payment UI. Since `contractHasActiveTarget()` derives from terminality, adding `unpaid` to `TERMINAL_STATES` should naturally remove/omit the marker when the registry mutation performs the same cleanup as other terminal transitions.

## Timing / patience

- Use simulation world time (`elapsedDays`/the same `now` unit already stored on contracts) for payment request timing and patience.
- Store absolute anchors on the contract, e.g. `lastPaymentRequestAt` plus `paymentPatienceUntil` (exact names can follow local conventions).
- One world hour is `1 / 24` elapsed day; use an existing time helper if one already expresses this unit rather than introducing render-second conversion.
- Patience should be initialized deterministically when the contract first reaches `payment_due`, not recomputed every frame from current relationship values.
- `PlayerSocialLookup` may influence that initial duration. Freeze the resulting deadline so relation changes/reloads do not continuously move the expiry target.
- On time skip/reload, compare current world time to the absolute deadline; do not replay every missed hourly request.

## Where to initialize payment metadata

- `completeContractWork()` is the authoritative `working → payment_due` transition today. This is the cleanest place to initialize payment-related lifecycle metadata that must exist exactly once when wages become due.
- Because patience may depend on player relation and pure `workContract.ts` should remain quest-agnostic, either:
  - pass already-resolved deterministic payment metadata into the transition, or
  - have the runtime/orchestration layer perform one guarded follow-up mutation immediately when entering `payment_due`.
- Prefer one atomic runtime call if practical so a newly `payment_due` record is never externally visible without required deadline metadata.

## Persistence / migrations

- `SaveData.workContracts` already exists. Do **not** add another payment persistence section.
- Current save schema has real versioning/migrations and is now v6 after recent contract/buildable work. Follow `persistence/saveData.ts`'s `CURRENT_SAVE_VERSION` migration path rather than the obsolete v1/default-empty advice from the previous notes.
- Extend the existing saved contract shape with the new payment timing fields and `unpaid` state.
- Preserve all npc-018 shared-work snapshot fields unchanged through migration.
- Old saves containing `payment_due` need deterministic defaults for any newly required timing metadata. Choose a migration rule that does not immediately and unexpectedly mark every legacy payable contract unpaid unless explicitly desired.
- `app/saveState.ts` already serializes `workContracts`; extend that existing mapping only as needed.

## WorldBundle / streaming

- The contract runtime is already a `WorldBundle` field and is already carried/rebuilt as part of the existing Work Contracts implementation. No new ownership decision is needed.
- Payment state must remain record-authoritative when the assigned worker is streamed out. Do not persist current approach/path/dialog state.
- `findByWorker()` already gives a reconstructed NpcAgent access to its outstanding `payment_due` record once it streams back in.

## Debugging / tests

- Existing contract/NPC trace/inspection paths already expose contract information from npc-015. Extend those instead of adding a payment inspector.
- Useful trace points: payment opportunity selected, approach started, approach interrupted, request shown, deferred, insufficient funds, paid, patience expired/unpaid.
- Unit tests should cover pure lifecycle guards, terminal handling, payment metadata initialization, save migration/round-trip and exactly-once debit orchestration.
- Add a regression test for npc-018 semantics: a partial-share contract can be paid from `payment_due` while the target itself remains unfinished.

## Suggested implementation order

1. Extend `WorkContractState`/record with `unpaid` + payment timing metadata and add guarded pure lifecycle transitions.
2. Extend `WorkContracts` runtime mutations and persistence/migration/round-trip.
3. Add exactly-once player coin-debit + contract-completion orchestration.
4. Add payment opportunity selection to normal NPC arbitration, using `findByWorker()` and local player eligibility.
5. Add the smallest reusable NPC→nearby-player approach seam through existing navigation/watchdog.
6. Reuse/extend the existing Vue NPC dialogue surface for `Pay` / defer / insufficient-funds feedback.
7. Add throttle/patience expiry and relation-based deadline initialization through `PlayerSocialLookup`.
8. Extend diagnostics/tests, including shared-work and stale-dialog/idempotency regressions.

## Recon conclusion

The earlier notes were stale in the most important area: the Work Contract registry, lifecycle, persistence and NPC execution now all exist. The missing pieces are narrower: payment lifecycle metadata/transitions, exactly-once player coin debit, a bounded NPC payment pressure, and a reusable local NPC→Player approach/open-dialog seam.

The biggest post-`npc-018` correction is semantic: **pay the contract when the NPC fulfils its frozen commitment; do not require the shared world target itself to be finished.**

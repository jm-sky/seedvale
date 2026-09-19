# Implementation Notes: Abandoned gold mine → mining colony integration

Plan: `quests-progression-010-abandoned-gold-mine-colony.md`  
Reviewed against `main`: 2026-09-19

## Current-state corrections

Most dependencies are already implemented. The only unfinished dependency is `settlements-003` (`in progress`): the idempotent founded-settlement bootstrap and persistence exist, but founded colonies still lack full live settlement streaming/resident materialization. The quest can already bootstrap and observe persistent colony state; do not make quest completion depend on the deferred presentation/runtime remainder.

`world-terrain-017`, `world-018`, `world-019`, expedition assignment/travel, `settlements-004`, and the shared quest reward/outcome machinery are present on current `main`.

## Reuse these existing contracts

- Mine identity/location: `Caves.abandonedMine()` + catalog `WorldLocationKind: 'abandonedMine'`. The mine already participates in `LocationProximityDiscovery`; physical arrival confirms its `LocationKnowledge`. Information/map reveal must use `revealLocationKnowledge(...)`.
- Gold: `generateAbandonedMineGoldDeposits()` assigns every mine deposit the same `economicSourceId = mineEconomicSourceId(mineId)`. `ResourceDeposits.resolveEconomicSourceId(depositId)` is the canonical provenance lookup.
- Infrastructure: call `WorldBundle.querySiteInfrastructure(site)`; keep the mine-specific readiness thresholds in quest/integration code. Do not persist readiness.
- Expedition: use `WorldBundle.formExpeditionAssignment()`, `provisionExpeditionAssignment()`, `markExpeditionAssignmentReady()`, then `dispatchReadyExpedition(assignmentId)`. Membership/inventory/travel remain owned by the existing systems.
- Arrival: authoritative member arrival is `NpcAuthoritativeState.travel.purpose.kind === 'expedition'`, matching `assignmentId`, with `arrival === 'reached'`; bootstrap already validates this.
- Colony: call `WorldBundle.bootstrapFoundedSettlement(...)`. Repeated calls converge to `existing`; `SettlementsManager.getFoundedSettlementBySiteId(siteId)` is the read-side catch-up seam.
- Share: use the destination settlement's `SettlementEconomy.establishEntitlement({ sourceId, beneficiary: { kind: 'player' }, shareBps: 2000 })`. Identity is already deterministic by `(sourceId, beneficiary)`; do not invent a quest-specific entitlement id.
- Buyout: use the existing quest reward/grant path; do not model it as source realization or entitlement.

## Quest-system gaps that need the smallest generic extension

### 1. Gold confirmation

There is currently no quest objective/event for “confirmed this economic source”, and no persistent player-facing resource-source discovery registry.

For V1, define confirmation as a **successful mining interaction** on any deposit whose `economicSourceId` equals this mine's source. This fits the current interaction model; there is no separate deposit-inspection action to reuse.

Support pre-accept catch-up from authoritative depletion, not quest-owned history: add a narrow `ResourceDeposits` read seam that can answer whether a source has any consumed reserve (or equivalent source-level confirmation derived from current deposit state). Live successful mining should fan out a generic source-confirmation event to `QuestManager`; polling/catch-up should satisfy the same objective after save/load or when mining happened before acceptance.

Do not store `mineGoldConfirmed` in `QuestProgressEntry`, and do not infer provenance by parsing deposit ids.

### 2. Availability / independent discovery

Do not add another physical-discovery mechanism: the abandoned mine is already confirmed by `LocationProximityDiscovery`.

Current `QuestAvailability` prerequisites are AND-only and have no location-knowledge predicate. Avoid building an OR DSL for this quest. Prefer one authored quest whose normal sponsor offer remains reachable; when the mine is already known, catch up the discovery stage immediately and use the independent-discovery-aware dialogue variant. Only add a generic `location_known` prerequisite if another concrete consumer requires it.

### 3. Buyout/share is non-terminal

Current `talk_to_npc_choice` resolves terminal `QuestOutcomeId`; it is not suitable for a choice that must continue into expedition/colony stages.

Add the smallest generic persistent **stage choice** mechanism, or extend stage dialogue actions with a stable selected-choice key if that integrates cleanly with current stage progression. Requirements:

- selected key survives save/load;
- selecting the same choice again is a no-op;
- external consequence is exact-once;
- stage advances only after the consequence succeeds;
- later dialogue can read the selected key without inspecting payout history.

Do not overload `resolvedOutcomeId`: it is terminal-only by contract.

## Suggested orchestration

Keep cross-system orchestration outside core domain owners, near the existing quest composition/integration layer (`src/app/createApp.ts` plus a focused quest helper/module rather than adding mine branches throughout `QuestManager`).

Resolve once from the mine landmark:

`locationId` → `mineId` → `economicSourceId` → stable colony site/destination.

Persist only the assignment reference and generic quest choice/progress where necessary. Prefer deterministic lookup for the founded settlement via `siteId` instead of persisting a duplicate colony-state flag.

For expedition formation, first look for an existing matching assignment before creating another. Provision/ready/dispatch are already idempotent enough for retry-oriented orchestration; do not reselect members after partial progress.

## Important dependency/pitfall notes

- `settlements-003` currently creates real founded settlement/economy/household/residency/tent state but not full live streamed residents. Quest completion should use the founded-record fact, not visible NPC presence.
- Bootstrap requires every expedition member to be alive, unblocked, reached, and to carry the required real tent instance. A failed bootstrap is a retryable world-state condition, not a quest failure by default.
- Source entitlement belongs to the founded settlement economy that will receive/realize the mine's sourced gold. Establishing it in the sponsor settlement would accrue against the wrong ledger.
- Do not require remaining gold for report/colony stages. A pre-mined/depleted source still has the same stable source identity and may have been legitimately confirmed earlier.
- Keep mine cave identity separate from `mineId` and `economicSourceId`; the mine may bind to an existing cave but quest/economy identity must not depend on cave-role assumptions.
- Do not couple quest completion to camera/player proximity, settlement streaming, resource transport, realization ticks, or entitlement accrual.

## Focused verification

Add integration coverage around the seams above rather than duplicating dependency tests:

- mine already known before offer → same quest, discovery stage catches up;
- source mined before acceptance/save → confirmation catches up;
- wrong gold source does not satisfy confirmation;
- buyout/share choice round-trips and retries without double consequence;
- expedition orchestration retries without second assignment/provisioning;
- all members reached → bootstrap creates once; restored existing colony advances quest;
- bootstrap `not_ready` leaves quest retryable;
- share is established in the founded colony economy exactly once;
- completion does not require live colony streaming or stop later economy/mining simulation.

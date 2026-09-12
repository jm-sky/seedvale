# Plan: Paid expedition escort Work Contracts

**Created:** 2026-09-11
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** ~~npc-029~~
**Domain:** `npc`
**Subdomains:** `work` `decision-making` `behavior` `relationships`
**Tags:** `companions` `work-contracts` `escort` `expedition`
**Roadmap:** `companions.md`

## Implementation status

Implemented on `main` (2026-09-12):

- Discriminated `WorkContractScope` (`measurable_work` / `expedition_escort`) on `WorkContractRecord` (`world/workContract.ts`) — existing construction/terrain/palisade/torch/residential fields moved into `measurable_work` scope unchanged; escort adds `ExpeditionEscortTerms` (`duration` / `destination` / `destination_or_timeout`, with a destination snapshot resolved once at creation, never re-resolved live).
- `serving` assignment state (`accepted → serving`, no fictional travel/work split), `serviceStartedAt`/`serviceEndsAt` on `WorkContractAssignment`.
- Scope-aware claim freezing reusing the existing lifecycle: `completeContractWork`/`cancelWorkContract`/`invalidateWorkContract`/`releaseWorkContract` all dispatch by scope internally — no new runtime API surface for termination/payment. Exact V1 rules: full reward on fulfilment, proportional-to-elapsed-duration on employer cancellation after service start, `0` on before-start/destination-only/abandonment/death (unless already frozen).
- `createWorkContracts.ts`: `createEscort()`/`beginServing()`, scope-aware `hasActiveContract`/`findByTarget`/flag spawning (escort never gets a world flag).
- `ai/npcWorkContract.ts`: scope-dispatching pure evaluator — escort branch scores full reward + suitability (guard/hunter positive, mirroring measurable work's table) + relation/local-reputation/renown (existing `PlayerSocialLookup`) + `curious` trait − expected-away-hours − a bounded conservative danger estimate (no route/world-location danger context wired up; documented default) − schedule conflict.
- `ai/npcPersonalProvisions.ts`: `estimateEscortProvisionNeed`/`buildEscortProvisionContext`/`escortAwayHours` alongside the unchanged measurable-work estimators.
- `ai/NpcAgent.ts`: `tryResolveEscortService()` (pure `isEscortServiceFulfilled()` check ahead of the accompany executor each idle-duty tick), `pursueAcceptedEscort()`/`prepareEscortProvisions()`, missing-commitment reconciliation on an already-`serving` assignment via the public `startAccompany()` seam, scope-aware inspection snapshot.
- Persistence: `SaveWorkContract` mirrors the discriminated scope; `CURRENT_SAVE_VERSION` 37, migration `36 → 37` nests legacy flat fields losslessly into `measurable_work` scope (idempotent against an already-scoped contract).
- Player creation UI: Quick Actions "Zleć eskortę" (duration + reward, no placement step), reusing the existing notice-board/payment flow unchanged.
- **Deferred, not implemented:** a destination-picker UI. `destination`/`destination_or_timeout` completion policies, shared-arrival fulfilment and the claim rules around them are fully implemented and unit-tested in the domain layer, but the V1 creation UI (`app/actions/workContractActions.ts`) only exposes the `duration` policy — there is no stable, runtime-resolvable "known places" list wired into that action module yet (this would mean pulling `WorldLocationCatalog`/settlement-registry access into a module that currently has neither), and building that picker was judged out of scope for this plan's own work. A future pass can add a destination picker without touching the domain/evaluation/fulfilment/payment code already in place.

Browser/gameplay verification remains manual (see Verification § below).

## Goal

Allow the player to hire an ordinary NPC for a bounded expedition using the existing world-level Work Contract system.

The NPC remains an autonomous inhabitant rather than becoming a player-owned companion.

```text
player creates paid expedition offer
        ↓
normal NPC discovers/evaluates offer
        ↓
NPC accepts or refuses
        ↓
Work Contract owns employment/economic obligation
        ↓
shared accompany commitment owns follow/stay execution
        ↓
normal NPC needs / danger / combat / navigation continue
        ↓
contract boundary reached / abandoned / cancelled
        ↓
existing assignment payment lifecycle
        ↓
NPC returns to normal life
```

Do not introduce `CompanionHiringSystem`, `EscortManager`, a second follow implementation, companion-specific needs/combat/navigation, a second payment/economy system, or a zero-price voluntary Work Contract path.

Paid accompaniment is a Work Contract source for the shared accompany commitment from `npc-029`. Voluntary accompaniment remains a separate future social decision which may create the same accompany commitment without creating a Work Contract.

## Current architecture and constraints

### Work Contracts are world-owned

Current authority is split as:

```text
src/world/workContract.ts
    pure contract / assignment lifecycle

src/world/createWorkContracts.ts
    runtime mutation authority

NpcAgent
    discovery, acceptance and execution

SaveData.workContracts
    persistence
```

`WorkContractRecord` owns the job and assignment history. `WorkContractAssignment` owns one NPC's participation and payment lifecycle. `NpcAuthoritativeState` deliberately does not duplicate Work Contract assignment state.

Preserve this ownership.

### Current Work Contract core is construction-oriented

The current model is not merely named around construction — its semantics assume measurable useful work.

`WorkContractRecord` currently owns fields such as:

```text
workType
target
x / z
rewardCoins
requestedWorkerCount
assignments
requestedWorkShare
remainingWorkAtCreation
committedWork
npcWorkCompleted
```

The existing model assumes:

```text
target has remaining measurable work
→ contract snapshots a fraction of it
→ NPC performs useful work
→ target accepts an amount
→ assignment.workCompleted increases
→ npcWorkCompleted increases
→ wage derives proportionally from workCompleted / committedWork
```

This is correct for construction-like jobs but an escort has no actor-neutral numeric `contributeWork()` target.

Do not add `'escort'` to the existing `WorkType` / `ContractTarget` union while continuing to require `requestedWorkShare`, `remainingWorkAtCreation`, `committedWork` and `npcWorkCompleted` for every contract.

Introduce the smallest coherent distinction between:

1. generic contractual participation, and
2. measurable-progress work contracts.

Do not redesign Work Contracts into a speculative universal job framework.

### Existing assignment/payment ownership is reusable

The current split already fits escort economics:

```text
WorkContractRecord
    owns offer / employer / reward ceiling / coarse lifecycle

WorkContractAssignment
    owns NPC participation / acceptance / execution / payment outcome
```

Existing payment already resolves through the assignment lifecycle and transfers real `coin` items from player `Inventory` to NPC `personalInventory`.

Reuse:

- `rewardCoinsDue`,
- `payment_due`,
- `paid`,
- `unpaid`,
- `uncollectable`,
- payment request throttling,
- payment deadline/patience,
- explicit employer interaction,
- `transferInventoryCount()`.

Do not create escort-specific wages, wallet state or payment UI.

### Current scoring/provisioning are construction-specific

`src/ai/npcWorkContract.ts` already provides pure deterministic opportunity scoring and `NpcAgent.tryAcceptWorkContractOpportunity()` already owns discovery/acceptance.

Current scoring uses construction-oriented inputs such as `expectedCandidateWork()` and `contractRewardRate()`.

`src/ai/npcPersonalProvisions.ts` similarly estimates away time from travel plus expected measurable work.

Escort must extend these existing seams with scope-aware estimation rather than create a second recruitment/planning system.

### Social context already exists

`NpcAgent` already receives Player social state through `PlayerSocialLookup`, including:

- personal relation level,
- settlement reputation dimensions,
- renown,
- existing standing value.

Reuse that input path. Do not import `QuestManager` or `ReputationManager` directly into `NpcAgent` or Work Contract domain code.

### Shared accompany commitment is owned by npc-029

`npc-029-npc-accompany-follow-commitment.md` owns the source-neutral execution layer:

- persistent accompany commitment,
- player target,
- follow/stay,
- normal navigation,
- interruption by needs/weather/combat/flee,
- automatic resume,
- separation/recovery,
- termination semantics,
- return to normal life,
- persistence/off-screen continuity.

This plan consumes that capability and must not duplicate it.

## Architectural decisions

### 1. Separate contract scope from assignment execution

Generalize `WorkContractRecord` narrowly so the contract describes **what was agreed**, while `WorkContractAssignment` continues to describe **one NPC's participation/payment state**.

Prefer a discriminated contract scope conceptually shaped like:

```ts
type WorkContractScope =
  | {
      kind: 'measurable_work'
      target: ExistingConstructionLikeTarget
      requestedWorkShare: number
      remainingWorkAtCreation: number
      committedWork: number
      npcWorkCompleted: number
    }
  | {
      kind: 'expedition_escort'
      terms: ExpeditionEscortTerms
    }
```

Exact names may adapt to the implemented code, but construction progress fields must no longer be mandatory semantic fields for every Work Contract.

Do not introduce a generic `ContractObjective<T>` framework for hypothetical future jobs.

### 2. Preserve one Work Contract authority

Escort contracts remain normal entries in:

```text
WorkContracts
SaveData.workContracts
notice-board discovery
assignment history
payment settlement
```

Do not create a second contract registry.

Generalize `findActiveWorkByNpc()` only if necessary. Prefer one neutral active-assignment lookup instead of parallel `findActiveWorkByNpc()` and `findActiveEscortByNpc()` APIs describing the same exclusivity rule.

### 3. Preserve one active paid Work Contract assignment per NPC

Current acceptance prevents an NPC from holding another work-active assignment. Keep that invariant for V1 escort.

An NPC must not simultaneously be contractually building a house and paid to accompany the player unless a later explicit multi-commitment design supports it.

Reject incompatible commitments at acceptance/creation boundaries rather than arbitrating them every frame.

### 4. Avoid broad assignment-state refactoring

Current assignment execution states are construction-oriented (`accepted`, `travelling`, `working`, ...), but do not rename them globally unless current call-sites prove that is the smallest safe change.

Prefer the minimum extension needed to represent escort participation, for example a scope-specific execution field or a narrowly generalized neutral state.

The implementation agent must inspect all current assignment-state consumers before choosing the representation.

Do not mechanically rename `working` to `performing` across the codebase just for semantic cleanliness.

## Escort contract terms

### 5. MVP supports duration and destination

The first implementation supports bounded escort terms based on:

- duration,
- destination,
- or an explicit combination of the two.

Generic expedition objectives are outside this plan unless an already-existing authoritative `id → active/fulfilled/failed` seam is found during implementation and can be reused without creating a parallel objective framework.

Conceptually:

```ts
type ExpeditionEscortTerms = {
  durationDays?: number
  destination?: ExpeditionDestinationRef
  completionPolicy: 'duration' | 'destination' | 'destination_or_timeout'
}
```

At least one finite boundary is required.

Examples:

```text
accompany for 1 day

accompany until reaching settlement X

accompany until reaching landmark X

reach destination X, but no longer than 2 days
```

Do not infer completion semantics from whichever optional fields happen to be present; persist an explicit policy.

### 6. Duration uses absolute world time

If duration is part of the agreement, freeze the relevant timing when service starts.

Prefer absolute world-time anchors such as:

```text
serviceStartedAt
serviceEndsAt
```

Temporary hunger/combat/rest interruptions do not pause agreed elapsed duration in V1.

Do not track billable active-follow seconds.

### 7. Destination must be semantic

Destination-based contracts should reference stable world identities where available, for example:

- settlement id,
- `WorldLocation` id,
- another existing stable place/location id.

Do not persist mesh/Object3D identity.

Avoid arbitrary `(x,z)` as the primary identity when a stable world reference exists. Runtime coordinates may be resolved from the semantic destination.

## Accompany integration

### 8. Work Contract activates the shared accompany commitment

After escort acceptance and bounded provisioning:

```text
WorkContract assignment accepted
→ create/activate npc-029 accompany commitment
    source = this Work Contract assignment
    target = player
    mode = follow
→ normal npc-029 execution
```

Use the exact source/reference type implemented by `npc-029` rather than inventing a parallel escort source representation.

Work Contract remains authoritative for:

- employer,
- reward,
- contractual terms,
- fulfilment,
- cancellation,
- payment.

Accompany commitment remains authoritative for:

- follow/stay execution,
- moving-target navigation,
- interruption/resume,
- separation recovery,
- follow termination handoff.

### 9. Persistent owner invariant

For an active paid escort assignment there must be exactly one corresponding active accompany commitment sourced from that assignment.

The commitment may exist while no live `NpcAgent` is loaded, but it must not survive a terminal/released escort assignment.

On restore/reconstruction use one deterministic reconciliation rule:

```text
active escort assignment + missing matching commitment
→ recreate/repair through the npc-029 public seam

terminal escort assignment + stale matching commitment
→ clear it
```

Do not allow contract state and commitment state to independently recreate each other indefinitely.

Work Contract should be the authority for whether paid escort service still exists; the accompany commitment is its execution representation.

### 10. Temporary interruption is not contract failure

These do not end the Work Contract:

- hunger,
- thirst,
- rest,
- healing,
- severe weather shelter,
- ordinary combat,
- fleeing followed by recovery,
- temporary path failure/recovery,
- short separation.

`npc-029` owns interruption/resume.

Only genuine abandonment, explicit cancellation, NPC death, or contractual fulfilment ends service.

## Contract fulfilment

### 11. Escort uses service fulfilment, not numeric work completion

Do not emulate construction contribution with fake work units or fake `contributeWork()` calls.

Define pure deterministic fulfilment checks per escort policy.

#### Duration

```text
now >= serviceEndsAt
```

#### Destination

Completion requires meaningful shared arrival: the player and escort NPC must both be within the destination context according to a bounded arrival rule compatible with `npc-029` separation semantics.

Do not complete because only the player crosses the destination while the NPC remains materially separated.

#### Destination or timeout

Complete successfully on shared destination arrival. If `serviceEndsAt` is reached first, end according to the explicit timeout outcome defined by the contract terms.

### 12. Genuine abandonment ends contractual participation

A genuine abandonment/end signal from `npc-029` may release/finalize the assignment.

Do not infer abandonment from one raw distance threshold and do not add escort-specific teleport recovery.

## Payment model

### 13. Successful service pays the agreed reward

Escort compensation is based on agreed service fulfilment, not construction work units.

For V1:

```text
successful fulfilment
→ rewardCoinsDue = rewardCoins
```

Keep claim freezing idempotent and assignment-owned.

### 14. Early termination rules are explicit and deliberately simple

Avoid inventing geographic route-progress wages.

Use these V1 rules:

- successful fulfilment → 100% reward,
- player cancellation after service start on a duration-based contract → proportional to elapsed agreed duration,
- player cancellation before service start → 0,
- destination-only contract cancelled before destination → 0,
- NPC voluntary/genuine abandonment before fulfilment → 0 for the unfulfilled service,
- NPC death → preserve only a claim already frozen by an earlier contractual transition; do not synthesize additional escort wages at death.

Clamp every calculated claim to:

```text
0 <= rewardCoinsDue <= rewardCoins
```

If later gameplay requires cancellation fees or risk premiums, extend this rule in a separate plan rather than inferring straight-line destination progress.

### 15. Reuse existing payment/non-payment lifecycle unchanged where possible

After claim freeze:

```text
payment_due
→ existing local payment request/dialogue
→ paid / unpaid / uncollectable
```

Reuse the current inventory transfer and patience/deadline mechanics.

Do not add escort-specific payment interaction.

## NPC offer evaluation

### 16. Extend the existing pure Work Contract evaluator

Keep acceptance scoring deterministic and unit-testable in/adjacent to `src/ai/npcWorkContract.ts`.

Common inputs remain:

- expected reward,
- expected time away,
- distance/travel burden,
- current work/schedule obligations,
- provisioning feasibility,
- incompatible commitments.

Escort-specific factors add:

- suitability,
- personal relation,
- local reputation,
- personality/traits,
- duration,
- distance from home,
- danger,
- household/profession opportunity cost,
- provisioning risk.

The scorer remains read-only.

### 17. Reward

Use offered `rewardCoins` directly for bounded service evaluation.

Do not manufacture `expectedCandidateWork` merely to reuse construction formulas.

### 18. Suitability

Suitability is a modifier, not a hard `escortEligible` flag.

Likely positive context includes roles such as guard/hunter or other real capability signals available at implementation time. Roles with strong fixed local duties may carry opportunity-cost penalties.

Do not create recruit-only NPC classes.

### 19. Relation and reputation

Use existing `PlayerSocialState` inputs.

At minimum consider:

- personal relation level,
- relevant local reputation dimensions such as trust/competence/courage/integrity where appropriate,
- renown only where semantically useful.

Do not create a duplicate escort reputation score/store.

### 20. Personality and traits

Use existing personality/traits such as openness and `curious` where available.

Do not introduce companion-specific personality state.

Weights must remain deterministic and inspectable.

### 21. Duration and distance

Estimate expected time away from ordinary life rather than one-way travel to a static construction target.

For explicit duration, duration itself is the primary commitment cost.

For destination contracts, use bounded travel-time estimates and avoid global pathfinding during evaluation.

### 22. Household and profession obligations

Current Work Contract scoring only has coarse schedule conflict. Escort should extend opportunity cost using cheap existing signals, for example:

- current effective schedule activity,
- whether a real workplace exists,
- profession,
- household role/responsibilities already represented in current systems,
- cheap existing shortage/dependency signals where available.

Do not build a second household-life simulator for escort evaluation.

### 23. Existing commitments are hard conflicts where appropriate

Reject clearly incompatible cases before scoring:

- active Work Contract assignment,
- incompatible existing accompany commitment,
- other implemented hard commitments that cannot coexist.

Prefer an eligibility invariant over an arbitrary huge negative score.

### 24. Danger is bounded and conservative

Add a deterministic expedition danger estimate using real existing information where available, for example destination/world-location category, remoteness, known target semantics, or other already-owned world context.

Do not scan every animal on a route and do not run future combat simulation.

If reliable danger context is unavailable, use a conservative neutral/default estimate rather than fabricated precision.

### 25. Provisioning risk reuses npcPersonalProvisions

Refactor provisioning estimation so it can accept a reusable expected-away-duration input.

Construction continues deriving it from travel + expected measurable work.

Escort derives it from duration/destination terms.

Actual provisioning still uses real `personalInventory`, household food/water and existing item/liquid APIs.

Do not create expedition ration counters.

## Player creation / interaction

### 26. Extend the existing Work Contract creation family

Paid escort should be created through the existing Work Contract interaction family and advertised through existing world mechanisms.

Do not add a separate permanent-companion Hire interaction.

Extend the existing creation flow to choose:

- escort contract kind,
- reward,
- duration and/or destination terms,
- completion policy.

World mutations remain behind Work Contracts APIs.

### 27. One NPC per escort contract in V1

V1 escort requests exactly one worker.

Do not force construction's multi-worker semantics onto expedition companionship and do not implement expedition parties in this plan.

Enforce one active escort assignment per contract at the contract boundary while preserving construction multi-worker behavior unchanged.

## Persistence

### 28. Work Contract remains persistence owner for employment

Persist escort data through `SaveData.workContracts`, including:

- generalized contract scope,
- escort terms,
- service timing where applicable,
- assignment lifecycle,
- payment claim/history.

Do not duplicate contract state into `NpcStateSnapshot`.

### 29. Accompany persistence remains owned by npc-029

Do not duplicate follow/stay mode, player target, separation/recovery or return-travel execution state inside Work Contract persistence.

Only persist the Work Contract data needed to determine that paid service exists and what its agreed terms are.

### 30. Save migration preserves construction contracts

Generalizing the persistent Work Contract representation changes schema semantics and must use the repository's real migration pipeline.

Existing construction contracts must migrate losslessly into the measurable-work scope.

Do not invalidate existing saves or drop assignment/payment history.

Do not bump `CURRENT_SAVE_VERSION` until the actual persisted representation changes.

## Social consequences

### 31. Reuse existing generic social mechanisms only

Do not create a companion-specific bond/reputation store.

Preserve meaningful contract outcomes for later consumers:

- fulfilled + paid,
- fulfilled + unpaid,
- employer cancellation,
- NPC abandonment,
- death.

If existing generic relation/reputation consequence seams can already represent payment consequences cleanly, reuse them.

If broader Work Contract non-payment social consequences are still unimplemented, do not create escort-only gossip/reputation propagation here.

## Integration with npc-029

### Owned by this plan

- paid offer,
- employer,
- reward,
- duration/destination terms,
- candidate evaluation,
- acceptance/refusal,
- contractual lifecycle,
- service fulfilment,
- cancellation/release,
- payment claim,
- payment/non-payment integration,
- persistence of contract terms/history.

### Owned by npc-029 — do not duplicate

- accompany commitment,
- follow/stay modes,
- follow distance/hysteresis,
- moving player target,
- local navigation,
- obstacle/path recovery,
- needs/weather/combat/flee interruption,
- automatic resume,
- temporary separation/recovery,
- off-screen follow continuity,
- generic abandonment/end reason representation,
- return to ordinary locality/life,
- commitment persistence/debug state.

## Expected integration points

### `src/world/workContract.ts`

Main domain change:

- introduce the minimum discriminated contract scope,
- keep measurable-work fields scoped to construction-like contracts,
- add escort terms,
- add pure escort fulfilment/claim helpers,
- preserve assignment payment ownership,
- keep terminal transitions idempotent.

Avoid a universal-job abstraction.

### `src/world/createWorkContracts.ts`

Remain the runtime mutation authority.

Likely changes:

- scope-aware creation,
- neutral active-assignment lookup if required,
- escort start/finish/release operations,
- narrow integration hooks for accompany commitment without importing `NpcAgent`.

### `src/ai/npcWorkContract.ts`

Generalize pure acceptance scoring by scope and add escort-specific inputs/modifiers.

Do not mutate contracts or NPC state here.

### `src/ai/npcPersonalProvisions.ts`

Generalize provision estimation to reusable expected-away duration while preserving existing construction behavior.

### `src/ai/NpcAgent.ts`

Keep escort integration narrow:

- provide current NPC/social/household context to evaluator,
- provision after acceptance,
- request/create the `npc-029` commitment,
- observe genuine commitment termination,
- avoid construction-target execution branches for escort,
- extend trace/debug output.

Do not implement follow behavior a second time.

### `src/settlement/npcState.ts`

Do not add escort-specific Work Contract state. Consume only the source-neutral accompany state already introduced by `npc-029`.

### `src/app/actions/workContractActions.ts`

Extend existing creation/orchestration UI for escort terms instead of creating a companion-hiring action family.

### `src/persistence/saveData.ts`

Generalize `SaveWorkContract` representation and validation. Add migration only for actual persisted schema changes.

### `src/app/saveState.ts`

Adapt Work Contract serialization only as required by the generalized shape. Do not add `escortContracts`.

### Tests

Extend current Work Contract, NPC scoring and provisioning tests rather than creating a separate escort test framework.

## Scope

Implement:

- one paid escort Work Contract for one NPC,
- finite duration and/or destination terms,
- explicit completion policy,
- normal Work Contract posting/discovery,
- autonomous deterministic NPC acceptance,
- reward/time/distance/suitability evaluation,
- Player↔NPC relation input,
- settlement reputation/renown input,
- personality/traits input,
- household/profession opportunity cost,
- commitment conflict rejection,
- bounded danger estimate,
- provisioning feasibility,
- activation of the `npc-029` accompany commitment,
- duration/destination fulfilment,
- genuine abandonment/cancellation/death handling,
- assignment payment claim,
- existing payment/non-payment flow,
- save/load,
- trace/debug observability.

## Non-goals

Do not implement:

- generic expedition objectives,
- voluntary accompaniment,
- permanent companions,
- `CompanionManager` / `PartyManager`,
- multiple simultaneous expedition companions,
- formations,
- escort-specific navigation,
- escort-specific combat AI,
- companion equipment UI,
- player-to-NPC general item-transfer UI,
- player storage permission system,
- companion camp/home,
- household relocation,
- richer relationship dimensions,
- gossip/social propagation,
- inherited wage claims,
- NPC employers,
- negotiation/barter,
- item rewards,
- escrow,
- dynamic wage renegotiation,
- generic quest-objective framework inside Work Contracts,
- arbitrary route danger scanning,
- teleport catch-up,
- LLM decisions.

## Implementation order

### Phase A — Work Contract core generalization

1. Inspect all current consumers of `WorkContractRecord`, assignment states and measurable-work fields.
2. Introduce the smallest discriminated scope separating measurable work from bounded escort service.
3. Preserve existing construction contract semantics exactly.
4. Generalize active-assignment lookup/naming only where necessary.
5. Keep existing construction/payment tests green before adding escort execution.

### Phase B — Escort domain lifecycle

1. Add persistent duration/destination terms and explicit completion policy.
2. Add deterministic service timing/fulfilment.
3. Add cancellation/abandonment/death transitions.
4. Add scope-aware claim freezing using the explicit V1 payment rules.
5. Add save migration/round-trip.

### Phase C — NPC evaluation and provisioning

1. Generalize Work Contract scoring by scope.
2. Add escort expected-away-time estimation.
3. Add relation/reputation/personality/traits inputs.
4. Add household/profession opportunity cost.
5. Add bounded danger.
6. Reuse/generalize provisioning feasibility.
7. Extend trace output with useful score components.

### Phase D — npc-029 accompany integration

After `npc-029` is implemented:

1. consume its actual public/source contract,
2. create exactly one matching accompany commitment after escort acceptance,
3. keep Work Contract authoritative for service existence/terms,
4. reconcile contract/commitment state on reconstruction,
5. terminate the shared commitment when service ends,
6. verify normal need/combat interruptions do not finalize the contract,
7. reuse `npc-029` return-to-life behavior.

Do not implement against guessed `npc-029` field names if its final code differs from its plan.

### Phase E — creation UI + payment integration

1. expose escort in the existing Work Contract creation flow,
2. configure reward + bounded terms,
3. post through the existing notice-board mechanism,
4. reuse existing payment interaction unchanged where possible,
5. expose clear contract status.

### Phase F — persistence/debug/regression

1. migration,
2. save/load,
3. contract/commitment reconciliation,
4. trace/debug visibility,
5. existing construction regression tests,
6. NPC decision regression tests.

## Verification

### Automated — existing Work Contract regression

Verify existing well construction, terrain preparation, palisade, standing torch, residential construction, multiple workers, contribution accounting, payment, unpaid outcome and provisioning retain their existing behavior after the core generalization.

### Automated — contract representation

Verify:

```text
construction contract
→ measurable-work scope
→ existing committedWork behavior

escort contract
→ bounded-service scope
→ no synthetic committedWork / npcWorkCompleted requirement
```

Reject invalid mixed records.

### Automated — acceptance

Given deterministic NPC context, verify score changes appropriately for:

- higher/lower reward,
- short/long duration,
- near/far destination,
- suitable/unsuitable role,
- good/poor relation,
- relevant reputation differences,
- personality/traits,
- current work/schedule obligation,
- household burden,
- incompatible active commitment,
- low/high danger,
- adequate/inadequate provisions.

Same inputs must produce the same result.

### Automated — accompany integration

With an accepted escort contract verify:

```text
assignment active
→ exactly one matching npc-029 accompany commitment
```

Verify no duplicate commitment on repeated ticks/reconstruction; hunger, thirst, rest, combat and flee interruptions do not end the contract; explicit service completion/cancellation/abandonment ends the source commitment exactly once.

### Automated — duration completion

Verify:

```text
accepted at T
duration D
→ serviceEndsAt = T + D
→ before boundary: active
→ at/after boundary: fulfilled exactly once
→ payment claim frozen exactly once
```

Save/load and time skip must preserve the same result.

### Automated — destination completion

Verify service does not complete merely because the player reaches the destination while the NPC remains materially separated. Valid shared arrival completes exactly once.

### Automated — early termination

Verify:

- temporary separation is not abandonment,
- player cancellation before service start yields zero claim,
- duration-contract cancellation after service start uses deterministic elapsed-duration proportion,
- destination-only cancellation before arrival yields zero claim,
- NPC genuine abandonment before fulfilment yields zero claim,
- death does not synthesize new escort wages,
- repeated cancellation/release is idempotent.

### Automated — payment

Verify successful service creates the agreed claim; every claim remains within `0..rewardCoins`; payment still uses player Inventory → NPC personalInventory; repeated/stale payment cannot debit twice; existing unpaid/death handling continues to work.

### Automated — persistence

Verify:

- existing construction Work Contract saves migrate without changed outcomes,
- escort terms round-trip,
- assignment/payment state round-trips,
- active escort assignment + accompany commitment restore coherently,
- missing/stale commitment reconciliation is deterministic,
- save/load cannot duplicate commitment or claim.

### Manual browser verification — User

AI does not perform browser verification.

User should verify at least:

1. Create and post a paid expedition escort offer.
2. Different ordinary NPCs may accept/refuse based on their real context.
3. Accepted NPC follows through the shared accompany behavior.
4. NPC still eats, drinks, rests and reacts to danger.
5. Temporary separation/recovery does not immediately break the contract.
6. Duration-based contract ends at the agreed time.
7. Destination-based contract ends only after meaningful shared arrival.
8. NPC returns toward ordinary life after the contract.
9. Payment uses the existing worker-payment interaction.
10. Refusing/delaying payment behaves consistently with other Work Contracts.
11. Save/load during the expedition keeps the same NPC, contract and commitment.
12. Existing construction Work Contracts behave as before.

## Completion criteria

The plan is complete when:

```text
ordinary NPC
→ sees paid expedition Work Contract
→ evaluates it from normal life context
→ accepts autonomously
→ receives normal provisioning if needed
→ Work Contract creates shared accompany commitment
→ NPC follows through npc-029
→ ordinary needs/danger interrupt but do not erase commitment
→ agreed duration/destination boundary resolves
→ Work Contract ends service
→ shared accompany commitment ends
→ assignment creates deterministic payment claim
→ existing payment/non-payment flow resolves it
→ NPC returns to normal life
```

with no companion-specific hiring AI, duplicate follow logic, synthetic construction work progress, duplicate payment system or duplicate NPC state ownership, and with existing construction Work Contracts behaviorally unchanged.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
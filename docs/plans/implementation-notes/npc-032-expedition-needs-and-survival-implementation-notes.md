# Implementation Notes: Expedition needs and survival

**Plan:** `docs/plans/npc-032-expedition-needs-and-survival.md`
**Reviewed:** 2026-09-18
**Codebase:** `main`

## Recon outcome

`npc-032` nie potrzebuje nowego companion survival systemu. Większość potrzebnej mechaniki już działa na zwykłym NPC, ale recon ujawnił kilka konkretnych integration gaps:

1. personal food/water + needs interruption/resume już działają;
2. detailed accompany już płaci zwykły walking stamina cost;
3. off-screen hunger/thirst + personal provisions + injury recovery już istnieją w generic travel checkpoint;
4. away NPC nadal może użyć home/settlement fallbacków po wyczerpaniu personal provisions;
5. scheduled sleep zawsze prowadzi do `home`;
6. healing nadal czyta treatment z transient `carried`, nie durable `personalInventory`;
7. `endAccompany()` nie uruchamia persistent return-home travel;
8. off-screen accompany survival przestaje się rozliczać po captured `arrivesAtDays`;
9. player-storage autonomous survival wymaga Stage 2 `items-player-032`, nie tylko `items-player-028`.

Implementator powinien zacząć od tych seamów, nie od kolejnego szerokiego reconu.

## 1. Authoritative ownership

### `src/settlement/npcState.ts`

`NpcAuthoritativeState` jest jedynym durable ownerem:

```text
health
stamina
vigor
needs
personalInventory
physicalInjury
injuryRecoveryUpdatedAtDays
accompanyCommitment
travel
```

`NpcStateSnapshot` już round-tripuje te pola przez save/load i WorldBundle rebuild.

Nie dodawać:

```text
companionNeeds
expeditionInventory
survivalPause
returnHomeState
companionFatigue
```

`NpcAgent.carried` pozostaje runtime-only cargo. To szczególnie ważne dla medicine.

## 2. Accompany contract from npc-029

### State owner

`src/ai/npcAccompanyCommitment.ts`

Current types/functions:

- `NpcAccompanyCommitment`;
- `NpcAccompanySourceRef = voluntary | work-contract`;
- `NpcAccompanyEndReason = abandoned | cancelled | death | finished`;
- `startNpcAccompanyCommitment()`;
- `setNpcAccompanyMode()`;
- `endNpcAccompanyCommitment()`.

Commitment jest semantic intent, nie current action.

### Detailed executor

`src/ai/NpcAgent.ts::tryPursueIdleDuty()` dispatchuje:

```text
escort service resolution
→ accompany
→ committed travel
→ Work Contract
→ player follow-up
→ voluntary proposal
→ schedule fallback
```

`tryPursueAccompany()` buduje zwykłe `NpcPlannedAction { kind: 'accompany' }`.

W `update()`, `kind === 'accompany'` używa tej samej fazy `goTo` co inne ruchy i retargetuje moving player destination bez osobnego movement engine.

### Interrupt/resume

`tickCriticalInterrupt()` → `interruptCurrentAction()` → `phase = choose`.

Nie czyści `accompanyCommitment`.

Po potrzebie/rest/heal `choose()` ponownie dochodzi do `beginIdle()` → `tryPursueIdleDuty()` → `tryPursueAccompany()`.

**Nie dodawać własnego resume stacku.**

## 3. Current physical-cost path

W `NpcAgent.update()`:

```text
phase === goTo
→ drainStamina(WALK_FATIGUE_RATE * fatigueMult * dt)
```

Accompany jest `goTo`, więc już płaci ten koszt.

Gdy stamina się kończy:

```text
goTo/execute
→ phase = exhausted
→ existing recovery
→ previousPhase
```

Vigor jest osobny:

- heavy work → `applyWorkVigor()`;
- sleep → `applySleepVigor()`;
- damage → `applyDamageVigor()`;
- collapse → `beginCollapseSleep()`.

Nie dodawać companion fatigue multiplier.

## 4. Sleep call-sites and the away-home bug

### Scheduled sleep

`NpcAgent.choose()`:

```text
decideNpcAction(...)
→ outcome === scheduledSleep
→ sleepReason = 'schedule'
→ beginGoSleep()
```

`beginGoSleep()`:

```text
prepareSleepDestination()
→ sleepDest = home
→ phase = goSleep
```

To jest bezpośredni home assumption, który trzeba zmienić dla active travel.

### Existing reusable locality rule

`NpcAgent.beginCollapseSleep()` już robi:

```text
distance(current, home)
→ preferHomeSleep(distance)
   ├─ true  → goSleep(home)
   └─ false → sleep here
```

`src/ai/npcVigor.ts::HOME_SLEEP_RANGE` i `preferHomeSleep()` są gotowym contractem.

Recommended implementation:

- wydzielić mały resolver/helper używany przez scheduled travel sleep i collapse;
- przy active `accompanyCommitment` albo purpose-backed committed travel zastosować `preferHomeSleep`;
- poza active travel zachować aktualne scheduled `goSleep(home)` bez zmian.

Nie tworzyć camp/bed state.

## 5. Food execution and the remote-home trap

### Call-site

`NpcAgent.beginNeed('food')` wybiera przez:

```ts
this.computeFoodStrategyCandidates(household)
```

### Candidate order

`src/ai/npcStrategies.ts::getFoodStrategyCandidates()`:

```text
playerStorageDelivery (deposit helper, only special case)
→ personalFood
→ householdFood
→ economyWithdraw
→ householdExchange
→ hunt
→ nearbyFoodSource
→ gardenGather (always available)
```

`personalFood` jest już poprawne i konsumuje `personalInventory`.

### Travel bug

`householdFood`, economy/exchange i unconditional `gardenGather` zakładają własną settlement locality. NPC posiada te references nawet kiedy accompany zabrał go daleko.

`nearbyFoodSource` i hunter query są inne: oba query zaczynają się od aktualnego `mesh.position` i używają bounded radius.

Recommended seam:

- nie zmieniać bazowego `getFoodStrategyCandidates()` dla zwykłego resident flow;
- dodać do candidate construction jawny travel-context input albo osobny source-eligibility adapter;
- w active travel wyłączyć settlement/home-only sources;
- zachować `personalFood`;
- zachować current-position bounded hunt/food query;
- dołączyć player-storage food source dopiero przez `items-player-032`.

Nie interpretować `gardenGather` jako realnego jedzenia dostępnego wszędzie.

## 6. Water execution and the home-origin bug

### Call-site

`NpcAgent.beginNeed('water')`:

```text
getWaterStrategyCandidates()
→ personalWater
→ householdWater
→ well
```

`personalWater` jest już poprawne.

### Well resolver

`NpcAgent.resolveWaterWellTarget()` obecnie pyta:

```ts
getNearbyPlayerWell?.(this.home.x, this.home.z, PLAYER_WELL_WATER_SEARCH_RADIUS)
```

i zawsze ma own-settlement wells jako fallback.

To oznacza home-relative lookup podczas wyprawy.

Recommended seam:

- resolver ma przyjąć/query origin;
- ordinary resident path przekazuje `home` jak dziś;
- active travel path przekazuje current NPC position;
- own-settlement well może być travel candidate tylko przy istniejącym bounded-distance check, nie jako unconditional fallback;
- player storage water po Stage 2 ma być realnym liquid-container transferem;
- nie dodawać natural-river drinking bez osobnego existing source contract.

## 7. Healing ownership bug — exact call-sites

W `src/ai/NpcAgent.ts` obecnie:

### Pressure

W `choose()`:

```ts
const injurySeverity = resolveInjurySeverity(...)
const treatmentKind = this.carried.findInjuryTreatment(injurySeverity)
const healPressure = healingPressure(..., treatmentKind != null)
```

### Execution

`beginHeal()`:

```ts
const kind = this.carried.findInjuryTreatment(severity)
...
this.carried.remove(kind, 1)
```

### Diagnostics/debug

- `debugInjuryState()` czyta `this.carried.findInjuryTreatment(...)`;
- `giveBandageForDebug()` dodaje bandage do `this.carried`.

### Correct owner

`NpcAuthoritativeState.personalInventory`.

Pressure i execution muszą znaleźć i zużyć treatment z tego samego ownera. Nie wystarczy zmienić tylko `beginHeal()`.

Dodatkowo `beginHeal()` zawsze ma:

```ts
destination: copyVec3(this.home)
```

Dla active travel + already-owned treatment użyć local/current position destination. Poza travel można zachować dotychczasowy home destination.

Do not call player medicine actions or create a fake player context.

## 8. Player-storage contracts — 028 vs 032

### items-player-028

Stage 1 plan/notes definiują tylko actor permission:

```text
companion/hired/explicit NPC
+ withdraw/deposit
→ allow/deny
```

Important existing contract from its notes:

- policy lives with physical placed container identity;
- dynamic companion group derives from `NpcAuthoritativeState.accompanyCommitment`;
- hired derives from `WorkContracts.findActiveWorkByNpc()`;
- commit revalidates membership/policy;
- transfer uses `inventoryTransfer`;
- destination inventory is caller-owned decision.

**028 explicitly says not to implement autonomous food/water acquisition.**

### items-player-032

Stage 2 owns:

- resource rules;
- `StorageAccessPurpose`;
- `assigned_only`;
- minimum reserve;
- per-withdraw limit;
- autonomous personal-need acquisition;
- expedition authority contexts.

For npc-032 the desired path is:

```text
normal hunger/thirst/healing decision
→ known + current-local storage candidate
→ Stage 1 actor gate
→ Stage 2 resource/purpose/reserve gate
→ atomic transfer
→ NpcAuthoritativeState.personalInventory
→ ordinary consume/heal action
```

Do not bypass 032 by calling raw `PlacedContainers.withdraw*`.

Do not cache permission at planning time; commit must revalidate.

## 9. Off-screen travel current execution path

### Handoff

`NpcAgent.beginOffscreenTravelHandoff()`:

- if accompany active, captures current position and current player/stay target;
- calls `beginOffscreenNpcTravel(...)`;
- preserves current travel metadata.

### World checkpoint

`SettlementsManager` calls:

```ts
npcStates.forEach((state) =>
  resolveNpcTravelCheckpoint(state, nowDays, dayLengthSec)
)
```

This is already bounded per checkpoint, not per-frame path simulation.

### Survival checkpoint

`src/ai/npcTravelCheckpoint.ts::resolveNpcTravelCheckpoint()`:

1. resolves off-screen survival interval;
2. writes `travel.survivalResolvedAtDays`;
3. on deprivation failure interpolates current position and calls `blockNpcTravel()`;
4. otherwise calls `resolveOffscreenNpcTravel()`.

### Generic survival

`src/ai/npcOffscreenSurvival.ts::resolveNpcOffscreenTravelInterval()`:

- event-based hunger/thirst progression;
- `consumeOnePersonalFood()`;
- `consumeOnePersonalDrink()`;
- `relieveNeed()`;
- `resolveInjuryRecovery()`;
- returns `cannot-progress` when hunger/thirst reaches full depletion with no personal supply.

It does not query household/player storage/world resources.

**Do not duplicate this logic.**

## 10. Off-screen accompany ETA trap

`npcTravelCheckpoint.ts::survivalToDays()` returns:

```ts
Math.min(nowDays, travel.execution.arrivesAtDays)
```

But `npcTravel.ts::resolveOffscreenNpcTravel()` has:

```ts
if (state.accompanyCommitment) {
  return travel.execution ? { kind: 'in-progress' } : { kind: 'none' }
}
```

Therefore active accompany never consumes the ordinary arrival, while survival stops at captured ETA.

Implementation should change the **generic checkpoint contract**, narrowly:

- when an active accompany commitment owns the off-screen leg, survival `toDays` may advance through `nowDays`;
- spatial interpolation remains capped by `travelProgress01()`;
- `survivalResolvedAtDays` advances monotonically;
- no per-frame player tracking is introduced.

Tests must cover a checkpoint significantly after `arrivesAtDays`.

## 11. `travel.blocked` semantics

Current `blockNpcTravel()` freezes spatial progress and preserves purpose/checkpoint.

For accompany:

- do not interpret `blocked` as automatic abandonment off-screen;
- off-screen resolver knows personal provisions but not all current-local world sources;
- after reification, normal need/resource resolution must run;
- if a local solution exists, clear/resume the same generic travel only after survival state is actually resolved;
- if critical survival state remains unsatisfied and no local source exists, then abandonment is valid.

Do not simply set `blocked = false` because the agent became live.

## 12. Continuation evaluator seam

Best location: immediately before/inside `tryPursueAccompany()`, after stronger needs/rest/heal already had their chance in `choose()`.

The evaluator should be pure and inspectable. Inputs should be already-derived facts, not services/managers.

Suggested shape:

```ts
type AccompanyContinuationResult =
  | { outcome: 'continue' }
  | {
      outcome: 'abandon'
      reason: 'critical-food-unresolved'
        | 'critical-water-unresolved'
        | 'critical-injury-unresolved'
    }
```

Names are implementation-adjustable; do not add numeric thresholds here.

Use:

- existing critical need semantics from `Needs`;
- `resolveInjurySeverity()`;
- current travel-aware strategy/source availability.

Do not include:

- morale;
- loyalty;
- route risk;
- random chance;
- ordinary exhaustion;
- ordinary sleep;
- one path failure;
- transient combat.

Trace the result/reason using existing NPC trace, not persisted fields.

## 13. Paid escort abandonment contract

If:

```ts
npcState.accompanyCommitment.source.kind === 'work-contract'
```

then source-specific lifecycle must be resolved through existing Work Contracts API.

Verified:

`src/world/createWorkContracts.ts` exposes:

```ts
release(id, npcId, reason = 'abandoned', timing)
```

and `src/world/workContract.ts` defines:

```ts
type WorkContractReleaseReason = 'abandoned' | 'death'
```

npc-030 already establishes: abandonment/death creates no new positive wage claim.

Recommended order:

1. capture current travel/live position required for return;
2. release matching work contract assignment as `abandoned`;
3. `endAccompany('abandoned')`;
4. create return-home generic travel.

For voluntary source skip step 2.

Do not make `npcAccompanyCommitment.ts` import Work Contracts.

## 14. Return-home — current gap and smallest integration

Current `NpcAgent.endAccompany()` does:

```ts
endNpcAccompanyCommitment(...)
npcState.travel = null
...
```

There is no durable return intent.

Current `NpcTravelPurpose` variants:

```ts
expedition
transport
merchant-return
```

The clean extension is one generic return purpose, e.g.:

```ts
{ kind: 'return-home' }
```

No extra state is needed because `NpcTravelContinuity` already owns:

- destination;
- lastPosition;
- execution;
- survival checkpoint;
- blocked;
- arrival.

### Detailed

`tryPursueCommittedTravel()` already moves purpose-backed travel toward its destination.

### Off-screen

`beginOffscreenNpcTravel()` + `resolveNpcTravelCheckpoint()`.

### Arrival

Purpose-backed arrival waits for `observeNpcTravelArrival()`.

Add a bounded generic return-home arrival observer at the same world/checkpoint layer that already observes transport/merchant arrivals, or equivalent narrow seam. On genuine non-blocked arrival clear only `travel`.

Do not create `CompanionReturnManager`.

## 15. Return-home must remain survival-aware

Starting return is not a cure.

Return NPC keeps the same:

- hunger/thirst;
- personalInventory;
- injury;
- stamina/vigor;
- health.

Detailed critical needs can interrupt return via normal arbitration. Off-screen personal provisions/injury use the same checkpoint.

If return becomes blocked, keep it blocked. Never teleport to home as recovery.

## 16. Schedule boundary

`tryPursueAccompany()` is only reached from idle-duty. This already prevents ordinary work/social/home from winning while accompany is actively available.

The two remaining schedule/home leaks found by recon are:

1. `scheduledSleep → beginGoSleep(home)`;
2. need strategies that use household/economy/garden/well regardless of distance.

Fix those specific leaks rather than introducing a new companion schedule.

Purpose-backed `tryPursueCommittedTravel()` should receive the same resource/sleep locality treatment.

## 17. Time-skip caveat

`NpcAgent.resolveTimeSkip()` already detects:

```ts
hasCommittedNpcTravel(this.npcState.travel)
```

and delegates to `catchUpCommittedTravel()` instead of ordinary schedule teleport.

Do not reintroduce old `resolveTimeSkip` magic need relief into travel survival.

Important historical trap: ordinary non-travel time-skip currently relieves food/water abstractly as part of schedule catch-up. `npc-032` travel path must stay on `resolveNpcTravelCheckpoint()`, which consumes real personal provisions.

## 18. Persistence/reconstruction seam

No new save section.

If adding `NpcTravelPurpose.return-home`, update all exhaustive copy/validation points:

- `cloneNpcTravelPurpose()`;
- any save-data validator/schema touching travel purpose;
- tests for `NpcStateSnapshot` round-trip;
- docs/state only if implementation changes current architecture materially.

`NpcAgent` constructor already reifies existing `npcState.travel` and retains it when purpose-backed.

Do not persist continuation evaluator outputs.

## 19. Travelling merchant boundary

Current `src/settlement/merchantJourney.ts` already reuses `NpcTravelContinuity` for merchant return with purpose:

```ts
{ kind: 'merchant-return', homeSettlementId }
```

`settlements-npcs-050` draft is pre-departure readiness/provisioning.

Therefore:

- merchant readiness remains outside npc-032;
- generic travel/survival fixes here must not check `isCompanion`;
- `npcOffscreenSurvival` and travel checkpoint improvements should automatically remain reusable by merchants;
- do not touch merchant cargo, pack-animal capacity or visit lifecycle unless a generic type exhaustiveness change requires it.

## 20. Things already solved — do not duplicate

Do not reimplement:

- need meters / critical thresholds — `Needs.ts`;
- pressure arbitration — `NpcAgent.choose()` + `npcDecision.ts`;
- personal food/water consumption — `npcPersonalProvisions.ts`;
- paid escort provisioning estimate — `estimateEscortProvisionNeed()`;
- personal belongings owner — `NpcAuthoritativeState.personalInventory`;
- follow/stay commitment — npc-029;
- atomic storage transfers — items-player-028 planned seam over `inventoryTransfer`;
- resource/context storage policy — items-player-032;
- injury severity/treatment capability — npc-025;
- generic off-screen travel — `npcTravel.ts`;
- generic off-screen hunger/thirst — `npcOffscreenSurvival.ts`;
- expedition assignment provisioning — `world/expeditionProvisioning.ts`;
- merchant readiness — settlements-npcs-050.

## Recommended implementation order

1. Tests that capture current accompany + personal provisions + detailed stamina behaviour.
2. Shared medicine ownership correction: pressure, execution, debug.
3. Travel-aware food/water candidate gating with current-position bounded sources.
4. Scheduled-sleep travel locality using existing `preferHomeSleep`.
5. Integrate final items-player-028/032 player-storage source API once those dependencies land.
6. Pure continuation evaluator + trace.
7. Paid/voluntary abandonment orchestration.
8. Generic `return-home` travel purpose + idempotent arrival cleanup.
9. Fix off-screen accompany survival beyond captured ETA.
10. Resolve/recover blocked travel only through real local survival success.
11. Persistence/exhaustiveness tests and focused docs updates.

For new public architectural helpers add focused JSDoc; use `@domain npc` where useful.

## Focused verification set

High-value automated tests:

- accompany action interruption/resume keeps the same commitment;
- travel context removes remote household/garden/well fallback;
- non-travel context keeps current source ordering;
- personal water/food still wins;
- current-position local food/well is discoverable with bounded query only;
- personal bandage drives heal pressure and is consumed from same inventory;
- scheduled sleep far from home sleeps locally; near home still may reuse home;
- ordinary exhaustion/sleep/combat never calls abandonment;
- critical unresolved need does;
- paid abandonment releases work assignment before return;
- voluntary abandonment never touches Work Contracts;
- return-home travel round-trips through NPC state snapshot;
- blocked return is not arrival;
- survival checkpoint after accompany leg ETA continues hunger/thirst accounting;
- repeated checkpoint is idempotent;
- no off-screen player-storage withdrawal/global query;
- merchant/transport/expedition travel-purpose tests remain green after union extension.

AI does not perform browser verification.

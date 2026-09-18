# Plan: Expedition needs and survival

**Created:** 2026-09-11
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** ~~npc-029~~, ~~npc-017~~, ~~npc-025~~, ~~settlements-npcs-028~~, items-player-028, items-player-032
**Domain:** `npc`
**Type:** `feature`
**Subdomains:** `needs` `behavior` `decision-making` `lifecycle`
**Tags:** `companions` `expedition` `survival` `provisions` `healing` `off-screen`
**Roadmap:** `companions.md`
**Model:** Sonnet, Composer

## Goal

Sprawić, aby NPC posiadający aktywny `accompanyCommitment` nadal funkcjonował jako zwykły autonomiczny NPC podczas wielogodzinnej lub wielodniowej wyprawy.

Docelowy model pozostaje:

```text
normal NPC needs
+ personalInventory
+ permitted external resources
+ accompany commitment
+ current world situation
→ normal decisions/actions
```

Accompany jest trwałym semantic commitmentem, ale nie osobnym survival mode. Głód, pragnienie, odpoczynek, uraz, danger/flee i śmierć pozostają własnością istniejących NPC systems.

Nie tworzyć:

- `CompanionNeeds`, `ExpeditionSurvivalSystem` ani companion-only pressure table;
- expedition inventory, ration counter ani drugiej kopii `personalInventory`;
- osobnego companion tickera/off-screen loop;
- companion schedule;
- route-wide resource/danger simulation.

## Recon result — what already works

### Authoritative state and persistence

`src/settlement/npcState.ts::NpcAuthoritativeState` już jest jednym ownerem dla:

- `needs`;
- `stamina`;
- `vigor`;
- `health`;
- `physicalInjury` + `injuryRecoveryUpdatedAtDays`;
- `personalInventory`;
- `accompanyCommitment`;
- `travel`.

Ten sam obiekt przeżywa `NpcAgent` reconstruction, settlement stream-out/in, `WorldBundle` rebuild i `SaveData.npcStates`.

`NpcAgent.carried` jest transient work/logistics cargo i nie może stać się expedition inventory.

**Decision:** `npc-032` nie dodaje nowego persisted survival state. Jeżeli potrzebny jest dodatkowy checkpoint podróży, należy rozszerzyć istniejący generic `NpcTravelContinuity`.

### Hunger/thirst and ordinary interruption/resume

`NpcAgent.update()` tickuje zwykłe `needs`, a `choose` arbitruje je w istniejącym pressure/decision pipeline.

`tickCriticalInterrupt()` raz na sekundę potrafi przerwać schedule-driven `goTo/execute` dla critical need albo vigor collapse i wraca do pełnego `choose`.

`npc-029` już wykonuje accompany jako idle-duty przez `tryPursueAccompany()`. Survival action nie kasuje `accompanyCommitment`; po zakończeniu normalna re-arbitracja ponownie odnajduje ten sam commitment.

**Decision:** zwykły hunger/thirst/exhaustion/sleep/combat/flee jest temporary interruption, nie abandonment.

### Personal food and water

`src/ai/npcPersonalProvisions.ts` oraz zwykłe strategie już używają `personalInventory`:

- `personalFood` jest pierwszym realnym hunger source przed pantry/settlement fallbackami;
- `personalWater` jest pierwszym water source;
- food zachowuje freshness;
- water zużywa realne liquid-container instances;
- `estimateEscortProvisionNeed()` i provisioning z `npc-017/npc-030` już istnieją.

Paid escort może więc dostać realne provisions przed usługą, a runtime nie potrzebuje nowego ration modelu. Voluntary companion nie dostaje magicznego auto-provisioningu.

### Detailed stamina/vigor/rest

Accompany używa zwykłego `NpcPlannedAction { kind: 'accompany' }` i fazy `goTo`, więc walking już płaci `WALK_FATIGUE_RATE`. `exhausted` zatrzymuje ruch i po recovery wraca do poprzedniej fazy. Vigor collapse ma najwyższy priorytet i reuse istniejący sleep path.

Nie dodawać expedition stamina/vigor.

### Injury and natural recovery

`physicalInjury`, derived severity oraz lazy `resolveInjuryRecovery()` są już normalnym authoritative NPC state. `npc-025` dostarcza treatment suitability i severity semantics.

### Danger/flee

Detailed NPC już reaguje na lokalne threat/combat poprzez istniejące flow. Te reakcje mogą przerwać accompany action bez kasowania commitmentu.

Nie dodawać route danger modelu ani off-screen encounters w tym planie.

### Generic travel/off-screen survival

Po `settlements-npcs-028` istnieją:

- `src/ai/npcTravel.ts` — `NpcTravelContinuity`, detailed ↔ off-screen handoff, interpolation, blocking i purpose-backed arrival;
- `src/ai/npcTravelCheckpoint.ts::resolveNpcTravelCheckpoint()`;
- `src/ai/npcOffscreenSurvival.ts::resolveNpcOffscreenTravelInterval()`.

Generic off-screen survival już:

- tickuje hunger/thirst deterministycznie po elapsed world time;
- konsumuje realne personal food/water;
- rozwiązuje lazy injury recovery;
- zatrzymuje travel jako `blocked`, gdy deprivation osiągnie limit bez personal provisions;
- używa `survivalResolvedAtDays`, więc ten sam interval nie jest rozliczany dwa razy.

Nie tworzyć companion off-screen engine.

## Recon gaps that this plan actually owns

### 1. Away companion still sees home/settlement fallback sources

Po wyczerpaniu personal provisions zwykły `beginNeed()` nadal może wybrać źródła zakładające lokalność własnej osady:

Food:

```text
personalFood
→ householdFood
→ SettlementEconomy / household exchange
→ hunt / nearbyFoodSource
→ unconditional gardenGather
```

Water:

```text
personalWater
→ householdWater
→ settlement/player well resolved relative to home
```

To jest poprawne dla zwykłego mieszkańca, ale nie dla NPC kilometry od domu.

**Decision:** przy aktywnym accompany albo purpose-backed long-distance travel nie wolno traktować household/economy/home garden/home well jako zdalnie dostępnych.

Travel-aware acquisition ma używać wyłącznie:

1. zasobu już w `personalInventory`;
2. bounded source query istniejącego przy **bieżącej pozycji** NPC;
3. known/reachable player storage dopuszczonego przez finalny Stage 2 storage contract;
4. inaczej — brak wykonalnej strategii, bez magicznego fallbacku do domu/ogrodu.

Food może reuse `SettlementFoodSourceHooks.queryNearest(currentPosition, FOOD_SOURCE_SEARCH_RADIUS)` i hunter target query, ponieważ oba są już lokalne względem live NPC.

Water ma reuse istniejący player-well lookup, ale origin dla travel survival musi być current NPC position, nie `home`. Znane own-settlement wells mogą być kandydatem tylko wtedy, gdy mieszczą się w istniejącym bounded well-search contract; nie dodawać globalnego well scan. Nie ma dziś generic natural-water NPC source i ten plan go nie wymyśla.

Poza travel context obecna kolejność strategii pozostaje bez zmian.

### 2. Scheduled sleep explicitly walks to home

`decideNpcAction()` może zwrócić `scheduledSleep`, a `NpcAgent.beginGoSleep()` zawsze ustawia `sleepDest = home`.

To oznacza, że companion w nocy może próbować wrócić do własnego domu mimo aktywnej wyprawy.

`beginCollapseSleep()` ma już właściwy neutralny precedent: używa `preferHomeSleep(distance)`; gdy NPC jest dalej niż `HOME_SLEEP_RANGE`, śpi w miejscu.

**Decision:** scheduled sleep przy aktywnym accompany/purpose-backed travel ma reuse tę samą locality rule:

```text
home within existing HOME_SLEEP_RANGE
→ existing goSleep(home)

otherwise
→ existing sleep phase at current locality
```

Nie tworzyć campsite, fake home ani companion bed. Waking wraca do `choose()`, więc commitment wznowi się naturalnie.

### 3. Healing still reads transient `carried`

Aktualnie zarówno healing pressure w `NpcAgent.choose()`, jak i `beginHeal()`, `debugInjuryState()` oraz `giveBandageForDebug()` używają `this.carried`.

To jest sprzeczne z authoritative personal belongings i powoduje, że bandage przekazany przez player → `personalInventory` jest niewidoczny dla zwykłego self-healing.

**Decision:** w ramach tego planu wykonać małą **shared NPC healing ownership correction**, nie companion branch:

```text
physicalInjury
→ severity
→ suitable treatment lookup in personalInventory
→ same owner revalidated on heal completion
→ consume from personalInventory
```

Jeżeli preflight znajdzie realny workflow, w którym treatment celowo siedzi w `carried`, może zostać jawnie obsłużony jako drugie źródło z zachowaniem source identity. `carried` nie może być domyślnym ownerem personal medicine.

Self-treatment podczas active travel nie może wymagać powrotu do `home`. Gdy suitable treatment jest już osobistą własnością NPC, heal action ma wykonywać się lokalnie przy current position. Poza travel context dotychczasowe home treatment behaviour może pozostać.

### 4. Player storage Stage 1 is insufficient

`items-player-028` jest obecnie `planned` i definiuje tylko actor-level `withdraw/deposit` allow/deny.

Jego własne implementation notes jawnie odkładają do `items-player-032`:

- resource/category rules;
- `StorageAccessPurpose`;
- `assigned_only`;
- reserves/limits;
- autonomous food/water acquisition;
- expedition authority.

`items-player-032` jest również `planned` i zależy od `items-player-028`.

**Decision:** runtime use of player storage w `npc-032` zależy od **obu** planów, a właściwym resource/context integration contractem jest `items-player-032`.

Storage nie tworzy pressure. Jest tylko source candidate w zwykłej hunger/thirst/healing strategy i finalny transfer zawsze idzie do `personalInventory`.

Nie implementować w `npc-032` własnej storage policy, reserve ani grant lifecycle.

### 5. `endAccompany()` does not create return-home travel

Aktualne `NpcAgent.endAccompany()`:

1. czyści `accompanyCommitment`;
2. ustawia `npcState.travel = null`;
3. wraca do ordinary decision flow.

Detailed NPC może później wrócić do domu przez schedule, ale nie ma persistent/off-screen **return-home commitment**. `NpcTravelPurpose` posiada dziś `expedition`, `transport` i `merchant-return`, ale nie zwykły NPC return-home.

**Decision:** survival abandonment musi przejść przez istniejący generic travel owner, dodając najmniejszy reusable purpose, np.:

```ts
{ kind: 'return-home' }
```

bez osobnego `CompanionReturnState`.

Flow:

```text
capture current authoritative position/checkpoint
→ source-specific abandonment consequence
→ end accompany
→ create generic travel to existing NPC home position with return-home purpose
→ normal travel + survival interruptions
→ purpose arrival observed exactly once
→ clear travel
→ ordinary schedule
```

Arrival observer ma być generic/bounded i nie tworzyć drugiego registry.

### 6. Off-screen accompany survival stops at captured leg ETA

`npcTravelCheckpoint.ts::survivalToDays()` ogranicza survival resolution do `execution.arrivesAtDays`.

Dla ordinary purpose travel arrival kończy leg, ale `resolveOffscreenNpcTravel()` celowo nie kończy travel, gdy `accompanyCommitment` nadal istnieje. W efekcie off-screen companion po dojściu do zamrożonego targetu może pozostać unloaded dłużej, a hunger/thirst nie są dalej rozliczane po captured ETA.

**Decision:** poprawić **generic checkpoint semantics**, nie companion ticker:

- spatial interpolation nadal kończy się na captured destination;
- dla aktywnego accompany survival elapsed time ma być rozliczany do aktualnego checkpoint `nowDays`, również po captured spatial ETA;
- reification nadal umieszcza NPC maksymalnie na captured destination, po czym live follow retargetuje do bieżącej pozycji gracza;
- `survivalResolvedAtDays` pozostaje exactly-once anchor.

Nie robić per-frame retargetingu unloaded NPC ani śledzenia całej trasy gracza.

### 7. Generic off-screen survival currently does not simulate fatigue/rest

`npcOffscreenSurvival.ts` świadomie nie dotyka stamina/vigor; current generic travel ETA również nie modeluje cyklu marsz–odpoczynek.

**Decision V1:** `npc-032` nie wymyśla drugiego coarse fatigue modelu ani nie zmienia generic ETA. Off-screen fidelity dla tego planu to:

- hunger/thirst + real provisions;
- injury recovery;
- death/blocking;
- preservation (bez resetu) stamina/vigor.

Detailed simulation nadal ma pełne stamina/exhaustion/sleep semantics. Osobny generic travel-rest/ETA model wymaga własnego planu, jeśli będzie potrzebny. Nie fałszować go lokalnie tylko dla companions.

## Detailed resource-resolution contract

### Food during accompany/travel

```text
hunger pressure wins
→ personal food?
→ bounded nearby real food/hunt source?
→ permitted + known/reachable player storage food?   [after items-player-032]
→ none
```

Nie korzystać z remote household/economy/abstract garden tylko dlatego, że NPC nadal ma household pointer.

Po withdrawal z player storage item trafia do `personalInventory`; ordinary personal-food action odpowiada za konsumpcję.

### Water during accompany/travel

```text
thirst pressure wins
→ drinkable personal liquid container?
→ permitted + known/reachable player storage water container? [after items-player-032]
→ bounded usable well near current NPC position?
→ none
```

Water pozostaje realnym liquid-container state. Nie dodawać scalar expedition water.

### Medicine during accompany/travel

```text
injury pressure
→ suitable treatment in personalInventory?
→ permitted + known/reachable player storage treatment? [after items-player-032]
→ none
```

Jeżeli storage dostarcza treatment, najpierw real transfer do `personalInventory`, potem normalny healing action.

### Off-screen resources

Off-screen resolver może używać tylko tego, co authoritative i dostępne bez world scan:

- `personalInventory`.

Nie pobierać z player storage, household, wells ani world resources off-screen. Brak personal provisions może ustawić travel `blocked`; detailed/reified NPC dopiero sprawdza lokalne źródła.

## Commitment continuation and abandonment

Nie dodawać persistent `survival_pause`.

Przed ponownym wykonaniem `tryPursueAccompany()` dodać mały pure/inspectable continuation check, który używa istniejących state/severity/resource-candidate semantics.

### Continue

Commitment pozostaje aktywny przy:

- ordinary hunger/thirst, jeśli istnieje normalna wykonalna survival strategy;
- stamina exhaustion;
- scheduled/local sleep;
- vigor collapse/recovery;
- temporary combat/flee;
- single movement/path failure;
- serious injury, jeżeli zwykły recovery/treatment path nadal istnieje.

### Abandon

V1 może zakończyć expedition tylko na podstawie już istniejących hard survival semantics:

1. **critical hunger/thirst + brak wykonalnego travel-local source** po normalnym strategy resolution;
2. **critical physical injury + brak suitable treatment/recovery path**, zgodnie z `npc-025`;
3. reified `travel.blocked` z off-screen deprivation, jeśli po ponownej lokalnej resolution nadal nie istnieje wykonalny source.

Nie kopiować numeric thresholds — użyć `Needs` critical semantics i `resolveInjurySeverity()`.

Off-screen checkpoint sam **nie powinien automatycznie abandonować** tylko dlatego, że personal provisions się skończyły: nie posiada bounded world context do udowodnienia, że przy aktualnej pozycji nie istnieje local source. Ma zatrzymać travel i zachować stan do późniejszej resolution.

Death pozostaje owned przez istniejący death lifecycle i nie jest survival abandonment.

### Source-specific consequence

Dla voluntary source:

```text
endAccompany('abandoned')
→ return-home travel
```

Dla `work-contract` escort:

```text
WorkContracts.release(contractId, npcId, 'abandoned', timing)
→ endAccompany('abandoned')
→ return-home travel
```

Reuse istniejące npc-030 semantics: abandonment nie tworzy dodatniej wage claim. `npc-032` nie liczy wynagrodzeń ani reputation consequences.

## Interrupt/resume lifecycle

Detailed flow:

```text
accompany action
→ critical need / collapse / danger
→ existing interruption
→ ordinary need/rest/heal/flee action
→ state mutation
→ choose()
→ continuation evaluation
   ├─ viable → same accompany commitment drives next idle duty
   └─ non-viable → explicit abandonment + return-home travel
```

Nie przechowywać konkretnej przerwanej follow action. Semantic commitment jest wystarczającym resume ownerem.

## Return-home lifecycle

Return-home jest zwykłym generic travel, nie teleportem i nie schedule shortcutem.

Required semantics:

- destination = istniejąca home position NPC;
- detailed live NPC używa `tryPursueCommittedTravel()`;
- stream-out używa `beginOffscreenNpcTravel()`;
- `resolveNpcTravelCheckpoint()` rozlicza hunger/thirst/injury;
- critical needs mogą zatrzymać/interrupt return tak samo jak inną podróż;
- blocked return pozostaje blocked, nie teleportuje NPC;
- arrival jest obserwowany idempotentnie i usuwa tylko generic travel;
- po arrival zwykły schedule odzyskuje authority.

Nie zmieniać household/settlement membership.

## Travel schedule boundary

Aktywny `accompanyCommitment` lub purpose-backed long-distance `travel` zastępuje lokalne routine duties jako low-priority commitment.

Podczas takiej podróży:

- physiology, injury, weather, danger i sleep pozostają authoritative;
- local `work/home/eat/social` schedule nie może wysłać NPC kilometrami do home settlement;
- scheduled sleep korzysta z travel-local rule opisanej wyżej;
- po return-home arrival ordinary schedule działa dokładnie jak wcześniej.

Nie modyfikować `SCHEDULE_TEMPLATES`; gate ma być przy dispatch/source resolution.

## Persistence and reconstruction

Prefer zero new `NpcAuthoritativeState` fields.

Persistowane pozostają istniejące:

- needs/stamina/vigor/health/injury;
- `personalInventory`;
- `accompanyCommitment`;
- `travel`, w tym `survivalResolvedAtDays`, `blocked`, `arrival` i nowy generic purpose variant jeśli dodany.

Transient:

- phase/action/path;
- follow hysteresis;
- continuation evaluation result;
- local strategy candidates.

Reconstruction ma wyprowadzać zachowanie z tych samych authoritative fields, bez companion flags.

## Performance guardrails

Nie dodawać:

- per-frame expedition survival scans;
- dodatkowego companion tickera;
- globalnych scans player storages/wells/food;
- route-wide danger/resource simulation;
- off-screen pathfinding;
- per-meter persisted path.

Reuse:

- istniejący once-per-second critical interrupt cadence;
- normalny decision cadence;
- bounded `FOOD_SOURCE_SEARCH_RADIUS` / existing well lookup;
- Stage 2 known/reachable storage candidates;
- checkpoint/lazy `resolveNpcTravelCheckpoint()`;
- event-based `npcOffscreenSurvival`.

Multiple companions są oceniani niezależnie na ich istniejących NPC ticks/checkpoints; nie tworzyć party managera.

## Integration points

### `src/ai/NpcAgent.ts`

Zweryfikowane call-sites:

- `update()` — needs/stamina/vigor ticking i critical interruption;
- `choose` block — healing pressure obecnie czyta `carried`;
- `beginNeed()` — food/water execution oraz home-based fallback assumptions;
- `computeFoodStrategyCandidates()` — travel-aware filtering/source candidates;
- `beginHeal()` — treatment owner + local travel treatment;
- `beginCollapseSleep()` / `beginGoSleep()` — reuse locality semantics dla scheduled travel sleep;
- `tryPursueIdleDuty()` / `tryPursueAccompany()` — continuation/abandonment boundary;
- `endAccompany()` — obecnie czyści travel; survival abandonment potrzebuje capture → end → generic return orchestration;
- `beginOffscreenTravelHandoff()`;
- `catchUpCommittedTravel()`;
- `tryPursueCommittedTravel()`;
- `debugInjuryState()` / `giveBandageForDebug()` — align z personal treatment ownership.

### `src/ai/npcStrategies.ts`

Rozszerzyć zwykłe source candidates/gating; nie tworzyć companion strategy table.

### `src/ai/npcPersonalProvisions.ts`

Reuse consumption, counts i existing escort estimate. Nie dodawać expedition ration state.

### `src/ai/npcTravel.ts`

Dodać tylko minimalny generic return-home purpose/arrival support potrzebny do persistent return. Nie dodawać companion travel type.

### `src/ai/npcTravelCheckpoint.ts`

Domknąć survival-after-captured-ETA dla aktywnego accompany, zachowując exactly-once `survivalResolvedAtDays`.

### `src/ai/npcOffscreenSurvival.ts`

Reuse jako jedyny coarse survival resolver. V1 nie rozszerza go o osobny stamina/vigor model.

### `src/settlement/npcState.ts`

Tylko additive serialization support, jeśli generic `NpcTravelPurpose` dostanie nowy variant. Nie dodawać survival fields.

### Storage seam after `items-player-028` + `items-player-032`

Reuse policy-aware transfer, resource/context rule, reserve i current-state revalidation. `npc-032` tylko dostarcza normalny `personal_need` / treatment intent i destination `personalInventory`.

### `src/world/createWorkContracts.ts`

Reuse `WorkContracts.release(..., 'abandoned', timing)` dla paid escort abandonment.

## Dependencies and boundaries

### `npc-029-npc-accompany-follow-commitment` — implemented / verification needed

Owns source-neutral `accompanyCommitment`, follow/stay, ordinary interruption/resume i public start/set/end seams.

`npc-032` nie kopiuje commitmentu.

### `npc-017-work-contracts-food-and-drink` — implemented

Owns durable personal provisions i normalne personal food/water use.

### `npc-025-injury-severity-and-treatment-requirements` — implemented

Owns injury severity, impairment, suitability i lazy natural recovery.

### `settlements-npcs-028-long-distance-npc-travel-and-expedition-movement` — implemented / verification needed

Owns generic long-distance travel checkpoint oraz `npcOffscreenSurvival`. To jest realny foundation; stary draft nie powinien już traktować go jako przyszłego API.

### `items-player-028-npc-player-storage-access-policies` — planned

Stage 1 actor-level permission. Nadal wymagany foundation.

### `items-player-032-npc-player-storage-resource-and-context-rules` — planned

Bezpośredni contract dla autonomous survival withdrawals, resource rules, reserve i purpose/authority. Player-storage część `npc-032` nie może zostać zaimplementowana przed tym planem.

### `items-player-027-player-to-npc-item-transfer-and-equipment`

Already-landed ownership contract dla ręcznie przekazanych provisions/medicine → `personalInventory`.

### `npc-030` / `npc-031`

Źródła commitmentu, nie runtime survival owners. Paid i voluntary companions mają używać identycznego `npc-032` flow.

### Settlement expeditions

`src/world/expeditionProvisioning.ts` jest assignment-specific provisioning dla settlement expedition party. Nie jest runtime companion survival ownerem. Jego invariant — real items trafiają do member `personalInventory` — pozostaje zgodny z tym planem.

### Travelling merchants

`settlements-npcs-050-merchant-journey-provisioning-and-readiness.md` jest obecnie draftem i dotyczy **pre-departure readiness/provisioning** merchant party.

Boundary:

```text
settlements-npcs-050
→ czy merchant/party jest gotowy do wyjazdu i jak zdobywa brakujące wyposażenie przed departure

npc-032/shared NPC travel survival
→ co dzieje się z normalnym NPC po rozpoczęciu podróży
```

Nie przenosić merchant cargo/readiness/pack-animal logic do `npc-032`. Każdy source-neutral helper poprawiony tutaj (personal provisions, generic travel checkpoint, return semantics) powinien pozostać reusable dla merchant travel.

## Scope

Included:

1. Travel-aware food/water source eligibility bez remote home/settlement fallback.
2. Reuse personal provisions as first survival source.
3. Integration z Stage 2 permitted player storage jako normalnym source candidate.
4. Scheduled sleep locality podczas active travel.
5. Shared healing ownership correction `carried → personalInventory`.
6. Local self-treatment podczas travel.
7. Pure bounded continuation/abandonment evaluation.
8. Paid-escort release przez istniejący Work Contract lifecycle.
9. Persistent generic return-home travel po abandonment.
10. Off-screen accompany survival continuing after captured spatial ETA.
11. Existing travel-blocked → detailed resolution → resume/abandon flow.
12. Diagnostics/tests potrzebne do obserwowania tych decyzji.

## Non-goals

- companion-only needs/inventory/survival AI;
- expedition loadout planning;
- automatic voluntary-companion provisioning;
- merchant readiness/cargo/pack-animal preparation;
- new natural-water system;
- campsite/bedroll/camp building;
- new danger scoring or random travel encounters;
- companion combat cooperation;
- relationship/reputation consequences;
- paid escort wage logic;
- storage policy/UI implementation;
- global source discovery;
- new off-screen stamina/vigor/ETA model;
- party/group survival manager;
- player teleport/catch-up.

## Implementation order

1. Add focused regression tests around current accompany + need/sleep/heal/travel behaviour before changing logic.
2. Correct shared NPC treatment ownership to `personalInventory`; align debug helper/inspection.
3. Add travel-aware source eligibility to food/water strategy construction while leaving non-travel behaviour byte-for-behaviour equivalent.
4. After `items-player-028/032` land, wire authorized current-local player storage as ordinary food/water/treatment source; transfer to `personalInventory` and revalidate at commit.
5. Reuse `preferHomeSleep` for scheduled sleep during active travel so distant NPC sleeps locally.
6. Add pure continuation evaluator at the accompany idle-duty boundary using existing critical need/injury semantics and current resource candidates.
7. Add source-specific abandonment orchestration: Work Contract release when applicable, then `endAccompany('abandoned')`.
8. Extend generic `NpcTravelPurpose` with return-home purpose and start persistent travel from the captured current/checkpoint position.
9. Extend generic checkpoint semantics so active accompany keeps settling survival after captured ETA; preserve exactly-once checkpointing.
10. Resolve `travel.blocked` after reification: normal local need resolution first, then clear/resume or abandon; never magic-unblock.
11. Extend existing trace/inspection with only the minimum reason/result needed to debug continuation/abandonment.
12. Add JSDoc to important public/architectural helpers; use `@domain npc` where useful for preflight discovery.

## Automated verification

Cover at least:

- critical hunger/thirst interrupts follow without clearing commitment when a viable source exists;
- personal food/water is consumed from `personalInventory`;
- away companion with empty provisions does **not** walk to remote household/economy/abstract garden/home well;
- bounded nearby food/well source remains usable during travel;
- Stage 2 allowed player-storage food/water/treatment works only through the authoritative policy/resource gate and respects reserve/current-state revalidation;
- non-travel NPC retains current household/economy/garden/well behaviour;
- follow walking still drains stamina through ordinary `goTo`; exhaustion recovers and resumes;
- distant scheduled sleep uses local `sleep`, not multi-kilometre `goSleep(home)`;
- waking re-arbitrates and resumes the same commitment;
- bandage in `personalInventory` is seen by healing pressure and consumed by `beginHeal()`;
- travel self-heal does not require home; ordinary non-travel heal behaviour remains valid;
- ordinary hunger/thirst/exhaustion/sleep/combat/flee/path retry do not abandon;
- critical unsatisfied survival state can produce `abandoned` only after normal source resolution proves no path;
- paid escort abandonment calls existing Work Contract release semantics and does not create a positive wage claim;
- voluntary abandonment does not touch Work Contracts;
- abandonment captures current position, clears accompany and starts purpose-backed return-home travel;
- return survives stream-out/save/load and arrival clears only the travel commitment;
- blocked return never teleports home;
- off-screen accompany continues hunger/thirst settlement beyond the captured spatial ETA;
- `survivalResolvedAtDays` prevents duplicate need drift/consumption across repeated checkpoints/save/load;
- off-screen exhaustion/vigor are preserved, not reset or independently re-simulated;
- reified blocked travel attempts normal local resolution before abandonment;
- multiple accompanying NPCs remain independent;
- NPC without accompany/committed travel is regression-identical.

AI does not perform browser verification. Manual gameplay verification belongs to User.

## Completion criteria

The plan is complete when a companion remains an ordinary NPC:

```text
ordinary needs/injury/rest
+ personalInventory
+ current-local legal sources
+ accompanyCommitment
→ ordinary decision/action
→ temporary survival interruption
→ resume commitment
   OR
→ explicit bounded abandonment
→ generic persistent return-home travel
→ ordinary life
```

and the same authoritative state remains coherent across detailed/off-screen execution without companion-only state, remote home-resource assumptions, duplicated inventory or a second survival engine.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

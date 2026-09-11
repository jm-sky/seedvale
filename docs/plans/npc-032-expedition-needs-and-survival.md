# Plan: Expedition needs and survival

**Created:** 2026-09-11
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** npc-029, npc-017, npc-025, items-player-028
**Domain:** `npc`
**Subdomains:** `needs` `behavior` `decision-making` `lifecycle`
**Tags:** `companions` `expedition` `survival` `provisions` `healing` `off-screen`
**Roadmap:** `companions.md`

> **Draft note:** ten plan opisuje integrację istniejącej autonomii i survivalu NPC z tymczasowym `accompany/follow commitment`. Przed zmianą statusu na `planned` należy ponownie zweryfikować finalne API `settlements-npcs-019`, `npc-029` i `items-player-028`, ponieważ obecnie pozostają planowanymi zależnościami. Nie implementować companion-specific survival state.

## Goal

Sprawić, aby NPC posiadający tymczasowy `accompany/follow commitment` nadal funkcjonował jako zwykły autonomiczny NPC podczas wyprawy.

Wyprawa ma korzystać z istniejących:

- hunger/thirst,
- stamina/vigor i rest,
- needs/pressures/strategies/actions,
- `personalInventory`,
- provisions,
- injury/healing,
- player-storage access policy,
- combat/flee interruption,
- persistent accompany commitment,
- generic travel/off-screen continuity,
- schedule/place/home context.

Docelowy przepływ:

```text
ordinary NPC
+
active accompany commitment
        ↓
normal hunger / thirst / fatigue / injury / danger
        ↓
existing pressure + decision arbitration
        ↓
survival action interrupts follow
        ↓
existing resource acquisition / personal provisions / permitted storage
        ↓
need resolved
        ↓
normal re-arbitration
        ↓
is accompany commitment still viable?
    ├─ yes → resume same accompany duty
    └─ no  → explicitly end commitment with reason
                  ↓
             generic return travel
                  ↓
             normal NPC life
```

Nie tworzyć:

- `CompanionNeeds`,
- `CompanionSurvival`,
- `CompanionProvisions`,
- `CompanionRest`,
- `CompanionHealing`,
- osobnego inventory,
- osobnego survival/off-screen engine,
- nowych hunger/thirst/fatigue meters dla towarzyszy.

## Current architecture and reuse

### Hunger/thirst already belong to ordinary NPC pressure arbitration

`src/ai/Needs.ts` już posiada:

- hunger i thirst,
- deterministic pressure generation,
- normalne i critical thresholds,
- normalny relief po zakończeniu action.

`NpcAgent` arbitruje te pressures razem z weather, healing i innymi decision candidates. Critical physiological pressure już potrafi przerwać bieżącą akcję bez kasowania trwałego commitmentu.

**Implication:** accompany nie potrzebuje własnego hunger/thirst modelu ani innych thresholdów.

### Personal provisions are already normal NPC resources

`npc-017` rozszerzył zwykły NPC survival o durable provisions w `NpcAuthoritativeState.personalInventory`.

Aktualne mechanizmy obejmują:

- `personalFood` jako normalną strategię hunger,
- personal liquid container jako normalne źródło water,
- realne food freshness,
- realne waterskin instances i litres,
- bounded provision estimation,
- real household → `personalInventory` provisioning.

`src/ai/npcPersonalProvisions.ts` już posiada m.in. `countPersonalFood()`, `countPersonalDrinkPortions()`, `findDrinkablePersonalWaterContainer()` i provisioning helpers.

**Implication:** runtime expedition survival ma konsumować te mechanizmy zamiast je kopiować.

### `personalInventory` is the durable owner

`NpcAuthoritativeState.personalInventory` należy do konkretnej NPC identity i przeżywa:

- `NpcAgent` reconstruction,
- settlement stream-out/in,
- `WorldBundle` rebuild,
- save/load przez `SaveData.npcStates`.

`NpcAgent.carried` pozostaje transient work/logistics cargo.

Ownership pozostaje:

```text
personal food / drink / medicine / weapons / tools
→ personalInventory

temporary task/logistics cargo
→ carried
```

Expedition provisions nie mogą tworzyć trzeciego ownera.

### Player → NPC transfer already has the correct ownership contract

`items-player-027` definiuje general-purpose ownership transfer:

```text
Player Inventory
→ NPC personalInventory
→ normal NPC decisions/actions determine use
```

Towarzyszenie nie zmienia tych semantics.

### Player storage is a permission layer, not an AI source of intent

`items-player-028` rozdziela:

```text
item ownership
!= storage access permission
!= NPC reason to use item
!= transfer
!= consumption
```

Storage policy może pozwolić na food/water/medicine i egzekwować reserve, ale nie generuje hunger/healing pressure.

Ten plan jest consumerem tego mechanizmu; nie kopiuje policy do NPC state.

### Fatigue/rest already exist

Aktualny `NpcAgent` posiada:

- stamina drain podczas ruchu i pracy,
- `exhausted` phase,
- recovery do istniejącego resume ratio,
- vigor drain/recovery,
- vigor-collapse sleep,
- scheduled sleep,
- Endurance-dependent recovery.

Nie potrzeba expedition fatigue meter.

### Injury/healing already belong to normal NPC autonomy

`physicalInjury` jest persistent authoritative state. Istnieje już:

```text
physicalInjury
→ derived injury severity
→ healing pressure
→ npcDecision arbitration
→ heal action
```

Natural injury recovery korzysta z elapsed world time i nie należy do render lifecycle.

### Current healing ownership is inconsistent with durable personal belongings

Aktualne healing pressure i `beginHeal()` szukają treatmentu w transient `NpcAgent.carried`, podczas gdy durable personal belongings i player-given medicine należą do `personalInventory`.

Obecny problem:

```text
player gives NPC bandage
→ bandage enters personalInventory
→ normal healing path does not see it
```

To jest ogólna luka zwykłego NPC healing i powinna zostać naprawiona w shared healing path, nie przez companion-only branch.

### Accompany already owns interruption/resumption and return handoff

`npc-029` definiuje source-neutral persistent accompany commitment.

Commitment:

- nie jest `NeedId`,
- nie jest `activePlan`,
- nie znika przy zwykłym survival interruption,
- jest wykonywany jako low-priority/idle-tier duty,
- powinien zostać ponownie znaleziony po zwykłej re-arbitracji,
- oddaje NPC do generic return/travel po zakończeniu.

Ten plan nie implementuje drugiego pause/resume lifecycle ani `CompanionReturnHome`.

### Off-screen travel foundation remains a dependency boundary

Authoritative NPC needs/injury/inventory przeżywają reconstruction, ale normalny decision/action loop działa na live `NpcAgent`.

`settlements-npcs-019` i `npc-029` mają dostarczyć generic detailed ↔ off-screen travel continuity z invariantem:

```text
detailed execution
XOR
off-screen execution
```

Jeżeli finalny shared travel contract nie potrafi uwzględnić potrzeb NPC podczas nieobecności live agenta, należy rozszerzyć ten shared mechanism. `npc-032` nie może tworzyć `CompanionOffscreenSimulation`.

## Existing behaviour that should work naturally after `npc-029`

Poniższych zachowań nie implementować ponownie poza integracją/regression coverage.

### Hunger/thirst interruption

```text
follow
→ hunger/thirst pressure
→ ordinary need wins
→ ordinary resource action
→ relief
→ choose()
→ same accompany commitment is eligible again
```

### Personal provisions

Food i water znajdujące się już w `personalInventory` są zwykłymi NPC survival resources.

### Short fatigue recovery

Follow execution powinien podlegać tym samym physical movement costs co ordinary travel:

```text
movement
→ stamina exhaustion
→ existing exhausted recovery
→ resume movement
```

### Vigor collapse

Istniejący vigor-collapse response nadal wygrywa z accompany execution.

### Injury state and natural recovery

Injury, severity, impairment i lazy natural recovery pozostają zwykłym NPC state.

### Combat/flee interruption

Existing combat/flee behaviour może przerwać follow execution bez kasowania commitmentu.

Combat cooperation / protect-player pressure należy do osobnego późniejszego etapu Companions.

### Persistence of needs and personal belongings

Needs, stamina, vigor, injury i `personalInventory` już posiadają właściwy persistent owner.

### Resume commitment

Nie potrzeba persistent `survival_pause`. Zwykły survival action ma wygrać, zakończyć się i oddać NPC do normalnej re-arbitracji. Jeśli commitment nadal istnieje i nic pilniejszego nie wygrywa, accompany duty zostanie ponownie wykonane.

### Return to normal life

Po zakończeniu commitmentu generic return/travel + normal schedule należą do `npc-029` / shared travel infrastructure.

## Architectural decisions

### 1. `npc-032` is integration, not a second survival system

Centralny invariant:

```text
accompany commitment
+
ordinary NPC autonomy
```

nie:

```text
accompany commitment
→ companion survival mode
```

Nie dodawać nowych survival meters, companion pressure tables, companion-specific strategy list ani expedition scheduler.

### 2. Follow must participate in ordinary physical-cost semantics

`npc-029` może wymagać moving-target executor zamiast statycznego `NpcPlannedAction`, ale jego ruch nadal musi korzystać z tych samych physical costs co ordinary travel:

- walking stamina drain,
- Endurance-dependent recovery,
- exhaustion,
- vigor-collapse behaviour.

Nie dopuścić do sytuacji:

```text
ordinary goTo → fatigues NPC
followPlayer → free movement
```

Preferować shared movement/fatigue seam zamiast companion-specific drain.

### 3. Active travel commitment replaces local routine duties, not physiology

Aktywny accompany commitment jest tymczasowym commitmentem do podróży, więc nie powinien powodować prób wykonywania lokalnych obowiązków schedule oddalonych o kilometry.

Podczas active travel commitment:

- hunger/thirst/injury/exhaustion/sleep pozostają authoritative,
- ordinary local work/home/social/eat schedule destinations nie powinny odciągać NPC z wyprawy,
- po zakończeniu commitmentu i powrocie do normalnej locality zwykły effective schedule odzyskuje pełne authority.

Nie modyfikować schedule templates ani nie tworzyć companion schedule.

### 4. Away-from-home sleep/rest should reuse travel locality before adding new state

Scheduled sleep podczas dalekiej wyprawy nie może oznaczać automatycznie:

```text
22:00
→ walk back to home settlement
→ sleep
```

Najpierw spróbować rozszerzyć istniejący sleep/rest flow tak, aby przy active travel commitment rozwiązywał destination z current travel locality/context.

Preferowany kierunek:

```text
existing suitable local rest/shelter/place
→ current travel/stay anchor
→ safe current-locality fallback if current architecture supports it
```

Dopiero jeśli aktualny codebase nie ma żadnego neutralnego seam, wydzielić mały reusable travel-rest resolver.

Nie tworzyć `CompanionCamp`, fake household ani fake home przy graczu.

### 5. Durable self-healing must use durable personal treatment ownership

Naprawić shared NPC healing invariant:

```text
NPC-owned injury treatment
→ personalInventory
→ healing pressure sees it
→ healing action sees the same item
→ treatment consumes the same authoritative item
```

Pressure i execution nie mogą używać różnych inventory owners.

Jeżeli istniejący transient work flow rzeczywiście potrzebuje treatment w `carried`, może zostać zachowany jako jawne dodatkowe źródło po reconie, ale `carried` nie może być domyślnym ownerem personal medicine.

### 6. Self-treatment while travelling should be local when the item is already owned

Posiadanie suitable treatment podczas wyprawy nie powinno wymuszać wielokilometrowego powrotu do własnego domu tylko dlatego, że historyczny healing action używa home jako destination.

Dla self-treatmentu z itemem już w `personalInventory` preferować lokalny treatment/rest context:

```text
injury pressure
→ local stop/rest destination
→ normal heal action
→ consume personal treatment
→ re-arbitrate
```

Home pozostaje normalnym fallbackiem dla NPC w swojej zwykłej locality.

Nie dodawać hospital/doctor/companion healing location.

### 7. Player storage should plug into resource acquisition, not create companion strategy tables

Po `items-player-028` authorized/reachable player storage powinien być dostępnym **resource source** dla zwykłych survival actions.

Preferować rozszerzenie istniejącego resource-acquisition seam zamiast mnożenia companion-only strategii.

Przykład hunger:

```text
hunger wins
→ existing food acquisition evaluates normal sources
→ personal food unavailable
→ permitted/reachable player storage is an eligible source
→ authoritative policy/reserve revalidation
→ real transfer to personalInventory
→ ordinary personal-food consumption
```

Analogiczna zasada dotyczy water i injury treatment.

Storage permission:

- nie generuje pressure,
- nie zmienia thresholdów,
- nie gwarantuje zasobu,
- nie omija reserve,
- nie teleportuje resource,
- nie daje globalnej wiedzy o storage.

Planning może wykryć dostępność wcześniej, ale authoritative withdrawal musi ponownie sprawdzić policy, reserve, amount, destination capacity i item/instance state.

### 8. Provision estimation belongs to expedition preparation, not runtime survival

`npcPersonalProvisions.ts` ma wartościową bounded estimation logic, ale ten plan nie powinien przejmować odpowiedzialności za obliczanie całego expedition loadoutu.

Paid escort, voluntary expedition context i settlement expedition assignment mogą korzystać ze wspólnego source-neutral helpera, jeśli `npc-030` lub inny wcześniejszy plan go wyodrębni.

`npc-032` konsumuje realne provisions; nie tworzy `ExpeditionProvisionPlanner`.

Jeżeli implementacja wymaga drobnej ekstrakcji istniejącego helpera na neutralne `awayHours`, jest to dozwolony supporting refactor, ale nie główny feature tego planu.

### 9. Survival response and commitment viability are separate questions

Zwykły survival pressure odpowiada:

> co NPC powinien zrobić teraz?

Continuation evaluation odpowiada:

> czy po uwzględnieniu aktualnego stanu dalsze utrzymywanie tego travel commitmentu nadal ma sens?

Nie kończyć wyprawy dlatego, że pojawił się ordinary hunger/thirst/exhaustion response.

### 10. No persistent `survival_pause`

Temporary inability to follow is już reprezentowana przez normalny decision/action pipeline.

```text
need / injury / rest
→ ordinary action
→ commitment remains
→ later re-arbitration
```

Nie dodawać `pausedForSurvival`, `refusesToTravel` ani drugiego companion lifecycle.

### 11. Continuation evaluation should only decide whether the commitment remains viable

Dodać mały pure/inspectable evaluator dopiero na boundary wykonywania/re-wznawiania accompany duty.

Koncepcyjnie:

```ts
type AccompanyContinuationEvaluation =
  | { outcome: 'continue' }
  | { outcome: 'abandon'; reasons: AccompanyAbandonReason[] }
```

Exact type ma zostać dopasowany do finalnego `npc-029` lifecycle API.

Inputs powinny korzystać wyłącznie z istniejącego state/context, np.:

- current hunger/thirst severity,
- personal provisions,
- wykonalne istniejące resource-source candidates,
- permitted/reachable player storage,
- injury severity,
- available suitable treatment,
- stamina/vigor/collapse state,
- existing danger/flee context tylko jeśli finalny dependency contract udostępnia potrzebny sygnał.

Nie tworzyć:

- expedition morale,
- survival confidence,
- loyalty meter,
- route-wide resource simulation.

### 12. Abandonment is explicit, bounded and semantic

Genuine abandonment może wystąpić, gdy aktualne shared NPC mechanisms pokazują, że dalsza podróż jest niewykonalna lub nierozsądna, np. ciężki survival state bez wykonalnego sposobu rozwiązania albo poważny uraz bez wykonalnego recovery/treatment path.

Dokładne kryteria mają korzystać z istniejących critical/severity semantics; nie dodawać companion-specific threshold copies.

Nie abandonować wyłącznie przez:

- ordinary hunger,
- ordinary thirst,
- exhausted stamina,
- jedną noc,
- pojedynczy pathfinding failure,
- krótką separację,
- zwykły combat interruption.

Jeżeli rezultat to `abandon`:

```text
continuation evaluator
→ npc-029 ends accompany commitment with semantic reason
→ source-specific system observes/resolves its own consequence
→ generic return travel
```

Ten plan nie wylicza wages, nie modyfikuje relationship/reputation i nie implementuje contract cancellation economics.

### 13. Off-screen survival belongs to the generic travel execution owner

Nie implementować w `npc-032` osobnego off-screen engine.

Finalny generic off-screen travel owner z `settlements-npcs-019` / `npc-029` powinien mieć możliwość wykonywania neutralnego NPC travel-survival step albo wywoływać istniejące shared helpers.

Koncepcyjnie:

```text
off-screen travel interval
→ advance ordinary needs
→ apply coarse activity fatigue/rest semantics
→ resolve lazy injury recovery
→ consume physically owned/available survival resources where allowed
→ evaluate commitment viability
→ continue / rest / end commitment
```

Ten helper powinien być reusable dla innych long-distance NPC travel flows, w szczególności `settlements-npcs-028`, a nie sprawdzać `isCompanion`.

### 14. Same authoritative state in detailed and off-screen simulation

Off-screen simulation mutuje te same authoritative:

- `needs`,
- `stamina`,
- `vigor`,
- `physicalInjury`,
- `personalInventory`.

Nie tworzy off-screen copies.

Preferować deterministic bounded coarse stepping z istniejącymi rates/helpers zamiast jednego dużego skoku lub per-frame simulation unloaded NPC.

W każdym momencie dokładnie jeden execution owner:

```text
detailed NpcAgent
XOR
off-screen travel execution
```

Handoff nie może podwójnie naliczyć need drift, consumption, healing albo fatigue.

### 15. Off-screen resource access remains physically bounded

`personalInventory` jest zawsze prawidłowym durable source.

Player storage może zostać użyty off-screen tylko wtedy, gdy finalny travel/storage context potrafi stwierdzić, że dany storage jest rzeczywiście dostępny/reachable dla tego NPC. Withdrawal nadal przechodzi przez `items-player-028` authoritative policy/reserve transaction.

Nie dopuszczać:

```text
authorized somewhere in world
→ remotely consume from chest
```

Natural world resources off-screen mogą być użyte tylko przez istniejący/shared bounded contract. Nie dodawać globalnych food/water/pathfinding scans per coarse tick.

### 16. Prefer zero new persisted fields in `npc-032`

To jest ważny architecture check.

Istniejący authoritative state już persistuje:

- hunger/thirst needs,
- stamina,
- vigor,
- injury,
- temporary conditions,
- `personalInventory`.

Accompany persistence należy do `npc-029`.

Player-storage policy persistence należy do `items-player-028`.

Generic travel/off-screen progress należy do shared travel foundation.

Nie dodawać:

- `SaveCompanionNeeds`,
- expedition food/water counters,
- duplicated injury state,
- duplicated inventory snapshot,
- companion-only timestamps,
- duplicated current position.

Jeżeli off-screen travel rzeczywiście potrzebuje temporal checkpointu, należy on do generic travel execution contract, nie do companion survival state.

## Expected integration points

Implementation powinien zweryfikować finalne call-sites podczas preflight zamiast szerokiego refactoru.

### `src/ai/NpcAgent.ts`

Prawdopodobne integration points:

- detailed accompany fatigue semantics,
- active-travel schedule override boundary,
- away-from-home sleep/rest resolution,
- healing source/location correction,
- continuation check przed ponownym wykonaniem accompany duty,
- semantic abandonment handoff.

### `src/ai/Needs.ts`

Reuse istniejących meters/rates/critical thresholds. Nie dodawać nowego `NeedId`.

### `src/ai/npcDecision.ts`

Reuse istniejącego pressure/decision arbitration. Nie dodawać companion decision priority. Zmiana tylko jeśli finalny `npc-029` seam nie pozwala wykonać continuation check na idle-duty boundary.

### `src/ai/npcStrategies.ts`

Preferować rozszerzenie generalnego resource acquisition o permitted player-storage sources, nie companion-only strategy list.

### `src/ai/npcPersonalProvisions.ts`

Reuse personal food/water helpers. Ewentualna neutralizacja existing provision estimate jest supporting refactor only.

### `src/ai/healingPressure.ts` / existing healing action path

Treatment availability i execution muszą korzystać z tego samego durable personal-resource lookup.

### `src/settlement/npcState.ts`

Nie oczekuje się nowego survival state.

### Final `npc-029` accompany lifecycle API

Reuse:

- active commitment lookup,
- ordinary interruption/resume,
- semantic end reason,
- generic return handoff.

### Final `items-player-028` storage access API

Reuse:

- policy/grant lookup,
- structured access purpose,
- reserve-safe authoritative withdrawal,
- temporary expedition grant lifecycle.

Nie kopiować policy data do NPC state.

### Final `settlements-npcs-019` travel/off-screen API

Reuse:

- detailed ↔ off-screen handoff,
- exactly-one execution owner,
- elapsed travel context,
- reification.

Jeżeli finalne API różni się od założeń tego draftu, użyć zaimplementowanego shared contractu zamiast stabilizować assumptions tutaj.

## Dependencies and related plans

### `npc-029-npc-accompany-follow-commitment`

Hard dependency.

Owns accompany commitment, follow/stay, ordinary interruption/resume, separation/recovery, ending and generic return handoff.

### `settlements-npcs-019-persistent-and-off-screen-transport`

Transitive dependency przez `npc-029`, ale bezpośrednio istotny dla off-screen continuity. Jeśli jego finalny shared travel contract jest zbyt transport-specific dla ordinary travelling NPC, poprawić shared seam zamiast tworzyć companion-specific engine.

### `npc-017-work-contracts-food-and-drink`

Reuse implemented personal provisions i ordinary hunger/thirst strategy integration.

### `npc-025-injury-severity-and-treatment-requirements`

Reuse injury severity, impairment, treatment suitability i lazy natural recovery.

### `items-player-027-player-to-npc-item-transfer-and-equipment`

Relevant ownership contract:

```text
player gives provision/medicine
→ NPC personalInventory
→ ordinary NPC survival AI
```

### `items-player-028-npc-player-storage-access-policies`

Hard dependency dla shared-storage survival source. Policy pozostaje oddzielona od NPC decision.

### `npc-030-paid-expedition-escort-work-contracts`

Alignment, nie dependency. Paid Work Contract może przygotować provisions i stworzyć accompany commitment; runtime survival pozostaje source-neutral.

### `npc-031-voluntary-expedition-joining`

Alignment, nie dependency. Voluntary joining tworzy ten sam commitment; późniejsze survival behaviour jest identyczne.

### `settlements-npcs-027-npc-expedition-assignment-and-provisioning`

Alignment, nie dependency. Settlement-driven expedition provisioning również powinno kończyć się realnymi resources w personal inventory.

### `settlements-npcs-028-long-distance-npc-travel-and-expedition-movement`

Architectural alignment. Powinien docelowo korzystać z tego samego generic off-screen travel survival seam zamiast własnych expedition needs.

## Scope

- preserve normal hunger/thirst arbitration during accompany;
- ensure follow movement uses ordinary stamina/vigor semantics;
- suppress distant local-routine schedule destinations while travel commitment is active;
- resolve away-from-home sleep/rest through shared travel locality/context;
- make durable self-treatment use `personalInventory` consistently;
- allow local self-treatment during travel;
- expose authorized/reachable player storage as a normal survival resource source;
- evaluate whether an accompany commitment remains viable without persistent pause state;
- explicitly end an unviable commitment with a semantic survival reason;
- hand abandonment into the shared return/travel mechanism;
- integrate ordinary survival with generic off-screen travel execution;
- preserve one authoritative state across detailed/off-screen simulation;
- extend existing diagnostics/trace rather than creating companion-specific tooling.

## Non-goals

- `CompanionNeeds` or other companion survival state;
- new hunger/thirst/fatigue/injury meters;
- companion inventory or ration counters;
- companion schedule templates;
- party/group resource manager;
- party formations;
- combat cooperation / protect-player pressure;
- new flee/combat scoring;
- relationship consequences of abandonment;
- expedition memory/history;
- permanent companion relocation;
- player-storage permission UI itself;
- implementation of `items-player-028` policy model;
- paid escort reward/payment rules;
- voluntary-joining scoring;
- settlement expedition staffing;
- expedition loadout planner;
- global route planning;
- random off-screen encounters;
- teleport catch-up;
- global world-resource searches;
- new campsite/household system;
- LLM-driven behaviour.

## Implementation order

1. Verify implemented dependency chain and final public contracts: `settlements-npcs-019` → `npc-029`, plus `items-player-028`.
2. Normalize shared NPC healing ownership so durable personal treatment in `personalInventory` is visible to both pressure and execution.
3. Make self-treatment travel-safe by resolving a local treatment/rest destination while away from home.
4. Verify detailed accompany movement pays ordinary stamina/vigor costs and exhaustion/collapse already interrupt/resume correctly.
5. Add active-travel schedule boundary so distant local routine duties do not pull the NPC home/workplace mid-expedition.
6. Integrate player-storage resources into the existing general resource-acquisition path using `items-player-028` policy/revalidation.
7. Add the smallest pure continuation evaluator at the accompany idle-duty boundary; no persistent pause state.
8. Connect `abandon` to `npc-029` semantic end + generic return handoff.
9. Extend the generic off-screen travel owner with ordinary NPC survival stepping only if the final shared travel foundation does not already provide it.
10. Extend existing inspection/trace and add focused regression tests.

For important public/architectural helpers add focused JSDoc where it improves preflight discovery; use `@domain npc` where appropriate.

## Verification

### Automated — ordinary needs remain authoritative

Verify:

```text
follow
→ critical hunger/thirst
→ ordinary survival action
→ accompany commitment survives
→ need relieved
→ ordinary re-arbitration
→ same accompany duty resumes
```

NPC thresholds remain unchanged.

### Automated — personal provisions

Verify:

- personal food is consumed before an unnecessary distant trip;
- personal waterskin litres decrease through existing liquid-container semantics;
- empty provisions provide no relief;
- food freshness / liquid instance identity remain intact.

### Automated — durable transferred medicine

Verify:

```text
player gives NPC bandage
→ personalInventory
→ injury pressure sees it
→ normal heal action consumes the same item
```

No required copy through `carried`.

### Automated — player storage

After `items-player-028` verify:

- authorized NPC can use allowed food/water/medicine when ordinary pressure requires it;
- forbidden resource is ignored;
- minimum reserve is never crossed;
- `assigned_only` is not treated as generic personal-need permission;
- revoked temporary expedition grant prevents later access;
- planning availability is revalidated at authoritative mutation.

### Automated — fatigue/rest

Verify:

- detailed follow incurs ordinary movement fatigue;
- exhaustion pauses movement and restores stamina;
- recovery resumes the same commitment;
- vigor collapse remains authoritative;
- scheduled sleep while away does not trigger a long walk back to home solely because the clock changed;
- waking allows normal re-arbitration and follow resume.

### Automated — schedule boundary

Verify an accompanying NPC does not leave a distant expedition solely because its settlement schedule enters `work`, `home`, `eat` or `social`, while physiological/sleep survival behaviour still functions.

After return to normal locality, ordinary schedule behaviour resumes unchanged.

### Automated — healing

Verify:

- healing pressure and execution resolve treatment from the same durable owner;
- serious/critical injury follows existing `npc-025` semantics;
- locally owned treatment does not require walking back to the home settlement;
- natural recovery remains unchanged.

### Automated — continuation / abandonment

Verify ordinary hunger, thirst, exhausted stamina, sleep, one path failure, short separation and temporary combat interruption do not by themselves abandon the expedition.

Verify a bounded state with no viable normal survival path can explicitly end the accompany commitment with an inspectable reason.

Ending is idempotent.

### Automated — return

Verify:

```text
survival abandonment
→ end accompany commitment
→ generic return travel
```

Ordinary needs/injury/rest can still interrupt return. After reaching normal locality, ordinary schedule regains authority without companion-specific home state.

### Automated — off-screen continuity

Using the final shared travel foundation, verify:

- needs continue consistently during off-screen travel;
- personal food/water consumption uses the same `personalInventory`;
- injury recovery remains elapsed-time based;
- detailed → off-screen handoff does not double-tick survival;
- off-screen → detailed does not reset needs/items;
- repeated save/load/reification does not duplicate consumption or healing;
- exactly one execution owner advances the travelling NPC.

### Automated — persistence

Prefer zero new `npc-032` persisted fields.

Verify existing authoritative state survives save/load during:

- ordinary accompaniment,
- hunger/thirst interruption,
- away rest,
- injury/healing,
- return after abandonment.

### Automated — regressions

NPC without active travel/accompany commitment retains unchanged:

- schedules,
- hunger/thirst,
- Work Contracts,
- healing,
- profession work,
- combat/flee,
- household/economy resource acquisition.

Existing `npc-017` remote-work provisioning remains functional after any small shared-helper extraction.

### Manual browser verification — User

AI does not perform browser verification.

User should verify at least:

1. Accompanying NPC becomes hungry/thirsty during a long journey, uses real owned supplies and later resumes follow.
2. NPC can use permitted player storage while respecting reserve; no permission means no withdrawal.
3. Long follow movement causes ordinary fatigue/exhaustion rather than free movement.
4. Night/rest while away does not make the NPC walk kilometres home just because its schedule reached sleep.
5. Local settlement work/home/social schedule does not pull an accompanying NPC out of the expedition.
6. A wounded NPC can use a personally owned bandage while travelling.
7. Ordinary survival interruptions do not end the expedition.
8. A genuinely non-viable expedition can be explicitly abandoned for an inspectable reason.
9. After abandonment the NPC sensibly returns toward normal life.
10. Stream-out/in and save/load do not reset needs, injury, provisions or duplicate consumption.
11. Ordinary NPCs without an accompany commitment behave as before.

## Completion criteria

The plan is complete when an active accompany commitment does not create a special survival agent:

```text
normal NPC state
+
temporary accompany commitment
        ↓
ordinary needs / fatigue / injury
        ↓
ordinary resource acquisition
+ personalInventory
+ permitted player storage
        ↓
ordinary survival interruption
        ↓
normal re-arbitration
        ↓
continue if commitment remains viable
OR
explicitly end commitment if no longer viable
        ↓
generic return
        ↓
ordinary NPC life
```

The same authoritative state remains coherent across detailed and off-screen travel without `CompanionNeeds`, duplicated inventory/injury state or a parallel survival/travel engine.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
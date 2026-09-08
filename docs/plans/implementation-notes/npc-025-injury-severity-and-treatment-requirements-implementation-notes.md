# Implementation Notes: npc-025 — Injury severity and treatment requirements

**Reviewed:** 2026-09-08  
**Source:** current `main` codebase + `docs/STATE.md` + `docs/plans/PLANNING.md` + `npc-025-injury-severity-and-treatment-requirements.md` + current NPC healing/SPEA/persistence/observation implementations

## Najważniejsze ustalenia

- `npc-002` jest już realnie wdrożony: `physicalInjury` żyje w `NpcAuthoritativeState`, round-tripuje przez `NpcStateSnapshot`/`SaveData.npcStates`, damage accounting używa `increaseInjuryFromDamage()`, a self-healing idzie przez istniejące `healingPressure()` → `NpcDecisionTarget = 'heal'` → `NpcPlannedAction` → `NpcAgent.beginHeal()`.
- `npc-019` jest wdrożony, ale bazowe `PhysicalAttributes` nadal celowo nie znają injuries/conditions.
- `npc-024` **nie jest jeszcze wdrożony**. Na HEAD nie ma wspólnego effective-SPEA seamu ani osobnego catalogowego treatment contractu. `npc-025` powinien korzystać z API dostarczonego przez 024, nie implementować drugiej równoległej warstwy. Jeśli 025 rusza przed zakończeniem 024, to jest realny blocker dla części SPEA/treatment.

## Severity i injury accounting

Najlepiej wydzielić mały pure resolver dla:

- `InjurySeverity = 'none' | 'minor' | 'serious' | 'critical'`,
- `resolveInjurySeverity(physicalInjury, maxHp)`,
- severity → injury SPEA modifiers,
- recovery policy/bounds.

Nie wkładać tego do `HealthState`: `src/shared/HealthState.ts` pozostaje combat/AI-agnostic. `physicalInjury` nadal jest jedynym autorytatywnym wound amount.

Nie używać obecnego `healingPressure.ts::MIN_SEVERITY = 0.05` jako severity threshold. To jest historyczny cutoff uwagi z `npc-002`, nie model severity. Po 025 `healingPressure()` powinien korzystać z jednego centralnego resolvera severity/feasibility zamiast utrzymywać drugi niezależny podział urazu.

`healHealth()` zwraca `void`, więc zachować obecny poprawny wzorzec:

```text
hpBefore
→ healHealth(health, requested)
→ actualRestored = health.currentHp - hpBefore
→ decreaseInjuryFromHeal(physicalInjury, actualRestored)
```

Nie zmniejszać `physicalInjury` nominalnym recovery/treatment amount.

## Natural recovery: ważna korekta do planu

Obecny runtime nie ma mechanizmu, który automatycznie zapewni recovery dla unloaded NPC:

- `NpcAgent.update()` istnieje tylko dla załadowanych agentów,
- `SettlementsManager.resolveTimeSkip()` iteruje tylko `entry.settlement?.npcs`, więc pomija settlementy aktualnie niezaładowane,
- `NpcStateRegistry` przechowuje authoritative state, ale sam niczego nie tickuje.

Dlatego natural recovery nie może żyć wyłącznie w `NpcAgent.update()` ani w `resolveTimeSkip()`.

Preferowany kierunek: lazy elapsed-game-time resolution z anchor-em przy injury state, np. optional `injuryRecoveryUpdatedAtDays` (nazwa dowolna) w `NpcAuthoritativeState`/`NpcStateSnapshot`. Przy odczycie/mutacji wymagającej aktualnego injury najpierw rozliczyć elapsed days, zaktualizować HP przez `healHealth()` i dopiero potem `physicalInjury`.

Anchor powinien round-tripować razem z `physicalInjury`; starszy snapshot może domyślnie inicjalizować go do bieżącego world time przy pierwszym resolution. To oznacza małe rozszerzenie save shape/validatora, mimo że sama severity pozostaje derived i nie jest zapisywana.

Nie robić globalnego skanu `NpcStateRegistry` co frame. Lazy resolution lepiej pasuje do istniejącego streamed/hybrid modelu.

## Critical recovery boundary

Boundary „critical nie może naturalnie przejść do serious” implementować jako clamp naturalnego recovery do dokładnego progu severity. Nie dodawać persisted `stabilized` ani condition.

Ważne: clamp musi działać na **physicalInjury amount**, a HP recovery musi być ograniczone do takiej samej rzeczywistej wartości, żeby nie powstało `HP restored > injury reduced`.

Treatment może przekroczyć tę granicę, natural recovery nie.

## Effective SPEA

Po `npc-024` injury modifier powinien wejść w ten sam shared effective-attribute composition seam co temporary conditions:

```text
base attributes
→ istniejący human profile resolution
→ injury modifiers
→ temporary-condition modifiers
→ effective attributes
```

Nie mutować `PhysicalProfile.attributes` ani `PhysicalAttributes`.

Nie dodawać injury branches do melee/work/carry/stamina. Migracja consumers do effective SPEA należy wykorzystać to, co faktycznie dostarczy 024.

Szczególnie uważać na Endurance: obecny `StaminaState.max` jest wyprowadzany przy create/restore (`applyDerivedStaminaMax`) i nie przelicza się sam po dynamicznej zmianie Endurance. Nie aktualizować stamina max w wielu call sites. Jeżeli 024 wprowadzi jeden jawny sync mechanism, 025 ma go użyć; jeśli nie, nie rozszerzać 025 o drugi mechanizm.

## Treatment capability

Obecnie NPC healing używa `Inventory.findConsumableForNeed('health')`; po 025 to jest za szerokie.

Po `npc-024` wybór leczenia injury ma korzystać z jego osobnego catalogowego treatment contractu. Nie traktować każdego `consumable.need === 'health'` jako medicine dla physical injury.

Potrzebne są dwa osobne pytania:

```text
czy inventory ma treatment odpowiedni dla aktualnej severity?
który treatment jest najlepszy/wykonalny dla aktualnej severity?
```

Warto wystawić katalogowy/helperowy lookup analogiczny do obecnych `CONSUMABLE_KINDS_BY_NEED` / `Inventory.findConsumableForNeed`, zamiast skanować i interpretować `ITEM_CATALOG` osobno w pressure i execution.

Ten sam suitability resolver ma być użyty:

- przy liczeniu healing feasibility/pressure,
- przy wyborze itemu do `heal` action,
- ponownie przy execution revalidation.

Nie dopuszczać sytuacji, gdzie pressure widzi „jakikolwiek health consumable”, ale `beginHeal()` później odkrywa, że nie może on leczyć aktualnej severity.

## Existing healing decision flow

Zachować obecną architekturę:

```text
healingPressure
→ ten sam pickActionKind<NpcDecisionTarget>
→ npcDecision
→ 'heal'
→ beginHeal()
→ generic goTo / execute
```

Nie dodawać nowych pressure types per severity.

Po 025 `healingPressure()` powinien przyjmować już rozstrzygniętą feasibility/suitability, nie prosty `hasHealthConsumable`. Severity może modyfikować score, ale collapse nadal wygrywa przez istniejący `npcDecision.ts` precedence.

Nie wpinać healing w `tickCriticalInterrupt` tylko dlatego, że severity jest `critical`. Aktualny `npc-002` celowo nie przerywa akcji w locie ani combat; plan 025 również nie wymaga zmiany tej granicy.

Jeżeli nie ma odpowiedniego treatmentu, nie twórz wykonalnego `heal` action tylko po to, aby reprezentować passive recovery. Natural recovery ma działać niezależnie; w przeciwnym razie powstanie retry loop bez realnego efektu.

## `NpcAgent.beginHeal()`

Obecne wykonanie jest self-contained i to może pozostać. Zmienić tylko policy wyboru/revalidation:

- derive current severity po wcześniejszym lazy recovery resolution,
- znajdź treatment odpowiedni dla tej severity,
- sprawdź item ponownie tuż przed consume,
- consume dopiero po pełnym przejściu preconditions,
- immediate treatment: HP + `physicalInjury` przez actual-restored accounting,
- recovery-support treatment: osobny jawny bounded effect; nie udawać heal HP.

Jeżeli selected treatment może być inny niż „najlepszy health consumable”, selection logic nie może być powielona między pressure i execution.

## Persistence

Severity, SPEA modifiers, healing score i treatment eligibility pozostają derived i nie trafiają do save.

`physicalInjury` już jest persisted. Dla prawdziwego off-screen natural recovery potrzebny jest jednak recovery time anchor, bo obecny registry nie ma innego sposobu policzenia czasu spędzonego poza aktywnym `NpcAgent`.

Rozszerzyć `NpcStateSnapshot` opcjonalnie i zachować backward compatibility w `src/persistence/saveData.ts::isNpcStateSnapshot`. Nie rekonstruować injury z HP deficit przy brakującym polu.

## Observation/debug

`npc-023` jest już wdrożony: normalna prezentacja ma przechodzić przez istniejący `ObservationLevel` / stable observation flow w `src/simulation/observation.ts` i `NpcAgent`, a nie tworzyć drugiego systemu ujawniania danych.

Exact `physicalInjury`, derived severity i injury modifiers tylko w debug/full-label path. Qualitative text powinien być wyprowadzany z tego samego `InjurySeverity`, nie z osobnych progów UI.

Debug apply/clear injury powinien używać normalnego physical-damage/heal accounting helpera; nie ustawiać niezależnie HP i injury w dwóch arbitralnych miejscach.

## Pliki i istniejące seamy do wykorzystania

- `src/settlement/npcState.ts` — authoritative injury + persistence snapshot; tu ewentualny recovery anchor.
- `src/shared/HealthState.ts` — `healHealth()`/HP clamp, bez injury policy.
- `src/ai/healingPressure.ts` — istniejący injury accounting + healing pressure; rozszerzyć, nie tworzyć drugiego scoringu.
- `src/ai/npcDecision.ts` — istniejące precedence, bez nowej severity priority table.
- `src/ai/NpcAgent.ts` — physical damage bookkeeping, healing action glue i observation/debug integration.
- `src/items/itemCatalog.ts` / `src/items/Inventory.ts` — treatment lookup po kontrakcie z npc-024.
- `src/shared/PhysicalAttributes.ts` + profile/effective resolvers dostarczone przez npc-024 — injury modifiers jako kolejny składnik, nie mutacja base SPEA.
- `src/simulation/observation.ts` — npc-023 observation boundary.
- `src/persistence/saveData.ts` — snapshot validation przy dodaniu recovery anchor.

## Pułapki/testy szczególnie ważne

- unloaded settlement przez dłuższy world time → injury rozlicza dokładnie ten sam elapsed recovery po ponownym loadzie,
- save/load nie resetuje ani nie podwaja recovery interval,
- repeated severity/effective-SPEA reads są idempotentne,
- critical passive recovery zatrzymuje się dokładnie na serious boundary także przy dużym time skip,
- HP i `physicalInjury` pozostają zsynchronizowane przy boundary clamp i over-heal,
- unsuitable generic health consumable nie daje healing pressure i nie jest zużywany,
- suitability użyta w pressure i execution nie rozjeżdża się,
- injury modifier + condition modifier z 024 składają się bez mutowania bazowych attributes,
- `StaminaState.current <= max` pozostaje prawdą, jeśli effective Endurance wpływa na max,
- combat hit tylko zwiększa injury; severity nie uruchamia natychmiastowego leczenia ani retreat.

## Sugerowana kolejność implementacji

1. Po zakończeniu npc-024: pure severity + recovery helpers/tests.
2. Lazy recovery anchor + authoritative-state/persistence wiring.
3. Injury modifier w effective-SPEA composition.
4. Treatment suitability lookup + przebudowa `healingPressure()` feasibility.
5. `beginHeal()` execution/revalidation.
6. Observation/debug hooks i regresyjne testy integracyjne.

Nie rozszerzać tego planu o assisted Medicine, wound types, combat retreat ani nowy medical manager.
# Implementation Notes: NPC Healing

**Reviewed:** 2026-09-06  
**Plan:** `npc-002-npc-healing.md`  
**Status:** `implementation notes`  
**Source of truth:** current code on `main` + tests/build configuration.

## 1. Recon verdict

Plan pozostaje architektonicznie poprawny, ale wcześniejsze notes z 2026-08-21 zestarzały się po serii `ai-*` oraz refactorze `NpcAgent` z 2026-09-04.

Najważniejsza korekta: healing nie powinien być dokładany bezpośrednio jako kolejny branch starego `NpcAgent.choose()`. Obecny codebase posiada już jawne warstwy pressures, top-level decision arbitration, strategies/plans oraz generic action lifecycle.

Aktualny przepływ, który należy rozszerzyć:

```text
NPC state
→ generate pressures
→ top-level decision arbitration
→ optional Goal/Plan/Strategy
→ NpcPlannedAction
→ goTo / execute
→ world-state effect
```

Healing V1 pasuje jako **injury state → pressure → decision → pojedynczy action**. Nie wymaga osobnego systemu ani obowiązkowego persistent Goal/Plan.

## 2. Aktualni ownerzy

### `src/shared/HealthState.ts`

Wspólny owner HP dla player/NPC/fauna:

```ts
type HealthState = {
  maxHp: number
  currentHp: number
  dead: boolean
}
```

Dostarcza `damageHealth()`, `healHealth()` i `isAlive()`.

`HealthState` jest combat/AI-agnostic i powinien taki pozostać. Nie wkładać tu NPC-specific injury policy, treatment selection ani inventory.

### `src/ai/Needs.ts`

Wbrew poprzednim notes, istnieje już jawny pressure seam:

```text
NpcPressure
generateNeedPressures()
pickFromPressures()
pickNeed()
```

`NpcPressure` ma `source`, `target`, `value`, a need arbitration korzysta z istniejącego `pickActionKind`.

Nie dodawać `health` do `NeedId`. Injury jest stanem zdrowotnym/problemem, nie hunger/thirst/duty meter.

### `src/ai/npcDecision.ts`

To aktualny owner top-level wyboru zachowania. `NpcDecisionKind` obejmuje obecnie:

```text
collapseSleep
seekShelter
need
scheduledSleep
idle
```

`decideNpcAction()` i `scoreNpcDecisions()` współdzielą jedną definicję valid candidates i priorytetów. Healing powinien wejść tutaj jako jawny outcome/candidate zamiast być ukrytym if-em w `NpcAgent`.

`shouldInterruptAction()` ma osobną semantykę dla in-flight interruption. Nie rozszerzać go automatycznie o healing tylko dlatego, że healing ma wysoki pressure. W szczególności nie używać go do przerywania aktywnego combat.

### `src/ai/npcAction.ts`

`NpcPlannedAction` nadal jest prawidłowym execution seamem. Aktualny FSM używa generic:

```text
choose → goTo → execute
```

Dodać `heal` do `ActionId`; nie dodawać osobnych faz healing.

### `src/ai/npcPlan.ts`

Po `ai-004` istnieje persistent intent:

```text
NeedId → NpcGoalId → NpcPlan → NpcStrategyId → concrete action
```

Aktualne goals to:

```text
secureFood
secureWater
obtainWood
fulfilWorkDuty
```

Healing V1 nie powinien rozszerzać tego modelu mechanicznie. Injury response jest na razie krótkim, pojedynczym treatment pursuit. Jeżeli implementacja ujawni realną potrzebę resume/multi-step treatment, wtedy rozszerzyć istniejący Goal/Plan model zamiast tworzyć `HealingPlan`.

### `src/items/itemCatalog.ts`

Katalog jest źródłem prawdy dla consumables:

```ts
consumable?: {
  need: 'hunger' | 'thirst' | 'health'
  relief: number
  resultKind?: ItemKind
}
```

Codebase posiada już więcej niż jeden health consumable. AI musi wyszukiwać po contract `need === 'health'`, nie po `bandage`.

### `NpcAgent`

Po refactorze nadal jest koordynatorem runtime NPC i pozostaje właściwym ownerem per-agent injury state oraz cienkiego glue do decyzji/actions. Nie należy cofać refactoru przez ponowne umieszczanie w nim scoringu, consumable policy i rozbudowanych action builders, jeżeli mogą być małymi pure/domain helpers.

## 3. Damage recon

NPC physical damage nadal przechodzi przez istniejący combat pipeline, m.in. `NpcAgent.applyIncomingCombatDamage()` / defense resolution / accepted final damage.

Healing nie może uruchamiać się bezpośrednio z damage entry point.

Damage path powinien jedynie zapisać konsekwencję:

```text
accepted physical final damage
→ HealthState HP loss
→ outstanding healable physical injury increases
```

Następnie normalny decision tick decyduje, czy i kiedy się leczyć.

NPC starvation/dehydration HP damage nadal nie jest obecnym wymaganiem tego planu. Nie dodawać go w `npc-002`. Przyszłe non-physical damage musi jawnie nie zwiększać healable injury.

## 4. Minimalny injury state V1

Potrzebny jest najmniejszy stan odpowiadający na pytanie:

> Ile aktualnego ubytku zdrowia pochodzi z uleczalnego physical injury?

Akceptowalny kierunek:

```ts
physicalInjury: number
```

Owner: per NPC, nie globalny manager.

Inwarianty:

```text
physicalInjury >= 0
physicalInjury <= maxHp - currentHp
physicalInjury == 0 → brak healing pressure
```

Po accepted physical damage zwiększyć go o faktyczny final HP loss. Po treatment zmniejszyć o **actual restored HP**, nie nominalne `relief`.

Nie używać `currentHp < maxHp` jako fallbacku. To zniszczyłoby rozróżnienie physical injury vs przyszłe deprivation/disease damage.

Nie budować jeszcze `conditions[]`, `injuries[]`, severity/effects/duration ani persistence, chyba że finalny recon przed implementacją wykaże istniejący kontrakt, który trzeba zachować. V1 ma być łatwo migrowalny do przyszłego condition modelu.

## 5. Pressure + decision integration

Poprzednie notes sugerowały osobny krok w `NpcAgent.choose()` po `pickNeed()`. To jest już nieaktualne.

Implementacja powinna:

1. policzyć pure healing pressure/candidate na podstawie injury severity/HP oraz dostępności health consumable;
2. wprowadzić healing do aktualnego top-level arbitration seam;
3. zachować jedną jawną definicję precedence w `npcDecision.ts`;
4. nie duplikować scoringu w `NpcAgent`.

Nie musi to oznaczać wciskania injury do `generateNeedPressures()`: ten helper jest ownerem **need-driven pressures**. Lepiej zachować semantyczną granicę i połączyć injury pressure z pozostałymi kandydatami na poziomie istniejącego decision arbitration.

Wymagane zachowanie:

```text
collapse / istniejące critical survival semantics
    → nie mogą przypadkiem stracić priorytetu

serious healable injury + medicine
    → healing wygrywa z ordinary schedule/work/idle

minor injury
    → może nie przerywać normalnego życia

injury bez medicine
    → brak wykonalnego healing candidate
```

Nie tworzyć `PressureManager`, `NpcDecisionManager` ani osobnego healing priority table poza istniejącym decision modelem.

## 6. Consumable execution

NPC nie powinien korzystać z playerowego `createSurvivalActions()` ani tworzyć fake `PlayerActionContext`.

Przy wyborze medicine:

```text
NpcAgent Inventory
→ ITEM_CATALOG[kind].consumable
→ need === 'health'
```

Przy `execute` trzeba ponownie sprawdzić:

1. NPC żyje;
2. `physicalInjury > 0`;
3. HP rzeczywiście może wzrosnąć;
4. wybrany item nadal jest w inventory;
5. jego aktualny catalog entry nadal jest health consumable.

Dopiero wtedy:

```text
remove exactly 1
→ healHealth(health, relief)
→ actualRestored = hpAfter - hpBefore
→ physicalInjury -= actualRestored
```

Jeżeli precondition nie przejdzie, item nie może zostać zużyty.

Jeżeli warto wydzielić wspólny player/NPC helper, powinien być domain-neutral i obejmować tylko katalog + inventory + consumable effect. Player UI/toasts/freshness policy pozostają po stronie player actions.

## 7. Action i treatment destination

Dodać:

```ts
ActionId = ... | 'heal'
```

Healing jest normalnym `NpcPlannedAction`:

```text
select destination
→ goTo
→ execute for treatment duration
→ revalidate + consume + heal
→ choose
```

Nie przechowywać w action `Object3D` ani nie tworzyć specjalnego movement path.

V1 preferuje istniejący home NPC jako destination. Nie tworzyć hospital/doctor/medical station/`HealingLocation`/`SafePlaceManager`.

Brak poprawnego destination powinien zakończyć próbę bezpiecznie; nie teleportować NPC.

Treatment duration ma być simulation duration, niezależny od render animation, aby zachowanie pozostało kompatybilne z przyszłą off-screen/hybrid simulation.

## 8. Combat semantics

Wymagany przepływ:

```text
combat hit
→ accepted physical injury
→ combat trwa
→ combat kończy się normalnie
→ choose
→ healing może wygrać
```

Nie robić:

```text
applyIncomingCombatDamage()
→ beginHealing()
```

Healing nie powinien automatycznie przerywać `combat` ani wykorzystywać critical interrupt path jako skrótu.

Jeżeli później powstanie mechanika retreat-to-treat podczas walki, będzie to osobna decyzja combat strategy, nie część V1.

## 9. Interakcja z Plans/strategies i przerwanymi actions

Refactor `NpcAgent` ujednolicił cancellation/cleanup in-flight actions i naprawił przypadki pozostawiania błędnego active Plan.

Healing nie powinien obchodzić tego mechanizmu. Jeżeli healing może przerwać zwykłe `goTo/execute`, użyć istniejącego interruption/reset seam i poprawnie oznaczyć aktywny Plan jako interrupted zgodnie z aktualnymi regułami.

Po zakończeniu healing nie wznawiać starej concrete action automatycznie. NPC wraca do `choose`; istniejący Plan może zostać wznowiony lub uznany za nieaktualny przez obecny lifecycle.

To zachowuje trwały intent bez ręcznego odtwarzania starego action closure.

## 10. Persistence

Obecny plan nie wymaga pełnego persisted injury modelu. Przed implementacją trzeba jednak sprawdzić aktualny `NpcAuthoritativeState`/save path i świadomie zdecydować, czy V1 `physicalInjury` jest runtime-only czy musi round-tripować.

Zasada:
- nie dodawać persistence mechanicznie, jeżeli obecny NPC health sam nie jest persisted w wymagany sposób;
- jeżeli injury wpływa na zachowanie po save/load w istniejącym authoritative state, rozszerzyć ten sam owner zamiast tworzyć osobny healing save record.

Decyzję zapisać w implementation result.

## 11. Konkretne touch points

Przed kodowaniem potwierdzić finalne sygnatury na HEAD. Oczekiwane pliki:

```text
src/shared/HealthState.ts
  reuse only; raczej bez zmian

src/ai/Needs.ts
  reuse NpcPressure semantics; nie dodawać health NeedId

src/ai/npcDecision.ts
  healing decision candidate/outcome + precedence + tests

src/ai/npcAction.ts
  ActionId 'heal'

src/ai/NpcAgent.ts
  per-agent injury state
  accepted physical damage bookkeeping
  thin decision/action wiring

src/items/itemCatalog.ts
src/items/Inventory.ts
  reuse contracts; bez hardcoded bandage

opcjonalny mały domain-neutral consumable/healing helper
  tylko jeśli usuwa realną player/NPC duplikację
```

Nie zakładać nowych plików, jeżeli istniejący owner wystarcza.

## 12. Testy

Minimum:

### Injury accounting
- accepted physical damage zwiększa injury o actual HP loss;
- injury nigdy nie przekracza HP deficit;
- heal zmniejsza injury o actual restored HP;
- over-heal poprawnie clampuje accounting;
- dead NPC nie jest leczony.

### Decision
- brak injury → brak healing candidate;
- injury bez health consumable → brak wykonalnego healing;
- serious injury + medicine → healing wygrywa z schedule/idle;
- istniejące wyższe survival/collapse semantics pozostają niezmienione;
- healing nie staje się `NeedId`.

### Action
- `heal` używa generic `goTo → execute`;
- item jest rewalidowany przed consume;
- item usunięty przed treatment nie zostaje magicznie użyty;
- medicine nie jest zużywane po śmierci NPC;
- po completion wracamy do normalnego decision flow.

### Combat
- hit zapisuje injury, ale nie uruchamia heal action;
- aktywny combat nie jest przerywany samym healing pressure;
- po combat normalny decision może wybrać healing.

## 13. Verification

Agent implementujący:

- uruchamia testy/typecheck/lint/build wymagane przez `CLAUDE.md`;
- nie uruchamia browser verification;
- nie uruchamia ręcznie `pnpm docs:sync`, jeżeli repo workflow wykonuje synchronizację automatycznie;
- unika niepowiązanych refaktorów.

Użytkownik wykonuje manualną weryfikację w przeglądarce, szczególnie:

```text
NPC wounded in combat
→ survives
→ combat ends
→ goes home / treatment destination
→ consumes carried health item
→ HP increases
→ returns to autonomous life
```

## 14. Najważniejsze zakazy

Nie tworzyć:

```text
NpcHealingSystem
HealingManager
InjuryManager
ConditionManager
HealingLocation
medical inventory
healing FSM
health NeedId
combat auto-heal callback
```

Nie hardcodować `bandage`.

Nie opierać decyzji na samym `currentHp < maxHp`.

Nie cofać granic odpowiedzialności wprowadzonych przez refactor `NpcAgent`.

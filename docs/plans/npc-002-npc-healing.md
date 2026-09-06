# Plan: NPC Healing

**Created:** 2026-08-21  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~177~~  
**Domain:** `npc`  
**Type:** `feature`  
**Roadmap:** -  

## Cel

Dodać NPC możliwość reagowania na **uleczalne obrażenia** przez istniejący pipeline:

```text
health state → pressure → decision → action → inventory/consumable → world state
```

Healing ma być częścią normalnej autonomii NPC, nie osobnym systemem ani rozszerzeniem combat FSM.

NPC powinien:
- rozróżniać uleczalne obrażenie od samego ubytku HP,
- generować pressure wynikające z obrażenia,
- konkurować tym pressure z istniejącymi potrzebami i innymi priorytetami,
- używać dowolnego posiadanego consumable z `consumable.need === 'health'`,
- fizycznie udać się do miejsca leczenia i wykonać normalną akcję,
- po leczeniu wrócić do normalnego decision flow.

Nie tworzyć osobnego `NpcHealingSystem`, `HealingManager` ani równoległego systemu priorytetów.

## Aktualna architektura, którą należy rozszerzyć

Po refactorze NPC AI aktualnymi seamami są:

- `src/shared/HealthState.ts` — wspólny HP/damage/heal/death state;
- `src/ai/Needs.ts` — `NpcPressure`, `generateNeedPressures()` i istniejący pressure arbitration;
- `src/ai/npcDecision.ts` — top-level decision arbitration i priorytety;
- `src/ai/npcAction.ts` — `ActionId` i `NpcPlannedAction` dla `goTo → execute`;
- `src/ai/npcPlan.ts` — persistent Goals/Plans dla istniejących need-driven pursuits;
- `src/items/itemCatalog.ts` — autorytatywny contract consumables;
- `NpcAgent` — koordynacja stanu NPC, accepted damage i uruchamianie wybranych działań.

Healing powinien rozszerzać te mechanizmy, a nie odtwarzać logikę starego monolitycznego `NpcAgent.choose()`.

## Kluczowa zasada: niskie HP ≠ potrzeba leczenia

Nie wolno wyprowadzać decyzji healing wyłącznie z:

```text
currentHp < maxHp
```

Docelowo ubytek HP może mieć różne przyczyny:

```text
physical injury → leczenie może pomóc
starvation      → potrzebne jedzenie
dehydration     → potrzebne picie
```

Obecny codebase nie implementuje jeszcze NPC starvation/dehydration HP damage. To wymaganie jest więc przede wszystkim kontraktem na przyszłość — `npc-002` nie powinien dodawać deprivation damage tylko po to, aby przetestować rozróżnienie.

## Minimalny stan injury V1

`HealthState` pozostaje wspólnym, prostym stanem `{ maxHp, currentHp, dead }`. Nie dodawać do niego NPC-specific AI ani pełnego systemu conditions.

V1 potrzebuje minimalnej jawnej reprezentacji **healable physical injury**, np. NPC-owned amount/state, która:

- powstaje tylko po zaakceptowanym physical damage;
- rośnie o faktyczny final damage po defense resolution;
- nie powstaje od samego hunger/thirst meter;
- nie jest rekonstruowana z różnicy `maxHp - currentHp`;
- maleje o faktycznie przywrócone HP;
- nie pozwala leczyć martwego NPC.

Docelowo może zostać zastąpiona przez:

```text
injuries[] / conditions[]
  → type
  → severity
  → duration
  → effects
  → treatment
```

bez zmiany ogólnego pipeline `pressure → decision → action → treatment`.

## Healing jako pressure i decision

Healing **nie jest `NeedId`**. Nie dodawać `health` do `NeedId` tylko po to, aby wykorzystać `pickNeed()`.

`Needs.ts` posiada już jawny model `NpcPressure` i `generateNeedPressures()`. Healing powinien dostarczyć kompatybilny sygnał pressure/decision i wejść do istniejącego arbitrażu zamiast tworzyć drugi system scoringu.

Top-level ownerem decyzji jest obecnie `npcDecision.ts`. Implementacja powinna rozszerzyć ten seam tak, aby healing mógł wygrać z ordinary schedule/work, ale nie omijał istniejących reguł collapse, critical needs, severe weather i innych aktualnych priorytetów.

Dokładne progi ustalić podczas implementacji na podstawie aktualnego scoringu. Wymagana semantyka:

```text
brak injury / brak medicine
    → healing nie jest kandydatem

lekki uraz
    → może przegrać z bieżącą aktywnością

średni/poważny uraz
    → rosnące healing pressure

critical physiological pressure
    → zachowuje istniejącą semantykę priorytetu
```

Nie implementować personality-specific medical scoring w V1.

## Goals / Plans

Obecny `NpcPlan` reprezentuje persistent intent dla istniejących `NeedId` (`secureFood`, `secureWater`, `obtainWood`, `fulfilWorkDuty`).

V1 healing nie wymaga na siłę nowego `NpcGoalId` ani persistent `NpcPlan`: jest krótkim response na aktualny injury state i może zostać wykonany jako pojedynczy `NpcPlannedAction`.

Jeżeli podczas implementacji aktualny kod wykaże realną potrzebę wieloetapowego/resumable treatment, wtedy należy rozszerzyć istniejący Goal/Plan model zamiast budować osobny healing plan system.

## Consumables

Źródłem prawdy jest istniejący katalog:

```text
ITEM_CATALOG[kind].consumable?.need === 'health'
```

Nie hardcodować `bandage`, konkretnej wartości heal ani listy lekarstw. Codebase ma już więcej niż jeden health consumable i przyszłe przedmioty powinny działać bez zmian AI.

Przepływ:

```text
Inventory
→ revalidate item + catalog consumable
→ remove one item
→ healHealth()
→ reduce healable injury by actual restored HP
```

Nie wywoływać playerowego `createSurvivalActions()` z NPC ani nie tworzyć fake `PlayerActionContext`. Jeżeli wspólna logika consumable wymaga ekstrakcji, wydzielić wyłącznie domain-neutral helper i zachować player UI/toast policy poza nim.

## Action lifecycle

Dodać `heal` do istniejącego `ActionId` i wykorzystać `NpcPlannedAction`:

```text
decision
→ choose treatment destination
→ goTo
→ execute
→ consume
→ heal
→ choose
```

Nie dodawać faz `healing`, `movingToHealing`, osobnego FSM ani instant-heal w momencie decyzji.

`onComplete` musi rewalidować injury, życie NPC i dostępność wybranego consumable przed jego zużyciem.

Po leczeniu NPC nie wraca automatycznie do przerwanej pracy — ponownie przechodzi przez normalny decision flow, ponieważ świat mógł się zmienić.

## Miejsce leczenia

V1 wykorzystuje istniejące miejsca. Preferowanym destination jest własny dom NPC.

Nie tworzyć `HealingLocation`, hospital, doctor, medical station ani `SafePlaceManager`.

NPC musi dojść do miejsca przez istniejący movement/path/action lifecycle. Jeżeli destination przestaje być użyteczne, akcja powinna zakończyć się bezpiecznie i wrócić do normalnego decision flow.

## Combat i inne źródła damage

Combat pozostaje niezależnym execution mode:

```text
physical hit
→ accepted final damage
→ injury state
→ combat continues
→ combat ends
→ normal decision arbitration
→ healing może wygrać
```

`applyIncomingCombatDamage()` nie powinno automatycznie uruchamiać healing. Healing nie powinien też sam przerywać aktywnego combat.

Rejestracja injury powinna następować przy NPC-owned konsekwencji zaakceptowanego physical damage, po defense resolution, wykorzystując faktyczny final damage.

Przyszłe environmental physical damage powinno używać tej samej klasyfikacji. Przyszłe starvation/dehydration damage powinno jawnie omijać healable physical injury.

## Zakres implementacyjny

1. Ponownie sprawdzić wszystkie aktualne NPC damage entry points przed edycją.
2. Dodać minimalny NPC-owned healable physical injury state bez rozbudowy `HealthState` o AI policy.
3. Rejestrować injury z faktycznie zaakceptowanego physical damage.
4. Dodać pure healing-pressure/candidate logic zgodną z istniejącym `NpcPressure`/decision model.
5. Rozszerzyć `npcDecision.ts` o healing outcome/arbitration bez równoległego priority systemu.
6. Nie dodawać `health` do `NeedId`.
7. Dodać `heal` do `ActionId` i użyć istniejącego `goTo → execute` lifecycle.
8. Wyszukiwać health consumable przez katalog i istniejący `Inventory`.
9. Przy wykonaniu ponownie sprawdzić injury/item/alive state, zużyć dokładnie jeden item i zastosować `healHealth()`.
10. Zmniejszyć injury o faktycznie odzyskane HP, nie nominalne `relief`.
11. Preferować istniejący home/place jako treatment destination.
12. Zachować `combat → normal decision → healing`, bez auto-heal callbacków z combat.
13. Nie tworzyć pełnego injury/condition systemu ani nowego `NpcGoalId` bez realnej potrzeby ujawnionej przez implementację.
14. Dodać testy pure decision/pressure logic oraz action/injury invariants w istniejących modułach.
15. Bez niepowiązanych refaktorów.

## Przypadki do sprawdzenia

- physical injury + health consumable → healing może zostać wybrane i przywraca HP;
- physical injury bez consumable → brak healing candidate;
- niski HP bez healable injury → brak healing candidate;
- injury + critical thirst/hunger → istniejący survival priority pozostaje spójny;
- injury podczas combat → combat nie jest automatycznie przerywane;
- po combat → normalny arbitration może wybrać healing;
- item znika przed `execute` → brak konsumpcji/heal i bezpieczny powrót do decyzji;
- NPC umiera przed treatment → medicine nie jest zużywane;
- heal przekracza brakujące HP → HP clamp i injury maleje tylko o actual restored HP;
- NPC idzie do treatment location przez normalny pathing, bez teleportacji.

## Weryfikacja techniczna

- `tsc` / lint / test / build zgodnie z `CLAUDE.md`;
- testy dla healing pressure względem istniejących decision priorities;
- testy dla minimalnego injury state i actual-heal accounting;
- health consumables pozostają catalog-driven;
- brak `health` w `NeedId`;
- brak osobnego healing/injury managera i równoległego FSM;
- brak automatycznego combat healing;
- brak niepowiązanych refaktorów.

Weryfikację zachowania w przeglądarce wykonuje użytkownik.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

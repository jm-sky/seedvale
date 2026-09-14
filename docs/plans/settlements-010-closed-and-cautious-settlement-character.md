# Plan: Closed and cautious settlement character

**Created:** 2026-09-13
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Model:** Opus, Sonnet
**Depends on:** none
**Domain:** `settlements`
**Type:** `feature`
**Roadmap:** -

## Cel

Wprowadzić pierwszy deterministyczny charakter osady: `closed` / cautious.

Osada tego typu ma być rozpoznawalna przez pięć powiązanych efektów:

1. mocniejszy defensywny perimeter,
2. parę pochodni przy każdym faktycznym wejściu drogowym,
3. większy udział guardów w istniejącym workforce,
4. umiarkowany caution bias dla mieszkańców,
5. trwałą lokalną presję drapieżników, która uzasadnia defensywny charakter miejsca.

Nie tworzyć osobnych subsystemów dla settlement character, staffingu ani fauny.

## Settlement character

Rozszerzyć istniejącą settlement identity o mały archetype, np.:

```ts
type SettlementCharacter = 'default' | 'closed'
```

V1 zawiera tylko `closed`.

Zasady generation-time:

- wartość jest deterministyczna dla `world seed + settlement cell`,
- `forest` ma wyraźnie większą szansę na `closed`,
- pozostałe tereny mogą mieć niską szansę,
- `OUTPOST` pozostaje `default`,
- home pozostaje `default` w v1,
- użyć osobnego RNG salt, aby nie zmieniać istniejących seed streams.

Character nie zależy od chwilowego stanu świata. Kierunek zależności jest następujący:

```text
environment + seed
→ settlement character
→ layout/staffing/social/fauna modifiers
```

## Stronger palisade coverage

Closed settlement ma mieć wyższe **perimeter coverage** niż porównywalna zwykła osada.

Reuse istniejącego:

- `src/settlement/settlementPalisade.ts`,
- gate/corridor handling,
- settlement footprint,
- collision model.

Wymagania:

- palisada powinna być obecna dla `closed`, jeśli terrain/layout pozwala na poprawne ustawienie,
- zwiększać ciągłość istniejącego perimeteru, zamiast losowo zwiększać tylko liczbę segmentów,
- nie tworzyć drugiego pierścienia,
- gate nadal respektuje entrance/path corridor,
- nie omijać istniejących terrain/planner constraints.

## Entrance road torches

Każda faktyczna droga wejściowa closed settlement powinna mieć jedną parę pochodni przy wejściu:

```text
road
→ torch left + torch right
→ gate / perimeter
```

Wymagania:

- dokładnie jedna para markerów dla każdego faktycznego entrance road,
- bez ciągu pochodni wzdłuż całej drogi,
- placement wynika z planned entrance/road geometry,
- reuse istniejących torch/gate props i visual language,
- pozycje respektują spacing z gate, palisadą i road corridor.

Przy wielu drogach wejściowych każda dostaje własną parę.

## Guards

Nie tworzyć osobnego guard staffingu.

Rozszerzyć `ProfessionStaffingContext` o settlement-character signal i wykorzystać go w istniejącym `ROLE_STAFFING_POLICY.guard`.

Dla `closed`:

- podnieść guard staffing priority,
- pozwolić na dodatkowego guarda wcześniej, jeśli adult workforce na to pozwala,
- zachować pierwszeństwo obowiązkowych food/resource coverage slots,
- nie zwiększać populacji tylko po to, aby uzyskać więcej guardów.

Charakter osady ma zmieniać przydział istniejącego workforce, nie rozmiar populacji.

## NPC caution

Nie dodawać nowego traitu typu `distrustful` ani nowego personality modelu.

Canonical NPC personality pozostaje w `CharacterDef` / `BigFivePersonality`.

Settlement character działa jako kontekstowy modifier:

```text
personality
+ relationship
+ reputation
+ settlement character
→ reaction / cooperation / social decision
```

V1 ograniczyć do już istniejących punktów integracji, np.:

- reakcja na obcego gracza,
- willingness do pomocy/współpracy,
- istniejące social/decision scoring paths.

Efekt ma być umiarkowany. Wysoka relationship/reputation nadal może przezwyciężyć caution bias. `closed` oznacza ostrożność, nie automatycznie negatywną postawę.

## Predator pressure

Closed character powinien mieć trwałe uzasadnienie w otaczającym świecie, ale nie należy ślepo mnożyć naturalnie wysokiej liczby drapieżników.

Nie używać chwilowego live animal count jako źródła prawdy.

Ocena lokalnej presji korzysta z generation/configuration data:

- predator-compatible habitat/spawn points,
- ich configured population capacity,
- terrain i habitat suitability.

Closed settlement definiuje **minimum local predator-pressure target**.

```text
natural configured pressure
→ compare with closed target
→ below target: add only missing deterministic capacity
→ at/above target: add nothing
```

Jeżeli otoczenie ma już wysoką naturalną presję, nie zwiększać jej dalej.

Target ma odpowiadać wcześniejszej intencji mniej więcej:

- około 30% większej spawn presence,
- około 25% większej możliwej population capacity,

ale te wartości są kalibracją targetu, nie bezwarunkowymi mnożnikami każdego spawnera.

Implementacja powinna:

1. policzyć naturalną configured pressure w ustalonym radius,
2. wyznaczyć target dla `closed`,
3. policzyć deficit,
4. przy `deficit > 0` uzupełnić tylko brakującą zgodną habitat/spawn capacity,
5. przy naturalnej pressure na poziomie targetu lub wyżej nie zmieniać nic.

Reuse obecnych habitat/spawn-point generation i `AnimalSpawner`. Dodatkowa capacity nadal respektuje terrain, habitat suitability, species compatibility, spacing i lifecycle.

Nie tworzyć drugiego population-cap contractu, jeśli obecny spawner ma już canonical cap.

## Radius i overlap

Dodać jeden konfigurowalny radius oceny predator pressure wokół closed settlement.

Powinien obejmować outskirts i pobliski wilderness, ale nie cały settlement grid region.

Przy overlap kilku closed settlements:

- nie stackować character bonusu wielokrotnie dla tego samego habitat/spawn point,
- wyliczać efekt z rzeczywistego lokalnego deficytu względem targetu.

## Layout

Nie tworzyć osobnego layout generatora.

Character może przekazywać istniejącemu plannerowi tylko potrzebne preferencje:

- stronger perimeter coverage,
- czytelne entrance gates,
- planned torch pair dla każdego entrance road.

Jeżeli planner nie ma bezpiecznego mechanizmu dodatkowego zagęszczenia zabudowy, nie dodawać takiej zmiany w v1.

## Determinizm

Dla tego samego `world seed + settlement cell` stabilne muszą być:

- character,
- palisade coverage policy,
- entrance torch placement,
- staffing modifier,
- predator-pressure target i ewentualne uzupełnienie capacity.

Streaming order nie może wpływać na wynik.

Nowe decyzje nie powinny zmieniać istniejących RNG streams dla family generation, names, traits/personality, resources ani bazowej fauna habitat generation.

## Wydajność

Nie dodawać:

- per-frame settlement-character updates,
- globalnych fauna scans,
- osobnego character managera,
- live population polling tylko w celu utrzymywania targetu.

Preferować generation-time layout/staffing/fauna evaluation oraz kontekstowe odczyty character w istniejących reaction/decision evaluations.

## Existing mechanisms to reuse

- `src/settlement/villagePlan.ts` — settlement identity,
- `src/settlement/settlementGenerator.ts` — deterministic settlement generation,
- `src/settlement/settlementPalisade.ts` — defensive perimeter,
- `src/settlement/props.ts` — palisade/entrance materialization,
- istniejący entrance/local-road representation,
- istniejące torch/gate props,
- `src/settlement/professionStaffing.ts` — generation-time profession composition,
- `src/ai/characters.ts` — canonical `Role`, `Trait`, `CharacterDef`,
- `src/ai/dialogue.ts` — canonical `BigFivePersonality`,
- istniejące reaction/decision scoring,
- `src/fauna/AnimalSpawner.ts` i habitat/spawn generation.

Ważne publiczne contracts udokumentować JSDoc i właściwym `@domain`.

## Testy

Dodać deterministyczne testy:

- ten sam seed/cell daje ten sam character,
- forest ma wyższą częstość `closed`,
- OUTPOST i home nie dostają `closed`,
- closed settlement ma większe perimeter coverage niż odpowiednia zwykła osada,
- gate nadal respektuje entrance/path corridor,
- każde faktyczne entrance road dostaje dokładnie jedną parę pochodni,
- pochodnie respektują gate/palisade/road spacing,
- closed staffing zwiększa guard coverage przy tym samym workforce,
- food/resource professions zachowują pierwszeństwo,
- character nie mutuje bazowego personality ani traits,
- caution bias wpływa tylko na wskazane existing scoring paths,
- wysoka relationship/reputation może przezwyciężyć caution,
- naturalna predator pressure poniżej targetu dostaje tylko brakującą capacity,
- naturalna pressure na poziomie targetu lub wyżej nie dostaje dodatkowej capacity,
- non-predator fauna nie jest zwiększana,
- wynik nie zależy od chwilowego live count,
- overlap kilku closed settlements nie stackuje bonusu wielokrotnie,
- streaming order nie zmienia wyniku.

## Poza zakresem

- wiele settlement archetypes,
- runtime zmiana character,
- governance/morale/fear simulation,
- watchtowers,
- nowe typy murów lub drugi perimeter,
- oświetlanie całych dróg,
- guard patrol redesign,
- nowy distrust trait/personality model,
- scripted settlement attacks,
- predator attraction bezpośrednio od livestock,
- dynamiczne zwiększanie capacity na podstawie live population.

## Weryfikacja przez użytkownika

W browserze dla kilku seedów:

1. część leśnych settlements ma `closed`, home pozostaje zwykłe,
2. closed settlement ma wyraźnie pełniejszy perimeter,
3. każde wejście drogowe ma jedną parę pochodni,
4. closed settlement ma zauważalnie więcej guardów,
5. NPC są ostrożniejsi, ale relationship/reputation nadal ma znaczenie,
6. przy niskiej naturalnej predator pressure okolica dostaje tylko brakującą zgodną capacity,
7. przy już wysokiej naturalnej pressure nie pojawia się sztuczne przepełnienie,
8. fauna nadal respektuje habitat i istniejący lifecycle.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

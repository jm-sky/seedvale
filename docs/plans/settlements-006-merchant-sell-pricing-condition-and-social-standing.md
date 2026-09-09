# Plan: Merchant sell pricing — condition and social standing

**Created:** 2026-09-09
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** ~~quests-progression-001~~
**Domain:** `settlements`
**Type:** `polish`
**Subdomains:** `economy`
**Tags:** `merchant` `trade` `pricing` `reputation` `relationships`
**Roadmap:** -

## Cel

Poprawić ceny sprzedaży przedmiotów handlarzowi przez zastąpienie sztywnego `50% tradeValue` wspólnym modelem uwzględniającym:

- nominalną wartość przedmiotu,
- durability / condition,
- relację gracza z konkretnym handlarzem,
- lokalną reputation,
- lokalny renown.

Pełnowartościowy przedmiot powinien być sprzedawany neutralnemu handlarzowi za około **90% nominalnej wartości**, a przy bardzo dobrej relacji i bardzo dobrym lokalnym standing cena może dojść maksymalnie do około **105%**.

Nie tworzyć nowego systemu merchant reputation ani osobnego stanu ekonomicznego.

## Stan obecny

`tradeValue(kind)` jest centralną nominalną wartością ekonomiczną przedmiotu.

Obecny `sellPrice()` zwraca:

```text
floor(tradeValue × 0.5)
```

Instance-backed items przechodzą przez `resolveInstanceSellPrice()`.

Condition pricing istnieje obecnie tylko dla wybranych instancji, szczególnie traps. Po uwzględnieniu condition nadal nakładane jest globalne `× 0.5`.

`SellPriceContext` istnieje, ale jest obecnie pusty.

Player ↔ NPC relation jest własnością `QuestManager`.

Lokalna reputation i renown są własnością `ReputationManager`.

Nie używać `NpcRelationships`, ponieważ jest to osobny system relacji NPC ↔ NPC.

## Wspólny model ceny

Nominalna wartość:

```text
nominal = tradeValue(kind)
```

Najpierw wyznaczyć ofertę handlarza dla przedmiotu w idealnym stanie:

```text
fullConditionSellFactor =
    clamp(
        BASE_SELL_FACTOR + socialModifier,
        MIN_SELL_FACTOR,
        MAX_SELL_FACTOR
    )
```

Parametry startowe:

```text
BASE_SELL_FACTOR = 0.90
MIN_SELL_FACTOR = 0.80
MAX_SELL_FACTOR = 1.05
```

Neutralny gracz otrzymuje więc około 90% wartości.

Bardzo zła sytuacja społeczna może obniżyć cenę do około 80%.

Najlepsza możliwa sytuacja może podnieść ją do około 105%.

## Durability / condition

Dla przedmiotu posiadającego meaningful durability/condition:

```text
sellValue =
    nominal
    × fullConditionSellFactor
    × conditionRatio
```

gdzie:

```text
conditionRatio = clamp(current / maximum, 0, 1)
```

Przykład dla neutralnego gracza:

| Condition | Cena względem nominalnej |
|---:|---:|
| 100% | 90% |
| 75% | 67.5% |
| 50% | 45% |
| 25% | 22.5% |

Dzięki temu condition jest rzeczywiście proporcjonalnym składnikiem wartości, zamiast dodatkową karą nakładaną na obecne 50%.

Condition pricing musi być monotoniczny:

> lepszy stan tego samego przedmiotu nigdy nie może prowadzić do niższej ceny.

## Broken items

Jeżeli konkretny typ posiada semantyczny stan `broken`, może zachować specjalny salvage value.

Dla obecnych traps zachować w pierwszej wersji istniejącą zasadę bardzo niskiej wartości broken itemu, zamiast próbować uogólniać znaczenie `0% durability`.

Nie zakładać, że każdy item przy `0%` nadaje się do sprzedaży w identyczny sposób.

## Przedmioty bez durability

Dla przedmiotów bez meaningful condition:

```text
sellValue =
    nominal
    × fullConditionSellFactor
```

Czyli neutralnie około 90%, bez sztucznej kary 50%.

## Social modifier

Social modifier składa się z dwóch niezależnych części:

```text
socialModifier =
    relationshipEffect
    + reputationEffect
```

Następnie wynik jest ograniczony przez `MIN_SELL_FACTOR` / `MAX_SELL_FACTOR`.

## Relationship

Relacja dotyczy konkretnego handlarza.

Użyć istniejących `QuestManager.getRelation()` / `getRelationLevel()` i istniejących progów relation zamiast tworzyć merchant-specific affinity.

Dodatni wpływ na cenę powinien odpowiadać istniejącym tierom:

```text
stranger    →  0 pp
acquainted  → +1 pp
friendly    → +3 pp
trusted     → +5 pp
```

Dzięki temu pricing zachowuje semantykę obecnych progów `0 / 1 / 3 / 6`, zamiast liniowo traktować każdą wartość pomiędzy nimi jako równoważny progres społeczny.

Dla ujemnej relacji obecny model nie posiada negatywnych tierów. W tym zakresie zastosować łagodny ciągły modifier ograniczony do:

```text
-5 pp ... 0 pp
```

Nie dodawać nowych relation levels tylko na potrzeby handlu.

Łączny `relationshipEffect`:

```text
-5 pp ... +5 pp
```

## Reputation

Do ceny handlowej użyć przede wszystkim:

- `trust`,
- `integrity`,
- `competence`.

Wagi startowe:

```text
reputationScore =
    trust       × 0.40
    + integrity × 0.40
    + competence × 0.20
```

`benevolence` i `courage` nie wpływają bezpośrednio na handel w pierwszej wersji.

`reputationScore` pozostaje w zakresie `-100..100`.

Normalizacja:

```text
reputationNormalized = reputationScore / 100
```

## Renown

Renown nie daje samodzielnego bonusu.

Renown oznacza rozpoznawalność, a nie pozytywną opinię, dlatego powinien **wzmacniać efekt reputation**.

```text
renownFactor = 1 + renown / 100
```

Zakres:

```text
1.0 ... 2.0
```

Następnie:

```text
reputationEffect =
    reputationNormalized
    × 0.05
    × renownFactor
```

Zakres reputation effect:

```text
-10 pp ... +10 pp
```

Konsekwencje:

- neutralna reputation + wysoki renown → brak bonusu,
- dobra reputation + wysoki renown → większy bonus,
- zła reputation + wysoki renown → większa kara.

To zachowuje semantyczną różnicę między reputation i renown.

## Maksymalne przypadki

Najlepszy przypadek:

```text
base                  90%
trusted relationship  +5 pp
excellent reputation
+ max renown          +10 pp
                      ------
                      105%
```

Najgorszy przypadek jest ograniczony:

```text
minimum = 80%
```

Dla damaged itemów limit dotyczy wartości przed condition:

```text
50% condition × 105% = 52.5%
50% condition ×  80% = 40.0%
```

Dzięki temu social standing pozostaje lekkim modyfikatorem, a durability nadal jest głównym wyznacznikiem wartości zużytego przedmiotu.

## SellPriceContext

Rozszerzyć istniejący `SellPriceContext`.

Pure pricing code nie powinien importować ani znać:

- `QuestManager`,
- `ReputationManager`,
- settlement managerów.

Context powinien otrzymywać już rozwiązane wartości potrzebne do wyceny, np.:

```text
relation
relationLevel
reputation
renown
```

Identity handlarza i settlement ID powinny służyć warstwie composition/integration do zbudowania contextu, a nie samemu algorytmowi ceny.

## Jeden pricing pipeline

Docelowy przepływ:

```text
tradeValue
    ↓
social pricing context
    ↓
full-condition sell factor
    ↓
instance condition/durability
    ↓
broken/special semantics
    ↓
rounding + minimum coin
    ↓
final sell price
```

Stack items i instance-backed items powinny korzystać ze wspólnych helperów zamiast posiadać osobne bazowe zasady `50%`.

`tradeValue()` pozostaje czystą nominalną wartością i nie zna relationship, reputation ani durability.

## Inventory view

Nie przechowywać merchant-dependent ceny jako ogólnej właściwości przedmiotu.

Obecne użycie `resolveInstanceSellPrice(instance)` w `inventoryView` może pozostać wyłącznie jako neutralna wartość pomocnicza albo zostać usunięte z miejsc, gdzie cena ma oznaczać realną ofertę konkretnego handlarza.

Autorytatywna cena transakcji musi być liczona z właściwym `SellPriceContext`.

## Merchant integration

Warstwa otwierająca / obsługująca handel musi znać:

- konkretnego merchant NPC,
- settlement handlarza,
- `QuestManager`,
- `ReputationManager`.

Na tej podstawie buduje jeden `SellPriceContext`, używany następnie przez cały merchant flow.

Nie przekazywać managerów bezpośrednio do Vue.

## UI

Merchant Screen:

- pokazuje dokładnie tę samą cenę, która zostanie użyta przy finalizacji transakcji,
- nie implementuje własnego wzoru pricingowego,
- nie duplikuje social modifier.

W pierwszej wersji nie jest wymagane pokazywanie szczegółowego breakdownu ceny.

Można jednak pozostawić API pozwalające później wyświetlić np.:

```text
Wartość: 50
Stan: 75%
Relacja: +3%
Reputacja: +2%
Oferta: 36
```

bez ponownego implementowania wzoru w UI.

## Integracja z `items-player-019`

Ten plan powinien zostać wykonany **przed** `items-player-019-player-camp-repair-and-sewing-kit`.

`items-player-019` planuje podpięcie condition namiotu do `resolveInstanceSellPrice()`.

Po wykonaniu tego planu `items-player-019` powinien wykorzystać wspólny condition-aware pricing pipeline zamiast dodawać osobną logikę ceny namiotu.

Rekomendowana zależność `items-player-019`:

```text
Depends on: items-player-018, settlements-006
```

## Testy

Dodać testy czystego pricing API obejmujące co najmniej:

### Base pricing

- neutralny stack item → około 90%,
- brak starego globalnego `× 0.5`,
- minimum 1 coin po rounding tam, gdzie item jest sprzedawalny.

### Condition

- 100%,
- 75%,
- 50%,
- 25%,
- monotoniczność,
- istniejący broken trap behaviour.

### Relationship

- stranger,
- acquainted,
- friendly,
- trusted,
- wartości powyżej `trusted` nie zwiększają bonusu ponad +5 pp,
- ujemna relation,
- dolny limit -5 pp.

### Reputation / renown

- neutral reputation,
- dodatnia reputation,
- ujemna reputation,
- renown `0`,
- renown `100`,
- wysoki renown wzmacnia zarówno dobrą, jak i złą reputation,
- sam renown przy neutralnej reputation nie zmienia ceny.

### Caps

- najlepsza kombinacja → maksymalnie około 105%,
- najgorsza kombinacja → nie mniej niż 80% dla full-condition itemu.

### Integration

- Merchant UI preview i finalizacja używają identycznej ceny,
- instance-backed item korzysta z tego samego social context co stack item.

## Non-goals

Nie dodawać w tym planie:

- supply/demand,
- lokalnych market prices,
- różnic cen zależnych od merchant profession,
- merchant personality modifiers,
- haggling / negocjacji,
- barter skill,
- osobnego merchant reputation,
- dynamicznych spreadów buy/sell,
- nowych reputation dimensions,
- zmian nominalnych `tradeValue`,
- przebudowy settlement economy.

## Relevant files

Główne istniejące punkty integracji:

- `src/items/tradeCatalog.ts`
- `src/items/trade.ts`
- `src/items/inventoryView.ts`
- `src/ui-vue/screens/MerchantScreen.vue`
- `src/quests/QuestManager.ts`
- `src/quests/quests.ts`
- `src/reputation/ReputationManager.ts`

Przy implementacji dodać JSDoc do nowych publicznych/shared pricing helperów, jeśli powstaną, z `@domain settlements`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

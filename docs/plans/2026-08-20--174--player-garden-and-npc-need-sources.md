# Plan: Player Garden and NPC Need Sources

**Created:** 2026-08-20
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** ~~159~~ ~~172~~ ~~126~~ ~~127~~
**domain:** `settlements-npcs`
**tags:** [items-player, world-terrain]

## Cel

Dodać grządkę budowaną przez gracza oraz wspólny mechanizm, dzięki któremu NPC może rozpoznawać dostępne w świecie źródła zaspokajania podstawowych potrzeb — przede wszystkim wody i jedzenia — i samodzielnie wybierać odpowiednie źródło na podstawie położenia, dostępności i własnej potrzeby.

Plan nie tworzy „AI pomocnika”. NPC pozostaje normalnym mieszkańcem świata z istniejącymi needs, pressures, decision making, schedule i actions. Gracz zmienia świat przez budowanie infrastruktury, a NPC reaguje na powstałe możliwości.

Docelowy przepływ:

```text
world resources / player-built infrastructure
        ↓
available need sources
        ↓
NPC need + source discovery
        ↓
source selection
        ↓
existing NPC movement / action
        ↓
need satisfied
```

## 1. Player-built garden plot

Dodać fizyczną grządkę budowaną przez gracza w dowolnym odpowiednim miejscu świata.

Minimalny koszt budowy:

- łopata,
- drewno,
- kamienie.

Budowa powinna korzystać z istniejącego systemu player-built world objects / placement zamiast tworzyć osobny garden placement framework.

Grządka jest trwałym elementem świata i po zbudowaniu może zostać wykorzystana zarówno przez gracza, jak i NPC.

Nie tworzyć osobnego `GardenManager`.

## 2. Crop ownership

Grządka powinna dostarczać miejsca dla cropów korzystających ze wspólnego lifecycle z planu `172`.

Sadzenie przez gracza pozostaje ownership boundary planu `126`:

```text
126 → seed + planting + placement
172 → crop lifecycle
174 → garden plot + NPC source discovery
```

Nie tworzyć drugiego mechanizmu wzrostu cropów ani osobnego crop lifecycle dla grządki.

Pierwsza wersja nie wymaga rozbudowanego rolnictwa. Wystarczy, że dojrzały crop może stanowić dostępne źródło jedzenia dla NPC.

## 3. Need Source model

Wprowadzić minimalny, generyczny opis źródła zaspokajania potrzeby.

Przykładowy koncept:

```ts
NeedSource {
  need: 'hunger' | 'thirst'
  position: Vector3Like
  availability: ...
  distance / travel cost: ...
  action: ...
}
```

Dokładny typ powinien zostać dopasowany do istniejących struktur NPC i world resources. Nie tworzyć globalnego registry wszystkich źródeł świata, jeżeli istniejące chunk/resource systems pozwalają na lokalne wyszukiwanie.

Źródło powinno być reprezentacją istniejącego świata, a nie kopią jego stanu.

## 4. Source discovery

NPC musi potrafić znaleźć najbliższe sensowne źródło dla aktualnej potrzeby.

Minimalny przypadek:

```text
thirsty
  → search nearby water sources
  → find well / other available water source
  → travel
  → collect/use water
```

```text
hungry
  → search nearby food sources
  → find mature garden crop / natural berries / apples / nuts
  → travel
  → gather/eat food
```

Wyszukiwanie powinno być:

- ograniczone przestrzennie,
- deterministyczne,
- świadome dostępności źródła,
- oparte na istniejących mechanizmach chunk/resource queries,
- wykonywane przy potrzebie/decyzji, a nie co klatkę.

Nie tworzyć globalnego per-frame `NeedSourceManager`.

## 5. Source selection

„Najbliższe” nie musi oznaczać wyłącznie najmniejszej odległości.

Minimalny scorer może uwzględniać:

```text
distance
+ availability
+ action feasibility
```

W pierwszej wersji nie dodawać skomplikowanej ekonomii źródeł ani długoterminowego planowania.

NPC powinien preferować dostępne, osiągalne źródło znajdujące się w rozsądnym zasięgu.

Jeżeli źródła nie ma w lokalnym zasięgu, NPC zachowuje istniejące zachowanie dla niezaspokojonej potrzeby zamiast otrzymywać teleport lub magiczne zasoby.

## 6. Natural food as need source

Wykorzystać istniejące natural food z planu `159`.

Źródłami jedzenia mogą być m.in.:

- jagody,
- jabłka,
- orzechy,
- inne istniejące natural food sources, gdy spełniają ten sam kontrakt.

NPC nie dostaje osobnego „forest food AI”. Naturalne jedzenie jest po prostu jednym z dostępnych źródeł `hunger`.

Przykład:

```text
NPC hungry
  → nearby natural food query
  → berries 35 m
  → mature garden crop 80 m
  → choose berries
```

Natural food pozostaje tym samym zasobem, z którego może korzystać gracz.

## 7. Garden as need source

Dojrzałe cropy na zbudowanych grządkach powinny być wykrywalne jako źródło `hunger`.

NPC powinien:

1. znaleźć dostępny dojrzały crop,
2. przejść do grządki,
3. wykonać istniejącą akcję gather/harvest,
4. otrzymać normalny item,
5. wykorzystać go zgodnie z istniejącą logiką potrzeb/konsumpcji.

Nie tworzyć `NpcGardenAction` tylko dlatego, że źródłem jest grządka, jeżeli istniejące gather/harvest actions mogą zostać rozszerzone o nowy source type.

## 8. Well as need source

Istniejąca / planowana player-built well (`127`) powinna być traktowana jako źródło `thirst`.

Plan `174` nie powinien tworzyć drugiej studni ani drugiego mechanizmu wody.

Docelowo:

```text
player builds well
        ↓
well becomes world need source
        ↓
nearby thirsty NPC discovers it
        ↓
NPC uses existing water action
```

Jeżeli plan `127` wymaga niewielkiego rozszerzenia API, należy wykonać je w ramach istniejącego ownership studni zamiast kopiować stan studni do systemu NPC.

## 9. NPC behaviour

Nie tworzyć `HelperAI`, `GardenAI`, `FoodFinderAI` ani `WaterFinderAI`.

Mechanizm powinien zostać włączony do istniejącego przepływu:

```text
needs
→ problems / pressures
→ decision
→ strategy
→ action
```

Źródło potrzeby jest jednym z możliwych sposobów realizacji potrzeby, a nie specjalnym trybem NPC.

NPC postawiony przez gracza poza osadą nadal jest normalnym NPC. Jeżeli w pobliżu znajduje się namiot, studnia, grządka i naturalne źródła jedzenia, może z nich korzystać bez ręcznego przypisywania go do konkretnego obiektu.

Własne krytyczne potrzeby NPC zachowują pierwszeństwo przed ewentualną przyszłą pomocą graczowi.

## 10. Out of scope

Nie implementować w tym planie:

- polowania jako źródła jedzenia,
- NPC combat/hunting AI,
- przypisywania NPC do jednej grządki,
- Companion system,
- osobnego Helper AI,
- teleportowania NPC do źródeł,
- globalnego registry wszystkich need sources,
- automatycznego podlewania jako osobnego systemu, jeśli nie jest wymagane przez istniejący crop lifecycle,
- zaawansowanego systemu farm,
- nawożenia, chorób, chwastów i genetyki,
- dedykowanego systemu „placówek” poza wykorzystaniem istniejących world objects.

Polowanie może później zostać dodane jako kolejny `hunger` source korzystający z tego samego kontraktu.

## 11. Persistence / chunks

Need source discovery musi działać poprawnie z istniejącym chunk lifecycle.

- nie przechowywać kopii źródeł w NPC,
- nie wymagać załadowania całego świata,
- źródła w unloaded chunks nie powinny powodować globalnego skanu,
- po zmianie dostępności źródła NPC może ponownie wykonać lokalne wyszukiwanie.

Stan grządki musi korzystać z istniejącego persistence modelu player-built world objects.

## 12. Performance

- brak per-frame skanowania źródeł,
- bounded/local queries,
- reuse istniejących chunk/resource queries,
- brak globalnego source registry bez wyraźnej potrzeby,
- brak nowych Workerów,
- source selection wykonywane przy zmianie potrzeby/decyzji lub po nieudanej próbie realizacji potrzeby.

Mechanizm powinien skalować się z liczbą NPC i źródeł bez wykonywania `NPC × all world resources` co tick.

## 13. Verification

### Technical

- `pnpm lint:fix`
- `pnpm typecheck`
- testy,
- build.

Testy jednostkowe powinny pokrywać co najmniej:

- wybór najbliższego dostępnego źródła,
- pomijanie niedostępnego źródła,
- rozróżnienie `hunger` / `thirst`,
- natural food jako źródło hunger,
- dojrzały crop jako źródło hunger,
- studnia jako źródło thirst,
- brak globalnego skanowania świata w ścieżce decyzji.

### Browser / gameplay

Sprawdzić scenariusz end-to-end:

1. gracz buduje grządkę w dowolnym miejscu,
2. grządka może otrzymać crop zgodnie z `126`/`172`,
3. w pobliżu znajduje się naturalne jedzenie, np. jagody,
4. NPC zostaje umieszczony w tym obszarze,
5. NPC z potrzebą hunger znajduje i wykorzystuje dostępne źródło,
6. po zmianie odległości / dostępności NPC może wybrać inne źródło,
7. NPC z potrzebą thirst może wykryć studnię,
8. NPC działa bez ręcznego przypisania do grządki lub studni,
9. NPC nadal zachowuje normalne życie i istniejący system potrzeb/schedule,
10. zachowanie działa również poza bezpośrednim centrum osady.

## 14. Expected architecture outcome

Po implementacji świat powinien posiadać spójny mechanizm:

```text
resource / infrastructure
        ↓
need source
        ↓
NPC discovery
        ↓
choice
        ↓
existing action
```

Przykładowe źródła:

```text
Well            → thirst
Garden crop     → hunger
Berries         → hunger
Apples          → hunger
Nuts            → hunger

Future:
Hunting         → hunger
Fishing         → hunger
Water barrel    → thirst
Other farms     → hunger
```

Dzięki temu późniejsze systemy nie muszą tworzyć kolejnych specjalnych zachowań NPC. Dodają jedynie nowe źródła implementujące istniejący kontrakt potrzeby.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

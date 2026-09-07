# Plan: Contextual River Water Safety

**Created:** 2026-09-06
**Status:** `done` ✅
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~world-011~~
**Domain:** `world`
**Subdomains:** `resources` `simulation`
**Tags:** `water` `river` `drinking` `hydrology` `settlements`
**Roadmap:** -

## Cel

Zastąpić obecne uproszczenie `river = safe` deterministyczną oceną jakości wody zależną od konkretnego miejsca poboru.

Mały ciek wysoko w terenie i blisko początku zlewni może być bezpieczny, natomiast większa rzeka downstream lub rzeka przepływająca blisko osady powinna być traktowana jako `unsafe`.

Mechanizm ma być tani, liczony lazy i oparty na istniejących danych świata.

## Założenia architektoniczne

Nie tworzyć nowego `WaterSystem` ani player-only mechanizmu.

Rozszerzyć istniejący przepływ:

    hydrology / river data
        ↓
    river water context
        ↓
    WaterSource classification
        ↓
    survivalActions
        ↓
    PlayerNeeds / Inventory

`WaterSource` pozostaje wspólnym kontraktem źródła wody.

Nie przenosić logiki hydrologii ani settlement proximity do `survivalActions`.

Implementation notes istnieją w:

`docs/plans/implementation-notes/world-017-contextual-river-water-safety-implementation-notes.md`

Plan nie powtarza opisanych tam seamów kodowych, ownership ani sugerowanej kolejności implementacji.

## 1. River water context

Dodać małe, deterministyczne query dla punktu interakcji z rzeką.

Wykorzystać istniejące dane river network / river segments zamiast ponownie wykonywać hydrologię.

Minimalny kontekst powinien zawierać dane źródłowe potrzebne klasyfikatorowi, przede wszystkim:

- `elevation`,
- `accumulation`.

Nie duplikować pochodnych wartości, jeśli można je wyliczyć istniejącą funkcją, np. `flowFactor()` z `accumulation`.

Nie wykonywać traversal upstream przez river tiles.

Nie próbować wyliczać pełnego metrycznego dystansu od rzeczywistego źródła rzeki.

### 1.1 Actual worldgen semantics / ranges

Aktualny produkcyjny river worldgen ma następującą semantykę:

- hydrologia działa na D8 gridzie o kroku `RIVER_CELL_STEP = 8` world units,
- `RiverPoint.elevation` jest wysokością hydrologicznego floor sample dla danego punktu chaina; nie jest biome label ani gotową kategorią `low/high/mountain`,
- `RiverPoint.accumulation` jest liczbą komórek zlewni dochodzących do/poprzez dany hydrology cell; zawsze `>= 1`,
- produkcyjna klasyfikacja cieku używa `DEFAULT_RIVER_THRESHOLDS`:
  - `stream = 15`,
  - `river = 50`,
  - `majorRiver = 200`,
- renderowane chains zawierają wyłącznie punkty już przekraczające próg `stream`, więc dla klasyfikacji wody istotny praktyczny zakres accumulation zaczyna się od około `15`,
- `flowFactor(accumulation)` jest kanoniczną, monotoniczną normalizacją „wielkości przepływu”; `0` poniżej `stream`, rośnie logarytmicznie/eased i osiąga okolice górnego zakresu przy `majorRiver * 4`,
- accumulation wzdłuż poprawnego D8 flow nie maleje downstream; dlatego jest dobrym lokalnym proxy dla upstream/downstream bez traversal,
- worldgen nie posiada analogicznego kanonicznego progu elevation znaczącego „high terrain”. Default terrain ma `waterLevel = 0.45`, `heightScale = 18` oraz dodatkowe hills/mountain contributions, więc absolutna stała wysokości byłaby krucha względem tuningu worldgenu.

Wniosek planistyczny: próg wielkości cieku można oprzeć bezpośrednio o istniejące river thresholds. Próg wysokości musi być skalibrowany z rzeczywistych river points aktualnego worldgenu, a nie wyprowadzony z nazwy biome ani arbitralnej liczby.

## 2. Lazy classification

Jakość rzeki klasyfikować dopiero wtedy, gdy jest potrzebna, np.:

- podczas resolve/interakcji z shoreline,
- przy piciu,
- przy napełnianiu pojemnika,
- przez inne przyszłe systemy pytające o jakość lokalnego źródła.

Nie liczyć jakości dla wszystkich rzek podczas world generation.

Nie wykonywać klasyfikacji w globalnym ticku.

## 3. Base river quality

Dodać czystą, deterministyczną funkcję klasyfikującą bazową jakość rzeki z kontekstu hydrologicznego.

### 3.1 River classification heuristic v1

Reguła ma być konserwatywna: `safe` jest wyjątkiem dla małego, wysoko położonego cieku; wszystko inne jest `unsafe`.

```text
smallFlow = accumulation < DEFAULT_RIVER_THRESHOLDS.river
highTerrain = elevation >= calibratedHighRiverElevation

baseQuality = smallFlow && highTerrain
  ? safe
  : unsafe
```

Decyzje:

- granica `smallFlow` to istniejący próg `river = 50`, nie nowy magic number; zakres `15 <= accumulation < 50` odpowiada już worldgenowej klasie małych streams,
- `accumulation >= 50` jest zawsze `unsafe`, niezależnie od elevation; obejmuje większe upstream tributaries oraz rzeki rosnące downstream,
- `majorRiver = 200` pozostaje użytecznym scenariuszem kalibracyjnym/testowym, ale nie potrzebuje osobnej jakości — nadal `unsafe`,
- `flowFactor()` może być użyty diagnostycznie/UI-debugowo, ale classifier nie potrzebuje osobnego progu flowFactor, skoro canonical threshold `river = 50` już istnieje,
- elevation nie może podnieść większej rzeki do `safe`.

### 3.2 Calibration `calibratedHighRiverElevation`

Nie wpisywać teraz arbitralnej wysokości liczbowej. Przed implementacją utrwalić próg na podstawie krótkiego deterministycznego calibration sample z aktualnego worldgenu:

1. użyć produkcyjnych `DEFAULT_RIVER_THRESHOLDS`,
2. zebrać `RiverPoint.elevation` wyłącznie dla małych cieków `15 <= accumulation < 50`,
3. objąć kilka stałych seedów reprezentujących aktualny worldgen, w tym co najmniej seed domyślny/testowy oraz seed z wyraźnymi mountains/coast,
4. zapisać rozkład/kwantyle elevation tych punktów,
5. wybrać próg odpowiadający wyraźnie górnej części rozkładu, tak aby `safe` było ograniczone do faktycznie wysoko położonych streams, a nie większości małych cieków.

Preferowany start kalibracji: około górnego kwartylu (`P75`) elevation małych streamów. To jest procedura kalibracji, nie wymaganie, że finalny próg musi dokładnie równać się P75. Jeśli rozkład jest wielomodalny lub P75 daje nielogiczne wyniki w browser verification, wybrać najbliższy stabilny próg rozdzielający wysokie headwater-like streams od lowland streams i udokumentować zmierzone dane w teście/komentarzu tuningu.

Invariant: zmiana produkcyjnego terrain/hydrology worldgenu, która istotnie przesuwa rozkład river elevations lub river thresholds, powinna skłonić do ponownej kalibracji zamiast zachowania starej liczby jako prawdy semantycznej.

## 4. Settlement proximity modifier

Uwzględnić wpływ pobliskiej osady już w pierwszej wersji.

Wykorzystać istniejący settlement grid / settlement plan cache / `SettlementsManager` zamiast:

- ładować settlement meshes,
- zależeć od tego, czy settlement jest aktualnie streamed-in,
- skanować wszystkie aktywne osady.

Lookup settlement proximity powinien być osobnym mechanizmem od klasyfikatora, tak aby końcowa funkcja klasyfikująca pozostała pure i łatwa do testowania.

### 4.1 Bounded lookup

Aktualny settlement grid ma `SETTLEMENT_GRID_STEP = 280`, a settlement site może być przesunięty wewnątrz swojej komórki przez deterministic offset i lokalny site search. Dlatego lookup nie może sprawdzać wyłącznie `worldToCell(point)`.

Reguła v1:

- `center = worldToCell(riverX, riverZ)`,
- sprawdzić `cellsWithinRadius(center, 1)`, czyli dokładnie `3 × 3 = 9` komórek,
- każdą komórkę rozwiązać przez istniejący canonical settlement plan cache (`peekDef` / odpowiedni istniejący resolver), bez mesh streaming,
- dla istniejącego `SettlementDef` mierzyć zwykły dystans XZ od punktu poboru do faktycznego `def.x/z`, nie do środka grid cell,
- early-exit po znalezieniu osady spełniającej proximity.

Radius 1 jest stałym bounded kosztem i obejmuje wszystkie osady, które mogą być sensownie blisko punktu leżącego przy granicy settlement cell; nie wykonywać rozszerzającego się radial search.

### 4.2 Proximity distance

Przyjąć `nearSettlementDistance = SETTLEMENT_GRID_STEP / 2 = 140` world units.

Uzasadnienie: wartość pochodzi bezpośrednio z istniejącej skali settlement grid, a nie z niezależnego magic number. Jest wystarczająco lokalna, aby nie oznaczać całej przestrzeni pomiędzy sąsiednimi osadami jako skażonej, a jednocześnie obejmuje ciek przepływający przez bezpośrednie otoczenie osady.

Semantyka jest radialna i celowo uproszczona:

```text
nearSettlement = distanceXZ(waterPoint, settlementDef.xz) <= SETTLEMENT_GRID_STEP / 2
```

Nie sprawdzać w v1:

- upstream/downstream względem osady,
- footprintu konkretnych budynków,
- loaded/unloaded state,
- populacji/liczby zwierząt,
- dynamicznych źródeł pollution.

Final modifier:

```text
base safe + near settlement → unsafe
base unsafe + near/far settlement → unsafe
```

Settlement proximity nigdy nie podnosi jakości.

## 5. Water quality composition

Rozdzielić pojęciowo:

    baseQuality
    +
    contextual modifiers
    =
    finalQuality

Na tym etapie:

    baseQuality:
      hydrology

    contextual modifiers:
      settlement proximity

Finalny `WaterSource` otrzymuje gotowe:

    safe | unsafe | undrinkable

Pozostałe źródła zachowują obecne zasady:

- well → `safe`,
- lake → `unsafe`,
- ocean → `undrinkable`,
- river → kontekstowe `safe | unsafe`.

### 5.1 Classification matrix

`Ehigh` oznacza skalibrowany `calibratedHighRiverElevation`.

| Context | Hydrology | Settlement | Final | Powód |
|---|---|---|---|---|
| mały ciek wysoko | `15 <= accumulation < 50`, `elevation >= Ehigh` | > 140 | `safe` | jedyny v1 safe candidate |
| mały ciek nisko | `15 <= accumulation < 50`, `elevation < Ehigh` | dowolnie | `unsafe` | lowland stream |
| mały ciek wysoko przy osadzie | `15 <= accumulation < 50`, `elevation >= Ehigh` | <= 140 | `unsafe` | settlement modifier degraduje safe candidate |
| podobny mały ciek wysoko z dala od osady | `15 <= accumulation < 50`, `elevation >= Ehigh` | > 140 | `safe` | brak contextual downgrade |
| większy upstream / tributary | `50 <= accumulation < 200` | dowolnie | `unsafe` | przekroczył canonical `river` threshold |
| major/downstream | `accumulation >= 200` | dowolnie | `unsafe` | canonical major river / duża zlewnia |
| mały ciek dokładnie na granicy flow | `accumulation = 50` | dowolnie | `unsafe` | threshold jest half-open dla safe: `< river` |
| mały ciek dokładnie na granicy elevation | `< 50`, `elevation = Ehigh` | > 140 | `safe` | jawna inkluzywna granica elevation |
| safe candidate dokładnie na granicy osady | `< 50`, `>= Ehigh` | `distance = 140` | `unsafe` | proximity jest `<=` |

Jeżeli query z jakiegokolwiek powodu nie potrafi wiarygodnie dostarczyć hydrology context dla rozpoznanej rzeki, v1 powinno fail-closed do `unsafe`, nie do obecnego legacy `safe`.

## 6. Lazy cache

Klasyfikacja ma być lazy + cached.

### 6.1 Stable cache key

Aktualne canonical river chains są po smoothing/meanderingu: interpolowane `RiverPoint` nie zachowują prostego oryginalnego hydrology-cell indexu, a transient runtime segment object nie jest stabilną tożsamością.

Dlatego v1 nie powinno wymyślać segment ID. Stabilny fallback key ma wynikać z rozdzielczości hydrologii:

```text
cellX = floor(sampleX / RIVER_CELL_STEP)
cellZ = floor(sampleZ / RIVER_CELL_STEP)
key = `${cellX},${cellZ}`
```

`sampleX/sampleZ` oznacza canonical nearest-river sample/centerline location zwróconą przez river query, nie dokładne `(playerX, playerZ)` ani bank point przesunięty szerokością rzeki.

Jeżeli podczas implementacji istniejący query naturalnie zwróci trwałą tożsamość równie stabilną jak hydrology-cell coordinate, można jej użyć, ale key musi spełniać invariants:

- ten sam fragment cieku z obu brzegów → ten sam key,
- drobny ruch gracza wzdłuż jednego hydrology sample → brak lawiny nowych entries,
- brak zależności od object identity, chunk load order lub mesh lifecycle,
- deterministyczność dla tego samego seedu/worldgen.

### 6.2 Cache lifecycle

Cache jest runtime-only i world-scoped:

- powstaje dla bieżącego świata,
- znika wraz z `WorldBundle`/river resolver lifecycle przy rebuildzie lub zmianie seedu,
- nie trafia do `SaveData`,
- nie jest globalnym cache pomiędzy światami.

Przy obecnym zakresie, gdzie final quality zależy wyłącznie od deterministic hydrology + deterministic settlement plan, można cache'ować finalny `safe/unsafe` wynik per key.

Nie projektować invalidation pod przyszłe pollution. Jeśli dynamiczne modifiers pojawią się później, rozdzielić cached deterministic base/context od dynamicznej części.

## 7. Extension point pod przyszłe zanieczyszczenia

Nie implementować jeszcze pełnego pollution systemu, ale nie zamykać API na kolejne modyfikatory.

To nie należy do tego planu. W szczególności nie rozszerzać obecnego zakresu o diseases, purification ani pełny upstream traversal.

## 8. Performance

Mechanizm powinien być tani:

- brak hydrology recomputation,
- brak globalnego settlement scan,
- brak globalnego water-quality tick,
- brak pełnego upstream traversal,
- maksymalnie 9 settlement cells na cold cache miss,
- lazy evaluation,
- cache dla powtarzających się query.

Klasyfikacja jakości wody nie powinna wpływać zauważalnie na frame time.

## 9. Calibration / test scenarios

Dodać unit testy pure classifiera oraz testy bounded proximity/cache seamów opisanych w implementation notes.

### 9.1 Hydrology boundaries

Po ustaleniu `Ehigh`:

| Scenario | Input | Expected |
|---|---|---|
| poniżej produkcyjnego stream threshold | `accumulation = 14`, dowolne elevation | nie powinno wystąpić jako normalny river sample; classifier defensywnie `unsafe` |
| minimalny produkcyjny stream | `accumulation = 15`, `elevation = Ehigh`, far | `safe` |
| ostatni small-stream value | `accumulation = 49`, `elevation = Ehigh`, far | `safe` |
| canonical river boundary | `accumulation = 50`, bardzo wysokie elevation, far | `unsafe` |
| major boundary | `accumulation = 200`, bardzo wysokie elevation, far | `unsafe` |
| elevation tuż poniżej | `< 50`, `Ehigh - epsilon`, far | `unsafe` |
| elevation dokładnie na progu | `< 50`, `Ehigh`, far | `safe` |

### 9.2 Settlement boundaries

Przy `nearSettlementDistance = 140`:

- safe candidate przy `139.99` → `unsafe`,
- safe candidate przy `140` → `unsafe`,
- safe candidate przy `140.01` → `safe`,
- osada znajdująca się w sąsiedniej grid cell musi zostać znaleziona przez radius-1 lookup,
- brak osady w 9 sprawdzanych cells → modifier `far`, bez dalszego search,
- streamed-out settlement ma taki sam wynik jak streamed-in settlement.

### 9.3 Cache semantics

- dwa query z przeciwnych brzegów wskazujące ten sam canonical river sample → ten sam cache key/result,
- dwa exact player positions w obrębie tego samego hydrology cell nie zwiększają cache count,
- przejście do sąsiedniego hydrology cell może utworzyć nowy entry,
- ten sam seed + lokalizacja po world rebuild daje ten sam wynik, ale pochodzi z nowego runtime cache,
- zmiana seedu nie może odziedziczyć starego cache.

### 9.4 Calibration acceptance

Przed zamrożeniem `Ehigh` zapisać w teście/diagnostyce próbkę z kilku seedów i potwierdzić, że klasyfikacja daje wszystkie istotne klasy przypadków:

- istnieją `safe` candidate streams (`15..49`, wysoko),
- istnieją małe lowland streams klasyfikowane `unsafe`,
- większe `50..199` pozostają `unsafe` nawet wysoko,
- downstream/major `>= 200` pozostają `unsafe`,
- proximity do osady potrafi degradować przynajmniej jeden hydrologiczny safe candidate.

Jeżeli aktualne seedy nie dostarczają reprezentatywnych punktów dla któregoś bucketu, nie dobierać progu „na siłę”; rozszerzyć deterministyczny calibration sample o kolejne tiles/seedy.

Dodać też regresję istniejących typów:

- lake → `unsafe`,
- ocean → `undrinkable`,
- well → `safe`.

## 10. UX

Zachować istniejącą semantykę feedbacku.

Dla `safe` nie pokazywać warningu o chorobie.

Dla `unsafe` zachować obecny warning:

    Ta woda może powodować chorobę.

Nie ujawniać graczowi wewnętrznych progów elevation/accumulation.

Jakość powinna być możliwa do intuicyjnego odczytania z kontekstu świata:

- mały wysoko położony strumień,
- większa rzeka downstream,
- rzeka blisko osady.

## Known limitation / follow-up

Obecny model pojemników nie zachowuje jakości źródła po napełnieniu. Oznacza to, że `unsafe` woda nalana do bukłaka nie pozostaje oznaczona jako `unsafe` podczas późniejszego picia z pojemnika.

Nie rozszerzać tego planu o pełny container contamination system, ale zachować tę lukę jako jawny follow-up do osobnego planu.

## Poza zakresem

- system chorób,
- gotowanie i oczyszczanie wody,
- filtry,
- przechowywanie jakości wody w bukłaku,
- dynamiczne skażenie przez NPC/faunę,
- propagacja pollution downstream,
- pełne śledzenie źródła rzeki między river tiles,
- analiza rzeczywistego upstream względem osady.

## Verification

Browser verification wykonuje User:

- znaleźć mały ciek wysoko w terenie i sprawdzić brak warningu,
- sprawdzić mały ciek nisko i warning,
- sprawdzić większą rzekę downstream i warning,
- sprawdzić ciek blisko osady i warning,
- sprawdzić podobny ciek daleko od osady,
- sprawdzić lake,
- sprawdzić ocean,
- sprawdzić well,
- upewnić się, że fishing oraz filling nie mają regresji.

Przy implementacji dodać JSDoc do ważnych publicznych funkcji/klas architektonicznych, gdy pomaga to w preflight discovery; dla nowych mechanizmów preferować `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

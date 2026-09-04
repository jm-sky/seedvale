# Plan: Species metabolism, herbivore diet and renewable forage

**Created:** 2026-09-04
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `fauna`
**Subdomains:** `habitat` `domestication`
**Tags:** `needs` `diet` `forage` `livestock`
**Roadmap:** -

## Cel

Rozwinąć istniejący system potrzeb zwierząt tak, aby podstawowa fizjologia i dieta wynikały z gatunku, a roślinożercy korzystali z rzeczywistych, zużywalnych źródeł pożywienia zamiast obecnego abstrakcyjnego forage point.

Zmiana ma stworzyć fundament pod późniejsze pastwiska, niedobory paszy, produkcję siana, sezonowość i bardziej rzeczywistą gospodarkę zwierzęcą, bez tworzenia równoległego systemu karmienia.

## Zakres

### 1. Fizjologia per gatunek

Rozszerzyć istniejący `AnimalDef` o konfigurację podstawowego metabolizmu.

Konfiguracja gatunku powinna co najmniej określać:

- hunger rate,
- thirst rate,
- stamina capacity,
- stamina drain rate,
- stamina regeneration rate.

`AnimalLife` pozostaje właścicielem runtime state i operacji na hunger/thirst/stamina, ale wartości wejściowe pochodzą z definicji gatunku.

Wspólne progi takie jak elevated-need threshold, search cooldown oraz czasy jedzenia/picia pozostają globalne w tym etapie, dopóki nie pojawi się realna potrzeba różnicowania ich między gatunkami.

### 2. Dieta per gatunek

Dodać do konfiguracji gatunku deklaratywną dietę zamiast wyprowadzania jej z `AnimalRole`.

Dieta określa dozwolone źródła pokarmu oraz względną wartość odżywczą.

Pierwszy zakres roślinożerców:

- horse,
- donkey,
- cow,
- sheep,
- deer,
- stag,
- rabbit.

Powinny one móc korzystać z:

- grass forage,
- hay,
- wybranych istniejących owoców,
- wybranych istniejących warzyw.

Dokładne preferencje i wartości są konfiguracją gatunku.

Nie zmieniać w tym planie istniejącej ścieżki predator → prey/carcass/scavenging.

### 3. Fizyczne grass forage patches

Zastąpić dla roślinożerców obecne abstrakcyjne znalezienie dowolnego odpowiedniego punktu terenu rzeczywistymi `GrassForagePatch`.

Patch:

- ma deterministyczną pozycję i stabilną tożsamość,
- powstaje tylko na odpowiednim terenie,
- może zostać zjedzony przez jedno zwierzę,
- po zjedzeniu staje się wizualnie niedostępny/depleted,
- odrasta po określonym czasie świata.

Placement powinien wykorzystywać istniejący chunk/seed model podobny do deterministycznych chunk resources/items.

Persistować tylko konieczny stan odstępstwa od deterministycznego świata, np. czas ponownej dostępności patcha, a nie pełną listę wszystkich patchy.

Regrowth rozwiązywać leniwie względem `elapsedDays`, bez per-frame growth ticków.

### 4. Integracja z istniejącym source-action pipeline

Rozszerzyć obecny mechanizm wyszukiwania i wykonywania działań na źródłach:

```text
search → SourceTarget → validation → movement → eat → consumption
```

Nie tworzyć osobnego `AnimalFeedingSystem`.

Jeżeli patch zostanie zużyty przez inne zwierzę przed dotarciem do niego, target powinien zostać unieważniony i wyszukany ponownie przez istniejący mechanizm retry/cooldown.

Zużycie patcha następuje dopiero po ukończeniu akcji jedzenia.

### 5. Siano jako realny item

Dodać `hay` jako rzeczywisty `ItemKind` przeznaczony dla zwierząt.

Nie traktować siana jako ogólnej żywności NPC/player, jeżeli spowodowałoby to włączenie go do istniejących mechanizmów human food/`Household.foodCount`.

Dieta gatunku decyduje, czy `hay` jest jadalne.

### 6. Tymczasowe odnawialne źródło siana

Do czasu wdrożenia ścinania/suszenia trawy zapewnić małe fizyczne źródło siana.

Źródło pozwala pozyskać maksymalnie 4 porcje siana na game-day oraz posiada cooldown pomiędzy kolejnymi pobraniami.

Stan produkcji/odnowienia powinien być oparty o world time i rozwiązywany leniwie zamiast przez aktywny timer.

Mechanizm powinien być możliwy do późniejszego zastąpienia przez:

```text
grass/crop → cutting → drying → hay
```

bez zmiany `hay` itemu, diet zwierząt ani mechanizmu konsumpcji.

### 7. Karmienie livestock z household resources

Domestic herbivores powinny móc korzystać z fizycznego punktu karmienia powiązanego z ich owning household.

Punkt karmienia nie posiada własnego zdublowanego inventory.

Autorytatywnym źródłem pozostaje:

```text
Household.items
```

analogicznie do istniejącego:

```text
AnimalTrough → Household.water
```

Zwierzę wybiera tylko itemy zgodne ze swoją dietą.

Wybrany item zostaje atomowo usunięty z household inventory dopiero po ukończeniu akcji jedzenia.

Naturalne grass forage pozostaje fallbackiem, gdy odpowiednia pasza domowa nie jest dostępna.

## Performance

Nie śledzić pojedynczych źdźbeł istniejącej renderowanej trawy.

Grass forage powinien być małym zbiorem źródeł gameplayowych, niezależnym od gęstej warstwy wizualnej.

Wyszukiwanie źródeł musi być:

- przestrzennie ograniczone,
- uruchamiane tylko przy odpowiednim poziomie hunger,
- throttlowane przez istniejący source-search cooldown,
- ograniczone do potrzebnych/załadowanych danych.

Nie wykonywać globalnych scanów patchy ani household inventories per frame.

Rendering patchy powinien korzystać z batching/instancing, jeżeli liczba obiektów tego wymaga.

## Persistence / world continuity

Deterministyczny placement patchy nie powinien być zapisywany jako pełny stan.

Persistować jedynie sparse depletion/regrowth overrides wymagane do zachowania konsekwencji zjedzenia trawy po save/load.

Nie rozszerzać przy tej okazji persistence pojedynczych dzikich zwierząt.

Livestock nadal korzysta z istniejącej persistence własnego `AnimalLifeState`.

## Testy

Dodać testy dla:

- różnych life rates/capacity między gatunkami,
- konfiguracji diet,
- wyboru dozwolonego/niedozwolonego itemu,
- grass patch depletion,
- lazy regrowth,
- konkurencji dwóch zwierząt o ten sam patch,
- household-feed consumption,
- braku konsumpcji przy przerwanej akcji,
- dziennego limitu i cooldownu tymczasowego źródła siana.

## Manual verification

W przeglądarce sprawdzić co najmniej:

1. głodny koń/krowa/owca znajduje widoczny grass patch, podchodzi do niego, je go i patch znika,
2. zjedzona trawa po odpowiednim czasie świata ponownie się pojawia,
3. livestock preferuje dostępną paszę z własnego household przed dalszym szukaniem naturalnego forage,
4. siano/owoc/warzywo rzeczywiście znika z household inventory po jedzeniu,
5. brak paszy powoduje fallback do naturalnej trawy,
6. drapieżniki zachowują dotychczasowe hunting/carcass behaviour,
7. większa liczba patchy nie powoduje zauważalnego regresu frame time.

## Poza zakresem

- symulowanie pojedynczych źdźbeł renderowanej trawy,
- pełny system koszenia trawy,
- suszenie i właściwa produkcja siana,
- sezonowa dostępność paszy,
- zimowe zapasy i starvation consequences,
- automatyczna praca NPC przy produkcji/uzupełnianiu siana,
- nowe potrzeby zwierząt poza hunger/thirst/stamina,
- przebudowa predator/scavenging,
- persistence pojedynczych dzikich zwierząt.

Dodać JSDoc z `@domain fauna` dla nowych ważnych publicznych granic odpowiedzialności, tak aby były widoczne dla AI preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Plan: Seed Library and persistent worldgen cache

**Created:** 2026-09-05
**Status:** `planned` 📋
**Type:** optimization
**Priority:** high · **Effort:** L
**Depends on:** world-013
**Domain:** `world`
**Subdomains:** `simulation` `places`
**Tags:** `seed` `worldgen` `cache` `persistence`
**Roadmap:** -

## Problem

Każda nowa gra obecnie otrzymuje nowy losowy seed. Użytkownik nie może świadomie ponownie wykorzystać interesującego świata, a deterministyczne kosztowne obliczenia wykonane dla danego seeda nie mogą być współdzielone między niezależnymi save'ami.

Seed jest już źródłem deterministycznej początkowej geografii świata, ale nie istnieje jako osobny zarządzalny zasób. Jednocześnie `world-013` rozwija runtime cache coarse terrain dla `WorldLocationCatalog`; nie należy tworzyć obok niego konkurencyjnego mechanizmu.

Seed Library ma być katalogiem deterministycznych tożsamości światów, a nie katalogiem odkrytych światów.

## Goal

Wprowadzić trwałą bibliotekę seedów, która pozwala:

- używać jednego seeda w wielu niezależnych save'ach,
- wybierać istniejący seed przy New Game zamiast zawsze losować nowy,
- nadawać seedom własną nazwę, opis i tagi,
- pokazywać tani deterministyczny profil/nazwę świata bez wymuszania nowych obliczeń terenu,
- współdzielić między save'ami wyłącznie kosztowne deterministyczne cache,
- zachować pełną niezależność dynamicznego stanu każdego save'a.

Koncepcyjnie:

```text
Seed
├── identity
├── generated profile/name
├── user metadata
├── references from save games
└── persistent deterministic caches
```

## Architecture boundaries

`SaveData.config.seed` pozostaje autorytatywnym seedem konkretnego save'a.

Seed Library nie przejmuje dynamicznego stanu świata. Nie należą do niej m.in.:

- NPC/household/economy state,
- harvested/depleted resources,
- player constructions,
- player terrain modifications,
- quests i history,
- `MapDiscovery`, `LocationKnowledge` ani navigation targets,
- inne konsekwencje symulacji lub działań gracza.

Dwie gry na tym samym seedzie mają tę samą deterministyczną geografię i mogą współdzielić immutable derived cache, ale ich symulacja i historia pozostają całkowicie niezależne.

## 1. Seed jako osobny zasób

Wprowadzić trwały `SeedRecord`, niezależny od `SaveData`.

Koncepcyjnie:

```text
SeedRecord
- seed
- createdAt
- lastUsedAt
- generatedName
- customName?
- description?
- tags[]
- traits/profile
- cache metadata where useful
```

`customName`, `description` i `tags` są metadata użytkownika i nie mogą zależeć od lifecycle cache.

Automatyczne traits powinny być odróżnialne od user tags. Nie mieszać obu pojęć w jednym źródle danych.

## 2. IndexedDB ownership

Rozszerzyć istniejącą bazę IndexedDB `seedvale`, zamiast tworzyć równoległy storage system.

Preferowany podział odpowiedzialności:

```text
seedvale
├── saves
├── seeds
└── worldgenCache
```

`seeds` przechowuje małe metadata Seed Library.

`worldgenCache` przechowuje potencjalnie większe deterministyczne dane pochodne. Cache nie należy do `SaveData`.

Przy zmianie schematu IndexedDB zachować istniejące save slots i ich lifecycle/migrations.

## 3. New Game — explicit seed selection

Obecny flow losujący `config.seed = randomSeed()` dla każdego New Game zastąpić świadomym wyborem seeda.

UI New Game powinno zawsze pokazywać aktualnie wybrany świat/seed oraz możliwość wygenerowania nowego, np.:

```text
Świat
[ Wzgórza nad Srebrną Rzeką ▼ ]

[ ] Wygeneruj nowy seed
```

Jeżeli użytkownik wybiera istniejący seed:

- nowy save otrzymuje ten seed,
- nie dziedziczy żadnego dynamicznego stanu z innych save'ów,
- świat jest odbudowany przez normalny lifecycle New Game.

Jeżeli użytkownik wybiera nowy seed:

- użyć istniejącego `randomSeed()`,
- utworzyć `SeedRecord`,
- użyć go dla nowego save'a.

Przy pustej Seed Library pierwsza gra może automatycznie utworzyć pierwszy seed.

Nie pozwolić URL seedowi przypadkowo nadpisywać seed zapisany w ładowanym save'ie; zachować istniejące zasady lifecycle.

## 4. Seed selection and display

Lista seedów powinna używać czytelnej nazwy jako głównej informacji, a numer seeda jako informacji drugorzędnej/technicznej.

Display name:

```text
customName ?? generatedName
```

Przy wyborze można pokazać również dostępne już traits/tags, ale samo otwarcie listy nie może uruchamiać worldgen ani location scan.

## 5. Seed profile without terrain discovery

Wygenerowanie profilu i nazwy seeda **nie może powodować obciążenia przez odkrywanie lub liczenie terenu, który nie został jeszcze policzony przez normalny lifecycle świata**.

Tworzenie `SeedRecord`, otwarcie Seed Library i renderowanie listy seedów muszą pozostać tanie.

Profil może używać wyłącznie:

- danych już dostępnych dla obszaru startowego,
- już hydrated runtime/persistent cache,
- tanich deterministycznych klasyfikatorów,
- lekkiego mechanizmu używanego przez discovery/map locations, jeżeli omija on ciężkie obliczenia terenu,
- innych istniejących danych, których odczyt nie rozszerza zakresu world generation.

Nie wykonywać broad `WorldLocationCatalog` scan tylko po to, aby sklasyfikować lub nazwać seed.

W szczególności zabroniony jest flow:

```text
new seed
→ scan dużego obszaru
→ terrain/location generation
→ nazwa
```

Preferować:

```text
new seed
→ already-cheap/available local characteristics
→ generated profile/name
```

Jeżeli istniejący map/location discovery posiada lightweight seam, który celowo pomija ciężkie obliczenia, reuse'ować go zamiast tworzyć drugi klasyfikator.

Nie kopiować matematyki proceduralnego świata do Seed Library.

## 6. Generated name stability

`generatedName` ustalić raz z danych dostępnych przy tworzeniu/profilowaniu seeda i traktować jako stabilne metadata.

Nie zmieniać automatycznie nazwy seeda tylko dlatego, że późniejszy gameplay policzył kolejne regiony świata. Seed nie powinien pozornie zmieniać tożsamości w czasie.

Traits mogą zostać później rozszerzone na podstawie danych, które zostały policzone naturalnie przez gameplay, ale takie wzbogacenie:

- nie może samo inicjować world scan,
- nie może zmieniać `LocationKnowledge` ani `MapDiscovery`,
- nie może nadpisywać user metadata,
- nie powinno automatycznie zmieniać `generatedName`.

Jeżeli kiedyś potrzebne będzie ponowne sugerowanie nazwy, zrobić to jako jawne działanie użytkownika/follow-up, nie automatyczny lifecycle.

## 7. Generated seed names

Nazwa powinna wynikać z rzeczywistych, tanio dostępnych dominujących cech świata, np.:

- `Leśne Wzgórza nad Rzeką`,
- `Bagienna Dolina`,
- `Kamienne Wyżyny przy Wybrzeżu`,
- `Dębowa Nizina`.

Nie wymuszać bardziej szczegółowej nazwy kosztem dodatkowego sampling. Prostsza poprawna nazwa jest lepsza niż szczegółowa nazwa wymagająca ukrytego world scan.

## 8. Seed management screen

Dodać ekran zarządzania seedami dostępny z głównego menu.

Dla każdego seeda pokazać w zakresie już dostępnych metadata:

- display name,
- seed number,
- generated traits,
- user tags,
- last used,
- liczbę save'ów korzystających z seeda,
- informację o istniejącym cache, jeżeli można ją uzyskać tanio.

Akcje:

- Rename,
- Edit description,
- Edit tags,
- Use for New Game,
- Clear generated cache,
- Delete seed.

Otwarcie ekranu nie może inicjować generowania świata, hydracji dużych cache ani location scan.

## 9. User metadata

Metadata użytkownika pozostają niezależne od worldgen cache:

```text
customName
 description
 tags
```

Przykład:

```text
Name: Świetny seed z rzeką
Description: Dobry start przy lesie, fajne miejsce na osadę na zachodzie.
Tags: #rzeka #las #dobry-start
```

`Clear cache`, cache invalidation ani zmiana generator version nie mogą usuwać tych danych.

## 10. Seed deletion semantics

Rozdzielić trzy operacje:

```text
Delete cache
Delete seed
Delete save
```

`Clear cache` usuwa wyłącznie disposable deterministic derived data. Seed metadata i save'y pozostają nietknięte, a brakujące dane mogą zostać później odbudowane.

`Delete seed` nie może przypadkowo zepsuć istniejących save'ów. Jeżeli seed jest referencjonowany przez save'y, blokować usunięcie lub zachować minimalny rekord wymagany przez te save'y. Nie kaskadować usuwania save'ów.

## 11. Persistent worldgen cache

Wprowadzić wspólny persistence seam dla kosztownych deterministycznych wyników:

```text
(seed + namespace + version + region/key)
→ derived data
```

Nie cache'ować od razu każdego proceduralnego samplera. Persistent cache dodawać tylko tam, gdzie profiling pokazuje realny koszt i istnieje stabilna reprezentacja danych.

Pierwszym kandydatem jest coarse terrain/location cache rozwijany przez `world-013`.

Seed Library nie może tworzyć własnej konkurencyjnej reprezentacji coarse terrain.

## 12. Cache namespaces and versioning

Nie używać jednego monolitycznego blobu ani zakładać, że samo `seed` wystarcza jako klucz.

Preferowany model:

```text
seed / namespace / version / key
```

Przykładowo:

```text
123 / locations-coarse / v2 / tile:10:14
123 / river-analysis / v1 / region:3:7
```

Preferować versioning per cache namespace, aby zmiana jednego generatora nie invalidowała wszystkich pozostałych cache.

Cache jest disposable derived data. Niekompatybilna wersja powoduje cache miss, a nie próbę migracji za wszelką cenę.

## 13. Reuse world-013 runtime cache

`world-013` pozostaje właścicielem reprezentacji coarse terrain potrzebnej przez `WorldLocationCatalog`.

Rozszerzyć jego lifecycle w kierunku:

```text
runtime coarse cache
        ↕
persistent worldgen cache
        ↕
(seed, namespace, version, tile)
```

Cold query może hydrate'ować istniejące dane persistent. Persistent miss wykonuje normalny procedural sampling i może później zapisać derived result.

Wynik query musi być identyczny niezależnie od tego, czy pochodzi z cold generation, runtime cache czy persistent cache.

## 14. Cache writes must not create new hitches

Persistent cache jest wyłącznie optymalizacją.

Nie zastępować freeze podczas worldgen freeze'em podczas serializacji lub zapisu cache.

Preferować:

- stabilną region/tile granularity,
- bounded payloads,
- asynchronous IndexedDB writes,
- brak wielkich monolitycznych snapshotów,
- brak obowiązkowego zapisu na krytycznej ścieżce gameplay.

Runtime correctness nie może zależeć od powodzenia zapisu cache.

## 15. Cache size and cleanup

Persistent cache nie może rosnąć bez ograniczeń wraz z liczbą seedów i odwiedzonych regionów.

Przewidzieć metadata potrzebne do bezpiecznego cleanup, np. `lastAccessedAt` i przybliżony rozmiar, jeżeli są uzasadnione implementacyjnie.

Wprowadzić prostą politykę ograniczenia cache lub przygotować wyraźny lifecycle seam pozwalający ją dodać bez przebudowy storage.

Cleanup może usuwać wyłącznie derived cache. Nigdy automatycznie nie usuwać SeedRecord metadata ani save'ów.

Nie implementować skomplikowanego quota managera bez zmierzonej potrzeby.

## 16. Save independence and New Game reset

Reuse seeda nie oznacza reuse stanu startowego poprzedniego save'a.

New Game na istniejącym seedzie musi przejść przez ten sam poprawny reset/orchestration lifecycle co nowy losowy seed i odtworzyć deterministyczny świat z aktualnego generatora/cache.

Nie przenosić pomiędzy save'ami żadnego mutable state tylko dlatego, że współdzielą seed.

## 17. Tests

Dodać testy obejmujące co najmniej:

1. dwa save'y mogą używać tego samego seeda,
2. New Game na istniejącym seedzie nie wymusza `randomSeed()`,
3. jawne wygenerowanie nowego seeda tworzy nowy `SeedRecord`,
4. SeedRecord metadata round-trip przez IndexedDB,
5. custom name/description/tags nie znikają po `Clear cache`,
6. usunięcie cache nie zmienia deterministycznego wyniku świata,
7. cache dla innej namespace/version nie jest używany,
8. cache seeda A nigdy nie trafia do seeda B,
9. persistent hit daje identyczny rezultat jak cold generation,
10. kolejność save'ów korzystających ze wspólnego seeda nie wpływa na wynik,
11. błędny/brakujący cache degraduje się do normalnego procedural generation,
12. utworzenie `SeedRecord` nie wywołuje broad terrain/location scan,
13. otwarcie Seed Library nie zwiększa zakresu policzonego world cache,
14. wygenerowanie nazwy działa przy cold seed bez Near/Far Map scan,
15. późniejsze wzbogacenie traits używa tylko danych policzonych przez normalny world lifecycle,
16. seed profiling nie zmienia `LocationKnowledge` ani `MapDiscovery`,
17. dwa save'y na jednym seedzie zachowują niezależny dynamiczny state,
18. usunięcie cache nie usuwa ani nie modyfikuje save'ów.

## 18. Performance verification

Zmierz co najmniej:

- koszt utworzenia nowego SeedRecord/profile/name,
- cold first use nowego seeda,
- warm start nowego save'a na istniejącym seedzie,
- cold/warm `WorldLocationCatalog` query po integracji persistent cache,
- czas hydrate cache z IndexedDB,
- rozmiar persistent cache,
- koszt i rozmiar zapisów cache.

Samo tworzenie/nazywanie seeda i otwarcie Seed Library nie powinno powodować zauważalnego frame hitch ani inicjować broad terrain scan.

Celem persistent cache jest rzeczywiste zmniejszenie CPU worldgen, a nie tylko przeniesienie kosztu między etapami.

Browser/gameplay verification wykonuje użytkownik.

## Non-goals

- współdzielenie dynamicznej symulacji między save'ami,
- cache całego świata z góry,
- generowanie pełnego świata przy tworzeniu `SeedRecord`,
- odkrywanie terenu/lokacji tylko po to, aby wygenerować dokładniejszą nazwę,
- Web Worker bez zmierzonej potrzeby,
- multiplayer synchronization,
- cloud seed library,
- osobny generator geografii lub location system dla Seed Library.

## Implementation guidance

Przed implementacją przygotować implementation notes na podstawie aktualnego kodu, szczególnie:

- `src/app/createApp.ts`,
- `src/main.ts`,
- `src/persistence/saveDb.ts`,
- `src/persistence/saveData.ts`,
- `src/persistence/saveSlots.ts`,
- `src/world/parseSeed.ts`,
- `src/world/worldContext.ts`,
- `src/world/locations/worldLocationCatalog.ts`,
- lightweight discovery/map-location seams,
- cache zaimplementowany przez `world-013`,
- aktualne Vue main-menu/save-management components.

Zweryfikować aktualne ownership/lifecycle przed kodowaniem; kod jest źródłem prawdy. Nie zakładać, że `world-013` został zaimplementowany dokładnie według planu.

Dla nowych ważnych publicznych/lifecycle API dodać JSDoc tam, gdzie pomaga preflight discovery; użyć `@domain` dla istotnych entrypointów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

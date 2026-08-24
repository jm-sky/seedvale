# Plan: House Interior Furniture and Bed Anchors

**Created:** 2026-08-19
**Status:** `verification needed` 🔍 — implemented (one house, `COTTAGE_4X4_A`) + `tsc`/lint/build/test 2026-08-24; browser/gameplay verification pending
**Priority:** 🟡 medium · **Effort:** L
**Depends on:** ~~168~~ ~~111~~
**Domain:** `settlements-npcs`
**Tags:** `items-player`

## Cel

Wyposażyć domy w funkcjonalne wnętrza:

- łóżko;
- stół;
- lampę na stole;
- skrzynię.

Elementy nie są wyłącznie dekoracją. Łóżko musi dostarczać rzeczywisty `lodging/sleep interaction point` zgodny z kontraktem planu 168.

Najważniejszym wymaganiem jest poprawne rozmieszczenie modeli względem rzeczywistej skali i geometrii domu.

## Zasada assetów

Przed authorowaniem wnętrz wykorzystać istniejący Asset Alignment Browser.

Nie tworzyć nowego równoległego narzędzia do pomiaru modeli.

Dla każdego użytego assetu sprawdzić:

- native dimensions;
- prepared dimensions;
- origin/pivot;
- wysokość względem podłoża;
- orientację +Z;
- bounding box;
- ewentualne istniejące anchory.

Nie zgadywać skali ani pozycji na podstawie nazwy pliku.

## Asset discovery

Najpierw odnaleźć istniejące assety dla:

- bed;
- table;
- table lamp;
- chest.

Jeżeli brakuje odpowiedniego modelu:

- nie tworzyć przypadkowego placeholdera jako rozwiązania docelowego;
- udokumentować brak;
- użyć istniejącego najbliższego assetu tylko jeśli jest zgodny z pipeline assetów.

Asset Browser powinien być użyty do potwierdzenia wymiarów przed umieszczeniem modeli w domu.

## Placement authoring

Pozycje mebli powinny być danymi, nie zakodowanymi przypadkowo w builderze.

Rozszerzyć istniejący `HouseDefinition` / assembly data zamiast tworzyć drugi format domu.

Każdy element powinien mieć co najmniej:

- `assetId`;
- lokalny position;
- lokalny yaw/rotation;
- ewentualny scale tylko jeśli jest konieczny;
- rolę funkcjonalną;
- opcjonalne anchory/interactions.

Przykładowo:

```text
bed
  visual
  sleep interaction point
  sleep facing

table
  visual

table lamp
  mount relative to table

chest
  visual
  interaction point
```

## Łóżko

Łóżko jest najważniejszym elementem funkcjonalnym.

Musi dostarczyć:

- `sleep` interaction point;
- pozycję podejścia;
- orientację postaci podczas snu;
- referencję do miejsca noclegu zgodnego z planem 168;
- jakość `high`.

Nie tworzyć drugiego systemu sleep interaction.

House Builder ma jedynie wystawić dane miejsca.

## Stół i lampa

Stół powinien mieć stabilną pozycję w przestrzeni domu.

Lampa powinna być umieszczona **względem stołu**, a nie niezależnie względem ścian/podłogi.

Jeżeli istnieje już mechanizm anchorów `mount`, wykorzystać go.

Nie hardcode'ować osobnych pozycji lampy dla każdego wariantu bez potrzeby.

## Skrzynia

Skrzynia jest wizualnym elementem wyposażenia, ale jej pozycja i orientacja powinny być przygotowane tak, aby późniejszy system storage/interakcji mógł wykorzystać istniejący interaction point.

Nie implementować tutaj nowego inventory/storage systemu.

Jeżeli istniejący system kontenerów z planu 164/156 może zostać podpięty bez tworzenia nowego mechanizmu, zachować tę możliwość.

## Alignment i authoring workflow

Dla każdego mebla:

1. znaleźć asset w Asset Browser;
2. sprawdzić native bounds;
3. ustalić rzeczywistą skalę;
4. ustalić origin/pivot;
5. sprawdzić orientację;
6. ustalić placement względem podłogi i ścian;
7. ustalić interaction point;
8. dopiero wtedy zapisać transform w `HouseDefinition`.

Jeżeli asset ma błędny pivot/origin lub skalę, nie kompensować tego przypadkowymi wartościami w wielu miejscach.

Najpierw ustalić, czy problem powinien być rozwiązany przez istniejące `prepare`, anchor albo authoring danych.

## Warianty domów

Nie zakładać, że jedna pozycja mebli będzie poprawna dla każdego domu.

Pierwszy wariant powinien być dokładnie zweryfikowany.

Dla kolejnych wariantów:

- używać wspólnych placement rules tylko wtedy, gdy geometria i footprint rzeczywiście na to pozwalają;
- w przeciwnym przypadku authorować lokalne transformy;
- nie tworzyć ogólnego automatycznego furniture solvera bez rzeczywistej potrzeby.

## House Builder integration

Rozszerzyć istniejący `HouseDefinition` / `HouseAssembly`.

Nie tworzyć drugiego `InteriorBuilder`, jeżeli istniejący House Builder może być rozszerzony.

Rozdzielić:

- statyczne furniture;
- interaktywne furniture;
- interaction points.

Łóżko i skrzynia powinny być traktowane jako elementy wymagające niezależnego runtime state / interakcji, jeśli istniejący system tego wymaga.

## Performance

Nie powodować niepotrzebnego wzrostu draw calls.

Preferować:

- współdzielenie assetów;
- istniejący cache GLB;
- instancing dla wielu identycznych statycznych elementów, jeśli House Builder już to obsługuje;
- osobny obiekt tylko dla elementu wymagającego interakcji.

Nie wykonywać globalnego refaktoru renderingu settlementu.

## Lighting

Lampa na stole powinna korzystać z istniejącego systemu oświetlenia domów.

Nie tworzyć osobnego systemu lamp tylko dla wnętrz.

Jeżeli istniejący `houseLighting` posiada mechanizm mount/fallback, rozszerzyć go zamiast tworzyć drugi pipeline.

## Pierwszy zakres

Pierwszy działający domek powinien zawierać:

```text
floor
walls
bed
table
table lamp
chest
```

oraz:

```text
bed → sleep interaction
chest → future storage interaction point
```

Nie dodawać kolejnych mebli tylko dlatego, że są dostępne w asset packu.

## Implementacja

1. Sprawdzić aktualny House Builder po planie 111 i jego problemy z assembly.
2. Naprawić / uwzględnić jego aktualny kontrakt zamiast budować na założeniu, że każdy domek jest poprawnie składany.
3. Przejrzeć dostępne furniture GLB przez Asset Browser.
4. Udokumentować rzeczywiste wymiary i problemy z pivotami.
5. Wybrać konkretne assety.
6. Authorować placement danych pierwszego domu.
7. Dodać łóżko wraz z interaction pointem zgodnym z planem 168.
8. Dodać stół.
9. Dodać lampę jako element związany ze stołem.
10. Dodać skrzynię.
11. Podpiąć istniejące house lighting.
12. Rozszerzyć `HouseAssembly` o interaction points.
13. Sprawdzić streaming/dispose/cache.
14. Dopiero po poprawnym pierwszym domu rozszerzyć konfigurację na pozostałe warianty.

## Poza zakresem

- nowy system Asset Browser;
- nowy system anchorów;
- nowy system sleep;
- nowy inventory/storage system;
- automatyczne projektowanie wnętrza;
- dekorowanie wszystkich budynków w świecie;
- globalny furniture placement solver.

## Weryfikacja

### Asset alignment

- każdy model ma potwierdzoną skalę;
- modele stoją poprawnie na podłodze;
- brak wejścia w ściany;
- brak nieprawidłowych pivotów;
- orientacja mebli jest poprawna;
- interaction points są wizualnie poprawne.

### Dom

- pierwszy domek ma kompletne wnętrze;
- łóżko znajduje się wewnątrz domu;
- stół i lampa są poprawnie względem siebie;
- skrzynia jest poprawnie ustawiona;
- lampa korzysta z istniejącego lighting system.

### Gameplay

- „Nocuj w mieście” może znaleźć łóżko;
- gracz może dojść do łóżka;
- sen rozpoczyna się przy prawidłowym interaction point;
- jakość snu łóżka jest `high`.

### Performance/lifecycle

- brak niekontrolowanego wzrostu draw calls;
- brak duplikowania GLB cache;
- streaming i dispose nie powodują leaków;
- istniejące testy/build/lint przechodzą;
- browser/manual verification wykonana zgodnie z `CLAUDE.md`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

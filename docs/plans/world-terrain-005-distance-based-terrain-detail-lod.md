# Plan: Distance-Based Terrain Detail LOD

**Created:** 2026-09-02
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** ~~004~~
**Domain:** `world-terrain`
**Subdomains:** `grass` `roads` `lod` `graphics`
**Tags:** `vegetation` `road-detail` `performance`

## Cel

Zwiększyć wizualną gęstość i jakość terenu poprzez rozszerzenie istniejących mechanizmów distance-based LOD:

- zwiększyć wizualne pokrycie trawą bez proporcjonalnego wzrostu kosztu geometrii,
- nadać drogom bardziej naturalny, nierówny wygląd z bliska,
- zachować tanią reprezentację wizualną na dalszych dystansach,
- udostępnić nowe efekty przez istniejący system konfiguracji grafiki/quality,
- umożliwić niezależne A/B testing i łatwe wyłączenie każdego ulepszenia.

Nie tworzyć równoległego systemu LOD, vegetation ani road rendering.

## 1. Obowiązkowy pre-implementation pre-flight

Przed implementacją Claude Code musi wykonać focused recon aktualnego codebase i zweryfikować:

- grass species, placement, batching i istniejący LOD,
- `densityLodFraction()` i `grassFillerLodFraction()`,
- `InstancedMesh` oraz materiały używane przez filler,
- terrain/chunk geometry generation,
- road mask i road height,
- istniejący road normal/detail/pothole pipeline,
- sposób określania final terrain height,
- chunk boundaries i world-space coordinate usage,
- system quality presets i runtime graphics settings,
- sposób regenerowania istniejących chunków po zmianie konfiguracji,
- wszystkie systemy zależne od final terrain height.

Pre-flight musi odpowiedzieć na następujące pytania:

### Grass

Czy zwiększenie liczby prostych filler instances nie spowoduje większego kosztu GPU przez overdraw/alpha testing niż obecna trawa?

Czy istniejący filler może zostać rozszerzony na dalsze poziomy LOD bez tworzenia nowego systemu?

### Road

Czy dodatkowe nierówności można zaimplementować przez rozszerzenie istniejącego terrain geometry pipeline?

Nie zakładać z góry konieczności utworzenia osobnego `RoadMesh`.

Ustalić, czy near-road detail powinien:
- modyfikować rzeczywistą terrain geometry,
- czy pozostać wyłącznie render-detail.

Jeżeli zmienia rzeczywistą wysokość terenu, zidentyfikować wszystkie konsekwencje dla gameplay/navigation/placement.

Jeżeli wystarczający efekt można uzyskać istniejącym mechanizmem vertex displacement lub inną tańszą metodą, preferować ją zamiast nowej geometrii.

Jeżeli obecna tessellation nie daje wystarczającej rozdzielczości do near-road displacement, nie zwiększać rozdzielczości całego terenu bez wykazania potrzeby; najpierw znaleźć lokalne rozwiązanie o mniejszym koszcie.

### Chunk boundaries

Wszystkie deterministyczne deformacje drogi muszą być oparte o world-space coordinates, jeżeli korzystają z noise/procedural variation.

Nie dopuścić do seamów ani innych różnic na granicach chunków.

### Konfiguracja

Zweryfikować pełny przepływ:

```
config
→ quality preset
→ runtime graphics settings
→ terrain/chunk generation
→ existing chunks
```

Ustalić, czy zmiana ustawień wymaga regeneracji chunków i zapewnić poprawne zastosowanie nowych wartości.

Jeżeli pre-flight ujawni konflikt z założeniami planu, najpierw dostosować rozwiązanie do aktualnej architektury zamiast wymuszać opisany wariant implementacji.

## 2. Grass — distance-based coverage

Rozszerzyć istniejący system grass LOD wykorzystujący `GrassSpeciesId`, batching/instancing oraz istniejące funkcje LOD.

Docelowy model:

```
near
→ detailed grass + filler

mid
→ cheaper grass representation + filler

far
→ very cheap filler / reduced representation
```

Cel nie polega na globalnym zwiększeniu density szczegółowej trawy.

Zamiast tego dalszy dystans powinien używać tańszej reprezentacji, dzięki czemu można zwiększyć wizualne pokrycie terenu bez proporcjonalnego wzrostu liczby tris.

### Wymagania

- zachować obecne detailed grass,
- wykorzystać istniejący filler,
- rozszerzyć jego zastosowanie w ramach istniejącego LOD,
- zachować `InstancedMesh`/batching,
- zachować deterministyczny placement,
- unikać tworzenia dużej liczby niezależnych `Mesh`,
- zachować istniejące biome/species semantics,
- zapewnić płynne lub wystarczająco niewidoczne przejścia między reprezentacjami.

Nie zwiększać bezpośrednio globalnej liczby szczegółowych grass instances jako głównej metody uzyskania efektu.

Liczbę poziomów reprezentacji dobrać na podstawie istniejącego LOD i kosztu; nie zakładać z góry trzech poziomów, jeżeli prostszy wariant daje ten sam efekt.

## 3. Road — near-field surface detail

Rozszerzyć istniejący road/terrain pipeline.

### Far

Pozostawić tanią reprezentację opartą o istniejące:

- road mask/tint,
- normal/detail,
- shader variation,
- istniejące road height/pothole mechanisms.

### Mid

Wykorzystać istniejący materiał/detail normal i ewentualnie zwiększoną intensywność istniejącego detail, jeśli recon potwierdzi, że jest to korzystne.

### Near

Dodać rzeczywiste lub możliwie tanie geometryczne zróżnicowanie powierzchni drogi.

Efekt powinien sugerować:

- koleiny,
- małe zagłębienia,
- grudki,
- lokalne nierówności,
- płytkie kałuże/deformacje.

Dokładny mechanizm należy wybrać po pre-flight, preferując rozszerzenie istniejącego terrain geometry pipeline.

Jeżeli istniejąca tessellation pozwala na wystarczający vertex displacement, preferować tę metodę.

Nie tworzyć osobnego `RoadMesh`, jeśli istniejący pipeline może osiągnąć wymagany efekt.

## 4. Terrain height ownership

Zachować jednoznaczną kolejność modyfikacji wysokości:

```
base terrain height
→ existing road height adjustment
→ near-road detail
→ final terrain vertex
```

Nie tworzyć dwóch niezależnych źródeł road height.

Jeżeli near-road detail modyfikuje rzeczywistą wysokość terenu, zweryfikować wpływ na wszystkie systemy korzystające z terrain height.

Jeżeli gameplay nie powinien uwzględniać drobnych nierówności wizualnych, preferować rozwiązanie pozwalające zachować gameplay height niezależnie od render detail.

## 5. Configuration

Nowe funkcje muszą być sterowane przez istniejący system konfiguracji grafiki/quality.

Dodać odpowiednie ustawienia umożliwiające niezależne:

### Grass

- włączenie/wyłączenie filler LOD,
- konfigurację dystansu,
- konfigurację density/coverage,
- ewentualnie dobór poziomu reprezentacji.

### Road

- włączenie/wyłączenie near detail,
- konfigurację dystansu,
- konfigurację intensywności/detail strength,
- ewentualnie poziom geometry detail.

Nazwy i struktura powinny zostać dopasowane do istniejącego `WorldConfig` i quality settings po reconie.

Nie tworzyć osobnego systemu konfiguracji.

Wyłączenie feature powinno możliwie zachowywać dotychczasowy rendering/pipeline.

## 6. Chunk i streaming safety

Zapewnić:

- brak seamów między chunkami,
- deterministyczny road deformation,
- deterministyczny grass placement,
- brak visual popping wynikającego z niedeterministycznego rebuild,
- poprawne usuwanie starej geometrii przy regeneracji,
- poprawne działanie przy streamingu chunków,
- brak zależności od kolejności generowania chunków.

Szczególną uwagę zwrócić na granice chunków dla proceduralnych road deformations.

## 7. Weryfikacja i benchmark — użytkownik

Benchmark oraz browser/manual verification wykonuje użytkownik, nie agent AI.

Agent powinien przygotować implementację tak, aby można było łatwo wykonać A/B comparison przez konfigurację.

Użytkownik powinien porównać co najmniej:

### Grass

1. baseline,
2. filler LOD ON,
3. różne poziomy coverage.

### Road

1. baseline,
2. road detail ON,
3. różne near-detail distances,
4. różne detail strengths.

### Combined

1. oba feature OFF,
2. grass ON / road OFF,
3. grass OFF / road ON,
4. oba ON.

Weryfikować zarówno scenę oglądaną z bliska, jak i reprezentatywną scenę z większym dystansem oraz widokiem wzdłuż drogi.

Obserwować:

- FPS/frame time,
- GPU frame cost,
- CPU chunk generation,
- triangle/vertex count,
- grass instance count,
- draw calls,
- ewentualny overdraw/material cost,
- visual popping/seams.

Nie traktować benchmarku AI jako warunku ukończenia; wynik benchmarku i browser verification pozostaje po stronie użytkownika.

## 8. Non-goals

Plan nie obejmuje:

- nowego systemu vegetation,
- nowego systemu road meshes,
- przebudowy całego terrain LOD,
- motion blur,
- depth of field,
- innych post-process effects,
- globalnego zwiększenia jakości terrain,
- przebudowy gameplay/navigation height systemu bez uzasadnionej potrzeby.

Preferować rozszerzenie istniejących mechanizmów.

## 9. Implementation order

1. Focused pre-flight aktualnego codebase.
2. Potwierdzenie ownership terrain height i chunk boundaries.
3. Grass filler LOD.
4. Road near-detail — wybranie najtańszego rozwiązania zgodnego z istniejącym pipeline.
5. Integracja z configuration/quality presets.
6. Sprawdzenie chunk streaming/regeneration i granic chunków.
7. Cleanup oraz JSDoc dla istotnych funkcji/klas architektonicznych, z `@domain`, jeśli potrzebne dla preflight discovery.
8. Przygotowanie do manualnego benchmarku A/B przez użytkownika.
9. Aktualizacja wymaganych automatycznie generowanych indeksów/dokumentacji.

## Kryterium ukończenia

Seedvale posiada:

- wyraźnie bogatsze wizualne pokrycie trawą na różnych dystansach,
- tanią reprezentację dalszej trawy,
- bardziej naturalne i nierówne drogi oglądane z bliska,
- zachowany tani rendering dalszej drogi,
- brak seamów i problemów ze streamingiem chunków,
- konfigurację pozwalającą niezależnie wyłączyć oba ulepszenia,
- przygotowany, jednoznaczny A/B setup do manualnego benchmarku użytkownika.

Najważniejsze kryterium projektowe:

> **Większa jakość wizualna ma wynikać z właściwego wyboru reprezentacji zależnie od dystansu, a nie z globalnego zwiększania kosztu geometrii.**

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Plan: Terrain-aware procedural placement

**Created:** 2026-08-20  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** M  
**Depends on:** none

## Cel

Rozwinąć istniejący placement obiektów tak, aby obiekty i proceduralne struktury naturalnie dostosowywały się do nierównego terenu, zamiast wymagać sztucznego wyrównywania terenu.

Podstawowa zasada:

> **Nie wyrównujemy terenu pod obiektem. Obiekt dostosowuje się do terenu zgodnie ze swoją funkcją i budową.**

## Stan obecny

Istnieje już wspólny `evaluateGroundPlacement()` oraz `placeOnGround()`. Placement korzysta z `sampleHeight(x, z)`, ale obecnie `placeOnGround()` ustawia obiekt względem pojedynczej wysokości `Y`.

`evaluateGroundPlacement()` traktuje nadmierne nachylenie jako powód odrzucenia placementu, zamiast umożliwiać obiektowi adaptację do zbocza.

## Kierunek rozwiązania

Wprowadzić wspólny mechanizm **terrain-aware placement**, ale bez jednego uniwersalnego algorytmu dla wszystkich obiektów.

Typ obiektu określa strategię adaptacji.

### Domy

Dom może mieć fundament dopasowujący się do terenu.

- drzwi/wejście muszą znajdować się na poziomie gruntu,
- fundament może częściowo wejść w teren,
- przy większym spadku może być widoczna większa część fundamentu,
- nie należy wyrównywać całego terenu pod domem.

### Płaskie obiekty

Obiekty takie jak tarasy, pomosty czy inne konstrukcje mogą dopasowywać orientację do lokalnego nachylenia.

- analizować teren pod footprintem,
- wyznaczyć lokalną płaszczyznę,
- dopasować `rotation.x/z`,
- zachować ograniczenie maksymalnego nachylenia, jeśli obiekt tego wymaga.

### Pola uprawne

Pole nie powinno być traktowane jako jedna idealnie płaska powierzchnia.

Zamiast tego:

- dzielić pole na małe segmenty/parcele/rzędy,
- każdy segment otrzymuje własną wysokość,
- segment może mieć niewielkie własne nachylenie,
- całość nadal wygląda jak jedno pole, ale naturalnie podąża za terenem.

### Drogi

Drogi powinny podążać za terenem:

- reprezentować przebieg jako punkty/spline,
- próbkować wysokość terenu wzdłuż przebiegu,
- płynnie dopasowywać wysokość,
- unikać gwałtownych zmian nachylenia.

### Małe obiekty

Kamienie, drzewa, krzaki i podobne elementy powinny korzystać z lokalnej wysokości terenu w swoim punkcie.

## Kamienny krąg

Kamienny krąg powinien być **proceduralnie generowany z pojedynczych kamieni**, a nie traktowany jako jeden płaski obiekt.

Dla każdego kamienia:

1. wyliczyć pozycję na okręgu,
2. pobrać `sampleHeight(x, z)`,
3. ustawić własne `Y`,
4. opcjonalnie dopasować `rotation.x/z` do lokalnego terenu,
5. zachować niezależną orientację i losowe różnice.

Dzięki temu krąg na zboczu nie będzie miał połowy kamieni wiszących w powietrzu.

## Cmentarz

Cmentarz również powinien być proceduralną strukturą złożoną z pojedynczych elementów.

Wprowadzić warianty:

- **SM** — mały cmentarz,
- **MD** — średni,
- **LG** — duży.

Obecny wariant SM jest zbyt mały i zbyt gęsty.

Rozmiar powinien kontrolować przede wszystkim:

- footprint,
- liczbę miejsc/grobów,
- odstępy,
- układ alejek,
- liczbę nagrobków.

Nie powinno to być jedynie skalowanie obecnego małego cmentarza.

Każdy grób/nagrobek powinien być umieszczany niezależnie względem terenu, podobnie jak kamienie w kręgu.

## Wspólny mechanizm

Wykorzystać istniejące:

- `sampleHeight()`,
- `placeOnGround()`,
- istniejący ground placement.

Rozszerzenie powinno być możliwie małe i nie tworzyć równoległego systemu placementu.

Docelowo wspólne narzędzia powinny umożliwiać:

```text
terrain samples
      ↓
local terrain analysis
      ↓
placement strategy
      ↓
position + rotation + local adaptation
```

Strategia powinna zależeć od rodzaju obiektu, zamiast wymuszać jedną regułę dla wszystkich.

## Zakres

- przeanalizować istniejące proceduralne struktury i placement,
- rozszerzyć wspólne utility tylko tam, gdzie faktycznie są potrzebne,
- dodać terrain-aware placement dla elementów składowych,
- poprawić kamienny krąg,
- dodać SM/MD/LG dla cmentarza i poprawić jego obecny SM,
- zastosować niezależne pozycjonowanie elementów względem terenu,
- zachować deterministyczne generowanie,
- nie dodawać terraforming/platform systemu.

## Weryfikacja

Sprawdzić na:

- płaskim terenie,
- łagodnym zboczu,
- mocniejszym zboczu,
- terenie z lokalnym dołkiem/wzniesieniem,
- kamiennym kręgu,
- cmentarzu SM/MD/LG.

Szczególnie sprawdzić, czy żaden pojedynczy element proceduralnej struktury nie pozostaje zawieszony nad terenem.

**Zrób git commit i push do main, rebase jeżeli trzeba**

## Implementacja (2026-08-22)

Zakres zawężony zgodnie z implementation notes: tylko `stoneCircle` i `cemetery`. Domy/drogi/pola pozostają odłożone.

- `src/settlement/propUtils.ts` — nowe współdzielone narzędzia: `sampleLocalTerrain` (wysokość + normalna z próbek centralnej różnicy), `applyTerrainTilt` (przechylenie z clampem), `rotateOffsetY`. `evaluateGroundPlacement()`/`placeOnGround()` nie zostały zmienione.
- `src/settlement/decorProps.ts` — `createStoneCircle`/`createCemetery` przyjmują opcjonalny `TerrainPlacementContext`; każdy kamień/nagrobek próbkuje teren w swojej dokładnej pozycji świata zamiast dziedziczyć jedną wysokość grupy. Yaw całej struktury jest teraz wypiekany w offsety elementów (nie w `group.rotation.y`), bo elementy muszą znać prawdziwą pozycję świata przed próbkowaniem. Clamp przechylenia: kamienie 20°, nagrobki 12°.
- Nowy `CemeterySize` (`SM`/`MD`/`LG`) — realny układ blok/rząd/kolumna/alejka (`CEMETERY_LAYOUTS`), nie skalowanie jednego layoutu. SM 1 blok 3×3, MD 2 bloki 3×3 z alejką, LG 3 bloki 4×3 z alejkami. Rozmiar losowany deterministycznie per chunk (`rollCemeterySize`, wagi 50/35/15%) w `chunkEnvironment.ts`, z osobnym marginesem od krawędzi chunka na rozmiar (6/9/14).
- `src/terrain/chunkManager.ts` — `stoneCircle`/`cemetery` idą teraz osobną ścieżką przekazującą `sampleTileHeight`/`rotationY`/pozycję świata do konstruktorów zamiast jednego `prop.rotation.y` + `placeOnGround` na całą grupę.

**Techniczna weryfikacja:** `tsc --noEmit`, `lint:fix`, `build`, `test` (182 pliki, 1606 testów) — zielone. Nowe testy: `src/settlement/decorProps.test.ts` (grounding każdego elementu we własnej pozycji świata, determinizm, wzrost footprintu/liczby grobów SM<MD<LG), `rollCemeterySize` w `chunkEnvironment.test.ts`.

**Weryfikacja wizualna/manualna:** nie wykonana w tej sesji (brak dostępu do przeglądarki) — do sprawdzenia przez użytkownika na żywym dev serverze: kamienny krąg i cmentarze SM/MD/LG na płaskim terenie, łagodnym i mocniejszym zboczu, kilka seedów, granice chunków, brak zawieszonych/zapadniętych elementów.

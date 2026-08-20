# Plan: Terrain-aware procedural placement

**Created:** 2026-08-20  
**Status:** `planned` 📋  
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

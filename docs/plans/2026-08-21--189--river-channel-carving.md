# Plan: River Channel Carving

**Created:** 2026-08-21  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** 181
**domain:** `world-terrain`

## Cel

Rozbudować istniejący system `river network`, aby rzeki i strumienie **kształtowały teren i tworzyły własne naturalne koryta**.

Obecnie sieć rzeczna wyznacza przebieg i generuje powierzchnię wody, ale nie modyfikuje wysokości terenu. W efekcie woda może być płaska względem otaczającego terenu, a lokalne różnice wysokości mogą powodować wizualny efekt płynięcia pod górę.

Docelowo:

```text
terrain
   ↓
river network / D8 flow
   ↓
river carving
   ↓
natural channel with continuous downhill slope
   ↓
river water at channel bottom
```

## Zakres

Dotyczy całej istniejącej sieci:

- małe strumienie,
- średnie rzeki,
- większe rzeki.

Nie tworzymy osobnego systemu dla strumieni i rzek.

Rozmiar i głębokość koryta powinny wynikać z istniejących danych hydrologicznych, przede wszystkim `flow/accumulation` oraz istniejącego `flowFactor()`.

Przykładowa zależność:

```text
small flow
→ narrow + shallow channel

medium flow
→ wider + deeper channel

large flow
→ wider + deeper channel / stronger surrounding shaping
```

## Najważniejsze wymagania

### 1. Rzeka kształtuje teren

Koryto powinno być rzeczywistą modyfikacją wysokości terenu.

Nie wystarczy:

- przesunąć ribbonu w dół,
- obniżyć wyłącznie powierzchnię wody,
- zastosować stały `Y offset`.

Teren powinien zostać lokalnie obniżony wzdłuż przebiegu rzeki.

### 2. Naturalny profil poprzeczny

Koryto powinno mieć łagodny profil:

```text
terrain        terrain
   \\              /
    \\            /
     \\__________/
        water
```

Środek koryta jest najniższy, a teren stopniowo przechodzi w brzegi.

Nie tworzyć ostrego, sztucznego rowu.

### 3. Ciągły spadek

Najważniejszy warunek:

**dno rzeki musi zachowywać spadek w kierunku przepływu.**

Jeżeli istniejący terrain zawiera lokalny wzrost wysokości, river carving musi odpowiednio obniżyć teren, aby dno koryta nie prowadziło pod górę.

Nie należy jednak sztucznie spłaszczać całego otoczenia — korekta powinna być możliwie lokalna.

### 4. Zachowanie istniejącej sieci

Nie zmieniać bez potrzeby:

- D8 hydrology,
- accumulation,
- river tile ownership,
- chain generation,
- cross-chunk continuity,
- deterministic meandering,
- istniejącego `flowFactor()`.

River carving ma być kolejnym etapem istniejącego pipeline'u.

## Integracja z terrain

Przed implementacją dokładnie przeanalizować aktualny pipeline wysokości:

- `sampleFloorAt()`,
- `chunkHeightmap.ts`,
- `floorHeights`,
- `sampleApronGrid`,
- generowanie terrain mesh,
- `ChunkManager`,
- istniejące modyfikatory terenu.

Wybrać rozwiązanie, które pozwala zastosować river carving **podczas generowania wysokości terenu**, zamiast tworzyć drugą, równoległą reprezentację całego świata.

Preferowana architektura:

```text
base terrain height
      ↓
existing terrain modifiers
      ↓
river channel modifier
      ↓
final terrain height
```

River carving nie powinien powodować zależności od kolejności ładowania chunków.

## Wysokość dna

Nie należy bezpośrednio ufać lokalnej wysokości terenu jako wysokości dna.

Dla każdego chaina należy wyznaczyć odpowiednią wysokość kanału wzdłuż kierunku przepływu.

Przykładowo:

```text
hydrology chain
A → B → C → D → E

channel elevation:
100 → 99.2 → 98.7 → 97.9 → 97.1
```

Jeżeli teren ma:

```text
100 → 99.2 → 99.8 → 97.9
```

należy lokalnie wykonać carving tak, aby koryto nie miało:

```text
99.2 → 99.8
```

ale zachowało ciągły spadek.

Nie należy jednak sztucznie spłaszczać całego otoczenia — korekta powinna być możliwie lokalna.

## Głębokość koryta

Głębokość powinna zależeć od wielkości cieku.

Wykorzystać istniejące dane zamiast tworzyć nową klasyfikację.

Preferowane źródło:

```text
flow / accumulation
        ↓
flowFactor()
        ↓
channel width + channel depth
```

Parametry powinny mieć ograniczenia (`min/max`), aby pojedynczy ekstremalny accumulation nie wygenerował absurdalnego kanionu.

## Szerokość koryta

Szerokość koryta powinna być powiązana z istniejącą szerokością rzeki.

Nie tworzyć niezależnej wartości, która może wizualnie rozmijać się z istniejącym river ribbon.

Docelowo:

```text
river geometry width
        ↕
terrain channel width
```

powinny korzystać ze wspólnego źródła parametrów.

## Meandrowanie

Carving powinien odbywać się wzdłuż **tego samego, już istniejącego meandrującego chaina**, który wykorzystuje rendering rzeki.

Nie generować drugiej ścieżki meandrowania.

To zapewni:

```text
terrain channel
      =
river water
```

## Chunk / river tile continuity

To jeden z kluczowych wymogów.

Koryto musi być ciągłe:

- między chunkami,
- między river tiles,
- przy granicach core rectangle,
- przy unload/load chunków.

Nie może powstać widoczny uskok wysokości na granicy chunk/tile.

River tile pozostaje kanonicznym źródłem przebiegu rzeki.

Jeżeli carving wymaga próbkowania sąsiedniego obszaru, wykorzystać istniejące halo / apron mechanizmy zamiast tworzyć kolejny system sąsiedztwa.

## Determinizm

Wynik musi być deterministyczny.

Dla:

```text
same world seed
+ same world position
+ same river tile
```

wynik carvingu musi być identyczny niezależnie od:

- kolejności ładowania chunków,
- tego, który chunk pierwszy poprosił o river tile,
- liczby wcześniejszych aktualizacji.

Nie używać `Math.random()`.

## Wydajność

Nie wykonywać globalnego carvingu całego świata.

Carving powinien być:

- lokalny,
- kompatybilny z chunk streamingiem,
- możliwy do wyliczenia podczas generowania chunku,
- oparty na istniejących danych river tile.

Nie dodawać Web Workera bez pomiaru.

Najpierw wykorzystać istniejący pipeline terrain.

## Woda

Po utworzeniu koryta powierzchnia wody powinna znajdować się **na dnie koryta**, a nie być niezależną płaską warstwą.

Ponownie przeanalizować obecny:

- `RIVER_SURFACE_OFFSET`,
- `riverGeometry.ts`,
- wysokość ribbonu względem `sampleApronGrid`.

Nie usuwać obecnego rozwiązania bez powodu.

Celem jest:

```text
terrain bank
     \\
      \\____ water surface
           \\____
                \\
                 terrain
```

a nie:

```text
terrain ─────────────────
             water ──────
```

## Czego nie robić

Nie:

- przebudowywać `hydrology.ts` bez potrzeby,
- zastępować D8 innym systemem,
- tworzyć osobnego systemu streamów,
- generować drugiej ścieżki rzeki,
- generować drugiego systemu meandrowania,
- modyfikować całego terenu w dużym promieniu,
- rozwiązywać problemu wyłącznie przez shader,
- maskować problemu kolejnym `Y offset`,
- dodawać waterfall system,
- dodawać LOD,
- dodawać workerów bez uzasadnienia pomiarem,
- wykonywać niezwiązanych refaktorów.

## Testy

Dodać lub rozszerzyć testy dla:

- monotonicznego spadku dna rzeki,
- deterministyczności carvingu,
- zależności szerokości/głębokości od flow,
- profilu poprzecznego koryta,
- ciągłości na granicach river tiles,
- ciągłości na granicach chunków,
- braku wpływu carvingu na obszary poza ustalonym promieniem koryta.

Istniejące testy hydrologii i river network muszą nadal przechodzić.

## Weryfikacja

Wykonać standardowe:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run build
pnpm run test
```

Następnie wykonać browser/manual verification na kilku seedach.

Sprawdzić szczególnie:

- małe strumienie,
- średnie rzeki,
- większe rzeki,
- strome tereny,
- doliny,
- okolice gór,
- granice chunków,
- granice river tiles,
- miejsca, gdzie wcześniej rzeka wizualnie płynęła pod górę.

Wizualnie oczekujemy **naturalnego koryta wyciętego w terenie**, a nie tylko lepiej wyglądającej powierzchni wody.

## Kryterium ukończenia

Feature jest ukończony, gdy:

- rzeki i strumienie mają rzeczywiste koryta,
- dno koryta zachowuje spadek zgodny z kierunkiem przepływu,
- większy przepływ daje odpowiednio większe koryto,
- woda znajduje się na dnie koryta,
- teren i woda pozostają zgodne z tym samym river chain,
- koryta są ciągłe między chunkami i river tiles,
- rozwiązanie jest deterministyczne,
- nie powstał równoległy system hydrologiczny,
- istniejące testy i build przechodzą,
- browser verification potwierdza poprawność wizualną.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

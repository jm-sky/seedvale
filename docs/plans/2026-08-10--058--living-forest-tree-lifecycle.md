# Żywy las i cykl życia drzew — v1

**Status:** `verification needed`
**Created:** 2026-08-10
**Next:** [057 — Siekiera i ścinanie drzew przez gracza](./2026-08-10--057--axe-player-tree-harvesting.md)

## Cel

Sprawić, aby las był żywym zasobem świata, a nie statyczną dekoracją.

Drzewa powinny:

- pojawiać się również jako `saplings`,
- rosnąć przez kolejne etapy,
- reagować na warunki środowiska,
- konkurować o światło z dużymi drzewami,
- być ścinane przez NPC,
- pozostawiać widoczny ślad po ścięciu,
- z czasem regenerować się.

Najważniejszy efekt:

> NPC ścina drzewo → świat faktycznie się zmienia → młode drzewa dostają więcej światła → las z czasem odbudowuje się.

## Stan obecny

`src/terrain/chunkVegetation.ts` generuje deterministyczną roślinność per chunk. Drzewa mają już warianty/gatunki i część placementów jest wizualnie mała, ale 058 ma nadać temu **rzeczywisty lifecycle**, a nie tylko losową skalę.

Istnieją już informacje środowiskowe, które można wykorzystać jako wejścia do wzrostu, m.in. wysokość, `continentalness`, `mountainRidge`, `moistureRegion` oraz biome weights.

`src/world/dayNight.ts` dostarcza world time / time of day, ale nie ma jeszcze pełnego systemu sezonów.

Nie ma obecnie osobnego systemu `groundwater`. Nie tworzyć go wyłącznie dla 058.

## Kluczowa decyzja: TreeState

Proceduralny placement i runtime state muszą być rozdzielone.

```text
world seed + chunk + placement identity
                ↓
        deterministic tree
                ↓
            TreeState
                ↓
 GrowthModel + WorldTime + Environment
                ↓
         visual representation
```

Przykładowy stan:

```text
TreeState
├── stable id
├── species
├── growth stage
├── growth progress / timestamp
├── harvested state
└── regrowth state
```

Nie przechowywać w stanie danych, które można ponownie wyliczyć z seed + pozycji.

Renderer nie powinien być właścicielem lifecycle drzewa.

## Cykl życia

Pierwsza wersja ma od początku zawierać naturalne `saplings`.

```text
sapling
   ↓
young
   ↓
mature
   ↓
harvested
   ↓
stump / dead wood
   ↓
regrowth
   ↓
sapling
```

### Saplings

Saplings są normalną częścią proceduralnego lasu już w v1. Nie ograniczać ich wyłącznie do miejsc po ściętych drzewach.

Mogą pojawiać się:

- w pobliżu dużych drzew,
- w lukach w lesie,
- jako naturalne młode drzewa podczas proceduralnej generacji.

### Growth stages

Minimum:

- `sapling` — małe drzewko,
- `young` — wyraźnie rosnące drzewo,
- `mature` — pełnowymiarowe drzewo.

Nie trzeba tworzyć nowych assetów dla każdego etapu. Można wykorzystać istniejące modele i skalę, o ile sylwetka pozostaje czytelna.

## Wzrost zależny od środowiska

Wzrost nie powinien być prostym timerem:

```text
age += dt
if age > X → mature
```

Preferowany model:

```text
species
× sunlight
× soil
× biome
× moisture / water availability
× optional groundwater
× optional season
× age
        ↓
    growth rate
        ↓
 growth progress / stage
```

Środowisko **modyfikuje tempo wzrostu**, a nie tylko przełącza `grow / don't grow`.

### Gleba

Na początku wykorzystać istniejące informacje terenu/biomu/moisture. Nie tworzyć pełnego systemu gleby tylko dla drzew.

W przyszłości `soilType` / `soilQuality` może stać się wspólnym wejściem dla drzew, pól i gospodarstw.

### Biome

Istniejące biome weights powinny wpływać na wzrost.

Przykładowo:

```text
forest / humid grassland → dobry wzrost
swamp → zależnie od gatunku
arid / desert → mocne spowolnienie
high mountain → mocne spowolnienie / ograniczony maksymalny wzrost
```

Preferencje powinny należeć do gatunku, a nie być rozrzuconymi wyjątkami typu `if desert`.

### Groundwater

Jeżeli w przyszłości powstanie parametr `groundwater`, `GrowthModel` powinien móc go wykorzystać.

Nie implementować groundwater w 058.

### Seasons

Seasons istnieją jako osobny przyszły kierunek (plan 040), ale nie są wymagane do implementacji 058.

`GrowthModel` powinien mieć miejsce na sezonowy modifier bez tworzenia pełnego systemu seasons w ramach tego planu.

## Konkurencja o światło

Małe drzewo może pojawić się obok dużych drzew, ale nie powinno automatycznie dorosnąć do ich rozmiaru.

Duże drzewa ograniczają dostęp do światła.

Nie tworzyć fizycznej symulacji promieni światła. W v1 wystarczy lokalny model `canopy / competition` oparty na zagęszczeniu większych drzew.

Usunięcie jednego dużego drzewa powinno więc potencjalnie zmienić przyszłość sąsiednich drzew.

## Naturalne pojawianie się saplings

W pierwszej wersji saplings powinny być częścią proceduralnej roślinności.

Późniejszy system może dodawać naturalne rozsiewanie, ale nie jest wymagane, aby v1 potrafiło jeszcze dynamicznie tworzyć nowe saplings w każdym ticku.

Ważne jest, aby architektura nie zakładała, że każde drzewo istnieje wyłącznie dlatego, że zostało zasadzone po harvestingu.

## Harvesting przez NPC

Istniejący behavior NPC należy rozszerzyć, a nie zastępować nowym systemem AI.

```text
NPC potrzebuje / zbiera drewno
        ↓
wybiera dostępne mature tree
        ↓
idzie do drzewa
        ↓
harvest
        ↓
TreeState → harvested
        ↓
existing item/resource flow
```

Harvesting powinien być koncepcyjnie wspólną akcją świata, z której później skorzysta gracz.

```text
HarvestAction
├── NPC
└── Player (057)
```

Nie tworzyć osobnego `NpcTreeChopping` i później `PlayerTreeChopping`.

## Widoczny ślad

Po ścięciu drzewo nie powinno po prostu zniknąć.

Minimum:

- pień/stump,
- brak korony,
- opcjonalnie proste pozostałości drewna.

## Regrowth

Regeneracja jest częścią cyklu, ale nie musi oznaczać pełnej symulacji botaniki.

Stan powinien być możliwy do wyliczenia z czasu świata:

```text
TreeState.lastTransitionAt
        ↓
WorldTime
        ↓
GrowthModel
        ↓
current stage
```

Nie wykonywać `update()` dla każdego drzewa co frame.

Po dłuższym time skipie / ponownym uruchomieniu świata stan powinien wynikać z danych i czasu, a nie z konieczności zasymulowania każdej klatki.

## Chunk streaming

Obecny placement jest proceduralny i per chunk. Runtime lifecycle nie może resetować drzewa podczas unload/load.

```text
chunk load
  → deterministic placement
  → stable tree id
  → apply TreeState override
  → render current stage

chunk unload
  → remove Three.js objects
  → preserve sparse state

chunk reload
  → same tree identity
  → same lifecycle state
```

Nie przechowywać wszystkich drzew całego świata jako aktywnych obiektów.

Preferować **sparse overrides** tylko dla drzew, których stan odbiega od proceduralnego defaultu.

## Persistence

Stan drzewa zmieniony przez świat musi przetrwać streaming i save/load.

Na obecnym etapie projektu nie wymagamy kompatybilności ze starymi save'ami. Można rozszerzyć aktualny save schema bez migracji poprzednich wersji.

Loading saved data powinien być odporny na niezgodny/uszkodzony format: jeżeli deserializacja lub walidacja save'a zakończy się błędem, obsłużyć to przez `try/catch` i rozpocząć nowy/defaultowy stan świata zamiast blokować uruchomienie gry.

Rozdzielić:

```text
procedural state
= seed + tree identity

runtime override
= harvested / stage / relevant timestamp
```

Nie zapisywać każdego drzewa tylko dlatego, że istnieje.

## Performance & workers

Zgodnie z [Performance & Simulation Architecture](../architecture/performance-and-workers.md):

- brak per-frame symulacji wszystkich drzew,
- growth powinien być event-driven, batchowany lub lazy,
- lokalne zapytania zamiast globalnego skanowania,
- ciężkie obliczenia danych mogą zostać wykonane w workerze,
- Three.js objects pozostają na main thread,
- worker nie jest wymagany dla pojedynczego harvestingu.

Jeżeli canopy/growth zacznie być kosztowny dla tysięcy drzew, preferowany jest batch danych per chunk / region w istniejącym worker pipeline zamiast tysięcy małych komunikatów worker ↔ main thread.

Nie stosować O(n²) porównywania wszystkich drzew.

## Poza zakresem v1

- player tree harvesting — plan 057,
- siekiera jako tool — plan 057,
- pełny system seasons — plan 040,
- groundwater simulation,
- pełny system gleby,
- choroby i naturalne katastrofy,
- realistyczna fizyka upadku drzewa,
- crafting,
- pełna ekonomia drewna,
- barter/trade,
- przebudowa inventory.

## Kryteria akceptacji

### Lifecycle

- proceduralny las zawiera saplings już w v1,
- sapling może przejść `sapling → young → mature`,
- mature tree może zostać harvested przez NPC,
- harvesting tworzy widoczny stump/pozostałość,
- drzewo może rozpocząć regrowth.

### Environment

- wzrost zależy od środowiska, a nie tylko od czasu,
- biome/moisture/terrain mogą wpływać na growth rate,
- duże drzewa ograniczają wzrost młodych drzew,
- usunięcie dużego drzewa może poprawić warunki sąsiadów,
- model jest gotowy na przyszłe `soil`, `groundwater` i `season` modifiers.

### Streaming

- unload/load chunku nie resetuje lifecycle drzewa,
- procedural placement i runtime state są rozdzielone,
- nie powstaje globalna lista wszystkich aktywnych drzew.

### Persistence

- harvested/growth state survives save → Continue,
- niezgodny lub uszkodzony save nie blokuje startu gry; ładowanie kończy się bezpiecznym fallbackiem do defaults/new game.

### Performance

- brak per-frame update wszystkich drzew,
- brak globalnego O(n²),
- ciężka symulacja może być batchowana / workerowana,
- Three.js pozostaje na main thread.

### Visual

- sapling, young i mature są czytelnie różne,
- miejsce po harvestingu jest widoczne,
- zmiana lasu po działalności NPC jest zauważalna podczas eksploracji.

## Kolejność implementacji

1. Zbadać obecny placement drzew w `chunkVegetation.ts` i właściciela runtime vegetation.
2. Zaprojektować stabilne tree identity.
3. Wprowadzić minimalny `TreeState` / sparse override.
4. Zapewnić proceduralne saplings jako prawdziwy lifecycle stage.
5. Dodać `mature → harvested → stump` dla NPC.
6. Podłączyć harvest yield do istniejącego inventory/resource flow.
7. Dodać `sapling → young → mature` i `GrowthModel`.
8. Dodać biome/terrain/moisture modifiers.
9. Dodać lokalny canopy/sunlight modifier.
10. Dodać regrowth zależny od WorldTime.
11. Zweryfikować streaming i persistence.
12. Dopiero później integrować seasons/groundwater.

## Zasada projektowa

> **Las nie jest dekoracją. Las jest żywym zasobem.**
>
> Rośnie → jest wykorzystywany → zmienia świat → regeneruje się.

Najważniejszym rezultatem v1 nie jest realistyczna botanika. Jest nim stworzenie systemu, w którym działalność NPC pozostawia ślad, a środowisko wpływa na to, jak świat rozwija się dalej.

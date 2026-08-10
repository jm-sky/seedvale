# Żywy las i cykl życia drzew — v1

## Cel

Sprawić, aby las był żywym zasobem świata, a nie wyłącznie statyczną dekoracją.

Drzewa powinny:
- rosnąć,
- konkurować o światło i przestrzeń,
- reagować na warunki środowiska,
- być ścinane przez NPC,
- pozostawiać widoczny ślad po harvestingu,
- z czasem regenerować się.

Docelowy efekt:

> NPC ścina drzewo → las faktycznie się zmienia → młode drzewa mogą dostać więcej światła → po czasie las zaczyna się odbudowywać.

To ma być pierwszy wyraźny przykład świata, w którym **zasób ma własny cykl życia i działalność NPC pozostawia trwały, widoczny ślad**.

---

## Stan obecny repozytorium

### Proceduralna roślinność już istnieje

`src/terrain/chunkVegetation.ts` generuje deterministyczne placementy roślinności per chunk. Korzysta z world seed, chunk coordinates, terrain sampling, wysokości, nachylenia, `continentalness`, `mountainRidge`, `moistureRegion`, biome weights i road tint. Drzewa mają warianty gatunków oraz losową skalę; część drzew jest już celowo generowana jako małe saplingi. fileciteturn15file0L2-L2

### Biomy / środowisko już istnieją

`biomeRegions.ts` dostarcza miękkie wagi `desert`, `swamp` i `forest` na podstawie `moistureRegion` oraz wysokości. fileciteturn17file0L2-L2

`ChunkTileData` zawiera już m.in. wysokość, `continentalness`, `mountainRidge`, `moistureRegion` i `roadTint`, więc jest właściwą bazą do oceny środowiska drzewa. fileciteturn16file0L2-L2

### Czas świata istnieje, ale pór roku jeszcze nie ma

`src/world/dayNight.ts` posiada ciągły `timeOfDay`, długość dnia i `timeMultiplier`, ale obecny model czasu opisuje tylko cykl dobowy. Nie ma jeszcze osobnego modelu roku/sezonów. fileciteturn20file0L2-L2

### Woda gruntowa

W aktualnie sprawdzonych danych terenu nie ma osobnego, gotowego parametru `groundwater` przeznaczonego do symulacji wzrostu drzew.

Nie należy tworzyć pełnego systemu wód gruntowych wyłącznie dla tego planu. Jeśli w przyszłości powstanie taki system, `GrowthModel` powinien móc wykorzystać jego wartość jako jeden z modifierów.

### Natural resources

`src/terrain/naturalResources.ts` już posiada deterministyczne środowiskowe zasoby świata i korzysta z tych samych osi terenu/biomów. Aktualny model jest warstwą danych zasobów, a nie pełnym systemem collectible world objects. fileciteturn24file0L2-L2

Plan 032 jest kontekstem dla przyszłego ekonomicznego znaczenia drewna, ale 050 odpowiada za **życie drzewa jako obiektu świata**, nie za pełną ekonomię. fileciteturn23file19L96-L100

### Inventory już istnieje

Według aktualnego `docs/STATE.md` `Inventory` i `ItemKind` istnieją, inventory jest zapisywane, a system dropped items/collectibles jest już obecny. Pełna ekonomia wioski, crafting i barter nadal są odłożone. fileciteturn26file0L2-L2

### NPC

NPC ma już potrzeby i logikę zachowania, a istniejące fundamenty obejmują `NpcAgent`, `Needs` oraz system `Place`/schedule. Pełna role-driven daily routine jest jednak nadal częściowo zaimplementowana. fileciteturn26file0L2-L2

---

## Kluczowa decyzja architektoniczna

**Drzewo nie może pozostać wyłącznie statycznym `VegetationPlacement`.**

Obecny placement opisuje proceduralną obecność drzewa. Lifecycle wymaga dodatkowo stanu świata, np.:

```text
TreeWorldState
├── stable id
├── species
├── position
├── growth stage
├── growth progress / growth timestamp
└── harvested / regrowth state
```

Nie należy przechowywać w stanie rzeczy, które można deterministycznie odtworzyć z world seed + pozycji.

Preferowany model:

```text
world seed + position
        ↓
initial tree identity / species / placement
        ↓
TreeState
        ↓
GrowthModel + WorldTime + Environment
        ↓
visual stage
```

Renderer ma pokazywać stan drzewa. Nie powinien być właścicielem jego logiki życia.

---

## Cykl życia

Minimalny cykl:

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

Nie wszystkie etapy muszą mieć osobne modele GLB. Najważniejsza jest czytelność wizualna.

- `sapling` — małe drzewko,
- `young` — wyraźnie rosnące drzewo,
- `mature` — pełnowymiarowe drzewo,
- `harvested` — pień / pozostałość,
- `regrowth` — ponowne pojawienie się młodego drzewa.

W pierwszej wersji można wykorzystać istniejące modele drzew i ich skalę, zamiast tworzyć nowy zestaw assetów.

---

## Wzrost nie jest timerem

Drzewo nie powinno mieć prostego:

```text
age += dt
if age > X → mature
```

Zamiast tego tempo wzrostu powinno wynikać z warunków:

```text
species
× sunlight
× soil
× biome
× groundwater
× season
× age
        ↓
 growth rate
        ↓
 growth stage / progress
```

> **Środowisko modyfikuje tempo wzrostu. Nie jest prostym przełącznikiem „rośnie / nie rośnie”.**

Dzięki temu drzewo może żyć w trudnych warunkach, ale rosnąć znacznie wolniej.

---

## Światło i konkurencja drzew

Młode drzewo może pojawić się obok dużych drzew, ale nie powinno automatycznie dorastać do ich rozmiaru.

Duże drzewa ograniczają dostęp do światła.

W v1 nie tworzyć pełnej fizycznej symulacji światła. Wystarczy lokalny model canopy/competition oparty na zagęszczeniu większych drzew.

Przykładowa koncepcja:

```text
brak dużych drzew w promieniu
    → wysoki sunlight modifier

kilka dużych drzew
    → średni modifier

gęsty canopy
    → niski modifier
```

Kluczowy efekt emergentny:

```text
🌳 🌳 🌱 🌳
🌳 🌱 🌱 🌳

NPC wycina 🌳

🌳    🌱 🌳
🌳 🌱 🌱

        ↓

więcej światła
        ↓

młode drzewa zaczynają szybciej rosnąć
```

To jest ważniejsze niż dokładna fizyka światła.

### Wydajność

Nie sprawdzać wszystkich drzew ze wszystkimi drzewami.

Preferować lokalne zapytanie przestrzenne / grid / istniejący mechanizm chunkowy. Jeżeli obecna architektura nie posiada odpowiedniej struktury, najpierw zaprojektować prosty indeks per chunk zamiast globalnego O(n²) scan.

---

## Gleba

Wzrost powinien mieć możliwość uwzględnienia jakości/typu gleby.

Na obecnym etapie nie należy tworzyć pełnej symulacji gleby tylko dla drzew.

Można zacząć od istniejących informacji środowiskowych:
- biome,
- moisture,
- altitude,
- terrain character.

Później można wprowadzić jawny `soilQuality` / `soilType`, jeżeli będzie potrzebny również polom i gospodarstwom.

`GrowthModel` nie powinien zakładać, że gleba musi być osobnym systemem już w v1.

---

## Biomy

Istniejące biome weights powinny wpływać na wzrost.

Przykładowo:

```text
forest / humid grassland → dobry growth modifier
swamp → dobry dla wybranych gatunków
arid / desert → mocne spowolnienie
high mountain → mocne spowolnienie / brak mature dla niektórych gatunków
```

Nie robić globalnego `desert → tree = false`, chyba że konkretny gatunek rzeczywiście nie może występować w danym środowisku.

Preferencje powinny być wartościami gatunku:

```text
species → preferred environment
```

zamiast globalnych wyjątków rozsianych po kodzie.

---

## Woda gruntowa

Woda gruntowa jest **przyszłym wejściem**, nie wymaganiem dla pierwszej implementacji.

Jeżeli w przyszłości pojawi się np.:

```text
groundwater 0..1
```

może wpływać na:

```text
growthRate *= groundwaterModifier
```

Nie budować groundwater systemu w ramach 050.

---

## Pory roku

Pory roku nie istnieją jeszcze w aktualnym systemie czasu.

Nie należy tworzyć pełnego systemu seasons tylko po to, aby drzewa mogły rosnąć.

Należy jednak przygotować `GrowthModel` tak, aby przyjmował opcjonalny environmental modifier sezonowy.

Docelowo:

```text
spring → bardzo dobry wzrost
summer → dobry wzrost / zależny od wilgotności
autumn → spowolnienie
winter → minimalny lub zerowy wzrost
```

Przyszły system sezonów powinien rozszerzyć istniejący model world time, a nie zostać zaszyty w `Tree`.

---

## Naturalna śmierć

W v1 głównym sposobem usunięcia dojrzałego drzewa jest harvesting przez NPC.

Architektura nie powinna jednak zakładać, że:

```text
removed tree === harvested tree
```

W przyszłości możliwe są starzenie, choroby, susza, burze, naturalne przewrócenie i śmierć drzewa.

Nie implementować tego jeszcze.

---

## Harvesting przez NPC

Istniejące zachowania NPC powinny zostać rozszerzone, a nie zastąpione nowym systemem AI.

Docelowy przepływ:

```text
NPC wybiera pracę / potrzebę drewna
        ↓
znajduje dostępne mature tree
        ↓
idzie do drzewa
        ↓
harvest
        ↓
TreeState → harvested
        ↓
wood + N
        ↓
NPC / storage
```

Ważne:

- harvested tree nie może natychmiast ponownie stać się celem,
- NPC powinien wybierać drzewa dostępne w aktualnym świecie,
- harvesting musi zmieniać faktyczny stan drzewa,
- zasób drewna powinien być przekazany do istniejącego modelu item/inventory, jeżeli aktualny flow na to pozwala.

Pełny system storage/economy pozostaje poza zakresem.

---

## Widoczny ślad po harvestingu

To jeden z głównych celów planu.

Po ścięciu powinno pozostać coś, co gracz widzi:
- pień,
- ewentualnie małe kawałki drewna,
- brak pełnej korony/drzewa.

Nie trzeba jeszcze tworzyć fizycznych dropped items, jeśli prostszy stump wystarczy do przekazania informacji.

Cel:

> „Tutaj ktoś niedawno ściął drzewo.”

---

## Regeneracja

Regeneracja powinna być niezależna od obecności gracza.

Preferowany model czasu:

```text
TreeState.lastTransitionAt
        ↓
WorldTime
        ↓
GrowthModel
        ↓
aktualny stage
```

Nie wykonywać kosztownego `update()` dla każdego drzewa co frame.

Jeżeli świat zostanie wyłączony na dłużej, stan drzewa powinien być możliwy do wyliczenia z zapisanego czasu/stanu zamiast wymagania symulacji każdej klatki.

---

## Streaming chunków

To jest kluczowy problem implementacyjny.

Obecna roślinność jest generowana per chunk i może być ponownie odtworzona deterministycznie. Lifecycle drzewa wprowadza stan, którego nie można bezrefleksyjnie resetować podczas unload/load.

Wymagania:

```text
chunk load
  → odtwórz deterministic placement
  → zastosuj TreeState override
  → renderuj aktualny stage

chunk unload
  → usuń renderowane obiekty
  → zachowaj / możliwie odtwórz stan świata

chunk reload
  → to samo drzewo
  → ten sam lifecycle state
```

Nie należy od razu przechowywać wszystkich drzew całego świata w pamięci.

Preferowany kierunek to stabilne ID drzewa wynikające z seed + przestrzennej tożsamości placementu oraz sparse state tylko dla drzew, których stan odbiega od domyślnego proceduralnego stanu.

---

## Persistence

Aktualny save zapisuje wiele elementów świata, ale pełny runtime state NPC nie jest jeszcze serializowany jako kompletna symulacja. `docs/STATE.md` opisuje aktualny stan persistence. fileciteturn26file0L2-L2

Dla drzew v1 należy rozdzielić:

### Stan proceduralny

Odtwarzalny z:

```text
world seed + tree identity
```

### Stan zmieniony przez świat

Np.:

```text
harvestedAt
stage
```

Nie zapisywać każdego drzewa tylko dlatego, że istnieje.

Docelowo save powinien przechowywać tylko sparse overrides / changed tree states.

Jeżeli pełne zapisanie tree lifecycle wymaga rozszerzenia save schema, należy zaplanować to jawnie zamiast wprowadzać ukryty globalny cache.

---

## Nie budować jeszcze pełnego ekosystemu

### Poza zakresem

- pełny system sezonów,
- groundwater simulation,
- choroby drzew,
- pogoda wpływająca na drzewa,
- realistyczna fotosynteza,
- pełna symulacja gleby,
- pełny model populacji lasu,
- crafting,
- ekonomia wioski,
- barter/trade,
- inventory redesign,
- player tree harvesting,
- natural disasters.

---

## Naturalne rozszerzenia przygotowane przez ten plan

### Inne gatunki

Każdy gatunek może mieć własne tempo wzrostu, maksymalny rozmiar, tolerancję cienia, preferencje biome/soil, zapotrzebowanie na wodę i długość życia.

### Pola i uprawy

Ten sam wzorzec może później obsłużyć:

```text
seed → growing → mature → harvested
```

### Owoce / drzewa owocowe

Możliwy kolejny poziom:

```text
tree mature
 ↓
fruiting
 ↓
harvest
 ↓
regrowth
```

### Las jako zasób gospodarczy

```text
forest
 ↓
wood supply
 ↓
NPC production
 ↓
consumption
 ↓
trade
```

To powinno zostać jednak w przyszłych planach economy/resources, nie w 050.

---

## Kryteria akceptacji

### Lifecycle

- Drzewo ma stabilną tożsamość w świecie.
- Drzewo może przejść przez minimum `sapling → young → mature`.
- Harvest zmienia drzewo w widoczny stan pozostałości.
- Pozostałość nie jest natychmiast ponownie harvestowalna.
- Drzewo może rozpocząć regrowth.

### Growth model

- Wzrost nie jest wyłącznie timerem.
- Warunki środowiskowe wpływają na tempo wzrostu.
- Duże drzewa ograniczają wzrost młodych drzew w swoim sąsiedztwie.
- Usunięcie dużego drzewa może poprawić warunki wzrostu pobliskich młodych drzew.
- Biome/altitude/moisture mogą wpływać na growth modifier.
- Model ma miejsce na przyszły groundwater i season modifier bez ich implementowania w 050.

### NPC

- NPC może wykonać istniejącą akcję harvestingu na dojrzałym drzewie.
- Harvest generuje drewno w istniejącym modelu item/inventory tam, gdzie jest to już możliwe.
- NPC nie próbuje bez końca harvestować tego samego drzewa.

### Streaming

- Unload/load chunku nie resetuje drzewa do pełnej postaci.
- Proceduralny placement i runtime state są rozdzielone.
- Nie powstaje globalna lista wszystkich renderowanych drzew.

### Performance

- Brak O(n²) globalnego porównywania wszystkich drzew.
- Brak per-frame symulacji każdego drzewa.
- Growth jest oceniany przy zmianie stanu / w kontrolowanych tickach / na żądanie.

### Visual

- Gracz może łatwo odróżnić mature tree, młode drzewo i miejsce po harvestingu.
- Zmiana lasu po działalności NPC jest widoczna podczas eksploracji.

---

## Zalecana kolejność implementacji

1. Zbadać aktualny lifecycle vegetation w `chunkVegetation.ts` / `chunkManager.ts` i ustalić właściciela runtime tree state.
2. Nadać drzewom stabilną tożsamość wynikającą z proceduralnego placementu.
3. Wprowadzić minimalny `TreeState` / sparse world override.
4. Dodać `mature → harvested → stump`.
5. Podłączyć harvesting NPC do zmiany `TreeState`.
6. Podłączyć wood yield do istniejącego inventory/item flow.
7. Dodać `sapling → young → mature`.
8. Dodać `GrowthModel` z biome/terrain modifiers.
9. Dodać lokalny canopy/sunlight modifier.
10. Dodać regrowth zależny od WorldTime.
11. Zweryfikować chunk streaming i persistence.
12. Dopiero później rozważyć seasons, groundwater i bardziej szczegółową ekologię.

---

## Zasada projektowa

> **Las nie jest dekoracją. Las jest żywym zasobem.**
>
> Rośnie → jest wykorzystywany → zmienia świat → regeneruje się.

Najważniejszym rezultatem v1 nie jest realistyczna symulacja botaniki.

Jest nim stworzenie pierwszego systemu, w którym gracz może zobaczyć:

**„NPC zrobił coś w świecie, świat to zapamiętał, a później sam zaczął reagować na tę zmianę.”**

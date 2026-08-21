# Plan: Deep Forest Biome & Forest Generation Overhaul

**Created:** 2026-08-21
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~063~~

## Cel

Rozbudować istniejący system lasów tak, aby świat generował **duże, zwarte i wyraźnie stare kompleksy leśne**, w tym rozpoznawalny typ biomu **Deep Forest**.

Deep Forest ma być rzeczywistym typem biomu, możliwym do jednoznacznego rozpoznania przez inne systemy, np. Questy, ale jego rozmieszczenie ma nadal wynikać z istniejących pól świata i `forestDensityAt()`, a nie z równoległego generatora.

Efekt docelowy:

```text
teren otwarty
    ↓
pojedyncze drzewa
    ↓
rzadki las
    ↓
las
    ↓
głęboki las
    ↓
las
    ↓
rzadki las
    ↓
teren otwarty
```

Granice powinny być naturalne i ciągłe, a nie wynikać z prostych granic chunków.

---

## 1. Stan obecny

Istniejący system już posiada większość potrzebnych fundamentów:

* `src/terrain/biomeRegions.ts`

  * `biomeWeightsAt()`
  * `forestDensityAt()`
* `src/terrain/chunkVegetation.ts`

  * deterministyczne rozmieszczanie roślinności,
  * `forestDensityAt()` jako główny czynnik zagęszczenia,
  * world-space `clumpNoise`,
  * world-space `meadowNoise`,
  * istniejący dobór wieku i rozmiaru drzew.
* `src/world/treeLifecycle.ts`

  * `TreeLivingAge`,
  * `TreeSizeClass`,
  * `rollLivingAge()`,
  * `rollSizeClass()`.
* istniejący system instancingu/batchowania roślinności.
* istniejący system habitat suitability dla zwierząt korzystający z leśnej charakterystyki terenu.
* istniejące natural resources, w tym naturalna żywność.

Nie należy tworzyć równoległego systemu generowania lasów.

---

# 2. Model biomów leśnych

Rozszerzyć istniejącą klasyfikację biome'ów o jawny typ:

```ts
deepForest
```

lub równoważny istniejącemu modelowi typów biome'ów.

### Zasada

`forestDensityAt()` pozostaje podstawową ciągłą charakterystyką środowiska.

Na jej podstawie następuje klasyfikacja:

```text
forestDensity
    0 ──────────────── 1
    │        │        │
  open    forest   deepForest
```

Dokładne progi należy dobrać na podstawie istniejących wartości i testów wizualnych, zamiast przyjmować arbitralne liczby bez sprawdzenia rozkładu.

### Wymagania

`deepForest`:

* musi być deterministyczny,
* musi być spójny przez granice chunków,
* musi być możliwy do odczytania przez inne systemy,
* nie może wymagać utrzymywania osobnej mapy/gridu,
* powinien wynikać z tych samych world-space inputs co obecny forest density.

Nie tworzyć osobnego `deepForestNoise`, jeśli istniejące pola wystarczają do uzyskania pożądanego efektu.

---

# 3. Duże, zwarte kompleksy leśne

Obecny system należy rozszerzyć tak, aby wysoka wartość leśności tworzyła **większe ciągłe obszary**, a nie tylko chunki z większą liczbą drzew.

Wykorzystać istniejące world-space pola:

* moisture,
* continentalness,
* altitude,
* mountain ridge,
* `forestDensityAt()`,
* istniejący `clumpNoise`.

Nie wprowadzać chunk-local randomizacji określającej typ lasu.

### Ważne

Kompleks leśny powinien móc przechodzić przez wiele chunków:

```text
chunk → chunk → chunk → chunk
██████████████████████
██████████████████████
██████████████████████
```

bez widocznych granic wynikających z generowania chunków.

---

# 4. Zagęszczenie drzew

Obecny mechanizm:

```text
forestDensity
    ↓
candidate budget
    ↓
local density acceptance
    ↓
tree placement
```

należy zachować.

Nie zwiększać bez potrzeby globalnego budżetu drzew.

Deep Forest powinien być gęstszy przede wszystkim poprzez lepsze wykorzystanie istniejącego budżetu i zmianę charakterystyki drzew.

### Deep Forest

W Deep Forest:

* większość zaakceptowanych kandydatów powinna być drzewami,
* acceptance rate powinien być wysoki,
* spacing nadal powinien mieć naturalną wariancję,
* `clumpNoise` powinien tworzyć skupiska,
* istniejące meadow/clearing noise powinno umożliwiać lokalne przerzedzenia.

Nie dążyć do matematycznie jednolitego spacingu.

---

# 5. Wiek i rozmiar drzew

Wykorzystać istniejący lifecycle drzew zamiast tworzyć nowy system.

Obecnie istnieją:

* `TreeLivingAge`,
* `TreeSizeClass`,
* `rollLivingAge()`,
* `rollSizeClass()`.

### Deep Forest

W Deep Forest należy zwiększyć prawdopodobieństwo:

* dużych drzew,
* starych drzew.

Rozważyć dodanie poziomu:

```text
VeryOld
```

jeżeli obecne poziomy nie dają wystarczająco dużych/starych drzew.

`VeryOld` powinno być wyłącznie rozszerzeniem istniejącego lifecycle.

Nie tworzyć osobnego `DeepForestTreeState`.

### Charakterystyka

Przykładowowo:

```text
open / normal forest:
sapling → young → mature → old

deep forest:
young → mature → old → very old
             ↑       ↑
           częściej częściej
```

Dokładne prawdopodobieństwa dobrać po obejrzeniu istniejącego rozkładu wieku.

---

# 6. Korony i ograniczenie światła

Celem jest wizualne pokazanie, że w głębi lasu światło dociera znacznie słabiej do ziemi.

Nie implementować fizycznej symulacji światła.

Wykorzystać istniejący rendering drzew i środowiska.

### Deep Forest powinien wizualnie osiągać:

* większe korony,
* większe nakładanie się koron,
* mniejszą ilość widocznego nieba,
* ciemniejszy wizualnie poziom gruntu,
* wyraźniejszy kontrast między Deep Forest a terenem otwartym.

Jeżeli obecne modele drzew mają odpowiednie warianty, wykorzystać istniejące assety.

Nie dodawać ciężkiego systemu per-tree shadow/light evaluation.

---

# 7. Naturalne polany i przerzedzenia

Wykorzystać istniejący `meadowNoise`.

Polany powinny wynikać z lokalnej zmienności lasu:

```text
deep forest
████████████████
██████░░████████
████░░░░░░██████
██████░░████████
████████████████
```

a nie z osobnego ręcznie generowanego systemu clearingów.

### Wymagania

* polany mogą przekraczać granice chunków,
* nie powinny być idealnie okrągłe,
* powinny mieć różną wielkość,
* nie powinny występować równomiernie,
* powinny naturalnie zanikać na obrzeżach lasu.

Istniejące meadow placement można dostosować, jeśli obecna implementacja nie daje wystarczającego efektu.

---

# 8. Powalone drzewa / deadwood

Dodać wizualne/environmental deadwood do dojrzałych i głębokich lasów.

Na początek:

**bez nowego systemu zasobów.**

Powalone drzewa:

* są elementem środowiska,
* nie są nowym źródłem drewna,
* nie wymagają interakcji gracza,
* nie wymagają osobnego lifecycle.

### Rozmieszczenie

Prawdopodobieństwo powinno rosnąć wraz z charakterystyką starego lasu:

```text
open        → prawie brak
forest      → trochę
deep forest → wyraźnie obecne
```

Powalone drzewa powinny:

* być deterministyczne,
* korzystać z istniejącego mechanizmu vegetation/prop placement, jeśli jest odpowiedni,
* być tanie renderowo,
* nie tworzyć tysięcy osobnych `Object3D`.

Jeżeli odpowiedni asset już istnieje, wykorzystać go.

---

# 9. Przejście las → teren otwarty

Nie tworzyć sztucznej granicy biome'u.

Jawny `deepForest` służy do **klasyfikacji**, natomiast wizualne przejście nadal powinno wynikać z ciągłej wartości `forestDensity`.

Czyli:

```text
deepForest
  ↓
wysoka forestDensity
  ↓
forest
  ↓
malejąca forestDensity
  ↓
scattered trees
  ↓
open terrain
```

Dzięki temu:

* Quest może powiedzieć „jesteś w Deep Forest”,
* renderer nie musi nagle przełączać całego chunku,
* granice pozostają naturalne.

---

# 10. Fauna

Nie tworzyć specjalnego systemu fauny Deep Forest.

Istniejące zwierzęta powinny nadal korzystać z istniejącego habitat system.

W szczególności wykorzystać istniejące mechanizmy dla:

* saren,
* wilków,
* innych zwierząt związanych z lasem.

Deep Forest może być traktowany jako szczególnie dobra forma istniejącego leśnego habitat, ale **nie ma wymogu zwiększania liczby zwierząt**.

Nie dodawać:

```ts
deepForestWolfSpawnRate
deepForestDeerSpawnRate
```

itp., jeśli nie okaże się to konieczne dla istniejącego systemu.

---

# 11. Naturalna żywność

Wykorzystać istniejący system natural resources.

Istniejące leśne zasoby, np. jagody, powinny móc występować w odpowiednich obszarach leśnych.

Nie tworzyć:

```ts
DeepForestBerrySystem
```

Zamiast tego istniejący system powinien otrzymać możliwość rozróżnienia/uwzględnienia `deepForest`, jeśli obecny habitat/resource suitability tego wymaga.

Celem jest:

```text
Deep Forest
    ↓
natural habitat
    ↓
istniejące zwierzęta
    +
istniejąca naturalna żywność
```

a nie nowa, równoległa ekologia.

---

# 12. Questy i inne systemy

Jawny typ `deepForest` ma być dostępny jako **world query**.

Przykładowo:

```ts
getBiomeAt(x, z)
```

lub rozszerzenie istniejącego mechanizmu.

Dzięki temu Quest może później użyć:

```text
find location in deepForest
```

bez analizowania:

* liczby drzew,
* noise,
* moisture,
* wieku drzew.

Klasyfikacja biomu powinna mieć jedno źródło prawdy.

---

# 13. Wydajność

To jest istotny element planu.

Nie dopuszczać do sytuacji:

```text
Deep Forest
→ 5× więcej drzew
→ 5× więcej draw calls
→ duży spadek FPS
```

### Zachować

* istniejące `InstancedMesh`,
* regionalne batchowanie,
* worker-side deterministic placement,
* lazy chunk generation,
* istniejące mechanizmy LOD/culling, jeśli są dostępne.

### Preferować

* więcej wariantów istniejących drzew zamiast ogromnego wzrostu liczby drzew,
* większe drzewa zamiast wielu dodatkowych małych,
* tanie deadwood,
* ograniczenie liczby materiałów,
* brak per-tree `Object3D`,
* brak nowych drogich shaderów per tree.

### Szczególnie sprawdzić

* draw calls,
* triangles,
* pamięć instancji,
* czas generowania chunk vegetation,
* czas attach/render vegetation,
* FPS w dużym Deep Forest.

---

# 14. Deterministyczność i chunk boundaries

Całość musi być deterministyczna względem:

```text
world seed
+ world position
```

Nie względem kolejności ładowania chunków.

Dotyczy to:

* Deep Forest classification,
* tree placement,
* tree age,
* tree size,
* clearings,
* deadwood.

Deep Forest i jego struktura muszą być identyczne niezależnie od tego, czy gracz:

1. załaduje chunk A,
2. potem B,

czy:

1. załaduje B,
2. potem A.

---

# 15. Prawdopodobne zmiany w kodzie

Do dokładnego potwierdzenia podczas implementacji, ale główne miejsca to:

```text
src/terrain/biomeRegions.ts
```

Rozszerzenie klasyfikacji biome'u o Deep Forest.

```text
src/terrain/chunkVegetation.ts
```

Dostosowanie:

* candidate/acceptance density,
* rozkładu wieku i rozmiaru,
* forest/open transition,
* deadwood placement.

```text
src/world/treeLifecycle.ts
```

Ewentualne dodanie `VeryOld` i odpowiedniego rozkładu.

```text
src/terrain/chunkEnvironment.ts
```

Jeżeli istniejący environment/prop pipeline będzie właściwym miejscem dla deadwood.

```text
src/terrain/naturalResources.ts
```

Tylko jeżeli istniejący system natural food wymaga jawnego rozpoznania Deep Forest.

```text
src/terrain/... / biome query
```

Rozszerzenie istniejącego API klasyfikacji biomów, aby Deep Forest był dostępny dla Questów i innych systemów.

Nie zakładać nowych plików ani nowych managerów przed sprawdzeniem aktualnej architektury.

---

# 16. Kolejność implementacji

### Etap 1 — klasyfikacja

1. Przeanalizować aktualne wartości `forestDensityAt()`.
2. Dodać `deepForest` do istniejącego modelu biome'ów.
3. Ustalić progi na podstawie rzeczywistego rozkładu.
4. Udostępnić jednolite `biomeAt`/równoważne zapytanie.
5. Zweryfikować ciągłość przez chunk boundaries.

### Etap 2 — struktura lasu

1. Dostosować density/acceptance dla Deep Forest.
2. Zachować istniejący `clumpNoise`.
3. Wykorzystać istniejący meadow noise do przerzedzeń.
4. Sprawdzić przejście Deep Forest → Forest → Open.

### Etap 3 — stare drzewa

1. Przeanalizować istniejące `TreeLivingAge` i `TreeSizeClass`.
2. Zwiększyć udział dużych/starych drzew w Deep Forest.
3. Jeśli potrzeba — dodać `VeryOld`.
4. Dobrać rozmiar i rozkład tak, aby las wizualnie wyglądał na stary, bez dużego zwiększania liczby instancji.

### Etap 4 — canopy / światło

1. Wykorzystać istniejące właściwości modeli drzew.
2. Dostosować ich dobór/rozmiar w Deep Forest.
3. Uzyskać wizualnie znacznie mniej światła na poziomie gruntu.
4. Bez fizycznej symulacji światła.

### Etap 5 — deadwood

1. Sprawdzić dostępne assety.
2. Dodać deterministyczne powalone drzewa.
3. Powiązać ich prawdopodobieństwo z leśnością/wiekiem.
4. Wykorzystać istniejący batching/instancing.

### Etap 6 — integracja świata

1. Sprawdzić habitat fauna.
2. Umożliwić istniejącemu systemowi natural food uwzględnienie Deep Forest tam, gdzie ma to sens.
3. Nie zmieniać ogólnego modelu populacji zwierząt.
4. Udostępnić biome query dla Questów.

### Etap 7 — tuning wydajnościowy

Porównać:

```text
open terrain
normal forest
deep forest
```

pod kątem:

* liczby drzew,
* draw calls,
* triangles,
* FPS,
* czasu generowania vegetation,
* pamięci instancji.

Jeżeli Deep Forest jest zbyt drogi, najpierw redukować **liczbę instancji**, zachowując większe drzewa i canopy.

---

# 17. Poza zakresem

Nie implementować w tym planie:

* krzaków/podszycia jako osobnego systemu,
* nowych zwierząt,
* zwiększonej populacji zwierząt wyłącznie dla Deep Forest,
* nowych zasobów z deadwood,
* wycinki drzew,
* gospodarki leśnej,
* fizycznego modelu światła,
* pełnej symulacji ekologicznej,
* nowych systemów questów,
* nowych systemów natural food,
* multiplayer-specific forest state.

---

# 18. Kryteria ukończenia

Plan jest spełniony, gdy:

* istnieje jawny `Deep Forest` biome,
* Deep Forest można jednoznacznie wykryć przez world query,
* duże kompleksy leśne mogą zajmować wiele chunków,
* granice lasu są naturalne,
* istnieją wyraźne różnice wizualne między Forest i Deep Forest,
* Deep Forest ma większy udział dużych/starych drzew,
* korony tworzą wyraźnie gęstszy canopy,
* poziom gruntu jest wizualnie ciemniejszy,
* występują naturalne polany/przerzedzenia,
* występują powalone drzewa,
* deadwood nie tworzy nowego systemu zasobów,
* istniejące spawn pointy zwierząt nadal działają,
* istniejąca naturalna żywność może występować w odpowiednim leśnym habitat,
* nie ma widocznych granic chunków w strukturze lasu,
* placement pozostaje deterministyczny,
* rendering nadal korzysta z istniejącego instancingu/batchingu,
* Deep Forest nie powoduje nieakceptowalnego wzrostu kosztu renderowania.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

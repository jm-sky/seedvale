# Plan: Terrain generation overhaul — naturalniejsze ukształtowanie terenu

**Status:** `planned`
**Created:** 2026-08-11
**Priority:** 🔴 high
**Effort:** L–XL
**Depends on:** ~~001~~, ~~006~~, ~~007~~, ~~028~~

## Cel

Poprawić proceduralne generowanie terenu tak, aby świat wyglądał bardziej naturalnie:

* mniej przypadkowych ostrych górek i dołków,
* łagodniejsze wzgórza i doliny,
* bardziej naturalne przejścia pomiędzy równinami, wzgórzami i górami,
* zachowanie dużych struktur świata: oceanów, wybrzeży, nizin, wyżyn i pasm górskich,
* zachowanie deterministyczności względem `seed`,
* brak regresji w chunk streaming, worker generation, wodzie, drogach i osadach.

Najważniejsza zasada:

> **Nie tworzymy nowego generatora terenu. Ulepszamy istniejący model wysokości tak, aby makrostruktura świata była naturalna, a lokalny detal nie dominował nad dużymi formami terenu.**

---

## Stan obecny

Główny generator znajduje się w:

```text
src/terrain/chunkHeightmap.ts
```

Generator wykorzystuje obecnie kilka niezależnych pól:

```text
continentalness
      ↓
ocean / coast / lowland / highland

mountainness
      ↓
mountain gate

Worley ridge
      ↓
mountain ridge shape

detail FBM + warp
      ↓
lokalne ukształtowanie

moistureRegion
      ↓
biome regions
```

Istnieją również dodatkowe modyfikacje wysokości wykonywane później dla:

* dróg,
* ścieżek,
* clearingów wiosek,
* regionalnego wygładzania terenu wokół wiosek.

Generator jest już worker-safe i używany przez istniejący worker pool. Nie należy tworzyć drugiego pipeline'u generowania terenu.

`fbm01()` obsługuje obecnie:

* octaves,
* persistence,
* lacunarity,
* exponentiation.

`exponentiation > 1` dodatkowo zmienia rozkład wysokości, spłaszczając niższe wartości i zwiększając kontrast wyższych partii.

Aktualne wartości bazowe obejmują m.in.:

```text
heightScale: 18
noiseScale: 72
FBM:
  octaves: 5
  persistence: 0.55
  lacunarity: 2.0
  exponentiation: 2.4

continentScale: 2200
mountainScale: 1800
mountainThreshold: 0.62
worleyCellSize: 260
ridgeSharpness: 2.2
mountainGain: 0.75
```

Wartości te powinny być traktowane jako punkt wyjścia do strojenia, a nie jako założenia, które muszą pozostać bez zmian.

---

# Problem

Obecny teren jest funkcjonalny, ale miejscami:

* lokalne wzniesienia są zbyt ostre,
* pojawiają się małe, nienaturalne dołki,
* wysokość zmienia się zbyt gwałtownie,
* lokalny detal może tworzyć formy wyglądające jak przypadkowe „pagórki”,
* niektóre obszary nie mają wystarczająco czytelnej hierarchii:

  * duża forma terenu,
  * średnie wzgórza,
  * mały detal.

Problem należy rozpatrywać jako **problem rozkładu częstotliwości i amplitudy terenu**, a nie po prostu jako „zmniejszyć wysokość gór”.

---

# Projekt rozwiązania

## 1. Rozdzielić wyraźniej skalę terenu

Preferowana struktura:

```text
WORLD SCALE
    │
    ├── continent / ocean
    │
    ├── mountain regions
    │
    ├── hills / valleys
    │
    └── local terrain detail
```

Każda warstwa powinna mieć wyraźnie określoną rolę.

Nie należy zwiększać liczby octaves tylko po to, aby teren wyglądał bardziej szczegółowo.

Więcej szczegółu nie oznacza bardziej naturalnego terenu.

---

## 2. Ograniczyć wpływ lokalnego FBM na makroformy

Zweryfikować obecny wpływ:

```text
detail FBM
×
continent bias
×
mountain contribution
```

i doprowadzić do sytuacji, w której lokalny noise nie może łatwo zniszczyć dużej formy terenu.

Szczególnie należy sprawdzić:

* amplitude lokalnego FBM,
* `noiseScale`,
* `persistence`,
* `lacunarity`,
* `exponentiation`,
* wpływ warp,
* sposób łączenia detail terrain z `continentBiasSpline`.

Preferowana zasada:

```text
makroteren określa formę
        ↓
średnia skala dodaje wzgórza/doliny
        ↓
mały noise tylko uzupełnia powierzchnię
```

---

## 3. Dodać / wydzielić warstwę hills & valleys, jeśli analiza kodu potwierdzi potrzebę

Jeżeli obecny detail FBM próbuje jednocześnie odpowiadać za:

* wzgórza,
* doliny,
* drobny teren,

należy rozdzielić te odpowiedzialności.

Preferowany model:

```text
macroHeight
    +
regionalTerrain
    +
localDetail
```

gdzie `regionalTerrain` ma niższą częstotliwość i większą przestrzenną ciągłość niż obecny lokalny detail.

Nie tworzyć jednak osobnego noise tylko dlatego, że „tak jest czyściej”. Jeżeli obecny `height + warp + FBM` można dostroić do tego samego efektu, preferowana jest prostsza zmiana.

---

## 4. Zmiękczyć doliny i lokalne dołki

Zweryfikować obecne mapowanie wartości FBM.

Szczególnie należy sprawdzić, czy `exponentiation` nie powoduje zbyt dużej asymetrii wysokości.

Testować warianty:

```text
exponentiation ≈ 1
exponentiation ≈ 1.2
exponentiation ≈ 1.5
exponentiation ≈ 2
```

Nie zakładać z góry konkretnej wartości.

Celem jest uzyskanie:

```text
      hill
    /      \
___/        \____
              \
               \__
```

zamiast:

```text
       /\
      /  \
_____/    \___
       \/
       /\
______/  \____
```

---

## 5. Ograniczyć ostrość gór do faktycznych regionów górskich

Istniejący system `mountainThreshold` + `mountainRidge` + Worley noise jest dobrym fundamentem i powinien pozostać.

Należy jednak zweryfikować:

* `mountainThreshold`,
* `mountainThresholdWidth`,
* `worleyCellSize`,
* `ridgeSharpness`,
* `mountainGain`.

Góry powinny być:

* szerokimi formami,
* czytelnymi z większej odległości,
* mniej podobnymi do losowych pojedynczych szczytów.

Jednocześnie nie należy całkowicie wygładzać gór — wyraźne, bardziej strome formy są pożądane w faktycznych regionach górskich.

---

# 6. Naturalne przejścia

Szczególną uwagę poświęcić przejściom:

```text
plain → hills
hills → mountains
mountains → highland
land → coast
coast → ocean
```

Nie powinny powstawać nagłe zmiany gradientu.

Istniejące `smoothstep` dla makro-regionów należy zachować i wykorzystać jako wzorzec.

Jeżeli potrzeba dodatkowego blendu, preferować:

```text
smoothstep / lerp
```

zamiast hard thresholdów.

---

# 7. Zachować istniejące makro-osie

Nie usuwać ani nie scalać bez mocnego powodu:

```text
continentalness
mountainRidge
moistureRegion
```

Są one wykorzystywane również przez inne systemy świata.

W szczególności `moistureRegion` jest już częścią systemu biomów, więc poprawa heightmapy nie powinna zmienić jego znaczenia.

Plan 028 pozostaje źródłem prawdy dla biomów.

---

# 8. Nie przenosić logiki do nowego systemu workerów

Generowanie terenu już działa przez worker pipeline.

Zmiany powinny pozostać w istniejącej architekturze:

```text
ChunkManager
    ↓
ChunkWorkerPool
    ↓
chunkHeightmap.worker.ts
    ↓
chunkHeightmap.ts
```

Nie tworzyć nowego workera ani nowego protokołu komunikacyjnego.

Koszt dodatkowych obliczeń należy ocenić względem liczby texeli generowanych dla chunku.

Zgodnie z architekturą projektu workers są właściwym miejscem dla ciężkiej, deterministycznej generacji terenu, ale nie należy dodawać komunikacji worker ↔ main thread bez potrzeby.

---

# 9. Debug GUI

Istniejący `WorldConfig` powinien pozostać głównym miejscem tuningu.

Nowe parametry należy dodawać tylko wtedy, gdy faktycznie reprezentują niezależny aspekt generatora.

Preferowane grupowanie:

```text
Terrain
  Height
    heightScale
    noiseScale

  FBM
    octaves
    persistence
    lacunarity
    exponentiation

  Regions
    continentScale
    mountainScale
    mountainThreshold
    ...
```

Nie tworzyć wielu niemających własnego znaczenia sliderów.

Wszystkie wartości wymagające eksperymentowania powinny być dostępne przez istniejący debug GUI lub łatwe do tymczasowego tuningu.

---

# 10. Deterministyczność

Dla:

```text
seed = X
```

teren musi pozostać identyczny po:

* ponownym uruchomieniu,
* zmianie chunk load/unload,
* generacji przez różne workery,
* ponownym załadowaniu tego samego chunka.

Nie wprowadzać lokalnego randomu zależnego od kolejności generowania.

Obecny model używa globalnych seedowanych noise handles i powinien pozostać oparty na tej zasadzie.

---

# 11. Interakcje z istniejącymi systemami

Zmiana wysokości terenu może wpływać na:

* grounding gracza,
* wodę,
* water bodies,
* drogi,
* ścieżki,
* clearingi wiosek,
* placement wiosek,
* roślinność,
* grass,
* nav/pathfinding,
* faunę.

Dlatego po zmianie generatora należy sprawdzić cały pipeline, a nie tylko sam mesh terenu.

Szczególnie:

```text
raw terrain
    ↓
roads / clearings
    ↓
vegetation
    ↓
grass
    ↓
settlement / NPC / fauna
```

Nie należy implementować specjalnych obejść w tych systemach tylko dlatego, że zmieniła się wysokość terenu.

---

# Testy wizualne

Testy należy wykonywać na kilku seedach.

Minimum:

```text
default seed
seed A
seed B
seed C
```

oraz na kilku odległościach od punktu startowego.

Należy oglądać:

* równiny,
* wzgórza,
* doliny,
* góry,
* wybrzeża,
* okolice wiosek,
* granice biomów.

---

# Testy techniczne

## Deterministyczność

Dla tego samego:

```text
seed + world coordinates + config
```

wynik wysokości musi być identyczny.

## Chunk seams

Nie mogą pojawić się:

* szczeliny,
* różnice wysokości na granicy chunków,
* różnice normalnych wynikające z generacji sąsiednich chunków.

## Worker

Generator musi nadal działać przez istniejący worker pool.

## Performance

Porównać przed/po:

* czas generacji chunku,
* czas generacji całego zestawu widocznych chunków,
* pamięć,
* liczbę obliczeń noise,
* czas rebuildów po zmianie konfiguracji.

Nie akceptować znaczącego wzrostu kosztu generacji bez wyraźnej poprawy wizualnej.

---

# Kryteria akceptacji

### Terrain shape

* [ ] teren wygląda naturalniej niż obecnie na kilku seedach,
* [ ] przypadkowe ostre pagórki są rzadsze,
* [ ] przypadkowe głębokie dołki są rzadsze,
* [ ] wzgórza mają większą ciągłość przestrzenną,
* [ ] doliny mają naturalniejsze kształty,
* [ ] góry pozostają wyraźnie bardziej strome od zwykłych wzgórz,
* [ ] przejścia pomiędzy formami terenu są płynne.

### World structure

* [ ] oceany i wybrzeża nadal wyglądają poprawnie,
* [ ] makro-regiony nadal są czytelne,
* [ ] istniejące biomy nie tracą swojej charakterystyki,
* [ ] teren nadal współpracuje z istniejącymi road/clearing modifications.

### Technical

* [ ] deterministyczność względem seed jest zachowana,
* [ ] chunk seams pozostają poprawne,
* [ ] worker pipeline pozostaje bez zmian architektonicznych,
* [ ] nie powstaje drugi system generowania wysokości,
* [ ] testy istniejącego terrain/chunk pipeline przechodzą.

### Performance

* [ ] brak istotnego pogorszenia czasu generacji chunków,
* [ ] brak niepotrzebnego wzrostu transferu worker ↔ main thread,
* [ ] dodatkowe warstwy noise są uzasadnione wizualnym efektem.

---

# Kolejność implementacji

1. Zrobić wizualny baseline na kilku seedach.
2. Przeanalizować aktualny `sampleRawTexel()` i dokładny sposób składania:

   * continentalness,
   * mountain,
   * ridge,
   * detail FBM,
   * warp.
3. Zidentyfikować, która warstwa odpowiada za nienaturalne ostre formy.
4. Najpierw spróbować poprawić istniejące parametry i funkcje bez dodawania nowego noise.
5. Jeżeli to niewystarczające, wydzielić osobną warstwę średniej skali dla hills/valleys.
6. Dostroić `exponentiation`, amplitudy i częstotliwości.
7. Dostroić mountain contribution i ridge shaping.
8. Zweryfikować przejścia pomiędzy skalami terenu.
9. Zweryfikować kilka seedów.
10. Zweryfikować chunk seams i deterministyczność.
11. Zweryfikować wpływ na wodę, drogi, clearingi, wioski i roślinność.
12. Zmierzyć performance.
13. Zaktualizować dokumentację i parametry debug GUI.
14. Dopiero po pozytywnej weryfikacji oznaczyć plan jako `done`.

---

# Poza zakresem

* tworzenie nowych biomów,
* przebudowa systemu `moistureRegion`,
* prawdziwa erozja hydrauliczna,
* symulacja geologiczna,
* weather/season erosion,
* dynamiczne zmiany terenu,
* przebudowa water system,
* przebudowa vegetation placement,
* przebudowa fauna spawning,
* tree lifecycle z planu 058.

---

# Przyszłe rozszerzenia

Plan powinien pozostawić możliwość późniejszego dodania:

```text
terrain
 ├── geology
 ├── erosion
 ├── soil
 ├── water flow
 └── climate
```

ale żaden z tych systemów nie powinien być tworzony w ramach tego zadania.

---

# Zasada projektowa

> **Najpierw duża forma terenu, potem wzgórza i doliny, na końcu detal.**
>
> Teren powinien wyglądać jak fragment świata, a nie jak wizualizacja funkcji noise.

# Plan: Forest regions & habitat distribution

**Status:** `planned`
**Created:** 2026-08-11
**Priority:** 🔴 high
**Effort:** L–XL
**Depends on:** ~~028~~, terrain generation, existing vegetation/tree placement

## Cel

Rozbudować generowanie lasów tak, aby świat posiadał **duże, wyraźne obszary leśne**, a nie tylko niewielkie skupiska drzew.

Las powinien być rozpoznawalną strukturą świata:

* zajmować duży, ciągły obszar,
* mieć wyraźne centrum i granice,
* zawierać wysokie drzewa,
* mieć większą gęstość drzew niż zwykłe tereny,
* posiadać naturalne przejścia pomiędzy gęstym lasem, skrajem lasu i otwartym terenem,
* tworzyć odpowiednie środowisko dla dzikiej fauny.

Najważniejsza zasada:

> **Las jest regionem środowiska, a nie przypadkowym zbiorem drzew.**

---

# Stan obecny

Seedvale posiada już system makro-regionów/biomów. Plan 028 wprowadził m.in. `moistureRegion`, który może być wykorzystywany do określania charakteru dużych obszarów świata.

Obecny system roślinności działa jednak przede wszystkim na poziomie **lokalnego placementu drzew**.

W efekcie może powstać:

```text
🌳   🌳
   🌳
🌳      🌳
      🌳
```

zamiast:

```text
        FOREST
   🌲 🌲 🌲 🌲 🌲
 🌲 🌲 🌲 🌲 🌲 🌲
🌲 🌲 🌲 🌲 🌲 🌲 🌲
🌲 🌲 🌲 🌲 🌲 🌲 🌲
 🌲 🌲 🌲 🌲 🌲 🌲
   🌲 🌲 🌲 🌲
```

Celem tego planu jest wprowadzenie **makro-skali lasu**, bez tworzenia drugiego, niezależnego systemu biomów.

---

# Projekt rozwiązania

## 1. Las jako region przestrzenny

Istniejący system biome/region powinien dostarczać podstawę do określenia, gdzie mogą występować duże obszary leśne.

Preferowany model:

```text
world coordinates
       ↓
macro climate / moisture
       ↓
forest suitability
       ↓
forest region
       ↓
tree density
```

Nie należy tworzyć całkowicie niezależnego `ForestGenerator`, który ponownie definiuje klimat świata.

Jeżeli istniejący system dostarcza odpowiednią informację, należy go rozszerzyć.

---

# 2. Wprowadzić Forest Density / Forest Suitability

Potrzebny jest ciągły sygnał opisujący:

```text
0.0 ─────────────────────── 1.0
open        edge        dense forest
```

Przykładowo:

```text
0.0–0.2   open terrain
0.2–0.4   scattered trees
0.4–0.6   forest edge
0.6–0.8   forest
0.8–1.0   dense forest
```

**Dokładne progi nie powinny być ustalane na sztywno przed testami.**

Sygnał może być wynikiem kombinacji:

* istniejącego `moistureRegion`,
* lokalnego/makro noise,
* wysokości,
* nachylenia terenu,
* istniejącego biome,
* ewentualnie dodatkowego forest noise.

---

# 3. Duże regiony zamiast losowych skupisk

Forest noise musi mieć **znacznie większą skalę przestrzenną** niż lokalny placement drzew.

Celem jest uzyskanie obszarów rzędu wielu chunków:

```text
chunk chunk chunk chunk chunk
chunk 🌲   🌲🌲🌲🌲   chunk
chunk 🌲🌲🌲🌲🌲🌲🌲 chunk
chunk 🌲🌲🌲🌲🌲🌲🌲 chunk
chunk 🌲🌲🌲🌲🌲🌲🌲 chunk
chunk      🌲🌲       chunk
```

a nie:

```text
chunk
 🌲 🌲

chunk
    🌲

chunk
 🌲  🌲 🌲
```

Skala Forest Density powinna być niezależna od skali odpowiedzialnej za drobne różnice w rozmieszczeniu pojedynczych drzew.

---

# 4. Naturalny gradient na granicy lasu

Granica lasu nie powinna być:

```text
🌳🌳🌳🌳 | trawa trawa trawa
🌳🌳🌳🌳 | trawa trawa trawa
```

Preferowany jest gradient:

```text
open
  ↓
🌳
  ↓
🌳 🌳
  ↓
🌳 🌳 🌳
  ↓
🌲 🌲 🌲 🌲
  ↓
🌲 🌲 🌲 🌲 🌲
```

Forest density powinna więc być wartością ciągłą i wpływać na prawdopodobieństwo placementu drzew.

---

# 5. Gęstość drzew

Placement drzew powinien zależeć od `forestDensity`.

Przykładowo:

```text
treeProbability =
    baseVegetationProbability
    × forestDensityModifier
```

Jednocześnie należy zachować ograniczenia wynikające z:

* terenu,
* wody,
* dróg,
* ścieżek,
* clearingów,
* istniejących obiektów,
* innych zasad vegetation placement.

Nie należy tworzyć osobnego systemu placementu tylko dla lasu.

---

# 6. Różnica pomiędzy lasem a zwykłą roślinnością

Poza lasem drzewa nadal mogą występować.

Przykład:

```text
open terrain:
    🌳        🌳
          🌳

forest edge:
    🌳 🌳   🌳 🌳
  🌳   🌳 🌳   🌳

forest:
  🌲 🌲 🌲 🌲 🌲
 🌲 🌲 🌲 🌲 🌲 🌲
  🌲 🌲 🌲 🌲 🌲
```

Nie należy więc interpretować:

```text
forestDensity == 0
```

jako:

```text
no trees
```

Las powinien zwiększać **koncentrację** drzew, a nie całkowicie definiować możliwość ich występowania.

---

# 7. Wysokie drzewa w głębi lasu

Las powinien wizualnie różnić się nie tylko liczbą drzew.

W zależności od `forestDensity` można zwiększać prawdopodobieństwo:

* większego rozmiaru drzewa,
* starszego drzewa,
* większego canopy,
* większej wysokości,
* mniejszego udziału młodych drzew.

Przykład:

```text
forestDensity
      ↓
tree maturity distribution
      ↓
young / mature / large trees
```

Nie implementować jednak tutaj pełnego lifecycle drzewa.

Plan `058` pozostaje odpowiedzialny za:

* growth,
* saplings,
* maturation,
* canopy,
* regeneration,
* tree lifecycle.

Ten plan może jedynie dostarczyć środowiskowego sygnału, który później `058` może wykorzystać.

---

# 8. Forest floor

Na tym etapie nie należy tworzyć osobnego systemu renderowania leśnego podłoża.

Las powinien jednak naturalnie współpracować z istniejącymi systemami:

* grass,
* vegetation,
* terrain materials,
* detail normals.

Ewentualne zmiany koloru/roślinności lasu powinny być rozszerzeniem istniejącego systemu biome/vegetation, a nie nowym rendererem.

---

# 9. Forest habitat

Najważniejszym przyszłym zastosowaniem `forestDensity` powinno być środowisko dla zwierząt.

Przykład:

```text
forestDensity = 0.0
    ↓
poor forest habitat

forestDensity = 0.5
    ↓
moderate habitat

forestDensity = 0.9
    ↓
excellent forest habitat
```

Dzikie zwierzęta powinny preferować miejsca:

```text
wysoka forestDensity
+
odpowiedni teren
+
odpowiednia woda/food availability
```

Poza lasem mogą nadal występować pojedyncze osobniki.

Przykładowy efekt:

```text
deep forest:
  🦌 🦌 🦌 🐗 🦌

forest edge:
  🦌 🦌

open terrain:
  🦌
```

Wartość `2–3` zwierząt poza lasem należy traktować jako **cel projektowy**, a nie koniecznie twardy globalny limit.

---

# 10. Nie implementować tutaj pełnego fauna spawning

Ten plan powinien jedynie zapewnić środowiskową informację:

```text
ForestDensity
```

lub równoważny `ForestHabitat`.

System fauny powinien później sam zdecydować, jak tę informację wykorzystać.

Nie tworzyć:

```text
if forest:
    spawn 10 wolves
else:
    spawn 2 wolves
```

To byłoby zbyt mocnym sprzężeniem systemów.

Preferowane:

```text
environment
    ↓
habitat quality
    ↓
fauna population / spawning
    ↓
animal behaviour
```

---

# 11. Zachowanie ciągłości między chunkami

Forest density musi być funkcją world coordinates, a nie lokalnego chunk RNG.

Dla sąsiednich chunków:

```text
chunk A | chunk B
```

wartość powinna płynnie przechodzić przez granicę.

Nie może powstać:

```text
🌲🌲🌲🌲 | 🌱🌱🌱
🌲🌲🌲🌲 | 🌱🌱🌱
```

tylko dlatego, że chunk został wygenerowany niezależnie.

---

# 12. Chunk generation

Jeżeli Forest Density jest potrzebne podczas vegetation placement, powinno być wyliczane w istniejącym pipeline generowania chunka.

Preferowany kierunek:

```text
chunk generation
      ↓
terrain / region data
      ↓
forest density
      ↓
vegetation placement
```

Nie tworzyć osobnego globalnego procesu skanującego wszystkie chunki w poszukiwaniu lasów.

Jest to zgodne z zasadą chunk locality i istniejącą architekturą workerów.

---

# 13. Worker / performance

Forest density powinno być tanie obliczeniowo.

Preferować:

* istniejące noise fields,
* reuse już wyliczanych wartości,
* pojedynczą dodatkową funkcję noise tylko jeśli jest rzeczywiście potrzebna.

Unikać:

* flood-fill po wielu chunkach,
* globalnego wykrywania klastrów drzew,
* runtime'owego grupowania wszystkich drzew,
* skanowania całego świata.

Jeżeli forest region może być określony bez dodatkowego noise, należy preferować takie rozwiązanie.

---

# 14. Wysokość lasów i teren

Las nie powinien pojawiać się jednakowo na każdym terenie.

Forest suitability może być ograniczana przez:

```text
steepness
altitude
water
mountain regions
```

Przykładowo:

```text
łagodna dolina       → wysoka suitability
łagodne wzgórze      → średnia/wysoka
stromy stok          → niska
wysokie góry         → bardzo niska
ocean                → 0
```

Dokładne reguły powinny wynikać z istniejących danych terrain/biome.

Nie należy tworzyć kolejnego niezależnego systemu klasyfikacji wysokości.

---

# 15. Integracja z drogami i wioskami

Istniejące:

* roads,
* paths,
* village clearings

powinny nadal mieć pierwszeństwo przed placementem drzew.

Las może istnieć wokół wioski:

```text
🌲🌲🌲🌲🌲🌲🌲
🌲🌲   🏠 🏠  🌲
🌲    🏠 🏠    🌲
🌲             🌲
🌲🌲🌲🌲🌲🌲🌲
```

ale clearing wioski powinien pozostać otwarty.

Nie należy usuwać istniejących clearing rules na rzecz forest system.

---

# 16. Wizualna hierarchia lasu

Docelowo świat powinien mieć przynajmniej trzy czytelne poziomy:

### Open terrain

```text
🌱       🌱

    🌳

🌱           🌱
```

### Forest edge

```text
🌱   🌳 🌳
  🌳 🌳 🌲
🌳 🌲 🌲 🌲
```

### Deep forest

```text
🌲 🌲 🌲 🌲 🌲
🌲 🌲 🌲 🌲 🌲
 🌲 🌲 🌲 🌲 🌲
🌲 🌲 🌲 🌲 🌲
```

Z większej odległości gracz powinien być w stanie rozpoznać:

> „Tam jest duży las.”

To jest ważniejsze niż perfekcyjna liczba drzew w pojedynczym chunku.

---

# Testy

## Seed tests

Sprawdzić minimum:

```text
default seed
seed A
seed B
seed C
```

Dla każdego:

* znaleźć kilka dużych lasów,
* sprawdzić ich rozmiar,
* sprawdzić ciągłość,
* sprawdzić granice,
* sprawdzić różne biomy.

---

## Forest size

Zweryfikować, że las może obejmować wiele sąsiednich chunków.

Nie ustalać jednego sztywnego minimalnego rozmiaru każdego lasu.

W świecie powinny występować:

* małe zagajniki,
* średnie lasy,
* duże lasy,
* okazjonalnie bardzo duże kompleksy leśne.

---

## Forest density

Sprawdzić rozkład:

```text
open
→ sparse
→ edge
→ forest
→ dense forest
```

Bez nagłych zmian.

---

## Tree height

Sprawdzić, czy duży las wizualnie wygląda na większy również dzięki:

* wysokości drzew,
* canopy,
* dojrzałości drzew.

---

## Chunk boundaries

Sprawdzić:

* brak widocznych granic forest density,
* brak różnic wynikających z kolejności generowania,
* identyczny wynik dla tego samego seed + coordinates.

---

## Existing systems

Zweryfikować:

* drogi,
* ścieżki,
* clearingi,
* wioski,
* grass,
* istniejącą roślinność,
* wodę.

---

# Kryteria akceptacji

### Forests

* [ ] świat posiada wyraźne duże regiony leśne,
* [ ] część lasów obejmuje wiele sąsiednich chunków,
* [ ] istnieją zarówno mniejsze zagajniki, jak i duże lasy,
* [ ] las jest rozpoznawalny jako osobna struktura przestrzenna,
* [ ] głębia lasu ma wyraźnie większą gęstość drzew,
* [ ] las nie jest tylko skupiskiem kilku przypadkowych drzew.

### Forest edges

* [ ] granica lasu jest płynna,
* [ ] występują obszary przejściowe,
* [ ] poza lasem nadal mogą występować pojedyncze drzewa.

### Trees

* [ ] duże lasy mają odpowiednio wysokie/gęste drzewa,
* [ ] nie powstaje nienaturalnie jednolity „mur drzew”,
* [ ] istniejący vegetation placement nadal działa.

### Habitat

* [ ] dostępna jest ciągła wartość `forestDensity` / `forestHabitat`,
* [ ] może być wykorzystana przez przyszły system fauny,
* [ ] nie ma bezpośredniego hard-coded `spawn N animals in forest`,
* [ ] środowisko poza lasem może nadal wspierać pojedyncze zwierzęta.

### Technical

* [ ] deterministyczność jest zachowana,
* [ ] chunk boundaries są poprawne,
* [ ] nie powstaje drugi system biome,
* [ ] istniejący worker pipeline jest wykorzystywany,
* [ ] brak globalnego skanowania świata,
* [ ] koszt generowania pozostaje akceptowalny.

---

# Poza zakresem

* pełny tree lifecycle,
* wzrost drzew,
* saplings,
* ścinanie drzew,
* regeneracja lasu,
* symulacja wieku drzew,
* pełny system habitatów dla wszystkich zwierząt,
* przebudowa fauna spawning,
* zachowanie wilków,
* system migracji zwierząt,
* nowy system biomów,
* proceduralna geologia,
* osobny renderer lasu.

Plan `058` pozostaje odpowiedzialny za lifecycle drzew i rozwój żywego lasu.

---

# Przyszła integracja

Docelowo:

```text
terrain
   ↓
biome / climate
   ↓
forest density
   ↓
vegetation
   ↓
forest habitat
   ↓
fauna
   ↓
animal behaviour
```

oraz:

```text
forest density
      +
tree lifecycle
      +
resource availability
      ↓
living forest
```

Dzięki temu las nie będzie wyłącznie efektem wizualnym.

Będzie częścią systemu środowiska Seedvale.

---

# Kolejność implementacji

1. Przeanalizować istniejący biome/vegetation pipeline.
2. Zidentyfikować, które istniejące dane mogą bezpośrednio posłużyć do wyznaczenia `forestDensity`.
3. Nie dodawać nowego noise, jeżeli istniejące pola dają wystarczająco dobre duże regiony.
4. Jeżeli potrzebny jest dodatkowy sygnał, dodać jeden makro-scale forest noise.
5. Wprowadzić ciągłą `forestDensity`.
6. Zintegrować ją z istniejącym tree placement.
7. Dostroić skalę regionów.
8. Dostroić density curve.
9. Dodać wpływ na wysokość/maturity drzew tylko w zakresie potrzebnym dla efektu wizualnego.
10. Zweryfikować granice lasów.
11. Zweryfikować roads, paths, villages i clearings.
12. Zweryfikować kilka seedów.
13. Zmierzyć koszt generowania chunków.
14. Udokumentować `forestDensity` jako środowiskowy sygnał możliwy do wykorzystania przez faunę.
15. Dopiero wtedy traktować forest habitat jako gotowy fundament dla kolejnych systemów.

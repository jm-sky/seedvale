# 103 — Performance Diagnostics, Benchmark & Adaptive Quality

**Status:** `verification needed`
**Priority:** 🔴 high  
**Effort:** XL  
**Depends on:** —

## Cel

Stworzyć w Seedvale spójny system diagnostyki i zarządzania wydajnością, który:

1. mierzy wydajność przy minimalnym narzucie,
2. automatycznie wykrywa potencjalne bottlenecks,
3. agreguje wyniki zamiast spamować `console.log`,
4. pozwala filtrować i analizować wyniki,
5. posiada benchmarki powtarzalnych scenariuszy,
6. udostępnia profile jakości `Low / Medium / High / Custom`,
7. w przyszłości może automatycznie dopasowywać jakość do dostępnego budżetu FPS.

System ma pomagać **znaleźć przyczynę problemu**, a nie tylko informować, że FPS spadł.

---

## 1. Performance instrumentation

### Cel

Dodać lekką, wspólną warstwę zbierania metryk wydajności.

### Zasady

- brak `console.log()` per frame,
- brak dużych alokacji podczas pomiaru,
- agregowanie danych w pamięci,
- okresowe próbkowanie zamiast rejestrowania każdej klatki,
- benchmark nie może sam powodować zauważalnego spadku FPS,
- pomiary powinny być możliwe do całkowitego wyłączenia w normalnej grze.

### Podstawowe metryki

- FPS,
- frame time,
- p50 / p95 / p99 frame time,
- min/max frame time,
- draw calls,
- triangles,
- liczba obiektów/instancji,
- informacje o chunkach,
- informacje o streamingu,
- konfiguracja graficzna.

Jeżeli dostępne i wystarczająco tanie:

- CPU frame time,
- GPU timing,
- memory / GPU memory.

---

## 2. Pomiar poszczególnych systemów

System powinien umożliwiać instrumentację kosztownych modułów.

Kategorie:

- `TERRAIN`
- `GRASS`
- `VEGETATION`
- `PROPS`
- `SHADOWS`
- `POSTPROCESS`
- `WATER`
- `STREAMING`
- `NPC`
- `FAUNA`
- `PHYSICS`
- `RENDER`

Przykładowy wynik:

```text
Frame: 17.2 ms

terrain       0.8 ms
grass         2.1 ms
vegetation    3.4 ms
NPC           1.2 ms
fauna         0.7 ms
shadows       3.8 ms
postprocess   4.1 ms
```

Nie każdy system musi być mierzony cały czas. Instrumentacja powinna być możliwie tania.

---

## 3. Wykrywanie bottlenecków i spike'ów

Benchmark nie powinien wymagać od użytkownika przeglądania tysięcy logów.

System powinien automatycznie wykrywać:

- długie frame'y,
- nagłe spadki FPS,
- długie operacje CPU,
- kosztowne operacje związane ze streamingiem,
- nietypowy wzrost draw calls,
- nietypowy wzrost liczby trójkątów,
- kosztowne operacje określonych systemów.

Przykład:

```text
[PERF] Frame spike detected

FPS: 58 → 34
Frame time: 16.8 → 29.4 ms
Duration: 840 ms

Suspects:
  grass generation    71%
  chunk streaming     18%
  vegetation update    7%

Context:
  chunks loaded: 42
  grass candidates: 4.1M
  draw calls: 2180
```

System powinien wskazywać **prawdopodobnych winowajców**, a nie udawać, że zna dokładną przyczynę, jeżeli pomiar jej nie potwierdza.

---

## 4. Agregacja i filtrowanie logów

### Problem

Nie możemy polegać na:

```text
1000 console.log()
→ użytkownik ręcznie szuka problemu
```

### Rozwiązanie

Wprowadzić kategorie oraz severity:

```text
PERF
PERF:FRAME
PERF:CPU
PERF:GPU
PERF:STREAMING
PERF:GRASS
PERF:VEGETATION
PERF:SHADOWS
PERF:POSTPROCESS
PERF:NPC
PERF:FAUNA
```

Severity:

```text
debug
info
warning
critical
```

Możliwość filtrowania np.:

```ts
performance.setFilter({
  categories: ['STREAMING', 'GRASS', 'SHADOWS'],
  minSeverity: 'warning',
});
```

Domyślnie benchmark powinien zbierać dane strukturalnie, ale nie wypisywać ich masowo do konsoli.

---

## 5. Raport benchmarku

Po zakończeniu benchmarku system powinien wygenerować zbiorczy raport.

Przykład:

```text
[Seedvale Benchmark]

Duration: 30s
Quality: High
Pixel ratio: 2

FPS:
  avg: 58.2
  min: 41
  p1: 47

Frame time:
  avg: 17.2 ms
  p95: 21.4 ms
  max: 31.8 ms

Rendering:
  draw calls: 1840 avg / 2310 max
  triangles: 1.82M avg

Systems:
  terrain       0.8 ms
  grass         2.1 ms
  vegetation    3.4 ms
  shadows       3.8 ms
  postprocess   4.1 ms
  NPC/fauna     1.9 ms

Detected bottlenecks:
  1. postprocess
  2. shadows
  3. vegetation
```

Raport powinien być dostępny:

- w konsoli jako pojedynczy/ograniczony output,
- opcjonalnie jako JSON,
- w przyszłości możliwy do zapisania/skopiowania.

JSON jest istotny, ponieważ raport można później przekazać agentowi AI do analizy.

---

## 6. Benchmark scenarios

Benchmark powinien obsługiwać powtarzalne scenariusze.

Minimum:

```text
Current scene
Forest
Settlement
Water
Night
Stress test
```

Scenariusz powinien mieć możliwość ustalenia:

- czasu pomiaru,
- miejsca/kamery,
- liczby aktywnych NPC,
- liczby zwierząt,
- liczby chunków,
- warunków pogodowych/czasu dnia,
- Quality preset.

Celem jest możliwość porównania:

```text
before optimization
vs
after optimization
```

---

## 7. Performance budget

Wprowadzić pojęcie budżetu frame time.

Przykładowo:

```text
60 FPS → ~16.7 ms
50 FPS → 20 ms
30 FPS → 33.3 ms
```

System nie powinien traktować pojedynczego spike'a jako problemu.

Powinien rozróżniać:

- chwilowy spike,
- średnie przekroczenie budżetu,
- trwałą degradację wydajności.

---

## 8. Graphics Quality Profiles

Dodać do Settings:

```text
Graphics Quality

○ Low
○ Medium
● High
○ Custom
```

Profile sterują wieloma parametrami jednocześnie.

Potencjalne parametry:

- pixel ratio / render resolution,
- shadow quality,
- shadow map resolution,
- grass density,
- grass LOD,
- vegetation LOD,
- water effects,
- water reflections,
- AO,
- bloom,
- god rays,
- inne kosztowne post-process effects.

### Ważne

Profile jakości nie powinny zastępować optymalizacji architektury.

Np. instancing drzew nie powinien być dostępny tylko na `Low`.

Optymalizacja bazowa powinna poprawiać performance wszystkich profili.

---

## 9. Custom Quality

`Custom` pozwala ręcznie zmieniać poszczególne parametry.

Przykład:

```text
Resolution        1.5
Shadows           Medium
Grass             High
Vegetation        High
AO                Medium
Bloom             On
God Rays          Off
```

Po zmianie parametrów preset automatycznie przechodzi w `Custom`.

---

## 10. Adaptive Quality — przyszły etap

Po zbudowaniu instrumentation + benchmark + quality profiles można dodać automatyczne dopasowanie jakości.

Cel:

> utrzymać określony target FPS przy możliwie wysokiej jakości.

Przykład:

```text
Target: 50 FPS

FPS spada poniżej budżetu
        ↓
zmniejsz najtańszy parametr
        ↓
odczekaj kilka sekund
        ↓
zmierz ponownie
        ↓
jeżeli nadal za wolno → kolejny parametr
```

Analogicznie:

```text
FPS stabilnie powyżej budżetu
        ↓
spróbuj podnieść jeden parametr
        ↓
jeżeli FPS nadal OK → pozostaw
```

### Zasady

- brak gwałtownego zmieniania ustawień,
- hysteresis, aby uniknąć ciągłego przełączania,
- minimalny czas pomiędzy zmianami,
- preferowanie parametrów o małym wpływie wizualnym,
- możliwość wyłączenia przez użytkownika,
- możliwość ustawienia minimalnej jakości.

Adaptive Quality nie powinno zmieniać ustawień użytkownika bez możliwości kontroli.

---

## 11. Kolejność implementacji

### Etap 1 — Instrumentation

- wspólna warstwa performance metrics,
- frame timing,
- agregacja,
- podstawowe counters,
- minimalny narzut.

### Etap 2 — Bottleneck detection

- spike detection,
- system timings,
- severity,
- kategorie,
- filtrowanie.

### Etap 3 — Benchmark

- benchmark runner,
- scenariusze,
- powtarzalne pomiary,
- raport,
- JSON export.

### Etap 4 — Quality Profiles

- Low / Medium / High,
- Custom,
- centralna konfiguracja parametrów jakości.

### Etap 5 — Adaptive Quality

- target FPS,
- dynamiczna zmiana parametrów,
- hysteresis,
- priorytety parametrów,
- stabilizacja.

---

## 12. Relacja do istniejących optymalizacji

Ten system nie zastępuje istniejących planów performance.

Nadal należy wdrażać problemy wskazane w review:

- vegetation/prop instancing,
- grass generation w Workerze,
- optymalizacja shadow pass,
- post-processing,
- cache `buildInteractables`,
- ograniczenie niepotrzebnej pracy per-frame,
- redukcja garbage collection.

System benchmarku powinien natomiast umożliwić **zmierzenie efektu każdej z tych zmian**.

---

## Kryterium sukcesu

Po wdrożeniu użytkownik/agent nie powinien musieć analizować setek lub tysięcy `console.log`.

Powinien móc uruchomić benchmark i otrzymać:

```text
Performance: 47 FPS

Main bottlenecks:
1. Shadows       5.1 ms
2. Vegetation    4.3 ms
3. Postprocess   3.8 ms

Critical spikes:
- grass generation: 2
- chunk streaming: 1

Recommendation:
Vegetation is the primary sustained bottleneck.
```

System ma odpowiadać nie tylko na:

> **„Ile mam FPS?”**

ale przede wszystkim:

> **„Co powoduje spadek FPS i gdzie warto szukać problemu?”**
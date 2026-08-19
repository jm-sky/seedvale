# Seedvale — Rendering Performance & GPU Scaling

**Status:** `done` ✅ — browser verified 2026-08-19
**Priority:** 🔴 high
**Cel:** zwiększyć skalę świata, osad, NPC i vegetation bez proporcjonalnego wzrostu kosztu renderingu, zachowując obecny styl wizualny Seedvale.

## 1. Cel architektoniczny

Performance jest constraintem architektury.

Nie optymalizujemy renderera poprzez dokładanie coraz bardziej zaawansowanych technologii. Najpierw eliminujemy niepotrzebną pracę:

```text
less work
   ↓
better batching
   ↓
less submissions
   ↓
less overdraw / geometry
   ↓
cheaper passes
   ↓
LOD / HLOD / culling
   ↓
dopiero potem GPU-driven / WebGPU
```

Seedvale pozostaje:

* Three.js
* WebGL2
* istniejący EffectComposer
* istniejący system chunków
* istniejący instancing
* istniejący LOD

WebGPU nie jest celem samym w sobie.

---

# 2. Baseline

Review 012 wykazał:

* ciężkie sceny: ~1300–1950 draw calls,
* ~7–19 M triangles,
* `RENDER`: ~7–17 ms,
* `WATER`: ~3–6 ms,
* symulacja: ~0.3–2 ms,
* NPC/fauna nie są obecnie głównym bottleneckiem,
* N8AO jest bardzo drogim GPU pass,
* settlement generuje setki indywidualnych submissions,
* shadow + mirror powodują dodatkowe przebiegi sceny,
* chunk mesh może powodować hitch ~30–54 ms.

Źródło: review 012.

## Performance gates

Każdy etap musi mieć:

1. baseline,
2. minimalną zmianę,
3. browser verification,
4. benchmark,
5. porównanie p50/p95/max frame time,
6. draw calls,
7. triangles,
8. memory, jeśli dostępne,
9. decyzję `keep / improve / revert`.

Zmiana bez mierzalnego zysku nie zostaje.

---

# 3. P0 — N8AO / post-processing budget

## Problem

N8AO jest obecnie jednym z największych kosztów GPU.

W review 012:

* `current`: ~17.3 → ~9.1 ms po `no-ao`,
* `night`: ~21.6 → ~11.7 ms.

Czyli AO może odpowiadać za około połowę kosztu renderowania w ciężkich scenach.

## Zakres

* zmierzyć osobno:

  * N8AO,
  * SMAA,
  * bloom,
  * god rays,
  * film grade,
* sprawdzić istniejące profile Low / Medium / High,
* określić budżet post-processingu,
* dobrać AO resolution/quality do profilu,
* sprawdzić możliwość automatycznego obniżenia AO w najcięższych scenach.

Nie tworzyć nowych efektów.

## Success gate

N8AO nie powinno konsumować nieproporcjonalnej części frame budgetu w High.

Priorytetem jest zachowanie charakteru obrazu przy znacznie niższym koszcie.

---

# 4. P1 — Shadow pass deduplication

## Problem

Scena jest renderowana wielokrotnie:

```text
shadow
   ↓
water mirror
   ↓
beauty / composer
```

Przy `shadowMap.autoUpdate = true` shadow map może być aktualizowana przy kolejnych `renderer.render()`.

Review 012 wskazuje około ⅓ submissions związanych z shadow pass.

## Zakres

Zbadać:

* `shadowMap.autoUpdate = false`,
* jawne `shadowMap.needsUpdate`,
* kolejność:

  * shadow update,
  * mirror,
  * beauty,
* możliwość pominięcia shadow pass w mirror camera,
* ewentualnie aktualizację shadow map tylko wtedy, gdy rzeczywiście zmieniła się scena/światło.

Nie zmieniać jeszcze jakości shadow map.

## Success gate

* mniej shadow submissions,
* brak wizualnego flickeru,
* brak zauważalnego opóźnienia cieni,
* benchmark przed/po.

---

# 5. P1 — Settlement batching / instancing

## Problem

Settlement jest obecnie największym źródłem indywidualnych draw calls.

Review 012:

* ~567–780 settlement meshes,
* settlement stanowił około połowę submissions w niektórych scenach.

Jednocześnie Seedvale posiada już `buildInstancedProps()`.

## Zakres

Zidentyfikować statyczne, powtarzalne elementy osady:

* płoty,
* słupki,
* stosy,
* dekoracje,
* powtarzalne elementy konstrukcyjne,
* inne statyczne props.

Podzielić je na:

### A. Instanced

Elementy:

* powtarzalne,
* statyczne,
* bez indywidualnej interakcji,
* bez indywidualnej animacji.

### B. Individual

Pozostają indywidualne:

* drzwi,
* światła,
* interaktywne obiekty,
* NPC,
* obiekty wymagające osobnego lifecycle,
* elementy zależne od gameplayu.

Wykorzystać istniejący `instancedProps.ts`, zamiast tworzyć drugi system batchingowy.

## Dalszy krok

Jeżeli liczba bucketów nadal będzie wysoka:

```text
species × primitive
```

zbadać możliwość konsolidacji przez:

```text
shared geometry + shared material
        ↓
larger InstancedMesh buckets
```

ale wyłącznie po benchmarku.

## Success gate

Settlement powinien zejść znacząco poniżej obecnych ~500–800 submissions bez utraty:

* interakcji,
* świateł,
* drzwi,
* gameplay lifecycle,
* visual quality.

---

# 6. P1 — Water mirror budget

## Problem

Water mirror wykonuje drugi traversal sceny.

Review 012:

* `water`: ~865 mirror draws,
* `no-reflections`: ~1982 → ~1096 draws,
* mirror jest istotnym kosztem szczególnie przy wodzie/oceanie.

## Zakres

Przetestować kolejno:

1. mirror co 2 klatki,
2. mirror co 3 klatki,
3. mniejszy RT,
4. ograniczenie mirror camera do istotnych warstw,
5. pominięcie elementów nieistotnych dla odbicia,
6. ewentualnie aktualizację mirror tylko przy zmianie istotnej dla odbicia.

Nie tworzyć kolejnego systemu reflection.

Istniejący jeden RT 256² pozostaje bazą.

## Success gate

Reflection pozostaje wizualnie wiarygodne, ale koszt nie może dominować scen nad wodą.

---

# 7. P1 — Chunk streaming hitch

Ten temat jest powiązany z renderingiem, ale implementacyjnie pozostaje w planie **112**.

Review 012 wykazał:

```text
chunk mesh
avg ~29.9 ms
max ~53.6 ms
```

Nie duplikować implementacji w tym planie.

## Integration requirement

Plan 112 powinien być traktowany jako prerequisite dla skalowania świata:

```text
worker terrain generation
        ↓
streaming queue
        ↓
time-sliced mesh attach
        ↓
bounded main-thread work
```

Rendering plan musi zakładać, że nowe chunki nie mogą generować długich main-thread stalls.

---

# 8. P2 — Vegetation batching

## Problem

Vegetation jest już instanced, ale nadal istnieje około 451 bucketów.

Obecny model:

```text
species × primitive
        ↓
InstancedMesh
        ↓
draw call
```

To jest znacznie lepsze niż clone-per-tree, ale nadal może być zbyt drobnoziarniste.

## Zakres

Najpierw benchmark:

* liczba bucketów,
* draw calls,
* Render ms,
* frustum visibility,
* triangles.

Następnie sprawdzić:

* łączenie kompatybilnych bucketów,
* shared geometry/material,
* redukcję liczby InstancedMesh,
* lepsze grupowanie per chunk / material.

Nie wdrażać GPU-driven rendering na tym etapie.

## Success gate

Znacząca redukcja vegetation draw calls bez wzrostu kosztu generowania chunków.

---

# 9. P2 — Grass / terrain geometry budget

Review 012 wykazał:

* grass: do ~9.7 M triangles,
* terrain: ~5.6 M,
* water: ~3.25 M.

## Grass

Istnieje już:

* instancing,
* near-field filler,
* LOD fraction.

Rozszerzyć istniejący mechanizm:

```text
near
  → full density

medium
  → reduced density

far
  → aggressive reduction
```

Nie zwiększać globalnie `grass.density`.

## Terrain

Sprawdzić:

* obecne resolution,
* możliwość niższej resolution dla distant chunks,
* ewentualny terrain LOD,
* koszt normal/vertex data.

Nie zmieniać geometrii terenu bez benchmarku wizualnego.

---

# 10. P2 — NPC rendering

NPC simulation nie jest bottleneckiem.

Problemem jest presentation:

```text
~9 meshes / NPC
×
13–34 NPC
```

## Zakres

Zbadać pipeline przygotowania modeli:

* merge kompatybilnych materials,
* redukcja submeshes,
* ograniczenie shadow casting dla distant NPC,
* distance-based visibility,
* ewentualnie prostszy representation dla bardzo odległych NPC.

Nie zmieniać:

* FSM,
* schedule,
* simulation tick,
* AI.

## Success gate

Zmniejszyć koszt renderowania NPC bez wpływu na zachowanie symulacji.

---

# 11. P3 — Hierarchical LOD / HLOD

Dopiero po rozwiązaniu realnych bottlenecków.

## Settlement

Dla odległych osad:

```text
near
  full buildings + props

medium
  simplified buildings

far
  HLOD / combined representation
```

## Vegetation

```text
near
  full trees

medium
  simplified trees

far
  impostors / very cheap representation
```

HLOD powinien być zgodny z istniejącym chunk streamingiem.

Nie tworzyć globalnego HLOD managera, jeżeli lokalny/chunkowy model wystarczy.

---

# 12. P3 — Advanced culling

Najpierw wykorzystać to, co daje Three.js i obecna architektura:

* frustum culling,
* chunk locality,
* distance LOD,
* layer filtering.

Dopiero potem badać:

* occlusion culling,
* hierarchical bounds,
* GPU-driven visibility.

Szczególnie uważać na `InstancedMesh`: jeden bucket może mieć wspólny bounding volume, więc sama liczba instancji nie oznacza jeszcze efektywnego per-instance culling.

## Success gate

Culling musi redukować rzeczywistą pracę GPU/CPU, a nie tylko zmieniać licznik obiektów.

---

# 13. P4 — Temporal techniques

Temporal rendering nie jest obecnie priorytetem.

Dopiero gdy podstawowy frame budget będzie opanowany:

* research TAA,
* temporal reprojection,
* temporal AO,
* temporal shadow techniques,
* wykorzystanie historii poprzedniej klatki.

Cel:

```text
same perceived quality
        ↓
fewer expensive samples / passes
```

Nie implementować TAA tylko dlatego, że technologia jest dostępna.

---

# 14. P4 — WebGPU / TSL / GPU compute

WebGPU pozostaje eksperymentalną opcją.

Nie migrować renderera.

Najpierw znaleźć konkretny workload:

```text
large batch
+
CPU bottleneck
+
parallelizable
+
stable data contract
```

Potencjalne kandydaty:

* vegetation visibility,
* particles,
* spatial calculations,
* large batch calculations.

Każdy kandydat wymaga:

1. WebGL2 baseline,
2. WebGPU prototype,
3. benchmark,
4. memory comparison,
5. complexity assessment.

Jeżeli przewaga jest mała — pozostajemy przy WebGL2.

---

# 15. Docelowy model renderingu

```text
World / chunks
      ↓
chunk locality
      ↓
LOD / HLOD
      ↓
culling
      ↓
batching / instancing
      ↓
cheap geometry + shaders
      ↓
limited shadow passes
      ↓
limited reflections
      ↓
controlled post-processing
```

Opcjonalnie:

```text
                 ┌── WebGPU / compute
                 │
                 │   only if benchmark wins
                 ↓
             GPU workloads
```

---

# 16. Performance budget

Docelowo monitorować osobno:

| Metric                 | Cel                                  |
| ---------------------- | ------------------------------------ |
| sustained frame time   | stabilny budget                      |
| p95 frame time         | bez regularnych spike'ów             |
| max frame hitch        | ograniczony                          |
| scene draw calls       | wyraźnie mniej niż obecne ~1300–1950 |
| shadow submissions     | minimalne                            |
| mirror submissions     | minimalne                            |
| triangles              | kontrolowany wzrost                  |
| main-thread simulation | pozostaje mały                       |
| chunk attach           | bez 30–50 ms hitchów                 |

Nie definiujemy jeszcze sztywnego FPS targetu, dopóki benchmark nie zostanie wykonany na reprezentatywnym desktop + mobile baseline.

---

# 17. Kolejność wdrożenia

```text
112 — chunk streaming hitch
        │
        ├── P0 N8AO / post-process budget
        │
        ├── P1 shadow deduplication
        │
        ├── P1 settlement batching
        │
        ├── P1 water mirror budget
        │
        ├── P2 vegetation batching
        │
        ├── P2 grass / terrain LOD
        │
        ├── P2 NPC rendering
        │
        ├── P3 HLOD
        │
        ├── P3 advanced culling
        │
        ├── P4 temporal rendering
        │
        └── P4 WebGPU / GPU compute
```

Nie należy wykonywać wszystkich etapów automatycznie.

Po każdym większym etapie benchmark decyduje, czy kolejny etap jest nadal potrzebny.

---

# 18. Poza zakresem

* pełny rewrite renderera,
* migracja całego projektu do WebGPU,
* React/R3F,
* Lumen-like GI,
* path tracing,
* ciężki ray tracing,
* kosztowne efekty tylko dla screenshotów,
* globalny GPU-driven renderer bez benchmarku,
* przenoszenie Three.js objects do Web Workers,
* optymalizacja NPC FSM bez dowodu problemu,
* optymalizacja fauna AI bez dowodu problemu.

---

# 19. Success Criteria

Plan jest sukcesem, jeśli Seedvale może zwiększać:

* liczbę budynków,
* wielkość settlementów,
* liczbę NPC,
* wielkość lasów,
* ilość vegetation,
* liczbę aktywnych world chunks,

bez proporcjonalnego wzrostu:

* draw calls,
* frame time,
* main-thread stalls,
* GPU fill cost.

Najważniejsza zasada:

> **Najpierw przestańmy wykonywać niepotrzebną pracę. Dopiero potem szukajmy bardziej zaawansowanej technologii, która wykona ją szybciej.**

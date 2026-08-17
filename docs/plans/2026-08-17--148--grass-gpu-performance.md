---
domain: world-terrain
tags: [performance]
---

# Plan: Grass GPU performance and geometry LOD

**Created:** 2026-08-17  
**Status:** `verification needed` 🔍 (etap S zaimplementowany i zbenchmarkowany — `current`, grass triangles −47%, ale bez poprawy FPS/RENDER w tym pojedynczym headless runie; M/M/L nierozpoczęte, czekają na real-GPU/powtórzone pomiary — patrz [implementation notes](./2026-08-17--148--grass-gpu-performance-implementation-notes.md))  
**Priority:** medium · **Effort:** L  
**Depends on:** none

## Cel

Zmniejszyć koszt GPU renderowania grass w Seedvale bez wyraźnego pogorszenia wyglądu.

Plan dotyczy przede wszystkim kosztu geometrii/vertex processing oraz potencjalnego kosztu fragment/overdraw. Nie zmienia systemu deterministycznego generowania trawy ani nie wprowadza nowego systemu renderowania.

## Ustalenia z analizy

Aktualny grass renderer używa `InstancedMesh` i współdzielonych geometrii/materiali, więc problemem nie jest przede wszystkim liczba draw calli, lecz liczba renderowanych wierzchołków/trójkątów oraz koszt fragmentów.

Obecne warianty geometrii mają orientacyjnie:

- `TRI`: 3 fins × 4 segmenty = 24 triangles / instance,
- `GRAIN`: 2 fins × 4 segmenty + 1 fin × 3 segmenty = 34 triangles / instance,
- `HERB`: 3 fins × 6 segmentów = 36 triangles / instance,
- `FILLER`: 2 fins × 3 segmenty = 12 triangles / instance.

W benchmarkach grass dochodził do milionów trójkątów sceny i był jednym z największych pojedynczych udziałów w triangle census. `InstancedMesh` redukuje submission overhead, ale nie usuwa kosztu vertex processing dla każdej instancji.

Obecny distance LOD zmniejsza liczbę instancji przez skrócenie `InstancedMesh.count`, ale pozostawia tę samą geometrię dla bliskich i dalekich instancji. To jest główna niewykorzystana możliwość optymalizacji.

Grass jest już pomijany w water reflection, ma wspólny wind uniform, działa przez workerowy/deterministyczny placement, używa chunkowego culling/LOD i posiada tani near-field filler.

## Zakres

W zakresie:

- pomiar aktualnego rozkładu grass instances według distance LOD,
- warianty geometrii Near/Mid/Far,
- integracja geometry LOD z istniejącym `InstancedMesh` i distance LOD,
- tuning density LOD po wdrożeniu geometry LOD,
- opcjonalne uproszczenie shader fragment stage, jeśli benchmark pokaże istotny koszt fill/fragment,
- visual regression test oraz benchmark przed/po.

Poza zakresem:

- WebGPU/GPU-driven grass,
- globalne batchowanie grass przez wszystkie chunki,
- przenoszenie placement/generation na GPU,
- przebudowa chunk streamingu,
- billboard/impostor jako pierwszy etap.

## S — Geometry LOD

### Cel

Zmniejszyć liczbę trójkątów na instancję wraz z odległością, zamiast wyłącznie zmniejszać liczbę instancji.

### Implementacja

1. Zmierzyć aktualny census grass:
   - liczba `InstancedMesh`,
   - liczba instancji,
   - triangles,
   - rozkład instancji względem distance LOD,
   - udział poszczególnych species/subtype.
2. W `src/terrain/grass.ts` przygotować uproszczone warianty istniejących fin clusters:
   - Near — obecna geometria,
   - Mid — mniej fins i/lub mniej segmentów,
   - Far — minimalna geometria zachowująca charakter gatunku.
3. Zachować istniejący placement, transformacje, `InstancedMesh`, materiał i shader jako punkt wyjścia.
4. Rozdzielić istniejące instancje do bucketów geometry LOD w sposób deterministyczny. Nie tworzyć osobnego generatora grass.
5. Ustalić progi LOD na podstawie istniejącego distance LOD, tak aby geometry LOD nie walczył z obecnym density LOD.
6. Zachować istniejący filler jako osobny, tani near-field bucket.
7. Sprawdzić bounding volumes/frustum culling oraz wpływ większej liczby bucketów na draw calls.

### Przewidywany zysk

Cel orientacyjny: **25–60% mniej grass triangles** przy zachowaniu podobnej wizualnej gęstości. Dokładny wynik ma wynikać z benchmarku, nie z założenia.

### Ryzyko

Niskie/średnie:

- LOD popping,
- zbyt widoczna zmiana sylwetki,
- dodatkowe `InstancedMesh` buckets mogą zwiększyć draw calls.

### Visual test

Porównać before/after przy:

- stojącym graczu na gęstej łące,
- lesie i otwartym terenie,
- obrocie kamery 360°,
- patrzeniu poziomo na daleki teren,
- patrzeniu z góry,
- ruchu/sprincie przez teren,
- przejściu przez granice Near → Mid → Far.

Kryterium: brak wyraźnego „paska” LOD, migotania lub nagłego przerzedzenia trawy w normalnym gameplayu.

### Benchmark

Przed i po na tych samych parametrach:

- `?benchmark=current&seed=42&res=193`
- `?benchmark=forest&seed=42&res=193`
- `?benchmark=stress&seed=42&res=193`
- `?benchmark=water&seed=42&res=193`

Zapisać co najmniej:

- FPS avg,
- frame p95,
- RENDER,
- drawCallsAvg,
- triangles,
- grass mesh/instance census.

Najważniejszym kryterium tego etapu jest spadek triangles bez regresji FPS/render time i bez istotnego wzrostu draw calls.

## M — Density LOD tuning

Wykonać dopiero po S i tylko jeśli geometry LOD nie daje wystarczającego wyniku.

1. Przetestować niższe wartości od obecnego minimalnego density LOD.
2. Zachować pełną gęstość w near field.
3. Utrzymać filler tylko tam, gdzie wizualnie kompensuje redukcję głównej warstwy.
4. Porównać kilka krzywych na tych samych seedach.
5. Wybrać najmniejszą liczbę instancji, która nadal daje naturalny ground cover.

### Przewidywany zysk

Orientacyjnie kolejne **15–30% mniej grass triangles**, zależnie od wybranego progu i rozkładu widocznych instancji.

### Ryzyko

Średnie — zbyt agresywna redukcja może powodować widoczne przerzedzenie podczas ruchu i na granicach chunków/LOD.

### Visual test

Te same scenariusze co w S, ze szczególnym naciskiem na:

- dalekie łąki,
- zbocza,
- przejście las → otwarta przestrzeń,
- ruch kamery podczas szybkiego przemieszczania gracza.

### Benchmark

Powtórzyć dokładnie baseline z S i porównać przede wszystkim triangles, FPS avg, frame p95 i RENDER.

## M — Far shader simplification

Wykonać tylko jeśli pomiary/profilowanie pokażą, że po geometry/density LOD grass nadal jest istotnie fragment/fill bound.

1. Zachować obecny shader dla Near.
2. Dla Far ograniczyć koszt fragment stage, zaczynając od efektów o najmniejszym znaczeniu wizualnym.
3. Nie usuwać windu bez visual testu — ruch trawy jest częścią czytelności świata.
4. Porównać shader variants przy tej samej geometrii i density, aby izolować zysk.

### Przewidywany zysk

Potencjalnie średni, ale zależny od GPU i rozdzielczości. Nie zakładać konkretnego procentu przed izolacją kosztu fragment stage.

### Ryzyko

Średnie — dalsza trawa może wyglądać zbyt płasko lub mieć inną reakcję na światło.

### Benchmark

Dodatkowo porównać scenariusz `forest` oraz `current` przy identycznym geometry/density LOD. Jeśli nie ma mierzalnego zysku, etap odrzucić.

## L — Billboard / impostor

Nie implementować w pierwszym podejściu.

Rozważyć dopiero, jeśli S + M nadal nie zapewniają odpowiedniego GPU budget. Billboard/impostor może dać większą redukcję geometrii, ale wprowadza większe ryzyko visual popping, dodatkową logikę LOD i większą złożoność materiału.

## Kolejność prac

1. Baseline census + benchmark.
2. S — Geometry LOD.
3. Visual verification.
4. Benchmark S.
5. Jeśli potrzebne: M — Density LOD.
6. Visual verification.
7. Benchmark M.
8. Jeśli potrzebne: M — Far shader simplification.
9. Visual verification i benchmark.
10. L odłożyć do osobnej decyzji, jeśli poprzednie etapy nie wystarczą.

## Kryterium sukcesu

Preferowany rezultat:

- **30%+ redukcji grass triangles**,
- bez wyraźnego pogorszenia wyglądu,
- bez istotnego wzrostu draw calls,
- bez regresji streamingu/chunk lifecycle,
- mierzalna poprawa RENDER/FPS w scenariuszach z dużą ilością grass.

Jeżeli triangles spadną, ale RENDER/FPS prawie się nie zmieni, nie należy dodawać kolejnych optymalizacji w ciemno — będzie to sygnał, że głównym ograniczeniem jest inna część GPU pipeline.

## Verification

Technicznie:

- typecheck,
- build,
- istniejące testy.

Browser/manual:

- visual test wszystkich opisanych scenariuszy,
- benchmark przed/po na stałym `seed=42`, `res=193`,
- porównanie triangles/draw calls/FPS/RENDER.

Nie uznawać optymalizacji za udaną wyłącznie na podstawie spadku liczby triangles. Musi być zachowany wygląd i musi być sprawdzony rzeczywisty wpływ na render performance.

## Powiązane materiały

- `docs/performance/README.md`
- `docs/research/2026-08-07--004--grass-generation.md`
- `docs/research/2026-08-17--017--threejs-rendering-audit.md`
- `docs/research/2026-08-17--019--rendering-optimizations.md`
- `docs/research/2026-08-17--020--cross-chunk-vegetation-batching.md`
- `src/terrain/grass.ts`
- `src/terrain/grassPlacement.ts`
- `src/terrain/distanceLod.ts`

> **Zrób git commit i push do main, rebase jeżeli trzeba**

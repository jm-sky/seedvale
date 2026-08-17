# Plan: Water Reflection GPU Optimization

**Created:** 2026-08-17
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~143~~

domain: `rendering`

## Cel

Zmniejszyć koszt współdzielonego planar water mirror bez wyłączania odbić i bez pogorszenia charakteru wizualnego wody.

Główny kierunek:

```text
pełny scene render do 128² RT
        ↓
reflection-specific visibility
        ↓
reflection LOD / uproszczenie geometrii
        ↓
adaptacyjna częstotliwość + resolution
```

Nie tworzyć drugiego systemu streamingu ani osobnego systemu widoczności świata. Wykorzystać istniejące camera layers, frustum culling, chunk boundaries i istniejące LOD/batching tam, gdzie są już dostępne.

---

# 1. Aktualny stan i koszt

## 1.1 Pipeline

`src/world/waterMirror.ts` używa **jednego współdzielonego** `WebGLRenderTarget` 128×128 dla wszystkich water materials. Mirror camera:

- jest `PerspectiveCamera`,
- działa tylko na layer 0,
- pomija `WATER_RENDER_LAYER`, więc nie rekurencjonuje wody,
- pomija `AGENT_RENDER_LAYER` (NPC/fauna),
- pomija `REFLECTION_SKIPPED_LAYER` (obecnie grass i ground items),
- renderuje scenę przez zwykłe `renderer.render(scene, mirrorCamera)`,
- wyłącza `shadowMap.autoUpdate` podczas mirror pass,
- stosuje oblique near-plane clipping dla płaszczyzny wody,
- aktualizuje odbicie maksymalnie do 30 Hz.

`src/world/createWater.ts` tworzy water mesh per chunk, ograniczony do 256×256 segmentów i korzysta z tego samego mirror RT przez `bindWaterMirror()`.

## 1.2 Najlepszy potwierdzony pomiar przed zmianami z Research 019

Research 019 §1, `?benchmark=stream`, seed 42, High, pixel ratio 1:

| metric | measured |
|---|---:|
| FPS avg | 23.3 |
| frame avg / p95 / max | 43.0 / 69.8 / 390.8 ms |
| draw calls avg | 2298 |
| mirror draw calls | 858 |
| main-pass draw calls | 1440 |
| triangles avg | 18.81 M |
| RENDER | 28.7 ms |
| WATER / mirror | ~10.5 ms |

Mirror stanowił około **37% wszystkich draw calls** tego przebiegu. Review 012 dodatkowo pokazał w scenariuszu `water` średnio **865 mirror draw calls** przy 1953 wszystkich oraz spadek z 7.1 M do 5.1 M triangles po wyłączeniu reflection, czyli około **2 M triangles/frame** przypisanych do dodatkowego przebiegu sceny.

To są ostatnie zmierzone wartości. Research 019 wdrożył następnie kolejne exclusions (grass + items oraz wcześniejsze agent exclusion) i zmianę cadence, ale **nie wykonał jeszcze browser benchmarku**. Nie należy więc przedstawiać niższego kosztu obecnego pipeline jako zmierzonego.

## 1.3 Co jest już zoptymalizowane

Już istnieją:

- jeden wspólny mirror RT zamiast osobnego RT per jezioro/chunk,
- 128×128 resolution,
- brak mipmap dla mirror texture,
- linear filtering,
- reflection cadence capped at 30 Hz,
- dodatkowy budget rule: poniżej 30 FPS mirror nie może renderować na dwóch kolejnych frame'ach,
- water exclusion przez camera layers,
- NPC/fauna exclusion przez `AGENT_RENDER_LAYER`,
- grass exclusion przez `REFLECTION_SKIPPED_LAYER`,
- ground-item exclusion przez `REFLECTION_SKIPPED_LAYER`,
- brak shadow-map update w mirror pass,
- oblique near-plane clipping,
- współdzielenie shader uniforms przez wszystkie water materials,
- reflection contribution ograniczona przez shader do maksymalnie około 18% final water colour i zwykle dużo mniej.

Wniosek: podstawowe "tanie" optymalizacje są już wykonane. Kolejny zysk powinien pochodzić z **mniejszego zbioru geometrii w reflection**, a nie z dalszego obniżania samej częstotliwości bez pomiaru.

---

# 2. Największe pozostałe koszty

## P1 — pełny scene submit w mirror pass

Największym kosztem pozostaje fakt, że mirror nadal wykonuje pełny `renderer.render()` dla znacznej części świata. Reflection RT jest mały, ale mała rozdzielczość nie eliminuje kosztu CPU/GPU submission geometrii.

Historyczny census z Research 019 miał około 5.73 M triangles w jednym scene traversal, w tym:

- settlement: 785k,
- vegetation: 1.34 M,
- terrain: 557k,
- environment/other: 58k,
- water: 369k,
- NPC/fauna: 171k — obecnie już wyłączone z mirror,
- grass: 2.44 M — obecnie wyłączone z mirror,
- items: 9k — obecnie wyłączone z mirror.

Po wdrożonych exclusions największa wartość pozostaje w ograniczeniu **terrain + vegetation + settlement + większych environment props**, a nie w dalszym usuwaniu drobnych elementów.

## P2 — brak reflection-specific LOD

Mirror używa tych samych geometrii co główny render. 128² RT nie jest w stanie rozdzielić dużej części drobnej geometrii, więc część vertex work jest wykonywana mimo że finalny sygnał reflection ma małą rozdzielczość i niską wagę.

## P3 — culling jest tylko standardowym frustum cullingiem

Mirror camera ma własny frustum, więc Three.js wykonuje normalne culling. Nie ma jednak dodatkowego reflection-specific ograniczenia odległości/ważności obiektów.

Krótszy `camera.far` nie jest rozwiązaniem: Research 019 §4.1 wykazał, że obecny streamed world kończy się około 316 m po przekątnej, a main camera far = 500 m, więc zwykłe skrócenie far nie usuwa istotnej części świata. Poprawne ustawienie wymaga przebudowania `projectionMatrix`.

## P4 — resolution

128×128 jest już małe. Zmniejszenie do 64×64 może obniżyć fill/texture bandwidth, ale **nie rozwiąże głównego kosztu scene submission**. Traktować jako fallback/quality tier, nie jako pierwszy krok.

## P5 — update frequency

30 Hz jest już ograniczeniem. Dalsze zejście do 15 Hz może zmniejszyć koszt średni, ale zwiększa temporal lag. Przy niskim FPS istnieje już dodatkowe ograniczenie consecutive-frame. Nie obniżać globalnie bez benchmarku i porównania szybkiego obrotu kamery.

---

# 3. Plan implementacji S / M / L

## S — Reflection visibility budget

### Zakres

Dodać mały, reflection-specific budżet widoczności oparty na istniejącej geometrii świata:

1. Określić maksymalny sensowny dystans reflection względem mirror camera / poziomu wody.
2. Przebudować mirror projection tak, aby faktycznie używała skróconego far plane tylko wtedy, gdy pomiar pokaże realny zysk.
3. Jeśli far-plane culling jest za słaby, wykorzystać istniejące chunk-level bounds/lifecycle do wyłączenia całych odległych chunków z reflection, bez tworzenia nowego streamingu.
4. Utrzymać istniejące exclusions dla NPC/fauna/grass/items.
5. Dodać benchmark counter pokazujący osobno mirror draw calls i triangles przed/po.

### Cel

Najpierw sprawdzić, czy reflection może renderować mniejszy wycinek istniejącego świata bez wprowadzania nowych proxy/LOD.

### Przewidywany zysk

**5–15% kosztu mirror** w ciężkich scenach, jeśli aktualny mirror frustum obejmuje znaczną liczbę odległych obiektów/chunków. Zysk może być bliski zeru, jeśli standardowy frustum już skutecznie ogranicza populację.

### Ryzyko wizualne

**Niskie–średnie.** Możliwe odcięcie odległych sylwetek drzew, terenu lub zabudowy w reflection. Przy 128² i niskiej wadze reflection powinno być mało widoczne, ale trzeba sprawdzić linię brzegu i otwarte akweny.

### Benchmark

- `?benchmark=water`, seed 42, High, pixel ratio 1, 30 s.
- `?benchmark=stream`, seed 42, High, pixel ratio 1, 30 s.
- porównać: FPS avg, frame p95, mirror draw calls, mirror triangles, WATER, RENDER, total triangles.
- manualnie: obrót kamery przy wodzie + widok na odległą zabudowę/las.

**Decyzja:** implementować tylko jeśli mirror draw calls/triangles rzeczywiście spadną i nie pojawi się widoczne hard cutoff.

---

## M — Reflection LOD / simplified representation

### Zakres

Jeśli S potwierdzi, że culling nie wystarcza, wprowadzić **reflection-specific LOD**, bez zmiany głównego renderu:

1. Zidentyfikować najdroższe kategorie pozostające w mirror: vegetation, settlement, terrain/environment.
2. Dla obiektów dalekich lub mało istotnych używać prostszej geometrii albo istniejącego niższego LOD, zamiast pełnego mesh.
3. Nie tworzyć osobnych globalnych kopii świata. Preferować istniejące GLTF/geometry resources i istniejące LOD/batching.
4. Rozdzielić reflection quality od main-camera quality — LOD może być agresywniejszy tylko w mirror.
5. Ustalić jeden lub maksymalnie dwa progi LOD, żeby nie tworzyć dużej liczby nowych wariantów i bounding objects.
6. Jeśli settlement GLB nie ma sensownego LOD, preferować coarse reflection proxy tylko dla wybranych dużych obiektów zamiast generalnego systemu HLOD.

### Cel

Obniżyć triangles/frame i koszt vertex processing bez znaczącego zmniejszenia liczby draw calls.

### Przewidywany zysk

**10–25% kosztu mirror**; potencjalnie więcej w scenach z dużą ilością vegetation/settlement geometry. Zysk będzie głównie po stronie triangles/GPU, niekoniecznie po stronie CPU draw-call submission.

### Ryzyko wizualne

**Średnie.** Zbyt agresywny LOD może dawać widoczne różnice sylwetek budynków/drzew w odbiciu, szczególnie przy spokojnej wodzie i bliskim brzegu.

### Benchmark

Poza benchmarkami S:

- porównać mirror triangles vs mirror draw calls,
- osobno `water` i `settlement`,
- manualnie sprawdzić: bliski brzeg, wioska nad wodą, las przy wodzie, szybki obrót kamery.

**Akceptacja:** triangles spadają wyraźnie, mirror draw calls nie rosną, a reflection nie pokazuje oczywistego LOD pop/flicker.

---

## L — Adaptive reflection quality

### Zakres

Dopiero po potwierdzeniu S/M:

1. Dynamicznie wybierać reflection budget na podstawie aktualnego frame time / quality preset.
2. Quality tiers:
   - High: 128² / do 30 Hz,
   - medium load: 128² / niższa cadence,
   - heavy load: 64² / niższa cadence,
   - ewentualnie reflection off tylko jako istniejący quality fallback.
3. Aktualizować resolution tylko na zmianę tieru, nie co frame.
4. Zachować istniejący consecutive-frame protection poniżej 30 FPS.
5. Nie uzależniać symulacji ani stanu świata od reflection quality.

### Cel

Reflection ma być adaptacyjnym efektem wizualnym, który ustępuje budżetowi głównej klatki zamiast odbierać FPS światu.

### Przewidywany zysk

**10–30% średniego WATER cost w ciężkich scenach**, zależnie od tego, jak często system przechodzi na tańszy tier. W scenach lekkich zysk powinien być praktycznie zerowy.

### Ryzyko wizualne

**Średnie–wysokie.** Zmiana resolution/cadence może być widoczna podczas szybkiego ruchu. Unikać częstego przełączania tierów przez hysteresis/cooldown.

### Benchmark

- wszystkie scenariusze: `current`, `settlement`, `water`, `stream`;
- minimum 30 s na scenariusz;
- osobno test 30/60/120 FPS jeśli środowisko pozwala;
- sprawdzić frame-time stability, nie tylko FPS avg;
- manualnie szybki obrót kamery nad wodą przy przejściu tierów.

**Akceptacja:** ciężkie sceny zyskują na frame p95/WATER bez zauważalnego "pływania" jakości reflection.

---

# 4. Reflection culling — decyzja architektoniczna

Nie budować osobnego systemu world visibility.

Preferowana kolejność:

```text
existing frustum culling
        ↓
existing camera layers
        ↓
reflection-specific far / chunk visibility
        ↓
reflection LOD
        ↓
adaptive resolution/cadence
```

Nie stosować:

- globalnego `scene.visible = false` dla obiektów podczas mirror renderu,
- mutowania visibility współdzielonych obiektów bez centralnego guard/restore,
- globalnego HLOD tylko dla reflection,
- osobnego chunk streamingu dla mirror,
- per-frame przebudowy dużych list obiektów.

Jeżeli potrzebne będzie dokładniejsze culling, preferować statyczne metadane/warstwy na istniejących obiektach albo chunk-level bounds. Mirror jest efektem wtórnym — nie powinien dostać pełnego drugiego systemu render visibility.

---

# 5. Resolution — decyzja

**128×128 pozostaje domyślną wartością.**

Nie zmniejszać jej w pierwszej iteracji, ponieważ:

- historyczny problem to głównie scene submission, nie sam fill RT,
- 128² już mocno ogranicza reprezentowalny detal,
- shader dodatkowo rozmywa/distortuje sample i ogranicza jego final contribution.

64×64 należy przetestować dopiero w wariancie L jako ciężki-tier/fallback.

Benchmark powinien porównać 128² vs 64² na `water` i `settlement`, mierząc WATER, RENDER, triangles i FPS p95. Jeśli różnica jest marginalna, 128² zostaje.

---

# 6. Update frequency — decyzja

Obecne 30 Hz + load protection zostaje bazą.

Nie ustawiać globalnie 15 Hz przed benchmarkiem. Zamiast tego:

- najpierw mierzyć koszt mirror jako koszt per rendered mirror pass,
- potem mierzyć średnią częstotliwość faktycznych mirror renders,
- dopiero wtedy dobrać cadence dla heavy-load tieru.

Dla adaptive cadence wymagana jest hysteresis, aby uniknąć przełączania 30 ↔ 15 Hz przy granicy budżetu.

---

# 7. Verification matrix

## Baseline

Najpierw uruchomić świeży browser benchmark po Research 019 / obecnym main i zapisać:

- FPS avg / p50 / p95 / max,
- frame avg / p95 / max,
- total draw calls,
- total triangles,
- mirror draw calls,
- mirror triangles,
- WATER,
- RENDER,
- loaded chunks,
- NPC/fauna count.

To jest wymagane, bo Research 019 ma status bez browser benchmarku po zmianach.

## Per-stage

| Stage | Główny sygnał | Oczekiwany efekt |
|---|---|---|
| Baseline | mirror calls/tris + WATER | ustalenie aktualnego kosztu |
| S | mirror calls/tris | mniej renderowanej sceny |
| M | mirror tris | mniej geometrii |
| L | WATER + frame p95 | adaptacja do obciążenia |

### Stop conditions

Revert konkretnej optymalizacji, jeśli:

- mirror draw calls lub triangles rosną bez kompensacji w WATER/RENDER,
- FPS/frame p95 nie poprawia się w ciężkich scenach,
- reflection pokazuje widoczne hard cutoffs,
- pojawia się LOD pop/flicker,
- streaming hitch lub main-thread cost rośnie przez przebudowę visibility,
- wzrasta liczba materiałów/program variants.

---

# 8. Out of scope

Nie robić w tym planie:

- zmian N8AO,
- zmian shadow pipeline,
- region vegetation batching (Plan 143),
- globalnego HLOD,
- occlusion culling całej sceny,
- WebGPU/GPU-driven renderer,
- zmian shader reflection contribution,
- zmian water geometry/generation,
- nowego systemu streamingu tylko dla reflection.

Te obszary mają osobne koszty i powinny mieć własne benchmarki/plany.

---

# 9. Oczekiwany rezultat

Docelowo:

```text
water mirror
  128² shared RT
  30 Hz cap
  layer filtering
  ↓
  reflection-specific culling
  ↓
  reflection LOD
  ↓
  adaptive budget only under load
```

Priorytetem jest **usunąć niepotrzebne renderowanie**, a dopiero potem obniżać resolution/cadence. Najważniejszym KPI pozostaje koszt `WATER` oraz liczba mirror draw calls/triangles, nie sam rozmiar render targetu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

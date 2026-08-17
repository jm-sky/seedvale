# Plan: Shadow Budget Optimization

**Created:** 2026-08-17
**Status:** `planned` 📋 — analiza kompletna, implementacja nierozpoczęta
**Priority:** 🟡 medium · **Effort:** M
**Depends on:** —

domain: `world-terrain`
tags: [fauna, settlements-npcs, items-player]

## Cel

Zmniejszyć koszt CPU/GPU shadow renderingu (jeden directional light, 1024² mapa, frustum 160×160 podążający za graczem) bez regresji wizualnej, opierając się wyłącznie na mechanizmach już istniejących w kodzie (dirty/budget hysteresis jak `aoBudget.ts`/`waterMirror.ts`, próg rozmiaru jak `SMALL_MESH_SHADOW_THRESHOLD`, render layers jak `AGENT_RENDER_LAYER`/`REFLECTION_SKIPPED_LAYER`). `docs/performance/README.md` §4.3 i §8 (P1) już oznaczają "shadow budget" jako P1 — ten plan go realizuje.

Ten plan **nie powtarza** ustaleń źródłowych dokumentów — czytać w całości przed implementacją:

- [`docs/performance/README.md`](../performance/README.md) §4.3, §6, §8
- [`docs/reviews/2026-08-12--005--performance-architecture-and-assets.md`](../reviews/2026-08-12--005--performance-architecture-and-assets.md) — A2 (pochodzenie `SMALL_MESH_SHADOW_THRESHOLD` i terrain-self-shadow toggle)
- [`docs/reviews/2026-08-15--013--architecture-and-performance-audit.md`](../reviews/2026-08-15--013--architecture-and-performance-audit.md)
- [`docs/reviews/2026-08-15--015--browser-performance-benchmark.md`](../reviews/2026-08-15--015--browser-performance-benchmark.md) — baseline liczby
- [`docs/research/2026-08-17--019--rendering-optimizations.md`](../research/2026-08-17--019--rendering-optimizations.md) §4.4 — punkt wyjścia tego planu ("Shadow map re-renders every frame ... Deliberately not stacked here")

## Metoda tej analizy

Statyczna analiza kodu (bez przeglądarki), zgodnie z zasadami CLAUDE.md. Przeczytane w całości: `src/world/createLights.ts`, `src/render/createRenderer.ts`, `src/world/waterMirror.ts`, `src/assets/loadGltf.ts`, `src/render/instancedProps.ts`, `src/terrain/buildChunkGeometry.ts`, `src/terrain/grass.ts` (fragment shadow-relevant), `src/settlement/props.ts` (fragment), `src/items/items.ts` (fragment), `src/render/aoBudget.ts`, `src/perf/isolationProbe.ts`, `src/app/gameLoop.ts` (fragment shadow/render order), `src/terrain/chunkManager.ts` (fragment terrain-shadow toggle); grep dla `castShadow`/`receiveShadow`/`shadow.`/`REFLECTION_SKIPPED_LAYER` w całym `src/`. Wszystkie stwierdzenia poniżej mają konkretny plik:linię — żadne nie jest domysłem z dokumentacji.

---

## Problem

`docs/performance/README.md` klasyfikuje shadows jako **HIGH** confirmed bottleneck (§4.3): "Shadow rendering multiplies scene work because shadow casters are rendered in an additional pass." Review 019 §4.4 zidentyfikował, że `renderer.shadowMap.needsUpdate = true` jest ustawiane **bezwarunkowo co klatkę** (`gameLoop.ts:1065`) — jedyny pass w całym render pipeline bez żadnej formy budżetowania (mirror ma throttling 30 Hz + budget fallback, AO ma hysteresis suppress/restore, god rays są warunkowo wyłączane) — i świadomie odłożył temat: *"Throttling it is a second temporal degradation on top of §2.2, and NPC/fauna motion makes it more visible than a stale reflection. Deliberately not stacked here."*

Nie ma dziś **żadnej** izolowanej metryki kosztu samego shadow pass — jest wliczony w kategorię `RENDER` razem z N8AO (który sam renderuje scenę drugi raz, research 019 §4.2) i beauty passem. Jedyne istniejące narzędzie do izolacji to `no-shadows` isolation probe (`src/perf/isolationProbe.ts:73-79`, uruchamiany jako część `?benchmark=*`).

## Obecny stan (zweryfikowany w kodzie)

### Konfiguracja światła / shadow mapy

`src/world/createLights.ts:24-45` — jedno `DirectionalLight`:

- mapa 1024² (opcja 512 przez `shadowMapSize` w `WorldConfig.postProcessing`, GUI "Shadow map size", `createDebugGui.ts:632-634`; 2048 zablokowane — `worldConfig.ts:459`),
- `PCFShadowMap` (`createRenderer.ts:34`, r182+ default, już soft),
- frustum ortho ±80 (X/Z), `near=1`, `far=200` — **stały rozmiar, 160×160 jednostek**,
- `sun.shadow.camera.layers.enable(AGENT_RENDER_LAYER)` — shadow camera widzi domyślną warstwę 0 + warstwę 2 (NPC/fauna); **nie** włącza warstwy 3 (`REFLECTION_SKIPPED_LAYER`),
- `follow(x, z)` (`createLights.ts:56-60`) przesuwa światło+target na pozycję gracza — wołane co klatkę w `gameLoop.ts:933`, więc frustum jest zawsze wycentrowany na graczu niezależnie od tego, czy gracz faktycznie się poruszył.

### Aktualizacja co klatkę — brak jakiegokolwiek budżetu

`gameLoop.ts:1063-1065`:

```ts
// Shadow map once, against the beauty camera — not during the mirror
// pass, which keeps `autoUpdate` off (plan 113 P1).
renderer.shadowMap.needsUpdate = true
```

To jest już poprawka z planu 113 (jedna aktualizacja/klatkę zamiast dwóch — raz dla mirrora, raz dla beauty). Ale **"raz na klatkę" wciąż oznacza "co klatkę"** — nie ma dirty-checka, nie ma throttlingu, nie ma warunku. Kontrast z resztą pipeline'u:

| Pass | Budżetowanie |
|---|---|
| Water mirror | 30 Hz cap + `shouldRenderMirror()` frame-budget fallback (`waterMirror.ts:41-73`) |
| N8AO | `shouldSuppressAo()` hysteresis na koszcie poprzedniej klatki (`aoBudget.ts`) |
| God rays | `enabled` flippowany z `intensity > 0.001` (`createPostProcessing.ts`, research 019 §2.4) |
| **Shadow map** | **brak — zawsze `needsUpdate = true`** |

### Dirty-state — nie istnieje żaden mechanizm

Grep potwierdza: nigdzie w `src/` nie ma flagi typu "coś w obrębie shadow frustum się zmieniło". Shadow pass zawsze re-renderuje wszystko, co przecina orto-frustum ±80 wokół gracza, niezależnie od tego, czy cokolwiek tam faktycznie się poruszyło.

### Distance-based shadow caster filtering — **już częściowo zaimplementowane**

To jest kluczowe odkrycie tej analizy, sprzeczne z założeniem zlecenia, że to temat otwarty:

- **NPC** (`src/ai/NpcAgent.ts:1275-1279`) i **fauna** (`src/fauna/AnimalAgent.ts:1106-1110`) mają **już** dynamiczne, per-agent `castShadow` sterowane dystansem od gracza:

  ```ts
  const shadowCasting = dist <= NPC_SHADOW_DISTANCE   // = 36 (NpcAgent.ts:124)
  // analogicznie FAUNA_SHADOW_DISTANCE = 36 (AnimalAgent.ts:52)
  if (shadowCasting !== this.lastShadowCasting) {
    this.lastShadowCasting = shadowCasting
    setSubtreeCastShadow(this.mesh, shadowCasting)
  }
  ```

  Guard na zmianę wartości (nie ustawia `castShadow` co klatkę), próg 36 j. dobrze mieści się w ±80 frustum. **Nic do zrobienia tutaj** — mechanizm jest poprawny i już przechodzi przez `setSubtreeCastShadow` (`waterMirror.ts:81-86`), ten sam współdzielony helper co `AGENT_RENDER_LAYER`.
- **Terrain**: nie ma per-chunk dystansowego togglowania `castShadow`, ale **nie jest to potrzebne** — Three.js robi frustum culling per-obiekt w `WebGLShadowMap.render()` dokładnie tak samo jak w głównym passie (`Frustum.intersectsObject`), więc chunki poza orto-frustum ±80 **już nie są rysowane** w shadow passie mimo `castShadow = true`. Jest za to globalny toggle `ChunkManager.setTerrainCastsShadow` (`chunkManager.ts:412-414,1668-1673`, GUI "Terrain self-shadow", domyślnie `true`) — perf review 005 A2/#13, świadomie zostawiony jako opt-in (ryzyko wizualne na stromych zboczach), nie hardcoded off. Zbudowanie osobnego dystansowego mechanizmu dla terenu byłoby duplikatem tego, co silnik już robi za darmo.
- **Vegetation/props (region-batched `InstancedMesh`, plan 143)**: LOD (`setLodFraction`, `instancedProps.ts:205-208`) zawęża `mesh.count` — to samo `count` jest używane przez main pass **i** shadow pass, więc odległa roślinność już rzuca proporcjonalnie mniej cieni bez dodatkowego kodu. Bounding-sphere culling regionu (±192 m/region) jest jeden dla obu passów. Region-level "wszystko albo nic" overdraw na granicy frustum (patrz `docs/research/2026-08-17--020...` §6) jest już świadomym trade-offem z planu 143, ograniczonym do garstki regionów blisko gracza dla shadow frustum (mniejszy niż main-camera frustum) — nie warto go tu ruszać.

### Small/distant props — częściowo pokryte, jedna realna luka

- `src/assets/loadGltf.ts:19-26,54` — każdy mesh z GLB poniżej `SMALL_MESH_SHADOW_THRESHOLD = 0.5` m (przekątna bbox) ma `castShadow = false`. Pokrywa **wszystkie** GLB (drzewa, domy, fauna, propsy MegaKit).
- `src/settlement/props.ts:1091` (`createReed`), `:1142` (`createRockCluster` pebbles) — ten sam próg zastosowany ręcznie dla proceduralnych mikro-propsów, z komentarzem odsyłającym do review 005 A2.
- `src/terrain/grass.ts:444-445` — trawa: `castShadow = false` na starcie (nigdy nie było inaczej).
- `src/terrain/chunkManager.ts:1146` — `rec.items` (przedmioty generowane wraz z chunkiem — patyki, kamienie, jagody) dostają `assignRenderLayer(rec.items, REFLECTION_SKIPPED_LAYER)` (research 019 §2.3). `assignRenderLayer` używa `layers.set()` (**zamienia**, nie dodaje) — te itemy są teraz **wyłącznie** na warstwie 3. Shadow camera włącza tylko warstwy 0+2 (patrz wyżej) → **te konkretne itemy już nie rzucają cieni**, przypadkowy pozytywny efekt uboczny research 019, nieudokumentowany tam jako taki.
- **Luka**: `src/items/items.ts`'s `createItemMesh()` (fallback proceduralny gdy nie ma preloadowanego GLB dla danego `ItemKind` — `stone`/`shell`/`branch`/`mushroom`/`flower`/`cone`/`knife`/inne, linie 378-800+) ustawia `castShadow = true` **bezwarunkowo**, bez progu rozmiaru, mimo że te kształty są rzędu 0.1-0.4 m — wyraźnie poniżej `SMALL_MESH_SHADOW_THRESHOLD`. Ten sam mesh jest używany przez:
  - `src/items/createItemSpawners.ts:142` (spawnery zasobów — thicket/stone/etc. pool) — **nie ma** przypisania `REFLECTION_SKIPPED_LAYER`, zostaje na domyślnej warstwie 0 → shadow camera go widzi.
  - `src/items/createDroppedItems.ts:53` (przedmioty upuszczone przez gracza) — tak samo, brak przypisania warstwy.
  
  Czyli: itemy generowane przez chunk generation (`rec.items`) już nie rzucają cienia (przypadkiem), ale identyczne geometrie z `ItemSpawner`/`DroppedItems` — wciąż tak, mimo że wizualnie to te same małe kształty. Realna, tania do naprawienia niespójność.

### Instrumentacja pomiaru

`src/perf/isolationProbe.ts:73-79` — istniejący `no-shadows` probe (`host.sun.castShadow = false`, próbkuje `RENDER` przez `PROBE_SAMPLE_MS = 400` ms) uruchamiany jako część `?benchmark=*`. To jest **jedyny dziś dostępny sposób** odseparowania kosztu shadow pass od reszty `RENDER` (który zawiera też N8AO drugi scene-submit i beauty pass). Nie ma per-pass `performance.mark`/`measure` (research 019 §4.5 — ten sam brak dotyczy mirrora).

---

## Zakres tego planu

Wyłącznie shadow rendering: konfiguracja mapy, lifecycle aktualizacji, caster participation (terrain/vegetation/settlement/props/items/NPC/fauna). **Nie** N8AO drugi scene-submit (research 019 §4.2, osobny temat), **nie** instanced-prop fragmentation poza tym co już robi plan 143, **nie** water mirror (już zoptymalizowany, research 019 §2.1-2.2), **nie** O(N²) proximity scans (issue 031, osobny temat CPU nie GPU/shadow).

---

## Rekomendowane zmiany

### R1 — Dirty/budget shadow map update (pull-based, fail-open)

**Obecny mechanizm:** `renderer.shadowMap.needsUpdate = true` bezwarunkowo, `gameLoop.ts:1065`.

**Problem/koszt:** Shadow pass renderuje na nowo pełny zestaw casterów w orto-frustum ±80 co klatkę, nawet gdy nic w tym obszarze się nie poruszyło (gracz stoi, brak pobliskich NPC/fauny, brak streamingu). Jedyny pass bez żadnej formy throttlingu/hysteresis, mimo że wzorzec (`shouldRenderMirror`, `shouldSuppressAo`) już istnieje w repo dwa razy.

**Proponowana zmiana:** Nowy czysty, testowalny moduł `src/render/shadowBudget.ts` (styl `aoBudget.ts`/`waterMirror.ts`'s `shouldRenderMirror`) z funkcją `shouldUpdateShadowMap(state): boolean`. Dirty = `true` gdy **którykolwiek** z (pull-based, liczony na nowo co klatkę, zero opt-in po stronie innych systemów):

1. Pozycja gracza przesunęła się > epsilon (np. 0.05 m) od pozycji użytej przy ostatniej aktualizacji shadow mapy — pokrywa `lights.follow()`'s przesunięcie frustum i cień samego gracza. Tania (jeden `distanceToSquared` w `gameLoop.ts`, tam gdzie już wołane jest `lights.follow(...)`, linia 933).
2. Co najmniej jeden NPC lub zwierzę znajduje się w promieniu `NPC_SHADOW_DISTANCE`/`FAUNA_SHADOW_DISTANCE` (36 j.) od gracza — reużywa dokładnie te same stałe, które NPC/AnimalAgent już liczą dla własnego `castShadow` togglingu (§"Distance-based..." wyżej). **Fail-open z premedytacją**: nie próbujemy śledzić, czy dany agent faktycznie ruszył się tę konkretną klatkę (to byłby prawdziwy correctness footgun — cichy, trudny do zauważenia bug przy pominiętej fladze) — jeśli cokolwiek animowanego jest w zasięgu, zakładamy dirty. Przy obecnych populacjach (13-43 NPC w benchmarkach) to praktycznie zawsze `true` w scenariuszach `current`/`settlement` — patrz "Nie da się wiarygodnie oszacować" niżej.
3. Bezpiecznik: wymuszona aktualizacja co N klatek (np. 10) niezależnie od (1)/(2) — ubezpieczenie na wypadek pominiętego zdarzenia streamingu (patrz punkt 3 niżej), ogranicza maksymalną "nieświeżość" cienia do ułamka sekundy nawet przy błędzie w logice.

Punkt (3) obsługuje przypadek "gracz stoi w miejscu, ścina drzewo, cień drzewa powinien zniknąć/zmienić się" — bez dedykowanego hooka na `refreshTreeVisual`/chunk load-unload/`scorchTerrain` ten przypadek czekałby do najbliższego wymuszonego odświeżenia (do N klatek opóźnienia, nie permanentnie zawieszony — to jest różnica między "trochę spóźniony" a "trwale zepsuty"). Jeśli po zaimplementowaniu (1)+(2)+(3) i benchmarku okaże się to zauważalne wizualnie, dodać jawne wywołanie `markShadowDirty()` w tych czterech miejscach (małe, punktowe zmiany) — nie robić tego prewencyjnie.

**Dokładne miejsce:** nowy `src/render/shadowBudget.ts` (czysta logika + testy jednostkowe, analogicznie do `waterMirror.test.ts`), wpięcie w `gameLoop.ts` obok istniejącego `lights.follow(...)` wywołania (linia 933) i przy `renderer.shadowMap.needsUpdate = true` (linia 1065).

**Zależności:** żadne nowe — reużywa `NPC_SHADOW_DISTANCE`/`FAUNA_SHADOW_DISTANCE` (eksportować z `NpcAgent.ts`/`AnimalAgent.ts` jeśli dziś nieeksportowane), `bundle.fauna.getAgents()`, `bundle.settlementsManager.getLoaded()` (już wołane gdzie indziej w `gameLoop.ts`, wzorzec P5' z review 005 — liczyć raz, nie duplikować).

**Wpływ CPU:** Marginalny narzut liczenia warunku (jedno porównanie dystansu gracza + O(nearby NPC/fauna) scan, ten sam rząd co istniejące per-frame scany P4'/P5'). Zysk: pominięty `WebGLShadowMap.render()` (traversal sceny + depth draw calls) w klatkach, gdzie warunek jest `false`.

**Wpływ GPU:** Główny oczekiwany zysk — pominięte depth draw calls/fill dla całego shadow-castującego zestawu w "czystych" klatkach.

**Ryzyko artefaktów wizualnych:** Niskie przy fail-open designie opisanym wyżej (pkt 2+3), ale **realne i niezerowe**: opóźniony cień o do N klatek dla zdarzeń niepokrytych przez (1)/(2) (chop drzewa, chunk load/unload, terrain scorch) w momencie gdy gracz akurat stoi w miejscu. Wymaga weryfikacji wizualnej (§Visual verification).

**Ryzyko regresji:** Niskie — cały mechanizm jest addytywny (nowy moduł + kilka linii w `gameLoop.ts`), nie zmienia istniejących per-agent `castShadow` togglingu ani `setTerrainCastsShadow`.

**Trudność implementacji:** Średnia — logika sama w sobie prosta i testowalna, ale wymaga dostępu do kilku istniejących struktur z `gameLoop.ts` (fauna/settlements) w jednym miejscu.

**Zakres:** `S/M`.

**Szacowany zysk:** Nie da się wiarygodnie oszacować bez benchmarku. Silna zależność od scenariusza:

- Scenariusze `current`/`settlement` (42-43 NPC, benchmark 015) — warunek (2) będzie `true` niemal zawsze → **oczekiwany zysk bliski zeru** w tych konkretnych, najcięższych scenariuszach.
- Scenariusze z małą populacją w zasięgu 36 j. i nieruchomą kamerą (menu otwarte, dialog, budowanie/crafting, celowanie, `forest`/`stress` bez pobliskich NPC) — realny, ale niezmierzony potencjał; zysk górny ograniczony przez to, co pokazuje istniejący `no-shadows` isolation probe (górna granica = "shadow pass całkowicie wyłączony").

**Rekomendacja wdrożenia:** implementować **tylko punkty (1)+(2)+(3)** w pierwszym kroku (zero push-based coupling, zero opt-in po stronie innych systemów — bezpieczne). Zmierzyć. Rozszerzać o jawne dirty-hooki (chunk/tree/terrain) tylko jeśli benchmark + test wizualny pokażą realny problem.

### R2 — Próg rozmiaru dla proceduralnych fallbacków przedmiotów

**Obecny mechanizm:** `SMALL_MESH_SHADOW_THRESHOLD = 0.5` m stosowany konsekwentnie dla GLB (`loadGltf.ts:54`) i ręcznie dla kilku proceduralnych propsów osady (`createReed`/`createRockCluster`, `props.ts:1091,1142`).

**Problem/koszt:** `src/items/items.ts`'s `createItemMesh()` (proceduralny fallback gdy `ItemKind` nie ma preloadowanego GLB — `itemModels.ts`) ustawia `castShadow = true` bezwarunkowo dla kształtów rzędu 0.1-0.4 m (`stone`/`shell`/`branch`/`mushroom`/`flower`/`cone`, plus narzędzia typu `knife` — sprawdzić realne bbox pozostałych fallbacków podczas implementacji, część narzędzi typu siekiera/widły może być bliżej/powyżej progu przez długi trzonek). Te meshe są używane przez `ItemSpawner` (`createItemSpawners.ts:142` — pula zasobów typu thicket/stone) i `DroppedItems` (`createDroppedItems.ts:53` — przedmioty upuszczone przez gracza), **nie** przez `rec.items` z `chunkManager.ts`, które już (przypadkiem, via research 019's `REFLECTION_SKIPPED_LAYER` reassignment) nie są widoczne dla shadow camery.

**Proponowana zmiana:** W `createItemMesh()` (albo bezpośrednio przy tworzeniu każdego proceduralnego kształtu) zastosować ten sam próg co `loadGltf.ts` — najprościej: policzyć bbox po zbudowaniu meshu/grupy i ustawić `castShadow = diagonal >= SMALL_MESH_SHADOW_THRESHOLD` zamiast `true` na sztywno. Rozważyć eksport stałej z `loadGltf.ts` (albo przeniesienie do wspólnego małego modułu, np. `src/render/shadowThresholds.ts`, jeśli `loadGltf.ts` nie jest naturalnym miejscem importu dla `items.ts`) zamiast duplikować wartość `0.5`.

**Dokładne miejsce:** `src/items/items.ts` (`createItemMesh`, linie ok. 378-800), ewentualny mały shared-constant refactor dotykający `src/assets/loadGltf.ts`.

**Zależności:** żadne nowe systemy — rozszerza istniejący próg na kolejny (już znany) przypadek użycia.

**Wpływ CPU:** Pomijalny (jednorazowy koszt przy tworzeniu meshu, nie per-frame).

**Wpływ GPU:** Mały, ale zerokosztowy do zdobycia — usuwa draw calle z shadow passu dla najmniejszych, najliczniejszych światowych obiektów (zbierackie itemy), analogicznie do już zaakceptowanego `createReed`/`createRockCluster` precedensu.

**Ryzyko artefaktów wizualnych:** Bardzo niskie — te obiekty są już poniżej progu, który review 005 A2 i research 019 uznały za "bez zmiany wyglądu" dla identycznej klasy obiektów.

**Ryzyko regresji:** Bardzo niskie.

**Trudność implementacji:** Niska.

**Zakres:** `S`.

**Szacowany zysk:** Nie da się wiarygodnie oszacować bez benchmarku ani bez policzenia dokładnej liczby jednocześnie obecnych `ItemSpawner`/`DroppedItems` instancji w typowej scenie (zależne od tego, ile `ItemKind` faktycznie trafia na proceduralny fallback vs. ma GLB — zweryfikować `itemModels.ts` podczas implementacji). Rząd wielkości: dziesiątki draw calli w shadow passie w scenach z wieloma aktywnymi spawnerami — mały, ale praktycznie zero-risk.

---

## Optional changes

### O1 — Audyt pozostałych proceduralnych propsów osady pod kątem progu rozmiaru

`src/settlement/props.ts` ma dziesiątki funkcji `createXxx` z ręcznym `castShadow = true` (kubły, narzędzia, snopki, elementy studni, itp.) — część jest już instancowana przez `buildInstancedProps` (baryłki/siano/koryta/krzaki/palisada, patrz `buildSettlementProps`), więc koszt shadow pass skaluje się tam z liczbą instancji × trójkątów proporcjonalnie do rozmiaru wizualnego, a nie z liczbą draw calli (ten problem już rozwiązał plan 087/143 dla osady). Warto przejrzeć tylko te **nieinstancowane** pojedyncze propsy poniżej ~0.5 m (jeśli takie zostały) pod kątem tego samego progu co R2 — ale bez konkretnej listy kandydatów znalezionej w tej analizie (większość sprawdzonych propsów osady to obiekty >0.5 m: baryłki, koryta, studnia, itp., dla których cień ma realną wartość wizualną). **Nie robić prewencyjnie** — tylko jeśli podczas implementacji R2 znajdzie się konkretny, mały, nieinstancowany prop.

**Klasyfikacja:** optional. **Zakres:** `S` (jeśli w ogóle się okaże potrzebne).

### O2 — Rozszerzyć `no-shadows` isolation probe o wariant "shadow-budget-forced-off"

Jeśli R1 zostanie zaimplementowane, warto dodać do `src/perf/isolationProbe.ts` osobny probe, który wymusza `shouldUpdateShadowMap` na `false` przez cały czas próbkowania (nie to samo co `no-shadows` — to mierzy "shadow całkowicie wyłączony", nowy probe mierzyłby "shadow pass w stanie non-dirty" jako sanity check budżetu). Wartościowe tylko jako pomoc przy weryfikacji R1, nie samo w sobie.

**Klasyfikacja:** optional, warunkowe na R1. **Zakres:** `S`.

---

## Rejected / not worth the risk

### X1 — Dedykowany dystansowy `castShadow` toggle dla terenu (per-chunk)

Three.js już robi to za darmo przez `WebGLShadowMap`'s per-obiektowy frustum culling na orto-kamerze cienia (identyczny mechanizm jak main-camera culling). Zbudowanie równoległego, ręcznego systemu dystansowego dla terenu **duplikowałoby istniejący mechanizm silnika** — dokładnie to, przed czym ostrzega CLAUDE.md ("Does it create a second implementation of an existing mechanic?"). Istniejący globalny toggle (`setTerrainCastsShadow`) już adresuje jedyny realny problem terenu (samo-cieniowanie/shadow acne), zostaje bez zmian.

### X2 — Dystansowy `castShadow` toggle dla NPC/fauna

Już zaimplementowane (`NPC_SHADOW_DISTANCE`/`FAUNA_SHADOW_DISTANCE = 36`, patrz "Obecny stan"). Nic do zrobienia.

### X3 — Zmniejszenie orto-frustum shadow camery (±80 → mniej)

Analogia do research 019 §4.1 (odrzucone skrócenie `mirrorCamera.far`): bez pomiaru, ile realnej geometrii faktycznie znajduje się blisko krawędzi ±80, zmniejszenie frustum ryzykuje widoczne obcinanie/pop-in cieni na granicy bez potwierdzonego zysku. Frustum jest już z natury dużo mniejszy niż zasięg głównej kamery (`camera.far = 500`, mgła do ~280), więc nie jest oczywistym sufitem kosztu jak w przypadku mirrora. Nie robić bez wcześniejszego benchmarku pokazującego, że ±80 faktycznie łapie nadmiarową geometrię.

### X4 — Region-level per-instance shadow culling dla roślinności

Zidentyfikowany w analizie (region-batched `InstancedMesh`'s bounding sphere może objąć więcej instancji niż faktycznie przecina wąski ±80 shadow frustum na granicy regionu) — ale to jest świadomy, zmierzony trade-off z planu 143 (research 020 §6), dotyczący **obu** passów (main i shadow), nie specyficzny dla cieni, i ograniczony do garstki regionów blisko gracza dla akurat tego (małego) frustum. Budowanie per-instance cullingu byłoby dokładnie tym, co plan 143 explicite odrzucił ("Per-instance frustum cullingu... poza zakresem, region-level bounding sphere wystarcza przy tej skali") — nieproporcjonalny refaktor dla niepotwierdzonego zysku.

### X5 — Zmiana domyślnego rozmiaru shadow mapy (1024 → 512)

Już jest to GUI-eksponowany, opt-in suwak jakości (`shadowMapSize`), nie hardcoded. Zmiana defaultu to czysta regresja wizualna bez związanego z tym planem uzasadnienia — poza zakresem.

### X6 — Nowa, ogólna instrumentacja `performance.mark` per-pass (research 019 §4.5)

Realny, uznany brak (dotyczy też mirrora), ale **nie jest potrzebny do wykonania tego planu** — istniejący `no-shadows` isolation probe już umożliwia odseparowanie kosztu shadow pass wystarczające do weryfikacji R1/R2. Dodanie pełnej per-pass instrumentacji to osobny, szerszy temat (dotyczy też mirrora, N8AO, itp.) — nie rozszerzać zakresu tego planu o nią.

---

## Zależności

Brak twardych zależności planistycznych (`Depends on: —`). Miękka zależność implementacyjna: R1 powinno być zaimplementowane i zbenchmarkowane **przed** ewentualnym O2 (probe ma sens tylko jeśli R1 istnieje). R2 jest całkowicie niezależne od R1 i może być zrobione osobno/pierwsze (mniejsze ryzyko, szybsza weryfikacja).

---

## Kolejność implementacji

1. **R2 (item shadow threshold)** — najpierw: zero ryzyka, S effort, natychmiastowa weryfikacja wizualna (małe pickupy nie powinny wyglądać inaczej — porównanie z już zaakceptowanym `createReed`/`createRockCluster` precedensem). Commit + benchmark osobno od R1, żeby nie mieszać dwóch niezależnych efektów w jednym pomiarze.
2. **Benchmark punkt kontrolny** — `?benchmark=stream` (najcięższy, najbardziej reprezentatywny wg research 018/019) + `?benchmark=settlement`/`current` po R2, porównanie z baseline (review 015 + jeśli dostępny świeższy `no-shadows` isolation probe wynik).
3. **R1 (dirty/budget shadow update), tylko punkty (1)+(2)+(3)** — po R2, żeby R2 nie mieszało się z pomiarem R1's efektu.
4. **Benchmark + test wizualny R1** — patrz §Performance benchmark i §Visual verification. **Bramka decyzyjna**: jeśli scenariusze `current`/`settlement` (najcięższe, najbardziej reprezentatywne) nie pokazują mierzalnej poprawy, to jest zgodne z przewidywaniem tej analizy (populacja NPC w zasięgu 36 j. sprawia, że warunek (2) jest niemal zawsze `true`) — nie traktować jako porażkę implementacji, udokumentować w implementation notes i rozważyć, czy scenariusze z mniejszą populacją (np. dedykowany "empty wilderness, stationary camera" scenariusz, jeśli benchmark framework na to pozwala) pokazują zysk.
5. **Dopiero jeśli R1 (1)+(2)+(3) pokaże w teście wizualnym realny problem z opóźnionymi cieniami po chop/streaming zdarzeniach** — rozszerzyć o jawne dirty-hooki w czterech znanych miejscach (`refreshTreeVisual`/chunk attach/chunk unload/`scorchTerrain`). Nie robić tego prewencyjnie.
6. **O1/O2** — tylko jeśli poprzednie kroki pokażą konkretną potrzebę.

Każdy krok osobny commit, żeby benchmark po każdym był jednoznaczny (zgodnie z `docs/performance/README.md` §9 "change one thing → benchmark → keep/improve/revert").

---

## Visual / browser verification

Wymagane po R2:

1. Zebrać kilka przedmiotów typu kamień/muszla/gałąź/grzyb/kwiatek/szyszka rozrzuconych w świecie (spawner pool i/lub upuszczone przez gracza) o zachodzie/wschodzie słońca (niski kąt światła, najbardziej widoczny na cieniach) — potwierdzić brak zauważalnej różnicy wizualnej (te obiekty są analogiczne wielkościowo do już zaakceptowanych bez cienia `createReed`/`createRockCluster`).

Wymagane po R1:

1. **Shadow popping / pojawianie się/znikanie cieni** — chodzić w otwartym terenie z dala od NPC/fauny, obserwować cień gracza i pobliskiej roślinności/terenu podczas ruchu i podczas stania w miejscu; potwierdzić brak widocznego "przeskoku" cienia przy przejściu dirty→clean→dirty.
2. **Granice chunków** — przejść przez kilka granic chunków (load/unload) stojąc względnie blisko granicy shadow frustum (±80 od gracza); sprawdzić, czy nowo załadowany teren/roślinność ma poprawny cień od razu, czy z opóźnieniem do bezpiecznika (N klatek).
3. **NPC i animals** — podejść do osady z wieloma NPC (np. scenariusz `settlement`/`current` z benchmarku), potwierdzić że cienie NPC/zwierząt poruszają się płynnie bez laga (oczekiwane: populacja w zasięgu 36 j. sprawia, że dirty jest praktycznie zawsze `true`, więc **nie powinno być różnicy** względem stanu przed zmianą — to jest sam w sobie test regresji).
4. **Ścięcie drzewa blisko gracza, gracz stoi w miejscu** — sprawdzić, czy cień znikniętego/zmienionego drzewa aktualizuje się w rozsądnym czasie (do N klatek bezpiecznika, patrz R1). Jeśli widocznie zauważalne opóźnienie — patrz krok 5 kolejności implementacji.
5. **Terrain self-shadow toggle** — z GUI włączonym/wyłączonym, potwierdzić że R1 nie psuje istniejącego `setTerrainCastsShadow` (globalny toggle powinien nadal działać identycznie, niezależnie od dirty-state).
6. **Water mirror** — potwierdzić, że reflection nadal pokazuje poprawne cienie (mirror ma własny `shadowMap.autoUpdate = false` scoped do jego renderu, `waterMirror.ts:231-239` — R1 nie powinno tego dotykać, ale zweryfikować że kolejność `renderMirror()` → `shadowMap.needsUpdate` (R1) → `postProcessing.render()` w `gameLoop.ts` zostaje niezmieniona).
7. **Przejścia LOD roślinności** (region-level `setLodFraction`) — sprawdzić, że cień roślinności redukuje się/przyrasta razem z widoczną gęstością, bez oddzielnego "cień jest, obiektu nie ma" artefaktu (nie powinno się zmienić przez ten plan, ale to jedyny punkt styku R1 z LOD-em wart potwierdzenia).

---

## Performance benchmark

**Metryki:** FPS avg/min/p1, frame avg/p95/max, `RENDER` (ms), draw calls, triangles, `renderer.info` gdzie dostępne — te same pola co `?benchmark=*` już raportuje (`docs/reviews/2026-08-15--015...`). Dodatkowo: wynik `no-shadows` isolation probe (górna granica możliwego zysku) i, jeśli R1 wdrożone, ewentualny nowy probe z O2.

**Gdzie mierzyć:** `?benchmark=stream` (najcięższy, reprezentatywny per research 018/019), `?benchmark=settlement` i `?benchmark=current` (najwyższa populacja NPC — scenariusz, w którym R1 przewidywalnie daje najmniej), `?benchmark=forest` (niska populacja — scenariusz, w którym R1 przewidywalnie daje najwięcej, jeśli w ogóle).

**Scenariusz:** Ten sam protokół co review 015: seed 42, quality High, `res=193`, pixel ratio 1, 30 s, `Emulation.setDeviceMetricsOverride` do stałego canvasu (1068×906) żeby wyniki były porównywalne z istniejącym baseline.

**Baseline:** review 015 (2026-08-15) — patrz `docs/performance/README.md` §3 dla tabeli. **Uwaga:** ten baseline poprzedza research 019's zmiany (grass/items skip reflection, god rays conditional) — przed uznaniem czegokolwiek za regresję/poprawę **odświeżyć baseline na obecnym `main`** (przed R2/R1) jako punkt zero tej konkretnej sesji, bo `docs/performance/README.md` §3 sam mówi: "Rendering changes made afterwards require a fresh browser benchmark before being treated as the current baseline."

**Wynik po zmianie:** Wypełnić tabelę before/after po R2 osobno i po R1 osobno (nie łączyć). Format jak w innych planach (`docs/plans/2026-08-17--143...`'s "vegetation/environment draw calls −18%/−21%").

**Shadow map update cost osobno:** Możliwe do odseparowania **wyłącznie** przez istniejący `no-shadows` isolation probe (mierzy górną granicę: "shadow całkowicie wyłączony" vs "shadow włączony", nie granularność dirty-state). Nie ma dziś sposobu zmierzyć konkretnie ile z `RENDER` bucket to shadow pass w danej klatce bez X6 (odrzucone jako poza zakresem) — jeśli to się okaże krytyczne dla oceny R1, rozważyć minimalny `performance.mark` tylko wokół shadow-related sekcji jako mikro-dodatek do R1, nie osobny projekt.

**Warunki testu:** Bez HMR w trakcie serii pomiarów (jak review 015), Vite dev server, ten sam viewport/DPR override we wszystkich przebiegach jednej sesji.

Nie deklarować żadnej poprawy wydajności jako potwierdzonej przed wykonaniem tego benchmarku.

---

## Kryteria sukcesu

- R2: zero regresji wizualnej (test §Visual verification #1), technicznie zielone `tsc`/`lint`/`build`/`test`, brak wzrostu draw calls/triangles w żadnym scenariuszu benchmarku.
- R1: brak regresji wizualnej w żadnym z 7 punktów §Visual verification; brak wzrostu żadnej metryki benchmarku w żadnym scenariuszu (w najgorszym razie neutralne, nigdy gorsze — fail-open design ma to gwarantować z definicji, ale to trzeba potwierdzić pomiarem); mierzalna poprawa `RENDER`/frame avg **w co najmniej jednym** scenariuszu (oczekiwane: `forest`/scenariusz o niskiej populacji) traktowana jako sukces nawet jeśli `current`/`settlement` pozostają płaskie.
- Jeśli R1 nie pokazuje mierzalnej poprawy w **żadnym** scenariuszu benchmarku — udokumentować to jako wynik (nie porażkę realizacji planu, patrz krok 4 kolejności implementacji) i rozważyć, czy R1 zasługuje na rollback albo pozostanie jako "no-op dziś, przygotowanie pod przyszłą populację/scenariusze" — decyzja użytkownika po zobaczeniu liczb.

---

## Ryzyka

- **R1, opóźniony cień po zdarzeniu bez pokrycia w (1)/(2)** (chop drzewa/chunk streaming/terrain scorch podczas gdy gracz stoi w miejscu) — ograniczone przez bezpiecznik (3), ale niezerowe do czasu jego zadziałania. Wymaga jawnej weryfikacji wizualnej (§Visual verification #4).
- **R1, fałszywe poczucie "gotowego" na podstawie samej logiki testów jednostkowych** — `shouldUpdateShadowMap` jako czysta funkcja jest testowalna w izolacji (jak `shouldRenderMirror`), ale to **nie** zastępuje testu wizualnego w przeglądarce (CLAUDE.md: "Do not mark visual Three.js work as fully verified solely because TypeScript/lint/build pass").
- **R1, zysk skoncentrowany poza najcięższymi zmierzonymi scenariuszami** — realne ryzyko, że `current`/`settlement` (te, które `docs/performance/README.md` §3 traktuje jako baseline) pokażą zysk bliski zeru, co może rozczarowywać względem oczekiwań z dokumentacji źródłowej ("Medium" priority w tabeli P1). To jest przewidziane w tej analizie, nie niespodzianka po fakcie.
- **R2, niekompletny audyt `itemModels.ts`** — jeśli więcej `ItemKind` niż zakładano ma GLB (a nie proceduralny fallback), realny zestaw dotkniętych obiektów może być mniejszy niż analiza sugeruje — nie wpływa na bezpieczeństwo zmiany, tylko na wielkość zysku.

---

## Czego NIE zmieniać

- `NPC_SHADOW_DISTANCE`/`FAUNA_SHADOW_DISTANCE` i istniejący per-agent `castShadow` toggling (`NpcAgent.ts:1275-1279`, `AnimalAgent.ts:1106-1110`) — już poprawne, nie dotykać.
- `setTerrainCastsShadow` / `ChunkManager`'s terrain-shadow toggle — zostaje jako opt-in GUI toggle, domyślnie `true`.
- `sun.shadow.camera` frustum bounds (±80, `near=1`, `far=200`) — patrz X3.
- `src/render/instancedProps.ts`, `src/terrain/vegetationRegionBatcher.ts` — patrz X4, nie dotykać w ramach tego planu (zgodnie z planem 143's "Nie ruszać osady w tym planie" precedensem, ten plan analogicznie nie rusza region-batchingu).
- `src/world/waterMirror.ts`'s własna kolejność `shadowMap.autoUpdate` w obrębie renderu mirrora (linie 231-239) — R1 nie powinno tego dotykać, tylko zmienia **czy** `renderer.shadowMap.needsUpdate = true` jest ustawiane w `gameLoop.ts:1065`, nie logikę wewnątrz `waterMirror.render()`.
- Domyślny `shadowMapSize` (1024) i `PCFShadowMap` — patrz X5.
- N8AO drugi scene-submit (research 019 §4.2) — osobny temat, nie shadow-specific.

---

> **Zrób git commit i push do main, rebase jeżeli trzeba**

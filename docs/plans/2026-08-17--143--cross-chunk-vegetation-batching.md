# Plan: Cross-chunk Vegetation Batching

**Created:** 2026-08-17
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** —

domain: `world-terrain`

## Cel

Zredukować liczbę `InstancedMesh` / draw calli generowanych przez roślinność i drobne środowisko (`buildInstancedProps`) bez naruszenia streamingu chunków, unloadu, frustum cullingu, transformacji per-instancję ani innych systemów, które dotykają tych samych struktur (`treeLifecycle`, `refreshTreeVisual`, kolizje).

Pełna analiza architektoniczna (current state / bottleneck / porównanie opcji / uzasadnienie rekomendacji) jest w [research 020](../research/2026-08-17--020--cross-chunk-vegetation-batching.md) — ten plan **nie powtarza** tej analizy, tylko z niej korzysta. Przed implementacją przeczytać research 020 w całości, nie tylko ten plik.

## Stan obecny

`buildInstancedProps()` (`src/render/instancedProps.ts`) jest sam w sobie bezstanowy względem chunków — grupuje instancje po `(species, primitive)` w ramach jednego wywołania. Fragmentacja bierze się wyłącznie z tego, że `chunkManager.ts`'s `attachChunkContent()` wywołuje go **osobno dla każdego chunka i każdego rodzaju propa** (living trees / bush / cactus / reed / largeRock / rockCluster / fallenLog). Efektywny klucz batchowania to dziś `(chunk, kind, species, primitive)`.

Wynik (research 019 §4.3, potwierdzone w 020 §1-2): **311 `InstancedMesh` na 709 instancji ≈ 2,3 instancji/draw call**. Domyślna konfiguracja (`worldConfig.ts`): `chunkSize=64`, `loadRadius=3`, `unloadRadius=4` → do 49 chunków jednocześnie (do 81 z histerezą).

`src/settlement/props.ts` też woła `buildInstancedProps`, ale osada to stały footprint budowany/dispose'owany jednorazowo — nie ma tam granic chunków, więc już dziś ma efektywne cross-chunk batchowanie. **Nie ruszać osady w tym planie.**

---

# Architektura rozwiązania

Rekomendacja z research 020 §4: **batchowanie regionowe (stałe grupy chunków), rebuild-on-change**, bez globalnego batcha i bez trwałej tablicy slotów/instance-index.

    chunk load/unload event
        ↓
    region = floor(cx / N), floor(cz / N)   (N = REGION_CHUNKS, start: 3)
        ↓
    region trzyma Map<chunkKey, PropPlacement[]> per kind
        ↓
    rebuild tylko dotkniętego (region, kind):
      concat placements wszystkich aktualnie załadowanych chunków regionu
        ↓
    buildInstancedProps(...) — bez zmian w instancedProps.ts

Kluczowe decyzje (uzasadnienie w research 020 §4, nie powtarzać tu dyskusji):

- Region to **wyłącznie warstwa renderingu** — terrain mesh, water, grass, kolizje, items, tree lifecycle zostają w 100% chunk-scoped jak dziś. Nie tworzymy nowej jednostki streamingu.
- `tile.vegetation`/`tile.environment` są już cache'owane na `ChunkRecord.tile` dla każdego załadowanego chunka (potrzebne dla `modifyTerrain`/`scorchTerrain`) — rebuild regionu nie wymaga nowego storage, tylko iteracji po już-obecnych danych.
- Rebuild kosztuje O(placements w regionie), nie O(wszystkich załadowanych chunków) — niezależne od rozmiaru świata.
- LOD spada z granulacji per-chunk do per-region (jeden fraction na region, liczony z **najbliższego** chunka-członka regionu — konserwatywnie, nigdy nie zaniża gęstości bliskiego chunka).
- `removeByKey` (chop drzewa) zostaje logicznie bez zmian — klucze (`treeId`) są już globalnie unikalne — zmienia się tylko punkt wywołania (region zamiast `rec.treeInstances`).

## Wybór `REGION_CHUNKS`

Start: **3** (3×3 chunki ≈ 192 m). Nie zakładać z góry, że to optymalna wartość — zweryfikować przez pomiar (§Testy) i w razie potrzeby dostroić. Zbyt duży region = ryzyko z research 020 §6 (bounding sphere prawie zawsze w kadrze, rebuild kosztowniejszy niż budżet finalize).

---

# Zakres pracy

Kolejność z research 020 §5:

1. **`src/terrain/chunkGrid.ts`** (lub nowy mały moduł) — `regionKey(coord, regionChunks)` / `regionCoordOf(coord, regionChunks)`, czyste funkcje, analogiczne do istniejących `chunkKey`/`chunkCenter`. Testy jednostkowe.
2. **Nowy moduł `src/terrain/vegetationRegionBatcher.ts`** — `Map<regionKey, RegionRecord>`, gdzie `RegionRecord` trzyma per kind (`tree-living`, `bush`, `cactus`, `reed`, `largeRock`, `rockCluster`, `fallenLog`) `Map<chunkKey, PropPlacement[]>` + aktualny `InstancedPropGroup | undefined`. API:
   - `setChunkPlacements(chunkKey, kind, templates, placements)` — zapisz wkład chunka, rebuilduj (region, kind).
   - `clearChunkPlacements(chunkKey)` — usuń wkład chunka ze wszystkich kindów jego regionu, rebuilduj dotknięte (region, kind) (albo dispose, jeśli puste).
   - `removeByKey(chunkKey, key)` — redirect dla `refreshTreeVisual`.
   - `syncLod(playerChunk)` — odpowiednik `syncInstancedLodForRecord`, per region.
   - `dispose()` — pełny teardown.
   - Bookkeeping (dodawanie/usuwanie wkładu chunka, union placements) ma być testowalne bez sceny Three.js — czysta logika, styl `chunkManager.test.ts`.
3. **`src/terrain/chunkManager.ts`**:
   - `attachChunkContent()` — trzy miejsca wołające `buildInstancedProps` (living trees; bush/cactus/reed; largeRock/rockCluster/fallenLog) zamienić na `vegetationRegionBatcher.setChunkPlacements(...)`.
   - `ChunkRecord` — zdecydować podczas implementacji, czy `treeInstances`/`vegetationInstances`/`environmentInstances` znikają całkowicie, czy zostaje z nich tylko marker uczestnictwa (cokolwiek upraszcza `unload()`).
   - `unload()` — trzy bloki dispose zamienić na jedno `vegetationRegionBatcher.clearChunkPlacements(record.key)`.
   - `syncInstancedLodForRecord()` → przejść na batcher (`syncLod`), wołane z tych samych miejsc co dziś (`recheck()`, `setLodScale()`).
   - `refreshTreeVisual()` — `removeByKey` przez batcher (region z `rec.coord`).
4. **Dokumentacja** — jeśli zmienia się lista "important code entry points", zaktualizować [STATE.md](../STATE.md) / [ARCHITECTURE.md](../ARCHITECTURE.md) (dodać `vegetationRegionBatcher.ts`).

### Ważne

- Nie zmieniać `src/render/instancedProps.ts` — zostaje chunk-agnostyczny, używany bez modyfikacji.
- Nie ruszać `src/settlement/props.ts` ani jego wywołań `buildInstancedProps`.
- `removeByKey`'s `indexOf` scan (`instancedProps.ts`) zostaje O(n) per key w ramach jednego bucketa — przy skali regionu (więcej instancji w jednym buckecie niż dziś) rozważyć `Map<key, index>` jako mały, niskoryzykowny refaktor w ramach tego planu, jeśli profil pokaże, że to zauważalne — nie robić tego prewencyjnie bez powodu.
- Nie dodawać trwałej tablicy slot-allocation / free-list — świadomie odrzucone w research 020 §3-4 jako nieproporcjonalna złożoność do wygranej przy tej skali.

---

# Ryzyka

Pełna lista z uzasadnieniem w research 020 §6 — tu tylko checklist do zweryfikowania podczas implementacji/review:

- Rebuild regionu przy load/unload może przekroczyć istniejący budżet streamingu (`FINALIZE_DRAIN_BUDGET_MS = 8 ms`, 1 content job/frame) — mierzyć, nie zakładać.
- Zbyt duży `REGION_CHUNKS` = regresja frustum cullingu (bounding sphere regionu prawie zawsze w kadrze) — widoczne wprost w triangle count z `?benchmark=stream`.
- LOD per-region zamiast per-chunk może dać bardziej widoczny pop gęstości na granicy regionu — sprawdzić wizualnie.
- `refreshTreeVisual` (chop/regrow) musi trafiać w drzewo z właściwego regionu, nie usuwać instancji sąsiedniego chunka dzielącego region.
- `unload()` musi synchronicznie czyścić wkład chunka z regionu — żadnej roślinności niewidocznej-ale-renderowanej po unloadzie chunka.
- Home/pinned chunki (`config.homeChunks`) — sprawdzić, że poprawnie dołączają się do swojego regionu przy pierwszym load (geometrycznie mogą być daleko od aktualnie załadowanego zestawu regionów gracza).

---

# Testy

Zestaw z research 020 §7 — nie rozszerzać bez potrzeby:

1. `?benchmark=stream`, seed 42, quality High, pixel ratio 1, 30 s — jeden przebieg przed, jeden po. Patrzeć na: liczbę InstancedMesh/draw calli (powinna spaść ~proporcjonalnie do `REGION_CHUNKS²`), triangle count (**nie może wzrosnąć** — wzrost = regresja cullingu), frame avg/p95 (powinien się poprawić lub nie pogorszyć).
2. Manualny spacer przez granice kilku regionów (oba kierunki), obserwacja istniejącego monitora HITCH pod kątem `VEGETATION`/`STREAMING` przy ciągłym load/unload na granicy.
3. Unit testy: `regionKey`/`regionCoordOf`, bookkeeping batchera (dodanie chunka → union rośnie; usunięcie → union kurczy się do pozostałych chunków; `removeByKey` trafia we właściwy region).

## Unit / logic

- `regionKey`/`regionCoordOf` — deterministyczność, sąsiedztwo (chunki z tego samego regionu mapują na ten sam klucz).
- Batcher: add/remove chunk placements, poprawność unii, `removeByKey` redirect.

# Browser verification

Obowiązkowo po implementacji (dev server, nie headless):

1. Spacer przez kilka granic regionów — brak popu roślinności, brak "dziur" (roślinność znika/pojawia się poprawnie razem z chunkiem).
2. Ścięcie drzewa (`refreshTreeVisual`) blisko granicy regionu — usuwa właściwe drzewo, nie sąsiada z innego chunka.
3. `?benchmark=stream` przebieg (§Testy pkt 1).
4. Monitor HITCH podczas ciągłego przemieszczania się przez granice regionów.

# Out of scope

Nie robić w tym planie:

- Zmian w `src/render/instancedProps.ts`.
- Zmian w `src/settlement/props.ts` / batchowania osady.
- Globalnego (world-wide) batcha — odrzucone w research 020.
- Trwałej struktury slot-allocation / free-list dla instancji.
- Per-instance frustum cullingu (sortowanie bufora po widoczności) — poza zakresem, region-level bounding sphere wystarcza przy tej skali.
- Zmian w gęstości/generacji roślinności (`chunkVegetation.ts`/`chunkEnvironment.ts`) — sam pipeline placementów zostaje bez zmian, zmienia się tylko sposób ich batchowania do `InstancedMesh`.

---

# Rezultat

    311 InstancedMesh / 709 instancji (2,3/draw call, per-chunk)
        ↓
    region-scoped batching (N×N chunków, rebuild-on-change)
        ↓
    ~region-area razy mniej draw calli, ten sam frustum culling na poziomie regionu,
    bez zmian w instancedProps.ts, bez zmian w osadzie, bez nowego systemu slotów

> **Zrób git commit i push do main, rebase jeżeli trzeba**

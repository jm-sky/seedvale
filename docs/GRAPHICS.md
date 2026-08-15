# Seedvale — Graphics Log

**Purpose:** jeden source of truth dla decyzji, kontraktów i uwag o grafice / renderze / materiałach wizualnych.

**Nie jest:** listą assetów ([assets/](./assets/README.md)), stanem implementacji ([STATE.md](./STATE.md)), domeną wody ([WATER.md](./WATER.md)), ani planem ([plans/](./plans/README.md)). Tu zapisujemy *dlaczego* coś wygląda / renderuje się tak, a nie inaczej.

**Last updated:** 2026-08-15

Domena wody (stan, historia, kolejność poprawek): [WATER.md](./WATER.md). Tu zostają kontrakty G4–G6 i wpisy logu, które dotyczą renderu.

## Jak używać

1. Przed zmianą wizualną / materiałową / post-process — przeczytaj **Standing decisions** i najnowsze wpisy logu.
2. Po decyzji użytkownika lub po zweryfikowanym fixie — dopisz wpis (**najnowszy na górze**).
3. Issue/plan mogą szczegółować pracę; trwała reguła ląduje tutaj. Gdy kod i ten plik się rozmijają — zaufaj kodowi, potem zaktualizuj log.

Status wiedzy we wpisach (opcjonalnie): `✅` potwierdzone w przeglądarce · `🔧` zaimplementowane, bez browser check · `📝` decyzja / kierunek.

---

## Standing decisions

Trwałe reguły. Zmiana = nowy wpis w logu + aktualizacja tej sekcji.

| ID | Decyzja | Skutek |
|----|---------|--------|
| G1 | Symulacja / świat = **vanilla Three.js + WebGL2**. Bez React/R3F / drugiej abstrakcji renderu, dopóki nie ma osobnego planu. | `src/` game layer |
| G2 | **Performance jest constraint architektury** — nie dokładamy passów, mirror RT ani per-frame CPU „dla ładniejszej wody/liści” bez świadomej ceny. | [architecture/performance-and-workers.md](./architecture/performance-and-workers.md) |
| G3 | Liście / kwiaty z GLTF `alphaMode: BLEND` → przy loadzie **opaque `alphaTest` cutout** (`hardenFoliageAlpha`). Korony piszą depth. | `src/world/foliageWind.ts`, issue [022](./issues/2026-08-12--022--ocean-through-tree-foliage.md) |
| G4 | Woda transparentna: ocean i jeziora mają **`depthWrite: false`**. Nie łączyć `transparent` + `depthWrite: true` + wysokiego `renderOrder` — to maluje wodę przez korony. | `createOcean.ts`, `createWater.ts` |
| G5 | Ocean = **jeden** plane (follow gracza), nie per-chunk. Shader = rodzina jezior (`waterMaterial.ts`). Lustro sceny = jeden RT **128²** @ 30 Hz (`waterMirror.ts`), wyłącznik Vue; NPC/fauna poza lustrem (`AGENT_RENDER_LAYER`). | `createOcean.ts` |
| G6 | Jeziora = per-chunk ten sam shader, maska heightmap + głębokość z `floorHeights`. `bodyScale` 1 stroi ocean, nie discarduje piksela. | `createWater.ts`, `waterMaterial.ts`, `waterBodies.ts` |
| G7 | Post-process: EffectComposer + N8AO + SMAA (+ bloom / god rays / film grade). Hardware MSAA wyłączone (i tak bez efektu na targetach composera). | `createPostProcessing.ts`, `createRenderer.ts` |
| G8 | Weryfikacja wizualna = **przeglądarka**, nie sam `tsc`/lint/build. | `CLAUDE.md` |
| G9 | Droga = tint korytarza na meshu terenu (nie osobny mesh). Miękki brzeg + ziarno dirtu; trawa **soft-fade** w korytarzu, nie hard bald cut. Extra gęstość łąki = **near-field filler LOD**, nie globalny bump `grass.density`. | `chunkHeightmap` / `biomeColors` / `grass` / `chunkManager`, issue [023](./issues/2026-08-12--023--road-grass-ground-cover.md) |
| G10 | Asset alignment browser **Game-like** mode reuses `createRenderer` / `createLights` / `createSky` / `skyParamsFromTime` — no parallel preview rig. Post-processing composer runs in **single-view only** (not 4-up). | `src/tools/assetBrowser/`, plan [088](./plans/archive/2026-08-12--088--asset-alignment-browser.md) |
| G11 | Profile jakości Low/Medium/High/Custom sterują **tylko gałkami live** (pixel ratio, AO/bloom/god rays, odbicia, shadow map, LOD scale). Nie zastępują optymalizacji architektury i nie rebuildują świata. | `src/config/qualityProfiles.ts`, plan [103](./plans/2026-08-13--103--performance-diagnostics-benchmark.md) |

---

## Stack (skrót)

| Obszar | Gdzie |
|--------|--------|
| Renderer | `src/render/createRenderer.ts` |
| Post-process | `src/render/createPostProcessing.ts`, `gradedOutputPass.ts`, `godRaysShader.ts` |
| Ocean | `src/world/createOcean.ts` + `waterMaterial.ts` + `waterMirror.ts` |
| Jeziora | `src/world/createWater.ts` + `waterMaterial.ts` |
| Foliage wind + alpha harden | `src/world/foliageWind.ts` |
| GLB load / shared mats | `src/assets/loadGltf.ts` |
| Niebo / światło / dzień-noc | `src/world/createSky.ts`, `createLights.ts`, `dayNight.ts` |
| Teren / trawa / drogi (tint) | `src/terrain/buildChunkGeometry.ts`, `grass.ts`, `chunkHeightmap.ts`, `biomeColors.ts` |
| Modele / kredyty | [assets/](./assets/README.md) |

---

## Log

### 2026-08-15 — Rendering budget P0/P1 (plan 113) 🔧

- High: N8AO on at **Performance** + half-res; auto-suppress when last Render ms ≥ 15 (restore ≤ 10). Isolation probes cover bloom/SMAA/god rays/film grade.
- Shadow map: one update per game frame, after the water mirror, before beauty (`autoUpdate = false`).
- Settlement palisade / bushes / barrels / hay use `buildInstancedProps`. Harvestable trees stay individual.
- Water mirror 30 Hz, 128²; NPC/fauna on layer 2 so they skip the reflection pass.
- Grass/vegetation far LOD floor ~8% (was ~25%). Distant NPC/fauna drop `castShadow` beyond 36 units.
- Not in this pass: HLOD, TAA, WebGPU, cross-chunk vegetation merge. Browser `?benchmark=*` vs review 012 still open.

### 2026-08-14 — Quality profiles + perf diagnostics (plan 103) 🔧

- `src/perf/`: CPU timers per system (off by default), spike/budget detector, benchmark runner, JSON report.
- Pauza → Świat → Grafika: Low / Medium / High / Custom. Preset nie rusza `grass.density` / `terrain.resolution`.
- Adaptive Quality (`quality.adaptiveEnabled`) zapisane, niezaimplementowane.

### 2026-08-13 — Wanna terenu pod wodą (`floorHeights`) ✅

- Mesh chunka: Y / normalne / kolor z `floorHeights`, nie z clampowanego `heights`. Koniec zielonej tafli `SEABED` na powierzchni wody.
- `heights` nadal clamp dla maski wody, trawy, `sampleHeight`. Szczegóły: [WATER.md](./WATER.md).
- Browser: użytkownik 2026-08-13.

### 2026-08-13 — Faza 3: wspólne lustro wody 256² + toggle Vue ✅

- Jeden `WebGLRenderTarget` 256² (`waterMirror.ts`), kamera względem `y = waterLevel`; meshe wody na warstwie 1 (mirror camera tylko 0).
- `postProcessing.waterReflections` default on; off kasuje pass. Vue Pauza → Świat → Grafika; lil-gui Post-processing.
- G5 = stan kodu. Browser: użytkownik 2026-08-13. Plan 098 `done`.

### 2026-08-13 — Faza 2: jedna rodzina shadera wody + brzeg ✅

- `waterMaterial.ts` zastępuje Water.js i stary shader jeziora. Fale `world.xz`, depth z `floorHeights`, piana z maski, mokry piasek na terenie.
- Ocean singleton: radial fade poza loadRadius (chunk water rysuje plażę — issue 003).
- Lustro 256² wraca w fazie 3. G5/G6 = stan kodu. Browser: użytkownik 2026-08-13.

### 2026-08-13 — W8 faza 1: inland nie jest oceanem ✅

- `computeBodyScale`: ocean = niska kontynentalność; jeziora cap `LAKE_SCALE_MAX` 0.85 (poniżej discard 0.9). Usunięte `isLarge` / 35% chunka.
- Issue [028](./issues/2026-08-13--028--inland-water-dual-material.md) — `done`. Plan [098](./plans/archive/2026-08-13--098--water-unified-shader-shore-reflections.md) faza 1.

### 2026-08-13 — Kierunek wody: jedna rodzina, W8, lustro z Vue 📝

- W8 zaakceptowane. Target: jeden shader (jezioro jaśniejsze / ocean ciemniejszy+swell), depth fade, brzeg fade+piana+mokry piasek.
- Lustro sceny na obu, **jeden** RT 256², wyłącznik Pauza → Świat; off = sky+spec bez passu.
- G5/G6: geometria zostaje; Water.js i discard `vBodyScale` to stan kodu, nie cel. Szczegóły: [WATER.md](./WATER.md).

### 2026-08-13 — SoT wody; dual-material na śródlądziu 📝

- Nowy [WATER.md](./WATER.md) — stan techniczny/wizualny, decyzje W1–W7, historia.
- Screen: śródlądowy staw jednocześnie jako jezioro i ocean (`vBodyScale > 0.9` → discard → Water.js bez maski).
- W8 wtedy jako propozycja; wieczorem zaakceptowane (wpis powyżej). Issue [028](./issues/2026-08-13--028--inland-water-dual-material.md).

### 2026-08-12 — Droga + łąka: ziarno, soft edge, near-field filler ✅

- **#1 Droga:** `CORRIDOR_INNER_FRACTION` 0.6→0.32; `applyRoadTint` soft onset + micro contrast; fragment bare-ground grit; trawa soft-fade w `roadTint` zamiast hard reject.
- **#2 Łąka:** mocniejsza wariacja zieleni w macro color shaderze (między kępkami).
- **#3 Filler:** osobny bucket krótkich blades (~28% kandydatów), rysowany tylko przy `chebyshev ≤ 1`.
- **Issue:** [023](./issues/2026-08-12--023--road-grass-ground-cover.md) (`done`).
- **Koszt:** brak nowego passu; filler off poza near field; build chunka +~28% grass candidates (main thread, raz przy load).

### 2026-08-12 — Ocean przez drzewa + prawdziwa przezroczystość wody ✅

- **Objaw:** fale oceanu malowały się na koronach (maple/birch BLEND).
- **Fix liście:** `hardenFoliageAlpha` — BLEND → `alphaTest` cutout, `depthWrite: true`.
- **Fix woda:** ocean `transparent: true`, `depthWrite: false`, alpha fresnel (z góry rzadsza, edge-on gęstsza); jeziora `depthWrite: false`.
- **FPS:** mirror oceanu 512² → **256²** (jedyny ciężki pass Water.js tańszy ~4× w pikselach). Bez dodatkowego passu / heightmapy na oceanie.
- **Issue:** [022](./issues/2026-08-12--022--ocean-through-tree-foliage.md) (`done`).
- **Nadal otwarte:** miękki brzeg ocean/ląd — [003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md).

### 2026-08-10 — Ocean: blotches w odbiciu

- Gęste „chmurowe” plamy w mirrorze Water.js — aliasing drobnej normal-mapy terenu w niskim RT lustra.
- Cofnięto zagęszczenie detail normals; amplituda zostawiona niższa.
- **Issue:** [009](./issues/2026-08-10--009--ocean-normal-map-reflection-blotches.md).

### 2026-08-07 — Ocean vs jeziora (architektura)

- Duże zbiorniki → singleton reflective ocean; małe → chunk water z `vCover` / `bodyScale`.
- Brzeg ocean/ląd bez soft maski na globalnym plane → ostre krawędzie ([003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md)).

---

## Open / watch

| Temat | Status | Link |
|-------|--------|------|
| Soft shore fade ocean ↔ ląd | `done` (browser 2026-08-13) | issue [003](./issues/2026-08-07--003--ocean-shoreline-artifacts.md), plan [098](./plans/archive/2026-08-13--098--water-unified-shader-shore-reflections.md) faza 2 |
| Śródlądzie = dwa materiały wody | `done` | [WATER.md](./WATER.md) W8, issue [028](./issues/2026-08-13--028--inland-water-dual-material.md), plan [098](./plans/archive/2026-08-13--098--water-unified-shader-shore-reflections.md) faza 1 |
| Lustro wody + toggle Vue | `verification needed` | W9, plan [098](./plans/archive/2026-08-13--098--water-unified-shader-shore-reflections.md) faza 3 |
| Droga/trawa ground cover (#1–#3) | `done` | issue [023](./issues/2026-08-12--023--road-grass-ground-cover.md) |
| God rays whiteout (fix) | `done` | issue [016](./issues/2026-08-11--016--god-rays-mountain-whiteout.md) |
| Terrain detail normal „camo” (G vs B) | `verification needed` | issue [014](./issues/2026-08-10--014--terrain-detail-normal-map-green-channel.md) |
| Tree size/age visual overhaul | `planned` | plan [073](./plans/archive/2026-08-12--073--tree-types-height-age-overhaul.md) |
| World visual overhaul (rośliny, niebo, góry) | `in progress` | plan [024](./plans/2026-08-07--024--world-visual-overhaul.md) |

---

## Szablon wpisu

```markdown
### YYYY-MM-DD — krótki tytuł ✅|🔧|📝

- Kontekst / objaw
- Decyzja
- Skutek w kodzie (ścieżki)
- Koszt wydajności (jeśli dotyczy)
- Link issue/plan/review
```

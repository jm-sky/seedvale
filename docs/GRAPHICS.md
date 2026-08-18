# Seedvale — Graphics Log

**Purpose:** jeden source of truth dla decyzji, kontraktów i uwag o grafice / renderze / materiałach wizualnych.

**Nie jest:** listą assetów ([assets/](./assets/README.md)), stanem implementacji ([STATE.md](./STATE.md)), domeną wody ([WATER.md](./WATER.md)), ani planem ([plans/](./plans/README.md)). Tu zapisujemy *dlaczego* coś wygląda / renderuje się tak, a nie inaczej.

**Last updated:** 2026-08-18

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
| G5 | Ocean = **jeden** plane (follow gracza), nie per-chunk. Shader = rodzina jezior (`waterMaterial.ts`). Lustro sceny = jeden RT **128²** @ 30 Hz (`waterMirror.ts`), wyłącznik Vue; NPC/fauna poza lustrem (`AGENT_RENDER_LAYER`), trawa i drobne pickupy poza lustrem (`REFLECTION_SKIPPED_LAYER`). | `createOcean.ts` |
| G5a | Wkład lustra w kolor wody jest **≤18 %** (`reflectance` clamp 0.4 × `mix(mirrorSample, body, 0.55)`) i ~1 % pod typowym kątem. To jest budżet, w którym wolno wycinać detal z reflection passa — i powód, dla którego nie wolno traktować lustra jako passa „jakościowego”. | `waterMaterial.ts`, research [019](./research/2026-08-17--019--rendering-optimizations.md) §1.1 |
| G6 | Jeziora = per-chunk ten sam shader, maska heightmap + głębokość z `floorHeights`. `bodyScale` 1 stroi ocean, nie discarduje piksela. | `createWater.ts`, `waterMaterial.ts`, `waterBodies.ts` |
| G7 | Post-process: EffectComposer + N8AO + SMAA (+ bloom / god rays / film grade). Hardware MSAA wyłączone (i tak bez efektu na targetach composera). **N8AO on/off idzie tylko z presetu/GUI** — nie gasić passa z czasu klatki (oscylator jasna/ciemna na trawie). | `createPostProcessing.ts`, `createRenderer.ts` |
| G8 | Weryfikacja wizualna = **przeglądarka**, nie sam `tsc`/lint/build. | `CLAUDE.md` |
| G9 | Droga = tint korytarza na meshu terenu (nie osobny mesh). Miękki brzeg + ziarno dirtu; trawa **soft-fade** w korytarzu, nie hard bald cut. Extra gęstość łąki = **near-field filler LOD**, nie globalny bump `grass.density`. | `chunkHeightmap` / `biomeColors` / `grass` / `chunkManager`, issue [023](./issues/2026-08-12--023--road-grass-ground-cover.md) |
| G10 | Asset alignment browser **Game-like** mode reuses `createRenderer` / `createLights` / `createSky` / `skyParamsFromTime` — no parallel preview rig. Post-processing composer runs in **single-view only** (not 4-up). | `src/tools/assetBrowser/`, plan [088](./plans/archive/2026-08-12--088--asset-alignment-browser.md) |
| G11 | Profile jakości Low/Medium/High/Custom sterują **tylko gałkami live** (pixel ratio, AO/bloom/god rays, odbicia, shadow map, LOD scale). Nie zastępują optymalizacji architektury i nie rebuildują świata. | `src/config/qualityProfiles.ts`, plan [103](./plans/2026-08-13--103--performance-diagnostics-benchmark.md) |
| G12 | Third-person kamera zostaje **poza heightfieldem i dużymi colliderami** (domy): boom jest skracany wzdłuż odcinka look-at → desired, bez teleportu gracza i bez osobnego raycastu sceny. | `src/player/cameraBoom.ts`, issue [032](./issues/2026-08-15--032--mobile-black-world-screen.md) |
| G13 | Deszcz = **wąska pionowa kreska** (`uWidthFrac = 0.35` w `gl_PointCoord.x`); śnieg = **pełny kwadrat sprite'a** (`uWidthFrac = 1`). Wysokość/długość zostaje `gl_PointSize` — nie zwężać deszczu przez `RAIN_SIZE`. Wspólny shader rain/snow. | `src/world/weatherParticles.ts` |

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
| Deszcz / śnieg (GPU points) | `src/world/weatherParticles.ts` |
| Modele / kredyty | [assets/](./assets/README.md) |

---

## Log

### 2026-08-18 — Rain drops are thin streaks, not squares 🔧

- Shared rain/snow `THREE.Points` fragment shader used to fill the whole sprite, so rain read as large flakes (easy to confuse with snow). Height/`gl_PointSize`/`RAIN_SIZE` unchanged.
- New `uWidthFrac`: rain **0.35** (soft `gl_PointCoord.x` mask), snow **1** (mask skipped — full square as before). G13.

### 2026-08-18 — N8AO auto-budget no longer hard-toggles the pass 🔧

- Plan 113 P0 gasił `N8AOPass` gdy `Render ms ≥ 15` i włączał z powrotem `≤ 10`. Koszt passa jest większy niż ta szczelina, więc AO oscylowało (review 017, potem ~1 Hz po `AO_MIN_STABLE_MS`) — trawa jasna/ciemna. Diagnostyczny pin (`f86a1f3`) maskował objaw; `3a7b995` zdjął pin i przywrócił przełącznik.
- Live path: `applyFrameBudget` jest no-op. AO zostaje przy `aoEnabled` z presetu/GUI. `aoBudget.ts` zostaje pod istniejące testy, nie pod composer.
- Not verified: browser still-camera grass; heavy-settlement frame time without the suppress.

### 2026-08-18 — Real-GPU bench: grass LOD −47% tris, no FPS; water S mirror −4% draws 🔧

- Cursor browser, Intel Arc 140V, 1068×906 dpr 1, seed 42 / res 193 / High. Baseline `cfdb83a` → 148 S `68e1bf4` → 144 S `c834210`. **Two runs** (`current`/`water`; `stream` only in run 1).
- Grass census identical both runs: `current` 8.54 M → 4.53 M (−47%), `water` 1.36 M → 0.58 M. FPS/RENDER not improved on the quiet run; run 2 FPS drifted with host load.
- 144 S mirror draws on `current` 206→197 in run 1, **no drop in run 2**. Lake `water` 30→25 / 30→23. No visual check. [Review 020](./reviews/2026-08-18--020--water-grass-gpu-benchmark.md).

### 2026-08-17 — Habitat-destroy fire is spectacle, not a palenisko 🔧

- Destroyed cave/thicket still gets a ~5 min `PlacedFires` pit flame, but `habitatBurn` skips `[E] Zapal ognisko w palenisku` (same XZ as the spawner was stealing gaze) and omits the ring from save. Ring despawns ~8 s after burnout; the burned cave prompt stays `Zbadaj: … (wypalone)`.

### 2026-08-17 — Harvested remains GLB pile (plan 138) 🔧

- Knife harvest leftover is a composed `harvested-remains` group: cached `bones_pile` / `large_bone` / `animal_hide` (`preparePropFitMax` + clone, same pattern as `blood_splat`) plus 2–4 procedural red meat scraps. Hide sits beside the pile, not on it. Load failure keeps the plan-137 cylinder+hide fallback.
- Gameplay linger (`HARVESTED_REMAINS_LINGER_SECONDS` 90) and `meatHarvested` state are unchanged; mesh attach is async with a dispose token.
- Not verified: browser silhouette of pile vs hide vs scraps, scale on rabbit vs deer.

### 2026-08-17 — Scorched spawn-point ground + harvested remains (plan 137) 🔧

- Destroyed cave/thicket stays in the world (near-black `tintPropMaterials`). Burned earth is a `TerrainModification` `mode: 'scorch'` patch (~7 m): shallow dip, `roadTint` bump so existing grass fade applies, charcoal vertex lerp (`SCORCH_CHARCOAL` `0x1a1410`) + `aBareGround` in `buildChunkGeometry` — no per-frame burn uniforms, no extra mesh. Grass on touched chunks is rebuilt after scorch.
- Habitat destroy lights the existing `PlacedFires` pit (`fx/fire.glb` / `CampfireFlame`) with the 4 consumed branches as ~5 min fuel.
- Harvested corpses swap the living mesh for procedural remains (bones + `createItemMesh` meat/hide scraps). No carcass GLB yet.
- Not verified: browser read of scorch vs grass/roads, fire duration, remains silhouette.

### 2026-08-16 — Campfire GLB body + fire.glb flame (plan 135) 🔧

- Unlit body is `campfire_unlit.glb` fitted with `preparePropFitMax(1.2)` (procedural stone-ring diameter). Four primitives split by material name: `Stone_*` = palenisko, `Wood*` = stos; `kind: 'simple'` hides stones.
- Lit flame reuses `fx/fire.glb` at `CAMPFIRE_FLAME_FIT_MAX` 0.179, local Y `CAMPFIRE_FLAME_Y` 0.04. Pivot at the coals: ignition eases **only Y-scale** from the base. Materials converted to unlit `MeshBasicMaterial` (no 0.75 opacity / Standard shading — that left outer walls dark under the inner PointLight).
- Sparks / embers / ignite burst stay on `getFireParticles` (plan 130). `campfire_burning_*` stay parked (baked flame).
- Not verified: browser scale/offset of ring vs flame vs handheld tip.

### 2026-08-16 — Weather surface effects: wet ground, puddles, snow cover (plan 133) 🔧

- `terrain/buildChunkGeometry.ts`'s single shared terrain `MeshStandardMaterial` gets two new shared uniforms, `uWetness`/`uSnowAmount` — no per-chunk material, no new mesh/decal for puddles, no chunk-geometry rebuild on weather change (`ChunkManager.setWeatherSurface`, same shape as `setWaterDayNight`/`setGrassDayNight`).
- Both uniforms are pure derived values from `world/weather.ts`'s new `computeSurfaceWeather(seed, elapsedDays)` — a bounded (~12-cycle-lookback) forward simulation over the existing deterministic `computeWeather()`, not a second weather/simulation system and not a new save field.
- New varying `vSlopeUp = objectNormal.y` for flatness masking: terrain chunks only ever translate (no rotation/scale), so the vertex-shader object-space normal is already world-space — zero-cost, no new per-vertex attribute needed. Puddle/snow breakup reuse the existing `terrainValueNoise()` (low-frequency, no new texture).
- `customProgramCacheKey()` bumped `v4` → `v5` so three.js can't reuse a pre-plan-133 compiled program.
- Known gap: desert/beach aren't separately suppressed from road/dirt puddle response — `vBareGround` folds all three into one scalar; adding a split would need a new per-vertex attribute, out of scope. See [plan 133 implementation notes](./plans/2026-08-16--133--weather-surface-effects-implementation-notes.md).
- Not verified: browser/perf check (fragment cost clear vs rain vs snow, visual read on slopes/roads/beach/desert).

### 2026-08-15 — Czarny świat 3D na mobile (issue 032) 🔧

- Boom kamery (`PlayerController.syncCamera`) nie miał kolizji: look-up (pitch −0.9, distance 12) chował soczewkę pod teren; w wiosce boom 12 m przecinał dachy. Canvas czarny (near clip / backface cull / clearColor), UI i CSS2D etykiety bez zmian.
- `resolveCameraBoom` skraca boom nad `sampleHeight + 0.45 m` i przed cylindrami colliderów `radius ≥ 1.2` (domy; pnie drzew pomijane).
- `visualViewport` resize: skip `< 16 px`, no-op gdy integer size ten sam, coalesce do rAF; po `webglcontextrestored` force `composer.setSize` (Three.js odtwarza GL, nie RT N8AO).
- Diagnostyka: `?camdebug=1`. Browser/device verification otwarta.

### 2026-08-17 — Reflection pass + post chain optimizations (research 019) 🔧

- Wkład lustra w piksel wody jest ≤18 % (typowo ~1 %) — patrz G5a. Na tej podstawie trawa (43 % trójkątów sceny) i `chunk-items` idą na `REFLECTION_SKIPPED_LAYER = 3`: main camera je widzi, mirror camera (layer 0) nie. Shadow camera bez zmian — trawa i tak ma `castShadow = false`.
- Cap 30 Hz lustra działał tylko powyżej 30 FPS (bramka wall-clock). Poniżej — dodatkowo co druga klatka (`shouldRenderMirror`, unit-tested). **Trade-off czasowy:** przy 23 FPS odbicie odświeża się ~11,5 Hz zamiast ~23 Hz.
- God rays wypadają z chaina, gdy `intensity == 0` (większość doby) — wcześniej płaciły pełnoekranowy read/write half-float + swap composera za skopiowanie wejścia. Wyjście bit-identyczne.
- `mirrorCamera.far = camera.far` usunięte: nie wpływało na culling (frustum liczony z `projectionMatrix`, nie z `far`).
- **Nie zmierzone w przeglądarce.** Baseline i przewidywania: research [019](./research/2026-08-17--019--rendering-optimizations.md).

### 2026-08-15 — GPU weather renderer (plan 040 Etap 3) 🔧

- `world/weatherParticles.ts`: rain/snow moved from CPU `THREE.Points` (per-particle `BufferAttribute` update every frame) to a shared vertex/fragment `ShaderMaterial`; particle fall/drift computed procedurally from a fixed-at-creation per-particle attribute + `uTime`, no per-particle JS loop.
- Same `fog_pars_*`/`fog_vertex`/`fog_fragment` chunk pattern as `waterMaterial.ts` (`fog: true` + `UniformsLib.fog`) — no parallel fog handling.
- Density (weather intensity) and a mobile cap (`WorldConfig.quality.lodScale`) both gate visibility via one `uVisibleFraction` uniform; gated-out particles are pushed outside the clip volume in the vertex shader rather than looped/hidden on the CPU.
- Not measured: no `?benchmark=` pass comparing old CPU vs new GPU frame cost. See [plan 040 implementation notes](./plans/2026-08-08--040--seasons-weather-implementation-notes.md).

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

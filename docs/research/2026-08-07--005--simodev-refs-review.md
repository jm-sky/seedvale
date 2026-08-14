# Research: audit `docs/refs/` (SimonDev — 3 nowe repo)

**Status:** `done` (verdicts poniżej częściowo nadpisane — patrz Update note)
**Created:** 2026-08-07
**Updated:** 2026-08-07
**Źródło:** `docs/refs/ProceduralTerrain_Part10/`, `docs/refs/Quick_FPS1/`, `docs/refs/ThreeJS_Tutorial_BasicPhysics/` (wszystkie MIT, simondevyoutube)

## Update note — decyzje użytkownika (2026-08-07, po review)

Użytkownik ustalił priorytety po przeczytaniu findings poniżej. Trzy punkty **nadpisują** oryginalne werdykty (`skip` → `adopt` / `reconsider`):

| # | Finding | Oryginalny werdykt | Nowa decyzja (✅ user) |
|---|---------|---------------------|------------------------|
| 1 | Worker pool dla generacji terenu | `adopt later` (trigger: zauważalny lag) | **adopt ASAP** — priorytet, nie czekać na trigger. Plan: [plans/2026-08-07--terrain-worker-pool.md](../plans/archive/2026-08-07--terrain-worker-pool.md) |
| 2 | `CubeQuadTree` LOD / cube-sphere streaming (`quadtree.js`) | `skip` — "jedna skończona dolina, nie ma problemu do rozwiązania" | **reconsider** — kierunek produktu się zmienia: duży świat, docelowo **sferyczny** (żeby uniknąć hard-edge / nieskończoności), z progresywną generacją kolejnych obszarów przy zbliżaniu się do krawędzi załadowanego regionu. To wraca do `quadtree.js` jako referencji. Wymaga osobnej sesji research/plan — patrz [plans/2026-08-07--world-streaming-persistence.md](../plans/archive/2026-08-07--world-streaming-persistence.md) (zaktualizowany) |
| 3 | `texture-splatter.js` + `terrain-shader.js` (prawdziwe tekstury, triplanar) | `skip` — "gryzie się ze stylizowanym low-poly lookiem" | **feature, nie must — opcjonalny upgrade.** Projekt nie musi trzymać się low-poly/vertex-color na twardo; prawdziwe tekstury mogą wejść jako toggle/wariant wizualny później. Nie blokuje niczego dziś — no action, tylko odnotowany kierunek |

**Nieduża zmiana zakresu produktu:** ROADMAP.md miał "Infinite / streaming world" jako *poza zakresem* — to się zmienia z uwagi na punkt 2. Zaktualizowano w ROADMAP.md.

## Question

Czy w 3 nowo dodanych surowych tutorialach SimonDev jest coś wartościowego dla Seedvale — inne niż to, co już przejrzano w [2026-08-07-3d-portfolio-library-audit.md](./2026-08-07-3d-portfolio-library-audit.md) (adaptacja `3d-portfolio`)?

## Context

To są **oryginalne, nieprzerobione** tutoriale SimonDev (vanilla JS, stary Three), różne od siebie:

| Repo | Co to jest |
|------|------------|
| `ProceduralTerrain_Part10` | Planet renderer — cube-sphere quadtree LOD, threaded terrain build, GPU texture splatting, atmospheric scattering |
| `Quick_FPS1` | Pełna gra FPS — ammo.js physics, ECS-lite, combat, post-processing (GTAO/motion blur/SSR), quaternius assety |
| `ThreeJS_Tutorial_BasicPhysics` | Minimalne demo ammo.js — `RigidBody` wrapper + sync mesh↔physics co klatkę |

## Method

Dwa fork-agenty przeczytały źródła (`ProceduralTerrain_Part10/src/**`, `Quick_FPS1/src/**`) i porównały z aktualnym kodem Seedvale (`src/terrain/`, `src/ai/`, `src/fauna/`, `src/player/`, `src/assets/loadGltf.ts`). `ThreeJS_Tutorial_BasicPhysics` przejrzany bezpośrednio (jeden plik, ~300 linii).

## Findings — `ProceduralTerrain_Part10`

| # | Technika | Lokalizacja | Werdykt |
|---|----------|-------------|---------|
| 1 | Worker pool do budowy terenu (heightmap+mesh w wątku) | `terrain-builder-threaded.js:37-73` + `terrain-builder-threaded-worker.js` | **adopt later** — jeśli regen na "Insane" (769×769) lub zmiana seeda/GUI zacznie realnie zacinać. Dziś `generateHeightmap.ts:101-142` + `createTerrainMesh.ts` liczą wszystko synchronicznie na main thread |
| 2 | `CubeQuadTree` LOD (6-ścienny cube-sphere, node stitching) | `quadtree.js` (442 linie), użyty w `terrain.js:230` | **skip** — to renderer nieskończonej/sferycznej planety ze streamingiem po odległości kamery. Seedvale ma jedną skończoną dolinę — nie ma problemu, który to rozwiązuje |
| 3 | `texture-splatter.js` + `terrain-shader.js` (GPU triplanar, `sampler2DArray`, wagi po height/slope) | `texture-splatter.js:111-173`, `terrain-shader.js:56-90+` | **skip** — Seedvale już ma koncepcyjny odpowiednik (`biomeColors.ts`: `colorForTerrain` + `applySlopeRock` + `applyMicroTint`) przez vertex colors. Prawdziwe tekstury to kosmetyczny upgrade, który gryzie się ze stylizowanym low-poly lookiem |
| 4 | `scattering-shader.js` | cały plik | **skip** — mylząca nazwa: to atmosferyczny raymarching (planet atmosphere + ACES tonemapping), nie instancing trawy/roślinności. Zła technika do klastrów drzew |
| 5 | `spline.js`, `sky.js` | — | **no new finding** — identyczne z tym, co już opisano w audycie `3d-portfolio` |

Bottom line: z ~4550 linii tego repo realny future-win to jeden — offload heightmap gen do Workera. Reszta rozwiązuje problemy nieskończonego/sferycznego świata, którego Seedvale nie ma.

## Findings — `Quick_FPS1`

| # | Technika | Lokalizacja | Werdykt |
|---|----------|-------------|---------|
| 1 | `load-controller.js` (LoadGLB/LoadFBX, cache po path, `SkeletonUtils.clone`) | `load-controller.js:110-137` | **skip, już mamy lepsze** — `src/assets/loadGltf.ts:29-45` (`loadCached`) robi to samo przez `Map<string, Promise<CachedGltf>>` — czystsze niż ręczne `{loader, asset, queue}` |
| 2 | Finite State Machine | `finite-state-machine.js` (45 linii), użyty w `target-controller.js:12-23`, `player-state.js` | **skip na razie** — `NpcAgent.ts:44-54,190-250` ma już `Phase` union + `switch` = lekki FSM, czytelny (10 case'ów). `AnimalAgent.ts:179-220` jeszcze prostszy (chase/wander, flee/wander). Wrócić do tematu, jeśli pojawią się enter/exit side-effects (np. animacje spięte ze zmianą stanu) albo liczba stanów ~podwoi się |
| 3 | Spatial hash grid | `spatial-hash-grid.js` (163 linie) | **skip, przedwczesne** — `AnimalAgent.nearest()` (`AnimalAgent.ts:241-260`) to O(n²), ale `createFauna.ts:20-23` spawnuje ~10 zwierząt = ~100 porównań/klatkę, trywialne. Próg opłacalności: rząd 50-100 dynamicznych agentów. **Trigger na przyszłość**, nie dziś |
| 4 | Entity/Component (ECS-lite) | `entity.js`, `entity-manager.js` | **skip, overkill** — koliduje z CLAUDE.md ("no premature abstraction"). `NpcAgent`/`AnimalAgent` to już małe, samodzielne klasy — dokładnie to, czego chce projekt |
| 5 | FPS camera smoothing (`1.0 - Math.pow(0.01, 5*dt)` slerp) | `first-person-camera.js:211-212` | **skip** — to smoothing dla free-look FPS kamery. `PlayerController.syncCamera()` (`PlayerController.ts:239-260`) to orbit 3rd-person ze snapem — poprawne zachowanie dla tego typu kamery, dodanie smoothingu pogorszyłoby responsywność |
| 6 | ammo.js physics (`kinematic-character-controller.js`, `ammojs-component.js`, `*-rigid-body.js`) | — | **out of scope** — potwierdza brief: Seedvale nie potrzebuje collision/ragdoll, heightmap-raycast movement wystarcza i jest lżejszy |
| 7 | Combat (`health-component.js`, `shield-component.js`, `attack-controller.js`, `target-controller.js`) | — | **out of scope** — brak walki w Seedvale |
| 8 | `third_party/*` post-processing (GTAO, motion blur, SSR, blue-noise, shader-replacement, CSM) | vendored z `gkjohnson/threejs-sandbox`, nie SimonDev-original | **skip w całości** — cel: realistyczny PBR, gryzie się z flat-shaded/vertex-color stylem, koszt bundla i runtime; nawet najtańszy (GTAO) wymaga normal/depth prepass |

Bottom line: nic tu nie jest adopt-now. To architektonicznie inna gra (FPS + fizyka + walka). Seedvale niezależnie doszło już do prostszych, wystarczających wersji dwóch rzeczy, które faktycznie się przenoszą koncepcyjnie (cache assetów, phase-based behavior) — **dobra walidacja obecnej architektury**, nie luka.

## Findings — `ThreeJS_Tutorial_BasicPhysics`

Jeden plik (`main.js`, ~300 linii): minimalny `RigidBody` wrapper (`btBoxShape`/`btSphereShape`, `btRigidBody`), `physicsWorld_.stepSimulation()` co klatkę, sync `mesh.position/quaternion` z transformem fizyki. Zero terenu, zero gracza.

**Werdykt: skip dziś, ale trzymać jako czysty punkt startowy**, jeśli Seedvale kiedyś doda prawdziwą fizykę (np. upuszczane przedmioty, fizyczne kolizje z propami osady, ragdoll zwierząt). To najprostsza możliwa referencja ammo.js — mniej do odchaszczenia niż `Quick_FPS1`'s pełny ECS+physics stack.

## Verdict

**Nic do wdrożenia teraz.** Jeden trigger na przyszłość (Worker heightmap gen — jeśli regen zacznie zacinać), jeden watch-point (spatial hash grid — jeśli liczba agentów NPC/fauna wzrośnie o rząd wielkości). Wszystko inne to albo:
- rozwiązania dla innego typu gry (nieskończona planeta, FPS + fizyka + walka + realistyczny PBR),
- albo rzeczy, które Seedvale już ma w prostszej, adekwatnej formie (asset cache, phase-based AI, orbit camera).

Trzy repo są dobrym **archiwum referencyjnym** (worker terrain build, ammo.js basics, ECS pattern) na wypadek, gdyby zakres projektu się rozszerzył — nie fundamentem do kopiowania teraz.

## Next (opcjonalne, nie pilne)

- [ ] Jeśli regen terenu (seed/GUI change na wysokiej rozdzielczości) zacznie zauważalnie zacinać UI: rozważyć Web Worker dla `generateHeightmap.ts` wzorem `terrain-builder-threaded.js`
- [ ] Jeśli liczba NPC + fauna urośnie rzędowo (50+): rozważyć spatial hash grid wzorem `spatial-hash-grid.js` zamiast O(n²) w `AnimalAgent.nearest()`
- [ ] Nie dotykać: quadtree LOD, texture splatting, atmospheric scattering, ECS, ammo.js physics, FPS camera smoothing, post-processing passes — żadne nie pasują do obecnego zakresu/stylu Seedvale

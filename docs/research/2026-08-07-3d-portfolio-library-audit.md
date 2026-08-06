# Research: audit `3d-portfolio` pod Seedvale

**Status:** `done`  
**Created:** 2026-08-07  
**Updated:** 2026-08-07  
**Źródło:** `/home/madeyskij/projects/private/3d-portfolio` (szczególnie `src/library/`)

## Question

Czy w lokalnym projekcie `3d-portfolio` jest coś wartościowego dla Seedvale (proceduralny teren + chodzenie / dalszy świat), zwłaszcza w `src/library`?

## Method

- Przegląd `README.md`, `package.json`, routingu Vue (`World.vue`, `BgCanvas.vue`)
- Czytanie `src/library/**` (teren, noise, environment, controls, dekoracje)
- Porównanie z Seedvale v0.1 (`generateHeightmap.ts`, `createTerrainMesh.ts`, roadmap)

## Context (co to jest)

| | |
|---|--|
| Produkt | Vue 3 + Vite portfolio (`jm-sky-3d`) |
| Three | `^0.112.1` — Geometry / Face API (sprzed BufferGeometry-only) |
| Teren | README: *„world generation (thanks to SimonDev)”* |
| Użycie | `/world` → `World` + `TerrainChunkManager`; tło portfolio → Moon / Star / Torus |

To **własna adaptacja** tutoriali SimonDev (chunk + FBM + sky/water + FPS), nie pełny port MMORPG. Kod legacy — **nie kopiować 1:1** do Seedvale (TS + nowoczesne Three).

## Inventory `src/library`

| Ścieżka | Rola | Wartość dla Seedvale |
|---------|------|----------------------|
| `world/TerrainChunkManager.js` | Chunk grid, GUI noise/biome, rebuild | Wzorzec (nie kod) — streaming / live tune |
| `world/TerrainChunk.js` | Plane + wysokości + kolory biom×wysokość | **Wysoka** — lepsze malowanie niż height-only |
| `world/HeightGenerator.js` | Warstwy wysokości + falloff po promieniu | **Wysoka** — kompozycja generatorów |
| `world/Heightmap.js` | Obraz → wysokość (bilinear) | Średnia — opcjonalny authored height |
| `src/noise.js` | FBM: octaves / persistence / lacunarity / exponentiation / scale / seed | **Wysoka** — parametry + exponentiation |
| `world/spline.js` | `LinearSpline` / `CubicHermiteSpline` | **Wysoka** — remap kolorów / krzywych |
| `Environment.js` | `Sky` + `Water` + GUI sun, follow camera | Średnia — polish wody/nieba |
| `world/controls.js` | PointerLock FPS + velocity | Niska — Seedvale = 3rd person |
| `mine/controls.js` | Wariant FPS (grawitacja w deccel) | Niska / archive |
| `App.js` | Bootstrap sceny, entity `update`, Stats, fog | Niska — Seedvale ma już `createApp` |
| `World.js` | Skleja terrain + env + FPS | Niska — glue |
| `Moon.js` / `Star.js` / `Torus.js` / `Plane.js` | Dekoracje portfolio | Pomijalne |
| `world/voxels.js` | Pusty stub | Brak |
| `src/math.js` | lerp / smoothstep / clamp / sat | Niska — trivial helpers |
| `src/three.js`, `perlin.js`, `simplex-noise.js`, `graphics.js` | Vendored / utils | Nie przenosić |

## Findings (co warto „ukraść” jako wzorzec)

### 1. Parametryczny FBM + live rebuild (GUI)

`noise.Noise.Get` normalizuje oktawy, potem `pow(total, exponentiation) * height`. GUI w `TerrainChunkManager` zmienia scale / octaves / persistence / lacunarity / seed i woła `rebuild()` na chunkach.

Seedvale ma już FBM + domain warp + island falloff — **brakuje** eksponowanego tuningu i `exponentiation` (kształtuje „płaskość vs szczyty”). Przyda się przy iteracji wyglądu doliny (nawet bez dat.GUI — stałe w params / `?query`).

### 2. Biomy × wysokość (kolory)

`TerrainChunk._chooseColour`: osobny noise biomu `m ∈ [0,1]`, dwa spliny kolorów (arid / humid) po wysokości `h`, potem `lerpHSL` między nimi; niski `h` → ocean.

Seedvale v0.1: tylko progi wysokości (woda / piasek / trawa / skała / peak). **Następny krok wizualny** bez chunków: drugi seedowany noise + spline (albo lookup) — bliżej stylized krajobrazu z roadmapy (las / dolina / woda).

### 3. Warstwowanie generatorów wysokości

`HeightGenerator` zwraca `[height, weight]` z smoothstep falloff od środka. Chunk sumuje kilka generatorów z normalizacją wag. `SetHeightmap(img)` dokłada obraz jako pierwszą warstwę.

Użyteczne później: „hałas globalny + lokalny bump okolicy osady” albo blend noise + ręczny heightmap — bez przepisywania całej mapy.

### 4. Scaffold chunków (świadomie później)

Manager trzyma `_chunks[key]`, offset, lista `edges`; obecnie `w = 0` → **jeden chunk**. Streaming nie jest dokończony, ale API (`_addChunk`, rebuild, group) jest czytelne.

Roadmap Seedvale: skończona dolina, nie infinite world — chunki **nie są priorytetem** do v0.3. Trzymać jako referencję, gdy mapa urośnie.

### 5. Environment: Sky + Water

`three/examples` Sky/Water, sun inclination/azimuth, woda podąża za kamerą w XZ. Seedvale ma „wodę” jako flat height threshold — **prawdziwa tafla + sky** to tani wow, jeśli nie koliduje z low-poly (Water bywa „realistyczny”).

### Świadomie pomijać

- Kopiowanie klas JS / Geometry.faces / `verticesNeedUpdate`
- FPS PointerLock jako główny control (konflikt z 3rd person v0.1)
- Moon / stars / torus (inny produkt: space portfolio)
- Vendored `library/src/three.js`
- Puste `voxels.js`

## Mapowanie → Seedvale

| Seedvale | Już mamy | Z `3d-portfolio` |
|----------|----------|------------------|
| v0.1 teren | FBM, colors by height, 3rd person | — |
| Polish terenu | — | biom noise + color splines; exponentiation; live params |
| Woda / niebo | flat waterLevel | opcjonalnie Sky; Water tylko jeśli pasuje do stylized |
| Większa mapa | jedna PlaneGeometry | chunk manager jako wzorzec (później) |
| AI / osada / fauna | roadmap v0.2+ | **brak** w `3d-portfolio` |

Powiązane: [2026-08-06-threejs-terrain-ai-tech-research.md](./2026-08-06-threejs-terrain-ai-tech-research.md) (SimonDev), [ROADMAP.md](../ROADMAP.md).

## Verdict

**Tak — wartościowe jako lokalna referencja SimonDev**, nie jako kod do merge.

Najwyższy ROI dla Seedvale:

1. Kolorowanie biom × wysokość (`TerrainChunk` + `spline`)
2. Bogatsze / eksponowane parametry FBM (`noise.js`, zwłaszcza `exponentiation`)
3. Opcjonalnie: blend warstw wysokości (`HeightGenerator`) i polish Sky

Reszta (Vue shell, FPS, dekoracje, stary Three) = kontekst historyczny / portfolio, nie fundament Seedvale.

## Next (opcjonalne)

- [x] Spike: drugi noise biomu + 2–3 punkty spline w `createTerrainMesh` (bez GUI)
- [x] Dodać `exponentiation` (lub krzywe remapu wysokości) do `HeightmapParams`
- [x] Sky (Preetham) + sync słońca
- [ ] Nie portować chunk managera, dopóki mapa nie wyjdzie poza jedną dolinę

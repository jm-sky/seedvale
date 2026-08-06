# Research: Three.js + procedural terrain + character AI

**Status:** `done`  
**Created:** 2026-08-06  
**Updated:** 2026-08-06  

## Question

Jakie technologie, wzorce i kierunki produktowe mają sens dla projektu Three.js z auto-generowanym terenem i „ciekawym” AI postaci — na bazie inspiracji SimonDev ([YouTube](https://www.youtube.com/@simondev758), [GitHub](https://github.com/simondevyoutube/), [Quick_3D_MMORPG](https://github.com/simondevyoutube/Quick_3D_MMORPG))?

## Method

- Przegląd ekosystemu Three.js 2025–2026 (WebGPU, TSL, compute, open-world w przeglądarce)
- Inwentaryzacja repozytoriów SimonDev (teren, grass, MMORPG, flocking, A*)
- Porównanie bibliotek: nawigacja, fizyka, behaviour trees / GOAP / Utility AI
- Mapowanie poziomów ambicji (teren / AI / produkt) pod przyszły PR

## Findings

### Inspiracja SimonDev (wzorce, nie gotowy produkt)

| Obszar | Wzorzec w Quick_3D_MMORPG / powiązanych repo |
|--------|-----------------------------------------------|
| Teren | Chunki + worker (`terrain-builder-threaded*`), quadtree, shader splat |
| Świat | Spatial grid, entity/component, spawnery |
| AI | FSM, NPC entity, questy |
| Inne | `ProceduralTerrain_Part1–10`, `Quick_Grass`, flocking, A*, L-systems |

Kod ~2021 — wzorce nadal aktualne; stack dziś: WebGPU/TSL, Rapier, nowoczesny navmesh.

### Stack 2026 (rekomendowany kierunek)

| Warstwa | Opcja A (prościej) | Opcja B (więcej „wow”) |
|---------|-------------------|------------------------|
| Render | Three.js + WebGL2 | `WebGPURenderer` + **TSL** |
| Bundler | Vite + TypeScript | to samo |
| UI / scena | Vanilla Three | R3F tylko przy preferencji React |
| Fizyka / postać | Custom + raycast | **Rapier** + `KinematicCharacterController` |
| Noise | `simplex-noise` / FBM | + domain warp |
| Navmesh | `three-pathfinding` (statyczny) | **`navcat`** lub **`recast-navigation-js`** |
| Decyzje AI | FSM / BT (`mistreevous`) | Utility AI → GOAP → BT |
| Animacje | glTF + AnimationMixer | Mixamo / RPM + retarget |

WebGPU: sens przy gęstej trawie, compute terrain, wielu agentach. MVP: WebGL2 + workers.

### Teren — poziomy ambicji

1. **Heightmap (start / SimonDev)** — FBM + domain warp → `Float32Array` per chunk → mesh + LOD → texture splat. Generacja w workerze. Źródło prawdy = bufor wysokości (nie `height(x,z)` co klatkę).
2. **Streaming + GPU** — chunki wokół kamery, border 1-cell, normals z central differences; opcjonalnie compute (TSL).
3. **Żywy świat (później)** — instanced/compute grass, biomy, hydrology lite, jaskinie (SDF/MC).

Dla AI postaci wystarczy poziom 1–2 + biom markers.

### Character AI — warstwy

```
Perception → Decision → Planning → Execution → Locomotion
```

| Warstwa | Narzędzia |
|---------|-----------|
| Locomotion | navmesh (`navcat` / Recast) + steering/crowd; Rapier CC |
| Execution | Behaviour Tree ([mistreevous](https://github.com/nikkorn/mistreevous)) lub FSM |
| Decision | Utility AI / GOAP / hybrydy |

Pathfinding ≠ AI. LLM tylko do dialogu / rare goal injection — nie do pathfindingu co klatkę.

**Pomysły „smart” o dobrym stosunku efekt/koszt:** osada z potrzebami; łowca/ofiara; ekosystem; emergentne questy; team tactics; curiosity agents (eksploracja chunków).

### Kluczowe biblioteki / referencje

**Nawigacja:** [navcat](https://github.com/isaac-mason/navcat/), [recast-navigation-js](https://docs.recast-navigation-js.isaacmason.com/), [three-pathfinding](https://github.com/donmccurdy/three-pathfinding)

**AI:** mistreevous; `goap-solver` / `goap-oriented`; własny Utility scorer

**Fizyka:** Rapier (heightfield) > cannon-es (tylko lekki prototyp)

**Dema / artykuły:** SimonDev; [false-earth](https://github.com/momentchan/false-earth); [Codrops grass](https://tympanus.net/codrops/2025/02/04/how-to-make-the-fluffiest-grass-with-three-js/); [Cinevva open-world](https://app.cinevva.com/blog/2026-04-13-open-world-browser-part-13-terrain-sculpting); [Utsubo Three.js tips 2026](https://www.utsubo.com/blog/threejs-best-practices-100-tips)

### Kierunki produktu (do PR)

| # | Koncept | Teren | AI | Skala |
|---|---------|-------|-----|-------|
| A | Living meadow | infinite-ish heightmap + trawa | fauna + 1–2 smart NPC | mała |
| B | Micro-settlement | biomy + ścieżki | Utility/GOAP osada | średnia |
| C | Hunt / survival | chunked world | predator–prey + player | średnia |
| D | SimonDev++ RPG slice | jak MMORPG | FSM + questy (+ net later) | duża |

Najlepszy stosunek efekt/koszt: zwykle **B** lub **C**, nie pełne MMO.

### Proponowane spike’i (po PR)

1. Vite + Three + kamera 3rd person + flat ground  
2. Chunked FBM terrain + collision (Rapier heightfield lub raycast)  
3. 1 agent: navmesh bake + patrol  
4. Utility AI (2–3 potrzeby) lub BT hunt/flee  
5. Biomy + scenery + (opcjonalnie) grass  

## Conclusion

- Greenfield: zacząć od heightmap + workers + entity/component (lekcja SimonDev), nie od WebGPU/MMO.
- „Ciekawe AI” budować warstwowo: navmesh → BT/FSM → Utility/GOAP; LLM opcjonalnie na narrację.
- Przed kodem domknąć PR: koncept A–D, single vs multi, WebGL vs WebGPU, skala agentów, art style.

## Decision

**2026-08-07 (użytkownik):** hybryda B+C — życie wioski + fauna; v0.1 teren+chodzenie → v0.2 osada (potrzeby) → v0.3 predators/prey; bez MMO; 3rd person; questy później (proste → generator / OpenRouter). Szczegóły: [ROADMAP.md](../ROADMAP.md).

## Follow-ups

- [x] [ROADMAP.md](../ROADMAP.md) — szkic PR
- [ ] `docs/plans/` — plan implementacji v0.1
- [ ] `docs/features/` — FEATURE-001+ po scope
- [ ] Art direction (otwarte)

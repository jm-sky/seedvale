# Seedvale

Sandbox / projekt Three.js: proceduralny teren + AI postaci.  
Katalog repo: `three-js-dev` (working dir); nazwa produktu: **Seedvale**.

**Dev:** `npm run dev` → http://localhost:5577/ (`vite.config.ts`, `strictPort`)

## Testowanie zmian w przeglądarce

**Nie uruchamiaj headless Chrome/Playwright samodzielnie do testowania zmian** (wolne, marudne selektory, słaba jakość sygnału). Zamiast tego:

1. Zweryfikuj technicznie: `npx tsc --noEmit`, `npm run lint` (ewentualnie `npx eslint <zmienione pliki>`), `npm run build`.
2. Dev server zwykle już działa na `localhost:5577` — **poproś użytkownika o przetestowanie w jego przeglądarce** (konkretne kroki: co kliknąć, czego się spodziewać) zamiast robić to sam.

## Docs workflow

- **Issues:** [docs/issues/README.md](docs/issues/README.md)
- **Reviews:** [docs/reviews/README.md](docs/reviews/README.md) — głęboka analiza: `to-do--<slug>.md`
- **Research:** [docs/research/README.md](docs/research/README.md)
- **Plans:** [docs/plans/README.md](docs/plans/README.md)
- **Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md)

Statuses: `todo` · `planned` · `in progress` · `done` · `verification needed`.  
New issues: `YYYY-MM-DD--NNN--slug.md`; reviews/research/plans: `YYYY-MM-DD--slug.md`.

## Aktualny stan (2026-08-07, po worker pool + duże regiony)

### Gotowe

| Obszar | Stan |
|--------|------|
| **v0.1** teren + 3rd person + mysz | done |
| **v0.2** osada + NPC (woda / drewno / jedzenie) + etykiety | done |
| **v0.3** fauna chase/flee + GLB (wolf/fox/deer/stag) | done |
| Dzień/noc + HUD + time multiplier | done |
| Config + lil-gui + `localStorage` | done |
| Flat shading toggle (default: smooth) | done |
| Assety GLB osada/natura (2. agent) | w toku / częściowo w `public/models/` |
| Scroll-wheel zoom kamery (distance-aware pitch) | done |
| Bieganie [Shift] (Run animation z Quaternius GLB) | done |
| **Worker pool dla generacji terenu** (offload heightmap z main thread) | done — [plans/2026-08-07--terrain-worker-pool.md](docs/plans/2026-08-07--terrain-worker-pool.md) |
| **Chunk streaming** (load/unload radius wokół gracza, brak reachable edge) + roślinność per-chunk w workerze | done — [plans/2026-08-07--world-streaming-persistence.md](docs/plans/2026-08-07--world-streaming-persistence.md) (streaming część; zapis/save nadal `planned`) |
| Duże regiony: oceany/wybrzeża/pasma górskie (macro noise: continentalness/mountainness + Worley ridge) | done |
| NPC dialog (proximity-based, personality-flavored lines) | done — [plans/2026-08-07--npc-interactions.md](docs/plans/2026-08-07--npc-interactions.md) (`verification needed`) |

### Stack

Vite + TS + Three (WebGL2) + `simplex-noise` + `lil-gui`. Vanilla (bez R3F).

### Ważne ścieżki kodu

```
src/app/createApp.ts          # orchestration
src/config/worldConfig.ts     # defaults + URL/storage merge
src/config/persistConfig.ts   # localStorage key: seedvale:worldConfig:v1
src/terrain/                  # chunked heightmap/mesh (worker pool), biom colors, FBM, macro regions, vegetation
src/world/                    # sky, water, lights, dayNight
src/settlement/               # site, props (GLB+fallback), NPC wiring
src/ai/                       # Needs, NpcAgent
src/fauna/                    # AnimalAgent, createFauna
src/ui/                       # lil-gui, HUD
src/assets/loadGltf.ts        # GLTF loader helpers
public/models/                # settlement / nature / fauna / characters
```

### Konfiguracja (GUI / storage)

- Resolution: 65 … **769** (Insane); default **193**
- **Flat shading** — wyłączone = gładkie wzgórza (przy Insane + flat = „DOS”)
- Day/night: `timeMultiplier`, `dayLengthSec`, `enabled`
- Priorytet config: URL (`?seed=` `?res=` `?gui=0`) → localStorage → defaults

### Otwarte / kolejka

0. ~~Worker pool dla generacji terenu~~ → `done` ([plans/2026-08-07--terrain-worker-pool.md](docs/plans/2026-08-07--terrain-worker-pool.md)); ~~chunk streaming + duże regiony (oceany/góry)~~ → `done` ([plans/2026-08-07--world-streaming-persistence.md](docs/plans/2026-08-07--world-streaming-persistence.md), streaming część); ~~NPC dialog~~ → `verification needed` ([plans/2026-08-07--npc-interactions.md](docs/plans/2026-08-07--npc-interactions.md)); ~~Minimapa~~ → `verification needed` ([plans/2026-08-07--minimap.md](docs/plans/2026-08-07--minimap.md))
1. Wizualny overhaul (rośliny/krzewy, niebo/chmury, góry w tle — insp. SimonDev MMORPG devlog) → [plans/2026-08-07--world-visual-overhaul.md](docs/plans/2026-08-07--world-visual-overhaul.md) (`in progress`: rośliny + niebo done, góry w tle + chmury open; Mixamo→Blender pipeline rozważony i odłożony — Quaternius modele już mają pełny zestaw animacji)
2. Game UI screens (nie lil-gui) → [plans/2026-08-07--game-ui-screens.md](docs/plans/2026-08-07--game-ui-screens.md) (`in progress`: pause menu + Character (imię gracza) done — `src/ui/createPauseMenu.ts`; World config / Notes / NPC dialog open)
3. Save/persystencja (IndexedDB) → [plans/2026-08-07--world-streaming-persistence.md](docs/plans/2026-08-07--world-streaming-persistence.md) — jedyna nieruszona część tego planu; cube-sphere/pełny sferyczny świat nadal otwarte pytanie (nie rozstrzygnięte, obecny streaming to flat chunk grid z ringiem, nie sfera). Real textures/triplanar dopuszczone jako opcjonalny feature później (nie trzymamy się low-poly na sztywno) — patrz [research/2026-08-07-simodev-refs-review.md](docs/research/2026-08-07-simodev-refs-review.md) Update note
4. Nowe pomysły (`planned`, nieskolejkowane): [plans/2026-08-07--grass-rendering.md](docs/plans/2026-08-07--grass-rendering.md), [plans/2026-08-07--npc-gender-models.md](docs/plans/2026-08-07--npc-gender-models.md), [plans/2026-08-07--predator-prey-system.md](docs/plans/2026-08-07--predator-prey-system.md), [plans/2026-08-07--post-processing-pipeline.md](docs/plans/2026-08-07--post-processing-pipeline.md)
5. v0.4+ questy

Woda (brzeg + dzień/noc): `done` → [issues 001](docs/issues/2026-08-07--001--water-shore-color-banding.md), [002](docs/issues/2026-08-07--002--water-daynight-integration.md) (review: [docs/reviews/2026-08-07-water-quality.md](docs/reviews/2026-08-07-water-quality.md))

### Research

- Tech: [docs/research/2026-08-06-threejs-terrain-ai-tech-research.md](docs/research/2026-08-06-threejs-terrain-ai-tech-research.md)
- Assets: [docs/research/2026-08-07-3d-asset-sources.md](docs/research/2026-08-07-3d-asset-sources.md) (Quaternius)
- Portfolio audit: [docs/research/2026-08-07-3d-portfolio-library-audit.md](docs/research/2026-08-07-3d-portfolio-library-audit.md)

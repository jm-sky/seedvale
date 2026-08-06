# Seedvale

Sandbox / projekt Three.js: proceduralny teren + AI postaci.  
Katalog repo: `three-js-dev` (working dir); nazwa produktu: **Seedvale**.

**Dev:** `npm run dev` → http://localhost:5577/ (`vite.config.ts`, `strictPort`)

## Docs workflow

- **Issues:** [docs/issues/README.md](docs/issues/README.md)
- **Reviews:** [docs/reviews/README.md](docs/reviews/README.md) — głęboka analiza: `to-do--<slug>.md`
- **Research:** [docs/research/README.md](docs/research/README.md)
- **Plans:** [docs/plans/README.md](docs/plans/README.md)
- **Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md)

Statuses: `todo` · `planned` · `in progress` · `done` · `verification needed`.  
New issues: `YYYY-MM-DD--NNN--slug.md`; reviews/research/plans: `YYYY-MM-DD-slug.md`.

## Aktualny stan (2026-08-07, koniec sesji)

### Gotowe

| Obszar | Stan |
|--------|------|
| **v0.1** teren + 3rd person + mysz | done |
| **v0.2** osada + NPC (woda / drewno / jedzenie) + etykiety | done |
| **v0.3** fauna chase/flee (kapsuły) | done (logika); GLB fauna — open |
| Dzień/noc + HUD + time multiplier | done |
| Config + lil-gui + `localStorage` | done |
| Lasy: klastry drzew skalowane do `halfExtent` mapy | done |
| Flat shading toggle (default: smooth) | done |
| Assety GLB osada/natura (2. agent) | w toku / częściowo w `public/models/` |

### Stack

Vite + TS + Three (WebGL2) + `simplex-noise` + `lil-gui`. Vanilla (bez R3F).

### Ważne ścieżki kodu

```
src/app/createApp.ts          # orchestration
src/config/worldConfig.ts     # defaults + URL/storage merge
src/config/persistConfig.ts   # localStorage key: seedvale:worldConfig:v1
src/terrain/                  # heightmap, mesh, biom colors, FBM
src/world/                    # sky, water, lights, dayNight
src/settlement/               # site, props (GLB+fallback), NPC wiring
src/ai/                       # Needs, NpcAgent
src/fauna/                    # AnimalAgent, createFauna
src/ui/                       # lil-gui, HUD
src/assets/loadGltf.ts        # GLTF loader helpers
public/models/                # settlement / nature / (fauna later)
```

### Konfiguracja (GUI / storage)

- Resolution: 65 … **769** (Insane); default **193**
- **Flat shading** — wyłączone = gładkie wzgórza (przy Insane + flat = „DOS”)
- Day/night: `timeMultiplier`, `dayLengthSec`, `enabled`
- Priorytet config: URL (`?seed=` `?res=` `?gui=0`) → localStorage → defaults

### Otwarte / kolejka

1. Woda: fix brzegu + dzień/noc → [issues 001](docs/issues/2026-08-07--001--water-shore-color-banding.md), [002](docs/issues/2026-08-07--002--water-daynight-integration.md) (review done: [docs/reviews/2026-08-07-water-quality.md](docs/reviews/2026-08-07-water-quality.md))
2. Podpięcie GLB fauny (`public/models/fauna/`) pod `userData.animalKind`
3. Game UI screens (nie lil-gui) → [plans/2026-08-07--game-ui-screens.md](docs/plans/2026-08-07--game-ui-screens.md)
4. Streaming + save DB → [plans/2026-08-07--world-streaming-persistence.md](docs/plans/2026-08-07--world-streaming-persistence.md)
5. v0.4+ questy

### Research

- Tech: [docs/research/2026-08-06-threejs-terrain-ai-tech-research.md](docs/research/2026-08-06-threejs-terrain-ai-tech-research.md)
- Assets: [docs/research/2026-08-07-3d-asset-sources.md](docs/research/2026-08-07-3d-asset-sources.md) (Quaternius)
- Portfolio audit: [docs/research/2026-08-07-3d-portfolio-library-audit.md](docs/research/2026-08-07-3d-portfolio-library-audit.md)

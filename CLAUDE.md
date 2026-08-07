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

## Aktualny stan (2026-08-07, koniec sesji)

### Gotowe

| Obszar | Stan |
|--------|------|
| **v0.1** teren + 3rd person + mysz | done |
| **v0.2** osada + NPC (woda / drewno / jedzenie) + etykiety | done |
| **v0.3** fauna chase/flee + GLB (wolf/fox/deer/stag) | done |
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
public/models/                # settlement / nature / fauna / characters
```

### Konfiguracja (GUI / storage)

- Resolution: 65 … **769** (Insane); default **193**
- **Flat shading** — wyłączone = gładkie wzgórza (przy Insane + flat = „DOS”)
- Day/night: `timeMultiplier`, `dayLengthSec`, `enabled`
- Priorytet config: URL (`?seed=` `?res=` `?gui=0`) → localStorage → defaults

### Otwarte / kolejka

0. **Priorytet (user, 2026-08-07):** worker pool dla generacji terenu → [plans/2026-08-07--terrain-worker-pool.md](docs/plans/2026-08-07--terrain-worker-pool.md) (`planned`, robimy najpierw — offload `generateHeightmap.ts` do Web Workera)
1. Game UI screens (nie lil-gui) → [plans/2026-08-07--game-ui-screens.md](docs/plans/2026-08-07--game-ui-screens.md) (`in progress`: pause menu + Character (imię gracza) done — `src/ui/createPauseMenu.ts`; World config / Notes / NPC dialog open)
2. Streaming + save DB → [plans/2026-08-07--world-streaming-persistence.md](docs/plans/2026-08-07--world-streaming-persistence.md) — kierunek zmieniony na **duży/sferyczny świat** (nie tylko flat chunk grid); wymaga osobnej sesji research/plan przed implementacją. Real textures/triplanar dopuszczone jako opcjonalny feature później (nie trzymamy się low-poly na sztywno) — patrz [research/2026-08-07-simodev-refs-review.md](docs/research/2026-08-07-simodev-refs-review.md) Update note
3. v0.4+ questy

Woda (brzeg + dzień/noc): `done` → [issues 001](docs/issues/2026-08-07--001--water-shore-color-banding.md), [002](docs/issues/2026-08-07--002--water-daynight-integration.md) (review: [docs/reviews/2026-08-07-water-quality.md](docs/reviews/2026-08-07-water-quality.md))

### Research

- Tech: [docs/research/2026-08-06-threejs-terrain-ai-tech-research.md](docs/research/2026-08-06-threejs-terrain-ai-tech-research.md)
- Assets: [docs/research/2026-08-07-3d-asset-sources.md](docs/research/2026-08-07-3d-asset-sources.md) (Quaternius)
- Portfolio audit: [docs/research/2026-08-07-3d-portfolio-library-audit.md](docs/research/2026-08-07-3d-portfolio-library-audit.md)

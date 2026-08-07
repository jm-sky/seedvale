# Seedvale

Sandbox / projekt Three.js: proceduralny teren + AI postaci.  
Katalog repo: `three-js-dev` (working dir); nazwa produktu: **Seedvale**.

**Dev:** `npm run dev` → http://localhost:5577/ (`vite.config.ts`, `strictPort`)

## Testowanie zmian w przeglądarce

**Nie uruchamiaj headless Chrome/Playwright samodzielnie do testowania zmian** (wolne, marudne selektory, słaba jakość sygnału). Zamiast tego:

1. Zweryfikuj technicznie: `npx tsc --noEmit`, `npm run lint` (ewentualnie `npx eslint <zmienione pliki>`), `npm run build`.
2. Dev server zwykle już działa na `localhost:5577` — **poproś użytkownika o przetestowanie w jego przeglądarce** (konkretne kroki: co kliknąć, czego się spodziewać) zamiast robić to sam.

## Docs workflow

- **Vision:** [docs/VISION.md](docs/VISION.md) — czym jest Seedvale, filozofia projektowania, kierunki rozwoju (czytaj przed planowaniem nowych funkcji)
- **Issues:** [docs/issues/README.md](docs/issues/README.md)
- **Reviews:** [docs/reviews/README.md](docs/reviews/README.md) — głęboka analiza: `to-do--<slug>.md`
- **Research:** [docs/research/README.md](docs/research/README.md)
- **Plans:** [docs/plans/README.md](docs/plans/README.md)
- **Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md)

Statuses: `todo` · `planned` · `in progress` · `done` · `verification needed`.  
New files: `YYYY-MM-DD--{NNN}--slug.md` — own sequence for issues, plans, reviews, research (each 001+).

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
| **Worker pool dla generacji terenu** (offload heightmap z main thread) | done — [plans/2026-08-07--006--terrain-worker-pool.md](docs/plans/2026-08-07--006--terrain-worker-pool.md) |
| **Chunk streaming** (load/unload radius wokół gracza, brak reachable edge) + roślinność per-chunk w workerze | done — [plans/2026-08-07--007--world-streaming-persistence.md](docs/plans/2026-08-07--007--world-streaming-persistence.md) |
| Duże regiony: oceany/wybrzeża/pasma górskie (macro noise: continentalness/mountainness + Worley ridge) | done |
| NPC dialog (proximity-based, personality-flavored lines) | done — [plans/2026-08-07--011--npc-interactions.md](docs/plans/2026-08-07--011--npc-interactions.md) (`verification needed`) |
| **Save/persystencja** (single-slot IndexedDB, Continue/New Game start screen, Save + New Game w pause menu) | done — [plans/2026-08-07--007--world-streaming-persistence.md](docs/plans/2026-08-07--007--world-streaming-persistence.md), `src/persistence/` |
| **Post-processing pipeline** (EffectComposer + N8AO ambient occlusion + SMAA) | done — [plans/2026-08-07--009--post-processing-pipeline.md](docs/plans/2026-08-07--009--post-processing-pipeline.md), `src/render/createPostProcessing.ts` |
| **Sterowanie dotykowe / mobile** (joystick + look-drag/pinch-zoom + przyciski E/Sprint/G/L/☰, responsywny CSS) | done — [plans/2026-08-07--023--mobile-touch-controls.md](docs/plans/2026-08-07--023--mobile-touch-controls.md), `src/input/createTouchControls.ts` |

### Stack

Vite + TS + Three (WebGL2) + `simplex-noise` + `lil-gui`. Vanilla (bez R3F). Testy jednostkowe: `vitest` (`npm run test`), pliki `*.test.ts` obok źródła — na razie tylko czysta logika (`src/ai/`, `src/shared/`, `src/fauna/HealthState.ts`), bez testów THREE/DOM.

### Ważne ścieżki kodu

```
src/app/createApp.ts          # orchestration
src/config/worldConfig.ts     # defaults + URL/storage merge
src/config/persistConfig.ts   # localStorage key: seedvale:worldConfig:v1
src/terrain/                  # chunked heightmap/mesh (worker pool), biom colors, FBM, macro regions, vegetation
src/world/                    # sky, water, lights, dayNight
src/settlement/               # site, props (GLB+fallback), NPC wiring
src/ai/                       # Needs, NpcAgent
src/fauna/                    # AnimalAgent, createFauna, AnimalSpawner, animalDialogue
src/interaction/               # Interactable union, pickInGaze, resolveInteraction (NPC/animal/well/tree/spawner/item)
src/items/                    # ItemKind/Inventory, ItemSpawner (renewable pool), createItemSpawners
src/quests/                   # QuestDef/QuestObjective/QuestStage, QuestManager
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

0. ~~Worker pool dla generacji terenu~~ → `done` ([plans/2026-08-07--006--terrain-worker-pool.md](docs/plans/2026-08-07--006--terrain-worker-pool.md)); ~~chunk streaming + duże regiony (oceany/góry)~~ → `done` ([plans/2026-08-07--007--world-streaming-persistence.md](docs/plans/2026-08-07--007--world-streaming-persistence.md), streaming część); ~~NPC dialog~~ → `done` ([plans/2026-08-07--011--npc-interactions.md](docs/plans/2026-08-07--011--npc-interactions.md)); ~~Minimapa~~ → `verification needed` ([plans/2026-08-07--029--minimap.md](docs/plans/2026-08-07--029--minimap.md)); ~~Trawa (fazy 1-4 Must)~~ → `verification needed` ([plans/2026-08-07--008--grass-rendering.md](docs/plans/2026-08-07--008--grass-rendering.md)); ~~Save/persystencja (IndexedDB)~~ → `done` ([plans/2026-08-07--007--world-streaming-persistence.md](docs/plans/2026-08-07--007--world-streaming-persistence.md) — single-slot save, Continue/New Game start screen, Save + New Game w pause menu, `src/persistence/`)
1. Wizualny overhaul (rośliny/krzewy, niebo/chmury, góry w tle — insp. SimonDev MMORPG devlog) → [plans/2026-08-07--024--world-visual-overhaul.md](docs/plans/2026-08-07--024--world-visual-overhaul.md) (`in progress`: rośliny + niebo done, góry w tle + chmury open; Mixamo→Blender pipeline rozważony i odłożony — Quaternius modele już mają pełny zestaw animacji). Kontynuacja: **obszary biomów** (pustynia/bagno/las, makro-oś wilgotności niezależna od `continentalness`/`mountainRidge`, charakterystyczna roślinność jak kaktus/trzcina) → [plans/2026-08-07--028--biome-regions.md](docs/plans/2026-08-07--028--biome-regions.md) (`verification needed` — zaimplementowane w working tree, niezacommitowane, wymaga wizualnej weryfikacji w przeglądarce). Kolejna warstwa na tym samym pipeline: **drogi i ścieżki** (międzyosadowe drogi + ścieżki osada↔port, trasowanie po małej zmianie wysokości, wygładzenie terenu + kolor, reużycie `wander`/`steerTo` dla NPC) → [plans/2026-08-07--026--roads-and-paths.md](docs/plans/2026-08-07--026--roads-and-paths.md) (`planned`)
2. Game UI screens (nie lil-gui) → [plans/2026-08-07--005--game-ui-screens.md](docs/plans/2026-08-07--005--game-ui-screens.md) (`in progress`: pause menu + Character (imię gracza) done — `src/ui/createPauseMenu.ts`; World config / Notes / NPC dialog open)
3. Cube-sphere / pełny sferyczny świat — nadal otwarte pytanie (nie rozstrzygnięte, obecny streaming to flat chunk grid z ringiem, nie sfera), patrz [plans/2026-08-07--007--world-streaming-persistence.md](docs/plans/2026-08-07--007--world-streaming-persistence.md) "Kierunek świata". Real textures/triplanar dopuszczone jako opcjonalny feature później (nie trzymamy się low-poly na sztywno) — patrz [research/2026-08-07-simodev-refs-review.md](docs/research/2026-08-07-simodev-refs-review.md) Update note
4. Nowe pomysły (`planned`, nieskolejkowane): [plans/2026-08-07--016--ambient-world-audio.md](docs/plans/2026-08-07--016--ambient-world-audio.md). ~~Predator-prey system~~ → `done` ([plans/2026-08-07--010--predator-prey-system.md](docs/plans/2026-08-07--010--predator-prey-system.md) — zaimplementowany w working tree, niezacommitowany). ~~NPC gender-matched models~~ → `done` ([plans/2026-08-07--013--npc-gender-models.md](docs/plans/2026-08-07--013--npc-gender-models.md) — Quaternius Ultimate Modular Women pobrany i skonwertowany, `NPC_MODEL_URLS`/`CHARACTERS` w `src/ai/characters.ts`). ~~NPC reaction sounds~~ → `done` ([plans/2026-08-07--014--npc-reaction-sounds.md](docs/plans/2026-08-07--014--npc-reaction-sounds.md) — trigger/cooldown/gender pool w `NpcAgent.ts`, klipy w `public/sounds/`, potwierdzone w przeglądarce). ~~NPC character depth (role/traits/Big Five/HP + ekran Mieszkańcy)~~ → `verification needed` ([plans/2026-08-07--022--npc-character-depth.md](docs/plans/2026-08-07--022--npc-character-depth.md) — `src/ai/characters.ts`, `src/shared/HealthState.ts`, `src/ui/createVillagersScreen.ts`; browser regression fauny + wizualna weryfikacja jeszcze do zrobienia)
5. v0.4+ questy i wioski → [plans/2026-08-07--015--quests-v1.md](docs/plans/2026-08-07--015--quests-v1.md) (`verification needed` — relay quest + quest log panel `[L]` z filtrem, exp, relation/sympathy per NPC); [plans/2026-08-07--018--quests-v2-world-interactions.md](docs/plans/2026-08-07--018--quests-v2-world-interactions.md) (`verification needed` — multi-stage questy, interakcje ze studnią/drzewami/żywymi zwierzętami/spawnerami fauny, itemy: muszle/kamienie world-gen per-chunk + odnawialna pula blisko osady, `src/interaction/`, `src/items/`, `SaveData` v2), [plans/2026-08-07--025--multi-settlements.md](docs/plans/2026-08-07--025--multi-settlements.md) (`verification needed` — generator wiosek + streaming zaimplementowane, `src/settlement/settlementGenerator.ts`/`SettlementsManager.ts`; questy między wioskami nadal poza zakresem)

Woda (brzeg + dzień/noc): `done` → [issues 001](docs/issues/2026-08-07--001--water-shore-color-banding.md), [002](docs/issues/2026-08-07--002--water-daynight-integration.md) (review: [docs/reviews/2026-08-07--001--water-quality.md](docs/reviews/2026-08-07--001--water-quality.md))

### Research

- Tech: [docs/research/2026-08-06-threejs-terrain-ai-tech-research.md](docs/research/2026-08-06-threejs-terrain-ai-tech-research.md)
- Assets: [docs/research/2026-08-07-3d-asset-sources.md](docs/research/2026-08-07-3d-asset-sources.md) (Quaternius)
- Portfolio audit: [docs/research/2026-08-07-3d-portfolio-library-audit.md](docs/research/2026-08-07-3d-portfolio-library-audit.md)

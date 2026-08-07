# Roadmap

**Status:** `planned`  
**Created:** 2026-08-06  
**Updated:** 2026-08-07 (handoff nowej sesji)  

## Produkt (PR — szkic)

**Vibe:** życie wioski w proceduralnym krajobrazie (sandbox / demo / nauka + portfolio).  
**Nie:** MMO, multiplayer, pełny survival.

| | Decyzja |
|---|--------|
| Nazwa | **Seedvale** |
| Cel | Nauka, portfolio, bajer |
| Gracz | 3rd person — obserwacja **i** udział |
| Świat | Losowy obszar: góry, doliny, woda + las (klastry) + osada |
| AI v1 | Osada z potrzebami (drewno / woda / jedzenie) + fauna chase/flee |
| Questy | Później: najpierw proste, potem generator (opcjonalnie LLM / OpenRouter) |
| Świat | Docelowo **duży, ideałnie sferyczny** (unika hard edge / nieskończoności) — progresywna generacja obszarów przy zbliżaniu do krawędzi. Rewizja wcześniejszego "jedna dolina wystarczy"; patrz [plans/world-streaming-persistence](./plans/2026-08-07--world-streaming-persistence.md) |
| Styl art | **stylized / low-poly** default (Quaternius, [research](./research/2026-08-07-3d-asset-sources.md)); teren: smooth shading default. Prawdziwe tekstury (triplanar) — dopuszczone jako **opcjonalny feature/toggle** później, nie trzymamy się low-poly na sztywno |
| Stack | WebGL2, Vanilla Three + Vite + TS |

Research: [2026-08-06-threejs-terrain-ai-tech-research.md](./research/2026-08-06-threejs-terrain-ai-tech-research.md)

## Wersje

| Wersja | Zakres | Status |
|--------|--------|--------|
| **v0.1** | Teren heightmap + chodzenie 3rd person + mysz | `done` |
| **v0.2** | Osada + 3–5 NPC (woda / drewno / jedzenie) + etykiety + spawn | `done` |
| **v0.3** | Fauna predators & prey (chase/flee) + GLB art | `done` |
| **v0.3 art** | Swap fauny na GLB z `public/models/fauna/` (wolf/fox/deer/stag) | `done` |
| **v0.4+** | Proste questy → później generator (+ OpenRouter); dialog fundament: [plans/2026-08-07--npc-interactions.md](./plans/2026-08-07--npc-interactions.md) (`done`); quest v1: [plans/2026-08-07--quests-v1.md](./plans/2026-08-07--quests-v1.md) (`planned`) | później |
| ~~next~~ | ~~Worker pool dla generacji terenu (offload heightmap)~~ | `done` → [plans/2026-08-07--terrain-worker-pool.md](./plans/2026-08-07--terrain-worker-pool.md) |
| **później** | Wizualny overhaul: rośliny (krzewy), niebo/chmury, góry w tle | `in progress` — rośliny + niebo (bez chmur) done, góry w tle + chmury `planned` → [plans/2026-08-07--world-visual-overhaul.md](./plans/2026-08-07--world-visual-overhaul.md) |
| **duży świat** | Chunk streaming (load/unload radius, worker gen, duże regiony/oceany/góry) | `done` → [plans/2026-08-07--world-streaming-persistence.md](./plans/2026-08-07--world-streaming-persistence.md) |
| **później** | Zapis/save (IndexedDB → DB) — "Continue" po demie osady | `planned`, nie ruszone → tamże |
| **później** | Game UI (ekrany/dialogi, nie tylko lil-gui) | `in progress` — pause menu + character panel done, reszta `planned` |
| **polish** | Dzień/noc + HUD + time multiplier | `done` |

## Poza zakresem v0.1–v0.3

- Multiplayer / netcode  
- WebGPU-first  
- Pełny RPG / inventory / combat deep  

**Uwaga:** "Infinite / streaming world" był tu wcześniej jako poza zakresem — to się zmienia (duży/sferyczny świat to teraz kierunek produktu, patrz tabela wyżej i [plans/2026-08-07--world-streaming-persistence.md](./plans/2026-08-07--world-streaming-persistence.md)). Nadal nie w v0.1–v0.3, ale nie jest już odrzucone architektonicznie.

## Następne kroki (dla nowej sesji)

1. [x] Review wody (Claude): [reviews/2026-08-07-water-quality.md](./reviews/2026-08-07-water-quality.md) → follow-up: [issues 001](./issues/2026-08-07--001--water-shore-color-banding.md) (`done`), [002](./issues/2026-08-07--002--water-daynight-integration.md) (`done`)  
2. [x] GLB fauna pod `AnimalAgent` / `userData.animalKind` (Quaternius: wolf/fox/deer/stag; Idle/Walk/Gallop)  
3. [x] Worker pool dla generacji terenu → [plans/2026-08-07--terrain-worker-pool.md](./plans/2026-08-07--terrain-worker-pool.md) (`done`)
4. [x] Chunk streaming + duże regiony (oceany/wybrzeża/pasma górskie) + roślinność per-chunk → [plans/2026-08-07--world-streaming-persistence.md](./plans/2026-08-07--world-streaming-persistence.md) (streaming część `done`; cube-sphere/sferyczny świat nadal otwarte pytanie)
5. [x] NPC dialog (proximity-based, personality lines) → [plans/2026-08-07--npc-interactions.md](./plans/2026-08-07--npc-interactions.md) (`verification needed`)
5b. [x] Minimapa (collapsible, kierunek do osady) → [plans/2026-08-07--minimap.md](./plans/2026-08-07--minimap.md) (`verification needed`)
5c. [x] Trawa (instanced ground cover, fazy 1-4 Must) → [plans/2026-08-07--grass-rendering.md](./plans/2026-08-07--grass-rendering.md) (`done`; worker offload + noise wiatr/billboard LOD nadal odłożone)
6. [ ] Wizualny overhaul: dokończyć góry w tle + chmury → [plans/2026-08-07--world-visual-overhaul.md](./plans/2026-08-07--world-visual-overhaul.md) (`in progress`)
7. [ ] Zapis/save (IndexedDB) — "Continue" po demie osady → [plans/2026-08-07--world-streaming-persistence.md](./plans/2026-08-07--world-streaming-persistence.md) (persystencja, nadal `planned`)
8. [ ] Opcjonalnie: game UI (World config/Notes/NPC dialog screen) → [plans/2026-08-07--game-ui-screens.md](./plans/2026-08-07--game-ui-screens.md) (`in progress`)  
9. [ ] Nowe pomysły od `7c2969f`: [plans/2026-08-07--npc-gender-models.md](./plans/2026-08-07--npc-gender-models.md), [plans/2026-08-07--npc-reaction-sounds.md](./plans/2026-08-07--npc-reaction-sounds.md), [plans/2026-08-07--npc-character-depth.md](./plans/2026-08-07--npc-character-depth.md), [plans/2026-08-07--ambient-world-audio.md](./plans/2026-08-07--ambient-world-audio.md) — `planned`, nieskolejkowane. [plans/2026-08-07--predator-prey-system.md](./plans/2026-08-07--predator-prey-system.md) → już `verification needed` (zaimplementowany w working tree)
10. [ ] v0.4 questy → [plans/2026-08-07--quests-v1.md](./plans/2026-08-07--quests-v1.md) (`planned`, minimalny relay quest nad dialogiem)

Handoff szczegółowy: [CLAUDE.md](../CLAUDE.md)

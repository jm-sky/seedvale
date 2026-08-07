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
| **v0.4+** | Proste questy → później generator (+ OpenRouter); pierwszy krok: [plans/2026-08-07--npc-interactions.md](./plans/2026-08-07--npc-interactions.md) | później |
| **next** | Worker pool dla generacji terenu (offload heightmap) | `planned` — priorytet |
| **później** | Wizualny overhaul: rośliny (krzewy), niebo/chmury, góry w tle | `planned` — po worker poolu |
| **później** | Duży/sferyczny świat: chunk streaming + zapis (IndexedDB → DB) | `planned` |
| **później** | Game UI (ekrany/dialogi, nie tylko lil-gui) | `planned` |
| **polish** | Dzień/noc + HUD + time multiplier | `done` |

## Poza zakresem v0.1–v0.3

- Multiplayer / netcode  
- WebGPU-first  
- Pełny RPG / inventory / combat deep  

**Uwaga:** "Infinite / streaming world" był tu wcześniej jako poza zakresem — to się zmienia (duży/sferyczny świat to teraz kierunek produktu, patrz tabela wyżej i [plans/2026-08-07--world-streaming-persistence.md](./plans/2026-08-07--world-streaming-persistence.md)). Nadal nie w v0.1–v0.3, ale nie jest już odrzucone architektonicznie.

## Następne kroki (dla nowej sesji)

1. [x] Review wody (Claude): [reviews/2026-08-07-water-quality.md](./reviews/2026-08-07-water-quality.md) → follow-up: [issues 001](./issues/2026-08-07--001--water-shore-color-banding.md) (`done`), [002](./issues/2026-08-07--002--water-daynight-integration.md) (`done`)  
2. [x] GLB fauna pod `AnimalAgent` / `userData.animalKind` (Quaternius: wolf/fox/deer/stag; Idle/Walk/Gallop)  
3. [ ] **Priorytet (user, 2026-08-07):** worker pool dla generacji terenu → [plans/2026-08-07--terrain-worker-pool.md](./plans/2026-08-07--terrain-worker-pool.md)
4. [ ] Wizualny overhaul (rośliny/niebo-chmury/góry w tle, insp. SimonDev) — **po** worker poolu → [plans/2026-08-07--world-visual-overhaul.md](./plans/2026-08-07--world-visual-overhaul.md)
5. [ ] Opcjonalnie: game UI → [plans/2026-08-07--game-ui-screens.md](./plans/2026-08-07--game-ui-screens.md)  
6. [ ] v0.4 questy — dopiero po decyzji scope; poprzedzone przez interakcje NPC → [plans/2026-08-07--npc-interactions.md](./plans/2026-08-07--npc-interactions.md) (`planned`)  
7. [ ] Duży/sferyczny świat — osobna sesja research/plan zanim implementacja (patrz [plans/2026-08-07--world-streaming-persistence.md](./plans/2026-08-07--world-streaming-persistence.md))

Handoff szczegółowy: [CLAUDE.md](../CLAUDE.md)

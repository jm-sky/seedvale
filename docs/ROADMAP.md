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
| Styl art | **stylized / low-poly** — Quaternius ([research](./research/2026-08-07-3d-asset-sources.md)); teren: smooth shading default |
| Stack | WebGL2, Vanilla Three + Vite + TS |

Research: [2026-08-06-threejs-terrain-ai-tech-research.md](./research/2026-08-06-threejs-terrain-ai-tech-research.md)

## Wersje

| Wersja | Zakres | Status |
|--------|--------|--------|
| **v0.1** | Teren heightmap + chodzenie 3rd person + mysz | `done` |
| **v0.2** | Osada + 3–5 NPC (woda / drewno / jedzenie) + etykiety + spawn | `done` |
| **v0.3** | Fauna predators & prey (chase/flee) + GLB art | `done` |
| **v0.3 art** | Swap fauny na GLB z `public/models/fauna/` (wolf/fox/deer/stag) | `done` |
| **v0.4+** | Proste questy → później generator (+ OpenRouter) | później |
| **później** | Chunk streaming + zapis (IndexedDB → DB) | `planned` |
| **później** | Game UI (ekrany/dialogi, nie tylko lil-gui) | `planned` |
| **polish** | Dzień/noc + HUD + time multiplier | `done` |

## Poza zakresem v0.1–v0.3

- Multiplayer / netcode  
- WebGPU-first  
- Pełny RPG / inventory / combat deep  
- Infinite / streaming world → [plans/2026-08-07--world-streaming-persistence.md](./plans/2026-08-07--world-streaming-persistence.md)

## Następne kroki (dla nowej sesji)

1. [x] Review wody (Claude): [reviews/2026-08-07-water-quality.md](./reviews/2026-08-07-water-quality.md) → follow-up: [issues 001](./issues/2026-08-07--001--water-shore-color-banding.md) (`done`), [002](./issues/2026-08-07--002--water-daynight-integration.md) (`done`)  
2. [x] GLB fauna pod `AnimalAgent` / `userData.animalKind` (Quaternius: wolf/fox/deer/stag; Idle/Walk/Gallop)  
3. [ ] Opcjonalnie: game UI → [plans/2026-08-07--game-ui-screens.md](./plans/2026-08-07--game-ui-screens.md)  
4. [ ] v0.4 questy — dopiero po decyzji scope  

Handoff szczegółowy: [CLAUDE.md](../CLAUDE.md)

# Roadmap

**Status:** `planned`  
**Created:** 2026-08-06  
**Updated:** 2026-08-07  

## Produkt (PR — szkic)

**Vibe:** życie wioski w proceduralnym krajobrazie (sandbox / demo / nauka + portfolio).  
**Nie:** MMO, multiplayer, pełny survival.

| | Decyzja |
|---|--------|
| Nazwa | **Seedvale** |
| Cel | Nauka, portfolio, bajer |
| Gracz | 3rd person — obserwacja **i** udział |
| Świat | Losowy obszar: góry, doliny, morza/jeziora + las + osada |
| AI v1 | Osada z potrzebami (drewno / woda / jedzenie) + fauna chase/flee |
| Questy | Później: najpierw proste, potem generator (opcjonalnie LLM / OpenRouter) |
| Styl art | **stylized / low-poly** |
| Stack start | WebGL2, Vanilla Three + Vite + TS (z research) |

Research: [2026-08-06-threejs-terrain-ai-tech-research.md](./research/2026-08-06-threejs-terrain-ai-tech-research.md)

## Wersje

| Wersja | Zakres | Status |
|--------|--------|--------|
| **v0.1** | Proceduralny teren (heightmap / chunki) + chodzenie 3rd person | `done` |
| **v0.2** | Osada: 3–5 NPC, potrzeby drewno / woda / jedzenie (ścinanie, studnia, …) | `in progress` |
| **v0.3** | Fauna w lesie: predators & prey (np. wilk, niedźwiedź / sarna, zając) — chase/flee | `todo` |
| **v0.4+** | Proste questy z sytuacji świata → później generator (+ OpenRouter) | później |
| **później** | Chunk streaming przy ruchu + zapis świata (lokalnie → baza) | `planned` |
| **później** | Zegar dnia/nocy (sun + ambient) | `planned` |

## Poza zakresem v0.1–v0.3

- Multiplayer / netcode  
- WebGPU-first  
- Pełny RPG / inventory / combat deep  
- Infinite / streaming world *(zaplanowane osobno — [plans/2026-08-07-world-streaming-persistence.md](./plans/2026-08-07-world-streaming-persistence.md))*

## Otwarte

- [ ] Features (`FEATURE-001+`) przy starcie implementacji  

## Następne kroki

1. ~~Nazwa~~ → Seedvale  
2. ~~Styl art~~ → stylized / low-poly  
3. ~~Plan / implementacja v0.1~~ → teren + chodzenie  
4. Plan / implementacja v0.2 → [plans/2026-08-07-v02-settlement-npc.md](./plans/2026-08-07-v02-settlement-npc.md)  
5. Później: game UI → [plans/2026-08-07-game-ui-screens.md](./plans/2026-08-07-game-ui-screens.md)  
6. Później: streaming + save → [plans/2026-08-07-world-streaming-persistence.md](./plans/2026-08-07-world-streaming-persistence.md)  
7. Później: dzień/noc → [plans/2026-08-07-day-night-clock.md](./plans/2026-08-07-day-night-clock.md)  

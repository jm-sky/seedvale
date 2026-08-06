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
| **v0.1** | Proceduralny teren (heightmap / chunki) + chodzenie 3rd person | `in progress` |
| **v0.2** | Osada: 3–5 NPC, potrzeby drewno / woda / jedzenie (ścinanie, studnia, …) | `todo` |
| **v0.3** | Fauna w lesie: predators & prey (np. wilk, niedźwiedź / sarna, zając) — chase/flee | `todo` |
| **v0.4+** | Proste questy z sytuacji świata → później generator (+ OpenRouter) | później |

## Poza zakresem v0.1–v0.3

- Multiplayer / netcode  
- WebGPU-first  
- Pełny RPG / inventory / combat deep  
- Nieskończony open world (wystarczy „jedna dolina + las + woda”)

## Otwarte

- [ ] Features (`FEATURE-001+`) przy starcie implementacji  

## Następne kroki

1. ~~Nazwa~~ → Seedvale  
2. ~~Styl art~~ → stylized / low-poly  
3. ~~Plan v0.1~~ → [plans/2026-08-07-v01-terrain-walking.md](./plans/2026-08-07-v01-terrain-walking.md)  
4. ~~Spike 1–2~~ → bootstrap + chodzenie na flat  
5. Spike 3 — heightmap FBM + kolory (trawa / skała / woda)  

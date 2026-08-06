# Roadmap

**Status:** `planned`  
**Created:** 2026-08-06  
**Updated:** 2026-08-07  

## Produkt (PR — szkic)

**Vibe:** życie wioski w proceduralnym krajobrazie (sandbox / demo / nauka + portfolio).  
**Nie:** MMO, multiplayer, pełny survival.

| | Decyzja |
|---|--------|
| Cel | Nauka, portfolio, bajer |
| Gracz | 3rd person — obserwacja **i** udział |
| Świat | Losowy obszar: góry, doliny, morza/jeziora + las + osada |
| AI v1 | Osada z potrzebami (drewno / woda / jedzenie) + fauna chase/flee |
| Questy | Później: najpierw proste, potem generator (opcjonalnie LLM / OpenRouter) |
| Styl art | ❓ otwarte — rekomendacja: **stylized / low-poly** (szybszy wow, czytelniejsze AI) |
| Stack start | WebGL2, Vanilla Three + Vite + TS (z research) |

Research: [2026-08-06-threejs-terrain-ai-tech-research.md](./research/2026-08-06-threejs-terrain-ai-tech-research.md)

## Wersje

| Wersja | Zakres | Status |
|--------|--------|--------|
| **v0.1** | Proceduralny teren (heightmap / chunki) + chodzenie 3rd person | `todo` |
| **v0.2** | Osada: 3–5 NPC, potrzeby drewno / woda / jedzenie (ścinanie, studnia, …) | `todo` |
| **v0.3** | Fauna w lesie: predators & prey (np. wilk, niedźwiedź / sarna, zając) — chase/flee | `todo` |
| **v0.4+** | Proste questy z sytuacji świata → później generator (+ OpenRouter) | później |

## Poza zakresem v0.1–v0.3

- Multiplayer / netcode  
- WebGPU-first  
- Pełny RPG / inventory / combat deep  
- Nieskończony open world (wystarczy „jedna dolina + las + woda”)

## Otwarte

- [ ] Art direction (stylized vs bardziej realistyczny)  
- [ ] Nazwa projektu / working title  
- [ ] Features (`FEATURE-001+`) i plan implementacji v0.1 w `plans/`

## Następne kroki

1. Domknąć styl art (lub przyjąć low-poly na start)  
2. Plan spike’ów v0.1 (Vite + Three + teren + kamera)  
3. Potem FEATURE-y pod v0.1 / v0.2 / v0.3  

# Plan: v0.2 — osada + NPC z potrzebami

**Status:** `in progress`  
**Created:** 2026-08-07  
**Scope:** [ROADMAP.md](../ROADMAP.md) v0.2  

## Cel

Na proceduralnym terenie: **mała osada** + **3–5 NPC**, którzy realizują proste potrzeby (drewno / woda / jedzenie). Gracz chodzi i obserwuje (pomaganie później).

## Done when

- [x] Widoczne propki osady (domki, studnia, stos drewna / palenisko) na względnie płaskim miejscu
- [x] 3–5 NPC (low-poly kapsuły lub proste mesh) z cyklem: idle → idź do źródła → „zbierz” → wróć
- [x] Co najmniej 2 potrzeby działające end-to-end (woda + drewno); jedzenie później
- [x] Bez navmesh na start: steering do punktów + sample height

## Spike’y

| # | Spike | Wynik |
|---|--------|--------|
| 1 | **Settlement site** — znajdź / spłaszcz punkt pod osadę (seedowany offset) | ✅ |
| 2 | **Props** — studnia, 2–3 chaty, drzewa, stockpile | ✅ |
| 3 | **NPC entity + agent loop** — pozycja, cel, stan | ✅ |
| 4 | **Needs / Utility lite** — woda vs drewno vs idle | ✅ |
| 5 | **Feedback** — kolor kapsuły = aktywna potrzeba | ✅ (etykiety HTML później / game UI) |

## Stack (v0.2)

- Bez Rapier / navmesh (jeszcze)
- Prosty FSM lub Utility score (2–3 opcje)
- Propki = `BoxGeometry` / grupy low-poly (bez assetów zewnętrznych na start)

## Katalogi (propozycja)

```
src/
  settlement/findSettlementSite.ts
  settlement/createSettlement.ts
  settlement/props.ts
  ai/Needs.ts
  ai/NpcAgent.ts
  entities/Npc.ts
```

## Poza v0.2

Fauna, questy, prawdziwe ścinanie drzew (despawn mesh), dialogi gracza, game UI screens → [2026-08-07-game-ui-screens.md](./2026-08-07-game-ui-screens.md)

## Następne

Implementacja spike 1–2, potem agenci.

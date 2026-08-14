# Plan: v0.2 — osada + NPC z potrzebami

**Status:** `done`  
**Created:** 2026-08-07  
**Scope:** [ROADMAP.md](../ROADMAP.md) v0.2  

## Cel

Na proceduralnym terenie: **mała osada** + **3–5 NPC**, którzy realizują proste potrzeby (drewno / woda / jedzenie). Gracz chodzi i obserwuje (pomaganie później).

## Done when

- [x] Widoczne propki osady (domki, studnia, ogród, stos, drzewa)
- [x] 3–5 NPC z cyklem potrzeb
- [x] 3 potrzeby: woda + drewno + jedzenie
- [x] Steering + sample height (bez navmesh)
- [x] Feedback: kolor + etykieta CSS2D
- [x] Spawn gracza przy osadzie


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

Fauna, questy, prawdziwe ścinanie drzew (despawn mesh), dialogi gracza, game UI screens → [2026-08-07--005--game-ui-screens.md](./2026-08-07--005--game-ui-screens.md)

## Następne

Implementacja spike 1–2, potem agenci.

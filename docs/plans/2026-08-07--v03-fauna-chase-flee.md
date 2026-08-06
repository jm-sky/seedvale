# Plan: v0.3 — fauna (predators & prey)

**Status:** `in progress`  
**Created:** 2026-08-07  
**Scope:** [ROADMAP.md](../ROADMAP.md) v0.3  

## Cel

W lesie wokół osady: **drapieżniki i ofiary** z prostym chase/flee. Placeholdery mesh (kapsuły/low-poly) — **modele GLB** dokładane równolegle przez drugiego agenta ([research assets](../research/2026-08-07-3d-asset-sources.md)).

## Done when

- [x] ≥2 typy prey + ≥1–2 predatorów (wilk/niedźwiedź, sarna/zając)
- [x] Prey ucieka gdy predator w zasięgu; predator goni najbliższą ofiarę
- [x] Spawn poza centrum osady (pierścień leśny)
- [x] Grounding na heightmapie; unikanie głębokiej wody
- [x] Hook pod swap mesh → GLB (`userData.animalKind`) — art od drugiego agenta

## Spike’y

| # | Spike | Wynik |
|---|--------|--------|
| 1 | `AnimalAgent` + roles predator/prey | ✅ kapsuły |
| 2 | `createFauna` spawn ring wokół settlement | ✅ |
| 3 | Integracja createApp + rebuild | ✅ |
| 4 | (później) podpięcie GLB z `public/models/fauna/` | czekamy na drugiego agenta |

## Poza v0.3

- Combat / HP / loot  
- Navmesh crowd  
- Animacje (poczekać na GLB z anim)

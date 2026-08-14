# Plan: Village generator polish

**Status:** `verification needed` 🔍  
**Created:** 2026-08-12  
**Priority:** 🟡 medium  
**Effort:** L  
**Depends on:** ~~047~~, ~~072~~, ~~074~~

## Cel

Dopracować wygląd i layout generatora osad: wydeptane ścieżki/plac w centrum, ognisko poza studnią, yaw i pad pod domami, rzadkie First Age shells, drzewa poza dziedzińcem (z limitem 0–3), nowa tabliczka nazwy (2 słupy + deska).

## Zrobione (2026-08-12)

1. **Ścieżki / plac** — lokalne `kind === 'road'` dostają road tint/height; radial wear od centrum; `plazaCoreRadius` MD/LG/XL; silniejszy house pad (`houseRadius` 8, `heightStrength` 0.95).
2. **Ognisko** — pierścień ~0.55×`plazaCoreRadius` + `maxCenterDist` (dirt placu); props: `pushAwayFrom` studni + `pullIntoDisk` (jitter nie wyrzuca na trawę).
3. **Yaw domów** — face plaza + jitter na obrzeżach.
4. **`pickHomeHouse`** — shells tylko OUTPOST/SM (~20%); MD+ tylko `hasWalls`.
5. **Las** — woodlots poza pierścień; courtyard reject; 0–3 drzewa ozdobne.
6. **Tabliczka** — 2 słupy + deska 0.6 m; CSS2D na `VILLAGE_NAMEPOST_BOARD_CENTER_Y`.

### Playtest follow-up

- Tabliczka +1 m (słupy 4 m, deska y=3.4).
- Drzewa: reject też lokalnych `VillagePlan.paths` (nie tylko house↔core / inter-settlement).
- Ogród: `minCenterDist` + pierścień poza placem; props push off plaza/ścieżki (iteracja, clearance 3.4).
- Zapalenie ogniska o zmierzchu: MD 75% / LG 85% / XL 100%.
- Lokalne ścieżki: silniejszy tint (≥0.78) + wyższy floor wear — bez trawy na środku pasa.
- Plac: clearing wygrywa wysokość nad drogami (bez potholi na placu). `CLEARING_INNER_FRACTION` 0.45 (płaski środek + długa spódnica; 0.82 dawało mesę).

## Done when

- [x] Implementacja w kodzie
- [x] `tsc` / lint / test / build
- [ ] Browser: MD+ — brązowe ścieżki/plac, ognisko obok studni, yaw/pad, mało shells, ≤3 drzewa na dziedzińcu, tabliczka 2 słupy

## Poza zakresem

- Nowe modele domów ze ścianami poza `hut_d`
- Zmiany chunk vegetation / plan 073
- Redesign A* road network

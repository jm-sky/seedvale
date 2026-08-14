# Plan: widoczność odpoczynku w mieście + sekwencja obozu + reset Pause Menu + filtr Czekaj

**Created:** 2026-08-12  
**Status:** `verification needed`  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~041~~, ~~075~~

## Cel

1. Przycisk „Odpocznij w mieście” znika poza osadą (Quick Actions).
2. „Rozbij obóz”: kucanie → koc na ziemi → leżenie → time-skip 8h → kucanie → zniknięcie koca → wstanie.
3. Esc / zamknięcie Pause Menu resetuje `currentScreen` na `main`.
4. „Czekaj” dostaje ten sam filtr co odpoczynek, ale `fadeStrength: 0.5`.

## Zakres

- Quick Actions `nearTown` (wzorzec `hasShovel`).
- `PlayerController` pose: stand / crouch / lie.
- Proceduralny ground prop koca + `restCampSequence`.
- `fadeStrength` w time-skip overlay (zamiast boolean `fade`).
- PauseMenu watch na `open` → `currentScreen = 'main'`.

## Poza zakresem

- GLB bedroll, zużycie koca, odpoczynek w Pause → Akcje, footprint `VillageSize` zamiast `REST_IN_TOWN_RADIUS`.

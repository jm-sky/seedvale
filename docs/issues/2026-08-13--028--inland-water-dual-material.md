# Śródlądowa woda renderuje się dwoma materiałami (jezioro + ocean)

**Status:** `todo`
**Created:** 2026-08-13
**Źródło:** screen użytkownika — staw/ciek przy piaszczystym brzegu; SoT [WATER.md](../WATER.md)

## Problem

Jeden śródlądowy zbiornik wygląda jak dwa niezależne płatki wody:

- wijąca się, jasnoniebieska, prawie płaska tafla (shader jeziora),
- na środku ciemniejsza, falująca plama o twardych prostych krawędziach (Water.js ocean), bez przejścia między nimi.

Screen: [refs/water-2026-08-13-inland-dual-material.png](../refs/water-2026-08-13-inland-dual-material.png).

To nie jest issue [003](./2026-08-07--003--ocean-shoreline-artifacts.md) (brzeg ocean↔ląd na wybrzeżu). Tu ocean **wycieka do jeziora**.

## Diagnoza

1. `detectWaterBodies` / `computeBodyScale` klasyfikują zbiornik **per chunk**. `isLarge` = powierzchnia ≥ 35% siatki tego chunka (`LARGE_BODY_AREA_FRACTION`).
2. `createChunkWater` robi `discard` gdy `vBodyScale > 0.9` — „duże” komórki oddaje singletonowi oceanu.
3. Ocean to globalny plane bez maski brzegu (`createOcean.ts`). Widać go wszędzie, gdzie teren jest ≤ `waterLevel` i jezioro odpuściło piksel.
4. Palety i model fal są inne (`DAY_WATER_COLOR` 0x0f3a52 vs `DAY_SHALLOW` 0x4fa3c8), więc szew klasyfikacji jest krzykliwy.

BFS nie widzi, że ciek ciągnie się przez sąsiadów — ten sam basen może być oceanem w jednym chunku i jeziorem w następnym.

## Kierunek (do rozstrzygnięcia przy realizacji)

Rekomendacja w [WATER.md](../WATER.md) P0, pending decyzja **W8**:

- Ocean tylko dla prawdziwego morza / wybrzeża; śródlądzie zawsze na `createChunkWater`, niezależnie od pola w chunku.
- Ewentualnie spójna klasyfikacja z apronem / sąsiadami, jeśli `isLarge` ma zostać.

Nie robić trzeciego shadera. Nie traktować powiększenia mirror RT jako fixu.

P1 (brzeg, world-space waves, palety) — po P0; opisane w WATER.md, nie w tym issue.

## Effort

S — zmiana reguły `isLarge` / discard. M — jeśli klasyfikacja ma być spójna między chunkami.

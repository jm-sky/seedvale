---
domain: items-player
---

# Plan: fałszywe land SFX przy chodzeniu

**Created:** 2026-08-18  
**Status:** `done` ✅ — playtest 2026-08-18  
**Priority:** high · **Effort:** S  
**Depends on:** none

## Problem

Chód po lesie/trawie od czasu do czasu gra Kenney `footstep-01…04` (twardy bębenek). Logi pokazują `playJumpLand` → `playAt` → `playOnce`, nie `playFootstep`.

Dwie przyczyny:

1. **Fałszywe lądowanie.** `updateVerticalMotion` (plan 097) stosował grawitację także na ziemi. Przyklejenie z `vy = 0` to ~`GRAVITY * dt²` ≈ 0.5 cm / klatkę. Stok stromszy niż ~2–4° przy `MOVE_SPEED = 8` odpinał gracza; po kilku klatkach spadania `wasAirborne` odpalał land SFX. `tickFootsteps` milczy w powietrzu, więc zamiast trawy słychać sam thud (`LAND_VOLUME = 0.42` vs krok `0.14`).
2. **Zły clip.** `playJumpLand` brał losowy Kenney `footstep-01…04` niezależnie od terenu.

Playtest planu 121 („sprint po trawie jak kamienny korytarz”) jest prawie na pewno tym samym błędem.

## Zakres

Bez nowych assetów. Kenney `footstep-01…04` zostają w `public/sounds/` (S17 — nadal brak dedykowanego clipu lądowania), ale **nie są grane**.

1. Czysta integracja pionowa: [`src/player/verticalMotion.ts`](../../src/player/verticalMotion.ts) (`integrateVerticalMotion`). Woda zostaje w `PlayerController`.
   - step-up jak dziś
   - step-down do `STEP_DOWN_MAX` (0.45 m, poniżej wysokości skoku 0.6 m)
   - grawitacja tylko w powietrzu
   - `landed` tylko gdy `-vy >= LAND_MIN_SPEED` (~3 m/s)
2. `playJumpLand(playAt, position, surface)` — ten sam pack co kroki, przy `LAND_VOLUME`.
3. Usunąć `FOOTSTEP_SOUND_URLS` z runtime.

Poza zakresem: dedykowany clip skoku/lądowania (S17), coyote time, zmiana wysokości skoku.

## Weryfikacja w przeglądarce

Playtest 2026-08-18 — zamknięte.

Dev server `:5577`.

1. Las / łąka — tylko trawa, bez bębenka; brak `playJumpLand` przy zwykłym chodzie.
2. Sprint po pagórku — to samo.
3. Spacja — takeoff (cloth) + lądowanie w charakterze podłoża.
4. Zejście z wyraźnej krawędzi — land SFX; mały schodek — nie.

1. Las / łąka — tylko trawa, bez bębenka; brak `playJumpLand` przy zwykłym chodzie.
2. Sprint po pagórku — to samo.
3. Spacja — takeoff (cloth) + lądowanie w charakterze podłoża.
4. Zejście z wyraźnej krawędzi — land SFX; mały schodek — nie.

## Implementation summary

- [`src/player/verticalMotion.ts`](../../src/player/verticalMotion.ts) + testy: slope-stick, próg land, skok 0.6 m.
- [`src/player/PlayerController.ts`](../../src/player/PlayerController.ts) woła helper; land SFX tylko przy `landed`.
- [`src/audio/playerMoveSounds.ts`](../../src/audio/playerMoveSounds.ts): land = pack terenu; Kenney generics odpięte.

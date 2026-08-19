# 034 — HUD: brak paska HP pod zegarem

**Status:** `done` — zaimplementowane 2026-08-19; playtest OK.
**Created:** 2026-08-19
**Źródło:** zgłoszenie użytkownika

## Objaw / prośba

HUD pod zegarem pokazywał tylko cztery paski potrzeb (Kondycja / Wigor / Głód / Pragnienie). HP gracza działało (`HealthState`, ekran Postać, CSS2D belka nad modelem), ale nie było w stałym HUD.

Oczekiwane: pasek zdrowia nad kondycją, ten sam wygląd (3px, tooltip, kolor `#e05555` jak `.npc-label__bar--hp`).

Kolejność: **Zdrowie → Kondycja → Wigor → Głód → Pragnienie**.

## Naprawa

Payload HUD `playerNeeds` dostał ratio `hp` (0–1) — to nie jest `PlayerNeeds`, tylko blob HUD.

- `src/ui-vue/store.ts` — `hp` w `HudState.playerNeeds`, `setHudPlayerNeeds`
- `src/ui/createHud.ts` — ten sam kształt `setPlayerNeeds`
- `src/app/gameLoop.ts` — push z `player.health`
- `src/ui-vue/screens/HudScreen.vue` — pierwszy pasek „Zdrowie”

Mechanika HP, regeneracja, downed i CSS2D belka nad modelem bez zmian.

## Weryfikacja

Techniczna: `tsc` / `lint:fix` / `build` — zielona 2026-08-19.
Ręczna: playtest 2026-08-19 — pasek czerwony nad kondycją, działa.

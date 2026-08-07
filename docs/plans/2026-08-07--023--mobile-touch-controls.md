# Mobile / touch controls (desktop + mobile, np. Samsung Galaxy A55)

**Status:** `done`

## Cel

Gra działała wyłącznie na WASD + mysz (pointer lock) + skróty klawiszowe (E/L/G/Esc). Na telefonie (dotyk, brak klawiatury/fizycznej myszy) nie dało się grać w ogóle. Cel: sterowanie dotykowe równoległe do desktopowego, bez zmian w logice gry (`PlayerController`, pętla interakcji w `createApp`).

## Podejście

Touch input pisze bezpośrednio do tych samych współdzielonych obiektów co klawiatura/mysz (`KeyState`, `LookState`) — `PlayerController` i pętla w `createApp.tick()` nie wiedzą, skąd przyszło wciśnięcie. Zero rozgałęzień `if (touch) ...` w logice gry.

- `src/input/isTouchDevice.ts` — heurystyka `'ontouchstart' in window || navigator.maxTouchPoints > 0`, cache'owana.
- `src/input/createTouchControls.ts` — nowy moduł:
  - **Joystick** (bottom-left, single-touch) → analogowo mapowany na `keys.forward/backward/left/right` (próg kierunku + deadzone), tak jak WASD.
  - **Look zone** (pełny ekran, pod joystickiem/przyciskami w z-index) → drag jednym palcem = yaw/pitch (`LookState`), dwoma palcami = pinch-zoom (`LookState.distance`). Reużywa `clampDistance`/`clampPitch` wyeksportowanych z `MouseLook.ts` (ta sama matematyka co scroll-wheel zoom na desktopie).
  - **Przyciski**: Interact `[E]`, Sprint (toggle, nie hold — wygodniejsze przy dwóch kciukach), Drop `[G]`, Quest log `[L]`, Pause `☰` (nowy `pauseMenu.togglePause()`).
- `MouseLook.ts` — na touch device nie podpina `click`→`requestPointerLock` ani `mousemove` (i tak nie ma realnych ruchów myszy z dotyku); `wheel` zostaje (nieszkodliwy no-op na telefonie).
- Warunkowe hinty tekstowe (HUD, pause menu, npc dialog, quest log, villagers) — inny tekst dla touch (np. „Dotknij poza oknem — zamknij” zamiast „Esc — zamknij”; zamykanie tapnięciem w tło już działało wcześniej przez istniejący `onRootClick`, tylko tekst był mylący).

## Responsywność (`index.html`)

- Viewport: `maximum-scale=1, user-scalable=no, viewport-fit=cover` — bez tego przeglądarka próbuje własnego pinch-zoomu strony, konfliktującego z naszym pinch-zoomem kamery.
- `html,body`: `height: 100dvh` (pasek adresu Chrome/Android potrafi zmieniać viewport), `touch-action: none`, `overscroll-behavior: none` (blokuje pull-to-refresh), `user-select: none` poza `input`/`textarea`.
- Modalne panele (`pause`/`npc-dialog`/`quest-log`/`villagers`) dostają `max-width: calc(100vw - 32px)` w media query `(max-width: 700px), (max-height: 500px)` — wcześniej miały tylko `min-width: 280-480px`, co realnie przelewało się poza wąski ekran telefonu.
- Minimap (domyślnie bottom-left) koliduje z joystickiem — pod klasą `body.seedvale-touch` przesunięty do top-right.
- `.seedvale-rotate-hint` — czysto CSS-owy overlay (`@media (orientation: portrait) and (pointer: coarse)`), sugeruje obrót do landscape na wąskim ekranie dotykowym; nie blokuje gry (portret nadal działa, tylko ciasno).

## Co NIE zostało zrobione (świadomie odłożone)

- Brak dedykowanych przycisków zoom +/- — tylko pinch (dwa palce). Jeśli pinch okaże się niewygodny w jednoręcznym trzymaniu telefonu, do rozważenia.
- Brak testu na fizycznym Galaxy A55 — zweryfikowano `tsc`/`lint`/`build`/`vitest`, dev server odpalony na `:5577`; wizualna/dotykowa weryfikacja na urządzeniu → do zrobienia przez użytkownika.
- Czułość touch-look (`LOOK_SENSITIVITY`, `PINCH_ZOOM_SPEED` w `createTouchControls.ts`) to wartości "na oko", nieprzetestowane na realnym palcu/ekranie — mogą wymagać strojenia po pierwszym teście.

## Pliki

`src/input/isTouchDevice.ts`, `src/input/createTouchControls.ts`, `src/input/MouseLook.ts`, `src/app/createApp.ts`, `src/ui/createPauseMenu.ts` (`togglePause`), `src/ui/createHud.ts`, `src/ui/createNpcDialog.ts`, `src/ui/createQuestLog.ts`, `src/ui/createVillagersScreen.ts`, `index.html`.

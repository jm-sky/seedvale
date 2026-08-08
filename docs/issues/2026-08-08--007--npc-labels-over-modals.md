# Etykiety NPC widoczne nad otwartym menu

**Status:** `verification needed` — naprawione 2026-08-09: `labelRenderer.domElement` (`src/app/createApp.ts`) dostał jawny `z-index: 1`, poniżej najniższego overlaya UI (`.seedvale-hud` ma `z-index: 5`). Wymaga wizualnego potwierdzenia w przeglądarce (otwórz dowolny modal przy widocznym NPC).
**Created:** 2026-08-08
**Źródło:** zgłoszenie użytkownika po teście generowania wiosek

## Objaw

Etykiety NPC (imię + potrzeba, `.npc-label`, renderowane przez `CSS2DRenderer` — `src/app/createApp.ts`) są widoczne **nad** otwartym menu (pauza / quest log / ekran Mieszkańcy / dialog NPC), zamiast być zasłonięte przez nie. Zasłaniają treść modala.

## Prawdopodobny obszar

`labelRenderer.domElement` (`src/app/createApp.ts:133-138`) ma `position: absolute`, `inset: 0`, ale **bez jawnego `z-index`**. Modale mają jawne wartości (np. `.seedvale-pause` → `z-index: 10`, `index.html`). Bez sprawdzenia w przeglądarce nie wiadomo na pewno, czy to:
- brak `z-index` na `labelRenderer.domElement` (powinien być niższy niż wszystkie modale), czy
- modal i `labelRenderer.domElement` nie są w tym samym stacking-context ancestorze (różni rodzice w DOM), więc porównanie `z-index` nie działa tak jak w jednym drzewie.

Do zweryfikowania i naprawienia przy implementacji — najprostsza łatka to prawdopodobnie ustawienie niskiego jawnego `z-index` na `labelRenderer.domElement` (np. `1`, poniżej najniższego modala) zamiast polegania na kolejności w DOM.

## Poza zakresem teraz

Tylko zgłoszenie — bez diagnozy w przeglądarce/naprawy w tym wpisie.

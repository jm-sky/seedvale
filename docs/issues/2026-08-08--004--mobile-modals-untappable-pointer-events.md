# Menu pauzy (i pozostałe modale) nie reagują na dotyk ani nie scrollują na mobile

**Status:** `verification needed`
**Created:** 2026-08-08
**Updated:** 2026-08-08
**Źródło:** zgłoszenie użytkownika (Android, Firefox Mobile **oraz** Chrome Mobile — identyczny objaw), po trzech nieudanych rundach poprawek

## Objaw

Na telefonie:

- ☰ otwiera menu pauzy — panel jest **widoczny** (tytuł, pole imienia, przyciski Resume / Zadania / Mieszkańcy / Save / New Game),
- **żaden** przycisk w panelu nie reaguje na dotyk, tapnięcie w tło (backdrop) też nie zamyka menu,
- panel **nie scrolluje**, mimo że treść nie mieści się w viewporcie,
- tapnięcia „przechodzą" przez modal na elementy pod spodem (np. przełącza się RUN).

Te same objawy dotyczyły wszystkich czterech modali: pauzy, dialogu NPC, dziennika zadań i ekranu Mieszkańcy.

## Przyczyna źródłowa

Kolizja nazw klas CSS. `createApp.ts` ustawiał marker urządzenia dotykowego na `<body>`:

```ts
document.body.classList.toggle('seedvale-touch', isTouchDevice())
```

ale `seedvale-touch` to jednocześnie **klasa bloku komponentu** nakładki sterowania dotykowego (`createTouchControls.ts`), której reguła w `index.html` brzmi:

```css
.seedvale-touch {
  position: absolute;
  inset: 0;
  z-index: 7;
  pointer-events: none;
}
```

Na urządzeniu dotykowym `<body>` dostawał więc `pointer-events: none`. Ponieważ `pointer-events` jest własnością **dziedziczoną**, cały dokument (`#app`, `canvas`, wszystkie modale i ich przyciski) przestawał być hit-testowalny. Działały wyłącznie te elementy, które jawnie przywracają `pointer-events: auto` — czyli joystick, strefa look-drag i przyciski akcji (`.seedvale-touch__look`, `.seedvale-touch__button`, `.seedvale-touch__pause`). Stąd wrażenie, że dotyk „przechodzi" przez modal na RUN.

Brak scrolla ma to samo źródło: panel z `overflow-y: auto` nie może być celem dotyku, więc ani natywny scroll, ani manualny fallback (`enableTouchScroll`) nie dostawały zdarzeń.

Objaw jest z definicji identyczny w Gecko i Blink — to zwykłe dziedziczenie CSS, nie quirk przeglądarki.

Błąd istniał od commita `b9284b4` („Add touch controls and responsive layout for mobile"), czyli od wprowadzenia sterowania dotykowego.

### Dlaczego trzy poprzednie rundy nie trafiły

Diagnostyka opierała się na `document.elementFromPoint()`, które zwracało `<html>` dla każdej współrzędnej. Zinterpretowano to jako problem z Fullscreen API, a potem jako artefakt `backdrop-filter` w headless/swiftshader. W rzeczywistości „`elementFromPoint` zwraca `<html>` wszędzie" to **dokładna sygnatura** `pointer-events: none` na `<body>`. Przed otwarciem modala pełnoekranowa strefa `.seedvale-touch__look` (z `pointer-events: auto`) była jedynym trafialnym elementem, więc test „działał"; po otwarciu modala `setInputEnabled(false)` wyłączał także ją — i nie zostawało nic.

## Poprawka

- `createApp.ts`: marker na `<body>` przemianowany na `seedvale-touch-device` (+ komentarz ostrzegawczy); `index.html`: dwa selektory `body.seedvale-touch …` zaktualizowane.
- `index.html`: cztery rooty modali (`.seedvale-pause`, `.seedvale-npc-dialog`, `.seedvale-quest-log`, `.seedvale-villagers`) jawnie ustawiają `pointer-events: auto`, żeby nigdy nie zależeć od tego, czy któryś przodek nie wyłączył zdarzeń.
- `index.html`: komentarz przy `.seedvale-touch` zakazujący reużycia tej klasy jako klasy stanu na `<body>`.
- Konsekwencja przywrócenia `pointer-events` na `<body>`: minimapa (z-index 8, nad strefą look-drag) zaczęłaby łykać przeciągnięcia kamery w prawym górnym rogu. Dlatego `.seedvale-minimap__canvas` i `.seedvale-top-right-cluster` dostają `pointer-events: none`, a interaktywny pozostaje tylko `.seedvale-minimap__toggle` (`pointer-events: auto`) — który przy okazji **po raz pierwszy** faktycznie działa na dotyk.

Poprawki z rund 1–2 (`touch-action` per element zamiast na `html,body`, `TouchControls.setInputEnabled()`, `enableTouchScroll`) zostały zachowane — są sensowne same w sobie i teraz wreszcie mogą zadziałać.

## Weryfikacja

Zautomatyzowana (headless Chromium, kontekst z `hasTouch`, prawdziwe zdarzenia `Input.dispatchTouchEvent` zamiast `elementFromPoint`): przed poprawką `getComputedStyle(document.body).pointerEvents === 'none'`, realny tap w Resume nie zamykał menu, a wymuszony `dispatchEvent('click')` — tak (czyli handler był sprawny, problem leżał wyłącznie w dostarczaniu zdarzeń).

Do potwierdzenia na prawdziwym urządzeniu (Android / Firefox + Chrome).

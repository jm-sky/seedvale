# Guziki dotykowe: rozważyć bibliotekę ikon

**Status:** `verification needed`
**Created:** 2026-08-08
**Updated:** 2026-08-11 — zaimplementowane w planie 046 Faza 4 (`lucide-vue-next`)
**Źródło:** propozycja użytkownika, przy okazji porządków w mobilnym UI po naprawie [issue 004](./2026-08-08--004--mobile-modals-untappable-pointer-events.md)

## Kontekst

Guziki dotykowe (`src/input/createTouchControls.ts`, `src/ui/createMinimap.ts`) używały gołego tekstu (`L`, `G`, `RUN`, `E`) albo emoji (`☰`, `[+]`/`[-]`).

## Rozwiązanie (plan 046 Faza 4)

Ikony `lucide-vue-next` w Vue chrome:

- Pause → `Menu`
- Quick actions (touch + FAB desktop) → `Zap`
- Drop → `PackageMinus` (+ aria-label)
- Sprint → `Footprints`
- Minimap collapse → `Plus` / `Minus`
- Interact / alt → litery `E` / `R` (zgodnie z pierwotną propozycją)

Joystick + look-drag zostają vanilla; tylko chrome przycisków jest w `TouchChrome.vue` / `MinimapScreen.vue`.

## Weryfikacja

Ręczny test touch (emulacja lub urządzenie) na `localhost:5577` — ikony czytelne, drop tylko przy niepustym ekwipunku, E działa przy prompcie questa.

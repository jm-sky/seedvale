# Guziki dotykowe: rozważyć bibliotekę ikon

**Status:** `todo`
**Created:** 2026-08-08
**Źródło:** propozycja użytkownika, przy okazji porządków w mobilnym UI po naprawie [issue 004](./2026-08-08--004--mobile-modals-untappable-pointer-events.md)

## Kontekst

Guziki dotykowe (`src/input/createTouchControls.ts`, `src/ui/createMinimap.ts`) dziś używają gołego tekstu (`L`, `G`, `RUN`, `E`) albo pojedynczego emoji (`☰`, `[+]`/`[-]` dla mapy). Czytelne, ale niespójne stylistycznie i mało intuicyjne — user explicite nie wiedział, do czego służy `G` (drop item), zanim mu to wyjaśniono.

## Propozycja

Dodać małą bibliotekę SVG-ikon (np. `lucide` — lekka, drzewiasty tree-shaking, popularna w projektach vanilla/Vite) i zamienić przynajmniej:
- `☰` → ikona hamburgera (już semantycznie ok, ale spójna z resztą)
- `[+]`/`[-]` mapy → ikona mapy/kompasu
- `G` (drop) → ikona np. "upuść"/strzałka w dół/skrzynka
- `E` (interact) → zostaje raczej jako litera (klawiszowy skrót ma sens wizualnie), do przemyślenia

## Poza zakresem teraz

Nie blokuje niczego, czysto kosmetyczne — do zaplanowania osobno (wybór biblioteki, rozmiar bundla, spójność z resztą stylu gry, czy ikony powinny współistnieć z literą-skrótem czy ją zastępować).

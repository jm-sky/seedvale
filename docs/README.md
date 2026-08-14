# Dokumentacja Seedvale

Ten katalog zawiera dokumentację projektu **Seedvale** (Three.js — proceduralny teren + AI postaci).

## Główne dokumenty

- **[VISION.md](./VISION.md)** — wizja i kontekst produktu (czytaj przed planowaniem nowych funkcji)
- **[STATE.md](./STATE.md)** — factual current implementation state
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — mapa architektury (WorldBundle, lifecycle, save)
- **[SETTLEMENTS.md](./SETTLEMENTS.md)** — osady i życie NPC (stan + standing decisions)
- **[GRAPHICS.md](./GRAPHICS.md)** — log decyzji / kontraktów graficznych
- **[WATER.md](./WATER.md)** — woda (ocean + jeziora: stan, decyzje, historia)
- **[ROADMAP.md](./ROADMAP.md)** — kierunek produktu
- **[../CLAUDE.md](../CLAUDE.md)** — reguły dla agentów

## Workflow (issues, reviews, research, plans, assets)

| Katalog | Przeznaczenie |
|---------|---------------|
| [issues/](./issues/README.md) | Błędy, usprawnienia, dług techniczny |
| [reviews/](./reviews/README.md) | Sesje przeglądu |
| [research/](./research/README.md) | Analizy, spike'i, porównania przed decyzją |
| [plans/](./plans/README.md) | Plany implementacji (wszystkie statusy) |
| [plans/archive/](./plans/archive/README.md) | Jednorazowo zamrożony batch planów z 2026-08-07–2026-08-14 |
| [assets/](./assets/README.md) | Żywe listy wymaganych modeli/dźwięków + CREDITS |
| [items/CATALOG.md](./items/CATALOG.md) | Itemy: hold / melee / spawn |

Statusy: `todo` · `planned` · `in progress` · `done` · `verification needed`

Nowe plany zostają w `plans/` niezależnie od statusu. `plans/archive/` nie przyjmuje kolejnych plików.

## Struktura katalogów

### `plans/`
Plany implementacji — indeks w [plans/README.md](./plans/README.md).

### `plans/archive/`
Zamrożona historia pierwszego okresu. Nie source of truth dla stanu kodu.

### `research/`
Analizy i porównania — indeks w [research/README.md](./research/README.md).

### `reviews/`
Sesje przeglądu — indeks w [reviews/README.md](./reviews/README.md).

### `features/`
Nieużywane. Plany żyją w `plans/`, nie tutaj.

### `examples/`
Przykładowe pliki, snippety, referencje zewnętrzne.

### `archive/`
Przestarzałe dokumenty top-level (nie plany). Osobne od `plans/archive/`.

### `deployment/`
Deploy / hosting (gdy będzie potrzebny).

### `testing/`
Notatki i raporty testowe.

### `prompts/`
Meta-prompty do powtarzalnych zadań (struktura docs, review, itd.).

---

**Ostatnia aktualizacja:** 2026-08-14

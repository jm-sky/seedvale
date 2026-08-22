# Dokumentacja Seedvale

Ten katalog zawiera dokumentację projektu **Seedvale** (Three.js — proceduralny teren + AI postaci).

## Główne dokumenty

- **[STATE.md](./STATE.md)** — factual current implementation state
- **[state/](./state/README.md)** — szczegółowy opis aktualnego stanu domen/systemów
- **[state/water.md](./state/water.md)** — woda (ocean + jeziora + rzeki: stan, decyzje, historia)
- **[state/settlements.md](./state/settlements.md)** — osady i życie NPC (stan + standing decisions)
- **[VISION.md](./VISION.md)** — wizja i kontekst produktu (czytaj przed planowaniem nowych funkcji)
- **[vision/](./vision/README.md)** - Docelowe wizje poszczególnych domen. Opisują, co chcemy osiągnąć, niezależnie od aktualnego stanu implementacji.
- **[architecture/](./architecture/README.md)** — Architektura, kontrakty, ownership, lifecycle i decyzje techniczne.
- **[architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md)** — mapa architektury (WorldBundle, lifecycle, save)
- **[architecture/GRAPHICS.md](./architecture/GRAPHICS.md)** — log decyzji / kontraktów graficznych
- **[CODE_INDEX.md](./CODE_INDEX.md)** — indeks kodu: gdzie w `src/` mieszka dany system (entry pointy)
- **[ROADMAP.md](./ROADMAP.md)** — kierunek produktu (canonical roadmap Seedvale; `roadmap/` niżej to coś innego — zamrożony log sesji, nie roadmapa)
- **[performance/](./performance/README.md)** - Performance & Rendering Strategy
- **[../CLAUDE.md](../CLAUDE.md)** — reguły dla agentów

## Supporting documentation

| Katalog | Przeznaczenie |
|---------|---------------|
| [issues/](./issues/README.md) | Błędy, usprawnienia, dług techniczny |
| [reviews/](./reviews/README.md) | Sesje przeglądu |
| [research/](./research/README.md) | Analizy, spike'i, porównania przed decyzją |
| [plans/](./plans/README.md) | Plany implementacji (wszystkie statusy) |
| [plans/archive/](./plans/archive/README.md) | Jednorazowo zamrożony batch planów z 2026-08-07–2026-08-14 |
| [roadmap/](./roadmap/README.md) | Zamrożony log sesji projektowania docelowej architektury (2026-08-12–14), wnioski zsyntetyzowane w [review 006](./reviews/2026-08-14--006--architecture-alignment.md). Nie jest to roadmapa produktu — tą jest [ROADMAP.md](./ROADMAP.md) |
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

### `prompts/`
Meta-prompty do powtarzalnych zadań (struktura docs, review, itd.).

## Relacja dokumentów

```
VISION / vision/
    ↓
ROADMAP / roadmap/  <-- docelowo
    ↓
plans/
    ↓
STATE / state/
```

---

**Ostatnia aktualizacja:** 2026-08-22

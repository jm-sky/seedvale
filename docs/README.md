# Dokumentacja Seedvale

Ten katalog zawiera dokumentację projektu **Seedvale** (Three.js — proceduralny teren + AI postaci).

## Główne dokumenty

- **[VISION.md](./VISION.md)** — wizja i kontekst produktu (czytaj przed planowaniem nowych funkcji)
- **[STATE.md](./STATE.md)** — factual current implementation state
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — mapa architektury (WorldBundle, lifecycle, save)
- **[CODE_INDEX.md](./CODE_INDEX.md)** — indeks kodu: gdzie w `src/` mieszka dany system (entry pointy)
- **[SETTLEMENTS.md](./SETTLEMENTS.md)** — osady i życie NPC (stan + standing decisions)
- **[GRAPHICS.md](./GRAPHICS.md)** — log decyzji / kontraktów graficznych
- **[WATER.md](./WATER.md)** — woda (ocean + jeziora + rzeki: stan, decyzje, historia)
- **[state/](./state/README.md)** — dodatkowe domain-state docs, gdy temat nie mieści się w żadnym z powyższych (terrain/world-gen, combat, player-systems)
- **[ROADMAP.md](./ROADMAP.md)** — kierunek produktu (canonical roadmap Seedvale; `roadmap/` niżej to coś innego — zamrożony log sesji, nie roadmapa)
- **[../CLAUDE.md](../CLAUDE.md)** — reguły dla agentów

## Workflow (issues, reviews, research, plans, assets)

| Katalog | Przeznaczenie |
|---------|---------------|
| [issues/](./issues/README.md) | Błędy, usprawnienia, dług techniczny |
| [reviews/](./reviews/README.md) | Sesje przeglądu |
| [research/](./research/README.md) | Analizy, spike'i, porównania przed decyzją |
| [feature-roadmaps/](./feature-roadmaps/README.md) | Roadmapy większych, wieloetapowych feature'ów |
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

### `feature-roadmaps/`

Roadmapy większych feature'ów rozwijanych etapami. Opisują kierunek rozwoju feature'u i zależności między etapami.

Nie są źródłem prawdy o implementacji i nie zastępują `plans/`.

Każdy konkretny etap implementacyjny powinien mieć odpowiedni plan w `plans/`.

### `archive/`
Przestarzałe dokumenty top-level (nie plany). Osobne od `plans/archive/`.

### `deployment/`
Deploy / hosting (gdy będzie potrzebny).

### `prompts/`
Meta-prompty do powtarzalnych zadań (struktura docs, review, itd.).

---

**Ostatnia aktualizacja:** 2026-08-15

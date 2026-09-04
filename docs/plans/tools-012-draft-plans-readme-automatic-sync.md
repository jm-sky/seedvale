# Plan: Draft plans README automatic sync

**Created:** 2026-09-04
**Status:** `done` ✅
**Type:** infrastructure
**Priority:** medium · **Effort:** S
**Depends on:** ~~tools-011~~
**Domain:** `tools`
**Subdomains:** `automation` `development`

## Goal

Rozszerzyć istniejący pipeline synchronizacji planów tak, aby wszystkie aktualne plany ze statusem `draft` były automatycznie widoczne na górze `docs/plans/README.md` w dedykowanej sekcji `## Drafts`.

Sekcja ma być w pełni generowana z metadata planów i nie wymagać ręcznego dopisywania ani usuwania wpisów.

## Current state

`scripts/docs/plans-sync.ts` już jest głównym mechanizmem synchronizacji planów. Obecnie między innymi:

- skanuje aktualne pliki planów,
- uruchamia metadata repair przed dalszym syncem,
- wykrywa plany `planned`,
- utrzymuje tabelę `## Planned`,
- synchronizuje znaczniki implementation notes,
- usuwa z `Planned` plany, których status się zmienił,
- aktualizuje `Next plan IDs`.

`pnpm plans:sync` uruchamia ten skrypt bezpośrednio, a `pnpm docs:sync` używa go jako pierwszego etapu pełnej synchronizacji dokumentacji.

Nie tworzyć osobnego równoległego generatora dla draftów. Rozszerzyć istniejący `plans-sync.ts` i współdzielić mechanizmy z sekcją `Planned` tam, gdzie jest to praktyczne.

## Desired README structure

Dedykowana sekcja `Draft` powinna znajdować się wysoko w `docs/plans/README.md`, przed aktywnymi planami implementacyjnymi:

```md
## Draft

| File | Pri | Effort | Depends |
| --- | --- | --- | --- |
| `tools-012-example.md` | 🟡 | S | - |

---

## In progress
```

`Metadata reference` może pozostać przed `Draft`; wymaganie „na górze” oznacza, że `Draft` ma należeć do głównych sekcji statusowych i występować przed `In progress` / `Planned`.

Nie dodawać znacznika implementation notes do draftów — implementation notes są potrzebne dopiero dla planów przygotowanych do implementacji.

## Scope

### In scope

- automatyczne wykrywanie planów ze statusem `draft`,
- dedykowana sekcja `## Draft` w `docs/plans/README.md`,
- deterministic rebuild/sync zawartości sekcji z aktualnych plików planów,
- automatyczne dodawanie nowych draftów,
- automatyczne usuwanie wpisów po zmianie statusu z `draft`,
- zachowanie wpisu po zmianach metadata takich jak Priority, Effort lub Depends on,
- reuse istniejącego parsowania metadata i formatowania tabel tam, gdzie to możliwe,
- testy zachowania i idempotencji,
- integracja wyłącznie przez istniejący `plans:sync` / `docs:sync` pipeline.

### Out of scope

- nowy osobny command tylko dla draftów,
- zmiana lifecycle statusów,
- automatyczne promowanie `draft` → `planned`,
- ranking draftów przez recommendation generator,
- implementation notes dla draftów,
- przebudowa całego `plans-sync.ts`,
- ręczne utrzymywanie wygenerowanej sekcji README.

## Design

### 1. Reuse existing plan discovery

Drafty powinny pochodzić z tego samego zbioru planów co `Planned` i korzystać z tych samych canonical metadata po `repairPlanMetadata()`.

Nie wykonywać drugiego skanowania katalogu ani osobnego parsera statusu.

Preferowany kierunek:

```text
scan plans
  ↓
repair metadata
  ↓
collect by status
  ├─ draft
  └─ planned
  ↓
sync README sections
```

### 2. Generic status-section synchronization

Obecna logika jest mocno związana z `## Planned` (`findPlannedTableRange`, `getPlannedFiles`, `removeCompletedPlansFromPlannedSection`).

Jeżeli zakres zmian pozostanie mały, wyodrębnić współdzielone helpery dla sekcji statusowych zamiast kopiować analogiczne funkcje jako `findDraftTableRange`, `getDraftFiles`, itp.

Przykładowa odpowiedzialność helpera:

```ts
syncPlanStatusTable({
  status: 'draft',
  heading: '## Draft',
  files,
  rows,
})
```

Nie robić większego refaktoru niezwiązanego z tym zadaniem.

### 3. Generated section ownership

`## Draft` ma być traktowane jako derived plan information zgodnie z `docs/plans/PLANNING.md`.

Generator jest source of truth dla zawartości tabeli. Ręczne wpisy w wygenerowanej części nie powinny być potrzebne.

Preferować pełne odtworzenie wierszy sekcji na podstawie aktualnych draftów, jeżeli uprości to kod i poprawi idempotencję. Jeżeli istniejący `Planned` pozostaje incremental, draft może używać współdzielonego mechanizmu tylko wtedy, gdy nie tworzy to dwóch różnych modeli synchronizacji bez potrzeby.

### 4. Ordering

Wiersze draftów sortować deterministycznie po filename, zgodnie z obecnym zachowaniem `getPlannedFiles()`.

Nie wprowadzać jeszcze rankingu po Priority ani Created.

### 5. Empty state

Sekcja `## Draft` ma istnieć również wtedy, gdy nie ma draftów.

Preferowany prosty stan:

```md
## Draft

No draft plans.
```

albo pusta tabela, jeżeli lepiej pasuje do współdzielonego generatora. Wybrać jeden canonical format i pokryć go testem.

## Relevant files

- `scripts/docs/plans-sync.ts` — główny punkt implementacji,
- `scripts/docs/config.ts` — istniejące regexy/status vocabulary; reuse, bez duplikowania kontraktu,
- `scripts/docs/plan-metadata.ts` — canonical metadata/repair; nie tworzyć dodatkowego parsera,
- `docs/plans/README.md` — wygenerowana sekcja `Draft`,
- `docs/plans/PLANNING.md` — ewentualne krótkie doprecyzowanie automatic updates,
- testy `scripts/docs/*plans-sync*.test.ts` lub nowy mały test skupiony na syncie sekcji statusowych, zależnie od obecnej struktury testów.

## Implementation steps

1. Przejrzeć końcowy przepływ `main()` w `scripts/docs/plans-sync.ts` i aktualne testy tego skryptu.
2. Wyodrębnić minimalne współdzielone helpery potrzebne do obsługi `draft` i `planned` bez kopiowania logiki.
3. Dodać zbieranie planów ze statusem `draft` po metadata repair.
4. Dodać canonical sekcję `## Draft` w README przed `## In progress`.
5. Synchronizować pełną listę draftów przy każdym `pnpm plans:sync`.
6. Zapewnić usunięcie wpisu po zmianie statusu `draft` → `planned`, `in progress`, `verification needed` lub `done`.
7. Pokryć testami: dodanie draftu, wiele draftów, zmiana metadata, zmiana statusu, brak draftów, idempotencję.
8. Uruchomić `pnpm plans:sync`, następnie `pnpm docs:sync` i upewnić się, że drugi przebieg nie generuje zmian.
9. Dodać JSDoc do nowego współdzielonego helpera synchronizacji sekcji, jeśli stanie się istotnym elementem architektury docs tooling (`@domain tools`).

## Acceptance criteria

- każdy aktualny plan z `**Status:** `draft`` pojawia się w `docs/plans/README.md` w sekcji `## Draft`,
- `## Draft` znajduje się przed `## In progress` i `## Planned`,
- nowy draft pojawia się po jednym `pnpm plans:sync`,
- zmiana statusu draftu automatycznie usuwa go z sekcji przy następnym syncu,
- Priority, Effort i Depends on są odświeżane z metadata planu,
- draft nie otrzymuje markera implementation notes,
- nie powstaje nowy niezależny generator ani drugi parser metadata,
- `pnpm docs:sync` obejmuje funkcję bez zmiany workflow,
- sync jest deterministyczny i idempotentny,
- drugi przebieg bez zmian w planach nie modyfikuje README,
- istniejąca synchronizacja `Planned`, `Next plan IDs` i metadata repair nadal działa.

## Verification

Automated:

```bash
pnpm test -- scripts/docs
pnpm plans:sync
pnpm docs:sync
git diff --exit-code
```

Sprawdzić w testach fixture/scenariusz z co najmniej dwoma draftami oraz przejście jednego z nich do `planned`.

Manual repository inspection:

- `Draft` jest wysoko w README,
- tabela jest czytelna,
- nie ma duplikatów między `Draft` i `Planned`,
- istniejące sekcje README nie zostały przypadkowo przebudowane.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

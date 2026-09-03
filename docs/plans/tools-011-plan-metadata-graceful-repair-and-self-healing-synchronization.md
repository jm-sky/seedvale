# Plan: Plan metadata graceful repair and self-healing synchronization

**Created:** 2026-09-03
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~010~~
**Domain:** `tools`

## Goal

Uodpornić system planów Seedvale na niekompletne, nieznormalizowane lub częściowo błędne metadata generowane podczas tworzenia planów przez ChatGPT.

Dodanie planu do repozytorium nie powinno powodować zatrzymania GitHub pipeline'u tylko dlatego, że metadata wymaga uzupełnienia lub normalizacji.

System ma automatycznie:
- uzupełniać brakujące metadata,
- poprawiać wartości możliwe do jednoznacznego wywnioskowania,
- normalizować reprezentację,
- rozwiązywać lokalne ID zależności,
- zapisywać canonical metadata do pliku,
- raportować wykonane naprawy,
- kontynuować normalny proces synchronizacji.

> Metadata problems are repairable data-quality issues, not pipeline errors.

Pipeline może zakończyć się błędem wyłącznie z powodu rzeczywistego problemu technicznego narzędzia, np. niemożności odczytu lub zapisu pliku, błędu generatora albo innego błędu wykonania.

## Scope

### In scope
- deterministic metadata repair,
- inferowanie Domain z nazwy pliku,
- inferowanie Type z dostępnych danych,
- bezpieczne wartości domyślne,
- normalizacja formatowania metadata,
- obsługa lokalnych ID w Depends on,
- zapis naprawionych planów,
- ponowna analiza po naprawie,
- raportowanie auto-fixów i warningów,
- wspólny repair engine dla synchronizacji i migratora,
- testy jednostkowe i integracyjne,
- zachowanie idempotencji.

### Out of scope
- tworzenie nowych domen lub typów,
- zmiana kontraktu metadata,
- automatyczne zgadywanie treści planu,
- automatyczne tworzenie brakujących roadmap,
- przebudowa całego scripts/docs,
- osobny mechanizm naprawy w GitHub Actions.

## Design principles

### 1. Repair before sync

~~~text
parse
  ↓
repair / normalize
  ↓
write canonical plan
  ↓
sync / generate docs
~~~

Repair ma być wykonywany przed konsumentami metadata.

### 2. Best-effort, never-block

Problemy jakości metadata nie mogą zatrzymywać pipeline'u.

~~~text
metadata problem
    ↓
can repair?
    ├─ yes → repair → continue
    └─ no  → safe default / preserve + warning → continue
~~~

Nie używać globalnego try/catch, który ukrywa rzeczywiste błędy techniczne.

### 3. Deterministic first

Repair ma być deterministyczny i powtarzalny.

Preferowana hierarchia źródeł:

~~~text
explicit metadata
    ↓
filename
    ↓
title
    ↓
relevant content
    ↓
safe default
~~~

Nie wprowadzać probabilistycznego klasyfikatora.

### 4. Single source of truth

Logika repair powinna znajdować się w istniejącym scripts/docs/plan-metadata.ts.

Nie utrzymywać osobnych heurystyk w plans-sync.ts i migrate-plan-metadata.ts.

## Repair result

Dodać wynik pozwalający raportować zmiany:

~~~ts
type RepairSource =
  | 'explicit'
  | 'filename'
  | 'title'
  | 'content'
  | 'default'
  | 'normalization'

type PlanRepair = {
  file: string
  changed: boolean
  changes: PlanRepairChange[]
  warnings: string[]
}

type PlanRepairChange = {
  field: string
  from?: string
  to: string
  source: RepairSource
}
~~~

Przykład:

~~~text
[plan-repair] npc-018-work-contracts.md
  Domain: missing → npc [filename]
  Type: missing → feature [default]
  Depends on: 001 → npc-001 [local-domain]
~~~

## Domain repair

Standardowy filename:

~~~text
<domain>-<id>-<title>.md
~~~

### Missing Domain

npc-018-work-contracts.md bez Domain otrzymuje Domain: npc.

### Invalid or conflicting Domain

Jeżeli filename jednoznacznie wskazuje domenę, filename wygrywa.

Przykład:

~~~text
npc-018-foo.md
Domain: settlements
~~~

→ Domain: npc.

Nie traktować konfliktu jako błędu pipeline'u.

### Legacy / unknown filename

Jeżeli filename nie pozwala ustalić domeny, nie wykonywać agresywnego zgadywania. Zachować istniejącą wartość, a przy jej braku użyć bezpiecznego zachowania zgodnego z aktualnym kontraktem i wygenerować warning.

## Type repair

Kolejność:
1. poprawne explicit metadata,
2. mocny sygnał z filename/title,
3. mocny sygnał z treści,
4. feature jako bezpieczny default.

Przykłady:
- npc-018-fix-stuck-navigation.md → fix
- world-012-terrain-performance.md → optimization
- tools-011-plan-metadata-resilience.md → infrastructure

Heurystyki mają być proste i deterministyczne. Nie budować semantycznego klasyfikatora AI.

## Status repair

Brak statusu dla nowego planu → planned.

Istniejące poprawne statusy zachować.

Znane, jednoznaczne warianty można normalizować. Nieznany wariant nie może zatrzymać pipeline'u; użyć bezpiecznego canonical fallbacku i warningu, jeżeli dalszy generator wymaga prawidłowej wartości.

Status icon należy normalizować przez istniejący mechanizm normalizeStatusIcon().

## Priority repair

Brak → medium.

Oczywiste różnice wielkości liter normalizować.

Nieznana wartość → medium + warning.

Nie zatrzymywać pipeline'u.

## Effort repair

Brak → S.

Normalizować oczywiste warianty:
- xs → XS
- s → S
- m → M
- l → L
- xl → XL

Nieznana wartość → S + warning.

## Depends on — local plan IDs

Plan IDs są lokalne względem domeny.

Dla planu npc-018-example.md:

~~~text
Depends on: 001
~~~

canonical result:

~~~text
Depends on: npc-001
~~~

Ponieważ 001 oznacza <current-plan-domain>-001.

### Multiple local IDs

~~~text
Depends on: 001 002 003
~~~

dla domeny npc:

~~~text
Depends on: npc-001 npc-002 npc-003
~~~

### Explicit IDs

~~~text
Depends on: npc-001 fauna-003
~~~

zachować bez zmian.

### Mixed format

~~~text
Depends on: 001 npc-002 fauna-003
~~~

dla npc:

~~~text
Depends on: npc-001 npc-002 fauna-003
~~~

### No dependencies

Brak pola może zostać uzupełniony:

~~~text
Depends on: -
~~~

z warningiem informującym o użyciu defaultu.

Nie zgadywać zależności z treści planu.

## Created

Nie fabrykować daty na podstawie bieżącej daty pipeline'u.

Preferować poprawną istniejącą wartość lub stabilne źródło repozytoryjne, jeżeli obecny kod je posiada. W przeciwnym przypadku zachować brak/warning bez zatrzymywania pipeline'u.

## Roadmap

Istniejącą wartość zachować.

Nieistniejący wskazany plik → warning.

Nie zgadywać roadmapy automatycznie.

## Implemented at

Nie generować automatycznie.

Brak pola jest poprawnym stanem. Nie zastępować go bieżącą datą.

## Canonical write

Repair powinien:
1. sparsować plan,
2. wykonać repair w pamięci,
3. przygotować kompletny canonical content,
4. sprawdzić wynik,
5. zapisać cały plik jako jedną zmianę,
6. ponownie sparsować zapisany plik.

Nie wykonywać niezależnych zapisów poszczególnych pól.

## Integration with plans-sync

Zmienić przepływ plans-sync.ts na:

~~~text
read plan
    ↓
parse metadata
    ↓
repairPlanMetadata()
    ↓
write if changed
    ↓
parse again
    ↓
normal documentation sync
~~~

Repair musi nastąpić przed generatorami korzystającymi z metadata.

## Migration tool

migrate-plan-metadata.ts ma używać tego samego repair engine.

Zachować tryby:

~~~bash
pnpm plans:migrate-metadata
~~~

→ dry-run

~~~bash
pnpm plans:migrate-metadata --write
~~~

→ repair + write

Nie duplikować logiki.

## CI

GitHub Actions ma uruchamiać ten sam mechanizm co lokalny workflow.

~~~text
local: pnpm docs:sync
CI:    pnpm docs:sync
~~~

Nie implementować osobnego repair layer w workflow.

## Tests

Dodać testy jednostkowe dla:
- missing/invalid/conflicting Domain,
- Type inference i feature fallback,
- missing/invalid Status,
- Priority i Effort normalization/defaults,
- status icon, Subdomains i Tags,
- Depends on: 001, listy lokalnych ID, jawne i mieszane dependency IDs,
- brak Depends on → -,
- ochrony Created, Roadmap i Implemented at,
- idempotencji.

### Integration tests

Przygotować testowe plany:
1. Niekompletny plan ChatGPT — repair i sync kończą się sukcesem.
2. Local dependency — 001 zostaje rozwinięte do current-domain-001.
3. Conflicting Domain — filename wygrywa.
4. Wiele naprawialnych błędów — wszystko naprawione w jednym przebiegu.
5. Rzeczywisty błąd techniczny — pipeline nadal kończy się non-zero.

## Idempotency

Po pierwszym repair:

~~~text
broken plan
→ repaired plan
~~~

Po drugim:

~~~text
repaired plan
→ no changes
~~~

Formalnie:

~~~ts
repair(repair(input)) === repair(input)
~~~

## Real repository verification

Uruchomić repair na całym obecnym zbiorze planów.

Sprawdzić:
- liczbę zmienionych planów,
- liczbę zmian per field,
- warningi,
- nieoczekiwane zmiany istniejących canonical metadata.

Drugie uruchomienie musi być clean.

## Documentation

Zaktualizować:
- docs/plans/PLAN-METADATA.md,
- docs/plans/PLANNING.md,
- dokumentację migrate-plan-metadata.ts,
- JSDoc ważnych funkcji architektonicznych, zgodnie z zasadami preflight.

Udokumentować szczególnie:
- best-effort repair,
- źródła inferencji,
- defaulty,
- lokalne dependency IDs,
- canonical representation,
- różnicę między warningiem a rzeczywistym błędem runtime.

## Implementation order

1. Przejrzeć aktualne plan-metadata.ts, plans-sync.ts, migrate-plan-metadata.ts i wszystkich consumerów metadata.
2. Wyodrębnić wspólną normalizację i istniejące heurystyki.
3. Dodać repairPlanMetadata() i model raportowania.
4. Dodać Domain inference z filename.
5. Dodać deterministic Type inference i feature fallback.
6. Dodać bezpieczne defaulty Status/Priority/Effort/Depends on.
7. Dodać normalizację lokalnych dependency IDs.
8. Zintegrować repair z plans-sync.ts.
9. Przebudować migrator na wspólnym engine.
10. Dodać testy jednostkowe, integracyjne i idempotency.
11. Uruchomić repair na realnych planach.
12. Zaktualizować dokumentację.
13. Zweryfikować CI.

## Acceptance criteria

- brak Domain nie zatrzymuje pipeline'u,
- Domain jest inferowany z jednoznacznego filename,
- konflikt Domain rozstrzygany jest na korzyść filename,
- brak Type otrzymuje deterministic inference albo feature,
- brak Status otrzymuje planned,
- brak Priority otrzymuje medium,
- brak Effort otrzymuje S,
- brak Depends on otrzymuje -,
- Depends on: 001 jest rozwijane względem domeny bieżącego planu,
- mieszane dependency formats są poprawnie normalizowane,
- formatting metadata jest normalizowany,
- Created/Roadmap/Implemented at nie są bezpodstawnie fabrykowane,
- wszystkie repair operations są raportowane,
- repair jest idempotentny,
- sync i migrator korzystają z jednego repair engine,
- pnpm docs:sync działa bez ręcznego migratora,
- CI i lokalny workflow używają tego samego mechanizmu,
- problemy metadata nie powodują CI failure,
- rzeczywiste błędy techniczne nadal powodują failure,
- istniejące poprawne plany nie są niepotrzebnie zmieniane,
- drugi przebieg repair nie generuje zmian.

## Expected outcome

ChatGPT może wygenerować plan z niepełnymi metadata, a pipeline automatycznie doprowadzi go do canonical form, rozwiąże lokalne zależności względem domeny planu, wygeneruje dokumentację i zakończy się sukcesem.

System ma być self-healing, deterministic, idempotent i nieblokujący.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

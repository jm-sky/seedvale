# Plan: Recommended Order Rankings and Actionable Plan Dashboard

**Created:** 2026-09-03  
**Status:** `planned` 📋  
**Type:** infrastructure  
**Priority:** medium · **Effort:** M  
**Depends on:** none  
**Domain:** `tools`  
**Subdomains:** `automation` `diagnostics`  
**Tags:** `plans` `ranking` `metadata` `documentation`

## Cel

Przebudować `scripts/docs/plans-recommended-order.ts`, aby generowany `docs/plans/RECOMMENDED-ORDER.md` był użytecznym narzędziem do podejmowania decyzji.

Dokument powinien odpowiadać na dwa różne pytania:

- **Top 5:** na jakie plany warto spojrzeć teraz z różnych perspektyw?
- **Recommended Execution Order:** w jakiej kolejności wykonywać planned plans przy uwzględnieniu zależności?

Nie należy zastępować istniejącego dependency-aware execution order jednym zestawem nowych heurystyk.

## Problem obecnej implementacji

Obecny skrypt stosuje jeden globalny score:

`priority + direct unlocks + transitive unlocks + depth - effort`

Powoduje to, że roadmap, bug fixes, polish i szybkie zadania nie są widoczne jako osobne perspektywy.

Dodatkowo dependency graph generuje obecnie etykiety zawierające tylko ID, przez co graf jest mało czytelny.

## Zakres

### 1. Wspólny model metryk

Rozszerzyć parser planów o metadata potrzebne do rankingów, przede wszystkim:

- `Type`,
- `Roadmap`.

Wykorzystać istniejące pola:

- `Priority`,
- `Effort`,
- `Status`,
- dependencies,
- direct dependents,
- transitive dependents,
- readiness.

Nie tworzyć nowych pól metadata wyłącznie dla tego generatora.

Zbudować wspólny zestaw wyliczanych metryk rankingowych, zamiast implementować pięć niezależnych mechanizmów scoringowych.

### 2. Perspektywy Top 5

Na początku `RECOMMENDED-ORDER.md` dodać:

```text
# Plan Recommendations

## Top 5

### Overall
### Roadmap Focus
### Bug Fixes
### Polish
### Ready Now
```

Każda pozycja musi zawierać:

`ID — Title`

oraz krótkie, użyteczne metryki/uzasadnienie, np. priority, readiness i unlocks.

Rankingi mają być perspektywami tego samego modelu metryk, a nie pięcioma całkowicie niezależnymi scoringami.

### 3. Overall

Pokazać najlepszych ogólnych kandydatów na podstawie istniejącego modelu wartości:

- priority,
- effort,
- dependency impact,
- readiness/depth.

Powinien być możliwie bliski obecnemu scoringowi, aby przebudowa nie zmieniła bez powodu jego znaczenia.

### 4. Roadmap Focus

Wykorzystać istniejące metadata `Roadmap`.

Preferować plany przypisane do roadmap, jednocześnie nadal uwzględniając:

- priority,
- effort,
- readiness,
- dependency impact.

Brak roadmapy nie powinien być błędem ani wymagać dodatkowego metadata.

Nazwa sekcji powinna komunikować, że jest to perspektywa roadmapy, a nie bezwzględna kolejność realizacji.

### 5. Bug Fixes

Uwzględniać plany z:

- `Type: bug`,
- `Type: fix`.

Ranking powinien preferować sensowne do wykonania poprawki, uwzględniając priority, effort, readiness i wpływ na dalsze plany.

Typ powinien pozostać widoczny w metrykach/uzasadnieniu, jeśli pomaga odróżnić `bug` od `fix`.

### 6. Polish

Uwzględniać:

`Type: polish`

Preferować polish o dobrym stosunku wartości do effortu i plany gotowe do rozpoczęcia.

### 7. Ready Now

Zastąpić pojęcie `Quick Wins` bardziej jednoznaczną perspektywą `Ready Now`.

Podstawowym warunkiem jest:

- `Status: planned`,
- wszystkie dependencies spełnione.

Dopiero w ramach tej grupy ranking może preferować:

- niższy effort,
- wyższy priority,
- większy wpływ/dependency unlocks.

Nie wprowadzać nowego typu metadata `quick-win`.

### 8. Wspólny mechanizm rankingów

Wprowadzić wspólną reprezentację metryk planu oraz konfigurację perspektyw rankingowych.

Każda perspektywa powinna określać:

- kwalifikację planu,
- względne znaczenie wspólnych metryk,
- limit Top 5,
- stabilny tie-breaker.

Dzięki temu dodanie kolejnej perspektywy w przyszłości nie wymaga przebudowy parsera ani duplikowania logiki.

Wszystkie rankingi muszą być deterministyczne.

### 9. Recommended Execution Order

Zachować obecny dependency-aware algorytm wykonywania planned plans:

- tylko `planned` są umieszczane w kolejności wykonania,
- `done` i `verification needed` spełniają dependencies,
- kolejność musi respektować dependency readiness,
- obecny unlock/depth/effort model pozostaje podstawą.

Oddzielić go koncepcyjnie od dashboardu Top 5.

### 10. Dependency graph

Zmienić etykiety Mermaid z samych ID na:

```text
settlements_npcs_014["settlements-npcs-014 — Local Goods Circulation"]
```

Dotyczy to zarówno planów, jak i dependency nodes.

Zadbać o bezpieczne escapowanie tytułów dla Mermaid.

## Format wygenerowanego dokumentu

Preferowana struktura:

```text
# Plan Recommendations

## Top 5

### Overall
...

### Roadmap Focus
...

### Bug Fixes
...

### Polish
...

### Ready Now
...

## How to read this

...

## Recommended Execution Order

...

## Initially Blocked

...

## Dependency Graph

...
```

Sekcja `How to read this` powinna krótko wyjaśniać, że Top 5 są niezależnymi perspektywami, a nie alternatywnymi execution orders.

## Statusy

Top 5 nie powinno sugerować, że completed plans są rekomendacjami do wykonania.

Preferowane jest operowanie na `planned` oraz jasne oznaczanie `in progress`, jeśli taki plan jest pokazywany w przyszłości.

Główny execution order pozostaje ograniczony do `planned`.

## Non-goals

Nie wchodzi w zakres:

- zmiana kontraktu metadata planów,
- ręczna edycja `RECOMMENDED-ORDER.md`,
- zmiana systemu dependencies,
- zmiana roadmap,
- LLM-based ocenianie planów,
- tworzenie nowych typów planów,
- zmiana `generate-plan-docs.ts`,
- szeroki refactor systemu dokumentacji.

## Pliki

Główny:

`scripts/docs/plans-recommended-order.ts`

Do weryfikacji:

- `scripts/docs/config.ts`
- `docs/plans/PLANNING.md`
- `docs/plans/PLAN-METADATA.md`
- `docs/plans/README.md`
- aktualne `docs/plans/*.md`

Generated output:

`docs/plans/RECOMMENDED-ORDER.md`

## Kolejność implementacji

1. Zweryfikować aktualny kontrakt `Type` i `Roadmap` w metadata.
2. Rozszerzyć parser `Plan` tylko o potrzebne pola.
3. Wydzielić wspólne wyliczanie metryk.
4. Zachować i uporządkować istniejący execution score.
5. Zdefiniować konfigurację perspektyw Top 5.
6. Zaimplementować kwalifikację i ranking dla Overall, Roadmap Focus, Bug Fixes, Polish i Ready Now.
7. Dodać generator Top 5 z krótkim uzasadnieniem.
8. Poprawić etykiety Mermaid o `ID — Title`.
9. Wygenerować `RECOMMENDED-ORDER.md` i ocenić wynik na aktualnym zbiorze planów.
10. Zweryfikować deterministyczność oraz istniejące polecenia `plans:recommended-order` / `docs:sync`.
11. Uruchomić odpowiednie type-check/test/build zgodnie z istniejącą konfiguracją repo.

## Kryteria akceptacji

- Dokument zaczyna się od czytelnego dashboardu Top 5.
- Istnieją perspektywy: Overall, Roadmap Focus, Bug Fixes, Polish i Ready Now.
- Każda pozycja zawiera ID oraz pełny tytuł.
- Top 5 korzysta ze wspólnego modelu metryk, bez pięciu niezależnych algorytmów.
- Ready Now oznacza faktycznie odblokowane planned plans.
- Główny execution order nadal respektuje dependencies.
- Mermaid pokazuje tytuły, nie tylko ID.
- Brak nowego źródła prawdy dla roadmap lub metadata.
- Wynik jest deterministyczny.
- Generator można uruchomić istniejącym poleceniem.
- Generated output pozostaje możliwy do odtworzenia automatycznie.

## Uwagi architektoniczne

Najważniejszy podział:

```text
Top 5
└── perspektywy pomagające wybrać, na co zwrócić uwagę

Recommended Execution Order
└── dependency-aware kolejność realizacji
```

Nie należy próbować sprowadzać obu problemów do jednego magicznego score.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

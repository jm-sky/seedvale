# Plan: Deferred Architecture & State Cleanup

**Created:** 2026-08-22
**Status:** `planned` 📋
**Priority:** low · **Effort:** M
**Depends on:** ~~192~~ ~~193~~ ~~194~~ ~~195~~ ~~196~~ ~~197~~ ~~198~~ ~~199~~ ~~200~~

## Cel

Domknąć pozostałe, świadomie odłożone findings z audytów 192–195 po wykonaniu planów 196–200.

201 jest planem **reconciliation i cleanup**, a nie kolejnym ogólnym audytem architektury. Nie należy rozszerzać jego zakresu o nowe problemy tylko dlatego, że zostaną zauważone podczas implementacji.

Docelowo każdy pozostały finding ma mieć jednoznaczny status:

```text
resolved by 196–200
        │
        ├── obsolete / no longer applicable
        ├── small fix → 201
        ├── separate future plan
        └── intentionally deferred with explicit reason
```

---

## 1. Reconcile findings 192–195

Na podstawie aktualnego `main` oraz implementation notes 192–195 przygotować kompletną listę pozostałych findings.

Dla każdego sprawdzić aktualny kod, a nie tylko treść historycznego audytu.

Minimalna macierz:

| Finding | Current status | Covered by | Action | Reason |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

Nie traktować starego findingu jako aktywnego bez potwierdzenia w aktualnym kodzie.

---

## 2. Zamknąć findings rozwiązane przez 196–200

Potwierdzić, że problemy pokryte przez:

- **196 — Time-Skip Simulation Semantics**,
- **197 — NPC Runtime State & Lifecycle Continuity**,
- **198 — World Resource State Continuity**,
- **199 — Entity Identity & Transfer Continuity**,
- **200 — Persistence Gaps & Authoritative State Completion**,

nie pozostają jako aktywne loose ends.

Nie wykonywać ponownej implementacji ani równoległych poprawek.

---

## 3. Małe pozostałe fixes

Zidentyfikować tylko takie pozostałe findings, które:

- są nadal realne,
- mają jasno określone ownership,
- mają lokalny zakres,
- nie wymagają nowej architektury,
- nie kolidują z 196–200.

Takie poprawki można wykonać w ramach 201.

Jeżeli problem wymaga większej zmiany ownership, lifecycle, persistence albo simulation architecture — **nie implementować go w 201**.

---

## 4. Odłożone tematy wymagające osobnego planu

Dla większych nadal aktualnych findings przygotować minimalny opis w `docs/plans/LOOSE-ENDS.md`:

```text
problem
why it matters
current owner / affected systems
recommended next step
```

Nie tworzyć planów automatycznie dla każdego P2/P3. Osobny plan jest uzasadniony tylko wtedy, gdy temat ma samodzielny zakres i realną wartość.

---

## 5. Deferred state / ownership

Dla pozostałych state-related findings potwierdzić:

```text
authoritative state
      ↓
ownership
      ↓
mutation boundary
      ↓
lifecycle boundary
      ↓
reconstruction / persistence behaviour
```

Jeżeli ownership pozostaje niejasny, należy to udokumentować jako osobny problem zamiast dodawać kolejny ad-hoc owner lub registry.

---

## 6. `LOOSE-ENDS.md`

Doprowadzić `docs/plans/LOOSE-ENDS.md` do zgodności z aktualnym stanem projektu.

Usunąć/przenieść wpisy, które są:

- rozwiązane,
- obsolete,
- pokryte przez 196–200.

Pozostawić wyłącznie rzeczywiście otwarte tematy.

Każdy pozostawiony temat powinien mieć:

- krótki opis problemu,
- powód odłożenia,
- proponowany next step,
- ewentualny plan, jeżeli już istnieje.

Nie używać `LOOSE-ENDS.md` jako listy przypadkowych pomysłów.

---

## 7. Dokumentacja architektury

Po reconciliation zweryfikować:

- `docs/STATE.md`,
- `docs/architecture/ARCHITECTURE.md`.

Aktualizować wyłącznie miejsca, które są niezgodne z rzeczywistym kodem lub nowym ownership/lifecycle contract wynikającym z 196–200.

Nie przepisywać dokumentacji dla samego cleanupu.

---

## 8. Focused final consistency check

Wykonać krótki check najważniejszych granic całego pakietu:

```text
World Time
   ↓
simulation
   ↓
authoritative state
   ↓
entity lifecycle
   ↓
streaming / rebuild
   ↓
reconstruction
   ↓
persistence
```

Celem jest sprawdzenie, czy implementacje 196–200 nie pozostawiły oczywistej niespójności na granicy dwóch systemów.

To **nie jest ponowny pełny audit 192–195**.

Jeżeli podczas tego checku zostanie znaleziony nowy, większy problem:

1. udokumentować go,
2. nie rozszerzać 201,
3. utworzyć osobny przyszły plan, jeśli jest uzasadniony.

---

## Poza zakresem

- nowe gameplay systems,
- pełny ponowny audit 192–195,
- duży refaktor `src/simulation`,
- nowy persistence framework,
- globalny `EntityManager`,
- multiplayer architecture,
- speculative cleanup bez konkretnego findingu,
- problemy już przypisane do osobnych planów,
- rozszerzanie 201 o nowe problemy odkryte przypadkowo podczas implementacji.

---

## Weryfikacja

### Testy

Uruchomić istniejące testy dotyczące obszarów zmienionych przez 201 oraz testy regresyjne dodane w 196–200.

Dla każdej nowej poprawki wykonanej w 201 dodać minimalny test regresyjny.

### Dokumentacja

Zweryfikować:

- `LOOSE-ENDS.md`,
- `STATE.md`,
- `ARCHITECTURE.md`.

### Final reconciliation report

Na końcu implementation notes przygotować tabelę:

| Finding | Final status | Resolution |
|---|---|---|
| ... | resolved | 196–200 / 201 |
| ... | obsolete | removed |
| ... | deferred | future plan |
| ... | intentionally deferred | reason |

---

## Kryteria akceptacji

- [ ] Wszystkie findings 192–195 zostały ponownie sklasyfikowane na podstawie aktualnego `main`.
- [ ] Żaden aktywny finding nie został zgubiony.
- [ ] Findings rozwiązane przez 196–200 nie są ponownie implementowane.
- [ ] Małe, bezpieczne pozostałe fixes zostały wykonane.
- [ ] Większe pozostałe problemy mają jasno opisany next step lub osobny plan.
- [ ] `LOOSE-ENDS.md` zawiera wyłącznie aktualne loose ends.
- [ ] `STATE.md` i `ARCHITECTURE.md` są zgodne z aktualnym kodem.
- [ ] Final consistency check nie ujawnił niesklasyfikowanego istotnego problemu.
- [ ] Nowe duże problemy nie zostały przypadkowo wciągnięte do zakresu 201.
- [ ] Testy przechodzą.
- [ ] Final reconciliation report został przygotowany.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

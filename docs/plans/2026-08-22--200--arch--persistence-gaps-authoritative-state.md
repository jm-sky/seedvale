# Plan: Persistence Gaps & Authoritative State Completion

**Created:** 2026-08-22  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~195~~ ~~196~~ ~~197~~

## Cel

Domknąć **konkretne persistence/state continuity findings**, które pozostają po audytach 192–195 i są nadal aktualne po 196–199.

Plan nie jest ogólnym cleanupem persistence ani ponownym audytem całego runtime state. Obejmuje wyłącznie findings, dla których utrata, reset lub błędne odtworzenie state może zmienić zachowanie świata.

Najważniejszymi znanymi kandydatami są:

- `starvationDuration`,
- `dehydrationDuration`,
- powiązane need timers/accumulators tylko wtedy, gdy audit potwierdzi ten sam problem continuity.

**198 i 199 nie są dependencies 200.** Ich findings należy uwzględnić w reconciliation, ale nie ponownie implementować w 200.

---

## 1. Findings matrix — przed implementacją

Pierwszym artefaktem implementacji ma być krótka macierz oparta na rzeczywistym `main`:

| Finding 192–195 | Aktualny stan | Pokrycie przez 196–199 | Zakres 200 | Decyzja |
|---|---|---|---|---|
| starvation/dehydration continuity | verify | 197 / 196 | state continuity | fix / no-op |
| inne persistence/state finding | verify | 196–199 / none | tylko jeśli nadal aktualne | fix / defer / obsolete |

Macierz ma objąć **wszystkie findings z 192–195 oznaczone jako persistence, state continuity, reconstruction albo deferred**, ale implementować należy wyłącznie te, które spełniają warunek z celu.

Każdy finding musi zakończyć się jedną decyzją:

```text
already fixed
covered by 196–199
requires 200
intentionally deferred → 201 / future plan
obsolete / no longer applicable
```

Nie używać macierzy jako pretekstu do ponownego pełnego audytu 192–195.

---

## 2. Starvation / dehydration continuity

Przeanalizować rzeczywisty owner i lifecycle:

- `starvationDuration`,
- `dehydrationDuration`,
- powiązane need timers/accumulators, jeśli audit potwierdzi analogiczny problem.

Dla każdego ustalić:

```text
authoritative owner
      ↓
mutation boundary
      ↓
lifecycle boundary
      ↓
reconstruction source
      ↓
save boundary, jeśli wymagana
```

Najpierw ustalić, czy dana wartość jest:

- authoritative simulation state,
- derived state,
- transient runtime state.

Jeżeli jest authoritative i musi zachować ciągłość, naprawić **source of truth**, a nie dodawać kopię w `NpcAgent`.

Nie utrwalać automatycznie wszystkich timerów NPC.

---

## 3. NPC reconstruction boundary

Wykorzystać ownership ustanowiony przez **197**.

Zweryfikować konkretną ścieżkę:

```text
authoritative NPC state
      ↓
NpcAgent hydration
      ↓
state mutation
      ↓
agent dispose / settlement unload
      ↓
reconstruction
      ↓
state hydration
```

Naprawiany state nie może zostać:

- wyzerowany,
- ponownie zainicjalizowany wartością domyślną,
- zapisany w drugim source of truth,
- naliczony drugi raz podczas hydration.

Nie tworzyć kolejnego NPC state registry ani persistence layer.

---

## 4. Time-skip interaction

Zweryfikować wyłącznie persistence-sensitive state objęty 200 względem semantyki **196**:

```text
normal simulation
      ↓
time-skip
      ↓
catch-up
      ↓
normal simulation
```

Dla każdego naprawianego timer/accumulatora ustalić jedną ścieżkę naliczania elapsed World Time.

Nie dopuszczać do:

- normal tick + catch-up double processing,
- utraty elapsed time przez reconstruction,
- naliczenia tego samego czasu dwa razy,
- użycia niezależnego zegara dla needs.

Nie zmieniać architektury time-skip w 200.

---

## 5. Save/load boundary

Dla każdego **faktycznie naprawianego** state ustalić, czy continuity musi obejmować również pełny save/load.

Klasyfikacja:

```text
runtime continuity only
        vs
save persistence required
```

Jeżeli save persistence jest wymagana, dodać minimalną reprezentację do istniejącego save modelu.

Jeżeli state jest derived/transient albo jest odtwarzalny z authoritative state, nie dodawać go do save.

Nie projektować nowej architektury save/load.

---

## 6. Authoritative vs derived state

Każdy persistence change musi mieć uzasadnienie w poprawności symulacji.

Preferować:

```text
authoritative minimal state
        ↓
derive runtime values
```

zamiast:

```text
persistent copy of runtime object
```

Jeżeli wartość może być deterministycznie odtworzona z istniejącego authoritative state + World Time, nie przechowywać jej jako osobnego durable field bez potrzeby.

---

## 7. Boundaries objęte weryfikacją

Dla każdego findingu przyjętego do 200 sprawdzić tylko granice, które rzeczywiście go dotyczą:

- `NpcAgent` dispose/recreate,
- settlement unload/load,
- `WorldBundle` rebuild,
- time-skip/catch-up,
- save/load, jeśli wymagane.

Nie zakładać, że każdy state musi przeżyć każdą z tych granic.

---

## 8. Dokumentacja

Po implementacji zaktualizować tylko dokumenty, których kontrakt faktycznie się zmienił:

- `docs/STATE.md`,
- `docs/ARCHITECTURE.md`, jeśli zmienił się ownership/lifecycle contract,
- `docs/plans/LOOSE-ENDS.md`.

W `LOOSE-ENDS.md` usunąć findings rozwiązane przez 196–200 i pozostawić tylko rzeczywiście otwarte tematy.

Tematy odłożone poza 200 powinny trafić do 201 albo mieć jawnie określony przyszły plan.

---

## Poza zakresem

- time-skip architecture — **196**,
- NPC identity/lifecycle ownership — **197**,
- resource deposit continuity — **198**,
- entity identity/transfer — **199**,
- pełny save/load redesign,
- nowy persistence framework,
- multiplayer persistence,
- generalny audit wszystkich runtime fields,
- nowy off-screen simulation system,
- przebudowa NPC needs/AI poza konkretnymi continuity fixes z macierzy 200.

---

## Weryfikacja

### Testy

Dodać lub rozszerzyć testy **wyłącznie dla findings przyjętych do 200**.

Minimum, jeżeli nadal potwierdzone:

- starvation continuity,
- dehydration continuity,
- NPC reconstruction,
- settlement unload/load,
- `WorldBundle` rebuild,
- time-skip + naprawiany state,
- save/load tylko dla state sklasyfikowanego jako save-persistent.

Kluczowy scenariusz:

```text
NPC
 ↓
partial starvation/dehydration state
 ↓
unload/rebuild
 ↓
same authoritative state
```

oraz:

```text
NPC
 ↓
needs state
 ↓
time-skip
 ↓
catch-up
 ↓
state reflects elapsed World Time exactly once
```

---

### Browser verification

Dla faktycznie naprawianych state:

1. doprowadzić NPC do obserwowalnego stanu needs,
2. wykonać tylko właściwą dla findingu granicę lifecycle,
3. wykonać time-skip, jeżeli finding jej dotyczy,
4. wrócić do normalnej symulacji,
5. potwierdzić continuity i brak double-processing,
6. jeżeli wymagane — wykonać save/load i potwierdzić persistence.

---

## Kryteria akceptacji

- [ ] Wszystkie nadal aktualne persistence/state findings z 192–195 zostały sklasyfikowane w macierzy.
- [ ] Każdy finding ma jednoznaczną decyzję: fixed / covered / 200 / deferred / obsolete.
- [ ] `starvationDuration` ma poprawnie określone ownership i lifecycle, jeśli nadal jest authoritative.
- [ ] `dehydrationDuration` ma poprawnie określone ownership i lifecycle, jeśli nadal jest authoritative.
- [ ] Naprawiany state nie resetuje się podczas właściwych dla niego reconstruction boundaries.
- [ ] Time-skip nie powoduje double-processing naprawianego state.
- [ ] State wymagający save/load jest reprezentowany w istniejącym save modelu.
- [ ] Derived/transient state nie został niepotrzebnie zapisany jako persistence state.
- [ ] Nie powstaje nowy persistence framework ani drugi source of truth.
- [ ] 200 nie reimplementuje zakresu 198/199.
- [ ] `STATE.md`, `ARCHITECTURE.md` i `LOOSE-ENDS.md` odzwierciedlają rzeczywisty stan po implementacji.
- [ ] Testy przechodzą.
- [ ] Zachowanie zostało zweryfikowane w przeglądarce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
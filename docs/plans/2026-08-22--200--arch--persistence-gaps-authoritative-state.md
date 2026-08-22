# Plan: Persistence Gaps & Authoritative State Completion

**Created:** 2026-08-22  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~195~~ ~~196~~ ~~197~~

## Cel

Domknąć potwierdzone luki persistence/state consistency pozostałe po audytach 192–195 i planach 196–199.

Plan nie tworzy nowego systemu persistence. Ma ustalić dla każdego nadal istniejącego findingu:

```text
state
  → owner
  → lifecycle boundary
  → reconstruction source
  → save boundary, jeśli wymagana
```

i naprawić wyłącznie te przypadki, w których utrata state powoduje niepoprawne zachowanie świata.

Najważniejsze znane przykłady to `starvationDuration` i `dehydrationDuration`, ale lista nie może być ograniczona do tych dwóch pól bez ponownego sprawdzenia findings 192–195.

---

## 1. Reconcile findings 192–195

Przed implementacją przygotować krótką macierz wszystkich pozostałych findings oznaczonych jako persistence/state/deferred:

```text
finding
  ↓
already fixed
  ↓
covered by 196–199
  ↓
requires 200
  ↓
intentionally deferred
  ↓
obsolete / no longer applicable
```

Nie implementować problemu tylko dlatego, że znajduje się w starym audycie.

Dla każdego findingu ustalić aktualny stan na `main`.

---

## 2. Starvation / dehydration continuity

Przeanalizować aktualne ownership i lifecycle:

- `starvationDuration`,
- `dehydrationDuration`,
- powiązane need timers/accumulators, jeżeli mają ten sam charakter.

Dla każdego pola ustalić, czy jest:

- authoritative simulation state,
- derived state,
- transient runtime state.

Jeżeli wartość reprezentuje rzeczywisty stan świata/NPC i nie może zostać utracona, zapewnić jej continuity przez odpowiednie granice lifecycle.

Nie zapisywać automatycznie wszystkich timerów NPC.

---

## 3. NPC reconstruction boundary

Wykorzystać ownership ustalony przez **197**.

Zweryfikować:

```text
active NpcAgent
      ↓
state mutation
      ↓
agent dispose / settlement unload
      ↓
reconstruction
      ↓
state hydration
```

State nie może zostać:

- wyzerowany,
- ponownie zainicjalizowany,
- naliczony drugi raz,
- zastąpiony wartością domyślną.

Nie tworzyć kolejnego NPC state registry ani persistence layer.

---

## 4. Interaction z time-skip

Zweryfikować persistence-sensitive state względem semantyki **196**:

```text
normal simulation
      ↓
time-skip
      ↓
catch-up
      ↓
normal simulation
```

Dla każdego timer/accumulatora ustalić jedną ścieżkę naliczania elapsed World Time.

Nie dopuszczać do:

- normal tick + catch-up double processing,
- utraty elapsed time przez reconstruction,
- naliczenia czasu dwa razy,
- użycia osobnego zegara dla needs.

Wykorzystać istniejącą semantykę World Time.

---

## 5. Save/load boundary

Dla state wymagającego continuity sprawdzić, czy musi przeżyć również pełny save/load.

Klasyfikacja:

```text
runtime continuity only
        vs
save persistence required
```

Jeżeli save persistence jest wymagana, dodać minimalną reprezentację do istniejącego save modelu.

Nie projektować nowej architektury save/load.

Jeżeli state jest wyłącznie derived/transient, nie dodawać go do save.

---

## 6. Pozostałe potwierdzone persistence gaps

Po macierzy z punktu 1 naprawić tylko findings, które nadal istnieją i należą do tego zakresu.

Dla każdego zastosować ten sam kontrakt:

```text
authoritative owner
        ↓
lifecycle
        ↓
reconstruction
        ↓
optional save/load
```

Jeżeli finding został już rozwiązany przez 196–199, nie wykonywać ponownej implementacji.

Jeżeli jest celowo odłożony poza 200, przenieść go do właściwego planu/`LOOSE-ENDS.md`.

---

## 7. Derived vs authoritative state

Nie utrwalać wartości wyłącznie dlatego, że istnieją jako pola runtime.

Preferować:

```text
authoritative minimal state
        ↓
derive runtime values
```

zamiast:

```text
persistent copy of entire runtime object
```

Każdy nowy persistence field powinien mieć uzasadnienie wynikające z continuity lub poprawności symulacji.

---

## 8. Dokumentacja i LOOSE-ENDS

Zaktualizować:

- `docs/STATE.md`,
- `docs/ARCHITECTURE.md`, jeżeli ownership/lifecycle contract się zmieni,
- `docs/plans/LOOSE-ENDS.md`.

`LOOSE-ENDS.md` ma po implementacji rozróżniać:

- rozwiązane,
- przeniesione do innych planów,
- świadomie odłożone,
- nadal wymagające pracy.

Nie zostawiać zamkniętych findings jako aktywnych loose ends.

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
- przebudowa NPC needs/AI poza koniecznymi continuity fixes.

---

## Weryfikacja

### Testy

Dodać lub rozszerzyć testy dla faktycznie naprawianych findings, minimum:

- starvation continuity,
- dehydration continuity,
- NPC reconstruction,
- settlement unload/load,
- `WorldBundle` rebuild,
- time-skip + persistence-sensitive state,
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

Dla rzeczywiście naprawianych state:

1. doprowadzić NPC do obserwowalnego stanu needs,
2. wykonać settlement unload/reload,
3. wykonać `WorldBundle` rebuild,
4. wykonać time-skip,
5. wrócić do normalnej symulacji,
6. potwierdzić continuity i brak double-processing,
7. jeżeli dotyczy — zapisać/załadować świat i potwierdzić persistence.

---

## Kryteria akceptacji

- [ ] Wszystkie nadal aktualne persistence/state findings z 192–195 zostały sklasyfikowane.
- [ ] `starvationDuration` ma poprawnie określone ownership i lifecycle, jeśli nadal jest authoritative.
- [ ] `dehydrationDuration` ma poprawnie określone ownership i lifecycle, jeśli nadal jest authoritative.
- [ ] Naprawiany state nie resetuje się podczas NPC reconstruction.
- [ ] Naprawiany state zachowuje poprawną semantykę przez settlement/world rebuild.
- [ ] Time-skip nie powoduje double-processing tego state.
- [ ] State wymagający save/load jest reprezentowany w istniejącym save modelu.
- [ ] Derived/transient state nie został niepotrzebnie zapisany jako persistence state.
- [ ] Nie powstaje nowy persistence framework ani drugi source of truth.
- [ ] `STATE.md`, `ARCHITECTURE.md` i `LOOSE-ENDS.md` odzwierciedlają rzeczywisty stan po implementacji.
- [ ] Testy przechodzą.
- [ ] Zachowanie zostało zweryfikowane w przeglądarce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
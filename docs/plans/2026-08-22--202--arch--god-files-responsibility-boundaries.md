# Plan: God Files & Responsibility Boundaries

**Created:** 2026-08-22  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~201~~

## Cel

Przeanalizować i — jeśli jest to uzasadnione — podzielić sześć dużych plików według rzeczywistych responsibility boundaries.

Celem **nie jest zmniejszenie liczby linii**. Celem jest:

- jasny ownership,
- mniejsze coordinatory,
- odseparowanie niezależnych odpowiedzialności,
- usunięcie duplikacji,
- wydzielenie sensownych shared helpers,
- zachowanie istniejącego behaviour i kontraktów architektury.

> **Nie optymalizujemy LOC. Optymalizujemy odpowiedzialności.**

### Zakres

| Obszar | Pliki |
|---|---|
| NPC / fauna | `src/ai/NpcAgent.ts` · `src/fauna/AnimalAgent.ts` |
| Application / world | `src/app/createApp.ts` · `src/app/worldBundle.ts` |
| Gameplay | `src/quests/QuestManager.ts` · `src/player/PlayerController.ts` |

---

## 1. Analysis

Dla każdego pliku określić:

- odpowiedzialności,
- owned state,
- lifecycle,
- efekty uboczne,
- zależności,
- istniejące moduły domenowe,
- naturalne granice podziału,
- duplikację.

Kluczowe pytanie:

> Czy kod jest tutaj dlatego, że ten moduł jest jego właścicielem, czy tylko dlatego, że historycznie został tutaj dodany?

**Nie zakładać, że każdy plik musi zostać podzielony.**

Jeżeli plik ma spójne ownership, może pozostać duży.

---

## 2. Refactor

Po analizie od razu wykonać uzasadnione zmiany.

Dla każdej odpowiedzialności zdecydować:

```text
KEEP
EXTRACT
MOVE
MERGE
DELETE
```

Refaktorować **inkrementalnie**, nie wykonywać jednego dużego rewrite'u.

Preferowany kierunek:

```text
large coordinator
      ↓
clear responsibility boundaries
      ↓
focused domain modules
      ↓
thin coordinator
```

Najpierw wykorzystać istniejące moduły. Nowy moduł tworzyć tylko wtedy, gdy reprezentuje rzeczywistą odpowiedzialność.

Nie tworzyć nowych warstw wyłącznie dla zmniejszenia pliku.

---

## 3. Shared helpers

Podczas refaktoru sprawdzić wspólne funkcje pomiędzy sześcioma plikami.

Wydzielać helper, jeżeli:

- ma wspólną semantykę,
- nie posiada własnego state,
- jest niezależny od konkretnego runtime object,
- rzeczywiście należy do więcej niż jednego modułu.

Preferować istniejący moduł domenowy.

Nie tworzyć ogólnego `utils.ts` jako dumping ground.

Nie łączyć funkcji tylko dlatego, że wyglądają podobnie.

---

## 4. Granice architektoniczne

Refaktor musi zachować kontrakty ustalone przez **196–201**, szczególnie:

```text
authoritative state
      ↓
runtime representation
      ↓
lifecycle
      ↓
streaming / rebuild
      ↓
reconstruction
      ↓
persistence
```

Nie:

- przenosić authoritative state do runtime objects,
- tworzyć drugiego ownera state,
- tworzyć globalnego `EntityManager`,
- tworzyć nowego `BaseAgent` bez konkretnej potrzeby,
- tworzyć nowych globalnych managers.

Wykorzystać istniejące ownership i domain boundaries.

---

## 5. Behaviour preservation

Refaktor nie powinien zmieniać:

- simulation semantics,
- persistence contract,
- entity lifecycle,
- gameplay behaviour.

W szczególności sprawdzić automatycznie dotknięte obszary:

- NPC decisions, movement i combat,
- fauna behaviour/lifecycle,
- world creation,
- streaming/rebuild,
- quest flow,
- player movement/interactions,
- persistence,
- shared helpers.

---

## 6. Automated verification

Claude wykonuje wyłącznie automatyczną weryfikację:

- typecheck,
- testy,
- build,
- lint, jeżeli jest skonfigurowany,
- ewentualnie sprawdzenie import/dependency graph.

Po każdym większym extraction wykonać odpowiednią krótką weryfikację zamiast czekać do końca.

### Manual browser verification

Manualną weryfikację gameplayu wykonuje użytkownik po implementacji.

Claude nie ma obowiązku wykonywania browser verification.

---

## 7. Final assessment

Po refaktorze przygotować krótkie podsumowanie:

| File | Result |
|---|---|
| `NpcAgent.ts` | split / kept / partial |
| `AnimalAgent.ts` | split / kept / partial |
| `createApp.ts` | split / kept / partial |
| `worldBundle.ts` | split / kept / partial |
| `QuestManager.ts` | split / kept / partial |
| `PlayerController.ts` | split / kept / partial |

Jeżeli któryś plik pozostaje duży, ale ma spójne ownership — **jest to poprawny wynik**.

Jeżeli analiza ujawni większy problem poza zakresem 202, udokumentować go zamiast rozszerzać plan.

---

## Poza zakresem

- nowe gameplay systems,
- pełny audit architektury,
- zmiana simulation/persistence architecture,
- multiplayer architecture,
- pełny rewrite,
- mechaniczne dzielenie dużych plików,
- speculative abstractions.

---

## Kryteria akceptacji

- [ ] Wszystkie 6 plików przeanalizowane.
- [ ] Responsibility boundaries są jasno określone.
- [ ] Podziały wykonano tylko tam, gdzie są uzasadnione.
- [ ] Refaktor wykonano inkrementalnie.
- [ ] Shared helpers wydzielono tam, gdzie mają rzeczywiście wspólną semantykę.
- [ ] Nie powstał `utils.ts` jako dumping ground.
- [ ] Nie powstały nowe God Managers.
- [ ] Authoritative state i lifecycle boundaries pozostały poprawne.
- [ ] Nie zmieniono simulation/persistence semantics.
- [ ] Nie zmieniono gameplay behaviour.
- [ ] Typecheck przechodzi.
- [ ] Testy przechodzą.
- [ ] Build przechodzi.
- [ ] Final assessment sześciu plików przygotowany.
- [ ] Manual browser verification pozostawiona użytkownikowi.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
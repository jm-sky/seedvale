# Seedvale — NpcAgent refactor review

Pracuj bezpośrednio na aktualnym `main`.

## Cel

Wykonaj deep architectural review pliku:

`src/ai/NpcAgent.ts`

Przygotuj konkretny plan refactoru, który później zaimplementuje Claude Sonnet. Nie implementuj jeszcze refactoru.

## Context

Najpierw przeczytaj:

- `CLAUDE.md`
- `docs/STATE.md`
- `docs/plans/PLANNING.md`
- `docs/code-map/README.md`
- odpowiednie mapy `docs/code-map/` dla AI/NPC i dependencies
- cały `src/ai/NpcAgent.ts`
- bezpośrednio powiązane moduły potrzebne do zrozumienia ownership i istniejących mechanizmów.

Repository/codebase jest źródłem prawdy.

## Review

Przeanalizuj:

- AI / decision / action logic,
- needs,
- movement / navigation,
- schedules / routines,
- household / family / social,
- combat / hunting / mining / food / interactions,
- animation / audio / presentation,
- state ownership,
- lifecycle,
- config i helpery,
- coupling między domenami,
- istniejące systemy, które mogą przejąć część odpowiedzialności,
- git history, jeśli pomoże rozpoznać stopniowe narastanie kodu.

Kluczowa zasada: `NpcAgent` może pozostać centralnym punktem koordynacji NPC. Nie rozbijaj go mechanicznie na wiele klas tylko dlatego, że jest duży.

Szukaj przede wszystkim sytuacji, w których agent IMPLEMENTUJE logikę należącą do istniejącego systemu zamiast ją koordynować.

Nie projektuj nowej architektury bez potrzeby i nie duplikuj istniejących mechanizmów.

## Output

Zapisz raport:

`docs/reviews/2026-09-03--NpcAgent-refactor-review.md`

Raport ma zawierać:

1. Executive summary
2. Mapę obecnych odpowiedzialności
3. Konkretne problemy architektoniczne
4. Co powinno pozostać w `NpcAgent`
5. Co rzeczywiście powinno zostać wydzielone
6. Istniejące moduły/systemy do wykorzystania
7. Proponowaną strukturę po refactorze
8. Konkretne kroki implementacji w kolejności
9. Pliki do utworzenia/modyfikacji
10. Ryzyka i sposoby ich ograniczenia
11. Verification plan
12. Out of scope

Plan musi być wystarczająco konkretny, aby Sonnet mógł go zaimplementować bez ponownego wykonywania pełnego architectural discovery.

Na końcu podaj:

- `REFRACTOR` / `MINOR REFACTOR` / `KEEP AS IS`
- `S` / `M` / `L` / `XL`

Nie zmieniaj kodu. Nie twórz planów dla niezwiązanych refactorów.

# Seedvale — AnimalAgent refactor review

Pracuj bezpośrednio na aktualnym `main`.

## Cel

Wykonaj deep architectural review pliku:

`src/fauna/AnimalAgent.ts`

Przygotuj konkretny plan refactoru, który później zaimplementuje Claude Sonnet. Nie implementuj jeszcze refactoru.

## Context

Najpierw przeczytaj:

- `CLAUDE.md`
- `docs/STATE.md`
- `docs/plans/PLANNING.md`
- `docs/code-map/README.md`
- odpowiednie mapy `docs/code-map/` dla fauna i dependencies
- cały `src/fauna/AnimalAgent.ts`
- bezpośrednio powiązane moduły potrzebne do oceny ownership.

Repository/codebase jest źródłem prawdy.

## Review

Przeanalizuj szczególnie:

- animal state i lifecycle,
- movement / navigation,
- needs,
- predator / prey / fleeing,
- combat / health / stamina,
- livestock,
- production,
- corpse / death,
- mounting,
- vocalization / audio,
- animation / presentation,
- player interaction,
- configuration i helpery,
- coupling między fauna / NPC / settlement / world,
- istniejące mechanizmy, które można wykorzystać zamiast tworzenia nowych,
- git history, jeśli pomoże rozpoznać stopniowe narastanie odpowiedzialności.

Sprawdź, czy `AnimalAgent` nie stał się odpowiednikiem monolitycznego `NpcAgent`.

Jednocześnie pamiętaj, że Agent może być prawidłowym centralnym orchestratoriem. Nie proponuj podziału tylko dlatego, że plik jest duży.

Nie projektuj nowej architektury bez potrzeby i nie duplikuj istniejących mechanizmów.

## Output

Zapisz raport:

`docs/reviews/2026-09-03--AnimalAgent-refactor-review.md`

Raport ma zawierać:

1. Executive summary
2. Obecne odpowiedzialności
3. Konkretne problemy i podejrzane miejsca
4. Co powinno pozostać w `AnimalAgent`
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

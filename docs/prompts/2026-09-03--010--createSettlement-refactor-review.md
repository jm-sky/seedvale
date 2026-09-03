# Seedvale — createSettlement refactor review

Pracuj bezpośrednio na aktualnym `main`.

## Cel

Wykonaj deep architectural review pliku:

`src/settlement/createSettlement.ts`

Przygotuj konkretny plan refactoru, który później zaimplementuje Claude Sonnet. Nie implementuj jeszcze refactoru.

## Context

Najpierw przeczytaj:

- `CLAUDE.md`
- `docs/STATE.md`
- `docs/plans/PLANNING.md`
- `docs/code-map/README.md`
- odpowiednie mapy `docs/code-map/` dla settlement i dependencies
- cały `src/settlement/createSettlement.ts`
- bezpośrednio powiązane moduły potrzebne do zrozumienia ownership i istniejących mechanizmów.

Repository/codebase jest źródłem prawdy. Nie zakładaj, że duży plik jest automatycznie zły.

## Review

Sprawdź szczególnie:

- liczbę i rodzaj odpowiedzialności modułu,
- settlement / NPC / fauna / economy / world / rendering / audio / player,
- initialization i lifecycle,
- cleanup/dispose,
- config vs runtime logic,
- helpery i funkcje narosłe w module,
- coupling i dependencies,
- czy część logiki należy już do istniejących systemów,
- czy plik jest orchestratorem, czy monolitem,
- git history, jeśli pomaga rozpoznać stopniowe narastanie odpowiedzialności.

Nie projektuj nowej architektury bez potrzeby. W pierwszej kolejności wykorzystaj istniejące moduły i mechanizmy.

Nie rozbijaj orchestration tylko dlatego, że funkcja jest długa. Nie twórz nowych warstw wyłącznie dla podziału pliku.

## Output

Zapisz raport:

`docs/reviews/2026-09-03--createSettlement-refactor-review.md`

Raport ma zawierać:

1. Executive summary
2. Obecne odpowiedzialności modułu
3. Konkretne problemy architektoniczne
4. Co powinno pozostać w `createSettlement.ts`
5. Co rzeczywiście powinno zostać wydzielone
6. Istniejące moduły, które należy wykorzystać
7. Proponowaną strukturę po refactorze
8. Konkretne kroki implementacji w kolejności
9. Pliki do utworzenia/modyfikacji
10. Ryzyka i sposoby ich ograniczenia
11. Verification plan
12. Out of scope

Plan musi być wystarczająco konkretny, aby Sonnet mógł go zaimplementować bez ponownego wykonywania pełnego architectural discovery.

Na końcu podaj jednoznacznie:

- `REFRACTOR` / `MINOR REFACTOR` / `KEEP AS IS`
- `S` / `M` / `L` / `XL`

Nie zmieniaj kodu. Nie twórz planów dla niezwiązanych refactorów.

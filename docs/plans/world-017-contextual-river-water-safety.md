# Plan: Contextual River Water Safety

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~world-011~~
**Domain:** `world`
**Subdomains:** `resources` `simulation`
**Tags:** `water` `river` `drinking` `hydrology` `settlements`
**Roadmap:** -

## Cel

Zastąpić obecne uproszczenie `river = safe` deterministyczną oceną jakości wody zależną od konkretnego miejsca poboru.

Mały ciek wysoko w terenie i blisko początku zlewni może być bezpieczny, natomiast większa rzeka downstream lub rzeka przepływająca blisko osady powinna być traktowana jako `unsafe`.

Mechanizm ma być tani, liczony lazy i oparty na istniejących danych świata.

## Założenia architektoniczne

Nie tworzyć nowego `WaterSystem` ani player-only mechanizmu.

Rozszerzyć istniejący przepływ:

    hydrology / river data
        ↓
    river water context
        ↓
    WaterSource classification
        ↓
    survivalActions
        ↓
    PlayerNeeds / Inventory

`WaterSource` pozostaje wspólnym kontraktem źródła wody.

Nie przenosić logiki hydrologii ani settlement proximity do `survivalActions`.

## 1. River water context

Dodać małe, deterministyczne query dla punktu interakcji z rzeką.

Wykorzystać istniejące dane river network / river segments zamiast ponownie wykonywać hydrologię.

Minimalny kontekst powinien zawierać dane źródłowe potrzebne klasyfikatorowi, przede wszystkim:

- `elevation`,
- `accumulation`.

Nie duplikować pochodnych wartości, jeśli można je wyliczyć istniejącą funkcją, np. `flowFactor()` z `accumulation`.

Jeżeli istniejący stabilny segment/cell identifier da się uzyskać bez dodatkowego kosztu, może zostać wykorzystany na potrzeby cache. Nie wymuszać konkretnego typu klucza przed reconem implementacyjnym.

Nie wykonywać traversal upstream przez river tiles.

Nie próbować wyliczać pełnego metrycznego dystansu od rzeczywistego źródła rzeki.

## 2. Lazy classification

Jakość rzeki klasyfikować dopiero wtedy, gdy jest potrzebna, np.:

- podczas resolve/interakcji z shoreline,
- przy piciu,
- przy napełnianiu pojemnika,
- przez inne przyszłe systemy pytające o jakość lokalnego źródła.

Nie liczyć jakości dla wszystkich rzek podczas world generation.

Nie wykonywać klasyfikacji w globalnym ticku.

## 3. Base river quality

Dodać czystą, deterministyczną funkcję klasyfikującą bazową jakość rzeki z kontekstu hydrologicznego.

Pierwsza heurystyka powinna wykorzystywać:

- `accumulation`,
- `elevation`,
- istniejący `flowFactor()` tylko jako pochodną, jeśli faktycznie pomaga w czytelności/tuningu.

Ogólna zasada:

    small upstream-like flow
    + sufficiently high terrain
    → candidate safe

    larger downstream flow
    or sufficiently low terrain
    → unsafe

Nie kodować progów jako semantycznej prawdy typu:

    elevation > X = mountain

Progi powinny być jawne, testowalne i łatwe do tuningu na podstawie aktualnego worldgen.

Ta sama lokalizacja przy niezmienionym świecie musi zwracać tę samą jakość.

## 4. Settlement proximity modifier

Uwzględnić wpływ pobliskiej osady już w pierwszej wersji.

Wykorzystać istniejący settlement grid / settlement plan cache / `SettlementsManager` zamiast:

- ładować settlement meshes,
- zależeć od tego, czy settlement jest aktualnie streamed-in,
- skanować wszystkie aktywne osady.

Dodać bounded lookup najbliższych sensownych settlement cells wokół punktu poboru wody.

Lookup settlement proximity powinien być osobnym mechanizmem od klasyfikatora, tak aby końcowa funkcja klasyfikująca pozostała pure i łatwa do testowania.

Reguła v1:

    jeśli rzeka znajduje się wystarczająco blisko osady
    → final quality nie może być `safe`

czyli:

    base safe + nearby settlement → unsafe
    base unsafe + nearby settlement → unsafe

Nie próbować jeszcze ustalać, czy osada leży faktycznie upstream.

Settlement proximity jest uproszczonym proxy dla ryzyka lokalnego zanieczyszczenia.

## 5. Water quality composition

Rozdzielić pojęciowo:

    baseQuality
    +
    contextual modifiers
    =
    finalQuality

Na tym etapie:

    baseQuality:
      hydrology

    contextual modifiers:
      settlement proximity

Finalny `WaterSource` otrzymuje gotowe:

    safe | unsafe | undrinkable

Pozostałe źródła zachowują obecne zasady:

- well → `safe`,
- lake → `unsafe`,
- ocean → `undrinkable`,
- river → kontekstowe `safe | unsafe`.

## 6. Lazy cache

Klasyfikacja ma być lazy + cached.

Wybrać najtańszy stabilny klucz dostępny w aktualnym river runtime. Preferować istniejący river cell/segment identifier, jeśli jest dostępny bez dokładania sztucznej warstwy identyfikacji; w przeciwnym razie użyć prostego stabilnego klucza przestrzennego odpowiedniego do rozdzielczości hydrologii.

Nie cache'ować per dokładne `(x, z)` gracza, jeśli wiele punktów interakcji reprezentuje ten sam fragment cieku.

Nie tworzyć persistent save dla cache.

Cache należy do world/river lifecycle i powinien zostać odrzucony przy zmianie świata/seedu.

Jeżeli settlement proximity opiera się wyłącznie na deterministycznym settlement planie, finalny wynik również może być cache'owany.

Jeżeli później pojawią się dynamiczne źródła skażenia, zachować możliwość rozdzielenia:

    cached baseQuality
    +
    dynamic contamination
    =
    finalQuality

bez przebudowy całego API.

## 7. Extension point pod przyszłe zanieczyszczenia

Nie implementować jeszcze pełnego pollution systemu, ale nie zamykać API na kolejne modyfikatory.

Przyszłe źródła mogą obejmować:

- livestock concentration,
- corpse,
- farm/manure,
- tannery / industry,
- sewage,
- temporary pollution event,
- inne world-state contamination sources.

Docelowo część z nich może korzystać z prawdziwego downstream propagation.

To nie należy do tego planu.

## 8. Performance

Mechanizm powinien być tani:

- brak hydrology recomputation,
- brak globalnego settlement scan,
- brak globalnego water-quality tick,
- brak pełnego upstream traversal,
- bounded local lookup,
- lazy evaluation,
- cache dla powtarzających się query.

Klasyfikacja jakości wody nie powinna wpływać zauważalnie na frame time.

## 9. Testy

Dodać unit testy czystej funkcji klasyfikującej bazową jakość.

Przypadki:

- small accumulation + high terrain → może być `safe`,
- large accumulation + high terrain → `unsafe`,
- small accumulation + low terrain → `unsafe`,
- large accumulation + low terrain → `unsafe`.

Dodać testy settlement modifier:

- `safe` base + daleko od osady → `safe`,
- `safe` base + blisko osady → `unsafe`,
- `unsafe` base + blisko osady → nadal `unsafe`.

Dodać testy istniejących typów:

- lake → `unsafe`,
- ocean → `undrinkable`,
- well → `safe`.

Dodać test stabilności:

- powtarzane query dla tego samego fragmentu rzeki i niezmienionego świata daje identyczny wynik.

Dodać test cache lifecycle, jeżeli cache ma osobnego ownera.

## 10. UX

Zachować istniejącą semantykę feedbacku.

Dla `safe` nie pokazywać warningu o chorobie.

Dla `unsafe` zachować obecny warning:

    Ta woda może powodować chorobę.

Nie ujawniać graczowi wewnętrznych progów typu elevation/accumulation.

Jakość powinna być możliwa do intuicyjnego odczytania z kontekstu świata:

- mały górski strumień,
- większa rzeka downstream,
- rzeka blisko osady.

## Known limitation / follow-up

Obecny model pojemników nie zachowuje jakości źródła po napełnieniu. Oznacza to, że `unsafe` woda nalana do bukłaka nie pozostaje oznaczona jako `unsafe` podczas późniejszego picia z pojemnika.

Nie rozszerzać tego planu o pełny container contamination system, ale zachować tę lukę jako jawny follow-up do osobnego planu.

## Poza zakresem

- system chorób,
- gotowanie i oczyszczanie wody,
- filtry,
- przechowywanie jakości wody w bukłaku,
- dynamiczne skażenie przez NPC/faunę,
- propagacja pollution downstream,
- pełne śledzenie źródła rzeki między river tiles,
- analiza rzeczywistego upstream względem osady.

## Verification

Browser verification wykonuje User:

- znaleźć mały ciek wysoko w terenie i sprawdzić brak warningu,
- sprawdzić większą rzekę downstream i warning,
- sprawdzić ciek blisko osady i warning,
- sprawdzić podobny ciek daleko od osady,
- sprawdzić lake,
- sprawdzić ocean,
- sprawdzić well,
- upewnić się, że fishing oraz filling nie mają regresji.

Przy implementacji dodać JSDoc do ważnych publicznych funkcji/klas architektonicznych, gdy pomaga to w preflight discovery; dla nowych mechanizmów preferować `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Plan: Player Physical Effort — Stamina & Vigor

**Created:** 2026-09-01  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** none  
**Domain:** `items-player`

## Cel

Poprawić model fizycznego wysiłku gracza poprzez wykorzystanie istniejących systemów `Stamina` i `Vigor`.

Docelowo:
- Stamina reprezentuje krótkotrwałą wydolność.
- Vigor reprezentuje długotrwałe zmęczenie.
- Ciężka praca zużywa oba zasoby.
- Długa praca nie wyczerpuje Stamina do 0, ale pozostawia ją wyraźnie obniżoną.
- Vigor spada podczas pracy znacznie szybciej niż podczas zwykłego chodzenia.
- Walka korzysta z tego samego modelu wysiłku.
- Po zakończeniu pracy Stamina regeneruje się szybko, a Vigor wolno.

Nie tworzyć nowego systemu fatigue.

## Recon — istniejący model

Istnieją już osobne zasoby `Stamina` i `Vigor` oraz mechanizmy kosztu sprintu, regeneracji Stamina, kosztu ruchu dla Vigor, zwiększonego kosztu Vigor podczas sprintu, kosztu Stamina dla `BusyAction` i regeneracji podczas snu.

`BusyAction` obsługuje długotrwałe czynności gracza. Istotne obecne wartości:

```text
BusyAction stamina cost = 6/s
Stamina regeneration   = 12/s
```

Jeżeli oba mechanizmy działają równocześnie, praca może powodować dodatni bilans Stamina zamiast zmęczenia.

`workOnWell()` jest szczególnie ważne, ponieważ krótka rzeczywista sesja `BusyAction` reprezentuje dłuższy okres pracy w czasie świata.

Agent ma przed implementacją zweryfikować aktualne nazwy funkcji/plików i kolejność wykonywania dla `PlayerNeeds`, `BusyAction`, `workOnWell`, terrain preparation, movement/sprint i player combat. Jest to weryfikacja założeń, nie ponowny szeroki recon.

## 1. Stamina i Vigor

**Stamina** = krótkoterminowa zdolność do intensywnego wysiłku: sprint, atak, intensywna praca i ciężkie czynności. Może szybko spadać i szybko się regenerować.

**Vigor** = długoterminowe zmęczenie: wielogodzinna praca, długotrwały marsz, sprint i walka. Nie powinien wracać do 100% po kilku sekundach odpoczynku.

Nie łączyć obu zasobów w jeden mechanizm.

## 2. Regeneracja Stamina podczas BusyAction

Naprawić obecny problem niezależnej regeneracji i kosztu pracy. Podczas fizycznego `BusyAction` nie mogą one powodować dodatniego bilansu Stamina.

Preferować najprostsze rozwiązanie zgodne z istniejącym ownership, np. wyłączenie normalnej regeneracji podczas aktywnej pracy. Po zakończeniu `BusyAction` normalna regeneracja ma wracać automatycznie.

## 3. Stamina dla długotrwałej pracy

Obecny `BUSY_ACTION_STAMINA_COST_PER_SEC = 6` traktować jako punkt wyjścia i nie zwiększać go bez potrzeby.

Praca ma powodować wyraźny spadek Stamina, ale nie powinna wymuszać zejścia do `0`. `BusyAction` może reprezentować wielogodzinną pracę, podczas której postać robi krótkie przerwy na oddech.

Wprowadzić parametr/regułę minimalnego poziomu Stamina dla długotrwałej pracy, jeżeli jest potrzebna. `~50%` jest punktem startowym balansu, nie twardym wymaganiem. Jeżeli istniejący model pozwala osiągnąć zamierzone zachowanie bez dodatkowego floor, preferować prostsze rozwiązanie.

## 4. Vigor dla fizycznej pracy

Dodać wpływ pracy na istniejący Vigor poprzez wspólny mechanizm wysiłku, zamiast ręcznego odejmowania Vigor w każdym action module.

Minimalny model:

```text
activity
    → effort intensity
        → Stamina effect
        → Vigor effect
```

Ciężka praca powinna zużywać Vigor szybciej niż zwykłe chodzenie. Istniejący koszt chodzenia i multiplier sprintu są baseline'em do kalibracji.

Docelowo zachować relację w rodzaju:

```text
light activity < walking < sprint / moderate work < heavy work
```

Dokładne wartości ustalić na podstawie istniejącego modelu czasu świata.

## 5. Symulowany czas pracy

Nie wiązać Vigor wyłącznie z rzeczywistym czasem `BusyAction`.

Dla czynności takich jak studnia:

```text
real BusyAction duration ≠ represented work duration
```

Jeżeli akcja posiada `sessionHours` lub analogiczny czas domenowy, koszt Vigor powinien korzystać z niego:

```text
represented work duration × effort rate = Vigor cost
```

Zmiana czasu animacji/interakcji nie może przypadkowo zmieniać fizjologicznego kosztu wielogodzinnej pracy.

## 6. Studnia

`workOnWell()` jest pierwszym konkretnym przypadkiem.

Pełna sesja powinna:
- obniżyć Stamina,
- obniżyć Vigor,
- nie sprowadzić Stamina do 0,
- naliczyć Vigor zgodnie z reprezentowanym czasem pracy.

Orientacyjnie:

```text
start:                  Stamina 100 / Vigor 100
po wielogodzinnej pracy: Stamina ~50 / Vigor wyraźnie poniżej 100
```

Wartości są przykładowe, nie wymagane. Nie tworzyć osobnego `wellVigorCost`.

## 7. Przygotowanie terenu

Objąć istniejące fizyczne czynności przygotowania terenu. Kopanie powinno być co najmniej `moderate`, a cięższe prace mogą być `heavy`.

Wykorzystać ten sam mechanizm co dla studni:

```text
BusyAction → physical effort → Stamina + Vigor
```

## 8. Budowanie

Przejrzeć istniejące player construction actions. Nie wszystkie konstrukcje muszą mieć identyczny koszt.

Przykładowa klasyfikacja do potwierdzenia względem kodu:

```text
prosta instalacja     light/moderate
ogród / grządka       moderate
większa konstrukcja   moderate/heavy
studnia               heavy
```

Nie dodawać kosztu tylko dlatego, że czynność używa `BusyAction`: czas trwania interakcji nie oznacza automatycznie wysiłku fizycznego.

## 9. Pozostałe BusyAction

Wykonać focused audit player actions używających `BusyAction` i podzielić je na `physical effort` oraz `time-consuming interaction`.

Sprawdzić m.in. terrain preparation, digging, chopping, fizyczne gathering, construction, carrying/heavy manipulation, fishing, eating, drinking oraz inne istniejące akcje.

Nie naliczać kosztu automatycznie wszystkim `BusyAction`.

## 10. Walka

Sprawdzić istniejący player combat i podłączyć go do tego samego modelu wysiłku. Uwzględnić istniejące melee attacks oraz inne mechaniki wymagające fizycznego wysiłku; nie tworzyć osobnego `CombatFatigue`.

Kluczowy przypadek:

```text
wielogodzinna praca
    ↓
Stamina obniżona / Vigor obniżony
    ↓
wilk atakuje
    ↓
walka z naturalnie obniżoną wydolnością
```

Nie dodawać specjalnego wyjątku dla wilków.

## 11. Zapobieganie podwójnemu kosztowi

Fizyczna praca wykonywana w miejscu nie może jednocześnie dostawać `work drain` i `walking drain`, jeżeli gracz faktycznie nie chodzi.

Nie naliczać tego samego wysiłku przez dwa niezależne mechanizmy. Każdy koszt ma mieć jednoznacznego właściciela.

## 12. Ownership

### `PlayerNeeds`

Właściciel Stamina, Vigor, drain, recovery i ograniczeń wartości.

### `BusyAction`

Odpowiada za rozpoczęcie, progress, czas, zakończenie i cancellation. Nie dodawać do niego osobnego systemu potrzeb.

### Player actions

Deklarują charakter fizycznego wysiłku, ale nie implementują bezpośrednio modyfikacji Stamina/Vigor.

## 13. Kolejność implementacji

1. Zweryfikować kolejność regeneracji Stamina i `BusyAction`.
2. Naprawić dodatni bilans Stamina podczas pracy.
3. Zachować `6/s`, jeśli daje odpowiedni efekt.
4. Wprowadzić wspólny profil/intensywność fizycznego wysiłku.
5. Dodać Vigor drain dla pracy.
6. Wykorzystać symulowany czas pracy tam, gdzie istnieje.
7. Podłączyć `workOnWell`.
8. Podłączyć terrain preparation.
9. Podłączyć odpowiednie construction actions.
10. Przejrzeć pozostałe fizyczne `BusyAction`.
11. Podłączyć istniejące player combat actions.
12. Dostroić wartości.

Unikać większego refaktoru, jeśli cel można osiągnąć małą zmianą istniejącej architektury.

## 14. Testy

### Stamina
- idle regeneruje Stamina,
- sprint zużywa Stamina,
- fizyczny BusyAction zużywa Stamina,
- praca nie powoduje dodatniego bilansu,
- praca nie wyczerpuje Stamina do 0,
- po zakończeniu pracy regeneracja wraca,
- cancellation nie powoduje dalszego drain.

### Vigor
- walking zachowuje istniejący koszt,
- sprint zachowuje istniejący multiplier,
- physical work zużywa Vigor,
- heavy work zużywa więcej niż walking,
- Vigor nie regeneruje się natychmiast po zakończeniu pracy,
- cancellation nie nalicza przyszłego czasu.

### Symulowany czas

Dla studni i podobnych akcji jawnie testować, że:

```text
real duration != represented work duration
```

Zmiana czasu `BusyAction` nie może przypadkowo zmieniać kosztu wielogodzinnej pracy.

## 15. Manual verification

W browserze:

1. idle → Stamina regeneruje się,
2. sprint → Stamina spada,
3. chodzenie → Vigor spada zgodnie z istniejącym modelem,
4. kopanie → Stamina i Vigor spadają,
5. budowanie → odpowiedni koszt,
6. pełna sesja studni → Stamina jest wyraźnie obniżona, ale nie 0,
7. pełna sesja studni → Vigor jest wyraźnie obniżony,
8. po pracy → Stamina szybko się regeneruje,
9. po pracy → Vigor pozostaje obniżony,
10. atak wilka bezpośrednio po pracy → gracz nie ma pełnej wydolności,
11. walka dodatkowo zużywa odpowiednie zasoby,
12. sen nadal poprawnie regeneruje Vigor,
13. fishing / lekkie interakcje nie dostają przypadkowo kosztu heavy work.

## 16. Dokumentacja / JSDoc

Dla nowych lub istotnie zmienionych funkcji dodać JSDoc zgodnie z zasadami projektu. Główne funkcje domenowe oznaczyć `@domain items-player`.

Dokumentacja powinna jasno rozróżniać realny czas `BusyAction`, reprezentowany czas pracy, Stamina i Vigor.

## 17. Poza zakresem

Nie zmieniać:
- Hunger/Thirst,
- HP,
- NPC needs,
- fauna simulation,
- globalnego systemu czasu,
- animacji,
- UI poza koniecznymi zmianami prezentacji istniejących wartości,
- player-only alternatywnego systemu fatigue.

**Zrób git commit i push do main, rebase jeżeli trzeba**

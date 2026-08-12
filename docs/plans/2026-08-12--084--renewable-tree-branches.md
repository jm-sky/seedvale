# 084 — Renewable tree branches

## Cel

Zmienić obecny system zbierania gałęzi podczas inspekcji drzewa z czystej szansy procentowej na **ograniczony, odnawialny zasób przypisany do konkretnego żywego drzewa**.

Obecnie inspekcja żywego drzewa może niezależnie od wcześniejszych inspekcji wylosować gałąź. Po zmianie każde drzewo będzie miało własny licznik dostępnych gałęzi.

Przykład:

1. Drzewo powstaje z `2` gałęziami.
2. Pierwsza inspekcja nic nie znajduje.
3. Druga inspekcja znajduje gałąź → licznik `1`.
4. Trzecia inspekcja znajduje gałąź → licznik `0`.
5. Kolejne inspekcje nie dają gałęzi.
6. Po upływie czasu regeneracji gałęzie zaczynają odrastać.

Gałęzie mogą odrastać **wyłącznie na żywych drzewach**.

## Powiązanie z istniejącą architekturą

Nie tworzyć osobnego systemu dla gałęzi. Mechanizm powinien zostać zintegrowany z istniejącym `TreeLifecycle`.

Aktualnie:

- `TreeGrowthStage` rozróżnia `sapling`, `young`, `mature`, `old` oraz etapy ścinania.
- `TreeLifecycle` jest właścicielem stanu drzewa i sparse `TreeStateOverride`.
- `resolve()` wylicza aktualny stan drzewa względem `worldDays`.
- inspekcja drzewa odbywa się w `gameLoop.ts` przez `treeInspectionCanYieldBranch()`.
- aktualna szansa gałęzi to `TREE_BRANCH_CHANCE`, z bonusem `KNIFE_BRANCH_BONUS`.

Mechanizm liczby gałęzi powinien rozszerzyć istniejący lifecycle, a nie omijać go przez osobny registry/mapę w `gameLoop.ts`.

## Zasady gameplayowe

### Maksymalna liczba gałęzi

Liczba dostępnych gałęzi zależy od aktualnego wieku drzewa:

| Wiek | Maks. liczba gałęzi |
|------|---------------------|
| `sapling` | `0` |
| `young` | `0–2` |
| `mature` | `2–3` |
| `old` | `2–3` |

Dla `young`, `mature` i `old` początkowa liczba gałęzi jest losowana przy powstaniu drzewa w odpowiednim zakresie.

Losowanie musi być deterministyczne względem danych proceduralnych drzewa, tak aby streaming chunków nie zmieniał liczby gałęzi.

### Inspekcja

Inspekcja żywego drzewa może zwrócić gałąź tylko wtedy, gdy:

- drzewo jest żywe (`sapling`, `young`, `mature`, `old`),
- `branchesRemaining > 0`,
- inventory ma miejsce na `branch`,
- przejdzie istniejący roll szansy inspekcji.

Istniejące `TREE_BRANCH_CHANCE` oraz `KNIFE_BRANCH_BONUS` pozostają mechanizmem prawdopodobieństwa znalezienia gałęzi. Licznik jest dodatkowym ograniczeniem, a nie zamiennikiem rolla.

Po udanym znalezieniu:

```text
branchesRemaining -= 1
inventory.add('branch')
```

Jeżeli licznik wynosi `0`, kolejne inspekcje nie wykonują skutecznego rolla na gałąź / nie mogą przyznać kolejnej gałęzi.

### Regeneracja

Regeneracja działa na zasadzie **jedna brakująca gałąź co N dni**, aż do osiągnięcia aktualnego maksimum wieku drzewa.

Przykład dla maksimum `3`:

```text
3 → zbiór → 2
2 → zbiór → 1
1 → zbiór → 0
0 → N dni → 1
1 → N dni → 2
2 → N dni → 3
```

`N` powinno być stałą konfiguracyjną lifecycle, np. `TREE_BRANCH_REGEN_DAYS`, a nie wartością rozproszoną po kodzie. Początkowa wartość powinna być łatwa do zmiany po testach gameplayowych.

Regeneracja musi być **lazy**, oparta o `worldDays`, bez tickowania każdego drzewa każdego frame'a.

### Wiek drzewa a licznik

Maksimum jest wyliczane z **aktualnego wieku**, nie z wieku początkowego.

Jeżeli `young` przejdzie w `mature`, drzewo może mieć większy maksymalny zapas.

Zmiana wieku nie powinna jednak natychmiast tworzyć wszystkich nowych gałęzi. Nowa pojemność staje się dostępna przez normalną regenerację.

Jeżeli drzewo zostanie ścięte i przejdzie do `limbed`, `felled` lub `harvested`, regeneracja gałęzi inspekcyjnych zostaje zatrzymana. Etapy ścinania pozostają odpowiedzialne za istniejący system harvestu siekierą.

Po powrocie `harvested → sapling` drzewo ma `0` dostępnych gałęzi i może zacząć je odzyskiwać dopiero po przejściu do wieku, który posiada niezerowy limit.

## Stan drzewa

Rozszerzyć istniejący stan lifecycle o dane potrzebne do odtworzenia licznika po:

- unload/reload chunku,
- zapisie gry,
- ponownym uruchomieniu gry,
- upływie wielu dni bez renderowania danego drzewa.

Preferowany kierunek to rozszerzenie `TreeStateOverride`, zamiast tworzenia osobnego persistence systemu.

Stan powinien umożliwiać odtworzenie co najmniej:

- aktualnej liczby dostępnych gałęzi, jeśli różni się od proceduralnego stanu początkowego,
- momentu odniesienia dla regeneracji.

Nie zapisywać pełnego stanu dla każdego drzewa, jeśli można zachować obecny model sparse overrides.

## Proceduralny stan początkowy

Dla drzew, które nigdy nie zostały zmienione przez gracza, liczba początkowych gałęzi powinna wynikać deterministycznie z danych drzewa, np. z jego stabilnego `TreeId` / seed-derived hash.

Nie używać `Math.random()` przy każdym `resolve()` ani przy każdym streamowaniu chunku.

Dzięki temu:

- drzewo zawsze ma ten sam początkowy zapas,
- unload/load nie zmienia zasobu,
- nie trzeba zapisywać wszystkich zdrowych drzew.

## Integracja z `TreeLifecycle`

Dodać do lifecycle wspólne operacje w rodzaju:

- określenie maksymalnej liczby gałęzi dla wieku,
- rozwiązanie aktualnego `branchesRemaining` względem `worldDays`,
- pobranie/zużycie jednej gałęzi podczas inspekcji,
- obsługa regeneracji.

Nazwy API są do ustalenia podczas implementacji, ale logika powinna być skupiona w `treeLifecycle.ts`.

`resolve()` powinno nadal pozostać głównym miejscem wyliczania aktualnego stanu drzewa względem czasu. Nie należy dodawać osobnego per-frame update'u dla gałęzi.

## Integracja z inspekcją

`gameLoop.ts` nie powinien samodzielnie zmniejszać licznika drzewa.

Obecny fragment:

```text
inspection
  → treeInspectionCanYieldBranch()
  → Math.random() < branchChance
  → inventory.add('branch')
```

powinien zostać przekształcony w:

```text
inspection
  → żywe drzewo
  → TreeLifecycle sprawdza dostępność gałęzi
  → istniejący branch chance roll
  → TreeLifecycle pobiera 1 gałąź
  → inventory.add('branch')
```

Ważne: licznik powinien zostać zmniejszony **tylko wtedy, gdy faktycznie dodano gałąź do inventory**. Pełny inventory nie może zużywać zasobu drzewa.

## Dead / chopped trees

`treeInspectionCanYieldBranch()` nadal może pełnić funkcję szybkiego guardu dla etapów drzewa, ale źródłem prawdy o możliwości znalezienia gałęzi powinien być lifecycle.

Dla:

- `limbed`,
- `felled`,
- `harvested`

inspekcja nie może pobierać regenerujących się gałęzi.

Istniejący harvest siekierą (`CHOP_YIELDS`) pozostaje bez zmian. Nie mieszać obu rodzajów gałęzi w jeden licznik:

- gałęzie znajdowane podczas inspekcji = odnawialny zasób żywego drzewa,
- gałęzie/drewno z harvestu siekierą = wynik procesu ścinania.

## Persistence i time skip

Mechanizm musi poprawnie działać po przeskoku czasu.

Jeżeli drzewo ma `0` gałęzi i gracz przeskoczy o `3N` dni, przy kolejnej ocenie drzewa powinno mieć maksymalny dostępny zapas, bez konieczności wykonywania `3N` aktualizacji.

Jeżeli drzewo było częściowo wyczerpane, czas powinien uzupełnić je stopniowo do maksimum.

Nie dodawać osobnego catch-up loop dla wszystkich drzew podczas time skipu. Wykorzystać istniejący model lazy world-time.

## Testy

Dodać testy jednostkowe dla lifecycle obejmujące co najmniej:

- `sapling` ma `0` gałęzi,
- `young` ma maksymalnie `2`,
- `mature` ma maksymalnie `3`,
- `old` ma maksymalnie `3`,
- początkowy roll jest deterministyczny,
- pobranie jednej gałęzi zmniejsza licznik o `1`,
- pobranie przy `0` kończy się niepowodzeniem,
- pełny inventory nie zużywa gałęzi drzewa,
- jedna brakująca gałąź odrasta po `N` dniach,
- regeneracja zatrzymuje się na maksimum,
- wiele okresów `N` uzupełnia kilka brakujących gałęzi,
- `limbed` / `felled` / `harvested` nie regenerują gałęzi,
- `young → mature` korzysta z nowego limitu,
- `harvested → sapling` resetuje możliwość zbierania do zasad dla `sapling`,
- stan jest zachowany po serialize/replace overrides,
- time skip nie wymaga per-frame aktualizacji.

Dodać/zmienić testy `treeInspection` tak, aby obecny branch roll był sprawdzany razem z dostępnością zasobu.

## UX

Nie dodawać osobnego UI licznika gałęzi na tym etapie.

Gracz ma otrzymywać istniejący feedback `+1 Gałąź`, gdy skutecznie ją znajdzie. Gdy licznik jest pusty, zwykła inspekcja może nadal zwracać opis drzewa bez dodatkowego komunikatu.

## Zakres poza planem

Nie obejmuje:

- gałęzi z innych roślin,
- osobnego systemu zasobów odnawialnych,
- sezonowego wpływu na regenerację,
- wizualizacji gałęzi na modelu drzewa,
- zmian harvestu siekierą,
- NPC zbierających gałęzie.

Sezony/pogoda mogą w przyszłości wpływać na `TREE_BRANCH_REGEN_DAYS`, ale ten plan powinien pozostać niezależny od planu 040.

## Kryteria akceptacji

- [ ] Każde żywe drzewo ma deterministyczny limit gałęzi zależny od wieku.
- [ ] Inspekcja nie może zebrać więcej gałęzi niż aktualny licznik.
- [ ] Udane zebranie zmniejsza licznik dokładnie o `1`.
- [ ] Gałęzie odnawiają się co N dni, maksymalnie do limitu aktualnego wieku.
- [ ] Regeneracja działa tylko dla żywych drzew.
- [ ] Stan jest zgodny z istniejącym `TreeLifecycle` i sparse persistence.
- [ ] Streaming i time skip nie powodują utraty ani podwójnego odradzania gałęzi.
- [ ] Istniejący bonus noża i branch chance nadal działają.
- [ ] Harvest siekierą pozostaje niezależny od licznika inspekcyjnych gałęzi.
- [ ] Testy lifecycle i inspekcji pokrywają przypadki graniczne.

# Plan: Mobile playtest fixes — interactions, quests, health and UI

**Created:** 2026-08-18
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** none

domain: ui-input
tags: [items-player, quests-progression, settlements-npcs]

## Cel

W jednej sesji poprawić najważniejsze problemy znalezione podczas testów mobile:

- blokowanie NPC przy studni,
- szybkie interakcje z przedmiotami,
- szybszy harvest martwych zwierząt,
- health i leczenie,
- quest „Wypatrz jelenia”,
- widoczność aktywnej umiejętności,
- wybór obiektów przy dużej liczbie kandydatów,
- czytelność questów przy NPC,
- dialog NPC po zakończeniu questa,
- sortowanie i kategorie inventory.

Combat pozostaje **poza zakresem** i zostanie omówiony w osobnym zadaniu.

## 1. NPC nie mogą blokować się przy studni

### Problem

NPC potrafią wejść w okolice studni i zostać tam zablokowani.

### Zakres

Sprawdzić rzeczywisty mechanizm ruchu NPC i ustalić konkretną przyczynę blokowania.

Naprawić problem w istniejącym systemie ruchu/unikania przeszkód.

Nie tworzyć specjalnego rozwiązania tylko dla studni, jeżeli przyczyną jest ogólny problem pathfindingu lub local avoidance.

### Weryfikacja

- jeden NPC korzystający ze studni,
- wielu NPC jednocześnie,
- NPC otoczeni przez innych NPC,
- NPC potrafiący opuścić obszar studni.

## 2. Szybkie interakcje z przedmiotami

### Problem

Niektóre czynności wymagają niepotrzebnych dodatkowych kroków.

Przykład:

`pomidor → E: podnieś → R: zjedz`

### Zakres

Dla przedmiotów znajdujących się w świecie, które mogą być natychmiast użyte, pokazywać kontekstową akcję.

Przykład:

`[E] Podnieś · [R] Zjedz`

`R` powinno wykonać istniejący flow:

`pickup → inventory → use`

Nie tworzyć osobnego systemu quick-use.

## 3. Harvest martwego zwierzęcia z nożem w inventory

### Problem

Obecnie gracz musi najpierw wyjąć nóż do ręki.

### Zakres

Jeżeli:

- zwierzę jest martwe,
- może być zebrane,
- nóż znajduje się w inventory,

to interakcja `Wytnij mięso` jest dostępna również wtedy, gdy nóż nie jest aktualnie trzymany.

Po wyborze:

`interakcja → equip knife → istniejący harvest`

Wykorzystać istniejący `HeldTool`, inventory oraz harvest flow.

## 4. Health i leczenie

### Problem

HP nie regenerują się. Brakuje podstawowych źródeł leczenia.

### Zakres

Dodać:

- lekką naturalną regenerację HP,
- apteczkę / lekarstwo,
- zioła jako źródło leczenia.

Wykorzystać istniejący system health i inventory/itemów.

Wartości leczenia i regeneracji powinny być centralnie konfigurowalne.

Nie tworzyć osobnego systemu health items.

## 5. Quest „Wypatrz jelenia”

### Problem

Quest jest trudny, ponieważ jeleń ucieka zanim gracz zdąży wejść w wymagany zasięg.

### Zakres

Lekko zwiększyć zasięg/tolerancję interakcji dla celu tego questa.

Preferowane rozwiązanie:

- nie zwiększać globalnego `INTERACT_RANGE`,
- wykorzystać istniejący mechanizm targetowania/interakcji,
- zastosować większy zakres tylko dla odpowiedniego objective.

Nie zmieniać AI jelenia tylko po to, aby ułatwić quest.

## 6. Badge aktywnej umiejętności

### Problem

Gracz nie zawsze wie, jaka umiejętność jest obecnie aktywna.

### Zakres

Pokazywać aktywną umiejętność bezpośrednio w HUD.

Badge powinien:

- być stale dostępny,
- jasno wskazywać aktywną umiejętność,
- aktualizować się po zmianie,
- nie zajmować dużo miejsca na mobile.

Wykorzystać istniejący stan aktywnej umiejętności.

**Reuse (plan 105, 2026-08-18):** przycisk HUD Umiejętności (`SkillsHudButton`, emerald gdy sneak aktywny) już pokazuje aktywną umiejętność i otwiera ekran. Nie dodawać drugiego badge’a — najwyżej reuse tego przycisku.

## 7. Cycling między kandydatami interakcji

### Problem

W zatłoczonych miejscach, np. przy studni, kilku NPC może znajdować się przed właściwym obiektem.

Obecny wybór pojedynczego najlepszego kandydata może utrudniać wskazanie obiektu.

### Zakres

Dodać możliwość przełączania się między kandydatami interakcji:

`TAB → następny kandydat`

System powinien korzystać z istniejącej listy kandydatów interakcji.

### UI

Przycisk cycling powinien być **widoczny tylko wtedy, gdy system wykryje więcej kandydatów, pomiędzy którymi warto umożliwić przełączanie**.

Przy jednym sensownym kandydacie przycisk nie powinien być widoczny.

### Ważne

Dokładne kryterium „zbyt dużo obiektów” należy oprzeć na istniejącym target/interactable selection, zamiast wprowadzać arbitralny globalny próg bez sprawdzenia obecnego UX.

Nie tworzyć drugiego systemu targetowania.

## 8. Quest labels przy NPC

### Problem

Status questa przy NPC jest obecnie zbyt mało czytelny.

### Zakres

Rozróżnić wizualnie trzy stany:

- **Quest available**
- **Quest in progress**
- **Quest completed**

Każdy stan powinien mieć inny, jednoznaczny symbol/ikonę.

Label powinien pozwalać szybko rozpoznać stan bez otwierania dialogu.

Nie opierać rozróżnienia wyłącznie na kolorze — symbol powinien również przekazywać znaczenie.

## 9. Dialog NPC zależny od statusu questa

### Problem

NPC obecnie używa tekstu `Czy mogę pomóc?` nawet po zakończeniu zadania.

### Zakres

Dialog powinien uwzględniać aktualny status questa.

Przykładowo:

- **Quest available:** `Czy mogę pomóc?`
- **Quest in progress:** dialog powinien odnosić się do aktualnie wykonywanego zadania,
- **Quest completed:** np. `Hej! Udało się!` albo `Zakończyłem zadanie.`

Teksty powinny wynikać z rzeczywistego stanu questa, a nie z samego faktu rozmowy z NPC.

Nie tworzyć osobnego systemu dialog state — wykorzystać istniejący quest state.

## 10. Inventory — kategorie

### Problem

Przy większej liczbie itemów trudno znaleźć konkretny przedmiot. Szczególnie broń, jedzenie i narzędzia wymagają przewijania całego inventory.

### Zakres

Dodać kategorie inventory.

Minimalny zestaw powinien obejmować istniejące typy itemów, np.:

- **All**
- **Weapons**
- **Tools**
- **Food**
- **Materials**
- **Consumables**
- pozostałe kategorie wynikające z istniejącego item catalog.

Kategorie powinny być generowane z istniejących definicji itemów, a nie utrzymywane jako drugi ręczny podział.

### UX mobile

Kategorie powinny być łatwe do przełączania bez dużego zajmowania ekranu.

## 11. Inventory — sortowanie

### Problem

Nawet po dodaniu kategorii kolejność itemów może utrudniać korzystanie z inventory.

### Zakres

Dodać sortowanie według istniejących danych itemów.

Przydatne opcje:

- nazwa,
- typ/kategoria,
- ilość,
- ewentualnie ostatnio dodane.

Nie tworzyć duplikatu danych potrzebnych do sortowania.

Domyślne sortowanie powinno być ustalone tak, aby najczęściej używane itemy były łatwe do znalezienia.

## Poza zakresem

### Combat

Nie zmieniać obecnego systemu walki ani targetowania combat.

Osobne zadanie zostanie poświęcone:

- Combat Mode,
- lock target,
- priorytetowi combat nad zwykłą interakcją,
- przypadkowym atakom NPC,
- interakcjom z drzewami podczas walki.

### Target selection

Cycling jest częścią tego planu.

Nie projektujemy tutaj pełnego redesignu targetowania NPC/OBJECT. Jeżeli implementacja pokaże, że obecny model kandydatów wymaga większej przebudowy, zatrzymać się i wydzielić osobny temat.

#### New suggestion

Klauwisz `Tab` działa tylko na NCP/animals. Nie działa na non-living targets (drzewa, przedmioty).
Kombinacja `Tab+Shift` działa na non-living targets.
To będzie użyte w następnym planie `2026-08-18--150--combat-mode-defense-and-downed-state.md` w ramach combat mode. Nie musimy od razu implementować animal target cycling - na początek możemy zrobić to tylko dla NPC. Ale decyzję pozostawiam agentowi, aby zrobił tak jak będzie lepiej.


## Kolejność implementacji

1. NPC / studnia
2. szybkie interakcje itemów
3. nóż + harvest
4. health + healing
5. quest „Wypatrz jelenia”
6. quest labels
7. dialog NPC zależny od statusu questa
8. inventory categories
9. inventory sorting
10. cycling kandydatów
11. active skill badge

Najpierw mechaniki, potem UI.

## Weryfikacja

Techniczna:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Manualnie/mobile:

- NPC nie blokują się przy studni,
- pomidor można podnieść i szybko zjeść,
- nóż w inventory pozwala od razu wyciąć mięso,
- HP regenerują się,
- można użyć środków leczniczych,
- quest z jeleniem jest wykonalny bez idealnego ustawienia,
- aktywna umiejętność jest widoczna,
- cycling pojawia się tylko przy wielu kandydatach,
- cycling pozwala wybrać studnię spośród NPC,
- quest available/in progress/completed mają różne symbole,
- dialog NPC zmienia się wraz ze statusem questa,
- inventory można filtrować kategorią,
- inventory można sortować,
- Combat pozostaje bez zmian.

## Kryterium zakończenia

Wszystkie problemy objęte planem są rozwiązane poprzez rozszerzenie istniejących systemów.

Nie powstają równoległe mechanizmy:

- interakcji,
- quest state,
- inventory categories,
- health,
- target selection.

Combat pozostaje osobnym zadaniem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

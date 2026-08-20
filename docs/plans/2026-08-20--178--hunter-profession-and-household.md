# Plan: Hunter Profession & Household

**Created:** 2026-08-20  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** L  
**Depends on:** ~~177~~ ~~162~~ ~~159~~ ~~175~~

domain: settlements-npcs
tags: [fauna, economy, items-player, food]

## 1. Cel

Dodać profesję **myśliwego** oraz gospodarstwo domowe wyspecjalizowane w polowaniu, produkcji łuków i strzał oraz przetwarzaniu i sprzedaży pozyskanych zasobów.

Plan zakłada dostępność systemu NPC Combat z planu 177. Myśliwy wykorzystuje istniejące mechanizmy NPC, fauna, inventory, household, storage, economy i cooking.

Nie tworzyć równoległych systemów dla tych funkcji.

## 2. Profesja `hunter`

Profesja określa główny wkład NPC w gospodarkę:

1. polowanie,
2. przygotowanie wypraw,
3. produkcja łuków i strzał,
4. przetwarzanie i zagospodarowanie zdobyczy,
5. sprzedaż nadwyżek,
6. pomocnicze prace gospodarcze.

Profesja nie wyłącza potrzeb osobistych NPC. Myśliwy nadal musi jeść, pić, odpoczywać, realizować relacje itd.

Może również wykonywać pomocniczo:
- zbieranie drewna potrzebnego do produkcji,
- zbieranie warzyw ze wspólnego ogrodu,
- podstawowe czynności gospodarstwa.

Nie tworzyć osobnego `HunterSystem` ani schedulera.

## 3. Wyprawa na polowanie

Myśliwy podejmuje wyprawę jako rzeczywistą aktywność NPC, zajmującą czas świata.

Przed wyprawą przygotowuje:

- łuk,
- **10–20 strzał**,
- nóż,
- bukłak z wodą,
- prowiant,
- opatrunek.

Wyprawa korzysta z istniejącego inventory, potrzeb, ruchu i NPC Combat.

Preferowane cele:

- zając,
- sarna,
- jeleń,
- dzik.

Myśliwy może pozyskać **maksymalnie 1–3 zwierzęta podczas jednej wyprawy**.

Może zakończyć wyprawę wcześniej, np. po osiągnięciu wystarczającej zdobyczy lub gdy dalsza wyprawa nie jest możliwa.

## 4. Ochrona populacji

Wybór celu wykorzystuje istniejący stan populacji spawn pointów.

Jeżeli dany spawn point ma **dokładnie jedno żywe zwierzę**:

- istnieje **50% szans na pominięcie tego celu**,
- myśliwy próbuje znaleźć alternatywny cel,
- jeżeli nie ma odpowiedniej alternatywy, może zakończyć wyprawę bez zabicia zwierzęcia.

Mechanizm nie tworzy nowego systemu ekologicznego. Wykorzystuje istniejący stan populacji zwierząt.

## 5. Rezultaty polowania

Polowanie może dostarczyć:

- mięso,
- skórę.

Skóra staje się normalnym zasobem/inventory itemem.

Na tym etapie:
- może być przechowywana,
- może być sprzedawana,
- nie ma jeszcze zastosowania produkcyjnego.

Przyszłe wykorzystanie skóry nie należy do tego planu.

## 6. Gospodarstwo i dom

Myśliwy i żona tworzą normalne gospodarstwo domowe.

Dom myśliwego posiada:

- **ognisko**,
- **ruszt**.

Ruszt wykorzystuje mechanizmy planu **175 — Cooking Vessels, Grates and Iron Rods**.

Nie tworzyć osobnego systemu gotowania dla myśliwych.

## 7. Żona myśliwego

Żona jest zwykłym NPC z własnymi potrzebami i zachowaniami.

W ramach gospodarstwa może:

- piec mięso,
- suszyć mięso,
- przygotowywać żywność,
- zarządzać pracami gospodarstwa,
- zbierać warzywa ze wspólnego ogrodu.

Pieczenie korzysta z rusztu i istniejącego systemu gotowania.

Suszenie korzysta z mechanizmów planu **159 — Natural Food, Fishing, Preservation and Bait**.

### Ogród

Nie tworzyć prywatnego ogrodu gospodarstwa.

Rodzina korzysta z **istniejącego wspólnego ogrodu wioski**, tak jak inni mieszkańcy.

## 8. Produkcja łuków i strzał

Myśliwy produkuje łuki i strzały z drewna.

Produkcja ma dwa cele:

1. zapewnienie gospodarstwu wyposażenia potrzebnego do polowania,
2. wytworzenie nadwyżki przeznaczonej na sprzedaż.

Gospodarstwo utrzymuje **minimalny zapas potrzebny do własnych wypraw**. Produkcja ponad ten poziom trafia do sprzedaży.

Dzięki temu produkcja myśliwego regularnie generuje towary handlowe, zamiast być wyłącznie produkcją na własny użytek.

Wykorzystać istniejące mechanizmy itemów, inventory, craftingu/produkcji i handlu.

## 9. Przetwarzanie mięsa

Przepływ mięsa:

```text
polowanie
  ↓
mięso
  ├─→ świeże jedzenie
  ├─→ pieczenie na ruszcie
  ├─→ suszenie
  ├─→ zapasy gospodarstwa
  └─→ sprzedaż nadwyżki
```

Żona nie otrzymuje specjalnego „hunter cooking AI”. Korzysta z istniejących mechanizmów gotowania i household.

## 10. Sprzedaż

Gospodarstwo może regularnie dostarczać do handlu:

- mięso,
- przetworzone/suszone mięso,
- łuki,
- strzały,
- skóry.

Sprzedaż korzysta z istniejącego systemu handlu i ekonomii.

Nie tworzyć osobnego systemu sprzedaży myśliwego.

Nadwyżka produkcji łuków i strzał powinna być utrzymywana jako rzeczywisty zapas handlowy gospodarstwa.

## 11. Opatrunki

Na początku gospodarstwo myśliwego otrzymuje:

**5 × opatrunek**

Myśliwy zabiera opatrunek na wyprawę.

Późniejsze uzupełnianie zapasu nie jest specjalnym mechanizmem tego planu.

W przyszłości źródłem opatrunków mogą być:

```text
Kupiec → zakup

lub

zioła → żona / zielarz / lekarz → opatrunek
```

Ten plan nie implementuje jeszcze produkcji opatrunków przez żonę, zielarza ani lekarza.

## 12. Główny cykl życia

```text
                 GOSPODARSTWO MYŚLIWEGO
                          │
             ┌────────────┴────────────┐
             │                         │
          MYŚLIWY                     ŻONA
             │                         │
       przygotowanie               gospodarstwo
       wyprawy                         │
             │                         ├─→ gotowanie
             ▼                         ├─→ suszenie
         POLOWANIE                     └─→ warzywa
             │
       ┌─────┴─────┐
       ▼           ▼
     mięso        skóra
       │           │
       │           └─→ sprzedaż
       │
       ├─→ świeże jedzenie
       ├─→ ruszt
       ├─→ suszenie
       ├─→ zapasy
       └─→ sprzedaż

drewno
  ↓
łuki / strzały
  ├─→ zapas własny
  └─→ nadwyżka → sprzedaż
```

## 13. Integracja z istniejącymi systemami

Plan powinien rozszerzać istniejące mechanizmy:

- NPC profession / Schedule / FSM,
- NPC needs,
- household,
- inventory / item instances,
- NPC Combat z planu 177,
- fauna i spawn points,
- hunting loot,
- storage,
- cooking,
- food preservation,
- village garden,
- economy / trading.

Nie tworzyć równoległych wersji tych systemów.

## 14. Poza zakresem

- implementacja NPC Combat,
- nowy system fauna/populacji,
- osobny system Hunter AI,
- osobny scheduler myśliwych,
- prywatny ogród gospodarstwa,
- nowy system gotowania,
- nowy storage,
- nowa ekonomia,
- leatherworking,
- dalsze zastosowanie skóry,
- pełny system produkcji opatrunków,
- system zielarza/lekarza,
- nowe mechanizmy handlu.

## 15. Kryterium sukcesu

Wioska może posiadać gospodarstwo myśliwego, którego działalność naturalnie tworzy zamknięty łańcuch:

**przygotowanie → wyprawa → polowanie → mięso/skóra → powrót → przechowywanie/przetwarzanie → konsumpcja/sprzedaż → produkcja łuków i strzał → uzupełnienie własnego zapasu + stała nadwyżka handlowa → kolejna wyprawa.**

Rodzina nadal korzysta ze wspólnych zasobów wioski i uczestniczy w normalnym życiu NPC, ale **polowanie pozostaje głównym wkładem zawodowym myśliwego**.

## 16. Verification

Po implementacji należy wykonać standardowe sprawdzenia projektu zgodnie z `CLAUDE.md`, w szczególności testy, typecheck/lint/build odpowiednie dla zmienionych systemów.

Należy zweryfikować integrację Hunter z NPC action/combat lifecycle, inventory, fauna, household, cooking i economy.

Jeżeli zmiany obejmują zachowanie Three.js/animacji, potrzebna będzie również odpowiednia weryfikacja browser/gameplay.

> Zrób git commit i push do main, rebase jeżeli trzeba

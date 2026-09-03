# Plan — World Observatory

**Status:** `planned`
**Type:** infrastructure
**Created:** 2026-08-11
**Priority:** ⚪ low · **Effort:** XL · **Depends on:** ~~071~~, ~~069~~  
**Domain:** `tools`  
**Depends on:** none  

## Cel

Gracz powinien mieć możliwość obserwowania życia świata nie tylko z perspektywy swojej postaci.

Seedvale powinno oferować dwa uzupełniające się sposoby poznawania świata:

1. **obserwacja bezpośrednia** — eksploracja, rozmowy, oglądanie domów i gospodarstw;
2. **obserwacja systemowa** — dedykowany panel pokazujący stan i rozwój świata.

Panel nie powinien być traktowany wyłącznie jako narzędzie debugowania. Docelowo może być częścią gry jako **World Observatory** — narzędzie pozwalające zrozumieć funkcjonowanie świata.

## 1. Obserwacja świata przez gracza

Gracz może zdobywać informacje poprzez:

- rozmowy z NPC;
- pytanie NPC o sytuację rodziny;
- odwiedzanie domów;
- oglądanie zapasów;
- obserwowanie pracy NPC;
- badanie gospodarstw;
- obserwowanie zmian zachodzących w osadzie.

NPC może odpowiadać na podstawie rzeczywistego stanu gospodarstwa, np. informować o zapasach żywności, drewnie lub wodzie.

Panel nie powinien zastępować świata fizycznego.

## 2. World Observatory

Dedykowany panel powinien pozwalać obserwować świat z poziomu systemów symulacji.

Główne obszary:

```text
WORLD
├── Settlements
├── Households
├── NPCs
├── Economy
├── Resources
├── Animals
└── Events
```

## 3. Osady

Widok osady powinien pokazywać m.in.:

- populację;
- liczbę rodzin;
- liczbę domów;
- dostępne zasoby;
- produkcję;
- konsumpcję;
- magazyny;
- zawody;
- zwierzęta gospodarskie;
- problemy i zagrożenia;
- trendy rozwoju.

Przykład:

```text
Oak Village

Population       42
Households       11
Food             182
Water            96
Wood             74

Food/day         +24 / -19
Wood/day         +18 / -15

Status           Stable
```

## 4. Gospodarstwa i rodziny

Widok osady powinien umożliwiać zejście poziom niżej:

```text
Settlement
    ↓
Household
    ↓
Family
    ↓
NPC
```

Gospodarstwo powinno pokazywać:

- członków rodziny;
- dom;
- zapasy;
- limity pojemności;
- zwierzęta;
- produkcję;
- konsumpcję;
- sytuację ekonomiczną;
- aktualne problemy.

Przykład:

```text
Kowalski Household

Members: 4
Wood:    8 / 10
Food:    6 / 10
Water:   4 / 8
Animals: 5

Food:    ⚠ Low
Wood:    ✓ Stable
Water:   ✓ Stable
```

## 5. NPC

Widok NPC powinien umożliwiać obserwowanie jego aktualnego stanu:

- wiek;
- zawód;
- rola;
- potrzeby;
- harmonogram;
- aktualne działanie;
- gospodarstwo;
- rodzina;
- relacje;
- reputacja;
- historia istotnych wydarzeń.

## 6. Zasoby i gospodarka

Panel powinien umożliwiać obserwowanie przepływu zasobów, a nie tylko ich aktualnej wartości:

- produkcja;
- konsumpcja;
- transport;
- magazynowanie;
- niedobory;
- trendy.

Przykład:

```text
Food

Production     +24/day
Consumption    -19/day
Net            +5/day
Storage        182

Trend          ↑ Stable
```

Później można pokazywać całe łańcuchy:

```text
grain
  ↓
flour
  ↓
bread
  ↓
food
  ↓
households
```

## 7. Wykresy i trendy

Panel powinien umożliwiać analizowanie zmian w czasie.

Przykładowe wykresy:

- populacja;
- liczba rodzin;
- zapasy żywności;
- produkcja drewna;
- zużycie wody;
- liczba zwierząt;
- narodziny;
- śmierć;
- migracja;
- rozwój osady.

Istotne są przede wszystkim **trendy**, np. czy zapasy rosną, maleją lub pozostają stabilne.

## 8. Problemy i zdarzenia

Panel powinien wskazywać istotne wydarzenia symulacji.

Przykładowo:

```text
⚠ 3 households have low food
⚠ Wood production below consumption
⚠ Wolf activity near settlement
✓ New child born
✓ New household created
✓ Grain harvest completed
```

Pozwala to szybko znaleźć miejsca, w których świat zaczyna zachowywać się interesująco lub nieprawidłowo.

## 9. Fauna

Docelowo panel powinien również pozwalać obserwować ekosystem:

- populacje gatunków;
- liczba stad;
- terytoria;
- trasy;
- źródła wody;
- żerowiska;
- drapieżniki;
- ofiary;
- trendy populacji.

Przykład:

```text
Wolves
Population: 7
Territories: 2
Recent kills: 4
Settlement encounters: 1
```

## 10. Relacje i reputacja

Panel powinien umożliwiać obserwowanie sieci społecznej:

```text
Village
  ↓
Family
  ↓
NPC
  ↓
Relationships
```

Możliwe widoki:

- relacje między NPC;
- rodziny;
- przyjaźnie;
- konflikty;
- reputacja;
- więzi między rodzinami;
- relacje między osadami.

Docelowo można wizualizować je jako graf społeczny.

## 11. Zasada projektowa

World Observatory powinien **czytać stan symulacji**, a nie tworzyć równoległy stan świata.

Panel:

- nie powinien posiadać własnej logiki symulacji;
- nie powinien przechowywać duplikatów danych;
- powinien korzystać z istniejących systemów;
- powinien prezentować rzeczywisty stan świata.

Rozwój panelu powinien następować równolegle z rozwojem systemów symulacji.

## 12. Docelowa hierarchia

```text
WORLD
 │
 ├── Settlements
 │    │
 │    ├── Households
 │    │    ├── Members
 │    │    ├── Resources
 │    │    └── Animals
 │    │
 │    ├── Resources
 │    ├── Production
 │    └── Population
 │
 ├── NPCs
 │    ├── Needs
 │    ├── Jobs
 │    ├── Schedules
 │    ├── Families
 │    └── Relationships
 │
 ├── Economy
 │    ├── Resources
 │    ├── Production
 │    ├── Consumption
 │    └── Trade
 │
 ├── Animals
 │    ├── Species
 │    ├── Populations
 │    ├── Territories
 │    └── Routes
 │
 └── Events
      ├── Births
      ├── Deaths
      ├── Conflicts
      ├── Threats
      └── Other events
```

## Kryterium sukcesu

Gracz powinien móc rozpocząć od całej osady i stopniowo zejść do szczegółu:

**Świat → osada → rodzina → gospodarstwo → NPC → potrzeba → działanie → zasób → wydarzenie.**

Jednocześnie powinien móc przejść w drugą stronę i zobaczyć, jak działania pojedynczych NPC wpływają na rodzinę, osadę i cały świat.

World Observatory ma być przede wszystkim **oknem na żyjący świat Seedvale**.

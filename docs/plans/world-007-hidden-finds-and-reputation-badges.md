# Plan: Hidden Finds & Reputation Badges

**Created:** 2026-08-31
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `world`

**Subdomains:** `landmarks` `digging` `reputation` `achievements`
**Tags:** `hidden-finds` `treasure` `cemetery`

## Cel

Uogólnić istniejący mechanizm ukrytego skarbu do systemu **Hidden Finds**, który pozwala odkrywać ukryte przedmioty podczas zwykłego kopania w określonych miejscach świata.

Pierwszym pełnym zastosowaniem będzie cmentarz. Gracz nie otrzymuje żadnej informacji, że grób można rozkopać. Musi samodzielnie odkryć mechanikę poprzez kopanie łopatą w odpowiednich miejscach.

System powinien być przygotowany tak, aby kolejne landmarki mogły posiadać własne typy ukrytych znalezisk bez tworzenia osobnych mechanizmów.

Równolegle dodać trwałe **Reputation Badges / Achievements**, które zapisują istotne zachowania gracza i są prezentowane w menu.

## Założenia

### Kopanie

- Nie dodawać interakcji na nagrobkach.
- Nie dodawać promptu typu `Rozkop grób`.
- Nie dodawać widocznych markerów Hidden Find.
- Gracz korzysta z istniejącej akcji `soil_digging`.
- Podczas kopania system sprawdza, czy punkt kopania znajduje się w zasięgu ukrytego dig spotu.
- Mechanizm ma działać analogicznie do obecnego Hidden Treasure, ale zostać uogólniony.

### Hidden Find

Hidden Find jest logicznym stanem przypisanym do landmarku / jego ukrytych miejsc, a nie osobnym interactable.

Każdy dig spot posiada deterministyczny wynik:

```
undiscovered
    ↓
dig
    ↓
resolved
    ├── empty
    └── found item/coins
```

Po rozwiązaniu spot nie może zostać ponownie wylosowany.

# 1. Uogólnienie istniejącego Hidden Treasure

Zidentyfikować obecny mechanizm `hiddenTreasure` i rozszerzyć go zamiast tworzyć równoległy system.

Nowy mechanizm powinien obsługiwać różne profile Hidden Find.

Profil powinien móc określać co najmniej:

- typ landmarku,
- sposób generowania miejsc,
- liczbę potencjalnych miejsc,
- szansę na znalezienie,
- loot profile,
- maksymalną liczbę znalezisk,
- ewentualne konsekwencje odkrycia.

Istniejący przypadek Treasure powinien zostać zachowany funkcjonalnie po migracji.

Nie zmieniać mechaniki zwykłego kopania poza dodaniem wspólnego resolvera Hidden Finds.

# 2. Deterministyczne dig spots

Dig spots muszą być deterministyczne.

Ich generowanie powinno zależeć od stabilnych danych świata, np.:

```
world seed
+ landmark identity
+ spot index
```

Nie używać bieżącego `Math.random()` przy każdym kopaniu.

Dzięki temu:

- reload nie zmienia wyniku,
- save/load nie zmienia wyniku,
- ponowne wejście na obszar nie zmienia wyniku,
- wynik może być bezpiecznie zapisany jako resolved state.

Pozycje spotów powinny być generowane przy landmarku, bez tworzenia widocznych obiektów interakcji.

# 3. Cmentarz

Cmentarz jest pierwszym dużym zastosowaniem Hidden Finds.

### Nagrobki

Wykorzystać istniejące nagrobki jako informację o strukturze cmentarza.

Liczba nagrobków wpływa na liczbę potencjalnych dig spots.

Przykładowo:

```
mały cmentarz
  → kilka potencjalnych miejsc

średni cmentarz
  → więcej miejsc

duży cmentarz
  → jeszcze więcej miejsc
```

Dokładny wzór należy dobrać na podstawie rzeczywistego generatora cmentarzy.

Nie zakładać automatycznie:

```
1 grave = 1 loot
```

Nie każdy spot musi coś zawierać.

### Niezależne miejsca

Cmentarz nie posiada jednego wspólnego lootu.

Każdy spot jest rozpatrywany niezależnie:

```
dig spot A → empty
dig spot B → coins
dig spot C → empty
dig spot D → item
```

Gracz może więc kopać w różnych miejscach cmentarza i stopniowo odkrywać znaleziska.

### Limit ekonomiczny

Liczba potencjalnych znalezisk powinna być ograniczona, aby cmentarz nie stał się prostą farmą pieniędzy.

W razie potrzeby zastosować osobny `maxFinds` zależny od wielkości cmentarza.

# 4. Loot zależny od najbliższej osady

Potencjał lootu cmentarnego zależy od najbliższej osady, a nie tylko od liczby grobów.

Wykorzystać istniejące dane settlementu i jego wielkość/rozwój.

Ogólna zasada:

```
small settlement
    → common items + small coin amounts

medium settlement
    → better item pool + more coins

large settlement
    → richer item pool + larger coin amounts
```

Nie tworzyć nowej równoległej metryki „wealth”, jeżeli istniejący model osady może zostać wykorzystany.

Dokładne wartości loot tables pozostawić w konfiguracji.

Cmentarz może przy małej osadzie dawać bardzo skromne znaleziska, natomiast cmentarz dużej osady może posiadać ciekawsze przedmioty.

# 5. Inne landmarki

System powinien od razu umożliwiać definiowanie Hidden Finds dla innych landmarków.

Pierwsze przypadki:

| Landmark | Szansa | Model |
|---|---:|---|
| cemetery | specjalny | wiele niezależnych dig spots |
| stone circle | 25% | jeden potencjalny skarb |
| stone pillar / monolith | 10% | jeden potencjalny skarb |
| ruins | TBD | potencjalne ukryte znalezisko |

### Ważne

Dla zwykłych landmarków takich jak `stoneCircle`:

> `25%` oznacza 25% szansy, że **cały landmark posiada jeden Hidden Find**.

Nie oznacza 25% dla każdego potencjalnego miejsca.

Jeżeli landmark otrzyma Hidden Find, jego konkretna pozycja powinna być wybrana deterministycznie.

Dzięki temu:

```
stone circle
  25% → treasure exists
       ↓
  deterministic dig position
```

Cmentarz jest wyjątkiem, ponieważ jego celem jest możliwość kopania w wielu miejscach.

# 6. Reputacja

Kopanie na cmentarzu ma negatywną konsekwencję społeczną.

Sama próba/naruszenie miejsca grobu jest przewinieniem:

```
dig grave spot
    ↓
negative standing
```

Kara nie zależy od tego, czy znaleziono loot.

Nie tworzyć nowego globalnego systemu reputacji, jeśli istniejący `relations` / `player standing` może zostać wykorzystany.

Pierwsza wersja nie musi jeszcze implementować:

- świadków,
- lokalnych plotek,
- NPC reagujących na bieżąco,
- stealth,
- różnicowania kary zależnie od pory dnia.

Architektura powinna jednak nie blokować późniejszego dodania tych mechanizmów.

# 7. Reputation Badges / Achievements

Dodać trwały system odznak opisujących historię działań gracza.

Pierwsze przypadki:

### `Grave Robber`

Zdobywane po pierwszym naruszeniu grobu.

### `Desecrator`

Zdobywane po przekroczeniu określonej liczby naruszonych grobów.

### `Treasure Hunter`

Zdobywane po znalezieniu określonej liczby Hidden Finds.

### `Relic Seeker`

Zdobywane po znalezieniu odpowiednio rzadkiego / specjalnego przedmiotu.

Badge nie jest nagrodą ekonomiczną ani XP.

Jest trwałym zapisem:

> „To jest coś, co gracz zrobił w świecie.”

Achievements mogą być zarówno pozytywne, jak i negatywne.

# 8. Ukryte achievements

Nie wszystkie achievements muszą być ujawnione przed ich zdobyciem.

Przed odkryciem UI nie powinno zdradzać:

- pełnej nazwy,
- warunku,
- charakteru ukrytego achievementu.

Po zdobyciu badge pokazuje pełną nazwę i opis.

Pozwala to wykorzystać system również do odkrywania nietypowych zachowań.

# 9. Menu gracza

Dodać prezentację zdobytych badges w istniejącym menu gracza.

Minimalny zakres:

```
PLAYER

Standing
Neutral

Badges

🪦 Grave Robber
💰 Treasure Hunter
```

Nie tworzyć osobnego dużego systemu UI tylko dla tego planu.

Wykorzystać istniejącą strukturę menu.

UI ma pokazywać trwały stan, a nie bieżące wyniki losowania Hidden Finds.

# 10. Persistence

Persistentny musi być stan:

- rozwiązanych dig spots,
- zdobytych badges,
- wymaganych danych achievement progress, jeżeli nie można ich bezpiecznie wyliczyć z istniejącego stanu.

Nie zapisywać danych, które można deterministycznie odtworzyć z:

```
world seed
+ landmark identity
+ spot index
```

Save/load nie może zmieniać wyników Hidden Finds.

# 11. Integracja z istniejącymi systemami

Przed implementacją wykonać focused recon i wykorzystać istniejące mechanizmy:

- `soil_digging`,
- `groundActions`,
- obecny Hidden Treasure,
- landmark generation,
- cemetery generation,
- inventory/items,
- settlement size/development,
- `QuestManager` / relations / player standing,
- persistence,
- player menu.

Nie tworzyć:

- drugiego systemu kopania,
- interakcji `Grave`,
- osobnego systemu reputacji,
- osobnego systemu landmarków,
- równoległego inventory/loot systemu.

# 12. Non-goals

Poza zakresem:

- NPC świadkowie,
- stealth,
- wykrywanie przez NPC,
- lokalne plotki,
- specjalne reakcje NPC na badges,
- pełny globalny system reputacji,
- archeologia,
- questy związane z Hidden Finds,
- specjalna animacja rozkopywania grobu,
- widoczne oznaczenia dig spots.

# 13. Verification

Sprawdzić manualnie:

### Cmentarz

- nagrobek nie posiada interakcji „Rozkop grób”,
- nie ma markera informującego o Hidden Find,
- zwykłe kopanie łopatą działa bez zmian,
- kopanie w odpowiednim miejscu może ujawnić znalezisko,
- różne miejsca mają niezależne wyniki,
- nie każdy spot musi coś zawierać,
- rozwiązany spot nie daje ponownie lootu,
- większy cmentarz posiada odpowiednio większy potencjał Hidden Finds,
- cmentarz nie generuje nieograniczonego lootu.

### Settlement loot scaling

- mała osada daje odpowiednio skromny loot,
- większa osada może generować bogatszy loot,
- wynik jest deterministyczny.

### Inne landmarki

- stone circle ma 25% deterministycznej szansy na jeden Hidden Find,
- monolith/pillar ma 10% szansy,
- znalezienie następuje przez zwykłe kopanie,
- nie powstaje wiele skarbów tylko dlatego, że landmark ma wiele potencjalnych pozycji.

### Persistence

- save/load zachowuje rozwiązane dig spots,
- save/load zachowuje badges,
- reload nie zmienia wyników,
- ten sam seed daje te same Hidden Finds.

### Reputation

- naruszenie grobu zmniejsza standing,
- brak lootu nie usuwa konsekwencji,
- zwykłe Hidden Finds w innych landmarkach nie powodują automatycznie kary.

### Badges

- pierwszy grave robbery nadaje `Grave Robber`,
- kolejne naruszenia mogą zwiększać progress do kolejnych badges,
- zdobyty badge jest persistentny,
- badge pojawia się w menu,
- ukryty badge nie ujawnia warunku przed odkryciem.

# 14. Kolejność implementacji

1. Recon istniejącego Hidden Treasure i wszystkich punktów integracji.
2. Zaprojektowanie wspólnego modelu Hidden Find.
3. Uogólnienie obecnego Treasure.
4. Dodanie deterministycznych dig spots.
5. Integracja z istniejącym `soil_digging`.
6. Implementacja profilu `cemetery`.
7. Dodanie settlement-based loot scaling.
8. Dodanie profili `stoneCircle`, `monolith` i ewentualnie `ruins`.
9. Integracja konsekwencji reputacyjnej cmentarza.
10. Implementacja Reputation Badges / Achievements.
11. Persistence.
12. UI badges.
13. Automated checks.
14. Manual browser verification.

**Zrób git commit i push do main, rebase jeżeli trzeba**

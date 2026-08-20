# Plan: Garden and Field Maintenance

**Created:** 2026-08-20
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~174~~ ~~126~~
**domain:** `settlements-npcs`
**tags:** [items-player, world-terrain]

## Cel

Dodać wspólny mechanizm utrzymania grządek i pól uprawnych.

Każda grządka/pole posiada stan określający jego zadbanie. Stan pogarsza się z czasem, wpływa na produktywność upraw, a przy długotrwałym zaniedbaniu prowadzi do usunięcia grządki/pola.

Mechanizm ma być wspólny dla gracza i NPC.

Nie tworzyć `GardenManager`, `FarmManager` ani osobnego systemu AI.

## 1. Stan utrzymania

Grządka/pole otrzymuje stan utrzymania, np.:

```ts
care: number // 0..100
lastMaintainedAt: number
```

Stan może być wyliczany lazy na podstawie czasu, zamiast zmniejszania wartości co tick.

Przykładowe poziomy:

```text
Zadbane
↓
Zaniedbane (< 50%)
↓
Mocno zaniedbane
↓
Usunięte
```

Dokładne tempo degradacji oraz pozostałe progi należy dobrać podczas implementacji.

## 2. Degradacja pola

Pole/grządka powinno pogarszać się naturalnie wraz z upływem czasu.

Przykład:

```text
ostatnie uporządkowanie
        ↓
      czas
        ↓
spadek care
        ↓
kolejne poziomy zaniedbania
        ↓
przy długim zaniedbaniu usunięcie grządki/pola
```

Nie wykonywać per-frame aktualizacji wszystkich pól.

Stan powinien być możliwy do wyliczenia na podstawie czasu ostatniego utrzymania i parametrów degradacji.

Po osiągnięciu stanu końcowego grządka/pole jest **usuwana jako world object**. Nie ma osobnego stanu `abandoned`.

Po usunięciu gracz może zbudować nową grządkę/pole w odpowiednim miejscu zgodnie z istniejącym placement systemem.

## 3. Wpływ na cropy

Stan pola powinien wpływać na crop lifecycle z `172`, ale nie tworzyć drugiego lifecycle.

Przykładowo:

```text
Zadbane
→ normalny wzrost / plon

Zaniedbane
→ zmniejszona produktywność

Mocno zaniedbane
→ dalsze ograniczenie produkcji
```

Dokładny sposób wpływu należy zintegrować z istniejącym `CropLifecycle`.

Nie kopiować ani nie tworzyć osobnej logiki wzrostu.

## 4. Utrzymanie

Na grządce/polu dostępna jest interakcja:

**`Zrób porządek`**

Interakcja powinna być dostępna zawczasu, również gdy pole jest jeszcze zadbane.

Bazowa akcja powinna zajmować około **1–2 godzin czasu świata** i przywracać około **50 punktów procentowych `care`**, z limitem 100.

Przykład:

```text
care = 35
  ↓
Zrób porządek
  ↓
~1–2 h
  ↓
care = 85
```

Dokładne wartości czasu i przyrostu są parametrami do tuningu.

W przyszłości można rozróżnić bardziej konkretne akcje, np. `Wyrwij chwasty`, `Przekop`, `Zagrab`, ale nie jest to wymagane w pierwszej wersji.

## 5. Narzędzia

Maintenance może być wykonywany:

- ręcznie,
- przy użyciu odpowiedniego narzędzia.

Przykładowe narzędzia:

- nóż,
- łopata,
- grabie.

Narzędzia **skracają czas wykonywania akcji**, ale nie zwiększają ilości przywracanego `care`.

Bonusy powinny korzystać z istniejącego modelu narzędzi i akcji. Nie tworzyć specjalnego systemu narzędzi tylko dla maintenance.

## 6. NPC maintenance

NPC powinien móc samodzielnie uporządkować zaniedbaną grządkę/pole.

Nie tworzyć:

- `GardenAI`,
- `FarmAI`,
- `MaintenanceAI`,
- specjalnego schedulera rolniczego.

Maintenance powinien wejść w istniejący przepływ:

```text
world state
→ problem / pressure
→ decision
→ strategy
→ maintenance action
```

### 6.1 Warunek wejścia

Jeżeli NPC **przyszedł na pole/grządkę** i `care < 50%`, może mieć szansę wykonać `Zrób porządek`.

NPC nie powinien specjalnie wyszukiwać zaniedbanych pól tylko po to, żeby je sprzątać.

Przed rozpoczęciem pracy NPC powinien spełniać podstawowe warunki:

- jego krytyczne needs są zaspokojone,
- ma wystarczającą siłę/zdrowie do wykonania pracy.

Szczegółowa szansa na podjęcie maintenance jest parametrem do tuningu.

Może zależeć od:

- poziomu `care`,
- cech/profesji NPC,
- dostępności narzędzia,
- innych istniejących czynników decyzyjnych.

Nie tworzyć nowego systemu priorytetów wyłącznie dla maintenance.

### 6.2 Zachowanie po pracy

NPC wykonuje istniejącą akcję przez określony czas, po czym otrzymuje efekt maintenance.

Po zakończeniu powinien wrócić do normalnego przepływu decyzji/schedule, zamiast otrzymywać specjalny tryb „opieki nad polem”.

## 7. Garden i field jako wspólny koncept

Nie tworzyć dwóch systemów:

```text
GardenMaintenance
FieldMaintenance
```

Maintenance powinien działać na wspólnym modelu utrzymywanego miejsca uprawy, zgodnym z implementacją `174`/`126`.

## 8. Persistence

Stan utrzymania musi przetrwać save/load.

Preferować przechowywanie minimalnego stanu, np. `lastMaintainedAt`, jeżeli `care` może być deterministycznie wyliczane z czasu.

Stan powinien działać poprawnie po:

- save/load,
- time skip,
- rebuild world,
- unload/load chunku.

Usunięcie grządki/pola musi również zostać prawidłowo odzwierciedlone w persistence istniejących player-built world objects.

## 9. Chunk lifecycle

Maintenance nie może wymagać globalnego skanowania pól.

Wykorzystać istniejący lifecycle world objects z planu `174`.

Pole znajdujące się w unloaded chunku nie wymaga aktywnego tickowania. Po ponownym załadowaniu jego stan można wyliczyć z czasu.

## 10. Performance

- brak per-frame tickowania wszystkich pól,
- brak globalnego `GardenManager`,
- brak nowych workerów,
- brak globalnego skanowania pól przez NPC,
- maintenance wykonywany jako istniejąca akcja player/NPC,
- degradacja wyliczana lazy,
- wykorzystanie istniejącego world-object/persistence modelu.

## 11. Out of scope

Nie implementować:

- zaawansowanego systemu rolnictwa,
- nawożenia,
- chorób roślin,
- genetyki,
- podlewania jako osobnego systemu,
- realistycznego modelu chwastów,
- osobnych typów chwastów,
- automatycznego farmera,
- przypisywania NPC do pól,
- nowych cropów,
- nowego crop lifecycle.

Chwasty mogą być później wizualną reprezentacją poziomu zaniedbania, ale nie są wymagane do działania mechanizmu.

## 12. Verification

### Technical

- `pnpm lint:fix`
- `pnpm typecheck`
- testy
- build

Testy powinny pokrywać:

- degradację `care` wraz z czasem,
- próg `care < 50%`,
- wpływ stanu na crop,
- maintenance przywracający około 50 punktów `care`,
- limit `care` do 100,
- czas trwania maintenance,
- skrócenie czasu przez narzędzie,
- stan po save/load,
- stan po time skip,
- usunięcie mocno zaniedbanej grządki/pola.

### Browser / gameplay

Sprawdzić:

1. gracz posiada grządkę z `174`,
2. grządka/pole stopniowo się zaniedbuje,
3. poziom zaniedbania wpływa na crop,
4. `Zrób porządek` jest dostępne również przed znacznym zaniedbaniem,
5. maintenance działa ręcznie,
6. akcja trwa około 1–2 godzin czasu świata,
7. narzędzie skraca czas akcji,
8. maintenance przywraca około 50% `care`,
9. długotrwałe zaniedbanie usuwa grządkę/pole,
10. po usunięciu można zbudować nową grządkę,
11. NPC przychodzący na pole z `care < 50%` może je uporządkować,
12. NPC nie robi tego, gdy jego własne needs są krytyczne lub nie ma wystarczającej siły/zdrowia,
13. NPC nie wymaga ręcznego przypisania do pola,
14. zachowanie działa po time skip i ponownym załadowaniu świata.

## 13. Expected architecture outcome

Po implementacji:

```text
Garden / Field
      ↓
maintenance state
      ↓
crop conditions
      ↓
yield / productivity
```

oraz:

```text
NPC arrives at neglected field
          ↓
    care < 50%
          ↓
  needs/health OK
          ↓
    decision chance
          ↓
   existing maintenance action
          ↓
      field improved
```

Mechanizm powinien być kolejnym elementem istniejącego systemu world state → NPC decision → action, a nie specjalnym systemem rolniczej AI.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Plan: NPC pomoc graczowi w jedzeniu i piciu

**Created:** 2026-08-17  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~106~~ ~~069~~ ~~122~~

domain: settlements-npcs
tags: [items-player, quests-progression]

## Cel

Rozszerzyć istniejące interakcje gracz↔NPC o sytuację, w której NPC może dobrowolnie pomóc graczowi z głodem lub pragnieniem.

Gracz nadal sam odpowiada za zdobywanie jedzenia i wody. Pomoc NPC jest wyjątkiem wynikającym ze stanu świata i relacji, a nie darmowym sklepem ani player-only mechaniką.

Docelowy przepływ:

```text
Player hunger/thirst
        ↓
prośba do NPC
        ↓
NPC social state + relation + openness/traits
        ↓
czy NPC chce pomóc?
        ↓
sprawdzenie realnych zapasów
  ┌──────────────┴──────────────┐
  ↓                             ↓
carried Inventory          household stock/reserve
  ↓                             ↓
food / water item          food / water reserve
  └──────────────┬──────────────┘
                 ↓
           pomoc NPC
                 ↓
   zapasy NPC faktycznie maleją
   potrzeba gracza faktycznie rośnie
```

## Stan obecny, na którym plan ma się oprzeć

`docs/STATE.md` zweryfikowany 2026-08-17 opisuje już:

- `PlayerController.needs` z `hunger` i `thirst` w `src/player/PlayerNeeds.ts`;
- realne consumables w `ITEM_CATALOG[].consumable`, z `eatFood()` / `drinkWater()` jako istniejącymi operacjami potrzeb gracza;
- NPC posiadają generyczny `Inventory` (`NpcAgent`), obecnie wykorzystywany m.in. przez górników do noszenia rudy;
- gospodarstwo ma autorytatywny `food` stock oraz osobny `household.water` `WaterReserve`;
- NPC już zaspokajają własny głód z `household.stock` i pragnienie z `household.water`;
- relacja z NPC jest przechowywana w istniejącym `QuestManager`, z poziomami `stranger / acquainted / friendly / trusted`;
- `QuestManager.getPlayerStanding()` jest istniejącą, pochodną reputacją globalną opartą o te same relacje;
- `reactionChance.ts` już łączy relation, standing, openness/extraversion i trait `curious` w istniejący model reakcji NPC;
- dialog NPC v2 już jest istniejącym punktem interakcji gracz↔NPC.

Nie tworzyć równoległych magazynów, reputacji, relacji ani systemu interakcji.

## Zakres

### 1. Prośba gracza

Dodać do istniejącego dialogu NPC opcjonalne akcje:

- poproś o jedzenie;
- poproś o picie.

Opcje powinny pojawiać się tylko wtedy, gdy prośba ma sens dla aktualnego stanu gracza/NPC. Nie tworzyć osobnego ekranu pomocy.

### 2. Decyzja NPC

Decyzja powinna być deterministyczna i oparta na istniejącym stanie NPC.

Minimalny model:

```text
relationLevel
+ personality/openness
+ relevant traits
+ player standing
+ own needs
+ available supplies
→ willingness to help
```

Relacja osobista powinna mieć największe znaczenie. `standing` może być dodatkowym sygnałem społecznym, zgodnie z istniejącym `reactionChance`.

Nie tworzyć LLM/AI decyzji ani osobnego utility-AI tylko dla tej funkcji.

### 3. Zapasy NPC

Pomoc musi konsumować rzeczywisty stan.

#### Jedzenie

Sprawdzić istniejący `NpcAgent.inventory` oraz `Household.stock`.

Preferowany model:

1. jeśli NPC ma odpowiedni consumable przy sobie — może przekazać ten item;
2. w przeciwnym razie może użyć jedzenia z własnego gospodarstwa, jeżeli gospodarstwo ma zapas ponad bezpieczny poziom;
3. jeśli zapasu brak lub rodzina sama jest zagrożona głodem — odmowa.

Nie dopuścić do sytuacji, w której NPC oddaje ostatnie jedzenie rodzinie tylko dlatego, że lubi gracza.

#### Woda

Woda ma obecnie autorytatywny `Household.water`, a nie itemowy magazyn gospodarstwa.

Dlatego pomoc w piciu powinna przede wszystkim korzystać z `household.water` jako istniejącego źródła prawdy. Jeżeli NPC posiada pełny `waterskin` w swoim `Inventory`, można wykorzystać go jako rzeczywisty carried item, bez tworzenia drugiego zapasu wody.

Po udzieleniu pomocy ilość wody musi faktycznie zostać zmniejszona.

### 4. Ilość pomocy

Pierwsza wersja powinna być mała i konfigurowalna:

- pomoc jednorazowa daje jedną sensowną porcję jedzenia lub wody;
- nie próbować uzupełniać całego paska gracza;
- nie wprowadzać cen, barteru ani długu.

Dokładne wartości należy scentralizować w jednym miejscu.

### 5. Warunek bezpieczeństwa gospodarstwa

NPC nie może pomagać kosztem własnej rodziny.

Minimalna reguła:

```text
available stock > household minimum
```

Dla jedzenia wykorzystać istniejącą politykę `Household` (`minimum / target / capacity`), zamiast tworzyć nowe progi.

Dla wody wykorzystać istniejące `WaterReserve.shortage()` / `shouldFetch()` i politykę gospodarstwa.

To ma dawać emergentne zachowanie:

```text
dużo zapasów + dobra relacja → pomoc
mało zapasów + dobra relacja → odmowa
```

### 6. Odmowa

Odmowa jest normalnym wynikiem decyzji, nie błędem.

Przykładowe przyczyny:

- brak zapasów;
- własna rodzina potrzebuje zapasów;
- NPC nie jest wystarczająco przyjazny;
- NPC nie jest skłonny pomagać.

Wykorzystać istniejący mechanizm dialogu/feedbacku zamiast tworzyć nowy system komunikatów.

## Architektura

Preferowany kierunek:

```text
NpcDialogueMenu
      ↓
existing NPC interaction/dialogue flow
      ↓
small assistance decision/resolution
      ↓
NpcAgent / Household / Inventory
      ↓
PlayerNeeds + Player Inventory
```

Ważne zasady ownership:

- `PlayerNeeds` pozostaje właścicielem potrzeb gracza;
- `Inventory` pozostaje właścicielem carried items;
- `Household` pozostaje właścicielem rodzinnego zapasu food/water;
- `QuestManager` pozostaje właścicielem relacji/reputacji;
- `NpcAgent` nie powinien importować `QuestManager` tylko po to, aby rozstrzygać pomoc — tak jak w `reactionChance.ts`, relacja/standing powinny być dostarczone przez istniejący lookup/hook;
- nie tworzyć `NpcHelpManager`, `PlayerAssistanceManager`, `ReputationManager` ani osobnego inventory gospodarstwa.

## Konkretne miejsca do sprawdzenia/zmiany

Implementacja powinna zacząć się od dokładnego prześledzenia:

- `src/player/PlayerNeeds.ts` — użycie `eatFood()` / `drinkWater()`;
- `src/items/itemCatalog.ts` — rozpoznawanie consumables i ich `need/relief`;
- `src/items/Inventory.ts` — transfer/usuwanie/dodawanie itemów bez tworzenia nowego API równoległego;
- `src/ai/NpcAgent.ts` — istniejący `Inventory`, household i dostęp do social lookup;
- `src/settlement/household.ts` — `stock`, `water`, `minimum/target/capacity`, `deposit`;
- `src/quests/QuestManager.ts` / `src/quests/quests.ts` — istniejące relation levels i relation state;
- `src/ai/reactionChance.ts` — istniejący model openness/traits/relation/standing;
- `src/app/interactables.ts` i istniejący flow `[E]` — bez tworzenia drugiego systemu interakcji;
- istniejący komponent/menu dialogu NPC v2 — akcje prośby powinny być kolejnym typem istniejącej opcji dialogowej.

Dokładne symbole i przepływ danych należy potwierdzić przed implementacją. Plan nie zakłada nowych plików bez potrzeby.

## Social behaviour

Ta mechanika powinna być pierwszym konkretnym konsumentem istniejących relacji/openness w interakcji innej niż zwykła reakcja/dialog.

Nie należy jednak implementować pełnego `Social Places / Social Behaviour` w ramach tego planu.

Pomoc jest pojedynczą, lokalną decyzją NPC wynikającą z aktualnego stanu. Nie wymaga harmonogramu, social place ani autonomicznego zadania NPC.

## Nie w zakresie

- handel lub sprzedaż jedzenia/wody;
- ceny, pieniądze, barter;
- pożyczki/długi;
- globalna reputacja ponad istniejący `getPlayerStanding()`;
- nowe frakcje;
- LLM-generated decisions/dialogue;
- pełny Social Behaviour / Social Places;
- autonomiczne chodzenie NPC do gracza tylko po to, aby go nakarmić;
- tworzenie nowych zapasów jedzenia/wody;
- automatyczne uzupełnianie potrzeb gracza bez jego prośby;
- oddawanie zapasów poniżej istniejącego minimum gospodarstwa;
- multiplayer/network synchronization.

## Persystencja

Nie dodawać nowej persystencji.

Jeżeli przekazany item zmienia istniejący `Inventory`, a stan gracza/NPC/gospodarstwa ma już istniejącą politykę save/runtime, użyć jej bez tworzenia nowego formatu save.

Trzeba sprawdzić, czy transfer między NPC a graczem wymaga rozszerzenia istniejącego save tylko dlatego, że NPC-owy inventory jest runtime-only. Jeśli tak, udokumentować to jako osobną decyzję przed implementacją, zamiast dorabiać ukrytą persystencję.

## Wydajność

Pomoc jest interakcją niskiej częstotliwości.

Nie wykonywać żadnych dodatkowych per-frame scanów NPC, gospodarstw ani inventory.

Decyzja i resolver zapasu mają być wywoływane wyłącznie przy otwarciu/wybraniu prośby.

## Kryteria akceptacji

- [ ] Gracz może poprosić istniejącego NPC o jedzenie.
- [ ] Gracz może poprosić istniejącego NPC o picie.
- [ ] Opcje korzystają z istniejącego dialogu/interakcji NPC.
- [ ] Decyzja uwzględnia istniejącą relację z konkretnym NPC.
- [ ] Decyzja może uwzględniać openness/traits i istniejący player standing.
- [ ] NPC odmawia, gdy nie ma odpowiednich zapasów.
- [ ] NPC odmawia, gdy przekazanie zapasu naruszyłoby bezpieczeństwo własnego gospodarstwa.
- [ ] Przekazanie jedzenia faktycznie zmniejsza źródłowy zapas i daje graczowi istniejący item.
- [ ] Przekazanie wody faktycznie zmniejsza źródłowy zapas i zwiększa `PlayerNeeds.thirst` przez istniejący mechanizm.
- [ ] Nie powstaje drugi system inventory, relacji, reputacji ani interakcji.
- [ ] Pomoc nie jest automatyczna — wymaga prośby gracza.
- [ ] Brak dodatkowej pracy per frame.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` oraz istniejące testy przechodzą.
- [ ] Browser/manual verification sprawdza co najmniej: przyjazny NPC z zapasem pomaga; NPC bez zapasu odmawia; NPC z krytycznym zapasem odmawia; transfer faktycznie zmienia oba stany.

## Decyzje przed implementacją

Przed kodowaniem trzeba potwierdzić tylko dwa szczegóły wynikające z obecnego modelu danych:

1. Czy `NpcAgent.inventory` ma być rzeczywistym źródłem carried food/water w tej wersji, czy dla v1 "przy sobie" oznacza wyłącznie przyszłą możliwość, a implementacja korzysta tylko z `Household`.
2. Jaki istniejący mechanizm dialogu v2 jest najmniejszym punktem rozszerzenia dla akcji typu `request_food` / `request_water`.

Nie rozstrzygać tych kwestii przez tworzenie nowych systemów.

## Weryfikacja

Techniczna:

```text
npx tsc --noEmit
npm run lint
npm run build
npm test
```

Manual/browser:

```text
1. Znajdź NPC z dobrą relacją i zapasem.
2. Poproś o jedzenie → NPC pomaga → inventory/needs zmieniają się poprawnie.
3. Poproś o picie → NPC pomaga → household water / waterskin oraz thirst zmieniają się poprawnie.
4. Powtórz przy braku zapasu → odmowa.
5. Sprawdź gospodarstwo z minimalnym zapasem → NPC nie zabiera ostatniej porcji.
6. Sprawdź NPC o słabej relacji → pomoc nie jest gwarantowana.
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**
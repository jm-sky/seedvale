# Plan: NPC pomoc graczowi w jedzeniu i piciu

**Created:** 2026-08-18

**Status:** `planned` 📋

**Priority:** medium · **Effort:** M

**Depends on:** ~~106~~ ~~069~~ ~~122~~ 156

**domain:** settlements-npcs

**tags:** [items-player, quests-progression]


## Cel

Rozszerzyć istniejące interakcje gracz↔NPC o sytuację, w której NPC może dobrowolnie pomóc graczowi z głodem lub pragnieniem.

Gracz nadal sam odpowiada za zdobywanie jedzenia i wody. Pomoc NPC jest wyjątkiem wynikającym ze stanu świata i relacji, a nie darmowym sklepem ani player-only mechaniką.

**V1 celowo ogranicza pomoc do zapasów, które NPC ma przy sobie.** NPC nie teleportuje się do domu i nie pobiera magicznie `Household.stock` podczas rozmowy.

```text
Player hunger/thirst
        ↓
prośba do NPC
        ↓
NPC social state + relation + openness/traits
        ↓
czy NPC chce pomóc?
        ↓
sprawdzenie carried Inventory NPC
        ↓
food / water item
        ↓
pomoc NPC
        ↓
zapas NPC maleje + gracz otrzymuje zasób
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
+ carried supplies
→ willingness to help
```

Relacja osobista powinna mieć największe znaczenie. `standing` może być dodatkowym sygnałem społecznym, zgodnie z istniejącym `reactionChance`.

Nie tworzyć LLM/AI decyzji ani osobnego utility-AI tylko dla tej funkcji.

### 3. Zapasy NPC — V1

Pomoc musi konsumować rzeczywisty stan **carried `NpcAgent.inventory`**.

1. NPC sprawdza, czy ma odpowiedni consumable przy sobie.
2. Jeśli ma — może go przekazać, o ile decyzja społeczna jest pozytywna.
3. Jeśli nie ma — odmawia z powodu braku zasobu.

Nie pobierać w V1 jedzenia ani wody bezpośrednio z `Household.stock` / `Household.water`.

Nie wykonywać teleportu NPC do domu.

### 4. Przyszłe pobieranie z domu

Pobieranie zapasu z domu jest **poza zakresem planu 144**.

Docelowo powinno być rozwiązane przez istniejące mechanizmy `Places` / schedule / locomotion i przyszłe `Social Behaviour`, np.:

```text
Player prosi
    ↓
NPC chce pomóc
    ↓
NPC nie ma zasobu przy sobie
    ↓
NPC wie, że zasób jest w domu
    ↓
normalna decyzja/akcja NPC: wrócić do domu
    ↓
pobrać realny zapas
    ↓
wrócić do gracza
    ↓
przekazać zasób
```

Nie tworzyć dla tego osobnego `goHomeAndFetchFoodForPlayer()` ani player-centric teleportu. Jeżeli mechanizm okaże się potrzebny, powinien zostać zaplanowany jako rozszerzenie Social Behaviour / Social Places.

### 5. Woda — V1

Woda ma obecnie autorytatywny `Household.water`, a nie itemowy magazyn gospodarstwa.

Dlatego w V1 pomoc w piciu jest możliwa tylko wtedy, gdy NPC ma faktyczny przenośny item w swoim `Inventory` (np. istniejący/przewidziany `waterskin`). Jeśli nie ma takiego itemu przy sobie, NPC odmawia.

Nie tworzyć specjalnego transferu `Household.water → Player` tylko dla tej funkcji.

Po udzieleniu pomocy ilość przekazanego carried zasobu musi faktycznie zmniejszyć inventory NPC i zwiększyć stan gracza przez istniejący mechanizm.

### 6. Ilość pomocy

Pierwsza wersja powinna być mała i konfigurowalna:

- pomoc jednorazowa daje jeden sensowny consumable;
- nie próbować uzupełniać całego paska gracza;
- nie wprowadzać cen, barteru ani długu.

Dokładne wartości należy scentralizować w jednym miejscu.

### 7. Odmowa

Odmowa jest normalnym wynikiem decyzji, nie błędem.

Przykładowe przyczyny:

- NPC nie ma odpowiedniego itemu przy sobie;
- NPC nie chce pomóc z powodu relacji/cech/standing;
- NPC ma zasób, ale nie jest skłonny go oddać.

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
NpcAgent.inventory
      ↓
PlayerNeeds + Player Inventory
```

Ważne zasady ownership:

- `PlayerNeeds` pozostaje właścicielem potrzeb gracza;
- `Inventory` pozostaje właścicielem carried items;
- `Household` pozostaje właścicielem rodzinnego zapasu food/water — nie jest bezpośrednim źródłem pomocy w V1;
- `QuestManager` pozostaje właścicielem relacji/reputacji;
- `NpcAgent` nie powinien importować `QuestManager` tylko po to, aby rozstrzygać pomoc — tak jak w `reactionChance.ts`, relacja/standing powinny być dostarczone przez istniejący lookup/hook;
- nie tworzyć `NpcHelpManager`, `PlayerAssistanceManager`, `ReputationManager` ani osobnego inventory gospodarstwa.

## Konkretne miejsca do sprawdzenia/zmiany

Implementacja powinna zacząć się od dokładnego prześledzenia:

- `src/player/PlayerNeeds.ts` — użycie `eatFood()` / `drinkWater()`;
- `src/items/itemCatalog.ts` — rozpoznawanie consumables i ich `need/relief`;
- `src/items/Inventory.ts` — transfer/usuwanie/dodawanie itemów bez tworzenia nowego API równoległego;
- `src/ai/NpcAgent.ts` — istniejący `Inventory` i dostęp do social lookup;
- `src/quests/QuestManager.ts` / `src/quests/quests.ts` — istniejące relation levels i relation state;
- `src/ai/reactionChance.ts` — istniejący model openness/traits/relation/standing;
- `src/app/interactables.ts` i istniejący flow `[E]` — bez tworzenia drugiego systemu interakcji;
- istniejący komponent/menu dialogu NPC v2 — akcje prośby powinny być kolejnym typem istniejącej opcji dialogowej.

Dokładne symbole i przepływ danych należy potwierdzić przed implementacją. Plan nie zakłada nowych plików bez potrzeby.

## Social behaviour

Ta mechanika powinna być pierwszym konkretnym konsumentem istniejących relacji/openness w interakcji innej niż zwykła reakcja/dialog.

Nie należy jednak implementować pełnego `Social Places / Social Behaviour` w ramach tego planu.

Pomoc w V1 jest pojedynczą, lokalną decyzją NPC wynikającą z aktualnego stanu. Nie wymaga harmonogramu, social place ani autonomicznego zadania NPC.

Przyszłe „pójdę do domu po jedzenie” powinno natomiast zostać naturalnie włączone w Social Behaviour/Places, zamiast otrzymać osobny player-centric mechanizm.

## Nie w zakresie

- pobieranie jedzenia/wody z `Household` podczas prośby gracza;
- teleport NPC do domu i z powrotem;
- autonomiczne chodzenie NPC do gracza tylko po to, aby go nakarmić;
- handel lub sprzedaż jedzenia/wody;
- ceny, pieniądze, barter;
- pożyczki/długi;
- globalna reputacja ponad istniejący `getPlayerStanding()`;
- nowe frakcje;
- LLM-generated decisions/dialogue;
- pełny Social Behaviour / Social Places;
- tworzenie nowych zapasów jedzenia/wody;
- automatyczne uzupełnianie potrzeb gracza bez jego prośby;
- multiplayer/network synchronization.

## Persystencja

Nie dodawać nowej persystencji.

Jeżeli przekazany item zmienia istniejący `Inventory`, a stan gracza/NPC ma już istniejącą politykę save/runtime, użyć jej bez tworzenia nowego formatu save.

Jeżeli NPC-owy inventory jest runtime-only i transfer nie może być poprawnie odtworzony po save/load, udokumentować to jako decyzję implementacyjną przed kodowaniem zamiast dorabiać ukrytą persystencję.

## Wydajność

Pomoc jest interakcją niskiej częstotliwości.

Nie wykonywać żadnych dodatkowych per-frame scanów NPC ani inventory.

Decyzja i resolver carried itemu mają być wywoływane wyłącznie przy wybraniu prośby.

## Kryteria akceptacji

- [ ] Gracz może poprosić istniejącego NPC o jedzenie.
- [ ] Gracz może poprosić istniejącego NPC o picie, jeśli NPC ma odpowiedni carried item.
- [ ] Opcje korzystają z istniejącego dialogu/interakcji NPC.
- [ ] Decyzja uwzględnia istniejącą relację z konkretnym NPC.
- [ ] Decyzja może uwzględniać openness/traits i istniejący player standing.
- [ ] NPC odmawia, gdy nie ma odpowiedniego carried itemu.
- [ ] Przekazanie jedzenia faktycznie usuwa item z inventory NPC i daje go graczowi.
- [ ] Przekazanie wody faktycznie usuwa carried water item z inventory NPC i stosuje istniejący efekt nawodnienia gracza.
- [ ] Nie powstaje drugi system inventory, relacji, reputacji ani interakcji.
- [ ] Pomoc nie jest automatyczna — wymaga prośby gracza.
- [ ] Brak dodatkowej pracy per frame.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` oraz istniejące testy przechodzą.
- [ ] Browser/manual verification sprawdza co najmniej: przyjazny NPC z carried consumable pomaga; NPC bez carried consumable odmawia; transfer faktycznie zmienia oba stany.

## Decyzje przed implementacją

Przed kodowaniem trzeba potwierdzić tylko jeden szczegół wynikający z obecnego modelu danych:

1. Jaki istniejący mechanizm dialogu v2 jest najmniejszym punktem rozszerzenia dla akcji typu `request_food` / `request_water`.

Kwestia pobierania z domu nie jest decyzją dla planu 144 — jest świadomie odłożona do Social Behaviour / Social Places.

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
1. Znajdź NPC z dobrą relacją i carried consumable.
2. Poproś o jedzenie → NPC pomaga → inventory/needs zmieniają się poprawnie.
3. Znajdź NPC z carried water item → poproś o picie → transfer i thirst zmieniają się poprawnie.
4. Powtórz przy braku odpowiedniego carried itemu → odmowa.
5. Sprawdź NPC o słabej relacji → pomoc nie jest gwarantowana.
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**

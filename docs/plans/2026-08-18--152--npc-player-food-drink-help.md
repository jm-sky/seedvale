# Plan: NPC pomoc graczowi w jedzeniu i piciu

**Created:** 2026-08-18  
**Updated:** 2026-08-19  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~069~~ ~~122~~ ~~156~~ 165  
**Related:** 167

**domain:** settlements-npcs

**Tags:** [items-player, quests-progression]

## Cel

Rozszerzyć istniejące interakcje gracz↔NPC o synchroniczną, konwersacyjną pomoc NPC w jedzeniu lub — gdy istniejący model to umożliwia — piciu.

Gracz prosi NPC podczas rozmowy, NPC podejmuje lokalną decyzję społeczną i, jeżeli faktycznie posiada odpowiedni carried consumable, udziela natychmiastowej pomocy.

Plan nie implementuje autonomicznego dostarczania zasobów do player storage. To jest zakres Planu 167.

```text
player hunger/thirst
        ↓
prośba w istniejącym dialogu NPC
        ↓
social decision
        ↓
NPC carried Inventory
        ↓
existing consumable
        ↓
natychmiastowa pomoc
```

## Granica z Planem 167

### Plan 152

```text
player prosi
    ↓
NPC decyduje
    ↓
NPC ma carried consumable
    ↓
natychmiastowa pomoc
```

### Plan 167

```text
NPC ma goal / pressure
    ↓
pozyskuje zasób
    ↓
transportuje
    ↓
player Container
    ↓
wraca do normalnego życia
```

Nie scalać tych mechanizmów.

Plan 152 nie używa:

- Helper/Supplier assignment;
- player `Container`;
- autonomicznego gatheringu;
- transport chain;
- helper decision cycle;
- autonomicznego delivery loop.

Plan 167 nie zastępuje dialogowej prośby o natychmiastową pomoc.

Wspólne pozostają istniejące domeny: `Inventory`, `PlayerNeeds`, `ITEM_CATALOG`, relacje oraz NPC dialogue/interactions.

## Ownership

### PlayerNeeds

`PlayerNeeds` pozostaje właścicielem:

- hunger;
- thirst;
- `eatFood()`;
- `drinkWater()`;
- przyszłych konsekwencji głodu/pragnienia z Planu 165.

152 korzysta z istniejącego API i nie mutuje bezpośrednio pól potrzeb.

Plan 165 jest zależnością planistyczną, ponieważ rozszerza kontrakt potrzeb, ale 152 nie implementuje jego mechaniki starvation/dehydration.

152 nie implementuje własnego `StarvationDuration` ani `DehydrationDuration`.

### Player Inventory

`Inventory` pozostaje właścicielem carried items gracza.

Używać istniejących:

```text
has()
count()
canAdd()
add()
remove()
```

Nie tworzyć drugiego inventory ani transfer API.

### NpcAgent.inventory

`NpcAgent.inventory` jest carried/temporary state, a nie osobistym magazynem NPC.

Pomoc V1 jest możliwa wyłącznie dla zasobu, który NPC faktycznie posiada przy sobie w momencie prośby.

Nie tworzyć mechanizmu wyposażania NPC w jedzenie lub wodę tylko na potrzeby 152.

### Household

`Household.stock` i `Household.water` pozostają właścicielami rodzinnych zapasów.

152 nie wykonuje:

```text
Household.stock → Player
Household.water → PlayerNeeds
```

podczas rozmowy.

Nie ma teleportowania NPC do domu po zasób.

### Relations / standing

Istniejący mechanizm relacji i standing pozostaje właścicielem tych danych.

152 tylko odczytuje je przez istniejący lookup/hook.

Nie tworzyć drugiego relation/reputation store.

### Dialogue / interactions

Istniejący NPC dialogue v2 i NPC interaction flow pozostają właścicielami wejścia interakcji.

Nie tworzyć drugiego menu ani systemu NPC interaction.

`QuestDialogOverride` nie staje się właścicielem food/water assistance.

### Player Storage

Player `Container` / storage pozostaje domeną Planu 167.

Plan 152 nie dodaje żadnego targetu storage.

## Zakres V1

### 1. Prośba o jedzenie

W istniejącym dialogu NPC dodać opcjonalną akcję „Poproś o jedzenie”.

Przepływ:

```text
NPC carried Inventory
    ↓
food consumable
    ↓
social decision
    ↓
natychmiastowa pomoc
```

NPC nie pobiera food z `Household.stock`.

Jeżeli NPC nie posiada carried food, wynik jest normalną odmową.

### 2. Prośba o picie

Aktualny codebase nie potwierdza istnienia portable water item, który NPC może posiadać w `NpcAgent.inventory`.

Dlatego Plan 152 nie tworzy nowego portable water itemu ani nowego water lifecycle.

W V1 pomoc w piciu jest dostępna tylko wtedy, gdy przed implementacją istniejący codebase dostarcza rzeczywisty carried consumable z:

```text
ITEM_CATALOG[kind].consumable.need === 'thirst'
```

Jeżeli takiego itemu nadal nie ma, funkcja „Poproś o picie” pozostaje poza implementacją V1.

Nie tworzyć:

```text
Household.water → PlayerNeeds.thirst
```

### 3. Food transfer

Udana pomoc:

```text
NPC inventory
    ↓ remove 1
Player inventory
    ↓ add 1
```

Gracz otrzymuje consumable i może użyć istniejącego mechanizmu jedzenia.

152 nie wywołuje `eatFood()` przy samym przekazaniu.

### 4. Water assistance

Jeżeli w przyszłości istniejący portable water item zostanie udostępniony NPC:

- użyć istniejącej semantyki `ITEM_CATALOG`;
- wykorzystać `need`;
- wykorzystać `relief`;
- zachować istniejący `resultKind`;
- użyć istniejącego player consume lifecycle.

Nie implementować drugiego waterskin/container lifecycle.

### 5. Ilość pomocy

V1:

- jedna sensowna jednostka consumable na udaną pomoc;
- brak uzupełniania całego paska;
- brak ceny;
- brak barteru;
- brak długu;
- brak automatycznych kolejnych dostaw.

## Decyzja społeczna

Decyzja korzysta z istniejących danych:

```text
relationLevel
+ standing
+ personality/openness
+ relevant traits
```

Osobista relacja powinna mieć największe znaczenie.

Istniejący `reactionChance.ts` może dostarczyć wspólnego modelu danych i filozofii, ale `computeReactionChance()` nie powinien być traktowany automatycznie jako gotowe deterministyczne yes/no.

Jeżeli potrzebny jest RNG, użyć istniejącej konwencji projektu.

Nie tworzyć:

- nowego utility AI;
- LLM decision;
- relation store;
- reputation system.

### NPC own-needs guard

Nie tworzyć osobnego reservation/ledger system.

Jeżeli istniejący stan NPC wiarygodnie wskazuje, że oddanie konkretnego carried consumable naruszyłoby krytyczną własną potrzebę, NPC nie powinien go oddać.

Jeżeli obecny model nie pozwala tego wiarygodnie ustalić, zastosować konserwatywną regułę opartą wyłącznie na istniejącym stanie.

Nie budować nowego NPC survival subsystem w ramach 152.

## Dialogue integration

Rozszerzenie powinno zostać wykonane w istniejącym `NpcDialogueMenu.vue` / dialogue state.

Docelowo:

```text
NpcDialogueMenu
  ├── existing topics
  ├── request food
  └── request water
          ↓
      small assistance resolver/callback
          ↓
      result
```

Nie tworzyć drugiego dialog managera.

Nie umieszczać food/water assistance w `QuestDialogOverride`.

UI może ograniczać widoczność akcji, ale resolver pozostaje authoritative i ponownie sprawdza aktualny stan po kliknięciu.

`no_item` jest normalnym wynikiem, a nie błędem systemu.

## Consumable selection

Nie hardcodować listy food/water w UI.

Źródłem semantyki consumable pozostaje:

```text
ITEM_CATALOG[kind].consumable
```

Food candidate:

```text
need === 'hunger'
```

Water candidate, tylko jeżeli istnieje:

```text
need === 'thirst'
```

Relief i `resultKind` zawsze pochodzą z katalogu.

Ponieważ `Inventory` wspiera count-based items, wybór kandydata nie może zakładać item instances.

## Inventory atomicity

Przed mutacją:

```text
NPC has item
    ↓
social decision succeeds
    ↓
player-side preconditions valid
    ↓
mutation
```

Dla food:

```text
npc.inventory.has(kind, 1)
player.inventory.canAdd(kind, 1)
npc.inventory.remove(kind, 1)
player.inventory.add(kind, 1)
```

Nie usuwać itemu NPC przed sprawdzeniem możliwości zakończenia transferu.

Jeżeli istniejący player consume path zostanie użyty bezpośrednio dla portable water, zachować jego dotychczasową semantykę.

## Przyszłe pobieranie zasobu

Poza zakresem 152:

```text
player prosi
    ↓
NPC nie ma itemu
    ↓
NPC idzie po zasób
    ↓
wraca
```

Nie implementować tego jako player-centric action.

Jeżeli kiedyś będzie potrzebny taki przepływ, powinien zostać rozwiązany przez istniejący model NPC actions / Social Behaviour / Places, bez tworzenia osobnego systemu dla 152.

## Persistence

Nie dodawać nowej persystencji.

152 nie tworzy:

- helper assignment;
- player storage target;
- relationship state;
- inventory;
- nowego save state.

Nie zakładać, że `NpcAgent.inventory` jest trwałym NPC backpackiem tylko dlatego, że `Inventory` posiada serialization API.

## Performance

Resolver jest operacją niskiej częstotliwości.

Nie dodawać:

- per-frame inventory scans;
- per-frame assistance checks;
- globalnego wyszukiwania pomocnego NPC;
- background willingness updates;
- helper delivery loop.

Wszystko dzieje się w odpowiedzi na interakcję gracza.

## Nie w zakresie

- autonomiczna dostawa do player `Container`;
- Plan 167 Helper/Supplier;
- gather → carry → deliver dla gracza;
- player storage;
- pobieranie z `Household.stock` podczas rozmowy;
- pobieranie z `Household.water` podczas rozmowy;
- nowy portable-water item lub lifecycle;
- teleport NPC;
- handel;
- ceny;
- barter;
- długi;
- nowy inventory;
- nowa reputacja;
- nowy dialogue system;
- LLM decisions;
- pełny Social Behaviour / Social Places;
- nowy NPC survival system;
- `StarvationDuration` / `DehydrationDuration` z Planu 165;
- multiplayer.

## Kryteria akceptacji

- [ ] Gracz może poprosić NPC o jedzenie w istniejącym dialogu.
- [ ] Pomoc wymaga aktualnej decyzji NPC.
- [ ] Food może zostać przekazane wyłącznie z rzeczywistego carried `NpcAgent.inventory`.
- [ ] NPC bez odpowiedniego carried food odmawia.
- [ ] Food transfer zmniejsza NPC inventory i zwiększa player inventory.
- [ ] `PlayerNeeds` pozostaje właścicielem hunger/thirst.
- [ ] `Household.stock` / `Household.water` nie są bezpośrednim źródłem pomocy.
- [ ] Relacja i standing są odczytywane z istniejącego mechanizmu.
- [ ] Nie powstaje drugi inventory, relation, reputation ani interaction system.
- [ ] Plan 152 nie uruchamia autonomicznej dostawy z Planu 167.
- [ ] Jeżeli przed implementacją istnieje portable water consumable, prośba o picie korzysta wyłącznie z jego istniejącego lifecycle.
- [ ] Brak dodatkowej pracy per frame.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` oraz istniejące testy przechodzą.
- [ ] Browser/manual verification sprawdza sukces z rzeczywistym carried consumable oraz odmowę bez niego.
- [ ] Jeżeli portable water nie istnieje, browser verification nie tworzy dla niego specjalnego production provisioning path.

## Weryfikacja

### Techniczna

```text
npx tsc --noEmit
npm run lint
npm run build
npm test
```

### Browser/manual

```text
1. Znajdź NPC posiadającego rzeczywisty carried food.
2. Otwórz istniejący dialog.
3. Poproś o jedzenie.
4. Sprawdź NPC inventory.
5. Sprawdź player inventory.
6. Powtórz przy braku carried food.
7. Sprawdź NPC z mniej korzystną relacją.
8. Sprawdź, że prośba nie uruchamia gather/delivery z 167.
9. Jeżeli codebase posiada portable water consumable:
   - znajdź NPC posiadającego taki item,
   - poproś o picie,
   - sprawdź istniejący consume/needs lifecycle.
10. Jeżeli portable water nie istnieje, potwierdź brak równoległego water lifecycle.
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**

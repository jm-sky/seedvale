# Plan: NPC pomoc graczowi w jedzeniu i piciu

**Created:** 2026-08-18  
**Updated:** 2026-08-19  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~069~~ ~~122~~ ~~156~~  
**Related:** 165, 167

**domain:** settlements-npcs

**tags:** [items-player, quests-progression]

## Cel

Rozszerzyć istniejące interakcje gracz↔NPC o synchroniczną, konwersacyjną pomoc NPC w jedzeniu lub piciu.

Gracz prosi NPC podczas rozmowy, NPC podejmuje lokalną decyzję społeczną i — jeżeli faktycznie posiada odpowiedni carried consumable — przekazuje go graczowi albo stosuje istniejący efekt picia.

Plan nie implementuje autonomicznego dostarczania zasobów do player storage. To jest zakres Planu 167.

```text
Player hunger/thirst
        ↓
prośba w istniejącym dialogu NPC
        ↓
social decision
        ↓
NPC carried Inventory
        ↓
food / portable water
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
natychmiastowy transfer/efekt
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

Plan 152 nie używa assignmentu Helper, player `Container`, autonomicznego gatheringu, transport chain ani helper decision cycle z 167.

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

152 korzysta z istniejącego API i nie mutuje bezpośrednio pól potrzeb ani nie implementuje własnego modelu starvation/dehydration.

Plan 165 jest powiązany, ale nie jest zależnością runtime.

### Player Inventory

`Inventory` pozostaje właścicielem carried items gracza. Używać istniejących `has()`, `count()`, `canAdd()`, `add()` i `remove()`.

### NpcAgent.inventory

`NpcAgent.inventory` jest tymczasowym carrierem zasobów, nie osobistym magazynem NPC.

Pomoc V1 jest możliwa wyłącznie dla zasobu, który NPC faktycznie posiada przy sobie w momencie prośby.

Nie tworzyć mechanizmu wyposażania NPC w jedzenie/wodę tylko na potrzeby 152.

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

Istniejący mechanizm relacji i standing pozostaje właścicielem tych danych. 152 tylko je odczytuje przez istniejący lookup/hook.

Nie tworzyć drugiego relation/reputation store.

### Dialogue / interactions

Istniejący NPC dialogue v2 i NPC interaction flow pozostają właścicielami wejścia interakcji.

Nie tworzyć drugiego menu ani systemu NPC interaction.

## Zakres V1

### 1. Prośba o jedzenie

W istniejącym dialogu NPC dodać opcjonalną akcję „Poproś o jedzenie”.

Po wybraniu:

```text
NPC carried Inventory
    ↓
food consumable
    ↓
social decision
    ↓
transfer itemu
```

NPC nie pobiera food z `Household.stock`.

Jeżeli NPC nie posiada carried food, wynik jest normalną odmową.

### 2. Prośba o picie

W istniejącym dialogu NPC dodać „Poproś o picie”, ale tylko w zakresie istniejącego modelu przenośnej wody.

Przed implementacją należy potwierdzić, że aktualny codebase posiada portable water item, który NPC może faktycznie posiadać w `NpcAgent.inventory`.

Jeżeli nie istnieje taki przepływ, Plan 152 nie tworzy nowego itemu ani nowego water lifecycle tylko dla tej funkcji; pomoc w piciu pozostaje niedostępna w V1.

Nie tworzyć:

```text
Household.water → PlayerNeeds.thirst
```

### 3. Food transfer

Udana pomoc w jedzeniu:

```text
NPC inventory
    ↓ remove 1
Player inventory
    ↓ add 1
```

Gracz otrzymuje consumable i może użyć istniejącego mechanizmu jedzenia.

152 nie wywołuje `eatFood()` przy samym przekazaniu jedzenia.

### 4. Water assistance

Jeżeli istniejący portable water item obsługuje picie, należy wykorzystać istniejącą semantykę `ITEM_CATALOG`, w tym `need`, `relief` i `resultKind`.

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

Istniejący `reactionChance.ts` może dostarczyć wspólnego modelu danych/filozofii, ale nie należy bezpośrednio traktować probabilistycznego `computeReactionChance()` jako gotowego deterministycznego yes/no.

Jeżeli potrzebny jest RNG, użyć istniejącej konwencji projektu zamiast `Math.random()` dodanego tylko dla tej funkcji.

Nie tworzyć nowego utility AI, LLM decision, relation store ani reputation system.

### NPC own-needs guard

Nie tworzyć osobnego systemu reservation/ledger.

Jeżeli istniejący stan NPC wiarygodnie wskazuje, że oddanie konkretnego carried consumable naruszyłoby krytyczną własną potrzebę, NPC nie powinien go oddać.

Jeżeli obecny model nie pozwala wiarygodnie określić takiej sytuacji, zastosować konserwatywną regułę opartą wyłącznie na istniejącym stanie zamiast budować nowy subsystem.

## Dialogue integration

Rozszerzenie powinno zostać wykonane w istniejącym `NpcDialogueMenu.vue` / istniejącym dialogue state.

Preferowany przepływ:

```text
NpcDialogueMenu
  ├── existing topics
  ├── request food
  └── request water
          ↓
      small assistance resolver
          ↓
      result
```

Nie umieszczać food/water assistance w `QuestDialogOverride` tylko dlatego, że istnieje obecny `helpResult`.

Nie tworzyć nowego dialog managera.

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

Dla water zachować istniejącą semantykę consumable i `resultKind`.

## Consumable selection

Nie hardcodować listy food/water w UI.

`ITEM_CATALOG[kind].consumable` pozostaje źródłem prawdy dla `need`, `relief` i `resultKind`.

Ponieważ `Inventory` przechowuje count per `ItemKind`, wybór kandydata musi korzystać z istniejącego inventory API, a nie zakładać item instances.

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

Jeżeli kiedyś będzie potrzebny taki przepływ, powinien zostać rozwiązany przez istniejący model NPC actions / Social Behaviour / Places, bez tworzenia osobnego systemu tylko dla 152.

Nie przenosić tej odpowiedzialności do 167 automatycznie — 167 dotyczy autonomicznej dostawy zasobów do player `Container`.

## Persistence

Nie dodawać nowej persystencji.

152 nie tworzy helper assignment, player storage target, nowej relacji, nowego inventory ani nowego save state.

Jeżeli NPC carried inventory jest runtime-only, 152 nie dorabia persystencji tylko dla tej funkcji.

## Performance

Pomoc jest operacją niskiej częstotliwości.

Nie dodawać:

- per-frame scanów NPC inventory;
- globalnego wyszukiwania pomocnego NPC;
- background willingness updates;
- helper action cycle.

Resolver działa wyłącznie przy interakcji/prośbie.

## Nie w zakresie

- autonomiczna dostawa do player `Container`;
- Plan 167 Helper/Supplier;
- gather → carry → deliver dla gracza;
- player storage;
- pobieranie z `Household.stock` podczas rozmowy;
- pobieranie z `Household.water` podczas rozmowy;
- nowy portable-water item lub lifecycle tylko dla 152;
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
- [ ] Gracz może poprosić NPC o picie, jeśli aktualny codebase posiada odpowiedni carried water item i NPC faktycznie go ma.
- [ ] Pomoc wymaga aktualnej decyzji NPC.
- [ ] Food może zostać przekazane tylko z rzeczywistego carried `NpcAgent.inventory`.
- [ ] Pomoc w piciu korzysta wyłącznie z istniejącego modelu przenośnej wody; Plan 152 nie wprowadza nowego modelu wody ani lifecycle.
- [ ] NPC bez odpowiedniego carried itemu odmawia.
- [ ] Food transfer faktycznie zmniejsza NPC inventory i zwiększa player inventory.
- [ ] Water assistance, jeśli wspierana przez istniejący portable item, korzysta z istniejącego player consume/needs lifecycle.
- [ ] `PlayerNeeds` pozostaje właścicielem hunger/thirst.
- [ ] `Household.stock` / `Household.water` nie są bezpośrednim źródłem pomocy.
- [ ] Relacja i standing są odczytywane z istniejącego mechanizmu.
- [ ] Nie powstaje drugi inventory, relation, reputation ani interaction system.
- [ ] Plan 152 nie uruchamia autonomicznej dostawy z Planu 167.
- [ ] Brak dodatkowej pracy per frame.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` oraz istniejące testy przechodzą.
- [ ] Browser/manual verification sprawdza sukces z rzeczywistym carried consumable oraz odmowę bez niego.

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
1. Znajdź NPC posiadającego carried food.
2. Poproś o jedzenie.
3. Sprawdź NPC inventory i player inventory.
4. Jeśli istnieje aktualny portable water flow, znajdź NPC posiadającego carried water.
5. Poproś o picie i sprawdź istniejący consume/needs lifecycle.
6. Powtórz przy braku odpowiedniego itemu.
7. Sprawdź NPC z mniej korzystną relacją.
8. Sprawdź, że żadna akcja nie uruchamia autonomicznego gather/delivery.
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**

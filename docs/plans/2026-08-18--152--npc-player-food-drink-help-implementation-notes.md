# Plan 152 — NPC pomoc graczowi w jedzeniu i piciu — implementation notes

**Created:** 2026-08-18  
**Updated:** 2026-08-19  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~069~~ ~~122~~ ~~156~~  
**Related:** 165, 167

> Review against the current Seedvale codebase. This file refines implementation details for an AI agent; the plan remains `planned`.
>
> **Sprawdź też opcjonalny plik z suffix `--updated-review.md`, gdzie jest nowsza wersja review planu.**

## 1. Review verdict

Plan 152 powinien pozostać małym rozszerzeniem istniejącego NPC dialogue/interactions, `Inventory`, `PlayerNeeds` oraz social lookup.

Najważniejsza granica:

```text
152 — player requests help
        ↓
NPC social decision
        ↓
existing carried consumable
        ↓
immediate transfer/effect
```

versus:

```text
167 — autonomous delivery
        ↓
NPC goal/pressure
        ↓
resource acquisition
        ↓
transport
        ↓
player Container
```

Nie tworzyć wspólnego `HelperManager`, assignment systemu ani drugiego transport flow.

## 2. Ownership

### PlayerNeeds

`PlayerNeeds` jest właścicielem hunger/thirst oraz istniejących `eatFood()` / `drinkWater()`.

152 korzysta z istniejącego API i nie mutuje bezpośrednio `needs.hunger.current` ani `needs.thirst.current`.

Plan 165 jest powiązany z modelem potrzeb, ale nie jest techniczną zależnością 152. 152 ma działać na aktualnym API i nie implementuje `StarvationDuration` / `DehydrationDuration`.

### Inventory

`Inventory` jest właścicielem carried items.

Używać istniejących:

```text
has()
count()
canAdd()
add()
remove()
```

Nie dotykać prywatnych count maps i nie tworzyć drugiego transfer API.

### NpcAgent.inventory

`NpcAgent.inventory` jest tymczasowym carrierem, nie osobistym magazynem NPC.

152 może użyć wyłącznie zasobu faktycznie znajdującego się tam w momencie prośby.

Nie dodawać provisioning path tylko dlatego, że 152 potrzebuje carried food/water.

### Household

`Household.stock` i `Household.water` pozostają właścicielami zapasów gospodarstwa.

152 nie wykonuje:

```text
Household.stock → Player
Household.water → PlayerNeeds
```

podczas rozmowy.

Nie dodawać `goHomeAndFetchFoodForPlayer()` ani teleportu.

### Relations / standing

Istniejący relation state i player standing pozostają właścicielami danych.

152 tylko odczytuje je przez istniejący lookup/hook.

Nie tworzyć drugiego relation/reputation store.

### Dialogue

`NpcDialogueMenu.vue` i istniejący dialogue/interactions flow pozostają właścicielami UI i wejścia.

Nie repurposować `QuestDialogOverride` tylko dlatego, że UI ma obecny topic `help`.

## 3. Aktualne code anchors

Przed implementacją ponownie prześledzić:

- `src/player/PlayerNeeds.ts` — istniejące operacje potrzeb;
- `src/items/Inventory.ts` — carried inventory i capacity;
- `src/items/itemCatalog.ts` — `consumable.need`, `relief`, `resultKind`;
- `src/ai/NpcAgent.ts` — NPC inventory i social wiring;
- `src/ai/reactionChance.ts` — istniejący social input/model;
- `src/quests/QuestManager.ts` / relation state — relation i standing;
- `src/ui-vue/NpcDialogueMenu.vue` / `src/ui-vue/store.ts` — aktualny dialogue v2;
- `src/app/interactables.ts` — istniejący NPC interaction path;
- aktualny player consume path — szczególnie lifecycle `resultKind` dla portable water.

Nie zakładać, że symbole lub wcześniejsze notes są aktualne bez sprawdzenia codebase.

## 4. Food assistance

Food assistance jest transferem carried itemu, nie natychmiastowym „nakarmieniem” gracza.

```text
NPC inventory
    ↓
food consumable
    ↓
social decision
    ↓
player inventory
```

Bezpieczna kolejność:

```text
find candidate
    ↓
npc.inventory.has(kind, 1)
    ↓
player.inventory.canAdd(kind, 1)
    ↓
resolve willingness
    ↓
npc.inventory.remove(kind, 1)
    ↓
player.inventory.add(kind, 1)
```

Nie wywoływać `eatFood()` przy samym przekazaniu. Gracz otrzymuje consumable i korzysta z normalnego player consume path.

Jeżeli normalni NPC nie posiadają food w carried inventory, nie dodawać specjalnego systemu wyposażania NPC. V1 może być ograniczone do NPC, którzy faktycznie posiadają taki item.

## 5. Water assistance

Woda wymaga szczególnej ostrożności, ponieważ `Household.water` jest osobnym modelem water reserve.

152 nie tworzy nowego przepływu:

```text
Household.water → PlayerNeeds.thirst
```

Najpierw potwierdzić, że aktualny codebase posiada portable water item, który NPC może faktycznie mieć w `NpcAgent.inventory`.

Jeżeli nie ma takiego istniejącego przepływu, nie tworzyć nowego `ItemKind`, nowego container lifecycle ani nowego storage tylko dla 152. Pomoc w piciu pozostaje poza V1 do czasu, aż istniejący system dostarczy odpowiedni carried item.

Jeżeli portable water istnieje, wykorzystać jego istniejącą semantykę:

```text
need
relief
resultKind
```

Nie implementować drugiego `waterskin_full → waterskin_empty` lifecycle.

Przed kodowaniem prześledzić istniejący player consume handler i użyć lub minimalnie rozszerzyć wspólną operację, zamiast kopiować logikę.

## 6. Consumable selection

Nie hardcodować listy food/water w UI.

Źródłem prawdy jest:

```text
ITEM_CATALOG[kind].consumable
```

Kandydat musi odpowiadać żądanej potrzebie:

```text
need === 'hunger'
```

lub:

```text
need === 'thirst'
```

Jeżeli istnieje wiele kandydatów, użyć małej centralnej reguły wyboru. Relief i result lifecycle zawsze pochodzą z katalogu.

`Inventory` jest count-based, więc nie zakładać item instances.

## 7. Social willingness

Istniejący `reactionChance.ts` dostarcza właściwe źródła danych:

```text
relationLevel
standing
personality/openness
relevant traits
```

Nie kopiować tych wartości do assistance state.

`computeReactionChance()` jest modelem probabilistycznym, więc nie należy ślepo traktować go jako deterministycznego yes/no.

Preferowana implementacja:

1. wykorzystać te same social inputs;
2. dać osobistej relacji największy wpływ;
3. standing traktować jako sygnał globalny;
4. użyć istniejących cech osobowości jako modifierów;
5. zasób i własne potrzeby NPC sprawdzać poza social score;
6. jeśli potrzebny jest RNG, użyć istniejącej konwencji projektu;
7. nie dodawać `Math.random()` tylko dla 152.

Nie tworzyć LLM decision, utility-AI ani nowego reputation system.

## 8. NPC own-needs guard

Nie tworzyć osobnego reservation/ledger system.

Jeżeli istniejący stan NPC wiarygodnie wskazuje, że oddanie konkretnego carried consumable zostawiłoby NPC bez krytycznie potrzebnego zasobu, NPC nie powinien go oddać.

Jeżeli obecny model nie pozwala tego wiarygodnie określić, zastosować prostą konserwatywną regułę opartą o istniejący stan.

Nie budować nowego NPC survival subsystem w ramach 152.

## 9. Resolver

Resolver powinien być synchroniczny i wywoływany wyłącznie po akcji gracza.

Koncepcyjny wynik:

```ts
type NpcAssistanceResult = {
  kind: 'food' | 'water'
  outcome: 'given' | 'no_item' | 'unwilling' | 'invalid_state'
  itemKind?: ItemKind
}
```

To guidance, nie wymagany publiczny typ. Nazwa i struktura powinny pasować do istniejących lokalnych konwencji.

Kolejność:

```text
request
  ↓
validate player need
  ↓
find carried candidate
  ↓
resolve social willingness
  ↓
apply existing own-needs guard
  ↓
validate player-side capacity/consume preconditions
  ↓
perform existing mutation
  ↓
return dialogue result
```

Nie usuwać itemu NPC przed zakończeniem wszystkich warunków transferu.

## 10. Dialogue integration

Najmniejszy punkt rozszerzenia powinien znajdować się w aktualnym dialogue v2.

```text
NpcDialogueMenu
  ├── existing topics
  ├── request food
  └── request water
          ↓
      local resolver/callback
          ↓
      result
```

Nie tworzyć drugiego dialog managera.

Nie wkładać food/water state do `QuestDialogOverride` tylko dlatego, że istnieje `helpResult`.

UI może ukryć akcję, gdy ewidentnie nie ma sensu, ale resolver zawsze wykonuje authoritative validation po kliknięciu.

`no_item` jest normalnym wynikiem, a nie błędem systemu.

## 11. Boundary z Planem 167

Plan 167 jest autonomicznym resource delivery flow i ma własne decyzje/assignmenty/action pipeline.

152 nie:

- uruchamia Helper/Supplier assignment;
- tworzy goal/pressure delivery;
- wyszukuje resource source;
- uruchamia gather action;
- transportuje do player `Container`;
- czeka na autonomiczny delivery cycle.

167 również nie powinien być używany jako implementacja kliknięcia „Poproś o jedzenie/picie”.

Wspólne są wyłącznie istniejące domeny, np. `Inventory`, item catalog, player needs i social data.

Kluczowa różnica:

```text
152: "daj mi coś teraz"
167: "NPC autonomicznie postanawia coś dostarczyć"
```

## 12. Boundary z Planami 069, 122, 156 i 165

### 069

Zapasy gospodarstwa pozostają autorytatywne. Nie są shortcutem do player assistance.

### 122

Woda domowa i istniejące water containers pozostają częścią istniejącego water/resource modelu. Nie tworzyć równoległego water systemu dla 152.

### 156

Logistyka może sprawić, że NPC naturalnie będzie miał carried resources. 152 korzysta z tego stanu, ale nie implementuje własnego household-to-NPC provisioning.

### 165

165 rozszerza model potrzeb NPC/player. 152 nie powinien kopiować ani antycypować jego starvation/dehydration mechanics. Korzysta z aktualnego `PlayerNeeds` API.

## 13. Persistence

Nie dodawać nowego save state.

`Inventory` może mieć serialization, ale należy sprawdzić faktyczny NPC save/load path przed twierdzeniem, że carried inventory jest trwale persystowane.

Jeżeli NPC inventory jest runtime-only, 152 nie dodaje ukrytej persystencji tylko dla tej funkcji.

## 14. Performance

Pomoc jest niskoczęstotliwościową interakcją.

Nie dodawać:

- per-frame inventory scans;
- per-frame player need checks wykonywanych przez NPC;
- globalnego wyszukiwania pomocnego NPC;
- background willingness updates;
- helper delivery loop.

Resolver działa tylko podczas dialogu/prośby.

## 15. Testy

Minimum:

- carried food + willing → success; NPC count maleje, player count rośnie;
- food absent → `no_item`, brak mutacji;
- player inventory full → brak mutacji;
- water carried + willing → istniejący thirst effect/lifecycle działa poprawnie;
- water absent → `no_item`, brak mutacji;
- unwilling → brak mutacji inventory/needs;
- social result korzysta z istniejącej relacji;
- standing pochodzi z istniejącego lookup;
- portable water zachowuje istniejący `resultKind` lifecycle;
- own-needs guard nie oddaje krytycznego ostatniego carried resource, jeżeli istniejący stan pozwala to ustalić;
- ponowna prośba po sukcesie nie daje tego samego itemu drugi raz;
- brak wywołania autonomicznego delivery z 167.

## 16. Browser/manual verification

Testować na NPC, który rzeczywiście ma odpowiedni carried item. Nie dodawać production-only provisioning path tylko po to, żeby test był możliwy.

```text
1. NPC z carried food + korzystna relacja
   → request food
   → sukces
   → NPC inventory -1
   → player inventory +1

2. NPC bez carried food
   → request food
   → normalna odmowa
   → brak mutacji

3. Jeśli istnieje portable water flow:
   NPC z carried water
   → request drink
   → istniejący PlayerNeeds/consume lifecycle
   → poprawny stan NPC/player

4. NPC bez carried water
   → normalna odmowa

5. Niekorzystna relacja
   → pomoc nie jest gwarantowana

6. W żadnym przypadku request nie uruchamia gather/delivery z 167.
```

## 17. Verification

Techniczna:

```text
npx tsc --noEmit
npm run lint
npm run build
npm test
```

Browser/manual jest wymagany dla poprawności UI i rzeczywistego transferu itemów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

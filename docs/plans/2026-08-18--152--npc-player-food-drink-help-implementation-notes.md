# Plan 152 — NPC pomoc graczowi w jedzeniu i piciu — implementation notes

**Created:** 2026-08-18  
**Updated:** 2026-08-19  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~069~~ ~~122~~ ~~156~~ 165  
**Related:** 167

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
immediate assistance
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

Plan 165 jest aktywną zależnością planistyczną, ponieważ rozszerza kontrakt potrzeb. 152 nie implementuje `StarvationDuration` / `DehydrationDuration` ani równoległego survival modelu.

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

`NpcAgent.inventory` jest temporary/carried state.

Nie traktować go jako NPC backpack, household storage ani personal food reserve.

152 może użyć wyłącznie itemu faktycznie znajdującego się w inventory w momencie prośby.

Nie dodawać provisioning path tylko dlatego, że 152 potrzebuje carried food/water.

### Household

`Household.stock` i `Household.water` pozostają authoritative household resources.

152 nie implementuje:

```text
Household.stock → Player
Household.water → PlayerNeeds
```

w ramach synchronicznej pomocy.

### Relations / standing

Korzystać z istniejącego relation/standing state przez istniejący lookup/hook.

Nie kopiować danych do assistance state i nie tworzyć drugiego relation/reputation store.

### Dialogue

`NpcDialogueMenu.vue` i istniejący dialogue/interactions flow pozostają właścicielami UI i wejścia.

Nie tworzyć drugiego dialog managera.

Nie repurposować `QuestDialogOverride` tylko dlatego, że UI ma obecny topic `help`.

### Player Storage

Player `Container` / storage pozostaje domeną Planu 167.

152 nie dodaje żadnego targetu storage.

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

Nie zakładać, że wcześniejsze notes są aktualniejsze od kodu.

## 4. Food assistance

Food assistance jest transferem carried itemu, nie natychmiastowym „nakarmieniem” gracza.

```text
player request
    ↓
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
apply own-needs guard
    ↓
npc.inventory.remove(kind, 1)
    ↓
player.inventory.add(kind, 1)
```

Nie wywoływać `eatFood()` przy samym przekazaniu. Gracz otrzymuje consumable i korzysta z normalnego player consume path.

Jeżeli normalni NPC nie posiadają food carried w normalnej symulacji, nie dodawać specjalnego systemu wyposażania NPC. V1 może być ograniczone do NPC, którzy faktycznie posiadają taki item.

## 5. Water assistance

Aktualny codebase nie potwierdza portable water item dostępnego jako carried NPC consumable.

Nie zakładać istnienia `waterskin_full` tylko dlatego, że nazwa występuje w starszej dokumentacji.

152 nie tworzy:

```text
Household.water → PlayerNeeds.thirst
```

ani nowego `ItemKind`, waterskin lifecycle, container lifecycle czy storage tylko dla tej funkcji.

Jeżeli przed implementacją istniejący codebase udostępni portable water consumable, resolver powinien użyć:

```text
ITEM_CATALOG[kind].consumable
    ↓
need
relief
resultKind
```

i istniejącego player consume lifecycle.

Nie kopiować `resultKind` swap logic.

## 6. Consumable selection

Nie hardcodować food/water listy w UI.

Źródło prawdy:

```text
ITEM_CATALOG[kind].consumable
```

Food candidate:

```text
consumable?.need === 'hunger'
```

Water candidate, tylko jeśli istnieje:

```text
consumable?.need === 'thirst'
```

Jeżeli istnieje wiele kandydatów, użyć jednej małej centralnej reguły wyboru.

Relief i `resultKind` zawsze pochodzą z katalogu.

`Inventory` jest count-based, więc selekcja nie może zakładać item instances.

## 7. Social willingness

Istniejący `reactionChance.ts` pozostaje źródłem wspólnej filozofii:

```text
relationLevel
+ standing
+ personality/openness
+ traits
```

Nie kopiować tych danych do nowego state.

`computeReactionChance()` nie jest automatycznie deterministycznym yes/no.

Preferowany kierunek:

1. użyć istniejącego `PlayerSocialLookup`;
2. dać osobistej relacji największe znaczenie;
3. standing traktować jako sygnał globalny;
4. używać personality/traits jako modifierów;
5. oddzielić warunki zasobowe od social score;
6. użyć istniejącej konwencji RNG, jeśli rzeczywiście jest potrzebne;
7. nie dodawać `Math.random()` tylko dla 152.

Nie tworzyć utility AI ani LLM decision.

## 8. NPC own-needs guard

Nie tworzyć reservation/ledger.

Jeżeli istniejący stan NPC wiarygodnie wskazuje, że oddanie konkretnego carried consumable zostawiłoby NPC bez krytycznie potrzebnego zasobu, NPC nie powinien go oddać.

Jeżeli obecny model nie pozwala tego wiarygodnie określić, nie budować nowego subsystemu survival tylko dla 152; zastosować prostą konserwatywną regułę opartą o istniejący stan.

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
validate player state
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
- water carried + willing → istniejący thirst effect/lifecycle działa poprawnie, jeśli portable water istnieje;
- water absent → `no_item`, brak mutacji, jeśli portable water istnieje;
- unwilling → brak mutacji inventory/needs;
- social result korzysta z istniejącej relacji;
- standing pochodzi z istniejącego lookup;
- portable water zachowuje istniejący `resultKind` lifecycle, jeśli istnieje;
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

# Plan 152 — NPC pomoc graczowi w jedzeniu i piciu — implementation notes

**Created:** 2026-08-18  
**Updated:** 2026-08-25  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** 165  
**Related:** 167, ai-002, ai-003

> Review against the current Seedvale codebase. This file refines implementation details for an AI agent; the plan remains `planned`.
>
> **Sprawdź też opcjonalny plik z suffix `--updated-review.md`, gdzie jest nowsza wersja review planu.**

## 1. Review verdict

Plan 152 powinien pozostać małym rozszerzeniem istniejącego NPC dialogue/interactions, `Inventory`, `PlayerNeeds` oraz social lookup.

Od czasu pierwotnego planu zmieniły się dwa istotne założenia:

1. `ai-002` wprowadził personality/role modifiers do NPC need arbitration; 152 jest jednak **social decision**, więc nie powinien być dopinany do Need/Pressure/Strategy pipeline.
2. Portable water jest już obecne w aktualnym item/consume modelu jako `waterskin_full` / `waterskin_empty`; `ITEM_CATALOG` ma `consumable.need === 'thirst'`, `relief` i `resultKind`, a player survival actions obsługują istniejący lifecycle.

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

## 2. AI architecture boundary

### ai-002

Można reuse'ować istniejące:

```text
relation / standing
personality / traits
social lookup
```

do wyliczenia willingness.

Nie uruchamiać dla 152:

```text
generateNeedPressures()
scoreNeedCandidates()
pickNeed()
```

Pomoc graczowi nie jest potrzebą NPC.

### ai-003

Nie używać:

```text
getCandidateStrategies()
selectStrategy()
```

Candidate strategies opisują sposoby realizowania celu/potrzeby NPC. Kliknięcie „Poproś o jedzenie/picie” jest synchroniczną akcją społeczną.

Właściwy przepływ:

```text
player request
    ↓
social decision
    ↓
carried consumable
    ↓
transfer/use
```

Nie implementować sztucznego:

```text
player request → Need → Strategy → Action
```

## 3. Ownership

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

`NpcAgent.inventory` jest carried/temporary state.

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

Nie kopiować danych do nowego state i nie tworzyć drugiego relation/reputation store.

### Dialogue

`NpcDialogueMenu.vue` i istniejący dialogue/interactions flow pozostają właścicielami UI i wejścia.

Nie tworzyć drugiego dialog managera.

Nie repurposować `QuestDialogOverride` tylko dlatego, że UI ma obecny topic `help`.

### Player Storage

Player `Container` / storage pozostaje domeną Planu 167.

152 nie dodaje żadnego targetu storage.

## 4. Aktualne code anchors

Przed implementacją ponownie prześledzić:

- `src/player/PlayerNeeds.ts` — istniejące operacje potrzeb;
- `src/items/Inventory.ts` — carried inventory i capacity;
- `src/items/itemCatalog.ts` — `consumable.need`, `relief`, `resultKind`;
- `src/ai/NpcAgent.ts` — NPC inventory i social wiring;
- `src/ai/reactionChance.ts` — istniejący social input/model;
- relation/standing state — aktualny lookup/hook, bez tworzenia nowego store;
- `src/ui-vue/NpcDialogueMenu.vue` / dialogue state — aktualny dialogue v2;
- `src/app/interactables.ts` — istniejący NPC interaction path;
- `src/app/actions/survivalActions.ts` — player food/water consume/fill lifecycle;
- aktualny item catalog — szczególnie `waterskin_full`, `waterskin_empty` i `resultKind`.

Nie zakładać, że wcześniejsze notes są aktualniejsze od kodu.

## 5. Food assistance

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
resolve social willingness
    ↓
apply own-needs guard
    ↓
player.inventory.canAdd(kind, 1)
    ↓
npc.inventory.remove(kind, 1)
    ↓
player.inventory.add(kind, 1)
```

Nie wywoływać `eatFood()` przy samym przekazaniu. Gracz otrzymuje consumable i korzysta z normalnego player consume path.

Jeżeli normalni NPC nie posiadają food carried w normalnej symulacji, nie dodawać specjalnego systemu wyposażania NPC. V1 może być ograniczone do NPC, którzy faktycznie posiadają taki item.

## 6. Water assistance

Portable water jest już częścią aktualnego modelu itemów.

Źródłem semantyki jest:

```text
ITEM_CATALOG[kind].consumable
    ├── need: 'thirst'
    ├── relief
    └── resultKind: 'waterskin_empty'
```

oraz istniejący player consume/fill lifecycle.

Nie tworzyć:

```text
Household.water → PlayerNeeds.thirst
```

ani nowego `ItemKind`, waterskin lifecycle, container lifecycle czy storage.

Pomoc NPC powinna przekazać istniejący carried `waterskin_full` do player inventory. Sam transfer nie powinien:

- bezpośrednio zmieniać `PlayerNeeds.thirst`;
- ręcznie wykonywać `resultKind` swap;
- kopiować logiki `consumeItem()`;
- tworzyć drugiego water systemu.

Późniejsze użycie bukłaka przez gracza pozostaje odpowiedzialnością istniejącego player consume lifecycle.

## 7. Consumable selection

Nie hardcodować food/water listy w UI.

Źródło prawdy:

```text
ITEM_CATALOG[kind].consumable
```

Food candidate:

```text
consumable?.need === 'hunger'
```

Water candidate:

```text
consumable?.need === 'thirst'
```

Jeżeli istnieje wiele kandydatów, użyć jednej małej centralnej reguły wyboru zgodnej z istniejącym inventory/catalog model.

Relief i `resultKind` zawsze pochodzą z katalogu.

Nie zakładać item instances — consumables mogą być count-based.

## 8. Social willingness

Istniejący `reactionChance.ts` pozostaje źródłem wspólnej filozofii:

```text
relationLevel
+ standing
+ personality / traits
```

Nie kopiować tych danych do nowego state.

`computeReactionChance()` nie jest automatycznie deterministycznym yes/no dla assistance.

Preferowany kierunek:

1. użyć istniejącego social lookup;
2. dać osobistej relacji największe znaczenie;
3. standing traktować jako sygnał globalny;
4. używać personality/traits jako modifierów;
5. oddzielić warunki zasobowe od social score;
6. użyć istniejącej konwencji RNG, jeśli rzeczywiście jest potrzebne;
7. nie dodawać `Math.random()` tylko dla 152.

Nie tworzyć utility AI ani LLM decision.

## 9. NPC own-needs guard

Nie tworzyć reservation/ledger.

Jeżeli istniejący stan NPC wiarygodnie wskazuje, że oddanie konkretnego carried consumable zostawiłoby NPC bez krytycznie potrzebnego zasobu, NPC nie powinien go oddać.

Jeżeli obecny model nie pozwala tego wiarygodnie określić, nie budować nowego subsystemu survival tylko dla 152; zastosować prostą konserwatywną regułę opartą o istniejący stan.

## 10. Resolver

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

Dla water zachować istniejące `resultKind` semantics jako część późniejszego player consume path, a nie resolvera pomocy.

## 11. Dialogue integration

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

## 12. Boundary z Planem 167

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

## 13. Boundary z Planami 069, 122, 156 i 165

### 069

Zapasy gospodarstwa pozostają autorytatywne. Nie są shortcutem do player assistance.

### 122

Istniejący water/resource model pozostaje właścicielem water containers i water state. 152 korzysta z istniejących item semantics zamiast tworzyć parallel water system.

### 156

Logistyka może sprawić, że NPC naturalnie będzie miał carried resources. 152 korzysta z tego stanu, ale nie implementuje własnego household-to-NPC provisioning.

### 165

165 rozszerza model potrzeb NPC/player. 152 nie kopiuje ani nie antycypuje jego starvation/dehydration mechanics. Korzysta z aktualnego `PlayerNeeds` API.

## 14. Persistence

Nie dodawać nowego save state.

`Inventory` może mieć serialization, ale należy sprawdzić faktyczny NPC save/load path przed twierdzeniem, że carried inventory jest trwale persystowane.

Jeżeli NPC inventory jest runtime-only, 152 nie dodaje ukrytej persystencji tylko dla tej funkcji.

## 15. Performance

Pomoc jest niskoczęstotliwościową interakcją.

Nie dodawać:

- per-frame inventory scans;
- per-frame player need checks wykonywanych przez NPC;
- globalnego wyszukiwania pomocnego NPC;
- background willingness updates;
- helper delivery loop.

Resolver działa tylko podczas dialogu/prośby.

## 16. Testy

Minimum:

- carried food + willing → success; NPC count maleje, player count rośnie;
- food absent → `no_item`, brak mutacji;
- player inventory full → brak mutacji;
- carried `waterskin_full` + willing → transfer success;
- water absent → `no_item`, brak mutacji;
- unwilling → brak mutacji inventory/needs;
- social result korzysta z istniejącej relacji;
- standing pochodzi z istniejącego lookup;
- `waterskin_full` zachowuje istniejący `resultKind` lifecycle po późniejszym użyciu przez playera;
- own-needs guard nie oddaje krytycznego ostatniego carried resource, jeżeli istniejący stan pozwala to ustalić;
- ponowna prośba po sukcesie nie daje tego samego itemu drugi raz;
- brak wywołania autonomicznego delivery z 167;
- brak użycia `selectStrategy()` / Need arbitration do obsługi prośby.

## 17. Browser/manual verification

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

3. NPC z carried waterskin_full
   → request drink
   → sukces
   → player inventory +1
   → użyj otrzymanego bukłaka przez istniejący player consume path
   → sprawdź thirst + resultKind

4. NPC bez carried water
   → normalna odmowa

5. Niekorzystna relacja
   → pomoc nie jest gwarantowana

6. W żadnym przypadku request nie uruchamia gather/delivery z 167.

7. W żadnym przypadku request nie przechodzi przez NPC Need/Strategy pipeline.
```

## 18. Verification

Techniczna:

```text
npx tsc --noEmit
npm run lint
npm run build
npm test
```

Browser/manual jest wymagany dla poprawności UI i rzeczywistego transferu itemów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

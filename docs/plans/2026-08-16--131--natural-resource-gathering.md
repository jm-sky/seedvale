# Plan: Natural Resource Gathering

**Created:** 2026-08-16
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~032~~

domain: `settlements-npcs`
tags: [items-player, world-terrain]

## Cel

Dokończyć połączenie istniejących natural resources z rzeczywistą pracą NPC: NPC powinien pozyskać dostępny zasób ze świata, przenieść go w `Inventory`, a następnie dostarczyć go do istniejącego gospodarstwa / ekonomii osady.

Docelowy przepływ:

```text
World resource
    ↓
NPC decision / work
    ↓
existing target + action
    ↓
NPC Inventory
    ↓
Household / SettlementEconomy
```

Plan **nie tworzy nowego Natural Resource System**. `NaturalResource`, `ResourceDeposits`, `TreeLifecycle`, `Inventory`, `ItemKind`, `Household`, `SettlementEconomy`, NPC `PlannedAction` i istniejące potrzeby/praca pozostają źródłami prawdy.

## Co już istnieje — audyt codebase

### Natural resources / world generation

- `src/terrain/naturalResources.ts` generuje deterministyczne `NaturalResource` na podstawie `(seed, resource-grid cell, terrain environment)` i udostępnia `resourcesNear()` / `dominantResourceNear()`.
- `NaturalResource` jest nadal przede wszystkim warstwą danych świata używaną przez generowanie osad / atrakcyjność miejsca. Komentarz w kodzie wyraźnie odróżnia ją od collectible/interactable world objects. Nie należy traktować każdego typu (`fish`, `fertile_soil`, `clay`, `salt`, `resin`, `herbs`) jako gotowego gather targetu.
- `src/terrain/resourceDeposits.ts` materializuje tylko `iron`, `coal`, `gold` jako widoczne, streamowane depozyty. Ma już `queryNearest()` i `mine()`.
- `src/terrain/depositMining.ts` mapuje ore → `ItemKind` (`iron`, `coal`, `gold`) i definiuje yield / depletion.
- World generation i streaming depozytów są deterministyczne; nie należy dodawać drugiego registry natural resources ani drugiego streamingu.

### NPC / gathering

- `src/ai/NpcAgent.ts` ma już wspólny przepływ `goTo → execute`, oparty o `PlannedAction`, zamiast osobnych FSM dla każdego zasobu.
- `NpcAgent` ma już akcje `chop`, `deposit`, `drink`, `eat`, `work`.
- Istnieje realny przepływ `chop → deposit`; komentarz w `src/economy/npcWork.ts` wskazuje, że harvest pozostaje w `NpcAgent`, a mutacja stocku następuje dopiero po skutecznym deposit.
- `src/world/treeHarvest.ts` jest istniejącym mechanizmem harvestu drzewa i musi pozostać jedynym mechanizmem ścinania drzew przez NPC i gracza.
- `src/economy/npcWork.ts` obsługuje `commitWoodcutterDeposit()` oraz wspólne role/work production. Nie należy omijać tego przepływu przez bezpośrednie dodawanie stocku.

### Inventory / economy

- `Inventory` i `ItemKind` są wspólnym systemem przedmiotów gracza/NPC; nie tworzyć osobnego `ResourceInventory`.
- `Household` istnieje i przechowuje m.in. `food` oraz `wood`, z polityką `minimum` / `target` / `capacity` oraz `deposit()`.
- `Household.deposit()` może przekazać overflow do `SettlementEconomy`.
- Plan 069 celowo nie wprowadził fizycznego Village Storage ani osobnego storage systemu; nie dodawać go w tym planie.
- Plan 122 wdrożył pełny pierwszy transportowy przykład dla wody (`well → NPC Inventory → household WaterReserve / barrel/trough`). Woda jest więc **wzorem implementacyjnym**, a nie brakującym zakresem tego planu.

### Existing resource paths

- Wood: istnieje NPC `chop → deposit`, household stock oraz `TreeLifecycle` / `treeHarvest`.
- Ore: istnieje player-facing `ResourceDeposits.queryNearest()` / `mine()`, ale brak odpowiednika NPC, który wykorzystuje ten sam depozyt jako źródło i przenosi yield do NPC inventory.
- Food: istnieje household consumption oraz istniejące garden/food gathering path; nie należy tworzyć nowego food resource systemu. Należy sprawdzić i ewentualnie uogólnić istniejący target/action, jeśli potrzebny jest brakujący NPC transport do household.
- Water: zaimplementowane w planie 122; nie implementować ponownie.

## Zakres

### 1. Uogólnienie istniejącego `chop → deposit`

Wykorzystać istniejący wzorzec jako podstawę dla innych gather actions:

```text
choose target
    ↓
goTo source
    ↓
gather / execute
    ↓
NPC Inventory
    ↓
goTo destination
    ↓
deposit
    ↓
Household / SettlementEconomy
```

Nie tworzyć `ResourceGatheringManager` ani `GatheringSystem`.

Jeżeli obecny `NpcAgent` ma resource-specific warunki zaszyte w `chop`, wydzielić tylko minimalny współdzielony kontrakt / helper potrzebny do reuse. Nie przepisywać całego FSM.

### 2. Wood — zachować istniejący mechanizm

Nie implementować wood gathering od zera.

Zweryfikować i ewentualnie poprawić tylko brakujące elementy, aby istniejący przepływ był zgodny z generycznym modelem:

```text
Living tree
    ↓
NPC chop
    ↓
existing tree harvest/lifecycle
    ↓
NPC carries wood
    ↓
Household.deposit()
    ↓
SettlementEconomy overflow
```

W szczególności:

- nie mintować drewna przez `work` bez harvestu drzewa;
- nie omijać `TreeLifecycle`;
- nie dodawać drugiego stanu drzewa tylko dla NPC;
- zachować istniejący `commitWoodcutterDeposit()` / household overflow.

### 3. Ore — NPC gathering przez istniejące `ResourceDeposits`

Dodać NPC-owy konsument istniejącego depozytu ore.

Preferowany przepływ:

```text
ResourceDeposits
    ↓
query nearest usable ore
    ↓
NPC goTo deposit
    ↓
existing deposit depletion / yield
    ↓
NPC Inventory: iron / coal / gold
    ↓
deposit to Household / SettlementEconomy
```

Kluczowe zasady:

- użyć tego samego `ResourceDeposits` i `depositMining.ts`;
- nie generować NPC-specific ore deposits;
- nie tworzyć drugiego depletion state;
- yield ma pochodzić z istniejącego `mine()` / wspólnej funkcji domenowej, po ewentualnym minimalnym rozszerzeniu API o NPC consumption;
- jeśli istniejące `mine()` jest zbyt player-specific, rozdzielić **mechanizm zużycia depozytu** od player input/channel, a nie kopiować logikę.

NPC nie musi używać playerowego pickaxe input ani UI/progress overlay. Może użyć istniejącego `execute` z czasem pracy określonym przez wspólny action definition.

### 4. Resource target selection

Rozszerzyć istniejące decyzje NPC tylko o brakujący target selection.

Decyzja powinna brać pod uwagę:

```text
Household shortage / target
        +
Settlement demand
        +
Profession / role
        +
Available nearby resource
        ↓
choose action
```

Nie dodawać osobnego `ResourceDemandSystem`.

Jeżeli `Needs` nie powinny znać storage, pozostawić podział odpowiedzialności:

- `Needs` — sygnalizuje stan/potrzebę;
- `Household` — zna stock i capacity;
- NPC decision/work — wybiera gathering;
- action — wykonuje transport i mutację zasobu.

### 5. Food — reuse istniejącego gathering

Zidentyfikować istniejący NPC food/garden gather path i doprowadzić go do tego samego końcowego kontraktu:

```text
Food source
    ↓
NPC gathers
    ↓
NPC Inventory / existing gathered result
    ↓
Household.deposit(food)
```

Nie tworzyć nowego `FoodGatheringSystem`.

`fish`, `herbs`, `resin`, `salt`, `clay`, `fertile_soil` nie są automatycznie częścią tego zakresu tylko dlatego, że występują w `NaturalResource`. Jeśli brak im rzeczywistego world source / action / item, pozostają przyszłymi resource consumers.

### 6. Settlement demand bez nowego storage

Po gathering zasób powinien trafiać do istniejącego `Household`, a overflow do istniejącej `SettlementEconomy`.

Nie dodawać:

- Village Storehouse,
- Storage Shed,
- nowej abstrakcji storage,
- osobnego `ResourceRequest` systemu.

Jeżeli przyszły plan production/trade będzie wymagał fizycznego magazynu, powinien być osobnym planem opartym o obecne `Household` / `SettlementEconomy`.

### 7. Profesje

Wykorzystać istniejące `Role` / production definitions jako preferencje.

Przykładowo:

- `woodcutter` → wood;
- `miner` → ore;
- `farmer` → food / existing farm path.

Profesja nie może być jedynym warunkiem wykonania gathering. NPC powinien móc wykonać podstawową pracę awaryjnie, jeśli istniejący decision model na to pozwala.

Nie dodawać nowych profesji tylko na potrzeby tego planu.

## Implementation phases

### Phase 1 — Audit existing action paths

Przed zmianami potwierdzić w aktualnym kodzie konkretne funkcje dla:

- NPC `choose` / `pickNeed` / decision;
- `NpcPlannedAction` i `goTo → execute`;
- `chop → deposit`;
- `treeHarvest` / `TreeLifecycle`;
- `ResourceDeposits.queryNearest()` / `mine()`;
- household `deposit()`;
- food/garden gathering;
- settlement economy overflow;
- action queue / collider approach dla world targets.

Jeżeli audit pokaże, że część wymaganego flow już istnieje, plan implementuje tylko brakujące połączenie.

### Phase 2 — Shared gathering completion contract

Ujednolicić minimalnie końcówkę gather action:

```text
gather source
    ↓
produce ItemKind/count
    ↓
NPC Inventory
    ↓
deposit destination
```

Najważniejsza zasada: **source depletion i item yield muszą być zatwierdzone w istniejącym domain system**, nie w ogólnym NPC FSM.

### Phase 3 — NPC ore gathering

Podłączyć `ResourceDeposits` do NPC work flow.

Dodać tylko API potrzebne do bezpiecznego NPC extraction, np. wspólne `extract/mine` używane zarówno przez player interaction, jak i NPC action, jeśli obecne `mine()` nie może być współdzielone bez warstwy UI.

### Phase 4 — Household delivery / overflow

Zapewnić, że ore i istniejące gathered food/wood kończą w:

```text
NPC Inventory
    ↓
Household.deposit()
    ↓
SettlementEconomy overflow
```

Nie tworzyć kolejnej ścieżki stock mutation.

### Phase 5 — Decision / work integration

Dodać gathering jako normalną możliwość istniejącego decision/work flow.

Priorytet:

```text
critical household shortage
    ↓
appropriate gather target
```

ale bez ciągłego loopa, gdy:

- target jest pusty/depleted;
- household jest już pełny;
- settlement nie może przyjąć overflow;
- target jest poza aktualnym world interest range.

### Phase 6 — Food path alignment

Jeśli audit wykaże, że food gathering nadal korzysta z odrębnej ścieżki, zbliżyć ją do wspólnego action/deposit contract bez tworzenia nowego systemu.

## Resource scope matrix

| Resource | World source | Existing NPC path | Plan 131 |
|---|---|---|---|
| `wood` | living trees | `chop → deposit` | reuse / close gaps |
| `iron` | `ResourceDeposits` | player mining | add NPC extraction |
| `coal` | `ResourceDeposits` | player mining | add NPC extraction |
| `gold` | `ResourceDeposits` | player mining | add NPC extraction |
| `food` | existing garden/food sources | existing path | align with household delivery |
| `water` | well / WaterReserve | plan 122 | already implemented; no duplicate work |
| `fish` | `NaturalResource` signal only | no full source/action | defer |
| `herbs` | `NaturalResource` signal only | no full source/action | defer |
| `clay` | `NaturalResource` signal only | no gather action | defer |
| `salt` | `NaturalResource` signal only | no gather action | defer |
| `resin` | `NaturalResource` signal only | no gather action | defer |
| `fertile_soil` | terrain/resource signal | no collectible flow | defer |

## Persistence / streaming

Plan 131 nie powinien wprowadzać nowego save systemu.

Przed implementacją sprawdzić, które stany już są persystowane, a które są świadomie session/runtime-only:

- `TreeLifecycle` / sparse tree overrides;
- `ResourceDeposits` depletion;
- `Household` registry/stock;
- `SettlementEconomy` stock;
- NPC inventory/action state.

W szczególności nie udawać pełnej persistence, jeśli obecny model świadomie odtwarza NPC/deposits po reloadzie.

Jeżeli NPC extraction wymaga trwałego stanu ore depletion, należy najpierw porównać to z istniejącym persistence contract i dopiero wtedy zdecydować, czy rozszerzenie save schema należy do tego planu. Nie dodawać pola do `SaveData` tylko dlatego, że obiekt Three.js jest streamowany.

## Performance / simulation

Gathering musi działać bez gracza i nie może wymagać stałego skanowania całego świata.

Preferować:

- istniejące loaded/nearby target queries;
- istniejące chunk/deposit streaming;
- krótkie, throttlowane decyzje NPC;
- reuse `resourcesNear()` tylko tam, gdzie faktycznie jest potrzebne;
- brak globalnego `ResourceGatheringManager` iterującego po wszystkich zasobach.

NPC remote/off-screen simulation nie powinno zostać przebudowane przez ten plan. Gathering powinien korzystać z istniejącej fidelity model i zostać rozszerzony później, jeśli economy/off-screen simulation tego wymaga.

## Acceptance criteria

### Wood

- istniejący NPC woodcutting nadal korzysta z `TreeLifecycle` / `treeHarvest`;
- wood nie jest mintowane przez samo `work`;
- gathered wood trafia do household, a overflow do istniejącej `SettlementEconomy`;
- nie istnieje drugi wood gathering path.

### Ore

- NPC może znaleźć załadowany `iron`, `coal` lub `gold` deposit;
- NPC może dojść do depozytu przez istniejący movement/action flow;
- extraction zmniejsza ten sam stan `ResourceDeposits`, który wykorzystuje player;
- yield trafia do NPC `Inventory` jako istniejący `ItemKind`;
- NPC może dostarczyć ore do household / settlement economy;
- depleted deposit nie jest ponownie wybierany;
- nie powstaje NPC-only ore registry/depletion state.

### Food

- istniejący food gathering path zostaje wykorzystany;
- gathered food może trafić do household przez istniejący `deposit()`;
- nie powstaje drugi food gathering system.

### Decision / simulation

- gathering jest wybierane przez istniejący NPC decision/work flow;
- potrzeby / household shortage mogą prowadzić do gather action tam, gdzie istniejący model tego wymaga;
- profession wpływa na preferencję, ale nie tworzy osobnego AI;
- NPC transportuje zasób fizycznie zamiast teleportować go do storage;
- brak nieskończonego `gather → deposit → gather` loopa przy pełnym stocku lub pustym source;
- gathering działa bez aktywnego gracza.

### Architecture

- brak `ResourceGatheringManager`;
- brak `WaterSystem`, `FoodGatheringSystem`, `WoodGatheringSystem` lub `NpcResourceManager`;
- brak drugiego inventory/storage/economy systemu;
- `NaturalResource` pozostaje źródłem danych świata, a nie staje się magicznym globalnym inventory;
- world resource depletion pozostaje własnością odpowiedniego istniejącego systemu.

## Verification

### Automated / technical

- `npx tsc --noEmit`;
- `npm run lint` dla touched files;
- `npm run test`;
- `npm run build`;
- testy target selection / depleted target fallback;
- testy ore extraction → `ItemKind` yield;
- testy household deposit / settlement overflow;
- test istniejącego wood path po zmianach.

### Browser / gameplay

Zweryfikować w rzeczywistym świecie:

1. Woodcutter znajduje drzewo i ścina je istniejącym mechanizmem.
2. Drewno jest fizycznie niesione i trafia do household.
3. NPC miner znajduje widoczny ore deposit.
4. Miner idzie do depozytu i wykonuje gather/mining action.
5. Depozyt wizualnie i logicznie traci zasób.
6. Ore trafia do NPC inventory.
7. NPC wraca i deponuje ore w household/economy.
8. Kilku NPC może gatherować bez duplikowania tego samego yield.
9. Depleted resources nie powodują stuck/loop.
10. Food gathering nadal zasila household.
11. Woda z planu 122 nadal działa i nie została zdublowana przez plan 131.
12. Wszystko działa bez ingerencji gracza.

### Streaming

Sprawdzić:

- NPC nie próbuje używać unloadniętego targetu;
- target znika/depletuje się podczas planowania i NPC bezpiecznie wybiera nowy;
- stream-out nie powoduje podwójnego yield;
- powrót do chunku nie tworzy dodatkowego depletion state poza istniejącym persistence contract.

## Out of scope

- nowy Village Storehouse / physical storage;
- pełna produkcja i processing dóbr — przyszły plan 071;
- trade;
- fishing system;
- herb/clay/salt/resin gathering bez istniejących world sources/actions;
- off-screen aggregated economy;
- pełna NPC persistence;
- nowe profesje;
- LLM-driven gathering decisions;
- przebudowa NPC FSM;
- przebudowa NaturalResource world generation.

## Expected result

Po planie natural resources przestają być tylko elementem atrakcyjności świata / pojedynczych player interactions i zaczynają uczestniczyć w istniejącym przepływie gospodarczym NPC:

```text
World
 ├─ trees ───────→ chop ──→ wood ──→ Household
 ├─ ore deposits ─→ mine ──→ ore ───→ Household
 └─ food sources ─→ gather ─→ food ─→ Household
                                      ↓
                               SettlementEconomy
```

Woda pozostaje osobnym, już wdrożonym przykładem transportowego resource flow z planu 122. Kolejnym naturalnym rozszerzeniem po tym planie jest production/processing, a nie kolejny parallel gathering/storage system.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

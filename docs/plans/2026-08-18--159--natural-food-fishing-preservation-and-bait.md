# Plan: Natural Food, Fishing, Preservation and Bait

**Created:** 2026-08-18  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** L  
**Depends on:** ~~155~~ ~~156~~ ~~106~~ ~~141~~

domain: `items-player`
tags: [`fauna`, `settlements-npcs`]

## Cel

Rozbudować istniejące systemy o spójny ekosystem żywności: naturalną żywność, uprawy, pszczoły i miód, wędkarstwo, zanętę, świeżość i psucie, suszenie/konserwowanie oraz przynęty do istniejących pułapek.

Plan rozszerza istniejące mechanizmy `ItemKind`/item catalog, stackable inventory, consumables, household/settlement storage, resource/source lifecycles, fauna, interaction, world time i persistence. Nie tworzy równoległych systemów food, inventory, storage, resource, fishing ani trap.

155, 156, 106 i 141 są już ukończone. Ich istniejące ownership boundaries są częścią kontraktu tego planu.

## 1. Zasady architektoniczne

- Żywność pozostaje **stackable**. `ItemInstance` z 155 jest dla indywidualnie stanowych przedmiotów, np. pułapek; nie tworzyć jednej instancji na każdą sztukę jedzenia.
- Freshness jest stanem stacka, najlepiej reprezentowanym przez timestamp/deadline i wyliczany na podstawie `ItemCatalogEntry + world time`.
- Nie tworzyć `FoodManager`, `FreshnessManager`, `FishingManager`, `CropManager`, `DryingManager`, `LogisticsManager` ani drugiego inventory/storage systemu.
- Food metadata rozszerza istniejący `ItemCatalogEntry`; nie tworzyć osobnego katalogu żywności.
- Player food consumption nadal należy do istniejącego modelu z 106 i istniejącego `consumable`/`eatFood()`.
- NPC food logistics korzysta z istniejącego `Household.stock` / `SettlementEconomy` i transportu z 156.
- Natural food i crops rozszerzają istniejące source/spawner/resource lifecycles.
- Trap bait rozszerza istniejący `PlacedTrapRecord` / `animalTraps.ts`.
- Simulation state nie może być własnością Three.js `Object3D`.

## 2. Żywność i item definitions

Reuse before adding. Istniejące produkty obejmują m.in.:

- `mushroom`
- `tomato`
- `raw_meat`
- species meat: `deer_meat`, `wolf_meat`, `boar_meat`, `rabbit_meat`, `beef`
- `roasted_meat`
- `cheese`
- `dried_meat`

Nowe `ItemKind` tylko dla faktycznie brakujących produktów:

- berries
- apple
- nuts
- honey
- carrot
- potato
- cabbage
- fish
- dried fish

Nie dodawać `fresh_*`, `spoiled_*`, `*_bait` jako osobnych `ItemKind`.

Food metadata ma rozszerzać centralny item catalog, np. o food value, freshness parameters i opcjonalną kategorię bait.

## 3. Freshness

Wprowadzić wspólny mechanizm:

`Fresh → Medium → Spoiled`

Stan powinien być oparty o authoritative `acquiredAtDays` albo równoważny spoilage deadline. Stage jest wyliczany, nie musi być osobnym mutowanym timerem.

Dla dwóch stacków tego samego `ItemKind`:

```text
compatible age/deadline → mogą się łączyć
incompatible age/deadline → pozostają osobnymi stackami
```

Nie rozbijać jedzenia na `ItemInstance`.

Freshness musi zachować się poprawnie podczas:

- add/remove/split/merge inventory;
- przenoszenia do household/settlement storage;
- NPC transportu;
- konsumpcji przez gracza i NPC;
- save/load;
- time-skipu.

Storage nie może odświeżać żywności.

Spoiled food nie może po prostu działać jak świeże jedzenie. W tym planie nie tworzyć systemu chorób; można przyjąć non-consumable albo jasno zdefiniowaną wartość `0`/reduced value.

## 4. Natural food i crops

Rozszerzyć istniejące mechanizmy źródeł i item spawnerów.

- mushroom pozostaje w obecnym chunk-item lifecycle;
- berries/nuts mogą używać istniejącego deterministic world/chunk placement;
- apples powinny korzystać z istniejącego lifecycle drzew, jeśli zapewnia właściwe ownership;
- crops korzystają z istniejących garden anchors, tak jak `tomato`.

Nie tworzyć osobnych managerów zasobów. Pozyskanie zawsze daje normalny item, dzięki czemu player i NPC korzystają z tych samych mechanizmów.

## 5. Player needs i consumables

Plan 106 pozostaje ownership boundary dla `hunger`, `thirst`, `vigor` i `stamina` oraz konsumpcji.

Nowe jedzenie rozszerza istniejące consumable definitions i istniejące `eatFood()` zamiast tworzyć food-needs layer.

Późniejsze strojenie potrzeb (np. Plan 165) nie jest nową zależnością; 159 ma pozostać kompatybilny z istniejącym API konsumpcji.

## 6. Cooking

Rozszerzyć istniejącą tabelę receptur `src/items/campfireCooking.ts`.

Istniejący schemat:

```text
raw/species meat → roasted_meat
```

rozszerzyć o ryby i kolejne produkty tylko w ramach tego samego mechanizmu.

Gotowanie tworzy nowy stack z nowym timestampem produkcji. Nie przenosi starego spoilage deadline surowca.

Istniejący busy-channel cooking pozostaje osobnym mechanizmem od background `TimedProcess`.

## 7. Generyczne procesy czasowe

Wprowadzić mały generyczny model procesu dla procesów działających w tle, np. suszenia. Nie tworzyć globalnego managera ani per-frame tickera.

Minimalnie:

```ts
TimedProcess {
  id: string
  kind: TimedProcessKind
  startedAtDays: number
  durationDays: number
  input: ItemStackInput[]
  output: ItemStackOutput[]
}
```

`completedAtDays` i progress powinny być wyliczalne z `startedAtDays + durationDays`.

Proces należy do authoritative state właściwego obiektu/systemu i musi:

- działać podczas nieobserwowania obiektu;
- poprawnie nadrobić completion po reload/time-skip;
- być zapisywalny;
- udostępniać progress UI bez przenoszenia state do UI/Object3D.

## 8. Suszenie / konserwowanie

Wykorzystać istniejący `dried_meat`; nie tworzyć duplikatu.

Dodać `dried_fish`.

Dodać fizyczny drying rack jako persistent world record + presentation object, analogicznie do istniejących persistent world objects.

Przykładowe procesy:

```text
Fresh Meat → Drying Rack → Dried Meat
Fresh Fish → Drying Rack → Dried Fish
```

Suszone produkty również korzystają z tego samego freshness resolvera, ale mają odpowiednio dłuższy czas trwałości.

## 9. Wędkarstwo

Dodać minimalne wędkarstwo bez symulacji populacji ryb:

- wędka jako normalny item/tool;
- miejsca połowu wyprowadzane z istniejącej geometrii/water detection, o ile nie trzeba persystować każdego spotu;
- fishing action korzystający z istniejącego interaction/action framework;
- deterministyczny catch roll;
- wynik jako normalny `fish` item.

Schemat:

```text
fishing action
→ deterministic catch roll
→ fish / no catch
→ normal inventory stack
```

Nie tworzyć fish agents, fish population, migration ani fishing manager.

## 10. Zanęta na ryby

Zanęta jest zwykłym itemem spożywczym oznaczonym w centralnej definicji jako odpowiednia bait capability. Nie tworzyć osobnego item kind.

Efekt zanęty należy do persistent simulation state fishing spotu, nie do `Object3D`.

Minimalny stan:

```ts
FishingBaitState {
  kind: ItemKind
  appliedAtDays: number
  expiresAtDays: number
  strength: number
}
```

Efekt:

- lokalny bonus aktywności przez kilka dni;
- kolejne użycie może odświeżyć lub wzmocnić efekt według centralnej reguły;
- catch roll uwzględnia aktywną zanętę.

Efekty wizualne są presentation-only i nie są zapisywane:

- throw animation;
- particles;
- lokalny water effect;
- fade-out po wygaśnięciu.

Spot pozostający poza streamingiem nadal zachowuje bonus.

## 11. Pszczoły i miód

Dodać minimalny persistent hive state.

Wykorzystać istniejące:

- interaction;
- health/damage;
- torch/fire;
- normal item spawning/inventory.

Produkcja miodu ma być oparta o world time, a nie o per-frame symulację pszczół.

Spalenie ula musi mieć persistent state uniemożliwiający wielokrotną nagrodę po stream/reload.

Pszczoły mogą być wizualnymi agentami/efektami, ale nie mogą być właścicielem produkcji ani obrażeń.

Nie tworzyć `BeeCombatSystem` ani bee managera.

## 12. Przynęta do pułapek

Rozszerzyć istniejący system pułapek z 141/155.

Przynęta pozostaje istniejącym food itemem, np. meat/fish/berry/carrot, a kategoria bait znajduje się w centralnej definicji itemu.

`PlacedTrapRecord` może otrzymać minimalny stan:

```ts
baitKind: ItemKind | null
```

Ładowanie bait:

```text
validate item
→ remove one item atomically
→ store ItemKind on trap
→ existing trap rule gets bait bonus
```

Reguły detection/capture pozostają w `src/world/animalTraps.ts`, runtime w `createPlacedTraps.ts`.

Preferowana reguła lifecycle: bait wraca przy disarm/collect przed capture; jest zużywany przy udanym capture, chyba że istniejący lifecycle wymaga innej semantyki.

Nie tworzyć `MeatBait`, `PlantBait` ani bait managera.

## 13. NPC i storage

Plan 156 jest ukończony i pozostaje ownership boundary.

Nowa żywność korzysta z istniejącego przepływu:

```text
source
→ existing NPC gather/carry/deposit
→ Household.stock / SettlementEconomy
→ existing NPC consumption
```

Nie tworzyć `HouseholdFoodInventory`, food logistics ani nowego transportu.

Jedynym wymaganym rozszerzeniem storage jest zachowanie freshness metadata dla perishable food. Jeśli `Household.stock` / settlement stock wymaga rozszerzenia o stateful stacks, jest to rozszerzenie istniejącego modelu, nie nowy storage system.

Późniejsze plany 164/167 nie są zależnościami 159 i nie powinny być wciągane do jego zakresu.

## 14. Persistence

Aktualny baseline po 155 to **SaveData v19** z `inventoryInstances`.

Plan 159 musi zaplanować kolejną wersję schema dla własnego authoritative state, zależnie od finalnej implementacji, w szczególności:

- stateful food stack timestamps/deadlines;
- active drying racks/processes;
- fishing bait state;
- hive production/burn state;
- trap bait state, jeśli nie jest objęty istniejącym trap persistence.

Nie zapisywać derived freshness stages, progress UI ani Three.js objects.

Migracja musi zachować istniejące v19 `inventoryInstances` oraz stare stackable inventory.

## 15. Kolejność implementacji

### A — Audit

Zweryfikować aktualne `ItemKind`, `ItemCatalogEntry`, `Inventory`, `ItemInstance`, consumables, `Household.stock`, `SettlementEconomy`, resource/source lifecycles, fauna harvest, traps, interaction, world time i SaveData v19.

### B — Shared item/food metadata

Rozszerzyć istniejący item catalog i dodać brakujące produkty. Nie tworzyć drugiego katalogu food.

### C — Stateful food stacks / freshness

Najpierw ustalić minimalne rozszerzenie stackable inventory i storage, resolver freshness, merge/split oraz persistence.

### D — Natural food / crops

Podłączyć nowe źródła do istniejących spawner/resource/garden mechanisms.

### E — Cooking integration

Rozszerzyć istniejącą tabelę campfire cooking o fish i nowe produkty wymagane przez scope.

### F — TimedProcess + preservation

Wprowadzić generyczny persistent process value i wykorzystać go dla drying rack.

### G — Fishing + bait

Wędka, fishing action, deterministic catch, persistent bait state i presentation effects.

### H — Bees/honey

Minimalny hive lifecycle, time-based production, torch/fire interaction i persistent burned/reward state.

### I — Trap bait

Rozszerzyć `PlacedTrapRecord` i istniejące trap rules o bait capability istniejących food items.

### J — NPC integration

Zweryfikować, że nowe produkty przechodzą przez istniejące gather/storage/consumption bez równoległej logistyki.

## 16. Poza zakresem

Na razie nie implementować:

- pełnej ekologii populacji ryb;
- migracji ryb;
- zaawansowanej hodowli pszczół;
- uli hodowlanych;
- lodówek;
- fermentacji;
- systemu chorób od zepsutego jedzenia;
- rozbudowanego gotowania jako osobnego systemu;
- systemu cen żywności;
- player storage/container redesign z 164;
- NPC helper delivery z 167;
- późniejszego redesignu hunger/thirst z 165.

## 17. Weryfikacja

Sprawdzić end-to-end:

- istniejące i nowe food items używają jednego item/consumable modelu;
- freshness jest deterministyczne i zachowuje się poprawnie po save/load/time-skip;
- różne age/deadline stacki nie są błędnie scalane;
- storage nie odświeża jedzenia;
- NPC transportuje i konsumuje nowe food przez istniejący flow;
- natural food/crops korzystają z istniejących source/spawner systems;
- cooking używa istniejącego recipe mechanism;
- drying działa w tle, po reloadzie i time-skipie;
- fishing działa bez fish population system;
- zanęta daje lokalny bonus przez kilka dni także po stream-out/in;
- efekty zanęty pojawiają się i znikają bez persistence presentation state;
- hive produkuje honey bez per-frame bee simulation;
- torch/fire i hive burn używają istniejących interaction/damage paths;
- spalony hive nie daje wielokrotnej nagrody po reload/streaming;
- trap bait używa istniejących trap rules i nie tworzy nowego bait systemu;
- bait jest poprawnie zużywany/zwracany zgodnie z lifecycle;
- streaming nie duplikuje ani nie gubi itemów lub persistent process state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

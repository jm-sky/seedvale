# Plan: Weapon maintenance and sharpening

**Created:** 2026-08-18
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~155~~ ~~160~~

domain: items-player
tags: [settlements-npcs, quests-progression]

> Check: `2026-08-18--161--weapon-maintenance-and-sharpening-implementation-notes.md`

## Cel

Dodać konserwację wybranych broni białych przez rozszerzenie istniejącego `ItemInstance` z planu 155.

Architektura pozostaje:

```text
ItemInstance → Inventory → HeldTool(instanceId) → ITEM_CATALOG[kind].melee → existing melee hit-resolution edge
```

`ItemInstance` przechowuje indywidualne `durability` i `sharpness`. Nie tworzyć równoległego systemu broni, equipment, storage ani persistence.

## Zależności i stan obecny

### Plan 155

Plan 155 jest `done` i jest bazą: `Inventory` posiada `counts` oraz `instances`, `ItemInstance` jest generyczną tożsamością, `TrapItemInstance` rozszerza ją o stan, gettery zwracają klony, a persistence używa istniejącego `SaveItemInstance[]`.

Nie migrować całego inventory na instances.

### Plan 160

Plan 160 jest `done` i źródłem aktualnych weapon variants:

- `damascus_knife`
- `damascus_short_sword`
- `damascus_long_sword`
- `obsidian_sword`
- `battle_axe`
- `masterwork_sword`

Pozostają one w istniejącym `ItemKind` + `ITEM_CATALOG` + melee/defense pipeline. Nie kopiować ich bazowych statystyk do instance.

### Plan 150

`2026-08-18--150--combat-mode-defense-and-downed-state.md` jest istniejącą bazą combat (`done`), ale nie jest formalną zależnością metadata tego planu. Plan 161 integruje się z obecnym melee flow i jego pojedynczym edge `hitReady`/`resolveMeleeHits()`. Nie tworzyć nieistniejącego `150--weapon-system.md`.

## Zakres weapons

Centralny maintenance set:

```text
knife
short_sword
long_sword
spear
axe
pitchfork
sickle
damascus_knife
damascus_short_sword
damascus_long_sword
obsidian_sword
battle_axe
masterwork_sword
```

`shovel` pozostaje poza zakresem mimo melee damage. `pickaxe` pozostaje poza zakresem, ponieważ obecnie nie ma melee config.

Nie wyprowadzać listy automatycznie z `ITEM_CATALOG[kind].melee`; jedna centralna klasyfikacja ma być źródłem informacji, które przedmioty mają maintenance state.

## Model danych

Rozszerzyć istniejący generyczny model, zgodnie z patternem planu 155:

```ts
export type WeaponItemInstance = ItemInstance & {
  kind: WeaponMaintenanceKind
  durability: number
  sharpness: number
}
```

Nazwa typu może zostać dopasowana do konwencji kodu. Istotne jest, że nie powstaje osobna hierarchia equipment.

```text
durability: 0..1
sharpness: 0..1
new instance: 1 / 1
```

Nie tworzyć `sharp_*`, `dull_*`, `broken_*` jako `ItemKind`.

## Inventory ownership i mutation

`Inventory` pozostaje jedynym właścicielem mutable instance state. Ponieważ `getInstance()`/`getInstances()` zwracają klony, dodać minimalne kontrolowane API, np. `updateInstance(id, updater)` lub równoważne węższe API.

Nie udostępniać wewnętrznego `Map`. To rozszerzenie istniejącego Inventory, nie `MaintenanceManager`.

## HeldTool bridge

Obecny `HeldTool` przechowuje tylko `ToolKind`. Dla instance-backed weapons musi zachować referencję:

```text
HeldTool
├── kind
└── instanceId?
```

`instanceId` jest wymagane dla supported weapon instances, ale opcjonalne dla dotychczasowych count-based tools.

`HeldTool` nie przechowuje `durability` ani `sharpness`.

Equip/select:

```text
Inventory instance → HeldTool.instanceId
```

Combat:

```text
HeldTool.instanceId → Inventory.getInstance(id) → current state
```

## Acquisition i migration count → instances

Każde pozyskanie supported weapon musi tworzyć instance:

```text
acquire → createItemInstance() → Inventory.addInstance()
```

Audytować co najmniej starting `knife`, merchant purchases/stock, quest/event rewards, world pickups/drops oraz wszystkie acquisition paths planu 160.

Nie zostawiać ścieżki `inventory.add(weaponKind, 1)` dla supported weapons.

### Stare save'y

Stary count-based weapon nie ma możliwego do odzyskania condition, więc migracja jest deterministyczna:

```text
count N → N instances { durability: 1, sharpness: 1 } → remove migrated count
```

Migracja dotyczy wyłącznie centralnego maintenance setu. Nie migrować zwykłych stackable items.

## Persistence

Rozszerzyć istniejący `SaveItemInstance`:

```ts
{ id, kind, durability?, sharpness? }
```

`Inventory.instancesToJSON()` / `instancesFromJSON()` pozostają jedynym mechanizmem zapisu instances.

Nie tworzyć `weaponInstances`, osobnej sekcji save ani osobnego persistence managera.

Kompatybilność:

- trap instances pozostają bez zmian;
- brak `sharpness` → `1`;
- brak `durability` dla weapon instance → `1`;
- nie-finite → bezpieczny default/reject zgodnie z istniejącym restore pattern;
- wartości poza `[0,1]` → clamp;
- stare count-based weapons → migracja powyżej.

## Durability

Wprowadzić durability jako stan weapon instance, ale bez pełnego repair systemu.

Minimalnie:

- initialize `1`;
- persist;
- zachować przez inventory → held → combat → inventory;
- ewentualny mały wear na successful hit tylko jeśli istniejący hit edge daje naturalne miejsce.

Nie implementować repair, broken lifecycle, osobnego durability resolvera ani blokowania użycia tylko dlatego, że durability spadło.

`sharpness = 0` nie oznacza `durability = 0`.

## Sharpness i damage

Bazą pozostaje `ITEM_CATALOG[kind].melee.damage`:

```text
catalog melee damage → sharpness modifier → final damage
```

Preferowany łagodny zakres:

```text
100% → 100%
75%  → ~94%
50%  → ~85%
25%  → ~72%
0%   → ~55%
```

Dokładna krzywa jest centralnym, deterministycznym resolverem/configiem. Sharpness nie zmienia w tym planie range, stamina, timing ani defense.

## Sharpness wear i istniejący melee edge

Podłączyć maintenance do istniejącego punktu rozstrzygnięcia:

```text
attack
→ current HeldTool.instanceId
→ current ItemInstance
→ existing resolveMeleeHits()
→ damage using current sharpness
→ sharpness wear exactly once
→ optional durability wear
```

Aktualny `playerMelee.update()` wystawia `hitReady` raz przy otwarciu hit window, a `resolveMeleeHits()` jest wykonywane na tym edge. Nie tworzyć nowego combat resolvera ani per-frame weapon tick.

Nie zużywać sharpness przy samym rozpoczęciu ataku. Miss nie zużywa sharpness w v1.

## Maintenance profile

Dodać małą centralną konfigurację domenową, logicznie:

```ts
getWeaponMaintenanceProfile(kind)
getSharpnessDamageModifier(sharpness)
applySharpnessWear(...)
sharpenWeapon(instanceId, source)
```

Profil zawiera wyłącznie maintenance values, np. `sharpnessLossPerHit`, `sharpeningAmount` i opcjonalnie `durabilityWearPerHit`.

Nie tworzyć general material system ani drugiego `WeaponConfig`. Quality/material z planu 160 może wpływać na maintenance przez profil przypisany do istniejącego `ItemKind`.

## Whetstone

Dodać `whetstone` jako zwykły stackable `ItemKind`:

```text
whetstone → count
```

Nie tworzyć instance osełki.

Sharpening:

```text
instanceId + source
→ validate supported weapon
→ calculate new sharpness
→ mutate same instance
→ consume whetstone atomically
```

Failed sharpening nie konsumuje osełki. UI wybiera `instanceId` i źródło, ale nie liczy ani nie przechowuje sharpness jako source of truth.

Nie dodawać crafting recipe bez oczywistego istniejącego insertion point.

## Grindstone

Opcjonalny. W v1 wystarczy osełka.

Dodać grindstone/workshop tylko jeśli istniejąca infrastruktura places/interactables pozwala na to bez nowego subsystemu. Musi korzystać z tego samego `sharpenWeapon()`.

Nie tworzyć `GrindstoneManager`.

## Inventory / UI

Główne inventory nadal grupuje po `ItemKind`. Szczegóły supported weapon muszą rozróżniać konkretne instances:

```text
Miecz ×2
1× 100% / 92%
1× 78% / 41%
```

Operacje muszą przenosić `instance.id`. UI nie jest source of truth; po mutation odczytuje stan z Inventory.

Nie tworzyć weapon inventory.

## Trading / NPC

Nie implementować weapon-specific dynamic pricing. Plan 155 już ustanowił instance-aware trade architecture; plan 161 ma jej nie blokować, ale nie dublować price resolvera.

Nie implementować NPC blacksmith, nowych NPC schedules ani behaviour. Udostępniona operacja `sharpenWeapon(instanceId, source)` ma być przyszłościowo wywoływalna przez NPC.

## Poza zakresem

- ranged combat / bows / arrows / projectiles / critical hits;
- NPC blacksmith;
- pełny repair/broken weapon system;
- general material system;
- WeaponManager;
- EquipmentManager;
- MaintenanceManager;
- osobny weapon storage;
- osobna persistence sekcja;
- osobny weapon combat resolver;
- weapon browser implementation;
- 3D weapon preview.

## Konkretne miejsca do sprawdzenia/zmiany

- `src/items/itemInstances.ts`
- `src/items/Inventory.ts`
- `src/items/items.ts`
- `src/items/itemCatalog.ts`
- `src/items/HeldTool.ts`
- `src/player/PlayerController.ts`
- `src/player/playerMelee.ts`
- `src/app/gameLoop.ts`
- persistence / `SaveData`
- merchant/quest/drop acquisition paths
- inventory item-details UI
- focused inventory/instance/combat/persistence tests

Nie wykonywać niezwiązanych refaktorów.

## Performance

- brak globalnego weapon tick;
- brak per-frame scans inventory instances;
- state changes wyłącznie przy domenowych akcjach;
- maintenance profiles są statyczne;
- brak managera broni.

## Kolejność implementacji

1. Centralny maintenance target set/predicate dla 13 supported kinds.
2. `ItemInstance` extension, clone/type guards i centralna klasyfikacja.
3. `SaveItemInstance` + serialization/defaulting.
4. Controlled `Inventory` mutation API.
5. Maintenance profile + pure sharpness/wear/sharpen functions.
6. Acquisition migration + old count-based save migration.
7. `HeldTool.instanceId`.
8. Current instance → existing melee hit edge; damage + wear exactly once.
9. `whetstone` + sharpening action.
10. Item details UI dla konkretnych instances.
11. Focused tests, szczególnie held-instance → melee regression.
12. Type-check/test/build.
13. Narrow browser verification.

Nie zaczynać od UI. Najbardziej ryzykowne są bridge `Inventory → HeldTool.instanceId → melee` oraz migracja count → instances.

## Kryteria akceptacji

- [ ] 13 supported weapon kinds jest zdefiniowanych centralnie.
- [ ] `shovel` jest jawnie poza zakresem; `pickaxe` pozostaje poza zakresem.
- [ ] Supported weapons są indywidualnymi instances z `id`, `durability`, `sharpness`.
- [ ] Nowa instance startuje `1/1`.
- [ ] `Inventory` jest jedynym właścicielem mutable instance state.
- [ ] `HeldTool` przechowuje `instanceId`, bez kopiowania condition.
- [ ] `ITEM_CATALOG[kind].melee` pozostaje bazą statystyk.
- [ ] Existing `resolveMeleeHits()` / `hitReady` pozostaje edge trafienia.
- [ ] Sharpness modyfikuje damage centralnym resolverem.
- [ ] Sharpness wear występuje dokładnie raz na successful resolved hit.
- [ ] Miss nie zużywa sharpness w v1.
- [ ] Wszystkie acquisition paths tworzą instances.
- [ ] Stare count-based weapons są migrowane do full-condition instances.
- [ ] Persistence używa istniejącego `SaveItemInstance[]`.
- [ ] Stare save'y bez maintenance fields pozostają kompatybilne.
- [ ] Plan 160's six variants jest objęty centralną klasyfikacją.
- [ ] `whetstone` jest normalnym stackable itemem.
- [ ] Sharpening zwiększa sharpness konkretnej instance i nie zmienia durability.
- [ ] Failed sharpening nie konsumuje osełki.
- [ ] UI wybiera konkretne `instance.id`.
- [ ] Nie powstaje WeaponManager, EquipmentManager, MaintenanceManager, weapon storage ani osobna persistence.
- [ ] Nie implementuje się ranged combat, NPC blacksmith ani pełnego repair systemu.
- [ ] Testy pokrywają migration, persistence, mutation, sharpening, wear i held-instance → melee bridge.
- [ ] Type-check/test/build przechodzą.
- [ ] Browser/manual check potwierdza obtain/equip → hit/wear → sharpen → save/load.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

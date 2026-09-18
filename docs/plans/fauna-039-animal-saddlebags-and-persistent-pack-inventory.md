# Plan: Animal saddlebags and persistent pack inventory

**Created:** 2026-09-18
**Status:** `planned` 📋
**Priority:** high · **Effort:** M/L
**Depends on:** none
**Domain:** `fauna`
**Type:** `feature`
**Roadmap:** `quests-travelling-merchant-journeys.md`

## Goal

Pozwolić graczowi wyposażyć własnego konia lub osła w istniejący item `saddlebags` i używać zwierzęcia jako persistent mobilnego magazynu.

Target flow:

```text
Player posiada saddlebags
→ interakcja z własnym horse/donkey
→ "Załóż juki"
→ 1× saddlebags opuszcza Player Inventory
→ animal dostaje real AnimalPackState
→ pojawia się model juków
→ animal posiada persistent pack Inventory

kolejne interakcje:
→ "Otwórz juki"
→ "Zdejmij juki"
```

System ma być reusable później przez Travelling Merchant, courierów i NPC expeditions.

Nie tworzyć player-only `HorseInventory`.

---

## 1. Existing foundations to reuse

Istnieją:

- `ItemKind = saddlebags`;
- `public/models/items/saddlebags.glb`;
- `ITEM_GLB_SPECS.saddlebags`;
- generic `Inventory`;
- `InventoryContentsSnapshot`;
- `ContainerScreen`;
- player container transfer flow;
- persistent livestock `AnimalSaveState`;
- stable `animalId`;
- player-owned animal lifecycle.

Nie tworzyć nowego item kind ani drugiego stored-item modelu.

---

## 2. Pack capability belongs to AnimalDef

Dodać capability:

```ts
export type PackConfig = {
  cargoCapacityKg: number
  cargoCapacityUnits: number
}
```

w:

```ts
AnimalDef.pack?: PackConfig
```

V1:

```text
donkey → pack enabled
horse  → pack enabled
```

Interaction/gameplay code nie sprawdza literalnie `kind === 'horse'` / `kind === 'donkey'`.

Presence of `AnimalDef.pack` jest capability authority.

---

## 3. Capacity

Gameplay values:

```text
donkey → 40 kg
horse  → 50 kg
```

To jest osobna capacity pack Inventory, nie bonus do Player Inventory.

Pack Inventory:

```text
maxWeight = AnimalDef.pack.cargoCapacityKg
maxSize   = AnimalDef.pack.cargoCapacityUnits
```

`cargoCapacityUnits` skalibrować względem obecnych `ITEM_SIZE_UNITS` w implementation notes.

Nie persistować capacity.

---

## 4. Persistent AnimalPackState

Preferowany domain module:

```text
src/fauna/animalPack.ts
```

Runtime:

```ts
export type AnimalPackState = {
  equipment: 'saddlebags'
  contents: Inventory
}
```

Snapshot:

```ts
export type AnimalPackSnapshot = {
  equipment: 'saddlebags'
  contents: InventoryContentsSnapshot
}
```

`AnimalSaveState` dostaje:

```ts
pack?: AnimalPackSnapshot
```

Absent `pack` oznacza brak wyposażonych juków.

Pack state podróżuje z tym samym persistent `animalId`.

---

## 5. One physical saddlebags invariant

W każdym momencie jeden zestaw juków istnieje dokładnie w jednej formie:

```text
Player Inventory
OR
equipped AnimalPackState
OR
ground saddlebags container
```

Nigdy w dwóch naraz.

To jest główny ownership invariant planu.

---

## 6. Equip eligibility

`Załóż juki` jest dostępne tylko gdy:

- animal jest alive;
- `AnimalDef.pack` istnieje;
- animal jest player-owned;
- animal nie ma już packu;
- Player Inventory ma co najmniej 1× `saddlebags`;
- player jest w legalnym interaction range;
- normalne action blockers pozwalają na interakcję.

Nie wymaga skill/tool/stable.

---

## 7. Equip transaction

Mutation:

```text
revalidate animal + item
→ construct empty pack Inventory
→ remove 1× saddlebags from Player Inventory
→ attach AnimalPackState
→ sync/persist through normal livestock snapshot
→ attach presentation
```

Atomicznie.

Jeżeli setup pack state zawiedzie, item pozostaje u gracza.

Nie zostawiać phantom equipped flag.

---

## 8. Presentation config is manual and separate

Gameplay config i visual config muszą być rozdzielone.

Gameplay:

```ts
AnimalDef.pack
```

Presentation:

```ts
export type SaddlebagsPlacement = {
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: readonly [number, number, number]
}

export const SADDLEBAGS_PLACEMENT: Partial<Record<AnimalKind, SaddlebagsPlacement>> = {
  horse: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  donkey: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
}
```

User ręcznie ustawia finalne transformy podczas browser verification.

Gameplay/persistence nie zależy od transformów ani powodzenia GLB.

---

## 9. Saddlebags visual lifecycle

```text
AnimalPackState exists
→ exactly one saddlebags visual attached

no AnimalPackState
→ no attached visual
```

Stream/save/load/rematerialization nie może tworzyć duplicate mesh.

GLB failure nie wpływa na inventory truth.

---

## 10. Open saddlebags

Equipped animal udostępnia główną action:

```text
"Otwórz juki"
```

Otwiera istniejący `ContainerScreen`.

Label:

```text
Juki — <animal name>
```

lub `Juki`, gdy animal nie ma nazwy.

Nie tworzyć `AnimalInventoryScreen.vue`.

---

## 11. Generic transfer-session reuse

Current container transfer session obsługuje container i NPC corpse.

Rozszerzyć minimalnie o animal pack, np.:

```ts
| { kind: 'animalPack', animalId: string }
```

lub wydzielić mały generic `InventoryTransferSource`, jeśli current code naturalnie na to pozwala.

Nie robić dużego UI refactoru.

---

## 12. Deposit and withdraw semantics

Player ↔ pack transfer musi zachować:

- stack counts;
- exact `ItemInstance`;
- food freshness batches;
- weight;
- size;
- rollback safety.

Player → pack:

```text
pack capacity decides
```

Pack → Player:

```text
Player Inventory capacity decides
```

Failed transfer nie może zgubić itemu.

Reuse istniejące transfer helpers i `inventoryFullToastText()`.

---

## 13. Take all

Jeżeli current `ContainerScreen` obsługuje `Weź wszystko`, animal pack korzysta z tej samej funkcji.

Nie tworzyć osobnej implementacji.

---

## 14. Unequip

Equipped animal udostępnia secondary/context action:

```text
"Zdejmij juki"
```

### Empty pack

```text
verify Player Inventory can receive saddlebags
→ remove AnimalPackState
→ add 1× saddlebags to Player Inventory
→ remove visual
```

Atomicznie.

### Non-empty pack

Blocked:

```text
Najpierw opróżnij juki.
```

Nie auto-transferować contents.

Nie dropować contents przy normalnym unequip.

---

## 15. Ownership restriction

V1 Player może equip/open/unequip tylko na player-owned animal.

Nie umożliwiać otwierania juków household/NPC livestock.

Underlying pack state pozostaje actor-neutral dla późniejszego NPC transportu.

---

## 16. Mounted UX

Nie przebudowywać mount targeting tylko dla tego planu.

Jeżeli current interaction routing nie potrafi sensownie otworzyć packu na dosiadanym animal:

```text
V1 requires dismount
```

To jest akceptowalne.

---

## 17. Encumbrance

Pack cargo:

```text
does NOT add to Player Inventory weight
```

nawet podczas jazdy.

Cargo jest niesione przez animal.

V1 nie zmienia jeszcze animal:

- speed;
- stamina drain;
- hunger;
- thirst

zależnie od pack load.

Ale `pack.contents.totalWeight()` ma być dostępne dla future balancing.

---

## 18. Persistence

Save/load musi zachować:

- same `animalId`;
- equipped state;
- stack counts;
- exact instances;
- food batches;
- pack contents.

Nie tworzyć top-level `SaveData.animalSaddlebags`.

Pack snapshot należy do `AnimalSaveState`.

Settlement unload/reload i detached player-owned restore muszą zachować pack bez duplikacji.

---

## 19. Animal death is the ownership handoff boundary

Gdy animal umiera i ma pack:

```text
alive animal pack
→ death
→ persistent ground saddlebags container
```

Juki nie pozostają na corpse.

Po handoff corpse lifecycle i pack lifecycle są niezależne.

---

## 20. Death handoff semantics

Death handoff:

1. snapshot/resolve current pack contents;
2. create persistent ground saddlebags container przy pozycji zwierzęcia;
3. dopiero po sukcesie clear AnimalPackState;
4. remove attached visual.

Po handoff dokładnie jeden owner posiada cargo:

```text
before death handoff:
animal pack

after:
ground saddlebags container
```

Nie wymaga zachowania tej samej JS `Inventory` instance — wymagane jest lossless ownership transfer.

---

## 21. Death handoff must be idempotent

Stable container id:

```text
animal-pack:<animalId>
```

Reconciliation rule:

```text
dead animal + pack + no matching ground pack
→ materialize ground pack
→ clear animal pack

matching ground pack already exists
→ never create duplicate
```

Nie opierać tej transformacji wyłącznie na jednorazowym rendering callback.

Mechanizm musi dać się uruchomić także podczas restore/reconciliation.

---

## 22. Ground pack position

Nie kłaść juków dokładnie w środku corpse.

Dodać deterministic helper:

```ts
resolveDroppedPackPosition(
  animalX,
  animalZ,
  animalYaw,
)
```

z małym lateral offsetem względem animal orientation.

Bez RNG.

Exact offset dostroić ręcznie podczas browser verification.

---

## 23. Ground saddlebags reuse container domain

Nie używać `WorldGeneratedContainers` — ich placement wynika ze stable authored/generated world specs.

Nie rozbijać packu na `DroppedItems`, bo utracilibyśmy container semantics.

Minimalnie uogólnić existing placed-container domain.

Dodać:

```ts
ContainerKind = 'chest' | 'casket' | 'saddlebags'
```

Ground saddlebags:

- mają własny visual;
- mają persistent position;
- mają own `Inventory`;
- otwierają `ContainerScreen`;
- zapisują counts/instances/food batches;
- mogą zostać odzyskane jako item dopiero po opróżnieniu.

Nie tworzyć `AnimalPackContainerManager`.

---

## 24. Container policy instead of kind checks

Nie rozsypywać:

```ts
if (kind === 'saddlebags')
```

po interaction code.

Rozszerzyć `ContainerDef` o minimalne semantic policy, np.:

```ts
pickupPolicy:
  | 'carry-container'
  | 'empty-to-item'
```

oraz presentation discriminator/helper odpowiedni dla existing container architecture.

Chest zachowuje current behavior.

Saddlebags:

```text
open always
pickup as ItemKind only when empty
```

---

## 25. Ground pack visual

Ground container używa istniejącego:

```text
items/saddlebags.glb
```

ale ma osobny world-ground transform od `SADDLEBAGS_PLACEMENT` używanego na animal.

Nie reuse attached-animal transform jako ground transform.

---

## 26. Ground pack interaction

Ground saddlebags:

```text
[E] Otwórz juki
```

zawsze, gdy interaction legal.

Jeżeli empty:

```text
[R] Podnieś juki
```

→ remove ground container
→ add 1× `saddlebags` do Player Inventory.

Jeżeli non-empty:

```text
[R] Podnieś juki
→ blocked
→ "Najpierw opróżnij juki."
```

Nie auto-pickup po wyjęciu ostatniego itemu.

---

## 27. Ground pack persistence

Ground saddlebags persist jak dynamic placed world container:

- stable id;
- x/z/yaw;
- contents;
- instances;
- food batches.

Save/load nie może odtworzyć animal pack dodatkowo, jeśli handoff już nastąpił.

Stable id + idempotent reconciliation zabezpiecza przed duplication.

---

## 28. Corpse lifecycle remains unchanged

Po udanym death handoff:

- meat harvest działa normalnie;
- burial działa normalnie;
- decay działa normalnie;
- final corpse removal działa normalnie.

Nie dodawać corpse-removal guard zależnego od cargo.

Pack nie jest już częścią corpse.

---

## 29. Generic animal-pack API

Preferować mały moduł `src/fauna/animalPack.ts` z helperami typu:

```ts
createAnimalPack(...)
hydrateAnimalPack(...)
snapshotAnimalPack(...)
canEquipAnimalPack(...)
canUnequipAnimalPack(...)
detachAnimalPack(...)
```

`AnimalAgent` pozostaje lifecycle ownerem i deleguje.

Nie dokładać dużej nowej state machine bezpośrednio do `AnimalAgent.ts`.

---

## 30. Integration with future merchant plans

Ten plan staje się authority dla:

- `PackConfig`;
- horse/donkey pack capacity;
- real saddlebags equipment;
- real pack Inventory;
- pack presentation;
- pack death handoff.

Po wdrożeniu zaktualizować `settlements-npcs-047` i `settlements-npcs-048`, aby reuse tego systemu.

### settlements-npcs-047

Nie powinien już definiować `PackConfig`.

Może integrować NPC transport capacity z realnym animal pack capability.

### settlements-npcs-048

Nie powinien tworzyć synthetic saddlebags visual.

Powinien reuse equipped pack/presentation/lifecycle.

Merchant `transportCargo` ownership migration do real pack Inventory pozostaje osobną jawnie rozstrzygniętą integracją w 048, nie częścią tego planu.

---

## 31. Tests — capability

- horse pack-capable;
- donkey pack-capable;
- non-pack animal rejected;
- interaction code nie sprawdza species literals.

---

## 32. Tests — equip

- owned horse + saddlebags → succeeds;
- owned donkey + saddlebags → succeeds;
- item removed exactly once;
- second equip rejected;
- non-owned animal rejected;
- dead animal cannot newly equip;
- no item → rejected;
- failure leaves Player item untouched.

---

## 33. Tests — transfer

- stack deposit/withdraw;
- exact item instance round-trip;
- food batch freshness preserved;
- pack overweight rejected;
- pack oversize rejected;
- Player full on withdraw leaves item in pack;
- failed transfer is lossless;
- Take All respects Player capacity.

---

## 34. Tests — unequip

- empty pack → exactly 1 saddlebags returned;
- non-empty pack → blocked;
- Player Inventory unable to receive → blocked;
- failed unequip preserves state/visual.

---

## 35. Tests — persistence

Save/load:

- equipped empty;
- equipped with stack cargo;
- equipped with item instances;
- equipped with perishable food.

Settlement unload/reload and detached restore preserve exactly one pack.

---

## 36. Tests — death handoff

- death with pack creates exactly one `animal-pack:<animalId>`;
- ground pack receives all cargo losslessly;
- animal pack clears only after successful world-container creation;
- repeated death/reconciliation does not duplicate;
- save/load after handoff does not recreate animal pack;
- corpse can decay/remove independently;
- ground pack survives corpse removal.

---

## 37. Tests — ground pack

- opens through existing ContainerScreen;
- preserves stack/instances/food batches;
- non-empty cannot be picked up;
- empty can be converted back to exactly 1× saddlebags;
- emptying does not auto-pickup;
- ground GLB failure does not affect contents.

---

## 38. Tests — visuals

- equipped pack creates one attached visual;
- stream/load does not duplicate;
- unequip removes visual;
- death removes attached visual and creates one ground visual;
- `SADDLEBAGS_PLACEMENT` only affects presentation.

---

## 39. Explicit non-goals

Nie implementować:

- Merchant/NPC automatic pack use;
- `TransportOrder` cargo migration;
- cart inventory;
- general animal equipment slots;
- saddles/tack system;
- animal armor;
- pack-load movement penalties;
- crafting/upgrading saddlebags;
- multiple saddlebag tiers;
- stealing from NPC animals;
- remote inventory access;
- carrying non-empty saddlebags as nested inventory item.

---

## 40. Definition of done

Plan jest wykonany, gdy:

- existing `saddlebags` item można założyć na player-owned pack-capable animal;
- `AnimalDef.pack` jest gameplay capability authority;
- horse ma 50 kg, donkey 40 kg capacity;
- pack ma finite size capacity;
- animal posiada persistent `Inventory`;
- exactly-one-saddlebags ownership invariant jest zachowany;
- `SADDLEBAGS_PLACEMENT` jawnie definiuje ręcznie strojoną position/rotation/scale per species;
- attached GLB jest presentation-only;
- `Otwórz juki` reuse existing ContainerScreen;
- transfers zachowują counts, instances i food batches;
- `Zdejmij juki` działa tylko dla pustego packu;
- pack jest częścią `AnimalSaveState`;
- save/stream/load nie duplikuje equipment/cargo;
- death atomically przenosi pack do persistent ground container `animal-pack:<animalId>`;
- death handoff jest idempotentny;
- ground juki są niezależne od corpse lifecycle;
- ground juki można otworzyć;
- puste ground juki można odzyskać jako 1× `saddlebags`;
- nie powstaje hidden chest ani osobny AnimalPackContainerManager;
- system jest reusable dla przyszłego Merchant/NPC transportu.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

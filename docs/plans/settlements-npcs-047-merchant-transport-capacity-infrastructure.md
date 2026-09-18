# Plan: Merchant transport capacity infrastructure

**Created:** 2026-09-18
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** S/M
**Depends on:** settlements-npcs-038, fauna-007, fauna-020
**Domain:** `settlements-npcs`
**Type:** `feature`
**Roadmap:** `quests-travelling-merchant-journeys.md`
**Model:** Sonnet, Composer

## Goal

Uporządkować bazową pojemność transportową NPC/Travelling Merchant oraz dodać wspólną capability dla zwierząt jucznych, bez implementowania jeszcze fizycznego przypisania konkretnego zwierzęcia do podróży.

V1:

```text
Trader / carrier bez pack animal → 10 kg
donkey pack capability           → 40 kg
horse pack capability            → 50 kg
```

Towar nadal pozostaje wyłącznie w:

```text
NpcAuthoritativeState.transportCargo
```

Ten plan przygotowuje infrastrukturę capacity pod kolejny plan, który dopiero będzie odpowiadał za realne `packAnimalId`, journey continuity, follow, streaming/materialization i saddlebags presentation.

---

## 1. Current state

Obecnie `src/settlement/npcState.ts` tworzy `transportCargo` z twardym:

```ts
const TRANSPORT_CARGO_MAX_WEIGHT = 5
```

`transportCargo` jest persistent authoritative inventory dla realnych dóbr przypisanych carrierowi.

Existing flow:

```text
TransportOrder
→ pickup
→ NpcAuthoritativeState.transportCargo
→ travel
→ unload
→ destination inventory
```

Ten ownership model pozostaje bez zmian.

---

## 2. Increase baseline transport capacity

Zwiększyć bazowy transport limit z:

```text
5 kg
```

do:

```text
10 kg
```

dla NPC transportującego towary bez pack animal.

Nie zmieniać przez to:

```text
NpcAgent.carried
```

który pozostaje osobnym transient work inventory.

Jawny invariant:

```text
NpcAgent.carried capacity
!=
NpcAuthoritativeState.transportCargo capacity
```

Nie łączyć tych dwóch mechanizmów.

---

## 3. Add explicit pack capability to AnimalDef

Current `AnimalDef` posiada osobne capability blocks:

```ts
mount?: MountPointConfig
lead?: LeadConfig
draft?: DraftConfig
```

Żadne z nich nie oznacza zdolności do noszenia cargo na grzbiecie.

Dodać:

```ts
export type PackConfig = {
  cargoCapacityKg: number
}
```

oraz:

```ts
pack?: PackConfig
```

do `AnimalDef`.

Presence of `pack` oznacza:

```text
species can act as a pack animal
```

Tak jak obecnie:

```text
mount present → mountable
lead present  → leadable
draft present → can pull cart
```

Nie dodawać osobnego `isPackAnimal` boolean.

---

## 4. V1 species configuration

Dodać:

```text
donkey.pack.cargoCapacityKg = 40
horse.pack.cargoCapacityKg  = 50
```

Nie dodawać pack capability innym livestock w tym planie.

Wartości są świadomie gameplay-scaled, a nie próbą pełnego biologicznego modelowania nośności zwierząt.

---

## 5. Capacity semantics

`cargoCapacityKg` oznacza **całkowitą effective transport capacity zestawu NPC + pack animal**, nie dodatkowy bonus.

Czyli:

```text
carrier alone   = 10 kg
carrier + donkey = 40 kg
carrier + horse  = 50 kg
```

Nie:

```text
10 + 40
10 + 50
```

Dzięki temu config pozostaje prosty i czytelny.

---

## 6. Central transport-capacity resolver

Dodać jeden pure resolver, np.:

```ts
resolveNpcTransportCargoCapacity(...)
```

Input powinien być minimalny, np.:

```text
base transport capacity
optional pack capability/config
```

Output:

```text
effective max cargo weight
```

Przykładowo:

```ts
resolveNpcTransportCargoCapacity(undefined)
// 10

resolveNpcTransportCargoCapacity(ANIMAL_DEFS.donkey.pack)
// 40

resolveNpcTransportCargoCapacity(ANIMAL_DEFS.horse.pack)
// 50
```

Nie rozrzucać:

```text
kind === 'horse'
kind === 'donkey'
```

po transport code.

Nie budować jeszcze carrier hierarchy ani merchant-specific scoringu.

---

## 7. Dynamic Inventory max weight

Najważniejszy techniczny problem:

`transportCargo` jest dziś konstruowany z jednym stałym limitem.

Kolejny plan będzie musiał zmieniać effective capacity istniejącego authoritative `Inventory`, gdy do journey zostanie przypisane/odpięte pack animal.

Dodać najmniejszy generic seam w `Inventory`, np.:

```ts
setMaxWeight(...)
```

lub równoważny mechanizm pasujący do obecnej klasy.

Guardrails:

- API ma być generic, nie merchant-specific;
- authoritative `Inventory` object pozostaje ten sam;
- nie rekonstruować/copy contents przy zmianie capacity;
- zwiększenie limitu od razu pozwala na nowe additions do nowego limitu;
- zmniejszenie poniżej current carried weight nie usuwa itemów;
- overweight inventory blokuje dalsze additions zwiększające weight;
- removals nadal działają normalnie.

Nie wprowadzać w tym planie auto-drop / overflow redistribution.

---

## 8. Baseline capacity initialization and restore

Fresh NPC state:

```text
transportCargo max weight = 10 kg
```

Restore from snapshot:

```text
snapshot contents
→ same authoritative transportCargo
→ baseline max weight = 10 kg
```

Ten plan nie persistuje samego limitu capacity, ponieważ capacity wynika z config/current transport context.

Nie dodawać:

```text
NpcStateSnapshot.transportCargoMaxWeight
SaveData.transportCapacity
```

---

## 9. Save compatibility

Legacy/current saves mogą zawierać `transportCargo` utworzone historycznie przy 5 kg.

Po restore:

- contents muszą pozostać bez zmian;
- nowy baseline ma wynosić 10 kg;
- żaden istniejący non-terminal `TransportOrder` nie może przestać działać wyłącznie z powodu zmiany 5 → 10 kg;
- nie duplikować ani usuwać cargo podczas restore.

Dodać targeted regression test.

---

## 10. No real pack-animal assignment yet

Ten plan **nie wybiera konkretnego live animal**.

Nie implementować jeszcze:

```text
resolveMerchantPackAnimal(...)
MerchantJourneyState.packAnimalId
animal follows Trader
animal leaves home settlement
animal materializes at destination
```

Powód:

semantic relation do konkretnego `animalId` powinna wejść razem z pełnym lifecycle:

- one-live-animal invariant;
- home suppression;
- detached/foreign materialization;
- off-screen continuity;
- death/detach;
- return home.

To będzie zakres drugiego planu.

---

## 11. No saddlebags visuals yet

Nie dodawać jeszcze:

- saddlebag GLB;
- procedural bags;
- visual attachment;
- loaded/empty bag state;
- saddlebag interaction UI.

Visuals należą do drugiego planu razem z realnym journey companion.

---

## 12. No animal cargo inventory

Explicit architecture:

```text
TransportOrder
→ owns commitment

NpcAuthoritativeState.transportCargo
→ owns concrete goods

AnimalDef.pack
→ owns pack-capacity capability/config

future merchant pack-animal relation
→ will own which animal provides that capability
```

Nie dodawać:

```ts
AnimalAgent.inventory
AnimalSaveState.inventory
PackAnimalCargo
MerchantSaddlebagsInventory
```

---

## 13. Future cart compatibility

Capacity resolver powinien być możliwy do późniejszego rozszerzenia do cart/wagon transportu.

Nie projektować teraz pełnego:

```text
CarrierCapacitySource
TransportVehicleHierarchy
PackAnimalManager
```

Wystarczy, aby obecny resolver nie hardcodował species names i operował na semantic capacity config.

Future cart może później dostarczyć własną effective capacity przez ten sam transport-capacity seam.

---

## 14. Likely implementation points

### `src/fauna/animalDefs.ts`

Dodać:

```ts
PackConfig
AnimalDef.pack?
```

oraz skonfigurować:

```text
horse
donkey
```

### `src/settlement/npcState.ts`

Zmienić bazowy transport limit:

```text
5 → 10 kg
```

Jeżeli ownership constantu lepiej pasuje po reconie do shared transport helpera, można go przenieść, ale nie tworzyć duplikatu wartości.

### `src/items/Inventory.ts`

Dodać generic mutable max-weight seam, jeśli current API nie posiada odpowiednika.

### shared transport helper

Preferować istniejący transport module, jeśli ma naturalne miejsce.

Jeżeli brak dobrego ownera, mały focused helper jest akceptowalny, np.:

```text
src/world/transportCapacity.ts
```

Nie tworzyć managera.

---

## 15. Tests

### Pack capability

- horse ma `pack`;
- donkey ma `pack`;
- unrelated livestock nie mają;
- resolver nie wymaga species-specific branches.

### Capacity resolver

- no pack → 10 kg;
- donkey pack → 40 kg;
- horse pack → 50 kg.

### Inventory mutable capacity

- capacity może wzrosnąć bez wymiany object identity;
- existing contents pozostają bez zmian;
- capacity może spaść poniżej current weight bez utraty items;
- overweight inventory odrzuca nowe weight-increasing additions;
- removals nadal działają;
- po zejściu poniżej limitu additions znów działają.

### NPC state / persistence

- fresh `transportCargo` ma baseline 10 kg;
- snapshot round-trip zachowuje cargo;
- legacy snapshot bez dodatkowych pól ładuje się bez migracji danych;
- existing cargo/order nie jest tracony po restore.

### Regression

- transient `NpcAgent.carried` pozostaje przy obecnej capacity;
- existing transport pickup/unload semantics nie zmieniają ownership;
- normal transport bez pack-animal integration nadal działa.

---

## 16. Explicit non-goals

Nie implementować:

- konkretnego `packAnimalId`;
- selection realnego horse/donkey;
- merchant journey assignment;
- animal following NPC;
- generic arbitrary-actor follow target;
- foreign animal materialization;
- home livestock suppression;
- off-screen animal travel;
- saddlebags visuals;
- animal-owned cargo inventory;
- player saddlebag UI;
- animal encumbrance/stamina effect;
- cart/wagon capacity;
- merchant guards/caravan;
- merchant wealth tiers;
- preparation/resupply;
- cargo loss/drop on animal death;
- automatic animal spawning.

---

## 17. Definition of done

Plan jest wykonany, gdy:

- baseline `transportCargo` capacity wynosi 10 kg;
- `AnimalDef` posiada reusable `pack` capability;
- horse ma 50 kg effective transport capacity config;
- donkey ma 40 kg effective transport capacity config;
- wartości są jawnie traktowane jako gameplay-scaled;
- jeden shared resolver wylicza effective transport capacity bez scattered species checks;
- istniejący authoritative `transportCargo` może zmienić max weight bez wymiany object identity;
- lowering capacity nie niszczy istniejącego cargo;
- legacy/current saves zachowują cargo i transport orders po zmianie baseline;
- `NpcAgent.carried` pozostaje niezmieniony;
- nie istnieje animal cargo inventory;
- plan nie przypisuje jeszcze konkretnego zwierzęcia do journey.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

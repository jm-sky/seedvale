# Plan: Sustainable Seed Recovery and Replanting

**Created:** 2026-09-11  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** L  
**Depends on:** settlements-npcs-030, world-023  
**Domain:** `settlements-npcs`  
**Subdomains:** `household` `economy` `logistics`  
**Tags:** `agriculture` `seeds` `off-screen`  
**Roadmap:** `agriculture-and-cultivation`  

## Cel

Zamknąć pierwszą trwałą pętlę materiału siewnego dla upraw:

```text
real seed reserve
→ sowing
→ growth
→ harvest
→ produce + recovered seed material
→ real seed reserve for next sowing
→ possible surplus
```

Jeden `seed_*` item nadal oznacza jedną porcję / sowing unit materiału siewnego, nie jedno biologiczne nasiono.

Zdrowe gospodarstwo powinno normalnie odzyskiwać materiał wystarczający na następny cykl oraz ograniczony biologicznie surplus. Słaby lub nieudany plon może odzyskać mniej niż potrzeba do pełnego ponownego obsiania albo nic, przez co realny stock nasion maleje i przyszła produkcja może się zatrzymać.

Nie dodawać magicznego refill, `FarmerSeedInventory`, osobnej seed economy ani równoległego modelu off-screen agriculture.

## 1. Dependency baseline i ownership

Plan implementować na aktualnym kodzie po uwzględnieniu kontraktów:

- `settlements-npcs-030-non-home-settlement-food-production-v1.md` — non-home agricultural capacity, finite starter seeds, detailed ↔ aggregate handoff i bounded lazy off-screen agriculture;
- `world-023-species-driven-sowing-density-and-yield.md` — `seed item = sowing unit`, species-driven logical population i base placement yield.

Oba plany są obecnie `planned`; nie zakładać ich implementacji. Przed kodowaniem sprawdzić aktualny `main` i dostosować integration points do rzeczywistego post-dependency kodu.

Ownership ma pozostać rozdzielony:

```text
CropDefinition / shared world semantics
→ species biological harvest + healthy recovery potential

cultivation state
→ realized final produce yield

player Inventory / Household.items
→ real recovered seed goods

household/farm policy
→ reserve requirement and surplus classification
```

`resolveCropHarvest()` nie powinien znać household reserve, settlement storage ani profession policy.

## 2. Shared cultivated seed-recovery semantic

Seed recovery jest realnym, deterministycznym wynikiem udanego harvestu cultivated crop.

Nie modelować biologicznych nasion ani pojedynczych roślin. Wynikiem jest count istniejącego `seed_*` `ItemKind`.

Rozszerzyć shared species semantics o minimalny parametr recovery, preferencyjnie przy `CropDefinition`:

```ts
healthySeedRecovery: number
```

Semantyka:

> liczba sowing units materiału siewnego możliwa do odzyskania z jednego zdrowego, w pełni plonującego planted `CropPlacement`.

Dla obecnych `carrot`, `potato`, `cabbage` Phase 3 przyjmuje:

```text
healthySeedRecovery = 2 sowing units
```

Czyli zdrowy cykl:

```text
consume seed ×1
→ healthy harvest
→ recover seed ×2
→ replacement ×1 + potential surplus ×1
```

Pole pozostaje species-specific, aby późniejszy tuning nie wymagał zmiany architektury, ale w tym planie nie różnicować gatunków bez gameplay evidence.

Nie kopiować recovery wartości do Farmer AI, player actions ani aggregate agriculture.

## 3. Dokładny model healthy → partial-yield recovery

Recovery ma korzystać z finalnego, rzeczywiście uzyskanego plonu po istniejących cultivation modifiers.

Dla:

```text
baseYield = species base mature placement yield
realizedYield = final produce count po care/hydration/drought
healthySeedRecovery = species recovery przy pełnym zdrowym plonie
```

liczyć:

```text
recoveredSeedUnits = floor(
  healthySeedRecovery * realizedYield / baseYield
)
```

następnie clamp:

```text
0 <= recoveredSeedUnits <= healthySeedRecovery
```

Wymagane invariants:

- `realizedYield <= 0` → `0` recovered seed units;
- pełny zdrowy yield → `healthySeedRecovery`;
- częściowy yield może dać replacement albo `0`;
- recovery nigdy nie przekracza species healthy recovery;
- wynik jest integer sowing-unit count;
- brak RNG i `Math.random()`.

Przykład dla species z `baseYield = 12`, `healthySeedRecovery = 2`:

```text
realized 12 → recover 2
realized 11 → recover 1
realized  6 → recover 1
realized  5 → recover 0
realized  0 → recover 0
```

Model celowo reuse'uje final realized yield. Nie dodawać osobnego `seedHealthModifier`, jeśli aktualny cultivation pipeline już wyraził care/hydration/drought w końcowym plonie.

Jeżeli po implementacji `world-023` nazwa/shape base yield się zmieni, użyć authoritative species base placement yield zamiast duplikować wartość.

## 4. Cultivated context, nie każdy `CropPlacement`

Nie dodawać recovery bezwarunkowo do każdego wywołania `resolveCropHarvest()`.

`world-023` jawnie rozróżnia:

```text
planted CropPlacement = one sowing unit
natural CropPlacement = procedural natural population, not necessarily one sowing unit
```

Dlatego cultivated recovery musi mieć jawny cultivated/planted context.

Preferowany podział odpowiedzialności:

```text
resolveCropHarvest()
→ shared base produce

existing cultivation modifier
→ realized produce

resolveCultivatedSeedRecovery(...)
→ recovered seed sowing units
```

Resolver recovery powinien być pure, actor-neutral i deterministyczny. Player, NPC Farmer i aggregate agriculture używają tej samej formuły.

Natural crops nie odzyskują automatycznie cultivated seed units w tym planie. Wild seed gathering / self-seeding jest osobnym przyszłym kontraktem.

## 5. Produce i recovered seeds są oddzielnymi realnymi goods

Harvest cultivated crop może dać dwa typy outputu:

```text
produce ItemKind × N
seed ItemKind × M
```

Recovered seed jest zwykłym istniejącym count-based itemem wskazanym przez existing `CROP_SEED_ITEM` albo jego aktualny odpowiednik po dependency implementation.

Nie tworzyć:

- `RecoveredSeed` entity;
- seed quality records;
- biological seed instances;
- seed-specific inventory;
- scalar `seedReserve` będącego drugim źródłem prawdy.

Recovery materializuje realny item przy harvest. Household nie decyduje, czy nasiona biologicznie „powstały”.

## 6. Player cultivated harvest

Player planting nadal konsumuje jeden realny seed item na planted sowing unit.

Player harvest cultivated crop powinien używać tego samego effective harvest semantic co NPC:

```text
base species harvest
→ cultivation modifier
→ realized produce
→ shared cultivated seed recovery
→ produce + seed goods
```

Nie kopiować formuły recovery do `gatheringActions.ts`.

### Transactional safety

Recovery dodaje drugi output do harvestu. Nie usuwać authoritative crop, jeżeli wynik nie może zostać bezpiecznie przyznany zgodnie z aktualnym inventory contract.

Preferować wspólny read-only effective harvest outcome przed mutation:

```text
crop + cultivation state
→ effective produce + recovered seeds
→ capacity / validity check
→ commit harvest
→ add outputs
```

Jeżeli istniejący Inventory wspiera częściowy/batch add z bezpiecznym rollbackiem, reuse'ować ten mechanizm. Nie tworzyć player-only pending harvest storage.

## 7. Loaded NPC Farmer harvest

Detailed Farmer flow pozostaje istniejącym flow z `npcProfessionWork.ts` / `SettlementFoodSourceHooks`.

Przy cultivated harvest:

```text
Farmer harvest
→ shared realized produce
→ shared recovered seed count
→ produce through existing Household food flow
→ recovered seed directly into Household.items
```

Farmer planting nadal:

```text
Household.items real seed
→ remove(seed, 1)
→ plant one sowing unit
```

Nie dodawać `FarmerSeedInventory`, profession-local reserve ani synthetic refill.

## 8. Seed reserve jest derived policy nad realnym inventory

Authoritative seed stock to wyłącznie:

```text
Household.items.count(seedKind)
```

Reserve nie jest osobnym persisted stockiem.

Reserve requirement wyprowadzać z aktualnej agricultural capacity / możliwej następnej pełnej sowing round, zgodnie z ownerem capacity wprowadzonym przez `settlements-npcs-030`.

Koncept:

```text
requiredReserve = sowing capacity for next production round
seedStock = real Household.items seed count
seedSurplus = max(0, seedStock - requiredReserve)
```

Reserve chroni stock przed przyszłym transferem/trade/innym zużyciem, ale nie blokuje normalnego planting — właśnie po to istnieje.

Nie dodawać persisted:

- `seedReserve`;
- `seedSurplus`;
- `seedTarget`;
- drugiego inventory.

## 9. Surplus pozostaje realnym stockiem

Nie ograniczać biologicznego recovery na podstawie aktualnej zawartości spiżarni.

W szczególności nie robić:

```text
if seedStock >= target:
  discard recovered seeds
```

To byłby ukryty magiczny sink.

Healthy recovery zawsze daje ten sam wynik dla tego samego species i realized yield. Nadwyżka jest klasyfikacją istniejących realnych goods:

```text
real seed stock - required reserve = surplus
```

W tym planie nie trzeba automatycznie przenosić seed surplus do `SettlementEconomy`.

Jeżeli przy implementacji istnieje już generic item circulation obsługujący zwykłe non-food goods, reuse'ować go. Jeżeli nadal publiczny settlement-economy flow jest food/wood-specific, pozostawić surplus w `Household.items` zamiast dodawać `depositSeed()`, `SeedEconomy` lub seed-specific transport.

Pełny seed market/trade jest poza zakresem.

## 10. Crop failure ma realne konsekwencje

Pętla nie gwarantuje sustainability.

Możliwy flow:

```text
consume seed ×1
→ poor/failed crop
→ low/zero realized yield
→ recover 0 seed
→ household stock shrinks
→ fewer future sowing operations
→ possible production stop
```

Nie uzupełniać stocku automatycznie, gdy household spadnie poniżej reserve requirement.

Future shortage pressure / quest / trade może korzystać z tego realnego stanu, ale nie implementować ich w tym planie.

## 11. Aggregate/off-screen agriculture musi używać tej samej semantyki

Rozszerzyć aggregate agriculture z `settlements-npcs-030`, nie tworzyć drugiego off-screen seed modelu.

Aggregate resolution używa tych samych:

- real seed ItemKinds;
- species cycle duration;
- species base yield;
- `healthySeedRecovery`;
- recovery formula;
- Household item ownership;
- agricultural capacity.

Nie materializować historycznych `CropPlacement`s, Farmer actions ani seed entities.

### Critical performance invariant

Seed sustainability nie może zwiększyć kosztu symulacji proporcjonalnie do długości unloaded interval ani liczby historycznych crop cycles.

Po recovery początkowa liczba nasion przestaje ograniczać liczbę możliwych cykli. Dlatego nie wolno rozszerzyć catch-up z 030 o:

```text
while enough time:
  consume seed
  harvest
  recover seed
  repeat
```

Koszt catch-up musi być bounded przez aktualny agricultural state, np. małą liczbę:

```text
agricultural households
× crop kinds
× capacity buckets
```

a nie przez:

```text
elapsed days
historical cycles
historical plant/harvest events
```

Resolver powinien matematycznie/batchowo wyprowadzić maksymalną liczbę zakończonych production opportunities z elapsed world time, cycle duration i agricultural capacity, a następnie zastosować seed availability/recovery dynamics bez iterowania po każdym historycznym cyklu.

Jeżeli dokładne zamknięte rozwiązanie dla częściowych failures wymaga dodatkowego aggregate state, dodać wyłącznie minimalny deterministyczny state potrzebny do zachowania ciągłości. Nie dodawać event history.

## 12. Detailed ↔ aggregate consistency

Zachować invariant z 030:

> Ten sam przedział czasu nie może być rozliczony przez detailed Farmer simulation i aggregate agriculture jednocześnie.

Dodatkowo:

- recovered seed materialized w detailed mode nie może zostać odzyskany drugi raz przy stream-out;
- aggregate recovered seeds muszą istnieć w `Household.items` przed wejściem detailed mode;
- repeated aggregate resolve przy tym samym temporal anchor musi być idempotentny;
- stream-in nie odtwarza historycznych seed recovery events;
- home settlement pozostaje na detailed path, jeśli taki jest aktualny kontrakt po 030.

Nie wymagać identycznej historii akcji detailed i aggregate. Wymagać zgodnych species/resource semantics i trwałych konsekwencji.

## 13. Persistence

Reuse istniejącej persistence:

- player `Inventory` dla player seed goods;
- `HouseholdSnapshot.items` dla household seed goods;
- `SaveData.plantedCrops` dla detailed planted crops;
- agriculture temporal/bootstrap state wprowadzony przez 030;
- istniejący settlement economy snapshot dla jego aktualnie obsługiwanych goods.

Nie persistować derived reserve/surplus ani recovery history.

`healthySeedRecovery` jest species definition, nie per-placement persisted state.

Jeżeli dependency implementation zmieni persisted semantics, użyć aktualnego save migration/version flow. Nie bumpować save version tylko dlatego, że można wyprowadzić nową species wartość z `cropId`.

## 14. Determinism

Seed recovery musi być deterministic.

Nie używać:

- `Math.random()`;
- losowego seed yield;
- per-harvest RNG;
- wall-clock time.

Integer rounding jest częścią kontraktu: partial recovery używa `floor()` po proporcjonalnym przeskalowaniu przez realized/base yield.

Detailed i aggregate path muszą używać tego samego resolvera lub jednego shared mathematical contract bez skopiowanych stałych.

## 15. Performance guardrails

Performance jest twardym kryterium akceptacji planu.

### Loaded/detailed

- recovery liczyć wyłącznie przy faktycznym harvest event;
- zero nowych per-frame seed updates;
- zero per-biological-seed entities;
- zero dodatkowych colliderów/visuals dla seed recovery;
- zero globalnych scans po settlements/NPC/crops;
- derived reserve/surplus liczyć na żądanie z istniejącego inventory/capacity, nie synchronizować co tick.

### Unloaded/aggregate

- zero permanentnych `NpcAgent`s;
- zero permanentnych Three.js objects;
- zero synthetic `CropPlacement`s;
- zero replay historycznych cycles;
- koszt catch-up bounded przez bieżący agricultural state, nie elapsed time;
- preferować O(households × crop kinds) / mały bounded equivalent;
- żadnego nowego Workera, dopóki realny CPU cost i independence nie uzasadnią communication overhead.

### Memory / GC

- nie tworzyć tablicy output/event record per historyczny harvest;
- nie persistować historii recovery;
- preferować małe scalar/count calculations i istniejące Inventory operations;
- nie dodawać nowego monolitycznego agriculture managera.

## 16. Relevant systems / files

Przed implementacją zweryfikować aktualne odpowiedniki po dependencies. Obecne integration points:

- `src/world/cropLifecycle.ts`
  - `CropDefinition`
  - `CROP_DEFS`
  - `resolveCropHarvest()`
- `src/world/plantedCrops.ts`
  - `CROP_SEED_ITEM`
- `src/terrain/chunkManager.ts`
  - planted crop harvest/plant integration
- `src/world/foodSources.ts`
  - shared NPC food-source harvest path
- `src/world/playerGarden.ts`
  - cultivation state/modifiers
- `src/app/actions/gatheringActions.ts`
  - player cultivated harvest commit/inventory flow
- `src/ai/npcProfessionWork.ts`
  - Farmer planting/harvest policy
- `src/settlement/household.ts`
  - `Household.items`
  - household capacity/food ownership
- `src/economy/settlementEconomy.ts`
  - current settlement storage semantics
- `src/economy/localExchange.ts`
  - current surplus/claim mechanisms
- `src/app/saveState.ts`
- `src/persistence/saveData.ts`
  - persistence/migration contracts
- actual agricultural-capacity / aggregate catch-up owner introduced by `settlements-npcs-030`.

Nie traktować tej listy jako polecenia refaktoru wszystkich plików.

## 17. Implementation guidance

Preferowany kolejny porządek prac:

1. zweryfikować rzeczywisty post-030/post-world-023 crop/agriculture contract;
2. dodać species healthy recovery semantics i pure cultivated recovery resolver;
3. podłączyć player cultivated harvest;
4. podłączyć loaded Farmer harvest do `Household.items`;
5. dodać derived reserve/surplus policy nad realnym seed stock;
6. rozszerzyć aggregate agriculture o sustainable seed dynamics bez per-cycle replay;
7. sprawdzić detailed ↔ aggregate idempotence i persistence;
8. dodać focused tests dla recovery math, inventory ownership, failure i bounded catch-up.

Dla ważnych nowych publicznych/architektonicznych resolverów dodać zwięzły JSDoc opisujący ownership i invariant; gdzie pomaga preflight discovery, użyć odpowiedniego `@domain`.

Nie robić unrelated refactorów.

## 18. Verification

### Automated

Dodać/rozszerzyć focused tests potwierdzające co najmniej:

- pełny healthy yield odzyskuje `2` sowing units dla obecnych species;
- partial yield stosuje dokładnie `floor(healthyRecovery * realized/base)`;
- zero yield odzyskuje zero;
- recovery jest deterministic;
- natural crop nie dostaje cultivated recovery przez przypadek;
- player i NPC używają tej samej recovery semantics;
- recovered NPC seeds trafiają do `Household.items`;
- seed reserve/surplus jest derived z realnego stocku, nie osobno persistowany;
- seed shortage może zatrzymać kolejne planting;
- aggregate catch-up nie replayuje historycznych cycles i pozostaje bounded dla bardzo długiego elapsed interval;
- repeated aggregate resolve jest idempotentny;
- save/load zachowuje realny seed stock bez duplikacji recovery.

Uruchomić relevant unit/integration tests oraz standardowy build/typecheck/lint zgodnie z aktualnymi repo scripts.

### Manual browser verification — User

AI nie wykonuje browser verification.

User powinien sprawdzić po implementacji:

- zdrowy cultivated harvest zwraca produce i seed material;
- Farmer po harvest ma realne seeds w household i może ponownie siać;
- słaby/nieudany crop może zmniejszyć seed reserve;
- stream-out/in non-home settlement nie duplikuje produkcji ani nasion;
- długi off-screen interval nie powoduje zauważalnego freeze;
- FPS loaded settlement nie pogarsza się od samego seed recovery.

## 19. Out of scope

Nie implementować w tym planie:

- nowego hydration systemu ani zmian hydration, chyba że tylko reuse istniejącego final yield;
- seasons;
- perennial crops;
- self-seeding;
- wild seed gathering;
- seed quality/genetics;
- pełnego seed market/trade;
- nowych questów/pressures;
- pełnej economy rebuild;
- NPC-only seed types;
- seed-specific settlement storage API;
- osobnego off-screen harvest modelu;
- worker-based agriculture simulation;
- per-biological-plant simulation.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

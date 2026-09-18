# Plan: Pasture Well & Trough Local Water Use

**Created:** 2026-09-18
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** ~~settlements-009~~, ~~settlements-npcs-035~~
**Domain:** `settlements-npcs`
**Type:** `feature`
**Subdomains:** `household` `logistics`
**Tags:** `pasture` `well` `trough` `water` `livestock`
**Roadmap:** -

## Cel

Potraktować studnię i koryto na settlement pasture jako jeden logiczny układ infrastruktury.

Pasture już posiada w `VillagePasturePlan` jawne anchory:

```ts
well: VillagePastureAnchor
trough: VillagePastureAnchor
```

Po implementacji:

```text
planned pasture
→ well + trough tworzą jedną lokalną parę infrastruktury
→ dystans <= 2 m
→ gracz może napełnić pasture trough
   korzystając z wiadra na sznurze należącego do studni
→ własny bucket/waterskin w inventory nie jest wymagany
→ istniejący Household.water pozostaje jedynym authoritative zapasem
```

Nie rozszerzać tego planu na household yards, ogólną logistykę wody NPC ani wszystkie trough w świecie.

## 1. Stan obecny zweryfikowany w kodzie

### Pasture

`src/settlement/villagePasture.ts::planSettlementPasture()` planuje wspólnie:

- pasture footprint;
- `well`;
- `trough`;
- connection/path;
- fence.

`src/settlement/villagePlan.ts::VillagePasturePlan` przechowuje oba anchory jako część deterministic worldgen planu.

Runtime materialization w `src/settlement/props.ts` korzysta z tych pozycji. Nie przesuwać props po wygenerowaniu planu.

### Settlement water ownership

`Household.water` pozostaje authoritative finite reserve gospodarstwa.

Pasture trough jest dodatkowym household-backed stored-water anchor dla livestock; `src/fauna/animalForaging.ts` już traktuje pasture trough jako dodatkową pozycję korzystającą z tego samego `Household.water` co yard trough.

Nie dodawać osobnego `pastureTrough.waterLitres`.

### NPC

Obecny loaded `NpcAgent.waterDuty` pobiera wodę ze studni i kończy zwykłym deposit do `Household.water`.

Ten plan nie zmienia:

- `waterDuty`;
- wyboru studni przez NPC;
- destination depositu;
- potrzeb ludzi vs zwierząt;
- time-skip approximation.

### Player-built troughs

`PlayerTroughRecord.waterLitres` pozostaje osobnym ownerem player-built trough storage.

Ten plan nie zmienia player-built trough.

## 2. Lokalny kontrakt well + trough

Dodać jedną canonical stałą dla pasture layout/interakcji, np.:

```ts
export const PASTURE_WELL_TROUGH_BUCKET_REACH = 2
```

Znaczenie:

```text
distance(pasture.well, pasture.trough) <= 2 m
→ trough jest w zasięgu wiadra na sznurze studni
```

V1 używa world-space center-to-center distance. To jest zasięg użytkowy sznura/wiadra, nie collision footprint.

Stała ma być używana zarówno przez planner/testy, jak i przez runtime eligibility interakcji. Nie kopiować magicznego `2` w kilku miejscach.

## 3. Pasture layout

Głównym ownerem zmiany jest `src/settlement/villagePasture.ts`.

Well i trough mają być planowane jako jedna lokalna para infrastruktury.

Docelowy kontrakt:

```text
valid VillagePasturePlan
→ distance(well, trough) <= PASTURE_WELL_TROUGH_BUCKET_REACH
```

Nie robić tego jako runtime correction.

### Placement constraints

Nowy układ nadal musi respektować istniejące:

- terrain/water clearance;
- pasture footprint;
- connection/path corridor;
- fence clearance;
- local access;
- istniejące deterministic layout fallbacki.

Preferować zmianę lokalnej geometrii `layoutOnCandidate()` / anchor offsets tak, aby prawidłowy pasture z definicji spełniał <= 2 m.

Jeżeli recon podczas implementacji pokaże pojedynczy istniejący fallback, którego nie da się utrzymać bez złamania hard constraints, zachować poprawny layout zamiast wymuszać wadliwy pasture i dodać focused test dokumentujący wyjątek. Nie dodawać losowych retries.

## 4. Studnia ma implicit rope + bucket

Generated pasture well traktować jako infrastrukturę wyposażoną w sznur i wiadro.

Nie reprezentować tego jako:

- `ItemInstance`;
- `wooden_bucket`;
- `copper_bucket`;
- household inventory;
- persistent `WellBucketRecord`;
- durability/loot.

Implicit bucket jest lokalnym affordance studni i nie może być zabrany przez gracza.

## 5. Player interaction

Dodać interakcję wyłącznie dla pasture trough.

Eligibility:

```text
selected trough belongs to VillagePasturePlan
+
paired pasture well is the well from the same plan
+
distance <= PASTURE_WELL_TROUGH_BUCKET_REACH
+
owning Household.water has free capacity
→ [E] Napełnij koryto
```

Nie wymagać carried bucket/waterskin.

Nie wyszukiwać nearest well w runtime. Pairing jest już jednoznaczny przez ten sam `VillagePasturePlan`.

Nie robić wszystkich settlement trough interaktywnymi.

### Action lifecycle

Akcja:

```text
start short busy action
→ revalidate pasture/household/well/trough
→ fill existing Household.water
```

Mutation tylko na completion.

Przerwana akcja nie dodaje wody.

## 6. Ilość wody

Jedna udana lokalna akcja przy paired pasture well napełnia household water reserve do aktualnego capacity.

Powód:

- źródło jest bezpośrednio obok trough;
- implicit bucket może wykonać kilka opuszczeń podczas jednej krótkiej czynności;
- wielokrotne klikanie po kilka litrów nie tworzy interesującej decyzji;
- nie udajemy transportu na odległość.

Użyć istniejącego `WaterReserve` ownera/API i jego clamp/capacity semantics.

Jeżeli brakuje narrow helpera, dodać go do właściwego household/water ownera, np. semantyczne `fillToCapacity()`, zamiast mutować pola reserve z action code.

Nie reuse'ować `WATER_FETCH_AMOUNT`: opisuje jedną logistyczną dostawę NPC, a nie lokalne użycie wiadra studni.

## 7. Runtime binding do Household

`VillagePasturePlan` nie musi dostać `householdId`.

Reuse istniejącego runtime seam, który już przekazuje pasture trough jako household-backed `householdWaterAnchor` odpowiednim livestock.

Dla player interaction runtime settlement musi wystawić minimalny read-only context pozwalający rozwiązać:

```text
pasture trough runtime target
→ owning Household
→ paired pasture well
```

Nie używać nearest-house heuristic.

Nie persistować pairingów ani household bindingu, jeśli są derivable z istniejącego settlement runtime/contextu.

## 8. Shared reserve consequence

Napełnienie pasture trough zwiększa wspólny:

```text
Household.water
```

To oznacza, że ten sam reserve jest od razu dostępny dla:

- livestock przy pasture trough;
- livestock przy yard trough;
- domowników korzystających z household water;
- innych istniejących presentation consumers tego reserve.

To jest świadoma konsekwencja obecnego modelu, nie powód do dodania osobnego trough storage.

Implementacja nie może próbować „naprawiać” tego przez rozdzielenie wody na yard/pasture/barrel.

## 9. Livestock

Brak zmian w decision logic.

Istniejący flow pozostaje:

```text
household-backed trough has Household.water
→ livestock drinks
→ Household.water.remove(...)
```

Przy pustej reserve istniejący natural-water fallback pozostaje bez zmian.

## 10. NPC i off-screen simulation

Brak zmian.

Nie modyfikować:

- `NpcAgent.waterDuty`;
- `resolveWaterWellTarget()`;
- NPC inventory;
- household needs;
- time skip;
- unloaded settlement aggregation.

Jeżeli później chcemy, aby NPC świadomie napełniał fizyczne pasture trough na podstawie livestock thirst, zrobić osobny plan.

## 11. Persistence

Nie dodawać save schema.

Pozycje well/trough są deterministic częścią `VillagePasturePlan`.

Woda pozostaje w istniejącym persisted `Household.water`.

Nie persistować:

- rope bucket;
- well↔trough pairing;
- last fill actor;
- interaction cooldown;
- local litres na pasture trough.

## 12. Integration points

### `src/settlement/villagePasture.ts`

- canonical layout change;
- well/trough proximity <= 2 m;
- zachowanie istniejących hard constraints i determinism.

### `src/settlement/villagePasture.test.ts`

- proximity contract;
- deterministic layout;
- path/fence/water/clearance regressions.

### `src/settlement/villagePlan.ts`

- prawdopodobnie bez zmiany typu;
- ewentualnie home dla shared exported proximity constant tylko jeśli to właściwy owner; preferować mały settlement water/layout helper zamiast wrzucać mechanic constant do dużego type file bez potrzeby.

### `src/settlement/props.ts`

- dalej materializuje planowane anchors;
- wystawić minimalny runtime context dla pasture trough interaction;
- bez ownership wody.

### `src/settlement/createSettlement.ts`

- istniejący composition seam zna households, pasture anchors i live settlement;
- podłączyć pasture trough interaction binding do właściwego `Household`;
- reuse istniejącego runtime relationship używanego dla `householdWaterAnchors`.

### `src/fauna/animalForaging.ts`

- read/reference: istniejący household-backed pasture trough contract;
- nie zmieniać animal decision logic.

### `src/app/interactables.ts`

- dodać dokładny pasture-trough target/prompt;
- nie generalizować wszystkich settlement trough.

### właściwy action module pod `src/app/actions/`

- short busy action;
- completion revalidation;
- mutation przez existing household water owner.

Nie wciskać akcji do `placementActions.ts`, jeśli current interaction/action ownership pokazuje lepszy istniejący water/settlement action seam.

## 13. Testy

### Layout

- generated pasture ma well + trough;
- poprawny standardowy layout spełnia <= 2 m;
- exactly 2 m pozostaje eligible;
- same seed/input → same positions;
- existing corridor/fence/water/terrain constraints nadal przechodzą.

### Interaction

- pasture trough + paired usable well <= 2 m → `[E] Napełnij koryto`;
- brak własnego bucket/waterskin → action nadal dostępna;
- full `Household.water` → brak fill action / poprawny full feedback;
- unrelated yard trough nie dostaje nowej akcji;
- vendor paddock trough nie dostaje nowej akcji;
- player-built trough flow pozostaje bez zmian.

### Action

- state nie mutuje się na start;
- successful completion napełnia `Household.water` do capacity;
- cancellation nie dodaje wody;
- revalidation failure nie dodaje wody;
- nie powstaje inventory water ani bucket item.

### Shared reserve regression

Po pasture fill:

- livestock może napić się przy pasture trough;
- livestock może napić się przy yard trough tego samego household;
- oba przypadki zużywają ten sam `Household.water`;
- nie istnieje drugi pasture-trough storage.

### Persistence

- brak nowej save migration;
- existing household water round-trip pozostaje poprawny;
- pasture geometry po rebuild pozostaje deterministic.

## 14. Browser verification

User wykonuje manualnie. AI nie wykonuje browser verification.

1. Znaleźć settlement z planned pasture.
2. Sprawdzić, że pasture well i trough stoją obok siebie w logicznym układzie.
3. Nie posiadać bucket/waterskin.
4. Podejść do pasture trough.
5. Zobaczyć `[E] Napełnij koryto`.
6. Wykonać akcję.
7. Potwierdzić napełnienie wspólnego household water reserve / water visual.
8. Pozwolić livestock napić się przy pasture trough.
9. Potwierdzić normalne zużycie reserve.
10. Sprawdzić yard trough tego samego household — korzysta z tej samej reserve zgodnie z obecnym modelem.
11. Save/load i ponownie potwierdzić poprawny pasture layout i household water.
12. Sprawdzić, że zwykłe household-yard trough i player-built trough nie dostały niezamierzonej nowej semantyki.

## 15. Non-goals

Nie implementować:

- zmian `NpcAgent.waterDuty`;
- NPC trough-filling decisions;
- livestock-demand detection;
- household-yard trough proximity;
- household well relayout;
- central settlement trough changes;
- vendor paddock changes;
- player-built trough changes;
- generic well→trough interaction dla całego świata;
- fizycznego bucket item należącego do studni;
- nowego trough water storage;
- nowego WaterSource subsystemu;
- irrigation;
- garden watering.

## 16. Definition of Done

- `VillagePasturePlan` tworzy well + trough jako bliską funkcjonalną parę;
- normalny valid pasture spełnia <= 2 m;
- gracz może napełnić pasture trough bez własnego wiadra;
- akcja korzysta z implicit rope bucket studni;
- pojedyncza akcja napełnia istniejący `Household.water` do capacity;
- istniejący wspólny reserve nadal zasila yard/pasture livestock consumers;
- NPC waterDuty pozostaje bez zmian;
- livestock decision logic pozostaje bez zmian;
- household yards, vendor paddocks i player-built trough pozostają poza zakresem;
- brak nowego persisted state;
- brak nowego managera.

Dla nowych ważnych helperów geometry/interaction dodać JSDoc z odpowiednim `@domain`, jeśli pomaga późniejszemu preflight/reuse.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

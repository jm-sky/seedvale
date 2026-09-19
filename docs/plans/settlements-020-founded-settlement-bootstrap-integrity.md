# Plan: Founded settlement bootstrap integrity

**Created:** 2026-09-19
**Status:** `planned` 📋
**Type:** fix
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `settlements`
**Subdomains:** `population` `development`
**Tags:** `colony` `founding` `persistence` `residency`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

## Goal

Domknąć correctness już zaimplementowanego founded-settlement foundation z `settlements-003` przed uruchomieniem live founded settlement runtime.

Ten plan jest follow-up/fixem do wdrożonych Stage 1/3 z `settlements-003`, nie implementation prerequisite tego planu. Naprawia wykryte po implementacji niespójności w semantic home binding, fizycznym camp layout, legacy founded-state migration i idempotent repair.

Nie materializuje jeszcze live `NpcAgent` ani nie dodaje streamingu founded settlement. Po tym planie authoritative founded state ma być bezpiecznym fundamentem dla `settlements-021` i `settlements-022`.

## Current code baseline

Na aktualnym `main`:

- `src/settlement/foundedSettlement.ts` posiada persisted `FoundedSettlementRecord`, stable founded settlement/household/tent IDs oraz residency overrides;
- `src/settlement/foundedSettlementBootstrap.ts::bootstrapFoundedSettlement(...)` tworzy founded record, economy, jednoosobowe households, fizyczne `PlacedTent` i czyści zakończony expedition travel;
- `Household.homeId` semantycznie wskazuje `Place.id`, ale bootstrap founded zapisuje dziś bezpośrednio `foundedTentId`;
- wszystkie founding tents są dziś umieszczane w tym samym `(input.x, input.z)` z `yaw = 0`;
- ścieżka `existing` tworzy brakujący stable tent z condition 100 bez item instance, co może mintować world object i maskować uszkodzony/pominięty persisted state;
- `PlacedTents` jest authoritative ownerem fizycznego tent state (`x/z/yaw/condition/lastConditionUpdateAtDays/repair`) i już udostępnia `get(id)`;
- `PlacedTents` nie ma dziś bezstratnego API do relokacji istniejącego namiotu;
- `homeIndexFromPlaceId()` i lodging resolvers celowo dekodują tylko proceduralne `${settlementId}:home:<index>`; founded semantic home nie powinien udawać proceduralnego house indexu;
- `FoundedSettlementRecord.x/z` to centrum site/settlement, nie powinno być automatycznie pozycją każdego domu;
- istniejące save'y po Stage 3 mogą już zawierać founded households i trzy stable tents nałożone dokładnie w centrum.

## Required decisions

### Stable semantic founded home

Dodać deterministic semantic home identity oddzieloną od physical tent identity, np.:

```ts
foundedHomePlaceId(settlementId, npcId)
```

`Household.homeId` ma wskazywać ten `Place.id`, nie raw `PlacedTent.id`.

Znaczenie:

```text
semantic household home
    ↓ runtime resolver
current physical shelter
```

V1 physical shelter to stable founded tent. Późniejszy plan może zmienić physical shelter na residential building bez zmiany household identity.

Nie rozszerzać globalnie znaczenia `Household.homeId` na "dowolny world-object id".

Nie zmieniać `homeIndexFromPlaceId()` tak, aby parsował founded homes. Procedural house/lodging paths powinny nadal zwracać `null` dla founded semantic home, dopóki osobny system nie dostarczy realnego bed/lodging capability.

### Narrow founded home resolver

Dodać najmniejszy resolver potrzebny kolejnym planom, semantycznie:

```text
FoundedSettlementRecord + npcId + PlacedTents
→ Place | null
```

Resolver buduje stable `Place.id` z `foundedHomePlaceId`, bierze world position z realnego `PlacedTent`, nie kopiuje `x/z` do founded registry ani household i zwraca brak/invalid binding, gdy physical shelter nie istnieje.

Nie projektować tutaj ogólnego settlement-wide home abstraction; szerszy resident runtime contract należy do `settlements-021`.

### Deterministic camp layout

Bootstrap ma precompute'ować stabilną, bounded pozycję i yaw każdego founding tent zamiast nakładać wszystkie namioty na center.

Wymagania:

- deterministyczne z founded settlement/site identity + settlement center + ordered resident/member set;
- mały camp footprint wokół `FoundedSettlementRecord.x/z`;
- pozycje różnych founderów nie mogą się pokrywać;
- stable yaw;
- layout nie może zależeć od frame/runtime RNG;
- nie dodawać seed do bootstrap API tylko dla layoutu;
- nie wykonywać automatycznego procedural village planning.

Preferować mały reusable pure helper zwracający wszystkie placement descriptors przed transaction commit.

### Placement footprint ownership

`bootstrapFoundedSettlement(...)` ma dziś tylko `siteReady: boolean`; nie posiada authoritative terrain-preparation records i nie powinien sam przeszukiwać world state.

Jeżeli camp ma respektować realnie przygotowane footprinty, consumer (pierwszy: `quests-progression-010`) powinien wybrać/zwalidować footprint na bazie istniejącego `querySiteInfrastructure()` i przekazać bootstrapowi mały plain-data placement input, np. center/orientation/bounded area albo gotowe validated camp anchors.

Nie przekazywać całego `TerrainPreparationRecord[]` do settlement bootstrapu i nie kopiować terrain state do `FoundedSettlementRecord`.

### Existing bootstrap consistency

Repeated bootstrap pozostaje idempotentny, ale `existing` oznacza spójny istniejący settlement, nie "cokolwiek da się automatycznie odtworzyć".

Dla istniejącego founded settlement sprawdzić expected `settlementId` ↔ `siteId`, zgodny `sponsorSettlementId`, zgodny ordered/member set, expected founded households/home ids, expected stable tent ids oraz physical tent bindings.

Safe derived bindings, np. residency map albo semantic `homeId`, można naprawić, jeżeli wszystkie authoritative physical/state facts są spójne.

### Missing physical tent is not safe repair

Jeżeli founded record istnieje, ale expected persisted `PlacedTent` nie istnieje:

- nie mintować condition-100 tent;
- nie konsumować nowego inventory tent;
- nie zwracać zwykłego `existing`.

Wprowadzić jawny generic inconsistency result, np. semantycznie `{ status: 'inconsistent'; reason: ... }`. Nie wrzucać trwałego corruption/broken-binding przypadku do chwilowego `not_ready`.

`quests-progression-010` i każdy consumer bootstrap API musi jawnie obsłużyć nowy wynik.

### Stable-tent conflict validation

Także pierwszy bootstrap musi walidować sytuację, w której `PlacedTents.get(expectedTentId)` zwraca obiekt mimo braku founded recordu. Nie traktować samego stable id jako automatycznego dowodu poprawności.

Existing tent musi być zgodny z oczekiwanym binding/placementem albo operacja zwraca conflict/inconsistency. Founded bootstrap nie może stworzyć drugiego world objectu z tym samym stable id.

Nie przebudowywać całego `PlacedTents` id modelu bez potrzeby; zabezpieczyć founded transaction boundary.

## Legacy founded-state migration

Ten plan musi naprawić już zapisane founded colonies utworzone przez obecny Stage 3.

Legacy signature V1:

- istnieje `FoundedSettlementRecord`;
- resident stable tents istnieją;
- tents mają exact/near-exact `x/z === record.x/z` i `yaw === 0`;
- household `homeId` może być raw `foundedTentId`.

Migration/reconciliation ma być deterministic i idempotent:

1. wylicz expected camp layout;
2. semantic household home ids napraw do `foundedHomePlaceId`;
3. legacy stable tents przenieś na expected placements;
4. zachowaj cały physical tent state.

Nie relokować arbitrary tent tylko dlatego, że ma founded-looking id, jeśli istniejący state nie pasuje do rozpoznanej legacy signature.

### Lossless PlacedTent relocation

Do obsługi legacy migration preferować małe API w `PlacedTents`, np. `relocate(id, x, z, yaw): boolean`.

Semantyka:

- zachowuje `id`;
- zachowuje `condition`;
- zachowuje `lastConditionUpdateAtDays`;
- zachowuje active `RepairProgress`;
- aktualizuje persisted record transform;
- aktualizuje/rebuilds mesh transform bez pack→item→place round-trip.

Nie implementować migracji przez `pack()` + `place()`, bo ten path jest gameplay item transferem i nie zachowuje automatycznie całego world-record state.

## Transaction boundary

Przed pierwszą irreversible mutation dla nowego settlementu precompute'ować i zwalidować:

- settlement/household/home/tent ids;
- wszystkie founder states;
- wszystkie wymagane tent instances;
- wszystkie camp placements;
- konflikty existing founded records/households/placed tents.

Dopiero potem commitować authoritative changes.

Legacy reconciliation existing settlementu ma najpierw wykryć cały rozpoznawalny migration set, a dopiero potem zastosować semantic-home + tent relocation changes. Nie zostawiać pół-zmigrowanego household/camp przy wykrytym konflikcie.

Nie implementować rollback przez odtwarzanie przybliżonych itemów.

## Cross-plan contracts

### settlements-003

Ten plan jest correction/follow-up do już zaimplementowanych Stage 1/3. Nie zależy implementacyjnie od zakończenia pozostałych Stage 2/4 z `settlements-003`.

Po wdrożeniu `020`, dokumentacja `settlements-003` powinna wskazywać, że bootstrap-integrity follow-up został domknięty, a live remainder jest kontynuowany przez `021/022`.

### settlements-021

`settlements-021` ma reuse `foundedHomePlaceId`, founded home resolver oraz corrected residency/household bindings. Nie może ponownie definiować physical tent jako household identity.

### settlements-022

Founded live runtime ma traktować physical tent position jako current home anchor V1 i korzystać z tego samego resolvera, nie rekonstruować camp placement drugi raz.

### quests-progression-010

Pierwszy consumer bootstrap API nadal owns mine-specific site readiness, może wybrać validated camp footprint/anchors z `querySiteInfrastructure()`, musi obsłużyć explicit inconsistent/conflict bootstrap result i nie owns household/tent/founded state.

### settlements-005

Residential-house construction może później zmienić physical home/shelter foundera. Stable semantic founded home `Place.id` ma umożliwić taką zmianę bez zmiany household identity.

### settlements-npcs-039

Procedural lodging/home-index resolver nie ma traktować founded tent jako procedural furnished house/bed. Brak founded lodging provider w tym planie jest świadomym zachowaniem.

### settlements-npcs-044

Authored outpost może później reuse wzorzec stable semantic household home → current real physical shelter. Nie dodawać jednak dependency między `020` a `044`.

## Performance

Ten plan nie dodaje żadnego ticku ani skanu per-frame.

- camp layout pure/bounded;
- reconciliation wykonywany wyłącznie przy bootstrap/restore/rebuild boundary, nie w game loop;
- `PlacedTents.relocate` może pozostać O(n) zgodnie z aktualnym `get/pack` modelem małej kolekcji;
- brak spatial index/workera;
- brak settlement-wide procedural planning.

## Relevant files/systems

Najbardziej prawdopodobne miejsca zmian:

- `src/settlement/foundedSettlement.ts`
- `src/settlement/foundedSettlementBootstrap.ts`
- `src/settlement/household.ts`
- `src/settlement/places.ts`
- `src/items/createPlacedTents.ts`
- `src/app/worldBundle.ts` / consumer wiring tylko jeśli bootstrap input się rozszerzy
- consumer z `quests-progression-010` po jego implementacji lub w tym samym delivery, jeśli call site już istnieje
- odpowiadające testy founded bootstrap/registry/placed tents

Nie rozszerzać `PlacedTent` o household/residency state.

## Scope

In scope:

- stable semantic founded home `Place.id`;
- narrow semantic-home → physical-tent resolver;
- deterministic non-overlapping camp placement;
- optional validated placement-footprint input;
- legacy overlapped-camp/homeId reconciliation;
- lossless tent relocation seam;
- strict idempotent existing-path semantics;
- sponsor/member/tent conflict validation;
- explicit inconsistent/conflict bootstrap result;
- save/load/rebuild-compatible tests.

## Non-goals

- live `NpcAgent` founded residents;
- refactor `SettlementLandmarks`;
- settlement streaming;
- profession behavior;
- permanent houses/upgrades;
- founded lodging provider;
- camp growth/development;
- authored outposts;
- quest stages/dialogue.

## Verification

Automated:

- każdy founder ma unikalny deterministic tent placement i stable yaw;
- ten sam settlement/site center + ordered resident set daje ten sam layout;
- `Household.homeId` jest founded semantic `Place.id`, nie raw tent id;
- founded home resolver wskazuje właściwy real tent position;
- `homeIndexFromPlaceId` nadal nie interpretuje founded home jako procedural house;
- repeated bootstrap spójnego settlementu nie konsumuje kolejnego tent itemu;
- missing persisted tent w existing path nie tworzy darmowego tent i zwraca explicit inconsistency;
- incompatible existing site/sponsor/member binding nie jest silently accepted;
- pre-existing stable tent conflict nie tworzy duplicate physical object;
- legacy Stage-3 save z trzema overlapped tents zostaje raz deterministycznie rozłożony;
- druga reconciliation nie zmienia już camp positions/state;
- relocation zachowuje condition, `lastConditionUpdateAtDays` i active repair progress;
- save/load/rebuild zachowuje corrected semantic home i physical placements bez duplikacji.

Uruchomić focused tests, typecheck i build. Player wykonuje browser/gameplay verification; AI nie uruchamia browser verification.

Dodać JSDoc z `@domain settlements` dla nowych publicznych stable-id/home-layout kontraktów istotnych dla preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Plan: Colony settlement bootstrap

**Created:** 2026-09-08
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** world-019, settlements-npcs-028
**Domain:** `settlements`
**Subdomains:** `population` `development` `economy`
**Tags:** `colony` `camp` `founding` `persistence`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

> **Draft note:** ten dokument jest wstępnym szkicem do review, poprawek i uzupełnienia. Nie traktować go jeszcze jako gotowego planu implementacyjnego ani nie implementować przed review zależności i kontraktów opisanych poniżej.

## Goal

Dodać najmniejszy reusable mechanizm przejścia:

```text
arriving expedition
→ provisional camp
→ ordinary persistent settlement
```

Pierwszym konsumentem będzie kolonia przy opuszczonej kopalni złota, ale rezultat nie może być quest-specific simulation. Po bootstrapie kolonia ma być zwykłym settlement/world/NPC state używającym istniejących potrzeb, households, professions, economy, resources i persistence.

Nie tworzyć `MiningColonyManager` ani równoległego lifecycle osad.

## Current baseline

Recon aktualnego `main` wykazał:

- proceduralne settlements mają stabilne `SettlementDef.id` i są streamowane przez `SettlementsManager`;
- `SettlementsManager` posiada lifecycle runtime settlements oraz registry dla economy, households, NPC state i relationships;
- nie istnieje persisted registry runtime-founded settlements ani publiczny mechanizm `world site → settlement`;
- `VillageSize` zawiera `SM | MD | LG | XL | OUTPOST`, ale obecna proceduralna generacja size/families nie nadaje się bezpośrednio do kolonii z trzema już istniejącymi NPC;
- `PlacedTents` są realnymi persistent world objects zapisywanymi przez `SaveData`;
- nie istnieje jednak `persistent tent → NPC shelter/home anchor`;
- NPC identity jest obecnie settlement-derived (`${settlementId}:npc:${i}`), dlatego nie wolno tworzyć przy bootstrapie nowych kopii expedition NPC pod ID kolonii;
- miner work już używa zwykłych `ResourceDeposits`, realnego carried inventory i `SettlementEconomy`;
- pełna off-screen continuity ekspedycji i settlement production nie jest jeszcze gotowym mechanizmem.

## Core ownership decision

Runtime-founded colony powinna wejść do istniejącego ownership `SettlementsManager`, zamiast otrzymać osobny manager.

Docelowy lifecycle powinien mieć jeden wspólny runtime path:

```text
procedural settlement definition
             or
persisted founded settlement definition
              ↓
       SettlementsManager
              ↓
       createSettlement(...)
              ↓
normal Settlement / NPC / economy simulation
```

Plan może dodać minimalny persisted representation dla founded settlement, ale nie powinien kopiować pełnego proceduralnego generatora ani tworzyć osobnego runtime settlement type bez potrzeby.

## Bootstrap contract

Bootstrap uruchamia się dopiero, gdy wymagani expedition NPC realnie dotarli do destination i wymagane dependency state jest dostępne.

Operacja ma być deterministyczna i idempotentna:

1. resolve stable colony/site identity;
2. get-or-create founded settlement record;
3. wykorzystać istniejącą przygotowaną infrastrukturę site;
4. rozstawić realne namioty przewiezione przez expedition NPC;
5. powiązać tents jako persistent shelter/home anchors;
6. przypisać istniejących NPC do colony residency/membership bez zmiany ich identity;
7. utworzyć lub przypisać households bez duplikowania mieszkańców i state;
8. zainicjalizować normalny settlement economy tylko raz;
9. zachować stable relation do sponsoring/mother settlement;
10. przekazać dalsze zachowanie normalnym NPC needs/work/economy systems.

Ponowne wywołanie po save/load lub world rebuild ma zwrócić istniejący rezultat, a nie ponownie wykonać bootstrap.

## Founded settlement identity

Kolonia potrzebuje stable ID niezależnego od runtime load order i proceduralnego settlement-grid generation.

ID powinno być deterministycznie związane ze stable destination/site identity z roadmapy kopalni, nie z `Date.now()`, kolejnością ładowania ani pozycją NPC w tablicy.

Persisted founded settlement state powinien przechowywać tylko informacje, których nie można bezpiecznie odtworzyć z deterministic world state.

Nie projektować w tym planie generic settlement editor ani pełnego systemu zakładania dowolnych miast przez gracza.

## NPC membership and identity

Bootstrap nie może generować nowych NPC dla kolonii.

Każdy expedition member zachowuje istniejący `NpcId` oraz authoritative personal state. Settlement residency/membership musi zostać oddzielona na tyle od proceduralnego `SettlementDef.families`, aby istniejący NPC mógł stać się mieszkańcem nowej osady bez zmiany identity.

Nie kopiować `NpcStateSnapshot`, relationships, traits, health, needs ani inventory do nowego NPC record.

Jeżeli `settlements-npcs-028` zmieni persistence NPC inventory/travel ownership, użyć jego finalnego contractu zamiast projektować drugi transfer belongings w tym planie.

## Households

V1 nie musi implementować generic migration/family relocation system.

Bootstrap może deterministycznie utworzyć minimalne colony households dla trzech przybyłych NPC albo przenieść istniejące household membership, zależnie od finalnego modelu po review.

W obu przypadkach wymagane jest:

- zachowanie NPC identity;
- brak duplikacji household records;
- brak utraty realnego inventory/state;
- stable household IDs;
- poprawny save/load;
- możliwość późniejszego zastąpienia tent home przez normalny building/home bez zmiany NPC identity.

To jest punkt wymagający doprecyzowania podczas review planu.

## Tents as provisional homes

Reuse `PlacedTents` jako ownera fizycznych namiotów.

Bootstrap nie może spawnąć dekoracyjnych namiotów niezależnych od inventory. Expedition NPC muszą dostarczyć realne tent items zgodnie z finalnym inventory contractem zależności.

Potrzebne jest najmniejsze rozszerzenie pozwalające:

- utworzyć/upsert `PlacedTent` ze stable deterministic ID;
- zużyć/przenieść odpowiedni realny tent item dokładnie raz;
- powiązać placed tent z household/home ownership;
- rozwiązywać tent jako shelter/home anchor dla zwykłych NPC sleep/needs semantics;
- zachować namiot i ownership po save/load.

Nie tworzyć osobnego `CampTent`, `ColonyTent` ani drugiego tent registry.

Obecne timestamp-based ID z normalnego player placement nie może być podstawą idempotentnego colony bootstrap.

## Mother settlement relation

V1 nie potrzebuje systemu politycznego.

Founded settlement powinien przechować prostą stable provenance relation do sponsoring settlement, np. semantycznie `sponsorSettlementId` / `foundedFromSettlementId`.

Relation oznacza pochodzenie/sponsorship i może być później konsumowana przez quests, history, trade lub dialogue. Nie implikuje automatycznie sovereignty, taxes, diplomacy ani hierarchy simulation.

Finalną nazwę pola ustalić podczas review zgodnie z istniejącymi naming conventions.

## Infrastructure integration

Plan zależy od `world-019-persistent-player-built-site-infrastructure`.

Bootstrap powinien konsumować zwykły persisted/queryable world infrastructure state dostarczony przez ten plan, w szczególności przygotowany teren oraz dostępne well/garden/construction anchors. Nie kopiować ich do colony-specific records.

Kolonia może rozpocząć działanie z niepełną infrastrukturą tylko wtedy, gdy finalne gameplay requirements roadmapy na to pozwalają; brakujące zasoby powinny tworzyć normalne pressures/problems, nie questowe fake state.

## Water and farming

Reuse istniejące `WaterSource`, player-built well oraz normalne farming/garden mechanisms.

Bootstrap nie tworzy colony-only water supply ani farming simulation. Jeżeli istniejący NPC work potrzebuje settlement landmarks/anchors, founded settlement musi wystawić odpowiednie normalne anchors wskazujące realną infrastrukturę site.

## Economy and miner work

Po bootstrapie colony używa normalnego `SettlementEconomy`.

Minerzy zachowują zwykłą profession semantics. `planOreGathering()` ma nadal:

- wyszukiwać normalne `ResourceDeposits`;
- wydobywać przez shared mining hooks;
- respektować depletion;
- przenosić realny yield;
- odkładać gold/ore do normalnego settlement economy.

Nie tworzyć questowego gold counter ani colony-specific mine production registry.

## Off-screen simulation

Bootstrap nie powinien tworzyć specjalnego off-screen mining loop.

Docelowo founded settlement musi uczestniczyć w tym samym adaptive/off-screen settlement simulation co pozostałe settlements. Jeżeli podczas implementation review nadal nie istnieje reusable off-screen production contract, potraktować to jako dependency/blocker albo wyodrębnić najmniejszy shared mechanism — nie implementować `MiningColonyOffscreenSimulation`.

Detailed i off-screen execution nie mogą równocześnie wydobywać z tego samego deposit ani podwójnie creditować economy.

## Persistence and idempotency

Save/load musi zachować co najmniej nie-rederivable founded state wymagany przez finalny model, w tym:

- founded settlement identity;
- site/location association;
- sponsor/mother settlement relation;
- residency/membership assignments;
- household/home assignments, jeśli nie wynikają z innych persisted ownerów;
- placed tents przez istniejący tent persistence;
- normalne economy/household/NPC state przez istniejące registries.

Bootstrap musi używać stable keys i `get-or-create`/`upsert` semantics.

Repeated bootstrap, save/load, settlement stream-out/in i WorldBundle rebuild nie mogą duplikować:

- settlement;
- NPC;
- households;
- membership;
- tents;
- consumed inventory;
- economy initialization;
- quest/bootstrap rewards lub completion state.

Nie używać samego boolean `bootstrapComplete` jako jedynego zabezpieczenia, jeśli authoritative world records mogą bezpośrednio potwierdzić wykonane kroki.

## Dependencies

### `world-019`

Required for durable/queryable player-built site infrastructure. Aktualnie planowany, nie zakładać implementacji bez ponownego sprawdzenia kodu.

### `settlements-npcs-028`

Required for real expedition arrival and NPC identity/inventory continuity during long-distance travel. Aktualnie `draft`; przed implementacją tego planu sprawdzić jego finalny contract i zależności.

Quest orchestration z `quests-progression-010` powinno być konsumentem bootstrapu, nie ownerem settlement state.

## Scope

In scope:

- persisted runtime-founded settlement identity;
- registration in normal settlement lifecycle;
- deterministic/idempotent colony bootstrap;
- existing expedition NPC → colony residency;
- minimal household assignment needed for ordinary simulation;
- real placed tents as provisional persistent homes;
- sponsor/mother settlement provenance;
- normal economy/miner integration;
- persistence and reconstruction semantics.

## Non-goals

- generic player settlement-founding UI;
- generic migration system;
- procedural population generation for the colony;
- political hierarchy/diplomacy;
- taxes/profit sharing;
- quest stages/dialogue/rewards;
- expedition selection or long-distance travel;
- implementing `world-019` infrastructure;
- generic building replacement/upgrades from tents to houses;
- population growth/reproduction;
- colony-specific mining/economy simulation;
- a new settlement, camp, tent or mining manager.

## Verification

Automated verification should cover at minimum:

- stable founded settlement ID;
- bootstrap called twice produces one settlement;
- save/load produces one settlement and the same membership;
- existing NPC IDs survive reassignment;
- tents are consumed/placed once and restore once;
- household/home assignments survive reload;
- economy initialization is not repeated;
- sponsor relation survives reload;
- normal miner work can use a gold deposit and credit the colony economy;
- no duplicate result after stream-out/in or equivalent runtime reconstruction.

Player performs browser/gameplay verification manually; AI agent does not run browser verification.

Before implementation, create/update focused implementation notes from the then-current code. Add JSDoc for important new public/architectural settlement lifecycle functions/types where useful for preflight discovery, using `@domain settlements` where appropriate.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

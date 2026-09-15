# Plan: Colony settlement bootstrap

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** ~~world-019~~, ~~settlements-npcs-028~~
**Domain:** `settlements`
**Subdomains:** `population` `development` `economy`
**Tags:** `colony` `camp` `founding` `persistence`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

## Goal

Dodać najmniejszy reusable mechanizm przejścia:

```text
arrived expedition
→ provisional camp
→ ordinary persistent settlement
```

Pierwszym konsumentem będzie kolonia przy opuszczonej kopalni złota. Po bootstrapie wynik ma wejść do zwykłego settlement/NPC/economy lifecycle; quest jedynie inicjuje operację i obserwuje jej wynik.

Nie tworzyć `MiningColonyManager`, drugiego settlement runtime ani quest-owned kopii NPC/households/economy.

## Recon baseline — current `main`

Zweryfikowane kontrakty:

- `src/settlement/SettlementsManager.ts` jest długowiecznym ownerem registry dla `SettlementEconomy`, `Household` i `NpcAuthoritativeState`; stream-out/in nie może tworzyć drugiego state ownera.
- `src/settlement/npcState.ts::NpcAuthoritativeState` posiada persistent `personalInventory` oraz generic `travel`; expedition travel zachowuje identity i stan NPC poza live `NpcAgent`.
- `SettlementsManager.dispatchReadyExpedition(...)` jest publicznym seam dla `settlements-npcs-028`.
- `src/app/worldBundle.ts` wystawia expedition assignment/provisioning oraz `querySiteInfrastructure(site)` z `world-019`.
- `src/world/siteInfrastructure.ts` zwraca authoritative `completedTerrainPreparations`, usable Player wells i live cultivation areas; bootstrap ma je czytać, nie kopiować.
- `src/items/createPlacedTents.ts::PlacedTents` jest istniejącym persisted ownerem fizycznych namiotów. `place(...)` potrafi zachować przekazane `from.id`, ale zwykłe placement generuje timestamp ID i nie przechowuje ownership/home semantics.
- `SettlementEconomy` jest per-settlement registry-owned state i już przeżywa settlement streaming/rebuild.
- proceduralne `SettlementDef` nadal powstają z plan/cache/grid flow; nie istnieje obecnie persisted registry runtime-founded settlement definitions.

## Ownership decision

Founded settlement ma być drugim źródłem **definition**, ale nie drugim runtime systemem:

```text
procedural SettlementDef
        or
persisted FoundedSettlementRecord
        ↓
SettlementsManager
        ↓
normal Settlement / registries / simulation
```

`SettlementsManager` pozostaje właścicielem runtime lifecycle. Dodać najmniejszy manager-lifetime/persisted registry founded definitions, z którego manager potrafi resolve/load osadę niezależnie od proceduralnego grid cache.

## Founded settlement record

Wprowadzić mały plain-data record, semantycznie:

```ts
type FoundedSettlementRecord = {
  id: string
  siteId: string
  x: number
  z: number
  sponsorSettlementId: string
  residentNpcIds: string[]
  householdIds: string[]
  foundedAtDays: number
}
```

Finalne nazwy dostosować do conventions kodu. Nie serializować w nim economy, needs, inventories, tents ani infrastruktury — te mają własnych ownerów.

Settlement ID ma być deterministycznie wyprowadzony ze stable `siteId`/destination identity, np. namespaced `settlement:founded:<siteId>`, z kolizją traktowaną jako błąd kontraktu, nie powodem do losowania nowego ID.

## Bootstrap API

Dodać jedną reusable, idempotentną operację na ownership boundary `SettlementsManager`/settlement domain, konceptualnie:

```ts
bootstrapFoundedSettlement(input):
  | { status: 'created'; settlementId: string }
  | { status: 'existing'; settlementId: string }
  | { status: 'not_ready'; reason: ... }
```

Input powinien wskazywać:

- stable destination/site ID i pozycję,
- sponsor settlement ID,
- expedition assignment/member IDs,
- site infrastructure snapshot/query result lub resolver,
- `nowDays`.

Operacja nie może wybierać ekspedycji ani sterować travel. Warunkiem wejścia jest authoritative arrival wszystkich wymaganych członków wg finalnego `settlements-npcs-028` travel state.

## NPC residency and identity

Nie generować nowych NPC i nie zmieniać `NpcId`.

Current `NpcAuthoritativeState` nie posiada settlement residency. Dlatego ten plan dodaje najmniejszy persistent membership owner, najlepiej razem z founded-settlement registry, zamiast wciskać residency do health/needs/inventory state.

Wymagany resolver:

```text
NpcId → current settlement residency/membership
```

Proceduralni NPC mogą zachować istniejący implicit/default mapping, ale founded residents muszą mieć explicit override. `createSettlement(...)`/NPC construction path dla founded settlement musi reuse istniejący `NpcAuthoritativeState` przez registry `getOrCreate`, nigdy seedować nowej osoby.

## Households

V1 tworzy deterministyczne minimalne colony households dla przybyłych NPC zamiast próbować przenosić proceduralne family definitions.

Decyzja dla V1:

- jeden household na jednego expedition membera;
- stable ID wyprowadzony z founded settlement ID + `NpcId`;
- household registry pozostaje authoritative ownerem household stock/state;
- membership jest zapisane w founded settlement record/associated membership map;
- późniejsze family formation/migration jest poza zakresem.

To usuwa niejednoznaczność starego draftu i pozwala bezpiecznie zastąpić tents normalnymi homes w przyszłości bez zmiany NPC identity.

## Tents as provisional homes

Reuse `PlacedTents`.

Bootstrap dla każdego founding household:

1. sprawdza, czy stable colony tent już istnieje;
2. jeśli nie — konsumuje dokładnie jeden realny `tent` z `NpcAuthoritativeState.personalInventory`;
3. wywołuje `PlacedTents.place(...)` z deterministycznym `from.id` i zachowaną condition z item instance, jeśli current inventory API to umożliwia;
4. zapisuje household → shelter anchor jako referencję do `PlacedTent.id` w minimalnym home-assignment state;
5. repeated bootstrap nie konsumuje kolejnego itemu ani nie tworzy drugiego tent.

Nie rozszerzać `PlacedTent` o pełne household state. Fizyczny world object pozostaje ownerem geometrii/condition; settlement/home assignment trzyma tylko referencję.

## Site infrastructure

Używać `WorldBundle.querySiteInfrastructure({ x, z, radius })` / `src/world/siteInfrastructure.ts` jako read-only authoritative query.

Dla gold-colony consumera readiness policy wymaga co najmniej:

- `>= 2` completed terrain preparations o `size >= 6`,
- `>= 1` usable Player well,
- `>= 1` cultivation area.

Sam generic bootstrap API nie powinien hard-code'ować tych liczb. Przyjmuje już zwalidowany site albo policy callback; mine quest/consumer definiuje wymagania.

## Settlement runtime integration

Founded settlement musi udostępnić minimalny odpowiednik danych wymaganych przez `createSettlement(...)` bez kopiowania proceduralnego `VillagePlan` generatora.

Implementacja ma zrobić focused extraction/adapter tylko dla pól rzeczywiście wymaganych przez runtime. Nie tworzyć fikcyjnego proceduralnego planu z losowymi rodzinami/budynkami.

Jeżeli `createSettlement(...)` wymaga dziś zbyt szerokiego `SettlementDef`, wydzielić najmniejszy wspólny runtime input (`SettlementRuntimeDef` lub równoważny) używany przez proceduralny adapter i founded adapter.

To jest preferowany refactor; nie dodawać warunków `if (isColony)` przez cały settlement runtime.

## Water, farming and work anchors

Founded runtime ma wskazywać istniejącą infrastrukturę site:

- well/water resolver na realny Player well,
- cultivation anchor na realny Player garden/cultivation area,
- mine/resource work pozostaje przez normalne resource hooks.

Nie kopiować well/garden do settlement-owned records.

## Economy

`EconomyRegistry.getOrCreate(foundedSettlementId, ...)` pozostaje jedynym ownerem economy. Initial stock może być pusty/minimalny; equipment pozostaje u NPC.

Bootstrap inicjalizuje economy dokładnie raz poprzez istniejący registry contract. Dalsze miner work ma trafiać do zwykłego `SettlementEconomy`.

Source-aware gold accounting należy do `settlements-004`, nie tutaj.

## Persistence

Dodać do aktualnego `SaveData`/migration pipeline tylko founded-settlement state, którego nie da się odtworzyć:

- founded records,
- explicit resident membership overrides,
- household/home-anchor references, jeśli nie są częścią founded record.

Existing owners nadal persistują:

- `npcStates`,
- `settlementEconomies`,
- households,
- `placedTents`,
- expedition assignments/travel.

Save/load i `WorldBundle` rebuild muszą carry-forward founded registry tak samo jak pozostałe manager-lifetime registries.

## Idempotency

Stable keys są podstawowym zabezpieczeniem:

- settlement: by `siteId`,
- household: by `settlementId + npcId`,
- tent: by `settlementId + npcId`,
- membership: by `npcId`.

Nie opierać correctness na jednym `bootstrapComplete` boolean.

Repeated call ma odtworzyć/zweryfikować brakujące bezpieczne derived bindings, ale nigdy ponownie nie wykonać irreversible consumption.

## Off-screen continuity

Nie dodawać colony-specific off-screen loop.

Founded settlement ma wejść do tych samych registries i generic travel/work/economy ownershipów. Jeżeli konkretna profession nadal wymaga live `Settlement`, jej off-screen rozszerzenie jest osobnym shared-system problemem; bootstrap nie może go zasymulować questowym timerem.

## Scope

In scope:

- founded settlement persistent registry/record;
- founded settlement adapter do zwykłego `SettlementsManager` lifecycle;
- explicit residency override dla istniejących NPC;
- deterministic one-person founding households;
- deterministic real tent placement + home anchor;
- sponsor provenance;
- persistence/rebuild/idempotency;
- normal economy registry initialization;
- read-only integration z `querySiteInfrastructure`.

## Non-goals

- player-facing generic settlement founding UI;
- migration/family relocation system;
- procedural colony population generation;
- politics/taxes/profit share;
- quest dialogue/stages;
- expedition formation/provisioning/travel;
- permanent houses/upgrades;
- population growth;
- colony-specific mining/off-screen simulation.

## Verification

Automated tests:

- deterministic settlement/household/tent IDs;
- bootstrap twice → one founded record, households and tents;
- existing `NpcId` and `NpcAuthoritativeState` object/state survive membership change;
- tent item consumed once;
- save/load + WorldBundle rebuild preserves founded record, residency, home anchors and sponsor;
- stream-out/in resolves same economy and NPC state;
- missing arrival or invalid site returns `not_ready` without mutation;
- procedural settlements remain unchanged;
- normal miner/economy path can resolve founded settlement economy.

Run focused tests, typecheck and build. Player performs browser/gameplay verification; AI does not run browser verification.

Before implementation create/update focused implementation notes from current code. Add JSDoc with `@domain settlements` for new public founded-settlement lifecycle contracts.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

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
**Model:** Opus, Sonnet

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
- `NpcAuthoritativeState` posiada persistent `personalInventory` oraz generic `travel`; expedition travel zachowuje identity i stan NPC poza live `NpcAgent`.
- `SettlementsManager.dispatchReadyExpedition(...)` jest publicznym seam dla `settlements-npcs-028`.
- `ExpeditionAssignment` kończy lifecycle na `ready`; authoritative arrival jest w `NpcAuthoritativeState.travel` jako expedition purpose + `arrival: 'reached'`, z `blocked` jako cannot-progress state.
- `src/app/worldBundle.ts` wystawia expedition assignment/provisioning oraz `querySiteInfrastructure(site)` z `world-019`.
- `src/world/siteInfrastructure.ts` zwraca authoritative `completedTerrainPreparations`, usable Player wells i live cultivation areas; bootstrap ma je czytać, nie kopiować.
- `src/items/createPlacedTents.ts::PlacedTents` jest istniejącym persisted ownerem fizycznych namiotów. `place(...)` potrafi zachować przekazane `from.id` i condition.
- `SettlementEconomy` jest per-settlement registry-owned state i już przeżywa settlement streaming/rebuild.
- proceduralne `SettlementDef` nadal powstają z plan/cache/grid flow; nie istnieje persisted registry runtime-founded settlement definitions.
- `createSettlement(...)` nadal jest mocno związane z `SettlementDef`: householdy powstają z `def.families` przez `householdIdFor(def.id, familyIndex)`, a NPC ids przez `settlementNpcId(def.id, flatMemberIndex)`.
- `SettlementsManager` odkrywa/streamuje osady z proceduralnych grid cells; founded settlement bez grid cell wymaga osobnej manager-owned ścieżki load/unload.

Szczegółowy verified recon i implementacyjny podział są w:

`docs/plans/implementation-notes/settlements-003-colony-bootstrap-implementation-notes.md`.

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
  foundedAtDays: number
}
```

Household/tent IDs mają być deterministyczne z `settlementId + npcId`; nie duplikować ich w recordzie, jeśli implementacja może je bezpiecznie odtworzyć. Home-anchor binding persistować tylko wtedy, gdy nie jest derivable ze stable IDs.

Nie serializować economy, needs, inventories, tents ani infrastruktury — te mają własnych ownerów.

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
- zwalidowany site-readiness result albo policy callback,
- `nowDays`.

Operacja nie może wybierać ekspedycji ani sterować travel.

Dla każdego founding NPC wymagane jest authoritative:

- istniejący i żywy `NpcAuthoritativeState`,
- `travel.purpose.kind === 'expedition'` z właściwym `assignmentId`,
- `travel.arrival === 'reached'`,
- brak `travel.blocked`.

Nie rozszerzać `ExpeditionAssignmentState` o colony-specific `arrived`/`founded`.

## NPC residency and identity

Nie generować nowych NPC i nie zmieniać `NpcId`.

`NpcAuthoritativeState` nie posiada settlement residency. Dodać najmniejszy persistent membership owner:

```text
NpcId → current settlement residency override
```

Proceduralni NPC bez override zachowują existing source-settlement interpretation; founded residents dostają explicit override.

Current `createSettlement(...)` nie potrafi przyjąć istniejących NPC identities, bo sam wyprowadza je z `def.families`. Dlatego przed founded materialization trzeba wydzielić najmniejszy shared resident/runtime seam przyjmujący explicit `NpcId` + household/home binding.

Dla V1 founders pochodzą z jednego `sponsorSettlementId`. Ich name/role/family member data należy deterministycznie re-resolve z proceduralnego sponsor `SettlementDef` + existing `NpcId`; nie persistować zduplikowanych traitów/nazw/ról w founded recordzie.

## Households

V1 tworzy deterministyczne minimalne colony households dla przybyłych NPC zamiast próbować przenosić proceduralne family definitions.

Decyzja dla V1:

- jeden household na jednego expedition membera;
- stable ID wyprowadzony z founded settlement ID + `NpcId`;
- household registry pozostaje authoritative ownerem household stock/state;
- residency mapping łączy NPC z founded settlement;
- późniejsze family formation/migration jest poza zakresem.

`Household.homeId` jest dziś `Place.id`. Nie wkładać tam niejawnie surowego `PlacedTent.id` bez świadomego rozszerzenia contractu. Preferować minimalny founded-home `Place`/anchor adapter wskazujący realny tent.

Nowy colony household nie może przypadkiem dostać zwykłych losowych starting food/water/wood, jeśli expedition provisioning miało być źródłem zaopatrzenia. Wprowadzić explicit colony initialization semantics zamiast polegać na normalnym first-family seeding.

## Tents as provisional homes

Reuse `PlacedTents`.

Bootstrap dla każdego founding household:

1. sprawdza, czy stable colony tent już istnieje;
2. jeśli nie — preflightuje realny `tent` instance w `NpcAuthoritativeState.personalInventory`;
3. po przejściu wszystkich fallible preconditions usuwa dokładnie jeden instance;
4. wywołuje `PlacedTents.place(...)` z deterministycznym `from.id` i zachowaną condition;
5. tworzy/odtwarza household → home anchor binding;
6. repeated bootstrap nie konsumuje kolejnego itemu ani nie tworzy drugiego tent.

Nie rozszerzać `PlacedTent` o household state. Fizyczny world object pozostaje ownerem geometrii/condition; settlement/home assignment trzyma tylko referencję.

## Site infrastructure

Używać `WorldBundle.querySiteInfrastructure({ x, z, radius })` / `src/world/siteInfrastructure.ts` jako read-only authoritative query.

Dla gold-colony consumera readiness policy wymaga co najmniej:

- `>= 2` completed terrain preparations o `size >= 6`,
- `>= 1` usable Player well,
- `>= 1` cultivation area.

Sam generic bootstrap API nie hard-code'uje tych liczb. Mine quest/consumer definiuje wymagania i przekazuje validated readiness.

## Settlement runtime integration

Nie tworzyć syntetycznego `SettlementDef`, `VillagePlan` ani fałszywych rodzin tylko po to, żeby przejść przez obecny `createSettlement(...)`.

Wydzielić najmniejszy wspólny runtime seam używany przez:

```text
procedural SettlementDef
→ procedural props/layout adapter
→ resident descriptors
                      \
                       → shared live settlement/NPC runtime
                      /
FoundedSettlementRecord
→ real site/tent/infrastructure anchors
→ existing-Npc resident descriptors
```

Finalne nazwy typów dopasować do conventions kodu (`SettlementRuntimeSpec`, `SettlementResidentSpec` lub równoważne). Ekstrakcja ma objąć tylko pola rzeczywiście wspólne; proceduralny path po refactorze musi pozostać behavior-identical.

Nie dodawać `if (isColony)` przez cały settlement runtime.

## Streaming

Founded records nie należą do `settlementPlanCache` i nie mają fikcyjnych grid coordinates.

`SettlementsManager` ma sprawdzać je osobno po world-space center:

- within `loadRadius` → materialize przez ten sam manager lifecycle,
- beyond `unloadRadius` → dispose live `Settlement`, zachowując founded/registry state,
- home settlement special-case pozostaje proceduralną cell `(0,0)`.

Przewidywana liczba founded settlements jest mała; bounded linear scan jest wystarczający w V1. Nie dodawać spatial index bez realnej potrzeby.

## Water, farming and work anchors

Founded runtime ma wskazywać istniejącą infrastrukturę site:

- well/water resolver na realny Player well,
- cultivation anchor na realny Player garden/cultivation area,
- mine/resource work przez normalne resource hooks.

Nie kopiować well/garden do settlement-owned records.

## Economy

`EconomyRegistry.getOrCreate(foundedSettlementId, ...)` pozostaje jedynym ownerem economy.

Initial stock ma być pusty/minimalny i nie może duplikować expedition equipment/provisions. Bootstrap inicjalizuje economy dokładnie raz poprzez istniejący registry contract. Dalsze miner work ma trafiać do zwykłego `SettlementEconomy`.

Source-aware gold accounting należy do `settlements-004`, nie tutaj.

## Persistence

Dodać do aktualnego `SaveData` tylko founded-settlement state, którego nie da się odtworzyć:

- founded records,
- explicit resident residency overrides,
- home-anchor references tylko jeśli nie są derivable.

Existing owners nadal persistują:

- `npcStates` wraz z travel/personalInventory,
- `settlementEconomies`,
- households,
- `placedTents`,
- expedition assignments.

`src/app/saveState.ts`, fresh load i `rebuildWorldBundle()` mają przenosić founded registry analogicznie do pozostałych manager-lifetime registries. Starszy save bez pola founded state → empty registry.

## Idempotency / transaction boundary

Stable keys są podstawowym zabezpieczeniem:

- settlement: by `siteId`,
- household: by `settlementId + npcId`,
- tent: by `settlementId + npcId`,
- membership: by `npcId`.

Nie opierać correctness na jednym `bootstrapComplete` boolean.

Przed pierwszą irreversible mutacją preflightować:

- assignment/member travel arrival,
- site readiness,
- wszystkie required NPC states,
- wszystkie required tent instances,
- stable-id conflicts.

Dopiero potem commitować founded record/residency/households/tent consumption/economy. Repeated call ma zweryfikować/odtworzyć safe derived bindings, ale nigdy ponownie nie konsumować itemów.

## Off-screen continuity

Nie dodawać colony-specific off-screen loop.

Founded settlement ma wejść do tych samych registries i generic travel/work/economy ownershipów. Jeżeli konkretna profession nadal wymaga live `Settlement`, jej off-screen rozszerzenie jest osobnym shared-system problemem; bootstrap nie może go zasymulować questowym timerem.

## Proposed implementation stages

### Stage 1 — founded state + persistence foundation

- founded registry;
- deterministic ids;
- residency override resolver;
- snapshot/save/load/rebuild plumbing;
- pure idempotency/validation tests;
- bez live colony materialization.

### Stage 2 — resident materialization refactor

- wydzielić minimalny shared resident/runtime seam z `createSettlement()`;
- procedural adapter bez behavior changes;
- explicit existing `NpcId`, household id i home anchor;
- sponsor-def resident resolver.

### Stage 3 — bootstrap transaction

- arrival readiness;
- colony household initialization bez free supplies;
- real tent instance consumption + stable physical tents;
- home bindings;
- existing economy registry initialization;
- repeated/failure-without-mutation tests.

### Stage 4 — founded streaming/runtime

- manager load/unload founded records po world position;
- founded runtime adapter wskazuje real tents/well/cultivation anchors;
- stream-out/in i save/load zachowują identities/state.

### Stage 5 — gold-colony consumer

Może zostać w `quests-progression-010`:

- consumer robi `querySiteInfrastructure()`;
- aplikuje mine-specific readiness policy;
- woła generic bootstrap;
- obserwuje `created | existing | not_ready` bez ownershipu settlement state.

## Scope

In scope:

- founded settlement persistent registry/record;
- founded settlement adapter do zwykłego `SettlementsManager` lifecycle;
- explicit residency override dla istniejących NPC;
- shared resident materialization seam wymagany do reuse istniejących `NpcId`;
- deterministic one-person founding households;
- deterministic real tent placement + home anchor;
- sponsor provenance;
- persistence/rebuild/idempotency;
- normal economy registry initialization;
- read-only integration z `querySiteInfrastructure`;
- founded world-space streaming.

## Non-goals

- player-facing generic settlement founding UI;
- migration/family relocation system;
- procedural colony population generation;
- politics/taxes/profit share;
- quest dialogue/stages;
- expedition formation/provisioning/travel;
- permanent houses/upgrades;
- population growth;
- colony-specific mining/off-screen simulation;
- procedural roads/signposts/cemetery generation dla colony.

## Verification

Automated tests:

- deterministic settlement/household/tent IDs;
- missing/dead/blocked/not-arrived member → `not_ready` bez mutacji;
- invalid site → `not_ready` bez mutacji;
- bootstrap twice → one founded record, residency bindings, households, tents and economy;
- tent item instance/condition preserved and consumed once;
- existing `NpcId` and registry-owned `NpcAuthoritativeState` survive residency change;
- procedural settlement ids/households/NPC identities remain unchanged after refactor;
- save/load + `WorldBundle` rebuild preserves founded record, residency and home anchors;
- founded settlement loads by world distance despite no procedural grid cell;
- stream-out/in resolves same economy, NPC and household state;
- founded runtime resolves real well/cultivation/tent anchors, not cloned infrastructure;
- normal miner/economy path can resolve founded settlement economy.

Run focused tests, typecheck and build. Player performs browser/gameplay verification; AI does not run browser verification.

Add JSDoc with `@domain settlements` for new public founded-settlement lifecycle/residency contracts and any new shared runtime seam that should be discoverable by preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

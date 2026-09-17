# Plan: Authored Outpost Occupants & Construction Lifecycle

**Created:** 2026-09-17
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** world-031
**Domain:** `settlements-npcs`
**Type:** `feature`
**Subdomains:** `household` `schedules` `social`
**Tags:** `outpost` `construction` `npc-identity` `authored-place`
**Roadmap:** `quests-professions-and-world-consequences.md`
**Model:** Opus, Sonnet

## Cel

Zbudować fundament, dzięki któremu authored consequence może utworzyć mały, trwały posterunek będący zwykłym elementem świata:

```text
cleared authored site
→ world-031 activates persistent consequence
→ authored construction targets materialize
→ real NPC workers contribute real work
→ required structures complete
→ site becomes active
→ dedicated stable NPCs live/work there
→ normal streaming/persistence keeps it alive without the player
```

Posterunek nie jest quest propem, grupą tymczasowych NPC ani osobnym simulation tier. Po aktywacji korzysta z normalnych settlement/NPC/household/work/threat/persistence mechanizmów.

## Decyzja architektoniczna

### Authored outpost = settlement-domain authored site, nie proceduralny `OUTPOST`

Obecny kod ma `VillageSize = 'OUTPOST'` dla generowanych resource outposts. Ten typ pozostaje częścią proceduralnego `SettlementDef` / `VillagePlan` worldgenu i **nie** będzie reprezentacją questa tworzącego nowy posterunek w runtime.

Authored outpost V1 będzie małym, nieproceduralnym settlement-domain site:

- posiada własne stable authored identity;
- jest owned przez `SettlementsManager` albo przez wspólny founded/authored settlement-site registry, jeżeli `settlements-003` wprowadzi go wcześniej;
- uczestniczy w normalnym settlement streaming lifecycle;
- materializuje live NPC przez ten sam runtime seam co zwykłe settlements;
- nie jest wpisywany do `settlementPlanCache`;
- nie wymaga synthetic `VillagePlan`/`SettlementDef`;
- nie dostaje osobnego `OutpostManager`.

`settlement/places.ts::Place` pozostaje routing targetem dla home/work/social, nie ownerem całego site.

## Relacja z `world-031`

`world-031` jest jedynym ownerem persistent activation fact:

```text
AuthoredWorldConsequenceId -> active?
```

Ten plan nie kopiuje consequence registry ani quest outcome.

Handoff:

```text
world-031
  consequence active
      ↓ read-only
settlements-npcs-044
  resolve authored site definition
  ensure authored site record
  ensure physical construction targets
  run normal construction / streaming / occupants
```

Activation może nastąpić przy unloaded regionie. Nie force-loadować site. Materialization odbywa się przy normalnym relevant stream/build lifecycle.

## Stable identity

Static authored outpost definition posiada semantic id i consequence id.

Stable site id i child ids muszą wynikać deterministycznie z authored definition, np.:

```text
outpost:forest-road-01
outpost:forest-road-01:palisade:north-01
outpost:forest-road-01:torch:gate
outpost:forest-road-01:well:main
outpost:forest-road-01:shelter:main
outpost:forest-road-01:family:guards
outpost:forest-road-01:npc:guard-01
```

Nie używać:

- `Date.now()`;
- runtime counters;
- stream order;
- mesh/index identity;
- display name;
- quest stage index.

Concrete structure owner przechowuje własny stable target id i własny mutable state.

## Authored site state

Dodać najmniejszy settlement-domain record dla istniejącego authored site. Record przechowuje tylko dane niederywowalne potrzebne po save/load, np.:

- stable site id;
- authored definition id;
- consequence id;
- stable world center / authored placement binding;
- occupant/residency bindings, jeżeli nie są w pełni derivable;
- ewentualny exactly-once activation marker tylko jeśli implementacja rzeczywiście go potrzebuje.

Nie przechowywać tu:

- well work progress;
- palisade work progress;
- torch work progress;
- residential building work progress;
- terrain-preparation progress;
- structure repair state;
- NPC health/needs/inventory;
- household resources;
- quest stage.

## Construction-site materialization

Po aktywacji consequence materializer odczytuje authored outpost definition i idempotentnie zapewnia realne domain records.

Każdy physical element pozostaje w swoim obecnym ownerze:

```text
well                 -> PlayerWells / PlayerWellRecord
palisade segment     -> Palisades / PalisadeSegmentRecord
standing torch       -> StandingTorches / StandingTorchRecord
residential shelter  -> ResidentialBuildings / ResidentialBuildingRecord
terrain preparation  -> TerrainPreparations / TerrainPreparationRecord
```

Jeżeli creator danego istniejącego systemu nie pozwala jeszcze utworzyć authored targetu z zewnętrznym stable id/transformem, rozszerzyć tylko ten creator o najmniejszy potrzebny seam. Nie tworzyć authored kopii record type.

Ponowne stream-in/save-load/rebuild musi odnajdywać istniejący record po stable id i nigdy nie resetować progressu.

## Completion resolver

Nie dodawać aggregate `workProgress` dla outpostu.

Static authored definition określa listę required target refs. Resolver czyta stan realnych ownerów i wylicza:

```text
required target A complete
AND required target B complete
AND ...
= outpost construction complete
```

Preferowane V1:

```text
active = completion(required real targets)
```

Jeżeli dokładnie jeden transition side effect musi być persisted exactly once, można przechować mały site-domain `construction | active` marker, ale tylko jako lifecycle fact. Target-specific progress/stage/repair nigdy nie może być kopiowany do outpost recordu.

## V1 physical composition

Najmniejszy sensowny authored outpost:

- 1 istniejący `residential_building` jako shelter/home;
- 2-4 krótkie segmenty palisady;
- 1 standing torch, ewentualnie 2 gdy wynika to z layoutu;
- opcjonalny well, jeśli lokalna woda jest rzeczywiście potrzebna;
- optional terrain preparation tylko jako supporting footprint work.

Nie dodawać nowego authored shelter type. Najpierw wykorzystać `ResidentialBuildingRecord` i jego istniejący actor-neutral work lifecycle.

Nie uzależniać V1 od dekoracyjnego campfire bez realnego construction ownera. Standing torch daje istniejący completion/work contract.

## Existing construction seams do reuse

Potwierdzone measurable Work Contract targets w `src/world/workContract.ts`:

```text
construction
terrain_preparation
palisade
standing_torch
residential_building
```

Istniejące authority/remaining-work seams:

- `src/world/playerWell.ts::wellRemainingWork` + well completion predicates;
- `src/world/palisade.ts::palisadeRemainingWork` + `isPalisadeConstructionComplete`;
- `src/world/standingTorch.ts::standingTorchRemainingWork` + completion predicate;
- `src/terrain/terrainPreparation.ts::terrainPreparationRemainingWork` + persisted completion;
- `src/world/residentialBuilding.ts` / `createResidentialBuildings.ts` actor-neutral contribution/completion;
- `src/world/createPlayerWells.ts`;
- `src/world/createPalisades.ts`;
- `src/world/createStandingTorches.ts`;
- `src/world/createResidentialBuildings.ts`;
- `src/world/createTerrainPreparations.ts`.

`src/app/actions/workContractActions.ts` pokazuje target lookup/remaining-work po stronie player action. `src/ai/NpcAgent.ts` wykonuje target-specific NPC contribution dla Work Contracts.

Wydzielić wspólny target resolver/executor tylko jeśli jest potrzebny do reuse; nie kopiować dużego target switcha do authored-outpost code.

## NPC construction

Work Contracts pozostają player-issued job systemem i nie powinny być wymaganym schedulerem budowy posterunku.

Posterunek ma móc powstać bez aktywnego gracza:

```text
normal source-settlement worker
→ authored construction assignment to concrete target ref
→ normal travel/work session
→ existing actor-neutral contributeWork/addWork seam
→ target owner accepts useful work
```

Dodać najmniejszy authored construction assignment/task seam używany przez normalnego `NpcAgent`, bazujący na tych samych concrete target refs co Work Contracts.

Player może równolegle utworzyć Work Contract dla tego samego unfinished targetu, o ile istniejące one-active-contract rules na to pozwalają. Oba źródła pracy modyfikują ten sam target record.

Nie dodawać quest-owned worker FSM ani outpost-specific work loop.

## Kto buduje

V1 preferuje 1-2 tymczasowych budowniczych z istniejącej pobliskiej osady.

- zachowują obecne `NpcId`, household i settlement residency;
- otrzymują tylko temporary authored construction assignment;
- po ukończeniu assignment kończy się;
- wracają do normalnego schedule/work swojego settlementu.

Dedicated future occupants nie muszą materializować się przed ukończeniem shelteru.

Nie implementować tutaj global settlement expansion AI ani automatycznego recruitingu.

## Dedicated occupants

Po ukończeniu required structures materializować jeden mały authored household z 1-2 dorosłymi NPC.

Stable occupant identity jest authored, nie zależy od runtime flatten order.

Existing precedent:

- `lostTreasureChroniclesElderResident.ts`;
- archaeologist/specialist authored residents;
- `appendAuthoredResidentFamily()`;
- `npcIdentity.ts`.

Reuse z tego precedentu:

- deterministic profile/identity conventions;
- authored family/member definitions;
- normal `NpcAgent` + `NpcStateRegistry` lifecycle.

Nie reuse'ować generation-time `SettlementDef.families` mutation dla runtime consequence. To działa dla eldera, bo injection zachodzi przed `VillagePlan`/staffing; authored outpost aktywuje się już w runtime/save lifecycle.

Live settlement runtime musi więc przyjąć explicit resident descriptors z explicit `NpcId`.

## Household i residency

`NpcStateRegistry` pozostaje authoritative ownerem mutable NPC state.

`HouseholdRegistry` pozostaje ownerem household resources/home binding.

Authored outpost occupants dostają:

- stable authored household id;
- stable authored `NpcId`;
- site settlement membership/residency;
- home `Place` wskazujący ukończony residential shelter;
- explicit workplace `Place`/duty anchor;
- normal schedule;
- normal role;
- normal authoritative NPC state.

Jeżeli wspólny residency-override/shared resident seam powstanie wcześniej w `settlements-003`, użyć go bez tworzenia drugiego registry.

## Home / workplace / schedule

`settlement/places.ts::Place` jest właściwym runtime routing primitive.

Standardowy `workplaceFor()` zakłada pełne `SettlementLandmarks`; np. Guard obecnie używa well jako generic workplace anchor. Authored site nie powinien fabrykować kompletu settlement landmarks tylko po to, aby wywołać tę funkcję.

Authored resident runtime spec powinien móc podać explicit:

```text
home Place
workplace Place | null
social Place | null
settlement/site id
household id
role
schedule inputs
```

Guard workplace/patrol anchor powinien pochodzić ze stable authored site definition/completed infrastructure.

Jeżeli Guard patrol jest obecnie związany z procedural settlement boundary/landmarks, wydzielić minimalny generic guard-duty anchor/area input i użyć go po obu stronach. Nie tworzyć `OutpostGuardAgent`.

## Threat response / combat

Dedicated occupants muszą być normalnymi live NPC w normalnym loaded-settlement update path:

```text
SettlementsManager.update
→ Settlement.update
→ NpcAgent.update
→ needs / schedule / threats / combat / work
```

Dzięki temu istniejący settlement threat response i nearby-animal threat inputs pozostają wspólne.

Nie implementować outpost-specific threat scan/response loop.

## Persistence

State pozostaje rozdzielony zgodnie z ownership:

```text
world-031 registry       -> consequence active
Authored site registry   -> stable site + non-derivable membership/lifecycle binding
NpcStateRegistry         -> health/needs/inventory/travel/activePlan/etc.
HouseholdRegistry        -> household state
world target registries  -> construction/condition state
EconomyRegistry          -> optional/minimal settlement stock
WorkContracts            -> tylko istniejące player-issued contracts
```

Nowy authored-site record musi przejść istniejący:

```text
SaveData
→ createWorldBundle(initial state)
→ SettlementsManager lifetime owner
→ buildSaveData snapshot
→ WorldBundle rebuild carry
```

Nie używać worldgen cache jako persistence.

## Streaming

`SettlementsManager` obecnie odkrywa procedural settlements przez grid + `settlementDefFor()`. Authored site wymaga manager-owned dodatkowej listy/registry z world center.

Przy update:

- site w `loadRadius` -> materializuje się przez ten sam shared settlement runtime lifecycle;
- site poza `unloadRadius` -> live `Settlement`/agents są disposed;
- registries, site record i world target state pozostają;
- ponowny load odtwarza te same identities.

Expected authored-site count jest mały, więc V1 może użyć bounded linear scan. Bez osobnego streamera i bez spatial index.

## Economy / storage

V1 nie potrzebuje pełnej outpost economy.

Jeżeli shared settlement runtime wymaga `EconomyRegistry` entry, użyć istniejącego registry z minimalnym/empty stock. Household istnieje normalnie.

Nie dodawać:

- osobnego outpost storage;
- wages/upkeep;
- garrison inventory framework;
- dynamic recruitment;
- production chain tylko dla outpostu.

## Technical/debug inspection

Rozszerzyć istniejący world/NPC inspection/debug surface o plain-data authored-site snapshot zawierający minimum:

- site id;
- consequence id + active fact;
- loaded/unloaded;
- materialized target refs;
- per-target complete/incomplete;
- derived aggregate construction completion;
- resident `NpcId`s;
- household id;
- source-settlement worker assignments, jeśli aktywne.

Debug tooling nie może być drugim ownerem ani mutować progressu poza istniejącymi domain APIs.

## Konkretne pliki / typy do reuse

### Identity / authored NPC

- `src/settlement/npcIdentity.ts`
  - `NpcId` consumer conventions;
  - `settlementNpcId()` only for procedural flattened residents;
  - `flattenedSettlementMembers()` / descriptors.
- `src/settlement/lostTreasureChroniclesElderResident.ts`
  - `appendAuthoredResidentFamily()` precedent;
  - deterministic authored household profile.
- archaeologist/specialist authored resident modules for stable authored identity/profile conventions.
- `src/settlement/npcState.ts`
  - `NpcStateRegistry` authoritative state.

### Settlement / household / streaming

- `src/settlement/SettlementsManager.ts`
  - long-lived registries;
  - `Entry`/load/unload ownership;
  - `getNpcState`, `getHousehold`, snapshots;
  - normal settlement ticking.
- `src/settlement/createSettlement.ts`
  - live resident/household/NpcAgent construction to refactor behind a narrow shared runtime seam.
- `src/settlement/household.ts`
- `src/settlement/places.ts`
- `docs/plans/implementation-notes/settlements-003-colony-bootstrap-implementation-notes.md`
  - reuse the same nonprocedural settlement/resident runtime seam if implemented first.

### Construction

- `src/world/workContract.ts`
- `src/world/createWorkContracts.ts`
- `src/app/actions/workContractActions.ts`
- `src/ai/NpcAgent.ts`
- `src/world/playerWell.ts`
- `src/world/createPlayerWells.ts`
- `src/world/palisade.ts`
- `src/world/createPalisades.ts`
- `src/world/standingTorch.ts`
- `src/world/createStandingTorches.ts`
- `src/world/residentialBuilding.ts`
- `src/world/createResidentialBuildings.ts`
- `src/terrain/terrainPreparation.ts`
- `src/world/createTerrainPreparations.ts`

### Persistence/composition

- `src/app/worldBundle.ts`
- `src/app/saveState.ts`
- `src/persistence/saveData.ts`
- `world-031` consequence registry/public read seam after dependency implementation.

## Implementation stages

### Stage 1 — authored site definition + persisted identity

- static authored outpost definition contract;
- stable site/child/household/NPC ids;
- manager-owned authored site record;
- world-031 `isActive()` integration;
- save/rebuild plumbing for only non-derivable site bindings;
- no NPC/visual materialization yet.

### Stage 2 — shared nonprocedural resident runtime seam

- reuse `settlements-003` seam if available;
- otherwise extract smallest procedural-independent resident runtime inputs from `createSettlement()`;
- support explicit `NpcId`, household id, home/work Places and role/schedule inputs;
- procedural settlement behavior/ids remain unchanged.

### Stage 3 — stable real construction targets

- materialize authored well/palisade/torch/residential/terrain records idempotently;
- target creators accept stable authored records where needed;
- no copied state.

### Stage 4 — completion resolver

- authored definition lists required target refs;
- resolver reads real target owners;
- derive `construction complete` / `active` unless exactly-once persisted phase is necessary.

### Stage 5 — NPC worker participation

- temporary source-settlement worker assignment;
- shared actor-neutral target resolver/executor;
- normal travel/work sessions;
- useful work credited only when concrete owner accepts it;
- return to ordinary source schedule after completion.

### Stage 6 — dedicated occupants

- create/reuse one authored household;
- materialize 1-2 explicit stable residents;
- assign shelter home Place;
- assign site-local workplace/duty Place;
- ordinary schedule/needs/combat/threat response.

### Stage 7 — streaming + inspection + persistence verification

- authored site checked by normal manager update distance lifecycle;
- unload/reload same identities/state;
- save/load/rebuild same site/targets/NPCs;
- plain-data debug inspection.

## Tests

Dodać focused automated coverage:

1. inactive consequence -> no site / targets / occupants;
2. activation -> exactly one authored site;
3. stable child target ids across repeated materialization;
4. repeated load/rebuild -> no duplicate target records;
5. completion resolver reads actual well/palisade/torch/residential state;
6. target progress is never copied into authored-site record;
7. NPC builder contributes through same target API as player/Work Contract path;
8. construction can progress without player-issued Work Contract;
9. temporary builders retain source residency and resume ordinary schedule;
10. dedicated occupant `NpcId`s remain identical across stream-out/in;
11. household is created once;
12. occupant live runtime uses ordinary `NpcAgent` needs/schedule/work/combat/threat behavior;
13. save/load preserves target progress, household and NPC authoritative state;
14. `WorldBundle` rebuild preserves authored site and stable identities;
15. generated procedural `VillageSize.OUTPOST` settlements remain behavior-identical;
16. `settlementPlanCache` remains deterministic and untouched by save/runtime authored-site state.

Player wykonuje browser/manual verification. AI agent nie wykonuje browser verification.

## Validation use case

Plan jest poprawny tylko jeśli bez quest-specific hacks przechodzi:

```text
1. player clears wolf den
2. world-031 activates authored consequence
3. construction site materializes
4. player/NPC contribute to real targets
5. required structures complete
6. completion resolver marks site active / resolves active state
7. stable authored household + NPCs live/work there
8. save/load
9. region unloads
10. region loads again
11. same site ids, same target state, same household, same NpcIds
```

## Non-goals

Nie implementować tutaj:

- Builder quest „Nowy posterunek”;
- wolf-den quest content;
- procedural outpost generation;
- global settlement expansion AI;
- generic colony system;
- caravans / merchant stops;
- dynamic recruitment UI;
- player-managed garrison;
- wages/upkeep;
- fortification upgrade tree;
- full outpost economy;
- new authored shelter domain;
- `OutpostManager` / `OutpostNpcRegistry` / dedicated outpost streamer;
- quest-owned construction progress or NPC lifecycle.

## Guardrails

- Current code remains source of truth; adapt if dependency implementation changes the seam.
- Reuse `settlements-003` founded/authored settlement runtime contracts if they exist at implementation time.
- Physical target owner remains authoritative for construction/repair state.
- `NpcStateRegistry` remains authoritative for mutable NPC state.
- `HouseholdRegistry` remains authoritative for household state.
- world-031 remains authoritative only for consequence activation.
- Runtime object presence is never an idempotency guard.
- World must continue functioning without player/camera.
- No duplicate state, no parallel manager, no synthetic procedural worldgen object.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z `@domain settlements-npcs` tam, gdzie pomaga preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

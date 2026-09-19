# Plan: Abandoned gold mine → mining colony integration

**Created:** 2026-09-07
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~world-terrain-017~~, ~~world-018~~, ~~world-019~~, ~~settlements-npcs-026~~, ~~settlements-npcs-027~~, ~~settlements-npcs-028~~, settlements-003, ~~settlements-004~~, ~~quests-progression-002~~
**Domain:** `quests-progression`  
**Type:** `feature`  
**Roadmap:** `quests-abandoned-gold-mine-colony`
**Model:** Opus, Sonnet

## Goal

Zintegrować istniejące systemy Seedvale w jeden authored questline:

```text
existing abandoned mountain mine
→ information or independent discovery
→ real gold confirmation
→ sponsor report
→ real site infrastructure
→ buyout or 20% share choice
→ real NPC expedition
→ real travel / arrival
→ real colony bootstrap
→ quest completion
→ ordinary autonomous simulation continues
```

Plan jest wyłącznie warstwą integracyjną. Nie implementuje wewnątrz questa kopalni, złóż, construction state, NPC travel, kolonii, produkcji złota ani profit-share accounting.

## Recon update — current `main`

Zweryfikowane od czasu draftu:

- `world-terrain-017` i `world-018` są zaimplementowane: istnieje stable abandoned-mine `WorldLocation`, finite gold deposits oraz wspólny `economicSourceId` dla depositów tej kopalni.
- `world-019` jest zaimplementowane i `WorldBundle.querySiteInfrastructure(...)` zwraca completed terrain preparations, usable Player wells oraz cultivation areas.
- `settlements-npcs-026` daje persistent `NpcAuthoritativeState.personalInventory`.
- `settlements-npcs-027` ma gotowy assignment/provisioning contract (`formExpeditionAssignment`, `provisionExpeditionAssignment`, `markExpeditionAssignmentReady`); pozostała manual verification.
- `settlements-npcs-028` ma gotowy persistent generic travel (`NpcAuthoritativeState.travel`) oraz `SettlementsManager.dispatchReadyExpedition(...)`; pozostała manual verification.
- `settlements-004` jest zaimplementowane: `SettlementEconomy` ma source attribution, exact-once realization, deterministic `establishEntitlement(...)` i claim boundary.
- `settlements-003` jest nadal `in progress`: bootstrap/persistence founded settlement działa, ale pełny live streaming/materialization founded colony pozostaje otwarty.
- `quests-progression-002` i późniejsze quest improvements dostarczyły normalny outcome/reward/consequence path, multi-stage objectives oraz `talk_to_npc_choice`; nie projektować osobnego reward engine.
- `QuestManager` pozostaje ownerem authored quest progress; world facts mają być obserwowane przez resolver/polling seams zamiast kopiowane do quest state.
- `LocationKnowledge` / `WorldLocation` są nadal właściwym ownerem odkrycia miejsca.

Jedyną nadal aktywną zależnością jest `settlements-003`. Quest może już użyć idempotentnego bootstrapu i founded-settlement state, ale nie powinien uzależniać completion od brakującego jeszcze live streamingu kolonii.

## Architectural invariant

Quest może:

- utrzymywać authored progression;
- reagować na authoritative world facts;
- inicjować generic operations;
- przechowywać irreversible authored choice;
- przechować stable operation reference tylko wtedy, gdy owning system nie daje deterministic lookup.

Quest nie może utrzymywać własnych kopii:

- mine/deposit state;
- construction completion;
- expedition composition/travel progress;
- settlement population;
- gold production;
- entitlement accrual.

## Dependency contracts

### `world-terrain-017`

Dostarcza istniejącą przed questem abandoned mountain mine jako stable `WorldLocation`/world feature związany z Cave V2.

Quest potrzebuje stable mine location identity. Nie odpowiada za terrain, cave generation ani geometry.

### `world-018`

Dostarcza realne finite gold deposits oraz stable economic source/site identity wspólną dla depositów tej kopalni.

Quest jedynie potwierdza discovery/inspection właściwego source. Nie liczy wydobytej rudy.

### `world-019` ✅

Quest używa `WorldBundle.querySiteInfrastructure(site)` i nakłada policy:

- co najmniej 2 completed preparations;
- każdy `size >= 6`;
- co najmniej 1 usable Player well;
- co najmniej 1 cultivation area.

Site bounds mają być wyprowadzone ze stable mine/colony site z `world-terrain-017`, nie z pozycji Playera.

Nie persistować `siteReady`.

### `settlements-npcs-027` / `028` ✅ implementation

Quest tworzy/provisionuje assignment przez publiczne WorldBundle seams, markuje ready, a następnie dispatchuje real expedition przez generic travel.

Quest może przechować `assignmentId`, ponieważ jest to stable operation reference do owning systemu, ale nie kopiuje member IDs, inventory ani travel progress.

### `settlements-003`

Quest wywołuje idempotent `bootstrapFoundedSettlement(...)` po authoritative arrival i obserwuje returned/founded settlement ID.

Nie tworzy tents, households ani economy samodzielnie.

### `settlements-004`

Po wyborze share quest ustanawia jeden deterministic 20% source entitlement dla mine economic source. Accrual/claim pozostaje economy-owned.

### `quests-progression-002` ✅

Buyout i terminal quest consequences korzystają ze shared reward/outcome semantics. Nie dodawać nowego payment subsystem.

## World discovery and quest availability

### Mine reveal path

Normalny information path używa istniejącego `LocationKnowledge.reveal(...)` / normalnego reveal-location mechanism dla stable mine `WorldLocation`.

### Independent discovery

Jeżeli aktualny gameplay discovery path dla fizycznie odwiedzonej `WorldLocation` nadal nie zapisuje `LocationKnowledge`, dodać najmniejszy reusable world-location discovery seam w world/location layer:

```text
player enters/inspects bounded WorldLocation
→ LocationKnowledge.reveal(locationId, exploration)
```

Nie dodawać `mineDiscovered` do quest progress.

### Availability condition

Quest ma być offerable gdy spełniony jest jeden z warunków:

```text
normal authored information path
OR
mine location already known/discovered
```

Nie budować pełnego condition DSL tylko dla tego przypadku. Rozszerzyć obecny prerequisite resolver o mały injected/read-only world-knowledge predicate, jeżeli nadal brakuje takiej możliwości.

## Gold confirmation objective

Potrzebny jest reusable objective/fact obserwujący realny deposit/source interaction:

```text
player inspection/mining interaction
→ stable economicSourceId / resource source ref
→ QuestManager world-driven objective match
```

Objective znaczy „potwierdzono złoto w tej kopalni”, nie „wydobądź N gold”.

Preferować rozszerzenie istniejących world-driven objective/polling seams. Nie hard-code'ować mine ID ani `gold` w `QuestManager` core.

Jeżeli Player potwierdził source przed przyjęciem questa, objective ma móc zostać satisfied z authoritative known-world/resource fact lub persisted discovery event state — bez zmuszania do ponownego kopania.

## Persistent reward choice

Wybór:

```text
buyout | share
```

jest authored, irreversible i następuje przed terminalnym końcem questa.

Użyć obecnego `talk_to_npc_choice`/quest-stage machinery. Jeżeli current progress model przechowuje wyłącznie terminal outcome, dodać najmniejszy generic persistent stage-choice payload keyed by quest/stage/choice, zamiast mine-specific booleanów.

Choice round-tripuje przez save/load i jest exact-once.

## Quest flow

### 1. Information or independent discovery

Informacja/mapa ujawnia istniejącą mine `WorldLocation`; independent exploration może zrobić to wcześniej. Obie ścieżki prowadzą do tego samego quest ID.

### 2. Confirm real gold

Player dociera do realnej kopalni i potwierdza gold source/deposit. Quest obserwuje realny world fact.

### 3. Report to sponsor

Player raportuje odkrycie authored sponsor NPC w większej osadzie.

### 4. Prepare site

Quest odpytuje `querySiteInfrastructure` dla colony site. Pre-existing qualifying infrastructure jest akceptowane natychmiast.

### 5. Choose reward arrangement

Player wybiera:

- immediate authored buyout;
- persistent 20% source entitlement.

Buyout payout jest exact-once przez shared reward contract. Share tworzy exactly one entitlement przez `settlements-004`.

### 6. Form and provision expedition

Quest wywołuje kolejno existing generic operations:

```text
formExpeditionAssignment
→ provisionExpeditionAssignment
→ markExpeditionAssignmentReady
```

Nie wybiera ręcznie NPC ani nie tworzy equipment.

### 7. Dispatch and travel

Quest dispatchuje assignment do stable colony destination i obserwuje generic travel/arrival state.

Player/camera nie są wymagane.

### 8. Bootstrap colony

Po arrival quest wywołuje `settlements-003` bootstrap. Repeated dialogue/save-load może bezpiecznie ponowić command, bo bootstrap jest idempotentny.

### 9. Complete

Quest kończy się po authoritative founded-settlement fact. Po completion nie steruje dalszym mining/economy lifecycle.

## Quest-owned persistent state

Quest może posiadać tylko:

```text
quest lifecycle / stage
reward choice: buyout | share
expeditionAssignmentId (stable operation ref)
foundedSettlementId only as observed/reference value if useful for later authored dialogue
```

`foundedSettlementId` nie jest kopią settlement state.

### Explicitly not quest-owned

| State | Owner |
|---|---|
| mine discovery | `LocationKnowledge` |
| mine/cave identity | world / `world-terrain-017` |
| deposit reserves/depletion/source | resource system / `world-018` |
| site infrastructure | world-019 owners + query |
| expedition composition/provisioning | expedition assignment system |
| travel/arrival | `NpcAuthoritativeState.travel` / expedition travel |
| colony population/households/tents | `settlements-003` / settlement owners |
| gold stock | `SettlementEconomy` |
| source realization/20% accrual | `settlements-004` |
| Player coins | Player inventory/reward path |

## Idempotency keys

Use owning-system identities:

- reveal: `locationId`;
- reward choice: quest/stage choice key;
- buyout: quest outcome/reward resolution key;
- share: entitlement/agreement ID;
- expedition: assignment ID;
- colony: stable site/founded settlement ID.

Repeated dialogue, restore or polling must converge to existing state.

## Dialogue states

Minimum authored states:

- initial lead;
- independent-discovery-aware opening;
- gold confirmed / sponsor report;
- infrastructure requirements;
- site accepted;
- buyout/share choice;
- expedition formed/provisioned;
- travelling;
- colony founded;
- final acknowledgement.

Dialogue reads authoritative world state; it never sets `siteReady`, `arrived`, `mineGold`, etc. directly.

## Failure / recovery cases

Handle explicitly:

- mine discovered before quest offer;
- gold confirmed before quest offer;
- some gold mined/depleted before sponsor report;
- site infrastructure built before requested;
- save/load after reward choice but before expedition formation;
- repeated provisioning/dialogue;
- save/load during travel;
- one expedition member unavailable/dead before dispatch: generic assignment system decides readiness/failure, quest does not silently replace state;
- colony already founded when quest resumes;
- share entitlement already exists when choice consequence retries;
- buyout reward already resolved when dialogue retries.

Where authoritative state already satisfies a stage, progression catches up instead of forcing action repetition.

## Scope

- authored quest stages/dialogue;
- information + independent-discovery convergence;
- small reusable world-knowledge availability seam if still missing;
- small reusable deposit/source confirmation objective if still missing;
- mine-specific site qualification policy over `querySiteInfrastructure`;
- persistent mid-quest reward choice;
- expedition API orchestration;
- travel/arrival observation;
- colony bootstrap orchestration;
- final shared outcome resolution;
- exact-once cross-system integration.

## Non-goals

- mine/cave/worldgen;
- deposit generation/depletion;
- construction/well/garden implementation;
- NPC inventory/provisioning internals;
- travel/pathfinding internals;
- colony bootstrap internals;
- mining profession behaviour;
- source ledger/entitlement accounting internals;
- full dialogue-tree/condition DSL;
- generic migration or colony expansion.

## Implementation order

1. Re-read final contracts/implementation notes of active dependencies.
2. Bind stable mine `WorldLocation` + economic source IDs.
3. Add/verify physical WorldLocation discovery → `LocationKnowledge`.
4. Add/verify world-knowledge prerequisite resolver.
5. Add/verify resource-source confirmation objective.
6. Author quest definition and convergence path.
7. Wire infrastructure policy.
8. Wire persistent reward choice + buyout/share consequences.
9. Form/provision/ready expedition.
10. Dispatch and observe arrival.
11. Trigger/observe colony bootstrap.
12. Resolve terminal outcome.
13. Add persistence/integration tests.

## Verification

Automated tests:

- information and independent discovery converge to one quest;
- discovery survives save/load and enables availability;
- pre-confirmed gold satisfies objective;
- deposit depletion stays resource-owned;
- pre-existing qualifying infrastructure is accepted;
- invalid site remains blocked without quest-owned booleans;
- reward choice survives save/load;
- buyout exact-once;
- share creates one 20% entitlement;
- repeated expedition commands do not duplicate assignment/provisioning;
- restored travel resumes/observes correctly;
- bootstrap retry creates one colony;
- loading with already-founded colony catches quest up;
- completion does not stop subsequent mining/economy simulation.

Run focused quest/world/expedition/persistence tests, typecheck and build. Player performs browser/manual verification; AI does not run browser verification.

Before implementation create/update focused implementation notes from then-current code and dependency APIs.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

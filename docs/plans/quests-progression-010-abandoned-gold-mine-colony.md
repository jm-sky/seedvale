# Plan: Abandoned gold mine → mining colony integration

**Created:** 2026-09-07
**Status:** `draft` 📝
**Priority:** high · **Effort:** M
**Depends on:** world-terrain-017, world-018, world-019, settlements-npcs-026, settlements-npcs-027, settlements-npcs-028, settlements-003, settlements-004, quests-progression-002
**Domain:** `quests-progression`  
**Type:** `feature`  
**Roadmap:** `quests-abandoned-gold-mine-colony`

> **Draft do sprawdzenia, uzupełniania i poprawy.** Finalne integration contracts trzeba ponownie zweryfikować na aktualnym `main` po ustabilizowaniu zależności, szczególnie expedition/travel, colony bootstrap, gold entitlement oraz quest outcomes.

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

Plan jest przede wszystkim **warstwą integracyjną**. Nie implementuje wewnątrz questa kopalni, złóż, construction state, NPC travel, kolonii, produkcji złota ani profit-share accounting.

Mapa/informacja ujawnia istniejące miejsce. Nigdy nie tworzy kopalni.

Independent discovery i normalny information path muszą zbiegać się do jednego quest flow, a nie tworzyć dwóch równoległych questów.

## Architectural invariant

Quest może:

- utrzymywać authored progression,
- reagować na authoritative world facts,
- inicjować istniejące generic operations,
- przechowywać irreversible authored choice,
- przechowywać stable reference do operacji, jeśli nie można jej deterministycznie odnaleźć.

Quest nie może utrzymywać własnych kopii:

- deposit depletion,
- construction completion,
- expedition progress,
- settlement population,
- gold production,
- profit-share accounting.

Po colony bootstrap normalne systemy świata przejmują pełną odpowiedzialność za dalsze działanie kolonii.

## Dependencies and expected contracts

### `world-terrain-017` — abandoned mountain mine landmark

Dostarcza istniejącą przed questem kopalnię jako stabilny world feature / WorldLocation związany z Cave V2.

Quest potrzebuje stable mine/location identity i możliwości ujawnienia/odnalezienia tego miejsca. Nie odpowiada za siting, terrain classification, cave generation ani geometry.

### `world-018` — cave-aware rich finite resource deposits

Dostarcza realne gold deposits związane z kopalnią/cave oraz normalne mining/depletion/persistence.

Quest jedynie potwierdza, że właściwe realne złoże złota zostało odkryte/rozpoznane. Nie prowadzi licznika rudy i nie tworzy quest deposits.

### `world-019` — persistent Player-built site infrastructure

Dostarcza durable completed terrain preparations oraz read-only site infrastructure query agregujące authoritative world stores.

Quest nakłada własną policy na wynik query, zamiast zapisywać `wellBuilt`, `plotsDone` lub `gardenDone`.

### `settlements-npcs-026` — NPC personal inventory and persistent belongings

Zapewnia wymagany trwały stan NPC wykorzystywany przez provisioning i expedition lifecycle.

### `settlements-npcs-027` — expedition assignment and provisioning

Dostarcza generic expedition assignment/dispatch contract. Quest może zlecić ekspedycję do mine site, ale nie wybiera i nie kopiuje jej runtime state we własnym modelu.

### `settlements-npcs-028` — long-distance NPC travel and expedition movement

Dostarcza realny travel/arrival lifecycle dla ekspedycji. Quest obserwuje ten stan zamiast utrzymywać `expeditionProgress`.

### `settlements-003` — colony bootstrap

Dostarcza generic przejście z przybyłej ekspedycji i przygotowanego site do zwykłego persistent settlement.

Quest nie tworzy households, tents, settlement population ani economy bezpośrednio.

### `settlements-004` — gold economic realization and source entitlements

Dostarcza source-aware gold realization oraz persistent entitlement/accounting potrzebne dla wariantu 20% share.

Quest ustanawia odpowiedni agreement/entitlement po wyborze Playera. Nie liczy produkcji ani należności.

### `quests-progression-002` — quest outcomes, rewards and consequences

Dostarcza shared authored outcome/reward/consequence path i exact-once resolution semantics.

Finalna implementacja musi ponownie sprawdzić aktualny contract po zakończeniu tego planu, szczególnie pod kątem wyboru wykonywanego przed terminalnym końcem całego questline'u.

## Existing integration foundations

Aktualny `main` posiada już ważne elementy, które należy wykorzystać:

- `QuestManager` jako owner quest runtime/progress,
- `LocationKnowledge` z persistent stable location knowledge,
- `WorldLocation` / world-location catalog,
- sources wiedzy m.in. `npc`, `map`, `exploration`,
- NPC/map reveal przez `LocationKnowledge.reveal(...)`,
- world interaction refs i landmark objectives,
- normalny quest giver interaction / availability indicator,
- Player wells, gardens i terrain preparation,
- ordinary `ResourceDeposit` mining/depletion,
- normalne NPC professions / settlement economy foundations,
- save/load dla quest progress i world knowledge.

Nie zakładać jednak, że obecne generic seams są wystarczające. Braki wymienione niżej są częścią integration work, jeśli nie zostaną wcześniej rozwiązane przez dependencies.

## Missing generic seams to reconfirm

### Gameplay exploration → `LocationKnowledge`

`LocationKnowledge` potrafi zapisać:

```text
mineLocationId
+ confirmed
+ exploration
```

ale finalna implementacja musi zweryfikować, czy istnieje już normalny gameplay trigger odkrywający konkretną WorldLocation przez fizyczne dotarcie/inspekcję.

Jeżeli nadal go brakuje, dodać najmniejszy reusable world-location discovery seam. Nie dodawać mine-specific discovery flag.

### World-knowledge quest availability

Obecne quest availability może nie potrafić jeszcze wyrażać prerequisite opartego o world knowledge.

Potrzebny contract powinien pozwalać, aby:

```text
normal authored information prerequisite
OR mine already independently discovered
→ same quest becomes actionable
→ normal quest availability `!`
```

Preferować injected/read-only prerequisite resolver albo inne małe rozszerzenie obecnego availability mechanism.

Nie importować całego world system do `QuestManager` i nie budować pełnego condition DSL tylko dla tego questa.

### Resource deposit/source objective

Quest potrzebuje generic sposobu potwierdzenia realnego gold deposit należącego do właściwej kopalni/source.

Preferowany model:

```text
ordinary Player interaction/inspection/mining event
→ stable resource/deposit/source ref
→ generic quest objective observes matching world fact
```

Objective oznacza **potwierdzenie złota**, nie `mine N gold`.

Nie hard-code'ować gold mine w `QuestManager`.

### Persistent authored mid-quest choice

Player wybiera:

```text
buyout
OR
20% share
```

przed dispatch/bootstrap, podczas gdy terminalny koniec questa następuje dopiero po powstaniu kolonii.

Jeżeli aktualny quest outcome/dialogue system nadal nie obsługuje takiego persistent non-terminal choice, dodać najmniejszy reusable authored-choice mechanism. Nie budować pełnego dialogue-tree engine.

Choice musi być exact-once i round-tripować przez save/load.

## Quest flow

### 1. Information path

Odpowiedni NPC/informacja/mapa prowadzi Playera do istniejącej abandoned mountain mine.

Informacja używa shared world-location knowledge:

```text
existing mine WorldLocation
→ reveal / discover through normal knowledge path
```

Nie generować kopalni ani depositów przy rozpoczęciu questa.

### 2. Independent discovery

Player może odnaleźć kopalnię bez wcześniejszej informacji.

Ordinary exploration zapisuje discovery w `LocationKnowledge`, nie w quest-local state.

To discovery powoduje, że odpowiedni authored NPC staje się actionable przez normalny quest availability mechanism.

Obie ścieżki zbiegają się do tego samego questa:

```text
information/map ─────────┐
                         ├→ same mine confirmation/report flow
independent discovery ───┘
```

Nie tworzyć drugiego questa i nie mintować fikcyjnego map item tylko po to, żeby spełnić prerequisite.

### 3. Confirm real gold

Player dociera do kopalni i potwierdza realne gold deposits należące do tej kopalni/source.

Quest reaguje na authoritative deposit/world interaction fact.

Nie wymaga wydobycia konkretnej liczby sztuk i nie przechowuje depletion/progress kopania.

### 4. Report to sponsor

Player raportuje odkrycie sponsorowi/administratorowi w większej osadzie.

Sponsor nie tworzy kolonii natychmiast. Warunkiem dispatch jest przygotowanie realnego site infrastructure.

### 5. Prepare real infrastructure

Quest sprawdza przez shared site query co najmniej:

- **2 odpowiednie completed prepared plots**,
- **1 usable Player-built well**,
- **1 agricultural construction / usable cultivation anchor**.

Dokładna kwalifikacja geometrii i site bounds ma być jawna i deterministyczna w finalnym planie/implementacji po ustabilizowaniu `world-019`.

Quest nie persistuje derived `siteReady`.

Każde ponowne sprawdzenie korzysta z authoritative world state.

### 6. Buyout vs 20% share

Po zaakceptowaniu przygotowanego site Player dokonuje trwałego wyboru:

- większy one-time **buyout**, albo
- **20% share** powiązany z realną przyszłą produkcją właściwego mine/colony source.

Buyout korzysta z normalnego quest reward/coin path.

Share ustanawia persistent entitlement przez `settlements-004`.

Quest nie przechowuje accrued value, production cursor ani claim accounting.

### 7. Dispatch real expedition

Sponsor uruchamia istniejący expedition assignment/provisioning mechanism.

Quest może przechować stable expedition assignment reference tylko wtedy, gdy dependency nie zapewnia jednoznacznego deterministic lookup po sponsor/site/agreement identity.

Nie przechowywać kopii NPC IDs, positions, supplies ani travel progress, jeżeli należą już do expedition/NPC state.

Dispatch musi być idempotentny przez save/load i repeated dialogue.

### 8. Observe travel and arrival

Quest obserwuje realny lifecycle ekspedycji z `settlements-npcs-028`.

Nie symuluje ruchu, nie teleportuje quest actors i nie zwiększa własnego progress timera.

Player/camera nie są wymagane do kontynuacji travel.

### 9. Observe colony bootstrap

Po realnym arrival generic `settlements-003` tworzy/aktywuje zwykłe persistent settlement przy mine site.

Quest obserwuje authoritative bootstrap/founded-settlement fact.

Nie tworzy własnego `MiningColony`, tents, households, population ani economy state.

### 10. Complete quest

Quest kończy się dopiero po potwierdzeniu realnego colony bootstrap.

Terminal outcome/reward/consequences korzystają ze shared quest resolution contract.

Po completion quest nie steruje dalszą kopalnią ani kolonią.

### 11. Autonomous continuation

Po zakończeniu:

```text
real settlement
+ real NPCs
+ real gold deposits
+ ordinary work/economy
+ source-aware entitlement if selected
→ normal simulation continues independently
```

Dalsze houses, storage, workers, roads, food expansion i rozwój kolonii należą do zwykłej symulacji albo późniejszych questów.

## Quest-owned persistent state

Minimalizować persisted quest state.

Quest powinien posiadać tylko authored progression/decisions, np. konceptualnie:

```text
QuestProgress
- quest id
- lifecycle state
- stage index
- resolved outcome where applicable
- authored reward choice: buyout | share
- optional stable operation reference only if required
```

### Explicitly not quest-owned

| State | Authoritative owner |
|---|---|
| mine discovery | `LocationKnowledge` |
| mine/cave identity and geometry | world / Cave V2 / mine landmark |
| deposit identity, reserves, depletion | world resources |
| completed preparations | terrain/site infrastructure |
| well state / water availability | Player well / water systems |
| agricultural construction/crops | garden/cultivation systems |
| expedition composition/provisioning | expedition/NPC systems |
| expedition movement/arrival | travel/NPC systems |
| settlement identity/population | settlement system |
| gold production | economy/resource systems |
| 20% entitlement and accrual | source-aware economy/entitlement system |
| Player coins | inventory |

Do not persist derived readiness or duplicate authoritative values for convenience.

## Operation identity and idempotency

Every cross-system command issued by the quest must be safe against repeated interaction and save/load.

Required invariants:

- information reveal cannot create duplicate mine state,
- reward choice resolves once,
- buyout pays once,
- share entitlement is established once,
- expedition dispatch cannot create duplicate expedition,
- colony bootstrap cannot create duplicate settlement,
- quest completion cannot replay irreversible consequences.

Prefer stable IDs / deterministic lookup supplied by owning systems over extra quest flags.

## Dialogue and NPC availability

Use the normal NPC dialogue and quest indicator path.

Required authored states include at least:

- initial information / map path,
- independent-discovery-aware availability,
- mine confirmed / sponsor report,
- infrastructure requirement,
- infrastructure accepted,
- buyout/share choice,
- expedition dispatched / travelling,
- arrival/bootstrap acknowledgement,
- final completion.

Do not make dialogue authoritative for world facts. Dialogue reads quest + world state and presents it.

Independent discovery should result in normal actionable quest availability rather than a special popup or parallel interaction mode.

## Failure and edge cases

Final implementation must explicitly decide behaviour for at least:

- Player discovers mine before meeting information NPC,
- Player confirms gold before quest offer,
- infrastructure already exists before sponsor asks for it,
- Player mines/depletes some gold before sponsor report,
- save/load after reward choice but before dispatch,
- save/load while expedition travels,
- Player leaves region while expedition travels/bootstrap occurs,
- expedition member lifecycle changes if generic expedition system permits it,
- colony already exists when quest resumes after restore,
- selected share entitlement already exists when dialogue repeats.

Where possible, recompute progression eligibility from authoritative facts instead of requiring the Player to repeat already-completed world actions.

## Scope

This plan owns:

- authored quest definition/stages/dialogue integration,
- convergence of information and independent-discovery paths,
- integration of world knowledge with quest availability,
- generic deposit/source confirmation objective if still missing,
- mine-specific infrastructure qualification policy over generic query results,
- persistent buyout/share authored choice integration,
- calls into expedition dispatch,
- observation of travel/arrival/bootstrap,
- final quest resolution,
- exact-once/idempotent cross-system orchestration.

## Non-goals

Do **not** implement here:

- Cave V2,
- abandoned mine generation/siting,
- rich deposit generation,
- deposit depletion/mining mechanics,
- terrain preparation implementation,
- well construction,
- garden/cultivation implementation,
- NPC personal inventory,
- expedition candidate selection/provisioning internals,
- long-distance travel/pathfinding,
- tents/camp implementation,
- household creation mechanics,
- generic settlement bootstrap internals,
- mining profession behaviour,
- settlement economy,
- source-aware gold production accounting,
- profit-share accrual/claim accounting,
- generic migration/labour market,
- permanent colony development,
- a general dialogue tree/condition DSL unless independently justified.

## Implementation approach

Before coding, reconfirm current `main` and implementation notes for every dependency that has moved to `done`.

Suggested integration order after dependencies are ready:

1. Reconfirm stable mine WorldLocation/source identities and actual dependency APIs.
2. Add/finalize generic gameplay WorldLocation exploration discovery if still missing.
3. Add/finalize generic world-knowledge quest availability seam if still missing.
4. Add/finalize generic resource deposit/source objective/ref if still missing.
5. Add the authored quest definition and information/independent-discovery convergence.
6. Integrate sponsor report and authoritative site infrastructure policy.
7. Add/finalize persistent authored mid-quest choice if still missing.
8. Wire buyout/share consequences to normal reward and entitlement owners.
9. Dispatch expedition through the generic expedition API.
10. Observe travel/arrival without copying state.
11. Observe/trigger idempotent colony bootstrap through the shared settlement API.
12. Resolve the quest through the normal outcome mechanism.
13. Add focused integration/persistence tests and update docs/roadmap status as appropriate.

## Verification

Automated verification should cover at least:

- information path and independent discovery converge to the same quest,
- independent discovery survives save/load,
- discovery makes the correct NPC actionable through normal availability,
- already-confirmed gold can satisfy progression without duplicate interaction,
- deposit depletion remains resource-owned,
- infrastructure qualification reads authoritative world state,
- pre-existing qualifying infrastructure is accepted,
- buyout/share choice persists,
- buyout is exact-once,
- share establishes exactly one entitlement,
- expedition dispatch is exact-once,
- quest observes restored in-progress travel,
- colony bootstrap is exact-once,
- quest can recover after loading a save where the colony already exists,
- completion does not own or stop subsequent mining/economy simulation.

Player performs browser/manual verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
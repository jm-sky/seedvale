# Plan: Founded settlement live runtime and streaming

**Created:** 2026-09-19
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** settlements-021
**Domain:** `settlements`
**Subdomains:** `population` `development` `economy`
**Tags:** `colony` `streaming` `runtime` `performance` `authored-site`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

## Goal

Dodać live, streamowany runtime founded settlement wykorzystujący authoritative state z `settlements-003/020` oraz shared resident runtime z `settlements-021`.

Founded settlement ma być widoczną częścią tego samego świata i lifecycle co proceduralne osady, ale bez generowania fikcyjnego proceduralnego village layout.

Poza streaming radius founded settlement zachowuje authoritative registries/state bez live `NpcAgent`, modeli i settlement-specific frame work.

## Architecture

Founded settlement jest innym źródłem runtime definition, nie innym systemem symulacji:

```text
procedural SettlementDef
        or
FoundedSettlementRecord
        ↓
SettlementsManager lifecycle
        ↓
loaded settlement runtime
        ↓
shared resident materializer / authoritative registries
```

Nie tworzyć `MiningColonyManager`, quest-owned simulation ani synthetic `SettlementDef`.

## Stage A — founded runtime anchors/capabilities

Dodać adapter nad realnym world state dla founded settlement.

Źródła:

- home → real stable `PlacedTent` odpowiadający founded household/home Place;
- water → real usable Player well/site water source zgodny z istniejącymi water contracts;
- cultivation → real Player garden/cultivation anchors;
- mining/resource → istniejące resource/mining hooks;
- social/work/storage capabilities → tylko gdy istnieje realne źródło/anchor.

Nie kopiować tych danych do `FoundedSettlementRecord`.

Adapter może tworzyć krótkotrwały runtime view przy load/rematerialization.

Brak infrastruktury jest legalnym stanem i ma korzystać z graceful-degradation contractu z `settlements-021`.

## Stage B — lightweight founded loaded runtime

Dodać minimalny constructor/composition path, np. konceptualnie `createFoundedSettlementRuntime(...)`.

Ma reuse:

- existing `NpcId`;
- existing `NpcAuthoritativeState`;
- founded households;
- existing `SettlementEconomy`;
- shared resident materializer;
- standard NPC update/dispose hooks.

Nie generuje automatycznie:

- VillagePlan/procedural houses;
- roads/signposts/cemetery;
- market props;
- random livestock;
- rats/nest;
- village torches/lights;
- palisades;
- decorative storage;
- procedural forest planting.

Koszt founded camp powinien być głównie kosztem realnych już istniejących world objects + aktualnie live NPC.

## Loaded settlement type/capabilities

Nie wymuszać, aby founded runtime udawał pełny proceduralny `Settlement` z zawsze-populated `SettlementLandmarks`.

Preferowany kierunek po auditcie current consumers:

```text
LoadedSettlementRuntime
  id
  kind
  display identity
  center
  npcs
  households
  economy
  update/dispose
  common lifecycle hooks

ProceduralSettlementRuntime
  + procedural-only capabilities/metadata
```

Dopuszczalna alternatywa to discriminated union `kind: 'procedural' | 'founded'`, ale procedural-only fields nie mogą być sztucznie wypełniane pustymi wartościami tylko dla compatibility.

Przed implementacją przeprowadzić audit external consumers `SettlementsManager.getLoaded()` i obecnego `Settlement`: UI/Villagers/minimap, interactions/dialogue/trade, `restActions`/town lodging, debug/inspector, shadow budget, huntable livestock/mount lookup, social-news/onSettlementAvailable, quest marker projection, transport/logistics, pasture/trough actions, day/night/fire hooks oraz inne aktualne call-sites.

Każdy consumer sklasyfikować jako: common settlement runtime consumer, procedural-only capability consumer albo founded-aware consumer wymagający jawnego zachowania.

Current examples: `npcInspector` i `inventoryWiring.findSettlementForNpc` potrzebują głównie `npcs` + settlement identity/context; Villagers/minimap potrzebują common identity/center/npcs; `debug.npc.village.houses()` jest procedural-only; `pastureTroughActions` jest procedural capability; `restActions` nie może automatycznie traktować founded camp jak town lodging; livestock/mount lookup nie powinien zakładać, że każdy loaded settlement posiada livestock collection.

Nie dodawać fake `livestock: []`, `rats: []`, `landmarks` ani innych procedural fields, jeżeli consumer semantycznie powinien użyć type guarda/capability.

## Founded display identity and metadata

`FoundedSettlementRecord` nie posiada dziś wszystkich pól obecnego proceduralnego `Settlement` (`name`, `size`, `terrain`, `dominantResource`, `foodSourceType`).

Nie dodawać sztucznych founded wartości tylko dlatego, że current `Settlement` type je wymaga.

Minimalny common display identity:

```text
stable settlement id
display name/label
world center
kind = founded
```

`siteId` nie powinien automatycznie być user-facing nazwą.

Preferować deterministic authored/site identity resolver albo explicit stable display-name input z first consumer, jeśli taki contract już istnieje. Nie generować losowej nazwy przy każdym load.

`size/terrain/dominantResource/foodSourceType` pozostają procedural metadata, chyba że konkretny shared consumer naprawdę wymaga semantic odpowiednika.

`EconomyRegistry` może nadal inicjalizować founded economy jako `OUTPOST`; to nie oznacza automatycznie, że founded runtime/UI ma udawać proceduralny `VillageSize.OUTPOST`.
## Stage C — manager source and lifecycle

Obecny `SettlementsManager.Entry` jest procedural-shaped (`def: SettlementDef`).

Wprowadzić source discriminator semantycznie:

```ts
type SettlementRuntimeSource =
  | { kind: 'procedural'; def: SettlementDef }
  | { kind: 'founded'; record: FoundedSettlementRecord }
```

Entry nadal posiada jeden wspólny:

- source;
- loaded runtime;
- pending async load;
- desired/loaded lifecycle state;
- unload/dispose lifecycle.

`ensureLoaded` dispatchuje według source, ale zachowuje wspólne dedupe/cancellation semantics.

Procedural home settlement special-case musi pozostać jawny po refactorze. Obecne `entry.def.isHome` nie może zniknąć przez zmianę typu; preferować source/lifecycle predicate typu `isPermanentLoaded(source)` albo równoważny explicit flag.

Nie utrzymywać osobnego founded loaded-map lifecycle, jeżeli istniejący manager może być ownerem obu.

## Stage D — world-space streaming

Founded records nie mają proceduralnej grid cell i nie należą do `settlementPlanCache`.

Podczas istniejącego throttled settlement recheck:

- bounded linear scan po founded records;
- squared world-space distance od gracza/observer center;
- reuse istniejących world-space `loadRadius` / `unloadRadius` (obecnie default 300 / 420), bez nowej konwersji grid→world;
- `distSq <= loadRadius²` → ensure loaded;
- `distSq > unloadRadius²` → dispose live runtime;
- ta sama hysteresis semantics co proceduralny lifecycle.

Nie skanować founded registry per-frame.

Expected founded count jest mały; V1 nie potrzebuje spatial index.

## Async loading safety

NPC model/materialization jest async, dlatego founded loading musi użyć wspólnego race-safe lifecycle.

Current manager ma już `pendingPromise` i po resolve sprawdza, czy entry nadal istnieje, ale pending entries są pomijane przez unload loop. Player może więc wyjść daleko podczas build i runtime mimo wszystko dokończy load przed kolejnym recheckiem.

Plan ma poprawić wspólny lifecycle minimalnie:

- jedno `pendingPromise` na source;
- drugi recheck nie rozpoczyna duplicate load;
- entry ma `desiredLoaded`/generation token lub równoważny stan;
- jeżeli source przestaje być wanted podczas pending load, completion natychmiast dispose'uje zbudowany runtime zamiast publikować go jako loaded;
- rebuild/dispose managera unieważnia pending completion;
- partial materialization jest disposed;
- one-live-agent invariant z `settlements-021` obowiązuje także podczas concurrent procedural/founded loads.

Nie dodawać `AbortController` tylko dla pozoru, jeśli underlying loader nie daje realnego abort seam. Generation/desired-state guard wystarczy.

## Common vs procedural-only unload/time-skip lifecycle

Current `SettlementsManager.unload()` i `resolveTimeSkip()` zakładają pełny proceduralny `Settlement`.

Dziś unload robi m.in. agriculture stamp, livestock capture, rats capture, transport off-screen handoff, `NpcAgent.beginOffscreenTravelHandoff` i dispose.

Po wprowadzeniu common loaded runtime rozdzielić:

### Common lifecycle

- NPC presentation/travel handoff tam, gdzie semantic contract jest wspólny;
- common authoritative state pozostaje registry-owned;
- runtime dispose.

### Procedural-only capabilities

- agriculture stamp/catch-up;
- livestock capture;
- rats capture;
- procedural storage/landmark-specific handoff.

Founded runtime bez tych capabilities nie może dostawać pustych fake implementations tylko po to, aby przejść przez unload.

`resolveTimeSkip()` analogicznie: common NPC time-skip tylko jeśli shared resident runtime naprawdę tego wymaga; agriculture/crop resolution tylko przez real owner/capability; brak founded-specific off-screen tick.
## Stage E — off-screen continuity

Nie dodawać founded-specific per-frame/off-screen simulation loop.

Po unload:

- `NpcAuthoritativeState`, households, economy, residency i physical world persistence pozostają u swoich ownerów;
- zero live `NpcAgent`;
- zero NPC render/animation/pathfinding/crowd update dla tej colony.

Przeprowadzić audit istniejących catch-up/off-screen systems:

- time skip;
- agriculture/crop catch-up;
- transport endpoints/travel;
- profession production;
- social/history hooks.

Dla każdego określić:

1. już działa registry-based dla founded;
2. wymaga małego shared extension;
3. nie działa off-screen w obecnej architekturze i pozostaje świadomym V1 ograniczeniem.

Nie implementować quest timerów zastępujących prawdziwą symulację.

## Stage F — founded adapter capability verification

`settlements-021` definiuje planner/fallback semantics. Ten plan nie projektuje ich drugi raz.

Tutaj zweryfikować wyłącznie, że founded adapter dostarcza poprawne real capabilities dla founder roles i jawnie dokumentuje unsupported V1 cases.

Minimum matrix:

- miner → real mining/resource hook; extraction do `ResourceSiteInventory` nie gwarantuje jeszcze pełnego ore→settlement chain bez real storage destination;
- farmer → tylko real cultivation;
- guard → local/home/center patrol semantics bez fake well;
- hunter → existing hunting hooks;
- herbalist → existing world gather hooks, jeśli niezależne od procedural landmarks;
- woodcutter → real eligible targets albo brak work action;
- trader → market-specific work tylko z real market capability; sama obecność `SettlementEconomy` nie oznacza fizycznego stockpile/market;
- fisher → fishing tylko z real dock/spot capability;
- blacksmith → workshop work tylko z real workshop;
- textile worker → home/household path;
- shepherd → tylko jeśli real livestock/pasture contracts są dostępne.

Plan nie dodaje brakującej infrastruktury; ma zachować poprawne zachowanie przy jej braku.

## onSettlementAvailable / social-news semantics

Founded settlement jest prawdziwą społecznością, więc po successful full load powinien domyślnie uczestniczyć w common `onSettlementAvailable({ id, x, z })` callbackie, o ile consumer audit nie wykaże semantycznego wyjątku.

Nie odpalać callbacku na samym founded record/pending entry. Tak jak proceduralny path, callback następuje dopiero po opublikowaniu gotowego loaded runtime.

Dzięki temu lazy social-news/reputation catch-up może reuse istniejący settlement-level mechanism bez generowania proceduralnego `SettlementDef`.
## Settlement discovery/integration audit

Founded settlement jako live settlement musi być poprawnie widoczny tylko tam, gdzie semantycznie powinien.

Sprawdzić i sklasyfikować:

- `getLoaded()`;
- `onSettlementAvailable`;
- settlement identity/center/name presentation;
- Villagers screen;
- dialogue/trade lookup po `Settlement.npcs`;
- debug APIs;
- social news/history;
- reputation/renown lookups;
- transport endpoint discovery;
- quest/NPC marker updates;
- systems zakładające procedural houses/landmarks/livestock.

Nie rozszerzać procedural-only systemów na founded tylko dlatego, że iterują po `getLoaded()`.

## Founded storage/economy invariant

Founded bootstrap może posiadać real `SettlementEconomy` bez realnego physical settlement storage.

V1 invariant:

```text
economy state may exist
physical storage capability may be absent
```

NPC action wymagająca fizycznego stockpile/storage endpointu nie może zostać zaplanowana tylko dlatego, że economy registry istnieje.

Nie używać founded center/home/tent jako ukrytego stockpile.

Jeżeli pełny production/transport chain wymaga storage, pozostaje jawnie unsupported do czasu realnej infrastruktury albo osobnego planu.
## Performance guardrails

- founded registry scan tylko podczas throttled manager recheck;
- O(n) po małej liczbie founded settlements;
- squared distances, bez allocations w hot path gdzie łatwo tego uniknąć;
- unloaded colony = 0 live NPC/render/pathfinding/crowd cost;
- nie generować procedural props tylko dla compatibility;
- nie dodawać nowych globalnych scans per NPC;
- reuse existing NPC update cadence/pathfinding/crowd mechanisms;
- nie przenosić do Web Workera bez zmierzonego CPU bottlenecku;
- async load nie może generować kilku równoległych kopii tego samego runtime.

## Cross-plan contracts

### settlements-020

Reuse corrected semantic founded home + real tent resolver/layout. `022` nie rekonstruuje camp placement ani household identity ponownie.

### settlements-021

Reuse presentation-owner policy i shared resident-materialization pipeline. `022` odpowiada za source/streaming/composition, nie za ponowne projektowanie profession semantics.

### settlements-npcs-044

Po wdrożeniu `021/022`, authored outpost plan powinien traktować te plany jako canonical nonprocedural resident/runtime/streaming foundation.

`044` nie powinien implementować własnego alternatywnego shared resident materializer, nonprocedural loaded-runtime type ani settlement streaming lifecycle.

Przy review/update `044` dodać dependency na `settlements-022` obok jego właściwych world/consequence prerequisites.
## Relevant files/systems

Prawdopodobny zakres:

- `src/settlement/SettlementsManager.ts`
- nowy mały founded runtime/adapter w `src/settlement/`
- `src/settlement/foundedSettlement.ts`
- `src/settlement/createSettlement.ts` tylko w zakresie shared loaded-runtime contracts
- `src/app/worldBundle.ts` jeżeli wymagane jest przekazanie real site infrastructure resolvers
- `src/world/siteInfrastructure.ts`
- `src/items/createPlacedTents.ts`
- external loaded-settlement call-sites wskazane przez audit (`restActions`, `inventoryWiring`, debug, Villagers/minimap, livestock/mount lookups, pasture/trough, social-news, quest markers)
- focused tests

## Scope

In scope:

- common `LoadedSettlementRuntime` / discriminated loaded-runtime contract;
- founded display identity contract;
- founded loaded runtime;
- real-world anchor/capability adapter;
- common manager source/lifecycle z procedural-home permanence;
- throttled world-space streaming z existing radii;
- async desired-load/race safety;
- capability-aware unload/time-skip lifecycle;
- external consumer compatibility;
- `onSettlementAvailable` founded semantics;
- stream-out/in continuity;
- founded adapter capability verification;
- performance regression protection.

## Non-goals

- generic player settlement-founding UI;
- procedural village generation dla founded settlement;
- automatic permanent houses/upgrades;
- population growth/migration;
- random founded livestock;
- colony-specific off-screen simulator;
- authored-outpost construction/activation lifecycle z `settlements-npcs-044`;
- gold economics/source entitlement z `settlements-004`;
- quest implementation z `quests-progression-010`.

## Verification

Automated minimum:

- founded settlement ładuje się po world-space distance bez procedural grid cell;
- drugi recheck podczas pending load nie tworzy duplicate runtime;
- unload podczas pending load nie zostawia ghost objects/agents;
- stream-out usuwa live agents, zachowuje authoritative state;
- stream-in tworzy te same stable `NpcId` i reuse tych samych registry objects;
- sponsor settlement + founded settlement loaded równocześnie → founder live dokładnie raz;
- founded runtime używa real tent/well/cultivation/resource anchors;
- brak market/dock/workshop nie crashuje i nie tworzy fake infrastructure;
- `getLoaded()` consumers nie zakładają nielegalnie procedural-only fields i używają common/type-guard contractu;
- founded camp nie staje się automatycznie town lodging;
- founded runtime bez livestock/pasture nie uczestniczy w procedural-only actions;
- `onSettlementAvailable` odpala dokładnie po successful founded load;
- pending founded load oznaczony jako no-longer-wanted nie publikuje ghost runtime;
- procedural home pozostaje permanent-loaded;
- save/load/rebuild nie duplikuje founded runtime ani NPC;
- procedural settlement streaming pozostaje bez regresji.

Performance verification w testach/diagnostyce, gdzie istnieją seams:

- brak founded scan w per-frame NPC update;
- unloaded founded settlement nie posiada live `NpcAgent`;
- brak dodatkowej procedural prop generation dla founded runtime;
- brak nowych world/global scans w per-frame update;
- unloaded founded runtime nie posiada procedural-only capture/tick kosztów.

Run focused tests, typecheck i build. Player wykonuje browser/gameplay verification; AI nie uruchamia browser verification.

Dodać JSDoc z `@domain settlements` dla nowych publicznych founded runtime/streaming contracts i source discriminatora używanego przez preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

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

Przed implementacją przeprowadzić audit external consumers `SettlementsManager.getLoaded()` i `Settlement`:

- UI/Villagers;
- interactions/dialogue/trade;
- debug/inspector;
- shadow budget;
- huntable livestock;
- social-news/onSettlementAvailable;
- quest marker projection;
- transport/logistics;
- day/night/fire hooks;
- inne aktualne call-sites.

Następnie wybrać najmniejszą zmianę typu:

- wspólny `LoadedSettlementRuntime` + procedural capabilities; albo
- discriminated `kind: 'procedural' | 'founded'` z jawnie optional capabilities.

Nie wypełniać founded runtime pustymi fake `SettlementLandmarks` tylko po to, by zadowolić istniejący typ.

## Stage C — manager source and lifecycle

Obecny `SettlementsManager.Entry` jest procedural-shaped (`def: SettlementDef`).

Wprowadzić source discriminator semantycznie:

```ts
type SettlementRuntimeSource =
  | { kind: 'procedural'; def: SettlementDef }
  | { kind: 'founded'; record: FoundedSettlementRecord }
```

Entry nadal posiada jeden wspólny:

- loaded runtime;
- pending async load;
- unload/dispose lifecycle.

`ensureLoaded` dispatchuje według source, ale zachowuje wspólne dedupe/cancellation semantics.

Nie utrzymywać osobnego founded loaded-map lifecycle, jeżeli istniejący manager może być ownerem obu.

## Stage D — world-space streaming

Founded records nie mają proceduralnej grid cell i nie należą do `settlementPlanCache`.

Podczas istniejącego throttled settlement recheck:

- bounded linear scan po founded records;
- squared world-space distance od gracza/observer center;
- within load threshold → ensure loaded;
- beyond unload threshold → dispose live runtime;
- hysteresis musi zapobiegać thrashowi analogicznie do proceduralnego lifecycle.

Nie skanować founded registry per-frame.

Expected founded count jest mały; V1 nie potrzebuje spatial index.

## Async loading safety

NPC model/materialization jest async, dlatego founded loading musi zachować istniejące safeguards:

- jedno `pendingPromise` na source;
- drugi recheck nie rozpoczyna duplicate load;
- unload/rebuild podczas pending load nie może po completion dodać martwego runtime do scene/manager;
- partial materialization musi zostać disposed;
- one-live-agent invariant z `settlements-021` obowiązuje także podczas concurrent procedural/founded loads.

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

## Stage F — profession compatibility

Zweryfikować founder roles na realnym capability set.

Minimum matrix:

- miner → real mining/resource hook;
- farmer → tylko real cultivation;
- guard → local/home/center patrol semantics bez fake well;
- hunter → existing hunting hooks;
- herbalist → existing world gather hooks, jeśli niezależne od procedural landmarks;
- woodcutter → real eligible targets albo brak work action;
- trader → market-specific work tylko z real market capability;
- fisher → fishing tylko z real dock/spot capability;
- blacksmith → workshop work tylko z real workshop;
- textile worker → home/household path;
- shepherd → tylko jeśli real livestock/pasture contracts są dostępne.

Plan nie dodaje brakującej infrastruktury; ma zachować poprawne zachowanie przy jej braku.

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

## Relevant files/systems

Prawdopodobny zakres:

- `src/settlement/SettlementsManager.ts`
- nowy mały founded runtime/adapter w `src/settlement/`
- `src/settlement/foundedSettlement.ts`
- `src/settlement/createSettlement.ts` tylko w zakresie shared loaded-runtime contracts
- `src/app/worldBundle.ts` jeżeli wymagane jest przekazanie real site infrastructure resolvers
- `src/world/siteInfrastructure.ts`
- `src/items/createPlacedTents.ts`
- external loaded-settlement call-sites wskazane przez audit
- focused tests

## Scope

In scope:

- founded loaded runtime;
- real-world anchor/capability adapter;
- common manager source/lifecycle;
- throttled world-space streaming;
- async load/unload safety;
- external consumer compatibility;
- stream-out/in continuity;
- profession compatibility;
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
- `getLoaded()` consumers nie zakładają nielegalnie procedural-only fields;
- save/load/rebuild nie duplikuje founded runtime ani NPC;
- procedural settlement streaming pozostaje bez regresji.

Performance verification w testach/diagnostyce, gdzie istnieją seams:

- brak founded scan w per-frame NPC update;
- unloaded founded settlement nie posiada live `NpcAgent`;
- brak dodatkowej procedural prop generation dla founded runtime.

Run focused tests, typecheck i build. Player wykonuje browser/gameplay verification; AI nie uruchamia browser verification.

Dodać JSDoc z `@domain settlements` dla nowych publicznych founded runtime/streaming contracts i source discriminatora używanego przez preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

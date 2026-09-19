# Plan: Shared settlement resident runtime

**Created:** 2026-09-19
**Status:** `planned` 📋
**Type:** refactor
**Priority:** high · **Effort:** L
**Depends on:** settlements-020
**Domain:** `settlements`
**Subdomains:** `population` `development`
**Tags:** `npc-runtime` `residency` `anchors` `colony` `authored-site`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`
**Model:** Opus, Sonnet

## Goal

Wydzielić z proceduralnego `createSettlement()` najmniejszy reusable live-resident runtime seam potrzebny do materializacji istniejącego `NpcId` w aktualnej osadzie rezydencji.

Plan nie streamuje jeszcze founded settlements. Jego wynikiem ma być procedural-independent resident materializer oraz wąski runtime context/capabilities dla NPC, bez wymagania pełnego proceduralnego `SettlementLandmarks`.

Proceduralne osady po refactorze muszą zachować obecne zachowanie.

## Problem

Dziś `src/settlement/createSettlement.ts` łączy:

- procedural props/layout;
- households;
- NPC identity derivation;
- `NpcAgent.create()`;
- profession/work/home/social anchors;
- livestock/rats i inne settlement integrations.

`NpcAgent` oraz helpers dostają pełny `SettlementLandmarks`, którego founded/authored site nie może uczciwie zbudować bez sztucznych well/market/houses/land-plots.

Nie rozwiązywać tego przez synthetic `SettlementDef`, synthetic `VillagePlan` ani fake landmarki.

## Current code contracts to reuse

- `NpcStateRegistry` jest authoritative ownerem mutable NPC state i przeżywa stream-out/in;
- `resolveSettlementNpcHomeDescriptor(...)` potrafi odzyskać authored identity/profile inputs istniejącego proceduralnego `NpcId` bez ładowania home settlement;
- `TravellingVisitorSpawn` z settlements-npcs-038 już materializuje existing `NpcId` i zachowuje one-live-agent invariant dla podróżującego Merchant;
- `createSettlement()` suppressuje home Merchant `NpcAgent` przez `isNpcAwayOnMerchantJourney(...)`;
- founded residency override już istnieje w `FoundedSettlementRegistry`, ale procedural resident creation nie konsultuje go;
- `workplaceFor()`, `NpcAgent`, `npcProfessionWork.ts`, `npcLogistics.ts` i storage helpers są głównymi konsumentami settlement anchors.

## Stage A — deterministic presentation ownership

Wprowadzić jeden pure/runtime decision seam określający, gdzie dany `NpcId` może mieć live presentation.

Preferowany model:

```text
merchant journey:
  visiting          → destination settlement
  outbound/returning → brak lokalnego settlement resident presentation

otherwise:
  explicit residency override → current/founded settlement
  no override                 → procedural source settlement
```

Semantycznie:

```text
identity origin
+ authoritative current residency
+ temporary journey/presentation state
→ current presentation owner | none
```

Preferować pure helper/predicate, np. konceptualnie:

```ts
resolveNpcPresentationOwner(...)
shouldMaterializeNpcAt(npcId, settlementId)
```

Wymagania:

- founder po residency switch nie może ponownie materializować się w sponsor settlement;
- travelling merchant nadal ma dokładnie jednego live agent w destination i nie jest materializowany w home podczas outbound/returning;
- procedural resident bez override zachowuje dotychczasowe zachowanie;
- gate ma być używany przed live presentation creation, nie po fakcie;
- persistent source of truth pozostaje w existing authoritative state (`FoundedSettlementRegistry` residency + `NpcAuthoritativeState.merchantJourney`/travel), nie w nowym runtime registry;
- runtime `Map<NpcId, owner>` może istnieć tylko jako debug/assertion albo późniejsze async-race guard w `settlements-022`, nie jako drugi owner stanu;
- duplicate live ownership ma być wykrywalny w testach/debug assertion.

Nie implementować osobnych founded/visitor/procedural duplicate guards, które mogą się rozjechać.

## Identity origin vs current residency

Shared resident materialization musi jawnie rozdzielić trzy różne pojęcia:

```text
identity origin
current residency
current household/home
```

Dla foundera po bootstrapie:

```text
identity/profile/role/family descriptor → sponsor procedural SettlementDef
current residency                      → founded settlement
current Household                      → founded household
current home                            → founded semantic home
```

Nie kopiować identity/profile data do `FoundedSettlementRecord` tylko dlatego, że current residency się zmieniła.

`resolveSettlementNpcHomeDescriptor(...)` / sponsor `SettlementDef` może pozostać źródłem immutable authored identity/profile inputs, ale materializer nie może automatycznie traktować sponsor household/home jako current household/home.

Travelling-visitor precedent pokazuje reuse stable `NpcId` + authoritative state, ale visitor zachowuje home ownership; founded resident nie może dziedziczyć tej semantyki przez przypadek.

## Stage B — narrow resident runtime capabilities

Przeprowadzić audit realnych odczytów `SettlementLandmarks` przez:

- `NpcAgent.ts`;
- `places.ts`;
- `npcProfessionWork.ts`;
- `npcLogistics.ts`;
- storage/workplace helpers używane podczas resident materialization/runtime.

Na tej podstawie wydzielić tylko te zależności, które realnie blokują nonprocedural resident materialization.

Nie stawiać celu „usunąć `SettlementLandmarks` z całego `NpcAgent`”. Jeżeli konkretna część proceduralnego runtime uczciwie nadal potrzebuje proceduralnych landmarks, może je zachować.

Preferować reuse już istniejących narrow hooks/contracts zamiast tworzenia jednego dużego `SettlementNpcCapabilities`, m.in.:

- `CultivationAnchor`;
- `SettlementMiningHooks`;
- `SettlementFoodSourceHooks`;
- `SettlementHerbalGatherHooks`;
- `ShepherdFlockHooks`;
- `SettlementDestinationThreatHooks`;
- pre-resolved `Place` home/work/social;
- narrow storage/patrol destinations.

Nowe abstraction tylko tam, gdzie current code naprawdę nadal czyta full landmarks.

Nie tworzyć drugiego dużego `SettlementLandmarks` pod inną nazwą.

`SettlementLandmarks` pozostaje procedural/presentation/layout contractem tam, gdzie faktycznie nim jest.

## Stage C — graceful infrastructure absence

Shared NPC runtime musi jawnie obsługiwać brak konkretnej infrastruktury.

Przykładowe oczekiwania:

- Farmer bez cultivation capability nie dostaje fake garden;
- Fisher bez dock/fishing capability nie łowi przy fake well;
- Trader bez market capability nie dostaje synthetic market;
- Blacksmith bez real workshop nie wykonuje workshop-specific pracy;
- Woodcutter bez eligible target nie dostaje synthetic tree;
- home-based roles mogą korzystać z realnego home Place;
- Guard/Hunter fallback nie może wymuszać nieistniejącego well tylko dlatego, że obecny procedural helper tak robi.

Audit ma rozróżnić:

1. capability potrzebne do konkretnej profession action;
2. neutralny fallback/idle anchor;
3. rzeczywistą fizyczną infrastrukturę.

Procedural adapter musi odtwarzać obecne zachowanie dokładnie, łącznie z jego current fallbacks. Nonprocedural adapter ma expose wyłącznie capabilities backed by real infrastructure/state.

Brak capability w nonprocedural context ma degradować się do poprawnego idle/other pressures, nie crasha i nie fikcyjnego world state.

### Storage destination contract

Current logistics/profession paths nadal korzystają z proceduralnych storage anchors, np. wood deposit przez `landmarks.stockpile`.

Wydzielić narrow pre-resolved storage destination/resolver tylko tam, gdzie potrzebne.

Guardrails:

- founded/nonprocedural resident bez real storage destination nie dostaje fake stockpile;
- nie używać settlement center albo home jako ukrytego substytutu shared stockpile;
- procedural adapter zwraca dokładnie te same storage destinations co dziś;
- authoritative quantities nadal pozostają w `Household`/`SettlementEconomy`; destination jest wyłącznie physical routing targetem.

### Guard patrol/duty contract

Current `planGuardPatrol()` zakłada trzy istniejące punkty:

```text
home → well → market
```

Dla shared runtime wydzielić generic patrol points/duty area input.

Procedural adapter ma reprodukować current `home/well/market` patrol bez zmiany zachowania.

Founded/nonprocedural adapter w późniejszym `022` poda realne local anchors, np. home/tent + usable well + site/center/duty point. Nie tworzyć fake well/market tylko dla Guard planner.

## Stage D — shared resident descriptor/materializer

Wydzielić najmniejszy procedural-independent resident-materialization pipeline, nie tylko wrapper wokół `NpcAgent.create()`.

Powinien przyjmować jawnie co najmniej:

- existing/stable `NpcId`;
- immutable identity/profile inputs (`FamilyMember`, family refs/odpowiednik) niezależne od current residency;
- authoritative `NpcAuthoritativeState`;
- current `Household`;
- current real `Place` home;
- current settlement-scoped work/social/storage/patrol inputs;
- physical seed;
- settlement-scoped hooks wymagane przez normalny `NpcAgent` lifecycle.

Nie może:

- generować `NpcId`;
- zakładać `familyIndex` jako globalnego identity;
- tworzyć householdu;
- wymagać `SettlementDef`;
- generować world props.

Procedural `createSettlement()` przygotowuje adapter/descriptors i używa tego samego materializera.

Materializer/pipeline musi zachować istniejącą kolejność ważnych kroków otaczających `NpcAgent.create()`, m.in. tam gdzie dotyczy:

- stable physical seed/profile resolution;
- `NpcStateRegistry.getOrCreate`;
- death/postDeath cleanup/presentation guards;
- merchant/profile/stock wiring;
- household/family descriptor binding;
- home/work/social bindings;
- settlement-scoped hooks;
- final `NpcAgent` create + scene registration.

Nie wyciągać wyłącznie samego `NpcAgent.create()` i nie zostawiać divergent side-effect ordering po obu ścieżkach.

Founded runtime z `settlements-022` użyje tego pipeline'u później z existing founder identities oraz current founded household/home.

## Presentation gate ordering and death state

Residency/presentation suppression nie może przypadkiem wyłączyć authoritative NPC maintenance.

Implementation notes mają zweryfikować dokładną kolejność current `createSettlement()`, ale guardrail jest:

```text
resolve authoritative NPC state
→ perform required authoritative/postDeath maintenance
→ resolve current presentation owner
→ materialize live/corpse presentation only when this settlement owns it
```

Nie wolno dopuścić, aby founder po śmierci wrócił jako corpse/live presentation do sponsor settlement tylko dlatego, że corpse path omija residency gate.

Jednocześnie residency gate nie może blokować cleanupu authoritative corpse state, inventory handoff ani innych manager-owned lifecycle facts, które muszą zajść niezależnie od live presentation.

## Procedural behavior preservation

To jest refactor, nie redesign proceduralnych osad.

Po zmianie procedural path musi zachować:

- te same NPC ids;
- te same household bindings;
- te same homes/workplaces;
- te same role behaviors;
- travelling merchant suppression/materialization;
- quest/dialogue/trade/social wiring;
- NPC update/dispose semantics.

Nie wykorzystywać planu do szerokiego cleanupu `createSettlement.ts`.

## Performance

Plan ma neutralny lub dodatni profil performance.

Guardrails:

- żadnych nowych world scans per NPC;
- runtime capabilities mają być przygotowane per settlement/resident i przekazywane jawnie, nie dynamicznie wyszukiwane globalnie co frame;
- nie kopiować dużych landmark arrays per frame;
- presentation-owner resolution powinien być O(1) lub bounded direct lookup w existing authoritative maps; nie dodawać global scan;
- nie dodawać Web Workera;
- procedural path nie może zwiększyć liczby `NpcAgent.update()`, pathfinding calls ani render entities.

Jeśli capability wymaga dynamicznego world resolvera (np. live resource target), reuse istniejący bounded hook zamiast globalnego scan.

## Relevant files/systems

Prawdopodobny zakres:

- `src/settlement/createSettlement.ts`
- `src/settlement/SettlementsManager.ts`
- `src/settlement/npcIdentity.ts`
- `src/settlement/places.ts`
- `src/settlement/props.ts` tylko w zakresie adaptera/typów
- `src/ai/NpcAgent.ts`
- `src/ai/npcProfessionWork.ts`
- `src/ai/npcLogistics.ts`
- powiązane tests

Dokładny capability shape ma wynikać z aktualnego call graph podczas implementation notes/review.

## Scope

In scope:

- deterministic presentation-owner policy;
- explicit separation identity origin vs current residency/household;
- narrow procedural-independent work/logistics/place contracts tylko tam, gdzie potrzebne;
- graceful missing-infrastructure behavior;
- shared existing-`NpcId` resident-materialization pipeline;
- procedural adapter zachowujący behavior.

## Non-goals

- founded settlement world streaming;
- manager world-space founded discovery;
- founded `Settlement`/loaded-runtime adapter;
- off-screen colony simulation;
- nowe professions;
- authored-outpost activation;
- permanent colony buildings;
- redesign całego `createSettlement()`.

## Verification

Automated minimum:

- founder z residency override nie materializuje się w sponsor settlement;
- ordinary procedural resident nadal materializuje się jak wcześniej;
- travelling merchant nadal istnieje live dokładnie raz;
- deliberate duplicate materialization tego samego `NpcId` jest blokowana/wykrywana;
- identity/profile foundera nadal resolve'uje się ze sponsor source, ale current household/home należą do founded settlement;
- procedural residents zachowują ids, household/home/workplace semantics;
- brak optional infrastructure nie powoduje crasha ani synthetic targetu;
- procedural role planners zachowują obecne fallbacks przy pełnym procedural adapterze;
- founded/nonprocedural storage absence nie tworzy fake stockpile;
- Guard procedural patrol nadal używa obecnego home/well/market patternu po adapterze;
- materializer używa istniejącego `NpcAuthoritativeState`, nie kopii;
- authoritative death/postDeath maintenance nadal działa mimo presentation suppression.

### One-live-agent matrix

Dodać focused matrix co najmniej:

| NPC state | Sponsor/source loaded | Current/founded/destination loaded | Expected live presentation |
|---|---:|---:|---|
| procedural, no override | yes | n/a | source settlement |
| founded residency | yes | no | none |
| founded residency | yes | yes | founded settlement only |
| merchant outbound | yes | destination yes/no | none |
| merchant visiting B | home yes | B yes | B only |
| merchant returning | home yes | destination yes/no | none |

Macierz ma testować public/pure presentation-owner policy niezależnie od pełnego async streamingu z `022`.

Run focused tests, typecheck i build. Player wykonuje browser/gameplay verification; AI nie uruchamia browser verification.

Dodać JSDoc z `@domain settlements` dla shared live-resident ownership i publicznych runtime capability/materialization kontraktów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

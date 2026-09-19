# Plan: Shared settlement resident runtime

**Created:** 2026-09-19
**Status:** `draft` 📝
**Type:** refactor
**Priority:** high · **Effort:** L
**Depends on:** settlements-020
**Domain:** `settlements`
**Subdomains:** `population` `development`
**Tags:** `npc-runtime` `residency` `anchors` `colony` `authored-site`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

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

## Stage A — central live resident ownership

Wprowadzić jeden manager/runtime-level decision seam określający, czy `NpcId` może być live residentem danego settlementu.

Semantycznie:

```text
authoritative current residency
+ temporary travel/visitor presentation ownership
→ exactly one live settlement owner for NpcId
```

Wymagania:

- founder po residency switch nie może ponownie materializować się w sponsor settlement;
- travelling merchant nadal ma dokładnie jednego live agent w destination i nie jest materializowany w home;
- procedural resident bez override zachowuje dotychczasowe zachowanie;
- gate ma być używany przed stworzeniem `NpcAgent`, nie po fakcie;
- runtime ownership bookkeeping, jeżeli potrzebny, może być manager-owned `Map<NpcId, owner>`, ale nie jest persistent state;
- duplicate live ownership ma być wykrywalny w testach/debug assertion.

Nie implementować osobnych founded/visitor/procedural duplicate guards, które mogą się rozjechać.

## Stage B — narrow resident runtime capabilities

Przeprowadzić audit realnych odczytów `SettlementLandmarks` przez:

- `NpcAgent.ts`;
- `places.ts`;
- `npcProfessionWork.ts`;
- `npcLogistics.ts`;
- storage/workplace helpers używane podczas resident materialization/runtime.

Na tej podstawie wydzielić najmniejszy contract potrzebny live NPC.

Preferować capability/resolver semantics, np.:

```text
home
water access
cultivation
storage/deposit
profession workplace/targets
social place
```

zamiast kopiowania struktury:

```text
well + market[] + dock + stockpile + trees[] + houses[] + ...
```

Nie tworzyć drugiego dużego `SettlementLandmarks`.

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

Brak capability ma degradować się do poprawnego idle/other pressures, nie crasha i nie fikcyjnego world state.

## Stage D — shared resident descriptor/materializer

Wydzielić najmniejszy procedural-independent input dla materializacji jednego residenta.

Powinien przyjmować jawnie co najmniej:

- existing/stable `NpcId`;
- identity/profile inputs (`FamilyMember`, family refs/odpowiednik);
- authoritative `NpcAuthoritativeState`;
- właściwy `Household`;
- real `Place` home;
- settlement resident runtime capabilities;
- physical seed;
- settlement-scoped hooks wymagane przez normalny `NpcAgent` lifecycle.

Nie może:

- generować `NpcId`;
- zakładać `familyIndex` jako globalnego identity;
- tworzyć householdu;
- wymagać `SettlementDef`;
- generować world props.

Procedural `createSettlement()` przygotowuje adapter/descriptors i używa tego samego materializera.

Founded runtime z `settlements-022` użyje go później z existing founder identities.

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
- central one-live-agent ownership lookup powinien być O(1);
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

- central residency/live-owner gate;
- procedural-independent resident runtime capability contract;
- graceful missing-infrastructure behavior;
- shared existing-`NpcId` resident materializer;
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
- procedural residents zachowują ids, household/home/workplace semantics;
- brak optional infrastructure nie powoduje crasha ani synthetic targetu;
- role-specific planners zachowują proceduralne zachowanie przy pełnym capability set;
- materializer używa istniejącego `NpcAuthoritativeState`, nie kopii.

Run focused tests, typecheck i build. Player wykonuje browser/gameplay verification; AI nie uruchamia browser verification.

Dodać JSDoc z `@domain settlements` dla shared live-resident ownership i publicznych runtime capability/materialization kontraktów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

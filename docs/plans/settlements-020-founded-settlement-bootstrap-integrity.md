# Plan: Founded settlement bootstrap integrity

**Created:** 2026-09-19
**Status:** `draft` 📝
**Type:** fix
**Priority:** high · **Effort:** M
**Depends on:** settlements-003
**Domain:** `settlements`
**Subdomains:** `population` `development`
**Tags:** `colony` `founding` `persistence` `residency`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

## Goal

Domknąć correctness istniejącego foundation z `settlements-003` przed uruchomieniem live founded settlement runtime.

Plan naprawia wykryte po implementacji Stage 1/3 niespójności w home binding, fizycznym camp layout i idempotent repair. Nie materializuje jeszcze live `NpcAgent` ani nie dodaje streamingu founded settlement.

Po tym planie authoritative founded state ma być bezpiecznym fundamentem dla `settlements-021` i `settlements-022`.

## Current code baseline

Na aktualnym `main`:

- `src/settlement/foundedSettlement.ts` posiada persisted `FoundedSettlementRecord`, stable founded settlement/household/tent IDs oraz residency overrides;
- `src/settlement/foundedSettlementBootstrap.ts::bootstrapFoundedSettlement(...)` tworzy founded record, economy, jednoosobowe households, fizyczne `PlacedTent` i czyści zakończony expedition travel;
- `Household.homeId` semantycznie wskazuje `Place.id`, ale bootstrap founded zapisuje dziś bezpośrednio `foundedTentId`;
- wszystkie founding tents są dziś umieszczane w tym samym `(input.x, input.z)` z `yaw = 0`;
- ścieżka `existing` tworzy brakujący stable tent z condition 100 bez item instance, co może mintować world object i maskować uszkodzony/pominięty persisted state;
- `PlacedTents` pozostaje authoritative ownerem fizycznego tent state; founded registry nie może go kopiować;
- `FoundedSettlementRecord.x/z` to centrum site/settlement, nie powinno być automatycznie pozycją każdego domu.

## Required decisions

### Stable founded home Place

Dodać deterministic home-place identity oddzieloną od physical tent identity, np. semantycznie:

```ts
foundedHomePlaceId(settlementId, npcId)
```

`Household.homeId` ma wskazywać ten `Place.id`.

Pozycja founded home jest rekonstruowana z odpowiadającego stable `PlacedTent`; nie persistować kopii współrzędnych home, jeśli można je bezpiecznie odtworzyć.

Nie zmieniać globalnie znaczenia `Household.homeId` na "dowolny world object id".

### Deterministic camp layout

Bootstrap ma precompute'ować stabilną, bounded pozycję i yaw każdego founding tent zamiast nakładać wszystkie namioty na center.

Wymagania:

- deterministyczne z stable settlement/site identity + member order/`NpcId`;
- mały camp footprint wokół `FoundedSettlementRecord.x/z`;
- pozycje różnych founderów nie mogą się pokrywać;
- layout nie może zależeć od frame/runtime RNG;
- jeżeli site-readiness consumer przekazuje przygotowane obszary, layout może użyć realnych prepared areas tylko przez jawny input/resolver — nie kopiować terrain-preparation state do founded record;
- nie wykonywać automatycznego procedural village planning.

Preferować mały reusable pure helper zwracający placement descriptors przed transaction commit.

### Existing/bootstrap repair semantics

Repeated bootstrap pozostaje idempotentny, ale nie może tworzyć brakującego fizycznego tent z condition 100 bez źródła.

Dla istniejącego founded settlement:

- safe derived residency/home binding można naprawić;
- istniejący real tent można ponownie rozwiązać po stable id;
- brak persisted physical tent należy traktować jako inconsistency/broken binding albo jawny recoverable result;
- nie konsumować kolejnego inventory tent automatycznie;
- nie mintować zastępczego item/world object.

Jeżeli potrzebny będzie repair result, rozszerzyć wynik minimalnie i generycznie; nie dodawać quest-specific stanu.

### Sponsor/member validation

Repeated call dla istniejącego `siteId` musi sprawdzić compatibility stable identity:

- ten sam founded settlement/site;
- zgodny sponsor, jeżeli sponsor jest częścią kontraktu tego settlementu;
- member set nie może zostać po cichu podmieniony.

Kolizję stable IDs traktować jako contract error/result, nie jako powód generowania nowego id.

## Transaction boundary

Przed irreversible mutation precompute'ować i zwalidować:

- settlement/household/home/tent ids;
- wszystkie founder states;
- wszystkie wymagane tent instances dla pierwszego bootstrapu;
- wszystkie tent placements;
- konflikty existing records/households/placed tents.

Dopiero potem commitować authoritative changes.

Nie implementować rollback przez odtwarzanie przybliżonych itemów.

## Performance

Ten plan nie dodaje żadnego ticku ani skanu per-frame.

Camp layout powinien być pure/bounded i liczony wyłącznie przy bootstrapie lub rekonstrukcji derived binding. Liczba founderów w V1 jest stała/mała.

Nie dodawać spatial index, workera ani settlement-wide planner dla kilku namiotów.

## Relevant files/systems

Najbardziej prawdopodobne miejsca zmian:

- `src/settlement/foundedSettlement.ts`
- `src/settlement/foundedSettlementBootstrap.ts`
- `src/settlement/household.ts`
- `src/settlement/places.ts`
- `src/items/createPlacedTents.ts`
- odpowiadające testy founded bootstrap/registry

Nie rozszerzać `PlacedTent` o household/residency state.

## Scope

In scope:

- correct founded home `Place.id`;
- deterministic non-overlapping founding camp placement;
- safe idempotent existing-path semantics;
- stable binding/collision validation;
- tests dla bootstrap/save-compatible state.

## Non-goals

- live `NpcAgent` founded residents;
- refactor `SettlementLandmarks`;
- settlement streaming;
- profession behavior;
- permanent houses;
- camp growth/development;
- authored outposts;
- quest stages/dialogue.

## Verification

Automated:

- każdy founder ma unikalny deterministic tent placement i stable yaw;
- ten sam seed/site/member set daje ten sam layout;
- `Household.homeId` jest founded `Place.id`, nie raw tent id;
- home resolver wskazuje właściwy real tent;
- repeated bootstrap nie konsumuje kolejnego tent itemu;
- missing persisted tent w existing path nie tworzy darmowego tent;
- incompatible existing site/sponsor/member binding nie jest silently accepted;
- save/load zachowuje wszystkie non-derivable state bez duplikacji.

Uruchomić focused tests, typecheck i build. Player wykonuje browser/gameplay verification; AI nie uruchamia browser verification.

Dodać JSDoc z `@domain settlements` dla nowych publicznych stable-id/home-layout kontraktów istotnych dla preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

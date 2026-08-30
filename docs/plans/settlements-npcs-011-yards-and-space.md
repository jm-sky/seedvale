# Plan: Household Yards & Settlement Space

**Created:** 2026-08-30  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** M  
**Depends on:** none  
**Domain:** `settlements-npcs`

## Cel

Zapewnić settlementom wystarczającą przestrzeń na domy i ich otoczenie:

- dom,
- ogródek,
- storage i skrzynki,
- podstawowe props gospodarstwa,
- dostęp i ruch wokół domu.

Rozmiar settlementu powinien wynikać z rzeczywistych potrzeb layoutu, a nie prowadzić do upychania householdów przy sobie.

Livestock nie wymaga osobnej przestrzeni w settlement layout. Zwierzęta mogą swobodnie opuszczać settlement i korzystać z otaczającego świata.

## Problem

Obecny layout koncentruje się głównie na footprintach domów i odstępach między nimi. Kolejne systemy dodają elementy wokół domu, m.in. storage i ogródki.

Brakuje wspólnego założenia określającego, ile przestrzeni powinien otrzymać household.

Może to prowadzić do:

- kolizji props między householdami,
- braku miejsca na ogródek,
- zbyt małych odstępów od innych obiektów,
- dokładania kolejnych arbitralnych offsetów.

## Założenia

### Household yard

Household powinien mieć logiczną przestrzeń użytkową wokół domu obejmującą:

```
house
+ access / movement
+ garden allowance
+ storage
+ household props
```

`garden allowance` oznacza miejsce potrzebne w settlement layout dla istniejących wspólnych ogrodów. Nie oznacza prywatnego ogródka przypisanego do każdego householdu.

Nie musi być ona fizyczną ani nieprzekraczalną granicą.

### Settlement space

Settlement boundary powinien uwzględniać wymagania wszystkich householdów oraz istniejącej infrastruktury.

Wykorzystać istniejące:

- `VillageSizeConfig`,
- `VillagePlan`,
- house plots,
- settlement site selection,
- `houseYardPlacements()`,
- garden placement,
- storage placement.

Nie tworzyć równoległego systemu zarządzania przestrzenią.

### Livestock

Nie dodawać na tym etapie:

- pastwisk,
- zagród,
- livestock zones,
- specjalnych ograniczeń ruchu zwierząt wynikających z settlement boundary.

## Rozmiary

Przeanalizować istniejące parametry SM/MD/LG/XL i wyznaczyć wymagany settlement extent na podstawie:

```
house footprint
+ household yard
+ garden allowance
+ spacing / access
+ settlement edge margin
```

Początkowo należy rozważyć zwiększenie obecnych settlement boundaries, szczególnie dla mniejszych settlementów.

Docelowe wartości powinny wynikać z pomiaru istniejącego layoutu, a nie być przyjęte arbitralnie.

Nie zwiększać `houseSpacing` bez wykazania, że jest to konieczne.

## Integracja

Docelowy przepływ:

```
VillageSizeConfig
       ↓
layout requirements
       ↓
settlement boundary
       ↓
house plots
       ↓
household yard
       ├── garden
       ├── storage
       └── household props
```

Garden, storage i przyszłe household props powinny korzystać ze wspólnych założeń przestrzennych.

Nie tworzyć:

- `YardManager`,
- `SettlementAreaManager`,
- drugiego systemu spatialnego.

## Zakres

### In scope

- recon istniejącego settlement placement,
- zdefiniowanie wymagań household yard,
- uwzględnienie ogródków i household props,
- dostosowanie settlement boundary,
- kalibracja SM/MD/LG/XL,
- zachowanie deterministycznego placementu,
- aktualizacja testów.

### Out of scope

- przebudowa systemu ogródków,
- nowe storage/logistics,
- livestock pens/pastures,
- przebudowa AI zwierząt,
- przebudowa całego settlement generatora,
- zmiany ekonomii settlementu.

## Weryfikacja

Sprawdzić:

1. SM/MD/LG/XL generują poprawny layout;
2. każdy household ma miejsce na dom, yard i ogródek;
3. storage i props nie kolidują z domem ani ogródkiem;
4. sąsiednie householdy nie są nadmiernie upakowane;
5. istniejące ścieżki i infrastruktura nadal działają;
6. livestock może swobodnie opuszczać settlement;
7. generation pozostaje deterministyczne;
8. czas generowania nie ulega istotnemu pogorszeniu.

Końcowy layout wymaga browser/manual verification.

## Implementation summary (2026-08-30)

Measured `planVillageLayout` output for SM/MD/LG/XL across 150 deterministic
seeds each (600 settlements total) before changing anything, per the
implementation notes' recommended sequence.

Findings:

- `VILLAGE_SIZE_CONFIG.footprintRadius`/`houseSpacing`/`houseRingMax` already
  have healthy margin for households, gardens and infrastructure at every
  size (SM: ~9–10 unit boundary margin, XL: ~16). Sale plots (plan 129)
  intentionally hug the outer ring at up to `boundary.radius * ~1.05`, which
  is a separate, already-known feature, not a household/garden capacity
  problem — **no size constants changed**.
- The one real defect: `villagePlanner.ts`'s `pickPlot()` had a deterministic
  fallback ring-search loop for when the normal randomized attempts found no
  valid candidate, but it only ran for `role === 'house'`. Every other role
  (garden, stockpile, campfire, market, ...) fell straight through to an
  **unconstrained** final placement that never re-checked spacing — so a
  garden or piece of infrastructure could land on top of a house's yard once
  a settlement was packed enough that the initial randomized attempts all
  failed. Reproduced with real negative house↔garden clearance at MD/LG
  before the fix, positive across 150 seeds × 4 sizes after it.
- Fix: the same ring-search fallback now runs for every role, and grows the
  ring outward through a few bounded steps (`[1, 1.15, 1.3, 1.5, 1.75] ×
  fallbackRing`) instead of only trying the original radius, since a single
  ring of 12 angles could still be fully blocked in a dense cluster (LG).
  Bounded, generation-time-only, no worker/spatial-index added.
- New `settlement/householdYard.ts` gives the "household yard" concept from
  the plan a single pure definition: `householdYardRadius()` = the real
  worst-case house `footprintRadius` (from `houseCatalog.ts`) plus the
  outermost yard-prop offset (household storage, plan 156). `props.ts`'s
  `houseYardPlacements()` offsets (barrel/trough/storage) now read from the
  same `HOUSEHOLD_YARD_PROP_OFFSETS` constant instead of separate magic
  numbers, and `villagePlanner.ts`'s `HOUSE_PLOT_RADIUS` is asserted (test)
  to stay `>=` this contract. No `YardManager`/`SettlementAreaManager` —
  gardens remain settlement-owned infrastructure, unchanged.
- New tests (`householdYard.test.ts`, plus a "household yard & settlement
  space" suite in `villagePlanner.test.ts`) assert, per size across 15
  deterministic seeds: no household-yard/household-yard overlap, no
  household-yard/garden-clearing overlap, no household-yard/other-infra
  overlap, and every non-sale plot stays within the settlement boundary.
- Livestock untouched, per plan — no pens/pastures/zones, no boundary
  interaction added.

Not done (out of scope, unchanged): garden ownership model, storage/economy
changes, livestock pens, full settlement-generator rework.

Browser/manual verification (final visual layout across sizes/seeds,
livestock leaving the settlement, terrain clearing) is still pending.

**Zrób git commit i push do main, rebase jeżeli trzeba**

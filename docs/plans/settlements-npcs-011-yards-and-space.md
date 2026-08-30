# Plan: Household Yards & Settlement Space

**Created:** 2026-08-30  
**Status:** `planned` 📋  
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

**Zrób git commit i push do main, rebase jeżeli trzeba**

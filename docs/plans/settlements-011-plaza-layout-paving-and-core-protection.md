# Plan: Plaza layout, paving and core protection

**Created:** 2026-09-13
**Status:** `verification needed` 🔍 (implemented 2026-09-15 — browser checks are User-owned)
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `settlements`
**Type:** `feature`
**Roadmap:** -
**Model:** Sonnet, Composer

## Implementation status

Implemented 2026-09-15. Automated layout/paving/eligibility tests pass. Browser/gameplay verification (SM/MD/LG/XL plaza difference, central-prop clearance, masonry firepit, protected trees, performance) remains User-owned.

## Cel

Uporządkować centralną przestrzeń osady bez tworzenia równoległego occupancy systemu. Zakres: shared clearance centralnych propsów, ochrona drzew w reprezentacyjnej części centrum, pełny paving dla `LG/XL` oraz masonry firepit dla dużych osad posiadających fire landmark.

## Architektura

Rozszerzyć istniejący `VillagePlan`, planner i spacing. Planner ma znać world-space anchor oraz footprint każdego gameplay-relevant central prop przed materializacją.

`props.ts` może dobierać model, wariant i LOD, ale nie może samodzielnie wybierać nowych pozycji centralnych physical props.

Nie traktować `core` i `plaza` jako synonimów. Jeśli `clearings.core` jest większy niż faktyczny plac, wyprowadzić jawny planned plaza footprint albo równoważny zakres. Paving dotyczy placu, nie automatycznie całego core.

## Clearance

Well, fire/campfire, stockpile, market, boards i inne fizyczne elementy centrum mają współdzielić istniejący placement/spacing mechanism. Nie dodawać osobnych wyjątków per prop.

## Paving

Docelowo:

- `SM`: brak paving,
- `MD`: lekkie utwardzenie centrum; obecne discrete cobble plates mogą zostać, jeśli wizualnie nadal pasują,
- `LG`: pełny paved plaza,
- `XL`: większy pełny paved plaza.

Nie zwiększać po prostu `cobbleCountForSize()` dla `LG/XL`.

Paving ma wynikać z planned plaza footprint oraz reserved footprints centralnych propsów. Nie liczyć openings po fakcie w materializerze.

Pełny plac powinien mieć koszt renderingu zbliżony do kilku–kilkunastu obiektów, a nie setek scene nodes. Implementacja może użyć batchingu, instancingu, merged geometry lub innego istniejącego mechanizmu po sprawdzeniu assetów. Brak per-frame gameplay logic.

## Masonry firepit

Jeśli settlement posiada fire landmark:

- `SM/MD`: obecny/simple campfire visual,
- `LG/XL`: masonry firepit visual/body/footprint.

To nadal ten sam `VillageFire`: ten sam fuel/state lifecycle, interakcje i consumers. Duża osada bez fire landmark nie dostaje firepit tylko z powodu rozmiaru.

Firepit uczestniczy w shared clearance, a paving respektuje jego reserved footprint.

## Tree protection

Chronić reprezentacyjną centralną część settlement przed wyborem drzew przez woodcuttera. Nie rozszerzać ochrony automatycznie na cały geometryczny core, jeśli jest szerszy niż plac.

Drzewo pozostaje normalnym canonical tree ze swoim TreeId i lifecycle; zmienia się wyłącznie work eligibility. Woodcutter powinien filtrować protected central trees i wybierać kolejny poprawny target poza chronionym obszarem.

Nie generować niezależnej drugiej listy drzew.

## Invariants

- planner zna wszystkie gameplay-relevant central physical footprints,
- materializer nie przesuwa ich poza planned anchors,
- paving wynika z plaza footprint pomniejszonego o reserved footprints,
- protected trees zachowują canonical identity,
- masonry firepit reuse tego samego `VillageFire`,
- streaming order nie wpływa na wynik.

## Kluczowe miejsca

- `src/settlement/villagePlan.ts`
- `src/settlement/villagePlanner.ts`
- `src/settlement/villageClearing.ts`
- `src/settlement/props.ts`
- `src/settlement/families.ts`
- `src/settlement/VillageFire.ts`
- `src/settlement/places.ts`
- istniejący tree lifecycle/work-target mechanism.

Archived cobble work zapewniało jedynie kilka płyt przy centrum; nie jest full-plaza implementation.

## Testy

Sprawdzić deterministycznie:

- `SM` bez paving,
- `MD` z lekkim utwardzeniem,
- `LG/XL` z full plaza paving,
- brak overlap centralnych planned footprints,
- paving respektuje reserved footprints,
- fire visual variant zależy od size tylko przy istniejącym fire landmark,
- masonry variant używa tego samego `VillageFire`,
- protected central trees nie są woodcutter targets,
- drzewa poza protected area pozostają eligible,
- TreeId/lifecycle protected trees nie zmieniają się,
- planner i materializer zgadzają się co do pozycji,
- brak nowych per-frame loops.

## Poza zakresem

Pełne brukowanie roads, pavement wear, dynamiczna przebudowa placu, settlement growth, park system, ochrona drzew poza centralnym obszarem, nowe fire mechanics, nowy occupancy manager, pavement physics/pathfinding i region-specific firepit styles.

## Weryfikacja przez użytkownika

W browserze sprawdzić różnicę między `SM/MD/LG/XL`, brak kolizji centralnych propsów, poprawny masonry firepit, brak ścinania chronionych centralnych drzew oraz brak zauważalnego regresu wydajności.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
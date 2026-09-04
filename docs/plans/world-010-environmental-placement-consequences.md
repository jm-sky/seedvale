# Plan: Environmental Placement Consequences

**Created:** 2026-09-04
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** `none`
**Domain:** `world`
**Type:** `fix`
**Roadmap:** -

## Goal

Zmniejszyć nadmierny dystans wymagany przy placement obiektów gracza od brzegu wody, zachowując rzeczywiste ograniczenie geometryczne:

- obiekt może być umieszczony blisko brzegu,
- obiekt nie może wejść w wodę,
- stromy teren nadal blokuje placement,
- istniejące ograniczenia footprintów i blockerów pozostają aktywne,
- preview i final placement nadal korzystają z tej samej walidacji.

Problem dotyczy **shoreline placement clearance**, a nie deszczu, wilgotności ani `SurfaceWeatherState.wetness`.

## Problem

Obecna walidacja ground placement wykorzystuje `WATER_MARGIN` do określenia obszaru traktowanego jako `water`. Obecna wartość jest zbyt duża z punktu widzenia gameplayu i tworzy niepotrzebnie szeroką strefę wykluczenia przy brzegu.

Nie należy jednak po prostu zmniejszać istniejącego globalnego `WATER_MARGIN`, ponieważ jest on również wykorzystywany poza player placement, m.in. w kontekście przygotowania/generowania terenu.

## Scope

### 1. Oddzielić terrain water margin od player placement margin

Wprowadzić osobny, placement-specific water margin dla walidacji obiektów stawianych przez gracza.

`WATER_MARGIN` używany przez inne systemy terenu/wody pozostaje bez zmian.

**Do not change the existing global `WATER_MARGIN` merely to fix player placement.**

Nowy margin jest konceptualnie `PLACEMENT_WATER_MARGIN`; przy implementacji należy użyć nazewnictwa zgodnego z istniejącymi konwencjami projektu.

### 2. Jeden wspólny margin w V1

Wszystkie player-placeable objects korzystają w V1 z jednego wspólnego placement water margin.

Dotyczy to istniejących rodzin placementu, które przechodzą przez wspólną ground-placement validation, m.in.:

- tent,
- well,
- trap,
- garden,
- standing torch,
- palisade,
- bedroll,
- platform.

Nie wprowadzać jeszcze per-object water margins.

Jeżeli późniejsze gameplay testing wykaże różne wymagania, per-object margins mogą zostać dodane jako osobne rozszerzenie.

### 3. Margin ma oznaczać mały fizyczny clearance od granicy wody

Placement water margin powinien być **małym fizycznym buforem przy granicy wody**, a nie szeroką strefą wykluczenia od wizualnej linii brzegu.

Nowa wartość powinna być wyraźnie mniejsza od obecnego `0.8` i odpowiadać jedynie niewielkiemu safety clearance.

Nie ustalać wartości arbitralnie bez sprawdzenia istniejących jednostek, footprintów i zachowania placementu.

### 4. Zachować ochronę przed wejściem footprintu w wodę

Zmniejszenie marginu nie może pozwolić na placement obiektu, którego footprint faktycznie wchodzi w niedozwolony obszar wody.

Nie wystarczy sprawdzenie samego środka obiektu, jeśli istniejący mechanizm placementu uwzględnia footprint.

Preferować ponowne użycie istniejącego mechanizmu footprint/placement geometry zamiast tworzenia drugiego, niezależnego obliczenia footprintu.

Semantyka powinna pozostać:

```text
footprint safely on land
    → placement may be valid

footprint inside placement shoreline margin
    → water

footprint intersects actual forbidden water area
    → water
```

### 5. Zachować niezależną walidację stromizny

Zmiana water margin nie może osłabić istniejącej walidacji slope.

```text
near water + flat terrain
    → may be valid

near water + steep terrain
    → slope

in water
    → water
```

Water i slope pozostają niezależnymi ograniczeniami.

### 6. Zachować footprint i blockers

Nie zmieniać istniejących ograniczeń dotyczących:

- footprint radius,
- drzew,
- domów,
- studni,
- innych obiektów,
- separation między obiektami,
- object-specific placement rules.

Zmiana dotyczy wyłącznie shoreline water clearance.

### 7. Preview i final placement

Nie tworzyć osobnej logiki dla preview.

Zachować istniejący kontrakt, w którym preview i final placement przechodzą przez wspólny mechanizm oceny placementu.

```text
aim
  ↓
shared placement evaluation
  ├── preview
  └── final placement
```

Obie ścieżki muszą widzieć identyczne ograniczenia water/slope/footprint/blockers.

## Out of scope

Nie zmieniać w ramach tego planu:

- `SurfaceWeatherState`,
- `wetness`,
- rain/weather simulation,
- wpływu deszczu na placement,
- terrain water generation,
- water level generation,
- ocean/river geometry,
- slope thresholds,
- footprint sizes,
- blocker distances,
- per-object placement water margins.

W szczególności **nie interpretować tego problemu jako problemu z mokrą powierzchnią**.

## Implementation approach

1. Zlokalizować definicję `WATER_MARGIN` i wszystkie jej użycia.
2. Ustalić, które użycia dotyczą terrain/water preparation, a które player placement.
3. Rozdzielić terrain water margin od player placement water margin.
4. Zastosować jeden wspólny placement water margin w istniejącym ground-placement validatorze.
5. Dobrać nową, znacznie mniejszą wartość na podstawie istniejących jednostek i footprintów.
6. Zachować istniejącą walidację slope, footprintów, blockerów i object-specific rules.
7. Zweryfikować wszystkie player-placeable object families korzystające ze wspólnego validatora.
8. Nie tworzyć równoległego mechanizmu environmental/water placement validation.

## Tests

Minimum:

```text
water / below forbidden boundary
→ rejected

terrain inside the old 0.8 clearance
but outside the new placement clearance
→ accepted, jeśli pozostałe warunki są spełnione

near shoreline + steep terrain
→ rejected as slope

valid land + blocker
→ rejected as blocker

valid land + no blockers
→ accepted

preview
↔
final placement
→ same validation result
```

Dodać również test zabezpieczający przed przypadkowym użyciem terrain `WATER_MARGIN` przez player placement.

## Acceptance criteria

- Namiot można postawić wyraźnie bliżej brzegu niż obecnie.
- Studnię można postawić odpowiednio blisko brzegu.
- Żaden player-placeable object nie może być umieszczony w niedozwolonym obszarze wody.
- Ochrona footprintu przed wejściem w wodę pozostaje aktywna.
- Stromy teren nadal jest odrzucany jako `slope`.
- Istniejące footprint/blocker/separation rules działają bez zmian.
- Wszystkie objęte wspólnym ground placementem obiekty korzystają z jednego placement water margin.
- Terrain preparation zachowuje dotychczasowy `WATER_MARGIN`.
- Preview i final placement pozostają spójne.
- `wetness`/weather nie są częścią rozwiązania.
- Zmiana nie wprowadza drugiego, równoległego systemu walidacji placementu.

## Future extension

Jeżeli gameplay testing wykaże, że różne typy obiektów wymagają różnych clearance values, wspólny margin może zostać później rozszerzony do per-object configuration.

Nie komplikować V1 bez potwierdzonej potrzeby gameplayowej.

## Repository / implementation notes

Przed implementacją sprawdzić aktualny codebase i ustalić minimalny zestaw faktycznie dotkniętych plików. Nie zakładać z góry, że wszystkie call sites znajdują się w jednym module.

Dla nowych lub istotnie zmienionych publicznych mechanizmów dodać JSDoc, gdy pomaga to w preflight discovery; dla nowych mechanizmów preferować `@domain` zgodnie z konwencjami projektu.

**Zrób git commit i push do main, rebase jeżeli trzeba**

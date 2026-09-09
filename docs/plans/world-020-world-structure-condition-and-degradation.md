# Plan: World structure condition and degradation

**Created:** 2026-09-09
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** items-player-018
**Domain:** `world`
**Subdomains:** `simulation` `weather`
**Tags:** `condition` `degradation` `structures` `maintenance`
**Roadmap:** -

## Goal

Rozszerzyć istniejący player-camp condition model do małego, współdzielonego fundamentu dla trwałych world structures.

Fundament ma zapewnić:

```text
persistent world-owned condition
+ elapsed world time
+ environmental exposure
+ meaningful usage
→ current condition
→ domain-owned functional consequence
```

Pierwszym istniejącym consumerem pozostaje player camp:

- tent,
- bedroll,
- raised sleeping platform.

Pierwszym nowym consumerem ma być completed player-built well.

Plan nie implementuje jeszcze naprawy. Ma przygotować jednoznaczny authoritative condition model, który później wykorzystają:

- generic repair/maintenance work,
- `Repair` skill i targeted skill actions,
- `items-player-019`,
- autonomous NPC/household/settlement maintenance.

Nie tworzyć generic building frameworku ani rolloutować condition na wszystkie constructions.

## 1. Existing architecture to preserve

Obecny `world/sleepingUtilities.ts` już posiada właściwy wzorzec:

```text
stored condition
+ lastConditionUpdateAtDays
+ current world time
+ weather exposure
→ resolved condition
```

`resolveSleepingUtilityCondition()` jest pure, lazy, deterministic, bounded oraz niezależny od FPS i camera/player distance.

Po `items-player-018` ten sam model obejmuje również tent condition i factor-based shelter protection.

Plan ma wydzielić tylko semantykę potwierdzoną przez camp + well, zamiast projektować kompletny framework dla hipotetycznych przyszłych struktur.

Nie tworzyć:

- `ConditionManager`,
- `DurabilityManager`,
- globalnego registry condition-enabled objects,
- globalnego per-frame update loop,
- generic `Building`,
- generic `StructureEntity`.

## 2. Canonical terminology

Dla trwałych world structures canonical current-state field to:

```ts
condition: number // 0..100
```

Znaczenie:

```text
100 = pełny stan techniczny
0   = maksymalnie zdegradowany stan techniczny
```

`condition` jest stanem aktualnym. Nie używać `durability` jako drugiej nazwy tego samego pola.

Istniejące weapon/item durability oraz trap durability pozostają własnością swoich domen i nie są migrowane do tego modelu. Nie próbować unifikować skali `0..1` itemów/traps z `0..100` structures.

## 3. Shared condition state contract

Wydzielić minimalny współdzielony type dla struktur korzystających z lazy degradation:

```ts
export type ConditionState = {
  condition: number
  lastConditionUpdateAtDays: number
}
```

Umieścić go w małym pure world-domain module, preferencyjnie:

```text
src/world/condition.ts
```

Moduł:

- nie zna Three.js,
- nie zna Vue,
- nie zna Player,
- nie zna NPC,
- nie zna Repair skill,
- nie posiada żadnego world-object state.

`BedrollRecord`, `PlatformRecord`, tent state po `items-player-018` oraz `PlayerWellRecord` mają zachować własne pola; nie wymuszać inheritance ani wrapper objectu.

## 4. Shared condition primitives

`src/world/condition.ts` ma być właścicielem wyłącznie semantyki wspólnej dla realnych consumers.

Dodać:

```ts
export const CONDITION_MAX = 100

export function clampCondition(value: number): number
```

oraz mały helper do jawnej zmiany bieżącego condition:

```ts
export function applyConditionDelta(
  condition: number,
  delta: number,
): number
```

Semantyka:

```text
positive delta → condition rośnie
negative delta → condition maleje
result zawsze 0..100
```

Powód użycia `delta`, a nie wyłącznie `loss`:

- degradation będzie odejmować,
- przyszły repair będzie dodawał,
- condition layer nie powinien wymagać późniejszego redesignu.

Nie dodawać tutaj:

- repair requirements,
- materials,
- work progress,
- skill checks,
- effects,
- thresholds.

## 5. Shared weather exposure

Obecnie `computeRainExposureDays()` jest współdzielone, natomiast snow exposure istnieje lokalnie w `sleepingUtilities.ts`.

Ponieważ camp i future structures będą korzystać z obu, wydzielić snow counterpart do wspólnego world/weather layer.

Docelowy contract:

```ts
computeRainExposureDays(...)
computeSnowExposureDays(...)
```

Oba muszą zachować deterministic result, world-seed/weather-cycle semantics oraz bounded caller-controlled lookback.

Nie tworzyć jeszcze `computeGenericWeatherDamage(...)` ani config-driven weather-effect engine.

Weather module odpowiada za ekspozycję pogodową, a konkretna domena odpowiada za to, ile condition dana ekspozycja kosztuje.

## 6. Generic lazy degradation helper

Camp i well uzasadniają wydzielenie małego pure resolvera dla condition zmieniającego się od czasu/weather.

Dodać do `world/condition.ts` contract koncepcyjnie:

```ts
export type ConditionDecay = {
  passivePerDay?: number
  rainPerExposureDay?: number
  snowPerExposureDay?: number
}

export function resolveCondition(params: {
  state: ConditionState
  nowDays: number
  passiveDays?: number
  rainExposureDays?: number
  snowExposureDays?: number
  decay: ConditionDecay
}): number
```

Resolver:

- nie pobiera world seed sam,
- nie odczytuje weather sam,
- nie zna shelter,
- nie zna rodzaju obiektu,
- nie mutuje recordu.

Caller/domain wcześniej wylicza właściwą ekspozycję.

Dzięki temu:

```text
sleepingUtilities
→ decyduje o shelter factor i weather exposure

playerWell
→ decyduje, jaki typ decay dotyczy studni

condition.ts
→ wykonuje wyłącznie wspólną matematykę condition
```

Nie tworzyć globalnego `ConditionDefinitionRegistry`.

## 7. Bounded lazy simulation

Zachować obecny wzorzec bounded lookback.

Każda domena może posiadać własne `SIM_WINDOW_DAYS` i decay constants, jeżeli wynikają z jej lifecycle.

Nie przenosić wszystkich constants do `condition.ts`.

Shared resolver nie powinien decydować, czy obiekt ma zerować się po 5, 20 czy 100 dniach. To jest balance/domain policy.

## 8. Migrate sleeping utilities onto shared primitives

`world/sleepingUtilities.ts` pozostaje właścicielem:

- bedroll/platform-specific constants,
- shelter semantics,
- rain/snow rates,
- sleeping-utility simulation window,
- spatial relations.

Przestać posiadać własne `SLEEPING_UTILITY_CONDITION_MAX`, `clampCondition()` i `computeSnowExposureDays()`, jeżeli po wydzieleniu mają identyczną semantykę shared.

`resolveSleepingUtilityCondition()` może pozostać publicznym domenowym API.

Nie zmuszać pozostałych callers do używania generic `resolveCondition()` bezpośrednio.

Czyli:

```text
consumer
→ resolveSleepingUtilityCondition(...)
→ shared condition primitives
```

a nie:

```text
consumer
→ generic condition resolver + copied sleeping rules
```

## 9. Preserve `items-player-018` camp semantics

Nie zmieniać balansu condition wprowadzonego przez `items-player-018`.

Zachować:

- tent condition `0..100`,
- tent shelter factor,
- factor-based protection sleeping utilities,
- bedroll contribution based on condition,
- platform contribution based on condition.

Ten plan może refaktoryzować shared math, ale nie powinien zmieniać gameplay outcome campu poza usunięciem duplikacji.

Dodać regression tests, które potwierdzą identyczne wyniki przed/po refaktorze.

## 10. Player well becomes the second structure consumer

Rozszerzyć `PlayerWellRecord` o:

```ts
condition: number
lastConditionUpdateAtDays: number
```

Condition dotyczy wyłącznie funkcjonującej konstrukcji studni, nie postępu jej budowy.

Podczas `pit` / `well` / `roof` construction condition pozostaje `100`. Degradation zaczyna mieć znaczenie dopiero, gdy body studni udostępnia wodę.

Nie mieszać `construction workProgress` z `condition`.

To dwie niezależne osie:

```text
workProgress = czy/z jakim postępem obiekt został zbudowany
condition    = w jakim stanie technicznym jest istniejący obiekt
```

## 11. Well degradation model

V1 studni ma użyć dwóch realnych źródeł wear:

```text
passive time
usage
```

Nie dodawać weather degradation dla well w tym planie.

Powód:

- camp już pokrywa weather-driven degradation,
- well ma potwierdzić drugi potrzebny przypadek: usage wear,
- unikamy projektowania ekspozycji konstrukcji na deszcz/śnieg przed buildings/palisades.

### Passive wear

Completed/water-available well powoli traci condition wraz z czasem.

Domain constants pozostają w `world/playerWell.ts`, np.:

```ts
WELL_CONDITION_DECAY_PER_DAY
WELL_CONDITION_SIM_WINDOW_DAYS
```

Dokładne balance values dobrać podczas implementacji tak, aby normalna studnia wymagała maintenance w skali wielu/kilkunastu world days, a nie po kilku użyciach.

Nie uzależniać passive wear od FPS ani obecności playera.

## 12. Well usage wear

Usage degradation ma być event-driven.

Jednostką usage jest udane pobranie wody ze studni, nie samo spojrzenie/interakcja.

Condition loss następuje wyłącznie po rzeczywistym successful consumption/fill operation, która korzysta z tego well targetu.

Nie naliczać wear:

- przy gaze,
- przy budowaniu `Interactable`,
- przy query `wellWaterSource()`,
- przy nieudanym drink/fill,
- przy anulowaniu.

Wydzielić w `playerWell.ts` domain operation, np.:

```ts
applyWellUseWear(record, nowDays)
```

lub równoważny mały API wynikający z aktualnego lifecycle `PlayerWells`.

Nie mutować `PlayerWellRecord` bezpośrednio z Vue/gameLoop, jeżeli `createPlayerWells.ts` jest obecnym mutation ownerem kolekcji.

## 13. Condition checkpoint semantics

Wprowadzić jasną regułę dla lazy condition + explicit mutation.

Przed każdą explicit zmianą condition:

```text
resolve current lazy condition at nowDays
→ commit resolved condition
→ set lastConditionUpdateAtDays = nowDays
→ apply explicit delta
```

Dotyczy to teraz well usage wear, a później będzie dotyczyć repair, structure damage i maintenance events.

Nie można wykonać:

```text
stored old condition
→ explicit delta
```

bez wcześniejszego rozliczenia elapsed degradation, bo prowadziłoby to do utraty lub podwójnego naliczania wear.

To jest canonical checkpoint rule dla structure condition.

## 14. Well functional consequence

Condition studni musi mieć rzeczywisty gameplay effect już w tym planie.

Nie zmieniać:

- water quality,
- groundwater kind,
- water depth,
- contamination risk wynikającego z roof/body lifecycle.

Condition ma preferencyjnie wpływać na czas korzystania ze studni.

Canonical mapping, jeśli obecny action flow posiada naturalny timed seam:

```text
100 condition → 1.00 × normal duration
  0 condition → 2.00 × normal duration
```

Płynna interpolacja:

```ts
durationMultiplier = 1 + (1 - condition / 100)
```

czyli:

```text
100 → 1.00x
75  → 1.25x
50  → 1.50x
25  → 1.75x
0   → 2.00x
```

Jeżeli obecne drink/fill flow nie posiada timed duration dla studni, nie tworzyć sztucznego nowego Busy Action tylko po to, aby condition miało efekt.

W takim przypadku podczas implementation recon użyć najbliższego istniejącego well-specific measurable cost; jeśli takiego nie ma, preferować `wellWaterSource()` / interaction seam rozszerzony o explicit extraction-efficiency metadata zamiast zmiany water quality.

Nie zmniejszać storage/capacity ani jakości wody.

## 15. `condition = 0`

Shared layer nie nadaje `0` globalnej semantyki `broken`.

Canonical shared meaning:

```text
condition = 0
→ maximally degraded
```

Domena decyduje o konsekwencji.

W tym planie:

- tent/bedroll/platform zachowują semantics z `items-player-018`,
- well nadal istnieje,
- well nadal nie zostaje automatycznie destroyed.

Nie dodawać collapse, destruction, automatic removal, replacement object ani broken mesh/state.

Przyszły repair/maintenance plan może zdecydować, czy konkretne structures przy `0` stają się unusable.

## 16. No persisted condition bands

Nie zapisywać:

```text
good
worn
damaged
critical
broken
```

Condition percentage pozostaje jedynym authoritative state.

Jeżeli UI lub późniejsze NPC maintenance potrzebuje bandów, mają być derived z `condition`.

Nie definiować thresholds w tym planie, ponieważ obecni consumers używają continuous effects.

## 17. Persistence

Rozszerzyć `SavePlayerWell` o:

```ts
condition: number
lastConditionUpdateAtDays: number
```

oraz odpowiednie build/restore paths.

Starszy save bez tych pól powinien przy restore otrzymać:

```text
condition = 100
lastConditionUpdateAtDays = current restored world time
```

Nie naliczać retroaktywnego wear od `day 0`.

Jeżeli obecna save-version policy wymaga schema bump dla required fields, wykonać migrację zgodnie z aktualnym persistence pipeline.

Nie opierać migracji na `?? 100` rozsianym po runtime consumers, jeżeli istnieje canonical normalization/migration seam.

## 18. No persistence of resolved effects

Nie zapisywać:

- duration multiplier,
- condition band,
- maintenance need,
- resolved degradation amount.

Wszystkie są derived.

Persistować tylko authoritative condition state + time anchor.

## 19. Future repair contract

Plan świadomie nie implementuje naprawy, ale ustala contract, który następny plan musi konsumować.

Future repair flow:

```text
resolve current condition
→ checkpoint at nowDays
→ contribute repair
→ increase authoritative condition
→ reset condition anchor
```

Repair nie powinien posiadać własnej kopii structure health.

Nie dodawać jeszcze:

- `RepairDefinition`,
- repair materials,
- repair work progress,
- max workers,
- skill scaling,
- XP.

Te elementy należą do następnego planu.

## 20. `items-player-021` integration boundary

Ten plan nie zna `Repair` skill.

Po jego wdrożeniu `items-player-021` może traktować future structure repair jako zwykły domain-owned targeted action:

```text
select Repair
→ choose Interactable
→ Repair consumer resolves action
→ structure domain mutates its own condition
```

`Repair` skill nie jest właścicielem condition, degradation ani structure lifecycle.

Nie dodawać skill-related fields do `ConditionState` ani `PlayerWellRecord`.

## 21. Future NPC maintenance boundary

Condition musi być możliwe do resolve bez:

- player position,
- camera,
- Vue,
- Interactable.

Późniejsze maintenance systems powinny móc wykonać:

```text
resolve structure condition
+ structure importance
+ ownership/responsibility
+ functional consequence
→ maintenance need
```

Nie tworzyć jednak maintenance need w tym planie.

W szczególności `condition < X` nie może samo automatycznie tworzyć NPC pressure.

## 22. Files and ownership

Expected primary files:

```text
src/world/condition.ts                 NEW
src/world/weather.ts                   shared snow exposure
src/world/sleepingUtilities.ts         migrate shared primitives
src/world/playerWell.ts                well condition rules
src/world/createPlayerWells.ts         authoritative mutation/checkpoint
src/app/interactables.ts               resolved well effect if required
src/app/gameLoop.ts / water actions    successful-use wear integration
src/persistence/saveData.ts            SavePlayerWell
src/persistence/...                    save/restore/migration
```

Po `items-player-018` również odpowiednie tent files mają używać shared condition primitives tam, gdzie semantyka jest identyczna.

Nie przenosić domain balance constants z camp/well do `condition.ts`.

Dodać JSDoc dla ważnych shared/public functions; użyć `@domain world` tam, gdzie pomaga preflight discovery.

## 23. Testing

Dodać tests dla shared primitives:

```text
clamp 0..100
positive/negative delta
passive decay
rain decay
snow decay
combined decay
no negative elapsed time
bounded caller input remains deterministic
```

Camp regression:

```text
same inputs before/after extraction
→ same resolved sleeping utility/tent condition
```

Well:

```text
new well starts at 100
elapsed passive wear resolves deterministically
successful use applies wear exactly once
failed/cancelled operation does not
explicit wear checkpoints previous lazy decay
condition never leaves 0..100
condition changes functional effectiveness
```

Persistence:

```text
condition round-trips
anchor round-trips
old save gets condition 100
old save does not receive retroactive decay
```

Run appropriate unit tests and:

```text
pnpm typecheck
```

Nie uruchamiać manual browser verification — wykonuje je użytkownik.

## Non-goals

Plan nie implementuje:

- Repair skill,
- targeted skill actions,
- player repair,
- camp repair,
- repair materials,
- repair work/progress,
- partial repair,
- multi-worker repair,
- NPC maintenance,
- household/settlement maintenance responsibility,
- maintenance jobs,
- maintenance economy,
- repair professions,
- building condition rollout,
- settlement storage condition,
- palisade condition,
- standing torch condition,
- generic tool durability,
- weapon repair,
- trap repair,
- structure combat damage,
- destruction/collapse,
- damaged visual variants,
- generic building framework,
- global condition manager.

## Follow-ups

Recommended order:

```text
items-player-018
    ↓
world-020 — THIS PLAN
    ↓
follow-up: repair/maintenance work foundation
    ↓
items-player-021 — targeted skill actions + Repair
    ↓
items-player-019 — player camp repair, revised to use Repair
    ↓
future NPC/household/settlement autonomous maintenance
```

Po utworzeniu follow-up repair/maintenance work foundation:

- dodać go jako dependency `items-player-021`, jeśli targeted Repair vertical slice ma korzystać z realnego repair contractu,
- poprawić `items-player-019`, usuwając camp-specific ownership naprawy przez `Survival`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

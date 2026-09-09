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

Rozszerzyć istniejący player-camp condition model do małego, współdzielonego fundamentu dla trwałych world structures i ich naprawialnych komponentów.

Fundament ma zapewnić:

```text
persistent world-owned condition
+ elapsed world time
+ environmental exposure
→ current condition
→ domain-owned functional consequence
```

Pierwszym istniejącym consumerem pozostaje player camp:

- tent,
- bedroll,
- raised sleeping platform.

Pierwszym nowym consumerem ma być **daszek completed player-built well**.

V1 nie degraduje całej studni:

```text
pit / well body / water source
→ brak condition w V1

completed roof
→ condition
→ weather/time degradation
→ reduced protection
```

Plan nie implementuje jeszcze naprawy. Ma przygotować jednoznaczny authoritative condition model, który później wykorzystają:

- `world-021` repair work foundation,
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

Plan ma wydzielić tylko semantykę potwierdzoną przez camp + well roof, zamiast projektować kompletny framework dla hipotetycznych przyszłych struktur.

Nie tworzyć:

- `ConditionManager`,
- `DurabilityManager`,
- globalnego registry condition-enabled objects,
- globalnego per-frame update loop,
- generic `Building`,
- generic `StructureEntity`,
- generic component-condition framework.

## 2. Canonical terminology

Dla trwałych world structures i ich repairable components canonical current-state value to:

```ts
condition: number // 0..100
```

Znaczenie:

```text
100 = pełny stan techniczny
0   = maksymalnie zdegradowany stan techniczny
```

`condition` jest stanem aktualnym. Nie używać `durability` jako drugiej nazwy tego samego pojęcia.

Condition może należeć do całego obiektu albo do konkretnego komponentu, zależnie od domain ownership. Nie zakładać, że każdy złożony structure ma jedno globalne `structureCondition`.

Istniejące weapon/item durability oraz trap durability pozostają własnością swoich domen i nie są migrowane do tego modelu. Nie próbować unifikować skali `0..1` itemów/traps z `0..100` structures.

## 3. Shared condition state contract

Wydzielić minimalny współdzielony type dla state korzystającego z lazy degradation:

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

`BedrollRecord`, `PlatformRecord`, tent state po `items-player-018` oraz well roof state mają zachować własny domain-owned storage layout.

Nie wymuszać inheritance, wrapper objectu ani osobnego komponentowego frameworku tylko po to, aby współdzielić condition math. Podczas implementacji wybrać najprostszy layout zgodny z aktualnym `PlayerWellRecord` i persistence.

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

Ponieważ camp i well roof będą korzystać z weather-driven degradation, wydzielić snow counterpart do wspólnego world/weather layer.

Docelowy contract:

```ts
computeRainExposureDays(...)
computeSnowExposureDays(...)
```

Oba muszą zachować deterministic result, world-seed/weather-cycle semantics oraz bounded caller-controlled lookback.

Nie tworzyć jeszcze `computeGenericWeatherDamage(...)` ani config-driven weather-effect engine.

Weather module odpowiada za ekspozycję pogodową, a konkretna domena odpowiada za to, ile condition dana ekspozycja kosztuje.

## 6. Generic lazy degradation helper

Camp i well roof uzasadniają wydzielenie małego pure resolvera dla condition zmieniającego się od czasu/weather.

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

Exact API może zostać uproszczone podczas implementacji, jeśli `passiveDays` okaże się redundantne wobec `state` + `nowDays`; zachować jednak separację shared math od domain exposure policy.

Resolver:

- nie pobiera world seed sam,
- nie odczytuje weather sam,
- nie zna shelter/protection,
- nie zna rodzaju obiektu,
- nie mutuje recordu.

Caller/domain wcześniej wylicza właściwą ekspozycję.

Dzięki temu:

```text
sleepingUtilities
→ decyduje o shelter factor i weather exposure

playerWell
→ decyduje o roof exposure i roof decay rates

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

## 10. Well roof becomes the second structure consumer

Player-built well ma w V1 condition wyłącznie dla completed roof componentu.

Semantycznie record musi przechowywać:

```text
roof condition: 0..100
roof condition time anchor
```

Exact storage layout (`roofCondition` + `lastRoofConditionUpdateAtDays` albo małe domain-owned grouping) ustalić podczas implementacji na podstawie aktualnego `PlayerWellRecord` i persistence. Nie wprowadzać generic component frameworku.

Lifecycle:

```text
pit stage
→ no roof condition

well body available
→ water source działa, brak roof condition effect

roof completed
→ roof condition starts at 100
→ roof degradation becomes active
```

Nie mieszać construction `workProgress` z roof condition.

To niezależne osie:

```text
workProgress   = postęp budowy aktualnego stage
roof condition = stan techniczny istniejącego daszku
```

Body studni, pit i groundwater pozostają niezniszczalne w V1.

## 11. Well roof degradation model

V1 daszku ma użyć realnego weather/time degradation zgodnego z charakterem drewnianego exposed componentu.

Źródła wear:

```text
elapsed world time
rain exposure
snow exposure
```

Nie dodawać usage wear od pobierania wody.

Pobranie wody:

- nie uszkadza well body,
- nie uszkadza roof,
- nie powoduje explicit condition mutation.

Domain constants pozostają w `world/playerWell.ts`, np. semantycznie:

```ts
WELL_ROOF_PASSIVE_DECAY_PER_DAY
WELL_ROOF_RAIN_DECAY_PER_DAY
WELL_ROOF_SNOW_DECAY_PER_DAY
WELL_ROOF_SIM_WINDOW_DAYS
```

Exact names i balance values dobrać podczas implementacji po porównaniu z tent/sleeping utility rates.

Daszek powinien być bardziej trwały niż improwizowane camp utilities i wymagać maintenance w skali wielu/kilkunastu world days, nie po pojedynczych weather events.

Nie uzależniać wear od FPS, player position, camera ani renderowania studni.

## 12. Well roof condition resolution

Wydzielić domain-owned resolver, koncepcyjnie:

```ts
resolveWellRoofCondition(record, nowDays, weatherContext)
```

lub równoważny API dopasowany do aktualnej architektury.

Resolver:

- używa shared condition primitives,
- korzysta z deterministic rain/snow exposure,
- zachowuje bounded simulation window,
- nie mutuje recordu,
- nie zna Player/UI/Interactable.

Jeżeli roof nie istnieje, nie udawać condition `100`; brak componentu i condition `100` to różne stany.

## 13. Condition checkpoint semantics

Wprowadzić jasną regułę dla lazy condition + future explicit mutation.

Przed każdą explicit zmianą condition:

```text
resolve current lazy condition at nowDays
→ commit resolved condition
→ set condition time anchor = nowDays
→ apply explicit delta / domain mutation
```

`world-020` sam nie wymaga explicit wear event dla well roof, ale ustala tę regułę dla `world-021` repair oraz przyszłych damage/maintenance events.

Nie można wykonać:

```text
stored old condition
→ explicit delta
```

bez wcześniejszego rozliczenia elapsed degradation, bo prowadziłoby to do utraty lub podwójnego naliczania wear.

To jest canonical checkpoint rule dla structure/component condition.

## 14. Well roof functional consequence

Roof condition musi mieć rzeczywisty gameplay effect już w tym planie.

Nie wpływa na:

- groundwater kind,
- water depth,
- bazową jakość źródła,
- czas pobierania wody,
- storage/capacity.

Condition określa skuteczność ochronną istniejącego daszku.

Preferowana continuous semantics:

```ts
roofProtectionFactor = roofCondition / 100
```

czyli:

```text
100 → pełna ochrona daszku
75  → 75% ochrony
50  → 50% ochrony
25  → 25% ochrony
0   → brak ochrony
```

Wpiąć ten factor w istniejący roof-protection / contamination-risk seam, zamiast tworzyć równoległy water-quality system.

Jeżeli aktualny kod ma binarną semantykę `roof present → protected`, rozszerzyć ją minimalnie do factor-based protection, zachowując obecny ownership contamination/water-resolution logic.

Nie przenosić contamination state do condition module.

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
- well roof nadal istnieje,
- roof przy `0` daje `0` protection,
- well body/water source nie są automatycznie destroyed.

Nie dodawać collapse, destruction, automatic removal, replacement object ani broken mesh/state.

`world-021` może naprawić ten sam roof component bez tworzenia osobnego reconstruction modelu.

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

Rozszerzyć `SavePlayerWell` o authoritative roof condition state i jego time anchor, zgodnie z layoutem wybranym dla `PlayerWellRecord`.

Semantycznie persisted data musi zachować:

```text
roof condition
last roof condition update time
```

Dla starszego save bez tych pól:

```text
completed roof
→ roof condition = 100
→ anchor = current restored world time

no completed roof
→ no active roof-condition lifecycle yet
```

Nie naliczać retroaktywnego wear od `day 0`.

Jeżeli obecna save-version policy wymaga schema bump dla required fields, wykonać migrację zgodnie z aktualnym persistence pipeline.

Nie opierać migracji na rozsianych runtime defaults, jeżeli istnieje canonical normalization/migration seam.

## 18. No persistence of resolved effects

Nie zapisywać:

- roof protection factor,
- condition band,
- maintenance need,
- resolved degradation amount,
- weather exposure history jako duplicated derived state.

Persistować tylko authoritative condition state + time anchor.

## 19. `world-021` repair contract

Plan świadomie nie implementuje naprawy, ale ustala contract konsumowany przez `world-021-world-structure-repair-work-foundation.md`.

Repair flow:

```text
resolve current roof condition
→ validate repair intent/materials
→ checkpoint resolved condition at nowDays
→ create persistent repair episode
→ contribute repair work
→ restore authoritative roof condition
→ reset condition anchor
```

Condition layer nie posiada własnego repair progress ani material requirements.

Nie dodawać w `world-020`:

- `RepairProgress`,
- repair materials,
- repair work,
- max workers,
- skill scaling,
- XP.

Te elementy należą do `world-021` lub późniejszych integrations.

## 20. `items-player-021` integration boundary

Ten plan nie zna `Repair` skill.

Późniejszy targeted Repair może traktować structure/component repair jako zwykły domain-owned action:

```text
select Repair
→ choose Interactable
→ skill/action layer resolves capability
→ structure domain mutates its own repair/condition state
```

`Repair` skill nie jest właścicielem condition, degradation ani structure lifecycle.

Nie dodawać skill-related fields do `ConditionState` ani well recordu.

`items-player-021` nie musi technicznie zależeć od tego planu, dopóki jego vertical slice nie wymaga rzeczywistego structure repair targetu.

## 21. Future NPC maintenance boundary

Condition musi być możliwe do resolve bez:

- player position,
- camera,
- Vue,
- Interactable.

Późniejsze maintenance systems powinny móc wykonać:

```text
resolve component condition
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
src/world/playerWell.ts                roof condition/degradation/protection rules
src/world/createPlayerWells.ts         authoritative roof-condition checkpoint if needed
src/app/interactables.ts               only if existing well protection lookup requires adapter
src/persistence/saveData.ts            persisted roof condition state
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

Well roof:

```text
no roof → no roof-condition lifecycle
newly completed roof starts at 100
elapsed passive/weather wear resolves deterministically
water usage does not mutate roof condition
condition never leaves 0..100
100 condition gives full protection
50 condition gives half protection
0 condition gives no roof protection
well body/water source are not destroyed by roof condition
```

Persistence:

```text
roof condition round-trips
roof condition anchor round-trips
old completed roof gets condition 100
old save does not receive retroactive decay
unfinished/no-roof well does not gain fake roof condition semantics
```

Run appropriate unit tests and:

```text
pnpm typecheck
```

Nie uruchamiać manual browser verification — wykonuje je użytkownik.

Nie uruchamiać manualnie `pnpm docs:sync`; GitHub workflow wykonuje docs sync automatycznie.

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
- well-body degradation,
- well-body repair,
- pit degradation,
- well usage wear,
- well extraction-duration penalty,
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
- generic building/component framework,
- global condition manager.

## Follow-ups

Recommended sequencing:

```text
items-player-018
    ↓
world-020 — THIS PLAN
    ↓
world-021 — structure repair work foundation
```

`world-021` consumes the roof condition/checkpoint semantics established here.

Further integrations can then reuse the same foundations without becoming hard dependencies of one another where not required:

```text
world-021 ─────→ items-player-019 camp repair revision
      ╲
       ╲ future real Repair integration
        → items-player-021 targeted skill actions

npc-028 + world-021
        ↓
future repair Work Contracts
        ↓
NPC / household / settlement autonomous maintenance
```

Jeżeli `items-player-021` zostanie później rozszerzony tak, aby jego vertical slice wymagał realnego structure repair targetu, dopiero wtedy dodać odpowiednią dependency.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
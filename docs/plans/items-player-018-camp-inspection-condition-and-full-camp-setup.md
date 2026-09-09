# Plan: Camp inspection, condition and full camp setup

**Created:** 2026-09-06
**Status:** `verification needed` 🔍
**Implemented at:** 2026-09-09
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** ui-input-010
**Domain:** `items-player`
**Subdomains:** `items` `interaction` `player-needs`
**Tags:** `camp` `rest` `weather` `placement`
**Roadmap:** -

## Goal

Rozwinąć istniejący player camp tak, aby condition namiotu, bedrolla i platformy był mechanicznie istotny, inspection pokazywało rzeczywisty breakdown jakości odpoczynku, a Quick Action `Rozbij pełny obóz` przygotowywał najlepszy dostępny setup z istniejących world objects i materiałów.

Nie tworzyć osobnego `CampManager`, `CampEntity`, persistent camp membership ani drugiego systemu komfortu. Camp pozostaje derived state:

```text
tent + bedroll + platform + fire + condition
→ CampRestContext / CampRestSnapshot
→ campRestQuality()
→ faktyczny efekt odpoczynku
```

## Existing architecture to preserve

Reuse obecne mechanizmy:

- `PlacedTents`,
- `sleepingUtilities` (bedroll + platform),
- `PlacedFires` / `VillageFire`,
- `app/campRest.ts` jako canonical owner camp quality,
- `restActions.ts` jako obecny consumer jakości odpoczynku,
- `resolveSleepingUtilityCondition()` jako lazy weather-driven condition model,
- `tentPlacement.ts` oraz wspólny placement preview/validation,
- generic `FlavorDialog`,
- `PlayerIntentController` z `ui-input-010`.

Nie zapisywać `comfort`, camp membership ani derived snapshotu do SaveData.

## 1. Canonical camp snapshot

Wydzielić obecne zbieranie camp contextu z `restActions.ts` do jednego reusable resolvera niezależnego od Vue.

Resolver ma być używany przez:

- normalny camp rest,
- tent rest,
- tent/camp inspection,
- full-camp intent przy rozpoznawaniu istniejących komponentów.

Snapshot powinien zawierać co najmniej:

- canonical `CampRestContext`,
- final `quality`,
- resolved tent condition,
- resolved bedroll condition,
- resolved supporting-platform condition,
- fire presence/state,
- dane/contributions potrzebne do wyjaśnienia quality w UI.

Breakdown w UI musi być wyprowadzony z tego samego calculation path co faktyczny sleep outcome. Nie kopiować constants ani formulas do Vue.

### Anchor semantics

- normalny rest: anchor = faktyczne miejsce odpoczynku zgodnie z obecnym flow,
- tent inspection: anchor = pozycja inspectowanego namiotu,
- full-camp intent: anchor = pierwszy zaakceptowany sleeping-related component i pozostaje transient tylko na czas intencji.

## 2. Tent condition

Rozszerzyć `PlacedTent` o:

```ts
condition: number
lastConditionUpdateAtDays: number
```

Zasady:

- zakres `0..100`,
- nowy namiot = `100`,
- condition należy do authoritative world state namiotu,
- persistuje się w SaveData,
- jest lazy-resolved i deterministyczny,
- nie zależy od FPS, streamingu, player distance ani kamery,
- `0%` nie usuwa namiotu automatycznie.

Nie dodawać repair action w tym planie, ale representation ma pozostać gotowa na późniejszą naprawę poprzez zapisany `condition` field.

## 3. Shared weather-driven condition model

Nie tworzyć osobnego zegara degradacji dla namiotu.

Utrzymać istniejący model sleeping utilities:

```text
stored condition
+ lastConditionUpdateAtDays
+ current world time
+ weather exposure
→ resolved current condition
```

Reuse istniejące weather helpers i bounded lazy simulation. Wspólne pure helpery condition/weather exposure wydzielić tylko tam, gdzie faktycznie usuwają duplikację między tent i sleeping utilities.

Tent degraduje się wyłącznie od bezpośredniej ekspozycji na deszcz/śnieg w tym planie:

- clear/cloudy/fog → brak weather decay,
- rain → decay,
- snow → decay,
- brak dodatkowego passive wear.

Tent ma być bardziej odporny od odsłoniętego bedrolla/platformy. Dodać pojedyncze domenowe tent rain/snow decay constants w tej samej skali co istniejące sleeping-utility rates; nie zmieniać istniejących utility rates bez potrzeby.

## 4. Shelter effectiveness

Condition namiotu ma wpływać płynnie, bez progów:

```text
tentShelterFactor = clamp(tentCondition / 100, 0, 1)
```

Przykłady:

```text
100% → 1.00
75%  → 0.75
30%  → 0.30
0%   → 0.00
```

Nie utrzymywać niezależnego boolean `hasTent` jako authoritative wejścia do quality tam, gdzie potrzebna jest efektywność shelter.

## 5. Tent protection of sleeping utilities

Obecny binary `sheltered: boolean` w condition resolverze sleeping utilities zastąpić factor-based ochroną `0..1`.

Efektywna ekspozycja:

```text
effectiveWeatherExposure = rawWeatherExposure × (1 - tentShelterFactor)
```

Czyli:

- brak namiotu / tent 0% → 100% exposure,
- tent 50% → 50% exposure,
- tent 100% → 0% exposure.

Nie utrzymywać równolegle boolean i factor jako dwóch źródeł prawdy.

## 6. Bedroll condition

Zachować istniejący model bedrolla:

```text
bedroll contribution × bedrollCondition / 100
```

`100%` ma zachować obecny balans, `0%` daje zero bedroll bonusu, ale obiekt nadal istnieje w świecie.

## 7. Platform condition

Domknąć istniejący loose end: platform condition ma rzeczywiście wpływać na raised-bedroll bonus.

Obecny model:

```text
no platform = raisedFactor 0.75
platform    = raisedFactor 1.00
```

Zmienić na:

```text
raisedFactor = 0.75 + (1.00 - 0.75) × platformCondition / 100
```

Semantyka:

- brak supporting platform → `0.75`,
- supporting platform 0% → `0.75`,
- 50% → `0.875`,
- 100% → `1.00`.

Platforma bez supporting bedroll nadal nie daje samodzielnego comfort bonusu. Relacja bedroll ↔ platform pozostaje spatially resolved; nie dodawać persisted `platformId`.

## 8. Tent contribution to camp quality

Nie mnożyć całego `campRestQuality` przez tent condition. Condition namiotu ma interpolować tylko shelter contribution pomiędzy istniejącymi wariantami bez namiotu i z pełnym namiotem.

Utrzymać obecne balance endpoints:

### No blanket

```text
rough 0.40 → tentOnly 0.70
```

### Blanket, no fire

```text
blanket 0.55 → blanketTent 0.80
```

### Blanket + fire

```text
blanketFire 0.75 → full 1.00
```

Dla każdego przypadku:

```text
withoutTent + (fullTent - withoutTent) × tentShelterFactor
```

W efekcie:

- tent 100% zachowuje dotychczasowy balans,
- tent 0% daje dokładnie wynik bez namiotu,
- wartości pośrednie są płynne.

Bedroll/platform contribution dodawać zgodnie z istniejącą kolejnością calculation. Survival compensation stosować dopiero do wynikowego base quality tak jak obecnie.

## 9. CampRestContext evolution

`CampRestContext` ma reprezentować realne contributions zamiast binarnej obecności tam, gdzie condition jest mechaniczny. Docelowo powinien nieść co najmniej:

```ts
hasBlanket: boolean
hasWarmFire: boolean
tentCondition: number
bedrollCondition: number
platformCondition: number
```

`platformCondition = 0` oznacza brak efektywnego supporting-platform contribution. Jeżeli implementacja potrzebuje lokalnych booleans podczas spatial resolution, nie mogą być niezależnym authoritative input do `campRestQuality`.

## 10. Camp quality breakdown

Canonical camp calculation ma umożliwiać inspection wyjaśnienie wyniku bez powielania mechaniki.

Modal powinien móc pokazać np.:

```text
Bazowe miejsce odpoczynku    55%
Namiot 82%                  +...
Ognisko                     +...
Posłanie 71%                +...
Platforma 63%               +...
Survival                    +...
--------------------------------
Komfort                      91%
```

Nie wymuszać sztucznie całkowicie additive UI, jeśli część contributions jest interakcyjna. Ważny invariant:

```text
UI explanation and actual sleep outcome must agree.
```

## 11. Tent inspection

Zmienić interaction własnego namiotu na:

```text
[E] Odpocznij
[R] Zbadaj
```

`[E]` zachowuje szybki istniejący rest flow.

`[R]` otwiera inspection przez istniejący `FlavorDialog`; nie tworzyć osobnego `TentModal.vue`.

### Modal

Title:

```text
To twój namiot
```

Pokazać:

- tent condition,
- wykryte elementy camp snapshotu,
- bedroll condition,
- supporting platform condition,
- fire state (`rozpalone` / `zgaszone`, brak można pominąć),
- final comfort,
- meaningful breakdown contributions, w tym wpływ Survival, jeśli zmienił wynik.

Modal nie oblicza quality ani condition samodzielnie.

### Actions

- `Odpocznij`,
- `Złóż namiot`,
- `Zamknij`.

`Odpocznij` reuse istniejący rest flow. `Złóż namiot` reuse `packTent()` i zamyka modal po sukcesie.

Repair pozostaje poza scope.

## 12. Rename existing bivouac action

Obecna Quick Action:

```text
Rozbij obóz (8h)
```

nie buduje world camp. Zmienić wyłącznie label na:

```text
Śpij na biwaku (8h)
```

Nie zmieniać jej dotychczasowej mechaniki blanket/bivouac sleep.

## 13. Full camp Quick Action

Dodać:

```text
Rozbij pełny obóz
```

Semantyka:

> Przygotuj najlepszy dostępny legalny zestaw do odpoczynku z tego, co aktualnie mam, reuse istniejące odpowiednie elementy player camp i budując brakujące.

Reuse `PlayerIntentController` z `ui-input-010`. Nie tworzyć drugiego sequencera ani generic workflow engine.

## 14. Full-camp composition policy

Rozpatrywać komponenty w ustalonej kolejności:

1. tent,
2. platform,
3. bedroll,
4. fire.

Powód: tent ustala shelter, platforma przygotowuje support dla bedrolla, bedroll jest właściwą sleeping surface, fire nie definiuje sleeping anchor.

Każdy komponent jest opcjonalny, jeżeli nie jest dostępny. Intent próbuje przygotować najlepszy możliwy setup bez auto-craftingu brakujących materiałów.

Przykłady:

```text
tent + platform + bedroll + fire → wszystkie cztery
tent + bedroll + fire            → bez platformy
bedroll + fire                   → bez namiotu
tent + fire                      → legalne, jeśli istniejący tent-rest nadal pozwala odpocząć bez bedrolla/blanketu
```

Intent nie startuje tylko wtedy, gdy po uwzględnieniu istniejącego nearby camp oraz inventory/materials nie da się przygotować żadnego legalnego miejsca odpoczynku.

## 15. Existing component reuse

Przed placementem każdego komponentu ponownie resolve canonical camp snapshot/world state wokół anchor.

Jeżeli odpowiedni player-built component już istnieje i spełnia właściwe spatial rules:

```text
reuse → nie buduj duplikatu
```

Nie przesuwać ani nie teleportować istniejących world objects.

Jeżeli np. bedroll już istnieje, a późniejsze wstawienie platformy pod niego nie jest legalne przez obecne placement rules, pominąć platformę zamiast przebudowywać camp automatycznie.

Nie uznawać settlement-owned infrastructure za komponent „zbudowany” przez full-camp intent, nawet jeśli normalny rest system wykorzystuje ją gdzie indziej.

## 16. Placement flow

Każdy nowy komponent korzysta z istniejącego:

- placement preview,
- ground validation,
- collision/occupied validation,
- confirm/cancel lifecycle.

Nie auto-place.

Flow:

```text
start full camp
→ resolve existing components
→ place tent if needed
→ confirm
→ place platform if possible/needed
→ confirm
→ place bedroll if needed
→ confirm
→ place fire if needed
→ confirm
→ ignite if needed
→ done
```

Po confirm intent automatycznie przechodzi do kolejnego etapu. Nie wymaga ponownego kliknięcia Quick Action.

## 17. Spatial coherence

Pierwszy sensowny sleeping-related component ustala transient anchor.

Preferencja anchoru:

1. existing tent przy graczu,
2. existing bedroll przy graczu,
3. newly placed tent,
4. pierwszy newly placed platform/bedroll, jeśli namiot nie jest dostępny.

Kolejne placements mają pozostać w istniejących meaningful camp/rest radii. Reuse odpowiednie canonical constants zamiast tworzyć persistent `campRadius`:

- tent shelter radius,
- bedroll rest radius,
- bedroll/platform support radius,
- warm fire radius.

## 18. Fire handling

Jeżeli przy anchor istnieje odpowiedni player-built fire:

```text
lit   → reuse
unlit → ignite
```

Jeżeli nie istnieje:

```text
existing fire placement → user confirms → ignite if required
```

Ignition reuse `SurvivalActions.startIgniteFire()` i nie omija:

- fuel,
- fire-starting capability,
- Busy Action,
- XP,
- actual fire state.

Jeżeli ignition zostanie przerwane lub nie może się rozpocząć, intent kończy się. Już postawione komponenty pozostają.

## 19. Cancellation, partial camp and revalidation

Anulowanie dowolnego placementu lub Busy Action kończy full-camp intent.

Nie wykonywać rollbacku. Już postawione obiekty są prawdziwymi world changes i pozostają w świecie.

Przed każdym kolejnym krokiem ponownie czytać authoritative state:

- inventory/materials,
- nearby components,
- placement validity,
- fire state,
- blocking state.

Jeżeli późniejszy opcjonalny komponent stał się niedostępny, pominąć go i kontynuować. Jeżeli dalsza część nie ma już sensu, zakończyć bez retry loop.

## 20. Quick Actions availability

Vue ma wykonywać wyłącznie tanie availability checks. Nie wykonywać proximity scans ani camp snapshot resolution w render/computed tylko dla enabled state.

Pełna walidacja nearby camp, placement i fire następuje po uruchomieniu intentu.

Vue nie posiada:

- camp composition logic,
- placement decisions,
- condition formulas,
- comfort formulas.

## 21. Persistence

Persistować tylko authoritative world state.

### Tent

```text
id
x
z
yaw
condition
lastConditionUpdateAtDays
```

Bedroll/platform i fires pozostają w swoich istniejących persistence contracts, poza koniecznymi kompatybilnymi zmianami wynikającymi z factor-based shelter resolution.

Nie persistować:

- `CampRestSnapshot`,
- final quality,
- camp membership,
- transient anchor,
- active full-camp intent.

Po loadzie częściowo zbudowany camp istnieje jako normalny zestaw world objects; intent nie jest wznawiany.

## 22. Tests

### Tent condition

Sprawdzić:

1. fresh tent = 100,
2. deterministic lazy weather decay,
3. rain/snow decay,
4. save/load,
5. brak per-frame/camera dependency,
6. tent 0% pozostaje world object,
7. tent 0% daje shelter factor 0,
8. tent 100% daje shelter factor 1.

### Utility weather protection

Dla rain i snow sprawdzić:

```text
no tent / tent 0% → 100% exposure
tent 50%           → 50% exposure
tent 100%          → 0% exposure
```

### Camp-quality regression

Dla pełnego condition zachować istniejące balance endpoints i Survival semantics:

- rough,
- blanket,
- blanket + fire,
- tent-only,
- blanket + tent,
- full,
- bedroll bonus,
- raised-bedroll bonus,
- Survival compensation.

### Tent interpolation

Sprawdzić co najmniej `0%`, `50%`, `100%` dla:

- rough → tentOnly,
- blanket → blanketTent,
- blanketFire → full.

### Platform interpolation

Sprawdzić:

- no platform,
- platform 0%,
- platform 50%,
- platform 100%.

### Camp snapshot

Sprawdzić kombinacje:

- tent only,
- degraded tent,
- bedroll only,
- degraded bedroll,
- platform + bedroll,
- degraded platform,
- fire lit/unlit,
- full setup,
- Survival modifier.

Snapshot quality musi być identyczne z quality faktycznie używanym przez sleep outcome dla tego samego contextu.

### Full-camp intent

Sprawdzić:

1. wszystkie komponenty dostępne,
2. brak materiałów na tent,
3. brak materiałów na platformę,
4. brak materiałów na bedroll,
5. existing tent reuse,
6. existing bedroll reuse,
7. existing lit fire,
8. existing unlit fire,
9. cancel placement,
10. ignite failure/interruption,
11. inventory mutation między krokami,
12. partial camp pozostaje,
13. brak duplikowania istniejącego odpowiedniego komponentu.

## 23. Manual verification

User wykonuje browser verification.

Sprawdzić ręcznie:

- `[E]` przy namiocie nadal rozpoczyna szybki rest,
- `[R]` otwiera inspection właściwego namiotu,
- tent condition zmienia rzeczywisty comfort,
- tent condition zmienia weather protection bedroll/platform,
- platform condition faktycznie zmienia comfort,
- modal breakdown zgadza się z faktycznym sleep outcome,
- `Śpij na biwaku (8h)` działa jak poprzednie `Rozbij obóz (8h)`,
- `Rozbij pełny obóz` reuse istniejące elementy,
- nowe elementy przechodzą istniejący placement preview/validation,
- cancel zostawia partial setup,
- save/load zachowuje tent condition.

AI agent nie wykonuje browser verification.

## 24. Documentation and implementation notes

Po implementacji zaktualizować canonical docs dotyczące:

- player camps,
- sleeping utilities,
- rest comfort,
- tent persistence,
- Quick Actions.

Dodać implementation notes zgodnie z `docs/plans/PLANNING.md`.

Istotne nowe/zmienione pure domain APIs powinny dostać JSDoc opisujący:

- ownership,
- lazy condition semantics,
- condition range,
- shelter-factor invariant,
- snapshot derived-state semantics.

Użyć `@domain items-player`, jeśli odpowiada obecnym conventions.

Nie uruchamiać ręcznie `pnpm docs:sync`; derived plan/docs indexes aktualizuje workflow.

## Out of scope

- repair tent/bedroll/platform,
- auto-destruction przy 0% condition,
- `CampManager` / `CampEntity` / persistent camp membership,
- player-owned camp territory,
- NPC camp building/inspection,
- crafting/recipe redesign,
- automatic placement,
- automatic repositioning istniejących camp objects,
- rollback częściowo zbudowanego camp,
- persistence aktywnego player intent,
- generic workflow/task engine,
- decorative camp furniture,
- multiplayer ownership.

## Completion criteria

Plan jest zakończony, gdy:

- tent posiada persistent lazy-resolved condition,
- tent condition płynnie wpływa na shelter contribution,
- tent condition płynnie redukuje weather exposure sleeping utilities,
- bedroll zachowuje istniejący condition-based bonus,
- platform condition faktycznie wpływa na raised-bedroll bonus,
- full-condition setup zachowuje obecne rest balance endpoints,
- jeden canonical camp snapshot zasila inspection i realny rest outcome,
- `[R]` przy namiocie otwiera inspection, a `[E]` zachowuje szybki rest,
- modal pokazuje rzeczywisty condition i breakdown komfortu,
- `Rozbij obóz (8h)` jest przemianowane na `Śpij na biwaku (8h)` bez zmiany mechaniki,
- `Rozbij pełny obóz` reuse `PlayerIntentController` z `ui-input-010`,
- intent reuse/build najlepszy dostępny legalny setup,
- każdy placement korzysta z istniejącego placement framework,
- partial camp pozostaje po anulowaniu,
- nie powstał drugi camp/comfort system,
- automated tests przechodzą,
- implementation notes i canonical docs są aktualne.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
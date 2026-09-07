# Implementation Notes: items-player-018 — Camp inspection, condition and full camp setup

## Najważniejszy preflight

- `items-player-018` **realnie jest zablokowany przez `ui-input-010`**. Na `main` plan `ui-input-010-player-quick-actions-and-primary-weapon-slots.md` nadal ma status `planned`, a w kodzie nie istnieje jeszcze `PlayerIntentController`.
- Nie implementować dla tego planu drugiego sequencera. Po wdrożeniu `ui-input-010` najpierw sprawdzić jego faktyczne API i dopiero do niego dołożyć intent full-camp.
- Szczególnie ważny seam: obecne `placementPreviewActions.ts` po confirm robi `exit()` i wywołuje `void` mutation (`placeTentAtAim()`, `placeBedrollAtAim()`, itd.). Sam preview nie raportuje intentowi success/cancel, a placement często kończy się dopiero po `busy.start(...)`. `ui-input-010` musi dostarczyć/ustalić mechanizm kontynuacji po placement/Busy Action; `items-player-018` powinien go tylko reuse.

## Canonical camp calculation

Aktualnie:

- `src/app/campRest.ts` jest czystym ownerem `CampRestContext` + `campRestQuality()`;
- `src/app/actions/restActions.ts` posiada lokalne `resolveCampContext()`, zakotwiczone wyłącznie w bieżącej pozycji gracza;
- inspection i full-camp nie powinny kopiować tej logiki.

Wydziel jeden reusable resolver snapshotu poza Vue, ale zachowaj rozdział odpowiedzialności:

- `campRest.ts` — pure calculation/breakdown,
- resolver snapshotu — spatial lookup + odczyt world state/condition,
- `restActions.ts`, inspection i intent — konsumenci.

Resolver powinien przyjmować jawny anchor `(x,z)`, a nie czytać kamerę ani na sztywno `player.mesh.position`. Snapshot może nieść ids/records potrzebne do dalszych kroków, ale nie może stać się nowym persistent `CampEntity`.

Najlepiej rozszerzyć pure calculation tak, aby zwracało również breakdown używany przez UI. Nie licz różnicy poprzez ponowne odpalanie kilku wariantów `campRestQuality()` w Vue.

## Aktualna mechanika quality, którą trzeba zachować

`src/app/campRest.ts` dziś ma:

- base tiers: rough `0.40`, tentOnly `0.70`, blanket `0.55`, blanketTent `0.80`, blanketFire `0.75`, full `1.00`;
- bedroll jako additive bonus;
- Survival dopiero po `Math.min(1, base + bedrollBonus)`;
- `WARM_FIRE_RADIUS = 6`, `TENT_SHELTER_RADIUS = 4`.

Plan powinien ewoluować te same wzory, nie zastępować ich nowym comfort systemem. Szczególnie zachować kolejność: base/tent interpolation → bedroll/platform bonus → clamp → Survival compensation.

Obecny `hasRaisedBedroll?: boolean` jest loose endem: platform condition nie wpływa na quality. Przy zmianie zastąpić go realnym `platformCondition`; nie trzymać równolegle booleana jako drugiego authoritative input.

## Sleeping utilities i condition

Relevant files:

- `src/world/sleepingUtilities.ts`
- `src/world/createSleepingUtilities.ts`
- `src/app/actions/restActions.ts`

Bedroll/platform już mają persisted:

```ts
condition
lastConditionUpdateAtDays
```

oraz lazy `conditionOf(id, worldDays, sheltered)` → `resolveSleepingUtilityCondition()`.

Przy factor-based shelter zmienić ten contract na factor `0..1` zamiast boolean. Jeden helper powinien obsługiwać ten sam sposób weather exposure dla bedroll/platform/tent; nie duplikować rain/snow integration.

Istotna istniejąca semantyka: degradation używa bounded lookback (`SLEEPING_UTILITY_SIM_WINDOW_DAYS = 10`) i **aktualnego** shelter odczytanego w chwili resolve dla całego analizowanego odcinka. Repo nie przechowuje historii postawienia/złożenia namiotu. Zachować ten model albo świadomie zmienić go wspólnie dla utilities + tent — nie tworzyć history log tylko dla namiotu.

Platform condition trzeba resolve względem pozycji platformy, ale contribution nadal dotyczy tylko platformy spatially wspierającej wybrany bedroll (`BEDROLL_ON_PLATFORM_RADIUS = 1.6`).

## Tent authoritative state i persistence

Aktualnie `src/items/createPlacedTents.ts` ma tylko:

```ts
{ id, x, z, yaw }
```

`nodes()` i `pack()` również obcinają rekord do tych pól. Przy dodaniu condition zaktualizować wszystkie te ścieżki; łatwo przypadkiem zgubić pola podczas `nodes()`/`pack()`.

`place()` powinno dostać `worldDays` i tworzyć fresh tent z `condition: 100` oraz `lastConditionUpdateAtDays: worldDays`, analogicznie do `createSleepingUtilities.ts`.

Persistence nie jest optional/default-only zmianą. `src/persistence/saveData.ts` ma obecnie `CURRENT_SAVE_VERSION = 6`, `SavePlacedTent` bez condition i realny `SAVE_MIGRATIONS` pipeline. Trzeba:

- rozszerzyć `SavePlacedTent`,
- bumpnąć save version,
- dodać migrację poprzedniej wersji → nowa,
- dla starych namiotów defaultować `condition = 100` oraz sensowny anchor czasu zachowujący stare zachowanie (najbezpieczniej bieżący zapisany `elapsedDays`, jeśli migrator ma do niego dostęp),
- zaktualizować walidację/testy i `buildSaveData()`/restore path.

Nie persistować resolved quality/snapshotu/anchoru intentu.

## Spatial lookup: nie mieszać anchorów

Obecny `resolveCampContext()` w `restActions.ts`:

- wybiera bedroll względem player position,
- sprawdza tent przy pozycji bedrolla dla shelter,
- warm fire sprawdza względem player position.

Po wydzieleniu snapshot resolvera wszystkie komponenty powinny być rozwiązywane względem jednego jawnego camp/rest anchoru zgodnie z planem. Nie pozostawić części lookupów nadal zakotwiczonych w graczu, bo inspection namiotu da wtedy inny wynik niż sleep.

Do wyboru/reuse komponentów użyć istniejących bounded helperów/constants:

- `TENT_SHELTER_RADIUS`,
- `WARM_FIRE_RADIUS`,
- `BEDROLL_REST_RADIUS`,
- `BEDROLL_ON_PLATFORM_RADIUS`,
- `findNearestSleepingUtility()` z deterministycznym id tie-break.

Jeżeli potrzebny jest odpowiednik nearest tent/fire, dodać mały deterministic resolver; nie skanować świata w Vue ani per-frame.

## Placement/full-camp

Relevant runtime:

- `src/app/actions/placementActions.ts`
- `src/app/actions/placementPreviewActions.ts`
- `src/items/tentPlacement.ts`
- `src/world/sleepingUtilities.ts`
- istniejące fire actions z `SurvivalActions` / placed fires.

Wspólny placement framework już istnieje i musi pozostać jedyną ścieżką:

- `GroundPlacementDefinition`,
- `evaluatePlacementSite()`,
- `previewGroundPlacement()`,
- `PlacementPreviewActions.start(kind)` → confirm/cancel.

Nie wywoływać `bundle.*.place()` bezpośrednio z intentu. Każdy krok powinien wejść w normalny preview i canonical mutation action.

`placeTentAtAim()` aktualnie:

- wymaga itemu `tent`,
- ponownie waliduje site,
- odpala Busy Action,
- dopiero na completion konsumuje tent i woła `bundle.placedTents.place(...)`,
- przyznaje Survival XP.

Bedroll/platform mają analogiczny model materials + Busy Action. Full-camp nie może omijać żadnego z tych efektów.

Po każdym zakończonym kroku ponownie resolve snapshot + inventory, zamiast utrzymywać stale references. Partial world changes pozostają po cancellation.

## Fire

Do existing fire nie wprowadzaj osobnego `camp fire state`. Snapshot powinien odczytać realny `VillageFire.isLit()` z `PlacedFires`.

Ignition musi przejść przez `SurvivalActions.startIgniteFire()`; to tam są capability/fuel/Busy/XP. Jeżeli `ui-input-010` wprowadzi już nearby-fire resolver oraz intent phases dla `cook-meal`, reuse jego bounded fire-selection/callback seams zamiast tworzyć camp-only odpowiedniki, o ile nie zmienia to wymaganej polityki anchoru.

## Tent interaction / FlavorDialog

Aktualnie:

- `src/app/interactables.ts` wystawia tent jako `[E] Odpocznij · [R] Złóż namiot`;
- `src/app/gameLoop.ts` dispatchuje tent bez generic resolvera;
- `RestActions` ma `startTentRest(id)` i `packTent(id)`;
- generic `FlavorDialog` już wspiera `actions: { label, enabled, reasonLabel, run }[]`.

Zmiana `[R]` powinna więc zostać w obecnym tent dispatch path: otworzyć generic FlavorDialog z snapshotem przygotowanym w app/action layer. Vue tylko renderuje przekazany description/actions.

`Złóż namiot` z dialogu powinno wywołać istniejące `RestActions.packTent(id)`; nie przenosić inventory/capacity logic do UI.

## Quick Actions

`src/ui-vue/screens/QuickActionsScreen.vue` nadal ma literal `Rozbij obóz (8h)`. Rename jest czysto UI-label change; dotychczasowy `rest('camp')` pozostaje tym samym bivouac flow.

`Rozbij pełny obóz` powinien wywołać app/player intent action dostarczoną przez dependency `ui-input-010`. Availability w Vue może opierać się tylko na tanim, już dostępnym stanie; nearby camp/material legality resolve dopiero po starcie intentu.

## Sugerowana kolejność implementacji

1. Po wdrożeniu `ui-input-010` zweryfikować faktyczny `PlayerIntentController` i callback seams placement/Busy.
2. Rozszerzyć pure condition/weather helper + tent record/persistence.
3. Zmienić sleeping-utility shelter boolean → factor.
4. Rozszerzyć `CampRestContext` i pure calculation/breakdown.
5. Wydzielić canonical camp snapshot resolver i przepiąć istniejący rest na niego.
6. Dodać tent inspection przez istniejący FlavorDialog.
7. Dodać full-camp intent jako kolejną intencję istniejącego controllera.
8. Na końcu rename bivouac label + Quick Action wiring.

## Testy o najwyższej wartości

Poza testami z planu szczególnie pokryć:

- inspection snapshot i real sleep używają dokładnie tego samego quality result dla tego samego anchoru;
- platform 0/50/100% daje odpowiednio raised factor 0.75/0.875/1.0;
- tent shelter 0/50/100% wpływa zarówno na camp quality, jak i utility weather exposure;
- old-save migration dla istniejących tents;
- `PlacedTents.nodes()`/`pack()` nie gubią condition fields;
- full-camp: confirm placement → Busy completion → następna faza, oraz cancel preview/Busy → intent cancelled bez rollbacku;
- teardown/world rebuild czyści tylko transient intent, nie postawione komponenty.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

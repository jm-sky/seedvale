# Plan: Systemic item utility and food safety

**Created:** 2026-09-10
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `items-player`
**Subdomains:** `items` `player-needs`
**Tags:** `fuel` `food` `poisoning` `freshness` `item-catalog`
**Roadmap:** -

## Goal

Wprowadzić pierwszy mały, produkcyjny krok w stronę świata, w którym przedmioty mają właściwości używane przez wiele systemów zamiast być rozpoznawane wyłącznie przez sztywne listy `ItemKind`.

V1 ma dostarczyć dwa konkretne pionowe przykłady:

1. **systemowe paliwo** — `cone`, `branch` i `beam` są paliwami o różnych wartościach opałowych opisanych w `ITEM_CATALOG`, a ogień nie utrzymuje osobnej listy dozwolonych rodzajów paliwa;
2. **bezpieczeństwo surowego mięsa** — ryzyko zatrucia wynika z istniejącego `FoodBatch.sourceSpecies`, świeżości i stanu przetworzenia oraz korzysta z istniejącego `TemporaryConditionsState.poisoning`.

Plan ma rozszerzać istniejące mechanizmy, nie tworzyć `MaterialManager`, `FuelManager`, osobnego systemu chorób ani równoległej klasyfikacji przedmiotów.

## Recon — current code

### Item semantics

`src/items/itemCatalog.ts` jest już gameplay-facing katalogiem właściwości przedmiotów. Przechowuje m.in. `capabilities`, `melee`, `ranged`, `consumable`, `food`, `container`, treatment metadata i inne deklaratywne właściwości.

`ITEM_CATALOG[kind].capabilities` jest już single source of truth dla tool requirement gates. Ten plan powinien zastosować ten sam kierunek dla paliwa: właściwość należy do item definition, a consumer pyta o właściwość.

`cone` istnieje jako `world_chunk` collectible, ale nie ma obecnie gameplayowego zastosowania.

`branch` jest odnawialnym zasobem świata i ma inne zastosowania poza ogniem.

`beam` jest materiałem konstrukcyjnym z harvestu drzew i już może być spalany, co tworzy naturalny trade-off między budową a opałem.

### Fire

`src/settlement/VillageFire.ts` definiuje obecnie:

```ts
export const FIRE_FUEL_KINDS: readonly ItemKind[] = ['branch', 'beam']
export const FUEL_PER_BRANCH = 75
```

`VillageFire.light()` i `VillageFire.addFuel()` nie przyjmują wartości paliwa. Każda zużyta gałąź i belka daje identyczny przyrost `fuelPerBranch`.

`src/app/actions/survivalActions.ts::startIgniteFire()`:

- sprawdza `FIRE_FUEL_KINDS`,
- po busy channel ponownie wyszukuje pierwszy dostępny kind z tej listy,
- usuwa dokładnie 1 jednostkę,
- wywołuje `fire.light()`.

Refuel rozpalonego ognia również korzysta z `FIRE_FUEL_KINDS` w istniejącym interaction/game-loop path. Wszystkie call-site'y muszą przejść na wspólny resolver paliwa, aby katalog był jedyną authority.

`VillageFire.getFuelRatio()` i flame-size curve są obecnie wyrażone w jednostkach jednej gałęzi. W V1 można zachować tę semantykę jako znormalizowaną jednostkę opałową; nie trzeba zmieniać presentation API na sekundy.

### Food provenance and processing

`src/items/foodFreshness.ts` ma już:

- `FoodSourceSpecies = 'deer' | 'wolf' | 'boar' | 'rabbit' | 'cow'`,
- `FoodBatch.sourceSpecies`,
- mapping raw meat `ItemKind ↔ FoodSourceSpecies`,
- `fresh | medium | spoiled`,
- `inheritProcessedFoodBatch()`, który zachowuje `sourceSpecies`,
- `foodHungerRelief()`, który zachowuje różnice gatunkowe również dla `roasted_meat` / `dried_meat`.

Nie tworzyć osobnych `roasted_deer_meat`, `roasted_boar_meat` itd.

`src/items/campfireCooking.ts` mapuje wszystkie gatunkowe mięsa na wspólne `roasted_meat`, zachowując provenance batcha.

`src/world/dryingRacks.ts` analogicznie produkuje `dried_meat` z zachowaniem provenance.

`ITEM_CATALOG` już daje większy hunger relief dla `roasted_meat` niż `raw_meat`; ten plan nie przebudowuje systemu kalorii.

### Food consumption and poisoning

`src/app/actions/survivalActions.ts::consumeItem()`:

1. znajduje FIFO `FoodBatch`,
2. odrzuca `spoiled`,
3. usuwa konkretną jednostkę przez `removeWithFreshness()`,
4. odczytuje `sourceSpecies`,
5. wylicza hunger relief,
6. aplikuje istniejące potrzeby/treatment.

To jest właściwy integration point dla player-facing unsafe-food exposure po udanym spożyciu.

`src/shared/temporaryConditions.ts` ma obecnie jeden `ConditionKind = 'poisoning'` oraz kompletne lifecycle/severity/recovery/persistence/treatment poprzez `applyPoisoningExposure()` i pozostałe existing helpers.

Nie dodawać w V1 osobnych chorób (`salmonellosis`, `parasites`, `food_poisoning`, itd.). Surowe mięso ma korzystać z istniejącego `poisoning`.

Unsafe-water exposure ma już deterministyczny wzorzec:

- `PlayerController.waterDrinkEventCount`,
- persisted `SaveData.waterDrinkEventCount`,
- seed + actor id + monotonic event index,
- `src/shared/waterPoisoningExposure.ts` jako mały shared resolver.

Food exposure powinno zachować tę samą deterministyczną zasadę, ale nie mieszać indeksów picia i jedzenia.

### Construction materials — explicitly deferred

`src/items/constructionMaterials.ts` ma wspólny i dobrze używany seam:

```ts
MaterialRequirement = { kind: ItemKind, count: number }
```

`hasMaterial()` / `consumeMaterial()` obsługują inventory + nearby dropped items atomowo, a `MaterialRecoveryPolicy` / `computeMaterialRecovery()` zakładają odzyskanie konkretnych `ItemKind` z canonical requirements.

Pełne resource substitution (`structuralWood`, `fiber`, `stone` units) rozszerzyłoby wiele construction/repair call-site'ów oraz recovery semantics. Nie należy tego robić w V1.

## Scope

## 1. Catalog-driven fuel utility

Rozszerzyć `ItemCatalogEntry` o minimalne, deklaratywne metadata paliwa.

Preferowany kontrakt V1:

```ts
utility?: {
  fuel?: {
    value: number
  }
}
```

`value` jest dodatnią względną wartością opałową, gdzie **`branch = 1`** jest bazową jednostką kompatybilną z dzisiejszym `FUEL_PER_BRANCH`.

W V1 skonfigurować:

- `cone` — słabe paliwo / rozpałka, wartość mniejsza niż 1;
- `branch` — bazowe paliwo, `value = 1`;
- `beam` — mocniejsze paliwo, `value > 1`, aby spalanie strukturalnej belki dawało realnie więcej czasu niż gałąź.

Dokładne liczby są balancing data; implementacja powinna dobrać proste wartości zachowujące czytelne proporcje i objąć je testami. Nie dodawać w V1 wilgotności, jakości drewna, temperatury, heat output ani ignition difficulty.

Dodać mały pure helper przy item catalog / items domain, który:

- odpowiada, czy `ItemKind` jest paliwem,
- zwraca jego `fuel.value`,
- pozwala wybrać paliwo z Inventory w deterministycznej kolejności.

Kolejność automatycznego zużycia musi być jawna i stabilna. Preferencja V1: zużywać **najmniej wartościowe paliwo wystarczające do zwykłego dołożenia** przed droższym konstrukcyjnym zasobem, tj. naturalnie `cone → branch → beam`, a nie przypadkowy iteration order katalogu.

Nie kodować tej kolejności drugi raz w UI/action path.

## 2. Migrate fire consumption to fuel value

Usunąć `FIRE_FUEL_KINDS` jako authority.

`VillageFire` nadal jest authoritative ownerem bieżącego paliwa i stanu ognia. Zmienić API tak, aby przy zapalaniu / dokładaniu można było przekazać wartość paliwa zamiast zawsze dodawać dokładnie jedną gałąź-equivalent.

Docelowa semantyka:

```text
fuel.value × fuelPerBranch
→ burn-time contribution
```

Wymagania:

- `branch` zachowuje dzisiejszy czas bazowy;
- `cone` pali się krócej;
- `beam` pali się dłużej;
- `getFuelRatio()` nadal reprezentuje znormalizowaną liczbę branch-equivalents;
- flame-size curve czyta ten sam authoritative fuel amount;
- settlement fire i player-built fires nadal używają tego samego `VillageFire` implementation;
- nie tworzyć oddzielnych counters per fuel kind.

Zaktualizować wszystkie obecne fire fuel call-site'y, w szczególności:

- `src/app/actions/survivalActions.ts::startIgniteFire()`,
- istniejący refuel/dołóż path w `src/app/gameLoop.ts` / interaction actions,
- habitat/spawner destruction path, który dziś zamienia 4 gałęzie na `light()` + 3 × `addFuel()`.

Habitat burn ma zachować dzisiejszy efekt 4 branch-equivalents bez tworzenia sztucznych itemów pośrednich.

Prompt/error text nie może już mówić wyłącznie „gałąź lub belka”, skoro `cone` jest legalnym paliwem. Tekst powinien mówić ogólnie o opale/paliwie.

## 3. Species-aware raw-meat safety data

Nie rozszerzać `ConditionKind`.

Dodać minimalną species-aware definicję ryzyka surowego mięsa w items domain, blisko `FoodSourceSpecies` / istniejącego meat provenance.

Preferować jeden centralny mapping właściwości źródła mięsa zamiast wpisywania `if (kind === 'boar_meat')` w `consumeItem()`.

Kontrakt powinien pozwalać określić co najmniej:

- bazowe prawdopodobieństwo poisoning exposure dla świeżego surowego mięsa danego gatunku;
- bazową severity pierwszej ekspozycji lub jawny multiplier/override względem istniejącego poisoning modelu.

`raw_meat` bez `sourceSpecies` musi mieć zdefiniowany generic fallback, aby legacy/generic meat nadal zachowywało się deterministycznie.

Nie duplikować nutrition data. Hunger relief nadal pochodzi z obecnego `ITEM_CATALOG` / `foodHungerRelief()`.

## 4. Freshness modifies raw-meat risk

Wykorzystać istniejący `FreshnessStage` zamiast nowego age/timer systemu.

V1:

- `fresh` — species base risk;
- `medium` — wyższe ryzyko niż `fresh`;
- `spoiled` — nadal pozostaje **niejadalne**, zgodnie z istniejącym `consumeItem()`; nie zmieniać tego w „bardzo wysokie ryzyko”.

Freshness modifier ma być jednym wspólnym pure resolverem, nie osobnymi wartościami powielonymi per species.

Resolver wejściowy powinien dać się testować bez `PlayerController` i UI, np. logicznie:

```text
ItemKind + FoodBatch/FreshnessStage
→ raw food risk | null
```

Processed meat (`roasted_meat`, `dried_meat`) nie jest w V1 źródłem raw-meat poisoning exposure. Gotowanie/suszenie zachowuje provenance dla nutrition i przyszłych rozszerzeń, ale sam provenance nie może powodować zatrucia po przetworzeniu.

## 5. Deterministic food exposure rolls

Dodać osobny monotoniczny player food-risk event counter, analogiczny do `waterDrinkEventCount`.

Preferowana nazwa kontraktu: `foodConsumptionEventCount` albo węższe `unsafeFoodEventCount`; podczas implementacji wybrać nazwę zgodną z rzeczywistym momentem inkrementacji i konsekwentnie użyć jej w runtime/save schema.

Wymagania:

- counter inkrementuje się tylko dla zdarzeń, które uczestniczą w food-risk roll;
- roll jest deterministyczny z co najmniej `worldSeed + actorId + eventIndex + food/source identity`;
- save/load zachowuje counter;
- brak pola w legacy save oznacza `0`;
- nie używać `Math.random()`;
- nie współdzielić `waterDrinkEventCount`, aby zmiana liczby wypitych łyków nie zmieniała przyszłych wyników spożywania mięsa.

Wzorzec implementacyjny powinien reuse kształt `src/shared/waterPoisoningExposure.ts`, ale nie wciskać food semantics do pliku nazwanego od wody. Jeżeli wspólny drobny helper deterministycznego event roll rzeczywiście zmniejsza duplikację, można go wydzielić; nie tworzyć ogólnego „risk engine”.

Persistence integration obejmuje co najmniej:

- `src/player/PlayerController.ts`,
- `src/persistence/saveData.ts`,
- `src/app/saveState.ts`,
- restore w `src/app/createApp.ts`,
- właściwą migration/legacy-default policy zgodną z obecnym schema pipeline.

## 6. Apply existing poisoning on successful raw-meat consumption

Po udanym `removeWithFreshness()` w `src/app/actions/survivalActions.ts::consumeItem()`:

1. zachować batch/sourceSpecies użyte do obecnego nutrition calculation;
2. jeśli spożyta forma jest raw meat, rozwiązać species + freshness risk;
3. wykonać deterministyczny roll;
4. przy sukcesie użyć istniejącego `applyPoisoningExposure()` / temporary-condition lifecycle;
5. zsynchronizować derived physical capabilities analogicznie do unsafe-water exposure;
6. dać krótki player feedback o zatruciu bez blokowania samego zjedzenia.

Zatrucie jest konsekwencją **spożycia**, więc jedzenie/hunger relief ma zostać zastosowane nawet wtedy, gdy exposure roll zakończy się zatruciem.

Repeated exposure ma używać istniejącej kumulacji `TemporaryConditionsState`; nie tworzyć food-specific severity state.

## 7. Preserve existing processed-food behaviour

Nie zmieniać działającego pipeline'u:

```text
species raw meat
→ FoodBatch.sourceSpecies
→ roasted_meat / dried_meat
→ sourceSpecies preserved
→ foodHungerRelief() preserves species nutrition difference
```

`roasted_meat` nadal ma większy catalog relief niż generic `raw_meat`.

Survival skill bonus dla `roasted_meat` pozostaje na obecnym consumer path.

Nie rozszerzać V1 o nowe processing states, smoking, parasites, recipes ani cooking quality.

## Architecture decisions

1. **`ITEM_CATALOG` remains item semantic authority.** Fuel jest właściwością itemu, nie listą w systemie ognia.
2. **`VillageFire` owns fuel state, not fuel identity.** Ogień dostaje resolved contribution i nie musi wiedzieć, czy pochodziła z szyszki, gałęzi czy belki.
3. **`FoodBatch.sourceSpecies` remains provenance authority.** Nie tworzyć processed ItemKind per species.
4. **Freshness remains derived.** Nie dodawać drugiego food-age state.
5. **`TemporaryConditionsState.poisoning` remains condition authority.** Unsafe food jest kolejnym exposure source, nie nową chorobą.
6. **Randomness remains deterministic and save-stable.** Osobny monotoniczny event index jest częścią runtime/persistence contractu.
7. **No generalized material substitution in V1.** `MaterialRequirement = { kind, count }` pozostaje bez zmian.
8. **No manager objects.** Pure item/risk resolvers + istniejący ownership wystarczają.

## Non-goals

Poza V1 pozostają:

- `structuralWood` / `fiber` / `stone` jako abstrakcyjne construction units;
- zamienniki materiałów w `constructionMaterials.ts`;
- zmiany recovery semantics budynków;
- popiół, charcoal i produkty spalania;
- wilgotność paliwa, heat/temperature, smoke simulation;
- tkanina/skóra/kości jako paliwo lub multi-purpose crafting materials;
- throwing stones / improvised weapons;
- cooking z wodą i pełny crafting/recipe system;
- osobne choroby pokarmowe, pasożyty, infekcje;
- NPC food-poisoning behaviour i autonomous fuel-choice strategy;
- household/settlement pressure wynikający z konkurencji opał vs budowa;
- zmiany animal feed/bait poza już istniejącym systemem;
- nowe cooked/dried ItemKind per species.

Te kierunki mogą później korzystać z semantycznych properties wprowadzonych tutaj, ale nie należy projektować pustych pól ani abstrakcji „na zapas”.

## Relevant files / expected integration points

Core:

- `src/items/itemCatalog.ts` — fuel metadata + helpers / item authority;
- `src/settlement/VillageFire.ts` — fuel contribution API i authoritative burn state;
- `src/app/actions/survivalActions.ts` — ignite, habitat burn, consume food exposure;
- `src/app/gameLoop.ts` lub aktualny refuel action call-site — migrate existing „dołóż” flow;
- `src/items/foodFreshness.ts` — existing provenance/freshness authority; natural home lub dependency dla species risk resolver;
- `src/shared/temporaryConditions.ts` — reuse poisoning only; minimal/no change expected;
- `src/shared/waterPoisoningExposure.ts` — reference pattern for deterministic exposure, not food authority.

Persistence for deterministic food event index:

- `src/player/PlayerController.ts`;
- `src/persistence/saveData.ts`;
- `src/app/saveState.ts`;
- `src/app/createApp.ts`.

Likely tests to extend/add:

- `src/app/actions/survivalActions.test.ts`;
- tests adjacent to `itemCatalog` / fuel resolver;
- `VillageFire` tests if present, otherwise a focused unit test near the module;
- `foodFreshness` / new food-risk resolver tests;
- persistence validation/round-trip tests covering new counter where current project conventions require them.

Implementation agent must verify exact current test filenames before editing; do not create a parallel test harness.

## Suggested implementation order

1. Add minimal catalog `utility.fuel.value` contract and pure fuel resolvers.
2. Configure `cone`, `branch`, `beam`.
3. Change `VillageFire` to accept normalized fuel contribution while preserving branch-equivalent semantics.
4. Migrate ignite/refuel/habitat-burn call-sites and remove `FIRE_FUEL_KINDS` authority.
5. Add species-aware raw-food risk pure resolver using existing provenance + freshness.
6. Add deterministic player food event counter + persistence/default restore.
7. Integrate exposure into `consumeItem()` and reuse existing poisoning synchronization.
8. Add focused unit/persistence tests.
9. Update current-state/item documentation only where implementation changed source-of-truth behaviour.

Important architectural/public helpers introduced by this plan should get concise JSDoc with `@domain items-player` where useful for preflight discovery.

## Automated verification

Implementation should run the smallest relevant checks first, then repository-standard validation required by `CLAUDE.md`.

At minimum verify automatically:

- TypeScript/build passes;
- existing fire/cooking/food tests remain green;
- fuel resolver deterministically selects `cone → branch → beam` according to the chosen policy;
- each fuel contributes a different expected burn amount and branch preserves current baseline;
- ignite revalidation consumes exactly one still-present selected/eligible fuel and never mints fuel;
- habitat burn still begins with 4 branch-equivalents;
- generic raw meat has deterministic fallback risk;
- species risks differ according to configured data;
- `medium` raw meat risk is greater than `fresh` for the same species;
- `spoiled` remains refused before consumption;
- `roasted_meat` and `dried_meat` do not trigger raw-meat exposure;
- successful poisoning reuses `TemporaryConditionsState.poisoning` and repeated exposure accumulates through existing rules;
- save/load round-trips the food-risk event counter; missing legacy field restores as 0;
- identical seed/state/event index yields identical exposure roll.

Do not run browser/manual gameplay verification as AI.

## Manual verification for User

After implementation, User should verify in browser:

- można rozpalić/dołożyć szyszkę, gałąź i belkę;
- szyszka daje zauważalnie mniej czasu niż gałąź, belka więcej;
- automatyczny wybór opału nie spala belki, gdy dostępna jest szyszka/gałąź według ustalonej polityki;
- komunikaty przy ogniu mówią o paliwie/opale, nie tylko o gałęzi;
- świeże surowe mięso może spowodować zatrucie zgodnie z deterministycznym ryzykiem;
- ryzyko zależy od gatunku, a medium-fresh raw meat jest bardziej ryzykowne;
- pieczone/suszone mięso nie wywołuje raw-meat poisoning;
- pieczone mięso nadal daje większą sytość i zachowuje gatunkowe provenance;
- save/load nie resetuje sequence deterministycznych food-risk rolls ani aktywnego poisoning.

## Follow-up candidates after V1

Jeżeli V1 potwierdzi wzorzec `item → semantic properties → shared consumers`, osobne późniejsze plany mogą rozważyć:

- category/value-based construction substitution w `constructionMaterials.ts` wraz z jednoznaczną recovery policy;
- NPC/household fuel selection i presję opał vs construction stock;
- produkty spalania (`ash`, `charcoal`) i dalsze zastosowania;
- multi-purpose hide/cloth/bone resources;
- szerszy disease/illness model dopiero wtedy, gdy różne choroby wymagają różnych lifecycle/treatment semantics.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

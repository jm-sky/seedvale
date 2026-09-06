# Plan: Player camp repair and sewing kit

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** items-player-018
**Domain:** `items-player`
**Subdomains:** `items` `interaction` `player-needs`
**Tags:** `repair` `camp` `condition` `tools`
**Roadmap:** -

## Goal

Dodać deterministyczną naprawę player-built camp equipment:

- tent,
- bedroll,
- raised sleeping platform,

w oparciu o istniejące:

- condition,
- Inventory,
- item instances,
- item capabilities,
- Survival,
- Busy Action,
- physical effort,
- contextual interaction UI.

Repair nie jest osobnym crafting/maintenance frameworkiem.

Canonical flow:

```text
current condition
+ repair material
+ required capability
+ Survival
→ repair amount + duration
→ Busy Action / physical effort
→ revalidation
→ consume one material
→ update authoritative condition
→ Survival XP
```

## 1. Responsibility model

Rozdzielić trzy role:

```text
tool capability
→ czy gracz może wykonać dany rodzaj pracy

repair material
→ fizyczny zasób zużywany przez naprawę

Survival
→ szybkość i efektywność wykorzystania materiału
```

Nie używać RNG.

Nie dodawać minimalnego progu Survival blokującego naprawę.

Nowy gracz może naprawiać, ale:

- wolniej,
- mniej efektywnie materiałowo.

## 2. Supported objects

### Tent

```text
capability: textile_repair
material: hide
skill: Survival
```

### Bedroll

```text
capability: textile_repair
material: hide
skill: Survival
```

### Platform

```text
capability: wood_chopping
material: branch
skill: Survival
```

Nie dodawać nowego:

- Repair skill,
- Crafting skill,
- Construction skill.

Aktualny `PlayerSkills` posiada sześć skilli, a Survival już steruje pracami obozowymi i ich czasem.

## 3. New `textile_repair` capability

Rozszerzyć `ItemCapability`:

```ts
| 'textile_repair'
```

Znaczenie:

> naprawa i szycie wyposażenia z tkaniny, skóry lub podobnych elastycznych materiałów.

Dodać:

```ts
CAPABILITY_NEED_LABEL.textile_repair = 'zestawu do szycia'
```

Repair nigdy nie powinien sprawdzać:

```ts
inventory.has('sewing_kit')
```

Canonical gate:

```ts
inventory.hasCapability('textile_repair')
```

## 4. Sewing kit

Dodać:

```ts
sewing_kit
```

Label:

```text
zestaw do szycia
```

Properties:

- category: utility/tool zgodnie z istniejącym katalogiem,
- holdable: false,
- reusable,
- nie jest consumable,
- nie ma durability w tym planie,
- capability: `['textile_repair']`,
- weight: **0.4 kg**,
- size: dobrać do istniejącej enum skali jako mały item, preferować `S`.

Nie dodawać:

- osobnego equipment slot,
- held visual,
- osobnego repair inventory.

Sama obecność w Inventory daje capability.

## 5. Sewing kit acquisition

Reuse istniejący merchant flow.

Dodać `sewing_kit` do:

```ts
MERCHANT_PRICES
MERCHANT_STOCK
```

Canonical cena:

```text
18 coin
```

Obecna skala to m.in. firestarter 8, knife 12, fishing rod 18, shovel 20, axe 25, tent 30. `18` umieszcza zestaw jako przydatne specjalistyczne narzędzie, ale nadal dostępne relatywnie wcześnie.

Nie dodawać w tym planie:

- crafting recipe,
- world spawn,
- quest reward,
- NPC production.

## 6. Tent condition continuity — mandatory prerequisite

`items-player-018` dodaje condition do postawionego namiotu, ale obecny inventory tent jest stackowanym itemem.

Aktualnie:

```text
world tent
→ packTent()
→ inventory.add('tent', 1)
```

a przy placement:

```text
inventory.remove('tent', 1)
→ placedTents.place(...)
```

To traci indywidualny stan obiektu.

Repair nie może zostać wdrożony z takim modelem, ponieważ:

```text
damaged tent 20%
→ pack
→ deploy
→ fresh tent 100%
```

byłby darmową naprawą.

## 7. Tent becomes instance-backed

Rozszerzyć istniejący item-instance mechanism zamiast tworzyć osobny portable-tent state.

Dodać:

```ts
export type TentItemInstance = ItemInstance & {
  kind: 'tent'
  condition: number
}
```

Dodać `tent` do:

```ts
INSTANCE_BACKED_KINDS
```

oraz odpowiednie:

```ts
isTentItemInstance(...)
```

i cloning/save/restore/acquisition support.

Kupiony nowy namiot:

```text
condition = 100
```

Reuse istniejące:

```text
Inventory.addInstance()
Inventory.removeInstance()
Inventory.getInstances()
```

## 8. Stable tent identity across inventory ↔ world

Namiot zachowuje tę samą fizyczną tożsamość.

Preferowany model:

```text
TentItemInstance.id
    ↕
PlacedTent.id
```

Nie generować nowego niezależnego id przy każdym rozstawieniu tego samego namiotu.

### Placement

Wybrać konkretną carried `TentItemInstance`.

Po successful Busy Action:

```text
removeInstance(instance.id)
→ placedTents.place(instance, position...)
```

Placed tent zachowuje:

```ts
{
  id,
  x,
  z,
  yaw,
  condition,
  lastConditionUpdateAtDays
}
```

### Packing

Najpierw resolve current condition do `now`.

Następnie:

```text
PlacedTent
→ TentItemInstance {
    id,
    kind: 'tent',
    condition: resolvedCondition
  }
→ inventory.addInstance(...)
```

World weather timestamp nie musi podróżować w inventory, ponieważ packed tent nie degraduje się od world weather.

### Redeploy

Nowy world record:

```text
condition = instance.condition
lastConditionUpdateAtDays = current elapsedDays
```

Czyli weather degradation zaczyna nowy okres dopiero po ponownym rozstawieniu.

## 9. Migration for existing tent inventory

Saves sprzed instance-backed tent mogą zawierać:

```text
inventory count: tent
```

Migracja/restoration musi deterministycznie zamienić każdą jednostkę na świeży:

```ts
TentItemInstance {
  id: ...,
  kind: 'tent',
  condition: 100,
}
```

Nie pozostawiać dwóch równoległych representation:

```text
stacked tent + instance-backed tent
```

po zakończeniu migracji.

## 10. Tent repair material

Obecny namiot nie posiada construction recipe. Jest zwykłym itemem kupowanym od Kupca za `30 coin`, a jego katalog opisuje go jako `buy / place / rest / pack`.

Dlatego nie udawać, że istnieje canonical construction requirement.

Wprowadzić jawnie **repair material**, nie construction recipe:

```ts
TENT_REPAIR_MATERIAL: MaterialRequirement = {
  kind: 'hide',
  count: 1,
}
```

Uzasadnienie:

- `hide` już istnieje,
- jest używane do leather bedroll,
- pasuje do prostego namiotu survivalowego,
- nie wymaga wprowadzania nowego `cloth` tylko dla jednej funkcji.

To jest repair definition, nie deklaracja sposobu budowy całego namiotu.

## 11. Existing sleeping utility materials remain canonical

Bedroll:

```ts
BEDROLL_MATERIAL_REQUIREMENTS = [
  { kind: 'hide', count: 3 }
]
```

Platform:

```ts
PLATFORM_MATERIAL_REQUIREMENTS = [
  { kind: 'branch', count: 6 }
]
```

Repair definitions mają korzystać z tych samych material kinds.

Nie tworzyć alternatywnych repair materials dla bedroll/platform.

## 12. Incremental repair

Jedna action nie naprawia automatycznie do `100%`.

Jedna successful repair action zużywa:

```text
1 material unit
```

i przywraca określoną liczbę condition points.

Przykład:

```text
condition 42
+ 1 hide
→ condition 72
```

Gracz może powtarzać akcję.

## 13. Base repair values

Material efficiency ma być powiązane z konstrukcją lub rozmiarem obiektu.

### Bedroll

3 hide odpowiada pełnemu obiektowi.

Base:

```text
34 condition / hide
```

### Platform

6 branches odpowiada pełnemu obiektowi.

Base:

```text
17 condition / branch
```

### Tent

Ponieważ nie ma construction recipe, przyjąć jawny repair balance:

```text
25 condition / hide
```

Czyli pełna odbudowa namiotu z 0% kosztowałaby nominalnie około 4 hide przy neutralnej wydajności.

Namiot jest większy od bedrolla, więc jedna skóra daje mniejszy repair gain niż przy bedrollu.

## 14. Survival material efficiency

Użyć jednego shared pure helpera:

```ts
repairMaterialMultiplier(survival)
```

Canonical formula:

```ts
0.8 + 0.4 * survival
```

Przy obecnym Survival `0.2..1`:

```text
0.2 → 0.88×
1.0 → 1.20×
```

Final repair:

```ts
baseRepairPoints * repairMaterialMultiplier(survival)
```

Zaokrąglać deterministycznie do integer condition points, preferować `Math.round()`.

Clamp do `0..100`.

## 15. Result examples

### Bedroll

Base `34`:

```text
Survival 0.2 → około 30
Survival 1.0 → około 41
```

### Platform

Base `17`:

```text
Survival 0.2 → około 15
Survival 1.0 → około 20
```

### Tent

Base `25`:

```text
Survival 0.2 → około 22
Survival 1.0 → 30
```

Survival poprawia gospodarkę materiałową, ale nie robi z materiałów wielokrotnie większej wartości.

## 16. Repair duration

Reuse istniejący:

```ts
survivalDurationMultiplier()
```

Nie tworzyć osobnej krzywej czasu.

Base durations:

```text
bedroll  → 4 s
tent     → 6 s
platform → 5 s
```

Final:

```ts
baseDuration * survivalDurationMultiplier(player.skills.survival.value)
```

## 17. Physical effort

Reuse istniejący physical effort model.

Intensity:

```text
bedroll  → light
tent     → light
platform → moderate
```

Użyć istniejących helpers:

- `physicalEffortBusyOptions`,
- `physicalEffortStaminaCostPerSec`,
- innych aktualnych helperów, jeśli obecny action pattern tego wymaga.

Nie implementować repair-specific stamina system.

## 18. Repair definition

Wydzielić mały domain contract, np.:

```ts
type CampRepairDefinition = {
  capability: ItemCapability
  material: ItemKind
  baseRepairPoints: number
  baseDurationSec: number
  effort: PhysicalEffortIntensity
}
```

Definitions:

```text
tent:
  textile_repair
  hide
  25
  6s
  light

bedroll:
  textile_repair
  hide
  34
  4s
  light

platform:
  wood_chopping
  branch
  17
  5s
  moderate
```

Nie budować generic repair registry dla wszystkich itemów w grze.

Scope pozostaje camp equipment.

## 19. Tool requirements

Tent / bedroll:

```ts
inventory.hasCapability('textile_repair')
```

Platform:

```ts
inventory.hasCapability('wood_chopping')
```

Platforma nie wymaga konkretnego `axe`.

Każdy obecny lub przyszły tool z `wood_chopping` jest poprawny.

Nie wymagać, aby tool był aktualnie trzymany w dłoni.

## 20. Repair resolver

Pure helper musi być jedynym źródłem preview i actual result.

Przykładowo:

```ts
resolveCampRepair({
  objectKind,
  condition,
  survivalValue,
})
```

Result:

```ts
{
  finalCondition,
  restoredCondition,
  material,
  capability,
  durationSec,
  effort,
}
```

Vue nie przelicza repair points.

## 21. Resolve degradation before repair

Przed jakąkolwiek naprawą world object:

```text
stored condition
+ lastConditionUpdateAtDays
→ resolve weather degradation to now
→ current condition
```

Dopiero ten resolved value jest wejściem do repair.

Nigdy nie naprawiać stale stored condition.

## 22. Repair mutation

Successful repair:

```text
resolved current condition
→ add repair points
→ clamp to 100
→ write condition
→ lastConditionUpdateAtDays = now
```

To resetuje environmental-degradation anchor.

W przeciwnym razie wcześniejszy weather exposure zostałby naliczony ponownie po naprawie.

## 23. Preflight

Przed Busy Action sprawdzić:

1. object still exists,
2. current resolved condition `< 100`,
3. required capability,
4. at least 1 required repair material,
5. player action is not blocked.

Jeżeli którakolwiek nie zachodzi: nie startować action.

## 24. Completion revalidation

Busy Action nie może ufać preflight snapshot.

Przy completion ponownie:

1. znaleźć object po id,
2. resolve current condition do aktualnego `now`,
3. sprawdzić `< 100`,
4. sprawdzić required capability,
5. sprawdzić material,
6. consume exactly 1 material,
7. apply repair,
8. advance timestamp,
9. award XP.

Jeśli stan zmienił się w trakcie: fail safely.

## 25. Material transaction

Nie konsumować materiału:

- przy otwarciu inspection,
- przy preview,
- przy starcie Busy Action.

Consume dopiero na successful completion.

Jeżeli material zniknie podczas działania:

```text
no repair
no material consumption by this action
no XP
```

## 26. Cancellation

Esc / Busy cancellation:

```text
no material consumed
no condition restored
no XP
```

Nie persistować partial repair progress.

Repair actions są wystarczająco krótkie, żeby nie wymagały incremental work state.

## 27. Tent inspection

Inspection z `items-player-018` dostaje:

```text
Napraw
```

Przykład:

```text
To twój namiot

Stan: 46%

[Odpocznij]
[Napraw]
[Złóż namiot]
[Zamknij]
```

Repair action disabled states:

```text
100%
→ Stan idealny

no sewing kit
→ Potrzebujesz zestawu do szycia

no hide
→ Potrzebujesz skóry
```

## 28. Bedroll inspection

Dodać/reuse contextual FlavorDialog.

Przykład:

```text
Posłanie

Stan: 58%

Naprawa:
58% → 88%
Koszt: 1× skóra

[Napraw]
[Zamknij]
```

Nie tworzyć `BedrollModal.vue`.

## 29. Platform inspection

Analogicznie:

```text
Podest do spania

Stan: 41%

Naprawa:
41% → 56%
Koszt: 1× gałąź

[Napraw]
[Zamknij]
```

Missing tool:

```text
Potrzebujesz narzędzia do rąbania
```

zgodnie z obecnym capability label.

## 30. Preview

Inspection powinno pokazywać:

```text
current condition → predicted condition
material cost
```

Np.:

```text
Stan: 64% → 94%
Koszt: 1× skóra
```

Preview i actual completion muszą korzystać z tego samego resolvera.

Nie pokazywać graczowi surowych mnożników typu `repair efficiency = 1.04`.

## 31. Repair from condition 0

Condition `0` nie oznacza zniszczenia obiektu.

Obiekt:

- istnieje,
- można inspectować,
- można naprawić,
- zachowuje identity.

Nie dodawać:

- irreparable threshold,
- auto-destruction,
- replacement workflow.

## 32. Repeated repair

Allowed:

```text
20 → 50 → 80 → 100
```

Ostatnia repair może zmarnować część potencjalnych repair points.

Przykład:

```text
93 → 100
```

nadal zużywa pełną 1 sztukę materiału.

Preview pokazuje to przed rozpoczęciem.

Nie implementować fractional materials/refunds.

## 33. Survival XP

Dodać:

```ts
SKILL_XP_AWARD.repairCampEquipment = 6
```

Award once per successfully consumed material unit.

Tylko gdy:

```text
finalCondition > currentCondition
```

Nie awardować za:

- preview,
- failed attempt,
- cancellation,
- already-full object,
- missing material,
- missing tool.

## 34. Packing repaired tent

Przed packing:

```text
resolve tent condition to now
```

Następnie spakowany `TentItemInstance` dostaje dokładnie tę wartość.

Invariant:

```text
world tent 63%
→ pack
→ inventory tent instance 63%
→ save/load
→ deploy
→ world tent 63%
```

## 35. Merchant purchase of tents after migration

Ponieważ `tent` staje się instance-backed, Kupiec musi kupować nowy namiot przez istniejący instance acquisition path.

Nie robić special-case w Merchant UI.

Existing trade code już potrafi:

```text
createAcquiredInstance(kind)
→ inventory.addInstance(instance)
```

dla instance-backed kinds.

Rozszerzyć centralny factory o tent.

Fresh purchased tent:

```text
condition = 100
```

## 36. Tent selling

Po zmianie na instance-backed item sprzedaż powinna przejść przez istniejący instance sell flow.

Jeżeli obecny `resolveInstanceSellPrice()` nie zna tent condition, w tym planie zdecydować:

```text
tent sell price depends on condition
```

Reuse istniejący general pattern dla used instances zamiast traktowania `20%` namiotu jak nowego.

Minimalna zasada:

```text
condition 100% → normal instance sell price
lower condition → monotonic discount
```

Nie tworzyć osobnego merchant subsystem.

Jeśli existing general instance-condition discount helper można reuse, użyć go.

## 37. SaveData

Persistować:

### Inventory tent

```ts
TentItemInstance {
  id,
  kind: 'tent',
  condition
}
```

### Placed tent

```ts
PlacedTent {
  id,
  x,
  z,
  yaw,
  condition,
  lastConditionUpdateAtDays
}
```

Nie persistować:

- repair preview,
- active repair,
- repair history,
- repair multiplier,
- repair definition,
- active Busy Action.

## 38. Migration

Migration musi pokryć:

### Old carried tents

```text
count N
→ N fresh TentItemInstances
```

### Existing placed tents

Po `items-player-018`:

```text
condition / timestamp preserved
```

Jeżeli save pochodzi sprzed condition:

```text
condition = 100
lastConditionUpdateAtDays = appropriate restore/current anchor
```

zgodnie z migration strategy przyjętą w `items-player-018`.

Nie resetować postawionych condition-aware tents podczas migracji do instance-backed inventory.

## 39. Full camp interaction

`Rozbij pełny obóz` nie naprawia nic automatycznie.

Jeżeli znajdzie:

```text
tent 25%
bedroll 40%
platform 70%
```

to reuse tych obiektów zgodnie z ich aktualnym condition.

Repair pozostaje świadomą akcją gracza.

Nie rozszerzać PlayerIntentController o auto-maintenance.

## 40. Tests — sewing kit

Sprawdzić:

```text
sewing_kit → textile_repair
knife → no textile_repair
```

oraz:

- jest w merchant stock,
- kosztuje 18 coin,
- purchase działa przez existing flow,
- save/load inventory zachowuje item.

## 41. Tests — tent identity

Kluczowe:

```text
buy tent
→ instance id A / condition 100
→ deploy
→ world id A
→ degrade/repair to 63
→ pack
→ inventory id A / condition 63
→ deploy
→ world id A / condition 63
```

Nie musi zostać dokładnie użyty `id` jako world id, jeśli aktualna implementacja ma silny powód techniczny przeciwko temu, ale **stable physical identity i condition continuity są wymaganym invariantem**.

Nie wolno resetować condition.

## 42. Tests — repair amount

Dla tent/bedroll/platform:

- condition 0,
- condition 50,
- condition 99,
- Survival 0.2,
- intermediate Survival,
- Survival 1.

Sprawdzić:

```text
result <= 100
result > current
higher Survival => repair amount >= lower Survival
```

## 43. Tests — exact base balance

Sprawdzić expected repair points:

```text
tent base = 25
bedroll base = 34
platform base = 17
```

oraz multiplier:

```text
0.8 + 0.4 * survival
```

## 44. Tests — degradation timestamp

Scenario:

```text
place object day 0
weather degradation until day 3
repair day 3
write repaired condition
lastConditionUpdateAtDays = day 3
resolve again day 3
→ exactly repaired condition
```

Potem:

```text
resolve day 4
→ only weather exposure after day 3 counted
```

## 45. Tests — transaction semantics

Sprawdzić:

1. no capability → no start,
2. no material → no start,
3. condition 100 → no start,
4. cancel → no material/no condition/no XP,
5. object removed during Busy → no material/no XP,
6. material disappears during Busy → no repair,
7. success → exactly 1 material consumed,
8. success → condition increases,
9. success → timestamp advances,
10. success → 6 Survival XP,
11. repeated repair works,
12. final repair clamps at 100.

## 46. Tests — packed tent exploit

Explicit regression:

```text
tent condition = 10
→ pack
→ deploy
```

Expected:

```text
condition = 10
```

Never:

```text
condition = 100
```

## 47. Tests — save/load

Check:

```text
carried damaged tent
→ save/load
→ same condition
```

and:

```text
placed damaged/repaired tent
→ save/load
→ same resolved state
```

plus existing bedroll/platform persistence.

## 48. UI/domain boundary

Vue może:

- renderować condition,
- renderować predicted result,
- renderować disabled reason,
- invoke action.

Vue nie może:

- obliczać repair amount,
- sprawdzać tool kind,
- obliczać Survival multiplier,
- konsumować materiału,
- mutować condition,
- resolve weather degradation.

## 49. Documentation

Po implementacji zaktualizować:

- `docs/items/CATALOG.md`,
- player systems,
- camp/rest documentation,
- sleeping utilities,
- persistence docs jeśli schema zmienia się przez `TentItemInstance`,
- merchant documentation,
- implementation notes zgodnie z `docs/plans/PLANNING.md`.

Wyraźnie udokumentować:

```text
tent is instance-backed
condition survives pack/redeploy
repair material ≠ construction recipe
tool capability ≠ skill
```

Dodać JSDoc dla ważnych publicznych/domain helpers i klas, szczególnie repair resolvera, tent instance lifecycle oraz condition mutation. Użyć `@domain items-player` tam, gdzie pasuje do istniejącej konwencji.

Nie uruchamiać ręcznie `pnpm docs:sync`.

## Out of scope

- weapon durability repair,
- sharpening,
- clothing durability,
- armor durability,
- sewing kit durability,
- crafting sewing kit,
- crafting tent,
- cloth item/material,
- tailoring profession,
- Repair skill,
- Crafting skill,
- Construction skill,
- NPC repair,
- paid repair service,
- Work Contracts for repair,
- automatic maintenance,
- auto-repair during sleep,
- auto-repair in Full Camp,
- irreparable condition,
- object destruction at 0,
- material quality,
- tool quality,
- repair RNG,
- repair animation work beyond reusing available generic action/busy presentation.

## Completion criteria

Plan jest zakończony, gdy:

- istnieje `textile_repair`,
- `sewing_kit` zapewnia capability,
- sewing kit kosztuje 18 coin i jest dostępny u Kupca,
- namiot i bedroll wymagają `textile_repair`,
- platform wymaga `wood_chopping`,
- tent repair używa `hide`,
- bedroll repair używa `hide`,
- platform repair używa `branch`,
- base repair values to odpowiednio `25 / 34 / 17`,
- Survival zwiększa material efficiency przez jedną shared formułę,
- Survival skraca Busy duration przez istniejący helper,
- repair reuse physical effort,
- każda action konsumuje maksymalnie jedną jednostkę materiału,
- repair jest incremental,
- condition jest resolve do current time przed naprawą,
- successful repair przesuwa degradation timestamp,
- preview i actual result używają tego samego resolvera,
- tent/bedroll/platform mają contextual repair UI,
- repair awards Survival XP tylko po sukcesie,
- `tent` jest instance-backed,
- condition namiotu przeżywa pack → inventory → save/load → redeploy,
- spakowanie nie może resetować condition,
- fresh merchant tent zaczyna na 100%,
- nie powstał równoległy repair/crafting framework,
- automated tests przechodzą,
- implementation notes i canonical docs są aktualne.

## Manual verification

Browser/manual verification wykonuje User, nie AI.

Zweryfikować ręcznie co najmniej:

- zakup `sewing_kit` u Kupca,
- repair namiotu z camp inspection,
- repair bedrolla,
- repair platformy,
- missing-tool i missing-material feedback,
- cancellation bez zużycia materiału,
- wyższy Survival skraca czas i zwiększa repair gain,
- condition namiotu przeżywa pack → save/load → redeploy,
- repaired condition poprawnie degraduje się dalej od nowego timestamp.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
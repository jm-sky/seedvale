# Plan: Player camp repair and sewing kit

**Created:** 2026-09-06
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** items-player-018, settlements-006, items-player-021, world-021
**Domain:** `items-player`
**Subdomains:** `items` `interaction` `player-needs`
**Tags:** `repair` `camp` `condition` `tools`
**Roadmap:** -

## Goal

Dodać naprawę player-built camp equipment:

- tent,
- bedroll,
- raised sleeping platform,

jako cienkiego consumera istniejących mechanizmów condition, Inventory/item instances, item capabilities, Busy Action, physical effort, targeted skill actions oraz actor-neutral `RepairProgress` z `world-021`.

Nie tworzyć drugiego repair frameworku, osobnego targeting pipeline ani camp-specific persistence managera.

## Current foundation on `main`

### `items-player-018`

Już istnieją:

- `PlacedTent.condition` + `lastConditionUpdateAtDays` w `src/items/createPlacedTents.ts`,
- `BedrollRecord.condition` / `PlatformRecord.condition` + anchor w `src/world/sleepingUtilities.ts`,
- lazy weather-driven condition przez `resolveWeatherDrivenCondition()` / `resolveSleepingUtilityCondition()`,
- condition `0..100`, bez auto-destruction.

### `items-player-021`

Reuse bez rozszerzania frameworku:

- `SkillId = 'repair'`, standard player skill XP/persistence,
- `evaluateSkillCompetence(skills, 'repair', support?)`,
- runtime `targetedSkillSelection`,
- `queryTargetedSkillAction()` / `executeTargetedSkillAction()` w `src/interaction/targetedSkillAction.ts`.

Aktualny targeted-skill seam jest prostym dispatcherem po `(skill, Interactable)` i rewaliduje live state przy execute. Dodać camp Repair jako kolejnego consumera tego samego seama; nie budować rejestru/managera tylko dla 019.

### `world-021`

Canonical shared API już istnieje w `src/world/repair.ts`:

```ts
type RepairProgress = {
  startedCondition: number
  targetCondition: number
  requiredWork: number
  completedWork: number
}

repairRemainingWork(progress)
isRepairComplete(progress)
applyRepairWork(progress, workAmount)
```

`RepairProgress` nie zna materiałów, aktora, skilla ani target kind. Te decyzje pozostają w ownerze domeny.

Player-built well pokazuje aktualny wzorzec integracji:

- target record posiada optional `roofRepair?: RepairProgress`,
- owner expose `startRoofRepair(...)`,
- owner expose `contributeRoofRepairWork(...)`,
- completion ustawia condition, czyści progress i resetuje anchor.

Camp objects powinny użyć tego samego ownership patternu.

## Responsibility model

```text
camp object owner
→ authoritative condition + optional RepairProgress

camp repair policy
→ materials + capability + required work + effort + target condition

Repair skill
→ primary competence

Inventory
→ materials + capability/tool availability

Busy Action
→ pojedynczy work bout

world/repair.ts
→ actor-neutral work math
```

`Repair` jest primary skill. `Survival` może być tylko optional support przez istniejący `evaluateSkillCompetence`; jeżeli nie daje prostego, czytelnego efektu bez nowej formuły, pominąć jego wpływ w v1.

Bez RNG.

## Supported repair policy

| Object | Capability | Repair material | Effort |
| --- | --- | --- | --- |
| tent | `textile_repair` | `hide` | light |
| bedroll | `textile_repair` | `hide` | light |
| platform | `wood_chopping` | `branch` | moderate |

Player v1 zawsze naprawia do `targetCondition = 100`.

Koszt materiałów i `requiredWork` mają być deterministyczne i rosnąć wraz ze skalą uszkodzenia. Preview i authoritative start muszą korzystać z jednego pure resolvera camp-domain, np. `resolveCampRepairQuote(...)`.

Nie tworzyć repair-specific odpowiednika `MaterialRequirement`; reuse `src/items/constructionMaterials.ts`.

## Sewing kit

Rozszerzyć istniejący capability mechanism:

```ts
ItemCapability += 'textile_repair'
```

oraz `CAPABILITY_NEED_LABEL` zgodnie z aktualnym patternem.

Dodać `sewing_kit` do zwykłego item catalogu jako reusable, non-consumable utility:

- label: `zestaw do szycia`,
- weight: `0.4 kg`,
- size zgodny z aktualną enum (`SM`, jeżeli nadal jest właściwym odpowiednikiem małego utility item),
- holdable: false,
- capability: `textile_repair`,
- bez durability w tym planie.

Gate:

```ts
inventory.hasCapability('textile_repair')
```

Nie sprawdzać `kind === 'sewing_kit'` w repair action.

Acquisition: reuse merchant stock/pricing; cena `18 coin`. Bez crafting recipe, world spawn i quest reward.

## Tent inventory continuity

Aktualny `tent` nadal jest stackowanym itemem, podczas gdy postawiony namiot ma już condition. To pozostaje jedyną większą migration częścią tego planu.

Dodać `TentItemInstance` do centralnego instance mechanism z `src/items/itemInstances.ts`:

```ts
type TentItemInstance = ItemInstance & {
  kind: 'tent'
  condition: number
}
```

Rozszerzyć centralnie:

- `INSTANCE_BACKED_KINDS`,
- type guard/clone path,
- Inventory acquisition/restore/save boundaries,
- merchant purchase/sell paths, gdzie dotyczą instance-backed items,
- placement/packing/Quick Actions callers, które dziś zakładają stackowany tent.

Nie używać `clamp01()` dla tent condition; camp condition jest `0..100`.

### Identity invariant

Preferować:

```text
TentItemInstance.id == PlacedTent.id
```

Placement ma przenosić konkretną carried instance do world state zamiast generować nowe `tent:${Date.now()}:...` identity.

Packing:

1. relookup tent,
2. block, jeśli ma active repair,
3. resolve/checkpoint condition do `now`,
4. sprawdź `inventory.canAddInstance(...)`,
5. dopiero wtedy usuń world tent i dodaj tę samą instance id + condition do Inventory.

Redeploy ustawia:

```text
condition = instance.condition
lastConditionUpdateAtDays = currentWorldDays
```

Packed tent nie degraduje się od weather.

### Legacy save migration

Legacy stack:

```text
tent count N
→ N fresh TentItemInstances(condition = 100)
→ legacy count removed
```

Migration ma użyć aktualnego persistence migration pipeline. Po restore nie mogą istnieć równolegle stackowane tents i tent instances.

Placed tents z `items-player-018` zachowują zapisane condition/anchor.

## Camp repair state ownership

Rozszerzyć istniejące authoritative records:

```ts
PlacedTent.repair?: RepairProgress
BedrollRecord.repair?: RepairProgress
PlatformRecord.repair?: RepairProgress
```

Nazwę pola można dopasować do lokalnej konwencji, ale ownership ma zostać na world target recordzie i być persistowany razem z nim.

Nie persistować Busy Action.

Camp owner APIs powinny mirrorować sprawdzony wzorzec `createPlayerWells`:

```text
conditionOf/describe current state
startRepair(id, ...)
contributeRepairWork(id, workAmount, nowDays)
```

App/UI nie mutuje recordów ani `RepairProgress` bezpośrednio.

## Repair start transaction

Authoritative start:

```text
relookup target
→ resolve current lazy condition
→ derive fresh camp repair quote
→ validate condition < target and no active repair
→ validate action is not blocked
→ validate capability
→ validate all materials
→ atomically consume/commit materials
→ checkpoint condition + anchor
→ create RepairProgress
```

Nie checkpointować condition na failed preflight tylko po to, by zapisać odczyt — zachować semantics użyte przez `world-021` well repair.

Po utworzeniu episode materiały są committed. Resume nie konsumuje ich ponownie.

## Work bout and completion

Busy Action reprezentuje pojedynczy bout pracy, nie cały lifecycle naprawy.

Podczas pracy:

```text
elapsed useful work
→ domain owner
→ applyRepairWork(...)
→ acceptedWork
```

Interruption:

- zachowuje `completedWork`,
- zachowuje committed materials,
- nie usuwa active repair.

Resume rewaliduje target, active repair i wymagany capability/tool.

Completion przez domain owner:

```text
condition = targetCondition
repair = undefined
lastConditionUpdateAtDays = completionNowDays
```

Environmental degradation podczas active repair ma być zamrożone tak jak w `world-021` consumerze.

## Targeted/contextual interaction

Obie drogi mają trafiać do tego samego domain action:

```text
camp inspection dialog → Napraw / Kontynuuj naprawę
Repair targeting mode + Interactable → ten sam start/resume path
```

Rozszerzyć istniejący `TargetedSkillQueryContext`, action id union i dispatcher tylko o wymagane camp lookup/action seams.

Nie dodawać repair formula ani mutable state do generic `Interactable`.

Nie tworzyć `TentRepairModal` / `BedrollRepairModal` / `PlatformRepairModal`; reuse istniejący contextual/FlavorDialog mechanism.

UI pokazuje authoritative quote/progress i disabled reason, ale nie oblicza kosztów, work time, skill modifiers ani condition.

## Skill and XP

`Repair` jest primary competence.

Use:

```ts
evaluateSkillCompetence(skills, 'repair', optionalSupport)
```

Camp policy może wykorzystać Repair do efektywnego work duration/required work. Nie dodawać global weighted-average engine.

Repair XP przyznawać tylko za meaningful accepted/completed work zgodnie z istniejącym `awardSkillXp()` patternem. Nie za preview, targeting, failed start ani start/cancel bez useful work.

Cadence musi uniemożliwiać farming przez wielokrotne resume/cancel.

## Trading

Po przejściu tents na instances:

- merchant purchase tworzy fresh tent instance `condition = 100`,
- selling damaged tent używa istniejącego instance-aware trade path,
- rozszerzyć condition-aware pricing tylko tam, gdzie pasuje do obecnego trade ownership,
- nie zmieniać trap/weapon special semantics przy okazji.

## Conflicting operations

W v1:

- active tent repair blokuje packing,
- operacje usuwające/przenoszące bedroll/platform podczas active repair także mają być zablokowane, jeśli istnieją,
- Full Camp setup nie naprawia automatycznie i nie resetuje condition.

Condition `0` nadal oznacza istniejący, naprawialny obiekt.

## Relevant files / expected touch points

Focused implementation powinna zacząć od aktualnych plików:

- `src/world/repair.ts`
- `src/world/condition.ts`
- `src/items/createPlacedTents.ts`
- `src/world/sleepingUtilities.ts`
- owners/creation seams dla bedroll/platform
- `src/items/itemInstances.ts`
- `src/items/Inventory.ts`
- `src/items/itemCatalog.ts`
- `src/items/items.ts`
- `src/items/trade.ts`
- merchant catalog/stock definitions
- `src/player/PlayerSkills.ts`
- `src/player/skillEvaluation.ts`
- `src/player/targetedSkillSelection.ts`
- `src/interaction/targetedSkillAction.ts`
- `src/app/actions/placementActions.ts`
- camp inspection/rest/interaction actions
- `src/persistence/saveData.ts` + current migrations

Nie zakładać nazw nowych helperów poza istniejącymi API; dopasować exact signatures do aktualnych ownerów.

## Tests

Najwyższy priorytet mają boundary/regression tests:

1. legacy stack tents → wyłącznie tent instances po migration,
2. merchant purchase → fresh instance condition `100`,
3. damaged tent pack/redeploy/save-load zachowuje id + condition,
4. inventory-full packing nie usuwa world tent,
5. active tent repair blokuje packing,
6. Quick Actions/placement działają z instance-backed tent,
7. clone/save/restore zachowuje tent condition,
8. same resolver obsługuje preview i authoritative start,
9. no capability/materials/full condition → no start/no consumption,
10. valid start konsumuje materiały dokładnie raz i zapisuje `RepairProgress`,
11. interruption/resume zachowuje accepted work i nie konsumuje materiałów ponownie,
12. completion ustawia target condition dokładnie raz, czyści repair i resetuje anchor,
13. save/load mid-repair zachowuje progress,
14. Repair XP nie da się farmić start/cancel/resume,
15. condition `0` jest naprawialne,
16. targeted Repair i normal inspection trafiają do tego samego action path.

## Out of scope

- weapon/tool durability repair,
- sharpening,
- clothing/armor durability,
- sewing kit durability,
- crafting sewing kit/tent,
- cloth/tailoring system,
- generic inventory-item repair framework,
- player-selectable partial target condition,
- NPC autonomous repair,
- paid repair service / Work Contracts,
- automatic maintenance/auto-repair,
- explicit repair abandonment/refunds,
- irreparable threshold / destruction at condition 0,
- repair RNG,
- dedicated repair animation framework.

## Completion criteria

Plan jest zakończony, gdy:

- `sewing_kit` zapewnia `textile_repair` i jest dostępny u merchant za 18 coin,
- tent/bedroll/platform korzystają z shared `RepairProgress` i owner-local lifecycle methods,
- repair start atomically commits materiały, Busy bouts dokładają actor-neutral work, interruption/resume zachowuje progress,
- completion ustawia condition na 100 i resetuje degradation anchor,
- `Repair` jest primary skill i dostaje XP tylko za useful work,
- targeted Repair oraz zwykła interakcja reuse ten sam action path,
- tent jest instance-backed i zachowuje physical id + condition przez inventory/world/save-load,
- active repair nie może zostać zgubiony przez packing/removal,
- nie powstał parallel repair/targeting/persistence framework,
- automated tests przechodzą,
- canonical docs i implementation notes są aktualne.

## Manual verification

Browser/manual verification wykonuje User, nie AI.

Zweryfikować ręcznie co najmniej:

- zakup sewing kit,
- repair tent/bedroll/platform,
- missing-tool/material feedback,
- interruption + resume,
- save/load mid-repair,
- active tent repair blokuje packing,
- tent condition/id przeżywa pack → save/load → redeploy,
- repaired objects degradują się dalej od completion timestamp.

Nie uruchamiać ręcznie `pnpm docs:sync` — GitHub workflow robi to automatycznie.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
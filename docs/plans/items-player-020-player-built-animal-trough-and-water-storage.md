# Plan: Player-built animal trough and water storage

**Created:** 2026-09-08
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** ~~items-player-017~~
**Domain:** `items-player`  
**Type:** `feature`  
**Roadmap:** `horse-and-riding.md`

## Cel

Pozwolić graczowi zbudować persistent poidło/koryto, napełniać je rzeczywistą wodą z istniejących `LiquidContainerItemInstance` i udostępnić skończony zapas wody istniejącemu pipeline'owi thirst/foraging zwierząt.

Docelowy flow:

```text
place trough
→ existing GroundPlacementDefinition validation
→ persistent unfinished world object
→ existing actor-neutral contributeWork(...)
→ completed trough
→ transfer water from carried liquid container
→ finite waterLitres
→ existing animalForaging water search
→ completion-time live validation + first-wins consume
→ existing AnimalLife.drinkWater()
```

Nie tworzyć `HorseTrough`, `WaterStorageManager`, `ConstructionManager`, trough-specific animal FSM ani drugiego sensing/foraging systemu.

## Aktualny punkt wyjścia po fauna-017

Current `main` po `fauna-017` ma już właściwy podział odpowiedzialności:

- `src/fauna/animalForaging.ts` posiada selekcję źródeł, completion-time validation i finalne resource consumption/relief,
- `AnimalAgent` nadal składa `ForagingContext`, prowadzi movement/timer i przechowuje cached `sourceTarget`, ale nie powinien odzyskiwać logiki water-source policy,
- `AnimalLife.ts::drinkWater()` pozostaje authority dla thirst relief,
- household livestock preferuje dziś `Household.water` przez `findTroughTarget()` przed natural shoreline,
- household trough jest obecnie reprezentowany w `SourceTarget` przez `kind: 'water'` + `trough?: boolean`,
- `LiquidContainerItemInstance` i `src/items/liquidContainer.ts` są authority dla ilości/capacity/content cieczy,
- placement używa `GroundPlacementDefinition` / `evaluatePlacementSite()` / `previewGroundPlacement()`,
- małe player-built structures mają własne małe runtime ownery w `WorldBundle`, zamiast wspólnego `PlayerBuiltStructureManager`,
- incremental construction jest actor-neutral przez `contributeWork(...)`,
- save schema jest obecnie versioned i ma `CURRENT_SAVE_VERSION = 20`.

Plan rozszerza te seams. Nie cofa modularizacji `fauna-017`.

## 1. Player-built trough state ownership

Trough powinien być osobnym persistent player-built world objectem według istniejącego wzorca `standingTorch` / `createStandingTorches` i `palisade` / `createPalisades`.

Preferowany podział:

- `src/world/playerTrough.ts` — plain record, stałe i pure domain helpers,
- `src/world/createPlayerTroughs.ts` — runtime owner: records/mesh, placement, construction work, water mutation/query, persistence snapshot, dispose,
- `WorldBundle.playerTroughs` — lifetime/rebuild ownership.

Authoritative per-instance record semantycznie:

```ts
type PlayerTroughRecord = {
  id: string
  x: number
  z: number
  yaw: number
  completedWork: number
  waterLitres: number
}
```

Pojemność i wymagane work hours są stałymi dla typu, nie polami per record.

Invariant:

```text
0 <= waterLitres <= PLAYER_TROUGH_CAPACITY_LITRES
```

Nie persistować derived `hasWater`, `isFull`, `completed` ani visibility mesh.

## 2. Placement i construction

Dodać trough jako kolejnego consumera obecnego placement contractu:

- `src/app/actions/placementActions.ts::GroundPlacementDefinition`,
- `evaluatePlacementSite()`,
- `previewGroundPlacement()`.

Placement tworzy realny persistent record z:

```text
completedWork = 0
waterLitres = 0
```

Materiały są pobierane przy skutecznym placement przez istniejący `constructionMaterials` flow. Nie rozdzielać kosztu materiałów między work bouts.

Construction ma używać tego samego actor-neutral contractu co `StandingTorches.contributeWork()` / `Palisades.contributeWork()`:

```text
contributeWork(id, requestedHours)
→ clamp do remaining work
→ acceptedWork
→ completion derived from completedWork
```

Unfinished trough:

- rezerwuje swój placement footprint,
- może oferować istniejącą interaction action do budowy,
- nie przyjmuje wody,
- nie jest publikowany jako fauna water source.

## 3. Liquid-container transfer

`src/items/liquidContainer.ts` pozostaje authority dla container content/capacity, a `Inventory.updateInstance()` dla podmiany instance state.

Akceptować każdy `LiquidContainerItemInstance` z `liquid === 'water'`; nie wymagać konkretnego bucket/waterskin kind.

Transfer:

```text
transfer = min(container.amountLitres, trough free capacity)
```

Jedna domenowa/action operation ma:

1. odczytać live container instance,
2. odczytać live completed trough,
3. ponownie zwalidować wodę i free capacity,
4. wyliczyć dokładny transfer,
5. wykonać synchroniczny commit obu stron,
6. zachować ten sam item instance id.

Po opróżnieniu container użyć canonical state:

```ts
{ liquid: null, amountLitres: 0 }
```

Nie mutować `LiquidContainerItemInstance` in-place. Jeśli fill action jest timed, żadna strona nie zmienia się przed successful completion.

## 4. Fauna water-source integration

Player-built trough ma rozszerzyć `src/fauna/animalForaging.ts`; nie dodawać osobnego animal behaviour.

Istniejące seams pozostają właściwe:

- `ForagingContext`,
- `findWaterTarget()`,
- `isSourceTargetValid()`,
- `applySourceRelief()`.

### Provider seam

Do `ForagingContext` wstrzyknąć opcjonalny, narrow provider/query+consume contract należący do world/items ownera, semantycznie:

```ts
type AnimalWaterSourceProvider = {
  queryAvailableNear(x: number, z: number, radius: number): readonly {
    id: string
    x: number
    z: number
  }[]
  isAvailable(id: string): boolean
  consume(id: string, litres: number): boolean
}
```

Dokładna nazwa może być inna. Wymagania:

- provider nie zwraca `WorldBundle`, managera ani mutable recordów,
- query zwraca tylko completed + non-empty troughs,
- `consume()` ponownie odczytuje live record i jest first-wins/atomic,
- brak globalnego per-frame scan; query następuje tylko podczas istniejącego water search,
- przy małej liczbie player troughs liniowy lokalny scan jest akceptowalny V1.

### Water target representation

Obecne `SourceTarget.trough?: boolean` oznacza wyłącznie household reserve i nie skaluje się do drugiego finite water source.

Zastąpić boolean małym discriminated water-source refem tylko dla `kind: 'water'`, np. semantycznie:

```ts
type WaterSourceRef =
  | { kind: 'natural' }
  | { kind: 'household' }
  | { kind: 'playerTrough', id: string }
```

`SourceTarget` nadal pozostaje ogólnym cached destination. Dla player trough zapisuje tylko stable id + pozycję; nie cache'uje `waterLitres` ani mutable recordu.

Nie tworzyć osobnego `PlayerTroughTarget` FSM ani sourceTarget collection poza `animalForaging`.

## 5. Query, validation i consume contract

`findWaterTarget()` zachowuje istniejący needs-resolution flow.

V1 hierarchy ma pozostać jawna i łatwa do zmiany. Minimum:

```text
household-owned livestock with household water
→ existing household trough
→ eligible nearby player-built trough
→ natural shoreline fallback
```

Player trough nie może automatycznie stać się globalnym attractorem wszystkich wild animals. Eligibility należy do fauna water-selection policy; provider ma być neutralny wobec ownership/species.

`isSourceTargetValid()` dla player trough musi live-checkować co najmniej:

- source nadal istnieje,
- construction nadal jest completed,
- wystarcza co najmniej jedna `TROUGH_DRINK_AMOUNT` porcja,
- target pozostaje w dopuszczalnym roam/walkability context zgodnie z istniejącym pipeline.

`applySourceRelief()`:

```text
playerTrough.consume(id, TROUGH_DRINK_AMOUNT) === true
→ drinkWater(ctx.life)

consume === false
→ no relief
→ existing cancel/retry/replan path
```

Dwa animals konkurujące o ostatnią porcję nie mogą dostać relief z tej samej wody.

Natural shoreline pozostaje nieskończonym źródłem i nie zużywa storage.

Household trough nadal zużywa `Household.water`; nie przepinać settlement trough na player trough storage w tym planie.

## 6. `AnimalAgent` seam po fauna-017

`AnimalAgent` zmieniać tylko w zakresie dependency threading potrzebnego do utworzenia aktualnego `ForagingContext`.

Nie dodawać tam:

- trough discovery,
- trough scoring,
- water consumption,
- ownership-specific horse branches.

`AnimalAgent` nadal odpowiada za:

```text
sourceTarget cache
→ steer/pursuit
→ interaction timer
→ call isSourceTargetValid/applySourceRelief through animalForaging
```

## 7. Household trough i fauna-020

`fauna-020` jest nadal planem, nie current ownership API. Ten plan nie zależy od niego.

Player-built trough ma działać jako ogólna infrastruktura world/fauna niezależnie od player ownership.

Jeżeli `fauna-020` zostanie wdrożone wcześniej:

- użyć jego authoritative owner/control state tylko do eligibility/preference,
- nie duplikować ownership w trough,
- nie dodawać `isPlayerHorse`, `playerOwnedHorse` ani `ownerHouseId === undefined` jako proxy player ownership.

## 8. Presentation

Reuse `src/settlement/settlementStructures.ts::createTrough()` jako proceduralnego visual/fallback, ale runtime logika nie może zależeć od anonimowego `children[n]`.

Przed reuse dodać stabilny visual seam, np. named/userData water mesh albo mały wrapper:

```text
{ object, setHasWater(hasWater) }
```

Player trough visibility:

```text
waterLitres <= 0 → water surface hidden
waterLitres > 0  → water surface visible
```

Aktualizować po spawn/restore i po zmianie `waterLitres`, nie per frame.

Publiczne settlement trough visuals nie przejmują realnego player-trough storage; ich authority nadal jest household state.

## 9. Interaction

Reuse istniejącego gaze/context interaction pipeline:

- `src/interaction/Interactable.ts`,
- `src/app/interactables.ts`,
- istniejący dispatch/actions w app layer.

Precedence:

```text
unfinished → build/work action
completed + carried compatible water + free capacity → fill action
completed + no usable water → feedback
completed + full → feedback
```

Nie tworzyć management screen.

Nie dodawać demolition/removal UX tylko na potrzeby tego planu. Query/consume musi jednak bezpiecznie failować dla missing id.

## 10. WorldBundle i persistence

Dodać małego runtime ownera do `src/app/worldBundle.ts` zgodnie z obecnymi player-built systems:

- create przy world-bundle build,
- carry records przez in-session rebuild,
- dispose z bundle,
- expose `nodes()`/snapshot semantics,
- przekazać narrow provider do fauna/livestock update wiring bez importowania `WorldBundle` w `animalForaging.ts`.

`src/app/saveState.ts::buildSaveData()` zapisuje `bundle.playerTroughs.nodes()`.

`src/persistence/saveData.ts`:

- dodać plain save shape dla troughs,
- validator current shape,
- przy required top-level field wykonać normalny kolejny schema bump/migration z defaultem `[]`, zgodnie z aktualnym versioned migration pipeline,
- nie zakładać starego numeru wersji; current recon baseline ma `CURRENT_SAVE_VERSION = 20`.

Save/load i in-session rebuild zachowują:

- stable id,
- x/z/yaw,
- partial `completedWork`,
- `waterLitres`.

## 11. Performance

Nie dodawać:

- world-wide trough scan per animal per frame,
- osobnego sensing ticku,
- spatial indexu bez profilu uzasadniającego koszt.

Lookup wykonuje się tylko, gdy istniejący needs pipeline faktycznie szuka wody. Provider może V1 wykonać prosty scan własnej małej collection i odfiltrować po radius/completion/water.

## Implementation order

1. `playerTrough.ts`: record, capacity/work constants, invariants, remaining/completion helpers.
2. `createPlayerTroughs.ts`: runtime owner, mesh, placement footprint, `contributeWork`, `addWater`/`consumeWater`, local query, `nodes()`.
3. Placement + interaction for unfinished work; wire owner through `WorldBundle` rebuild/dispose.
4. SaveData/saveState + migration/default + persistence tests.
5. Container → trough fill action with completion-time revalidation and two-sided commit.
6. `animalForaging.ts`: replace water `trough?: boolean` with discriminated source ref; preserve household + natural behavior.
7. Thread narrow player-trough provider into `ForagingContext` creation/update call-sites; add player-trough query/validation/consume branch.
8. Derived water visual visibility.
9. Focused regression/cross-domain tests.

## Focused tests

Najwyższa wartość:

- placement preview i confirm używają tego samego existing validation contract,
- newly placed trough ma `completedWork = 0`, `waterLitres = 0`,
- `contributeWork` clampuje i completion jest derived,
- unfinished trough nie przyjmuje wody i nie pojawia się w provider query,
- completed trough przyjmuje tylko wodę i tylko do capacity,
- partial container / partial free capacity zachowują dokładny bilans litrów,
- failed/revalidated transfer nie zmienia żadnej strony,
- emptied container dostaje canonical `liquid: null, amountLitres: 0`,
- provider zwraca tylko lokalne completed/non-empty troughs,
- cached player-trough target po opróżnieniu jest invalid,
- `consume(id, amount)` jest first-wins dla dwóch konkurujących animals,
- thirst relief następuje tylko po successful `consume`,
- household trough nadal usuwa `Household.water`,
- natural shoreline nadal działa jako fallback,
- player trough nie wymaga `fauna-020` ownership API ani horse-specific branch,
- save/load i `WorldBundle` rebuild zachowują partial construction + `waterLitres`,
- migration starszego save daje pustą collection player troughs,
- water mesh visibility jest derived, nie persisted.

## Manual verification

Wykonuje użytkownik w przeglądarce po implementacji. Agent AI nie wykonuje browser verification.

## Non-goals

Poza zakresem:

- zakup/quest reward konia,
- player-owned animal lifecycle / Follow / Stay (`fauna-020`),
- stajnia,
- automatyczny refill ze studni,
- pipes/irrigation,
- NPC water hauling,
- rain filling,
- evaporation/freezing/contamination,
- przebudowa publicznych settlement troughs,
- feeding trough/hay feeder,
- direct player drinking from trough,
- demolition UX,
- nowy GLB trough asset.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

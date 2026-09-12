# Plan: Systemic settlement structure condition and shared repair

**Created:** 2026-09-12  
**Status:** `verification needed` 🔍  
**Type:** feature  
**Priority:** high · **Effort:** L  
**Depends on:** ~~world-020~~, ~~world-021~~, ~~settlements-005~~, ~~items-player-017~~  
**Domain:** `settlements`  
**Subdomains:** `buildings` `development`  
**Tags:** `condition` `repair` `npc` `player` `persistence`  
**Roadmap:** -

## Cel

Dodać jeden systemowy lifecycle stanu technicznego i napraw struktur osady, wspólny dla symulacji, NPC, gracza i późniejszych questów.

Docelowy przepływ:

```text
structure condition
→ damage/problem
→ NPC pressure lub player interaction
→ shared repair requirements/progress
→ materiały + praca
→ condition restored
→ world/household/quest reacts
```

Naprawa nie może być osobnym systemem dla NPC, gracza ani questów.

## Najważniejsze decyzje po reconie

1. Reuse `src/world/condition.ts` jako jedynego wspólnego math dla `0..100` condition i checkpoint-before-mutate.
2. Reuse `src/world/repair.ts` jako jedynego actor-neutral work-progress math (`RepairProgress`, `applyRepairWork`, `isRepairComplete`).
3. Mutable condition nie trafia do deterministycznego `VillagePlan`. Stable identity bierze się z `VillagePlan.buildings[].id`; mutable state żyje w settlement-owned registry.
4. Registry ma być własnością `SettlementsManager`, analogicznie do `HouseholdRegistry`, `EconomyRegistry`, `NpcStateRegistry` i rat infestation state. Runtime `Settlement` / Three.js pozostają projekcją.
5. Shared repair target ma posiadać requirements/progress i atomic material preflight/commit. Player inventory i NPC/settlement material source są adapterami do tego samego targetu, nie osobnymi repair flows.
6. NPC wykrywa problem z read-only structure snapshot i produkuje pressure do istniejącej `NpcDecisionTarget` arbitration. Nie tworzyć osobnego maintenance AI managera.
7. Gracz używa istniejącego interaction/inspection + `BusyAction` / construction-work-session pattern i zasila dokładnie ten sam `contributeRepairWork` target co NPC.
8. Quest layer później dostaje narrow read-only lookup po stable structure id i obserwuje aktualny condition/repair state; nie dostaje repair flags ani własnego progressu.

## Scope V1

Plan obejmuje:

- authoritative condition state dla fizycznych budynków osady posiadających stable `VillageBuildingPlan.id`,
- initial adapter dla residential settlement houses; kolejne role budynków mają wejść przez ten sam registry/definition contract,
- explicit damage mutation seam bez wdrażania jeszcze pełnych źródeł pogoda/atak/pożar/zużycie,
- derived damaged/problem snapshot,
- shared repair quote/start/progress/completion,
- shared material requirements i actor-neutral work contribution,
- NPC pressure + decyzję + wykonanie naprawy,
- player inspection/interakcję + manualną naprawę,
- streaming/rebuild/save/load persistence,
- narrow quest-facing observation seam,
- test/debug seam pozwalający uszkodzić strukturę bez quest-specific flag.

## Non-goals

Nie implementować w tym planie:

- osobnego questowego scenariusza naprawy,
- proceduralnych katastrof,
- pożaru budynków,
- damage od combat/projectiles,
- weather wear dla wszystkich budynków,
- zawalenia / destruction mesh stages,
- nowego crafting/resource systemu,
- nowego globalnego maintenance managera,
- per-frame skanów wszystkich budynków przez każdego NPC.

## 1. Authoritative structure state

### Stable identity

Źródłem identity jest statyczny plan osady:

```text
SettlementDef.plan.buildings[].id
```

Nie używać:

- indeksu runtime mesh,
- `Object3D.uuid`,
- `SettlementLandmarks.houses[i].houseId` (to visual variant id),
- losowego runtime UUID.

### Mutable registry

Dodać settlement-owned plain-data registry, np. `SettlementStructureStateRegistry` w `src/settlement/`.

Minimalny rekord:

```ts
type SettlementStructureState = {
  structureId: string
  settlementId: string
  condition: number
  lastConditionUpdateAtDays: number
  repair?: RepairProgress
}
```

Dokładny shape dopasować do istniejących persistence conventions. Jeżeli brak rekordu może jednoznacznie oznaczać pristine `100`, preferować sparse persistence, ale runtime lookup musi zawsze zwracać pełny resolved snapshot.

`VillagePlan` pozostaje immutable/deterministic i nie przechowuje condition.

### Registry ownership

`SettlementsManager` powinien:

- tworzyć/restore registry,
- udostępniać fresh-resolving lookup niezależny od streamingu,
- snapshotować state do save,
- przekazywać narrow structure hooks do `createSettlement` / NPC context,
- nie uzależniać condition od tego, czy runtime settlement jest aktualnie loaded.

## 2. Shared structure definition / repair policy

Wprowadzić mały data-only contract opisujący repairable structure kind/role, zamiast kodować koszty w UI albo NPC.

Powinien dostarczać co najmniej:

```text
label / role
repair threshold
repair target condition
repair material requirement policy
repair required-work policy
optional importance/maintenance weight
```

V1 może mapować residential `VillageBuildingPlan` na jeden policy family.

### Requirements

Requirements są wyliczane z:

```text
structure definition
+ resolved current condition
+ target condition
→ MaterialRequirement[] + requiredWork
```

Reuse `MaterialRequirement` / `foldMaterialRequirements` z istniejącego construction material modelu.

Nie duplikować kosztów w:

- NPC work,
- player dialog,
- quest definitions.

## 3. Repair lifecycle

Shared target API powinno rozdzielić read-only quote od mutacji, zgodnie z landed well repair:

```text
resolve current condition
→ quoteRepair(structureId)
→ preflight materials
→ consume atomically
→ checkpoint condition
→ create RepairProgress
→ contributeRepairWork(actor-neutral amount)
→ completion writes targetCondition
```

Wymagania:

- failed material preflight niczego nie zużywa i nie przesuwa condition anchor,
- rozpoczęty repair nie pobiera ponownie materiałów przy resume,
- `applyRepairWork` jest jedynym math postępu,
- contribution jest clampowane do remaining work,
- completion checkpointuje restored condition i usuwa active repair,
- aktywny repair nie może zostać skasowany przez settlement stream-out/rebuild.

### Material source adapter

Nie tworzyć osobnych repair implementations.

Wspólny begin seam powinien przyjąć mały adapter/callback reprezentujący źródło materiałów, np. możliwości:

```text
has(requirements)
consumeAtomic(requirements)
```

Konkretnymi źródłami mogą być:

- player `Inventory`,
- owning `Household.items` tam, gdzie istnieje jednoznaczny household owner,
- settlement-owned/local stock przez istniejący economy/item flow tam, gdzie struktura jest publiczna.

Implementacja ma reuse'ować istniejące inventory/household/economy mutation APIs. Nie wprowadzać `RepairInventory` ani shadow stock.

## 4. Damage/problem representation

Dodać explicit mutation seam, np.:

```text
applyStructureDamage(structureId, amount, nowDays)
```

który:

1. resolves/checkpoints current condition,
2. używa `applyConditionDelta(..., -amount)`,
3. zapisuje ten sam authoritative record,
4. nie zależy od loaded mesh.

V1 nie musi jeszcze generować damage automatycznie. Seam ma być produkcyjnym wejściem dla późniejszych weather/attack/fire/wear systems i dla test/debug fixture.

Problem nie jest osobnym persisted flagiem.

Preferować derived snapshot:

```text
condition below repair threshold
→ structure repair problem exists
```

Severity/pressure wyprowadzać z realnej utraty condition oraz role/importance policy.

## 5. NPC detection, pressure i decyzja

### Read-only lookup

NPC nie skanuje Three.js ani `VillagePlan` samodzielnie per frame.

Settlement/runtime powinien dostarczyć bounded local candidate lookup dla struktur swojej osady, np. najbardziej pilne uszkodzone struktury wraz z:

```text
structureId
position/approach point
condition
severity
repair state
ownership/household relation
```

### Pressure

Dodać pure producer dla maintenance/repair pressure analogiczny do `weatherPressure` / healing pressure.

Nie dodawać `repair` jako fake `NeedId`.

Rozszerzyć wspólne `NpcDecisionTarget` o repair/maintenance target i włączyć pressure do istniejącej same-tick arbitration w `NpcAgent.choose()`.

Pressure powinno uwzględniać co najmniej:

- condition severity,
- czy struktura należy do household NPC / jest publicznie ważna,
- dostępność materiałów,
- czy repair jest już wykonywany/complete,
- istniejące ważniejsze potrzeby i interrupts.

Nie dodawać repair jako critical interrupt dla zwykłej maintenance w V1. Pragnienie/głód/severe weather/urgent health pozostają nadrzędne.

### Strategy/action

Po wygraniu repair pressure NPC powinien korzystać z istniejącego plan/action modelu:

```text
select target
→ acquire/commit required materials through shared begin seam
→ goTo structure approach point
→ work
→ contributeRepairWork
→ repeat/resume until complete or invalid
```

Nie pisać naprawy jako monolitycznego branchu w `NpcAgent`.

Jeżeli istniejący `npcWork` / planned-action seam może obsłużyć krok pracy, rozszerzyć go zamiast tworzyć osobny repair runner.

## 6. Player interaction

### Inspection

Istniejący settlement house interactable/inspection path ma pokazywać co najmniej:

```text
Stan: NN%
Uszkodzona / wymaga naprawy
Naprawa: completedWork / requiredWork (jeśli aktywna)
Brakujące requirements przed startem
```

Condition UI odczytuje live structure snapshot, nie mesh metadata.

### Start / work

Player action:

```text
inspect/interact
→ quote same repair target
→ atomic consume from Inventory
→ start same repair episode
→ BusyAction / shared construction-work-session style
→ contributeRepairWork(structureId, accepted work)
```

Reuse istniejącego `BusyAction` i fizycznego work-session helpera tam, gdzie pasuje. Nie dodawać osobnego player repair timer engine.

Player i NPC mogą wznowić ten sam już rozpoczęty repair; ownership progressu jest na strukturze, nie na actorze.

## 7. Streaming i runtime projection

`Settlement`/`props.ts` house meshes są rebuildable presentation.

Przy load/stream-in:

```text
VillagePlan building
+ registry state
→ runtime house/interactable presentation
```

Przy stream-out:

- nie usuwać structure state,
- nie uzależniać active repair od Object3D,
- NPC work target po ponownym resolve używa stable `structureId`.

Jeżeli repair/damage w V1 nie zmienia geometrii, nie rebuildować house mesh tylko z powodu condition update; UI/diagnostics mogą czytać state bez visual variant.

## 8. Persistence

Dodać do `SaveData` settlement structure state snapshot i przepiąć:

```text
createApp/worldBundle restore
→ createSettlementsManager(initialStructureStates)
→ registry
→ buildSaveData()
→ snapshotStructureStates()
```

Persistować co najmniej:

- condition + condition anchor,
- active `RepairProgress`.

Nie persistować danych re-derivable z `VillagePlan`, np. position, role, label czy footprint.

Jeżeli zmienia się save representation/semantics, bump `CURRENT_SAVE_VERSION` i dodać realną migrację zgodnie z `docs/state/persistence.md` / `ARCHITECTURE.md`.

Starszy save bez structure state ma odtworzyć pristine structures.

## 9. Quest-facing observation

Nie implementować questa w tym planie.

Wystawić narrow read-only contract po stable source identity, np.:

```text
getStructureSnapshot(settlementId, structureId)
listRepairProblems(settlementId)
```

`quests-progression-016` powinien później móc z tego zbudować:

```text
structure:<structureId>:repair
```

Opportunity istnieje dlatego, że condition przekroczył domain threshold.

Resolution:

```text
condition restored above repair threshold / repair completed
→ source problem disappears
→ quest observes external/player resolution
```

Nie dodawać:

```text
needsRepairQuest
repairQuestComplete
questRepairProgress
```

do settlement state.

## 10. Future damage sources

Projekt ma pozostawić jedno wejście do tego samego state:

```text
weather wear ─┐
attack damage ├→ applyStructureDamage / condition mutation
fire damage ──┤
passive wear ─┘
              ↓
      same repair problem
              ↓
 NPC/player/quest/world react
```

Późniejsze źródła mogą mieć własny damage math, ale nie własny condition/repair lifecycle.

Jeżeli zostanie dodane lazy weather wear, reuse `resolveCondition()` i domain-specific `ConditionDecay`; nie uruchamiać per-frame durability tick dla wszystkich osad.

## Relevant files / systems

Zweryfikowane podczas planowania:

```text
src/world/condition.ts
src/world/repair.ts
src/world/playerWell.ts
src/world/createPlayerWells.ts
src/world/residentialBuilding.ts
src/world/createResidentialBuildings.ts
src/settlement/villagePlan.ts
src/settlement/settlementGenerator.ts
src/settlement/SettlementsManager.ts
src/settlement/createSettlement.ts
src/settlement/props.ts
src/ai/Needs.ts
src/ai/weatherPressure.ts
src/ai/npcDecision.ts
src/ai/NpcAgent.ts
src/app/busyAction.ts
src/app/actions/constructionWorkSession.ts
src/app/interactables.ts
src/app/gameLoop.ts
src/persistence/saveData.ts
src/app/saveState.ts
src/quests/opportunities/*
```

Related implemented plans/notes:

```text
world-020 — world structure condition and degradation
world-021 — world structure repair work foundation
settlements-005 — residential house construction
items-player-017 — incremental construction
quests-progression-016 — world-driven settlement quest opportunities
```

## Suggested implementation order

1. `SettlementStructureStateRegistry` + structure definition/identity adapter + tests.
2. Shared quote/begin/damage/contribute/completion API over `condition.ts` + `repair.ts`.
3. `SettlementsManager` ownership + restore/snapshot + save schema/migration/tests.
4. Runtime residential-house lookup/approach point + inspection/interactable exposure.
5. Player quote/start/BusyAction contribution using shared target.
6. NPC bounded problem lookup + pure pressure producer + decision target.
7. NPC strategy/action execution through shared begin/contribute API.
8. Quest-facing read-only lookup only; no quest definition.
9. State/player/NPC docs update + remove covered loose end.

## Guardrails

- No authoritative mutable state in Three.js objects.
- No mutable condition in deterministic `VillagePlan`.
- No separate NPC/player/quest repair progress.
- No duplicated material requirements.
- No per-NPC world-wide structure scans.
- No per-frame degradation tick for unloaded settlements.
- No quest-specific problem flags.
- Preserve stable ids across streaming/rebuild/save/load.
- Add JSDoc to main registry/public repair contracts with useful `@domain` tags for preflight discovery.

## Verification

Automated:

- condition/damage clamps and checkpoint semantics,
- stable lookup from `VillageBuildingPlan.id`,
- sparse/default pristine state,
- atomic material preflight/consume,
- shared partial work and resume across different actor adapters,
- NPC and player contribution mutate the same `RepairProgress`,
- stream-out/in and `WorldBundle` rebuild preserve condition/progress,
- save/load round-trip preserves condition/progress,
- older save restores pristine state,
- repair pressure disappears after authoritative resolution,
- quest-facing snapshot reflects the same state without extra flags.

Manual browser verification by User:

- damage a settlement house through debug/test seam,
- inspect condition as player,
- start/interrupt/resume repair,
- verify materials are consumed once,
- let NPC detect and repair a damaged structure,
- verify NPC/player can continue the same repair episode,
- leave/return to streamed settlement and confirm state remains,
- save/load mid-repair and confirm state/progress remains.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

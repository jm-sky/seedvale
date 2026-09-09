# Plan: World structure repair work foundation

**Created:** 2026-09-09
**Status:** `verification needed` 🔍
**Implemented at:** 2026-09-09 12:41
**Priority:** high · **Effort:** M
**Depends on:** ~~world-020~~
**Domain:** `world`  
**Type:** `feature`  
**Roadmap:** -

## Goal

Dodać mały, actor-neutral fundament naprawy trwałych elementów world structures, oparty o condition/degradation z `world-020` oraz istniejący shared-work pattern.

Naprawa ma działać jako rzeczywista, persistent praca nad authoritative world targetem:

```text
current condition
→ inspect repair option
→ show required materials + work time
→ commit materials
→ persistent repair episode
→ Player / NPC contribute work
→ repair completes
→ condition restored
```

Pierwszym consumerem jest daszek player-built well.

V1 nie degraduje całej studni:

```text
well body / pit / water source
→ niezniszczalne

completed roof
→ posiada condition
→ degraduje się
→ można go naprawić
```

Plan nie implementuje jeszcze `Repair` skill, targeted skill mode, autonomous NPC maintenance, repair Work Contracts, NPC material logistics ani settlement-wide maintenance planning.

## 1. Architecture split

Plan utrzymuje trzy wyraźne warstwy:

```text
A. shared repair foundation
   RepairProgress + actor-neutral contribution math

B. well-roof domain
   condition → quote → materials → work → restored condition

C. player adapter
   contextual action → existing dialog → Busy Action → contribution
```

Future NPC maintenance i Work Contracts mają korzystać z A+B bez zależności od playerowego UI.

## 2. Core invariant

Zachować istniejący shared-work invariant:

```text
work belongs to the world target
```

Repair progress nie należy do Playera, NPC, Work Contract, UI ani Repair skill.

World structure pozostaje authoritative ownerem swojego repair state. Player i NPC jedynie dostarczają accepted work contribution.

Nie tworzyć:

- `RepairManager`,
- globalnego repair registry,
- per-worker repair progress,
- osobnego player repair systemu,
- osobnego NPC repair systemu.

## 3. Repairable component, not whole structure

Pierwszy consumer ma potwierdzić, że condition może należeć do konkretnego elementu struktury, a nie koniecznie do całego obiektu.

Dla well:

```text
pit
well body
water source
→ brak degradation w V1

roof
→ repairable component
```

Plan nie wymusza konkretnego storage layoutu typu `roofCondition` vs nested component state. Implementation recon ma zachować jednoznaczną semantykę:

```text
condition dotyczy daszku
nie całej studni
```

Nie wprowadzać generic component frameworku tylko dla tego consumera.

## 4. Condition and repair progress are separate

Nie utożsamiać `condition` z repair work progress.

Condition opisuje aktualny stan techniczny daszku. Repair progress opisuje konkretną rozpoczętą naprawę.

Przykład:

```text
roof condition = 42

active repair:
42 → 100
required work = 3h
completed work = 1.25h
```

Nie stosować globalnego modelu:

```text
1 work hour = +X condition
```

Condition zmienia się przy zakończeniu konkretnego repair episode.

## 5. Shared repair progress contract

Dodać mały pure shared type, preferencyjnie w:

```text
src/world/repair.ts
```

Koncepcyjnie:

```ts
export type RepairProgress = {
  startedCondition: number
  targetCondition: number
  requiredWork: number
  completedWork: number
}
```

Semantyka:

- `startedCondition` — resolved condition podczas rozpoczęcia naprawy,
- `targetCondition` — wynik ukończonej naprawy,
- `requiredWork` — pełna ilość potrzebnej pracy,
- `completedWork` — faktycznie zaakceptowana praca.

Shared type nie zna materials, skill, actor, structure kind, ownership, NPC assignment ani maintenance priority.

## 6. Shared repair helpers

`world/repair.ts` powinien zawierać wyłącznie actor-neutral work math, np.:

```ts
export function repairRemainingWork(progress: RepairProgress): number

export function isRepairComplete(progress: RepairProgress): boolean

export function applyRepairWork(
  progress: RepairProgress,
  workAmount: number,
): {
  progress: RepairProgress
  acceptedWork: number
}
```

Zasady:

- zero/negative contribution = no-op,
- accepted work nie przekracza remaining work,
- `completedWork` nie przekracza `requiredWork`,
- `acceptedWork` oznacza realną ilość pracy przyjętą przez target.

Ten sam `acceptedWork` może później zasilać Player Busy Action, NPC accounting, Work Contracts i XP/skill consumers.

## 7. Repair episode belongs to the component

Nie tworzyć globalnego persistent `RepairJob`.

Aktywny repair episode jest zapisany przy konkretnym repairable component, semantycznie np.:

```ts
roofRepair?: RepairProgress
```

Exact record shape wynika z implementation recon.

Aktywny repair przeżywa:

- przerwanie Player Busy Action,
- NPC interruption,
- odejście workerów,
- save/load,
- streaming.

## 8. Repair target condition

Shared foundation ma wspierać partial repair:

```text
currentCondition < targetCondition <= 100
```

V1 player flow dla well roof pozostaje prosty:

```text
Napraw daszek
→ targetCondition = 100
```

Foundation nie może jednak zakładać na poziomie shared API, że każda przyszła naprawa zawsze prowadzi do 100.

Future NPC maintenance lub Repair skill może wybrać niższy legalny target bez zmiany world repair ownership.

## 9. Repair definition remains domain-owned

Shared repair layer nie posiada globalnego `RepairDefinitionRegistry`.

Każda domena sama określa:

- legalny target condition,
- material requirements,
- required work,
- restrictions.

Dla well roof odpowiedzialność pozostaje w `src/world/playerWell.ts` lub najbliższym istniejącym ownerze.

Koncepcyjnie:

```ts
export type WellRoofRepairQuote = {
  currentCondition: number
  targetCondition: number
  materials: readonly MaterialRequirement[]
  requiredWork: number
}
```

Quote jest derived/read-only i nie jest persistowany.

## 10. Well roof degradation semantics

`world-020` musi używać tej samej semantyki: pierwszym well consumerem condition jest roof component, nie cała studnia.

Roof condition może spadać przez:

```text
time
weather exposure
```

Nie dodawać usage wear dla całej studni.

Pobieranie wody nie uszkadza well body ani roof w V1.

## 11. Roof condition functional consequence

Roof condition ma wpływać na istniejącą funkcję ochronną daszku, a nie na czas pobierania wody.

Preferowana continuous semantics:

```text
roof protection factor = condition / 100
```

Przykład:

```text
100 → pełna ochrona
75  → 75% ochrony
50  → 50% ochrony
25  → 25% ochrony
0   → brak ochrony
```

Wpływ należy wpiąć w istniejący roof/contamination protection seam.

Nie zmieniać groundwater kind, water depth ani bazowej jakości źródła.

## 12. Start-repair transaction invariant

Rozpoczęcie repair jest jedną authoritative domain operation.

Canonical order:

```text
resolve current condition
→ derive authoritative repair quote
→ validate materials
→ consume materials atomically
→ commit resolved condition + condition anchor
→ create repair episode
```

Jeżeli material validation/consumption się nie powiedzie:

```text
no repair state created
no condition checkpoint committed solely because of failed repair attempt
```

UI quote nie jest authority. Kliknięcie `Rozpocznij naprawę` musi ponownie zweryfikować aktualny condition, brak aktywnego repair, target validity i materials.

## 13. Freeze degradation during active repair

Podczas aktywnego repair episode normalny degradation roof jest wstrzymany.

```text
begin repair
→ checkpoint condition
→ freeze degradation
→ accepted work contributions
→ complete repair
→ condition = targetCondition
→ reset condition anchor
→ degradation resumes
```

To zapewnia deterministic semantics, stabilny repair scope i prostszy save/load/off-screen behaviour.

## 14. Water source unavailable during roof repair

Podczas aktywnego roof repair studnia nadal istnieje jako world object, ale nie może działać jako normalny `WaterSource`.

```text
well exists
├── inspect ✓
├── continue repair ✓
└── use as WaterSource ✗
```

Dotyczy co najmniej player drink/fill i NPC water-fetch usage.

Nie usuwać studni z generic world lookupów tylko dlatego, że trwa repair.

Czytelny reason label, np.:

```text
Studnia jest obecnie naprawiana.
```

## 15. Materials

Reuse istniejący `MaterialRequirement`.

Nie tworzyć repair-specific duplikatu `{ kind, count }`.

Jeżeli obecny moduł/nazwy są zbyt construction-specific, wykonać tylko minimalny refactor neutralizujący ownership shared material requirement bez zmiany istniejącej semantyki.

Repair domain określa wymagane materials, ale nie skąd actor je pozyskuje.

Player może użyć istniejących inventory + nearby dropped material seams.

Future NPC maintenance może użyć household/settlement storage, claims i physical logistics.

Nie dodawać NPC material fetching do tego planu.

## 16. Materials are committed at repair start

Materiały są zużywane atomowo podczas rozpoczęcia repair episode.

```text
resolve quote
→ verify all requirements
→ atomically consume materials
→ create repair progress
```

Po rozpoczęciu naprawy materiały są traktowane jako committed/wbudowane.

Worker interruption:

```text
does not refund materials
does not cancel repair
```

Nie tworzyć material reservation systemu.

## 17. Well roof repair cost policy

Koszt naprawy ma być deterministic function of restored condition:

```text
current condition + target condition
→ material requirements + required work
```

Nie ustalać wartości z przykładowych bands bez reconu aktualnego roof construction recipe/work.

Przed implementacją porównać repair cost z faktycznym kosztem wykonania roof stage.

Wymagany invariant:

```text
repair to 100
< equivalent roof reconstruction from scratch
```

Naprawa ma jednak pozostać znaczącym kosztem, nie darmowym resetem condition.

## 18. Contextual player interaction

Do pierwszego vertical slice nie czekać na `items-player-021`.

Damaged completed roof powinien wystawić contextual repair action przez istniejący interaction/action mechanism.

Preferowany shortcut to:

```text
[R] Napraw
```

jeżeli pasuje do aktualnego input ownership. Exact binding ma zostać potwierdzony podczas implementation recon i nie może tworzyć konfliktu z istniejącym key mappingiem.

Shortcut otwiera istniejący dialog/action panel. Nie wykonuje repair natychmiast i nie tworzy nowego repair UI frameworku.

## 19. Repair dialog states

Przed rozpoczęciem repair dialog powinien czytelnie pokazywać:

```text
Napraw daszek studni

Stan: 43 / 100
Po naprawie: 100 / 100

Potrzebne materiały:
2 × belka
1 × deska

Czas pracy:
2 h 30 min

[Rozpocznij naprawę]
```

Jeżeli materiałów brakuje, primary action jest disabled i UI pokazuje brakujące zasoby.

Po rozpoczęciu persistent repair ten sam interaction surface powinien przejść w stan kontynuacji:

```text
Naprawa daszku studni

Stan przed naprawą: 43 / 100
Cel: 100 / 100
Postęp pracy: 1 h 15 min / 2 h 30 min
Materiały: dostarczone

[Kontynuuj naprawę]
```

Dialog ma korzystać z existing modal/action option mechanism i pozostawać rozszerzalny o przyszłe actions, np. inspect/dismantle.

## 20. Actor-neutral contribution seam

Mutation owner wella powinien wystawić actor-neutral contribution API, analogicznie do istniejącego shared construction work.

Koncepcyjnie:

```ts
contributeRoofRepairWork(
  id: string,
  workAmount: number,
  nowDays: number,
): number
```

Result to `acceptedWork`.

Nie mutować repair progress bezpośrednio z gameLoop, dialog UI, PlayerController ani NpcAgent.

## 21. Player work bout, interruption and resume

Po rozpoczęciu repair Player wykorzystuje istniejący Busy Action / active-work pattern.

```text
start bout
→ elapsed active work
→ partial credit
→ contributeRepairWork(...)
```

Jeżeli action zostanie przerwany po części czasu, accepted partial work pozostaje.

Worker interruption przez player input, combat, NPC need, sleep, pathing lub time-skip handling nie kasuje repair episode.

Pozostają:

```text
materials committed
completedWork persisted
repair active
```

Dowolny późniejszy actor może kontynuować ten sam target.

Nie dodawać explicit `Cancel repair` w V1; refund/abandonment semantics są non-goal.

## 22. Completion

Gdy `completedWork >= requiredWork`, completion jest atomic:

```text
condition = targetCondition
repair = undefined
condition anchor = completion time
```

Nie persistować dodatkowego `repairCompleted` ani completed repair recordu.

Normalny degradation resumes od nowego anchor.

## 23. Multiple workers and Work Contracts boundaries

World repair target nie rezerwuje jednego workera.

Nie dodawać:

- `workerNpcId`,
- `reservedByNpcId`,
- `activeRepairWorkerId`,
- `maxRepairWorkers`,
- multi-worker efficiency formulas.

Multiple actors mogą wnosić accepted work do jednego authoritative repair episode.

Problem wyboru targetu i workforce coordination należy do późniejszego maintenance/work-assignment layer.

Plan nie zależy od `npc-028` i nie dodaje jeszcze `repair` do `WorkType` / `ContractTarget`.

Future repair Work Contract może później wskazać ten sam world-owned repair target bez zmiany jego progress ownership.

## 24. Repair skill boundary

`world-021` nie zna:

- `Repair` skill value,
- selected skill state,
- targeted skill mode,
- XP.

Future skill flow może określić achievable target, work efficiency lub material efficiency, a następnie wywołać istniejące world repair API.

Nie zakładać twardej zależności `items-player-021 → world-021`, jeśli jego targeted-skill vertical slice nadal może korzystać z trap inspection. To sequencing/future integration, nie automatycznie dependency.

## 25. Camp repair integration boundary

`items-player-019` ma konsumować tę samą semantykę repair episode dla deployed camp structures:

```text
condition
→ repair quote
→ materials committed at repair start
→ persistent RepairProgress
→ actor-neutral work contributions
→ completion updates condition
```

Tent, bedroll i raised sleeping platform nie powinny implementować równoległego modelu:

```text
1 material
→ immediate +condition
```

Ich camp-specific domain nadal posiada:

- material kinds/count,
- tool capabilities,
- required work scaling,
- Repair/Survival skill interpretation,
- contextual UI.

Shared `world-021` semantics posiadają natomiast repair progress ownership, material commitment timing i work contribution lifecycle.

Nie oznacza to, że każdy przyszły repairable inventory item musi używać persistent repair episode.

Dla małych carried/equipment items posiadających własne:

```text
durability
sharpness
item condition
```

domena może później użyć prostszej one-shot/incremental repair operation, jeśli nie potrzebuje persistent/shared work.

Canonical boundary:

```text
deployed/world structure
→ RepairProgress episode

small inventory item
→ domain-specific repair semantics allowed
```

Nie tworzyć jednego globalnego RepairManagera w celu wymuszenia identycznego lifecycle dla obu kategorii.

## 26. Existing settlement storage repair

`src/settlement/storageRepair.ts` pozostaje quest-specific one-shot repair.

Nie migrować go w tym planie.

Future cleanup może podłączyć go do shared repair work dopiero wtedy, gdy settlement storage dostanie realne condition i będzie to usuwać rzeczywistą duplikację.

## 27. Persistence and off-screen continuity

Aktywny roof repair musi round-trip through save/load razem z authoritative condition state.

Persistować semantycznie:

```text
roof condition state
repair?: {
  startedCondition
  targetCondition
  requiredWork
  completedWork
}
```

Exact record layout zależy od finalnego `world-020` implementation.

Nie persistować:

- remaining work,
- quote,
- UI state,
- current worker,
- skill context,
- material source,
- maintenance priority.

Old saves bez roof condition korzystają z migration/default semantics ustalonych w `world-020`; brak aktywnego repair jest domyślny.

Repair progress nie rośnie od elapsed time:

```text
elapsed world time ≠ repair work
```

Progress zwiększa się wyłącznie przez explicit accepted work contribution. Future aggregated NPC simulation może generować takie contributions bez zmiany modelu.

## 28. Zero condition

Roof z condition `0` pozostaje istniejącym, ale całkowicie nieskutecznym ochronnie elementem.

Nie usuwać automatycznie mesh/object i nie wprowadzać destruction/reconstruction semantics.

Może zostać naprawiony do legalnego target condition.

## 29. Expected files

Expected primary files:

```text
src/world/repair.ts                    NEW shared pure primitives
src/world/playerWell.ts                roof repair quote/rules
src/world/createPlayerWells.ts         authoritative repair mutation
src/app/interactables.ts               contextual repair availability
src/app/... existing dialog/actions    repair dialog integration
src/app/... busy action flow           repair work contribution
src/persistence/saveData.ts            persisted repair state
src/persistence/...                    restore/migration
src/items/constructionMaterials.ts     only if neutralization is justified
```

Dostosować exact paths do aktualnego code ownership podczas implementation recon.

Nie umieszczać domain logic w Vue components.

## 30. Testing

Shared repair primitives:

- remaining work,
- zero/negative contribution,
- partial accepted work,
- clamp at required work,
- completion,
- exact `acceptedWork`.

Well roof repair:

- unfinished/no-roof well has no repair option,
- healthy roof has no repair option,
- damaged completed roof exposes repair,
- quote contains materials + required work,
- V1 player target is 100,
- lazy condition is resolved before authoritative start,
- insufficient materials cause no partial mutation,
- materials are consumed atomically exactly once,
- cannot start a second repair episode,
- partial contributions persist,
- multiple contributions accumulate,
- completion restores target condition and clears repair,
- condition anchor resets on completion,
- degradation resumes afterward.

Water source behaviour:

```text
active roof repair → WaterSource unavailable
repair completed   → WaterSource available again
```

Roof protection regression:

```text
100 condition → full protection
50 condition  → half protection
0 condition   → no protection
```

Persistence:

- condition + repair round-trip,
- partial work survives save/load,
- materials are not consumed again after restore,
- restored repair can continue,
- old save defaults remain correct.

Run appropriate unit tests and:

```text
pnpm typecheck
```

Browser verification wykonuje użytkownik.

Nie uruchamiać manualnie `pnpm docs:sync`; GitHub workflow wykonuje docs sync automatycznie.

## Non-goals

Plan nie implementuje:

- Repair skill / XP / targeted skill UI,
- player-selectable partial-repair UI,
- well-body/pit degradation or repair,
- well usage wear,
- NPC autonomous maintenance,
- maintenance pressures/priorities/responsibility,
- NPC material acquisition/transport,
- repair Work Contracts,
- multiple-worker Work Contract integration,
- worker reservation / worker limits / worker scaling,
- repair professions,
- weapon/tool/trap inventory repair,
- settlement building repair,
- storage repair migration,
- damaged visual variants,
- collapse/reconstruction,
- generic building framework,
- global RepairManager.

`items-player-019` is a planned consumer of this foundation for deployed camp structures, but its implementation remains outside this plan.

## Follow-ups

Recommended architecture/order:

```text
world-020 — condition/degradation foundation
    ↓
world-021 — THIS PLAN
```

Then independent consumers/integrations can converge on the same foundation:

```text
world-021 ─────────────→ items-player-019 camp repair
      ├───────────────→ future Repair skill integration from items-player-021
      └─ + npc-028 ───→ future repair Work Contracts
                            ↓
                     autonomous NPC / household /
                     settlement maintenance
```

Future autonomous maintenance should consume the same repair API:

```text
condition + importance + responsibility
→ maintenance need
→ acquire materials
→ assign worker(s)
→ contribute repair work
→ world-owned repair completion
```

Nie tworzyć dla NPC równoległego maintenance progress systemu.

## Dependency note

`world-020` musi utrzymywać roof-only condition semantics dla player-built well, zgodne z tym planem.

`world-021` pozostaje zależny tylko od `world-020`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

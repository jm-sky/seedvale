# Plan: Player camp repair and sewing kit

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** items-player-018, settlements-006, items-player-021, world-021
**Domain:** `items-player`
**Subdomains:** `items` `interaction` `player-needs`
**Tags:** `repair` `camp` `condition` `tools`
**Roadmap:** -

## Goal

Dodać deterministyczną naprawę player-built camp equipment:

- tent,
- bedroll,
- raised sleeping platform,

w oparciu o istniejące condition, Inventory, item instances, item capabilities, Busy Action, physical effort i contextual interaction UI oraz fundamenty z:

- `world-021` — persistent repair episode + actor-neutral work contribution,
- `items-player-021` — `Repair` skill + targeted/contextual skill action seam.

Camp repair nie tworzy równoległego immediate-condition repair modelu.

Canonical flow:

```text
current condition
+ Repair skill
+ optional Survival context
+ required capability
+ repair materials
→ resolve repair quote
→ atomically commit materials
→ create persistent RepairProgress
→ Busy Action contributes work
→ interruption preserves progress
→ completion updates authoritative condition
→ Repair XP
```

## 1. Responsibility model

Rozdzielić odpowiedzialności:

```text
Repair
→ primary technical competence

Survival
→ optional supporting/context competence for camp equipment

tool capability
→ fizyczna możliwość wykonania danego rodzaju pracy

repair materials
→ fizyczne zasoby committed do repair episode

world object
→ authoritative owner condition + RepairProgress
```

`Repair` z `items-player-021` jest primary skill dla camp repair.

`Survival` może pozostać supporting/context skill, jeżeli daje realny i prosty gameplay benefit, ale nie może posiadać repair progression ani zastępować `Repair`.

Nie używać RNG.

## 2. Supported objects

### Tent

```text
capability: textile_repair
material: hide
primary skill: Repair
support: Survival optional
```

### Bedroll

```text
capability: textile_repair
material: hide
primary skill: Repair
support: Survival optional
```

### Platform

```text
capability: wood_chopping
material: branch
primary skill: Repair
support: Survival optional
```

Nie dodawać osobnego Crafting ani Construction skill tylko dla tych akcji.

## 3. New `textile_repair` capability

Rozszerzyć `ItemCapability`:

```ts
| 'textile_repair'
```

Dodać odpowiedni capability label, np.:

```ts
CAPABILITY_NEED_LABEL.textile_repair = 'zestawu do szycia'
```

Repair nigdy nie powinien sprawdzać konkretnego item kind, jeśli capability już reprezentuje wymaganie.

Canonical gate:

```ts
inventory.hasCapability('textile_repair')
```

## 4. Sewing kit

Dodać:

```ts
sewing_kit
```

Properties:

- label: `zestaw do szycia`,
- utility/tool zgodnie z aktualnym katalogiem,
- holdable: false,
- reusable,
- non-consumable,
- no durability in this plan,
- capability: `['textile_repair']`,
- weight: **0.4 kg**,
- size zgodny z istniejącą enum scale, preferować `S`.

Nie dodawać osobnego equipment slot ani repair inventory.

## 5. Sewing kit acquisition

Reuse istniejący merchant flow.

Dodać `sewing_kit` do właściwych merchant price/stock definitions.

Canonical cena:

```text
18 coin
```

Nie dodawać crafting recipe, world spawn, quest reward ani NPC production w tym planie.

## 6. Tent condition continuity — mandatory prerequisite

`items-player-018` dodaje condition do postawionego namiotu, ale portable tent nie może resetować condition przy pack/redeploy.

Invariant:

```text
damaged tent 20%
→ pack
→ inventory
→ deploy
→ still 20%
```

Nie dopuścić do darmowej naprawy przez world ↔ inventory transition.

## 7. Tent becomes instance-backed

Rozszerzyć istniejący item-instance mechanism zamiast tworzyć osobny portable-tent state.

Koncepcyjnie:

```ts
export type TentItemInstance = ItemInstance & {
  kind: 'tent'
  condition: number
}
```

Dodać `tent` do aktualnego instance-backed mechanism wraz z cloning/save/restore/acquisition support.

Kupiony nowy namiot:

```text
condition = 100
```

Reuse istniejące `Inventory.addInstance()`, `removeInstance()`, `getInstances()` i centralny instance acquisition path.

## 8. Stable tent identity across inventory ↔ world

Namiot zachowuje tę samą fizyczną tożsamość.

Preferowany invariant:

```text
TentItemInstance.id
    ↕
PlacedTent.id
```

Jeśli aktualny code ownership wymaga innej reprezentacji ID, zachować przynajmniej stable physical identity i condition continuity.

### Placement

Wybrać konkretną carried instance. Po successful placement przenieść ją do world-owned state bez resetu condition.

### Packing

Najpierw resolve current condition do `now`, następnie przenieść tę wartość do carried instance.

Packed tent nie degraduje się od world weather, więc world degradation anchor nie musi podróżować w inventory.

### Redeploy

Przy ponownym placement:

```text
condition = instance.condition
lastConditionUpdateAtDays = current elapsedDays
```

## 9. Migration for existing tent inventory

Stare saves zawierające stackowane tents deterministycznie zamienić na świeże instances:

```text
count N
→ N TentItemInstances at condition 100
```

Po migracji nie pozostawiać dwóch równoległych representations.

Placed condition-aware tents zachowują condition zgodnie z `items-player-018`.

## 10. Camp repair materials

Reuse istniejący `MaterialRequirement` i material kinds.

Tent:

```text
hide
```

Bedroll:

```text
hide
```

Platform:

```text
branch
```

Nie udawać, że tent posiada construction recipe, jeśli go nie ma. Jego repair material jest camp-domain repair definition.

Nie tworzyć drugiego repair-specific `{ kind, count }` type.

## 11. Repair episode semantics

Tent, bedroll i raised platform są deployed/world objects i mają konsumować persistent repair semantics z `world-021`.

Nie używać modelu:

```text
1 material
→ immediate +condition
```

Canonical state:

```text
current condition
→ active RepairProgress {
    startedCondition,
    targetCondition,
    requiredWork,
    completedWork
  }
→ completion
→ authoritative condition = targetCondition
```

V1 player flow:

```text
damaged camp object
→ repair to 100
```

Shared foundation nadal wspiera partial target condition dla przyszłych NPC/AI use cases, ale player UI nie musi wybierać targetu.

## 12. Camp repair quote

Camp domain określa:

- material kind/count,
- required capability,
- required work,
- physical effort,
- legal target condition.

Shared `RepairProgress` pozostaje własnością `world-021` semantics.

Nie utrwalać starego `baseRepairPoints` jako bezpośredniego `+condition`.

Dawne wartości `25 / 34 / 17` mogą służyć tylko jako balance reference przy dobieraniu kosztu materiałowego, jeśli pomagają zachować dotychczasową ekonomię.

Canonical quote:

```text
current condition
→ damage to restore
→ deterministic materials + requiredWork + targetCondition
```

Dla player V1:

```text
targetCondition = 100
```

Material cost powinien rosnąć wraz ze skalą uszkodzenia.

## 13. Repair resolver

Dodać jeden pure/domain resolver dla preview i authoritative validation, koncepcyjnie:

```ts
resolveCampRepairQuote({
  objectKind,
  currentCondition,
  repairValue,
  survivalValue?,
})
```

Result koncepcyjnie:

```ts
{
  currentCondition,
  targetCondition,
  materials,
  requiredWork,
  capability,
  effort,
}
```

UI nie oblicza kosztów, work time ani skill modifiers.

Exact API dopasować do shared repair primitives z `world-021` i actual code ownership.

## 14. Repair and Survival skill contribution

`Repair` jest primary skill.

Najprostsza V1 semantyka:

```text
Repair
→ work efficiency / effective duration
```

`Survival` może dawać mały camp-specific support modifier dla work/material efficiency, ale tylko jeśli istniejący skill-evaluation seam z `items-player-021` pozwala to zrobić bez nowej równoległej formuły.

Nie narzucać globalnego weighted average.

Jeżeli podczas implementation recon nie ma naturalnego support seam, Survival może w V1 nie wpływać na wynik.

Nie używać starego `survivalDurationMultiplier()` jako canonical repair owner tylko dlatego, że był używany w poprzednim draftcie.

## 15. Physical effort

Reuse istniejący physical effort model.

Preferowane intensity:

```text
bedroll  → light
tent     → light
platform → moderate
```

Nie implementować repair-specific stamina system.

## 16. Resolve degradation before starting repair

Przed repair quote/start dla world object:

```text
stored condition
+ lastConditionUpdateAtDays
→ resolve environmental degradation to now
→ authoritative current condition
```

Nigdy nie naprawiać stale stored condition.

## 17. Material transaction

Camp repair używa tej samej transakcji co `world-021`.

Canonical start:

```text
resolve current condition
→ derive authoritative quote
→ validate capability/materials
→ consume/commit all required materials atomically
→ checkpoint condition + anchor
→ create RepairProgress
```

Jeśli requirements nie są spełnione:

```text
no material consumed
no RepairProgress created
```

Po rozpoczęciu:

```text
materials remain committed
```

Przerwanie work bout nie refunduje materiałów i nie kasuje repair episode.

## 18. Repair episode start revalidation

Przed utworzeniem repair episode revalidate:

1. target nadal istnieje,
2. resolved condition `< 100`,
3. target nie ma już active repair,
4. required capability jest dostępne,
5. wszystkie wymagane materials są dostępne,
6. authoritative quote nadal jest legalny,
7. player action nie jest blocked.

UI preview nie jest authority.

## 19. Busy Action becomes a work bout

Busy Action nie reprezentuje już całej naprawy.

Canonical semantics:

```text
Busy Action
→ elapsed useful work
→ contribute accepted work to authoritative RepairProgress
```

Przy interruption:

```text
accepted partial work remains
materials remain committed
repair remains active
```

Nie persistować Busy Action; persistować world-owned repair progress.

## 20. Work bout revalidation

Przy rozpoczęciu/wznowieniu work bout revalidate co najmniej:

- target exists,
- repair episode still active,
- actor can continue,
- required capability is still available, jeśli dana akcja wymaga narzędzia podczas pracy.

Nie sprawdzać ani nie konsumować ponownie materials po utworzeniu repair episode.

## 21. Repair completion

Completion należy do domain mutation ownera targetu.

Gdy:

```text
completedWork >= requiredWork
```

wykonać atomic:

```text
condition = targetCondition
repair = undefined
lastConditionUpdateAtDays = completion time
```

Normalny environmental degradation resumes od nowego anchor.

Nie dodawać osobnego completed repair recordu.

## 22. Cancellation and resume

Esc / Busy cancellation kończy wyłącznie bieżący work bout.

```text
work bout cancelled
→ RepairProgress remains
→ committed materials remain
→ repair can be resumed
```

Nie dodawać explicit `Cancel repair`/refund semantics w V1.

## 23. Tool requirements

Tent / bedroll:

```ts
inventory.hasCapability('textile_repair')
```

Platform:

```ts
inventory.hasCapability('wood_chopping')
```

Nie wymagać konkretnego axe/sewing kit kind, jeśli capability jest spełnione przez inny zgodny tool.

## 24. Repair interaction and preview

Reuse istniejący FlavorDialog/contextual action mechanism.

Przed rozpoczęciem:

```text
Posłanie

Stan: 58%
Po naprawie: 100%

Materiały:
2 × skóra

Czas pracy:
1 h 20 min

[Napraw]
[Zamknij]
```

Disabled states powinny pokazywać brak capability/materials lub full condition.

Po rozpoczęciu:

```text
Naprawa w toku

Stan przed naprawą: 58%
Cel: 100%
Postęp pracy: 35 min / 1 h 20 min
Materiały: dostarczone

[Kontynuuj naprawę]
[Zamknij]
```

Preview i start validation korzystają z tego samego domain quote resolvera.

## 25. Tent interaction

Tent inspection z `items-player-018` dostaje repair action obok istniejących opcji.

Nie tworzyć dedicated `TentRepairModal`.

W czasie active repair nadal można inspectować/continue repair, ale nie wykonywać operacji, które zniszczyłyby authoritative repair state.

## 26. Bedroll and platform interaction

Bedroll/platform analogicznie dostają contextual repair/continue action przez istniejący dialog mechanism.

Nie tworzyć osobnych modal components tylko dla repair.

## 27. Repair from condition 0

Condition `0` nie oznacza automatycznie zniszczenia obiektu.

Camp object:

- istnieje,
- można inspectować,
- można rozpocząć repair episode,
- zachowuje identity.

Nie dodawać irreparable threshold, auto-destruction ani replacement workflow.

## 28. Repair XP

Meaningful accepted/completed repair work nagradza `Repair` XP zgodnie z istniejącym XP model + anti-farming conventions.

Nie nagradzać za:

- preview,
- targeting,
- rozpoczęcie bez work contribution,
- failed start,
- cancellation bez accepted work.

Nie używać Survival XP jako głównej nagrody za techniczną naprawę.

Exact award cadence dobrać tak, aby interruptions/resume nie umożliwiały XP farming; preferować accepted useful work lub completion-weighted award zgodny z obecnymi skill semantics.

## 29. Packing repaired tent

Przed packing resolve current condition do `now`.

Jeżeli tent posiada active repair:

```text
packing blocked in V1
```

z czytelnym feedbackiem, np. że najpierw trzeba dokończyć naprawę.

Nie próbować przenosić active `RepairProgress` do inventory item instance w tym planie.

Po zakończonej naprawie:

```text
world tent condition X
→ pack
→ inventory tent instance condition X
→ save/load
→ deploy
→ world tent condition X
```

## 30. Merchant purchase and selling after tent migration

Kupno fresh tent korzysta z istniejącego instance acquisition path i daje condition `100`.

Sprzedaż instance-backed tent powinna reuse istniejący instance sell flow.

Jeżeli istnieje shared condition-based instance pricing, reuse go. Jeśli nie, wykonać minimalne condition-aware pricing bez osobnego merchant subsystemu.

Invariant:

```text
lower tent condition
→ monotonic lower sell value
```

## 31. Persistence

Persistować authoritative state.

### Carried tent

```text
id
kind: tent
condition
```

### Placed camp object

Istniejący condition + timestamp oraz active repair progress wymagany przez `world-021` semantics.

Dla active repair persistować tylko authoritative fields, np.:

```text
startedCondition
targetCondition
requiredWork
completedWork
```

Nie persistować:

- quote,
- UI state,
- current worker,
- Busy Action,
- material source,
- skill multiplier,
- repair history.

Po save/load active repair można kontynuować bez ponownej konsumpcji committed materials.

## 32. Migration

Old carried tents:

```text
count N
→ N fresh instances at condition 100
```

Existing placed tents zachowują condition/timestamp z `items-player-018`.

Old saves bez repair state:

```text
no active repair
```

Nie resetować condition-aware placed tents podczas migracji portable tent representation.

## 33. Full camp interaction

`Rozbij pełny obóz` nie naprawia nic automatycznie.

Damaged existing camp objects zachowują swój condition.

Nie rozszerzać PlayerIntentController o auto-maintenance.

## 34. UI/domain boundary

Vue może:

- renderować condition,
- renderować quote,
- renderować progress i disabled reason,
- invoke action.

Vue nie może:

- obliczać material cost,
- obliczać required work,
- obliczać skill modifiers,
- konsumować materiałów,
- mutować RepairProgress/condition,
- resolve weather degradation.

## 35. Tests — sewing kit and capabilities

Sprawdzić co najmniej:

```text
sewing_kit → textile_repair
knife → no textile_repair
```

oraz merchant purchase/save-load flow.

## 36. Tests — tent identity

Kluczowy regression:

```text
buy tent
→ instance id A / condition 100
→ deploy
→ world identity A
→ degrade/repair to X
→ pack
→ inventory identity A / condition X
→ save/load
→ deploy
→ same identity / condition X
```

Nie wolno resetować condition.

## 37. Tests — repair quote

Dla tent/bedroll/platform sprawdzić m.in.:

- condition `0`, `50`, `99`,
- deterministic target `100`,
- material count rośnie sensownie wraz z większym damage,
- requiredWork jest dodatnie dla realnej naprawy,
- condition `100` nie tworzy quote/start action,
- preview i authoritative resolver są zgodne.

Jeżeli `Repair` wpływa na required/effective work, higher Repair nie może pogarszać wyniku.

Jeżeli Survival zostaje supporting modifierem, sprawdzić tylko rzeczywiście przyjętą semantykę.

## 38. Tests — repair transaction

Sprawdzić:

1. no capability → no start,
2. insufficient materials → no start/no consumption,
3. condition 100 → no start,
4. valid start → all materials consumed exactly once,
5. valid start → RepairProgress created,
6. cancellation/interruption → progress/material commitment survives,
7. resume → same repair episode continues,
8. multiple work bouts accumulate accepted work,
9. completion → condition becomes targetCondition,
10. completion → repair state removed,
11. completion → degradation timestamp resets,
12. save/load mid-repair → no repeated material consumption.

## 39. Tests — active repair restrictions

Sprawdzić:

```text
active tent repair
→ packing blocked
→ inspection/continue repair available
```

oraz odpowiednie restrictions dla bedroll/platform, jeśli istnieją operacje usuwające/przenoszące target.

## 40. Tests — degradation checkpoint

Scenario:

```text
weather degradation until day N
→ start repair day N
→ repair starts from resolved current condition
→ completion day M
→ condition anchor = day M
→ future degradation counts only after completion
```

Podczas active repair zachowanie freeze degradation ma być zgodne z `world-021`.

## 41. Tests — Repair XP

Sprawdzić:

- no XP for preview/failed start,
- no XP farming przez start/cancel,
- accepted useful repair work awards Repair zgodnie z przyjętą cadence,
- Survival nie dostaje primary repair reward.

## 42. Documentation

Po implementacji zaktualizować odpowiednie canonical docs dotyczące:

- item catalog,
- player skills,
- camp/rest,
- sleeping utilities,
- persistence,
- merchant flow,
- repair foundation integration.

Wyraźnie udokumentować:

```text
tent is instance-backed
condition survives pack/redeploy
repair material ≠ construction recipe
tool capability ≠ skill
camp world objects use persistent RepairProgress
Repair is primary repair skill
```

Dodać JSDoc dla ważnych public/domain helpers zgodnie z aktualną konwencją.

Nie uruchamiać ręcznie `pnpm docs:sync`.

## Out of scope

- weapon/tool durability repair,
- sharpening,
- clothing/armor durability,
- sewing kit durability,
- crafting sewing kit,
- crafting tent,
- cloth material,
- tailoring profession,
- generic inventory-item repair framework,
- player-selectable partial target condition,
- NPC autonomous repair,
- paid repair service,
- repair Work Contracts,
- automatic maintenance,
- auto-repair during sleep,
- auto-repair in Full Camp,
- explicit repair abandonment/refunds,
- irreparable condition,
- object destruction at 0,
- material quality,
- tool quality,
- repair RNG,
- dedicated repair animation framework.

## Completion criteria

Plan jest zakończony, gdy:

- istnieje `textile_repair`,
- `sewing_kit` zapewnia capability i jest dostępny u Kupca za 18 coin,
- namiot i bedroll wymagają `textile_repair`, platform wymaga `wood_chopping`,
- tent/bedroll/platform mają camp-specific material requirements,
- `Repair` jest primary skill dla camp repair,
- camp objects konsumują persistent `RepairProgress` semantics z `world-021`,
- materials są atomically committed przy start repair episode,
- Busy Action wnosi actor-neutral work contribution zamiast bezpośredniego `+condition`,
- interruption/resume zachowuje progress,
- completion ustawia authoritative condition na target i resetuje degradation anchor,
- player V1 repair target to `100`,
- preview i actual start używają tego samego domain quote resolvera,
- Repair XP nie jest przyznawane za failed/cancelled work bez useful contribution,
- tent jest instance-backed i condition przeżywa pack → inventory → save/load → redeploy,
- active tent repair blokuje packing w V1,
- nie powstał równoległy repair ownership/framework,
- automated tests przechodzą,
- implementation notes i canonical docs są aktualne.

## Manual verification

Browser/manual verification wykonuje User, nie AI.

Zweryfikować ręcznie co najmniej:

- zakup `sewing_kit` u Kupca,
- repair namiotu, bedrolla i platformy,
- missing-tool i missing-material feedback,
- materiały consumed raz przy rozpoczęciu repair,
- interruption + resume tego samego repair episode,
- save/load w trakcie repair,
- Repair wpływa zgodnie z implementacją i dostaje XP,
- active tent repair blokuje packing,
- condition namiotu przeżywa pack → save/load → redeploy,
- repaired condition poprawnie degraduje się dalej od completion timestamp.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
# Plan: Player skills and targeted skill actions foundation

**Created:** 2026-09-09
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `items-player`
**Subdomains:** `interaction` `player-needs`
**Tags:** `skills` `targeted-actions` `medicine` `repair` `traps`
**Roadmap:** -

## Goal

Rozszerzyć istniejący model umiejętności gracza o `Medicine` i `Repair` oraz dodać wspólny fundament dla aktywnego używania wybranych skills na celach świata:

```text
select skill
→ choose target
→ resolve available skill action
→ execute
→ domain-owned world change
```

Fundament ma obsługiwać przede wszystkim przyszłe `Medicine`, `Repair` i rozwinięcie `Traps`, bez implementowania w tym planie ich pełnych use-case'ów.

Targeted skill interaction ma reuse istniejące `Interactable` i gaze selection zamiast tworzyć równoległy system targetowania.

## Current state

Obecny `PlayerSkills` posiada sześć skills:

- Sneak,
- Survival,
- Traps,
- Defense,
- Archery,
- Riding.

Wspólny model przechowuje `xp`, wyprowadza z niego `value` i używa jednego `awardSkillXp()` jako mutation path progresji. `SkillState.active` jest runtime state używanym obecnie przez Sneak.

Świat posiada już mechanizmy będące naturalnymi przyszłymi consumers:

- placed traps z durability i `Traps` skill snapshot,
- weapon instances z durability/sharpness i sharpening,
- shared health oraz health consumables,
- wspólny `Interactable` + gaze target-selection pipeline.

Nie istnieje natomiast wspólny `skill → target → action` pipeline.

## 1. Extend the existing skill model

Dodać:

```text
Medicine
Repair
```

jako pełnoprawne `SkillId` w istniejącym `PlayerSkills`.

Muszą reuse obecne:

- `SkillState`,
- XP/value curve,
- initialization,
- labels,
- `awardSkillXp()`,
- persistence/restore model.

Nie tworzyć osobnego progression modelu dla nowych skills.

Nie przebudowywać przy okazji wszystkich istniejących skill consumers.

## 2. Skill-use categories

Nie zakładać, że każda skill jest ręcznie używana na konkretnym celu.

Rozróżnić semantycznie co najmniej:

```text
targeted
    świadomie używana na konkretnym celu

stance
    aktywny tryb zachowania

contextual/passive
    wpływa na istniejącą akcję lub system
```

Docelowo:

```text
Medicine   → targeted-capable
Repair     → targeted-capable
Traps      → targeted-capable

Sneak      → stance

Archery
Defense
Riding     → contextual

Survival   → obecnie contextual;
             przyszłe targeted actions są dozwolone
```

Nie używać `SkillState.active` jako selected targeted skill. `active` zachowuje swoje obecne znaczenie.

## 3. Runtime selected skill

Dodać osobny runtime state reprezentujący aktualnie wybraną targeted skill, koncepcyjnie:

```ts
selectedSkill: SkillId | null
```

Stan:

- nie jest trwałym stanem świata,
- może zostać anulowany/wyczyszczony,
- nie jest zapisywany w SaveData,
- samo wybranie skilla nie mutuje świata.

## 4. Separate skill evaluation from world targeting

Fundament ma rozdzielać dwie warstwy:

```text
shared skill evaluation
    actor + primary skill + optional support/context
    → competence inputs / resolved contribution

targeted skill interaction
    selected skill + Interactable + live context
    → contextual action
```

To rozdzielenie jest wymagane, ponieważ nie wszystkie przyszłe use-case'y mają naturalny world `Interactable`.

Przykłady:

- self-treatment,
- sharpening itemu w Inventory,
- crafting/production.

Wspólny skill-evaluation seam powinien być możliwy do reuse przez takie akcje bez sztucznego tworzenia world targetów.

## 5. Reuse existing world target selection

Targeted world skills mają korzystać z istniejącego:

```text
buildInteractables()
→ pickInGaze()
→ Interactable
```

Nie tworzyć:

- osobnego raycastu dla skills,
- drugiego proximity query,
- `MedicineTarget`,
- `RepairTarget`,
- `TrapSkillTarget`,
- równoległego rejestru skill-targetable objects.

`Interactable` pozostaje cienkim per-frame adapterem do właściwego state ownera.

Nie przenosić do niego centralnie pól takich jak:

```text
supportedSkills
skillDifficulty
repairAmount
medicineEffect
```

## 6. Targeted skill action resolution

Dodać mały wspólny seam pozwalający gameplay/application layer ustalić:

```text
actor
+ selected skill
+ target
+ live context
→ available skill action(s)
```

Rozdzielić:

```text
query / availability
→ execution
→ domain mutation
```

Query nie może mutować świata.

Execution ma delegować zmianę do domeny będącej właścicielem target state.

Nie tworzyć centralnego managera posiadającego Medicine, Repair, Traps, durability, health lub inne domain state.

## 7. Revalidation

Targeted action nie może ufać wyłącznie snapshotowi z chwili targetowania.

Przy wykonaniu, a przy timed/busy actions także przy completion, revalidować odpowiednio:

- target nadal istnieje,
- target nadal pozwala na operację,
- actor nadal może wykonać akcję,
- wymagane tools/materials nadal istnieją,
- aktualny domain state nadal jest poprawny.

Nie mutować świata na podstawie stale copied state.

## 8. Primary and supporting skills

Fundament ma umożliwiać consumerowi wskazanie:

- jednego primary skill,
- opcjonalnych supporting skills lub attributes.

Nie definiować w tym planie globalnego wzoru typu:

```text
(skillA + skillB) / 2
```

ani obowiązkowego weighted average.

Supporting competence może później być użyta przez consumer jako:

- bonus,
- requirement threshold,
- quality/duration modifier,
- ograniczenie maksymalnego wyniku,
- wejście do deterministic check.

Przykładowe przyszłe semantyki:

```text
repair trap
    primary: Repair
    support: Traps

craft trap
    primary: Traps
    support: Repair

disarm trap
    primary: Traps
```

Jeżeli kilka realnych consumers wykaże wspólną potrzebę weighted composition, wydzielić wtedy shared helper zamiast projektować go przed use-case'ami.

## 9. Difficulty and outcome

Fundament nie narzuca jednego globalnego modelu skill check.

Consumer może później używać competence jako:

- threshold,
- effectiveness,
- duration modifier,
- quality,
- material efficiency,
- success probability.

Nie wprowadzać Fallout-style random roll jako obowiązkowego zachowania wszystkich targeted skills.

Jeżeli konkretny consumer potrzebuje losowości, zachować deterministyczny/testowalny model zgodny z istniejącymi simulation patterns.

## 10. Medicine integration contract

W tym planie `Medicine` otrzymuje:

- `SkillId`,
- standardowy `SkillState`,
- XP/value progression,
- persistence,
- UI label,
- możliwość uczestniczenia w skill evaluation i targeted-skill framework.

Nie implementować jeszcze pełnych consumers.

Przyszłe plany Medicine mogą użyć fundamentu dla:

```text
self treatment
NPC treatment
animal treatment
injury examination
condition treatment
medical crafting
```

Medicine nie może tworzyć równoległego health systemu. Powinno korzystać ze shared health/injury/condition/item mechanisms właściwych dla danego targetu.

## 11. Repair integration contract

W tym planie `Repair` otrzymuje:

- `SkillId`,
- standardowy `SkillState`,
- XP/value progression,
- persistence,
- UI label,
- możliwość uczestniczenia w skill evaluation i targeted-skill framework.

Nie implementować jeszcze właściwego Repair gameplay.

Przyszłe plany mogą wykorzystać Repair dla:

```text
weapon/tool repair
sharpening
trap repair
construction repair
building repair
object maintenance
technical crafting
```

Repair nie jest właścicielem durability/condition.

Stan pozostaje własnością właściwej domeny, np.:

```text
weapon → durability / sharpness
trap   → durability
future building/construction → own condition/durability
```

Nie dodawać generic building durability tylko po to, aby Repair miało consumer.

## 12. Traps integration contract

`Traps` jest istniejącym skillem i najlepszym kandydatem na minimalny targeted-action vertical slice.

Zachować rozdzielenie znaczeń:

```text
Traps
    wiedza o pułapkach, mechanizmach, ustawieniu,
    wykrywaniu i bezpiecznej obsłudze

Repair
    techniczna naprawa i odtwarzanie sprawności
```

Przyszłe operacje mogą więc używać obu kompetencji bez zlewania ich w jeden skill.

Nie implementować w tym planie pełnego trap repair ani przebudowy istniejącego trap gameplay.

## 13. Minimal vertical slice

Dodać jeden mały consumer potwierdzający działanie pipeline.

Preferowany:

```text
select Traps
→ gaze at existing placed trap
→ Inspect trap
→ contextual result based on real trap state
```

Inspection ma odczytywać istniejący live state, np. odpowiednio:

- trap state (`placed` / `active` / `broken`),
- durability/condition,
- bait state, jeśli dostępny przez właściwego ownera.

Nie tworzyć sztucznego standalone flavor text jako jedynego rezultatu.

Vertical slice ma potwierdzić:

```text
skill selection
→ existing target selection
→ action availability
→ live domain lookup
→ execution
→ feedback
```

Nie zmieniać przy tym capture, arming/disarming, weather wear, durability ani detection rules istniejących pułapek.

Inspection nie musi przyznawać XP.

## 14. Tools, materials and Inventory

Skill competence i fizyczne requirements pozostają osobnymi pojęciami.

Przyszła operacja może wymagać jednocześnie:

```text
skill
+ tool
+ materials
+ valid target state
```

Targeted skill framework nie zastępuje `Inventory` ani `ITEM_CATALOG[kind].capabilities`.

Nie hardcodować list konkretnych itemów w centralnym skill resolverze, jeżeli istniejący capability mechanism już reprezentuje wymaganie.

## 15. Crafting and non-world consumers

Nie tworzyć `SkillCraftingSystem`.

Crafting/production pozostaje mechanizmem domenowym.

Shared skill evaluation powinno jednak dać się reuse przez przyszłe recipes, np.:

```text
recipe
+ materials
+ tools
+ primary/supporting skill inputs
→ result
```

Analogicznie sharpening itemu w Inventory lub self-treatment mogą korzystać z tego samego skill-evaluation seam bez przechodzenia przez `Interactable`.

## 16. UX and interaction

Targeted world-skill mode ma integrować się z istniejącym interaction/UI flow.

Koncepcyjnie:

```text
select skill
→ enter targeting mode
→ gaze selects normal Interactable
→ gameplay resolves available skill action
→ UI renders contextual action
→ E executes
→ Esc/cancel leaves targeting mode
```

Vue pozostaje warstwą prezentacji.

Nie implementować w UI domenowych warunków typu:

```text
if Repair && target.kind === 'trap' ...
```

Gameplay/application layer dostarcza gotowy contextual action/view model.

Normalne interaction bez selected skill musi zachować dotychczasowe działanie.

## 17. XP

Nowe skills korzystają z istniejącego XP modelu.

Framework może umożliwiać consumers przyznawanie XP, ale nie przyznaje XP automatycznie za samo użycie targeted mode.

Nie nagradzać za:

- wybór skilla,
- targetowanie,
- anulowanie,
- darmowe powtarzalne inspection,
- nieukończoną akcję.

Realne consumers definiują meaningful XP awards i anti-farming rules.

## 18. Persistence compatibility

`Medicine` i `Repair` muszą być bezpiecznie dodane do istniejącego XP-only persistence modelu.

Stare save'y bez nowych skills muszą nadal się ładować i deterministycznie otrzymać domyślne novice XP/value zgodne z `createPlayerSkills()`.

Nie persistować:

- `SkillState.value`,
- `SkillState.active`,
- selected targeted skill.

Jeżeli aktualny required `SaveSkills = Record<SkillId, ...>` contract wymaga schema migration/default normalization po rozszerzeniu `SkillId`, wdrożyć ją w istniejącym persistence pipeline zamiast utrzymywać dwa warianty runtime skill state.

## 19. Performance

Nie dodawać nowego kosztownego per-frame pipeline.

Targeted skill mode ma reuse target już ustalany przez existing interaction system.

Skill action availability liczyć tylko wtedy, gdy jest potrzebna dla aktualnego targetu/interakcji.

Nie przenosić mechanizmu do Web Workera.

## 20. Extensibility boundary

Architektura powinna pozwolić później reuse skill-evaluation concepts przez NPC, ale ten plan nie implementuje NPC skills.

Nie wiązać pure skill evaluation niepotrzebnie z Three.js, Vue ani `PlayerController`, jeżeli może pozostać małym współdzielonym helperem.

Jednocześnie nie budować kompletnego generic actor-skill frameworku wyłącznie dla hipotetycznej przyszłości.

## Non-goals

Plan nie implementuje:

- pełnego Medicine gameplay,
- leczenia NPC/animals przez gracza,
- self-treatment flow,
- injuries/conditions framework,
- medical crafting,
- weapon/tool repair,
- Repair-based sharpening,
- generic tool durability,
- building/construction durability,
- building/construction repair,
- trap repair,
- skill-aware trap crafting,
- NPC Medicine/Repair skills,
- NPC doctor/repair professions,
- repair pressures/jobs/economy,
- nowego generic crafting systemu,
- migracji wszystkich istniejących skill consumers pod jeden `SkillAction` API.

Obecne Sneak, Survival, Archery, Defense i Riding pozostają na swoich aktualnych ścieżkach, chyba że minimalna zmiana jest konieczna do współdzielenia `SkillId`/skill state lub UI.

## Follow-up plan contract

Po wdrożeniu fundamentu poprawić plany implementujące właściwe Medicine i Repair tak, aby:

1. zależały od `items-player-021`,
2. używały istniejącego skill modelu i nowego shared evaluation/targeted-action seam,
3. nie tworzyły własnego targetowania ani skill-check frameworku,
4. pozostawiały health/durability/condition odpowiednim state ownerom,
5. definiowały konkretne consumers, tools/materials, outcome, busy/action lifecycle i XP.

Plany repair buildings/constructions powinny dodatkowo zależeć od właściwego durability/condition foundation zamiast wprowadzać go ukrycie jako część Repair.

## Acceptance criteria

- `Medicine` i `Repair` są pełnoprawnymi `SkillId` i korzystają ze standardowego XP/value modelu.
- Ich XP jest persistowane przez istniejący skill persistence model.
- Stare save'y bez Medicine/Repair ładują się z bezpiecznymi wartościami domyślnymi.
- Istnieje osobny runtime selected targeted skill state.
- `SkillState.active` zachowuje dotychczasowe znaczenie.
- Istnieje mały shared skill-evaluation seam niezależny od world targeting.
- Shared evaluation wspiera primary skill i opcjonalny support bez narzucania globalnej weighted-average formuły.
- Targeted world skills korzystają z existing `Interactable` i gaze targeting.
- Nie istnieje drugi skill-specific raycast/proximity pipeline.
- Gameplay może query dostępne skill actions dla aktualnego `(skill, target)`.
- Query nie mutuje świata.
- Execution revaliduje wymagany live state.
- Domain state pozostaje własnością odpowiednich systemów.
- Normalne interaction bez selected skill działa bez regresji.
- Minimalny `Traps → Inspect trap` vertical slice przechodzi przez nowy pipeline i odczytuje realny trap state.
- Medicine i Repair nie otrzymują sztucznych gameplay consumers tylko po to, aby zademonstrować framework.
- Brak nowego globalnego Skill/Repair/Medicine managera.
- Brak znaczącego dodatkowego kosztu per-frame.
- Pure skill-evaluation logic ma testy jednostkowe.
- Target/action availability, cancellation i invalidated target mają odpowiednie testy.
- Existing tests/typecheck/lint/build pozostają zielone.

## Documentation and implementation guidance

Podczas implementacji:

- zaktualizować current-state docs po zmianie faktycznego stanu,
- po ukończeniu fundamentu zaktualizować właściwe plany Medicine/Repair zgodnie z dependency contract powyżej,
- dodać JSDoc dla ważnych nowych publicznych/architektonicznych funkcji i typów, gdy pomaga to preflight discovery; użyć `@domain` tam, gdzie jest uzasadnione,
- nie uruchamiać ręcznie `pnpm docs:sync`, ponieważ synchronizacja dokumentacji działa przez istniejący GitHub workflow.

Browser/manual verification wykonuje użytkownik.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

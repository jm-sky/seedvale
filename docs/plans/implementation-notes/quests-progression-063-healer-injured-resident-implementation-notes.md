# Implementation Notes: quests-progression-063 — Healer — Injured Resident

**Prepared:** 2026-09-18  
**Plan:** `quests-progression-063-healer-injured-resident.md`

## Current ownership / verified seams

- `src/ai/characters.ts::Role` zawiera `herbalist`, nie `healer`.
- `src/settlement/professionStaffing.ts::ROLE_STAFFING_POLICY.herbalist` odpowiada za deterministic staffing; Herbalist nie jest losowany z generic role pool.
- `src/ai/schedule.ts`, `src/ai/npcProfessionWork.ts::planHerbalistWork()`, `src/settlement/places.ts::workplaceFor(..., 'herbalist', ...)` i Herbalist dressing production są już normalnym profession flow. Quest ma tylko wybrać istniejącego Herbalist NPC jako givera.
- Stable settlement identity to `src/settlement/npcState.ts::NpcId`; `src/settlement/npcIdentity.ts::settlementNpcId()` buduje `${settlementId}:npc:${memberIndex}`. Display name nie jest identity.
- `SettlementsManager.getNpcState(id)` zwraca fresh registry-owned `NpcAuthoritativeState` również dla wcześniej zmaterializowanego, obecnie unloaded mieszkańca. `snapshotNpcStates()` nie jest lookupem gameplayowym.
- `NpcAuthoritativeState.physicalInjury` jest persisted ownerem urazu; `injuryRecoveryUpdatedAtDays` jest persisted lazy recovery anchor. `temporaryConditions` jest osobnym istniejącym systemem i nie jest potrzebne do 063.
- `src/shared/injurySeverity.ts::resolveInjurySeverity()` jest jedynym severity resolverem. Progi: serious od 25% max HP, critical od 55%.
- `src/shared/injuryRecovery.ts::resolveInjuryRecovery()` mutuje authoritative health/injury z elapsed days. Critical natural recovery zatrzymuje się na critical→serious floor; serious/minor mogą zejść niżej/wyzdrowieć.
- `src/player/medicalTreatment.ts::treatableFromNpc()` adaptuje live `NpcAgent` do istniejącego `TreatableTarget`.
- `resolveMedicalTreatmentPlan()` wybiera materiał przez `Inventory.findInjuryTreatment(severity)` i `resolvePhysicalInjuryTreatment()`; fallback `stabilize` istnieje bez itemu.
- `src/app/actions/medicalTreatmentActions.ts::completeMedicalTreatment()` najpierw rozwiązuje lazy recovery, rewaliduje plan, potem wywołuje `target.applyTreatment()`. Tylko positive restore uruchamia `onPlayerMedicalTreatmentCompleted`; ten callback jest już używany przez Known Deeds.
- `src/shared/physicalInjuryTreatment.ts`: serious bare-hands stabilization nie może zejść poniżej `seriousInjuryFloor()`. Dlatego predicate „severity < serious” odróżnia rzeczywistą poprawę od samej stabilizacji bez duplikowania item requirement.

## Quest architecture to reuse

- `src/quests/quests.ts::QuestNpcRef` już przechowuje stable `NpcId`.
- `QuestState` ma `failed` i techniczne `invalidated`; nie dodawać nowego terminal state.
- `QuestManager` ma istniejący wzorzec state-bound/world lookup: injected lookup + bounded `poll*Objectives/Sources()`; klasa nie importuje world ownerów.
- `docs/plans/quests-progression-060-builder-finish-local-well.md` / jego notes są najbliższym wzorcem architektonicznym: objective obserwuje realny domain state, actor attribution jest celowo nieistotne, missing active target → invalidated.
- `src/quests/opportunities/` jest obecnym seamem dla deterministic contextual settlement opportunities. Reuse selection/materialization; nie dodawać profession quest registry.
- `QuestManager.labelMarker(npcId)` i obecne lifecycle/actionability rules mają pozostać jedynym marker pipeline.
- Quest outcomes/consequences już obsługują coin reward, giver relation oraz settlement reputation. Dla tego planu nie potrzeba nowego effect/reward typu.

## Recommended objective contract

Najmniejsza spójna forma to state-bound objective zawierający exact NPC ref, np.:

```ts
{ type: 'improve_npc_injury', npc: { npcId } }
```

Nie dodawaj do objective:

```ts
initialInjury
requiredItem
treated
treatedByPlayer
healingProgress
```

Eligibility snapshot podczas materialization może sprawdzić `resolveInjurySeverity(state.physicalInjury, state.health.maxHp) === 'serious'`, ale po acceptance każdy poll musi czytać aktualny owner state od nowa.

## Quest-facing lookup

Wstrzyknij do `QuestManager` wąski resolver z composition root. Nie przekazuj `SettlementsManager` ani registry.

Resolver musi:

1. `bundle.settlements.getNpcState(npcId)`;
2. jeśli brak → `missing`;
3. jeśli dead / post-death authoritative state → `dead`;
4. dla alive wywołać `resolveInjuryRecovery(state, dayNight.elapsedDays)`;
5. zwrócić derived `resolveInjurySeverity(state.physicalInjury, state.health.maxHp)`.

To rozwiązuje natural recovery dla unloaded NPC bez globalnego scan/ticka.

Uwaga: getter lookupu nie może cache'ować `bundle`-owned obiektu przy WorldBundle rebuild. Ma dereferencjonować aktualny bundle/manager tak samo jak inne app-level injected lookups.

## Completion / terminal mapping

Dla active bound target:

```text
alive + serious/critical → pozostaje active
alive + minor/none     → complete objective przez zwykły stage path
dead                   → authored failed outcome
missing                → technical invalidated
```

Dla `not_offered/offered`:

```text
serious → może pozostać offerable
minor/none/dead/missing → nie oferować / wycofać offer
```

Nie używać `RESOLVED_WITHOUT_PLAYER_OUTCOME` do normalnej recovery. Desired world state sam jest objective.

Jeśli target pogorszy się z serious do critical po acceptance, quest pozostaje aktywny; nie twórz difficult-case branch. 064 może obsłużyć trudniejszy authored flow później.

## Poll trigger points

Nie dodawaj per-frame NPC scan.

Najbardziej praktyczne hooki:

- successful `medicalTreatmentActions` completion: po istniejącym positive restore callbacku wywołać bounded quest injury poll;
- time-skip completion: po domain catch-up/recovery, potem quest poll;
- save/load / WorldBundle rebuild: jeden reconciliation poll po przywróceniu registry i lookupów;
- `QuestManager.onInteract(npcId)` dla givera/targeta może przed budową contribution wykonać bounded reconciliation dla tego aktywnego objective, aby continuous natural recovery nie zostawiło stale dialog state.

Jeśli w implementacji istnieje już wspólny poll state-bound objectives obejmujący te miejsca, rozszerz go zamiast dodawać `pollNpcInjuryObjectives()` jako osobną publiczną ścieżkę.

## Context materialization

W candidate selection reuse settlement definition + stable identity helpers, nie live `NpcAgent` order.

Eligibility:

- settlement ma adult `herbalist`;
- target jest innym adult alive resident;
- target authoritative severity po lazy resolution = `serious`.

Deterministic target tie-break:

1. preferowane role work-accident context: `blacksmith`, `woodcutter`, `miner`, `farmer`, `hunter`;
2. potem stable flattened member order / `NpcId`.

Nie twórz targetu ani injury. No candidate = no quest.

Quest id powinien zawierać stable settlement + target identity, zgodnie z obecnym contextual convention, np. `world:healer-injured-resident:<settlementId>:<targetNpcId>`. Jeśli opportunity module ma już canonical id helper, użyj go zamiast nowego parsera.

V1 powinien dopuścić najwyżej jeden selected definition globalnie/bounded, zgodnie z planem; nie emitować kopii dla każdego settlementu.

## Dialogue facts

Current injury state nie przechowuje cause/body part. Nie pisz:

- „przeciął przedramię”;
- „spadł z rusztowania”;
- „ma zakażenie”.

Można użyć role-aware neutralnego tekstu:

```text
"<name>, nasz kowal, jest poważnie ranny. Jeśli potrafisz opatrywać rany, zajrzyj do niego."
```

Role label musi pochodzić z istniejącego `Role` presentation helper, jeśli taki jest; nie twórz drugiego role-label map tylko dla questa.

## Treatment/item pitfall

Nie kopiuj treatment requirement do quest objective.

`resolveMedicalTreatmentPlan()` jest authoritative względem inventory, Medicine scaling i catalog metadata. Gdy Player nie ma odpowiedniego materiału, może nadal dostać stabilize action, ale serious stabilization nie spełni quest predicate. To jest poprawne: quest pozostaje aktywny, aż realny injury state poprawi się poniżej serious.

Nie dodawaj fetch stage ani darmowego quest-only opatrunku.

## Existing animal quest distinction

`quests-progression-057` jest nadal planem i proponuje event `treat_animal`, ponieważ jego humane outcome musi potwierdzić Player Medicine action. 063 nie powinien zależeć od tego planu ani kopiować jego actor-attribution semantics.

`quests-progression-058` również dotyczy exact animal treatment i authored injury policy. Nie przenosić jego recovery-lock/encounter state do human 063.

## Persistence / save schema

Brak zmiany `SaveData` oczekiwanej dla 063:

- NPC injury/recovery/death już round-tripuje w `SaveData.npcStates`;
- quest lifecycle/relation już round-tripuje w `SaveData.quests`;
- stable target jest częścią deterministic reconstructed `QuestDef`.

Nie persistować severity ani treatment requirement.

Po restore definicja musi być zrekonstruowana również wtedy, gdy target po acceptance jest już minor/none/dead; **nie filtruj aktywnego persisted questa tylko dlatego, że current eligibility dla nowej oferty już nie zachodzi**. Materialization musi odróżnić „definition required by persisted progress” od „new offer candidate”, tak jak istniejące generated quest flows.

To jest najważniejsza save/load pułapka.

## Marker integration

Rozszerz istniejący `labelMarker(npcId)` / contribution logic:

- giver offer marker przed acceptance;
- active injury objective contributes marker dla exact target `NpcId`;
- po objective completion target marker znika, giver dostaje existing `ready_to_report`.

Nie uzależniaj logicznego objective od live Object3D. Marker pojawia się tylko gdy normalny NPC runtime istnieje.

## Rewards

Użyj normalnego complete outcome:

- coins 10;
- relation do givera +2;
- settlement `competence +1`;
- settlement `benevolence +2`;
- renown 0.

Nie dodawaj Known Deed reward. Existing `onPlayerMedicalTreatmentCompleted` może niezależnie zaliczyć realne leczenie do settlement badge `healer`; nie wywołuj tego hooka ponownie z quest completion.

## Suggested implementation order

1. Dodać quest-facing NPC injury lookup type + state-bound objective.
2. Dodać bounded objective reconciliation i terminal mapping w `QuestManager`.
3. Dodać target marker contribution do istniejącego marker pipeline.
4. Dodać deterministic contextual opportunity/materializer z Herbalist giver + serious target.
5. Podpiąć composition lookup i bounded poll trigger points w `createApp.ts` / treatment/time-skip flow.
6. Dodać dialogue/outcome/reward.
7. Dodać focused tests, szczególnie persisted active definition reconstruction.

## Tests worth splitting by owner

### QuestManager

- exact `NpcId` only;
- serious remains active;
- minor/none completes;
- critical remains active;
- dead → failed;
- missing → invalidated;
- repeated poll idempotent;
- ready-to-report reward applies once.

### Opportunity/materialization

- Herbalist required;
- dead/healthy/minor/critical target not offered;
- serious target eligible;
- deterministic target/giver/id;
- giver != target;
- one bounded selected quest;
- persisted active quest definition reconstructs even after eligibility disappears.

### Treatment integration

- ordinary NPC Medicine changes the same authoritative state read by quest lookup;
- treatment callback triggers reconciliation without a second heal/report mutation;
- no active 063 quest leaves normal Medicine behavior unchanged.

### Continuity

- stream out/in preserves target;
- WorldBundle rebuild resolves current registry rather than stale state reference;
- save/load can immediately reconcile recovered/dead target;
- no duplicate offer or reward.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

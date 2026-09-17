# Implementation notes: items-player-046 Medicine targeted treatment interaction

**Plan:** `items-player-046-medicine-targeted-treatment-interaction.md`

## Scope boundary

`046` zakłada ukończony `items-player-045`. Nie wracaj tutaj do projektowania injury state, severity thresholds, stabilization floors ani livestock persistence.

Ten plan powinien być cienką integracją istniejących systemów:

```text
selected Medicine
→ target/self query
→ inventory + competence lookup
→ existing Busy Action
→ shared treatment resolver from 045
→ target-owned apply
→ item consumption + XP + feedback
```

## Targeted-skill seam

`src/interaction/targetedSkillAction.ts` obecnie ma:

```ts
export type TargetedSkillActionId = 'inspect-trap' | 'repair-camp'
```

oraz `TARGETED_SKILL_CONSUMERS` tylko dla `repair` i `traps`.

`listActionablePlayerSkills()` filtruje skill przez `hasImplementedTargetedSkillConsumer()`. To jest dokładny reason, dla którego `medicine` nie pojawia się na `SkillsScreen.vue`.

Implementacja powinna:

- dodać Medicine consumer do istniejącego dispatchu,
- zachować `queryTargetedSkillAction()` jako pure availability query,
- rozszerzyć `TargetedSkillQueryContext` tylko o minimalne read/start seams potrzebne Medicine,
- nie dodawać osobnego raycastu ani Vue allowlisty.

Po tym `SkillsScreen.vue` nie powinien wymagać zmiany poza ewentualnym tekstem/presentation, bo visual config dla Medicine już istnieje.

## Self-treatment nie jest world targetem

`queryTargetedSkillAction()` przyjmuje `Interactable`, więc self-treatment nie powinno być implementowane przez fikcyjny `Interactable` playera.

Najprostszy contract:

- world-target Medicine → istniejący targeted consumer,
- self Medicine → mały sibling query/execute seam wywoływany, gdy Medicine jest selected i użytkownik wybiera self-action.

Oba mają używać **tego samego treatment executor/helpera** od momentu, gdy target adapter został rozwiązany.

Nie duplikuj treatment logic między `self` i `world`.

## Interactable target mapping

Przed implementacją sprawdź aktualne warianty `Interactable` dla:

- NPC,
- animal/livestock.

Consumer powinien mapować `Interactable` → cienki `TreatableTarget`/adapter, który potrafi:

- sprawdzić alive,
- odczytać health/injury,
- zaaplikować treatment przez publiczny seam właściciela stanu z `045`,
- dostarczyć label/id do promptu.

Nie importuj/private-mutuj pól `NpcAgent`/`AnimalAgent` z interaction layer, jeśli `045` wystawia publiczny treatment adapter/method.

### Livestock gate

Nie stosuj listy `cow | sheep | horse | ...`. Użyj current livestock ownership/registration semantics. `AnimalAgent` jest wspólny dla wild i domestic, więc gate musi pochodzić z realnego ownership/livestock seam.

Wild fauna ma zwrócić `null` z query.

## Query contract

Query ma odpowiedzieć wyłącznie:

- czy target jest treatable,
- czy ma injury,
- czy dostępny jest material treatment albo stabilization,
- jaki prompt pokazać.

Query nie może:

- usuwać itemu,
- mutować HP/injury,
- awardować XP,
- rozpoczynać recovery,
- losować wyniku.

Jeżeli query musi sprawdzić `Inventory.findInjuryTreatment(severity)`, traktuj wynik jako advisory. Na completion wszystko jest revalidowane.

## Treatment selection

`Inventory.findInjuryTreatment(severity)` już wybiera catalog-driven treatment poprzez `INJURY_TREATMENT_KINDS` + `itemTreatsPhysicalInjury()`.

Reuse tego API jako v1 selection.

Nie twórz:

- nowego `MEDICAL_ITEMS` array,
- UI picker materiału,
- alternatywnego sortowania w interaction layer.

Polityka:

```text
suitable material available
→ material treatment

no suitable material + stabilization has effect
→ stabilization

no effect possible
→ unavailable
```

Jeżeli inventory zmieni się w trakcie Busy Action, completion ponownie odpytuje `findInjuryTreatment()` i może fallbackować do stabilization zamiast failować, jeśli nadal ma ona realny efekt.

## Medicine effectiveness reuse

`src/player/medicinalTreatmentEffectiveness.ts` posiada:

- `resolveMedicinalTreatmentMultiplier(skills)`,
- `scaleMedicinalTreatmentAmount(base, skills)`,
- bounds `0.85..1.20` + Survival support do `0.10`.

Nie kopiuj tego wzoru.

Najprostsza implementacja material treatment:

```text
base = ITEM_CATALOG[kind].injuryTreatment.immediateHp
requestedPotency = scaleMedicinalTreatmentAmount(base, player.skills)
→ shared resolver from 045
```

Dla bare-hands stabilization potrzebna jest jawna base potency. Umieść ją przy treatment gameplay config/helperze, nie w Vue i nie w shared injury resolverze. Następnie skaluj ją tym samym Medicine effectiveness.

Jeżeli nazwa `medicinalTreatmentEffectiveness` stanie się semantycznie za wąska, można ją bezpiecznie uogólnić/rename z aktualizacją istniejących callers, ale nie twórz drugiego multiplier module.

## Medical tool — v1 tylko bonus

`skillEvaluation.ts` wspiera context input:

```ts
{ source: 'context', id: string, value: number }
```

To jest właściwy seam dla tool support, jeśli trzeba go uwzględnić w competence calculation.

Najpierw sprawdź, czy w katalogu jest realny item, który logicznie ma być medical tool. Jeśli nie — **nie dodawaj nowego itemu w tym planie**. Medicine ma działać bez niego.

Jeśli jest realny item:

- dodaj/reuse `ItemCapability` typu `medical_treatment`,
- użyj `Inventory.hasCapability()` / `findWithCapability()`,
- bonus bounded,
- brak hard requirement w v1,
- brak tierów.

Nie wymagaj held tool tylko dlatego, że inne działania narzędziowe tego wymagają; medyczny zestaw może być consumed-as-context z inventory. Jeśli UX projektu wymaga jawnego użycia toola w ręce, decyzję oprzyj na istniejącym analogicznym action pattern, nie na nowej regule.

## Busy Action seam

`createSurvivalActions()` już używa `PlayerActionContext.busy.start(duration, label, onComplete, options)` dla wielu działań, m.in. harvest/ignite/milk/shear.

Medicine powinno użyć tego samego kanału zamiast własnego timer/state machine.

Preferowany owner: mała action function przy innych player actions, prawdopodobnie w `src/app/actions/` zamiast rozbudowywać `targetedSkillAction.ts` o mutation logic.

`targetedSkillAction.execute` powinno tylko zainicjować tę domenową/player action funkcję.

### Completion revalidation

Na `busy.start(... onComplete)` ponownie sprawdzić:

- target nadal istnieje,
- target alive,
- target nadal ma injury,
- current severity,
- current material availability,
- final requested potency.

Dopiero potem resolver z `045` i apply.

Cancel = zero mutation.

## Atomic application

Nie zużywaj materiału przed potwierdzeniem realnego efektu.

Recommended sequence:

1. resolve target state,
2. resolve suitable material or stabilization,
3. calculate scaled requested potency,
4. shared treatment resolver,
5. jeśli requested/restored effect <= 0 → stop,
6. target-owned apply health/injury,
7. sprawdź actual restored amount,
8. jeśli material mode i actual > 0 → `inventory.remove(kind, 1)`,
9. award XP,
10. inventory/HUD/toast sync.

Jeśli target apply zwraca actual restored, użyj tej wartości jako source of truth dla consumption/XP.

## Medicine XP

`PlayerSkills.ts` ma `awardSkillXp()` oraz `SKILL_XP_AWARD`; `medicinalTreatment` award już istnieje z wcześniejszego planu dla successful medicinal treatment.

Przed dodaniem nowego klucza sprawdź, czy ten award semantycznie nadaje się do wound treatment. Jeśli tak — reuse. Jeśli nie, dodaj mały wound-treatment mapping, np. severity-based, ale unikaj dużego XP refactoru.

XP tylko gdy actual injury spadło.

## Feedback/UI

`SkillsScreen.vue` pobiera actionable skills z shared source i ma już presentation config dla `medicine`; nie wpisuj `medicine` do osobnej listy UI.

HUD prompt może być budowany przez `targetedSkillPrompt()` / action `promptLabel`.

Preferuj prosty feedback:

- `[E] Opatrz: <target>` gdy jest suitable material,
- `[E] Ustabilizuj: <target>` gdy tylko bare-hands ma efekt,
- healthy/unavailable → normalne `Medicine — brak akcji` lub bardziej konkretna lokalna wiadomość, jeśli API to wspiera bez rozszerzania generic prompt type.

Nie pokazuj liczbowej severity/physicalInjury.

## Suggested implementation order

1. Po `045` odczytaj finalny treatment/apply contract.
2. Zbuduj pure-ish Medicine query helper dla generic `TreatableTarget` + Inventory.
3. Dodaj Medicine world consumer do `targetedSkillAction.ts`.
4. Dodaj self-query seam reusing ten sam helper.
5. Dodaj Busy Action executor + completion revalidation.
6. Podłącz Medicine scaling.
7. Dodaj XP + feedback.
8. Dopiero na końcu opcjonalny medical-tool bonus, jeśli repo ma realny item.
9. Testy Skills visibility i integration.

## Tests

### Existing targeted-skill tests

Rozszerz istniejące testy `targetedSkillAction` o:

- `hasImplementedTargetedSkillConsumer('medicine') === true`,
- Medicine pojawia się w `listActionablePlayerSkills()`,
- query healthy/wild/dead zwraca null,
- injured livestock/NPC zwraca action,
- query nie mutuje ownerów.

### Action tests

Preferuj focused fake `TreatableTarget` zamiast konstruowania pełnego WorldBundle.

Testuj:

- material success → heal + injury drop + consume 1 + XP,
- stabilization success → no consume + XP,
- cancel → nothing,
- target heals before completion → no consume/no XP,
- target dies/disappears → no consume/no XP,
- material disappears → fallback stabilization, jeśli możliwe,
- low vs high Medicine daje bounded różnicę requested effect,
- maxSeverity nadal blokuje niewłaściwy materiał.

### Regression

- Repair targeted action nadal startuje camp repair,
- Traps inspect nadal działa,
- Sneak/actionable filtering bez zmian.

## Pitfalls

- Nie twórz synthetic player `Interactable` dla self-treatment.
- Nie trzymaj target object reference bez revalidation, jeśli current interaction system identyfikuje target stabilnym id.
- Nie konsumuj itemu na początku Busy Action.
- Nie traktuj `consumable.need === 'health'` jako wound treatment.
- Nie twórz gatunkowej livestock allowlisty.
- Nie naprawiaj NPC autonomous healing/inventory ownership w tym planie.
- Nie dodawaj tool hard requirement w v1.

## Expected final architecture

```text
SkillsScreen/listActionablePlayerSkills
        ↓
selected Medicine
        ↓
self query OR targetedSkillAction world query
        ↓
Medicine player action
        ↓
Inventory + PlayerSkills
        ↓
045 shared treatment resolver
        ↓
Player/Npc/Animal target-owned apply
        ↓
material consume + Medicine XP + feedback
```

To jest jedyny player-facing Medicine path; brak równoległego horse/NPC/self healing math.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
# Plan: Medicine targeted treatment interaction

**Created:** 2026-09-17
**Status:** `done` ✅ (implemented 2026-09-17 — browser verification by user)
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~items-player-045~~, ~~items-player-021~~, ~~items-player-043~~
**Domain:** `items-player`
**Subdomains:** `interaction` `items`
**Tags:** `medicine` `targeted-skill` `treatment` `livestock`
**Roadmap:** `physical-attributes-health-and-medicine`
**Model:** Sonnet, Composer

## Cel

Dodać player-facing użycie skilla `Medicine` jako prawdziwego targeted consumera, wykorzystując fundament physical injury/treatment z `items-player-045`.

Obsługiwane cele v1:

- self/player,
- żywy NPC,
- żywy livestock.

Plan nie projektuje ponownie injury modelu. Ma jedynie połączyć istniejące targetowanie, inventory, Medicine competence i shared treatment resolver z `045` w jedną graczową akcję gameplay.

## Założenia po `items-player-045`

`046` zakłada, że:

- Player/NPC/Animal mają spójne `physicalInjury` semantics,
- istnieje pure resolver stabilization/material treatment,
- `ITEM_CATALOG[kind].injuryTreatment` pozostaje source of truth,
- target adapter może odczytać health/injury i zaaplikować actual HP restore + injury decrease,
- NPC self-healing nie jest częścią player-facing flow.

Jeżeli current code po implementacji `045` różni się od tego kontraktu, dopasować się do kodu, nie tworzyć równoległego mechanizmu.

## Stan obecny

`src/player/PlayerSkills.ts` ma `medicine` jako `SkillId` oraz `SKILL_USE.medicine === 'targeted'`.

`src/interaction/targetedSkillAction.ts` pokazuje targeted skill na Skills Screen tylko wtedy, gdy ma realnego consumera. Obecnie `TARGETED_SKILL_CONSUMERS` ma tylko `traps` i `repair`, dlatego Medicine jest celowo niewidoczne.

`src/player/medicinalTreatmentEffectiveness.ts` ma bounded Medicine + Survival multiplier (`0.85..1.20` plus bounded Survival support). `src/player/skillEvaluation.ts` pozwala dodać context support, np. tool bonus, bez zmiany globalnego wzoru.

`Inventory.findInjuryTreatment(severity)` i `ITEM_CATALOG.injuryTreatment` już rozwiązują katalogową suitability materiałów.

## Decyzje

### 1. Medicine staje się prawdziwym targeted consumerem

Rozszerzyć `TargetedSkillActionId` i `TARGETED_SKILL_CONSUMERS` o Medicine action, np.:

```ts
'provide-medical-treatment'
```

Nie hardcodować `Medicine` w `SkillsScreen.vue`. Po dodaniu consumera `listActionablePlayerSkills()` ma automatycznie wystawić skill.

### 2. Jeden treatment flow dla wszystkich celów

Player/NPC/livestock mają wejść przez ten sam player action adapter:

```text
selected Medicine
→ resolve target
→ read current injury/severity
→ choose treatment mode/material/tool
→ start treatment
→ revalidate on completion
→ shared resolver from 045
→ apply HP/injury result
→ consume material once
→ award Medicine XP
```

Nie tworzyć osobnego `healHorse()`, `healNpc()` i `healSelf()` z własnym math.

### 3. Self-treatment

Current targeted API wymaga `Interactable`. Nie tworzyć sztucznego world objectu dla playera tylko po to, aby raycast zwrócił self.

Dodać minimalny self-action seam przy selected Medicine, np. osobny query/execute helper współdzielący ten sam treatment executor.

UX v1 ma umożliwiać:

```text
Medicine selected
→ Lecz siebie
```

bez konieczności patrzenia w world target.

### 4. NPC/livestock target gate

Medicine world target jest dostępny tylko dla:

- żywego NPC,
- żywego livestock/domestic animal.

Dead/corpse target jest niedostępny.

Wild fauna poza zakresem v1. Użyć istniejącego livestock/ownership seam, nie allowlisty gatunków w Vue ani w treatment resolverze.

### 5. Treatment mode selection

Consumer najpierw odczytuje injury severity i dostępne materiały.

Preferowana polityka automatyczna v1:

1. jeśli carried inventory ma odpowiedni `injuryTreatment` dla aktualnej severity → użyj materiału,
2. w przeciwnym razie, jeśli shared resolver pozwala na bare-hands stabilization → zaproponuj stabilizację,
3. jeśli target jest zdrowy albo żadna akcja nie ma efektu → brak executable treatment.

Nie dodawać osobnego modalnego wyboru materiału w v1.

`Inventory.findInjuryTreatment(severity)` pozostaje preferowanym selektorem, chyba że code po `045` dostarcza lepszy shared selector.

### 6. Medicine effectiveness

Player material-treatment potency ma być skalowane istniejącym bounded Medicine effectiveness.

Preferować reuse:

- `evaluateSkillCompetence()` dla odczytu Medicine/Survival/context,
- `resolveMedicinalTreatmentMultiplier()` / `scaleMedicinalTreatmentAmount()` albo małe uogólnienie tych funkcji, jeśli ich obecna nazwa/kontrakt jest zbyt wąski.

Nie duplikować wzoru multiplier.

Bare-hands stabilization również może użyć Medicine competence do requested potency, ale floor z `045` jest twardy i skill nie może go ominąć.

### 7. Medical tool

V1 narzędzia mają być **bonusem**, nie hard requirementem. Dzięki temu plan nie mnoży kombinacji failure-state.

Jeśli brak odpowiedniej capability, dodać:

```ts
'medical_treatment'
```

Do tool bonusu wykorzystać `Inventory.findWithCapability()` / `hasCapability()` i context support w `evaluateSkillCompetence()`; nie wymagać trzymania narzędzia w ręce, chyba że aktualny item/tool UX konsekwentnie tego wymaga.

V1: jeden bounded tool bonus. Nie tworzyć tierów ani generic equipment bonus framework.

Jeśli repo nie posiada jeszcze sensownego medical-tool itemu, capability i bonus mogą zostać pominięte z implementacji, a plan ma nadal działać z materiałami + bare hands. Nie dodawać sztucznego itemu tylko dla spełnienia planu.

### 8. Busy Action

Leczenie ma być akcją czasową, jeśli current player action context pozwala użyć istniejącego `busy.start()` bez przebudowy targeted-skill API.

Preferowany lifecycle:

```text
query → availability only
execute → busy.start(...)
complete → revalidate target/injury/material
          → resolve treatment
          → apply
          → consume material
          → XP
cancel → no mutation, no item consumption, no XP
```

Nie rezerwować itemu na starcie. Revalidate/consume na completion.

### 9. Atomowość completion

Po completion kolejność ma być logicznie atomowa:

1. sprawdź, że target nadal żyje i jest treatable,
2. ponownie wybierz/zweryfikuj materiał,
3. policz finalny result,
4. zaaplikuj actual HP restore,
5. zmniejsz physical injury o actual restored amount,
6. dopiero po successful effect usuń 1 material,
7. awarduj XP i pokaż feedback.

Zero actual restore nie konsumuje materiału i nie daje XP.

### 10. Medicine XP

Reuse `awardSkillXp()` i istniejącego `SKILL_XP_AWARD`.

Dodać niewielki mapping treatment XP; preferowane rozróżnienie:

- stabilization/minor,
- serious,
- critical.

Nie awardować XP za query, selection, cancel ani powtarzanie treatmentu bez efektu.

### 11. Feedback

Prompt/feedback ma rozróżniać minimum:

```text
[E] Opatrz: <target>
[E] Ustabilizuj: <target>
Medicine — brak obrażeń wymagających leczenia
Medicine — brak odpowiedniego opatrunku; możliwa tylko stabilizacja
```

Nie ujawniać surowego `physicalInjury`.

Jeśli current observation system ogranicza dokładną wiedzę o severity NPC/animal, prompt powinien mówić o dostępnej akcji, nie o liczbowym stanie rany.

## Zakres implementacji

1. Medicine consumer w `targetedSkillAction.ts`.
2. Minimalny self-treatment seam.
3. Treatment target adapter dla NPC/livestock.
4. Player action executor z Busy Action/revalidation.
5. Automatyczny wybór material vs stabilization.
6. Medicine effectiveness reuse.
7. Opcjonalny medical-tool capability/bonus, jeśli istnieje realny item.
8. Medicine XP i feedback.
9. Testy targeted flow.
10. Dokumentacja UI/player systems.

## Non-goals

Nie robić w `046`:

- nowego injury modelu,
- nowych severity thresholds,
- livestock/player injury persistence redesign,
- NPC self-healing redesign,
- autonomous NPC doctor treating others,
- farmer autonomously treating livestock,
- veterinary profession,
- body-part injuries,
- bleeding/fractures/infection,
- manual picker materiału,
- medical-tool quality tiers,
- wild-fauna rescue gameplay.

## Relevant files

- `src/interaction/targetedSkillAction.ts`
- `src/interaction/Interactable.ts`
- interactable creation/query paths dla NPC i livestock
- `src/app/actions/survivalActions.ts` lub najbliższy istniejący player-action owner
- `src/app/actions/actionContext.ts`
- existing Busy Action owner używany przez `PlayerActionContext`
- `src/player/PlayerSkills.ts`
- `src/player/skillEvaluation.ts`
- `src/player/medicinalTreatmentEffectiveness.ts`
- `src/items/Inventory.ts`
- `src/items/itemCatalog.ts`
- `src/items/items.ts` tylko jeśli istniejący realny tool dostaje capability
- `src/ai/NpcAgent.ts` tylko jako target adapter/public health seam, nie decision refactor
- `src/fauna/AnimalAgent.ts` tylko jako target adapter/public treatment seam
- `src/ui-vue/screens/SkillsScreen.vue` — oczekiwane bez hardcoded Medicine

Dla nowych publicznych treatment/query adapterów dodać JSDoc z `@domain` i opisem query-vs-mutation boundary.

## Testy

### Actionability

Po implementacji:

```text
Sneak      visible
Traps      visible
Medicine   visible
Repair     visible
```

`Medicine` visibility wynika z implemented consumer, nie z Vue allowlist.

### Query

- healthy target → brak executable action,
- injured NPC → treatment/stabilization action,
- injured livestock → treatment/stabilization action,
- corpse/dead → unavailable,
- wild animal → unavailable,
- query nie mutuje health/inventory/XP.

### Self

- injured player → self-treatment available,
- healthy player → unavailable/no-effect,
- self używa tego samego treatment executor/resolver co world target.

### Material

- odpowiedni treatment jest wybrany i konsumowany raz po success,
- insufficient `maxSeverity` nie jest używany,
- brak materiału fallbackuje do stabilization, jeśli ma ona efekt,
- cancel nie konsumuje materiału.

### Competence

- high Medicine daje większy bounded requested effect niż low Medicine,
- Survival support zachowuje istniejący bounded contribution,
- tool bonus, jeśli wdrożony, nie omija severity/floor.

### Completion

- target healed/dead/removed w trakcie Busy Action → safe failure/no consumption/no XP,
- material usunięty z inventory przed completion → safe fallback/re-evaluation,
- actual restored = 0 → no item consumption/no XP,
- successful effect → XP dokładnie raz.

## Manual verification

User sprawdza w przeglądarce:

1. Medicine pojawia się w Skills Screen.
2. Ranny player może wykonać self-treatment.
3. Ranny NPC może zostać opatrzony/stabilizowany.
4. Ranny koń/owca/krowa może zostać opatrzony/stabilizowany.
5. Bez materiału treatment zatrzymuje się na floor z `045`.
6. Odpowiedni treatment pozwala przekroczyć floor.
7. Słaby treatment nie działa na zbyt ciężką ranę.
8. Cancel Busy Action niczego nie zużywa.
9. Medicine XP rośnie tylko po realnym skutecznym leczeniu.
10. Skills/Repair/Traps/Sneak nadal działają bez regresji.

AI nie wykonuje browser verification.

## Dokumentacja

Po implementacji zaktualizować:

- `docs/state/player-systems.md`,
- `docs/items/CATALOG.md` jeśli dodano medical capability/tool,
- `docs/state/fauna.md` / `docs/state/npc.md` tylko jeśli publiczny treatment seam wymaga doprecyzowania,
- roadmapę tylko jeśli faza Medicine faktycznie zmieniła status.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
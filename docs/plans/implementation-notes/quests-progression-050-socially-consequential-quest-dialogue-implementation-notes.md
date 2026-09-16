# Implementation notes: quests-progression-050 socially consequential quest dialogue

## Current ownership

- `src/quests/quests.ts` owns the authored/runtime quest contracts. `QuestStageDialogueAction` already carries conscious `playerLine`, optional `npcLine`, `QuestConsequences`, physical resolution requirements, effects, world-knowledge gating and `skipAdvance`.
- `QuestObjective.type === 'talk_to_npc_choice'` is a separate narrow terminal-choice contract. It currently carries `npc`, `outcomeId`, `playerLine`, `npcLine` and resolves through the normal outcome path.
- `QuestManager` owns quest progress plus quest player↔NPC relations. `getRelation()` / `getRelationLevel()` are already live reads; `QuestSocialAvailabilityLookup` supplies reputation/renown; `QuestWorldTimeLookup` supplies deterministic elapsed days/time-of-day.
- `QuestManager.applyConsequences()` is the existing relation/reputation/renown mutation seam. Reuse it for reaction deltas; do not mutate `ReputationManager` or relation storage directly from authored content.
- `materializeAuthoredQuests.ts` is the only normal authored-name → stable `NpcId` conversion seam. Extend `materializeDialogueActions()` and `materializeObjective()` for new reaction relation refs/consequences rather than resolving names at runtime.
- `QuestProgressEntry` is already the additive persisted quest snapshot contract. `QuestRuntimeProgress` in `QuestManager.ts` mirrors its optional fields. Add cooldown persistence to both and thread it through the existing snapshot/state-copy path; do not add a second save registry.

## Existing suppression pattern worth copying

`QuestManager` already implements offer decline suppression as an absolute `offerSuppressedUntilDay` read against `worldTime.getElapsedDays()`. The new quest-topic cooldown should follow the same deterministic pattern:

- absolute world-day deadline;
- no `setTimeout`;
- no per-frame countdown;
- absence means unsuppressed for older saves;
- the current interaction path derives whether suppression is active.

Do **not** reuse `offerSuppressedUntilDay` itself: offer suppression and an active quest's social conversation cooldown have different lifecycle/identity semantics.

## Recommended data shape

Keep the reaction language deliberately small. A useful implementation shape is:

```ts
type QuestDialogueReactionCondition =
  | { type: 'relation'; npc: QuestNpcRef; minimum?: RelationLevel; maximum?: RelationLevel }
  | { type: 'reputation'; dimension: ReputationDimension; minimum?: number; maximum?: number }

type QuestDialogueReaction = {
  when: readonly QuestDialogueReactionCondition[]
  npcLine?: string
  consequences?: QuestConsequences
  cooldown?: { hours: number; line: string }
}
```

Attach `reactions?: readonly QuestDialogueReaction[]` to both `QuestStageDialogueAction` and each `talk_to_npc_choice` choice. Mirror authored variants with `npcName`-based relation references where needed.

Do not introduce callbacks/predicates into definitions. Definitions are data and are rebuilt on boot.

## Matching helper

Prefer one pure helper in `quests.ts` or a small adjacent quest module for range semantics/validation-friendly evaluation inputs, while `QuestManager` supplies live values. If a public helper is added, document it with `@domain quests-progression`.

Recommended semantics:

- reactions checked in declaration order;
- first fully matching reaction wins;
- conditions inside `when` are AND;
- relation `minimum` / `maximum` compare by existing `RelationLevel` order, not ad-hoc numeric copies;
- reputation bounds compare the live numeric dimension;
- no reaction = base behaviour.

Do not infer reactions from NPC personality/role in this plan.

## Selection-time integration

The important correctness point is **selection-time re-read**.

`QuestDialogAction.onSelect` already resolves through `QuestManager` rather than mutating in Vue. Extend the internal stage-action and talk-choice selection paths so they:

1. re-read current quest state/stage/action;
2. confirm the selected NPC/action is still the current actionable one;
3. evaluate reactions from current relation/reputation;
4. apply reaction consequences once;
5. write optional cooldown deadline;
6. continue through the existing base consequences/effects/advance/outcome path.

Do not precompute the matched reaction while constructing `QuestDialogOverride`; relation or reputation may change before the callback fires.

For `talk_to_npc_choice`, the selected `QuestOutcome` remains the canonical terminal result. Reaction consequences are a layer around the spoken choice, not a replacement terminal branch.

## Cooldown representation

Recommended persisted shape inside one quest progress entry:

```ts
dialogueCooldowns?: Record<NpcId, {
  untilDay: number
  stageIndex: number
  lineSource: /* stable authored source identity */
}>
```

The exact source identity may be action/choice + reaction indexes instead of a string. Prefer stable compact authored coordinates over raw copy.

Store enough to project the authored cooldown line after save/load while ensuring a cooldown from an earlier stage does not accidentally suppress a later unrelated stage. Stage index is therefore important unless implementation naturally clears stage-local cooldowns on advance.

If a cooldown-producing choice immediately resolves the quest terminally, persisting the cooldown is unnecessary unless later dialogue for that same still-active quest can observe it. Avoid dead state.

## Dialogue contribution boundary

Cooldown is scoped to the affected **quest context** for one NPC. In `onInteract(npcId)` / contribution arbitration:

- when this quest context is cooling down, return its authored cooldown line and no quest action for that context;
- do not block `QuestManager` contributions from other quests involving the same NPC;
- do not block generic dialogue/trade outside quest overrides;
- do not change NPC runtime behaviour or navigation.

Be careful with multi-quest `QuestDialogTopic` aggregation: a cooling-down quest should still be selectable/readable as a topic if another quest context exists, but resolving that topic should expose informational cooldown copy rather than its actions.

## Journal compatibility

Current journal progress stamps identify `stageIndex` and optional `dialogueActionIndex`; projection later reads current authored copy. A reaction-specific NPC reply cannot be reconstructed from only the action index.

Prefer an additive optional `dialogueReactionIndex` (and, if terminal-choice replies are journaled, enough choice identity) on `QuestJournalEvent`. Projection should fall back to existing base copy when absent, preserving old saves.

Do not persist raw `npcLine` strings.

## Validation/materialization

Extend `validateStageDialogueActions()` and `validateTalkToNpcChoiceObjective()` through a shared reaction validator to avoid duplicated range rules.

Validate:

- non-empty `when`;
- at least one bound on a condition if that makes the chosen shape meaningful;
- min/max ordering;
- finite reputation bounds within the existing `-100..100` contract;
- finite positive cooldown hours;
- non-blank cooldown line / reaction `npcLine` when present.

`materializeAuthoredQuests.ts` currently explicitly maps dialogue action fields. New reaction fields will be dropped unless added there. This is a high-risk omission point.

## Hard dialogue-authoring contract

This section is normative for every new `playerLine`, `npcLine`, reaction line and cooldown line added by this plan.

### What dialogue must sound like

- NPC speaks about the **thing that just happened**, not about abstract game systems.
- Prefer concrete nouns from the scene: `jeleń`, `przesyłka`, `siekiera`, `kronika`, `kamienie`, `straż`.
- Prefer implication/subtext over naming emotion. Show distrust, disappointment or relief through the sentence itself.
- Usually 1 short sentence; 2 only when a second fact is genuinely needed.
- A high-relation line must differ in **meaning/tone**, not merely intensity.
- A reaction line must still make sense if the player never sees the underlying `relation`/`reputation` threshold.

### Forbidden default-RPG phrasing

Do not author generic lines such as:

```text
Zapamiętam to.
Nie spodziewałem się tego po tobie.
Jestem rozczarowany.
Udowodniłeś swoją wartość.
Twoje czyny mają konsekwencje.
Dokonałeś wyboru.
Wiedziałem, że mogę ci zaufać.
Straciłem do ciebie zaufanie.
```

These may be semantically true, but they expose the social system instead of writing a character response.

### Concrete replacement pattern

Bad:

```text
Nie spodziewałem się tego po tobie. Jestem rozczarowany.
```

Better:

```text
Tobie akurat dałem słowo bez świadków. Więcej tego nie zrobię.
```

Bad:

```text
Wiedziałem, że mogę ci zaufać.
```

Better:

```text
Dobrze. Gdy powiedziałeś, że wrócisz z odpowiedzią, uwierzyłem ci.
```

Bad:

```text
Zapamiętam to.
```

Better:

```text
Następnym razem nie poproszę cię o przysługę.
```

Only use a concrete promise like the last line when the authored consequence/cooldown actually supports it. Do not promise systemic behaviour the game does not implement.

### Variant quality test

After writing reaction variants, read them **without looking at the conditions**. If they sound like:

```text
neutral tier
friendly tier
trusted tier
```

with the same sentence merely stronger/weaker, rewrite them.

Good variants should reveal different interpretations of the same act:

```text
low relation  → ostrożność / brak kredytu zaufania
high relation → osobiste poczucie zawodu albo większa bezpośredniość
```

not:

```text
low relation  → Dziękuję.
high relation → Bardzo ci dziękuję.
```

### Player-line contract

Player lines must be choices a person could plausibly say aloud. Avoid outcome labels disguised as dialogue.

Bad:

```text
Wybieram rozwiązanie pojednawcze.
Przekazuję sprawę straży.
Decyduję się wesprzeć Annę.
```

Better:

```text
Oddam to straży. Nie chcę zgadywać, co jest w środku.
Anna dostanie drewno. Gospodarstwo nie może czekać.
```

The exact copy must still respect current quest knowledge.

## First-wave content locations

### `src/quests/quests.ts`

Contains all three classic candidates:

- `zwiadowca`: current lie action already applies `integrity: -2`; preserve that existing consequence and add relation-sensitive reaction copy/additional relation delta rather than replacing it.
- `zaginiona-przesylka`: `talk_to_npc_choice` → `returned_sealed` / `turned_over_to_guard`; keep both outcome ids/rewards/consequences.
- `sporne-drewno`: `talk_to_npc_choice` → `support_anna` / `support_piotr`; keep branch/follow-up semantics intact.

Suggested tone anchors, not mandatory exact strings:

```text
Zwiadowca / Piotr, low relation after doubtful claim:
„Nie widziałem cię na tej grani. Kamienie pokaż — wtedy pogadamy.”

Zwiadowca / Piotr, trusted relation after same claim:
„Dobra. Biorę cię za słowo. Nie każ mi żałować.”

Zaginiona przesyłka / Kasia, player chooses guard despite good relation:
„Mogłeś najpierw przyjść do mnie. Teraz już nic z tym nie zrobię.”

Zaginiona przesyłka / Marek, player hands parcel to guard with solid integrity:
„Dobrze. Otworzymy ją przy świadkach i będzie jasne, co dalej.”

Sporne drewno / Anna, player sides with Piotr despite good relation:
„Rozumiem. Tylko nie mów mi potem, że gospodarstwo mogło poczekać.”

Sporne drewno / Piotr, player sides with him at weak relation:
„Dobrze. Drewno się przyda. Resztę zostawmy na później.”
```

Do not force these strings if post-recon context makes a line inaccurate. Preserve their quality standard: concrete scene reference, no system-language, no generic RPG emotion label.

### `src/quests/lostTreasureChroniclesElder.ts`

`story:lost-treasure-chronicles:elder:dispute` ends with `talk_to_npc_choice` (`support_elder` / `reconcile`). The story deliberately has no separate trust meter; use existing elder relation and quest outcomes only.

Tone anchors:

```text
Kazimierz, low relation, player tells him to let it go:
„Łatwo ci mówić. To nie twoja rzecz zniknęła.”

Kazimierz, trusted relation, same advice:
„Od kogoś obcego bym tego nie słuchał. Od ciebie… jeszcze przemyślę.”
```

The trusted version may soften the social consequence, but it must not rewrite the canonical `reconcile` outcome.

### `src/quests/lostTreasureChronicleSearch.ts`

Current search flow:

- elder gives story offer;
- first stage may meet archaeologist;
- archaeologist starts ruins world-knowledge research;
- investigate stage has an optional `skipAdvance` dialogue action that reveals the resolved ruins clue;
- completion raises elder + archaeologist relation.

Add social dialogue without changing `WorldKnowledgeResearch`, cemetery permission, hidden-find/container truth, or encoded chronicle ownership. The optional investigate-stage action is the least invasive insertion point if suitable authored copy can carry the social choice; otherwise add another optional archaeologist stage action beside it.

Tone anchors for archaeologist interaction:

```text
Player, direct but reasonable:
„Jeśli mam ryzykować w ruinach, potrzebuję wszystkiego, co masz.”

Archaeologist, high competence/trust response:
„Dlatego cię tam wysyłam. Mam jeden trop więcej — posłuchaj uważnie.”

Archaeologist, weak standing response:
„Najpierw sprawdź to, co już dostałeś. Nie będę zgadywał za ciebie.”
```

Do not create fake funding promises, payment negotiation, academic titles or discoveries not represented by current state.

## Relevant tests

- `src/quests/QuestManager.test.ts` — primary runtime behaviour, consequences, stale callbacks, dialogue actions, save/restore.
- `src/quests/materializeAuthoredQuests.test.ts` — authored-name materialization and malformed identity cases.
- Lost Treasure Chronicles tests adjacent to `lostTreasureChroniclesElder.ts` / `lostTreasureChronicleSearch.ts` — preserve story bindings/outcomes.
- Existing quest-definition validation tests should gain malformed reaction cases.

Test cooldown at an exact boundary (`elapsedDays === untilDay`) to make expiry semantics explicit.

## Guardrails

- Do not build a general condition-expression engine.
- Do not add player/NPC skill checks or randomness.
- Do not create `NpcMood`, `anger`, or social-memory state in `NpcStateRegistry` for this plan.
- Do not duplicate settlement reputation inside quest progress.
- Do not make Vue inspect social conditions.
- Do not let a quest cooldown suppress trading or another quest's actionable target.
- Do not change canonical outcomes merely to vary tone.
- Do not write reaction copy that explicitly names relation tiers, reputation dimensions, hidden values or game-state abstractions.
- Do not use generic fantasy-RPG filler where a concrete scene reference is available.
- Do not run browser verification; User performs browser verification.

## Suggested implementation order

1. Add runtime/authored reaction types + validation.
2. Extend materialization.
3. Add pure/live matching and stage-action runtime support.
4. Add talk-choice runtime support.
5. Add additive cooldown persistence + multi-context suppression behaviour.
6. Extend journal stamp/projection only as required to reproduce heard reaction lines.
7. Migrate `zwiadowca` first and lock the contract with tests.
8. Migrate `zaginiona-przesylka`, `sporne-drewno`, elder dispute, archaeologist.
9. Update current-state docs.

The first pilot should be `zwiadowca`: it already has explicit alternate dialogue actions and an integrity consequence, so it exercises reaction matching with the least story-flow risk before terminal choices are touched.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
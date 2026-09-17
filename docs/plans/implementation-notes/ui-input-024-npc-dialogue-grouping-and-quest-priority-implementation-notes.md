# Implementation notes: NPC dialogue grouping and quest priority

**Reviewed:** 2026-09-17  
**Plan:** `ui-input-024-npc-dialogue-grouping-and-quest-priority.md`  
**Codebase baseline:** `main`

## Current seams to reuse

### `src/ui-vue/NpcDialogueMenu.vue`

The component already owns presentation/navigation state for NPC dialogue. Keep the new grouping here rather than introducing a separate dialogue router.

Existing state/handlers that should remain authoritative:

- `topic: Ref<Topic | null>` — selected response/action view;
- `helpDrilled` — distinguishes top-level quest picker from one selected quest context;
- `selectTopic()` — enters generic topics and resolves quest help only when `help` is explicitly selected;
- `selectHelpAction()` / `selectHelpTopic()` — existing live quest action/topic execution;
- `helpBack()` — existing quest drill-up behaviour;
- `backToTopics()` — currently resets to root;
- direct handlers `openTrade()`, `giveItem()`, `requestFood()`, `requestWater()`, `askAboutArea()`, `openProposeJoin()`.

Add only one presentation-level group state, e.g. `DialogueGroup | null`. Do not replace `topic` or `helpDrilled` with a generic tree structure.

Recommended invariant:

```text
group === null && topic === null  -> root
group !== null && topic === null  -> one group list
topic !== null                    -> existing response/action view
```

When a topic is opened from a group, preserve the group so `Wróć` can return to it. When opening a root quest shortcut directly, clear/set navigation origin explicitly so back returns to root rather than accidentally to the previous group.

### `src/ui-vue/store.ts`

`openNpcDialogueMenu()` currently deliberately does **not** call `QuestManager.onInteract()` on open. It sets:

```ts
state.helpResult = null
state.resolveQuestHelp = () => questManager.onInteract(npc.id)
```

and `resolveNpcDialogueHelp()` calls that resolver only after the player selects the help topic.

Preserve this separation. It is the key guarantee from quests-progression-014 that merely opening an NPC menu does not auto-enter quest dialogue.

`resolveNpcDialogueOpenTopic()` currently auto-opens only:

- `payment`,
- `joinProposal`.

Do not add quest-driven auto-opening here.

Add the read-only quest preview through the same state seam, for example:

```ts
questPreview: readonly QuestDialoguePreviewEntry[]
resolveQuestPreview: (() => readonly QuestDialoguePreviewEntry[]) | null
```

Exact names are flexible. Prefer either:

1. compute the preview once in `openNpcDialogueMenu()` if the preview entries' `resolve()` callbacks are live; or
2. keep a resolver callback if group/root visibility must be refreshed after quest actions while the menu stays open.

Because quest actions can mutate quest state without closing the NPC menu, a resolver callback is safer and avoids stale `kind`/visibility. Vue/store should refresh preview after quest action selection/accept/decline where the menu remains open.

Do not store `QuestDef`, `QuestProgressEntry`, stage indices, objective kinds or raw quest states in `NpcDialogueMenuState`.

## QuestManager architecture

### Existing public presentation contracts

`QuestManager.ts` already exposes:

- `QuestDialogAction` — conscious player action; `onSelect()` re-reads live quest state;
- `QuestDialogTopic` — presentation-only navigation entry with `label` and live `resolve()`;
- `QuestDialogOverride` — rendered quest dialogue payload containing line/offer/actions/topics.

This is the correct layer to extend. Vue should continue to render presentation contracts only.

### Important mutation boundary

`onInteract(npcId)` calls offer admission before building dialogue contributions. `admitOffersForGiver(npcId)` changes selected `not_offered` quests into `offered`.

Therefore the root menu preview must **not** be implemented as:

```ts
questManager.onInteract(npcId)
```

followed by inspection of the returned override. Doing so would turn menu rendering into a mutation path and would also lose per-quest classification once multiple contexts have been merged.

### Reuse the current arbitration logic, not `labelMarker()` output

`labelMarker(npcId)` already knows the global priority semantics (`?`, `✓`, `!`, `…`), but it reduces all concurrent quest contexts to one glyph. It is useful as a consistency oracle in tests, not as the data source for root shortcuts.

The new API needs one entry per relevant quest context.

Recommended public contract:

```ts
export type QuestDialoguePreviewKind =
  | 'report'
  | 'required-action'
  | 'active'
  | 'offer'

export type QuestDialoguePreviewEntry = {
  questId: QuestId
  title: string
  kind: QuestDialoguePreviewKind
  resolve: () => QuestDialogOverride
}
```

`questId` is acceptable here for stable Vue keys and tests; Vue must not interpret it. `title` comes from `QuestDef.title`. `resolve()` should route through the same per-def live resolver used by `QuestDialogTopic` rather than capture an already-built override.

If exposing `questId` to UI is considered unnecessary, replace it with an opaque `key`; do not key by title because titles are not unique.

### Best refactor shape

Do not create a second implementation of quest-context detection. Extract the smallest private helper from `onInteract()` that returns per-definition contributions before final aggregation, for example conceptually:

```ts
type NpcQuestDialogueContext = {
  def: QuestDef
  kind: QuestDialoguePreviewKind
  resolve: () => QuestDialogOverride
}
```

The helper should centralize the conditions that currently decide whether an NPC contributes:

- ready-to-report / successful turn-in;
- actionable gather hand-in;
- unfinished `talk_to_npc` / `talk_to_npc_choice` targeting this NPC;
- stage `dialogueActions` targeting this NPC and currently gated-in;
- tellable `receive_world_knowledge` / knowledge-dependent dialogue;
- active giver reminder / generic abandon context;
- exposed/selectable offer context.

`onInteract()` can then aggregate those contexts into the existing `QuestDialogOverride` behaviour, while the preview API maps the same contexts to semantic kinds.

Do not weaken existing offer admission rules: normal interaction may still call `admitOffersForGiver()` first. The read-only preview must use candidate/exposure logic without changing quest state. There is already a read-only `selectableOfferIds(npcId)` seam used by `admitOffersForGiver()`; reuse that selection rather than reimplementing offer ranking/capacity.

### Side-effect traps in dialogue construction

Be careful with helper extraction: not every existing dialogue-building helper is guaranteed read-only.

Examples in current code include world-knowledge paths that may:

- call `maybeApplyUnavailableKnowledge()`;
- launch async knowledge resolution;
- stamp journal entries.

The preview path must not invoke such mutation/side-effect helpers merely to decide visibility. Classification should use read-only predicates (`isKnowledgeTellable`, current progress, current stage/objective data) and defer actual side effects to `resolve()` / normal interaction.

This is the main architectural risk in the plan.

### Classification semantics

Use semantic meaning, not lifecycle alone:

- `report`: interaction can currently hand in/report/complete progress (`✓` semantics), including an inventory-backed gather hand-in when requirements are currently satisfied;
- `required-action`: NPC has a quest-progressing talk/choice/stage dialogue/world-knowledge action available now (`?` semantics);
- `offer`: selected/exposed new offer for this giver (`!` semantics); it stays under `Może w czymś ci pomóc?`;
- `active`: informational/reminder context, including generic abandon when no stronger quest-progressing action is currently available (`…` semantics).

Do not derive `report` simply from `state === 'ready_to_report'`: marker logic already supports actionable hand-in while formally still `active`.

Likewise, do not classify every active target as `required-action`; quest-topic cooldowns and authored gates can make a nominal target non-actionable.

## Root/group rendering details

Recommended root order:

1. preview entries where `kind === 'report'`;
2. preview entries where `kind === 'required-action'`;
3. `Sprawy i pomoc` when it has at least one visible child;
4. direct `Handel` when `state.canTrade`;
5. `Rozmowa` when it has at least one visible child;
6. `Działania` when it has at least one visible child;
7. goodbye.

Keep ordering among multiple entries of the same quest kind identical to the order returned by `QuestManager`; do not sort by title in Vue.

For shortcuts, reuse preview `resolve()` directly. The resulting override should enter the same rendering path as a selected quest topic, rather than creating a separate shortcut-specific quest UI.

Suggested labels:

```text
✓ <quest title>
? <quest title>
```

Avoid fabricating verbs such as `Zgłoś:` unless the quest contract can truthfully distinguish report vs gather hand-in vs other ready action. The semantic prefix plus quest title is safer and keeps authored phrasing inside the resolved override/actions.

### `Sprawy i pomoc`

Keep `Może w czymś ci pomóc?` wired to `resolveNpcDialogueHelp()` so offer admission still happens at deliberate player selection time.

`Aktywne sprawy` should be shown only if preview contains at least one `active` context not already surfaced as a root shortcut. It should present those preview entries as a quest-context picker and call their live `resolve()`.

Do not reuse the whole `helpResult.topics` list for `Aktywne sprawy`: that list may also contain offers or actionable contexts and is an aggregation result rather than the desired filtered preview.

### Empty groups

Compute group visibility from the same booleans/callback availability already used by current buttons. Do not display a category that would immediately contain only `Wróć`.

Expected examples:

- `Rozmowa` is generally non-empty because self/activity/village are generic, but `aboutVillage` still depends on settlement presence;
- `Działania` contains `Daj przedmiot` and expedition proposal in current implementation, so normally exists;
- `Sprawy i pomoc` contains food/water plus quest help, but guard-only reward remains conditional.

Do not move `payment` or `joinProposal` into groups; they retain their existing automatic special-case flow.

## Back-navigation

Current `helpBack()` has special semantics:

```text
selected quest topic -> re-resolve top-level quest payload
root help payload     -> leave help
```

With groups, change only the final destination of leaving help when help was opened from `Sprawy i pomoc`: return to that group instead of root.

A small `topicOriginGroup: DialogueGroup | null` or equivalent is preferable to inferring origin from `topic` values.

Reset navigation origin when:

- NPC menu opens/closes;
- switching directly to a root actionable quest shortcut;
- entering an automatic `payment` / `joinProposal` topic;
- returning all the way to root.

## Tests to add/extend

### `src/quests/QuestManager.test.ts`

Add focused preview tests next to existing `onInteract()` / marker tests, not a separate integration harness.

Minimum coverage:

1. `ready_to_report` giver returns one `report` preview entry and `labelMarker()` is `✓` when no stronger context exists.
2. active gather quest with sufficient inventory but not yet formally `ready_to_report` is still `report`.
3. active `talk_to_npc` target returns `required-action` and marker `?`.
4. gated/cooldown talk context does not become `required-action`.
5. ordinary active giver reminder returns `active`.
6. a selected new giver offer returns `offer` in preview without transitioning `not_offered -> offered`.
7. calling preview repeatedly leaves serialized/progress state unchanged.
8. multiple contexts for the same NPC return separate entries in deterministic existing arbitration order.
9. each entry's `resolve()` re-reads state: mutate/advance one context after obtaining preview, then resolving must return current dialogue rather than the original payload.
10. preview construction does not append quest journal entries or start/advance world-knowledge state.

The existing tests around concurrent contexts, topic-scoped abandon and marker priority are useful fixtures; extend those patterns rather than rebuilding quest definitions from scratch when possible.

### `src/ui-vue/npcDialogueOpen.test.ts`

Preserve existing assertions that menu opening leaves `helpResult === null` and `resolveNpcDialogueOpenTopic()` does not return `help`.

Add tests around the store seam if practical:

- preview can be read/refreshed without setting `helpResult`;
- opening with a quest preview does not mutate quest state;
- payment/join proposal still wins as the initial automatic topic.

Do not introduce a browser/Vue mounting dependency just to test Tailwind classes or nesting. The User owns browser verification.

## Files expected to change

Primary:

- `src/quests/QuestManager.ts`
- `src/quests/QuestManager.test.ts`
- `src/ui-vue/store.ts`
- `src/ui-vue/npcDialogueOpen.test.ts`
- `src/ui-vue/NpcDialogueMenu.vue`

Likely no changes:

- `src/ai/dialogueTemplates.ts` — wording sources remain unchanged;
- `src/app/createApp.ts` — `openNpcDialogueMenu(..., questManager, ...)` already receives the manager, so the store can wire preview without a new composition-root dependency;
- persistence / `SaveData` — preview/group state is transient presentation only;
- quest definitions — no authored content changes needed.

## Suggested implementation order

1. Add/export the preview types in `QuestManager.ts`.
2. Extract/refactor the shared read-only context classification carefully, keeping mutation-only work behind normal interaction/resolve paths.
3. Add QuestManager unit tests before UI wiring; this protects against accidental quest mutations.
4. Add the preview resolver/state seam in `store.ts` and reset it with the existing NPC dialogue lifecycle.
5. Add one-level group/origin state to `NpcDialogueMenu.vue`.
6. Move current flat buttons into groups without changing their handlers.
7. Add root actionable shortcuts and `Aktywne sprawy` using preview entries.
8. Adjust store/open tests and run focused quest/UI tests, typecheck and lint.

## Guardrails

- `QuestManager` remains authoritative for lifecycle, availability, arbitration and semantic classification.
- Vue must never infer quest meaning from `QuestState`, objective types or stage indices.
- Preview is read-only: no offer admission, quest progress, journal stamping, reward/consequence mutation or async world-knowledge launch.
- `resolve()` is live and is the point where normal quest dialogue behaviour is re-read.
- Do not expose `QuestDef` to Vue.
- Do not add persistence for groups/preview.
- Do not create a generic recursive dialogue tree/router.
- Keep `QuestDialogTopic` and `topicScoped` abandon behaviour intact.
- Keep `resolveNpcDialogueOpenTopic()` limited to its existing exceptional automatic flows.
- Add JSDoc with `@domain quests-progression` to the new public preview contract/API, and `@domain ui-input` only for any new reusable UI presentation helper that warrants export.

## Verification reminder

Automated verification belongs to the implementation agent. Browser/gameplay verification belongs to the User; do not run browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Plan: Socially consequential quest dialogue

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships`
**Tags:** `dialogue` `relation` `reputation` `consequences` `cooldown`
**Roadmap:** -
**Model:** Opus, Sonnet

## Goal

Make selected authored quest dialogue react to the player's existing social standing instead of resolving every player line identically.

A socially risky line may be tolerated by a trusted NPC, damage an already-poor relationship, produce a different NPC reply, or temporarily suppress that quest conversation. The mechanism must remain deterministic and reuse existing quest relation, settlement reputation/renown, world-time, consequence and persistence contracts.

This is not a general dialogue-tree engine. It is a narrow extension of the existing conscious quest-action path.

## First implementation wave

Use the reusable mechanism immediately in the five previously identified high-value conversations:

1. `zwiadowca` / Piotr — the existing "Tak, widziałem jelenia" / "Nie widziałem jelenia" exchange becomes the smallest pilot for relation-sensitive reactions around credibility.
2. `zaginiona-przesylka` / Kasia + Marek — the final handover choice can additionally reflect the current relationship with the NPC receiving the declaration.
3. `sporne-drewno` / Anna + Piotr — choosing a side should be able to produce sharper or more forgiving reactions depending on the existing relationship, while keeping the authored terminal outcome authoritative.
4. Lost Treasure Chronicles elder dispute / Kazimierz + counterpart — the reconciliation/support declaration becomes relationship-sensitive without changing the story's two canonical outcomes.
5. Lost Treasure Chronicles archaeologist — add at least one socially meaningful optional dialogue action whose response/consequence can depend on existing relation/reputation while preserving the current investigation/world-knowledge flow.

Exact authored copy and tuning belong in implementation, but every migrated conversation must keep its current quest reachable and must not silently change its canonical objective/outcome semantics.

## Existing mechanisms to extend

### Quest dialogue contracts

`src/quests/quests.ts` already owns:

- `QuestStageDialogueAction` with explicit `playerLine`, `npcLine`, `consequences`, effects and gating;
- `talk_to_npc_choice` with explicit player/NPC lines and terminal outcome ids;
- `QuestConsequences` for player↔NPC relation plus settlement reputation/renown;
- `RelationLevel` / `RELATION_LEVEL_THRESHOLDS`;
- additive persisted `QuestProgressEntry` fields.

Extend these contracts instead of introducing a second dialogue scripting model.

### Runtime evaluation

`src/quests/QuestManager.ts` already owns live player↔NPC relation, reads settlement reputation through `QuestSocialAvailabilityLookup`, has deterministic world-time through `QuestWorldTimeLookup`, applies `QuestConsequences`, and resolves dialogue actions from current live state.

Reaction selection belongs here and must be re-evaluated when the player actually selects the action, not frozen when the menu opens.

### Authored name materialization

`src/quests/materializeAuthoredQuests.ts` already converts authored NPC names inside dialogue actions and consequences to stable `NpcId`s. Any new authored relation condition/reaction consequence that refers to an NPC must pass through the same materialization path.

## Proposed contract

Add one small reusable reaction contract shared by `QuestStageDialogueAction` and `talk_to_npc_choice` choices.

Conceptually:

```ts
type QuestDialogueReactionCondition =
  | { type: 'relation'; npc: QuestNpcRef; minimum?: RelationLevel; maximum?: RelationLevel }
  | { type: 'reputation'; dimension: ReputationDimension; minimum?: number; maximum?: number }

type QuestDialogueReaction = {
  when: readonly QuestDialogueReactionCondition[]
  npcLine?: string
  consequences?: QuestConsequences
  cooldown?: {
    hours: number
    line: string
  }
}
```

Names are illustrative; implementation may adjust them if existing naming conventions suggest a clearer shape.

Rules:

- reactions are authored and ordered; **first matching reaction wins**;
- conditions inside one reaction are ANDed;
- no matching reaction means current behaviour: base `npcLine` / base `consequences` only;
- reaction consequences are additional to the base action/choice and, for `talk_to_npc_choice`, additional to the selected terminal outcome consequences;
- relation/reputation reads are live at selection time;
- bounds are inclusive and validated; missing min/max means unbounded in that direction;
- do not add arbitrary boolean-expression nesting, scripting callbacks, weights or random rolls.

## Quest-topic cooldown

V1 cooldown is **quest-context scoped**, not a global NPC mute/anger system.

When a matched reaction authors a cooldown:

- persist an absolute `untilDay` derived from `QuestWorldTimeLookup.getElapsedDays()`;
- key it by the quest and NPC identity already represented by the owning `QuestProgressEntry` plus stable `NpcId`;
- while active, the affected quest contribution for that NPC exposes the authored cooldown line but no actionable controls from that quest context;
- unrelated NPC functionality (trade, other quests, generic dialogue) must remain available;
- expiry is derived from world time with no timers/polling;
- save/load and `WorldBundle` rebuild preserve it through the existing quest snapshot path.

This deliberately avoids inventing a generic NPC anger/memory store. A future NPC-memory system may later consume broader social incidents, but this plan should not pre-empt that ownership.

## Validation

Extend `validateQuestDefinitions()` for the new authored contract:

- each reaction needs at least one condition;
- `minimum <= maximum` when both are provided;
- relation tiers must be known `RelationLevel`s;
- reputation bounds must stay within the existing reputation range;
- cooldown hours must be finite and `> 0`;
- cooldown line must be non-empty;
- authored NPC references must resolve to stable ids through materialization.

Do not silently clamp invalid authored values.

## Runtime behaviour

For both stage dialogue actions and `talk_to_npc_choice`:

1. re-read current quest state when `onSelect` executes;
2. ensure the action/choice is still valid for the current stage/NPC;
3. evaluate authored reactions against live relation/reputation;
4. apply the selected reaction's additional consequences at most once;
5. establish an optional world-time cooldown;
6. continue through the existing stage advance / terminal outcome path;
7. return the matched reaction's NPC line when provided, otherwise the existing base line.

Existing exact-once terminal outcome semantics remain authoritative.

## Persistence

Add an optional, additive field to `QuestProgressEntry` for quest-topic dialogue cooldowns. Older saves treat absence as no cooldown.

Do not persist:

- reaction evaluation results when no cooldown is created;
- copied dialogue text;
- derived relation/reputation tiers;
- wall-clock timestamps.

The current definition remains the source of authored copy after load, consistent with quest journal projection.

## Journal

When a reaction overrides the NPC reply, Quest Log history must reproduce the line the player actually heard rather than projecting a now-ambiguous base `dialogueActionIndex` alone.

Prefer extending the existing compact journal stamp with stable authored reaction identity/index rather than persisting raw dialogue text. Older journal events continue to project the base line.

If this proves unnecessarily invasive for terminal `talk_to_npc_choice`, keep terminal result journaling unchanged and only add reaction identity where an NPC reply is already journaled. Do not store full strings as a shortcut.

## Content migration

### `zwiadowca`

Keep the current integrity consequence for claiming to have seen the stag when the world objective was not completed. Add a relation-sensitive NPC reaction so low relation makes the lie socially costlier while friendly/trusted standing can produce a less hostile response. Honest admission must remain a safe path.

### `zaginiona-przesylka`

Keep `returned_sealed` and `turned_over_to_guard` as the canonical outcomes. Add reaction copy/consequences to the declaration made to Kasia or Marek; do not create extra terminal outcomes only to express tone.

### `sporne-drewno`

Keep `support_anna` / `support_piotr` and their existing relation/reputation consequences. Layer reaction copy or a small additional relation consequence when the current relationship makes the declaration especially conciliatory or insulting. Avoid making either branch mechanically impossible.

### Elder dispute

Keep `support_elder` / `reconcile`. The elder may accept direct criticism differently at higher relation than at stranger/acquainted standing. Do not add a separate story trust meter.

### Archaeologist

Use the current `lostTreasureChronicleSearch.ts` stages and world-knowledge flow. Add an optional social action rather than changing the ownership of the chronicle, ruins research or cemetery access. Reputation/relationship may alter the reply and consequence, but investigation must remain deterministic and completable.

## UI

No new dialogue UI framework is planned.

`QuestDialogAction` remains the presentation-neutral selectable action consumed by the existing NPC dialogue UI. Cooldown should surface as ordinary quest dialogue text with actions absent; Vue must not interpret relation tiers, reputation thresholds or reaction ids.

Only touch UI types/components if the existing payload cannot represent the cooldown informational state; prefer keeping all interpretation in `QuestManager`.

## Tests

Add focused tests in the existing quest test suites for:

- first matching reaction wins;
- relation min/max and reputation min/max matching;
- no-match fallback preserves current behaviour;
- reaction consequences apply exactly once;
- terminal outcome consequences still apply exactly once after a reaction;
- stale `onSelect` re-checks live state/social values;
- cooldown suppresses only the affected quest context until the exact world-time boundary;
- cooldown survives snapshot/restore;
- unrelated quest context for the same NPC remains usable;
- journal projects the actually selected reaction reply where applicable;
- authored materialization resolves NPC references inside reaction conditions/consequences;
- validation rejects malformed ranges/cooldowns;
- all five migrated conversations remain reachable through their previous canonical outcomes.

Prefer extending `src/quests/QuestManager.test.ts`, `src/quests/materializeAuthoredQuests.test.ts`, and the existing Lost Treasure Chronicles tests rather than creating broad end-to-end harnesses.

## Non-goals

- General branching dialogue trees.
- LLM-generated dialogue or decisions.
- Global NPC mood/anger simulation.
- Generic NPC social-memory storage.
- Trait/personality-based response scoring in this plan.
- Speech checks, random persuasion rolls or hidden dice.
- New morality/alignment meters.
- Blocking trade or unrelated NPC interactions during a quest-topic cooldown.
- Reworking the five quests' world objectives or canonical terminal outcomes.

## Verification

Automated:

- targeted quest/materialization/Lost Treasure tests;
- `pnpm test` for affected suites or the repository's current equivalent;
- `pnpm typecheck`;
- `pnpm build` if required by current repository workflow.

Manual browser verification is performed by the User, not the AI agent. Verify in browser that each migrated conversation presents understandable choices/replies, social consequences are visible through existing relation/reputation surfaces, cooldown copy is clear, and unrelated NPC actions remain available.

## Documentation

After implementation:

- update `docs/state/quests.md` with the implemented reaction/cooldown contract and persistence field;
- update `docs/state/npc.md` only if the integration boundary materially changes;
- keep `docs/vision/quests.md` as direction rather than implementation truth;
- add JSDoc with `@domain quests-progression` to important new public/architectural reaction helpers or contracts where it improves preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
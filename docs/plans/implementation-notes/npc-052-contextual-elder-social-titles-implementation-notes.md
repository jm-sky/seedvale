# Implementation Notes: Contextual Elder Social Titles

**Reviewed:** 2026-09-18
**Plan:** `npc-052-contextual-elder-social-titles.md`

## Review conclusion

Implement this as a **pure presentation resolver**, not by changing `NpcAgent.name` or `NpcAgent.displayName`.

The safest first consumer is the NPC dialogue header. Existing canonical/display identity already has many consumers, including CSS2D labels, Villagers UI, inspector/debug output, dialogue templates and quest-authored presentation. Replacing `NpcAgent.displayName` globally would unnecessarily widen the change and increase regression risk.

Recommended ownership:

```text
NpcAgent canonical fields
  age
  gender
  personality
  traits
  displayName
+ QuestManager.getRelationLevel(npc.id)
↓
pure elder social-title resolver
↓
contextual dialogue heading only (V1)
```

No persistence and no quest identity change are needed.

## 1. Existing canonical/display identity

### `src/ai/NpcAgent.ts`

Current fields:

- `name` — first name,
- `displayName` — currently `first + lastName` when surname exists,
- `id` — stable authoritative identity for quests/relations,
- `gender`,
- `traits`,
- `personality`,
- `age`.

Constructor currently builds:

```ts
this.name = character.name
this.displayName = character.lastName
  ? `${character.name} ${character.lastName}`
  : character.name
```

and also passes `displayName` into the existing CSS2D status-label controller.

**Do not change this contract in npc-052.**

In particular, do not redefine `NpcAgent.displayName` to include an elder title. It is already the ordinary full-name presentation value and is consumed outside social dialogue contexts.

## 2. Elder classification

Use:

```ts
src/settlement/npcPhysicalProfile.ts::lifeStageForAge()
```

Candidate stages:

- `elderly`,
- `veryElderly`.

Do not duplicate `age >= 65`.

This keeps npc-052 aligned with settlements-npcs-045 and the existing physical/lifecycle vocabulary.

## 3. Personality source

### `src/ai/dialogue.ts`

`BigFivePersonality` is the continuous OCEAN source of truth:

- openness,
- conscientiousness,
- extraversion,
- agreeableness,
- neuroticism.

`nearestArchetype()` already exists, but it is explicitly a lossy derived bucket for dialogue-line selection.

For npc-052, prefer the continuous Big Five fields for the small title decision if they provide enough signal. Do not persist a title/personality class.

Avoid inventing a second personality taxonomy.

## 4. Player↔NPC relation source

### `src/quests/QuestManager.ts`

The existing social relationship owner exposes:

```ts
getRelation(npcId)
getRelationLevel(npcId)
```

with coarse levels:

- `stranger`,
- `acquainted`,
- `friendly`,
- `trusted`.

This is the correct player-context input for a title shown to the player.

Do not use:

- `FamilyRelation` as player familiarity,
- NPC↔NPC relationship state,
- settlement reputation as a substitute for direct familiarity,
- a new elder-familiarity store.

The dialogue-opening path already receives a live `QuestManager`, so no new global resolver is required.

## 5. Recommended resolver

Add a small pure module under `src/ai/`, for example:

```text
src/ai/npcSocialTitle.ts
```

Suggested input shape:

```ts
type NpcSocialTitleInput = {
  displayName: string
  age: number
  gender: NpcGender
  personality: BigFivePersonality
  traits: readonly Trait[]
  relationLevel: RelationLevel
}
```

and one presentation function, semantically:

```ts
elderSocialDisplayName(input): string
```

Naming is not contractual.

Requirements:

- non-elder → return canonical `displayName` unchanged,
- elder → choose one title deterministically from existing state,
- never mutate inputs,
- no `Math.random()`,
- no persistence,
- no NPC id/name parsing.

Give the exported resolver JSDoc with `@domain npc`.

## 6. Title vocabulary and safe semantics

V1 should stay deliberately small.

Gender-aware forms:

```text
formal:
male   → Pan <first/full name>
female → Pani <first/full name>

familiar:
male   → Dziadek <first name>
female → Babcia <first name>

rough/informal:
male   → Stary <first name>
female → Stara <first name>
```

The exact inclusion of surname should be decided once in the resolver. Recommended V1:

- `Pan/Pani` + canonical `displayName` (full name),
- `Dziadek/Babcia` + first name,
- `Stary/Stara` + first name.

Therefore the resolver should receive both `name` and `displayName`, or equivalent canonical parts, rather than attempting to split the formatted display string.

## 7. Deterministic selection rule

Keep the rule understandable and testable; do not create weighted random selection.

Recommended precedence:

1. non-elder → canonical display name,
2. `stranger | acquainted` → default formal `Pan/Pani`,
3. `friendly | trusted`:
   - high agreeableness and/or `sociable` → `Dziadek/Babcia`,
   - low agreeableness or clearly gruff personality → `Stary/Stara`,
   - otherwise → `Pan/Pani`.

This gives relation real influence without making personality alone change the title every time context changes.

Do not overfit exact Big Five thresholds across many dimensions. One or two clear signals are enough for V1.

If threshold choice becomes arbitrary during implementation, prefer a very small documented rule over a complex scoring formula.

## 8. Primary UI integration

### `src/ui-vue/store.ts::openNpcDialogueMenu()`

Current function already receives:

```ts
npc: NpcAgent
settlement: Settlement
questManager: QuestManager
timeOfDay: number
```

This is the narrow composition point that already has every required input.

Recommended change:

- add a presentation-only string to `NpcDialogueMenuState`, e.g. `npcHeading`,
- on open, resolve it from:
  - `npc.name`,
  - `npc.displayName`,
  - `npc.age`,
  - `npc.gender`,
  - `npc.personality`,
  - `npc.traits`,
  - `questManager.getRelationLevel(npc.id)`.

This avoids importing `QuestManager` or social state into the Vue component itself beyond what store already owns.

### `src/ui-vue/NpcDialogueMenu.vue`

Current heading is:

```vue
{{ state.npc?.displayName }}
```

Change only this heading to the pre-resolved contextual presentation value.

Do not replace usages of `state.npc.displayName` passed into ordinary dialogue content unless the plan explicitly needs the NPC to call themselves by the title. For example:

```ts
aboutSelfLine(state.npc.displayName, ...)
```

should remain canonical in V1.

## 9. Keep CSS2D labels canonical in V1

`NpcAgent` currently constructs its floating status label with canonical `displayName`.

Leave it unchanged.

Reasons:

- label is visible outside direct social context,
- relation-aware title would require label refresh when relation changes,
- current label controller is constructed inside `NpcAgent`,
- injecting quest/player relation into simulation presentation would widen ownership for cosmetic value.

The plan's "selected NPC labels/dialogue presentation" should therefore be interpreted as **selected presentation surfaces**, with dialogue header as the V1 surface.

A later polish can add relation-aware world labels through a separate presentation adapter if desired.

## 10. Villagers screen

Do not change Villagers UI in V1 unless implementation finds an already-central display-label adapter that makes it essentially free.

The Villagers screen is a roster/identity surface, where canonical full names are preferable and stable.

This also avoids a mismatch where the player's relation changes while the list is open and titles would need reactive recomputation.

## 11. Quest safety

### Stable identity

Quest matching is already by `NpcId`, not display name.

`QuestManager` methods consumed from dialogue use `npc.id`.

Do not change any of these identity paths.

### `src/quests/materializeAuthoredQuests.ts`

Authored NPC names are resolved to stable ids at materialization time. This is a composition-time binding step and must continue to use canonical authored names/descriptors.

Do not feed contextual titled names into this code.

### `giverName` and authored text

`QuestDef.giverName` remains presentation-only after materialization, but authored story strings also interpolate names directly.

Do not rewrite quest text to use contextual titles in npc-052.

In particular, Lost Treasure Chronicles can continue to say `Kazimierz` in authored text while the dialogue window header may show a contextual form.

This separation is intentional.

## 12. Kazimierz guardrail

Do not change:

- `lostTreasureChroniclesElderResident.ts`,
- Kazimierz's name,
- age,
- family id,
- authored quest strings,
- quest binding,
- settlement selection.

Kazimierz should participate only because he is an ordinary live `NpcAgent` with age 74 reaching the same presentation resolver as another elder.

Add a focused resolver/integration test using a Kazimierz-like input if useful, but do not special-case his id/name in production code.

## 13. No persistence / lifecycle work

Contextual title is derived from:

- age,
- gender,
- personality/traits,
- current player relation.

All inputs already exist.

Do not add:

- `SaveData` field,
- `NpcAuthoritativeState` field,
- cached title on `NpcAgent`,
- title migration,
- title RNG seed.

Recompute on dialogue open. Cost is trivial.

## 14. Suggested tests

### New pure resolver tests

Add a focused `npcSocialTitle.test.ts` or equivalent:

- age 64 returns canonical display name,
- `elderly` male stranger → formal male form,
- `veryElderly` female stranger → formal female form,
- friendly/trusted agreeable elder can resolve to familiar form,
- friendly/trusted gruff elder can resolve to rough/informal form,
- same inputs always produce same output,
- canonical input strings are not mutated,
- surname handling is correct for formal vs familiar/rough form.

Test `lifeStageForAge()` integration indirectly through boundary ages 64/65/84/85 rather than duplicating its implementation.

### Dialogue integration

Extend the smallest store/dialogue test:

- `openNpcDialogueMenu()` computes contextual heading from `npc.id` relation,
- non-elder heading stays exactly current `displayName`,
- title is recomputed on a later open after relation changes,
- no title duplication across repeated opens.

### Quest regression

Do not create broad new quest tests.

Existing stable-NpcId/materialization tests are the primary protection. A focused assertion is enough if the dialogue integration touches quest-related store code:

- the same `npc.id` is still passed to quest preview/help paths,
- contextual heading never reaches `materializeAuthoredQuests()`.

## 15. Implementation order

1. Add pure title resolver in `src/ai/`.
2. Add focused resolver tests.
3. Add presentation field to `NpcDialogueMenuState`.
4. Resolve heading in `openNpcDialogueMenu()` using `questManager.getRelationLevel(npc.id)`.
5. Render that field in `NpcDialogueMenu.vue`.
6. Extend dialogue/store tests.
7. Run focused tests, then typecheck/lint/test/build.

## 16. Avoid

- modifying `NpcAgent.displayName`,
- changing CSS2D name labels in V1,
- persisting titles,
- modifying `FamilyMember.name` / `CharacterDef.name`,
- deriving identity from a titled string,
- feeding titles to quest materialization,
- rewriting authored Lost Treasure dialogue,
- random title rolls,
- adding a title manager,
- adding a relation cache just for UI,
- using NPC↔NPC relationships as player familiarity.

## Focused verification

Suggested:

```bash
pnpm vitest run src/ai/npcSocialTitle.test.ts
pnpm vitest run src/ui-vue/npcDialogueOpen.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Exact new test filename may differ if the implementation colocates the resolver elsewhere.

Manual/browser verification remains the User's responsibility:

- talk to several elders at different relation levels,
- confirm non-elders are unchanged,
- confirm surname/title formatting,
- verify repeated dialogue opens do not stack prefixes,
- verify Kazimierz's Lost Treasure quest flow remains unchanged.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

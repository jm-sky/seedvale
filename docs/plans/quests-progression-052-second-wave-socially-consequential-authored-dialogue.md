# Plan: Second-wave socially consequential authored dialogue

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** quests-progression-051
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships`
**Tags:** `dialogue` `narrative` `relation` `reputation` `consequences`
**Roadmap:** `quests-and-reputation.md`
**Model:** Sonnet, Composer

## Goal

Apply the reusable socially consequential dialogue mechanism introduced by `quests-progression-050` to a second wave of authored quests, using the narrative copy produced by `quests-progression-051` as the canonical baseline.

This plan is deliberately third in the sequence:

```text
quests-progression-050
→ socially consequential dialogue mechanism + first implementation wave

quests-progression-051
→ narrative polish of selected authored dialogue without gameplay changes

quests-progression-052
→ second-wave gameplay application on top of the polished copy
```

Do not re-run the narrative rewrite from `051` and do not create a parallel social-dialogue mechanism. `052` adds only the relationship/reputation-sensitive reactions needed to make existing choices feel socially grounded.

---

## Scope

Apply the mechanism to these five existing authored stories, in this order:

1. `Podejrzany transport` — `src/quests/suspiciousTransportCaveCache.ts`
2. `Stare kości` — `src/quests/oldBonesAdventureCave.ts`
3. `Skrytka bandytów` — `src/quests/dungeonBanditTreasure.ts`
4. `Zaginiony myśliwy` — `src/quests/lostHunterNaturalCave.ts`
5. `Lost Treasure Expedition` — `src/quests/lostTreasureExpedition.ts`

All five already have explicit authored choices and social consequences. The purpose of this plan is to make the NPC reaction to those choices depend on live social context where that creates a meaningful difference.

The existing objective flow, physical item ownership, world bindings and canonical terminal outcomes remain authoritative.

---

## Dependency contract

### From `quests-progression-050`

Implementation must reuse the final contract delivered by `050` for:

- live relation/reputation-sensitive reaction conditions;
- reaction-specific NPC reply copy;
- additive `QuestConsequences`;
- authored reaction validation;
- journal projection of the actual reaction line;
- quest-topic cooldown only where the quest context remains active after the reaction.

Do not copy or fork reaction evaluation into individual quest modules.

If the implemented names/types differ from the illustrative contract in plan `050`, use the actual implemented API.

### From `quests-progression-051`

For overlapping quests (`Podejrzany transport`, `Stare kości`, `Zaginiony myśliwy`), the post-`051` text is the narrative source of truth.

Do not restore older strings from pre-`051` code. New reaction lines must:

- match the tone established by `051`;
- preserve the same known facts;
- not invent new history, evidence, family relations or world knowledge;
- remain concise and natural;
- not turn dialogue back into an objective/outcome summary.

`Skrytka bandytów` and `Lost Treasure Expedition` are not a reason to broaden `051`; polish only the new reaction lines added by this plan, unless a tiny adjacent wording adjustment is required to avoid contradiction.

---

## Design rules

### 1. Context-sensitive, not morality-scored

Do not define a global `good` / `bad` dialogue score.

A reaction should depend on concrete social context such as:

```text
player↔NPC relation
settlement integrity/trust/competence reputation
```

The same decision may produce a different emotional response from different NPCs without changing the canonical outcome.

### 2. Canonical outcomes stay unchanged

Do not add new terminal outcomes just to represent tone.

Examples:

- `Podejrzany transport` still resolves through its existing keep-quiet / report / keep-goods outcomes;
- `Stare kości` still resolves through claimant A / claimant B / keep signet;
- `Skrytka bandytów` still resolves through return property / give evidence to guard / keep property;
- `Zaginiony myśliwy` still resolves through return bow / keep bow;
- `Lost Treasure Expedition` still resolves through its existing journal-recipient outcomes.

Reaction-specific deltas layer on top of those existing outcomes through the mechanism from `050`.

### 3. Stronger relationship can mean stronger disappointment

High relation must not always protect the player from negative consequences.

For betrayal, appropriation or a broken expectation, a trusted NPC may react more strongly than a stranger because the decision violates an established relationship.

Conversely, high relation may soften disagreement when the player chooses a defensible but conflicting option.

Author this per conversation; do not encode it as a global heuristic.

### 4. Reputation changes interpretation, not world truth

Use settlement reputation only where the NPC plausibly evaluates the player's credibility or conduct.

Examples:

- high `integrity` may make a guard initially more surprised by theft;
- low `integrity` may make suspicion unsurprising;
- high `trust` may make a family claimant take a difficult explanation more seriously.

Reputation must not reveal hidden quest facts or bypass physical item requirements.

### 5. Cooldown is optional and usually not useful on terminal choices

Most choices in this plan terminate their quest immediately. A quest-topic cooldown after a terminal outcome has no gameplay value and should not be authored mechanically just for flavour.

Use cooldown only if an added reaction occurs before terminal resolution and the same quest conversation remains active afterward.

Do not block trade, generic NPC dialogue or unrelated quests.

---

## Quest 1 — Podejrzany transport

**File:** `src/quests/suspiciousTransportCaveCache.ts`

### Current structure to preserve

```text
giver
→ reveal cave cache
→ loot exact evidence item
→ choose:
   keep quiet with giver
   report to counterpart
   keep the goods
→ existing terminal outcome
```

The quest already applies relation and settlement reputation consequences for all three resolutions.

### Social-reaction pass

Add authored reactions at the final dialogue actions.

#### Reporting the giver

The giver's social response should distinguish at least:

- a weak/neutral prior relationship — anger or defensiveness, but limited additional personal loss;
- a friendly/trusted prior relationship — stronger sense of betrayal and a larger additional relation penalty.

The terminal `REPORT_IT` outcome remains unchanged.

#### Keeping quiet

The giver may respond more warmly when relation is already positive, but do not turn this into a large free relation farm. Any additional positive delta should be small and bounded.

The counterpart's existing negative consequence remains authoritative; do not invent an off-screen dialogue reaction for an NPC the player did not speak to.

#### Keeping the goods

Both existing target variants may use a sharper reaction when the NPC already has reason to trust the player. Preserve the current physical item requirement and existing terminal outcome.

### Guardrail

Do not explain the parcel's origin, owner or criminal status beyond facts already established by the quest.

---

## Quest 2 — Stare kości

**File:** `src/quests/oldBonesAdventureCave.ts`

### Current structure to preserve

```text
giver → claimant A → cave remains/signet
→ optional claimant B
→ choose claimant A / claimant B / keep signet
```

The signet is an exact item instance and its transfer/retention choice is the resolution.

### Social-reaction pass

#### Give signet to claimant A

Allow a warmer reply when claimant A already has a positive relationship with the player. Keep the base outcome consequences unchanged; only a very small additional relation delta is justified.

#### Give signet to claimant B

When claimant A has an existing positive relationship with the player, the authored reaction to being passed over may be more personal. Do not make claimant A's reaction block resolution or redirect the item.

#### Keep signet

This is the strongest candidate for relationship-sensitive disappointment:

- stranger/acquainted claimant: guarded or accusatory reply;
- friendly/trusted claimant: explicit disappointment/betrayal tone and an additional bounded relation penalty.

If claimant B exists, only apply a reaction for the NPC actually spoken to; the existing outcome already owns cross-NPC consequence changes.

### Guardrail

Do not add inscriptions, wills, promises or genealogical evidence absent from the current binding.

---

## Quest 3 — Skrytka bandytów

**File:** `src/quests/dungeonBanditTreasure.ts`

### Current structure to preserve

```text
guard/giver → dungeon stash
→ exact ledger + marked valuable
→ choose:
   return marked property to claimant
   give evidence/property to guard
   keep marked property
```

### Social-reaction pass

This quest is the best second-wave test of **reputation-sensitive interpretation**.

#### Return property directly

A claimant with positive relation may respond more personally/gratefully. Keep additional mechanical gain small; the existing outcome already awards substantial trust/integrity/benevolence reputation.

#### Give evidence to guard

Allow the guard's reply to vary with current `competence` / `integrity` reputation:

- established competence/integrity: professional recognition;
- low/neutral standing: more procedural acknowledgement.

Do not increase rewards just because a reputation threshold is met.

#### Keep marked property

Use current relation and/or `integrity` reputation to vary the guard's reaction:

- high integrity: surprise/disappointment;
- low integrity: suspicion confirmed / little surprise.

The action must still resolve through the same keep-property outcome and existing physical item requirement.

### Guardrail

The guard reaction is social interpretation only. It must not invent a legal/crime/wanted system or trigger settlement-wide hostility.

---

## Quest 4 — Zaginiony myśliwy

**File:** `src/quests/lostHunterNaturalCave.ts`

### Current structure to preserve

```text
giver → witness → cave pack/bow → giver
→ return bow / keep bow
```

`quests-progression-051` specifically corrects unsupported death certainty in the dialogue. Preserve that correction.

### Social-reaction pass

#### Return bow

Positive relation may produce a more personal response, but avoid extra large rewards or relation stacking on top of the existing `+3` relation outcome.

#### Keep bow

This choice should distinguish relationship context:

- stranger/acquainted: disappointed but restrained;
- friendly/trusted: stronger hurt because the player chooses to keep a personal/family possession after being trusted with the search.

A small additional negative relation consequence is appropriate at high relation if it remains bounded and does not make the quest outcome inaccessible.

### Guardrail

Reaction copy may refer to the found belongings and the choice about the bow. It must not state that the hunter is dead unless a later dependency has made that fact authoritative.

---

## Quest 5 — Lost Treasure Expedition

**File:** `src/quests/lostTreasureExpedition.ts`

### Current structure to preserve

```text
sponsor → expedition cave trail
→ journal/evidence/final treasure
→ choose journal recipient:
   family/stakeholder when present
   sponsor
   keep journal
```

The physical journal instance and existing outcome set stay authoritative.

### Social-reaction pass

#### Give journal to family/stakeholder

Use stakeholder relation where present:

- positive relation: warmer recognition that the player brought back the expedition's story;
- weak relation: reserved gratitude.

Do not increase treasure ownership or invent new inheritance claims.

#### Give journal to sponsor

Sponsor response may vary with relation and `competence` reputation:

- established competence: professional confidence/recognition;
- low standing: acknowledgement focused on the result rather than trust in the player.

The existing coin reward remains unchanged.

#### Keep journal

This is the strongest negative reaction candidate:

- positive sponsor/stakeholder relation can produce stronger disappointment and a small additional relation penalty;
- low `integrity` reputation may change the reply to suspicion-confirmed rather than surprise.

Do not create a separate concealment state or future blackmail system.

---

## Technical integration

Primary content files:

```text
src/quests/suspiciousTransportCaveCache.ts
src/quests/oldBonesAdventureCave.ts
src/quests/dungeonBanditTreasure.ts
src/quests/lostHunterNaturalCave.ts
src/quests/lostTreasureExpedition.ts
```

Shared mechanism owned by dependency `050`:

```text
src/quests/quests.ts
src/quests/QuestManager.ts
src/quests/materializeAuthoredQuests.ts
```

Do not modify the shared mechanism unless implementation exposes a genuine missing capability required by more than one of the five quests. If such a gap is found, extend the existing `050` contract minimally and cover it with shared tests rather than adding quest-local evaluation code.

Generated/dynamic quest builders using stable `NpcId` refs should author reactions directly on runtime `QuestDef`s. Name-based authored definitions must continue through the existing materialization path where applicable.

Add JSDoc with `@domain quests-progression` only for important new reusable helpers/public contracts; quest-local content declarations do not need decorative JSDoc.

---

## Tuning constraints

Additional reaction consequences must remain secondary to existing canonical outcome consequences.

Default tuning guidance:

```text
small positive reaction delta: +1 relation
small negative reaction delta: -1 relation
strong betrayal/disappointment: at most -2 relation
```

Do not add extra renown or large reputation deltas unless the existing outcome does not already represent the public consequence. In this plan, most public reputation changes already exist on the terminal outcome and should remain there.

Avoid double-charging the same social meaning. Example: if an outcome already applies `claimant A -2`, a reaction should not add another large fixed penalty simply because the branch was chosen. Reserve extra deltas for relationship-sensitive amplification.

---

## Tests

Add focused tests around the five migrated quest builders and the shared `050` reaction runtime.

Required coverage:

- each migrated final choice still reaches the same canonical outcome id;
- exact item-instance requirements remain unchanged;
- low vs high relation can select different NPC replies where authored;
- reputation-sensitive reactions select the expected reply at threshold boundaries;
- additional reaction consequences apply exactly once;
- terminal outcome consequences still apply exactly once;
- high-relation betrayal amplification is bounded;
- no reaction condition silently blocks an action or makes an outcome unreachable;
- post-`051` baseline player/NPC copy is preserved except where a new reaction line is intentionally added;
- save/load/journal behaviour inherited from `050` still projects the actually heard reaction line.

Prefer extending the nearest existing unit tests for each quest module plus `QuestManager.test.ts` only when shared runtime behaviour needs coverage.

Do not create a browser automation harness.

---

## Non-goals

- Another dialogue engine or reaction evaluator.
- New generic NPC anger/mood/memory storage.
- New morality/alignment system.
- New crime/law/wanted mechanics.
- New family genealogy or inheritance system.
- New quest terminal outcomes for tone only.
- New rewards or economy balancing.
- Rewriting the narrative pass from `051`.
- Changing cave/world binding, item identity, container placement or quest objective flow.
- Trait/personality-based response scoring; this can be a later NPC-domain extension if the underlying trait/social systems warrant it.

---

## Verification

Automated:

- targeted tests for the five quest modules;
- targeted `QuestManager` reaction tests when shared behaviour is touched;
- `pnpm typecheck`;
- repository-standard build/test commands required by the current workflow.

Manual browser verification is performed by the User, not the AI agent.

Browser verification should confirm:

- reaction wording fits the narrative baseline established by `051`;
- the same choice can visibly receive a different NPC response under different social standing;
- canonical quest outcomes and physical-item behaviour are unchanged;
- social deltas are understandable and not excessively punitive;
- no unrelated NPC interaction is blocked.

---

## Documentation

After implementation:

- update `docs/state/quests.md` only if the implemented shared contract from `050` needs clarification after this second-wave use;
- do not duplicate the five quest narratives into state docs;
- keep `docs/vision/quests.md` as design direction, not a completed-content checklist;
- if implementation reveals a reusable authoring rule for future quests, add it to the appropriate quest planning/vision guidance rather than documenting it only inside one quest file.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
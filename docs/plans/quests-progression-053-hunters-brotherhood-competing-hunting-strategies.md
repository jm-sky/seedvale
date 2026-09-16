# Plan: Hunters Brotherhood — competing hunting strategies

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** quests-progression-049
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `progression`
**Tags:** `hunters-brotherhood` `fauna` `choice` `consequences`
**Roadmap:** `quests-hunters-brotherhood.md`

## Goal

After `quests-progression-049`, the Hunters Brotherhood decides how to respond to the investigated habitat problem. The player chooses and executes a real strategy through existing world systems, and that decision leaves both a persistent quest-history outcome and real domain-owned consequences.

The quest must not own a parallel habitat-health, predator-pressure or faction-state model. Fauna / NPC / settlement systems remain authoritative for world changes; `QuestManager` owns only quest progress, authored outcomes and social consequences.

## Flow

```text
048 membership
→ 049 investigation
→ Brotherhood council
→ choose strategy
→ real world action
→ immediate observable result where available
→ authored social consequence
→ persistent strategy outcome
→ later simulation continues evolving independently
```

## Inputs and ownership

Reuse:

- stable Brotherhood cast/binding introduced by `quests-progression-048`;
- the same bound habitat / `spawnerId` selected by `quests-progression-049`;
- the historical investigation diagnosis from `049`;
- a fresh live habitat-pressure snapshot at council time and where useful during execution;
- existing player↔NPC relation, settlement reputation/renown and quest-history mechanisms;
- existing `QuestDef`, nonlinear stage flow and objective vocabulary before adding new quest-specific contracts.

The historical diagnosis and current live state are intentionally different concepts:

- the diagnosis records what the player learned during the earlier investigation;
- the live snapshot records what the world looks like now.

Do not freeze ecology for the story.

## Council

The Brotherhood discusses the investigated habitat.

Narrative roles remain biases, not hardcoded policies:

- **master** — long-term balance and recovery;
- **trophy hunter** — prestige and large game;
- **practical hunter** — food, hides and settlement needs;
- **ambitious hunter** — rapid action and proving capability.

Their current position may be moderated by the live habitat state. For example, the master may support predator removal when predator pressure is genuinely high; the practical hunter may support habitat support when the local food source is failing.

The council should present strategies that make sense for the real state rather than always showing the same four neutral buttons.

## Strategy: predator hunt

Available only when live predator pressure / a real predator source supports it.

Requirements:

- bind to existing live predators or an existing stable predator source;
- do not spawn a quest-only wolf pack or predator population;
- execute through existing combat / fauna mechanisms;
- allow a fresh habitat-pressure read afterward as an immediate observation, not as a quest-owned simulation result.

`mortality` alone never implies predators caused the problem.

## Strategy: habitat support

Available mainly when food pressure or a weakened population makes support plausible.

Prefer existing mechanisms such as:

- `feed_habitat_animals`;
- authoritative forage / food state;
- other already-existing domain actions discovered during recon.

Do not implement abstract quest-owned mutations such as `habitatHealth += X`.

Implementation recon must verify whether `feed_habitat_animals` creates a real ecological/world consequence or only advances quest progress. If it is only a progress objective, use or add the narrowest correct domain-owned action rather than faking the effect in the quest layer.

## Strategy: big hunt

The player joins a larger hunt against real deer/stag associated with the bound habitat.

Effects must come from actual world interactions:

- real animals die / are harvested;
- real loot / meat / hides / trophies are produced by existing systems;
- the local population changes because those animals were actually removed.

The strategy may remain possible even when the habitat is weak, but dialogue should make the risk understandable. The quest must not label the choice as inherently correct or incorrect.

Implementation recon must verify whether current `harvest_animals` progression can be constrained to the bound habitat / `spawnerId`. If not, add or reuse the narrowest existing identity-aware objective seam rather than accepting unrelated animals elsewhere in the world.

## Strategy: temporary hunting restriction

This strategy is conditional scope.

Include it in V1 only if recon confirms an existing authoritative mechanism that can actually reduce local NPC hunting / harvesting pressure for the habitat or settlement.

If no such mechanism exists:

- do not add a fake restriction flag owned by the quest layer;
- implement V1 with the remaining real strategies;
- create a separate dependency plan in the correct owning domain if hunting-policy simulation is worth adding.

The absence of this mechanism must not block the other strategy branches.

## Strategy availability

Availability should be derived from historical diagnosis plus current live state, not a hardcoded always-four-option menu.

Examples:

```text
significant predator pressure
→ predator hunt can be proposed

significant food shortage
→ habitat support can be proposed

healthy / resilient population
→ big hunt is easier to justify

critical population
→ recovery-oriented options become more plausible
→ big hunt may still be possible but should clearly communicate risk
```

The system does not tell the player which strategy is morally or mechanically "correct".

## World changes between `049` and this quest

Before the council, read the same habitat again.

If the problem has materially changed:

- the dialogue and available strategies should reflect the new state;
- do not force a strategy aimed at a problem that no longer exists.

If the habitat has naturally recovered, allow a short no-intervention resolution rather than failing or soft-locking the quest.

Possible outcome:

```text
brotherhood_strategy_no_intervention
```

Natural recovery is valid world history, not a quest failure.

## Quest structure

### Stage 1 — council

Discuss the historical investigation and the current state of the habitat.

The master is the primary giver / coordinator; the other Brotherhood members participate through the existing quest-dialogue mechanisms.

### Stage 2 — strategy choice

Choose one available strategy.

Prefer one `QuestDef` using existing nonlinear transitions over four independent quest definitions when the current quest contracts remain readable and testable.

### Stage 3 — execution

Execute the selected action through domain-owned mechanics.

Examples:

```text
predator hunt
→ locate / remove real predator pressure

habitat support
→ perform a real support action on the bound habitat

big hunt
→ harvest real animals from the bound habitat

restriction
→ invoke an existing authoritative local hunting-policy mechanism, if one exists
```

### Stage 4 — report and immediate observation

Confirm that the chosen strategy was actually carried out.

Optionally read the live habitat snapshot to communicate an immediate observable effect, but do not require every strategy to produce an instant pressure improvement.

Long-term consequences remain owned by the simulation and may emerge later.

The quest completes based on performing the chosen strategy, not on forcing ecology to cross a target threshold immediately.

## Outcomes

Variant outcomes are appropriate here because they record a deliberate player decision, not a copy of ecology state.

Use stable authored outcome ids, e.g.:

```text
brotherhood_strategy_predator_hunt
brotherhood_strategy_habitat_support
brotherhood_strategy_big_hunt
brotherhood_strategy_restriction
brotherhood_strategy_no_intervention
```

Do not encode the full social history or habitat snapshot into outcome ids.

Later Brotherhood content can use these outcomes to remember what the player chose, while live fauna remains authoritative for what actually happened afterward.

## Social consequences

Each strategy may apply authored consequences through existing systems:

- player↔NPC relation;
- settlement reputation dimensions;
- settlement renown where appropriate.

Different Brotherhood members may react differently to the same strategy, but do not add a separate Brotherhood reputation or morality meter.

Keep consequences understandable from NPC interests and the situation; not every line or ordinary informational exchange needs a penalty or reward.

### Optional socially consequential dialogue

While writing implementation notes, inspect the council for natural places where current relation, reputation or prior Brotherhood history could affect a meaningful response.

This is an optional enhancement, not a requirement for every branch.

Potential uses include:

- a trusted NPC tolerating an argument that an already-hostile NPC rejects;
- an explicit lie, threat or insult applying an authored social consequence;
- prior Brotherhood decisions influencing later dialogue;
- a bounded conversation cooldown after genuine escalation if existing mechanisms support it.

Reuse normal relation/reputation/quest-history mechanisms. Do not build a separate dialogue reputation or standalone dialogue-tree runtime.

## Mortality semantics

`mortality` remains a symptom, not an attributed cause.

Do not infer:

```text
high mortality → predators caused it
```

Predator strategy requires actual predator evidence / pressure.

Similarly, high mortality alone must not be described as proven human overhunting unless a separate authoritative system provides that attribution.

## Architecture guardrails

- No quest-owned habitat-health state.
- No quest-owned predator-pressure state.
- No parallel hunting-policy state in `QuestManager`.
- No new Brotherhood faction/reputation subsystem.
- No quest-only fauna spawned to satisfy an objective.
- No success condition that requires immediate ecological recovery after every strategy.
- No broad ecosystem refactor inside this plan.
- Prefer extending existing identity-aware objectives / domain APIs over adding parallel quest-specific mechanics.

Important new public / architectural resolvers or bindings should receive concise JSDoc and `@domain quests-progression` where useful for preflight discovery.

## Required implementation recon

Before implementation, verify current code for these points and record the findings in implementation notes:

1. whether `harvest_animals` can restrict progress to one stable habitat / `spawnerId`;
2. whether predator pressure can be resolved to concrete live predators or a stable predator source usable by objectives;
3. whether `feed_habitat_animals` mutates authoritative world/fauna state or only tracks quest progress;
4. whether an authoritative local NPC hunting-restriction mechanism already exists;
5. how `quests-progression-049` persists or reconstructs its historical diagnosis separately from a fresh live snapshot;
6. whether current quest nonlinear flow and dialogue actions can represent council → strategy branch → execution → report without a new runtime;
7. which existing relation/reputation consequence APIs should be reused.

If recon disproves a planned mechanism, adapt the plan to current code ownership rather than forcing a parallel implementation.

## Non-goals

- exceptional trophy animal / Great Trophy finale;
- Brotherhood faction ranks;
- Brotherhood-specific reputation;
- full human-overhunting attribution;
- new general ecological simulator;
- procedural animal tracking / clue system;
- new NPC profession roles;
- general settlement hunting-policy reform unless a separate domain plan deliberately owns it;
- broad socially consequential dialogue refactor.

## Verification

1. Quest is gated by completion of `quests-progression-049`.
2. It reuses the stable Brotherhood cast and the same bound habitat.
3. Council content can distinguish historical diagnosis from current live habitat state.
4. Strategy availability reflects real world state rather than an always-four-option menu.
5. Every implemented strategy executes through domain-owned mechanics.
6. Missing hunting-restriction infrastructure does not force a quest-owned fake or block the other branches.
7. `big_hunt` cannot be completed with unrelated animals outside the bound habitat.
8. Predator removal uses real predators / real predator source.
9. Save/load preserves the selected branch and normal quest progress.
10. Habitat changes before or during the quest do not soft-lock progression.
11. Strategy completion does not require immediate ecological recovery.
12. Outcomes record the player's chosen strategy, not copied ecosystem state.
13. Social consequences use existing relation/reputation/renown systems only.
14. No parallel fauna, faction or dialogue reputation state is introduced.
15. Automated tests cover deterministic strategy availability / branching and the important world-binding guards; browser verification remains manual for the user.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
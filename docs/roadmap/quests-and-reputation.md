# Quests & Reputation Roadmap

## Purpose

This document records the current direction for quests, reputation and quest-driven player income.

It is a roadmap, not an implementation plan. Concrete changes should be split into focused plans under `docs/plans/` and verified against the current code before implementation.

## Current state

### Quests

The current quest system already has a solid technical base:

- authored quest definitions in `src/quests/quests.ts`,
- a shared `QuestManager` for lifecycle, stages, state and completion,
- relation-based availability,
- persistence of quest progress and relations,
- objectives bound to real world entities such as fauna, landmarks, wells and spawners,
- item rewards through the normal inventory acquisition path,
- coins represented as ordinary inventory items and already usable by quest rewards,
- failure/invalidation support for world-bound objectives.

The current content and presentation are less mature than the lifecycle foundation:

- quest definitions have no proper title field,
- the Quest Log does not show rich context or rewards,
- rewards are ad hoc and poorly balanced,
- one reward can currently contain only one item kind/count while EXP and relation are separate effects,
- relation increases are too automatic for formal work-like quests,
- there is no explicit model for visible vs hidden rewards,
- there is only minimal support for prerequisites/chains,
- current quests mix personal favors, RPG content, contextual world tasks and paid work without explicit classification.

The existing `woda-dla-marka` quest is a clear balance problem: fetching water currently awards a `long_sword`, which is too large a reward for the task.

### Quest EXP

Quest EXP currently behaves as a standalone counter owned by `QuestManager`:

- quests add EXP,
- EXP is persisted,
- HUD and Quest Log display it.

No meaningful progression consumer has been identified: no levels, attributes, skill unlocks or gameplay gates currently depend on this global quest EXP.

Therefore quest EXP should not be expanded until its role in progression is intentionally designed. It may later be removed if it remains redundant.

### Relation

Relation is an individual NPC-to-player social value.

Current relation levels are used by gameplay, including NPC reaction behavior and quest availability. Relation should remain distinct from reputation.

Target rule:

- personal favors and personally meaningful quests may increase relation,
- formal jobs and impersonal contracts do not need to increase relation,
- relation changes should be explicit rather than an automatic side effect of every completed quest.

### Reputation today

There is no true standalone reputation system yet.

`QuestManager.getPlayerStanding()` currently derives a general standing value from the average of per-NPC relations. Other code treats this value as a form of general reputation.

This is only a compatibility approximation and should not become the long-term reputation model.

`BadgeManager` is also not reputation. Badges are persistent historical achievements/facts such as disturbing graves or discovering rare finds. They should remain a separate concept.

## Target social model

Keep four concepts distinct:

### Relation

> What a specific NPC thinks about the player.

Examples:

- Kasia trusts the player,
- Piotr dislikes the player,
- Marek considers the player a friend.

Relation is personal. It can disagree with public reputation: an NPC may dislike the player personally while still recognizing that the player is widely trusted, capable or respected.

### Reputation

> How a community evaluates the player's social qualities based on what is known about the player's actions.

Reputation should describe perceived qualities rather than professions or activity counters. The initial target dimensions are:

- `trust` — whether the player is considered dependable and likely to keep commitments,
- `competence` — whether the player is considered capable, effective and able to handle difficult tasks,
- `benevolence` — whether the player is considered helpful and willing to act for others rather than only for personal gain,
- `courage` — whether the player is considered willing to face danger and risk when it matters,
- `integrity` — whether the player is considered honest and likely to respect shared rules, property and social norms.

These dimensions are intentionally not professions such as `worker`, `hunter`, `explorer` or `hero`. Those concepts are better represented by concrete history, titles/badges, skills or other domain state.

Reputation dimensions should support both positive and negative values. A player can therefore be highly competent and courageous while being considered dishonest or untrustworthy.

The dimensions are a target model, not a requirement to make every NPC consume every dimension. NPC decisions should use only the signals relevant to the situation.

Examples:

- entrusting a valuable item may depend strongly on `trust` and `integrity`,
- asking the player to confront a dangerous threat may depend on `competence` and `courage`,
- a personal request may depend on relation together with `trust` or `benevolence`,
- a formal job may care about `competence` and `trust` without changing personal relation.

### Renown

> How widely the player is known, independently from whether the reputation is good or bad.

Renown is not another moral or competence dimension. It represents reach/visibility of the player's reputation.

A player may be:

- well regarded by a few people but largely unknown,
- widely known and respected,
- widely known and distrusted,
- famous for a major event while still having mixed reputation dimensions.

Renown should initially follow the same local/community scope as reputation. Wider regional or world renown can be introduced later for exceptional events if gameplay requires it.

There should not be a single universal `fame` score that replaces reputation dimensions.

### Known for / Badges

> Concrete persistent facts about what the player has done or become known for.

Examples include things conceptually like:

- skilled hunter,
- wolf slayer,
- grave robber,
- relic seeker.

The existing `BadgeManager` is the natural starting point for persistent historical facts and should remain separate from reputation scores.

A badge does not automatically imply a fixed reputation effect. Whether an action affects reputation depends on social knowledge, context and the systems consuming that information.

## Reputation scope

Reputation should be contextual rather than purely global.

The preferred foundation is settlement-scoped reputation, conceptually:

```ts
reputation[settlementId].trust
reputation[settlementId].competence
reputation[settlementId].benevolence
reputation[settlementId].courage
reputation[settlementId].integrity
renown[settlementId]
```

This allows the player to be trusted and well known in one settlement while remaining an unknown outsider elsewhere.

The first implementation does not need automatic propagation between settlements. Regional/world propagation should be introduced only when information travel or broader social systems justify it.

## Social information model

The systems answer different questions:

```text
Relation    = What does this specific NPC think of me?
Reputation  = How does this community evaluate my qualities?
Renown      = How widely am I known here?
Known for   = What concrete deeds or identities am I known for?
```

They should interact without being collapsed into one score.

For example, killing wolves threatening a settlement might produce some combination of:

- increased local `competence`,
- increased local `courage`,
- possibly increased `benevolence` depending on context and motivation,
- increased local renown,
- a relevant persistent badge/history fact,
- a separate relation change with a personally affected NPC.

The exact effects should come from the event/context rather than a universal rule such as "every completed quest increases all positive reputation".

## Reputation sources

Reputation is not a quest-only reward system.

It should be able to change through ordinary world events, for example:

- completing or failing commitments,
- performing work effectively or poorly,
- helping NPCs or households,
- resolving settlement problems,
- protecting inhabitants,
- major combat or rescue events,
- harmful public behavior,
- theft, deception or property violations when socially known,
- abandoning important responsibilities where meaningful.

Quests are one source of reputation changes, not the owner of reputation.

Changes should be tied to events that can reasonably become socially known. A private action should not magically alter settlement reputation merely because the simulation recorded it.

## Reputation as decision input

Reputation exists to participate in world behavior, not only to populate a character screen.

NPCs and settlement systems may eventually use relevant reputation dimensions as decision inputs alongside:

- personal relation,
- current needs/problems/goals,
- traits and personality,
- social roles,
- world state,
- concrete known history/badges.

Relation should remain the stronger signal for genuinely personal interactions. Reputation becomes more useful where an NPC has limited personal experience with the player or where the decision is social/formal in nature.

Avoid reducing all reputation dimensions to an unweighted average. If a system needs a derived standing value, it should derive one from the dimensions relevant to that decision.

## Quest direction

Seedvale should support several quest origins through the same shared quest lifecycle rather than separate quest engines.

### Authored RPG quests

Examples:

- personal NPC stories,
- short quest chains,
- exploration and secrets,
- unique rewards,
- classic authored RPG framing.

These quests do not need to originate from a simulated world problem.

### Contextual quests

Authored quest structure tied to real current world entities or situations, for example:

- a concrete landmark,
- a specific animal,
- a specific NPC or household,
- a known settlement location.

### Emergent world quests

Opportunities created by simulated world state, for example:

- shortages,
- lost livestock,
- settlement threats,
- household problems,
- ecosystem events,
- production or logistics problems.

The world must remain independent of the player. Such problems may later be resolved, worsen or disappear without player involvement.

All three categories should reuse the same quest runtime and shared mechanisms where practical.

## Paid work and player income

For now, work orders and small jobs may remain quests.

There is no need to introduce a separate `JobManager` merely because a quest is economic or repeatable.

Coins are already normal inventory items and quest rewards already use the shared item grant path, so no separate quest-currency system is needed.

Early paid quests can include:

- gathering,
- deliveries,
- simple assistance,
- scouting,
- hunting,
- protection,
- resource-related work.

Later, world-driven economic jobs should increasingly connect to real household/settlement needs, resources and budgets rather than minting rewards without context.

## Reward visibility

The player may know a reward before accepting a quest, but not always.

Examples:

- formal job: `Zapłacę ci 15 monet.`
- personal RPG quest: reward may remain unknown,
- hidden or surprise rewards remain valid.

Internal progression effects such as EXP, if retained, do not need to be advertised as quest rewards.

The quest model should therefore support visible and hidden reward information independently from the actual completion effects.

## Rewards and consequences

Quest completion should not be reduced to `item + EXP + relation`.

Conceptually distinguish direct rewards from broader consequences.

### Direct rewards

Examples:

- coins,
- items.

### Social and world consequences

Examples:

- relation change,
- reputation changes in one or more relevant dimensions,
- renown change,
- badge/known-history changes,
- access or service unlock,
- new quest availability,
- world state change,
- settlement state change,
- ownership or permission changes.

Not every consequence needs to be displayed as a promised reward.

Domain-specific effects should be executed by the system that owns that state rather than by `QuestManager` duplicating it.

Examples:

- a granted land plot should use the existing land ownership system,
- a helper should remain a normal NPC and reuse NPC/helper mechanisms,
- future mounts should use the mount/animal ownership system once such a system exists.

## Significant future rewards

Larger RPG quests may eventually award things such as:

- a land plot,
- a house,
- a horse or other mount,
- a helper/follower,
- access to restricted services or areas,
- privileges within a settlement.

These should be treated as world-state consequences backed by their real domain systems, not special quest-only copies.

The existing `LandOwnershipRegistry` already provides a suitable ownership mechanism for land plots and should be reused when a quest eventually grants land.

The existing helper assignment system provides partial infrastructure for NPC assistance, but it is currently narrower than a general follower/helper ownership system.

House ownership and mount ownership require separate domain support before they become robust quest consequences.

## Quest chains and prerequisites

Quest chains are desirable but do not need a large graph engine yet.

The foundation should allow simple prerequisites such as:

```text
quest A completed -> quest B available
```

More advanced branching can be added later when actual authored content requires it.

## Failure and time

Different quest origins may have different lifecycle expectations.

- authored RPG quests may wait indefinitely when that makes narrative sense,
- contextual/world-driven quests may later expire, become invalid or be resolved by the simulation,
- failure should represent a meaningful change in the underlying situation rather than only a UI state where possible.

This should be introduced gradually rather than forcing timers or failure rules onto every quest.

## Development stages

### Stage 1 — Reputation foundation

Goal: establish reputation and renown as real shared social systems distinct from relation and badges.

Expected scope:

- introduce the initial reputation dimensions: `trust`, `competence`, `benevolence`, `courage`, `integrity`,
- settlement-scoped reputation storage,
- settlement-scoped renown,
- positive and negative reputation changes,
- persistence,
- replace or retire the current relation-average pseudo-reputation path,
- integrate relevant reputation dimensions with at least one existing NPC/social decision,
- preserve relation as the stronger personal signal,
- keep badges independent,
- avoid magical reputation changes for actions that could not reasonably become socially known.

### Stage 2 — Quest foundations cleanup

Goal: make the existing quest system expressive enough for future RPG, work and emergent content without replacing its solid lifecycle core.

Expected scope:

- add proper quest titles and richer metadata,
- model visible vs hidden rewards,
- clean up rewards vs consequences,
- allow explicit relation/reputation/renown effects where appropriate,
- remove automatic relation assumptions,
- support simple prerequisites,
- improve Quest Log presentation,
- audit and rebalance existing quests,
- fix obviously oversized rewards such as the sword-for-water quest,
- decide whether global quest EXP is removed, retained temporarily or connected to a real progression system.

### Stage 3 — Paid quests / player income

Goal: provide useful early-game ways to earn money through existing world activities.

Expected scope:

- add a coherent set of small paid quests,
- establish a basic effort/risk/reward scale,
- include both formal jobs and personal requests,
- use coins through existing inventory/economy mechanisms,
- apply relation/reputation/renown only where justified,
- avoid creating a parallel job system.

### Stage 4 — RPG quest expansion

Goal: deepen authored content using the improved quest foundation.

Expected scope:

- short quest chains,
- personal NPC stories,
- exploration and secrets,
- larger and sometimes hidden rewards,
- meaningful social/world consequences,
- selected domain rewards such as land when the relevant systems are ready.

### Stage 5 — World-driven quests

Goal: increasingly expose real simulation problems as quest opportunities.

Expected scope:

- household and settlement problems,
- shortages and logistics,
- threats and lost livestock,
- fauna/ecosystem events,
- opportunities that may evolve or resolve without the player,
- consequences that feed back into the underlying simulation.

### Stage 6 — Advanced consequences and privileges

Goal: support high-value quest outcomes backed by mature domain systems.

Potential scope:

- house/property ownership,
- mounts,
- persistent helpers/followers,
- settlement privileges,
- access to services or restricted places,
- wider regional/world reputation and renown for exceptional events.

## Planning rule

Each stage should be implemented through one or more focused plans based on actual current code.

Do not create one monolithic quest/reputation implementation plan.

Recommended order:

```text
reputation foundation
-> quest foundations
-> paid quests / income
-> authored RPG expansion
-> world-driven quests
-> advanced consequences
```

Before each implementation plan:

1. verify current code,
2. check relevant completed/in-progress plans and implementation notes,
3. identify the system that owns each affected state,
4. extend existing mechanisms rather than creating parallel managers,
5. keep world behavior independent from the player.

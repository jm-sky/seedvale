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

The current content and presentation are less mature than the lifecycle foundation. The focused plans below address quest identity, outcomes, rewards/consequences, player income, prerequisites and authored RPG content without replacing the existing lifecycle core.

### Relation, reputation, renown and known history

Keep four concepts distinct:

```text
Relation    = What does this specific NPC think of me?
Reputation  = How does this community evaluate my qualities?
Renown      = How widely am I known here?
Known for   = What concrete deeds or identities am I known for?
```

Relation remains personal and may disagree with public reputation.

The initial reputation dimensions are:

- `trust`,
- `competence`,
- `benevolence`,
- `courage`,
- `integrity`.

Reputation is settlement-scoped and supports positive and negative values. Renown is also settlement-scoped and represents visibility rather than approval. Badges/history remain separate concrete facts rather than another reputation score.

Reputation is not quest-owned. Quests are one possible source of social consequences; ordinary world events may also affect reputation when those events can reasonably become socially known.

## Quest direction

Seedvale should support three quest origins through the same shared quest lifecycle rather than separate quest engines.

### Authored RPG quests

Personal NPC stories, short chains, exploration, choices, unique rewards and classic authored RPG framing. These quests do not need to originate from a simulated world problem.

### Contextual quests

Authored quest structure tied to real current world entities or situations such as a landmark, specific animal, NPC, household or settlement location.

### Emergent world quests

Opportunities created by simulated world state: shortages, lost livestock, settlement threats, household problems, ecosystem events, production or logistics problems. The world remains independent of the player, so these situations may later worsen, disappear or be resolved without player involvement.

All three categories should reuse the same quest runtime and shared mechanisms where practical.

## Rewards and consequences

Quest resolution should distinguish direct rewards from broader consequences.

Direct rewards include coins and items. Consequences may include relation, reputation, renown, known-history/badges, quest availability, world/settlement changes, ownership or permissions.

The player may know a reward before accepting a quest, but not always. Formal paid work can advertise payment while personal RPG quests may keep rewards hidden.

Domain-specific consequences remain owned by their real domain systems rather than by `QuestManager`. For example, a land grant should use `LandOwnershipRegistry`; future mount or helper rewards should use their actual domain ownership/relationship mechanisms once those are ready.

## Paid work and player income

For now, work orders and small jobs remain normal quests. There is no need for a separate `JobManager` merely because a quest is economic.

Coins already use the shared inventory/economy mechanisms. Early paid quests should provide useful ways to earn money through existing activities such as gathering, scouting, hunting and assistance. Later world-driven jobs can connect payment to real household/settlement needs and budgets when those systems justify it.

## Current implementation path

The current near-term path is intentionally short and gameplay-oriented:

1. `quests-progression-001` — **Reputation & Renown Foundation**
2. `quests-progression-002` — **Quest Outcomes, Rewards & Consequences**
3. `quests-progression-003` — **Paid Quests & Player Income**
4. `quests-progression-004` — **Quest Availability & Prerequisites**
5. `quests-progression-005` — **Authored RPG Quests**

The sequence is deliberate:

```text
reputation foundation
→ meaningful outcomes and consequences
→ useful player income
→ lightweight RPG prerequisites
→ authored stories, choices and significant rewards
```

`quests-progression-004` is intentionally a small bridge between the quest foundation and authored RPG content. It should provide only the prerequisites needed by real quests rather than becoming a generic condition engine.

`quests-progression-005` should prioritize playable content over more infrastructure. It introduces the first substantial authored RPG stories and adds a significant non-monetary/domain reward only where an existing domain mechanism can support it cleanly.

### Reassessment checkpoint

After `quests-progression-005`, stop extending the roadmap mechanically and reassess the implemented gameplay.

The next useful step may be:

- more authored content,
- world-driven quests,
- broader domain-backed rewards,
- or another gap revealed by actual play.

Do not assume that the next step must be more quest infrastructure. In particular, do not pre-plan generic quest-chain engines, condition DSLs, witness/gossip systems, procedural generators or advanced consequence frameworks unless implemented gameplay demonstrates a concrete need.

## Later direction

The following remain valid longer-term directions, but they are not the current committed implementation sequence.

### World-driven quests

Increasingly expose real simulation problems as opportunities:

- household and settlement problems,
- shortages and logistics,
- threats and lost livestock,
- fauna/ecosystem events,
- opportunities that may evolve or resolve without the player,
- consequences that feed back into the underlying simulation.

### Advanced domain-backed consequences

Larger RPG or emergent quests may eventually produce outcomes such as:

- house/property ownership,
- mounts,
- persistent helpers/followers,
- settlement privileges,
- access to services or restricted places,
- wider regional/world reputation and renown for exceptional events.

These are directions, not promises that quest infrastructure should implement them in advance. Each requires the relevant domain system to own the real state first.

## Planning rule

Each step should be implemented through focused plans based on actual current code.

Before each implementation:

1. verify current code,
2. check relevant completed/in-progress plans and implementation notes,
3. identify the system that owns each affected state,
4. extend existing mechanisms rather than creating parallel managers,
5. keep world behavior independent from the player.

After the current `001–005` sequence, prefer reassessing gameplay before creating further quest plans.

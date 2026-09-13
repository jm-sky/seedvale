# Plan: Archetype-aware cave story and loot anchors

**Created:** 2026-09-13
**Status:** `implemented` ✅
**Type:** feature
**Priority:** medium · **Effort:** M
**Model:** Opus, Sonnet
**Depends on:** ~~world-terrain-020~~, ~~world-terrain-024~~, ~~world-terrain-025~~
**Domain:** `world-terrain`
**Subdomains:** `terrain` `landmarks`
**Tags:** `caves` `content-anchors` `loot` `quests`
**Roadmap:** -

## Goal

Extend the cave-owned semantic placement contract so `natural`, `adventure` and `dungeon` caves can host persistent story evidence and loot without quest code inventing underground coordinates.

Also replace the current unconditional two-chest materialization for every `adventure` cave with one shared deterministic content-profile contract.

Current production facts:

- `adventure` caves expose `sideTreasure` / `finalTreasure` and prop anchors;
- `caveTreasureContainerSpecs()` currently turns both treasure anchors into generic chests for every adventure cave;
- `natural` caves currently expose no content anchors;
- `dungeon` caves have stable chamber semantics but no final safe placement contract yet.

Anchors are deterministic placement slots. They must not imply that loot is automatically present.

## Existing authority to preserve

Reuse/extend:

- `src/world/caves/caveContentAnchors.ts`;
- `src/world/caves/caveHeightfieldPlacement.ts`;
- `src/world/caves/dungeonChambers.ts`;
- `src/world/caves/productionTopology.ts`;
- `src/world/createCaves.ts` / `Caves.contentAnchorsOf()`;
- `src/world/caves/caveRng.ts` / `createCaveRandom()`;
- retained `CaveHeightfieldRepresentation`;
- `src/app/worldBundle.ts::caveTreasureContainerSpecs()` as the current materialization seam.

Do not use surface height, topology-node Y, mesh raycasts, player/camera state, streamed presentation state or quest-owned copied coordinates.

## Shared anchor vocabulary

Keep existing adventure roles/ids stable:

```text
sideTreasure
finalTreasure
wagon
support
crate
lantern
```

Add only the shared roles needed by new stories:

```text
storyFind
loot
```

`storyFind` = safe location for narrative evidence/props.

`loot` = safe location for a compact authored container/cache that is not semantically the cave's final treasure.

For repeated new roles, stable identity should derive from:

```text
caveId + role + sourceNodeId
```

Add `sourceNodeId?: string` or equivalent stable semantic source metadata. Preserve existing adventure ids.

## Adventure cave content profiles

Introduce one derived content profile for each accepted `adventure` cave. Exact type names may differ, but semantics are fixed:

```text
EMPTY
QUEST_TREASURE
DOUBLE_TREASURE
```

### A. `EMPTY` — standard

This is the normal adventure cave.

- no automatic generic chest at `sideTreasure`;
- no automatic generic chest at `finalTreasure`;
- anchors still exist and can be claimed by authored stories;
- intended pool for future adventure-cave quests such as `quests-progression-025`.

An empty adventure cave is valid generated world space, not failed content generation.

### B. `QUEST_TREASURE` — authored single treasure

Reserved profile used by `quests-progression-008`.

- resolved before any generic loot roll;
- exactly one authored treasure placement, at the real `finalTreasure` anchor;
- no generic `caveSide` chest;
- no generic `caveFinal` loot;
- `sideTreasure` remains unused by this profile;
- the story owns the actual payload/lifecycle, while cave/world composition owns the stable cave/profile/anchor binding.

The physical treasure must exist independently of quest acceptance or current quest stage.

The shared world layer must not know bear quest stages. Use a stable reservation key/profile request rather than quest-specific branching in cave generation.

### C. `DOUBLE_TREASURE` — standalone exploration encounter

Preserve today's two-chest experience as a rarer systemic encounter:

```text
sideTreasure  → generic caveSide chest
finalTreasure → generic caveFinal chest
```

This is effectively a small no-story exploration quest that may be expanded later.

For **unreserved** adventure caves:

```text
80% EMPTY
20% DOUBLE_TREASURE
```

Use a new dedicated `CAVE_RNG_SALT` stream for this profile roll. Do not reuse `adventureContent`, because changing loot/profile decisions must not perturb anchor placement.

## Reservation / arbitration order

Authored reservations win before the 80/20 generic roll:

```text
accepted adventure caves
→ deterministic authored reservation/claim arbitration
→ apply reserved profile(s)
→ roll EMPTY vs DOUBLE_TREASURE only for remaining caves
→ materialize allowed content
```

Requirements:

- stable reservation keys and cave/anchor ids;
- deterministic reconstruction on rebuild/load;
- no persisted claim set;
- a reserved cave never later becomes `DOUBLE_TREASURE`;
- two authored systems cannot silently claim the same cave/anchor;
- if a required authored reservation cannot be satisfied, omit/fail that authored binding explicitly rather than sharing conflicting content, forcing coordinates or duplicating loot.

Known consumers:

- `quests-progression-008` → one `QUEST_TREASURE` adventure cave, owns `finalTreasure`;
- `quests-progression-025` → a **different** `EMPTY` adventure cave, then claims one available story/treasure anchor.

## Materialization contract

Refactor `caveTreasureContainerSpecs()` (or replace it with the smallest equivalent shared helper) so it consumes the resolved content profile instead of blindly materializing all treasure anchors.

Required result:

```text
EMPTY
→ zero generic cave treasure containers

QUEST_TREASURE
→ zero generic caveSide/caveFinal containers
→ expose/reserve exactly finalTreasure for authored story content

DOUBLE_TREASURE
→ materialize sideTreasure + finalTreasure exactly as today
```

Do not remove anchors for `EMPTY` or `QUEST_TREASURE`; they remain deterministic placement opportunities.

Mutable container state stays in `WorldGeneratedContainers` or the owning portable-container system.

## Natural cave anchors

For every accepted `natural` cave derive anchors from stable natural topology nodes.

Required V1:

- main `chamber`: one required `storyFind` + one required `loot`;
- optional `branch-chamber`: optional `storyFind` + optional `loot`.

Do not change natural topology/acceptance merely to force placement.

This supports:

- `quests-progression-023` — lost hunter;
- `quests-progression-024` — `suspicious-transport` natural-cave cache variant.

## Dungeon cave anchors

Use `Caves.dungeonChambersOf()` semantics and retained cave heightfield placement.

Required V1:

- usable non-entrance chamber: `storyFind` and `loot` where safe;
- each `side` chamber: `sideTreasure` where safe;
- `deep` chamber: at least one usable `loot`;
- `final` chamber: one required `finalTreasure`.

This supports coexistence:

```text
quests-progression-026
→ side/deep bandit caches

quests-progression-027
→ storyFind trail + finalTreasure
```

Do not use chamber centres directly as final placement coordinates.

## Placement rules

Reuse bounded deterministic candidate search and heightfield footprint/clearance checks.

Required:

- floor Y from retained cave heightfield;
- bounded candidate count;
- deterministic same seed/cave result;
- no overlap between anchors sharing one chamber/node;
- avoid mandatory through-lines/doorways;
- optional anchors fail closed;
- required final dungeon treasure failure makes the cave ineligible for authored content requiring it — never invent coordinates.

## Public contract

Keep `Caves.contentAnchors()` / `contentAnchorsOf(caveId)` as the shared placement lookup.

Expose resolved adventure profile/reservation information through a read-only world/composition seam where consumers need it. Do not make quests infer the profile from whether a chest currently exists.

`Caves.dungeonChambersOf()` remains chamber-classification authority.

## Ownership / persistence

Derived, do not serialize:

- cave anchors/XYZ;
- source node ids as copied quest coordinates;
- adventure content profiles;
- profile RNG state;
- authored cave/anchor claim sets;
- dungeon chamber arrays.

Persist only mutable world content through its owning system.

## Integration targets

- `src/world/caves/caveContentAnchors.ts`;
- `src/world/caves/caveHeightfieldPlacement.ts`;
- `src/world/caves/caveRng.ts`;
- `src/world/caves/dungeonChambers.ts`;
- `src/world/caves/productionTopology.ts`;
- `src/world/caves/dungeonTopology.ts`;
- `src/world/createCaves.ts`;
- `src/app/worldBundle.ts::caveTreasureContainerSpecs()`;
- `src/app/worldBundle.caveTreasure.test.ts`;
- contextual/occupied content composition patterns in `src/app/createApp.ts` where useful.

Add JSDoc for important shared/public additions with `@domain world-terrain` where useful.

## Verification

Automated tests should cover:

- existing adventure anchor ids remain stable;
- `EMPTY` keeps anchors but creates zero generic treasure chests;
- `DOUBLE_TREASURE` creates exactly current side + final chests and existing loot tiers;
- unreserved profile decision is deterministic with exact 80/20 threshold;
- profile roll uses its own RNG stream;
- authored reservation overrides generic profile roll;
- `QUEST_TREASURE` reserves only final authored treasure placement and creates no generic cave loot;
- conflicting authored claims fail explicitly;
- profile/claims reconstruct without save fields;
- natural main anchors exist and optional branch anchors follow branch availability;
- dungeon anchors map to stable chamber/source identities;
- dungeon final chamber has one stable `finalTreasure`;
- same-chamber anchors do not overlap;
- underground Y comes from retained cave heightfield;
- no placement depends on presentation streaming or player/camera state.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
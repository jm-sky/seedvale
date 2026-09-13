# Implementation notes: world-terrain-028 archetype-aware cave story and loot anchors

**Reviewed:** 2026-09-13  
**Plan:** `docs/plans/world-terrain-028-archetype-aware-cave-story-and-loot-anchors.md`  
**Baseline:** `main` at `2edf2022d870b0c9610346eabc70ae830e171f4a`

## Main recon findings

Current cave geometry already has the right ownership boundary: topology + retained heightfield are built before presentation, and `resolveCaveContentAnchors()` runs before interior-rock placement. Extend that seam; do not add quest-side placement or another cave geometry representation.

Important current-state differences from the plan:

- `resolveCaveContentAnchors()` is adventure-only; natural/dungeon return `[]`.
- existing adventure anchor ids are also `WorldGeneratedContainer` ids, so changing them can orphan persisted chest state.
- `pickCandidate(..., required=true)` currently falls back to the first merely-underground sample when no candidate passes full clearance/footprint checks. That legacy fallback is not acceptable for new fail-closed dungeon/natural anchors.
- dungeon pool deformation is already finalized before anchor resolution, and the pool may occupy `regular`, `side`, `deep` or `final` chambers.
- once dungeon gains `sideTreasure` / `finalTreasure`, the current `caveTreasureContainerSpecs()` would accidentally materialize generic adventure loot there unless materialization becomes profile/archetype-aware in the same change.

## Anchor implementation

Keep the existing adventure resolver and its `CAVE_RNG_SALT.adventureContent` draw order as stable as possible. Prefer archetype-specific resolver branches/helpers rather than rewriting all placement through one new algorithm.

Add `storyFind` / `loot` placement specs and `sourceNodeId?: string` to `CaveContentAnchor`. For topology-derived new anchors, ids should be semantic, not ordinal:

```text
${caveId}:${role}:${sourceNodeId}
```

Examples: `...:loot:chamber`, `...:storyFind:branch-chamber`, `...:loot:dungeon-deep-chamber`. Dungeon `sideTreasure` is repeated across side chambers, so it also needs the source node in its id. Preserve all existing adventure ids exactly, including ordinal support/crate/lantern ids.

Natural topology already has stable node ids `chamber` and optional `branch-chamber`; use those directly. Do not inspect `nodes[]` by position and do not alter `BRANCH_CHANCE`, natural RNG consumption or topology acceptance.

For dungeon classification call `dungeonChambersFromTopology()` inside the resolver and then resolve the matching topology node by `nodeId`. `Caves.dungeonChambersOf()` should continue exposing the same semantic view publicly; do not duplicate class inference.

### Strict placement for new anchors

Do not reuse the current `required=true` fallback for new anchors. Smallest-risk option is a strict candidate helper/policy that returns `null` unless the normal candidate passes all heightfield, footprint, clearance and through-line checks; leave legacy adventure fallback behaviour untouched unless tests prove it can be removed without moving existing anchors.

Treat “required” as content eligibility, not cave-topology acceptance:

- missing natural main `storyFind`/`loot` does not delete/re-roll the natural cave; authored consumers simply cannot select it;
- missing dungeon `finalTreasure` does not reclassify/delete the dungeon; consumers requiring final treasure must reject that cave binding.

This keeps cave generation independent from later stories.

### Collision and doorway rules

`placeAtNode()` currently validates cave geometry but does not generally prevent overlap with anchors already placed in the same chamber. Add a local accepted-anchor exclusion using placement footprint radii (sum of both footprints plus a small fixed margin), keyed/scoped by `sourceNodeId` where practical.

Use a fixed semantic placement order. For dungeon, place `finalTreasure` before optional final-room story/loot anchors, and place required deep `loot` before optional deep content. New `storyFind`/`loot` should keep clear of the chamber through-line/door approach.

Avoid changing the existing adventure `sideTreasure`/`finalTreasure` placement constants solely to enforce new dungeon doorway rules, because that can move current adventure anchors. If needed, allow a strict/new-archetype placement-policy override while keeping the public footprint radius available to `caveInteriorRocks.ts`.

`caveInteriorRocks.ts` already avoids `contentAnchors` using `CAVE_CONTENT_PLACEMENT` footprints, so adding the new roles to that map is sufficient; do not add a second rock-exclusion system.

## Dungeon pool interaction

`createCaves()` currently does:

```text
buildDungeonHeightfieldWithPool()
→ finalized heightfield + CaveUndergroundPool
→ resolveCaveContentAnchors()
```

Thread the already-resolved `CaveUndergroundPool | null` (or equivalent narrow exclusion data) into content resolution. Do not re-roll/reselect the pool.

For candidates in `pool.chamberNodeId`, reject wet/unsafe positions against the authoritative pool footprint/water level, not only the node centre. This matters especially for `deep`, `side` and `final`, all of which can host the current pool. A required final treasure must resolve to a dry valid point or be absent/fail closed.

## Adventure profiles and authored arbitration

Profiles/claims are world-content composition policy, not cave geometry. Keep `CaveRuntime` authoritative for archetype/topology/anchors and put profile/claim resolution in a small pure composition module/service, exposed read-only through `WorldBundle` (or an equivalent world-composition seam).

The resolver should consume stable accepted cave ids/archetypes/anchors plus declarative authored reservation requests and return:

- `profileOf(caveId)` for adventure caves;
- resolved reservation/claim binding by stable reservation key;
- explicit unresolved/conflict result when a request cannot be satisfied.

No save fields or mutable global claim registry.

Process authored requests in one deterministic order, claim concrete anchor ids, then roll only unreserved adventure caves:

```ts
createCaveRandom(caveId, CAVE_RNG_SALT.adventureContentProfile)() < 0.20
  ? 'DOUBLE_TREASURE'
  : 'EMPTY'
```

Use a new salt; never consume `adventureContent`. If node-specific placement randomness is needed for the new natural/dungeon anchors, use another independent salt rather than extending the legacy adventure stream.

Do not make `bindExactCaveQuests()` the selector/arbitrator; it currently decorates already-resolved cave context.

Do not activate a live `QUEST_TREASURE` reservation for a planned quest unless its authored world treasure is materialized in the same implementation. Otherwise `world-terrain-028` would deliberately suppress generic treasure but leave a reserved empty cave. The shared resolver can be implemented/tested now with fabricated reservation requests; follow-up quest plans should submit their real requests when their world content lands.

Dungeon stories `quests-progression-026` and `027` intentionally may share one cave, so arbitration must be anchor-level rather than globally “one story per cave”. Adventure profile reservations are the exception: `quests-progression-008` and `025` require distinct caves/profiles.

## Materialization / persistence

Make `caveTreasureContainerSpecs()` consume resolved adventure profile information and materialize generic side/final chests **only** for `DOUBLE_TREASURE`. Undefined/non-adventure profile must produce no generic cave treasure, even when a dungeon exposes roles named `sideTreasure` / `finalTreasure`.

For `DOUBLE_TREASURE`, preserve exactly the current:

- anchor/container ids;
- explicit underground `y` and cave `WorldSpatialContext`;
- `caveSide` / `caveFinal` loot profiles.

`WorldGeneratedContainers` remains mutable inventory authority. Its restore path only restores saved rows for currently supplied specs; therefore pre-028 save rows for a cave that deterministically becomes `EMPTY` will disappear from the live container set and from the next save. Do not infer profile from saved container presence, because that would make a derived world decision save-dependent. If backward content migration is required, handle it explicitly rather than contaminating the profile resolver.

If the resolved profile/claim service is stored on `WorldBundle`, remember that rebuild mutates bundle fields in place. Replace/recompute that field together with `caves`/`worldGeneratedContainers`; long-lived callers must read `bundle.<field>` live rather than capture the old instance.

## Highest-value tests

Extend the focused cave suites rather than adding broad integration fixtures:

- `caveContentAnchors.test.ts`: legacy adventure ids/placements unchanged; natural main/branch source ids; strict failure does not emit unsafe fallback; same-node footprints do not overlap.
- dungeon anchor tests: semantic chamber mapping, repeated side ids use `sourceNodeId`, deep loot exists when fit, final treasure is unique/strict, pool footprint is avoided.
- profile resolver tests: exact 20% threshold, own RNG salt, deterministic request ordering, reservation overrides roll, duplicate anchor claim fails explicitly, unresolved request does not steal another binding.
- `worldBundle.caveTreasure.test.ts`: `EMPTY=0`, `QUEST_TREASURE=0`, `DOUBLE_TREASURE=2` with unchanged ids/loot; dungeon `sideTreasure`/`finalTreasure` never trigger generic adventure chests.
- rebuild test at the narrowest existing seam: same seed + same reservation requests reconstruct the same profiles/claims without save data.

No browser verification in this implementation; manual browser verification remains the User's responsibility.

## Suggested implementation order

1. Add new anchor role/source-id contract and strict placement path without changing adventure outputs.
2. Add natural anchors.
3. Add pool-aware dungeon anchors and collision checks.
4. Add dedicated profile RNG salt + pure reservation/profile resolver.
5. Refactor generic cave treasure materialization to require `DOUBLE_TREASURE`.
6. Expose the read-only composition result and wire rebuild lifecycle.
7. Add focused regression tests, then update current-state docs after code reflects reality.

## Model recommendation

**Model:** Opus, Sonnet

The code change is moderate in size but regression-sensitive: existing persisted adventure ids, deterministic RNG streams, dungeon pool geometry and cross-story claim arbitration all meet at the same composition seam. Opus is the safest primary choice; with these boundaries/tests, Sonnet is the cheaper fallback with limited added risk.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
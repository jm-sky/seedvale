# Implementation Notes: settlements-npcs-039 — Social and Paid Settlement Lodging

**Plan:** `settlements-npcs-039-social-and-paid-settlement-lodging.md`  
**Status:** `verification needed` 🔍

## 1. Current baseline

Current lodging implementation is already centralized and mostly pure:

```text
restActions.ts
  collectNearbyLodgingOptions()
        ↓
lodgingResolver.ts
  settlementLodgingInput()
  collectLodgingCandidates()
        ↓
lodging.ts
  LodgingOption + labels/quality/payment helpers
```

`restActions.ts` owns the action lifecycle (panel → optional payment confirm → walk → arrival → sleep). Keep it that way. This plan should primarily change candidate construction and labels.

## 2. Current bug source

`src/settlement/lodgingResolver.ts::collectBedCandidates()` currently emits one high-quality anonymous `bed` option for every `settlement.houses[i].bed`.

That means furnished houses become publicly available lodging independent of NPC relation or provider semantics.

`dedupeByPhysicalPlace()` is not broken: it intentionally dedupes only candidates sharing the same `placeId`. Distinct houses keep distinct options, but `lodgingChoiceLabel()` renders them identically, producing the visible repeated rows.

Plan 039 intentionally supersedes the anonymous-bed behavior rather than adding label-level dedupe.

## 3. Existing social contract

`src/quests/quests.ts` owns:

```ts
RelationLevel = 'stranger' | 'acquainted' | 'friendly' | 'trusted'
```

with centralized thresholds. Do not add lodging-specific numeric relation thresholds.

`src/ai/reactionChance.ts::PlayerSocialLookup` already returns `relationLevel` for `(npcId, settlementId)` and is already threaded into `collectLodgingCandidates()` through `LodgingCandidateContext`.

Use only this existing lookup for free-lodging eligibility/quality.

Target mapping:

```text
stranger    → no free offer
acquainted  → no free offer
friendly    → quality normal
trusted     → quality high
```

## 4. Narrow resolver input

Current `LodgingSettlementInput.npcs` contains:

```ts
{ id, name, household }
```

`settlementLodgingInput()` receives live `Settlement`, so add only the existing NPC role needed for paid guard selection:

```ts
{ id, name, role, household }
```

`NpcAgent.role` is already typed from `src/ai/characters.ts::Role`, whose union includes `guard`.

Do not pass `NpcAgent` itself into the pure resolver.

## 5. Friend/free lodging should resolve to the physical bed

Current `collectFriendCandidates()` resolves household home index but anchors the option on the house center and uses `facing: null`, even when the home has a real bed.

039 should instead require `house.bed` and populate:

```text
position      = house.bed.position
approachPoint = house.bed.approach
facing        = house.bed.facing
placeId       = existing housePlaceId(settlementId, houseIndex)
```

This preserves the existing physical walk/sleep behavior and makes the bed the resource backing the social offer.

A household home without a physical bed yields no free friend offer in this plan.

## 6. Representative NPC per physical home

Do not use the current first-eligible iteration behavior plus `seenHouseholds`; that makes the displayed provider depend on NPC source order and ignores that two household members may have different relation levels.

For each resolvable physical `placeId` with a bed:

1. evaluate all household NPCs that map to that place,
2. discard relation below `friendly`,
3. rank `trusted > friendly`,
4. tie-break by stable `npc.id`,
5. emit exactly one free `friend` option.

A small pure helper local to `lodgingResolver.ts` is appropriate if it keeps ranking testable/readable. Do not add state to `Household`.

Use `placeId` as final collision identity even if household grouping is convenient during collection.

## 7. Anonymous `bed` candidates

`collectBedCandidates()` is the main obsolete behavior.

Preferred implementation direction:

- stop calling/removing it from public settlement candidate collection,
- remove it entirely if no non-test caller needs it,
- update priority/comments/tests accordingly.

Check all `LodgingType: 'bed'` call sites before deleting the union member. If removing `bed` would create unrelated churn, keeping the type temporarily is acceptable, but `collectLodgingCandidates()` must not emit anonymous bed rows.

The important contract is behavioral, not forced type cleanup.

## 8. Paid guard offer

`collectPaidCandidates()` currently exists and returns `[]`; this is the intended seam.

Implement V1 there using existing resolver input:

1. collect physical beds from `settlement.houses` with their stable house index/placeId,
2. if none, return `[]`,
3. select one guard deterministically by stable `npc.id`,
4. select one bed deterministically by stable house index/placeId,
5. create one `paid` `LodgingOption`:
   - `ownerName = guard.name`,
   - `price = 2`,
   - `quality = 'normal'`,
   - physical position/approach/facing from the chosen bed,
   - `placeId` set to the chosen bed's existing house place id.

The guard does **not** need to own the chosen bed. This is an explicit V1 decision: no private/public bed model yet.

Put price in one named constant in the lodging domain/resolver, not in UI text. Example naming may vary; avoid exporting it unless tests/other code genuinely need it.

## 9. Paid/free collision

Because paid lodging now has a real `placeId`, the existing `dedupeByPhysicalPlace()` can enforce same-bed collision if priority is corrected.

Current priority is:

```text
owned_house > bed > friend > paid > hay
```

Anonymous `bed` must no longer outrank social lodging. Once anonymous beds stop being emitted, the relevant order should effectively be:

```text
owned_house > friend > paid > hay
```

Within `friend`, `high` already beats `normal` through `QUALITY_RANK`.

Therefore if the deterministic paid bed is the same physical place as a free friend/trusted bed, `dedupeByPhysicalPlace()` should retain the free offer automatically.

Do not add a special-case paid-vs-friend filter in `restActions.ts`.

## 10. Provider ids and revalidation

`restActions.ts` re-collects fresh candidate arrays and revalidates selection by `option.id`.

Candidate ids must therefore be deterministic from stable input.

Current friend id is household-based:

```text
${settlement.id}:friend:${household.id}
```

This is suitable if exactly one social offer per household/home remains guaranteed.

Paid id should likewise be stable and settlement-scoped. Avoid embedding incidental array positions of guards unless they are canonical; use selected stable guard id and/or selected place id as appropriate.

Changing relation/provider after the panel opened should cause normal stale-option invalidation or revalidation through existing collection rather than introducing cached availability.

## 11. Labels

`src/settlement/lodging.ts` currently owns both type names and quality names.

Replace quality display values only; keep internal `LodgingQuality` values unchanged:

```text
high   → Komfortowo
normal → Dość wygodnie
low    → Niewygodnie
```

Current `lodgingChoiceLabel()` only shows either price or quality for paid lodging. 039 needs paid rows to include both.

Target semantic output:

```text
free friend: provider + comfort
paid guard: provider + price + comfort
hay: place + comfort
owned house: place + comfort
```

Keep formatting in `lodging.ts`; do not teach Vue about lodging types.

Use nominative-safe provider formatting. User explicitly does not want a name-declension system. A compact form such as `U Marek — Komfortowo` is acceptable even if grammatically imperfect; an implementation may choose a better nominative-safe separator such as `Nocleg — Marek — Komfortowo` while preserving the requested information structure.

## 12. Coin/payment path already exists

Do not implement payment inside resolver or label code.

`lodgingRequiresPayment(option)` already gates `type === 'paid' && price > 0`.

`restActions.ts` already opens the confirmation panel and charges through its existing coin path before arming movement. Verify this behavior with existing tests; only add a regression test if current paid path coverage does not prove it.

No economy registry mutation is required for V1: price is a player cost, not guard income simulation in this plan.

## 13. Ordering vs dedupe

`dedupeByPhysicalPlace()` currently returns map insertion order plus non-place options. Do not rely on incidental candidate construction order for choosing representative NPC/provider/bed.

Make the selection itself deterministic before constructing options.

The panel does not currently require a new explicit sort unless gameplay testing shows unstable/undesirable ordering. Keep this plan scoped to correct candidate identity/availability first.

## 14. Tests to rewrite, not merely extend

`src/settlement/lodgingResolver.test.ts` contains tests that encode the old behavior:

- `produces a high-quality bed candidate for a house with a bed`,
- `a bed beats a friendly NPC in the same settlement`,
- multiple-source test expecting `['bed', 'friend', 'hay']`,
- same-house test expecting `type: 'bed'` to win.

These assertions must be removed/replaced because the desired behavior intentionally changes.

Also update test helpers so mock NPC input includes `role` after the narrow contract expands.

Add order-independence tests by reversing NPC arrays and asserting the same provider/option.

## 15. Suggested implementation order

1. Extend `LodgingSettlementInput.npcs` with `role` and adjust tests.
2. Make friend lodging require/use physical beds and select one provider per place by relation/id.
3. Stop emitting anonymous bed candidates and repair priorities/tests.
4. Implement deterministic guard paid offer over any physical bed.
5. Ensure paid/free same-place dedupe falls out of existing `placeId` policy.
6. Update label/quality formatting in `lodging.ts` and add direct label tests if practical.
7. Run focused tests, then full checks.
8. Update `docs/state/player-systems.md` to remove the old `bed > friend > paid > hay` public-candidate description and document social/paid semantics.

## 16. Files likely touched

Primary:

- `src/settlement/lodgingResolver.ts`
- `src/settlement/lodging.ts`
- `src/settlement/lodgingResolver.test.ts`

Potentially:

- a dedicated `lodging.test.ts` if label functions deserve isolated coverage,
- `docs/state/player-systems.md` after implementation.

Avoid unrelated changes to:

- Vue quick-actions screens,
- `QuestManager`,
- household persistence,
- profession staffing,
- bed/furniture placement,
- save schemas.

## 17. Important architecture invariants

- `LodgingOption` remains derived, not persisted.
- `Household.homeId` and house `placeId` remain canonical physical/social linkage.
- Physical bed coordinates remain owned by settlement furniture/landmarks.
- Social eligibility comes from `PlayerSocialLookup`, not from copied relation state.
- Role comes from existing `NpcAgent.role` / `Role`.
- Paid charge/confirmation stays in `restActions.ts`.
- Fresh re-collection stays the stale-state protection mechanism.
- Player/camera observation must not affect availability.

## 18. JSDoc/preflight

If provider-selection or paid-bed-selection becomes a named architectural helper, document the invariant and add `@domain settlements-npcs` where useful.

Avoid JSDoc for trivial local formatters or obvious ranking arrays.

## 19. Verification

Implementation agent runs automated checks only:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Browser/manual verification is explicitly left to the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Plan: Social and Paid Settlement Lodging

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** fix
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `settlements-npcs`
**Subdomains:** `household` `social` `economy`
**Tags:** `gameplay` `ui` `economy` `lodging`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Make `Nocuj w mieście` show concrete lodging offers tied to NPCs and existing social/economic state instead of anonymous duplicate beds.

Target shape:

```text
U Marka — Komfortowo
U Kasi — Dość wygodnie
Nocleg u strażnika: Tomek — 2 monety — Dość wygodnie
Stóg siana — Niewygodnie
```

Names remain in nominative form; do not introduce Polish name inflection.

## Current problem

Current `src/settlement/lodgingResolver.ts` creates one anonymous `bed` candidate for every physical settlement bed. The existing `placeId` dedupe only collapses multiple internal representations of the same physical place; distinct houses therefore produce multiple visually identical rows such as `Łóżko — Wysoka jakość`.

This also gives the player implicit access to every furnished house merely because a bed exists.

## Existing mechanisms to reuse

Extend the existing lodging flow rather than creating a parallel system:

- `src/settlement/lodging.ts`
  - `LodgingOption`
  - `LodgingQuality`
  - `lodgingChoiceLabel()`
  - `lodgingRequiresPayment()`
  - `lodgingRestQuality()`
- `src/settlement/lodgingResolver.ts`
  - `settlementLodgingInput()`
  - `collectFriendCandidates()`
  - currently empty `collectPaidCandidates()`
  - `dedupeByPhysicalPlace()`
  - `selectLodgingFromCandidates()`
- `src/quests/quests.ts`
  - existing `RelationLevel = stranger | acquainted | friendly | trusted`
- `src/ai/reactionChance.ts`
  - existing `PlayerSocialLookup`
- `src/ai/characters.ts`
  - existing `Role`, including `guard`
- `Household.homeId` / `homeIndexFromPlaceId()`
- `SettlementHouseBed` physical bed position/approach/facing
- existing paid-lodging confirmation and coin-consumption path in `restActions.ts`.

No new relationship, household, profession, payment, or lodging UI subsystem.

## 1. Physical bed is a resource, not an automatic offer

Remove the current semantic:

```text
house has bed
→ public anonymous bed option
```

A physical bed supplies the actual sleep position/approach/facing. An offer is created only by an eligible social or paid provider.

Do not show anonymous `bed` options solely because a furnished house exists.

## 2. Free lodging from relationship

An NPC can provide free lodging when:

- it belongs to a household,
- its `Household.homeId` resolves to a settlement house,
- that house has a physical bed,
- the player's existing relation with that NPC is at least `friendly`.

Map existing relation level to existing lodging quality:

| Relation | Offer | Lodging quality | UI |
| --- | --- | --- | --- |
| `stranger` | no | - | - |
| `acquainted` | no | - | - |
| `friendly` | yes | `normal` | `Dość wygodnie` |
| `trusted` | yes | `high` | `Komfortowo` |

Do not create another numeric comfort/relation scale.

## 3. One free offer per physical home

Several NPCs can share one household/home. The player must not see the same bed/home twice.

For every physical `placeId`:

1. choose the eligible NPC with the highest `RelationLevel`,
2. break equal-relation ties deterministically by stable `npc.id`,
3. create one free lodging option for that physical place.

`placeId` remains the authoritative identity of the physical lodging place. `householdId` may be used while collecting candidates, but must not become a second physical-place identity system.

Do not dedupe by label or NPC name.

## 4. Paid lodging from a guard

Use an existing NPC with `role === 'guard'` as the temporary V1 equivalent of an innkeeper/inn.

A qualifying guard provides one paid lodging offer for the settlement:

- price: **2 coins**,
- quality: `normal` → **Dość wygodnie**,
- provider name: guard NPC name.

Keep the price as one named domain constant in the lodging resolver/domain layer. Populate normal `LodgingOption.price`; do not encode price in Vue or in label-only logic.

### V1 bed allocation decision

Do **not** model private/public beds yet.

The guard-paid offer may use **any available physical settlement bed**. Select the bed deterministically; prefer a stable rule such as lowest stable house index / `placeId` among available beds unless current code provides a more appropriate deterministic choice.

The paid provider and physical bed therefore do not need to belong to the same household.

This is intentionally temporary: a future real inn/innkeeper can replace the provider/bed policy through the same `LodgingOption` contract.

If there is no physical bed in the settlement, do not fabricate a paid guard offer.

If multiple guards exist, select one provider deterministically by stable `npc.id` for V1; do not show one paid row per guard.

## 5. Free offer beats paid offer for the same physical place

If the chosen paid bed is also available to the player through a free relationship offer, keep only the free option for that `placeId`.

Required effective priority for colliding offers:

1. `owned_house`
2. free friend/trusted lodging
3. paid guard lodging
4. hay

Within free social lodging, `trusted/high` beats `friendly/normal` before the stable id tie-break.

Update the existing lodging priority/dedupe policy so an obsolete anonymous `bed` class cannot outrank the social offer.

If retaining `LodgingType = 'bed'` is useful for compatibility elsewhere, it must no longer be emitted as a public settlement candidate by this resolver. Prefer removing dead semantics if current call sites/tests show it is safe.

## 6. Display labels

Change quality labels to:

```text
high   → Komfortowo
normal → Dość wygodnie
low    → Niewygodnie
```

Preferred rows:

```text
U Marek — Komfortowo
U Kasia — Dość wygodnie
Nocleg u strażnika: Tomek — 2 monety — Dość wygodnie
Stóg siana — Niewygodnie
Własna chata — Komfortowo
```

The exact friend prefix may be polished during implementation (`U Marek` vs another nominative-safe form), but do not add grammatical name inflection. The essential requirement is that each row identifies the provider and comfort clearly without duplicate anonymous bed rows.

For paid lodging, show both price and quality in the choice row. Keep `lodgingChoiceLabel()` as the presentation owner; Vue only renders the provided action label.

Use natural Polish pluralization for `moneta/monety/monet` if an existing coin formatter already exists and is appropriate; otherwise a local minimal formatter is acceptable. Do not create a global localization framework for this plan.

## 7. LodgingSettlementInput

Extend the narrow Three.js-free NPC input only with data the resolver actually needs, notably existing `role` in addition to `id`, `name`, and `household`.

Do not pass whole `NpcAgent` instances into the pure resolver.

Continue to obtain relationship state through `PlayerSocialLookup`.

## 8. Revalidation and payment remain unchanged

`restActions.ts` already:

- collects lodging options fresh,
- revalidates selected options against current authoritative state,
- confirms paid lodging before charging,
- uses the existing coin-removal path,
- walks to `approachPoint`,
- starts sleep only on arrival.

Preserve this architecture. The plan changes which `LodgingOption`s exist and how they are labelled, not the action lifecycle.

A changing relation/provider/bed must therefore naturally invalidate a stale panel option through the existing fresh candidate re-collection.

## 9. Hay and owned house

Keep existing fallback/ownership semantics:

- hay remains `low` and displays `Stóg siana — Niewygodnie`,
- completed player-owned house remains high-quality and does not depend on NPC relation,
- direct hay `[E]` and owned-house `[E]` continue through the same existing lodging commit/revalidation paths.

## 10. Determinism

All provider and bed selection must be deterministic.

No random selection for:

- representative NPC of one shared home,
- paid guard provider,
- paid lodging bed.

Use stable existing identifiers/indexes so the same world/social state produces the same panel independent of array incidental ordering.

## 11. Expected files

Primary:

- `src/settlement/lodging.ts`
- `src/settlement/lodgingResolver.ts`
- `src/settlement/lodgingResolver.test.ts`

Likely documentation update after implementation:

- `docs/state/player-systems.md`

`src/app/actions/restActions.ts` should require no structural redesign and ideally no changes beyond any type/import adjustment caused by the cleaned lodging contract.

## 12. Tests

Add/replace focused pure tests for:

1. anonymous physical beds no longer create standalone public options,
2. `stranger` + household bed → no free lodging,
3. `acquainted` + household bed → no free lodging,
4. `friendly` + household bed → one `normal` free offer,
5. `trusted` + household bed → one `high` free offer,
6. free offer uses the physical bed's position/approach/facing rather than house-center fallback,
7. two eligible NPCs sharing one home → one row,
8. shared-home representative chooses highest relation,
9. equal relation chooses stable lowest `npc.id`, independent of source array order,
10. different physical homes → distinct free rows,
11. guard + any settlement bed → one paid offer with price 2 and `normal` quality,
12. guard does not need to own the chosen bed,
13. multiple guards → one deterministic paid provider,
14. no settlement bed → no paid guard offer,
15. free and paid candidates colliding on one `placeId` → free offer only,
16. hay remains available and low quality,
17. player-owned house behavior remains intact,
18. choice labels produce `Komfortowo / Dość wygodnie / Niewygodnie`,
19. paid row includes provider, price and comfort,
20. paid selection still classifies as `confirm` and free selection as `walk`.

Update/remove old tests that assert every physical bed becomes an anonymous high-quality candidate; that behavior is intentionally superseded.

## 13. Non-goals

- real inn building,
- `innkeeper` profession,
- private vs public bed ownership/access,
- bed reservation/occupancy,
- multiple simultaneous guests,
- dynamic lodging prices,
- settlement-size pricing,
- reputation discounts,
- inn economy/inventory,
- new sleep/rest subsystem,
- name declension/localization framework,
- persistence of `LodgingOption`.

## 14. Guardrails

- Relationship state remains owned by existing quest/social systems.
- Household/home identity remains existing `Household.homeId` + house `placeId`.
- Physical bed data remains settlement landmark/furniture state.
- `LodgingOption` remains derived and non-persisted.
- Do not make Vue decide availability, quality, provider or price.
- Do not create a separate paid-lodging payment flow.
- Do not dedupe by display text.
- Preserve single-settlement scoping in `restActions.ts`; never mix all loaded settlements into one panel.
- Add/update JSDoc for important resolver functions as needed and use `@domain settlements-npcs` where it improves preflight discovery.

## 15. Verification

Automated:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Manual browser verification is performed by the User, not the implementation agent:

- settlement with several furnished homes has no repeated anonymous `Łóżko` rows,
- `friendly` provider shows `Dość wygodnie`,
- `trusted` provider shows `Komfortowo`,
- one household/home never appears twice,
- guard offers one `2 monety` paid lodging using an available bed,
- friend access to the same chosen bed suppresses the paid duplicate,
- payment still confirms and charges once,
- hay remains visible and works,
- selected lodging still walks to the physical bed and starts sleep on arrival.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

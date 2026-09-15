# Plan: Lost Treasure Chronicles — property grant deed and persistent land reward

**Created:** 2026-09-15  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** L  
**Depends on:** quests-progression-044  
**Domain:** `quests-progression`  
**Type:** `feature`  
**Subdomains:** `quests` `progression` `rewards`  
**Tags:** `lost-treasure-chronicles` `property` `land-ownership` `deed` `sale-plot` `persistent-reward`  
**Roadmap:** `quests-lost-something-chronicles.md`

## Goal

Add the final persistent world reward for eligible Lost Treasure Chronicles outcomes:

```text
044 treasure resolution
→ eligible property grant becomes available
→ Player accepts one real settlement-associated property
→ existing land ownership records settlementId:plotId
→ one physical grant deed records the transfer
→ property remains Player-owned independently of quest state and deed possession
```

This plan must reuse the existing settlement sale-plot and land-ownership architecture rather than create quest-owned property state.

The dark-forest estate from plan 040 remains story/world content and is **not** the property granted here.

---

# 1. Recon findings that constrain this plan

Current `main` already has the correct ownership authority:

- `src/settlement/landOwnership.ts` — `LandOwnershipRegistry`, persisted as sparse `settlementId:plotId` keys;
- `src/settlement/landPurchase.ts` — validated ownership mutation for real settlement sale plots;
- `src/settlement/villagePlan.ts` — `VillagePlotRole` already includes `sale`, with deterministic static `VillagePlot.id` and optional `price`;
- `src/settlement/villagePlanner.ts` — ordinary sale plots use the same shared deterministic plot-placement/scoring path as other plots;
- runtime settlement landmarks project those sale plots into `Settlement.landmarks.landPlots` and remove sale signs when ownership becomes true.

The current sale-plot generator does **not** guarantee that a settlement has a sale plot:

```text
OUTPOST → 0
SM      → 0–1
MD      → 0–1
LG      → 0–2
XL      → 0–2
```

Each potential slot currently uses a deterministic 60% roll.

Therefore this plan cannot safely assume that the story-bound settlement already contains a plot to grant.

The correct extension is not a new quest-property system. It is a small reusable input to the existing settlement planner that can guarantee/reserve an ordinary `sale` plot when another world/story system has a legitimate deterministic requirement.

---

# 2. One ownership system

Hard invariant:

```text
VillagePlan sale plot
→ SettlementLandPlot
→ LandOwnershipRegistry
→ SaveData.ownedLandPlots
```

Do not create:

```text
questEstateOwned
lostTreasurePropertyOwned
ownedWorldLocationIds
StoryPropertyRegistry
```

The existing registry remains the only authoritative Player land-ownership state for this reward.

---

# 3. The reward property is not the dark-forest estate

Do not retrofit ownership onto the plan-040 dark-forest ruins.

That place remains:

- a normal world location,
- discoverable independently,
- part of historical Lost Treasure Chronicles content,
- unaffected by whether the Player receives the final land reward.

The property reward is one real plot associated with an existing settlement.

This avoids broadening land ownership from settlement plots to arbitrary `WorldLocation`s solely for one quest.

---

# 4. Use an ordinary `sale` plot

The rewarded property must be represented by the existing `VillagePlot` contract:

```text
role: 'sale'
stable plot id
position / radius / rotation from VillagePlan
price from existing sale-plot semantics where applicable
```

Do not add a new role such as:

```text
storyReward
questLand
specialEstate
```

unless implementation recon proves that the existing `sale` role cannot satisfy ordinary land/building consumers.

The goal is that every downstream system sees the reward as normal owned settlement land.

---

# 5. Settlement planner owns plot generation

Quest code must not append/mutate `VillagePlan.plots` after generation.

If a story-bound settlement requires a guaranteed reward plot, the request enters the settlement planning input before plot layout is finalized.

Conceptually:

```ts
requiredSalePlotSlots?: readonly {
  id: string
  purpose: string
}[]
```

Exact shape and ownership belong in settlement planning code and must be chosen during implementation notes after tracing current planner inputs.

Requirements:

- use existing `pickPlot` / shared scoring and collision rules;
- generate an ordinary `sale` plot;
- stable id supplied/derived deterministically;
- no separate placement algorithm;
- no post-generation teleport/rewrite;
- no quest dependency inside generic settlement planner modules.

Prefer a generic concept such as **required/reserved sale slots**, not a `lostTreasurePlot` special case.

---

# 6. Ordinary random sale plots remain unchanged

The story reservation must not replace the normal economy mechanic.

For an affected settlement:

```text
required sale plot(s)
+
ordinary probabilistic sale slots
```

subject to sensible space/capacity handling in the shared planner.

The story plot should not consume randomness in a way that changes unrelated deterministic placement more than necessary.

Implementation notes must identify the safest ordering relative to existing `saleSlotCount()` and plot IDs.

---

# 7. Exactly one Lost Treasure reward plot

Invariant:

```text
one canonical reward settlement
one canonical reward plot id
one ownership key
```

No outcome creates a different random property.

The property binding exists independently of whether the Player eventually earns it.

Plan 044 controls **eligibility**, not plot selection.

---

# 8. Property binding happens before the finale

Do not choose a plot at reward dialogue time.

The story/world binding should deterministically identify:

```text
rewardSettlementId
rewardPlotId
```

before the Player reaches plan 045.

This preserves world independence and prevents save/load or dialogue order from changing which land is offered.

The same plot exists as part of that settlement even if the Player chooses an ineligible ending.

---

# 9. Choose an existing story settlement

Prefer one of the settlements already bound to the authored Lost Treasure Chronicles cast.

Default preference:

1. the primary claimant / archaeologist settlement from plan 044, when compatible;
2. otherwise another already-bound major story settlement.

Do not invent a new settlement solely to hold the property.

The exact settlement must be resolved from current authored-NPC/story binding, not by display name.

---

# 10. Required plot reservation is deterministic

A required sale slot must use stable identity and existing placement rules.

Conceptually:

```text
story binding
→ settlement id
→ reserved sale-slot id
→ village planner
→ stable VillagePlot
```

No `Math.random()`.

No save-game mutation determines placement.

No dependence on loaded chunks/camera.

---

# 11. The plot exists before ownership

The reward plot is normal physical world content before the finale.

Before ownership:

- it is unowned;
- it may display normal sale/unowned presentation unless the final UX decision deliberately hides its ordinary sale sign;
- it remains physically discoverable;
- it cannot be moved when the quest activates.

After ownership:

- the same plot is owned;
- normal ownership-aware runtime presentation updates accordingly.

---

# 12. Prevent accidental ordinary purchase if required

Recon must decide whether a reserved story-reward sale plot should be purchasable through the ordinary coin-purchase interaction before plan 045.

Preferred behavior:

> reserve it from normal sale while it is held for the story reward.

Do **not** solve this by making it a fake non-sale plot.

Add the smallest reusable availability/reservation seam around sale interaction if necessary, conceptually:

```text
sale plot exists
+
reservation says ordinary purchase unavailable
+
land grant may still transfer ownership
```

The settlement planner owns geometry; land interaction/purchase owns purchase eligibility.

Do not let QuestManager directly intercept every land click.

---

# 13. Reservation and ownership are distinct

Keep concepts separate:

```text
reservation
= ordinary purchase is temporarily/not normally available

ownership
= LandOwnershipRegistry contains settlementId:plotId
```

A reservation must not imply Player ownership.

Once Player ownership is granted, reservation becomes irrelevant for gameplay.

Do not persist a second ownership flag.

---

# 14. If generic reservation state must persist

Prefer deterministic story binding + durable quest outcome over a new persisted reservation list when possible.

If land-purchase code cannot safely determine reservation from existing durable story state, add only the narrowest reusable reservation representation.

Do not store coordinates or duplicate ownership.

Implementation notes must make this decision from current composition boundaries.

---

# 15. Plan 044 outcome determines eligibility

Property is not automatically awarded for every finale.

Eligibility must derive from canonical plan-044 outcome IDs.

Preferred semantics:

### Eligible

- Player honors the primary claim and receives land as compensation/recognition;
- or Player reaches the explicitly authored compromise outcome that includes the grant.

### Not eligible by default

- Player keeps the treasure against the recognized claim.

That ending already preserves the strongest material reward.

Do not introduce hidden `propertyRewardPoints`.

---

# 16. The reward becomes available, not silently granted

Completing an eligible `044` outcome should make the property grant **available**.

Do not mutate land ownership automatically during boot/load migration.

Preferred normal/catch-up flow:

```text
eligible 044 outcome
→ next ordinary interaction with grant authority
→ explicit property offer
→ Player accepts
→ ownership + deed transaction
```

This keeps an important world mutation visible and intentional.

---

# 17. The grant authority reuses an existing stakeholder

Use the primary claimant/stakeholder selected by plan 044 where narratively credible.

Do not invent:

- notary NPC,
- mayor NPC,
- land-registry clerk,

solely for this reward.

If that stakeholder is unavailable/dead, use the smallest already-existing story fallback defined in the current stakeholder model.

Do not respawn dead NPCs.

---

# 18. This is a property grant deed, not treasure-chest loot

Resolve the roadmap ambiguity explicitly:

> the document in this plan is a **grant deed produced/transferred after the plan-044 resolution**, not a magical deed found inside `finalTreasure` that automatically grants land.

The treasure itself remains governed by plan 044.

The deed is the physical record of the later property settlement/reward.

Do not add a deed to `finalTreasure` solely to satisfy old roadmap wording.

---

# 19. Physical deed uses the existing story-item pattern

Create one identity-backed `ItemInstance` using the established quest/history item conventions already used by items such as `expedition_journal`.

Likely requirements:

- one new `ItemKind` in the existing item catalog if no suitable document kind exists;
- history/story presentation category through the existing catalog mechanism;
- stable deterministic instance ID tied to the canonical reward property.

Conceptually:

```text
item:lost-treasure-chronicles:property-grant:<settlementId>:<plotId>
```

Actual naming follows current code conventions.

No generic document subsystem is required.

---

# 20. One deed instance

Invariant:

```text
one reward property
one grant event
one canonical deed instance
```

Repeated dialogue, save/load, world rebuild or legacy catch-up must not create duplicate deeds.

Use exact instance APIs rather than generic item-count checks.

---

# 21. Deed possession is not ownership authority

Hard invariant:

```text
has deed ≠ owns land
owns land ≠ must possess deed
```

Authoritative ownership remains:

```text
LandOwnershipRegistry.isOwned(settlementId, plotId)
```

Therefore:

- dropping/losing/transferring the deed does not revoke land;
- finding/stealing a deed does not grant land;
- duplicate-paper bugs must not create duplicate ownership.

The item is historical evidence/presentation only after the grant transaction.

---

# 22. Grant uses direct ownership mutation, not purchase

Do not route the reward through `purchaseLandPlot()` with fake zero-price or refunded coins.

`purchaseLandPlot()` models a purchase and intentionally validates positive price + affordability.

A grant is a different domain transaction.

Add/reuse the smallest land-ownership grant seam that validates:

- real settlement exists;
- real sale plot exists;
- not already owned;
- plot matches canonical story binding;

then calls the existing ownership registry mutation.

Conceptually:

```text
validate real target
→ ownership.setOwned(settlementId, plotId)
```

Do not duplicate registry storage.

---

# 23. Keep grant transaction retry-safe

The important transaction is:

```text
eligible outcome
+ canonical plot
→ grant ownership once
→ deliver deed once
→ record 045 outcome
```

Implementation notes must choose ordering around inventory capacity/current transfer semantics so that interrupted/repeated interaction is safe.

Acceptable invariant after retry:

- ownership cannot be granted twice;
- deed cannot duplicate;
- dialogue can recover from a partial previously persisted state.

Do not roll back already-persisted authoritative ownership merely because the paper item is temporarily unavailable.

---

# 24. Deed is not required for land gameplay after grant

Once `LandOwnershipRegistry` says the plot is owned:

- ordinary ownership-aware UI/interaction should treat it as Player land;
- construction/use systems must not ask for the deed item;
- losing the deed must not disable the plot.

Do not add `requiresPropertyDeed()` checks to unrelated systems.

---

# 25. Reuse ordinary land capabilities

The reward's gameplay value should emerge from existing owned-land mechanics.

Do not create Lost Treasure variants of:

- construction,
- storage,
- farming,
- containers,
- animal keeping.

If current owned sale plots already support only a subset of these, this plan inherits that subset.

Do not expand general homestead gameplay solely to make the reward more impressive.

---

# 26. No custom mansion

The Player receives land, not a bespoke completed manor.

The plot may remain empty or use whatever ordinary sale-plot presentation exists.

Future construction/infrastructure plans can make the property richer through shared systems.

Do not create a quest-only mansion, workshop or house prefab.

---

# 27. Existing world changes remain authoritative

If future/current mechanics allow an unowned plot area to contain persistent modifications, granting ownership must not reset them.

Do not regenerate the property into a pristine quest state.

Ownership is a legal/gameplay mutation over the same world place.

---

# 28. Early discovery is harmless

Player may physically discover the plot before finishing the questline.

That must not:

- grant ownership;
- advance the finale incorrectly;
- relocate the reward.

At most the Player learns the place exists.

---

# 29. Legacy eligible saves

For a save where plan 044 is already completed with an eligible outcome before plan 045 exists:

```text
044 outcome proves eligibility
+
property not owned
→ reward becomes available at normal grant interaction
```

Do not auto-own land during save load.

Do not replay the treasure finale.

Do not create the deed until the grant interaction is completed unless current exact-item persistence architecture makes pre-materialization necessary.

---

# 30. Legacy already-owned target plot

This case must be handled explicitly.

If a migration/recon state proves the Player already owns the canonical plot through ordinary purchase or an earlier implementation:

- do not revoke ownership;
- do not charge/refund arbitrary coins;
- treat ownership as satisfied;
- grant/resolve only the narrative deed/outcome as appropriate.

No second property is substituted merely because the canonical one is already Player-owned.

---

# 31. Prevent ordinary purchase conflict for new worlds

For new worlds created after implementation, the reserved story plot should not be accidentally purchased before the story reward if that would undermine the grant.

Prefer generic purchase reservation over choosing another plot dynamically.

The canonical property identity must stay stable.

---

# 32. Ineligible outcomes leave a coherent world

If Player receives an ineligible `044` outcome:

- reward plot still exists as ordinary world geometry;
- story reservation should be released or converted to ordinary sale availability when appropriate;
- no deed is granted;
- no ownership mutation happens.

Do not leave permanently unusable land solely because Player chose another ending.

The exact release trigger must be deterministic from final quest outcome.

---

# 33. Dead/unavailable grant authority

Eligibility belongs to the completed `044` outcome, not to the continued survival of one NPC.

If the primary grant authority dies after the Player earned the reward but before collection:

- use an already-existing appropriate stakeholder or settlement/story handover route;
- do not create a replacement claimant;
- do not silently auto-grant on boot.

Implementation notes must choose the smallest fallback supported by the final stakeholder binding from plan 044.

---

# 34. Social consequences stay mostly in 044

Do not duplicate the finale's relation/reputation rewards here.

Plan 045 may add only a small acknowledgment if useful.

The durable reward is the land itself.

---

# 35. State ownership

```text
villagePlanner / VillagePlan
→ deterministic reward sale plot geometry and identity

land sale/reservation seam
→ whether ordinary purchase is currently available

LandOwnershipRegistry
→ authoritative Player ownership

Inventory / ItemInstances
→ physical grant deed

QuestManager
→ eligibility / grant lifecycle / durable 045 outcome

044 outcome
→ authoritative eligibility source
```

No quest property registry.

---

# 36. Persistence

Reuse existing persistence for ownership:

```text
SaveData.ownedLandPlots
```

Use normal item-instance/inventory persistence for the deed.

Use normal quest outcome persistence for eligibility/grant history.

Do not persist deterministic plot coordinates.

Do not duplicate the ownership key in a new save field.

If a reservation persistence field is genuinely required after implementation recon, store only the minimum reservation identity and keep ownership separate.

---

# 37. Performance

No new simulation loop.

The required plot is resolved during normal deterministic settlement planning.

Ownership remains a sparse set lookup.

Reservation/purchase eligibility is checked only during relevant land interaction/materialization.

No global plot scans per frame.

---

# 38. Reuse targets

Verify current `main`, especially:

- `src/settlement/villagePlan.ts`;
- `src/settlement/villagePlanner.ts`;
- `src/settlement/landOwnership.ts`;
- `src/settlement/landPurchase.ts`;
- sale-plot projection/materialization in settlement props/runtime;
- sale-sign interaction/removal flow;
- `SaveData.ownedLandPlots` and save composition;
- story-item conventions in `src/items/items.ts`, `src/items/itemCatalog.ts`, item-instance helpers;
- exact item-transfer APIs;
- plans 037–044 and their authored stakeholder bindings;
- current QuestManager outcome/prerequisite contracts.

Current code wins.

Add concise JSDoc with `@domain` for important reusable/public additions such as a required-sale-slot/reservation contract or land-grant operation when they materially improve preflight discovery.

---

# 39. Non-goals

Do not implement:

- ownership of arbitrary `WorldLocation`s;
- ownership of the dark-forest estate;
- a second property registry;
- a new `VillagePlotRole` solely for this quest;
- arbitrary property buying/selling expansion;
- rent;
- taxes;
- inheritance;
- multiple owners;
- NPC property trading;
- legal/court simulation;
- custom mansion construction;
- deed-based ownership checks in construction;
- automatic ownership mutation during boot.

---

# 40. Automated verification

Cover at least:

## Required sale plot

- canonical story settlement receives exactly one required plot;
- plot is ordinary `role: 'sale'` unless current architecture proves otherwise;
- stable plot ID and geometry across rebuild/save-load;
- placement uses shared planner scoring/collision rules;
- ordinary probabilistic sale plots still behave deterministically;
- no duplicate story slot.

## Reservation

- reserved reward plot cannot be accidentally purchased through normal sale flow before resolution when reservation is active;
- other sale plots remain purchasable;
- ineligible final outcome releases/converts reservation as designed;
- reservation does not imply ownership.

## Grant

- only eligible `044` outcomes expose grant;
- Player explicitly accepts;
- real settlement + real plot are validated;
- ownership appears in `LandOwnershipRegistry` exactly once;
- no purchase price is charged;
- repeated dialogue is idempotent.

## Deed

- exactly one identity-backed deed instance;
- deed cannot duplicate after retry/save/load;
- dropping/transferring deed does not revoke land;
- possessing deed without successful grant does not grant land.

## Persistence / legacy

- owned plot survives save/load through existing `ownedLandPlots`;
- eligible historical `044` exposes catch-up grant without auto-mutating at boot;
- canonical plot already owned is respected;
- old `027` alone does not grant this property.

Manual browser verification remains the User's responsibility.

---

# 41. Completion criteria

The plan is complete when:

1. one canonical Lost Treasure reward property is bound to an existing story settlement;
2. the property is represented through the normal settlement sale-plot mechanism;
3. the planner can guarantee that required plot without a quest-specific placement algorithm;
4. ordinary random sale plots remain part of the same mechanism;
5. the reward plot exists independently of quest activation;
6. plan 044 outcome determines eligibility but never plot identity;
7. Player explicitly accepts the reward rather than receiving silent boot-time ownership;
8. normal purchase cannot steal the reserved plot before resolution;
9. ineligible outcomes leave/release the land coherently;
10. `LandOwnershipRegistry` is the only authoritative ownership state;
11. one physical property grant deed records the transfer but does not control gameplay rights;
12. ownership and deed handling are retry-safe and idempotent;
13. legacy eligible saves can collect the reward without replaying the finale;
14. no arbitrary-world property system or bespoke mansion is introduced;
15. Lost Treasure Chronicles ends with a real persistent change in the Player's place in an existing community.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

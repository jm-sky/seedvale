# Implementation Notes: Physical Storage Inspection

**Reviewed:** 2026-09-01  
**Plan:** settlements-npcs-012-physical-storage-inspection.md

## Review conclusion

Plan 012 is a small extension of the existing interaction system. Plans 009/010 are already implemented, and the physical wood pile is already a derived view rather than an owner.

Do not introduce a storage registry, inventory, event bus, or new interaction/dialog system.

## Current implementation to reuse

### Physical wood storage

- src/settlement/props.ts — buildSettlementProps() creates the primary physical stockpile at landmarks.stockpile.
- The same function creates hidden overflow pile meshes and createWoodPileVisual() owns their quantity-driven visibility.
- src/settlement/storageVisuals.ts — createWoodPileVisual() / woodPileVisualState() are presentation only.
- src/settlement/settlementPropColliders.ts already treats landmarks.stockpile as the physical wood-pile collider.
- src/settlement/createSettlement.ts returns landmarks, economy and live households; update() synchronizes storage visuals from live state.

### Existing interaction path

Use the existing chain:

buildInteractables() → pickInGaze() / cycle candidates → gameLoop.ts → resolveInteraction() → InteractionOutcome → existing NPC dialog/flavor UI.

Relevant files:

- src/interaction/Interactable.ts
- src/app/interactables.ts
- src/interaction/resolveInteraction.ts
- src/app/gameLoop.ts
- src/interaction/findInteractionTarget.ts

There are already two read-only storage interactables: householdStorage → live Household, and settlementStorage → live SettlementEconomy. Their quantities are formatted in resolveInteraction.ts at interaction time, not cached in the prop. Follow exactly that ownership/lifecycle rule.

## Recommended implementation

For the first physical destination, add a dedicated woodStorage interactable rather than prematurely creating a generic storage hierarchy.

It should carry a stable live reference sufficient to resolve the current wood quantity at interaction time. Keep the target position at settlement.landmarks.stockpile.

In buildInteractables():
- add exactly one candidate for the primary physical stockpile;
- do not add candidates for createWoodPileVisual() overflow meshes;
- do not add a candidate for every rendered log/pile;
- for LG/XL, treat landmarks.stockpileSecondary deliberately: it is another static representation of the same settlement storage, not an independent inventory. If the feature exposes it, it must resolve to the same authoritative physical destination and must not create a second quantity.

Use the existing GAZE_RANGE / INTERACT_RANGE and normal target cycling. No special targeting code is needed.

In resolveInteraction.ts, format a short read-only result and return it as InteractionOutcome. Do not mutate storage.

Add JSDoc to important new public/pure helpers and use @domain settlements-npcs where appropriate so Claude preflight can discover the seam.

## Important discrepancy: what quantity is actually physical?

The plan says inspection should read SettlementEconomy.query('wood'), but the current Plan 010 implementation deliberately derives the visible main pile from:

households.reduce((sum, h) => sum + h.stock.query('wood'), 0) + economy.query('wood')

This is because Plan 009 made household wood physically deposit at the shared village stockpile as well.

Therefore do not blindly implement an economy-only inspection while the visible pile represents the combined quantity. That would let the player see one quantity while the pile visually represents another.

Preferred resolution:
- define the physical stockpile quantity once as the same live quantity used by the wood-pile visual, and use that for inspection;
- keep SettlementEconomy and Household as authoritative owners;
- do not add a cached quantity to the pile/interactable.

If the intention of plan 012 is specifically to expose only settlement-level economy stock, then the wood visual must first be changed to use the same source. Do not leave two conflicting meanings for the same physical pile.

A small pure resolver/formatter is preferable if it prevents duplicating the current aggregation expression between createSettlement.ts and resolveInteraction.ts.

## Secondary stockpile / overflow pitfall

There are three different concepts in the current code:
1. primary landmarks.stockpile;
2. stockpileSecondary in LG/XL settlements;
3. extra meshes created by createWoodPileVisual() for quantities above the top band.

Only (3) is explicitly part of the dynamic visual controller. Do not accidentally turn (2) or (3) into separate storage owners.

If the secondary stockpile is made interactable, it must represent the same physical destination and quantity; otherwise keep inspection anchored to the primary destination as the plan currently describes.

## Prompt and UI

Existing storage prompts are Zbadaj: Magazyn domowy / Zbadaj: Magazyn osady. The plan explicitly wants a physical-storage action such as:

[E] Zbadaj stertę drewna

Use the existing prompt/dialog pipeline; do not add a new UI component.

The inspection result should be generated from live state when [E] is pressed, just like formatHouseholdStorage() and formatSettlementStorage().

## Tests

There is no existing dedicated resolveInteraction.test.ts, so do not create a UI test framework.

Prefer a small pure test seam if introducing a physical-wood quantity formatter/resolver. Cover:
- zero;
- positive quantity;
- changed authoritative quantity is reflected on the next interaction;
- inspection is read-only;
- if the physical quantity aggregates household + settlement wood, both sources are included;
- deterministic formatting.

For targeting, a focused buildInteractables() test is useful only if a clean seam is introduced. Otherwise rely on the existing interaction path and browser verification.

## Verification focus

Automated:
- typecheck;
- existing tests;
- build.

Browser:
- approach the visible primary wood pile;
- prompt appears only for the one physical destination;
- [E] opens the existing inspection dialog;
- displayed quantity matches the actual physical pile semantics;
- change wood through existing NPC/economy simulation and inspect again;
- inspect the settlement storage crate separately and confirm it remains an aggregated settlement-storage interaction;
- in LG/XL, confirm secondary/overflow piles do not create duplicate independent storage interactions;
- confirm NPC navigation/colliders are unchanged.

## Main pitfalls

- Do not create WoodPileInventory.
- Do not read quantity from Three.js objects or mesh visibility/scale.
- Do not duplicate the interaction/dialog system.
- Do not add one interactable per overflow pile/log.
- Do not introduce an event bus just to refresh inspection; inspection already reads live state on [E].
- Do not confuse settlement storage with the physical wood destination; the crate is already a separate settlementStorage interactable.
- Do not ignore the Plan 009 consequence that household wood is deposited at the shared stockpile.
- Do not make stockpileSecondary a new owner.
- Preserve the existing stream-out/rebuild model: props/interactables are disposable presentation; authoritative economy/household state lives outside them.

## Focused implementation order

1. Verify the current physical stockpile quantity semantics in storageVisuals.ts and createSettlement.ts.
2. Decide/centralize the physical wood quantity resolver so visual and inspection cannot diverge.
3. Add woodStorage to Interactable.
4. Add the single primary-stockpile candidate in buildInteractables().
5. Add the read-only outcome in resolveInteraction().
6. Keep game-loop dispatch on the existing generic resolveInteraction() path.
7. Add only focused pure tests if a new resolver/formatter warrants them.
8. Run typecheck/tests/build and perform the browser checks above.

**Zrób git commit i push do main, rebase jeżeli trzeba**
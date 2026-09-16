# Plan: Foreign property interaction warning and consequences

**Created:** 2026-09-16
**Status:** `verification needed` 🔍 — implemented 2026-09-16 (`tsc`/lint/tests). Browser/manual verification belongs to the User.
**Type:** feature
**Priority:** medium · **Effort:** S
**Depends on:** ~~fauna-020~~, ~~quests-progression-012~~
**Domain:** `items-player`
**Subdomains:** `interaction` `items`
**Tags:** `ownership` `consequences` `trade` `audio`
**Roadmap:** -
**Model:** Sonnet, Grok

## Goal

Add a minimal shared mechanism that can tell the player, before an action, that using a foreign world entity may have a negative consequence, then apply a small deterministic consequence when the action actually crosses the consequence threshold.

The first implemented use case is the live merchant horse. The mechanism must not be horse-specific so later world entities can reuse the same interaction warning/consequence vocabulary.

## Current-state constraint

Do **not** redesign fauna ownership for this MVP.

Current livestock ownership is authoritative in `src/fauna/animalOwnership.ts` as `household | player | null`. The existing merchant horse is a real persistent `AnimalAgent` with stable identity and currently has `null` animal ownership before acquisition. Its purchase/reward flow already derives availability and transfers the same animal through `SettlementsManager.transferAnimalOwnership()`.

This plan therefore introduces an **interaction/property consequence classification**, not a second persistent ownership authority and not an `AnimalOwner { kind: 'npc' }` variant.

## 1. Action-level consequence preview

Warnings belong to the **action**, not only to the target.

Use a small closed presentation/domain classification such as:

```ts
export type InteractionConsequenceTone = 'safe' | 'caution' | 'negative'
```

The exact type name may follow existing interaction naming, but preserve these semantics:

- `safe` — normal interaction presentation;
- `caution` — orange warning; action is allowed but may have a contextual consequence;
- `negative` — red warning; executing/continuing the action is expected to produce a negative consequence.

Do not encode ownership policy in Vue/CSS. The interaction/domain layer determines the tone; UI only renders it.

The design must support two actions on the same target having different tones later, e.g. inspect = safe, take = negative.

## 2. Interaction prompt presentation

Extend the existing structured interaction view instead of adding a parallel ownership popup.

Relevant seam: `src/interaction/interactionView.ts` already owns `InteractionActionView`, `InteractionView`, `InteractionGazePrompt` and `buildInteractionView()`.

For a foreign action:

- `caution` action → orange action/prompt treatment;
- `negative` action → red action/prompt treatment;
- include a short reason label when useful.

Merchant horse MVP copy:

```text
[E] Dosiądź
To cudzy koń
```

The warning must be visible in the ordinary gaze/interaction HUD. No dialogue window is required.

Do not block the action solely because it is foreign property.

## 3. Merchant horse classification

Use the existing merchant-horse identity/acquisition seam from `src/settlement/horseAcquisition.ts` and the live `AnimalAgent`.

Before acquisition:

- the merchant horse mount action is classified as foreign-property use;
- if the horse is already player-owned after purchase/reward, the warning disappears;
- do not identify the horse by parsing `merchant-horse-*` outside the existing resolver/boundary.

The merchant/NPC used for relationship and trade consequences must come from the existing settlement merchant wiring, not from a new owner id stored on the animal.

## 4. Consequence trigger: actual removal, not accidental mount

Mounting alone does not apply a penalty.

When the player mounts a foreign merchant horse, start one bounded incident candidate for that ride. Apply the consequence only after the player has actually taken the horse away from its merchant/home context.

For MVP use a deterministic distance threshold from the mount-start/home/merchant context. Resolve the exact constant during implementation from current settlement scale; keep it as a named constant and cover it with tests.

Required behaviour:

```text
mount foreign horse
→ warning only

remain nearby / dismount nearby
→ no penalty

ride beyond threshold
→ evaluate relationship
→ at most one consequence for this ride/incident
```

The threshold check must not repeatedly apply penalties every frame.

## 5. Friendly borrowing vs unauthorized use

Reuse the current player↔NPC relationship levels/values. Do not create a new friendship system.

MVP rule:

- positive/friendly relationship high enough for borrowing → no negative consequence;
- neutral/weak/negative relationship → unauthorized-property consequence.

The implementation must define the threshold using the existing `RelationLevel` vocabulary rather than inventing a second numeric tier table. `friendly`/`trusted` are the intended no-penalty tiers unless current relationship semantics discovered during implementation make a narrower choice necessary.

Settlement reputation may be an input if it is already available at the consequence seam, but do not add a new reputation subsystem or broad settlement-wide punishment in this MVP.

## 6. Negative consequence

For unauthorized merchant-horse use apply only:

1. a small player↔merchant relationship penalty through the existing relation authority;
2. a temporary merchant pricing grievance lasting **2 world days**.

No NPC reaction AI, witness system, guard response or crime simulation is part of this plan.

### Trade grievance

The grievance affects prices offered by that merchant to the player, with severity derived from current relationship at incident time.

Target range:

- mild case: about `+10%`;
- neutral case: about `+15%`;
- poor relationship: up to `+25%`.

Store/apply this as a named temporary social/trade modifier with a reason such as `unauthorized_property_use`; do not permanently mutate `MERCHANT_PRICES`.

It must expire from authoritative world time after 2 days and must not stack repeatedly from the same incident. If multiple later incidents are supported, define deterministic refresh/max semantics rather than multiplicative stacking.

Because the effect lasts across world time, save/load must preserve the active expiry/modifier if the existing save architecture has an appropriate bounded place for it. Do not silently make a two-day consequence disappear on reload.

## 7. Negative consequence SFX

When — and only when — a negative consequence is actually committed, play one short UI/world-feedback one-shot (the desired feel is a short low `tudum`).

For this plan no new asset is required. Temporarily reuse an existing repository one-shot; `public/sounds/ui-click-03.ogg` is an acceptable placeholder because it is currently an unused short UI blip. Keep the URL/choice isolated so the user can replace it later without changing consequence logic.

Do not play the sound:

- merely because a red/orange prompt is visible;
- on mount if no penalty has been committed;
- for friendly borrowing.

Prefer a small reusable audio helper/event for `negative consequence applied`, not a horse-specific audio call inside rendering code.

## 8. Scope guardrails

Do not implement in this plan:

- NPC shouting, dialogue reactions or animation reactions;
- witnesses or line-of-sight crime detection;
- guards, pursuit, arrest or crime levels;
- theft history / criminal record;
- generic persistent ownership registry for every world object;
- household/settlement permission policy;
- item confiscation or automatic return;
- selling stolen goods;
- repeated penalties while riding the same horse;
- ownership transfer changes beyond the existing acquisition flow.

## 9. Architecture / ownership

Preferred flow:

```text
current target + action
→ derive property/consequence classification
→ structured InteractionView
→ HUD renders safe/orange/red
→ action executes normally
→ action-specific threshold crossed
→ shared consequence evaluator
→ existing relation authority + temporary trade grievance
→ negative-consequence SFX
```

State ownership rules:

- fauna ownership remains in the existing fauna ownership model;
- merchant-horse identity remains derived through the horse-acquisition seam;
- relationship remains in the existing player↔NPC relation authority;
- temporary grievance owns only its reason/severity/expiry, not copied relation/reputation state;
- UI stores no gameplay ownership/consequence truth.

## 10. Likely implementation surface

Recon before implementation must verify the exact current call sites, with these files as the starting set:

- `src/interaction/interactionView.ts`
- `src/interaction/Interactable.ts`
- `src/app/gameLoop.ts`
- `src/app/actions/mountActions.ts`
- `src/settlement/horseAcquisition.ts`
- `src/fauna/animalOwnership.ts`
- `src/app/inventoryWiring.ts`
- `src/items/tradeCatalog.ts`
- `src/items/trade.ts`
- `src/quests/QuestManager.ts`
- current merchant UI/store wiring under `src/ui-vue/`
- current audio one-shot helpers under `src/audio/`
- save-data/persistence boundary owning the relevant player/social state.

Important architectural/public helpers introduced for consequence classification/evaluation should receive useful JSDoc and `@domain items-player` where appropriate for preflight discovery.

## 11. Tests

Automated tests should cover at minimum:

- ordinary interaction stays `safe`;
- merchant horse before acquisition exposes negative/red mount action + `To cudzy koń`;
- purchased/rewarded player-owned merchant horse does not show the warning;
- mount + immediate dismount produces no consequence;
- crossing the distance threshold commits once;
- friendly/trusted borrowing commits no penalty;
- neutral/poor relation applies the correct grievance band;
- one incident cannot apply relation/price penalty multiple times;
- active grievance changes the intended merchant prices and expires after 2 world days;
- active grievance survives save/load if persistence is required by the chosen owner;
- negative SFX fires once on committed penalty and not on preview/friendly borrowing.

## 12. Manual verification

User verifies in browser:

1. approach merchant horse before purchase — red warning is clear;
2. mount and dismount near merchant — no punishment/SFX;
3. ride away with friendly relationship — no punishment/SFX;
4. ride away with neutral relationship — one penalty + temporary higher merchant prices + one SFX;
5. reopen trade and confirm price modifier;
6. advance world time beyond 2 days and confirm normal pricing returns;
7. acquire the horse legitimately and confirm foreign-property warning disappears.

AI agent does not perform browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
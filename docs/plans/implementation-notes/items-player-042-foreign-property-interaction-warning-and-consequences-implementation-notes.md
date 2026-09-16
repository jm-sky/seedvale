# Implementation Notes: Foreign property interaction warning and consequences

**Plan:** `items-player-042-foreign-property-interaction-warning-and-consequences.md`  
**Status:** `verification needed` 🔍  
**Reviewed against:** current `main`, 2026-09-16

## 1. Existing merchant-horse ownership must stay intact

`src/fauna/animalOwnership.ts` is already the authoritative livestock ownership model:

```ts
export type AnimalOwner =
  | { kind: 'household', houseId: string }
  | { kind: 'player' }
  | null
```

Do not add `{ kind: 'npc' }` only for this plan and do not create `ownerNpcId` beside it.

`quests-progression-012` already established the merchant horse as a real persistent livestock `AnimalAgent` with stable id selected through `src/settlement/horseAcquisition.ts`. Before acquisition it intentionally has `null` animal ownership; purchase/reward transfers that same individual through `SettlementsManager.transferAnimalOwnership()`.

Therefore the MVP needs a **derived foreign-property/action classification**, not a second ownership store.

Useful existing notes: `docs/plans/implementation-notes/quests-progression-012-horse-acquisition-merchant-purchase-and-quest-reward-implementation-notes.md`.

## 2. Interaction presentation seam is already structured

`src/interaction/interactionView.ts` is the correct presentation boundary. It already defines:

- `InteractionActionSlot`
- `InteractionActionView`
- `InteractionView`
- `InteractionGazePrompt`
- `buildInteractionView()`
- `buildInteractionGazePrompt()`

`gameLoop.ts` builds the gaze prompt from this structure. Keep ownership/consequence truth outside Vue/CSS and carry only a derived tone/reason through the view.

A narrow extension such as:

```ts
consequenceTone?: 'safe' | 'caution' | 'negative'
```

on `InteractionActionView` is preferable to adding a separate `ownershipWarning` HUD path.

The warning is **action-level**. Do not add one target-wide `isOwned` flag that would make future harmless actions such as Inspect red too.

`buildInteractionView()` is explicitly presentation-only and its comment already says gameplay execution must revalidate live state. Preserve that separation: preview may say negative, but the consequence commit path must independently re-check the current horse/acquisition/relation state.

## 3. Merchant horse detection must reuse the acquisition resolver

`src/settlement/horseAcquisition.ts::resolveMerchantHorseAnimal()` / the existing acquisition state wiring is the semantic source for "this is the merchant horse".

Do not introduce new code that parses `merchant-horse-${settlementId}` in `gameLoop.ts`, interaction code or mount code.

`src/app/inventoryWiring.ts` already receives/binds the live merchant horse for the special purchase offer. The app composition layer should provide whatever narrow resolver/callback the interaction and mount consequence paths need.

After legitimate purchase/reward the same animal becomes player-owned. Derive the warning from current live state so it disappears automatically; do not persist a `wasMerchantHorseForeign` boolean.

## 4. Mount lifecycle is the clean incident boundary

`src/app/actions/mountActions.ts` currently owns:

- `tryMount(animal)` / `enter(animal)`;
- per-frame mounted movement in `update()`;
- mount start position through `lastMountX/lastMountZ`;
- one mounted `AnimalAgent` reference;
- dismount/fall/death cleanup.

This is the right place to maintain **ephemeral per-ride incident state**, but it should not directly know QuestManager, merchant pricing or UI persistence.

Recommended shape is an injected narrow callback/evaluator from app composition, semantically:

```ts
foreignProperty?: {
  previewAnimalAction(animal, action): ...
  beginMountedUse(animal): MountedPropertyIncident | null
  updateMountedUse(incident, animal): void
  endMountedUse(incident): void
}
```

Exact names may be smaller, but preserve dependency direction: mount code reports a domain event/threshold crossing; a shared consequence service owns social/trade effects.

Per-ride state needs at least:

- target stable id;
- origin/home reference or mount-start position chosen by the evaluator;
- whether consequence was already committed.

Do not check/apply relation penalties each frame. Once committed, mark the ride incident handled.

## 5. Distance threshold

There is no current foreign-property distance rule to reuse. Make it a named deterministic constant local to the property-use evaluator rather than embedding a magic number in `gameLoop.ts`.

The plan intentionally leaves the exact value for implementation because settlement scale/current horse stall geometry must be checked against the live code. The important contract is:

```text
mount only                      => no penalty
small movement near merchant    => no penalty
cross threshold once            => one evaluation/commit
continue riding                 => no repeated commit
```

If an existing merchant/home position is already available from settlement landmarks, prefer it over a copied static coordinate. If not, mount-start position is acceptable for this MVP and should be documented as such.

## 6. Player↔NPC relationship authority

Player-facing relations are owned by `src/quests/QuestManager.ts`; `src/settlement/npcRelationships.ts` is a separate symmetric NPC↔NPC store and must **not** be used for player consequences.

Existing code already consumes player relation + `RelationLevel` in social decisions and trade pricing. Reuse the current relation lookup/mutation seam from `QuestManager` rather than adding another affinity value.

For this MVP use current `RelationLevel` semantics for the free-borrow decision. Intended default:

- `friendly` / `trusted` → permitted borrowing, no consequence;
- weaker tiers → unauthorized use.

If current merchant wiring resolves relationship by NPC name rather than stable id, keep the existing authority/keying contract rather than adding a second mapping in this plan.

Relation penalty magnitude should stay in the same order as existing authored quest/social deltas. Do not introduce a large crime-scale penalty for this MVP.

## 7. Trade pricing: do not mutate `MERCHANT_PRICES`

`src/items/tradeCatalog.ts` currently has two relevant pricing paths:

1. `MERCHANT_PRICES` / `merchantPrice()` — fixed list price used for normal merchant goods;
2. social pricing helpers (`SellPriceContext`, `relationshipEffect()`, `reputationEffect()`, `fullConditionSellFactor()`, `fullConditionBuyFactor()`) — current relation/reputation-aware price composition for selling to merchant / buying from ordinary NPCs.

The horse itself is intentionally outside `MERCHANT_STOCK` and is purchased through the explicit priced-purchase seam from `src/items/trade.ts`, per `quests-progression-012`.

For the temporary grievance, do **not** rewrite catalog constants. Add one bounded modifier at the merchant pricing composition/wiring layer so all intended merchant prices shown/committed during the grievance use the same value.

Important: the ordinary merchant player-purchase list price path is currently fixed-list-price oriented. Implementation should trace `MerchantPricing`/`inventoryWiring.ts` and ensure the grievance affects both preview/display and transaction commit through one calculation rather than only changing UI text.

Suggested semantic state:

```ts
type TradeGrievance = {
  reason: 'unauthorized_property_use'
  merchantKey: string
  markup: number
  expiresAtElapsedDays: number
}
```

Names may follow the existing save/domain vocabulary. Store only the modifier and expiry; relation/reputation remain references to their authorities.

Do not multiplicatively stack repeated horse incidents. For MVP, `max(existingMarkup, newMarkup)` + expiry refresh to `max(existingExpiry, newExpiry)` is deterministic and bounded if a second incident occurs.

## 8. World time and persistence

Use authoritative world time (`DayNightState.elapsedDays` is already widely used, including in `gameLoop.ts`) for the 2-day expiry. Avoid wall-clock timestamps.

The grievance must survive save/load because its design lifetime is multiple world days. Before implementing, locate the smallest existing bounded save owner that already persists player social/economic state. Do not place this temporary social modifier into `AnimalAgent` persistence.

If no suitable generic social-modifier store exists, introduce one small persisted record collection owned near the existing player/social app state, not a generic event log.

## 9. Audio

The repo already has one-shot UI helpers/assets. `public/sounds/README.md` documents:

- `ui-click-01.ogg` — wired click/panel sound;
- `ui-click-02.ogg` — unused soft confirm;
- `ui-click-03.ogg` — unused short blip.

Use `public/sounds/ui-click-03.ogg` as the temporary consequence sound for this plan. Keep the URL in one helper/constant so it can later be replaced by the user's dedicated low `tudum` asset without touching consequence logic.

Do not call audio from Vue styling or on red prompt rendering. The sound fires only after the negative social/trade consequence successfully commits.

Prefer a small helper under `src/audio/` analogous to the current one-shot helpers instead of loading/decoding the file ad hoc from `mountActions.ts`.

## 10. Suggested implementation split

A minimal maintainable split is:

1. **Interaction view:** add action consequence tone/reason and render it through the existing gaze prompt UI.
2. **Property evaluator:** a small items-player domain helper deriving merchant-horse foreign-use preview and relationship-based permission.
3. **Mount incident:** ephemeral per-ride threshold state in/near `mountActions.ts`, delegating commit outward.
4. **Social/trade consequence:** relation delta + persisted temporary merchant grievance, fed into the existing merchant pricing calculation used by display and commit.
5. **Audio:** one reusable negative-consequence one-shot helper using `ui-click-03.ogg` temporarily.

Avoid a broad `OwnershipManager`, crime manager or event bus for this MVP.

## 11. High-value tests / pitfalls

### Interaction

Test `buildInteractionView()`-level presentation separately from execution. Red/orange styling is not proof that the gameplay evaluator will commit a consequence.

### Horse acquisition state

Test warning before purchase and no warning after `transferAnimalOwnership(..., { kind: 'player' })`. This guards against stale cached classification.

### One-shot incident

A ride crossing the threshold and then continuing for many updates must produce exactly one consequence callback/SFX.

### Friendly borrowing

Friendly/trusted relation must suppress relation delta, grievance creation and SFX together. Do not suppress only one of the three.

### Pricing atomicity

The grievance markup seen in Merchant UI must equal the value charged by the transaction path. Do not create presentation-only markup.

### Expiry

At `elapsedDays >= expiresAtElapsedDays`, derive no markup. Expired records may be pruned lazily, but stale entries must not affect pricing.

### Save/load

Persist the remaining absolute world-day expiry value, not a real-time countdown timer.

## 12. JSDoc / preflight

If new public/architectural helpers are added, document the ownership boundary explicitly. Useful tags:

```ts
/**
 * @domain items-player
 * @role Derives action-level foreign-property consequence preview; does not own entity ownership.
 */
```

and for trade state make clear that it owns only temporary grievance data, not relation or catalog prices.

## 13. What was actually implemented

- Action `consequenceTone` on `InteractionActionView`; gaze HUD, flavor dialog and touch `[E]` render orange/red. Warning copy: `To cudzy koń`.
- Merchant-horse identity via `resolveMerchantHorseAnimal` + loaded settlements; no `merchant-horse-*` parsing in interaction/mount/gameLoop.
- Per-ride incident origin is **mount-start position** (a wandered horse must not instantly trip the hitch spawn). Threshold: `FOREIGN_MERCHANT_HORSE_REMOVAL_DISTANCE = 16`. Restore-from-save mount does not start an incident.
- `friendly`/`trusted` borrowing: no relation delta, no grievance, no SFX. Otherwise relation `-2` plus markup `0.10` / `0.15` / `0.25` (acquainted / stranger≥0 / stranger<0).
- Trade grievance is a persisted app-owned collection (`SaveData.tradeGrievances`, save v47). Markup is applied to merchant BUY list price and horse offer through `applyPurchaseMarkup` on both preview and commit. Refresh uses `max(markup)` + `max(expiry)`.
- Negative SFX: `playNegativeConsequence` → `/sounds/ui-click-03.ogg`, only after a committed penalty.

No browser verification by the implementation agent; manual gameplay verification belongs to the user.
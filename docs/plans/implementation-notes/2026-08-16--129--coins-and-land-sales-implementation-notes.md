# Implementation notes: 129 — Monety i sprzedaż działek

**Reviewed:** 2026-08-16
**Plan:** `2026-08-16--129--coins-and-land-sales.md`
**Status:** implementation guidance

## 1. Review summary

Plan 129 is directionally compatible with the current architecture, but several names in the plan describe abstractions that do not exist yet. The implementation should extend existing systems rather than introduce `LandPlot`, `player.money`, a separate wallet, a separate parcel generator, or a separate sign/interaction pipeline.

The most important correction is the settlement model: the current authoritative layout already has `VillagePlot` inside `VillagePlan`. It contains stable `id`, position, radius, rotation, zone and family linkage. There is no separate `LandPlot` type to add beside it. Extend `VillagePlot` with the minimum semantic data needed for a sale plot, or introduce a small sale-specific definition only if the existing plot model cannot represent it cleanly. Prefer extending `VillagePlot`.

The current `Inventory` is already generic and exposes `add`, `remove`, `has`, `count`, `toJSON`; it also has a weight limit. Therefore coin must be a normal `ItemKind` and `ItemDef`. Do not add money-specific Inventory methods unless a genuinely reusable capability is missing.

`docs/STATE.md` says save schema is currently v13 and inventory is already persisted. The new ownership state should therefore be an additive sparse persistent field, migrated by absence, and should not serialize regenerated settlement geometry.

## 2. Concrete existing architecture to use

### Items / inventory

- `src/items/items.ts` owns `ItemKind` and `ITEM_DEFS` including weight/category/label.
- `src/items/itemCatalog.ts` owns gameplay-facing item metadata.
- `src/items/Inventory.ts` is the generic counter/weight carrier.
- `Inventory.add/remove/has/count/toJSON` already cover the required coin operations.
- Coin should be added to both `ItemKind` and `ITEM_DEFS`, then `ITEM_CATALOG` with `spawn: 'none'` and no held/melee model.
- Give coin a very small but non-zero weight, or explicitly make the chosen weight part of the implementation decision. The existing Inventory is weight-based, so the plan's example of thousands of coins is otherwise capable of unexpectedly consuming the player's carrying capacity. Prefer a tiny weight such as `0.001 kg` per coin unless current balance conventions suggest otherwise. Do not add a special weight exemption for currency.

### Settlement layout

`src/settlement/villagePlan.ts` currently defines:

- `VillagePlan`
- `VillagePlot`
- `VillagePlotRole = 'house' | 'work' | 'food' | 'livestock' | 'infrastructure'`
- `VillageBuildingPlan`
- zones, landmarks, paths and entrances.

There is no `LandPlot` or sales-plot subsystem. The cleanest V1 is to extend the existing plot vocabulary with a role such as `sale` and add only the data that is actually needed for a sale plot. Avoid duplicating position/rotation/radius in another type.

Recommended shape conceptually:

```ts
export type VillagePlotRole =
  | 'house'
  | 'work'
  | 'food'
  | 'livestock'
  | 'infrastructure'
  | 'sale'
```

Then keep sale-specific state separate from the deterministic plan. `price` belongs to the deterministic plot definition. `owner` does not: ownership is persistent runtime/world state.

Do not put `owner: 'player'` into `VillagePlan`; doing so would mix generated static data with persistent mutable state.

### Determinism

The plan correctly requires sale plots to be generated as part of `VillagePlan`, not lazily when the player arrives. Use the same deterministic placement pipeline already used by settlement plots/buildings/zones. The existing settlement generator and its placement tests are the first implementation targets.

The placement algorithm should reuse the existing site/boundary/spacing/path constraints instead of inventing a second collision solver. A sale plot should be scored/placed through the same shared placement mechanism used for existing village content.

Recommended V1 placement priority:

1. inside `VillageBoundary`;
2. outside existing building/plot footprints;
3. outside paths/roads and important landmarks;
4. outside garden/field/livestock occupied areas;
5. terrain slope/height acceptable;
6. close enough to an existing local path/road to be reachable;
7. prefer outer village positions.

If the existing placement system cannot express one of these constraints, extend that system instead of creating `findSalePlotPosition()` with a parallel scoring implementation.

## 3. Plot identity and persistence

Use a stable settlement-scoped identity. Do not assume `plot.id` is globally unique across all settlements unless the generator explicitly guarantees it.

Recommended persistent key:

```ts
settlementId + plotId
```

or a single canonical composite ID generated once from those two stable IDs.

The persistent value can remain intentionally tiny, for example:

```ts
playerLandPlots: Record<string, true>
```

where the key identifies the settlement plot. There is no need to persist `owner: 'player'` if the only possible owner in V1 is the player. If the architecture already has a generic ownership representation, reuse it instead.

Important distinction:

- `VillagePlan` = static generated definition;
- persistent save state = whether the player owns the plot;
- runtime settlement rendering = combines both.

On stream-in, resolve `VillagePlan.plots` and overlay ownership from persistent state. A purchased plot must therefore remain purchased even though its render objects are destroyed and rebuilt.

## 4. Save schema

Inspect and extend the canonical `SaveData` in `src/persistence/saveData.ts` rather than creating a second persistence store.

Current STATE says save schema is v13. Increment the schema only if the project's existing migration convention requires a version bump for every structural change. Follow the existing migration implementation rather than introducing an ad-hoc migration path.

Migration rule:

- old save without the new field => empty ownership set/map;
- malformed/unknown plot IDs should be ignored safely when materializing runtime state;
- never serialize meshes, signs, transforms or the full generated `VillagePlan`.

Inventory already persists through its serialized item counts, so coins automatically persist once added to the normal inventory/save path.

## 5. Purchase transaction

Do not scatter the transaction over interaction code.

Create one small domain operation at the settlement/player boundary, conceptually:

```ts
purchaseLandPlot(settlementId, plotId)
```

or an equivalent name matching existing service conventions.

The operation should:

1. resolve the current plot from authoritative settlement data;
2. resolve persistent ownership;
3. reject missing settlement/plot;
4. reject non-sale plots;
5. reject already-owned plots;
6. validate `price > 0`;
7. validate `inventory.has('coin', price)`;
8. remove coins;
9. persist/set ownership;
10. update the runtime settlement state/rendering.

The important architectural point is that the validation must complete before mutation. `Inventory.remove()` is already safe when insufficient funds exist, but the purchase should still explicitly validate all world conditions before removing anything.

Avoid making the sign itself the owner of purchase state. The sign should only carry stable references (`settlementId`, `plotId`) and ask the domain state for the current truth.

## 6. Settlement treasury: do not add it in V1 unless already required

The plan leaves this open, and the current architecture should decide it rather than inventing `SettlementMoney`.

For V1, the simplest and safest implementation is:

- player loses coins;
- ownership changes;
- no new settlement treasury is persisted unless the existing `SettlementEconomy` already has a natural money/treasury concept that can accept the payment.

Do not create a fake treasury just to make the transaction symmetrical. A later economy/money plan can introduce settlement money when it has an actual consumer.

If `SettlementEconomy` already exposes a generic stock/resource mechanism that naturally fits coins, document the reuse before implementing it. Do not create a parallel `SettlementMoney` or `player.money` field.

## 7. Quest rewards

The current quest architecture already has generic effects/rewards. Inspect the current `QuestDef`/completion path before adding anything.

Coin rewards should be represented as the same item reward structure used by other items. The desired flow is:

`quest completion -> existing reward/effect lifecycle -> Inventory.add('coin', amount)`

Do not add `moneyReward`, `player.addMoney()` or a coin-specific quest callback.

For initial testing/balance, prefer adding coins to one or two existing quests rather than changing many definitions. This keeps the implementation easy to verify and makes the source of early currency obvious.

## 8. Price configuration

The plan's size-based example (`small=500`, `medium=1200`, `large=2500`) should not become an interaction-level `if` chain.

The price should be assigned while generating the deterministic sale plot, using a central configuration/table. The generator should receive the settlement size and choose a price there. Runtime purchase code should only read `plot.price`.

Keep the pricing function deterministic and side-effect free.

Do not add dynamic pricing, reputation modifiers, supply/demand, or regional currency in this plan.

## 9. Number of sale plots

The proposed `0–1 / 0–1 / 0–2` distribution is reasonable as a starting point, but the exact algorithm should fit the existing village plot generation counts and available space.

Do not force a sale plot into an already crowded settlement merely to hit the configured count. The generator should be allowed to produce fewer plots if no valid candidate exists.

A useful invariant is:

`generatedSalePlots <= configuredMaximum`

not:

`generatedSalePlots === configuredMaximum`.

This avoids introducing invalid overlaps in dense settlements.

## 10. Sign / settlement prop integration

The plan says to reuse the existing sign pipeline. Confirm the exact current settlement prop/sign implementation before creating any new render helper.

The sign should be a lightweight settlement prop with only:

- `settlementId`
- `plotId`
- transform/orientation generated from the plot/nearby path.

Do not copy the complete `VillagePlot` into `userData` or closure state.

The sign's visible text should be derived from current plot state:

- available: `NA SPRZEDAŻ` + price;
- owned by player: no sale sign / no sale interaction.

Because settlement props are streamed, the sign must be regenerated from `VillagePlan + persistent ownership`, not persisted as an object.

If there is no reusable text/sign mechanism, add the smallest reusable settlement sign abstraction rather than a property-sale-specific renderer.

## 11. Interaction

Use the existing `Interactable` pipeline and its existing desktop/touch presentation. The plan is correct not to create a property-specific input system.

The interaction should resolve `settlementId + plotId` and query the authoritative state at interaction time. Do not capture a stale `price`/`owner` snapshot in the interaction object.

If the current interaction API supports a prompt callback or dynamic label, use it so the displayed price/availability cannot become stale after streaming/state changes.

## 12. Ownership state and rendering

After a successful purchase, the important visible consequences are:

- coins disappear from Inventory;
- plot becomes owned;
- sale sign disappears or changes to a neutral owned state;
- subsequent purchase is rejected.

Do not add a house, construction preview, fence or other physical ownership marker in this plan. The owned empty plot is sufficient V1 and leaves plan 129 cleanly bounded.

When the settlement streams out, destroy all transient render objects normally. When it streams back in, the sale sign must be suppressed for owned plots based on persistent state.

## 13. Testing priorities

### Item / Inventory

Add focused tests for:

- coin is a valid `ItemKind` and has an `ITEM_DEFS` entry;
- coin can be added and counted;
- coin stacks through the normal Inventory map;
- removing exactly the current balance succeeds;
- removing more than the current balance fails without mutation;
- save/load preserves coin counts through the existing inventory path.

### Settlement generation

Extend existing `settlementGenerator.test.ts` (or the closest existing placement test) rather than creating a parallel sale-plot test suite.

Test deterministic properties:

- same seed + settlement identity => same sale plots;
- sale plot IDs stable;
- sale plots are within boundary;
- no duplicate plot IDs;
- sale plots do not overlap existing occupied content according to the existing placement rules;
- a crowded settlement may generate fewer sale plots than the configured maximum.

### Purchase domain

Test the transaction matrix from the plan, with the key assertion that failed purchases do not mutate inventory or ownership.

Especially test:

- exact balance succeeds and leaves zero;
- insufficient balance leaves inventory unchanged;
- already-owned plot leaves inventory unchanged;
- invalid/non-sale plot leaves inventory unchanged;
- invalid price is rejected;
- successful purchase records ownership exactly once.

### Persistence / streaming

Test the pure state transition if there is an appropriate unit-test seam, then perform the full save/reload and stream-out/in browser scenario required by the plan.

## 14. Suggested implementation order

1. Inspect the current quest reward/effect shape and persistence migration helpers.
2. Add `coin` to `ItemKind`, `ITEM_DEFS`, `ITEM_CATALOG` with normal Inventory semantics.
3. Extend existing quest reward data with a small initial coin reward using the existing reward path.
4. Extend `VillagePlot`/generator with deterministic sale plots; reuse existing placement/scoring.
5. Add price configuration and stable settlement-scoped plot identity.
6. Add sparse persistent ownership to the existing `SaveData` schema/migration.
7. Add one domain purchase operation that validates everything before mutation.
8. Integrate sign creation into the existing settlement prop pipeline.
9. Integrate the existing `Interactable` desktop/touch flow.
10. Re-materialize signs/ownership correctly after settlement stream-in.
11. Add focused unit tests, then build/test.
12. Browser-verify purchase, inventory, streaming and reload as specified by the plan.

## 15. Potential plan changes worth making before implementation

The main plan should be clarified in these places:

- Replace the proposed new `LandPlot` type with an instruction to first extend the existing `VillagePlot` model.
- Make ownership explicitly persistent state separate from `VillagePlan`.
- Define plot identity as settlement-scoped (or document an existing global-ID guarantee).
- Explicitly state that sale-plot placement must use the existing settlement placement/scoring mechanism.
- Clarify that failure to find a valid placement may produce fewer plots than the configured maximum.
- Clarify coin weight because Inventory currently enforces carry weight.
- Keep settlement treasury out of V1 unless existing `SettlementEconomy` already provides a natural reusable mechanism.

## 16. Files likely to be involved

Initial targets, to be confirmed against the current code before editing:

- `src/items/items.ts`
- `src/items/itemCatalog.ts`
- `src/items/Inventory.ts` — probably no structural change required
- quest definitions/reward/effect files under `src/quest*` / `src/quests*`
- `src/settlement/villagePlan.ts`
- `src/settlement/settlementGenerator.ts`
- existing settlement prop/sign module(s)
- existing `Interactable` implementation
- `src/persistence/saveData.ts` and migration helpers
- existing settlement generator tests
- purchase/domain tests in the closest existing domain module

Do not modify `docs/STATE.md` merely because the plan is being implemented; update it only as part of the project's normal state-document maintenance after implementation.

## 17. Architectural guardrails

- No `player.money`.
- No `CurrencyCatalog`.
- No separate parcel generator.
- No second plot geometry model if `VillagePlot` can represent the concept.
- No ownership encoded in generated `VillagePlan`.
- No sign-specific input system.
- No persisted Three.js objects.
- No dynamic pricing in V1.
- No NPC land purchases in V1.
- No house-building integration in V1.
- No settlement treasury subsystem unless an existing economy mechanism genuinely requires it.

The desired final architecture is:

`deterministic VillagePlan`
`        +`
`persistent player-owned-plot state`
`        ↓`
`streamed settlement runtime`
`        ↓`
`existing sign + Interactable`
`        ↓`
`purchase domain operation`
`        ↓`
`Inventory coin removal + persistent ownership`

This preserves the project's core rule that generated world structure is deterministic while mutable consequences are stored as sparse persistent state.

## Playtest correction (issue [035](../issues/2026-08-19--035--playtest-coins-placement-inventory.md), 2026-08-19)

Plan 129 isolated `coin` from the merchant (`spawn: 'none'`, Kupiec paid in `shell`). Playtest showed sale plots with no reachable coin supply (quest coins were also cut by plan 160). Issue 035 switches Kupiec buy/sell to `coin`, adds a rare independent `world_chunk` coin pool (`cx:cz:c${i}`), and keeps `shell` as barter-only so muszle do not convert 1:1 into coins.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

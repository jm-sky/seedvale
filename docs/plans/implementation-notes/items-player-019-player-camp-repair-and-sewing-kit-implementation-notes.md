# Implementation Notes: items-player-019 — Player camp repair and sewing kit

## Dependency preflight

- `items-player-018` is still `planned` on current `main` and itself depends on `ui-input-010`. Current code therefore **does not yet contain** tent condition, camp inspection, full-camp intent, or a `PlayerIntentController`. Implement 019 only after reconfirming the actual post-018 APIs; do not recreate those mechanisms here.
- Current `PlacedTent` is still `{ id, x, z, yaw }`; `createPlacedTents().nodes()`/`pack()` strip to those fields. 018 is expected to add `condition` + degradation anchor. 019 must extend that resulting record, not the pre-018 shape.

## Tent must use the existing item-instance lifecycle

Relevant files:

- `src/items/itemInstances.ts`
- `src/items/Inventory.ts`
- `src/items/trade.ts`
- `src/items/tradeCatalog.ts`
- `src/app/actions/placementActions.ts`
- `src/app/actions/restActions.ts`
- `src/app/createApp.ts`

`itemInstances.ts` is the canonical classification/factory-support layer. Add `TentItemInstance`, `isTentItemInstance()` and `tent` to `INSTANCE_BACKED_KINDS`; extend `cloneItemInstance()` and `Inventory.SaveItemInstance` / `toSaveItemInstance()` so `condition` survives every clone/save boundary.

`createAcquiredInstance(kind)` in `trade.ts` is already the shared merchant/quest/pickup acquisition dispatch. Add fresh tent creation there (`condition: 100`); do not special-case merchant UI.

Changing `tent` to instance-backed requires auditing **all old stack callers**, not only placement. Current `main` still contains at least:

- `placementActions.ts`: `inventory.has('tent', 1)` and stack removal,
- `restActions.ts`: packing checks `inventory.canAdd('tent')` and returns a stack item,
- `createApp.ts`: Quick Actions availability uses `inventory.has('tent', 1)`.

After migration these paths must use concrete tent instances / `countInstances('tent')`; leaving even one stack-based path creates two representations or makes carried tents invisible to UI.

For placement, select a concrete instance **before** starting Busy, but re-resolve that instance by id on completion before removal. `trade.ts`'s current `selectInstanceToPlace()` is trap-specific; do not broaden its trap semantics accidentally. A tiny deterministic tent selector (condition then id, or simply id if no gameplay preference is desired) is sufficient.

## Stable physical identity

Prefer using the same id across `TentItemInstance.id ↔ PlacedTent.id`. Current `createPlacedTents.place()` generates its own `tent:${Date.now()}` id, so post-018 API should be extended to accept the carried instance/id rather than generating a second identity.

Packing must be transactional:

1. resolve current world condition to `now`,
2. build the carried `TentItemInstance` with the same id/condition,
3. verify `inventory.canAddInstance(instance)`,
4. only then remove/pack the world tent and add the instance.

Do not remove the world object first and then discover the inventory is full. `Inventory.canAddInstance()` already exists for the correct weight/size check.

Packed tents should not carry `lastConditionUpdateAtDays`; on redeploy set the world anchor to current `elapsedDays` so weather exposure resumes from that moment.

## Legacy stacked-tent migration

Do this in the existing persistence/restore migration flow, analogous to weapon/liquid-container stack → instance conversions. For each old stack count create N deterministic fresh tent instances and clear the stack count; after restore there must never be both `counts.tent > 0` and tent instances.

`SaveItemInstance` currently has only durability/sharpness/liquid fields, so `condition?: number` is required. Tent condition is `0..100`, unlike weapon/trap durability which is largely normalized; do not reuse `clamp01()`.

The generated id only needs to be stable within the migrated save result; follow the repository's existing migration ID convention rather than calling runtime `Date.now()` from a save migration if existing migration helpers use deterministic ids.

## Camp repair domain seam

Keep repair calculation pure and small, preferably a new `src/items/campRepair.ts` (or equivalent items-player domain file):

- `CampRepairKind = 'tent' | 'bedroll' | 'platform'`,
- definitions for capability/material/base points/duration/effort,
- `repairMaterialMultiplier(survival)`,
- `resolveCampRepair(...)` as the only preview/result calculator.

Do not put world lookups, Inventory mutation, Busy Action or Vue state into this resolver.

The plan's exact balance should remain data/constants: tent `25`, bedroll `34`, platform `17`; material multiplier `0.8 + 0.4 * survival`; duration through existing `survivalDurationMultiplier()`.

## Authoritative condition mutation

Current `SleepingUtilities` exposes `conditionOf()` reads but **no mutation API**. Do not mutate objects obtained from `.list()` as an implicit side effect. Add an explicit domain method per collection (or one shared helper) that atomically writes repaired `condition` and `lastConditionUpdateAtDays` after re-resolving current condition.

Post-018 should provide the same kind of explicit mutation seam for tents. Repair action code should only coordinate:

`lookup → resolve current condition → validate → Busy → relookup/revalidate → consume → domain repair mutation → XP`.

This also prevents stale weather exposure from being counted twice: successful mutation must store the resolved repaired value and advance the anchor to completion `elapsedDays`.

Use the post-018 shelter-factor/degradation API as implemented. Current pre-018 `resolveSleepingUtilityCondition(..., sheltered: boolean)` is expected to change; 019 must not hard-code today's boolean contract.

## Busy Action / effort / XP

Reuse the established short-action pattern from `placementActions.ts` / `survivalActions.ts`:

- `isActionBlocked(ctx)` at start,
- duration fixed when Busy starts,
- `physicalEffortBusyOptions(intensity, dayNight.dayLengthSec)`,
- all authoritative revalidation inside `onComplete`,
- material removed only inside successful completion,
- `awardSkillXp(..., 'survival', SKILL_XP_AWARD.repairCampEquipment)` only after a real condition increase.

Cancellation is already naturally transaction-safe if nothing is consumed/mutated before `onComplete`; do not add partial repair state.

## Capabilities and sewing kit

Extend `ItemCapability` / `CAPABILITY_NEED_LABEL` in `src/items/itemCatalog.ts`; gate only through `Inventory.hasCapability('textile_repair')`.

Add `sewing_kit` consistently to both item registries:

- `ItemKind` + `ITEM_DEFS` in `src/items/items.ts`,
- `ITEM_CATALOG` in `src/items/itemCatalog.ts`.

The plan says size `S`, but the actual enum is `XXS | XS | SM | MD | LG | XL`; use **`SM`** unless neighboring utility items clearly justify `XS`. Weight is `0.4 kg`, non-holdable, reusable, capability-only.

Merchant integration is only `MERCHANT_PRICES.sewing_kit = 18` + `MERCHANT_STOCK`; the existing trade flow handles a normal stackable sewing kit.

## Selling damaged tents

`resolveInstanceSellPrice()` currently applies condition pricing only to traps; there is no generic instance-condition discount helper. Extend this function for `TentItemInstance` with a monotonic condition-based discount, but keep the existing trap broken/usage semantics unchanged.

Also extend `trade.ts`'s internal instance ordering (`conditionRatio`) so selling multiple tents deterministically selects the most worn first. Do not pretend the existing trap discount is already generic.

## Inspection/UI integration

019 should attach repair actions to the contextual camp inspection introduced by 018. Keep preview preparation in app/domain code and pass only rendered values/actions into `FlavorDialog`; Vue must not calculate material efficiency or weather degradation.

Bedroll/platform currently are not generic inventory interactables; their repair action should resolve by stable world id from the inspection snapshot, then relookup on completion. Never retain mutable record references across Busy Action.

## High-value tests / likely regressions

Prioritize tests that cross subsystem boundaries:

- old stacked tent save → only tent instances after restore;
- merchant purchase → fresh tent instance at 100;
- damaged tent pack/redeploy/save-load preserves id + condition;
- inventory-full packing leaves world tent untouched;
- Quick Actions/placement availability still sees instance-backed tents;
- `cloneItemInstance()` and save conversion preserve tent condition;
- repair completion re-resolves weather condition and advances the anchor exactly once;
- material/tool/object disappearing during Busy causes no consume/mutation/XP;
- damaged-tent sell price is monotonic and multi-instance sell chooses worn tents deterministically.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

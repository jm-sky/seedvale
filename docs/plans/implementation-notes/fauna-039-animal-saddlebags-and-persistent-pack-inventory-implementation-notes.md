# fauna-039 — Animal saddlebags and persistent pack inventory — Implementation Notes

> Focused recon against current `main`. The plan direction is sound, but two assumptions need correction from current code: livestock `animalId` is not globally unique across settlements, and `PlacedContainers` is still chest/carry-oriented rather than a generic dynamic-container lifecycle.

## Current codebase facts that matter

- `AnimalDef` in `src/fauna/animalDefs.ts` already uses “presence = capability” for `mount`, `lead`, `draft`, etc. Add `pack?: PackConfig` there; do not introduce horse/donkey checks in interaction code.
- `AnimalAgent` is the authoritative per-animal state owner. Persistent livestock is serialized through `AnimalAgent.snapshot() -> AnimalSaveState`, then `LivestockRegistry`; restore uses `hydrate()`.
- Player-owned livestock is detached from settlement streaming and restored by `restoreDetachedPlayerOwnedLivestock(...)`. Keep the pack on the same `AnimalAgent`; no separate pack registry is needed.
- `InventoryContentsSnapshot`, `snapshotInventoryContents()` and `inventoryFromContents(snapshot, maxWeight, maxSize, decayModifier)` already preserve counts, exact instances and food batches. Use them directly for pack persistence.
- Existing `saddlebags` is already a normal `ItemKind` (`3 kg`, `LG = 4` size units), its GLB is already wired through the item model pipeline.
- `ContainerScreen` already provides stack transfer, exact-instance transfer and “Weź wszystko”. Its current semantic modes are only `'container' | 'corpse'`; labels such as “W skrzyni” are mode-derived, not hardcoded throughout the app.
- `PlacedContainers` already persists counts/instances/food batches and survives WorldBundle rebuilds via `nodes()`. This is the correct persistence path for the post-death ground pack.

## Recommended ownership split

### `animalDefs.ts`

Keep only species capability/tuning here:

```ts
export type PackConfig = {
  cargoCapacityKg: number
  cargoCapacityUnits: number
}

pack?: PackConfig
```

Suggested V1 size capacities:

```text
donkey: 24 units / 40 kg
horse:  32 units / 50 kg
```

Current units are `XXS=.01, XS=1, SM=2, MD=3, LG=4, XL=6`; the existing chest is 32 units. 24/32 keeps donkey meaningfully smaller while the horse matches chest volume. Treat these as gameplay tuning values; User can adjust after browser verification.

### `animalPack.ts`

Own the runtime/persistence mechanics, not Three.js or app UI. Prefer pure/small helpers around:

- constructing `Inventory` with both finite `maxWeight` and `maxSize`;
- snapshot/hydrate using the existing inventory snapshot helpers;
- equip/unequip eligibility and empty check;
- lossless detach snapshot for the death handoff.

Do not persist derived capacity. On hydration, derive it from the current `AnimalDef.pack`.

### `AnimalAgent`

Add one optional pack field and thin semantic methods/accessors. Extend `snapshot()` / `hydrate()`; keep transfer/UI logic outside the class.

The attached visual can be a child of `animal.mesh`, which is already the moving visual root. This avoids any per-frame transform sync. Keep the visual handle runtime-only and make attach/remove idempotent.

## Persistence details

Add optional `pack?: AnimalPackSnapshot` to `AnimalSaveState`.

Also update `src/persistence/saveData.ts::isLivestockSaveRecord()` with an explicit validator for the pack snapshot; otherwise malformed pack contents would pass through the current livestock validator unchecked. Reuse the existing inventory-snapshot validation helper.

Current codebase precedent allows new optional persistence fields without a version bump when absence exactly preserves legacy semantics. `pack?: ...` has that property: old livestock records naturally mean “no pack”. Therefore prefer **no migration/version bump** unless implementation changes an existing required representation or validator contract beyond this optional field. Do not fabricate capacity or contents.

No new top-level `SaveData` field is needed. `app/saveState.ts` should remain unchanged for equipped packs because livestock serialization already flows through `AnimalAgent.snapshot()`.

## Equip / unequip transaction

Use the existing player-owned-animal contextual dialog in `gameLoop.ts`: player-owned animals already open `Steruj: <animal>` with contextual actions. Add pack actions there rather than changing the base gaze prompt in `interactables.ts`.

Current mounted routing suppresses normal world interaction, so V1 should require dismount. Do not alter mount targeting.

Equip should be commit-last from the item side:

1. re-resolve/revalidate the live animal, ownership, alive state, capability and no existing pack;
2. construct the empty finite-capacity pack state;
3. remove exactly one `saddlebags`;
4. install the pack and visual;
5. call the existing livestock persistence/upsert seam if the action bypasses a normal registry capture point.

If installation can fail after item removal, roll the item back. Prefer structuring pack construction so all fallible work happens before removing the item; GLB loading must never participate in gameplay success.

Unequip is the inverse: require empty pack and preflight `playerInventory.canAdd('saddlebags', 1)`, then mutate both owners in one synchronous action. Visual cleanup follows state, never drives it.

## ContainerScreen integration

Do not create a new screen. Extend the transfer session in `containerActions.ts` with an animal-pack source, or extract a very small Inventory-backed source adapter if that reduces branching.

A useful boundary is: transfer code receives the source `Inventory` plus source metadata/capabilities, while the session retains stable identity (`animalId`) and re-resolves the live animal before every mutation. Do not retain only an `Inventory` reference across close/stream/rebuild.

The UI needs one small semantic extension because `ContainerScreenMode` currently has only `container|corpse`. Add a pack/storage mode or make source labels explicit enough to show e.g. “W jukach”; keep deposit enabled and “Weź wszystko” on the same existing handlers.

Reuse:

- `inventoryFullToastText()`;
- freshness-aware `Inventory.removeWithFreshness()/addWithFreshness()` flow already used by containers;
- `withdrawInstanceRollbackSafe` / existing exact-instance transfer pattern;
- current `maxTransferable` logic for “Weź wszystko”.

Pack deposit must use the pack `Inventory.canAdd*` checks so both 40/50 kg and size capacity are enforced.

## Presentation

Keep manual transforms exactly separate from gameplay:

```ts
SADDLEBAGS_PLACEMENT: Partial<Record<AnimalKind, SaddlebagsPlacement>>
```

Use zeros/ones as initial values as requested; User tunes horse/donkey transforms in browser.

For the attached model, reuse the existing item GLB loader/cache path instead of loading `public/models/items/saddlebags.glb` through a new loader. Clone the cached asset before attaching because the object becomes per-animal presentation.

Guard async completion with current pack state / token semantics: an unequip, death or disposal that happens while the GLB is loading must not let a late promise attach a stale duplicate mesh.

## Death handoff: important correction

Do not use `animal-pack:<animalId>` as the persisted world-container id. Current `livestock.ts` explicitly documents that `animalId` collides across settlements and therefore namespaces removed IDs with `settlementId`.

Use a stable helper based on the same origin identity, e.g.:

```text
animal-pack:<settlementId>:<animalId>
```

Prefer one shared helper rather than duplicating string construction.

The handoff must stay outside `AnimalAgent`: fauna owns the pack state, but only world/app composition should create a `PlacedContainer`.

For V1, every legal pack owner is player-owned, and those records are restored through the detached player-owned path independently of settlement streaming. This gives a bounded restore reconciliation seam: after detached livestock is restored and `PlacedContainers` exists, reconcile dead player-owned animals with packs. Future merchant/NPC pack ownership may require extending reconciliation to unloaded registry records, but do not build that broader machinery in fauna-039.

Runtime death should perform the same idempotent helper immediately. Re-running it after restore must be safe.

## Generalizing `PlacedContainers` without breaking chest carry

Current implementation has several chest-specific assumptions that must be addressed together:

- `ContainerKind = 'chest' | 'casket'`;
- `ContainerDef.itemKind` is currently literal `'chest'`;
- `spawn()` and `putDownCarried()` always call `createPlacedContainerProp()`;
- `place()` always generates a `chest:...` id;
- `pickUp()` always converts a world container into the player's special carried-container state;
- `carriedWeightKg()` then contributes that carried container to player encumbrance.

Add `saddlebags` by policy, not by sprinkling kind checks. At minimum the definition needs:

- recoverable `itemKind` capable of being `saddlebags`;
- pickup policy (`carry-container` / `empty-to-item` / non-pickable if needed);
- a presentation factory/discriminator.

Do **not** let ground saddlebags enter `PlacedContainers.carried`, `SaveCarriedContainer` or `carriedWeightKg()`.

Death handoff also needs an API that materializes a placed container from a caller-supplied stable id and inventory snapshot. Existing `place()` is unsuitable because it generates a timestamp id and an empty inventory. Make this operation idempotent: if the id already exists, report “already materialized” without replacing contents.

For a ground pack, normal placed-container storage semantics may remain gabarite-only; the 40/50 kg limit is an animal carrying capability derived from `AnimalDef.pack`. Do not persist the originating animal capacity into `SavePlacedContainer` just to preserve that limit after ownership has moved to the world.

Empty-to-item pickup should be an app-layer transaction:

1. resolve placed entry and policy;
2. require empty contents;
3. preflight player inventory for `def.itemKind`;
4. add the item and remove the placed entry atomically/rollback-safe.

A dedicated `remove(id)`/consume operation on `PlacedContainers` is cleaner than abusing `pickUp()`.

## Ground visual and interaction

Use the same saddlebags asset, but a separate ground transform/factory from `SADDLEBAGS_PLACEMENT`.

Make `interactables.ts` derive the secondary action from container policy. Opening remains the existing container action. For non-empty saddlebags, keep the secondary action visible if desired but let the authoritative action return “Najpierw opróżnij juki.”; alternatively omit it until empty. Whichever UX is chosen, the mutation must revalidate emptiness.

The ground container's persisted counts/instances/food batches already round-trip through `SavePlacedContainer`; do not add another save path.

## Failure / lifecycle traps

- Do not clear the animal pack before the placed-container materialization succeeds.
- Do not let an attached visual survive `AnimalAgent.dispose()`.
- Do not make death handoff depend only on `onDeath`; `hydrate()` deliberately does not re-fire death callbacks.
- Do not use a live animal/object reference as transfer-session identity; re-resolve by stable id.
- Do not use `WorldGeneratedContainers` for dropped packs.
- Do not copy container contents through player inventory during death/equip transitions.
- Do not let food freshness reset while converting animal pack -> ground pack.
- Do not update future merchant plans as part of this implementation unless their text becomes contradictory after fauna-039 lands; fauna-039 should expose reusable actor-neutral domain seams first.

## Suggested implementation order

1. Add `PackConfig`, horse/donkey tuning, `animalPack.ts`, `AnimalSaveState.pack`, validator/migration and focused snapshot/hydrate tests.
2. Add equip/open/unequip actions against the existing player-owned contextual dialog and ContainerScreen transfer flow.
3. Add attached presentation with async stale-result protection.
4. Generalize `PlacedContainers` by policy + stable materialization/removal API, preserving chest carry behavior.
5. Add one shared death/reconciliation handoff and detached-restore reconciliation.
6. Add focused tests for exactly-one ownership, rollback, namespaced stable IDs, persistence, death idempotence and no contribution to player encumbrance.

Browser/gameplay verification remains User-owned.

# Implementation Notes: Player-owned horse debug controls

**Plan:** `tools-014-player-owned-horse-debug-controls.md`  
**Reviewed against:** `main`, 2026-09-15

## Recon conclusion

`window.seedvale.debug` już istnieje i jest instalowane tylko w debug mode. `src/debug/npcDebugApi.ts` jest aktualnym composition surface i powinno zostać rozszerzone zamiast tworzyć nowy global/DebugManager. Player-owned horse lookup musi używać persistent livestock boundary, bo koń może być detached i nie należeć do loaded settlement arrays.

## Existing mechanisms to reuse

- `src/debug/npcDebugApi.ts` — `window.seedvale.debug` registration, plain JSON-safe return values.
- `src/settlement/livestock.ts`:
  - `resolveLivePersistentAnimal(...)`
  - `LivestockRegistry`
  - `detachedById`
  - `detachedOriginById`
  - `isPlayerOwnedLivestockRecord(...)`
- `AnimalAgent` public state/snapshot methods — identity, owner, needs, dead state, position.
- `ownedAnimalControl.ts` snapshot for mode/stay anchor.

## API shape

Expose nested namespace on existing object:

```ts
seedvale.debug.horse.list()
seedvale.debug.horse.teleportToPlayer(animalId?)
seedvale.debug.horse.resurrect(animalId?)
```

Do not expose mutable `AnimalAgent`, registry maps or Three objects.

## `horse.list()`

Build list from the persistent livestock authority, not only live settlement animals. Include player-owned records and match live agents when present. Recommended plain fields:

- `animalId`, `name`, `originSettlementId`,
- `live`, `dead`, `owner`,
- control `mode` + `stayAnchor`,
- `x/y/z` when live,
- health/hunger/thirst/stamina where already publicly inspectable,
- enough status to tell saved-only/tombstoned/live-detached apart.

Do not invent a second diagnostic registry.

## Horse selection helper

One shared internal resolver for teleport/resurrect:

- explicit id -> require player-owned horse;
- no id + exactly one candidate -> use it;
- no id + 0/many -> structured `{ ok:false, reason, candidates }`.

Do not silently choose first horse.

## Teleport

Resolve a **live** player-owned horse through existing persistent-animal lookup. Move the existing identity near player and ground-snap through the same fauna movement/height seam used by the agent; avoid raw scene-only relocation that leaves navigation/trip state behind.

After relocation clear only transient movement commitments that would immediately pull the horse back to its previous target. Preserve owner, name, control mode and Stay anchor unless the command explicitly documents otherwise. Persist/upsert after the debug mutation so save state matches live state.

## Resurrect

This is the highest-risk command. Prefer a small fauna/livestock-owned debug operation rather than manipulating fields from `npcDebugApi.ts`.

Cases:

1. **Live dead corpse still exists:** revive the same `AnimalAgent` identity through an explicit lifecycle reset helper; restore minimum valid HP/stamina, clear corpse/death terminal state, retain owner/name/control.
2. **Already removed/tombstoned:** use origin `settlementId + animalId` and registry data to atomically remove the matching tombstone and restore exactly one player-owned saved/live individual. Never allow deterministic merchant-horse reconstruction plus resurrected detached horse simultaneously.

If the current registry API cannot undo one tombstone, add the narrow operation there (`unmarkRemoved`/equivalent) with tests. Do not edit raw save arrays in the debug layer.

## Files / symbols

- `src/debug/npcDebugApi.ts` — existing global debug composition.
- `src/app/createApp.ts` — inject player position/persistent livestock dependencies into debug API; preserve `isDebugMode()` gate.
- `src/settlement/livestock.ts` — authoritative lookup/registry/resurrection seam.
- `src/settlement/SettlementsManager.ts` — detached collections/accessors if needed.
- `src/fauna/AnimalAgent.ts` / corpse lifecycle module — narrow revive operation if no safe one exists.

## Tests

- debug API absent outside debug mode remains unchanged;
- `list()` includes detached player-owned horse and returns plain data;
- ambiguous no-id command refuses with candidates;
- teleport preserves identity/owner/control and persists new position;
- resurrect live corpse keeps same id;
- resurrect tombstoned horse results in exactly one live/saved player-owned record and no conflicting tombstone;
- non-player-owned horse cannot be teleported/resurrected by this namespace.

Browser/DevTools verification wykonuje User.

## Implementation (2026-09-15)

- `LivestockRegistry.restoreRemoved` / `getRemovedSnapshot` — in-session last record at tombstone time; not serialized.
- `AnimalAgent.relocateOnGround` / `reviveForDebug` — ground-snap + trip/nav clear; same identity revive.
- `src/settlement/playerOwnedHorseDebug.ts` — list / select / teleport / resurrect over `PersistentLivestockContext`.
- `SettlementsManager` thin wrappers; `seedvale.debug.horse` on existing `npcDebugApi`.
- Tombstone after save/load without in-session snapshot returns `tombstone-record-unavailable` rather than spawning a new merchant/house slot.

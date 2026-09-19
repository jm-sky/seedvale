# Implementation Notes: ui-input-025 — Road travel autopilot

**Plan:** `docs/plans/ui-input-025-road-travel-autopilot.md`  
**Reviewed:** 2026-09-19  
**Source:** current `main` + targeted recon of roads, player/mount movement, world locations, fauna threat seams, game-loop ordering and notifications

## Current architecture to reuse

### Regional roads are already authoritative

`src/settlement/roadNetwork.ts` already owns deterministic regional road/path geometry:

- `RoadRoute` = `points` + `segments` + `crossings`;
- `RoadSegment.kind` = `road | path`;
- `neighborsFor(cell, ctx)`;
- `findRoute(a, b, options)`;
- settlement↔settlement route resolution and cache;
- settlement↔minor-location routing via `routeToMinorLocation()`;
- canonical ford/bridge crossing classification.

Do not create a second graph or recalculate terrain/crossings in the autopilot layer.

The missing piece is graph-level composition across more than one existing road edge. Keep that as a small entity-neutral resolver adjacent to road ownership, not in Vue or `PlayerController`.

### Local pathfinding already exists and has the correct boundary

`npc-006` introduced the bounded/request-based local navigation layer used by NPC/fauna detailed movement.

Important architectural rule from that plan remains valid:

```text
regional road itinerary != generic local pathfinder
```

The autopilot should use regional road/path waypoints as the committed corridor, while the existing local navigation/collision stack deals with short local obstruction handling. Do not turn `roadNetwork.ts` into a general navmesh.

## Destination ownership

### Use `WorldLocationCatalog` + `LocationKnowledge`

`src/world/locations/worldLocationCatalog.ts` provides:

```ts
getById(id: string): WorldLocation | null
```

and returns deterministic world-space `x/z`, kind and name for stable IDs.

`src/world/locations/locationKnowledge.ts` is the authoritative sparse set of locations known by the player:

```ts
knowledge.has(id)
knowledge.get(id)
knowledge.list()
```

Autopilot start eligibility should be based on these two owners:

```text
knowledge.has(id)
&& catalog.getById(id) != null
```

Do not infer "known" from map-cell fog or proximity alone.

### Reuse `NavigationTargets` as the UI selection surface, not as autopilot state

`src/world/locations/navigationTargets.ts` already stores up to three stable `WorldLocation.id` travel targets and is persisted separately from knowledge.

This is a good existing entry surface for "Podróżuj", but do not overload it with active autopilot execution state.

Keep:

```text
NavigationTargets = player-selected map targets
TravelAutopilot = one active runtime travel commitment
```

A target may stay selected after autopilot cancellation unless UX explicitly removes it.

### World map integration

The current map UI is `src/ui-vue/screens/WorldMapScreen.vue` and already mutates navigation targets through app callbacks/handles. Add the travel action there or through the same world-map action wiring. Vue should receive stable IDs and callbacks; it must not hold copies of road geometry or authoritative location state.

## Regional itinerary implementation

Prefer a new pure/data-only module next to road ownership, e.g. under `src/settlement/` or a neutral road/travel module, rather than placing graph search in `ui-input`.

The resolver should consume:

- current player world position;
- destination `WorldLocation`;
- `RoadNetworkContext`;
- existing settlement identity/cell resolution;
- canonical per-edge `RoadRoute`.

Expected output shape should preserve route-leg identity instead of flattening away all semantics too early, for example:

```ts
type RegionalTravelLeg = {
  kind: 'connector' | 'road' | 'path'
  points: readonly { x: number; z: number }[]
}

type RegionalTravelItinerary = {
  destinationId: string
  legs: readonly RegionalTravelLeg[]
}
```

Exact names are flexible, but keep these invariants:

- road/path legs come only from canonical `RoadRoute`;
- connectors are short local-only joins;
- no wilderness shortcut between regional legs;
- failed canonical route = unavailable edge;
- deterministic tie-break for equal-cost graph alternatives;
- graph search happens on start/replan only, never each frame.

For V1, edge cost can be route length. Do not add danger/weather/road-quality weighting here.

## Player walking integration

### Current owner

`src/player/PlayerController.ts` owns player locomotion and currently has no generic `moveTo()` API. It owns:

- movement speed / sprint;
- slope constraints;
- collision resolution;
- grounding/vertical motion;
- animation;
- stamina coupling;
- mounted/downed/resting gating.

The autopilot must not bypass any of this.

### Add an explicit external movement-intent seam

Do not mutate `keyboard.state` to fake WASD.

Prefer a narrow transient input shape passed into or set on `PlayerController`, e.g.:

```ts
type PlayerMovementIntent = {
  wishX: number
  wishZ: number
  sprintRequested: boolean
}
```

Normal input and autopilot input must be mutually exclusive for a frame.

Manual movement detection should happen before autopilot intent is applied:

```text
meaningful keyboard/touch movement
→ cancel autopilot
→ player input owns movement immediately
```

Camera/mouselook input does not cancel.

Keep `PlayerController.update()` as the single movement executor.

## Mounted integration

`src/app/actions/mountActions.ts` is the single riding orchestration owner.

Current flow:

```text
mount.update(dt, dayFactor)
→ driveInput()
→ AnimalAgent.driveMounted(dt, wishX, wishZ, sprintRequested, ...)
→ riding XP/stamina
→ seat sync
→ stability/fall
```

`gameLoop.ts` calls `mount.update(...)` immediately before `player.update(...)`.

Do not add an autopilot-specific movement method to `AnimalAgent`.

Instead, extend `MountActions` so its input source can be:

- normal keyboard/mouselook-derived intent;
- autopilot-provided `wishX/wishZ/sprintRequested`.

Keep the rest of `update()` unchanged so Riding XP, stamina, foreign-property use, seat sync and fall checks still execute identically.

A manual dismount, fall, mount death, unavailable mount or downed state must report an autopilot cancellation reason upward; do not make the autopilot poll private `mount` internals.

## Game-loop ordering

Current relevant order in `src/app/gameLoop.ts`:

```text
mount.update(...)
lead.update()
player.update(...)
...
fauna/world updates and combat callbacks
```

The autopilot runtime should compute/refresh movement intent before `mount.update()` / `player.update()` for that frame.

Do not move player or mount movement after fauna/combat merely for autopilot.

Interruption caused by damage later in the same frame may cancel the commitment for the next movement tick; do not rewind movement already executed in that frame.

## Threat / escape seam

### Reuse fauna-owned threat state

`AnimalAgent` exposes the read-only:

```ts
isThreateningHuman(): boolean
```

This means the animal's latest own decision is currently `attack` against a human target. Existing NPC threat wiring already builds bounded candidate lists from this accessor instead of importing fauna decision logic.

For autopilot, follow the same pattern:

- build/read a bounded local set from currently relevant fauna;
- use `isThreateningHuman()` plus distance/context;
- never duplicate `predatorHumanDecision.ts` scoring inside the autopilot.

The initial escape trigger should be conservative and based on **actively threatening** animals, not all predators inside a broad radius.

Important limitation: `isThreateningHuman()` can also represent an attack decision against an NPC for frenzy paths. Before using it as a direct "player threatened" boolean, verify the current `npcAttackTarget`/player-target distinction at the call site. Prefer a narrow read-only fauna helper if needed rather than guessing from distance.

### Escape is locomotion urgency only

Keep:

```text
same destination
same itinerary
normal → escape
```

Walking maps escape to sprint request when the existing stamina rules allow it.

Mounted escape maps to the existing faster gait request through `driveMounted()`.

Do not generate a separate flee destination.

## Damage interruption

`src/player/playerDamage.ts::applyPlayerDamage()` is the canonical player HP-loss seam and returns:

```ts
{
  finalDamage,
  defenseOutcome,
  enteredDowned
}
```

Use `finalDamage > 0` as the actual-hit stop condition.

Do not cancel on a fully blocked/dodged attempt.

Current fauna→player damage is composed in `src/app/gameLoop.ts` through the existing `onHumanHit` callback into `applyPlayerDamage()`; wire the autopilot cancellation at this composition layer or through a narrow shared post-damage callback rather than importing autopilot state into `playerDamage.ts`.

Note: starvation/dehydration also call `applyPlayerDamage()`. The plan currently says "real player damage" stops autopilot, so unless product semantics are changed, any actual HP loss through this owner should cancel consistently.

## Other cancellation seams

Centralize cancellation reasons in the autopilot runtime, e.g.:

```ts
type TravelAutopilotStopReason =
  | 'manual-input'
  | 'manual-cancel'
  | 'damage'
  | 'downed'
  | 'mount-fall'
  | 'mount-death'
  | 'mount-unavailable'
  | 'manual-dismount'
  | 'destination-invalid'
  | 'route-unreachable'
  | 'world-rebuild'
  | 'arrived'
```

Do not scatter toast text across call sites. Call sites should report semantic reasons; one presentation layer resolves text/notification severity.

## Arrival semantics

Resolve arrival from existing location semantics, not one global magic radius.

Known existing owners:

- settlements: `locationProximityDiscovery.ts` uses the authoritative `VillagePlan.boundary`;
- caves: `CAVE_ENTRANCE_DISCOVERY_RADIUS` around the canonical entrance;
- other `WorldLocation` kinds: use their existing interaction/discovery semantics where available.

If V1 needs a fallback for a kind with no semantic radius, keep it explicit per kind in a small resolver. Do not add a single huge generic radius that changes settlement/cave meaning.

## Notifications

### In-game

Reuse `src/ui/createToast.ts`. Keep notification text in the autopilot/UI layer, not road or movement modules.

Deduplicate by episode/state transition:

- emit once on `normal → escape`;
- no repeated toast while the same escape episode persists;
- emit once on terminal stop/arrival.

### System Notification API

No wrapper exists on current `main`.

Add a tiny browser capability wrapper in `ui-input`/UI infrastructure rather than calling `new Notification()` from simulation code.

Contract should cover:

```ts
canRequestPermission()
requestPermissionFromUserGesture()
notifyIfHidden(...)
```

Rules:

- never request permission at boot;
- request only from a user gesture, preferably an explicit setting/action associated with travel notifications;
- missing/denied permission is normal and silently falls back to in-game alerts;
- emit only when `document.visibilityState !== 'visible'`;
- no Service Worker/Web Push;
- no claim that travel progresses after the tab/app stops executing.

Good terminal system-notification candidates:

- damage/attack stop;
- downed;
- mount fall/death/unavailable;
- route failure;
- arrival.

Do not emit a system notification for ordinary escape if travel continues.

## Lifecycle / rebuild

`WorldLocationCatalog` itself is built with live thunks and survives `WorldBundle` rebuilds, but active autopilot execution must not.

Create one explicit lifecycle method:

```text
autopilot.cancel('world-rebuild')
```

Call it before/at world rebuild disposal.

Do not persist itinerary, waypoint index or escape state in SaveData.

Do not store live `Settlement`, `ChunkManager` or `AnimalAgent` references inside the itinerary. Stable IDs + plain coordinates only.

## Suggested implementation order

1. Add pure regional itinerary resolver + tests.
2. Add transient `TravelAutopilot` owner with start/cancel/advance state machine, no movement integration yet.
3. Add walking external movement-intent seam to `PlayerController`.
4. Wire map/known-location start + cancel + arrival UI.
5. Extend `MountActions` input source and mount cancellation callbacks.
6. Add threat-derived `normal/escape` transition.
7. Add canonical damage and other stop reasons.
8. Add toast deduplication.
9. Add tiny Notification API wrapper + permission UX.
10. Add rebuild/dispose hooks and focused integration tests.

This ordering keeps routing, execution and notifications independently testable.

## Tests with highest value

### Pure/unit

- graph itinerary spans multiple settlement edges in correct order;
- equal-cost path tie-break is deterministic;
- missing/failed `RoadRoute` edge is excluded;
- unknown `LocationKnowledge` ID cannot start;
- connector length/policy prevents cross-country shortcut;
- waypoint advancement does not skip/reverse legs;
- escape mode preserves destination and itinerary;
- stop reason transition is terminal/idempotent;
- notification transition dedupe.

### Integration

- manual keyboard/touch movement cancels before autopilot intent drives another frame;
- mouselook alone does not cancel;
- walking autopilot still goes through normal slope/collision/stamina;
- mounted autopilot still executes riding XP/stamina/stability;
- blocked/dodged hit does not stop, `finalDamage > 0` does;
- mount fall/death/manual dismount propagates the correct reason;
- rebuild clears the executor and leaves no stale reference;
- hidden-tab + granted permission emits one system notification;
- denied/default permission still produces in-game toast only.

## Files most likely to change

- `src/settlement/roadNetwork.ts` and/or a new sibling regional-itinerary module;
- `src/player/PlayerController.ts`;
- `src/app/actions/mountActions.ts`;
- `src/app/gameLoop.ts`;
- `src/app/createApp.ts` for lifecycle/wiring;
- `src/world/locations/navigationTargets.ts` only if a narrow callback/helper is genuinely needed — do not put executor state there;
- `src/ui-vue/screens/WorldMapScreen.vue` and its existing app/store wiring;
- `src/ui/createToast.ts` consumer wiring, not necessarily the facade itself;
- new small Notification API wrapper under UI/input ownership;
- focused tests beside the new itinerary/autopilot modules and existing mount/player tests.

## Guardrails

- no keyboard-state mutation to fake autopilot;
- no `AutopilotPathfinder`;
- no second road graph;
- no second mount movement path;
- no direct fauna decision imports into UI/autopilot;
- no per-frame regional A*;
- no active autopilot persistence in V1;
- no Service Worker/Web Push;
- no background travel simulation;
- no browser verification by the AI agent.

After implementation, update current-state docs only where the new runtime contracts materially change documented behavior.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

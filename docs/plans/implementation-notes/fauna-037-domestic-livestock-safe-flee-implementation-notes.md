# Implementation Notes: fauna-037 — Domestic livestock safe flee

**Plan:** `docs/plans/fauna-037-domestic-livestock-safe-flee.md`  
**Reviewed:** 2026-09-17  
**Source:** current `main` + targeted fauna flee/livestock ownership/roaming recon

## Verified current seams

### `AnimalAgent` already owns the runtime flee execution

`src/fauna/AnimalAgent.ts` is the one per-animal runtime for both wild fauna and livestock. The current flee primitive is `fleeFrom()`, and existing high-priority danger behaviour already moves through fauna's sprint path.

Do not create a livestock movement controller or duplicate the fauna decision table.

### Sprint/cadence are not the bug

`src/fauna/animalDefs.ts::AnimalDef` already exposes `walkSpeed` and `sprintSpeed`; `AnimalAgent` owns `walkSpeedNow()` / `sprintSpeedNow()`.

`docs/state/fauna.md` confirms threat/flee behaviour is classified `immediate` by `animalUpdateCadence.ts`. Therefore this plan should not solve the problem with another update loop, run flag or higher tick rate.

### Home/ownership already exists

`AnimalAgent` already owns a stable `home` vector. Household livestock has `ownerHouseId`, and ordinary movement is constrained by the existing home/roaming logic. The current code also has pasture-specific roaming (`shouldUsePastureRoam()` / `_pastureRoam`) for owned non-player livestock.

This gives the implementation local identity/home facts without a settlement scan.

### Existing home clamp can fight emergency displacement if left naive

`AnimalAgent`'s normal bounds logic intentionally returns household livestock toward its normal home/pasture envelope. A threat-owned destination therefore needs to stay authoritative while the flee episode is live; otherwise the agent can select safety and immediately be pulled back by routine bounds.

Follow existing committed-movement exceptions rather than disabling bounds globally.

### Cross-domain data must be injected, not discovered

The fauna agent should receive only the minimal pre-resolved safety context it needs. Current architecture already prefers composition hooks over global queries.

Likely providers are `src/fauna/createFauna.ts` plus the existing settlement livestock creation/integration path in `src/settlement/livestock.ts`. Verify the narrowest existing hook before adding a new one.

## Recommended implementation shape

Prefer extracting a pure resolver that answers only destination preference, e.g. conceptually:

```ts
resolveDomesticFleeTarget({
  animalPosition,
  threatPosition,
  shepherdAnchor,
  homeAnchor,
  settlementAnchor,
})
```

The exact type/name is implementation-owned. Keep it independent of Three.js objects where practical so directional tests stay cheap.

The resolver should return either a valid preferred anchor/direction or `null`, allowing `AnimalAgent.fleeFrom()` to remain the unchanged fallback.

## Anchor semantics

Priority:

1. responsible shepherd/handler,
2. owning household/livestock home,
3. owning settlement safe area,
4. generic away-from-threat fallback.

Do not interpret "shepherd" as "nearest NPC in the world". The responsible context must come from existing household/shepherd ownership seams or be absent.

Similarly, a settlement anchor should be provided by settlement composition; `AnimalAgent` must not scan village plans/managers itself.

## Directional safety gate

Before accepting an anchor, calculate whether the initial movement toward it increases rather than decreases immediate separation from the threat.

Keep this local and deterministic. A full path planner is not required by this plan.

Important edge cases:

- anchor is on the far side of the predator → reject,
- anchor almost coincides with the animal → reject/skip rather than producing unstable direction,
- all anchors invalid → use existing away vector,
- water/slope/collision invalidates actual travel later → existing movement/navigation rules remain authoritative.

## Flee episode lifetime

Do not persist contextual flee targets.

The chosen safety intent should exist only while live danger owns the high-priority branch. When the threat disappears, existing routine roaming/pasture/home semantics should take over again.

Avoid a timeout registry if the episode can be derived directly from current threat state.

## Files to inspect first during implementation

- `src/fauna/AnimalAgent.ts`
  - `fleeFrom()`
  - threat/prey behaviour branch that invokes it
  - `clampBounds()`
  - `shouldUsePastureRoam()` / `_pastureRoam`
  - `home`, `ownerHouseId`
- `src/fauna/animalDefs.ts`
  - verify existing sprint remains authoritative
- `src/fauna/createFauna.ts`
  - existing dependency/context injection into agents
- `src/settlement/livestock.ts`
  - household-owned livestock creation/home/pasture context
- existing fauna movement/flee/roaming tests

## Performance guardrails

- no `AnimalAgent → all NPCs` scan,
- no `AnimalAgent → all settlements` scan,
- no new worker,
- no persisted alarm/safety registry,
- no additional per-frame heap-heavy object graph if a small readonly context/reference suffices.

## Tests worth keeping pure

Prefer pure tests for:

- anchor preference order,
- direction-away validation,
- invalid/degenerate anchors,
- fallback when no valid anchor exists.

Use `AnimalAgent` integration tests only to prove:

- selected contextual escape keeps sprint execution,
- routine home clamp does not cancel the live flee episode,
- ordinary roaming resumes after threat clear.

## Documentation follow-up

After implementation update `docs/state/fauna.md` with the domestic contextual flee semantics; keep the existing statement that livestock is ordinary `AnimalAgent` and that threat/flee cadence remains immediate.

## Manual verification boundary

AI implementation should run automated/type checks only. Browser gameplay verification is the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
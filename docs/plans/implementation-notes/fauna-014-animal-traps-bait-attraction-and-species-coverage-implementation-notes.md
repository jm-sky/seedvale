# fauna-014 — Animal traps bait attraction and species coverage — Implementation Notes

> Review against current `main`. Extend the existing trap, fauna decision, diet and interaction paths. Do not add a parallel trapping AI, scent simulation or trap-specific food compatibility model.

## Current ownership and integration points

- `src/world/animalTraps.ts` owns pure trap-domain rules and persisted `PlacedTrapRecord` shape. Keep trap compatibility and capture/detection math here or in a small adjacent pure module if it grows materially.
- `src/world/createPlacedTraps.ts` owns placed trap runtime state, scene objects, weather wear, capture resolution and current throttled trap↔animal proximity checks. It already persists/rehydrates `baitKind`; do not introduce separate bait persistence.
- `src/app/actions/gatheringActions.ts` owns player-facing trap actions and inventory side effects. Today `armTrap()` activates first and then auto-selects bait through `BAIT_ITEM_PRIORITY`; this is the path to replace with an explicit chosen bait / no-bait action.
- `src/fauna/faunaDecision.ts` is the pure central behaviour arbiter. Current priorities are player response 90/80, NPC response 70/60, fire 50, frenzy 40, dog guard 35, predator-normal 30 and prey-normal 20. Attraction must enter this arbitration instead of moving animals directly from the trap runtime.
- `src/fauna/AnimalAgent.ts` owns movement/navigation and executes the chosen fauna behaviour. Reuse its existing pathing/movement lifecycle for moving toward a lure target.
- `fauna-010` has already introduced species diet/metabolism integration. `AnimalAgent` uses the shared feeding/nutrition path and `consumeFood`; trap bait compatibility should query the same diet contract rather than `foodFreshness.bait()` alone.
- `src/items/foodFreshness.ts` still exposes `BAIT_ITEM_PRIORITY` and generic `food.bait` metadata. That priority can remain for fishing or other callers, but trapping must stop using it for automatic selection.
- The shared contextual UI already supports actions through `FlavorDialog.vue` / `ui.flavorDialog` using `InteractionPanelAction`. Reuse it for trap choices rather than introducing a dedicated trap modal or second inventory UI.

## Species coverage

The current `TRAPPABLE_SPECIES` set in `animalTraps.ts` is intentionally narrow: `boar`, `deer`, `rabbit`. `deer` is the roe-deer/sarna kind; `stag` is the larger deer/jelen.

Replace the flat set with one declarative compatibility lookup keyed by `TrapKind` and `AnimalKind` (or an equivalent pure helper). Keep `isTrappableSpecies` only if useful as a broad derived query; capture eligibility itself must include trap kind.

Target V1:

- simple: `rabbit`, `fox`, `deer`, `boar`
- good: `rabbit`, `fox`, `deer`, `boar`, `stag`, `wolf`
- `bear`: neither
- domestic/livestock: neither

`createPlacedTraps.update()` currently filters only by species before distance/cooldown resolution. Change that guard to the trap-kind-aware compatibility function before resolving an encounter.

Do not make `wolf`, `stag`, `bear` special cases in `createPlacedTraps.ts`.

## Bait compatibility

`food.bait: 'meat' | 'plant'` is not sufficient as the species compatibility authority. It says an item is usable as bait, not that a given species wants it.

Use the diet API introduced by `fauna-010` as the authority for:

`AnimalKind + ItemKind -> edible/attractive?`

If the existing diet helper is currently only instance-oriented inside `AnimalAgent`, extract the smallest pure helper from the existing diet definition rather than duplicating diet tables for traps.

Trap bait candidate filtering in UI may use generic bait-capable metadata first for efficiency, but the attraction decision must ultimately validate against the species diet.

Do not consume or mutate `AnimalLife.hunger` when an animal is merely attracted to bait. The bait is a lure stimulus until capture; it is not a normal food-source consumption action.

## Attraction ownership

Do not make `createPlacedTraps.update()` steer animals. That module currently has access to `AnimalAgent[]`, but using that convenience for movement would create a second AI control path.

Preferred boundary:

1. active trap runtime exposes cheap lure descriptors from current placed trap state,
2. fauna resolves a nearby compatible lure candidate at bounded frequency,
3. `faunaDecision.ts` receives `lureActive` (or equivalent) and can choose a lure-investigate behaviour,
4. `AnimalAgent` moves to the selected trap position through its existing navigation/movement path,
5. once inside existing trap trigger radius, `createPlacedTraps.update()` remains authoritative for detection/capture.

A lure descriptor only needs stable trap id, position, trap kind and bait kind plus any small config required for radius/weight. Do not expose the Three.js trap mesh as AI state.

## Decision priority

Insert lure investigation below immediate safety/combat/social obligations and above ordinary idle/forage behaviour.

Current central ranks leave a natural gap between dog guard (35), predator-normal (30) and prey-normal (20). Choose the exact rank based on behaviour semantics after tracing `AnimalAgent` execution, but preserve these invariants:

- player/NPC threat response wins,
- fire avoidance wins,
- frenzy/chase wins,
- dog guarding wins,
- a predator must not abandon an active meaningful chase for trap bait,
- normal wandering/foraging may lose to a valid lure.

For predators, be careful that `predator-normal` currently represents their normal predation flow. If lure must compete inside that behaviour rather than globally outrank all predator hunting, prefer integrating lure as one candidate in the predator normal decision path instead of assigning an artificially high global score.

Keep the decision input pure: resolve the actual nearby lure target outside `faunaDecision.ts`; pass only the boolean/state needed to rank the behaviour.

## Lure target resolution and performance

Do not scan every trap for every animal every frame.

Current trap capture checks are already throttled by `TRAP_CHECK_INTERVAL_SEC = 0.5`. Attraction may use a similar low-frequency cadence, but ownership should be fauna-side or a shared bounded query service rather than piggybacking movement control into the capture loop.

Given current likely trap counts, a simple bounded iteration over active baited traps at a throttled interval is acceptable before introducing spatial indexing. Filter in this order where practical:

1. active + baited,
2. within lure radius,
3. trap-kind species compatibility,
4. species diet compatibility,
5. choose best/nearest deterministic candidate.

Avoid allocations in the per-tick path. Do not create transient arrays if a single-pass best-candidate lookup is enough.

Target choice must be deterministic for equal world state; use distance and stable trap id as tie-breakers rather than `Math.random()`.

## AnimalAgent movement integration

Reuse existing navigation helpers and the existing action lifecycle. A lure target should behave like a normal temporary destination, not a permanent forced steering vector.

Important cancellation conditions:

- trap becomes inactive/broken,
- bait disappears,
- trap/bait no longer compatible,
- animal leaves attraction logic because a higher-priority behaviour wins,
- target becomes stale/unreachable.

Do not store `AnimalAgent` references in trap state. If runtime target memory is useful, keep only trap id/position and resolve validity against the current lure source.

Do not persist an animal's transient lure target.

## Detection and capture stay authoritative in traps

Keep the existing encounter path in `createPlacedTraps.ts`:

- trigger-radius check,
- per `(trap, animal)` cooldown,
- deterministic `trapDetectionRoll`,
- `trapDetectionChance`,
- `capture()`,
- durability loss,
- bait consumption,
- `onCapture` hook.

Attraction must not invoke `capture()` directly and must not bypass the trigger-radius/detection path.

The existing bait detection bonus (`TRAP_BAIT_DETECTION_CUT`) can stay initially. Re-tune only if gameplay verification shows attraction + detection bonus makes bait excessively strong; architecture does not require changing it.

## Explicit trap interaction

`gatheringActions.armTrap(id)` currently performs both activation and implicit bait selection. Split the intent so the gameplay layer can call an operation equivalent to:

- arm without bait,
- arm with selected `ItemKind`.

Do not let Vue mutate inventory or trap state directly. `FlavorDialog` actions should call gameplay actions; `gatheringActions` remains the transaction boundary.

Use the existing contextual `FlavorDialog` actions for the first-level trap interaction. For bait selection, prefer the smallest reuse of the same action-list mechanism: rebuild/open contextual actions containing only currently available bait items and a cancel/back route. Avoid a new full-screen inventory selector.

The trap interaction description should derive current state, durability and bait from the authoritative `PlacedTrapEntry`.

## Inventory transaction ordering

Current `armTrap()` activates first, removes bait second, then attempts `attachBait`, with a compensating inventory add on failure. Replace that with a cleaner validation/commit sequence.

Preferred invariant:

1. resolve trap and ensure it is `placed`,
2. if bait chosen: validate item is bait-capable and inventory has it,
3. validate trap can accept the bait before inventory mutation,
4. remove exactly one item,
5. attach bait + activate as one gameplay transaction or through operations whose failure cannot leave half-applied state,
6. emit inventory/UI updates once.

If the existing `PlacedTraps` API makes this awkward, prefer adding one domain operation that atomically arms with `ItemKind | null` over orchestrating `activate()` + `attachBait()` with rollback in the app layer.

Preserve existing bait-return behaviour on disarm/collect. Successful capture continues to clear/consume `baitKind` without calling the return hook.

## Persistence

`PlacedTrapRecord.baitKind` is already in the authoritative trap record and already round-trips through `nodes()`/initial hydration. No schema expansion should be needed solely for attraction.

After load, active + baited traps must naturally reappear in whatever lure query exposes active lures. Do not persist caches, attraction radius, candidate lists, cooldowns or animal lure targets.

If trap compatibility config changes, old saves should simply use the new derived compatibility rules.

## Likely files to change

Core:

- `src/world/animalTraps.ts`
- `src/world/createPlacedTraps.ts`
- `src/app/actions/gatheringActions.ts`
- `src/fauna/faunaDecision.ts`
- `src/fauna/AnimalAgent.ts`

Likely integration/tests:

- the fauna diet helper/module introduced by `fauna-010`
- trap tests adjacent to `animalTraps.ts` / `createPlacedTraps.ts`
- `faunaDecision.test.ts`
- interaction resolution code that builds `FlavorDialog` / `InteractionPanelAction` for traps

Possibly unnecessary:

- persistence schema files, unless current validation has a hard-coded bait-kind restriction
- `foodFreshness.ts`, except removal of trapping-specific reliance on `BAIT_ITEM_PRIORITY`
- Vue component changes, if `FlavorDialog` actions already support the required nested/reopened choice flow

## Tests with highest implementation value

Focus unit tests on boundaries that would otherwise regress silently:

- trap-kind-aware species compatibility (`stag`/`wolf` good-only, bear/domestic never),
- diet-based bait compatibility,
- deterministic nearest/best lure selection and stable tie-breaking,
- inactive/unbaited/incompatible traps never become lure candidates,
- lure behaviour loses to threat/fire/guard/chase priorities as intended,
- attraction does not alter existing capture/detection semantics,
- arm-with-bait success removes exactly one item,
- failed/cancelled selection removes nothing,
- disarm/collect returns bait exactly once,
- capture consumes bait exactly once,
- hydrated active baited trap is immediately eligible as a lure source without extra persisted state.

## Implementation order

1. Introduce trap-kind species compatibility and tests; update capture filtering.
2. Expose/reuse a pure diet compatibility helper for `AnimalKind + ItemKind` if one is not already public.
3. Add a lightweight active-lure query/descriptor boundary around placed traps.
4. Add deterministic fauna-side lure candidate resolution.
5. Integrate lure as a scored/normal fauna behaviour and route movement through existing navigation.
6. Replace trap auto-baiting with explicit gameplay action(s).
7. Wire `FlavorDialog` actions for no-bait / bait selection / collect.
8. Add transaction, persistence-hydration and behaviour-priority tests.
9. Update state/docs if implementation changes public ownership or contracts.

## Pitfalls

- Do not confuse `deer` (sarna) with `stag` (jeleń).
- Do not use `food.bait` category as a substitute for species diet compatibility.
- Do not call movement methods from `createPlacedTraps.update()`.
- Do not allow bait attraction to supersede threat/combat behaviour.
- Do not make Vue own selected bait or authoritative trap state beyond transient menu presentation.
- Do not reintroduce inventory rollback complexity if one atomic arm-with-bait domain operation can avoid it.
- Do not persist lure caches/targets.
- Do not broaden this work into bear traps, scent/wind simulation or off-screen fauna aggregation.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

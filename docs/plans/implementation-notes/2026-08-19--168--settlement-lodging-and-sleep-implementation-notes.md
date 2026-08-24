# Plan 168 — Settlement Lodging and Sleep — Implementation Notes

**Reviewed:** 2026-08-19  
**Plan:** `2026-08-19--168--settlement-lodging-and-sleep.md`  
**Status:** implementation notes  
**Source of truth:** current code, tests/build configuration, plan 165 and plan 169.

## 1. Review verdict

Plan 168 is directionally correct and fits the existing architecture, but the implementation must be deliberately thin. The important architectural decision is:

> **Lodging is a capability exposed by existing world places/interactions; it is not a new parallel gameplay system.**

The implementation should connect four existing mechanisms:

```text
settlement / household / house
        ↓
physical lodging source
        ↓
existing interaction point + movement
        ↓
existing Rest/Sleep + time skip
```

Do not create `LodgingSystem`, `SleepManager`, `HotelSystem`, `BedManager` or a second rest state machine.

The resolver should be the only place that knows the preference order. The actual sleep sequence should remain owned by the existing rest/time-skip path.

Plan 169 is intentionally the future provider of physical bed data. Plan 168 should define the runtime contract and consume it without hardcoding furniture placement or house interior geometry.

## 2. Current rest/sleep architecture

`src/app/restCampSequence.ts` already owns the visual camp-rest ritual:

```text
setupCrouch
  → placeBlanket
  → lie
  → sleeping
  → teardownCrouch
  → removeBlanket
  → stand
```

`RestCampSequence.start()` accepts `onSleepStart` and `onComplete` callbacks, while `notifySleepFinished()` is the existing hand-off after the time skip. `cancel()` already restores the standing pose and clears the sequence. Do not add lodging-specific animation or cancellation state to this module.

`src/app/campRest.ts` is also deliberately small: it derives a camp quality from blanket/tent/fire context. It does not own world state or UI. Plan 168 should not turn it into a general lodging manager.

The existing player sleep restore is in `src/player/PlayerNeeds.ts` through `restoreNeedsFromSleep()`. Plan 165 explicitly keeps Rest/Sleep as the owner of Vigor/Stamina regeneration and asks only for changes to the existing needs model. Plan 168 must pass lodging quality into that existing path rather than implementing another regeneration calculation.

Important current-code discrepancy: the repository still contains the pre-165 values in `PlayerNeeds.ts` (for example the current passive Vigor drain and immediate depleted Hunger/Thirst damage). Treat plan 165 as the dependency contract, not as permission for plan 168 to modify those values. Plan 168 should not duplicate or compensate for unfinished 165 behavior.

## 3. Existing Place/Household ownership is the right integration point

`src/settlement/places.ts` already defines stable `Place` objects. A home is represented as:

```text
<settlementId>:home:<index>
```

`src/settlement/household.ts` explicitly stores the authoritative household `homeId`, and `SettlementsManager` owns a persistent `HouseholdRegistry` so household state survives settlement streaming.

This gives lodging a natural ownership chain:

```text
Household
    ↓ homeId
House / Place
    ↓ functional furniture / anchors
Bed lodging source
```

Do not add a second `householdId`/`homeId` mapping inside the lodging resolver. Resolve the existing household/home relationship and retain the stable IDs from those systems.

The resolver should be able to answer “whose place is this?” from the existing settlement/household data rather than copying household state into a lodging record.

## 4. Lodging contract should be capability-oriented

The plan's common lodging description is correct. Keep it small and runtime-oriented. Conceptually:

```ts
LodgingOption {
  id
  type
  position
  approachPoint
  facing
  quality
  owner / household reference?
  price?
  available
}
```

Prefer a stable reference to an existing world object/functional anchor over duplicating all of its state.

The important distinction is:

```text
LodgingOption
    = derived offer/capability

Household / Bed / Settlement place
    = authoritative owner/state
```

`available`, price and ownership should be resolved from the authoritative source when the option is evaluated or committed. Avoid storing a permanently cached `available: true` flag that can become stale after movement starts.

If the implementation needs a discriminated union, keep the variants small (`bed`, `friend`, `paid`, `hay`) and share the common positional/interaction contract rather than creating four unrelated APIs.

## 5. Do not create a second interaction system

The current interaction architecture already has a generic `Interactable` adapter in `src/interaction/Interactable.ts` and a dispatcher in `resolveInteraction.ts`. Existing world objects such as houses, tents, household storage and settlement storage are exposed through this adapter layer.

The lodging implementation should reuse that architecture.

There are two valid responsibilities to keep separate:

```text
resolver
  → chooses a specific lodging target

movement
  → moves player to its approach point

interaction
  → validates and activates the target at the destination

sleep orchestration
  → starts existing Sleep/Rest sequence
```

Do not make `resolveInteraction()` itself select the best lodging in town. That would mix generic `[E]` interaction with a high-level player action.

Similarly, do not make the Vue quick-action handler contain distance checks, quality rules or ownership rules.

## 6. Plan 169 boundary: beds are providers, not the lodging system

Plan 169 explicitly requires beds to expose:

```text
sleep interaction point
approach position
sleep facing
lodging reference
quality = high
```

Plan 169 also says the House Builder should extend existing `HouseDefinition` / `HouseAssembly` data rather than create a second interior builder.

Therefore the dependency should look like:

```text
HouseDefinition / HouseAssembly
    ↓
bed placement data
    ↓
sleep interaction / lodging capability
    ↓
Plan 168 resolver
```

Plan 168 should not invent furniture transforms, bed coordinates, asset IDs or interior layout rules. A temporary test provider may be useful during implementation, but it should use the exact same contract that plan 169 will register later.

The most important compatibility rule is that plan 169 must be able to register a bed without changing the resolver API.

## 7. Resolver: one authoritative preference algorithm

The resolver should be a pure-ish domain/application function with explicit inputs and deterministic ordering.

Recommended conceptual flow:

```text
candidate sources
    ↓
filter unavailable / invalid
    ↓
classify relationship / payment requirements
    ↓
score according to one preference policy
    ↓
stable tie-break
    ↓
LodgingOption | null
```

Do not let UI, movement or individual source adapters perform their own preference decisions.

The preference order from the plan should be encoded once. Within one class, use deterministic tie-breakers such as:

```text
quality desc
travel distance asc
stable id asc
```

Do not use random selection for lodging.

A useful separation is:

```text
collectLodgingCandidates(...)
resolveBestLodging(candidates, context)
```

The first function may know how to obtain sources; the second should know only the policy. This makes the preference rules unit-testable without constructing Three.js objects.

## 8. Candidate discovery should remain settlement-scoped

The existing app already has a simple “near town” concept (`REST_IN_TOWN_RADIUS` in `createApp.ts`) used by the current quick action. That radius is a UI/action convenience, not a lodging search algorithm.

Do not turn `REST_IN_TOWN_RADIUS` into the authoritative lodging radius.

The resolver should receive the relevant settlement(s) or their lodging providers and evaluate actual lodging candidates. Distance to the selected interaction point can then be used as a tie-breaker.

Avoid scanning arbitrary world objects every frame. Lodging candidates should be derived when the action is requested, not continuously rebuilt in the HUD.

## 9. Friend lodging must use existing relationships

NPCs already carry family/household information and player social lookup is already threaded through `SettlementsManager`/`createSettlement`.

Friend lodging should therefore be evaluated from existing relationship data plus household/bed availability:

```text
NPC relation to player
    +
NPC household/home
    +
available bed in that home
    ↓
friend lodging candidate
```

Do not create:

- `FriendLodgingState`;
- `FriendSleepManager`;
- a second friendship registry;
- a special “guest bed” ownership model.

The resolver should use the same relationship source already used by dialogue/social systems. If the current relationship API exposes only a coarse tier, use that existing tier rather than inventing a new numeric friendship score solely for lodging.

Availability must be checked against the actual bed/provider state, not inferred only from friendship.

## 10. Paid lodging: keep the business model minimal

The current repository does not expose a dedicated inn/hotel business system. Search of the current settlement/economy code shows no existing `inn`/`hotel` lodging domain.

Therefore do **not** create a full tavern/hotel system to satisfy plan 168. The plan explicitly keeps a full inn business out of scope.

A paid lodging candidate should be an offer attached to an existing lodging provider:

```text
existing place/bed/provider
    + price metadata
    ↓
paid LodgingOption
```

The price is an offer property, not a new economy subsystem.

When payment is needed, reuse the existing inventory coin semantics. `src/items/trade.ts` already treats coins as an inventory item and performs atomic “verify then mutate” transactions. Do not create a second player wallet merely for lodging.

If no concrete paid provider exists yet, do not fabricate an inn registry. Keep the resolver/provider interface ready for one and let the first real provider register an offer through the same contract.

## 11. Payment must be a committed state transition

The dangerous sequence is:

```text
pay
→ start walking
→ destination becomes unavailable
```

The plan correctly calls this out.

Prefer an explicit application-level state:

```text
selected unpaid option
    ↓
player confirms
    ↓
validate price + funds + availability
    ↓
commit payment once
    ↓
movement target armed
```

After payment, the selected lodging identity must remain attached to the action. Do not re-run the resolver during movement and silently switch the player to another bed.

At arrival, revalidate the physical lodging target. If the target became unavailable, the action should fail/recover without charging again.

For v1, if the project does not have a reservation/escrow concept, the cleanest invariant is still:

```text
payment happens exactly once after confirmation
```

and the implementation should make failure after payment explicit rather than hiding it in a generic “rest failed” branch.

Do not introduce a generalized transaction/rollback framework for one lodging action.

## 12. Movement integration is the largest architectural seam

The current `PlayerController` is a direct player locomotion controller driven by keyboard/touch input. It has movement speed, collision resolution, grounding, stamina and pose state, but there is no generic player `moveTo(destination)` API comparable to the NPC schedule movement.

Therefore do not pretend the existing movement system already supports autonomous player travel if it does not.

The implementation should add the smallest reusable movement/action seam required by plan 168, preferably at the application/game-loop layer rather than turning `PlayerController` into a high-level quest/action manager.

Conceptually:

```text
Lodging action
    ↓
movement target { x, z, approach tolerance }
    ↓
existing PlayerController locomotion/collision
    ↓
arrival
```

The target should be an approach point, not the bed's exact center. The final interaction should happen within an explicit tolerance.

Avoid adding pathfinding just for lodging. If current player movement has no obstacle-aware navigation beyond collision resolution, first use the smallest destination-following mechanism compatible with existing movement. Do not create an NPC navigation stack for the player unless the existing code already provides a reusable pathing service.

## 13. Preserve player control semantics

A high-level `Nocuj w mieście` action should not permanently take control away from the player.

At minimum define clear interruption behavior:

```text
selected lodging
    ↓
walking
    ↓
player input / explicit cancel
    ↓
cancel lodging action
```

Do not let the player continue walking while the action silently thinks it has arrived at the old target.

Movement cancellation should clear the pending lodging action without triggering Sleep.

If the implementation needs an “autowalk” flag, keep it scoped to the existing action lifecycle rather than adding a generic AI movement state to `PlayerController`.

## 14. Interaction point and facing are authoritative

A lodging provider should expose both:

```text
approachPoint
sleepInteractionPoint / interaction range
sleepFacing
```

Do not derive these from the player's current position when the action starts.

At arrival:

1. verify the target still exists;
2. verify it is still available;
3. verify player is within interaction tolerance;
4. snap/align only as much as the existing interaction/sleep animation requires;
5. apply the provider's facing;
6. start the existing Sleep path.

Avoid teleporting the player to the bed. A tiny final orientation adjustment is different from teleporting and should be used only if the existing interaction conventions require it.

## 15. Sleep quality must remain a parameter, not a second regeneration model

Plan 165 owns Vigor/Stamina regeneration. Plan 168 supplies only the quality input.

Recommended boundary:

```text
lodging provider
    ↓ quality
existing sleep orchestration
    ↓
restoreNeedsFromSleep(..., quality)
```

The quality enum (`high`, `normal`, `low`) should be mapped to a normalized value in one place. Do not spread numeric multipliers through beds, hay, friend lodging and UI.

Also avoid making the UI responsible for numeric quality.

The existing `campRestQuality()` is specifically for camp context and should not be stretched into a universal “all sleep quality” function unless the resulting API remains coherent. A simple lodging-quality-to-sleep-quality adapter is preferable to mixing camp fire/tent logic with beds.

## 16. Hay fallback should be a real world source

The plan correctly rejects teleporting to hay.

A hay fallback should expose an actual world position/approach point. If the world already has a suitable hay prop/landmark, adapt it. If not, do not create a parallel “virtual hay bed” coordinate system hidden in the UI.

The fallback should be derived from a real settlement place/object and should remain available even when no bed/friend/paid offer is valid.

Its quality should be `low` and its provider should be stable enough for movement + arrival validation.

## 17. Quick Actions UI should remain a thin entry point

`src/ui/createQuickActions.ts` already exposes `onRest` and the Vue `QuickActionsScreen.vue` renders the rest action. The current action distinguishes `camp` and `town`, and `createApp.ts` owns the application wiring.

Plan 168 should replace the semantic meaning of the town action, not create another quick-action screen.

Recommended flow:

```text
Quick Action: Nocuj w mieście
    ↓
application action
    ↓
resolver
    ↓
optional payment confirmation
    ↓
movement target
```

The Vue screen should not know:

- how beds are found;
- which friend qualifies;
- how distance is calculated;
- how sleep quality is selected;
- how payment is committed.

It may display the selected option and request confirmation.

## 18. Reuse existing dialog/confirmation patterns

The repository already has Vue dialog/menu infrastructure and existing merchant/trade confirmation flows. Do not create a dedicated hotel menu.

For a paid lodging confirmation, prefer the smallest existing modal/dialog pattern capable of showing:

```text
Miejsce
Cena
Jakość
[Potwierdź]
[Anuluj]
```

The confirmation callback should call a domain/application operation that revalidates funds and availability. Never trust the price or availability held by the Vue component.

## 19. Settlement streaming implications

`SettlementsManager` streams settlement runtime objects while households and economies live at manager scope so their state survives unload/reload.

This is important for lodging.

Do not make the lodging registry a transient property of a loaded `Settlement` if the selected provider needs to survive streaming.

Prefer:

```text
stable settlement/household state
    ↓
provider data reconstructed when settlement is loaded
```

The player cannot normally complete a lodging action against an unloaded physical house, so the resolver should select from currently usable/loaded providers or explicitly ensure the target settlement is loaded before movement.

Do not add a global always-loaded mesh for beds just to make the resolver simpler.

## 20. Persistence: persist ownership/source state only where required

The lodging option itself should generally be derived from authoritative world state.

Do not persist:

```text
selectedLodgingOption
lodgingScore
cachedAvailable
cachedDistance
```

Persist only real world state that cannot be reconstructed, following the existing save architecture.

For plan 169 beds, placement data belongs to house/assembly data and any runtime state should follow the same persistence rules as other functional world objects. Plan 168 should not create a separate lodging save section merely because it needs to consume a bed.

## 21. Suggested module boundaries

A likely small implementation shape is:

```text
src/settlement/lodging.ts
    LodgingType
    LodgingOption
    LodgingCandidateContext
    quality mapping / shared helpers

src/settlement/lodgingResolver.ts
    collect/resolve candidate policy

existing settlement/house/interaction code
    provider registration / discovery

existing app/gameLoop/createApp
    high-level action lifecycle
    movement → arrival → sleep hand-off

existing PlayerNeeds / RestCampSequence / timeSkip
    actual sleep and regeneration
```

Do not create every file above automatically. If an existing settlement/place module can own the contract cleanly, extend it instead. The goal is one coherent lodging domain, not a prescribed file count.

## 22. Tests to prioritize

### Resolver

Pure tests should cover:

- high-quality available bed beats lower-quality alternatives;
- friend beats paid lodging when policy says so;
- paid lodging beats hay;
- unavailable candidates are ignored;
- deterministic tie-break between equivalent candidates;
- no candidate returns `null`/failure cleanly;
- candidate distance does not override the explicit priority class unless the policy says it should.

### Friend lodging

- qualifying relationship + available bed → candidate;
- qualifying relationship + unavailable bed → no candidate;
- non-qualifying relationship → no friend candidate;
- no duplicate friend candidate for the same physical bed.

### Payment

- insufficient coins → no payment;
- cancel confirmation → no payment;
- successful confirmation → exactly one payment;
- destination invalidated before arrival → Sleep does not start;
- repeated arrival/update events do not charge twice.

### Arrival

- sleep does not start before the interaction point;
- arrival within tolerance starts the existing Sleep path;
- invalidated target causes failure/reselection;
- facing/pose is applied only at the actual sleep transition.

### Quality

- bed → `high`;
- normal paid/friend source → `normal`;
- hay → `low`;
- quality is passed into the existing sleep restore path rather than applying a second Vigor/Stamina calculation.

## 23. Implementation order

Recommended sequence for the agent:

1. Inspect the current town-rest wiring in `createApp.ts`/`gameLoop.ts` and identify the exact existing Sleep/time-skip hand-off.
2. Inspect current `Place`, `Household`, house assembly and interaction contracts.
3. Define the smallest lodging provider/option contract compatible with plan 169.
4. Implement resolver policy and pure tests before UI integration.
5. Add a real bed provider seam that plan 169 can later populate.
6. Add friend-provider discovery using existing relationship + household ownership.
7. Add paid-provider support without creating an inn/hotel system.
8. Add hay fallback from a real world provider/place.
9. Integrate the selected provider with the existing movement/action path.
10. Revalidate the provider at arrival and hand off to existing Sleep.
11. Replace the old “rest in town” quick-action behavior with the lodging action while preserving the existing UI bridge.
12. Add payment confirmation using existing Vue dialog/trade conventions.
13. Verify that plan 169 can register beds without changing plan 168's resolver contract.
14. Run focused tests, then TypeScript/lint/build.
15. Browser-test actual movement, arrival, sleep pose, quality and invalidation; do not treat unit/build results as visual verification.

## 24. Scope guardrails

Do not:

- create a second Sleep/Rest state machine;
- create a teleport-to-bed shortcut;
- create a parallel player wallet;
- create a hotel/inn business system;
- create a friendship-specific lodging subsystem;
- create a second interaction-point system;
- create a player navigation/pathfinding system solely for this feature if a smaller movement seam is sufficient;
- put lodging preference logic into Vue;
- store authoritative lodging state in `Object3D.userData`;
- duplicate household ownership or home IDs;
- modify furniture placement or asset authoring that belongs to plan 169;
- implement NPC lodging in this plan;
- create a new regeneration model outside plan 165.

## 25. Key invariants for implementation

The agent should be able to check these invariants while coding:

```text
One physical bed
    → one stable lodging identity

One selected lodging action
    → one movement target
    → one arrival validation
    → at most one Sleep start

Payment
    → only after confirmation
    → exactly once
    → never from UI rendering

Sleep
    → starts only at the real interaction point
    → uses existing Rest/Sleep
    → receives lodging quality as input

Household ownership
    → existing Household.homeId
    → no duplicated ownership graph

Plan 169
    → provides bed/anchor data
    → does not need a second lodging system
```

The implementation should feel like a thin bridge between existing systems, not like a new subsystem layered on top of them.

## 26. Verification focus

Technical:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npm run test`

Browser/manual:

- start “Nocuj w mieście” from the existing quick-action UI;
- player visibly travels to the selected lodging source;
- sleep does not begin while still walking;
- bed/approach/facing data are respected;
- paid lodging asks for confirmation and deducts coins exactly once;
- friend lodging does not charge coins;
- hay is a real fallback location;
- invalidating the selected lodging before arrival does not start Sleep;
- existing Rest/Sleep time skip and Vigor/Stamina regeneration remain the owner of sleep effects;
- the future plan 169 bed contract can register a bed without changing the high-level resolver API.

Per `CLAUDE.md`, build/test success is not browser verification. The movement-to-bed and actual sleep transition require browser/manual verification.

## 27. Implementation summary (2026-08-23)

What actually landed, and where it differs from the sketch above:

- **Contract + resolver** — `src/settlement/lodging.ts` (`LodgingType`/`LodgingOption`/quality mapping) and `src/settlement/lodgingResolver.ts` (`collectLodgingCandidates`/`resolveBestLodging`), exactly the two-function split §7 recommended. `resolveBestLodging` is pure and unit-tested (`lodgingResolver.test.ts`) on plain `LodgingOption[]` — bed > friend > paid > hay, quality desc, distance asc, id tie-break, distance never overrides class.
- **Bed** — `collectBedCandidates` returns `[]`. No physical bed provider exists yet; plan 169 registers real beds through the same `LodgingOption` contract without a resolver API change.
- **Friend** — `NpcAgent.household` (was `private`) is now a plain public readonly field; no new field, no `homeId` duplication. `Household.homeId` is decoded back to a physical `landmarks.houses[i]` via a new `homeIndexFromPlaceId` (companion to the existing `homePlaceId` in `places.ts`) — no second id scheme. Relation gate reuses `PlayerSocialLookup`/`RelationLevel` (`friendly`/`trusted`) already threaded into `NpcAgent`, no new friendship registry. One candidate per household (deduped across family members).
- **Paid** — `collectPaidCandidates` returns `[]`. Confirmed by search: the repo has no inn/hotel/economy concept to attach a price to. The full commit-once-after-confirmation state machine is implemented in `restActions.ts` (`lodgingConfirmTarget` → `confirmLodgingPayment`/`cancelLodgingConfirm`, `Inventory`'s existing `'coin'` has/remove) and the UI surface exists (`RestOutcome`'s `'confirm'`, `QuickActionsScreen.vue`'s inline confirm block, `ui.quickActions.lodgingConfirm`) — but it is currently unreachable in actual gameplay, since no candidate ever has `type: 'paid'`. Ready for the first real provider.
- **Hay** — anchored on the settlement's existing `landmarks.garden` (the same landmark hay bales are decoratively placed near in `props.ts`), not a new coordinate. One candidate per settlement, quality `low`.
- **Movement seam** (§12/§13) — no `PlayerController` changes. `restActions.ts`'s `tickLodging()` (called every frame from `gameLoop.ts`, same point as `restCamp.tick`) steers the player by writing into the *same* shared `keyboard.state`/`mouseLook.state` objects `PlayerController.update()` already reads (forces `forward` true, points `look.yaw` at the target) — reusing the existing collision/animation/camera pipeline unchanged, no second movement system, no pathfinding. A manual `backward`/`left`/`right`/`sprint`/`jump` press is read as the player's cancel signal before `forward` is forced. `activeModal()` (`modalState.ts`) gained an optional `lodging` slot so a walk blocks other input the same way `restCamp` does.
- **Arrival** — re-resolves candidates and checks the option's `id` is still present before starting Sleep; if not, no Sleep starts (toast, no re-charge). Facing is applied only at the arrival Sleep transition (`option.facing`, currently always `null` since no source sets one yet).
- **Sleep quality** — `lodgingRestQuality()` maps `high/normal/low` → `1/0.75/0.45`, a small standalone table in `lodging.ts` (not a stretch of `campRestQuality`, per §15). Fed into the existing `restoreNeedsFromSleep()` via a new `pendingLodgingQuality` in `restActions.ts`, parallel to (never mixed with) camp's `pendingRest` — no Survival XP for lodging (camp-only, unchanged).
- **Quick Actions** — the `'town'` `RestVariant` no longer requires a blanket (only `'camp'` does — lodging sources don't involve the player's own blanket); button relabeled "Nocuj w mieście" per the plan title. `RestOutcome` gained `'no-lodging'`/`'confirm'`.
- **Esc / interruption** — folded into the existing `RestActions.abortRest()`/`interruptRestForDamage()`/`cancelRest()` rather than a new cancellation path, per §26's "one coherent domain" guardrail.

Not done / open: no live paid-lodging content to browser-test end to end (payment confirm/commit is exercised by reading the code path, not by playing it); bed lodging has no live content until plan 169.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

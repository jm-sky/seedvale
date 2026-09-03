# Implementation Notes: Player Action Contracts & Quick Actions Availability

## Recon snapshot

Current code already partially implements the intended C4/C8 direction, but the contract is still boolean/string based:

- 'src/ui-vue/playerQuickActions.ts' owns FIRE_QUICK_ACTIONS, but each definition has availableKey + duplicated cost string; visibleFireActions() currently filters unavailable actions out.
- 'src/ui-vue/store.ts' owns QuickActionsFireAvailability and keeps it as a live boolean snapshot. createApp.ts::syncQuickActionAvailability() populates it, and popup-open explicitly refreshes it because grate availability depends on player position.
- 'src/ui-vue/screens/QuickActionsScreen.vue' and 'PauseMenuEntriesActions.vue' both consume visibleFireActions(); the former additionally removes buildFirePit because that action is presented under Budowa.
- 'src/app/userActions.ts' is still the authoritative fire mutation layer. The canBuild*/canLight* functions are read-only mirrors of execute guards, so availability is duplicated there.
- Fire placement already uses the authoritative evaluateGroundPlacement() seam in userActions.ts; grate uses bundle.placedFires.nearestBuildable() + buildGrate().
- 'src/ui/createQuickActions.ts' is only a compatibility facade for the Vue screen; do not recreate action logic there.
- PlayerActionContext.syncQuickActionAvailability() is the existing app/UI synchronization seam. Avoid adding another inventory watcher or action-state store.

## Recommended contract shape

Put the shared action contract in a small app-layer module, not in Vue. A likely location is 'src/app/playerActions.ts' or 'src/app/actions/actionContracts.ts'; choose the smallest dependency-safe location after checking imports.

ActionRequirement should be a discriminated union, with at least:
- item requirement: item kind + required + actual;
- capability requirement: concrete capability (e.g. fire_starting);
- target/world requirement: a small concrete reason/id kind where needed.

Do not encode requirements as display strings. Formatting labels/costs belongs at the UI edge and should consume the structural data.

Keep ActionAvailability deliberately small:
{ available: true } or { available: false; missing: readonly ActionRequirement[] }.

Execution should return a similarly small success/failure result carrying missing when failure is caused by requirements. Do not turn this into a generic error framework.

## Fire actions: important implementation details

Refactor the five existing fire actions around shared requirement/check helpers rather than maintaining separate canX() predicates.

For each action, availability must evaluate the same live state used by execute:

- buildSimpleFire: fire_starting + 2 branch + valid aimed placement.
- buildFirePit: 4 stone + valid aimed placement. It currently does not require fire_starting; preserve that gameplay.
- buildGrate: nearest buildable player fire within GRATE_BUILD_RANGE + 2 branch + 2 stone + 2 iron rod. Re-resolve the target at execute time.
- lightBranch: torch not already lit + fire_starting + 1 branch.
- lightWoodenTorch: torch not already lit + fire_starting + held torch OR free hand + carried torch.

Do not treat placement validity as an inventory requirement. It is a world/target requirement and must remain live.

The fire placement helper currently captures bundle intentionally because WorldBundle fields are replaced during rebuild. Preserve that lifecycle behaviour.

For grate, never cache the PlacedFireEntry from availability and execute it later. The current nearestBuildable()/id-based buildGrate() pattern is deliberately stale-safe.

## Quick Actions/UI integration

Replace the boolean availableKey lookup with the action's structured availability. The catalog should remain local (FIRE_QUICK_ACTIONS); do not introduce ALL_PLAYER_ACTIONS.

The important presentation change is:
- build the complete fire catalog;
- map each definition to its current availability;
- stable-sort available first, unavailable last;
- never use sort() in a way that changes catalog order within either group;
- expose missing to the component;
- disabled rows stay visible and use native disabled plus the existing 50% opacity requirement.

The Vue component must not call Inventory, canX(), placement helpers, or otherwise derive gameplay availability.

The current hard-coded cost strings in QuickActionsScreen.vue are another duplicate. Fire row display should derive from the same structural requirements/cost definition used by the action contract. Keep user-facing Polish labels in the catalog/UI layer.

Do not accidentally make buildFirePit appear twice in the Ogień category: its current Budowa-only presentation is intentional.

PauseMenuEntriesActions.vue also consumes the shared catalog. Keep it on the same contract rather than creating a second fire-action list. If the shared row type gains available/missing, adapt this screen to the same result/feedback path instead of restoring boolean-specific logic.

## Store/createApp lifecycle

The existing QuickActionsFireAvailability and setQuickActionsFireAvailability() are the main parallel state the plan wants to remove.

Prefer moving the snapshot calculation closer to the action definitions and passing/deriving the current availability from the authoritative action layer. Do not create a reactive gameplay state object containing copies of inventory/world state.

The existing popup-open refresh in createApp.ts exists specifically because grate depends on player position. If the new contract makes availability a live function instead of a stored snapshot, retain the semantic guarantee: popup rows must reflect current position/state, and execute must always re-check.

Inventory mutations already call syncQuickActionAvailability(); removing the fire-specific store snapshot must not break the other Quick Actions flags (digging tool, seeds, traps, etc.). Those are outside this refactor.

## Survival actions: scope and call-site impact

'src/app/actions/survivalActions.ts' currently exposes mostly void actions and uses toasts for failure. createApp.ts passes them into gameLoop.ts, whose callback types are also mostly void.

Unifying survival results therefore requires updating the affected callback contracts/call sites, not just changing return types in one file. Keep the presentation side (toast) at the action/UI boundary; the logical result must be independently usable.

Preserve the existing busy semantics exactly:
initial validation → busy.start() → final validation → mutation → result.

Do not make a busy action's initial availability snapshot authoritative. Actions such as cooking, milking, harvesting and igniting already demonstrate why completion-time state must be checked again.

Keep BusyAction itself unchanged.

## Requirements/reporting pitfalls

- A single failed action should report all independently missing material/capability requirements, not stop at the first missing item.
- Item requirements need both required and the live actual count.
- Capability requirements must contain the actual capability id, not only missing-capability.
- Target/world failures must remain distinguishable from material shortages.
- Avoid generating a second inventory abstraction: use Inventory.has(), Inventory.hasCapability(), and hasItemCapability().
- Existing cost constants in userActions.ts remain the source of truth; do not duplicate numeric costs in Vue.
- Execution must validate before every mutation and must not partially consume resources when a later validation fails.

## Tests worth adding

There is no dedicated userActions.test.ts currently. Add focused pure contract/catalog tests where possible rather than trying to integration-test the whole app.

At minimum cover:
- all catalog entries returned, including unavailable ones;
- stable available/unavailable ordering;
- multiple missing requirements;
- item required/actual;
- concrete capability id;
- execute re-check after inventory/world state changes;
- no mutation on failed execute;
- grate target becoming invalid between availability and execute.

Keep world-dependent tests at the existing action seam; do not introduce mocks for a new global action registry.

## Documentation/index

The plan's implementation-notes file is the artifact being added. Do not manually invent generated plan metadata or duplicate plan text. docs/plans/README.md is derived by the existing tooling; only change generator/derived content if the implementation workflow actually requires it.

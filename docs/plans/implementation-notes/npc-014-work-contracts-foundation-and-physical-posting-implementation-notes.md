# Implementation Notes: Work Contracts — Foundation & Physical Posting

**Reviewed:** 2026-09-01
**Plan:** npc-014-work-contracts-foundation-and-physical-posting.md

## Current-code findings

- WorldBundle is the lifecycle boundary for persistent player-created world objects. Existing objects such as PlayerWellRecord, StandingTorchRecord, PalisadeSegmentRecord, PlacedContainerRecord and PlacedTent follow the pattern: pure persistent/domain record + runtime creator + nodes() snapshot + explicit dispose(). Carry contracts through createWorldBundle()/rebuild rather than introducing a global manager.
- src/app/actions/placementActions.ts already contains the shared placement contract (GroundPlacementDefinition, evaluatePlacementSite(), previewGroundPlacement()). Do not reuse this as a contract lifecycle API; use it only if construction-target creation needs ground placement/validation.
- src/app/interactables.ts is a per-frame adapter. It intentionally does not own state. New board/flag interactions should follow this model: stable IDs/references in candidates, authoritative lookup/mutation in the owning system/action.
- Persistence is split correctly: src/persistence/saveData.ts owns the schema and validation; src/app/saveState.ts assembles live world state. A new contract field therefore needs both schema validation/defaulting and save assembly/restore wiring.
- Player-created objects are explicitly carried across same-seed WorldBundle rebuilds in worldBundle.ts. A contract system needs the same treatment, not just save/load support.
- There is currently no announcement/paper ItemKind in src/items/items.ts. Existing inventory/dropped-item infrastructure is real and persistent, but adding a generic inventory item only to carry contract announcements would create unnecessary item semantics. Decide the announcement representation deliberately before implementation; a contract-owned physical handoff record/object is preferable to inventing a fake resource item unless the existing item model is intentionally extended.
- Settlement landmarks currently contain well, stockpile, houses, dock, campfire, storage etc., but no notice board. SettlementLandmarks in src/settlement/props.ts is the correct place for a deterministic board position/reference if the board is generated as part of settlement props. Do not attach contract state to the visual prop.
- Settlement objects are recreated by createSettlement()/SettlementsManager; settlement identity is the stable Settlement.id. A board should therefore have a stable deterministic identity derived from settlement identity, not an Object3D identity.
- Interaction uses the shared Interactable union and gaze selection. Do not add a second interaction registry/framework for notice boards or flags.

## Architecture decisions

### 1. Contract state must be world-level, not settlement-owned

Contracts are issued by the player and may target arbitrary world locations. Settlement ownership only applies to an advertisement's publication point. Keep authoritative contracts in a small world-level system owned by WorldBundle, analogous to other persistent world-object systems.

Suggested separation:

WorkContractRecord   authoritative lifecycle/target/reward
ContractAdvertisement publication at one board
ContractTarget/flag   physical target marker
Notice board          settlement-owned publication point

Do not put contract records inside SettlementEconomy, Settlement, QuestManager, or NpcAgent.

### 2. Target reference needs an explicit stable identity

There is no existing generic construction-contract target entity that can simply be referenced today. Do not fake this with a display string such as 'build a well', nor point at an Object3D.

Use a small serializable target reference containing a stable target/site ID plus the construction-specific information later execution needs. Keep world position as the placement coordinate, but treat the target ID/reference as authoritative identity.

For the first type, the reference should be sufficient for Plan 2 to answer: what construction is requested, where exactly, and which target/site is still valid.

Do not make the contract target a PlayerWellRecord: a work contract describes work to be performed at a site; a player-built well is the completed world object.

### 3. Advertisement is publication state, not an item payload

The contract should remain valid when its announcement is not posted. Posting should mutate only the advertisement/publication state and contract lifecycle atomically.

A board stores a contract ID (and its own stable board/settlement ID); UI resolves authoritative contract data from the contract system.

### 4. Physical announcement needs ownership/lifecycle clarity

The plan requires the player to obtain/take an announcement before travelling to a board, but current ItemKind has no paper/notice item. Do not silently implement this as a normal droppedItems entry: dropped items are world pickups and are saved as physical world items, which would introduce awkward duplication with contract state.

Prefer a minimal contract-announcement representation owned by the contract system, or a deliberately introduced dedicated item instance only if later design needs physical documents as general inventory objects. It must be transferable exactly once for posting and survive the intended save/load boundary.

The important invariant is: creating a contract does not publish it and does not make a board reference it.

## Integration points

- Creation/action: extend existing player action wiring rather than introducing a new input framework. The action should validate target/reward, create authoritative contract state, create/register the target flag, and create the announcement representation.
- Interaction: extend Interactable with a notice-board candidate and, if needed, a contract-flag candidate. Keep candidates lightweight and ID-based.
- Settlement generation: add the physical board to settlement props and expose its world position/identity through SettlementLandmarks. Ensure its position is deterministic and included in settlement collider handling only if the visual board actually blocks movement.
- World lifecycle: add the contract system to WorldBundle, initial-state creation, same-session rebuild carry, and disposeWorldBundle().
- Persistence: add a SaveWorkContract/equivalent serializable shape to src/persistence/saveData.ts; assemble it in src/app/saveState.ts; restore it before runtime flags/boards are rebuilt. Keep validation strict enough to reject malformed lifecycle/target/advertisement states.
- Save/load: existing SaveData is version 1 and intentionally has no migration history. Follow the current schema convention rather than inventing a parallel persistence store.
- IDs: current player-created records commonly use Date.now() + module counter. For contracts/targets, preserve stable IDs through save/rebuild; do not derive identity from Object3D instances or array indices.

## Lifecycle invariants

Use explicit enums/unions rather than free-form strings.

contract: available | advertised | accepted | travelling | working | payment_due | completed | cancelled | invalidated
advertisement: not_posted | posted

Only available/not_posted and posted transition is active now, but the type should permit later states without making later phases depend on today's implementation details.

Enforce transitions in domain functions, not in UI or board code. In particular:

- only available + not_posted can be posted;
- posting sets both advertisement data and contract.state = advertised;
- cancellation/invalidation clears publication;
- posting must fail if the target is already invalid;
- a second posting must be idempotent or rejected explicitly, never duplicate a publication;
- board lookup must use stable board/settlement identity.

## Invalid target handling

Do not make target validity depend only on the flag mesh existing. The authoritative contract target must have a deterministic validity predicate.

When invalidated:
1. contract enters terminal invalidated;
2. target flag is removed/deactivated;
3. advertisement is removed/deactivated;
4. later board posting is rejected.

Likewise, cancellation must clean both physical representations. Cleanup should be safe if one representation is already absent (load of old/malformed state, rebuild, or repeated cancellation).

## Notice-board placement

The board is settlement infrastructure, not a player-placed object. Generate it with settlement props and keep its position in SettlementLandmarks. Do not route it through placementActions.ts or player placement preview.

If the asset is unavailable, use the project's existing procedural/parked-asset conventions rather than making the contract system depend on a new asset pipeline.

## Important non-obvious persistence order

Restore authoritative contracts before constructing interaction candidates. Runtime flag/board representations can then be derived from restored IDs. Never persist an Object3D reference, mesh state, or interaction candidate.

For same-session WorldBundle rebuild, carry contract records and publication state exactly like other player-created records. Do not reset contracts merely because settlement props/NPCs are rebuilt.

## Likely pitfalls

- Plan says depends: none, but the implementation should reuse the already-implemented world placement foundation (world-008) where relevant; it is currently verification needed, not absent.
- Do not confuse settlement board with settlement state. A board is a publication surface; contracts remain world-owned.
- Do not use QuestManager. Contracts are not quests and later need NPC commitments/payment state independent of quest progression.
- Do not add NeedId = work. Later NPC integration is explicitly expected to enter existing pressure/decision arbitration.
- Do not make the target flag authoritative. Flags are render/world representations and must be rebuildable from contract state.
- Do not scan every contract every frame to build board UI. The current interaction adapter is rebuilt per frame, but board interaction should resolve only the nearby board and its published IDs.
- Do not duplicate contract data on advertisements. This would create stale reward/target/state after cancellation or later lifecycle changes.
- Do not assume save/load is enough. WorldBundle rebuild is a separate lifecycle path and already carries other player-created world records.
- Do not use settlement array index as identity. Use Settlement.id.
- Announcement creation must not imply publication. This is the central gameplay distinction of the plan.

## Suggested implementation order

1. Define pure contract/target/advertisement domain records and transition/validation functions.
2. Add a small world-owned runtime system following existing record + nodes() + dispose() patterns.
3. Add persistent target flag representation and cleanup.
4. Add deterministic settlement notice-board prop/landmark identity.
5. Add the minimal player creation + announcement handoff flow using existing action/input infrastructure.
6. Add board/flag interaction candidates and posting mutation.
7. Wire SaveData + saveState.ts and same-session WorldBundle rebuild.
8. Add focused tests for lifecycle transitions, invalidation/cancellation cleanup, duplicate posting, and save-shape validation.
9. Run technical checks; browser verification remains necessary for physical flag/board visibility and interaction.

## Verification focus

The highest-value tests are state/invariant tests, not rendering tests:

- create ⇒ available/not_posted;
- create does not publish;
- post only from valid available contract;
- post ⇒ advertised/posted with stable board ID;
- cancel before/after posting removes publication;
- invalid target removes publication and prevents posting;
- save/load preserves contract ID, target ID/location, lifecycle and board publication;
- same-session WorldBundle rebuild preserves contracts;
- runtime dispose leaves no flag/board-owned contract state behind.

Manual browser verification should specifically confirm the announcement can be physically carried to another settlement and that posting changes world state only at the board.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
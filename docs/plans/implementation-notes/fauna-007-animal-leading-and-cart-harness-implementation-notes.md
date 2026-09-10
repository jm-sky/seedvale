# Implementation Notes: Animal leading and cart harness

**Plan:** `fauna-007-animal-leading-and-cart-harness.md`  
**Reviewed against:** current `main` after `fauna-017` and implemented `fauna-020`, 2026-09-10  
**Purpose:** implementation guide for the current architecture; current code wins over older plan assumptions.

## Recon conclusion

The plan remains valid, but the implementation approach is materially simpler than the original notes assumed:

- `fauna-017` split species data / foraging / roaming responsibilities out of `AnimalAgent` while keeping `AnimalAgent` as the per-animal state/integration owner.
- `fauna-020` already implemented player ownership, detached persistent livestock, Follow/Stay control, stable persistent-animal lookup and a player-position movement seam.
- Therefore leading must **reuse the same normal-animal movement/control seam** instead of introducing another follow controller.
- Leading is still a temporary relation and must not be encoded as player ownership or as the persisted Follow/Stay mode.
- The largest genuinely new runtime concept in this plan is now `animal --pull--> cart`.
- `public/models/parked/cart.glb` already exists and is the intended v1 cart asset. No new cart model is required.
- There will be **no separate harness model in v1**. Do not block implementation on harness/rope art or realistic rope physics.

## 1. Current fauna ownership boundaries

### `src/fauna/animalDefs.ts`

This is now the canonical owner of `AnimalDef`, `AnimalKind`, `MountPointConfig` and per-species capability/config data.

If leading/draft capability needs declarative species data, extend `AnimalDef` here. Do not put new species config back into `AnimalAgent.ts` and do not scatter `kind === 'horse'` / `kind === 'donkey'` checks through interaction or cart code.

`mount` is not equivalent to `leadable` or draft capability. Reuse the presence-as-capability convention, not the mounted semantics.

### `src/fauna/AnimalLife.ts`

Owns hunger/thirst/stamina physiology. Leading and harness state do not belong here.

### `src/fauna/animalForaging.ts`

Owns food/water source selection, validation and relief. Do not add lead-specific feeding logic or thresholds here.

### `src/fauna/animalRoaming.ts`

Owns roaming trip/probe helpers. Leading is not a roaming mode and should not become a second trip FSM.

### `src/fauna/faunaDecision.ts`

Owns high-level fauna arbitration such as player/NPC threat, fire, frenzy and normal predator/prey branches.

Leading should not automatically become a new `FaunaBehaviourKind`. The existing `fauna-020` precedent shows that player-directed movement can live inside the normal-behaviour path after stronger survival/needs work has had its chance.

### `src/fauna/AnimalAgent.ts`

Still owns authoritative per-animal runtime state, movement integration and locomotion execution. It is the correct integration point for a narrow leading relation/control input, but do not re-absorb policy extracted by `fauna-017`.

## 2. Reuse `fauna-020`, do not duplicate Follow

`fauna-020` already provides:

- `src/fauna/animalOwnership.ts` — authoritative household/player ownership,
- `src/fauna/ownedAnimalControl.ts` — Follow/Stay state + hysteresis + pure movement resolver,
- `AnimalUpdateContext.playerControlPos` — narrow player world-position input,
- `AnimalAgent` integration of owned-animal movement in the normal behaviour path,
- `SettlementsManager.resolvePersistentAnimal(animalId)`,
- `SettlementsManager.transferAnimalOwnership(...)`,
- `SettlementsManager.setOwnedAnimalControl(...)`,
- detached persistent livestock lifecycle and lookup.

Leading must reuse this **movement/control integration pattern**, but not conflate semantics:

```text
owned Follow/Stay = persistent player-owned control state
lead             = temporary player↔animal relation
```

Do not implement leading by silently switching the animal to `OwnedAnimalControlMode = 'follow'`; that would corrupt ownership/control semantics and persistence.

Preferred shape: extract/reuse the small pure "follow a target with hysteresis / trailing distance" primitive where useful, while keeping separate state for the temporary lead relation.

## 3. Leading relation ownership

Keep the relation explicit and identity-based:

```text
Player --lead--> AnimalAgent(animalId)
```

Recommended ownership:

- app/action layer owns attach/detach initiated by the player,
- relation identity is stored by stable `animalId`, not a scene object,
- `AnimalAgent` receives only the narrow current lead state/input needed by normal movement,
- detach is idempotent,
- death/removal/unresolvable animal clears the relation,
- no `HorseManager`, `LeadManager`, `AnimalFollowManager` or global per-frame relation scan.

Leading is temporary runtime control unless current save contracts at implementation time explicitly require persistence. Do not persist raw Three.js references.

## 4. Leading movement priority

The correct behavioural intent is the same ordering already established by `fauna-020`:

```text
high-level safety / combat / flee gates
→ normal predator/prey branch
→ immediate local behaviour
→ pursueNeeds()
→ player-directed movement (owned Follow OR active lead)
→ ordinary roam/wander fallback
```

Leading must therefore:

- keep `AnimalAgent.update()` active,
- keep hunger/thirst/stamina ticking,
- keep threat/flee/combat authoritative,
- let an actual needs action temporarily override the player's direction,
- resume following while the lead relation remains attached after the stronger action ends,
- use normal steering/collision/grounding,
- never teleport/snap the animal to the player.

Do not add lead-specific hunger thresholds unless the current arbitration genuinely cannot express the desired interruption behaviour.

## 5. Follow target / spacing

Do not target the player's exact position.

Reuse the existing `fauna-020` idea of hysteresis / distance bands, but leading will probably need a smaller trailing distance than ordinary player-owned Follow. Keep those numbers in one small control helper/config rather than scattered through `AnimalAgent` and interaction code.

The target should be derived from narrow plain data such as player world position and, only if useful, player heading. Do not pass `PlayerController`, camera or app objects into fauna.

Do not reuse herd/mother follow state as the lead relation; those are animal↔animal cohesion semantics.

## 6. Riding interaction

`src/app/actions/mountActions.ts` remains the authority for riding.

Mounted behaviour is intentionally different:

```text
mountActions.update()
→ AnimalAgent.driveMounted()
→ mounted gate suppresses autonomous movement
```

Do **not** copy that for leading. A led animal remains autonomous and continues the normal update/decision pipeline.

Define obvious mutual-exclusion rules at the action boundary, e.g. an animal should not remain player-led while the player is mounted on it. Reuse existing action blocking/context rules instead of inventing a second input state machine.

## 7. Persistent-animal lookup and player-owned animals

Because `fauna-020` is implemented, player-owned livestock may live outside `Settlement.livestock` in the detached persistent collection.

Any leading action that resolves by `animalId` should use the existing public persistent-animal boundary:

```text
SettlementsManager.resolvePersistentAnimal(animalId)
```

plus the existing wild-fauna lookup only if the intended leading capability is allowed for non-persistent/wild animals.

Do not reintroduce scans over loaded settlement livestock in app code.

Leading must work correctly for the player-owned horse acquired by the already implemented horse acquisition flow.

## 8. Interaction integration

Current player-owned animal interaction already uses contextual animal actions in `src/app/gameLoop.ts`, and `src/app/interactables.ts` includes detached livestock as live interaction candidates.

Extend that path rather than registering another global key handler.

Relevant files:

- `src/app/interactables.ts` — animal target/prompt construction,
- `src/app/gameLoop.ts` — contextual interaction dispatch/dialog actions,
- `src/app/actions/actionContext.ts` — shared player action context/gating,
- `src/app/actions/mountActions.ts` — useful lifecycle/id-resolution precedent only.

Leading should appear as a contextual action only when the animal's capability and current relation state allow it. Detach/end-leading belongs in the same contextual action lifecycle.

## 9. Cart asset facts

Use:

```text
public/models/parked/cart.glb
```

This asset is currently parked and described as a pushcart. Move/wire it into the appropriate runtime asset location as part of implementation if the repository's asset conventions require parked assets to leave `public/models/parked/` when activated.

Do not create a new cart model.

There is also an already-wired merchant wagon:

```text
public/models/settlement/megakit/wagon.glb
src/settlement/merchantWagon.ts
```

That wagon is a static settlement prop/placement concept. Its pose helper can be useful as evidence for world yaw/horse↔wagon spacing conventions, but **do not turn the merchant wagon runtime into the movable fauna-007 cart** and do not couple the new cart lifecycle to merchant settlement placement.

## 10. Harness visual scope

There is no harness model and none is required for v1.

Explicit v1 decision:

- no separate harness GLB,
- no realistic rope simulation,
- no requirement for animated straps,
- optional minimal procedural line/shaft visual only if cheap and useful,
- logical attachment is authoritative even if there is no visible harness.

Do not create an art dependency that blocks the gameplay relation.

## 11. Cart runtime ownership

There is still no reusable movable cart runtime to extend. Implement the smallest world-owned runtime needed by this plan.

Required invariants:

```text
cart has stable identity
animalId/cartId relation is explicit
animal movement is authoritative
cart has no AI
cart does not steer the animal
cart can detach and remain in the world
```

Prefer a small dedicated cart record/runtime owned by the existing world/app bundle boundary over an unowned scene-only `Object3D`.

Inspect existing placed/world-object lifecycle patterns only to reuse identity/load/dispose conventions; do not make cart an inventory drop merely because `createDroppedItems.ts` has a convenient mesh record pattern.

Persistence scope should follow the actual plan/current save requirements. If cart state is persisted, save plain identity/transform/attachment data only — never scene references.

## 12. Animal → cart attachment

Represent harnessing logically:

```text
AnimalAgent(animalId) --pull--> Cart(cartId)
```

Do not parent the cart under the animal unless current world-space lifecycle code proves that reparenting is safe. A logical relation plus deterministic transform constraint is easier to keep independent from fauna ownership/persistence.

The cart follows the animal's **resolved transform after animal movement**. Keep the dependency one-way:

```text
animal moves
→ resolve rear/draft attachment pose
→ cart moves/rotates toward constrained pose
```

Do not feed cart collision or orientation back into `AnimalAgent` in v1 unless required to prevent an obvious invalid state. The plan explicitly does not require rigid-body vehicle physics.

## 13. Cart grounding / terrain pitfalls

Current fauna locomotion is terrain-aware rather than rigid-body physics. Keep the cart equally lightweight.

Watch specifically for:

- wrong forward axis / pivot in `cart.glb`,
- cart spawning intersecting the animal,
- yaw inversion between model forward and animal forward,
- cart grounding fighting the attachment offset,
- steep slopes creating large vertical separation,
- shallow/deep water producing visually invalid attachment,
- jitter when the animal stops/turns,
- collision feedback causing fauna movement watchdog/repath loops.

Before hard-coding offsets, inspect the actual loaded `cart.glb` bounds/orientation and normalize through the same asset-fit conventions used elsewhere where practical.

## 14. Cart compatibility / capabilities

Keep species compatibility data-driven.

Likely semantic distinction:

```text
leadable
canPullCart / draft capability
```

Exact names should follow current `AnimalDef` style at implementation time. Do not reuse `mount` as a proxy just because horse/donkey currently have it.

Likewise the cart runtime/config should express which draft capability it accepts rather than assuming all animals can pull every cart.

## 15. `items-player-014` / rope boundary

Do not depend on a generic rope runtime being available. The existing `items-player-014` notes already record that rope pulling has separate item/player semantics.

Keep these concepts distinct:

```text
item --ropePull--> player
player --lead--> animal
animal --pull--> cart
```

If a tiny low-level attachment/constraint helper genuinely becomes reusable, sharing it is fine. Do not unify the domain relations or force fauna-007 through `ropePullable`.

## 16. Suggested implementation order

1. Reconfirm current `fauna-020` control integration and interaction call-sites have not changed since this recon.
2. Add only the required declarative lead/draft capability data in `animalDefs.ts`.
3. Add temporary lead relation/action lifecycle keyed by `animalId`.
4. Reuse/extract the existing player-target follow movement primitive instead of implementing another Follow controller.
5. Integrate lead movement into the same normal-behaviour fallback seam used by owned Follow, preserving needs/threat priority.
6. Activate/load `public/models/parked/cart.glb`; inspect/normalize orientation, scale, bounds and attachment offset.
7. Add minimal world-owned cart identity/runtime.
8. Add explicit animal↔cart attach/detach relation and one-way transform propagation.
9. Wire contextual lead/harness/detach actions through existing animal interaction flow.
10. Add focused tests around relation lifecycle, priority, capability compatibility and deterministic cart transform helpers.
11. Run typecheck/lint/tests/build as appropriate. Browser verification is performed manually by the user.

## 17. High-value regression checks

Automated tests should focus on pure/state invariants where possible:

- leading does not change `AnimalOwner`,
- leading does not mutate persisted Follow/Stay mode,
- detach is idempotent,
- death/removal clears lead/harness relations safely,
- needs/threat win over lead movement,
- lead resumes after a temporary stronger action while still attached,
- horse/donkey capability checks are data-driven,
- cart compatibility rejects invalid animals,
- cart transform follows animal yaw/position deterministically,
- cart detach preserves its current world transform,
- mounted and leading states cannot conflict,
- no global per-frame scan of all animals/carts is introduced.

## 18. Important plan/code discrepancies now resolved by recon

Old notes said there was no generic player-follow behaviour. That is no longer true: `fauna-020` implemented Follow/Stay and its movement integration. Reuse that seam.

Old notes treated the cart asset as missing. That is no longer true: `public/models/parked/cart.glb` exists and should be activated for this feature.

There is still no reusable movable cart runtime and no generic harness/rope physics runtime. Implement only the minimal logical/runtime pieces required by fauna-007.

**Zrób git commit i push do main, rebase jeżeli trzeba**

# Implementation notes: Semantic profession and activity animation coverage

**Plan:** `npc-055-semantic-profession-and-activity-animation-coverage.md`

## Current ownership

### Simulation truth

Do not move profession/action logic into animation code.

- `src/ai/characters.ts::Role` owns the closed profession union.
- `src/ai/npcProfessionWork.ts::planProfessionWork()` selects real profession work.
- `src/ai/npcAction.ts::ActionId` is the semantic action identifier already carried by `NpcPlannedAction`.
- `NpcAgent.pendingAction` / phase execution owns the loaded-agent action lifecycle.
- World/resource mutation stays in each action's existing `onComplete`.

Animation must derive from those existing values and must never become authoritative for work completion, yield, timing, navigation or persistence.

### Animation owner

`src/shared/agentAnimationSet.ts::createAgentAnimationSet()` is the existing mixer/action owner.

Important contract:

- `resolve()` maps each semantic key to the first matching clip candidate;
- exact case-insensitive clip match wins before the existing `Something|Clip` suffix fallback;
- `play()` crossfades ordinary loop/state transitions;
- `playOnce()` is reserved for one-shot attack/hurt/death-style presentation and returns clip duration;
- `settleAtEnd()` is used for reconstructed settled death pose;
- missing keys are safe no-ops through `has()` / unresolved actions.

Do not add a second mixer, raw `AnimationMixer` owner, profession animation manager or event bus.

## NpcAgent integration seam

Current `NpcAnimClip` is:

```ts
type NpcAnimClip =
  | 'attackMelee'
  | 'attackRanged'
  | 'death'
  | 'hurt'
  | 'idle'
  | 'interact'
  | 'run'
  | 'walk'
```

`NpcAgent` constructs exactly one `AgentAnimationSet<NpcAnimClip>` and resolves Modular names plus UAL aliases.

The high-leverage call site is the normal animation synchronizer. Current behavior is effectively:

```ts
if (busy && has('interact')) play('interact')
else if (moving && effectiveLocomotion === 'run') play('run')
else if (moving) play('walk')
else play('idle')
```

This is why distinct `drink`, `eat`, `conversation`, `harvest`, `plant`, `mine`, `fish`, `shear`, etc. collapse visually.

Implement semantic resolution immediately before this presentation choice rather than scattering `anim.play(...)` calls through profession planners.

Combat remains separate: current attack/hurt/death one-shot lifecycle must keep priority over ordinary semantic work animation.

## Semantic resolver contract

Add `src/ai/npcAnimationIntent.ts`. It is Three.js-free and presentation-only.

Use this exact precedence:

1. combat/hurt/death one-shot gates remain outside the resolver;
2. an active stationary execute/busy action wins over stale movement flags;
3. moving with effective run/flee → `run`;
4. moving with explicitly bulky cargo → `walkCarry`;
5. other movement → `walk`;
6. concrete `ActionId` → semantic activity;
7. generic `work` may inspect role using the fixed table below;
8. unsupported busy activity → `interact`;
9. otherwise → `idle`.

Concrete `ActionId` always beats profession. No animation intent is persisted.

Bulky cargo is not equivalent to “inventory non-empty”. Add a small shared/pure classifier (or equivalent presentation helper) whose initial accepted resource is wood/beams. Ordinary food, herbs, arrows and ore do not trigger `walkCarry`. Run/flee always overrides `walkCarry`.

## Action-to-intent mapping

Wire only semantics backed by current actions or current presentation state.

Direct mappings:

- `chop` → `chopTree`
- `harvest` → `farmHarvest`
- `plant` → `farmPlant`
- `eat` → `consume`
- `conversation` → `talk`
- `fish` → `interact`
- `mine` → `interact`
- `sharpen` → `interact`
- `shear` → `interact`
- `drink` → `interact`
- `bury` / `cleanAnimalCorpse` → `interact`
- ground food/item pickup, including berries/herbs → `interact`
- `deposit` / `exchange` → `interact`
- existing garden watering → new short semantic action `waterGarden` → `farmWater`; its completion calls the existing `foodSources.waterGarden(garden.id)`
- existing sleep entry after `goSleep` reaches its destination → play `layToIdle` once; when it completes, hold the final frame with `settleAtEnd('layToIdle')` throughout the existing `sleep` phase, then ordinary animation sync resumes on wake. The existing sleep FSM remains authoritative.

`PickUp_Table` is not extracted or wired in this plan.

`Chest_Open` is extracted into the shared companion but has no runtime mapping until an actual NPC chest/container action exists.

## Generic `work` mapping

For `ActionId === 'work'`, use this fixed role mapping:

- herbalist → `fixKneeling`
- textile_worker → `fixKneeling`
- blacksmith → `fixKneeling`
- hunter → `fixKneeling`
- trader → `interact`
- miner → `interact`
- fisher → `interact`
- shepherd → `interact`
- farmer/woodcutter/guard generic `work` → `interact` unless a more specific concrete ActionId is active.

Do not change profession planning merely to improve animation coverage except for the existing garden watering mutation, which must become a short semantic action so the already-existing world mutation has a truthful visible duration.

## UAL asset pipeline

Current generator:

`scripts/assets/prepare-ubc-player-alpha.sh`

Current UAL1 source:

```text
_temp/Models/packs/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb
```

Current extraction helper:

`scripts/assets/extract_glb_clips.py`

Important behavior of `extract_glb_clips.py`:

- exact requested clip names are mandatory;
- it fails with `missing clips: [...]` if any requested clip is absent;
- it strips mannequin mesh/skin payload while retaining the node hierarchy/tracks necessary for animation;
- therefore use it as the mechanical assertion that the Standard archive really contains every baseline clip.

Add the UAL2 Standard source path beside UAL1 and fail clearly if either required Standard GLB is absent.

Use non-root-motion Standard files for gameplay movement. Seedvale navigation remains code-driven.

## Shared companion asset decision

The final shared animation asset is exactly:

`public/models/characters/ubc/ual_humanoid.glb`

Replace the player-named `PLAYER_UBC_ANIMATION_URL` contract with a neutral UBC humanoid companion constant/resolver used by both player and NPC UBC models. Update PlayerController/NpcAgent call sites atomically.

After migration, `public/models/characters/ubc/ual1_player.glb` must no longer be a runtime dependency. Do not create separate player/NPC companion files and do not duplicate UAL clips into outfit GLBs.

## Building UAL1 + UAL2 into one runtime companion

`extract_glb_clips.py` currently accepts one GLB input. It does not merge two source GLBs.

Do not assume concatenating GLB binaries is valid.

Implementation needs one explicit merge step after extraction. Reuse the project's existing glTF tooling where possible (`@gltf-transform/cli`) and verify that:

- one shared UBC node hierarchy survives;
- clip tracks still bind to UBC bone names;
- duplicate animation names are rejected or deterministically resolved;
- no mannequin mesh is reintroduced;
- `gltfpack -kn -ac` preserves bone names and animation bind-pose tracks, matching the current generator's reason for those flags.

Prefer a small deterministic asset-build helper/manifest over shell-only ad-hoc merging if combining two extracted clip sets becomes awkward.

The generated runtime file name should be neutral, e.g. `ual_humanoid.glb`; update docs and all constants atomically.

## Baseline Standard clip manifest

The final `ual_humanoid.glb` must contain the already-required player/combat clips from the current companion plus these approved npc-055 runtime/presentation clips:

UAL1 Standard:
- `Idle_Loop`
- `Walk_Loop`
- `Jog_Fwd_Loop`
- `Sprint_Loop`
- `Interact`
- `Fixing_Kneeling`
- `Idle_Talking_Loop`
- `Sitting_Enter`
- `Sitting_Idle_Loop`
- `Sitting_Talking_Loop`
- `Sitting_Exit`
- current combat/hurt/death/player-required clips already present in the existing companion pipeline.

UAL2 Standard:
- `TreeChopping_Loop`
- `Farm_Harvest`
- `Farm_PlantSeed`
- `Farm_Watering`
- `Walk_Carry_Loop`
- `Consume`
- `LayToIdle`
- `Chest_Open`.

Do not include for npc-055 without another concrete runtime consumer:
- `PickUp_Table`
- `Idle_FoldArms_Loop`
- `Idle_Lantern_Loop`
- `Yes`
- `Idle_No_Loop`
- `OverhandThrow`.

No fishing/mining/smithing/shearing/textile/foraging paid clip is part of this plan.

## Appearance migration

Current `src/ai/npcAppearance.ts` has two appearance families:

- `NPC_MODEL_URLS`: legacy Modular male/female pools;
- UBC role mapping through `UBC_ROLE_LOOK`.

Current UBC-covered roles:

- farmer → Peasant
- woodcutter → Peasant
- trader → Wizard
- hunter → Ranger
- guard → Knight, but female guard currently falls back to Modular.

All other roles and all children currently fall back to `modelUrlFor(...)` / `outfit: 'modular'`.

Important existing UBC variation machinery to reuse:

- `rollUbcVariant()`
- `ubcVariantModelUrl()`
- deterministic `npcId` seed salt;
- `hairKindsFor()`;
- role sidecar tint + clothing hue + hair color;
- grey-hair age logic.

Do not create new appearance randomness or persist mesh selection.

### Adult role completion

Use exactly these mappings:

| Role | Outfit |
|---|---|
| farmer | Peasant |
| woodcutter | Peasant |
| guard | Knight |
| trader | Wizard |
| miner | Peasant |
| fisher | Peasant |
| hunter | Ranger |
| blacksmith | Peasant |
| shepherd | Peasant |
| textile_worker | Peasant |
| herbalist | Peasant |

Only Peasant/Wizard/Ranger/Knight are allowed. Peasant is the default profession fallback. Reuse existing deterministic UBC hair/beard/color machinery; do not add Noble or Knight_Cloth.

### Female guard

Female guard must use Knight. Verify/fix the existing female Knight build output if necessary; failure is an asset-pipeline bug to fix in this plan, not permission to fall back to Modular.

## Children

Current children are not separate models.

`NpcAgent` applies `member.scale` to the wrapper after `prepareProp(root, NPC_HEIGHT)`:

```ts
if (member.scale !== 1) wrapper.scale.setScalar(member.scale)
```

`FamilyMember.scale` is the current temporary child visual approximation, while `age` is already first-class demographic data.

For this plan:

- remove the early non-adult Modular appearance fallback;
- resolve every child to Peasant UBC regardless of role;
- preserve the existing `member.scale` application unchanged;
- do not invent Teen assets;
- do not alter age generation or physical-stat curves.

Dedicated Teen male/female bodies are intentionally deferred until the future Base Human Pack purchase.

## Legacy cleanup

Legacy Modular Men/Women are removed, not retained.

After UBC migration:
1. Search all repository/runtime/debug/test references to:
   - `Farmer.glb`
   - `Casual_Hoodie.glb`
   - `Casual_2.glb`
   - `Female_Casual.glb`
   - `Female_Medieval.glb`
   - `Female_Formal.glb`.
2. Migrate or remove every remaining code/debug/test reference.
3. Remove the legacy model pools/preloads and `outfit: 'modular'` runtime path.
4. Physically delete those six public GLBs in this plan.
5. Update asset docs so they no longer claim the deleted models are runtime assets.

Do not keep a hidden legacy fallback for children, female guards or unsupported professions.

## Tests

### Pure semantic resolver

Create focused tests for:

- each directly supported `ActionId`;
- unsupported work kinds falling back to `interact`;
- movement walk/run selection;
- only wood/beam bulky-cargo walking selecting `walkCarry`; ordinary inventory and ore do not;
- stale `moving=true` not overriding stationary busy execution;
- role consulted only for ambiguous generic `work`;
- no dependency on Three.js.

### NpcAgent animation integration

Keep tests narrow. Verify that:

- UAL semantic keys resolve to exact expected clip candidates;
- unsupported semantic keys safely fall back;
- combat one-shots still suppress ordinary sync animation for their existing duration;
- death settle behavior is unchanged.

Do not test actual bone deformation in unit tests.

### Appearance

Extend `npcAppearance.test.ts` to enumerate all 11 `Role` values.

Assert:

- every adult role resolves to a UBC path after migration;
- both genders resolve to UBC-compatible paths where required;
- children also resolve to UBC-compatible paths while their scale remains external to the appearance resolver;
- same `npcId` / age / gender / role remains deterministic;
- no adult/child runtime resolution returns `outfit: 'modular'` after final migration.

### Asset pipeline

The extraction/build step should be self-validating:

- missing requested Standard clip → non-zero failure;
- generated shared companion contains the expected manifest exactly or at least every required clip, depending on whether legacy player-only clips are retained;
- no duplicate animation names;
- no root-motion source file;
- UBC bone names required by clip tracks remain present.

## Verification order

1. Pure resolver tests.
2. Asset extraction/merge and clip-list verification.
3. Wire new aliases into `NpcAgent`.
4. Run focused NPC animation/profession tests.
5. Complete adult UBC appearance mapping.
6. Move children to scaled UBC stand-ins.
7. Search/remove dead legacy runtime references.
8. TypeScript, lint, relevant test suite/build as required by repository conventions.
9. Update `docs/assets/MODELS.md` and state docs only to reflect implemented truth.
10. Leave browser/manual animation verification to the User.

## Pitfalls

- `NpcAppearance.animationUrl` exists, but `NpcAgent.create()` currently recomputes the companion from `modelUrl`; do not accidentally maintain two competing companion sources.
- `PLAYER_UBC_ANIMATION_URL` is player-named but already shared by NPCs; rename/refactor instead of adding a second constant.
- Garden watering already exists as an immediate mutation; this plan must wrap that existing mutation in a short semantic `waterGarden` action rather than adding another watering decision system.
- `PickUp_Table` is not a valid general ground-pickup replacement.
- animation clip duration must never control profession work duration.
- `Walk_Carry_Loop` is presentation derived from an explicit bulky-cargo classifier; initial bulky kind is wood/beams. It must not create/persist duplicate cargo state, and run/flee overrides it.
- loaded/off-screen simulation continuity cannot depend on animation playback.
- legacy and UBC rigs must not share UAL through runtime retargeting.
- female guard must end on Knight UBC; verify/fix the generated female Knight output rather than preserving Modular fallback.
- do not broaden this work into a Teen/body-proportion implementation.

## Model choice

**Sonnet** is the preferred implementation model: the task crosses simulation/presentation boundaries, asset preprocessing, current UBC appearance composition and a large `NpcAgent` with several priority rules that must remain unchanged.

**Composer** is the lower-cost fallback if implementation follows these notes closely and is kept stage-by-stage.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

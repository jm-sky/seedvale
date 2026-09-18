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

## Recommended new module

Add `src/ai/npcAnimationIntent.ts`.

Keep it Three.js-free and presentation-only.

Recommended inputs should expose only facts already available on `NpcAgent`, for example:

```ts
type ResolveNpcAnimationIntentInput = {
  actionKind: ActionId | null
  moving: boolean
  locomotionMode: 'walk' | 'run'
  carrying: boolean
  busy: boolean
  role?: Role
}
```

Do not blindly copy this shape if current call sites can provide a smaller one. The important rule is that concrete `ActionId` beats `Role`.

Suggested precedence:

1. combat one-shot gate remains outside this resolver;
2. movement + effective run → `run`;
3. movement + relevant carried cargo → `walkCarry`;
4. movement → `walk`;
5. concrete execute action → semantic activity intent;
6. generic `work` may inspect role only when no more specific action exists;
7. fallback → `interact` for busy work/need activity;
8. otherwise → `idle`.

Be careful with precedence: current code intentionally prevents busy actions from continuing a locomotion clip if `moving` remains stale. Preserve that safety. If the resolver sees a true execute/busy phase, stationary action presentation must win over stale movement state.

## Action-to-intent mapping

Wire only semantics backed by current actions or current presentation state.

Direct mappings:

- `chop` → `chopTree`
- `harvest` → `farmHarvest`
- `plant` → `farmPlant`
- `eat` → `consume`
- `conversation` → `talk`
- `fish` → `interact` in Standard baseline
- `mine` → `interact`
- `sharpen` → `interact` unless a current target is proven compatible with `Fixing_Kneeling`
- `shear` → `interact`
- `drink` → `interact`
- `bury` / `cleanAnimalCorpse` → `interact`
- `deposit` / `exchange` → keep current interaction fallback unless a specific pickup endpoint is known to be table-height.

Do not map `PickUp_Table` globally to all pickup/logistics actions: many current pickups are ground-level or abstract inventory transfers.

Do not wire `Farm_Watering` until a real watering action exists. The current crop hydration/watering gameplay is outside this plan.

## Generic `work` ambiguity

Several profession paths intentionally return `kind: 'work'` rather than a dedicated `ActionId`.

Known examples include hunter arrow/bow crafting and generic production/workplace fallback.

For these:

- concrete profession actions must remain preferred whenever they exist;
- role-based animation selection is allowed only at this presentation fallback seam;
- hunter generic crafting may use `fixKneeling` only if the authored pose is spatially sensible at the existing workplace;
- textile worker/herbalist/unsupported roles should remain `interact` rather than inventing a false semantic clip;
- do not change `planProfessionWork()` return kinds solely to make animation selection easier unless a new action id is independently useful to simulation state.

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

Current public animation asset is:

`public/models/characters/ubc/ual1_player.glb`

Current constant/resolver:

- `PLAYER_UBC_ANIMATION_URL`
- `companionAnimationUrl(modelUrl)` in `src/player/playerVisualPreset.ts`.

Current `NpcAgent.create()` ignores `NpcAppearance.animationUrl` directly and derives:

```ts
const modelUrl = deps.modelUrl ?? appearance.modelUrl
const animationUrl = companionAnimationUrl(modelUrl)
```

It then loads the companion clips and merges them with model clips.

For this plan, prefer making this API neutral instead of creating an NPC-only companion resolver. A clean end state is one shared UBC humanoid animation URL used by both Player and NPC UBC outfits.

Possible migration:

- rename/replace `PLAYER_UBC_ANIMATION_URL` with a neutral exported UBC humanoid companion constant;
- keep player preset `animationUrl` pointing at the same shared file;
- keep `companionAnimationUrl(modelUrl)` (or rename it neutrally) as the path-family resolver;
- update PlayerController/NpcAgent call sites together.

Do not duplicate UAL clips into every outfit GLB.

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

The implementation baseline may only require clips already inspected in the locally held Standard archives.

High-value UAL1 Standard clips:

- `Idle_Loop`
- `Walk_Loop`
- `Jog_Fwd_Loop`
- `Sprint_Loop`
- `Interact`
- `PickUp_Table`
- `Fixing_Kneeling`
- `Idle_Talking_Loop`
- `Sitting_Enter`
- `Sitting_Idle_Loop`
- `Sitting_Talking_Loop`
- `Sitting_Exit`
- current combat/jump/swim/crouch subset already used by the player/NPC pipeline.

High-value UAL2 Standard clips:

- `TreeChopping_Loop`
- `Farm_Harvest`
- `Farm_PlantSeed`
- `Farm_Watering` (asset only; no gameplay caller in this plan)
- `Walk_Carry_Loop`
- `Consume`
- `LayToIdle`
- `Idle_FoldArms_Loop`
- `Idle_Lantern_Loop`
- `Yes`
- `Idle_No_Loop`
- `Chest_Open`
- `OverhandThrow`.

Do not add fishing/mining/smithing/shearing/textile/ground-foraging clip names unless the locally available paid archive is later inspected and exact names are mechanically verified.

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

Expand the existing mapping rather than creating another resolver.

Use only UBC outfit families actually generated by the current asset pipeline. If a proposed visual mapping needs `knight_cloth` or `noble`, first check whether `NpcOutfitId` / variant generation supports that family; currently the NPC UBC union is only:

```ts
'peasant' | 'wizard' | 'ranger' | 'knight'
```

Do not casually add a family whose female assets, hair variants or NPC sidecar tint do not exist.

The safest migration can reuse Peasant/Ranger/Wizard/Knight across more professions without requiring unique profession outfits.

### Female guard

`NPC_UBC_FEMALE_KNIGHT_URL` is already declared, but current `defaultUbcUrl(..., 'knight')` always returns the male unhelmeted Knight and `resolveNpcAppearance()` explicitly falls back to Modular for non-male guards.

Before removing that fallback, verify the current asset generator actually emits `female_knight.glb` and that its hair/head/material composition is valid. Do not trust the exported constant alone.

## Children

Current children are not separate models.

`NpcAgent` applies `member.scale` to the wrapper after `prepareProp(root, NPC_HEIGHT)`:

```ts
if (member.scale !== 1) wrapper.scale.setScalar(member.scale)
```

`FamilyMember.scale` is the current temporary child visual approximation, while `age` is already first-class demographic data.

For this plan:

- remove the early non-adult Modular appearance fallback;
- resolve children through a UBC-compatible appearance;
- preserve the existing `member.scale` application unchanged;
- do not invent Teen assets;
- do not alter age generation or physical-stat curves.

Dedicated Teen male/female bodies are intentionally deferred until the future Base Human Pack purchase.

## Legacy cleanup

Do not delete files merely because `resolveNpcAppearance()` no longer returns them.

Before removal, search runtime references to all legacy character GLBs, including:

- `Farmer.glb`
- `Casual_Hoodie.glb`
- `Casual_2.glb`
- `Female_Casual.glb`
- `Female_Medieval.glb`
- `Female_Formal.glb`

Also check debug/model-browser/test fixtures and docs separately. Runtime references must reach zero before deleting public assets; debug-only fixtures may need explicit migration rather than deletion.

## Tests

### Pure semantic resolver

Create focused tests for:

- each directly supported `ActionId`;
- unsupported work kinds falling back to `interact`;
- movement walk/run selection;
- carried movement selecting `walkCarry`;
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
- `Farm_Watering` being available does not mean crop watering exists as an NPC action.
- `PickUp_Table` is not a valid general ground-pickup replacement.
- animation clip duration must never control profession work duration.
- `Walk_Carry_Loop` is presentation derived from existing cargo state; it must not create or persist a new carrying flag.
- loaded/off-screen simulation continuity cannot depend on animation playback.
- legacy and UBC rigs must not share UAL through runtime retargeting.
- current `NPC_UBC_FEMALE_KNIGHT_URL` declaration is not proof the generated asset is runtime-ready; verify the build output before using it.
- do not broaden this work into a Teen/body-proportion implementation.

## Model choice

**Sonnet** is the preferred implementation model: the task crosses simulation/presentation boundaries, asset preprocessing, current UBC appearance composition and a large `NpcAgent` with several priority rules that must remain unchanged.

**Composer** is the lower-cost fallback if implementation follows these notes closely and is kept stage-by-stage.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

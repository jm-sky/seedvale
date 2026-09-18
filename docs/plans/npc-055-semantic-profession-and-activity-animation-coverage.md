# Plan: Semantic profession and activity animation coverage

**Created:** 2026-09-18
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** ~~items-player-035~~, npc-039
**Domain:** `npc`
**Type:** `feature`
**Model:** Sonnet, Composer
**Subdomains:** `work` `animation`
**Tags:** `ubc` `ual` `professions` `activities`
**Roadmap:** -

## Goal

Replace the current broad NPC `Interact` / `Wave` visual fallback with semantic activity animations that reflect the action the simulation is already executing, while converging adult NPC visuals on the existing UBC humanoid rig instead of extending the legacy Modular Men/Women animation path.

The plan must not create a second profession/work system. Simulation decisions, resource ownership and action completion stay in the existing `NpcPlannedAction` / `ActionId` / `planProfessionWork()` flow. Animation is a presentation layer over authoritative simulation state.

## Recon summary

### Current profession surface

`src/ai/characters.ts::Role` currently defines 11 roles:

- `woodcutter`
- `farmer`
- `guard`
- `trader`
- `miner`
- `fisher`
- `hunter`
- `blacksmith`
- `shepherd`
- `textile_worker`
- `herbalist`

Profession work already resolves through existing simulation mechanisms, primarily `src/ai/npcProfessionWork.ts::planProfessionWork()` and the ordinary `NpcPlannedAction` execution path.

`src/ai/npcAction.ts::ActionId` already distinguishes meaningful activities including:

`chop`, `conversation`, `deposit`, `drink`, `eat`, `exchange`, `fish`, `harvest`, `mine`, `plant`, `sharpen`, `shear`, `social`, `work`, `bury`, `cleanAnimalCorpse`, `visitGrave`, `travel`.

Do not introduce profession-specific animation FSMs. These action semantics are already the correct input.

### Current animation bottleneck

`NpcAgent` already uses the shared `createAgentAnimationSet()`, but its NPC semantic surface is coarse. In particular:

```ts
interact: ['Interact', 'Wave']
```

Many unrelated activities therefore converge on one generic visual even though the simulation knows whether the NPC is harvesting, planting, fishing, mining, shearing, eating, talking, etc.

### Character rigs

Two character families coexist:

1. Legacy Quaternius Modular Men/Women:
   - `Farmer.glb`, `Casual_Hoodie.glb`, `Casual_2.glb`, female equivalents;
   - old 62-bone rig;
   - embedded legacy clips such as `Interact` / `Wave`.

2. UBC / Fantasy outfits:
   - shared 65-joint UBC rig;
   - animation supplied by companion UAL GLB;
   - currently wired for farmer, woodcutter, trader, hunter and male guard;
   - `src/player/playerVisualPreset.ts::companionAnimationUrl()` currently points every UBC NPC outfit at `ual1_player.glb`.

Current UBC asset generation is in `scripts/assets/prepare-ubc-player-alpha.sh`. It extracts a bounded in-place UAL1 subset into `public/models/characters/ubc/ual1_player.glb`.

Do not retarget UAL onto Modular Men/Women at runtime. Their skeleton hierarchy differs from UBC and this would preserve two animation pipelines.

## Asset tier verification

Verified against the current project asset audit and official Quaternius/itch distribution on 2026-09-18.

### Universal Animation Library 1

Official current distribution:

- `Standard` — free;
- `Pro` — paid, currently USD 9.99 on itch;
- `Source` — paid, currently USD 14.99 on itch;
- full library marketing count: 120+ animations;
- Source additionally contains the authoring `.blend` rig/animation source.

The project's downloaded/inspected `UAL1_Standard.glb` contains 43 clips. Relevant confirmed Standard clips include:

- `Idle_Loop`
- `Walk_Loop`
- `Jog_Fwd_Loop`
- `Sprint_Loop`
- `Interact`
- `PickUp_Table`
- `Fixing_Kneeling`
- `Push_Loop`
- `Idle_Talking_Loop`
- `Sitting_Enter`
- `Sitting_Idle_Loop`
- `Sitting_Talking_Loop`
- `Sitting_Exit`
- `Sword_Attack`
- `Sword_Idle`
- `Death01`
- hit/punch/jump/swim/crouch coverage already audited.

### Universal Animation Library 2

Official current distribution:

- `Standard` — free;
- `Source` — paid, currently USD 14.99 on itch;
- full library marketing count: 130+ animations;
- official pack description explicitly includes farming and fishing;
- Source contains the authoring `.blend` source.

The project's downloaded/inspected `UAL2_Standard.glb` contains 43 clips. Relevant confirmed Standard clips include:

- `TreeChopping_Loop`
- `Farm_Harvest`
- `Farm_PlantSeed`
- `Farm_Watering`
- `Walk_Carry_Loop`
- `Consume`
- `LayToIdle`
- `Idle_FoldArms_Loop`
- `Idle_Lantern_Loop`
- `Yes`
- `Idle_No_Loop`
- `Chest_Open`
- `OverhandThrow`
- combat/parkour clips already recorded in the asset audit.

### Free vs paid rule for this plan

The implementation baseline must require only clips physically verified in the project's Standard GLBs.

Do not infer a paid clip name from the Animation Viewer, trailer, marketing text or semantic description. A paid-only clip may be wired only after its exact clip name is verified from a legitimately obtained Pro/Source package.

Known example: the full UAL2 is advertised as containing fishing, while fishing is absent from the project's inspected Standard clip set. Therefore a dedicated fishing animation is an optional paid-tier enhancement, not a baseline dependency.

The same rule applies to mining, smithing, shearing, weaving/spinning and ground-foraging: no dedicated Standard clip has been verified for them.

Licensing is not the reason for the split: Quaternius marks the assets CC0. The distinction is package availability.

## Activity-to-animation matrix

### Free Standard baseline

| Simulation activity | Current source | Target semantic animation | Confirmed free clip | Notes |
|---|---|---|---|---|
| idle | generic | `idle` | UAL1 `Idle_Loop` | existing |
| walk | generic | `walk` | UAL1 `Walk_Loop` | existing |
| run/flee | movement/combat | `run` | UAL1 `Sprint_Loop` | reuse existing semantic run |
| conversation | `conversation` | `talk` | UAL1 `Idle_Talking_Loop` | replace generic interact during active conversation |
| social sitting | social/campfire when seated target is actually supported | `sitTalk` / `sitIdle` | UAL1 `Sitting_*` | only where world positioning supports sitting; no fake chair teleport |
| eat | `eat` | `consume` | UAL2 `Consume` | first high-value daily-life replacement |
| chop tree | `chop` | `chopTree` | UAL2 `TreeChopping_Loop` | direct semantic match |
| farmer harvest | `harvest` | `farmHarvest` | UAL2 `Farm_Harvest` | direct semantic match |
| farmer plant | `plant` | `farmPlant` | UAL2 `Farm_PlantSeed` | direct semantic match |
| farmer watering | existing post-harvest dry-garden watering flow | `farmWater` | UAL2 `Farm_Watering` | represent existing `waterGarden` mutation as a short semantic action; completion performs the existing mutation |
| bulky-cargo walking | existing carried/logistics state while moving with bulky cargo | `walkCarry` | UAL2 `Walk_Carry_Loop` | initial bulky kind is wood/beams; ordinary inventory does not trigger it; run/flee overrides carry walk |
| table-height pickup | none in this plan | — | UAL1 `PickUp_Table` | do not extract/wire for npc-055; berries/herbs remain `Interact` |
| generic kneeling work | generic `work` for herbalist/textile_worker/blacksmith/hunter | `fixKneeling` | UAL1 `Fixing_Kneeling` | exact role-based generic-work fallback |
| guard sword combat | combat lifecycle | `attackMelee` / `combatIdle` | UAL1 sword clips | retain existing combat ownership |
| chest interaction | no NPC chest action currently | — | UAL2 `Chest_Open` | include in companion asset now, but do not wire runtime until a real NPC container action exists |

### No dedicated confirmed Standard clip

Keep a bounded semantic fallback rather than pretending a mismatched clip is correct:

| Role/activity | Existing simulation | Baseline fallback | Optional paid enhancement |
|---|---|---|---|
| fisher | `fish` | `interact` | dedicated fishing clip after Source verification |
| miner | `mine` | `interact` | dedicated pickaxe/mining clip if verified |
| blacksmith | `sharpen` | `interact` | smith/hammer/sharpen clip if verified |
| blacksmith | generic `work` | `fixKneeling` | smith/hammer/crafting clip if verified |
| shepherd | `shear` | `interact` | shearing clip if verified |
| textile worker | generic `work` | `fixKneeling` | weaving/spinning/sewing clip if verified |
| herbalist | generic `work` | `fixKneeling` | ground gather/forage clip if verified |
| hunter | generic crafting `work` | `fixKneeling` | bowcraft/crafting clip if verified |
| drink | `drink` | `interact` | dedicated drink clip if verified |
| generic `work` — trader/miner/fisher/shepherd | `work` | `interact` | dedicated profession clips if verified |
| ground pickup / berries / herbs | logistics/food/item pickup | `interact` | dedicated ground-pickup/forage clip if verified |
| bury / corpse cleanup | existing action ids | `interact` | dig/bury/body-work clip if verified |

## Architecture

### 1. Add semantic NPC animation intents

Introduce a presentation-only semantic type, preferably in a small dedicated module such as:

`src/ai/npcAnimationIntent.ts`

Example surface:

```ts
export type NpcAnimationIntent =
  | 'idle'
  | 'walk'
  | 'run'
  | 'interact'
  | 'talk'
  | 'consume'
  | 'chopTree'
  | 'farmHarvest'
  | 'farmPlant'
  | 'farmWater'
  | 'walkCarry'
  | 'fixKneeling'
  | 'sitIdle'
  | 'sitTalk'
  | 'layToIdle'
  | 'attackMelee'
  | 'attackRanged'
  | 'death'
```

Only add intents with a real current caller or an explicitly near-term action already represented by the simulation. Do not create a giant speculative animation enum.

### 2. Resolve intent from existing simulation state

Add one pure resolver, e.g.:

`resolveNpcAnimationIntent({ phase, actionKind, moving, carrying, combatState, ... })`

Ownership rules:

- `ActionId` remains simulation truth;
- `NpcAnimationIntent` is derived presentation state;
- no animation intent is persisted;
- no profession role directly chooses an animation if the concrete `ActionId` already identifies the activity;
- profession may only be consulted for ambiguous generic `work` fallback cases;
- movement carrying override applies only while actually moving with relevant cargo.

This resolver must be testable without Three.js.

### 3. Expand the existing animation set, not create another mixer

Extend the current `NpcAnimClip` / `createAgentAnimationSet()` mapping in `NpcAgent`.

Candidate aliases should be ordered by rig family and semantic quality, with legacy fallback preserved while migration is incomplete.

Example concept:

```ts
chopTree: ['TreeChopping_Loop', 'Interact', 'Wave']
farmHarvest: ['Farm_Harvest', 'Interact', 'Wave']
farmPlant: ['Farm_PlantSeed', 'Interact', 'Wave']
consume: ['Consume', 'Interact']
talk: ['Idle_Talking_Loop', 'Interact']
```

Do not put profession decisions into `agentAnimationSet.ts`; that shared helper should remain generic.

### 4. Build one bounded UBC NPC animation companion asset

Do not ship entire UAL1 + UAL2 libraries per character.

Extend the existing asset-preparation pipeline so UBC NPC/player-compatible clips are extracted into a bounded shared companion GLB. Produce one shared in-place animation asset at exactly:

`public/models/characters/ubc/ual_humanoid.glb`

rather than keeping a player-named asset as the permanent NPC dependency.

The extraction source should be:

- UAL1 Standard non-`_RM`;
- UAL2 Standard non-`_RM`.

Seedvale already moves agents from deterministic simulation/navigation code, so root motion must remain disabled for ordinary NPC locomotion and work loops.

Replace the player-named companion constant/API with one neutral UBC humanoid companion constant/resolver used by both player and UBC NPCs. `ual1_player.glb` must no longer be a runtime dependency after migration.

Do not duplicate identical clip data into every outfit GLB.

### 5. Migrate adult NPCs to UBC

Remove role dependence on the legacy Modular pool for adults.

Extend `resolveNpcAppearance()` so every adult role resolves to an existing UBC-compatible outfit family. Reuse the current deterministic hair/beard/color variation system; do not create profession-specific model managers.

The role mapping is fixed for this plan:

| Role | UBC outfit family |
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

Peasant is the mandatory fallback family for professions without a dedicated approved outfit. This plan uses only four NPC UBC outfit families: Peasant, Wizard, Ranger and Knight. Do not introduce Noble or Knight_Cloth here.

Children always resolve to Peasant UBC regardless of role and keep the existing age-driven `member.scale`.

Female guards resolve to Knight. If the current female Knight generation/output is broken, fix that asset pipeline/output as part of this plan; do not fall back to Modular or another outfit.

### 6. Children and temporary scaled-down UBC fallback

Seedvale currently has no dedicated child/teen character models. Children are represented by the existing age/family system plus a smaller visual scale (`member.scale`, currently roughly 0.5–0.8) applied to an adult character mesh.

For this plan:

- after the adult UBC migration, children should use the same UBC-compatible character pipeline and continue using the existing smaller `member.scale` approximation;
- do not keep legacy Modular Men/Women solely for children;
- do not add or assume Teen meshes that are not currently owned/present in the repository;
- do not redesign child body proportions, clothing fitting or age stages here.

The intended future direction is to purchase the Base Human Pack / appropriate Quaternius package containing dedicated Teen male/female models. Migration from scaled-down UBC stand-ins to real Teen bodies is a separate future asset/appearance plan and is not a dependency of this animation migration.

After all adult and child appearance paths use UBC, remove the legacy Modular runtime mappings and physically delete the six legacy NPC GLBs (`Farmer.glb`, `Casual_Hoodie.glb`, `Casual_2.glb`, `Female_Casual.glb`, `Female_Medieval.glb`, `Female_Formal.glb`) in this plan. Before deletion, migrate/remove any debug or fixture references so repository references reach zero. Do not preserve these assets as fallback.

## Profession coverage requirements

Implementation must explicitly test all 11 roles, even when several intentionally use fallback animation.

Minimum visual expectations:

- Farmer visibly harvests and plants with distinct animations.
- Woodcutter visibly chops rather than waves at the tree.
- Trader visibly carries goods while walking when transport cargo is present.
- NPC eating uses `Consume`.
- Active conversation uses talking animation.
- Guard combat remains functional after UBC consolidation.
- Sleep entry uses `LayToIdle`; after that one-shot completes, hold its final frame with `settleAtEnd('layToIdle')` for the existing `sleep` phase until wake-up. The existing `goSleep`/`sleep` FSM remains authoritative.
- Fisher/miner/shepherd/blacksmith/textile/herbalist never select a nonexistent clip; they fall back deterministically.
- Existing dry-garden watering must visibly use `Farm_Watering` through a short `waterGarden` semantic action whose completion calls the existing hydration mutation; do not add a new watering decision system.

## Integration points

Primary:

- `src/ai/NpcAgent.ts`
- `src/ai/npcAction.ts`
- `src/ai/npcProfessionWork.ts`
- `src/ai/npcAppearance.ts`
- `src/shared/agentAnimationSet.ts`
- `src/player/playerVisualPreset.ts`
- `scripts/assets/prepare-ubc-player-alpha.sh`
- `scripts/assets/extract_glb_clips.py`
- `public/models/characters/ubc/`

Tests likely affected/extended:

- `src/ai/NpcAgent.test.ts`
- `src/ai/npcProfessionWork.test.ts`
- `src/ai/npcAppearance.test.ts`
- new `src/ai/npcAnimationIntent.test.ts`

Docs/assets:

- `docs/assets/MODELS.md`
- relevant state docs only if runtime character/animation truth changes materially.

## Implementation stages

### Stage A — asset manifest and semantic resolver

1. Record the exact clip inventory extracted from the two local Standard GLBs.
2. Add the semantic animation-intent type and pure resolver.
3. Add unit tests for action → intent mapping and fallback behavior.
4. No gameplay or model migration yet.

### Stage B — UAL2 Standard companion asset

1. Extend the current UBC asset-preparation script to read UAL2 Standard.
2. Extract only approved UAL1+UAL2 clips.
3. Produce one shared in-place companion GLB.
4. Keep bone names and animation tracks required by Three.js mixer.
5. Update the companion URL contract without duplicating animation data.

### Stage C — high-value activity wiring

Wire and test:

1. `chop` → `TreeChopping_Loop`
2. `harvest` → `Farm_Harvest`
3. `plant` → `Farm_PlantSeed`
4. `eat` → `Consume`
5. `conversation` → `Idle_Talking_Loop`
6. movement with relevant cargo → `Walk_Carry_Loop`
7. generic `work` for herbalist/textile_worker/blacksmith/hunter → `Fixing_Kneeling`
8. existing garden watering → short `waterGarden` action → `Farm_Watering`
9. sleep entry → `LayToIdle`
10. retain deterministic `Interact` fallback for unsupported activities.

Animation duration must not become simulation duration. Existing action timers remain authoritative; loops may repeat until the action completes and one-shots may hold/return according to the existing animation lifecycle.

### Stage D — adult UBC migration

1. Give every adult role a UBC appearance mapping.
2. Reuse existing outfit/hair/beard/tint generation.
3. Preserve deterministic appearance from `npcId`.
4. Remove every adult role branch that falls back to Modular, including female guard.
5. Ensure streamed/rebuilt NPCs derive the same visual without persisted mesh state.

### Stage E — children on temporary UBC stand-ins and legacy cleanup

1. Switch child appearance resolution from scaled-down legacy Modular meshes to scaled-down UBC-compatible meshes while preserving the existing `member.scale` age/family visual approximation.
2. Do not introduce dedicated Teen assets in this plan; they are not currently owned.
3. Keep the future Base Human Pack Teen migration explicitly out of scope and tracked as a separate asset/appearance improvement.
4. Migrate/remove remaining debug/test references, verify repository references reach zero, then physically delete the six legacy Modular NPC GLBs and their runtime pool/preload code in this stage.

### Stage F — paid animation enrichment is out of scope

Do not inspect, buy or wire Pro/Source clips in `npc-055`. Missing dedicated profession clips stay on the exact Standard fallbacks above. Candidate paid enhancements are tracked in `docs/plans/LOOSE-ENDS.md` for a separate future plan.

## Locked implementation decisions

These decisions are final for implementation and override any older wording elsewhere in this plan:

- Outfit mapping: farmer/woodcutter/miner/fisher/blacksmith/shepherd/textile_worker/herbalist → Peasant; trader → Wizard; hunter → Ranger; guard → Knight.
- Only Peasant/Wizard/Ranger/Knight are allowed NPC UBC families in this plan.
- Children → Peasant UBC + existing `member.scale`; female guard → Knight.
- Generic `work`: herbalist/textile_worker/blacksmith/hunter → `Fixing_Kneeling`; trader/miner/fisher/shepherd → `Interact`.
- Concrete `sharpen`, `mine`, `fish`, `shear`, drink, ground pickup/berries/herbs, bury/corpse cleanup → `Interact`.
- `Walk_Carry_Loop` only for explicitly bulky cargo. Initial bulky kind: wood/beams. Ordinary carried inventory is not bulky. Run/flee → `Sprint_Loop` even while bulky cargo is present.
- Standing conversation → `Idle_Talking_Loop`. Sitting clips are used only when the NPC already has a real seated state/seat anchor; this plan does not invent seats.
- `PickUp_Table` is not extracted or wired.
- `Chest_Open` is extracted into the companion but not wired until a real NPC chest/container action exists.
- Existing dry-garden watering becomes a short semantic `waterGarden` action; completion calls the existing `foodSources.waterGarden(...)`; visual = `Farm_Watering`.
- Existing sleep flow uses `LayToIdle` on entry; no new sleep FSM.
- Shared companion path is exactly `public/models/characters/ubc/ual_humanoid.glb`; old `ual1_player.glb` ceases to be a runtime dependency.
- Final npc-055 companion additions must include the approved runtime clips: `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Interact`, `Fixing_Kneeling`, `Idle_Talking_Loop`, `Sitting_Enter`, `Sitting_Idle_Loop`, `Sitting_Talking_Loop`, `Sitting_Exit`, current required combat/hurt/death/player clips already present, `TreeChopping_Loop`, `Farm_Harvest`, `Farm_PlantSeed`, `Farm_Watering`, `Walk_Carry_Loop`, `Consume`, `LayToIdle`, `Chest_Open`. Do not add `PickUp_Table`, `Yes`, `Idle_No_Loop`, `Idle_FoldArms_Loop`, `Idle_Lantern_Loop` or `OverhandThrow` without another concrete runtime consumer.
- Legacy Modular Men/Women are not retained as fallback. Migrate references and physically delete the six legacy NPC GLBs in this plan.
- Pro/Source animation enrichment is future work only; npc-055 baseline is verified Standard UAL1+UAL2.

## Guardrails

- Do not change profession scheduling, priorities, yields, resource ownership, action durations or success rules.
- Do not redesign crop hydration; only expose the already-existing NPC dry-garden watering mutation as a timed semantic action so `Farm_Watering` has a truthful lifecycle.
- Do not add player-only or NPC-only duplicate activity systems.
- Do not persist animation state.
- Do not use root motion for NPC world movement.
- Do not retarget UAL to legacy Modular rigs at runtime.
- Do not load full 120+/130+ libraries when only a bounded subset is used.
- Do not map a visually incorrect clip merely to increase nominal coverage.
- Unsupported activity → semantic fallback is preferable to false animation.
- Keep world simulation independent of camera/player presence; animation only represents loaded agents.
- Add JSDoc to the semantic resolver / public animation-profile surface; use `@domain npc` where useful for preflight discovery.

## Automated verification

- TypeScript compile.
- Relevant lint.
- Existing NPC/profession tests.
- New resolver tests covering every `ActionId`.
- Appearance tests covering all 11 adult roles and both genders where supported.
- Asset script fails clearly when UAL1/UAL2 Standard source GLBs are absent.
- Generated companion GLB clip list is asserted against the extraction manifest.
- No duplicate clip names.
- No `_RM` locomotion/work asset enters runtime.
- Legacy Modular model URLs are absent from adult appearance resolution after Stage D.
- After Stage E, child appearance resolution also no longer requires Modular models; children remain scaled UBC stand-ins until dedicated Teen assets are acquired in a separate future plan.

## Manual browser verification

Performed by the User, not the AI agent.

Verify at minimum:

1. Farmer harvesting a mature crop.
2. Farmer planting a seed.
3. Woodcutter chopping a real settlement tree.
4. NPC eating.
5. Two NPCs in conversation.
6. Trader or other carrier moving with cargo.
7. Guard combat.
8. Fisher/miner/shepherd using deliberate fallback if no dedicated paid clip is installed.
9. Male/female adults from every profession render on UBC without broken skinning.
10. Streaming away/back preserves appearance and does not alter profession/action state.

## Non-goals

- New profession gameplay.
- New crop hydration mechanics.
- New mining/fishing/shearing recipes.
- Root-motion navigation.
- Runtime animation retargeting.
- Bespoke hand IK / prop IK.
- Full sitting-placement system where no seat anchor exists.
- Purchasing asset packs.
- Dedicated Teen/child body implementation; until the future Base Human Pack purchase, children remain scaled-down UBC stand-ins using the existing `member.scale` mechanism.
- Replacing simulation timing with animation event timing.

## Source notes

Official Quaternius pages checked 2026-09-18:

- Universal Animation Library: https://quaternius.com/packs/universalanimationlibrary.html
- Universal Animation Library 2: https://quaternius.com/packs/universalanimationlibrary2.html
- Universal Base Characters: https://quaternius.com/packs/universalbasecharacters.html
- itch distribution confirms current Standard/Pro/Source tiers and prices.

The repository's archived 2026-08-14 asset audit remains the source for the exact locally inspected Standard clip sets. Current code remains authoritative for what Seedvale actually wires.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

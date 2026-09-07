# Implementation Notes: npc-020 — Strength-driven physical work and human carrying

Focused recon against current `main`. These notes only record implementation-relevant findings that are easy to miss from the plan alone.

## Existing Strength ownership to reuse

`npc-019` is already implemented.

- `src/shared/PhysicalAttributes.ts` is the shared SPEA data primitive and must remain consumer-agnostic.
- `src/settlement/npcPhysicalProfile.ts::resolveHumanStrengthProfile(profile)` is the current NPC human/profile Strength resolver. It already applies the deterministic base SPEA + sex + age/development calibration. Use its result for NPC physical work; do not read `profile.attributes.strength` directly for gameplay.
- `src/player/PlayerController.ts::PLAYER_STARTING_ATTRIBUTES` and `PlayerController.attributes` own the Player values. Starting Strength is `0.6` and is currently fixed/not persisted.
- `src/combat/meleeStrength.ts` is a good precedent for consumer ownership: a small pure consumer-specific mapping, neutral at `0.5`, rather than methods on `PhysicalAttributes`.

For npc-020 prefer an equally small pure physical-work resolver and a separate human-carry resolver. Do not merge either into melee or into the shared attribute primitive.

## Player physical-work seams

`src/app/actions/groundActions.ts` is already the main concentrated set of real timed heavy Player actions. It currently sends the legacy base duration directly to `busy.start(...)` and separately supplies `physicalEffortBusyOptions('moderate', ...)`.

Confirmed Strength-sensitive candidates in this file:

- shovel dig — `DIG_DURATION_SEC`;
- pickaxe dig — `DIG_DURATION_SEC`;
- shovel level — `DIG_DURATION_SEC`;
- pickaxe level — `DIG_DURATION_SEC`;
- mound work — `DIG_DURATION_SEC`;
- each tree-harvest stage — `CHOP_DURATION_SEC`;
- ore deposit mining — `MINE_DURATION_SEC`.

Apply Strength only to the first `busy.start(duration, ...)` argument. Leave `physicalEffortBusyOptions()` unchanged. Because Stamina/Vigor drain is time-based, the shorter/longer duration will already change total exertion without double-counting Strength.

Do not alter the completion callbacks. They own all actual terrain/tree/deposit mutation, inventory grants, capacity rechecks and HUD/audio updates and should still run exactly once through the existing BusyAction lifecycle.

`gatherBranch()` is instant and should stay Strength-neutral.

Before widening beyond `groundActions.ts`, search for other timed Player construction/excavation actions and opt in only where the real-time duration represents physical effort. In particular, compressed/time-skip construction uses different semantics and should not automatically inherit this resolver merely because it is called "work".

## NPC mining seam

`src/ai/npcProfessionWork.ts::planOreGathering()` is the required NPC integration and already has a dedicated physical duration:

```text
MINE_DURATION_SEC * ctx.waitMultiplier
```

This is preferable to changing `rollWorkDurationSec()`.

`NpcWorkContext.rollWorkDurationSec()` is intentionally shared by semantically different profession actions: farming, planting, patrol/work stands and other generic profession work. Keep it Strength-neutral.

Thread resolved NPC Strength through `NpcWorkContext` as plain capability data (for example `strength`), then apply the shared physical-work duration rule only inside `planOreGathering()`. `NpcAgent` already receives/reuses the NPC `PhysicalProfile` for Strength-driven melee, so do not regenerate the profile or create a second seed path in profession code.

Mining's chained `deposit` step (`0.8 * waitMultiplier`) is logistics/travel handling, not physical extraction; leave it unchanged.

Do not make crop harvest, planting, fishing, guard patrol, trader transfers, arrow crafting or generic workplace stands Strength-sensitive in this plan.

## Human carry capacity and Inventory

Current player carry ownership is already suitable:

- `src/items/Inventory.ts` stores an immutable constructor-time `baseMaxWeight`;
- `Inventory.maxWeight` is a getter returning that base plus every held item's additive `ITEM_CATALOG[kind].carryCapacityBonus`;
- `totalWeight()` already includes ordinary item mass and liquid mass;
- weight and `maxSize`/gabarite are independent;
- existing encumbrance consumes `totalWeight()` versus `maxWeight` downstream.

The player inventory is currently constructed in `src/app/createApp.ts` with `undefined` for the weight argument, therefore it falls back to the legacy `20 kg`; `DEFAULT_MAX_SIZE` is passed separately as the fifth constructor argument.

Because Player Strength is currently fixed/not progressable, the smallest npc-020 change is:

```text
PLAYER_STARTING_ATTRIBUTES.strength
→ human carry resolver
→ Inventory constructor baseMaxWeight
→ existing additive equipment bonuses
→ Inventory.maxWeight
```

At Strength `0.6`, pass `21.2` kg as the player's base weight limit. Keep the resolved float; do not round it for simulation.

Do not make `Inventory` import `PhysicalAttributes`, PlayerController or Strength. Also do not add a mutable/settable base capacity solely for hypothetical future Strength modifiers: there is no runtime attribute-modifier/progression system yet. When such a system exists, it can introduce an explicit derived-capacity update seam deliberately.

`Inventory` already recomputes equipment `carryCapacityBonus` on every `maxWeight` access, so backpack behaviour remains additive automatically. Do not multiply those bonuses by Strength.

One code-comment caveat: `Inventory.ts`'s old `DEFAULT_MAX_WEIGHT` comment still says backpacks are future work, but `maxWeight` already implements backpack/equipment bonuses. Follow the code/getter, not that stale sentence; update the comment if touching this area.

## Encumbrance boundary

Do not change `src/player/playerEncumbrance.ts::computeEncumbrance()` or movement thresholds. Strength belongs entirely upstream in capacity resolution.

`src/app/gameLoop.ts`/HUD consumers already read `inventory.totalWeight()` and `inventory.maxWeight`; once the constructor base is Strength-derived, those paths should require no Strength-specific branching.

Recheck any UI tests/formatting that assume exactly `20 kg` at start. UI may format `21.2`, but the inventory authority must retain the unrounded value.

## NPC carrying is deliberately out of scope

Keep the existing temporary NPC `Inventory` capacity and logistics tuning unchanged.

`src/ai/npcLogistics.ts` explicitly treats limits such as `HELPER_DELIVERY_MAX_CARRY` as bounded logistics quantities under the NPC carrier cap. `NPC_CARRY_MAX_WEIGHT` and related transfer/batch constants are not biological Strength consumers yet.

Do not replace them with the human carry resolver and do not alter household/economy throughput as a side effect of this plan.

## Suggested small modules

Prefer two pure helpers with narrow names/ownership, for example:

- physical-work speed/duration from resolved Strength;
- human body carry capacity from resolved human Strength.

The physical-work helper may be shared by Player and NPC because the plan intentionally defines one rule for human physical work. The carry helper is human-specific; do not make it species-general.

Keep formulas isolated from action code so boundary/neutral-point tests do not require constructing Three.js/game-loop objects.

## Tests worth adding/updating

High-value focused coverage:

- pure physical-work mapping at `0`, `0.5`, `0.6`, `1` and monotonic duration;
- representative `groundActions` duration wiring if the existing test harness exposes BusyAction duration cleanly; do not build a large integration harness only for arithmetic;
- `npcProfessionWork.test.ts`: ore mining receives Strength-adjusted duration while a representative non-physical profession action remains unchanged;
- human carry mapping: `14`, `20`, `21.2`, `26` kg;
- `Inventory` composition: Strength-derived base + existing additive backpack bonus, with `maxSize` unchanged;
- existing `playerEncumbrance` tests should remain unchanged except fixtures that intentionally use the player's starting capacity.

Neutral `Strength = 0.5` must preserve every legacy duration/capacity exactly. Do not change tests to treat the Player's `0.6` as the neutral point.

## Documentation/update boundaries

After implementation update the canonical ownership docs, primarily:

- `docs/state/player-systems.md` — Strength physical work + body carry base + additive equipment capacity + existing encumbrance;
- `docs/state/npc.md` — Strength-sensitive real physical work and the explicit fact that NPC temporary carried inventory remains logistics capacity.

Do not duplicate the human/species calibration tables from `docs/world/human-strength-calibration.md` / `docs/world/species-physical-reference.md`.

Do not run `pnpm docs:sync` manually; derived docs are handled by the GitHub workflow.

## Pitfalls / stop conditions

- Do not change `BusyAction` to know about attributes.
- Do not put work/carry methods on `PhysicalAttributes`.
- Do not use raw NPC base SPEA instead of `resolveHumanStrengthProfile()`.
- Do not apply Strength globally to `rollWorkDurationSec()` or every NPC `work` action.
- Do not reduce `physicalEffortBusyOptions()` costs; shorter duration already lowers total drain.
- Do not change yields, tool gates, world mutations, action cancellation or completion semantics.
- Do not reinterpret NPC logistics caps as biological carrying capacity.
- Do not change `computeEncumbrance()`, item/liquid weights, backpack bonuses or gabarite limits.
- Do not add generic attribute modifiers/progression or mutable inventory capacity only for future-proofing.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

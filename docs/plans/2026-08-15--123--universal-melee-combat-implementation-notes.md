# Universal Melee Combat — Implementation Notes

**Plan:** `2026-08-15--123--universal-melee-combat.md` (123)
**Created:** 2026-08-15
**Status:** `reviewed` 🔎
**Review basis:** current `main` code + `docs/STATE.md` + `CLAUDE.md` + `docs/plans/README.md` + asset audit.

## Review verdict

Plan 123 is **technically sound and should be implemented in full**, but the implementation should stay smaller than a generic combat framework.

The important correction is that the repository already has most of the required seams:

- shared `HealthState` is already combat-agnostic;
- player melee already exists through `[E]` against `AnimalAgent`;
- `ITEM_CATALOG` already contains `meleeDamage` for all six melee tools;
- `HeldTool` already owns the single equipped tool;
- `PlayerNeeds.stamina` already exists and is used for sprinting;
- `pickInGaze()` already implements deterministic distance + facing-dot selection;
- animal death already has a generic `AnimalAgent.collapse()` / `onDeath` lifecycle used by quests.

Do **not** create `CombatManager`, `WeaponSystem`, `AnimalCombatSystem`, a second health system, or a second equipment system.

## Important findings

### 1. Current player melee is still fauna-specific

`src/fauna/faunaCombat.ts` contains `MeleeToolKind`, `PLAYER_TOOL_DAMAGE`, `isMeleeTool()` and `playerToolDamage()`.

`src/app/gameLoop.ts` imports these directly and currently owns the player → animal interaction path.

This is the main seam to change. Keep `faunaCombat.ts` responsible for fauna-specific combat data/behaviour, but move the **player melee action/timing and hit resolution** into a player-owned module.

Recommended new module:

- `src/player/playerMelee.ts`

Keep it small and data-oriented. It should own:

- attack lifecycle state;
- timing;
- current attack id / hit resolution guard;
- melee configuration lookup;
- deterministic target filtering.

It does not need to know about quests, UI, settlements or NPC combat.

### 2. `ITEM_CATALOG` is already the correct source of truth

`src/items/itemCatalog.ts` already has:

- `meleeDamage`;
- `holdable`;
- model information;
- all six plan-123 melee tools.

Current damage values are duplicated in `src/fauna/faunaCombat.ts`:

- long_sword: 28
- axe: 20
- pitchfork: 14
- knife: 12
- sickle: 12
- shovel: 8

Remove this duplication during implementation.

Prefer extending the existing `meleeDamage` field into a small nested config rather than creating another catalog. For example, conceptually:

```ts
melee: {
  damage,
  range,
  arcDot,
  windUp,
  hitWindow,
  recovery,
  staminaCost,
}
```

Do not turn this into a general weapon-stat framework. Keep only values required by plan 123.

If retaining `meleeDamage` temporarily makes migration smaller, it is acceptable as an intermediate step, but the finished implementation should have one source of truth.

### 3. Existing gaze selection is reusable

`src/interaction/findInteractionTarget.ts` already provides `pickInGaze()` using:

- XZ distance;
- facing dot product;
- deterministic highest-dot selection.

Do not create another generic `raycastTarget()` or `TargetingSystem`.

For melee, however, do **not** depend on the current interactable's single-target prompt as the damage event. The attack hit should be resolved at the configured hit window against the current `AnimalAgent` collection.

Recommended hit test:

1. collect active/alive animals from existing fauna access;
2. XZ distance <= weapon range;
3. dot(player forward, direction to animal) >= weapon `arcDot`;
4. optionally reject targets behind/inside the player using the same facing convention as `pickInGaze()`;
5. apply damage once per target for the current attack id.

This permits a natural small melee arc and avoids world raycasts.

### 4. One attack must have an explicit identity

Do not rely only on a boolean `attacking` flag.

Use a monotonically increasing `attackId` (or equivalent local token) so that the hit window can be resolved once and the same target cannot receive damage twice from the same attack.

A `Set<animalId>` or equivalent per-attack guard is appropriate. The set only lives for the active attack and does not need persistence.

This also makes the acceptance criterion "one animation does not deal repeated damage" mechanically obvious and testable.

### 5. Timing should be a small state machine

Recommended lifecycle:

```text
idle
  → windUp
  → hitWindow (resolve once)
  → recovery
  → idle
```

The next attack is rejected until recovery completes.

Avoid two independent timers fighting each other. `windUp + hitWindow + recovery` is enough to express the requested attack tempo/cooldown.

The config should be per melee item, not per animal.

Suggested initial tuning should preserve the existing damage ordering and make the sword noticeably slower/heavier than the knife. Exact values can be tuned in browser verification; do not overfit them in tests.

### 6. Stamina is already available

`PlayerNeeds.stamina` is the existing player stamina pool and `StaminaState` already exposes `drainStamina()`.

At attack request:

- read current melee config;
- reject when `stamina.current < staminaCost`;
- otherwise drain stamina once and start the attack.

Do not add a new stamina abstraction and do not persist attack state.

### 7. Animation: do not block on a new asset pack

`PlayerController` currently loads `Adventurer.glb` and wires only existing `Idle`, `Walk` and `Run` actions. The asset audit also confirms that the current character/tool pipeline is based on Quaternius assets and hand attachment through `WristR`/related aliases.

Therefore plan 123 should **not** start a new character-animation migration or import UAL just to get an attack clip.

Use the existing held-tool attachment and a minimal procedural one-shot for the attack. The cleanest low-scope approach is a narrow player API that temporarily offsets the held melee object (or its attachment wrapper) during the attack while preserving its normal held transform.

Do not rotate the whole player model as the permanent solution.

If browser verification shows that a particular weapon needs a better swing, tune the procedural pose per weapon. A new animation asset should be a separate scoped task, not a reason to expand plan 123.

### 8. Keep interaction prompt behaviour

`src/app/interactables.ts` already changes an animal prompt to `Atakuj: <animal>` when a melee tool is held.

Keep this UX. `[E]` should become the request-attack input when the selected interactable is a live animal and a melee tool is equipped.

Do not create a second attack key.

`Keyboard.ts` already treats `E` as an edge-triggered action. The mobile touch UI ultimately feeds the same interaction flow, so reuse it rather than introducing a separate mobile combat action.

### 9. Death/quest behaviour must remain untouched

`HealthState.damageHealth()` is deliberately combat-agnostic. Keep it that way.

`AnimalAgent.collapse()` owns the animal death transition and its `onDeath(animalId)` hook is already used by quest lifecycle code.

Plan 123 should only change **how damage reaches `HealthState`**. Do not add quest calls to the melee resolver and do not duplicate `animal_died` dispatch.

This is especially important for plan 110 / quest v3, where arbitrary animal deaths can already resolve quest state.

## Recommended file-level implementation map

Claude should start with only these files. Do not scan the repository broadly unless one of these reveals a concrete dependency.

### Read first

1. `docs/STATE.md`
2. `docs/plans/2026-08-15--123--universal-melee-combat.md`
3. `src/app/gameLoop.ts`
4. `src/app/interactables.ts`
5. `src/fauna/faunaCombat.ts`
6. `src/fauna/AnimalAgent.ts`
7. `src/items/itemCatalog.ts`
8. `src/items/HeldTool.ts`
9. `src/items/heldToolVisual.ts`
10. `src/player/PlayerController.ts`
11. `src/player/PlayerNeeds.ts`
12. `src/shared/HealthState.ts`
13. `src/shared/StaminaState.ts`
14. `src/interaction/findInteractionTarget.ts`
15. `src/input/Keyboard.ts`
16. `src/fauna/faunaCombat.test.ts`

Only inspect `resolveInteraction.ts` if the new `[E]` routing needs it. Only inspect Vue touch chrome if browser testing shows that the existing interaction button does not reach the same edge-triggered `E` path.

### Likely files to modify

- `src/items/itemCatalog.ts` — melee configuration source of truth.
- `src/fauna/faunaCombat.ts` — remove duplicated player damage/config, retain fauna-specific damage and health exports where still used.
- `src/player/playerMelee.ts` — new small action/timing/hit resolver module.
- `src/app/gameLoop.ts` — instantiate/tick the player melee action and replace the current direct player→animal damage special case.
- `src/player/PlayerController.ts` — expose only the minimal procedural melee visual API required by the resolver/game loop.
- `src/fauna/faunaCombat.test.ts` — update existing catalog/config assertions or move player-melee assertions to a dedicated `playerMelee.test.ts`.
- optionally `src/player/playerMelee.test.ts` — pure lifecycle/hit/stamina tests.

Avoid unrelated refactors.

## Suggested implementation order

### Phase A — configuration

1. Extend the existing `ITEM_CATALOG` melee entry with only plan-123 fields.
2. Preserve the six existing damage values.
3. Add initial per-weapon timing/range/arc/stamina values.
4. Remove `PLAYER_TOOL_DAMAGE` duplication from `faunaCombat.ts`.
5. Keep `isMeleeTool()` as a lightweight type guard if existing callers still need it; it may read the catalog rather than maintaining another list if that is safe.

### Phase B — pure melee lifecycle

Create `playerMelee.ts` with a small state machine.

Suggested public surface:

- `requestAttack(tool, stamina)` or equivalent;
- `update(dt, context)`;
- `isAttacking()`;
- `cancel/reset()` if needed for pause/modal/rebuild safety;
- a callback/result for the single hit-window resolution.

Prefer pure logic where practical so timing tests do not require Three.js or DOM.

### Phase C — hit resolver

At the hit window:

- use existing player position/yaw;
- use existing fauna agent collection;
- filter alive/active animals;
- range + facing arc;
- apply `damageHealth(animal.health, config.damage)`;
- guard the current attack with `attackId` / `Set<animalId>`.

Do not raycast the whole scene.

### Phase D — player visual

Add the smallest possible visual hook to `PlayerController`.

The visual hook should be time/progress based so the gameplay hit window and visual swing share the same attack lifecycle.

Preserve normal held-tool transform after recovery.

### Phase E — input migration

Replace the current direct `[E]` player→animal damage branch in `gameLoop.ts` with the melee action request.

Keep `[E]` for all other interactions unchanged.

Do not change the `Interactable` model unless required.

### Phase F — tests

Add deterministic tests for:

- each six tool's configuration exists;
- damage values are preserved;
- different weapons have different timing;
- insufficient stamina rejects attack;
- successful attack drains stamina exactly once;
- attack cannot be requested during recovery;
- hit resolves only inside range;
- hit resolves only inside arc/facing;
- dead/inactive animals are ignored;
- one attack cannot damage the same animal twice;
- separate attacks can damage the same animal again.

Do not try to unit-test Three.js visual correctness.

### Phase G — browser verification

Use the repository's normal manual browser workflow from `CLAUDE.md`.

Desktop:

1. Equip knife and attack a live animal.
2. Verify visible wind-up/swing/recovery.
3. Verify hit occurs at the visual hit point, not immediately on `[E]`.
4. Verify no repeated damage while holding/repeating `[E]` faster than cooldown.
5. Verify range and arc.
6. Verify stamina drain and rejection at insufficient stamina.
7. Repeat with sword, axe, pitchfork, sickle and shovel.
8. Kill an animal and verify corpse/death/quest behaviour remains unchanged.

Mobile/touch:

9. Verify the existing interaction/attack button triggers the same melee request.
10. Verify look direction changes the melee arc as expected.

Visual correctness remains browser/manual verification; TypeScript/build passing is not enough.

## Tuning recommendation

Do not make all weapons identical except damage.

A useful first-pass relationship is:

- knife: short range, narrow/fast;
- sickle: short/medium range, medium speed;
- shovel: medium range, slow;
- axe: medium range, slow/heavy;
- pitchfork: longer range, medium speed;
- long sword: longest range, medium/slow, highest damage.

Keep the numbers conservative. The goal is readable differences, not a complete RPG weapon-balance system.

## Scope guardrails

Explicitly do **not** add during plan 123:

- NPC targets;
- NPC combat AI;
- NPC weapons;
- armor/resistance;
- block/parry;
- combo chains;
- charged attacks;
- knockback/stun/bleed;
- durability;
- ranged combat;
- multiplayer/network state;
- save/persistence for combat state;
- generic combat manager/service.

Branch remains out of scope even though `ITEM_CATALOG` mentions it as a future improvised weapon.

## Documentation/assets

No new 3D model is required by the reviewed implementation approach. Existing held tool models and the existing player character are sufficient for the first pass.

Do not update `docs/assets/MODELS.md` unless implementation discovers that a genuinely new asset is required.

## Verification commands

Run the standard checks from `CLAUDE.md`:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Then perform manual browser verification for the visual/gameplay acceptance criteria.

## Final assessment

Plan 123 should remain **M / high priority / no dependency**. It is a good incremental extension of already-existing player, item, fauna, health and stamina systems.

The key implementation decision is: **make melee a small player action + deterministic hit resolver, not a new combat framework.**

This gives the plan nearly all of its intended scope while keeping the codebase ready for a later extension where NPCs can eventually become attackers/targets without requiring today's implementation to contain NPC combat.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

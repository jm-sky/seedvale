# Implementation Notes: npc-022 — Agility-driven melee recovery

Focused recon against current `main`; implementation guidance only.

## Existing ownership to reuse

- `src/shared/PhysicalAttributes.ts` is only the stable, consumer-agnostic SPEA data primitive. It explicitly must not own combat/profile logic.
- `src/settlement/npcPhysicalProfile.ts` owns deterministic human profile resolution. `resolveHumanStrengthProfile()` is the current precedent; there is no generic `effectiveAttributes`/modifier stack after `npc-019`.
- Add Agility-specific human age/profile resolution here, analogous in ownership to Strength but with its own age anchors and **no sex shift**. For this plan, NPC effective Agility can simply be the resolved human Agility profile; leave future temporary-condition modifiers as a seam, not a framework.
- Player Agility already lives at `PlayerController.attributes.agility` (`PLAYER_STARTING_ATTRIBUTES.agility = 0.6`). The Player currently has no age/profile layer.
- `src/items/itemCatalog.ts::MeleeConfig.recovery` remains the base weapon timing.
- `src/combat/meleeAttack.ts::createMeleeAttackLifecycle()` is already the single Player/NPC timing state machine. Put the recovery override into this shared lifecycle path rather than duplicating timers in `playerMelee`/`NpcAgent`.

## Recommended shape

Add a small pure combat-owned resolver, parallel to `combat/meleeStrength.ts`, e.g. `combat/meleeAgility.ts`:

```text
resolveMeleeRecovery(baseRecovery, effectiveAgility) -> seconds
```

Keep `0.5` exactly neutral and clamp the input/output mapping to the plan's bounded range. Do not put this formula on `PhysicalAttributes`.

When starting an attack, resolve recovery once and snapshot it for that attack. Do not recompute Agility per frame or mid-swing.

Prefer extending `MeleeAttackLifecycle.start(...)` with a resolved recovery/timing override (or equivalent internal snapshot) while retaining the original `MeleeConfig` for hit damage/range. Avoid cloning/mutating `MeleeConfig.recovery` as the general integration mechanism.

Reason: `player/playerMelee.ts::requestAttack()` currently charges Vigor from the configured `windUp + hitWindow + recovery`. Passing a modified config through that path would silently make Agility change Vigor cost as a secondary effect. `npc-022` only needs cadence recovery; keep existing stamina/Vigor charging semantics unless deliberately changed by a separate decision.

## Integration points

- **Player:** resolve from `PlayerController.attributes.agility` at attack start and pass only the resolved recovery into `PlayerMelee`/shared lifecycle. `windUp`, `hitWindow`, hit config and stamina cost stay untouched.
- **NPC:** `NpcAgent` already receives the deterministic `PhysicalProfile` used to resolve Strength once at construction. Resolve/profile Agility from the same object and use it when starting the existing shared melee lifecycle. Do not read raw `profile.attributes.agility` for NPC gameplay once the age resolver exists.
- `src/ai/npcCombat.ts` should not need the Agility formula: it resolves hits, not attack cadence.
- Recovery presentation already derives from `MeleeAttackLifecycle.phaseProgress()`. If the lifecycle's recovery duration is the resolved duration, the existing player swing recovery visual follows it without changing wind-up/hit playback speed.

## Tests worth adding/changing

- `src/settlement/npcPhysicalProfile.test.ts`: Agility age anchors/shape, neutral individual variation semantics, and no sex-dependent shift.
- New `src/combat/meleeAgility.test.ts`: exact neutrality at `0.5`, direction, expected endpoints/bounds, deterministic clamping.
- `src/combat/meleeAttack.test.ts`: a recovery override changes only time spent in `recovery`; `hitReady` still occurs after the original `windUp` and exactly once.
- Integration coverage only where needed to prove Player/NPC both feed the same resolver/lifecycle; do not duplicate the pure mapping tests per actor.

## Pitfalls

- The plan wording about an existing shared "effective-attribute mechanism" is ahead of current code. Do not introduce `AttributeModifier[]`, `AgilityManager`, temporary-condition state or a generic effective-attribute service just to satisfy that wording.
- Do not alter `ITEM_CATALOG` weapon recovery values; they remain base weapon identity.
- Do not derive recovery from the generic `ageMultiplierForAge()`; add the dedicated modest Agility age curve requested by the plan.
- Preserve large-`dt` lifecycle cascading in `meleeAttack.ts`; any resolved-recovery snapshot must still work with the existing loop that can cross several phases in one update.
- NPC combat execution state is runtime-only/not persisted, so resolved per-attack recovery does not belong in `SaveData`.

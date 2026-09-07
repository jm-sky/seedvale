# Plan: Agility-driven melee recovery

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** S
**Depends on:** ~~npc-019~~
**Domain:** `npc`
**Subdomains:** `combat` `lifecycle`
**Tags:** `spea` `agility` `melee`
**Roadmap:** `physical-attributes-health-and-medicine`

## Goal

Introduce the first gameplay consumer of **Agility** in the shared SPEA model: melee recovery cadence for the Player and NPCs.

Agility represents coordination, mobility and reaction capability. In this plan it affects only how quickly an actor recovers after a melee attack and becomes ready for the next action. It does not globally make actions, movement or animations faster.

The existing melee lifecycle remains:

```text
idle → windUp → hitWindow → recovery → idle
```

Weapon configuration remains the source of truth for base recovery. Effective Agility modifies that recovery through a melee-specific capability mapping.

`Agility = 0.5` is legacy-neutral. The Player's starting `Agility = 0.6` should provide a small but meaningful cadence advantage.

## Scope

### Human Agility age profile

Add a lightweight, Agility-specific age contribution for humans rather than reusing the existing generic physical `ageMultiplier`.

The intended shape is:

- children develop toward adult coordination and mobility,
- young adults have a small peak,
- capability remains relatively high through adulthood,
- decline is gradual through middle age,
- decline becomes clearer in old age.

The curve must remain modest: age influences individual Agility but does not determine it. Do not add a sex modifier for Agility without a separate system-level reason.

Initial calibration direction:

| Age | Agility age factor |
|---:|---:|
| 8 | ~0.80 |
| 14 | ~0.94 |
| 20 | ~1.03 |
| 25 | ~1.05 |
| 35 | ~1.03 |
| 50 | ~0.97 |
| 65 | ~0.88 |
| 80 | ~0.75 |
| 100 | ~0.60 |

Treat these values as balancing guidance, not a requirement to reproduce a particular interpolation implementation.

### Effective Agility

Use the shared SPEA/effective-attribute mechanism established by `npc-019`. Extend that mechanism where necessary rather than introducing parallel Agility state or a dedicated manager.

Conceptually:

```text
base/profiled Agility
+ persistent modifiers
+ age contribution
+ temporary modifiers when those systems exist
→ effective Agility
```

This plan must not implement the later roadmap stages for wounds, diseases, poisoning, Medicine or other temporary medical conditions. It should preserve a clean seam for those systems to affect effective Agility later.

### Melee recovery capability

Introduce one shared, deterministic, melee-specific interpretation of effective Agility for Player and NPC attacks:

```text
weapon base recovery + effective Agility → resolved melee recovery
```

Requirements:

- `Agility = 0.5` preserves the current base recovery exactly,
- values above `0.5` shorten recovery,
- values below `0.5` lengthen recovery,
- the mapping is bounded so extreme attributes cannot collapse or explode attack timings,
- Player and NPC use the same rule,
- the weapon continues to own the base timing and identity of heavy/light attacks.

Initial balancing direction:

```text
Agility 0.0 → ~1.20 × recovery
Agility 0.5 → 1.00 × recovery
Agility 0.6 → ~0.96 × recovery
Agility 1.0 → ~0.80 × recovery
```

Exact values may be calibrated during implementation while preserving the neutral point and bounded, modest effect.

### Player and NPC integration

Apply resolved recovery to the existing shared melee lifecycle for both Player and NPC attacks.

Agility must not change melee `windUp`, hit timing, damage, range or stamina cost in this plan. In particular, shortening recovery must not accidentally speed up the pre-hit portion of the attack animation or move the actual hit earlier.

Preserve the existing presentation/lifecycle relationship: animation timing may need to reflect the resolved lifecycle, but generic animation playback speed is not an Agility consumer.

## System interactions

The SPEA attributes should create complementary combat capabilities rather than overlapping multipliers:

```text
Strength  → how forceful the attack is
Endurance → how long the actor can sustain effort
Agility   → how quickly the actor recovers for the next melee action
```

A more agile fighter may therefore attack again sooner but still consumes the action-owned stamina cost and can exhaust themselves faster. A heavy weapon retains a longer base recovery than a light weapon; Agility creates individual variation without erasing weapon identity.

## Non-goals

Do not connect Agility in this plan to:

- normal walk or sprint top speed,
- acceleration or deceleration,
- turning rate or angular velocity,
- slope movement or pathfinding,
- sneak speed,
- threat/visual/hearing detection ranges — these belong primarily to Perception,
- reaction delay, which does not yet exist as a shared mechanic,
- fleeing top speed or manoeuvrability,
- fauna individual variation,
- melee wind-up,
- ranged wind-up/recovery, draw or reload timing,
- damage, range or stamina costs,
- generic animation speed,
- dodge/evade chance without an existing dodge mechanic,
- a universal `agilityMultiplier` or generic action-duration multiplier.

Movement responsiveness, reaction timing, ranged combat and fauna can become separate Agility consumers later, each with its own capability mapping if justified by the actual system.

## Architecture and performance constraints

- Reuse the SPEA ownership/API that actually exists after `npc-019`; do not implement against assumptions from the earlier plan text.
- Keep melee recovery resolution shared between Player and NPC rather than duplicating actor-specific rules.
- Prefer resolving/caching effective attributes at appropriate state changes and resolving recovery when an attack starts; do not add a new per-frame Agility pass across NPCs.
- Do not introduce an `AgilityManager`, generic attribute multiplier or new locomotion manager for this scope.
- Add JSDoc to important new architectural/public functions or classes where it improves preflight discovery; use an appropriate `@domain` tag when useful.

## Verification

Automated coverage should establish:

- `Agility = 0.5` preserves base recovery,
- higher/lower Agility changes recovery in the expected direction,
- `0.0` and `1.0` remain within safe bounded timings,
- identical Agility and weapon recovery resolve consistently for Player and NPC,
- the age profile covers development, young-adult peak, gradual adult decline and stronger old-age decline,
- neutral Agility preserves existing combat behaviour,
- wind-up and hit timing are unchanged by Agility,
- existing combat tests, typecheck and build remain green.

Manual browser verification is performed by the User. Verify that `0.6` feels like a small cadence advantage over `0.5`, that NPC differences remain modest, that heavy/light weapon identity is preserved, and that shortened recovery does not visually accelerate the wind-up or move the hit moment.

## Completion criteria

- Human Agility has a dedicated, lightweight age contribution.
- `0.5` remains legacy-neutral and Player `0.6` receives a small recovery benefit.
- Effective Agility feeds one shared melee recovery capability for Player and NPC.
- Weapon base recovery remains the source of truth.
- Wind-up, damage, range and stamina cost are unaffected.
- No global Agility multiplier or unrelated movement/perception/fauna mechanics are introduced.
- Relevant automated tests cover neutrality, direction, bounds, age profile and Player/NPC consistency.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

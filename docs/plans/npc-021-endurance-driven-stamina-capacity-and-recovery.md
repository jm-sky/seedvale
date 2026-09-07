# Plan: Endurance-driven stamina capacity and recovery

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-019~~
**Domain:** `npc`
**Subdomains:** `behavior`
**Tags:** `spea` `endurance` `stamina` `recovery`
**Roadmap:** `physical-attributes-health-and-medicine.md`

## Goal

Extend the shared SPEA foundation with the first concrete **Endurance** consumers:

1. maximum Stamina capacity;
2. Stamina recovery rate.

Apply the same Endurance semantics to Player and NPC while preserving the existing shared `StaminaState` and activity-specific Stamina costs.

The intended ownership is:

```text
base/profiled Endurance
+ future persistent/temporary modifiers
→ effective Endurance
→ stamina capability mapping
   ├─ max Stamina
   └─ recovery multiplier
→ existing StaminaState
```

This plan establishes the `effective Endurance` consumer seam but does **not** implement a generic modifier framework or temporary condition system.

Endurance must not become a generic fatigue manager or a universal multiplier applied to every physical action.

## Scope boundary

This plan introduces two Endurance consumers:

```text
Endurance
├─ maximum Stamina
└─ Stamina recovery
```

It does not alter the cost of individual activities.

Existing consumers continue to own their own Stamina costs, including Player sprint, melee, ranged combat, physical BusyActions, NPC walking, work and combat, and existing deprivation penalties.

Do not route every `drainStamina()` call through Endurance.

## Shared Stamina remains authoritative

`src/shared/StaminaState.ts` already provides the shared runtime primitive used by Player, NPC and fauna:

```ts
type StaminaState = {
  max: number
  current: number
}
```

Reuse it. Do not introduce `EnduranceState`, Player/NPC-specific Stamina pools, parallel stamina representations, or attribute-effect ownership inside `StaminaState`.

`StaminaState` remains a simple mutable resource pool. Endurance resolves the capability parameters used to initialize and recover that pool.

## Neutral reference

Maintain the SPEA rule established by `npc-019`:

```text
Endurance = 0.5
→ typical healthy adult
→ legacy-neutral gameplay
```

For Stamina:

```text
Endurance 0.5
→ max Stamina 100
→ recovery multiplier 1.00×
```

The Player starts with `Endurance = 0.6`, so the Player receives a small intentional advantage. Do not shift the curves so that `0.6` becomes neutral.

## Endurance → maximum Stamina

Use this mapping:

| Endurance | Max Stamina |
|---:|---:|
| 0.00 | 70 |
| 0.25 | 85 |
| 0.50 | 100 |
| 0.75 | 115 |
| 1.00 | 130 |

Equivalent formula:

```ts
maxStamina = 70 + endurance * 60
```

The mapping is monotonic and linear, keeps `0.5 → 100`, and limits the full SPEA range to ±30% of the neutral adult capacity.

Keep the authoritative simulation value continuous. Presentation may format values independently if needed, but display formatting must not alter the simulation value.

For the Player starting at `Endurance = 0.6`:

```text
max Stamina = 70 + 0.6 × 60 = 106
```

This is intentional; do not preserve the historical Player `100` by shifting the curve.

## Endurance → Stamina recovery

Use this mapping:

| Endurance | Recovery multiplier |
|---:|---:|
| 0.00 | 0.70× |
| 0.25 | 0.85× |
| 0.50 | 1.00× |
| 0.75 | 1.15× |
| 1.00 | 1.30× |

Equivalent formula:

```ts
recoveryMultiplier = 0.7 + endurance * 0.6
```

Consumer-specific base recovery remains owned by the consumer:

```text
consumer base recovery rate
× Endurance recovery multiplier
× existing independent modifiers
→ final recovery rate
```

Do not move base recovery constants into the SPEA system.

## Player recovery integration

The Player's neutral recovery remains `12 Stamina/sec` at `Endurance = 0.5`.

At the starting `Endurance = 0.6`:

```text
recovery multiplier = 1.06
12 × 1.06 = 12.72 Stamina/sec
```

Keep all existing recovery conditions unchanged. Endurance affects how fast recovery occurs **when recovery is already allowed**; it does not decide whether sprinting, another action, deprivation or another existing condition suppresses recovery.

## Activity costs remain unchanged

Endurance must not directly reduce Stamina costs.

Do not implement formulas such as:

```text
staminaCost / enduranceMultiplier
```

or:

```text
drainRate × (1 - endurance)
```

The benefit of Endurance is the combination of a larger Stamina pool and faster recovery. Existing sprint, combat, BusyAction, NPC fatigue and deprivation drain values remain owned by their current consumers.

This also keeps Strength and Endurance distinct after `npc-020`:

```text
Strength
→ physical-work speed
→ shorter/longer duration

existing effort rate × actual duration
→ Stamina spent

Endurance
→ available Stamina capacity
→ recovery after/between effort
```

Do not add a second Endurance discount to time-based work costs.

## Endurance and Vigor remain separate

Do not make Endurance affect Vigor in this plan.

Keep the conceptual distinction:

```text
Stamina = short-term physical exertion capacity
Vigor   = longer-term activity / daily physiological budget
```

Do not modify Player/NPC max Vigor, Vigor drain, Vigor recovery or sleep/recovery semantics. A later plan may connect Endurance with longer-term exertion only if gameplay evidence supports it.

## NPC legacy Stamina modelling migration

Current NPC physical-profile generation predates SPEA and derives `maxStamina` directly from adult baseline, sex modifier, generic age multiplier and independent `staminaVariation`.

Do **not** simply multiply that existing final capacity by an Endurance multiplier. That would double-model demographic and individual physical differences.

The target ownership is:

```text
NPC demographic/development/individual profile inputs
→ base/profiled Endurance
→ effective Endurance
→ Endurance stamina resolver
→ maxStamina
```

The exact migration must follow the structure actually introduced by `npc-019`.

Existing `staminaVariation`, sex-based Stamina modifiers and generic age inputs must no longer remain as a **second downstream multiplier on final `maxStamina`** once Endurance is authoritative. They may be migrated or reused as upstream inputs to deterministic Endurance profiling if that is consistent with the `npc-019` implementation and avoids duplicated biological modelling.

Prefer:

```text
sex / age / development / individual profile
→ Endurance shaping
→ maxStamina
```

not:

```text
profiled Endurance
× sex stamina modifier
× generic age multiplier
× independent staminaVariation
→ maxStamina
```

Do not blindly reuse the old generic age multiplier on final Stamina after age/development has already shaped Endurance.

## NPC recovery

NPC currently has a base rest recovery rate of `6 Stamina/sec` plus existing trait behaviour.

At neutral Endurance:

```text
6 × 1.00 = 6/sec
```

At `Endurance = 0.6`:

```text
6 × 1.06 = 6.36/sec
```

Endurance applies only when existing NPC logic already chooses to restore Stamina. Do not redesign rest phases, exhaustion decisions or action scheduling.

## Existing `energetic` trait remains separate

The NPC `energetic` trait currently affects fatigue consumption and Stamina rest rate. Do not replace it with an Endurance bonus.

Target recovery composition:

```text
base NPC recovery rate
× Endurance recovery multiplier
× existing energetic recovery modifier
→ final recovery
```

Fatigue drain remains:

```text
activity-specific fatigue rate
× existing energetic fatigue modifier
→ Stamina drain
```

Do not implement `energetic → +Endurance` in this plan. Traits and physical attributes remain compositionally distinct until a future explicit trait/attribute-modifier system decides otherwise.

Preserve current `energetic` tuning unless tests or focused implementation recon expose pathological behaviour. Add coverage or verification ensuring the combination of Endurance and `energetic` does not accidentally create effectively unbounded work/recovery loops; do not rebalance the trait speculatively.

## Exhaustion semantics remain unchanged

Keep existing NPC ratio-based exhaustion/resume semantics, including the current resume threshold around `0.35` of max Stamina. Because the threshold is ratio-based, it naturally scales with Endurance-derived capacity.

Do not add new exhaustion tiers, forced-rest mechanics, Player movement debuffs, attack-speed penalties or other new exhaustion states.

## Deprivation penalties remain unchanged

Player Hunger/Thirst can already drain Stamina as a capability penalty. Keep those drain rates unchanged.

A high-Endurance character may tolerate the same absolute deprivation drain for longer because the pool is larger. That is acceptable here.

Disease/injury-based effective Endurance penalties belong to later health/conditions work.

## Runtime max-capacity semantics

Fresh character construction remains straightforward:

```text
resolved/effective Endurance
→ derived max Stamina
→ createStaminaState(max)
→ current = max
```

If an existing runtime character's effective Endurance later changes and the maximum must be recalculated, use this invariant:

```text
newMax = resolveMaxStamina(effectiveEndurance)
current = min(current, newMax)
```

A decrease in maximum clamps `current` to the new maximum. An increase in maximum does **not** grant free Stamina or refill the gained capacity.

This plan establishes that semantic contract even though temporary/persistent Endurance modifiers are out of scope. Do not build the modifier system just to exercise it now.

## Persistence

Follow the persistence boundary established by `npc-019` and current restore-as-construction architecture.

Keep the conceptual ownership explicit:

```text
base/profiled Endurance = persistent character capability
effective Endurance     = derived from base/profile + future modifiers
Stamina.current          = mutable runtime resource
Stamina.max              = derived capability
```

Do not persist values that can be deterministically derived from authoritative profile/SPEA state unless the current persistence architecture explicitly requires them. Do not introduce a persistence version bump unless the actual implementation requires a stored schema change.

## Fauna remains out of scope

Fauna already uses shared `StaminaState` but owns species-level `staminaCapacity`, `staminaDrainRate` and `staminaRegenRate`. `npc-019` does not yet introduce individual SPEA for fauna, so this plan must not migrate fauna to Endurance.

Do not change animal capacity, sprint/swim drain, recovery or species metabolism tuning.

Keep future compatibility conceptually:

```text
species stamina capability
+ individual Endurance
→ effective animal stamina capability
```

but do not implement it here.

## Architecture after npc-021

```text
PhysicalAttributes
├─ Strength
│  ├─ melee damage
│  ├─ physical work speed
│  └─ human carry capacity
│
├─ Endurance
│  ├─ max Stamina
│  └─ Stamina recovery
│
├─ Perception
│  └─ later
│
└─ Agility
   └─ later
```

Consumers remain independent. Do not place gameplay methods on `PhysicalAttributes` and do not introduce a broad `StaminaCapabilities`/fatigue manager abstraction unless actual code requires it.

Prefer focused pure capability resolvers for Endurance → max Stamina and Endurance → recovery multiplier.

## Tests

Protect the shared capability mappings:

| Endurance | Max Stamina | Recovery |
|---:|---:|---:|
| 0.00 | 70 | 0.70× |
| 0.25 | 85 | 0.85× |
| 0.50 | 100 | 1.00× |
| 0.60 | 106 | 1.06× |
| 0.75 | 115 | 1.15× |
| 1.00 | 130 | 1.30× |

Verify monotonic capacity/recovery and exact legacy neutrality at `0.5`.

Player coverage should verify:

- `Endurance 0.5 → max 100`;
- starting `Endurance 0.6 → max 106`;
- neutral recovery remains `12/sec`;
- starting recovery becomes `12.72/sec`;
- sprint, melee, ranged and physical-work Stamina costs remain unchanged;
- existing recovery suppression conditions remain unchanged.

NPC coverage should verify:

- `Endurance 0.5 → max 100` and neutral base recovery;
- representative `Endurance 0.6 → max 106` and recovery `×1.06`;
- `energetic` composes independently with Endurance;
- the combined `energetic` + Endurance behaviour does not accidentally produce pathological near-unbounded work/recovery loops;
- existing walking/work fatigue rates remain unchanged;
- exhaustion resume ratio remains unchanged;
- legacy demographic/variation inputs do not multiply final Stamina a second time after Endurance profiling.

If runtime max recalculation is exposed in this implementation, test that lowering max clamps current and raising max does not refill current.

## Documentation

Update canonical current-state documentation after implementation, especially:

- `docs/state/player-systems.md`;
- `docs/state/npc.md`.

Document:

```text
Endurance → max Stamina
Endurance → recovery multiplier
activity owns drain rate
Vigor remains separate
```

For NPCs, document migration away from pre-SPEA direct final-Stamina sex/age/random multipliers while noting any legacy inputs deliberately reused upstream for Endurance profiling.

Keep `docs/world/species-physical-reference.md` and the human physical calibration documentation authoritative for SPEA interpretation rather than duplicating their content here.

Add/update JSDoc for important architectural/public Endurance capability resolvers where useful for preflight discovery, with `@domain` where appropriate.

## Expected integration points

Focused recon identified likely seams:

- shared `PhysicalAttributes` / Endurance introduced by `npc-019`;
- `src/shared/StaminaState.ts`;
- `src/player/PlayerNeeds.ts`;
- Player creation/reset/restore paths using `createPlayerNeeds()`;
- `src/settlement/npcPhysicalProfile.ts`;
- `src/settlement/npcState.ts`;
- `src/ai/NpcAgent.ts`;
- existing NPC stamina tests;
- existing Player needs/stamina tests;
- canonical Player/NPC state docs.

These are integration seams, not a requirement to modify every file. Prefer focused changes.

## Non-goals

- Endurance-based Stamina cost reduction;
- sprint/combat/physical-work effort-rate changes;
- Vigor changes or long-term fatigue redesign;
- sleep redesign;
- new exhaustion debuffs or tiers;
- HP or HP regeneration changes;
- injury/disease/poisoning effects;
- Medicine;
- generic attribute modifier framework;
- temporary Endurance modifiers;
- attribute progression or UI;
- Agility or Perception consumers;
- fauna SPEA/stamina migration;
- body mass;
- profession skills or tool efficiency.

## Stop conditions

- If implementation requires modifying every Stamina drain call, stop: Endurance affects capacity/recovery, not costs.
- If legacy NPC demographic/variation Stamina logic would remain as downstream multipliers alongside Endurance, stop and move/remove the duplicated final-capacity modelling.
- If migrating NPC Stamina requires redesigning all of `npcPhysicalProfile`, keep scope to the smallest change that establishes Endurance as authoritative.
- If Endurance starts affecting Vigor merely because both are physical resources, stop and keep them separate.
- If `energetic` becomes an implicit Endurance bonus, keep it as an independent existing modifier.
- If fauna integration becomes necessary, defer it to fauna-specific SPEA work.
- Do not introduce a generic modifier framework to solve a future problem.

## Verification

Use current repository scripts from `package.json` for focused tests and applicable typecheck/build/test gates.

Do not run `pnpm docs:sync` manually; derived documentation is handled by the GitHub workflow.

Browser/manual verification is performed by the User, not the AI agent.

Manual checks should include:

- starting Player has `106` max Stamina;
- Player Stamina regenerates slightly faster than the old neutral baseline;
- sprint and combat costs are unchanged;
- neutral test Endurance `0.5` preserves the previous `100` Stamina baseline;
- NPCs with different Endurance have different capacity/recovery;
- NPC walking/work drain behaviour remains otherwise unchanged;
- `energetic` NPCs retain their independent advantage without pathological recovery/work behaviour.

## Completion criteria

- Endurance has one shared capability mapping for max Stamina.
- Endurance has one shared recovery multiplier rule.
- `Endurance = 0.5` preserves `100` max Stamina and neutral recovery.
- Player starting `Endurance = 0.6` resolves to `106` max Stamina and `1.06×` recovery (`12.72/sec` from the current Player base).
- Activity-specific Stamina costs remain unchanged.
- NPC final max Stamina is derived through Endurance without duplicated legacy downstream demographic/variation multipliers.
- Legacy NPC profile inputs are removed from final Stamina composition or reused only upstream where consistent with `npc-019`.
- NPC recovery uses Endurance while preserving existing rest ownership and independent `energetic` composition.
- Runtime max-capacity semantics are defined as clamp-on-decrease/no-refill-on-increase.
- Exhaustion thresholds remain ratio-based and unchanged.
- Vigor and fauna remain unaffected.
- Tests and canonical docs reflect the resulting ownership.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

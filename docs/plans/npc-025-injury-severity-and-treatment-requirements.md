# Plan: Injury severity and treatment requirements

**Created:** 2026-09-06
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** npc-002, ~~npc-019~~, npc-024
**Domain:** `npc`
**Subdomains:** `lifecycle`
**Tags:** `injury` `health` `spea` `healing` `treatment`
**Roadmap:** `physical-attributes-health-and-medicine`

## Goal

Extend the existing NPC physical-injury and healing flow with meaningful **derived injury severity**, differentiated recovery/treatment requirements and temporary impairment of physical capabilities.

The feature evolves the existing flow:

```text
accepted physical damage
        ↓
physicalInjury
        ↓
derived injury severity
        ↓
├─ effective SPEA modifier
├─ existing healing pressure score / feasibility
├─ natural recovery rate
└─ treatment effectiveness / eligibility
```

without replacing `physicalInjury`, `HealthState`, NPC pressure/decision architecture or the healing action introduced by `npc-002`.

This plan establishes the patient-side injury model needed before Medicine competence and assisted treatment are introduced later.

## Core principle

`physicalInjury` remains the single authoritative injury amount.

Severity is **derived**, not stored as a second independent source of truth.

Prefer:

```text
physicalInjury
+
physical capacity / max HP context
        ↓
derived injury severity
```

rather than persisting an independent severity enum that can drift out of sync.

A likely normalization is relative outstanding injury such as `physicalInjury / maxHp`, but the final resolver must be grounded in current health/physical-profile semantics on HEAD.

## Severity model

Introduce a small shared derived vocabulary:

```text
none
minor
serious
critical
```

Required semantics:

```text
none
→ no outstanding healable physical injury

minor
→ ordinary wound
→ natural recovery
→ self-treatment optional

serious
→ meaningful impairment
→ slow natural recovery
→ suitable self-treatment materially improves recovery

critical
→ severe physical impairment
→ natural recovery alone cannot fully resolve the critical state
→ suitable self-treatment may stabilize/reduce it
→ establishes the future assisted-treatment boundary
```

Do not add wound anatomy/types such as cuts, fractures or burns. Severity describes how serious the existing physical injury is, not what anatomical injury occurred.

Thresholds must be explicit, deterministic and tested. Avoid hidden threshold copies across decision, UI and treatment code; use one pure severity resolver.

## Relationship to HP

Keep the existing distinction:

```text
HP
→ immediate current health/integrity

physicalInjury
→ outstanding healable physical-damage burden
```

Low HP alone must not imply physical-injury severity.

Do not derive injury from `maxHp - currentHp`. Future non-physical HP loss such as deprivation or disease must not automatically become physical injury.

Existing accepted physical-damage accounting remains authoritative.

## Relationship to temporary conditions

`npc-024` introduces composable temporary physical-condition effects. Reuse that effective-SPEA modifier/composition seam rather than creating a second injury-specific attribute pipeline.

Keep the state concepts distinct:

```text
physicalInjury
→ physical damage / wounds

temporary conditions
→ poisoning / illness / temporary condition state
```

Both may contribute to effective physical capabilities:

```text
base SPEA
   +
persistent/profile modifiers
   +
physical injury modifiers
   +
temporary-condition modifiers
   ↓
effective SPEA
```

Do not migrate `physicalInjury` into the condition collection in this plan.

## Injury impairment

Physical injury should have real consequences beyond missing HP.

Derived severity should contribute bounded temporary modifiers to relevant effective SPEA.

Initial target attributes:

```text
Strength  ↓
Endurance ↓
Agility   ↓
```

Do not reduce Perception merely for symmetry.

Impairment should scale monotonically with severity:

```text
minor    → small impairment
serious  → clearly noticeable impairment
critical → substantial but bounded impairment
```

Exact values must be tuned conservatively against current SPEA consumers. Critical injury must not automatically collapse every capability to near zero.

Do not add direct injury branches to melee, work, carrying, stamina or other capability consumers. Existing consumers should react through effective SPEA.

## Recovery and HP accounting

Natural recovery must preserve the existing `physicalInjury` ↔ HP accounting invariant.

Do not simply decrement `physicalInjury` while leaving HP unchanged.

When natural recovery restores physical injury:

```text
requested physical recovery
        ↓
healHealth(existing HealthState primitive)
        ↓
actualRestoredHp
        ↓
physicalInjury -= actualRestoredHp
```

The actual HP restored, not the nominal recovery amount, determines how much outstanding injury disappears.

This is the same accounting principle already used by `npc-002` treatment and prevents physical injury from drifting away from the physical HP loss it represents.

Natural recovery must not heal unrelated non-physical HP deficit through an injury fallback. Recovery is bounded by outstanding `physicalInjury`.

## Recovery by severity

Use a simple deterministic first model.

### Minor

```text
minor injury
→ ordinary passive natural recovery
```

Minor injury should eventually resolve without consuming medicine.

### Serious

```text
serious injury
→ substantially slower natural recovery
→ suitable self-treatment materially accelerates/reduces injury
```

Serious injury should not become permanently stuck solely because an item is unavailable.

### Critical

Use an explicit V1 boundary:

```text
critical injury
→ natural recovery may improve the injury only to the serious boundary
→ natural recovery alone cannot cross critical → serious
→ sufficiently effective self-treatment may stabilize/reduce it into serious
→ later assisted Medicine can improve this model further
```

The exact implementation may express the boundary through recovery clamping rather than a separate persisted state.

This keeps a critically injured NPC impaired and in need of treatment without making the simulation depend on doctors before the assisted-treatment plan exists.

Do not create a poisoning-style condition merely to implement the critical boundary.

## Time and off-screen recovery

Injury recovery is slow-changing simulation state.

Prefer:

- low-frequency or elapsed-game-time progression,
- existing NPC lifecycle/update cadence,
- deterministic recovery,
- compatibility with settlement streaming/off-screen simulation.

Avoid:

- render-frame injury updates,
- global entity scans,
- timers owned only by rendered `NpcAgent` presentation lifecycle,
- camera-distance-dependent recovery.

Settlement unload/reload must not reset injury. Save/load must preserve the authoritative injury amount.

If elapsed recovery can be derived from existing game-time progression, do that. Add new persisted temporal state only if current simulation ownership proves it necessary.

## Treatment capability

Reuse and extend the catalog-driven treatment capability introduced by `npc-024`.

The catalog must be able to distinguish:

```text
item can treat physical injury
+
treatment strength/effectiveness
```

without condition/injury logic hard-coding an `ItemKind`.

Do not require a particular schema such as `maximumSeverity` unless current catalog architecture makes it the smallest coherent representation. A potency/effect model that can be evaluated against current severity is equally valid.

The important invariant is:

```text
current injury severity
+
catalog-declared physical-injury treatment capability
→ treatment eligibility/effectiveness
```

Do not infer treatment suitability solely from `consumable.need === 'health'`.

A generic HP-healing item is not automatically valid treatment for every physical injury severity.

For example, catalog data may make a bandage useful for physical injury while an herb remains useful for another treatment purpose. These item names must not appear in injury-domain policy.

Avoid a generic effect scripting engine.

## Existing NPC self-healing

Reuse the `npc-002` pipeline:

```text
injury state
→ existing healing candidate / pressure
→ npcDecision
→ heal NpcPlannedAction
→ goTo
→ execute
→ consume
→ apply treatment
→ choose
```

Severity must **extend the existing healing candidate**, not create parallel pressure types.

Do not introduce:

```text
minorInjuryPressure
seriousInjuryPressure
criticalInjuryPressure
```

Instead:

```text
existing healing candidate
+
derived severity
+
available suitable treatment
→ feasibility + score
```

Keep one top-level arbitration path.

## Healing decision semantics

Severity should influence how strongly the existing healing candidate competes with ordinary behavior.

Conceptually:

```text
minor
→ low/moderate healing priority

serious
→ strong healing priority when suitable treatment exists

critical
→ very strong recovery/treatment priority outside active combat
```

Preserve existing decision precedence for collapse, survival and other current critical semantics.

Do not create a separate medical priority table outside `npcDecision`.

Treatment availability must affect feasibility. An NPC must not repeatedly choose a treatment action that cannot treat the current injury.

If no suitable treatment exists, the NPC remains in normal deterministic decision flow while natural recovery and capability impairment continue.

## Treatment execution

Keep the existing generic `heal` action execution seam unless current code demonstrates a real need for a narrower rename/refinement.

At execution time revalidate at least:

- NPC is alive,
- `physicalInjury > 0`,
- current derived severity,
- selected item still exists,
- current catalog entry still declares suitable physical-injury treatment,
- HP can actually be restored.

Only consume an item after treatment preconditions pass.

Treatment reduction of `physicalInjury` must remain tied to actual physical HP restored where it performs immediate healing.

If catalog treatment provides recovery support rather than immediate healing, keep that effect explicit and bounded; do not fake HP restoration merely to reuse the immediate-heal path.

## Combat semantics

Preserve the existing boundary:

```text
combat hit
→ accepted physical damage
→ physicalInjury increases
→ combat continues normally
```

Combat code should not own severity policy beyond registering the physical consequence.

Do not implement:

```text
if critical injury:
    interrupt combat
    start healing
```

Retreat, surrender and rescue are future combat-strategy concerns.

After combat ends, normal NPC decision arbitration may react to the now-derived severity.

## Critical-injury behavior

Critical injury must be meaningful even before assisted Medicine exists.

At minimum:

- effective SPEA impairment is substantial,
- ordinary work/schedule should usually lose to feasible recovery/treatment behavior,
- natural recovery cannot silently erase the critical state,
- suitable self-treatment can provide a route back into serious injury,
- lack of suitable treatment does not create an endless failed-action retry loop.

Do not invent doctors, hospitals or medical locations to solve this case.

## Player compatibility

Keep severity and modifier helpers domain-neutral enough for future Player injury use.

Do not force a Player injury-state redesign into this plan. Current authoritative implementation remains centered on NPC `physicalInjury` unless HEAD already contains an equivalent Player injury owner that can be connected without unrelated restructuring.

Do not create a fake Player `physicalInjury` field solely for symmetry.

## Persistence

Continue persisting only authoritative injury state:

```text
physicalInjury
```

Do not persist:

- derived severity,
- injury SPEA modifier totals,
- healing-pressure score,
- treatment eligibility,
- presentation state.

After restore:

```text
physicalInjury
→ derive severity
→ derive injury modifiers
→ recompute effective SPEA
```

No save migration should be required solely for severity if current `physicalInjury` persistence remains unchanged.

## UI and observation

Do not create a second injury-label information system.

`npc-023` remains authoritative for normal Player observation of NPC physical information. Qualitative states such as hurt/badly wounded/critical should reuse its observation-level semantics where they are already supported.

Do not automatically reveal exact `physicalInjury` or numeric severity information in normal gameplay.

Debug mode should expose exact:

- `physicalInjury`,
- derived severity,
- injury SPEA modifiers,
- current treatment eligibility where practical.

With `Full label info` enabled, debug information bypasses normal observation gating.

## Debug tooling

Extend existing debug tooling only enough to make deterministic browser verification practical.

Useful operations:

```text
apply minor injury
apply serious injury
apply critical injury
clear injury
```

Prefer using the real accepted-injury/accounting helpers rather than directly mutating several related values independently.

Do not create a separate injury debug application.

## Future Medicine boundary

This plan deliberately owns only the patient-side model.

It should leave a clean seam for the next phase:

```text
critical / serious injury
        ↓
treatment requirement
        ↓
healer Medicine competence
        ↓
assisted treatment action
        ↓
patient physicalInjury reduction
```

Do not introduce placeholder Doctor/Herbalist managers or a generic competence system here.

## Non-goals

Do not implement:

- Medicine competence,
- generic skills/competence framework,
- assisted treatment,
- NPC treating another NPC,
- NPC treating Player,
- Doctor AI or Herbalist AI,
- hospital/clinic locations,
- medical profession/work duty,
- wound anatomy/types,
- fractures,
- bleeding simulation,
- infections,
- scars/disability/limb damage,
- pain resource,
- unconsciousness,
- combat retreat due to injury,
- fauna injury severity,
- Player injury-state redesign,
- injury migration into temporary conditions,
- new `HealthState` policy fields,
- parallel severity-specific pressures,
- generic treatment scripting engine,
- global injury/healing/treatment managers.

## Architecture constraints

- `physicalInjury` remains authoritative.
- Severity is pure derived state and is not persisted separately.
- Do not derive injury from generic HP deficit.
- Natural injury recovery restores HP through the existing health primitive and reduces injury by actual restored HP.
- Reuse effective-SPEA composition from the physical-attributes/conditions work.
- Reuse the single `npc-002` healing candidate and action path.
- Severity changes existing healing feasibility/score; it does not create parallel pressure systems.
- Treatment suitability is catalog-driven and not equivalent to generic health consumption.
- No injury-specific branches inside combat/work/SPEA consumers.
- No global injury/treatment manager or medical FSM.
- Recovery must not depend on rendering/camera presence.
- Add JSDoc to important shared/public severity/treatment APIs and useful `@domain` annotations.

## Tests

### Severity

- `physicalInjury = 0` → `none`,
- low relative injury → `minor`,
- medium relative injury → `serious`,
- high relative injury → `critical`,
- thresholds are deterministic and centralized,
- severity changes immediately when authoritative injury changes,
- severity does not require persistence.

### Injury accounting

- accepted physical damage increases `physicalInjury` by actual accepted HP loss,
- injury remains within existing accounting invariants,
- natural recovery calls the health-healing primitive,
- `physicalInjury` decreases by actual restored HP, not requested recovery,
- treatment follows the same actual-restored accounting when immediately healing,
- injury never becomes negative,
- injury recovery does not heal unrelated non-physical HP deficit.

### Effective SPEA

- no injury → no injury modifier,
- minor → small bounded impairment,
- serious → stronger impairment,
- critical → strongest bounded impairment,
- impairment is monotonic with severity,
- recovery improves effective SPEA,
- full injury recovery removes injury modifiers,
- repeated reads do not accumulate modifiers.

### Recovery boundaries

- minor injury naturally resolves,
- serious injury naturally recovers more slowly than minor,
- critical natural recovery cannot cross into serious by itself,
- suitable self-treatment can reduce critical injury into serious when configured to do so,
- off-screen/streaming lifecycle does not reset recovery/injury.

### Treatment

- generic health consumable without physical-injury treatment capability is unsuitable,
- catalog-declared physical treatment is recognized,
- treatment effectiveness is evaluated against current injury state,
- item kind is not hard-coded in injury policy,
- item is revalidated before consumption,
- unsuitable treatment does not create a repeated impossible heal action.

### NPC decision

- severity modifies the existing healing candidate rather than creating severity-specific pressure types,
- minor injury may lose to ordinary higher-priority behavior,
- serious injury creates stronger feasible healing priority,
- critical injury strongly suppresses ordinary work/idle when recovery/treatment is feasible,
- active combat is not automatically interrupted by injury severity,
- no suitable treatment still leaves a valid deterministic decision path.

### Persistence

- save/load preserves `physicalInjury`,
- severity is re-derived after load,
- injury SPEA modifiers are re-derived after load,
- settlement unload/reload preserves authoritative injury.

## Manual verification

Browser verification is performed by the User.

Verify:

- use debug controls to create minor/serious/critical injuries deterministically,
- debug information reports the expected derived severity,
- physical capability impairment is noticeable but not excessive,
- minor injury naturally recovers together with corresponding HP,
- serious injury recovers more slowly and produces stronger healing behavior,
- suitable treatment materially improves serious injury,
- an unrelated health consumable is not treated as universal wound medicine,
- critical injury cannot naturally disappear without crossing the explicit treatment boundary,
- suitable self-treatment can stabilize/reduce critical injury as designed,
- critical/serious NPC does not endlessly retry impossible treatment,
- active combat is not unexpectedly interrupted,
- save/load and settlement streaming preserve injury,
- existing `npc-002` healing and combat behavior have no obvious regressions.

## Completion criteria

- Existing `physicalInjury` remains the single authoritative NPC physical-injury amount.
- Injury severity is derived deterministically from authoritative injury state.
- Severity differentiates minor, serious and critical injury with explicit semantics.
- Physical injury contributes bounded temporary SPEA impairment.
- Existing capability consumers receive injury consequences without injury-specific branches.
- Natural recovery preserves HP/injury accounting through actual restored HP.
- Minor injury naturally resolves.
- Serious injury recovers more slowly and benefits materially from suitable treatment.
- Critical injury has an explicit recovery boundary and cannot silently self-resolve.
- Catalog-driven treatment capability determines physical-injury treatment suitability/effectiveness.
- Existing NPC self-healing becomes severity-aware through one existing healing candidate, not parallel pressure systems.
- Severity and modifiers are re-derived after persistence restore.
- Recovery remains compatible with off-screen simulation.
- No Medicine competence or assisted-treatment system is introduced.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

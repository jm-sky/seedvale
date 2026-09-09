# Plan: Temporary conditions and poisoning

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-019~~, ~~world-017~~
**Domain:** `npc`
**Subdomains:** `lifecycle`
**Tags:** `spea` `conditions` `poisoning` `health` `water`
**Roadmap:** `physical-attributes-health-and-medicine`

## Goal

Introduce a small shared model for temporary physical conditions and validate it with the first complete condition lifecycle: **poisoning caused by unsafe water**.

The feature should connect existing systems:

```text
world water quality
        ↓
unsafe water consumption
        ↓
poisoning exposure
        ↓
Poisoning condition
        ↓
effective SPEA penalties
        ↓
existing capability consumers
        ↓
time / rest / treatment
        ↓
recovery
```

Conditions must become part of the physical-state model rather than a collection of disease-specific checks distributed through combat, work, movement, needs and UI.

The first implementation covers Player and NPC condition ownership where practical, while the first guaranteed exposure path is direct Player consumption of unsafe world water.

## Design principles

### Conditions modify capabilities, not base attributes

Keep stable physical profile separate from temporary physical state:

```text
base SPEA
   +
persistent/profile modifiers
   +
temporary conditions
   ↓
effective SPEA
```

Poisoning must not modify persisted base SPEA. An active condition contributes temporary modifiers when effective attributes are resolved.

Exact modifier values and curves should be tuned against the actual effective-attribute implementation from `npc-019`. Effective values remain derived and must not become a second persisted source of truth.

### Conditions do not know their consumers

Do not implement disease-specific branches such as:

```text
if poisoned:
    meleeDamage *= ...
    workRate *= ...
    staminaRecovery *= ...
```

Instead:

```text
Poisoning
    ↓
effective SPEA
    ↓
existing Strength / Endurance / Agility / Perception consumers
```

Each existing capability mapping remains authoritative for interpreting the resulting effective attribute.

### Conditions are runtime physical state

Conditions are conceptually separate from base SPEA, HP, Stamina, Vigor, hunger/thirst, `physicalInjury`, personality/traits and learned skills.

Do not put conditions inside `HealthState` and do not redesign existing runtime primitives merely to accommodate poisoning.

## Shared condition representation

Introduce the smallest shared representation needed by poisoning and future temporary physical conditions.

Conceptually:

```text
Condition
├── kind
├── severity
├── recovery/lifecycle state
└── effects
```

The exact TypeScript shape should follow current ownership patterns discovered during implementation. Prefer an explicit bounded `ConditionKind` beginning with `poisoning` rather than arbitrary condition-name strings.

Do not introduce a broad disease taxonomy, generic effect scripting framework or global `ConditionManager`.

### Severity and repeated exposure

Poisoning should have meaningful bounded severity rather than only `poisoned: boolean`. Severity should control impairment magnitude and allow recovery to progress gradually.

Repeated successful exposure while already poisoned must have explicit deterministic semantics: it may worsen severity and/or extend recovery, with clamping to the valid range. It must not create duplicate independent Poisoning entries unless current state ownership gives a compelling reason.

Keep the representation cheap enough for low-frequency deterministic updates.

## Relationship to `physicalInjury`

Do not migrate or replace the existing NPC `physicalInjury` state.

```text
physicalInjury
→ existing physical-damage/healing flow

temporary conditions
→ poisoning and future illnesses/temporary impairment
```

`npc-002` already owns working injury/healing behavior. The later Medicine/injury phase can decide whether additional shared primitives are useful. Avoid an unrelated injury refactor here.

## Poisoning lifecycle

Poisoning should exercise a complete condition lifecycle:

```text
exposure
    ↓
condition starts / worsens
    ↓
temporary physical impairment
    ↓
condition persists over game time
    ↓
natural recovery / rest / treatment
    ↓
condition ends
```

## Unsafe-water exposure

The initial exposure source is direct consumption of unsafe world water.

Reuse the existing `WaterSource` contract. After `world-017`, river quality may depend on hydrology and settlement context, but the condition system must not know why a source is unsafe.

```text
world-017 / existing water sources
→ WaterSource final quality/risk
→ drinking action
→ shared poisoning exposure
```

Do not import hydrology, river or settlement logic into the condition domain.

Preserve the existing source semantics:

```text
safe        → no poisoning exposure
unsafe      → poisoning risk
undrinkable → existing prevention/interaction semantics
```

Lake water and contextually unsafe river water therefore use the same poisoning mechanism. Future unsafe sources should participate through the same `WaterSource` contract rather than new disease-specific source checks.

### Direct consumption only

V1 applies exposure when drinking directly from a world source whose quality/risk is still known.

`world-017` explicitly documents that filled containers currently lose source-water quality. Do not expand this plan into contaminated waterskins, water provenance, per-container water quality or Inventory contamination state.

This remains an explicit follow-up gap.

## Exposure roll and determinism

The current direct-drinking flow contains a `Math.random()` consumption-risk decision. Do not preserve or duplicate uncontrolled random disease rolls.

Migrate the poisoning exposure decision to an existing deterministic hashed/seeded event-roll pattern suitable for Seedvale simulation. Prefer a small existing mechanism over introducing a global RNG service.

The roll should be stable from explicit event context and should not depend on render timing or camera state. Avoid a scheme where repeatedly querying the same unchanged state rerolls until success; a new consumption event should be the meaningful roll boundary.

`WaterSource` risk remains authoritative. The condition system consumes the supplied risk rather than hard-coding probabilities for lake, river or well types.

## Poisoning effects

Poisoning should primarily affect effective SPEA.

Initial target attributes are:

```text
Strength  ↓
Endurance ↓
Agility   ↓
```

Only reduce Perception if implementation/tuning demonstrates a clear gameplay reason; do not reduce every SPEA attribute merely for symmetry.

Modifiers should scale with poisoning severity, remain bounded and be conservative enough that one unsafe-water event does not effectively disable the actor.

Effects should automatically reach completed consumers such as Strength-driven melee/work/carrying, Endurance-driven Stamina behavior, Agility-driven melee recovery and other existing effective-SPEA consumers. Do not add poisoning branches to those systems.

If a completed consumer does not respond to a changed effective attribute, fix the shared effective-attribute seam rather than special-casing poisoning.

## Recovery

Poisoning must recover through game time without requiring rendering or Player proximity.

Prefer low-frequency/event-driven or elapsed-game-time progression rather than render-frame disease simulation.

```text
severity
   ↓ over game time
recovered
```

Rest/sleep may improve recovery where this can reuse existing time/rest lifecycle cleanly. Do not create a poisoning-specific sleep system.

The implementation must define clear behavior for time skip/save-load so poisoning cannot freeze merely because an actor is off-screen or the game advances through an existing coarse time path.

## Treatment capability

Do not make the condition system depend directly on `ItemKind.herb`.

Extend the existing item/consumable catalog with the smallest reusable treatment capability needed to express that a consumable can affect a condition. Conceptually:

```text
item catalog
└── treatment capability
    ├── condition: poisoning
    └── effect: reduce severity / improve recovery
```

The exact catalog shape should remain narrow and data-driven. Do not introduce a generic effect scripting language.

The existing `herb` should receive the poisoning-treatment capability in V1. Future treatment items should be able to participate by catalog data rather than edits to condition logic.

Treatment should operate on the condition itself — for example reducing severity or recovery burden — rather than only restoring HP and pretending poisoning disappeared.

Preserve the existing ordinary health-consumable behavior of `herb` unless implementation recon shows that combining immediate healing and poisoning treatment would create an incoherent action. Do not silently repurpose every `consumable.need === 'health'` item as poisoning treatment; `bandage` must not become an antidote merely because it heals HP.

Prefer a small domain-neutral treatment operation reusable by Player actions and future NPC medical actions. Keep Player UI/toast policy outside the shared treatment primitive.

Do not introduce Medicine skill, doctors or assisted treatment yet.

## Player ownership

Player must be able to:

- acquire poisoning,
- retain it through normal gameplay and save/load,
- suffer effective-SPEA effects,
- recover naturally,
- use a catalog-declared treatment,
- see enough status information to understand that a temporary condition is active.

Use existing Player physical/runtime ownership patterns rather than a standalone condition manager.

## NPC ownership

Introduce compatible authoritative condition ownership for NPCs so the shared condition model is not Player-only.

NPC conditions must:

- use the same condition representation,
- affect the same effective-SPEA resolution,
- progress independently of camera/Player presence,
- participate in persistence through existing NPC authoritative-state ownership.

Do not create `NpcConditionSystem`.

### NPC exposure

Do not invent a new NPC water-consumption path merely to demonstrate poisoning.

If the current NPC drinking action retains a concrete `WaterSource` quality/risk at consumption time, connect it to the shared exposure mechanism. Otherwise implement NPC ownership/progression/effects and test poisoning through controlled state/test setup, leaving natural NPC unsafe-water exposure to a focused follow-up that extends the existing water-acquisition/action flow.

The shared condition architecture must not depend on Player-only `survivalActions`.

### NPC treatment

Do not expand `npc-002` into full disease-aware medical AI.

If the existing NPC healing action can consume the new catalog treatment capability through a small extension without changing decision semantics, that integration is acceptable. Otherwise autonomous poisoning treatment is deferred to the Medicine/assisted-treatment phase.

Natural recovery must work regardless.

## Persistence

Conditions with meaningful duration must survive save/load.

Persist only authoritative condition state required to reconstruct lifecycle continuity. Do not persist effective SPEA, derived capability values, presentation state or cached modifier totals.

After restore:

```text
base SPEA
+ restored active conditions
→ recomputed effective SPEA
```

Reuse current Player/NPC save ownership and migration conventions. Do not introduce a separate conditions database or persistence manager.

## UI, observation and debug

Expose Player poisoning through an existing suitable HUD/status surface rather than creating a dedicated disease screen.

For observed NPCs, `npc-023` remains authoritative for how much physical information normal gameplay may reveal. A poisoned NPC must not automatically expose the exact `Poisoning` diagnosis merely because the condition exists.

Keep the conceptual distinction:

```text
visible symptoms / physical assessment
→ observer may infer that something is wrong

condition knowledge / diagnosis
→ separate future medical/knowledge concern
```

Do not build diagnosis mechanics here.

In debug mode, exact condition information must be inspectable regardless of normal observation restrictions. Reuse the existing debug label/control mechanisms: with `Full label info` enabled, show condition kind, severity/recovery state and relevant effective-SPEA impact where practical. Debug tooling should also provide a practical deterministic way to apply/clear or force-test poisoning so browser verification does not require repeatedly drinking until a probabilistic exposure succeeds.

Do not turn production UI into a cheat/debug surface.

## Performance and simulation

Conditions are slow-changing state.

Prefer:

- compact authoritative state,
- recalculation of effective attributes only when modifiers/state change where current SPEA architecture supports it,
- low-frequency or elapsed-time recovery,
- no render-frame allocations,
- no global scan of world entities,
- no camera-distance dependency,
- no worker solely for condition updates.

NPC condition continuity must remain compatible with hybrid/off-screen simulation.

## Extension direction

Keep the first API small but leave a natural extension path for future temporary conditions such as illnesses, environmental impairment and injury-derived capability penalties.

Future possibilities are not justification for implementing a generic rules engine now.

## Non-goals

Do not implement:

- broad disease taxonomy,
- contagious disease or epidemics,
- immunity or a disease-resistance stat,
- Medicine skill,
- doctors/herbalists treating others,
- assisted medical treatment,
- injury redesign or migration of `physicalInjury`,
- fauna conditions,
- corpse disease/exposure or corpse decay,
- food poisoning or spoiled food,
- weather/cold illness,
- complex symptom simulation,
- diagnosis mechanics,
- persistent NPC knowledge of illnesses,
- water purification/boiling/filtering,
- container contamination or water provenance in Inventory,
- pollution propagation,
- new hydrology or river-quality rules,
- poisoning-specific branches in combat/work/observation consumers,
- a global `ConditionManager`,
- a generic effect scripting engine.

## Architecture constraints

- Reuse effective SPEA resolution from `npc-019`.
- Reuse `WaterSource` and contextual quality from `world-017`.
- Conditions modify effective state, never base SPEA.
- Derived effective attributes remain non-persisted.
- Keep `HealthState` free from condition-specific policy.
- Preserve existing `physicalInjury` ownership.
- Player and NPC conditions use compatible shared primitives.
- Treatment capability is catalog-driven; condition logic must not hard-code `herb`.
- `health` consumable does not imply poisoning treatment.
- No Player-only condition representation.
- No disease-specific checks scattered through capability consumers.
- No global condition manager.
- Condition lifecycle must not depend on rendering/camera presence.
- Add JSDoc to important shared/public condition APIs and useful `@domain` annotations.

## Tests

Add focused tests covering at least:

### Condition state

- severity remains within its valid range,
- repeated successful exposure follows explicit worsening/refresh semantics,
- progression reduces poisoning consistently,
- complete recovery removes/deactivates the condition consistently,
- condition modifiers never mutate base SPEA.

### Effective attributes

- no poisoning → unchanged effective SPEA,
- poisoning → expected temporary modifiers,
- greater severity does not produce weaker impairment than lower severity,
- recovery updates effective values,
- complete recovery restores pre-condition effective values,
- repeated effective-attribute reads do not accumulate modifiers.

### Water exposure

- safe water → no poisoning exposure,
- unsafe water + failed deterministic risk roll → no poisoning,
- unsafe water + successful deterministic risk roll → poisoning,
- contextually unsafe river and unsafe lake use the same exposure mechanism,
- undrinkable water retains existing interaction semantics,
- separate consumption events provide deterministic event boundaries,
- no hydrology/settlement-specific poisoning branches exist.

### Treatment

- catalog item without poisoning treatment cannot treat poisoning,
- `herb` treatment changes poisoning condition state,
- `bandage` does not become poisoning treatment merely because it is a health consumable,
- treatment operation does not contain Player UI policy.

### Lifecycle and persistence

- poisoning progresses with game time,
- progression is independent of rendering/Player proximity for NPCs,
- save/load restores authoritative poisoning state,
- effective SPEA is recomputed after restore,
- time-skip/coarse-time path preserves meaningful recovery continuity where applicable.

### Player/NPC

- Player and NPC use the same condition semantics,
- absence of a natural NPC unsafe-water exposure seam does not cause creation of a parallel drinking system.

## Manual verification

Browser verification is performed by the User.

Verify:

- drinking safe water does not cause poisoning,
- unsafe lake water can cause poisoning,
- after `world-017`, contextually unsafe river water uses the same mechanism,
- debug tooling can reliably apply/inspect/clear poisoning,
- poisoning is visible in appropriate Player/debug status,
- poisoning produces noticeable but not excessive physical impairment,
- impairment changes as severity recovers,
- `herb` treatment improves the condition while unrelated health consumables do not,
- save/load preserves active poisoning,
- normal HP/Stamina/healing behavior has no obvious regressions,
- existing safe/unsafe water warnings remain coherent.

## Completion criteria

- A shared temporary-condition representation exists.
- Player and NPC can authoritatively own the same condition type.
- Poisoning is the first complete condition lifecycle.
- Direct unsafe-water consumption can cause poisoning through a deterministic event roll.
- `world-017` remains authoritative for contextual river-water quality.
- Poisoning affects existing gameplay through effective SPEA rather than consumer-specific checks.
- Base SPEA remains unchanged.
- Poisoning progresses and recovers with game time.
- Treatment is catalog-driven and operates on the condition itself.
- `herb` can treat poisoning without making every health consumable an antidote.
- Active conditions survive save/load.
- NPC condition continuity does not depend on rendering or Player proximity.
- Existing `physicalInjury` remains intact.
- No broad disease, Medicine, fauna-health or water-container system is introduced.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Physical Attributes, Health & Medicine Roadmap

## Goal

Build a shared physical-capability model for the player, NPCs and fauna, then use it as the foundation for health, injuries, illnesses and medical treatment.

The roadmap should strengthen existing simulation systems rather than introduce a parallel RPG-stat layer. Attributes describe relatively stable individual capabilities; existing runtime primitives such as HP, stamina, vigor, injuries and future conditions describe the current physical state.

The first explicit attribute set is **SPEA**:

- **Strength** — force-producing capacity,
- **Perception** — ability to notice, recognise and assess relevant world information,
- **Endurance** — capacity to withstand and recover from sustained physical strain,
- **Agility** — coordination, mobility and quick/precise physical action.

This roadmap complements `docs/vision/npc-physical-state.md`, `docs/world/species-physical-reference.md` and `docs/roadmap/textiles-and-herbal-medicine.md`. The species physical reference is authoritative for species baselines and SPEA reference semantics; the textile/herbal roadmap provides medical goods and professions; this roadmap defines the physical-state and treatment systems that consume them.

## Design Principles

- Reuse the same attribute concepts for player, NPCs and fauna where practical.
- Prefer composition and shared pure primitives over a common `Character` base class or God Object.
- Attributes must have real simulation consumers; do not add a dormant generic stat framework.
- Keep stable/base characteristics separate from changing runtime state.
- Keep species biology separate from individual variation.
- Preserve deterministic generation and explicit state ownership.
- Derived/effective values should not become duplicated persisted sources of truth.
- Existing systems decide how strongly an attribute matters; attributes are not universal action multipliers.
- Conditions should affect shared capabilities instead of scattering disease-specific checks through combat, movement, work and UI.
- Keep the model cheap enough for many off-screen NPCs and animals.
- Use `docs/world/species-physical-reference.md` as the authoritative source for species physical baselines and SPEA reference semantics; implementation plans must not invent alternative species values.

## Attribute Semantics

### Relative within species

Attributes use a normalized `0..1` scale describing an individual relative to a healthy adult reference population of the same species.

```text
0.0       exceptionally low capability
0.25      clearly below species reference
0.5       typical healthy adult of the species
0.75      clearly above species reference
0.9       exceptional individual
1.0       practical upper end of the species scale
```

`0.5` is therefore the central design reference, not a 50% multiplier.

For example:

```text
Human Strength 0.5 = typical healthy adult human
Bear  Strength 0.5 = typical healthy adult bear
```

Raw attribute values must **not** be used to compare absolute capabilities across species.

### Species capability baselines

Cross-species comparison uses explicit biological/reference data appropriate to the capability being resolved rather than one universal species multiplier.

Conceptually:

```text
species reference capabilities
          +
individual attribute
          +
age / development / persistent traits
          +
temporary conditions
          ↓
effective world capability
```

`docs/world/species-physical-reference.md` is authoritative for this boundary. It deliberately does **not** define fabricated universal values such as `absoluteStrength`, `bearLiftKg` or a generic `speciesStrengthMultiplier` where no biologically meaningful shared metric exists.

A consumer should resolve the smallest capability it actually needs from relevant species facts and individual state. For example:

- carrying can use body mass, load-bearing anatomy and Strength where a defensible load model exists;
- melee can use weapon or attack anatomy plus an individual Strength contribution;
- pushing/collision can use body mass, velocity, footing and force production;
- detection can use an explicit sensory channel plus Perception and environment;
- locomotion keeps species movement modes and speed envelopes separate from Agility.

Different capabilities may use different curves. Strength may influence carrying strongly but melee damage more conservatively. Agility should not simply become a universal movement-speed multiplier.

### Base and effective attributes

The model should distinguish an individual's stable/base attributes from temporary effective values.

```text
base SPEA
   +
persistent/profile modifiers
   +
injuries
   +
illnesses
   +
other temporary conditions
   ↓
effective SPEA
```

Effective attributes should be derived rather than independently persisted.

Temporary modifiers should have clear semantics. Prefer attribute-scale changes where appropriate, for example:

```text
base Strength       0.80
poisoning modifier -0.15
effective Strength  0.65
```

This lets a condition affect all existing consumers of Strength without knowing about melee, construction or carrying individually.

## Attributes vs Runtime Physical State

Attributes are not replacements for HP, stamina, vigor or needs.

```text
Relatively stable profile
├── Strength
├── Perception
├── Endurance
└── Agility

Runtime physical state
├── HP
├── Stamina
├── Vigor where applicable
├── injuries
├── illnesses
└── temporary conditions
```

Shared concepts do not require every species to own every runtime resource. Player and NPCs may use Vigor while fauna can retain its existing animal-life/metabolism model.

## Derived Capabilities

Attributes should feed small, explicit capability mappings rather than one monolithic `StatsSystem`.

### Strength

Initial and future consumers:

- melee force/damage contribution,
- heavy physical work effectiveness,
- chopping/construction where physical force is relevant,
- carrying/lifting capacity,
- pushing/pulling and other physical interactions.

A weapon or action retains its own base properties. Strength modifies the actor's contribution; it does not replace item/action data.

### Perception

Initial and future consumers:

- player observation of NPCs and animals,
- NPC/animal labels and status-bar information thresholds,
- threat detection,
- noticing wounded or sick individuals,
- hunting and animal detection,
- ranged targeting where perception is relevant,
- tracks/resources/discoveries where appropriate.

The preferred direction is a reusable observation concept rather than UI-only distance bonuses:

```text
observer + effective Perception + distance + visibility/context
                              ↓
                       observation level
                              ↓
          identity / species / HP / stamina / condition info
```

The same concept can later support NPC awareness and decisions, with UI being only one consumer.

### Endurance

Initial and future consumers:

- maximum HP,
- maximum Stamina,
- Stamina recovery,
- efficiency under sustained physical effort,
- Vigor drain/recovery where Vigor exists,
- resistance/recovery characteristics for injuries and illnesses.

Endurance should help distinguish short-term strength from sustained capacity. A strong but low-Endurance individual may perform heavy work effectively but tire quickly.

Vigor remains distinct from Endurance: Endurance is a capability; Vigor is changing long-term energy/recovery state.

### Agility

Initial and future consumers:

- selected movement characteristics,
- acceleration/reaction,
- Sneak movement/effectiveness,
- melee/ranged timing where justified,
- evasive movement,
- quick or precision-oriented physical work.

Avoid large generic walking-speed differences. Species locomotion remains an important baseline independent of individual Agility.

## Shared Ownership Direction

Do not create separate incompatible attribute models such as `PlayerAttributes`, `NpcAttributes` and `AnimalAttributes`.

Target conceptual ownership:

```text
shared AttributesState / attribute resolution
              │
      ┌───────┼────────┐
      ↓       ↓        ↓
   Player    NPC     Animal
```

The same value type can be produced differently:

```text
Player
→ player physical profile / progression rules

NPC
→ deterministic physical profile
→ sex + age + individual variation + later build/traits

Animal
→ species baseline + lifecycle + individual variation
```

Species-specific absolute capability data remains outside the relative SPEA values.

## Relationship to Existing NPC Physical Profile

The current NPC physical-profile implementation already deterministically derives max HP, max Stamina and max Vigor from sex, age and individual variation.

The target evolution is:

```text
CURRENT
sex + age + deterministic variation
              ↓
      HP / Stamina / Vigor maxima

TARGET
species + sex + age + deterministic variation + later build/traits
              ↓
             SPEA
              ↓
     derived physical capabilities
              ↓
HP / Stamina / Vigor / work / combat / observation / movement
```

Do not discard the deterministic physical-profile mechanism. Extend/migrate it so attributes become part of the coherent physical profile rather than a parallel random stat roll.

## Phase 1 — Shared Attributes Foundation + Strength Melee Slice

Introduce the smallest shared SPEA representation and resolution mechanism needed by one real consumer.

Scope:

- shared `Strength`, `Perception`, `Endurance`, `Agility` representation,
- `0..1`, species-relative semantics with `0.5` as healthy-adult species reference,
- base/effective distinction,
- deterministic modifier resolution,
- deterministic base generation semantics aligned with `docs/world/species-physical-reference.md`,
- NPC physical-profile integration,
- one narrow **human/player/NPC melee Strength** vertical slice,
- persistence only for authoritative/base data where necessary,
- tests for scale semantics, deterministic generation, modifier resolution and neutral melee behaviour at `Strength = 0.5`.

Use `docs/world/species-physical-reference.md` as the authoritative source for reference semantics and species/profile rules. Do not invent species values in the implementation plan.

Non-goals for this phase:

- broad fauna SPEA integration,
- heavy-work integration,
- Endurance-derived HP/Stamina/Vigor,
- Agility movement integration,
- Perception/observation,
- conditions or disease.

The first slice should preserve current melee tuning at the neutral human reference (`Strength = 0.5`) and validate the architecture without forcing unrelated physical systems to migrate at the same time.

## Phase 2 — Remaining Strength + Endurance Integration

Expand Strength to physical work and connect Endurance to the existing physical-resource model.

Initial Strength targets:

```text
Strength
└── heavy physical work effectiveness
```

Possible later Strength additions in the same model:

- carry/lift capacity where a real capability model exists,
- pushing/pulling,
- tool/action requirements.

Initial Endurance targets:

```text
Endurance
├── max HP
├── max Stamina
├── Stamina recovery
└── sustained-effort / Vigor efficiency
```

This phase should reconcile the current NPC physical-profile maxima with the new attribute model rather than create a second set of maxima.

Strength and Endurance consumers should define explicit capability curves around the neutral `0.5` reference rather than multiplying outcomes directly by the raw attribute.

The exact Player/NPC/fauna consumers can differ while sharing the same attribute semantics.

## Phase 3 — Agility Integration

Connect Agility to existing movement/action seams without turning it into a universal speed multiplier.

Candidate targets:

- selected movement/acceleration characteristics,
- Sneak,
- reaction/action timing where justified,
- future evasive mechanics.

Keep species locomotion and action-specific base timing authoritative; Agility modifies individual capability within those systems.

## Phase 4 — Perception & Observation

Introduce Perception through a reusable observation/information mechanism.

First visible use:

```text
player Perception
      +
distance / visibility / target context
      ↓
observation level
      ↓
NPC / animal label information
```

Possible information progression:

```text
low observation
→ presence / broad identity

better observation
→ name or species

higher observation
→ approximate health

high observation
→ stamina / vigor / wounds / illness indicators where meaningful
```

The mechanism should be designed so NPCs and animals can later use compatible observation logic for threat awareness, hunting, social/medical assessment and world interaction.

## Phase 5 — Conditions & First Disease

Add a shared condition model capable of representing temporary physical impairment without rewriting base attributes.

First disease/condition: **poisoning**.

Initial exposure source:

```text
unsafe water source
→ consumption
→ poisoning risk
→ Poisoning condition
```

The existing water-quality/safety seam should be reused rather than creating a separate disease-specific water system.

Initial poisoning effects should primarily flow through effective attributes, for example reduced Endurance, Strength and/or Agility. This should automatically influence already-integrated stamina, work, combat and movement systems.

Initial recovery/treatment:

- time,
- rest,
- existing medicinal `herb` consumable where appropriate.

A first implementation does not need a broad disease taxonomy. One complete disease lifecycle is preferable to several disconnected disease flags.

Rotting-corpse exposure should be deferred until corpse ageing/decay provides a real world-state seam rather than introducing decay solely for poisoning.

## Phase 6 — Injuries, Medicine & Assisted Treatment

Extend the existing injury/healing flow rather than replacing it.

Target severity semantics:

```text
minor physical injury
→ natural recovery / rest

serious injury
→ bandage or dressing

critical injury
→ medical competence / assistance
```

The existing physical-injury state remains the starting point. Severity should preferably be derived from authoritative injury state rather than stored as an independent value that can drift.

**Medicine** is a learned competence/skill, not an SPEA attribute.

```text
Endurance
→ patient's physical resilience/recovery

Medicine
→ healer's ability to diagnose/treat
```

NPCs with sufficient Medicine competence should eventually be able to treat the player and other NPCs through the normal NPC decision/action architecture.

Doctor/Herbalist are social/professional roles that use the same medical mechanisms; they should not own separate healing systems.

The textile/herbal production roadmap can supply bandages, dressings and herbal products to this system, creating real settlement demand and shortages.

## Phase 7 — Fauna Physical Individuality

Extend the same attribute semantics to animals without flattening species biology into SPEA.

```text
species definition
      +
individual SPEA variation
      +
age/lifecycle
      +
conditions
      ↓
effective animal capabilities
```

Potential consumers:

- HP/Stamina variation,
- predator/prey combat capability,
- escape/endurance differences,
- perception/detection,
- injury/disease consequences,
- future domestication/work-animal capability.

A weak bear can still be absolutely stronger than a strong human because cross-species mechanics resolve through relevant species capabilities rather than comparing raw Strength values.

## Attribute Reference Data

`docs/world/species-physical-reference.md` is the authoritative source for:

- SPEA `0..1` semantics,
- the meaning of the neutral `0.5` healthy-adult reference,
- current species/reference profiles,
- biological absolute-capability anchors,
- separation of body mass, locomotion, sensory channels and attack anatomy from SPEA,
- individual SPEA distribution guidance,
- rules for future capability consumers.

Implementation plans should reference that document rather than restating or inventing species values. If later research improves an empirical anchor, update the reference document first and migrate affected consumers through a focused plan.

Consumer-specific curves still belong to the systems that consume the capability. They should preserve the neutral `0.5` reference unless a plan explicitly changes existing gameplay balance, and they should avoid unexplained per-system species multipliers.

## Performance & Simulation

Attributes are mostly slow-changing data.

Prefer:

- deterministic base generation,
- compact base state,
- effective-value recalculation only when modifiers change,
- pure capability mapping functions,
- event-driven condition changes,
- lower-frequency recovery/disease ticks where possible,
- no render-frame physical-profile regeneration.

Remote/off-screen entities should retain the same authoritative attributes and meaningful condition continuity while using lower-fidelity simulation where appropriate.

## Documentation Follow-up

`docs/vision/npc-physical-state.md` and `docs/world/species-physical-reference.md` should remain aligned with implementation as SPEA lands.

In particular:

- keep SPEA relative-within-species semantics stable,
- keep species capability baselines/reference data outside raw SPEA,
- distinguish base/effective attributes,
- preserve Perception as individual sensory effectiveness rather than a single species detection radius,
- preserve Endurance as capability distinct from runtime Vigor/Stamina,
- keep Medicine as competence/skill rather than physical attribute,
- update authoritative reference data before introducing new species-specific capability assumptions in code.

## Planning Direction

Implementation should be split into focused plans rather than one large attributes/health rewrite.

Recommended sequence:

```text
1. shared SPEA foundation + human/player/NPC Strength melee slice
2. remaining Strength + Endurance integration
3. Agility integration
4. Perception + observation
5. conditions + poisoning + herb recovery
6. injury severity + Medicine + assisted treatment
7. fauna attribute integration / deeper ecosystem health
```

The first implementation plan should use domain `npc` because its first authoritative profile integration and vertical slice are centred on the existing NPC physical-profile and human combat systems, while shared primitives remain reusable by Player and fauna.

Exact plan IDs should be chosen after checking the current plan index and `docs/plans/PLANNING.md`. Each plan should verify the current code seams again before implementation because these systems are evolving quickly.

## Plans

- `npc-019-shared-spea-foundation-and-strength-driven-melee.md`
- `npc-020-strength-driven-physical-work-and-human-carrying.md`
- `npc-021-endurance-driven-stamina-capacity-and-recovery.md`

# Physical Attributes, Health & Medicine Roadmap

## Goal

Build a shared physical-capability model for the player, NPCs and fauna, then use it as the foundation for health, injuries, illnesses and medical treatment.

The roadmap should strengthen existing simulation systems rather than introduce a parallel RPG-stat layer. Attributes describe relatively stable individual capabilities; existing runtime primitives such as HP, stamina, vigor, injuries and future conditions describe the current physical state.

The first explicit attribute set is **SPEA**:

- **Strength** — force-producing capacity,
- **Perception** — ability to notice, recognise and assess relevant world information,
- **Endurance** — capacity to withstand and recover from sustained physical strain,
- **Agility** — coordination, mobility and quick/precise physical action.

This roadmap complements `docs/vision/npc-physical-state.md` and `docs/roadmap/textiles-and-herbal-medicine.md`. The latter provides medical goods and professions; this roadmap defines the physical-state and treatment systems that consume them.

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

Cross-species comparison uses explicit physical capability baselines or mappings.

Conceptually:

```text
species capability baseline
          +
individual attribute
          +
age / development / persistent traits
          +
temporary conditions
          ↓
effective world capability
```

For example, if lifting/carrying is used as a Strength reference:

```text
Human Strength 0.5 → e.g. ~40 kg reference capacity
Bear  Strength 0.5 → e.g. ~100 kg reference capacity
```

The exact numbers are balance/design data and should be calibrated during implementation. The important rule is that the mapping is explicit and shared, so future systems can compare humans, animals and other species coherently.

Different capabilities may use different curves. Strength may influence lifting strongly but melee damage more conservatively. Agility should not simply become a universal movement-speed multiplier.

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

## Phase 1 — Shared Attributes Foundation

Introduce the smallest shared SPEA representation and resolution mechanism needed by real consumers.

Scope:

- shared `Strength`, `Perception`, `Endurance`, `Agility` representation,
- `0..1`, species-relative semantics with `0.5` as healthy-adult species reference,
- base/effective distinction,
- deterministic modifier resolution,
- explicit species capability-baseline boundary,
- NPC physical-profile integration,
- persistence only for authoritative/base data where necessary,
- tests for scale semantics, deterministic generation and modifier resolution.

Use one real vertical slice to validate the architecture before wiring every attribute everywhere. **Strength** is the preferred first slice because melee and heavy physical work already provide concrete consumers.

## Phase 2 — Strength Integration

Make Strength materially affect existing systems.

Initial targets:

```text
Strength
├── melee force/damage contribution
└── heavy physical work effectiveness
```

Possible later additions in the same model:

- carry/lift capacity,
- pushing/pulling,
- tool/action requirements.

The implementation should define explicit capability curves around the neutral `0.5` reference rather than multiplying outcomes directly by the raw attribute.

## Phase 3 — Endurance Integration

Connect Endurance to the existing physical-resource model.

Initial targets:

```text
Endurance
├── max HP
├── max Stamina
├── Stamina recovery
└── sustained-effort / Vigor efficiency
```

This phase should reconcile the current NPC physical-profile maxima with the new attribute model rather than create a second set of maxima.

The exact Player/NPC/fauna consumers can differ while sharing the same attribute semantics.

## Phase 4 — Agility Integration

Connect Agility to existing movement/action seams without turning it into a universal speed multiplier.

Candidate targets:

- selected movement/acceleration characteristics,
- Sneak,
- reaction/action timing where justified,
- future evasive mechanics.

Keep species locomotion and action-specific base timing authoritative; Agility modifies individual capability within those systems.

## Phase 5 — Perception & Observation

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

## Phase 6 — Conditions & First Disease

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

## Phase 7 — Injuries, Medicine & Assisted Treatment

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

## Phase 8 — Fauna Physical Individuality

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

A weak bear can still be absolutely stronger than a strong human because cross-species mechanics resolve through species capability baselines rather than comparing raw Strength values.

## Attribute Reference Data

Before broad integration, maintain explicit design anchors for each attribute and important species. These anchors are part of world-mechanics coherence, not merely UI balance.

Example direction:

| Attribute | Human `0.5` reference | Cross-species comparison concept |
|---|---|---|
| Strength | typical healthy adult human | lifting/carrying/force capability |
| Perception | typical human observation ability | detection/recognition capability plus species-specific senses |
| Endurance | typical sustained-effort/recovery capacity | sustained work, stamina/recovery capability |
| Agility | typical human coordination/mobility | action/mobility capability plus species locomotion baseline |

Concrete reference values and curves should be documented alongside implementation as they become authoritative. Avoid unexplained per-system multipliers that make cross-species comparison impossible.

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

`docs/vision/npc-physical-state.md` should be updated to reflect the decisions established here:

- expand physical capabilities from Strength/Agility to SPEA,
- document relative-within-species attribute semantics,
- add species capability baselines for absolute comparison,
- distinguish base/effective attributes,
- describe Perception/observation and Endurance explicitly,
- align the current-implementation section with the implemented deterministic NPC age/physical-profile work,
- clarify shared Player/NPC/fauna direction,
- align illnesses/unsafe-water text with the current water-quality implementation,
- keep Medicine as competence/skill rather than physical attribute.

## Planning Direction

Implementation should be split into focused plans rather than one large attributes/health rewrite.

Recommended sequence:

```text
1. shared SPEA foundation + one Strength vertical slice
2. remaining Strength / Endurance integration
3. Agility integration
4. Perception + observation
5. conditions + poisoning + herb recovery
6. injury severity + Medicine + assisted treatment
7. fauna attribute integration / deeper ecosystem health
```

Exact plan boundaries and IDs should be chosen after checking the current plan index and `docs/plans/PLANNING.md`. Each plan should verify the current code seams again before implementation because these systems are evolving quickly.

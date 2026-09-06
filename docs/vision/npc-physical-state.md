# NPC Physical State

**Status:** evolving

## Purpose

Define the target physical-state model for NPCs: demographics, physical attributes and capabilities, health, stamina, vigor, injuries, illnesses, recovery, treatment and hereditary appearance/physical traits.

This document describes the target domain model, not final numeric balance or implementation sequencing. Implementation direction and phases are tracked in `docs/roadmap/physical-attributes-health-and-medicine.md`.

## Domain boundary

NPC physical state should be a reusable simulation concept rather than a collection of combat-only values.

The model should support:

- everyday work and routines,
- rest and sleep,
- combat and damage,
- injuries and recovery,
- illnesses and treatment,
- age-related differences,
- sex-related biological differences,
- individual physical traits and capabilities,
- appearance and character generation,
- family inheritance,
- NPC decision making.

Player, NPCs and fauna should reuse shared physical-state concepts where practical. Shared concepts do not require identical physiology: for example, fauna may use the same attributes, Health and Stamina while retaining its own animal-life/metabolism model instead of NPC/player Vigor.

## Core model

Separate relatively stable physical characteristics from changing runtime state.

```text
NPC
├── Demographics
│   ├── sex
│   └── age / life stage
│
├── Physical profile
│   ├── height
│   ├── build
│   ├── SPEA attributes
│   │   ├── Strength
│   │   ├── Perception
│   │   ├── Endurance
│   │   └── Agility
│   ├── physical traits
│   └── inherited physical tendencies
│
├── Appearance phenotype
│   ├── hair colour
│   ├── hairstyle
│   ├── face
│   └── other visual features
│
└── Runtime physical state
    ├── HP
    ├── stamina
    ├── vigor
    ├── injuries
    ├── illnesses
    └── temporary conditions
```

The stable profile determines capabilities and limits; runtime state describes what is happening to the NPC now.

SPEA is intentionally a small capability set justified by concrete simulation needs. It is not intended to grow into a generic RPG stat list merely for completeness.

## SPEA attributes

Attributes describe relatively stable individual differences in capability. They are part of the physical profile, not runtime conditions and not replacements for skills.

```text
Attributes = general inherent/physical capability
Skills     = learned domain competence
Conditions = temporary physical state/effects
```

For example, Medicine is a learned competence, not an attribute. A patient's Endurance can affect recovery while the healer's Medicine competence affects treatment quality.

### Attribute scale

SPEA uses a normalized `0..1` scale relative to a healthy adult reference population of the same species.

```text
0.0       exceptionally low capability
0.25      clearly below species reference
0.5       typical healthy adult of the species
0.75      clearly above species reference
0.9       exceptional individual
1.0       practical upper end of the species scale
```

`0.5` is the central reference, not a 50% gameplay multiplier.

Raw attribute values are meaningful for individual variation within a species, but are not absolute cross-species measurements:

```text
Human Strength 0.5 = typical healthy adult human
Bear  Strength 0.5 = typical healthy adult bear
```

The bear can still be absolutely much stronger.

### Species capability baselines

Cross-species mechanics should resolve attributes through explicit species capability baselines/mappings rather than comparing raw SPEA values.

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

For example, lifting/carrying can provide one Strength reference: a typical human and typical bear can both have Strength `0.5`, while their absolute reference capacities differ substantially.

The exact reference numbers and curves are balance/design data. They should nevertheless be explicit and coherent so that later systems can compare humans, animals and other species without accumulating unexplained per-system multipliers.

Different systems may map the same attribute differently. Strength may strongly influence lifting but only moderately influence melee damage. Agility should not become a universal movement-speed multiplier.

### Base and effective attributes

Stable/base attributes must remain separate from temporary effects.

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

Effective values should be derived rather than independently persisted.

Conditions may modify attributes where the semantics are appropriate. For example:

```text
base Strength       0.80
poisoning modifier -0.15
effective Strength  0.65
```

Systems consuming effective Strength then react naturally without Poisoning needing special knowledge of melee, work or carrying.

### Strength

Strength represents general force-producing capacity within the individual's species/body context.

It may influence:

- heavy physical work,
- carrying and lifting capacity,
- pushing or pulling,
- melee combat effectiveness,
- physical interactions with the environment,
- other activities where force is a meaningful constraint.

Strength should not be treated as a universal multiplier for every physical action. Relevant systems explicitly decide whether and how strongly Strength matters.

### Perception

Perception represents general ability to notice, recognise and assess relevant information from the environment.

It may influence:

- threat and animal detection,
- recognising or assessing NPCs and animals,
- hunting and tracking,
- noticing wounds, illness or unusual states,
- ranged targeting where observation is relevant,
- resource/discovery awareness where justified.

Player-facing NPC/animal labels and status bars are an initial useful consumer. The preferred model is reusable observation rather than simply increasing UI draw distance:

```text
observer + effective Perception + distance + visibility/context
                              ↓
                       observation level
                              ↓
       identity / species / HP / stamina / condition information
```

The same observation concept should be reusable by NPC/animal awareness and decision systems later. Species-specific senses such as exceptional smell or hearing remain separate biological inputs where needed; Perception should not flatten all sensory biology into one number.

### Endurance

Endurance represents ability to withstand and recover from sustained physical strain.

It may influence:

- maximum HP,
- maximum Stamina,
- Stamina recovery,
- sustained-work tolerance,
- Vigor drain/recovery where Vigor exists,
- recovery/resilience characteristics for injuries and illnesses.

Endurance remains distinct from Stamina and Vigor:

```text
Endurance = relatively stable capability
Stamina   = short-term changing effort capacity
Vigor     = longer-term changing energy/recovery state
```

A strong but low-Endurance individual can perform demanding physical actions effectively while tiring more quickly than a weaker but high-Endurance individual.

### Agility

Agility represents coordination, mobility and ability to perform quick or precise physical actions.

It may influence:

- selected movement and acceleration characteristics,
- turning and evasive movement,
- reaction-demanding actions,
- Sneak movement/effectiveness,
- precision-oriented physical work,
- selected combat/action timing.

Agility should not simply become a generic walking-speed multiplier. Species locomotion and action-specific base properties remain authoritative; Agility represents individual variation within those systems.

## Derived physical capabilities

SPEA should feed small, explicit capability mappings rather than one monolithic stats system.

Conceptually:

```text
physical profile
      ↓
     SPEA
      ↓
capability mappings
      ↓
HP / Stamina / Vigor characteristics
work / combat / observation / movement
```

An action, weapon or species retains its own base properties. Attributes describe the individual's contribution to those mechanics.

## HP

HP represents current health/integrity and remains the primary immediate consequence of damage.

The existing shared `HealthState` remains the foundation for health and death.

```text
max HP
current HP
alive / dead
```

HP is not a complete representation of physical condition. An NPC can recover HP while an injury or illness remains active.

Endurance is a natural input to maximum HP, but HP remains runtime state rather than an attribute.

## Stamina

Stamina represents short-term capacity for physical effort.

It should influence activities such as:

- walking/running,
- demanding work,
- combat actions,
- other strenuous activities.

The existing shared `StaminaState` remains the basic runtime primitive.

Maximum Stamina and recovery characteristics can derive partly from Endurance and the physical profile. Injuries, illnesses and other conditions may temporarily reduce effective capability without rewriting the base profile.

## Vigor

Vigor represents longer-term physical energy/recovery state and daily ability to sustain demanding activity.

```text
Stamina = short-term effort capacity
Vigor   = longer-term energy / recovery state
HP      = health / physical integrity
```

Endurance may affect Vigor efficiency and recovery, but Vigor is not itself an attribute.

Vigor does not need to be universal across all species. Player/NPC systems may use it while fauna retains its existing animal-life/metabolism concepts where that better fits the simulation.

## Physical differences and generation

NPCs should not all have identical physical capabilities.

The target direction is:

```text
species + age + sex + build + height + physical traits
                           ↓
                    physical profile
                           ↓
                          SPEA
                           ↓
                 derived capabilities
                           ↓
HP / stamina / vigor / work / combat / observation / movement
```

SPEA should emerge from the coherent physical profile rather than four unrelated uniform random rolls. Age, sex, build, height, inherited tendencies and individual deterministic variation may contribute where biologically or simulation-wise appropriate.

Most healthy adults should cluster around the species reference (`0.5`), with extreme values progressively rarer.

### Age

Age has meaningful physical consequences without being a single linear multiplier.

The current NPC model already has explicit age and life stages. Development and ageing should affect attributes/capabilities appropriately rather than treating children as visually smaller adults.

Children can differ substantially in Strength, Endurance and other capabilities from the healthy-adult reference. Older NPCs can decline in selected capabilities and recovery while retaining meaningful individual variation.

### Sex

Sex is part of the physical profile because biological differences can affect physical capability distributions.

The model should avoid reducing every individual to one fixed sex modifier. Individual build, attributes, age and traits contribute to the final profile.

Sex-related differences should influence distributions/baselines where justified rather than completely determining an NPC's capabilities.

### Height

Height is both an appearance characteristic and a possible physical input.

Target categories:

- short,
- average,
- tall.

Implementation may use a continuous underlying value with categories for generation/presentation.

### Build

Target body-build categories:

- thin,
- normal,
- muscular,
- heavy.

Build should influence physical capability where appropriate, but should not become a simplistic direct mapping such as `muscular = always stronger` or `heavy = always slower`.

Build is also a key input to character model selection and visual silhouette.

## Injuries

Injuries are persistent or semi-persistent physical conditions resulting from combat, accidents or other world events.

They are **not equivalent to HP loss**.

```text
combat / accident
      ↓
    damage
      ↓
   HP loss
      ↓
physical injury
      ↓
physical impairment
      ↓
recovery / treatment
```

The current NPC implementation already tracks authoritative `physicalInjury` separately from `HealthState`; future injury depth should extend that seam rather than derive injury by repeatedly comparing current/max HP.

Injuries may affect effective attributes/capabilities, stamina, vigor/recovery, movement, work, combat, action availability and NPC decision priorities.

Severity should preferably derive from authoritative injury state rather than become an independent duplicated value that can drift.

Future localized categories such as sprains, fractures or impaired limbs can be added only when a body-location model provides enough simulation value.

## Illnesses and diseases

Illnesses are a separate source of physical impairment from injuries.

```text
combat / accident → injury
exposure / disease → illness
                         ↓
                  physical state
```

Illness may affect:

- effective attributes,
- HP,
- stamina,
- vigor,
- recovery,
- work capacity,
- movement,
- needs and behaviour,
- decision priorities.

The model should support duration, severity, recovery and treatment as needed, and later contagious conditions where they create meaningful world behaviour.

The first intended complete disease/condition lifecycle is poisoning rather than a broad disease taxonomy.

### Water quality and water-borne illness

Water already has a quality/safety seam independent of thirst relief. Current sources distinguish safe, unsafe and undrinkable water; lake water is unsafe, and uncovered player-built wells already have a direct consumption risk with immediate HP/Vigor consequences.

The target evolution is:

```text
water source
    ↓
quality / contamination / exposure risk
    ↓
consumption
    ↓
condition / illness risk
```

Poisoning should reuse this seam instead of creating a parallel water-health system.

Future extensions can include boiling/filtering, richer contamination, source choice by NPCs and water carried in containers. Container provenance/risk should only be added when the liquid/item model can represent it coherently.

NPCs should eventually weigh water safety against distance, thirst, traits and current pressures through the normal needs → pressures → decision model.

## Conditions and modifiers

Injuries and illnesses should modify effective physical state rather than permanently rewriting the base profile.

```text
Base Physical Profile / SPEA
        +
Persistent profile effects
        +
Injuries
        +
Illnesses
        +
other temporary conditions
        ↓
Effective SPEA / capabilities
```

Conditions should use shared mechanisms where practical. Avoid separate `PoisoningSystem`, `PlayerIllness`, `NpcDisease` or other parallel state machines for each consumer.

The first poisoning implementation can reduce selected effective attributes and recover through time/rest and appropriate treatment. Existing systems already integrated with those attributes then react automatically.

## Recovery and Medicine

Recovery is part of simulation rather than an instant reset.

Potential recovery inputs include:

- sleep,
- food and hydration,
- rest,
- time,
- treatment,
- medicine or consumables,
- care from other NPCs,
- severity of injury/illness,
- age and physical profile/Endurance.

Target injury progression:

```text
minor injury
→ rest / natural recovery

serious injury
→ bandage / dressing

critical injury
→ skilled medical assistance
```

Medicine is a learned competence/skill, not SPEA. NPCs with sufficient Medicine should eventually be able to treat the player and other NPCs through the same treatment mechanisms.

Doctor/Herbalist are roles/professions that use those mechanisms rather than owning separate healing systems. Medical goods such as herbs, bandages and dressings should connect to the settlement production/economy described by `docs/roadmap/textiles-and-herbal-medicine.md`.

Combat should leave the NPC in a state that can be handled by normal NPC decision/action systems:

```text
combat
  ↓
injured
  ↓
problem / pressure
  ↓
NPC decision
  ↓
rest / obtain treatment / self-treatment
  ↓
recovery
```

## Influence on NPC AI

Physical state feeds the NPC decision model rather than directly prescribing behaviour through combat-specific logic.

```text
physical state + effective capabilities
                ↓
       needs / problems / pressures
                ↓
             decision
                ↓
         strategy / action
```

Examples:

- exhausted NPC chooses rest over heavy work,
- injured NPC avoids dangerous work,
- sick NPC seeks treatment or stays home,
- weakened guard changes risk tolerance,
- low stamina influences whether demanding work continues,
- high Strength makes some physical strategies more attractive,
- high Perception lets an NPC detect relevant threats/information earlier,
- physical recovery becomes a problem/pressure in its own right.

The AI decides what to do with capabilities; the physical-state system does not prescribe behaviour.

## Player, NPC and fauna reuse

The long-term direction is shared physical primitives with different owners/generators rather than separate incompatible models.

```text
shared SPEA representation / resolution
shared HealthState
shared StaminaState
shared condition concepts where practical
              │
      ┌───────┼────────┐
      ↓       ↓        ↓
   Player    NPC     Fauna
```

The same SPEA value type can be generated differently:

```text
Player
→ player physical profile / progression rules

NPC
→ deterministic demographics/profile/individual variation

Animal
→ species baseline + lifecycle + individual variation
```

Species biology remains authoritative for absolute capabilities. A weak bear can remain absolutely stronger than a strong human even though both use the same relative Strength scale.

## Appearance phenotype

The NPC model-generation system should use a stable appearance phenotype so characters are visually distinct and family resemblance is possible.

### Body

- height: short / average / tall,
- build: thin / normal / muscular / heavy.

### Hair

Target natural hair colours:

- black,
- brown,
- red,
- blond,
- grey.

Hair colour should be explicit character-generation data rather than randomly selected independently by rendering.

### Hairstyle

Hairstyle is a separate visual characteristic from hair colour. A modular character system can combine hair models and colours dynamically.

### Face

Faces should eventually be part of the phenotype/appearance system, potentially using controlled face variants and/or morph parameters.

The exact face-generation technology is an implementation concern.

### Other appearance features

The phenotype can later extend with additional hereditary or visual characteristics without coupling them to runtime physical state.

## Heredity and family resemblance

Some appearance and physical characteristics should be hereditary and generated at family level rather than independently per NPC.

A family can have shared hereditary tendencies such as:

```text
Family
├── hair colour = brown
├── height tendency = tall
├── build tendency = normal
└── facial traits = shared tendency
```

Children inherit characteristics from parents with controlled variation. Inheritance describes tendencies/ranges rather than requiring identical values.

```text
parent phenotypes / physical tendencies
               ↓
        hereditary traits
               ↓
        child phenotype/profile
               ↓
       individual variation
```

This should eventually support visible family resemblance and selected inherited physical predispositions.

## Character generation and 3D models

The 3D character system should consume the phenotype rather than generating visual properties independently inside rendering code.

```text
NPC phenotype
      ↓
character generator
      ├── body variant / morph
      ├── height scale
      ├── hair model
      ├── hair colour
      ├── face
      └── outfit / accessories
```

Physical characteristics influence the model where appropriate; purely cosmetic characteristics such as hairstyle do not affect simulation unless explicitly defined later.

## Relationship to combat

Combat is one source of physical consequences, not the owner of physical state.

```text
combat intent
    ↓
combat
    ↓
damage
    ↓
HealthState + physical injury
    ↓
conditions / effective capabilities
    ↓
NPC decision / recovery
```

The shared combat system should continue to use common health/damage concepts. Injury generation and recovery should remain reusable by accidents, wildlife interactions and future hazards.

Strength/Agility/Perception may contribute to selected combat mechanics, but combat remains responsible for deciding how each capability matters.

## Simulation and performance

Physical state must remain cheap enough to support many NPCs and animals.

Prefer:

- compact authoritative state,
- deterministic base profiles,
- deterministic modifiers,
- pure capability mappings,
- recalculation of effective attributes only when relevant inputs change,
- event-driven condition changes where practical,
- lower-frequency recovery/disease updates where high frequency is unnecessary.

Do not regenerate physical profiles every render frame.

Remote/off-screen entities retain authoritative attributes and meaningful condition continuity while using the project's hybrid/adaptive simulation strategy.

## Relationship to current implementation

The current implementation already provides important parts of this direction:

- shared `HealthState`,
- shared `StaminaState`,
- NPC `VigorState`,
- explicit NPC age and life stages,
- deterministic `npcPhysicalProfile.ts` generation from sex, age and individual seeded variation,
- per-NPC max HP, max Stamina and max Vigor generated by that profile,
- NPC combat damage/death,
- authoritative `physicalInjury` separate from HP,
- NPC injury/healing pressure/decision/action flow,
- catalog-driven health consumables,
- water quality/safety through `WaterSource`, including unsafe lake water and uncovered-well consumption risk,
- shared NPC/fauna status-label presentation seams that can later consume observation/Perception.

The current physical-profile generator derives capacities directly:

```text
sex + age + deterministic variation
              ↓
max HP / max Stamina / max Vigor
```

The target evolution is:

```text
species + sex + age + deterministic variation + later build/traits
              ↓
             SPEA
              ↓
     derived physical capabilities
              ↓
HP / Stamina / Vigor / work / combat / observation / movement
```

This should extend/migrate the existing deterministic profile mechanism rather than replace it with parallel random attribute rolls.

Not yet implemented as a coherent shared model:

- SPEA attributes,
- species capability-baseline mappings,
- base/effective attribute resolution,
- Perception-driven observation,
- general illness/condition lifecycle,
- poisoning as a persistent condition,
- Medicine competence and assisted treatment,
- full fauna attribute integration.

The existing uncovered-well consumption risk is an immediate HP/Vigor consequence, not yet the duration/recovery/treatment illness model described here.

## Open design questions

The following remain implementation/design questions rather than settled vision requirements:

- exact SPEA generation distributions and correlations,
- concrete species capability reference values and curves,
- continuous versus categorical height/build representation,
- exact influence of sex, age, build and traits on SPEA distributions,
- which persistent traits affect attributes/capabilities,
- exact mappings from Endurance to HP/Stamina/Vigor characteristics,
- exact mappings from Strength/Agility/Perception to their consumers,
- whether later injuries justify body locations,
- deeper illness taxonomy and transmission beyond initial poisoning,
- detailed treatment/Medicine progression and thresholds,
- inheritance rules and mutation/variation range,
- face generation approach,
- exact mapping from phenotype to 3D body variants/morphs.

Implementation phases and current decisions are maintained in `docs/roadmap/physical-attributes-health-and-medicine.md`.

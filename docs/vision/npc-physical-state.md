# NPC Physical State

**Status:** planned

## Purpose

Define the target physical-state model for NPCs: health, stamina, vigor, age, sex, physical differences, physical capabilities, injuries, illnesses and hereditary appearance/physical traits.

This document describes the planned domain model, not the implementation or final numeric balance.

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

The player, NPCs and fauna should reuse shared health/damage concepts where practical.

## Core model

Separate relatively stable physical characteristics from changing runtime state.

```text
NPC
├── Demographics
│   ├── sex
│   └── age
│
├── Physical profile
│   ├── height
│   ├── build
│   ├── strength
│   ├── agility
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

The physical profile is intentionally extensible. `strength` and `agility` are the first planned explicit physical capabilities beyond the existing health/energy model. Additional capabilities may be introduced later if they are justified by simulation needs rather than as a generic RPG stat list.

## Physical capabilities

Physical capabilities describe relatively stable individual differences in what an NPC can physically do. They are part of the physical profile, not runtime conditions.

### Strength

Strength represents an NPC's general physical force-producing capacity.

It may influence:

- heavy physical work,
- carrying and lifting capacity,
- pushing or pulling,
- melee combat effectiveness,
- physical interactions with the environment,
- other activities where force is a meaningful constraint.

Strength should not be treated as a universal multiplier for every physical action. Relevant actions should explicitly decide whether and how strength matters.

### Agility

Agility represents an NPC's coordination, mobility and ability to perform quick or precise physical actions.

It may influence:

- movement and acceleration,
- turning and evasive movement,
- reaction-demanding actions,
- precision-oriented physical work,
- selected combat actions,
- other activities where coordination or mobility is a meaningful constraint.

Agility should not simply become a generic movement-speed multiplier. Relevant actions should explicitly decide whether and how agility matters.

### Future capabilities

The physical profile may later include additional capabilities when a real simulation system needs them. Candidate capabilities should be evaluated by whether they create meaningful differences in world behaviour, work, combat, survival or interaction rather than by completeness of a character-stat system.

## HP

HP represents the NPC's current health/integrity and remains the primary immediate consequence of damage.

The existing `HealthState` concept should remain the shared foundation for health and death.

```text
max HP
current HP
alive / dead
```

HP should not be treated as a complete representation of physical condition. An NPC can recover HP while an injury or illness remains active.

## Stamina

Stamina represents short-term capacity for physical effort.

It should influence activities such as:

- walking/running,
- demanding work,
- combat actions,
- other strenuous activities.

Stamina has a maximum derived from the NPC's physical profile and can be temporarily reduced by age, injuries, illnesses and other conditions.

The existing `StaminaState` remains the basic runtime primitive.

## Vigor

Vigor represents longer-term physical energy/recovery capacity and daily ability to sustain demanding activity.

It should remain distinct from stamina:

```text
Stamina = short-term effort capacity
Vigor   = longer-term energy / recovery state
HP      = health / physical integrity
```

The existing vigor mechanics already model work drain, sleep recovery, collapse and additional cost from damage. The future physical profile should determine the NPC's baseline maximum and recovery characteristics instead of assuming one universal maximum for every NPC.

## Physical differences

NPCs should not all have identical physical capabilities.

The target model should derive physical capabilities from multiple factors:

```text
age + sex + build + height + physical traits
                         ↓
                 physical profile
                         ↓
      strength / agility / HP / stamina / vigor
              recovery / capacity
```

The exact formulas and numerical modifiers should be calibrated during implementation rather than fixed in this vision document.

Strength and agility should therefore emerge from the complete physical profile rather than being simple independent rolls. Age, sex, build, height, inherited tendencies and individual traits may all contribute where biologically or simulation-wise appropriate.

### Age

Age should have meaningful physical consequences without turning age into a simple linear multiplier.

The model should support distinct life stages such as:

- child,
- young adult,
- adult,
- older adult,
- elderly.

Children should not simply be smaller adult NPCs from the simulation perspective. Their physical capabilities, stamina, strength and vulnerability should be appropriate to their developmental stage.

Older NPCs should generally have different physical capacity and recovery characteristics from younger adults, while individual traits can produce substantial variation.

### Sex

Sex should be available as part of the physical profile because biological differences can affect physical capability distributions.

The model should avoid reducing every individual to a fixed sex modifier. Individual build, traits, age and other characteristics should contribute to the final profile.

Sex-related differences should therefore influence probability/distribution and baseline characteristics rather than completely determining an NPC's capabilities.

### Height

Height is both an appearance characteristic and a possible physical input.

Target categories:

- short,
- average,
- tall.

Implementation may use a continuous underlying value with these categories used for generation/presentation.

### Build

Target body-build categories:

- thin,
- normal,
- muscular,
- heavy.

Build should influence physical capability where appropriate, but should not become a simplistic direct mapping such as `muscular = always stronger` or `heavy = always slower`.

Build is also a key input to character model selection and visual silhouette.

## Injuries

Injuries are persistent or semi-persistent physical conditions that can result from combat, accidents or other world events.

They are **not equivalent to HP loss**.

Example lifecycle:

```text
combat / accident
      ↓
    damage
      ↓
   HP loss
      ↓
   injury may occur
      ↓
physical impairment
      ↓
recovery / treatment
```

An injury may affect:

- stamina capacity,
- vigor capacity or recovery,
- movement,
- work effectiveness,
- combat capability,
- action availability,
- pain/fatigue,
- NPC decision priorities.

An injury should be capable of persisting after HP has recovered.

Examples of future injury categories may include:

- minor wound,
- severe wound,
- sprain,
- fracture,
- impaired limb,
- other localized injuries.

The detailed injury taxonomy and body-location model should be defined separately when implementation requires it.

## Illnesses and diseases

Illnesses are a separate source of physical impairment from injuries.

```text
combat / accident → injury
illness / disease  → illness
                         ↓
                  physical state
```

Illness may affect:

- HP,
- stamina,
- vigor,
- recovery,
- work capacity,
- movement,
- needs and behaviour,
- decision priorities.

Illnesses should exist independently of combat so that disease can spread or arise naturally within the world.

The model should eventually support duration, severity, recovery and treatment, and potentially contagious conditions where appropriate.

## Conditions and modifiers

Injuries and illnesses should be represented as conditions that modify the effective physical state rather than permanently rewriting the NPC's base profile.

Conceptually:

```text
Base Physical Profile
        +
Age / temporary modifiers
        +
Injuries
        +
Illnesses
        +
other conditions
        ↓
Effective Physical State
```

This keeps stable identity separate from temporary circumstances and makes recovery/replacement of conditions straightforward.

## Recovery

Recovery should be part of the simulation rather than an instant reset.

Potential recovery inputs include:

- sleep,
- food and hydration,
- rest,
- time,
- treatment,
- medicine or consumables,
- care from other NPCs,
- severity of injury/illness,
- age and physical profile.

Combat should leave the NPC in a condition that can be handled by normal NPC decision/action systems.

Target flow:

```text
combat
  ↓
injured
  ↓
NPC decision
  ↓
rest / treatment / healing
  ↓
recovery
```

There should be no separate player-centric healing loop for NPCs.

## Influence on NPC AI

Physical state should feed the NPC decision model rather than directly controlling behaviour through special-case combat logic.

```text
physical state
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
- weakened guard may change risk tolerance,
- low stamina can influence whether an NPC continues a demanding task,
- physical recovery can become a problem/pressure in its own right.

Physical capabilities such as strength and agility should similarly be exposed as facts/modifiers to the decision/action systems. The AI decides what to do with those capabilities; the physical-state system does not prescribe behaviour.

## Appearance phenotype

The NPC model-generation system should use a stable appearance phenotype so that characters are visually distinct and family resemblance is possible.

Target characteristics include:

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

Hair colour should be an explicit character-generation value rather than being randomly selected independently for every rendered NPC.

### Hairstyle

Hairstyle should be a separate visual characteristic from hair colour. The future modular character system can combine hair models and colours dynamically.

### Face

Faces should eventually be part of the phenotype/appearance system, potentially using a controlled set of face variants and/or morph parameters.

The exact face-generation technology is an implementation concern.

### Other appearance features

The phenotype can later be extended with additional hereditary or visual characteristics without coupling them to the physical runtime state.

## Heredity and family resemblance

Some appearance and physical characteristics should be hereditary and generated at the family level rather than independently per NPC.

A family can have shared hereditary tendencies such as:

```text
Family
├── hair colour = brown
├── height tendency = tall
├── build tendency = normal
└── facial traits = shared tendency
```

Children should inherit characteristics from their parents with controlled variation.

Important rule: family resemblance should be visible and coherent. For example, a family may naturally have brown hair, so members should not independently roll completely unrelated hair colours.

Inheritance does not mean every family member must be identical. Some traits should be inherited as tendencies/ranges rather than exact values.

Conceptually:

```text
parent phenotypes
       ↓
hereditary traits
       ↓
child phenotype
       ↓
individual variation
```

This should eventually support both visual family resemblance and selected inherited physical predispositions.

## Character generation and 3D models

The planned 3D character system should consume the phenotype rather than generating visual properties independently inside rendering code.

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

The same phenotype can therefore be used by simulation and presentation while keeping rendering concerns separate from simulation state.

Physical characteristics should influence the model where appropriate; purely cosmetic characteristics such as hairstyle should not affect simulation unless explicitly defined later.

## Relationship to combat

Combat is one source of physical consequences, not the owner of physical state.

Target flow:

```text
combat intent
    ↓
combat
    ↓
damage
    ↓
HealthState + possible injury
    ↓
physical state
    ↓
NPC decision / recovery
```

The shared combat system should continue to use the common health/damage concepts. Injury generation and recovery should remain reusable by other world systems such as accidents, wildlife interactions or future hazards.

## Simulation and performance

Physical state must remain cheap enough to support many NPCs.

Prefer:

- compact state,
- deterministic modifiers,
- cached base physical profiles,
- recalculation only when relevant inputs change,
- event-driven condition changes where practical,
- lower-frequency recovery updates where high frequency is unnecessary.

Do not perform expensive physical-profile calculations every render frame.

Remote/off-screen NPCs should retain meaningful continuity while using the project's hybrid/adaptive simulation strategy.

## Relationship to current implementation

Current implementation already provides reusable primitives for:

- `HealthState`,
- `StaminaState`,
- `VigorState`,
- NPC combat damage/death,
- NPC healing flow.

However, the current model does not yet provide a complete biological/physical profile that derives maximum HP, stamina, vigor, strength and agility from age, sex, build, height and individual traits.

The current NPC character definition contains sex, role, personality and traits, while age and full physical phenotype are not yet first-class simulation properties.

Children currently use family relation plus a smaller visual scale rather than a complete age/development model.

This document defines the target model without claiming those planned systems are implemented.

## Open design questions

These should be resolved before implementation:

- exact age representation and life-stage boundaries,
- continuous versus categorical height/build representation,
- exact influence of sex and age on physical distributions,
- which traits affect physical capabilities,
- exact formulas for max HP/stamina/vigor/strength/agility,
- whether injuries use body locations,
- injury severity and duration model,
- illness taxonomy and transmission model,
- treatment and medical-care model,
- inheritance rules and mutation/variation range,
- face generation approach,
- exact mapping from phenotype to 3D body variants/morphs.

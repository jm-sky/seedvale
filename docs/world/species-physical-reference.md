# Species Physical Reference — SPEA & Absolute Capabilities

**Status:** authoritative design reference  
**Scope:** current human + fauna species physical/sensory baselines  
**Last researched:** 2026-09-06

## Purpose

This document is the authoritative Seedvale reference for species physical baselines and SPEA reference semantics.

Future implementation plans should say:

> Use `docs/world/species-physical-reference.md` as the authoritative source for species physical baselines and SPEA reference semantics. Do not invent species values inside the implementation plan.

This is **not** a combat-balance table. Existing `MAX_HP`, predator damage, `walkSpeed`, `sprintSpeed`, detection ranges and similar gameplay values are current implementation data, not biological evidence. They may later be reconciled with this reference, but they are not inputs to the values below.

The goal is a small set of biologically interpretable anchors. Where no defensible cross-species measurement exists, this document deliberately says so rather than manufacturing a coefficient.

## Current species scope

Current code (`src/fauna/AnimalAgent.ts`) defines 16 `AnimalKind`s:

`wolf`, `fox`, `deer`, `stag`, `rabbit`, `duck`, `boar`, `bear`, `horse`, `donkey`, `cow`, `sheep`, `chicken`, `rooster`, `dog`, `rat`.

Together with `human`, this document therefore covers 17 reference profiles.

Species interpretation used here:

- `deer` = European roe deer (*Capreolus capreolus*), matching the current Polish label `sarna`;
- `stag` = adult male red deer (*Cervus elaphus*), matching `jeleń` and the deliberately larger current model;
- `duck` = mallard-type duck (*Anas platyrhynchos*);
- `bear` = European brown bear (*Ursus arctos*), not Kodiak/grizzly extremes;
- `rabbit` = European rabbit (*Oryctolagus cuniculus*), not hare;
- `rat` = brown/Norway rat (*Rattus norvegicus*), appropriate for a settlement pest;
- `dog` = a medium farm/working dog profile. `AnimalKind` currently has no breed dimension, and dog morphology varies too much for a universal biological body-mass baseline;
- `horse`, `donkey`, `cow`, `sheep`, `chicken` and `rooster` are domestic working/farm profiles, not breed extrema.

If code later distinguishes breeds, sexes or additional species, those should refine these profiles rather than silently changing the meaning of an existing row.

---

## 1. SPEA semantics

SPEA is a **within-species relative scale**:

```text
Strength    0..1
Perception  0..1
Endurance   0..1
Agility     0..1
```

`0.5` means a typical healthy adult **of that species/reference profile**.

```text
Human Strength 0.5 = typical healthy adult human
Bear  Strength 0.5 = typical healthy adult European brown bear
```

Those values are equal only in relative position within their own populations. They do **not** mean equal absolute force, body mass, carrying ability, attack anatomy, locomotion or stamina.

Useful semantic anchors:

| SPEA | Meaning |
|---:|---|
| `0.0` | practical extreme low end; not an ordinary healthy adult |
| `0.25` | clearly below the healthy-adult species reference |
| `0.5` | typical healthy adult reference |
| `0.75` | clearly above the healthy-adult species reference |
| `0.9` | exceptional healthy individual |
| `1.0` | practical extreme upper end; not an ordinary roll |

Raw SPEA must never be used directly for cross-species comparison.

## 2. Relative attributes vs absolute capabilities

The resolution model is:

```text
species reference capabilities
        +
individual base SPEA
        +
age / development / sex / build / persistent traits
        +
temporary conditions
        ↓
effective world capability
```

The terms are deliberately different kinds of data:

- **species reference** — absolute biological context;
- **SPEA** — individual variation relative to that context;
- **profile/development** — age, sex, build and later inherited traits;
- **conditions** — temporary impairment/recovery state;
- **effective capability** — the value a concrete system consumes.

A system should ask for the capability it actually needs. It should not ask for a universal `speciesStrengthMultiplier`.

Examples:

- carrying uses body mass + load-bearing anatomy + Strength + condition;
- melee uses weapon/attack anatomy + relevant force contribution + skill/timing;
- collision/pushing uses body mass, velocity, footing and force production;
- fleeing uses locomotion profile + Agility/Endurance + terrain + current stamina;
- detection uses sensory channel(s) + Perception + stimulus + environment;
- maximum running speed remains locomotion data, not Agility.

---

## 3. Common absolute capability metrics

Only metrics with a stable physical meaning belong in shared species reference data.

### 3.1 Reference body mass — `kg`

`referenceBodyMassKg` is a representative healthy-adult mass used for mechanics where mass itself matters: inertia, load ratios, knockback/body contact, approximate energetic scale, carrying calculations and size-aware interactions.

It is **not Strength**. A 700 kg cow is not automatically “ten times as strong” as a 70 kg human.

Where a species has large sex, geography or breed variation, the table gives a **Seedvale reference point** inside an evidence-backed adult range. That point is a modelling anchor, not a claim that it is the biological mean of the whole species.

### 3.2 Sustainable mounted/carried external load — `kg` and `% body mass`

This metric is present only when carrying an external load is anatomically and behaviourally meaningful and there is a defensible reference.

- Horse: ~20% of ideal body weight is a commonly used comfortable mounted-load reference for an average light riding horse under the cited conditions [S10]. For the 500 kg reference horse this is ~100 kg total mounted load, including tack.
- Donkey: evidence is substantially less settled. A UK welfare recommendation of ~28% BW and experimental/guideline values up to ~50% BW are reported, with explicit warnings that evidence and context differ [S11][S12]. Seedvale should use **~28% BW (~50 kg for a 180 kg reference donkey)** as the conservative normal-work reference, not treat 50%+ as routine healthy loading.
- Human: no single biologically universal “carry capacity” exists. Load carriage depends strongly on task duration, terrain, training and equipment. Seedvale should model human carrying from inventory/encumbrance design plus body profile rather than claim a universal biological maximum here.
- Other species: `n/a` unless Seedvale later implements a real working/load-bearing use with appropriate evidence.

Do not infer bear carrying/lifting kilograms, wolf pulling force, cow pushing force, etc. from anecdotes. No shared empirical metric was found that would make those values comparable and useful.

### 3.3 Locomotion profile — modes + optional speed/endurance evidence

Locomotion is species-specific absolute capability data. It includes modes such as cursorial running, bounding, swimming, flight, climbing or load-bearing gaits.

Maximum speed is **not Agility**. Daily travel is **not Endurance by itself**. They can be evidence anchors for the species locomotor envelope, but the effective action still depends on terrain, gait, motivation, training, stamina and condition.

When reliable evidence is absent or highly context-specific, the table uses qualitative locomotor anatomy rather than fake precision.

### 3.4 Sensory channels — explicit channel profile

There is no scientifically defensible single unit that makes “wolf smell”, “human vision”, “duck vision” and “rat whisker/vibration sensing” one scalar.

Therefore species reference keeps channels explicit:

```text
vision
hearing
olfaction
somatosensory/tactile
vibration
other specialised channel when relevant
```

`Perception` modifies an individual's ability to use its species sensory equipment; it does not replace that equipment.

A future observation system should resolve approximately:

```text
stimulus
+ species sensory channel capability
+ individual Perception
+ distance / occlusion / wind / light / noise
+ temporary condition
→ detection / recognition / assessment
```

### 3.5 Attack/interaction anatomy — explicit, not SPEA

Bite, claws, antlers, tusks, hooves, horns, beak and human tool use remain species/action-specific. Strength may influence force within an applicable action, but does not define the action's anatomy or damage by itself.

---

## 4. Authoritative species reference table

**Evidence labels** used below:

- **E** — empirical/reference value directly anchored in a cited biological/veterinary source;
- **A** — approximation chosen inside a cited biological range;
- **M** — explicit Seedvale modelling reference where biology does not provide one universal number;
- **n/a** — metric is not biologically meaningful or not sufficiently supported for this species.

| Kind | Biological/reference profile | Reference body mass | Strength / load anchor | Locomotion & Endurance anchor | Sensory / Perception channels | Anatomy relevant to world capability |
|---|---|---:|---|---|---|---|
| `human` | healthy adult human | **70 kg (M)** | No universal lift/carry maximum. Human heavy handling is task-, training- and posture-dependent. Use mass + individual Strength + action-specific ergonomics. | Bipedal walk/run; unusually strong long-duration locomotor/thermoregulatory potential, but training dominates extremes. Do not use elite endurance records as `0.5`. | vision dominant for many tasks; hearing, smell, touch explicit | hands/tool use, bipedal leverage; weapons/tools remain action data |
| `wolf` | European gray wolf | **35 kg (A)**; LCIE adults ~15–60 kg by sex [S1] | No invented kg lift value. Body force comes from medium-large cursorial canid mass + musculature; bite remains separate. | Cursorial, long-ranging. Wolf ecology supports large territories [S1]; Smithsonian documents canid long-range movement and high running ability [S2]. Treat as **high sustained terrestrial locomotion**, not a speed multiplier. | strong olfaction; good hearing and vision; chemical + acoustic communication [S2][S16] | jaws/teeth, pack hunting; bite/action profile separate from Strength |
| `fox` | European red fox | **7 kg (A)**; 3–14 kg [S3] | Light canid; no load metric. | Agile cursorial/pouncing locomotion. UK GPS study found mean ~4.65 km/day, context-dependent [S17]; other habitats produce much larger movement [S18]. Use **moderate sustained locomotion**, high short-action mobility. | excellent smell/vision/touch; hearing is crucial to prey localisation [S3] | pouncing + bite; small body mass limits body-force interactions |
| `deer` | roe deer | **20 kg (A)**; ~10–25 kg [S4] | No external-load metric. Light ungulate body-force context. | Cursorial/rapid escape, narrow hooves; short-to-medium range escape and manoeuvre rather than load work. | large eyes/ears; olfactory, visual and acoustic cues important [S4][S5] | hooves; small antlers only for male roe if sex is later represented; current `deer` should not inherit red-deer antler force |
| `stag` | adult male red deer | **140 kg (A)**; European/British stags ~90–190 kg [S6] | No external-load metric. Large ungulate body-force context. | Cursorial large deer; sustained seasonal/rut activity, but not a pack animal. Farmed red deer data show several km/day in pasture and strong context dependence [S19]. | keen smell/hearing/vision typical cervid profile [S7] | antlers + hooves; rutting/body clashes are species/sex-specific actions |
| `rabbit` | European rabbit | **2.0 kg (A)**; 1.5–2.5 kg [S8] | No load metric. | **Saltatorial/bounding**, rapid acceleration and abrupt escape; ~56 km/h top-speed literature anchor exists, but rabbits are sprinters and can fatigue under prolonged pursuit [S20]. This is a key example of high agility ≠ high endurance. | vision, hearing, smell/touch; ground vibration and tactile cues are relevant [S8] | powerful hindlimb propulsion; digging; no generic “high Strength” inference |
| `duck` | mallard-type duck | **1.05 kg (E/A)**; ADW ~1.05–1.08 kg [S9] | n/a | Walking + surface swimming + **flight**. Flight is a distinct locomotion mode and must not be represented by high Agility or terrestrial sprint speed. | visual + acoustic + tactile + chemical channels [S9] | wings/flight, webbed feet, bill; water-adapted locomotion |
| `boar` | European wild boar | **100 kg (A)**; broad adult range 66–272 kg [S13] | No load metric. Robust, low-centre-of-mass body-force profile; mass matters strongly in collision/pushing. | Terrestrial walk/run; movement is context-dependent. Polish GPS evidence shows ordinary local movement can be low while dispersal can average ~6 km/day and reach >30 km/day [S14]. | well-developed smell and hearing; good peripheral vision [S13] | tusks + bite/body charge; attack anatomy separate from Strength |
| `bear` | European brown bear | **180 kg (A)**; Europe males ~140–320 kg, females ~100–200 kg [S15] | **Do not assign a fabricated lift/carry kg value.** Very robust plantigrade body, large mass and powerful limbs establish high absolute body-force context; concrete actions should use mass/anatomy-specific models. | Capable terrestrial runner, swimmer and sustained movement; treat as robust generalist locomotion, not as a cursorial endurance specialist. | exceptional olfaction is the standout channel; hearing useful; vision should not be flattened into the same scalar [S21] | jaws, forelimbs/claws, body mass; species-specific attack actions |
| `horse` | average light adult horse | **500 kg (E/M)**; NRC/Merck uses 500 kg average-horse reference [S22] | **~100 kg mounted load (A)** = ~20% BW comfortable reference under cited riding conditions [S10]. Not a pulling-force value. | Walk/trot/canter/gallop; strong aerobic work capacity. 160 km endurance events demonstrate trained-species potential but are **not** the `0.5` everyday baseline [S23]. | ~340° peripheral vision, strong movement detection, mobile directional ears, strong smell [S24] | hooves/kick, load-bearing back, elastic distal limbs; draft pulling would need a separate evidence-backed metric |
| `donkey` | medium domestic donkey | **180 kg (M/A)**; veterinary feeding references commonly span roughly 175–250 kg examples [S25] | **~50 kg mounted load (A/M)** ≈28% BW conservative normal-work reference; evidence/guidelines vary and >50% loading raises welfare concerns [S11][S12]. | Sure-footed equid; sustained working locomotion. Do not simply copy horse acceleration/speed. | equid vision/hearing/smell pattern; species-specific behavioural response differs from horse | pack/load anatomy; hooves; pulling should be separate from mounted load |
| `cow` | large adult cattle/dairy-type cow | **700 kg (E/M)**; Merck large-breed dairy references ~675–740 kg [S26] | No generic carry metric. Very large mass and robust body make body contact/pushing significant; do not translate mass directly to Strength. | Heavy quadruped, sustained grazing/walking rather than rapid manoeuvre; cattle field studies show daily travel can exceed 10 km in extensive range contexts [S27]. | broad visual field; hearing/olfaction important; keep channels explicit | horns only if phenotype actually has them; hooves/body shove; current generic cow must not assume horns |
| `sheep` | medium domestic sheep | **70 kg (M)** | No external-load metric. | Herding/grazing quadruped; moderate sustained walking, rapid short flee response. Merck uses 50 kg as a concrete adult nutritional example, illustrating breed/size variability [S28]. | prey-species vision/hearing/olfaction; no single perception multiplier | hooves/head-butt only where sex/phenotype supports it |
| `chicken` | medium domestic hen | **2.0 kg (M)** | n/a | Terrestrial walking/running + short burst wing-assisted movement/limited flight depending on breed. | strong visual relevance; hearing/tactile channels; do not infer mammalian smell hierarchy | beak/claws; small body mass |
| `rooster` | medium domestic cock | **2.5 kg (M)** | n/a | Same basic locomotor envelope as domestic chicken; sex/body-build differences may shift mass/action profile. | same channel set as chicken | beak, claws/spurs; spur attack is sex-specific anatomy, not Strength |
| `dog` | medium farm/working dog | **25 kg (M)** | No universal load metric; breed variation is too large. | Cursorial canid; actual speed/endurance varies enormously by breed. Until breed exists, use a medium working-dog locomotor profile and keep individual SPEA variation narrower than breed-level variation. | hearing substantially exceeds human high-frequency/detection capability; smell is a primary specialised channel [S29] | jaws; breed/body-size should later refine bite/body-force context |
| `rat` | brown/Norway rat | **0.40 kg (E/A)**; ~140–500 g, average ~400 g [S30] | n/a | Small cursorial/fossorial animal; capable swimmer; high manoeuvrability in confined spaces. | smell is the dominant documented channel; good hearing/touch; whiskers and ground vibration are important, including navigation in darkness [S30] | incisors, climbing/burrowing/body flexibility; tiny absolute body force despite potentially high relative Agility |

### What this table intentionally does not contain

There is no `absoluteStrength = 1.8`, `perceptionMultiplier = 2.2`, `bearLiftKg = 150`, or `wolfAgility = 1.4`.

Those values would look precise without having a stable biological meaning. Future mechanics should derive the needed quantity from the smallest relevant set of physical facts and the individual's SPEA.

---

## 5. Attribute-specific resolution guidance

### Strength

Strength means **individual force-producing capacity within the species/body context**.

Preferred resolution order:

```text
interaction type
→ species anatomy + reference body mass / load model
→ individual Strength
→ age/build/sex/traits where relevant
→ injury/illness/fatigue
→ skill/tool/mechanical advantage where relevant
→ outcome
```

Rules:

1. Do not derive Strength from body mass alone.
2. Do not derive melee damage from Strength alone.
3. Do not invent a universal cross-species “lift capacity”.
4. Use measured load ratios only for actual load-bearing mechanics where the evidence applies.
5. For pushing/collision, body mass and velocity are first-class physical inputs independent of Strength.
6. For species weapons (bite, antlers, tusks, hooves, claws), keep anatomy/action data explicit.

### Endurance

Endurance means **individual ability to sustain and recover from physical strain relative to the species**.

There is no single shared “stamina seconds” biological constant. Sustainable effort depends on gait, temperature, terrain, motivation, conditioning, hydration and load.

Use species locomotor ecology as the baseline and Endurance to vary within it. Examples:

- wolf: long-ranging cursorial baseline;
- horse: high aerobic work potential, strongly trainable;
- rabbit: burst/sprint escape baseline with poorer prolonged-pursuit tolerance;
- cow/sheep: sustained low-intensity grazing/walking, not high-speed endurance;
- duck: terrestrial, swimming and flight costs are different modes and should not share one flat drain rate.

For runtime systems, `maxStamina`, exertion cost and recovery may be separate mappings. Endurance can influence all three, but should not replace the species/activity cost model.

### Agility

Agility means **individual coordination, manoeuvrability, acceleration/reaction and quick-action capability within the species**.

Keep these absolute properties separate:

- maximum locomotion speed;
- gait/movement mode;
- body size and turning geometry;
- acceleration envelope;
- terrain suitability;
- flight/swimming/climbing capability.

A rabbit can be more manoeuvrable than a horse while having vastly lower body force. A horse can have a much higher absolute travel speed than a human without its raw Agility SPEA being higher. A duck can fly because its species locomotion profile includes flight, not because its Agility crosses a threshold.

### Perception

Perception means **individual effectiveness at noticing, recognising and assessing information using the senses available to its species**.

Do not map `Perception` directly to one detection radius.

Preferred model:

```text
sensory stimulus (visual / acoustic / olfactory / tactile / vibration)
+ species channel capability
+ individual Perception
+ environment
+ target signal strength
+ attention/behaviour state
→ detection confidence
→ recognition / assessment detail
```

Examples:

- wind should strongly affect olfactory detection;
- darkness should penalise human visual detection more than a species adapted to low light;
- occlusion can block vision while leaving smell or sound usable;
- rats can detect information through whiskers/vibration in situations where a vision-only model would fail;
- horse peripheral movement detection should not be represented merely as a longer forward raycast;
- dog/wolf smell should remain a channel capability, not `Perception +0.3`.

---

## 6. Individual SPEA generation around `0.5`

### 6.1 Distribution

Do **not** use four independent uniform `0..1` rolls.

For a healthy adult with no profile modifiers, use a deterministic bell-shaped distribution centred on `0.5`.

Recommended initial generator:

```text
latent z ~ truncated normal(mean=0, sd=1, bounds≈[-3, +3])
base SPEA = 0.5 + z * 0.10
```

This yields a practical interpretation:

- about two thirds of ordinary healthy adults near `0.40..0.60`;
- most near `0.30..0.70`;
- `0.2` / `0.8` genuinely unusual;
- values approaching `0` / `1` reserved for exceptional profile/development cases rather than ordinary random generation.

The exact deterministic normal sampler is an implementation choice, but the distribution semantics above are authoritative. A bounded normal, inverse-CDF lookup, or sum-of-uniform approximation is acceptable if deterministic and tested.

### 6.2 Do not make the four attributes independent noise

A future physical-profile generator may introduce modest correlations where justified (for example body build influencing both Strength and some Endurance-related capability), but should not collapse the attributes into one “athleticism” roll.

Start with independent latent variation only if necessary for the first implementation, then apply shared profile inputs explicitly. Do not hide correlation in unexplained magic coefficients.

### 6.3 Sex

Sex can shift **distributions of relevant physical profile inputs/capabilities** where evidence supports it, especially body mass/build and force-producing capacity in sexually dimorphic species.

Rules:

- do not use one global `maleStrengthBonus` across species;
- do not make sex determine an individual's final value;
- overlapping individual distributions must remain possible;
- for strongly dimorphic profiles already represented as distinct kinds (`stag`), do not apply the same difference twice.

### 6.4 Age / life stage

`0.5` is the healthy **adult** reference. Juveniles should resolve through development, not by pretending their species baseline changed.

Age effects are attribute/capability-specific:

- body mass and Strength develop substantially;
- coordination may mature on a different curve;
- endurance/recovery can develop and later decline;
- sensory decline in old age may affect channels differently.

Do not use one linear `ageMultiplier` for all SPEA/capabilities.

### 6.5 Build

Build is profile data, not a synonym for Strength.

It may affect body mass, muscle cross-section, leverage and load capacity where appropriate. “Heavy” must not automatically mean strong or slow; “muscular” must not automatically imply high Endurance.

### 6.6 Traits / heredity

Later heredity should bias the latent/profile inputs, not replace SPEA with a genetics simulator. Persist authoritative inherited tendencies only if the later family system needs them; derive effective capabilities.

### 6.7 Temporary conditions

Injury, illness, poisoning, exhaustion and similar state modify **effective** SPEA/capabilities. They never rewrite the stable base roll.

---

## 7. Guidance for future implementation plans

1. **Reference this file, do not restate or invent species values in a plan.**
2. Put shared biological reference data in one species-reference owner, not separately in combat, movement, fauna AI and UI.
3. Keep existing gameplay values until the plan explicitly migrates a consumer. Documentation research alone does not silently rebalance `MAX_HP`, damage or movement.
4. A consumer must name the capability it needs. Avoid generic `speciesMultiplier` fields.
5. Prefer dimensional inputs (`kg`, `m/s`, `% body mass`, distance, duration) when a meaningful measurement exists.
6. When no defensible metric exists, use an explicit qualitative capability/anatomy model rather than a pseudoscientific number.
7. Species-specific anatomy and locomotion remain first-class data. SPEA varies the individual; it does not grant or remove anatomical capabilities.
8. Perception consumers should state the sensory channel. Do not turn smell/hearing/vision into one radius.
9. Endurance consumers should distinguish capacity, exertion cost and recovery.
10. Agility consumers should distinguish acceleration/turning/reaction from maximum speed.
11. Strength consumers should distinguish force production from body mass, weapon/action mechanics and leverage.
12. Preserve deterministic generation and world independence from player/camera.

### Suggested data boundary, not an implementation prescription

A future implementation may find a shape similar to this useful:

```text
SpeciesPhysicalReference
├── referenceBodyMassKg
├── loadBearing? { normalMountedLoadRatio, evidence }
├── locomotion { modes, evidenceAnchors }
├── senses { vision, hearing, olfaction, tactile, vibration, ... }
└── anatomy { attack/interaction capabilities }

IndividualPhysicalProfile
├── baseSPEA
├── demographics / development
├── build / persistent traits
└── derived effective capabilities
```

Do not add fields merely because they appear in this sketch. Add a field when a real consumer needs it.

---

## 8. Relationship to current Seedvale fauna values

Current code already contains species gameplay tuning:

- `src/fauna/faunaCombat.ts` — `MAX_HP`, predator damage, predator→human damage;
- `src/fauna/AnimalAgent.ts` — `ANIMAL_DEFS` including scale, `walkSpeed`, `sprintSpeed`, `detectRange`, `fleeRange`, player notice/panic ranges, metabolism, diets, water capability, roaming and trips;
- shared `HealthState` / `StaminaState` and fauna life-state logic.

Those values are useful evidence of **current implementation behaviour**, but not biological source data. In particular:

- current HP is an abstract gameplay health quantity;
- predator damage is attack/gameplay tuning;
- current speed values include historical gameplay/riding constraints;
- detection/flee ranges are AI tuning, not measured sensory ranges;
- all species currently sharing `DEFAULT_ANIMAL_METABOLISM` does not imply equal biological endurance/metabolism.

Future SPEA plans should migrate consumers deliberately, with tests, rather than “correcting” all current numbers at once.

---

## 9. Research notes and limitations

### Species ambiguity

Some `AnimalKind`s are broader than real biological taxa. `dog`, domestic chicken, sheep, cattle, horse and donkey vary greatly by breed. The current rows intentionally choose moderate Seedvale reference profiles and mark them **M** where a universal species mean would be misleading.

### Geography

For wild European species, references prefer European/temperate profiles when available. Brown bear is explicitly European; using Kodiak/grizzly mass as the default would distort Seedvale's setting. Roe deer and red deer are treated separately because current code labels already imply that distinction.

### Strength data scarcity

Cross-species “lifting strength” tables are not a sound biological dataset. Research commonly reports body mass, locomotor performance, bite force for particular studies, ground reaction forces, work/load responses or task-specific biomechanics. These are not interchangeable. Seedvale therefore does not invent lift kilograms for non-load-bearing animals.

### Endurance data comparability

Daily movement, endurance races, treadmill VO2 measurements and working hours measure different things. They are useful ecological/physiological anchors but should not be normalized into one universal coefficient without a concrete simulation consumer.

### Sensory data comparability

Sensory systems differ by receptor biology, field of view, frequency range, thresholds, environmental propagation and behavioural attention. Qualitative channel strengths are more honest at this stage than a table of arbitrary `0..1` species sensory multipliers.

---

## 10. Sources

Primary preference was veterinary manuals, university/peer-reviewed research, established zoological references and European wildlife organisations. Sources support the biological anchors; Seedvale modelling choices are labelled **M** above.

- **[S1]** Large Carnivore Initiative for Europe — Wolf (*Canis lupus*): European sex-specific mass ranges, social ecology, home ranges. https://www.lcie.org/large-carnivores/wolf-
- **[S2]** Smithsonian National Zoo — Gray wolf: adult mass ranges, communication/sensory ecology and locomotor context. https://nationalzoo.si.edu/animals/gray-wolf
- **[S3]** University of Michigan Animal Diversity Web — Red fox (*Vulpes vulpes*): 3–14 kg, morphology, sensory ecology. https://animaldiversity.org/accounts/Vulpes_vulpes/
- **[S4]** British Deer Society — Roe deer: adult size/mass and morphology. https://bds.org.uk/information-advice/about-deer/deer-species/roe-deer/
- **[S5]** Animal Diversity Web — *Capreolus* communication/perception context. https://animaldiversity.org/accounts/Capreolus_pygargus/
- **[S6]** British Deer Society — Red deer: European/British stag 90–190 kg, hind 63–120 kg, morphology. https://bds.org.uk/information-advice/about-deer/deer-species/red-deer/
- **[S7]** Animal Diversity Web — Red deer/elk (*Cervus elaphus*): locomotion, communication, keen smell/hearing/vision, sexual dimorphism. https://animaldiversity.org/accounts/Cervus_elaphus/
- **[S8]** Animal Diversity Web — European rabbit: 1.5–2.5 kg, saltatorial ecology and sensory channels. https://animaldiversity.org/accounts/Oryctolagus_cuniculus/
- **[S9]** Animal Diversity Web — Mallard: ~1.05–1.08 kg and flight/aquatic/sensory channels. https://animaldiversity.org/accounts/Anas_platyrhynchos/
- **[S10]** University of Minnesota Extension — horse weight-carrying guidance: ~20% ideal body weight for an average light riding horse under the cited study conditions. https://extension.umn.edu/horse-care-and-management/guidelines-weight-carrying-capacity-horses
- **[S11]** Bukhari et al. 2022, *Animals* / PMC — working donkey mounted loads, welfare concerns and limitations of current guidance. https://pmc.ncbi.nlm.nih.gov/articles/PMC9186103/
- **[S12]** Burden et al. review, *Animals* / PMC — evidence and uncertainty around equid mounted load carrying. https://pmc.ncbi.nlm.nih.gov/articles/PMC8151148/
- **[S13]** Animal Diversity Web — Wild boar (*Sus scrofa*): 66–272 kg, smell/hearing/peripheral-vision context. https://animaldiversity.org/accounts/Sus_scrofa/
- **[S14]** Podgórski et al. / PubMed — GPS-tracked wild-boar dispersal from central Poland; daily movement evidence and context dependence. https://pubmed.ncbi.nlm.nih.gov/38200901/
- **[S15]** Large Carnivore Initiative for Europe — Brown bear: European male/female mass ranges and ecology. https://www.lcie.org/Largecarnivores/Brownbear.aspx
- **[S16]** Animal Diversity Web — Canis: acute smell, developed vision and vocal/chemical communication. https://animaldiversity.org/accounts/Canis/
- **[S17]** European Journal of Wildlife Research — red fox movement ecology; mean daily movement ~4.65 km in the studied wet-grassland populations. https://doi.org/10.1007/s10344-023-01759-y
- **[S18]** PeerJ / PMC — red fox movement in Trans-Himalayan landscape; demonstrates strong context dependence and much larger daily movement in another habitat. https://pmc.ncbi.nlm.nih.gov/articles/PMC9482768/
- **[S19]** Applied Animal Behaviour Science 2026 — farmed red deer daily movement ~4.28 km/day in the studied pasture context. https://www.sciencedirect.com/science/article/abs/pii/S0168159126001024
- **[S20]** *The Anatomical Record* — European rabbit vs hare locomotor specialisation; rabbit top-speed literature anchor ~56 km/h and sprint-oriented ecology. https://doi.org/10.1002/ar.70009
- **[S21]** Animal Diversity Web — Brown bear: excellent olfaction, hearing/vision context and robust physical description. https://animaldiversity.org/accounts/Ursus_arctos/
- **[S22]** Merck Veterinary Manual / NRC-derived table — 500 kg average horse reference. https://www.merckvetmanual.com/multimedia/table/estimated-minimum-daily-major-nutrient-requirements-of-growing-horses-and-ponies
- **[S23]** Barnes et al., *Equine Veterinary Journal* / PubMed — physiological monitoring of a 160 km endurance ride; evidence of trained equine endurance and recovery constraints. https://pubmed.ncbi.nlm.nih.gov/21058975/
- **[S24]** Merck Veterinary Manual — horse physical characteristics and senses: ~340° peripheral vision, movement detection, mobile ears, smell. https://www.merckvetmanual.com/horse-owners/introduction-to-horses/description-and-physical-characteristics-of-horses
- **[S25]** Merck Veterinary Manual — feeding practices in equids; donkey-specific weight estimation and 175–250 kg worked examples. https://www.merckvetmanual.com/management-and-nutrition/nutrition-horses/feeding-practices-in-horses-and-other-equids
- **[S26]** Merck Veterinary Manual — large-breed dairy cattle body-weight references ~675–740 kg across adult stages. https://www.merckvetmanual.com/management-and-nutrition/nutrition-dairy-cattle/nutritional-requirements-of-dairy-cattle
- **[S27]** *Rangeland Ecology & Management* — GPS cattle daily travel ~11–14 km/day in studied range conditions; context anchor, not universal endurance constant. https://www.sciencedirect.com/science/article/pii/S1550742417300660
- **[S28]** Merck Veterinary Manual — sheep nutrition; concrete 50 kg adult maintenance example and strong dependence on production/environment. https://www.merckvetmanual.com/management-and-nutrition/preventative-health-care-and-husbandry-of-sheep/nutrition-of-sheep
- **[S29]** Merck Veterinary Manual — dog ear structure/function; dogs detect sound better than people and hear higher frequencies; breed anatomy varies. https://www.merckvetmanual.com/dog-owners/ear-disorders-of-dogs/ear-structure-and-function-in-dogs
- **[S30]** Animal Diversity Web — Brown/Norway rat: 140–500 g, average ~400 g; smell, hearing, tactile/whisker and vibration sensing, swimming/fossorial behaviour. https://animaldiversity.org/accounts/Rattus_norvegicus/

## 11. Consistency rule

If future research provides a better empirical anchor, update **this document first**, record why the old representation was weak, then migrate consumers through focused plans. Do not patch a new species multiplier into one subsystem while leaving the shared reference stale.

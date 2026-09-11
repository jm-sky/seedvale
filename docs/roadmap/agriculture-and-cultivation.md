# Agriculture & Cultivation Roadmap

## Goal

Build agriculture as a real, autonomous source of food for the Seedvale world.

Player, NPCs, households and settlements should use the same underlying cultivation concepts rather than separate player-only and NPC-only farming systems.

The long-term flow is:

```text
seeds
  ↓
sowing / planting
  ↓
growth
  ↓
water + conditions + care
  ↓
mature crops
  ↓
harvest
  ├─→ food / produce
  └─→ seed material
          ↓
       next sowing
```

Agricultural production should feed the existing economy flow:

```text
production
  ↓
Household
  ├─→ consumption
  ├─→ seed reserve
  └─→ surplus
          ↓
   Village Storage
          ↓
consumption / exchange / trade / processing
```

Agriculture must continue to have meaningful consequences when the player is absent. Detailed simulation near important or observed situations should transition to lower-fidelity or aggregated simulation for remote settlements without creating a second economy or a second crop model.

This roadmap is directional. Current code, state documentation and implementation plans remain the source of truth for what is already implemented.

## Existing foundations and historical direction

Existing code and historical plans already establish important parts of the intended model:

- crop lifecycle is data-driven and species-specific;
- `CropDefinition` is the natural shared place for crop growth and yield semantics;
- planted crops should reuse the shared crop lifecycle rather than create a parallel growth system;
- cultivation hydration/stress is intended to influence final yield;
- Farmer work should use existing NPC action, household, crop and economy mechanisms;
- household production should eventually participate in the same settlement storage, consumption and trade flows as other goods.

Relevant historical/design documents include:

- `docs/plans/archive/2026-08-20--172--natural-crop-lifecycle.md`;
- `docs/plans/implementation-notes/2026-08-16--126--seed-planting-implementation-notes.md`;
- `docs/plans/settlements-npcs-001-cultivation-hydration-and-watering.md`;
- `docs/roadmap/economy-production.md`;
- `docs/roadmap/npc-professions-households-and-age.md`.

Do not duplicate mechanisms already established by those systems. Before each implementation phase, verify the current code because historical plans may describe direction that has since changed.

## Core semantic rules

### Seed item is a sowing unit

A `seed_*` inventory item should not be interpreted as one literal biological seed.

It represents a **portion / handful of seed material** sufficient for one logical sowing operation.

Therefore:

```text
seed_carrot ×1
→ many carrot plants

seed_cabbage ×1
→ several cabbage plants

tree seed ×1
→ one tree, where appropriate for that species
```

The species determines how many logical plants a seed unit establishes and how much produce those plants can eventually yield.

This distinction is important both for believable production and for performance.

### CropPlacement is a logical planting unit

`CropPlacement` should represent a logical unit of sowing/planting, not necessarily one biological plant.

Depending on species, one placement may correspond to:

- one individual plant or tree;
- several larger plants;
- a larger group of small crop plants.

The logical plant count does not need to equal the runtime entity count.

For example:

```text
1 CropPlacement
→ 12 logical carrot plants
→ potentially 12 visual instances
→ one logical lifecycle / simulation record
```

Do not create an independently simulated runtime entity for every carrot, grain stalk or similar small plant unless gameplay actually requires it.

### Species-driven cultivation

Crop behaviour should remain data-driven. The shared crop definition is the natural source of truth for species-specific semantics.

Over time a crop definition may describe concepts such as:

- growth duration;
- mature/harvest window;
- logical plants per seed unit;
- base yield;
- seed recovery;
- crop spacing or visual density;
- annual/perennial lifecycle;
- self-seeding capability;
- water requirements;
- drought tolerance;
- future seasonal/environment suitability.

Not all of these need to be implemented at once. Add them when a roadmap phase actually requires them rather than expanding the schema speculatively.

## Phase 1 — Non-Home Settlement Food Production v1

### Goal

Quickly solve the visible world problem that **settlements other than the home settlement can have agricultural fields but do not meaningfully produce food from them**.

This is intentionally a simple first version. It should make foreign settlements agriculturally alive before the broader cultivation model is completed.

Target flow:

```text
non-home settlement
→ farmer / agricultural capacity
→ seed stock
→ crops / field production
→ food
→ household / existing settlement economy flow
→ enough seed material for continued production
```

Requirements:

- applies specifically to settlements other than the home settlement;
- reuse existing crop lifecycle, Farmer work, household and economy mechanisms where practical;
- agricultural households receive or otherwise have access to a deterministic initial seed reserve;
- fields become meaningful agricultural production rather than purely decorative scenery;
- production creates real food/produce that enters existing household/settlement resource ownership;
- seed consumption and recovery allow production to continue instead of requiring magical repeated reseeding;
- production must continue meaningfully when the player is not present;
- keep the first version bounded and simple enough to deliver quickly.

Phase 1 does **not** require the complete future agriculture model. In particular, it does not need to solve all of:

- detailed hydration simulation;
- seasonal suitability;
- perennial crops;
- self-seeding;
- advanced crop stress;
- detailed simulation of every remote crop;
- a complete processing chain such as grain → flour → bread;
- a broad redesign of home-settlement/player cultivation.

The implementation plan for this phase must recon the current code first and choose the smallest extension of existing systems that satisfies these requirements.

## Phase 2 — Species-Driven Sowing, Density and Yield

Make the seed-unit semantics explicit in the shared cultivation model.

A seed unit establishes a species-defined quantity/density of plants. Yield must derive from the crop species and its logical planting rather than the accidental rule:

```text
1 inventory seed item
= 1 runtime plant
= 1 food item
```

The model should support differences such as:

```text
carrot seed unit
→ many small plants
→ corresponding carrot harvest

cabbage seed unit
→ fewer large plants
→ corresponding cabbage harvest

tree seed
→ one tree
```

Prefer one logical placement with batched/instanced visual plants where possible.

Species-specific growth duration and base yield should use the existing shared crop-definition direction rather than profession-specific constants.

## Phase 3 — Seed Recovery and Sustainable Cultivation

Complete the renewable cultivation loop:

```text
seed reserve
→ sow
→ grow
→ harvest
→ produce + recoverable seed material
→ reserve next sowing
→ surplus
```

A healthy agricultural household should normally be able to preserve enough seed material for future production and may generate a limited seed surplus.

Poor conditions, crop failure or consumption/trade decisions may eventually reduce the reserve and create a real seed shortage.

Seed shortage should be able to become a world/economic problem rather than being silently repaired by infinite seed generation.

Do not create a separate Farmer inventory or seed economy if existing household/item/storage mechanisms can own the state.

## Phase 4 — Hydration, Care and Yield Condition

Connect cultivation yield to environmental conditions and care, following the existing cultivation hydration direction.

Conceptually:

```text
species base yield
        ↓
soil / crop hydration
        ↓
stress / neglect
        ↓
final harvest
```

Rain, watering and existing world weather should influence cultivation through shared world/cultivation state rather than arbitrary Farmer-only modifiers.

Initial implementation can remain relatively simple, but the model should support consequences such as prolonged drought reducing yield and severe dehydration killing crops.

## Phase 5 — Perennial Crops and Regrowth

Support species whose lifecycle does not end with one harvest.

Conceptually:

```text
plant
→ growth
→ mature
→ harvest
→ regrowth
→ mature
→ harvest
→ ...
```

Potential future uses include:

- berry bushes;
- fruit trees;
- herbs;
- other perennial cultivated or wild plants.

Perennial behaviour should be a lifecycle/species capability, not a separate `PerennialPlantSystem`.

The same lifecycle infrastructure should remain usable by player cultivation, NPC farming and natural vegetation where their semantics overlap.

## Phase 6 — Self-Seeding and Natural Reproduction

Some species may reproduce without explicit planting by a player or NPC.

Conceptually:

```text
mature / unharvested plant
→ seed release
→ suitable nearby ground
→ new growth
```

This feature requires strict performance and population controls.

Self-seeding should be:

- deterministic where practical;
- spatially bounded;
- frequency bounded;
- density capped;
- resolved lazily or through coarse events rather than per-frame scanning;
- dependent on suitable habitat/ground where existing world mechanisms support it.

Never allow unchecked exponential growth in `CropPlacement` count.

Potential controls include:

- maximum local density;
- reproduction radius;
- reproduction interval;
- available-space checks;
- deterministic candidate generation;
- aggregation for remote/unimportant vegetation.

## Phase 7 — Hybrid / Off-Screen Cultivation

Agriculture must preserve continuity across simulation fidelity levels.

### Detailed / loaded

When a settlement or cultivation area is important enough for detailed simulation:

```text
NPC actions
→ physical cultivation area
→ visible crop placements
→ growth / harvest
→ physical resource consequences
```

### Aggregated / remote

When a settlement is remote or unloaded:

```text
persistent cultivation state
+ elapsed world time
+ crop definitions
+ available labour/resources
→ deterministic/coarse production resolution
→ household / settlement stock changes
```

Do not simulate off-screen walking, watering animations or thousands of individual crop entities merely to calculate production.

Detailed and aggregated modes must share the same fundamental semantics for:

- species;
- growth time;
- yield;
- seed requirements/recovery;
- cultivation capacity;
- meaningful environmental modifiers.

Switching simulation fidelity must not duplicate crops, reset seed reserves or create free food.

## Phase 8 — Agriculture ↔ Economy and World Pressures

Agriculture should increasingly participate in the wider settlement economy.

Target flow:

```text
farm production
→ Household
→ consumption + seed reserve
→ surplus
→ Village Storage
→ local exchange / processing / trade
```

This enables persistent consequences such as:

```text
good harvest
→ food surplus
→ storage / trade
→ wealth / settlement growth
```

and:

```text
drought / failed harvest
→ food shortage
→ household and settlement pressure
→ higher demand / imports
→ decisions / trade / quests / migration / conflict
```

Agriculture should therefore become one input into the existing needs/problems/pressures/decision systems rather than a scripted quest generator.

Future processing chains may include grain/flour/bread, preservation and other food production, but should build on the general production/economy roadmap instead of becoming agriculture-specific parallel crafting systems.

## Player and NPC integration

Avoid separate conceptual systems such as:

```text
Player Farming
NPC Farming
Remote Settlement Farming
```

Prefer:

```text
              Cultivation semantics
               /       |        \
          Player      NPC      aggregate simulation
```

Player and NPC actions may differ in control/decision logic, but should operate on the same crop definitions, seed items, cultivation areas, lifecycle and harvest semantics where practical.

## Gardens and fields

Gardens and fields are different scales/forms of cultivation, not separate crop systems.

Both should be able to reuse a common cultivation-area/anchor contract for:

- sowing capacity;
- crop placement;
- growth;
- hydration/care;
- harvesting.

They may differ in size, capacity, visual layout, typical species and labour requirements.

Visual assets such as a farm/field GLB must not become authoritative simulation state. They should represent an underlying real cultivation area or settlement plan data.

## Performance principles

Agriculture can eventually represent very large numbers of biological plants across the world. Performance constraints therefore belong in the design from the beginning.

Prefer:

- logical plant counts separate from runtime entity counts;
- one `CropPlacement` representing multiple small plants where appropriate;
- instancing/batching for repeated plant visuals;
- lazy lifecycle resolution rather than per-frame crop ticking;
- no per-plant AI;
- bounded cultivation capacity;
- capped and lazy self-seeding;
- aggregated remote production;
- sparse persistence;
- deterministic reconstruction of state that does not need to be stored;
- lower simulation frequency/fidelity for remote and low-impact cultivation.

Avoid:

- one heavyweight entity/object per carrot, grain stalk or similar small plant;
- scanning all world crops every frame;
- simulating detailed Farmer movement in unloaded settlements;
- duplicating crop state between visual, household, settlement and economy systems;
- adding Workers unless measured CPU cost and independent work justify communication overhead.

A useful invariant is:

```text
logical biological plant count
≠ runtime simulation entity count
≠ rendered draw-call count
```

The world may contain many plants without requiring equally many independently updated objects.

## Long-term direction

The completed system should allow agriculture to emerge from the same world simulation as other production:

```text
land + seeds + labour + water + weather
→ cultivation
→ crops
→ harvest
→ food + seed reserve
→ household
→ settlement economy
→ surplus / shortage
→ trade / decisions / history
```

The player may participate in this chain, help it, disrupt it or depend on it, but should not be required for it to function.

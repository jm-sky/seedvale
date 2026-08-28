
# Textiles & Herbal Medicine Roadmap

## Goal

Build a small, interconnected production chain around sheep, flax, textiles and herbal medicine.

The first scope should remain intentionally simple: a few broad professions, clear resource flows and real products. Intermediate processing stages such as spinning and thread are documented as future detail rather than required MVP items.

Clay and ceramic production are intentionally outside this roadmap item and should be planned separately.

## Time & Seasons

The world should use a 12-month calendar:

~~~~
1 year       = 48 world-days
1 month      = 4 world-days
1 season     = 12 world-days
4 seasons    = 48 world-days
~~~~

~~~~
Spring = months 1–3 = days 0–11
Summer = months 4–6 = days 12–23
Autumn = months 7–9 = days 24–35
Winter = months 10–12 = days 36–47
~~~~

The current climate implementation uses 7 days per season, so this roadmap direction requires the season/calendar constants to be aligned with the 48-day year before systems depending on the seasonal calendar are built.

## Phase 1 — Sheep & Wool

### Sheep wool cycle

Each sheep has a simple deterministic wool-growth cycle.

~~~~
Sheep
 ↓
wool growth
 ↓
ready for shearing
 ↓
shearing
 ↓
4 × wool
 ↓
growth resets
 ↓
wool growth
~~~~

The sheep is sheared **twice per year**.

With a 48-day year:

~~~~
48 / 2 = 24 days
~~~~

Therefore one wool-growth cycle is **24 world-days**.

Initial production:

~~~~
1 sheep
 ↓
4 wool per shearing
 ↓
2 shearings per year
 ↓
8 wool per year
~~~~

For the economic model:

~~~~
1 wool unit ≈ 1 kg of raw wool
~~~~

This is an economic/game unit, not a requirement to simulate physical mass.

The initial model should not vary wool production by breed, age, health, nutrition or season.

### Shearing

Shearing is an NPC action performed by the shepherd.

It:
- requires an appropriate tool,
- produces 4 wool units,
- resets the sheep's wool-growth progress.

Wool must not be generated automatically merely because the cycle elapsed; the sheep becomes ready and the shepherd must perform the action.

### Shepherd

Add a broad **Shepherd** profession.

Core responsibilities:
- herd sheep,
- take sheep to pasture,
- keep the flock together,
- return the flock to its enclosure,
- respond to threats,
- defend sheep from predators,
- shear sheep ready for shearing.

The profession should reuse existing fauna, NPC decision/action, navigation, combat and livestock mechanisms where available.

A predator encounter should be a real world interaction:

~~~~
predator
 ↓
flock threatened
 ↓
shepherd reacts
 ↓
defence / escape / possible animal loss
 ↓
economic consequence
~~~~

## Phase 2 — Flax & Textiles

### Flax

Flax should use the existing farming/crop system.

~~~~
field
 ↓
farmer
 ↓
flax
 ↓
processing
 ↓
linen material
~~~~

No new farming profession is required.

The first implementation may skip separate items for:
- flax fibre,
- thread,
- yarn.

The detailed future chain is:

~~~~
flax
 ↓
flax fibre
 ↓
thread / yarn
 ↓
linen cloth
~~~~

### Wool

For the first implementation, wool may be converted directly into a textile material:

~~~~
wool
 ↓
processing
 ↓
wool material
~~~~

The detailed future chain is:

~~~~
wool
 ↓
yarn
 ↓
wool cloth
~~~~

### Future reference conversion

Use real-world textile production as a reference for the eventual detailed model:

~~~~
1 kg wool
 → ~200 units of yarn
~~~~

with:

~~~~
1 yarn unit = 100 m
~~~~

giving approximately:

~~~~
1 kg wool
 → 20,000 m yarn
 → ~3 m² wool cloth
~~~~

The ~3 m² figure assumes approximately 300 g/m² fabric and is a rounded game-design reference, not an MVP recipe.

### Textile worker

Add one broad profession, **Textile Worker / Weaver**, rather than separate professions for every processing stage.

The profession should be able to process both:

~~~~
wool → wool material
flax → linen material
~~~~

Future specialization may split spinning and weaving only if the simulation benefits from it.

## Phase 3 — Bandages

Add item:

~~~~
bandage
~~~~

A bandage is a basic textile medical product.

Initial recipe:

~~~~
linen material
 ↓
bandage
~~~~

Linen is preferred for bandages. Wool is not used for the initial bandage recipe.

Do not create a separate bandage-making profession.

## Phase 4 — Herbs & Dressings

### Herbal products

The herbal production chain should provide two explicit products:

~~~~
medicinal herbs
poisonous herbs
~~~~

The exact future uses of poisonous herbs can be designed separately.

### Herbalist

Add a broad **Herbalist** profession.

Core responsibilities:
- gather/process herbs using the existing plant/resource mechanisms,
- produce medicinal herbs,
- produce poisonous herbs,
- prepare dressings.

Do not create a separate profession for each herbal processing stage.

### Dressing

Add item:

~~~~
dressing
~~~~

A dressing is a medical product combining a bandage with medicinal herbs:

~~~~
bandage
   +
medicinal herbs
   ↓
dressing
~~~~

The dressing is a distinct item rather than a state/variant of the bandage.

This creates a clear progression:

~~~~
flax
 ↓
linen material
 ↓
bandage
 +
medicinal herbs
 ↓
dressing
~~~~

## Professions

Initial scope should introduce only broad specializations:

| Profession | Main responsibility |
|---|---|
| **Shepherd** | sheep, grazing, protection, shearing |
| **Textile Worker / Weaver** | wool and flax textile processing |
| **Herbalist** | medicinal/poisonous herbs and dressings |
| **Farmer** | already existing; can grow flax |

Do not introduce separate professions for spinning, thread production, bandage production or individual herbal processing stages in the first version.

## MVP Product Flows

### Wool

~~~~
sheep
 ↓
24-day wool growth
 ↓
shearing
 ↓
4 wool
 ↓
textile worker
 ↓
wool material
~~~~

### Flax

~~~~
field
 ↓
farmer
 ↓
flax
 ↓
textile worker
 ↓
linen material
 ↓
bandage
~~~~

### Herbs

~~~~
herbs
 ↓
herbalist
 ├─→ medicinal herbs
 └─→ poisonous herbs
~~~~

### Dressing

~~~~
bandage
 +
medicinal herbs
 ↓
herbalist
 ↓
dressing
~~~~

## Economic Integration

The new chains should use the existing economy and production architecture:

~~~~
world resources / animals / crops
 ↓
NPC work
 ↓
production
 ↓
inventory / storage
 ↓
household / settlement demand
 ↓
consumption / trade
~~~~

The chains should create real demand and shortages.

Examples:

~~~~
more sheep
 ↓
more wool
 ↓
more textile production
~~~~

~~~~
more flax
 ↓
more linen material
 ↓
more bandages
 ↓
better availability of medical supplies
~~~~

~~~~
medicinal herbs shortage
 ↓
fewer dressings
 ↓
medical supply pressure
~~~~

The systems must continue operating autonomously without the player.

## Future Extensions

Possible later additions, using the same chains:
- spinning as a separate production stage,
- yarn/thread as explicit items,
- cloth quality,
- seasonal or nutritional effects on wool growth,
- sheep breeds with different wool yields,
- more textile products,
- additional medicinal products,
- meaningful uses for poisonous herbs,
- deeper herbalism,
- specialist textile professions.

These are deliberately outside the initial implementation scope.

## Design Principles

- Reuse existing livestock, crop, resource, item, production and NPC work systems.
- Prefer broad professions over narrowly scripted jobs.
- Keep resource transformations explicit and deterministic.
- Make production depend on real world resources and NPC actions.
- Avoid parallel profession/economy systems.
- Preserve off-screen simulation and time-skip continuity.
- Keep the player outside the core production logic; the world must function without the player.

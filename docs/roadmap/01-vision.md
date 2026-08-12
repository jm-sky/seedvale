# Seedvale — Vision & Desired World

**Session:** 1 — Vision & Desired World  
**Status:** `accepted`  
**Date:** 2026-08-12

## Core vision

Seedvale is a living sandbox world in which NPCs, animals, settlements, resources and the player participate in the same interconnected simulation.

The world should continue to evolve independently of the player. The player is an active participant — initially a newcomer/settler — who can become significant through actions and relationships, but is not the center or controller of the simulation.

The simulation should be deep enough to produce emergent outcomes, while using adaptive/hybrid simulation where necessary for CPU performance.

## NPCs

The long-term target is between a rich life simulation and a deeper autonomous simulation. Development should progress incrementally from the current needs/behavior foundations toward increasingly autonomous inhabitants.

NPCs should eventually have:

- needs and daily routines,
- work, rest, food, water and sleep,
- personality and traits,
- relationships,
- families,
- professions and social roles,
- long-term personal development,
- a full lifecycle: birth → childhood → adulthood → aging → death.

NPCs must continue living when the player is elsewhere. The simulation may use different levels of detail depending on relevance/distance, but the world should not simply stop outside the player's view.

## Animals and ecosystem

The animal world should eventually form a real ecosystem rather than a collection of independent agents.

Target capabilities include:

- predator/prey relationships,
- hunger and survival,
- lifecycle and population dynamics,
- reproduction,
- migration,
- seasonal behavior,
- food availability and ecological dependencies,
- consequences of hunting and other human activity.

Domestic animals belong to the same coherent simulation model as wildlife. Husbandry should connect animals with NPCs, households, resources, food, reproduction and products.

Ecological consequences should be real and potentially severe. The world may nevertheless have stabilizing/recovery mechanisms so that a single event does not irreversibly destroy an ecosystem.

## Settlements

Settlements are dynamic organisms rather than static generated locations.

A settlement may:

- grow,
- change its structure,
- develop new homes and roles,
- specialize,
- cooperate with other settlements,
- experience shortages and crises,
- decline,
- disappear,
- and potentially emerge again elsewhere.

The main drivers of settlement development are **population and available resources**. Economy, infrastructure and production are important mechanisms within that process rather than isolated progression systems.

Settlement specialization should emerge primarily from local environment, available resources and inhabitants rather than being only a fixed type assigned at generation time.

Examples include farming, fishing, forestry, livestock and mining, but the final set of specializations is not fixed by this document.

## Economy and resources

The target is a local-to-regional economy:

```text
resources
  → work / production
  → goods
  → storage / consumption
  → surplus / shortage
  → trade
  → population and settlement development
```

The economy should eventually include:

- gathering and natural resources,
- farming, hunting, fishing and livestock,
- production and crafting,
- storage,
- consumption,
- professions,
- surpluses and shortages,
- trade between settlements,
- specialization,
- increasingly complex production chains.

Goods should physically move through the world when appropriate. Transport is part of the simulation rather than merely an abstract number transfer.

## Relations between settlements

The default regional relationship should lean toward **cooperation and economic interdependence**, not constant conflict.

Settlements should be able to:

- trade,
- exchange goods,
- depend on each other's production,
- cooperate,
- exchange/move people,
- attract or lose population,
- develop complementary specializations.

Migration is a normal part of the world, including movement caused by opportunities, shortages and family/social circumstances.

Conflict is not currently a foundational requirement of the regional simulation.

## Player

The player begins as a newcomer/settler and can become an important actor in the world.

The player should be able to participate directly in existing systems, including activities such as:

- gathering resources,
- hunting,
- farming,
- animal husbandry,
- building,
- trading,
- helping NPCs,
- performing work,
- influencing settlement development.

Player actions must use the same underlying world systems rather than parallel player-only mechanics whenever practical.

The player can positively or negatively affect the world. Examples include over-hunting wildlife, consuming scarce resources, helping a settlement, or contributing to production.

The player can become significant, but the world must remain capable of functioning without them.

## Long-term world evolution

The world should support long time horizons and visible generational change:

```text
family
  → children
  → adulthood
  → new families
  → new homes
  → population growth
  → settlement growth
  → migration / specialization
  → new generations
```

Similarly, ecosystems and economies should evolve over time rather than resetting around the player.

## Simulation fidelity

The desired default is a **hybrid simulation**.

Near and important entities can receive detailed simulation, while distant or less important parts of the world can use aggregated or lower-frequency simulation to control CPU cost.

This is a performance strategy, not a design compromise: the world should preserve meaningful continuity even when simulation detail changes.

## Realism vs gameplay

The project leans toward **simulation-first, with pragmatic safeguards**.

Emergent and sometimes harsh outcomes are desirable when they make the world credible. However, systems may include recovery/stabilization mechanisms where otherwise small stochastic events could permanently destroy the world or produce poor gameplay.

The goal is not perfect realism. The goal is a world whose outcomes are understandable as consequences of its interconnected systems.

## Core principle

The strongest desired form of Seedvale is:

> **A world that can continue living, changing and developing without the player, while allowing the player to participate in — and meaningfully influence — the same systems.**

The roadmap should therefore favor interconnected systems and emergent behavior over isolated features.

## Session 1 decisions

| Area | Accepted direction |
|---|---|
| NPC depth | B → C over time; start from existing A/B foundations |
| NPC lifecycle | Full lifecycle |
| NPC autonomy | Yes; hybrid simulation allowed for performance |
| Wildlife | Full ecosystem / population dynamics |
| Domestic animals | Same coherent animal/world simulation |
| Ecological consequences | Real, with recovery/stabilization mechanisms |
| Settlements | Dynamic organisms; can grow, decline and disappear |
| Settlement specialization | Emergent from population + resources + environment |
| Economy | B/C: local + regional, increasingly complex |
| Goods transport | Physical movement through the world |
| Inter-settlement relations | Cooperation, trade, migration and dependencies |
| Player role | Newcomer/settler who can become significant |
| Player influence | Direct and consequential |
| Long-term simulation | Generational / multi-year evolution |
| Off-screen simulation | Hybrid / adaptive |
| Realism vs gameplay | A/B: simulation-first with safeguards |

## Open questions intentionally deferred

These are not decisions for Session 1 and should be resolved later when designing systems and dependencies:

- exact economic model and production-chain depth,
- exact lifecycle mechanics and demographic rules,
- exact population/ecosystem stabilization mechanisms,
- how settlement destruction/recreation works,
- exact hybrid simulation tiers and scheduling,
- regional world scale and number of settlements,
- exact player progression and ownership model,
- whether and how conflict becomes a later regional system.

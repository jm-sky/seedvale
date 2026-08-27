# NPC Vision

**Status:** target vision

## Purpose

NPCs should behave as inhabitants whose needs, goals, relationships, work and circumstances produce autonomous behaviour and persistent consequences.

This document is the **index for the NPC domain**. Detailed models belong in focused documents below.

## Core vision

- NPCs are inhabitants, not quest dispensers.
- Needs, problems, goals and pressures remain distinct concepts.
- Decisions select strategies and actions from explicit world state.
- Personality, abilities, relationships and life circumstances modify decisions.
- Work, routines, households and social roles are connected rather than scripted independently.
- NPCs use real world resources and places to satisfy needs.
- NPC actions change settlements, economy, relationships and the environment.
- NPCs can continue meaningful activity without the player being present.
- Dialogue and quests reflect actual NPC and world state.

## Profession and age

NPCs may have a **profession** regardless of age. Profession describes the NPC's main contribution to the household and settlement economy; it does not define every activity the NPC may perform.

Age determines how strongly and in what way an NPC participates in their profession.

### Professions

The current target profession set is:

- **Farmer** — farming, crops, gardens and care of household livestock. Farming and livestock care are one profession; there is no separate Herder profession.
- **Woodcutter** — cutting and obtaining wood.
- **Fisher** — fishing.
- **Trader** — running settlement trade, mainly staying at the trading place and helping others when not trading.
- **Guard** — settlement patrol, defence, responding to danger, helping others, lighting fires and torches, and night patrol with a torch.
- **Miner** — digging and extracting resources. Future work may include wells and earthworks/terrain levelling.
- **Blacksmith** — sharpening weapons, producing metal goods, selling metal goods, and buying ore and coal. The household also needs wood and water, which may be supplied by family members or obtained from other residents.
- **Healer / Herbalist** — reserved for a future plan covering herbs, wild berries, mushrooms and similar natural resources, bandages and simple medicines/healing.
- **Hunter** — defined separately by the Hunter Profession & Household plan.

Profession is the main occupation, not an exclusive action whitelist. NPCs may help other inhabitants and perform ordinary social or leisure activities.

NPCs of different professions may use planned **social places** during free time. They may also occasionally perform unrelated activities, such as fishing.

### Age and work participation

Age changes the intensity and scope of professional work:

| Life stage | Professional activity |
|---|---|
| **Small child** | No professional work; mainly play and move around the settlement. |
| **Older child** | Helps parents and learns the family profession; approximately 1/4–1/2 of the parent's work time. |
| **Adult** | Normal professional activity; approximately full participation. |
| **Old** | Works almost normally, but spends more time walking, resting and fishing. |
| **Very old** | Mostly walking, fishing and light occasional help. |

Children may inherit a parent's profession. Inheritance represents the profession they are growing into; age still limits the work they can perform.

### Household contribution

A profession may describe the main work of a **household**, not only the actions personally performed by one adult NPC. Family members can cooperate to provide inputs and complete supporting work.

For example, a Blacksmith household may obtain wood and water through other family members or from another resident, while the Blacksmith concentrates on metal work and trade.

This keeps professions compatible with household simulation and avoids creating separate AI systems for every supporting task.

## Settlement profession generation

Profession assignment is also part of settlement generation. Settlement size and local environment should influence which professions are generated and in what numbers.

Small settlements should have sufficient minimum population to support their essential professions rather than relying entirely on random generation. Lower population limits may therefore need to be increased to guarantee basic roles are represented.

Not every profession must exist in every settlement. Local conditions can increase demand for particular professions, for example:

```text
river / lake     → Fisher demand
forest           → Woodcutter demand
resource deposits → Miner demand
large settlement → more specialists and redundancy
```

Profession generation should eventually distinguish between minimum staffing, target population and surplus. Missing professions can become settlement problems or pressures rather than being silently ignored.

## NPC domain documents

### AI, decisions and planning

- [`npc-ai.md`](./npc-ai.md) — decision model, Needs → Pressures → Decision → Strategy → Plan → Actions, Big Five influence, interruptions, unfinished work and deterministic planning.

### Physical state

- [`npc-physical-state.md`](./npc-physical-state.md) — planned model for HP, stamina, vigor and physical differences across age/sex, including future physical capabilities such as strength and agility.

### Current implementation

- [`../roadmap/archive/00-current-state.md`](../roadmap/archive/00-current-state.md) — current implementation state and implemented NPC systems.

## Domain boundaries

NPC simulation remains deterministic and authoritative. Dialogue or future LLM assistance must not replace simulation state or decision systems.

The player participates in the same world systems rather than receiving player-only versions of NPC systems.

## Future evolution

The NPC domain should evolve toward stronger connections between:

```text
world
  → needs / problems / opportunities
  → pressures
  → decisions / strategies / plans
  → actions
  → world changes
  → events / history / relationships
  → new pressures
```

Detailed implementation work belongs in implementation plans and the roadmap; this document should remain a stable navigation point for NPC vision.

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

## NPC domain documents

### AI, decisions and planning

- [`npc-ai.md`](./npc-ai.md) — decision model, Needs → Pressures → Decision → Strategy → Plan → Actions, Big Five influence, interruptions, unfinished work and deterministic planning.

### Physical state

- [`npc-physical-state.md`](./npc-physical-state.md) — planned model for HP, stamina, vigor and physical differences across age/sex.

### Current implementation

- [`../roadmap/00-current-state.md`](../roadmap/00-current-state.md) — current implementation state and implemented NPC systems.

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

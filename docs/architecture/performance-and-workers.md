# Performance & Simulation Architecture

## Purpose

Seedvale is a persistent, procedural world with potentially large numbers of NPCs, animals, trees, resources and other simulated entities. Performance must therefore be treated as an architectural concern, not as a later optimization pass.

## Core principle

> **Keep the main thread responsive. Use workers and batching when they reduce main-thread work, but do not move work to a worker automatically.**

The goal is not "use workers everywhere". The goal is to keep rendering, input and immediate gameplay responsive while allowing the simulated world to scale.

## Simulation vs presentation

Prefer a separation between world data and its Three.js representation:

```text
simulation state
      ↓
batched / event-driven evaluation
      ↓
changed state
      ↓
main thread
      ↓
Three.js presentation
```

Workers should operate on serializable data and pure calculations. They should not own Three.js objects.

## Main thread

Keep the main thread primarily responsible for:

- rendering,
- input and immediate player interaction,
- visible Three.js objects,
- creating/updating/removing presentation objects,
- small local operations where worker overhead would cost more than the calculation.

Avoid large world-wide simulation passes on the main thread.

## Workers

Workers are appropriate candidates for CPU-heavy, data-oriented and batchable work such as:

- procedural terrain/chunk generation,
- evaluating large batches of NPC or animal state,
- tree/vegetation growth calculations,
- resource regeneration,
- spatial/environment calculations,
- simulation of distant or unloaded world regions.

Seedvale already uses workers for terrain/chunk generation. New systems should reuse that architectural direction where appropriate instead of introducing an unrelated worker framework.

## Batch and event-driven updates

Do not update every simulated entity every frame unless the behaviour genuinely requires frame-rate resolution.

Prefer:

- world simulation ticks,
- batched evaluation,
- event-driven recalculation,
- updates when relevant environmental state changes,
- recalculation on chunk load/unload,
- lazy evaluation from timestamps where possible.

For example, a tree does not need `update()` every frame to determine its growth stage. Its state can be evaluated from its stored state, world time and environment when necessary.

## Chunk locality

World simulation should be as local as possible.

If a calculation depends on nearby entities, prefer:

- chunk-local data,
- neighbouring chunk data,
- spatial indexes/lookups,
- cached environmental values,
- precomputed aggregate values.

Avoid scanning the entire world to answer a local question.

## Streaming and distant simulation

An unloaded chunk does not need active Three.js objects.

Persistent simulation state should be representable as data that can be:

1. stored,
2. evaluated while the chunk is unloaded when necessary,
3. reconstructed when the chunk streams back in.

This is especially important for future systems such as tree growth, crops, resources, NPC activity and village economy.

## Worker trade-offs

Before moving work to a worker, consider:

- computation cost,
- number of entities processed,
- frequency of the calculation,
- structured-clone/serialization cost,
- transfer cost,
- synchronization complexity,
- whether the result must be available immediately.

A small calculation performed occasionally on the main thread can be better than a worker round-trip.

## Architecture rule for new systems

Before adding a recurring simulation/update loop, ask:

1. Does this need frame-rate resolution?
2. Can it be event-driven?
3. Can it be evaluated lazily from timestamps/state?
4. Can it be batched?
5. Can the expensive part run in an existing worker pipeline?
6. Can the data be represented without Three.js objects?

Prefer the smallest architecture that keeps the main thread responsive and scales with world size.

## Related systems

This principle applies particularly to:

- terrain and chunk generation,
- vegetation and tree lifecycle,
- NPC simulation / General Intelligence,
- fauna,
- resources and economy,
- village simulation,
- future large-world streaming.

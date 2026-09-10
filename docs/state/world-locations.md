# Seedvale — World Locations & Discovery

**Purpose:** current-state reference for the world-location catalog, discovery/knowledge state, and map projection — a real, save-persisted subsystem that has no other canonical home.

**Not:** a second terrain-generation reference ([terrain-and-world-generation.md](./terrain-and-world-generation.md) owns the actual sampling/heightmap/biome machinery this domain consumes), UI implementation detail (the map screen's rendering is out of scope unless it changes ownership), or a plan/changelog.

**Last verified:** 2026-09-10

When this file and the code disagree, the code wins — update this file.

---

## Ownership

A **location** (lake, mountain peak, cemetery, and similar coarse world features) is classified from deterministic terrain sampling, not authored data — the same continental/floor/height/mountain-ridge sampling surface terrain generation and settlement siting already use. Location *identity, position, name, and weight* are always a pure function of `(world seed, location id)` and are never persisted — only a player's *knowledge of* a location is.

Two layers exist, deliberately separate:

- **The location catalog** — coarse classification of the world into location candidates, independent of chunk streaming (a player doesn't need to have visited a chunk for a location within it to be classified).
- **Discovery/knowledge/navigation** — the player-facing progression layer: which cells/locations have been discovered, and which locations are currently active navigation targets. This is real, save-persisted state, structurally distinct from the catalog's deterministic geometry.
- **Map projection** — a pure rendering/coordinate transform over the catalog and discovery state, not a third source of truth.

This split mirrors the domain's own persistence boundary: geometry is deterministic reconstruction, knowledge is persisted authoritative — see [Boundaries](#boundaries) and [persistence.md](./persistence.md).

## Runtime flows

```text
world generation (terrain sampling: continentalness / floor height /
  height / mountain-ridge classification)
→ location catalog: coarse classification into candidate locations
  (lake / mountain-peak / cemetery / similar), independent of chunk streaming
→ player/world discovery: a discovered cell or location is recorded
→ navigation targets: an active target is tracked as the player travels
→ map projection: catalog + discovery state rendered into map/UI coordinates
→ persisted discovery/state (SaveData.map — cells/locations/targets),
  never the location's own geometry
```

The persistent worldgen cache's one current namespace exists for exactly this catalog's coarse classification step — a `(seed, namespace, version, fingerprint)` keyed cache of the classification result, disposable and never a correctness dependency (a miss just re-runs the classification). See [persistence.md](./persistence.md#worldgen-cache) for the general mechanism; this is its only current consumer.

## Boundaries

- **Terrain generation:** this domain is a *consumer* of terrain's sampling surface, never a second implementation of it. Terrain owns the heightmap/biome/river/mountain-ridge answers; this domain only classifies coarse world tiles from those answers for siting purposes (lake/mountain-peak/cemetery-type discovery). See [terrain-and-world-generation.md](./terrain-and-world-generation.md).
- **Settlements:** settlements are generated and sited independently, through their own terrain-sampling consumption (see [settlements.md](./settlements.md)); this domain does not participate in settlement siting. Settlement cemeteries are still this domain's WorldLocation kind, but the catalog looks them up through terrain's canonical assignment (`cemeteryForSettlement` → `ChunkManager.resolveCemeteryForSettlement`) rather than nearest-landmark search. Abandoned wilderness cemeteries are enumerated by a bounded chunk probe, not by walking settlements.
- **Map/UI:** map rendering consumes this domain's discovery/knowledge state and the catalog's classification output, but owns no state of its own beyond presentation — UI implementation detail is out of this document's scope.
- **Quests:** where a quest references a landmark, it does so through an injected resolver function (the same "quest never imports concrete domain classes" pattern quests use for fauna targets) rather than a direct dependency — see [npc.md](./npc.md)'s Relationships, social, and dialogue section for the resolver convention.
- **Persistence:** discovery/knowledge/target state persists as part of `SaveData.map`; location geometry itself is never persisted, always re-derived from `(world seed, location id)`. See [persistence.md](./persistence.md).

## Limitations

- This domain is not covered by its own dedicated audit pass to the same depth as settlements/NPC/fauna — treat the scope above as the ownership boundary, and verify specific mechanics against source before relying on implementation detail beyond what's stated here.
- The persistent worldgen cache's versioning discipline (bump the namespace version/fingerprint when generation rules change) currently applies to this domain's one namespace only — core terrain/hydrology generation has no persistent cache of its own kind to keep in sync.

## Entry points

```text
src/world/locations/
src/world/map/
src/persistence/worldgenCacheDb.ts
```

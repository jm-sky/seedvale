# Plan: Systemic treasure sites and keys

**Created:** 2026-09-11  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** none  
**Domain:** `world`  
**Subdomains:** `places` `resources` `simulation`  
**Tags:** `treasure` `containers` `keys` `landmarks` `caves`  
**Roadmap:** -

## Goal

Add deterministic treasure sites that exist as finite world resources independently of quests.

```text
world seed + world places
→ TreasureSiteDefinition
→ real world chest
→ specific matching key
→ nearby key placement
→ persistent world mutations
```

A treasure site can use a production cave, deep forest or existing ruins. The matching key is placed within a bounded nearby area and can be buried through the existing Hidden Finds / ordinary shovel path or physically abandoned at an existing world place.

This plan does **not** own treasure loot balance, forced entry, traps or gem expansion. Those belong to follow-up `items-player-026`.

## 1. Core invariants

Treasure sites are world content, not quest content.

A site must be discoverable, unlocked and emptied without any quest being active. A future quest may reference an existing treasure site, chest, key, cave or landmark, but must never create, reset, respawn or repair them.

If the player opens or empties a treasure chest before receiving related future content, that content must observe the existing world state.

Treasure sites are finite world resources. Once looted, they remain looted; leaving the area, streaming or save/load must not respawn them.

Treasure generation must not depend on currently loaded chunks, camera position, streaming order, render mesh topology or interaction order. The same world seed and relevant world inputs produce the same definitions.

## 2. Existing mechanisms to reuse

### Containers

Reuse:

- `src/items/container.ts`;
- `src/world/createPlacedContainers.ts`;
- existing `Inventory`;
- existing world-container interaction;
- existing container save/load path.

A treasure chest remains a normal `ContainerKind: 'chest'`.

Do not introduce `TreasureChest`, a second inventory model or a separate treasure-container lifecycle.

### Landmarks

Reuse stable landmark identity and existing landmark kinds:

- `monolith`;
- `stoneCircle`;
- `smallRuins`;
- `ruins`;
- `cemetery`.

Do not introduce treasure-specific copies of landmarks.

### Hidden Finds

Reuse `src/world/hiddenFinds.ts` for buried keys. A buried treasure key resolves through the ordinary shovel/dig flow, not a treasure-specific interaction.

### Caves

Cave treasure consumes the current production Cave V2 stable identity and gameplay-space contracts from `world-terrain-008` when those contracts are available and sufficiently stable.

Do not bind placement to Three.js mesh vertices, SDF extraction details, collider triangles or currently active cave presentation.

Cave integration is not a prerequisite for the rest of `world-024`: if the production Cave V2 contract still lacks a suitable stable interior-placement seam at implementation time, implement ruins/deep-forest treasure first and leave only the cave archetype deferred rather than blocking the systemic foundation.

## 3. Deterministic definition vs mutable state

Introduce a small deterministic world-domain definition for immutable site configuration.

Conceptually:

```ts
type TreasureSiteId = string

type TreasureSiteDefinition = {
  id: TreasureSiteId
  chest: TreasureChestPlacement
  key: TreasureKeyDefinition
}
```

It may reference stable world identities such as `caveId`, `landmarkId` or world-location ID.

Do not persist the complete definition when it can be reconstructed from world seed + stable world-place inputs + deterministic treasure rules.

Keep mutable state separate and minimal. Do **not** duplicate state owned by another system: key acquisition/location belongs to normal physical item/world/inventory ownership, chest contents belong to its `Inventory`, and physical placement belongs to existing world lifecycle.

The treasure layer should own only mutations not authoritatively represented elsewhere, most notably the lock/unlocked state associated with the stable container ID.

Do not create a monolithic `TreasureManager` merely to hold this state.

## 4. Site count and archetype selection

V1 generates a deliberately small number of systemic treasure sites.

Do not implement unbounded treasure density across every possible chunk. Prefer bounded deterministic selection from meaningful world places with small tuning constants for target count/density, minimum separation and candidate search bands.

The generator chooses from available real cave / deep-forest / ruins candidates. It does **not** guarantee that every world contains every archetype. A world with no suitable cave or ruins candidate must remain valid rather than manufacturing one solely to satisfy a checklist.

Tests may use known seeds/fixtures that exercise individual archetypes.

## 5. Supported chest locations

### 5.1 Cave treasure

Select an existing production Cave V2 by stable `caveId`.

Requirements:

- reject caves reserved for incompatible authored/special content;
- place the chest meaningfully inside the cave, not beside its entrance;
- use semantic/gameplay cave data;
- never derive placement from render geometry.

Preferred semantic placement is a suitable deeper chamber/interior anchor. If the current Cave V2 API cannot provide one, extend the smallest reusable gameplay query contract instead of inspecting meshes.

### 5.2 Deep-forest treasure

Reuse existing terrain/biome samplers and the placement style demonstrated by `src/world/locations/darkForestTreasureSite.ts`.

Candidate must be actual `deepForest`, valid walkable terrain, outside water/excessive slope and outside clearly conflicting settlement/building/authored footprints.

Do not create a treasure-specific biome classification.

### 5.3 Ruins treasure

Reuse an existing `smallRuins` or `ruins` landmark through its stable `landmarkId`.

Do not create a second ruins object solely to host the chest.

## 6. World-place reservation / conflict avoidance

Systemic treasure must not claim places already allocated to incompatible authored content, including exclusive quest caves/landmarks and existing authored treasure sites.

Use stable world-place IDs as the comparison boundary:

```text
candidate place ID
→ occupied/reserved IDs
→ accept or reject
```

Keep the mechanism minimal. Prefer passing a deterministic set/list of occupied IDs from composition/root generation into treasure resolution. Do not create a general global content-allocation framework unless current code genuinely requires it.

Authored/special content has priority over generic systemic treasure.

## 7. Treasure chest placement and lock ownership

The physical chest reuses normal placed-container infrastructure. The deterministic site supplies a stable chest/container ID, position, optional rotation and `ContainerKind: 'chest'`.

Treasure-specific lock ownership remains a thin world-side layer associated with the stable container ID rather than a separate chest implementation.

Conceptually:

```text
containerId
→ optional lock metadata/state
```

Do not add treasure-specific fields to every generic container unless implementation recon shows they represent a genuinely reusable generic container concept.

Player-placed ordinary chests must remain unaffected.

## 8. Specific matching key

Each treasure chest receives one specific physical key:

```text
treasureSiteId
→ chestId
→ required keyId
```

Different keys must not be interchangeable merely because they share the same visual/item kind. Preserve key identity through the existing physical item-instance mechanism.

Prefer a generic `key` ItemKind plus unique `ItemInstance.id`, or the closest existing reusable representation after code-level recon.

Do not create `cave_key`, `forest_key`, `ruins_key` or numbered treasure-key ItemKinds.

The key contains no quest state.

## 9. Nearby key placement

Choose the key location deterministically within a bounded band around its chest:

```text
chest site
→ nearby real world places
→ MIN_KEY_DISTANCE .. preferred band .. MAX_KEY_DISTANCE
→ deterministic suitable host
→ buried or abandoned placement
```

Both a minimum and maximum distance are required. The key should normally require meaningful nearby exploration rather than spawning beside the chest, while remaining on the scale of a few chunks rather than arbitrary world distance.

The key must never be placed inside its own locked chest.

Initial host candidates:

- `monolith`;
- `stoneCircle`;
- `smallRuins`;
- `ruins`;
- `cemetery`.

Selection must use actual existing places, respect the distance band and avoid conflicting authored ownership where relevant.

If no valid landmark exists in range, use a deterministic fallback physical abandoned-key placement on valid terrain rather than creating a fake landmark.

## 10. Buried key and Hidden Finds

A buried key extends the current Hidden Finds seam:

```text
stable key placement
+ stable landmark identity
→ ordinary player dig
→ Hidden Find resolution
→ physical matching key
```

Do not add `digTreasureKey()`, treasure-specific shovel mode, treasure-only ground interaction or quest-only digging.

Generic random hidden loot and a systemic treasure key must not duplicate, reroll, accidentally replace one another or resolve twice from the same authored/systemic key placement.

### Cemetery semantics

A cemetery host must preserve existing grave semantics.

If the key is assigned to a specific real grave/Hidden Find grave spot, digging there must continue through the same grave-disturbance / grave-robbing consequence seam used by ordinary grave digging. Treasure generation must not create a socially consequence-free parallel cemetery dig path.

If the selected cemetery placement is deliberately outside a grave, represent that explicitly as a non-grave placement rather than silently treating arbitrary cemetery ground as a grave.

## 11. Abandoned key

The alternative placement is a real physical key lying at/near the selected world place.

Reuse normal world-item/pickup lifecycle. The key has stable placement identity, appears once, remains gone after pickup and survives save/load through normal item/world persistence.

Do not add a treasure-specific pickup system.

## 12. Unlock interaction

Interaction with a locked treasure chest checks for the exact required physical key identity:

```text
interact chest
→ lock metadata for containerId?
→ locked?
→ player owns required keyId?
    yes → unlock
    no  → remain locked
```

After successful unlock, persist the mutation and continue through the existing normal container interaction/UI.

Do not duplicate the container-open workflow or create dedicated treasure UI. Concise locked/missing-key feedback should reuse existing interaction feedback mechanisms.

Prefer preserving the physical key after unlocking unless an existing generic item-interaction rule clearly dictates consumption.

Forced opening is outside this plan.

## 13. Persistence

Follow the Seedvale rule: persist mutations; reconstruct deterministic world definitions.

Do not persist deterministic candidate selection, key-host choice or other RNG outputs that can be safely reconstructed.

Ensure persistence of:

- chest unlocked state;
- physical key movement/acquisition through normal item ownership;
- buried-key resolution through Hidden Finds / item ownership state;
- container inventory mutations through existing placed-container persistence.

On reload:

- no second key appears;
- unlocked chest remains unlocked;
- chest inventory does not regenerate;
- reconstructed site/chest/key identities remain stable.

## 14. Relationship to existing authored treasure

`src/world/locations/darkForestTreasureSite.ts` is an implementation precedent but remains authored/specific content.

Reuse proven patterns where appropriate: deterministic world-site resolution, stable IDs, deep-forest candidate scoring, real world containers and existing places as physical source locations.

Do not make systemic treasure depend on that authored site. Where logic becomes clearly shared, extract the smallest reusable helper rather than copying it wholesale or performing an unrelated refactor.

## 15. Relationship to quests

No quest implementation belongs in this plan.

Expose stable IDs/state sufficient for future quests to reference existing world content. Future quests observe prior actions: they do not respawn an acquired key, relock an unlocked chest or refill an emptied chest.

## 16. Follow-up plan

`items-player-026-treasure-loot-forced-entry-and-traps.md` owns:

- treasure loot composition and balance;
- 50–200 coins;
- gem variants, including ruby / diamond × size;
- forced chest opening;
- deterministic force-open outcomes;
- contents damage;
- fire trap;
- blade damage;
- future poison/illness integration.

`world-024` provides stable site/chest/key ownership for that plan but does not pre-implement those mechanics.

## 17. Performance

Treasure generation is not a simulation tick.

Resolve definitions during appropriate deterministic world setup or through existing lazy world mechanisms, never per frame.

Candidate search must not instantiate Three.js objects, generate complete visual chunks, activate caves, build cave meshes or depend on player/camera proximity.

Prefer cheap analytic/world-location lookups. Physical presentation follows existing chunk/cave/container lifecycle.

The V1 site count is intentionally small. Do not introduce a worker solely for this feature without profiling evidence.

## 18. Likely implementation surfaces

Verified existing areas likely involved:

```text
src/world/hiddenFinds.ts
src/world/createPlacedContainers.ts
src/world/locations/darkForestTreasureSite.ts
src/items/container.ts
src/items/items.ts
src/items/itemCatalog.ts
src/items/itemInstances.ts
src/terrain/chunkEnvironment.ts
src/persistence/saveData.ts
src/app/worldBundle.ts
src/app/interactables.ts
```

Cave integration consumes the current production Cave V2 gameplay contract from `world-terrain-008`; current code remains authoritative over implementation notes.

A likely new world-side module is `src/world/treasureSites.ts`, or the closest location consistent with actual ownership after implementation recon.

Do not introduce a `TreasureManager` unless actual runtime responsibilities justify active management.

For important public resolver/types, add concise JSDoc and `@domain world` where useful for future preflight discovery.

## 19. Automated verification

Add focused deterministic/domain tests, not browser automation.

### Determinism

- same seed/input → same site/chest/key IDs and placements;
- reconstruction order does not change results;
- different valid seeds can produce different selections.

### Archetype selection

- generator does not require all archetypes in every world;
- unsuitable/missing archetype does not cause a fake place to be created;
- reserved places are rejected.

### Placement

- cave site references a real existing cave and, when cave integration is enabled, a gameplay-valid interior point;
- deep-forest candidate satisfies biome/terrain constraints;
- ruins candidate references a real landmark;
- key respects configured minimum and maximum distance;
- key never resolves inside its own chest.

### Key identity

- wrong physical key does not unlock chest;
- correct `keyId` unlocks chest;
- visually identical generic keys with different IDs are not interchangeable.

### Hidden key

- buried key resolves through ordinary Hidden Find/dig path;
- it resolves only once;
- cemetery grave placement preserves existing grave-disturbance consequences;
- reconstruction/save does not duplicate the key.

### Persistence

- unlocked chest remains unlocked;
- acquired/moved key does not respawn at source;
- chest contents continue to use normal container persistence;
- looted treasure remains finite and does not respawn after streaming/reload;
- deterministic definitions are not unnecessarily duplicated in save data.

## 20. Manual browser verification

Performed by the User.

Verify available generated archetypes for chosen test seeds, including:

1. locked chest without the key;
2. meaningful key distance from chest;
3. abandoned key near a real world place;
4. buried key through ordinary shovel interaction;
5. cemetery grave key, if generated, preserves grave-robbing consequences;
6. correct key unlocks normal container UI;
7. wrong key does not unlock;
8. save/reload before and after acquiring/moving a key;
9. save/reload after unlocking and looting;
10. streamed/reloaded looted treasure does not respawn;
11. cave treasure when the production Cave V2 integration seam is available.

AI agents do not perform browser verification.

## Non-goals

This plan does not implement:

- treasure loot generation/balance;
- new gems;
- forced entry;
- lockpicking or lockpicking skill;
- traps, fire, poison or illness/status effects;
- treasure maps, quests, dialogue or procedural clues;
- respawning treasure;
- dungeon generation;
- new landmark kinds;
- new cave generation;
- generic item durability;
- treasure-specific UI;
- per-frame treasure simulation.

## Implementation guardrails

- Extend existing world/container/item mechanisms rather than creating parallel ones.
- Keep deterministic definition separate from mutable world state.
- Do not duplicate key acquisition/location in treasure state.
- Persist mutations, not reconstructable definitions.
- Keep treasure independent of quests and player presence.
- Treat treasure as finite world resources; no automatic respawn.
- Do not inspect render meshes for gameplay placement.
- Do not create treasure-specific digging or pickup pipelines.
- Preserve normal cemetery/grave consequences for grave-hosted buried keys.
- Require meaningful min/max key distance.
- Do not force every archetype into every world.
- Do not put treasure-only state into every generic chest without a reusable reason.
- Preserve stable IDs across save/load and streaming.
- Do not let unfinished cave integration block non-cave systemic treasure.
- Avoid unrelated refactors.
- Current code is source of truth if it differs from this plan.
- User performs manual browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

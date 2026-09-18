# Plan: Medicinal herb meadow patches

**Created:** 2026-09-18
**Status:** \`planned\` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** \`world-terrain\`
**Subdomains:** \`vegetation\` \`terrain\` \`resources\`
**Tags:** \`herbs\` \`meadow\` \`world-generation\` \`resources\`
**Roadmap:** -

## Goal

Add natural, deterministic areas where medicinal plants occur in noticeable clusters.

The world should contain recognizable herb-rich meadows / clearings with real \`mint\`, \`yarrow\` and \`herb\` world items that:

- exist independently of quests,
- can be gathered by the player,
- can be gathered by Herbalist NPCs,
- reuse the existing renewable-world-item lifecycle,
- can later become locations for systemic/emergent pressure such as boars, wolves or other hazards.

The meadow is world terrain/resource structure, not quest-owned state.

## Current architecture to preserve

### Existing medicinal flora

\`src/terrain/chunkItems.ts::computeChunkItems()\` already generates medicinal and ordinary flora as deterministic world items.

The medicinal renewable kinds are currently:

- \`mint\`,
- \`yarrow\`,
- \`herb\`.

The flora pool is intentionally sparse:

\`\`\`text
FLORA_CANDIDATES_PER_CHUNK = 6
FLORA_KEEP_SCALE = 0.5
\`\`\`

The current distribution is therefore intentionally scattered.

This plan changes spatial distribution, not item ownership.

### Existing renewable lifecycle

\`src/terrain/renewableWorldItems.ts\` already owns sparse renewable depletion/respawn state:

\`\`\`text
mint   → 1.5 days
yarrow → 2 days
herb   → 7 days
\`\`\`

Placement ids remain deterministic. Persistence stores only sparse \`id → availableAtDays\` overrides.

Do not introduce a meadow inventory, meadow respawn manager or second persistence model.

### Existing meadow/clearing signal

\`src/terrain/chunkVegetation.ts\` already has:

- world-space \`meadowNoise\`,
- \`flowerMeadowPatches()\`,
- cross-chunk continuity,
- use of the same field for soft tree thinning / natural clearings in forest.

This is the preferred spatial foundation.

Do not add another independent noise field unless recon during implementation proves the existing field cannot express the required distribution.

## 1. Derived medicinal-meadow suitability

Do not equate:

\`\`\`text
high meadowNoise == medicinal meadow
\`\`\`

Instead expose one deterministic derived suitability function, conceptually:

\`\`\`text
medicinalMeadowSuitability(x, z)
=
  meadow signal
  + moisture suitability
  + forest-edge suitability
  - slope/invalid-terrain penalties
\`\`\`

Exact composition should reuse terrain data already available in current world-generation/query paths.

Goals:

- ordinary flower meadows do not all become herb meadows,
- medicinal patches remain spatially coherent,
- mint can prefer wetter parts,
- yarrow can prefer open meadow,
- rare \`herb\` can prefer edge/shade/moisture conditions,
- suitable clearings may exist at forest edges or inside natural clearings.

This suitability is derived world data, not persisted state.

## 2. Herb-rich patches are hotspots, not a new biome or landmark

Do not introduce:

- \`HerbMeadowManager\`,
- a new biome enum,
- a persistent meadow entity,
- a quest-owned landmark object.

An herb-rich meadow is a procedural hotspot expressed by world-space suitability plus deterministic item placement.

It may later be discoverable/queryable, but its existence remains derived from world seed + terrain fields.

## 3. Preserve scattered medicinal herbs

Do not move all medicinal plants into patches.

The world should contain:

\`\`\`text
scattered medicinal plants
+
rarer recognizable herb-rich patches
\`\`\`

A player may still find a single mint/yarrow/herb during ordinary exploration.

The meadow is a resource hotspot, not the only source.

## 4. Protect the global herb economy

This is a hard gameplay/economy requirement.

Do not implement:

\`\`\`text
all existing scattered herbs
+
large extra herb population in every meadow
\`\`\`

Prefer redistribution/concentration:

\`\`\`text
roughly comparable global medicinal-resource budget
→ some isolated finds
→ some concentrated herb-rich patches
\`\`\`

Implementation should avoid a large increase in expected total medicinal placements per world area.

A qualifying meadow may receive a local density boost, but compensate through the surrounding/global placement probability or through a bounded split of the existing flora budget.

The exact method may be selected during implementation after measuring current expected placement counts, but the result must preserve approximate global abundance rather than silently buffing Herbalist output, crafting and player gathering.

Add tests/statistical checks over representative deterministic samples so this remains intentional.

## 5. Species distribution

### Yarrow

Yarrow should receive the strongest open-meadow benefit.

It may be the most visually obvious medicinal plant in a herb-rich meadow.

### Mint

Mint should prefer wetter suitable parts of a patch.

Reuse existing moisture/terrain inputs already available during item placement.

### Herb

Keep \`herb\` materially rarer.

Prefer forest-edge / lightly shaded / moist transitions when current terrain inputs can express that without a new system.

### Other gatherable plants

Do not automatically fold \`flax\` or \`poisonous_herb\` into the medicinal-meadow boost in V1.

Their gameplay/economy role is separate and should be decided explicitly later.

## 6. Placement identity and lifecycle

Every meadow plant remains an ordinary world item.

Each placement must:

- have a deterministic stable id,
- be collected through existing \`ChunkManager.collectItem()\`,
- use existing renewable depletion/respawn behavior,
- remain discoverable by existing world-item queries,
- be the same physical resource for player and NPC consumers.

Do not create duplicate visual-only plants representing the same resource.

## 7. Candidate generation and density budget

Do not globally raise \`FLORA_CANDIDATES_PER_CHUNK\` enough to make all chunks more expensive.

Prefer a small additional/redistributed candidate budget only when the chunk intersects meaningful medicinal-meadow suitability.

Conceptually:

\`\`\`text
chunk generation
→ cheap suitability sampling
→ no meaningful herb-rich area
    → ordinary flora path only

→ qualifying area
    → small bounded medicinal-patch candidate budget
    → local suitability checks
    → mint/yarrow/herb placements
\`\`\`

Do not dense-scan the entire chunk.

Target outcome is visually noticeable but bounded:

\`\`\`text
several to perhaps low-teens medicinal placements
across a strong patch
\`\`\`

not hundreds of item meshes.

Exact constants should be named and covered by tests.

## 8. Reuse existing meadow continuity

Prefer the existing world-space \`meadowNoise\` as one input to medicinal suitability.

Benefits:

- cross-chunk continuity,
- no square chunk-aligned patches,
- natural relation to flower patches,
- natural relation to existing forest clearings,
- no additional large procedural field.

However, medicinal suitability must remain a separate derived semantic so flower meadow != medicinal meadow.

## 9. Terrain constraints

Reuse existing physical placement gates wherever possible:

- above water,
- acceptable slope,
- suitable ground,
- no invalid shoreline/cliff placement,
- no settlement/building footprints,
- no inappropriate road placement if current chunk-item gates already reject it.

Prefer:

\`\`\`text
open meadow / forest edge
+ moderate slope
+ suitable moisture
\`\`\`

Avoid a second parallel set of terrain-validity rules when \`chunkItems.ts\` already owns them.

## 10. Forest-edge support

Herb-rich patches may occur:

- in open meadow,
- at forest edge,
- in natural forest clearings.

This matters for later wildlife/story use, but the terrain system itself should not require every medicinal patch to be forest-adjacent.

A later quest may request a patch with additional criteria such as:

\`\`\`text
medicinal meadow
+ forest-edge character
+ suitable distance from settlement
\`\`\`

without changing meadow generation.

## 11. Semantic world query

Expose one cheap deterministic query seam, e.g.:

\`\`\`ts
sampleMedicinalMeadowSuitability(x: number, z: number): number
\`\`\`

or an equivalent current-style resolver.

Other systems must be able to ask whether a location is naturally herb-rich without:

- scanning rendered item meshes,
- counting currently available herbs,
- requiring a loaded chunk,
- depending on depletion state.

This query describes terrain/resource potential, not current inventory.

## 12. Productive-patch classification

A later quest must not select a location whose derived suitability technically qualifies but would only support one or two medicinal plants.

Define a small derived productivity tier or threshold based on the same deterministic inputs, for example:

\`\`\`text
none
weak
productive
\`\`\`

Do not materialize items to compute it.

A "productive" patch should represent terrain where the procedural placement model expects a meaningful herb concentration.

This is still derived state and does not require persistence.

## 13. Bounded nearby-meadow lookup

Provide a deterministic, bounded lookup suitable for later world systems:

\`\`\`text
find productive medicinal meadow near position
\`\`\`

The lookup should:

- work without loading/materializing chunk meshes,
- use a bounded number of candidate samples/rings,
- use the same suitability/productivity resolver as generation,
- return a stable position for a given world seed/input,
- return \`null\` when no suitable patch exists in range,
- avoid global scans.

For future quest use, allow caller-level filters/preferences such as:

- minimum/maximum distance,
- prefer forest-edge character,
- avoid settlement core / roads / invalid terrain.

Do not hardcode quest-specific constraints into the meadow system.

## 14. Performance guardrails

Hard requirements:

- no per-frame meadow processing,
- no global registry/list of all meadows,
- no startup scan of the world,
- no chunk materialization for lookup,
- no dense extra terrain grid,
- bounded candidate counts,
- reuse existing world-space noise/samplers,
- ordinary runtime herbs remain normal chunk world items.

Generation cost should only increase materially for chunks that actually intersect qualifying suitability.

## 15. Persistence

Do not add SaveData for meadow identity.

The same world seed and terrain rules must reproduce:

- the same suitability,
- the same productive patches,
- the same placement ids.

Persistence remains limited to existing renewable depletion overrides.

## 16. Tests

### Suitability

Cover at least:

1. deterministic for same seed/position,
2. continuity across chunk boundaries,
3. ordinary flower meadow does not imply medicinal meadow,
4. moisture meaningfully affects mint suitability,
5. open meadow favors yarrow,
6. forest-edge conditions can support rare herb,
7. invalid water/steep terrain does not qualify.

### Distribution / economy

Use deterministic representative samples to verify:

1. productive patches contain visibly higher local medicinal density,
2. ordinary terrain still contains scattered medicinal herbs,
3. global expected medicinal abundance remains roughly comparable to the pre-plan baseline,
4. \`herb\` remains materially rarer than yarrow/mint,
5. no chunk receives an unbounded medicinal placement count.

### Identity / lifecycle

1. meadow plants use stable placement ids,
2. collecting them uses existing renewable overrides,
3. respawn returns the same placement,
4. player/NPC queries see the same resource.

### Lookup

1. deterministic result for same seed/origin,
2. bounded attempt count,
3. unloaded lookup does not create chunk meshes/content,
4. productive patch criteria are respected,
5. no suitable patch returns \`null\`,
6. optional preference such as forest-edge can rank suitable patches without becoming a quest dependency.

### Performance/regression

Keep green:

- existing chunk item generation,
- flower meadow generation,
- renewable medicinal item lifecycle,
- Herbalist world-item discovery,
- TypeScript/build.

## Non-goals

This plan does not implement:

- the boar/meadow quest,
- a special boar spawn,
- NPC destination threat assessment (\`npc-057\`),
- a pseudo-Herbalist spouse fallback,
- named map landmarks,
- new medicinal item kinds,
- new herb 3D models,
- crafting/economy rebalance,
- a persistent meadow registry,
- off-screen meadow simulation.

## Follow-up contract

The later boar story should be able to use:

\`\`\`text
home settlement
→ bounded lookup of a productive medicinal meadow
→ optionally prefer a forest-edge patch
→ choose a real NPC with reason to gather there
→ associate a concrete boar/world incident with that area
→ npc-057 decides whether the activity is currently safe
→ quest exposes the real world problem
\`\`\`

The quest must not create/remove the meadow itself.

## Implementation guidance

Before coding, read current \`CLAUDE.md\`, \`docs/STATE.md\`, this plan and its implementation notes if present.

Prefer extending:

- \`chunkItems.ts\`,
- existing \`meadowNoise\`/terrain samplers,
- existing renewable-world-item lifecycle,

instead of introducing parallel systems.

Add JSDoc to important public/architectural query helpers where useful for AI preflight discovery; use an appropriate \`@domain\` tag where consistent.

Do not run browser verification; manual browser verification belongs to the user.

## Verification

Automated:

- focused terrain/item-generation tests,
- suitability/distribution tests,
- renewable-herb regression tests,
- unloaded meadow-lookup tests,
- TypeScript/build.

Manual browser verification by the user:

1. natural herb-rich patches are recognizable in the world,
2. patches look irregular and can cross chunk boundaries,
3. scattered herbs still exist outside patches,
4. patches do not make medicinal resources obviously overabundant,
5. collection/respawn works exactly like existing medicinal herbs,
6. no noticeable chunk-generation/per-frame performance regression.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

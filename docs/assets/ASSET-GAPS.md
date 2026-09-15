# Seedvale — Asset Gaps Recon

**Reviewed:** 2026-09-15  
**Scope:** sounds, NPC models, items, fauna, nature, textures  
**Source of truth:** current code and runtime assets on `main`, then `docs/assets/*`

This is a living cross-category recon of **what visual/audio assets Seedvale is still missing or not fully using**.

It complements, rather than replaces:

- [MODELS.md](./MODELS.md) — model-level backlog/status,
- [SOUNDS.md](./SOUNDS.md) — sound-level backlog/status,
- [LOCAL_ASSETS.md](./LOCAL_ASSETS.md) — local `_temp/` staging inventory,
- [CREDITS.md](./CREDITS.md) — source/license records for runtime assets.

Use this document before downloading another pack. A missing runtime asset may already exist under `_temp/`, in `public/models/` but not be wired, or have a procedural fallback that only needs a presentation upgrade.

## Status vocabulary

- **missing** — no suitable runtime asset is currently known.
- **in repo / unwired** — suitable file exists under `public/`, but gameplay does not use it yet.
- **procedural fallback** — gameplay exists, but presentation still uses generated/simple geometry.
- **coverage gap** — assets exist, but variety or semantic coverage is too small.
- **docs stale** — code/runtime assets are ahead of documentation.

---

## 1. Sounds

This is currently the clearest asset gap in normal gameplay.

### Highest priority — fauna combat/vocalisation

- **missing:** dedicated animal hurt/death vocalisations.
  - Current animal death presentation reuses a non-vocal melee impact instead of a species/death vocal.
  - Target coverage should include at least: wolf, boar, bear, deer, stag, fox.
  - Prefer a coherent game-ready animal/creature SFX pack, then use small pitch/variant pools rather than one bespoke source per exact event.
- **missing:** deer / fox / stag normal one-shots.
- **missing:** bear growl / aggro vocal.
- **coverage gap:** dog currently needs a second bark sample for variation.
- **coverage gap:** splash/wading still lacks a strong dedicated presentation even though water movement has sound plumbing/assets available.

Relevant detailed backlog: [SOUNDS.md](./SOUNDS.md), especially S10, S24, S26, S27.

### NPC / settlement sound gaps

- **missing:** NPC friendly-talk murmur/chatter pools.
- **missing:** smithing / woodworking workplace loops or one-shots.
- **missing:** dedicated pickaxe / ore-strike sound; mining still reuses digging presentation.
- **missing:** eating bite/chew.
- **missing:** snow ambience / flurry wind.
- **coverage gap:** dedicated jump/takeoff/landing sounds would improve the current stand-ins.

### Recommended acquisition order

1. Animal vocal / hurt / death pack.
2. Medieval work / blacksmith / mining pack.
3. Human non-verbal chatter pack.
4. Food / movement polish pack only if not already present in local staging.

---

## 2. NPC models and character presentation

NPCs are functional, but character variety is now behind the rest of the world presentation.

### Current state

Gameplay NPCs still use the Quaternius **Ultimate Modular Men/Women** pools declared by `NPC_MODEL_URLS` in `src/ai/NpcAgent.ts`.

The player pipeline has already moved further toward **Universal Base Characters (UBC)** with fantasy outfits and Universal Animation Library clips. Runtime UBC assets include male Peasant, Ranger, Knight, Knight Cloth, Noble and Wizard variants under `public/models/characters/ubc/`.

There are also 14 low-poly medieval people models under `public/models/characters/medieval/`, but they are static/background candidates rather than replacements for animated `NpcAgent` characters.

### Gaps

- **coverage gap:** too few animated NPC visual variants for a settlement population.
- **coverage gap:** professions are not visually distinct enough.
  - blacksmith,
  - farmer,
  - hunter,
  - merchant,
  - guard,
  - fisherman,
  - richer/poorer civilians.
- **coverage gap:** more female profession/outfit equivalents.
- **coverage gap:** face, hair and beard variety.
- **architecture/presentation gap:** player UBC and NPC Modular Men/Women are still separate character pipelines/rig families.
- **missing/wiring work:** worn equipment visuals. Existing armor item meshes are ground/inventory presentation only, not actual equipped character meshes.

### Direction

Prefer extending the existing UBC/outfit pipeline and eventually sharing character concepts between player and NPCs rather than acquiring another unrelated rig family.

Do not treat the static Craftpix medieval people pack as the solution for autonomous NPCs unless an animation/rig path is deliberately added.

---

## 3. Items and props

Many gameplay items exist mechanically but still fall back to simple procedural geometry.

### Missing or procedural item models

Known gaps from current model backlog/code include:

- whetstone,
- seed pouches (`tree_seed`, carrot, potato, cabbage),
- structural beam,
- cooking grate,
- iron rod,
- waterskins (small / medium / large),
- wooden bucket,
- copper bucket,
- copper ore / refined copper,
- simple-tier animal trap,
- food models still represented procedurally or with generic shapes, including some of:
  - raw meat,
  - bread,
  - species meats beyond current shared assets,
  - cheese,
  - dried meat,
  - hide presentation where a dedicated item view is useful.

### Assets already available but not fully used

- **in repo / unwired:** `chest_prop_closed.glb`, `chest_prop_open.glb`, `chest_prop_ingots.glb`.
  - They are candidates to replace the generic procedural placed-container mesh used by world treasure, storage and furniture contexts.
  - This requires state-aware wiring, not just swapping one URL.
- **in repo / candidate:** local staging contains Food Pack, Furniture Pack, Fantasy Props MegaKit and Ultimate RPG Pack. Check these before external acquisition.

### Priority

Prefer assets that improve frequently visible world interactions:

1. waterskins / buckets / food,
2. container state visuals,
3. cooking/crafting props,
4. low-value construction-material pickups such as rods/beams only after the above.

---

## 4. Fauna models

Fauna model coverage is now relatively strong. **Audio is a larger gap than more animal GLBs.**

### Runtime coverage

Current runtime model inventory includes, among others:

- wolf,
- fox,
- deer,
- stag,
- bear,
- rabbit,
- wild boar,
- chicken,
- cow,
- sheep,
- horse,
- donkey,
- dogs (Husky + Shiba variants),
- settlement rat,
- rooster asset,
- duck asset present in the repository.

### Important documentation discrepancy

`docs/assets/MODELS.md` currently describes the rooster as still needing a dedicated GLB/procedural-only placeholder, but:

- `public/models/fauna/rooster.glb` exists on `main`, and
- `src/settlement/livestock.ts` points `LIVESTOCK_URLS.rooster` at `/models/fauna/rooster.glb`.

So the rooster entry/documentation is stale and should be corrected separately.

`public/models/fauna/duck.glb` also exists. Its presence does **not** by itself prove full runtime integration; treat it as an available candidate until its simulation/wiring is verified.

### Remaining gaps

- **coverage gap:** several older animals have thinner animation sets than newer packs/models; semantic fallbacks hide this at runtime.
- **missing presentation:** animal hurt/death audio is much more noticeable than another species model.
- **future-only:** add species only when ecosystem plans create an actual simulation role; avoid decorative fauna with no system interaction.

---

## 5. Nature / environment models

The active nature baseline is already broad: trees, bushes, pines, fern, cactus, reeds, reed clusters, lily pads, seaweed, rocks, logs, cemetery/graves and landmark vegetation are present.

### Concrete gaps

- **missing:** textured willow. Existing vertex-color candidate was intentionally rejected for style mismatch.
- **in repo / unwired:** additional rock variant (`rock_b`).
- **in repo / unwired/parked:** pine clump candidate.
- **in repo / unwired:** grass-clump GLB candidate.

### Variety gaps worth filling

Rather than adding many isolated plant species, the world would benefit more from reusable environment variation sets:

- 2–4 rock formations / boulders,
- fallen trees and dead logs,
- dead/snag tree variants,
- forest-floor shrubs and ground-cover variants,
- marsh/wetland vegetation,
- larger natural landmarks usable by worldgen.

These should extend the existing vegetation/worldgen mechanisms, not create decorative one-off placement systems.

### Local pack availability

Before downloading more nature content, inspect existing staging packs documented in [LOCAL_ASSETS.md](./LOCAL_ASSETS.md), especially:

- Ultimate Stylized Nature,
- Ultimate Nature Pack by Quaternius,
- Textured Stylized Trees,
- Medieval Village MegaKit.

---

## 6. Textures

Seedvale currently does **not** depend on a conventional large runtime texture library. There is no dedicated `public/textures/` tree; visual assets are mostly embedded with models, under `public/images/`, or generated by shaders/procedural materials.

Examples:

- terrain appearance uses shared procedural/shader logic and world-space noise rather than a classic tiled PBR terrain set,
- fire uses `/images/flame/fire_atlas.png`,
- UBC currently has character texture files alongside its models.

### Conclusion

There is no urgent generic "texture pack missing" problem.

A texture acquisition task only makes sense after a deliberate visual-direction decision. If terrain should gain more material detail, acquire one coherent stylized set covering approximately:

- grass,
- dirt,
- mud,
- sand,
- rock,
- road/gravel,
- snow.

Prefer using it as detail/albedo/normal overlays within the existing shared terrain material rather than replacing biome/world classification with a parallel texture-driven terrain system.

### Possible future texture needs

- decal/ground-detail atlas,
- mud/track/footprint masks,
- subtle rock/soil normals,
- additional particle sprites.

`_temp/Images/Particle Pack/` already contains a Kenney CC0 particle set and should be checked before sourcing new particle textures.

---

## Recommended next acquisition pass

| Priority | Area | Goal |
|---|---|---|
| P0 | Sounds | Animal hurt/death/aggression + missing deer/fox/stag/bear/boar/wolf coverage |
| P1 | NPC | Expand animated profession/outfit/appearance variety, preferably through the existing UBC direction |
| P1 | Items | Replace highly visible procedural food/container/water/crafting props |
| P2 | Nature | Willow + rocks/deadwood/ground-cover variation |
| P3 | Textures | Only after a conscious terrain/material visual-direction decision |

## Before downloading any new pack

1. Search [LOCAL_ASSETS.md](./LOCAL_ASSETS.md) and `_temp/` first.
2. Check whether the file already exists under `public/models/`, `public/images/` or `public/sounds/` but is not wired.
3. Check [MODELS.md](./MODELS.md) / [SOUNDS.md](./SOUNDS.md) and current code because docs may lag runtime assets.
4. Prefer packs that cover multiple currently missing roles and match the existing stylized visual direction.
5. Prefer CC0 or otherwise clearly redistributable licenses and update [CREDITS.md](./CREDITS.md) / `public/sounds/README.md` when promoted to runtime.
6. Reuse existing runtime ownership and loading mechanisms; acquiring an asset should not introduce a parallel gameplay system.

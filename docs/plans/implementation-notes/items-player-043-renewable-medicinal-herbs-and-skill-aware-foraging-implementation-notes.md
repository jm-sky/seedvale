# Implementation Notes: items-player-043 — Renewable medicinal herbs and skill-aware foraging

**Plan:** `docs/plans/items-player-043-renewable-medicinal-herbs-and-skill-aware-foraging.md`  
**Reviewed:** 2026-09-16  
**Source:** current `main` codebase + `docs/plans/PLANNING.md` + related skill/injury plans

## Current implementation seams to reuse

### Item identity and catalog

- `src/items/items.ts` owns `ItemKind` and `ITEM_DEFS`; add `mint` and `yarrow` there and keep existing `herb` id unchanged.
- `src/items/itemCatalog.ts` already separates generic `consumable`, `conditionTreatment` and `injuryTreatment`. Extend these existing fields; do not add a herbal-effect scripting layer.
- `conditionTreatment` currently supports only `kind: 'poisoning'`. Do not invent a disease condition for mint in this plan.
- `injuryTreatment` already carries `immediateHp` + `maxSeverity`; use it only where the current consumer model can actually honor it.

### Player treatment execution

- `src/app/actions/survivalActions.ts::consumeItem()` is the current player inventory-use path.
- It removes the item first, applies the catalog `consumable`, then applies `conditionTreatment` directly with `applyConditionTreatment(...)`.
- It currently does not evaluate `Medicine`, does not inspect `injuryTreatment`, and does not know whether a condition treatment changed anything.
- The skill-aware medicinal treatment integration should happen in/behind this path rather than via a second inventory action.
- Avoid a blanket skill multiplier on every consumable. Only medicinal treatment potency should read Medicine/Survival; ordinary food, water and generic HP consumables must stay unchanged.

### Skills

- `src/player/PlayerSkills.ts` already contains both `survival` and `medicine`; no skill schema extension is required.
- XP state is authoritative in `PlayerSkills`; use `awardSkillXp()` and add explicit entries to `SKILL_XP_AWARD` for successful herb gathering/treatment rather than writing XP directly.
- `src/player/skillEvaluation.ts::evaluateSkillCompetence()` is intentionally formula-free. Call it with Medicine as primary and Survival as support, then resolve herb-specific effectiveness in a small pure helper owned by this feature.
- Do not modify `evaluateSkillCompetence()` into a global weighted-average helper.
- Survival must not affect world generation. It may only affect player-facing discovery/interaction and XP, preserving player-independent world state.

## Medicinal item semantics

Keep the current `herb` item id and make its presentation explicitly rare/special. Add only two new kinds:

- `mint` — common medicinal forage; V1 authoritative treatment is poisoning.
- `yarrow` — common/moderately common wound herb; V1 catalog treatment should stay weaker than bandage/dressing.
- `herb` — rare quest herb; stronger poisoning treatment and useful medical ingredient.

Do not rename `herb` to `rare_herb`: the quest, saves, household references and trade code already use `herb`.

The existing quest `src/quests/quests.ts` must continue requiring exactly `herb ×3`; mint/yarrow must not satisfy it.

## World generation and occurrence

### Existing generator

`src/terrain/chunkItems.ts::computeChunkItems()` already has a dedicated deterministic flora candidate stream with stable `cx:cz:fN` ids. Reuse it.

Current flora availability inputs already include:

- biome weights from `biomeWeightsAt(...)`,
- altitude,
- moisture region,
- mountain ridge,
- near-tree / near-pine checks.

Do not add a second herb generator or player-dependent spawn pass.

### Distribution implementation

Add explicit weights for `mint` and `yarrow` beside the existing flora weights and reduce the existing `herbWeight` so `herb` is genuinely rare.

Use only signals already available inside `computeChunkItems()` unless a small pure terrain signal is already exposed through the current tile data. Avoid synchronous river/lake manager queries from the worker path.

Expected shape:

- mint: moisture-positive, low/medium altitude, non-desert; forest/swamp edge acceptable.
- yarrow: open non-desert/non-swamp terrain; avoid a hard biome gate.
- herb: forest/shady/moist weighting, materially lower than both common herbs.

Keep stable placement ids. Changing flora weights will change which kind a given `fN` roll resolves to for worlds generated under the new code; do not try to persist full procedural placements to prevent that.

## Renewable world-item state

### Important current constraint

The existing chunk-item lifecycle is finite:

- `ChunkManagerConfig.collectedItemIds: Set<string>` is the runtime owner for permanently collected procedural item ids.
- `SaveData.collectedItemIds: string[]` persists that set.
- `src/terrain/chunkWorldItems.ts::proceduralChunkItems()` recomputes off-screen placements and filters only against `collectedItemIds`.
- `src/app/saveState.ts` serializes `getCollectedItemIds()` directly.

Therefore renewable herbs must be represented as a separate sparse temporal overlay. Do not reinterpret all `collectedItemIds`, because stone/shell/coin/other forage currently rely on permanent removal.

### Recommended runtime shape

Introduce a small type/module close to chunk-item ownership, e.g. under `src/terrain/`, representing:

```ts
type RenewableItemCollectionState = Map<string, number> // placement id -> collectedAtGameDays
```

and pure helpers conceptually equivalent to:

- `renewableRespawnDays(kind)`
- `isRenewableWorldItem(kind)`
- `isRenewablePlacementAvailable(id, kind, nowDays, state)`
- pruning expired entries when naturally touching state

The kind must come from the regenerated/current placement, not be duplicated into persistence unless code proves it necessary.

Respawn tuning belongs in one shared table/helper, not copied into `chunkItems.ts`, `chunkManager.ts` and persistence.

### Collection path

Current `chunkManager.collectItem(id)` is id-oriented and the loaded chunk record already knows the placement kind. Extend the world-item collection seam so it can distinguish finite vs renewable and receive current game time.

Do not start per-item timers. Collection should only record `collectedAtGameDays`; availability is lazily resolved from `nowDays`.

If changing `collectItem` to require `nowDays` would spread into many unrelated call sites, a narrow injected `getElapsedDays` callback in chunk config is acceptable, but prefer explicit time at mutation/query boundaries when practical.

### Loaded chunk respawn

A loaded chunk cannot rely only on unload/reload to make an expired herb reappear. The implementation needs an explicit low-cost refresh boundary.

Prefer one of:

- reevaluate renewable placements on an existing low-frequency chunk/content maintenance cadence, or
- lazily rematerialize when nearby-item/interactable queries touch a chunk after expiry.

Do not add a render-frame scan over all procedural items.

The same availability resolver must be used for:

- loaded meshed chunk items,
- `getNearbyItems(...)`,
- off-screen `proceduralChunkItems(...)` used by NPC/settlement gathering.

Otherwise NPCs and the player will disagree about whether a harvested herb exists.

## Persistence changes

`src/persistence/saveData.ts` is currently schema version 47. Adding renewable collection timestamps changes persisted `SaveData`, so bump the schema and add the required migration in `SAVE_MIGRATIONS` per `PLANNING.md`/persistence contract.

Recommended save field is sparse, for example:

```ts
renewableCollectedAt: Record<string, number>
```

or an array of compact records if that matches current validation style better.

Requirements:

- old saves migrate/default to an empty renewable map,
- old `collectedItemIds` retain their permanent semantics,
- do not retroactively convert historical `herb` ids because their collection time is unknown,
- expired renewable entries may be dropped during restore/snapshot/touch to keep the save sparse,
- validate ids/timestamps defensively like other persisted maps.

Thread the live state through the same app ownership path as `collectedItemIds`:

- `createApp.ts` lifecycle/new-world reset,
- `worldBundle.ts` / chunk-manager construction,
- `saveState.ts` live accessor and snapshot,
- load/restore path.

Preserve the existing "mutated/replaced only on genuine world transition" conventions used by procedural-world overlays; do not put this state in Vue or meshes.

## Off-screen/NPC gathering compatibility

This is easy to miss and is implementation-critical.

`src/terrain/chunkWorldItems.ts::proceduralChunkItems()` is used for bounded off-screen gather queries. Its current signature only knows `collectedItemIds`.

Extend it (and its callers) with renewable availability context so an NPC/herbalist:

- cannot gather a just-picked renewable herb,
- can gather it again after respawn,
- still treats finite items as permanently absent once collected.

Do not special-case Herbalist AI by item kind. The world-resource query should be authoritative for both player and NPC consumers.

## Survival-based finding and gathering

The current procedural item mesh exists independently of player skill. Preserve that.

For V1, the lowest-risk meaningful Survival integration is interaction/discovery radius plus XP:

- base radius remains sufficient at novice skill,
- higher Survival gives a bounded radius bonus specifically for medicinal herbs,
- actual collection success remains unconditional once the item is targetable/reached,
- gathering a medicinal herb awards a small Survival XP amount once, after successful inventory insertion/collection.

Find the current world-item interactable/pickup construction and make the radius modifier there; do not alter `computeChunkItems()` or Three.js visibility based on skill.

If current interaction architecture has no clean per-kind radius seam, prefer only gathering XP in this plan rather than adding a parallel perception manager. A future observation/knowledge system can own richer plant identification.

## Medicine-based treatment

Add a pure medicinal-treatment effectiveness helper, likely under `src/player/` or `src/items/`, that consumes `evaluateSkillCompetence(skills, 'medicine', [{ source: 'skill', id: 'survival' }])`.

Keep its contract narrow: resolve a bounded multiplier from competence, not mutate health/conditions.

Suggested plan tuning is already sufficient:

- Medicine contribution maps roughly 0.85 → 1.20,
- Survival adds at most +0.10,
- final result is bounded and deterministic.

Apply it to catalog treatment potency at execution time. Prefer rounding policy in one helper so tests do not depend on incidental `Math.round` choices scattered across call sites.

### Detecting meaningful treatment

The current `applyConditionTreatment()` returns `void`, so `consumeItem()` cannot tell whether poisoning existed or whether treatment actually reduced it.

For correct Medicine XP and to avoid consuming a medicinal herb for no therapeutic effect, add a narrow result-bearing treatment seam, e.g. return before/after severity or `appliedReduction` from the existing temporary-condition treatment helper.

Do not infer success from "item had `conditionTreatment` metadata".

If product behavior intentionally allows eating/using a herb when no condition exists for its generic HP effect, that generic effect may still occur, but Medicine XP must only be awarded for actual condition/injury treatment.

## Yarrow and injury boundary

`npc-025` establishes injury severity/treatment semantics, but the current player `consumeItem()` path only owns `HealthState` + temporary conditions and does not expose an authoritative Player physical-injury state equivalent to NPC `physicalInjury`.

Do not add one here just to make yarrow fully functional.

For this plan:

- add the yarrow item and catalog `injuryTreatment` metadata compatible with existing injury consumers,
- keep any generic small HP relief conservative,
- only wire player wound-specific Medicine behavior if current HEAD at implementation time already has an authoritative player injury consumer.

This is a deliberate asymmetry, not a reason to duplicate NPC injury state into Player.

## Economy and production

`src/items/tradeCatalog.ts` currently makes `herb` merchant stock at 5 coins specifically as quest fallback and gives it an effective listed trade value of 5.

Change to the planned values through the existing catalog:

- `mint`: resource trade value 2; not generic merchant stock,
- `yarrow`: resource trade value 3; not generic merchant stock,
- `herb`: merchant list price 12, therefore listed trade value 12.

Keep normal social sell/buy factors; no herb-specific pricing logic.

Audit `dressing` after the herb repricing. Current comments/economy treat it as a `bandage + herb` processed output and value it at 16. If the production recipe really consumes rare `herb`, output value must not create a deterministic negative-value profession loop or obvious player arbitrage. Adjust either recipe ingredient semantics or output value only as far as required for consistency; do not redesign Herbalist production in this plan.

Also verify any household protected-stock/production references to `herb`; preserve the rare herb where quest/medicine semantics require it and do not automatically add mint/yarrow to generic NPC trade allowlists.

## Item visuals and presentation

`src/items/items.ts::createItemMesh` / item definitions are the existing presentation route for procedural pickups. Add explicit labels for all three species.

If no dedicated assets exist, reuse a simple existing herb/plant visual temporarily but keep distinct `ItemKind` and labels. Do not block implementation on new GLBs and do not create three bespoke rendering pipelines.

Update `docs/items/CATALOG.md` only through the established source/generator workflow if it is generated; do not hand-maintain derived docs contrary to repository conventions.

## Tests to add/extend

### Pure/world generation

- deterministic seed/chunk produces stable ids across repeated `computeChunkItems()` calls,
- mint/yarrow/herb appear only through the existing flora candidate pool,
- rare `herb` weight is materially below common herbs,
- player Survival does not enter generator inputs.

Avoid brittle tests asserting exact full flora lists unless existing tests already lock generator snapshots intentionally; prefer habitat/weight helper tests where possible.

### Renewable lifecycle

Test the availability resolver independently:

- finite item remains absent permanently,
- mint unavailable before 1.5 days and available at/after boundary,
- yarrow 2.0 days,
- herb 7.0 days,
- expired state can be pruned,
- save/load preserves an active cooldown,
- old-save migration defaults renewable state empty.

Test both loaded and procedural/off-screen query paths against the same state.

### Skill treatment

- novice Medicine still yields useful potency,
- Medicine mastery improves outcome monotonically,
- Survival support is smaller than Medicine primary contribution,
- bounds hold at malformed/extreme values,
- actual poisoning reduction uses resolved potency,
- no Medicine XP when no poisoning is reduced,
- Medicine XP awarded once for successful treatment,
- Survival XP awarded once for successful herb collection.

### Quest/economy regressions

- `ziola-dla-anny` still requires `herb` only,
- mint/yarrow do not advance it,
- merchant still stocks `herb` at the new price,
- mint/yarrow use resource valuation and are not generic merchant stock,
- dressing/input valuation has no obvious buy/process/sell arbitrage under neutral pricing.

## Likely implementation order

1. Add `mint`/`yarrow` item identities, labels, catalog effects and pricing; retune rare `herb`.
2. Extend flora weights while preserving the existing deterministic candidate/id stream.
3. Add the pure renewable availability/respawn helper and unit tests.
4. Thread renewable sparse state through chunk loaded + off-screen query paths.
5. Add SaveData field, schema migration, create/load/new-game/save wiring.
6. Add Survival gather integration/XP at the existing pickup seam.
7. Add Medicine+Survival pure potency resolver and result-bearing condition-treatment seam; integrate `consumeItem()`.
8. Audit quest, Herbalist/dressing economy and regression tests.
9. Update relevant current-state/catalog docs only where the implemented behavior changes authoritative documentation.

## Guardrails

- No separate Herbalism skill.
- No player-dependent plant spawning.
- No per-frame global herb respawn scan.
- No duplicated procedural placement persistence.
- No generic disease framework in this plan.
- No new Player physical-injury state solely for yarrow.
- No hardcoded herb kinds inside condition/injury policy when catalog metadata can express the capability.
- No parallel pricing table or herbalist manager.
- Preserve off-screen simulation parity with loaded-world collection.
- Add JSDoc/`@domain` annotations to the new public renewable-state and treatment-effect helpers where useful for preflight discovery.

## Manual verification

Browser verification is performed by the User.

Verify at least:

- mint/yarrow can be found in expected terrain and are visibly distinguishable by label,
- rare quest herb is noticeably harder to find,
- harvesting removes the plant immediately,
- plant remains absent before its cooldown and returns after enough game time without requiring a new world,
- unload/reload chunk and save/load do not reset the cooldown,
- poisoning treatment strength changes with Medicine while remaining useful at novice skill,
- gathering/treatment progression awards XP only on successful actions,
- quest still advances only from rare `herb`,
- merchant fallback remains available at the new rare-herb price.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Implementation Notes: quests-progression-040 — Lost Treasure Chronicles dark-forest estate, alpha bear and treasure map

Recon baseline: current `main` on 2026-09-15. `quests-progression-039` is still `planned` and is itself blocked by 037/038, so 040 is not implementation-ready until that chain lands. Implement against the final 039 search-area/story-binding APIs; do not duplicate them here.

## 1. 040 deliberately overrides one assumption from 039 notes

The current 039 implementation notes say not to reuse `DARK_FOREST_TREASURE_LOCATION_ID` and leave exact estate selection to the next plan. Plan 040 is that next decision and explicitly reuses the existing 009 site. Treat this as intentional supersession: 039's bounded area must resolve so the existing deterministic dark-forest site lies inside/meaningfully corresponds to it; do not generate a second estate.

`src/world/locations/darkForestTreasureSite.ts::resolveDarkForestTreasureSite()` already owns deterministic estate coordinates, stable location/landmark/chest ids and the current wolf-den placements. Preserve its site identity. If 039 lands its area resolver before 040, compose the area from this authoritative site or constrain its deterministic area selection around it rather than moving/replacing the site.

## 2. Retire only the old 009 narrative, not its world facts

The contradictory quest is still authored in `src/quests/quests.ts` and uses `treasure_map_dark_forest`, `DARK_FOREST_TREASURE_LOCATION_ID` and the dark-forest chest. Remove it from offer/materialization while preserving historical quest records already present in saves.

Do not delete/re-key the existing site, location knowledge, chest id, consumed authored pickup id or inventory ownership just to retire 009. Old active/offered 009 state should become non-offerable/non-progressing; completed history may remain. Avoid a save migration that translates 009 into chapter 040.

Also update/remove 009-specific runtime predicates in `src/app/createApp.ts` only where they exist solely for the retired narrative; keep generic location/chest/world-state APIs.

## 3. Reuse the site, but remove its authored wolf-den layer

`DarkForestTreasureSite` currently contains `wolfDenCount`/`wolfDens`, generated deterministically by `resolveDarkForestTreasureSite()`. Those are old encounter content, not a generic ecosystem requirement.

Preferred cleanup: stop materializing these site-specific dens and, if no remaining consumer needs the fields, remove the den generation/API from `darkForestTreasureSite.ts` plus focused tests. Do not touch ordinary regional wolf spawning. Preserve `DARK_FOREST_TREASURE_SITE_KEY`, location/landmark/chest ids and estate placement.

## 4. Alpha bear should use persistent-occupant identity, with one generic variant extension

Use fauna's existing sparse persistent occupant system (`src/fauna/persistentOccupants.ts`) for the authored bear. It already provides exactly the required stable slot identity/tombstone semantics:

```text
habitatId + occupantKey
→ persistentAnimalId(...)
→ saved snapshot or removed-slot tombstone
```

Bind one declaration to a stable estate habitat id, e.g. derived from `DARK_FOREST_TREASURE_SITE_KEY`, with `occupantKey: 'alpha-bear'` and `kind: 'bear'`. Compose it in the normal `worldBundle.ts` → `buildFauna()` path, not from quest activation.

Current gap: `PersistentOccupantDecl` has only `habitatId`, `occupantKey`, `kind`; `AnimalVariant` is not stored in `AnimalSaveState`. The constructor needs the variant before `hydrate()`. Extend the generic declaration contract with an optional/defaulted `variant` (or equivalently named immutable spawn trait), thread it through `createFauna.ts::spawnAgent()`, and validate it during restore. Do not add quest-specific alpha-bear state or persist variant separately in SaveData if the deterministic declaration is authoritative.

Use existing `AnimalVariant = 'normal' | 'alpha'` and `resolveAnimalVariantStats()`. Current alpha modifiers are species-generic multipliers, so no bear-only HP/damage table is needed unless playtesting later proves balance needs a generic species-aware variant profile.

The bear does not need a cave habitat. Give the persistent occupant a small fauna-owned surface habitat/spawn binding around the estate using existing habitat/spawner seams; normal `AnimalAgent` AI then owns roaming, feeding, combat and death. The persistent slot/tombstone — not a recurring population slot — is what guarantees no replacement alpha after death.

## 5. Map source must move to the estate; current code still places it elsewhere

Current `darkForestTreasureSite.ts::resolveTreasureMapSourcePlace()` intentionally chooses an existing cave/cemetery near home, and `worldBundle.ts` attaches that source to the site. `src/items/authoredWorldPickups.ts::buildAuthoredOneTimePickups()` then materializes `treasure_map_dark_forest` at that external `TreasureMapSourcePlace`.

040 reverses this. Remove the old cave/cemetery source selection for this story map and keep one stable pickup id (`darkForestTreasureMapPickupId()` is already suitable) located deterministically at/within the estate. Prefer the existing authored one-time pickup path over adding the map to the chest: plan 036 already persists consumed pickup ids and this preserves one-source semantics with minimal migration surface.

If a new estate-local placement helper is needed, keep it pure and derived from the existing site position/rotation. Do not create a second pickup id. Existing consumed id must continue to suppress rematerialization on old saves.

## 6. Keep the current item kind unless there is a concrete migration need

`treasure_map_dark_forest` is already a story-category item and is wired through inventory/read tests. Renaming the `ItemKind` would touch persisted inventory counts/instances and creates unnecessary migration work.

The real semantic problem is metadata/read behaviour: `src/items/itemCatalog.ts` currently gives the item treasure-map metadata pointing to the dark-forest estate, and `src/app/inventoryWiring.ts` / `createApp.ts` use it for the old read/reveal flow and `worldFlags.treasureMapDarkForestRead`.

Preferred V1: retain the kind for save compatibility, change label/description if needed, and remove the estate-reveal metadata/action. Reading should emit the ordinary quest `read_item` event/state and mark the chapter's read condition without revealing a concrete next dungeon yet. If the generic item-read system requires `treasureMap.locationId` to expose `Odczytaj`, generalize the catalog/read contract so readable story documents/maps can be readable without revealing a WorldLocation; do not leave a fake estate target.

Do not duplicate map possession/read state in chapter-specific booleans when existing inventory + quest read-event/catch-up mechanisms can express it. If `worldFlags.treasureMapDarkForestRead` remains necessary for old-save compatibility, treat it as legacy read history, not as the source of map ownership or destination knowledge.

## 7. Quest chapter should be contextual and catch up from authoritative state

After 037–039 land, add chapter 040 through the same Lost Treasure Chronicles contextual story binding rather than as another static Piotr-style quest definition.

Stage predicates should read existing owners:

- estate found: `LocationKnowledge` / `discover_location` for `DARK_FOREST_TREASURE_LOCATION_ID`;
- map recovered: exact/current inventory ownership of the story map (use an identity-backed instance only if the landed pickup/inventory path provides one; otherwise the one-shot source + unique story kind is sufficient);
- map read: existing `read_item` event/history seam.

On activation, poll/catch up immediately so early discovery, pickup and read can skip obsolete stages. Do not make bear death a stage/predicate.

## 8. Old-save compatibility: preserve physical state, retire contradictory progression

Preserve unchanged stable ids where possible:

- `DARK_FOREST_TREASURE_LOCATION_ID` and landmark id;
- `darkForestTreasureChestId()` and its persisted depletion;
- `darkForestTreasureMapPickupId()` and consumed pickup tombstone;
- existing `treasure_map_dark_forest` ownership;
- `LocationKnowledge` discovery;
- historical 009 completion record.

The new alpha bear has no valid predecessor in old saves; deterministic declaration means it appears once when 040 first exists for that world. After first death the persistent occupant tombstone prevents return. Do not attempt to infer alpha-bear death from old wolf-den/quest state.

If old saves contain the map because it was collected from the former cave/cemetery source, keep that ownership and do not spawn an estate copy: consumed pickup id / inventory state must win over the new placement.

## 9. Incidental chest can stay unchanged

The existing world-generated dark-forest chest already has stable identity and persisted contents/depletion. Keep coins/ruby as incidental loot unless removing it materially simplifies final estate presentation. There is no reason to route story-map ownership through the chest if the one-time pickup path remains.

## 10. Focused implementation order

1. Land/verify 037–039; make 039 bounded area compatible with the existing 009 site.
2. Retire old 009 quest offering while preserving save/world ids.
3. Move the existing stable map pickup source to the estate and remove its old reveal-back-to-estate semantics.
4. Remove old site-specific wolf dens.
5. Extend `PersistentOccupantDecl` generically with variant and compose one estate alpha bear through `worldBundle.ts`/`createFauna.ts`.
6. Add chapter 040 to the landed Lost Treasure Chronicles binding with authoritative catch-up predicates.
7. Add focused cross-system tests; no browser verification by AI.

## 11. Tests that matter

- 039 area contains/leads to the unchanged deterministic estate; no second site is created.
- old 009 cannot be newly offered, while completed/history/world state survives restore.
- same seed keeps estate ids/position and alpha persistent slot identity stable.
- persistent alpha is constructed as `bear + alpha` both fresh and after restore; death creates a tombstone and never produces a replacement alpha.
- removing authored estate wolf dens does not disable ordinary wolf ecology.
- map pickup uses the old stable pickup id at the estate; consumed old-save id prevents a new copy after the placement change.
- owning the old map before 040 activation catches up without returning to the estate.
- reading the map no longer reveals `DARK_FOREST_TREASURE_LOCATION_ID` or a fake dungeon location.
- chest depletion and estate `LocationKnowledge` survive unchanged.

## 12. Main risks

- **Dependency drift:** 039 is not implemented yet and its current notes conflict with 040 on estate reuse. Resolve this in the landed 039 API, not with parallel search-area state.
- **Variant persistence:** a persistent occupant restored without deterministic variant-at-construction would silently downgrade the alpha bear to normal.
- **Map relocation:** changing coordinates while changing pickup id would duplicate maps on old saves. Keep the stable consumed id.
- **Item rename:** renaming `treasure_map_dark_forest` adds save migration risk without solving the actual destination-semantics problem; prefer changing metadata/read behaviour.
- **Narrative retirement vs deletion:** removing the 009 quest definition too aggressively can break loading historical quest records. Retire offer/progression while keeping compatibility with serialized ids.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
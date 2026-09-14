# Implementation Notes: quests-progression-035

Recon baseline: current `main` after plan creation. The source plan owns scope; these notes record implementation-relevant seams, current-code facts, and decisions that should prevent repeat recon.

## 1. Inventory map interaction — reuse the existing `onRead` path exactly

The treasure-map backend is already complete. Do not touch quest progression, persistence, or location reveal semantics for this part.

Relevant current files/symbols:

- `src/items/itemCatalog.ts`
  - `ItemCatalogEntry.treasureMap?: { locationId: string }`
  - `treasure_map_dark_forest` already has `treasureMap` metadata.
- `src/ui-vue/screens/InventoryScreenItemDetails.vue`
  - already derives `const treasureMap = computed(() => catalogEntry.value?.treasureMap ?? null)`;
  - already routes the map action through local `onRead(kind)` → `ui.inventory.onRead`;
  - this is the reference behavior/label for the list view.
- `src/ui-vue/screens/InventoryScreenItemList.vue`
  - its row view-model currently carries `book: ITEM_CATALOG[group.kind].book ?? null`, but not `treasureMap`;
  - the inline action area renders `Czytaj` only when `item.book` is present;
  - local `onRead(kind)` already exists and calls the same `ui.inventory.onRead?.(kind)` seam, so no new UI callback/state is needed.
- `src/app/createApp.ts`
  - the inventory `onRead` wiring distinguishes treasure maps from books and forwards maps to `inventoryWiring.readTreasureMapItem(kind)`.
- `src/app/inventoryWiring.ts`
  - `readTreasureMapItem(kind)` owns the existing read flag/reveal/quest hook behavior.
- `src/quests/QuestManager.ts`
  - `onReadItem(itemKind)` already advances matching `read_item` objectives.

Implementation shape for the list should therefore be minimal: add `treasureMap` to the existing row projection and render an `ItemsScreenItemButton` with `label="Odczytaj"` calling the already-present `onRead(item.kind)`. Do not make a separate `onReadTreasureMap`, do not duplicate `ITEM_CATALOG[kind].treasureMap.locationId` handling in Vue, and do not special-case `treasure_map_dark_forest` by `ItemKind`.

If an item ever has both `book` and `treasureMap` metadata, the catalog is malformed for the current UX. Do not invent precedence logic unless recon during implementation finds such an item; current catalog uses them as distinct mechanics.

## 2. `ItemCategory` expansion — all exhaustive UI records must move together

`src/items/items.ts` currently owns:

- `ItemCategory = 'resource' | 'tool' | 'utility' | 'food' | 'weapon' | 'armor' | 'knowledge'`;
- `ItemDef.categories: readonly ItemCategory[]`;
- `CATEGORY_SORT_ORDER`;
- `primaryItemCategory()`.

The source plan adds `story` and `other`. Keep those as ordinary `ItemCategory` values; do not add `isStoryItem()` registry/state unless a real non-presentation use appears.

Known exhaustive/explicit presentation sites from current code and the earlier armor-category implementation:

- `src/items/items.ts` — `CATEGORY_SORT_ORDER`;
- `src/ui-vue/composables/useItemCategoryLabels.ts` — category-label object;
- `src/ui-vue/screens/InventoryScreenItemList.vue` — local `CATEGORY_ORDER` used by category chips and sorting;
- `src/ui-vue/screens/InventoryScreenItemDetails.vue` — `CATEGORY_ICON: Record<ItemCategory, Component>`;
- `src/ui-vue/components/MerchantItemDetailsModal.vue` — another `CATEGORY_ICON: Record<ItemCategory, Component>`;
- `src/ui-vue/components/MerchantFilterBar.vue` — explicit merchant category chips if still exhaustive at implementation time.

Because the icon maps are `Record<ItemCategory, Component>`, TypeScript should intentionally force handling of both new categories. Prefer an existing neutral icon (`Package` or equivalent already imported/available) for `other`; use a document/book/package-like existing icon for `story` rather than introducing a dependency just for this plan.

Important ownership boundary: merchant visibility/eligibility is not defined by `ItemCategory`. `settlements-npcs-036` explicitly treats item categories as gameplay/presentation semantics, not sellability/ownership. Adding `story` must not itself change `canSell`, merchant stock, NPC-owned goods eligibility, or transfer semantics.

## 3. Story-item assignments — use current item role, not quest lifecycle

Current story/identity items are ordinary `ItemKind`s and several are currently misclassified because no story category existed:

- `treasure_map_dark_forest` — currently `['utility']`;
- `signet_ring` — currently `['resource']`;
- `bandit_ledger` — currently a generic non-story category in `ITEM_DEFS`;
- `marked_valuable` — same issue;
- `expedition_journal` — same issue.

Move the plan-listed five to `['story']` unless a current multi-category use is discovered during implementation that must be preserved. The category should describe what the player sees the item as, not how quest ownership works.

Do not automatically classify normal domain items as story just because a quest references them. Examples such as weapons, food, bandages, coins, or a hunting bow remain their normal gameplay category even when an authored quest temporarily binds a specific instance.

`other` should remain an explicit category, not a fallback for malformed `categories`. `primaryItemCategory()` currently assumes at least one category and falls back to `def.categories[0]!`; preserve the invariant that every `ItemDef` has at least one explicit category.

The limited current audit did not reveal a mandatory obvious item that must become `other`. For example `key` is explicitly `utility` and has a real utility role. It is valid for `other` to have zero current members if no existing item clearly belongs there. Do not move items merely to make the new filter appear in a test world.

## 4. Shared category order — avoid another inventory-only drift

There are currently two ordering authorities with the same conceptual list:

- `src/items/items.ts::CATEGORY_SORT_ORDER`;
- `InventoryScreenItemList.vue::CATEGORY_ORDER`.

The plan does not require a refactor, so the safest implementation is to update both consistently to:

`weapon → armor → tool → story → knowledge → food → utility → resource → other`.

Do not broaden this polish into a category-registry refactor unless implementation finds a trivial existing export seam. The main requirement is that `primaryItemCategory()` and Inventory list sorting agree.

## 5. Canonical cave names already exist — consume `WorldLocation`, do not invent names

Current code does have a canonical world-location name for caves:

- `src/world/locations/worldLocationTypes.ts::WorldLocation` contains `{ id, kind, x, z, name, discoveryWeight }`;
- `src/world/locations/worldLocationCatalog.ts` resolves a cave id to a location with
  `name: landmarkName(seed, 'cave', id)`;
- `WorldLocationCatalog.getById(id)` resolves a stable location id directly, including the `cave:` branch.

So the source plan's optional `locationName` does not need a new naming system. Where a quest binding already contains `caveLocationId`, the application/materialization seam can resolve the existing `WorldLocation` once and pass its `name` to prose generation.

Do **not** call `landmarksWithin`, `landmarksInRange`, terrain sampling, or any discovery search to obtain the name. `getById(binding.caveLocationId)` is the correct catalog seam. It returns canonical world data, not player knowledge; the role rule below decides whether that name may be spoken.

Do not persist the chosen phrase or name. Cave names are deterministic world data and quest prose is derived presentation.

## 6. Keep lookup/materialization separate from the pure prose formatter

Recommended split:

1. application/quest materialization already knows the bound quest, cave id/location id, settlement and NPCs;
2. resolve presentation inputs there:
   - `WorldLocationCatalog.getById(caveLocationId)` → `x`, `z`, `name`;
   - `Caves.archetypeOf(caveId)` → `CaveArchetype`;
   - settlement position → direction delta;
   - giver/speaker `Role` from the existing NPC descriptor/opportunity record;
3. call `cardinalDirectionPhrase(dx, dz)`;
4. pass only plain resolved values into a pure formatter in the quest layer;
5. quest builders interpolate the resulting phrase into authored copy.

A suitable new module is `src/quests/caveLocationDescription.ts` (name may vary), importing only `Role`, `CaveArchetype`, and optionally the cardinal helper if direction is passed as deltas. Prefer passing the already-derived direction phrase if that keeps world coordinates out of the formatter.

The formatter must not import `WorldLocationCatalog`, `Caves`, `QuestManager`, `WorldBundle`, Three.js, settlement managers, or persistence.

Useful narrow API shape:

```ts
export type CaveLocationDescriptionInput = {
  archetype: CaveArchetype
  directionPhrase: string | null
  canonicalName: string | null
  speakerRole: Role | null
}

export function describeCaveLocation(input: CaveLocationDescriptionInput): string
```

Return a reusable noun/location phrase rather than a whole quest sentence. Example outputs:

- `mała jaskinia na północny zachód od osady`
- `głęboka jaskinia na północ od osady`
- `stary loch na wschód od osady`
- `Jaskinia Mroczna, na północ od osady`

This lets individual quest lines remain natural without creating separate location logic per quest.

Add JSDoc on the public formatter noting that all world identity/lookup is resolved by callers and include `@domain quests-progression`.

## 7. Role-based use of canonical names — keep it a tiny deterministic allowlist

`src/ai/characters.ts::Role` currently is:

`woodcutter | farmer | guard | trader | miner | fisher | hunter | blacksmith | shepherd | textile_worker | herbalist`.

Implement the plan's V1 naming rule as a small explicit set/readonly array in the formatter module, initially:

`guard`, `hunter`, `miner`, `trader`.

Semantics:

- role in allowlist + non-empty canonical name → use the name;
- otherwise use archetype description;
- direction is appended in both cases when available;
- no random roll, traits, relation, renown, household, memory, or persistent familiarity.

Keep this rule presentation-only. It must not alter `LocationKnowledge`, reveal a location by itself, or mark anything discovered. The quest's existing `reveal_location` effect remains the state-changing action.

Tests should make the important information boundary explicit: the same location with `guard` may render its name, while `farmer` renders the archetype description even though both calls receive the same canonical name.

## 8. Archetype wording — use actual current three-value enum

`src/world/caves/caveArchetype.ts` currently defines exactly:

`natural | adventure | dungeon`.

Recommended stable baseline mapping for tests:

- `natural` → `mała jaskinia`;
- `adventure` → `głęboka jaskinia`;
- `dungeon` → `stary loch`.

Choose one deterministic phrase per archetype for V1. Do not randomly rotate synonyms (`niewielka`, `duża`, `rozległy`) because that makes authored-copy tests and repeated conversations unstable without adding gameplay value.

Do not expose `natural`, `adventure`, `dungeon`, `Cave V2`, or topology terminology to players.

## 9. Legacy `rockDen` is not a cave archetype and should stay outside the formatter unless a real quest call-site needs it

Current fauna uses `SpawnerType = 'rockDen' | 'thicket' | 'grove' | 'wolfDen'` in `src/fauna/AnimalSpawner.ts`. The old decorative spawner `cave` was deliberately renamed to `rockDen` by fauna-019 while retaining the legacy on-disk id segment for save compatibility.

`rockDen` is therefore not a `CaveArchetype` and should not be added to `CaveArchetype` or silently fed through `describeCaveLocation()`.

For this plan, only add a separate player-facing `rockDen` phrase if recon of an actual quest affected by the cave-dialogue pass shows that it points at a `rockDen` rather than a walk-in cave. Otherwise leave the legacy paragraph as a guardrail/non-goal and avoid widening the helper signature.

## 10. Existing direction seams — centralize prose, not compass math

`src/quests/cardinalDirection.ts` is already the canonical eight-sector implementation and has tests for N/NE/E/SE/S/SW/W/NW with world north = `-Z`.

`src/app/createApp.ts` already uses it for at least:

- `homeCave` direction relative to `homeDef`;
- treasure-map source direction relative to home settlement.

Do not duplicate sector math in the new formatter.

The app currently builds one legacy cave source object using a fauna home-cave spawner (`findHomeCaveSpawner`) and stores `directionPhrase`. That is not sufficient for the newer bound walk-in cave quests, which carry real `caveId`/`caveLocationId`. Do not force newer quests back through the old home-spawner abstraction just to reuse text.

Where `src/world/locations/treasureMapBearCave.ts` still has its own local compass wording, do not automatically refactor it unless the affected dialogue path is in this plan and doing so is a small direct reuse. Avoid unrelated cleanup.

## 11. Cave-bound quest builders currently lack presentation context

The newer physical cave stories resolve correct world identity but their builders mostly receive only binding + NPCs + settlement name. Example:

`buildLostHunterNaturalCaveQuest(binding, npcs, settlementName)` currently emits:

- `progressLine: 'Wiem już, gdzie szukać — trzeba zajrzeć do tej jaskini.'`
- later generic `W jaskini...` text.

`oldBonesAdventureCave.ts` still contains `w konkretnej jaskini`.

`suspiciousTransportCaveCache.ts` currently says `Schowek jest w konkretnej jaskini...` even though its stage immediately reveals `binding.caveLocationId`.

`dungeonBanditTreasure.ts` and `lostTreasureExpedition.ts` similarly bind a specific dungeon and are candidates for the same presentation input.

Do not make each builder look up world data independently. Extend builder input with one small resolved presentation value, for example `caveDescription: string`, or a shared small presentation object if a builder needs both long/short variants. Prefer resolving it at the existing createApp/materialization call-site because that layer already has the world services.

This keeps quest definition modules deterministic and easy to unit test.

## 12. `createApp.ts` is the likely integration owner for generated cave quests

Current `createApp.ts` materializes multiple world-backed quest definitions and already calls functions such as `buildLostHunterNaturalCaveQuest(...)` while iterating real settlement/world data. It also owns the live `WorldLocationCatalog` and `WorldBundle` seams.

For each resolved cave binding, derive its prose context once close to quest construction. Suggested helper at app/quest integration level:

```ts
resolveCaveQuestPresentation({
  caveId,
  caveLocationId,
  settlementX,
  settlementZ,
  speakerRole,
})
```

This helper may use `worldLocationCatalog.getById`, `bundle.caves.archetypeOf`, and `cardinalDirectionPhrase`, then call the pure quest formatter. It should not become a manager or cache.

If several quest constructions need the same logic, keep a small shared resolver local/module-level rather than repeating four lookup blocks.

For authored cave quests in `src/quests/quests.ts`, preserve the existing token/binding approach where appropriate. The important invariant is that location wording is derived from the bound target, not hand-coded per quest.

## 13. Speaker role must match the NPC who actually communicates the location

Do not blindly use the quest giver role for every stage.

Examples:

- `lostHunterNaturalCave`: the **witness** is the NPC who says where to search, so name-vs-description should use `witness.role`, not giver role.
- `suspiciousTransportCaveCache`: the giver provides the cache location, so use giver role.
- `oldBonesAdventureCave`: inspect the stage that first identifies the cave; use that speaking NPC's role.
- dungeon stories: use the role of the NPC whose `offerLine`/progress line actually gives the location.

Resolve the role from the same `OpportunityNpc`/settlement descriptor list already passed to each builder. Avoid adding a second NPC lookup service.

This is the main reason to prefer passing `caveDescription` at the relevant stage-building call-site or deriving it from an explicit `speaker` record rather than storing one global quest-level description too early.

## 14. WorldLocation name grammar — keep V1 sentence templates compatible with nominative names

`WorldLocation.name` is a display name generated by `landmarkName(...)`; the catalog does not expose grammatical cases.

Avoid building Polish strings that require declining an arbitrary location name (`do <genitive>`, `w <locative>`) unless the existing names are verified to support it. Prefer templates that can safely insert the canonical display name in nominative form, e.g.:

- `To miejsce nazywa się ${name}; wejście jest na północ od osady.`
- `${name} leży na północ od osady.`

If current generated cave names are already phrases that work after `w`, that can be used, but do not assume this without checking `worldLocationNames.ts` during implementation.

Archetype fallback phrases can be authored freely because their grammar is controlled by us.

## 15. Do not couple category polish to story-item sale/drop safety

Current inventory detail UI shows generic value and sell/drop actions independently from `ItemCategory`; trade code has separate eligibility/value rules. The broader audit identified story-item lifecycle concerns, but this plan intentionally does not own them.

Therefore:

- changing `signet_ring`/ledger/journal/map to `story` must not implicitly disable `Wyrzuć`;
- do not change `tradeCatalog.ts` merely because the category changed;
- do not add `if (category === 'story')` transaction guards;
- if tests expose an already-existing quest lock caused by selling/dropping an item, record/fix it under the appropriate lifecycle plan rather than hiding it inside category UI.

## 16. Tests with highest implementation value

Prefer small pure/component tests over large QuestManager rewrites.

### Inventory/categories

- `InventoryScreenItemList` row for an item with `treasureMap` metadata exposes `Odczytaj` and invokes existing `ui.inventory.onRead`;
- existing book row still exposes `Czytaj`;
- `useItemCategoryLabels` covers `story → Fabularne`, `other → Inne`;
- `primaryItemCategory()` ordering covers `story` before `knowledge/resource` and `other` last;
- the five explicit story items have `story` category;
- exhaustive icon/filter records compile with both new categories.

### Pure cave formatter

Add a focused test file next to the helper, covering at least:

- natural + NW + ordinary role → `mała jaskinia ...`;
- adventure + N + ordinary role → `głęboka jaskinia ...`;
- dungeon + E + ordinary role → `stary loch ...`;
- canonical name + `guard` → named form;
- same canonical name + `farmer` → archetype form;
- no canonical name + allowed role → archetype fallback;
- null direction → stable neutral suffix/fallback;
- deterministic identical input → identical output.

### Quest integration

Do not duplicate all copy in brittle snapshots. For representative builders assert that the first location-giving line contains the supplied/derived cave phrase and no longer contains technical placeholders such as `konkretnej jaskini` / `konkretnym lochu` / `dokładny loch`.

Highest-value representative set:

- lost hunter (`natural`, witness role);
- old bones (`adventure`);
- suspicious transport (`natural`);
- one dungeon story (`dungeon`).

Existing quest state/effect assertions should remain unchanged — this plan is presentation/category UX, not lifecycle.

## 17. Likely files

Core inventory/category:

- `src/items/items.ts`
- `src/ui-vue/composables/useItemCategoryLabels.ts`
- `src/ui-vue/screens/InventoryScreenItemList.vue`
- `src/ui-vue/screens/InventoryScreenItemDetails.vue`
- `src/ui-vue/components/MerchantItemDetailsModal.vue`
- `src/ui-vue/components/MerchantFilterBar.vue` if still exhaustive

Core cave prose:

- new small pure helper under `src/quests/`
- `src/quests/cardinalDirection.ts` only for reuse/tests, not compass redesign
- `src/app/createApp.ts` for resolved world/location/archetype inputs
- `src/quests/lostHunterNaturalCave.ts`
- `src/quests/oldBonesAdventureCave.ts`
- `src/quests/suspiciousTransportCaveCache.ts`
- `src/quests/dungeonBanditTreasure.ts`
- `src/quests/lostTreasureExpedition.ts`
- `src/quests/quests.ts` for remaining authored cave-bound copy/bindings

Reference only unless a real integration need appears:

- `src/world/locations/worldLocationTypes.ts`
- `src/world/locations/worldLocationCatalog.ts`
- `src/world/locations/worldLocationNames.ts`
- `src/world/caves/caveArchetype.ts`
- `src/ai/characters.ts`
- `src/fauna/AnimalSpawner.ts`

Do not add persistence fields, a location-knowledge subsystem, an NPC familiarity model, random prose selection, a new cave type, or a category-driven trade policy.

Manual browser verification remains user-owned.
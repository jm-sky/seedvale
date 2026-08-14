# Plan 106 — Implementation notes

**Status:** implemented, technically verified. Browser/manual verification **not done** — see checklist below.

## Implemented

### 1. Player needs
- `src/shared/HungerState.ts` / `src/shared/ThirstState.ts` — new `{max, current}` pools mirroring the existing `StaminaState`/`VigorState` shape (`current` = "how full", not the 0-1 urge accumulator NPC `ai/Needs.ts` / fauna `AnimalLife.ts` use).
- `src/player/PlayerNeeds.ts` — `PlayerNeeds = { stamina, vigor, hunger, thirst }`, reusing `StaminaState`/`VigorState` verbatim for the first two. Drain rates are tuned against the default `dayLengthSec` (480s): hunger empties over ~3 game days, thirst ~2.5, vigor ~1. Stamina drains on sprint / regens otherwise (`tickPlayerStamina`, called from `PlayerController.update`).
- `PlayerController.needs: PlayerNeeds` (new field, alongside existing `health`). Sprint is now gated by `!isExhausted(stamina)`.
- `applyStarvationDamage()` — HP drain while hunger or thirst is fully depleted, via the existing combat-agnostic `damageHealth` (same path fauna bites use). No new death/UI system — matches the plan's "should not introduce a broad disease/death framework."
- Time-skip (`world/timeSkip.ts`) integration in `gameLoop.ts`: hunger/thirst/vigor freeze while a skip animates (`worldDt = 0`, same convention as fauna/settlements) and catch up in one lump on `skip.justFinished`; a `fadeStrength === 1` skip (rest/sleep) additionally does a full `restoreNeedsFromSleep` (vigor + stamina to max).
- Persistence: `SaveData` bumped to **v13**, adds `playerNeeds: { hunger, thirst, vigor }` (stamina stays transient per plan §8). Migration default for older saves is full pools. New Game resets via `resetPlayerNeeds`.

### 2–3. Food items & water container
- New `ItemKind`s: `tomato`, `raw_meat`, `roasted_meat`, `bread`, `waterskin_empty`, `waterskin_full` — ordinary `Inventory` items (`items.ts`/`itemCatalog.ts`), no parallel food/water system.
- `ItemCatalogEntry.consumable?: { need: 'hunger'|'thirst', relief, resultKind? }` — single source of truth for both the inventory "Zjedz"/"Wypij" button and the relief amount; `resultKind` handles the waterskin's full→empty container swap (Inventory is count-based, no per-instance state, so "filled" vs "empty" is two `ItemKind`s rather than a flag).
- Relief values (placeholder balance, not tuned by playtesting): tomato 12, raw_meat 15 (eatable raw, deliberately less than roasted — no disease penalty since illness is out of scope), roasted_meat 35, bread 30, waterskin_full 45 thirst.
- Acquisition: tomato is a renewable per-garden-pad spawn point (`createItemSpawners.ts`, same mechanism as shell/stone, anchored on `gardens` like the existing farm-tool spawns) — satisfies "collected from settlement gardens" with zero new spawner infrastructure. `bread` and `waterskin_empty` are merchant-purchasable (`tradeCatalog.ts`, reusing `trade.ts`) — same mechanism as `tent`/`long_sword`.

### 4. Water sources
- `src/world/WaterSource.ts` — `{ kind: 'well'|'lake', quality: 'safe'|'unsafe' }` + `DRINK_THIRST_RELIEF`/`UNSAFE_WATER_WARNING` constants. Deliberately data-only; the actual `Inventory`/`PlayerNeeds` mutation happens in `gameLoop.ts`/`createApp.ts` (same reasoning as the existing `campfire`/`item`/`corpse` handling — inventory access `resolveInteraction.ts` doesn't have).
- Well: existing `resolveInteraction`/flavor-dialog/quest-hook (`woda-dla-marka`) path is preserved; drink/fill is layered alongside it, not replacing it.
- Lake: **no discrete "Lake" world object** — a synthetic per-frame candidate (`interactables.ts`'s `isNearLakeShore`), built the same way `buildDigTarget` synthesizes a ground-work target. Reuses fauna's own `shoreProbeHits` (plan 094) for "is this a water's edge" and `terrain/waterBodies.ts`'s `oceanMixAt` (the same continentalness signal the water shader uses) to exclude the ocean shore. Required exposing `region: RegionParams` on the public `ChunkManager` type (previously internal-only) so `interactables.ts` could read `oceanThreshold`/`coastThreshold`.
- `[E]` always drinks directly (well or lake); `[R]` fills a carried `waterskin_empty`. Prompt is static (`[E] Napij się · [R] Napełnij bukłak`) regardless of inventory state — same convention as the existing campfire prompt not checking for a branch first — with a toast error if `[R]` is pressed with no empty waterskin.
- Lake drink shows the illness-risk warning (`UNSAFE_WATER_WARNING`, exact plan copy) as a toast; no illness system exists or was added.

### 5. Animal → meat
- `AnimalAgent.canHarvestMeat()` / `harvestMeat()` — a `meatHarvested` flag alongside the existing `foodClaimedBy`/`foodConsumed` predator-feeding flags (independent consumer, same corpse-state pattern).
- Interactable `corpse` variant now carries `action: 'bury' | 'harvest'` — knife-held offers harvest, shovel-held offers bury. These never compete for the same corpse since `HeldTool` is a single slot (only one tool held at once).
- `createApp.ts`'s `startHarvestMeat` mirrors `startBuryCorpse` exactly (busy channel, same duration order of magnitude) but yields `raw_meat` instead of disposing the corpse.

### 6. Cooking
- `src/items/campfireCooking.ts` — `COOKING_RECIPES: { input, output, count }[]` flat lookup table (currently one row: `raw_meat → roasted_meat`) + `findCookingRecipe(inventory)`. A future recipe is another row, not a new mechanism — no crafting UI was added.
- Wired as `[R]` on a **lit** campfire (`[E]` still adds fuel, unchanged). `campfire` interaction moved out of the old "only `[E]`" dispatch chain into its own top-level branch (mirroring `tent`'s existing `[E]`/`[R]` pattern) so both keys are handled.

### 7. UI
- `HudScreen.vue` — four thin bars (stamina/vigor/hunger/thirst) using the same colors as the existing NPC/animal label bars (`.npc-label__bar--{stamina,vigor,satiety,hydration}` in `index.html`), driven by `ui.hud.playerNeeds` (new `HudState` field) via `setHudPlayerNeeds`.
- `InventoryScreenItemDetails.vue` — new "Zjedz"/"Wypij" button, shown when `ITEM_CATALOG[kind].consumable` exists.
- Contextual `[E]`/`[R]` prompts for well/lake/campfire as above (`app/interactables.ts`).

### 8. Persistence
- Covered under §1 above (`SaveData` v13).

## Deviations / judgment calls
- Raw meat is directly edible (reduced relief, no penalty) rather than inedible — the plan lists `raw_meat`/`roasted_meat` as separate items without explicitly forbidding eating raw meat, and "Consuming a food item reduces hunger according to its definition" reads as a per-item rule rather than an exclusion list. No disease system exists to attach an eating-raw-meat penalty to.
- Drinking/filling at a water source is instant (no busy channel) — consistent with other instant world actions (item pickup); only dig/chop/mine/cook/bury/harvest use the busy channel.
- Balance numbers (drain rates, relief amounts, merchant prices) are placeholder — not tuned by actual play.

## Technical verification

```
npx tsc --noEmit   # clean
npm run lint       # clean (on all touched files)
npm run build      # clean (vue-tsc + vite build)
npm run test       # 567/567 passing (84 files)
```

## Browser/manual verification — NOT done

This session did not launch the dev server (per `CLAUDE.md`: browser verification should be done by the user against the running dev server, not by the agent). Please check:

1. Needs bars (stamina/vigor/hunger/thirst) appear in the HUD and drain/recover over time as expected; sprint disables when stamina is empty.
2. Tomato can be picked near a settlement garden and eaten from the inventory screen ("Zjedz").
3. Killing an animal, then holding the knife and pressing `[E]` on the corpse yields raw_meat (and does **not** conflict with shovel-bury — only one prompt shows depending on held tool).
4. Raw meat can be cooked at a **lit** campfire with `[R]` → roasted_meat; `[R]` on an unlit fire / without raw_meat shows the expected error toast.
5. Roasted meat restores more hunger than raw meat when eaten.
6. Well: `[E]` drinks and restores thirst (existing flavor dialog/quest hook still fires); `[R]` fills a carried empty waterskin (buy one from the merchant first) into a full one.
7. Waterskin: full → "Wypij" in inventory restores thirst and turns it back into an empty waterskin.
8. Standing at a lake shoreline (not the ocean coast) shows the same `[E]`/`[R]` prompt; drinking shows the illness-risk warning toast. Standing at the ocean shore should **not** show this prompt.
9. Sleeping (tent/camp/town rest, all 8h skips) restores vigor/stamina to full and still advances hunger/thirst by roughly the skipped duration.
10. Letting hunger or thirst hit zero causes slow HP loss; eating/drinking stops it.
11. Save, reload, confirm hunger/thirst/vigor round-trip; load an old (pre-106) save and confirm it starts with full needs pools without error.
12. No unrelated NPC/fauna behavior regression (NPC well-drinking, corpse predator-feeding, bury still work).

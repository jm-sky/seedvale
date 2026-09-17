# Implementation Notes: Settlement Cultivation Hydration, Rain & Farmer Watering

**Plan:** `docs/plans/settlements-npcs-043-settlement-cultivation-hydration-rain-and-farmer-watering.md`  
**Reviewed:** 2026-09-17  
**Status:** `implementation guidance`

## 1. Review result

The draft is directionally correct, but the current code changes several important implementation choices.

The implementation should **not** extend `HouseholdAgricultureState` with field hydration and should **not** make `CultivationAnchor` the mutable owner. Settlement cultivation needs a small persistent **site record** because hydration belongs to the cultivation site shared by Farmers/households, while the current household agriculture state is per-family and owns only starter-seed/off-screen temporal bookkeeping.

The smallest architecture consistent with current code is:

```text
VillagePlan landmark id
        ↓
stable settlement cultivation-site id
        ↓
SettlementCultivationRecord (persistent, data-only)
        ↓
shared lazy hydration/rain/drought primitives
        ↓
loaded: planFarmWork() + real well visit + watering
unloaded: existing bounded agriculture catch-up + hydration productivity constraint
```

No separate watering manager, Farmer AI, crop lifecycle, weather simulation, NPC scheduler or duplicate crop registry is justified.

## 2. Current code facts that supersede the draft

### Player cultivation is already fully hydration-aware

`src/world/playerGarden.ts` already implements plan `settlements-npcs-001` on `PlayerGardenRecord`:

- `hydration`;
- `lastHydrationUpdateAtDays`;
- `droughtStressDays`;
- `resolveGardenHydration()`;
- `applyGardenWatering()`;
- `resolveGardenHydrationAfterHarvest()`;
- `HYDRATION_DRY_RATE_PER_DAY`;
- deterministic rain from `computeWeather()` / `WEATHER_CYCLE_DAYS`;
- bounded `HYDRATION_SIM_WINDOW_DAYS` replay;
- `droughtYieldMultiplier()` / `cultivationYieldCount()`;
- `WATERING_HYDRATION_GAIN` and `WATERING_LITRES`.

The bounded resolver is important: gaps older than the five-day drying horizon do not replay world history. Preserve this exact semantic when sharing the rules with settlement cultivation.

The old plan text saying low hydration literally pauses `CropLifecycle` is stale. Current implementation deliberately leaves `cropLifecycle.ts` unchanged; low water affects drought/yield, not the shared natural-crop lifecycle clock.

### Current detailed Farmer work does not water settlement cultivation

`src/ai/npcProfessionWork.ts::planFarmWork()` currently does:

```text
resolve cultivation anchor
→ harvest real harvestable crop if present
→ otherwise plant from real Household seed stock
→ otherwise no profession action
```

There is no settlement hydration check and no source→field watering chain today.

The old player-garden NPC watering seam in `SettlementFoodSourceHooks.gardenNear()/waterGarden()` is only for `PlayerGardenRecord`; `foodSources.ts` explicitly treats settlement-garden crops as having no maintenance/hydration owner.

### `CultivationAnchor` is geometry/read context only

`src/world/cultivationAnchor.ts` currently owns only:

```ts
type CultivationAnchor = {
  position: { x: number, z: number }
  radius: number
}
```

This is the correct responsibility. Do not move hydration, drought, weather history, source selection or AI state into it.

It is acceptable to add a **read-only identity field** needed to bind a runtime anchor to a persistent site record, but the anchor must remain a projection/read contract.

### Settlement fields already use the Farmer anchor seam

Plan `settlements-npcs-030` is implemented. `src/settlement/props.ts` prepends `cultivationAnchorFromSettlementField()` for `foodSourceType === 'field'`, so `resolveCultivationAnchor()` selects the field before garden fallbacks. Other settlements use the primary garden anchor.

This plan should preserve that existing authoritative target selection rather than hydrating every decorative/secondary cultivation visual.

### Off-screen agriculture already exists and is intentionally aggregate

`src/settlement/settlementAgriculture.ts` owns the narrow non-home catch-up introduced by `settlements-npcs-030` and extended by seed recovery:

- capacity derives from adult Farmer coverage;
- elapsed time derives from `Household.agricultureLastResolvedAtDays()`;
- calculation is bounded by crop kinds, not elapsed days;
- real seeds are consumed/recovered in `Household.items`;
- real food is deposited through `Household.depositFood()` / `SettlementEconomy`;
- no historical `CropPlacement`, `NpcAgent` or profession actions are recreated.

Do not add off-screen Farmer walking/watering actions. Extend this catch-up with a cultivation productivity constraint.

## 3. Authoritative owner and persistent record

### Decision

Add a small data-only persistent record for a settlement cultivation site, e.g. in `src/settlement/settlementAgriculture.ts` or a narrowly named sibling if that file becomes too large:

```ts
type SettlementCultivationRecord = {
  id: string
  settlementId: string
  landmarkId: string
  hydration: number
  lastHydrationUpdateAtDays: number
  droughtStressDays: number
}
```

Do **not** persist `x`, `z`, radius, field/garden mesh identity or weather history. Position/footprint are deterministic projections of the current `SettlementDef.villagePlan` and runtime landmarks.

The long-lived owner should follow the same lifecycle as other registry-owned settlement state: owned beneath `SettlementsManager`, surviving stream-out/in and serialized through the existing save pipeline. A tiny state registry/map is acceptable if it only provides record ownership/lookup/serialization; it must not tick, select NPC work or become a `SettlementWateringManager`.

### Why not `HouseholdAgricultureState`

`HouseholdAgricultureState` is per-family and currently owns:

- `starterSeedsGranted`;
- `lastResolvedAtDays`.

A field/garden can be worked by more than one Farmer/household, and current detailed Farmer targeting is settlement-level. Putting hydration on each household would duplicate one physical field's state and make route/yield results depend on which household asks.

### Why not `SettlementEconomy`

Hydration is physical site state, not village stock/economy. `SettlementEconomy` must not become the owner merely because it already survives streaming.

### Why not `CultivationAnchor`

The anchor is reconstructed runtime geometry. Persisting mutable state on it would couple simulation to presentation and violate the current projection contract.

## 4. Stable cultivation-site identity

`src/settlement/villagePlan.ts::VillageLandmarkPlan` already has a stable `id`, `kind`, `index` and planned world position. Use that identity instead of coordinates.

Add one canonical helper, conceptually:

```ts
settlementCultivationSiteId(settlementId, landmarkId)
```

with a stable format such as:

```text
<settlementId>:cultivation:<landmarkId>
```

The exact string format is less important than having one owner/helper and tests. Never derive persistence identity from rounded `x/z`, runtime `Object3D`, array position alone or crop placement ids.

For V1 there is one authoritative site per settlement, matching current Farmer behaviour:

1. `foodSourceType === 'field'` → the planned `field` landmark;
2. otherwise → primary planned `garden` landmark.

If `CultivationAnchor` receives `siteId?: string`, require real settlement-produced anchors to supply it. Keep optional compatibility only for old tests/fixtures/fallback anchors that are not allowed to own settlement hydration. Do not invent a coordinate-derived id for the fallback.

Future multiple fields can create additional records under the same key scheme without changing hydration ownership.

## 5. Share player hydration rules without a parallel system

The current generic math happens to live in `playerGarden.ts` and its signatures use `Pick<PlayerGardenRecord, ...>`. That is now too player-record-specific for a second site owner.

Extract only the generic hydration/drought primitives into a small world-domain module, e.g. `src/world/cultivationHydration.ts`:

```ts
type CultivationHydrationState = {
  hydration: number
  lastHydrationUpdateAtDays: number
  droughtStressDays: number
}

resolveCultivationHydration(state, seed, worldDays)
applyCultivationWatering(state, seed, worldDays)
resolveCultivationHydrationAfterHarvest(state, seed, worldDays)
droughtYieldMultiplier(...)
```

Move/reuse the existing constants and bounded weather walk; do not rewrite the formula. `PlayerGardenRecord` should continue embedding the same three fields and use these functions. Compatibility re-exports from `playerGarden.ts` are acceptable if they keep existing imports stable and avoid a noisy unrelated refactor.

Keep `care`/weed maintenance player-garden-specific. Settlement cultivation in this plan gets hydration/drought only; do not silently add settlement `care` because the current settlement farming system has no authoritative maintenance state.

`src/world/weather.ts` remains the one deterministic weather owner. Do not persist rain history or create settlement-specific precipitation.

## 6. Crop/yield boundary

Do not change `src/world/cropLifecycle.ts` to know about settlement hydration. It still serves natural crops and owns species timing/base yield only.

The required boundary is:

```text
CropLifecycle base harvest
        +
cultivation owner lookup at crop position
        ↓
player garden or settlement cultivation site
        ↓
shared drought/hydration modifier
        ↓
final cultivated yield
```

`src/world/foodSources.ts::harvest()` currently applies player-garden modifiers only. Extend the harvest domain seam so a crop can resolve a cultivated-site context without duplicating the math.

The player harvest path in `src/app/actions/gatheringActions.ts` also applies `cultivationYieldCount()` directly. It must use the same domain helper/resolver, otherwise player harvesting a settlement crop and Farmer harvesting it can produce different yields.

Natural/wild crops with no cultivation owner remain unchanged.

After a successful cultivated harvest, reset that site's accumulated drought stress with the same shared post-harvest rule. Do not reset stress on watering.

## 7. Water-source discovery

### `WaterSource` alone is not enough

`src/world/WaterSource.ts` describes source semantics (`kind`, `quality`, optional rope/risk), but contains no id, position or spatial query. It cannot by itself answer:

```text
field → nearest usable source
```

### Existing well lookup is the correct foundation

The current NPC water-fetch path already has two useful pieces:

- `SettlementLandmarks.wells` — central/household settlement wells with stable ids, position and queue id;
- `PlayerWells.nearestCompleted()` / `NearbyPlayerWellLookup` — despite the legacy method name, it filters with `isWellWaterAvailable()` and therefore returns a currently usable player-built well; a completed roof is not required.

`NpcAgent.resolveWaterWellTarget()` already chooses a nearby well at action start and prefers the closer source. Generalize/extract that **selection policy** so it can resolve from an arbitrary origin such as the field, rather than adding a second watering-specific well search.

The new narrow query should return enough read-only data for an action chain, e.g.:

```ts
type NpcWaterSourceTarget = {
  id: string
  position: { x: number, y: number, z: number }
  queueId: string | null
  source: WaterSource
}
```

Exact type/location should follow the smallest current dependency seam. The important invariants are stable identity, position, current usability and deterministic nearest-distance + stable-id tie-break.

### V1 source set

For this plan, a Farmer watering source should be a **usable well source already represented by current NPC infrastructure**:

- settlement wells;
- usable player-built wells.

Do not add lake/river shoreline discovery merely to satisfy the word “source”. Natural water interaction exists for the player, but there is no current stable bounded NPC point lookup equivalent to wells. Adding one is separate scope and unnecessary for the Builder-well route use case.

Do not require full `isWellCompleted()` if current water semantics use `isWellWaterAvailable()`. A well under roof construction may already provide water; an unavailable/repair-blocked well must not.

## 8. NPC water payload: no physical bucket in this plan

### Decision

V1 should **not require `wooden_bucket` / `copper_bucket` item instances on the Farmer**.

The current liquid-container model is real and player watering consumes 1 L, but NPC profession work does not have generic persistent liquid-container logistics. Forcing a bucket here would require provisioning/ownership, instance liquid mutation, cancellation recovery and persistence semantics that are larger than this plan.

Use a **transient action-local water payload**, not a new persistent NPC state. It can be as narrow as “one watering charge / 1 L acquired” held by the planned action chain closure.

This is intentionally narrower than a fake `NpcHeldWater` system:

```text
plan action chain
→ visit real source
→ successful fill step sets local payload
→ visit exact cultivation site
→ successful/revalidated watering consumes payload
→ chain ends
```

The Farmer must still physically reach the source first. Therefore a nearer completed well shortens the real route and future Builder content gets the intended systemic consequence.

When/if NPC item/liquid logistics become generic later, this transient payload can be replaced without changing site hydration or source-selection ownership.

## 9. `planFarmWork()` integration

Extend the existing `src/ai/npcProfessionWork.ts::planFarmWork()`; do not add a Farmer AI or scheduler.

Recommended work priority:

```text
resolve authoritative cultivation site
→ resolve current hydration lazily
→ if watering is required and usable source exists:
     source action
     → field action
     → apply watering
→ else harvest ready crop
→ else plant from real seed
→ else normal fallback
```

Use a shared predicate tied to the current hydration constants (initially the existing drought threshold is the defensible trigger). Do not create a second magic threshold inside `npcProfessionWork.ts`.

The watering chain should use ordinary `NpcPlannedAction` lifecycle and `next`, the same mechanism already used by other multi-step work such as fishing/deposit.

Required revalidation:

- before/at source completion: source is still usable;
- before field mutation: site record still exists and is the intended site;
- resolve stale hydration again at mutation time;
- only then apply one shared watering gain.

Do not change hydration when planning starts. If movement/action is interrupted before final watering, hydration remains unchanged.

Source lookup should be performed from the **cultivation-site position**, not household home or current NPC position, because the future well quest is specifically about field→source route cost.

## 10. Runtime integration seam

`NpcWorkContext` already carries the read-only `cultivationAnchor`, `foodSources`, household/economy and transient `carried` inventory. Add only narrow cultivation/water hooks required by profession planning; do not pass `SettlementsManager` into `NpcAgent`.

A reasonable seam is conceptually:

```ts
cultivation?: {
  getState(siteId, nowDays): resolved read state
  water(siteId, nowDays): boolean
  resetAfterHarvest(siteId, nowDays): void
  resolveWaterSource(origin): NpcWaterSourceTarget | null
}
```

The exact grouping may differ if current hook conventions favor separate functions. Keep it actor-neutral and narrow. `NpcAgent`/profession planner should request operations, not mutate the registry record directly.

`createSettlement.ts` should bind the current settlement's authoritative site id/anchor and thread the narrow hooks into its NPCs. `SettlementsManager` remains the long-lived state owner.

## 11. Off-screen agriculture semantics

### Decision

Do **not** simulate off-screen Farmer watering routes or synthetic watering actions.

When a non-home settlement is unloaded:

- site hydration continues only through the shared lazy drying/rain resolver;
- no Farmer watering is injected;
- existing `resolveSettlementAgricultureCatchUp()` remains the only aggregate production path;
- catch-up uses the resolved site's hydration/drought as a productivity constraint.

This preserves the current hybrid-simulation contract: detailed physical work only while loaded; aggregate consequences while unloaded.

### Aggregate integration

Resolve the authoritative site once for the settlement/catch-up boundary and derive a deterministic cultivated yield for the batch calculation.

The aggregate code currently uses `CROP_DEFS[cropId].yieldCount` directly and derives seed recovery from that base yield. After this plan it must use the hydration-constrained yield consistently:

```text
base yield
→ shared hydration/drought yield modifier
→ actual aggregate yield
→ resolveCultivatedSeedRecovery(actual yield)
→ bounded batch count / item mutation
```

This is important because drought-reduced yield can also reduce recovered seed. Do not calculate food from reduced yield while still granting base-yield seed recovery.

Apply one settlement-site productivity snapshot to the bounded catch-up; do not replay historical Farmer actions/crop cycles/rain intervals beyond the existing bounded hydration resolver. This is an intentional aggregate approximation.

If at least one aggregate cultivated harvest is materialized, checkpoint/reset drought stress through the same post-harvest domain rule at `nowDays`. Repeated catch-up at the same `nowDays` must remain idempotent.

Home settlement remains detailed and does not use the aggregate production path.

## 12. Streaming and time continuity

Hydration state must outlive runtime props and `NpcAgent`s.

Required lifecycle:

```text
site record exists in manager-owned persistent state
→ settlement loads
→ planned landmark projects to CultivationAnchor + site id
→ detailed Farmer reads/mutates same record
→ settlement unloads (record remains)
→ time advances with no ticking
→ stream-in/catch-up lazily resolves record at nowDays
→ runtime uses same record again
```

Do not stamp hydration to “now” on unload the way household agriculture stamps its detailed/aggregate production boundary. Hydration has its own lazy weather clock and must preserve elapsed rain/drying through unloaded time.

`resolveTimeSkip()` must not create a second hydration loop. A later hydration read/catch-up at post-skip `worldDays` should resolve the elapsed interval deterministically from the persisted anchor.

## 13. Persistence and bootstrap exactly once

Current save schema is versioned (`CURRENT_SAVE_VERSION` is currently 48 at recon time). Do not hardcode that number into docs/code; implementation must re-read current `main` and use the normal migration chain.

Add only the minimal settlement cultivation collection/records required for non-derivable state.

Migration from a pre-043 save should initialize the new collection as empty. Do **not** infer “already bootstrapped” from hydration value or household seed state.

When the deterministic authoritative site is first resolved after migration:

- create exactly one record for its stable site id;
- initialize hydration to the same fresh-site baseline used by player cultivation (currently 100);
- `lastHydrationUpdateAtDays = nowDays`;
- `droughtStressDays = 0`.

This intentionally does **not** retroactively penalize a save for weather before the mechanic existed. Once the record exists, its presence is the bootstrap marker and it is persisted; stream-out/in and later save/load cannot recreate/reset it.

For a fresh world, create/get the record when the settlement's authoritative cultivation site becomes known through the normal deterministic plan/settlement lifecycle, again anchored at the current world day.

Do not store a separate boolean bootstrap marker if record existence already proves initialization.

## 14. Files / symbols expected to change during implementation

Primary:

- `src/world/playerGarden.ts`
  - extract/reuse generic hydration/drought primitives; preserve player semantics.
- `src/world/cultivationAnchor.ts`
  - carry read-only stable site identity if chosen by implementation; no mutable state.
- `src/world/foodSources.ts`
  - cultivated-site harvest/yield/reset seam for settlement sites as well as player gardens.
- `src/app/actions/gatheringActions.ts`
  - use the same cultivated-harvest modifier path for player harvests.
- `src/ai/npcProfessionWork.ts`
  - add dry-site priority and source→site watering action chain to `planFarmWork()`.
- `src/ai/NpcAgent.ts`
  - reuse/extract current well-target selection; only minimal context/wiring changes.
- `src/settlement/settlementAgriculture.ts`
  - settlement cultivation record/id helpers and aggregate hydration productivity integration, or split pure record registry into a narrowly named sibling if needed.
- `src/settlement/props.ts`
  - bind stable planned site identity to the existing runtime cultivation anchor; no state ownership.
- `src/settlement/createSettlement.ts`
  - authoritative site binding and narrow hooks into NPC work/catch-up.
- `src/settlement/SettlementsManager.ts`
  - long-lived state ownership/snapshot/restore wiring; no per-frame hydration loop.
- `src/persistence/saveData.ts`
  - schema validation/version migration for settlement cultivation records.
- `src/app/saveState.ts` / `src/app/worldBundle.ts`
  - only the existing snapshot/restore composition seams required by the new persisted collection.

Reference/reuse without changing semantics:

- `src/world/weather.ts` — deterministic global weather/rain owner.
- `src/world/cropLifecycle.ts` — base crop timing/yield; remain natural-crop-safe.
- `src/world/plantedCrops.ts` — cultivated seed/crop identity and sowing units.
- `src/world/WaterSource.ts` — semantic source data; not spatial owner.
- `src/world/playerWell.ts` — `isWellWaterAvailable()` / `wellWaterSource()`.
- `src/world/createPlayerWells.ts` — bounded usable player-well lookup, possibly enrich return identity.
- `src/settlement/villagePlan.ts` — stable `VillageLandmarkPlan.id` source.
- `src/settlement/household.ts` — preserve existing agriculture starter/time owner; do not add site hydration.

## 15. Tests with highest value

### Pure hydration/shared-rule regression

- extracting rules does not change existing `PlayerGardenRecord` drying/rain/watering/drought results;
- settlement record receives identical hydration result for identical hydration state/seed/time;
- very long elapsed time remains bounded;
- watering resolves stale rain/drying before `+WATERING_HYDRATION_GAIN`;
- post-harvest reset clears drought only, not hydration.

### Identity / persistence

- field settlement derives site id from stable field landmark id, not x/z;
- non-field settlement derives primary garden site id;
- same settlement rebuild produces same site id;
- migration starts with no retroactive drought;
- first resolve creates one record;
- unload/load and save/load preserve the same record/state;
- existing record is never reinitialized to 100.

### Farmer work

- dry site + usable source → source action before harvest/plant;
- source selection uses field origin and nearest deterministic usable well;
- completing a nearer player-built well changes selected source/route;
- unavailable player well is ignored;
- source interruption → no hydration change;
- final field action revalidates and waters once;
- no usable source → Farmer falls through to existing harvest/plant behaviour instead of deadlocking;
- hydrated site preserves current harvest-before-plant behaviour.

### Yield

- settlement cultivated crop uses drought modifier;
- player and Farmer harvest paths produce identical yield for the same settlement site;
- wild crop yield remains unchanged;
- zero hydration produces no cultivated food yield under the current shared rule;
- harvest resets settlement-site drought stress.

### Off-screen

- unloaded agriculture never creates synthetic watering/actions;
- rain/drying changes aggregate productivity deterministically;
- drought-constrained aggregate yield also drives seed recovery from actual yield;
- repeated catch-up at same `nowDays` is idempotent;
- large elapsed interval remains bounded;
- home does not run aggregate production.

## 16. Manual browser verification (user)

Do not run this from the implementation agent. The user should manually verify:

1. Observe a settlement field/garden hydration falling during dry weather.
2. Observe rain increasing/maintaining hydration without a scan/update spike.
3. Observe a Farmer detect a dry authoritative field/garden during normal `work`.
4. Farmer walks to a real usable well before returning to water the field.
5. With only a distant well, record/observe the longer route.
6. Complete/build a nearer usable player well near the field.
7. On the next watering need, Farmer selects the nearer well and visibly takes the shorter route.
8. An unfinished/unusable or repair-blocked well is not selected.
9. Drought lowers real settlement crop harvest while wild crops remain unchanged.
10. Move far enough to unload a non-home settlement, advance time, return and verify hydration/production continuity.
11. Save/load during a dry period and verify hydration does not reset.
12. Player-built garden watering/hydration remains unchanged.

## 17. Main implementation traps

1. Do not put field hydration into `HouseholdAgricultureState`.
2. Do not identify a cultivation site by x/z.
3. Do not mutate `CultivationAnchor` into a state owner.
4. Do not copy `resolveGardenHydration()` into settlement code; extract/reuse it.
5. Do not make `CropLifecycle` hydration-aware globally.
6. Do not use `isWellCompleted()` if current source usability is `isWellWaterAvailable()`.
7. Do not make `WaterSource` pretend to be a spatial registry.
8. Do not require physical bucket instances until generic NPC liquid-item logistics exist.
9. Do not apply watering at planning/source arrival; apply only after reaching/revalidating the site.
10. Do not search water from household home; search from the cultivation site.
11. Do not run aggregate agriculture and detailed Farmer production for the same interval.
12. Do not simulate off-screen Farmer routes.
13. Do not reduce food yield but still recover seeds from the unmodified base yield.
14. Do not reset hydration on unload/load or persistence restore.
15. Do not add per-frame settlement hydration work or a new worker.

## 18. Recommended implementation order

```text
1. Extract generic cultivation hydration/drought primitives with player-garden regression tests
2. Add stable settlement cultivation-site id + persistent record owner
3. Wire save schema/migration/bootstrap exactly once
4. Bind VillagePlan landmark identity → runtime CultivationAnchor/site record
5. Generalize cultivated harvest modifier/reset for player + NPC harvest
6. Extract/reuse arbitrary-origin usable-well target selection
7. Add planFarmWork() watering action chain with transient water payload
8. Apply hydration/drought productivity to existing off-screen agriculture catch-up
9. Add focused integration/persistence tests
10. Run repository technical checks required by current scripts; do not run browser verification or pnpm docs:sync
```

For important new public/architectural types and functions, add JSDoc with the appropriate `@domain` tag.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

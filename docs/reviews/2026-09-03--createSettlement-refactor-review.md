# createSettlement Refactor Review

**Date:** 2026-09-03
**Status:** `done` (review only — no code changed)
**Scope:** `src/settlement/createSettlement.ts` (933 lines) and its direct ownership boundaries
**Excluded:** `NpcAgent`, `AnimalAgent`, `buildSettlementProps`, `SettlementsManager`'s own public API

> Naming note: the reviews index uses `YYYY-MM-DD--NNN--slug.md`. This file was created at the
> path the task explicitly requested; renumber it to `2026-09-03--026--...` when adding the row to
> [README.md](./README.md) if the sequence matters.

---

## 1. Executive summary

`createSettlement.ts` is **a real orchestrator, not a monolith**. Its build sequence composes
existing owners (`buildSettlementProps`, `spawnLivestock`, `NpcAgent.create`, `createVillageFire`,
`createInteractionQueue`, `householdRegistry`, `createHouseholdExchangeHooks`,
`settlementPropColliders`, `storageVisuals`) and does not duplicate authoritative state anywhere.
Verified specifically:

- **Cleanup is correct.** `dispose()` covers every resource it owns. `HouseAssembly.dispose()` is
  never called here, but that is *not* a leak: it is `root.removeFromParent(); disposeObject3D(root)`
  and `root` is a child of `group`, which `disposeSettlementGroup(group)` walks
  (`houseBuilder.ts:813`, `props.ts:1722`, `loadGltf.ts:189`). `NpcAgent.dispose()` disposes its own
  mesh and leaves its interaction queue; `disposeLivestock` disposes livestock meshes;
  `pointLightBudget.unregisterSubtree(group)` mirrors the build-time `registerSubtree`;
  `clearColliders(def.id)` mirrors `registerColliders`; forest presences are unregistered.
- **Determinism is preserved.** `settlementSeed = cellSeed(seed, {gx,gz})` is derived once and
  re-derived per concern with distinct salts (`0x51ed270b`/`0x50485953` for physical profiles,
  `0x9e3779b1`/`0x4e494748` for the night-fire roll). Nothing reads wall-clock time or `Math.random`.
- **No parallel systems.** Every registry (`households`, `npcStates`, `economy`, `relations`,
  `livestockPersistence`) is threaded in from `SettlementsManager`, never re-created locally.

The genuine problems are narrower than the line count suggests, and they are all consequences of
the same growth pattern visible in the git history (~40 commits, almost all "+N lines, feature X"):

1. **A 26-parameter positional signature** (lines 242–313) duplicated as two identical 26-argument
   call sites in `SettlementsManager.ts` (lines 335–361 and 468–495). This is the file's highest-risk defect —
   every new hook edits three places and a positional mismatch between two same-typed parameters is
   a silent, compile-clean bug.
2. **Four cohesive runtime subsystems inlined in `update()`/`setDayNight()`**, each with its own
   closure state (door signature, signposts + land-plot signs, night lighting, NPC crowd pass). They
   are not orchestration — they are behaviour with tunable constants, and they are the reason the
   file has *zero* tests despite owning deterministic, testable rules.
3. **A signpost + CSS2D-label idiom duplicated 3× inside the file** and a 4th time in
   `SettlementsManager.ts` (`buildMidpointInstance`), where only the manager's copy has the
   quantized DOM-write guard.
4. **Per-frame allocations in `update()`**: three `new Array(agents.length).fill(0)` per settlement
   per frame, plus a per-house `map().join()` string signature per settlement per frame.

Recommendation: extract those four subsystems into small siblings that follow the file's *own*
existing patterns (`storageVisuals.ts`'s `.sync()` controllers, `wellInteractionQueue.ts`'s pure
config builder, `settlementPropColliders.ts`'s pure collider function), convert the constructor to a
dependency object, and leave the build sequence itself intact. Expected result: ~450–520 lines of
genuine orchestration, four new tested modules, and no behaviour change.

---

## 2. Current responsibilities

### 2.1 Build phase (lines 314–730)

| # | Lines | Responsibility | Domain |
|---|-------|----------------|--------|
| 1 | 314, 329–355, 472–491, 502–591, 643–698 | Boot instrumentation (`useBootMark` around 4 phases) | tools/debug |
| 2 | 316–328 | Site/seed derivation, road-segment lookup for the forest belt | settlement |
| 3 | 329–362 | `buildSettlementProps`, `scene.add(group)`, `pointLightBudget.registerSubtree` | rendering |
| 4 | 122–142, 364–374 | Collider set assembly + registration + door signature seed | world/collision |
| 5 | 376–398 | Forest tree presence registration + stage visual resolution | world (forest) |
| 6 | 400–431 | `homePlaces`, `VillageFire` construction with audio hooks, `socialPlace` | settlement/audio |
| 7 | 436–470 | Households: registry lookup, exchange candidates + hooks, `householdStorages` binding, `householdByHomeId` | economy/household |
| 8 | 472–491 | `spawnLivestock` | fauna |
| 9 | 493–591 | Namepost, dock materialization (+ `landmarks.dock`/`dockRoute` write), directional road signposts, land-plot sale signs | rendering/DOM |
| 10 | 593–622 | Well interaction queue construction | simulation |
| 11 | 624–698 | Family flattening, physical-profile seed, `npcState` hydration, `NpcAgent.create` ×N | npc |
| 12 | 700–730 | Spawn point, closure runtime state, woodshed development prop | settlement/economy |

### 2.2 Runtime phase (lines 732–932)

| # | Lines | Responsibility |
|---|-------|----------------|
| 13 | 750–786 | NPC crowd pass: O(n²) proximity counts + separation impulses, then `agent.update` |
| 14 | 790 | `advanceSocialPairing` |
| 15 | 795–828 | Livestock tick: `animal.update`, egg drop + vocalization, corpse removal + tombstoning |
| 16 | 829 | Woodshed live re-check |
| 17 | 837–844 | Storage visual sync (wood / settlement food / per-household food) |
| 18 | 845 | Village torch tick |
| 19 | 846–870 | House door proximity open/close, `assembly.update(dt)`, collider re-registration on change |
| 20 | 871–873 | Signpost label opacity |
| 21 | 877–888 | Land-plot sign live removal on purchase |
| 22 | 890–906 | `setDayNight`: night-fire ignition roll, torch dusk/dawn toggle, house-light intensity |
| 23 | 907–909 | `tickFire` |
| 24 | 910–931 | `dispose` |

That is **12 build concerns + 12 runtime concerns**. Roughly half of the runtime ones (13, 15, 19,
20, 21, 22) carry their own state and constants and are not orchestration.

---

## 3. Concrete architectural problems

### P1 — 26-parameter positional constructor (high)

Lines 242–313. Three parameters carry defaults *in the middle* of the list (`playAt`,
`pointLightBudget`, `relations`), so every later argument must be passed positionally even when
irrelevant. `SettlementsManager.ts` repeats the full 26-argument list twice (lines 335–361, 468–495)
— an identical block that must be kept in sync by hand.

Failure mode: `registerColliders` and `clearColliders` share the shape `(ownerKey: string, …)`-ish
adjacency; `getPlayerSocial`, `getNearbyPlayerWell`, `isLandPlotOwned`, `onAnimalDeath` are all
optional function parameters in a run. A future insertion in the wrong slot type-checks in several
of these positions.

### P2 — Runtime subsystems inlined with closure state (high)

`update()` is 141 lines mixing six unrelated per-frame concerns. Each has private state hoisted
above the returned object (`doorColliderSignature`, `signposts`, `landPlotSigns`, `woodshedPlaced`,
`nightFactor`, `nightIndex`, `currentNowDays`) that no test can reach. The behavioural rules that
matter — door hysteresis (2.6/3.4), separation radius/speed (0.5/1.5), group reaction radius (6),
per-size night ignition chance — are all untested.

### P3 — Signpost/label duplication (medium)

The `createSignpost()` → `placeOnGround` → `document.createElement('div')` → `CSS2DObject` →
`push({labelEl, label, position})` sequence appears at lines 505–524, 546–564 and 567–588, and again
in `SettlementsManager.ts:407–427`. Consequences:

- **Missing DOM write guard.** Lines 871–873 write `labelEl.style.opacity` every frame for every
  signpost. `SettlementsManager`'s midpoints (line 589) and `createFauna`'s spawner labels
  (`createFauna.ts:928`) quantize to 1/32 and skip unchanged writes. The settlement's own signposts
  do not — a per-frame layout-affecting style write per sign, per loaded settlement.
- Three slightly different dispose paths for the same shape (lines 921–928 dispose labels only,
  because the props live under `group`; line 883–887 disposes the prop too, because the sign is
  removed mid-life).

### P4 — Per-frame allocations (medium)

- Lines 751–753: three `new Array(agents.length).fill(0)` per settlement per frame (~3 arrays ×
  every loaded settlement × 60 fps).
- Lines 864–866: `houseAssemblies.map(a => a.doors.map(...).join('')).join('|')` builds one string
  per house plus one joined string per settlement, every frame, purely to detect a boolean change.
  `HouseDoor.isOpen()` returns the *logical* state and flips synchronously in `setOpen`
  (`houseBuilder.ts:468–475`), so a `boolean[]` comparison is exactly equivalent.
- Lines 848–855: `assembly.root.localToWorld(_entranceWorld)` per interaction point per house per
  frame. House roots are placed once at build time and never re-transformed afterwards
  (`buildAssemblyCollidersWorld` already relies on this by reading `root.position`/`root.rotation.y`
  directly), so entrance world positions can be precomputed once.

### P5 — Post-build mutation of `SettlementLandmarks` (low, ownership smell)

Lines 540 and 543 write `landmarks.dock` and `landmarks.dockRoute` *after* `buildSettlementProps`
returned the landmark set. `props.ts` documents `SettlementLandmarks` as the props builder's output.
This is defensible (the dock needs `roadCtx`, which `buildSettlementProps` does not take), but it
should live in one clearly-labelled place rather than in the middle of a signpost loop.

### P6 — Malformed `try`/`finally` block (low)

Lines 503–591: the `try` body is written at the enclosing indentation level, so the whole signpost
section reads as if it were not inside the block. Same shape at lines 646–695. Extraction removes
both.

### P7 — Repeated `familyIndex % homePlaces.length` indexing (low)

Lines 438, 450, 465, 629 repeat the same modulo fallback in four places, with a fifth variant at
line 461 (`familyIndex % landmarks.householdStorages.length`). Each is correct today; the pattern is
a standing invitation to introduce a mismatched pairing.

### P8 — No test coverage (medium)

There is no `createSettlement.test.ts`, and nothing else in the suite constructs a `Settlement`.
Every rule listed in P2 is currently verified only by playing the game.

---

## 4. What must stay in `createSettlement.ts`

Do **not** split these out. They are the module's actual job.

- The `Settlement` type and its documented `update`/`setDayNight`/`tickFire`/`dispose` contract.
- `settlementSpawnPoint()` — deliberately shared with `app/createApp.ts`; keep it here so the two
  call sites cannot drift.
- The `export type { SettlementForestHooks }` re-export (consumers depend on it).
- The **whole async build sequence and its ordering**, including the load-bearing ordering comments:
  fire before `socialPlace` (npc-013), `homePlaces` before `spawnLivestock` (plan 122), households
  before livestock (`householdByHomeId`). These comments are the file's most valuable content.
- Collider ownership: `settlementHouseColliders`, `registerSettlementColliders`,
  `clearColliders(def.id)`, and the `WELL_COLLISION_RADIUS` constant. The settlement owns its
  collider key; a door controller must *report* a change, not register colliders itself.
- `pointLightBudget.registerSubtree`/`unregisterSubtree` pairing.
- Forest presence registration/unregistration (build + dispose halves must stay visibly paired).
- Household/exchange/storage wiring (§5 lists this as optional — default is to keep it here).
- NPC creation, including the `NpcAgent.create` argument list and `flatMembers`. See §12.
- `placeWoodshedIfComplete` (10 lines, economy-driven, called from build and `update`).
- `dispose()` as the single visible teardown, delegating to the new controllers.

---

## 5. What should actually be extracted

Five items, in descending value. Items 1–4 are the recommended scope; item 5 is optional.

### E1 — Signposts and labels → `src/settlement/settlementSignposts.ts` (new)

Owns build + per-frame + dispose for: the village namepost, the dock prop and route
(`landmarks.dock`/`dockRoute`), directional road signposts, and land-plot sale signs including their
live removal when a plot is bought. Also exports the low-level primitive that
`SettlementsManager.buildMidpointInstance` will reuse.

Removes lines 493–591, 871–873, 877–888, 921–928 from `createSettlement.ts` (~150 lines), kills four
copies of the same idiom, and fixes P3's missing write guard.

### E2 — House doors → `src/settlement/houseDoors.ts` (new)

Owns the proximity hysteresis, `door.setOpen`, `assembly.update(dt)` and change detection. Returns
`true` from `update()` when any door's logical state changed; `createSettlement` keeps the
`registerSettlementColliders()` call. Removes lines 117–120, 846–870 (~30 lines) and fixes two of
P4's three items.

### E3 — Night cycle → `src/settlement/settlementNightCycle.ts` (new)

Owns `nightFactor`/`nightIndex`, `NIGHT_FIRE_THRESHOLD`, `NIGHT_FIRE_IGNITE_CHANCE`, the seeded
ignition roll, torch dusk/dawn toggling and house-light intensity. Removes lines 91–104, 709–716,
890–906 (~35 lines). The three effects share one threshold crossing, so they belong together rather
than being split between `houseLighting.ts` and `VillageFire.ts`.

### E4 — NPC crowd pass → `src/ai/npcCrowd.ts` (new)

Owns `GROUP_REACTION_RADIUS`, `NPC_SEPARATION_RADIUS`, `NPC_SEPARATION_SPEED`, the O(n²) pair scan
and reusable output buffers. `ai/` is the right domain: the constants come from NPC issues/plans
(issue 010, plan 153), the output feeds `NpcAgent.update`/`NpcAgent.applySeparation`, and nothing
about it is settlement-specific. Removes lines 106–116, 751–781 (~40 lines) and fixes P4's first
item.

Keep the actual `agent.update(...)` + `applySeparation` loop (lines 782–786) and
`advanceSocialPairing` in `createSettlement` — those are orchestration.

### E5 — Livestock tick → extend `src/settlement/livestock.ts` (existing owner)

Move lines 795–828 into a `tickSettlementLivestock(...)` in the module that already owns
`spawnLivestock`/`disposeLivestock`/`LivestockRegistry`. **No new module.** This puts the corpse
removal + `livestockPersistence.markRemoved` tombstoning next to the persistence contract it
belongs to, and removes the in-place `livestock.length = 0; livestock.push(...kept)` splice from the
orchestrator.

### E6 (optional) — Household binding → `src/settlement/settlementHouseholds.ts` (new)

Lines 436–470 → one function returning `{ households, householdStorages, householdByHomeId,
householdExchange }`. Value: collapses P7's four repeated modulo expressions into one tested place.
Cost: a new module for pure wiring. **Recommend deferring** unless the implementer finds it reads
better; it is not on the critical path.

---

## 6. Existing modules to reuse (do not invent alternatives)

| Need | Existing owner |
|------|----------------|
| Signpost/namepost props, `placeOnGround`, `cloneProp`, `loadPropTemplates`, `DOCK_SPECS`, `VILLAGE_NAMEPOST_BOARD_CENTER_Y` | `settlement/props.ts` |
| Label fade curve | `ui/labelDistance.ts`'s `labelOpacityForDistance` |
| Quantized DOM-write guard idiom to copy | `SettlementsManager.ts:589`, `fauna/createFauna.ts:928` |
| Controller-with-`.sync()`/`.update()` shape to copy | `settlement/storageVisuals.ts` (`WoodPileVisual`, `FoodStorageVisual`) |
| Pure config-builder shape to copy | `settlement/wellInteractionQueue.ts`, `settlement/settlementPropColliders.ts` |
| House door primitives, `HouseAssembly`, `buildAssemblyCollidersWorld` | `settlement/houseBuilder.ts` |
| House lights / village torches | `settlement/houseLighting.ts` |
| Fire state + hooks | `settlement/VillageFire.ts` |
| Seeded RNG | `world/parseSeed.ts`'s `createSeededRandom`; settlement seed from `settlementGenerator.ts`'s `cellSeed` |
| Livestock spawn/dispose/persistence | `settlement/livestock.ts` |
| Household exchange candidate lookup | `settlement/householdExchange.ts` |
| Object3D teardown | `assets/loadGltf.ts`'s `disposeObject3D` |
| Boot timing | `shared/bootMark.ts` |

---

## 7. Proposed structure after the refactor

```text
src/settlement/
  createSettlement.ts          (~450–520 lines)  orchestration + Settlement contract + colliders
    ├─ CreateSettlementDeps    (new exported type — replaces 26 positional params)
    ├─ settlementSpawnPoint()  (unchanged)
    ├─ settlementHouseColliders() / registerSettlementColliders()  (unchanged)
    └─ build sequence, delegating to:
         settlementSignposts.ts      (new)  namepost + dock + road signs + plot signs
         houseDoors.ts               (new)  proximity hysteresis + door state change
         settlementNightCycle.ts     (new)  fire autolight + torches + house lights
         livestock.ts                (ext)  tickSettlementLivestock()
         ../ai/npcCrowd.ts           (new)  proximity counts + separation impulses

src/settlement/SettlementsManager.ts
    └─ builds one CreateSettlementDeps, passes it to both createSettlement call sites
    └─ buildMidpointInstance reuses settlementSignposts.ts's label primitive
```

### 7.1 API sketches (implement these signatures)

```ts
// src/settlement/settlementSignposts.ts
export type LabeledProp = {
  prop: Object3D
  labelEl: HTMLDivElement
  label: CSS2DObject
  position: Vector3
  /** Last opacity written to the DOM, quantized — guards the style write. */
  lastOpacity: number
}

/** Ground-places `prop` at (x,z) and attaches an `.npc-label` CSS2DObject at
 *  `labelHeight`. Exactly one of `text`/`html` is used. */
export function createLabeledProp(prop: Object3D, opts: {
  x: number
  z: number
  rotationY?: number
  labelHeight: number
  text?: string
  html?: string
  sampleHeight: HeightSampler
}): LabeledProp

/** Quantized (1/32) distance fade; skips the DOM write when unchanged. */
export function updateLabelOpacity(inst: LabeledProp, observerPos: Vector3): void

/** `disposeProp: true` also frees the prop's GPU resources — use only for a
 *  prop removed mid-life (a bought land plot). Props parented under the
 *  settlement group are freed by `disposeSettlementGroup` instead. */
export function disposeLabeledProp(inst: LabeledProp, opts?: { disposeProp?: boolean }): void

export type SettlementSignposts = {
  update: (observerPos: Vector3) => void
  dispose: () => void
}

export async function createSettlementSignposts(params: {
  def: SettlementDef
  group: Group
  landmarks: SettlementLandmarks
  sampleHeight: HeightSampler
  roadCtx?: RoadNetworkContext
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean
}): Promise<SettlementSignposts>
```

```ts
// src/settlement/houseDoors.ts
export const HOUSE_DOOR_OPEN_DISTANCE = 2.6
export const HOUSE_DOOR_CLOSE_DISTANCE = 3.4

/** Pure hysteresis rule: an assembly wants its doors open when the observer is
 *  within `HOUSE_DOOR_OPEN_DISTANCE` of any entrance/door point, and keeps them
 *  open out to `HOUSE_DOOR_CLOSE_DISTANCE` while already open. */
export function shouldOpenHouseDoors(
  entrancesWorld: readonly { x: number, z: number }[],
  observerX: number,
  observerZ: number,
  anyDoorOpen: boolean,
): boolean

export type HouseDoorController = {
  /** Returns true when any door's logical open state changed this tick — the
   *  caller owns collider re-registration. */
  update: (dt: number, observerPos: Vector3) => boolean
}

export function createHouseDoorController(
  assemblies: readonly HouseAssembly[],
): HouseDoorController
```

```ts
// src/settlement/settlementNightCycle.ts
export const NIGHT_FIRE_THRESHOLD = 0.6
export const NIGHT_FIRE_IGNITE_CHANCE: Record<VillageSize, number>

/** Deterministic per-night ignition roll — same night (even across a
 *  stream-out/stream-in) always resolves the same way. */
export function shouldAutoLightNightFire(
  settlementSeed: number,
  nightIndex: number,
  size: VillageSize,
): boolean

export type SettlementNightCycle = { apply: (t: number) => void }

export function createSettlementNightCycle(params: {
  settlementSeed: number
  size: VillageSize
  fire: VillageFire | undefined
  villageTorches: readonly VillageTorch[]
  houseLights: readonly HouseLight[]
}): SettlementNightCycle
```

```ts
// src/ai/npcCrowd.ts
/** Structural, so tests need no real NpcAgent. */
export type NpcCrowdAgent = {
  mesh: { position: { x: number, z: number } }
  health: { dead: boolean }
}

export type NpcCrowdResult = {
  /** Index-aligned with the input list; valid until the next `run()`. */
  nearbyCounts: readonly number[]
  pushX: readonly number[]
  pushZ: readonly number[]
}

/** Owns reusable buffers — allocation-free after the first call for a given
 *  agent count. */
export function createNpcCrowdPass(): {
  run: (agents: readonly NpcCrowdAgent[], dt: number) => NpcCrowdResult
}
```

```ts
// src/settlement/livestock.ts (added)
export function tickSettlementLivestock(
  /** Mutated in place — corpses are spliced out, same as today. */
  livestock: AnimalAgent[],
  ctx: {
    dt: number
    settlementId: string
    observerPos: Vector3
    dayFactor: number
    timeOfDay: number
    nowDays: number
    litFires: readonly { x: number, z: number }[]
    villages: readonly VillageInfo[]
    /** Reads the *latest* `nowDays` at collection time, not lay time. */
    getNowDays: () => number
    dropLivestockProduct?: DropLivestockProductHook
    onAnimalVocalize?: (kind: AnimalKind, x: number, z: number) => void
    persistence?: LivestockPersistence
  },
): void
```

```ts
// src/settlement/createSettlement.ts
export type CreateSettlementDeps = {
  // world
  scene: Scene
  sampleHeight: HeightSampler
  waterLevel: number
  localRadius: number
  seed: number
  // registries (owned by SettlementsManager, shared across stream-out/in)
  householdRegistry: HouseholdRegistry
  npcStateRegistry: NpcStateRegistry
  relations?: NpcRelationships
  livestockPersistence?: LivestockPersistence
  // collision
  collidersNear: ColliderSource
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void
  clearColliders: (ownerKey: string) => void
  // presentation
  playAt?: PlayAt
  pointLightBudget?: PointLightBudget
  roadCtx?: RoadNetworkContext
  // world-system hooks forwarded into NpcAgent / livestock
  forest?: SettlementForestHooks
  mining?: SettlementMiningHooks
  foodSources?: SettlementFoodSourceHooks
  hunting?: SettlementHuntingHooks
  helperDelivery?: HelperDeliveryHooks
  getPlayerSocial?: PlayerSocialLookup
  getNearbyPlayerWell?: NearbyPlayerWellLookup
  isLandPlotOwned?: (settlementId: string, plotId: string) => boolean
  onAnimalDeath?: (animalId: string) => void
}

export async function createSettlement(
  def: SettlementDef,
  /** Per-settlement, resolved by the caller (`economyFor(def)`). */
  economy: SettlementEconomy,
  deps: CreateSettlementDeps,
): Promise<Settlement>
```

Keep the existing defaults' semantics inside the function body:
`deps.playAt ?? (() => {})`, `deps.pointLightBudget ?? createNullPointLightBudget()`,
`deps.relations ?? createNpcRelationships()`. Preserve every existing JSDoc comment by moving it onto
the corresponding `CreateSettlementDeps` field — those comments are the only documentation of why
several of these hooks exist.

---

## 8. Implementation steps, in order

Each step is independently compilable and committable. Do them in this order — the pure extractions
first, the signature change last, so a regression is easy to bisect.

**Step 0 — baseline.** Run `npx tsc --noEmit` and `pnpm run test`; record the pass state.

**Step 1 — `ai/npcCrowd.ts` (E4).**
1. Create the module with the three constants and `createNpcCrowdPass()`.
2. Preserve the exact current semantics: pairs are scanned `j = i + 1`; a pair within
   `GROUP_REACTION_RADIUS` increments *both* counts; separation is skipped when *either* agent is
   `health.dead`; `nx/nz` fall back to `(1, 0)` when `dist <= 1e-4`; push magnitude is
   `overlap * NPC_SEPARATION_SPEED * dt`, applied `+` to `i` and `−` to `j`.
3. Reuse buffers across calls, growing (never shrinking) to the agent count and zero-filling the
   used prefix each run.
4. In `createSettlement.ts`, create the pass once during build and call it at the top of `update()`;
   keep the existing `agent.update(...)` / `applySeparation` loop where it is.
5. Add `src/ai/npcCrowd.test.ts` (see §11).

**Step 2 — `settlement/houseDoors.ts` (E2).**
1. Move both distance constants and `_entranceWorld`.
2. In `createHouseDoorController`, precompute each assembly's entrance/door points in **world space
   once** at construction (`root.localToWorld` per point) — house roots are static after build, which
   `buildAssemblyCollidersWorld` already assumes. If a check shows any assembly root is re-posed
   after build, fall back to per-frame `localToWorld` and note it in the implementation notes.
3. Track `lastOpen: boolean[]` per door instead of the joined string; `update()` sets doors, calls
   `assembly.update(dt)`, then returns whether any `door.isOpen()` differs from `lastOpen`.
4. In `createSettlement.ts`: `if (doors.update(dt, observerPos)) registerSettlementColliders()`.
   Delete `doorColliderSignature` and its seed at lines 372–374.
5. Add `src/settlement/houseDoors.test.ts`.

**Step 3 — `settlement/settlementNightCycle.ts` (E3).**
1. Move `NIGHT_FIRE_THRESHOLD`, `NIGHT_FIRE_IGNITE_CHANCE`, `nightFactor`, `nightIndex`.
2. Keep the exact seed expression: `settlementSeed ^ Math.imul(nightIndex, 0x9e3779b1) ^ 0x4e494748`,
   `nightIndex` incremented **before** the roll, and the `?? 0.75` fallback.
3. Keep the ordering: fire roll → torch toggle → `nightFactor = t` → house lights.
4. `createSettlement`'s `setDayNight(t)` becomes `nightCycle.apply(t)`.
5. Add `src/settlement/settlementNightCycle.test.ts`.

**Step 4 — `livestock.ts`'s `tickSettlementLivestock` (E5).**
1. Move lines 795–828 verbatim, including the `forestFactor = 0` comment and the exact
   `animal.update(...)` positional argument list.
2. Keep `currentNowDays` semantics: the `onCollected` closure must read the *latest* `nowDays`, so
   pass `getNowDays` (a closure over `createSettlement`'s `currentNowDays`), not the frame value.
3. Keep the `livestock.some(readyToRemove)` guard before rebuilding the array, and the in-place
   `length = 0` / `push(...kept)` mutation — `Settlement.livestock` and
   `SettlementsManager`'s `livestock.capture` both hold that same array reference.
4. Extend `src/settlement/livestock.test.ts` (see §11).

**Step 5 — `settlement/settlementSignposts.ts` (E1).**
1. Create `createLabeledProp` / `updateLabelOpacity` / `disposeLabeledProp`.
2. `createSettlementSignposts` builds, in this order: namepost (label height
   `VILLAGE_NAMEPOST_BOARD_CENTER_Y`), then — only when `roadCtx` is present — the dock (writing
   `landmarks.dock`/`landmarks.dockRoute`) and directional signposts (label height 2.5), then the
   land-plot signs (label height 2.5, `innerHTML` = `` `NA SPRZEDAŻ<br>${plot.price} monet` ``,
   skipped entirely for an already-owned plot).
3. `update(observerPos)` fades all labels and removes any land-plot sign whose plot has since been
   bought (prop disposed + removed from parent, exactly as lines 883–887 do today).
4. `dispose()` removes every label from its parent and every `labelEl` from the DOM; it must **not**
   dispose props parented under `group` (they are freed by `disposeSettlementGroup`).
5. In `createSettlement.ts`: one `await createSettlementSignposts(...)` inside the existing
   `bootMark('signposts')` / `bootMarkEnd` pair; one `signposts.update(observerPos)` in `update()`;
   one `signposts.dispose()` in `dispose()`.
6. In `SettlementsManager.ts`, rewrite `buildMidpointInstance`/`disposeMidpointInstance` and the
   midpoint opacity loop (lines 587–595) on top of the new primitives. Behaviour is unchanged — the
   manager already quantizes.
7. Add `src/settlement/settlementSignposts.test.ts`.

**Step 6 — `CreateSettlementDeps` (P1).**
1. Add the type, change the signature to `(def, economy, deps)`, move every existing parameter JSDoc
   onto the matching field.
2. Update the body mechanically. Prefer destructuring `deps` once at the top so the rest of the
   function body diff stays near-zero.
3. In `SettlementsManager.ts`, build **one** `const settlementDeps: CreateSettlementDeps = {...}`
   after the registries are created (after line 302) and pass it at both call sites.
4. Verify field-by-field against the old parameter order (§10 lists the check).

**Step 7 — docs.** Update `docs/STATE.md` only if the settlement description became stale (it
should not — this is behaviour-neutral). Run `pnpm docs:sync` to regenerate the code map.

---

## 9. Files to create / modify

**Create**

| File | Contents |
|------|----------|
| `src/ai/npcCrowd.ts` | Crowd constants, `createNpcCrowdPass` |
| `src/ai/npcCrowd.test.ts` | Pair counting, separation symmetry, dead exclusion, zero-alloc reuse |
| `src/settlement/houseDoors.ts` | Door distances, `shouldOpenHouseDoors`, `createHouseDoorController` |
| `src/settlement/houseDoors.test.ts` | Hysteresis, multi-entrance, change reporting |
| `src/settlement/settlementNightCycle.ts` | Night constants, `shouldAutoLightNightFire`, `createSettlementNightCycle` |
| `src/settlement/settlementNightCycle.test.ts` | Determinism, per-size chance, torch dusk/dawn edges |
| `src/settlement/settlementSignposts.ts` | Label primitive + settlement signpost controller |
| `src/settlement/settlementSignposts.test.ts` | Land-plot sign skip/removal, quantized opacity guard |

**Modify**

| File | Change |
|------|--------|
| `src/settlement/createSettlement.ts` | Remove extracted blocks; add `CreateSettlementDeps`; delegate in `update`/`setDayNight`/`dispose` |
| `src/settlement/SettlementsManager.ts` | One shared deps object for both `createSettlement` calls; midpoints on the shared label primitive |
| `src/settlement/livestock.ts` | Add `tickSettlementLivestock` |
| `src/settlement/livestock.test.ts` | Egg drop, vocalization, corpse removal + tombstone |
| `docs/code-map/**` | Regenerated by `pnpm docs:sync` — never hand-edited |

**Do not modify:** `src/ai/NpcAgent.ts`, `src/fauna/AnimalAgent.ts`, `src/settlement/props.ts`,
`src/settlement/houseBuilder.ts`, `src/app/worldBundle.ts`, `src/app/gameLoop.ts`.

---

## 10. Risks and mitigations

| # | Risk | Mitigation |
|---|------|------------|
| R1 | **Positional→named mapping error in step 6.** Two same-typed fields swapped compiles cleanly. | Do step 6 as its own commit, last. Map fields in the original parameter order, then diff the old signature (lines 242–313) against the new type field-by-field. Check `registerColliders`/`clearColliders` and the four optional hook functions explicitly. |
| R2 | **Lost default semantics.** `playAt`, `pointLightBudget`, `relations` have defaults today; optional object fields do not. | Apply `??` defaults inside the body (§7.1) and add one test asserting `createSettlement` with a minimal deps object still builds. |
| R3 | **Door change detection drift.** Boolean array vs. joined string. | `isOpen()` is the logical state, flipped synchronously by `setOpen` (`houseBuilder.ts:468–475`) — equivalent by construction. Assert it in `houseDoors.test.ts`. |
| R4 | **Precomputed entrance positions go stale** if a house root is re-posed after build. | Grep for writes to `assembly.root.position`/`.rotation` outside `houseBuilder.ts`/`props.ts` build paths before committing step 2. If any exist, keep per-frame `localToWorld`. |
| R5 | **Egg-collection `nowDays` capture.** Passing the frame's `nowDays` instead of a getter silently changes chicken production. | Step 4.2 — pass `getNowDays`, and assert in a test that a collection callback fired after several ticks sees the newest value. |
| R6 | **Livestock array identity.** Replacing the in-place splice with a new array breaks `Settlement.livestock` and `LivestockRegistry.capture`. | Step 4.3 — keep `length = 0` / `push(...kept)`; assert array identity in the test. |
| R7 | **Land-plot sign double-dispose.** The sign's prop is disposed on purchase *and* the group is disposed later. | Keep the current split: `disposeProp: true` only on the purchase path; `dispose()` touches labels only. Covered by `settlementSignposts.test.ts`. |
| R8 | **Determinism regression** in the night-fire roll if `nightIndex` increments after the roll or the salt changes. | Step 3.2 — copy the expression verbatim; test asserts the same `(seed, nightIndex, size)` always yields the same result and that consecutive nights differ. |
| R9 | **Build-order regression.** Reordering the async build breaks documented invariants (fire→socialPlace, homePlaces→livestock). | Steps 1–5 do not move any build statement except the signpost block, which sits between `spawnLivestock` and the interaction queues and depends on neither. Review the diff for statement order before committing. |
| R10 | **DOM leak** if `settlementSignposts.dispose()` misses `labelEl.remove()`. | Test asserts `document.querySelectorAll('.npc-label').length` returns to its pre-build count after dispose. |
| R11 | **No integration test exists**, so only browser play proves the whole settlement still builds. | §11's browser checklist is mandatory before marking the work done. |

---

## 11. Verification plan

### Automated (required)

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run test
pnpm run build
```

New unit tests, minimum:

- `npcCrowd.test.ts` — two NPCs at 3 m each get `nearbyCounts === 1`; at 7 m, `0`. Two NPCs at 0.2 m
  get equal-and-opposite pushes. A dead NPC contributes to `nearbyCounts` but is excluded from
  separation (both directions). Coincident NPCs (`dist < 1e-4`) push along `(1, 0)` without `NaN`.
  Calling `run()` twice with the same count returns the same buffer objects.
- `houseDoors.test.ts` — closed doors open at 2.5 m and stay shut at 2.7 m; open doors stay open at
  3.3 m and close at 3.5 m; a house with two entrances opens when *either* is in range; `update()`
  returns `true` exactly on the tick a door's logical state changes and `false` on the next tick.
- `settlementNightCycle.test.ts` — `shouldAutoLightNightFire` is stable for a fixed
  `(seed, nightIndex, size)` and varies across `nightIndex`; `OUTPOST`/`SM` never light; `XL` always
  lights. Torches turn on exactly on the upward crossing of 0.6 and off exactly on the downward one,
  not on every call above/below. House lights receive `t` on every call.
- `settlementSignposts.test.ts` (jsdom) — an owned plot creates no sign; an unowned one does; the
  sign is removed on the first `update()` after ownership flips; `updateLabelOpacity` performs no DOM
  write when the quantized value is unchanged; `dispose()` removes every `.npc-label` it created.
- `livestock.test.ts` (extended) — a ready chicken drops exactly one egg and fires
  `onAnimalVocalize`; a `readyToRemove` animal is spliced out, disposed, and tombstoned via
  `persistence.markRemoved`; the livestock array keeps its identity.

### Browser / manual (required — none of the above proves visual correctness)

Run the dev build and confirm in the home settlement:

1. The village namepost, directional road signs and any "NA SPRZEDAŻ" signs are present, correctly
   placed, and their labels fade in/out with distance exactly as before.
2. Buying a land plot removes its sign immediately, without reloading.
3. Walking up to a house opens its door(s) at roughly the same distance as before and they close on
   backing away; walking *through* an open doorway is not blocked (collider re-registration still
   fires).
4. At dusk, village torches light and — in an MD/LG/XL village — the campfire lights on some nights;
   house windows glow. At dawn, torches go out.
5. A crowd of NPCs converging on the well still spreads out instead of stacking.
6. A chicken still drops a collectible egg; a dead animal's corpse still disappears after its
   lifecycle and does not come back after leaving and re-entering the settlement.
7. A coastal settlement still has its dock and the NPC dock route still works (fisher walks to it).
8. Walk out past `unloadRadius` and back in: the settlement rebuilds with no console errors, no
   duplicate labels in the DOM, and NPC/household state preserved.
9. `?bootMark=1` (`debug/debugMode.ts`'s `isBootMarkMode`) still prints the four phases:
   `buildSettlementProps`, `spawnLivestock`, `signposts`, `npcCreation`.

### Non-regression check

`git diff` the returned `Settlement` object literal — `id`/`name`/`isHome`/`foodSourceType`/`size`/
`terrain`/`dominantResource`/`spawn`/`center`/`npcs`/`livestock`/`landmarks`/`economy`/`households`/
`householdStorages`/`fire` must be byte-identical. Any change there is a scope violation.

---

## 12. Out of scope

- **`NpcAgent.create`'s 27-argument list** and `NpcAgent` itself — covered by
  `docs/prompts/2026-09-03--011--NpcAgent-refactor-review.md`. Do not touch it here beyond passing
  the same arguments.
- **`AnimalAgent.update`'s long positional argument list** — covered by
  `docs/prompts/2026-09-03--012--AnimalAgent-refactor-review.md`. `tickSettlementLivestock` must
  forward the existing positional call verbatim.
- **`Settlement.update`'s 13 positional parameters.** Converting these to a context object only pays
  off if `SettlementsManager.update` and `gameLoop`'s call site change too, and it interacts with the
  same question in `NpcAgent.update`/`AnimalAgent.update`. Decide it once, across all four, after the
  agent reviews land. Record it in `docs/plans/LOOSE-ENDS.md` instead.
- **`SettlementsManager`'s own 33-parameter signature** — same argument; it is a separate, larger
  change that should follow the `CreateSettlementDeps` precedent rather than ride along with it.
- **`buildSettlementProps` / `props.ts` (1724 lines)** — the largest file in the domain and a
  legitimate separate review; splitting it is not required for anything above.
- **Behaviour changes of any kind**: door distances, separation tuning, ignition chances, label fade
  window, queue geometry. This refactor must be observationally identical.
- **Splitting the build sequence into phase functions.** The ordering comments are load-bearing
  documentation; breaking them across functions makes the invariants harder, not easier, to see.
- **Persistence, save schema, `CURRENT_SAVE_VERSION`.** Nothing here changes the persisted
  representation, so no version bump and no migration.

---

## Verdict

**REFACTOR** — the file is a legitimate orchestrator with correct cleanup and determinism, but four
self-contained runtime subsystems, a four-way duplicated label idiom, two per-frame allocation warts,
and a 26-parameter positional constructor duplicated across two call sites all warrant extraction.
This is not a "the file is long" split: every extraction either removes a duplication, fixes a
measurable per-frame cost, or makes a currently-untestable deterministic rule testable.

**Effort: M** — 4 new modules + 4 new test files, 3 modified source files, ~250 lines moved and
~50 rewritten, no behaviour change. Step 6 (`CreateSettlementDeps`) is the only step with real
regression risk and is deliberately isolated as the last commit.

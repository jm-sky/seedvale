# Builder — Finish the Local Well — Implementation Notes

**Created:** 2026-09-18
**Plan:** `quests-progression-060-builder-finish-local-well.md`
**Domain:** `quests-progression`

## Recon verdict

This quest can be implemented as a small contextual authored quest over the existing well/construction systems, but the draft had four assumptions that are not true in current code:

1. There is no `builder` value in `src/ai/characters.ts::Role`. Do not add a Builder profession in this plan.
2. Settlement generation does not create unfinished `PlayerWellRecord` targets. Current `playerWells.place()` call sites are player placement and Work Contract creation only.
3. `PlayerWells.place()` generates `well:${Date.now()}:${nextWellId++}`; that is unsuitable for a quest target that must reconstruct across save/load.
4. A well becomes a usable `WaterSource` at `isWellWaterAvailable(record)`, after the body (`well` stage) is finished. `isWellCompleted(record)` additionally requires the roof and is not the correct source-of-truth for the gameplay consequence this quest is meant to demonstrate.

`settlements-npcs-043` is currently `planned`, not implemented. Use only its documented contract below; re-check the landed symbols during implementation instead of guessing them now.

## Dependency contract: settlements-npcs-043

The final plan/notes for `settlements-npcs-043` establish these required semantics:

- settlement cultivation hydration is authoritative settlement-owned state keyed by stable cultivation-site identity;
- Farmer watering extends normal profession work rather than a quest-only manager;
- water-source selection is from the cultivation-site position;
- candidates include settlement wells and usable player-built wells;
- player-built well usability is `isWellWaterAvailable()`, not `isWellCompleted()`;
- a source is revalidated before use;
- source selection is ordinary nearest-suitable routing and contains no quest preference;
- off-screen watering is not synthesized in that plan.

Do not name or import a future `settlements-npcs-043` helper until its implementation exists. At implementation time, bind to the actual shared arbitrary-origin source resolver delivered by that dependency.

## Existing well ownership and construction seams

### `src/world/playerWell.ts`

Authoritative domain state is `PlayerWellRecord`:

- `id`, `x`, `z`, `yaw`;
- `stage: 'pit' | 'well' | 'roof'`;
- `workProgress`;
- persisted groundwater result `waterDepth` / `waterKind`;
- optional roof condition/repair state.

Reuse these exact authorities:

- `wellStageWorkHours(stage, waterDepth)`;
- `wellStageRequirements(stage)`;
- `advanceWellConstruction(...)`;
- `activeWellStage(record)`;
- `isWellWaterAvailable(record)`;
- `isWellCompleted(record)`;
- `wellRemainingWork(record)`.

Current real stage costs are:

- `pit`: no materials; depth-dependent active work;
- `well`: 6 stone + 3 branch; 1 active-work hour;
- `roof`: 4 branch; 1 active-work hour.

Materials are not stored in a separate construction inventory or quest counter. They are atomically consumed when a new stage is first entered.

### `src/world/createPlayerWells.ts`

`PlayerWells` owns the live/persistent record and mesh/collider projection. It already supports:

- restore from `initial: readonly PlayerWellRecord[]`;
- `nodes()` as the persistence snapshot;
- `addWork(id, ...)`;
- `transitionTo(id, ...)`;
- `nearestCompleted(...)` (despite the name, it filters `isWellWaterAvailable`);
- `remove(id)`.

Add the smallest authored-target creation seam here rather than constructing `PlayerWellRecord` in quest code. Recommended contract:

```ts
ensureAuthoredWell(input: {
  id: string
  settlementId: string
  authoredKey: string
  x: number
  z: number
  yaw: number
  initialStage: 'pit'
  initialWorkProgress: number
}): PlayerWellRecord
```

The exact argument shape may be simplified, but these semantics are required:

- explicit caller-supplied stable id;
- if that id already exists, return/reuse the existing record without changing progress, position, groundwater or roof state;
- resolve groundwater exactly once only when creating a new record;
- never call `place()` and then rewrite its generated id;
- do not duplicate the well on quest re-materialization or WorldBundle rebuild.

Add minimal persisted provenance to `PlayerWellRecord` for authored settlement infrastructure, for example an optional authored descriptor containing `settlementId` + `authoredKey`. Legacy/player-created wells remain valid with the field absent. This is needed so UI/removal policy does not have to parse an id prefix.

Because this changes persisted `playerWells` representation, update `src/persistence/saveData.ts` validation/migration from the then-current save version. Do not hardcode the version from this recon: `settlements-npcs-043` may land first and advance it.

### Authored initial state

Create the target as a real pit whose pit work is already complete:

```text
stage = pit
workProgress = wellStageWorkHours('pit', waterDepth)
```

That means ordinary `activeWellStage()` resolves the next useful stage to `well`. The first real work bout must still enter the `well` stage through `advanceWellConstruction()`, requiring the normal 6 stone + 3 branch and then normal active work.

Do not directly create a `stage: 'well'` record, because that would bypass the existing one-time material gate.

## Player and NPC construction integration

### Player

`src/app/actions/placementActions.ts::workOnWell` already uses:

- `advanceWellConstruction()`;
- `items/constructionMaterials.ts::hasMaterial/consumeMaterial`;
- `CONSTRUCTION_MATERIAL_RADIUS` around the well;
- `PlayerWells.addWork()`;
- the existing busy-channel partial-credit policy.

Therefore the quest needs no "deliver materials" handler. The player satisfies the material part by placing/carrying enough normal construction resources for the ordinary well action to consume them.

### NPC / Work Contract

`src/app/actions/workContractActions.ts` already discovers unfinished wells and binds a contract as:

```ts
{ kind: 'construction', targetId: well.id }
```

`NpcAgent` resolves that stable target id and uses the same `advanceWellConstruction()` + `PlayerWells.addWork()` path. NPC material sourcing is also the existing bounded construction-material seam (carried inventory and, when available, dropped items near the site).

Do not create an automatic Builder worker for this quest. Current NPC construction requires a normal Work Contract. If the player chooses to hire help for the authored well, that is a supported systemic alternative and the same target can be completed by the hired NPC.

## Authored target ownership / removal policy

Ownership must remain:

```text
PlayerWells/world well registry
  owns PlayerWellRecord + progress + groundwater + lifecycle
QuestManager
  owns quest state only
settlement/cultivation
  owns cultivation state only
```

The quest must store/derive only the stable `wellId`; it must never mirror `stage`, `workProgress`, materials or water availability.

An authored local-infrastructure well should not expose the normal "cancel/remove unfinished player construction" action. Use the authored provenance in the live record to suppress that action in the existing inspection/action path. Do not add a quest-specific removal UI.

If an authored target is nevertheless missing because of a corrupted/legacy save or an unexpected domain mutation:

- an active quest becomes technical `invalidated` (no reward);
- an unaccepted quest is not offerable;
- do not silently spawn a replacement under a different id.

## Context materialization

Create a focused module, recommended:

`src/quests/builderFinishLocalWell.ts`

It should own only this authored/contextual quest's selection and definition building. Do not create a generic Builder quest generator.

### Quest id

Use a stable contextual id:

`world:builder-finish-local-well:<settlementId>`

One settlement may contribute at most one definition. V1 should select one deterministic eligible settlement for this quest rather than flooding every settlement with a copy.

### Well id

Use a stable id derived from the same context plus the stable cultivation-site id, e.g.:

`well:authored:builder-local:<settlementId>:<cultivationSiteId>`

The exact prefix is content convention; identity inputs must be settlement id + cultivation-site id, never coordinates, display names, runtime object ids or load order.

### Settlement / cultivation selection

After `settlements-npcs-043` lands, use its authoritative stable cultivation-site records/anchors. Eligibility requires:

- a real `garden` or `field` cultivation site;
- a deterministic valid well placement close to that site;
- before construction, the ordinary nearest usable source from that cultivation position is materially farther away than the authored well position will be.

This last check makes the dialogue truthful. Do not rely only on flavor text or a quest flag.

Placement must reuse the well's normal ground/clearance rules:

- `src/items/tentPlacement.ts::evaluateGroundPlacement`;
- `WELL_FOOTPRINT_RADIUS`;
- `WELL_SEPARATION`;
- existing collision/blocker inputs used by `placementActions.ts` / `workContractActions.ts`.

Use a bounded deterministic set of candidate offsets around the cultivation anchor. No random retry loop and no runtime mesh/object identity.

If no candidate satisfies both physical placement and real distance improvement, do not materialize this quest in that settlement.

### Giver

There is no `Role === 'builder'`.

Select a stable adult from `SettlementDef` through:

- `src/quests/opportunities/settlementNpcMaterialization.ts::settlementOpportunityNpcsFromDef()`;
- stable `settlementNpcId()` identity.

Use an explicit deterministic content preference for construction-adjacent existing roles (recommended order: `woodcutter`, `blacksmith`, `miner`, then another adult only if the authored copy does not call their simulation profession "Builder"). The quest may treat the chosen NPC as the person coordinating the work; it must not mutate `Role`, workplace, schedule or profession AI.

If no suitable adult is available, the context is ineligible.

## Quest objective and lifecycle

### New objective

Do not reuse current `interact_well`: it has no id and matches generic well interaction.

Add a narrow state-bound objective to `src/quests/quests.ts`, recommended shape:

```ts
{ type: 'make_well_water_available', wellId: string }
```

This is deliberately state-based. It is satisfied only by:

```ts
isWellWaterAvailable(boundRecord)
```

No quest counter and no actor-specific contribution counter.

### QuestManager lookup

Inject a narrow well-state resolver into `QuestManager` from `src/app/createApp.ts`; do not import `PlayerWells` into the quest domain. Recommended snapshot:

```ts
type QuestWellState = 'missing' | 'unfinished' | 'water_available'
type QuestWellLookup = (wellId: string) => QuestWellState
```

Resolve from the current `bundle.playerWells.nodes()` each time, so a WorldBundle rebuild never leaves a stale manager/object reference.

Use the same central unfinished-slot completion path introduced for multi-objective stages. Do not add a parallel quest state machine.

### Polling / completion

Extend the existing state-bound objective polling pattern (same conceptual family as `resolve_storage_rat_infestation`) so:

- active + `unfinished` → stay active;
- active + `water_available` → complete the objective/stage through normal quest transition logic;
- active + `missing` → technical `invalidated`;
- not-offered/offered + `water_available` → not offerable; no retroactive reward;
- not-offered/offered + `missing` → not offerable.

If the well becomes usable because a hired NPC performs the final work, the same objective succeeds. Current code has no autonomous Builder construction outside Work Contracts, so do not add actor attribution or a special "NPC finished it" ledger.

Do not use `RESOLVED_WITHOUT_PLAYER_OUTCOME` for normal completion of this target. The requested world state itself is the objective; actor identity is intentionally not part of it.

### Pre-accept completion

The authored unfinished well exists before acceptance so it is a visible real problem.

If the player finishes the well before accepting:

- the offer must disappear / become ineligible;
- no coins or social reward are granted;
- the giver may fall back to ordinary dialogue; no special immediate-completion quest is required.

This rule must be evaluated from live well state, not remembered with another flag.

## Marker / actionability

The objective binding is logical id, never mesh identity.

Add a read-only query such as `QuestManager.wellMarker(wellId)` only if needed by the existing interactable presentation. It should return the normal active-target marker while the bound objective is unfinished and nothing after completion/invalidation.

Thread the stable `PlayerWellRecord.id` through the existing `playerWell` interactable. Do not create a second quest interaction target.

For unloaded/out-of-range targets:

- quest log still names the task;
- no runtime Object3D is required;
- marker appears again when the target's normal interactable is present;
- completion polling resolves through logical well state, not a mesh.

## Definition / dialogue / rewards

The contextual builder should emit a normal `QuestDef` using existing outcome/reward/consequence mechanisms.

Suggested content:

- title: `Dokończ studnię przy polu`;
- giver explains only verified facts: the well body is unfinished, the cultivation site currently has a farther usable source, and finishing this well will put water closer;
- one state-bound construction objective is preferable to fake "bring materials" + "work" stages;
- report can be automatic `ready_to_report` followed by a short explicit giver report, consistent with normal QuestManager behavior.

Reward:

- small shown reward: `15 × coin`;
- giver relation: `+2`;
- local settlement reputation: `competence +2`, `benevolence +1`;
- no renown for this small local job;
- no Settlement Known Deed badge. Existing Known Deeds are specific `caretaker`, `healer`, `grave_robber` domain events; do not add a new badge solely for this quest.

If balance conventions have changed by implementation time, adjust only the numeric reward while preserving the above reward classes.

## Composition root

Expected integration points:

- `src/app/createApp.ts`: build contextual definition after settlement/cultivation context and player-well registry are available; inject live well lookup into `QuestManager`.
- `src/quests/materializeAuthoredQuests.ts` is for display-name-authored defs and should not be forced to resolve this contextual role-selected giver by name. Build this quest directly with a stable `QuestNpcRef`.
- `src/quests/opportunities/settlementNpcMaterialization.ts`: reuse stable NPC descriptors/roles for giver selection.
- preserve persisted active quest definitions across boot by reconstructing the same quest id, giver id and well id from deterministic settlement/site context.

## Persistence

No new quest-progress field is necessary if quest id + well id are deterministic and reconstructed from world context.

Persist:

- authored well provenance as part of `PlayerWellRecord`;
- the normal well construction state via existing `SaveData.playerWells`;
- normal `QuestProgressEntry` through existing quest persistence.

On restore order, ensure the authored well record is available/reused before the first state-bound objective poll. Never create a second target because the quest definition rebuilt.

WorldBundle rebuild must carry the exact record through the existing `playerWells` snapshot path.

## Tests to add/update

### Context materialization

New focused tests beside `builderFinishLocalWell.ts`:

- deterministic quest id / well id for the same settlement + cultivation site;
- only valid cultivation context materializes;
- no suitable giver → no quest;
- completed/usable target → no offer;
- no real distance improvement → no quest;
- bounded placement chooses a valid candidate or fails cleanly;
- repeated materialization reuses the same authored well id.

### PlayerWells / persistence

Extend `src/world/createPlayerWells.test.ts` and persistence tests:

- explicit authored id is stable;
- ensure is idempotent and never resets existing progress/groundwater;
- authored provenance round-trips save/load;
- legacy player wells without provenance remain valid;
- authored target cannot be removed through normal player cancellation flow.

### QuestManager

Extend `src/quests/QuestManager.test.ts`:

- bound well id A cannot be satisfied by well B;
- `unfinished → water_available` completes the objective from live state;
- completion by NPC/another actor is indistinguishable and resolves correctly;
- target already usable before acceptance blocks offer/reward;
- missing active target invalidates safely;
- save/restore of normal quest progress rebinds to the same logical well id;
- unloaded runtime representation is irrelevant because lookup is logical state.

### Construction regression

Keep/extend existing well and Work Contract tests to show:

- material consumption still uses `wellStageRequirements`;
- real work still mutates only `PlayerWellRecord.workProgress`;
- ordinary player-created wells work unchanged;
- Work Contracts can still bind and work the authored well via normal `construction` target id;
- no duplicate quest progress counter exists.

### settlements-npcs-043 integration

After that dependency is implemented, add an integration test at its actual water-source selection seam:

- before body completion, authored well is excluded;
- after body completion, the same well is an ordinary candidate;
- when it is nearer the cultivation anchor than the previous source, it wins ordinary nearest-source selection;
- the selection takes no quest state/id as input.

## Manual browser verification

User performs this; AI implementation agent must not.

1. Find the deterministic settlement/context with the quest giver.
2. Confirm the unfinished physical well exists near the cultivation area before accepting.
3. Confirm it is not yet a usable water source.
4. Accept the quest.
5. Place/carry the required ordinary materials near the well and start normal well work.
6. Confirm the same well id/stage/progress advances; optionally hire NPC help through the normal Work Contract flow.
7. Finish the `well` body so `isWellWaterAvailable` becomes true.
8. Confirm the quest advances/completes from that world state.
9. Confirm normal drinking/filling uses the well as an ordinary `WaterSource`.
10. When cultivation hydration needs watering, observe Farmer source selection choosing the local well if it is nearest.
11. Save/load and re-check quest state, same physical well, same construction/water state and no duplicate.
12. Optionally finish the roof afterward; it must remain ordinary well construction and must not be quest-gated.

## Guardrails for implementation

- no `builder` Role in this plan;
- no generic Builder quest generator;
- no fake quest well/mesh;
- no quest-owned `workProgress` or material counters;
- no quest-only WaterSource or Farmer preference;
- no automatic NPC construction path outside existing Work Contracts;
- no `isWellCompleted()` gate for the Farmer consequence;
- no runtime mesh/Object3D persisted in quest state;
- no new reward type or Known Deed;
- no broad refactor/rename of `PlayerWellRecord` / `PlayerWells`;
- no browser verification by AI;
- do not run `pnpm docs:sync`.

For new public architectural helpers/types (`ensureAuthoredWell`, well lookup/objective helpers, contextual quest builder), add focused JSDoc with `@domain` where it improves preflight discovery.

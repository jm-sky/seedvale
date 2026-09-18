# Builder — Complete an Unfinished Palisade Segment — Implementation Notes

**Created:** 2026-09-18
**Plan:** `quests-progression-061-builder-repair-or-complete-palisade.md`
**Domain:** `quests-progression`

## Recon verdict

V1 should be **complete an unfinished palisade segment**, not repair a damaged segment.

Current code has two materially different palisade/repair worlds:

1. `src/world/palisade.ts` / `src/world/createPalisades.ts` own real `PalisadeSegmentRecord` construction:
   - stable record `id`;
   - authoritative `completedWork`;
   - `PALISADE_REQUIRED_WORK`;
   - `isPalisadeConstructionComplete()`;
   - actor-neutral `Palisades.contributeWork(id, amount)`;
   - persistence in `SaveData.palisades`;
   - Work Contract target `{ kind: 'palisade', targetId }`.

2. Settlement structure repair from `settlements-007` is a separate domain:
   - `SettlementStructureStateRegistry`;
   - keyed by stable `VillageBuildingPlan.id`;
   - `condition`, `RepairProgress`, repair materials/work;
   - `SettlementsManager.getStructureSnapshot()` / `listRepairProblems()`.
   Current settlement entrance palisades are **not** entries in that registry.

Do not merge these lifecycles for this quest.

## Settlement palisade vs buildable palisade

### Settlement palisade

`src/settlement/settlementPalisade.ts` produces `SettlementPalisadePlacement = PropPlacement`.

Important properties:

- `resolveEntrancePalisadePlacements()` deterministically produces final finished placements;
- `plantEntrancePalisade()` projects them to instanced presentation;
- `settlementPalisadeColliders()` projects the same placements to OBB colliders;
- the placement has no construction progress, condition, repair state or persistent per-segment id;
- the generated settlement palisade is therefore not a viable quest construction target without inventing a new mutable settlement-palisade state system.

Do not add such a system in 061.

### Buildable palisade

`PalisadeSegmentRecord` is already the correct mutable world-domain target:

```ts
type PalisadeSegmentRecord = {
  id: string
  x: number
  z: number
  yaw: number
  completedWork: number
}
```

Construction completion authority:

```ts
isPalisadeConstructionComplete(record)
```

Remaining work authority:

```ts
palisadeRemainingWork(record)
```

Mutation authority:

```ts
Palisades.contributeWork(id, workAmount)
```

The quest should create/reuse one **authored settlement-infrastructure `PalisadeSegmentRecord`** near an existing settlement palisade, then observe that record. It remains an ordinary palisade target for player work and Work Contracts.

## Materials: do not invent a delivery stage

Current palisade materials are consumed by placement:

`PALISADE_MATERIAL_REQUIREMENTS = 2 × beam`.

After `Palisades.place()` creates an unfinished segment, its remaining lifecycle is work-only: `completedWork → PALISADE_REQUIRED_WORK`.

Therefore 061 must **not** add:

- quest `materialsDelivered`;
- a fake beam delivery objective;
- a second material gate during construction;
- a quest-owned construction inventory.

The authored segment represents a section whose physical materials/posts have already been placed but whose construction work is unfinished.

Dialogue should say that the section was started but still needs hands/work, not that the player must deliver beams unless a future palisade domain change makes that true.

## Authored target creation

Normal `Palisades.place()` generates:

`palisade:${Date.now()}:${nextPalisadeId++}`

That is unsuitable for a reconstructed authored quest target.

Add a narrow idempotent creation seam to `Palisades`, analogous in intent to the authored-well seam specified by quests-progression-060:

```ts
ensureAuthoredSegment(input: {
  id: string
  x: number
  z: number
  yaw: number
  completedWork: number
  authored: {
    settlementId: string
    authoredKey: string
  }
}): PalisadeSegmentRecord
```

Exact naming may follow the implementation, but the contract must be:

- caller provides the stable id;
- existing record with that id is reused unchanged;
- reuse never resets transform or progress;
- new record uses the same `spawn()` / collider / visual projection as every other palisade;
- no quest-owned copy of the record exists.

Recommended stable id:

`palisade:authored:builder-unfinished:<settlementId>`

The target id is stable because it derives from the stable settlement id, not from a runtime mesh, placement-array index, display name, coordinates or load order.

### Provenance

Add minimal optional authored provenance to `PalisadeSegmentRecord`, for example:

```ts
authored?: {
  settlementId: string
  authoredKey: 'builder-unfinished'
}
```

Persist it with the palisade record.

Reason: authored settlement infrastructure must not be treated as disposable player property merely because it reuses the player-buildable domain. In particular, normal `[R] Usuń segment palisady` should be suppressed for this authored target rather than creating a quest-specific removal exception keyed by string-prefix parsing.

This changes persisted palisade representation; update `src/persistence/saveData.ts` validation/migration using the then-current save version. Do not hardcode the save version from these notes.

## Target placement

V1 should materialize **one authored unfinished segment adjacent to an existing settlement palisade**, not replace an instanced settlement segment and not create a fake repaired mesh.

Selection should be a small pure/contextual resolver, recommended module:

`src/quests/builderCompletePalisade.ts`

or a nearby focused module if quest-context code has converged before implementation.

The resolver should:

1. iterate settlement definitions/context in deterministic order;
2. require a settlement whose `resolveEntrancePalisadePlacements()` result is non-empty;
3. select a stable suitable adult giver;
4. derive a bounded list of continuation candidates from the ends of existing palisade placements;
5. keep the segment outside gate/road corridors and obvious existing placement overlap;
6. use normal palisade ground/clearance constraints where available;
7. select the first deterministic valid candidate;
8. create/reuse `palisade:authored:builder-unfinished:<settlementId>`.

Do not bind the quest to a `SettlementPalisadePlacement` index. The authored `PalisadeSegmentRecord.id` is the persistent target identity.

A fresh authored target should start visibly unfinished, for example `completedWork = 0` or another explicitly chosen value below `PALISADE_REQUIRED_WORK`. Prefer `0` unless gameplay testing gives a reason to start partially progressed.

## One contextual quest, not a generator

Match quests-progression-060's content pattern:

- materialize at most one deterministic eligible Builder quest in V1;
- do not create one copy per settlement;
- do not build a generic Builder quest generator.

Quest id:

`world:builder-complete-palisade:<settlementId>`

The selected settlement and target id must reconstruct deterministically.

## Giver selection: keep 060 and 061 aligned

There is no `builder` in `src/ai/characters.ts::Role`.

Reuse:

- `src/quests/opportunities/settlementNpcMaterialization.ts::settlementOpportunityNpcsFromDef()`;
- stable `settlementNpcId()`.

Use the same deterministic construction-adjacent preference specified by final quests-progression-060:

1. `woodcutter`;
2. `blacksmith`;
3. `miner`;
4. another adult only if dialogue describes them as coordinating the work rather than claiming their simulation profession is Builder.

If 060 lands first and introduces a narrow `selectBuilderQuestGiver` helper, 061 should reuse it. If 061 lands first, extract the helper only if it is immediately shared by both quest implementations; do not create a generic profession framework.

No suitable adult → no eligible context.

## Player + NPC + Work Contract integration

### Player

`src/app/actions/placementActions.ts::workOnPalisade(id)` already:

- resolves the real palisade by id;
- rejects missing/complete targets;
- runs the existing busy work bout;
- calls `bundle.palisades.contributeWork()`;
- gives partial credit on cancellation according to measured elapsed work.

No quest work handler is needed.

### NPC / Work Contract

Existing Work Contract types already support:

```ts
{ kind: 'palisade', targetId: segment.id }
```

`workContractActions.ts` already exposes unfinished palisades as hire-help candidates, and `NpcAgent` executes buildable work through the same actor-neutral contribution seam.

Therefore:

```text
player accepts quest
→ player may work
→ player may hire NPC through normal Work Contract
→ both mutate the same PalisadeSegmentRecord.completedWork
→ completion is actor-independent
```

Do not reserve the target exclusively for the player.

## Quest objective

Add one narrow state-bound objective to `src/quests/quests.ts`, recommended shape:

```ts
{ type: 'complete_palisade_segment', palisadeId: string }
```

Do not model:

- work hours;
- work bouts;
- NPC contribution;
- materials;
- percentage complete

inside quest progress.

Inject a logical lookup into `QuestManager` from the composition root with semantics:

```text
palisadeId → missing | unfinished | complete
```

Resolve from the current `bundle.palisades.nodes()` and `isPalisadeConstructionComplete()`. The lookup must re-resolve the current bundle and never capture a mesh or stale `Palisades` instance across a WorldBundle rebuild.

Use the existing state-bound world-objective polling/completion path, not a second quest state machine.

## Availability and lifecycle

### Fresh availability

Quest is offerable only when all are true:

```text
valid settlement context
+ valid stable giver
+ real authored palisade record exists
+ target is unfinished
→ offerable
```

### Completed before acceptance

If the real target reaches complete before acceptance:

- quest is no longer offerable;
- an exposed offer disappears/becomes unavailable through the existing live-state gating;
- no retroactive reward;
- no immediate-complete replacement quest.

This is evaluated from `isPalisadeConstructionComplete()`, not a remembered quest flag.

### Completed after acceptance by NPC

If an NPC Work Contract applies the final useful work:

- the same objective becomes satisfied;
- normal stage completion occurs;
- actor attribution is irrelevant;
- do not use `resolved_without_player`.

The requested world state itself is the objective.

### Missing / invalid target

For an active quest:

- missing target → existing technical `invalidated` semantics;
- no reward;
- do not create a replacement id.

Before acceptance:

- missing target → not offerable.

Because authored settlement infrastructure should not expose normal removal, missing should primarily represent corruption/legacy mismatch/unexpected domain mutation.

### Settlement unload

The authoritative target belongs to `WorldBundle.palisades`, not the streamed settlement runtime or its instanced mesh. Settlement unload must not invalidate the objective.

No runtime `Object3D` or loaded `Settlement` reference is stored in quest state.

### Save/load / WorldBundle rebuild

Persistence chain:

```text
PalisadeSegmentRecord
→ palisades.nodes()
→ SaveData.palisades
→ createPalisades(initial)
→ same authored id + completedWork/provenance
```

Quest progress remains normal `QuestProgressEntry`; no extra progress field is needed.

When restoring a save with an offered/active 061 quest and a genuinely missing authored palisade record, do not silently recreate the target merely to save the quest. Let the live target lookup invalidate it.

Fresh-world materialization may create the authored target only when no restored quest state requires preserving a missing-target failure.

## Threat relation

Current threat work does **not** provide credible palisade structure damage:

- `npc-046` adds emergency locomotion for existing animal-threat flee;
- structure condition/repair covers settlement building structures;
- no current verified path applies predator/raid damage to settlement palisade segments.

Therefore V1 dialogue must not claim a systemic wolf/raid attack damaged this section.

Allowed narrative:

> „Ten odcinek palisady został zaczęty, ale wciąż brakuje nam rąk do pracy.”

No defense-score/mechanical protection claim.

## Completion consequence

Completion source:

```text
same authored PalisadeSegmentRecord
→ completedWork reaches PALISADE_REQUIRED_WORK
→ isPalisadeConstructionComplete() == true
→ createPalisades registers its normal collider / full visual
→ QuestManager state-bound objective becomes satisfied
```

Quest completion does not mutate the palisade.

After save/load the same record remains complete and is treated by ordinary palisade systems exactly like another completed segment, except for the authored-infrastructure removal policy.

## Dialogue and reward

Use normal `QuestDef` / outcomes / consequences.

Suggested content:

- title: `Dokończ odcinek palisady`;
- giver: unfinished section was started, but work stopped / there are not enough hands;
- objective: finish the indicated real segment;
- no fake material-delivery stage;
- normal report/hand-in only if current quest flow benefits from it.

Small local reward, aligned with 060 scale:

- `15 × coin`;
- giver relation `+2`;
- settlement reputation: `competence +2`, `benevolence +1`;
- no renown;
- no new Known Deed;
- no Builder-specific currency/reputation.

## Markers and actionability

Existing quest marker infrastructure is primarily NPC-giver/action markers; there is no generic world-prop quest-marker registry for palisades.

Keep V1 narrow:

- giver marker follows existing `QuestManager.labelMarker()` / quests-progression-055 actionability semantics;
- the palisade's own normal interactable remains the action surface and already exposes `[E] Buduj segment palisady (...)` while unfinished;
- do not add a parallel quest-specific interaction target;
- if implementation needs a visual world-target marker, add only a read-only exact-id query such as `QuestManager.palisadeMarker(palisadeId)` and project it through the existing interaction/presentation seam; do not create a new marker registry.

The objective binding is always exact `palisadeId`.

## Expected implementation surface

Primary:

- `src/world/palisade.ts`
  - optional authored provenance;
  - completion authority remains unchanged.
- `src/world/createPalisades.ts`
  - idempotent explicit-id authored creation/reuse seam.
- `src/persistence/saveData.ts`
  - persisted authored provenance validation/migration.
- `src/app/saveState.ts`
  - confirm the existing `palisades.nodes()` projection includes new plain-data provenance.
- `src/app/actions/placementActions.ts`
  - suppress normal removal/cancellation for authored settlement-infrastructure palisade; normal work path remains.
- `src/app/actions/workContractActions.ts`
  - expected mostly reuse; verify authored unfinished target is still a normal `palisade` hire-help candidate.
- `src/quests/quests.ts`
  - exact-id `complete_palisade_segment` objective.
- `src/quests/QuestManager.ts`
  - injected live palisade-state lookup + state-bound polling/availability/completion.
- `src/quests/opportunities/settlementNpcMaterialization.ts`
  - reuse only; stable giver descriptors.
- focused new Builder palisade context module under `src/quests/`.
- `src/app/createApp.ts`
  - materialize contextual quest/target and inject current-bundle lookup.
- targeted tests.

Read/reference:

- `src/settlement/settlementPalisade.ts` — placement context only; do not add mutable quest progress here.
- `src/world/workContract.ts` / `src/world/createWorkContracts.ts`.
- `src/ai/NpcAgent.ts` buildable-contract execution.
- final quests-progression-060 plan/notes for the contextual Builder pattern.

## Tests

### Availability / context

Focused tests around the contextual resolver:

- settlement with real palisade placements + valid giver + valid continuation site → one quest/target;
- no settlement palisade → no quest;
- no suitable giver → no quest;
- no valid bounded target placement → no quest;
- completed existing authored target → no offer;
- deterministic same settlement → same quest id and palisade id;
- materialization is idempotent.

### Binding / persistence

- exact `palisadeId` A cannot be satisfied by palisade B;
- authored id survives save/load;
- `completedWork` survives save/load;
- authored provenance survives save/load;
- WorldBundle rebuild rebinds to the same logical id;
- settlement unload/reload does not affect objective binding;
- ordinary legacy/player-created palisades without provenance remain valid.

### Progress

- `workOnPalisade` mutates the real target through `Palisades.contributeWork`;
- NPC Work Contract mutates the same target;
- quest stores no duplicate work/material progress;
- partial work from player then NPC accumulates only on `PalisadeSegmentRecord.completedWork`.

### Completion

- `isPalisadeConstructionComplete(target)` is the sole domain completion source;
- player finishing the real target advances the objective;
- NPC finishing the real target advances the objective;
- completed-before-acceptance blocks offer/reward;
- active missing target becomes `invalidated`;
- completed target remains completed after quest resolution and save/load.

### Regression

- ordinary player palisade placement still consumes `PALISADE_MATERIAL_REQUIREMENTS` once at placement;
- ordinary unfinished palisade work still functions;
- ordinary palisade removal/recovery still works for non-authored segments;
- Work Contracts still discover/execute ordinary and authored unfinished palisades;
- one-active-contract-per-target invariant remains unchanged;
- settlement instanced palisade generation/collision remains unchanged;
- `SettlementsManager.listRepairProblems()` / structure repair selection remains unchanged.

## Manual browser verification

User-owned only:

1. find the deterministic settlement with the selected Builder/coordinator and authored unfinished segment;
2. verify the physical segment is visibly unfinished before accepting;
3. accept the quest;
4. use normal `[E]` palisade construction work;
5. optionally hire NPC help through a normal Work Contract;
6. verify both actors advance the same physical segment;
7. finish construction and see the normal full-height/collider transition;
8. confirm quest completion/report;
9. save/load;
10. verify the same segment remains complete;
11. verify ordinary palisades elsewhere still place, build, hire-help and remove normally.

AI must not perform browser verification.

## Implementation guardrails

- no damaged-palisade V1;
- no settlement-palisade condition registry;
- no new repair system;
- no quest-local progress/material/work counters;
- no generic Builder quest generator;
- no threat/raid damage simulation;
- no settlement-defense score;
- no Work Contract redesign;
- no binding to Three.js/runtime mesh identity;
- no `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

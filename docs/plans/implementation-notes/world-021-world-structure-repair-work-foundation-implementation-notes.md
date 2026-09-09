# Implementation Notes: world-021 — World structure repair work foundation

## Dependency / preflight

`world-021` is not implementable on current `main` yet. It depends on `world-020`, which is still `planned` and itself depends on `items-player-018`. Current `PlayerWellRecord` has no roof condition/anchor and there is no `src/world/condition.ts` or repair state.

Implement only after `world-020` lands, then re-check its actual condition/checkpoint API. Reuse the explicit checkpoint invariant required by its implementation notes:

```text
resolve lazy condition at nowDays
→ persist resolved condition
→ set anchor = nowDays
→ then perform explicit mutation
```

Do not recreate condition resolution inside repair code.

## Shared repair primitives

`src/world/repair.ts` should stay pure and small:

- `RepairProgress { startedCondition, targetCondition, requiredWork, completedWork }`,
- remaining/completion helpers,
- `applyRepairWork()` returning exact `acceptedWork` and clamping at `requiredWork`.

It should not import inventory/material/UI/actor/skill types. Materials and legal target policy remain domain-owned.

Use immutable-return helpers for `RepairProgress`; the owning world object decides when to replace its persisted state and when completion updates condition.

## Well roof ownership

Relevant post-`world-020` owners will remain:

- `src/world/playerWell.ts` — pure well-domain rules/state,
- `src/world/createPlayerWells.ts` — runtime authoritative mutation/snapshot owner,
- `src/app/actions/placementActions.ts` — player Busy Action adapter.

Keep construction and repair independent. Existing construction uses `stage + workProgress`; repair must not reuse/reset `workProgress` after the roof is completed.

Prefer roof-specific optional repair state beside the roof condition state produced by `world-020`, e.g. semantically `roofRepair?: RepairProgress`. Do not introduce generic component records or a repair registry for one consumer.

`createPlayerWells.ts::toRecord()` manually reconstructs the snapshot. Any repair field added to `PlayerWellRecord` must also be copied there, otherwise it will be lost both on save and during in-session `WorldBundle` rebuilds.

## Authoritative mutations

Do not expose raw repair-progress mutation to app code. Extend `PlayerWells` with explicit operations roughly equivalent to:

```text
startRoofRepair(id, nowDays, resolved quote/result)
contributeRoofRepairWork(id, hours, nowDays) → acceptedWork
```

Exact signatures should follow the final `world-020` checkpoint API.

`startRoofRepair` must operate on the live entry by id and reject stale UI state. Required order:

```text
relookup live well
→ verify completed roof / no active repair
→ checkpoint current roof condition at nowDays
→ derive fresh domain quote
→ validate target
→ commit materials in player adapter
→ create RepairProgress
```

Important transaction detail: a failed material preflight must not checkpoint condition merely because the user clicked Start. Therefore either perform a read-only resolved-condition/quote preflight first and checkpoint only after successful material validation, or provide a domain operation that can commit checkpoint + repair state only after the caller has proven materials are available. Do not mutate the anchor before material validation succeeds.

On completion, the authoritative well owner performs one atomic semantic transition:

```text
roofCondition = targetCondition
roofRepair = undefined
roofConditionAnchor = nowDays
```

Normal degradation is frozen while `roofRepair` exists.

## Repair quote / cost

`src/world/playerWell.ts` already owns the real roof construction baseline:

```text
roof construction = 4 × branch + 1 active-work hour
```

Use that as the balance reference. A full `0 → 100` repair must remain strictly cheaper than rebuilding the roof from scratch; partial repair cost/work should be a deterministic function of restored condition. Keep the formula in one pure well-domain quote resolver used by both preview and authoritative start.

Do not move `MaterialRequirement` merely because its current file is named `constructionMaterials.ts`. `playerWell.ts` already imports that type and `repair.ts` itself should not know materials. Refactor the type's home only if another landed dependency has already made the naming genuinely misleading.

## Material commitment

Reuse `hasMaterial()` / `consumeMaterial()` and `CONSTRUCTION_MATERIAL_RADIUS` from `src/items/constructionMaterials.ts` for the player adapter. They already support inventory + nearby dropped materials and deterministic nearest-first world consumption.

For multiple requirements, follow the existing construction pattern: preflight **all** requirements with `hasMaterial()` before consuming any of them, then consume them. Do not consume one requirement before discovering another is missing.

Materials are spent only when creating a new repair episode. Resume must never run the material-commit path again.

## Interaction-layer mismatch to fix deliberately

Today a completed player-built well stops being `{ kind: 'playerWell' }` and is emitted by `src/app/interactables.ts` as the generic `{ kind: 'well' }`. `Interactable` explicitly documents this split. A generic `well` carries only position/prompt/`WaterSource`, so it has no stable player-well id and cannot expose repair safely.

Do not bolt repair onto generic settlement wells. Adjust the interaction representation so a completed **player-built** well retains enough identity for inspect/repair while still supporting drink/fill. Prefer evolving the player-built-well interactable rather than adding repair fields to generic `well`.

The per-frame interactable may carry read-only display state, but authoritative repair start/resume must relookup by id.

## Contextual dialog

Reuse the existing shared interaction panel contract in `src/ui-vue/store.ts`:

```ts
InteractionPanelAction = {
  label
  enabled
  reasonLabel
  run
}
```

`FlavorDialog` already supports an actions list and the well construction panel already uses `describeWellWork(id)` + the real `workOnWell(id)` callback. Mirror this shape:

- a read-only `describeWellRoofRepair(id)` (or equivalent) for current condition/material/work/progress presentation,
- real start/resume callbacks that revalidate from authoritative state.

Do not create a repair-specific Vue modal or put quote logic in Vue.

The plan's `[R] Napraw` is not automatically free: `[R]` is already used for fill-water on wells and requirements on under-construction player wells. Treat keyboard binding as an app/input integration decision after the completed-player-well interaction representation is resolved. The shared dialog action button is the stable requirement; do not force `[R]` if it conflicts with water fill.

## Busy Action / partial credit

Reuse the existing well/standing-torch/palisade active-work pattern in `src/app/actions/placementActions.ts`:

- Busy Action represents one short work bout, not the whole repair,
- measure elapsed useful work,
- partial work on interruption is credited,
- feed only that amount into the world owner's contribution seam,
- use returned `acceptedWork` for accounting/physical-effort consequences.

Do not persist Busy Action state. Persist only `RepairProgress` on the roof.

Keep a stable well id across the bout and relookup before contribution/completion; do not retain a mutable entry reference across Busy Action lifecycle callbacks.

## Water-source availability during repair

Current player and NPC paths differ:

- player interaction derives a `WaterSource` in `app/interactables.ts`,
- NPC water lookup uses `PlayerWells.nearestCompleted()`, which currently filters only through `isWellWaterAvailable()`.

Active roof repair must block both paths. Put the rule in the well domain (e.g. make/extend the usable-water predicate to account for active repair) and make both callers reuse it. Do not add a player-only UI guard while leaving `nearestCompleted()` available to NPCs.

The well must remain present in general lookup/render/collision; only its water-use capability is temporarily unavailable.

## Protection semantics

`world-020` is expected to replace today's binary roof protection with resolved roof-condition protection. During active repair, protection/degradation rules must read the checkpointed `startedCondition`/stored roof condition without advancing degradation until repair completes.

Do not alter groundwater kind/depth or introduce contamination persistence. Keep using the existing `WaterSource.consumptionRisk` seam established by `world-020`.

## Persistence

`world-020` will already extend `SavePlayerWell` for roof condition/anchor. Add optional repair progress to that same well record and current schema/migration validation.

Legacy saves and post-`world-020` saves without active repair should simply restore with no repair episode. Do not persist quote, remaining work, material source, worker, UI state or completion flags.

Because `SaveData` stores global elapsed time but repair progress is explicit work, loading after a long gap must not advance `completedWork`.

## Related plans / boundaries

- `items-player-019` is a later consumer of the same `RepairProgress` lifecycle for deployed camp structures. Keep `repair.ts` generic enough for that use, but do not implement camp repair here.
- `items-player-021` is not required for this well vertical slice; no Repair skill/XP/targeted-skill state belongs in `world-021`.
- Existing `src/settlement/storageRepair.ts` is quest-specific one-shot repair; leave it unchanged.
- Do not extend `WorkType` / `ContractTarget` yet. Future NPC maintenance should call the same target-owned contribution seam.

## Highest-value tests

Focus on ownership/transaction boundaries rather than UI snapshots:

- `applyRepairWork()` exact accepted-work/clamp/no-op behavior,
- completed damaged roof only; unfinished roof/healthy roof unavailable,
- start failure from missing materials causes neither material loss nor condition-anchor mutation,
- all materials committed exactly once on successful start,
- partial work + interruption + resume,
- multiple contributions clamp exactly at completion,
- completion sets target condition, clears repair and resets anchor,
- degradation frozen while active and resumes after completion,
- `PlayerWells.nodes()` / WorldBundle rebuild preserves repair state,
- save/load preserves partial repair without re-consuming materials,
- active repair blocks both player water use and `nearestCompleted()` NPC lookup,
- completed repair restores both water paths,
- interaction regression: completed player-built wells still support drink/fill plus repair/inspect without affecting settlement wells.

## Suggested implementation order

1. Reconfirm the landed `world-020` roof condition/checkpoint APIs and persistence shape.
2. Add pure `repair.ts` primitives/tests.
3. Add well-domain quote + roof repair state and authoritative `PlayerWells` mutations/snapshot support.
4. Add persistence/schema tests.
5. Fix completed player-built-well interaction identity and wire shared dialog preview/start/resume.
6. Wire Busy Action partial contributions.
7. Gate player + NPC water-source use through one well-domain availability rule.
8. Add cross-system regression tests and run `pnpm typecheck`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

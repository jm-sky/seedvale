# Implementation notes: quests-progression-049 Hunters Brotherhood hunting-ground investigation

## Current code reality

- `quests-progression-048` is implemented. Reuse `src/quests/huntersBrotherhoodIntroduction.ts` directly:
  - `HuntersBrotherhoodBinding` is the stable reconstructed cast/binding;
  - `resolveHuntersBrotherhoodBinding(...)` is deterministic and `inviterNpcId === practicalNpcId` is an invariant;
  - `HUNTERS_BROTHERHOOD_JOINED_OUTCOME` is the membership prerequisite;
  - the introduction quest already uses `offer: { exposure: 'story' }`.
- `fauna-031` is implemented. `Fauna.getHabitatPressure(spawnerId, nowDays)` is the public read-only seam. `src/fauna/habitatPressure.ts` owns scoring, thresholds, deterministic tie order and the runtime TTL cache. Do not duplicate any pressure calculation in quests.
- Managed habitat specs in `src/fauna/createFauna.ts::SPAWNER_SPECS` are currently wolf `rockDen`, deer `thicket`, `wolfDen`, bear `rockDen`. **There is no stag `PreySpawner`.** Stag is currently a settlement-relative ring spawn (`SPAWNS`). For V1 the hunting-ground candidate should therefore be the Brotherhood settlements' **deer thicket(s)**. Do not create a stag habitat merely to satisfy wording in the plan.
- `PreySpawner.id` already embeds the creating settlement id (`spawnerId(...)`); for the first thicket this is `${settlementId}:thicket`. Use the real spawner objects/ids, not coordinate matching or a new association table.
- `interact_spawner` is compatible with inspection. `src/interaction/resolveInteraction.ts` reports `{ type: 'interact_spawner', spawnerType, spawnerId }` to `QuestManager` and only falls back to flavor text; destruction is a separate action path. Reuse this ingress.

## Recommended module boundary

Add a focused module beside the introduction, e.g. `src/quests/huntersBrotherhoodInvestigation.ts`. Keep the following pure/testable there:

- investigation quest id/outcome constants;
- candidate filtering/ranking;
- diagnosis derivation/significance rule;
- `QuestDef` materialization from `HuntersBrotherhoodBinding` + chosen `spawnerId`;
- report text derived from the persisted observation.

Do not put this into generic opportunity matrices. This is a deterministic authored story continuation with live world eligibility, not a reusable settlement opportunity type.

## Candidate selection

Input should be bounded to the already resolved Brotherhood binding plus the relevant `Fauna` spawners. Candidate rule for current code:

1. settlement id is `binding.homeSettlementId` or `binding.secondSettlementId`;
2. `spawner.type === 'thicket'` and `spawner.kind === 'deer'`;
3. `fauna.getHabitatPressure(spawner.id, nowDays)` returns non-null and `condition !== 'healthy'`.

Rank deterministically:

1. `critical` before `strained`;
2. stronger component pressure — use the existing snapshot values; do not introduce a second ecology score. A simple max of the four normalized component pressures is sufficient and consistent with fauna-031 condition semantics;
3. stable `spawner.id` lexical tie-break.

Do not use iteration order. Do not scan world settlements or synthesize candidates. If neither Brotherhood settlement has a qualifying deer thicket, do not materialize/offer the investigation yet.

Important lifecycle detail: selection should happen during composition/materialization, but **accepted quest continuity must not depend on rerunning selection later**. The chosen `spawnerId` must be encoded in the materialized quest identity/definition so rebuilding the same world can reconstruct the same definition while existing progress refers to it. Prefer an id that includes the stable habitat id, e.g. prefix + home settlement/inviter + encoded `spawnerId`, rather than a runtime-only `Map<questId, spawnerId>`.

## Quest persistence: add one small quest-local observation seam

Current `QuestProgressEntry` (`src/quests/quests.ts`) persists stage/outcome/counts, offer suppression, journal, world-knowledge slots and dialogue cooldowns. None is semantically suitable for the diagnosis:

- do not encode it into `resolvedOutcomeId`;
- do not abuse `journal` text as machine-readable state;
- do not put it in `worldKnowledge` (that system is for deferred static-world discovery/research);
- do not hide enum values in `stageCount`/`stageSlotProgress`.

The smallest compatible extension is an optional, quest-local typed observation on progress rather than a separate persistence store. Keep it narrow, for example:

```ts
export type QuestHabitatPressureObservation = {
  type: 'habitat_pressure'
  habitatId: string
  condition: HabitatPressureCondition
  primary: HabitatPressureKind | null
  observedPressures: readonly HabitatPressureKind[]
}

// QuestProgressEntry / QuestRuntimeProgress
observation?: QuestHabitatPressureObservation
```

A discriminated observation is preferable to an untyped `Record<string, unknown>` bag: this plan has one concrete persistence need and the next Brotherhood act needs to consume it safely. If another observation kind is added later, widen the union deliberately.

Wire this through all existing progress lifecycle points that copy/normalize/export/reset `QuestProgressEntry`, and extend structural validation in `src/persistence/saveData.ts`. Older saves must remain valid when the field is absent. Do not persist the full `HabitatPressureSnapshot`; store only the stable habitat id and narrative diagnosis required by later quest logic.

`QuestManager` should expose the smallest mutation/read seam needed by the interaction flow (for example `recordObservation(questId, observation)` / read accessor, or a lifecycle hook that writes through manager-owned progress). The quest module must not mutate manager internals directly.

## Inspection timing and interaction integration

The diagnosis must be captured on the actual bound `interact_spawner` event, before/while that objective advances. The current generic `onInteractObjective(...)` only receives the interaction reference; it does not know `Fauna` or world time. Keep that boundary.

Preferred integration:

- add a narrow `QuestLifecycleHooks`/interaction hook in `QuestManager` for a matched objective, or a small injected callback used when a matching `interact_spawner` slot is about to complete;
- `createApp.ts` owns the adapter because it already has `QuestManager`, current world time and `bundle.fauna`;
- for this quest only, when the matched `spawnerId` equals the bound habitat and no observation is recorded yet, call `fauna.getHabitatPressure(spawnerId, nowDays)`, derive the compact diagnosis, persist it, then allow normal objective progression.

Do **not** make `QuestManager` import/use `Fauna`, and do not make `resolveInteraction.ts` story-aware.

Capture once. A second interaction after stage completion must not overwrite the observation. Reporting must read the persisted observation and never recompute pressure.

## Diagnosis/significance rule

Reuse fauna-031 thresholds from `src/fauna/habitatPressure.ts` instead of inventing dialogue thresholds. A pressure is narratively significant when its normalized value is at least `HABITAT_PRESSURE_STRAINED_AT`.

- `primary = snapshot.dominantPressure`;
- `observedPressures` = pressure kinds whose component pressure meets `HABITAT_PRESSURE_STRAINED_AT`, in `HABITAT_PRESSURE_TIE_ORDER` order;
- if the habitat recovered to `healthy`, record `primary: null`, `observedPressures: []`, `condition: 'healthy'` and continue normally.

Mortality remains a symptom. Text may say the herd is reduced / recent losses are high, but must not attribute the cause to hunters, wolves or starvation unless another authoritative signal supports that exact statement. Predator presence and food shortage may be stated as observed concurrent pressures, not proven causes of mortality.

## Quest definition and dialogue

Use the membership quest outcome as an explicit prerequisite. Give/report target is `binding.masterNpcId`; keep `offer.exposure = 'story'` so this continuation is not hidden by ordinary offer caps.

Recommended stages:

1. `interact_spawner` bound to the exact deer thicket `spawnerId` (and current `spawnerType: 'thicket'`);
2. normal report to the master using the existing ready-to-report/report path.

One completion outcome only, e.g. `brotherhood_investigation_complete`. Use existing social consequences/reputation plumbing for modest relation / competence / trust / renown changes; do not add Brotherhood standing.

## Composition root

`src/app/createApp.ts` already builds the Brotherhood introduction from home + bounded `neighborDefs`. Reuse the **same cast input/binding** for 049; do not independently select a second settlement/cast.

Materialize 049 only when:

- the binding resolves;
- the relevant deer thicket candidate resolves from current `bundle.fauna.getSpawners()`;
- its pressure is currently meaningful.

The membership prerequisite still belongs in the `QuestDef`; do not manually inspect saved progress in `createApp.ts` to decide membership. This keeps lifecycle/availability inside `QuestManager`.

Watch rebuild/save semantics: fauna pressure itself is derived/runtime-only, but the accepted quest's target is stable through its quest id/definition and the captured observation is persisted in `QuestProgressEntry`.

## Tests worth adding

Primary focused tests should live beside the new module plus `QuestManager.test.ts` / persistence tests for the new progress field:

- current candidate set accepts deer thickets from exactly the two bound settlements and excludes wolf/bear dens and ring-spawn stag;
- deterministic severity/max-pressure/id ranking;
- no unhealthy candidate => no investigation materialization;
- membership outcome gates offer; story exposure is preserved;
- accepted quest remains bound to its chosen `spawnerId`;
- interaction captures the **current** snapshot once, including recovered healthy state;
- report reads captured observation after fauna state changes;
- save/load round-trip preserves the observation and absent field remains backward-compatible;
- significance uses fauna-031 constants/tie order;
- mortality-only diagnosis contains no unsupported cause attribution;
- existing `interact_spawner` quests and spawner destruction behavior remain unchanged.

## Implementation order

1. Add the compact persisted observation contract + parser/export/restore coverage.
2. Add pure investigation candidate/diagnosis/materializer module and tests.
3. Add the narrow matched-interaction capture hook without fauna imports in `QuestManager`.
4. Wire the adapter/materialization in `createApp.ts` using the existing Brotherhood binding and `Fauna` public API.
5. Run focused quest/fauna tests, persistence tests, typecheck/lint/build per repository guidance. Browser verification remains User-owned.

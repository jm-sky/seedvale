# Implementation Notes: Closed and cautious settlement character

## Recon / architectural decisions

### Settlement identity

- `src/settlement/villagePlan.ts::VillageIdentity` is the right owner for static character. Add `SettlementCharacter = 'default' | 'closed'` and `VillageIdentity.character`; do not create runtime state or persistence for it.
- Resolve character in the same generation phase as `resolveVillageIdentity()` in `src/settlement/settlementGenerator.ts`, before staffing and `VillagePlan` construction. Use a new dedicated salt from `seedForCell`; do not consume existing family/layout/staffing RNG streams.
- Keep `OUTPOST` and `isHome` hard-gated to `default`. Terrain weighting should be a pure resolver so distribution can be tested without generating full villages.

### Palisade: plan assumption differs from current code

`src/settlement/settlementPalisade.ts::plantEntrancePalisade()` currently builds **short wall wings around one selected inland entrance**. It:

- chooses the first inland road entrance (fallback: first inland entrance),
- uses `PALISADE_SEGMENTS_PER_SIDE`,
- preserves an angular gate gap,
- rejects `RoadCorridorSegment` overlap with `pointHitsCorridor()`,
- skips coastal placements.

Therefore `closed` cannot obtain meaningfully higher perimeter coverage by only incrementing `PALISADE_SEGMENTS_PER_SIDE`: that merely extends one pair of wings. Extend this existing generator into a perimeter-placement policy that can emit more of the same ring while retaining all current coast/corridor rejects. Do not add a second palisade implementation.

Recommended seam: make the pure placement calculation character-aware, then keep `plantEntrancePalisade()` as materialization. For `default`, preserve current output as closely as possible; for `closed`, fill substantially more valid ring positions while leaving gaps at **every planned road/path corridor that actually intersects the perimeter**. This is also the safest place to unit-test coverage without Three.js asset loading.

Do not add palisade colliders in this plan: current settlement state explicitly says palisade has no collider. Changing that would be a separate movement/collision behavior change.

### Entrances and torch pairs

- `VillagePlan.entrances` is local planned entrance data; `VillageEntrance.kind` distinguishes `road` vs `path`.
- Inter-settlement routing consumes entrances via `roadNetwork.ts::entranceToward`; do not infer torch placement from rendered road meshes or runtime proximity.
- Generate one deterministic pair only for the `road` entrances that survive into the final `VillagePlan`. Place them from entrance position/outward angle with lateral offsets outside the road half-width and outside palisade wall footprint.
- Prefer adding plain-data entrance decoration placements to the existing settlement prop-building flow (`src/settlement/props.ts`) rather than extending `VillagePlan` with a generic decoration subsystem unless another consumer genuinely needs persisted/planned decoration data.
- Reuse the existing torch prop/materialization path if present in `props.ts`; keep torch placement deterministic and asset loading presentation-only.

Important: multiple entrances are already representable, while current palisade code only selects one. Closed palisade/torch logic must iterate the final entrance set rather than carrying that singleton assumption forward.

### Staffing

`src/settlement/professionStaffing.ts` already has the correct single staffing resolver:

`generateFamilies() -> resolveInitialProfessionStaffing() -> createVillagePlan()`.

- Extend `ProfessionStaffingContext` and internal `StaffingSignals` with settlement character.
- Modify only `ROLE_STAFFING_POLICY.guard`; do not add a special closed-settlement staffing pass.
- Mandatory food/resource coverage is claimed before weighted remainder staffing, so leave `claimTarget()` ordering unchanged. The closed modifier should affect guard priority/duplicate guard eligibility only in `remainderWeights()`.
- Current guard policy excludes an extra guard below adult capacity 6. For `closed`, lowering that duplicate threshold is the narrow mechanism matching the plan; preserve total workforce and reserved-family rules.
- Keep `STAFFING_SALT` unchanged. Character is an input signal; changing the staffing salt would unnecessarily reshuffle unrelated professions.

Update `professionStaffing.test.ts` with paired default/closed contexts using identical families and seed, and assert food/resource coverage remains present.

### NPC caution: use existing social evaluators, not personality mutation

`CharacterDef` / `BigFivePersonality` must remain unchanged. There is already persistent/social state outside settlement identity:

- `src/reputation/ReputationManager.ts` owns player reputation dimensions,
- `src/quests/QuestManager.ts::getRelation(npcId)` exposes NPC sympathy/relation,
- focused decision evaluators such as `src/ai/voluntaryExpeditionJoin.ts` already combine social inputs into an acceptance score.

V1 should add `settlementCharacter` as a small contextual input only to existing evaluators where the caller already knows the NPC's settlement. Do not create a global caution score or duplicate relationship/reputation ownership.

Prefer one shared pure modifier/helper (e.g. closed caution score/threshold adjustment) consumed by selected evaluators, rather than scattering magic constants. Keep it weaker than positive relationship/reputation contributions so established trust can overcome it.

Do not force caution into generic dialogue text generation unless there is an existing numeric reaction/willingness seam. The plan asks for existing scoring paths, not a dialogue rewrite.

### Predator pressure: build on configured spawners

`src/fauna/AnimalSpawner.ts::PreySpawner.maxPreyCount` is the canonical per-spawn-point population cap. `updateSpawners()` already enforces it using nearby same-kind live animals; do not add another cap or runtime settlement-pressure loop.

`src/fauna/createFauna.ts` is the construction point for ordinary habitat spawners (`SPAWNER_SPECS`) and already owns terrain/habitat placement. Implement closed pressure as a **deterministic generation-time augmentation of spawner specs/instances** before runtime lifecycle begins.

Recommended shape:

1. classify predator-compatible generated spawners from their `kind`/species role, not from `SpawnerType` alone;
2. sum configured predator capacity (`maxPreyCount`) inside one closed-pressure radius;
3. compute the closed target from the natural configured baseline;
4. add only the deficit by either increasing compatible generated capacity or creating additional compatible spawner placement through the same placement validator;
5. never inspect current live animal count for this calculation.

Prefer additional deterministic compatible spawn capacity over mutating special scenario spawners such as `wolfDen`; quest/scenario pressure fields on `PreySpawner` are a different contract.

Overlap must be resolved from the final local configured pressure, not `+25% per settlement`. Process candidate closed-settlement requirements in a stable settlement-id/cell order, and before adding capacity recalculate the configured capacity already present in the target radius. This makes output independent of streaming/runtime order.

Be careful with persistence: `SavedSpawnPointState` relies on deterministic stable spawner ids while position/type/kind are reconstructed. Any new spawner must have an id derived from stable settlement/candidate identity, never an insertion-order counter that can change when another settlement overlaps.

### Generation order / data flow

Keep the dependency direction explicit:

```text
seed + cell + terrain
-> VillageIdentity.character
-> families + profession staffing
-> VillagePlan/layout
-> settlement props (palisade/torches)
-> fauna configured-pressure augmentation
```

Character itself is static generated identity; none of these consumers owns or mutates it.

## Files likely to change

- `src/settlement/villagePlan.ts` — character type + identity field.
- `src/settlement/settlementGenerator.ts` — deterministic resolver and propagation into staffing.
- `src/settlement/settlementPalisade.ts` — character-aware pure ring placement / coverage policy; preserve coast and corridor constraints.
- `src/settlement/props.ts` — entrance torch materialization and palisade character input.
- `src/settlement/professionStaffing.ts` + tests — closed guard weighting/duplicate eligibility.
- selected existing social evaluator(s), likely including `src/ai/voluntaryExpeditionJoin.ts`, plus callers that can supply settlement character.
- `src/fauna/createFauna.ts` / focused helper extracted from it — configured predator-pressure accounting and deterministic deficit filling.
- `src/fauna/AnimalSpawner.ts` only if a reusable pure configured-capacity helper belongs beside the canonical `PreySpawner` contract; avoid changing runtime respawn semantics.

## Tests worth isolating

Prefer pure tests over full world boot:

- character resolver distribution/determinism and home/OUTPOST exclusion;
- perimeter placement coverage + every entrance/corridor gap;
- exactly two torch placements per final road entrance;
- paired staffing with identical workforce;
- caution helper/evaluator with low vs high relation/reputation;
- configured predator-capacity resolver for below-target, already-above-target and overlapping closed settlements;
- stable generated spawner ids independent of input/processing order.

## Main pitfalls

- Treating current palisade wings as an existing full perimeter and merely increasing segment count.
- Using only the first entrance for closed settlements.
- Consuming existing RNG streams and unintentionally changing families/names/layout/fauna globally.
- Adding a second guard allocation pass after `resolveInitialProfessionStaffing()`.
- Encoding caution in `CharacterDef` traits/personality, which would turn settlement context into intrinsic NPC identity.
- Using live animal count for generation target or maintaining pressure every frame/day.
- Reusing `wolfDen` quest pressure as the generic closed-settlement predator mechanism.
- Creating overlapping settlement bonuses additively instead of resolving one local capacity deficit.
- Changing deterministic spawner identity and orphaning `SavedSpawnPointState`.

## Suggested implementation order

1. Character resolver + `VillageIdentity.character`.
2. Staffing signal and tests.
3. Pure palisade/entrance torch placement + prop materialization.
4. Focused social caution modifier in existing evaluator paths.
5. Pure fauna configured-pressure resolver, then `createFauna()` integration and overlap/id tests.

This order establishes the static identity first and keeps each consumer independently testable before the cross-domain fauna integration.

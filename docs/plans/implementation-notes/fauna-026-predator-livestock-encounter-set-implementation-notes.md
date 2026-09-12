# Implementation notes: fauna-026 — predator ↔ livestock encounter set

Plan: `docs/plans/fauna-026-predator-livestock-encounter-set.md`

## Recon baseline

Verified against `main` on 2026-09-12 after the Living World audits. The audit finding remains present in production code.

### Current broken composition

`src/fauna/createFauna.ts`

- `Fauna.update(...)` loops the wild `agents` array.
- Every wild `AnimalAgent.update()` receives `others: agents` only.
- `Fauna.getAgents()` exposes this wild runtime pool; it does not contain settlement livestock.

`src/settlement/livestock.ts`

- `tickSettlementLivestock(livestock, ctx)` calls each livestock agent with `others: livestock` only.
- `nearbyPredators` is a separate caller-supplied signal used by domestic/prey alert and dog guard behaviour; it does not make livestock visible to wild prey acquisition.
- `LivestockRegistry.capture()` / `upsert()` / `serialize()` remain the persistence owner.

`src/fauna/AnimalAgent.ts`

- `resolvePreyTarget(others)` keeps `this.preyTarget` while alive/in range, otherwise calls `nearest(others, 'prey', this.def.detectRange)`.
- `nearest()` requires exact `AnimalDef.role`, so `role:'livestock'` is excluded even if the object were manually appended to `others`.
- `updatePredator()` already owns chase and contact transition.
- `attack(target)` already owns cooldown/stamina/attack animation and calls `target.takeDamage(...)`.
- `huntingPrey()` already exposes `preyTarget.animalId` and `preyTarget.ownerHouseId`.
- `preyTarget` is a runtime object reference, not persisted state.

`src/fauna/animalDefs.ts`

- `AnimalRole = 'predator' | 'prey' | 'livestock'`.
- Domestic species including `dog` use `role:'livestock'` deliberately.
- Do not reclassify them to `prey`.

## Production ordering to preserve

`src/app/gameLoop.ts` currently does, inside the non-time-skip simulation block:

```text
build wild threateningAnimals / nearbyWolves
→ SettlementsManager.update(...)
→ syncLostLivestockQuests()
→ Fauna.update(...)
→ traps update
```

The encounter candidate view should be assembled after `SettlementsManager.update(...)` and before `Fauna.update(...)`.

Reason: `SettlementsManager.update()` may stream settlements in/out and it also ticks/cleans detached livestock. Building the view before that call can leave a same-frame stale object reference when a settlement is captured/disposed.

Do not reorder the entire simulation just to remove the existing one-frame delay in `threateningAnimals`; downstream NPC defense already consumes previous committed fauna state under the current ordering.

## Existing composition accessors

`src/settlement/SettlementsManager.ts`

Reuse:

- `getLoaded(): Settlement[]`
- `getDetachedLivestock(): AnimalAgent[]`
- `resolvePersistentAnimal(...)` only for identity/action lookups; do not query it per predator.

`Settlement` already exposes `.livestock`.

Detached livestock is ticked separately in `SettlementsManager.update()` with `tickSettlementLivestock(detachedLivestock, ...)`. Today this is primarily player-owned persistent livestock, but the encounter composition should not encode that assumption; future household stray/led detach must work automatically.

## Suggested composition helper

Prefer a small pure helper under `src/app/`, for example:

`src/app/faunaEncounterComposition.ts`

Responsibilities only:

- accept currently loaded settlement livestock collections + detached collection,
- append live `role:'livestock'` agents to a caller-owned scratch array,
- dedupe by stable `animalId`,
- return/read the scratch as `readonly AnimalAgent[]`.

Do not:

- own/persist agents,
- call `AnimalAgent.update()`,
- inspect household/economy state,
- scan `LivestockRegistry`,
- introduce an `EncounterManager`.

A scratch-array API is preferable to `flatMap()` if it stays simple because this executes each fauna pass. Existing code already uses scratch arrays in fauna/attraction paths.

## `Fauna.update` contract

`src/fauna/createFauna.ts` currently has a long positional `Fauna.update` signature. Do not refactor the whole signature in this fix.

Add one required read-only argument near the fauna perception/world inputs or at the end, with a precise name such as `huntableLivestock`.

Making it required at the `Fauna.update` boundary is useful: TypeScript then forces every production/test caller to make an explicit composition decision. At the lower `AnimalUpdateContext` level it may be required or defaulted to `[]` depending on test churn, but production `Fauna.update` should not silently omit the seam.

Inside the wild loop:

```text
a.update({
  ...,
  others: agents,
  huntableLivestock,
})
```

Never concatenate the arrays.

## `AnimalAgent.resolvePreyTarget` implementation constraint

Keep two candidate domains explicit:

```text
wild candidate      = member of current `others` + role:'prey'
livestock candidate = member of current external list + role:'livestock'
```

Do not weaken `nearest(others, role, range)` globally unless a tiny reusable predicate clearly reduces code without changing existing callers.

A narrow additional helper such as `nearestLivestockCandidate(...)` is acceptable.

### Current target revalidation

This is required for correctness across streaming.

Before reusing `this.preyTarget`, establish which current candidate source contains that exact live object/reference:

- if `role === 'prey'`, target must still be in current `others`,
- if `role === 'livestock'`, target must still be in current `huntableLivestock`.

Then apply dead/range checks.

If membership is gone, clear/replace the commitment before `updatePredator()` can chase or attack it.

Do not rely only on `health.dead` + distance: a disposed settlement livestock object can remain a valid JS reference after stream-out.

### Choosing across two nearest candidates

Preserve existing behaviour when no livestock is present.

Recommended shape:

1. existing nearest wild prey,
2. nearest legal livestock candidate,
3. compare distances,
4. current committed target wins while still legal,
5. exact no-commit tie resolves by stable `animalId`.

No random roll.

Do not add species-specific branches in this plan.

## Ownership propagation

`src/fauna/animalOwnership.ts`

Canonical value:

```ts
type AnimalOwner =
  | { kind: 'household', houseId: string }
  | { kind: 'player' }
  | null
```

`AnimalAgent.ownerHouseId` is derived via `deriveOwnerHouseId(this._owner)`.

Do not copy owner ids into encounter records. The live candidate already owns the authoritative value. After commitment, existing `huntingPrey()` reads the derived value.

Expected outcomes:

- household sheep → `huntingPrey().ownerHouseId` populated,
- player-owned detached livestock → `undefined`, still physically huntable,
- future detached household stray → populated without composition changes.

## Shepherd downstream path

`src/app/gameLoop.ts`

The existing `threateningAnimals` map includes:

- `preyAnimalId: prey?.animalId`
- `preyOwnerHouseId: prey?.ownerHouseId`

`src/fauna/shepherdFlock.ts::senseOwnedFlockThreat()` already checks:

```text
candidate.preyOwnerHouseId === shepherd household
+ candidate.preyAnimalId exists
+ radius
```

Do not introduce a second shepherd proximity heuristic. The expected implementation work here is tests proving the newly real commitment flows through the existing shape.

## Dog guard mismatch that must be fixed in the same plan

`src/fauna/dogGuard.ts`

Current `DogGuardWolfCandidate` contains only:

```ts
npcTarget: { npcId, homeId? } | null
```

`resolveDogGuardTarget()` therefore cannot react to `wolf.huntingPrey()`.

`src/fauna/AnimalAgent.ts::resolveGuardTarget()` builds that candidate from `wolf.npcTarget` only.

Extend the existing candidate with narrow committed-prey context. Keep it plain data. One suitable shape is conceptually:

```ts
preyTarget: { animalId: string, ownerHouseId?: string } | null
```

or equivalent fields if that avoids allocations.

Own-household guard priority should treat either as an own-household attack:

```text
wolf npcTarget.homeId === dog.ownerHouseId
OR
wolf preyTarget.ownerHouseId === dog.ownerHouseId
```

The resolved combat target remains the attacking wolf. No second dog combat path: `updateDogGuard()` already chases/bites a live wolf using the shared `attack()`.

Avoid widening the assist-other-household policy unless current tests/contracts demand it. The required livestock change is own-household defense.

If `protectedNpcId` becomes semantically wrong, replace it with a small tagged/generic protected-target diagnostic only if it is genuinely consumed. Search all call sites first; current runtime movement only needs the wolf reference and own-household flag.

## Livestock death and persistence

`src/settlement/livestock.ts`

The persistent record is captured from the same `AnimalAgent.snapshot()` and canonical owner. Death does not need a predator-specific persistence operation.

`AnimalAgent` receives `onDeath` through livestock spawn/restore construction. The generic `onAnimalDeath(animalId)` hook was intentionally designed to fire for any death cause.

Tests should prove predator damage reaches this existing hook exactly once.

Do not call `LivestockRegistry.markRemoved()` on death. Tombstone/removal remains tied to existing corpse `readyToRemove()` lifecycle in `tickSettlementLivestock()`.

## Stream-in/out edge

`SettlementsManager.update()` owns streaming and runs before wild fauna in the current game loop.

Detailed contract after this fix:

```text
stream-in
→ live livestock object exists
→ next encounter composition can expose it

stream-out
→ manager captures/disposes livestock
→ post-manager encounter composition no longer exposes it
→ predator target membership revalidation drops stale commitment
```

No off-screen kill is synthesized.

Do not solve the separate audited H10 issue (household led/stray livestock being disposed with a non-home settlement). The new composition includes detached agents so the later H10 fix can reuse the seam without changes.

## Performance

Do not scan persistence records.

Expected bounded work:

- one pass over current materialized livestock to assemble/dedupe candidates,
- predator-side linear scan over that local list using existing `detectRange`,
- no scan per NPC/dog of all animals,
- no new worker,
- no world-global spatial index.

If adding dedupe storage, reuse/clear a scratch `Set<string>` or equivalent once per composition pass; do not retain membership as authoritative state across frames.

## Tests to modify/add

Likely files:

- `src/fauna/AnimalAgent.test.ts`
- `src/fauna/dogGuard.test.ts`
- `src/fauna/shepherdFlock.test.ts`
- `src/settlement/livestock.test.ts`
- new `src/app/faunaEncounterComposition.test.ts` if the helper is extracted.

Key rule: at least one integration-style predator test must have **wolf in wild `others` and sheep only in external encounter candidates**. Do not prove the fix by putting sheep in the same `others` array.

Required regressions:

1. separate-pool acquisition,
2. role remains livestock,
3. wild-vs-livestock nearest selection,
4. deterministic tie,
5. range rejection,
6. committed external target disappears from candidate set → no further attack,
7. actual update/chase/contact can damage/kill livestock,
8. `onAnimalDeath` exactly once,
9. `huntingPrey()` carries real household id,
10. shepherd resolver sees that real signal,
11. dog resolver sees own-household livestock prey,
12. loaded+detached candidate composition + dedupe,
13. livestock snapshot after death remains in livestock persistence; wild predator never enters it.

A compile-time production-wiring guard is desirable: keep the `Fauna.update` encounter parameter required.

## Related plans / sequencing

- `fauna-023`: already implemented / verification-needed. Do not modify its attraction system; after this fix, lures can naturally lead to real livestock encounters.
- `fauna-025`: already implemented / verification-needed. No hard dependency; retest predator-driven stray/death after this plan. H10 streaming continuity is separate.
- `fauna-011`: existing dog guard must reuse the new prey commitment, not proximity-only logic.
- `fauna-004`: existing shepherd threat resolver should become reachable without redesign.
- `quests-progression-019`: already implemented / verification-needed; no retroactive dependency. Any future settlement-threat narrative work should recon/reuse this seam.

## Deviation from plan — `AnimalDef.role` does not equal "is livestock"

Implemented 2026-09-12. Before writing the resolver, current `src/fauna/animalDefs.ts`
was re-checked and contradicts one assumption repeated through the plan text
(§3, §11, test items 7/8): it is **not** true that every household/livestock
species uses `role: 'livestock'`.

Actual roles for the 7 kinds `settlement/livestock.ts` spawns:

```text
role: 'livestock'  → horse, donkey, cow, dog
role: 'prey'       → sheep, chicken, rooster
```

`sheep`/`chicken`/`rooster` deliberately keep `role: 'prey'` so their own
flee/threat behaviour (`updatePrey()`) works without a separate branch — this
predates fauna-026 and was not changed by it (per the plan's own "don't
reclassify role" constraint, correctly followed).

Consequence for the implementation actually shipped:

- `buildHuntableLivestock()` (`src/app/faunaEncounterComposition.ts`) does
  **not** filter candidates by `role === 'livestock'`. Membership in the
  caller-supplied loaded-settlement/detached-livestock collections is what
  makes an agent "livestock" here — it only defensively excludes an
  (impossible in practice) `role: 'predator'` entry.
- `AnimalAgent.resolvePreyTarget()`'s current-target revalidation checks
  `others.includes(target) || huntableLivestock.includes(target)` — i.e. pool
  membership — instead of branching on `target.def.role`, since a committed
  livestock target can legitimately have `role: 'prey'` (sheep) or
  `role: 'livestock'` (cow).
- `nearestLivestockCandidate()` does not require `role === 'livestock'`
  either, for the same reason; it only excludes `role: 'predator'`.

None of this changes the plan's actual intent (a bounded, caller-supplied,
never-merged livestock encounter set feeding the existing predator/chase/
attack/death path) — it only corrects which field the implementation may
safely gate on. Test item 8 ("sheep still has `role === 'livestock'`") is
implemented instead as "sheep keeps its real `animalDefs.ts` role
(`'prey'`) and is still selected/killed via the livestock encounter set,"
which is the behaviour that actually matters.

`docs/state/fauna.md` has been updated to state this `role` split explicitly
so a future plan doesn't re-inherit the same wrong assumption.

## Implementation order

1. composition helper + tests,
2. required `Fauna.update` parameter,
3. `AnimalUpdateContext` + prey resolver,
4. stale commitment membership guard,
5. two-pool chase/damage/death tests,
6. shepherd signal test,
7. dog guard extension + tests,
8. persistence/stream regression tests,
9. state docs update after code is implemented.

No browser verification by the agent. Do not run `pnpm docs:sync`.
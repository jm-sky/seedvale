# NPC Grave Visits — Implementation Notes

**Plan:** `npc-026-npc-grave-visits.md`  
**Recon:** 2026-09-08, current `main`

## Current blockers

`npc-026` is **not implementable yet as written**. Both required world contracts are still planned:

- `npc-010` — death/corpse lifecycle,
- `npc-011` — burial + persistent graves,
- `world-terrain-016` — canonical settlement ↔ cemetery assignment.

Current code has `HealthState.dead`, but no NPC corpse disposal/burial path and no persistent grave collection. Do not invent a temporary grave registry or derive targets from procedural cemetery grave meshes. Re-open the final implementations of 010/011/016 before coding 026.

The key contract 026 needs from 011 is a cheap stable lookup equivalent to:

```text
deceased NpcId → persistent grave record → world position
```

The grave record should retain deceased identity; household/relationship data should remain owned by the existing settlement/NPC systems.

## Eligibility: use generated family membership, not `Household` contents

`src/settlement/household.ts`'s `Household` owns resources/home identity, **not a member list**. Family membership lives in the deterministic settlement definition (`SettlementDef.families`) and `createSettlement.ts` already maps each `familyIndex` 1:1 to `householdIdFor(settlementId, familyIndex)`.

Therefore build eligibility where settlement definition/family membership is already available (most naturally during settlement/NPC construction), and inject a bounded lookup/candidate seam into NPC behaviour. Do not scan `HouseholdRegistry` trying to recover members and do not add duplicated membership state to `Household` just for visits.

For V1, household/family membership is sufficient.

## Do not use NPC relationships in V1

`src/settlement/npcRelationships.ts` currently exposes only a symmetric numeric scalar:

- `get(aId, bId): number`,
- `adjust(aId, bId, delta)`.

There is no canonical "meaningful relationship" threshold or semantic level. Adding one only for grave visits would violate the plan. Leave relationship-based eligibility out of V1 unless another dependency lands a shared semantic contract first.

Do not use `QuestManager` relations; those are player↔NPC and unrelated.

## Decision integration

Current `NpcAgent.choose()` already combines independent pressure producers (needs, weather, healing) before `npcDecision.ts` applies outer fixed-priority sequencing. Grave visits should extend that path rather than become a scheduler activity or fake `NeedId`.

Recommended shape after dependencies land:

1. During one normal `choose()` pass, resolve at most one eligible grave candidate from this NPC's own family/household context.
2. If candidate + cooldown + deterministic opportunity permit it, push a low-score `'visitGrave'` pressure into the existing arbitration.
3. Extend `NpcDecisionTarget` with `'visitGrave'` and `NpcDecisionKind` with a low-priority branch.
4. Keep it below `scheduledSleep` and above plain idle; e.g. the current table leaves a natural slot between `scheduledSleep(70)` and `idle(60)`.
5. Dispatch directly to a visit action; keep `activeNeed === 'idle'`.

Keeping `activeNeed` idle is important: the existing throttled interrupt path then naturally allows vigor collapse, critical needs and severe weather to cancel the visit. Do not add cemetery-specific interruption code.

`ScoredAction` only carries `{kind, score}`, so do not widen the shared simulation type just to carry a grave object. Resolve/cache the chosen grave candidate for that single decision pass and pass it into the visit dispatcher only if `'visitGrave'` wins.

## Plan vs action

Current `NpcPlan` (`src/ai/npcPlan.ts`) is still explicitly `NeedId`-derived. A grave visit is short optional leisure-like behaviour, closer to existing `heal` / `shelter` / `social` actions than to food/water/work goals.

Do **not** expand the persistent Goal/Plan model for V1 unless `npc-011` has already generalized it for burial and there is a clear reuse seam. It is acceptable for an in-progress visit to be abandoned on settlement unload/reconstruction and reconsidered later; runtime `phase`, `pendingAction` and pathfinding are intentionally not persisted today.

The semantic identity of the selected grave/deceased must still exist during execution/revalidation; it does not require putting target metadata into shared `PlannedAction`.

## Action execution

Reuse `NpcPlannedAction` and the generic `goTo → execute` FSM in `src/ai/npcAction.ts` / `NpcAgent.ts`:

- add a domain `ActionId` such as `visitGrave`,
- destination = grave approach/world position resolved from the persistent grave,
- `durationSec` = short deterministic stay,
- `onComplete` = only cooldown/history update; no world mutation is required.

Do not add a movement mode, pathfinder, cemetery queue or dedicated FSM. Arrival must lead to a real timed `execute` phase, not immediate completion.

If the grave disappears/becomes invalid before dispatch or after reconstruction, treat the opportunity as obsolete and return to normal arbitration.

## Cooldown / persistence

There is currently no generic NPC memory/history field suitable for "last visit per grave". `NpcAuthoritativeState` persists seven fields through `SaveData.npcStates`, but none is visit memory. `activePlan` is not a reliable cooldown store because it is replaced by unrelated need plans.

Prefer a **small persisted NPC-owned visit state**, only if needed to satisfy cooldown across save/load. Keep it keyed by stable deceased/grave identity and bounded to actual visited graves; do not create a global `GraveVisitManager`.

If adding such a field to `NpcStateSnapshot`, follow the real persistence path (`SaveData.npcStates`, validator/version/migration/tests). Note that comments inside `npcState.ts` still contain stale text claiming snapshots are not in `SaveData`; current code/docs confirm they are persisted, so follow actual save wiring rather than those old comments.

Use simulation time (`elapsedDays` or the same world-time domain used by 010/011), never `Date.now()`.

## Candidate lookup / performance

Do not scan all graves or all NPC relationships.

The bounded direction is:

```text
living NPC
→ its generated family/household members
→ dead member ids
→ persistent-grave lookup by deceased id
→ cooldown/opportunity
```

A family is already a small local list, so no additional index is justified unless 011's final grave API requires one. Relationship expansion can be added later when there is a canonical semantic relationship query.

## Cemetery dependency

Once a persistent grave exists, 026 should not care whether its cemetery is dedicated/shared or which cemetery is nearest. `world-terrain-016` owns settlement↔cemetery assignment; `npc-011` should already have used that assignment when creating the grave.

026 should therefore consume **grave position only**, not call `cemeteryForSettlement()` during every visit decision. This also makes shared cemeteries work automatically.

## Off-screen / streaming reality

There is no general remote NPC executor today. `SettlementsManager` materializes/ticks active settlements; runtime action/path state disappears on unload.

Do not add off-screen grave travel simulation for this plan. World independence here means eligibility/cooldown/grave facts survive persistence/rebuild and a loaded NPC may autonomously choose the visit without player presence. An unfinished visit may be dropped on unload and reconsidered when the NPC is materialized again.

## Focused implementation order

1. Re-open final `npc-010`, `npc-011`, `world-terrain-016` code/notes and verify their actual contracts.
2. Add a bounded deceased-family → grave candidate resolver at settlement/NPC construction boundary.
3. Add minimal persisted cooldown state only if the final dependency contracts do not already provide an appropriate NPC-owned memory seam.
4. Add `'visitGrave'` to the existing pressure/decision path at low priority.
5. Add one normal timed `NpcPlannedAction` using existing navigation/FSM.
6. Test eligibility, priority/interruptions, cooldown, save/rebuild, and no player-triggered behaviour.

## Tests worth keeping

Highest-value automated cases:

- same-family deceased + persistent grave can produce a candidate; unrelated/no-grave cannot,
- relationship scalar alone does not make an NPC eligible in V1,
- visit loses to critical needs/severe weather/scheduled sleep but can beat idle,
- visit uses the concrete grave position and performs a non-zero timed stay,
- successful completion updates cooldown; save/load does not immediately re-trigger the same grave,
- settlement unload/rebuild does not require persisted path/action state,
- no global grave scan and no nearest-cemetery selection are introduced.

Docs-only preparation does not require browser verification and should not run `pnpm docs:sync`.
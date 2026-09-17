# Implementation Notes: npc-048 — Local threat assistance and guard response

**Plan:** `docs/plans/npc-048-local-threat-assistance-and-guard-response.md`  
**Reviewed:** 2026-09-17  
**Source:** current `main` + targeted threat-forwarding/settlement-update/guard-loadout recon

## Verified current seams

### Threat forwarding already has the right architecture

`src/ai/NpcAgent.ts` already receives:

```ts
nearbyAnimalThreats: readonly ThreateningAnimalCandidate[] = []
```

The comment at that seam explicitly says the list is caller-filtered to currently threatening animals and is not a per-NPC world scan.

`src/settlement/SettlementsManager.ts` and `src/settlement/createSettlement.ts` already expose/forward the same bounded `ThreateningAnimalCandidate[]` input through settlement update into each loaded `NpcAgent.update()`.

This existing pipeline is the key architecture for this plan. Extend it rather than adding a registry/event bus.

### `ThreateningAnimalCandidate` already carries a combat handle

`src/ai/npcAnimalThreat.ts` owns the candidate and immediate-threat perception/arbitration helpers. The candidate already carries the live predator `CombatTargetHandle`, position/identity and optional committed prey ownership.

A local assistance candidate should reuse/reference the same live target. Do not copy animal combat state into NPC-owned state.

### Generic defend/flee scoring is reusable

`arbitrateAnimalThreat()` and score helpers already decide whether an NPC should defend or flee based on actual usable capability, HP ratio and personality.

An assistance/alarm observation should become another perception source feeding this scorer. It is never a direct `fight` command.

If guard responsibility needs a bias, add a narrow generic scoring context/input and keep the hard inability/critical-HP escape path intact.

### Guard equipment is already systemic

`src/ai/npcLoadout.ts::DEFAULT_WEAPON_BY_ROLE` already contains:

```ts
guard: 'long_sword'
```

`seedInitialPersonalBelongingsIfNeeded()` puts it in the normal authoritative personal inventory. Do not seed a second guard weapon in runtime response code.

### Guard staffing/physical profile are separate generation concerns

`src/settlement/professionStaffing.ts` assigns guard coverage from settlement/workforce signals. SPEA/physical profile is derived elsewhere (`npcPhysicalProfile.ts`, `effectivePhysicalAttributes.ts`).

Do not pull candidate-quality ranking or guard HP tuning into this implementation; that would create a generation-order/refactor dependency unrelated to local threat cooperation. Measure response quality first.

### Emergency locomotion and shepherd response are dependencies

- `npc-046` owns semantic NPC run/stamina/animation.
- `npc-047` owns shepherd recognition/response to owned-flock danger.

This plan consumes those contracts and adds only cooperation/guard perception.

## Recommended implementation order

1. Trace the current runtime call site that assembles `nearbyAnimalThreats` before `SettlementsManager.update()`.
2. Define the smallest transient local assistance candidate/read-only view; reuse the existing `CombatTargetHandle`.
3. Build/derive a bounded candidate list once at the same composition layer rather than in each NPC.
4. Forward it through `SettlementsManager` and `Settlement.update` alongside the existing threat list.
5. Add cheap per-NPC radius/perception filtering.
6. Feed perceived assistance danger into the existing `arbitrateAnimalThreat()` contract.
7. Add guard awareness radius + defend-score responsibility bias without bypassing generic arbitration.
8. Defend → dependency run + existing `beginCombat()`; flee → existing emergency flee path.
9. Verify threat disappearance removes the derived assistance signal automatically.

## Candidate ownership/lifetime

Do not store alarms in `NpcAuthoritativeState`, `SettlementEconomy`, household state or SaveData.

Preferred lifetime:

```text
live fauna/NPC threat facts
→ derive local assistance candidates for current update
→ forward read-only bounded list
→ NPC perceives/arbitrates
→ discard/rederive next update
```

This naturally clears stale alarms when the predator dies, stops threatening, target becomes invalid, or the situation is otherwise no longer represented by live threat facts.

Avoid a timeout registry unless current code proves derivation cannot express one necessary case.

## Candidate shape

Keep it narrow. It needs enough to:

- identify the live threatening animal,
- know the danger/assistance location,
- carry the existing `CombatTargetHandle`,
- optionally identify source NPC/context when needed to prevent self/duplicate semantics,
- classify the narrow V1 predator danger kind.

Do not generalize this into a universal `WorldEvent` abstraction.

## Perception policy

Perception is role/context policy over a bounded candidate list, not a new world query.

Suggested separation:

```text
candidate construction → who/what is currently a real local danger
per-NPC perception      → is this candidate within awareness radius?
arbitration             → defend or flee given my capability/state/role context?
execution               → run/combat/flee using existing systems
```

This keeps information, decision and action distinct.

Guard awareness can use a larger constant/range than ordinary civilians, but both stay local and testable.

## Guard bias

Prefer adding an optional context to the existing scoring helper, conceptually:

```text
role responsibility / protecting settlement
```

rather than branching inside combat execution.

Requirements:

- bias matters only when combat capability is actually usable,
- critically hurt/incapable guard retains flee path,
- no damage/HP multipliers,
- no role-owned combat FSM.

## Existing forwarding files to inspect first

- `src/ai/npcAnimalThreat.ts`
  - `ThreateningAnimalCandidate`
  - `senseImmediateAnimalThreat()`
  - `arbitrateAnimalThreat()` / score helpers
- `src/ai/NpcAgent.ts`
  - `nearbyAnimalThreats` update parameter
  - current personal threat branch
  - `beginCombat()` / interruption / dependency locomotion use
- `src/settlement/SettlementsManager.ts`
  - update signature/comment forwarding `nearbyAnimalThreats`
- `src/settlement/createSettlement.ts`
  - settlement update input and NPC forwarding
- runtime/game-loop/fauna composition call site that constructs current threatening-animal candidates
- `src/ai/npcLoadout.ts`
  - verify existing `guard → long_sword` remains untouched
- related threat forwarding/integration tests

## Performance guardrails

- derive candidate list once per relevant settlement/update composition, not once per NPC,
- no NPC × all-fauna world scan,
- no camera-distance correctness gate,
- no global settlement alarm scan,
- transient lists should stay bounded to materialized/local threat candidates,
- no Web Worker for this local arbitration,
- preserve off-screen simulation independence; presentation may simplify but world danger cannot require the player/camera.

## Tests worth keeping pure

Prefer pure tests for:

- assistance radius filtering,
- guard vs civilian perception ranges,
- guard responsibility bias in generic threat scoring,
- stale/dead threat candidate rejection.

Use integration tests for:

- bounded candidate forwarding through settlement update,
- patrol/work interruption,
- `defend` reuses target handle + existing combat,
- response uses dependency run,
- danger clear returns to ordinary work/patrol.

## Documentation follow-up

After implementation update `docs/state/npc.md` with:

- bounded local threat-assistance perception,
- guard wider awareness + generic defend bias,
- explicit statement that alarms are transient/derived and not authoritative persisted state.

Update cross-domain docs only if the existing fauna→settlement candidate bridge contract changes materially.

## Manual verification boundary

AI implementation should run automated/type checks only. Browser gameplay verification is the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
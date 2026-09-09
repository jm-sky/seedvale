# Implementation Notes: items-player-019 — Player camp repair and sewing kit

## Recon status — 2026-09-09

Dependencies previously treated as future contracts are now implemented on `main` and must be consumed directly:

- `items-player-018` — camp inspection + weather-driven `0..100` condition for tent/bedroll/platform,
- `items-player-021` — `Repair` skill, `evaluateSkillCompetence`, targeted skill selection and dispatcher,
- `world-021` — shared actor-neutral `RepairProgress` + live player-well consumer,
- `settlements-006` — current merchant sell/pricing behavior must be respected when tents become instance-backed.

Historical notes that described these as planned/preflight dependencies are obsolete.

## Verified current APIs

### Shared repair

`src/world/repair.ts` is intentionally small:

```ts
export type RepairProgress = {
  startedCondition: number
  targetCondition: number
  requiredWork: number
  completedWork: number
}

repairRemainingWork(progress)
isRepairComplete(progress)
applyRepairWork(progress, workAmount)
```

Important ownership rule from the implementation itself: this module does **not** know materials, skill, actor, target kind, ownership, assignment or maintenance priority.

Do not extend it with camp policy unless a genuinely generic primitive is missing.

### Real `world-021` consumer pattern

`src/world/createPlayerWells.ts` is the best current reference.

`PlayerWells` exposes:

```ts
startRoofRepair(
  id,
  nowDays,
  hasMaterial,
  consumeMaterial,
  targetCondition?,
): WellRoofRepairStartOutcome

contributeRoofRepairWork(
  id,
  workAmount,
  nowDays,
): number
```

The owner:

1. relooks up the target by stable id,
2. derives authoritative repair state in the domain,
3. performs material preflight before mutation,
4. persists `RepairProgress` on the target record,
5. uses `applyRepairWork`,
6. completes by writing condition, clearing progress and resetting the degradation anchor.

Camp repair should mirror this ownership pattern instead of inventing `CampRepairManager` or storing repair state in app/UI code.

### Targeted skills

`src/interaction/targetedSkillAction.ts` currently contains a concrete dispatcher, not a generic handler registry.

Current shape:

```ts
export type TargetedSkillQueryContext = {
  getTrap: (id: string) => PlacedTrapRecord | null
}

export type TargetedSkillActionId = 'inspect-trap'

queryTargetedSkillAction(skill, target, context)
executeTargetedSkillAction(skill, target, context)
```

Query is read-only; execute calls query again and revalidates live target state.

For 019 extend the existing context/action union/dispatcher only as far as necessary for camp repair. Do not create a second targeted-action framework or introduce a registry abstraction just for this plan.

### Repair skill evaluation

`src/player/skillEvaluation.ts` provides `evaluateSkillCompetence(...)`. It reads primary competence plus optional support/context inputs but intentionally does not combine them into a global weighted score.

For camp repair:

- primary = `repair`,
- optional support = `survival`,
- concrete camp policy decides whether/how support affects work/material efficiency,
- if no simple useful support rule is needed, omit Survival influence rather than adding a new formula.

### Item capabilities

`ItemCapability` lives in `src/items/itemCatalog.ts`; Inventory already exposes `hasCapability(...)`.

Add only:

```text
textile_repair
```

Tent/bedroll repair checks capability, not sewing-kit kind.

Platform continues to use existing `wood_chopping`.

### Item instances

`src/items/itemInstances.ts` currently has:

- generic `ItemInstance { id, kind }`,
- trap instances with durability,
- weapon instances with `durability` / `sharpness` in `[0,1]`,
- liquid-container instances,
- central `INSTANCE_BACKED_KINDS`,
- `cloneItemInstance(...)`,
- `createItemInstanceId()`.

`tent` is **not** currently instance-backed.

Camp condition uses `0..100`; do not reuse `clamp01()`.

Adding `TentItemInstance { kind: 'tent', condition }` requires auditing every central instance boundary rather than bolting condition onto a separate portable-tent store.

### Current tent world state

`src/items/createPlacedTents.ts` already defines:

```ts
export type PlacedTent = {
  id: string
  x: number
  z: number
  yaw: number
  condition: number
  lastConditionUpdateAtDays: number
}
```

Current gaps relevant to 019:

- `place(...)` still creates a new `tent:${Date.now()}:...` id,
- a fresh placed tent always starts at max condition,
- `pack(...)` removes/returns the world record but does not checkpoint lazy condition itself,
- no repair field/lifecycle exists yet.

Therefore stable physical tent identity + condition continuity still needs implementation.

Preferred invariant:

```text
TentItemInstance.id == PlacedTent.id
```

### Bedroll/platform state

`src/world/sleepingUtilities.ts` already owns:

```ts
BedrollRecord.condition
BedrollRecord.lastConditionUpdateAtDays
PlatformRecord.condition
PlatformRecord.lastConditionUpdateAtDays
```

and exposes `resolveSleepingUtilityCondition(...)` on top of shared weather-driven condition math.

These records need only the repair state + owner mutation seams required by 019; do not redesign sleeping utility ownership.

## Updated architecture

019 should remain a thin integration layer:

```text
camp target record
  owns condition + optional RepairProgress

camp repair policy
  owns target condition + material requirement + capability + required work + effort

Inventory
  owns materials/capability

Repair skill
  supplies competence

Busy Action
  is one work bout

world/repair.ts
  applies actor-neutral accepted work
```

No immediate `+condition` repair path.

## Camp repair quote

Add one pure camp-domain resolver shared by preview and authoritative start.

It should derive from current resolved condition:

```text
currentCondition
→ targetCondition = 100
→ MaterialRequirement[]
→ requiredWork
→ capability
→ physical effort
```

Policy:

| Target | Material | Capability | Effort |
| --- | --- | --- | --- |
| tent | hide | textile_repair | light |
| bedroll | hide | textile_repair | light |
| platform | branch | wood_chopping | moderate |

Material count and required work should scale deterministically with damage restored.

Do not resurrect old `baseRepairPoints`, `repairMaterialMultiplier(survival)` or `survivalDurationMultiplier()` as canonical APIs.

## Sewing kit

Add `sewing_kit` through normal item definitions/catalog/merchant paths:

- reusable utility,
- weight 0.4 kg,
- non-holdable,
- capability `textile_repair`,
- no durability in 019,
- merchant price 18 coin.

Use the actual current size enum. Earlier notes mentioning plan-level `S` are historical; use the repository's real small-size value (`SM` if unchanged at implementation time).

No crafting/world spawn/quest reward path.

## Tent instance migration

This remains the highest-risk cross-system part.

When `tent` joins `INSTANCE_BACKED_KINDS`, audit at least:

- `src/items/itemInstances.ts`,
- `src/items/Inventory.ts`,
- persistence save/restore/migrations,
- item acquisition,
- merchant buy/sell,
- tent placement,
- tent packing,
- Quick Actions availability,
- any count/remove calls that assume `tent` is stack-backed.

Legacy stacked tents must migrate through the existing versioned persistence pipeline:

```text
legacy tent count N
→ N fresh TentItemInstances(condition = 100)
→ stack count removed
```

Do not perform this migration opportunistically during gameplay.

Existing placed tents keep their persisted `condition` and `lastConditionUpdateAtDays`.

## World ↔ inventory transfer

### Placement

1. select/relookup one carried tent instance,
2. preserve instance id,
3. transfer condition into world record,
4. initialize world degradation anchor to current world day,
5. remove inventory instance only as part of successful placement semantics.

Do not generate a second world identity.

### Packing

1. relookup target by id,
2. reject if repair is active,
3. resolve/checkpoint lazy tent condition to current world day,
4. construct same-id `TentItemInstance`,
5. validate inventory capacity first,
6. remove world tent only after capacity is known,
7. add instance with preserved condition.

Packed tents do not weather-degrade.

## Repair episode state on camp records

Add optional `RepairProgress` to the authoritative target records and persistence shapes.

Suggested local field:

```ts
repair?: RepairProgress
```

Use whatever exact name keeps local record APIs clearest, but do not create a separate repair store.

During an active episode, lazy weather degradation must be frozen according to the same semantics used by the `world-021` consumer.

Condition `0` remains repairable.

## Start transaction

Follow the current well repair ordering:

```text
relookup target
→ resolve current condition
→ derive fresh quote
→ verify damaged + no active repair
→ verify actor/action available
→ verify capability
→ verify all materials
→ atomically commit materials
→ checkpoint condition/anchor
→ store RepairProgress
```

Failed preflight must not consume materials or create repair state.

Do not repeatedly consume materials on resume.

## Busy Action integration

Busy Action is only the current work bout.

On useful elapsed work:

```text
owner.contributeRepairWork(id, workAmount, nowDays)
→ applyRepairWork(...)
→ acceptedWork
```

Interruption preserves accepted partial work and committed materials.

Resume should revalidate:

- target exists,
- episode still active,
- player can act,
- required capability/tool is still available.

Do not persist Busy Action.

## Completion

Owner-side completion when shared repair math reports completion:

```text
condition = repair.targetCondition
repair = undefined
lastConditionUpdateAtDays = nowDays
```

Write each transition once. UI never mutates these fields directly.

## Inspection + targeted Repair

019 should expose one underlying repair action from two entry points:

```text
normal camp inspection
→ Napraw / Kontynuuj naprawę

selected Repair + gaze target
→ same action
```

Do not put quote data or repair state into generic `Interactable`.

Extend `TargetedSkillQueryContext` with live camp lookups/actions as needed and preserve query/read-only + execute/revalidate semantics.

Reuse existing contextual/FlavorDialog UI instead of dedicated repair modals.

## XP

Award `Repair` XP only for meaningful accepted/completed work through existing player skill conventions.

Do not award for:

- preview,
- selecting Repair,
- failed start,
- zero-work start,
- cancel before accepted work.

Avoid per-resume awards that allow XP farming.

Survival does not receive primary repair XP.

## Trade implications of instance-backed tents

Merchant purchase must create fresh tent instances at `condition = 100`.

Selling damaged tents must reuse current instance-aware trade behavior and condition pricing where appropriate. Extend only the shared/instance path required for tents; do not alter trap-specific or weapon-specific rules incidentally.

If multiple tents are sellable, instance selection must be deterministic.

## High-value tests

Prioritize:

- legacy stacked tents migrate to instances only,
- fresh merchant tent instance has condition 100,
- same tent id/condition survives deploy → degrade → pack → save/load → redeploy,
- inventory-full packing leaves world state untouched,
- active repair blocks packing,
- instance clone/save/restore preserves tent condition,
- Quick Actions/placement no longer depend on stack count,
- preview/start call the same quote logic,
- full condition / missing capability / missing material never consumes or starts,
- valid start consumes committed materials once,
- interruption preserves progress,
- resume consumes no additional materials,
- save/load mid-repair preserves progress,
- completion clears repair + resets degradation anchor,
- condition 0 can be repaired,
- targeted Repair and inspection use the same domain path,
- Repair XP cannot be farmed through repeated start/cancel/resume.

## Recommended implementation order

1. Add `textile_repair` + sewing kit/merchant entry.
2. Convert portable tent to central instance-backed representation + migration.
3. Preserve tent id/condition across placement/packing/save-load.
4. Add pure camp repair quote policy.
5. Add optional `RepairProgress` + owner lifecycle APIs to tent/bedroll/platform.
6. Wire normal inspection + targeted Repair to one action path.
7. Wire Busy work contributions, effort and Repair XP.
8. Extend damaged-tent trade behavior through existing instance path.
9. Add focused cross-system tests and canonical doc updates.

## Guardrails

- no new Repair manager,
- no new targeted-action framework,
- no camp-specific persistence store,
- no duplicate material requirement type,
- no immediate `+condition` repair,
- no inventory/world dual representation for tents,
- no repair-specific stamina model,
- no NPC autonomous repair in this plan,
- no unrelated refactor.

Browser verification remains the User's responsibility.

Do not run `pnpm docs:sync` manually; GitHub workflow handles it.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
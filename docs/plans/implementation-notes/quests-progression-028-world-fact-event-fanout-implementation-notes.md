# Implementation Notes: quests-progression-028 — World-fact event fan-out

## Ownership

`QuestManager` (`src/quests/QuestManager.ts`) remains the only mutator of quest progress. Do not add listeners on `AnimalAgent` / interactables. Call sites already report generic `ObjectiveRef`; they stay dumb.

## Exact defect

`onInteractObjective` (~line 1429):

```ts
if (!objectiveMatchesRef(...)) continue
this.advanceStage(def, s)
return { line: stage.progressLine ?? stage.description }
```

Contrast with `onAnimalHarvested` / `onReadItem` which loop all `active` defs.

`find_animal` + `animal_died` is a fail path inside the same function (`resolveFailedFind`) — it must also fan out (two lost-animal quests on different ids are independent; two quests bound to the **same** id should both fail).

## Presentation

Return value is used as flavor/toast (`resolveInteraction.ts`, `gameLoop.ts`). Keep returning **one** override: first non-null progress/fail line in `defs` order. Do not merge strings.

If no quest matched, keep `null`.

## `hasSocialOutcomeClaim`

Do not implement fan-out by advancing before the lethal-hit check. Callers already query claim **before** `animal_died`. After fan-out, several quests may share one `animalId` in `animalTargets` until each leaves the kill stage; `applyOutcome` is what deletes the map entry, `advanceStage` does not. Verify that two concurrent kill stages on the same id still report claim if either def has social complete consequences.

## Tests to add (`QuestManager.test.ts`)

Existing suite assumes one matching quest. Add:

- two `interact_landmark` same `landmarkId`, both `active` → one `onInteractObjective` → both `ready_to_report` (single-stage defs).
- two `kill_target_animal` same bound id (inject resolver `() => 'w1'`) → one `animal_died` → both advanced.
- one match still returns that stage's `progressLine` (regression).

## Do not

- Introduce `EventBus`.
- Change `pollDestroySpawnPointObjectives` (already 0..N).
- “Fix” authored overlapping wolf quests in this PR.

## Model

S / Composer-first: localized loop change + tests. Fallback Grok.

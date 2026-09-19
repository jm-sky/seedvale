# Plan: Hunters Brotherhood — hunting-ground investigation

**Created:** 2026-09-16
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Model:** Opus, Sonnet
**Depends on:** ~~quests-progression-048~~, ~~fauna-031~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `progression` `relationships`
**Tags:** `hunters-brotherhood` `fauna` `investigation`
**Roadmap:** `quests-hunters-brotherhood.md`

## Implementation status

Implemented 2026-09-19. Dedicated module `src/quests/huntersBrotherhoodInvestigation.ts` reuses the exact `quests-progression-048` Brotherhood binding/cast; candidate selection is bounded to the two bound settlements' deer `thicket` `PreySpawner`s, ranked deterministically (condition severity, then max component pressure, then stable `spawnerId`) purely from `Fauna.getHabitatPressure()` snapshots, with no candidate materialized when none is currently unhealthy. The chosen `spawnerId` is baked into the quest id itself, so accepted-quest continuity never depends on rerunning selection. The single stage reuses the existing `interact_spawner` objective/ingress; a new narrow `QuestLifecycleHooks.onInteractSpawnerMatched` hook (fired from `QuestManager.onInteractObjective`, wired in `createApp.ts`) captures one `getHabitatPressure()` read into a compact, quest-local `QuestHabitatPressureObservation` via the new `QuestManager.recordObservation()` — captured once, preserved verbatim across stage/outcome transitions and save/load (`QuestProgressEntry.observation`, validated in `saveData.ts`), and never recomputed at report time. Report dialogue reads that persisted observation through a new generic `QuestOutcome.resolveResultText` seam (mirrors `resolveOfferLine`); a recovered/healthy observation reports truthfully rather than preserving the original problem. Diagnosis reuses `fauna-031`'s own `HABITAT_PRESSURE_STRAINED_AT` threshold/tie order for both `primary` and secondary `observedPressures` — no second threshold, no cause attribution for mortality/predators/food. One terminal outcome (`brotherhood_investigation_complete`) regardless of diagnosis. `QuestManager` still never imports `Fauna`; `resolveInteraction.ts` is unchanged/story-agnostic. Focused tests cover candidate bounding/ranking, diagnosis derivation (including mortality-only and multi-pressure cases), eligibility gating on `hunters_brotherhood_joined`, capture-once semantics, recovered-habitat truthful reporting, and save/load round-trip of the persisted observation. `npx tsc --noEmit`, `eslint`, and the full `src/quests`/`src/persistence`/`src/app` test suites pass. Browser/gameplay verification is user-owned.

## Goal

Add the first substantive Hunters Brotherhood assignment after membership: investigate one real hunting ground whose fauna state indicates a meaningful problem.

The quest must derive its investigation target and diagnosis from authoritative fauna state. It must not invent a parallel ecology state, random cause, quest-only tracks, fake carcasses, or a separate knowledge system.

Core flow:

```text
Hunters Brotherhood membership
→ choose one real affected habitat
→ bind the quest to that stable habitat id
→ player inspects the hunting ground
→ capture a diagnosis from live habitat-pressure state
→ report the finding to the Brotherhood master
→ one completed investigation outcome
```

The investigation result is evidence for the later strategy/conflict act. This plan does not resolve the ecological problem.

## Dependencies

### `quests-progression-048`

Reuse the stable Brotherhood binding and narrative cast introduced by the membership plan.

The investigation should use:

- the same Brotherhood settlements;
- the same `master` as giver/report target;
- the same stable NPC identities rather than selecting a new narrative cast.

Membership completion is the quest prerequisite.

### `fauna-031`

Consume the fauna-owned read model for one habitat, expected through the public `Fauna` seam:

```ts
getHabitatPressure(spawnerId: string, nowDays: number): HabitatPressureSnapshot | null
```

The quest layer is a reader only. Fauna remains authoritative for population, mortality, predators and food availability.

## Architecture and ownership

Keep the current quest ownership boundary:

- `Fauna` owns and derives habitat pressure;
- `PreySpawner` remains the stable habitat identity;
- `QuestManager` owns quest lifecycle/progress only;
- Brotherhood binding owns only deterministic narrative NPC selection;
- the investigation materializer chooses a real habitat and builds a normal `QuestDef`;
- no quest-owned ecology values are written back to fauna;
- no background polling or second habitat simulation is introduced.

Do not add a `HabitatInvestigationManager`, faction manager, knowledge manager or quest-specific ecosystem state.

## Eligibility and offer

The quest becomes eligible only after successful Brotherhood membership from `quests-progression-048`.

It should be authored as a story continuation and use the existing story-offer mechanism where appropriate so ordinary giver offer limits do not hide the continuation.

The quest must not be offered merely because a habitat exists. A real problem must meet a documented threshold derived from `HabitatPressureSnapshot`.

If no Brotherhood-area habitat currently meets the threshold, the quest remains unavailable. Do not fabricate a problem solely to advance the story.

## Hunting-ground candidate set

Choose only real fauna habitats associated with the settlements represented by the Brotherhood binding.

The implementation must reuse current stable spawner ids and existing settlement/spawner association semantics rather than introducing coordinates or quest-specific habitat ids.

Exclude habitats that cannot support the intended deer/stag hunting-ground story or cannot produce a meaningful `HabitatPressureSnapshot`.

Before implementation, verify the exact eligible spawner types and their settlement ownership/identity conventions against current `AnimalSpawner` and fauna creation code.

## Deterministic target selection

Evaluate the bounded Brotherhood-area candidate set on demand during quest materialization/eligibility work. Do not scan every habitat in the world and do not add a per-frame selection loop.

Prefer a habitat with a meaningful problem using deterministic ordering:

1. condition severity (`critical` before `strained`);
2. stronger meaningful pressure according to the `fauna-031` scoring contract;
3. stable `spawnerId` tie-break.

Do not depend on iteration order from runtime collections.

A healthy habitat is not an investigation target in V1.

## Stable habitat binding

Once the quest is accepted, its chosen `spawnerId` remains the investigation target.

Do not retarget the quest to another habitat because another habitat later becomes worse.

The ecology itself remains live: the pressure snapshot of the bound habitat may change before the player reaches it.

This preserves both quest continuity and world independence.

## Investigation interaction

The investigation should be narrow:

```text
travel to the bound habitat
→ inspect that habitat
→ record what the player actually found
→ return to the master
```

Do not add a generic `investigate_habitat` objective unless recon proves no existing contract can represent the interaction cleanly.

First preference is to reuse the existing `interact_spawner` objective and interaction ingress for the bound `spawnerId`, if its current semantics are compatible with a non-destructive inspection.

If `interact_spawner` currently means a materially different action, add the smallest shared interaction seam necessary rather than building a quest-specific clue/tracking subsystem.

The interaction must read `getHabitatPressure(boundSpawnerId, nowDays)` only when needed. It must not poll pressure every frame.

## Diagnosis

The investigation result must be derived from the snapshot observed during the terrain inspection, not from the snapshot used earlier to expose the quest.

Relevant signals from `fauna-031` are expected to include:

- population loss;
- recent mortality;
- predators;
- food shortage.

### Mortality semantics

Mortality is currently an amount/symptom, not a reliable cause.

The current fauna state can report recent deaths but does not authoritatively distinguish human hunting, predators, starvation or other causes for generic spawner mortality.

Therefore the quest must never infer claims such as:

- "people overhunted this herd";
- "wolves killed these animals";
- "the animals starved";

from mortality alone.

Mortality may strengthen a broader observation such as:

> the local herd is reduced and recent mortality has been high.

Cause attribution requires actual supporting world state and is outside this plan.

## Diagnosis versus quest outcome

Do not create one terminal quest outcome per pressure kind.

Use one story outcome for successful investigation, for example conceptually:

```text
brotherhood_investigation_complete
```

The diagnosed habitat problem is investigation data, not a family of narrative terminal outcomes.

Keep the diagnosis small and typed, for example conceptually as a result derived/captured at inspection time:

```ts
type BrotherhoodHabitatDiagnosis = {
  primary: HabitatPressureKind | null
  condition: HabitatPressureSnapshot['condition']
  observedPressures: readonly HabitatPressureKind[]
}
```

Exact representation must be decided during implementation notes after recon of current quest progress/result persistence seams.

Do not add a second general knowledge store solely for this result.

The later Brotherhood strategy plan should consume the narrowest existing persistent quest result mechanism that can preserve the observation across save/load. If current quest state cannot persist such typed investigation data without architectural distortion, implementation notes must identify the smallest compatible extension rather than encoding the diagnosis into many terminal outcome ids.

## Multiple simultaneous pressures

`dominantPressure` is useful for prioritisation, but it is not the only truth exposed to narrative.

The report may reflect one primary issue plus materially significant secondary symptoms.

Example:

```text
population pressure high
mortality high
predator pressure low
food pressure low
```

may be reported as a reduced herd with substantial recent losses, without inventing who caused those losses.

Define one centralized significance rule for which secondary pressures are worth including. Do not scatter narrative-specific thresholds through dialogue code.

## World changes before inspection

Pressure is intentionally live.

If the habitat recovers after quest acceptance but before inspection, the quest must remain completable.

The inspection records the current observation, including a recovered/healthy state if that is what the player actually finds.

This is not quest failure. It is meaningful evidence that the world changed independently of the player.

The report dialogue should have a neutral recovered case such as "the situation has settled" rather than pretending the original problem still exists.

Do not retarget to manufacture drama.

## Quest structure

Recommended V1 structure:

### Stage 1 — assignment

The Brotherhood master explains that one hunting ground has become concerning and sends the player to inspect it.

The quest is bound to one stable `spawnerId`.

### Stage 2 — field inspection

The player reaches/interacts with the bound habitat through the reused interaction mechanism.

At this moment:

- read the live `HabitatPressureSnapshot`;
- derive the diagnosis;
- persist only the minimum quest-owned investigation result required for later reporting/save-load continuity;
- complete the inspection stage.

No fake tracks, corpses or clue items are spawned.

### Stage 3 — report

Return to the Brotherhood master.

Dialogue reflects the recorded observation rather than recomputing a possibly different diagnosis during the report conversation.

Completing the report yields the single investigation-complete story outcome.

## Narrative roles

Use only the Brotherhood members needed for this act:

- `master` — giver and report target;
- `practical` / inviter may optionally contribute authored dialogue if this can reuse existing stage dialogue actions without extra mechanics.

`trophy` and `ambitious` do not need mechanical roles yet. They become important in the following strategy/conflict act.

Avoid adding interactions simply to force all four cast members into every Brotherhood quest.

## Consequences

Keep rewards social and modest.

Expected consequences may include:

- positive relation with the master;
- settlement `competence`;
- `trust`;
- small renown.

Do not add Brotherhood-specific reputation or faction standing.

Membership and investigation history remain represented through the existing quest/progression mechanisms until a broader organization system has an independent gameplay need.

## Performance constraints

- no pressure polling from render/update loops;
- no habitat × animal nested work added by the quest layer;
- only bounded Brotherhood candidate habitats are considered for eligibility/materialization;
- use the cached `fauna-031` public pressure lookup rather than reproducing scans in quests;
- field inspection performs at most the pressure lookup needed for the bound habitat;
- do not add workers, spatial indices or telemetry solely for this quest.

## Expected implementation areas

Verify exact symbols before implementation. Likely relevant areas are:

- `src/quests/quests.ts` — existing quest contracts/prerequisites/objectives and validation;
- `src/quests/QuestManager.ts` — only if a minimal persisted investigation-result seam is actually required;
- `src/quests/opportunities/` or a focused Brotherhood quest module — deterministic habitat selection/materialization;
- Brotherhood binding introduced by `quests-progression-048`;
- `src/fauna/createFauna.ts` public pressure lookup from `fauna-031`;
- `src/app/createApp.ts` composition/materialization wiring;
- focused quest tests beside the resulting module.

Prefer a focused Brotherhood module over expanding unrelated generic RPG matrices.

Add JSDoc with `@domain quests-progression` to important public architectural functions/types introduced by this work so preflight/code navigation can find them.

## Non-goals

This plan does not include:

- resolving or modifying the habitat problem;
- choosing a hunting strategy;
- hunting restrictions;
- predator-control missions;
- habitat feeding/restoration actions;
- exceptional trophy animals;
- human-overhunting attribution;
- generic animal tracking/footprints;
- quest-spawned clues or carcasses;
- new fauna simulation;
- faction membership/reputation/ranks;
- new NPC professions;
- AI-generated dialogue;
- a general player/world knowledge subsystem.

These belong to later acts or independent systems when justified.

## Verification

Add focused tests covering at least:

1. eligibility requires completed Brotherhood membership;
2. no meaningful habitat problem means no offer/candidate;
3. deterministic target selection prefers severity/pressure and uses stable id tie-break;
4. only Brotherhood-area eligible habitats are considered;
5. acceptance fixes the target `spawnerId` even when pressure elsewhere changes;
6. field inspection reads the current pressure of the bound habitat;
7. diagnosis can contain primary plus significant secondary symptoms;
8. mortality does not become unsupported cause attribution;
9. recovered/healthy state before inspection remains completable and reports recovery;
10. report uses the observation captured during inspection rather than silently replacing it with later live state;
11. only one successful terminal investigation outcome is required regardless of diagnosis;
12. save/load preserves enough quest state to report the same observation after inspection;
13. pressure lookup is event/on-demand driven rather than part of a frame update;
14. existing quest validation, offer limits and Hunter profession quests do not regress.

Run repository-appropriate focused tests, typecheck, lint and build as required by current project guidance. Browser verification is performed by the user, not the AI agent.

## Follow-up

The next Brotherhood plan should consume the completed investigation and its recorded diagnosis to present competing strategies from the existing cast:

```text
real investigation result
→ master / trophy / practical / ambitious perspectives
→ choose a strategy
→ action in the real world
→ persistent ecological/social consequences
```

That follow-up should decide interventions from actual diagnosis instead of hardcoding the same choices for every habitat state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

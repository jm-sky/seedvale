# Implementation Notes: Agent Decision Architecture Refactor (npc-008)

**Plan:** [npc-008-agent-decision-architecture-refactor.md](../npc-008-agent-decision-architecture-refactor.md)
**Stage covered here:** migration step 1 — *"Udokumentować istniejący decision flow i jego priorytety"* (recon) plus the concrete implementation design for steps 2–4.
**Date:** 2026-09-02
**Code state at recon:** `30a6c8d`, `src/fauna/AnimalAgent.ts` (3219 lines), `src/ai/NpcAgent.ts` (4690 lines).

No production code was changed in this stage. Everything below is verified against current source, not against plan documents.

---

## 1. Ownership map (who decides what today)

| Concern | Owner | Notes |
| ------- | ----- | ----- |
| Fauna perception | `AnimalAgent.senseEnvironment()` (`AnimalAgent.ts:2459`) | player notice roll + nearest lit fire; returns `EnvironmentSense` |
| Fauna NPC perception | `senseNpcThreat()` / `resolveFrenzyNpcTarget()` (`:2277` / `:2300`) | caller-bounded `nearbyNpcs`, target commitment |
| Fauna behaviour arbitration | the `if / else if` chain inside `AnimalAgent.update()` (`:2014`–`:2148`) | **the subject of this refactor** |
| Fauna human/NPC intent scoring | `predatorHumanDecision.ts` (`decidePredatorHumanIntent`) | already pure, already uses `pickHighestScore` |
| Fauna execution | `updatePredator`/`updatePrey`/`updateRabid`/`chaseHuman`/`chaseNpc`/`fleeFrom`/`wander`/`pursueNeeds` | stays untouched |
| Fauna per-tick lifecycle | head/tail of `update()` (cooldowns, maturity, production, life tick, bars, label, mixer) | stays untouched |
| NPC arbitration | `NpcAgent.update()` `case 'choose'` (`NpcAgent.ts:2331`–`2400`) | already needs → pressures → candidates → scoring → selection |
| NPC execution | `Phase` state machine (`choose`/`goTo`/`execute`/`combat`/`sleep`/…) | stays untouched |
| Shared primitives | `src/simulation/scoreActions.ts`, `src/simulation/types.ts` | `ScoredAction`, `pickHighestScore`, `pickActionKind`, `DecisionContext`, `PlannedAction` |
| Fauna update caller | `createFauna.ts:833`–`870` (`Fauna.update`) | passes `agents` as `others`, plus caller-bounded `nearbyNpcs`, `villages`, `litFires` |

---

## 2. Current `AnimalAgent.update()` flow (verified)

```text
health.dead                 → corpse decay only, return                (:1976)
mounted                     → return (driveMounted already ran)        (:1988)
per-tick bookkeeping        → cooldowns, vocalize, night, maturity,
                              production, currentVillages/currentOthers (:1990–:2006)
sense = senseEnvironment()                                             (:2007)
npcThreat = frenzied && predator ? resolveFrenzyNpcTarget() : null     (:2010)
        ↓
  ARBITRATION (ordered if / else if)                                   (:2014–:2148)
        ↓
onAggro rising edge, clampBounds, snapY, anim, life tick, bars,
label distance state, mixer, debug visual                              (:2149–:2199)
```

### 2.1 Priority table (current semantics, 1:1)

| # | Branch | Guard | Execution | Bookkeeping inside the branch |
|---|--------|-------|-----------|-------------------------------|
| 1 | `rabid` | `this.rabid` | `updateRabid()` | `threateningHuman=false`, `humanDecisionTimer=0`, `provokedTimer=0` |
| 2 | `player-attack` / `player-ignore` / `player-flee` | `sense.playerActive && role==='predator'` | `chaseHuman` / `wander` / `fleeFrom(observer)` | `cancelSourceTarget()`; throttled intent refresh; `threateningHuman = intent==='attack'`; then `if (frenzied && npcThreat) threateningHuman = true` (`:2065`) |
| 3 | `player-flee-prey` | `sense.playerActive && role!=='predator'` | `fleeFrom(observer)` | `cancelSourceTarget()`, `threateningHuman=false`; same trailing frenzy override applies |
| 4 | `npc-attack-frenzied` | `npcThreat && frenzied` | `chaseNpc()` | `threateningHuman=true` only — **no** `cancelSourceTarget()`, **no** intent throttle |
| 5 | `npc-attack` / `npc-ignore` / `npc-flee` | `npcThreat` | `chaseNpc` / `wander` / `fleeFrom(npc)` | `cancelSourceTarget()`, throttled `decideNpcResponse()` — **currently unreachable, see F1** |
| 6 | `fire-avoid` | `sense.nearestFire && !frenzied` | `fleeFrom(fire)` | `threateningHuman=false`, `humanDecisionTimer=0`, `provokedTimer=0`, `cancelSourceTarget()` |
| 7 | `frenzy-beeline` | `role==='predator' && frenzied && strategicVillage && !arrivedAtStrategicVillage()` | `moveTowardStrategicVillage()` | `threateningHuman=false`, `humanDecisionTimer=0`, `provokedTimer=0` |
| 8 | `predator-normal` | `role==='predator'` | `updatePredator()` → prey chase / `pursueNeeds()` / `wander()` | same three resets as #7 |
| 9 | `prey-normal` | otherwise | `updatePrey()` → flee predator / `pursueNeeds()` / `wander()` | same three resets as #7 |

Nested decisions that are **already** candidate/scoring shaped and must not be flattened into the outer table:

- `decidePredatorHumanIntent()` — `flee` vs `attack` vs `ignore` (`predatorHumanDecision.ts:141`), fed by `decideHumanResponse()` (player) and `decideNpcResponse()` (NPC).
- `updatePredator()`'s internal order: prey-in-village → exhausted → chase → `pursueNeeds()` → wander.
- `pursueNeeds()`'s thirst-before-hunger source selection.

### 2.2 Hard gates vs rankable decisions

Genuine lifecycle gates (must stay **outside** any ranking):

- `health.dead` (`:1976`) — replaces the whole tick with corpse decay.
- `mounted` (`:1988`) — `driveMounted()` already ran this frame; running AI would double-tick needs.
- `rabid` (`:2014`) — plan fauna-001 semantics: no fear, no needs, no human/NPC targets. It is first in the chain, so treating it as a gate preserves order exactly.

Everything from #2 down is a real "what should this animal do now" answer and belongs in the candidate layer.

`frenzied` is **not** a gate — it is an input that changes several candidates (fire bypass, NPC targeting, village beeline, `provoked` in the scoring, village-exclusion bypass in `pickPointNear()` at `:2991`).

### 2.3 Throttling, caching and randomness (must be preserved)

| Mechanism | Field | Where | Semantics |
|---|---|---|---|
| Perception roll | `perceptionRollTimer`, `cachedPerceptionRoll` | `senseEnvironment()` | 0.5 s (`PERCEPTION_ROLL_INTERVAL_SEC`), deterministic `detectionRoll(animalId, tick)` |
| Alert hold | `alertTimer` | `senseEnvironment()` | 5 s (`ALERT_HOLD_SEC`) after a notice |
| Human/NPC intent | `humanDecisionTimer`, `cachedHumanIntent`, `cachedAggressionRoll` | branch #2/#5 | 0.2 s (`HUMAN_DECISION_INTERVAL_SEC`); `Math.random()` is rolled **once per refresh**, not per frame |
| Provocation | `provokedTimer` | `takeDamage()` (`:1737`) | 8 s; `takeDamage` also forces `humanDecisionTimer = 0` so retaliation re-scores the same frame |
| Prey commitment | `preyTarget` | `resolvePreyTarget()` (`:3018`) | re-picks only on death / out of `detectRange` |
| Frenzy NPC commitment | `frenzyNpcTarget` | `resolveFrenzyNpcTarget()` (`:2300`) | re-picks only when the target leaves the bounded list |
| Source search | `sourceSearchCooldown`, `sourceTarget` | `pursueNeeds()` (`:2701`) | 3 s search cooldown, 20 s target timeout |

**Sensing runs every tick; the intent decision is throttled.** The branch *selection* itself is currently untimed (every tick) — the refactor must keep it that way, or the fire/flee reaction would become laggy.

### 2.4 Perception bounds (performance)

- `others` is the loaded `agents` array (`createFauna.ts:848`); `nearest()`/`pickRabidTarget()`/`findCarcassTarget()` scan it linearly → O(agents²) per frame overall. Unchanged by this refactor, but the decision layer must not add another pass over it.
- `nearbyNpcs`, `villages`, `litFires` are caller-bounded per frame — never scanned globally per animal.
- `update()` currently allocates almost nothing per tick in the arbitration itself. A naive "build a candidate array every frame for every animal" would add per-animal-per-frame garbage; see §5.2.

---

## 3. Findings from the recon

**F1 — the scored NPC branch is dead code, and the gate that kills it is narrower than the intended design.**
`npcThreat` is only ever non-null when `this.frenzied && role === 'predator'` (`:2010`), and branch #4's guard is `npcThreat && this.frenzied`. Therefore branch #5 (`npc-attack` / `npc-ignore` / `npc-flee`) and `decideNpcResponse()` (`:2321`) are **unreachable at runtime**; `decideNpcResponse` has no test either. `getDebugInfo()`/`updateDebugVisual()` still reference `'npc-attack'` (`:1568`, `:2204`).
This predates the current commit: `0fb2f7b` relaxed the `!sense.playerActive` part of the gate, but `frenzied` was always required on both sides.

**Design intent (owner, 2026-09-02):** `npcThreat` should *not* be frenzy-gated. Animal↔NPC threat and combat is a wanted general behaviour; `frenzy` is a forcing/test mechanism for combat, not the condition for it. So the correct end state is: any predator senses NPCs and scores its response, and `frenzied` stays an override that skips the scoring (a frenzied wolf never flees). That is exactly what branches #4 and #5 already express — the frenzy gate on `npcThreat` is the only thing keeping #5 dead.

The caller already supplies what the general case needs: `gameLoop.ts:1843` builds `nearbyNpcCandidates` from **all** loaded settlements' live NPCs every frame, with no frenzy condition, and the NPC side of the loop (`threateningAnimals` → `NpcAgent`'s animal-threat interrupt, plan 179) is already generic. Only `AnimalAgent.ts:2010` is narrow.

→ Steps 2–4 still preserve today's behaviour exactly (parity is the only way to verify the refactor, see F6). Generalizing the gate is a gameplay change and lands as **step 6** (§5.6), where the refactor pays for itself: the priority table, the scored branch and its tests already exist, so it becomes a gate change plus tuning rather than new decision code.

**F2 — inconsistent bookkeeping across branches.**
`cancelSourceTarget()` is called in #2/#3, #5, #6 but **not** in #4 (`npc-attack-frenzied`) and not in #7. A frenzied wolf that had claimed a carcass therefore keeps the claim while chasing an NPC (`foodClaimedBy` stays set until `pursueNeeds`/`isSourceTargetValid` clears it). Preserve as-is in step 2–3; record it as a candidate follow-up rather than fixing it inside the refactor.

**F3 — `threateningHuman` is an output, not a decision.**
It is written by 7 of the 9 branches plus the trailing frenzy override (`:2065`), and consumed *outside* fauna: `gameLoop.ts:1858` filters `isThreateningHuman()` into the NPC-side `nearbyAnimalThreats`. It must remain a projection of the chosen branch, computed in the execution layer — not something the pure decision function mutates.

**F4 — the throttled intent refresh is entangled with branch selection.**
The `humanDecisionTimer` countdown happens *inside* branch #2 (and #5), so a tick that resolves to fire-avoid/predator-normal both zeroes the timer and skips the countdown. Extracting the decision therefore requires computing the (throttled) player intent **before** selection, under exactly the current condition `sense.playerActive && role === 'predator'`, and passing it in as an input.

**F5 — `AnimalAgent.update()` has a 16-argument positional signature.**
`docs/research/2026-09-01-npc-animal-threat-forwarding.md` documents the sibling failure on `NpcAgent.update()` (a runtime monkey-patch in `src/app/dialogueTimeControl.ts` silently dropped the 7th argument). `AnimalAgent` itself is not monkey-patched today — `dialogueTimeControl.ts` replaces `Timer.prototype.getDelta`, `NpcAgent.prototype.update` and `PlayerController.prototype.update` only — but the positional-argument risk is the same, and `createFauna.ts:850` already has to pass `undefined` as a positional placeholder for `onVocalize`. Converting the tail of the signature to an options object is *tempting but out of scope* — record it in `LOOSE-ENDS.md`.

**F6 — no test covers the branch ordering.**
`src/fauna/*.test.ts` covers only pure helpers (`predatorHumanDecision`, `frenzyWolf`, `villageAvoidance`, `playerAwareness`, `foodWaterTargeting`, …). Vitest runs in the **node** environment (`vite.config.ts:81`, no jsdom) and `AnimalAgent`'s constructor builds DOM label elements (`createAgentLabel`, `:1284`) and Three.js objects — so `AnimalAgent` itself is not directly unit-testable, and no test can currently detect a change in the priority order. This is the strongest single argument for extracting a pure selection function: it is the only way this refactor can be verified at all.

---

## 4. NPC side (plan step 6) — assessment, no work needed yet

`NpcAgent.update()`'s `case 'choose'` (`:2326`) already is the target shape:

```text
generateNeedPressures(needs)                    → DecisionPressure[]
scoreNeedCandidates(pressures, personality/role) → re-scored candidates (cannot add/remove)
+ weatherShelterPressure(weather)                → a peer candidate ('seekShelter')
pickActionKind<NpcDecisionTarget>(…, 'idle')     → selection
```

with hard gates/interrupts already kept out of the ranking: `frozen`/`dead` returns (`:2212`–`:2213`), `shouldCollapseSleep()` (`:2327`), the animal-threat interrupt (`:2300`–`:2323`), `tickCriticalInterrupt`, the exhaustion phase switch and the `lookAtPlayer` pause. `Phase` remains purely executional.

Conclusion: **NPCAgent needs no change in this refactor.** The only shared primitives it would gain from are the ones it already exports/uses (`ScoredAction`, `pickHighestScore`, `pickActionKind`, `DecisionContext`). Step 6 reduces to a review after the fauna migration stabilizes; do not preemptively generalize `Needs.ts`/`decisionModifiers.ts` for fauna.

The pre-existing audit `docs/reviews/2026-08-23--npc-ai-needs-pressures-decisions-audit.md` already owns the NPC-side direction (ai-001…ai-004); do not restate it here.

---

## 5. Implementation design for steps 2–4

### 5.1 New module: `src/fauna/faunaDecision.ts` (pure, Three.js-free)

Mirrors `predatorHumanDecision.ts` exactly in shape and testability — this is the reuse point, not a new framework.

```ts
/** Lifecycle overrides that replace the whole decision, in evaluation order. */
export type FaunaDecisionGate = 'dead' | 'mounted' | 'rabid'

/** Rankable behaviours — identical to today's `FaunaAiBranch` minus the gates. */
export type FaunaBehaviourKind = Exclude<FaunaAiBranch, 'rabid'>

export type FaunaDecisionInput = {
  role: AnimalRole
  frenzied: boolean
  playerActive: boolean
  /** Throttled `decidePredatorHumanIntent()` result; `null` when the player
   *  is not the active threat or this animal is not a predator. */
  playerIntent: PredatorHumanIntent | null
  npcThreat: boolean
  /** Throttled intent for the (currently unreachable, see F1) non-frenzied
   *  NPC-threat path. */
  npcIntent: PredatorHumanIntent | null
  fireNearby: boolean
  hasStrategicVillage: boolean
  arrivedAtStrategicVillage: boolean
}

/** Priority ranks — encode today's `if / else if` order 1:1 (higher wins,
 *  ties keep the earlier entry, same rule as `pickHighestScore`). */
export const FAUNA_BEHAVIOUR_PRIORITY: Record<FaunaBehaviourKind, number>

/** Runtime path: allocation-free ordered scan over the same validity
 *  predicate the scored variant uses. */
export function decideFaunaBehaviour(input: FaunaDecisionInput): FaunaBehaviourKind

/** Debug/test path only — materializes the valid candidates with their
 *  ranks so the ordering is inspectable (`?debug=1`) and assertable. */
export function scoreFaunaBehaviours(input: FaunaDecisionInput): ScoredAction<FaunaBehaviourKind>[]
```

Both entry points share one `isBehaviourValid(kind, input)` predicate, so priority lives in exactly one table and cannot drift between the runtime and debug paths.

`prey-normal` is the terminal fallback (always valid) — `decideFaunaBehaviour` therefore never returns `null` and no `fallback` argument is needed.

### 5.2 Why priority-as-rank and not tuned scores (first migration)

The plan requires *"pierwszy refaktor wybiera te same zachowania co obecny kod"*. Real numeric scores would immediately change behaviour at the boundaries (e.g. fire vs. player). Encoding the existing order as constant ranks keeps semantics bit-identical while making the priorities data instead of control flow — new behaviours are then added by inserting a rank + a validity predicate, which is the plan's success criterion. Genuine score competition can be introduced later, per behaviour, without another structural change.

Allocation: the runtime path must not build an array per animal per frame (§2.4). `scoreFaunaBehaviours()` is called only from `getDebugInfo()`/tests.

### 5.3 `AnimalAgent.update()` after the change

```text
gates (dead → corpse decay, mounted → return)             unchanged
per-tick bookkeeping                                       unchanged
sense = senseEnvironment()                                 unchanged
npcThreat = resolveFrenzyNpcTarget(...)                    unchanged
rabid gate → updateRabid()                                 unchanged (moved out of the chain, still first)
playerIntent = refreshThrottledHumanIntent(sense, …)       extracted from branch #2 (see F4)
branch = decideFaunaBehaviour({...})                        NEW — pure
switch (branch) { … existing execution calls … }            same method calls, same order of side effects
trailing frenzy `threateningHuman` override                unchanged (:2065)
onAggro rising edge + tail bookkeeping                     unchanged
```

`this.debugBranch = branch` becomes a single assignment instead of 13 scattered ones. The per-branch resets (`threateningHuman`, `humanDecisionTimer`, `provokedTimer`, `cancelSourceTarget()`) move into the `switch`, preserving the exact per-branch asymmetries recorded in §2.1/F2 — they are **not** unified in this step.

### 5.4 Step order (each step independently type-checks, lints and tests)

1. **Step 2a** — add `faunaDecision.ts` + its test file; nothing imports it yet. Tests assert the priority table against §2.1.
2. **Step 2b** — extract `refreshThrottledHumanIntent()` (private) from branch #2, no behaviour change (F4).
3. **Step 3** — replace the `if / else if` chain with `decideFaunaBehaviour()` + `switch`. `rabid` stays a gate above it.
4. **Step 4** — wire `scoreFaunaBehaviours()` into `getDebugInfo()` (new optional `behaviourCandidates` field on `AnimalAgentDebugInfo`) so `?debug=1` shows why a branch won. The only consumers are `src/debug/faunaInspector.ts` and `gameLoop.ts:186`; `src/ui/agentStatusLabel.ts` does not render `aiBranch` and stays untouched.
5. **Step 5** — documentation: `docs/STATE.md` fauna paragraph (line 49 area), `docs/CODE_INDEX.md` fauna entry, `pnpm docs:sync`; move F2/F5 to `docs/plans/LOOSE-ENDS.md`.
6. **Step 6** — generalize animal→NPC threat (§5.6). Separate commit, after parity is verified — it is the first *behaviour* change in this thread.

### 5.5 Test plan (step 2a, the parity harness)

`src/fauna/faunaDecision.test.ts`, node env, pure function only:

- one table-driven case per row of §2.1, asserting the winning branch;
- rabid is asserted at the `AnimalAgent` gate level via code review only (not unit-testable, see F6) — the test file documents this;
- ordering pairs that matter: player-vs-fire, player-vs-npcThreat (frenzied), fire-vs-frenzy-beeline (the `!frenzied` fire bypass), frenzy-beeline-vs-predator-normal (arrived flag), npcThreat-vs-fire for a frenzied wolf;
- an explicit test pinning F1: with `npcThreat && !frenzied` the `npc-attack`/`npc-flee` candidates are the ones selected by the pure function, plus a comment that `AnimalAgent` cannot currently produce that input;
- `playerIntent: 'ignore'` → `player-ignore` for a predator, and `playerActive && role !== 'predator'` → `player-flee-prey`.

Verification set for the whole refactor: `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run test`. Browser verification is only needed for step 3 (frenzied wolf reaching a settlement, wolf-vs-campfire, predator hunt, player scare) — technical checks cannot establish gameplay parity.


### 5.6 Step 6 — generalize animal→NPC threat (behaviour change, after parity)

Target semantics (F1): a predator treats a nearby NPC as a possible target the same way it already treats the player; `frenzied` becomes an override that forces the engagement instead of the precondition for noticing NPCs at all.

Change set (small, because steps 2–4 already put the pieces in place):

1. `AnimalAgent.ts:2010` — drop `this.frenzied` from the gate, keep `role === 'predator'`; rename `resolveFrenzyNpcTarget()` → `resolveNpcTarget()` (target commitment semantics unchanged, only the name and the doc).
2. Priority table: keep `npc-attack-frenzied` (rank above `npc-*`) as the frenzy override — a frenzied wolf still skips scoring and never flees. Non-frenzied predators now fall through to the scored `npc-attack` / `npc-ignore` / `npc-flee` branch, which becomes live.
3. `decideNpcResponse()` already handles the general case: distance, crowd fear around the *NPC* (not the player), `fireNearby`, hunger, HP and `provoked`. No new scoring code; expect **tuning**, not new mechanics.
4. Nothing changes on the NPC side or in `gameLoop.ts` — `threateningHuman` → `threateningAnimals` → `NpcAgent`'s animal-threat interrupt is already generic (plan 179).

Consequences to check when doing it:

- **Perception cost.** `senseNpcThreat()` would run for every loaded predator every tick instead of for the ~1 frenzied wolf. `nearbyNpcs` is all loaded settlements' NPCs (tens), predators are tens → up to ~10³ distance checks per frame. Before shipping: switch its `Math.hypot` to a squared-distance compare (the idiom `countNearbyHumans()` already uses) and consider refreshing the target on the existing throttle cadence rather than every tick. The *branch selection* must stay per-tick (§2.3).
- **Priority interactions.** NPC threat sits above `fire-avoid` (#6), so a wolf that notices an NPC standing at a lit campfire now resolves inside `decideNpcResponse` (where `fireNearby` adds `FIRE_FEAR`) instead of the fire branch — likely `npc-flee`, which flees the NPC rather than the fire. Verify this reads correctly in play; it is the main behavioural difference from today's non-frenzied wolf, which simply avoids the fire radius.
- **Village avoidance.** `pickPointNear()` (`:2991`) excludes villages for wild animals unless `frenzied`, and `updatePredator()` refuses prey inside a village. A non-frenzied wolf can now decide `npc-attack` on an NPC inside the settlement while its wander/prey logic still treats the village as off-limits. Decide explicitly whether "attack an NPC inside a village" is allowed, or whether NPC candidates should be filtered by the same village rule for non-frenzied predators.
- **Frenzy stays useful** as the forcing mechanism (`?debug=1` frenzy wolf tooling, `faunaInspector.ts`), which is its stated purpose.

Scope note: this is a gameplay direction of its own ("zagrożenia i walki animals vs NPC, a potem więcej"). If it grows past the gate change plus tuning above — species-specific NPC aggression, guards deliberately provoking predators, livestock predation, night raids — it deserves its own plan (`npc-018`), with npc-008 stopping at step 5.

---

## 6. Explicit non-changes (guard rails for the next session)

- No `AgentAIManager`/`BehaviourManager`/God object; no shared "agent AI" module between `src/ai` and `src/fauna` — `src/simulation` already owns the only shared primitives, and they suffice.
- No change to `AnimalAgent.update()`'s signature (F5 stays a loose end).
- No change to the perception radii, scoring constants, throttle intervals or randomness sources.
- No revival of the dead NPC-response branch (F1) inside steps 2–4 — step 6 does exactly that, deliberately, once parity is verified — and no fix of the `cancelSourceTarget()` asymmetry (F2) anywhere in this plan.
- `updatePredator`/`updatePrey`/`pursueNeeds`'s internal ordering stays as-is; only the *outer* arbitration becomes data.
- `NpcAgent` is not touched (§4).

# Implementation notes — 196 — Time-Skip Simulation Semantics

**Status of this file:** checkpoint written mid-implementation (research/design done, **no code edits made yet**). Next session: read this file fully before touching code, then go straight to "Next steps" below.

---

## Root cause (confirmed by direct code read, corroborates plans 192/193 audits)

`gameLoop.ts`'s `tick()` computes one `worldDt`:

```ts
const worldDt = timeSkip.isActive() ? dt * dayNight.timeMultiplier : dt   // gameLoop.ts:1437
```

and feeds it **unconditionally** into:

- `bundle.settlementsManager.update(worldDt, ...)` — `gameLoop.ts:1584`
- `bundle.fauna.update(worldDt, ...)` — `gameLoop.ts:1602`
- `bundle.placedTraps.update(worldDt, dayNight.elapsedDays, bundle.fauna.getAgents())` — `gameLoop.ts:1657`

There is **no `timeSkip.isActive()` gate anywhere** in `NpcAgent.ts` / `AnimalAgent.ts` / `createSettlement.ts` (confirmed by grep). So during an active skip (`dayNight.timeMultiplier` boosted up to ~20x for the default `dayLengthSec=480`), NPCs and fauna fully live-simulate — movement, predator/prey combat, damage callbacks, corpse decay, schedule/needs — at that acceleration, every real frame of the skip.

Separately, on `skip.justFinished` (`gameLoop.ts:551`), `bundle.settlementsManager.resolveTimeSkip(skip.startTimeOfDay, skip.hours, dayNight.dayLengthSec)` runs a **second**, independent deterministic catch-up (`SettlementsManager.ts:408-413` → `NpcAgent.resolveTimeSkip`, `NpcAgent.ts:2099-2160`) that replays the *same* wall-clock period again — including real `Household.water.add/remove` mutations (`NpcAgent.ts:2129,2133`). This is the double-processing the plan names.

Fauna has **no** `resolveTimeSkip`-equivalent at all — it only has the live accelerated tick, so during a skip a predator can fully hunt/chase/kill livestock or hit the player through the `onHumanHit` callback (`gameLoop.ts:1610-1636`), invisibly, over what the player experiences as a few real seconds.

Two existing doc comments contradict the actual code and each other:
- `gameLoop.ts:1426-1436` claims NPCs/fauna "freeze" during a skip and get caught up — false, they live-tick at full acceleration.
- `world/timeSkip.ts:48-52` claims dt is "deliberately not scaled" for NPC/fauna and the world "keeps simulating at its normal real-time pace underneath" — also false; `worldDt` scales exactly what it says it doesn't.

Both need rewriting once the real model is implemented (see below).

## Design decision (derived from plan 196's own target invariant, not re-litigated — just execute)

Plan 196 §"Docelowy invariant" + the system table (§1) explicitly choose the **freeze + deterministic catch-up** model (matching `gameLoop.ts`'s existing but-currently-false comment), not the "live-tick-through-rest" alternative `timeSkip.ts`'s comment describes. This was one of two options plan 193's audit left open for "a follow-up plan to decide" — plan 196 has decided it. Do not re-open this question; implement it.

Concretely:
- **During an active skip**: NPC (`SettlementsManager.update`), fauna (`Fauna.update`), and traps (`placedTraps.update`) do **not** run at all this frame (not "run with worldDt=0" — actually skip the call). Player needs (`tickPlayerNeeds`/starvation/regen/downed) keep using the existing scaled `worldDt` — that contract is explicitly out of scope to change (plan §1 table: "Player normal simulation: określone przez istniejący kontrakt").
- **On `skip.justFinished`**: exactly one deterministic catch-up call per system — NPC's already exists (`SettlementsManager.resolveTimeSkip` → `NpcAgent.resolveTimeSkip`, keep as-is, it's the sole mutator now that live-tick is gated off). Fauna needs a **new**, deliberately minimal catch-up (see below) — not a stepped replay like NPC's, just enough to keep corpse decay and hunger/thirst continuous, per plan §3's "Nie implementować pełnego off-screen simulation engine".

## Fauna catch-up design (not yet implemented)

Two independent, purely additive pieces, both one-shot (no per-hour stepped loop needed — the underlying functions are linear/pure):

1. **Corpse lifecycle** (`AnimalAgent.ts`): dead branch of `update()` (`AnimalAgent.ts:1307-1313`) does `this.timeSinceDeath += dt; this.advanceCorpseDecay(dt, others, observerPos)`. Since `update()` won't run at all during the skip, add a new method — e.g. `AnimalAgent.resolveTimeSkip(elapsedSeconds: number)` — that for a dead, non-`corpseHeld` agent does **only** `this.timeSinceDeath += elapsedSeconds` (no FX/tint/mesh work — that's presentation and will self-correct for free on the very next normal frame, because `advanceCorpseDecay` recomputes `corpsePhaseFromElapsed(this.timeSinceDeath)` fresh every call and `this.timeSinceDeath` will already reflect the full elapsed time by then). This also makes `readyToRemove()` (`AnimalAgent.ts:1061-1064`) correct immediately, so an animal that should already be gone gets removed on the next normal fauna tick via whatever existing filter calls `readyToRemove()` (check `createFauna.ts` for that filter — not yet located, do this in the next session).
2. **Live-agent needs** (`AnimalLife.ts`): for a non-dead agent, call `tickAnimalLife(this.life, elapsedSeconds, false, {})` once (`AnimalLife.ts:53-67` is pure linear math with `Math.min(1, ...)` clamps — a single big-`dt` call is equivalent to summing many small steps). Deliberately **do not** attempt to resolve elevated needs (no eat/drink resolution, unlike NPC's `resolveTimeSkip`) — that would start becoming the "full off-screen simulation engine" the plan explicitly excludes. It's fine/expected that a long skip leaves fauna hungrier/thirstier; live behavior resumes normally once ticking restarts.

Wire this as `Fauna.resolveTimeSkip(hours: number, dayLengthSec: number)` in `createFauna.ts` (iterates `getAgents()`, converts `hours` → real seconds via `gameHoursToRealSeconds` from `world/timeConversion.ts`, same helper `NpcAgent.resolveTimeSkip` already uses — see `NpcAgent.ts:2113`), called from `gameLoop.ts` right next to the existing `bundle.settlementsManager.resolveTimeSkip(...)` call at `gameLoop.ts:551`.

## `gameLoop.ts` edit plan (not yet applied)

1. Around `gameLoop.ts:551`, add: `bundle.fauna.resolveTimeSkip(skip.hours, dayNight.dayLengthSec)` next to the existing `bundle.settlementsManager.resolveTimeSkip(...)` call.
2. Rewrite the stale comment block at `gameLoop.ts:1426-1436` to describe the real (now-correct) model: NPC/fauna/traps are skipped entirely (not ticked with any `worldDt`, scaled or not) while a skip is active; catch-up happens once, on `justFinished`, via `SettlementsManager.resolveTimeSkip`/`Fauna.resolveTimeSkip`. Keep the existing explanation of why player needs still use scaled `worldDt` (that part is accurate and unchanged).
3. Leave `worldDt` computation (`gameLoop.ts:1437`) as-is — still needed for player needs/downed-timer (lines 1487-1494).
4. Wrap the following in `if (!timeSkip.isActive()) { ... }`:
   - the `villages` / `nearbyNpcCandidates` / `nearbyHumanCount` / `threateningAnimals` computations (`gameLoop.ts:1559-1582`) — confirmed by grep these four are used **only** inside the NPC/fauna update calls, nowhere else in the function, so it's safe to move their declarations inside the gate.
   - `bundle.settlementsManager.update(...)` (`gameLoop.ts:1584-1595`)
   - `bundle.fauna.update(...)` (`gameLoop.ts:1601-1653`)
   - `bundle.placedTraps.update(...)` (`gameLoop.ts:1657`) — not explicitly named in the plan's system table, but it consumes `worldDt` and reuses fauna's per-frame-fresh agent list; freezing it alongside fauna is the conservative, consistent choice (traps aren't mentioned as needing their own catch-up either — leave with no catch-up, matching "not in scope" reading).
   - Inside the gate, replace `worldDt` arguments to these three calls with plain `dt` (they're numerically identical there since the gate implies `!timeSkip.isActive()` ⇒ `worldDt === dt` — using `dt` directly makes the "never scaled" invariant visually obvious instead of relying on the reader to know `worldDt`'s branch).
   - `litFires` must stay computed **outside** the gate (used by `fireAudio.update`/`playerTorch` regardless — `gameLoop.ts:1550-1558`, unconditional presentation, unaffected by this change).
5. Double check `resourceDeposits.update` (`gameLoop.ts:1596-1600`) stays outside the gate, unaffected — it's position-driven, not part of the plan's system table, not touched by this plan.

## `world/timeSkip.ts` doc comment fix (not yet applied)

`timeSkip.ts:48-52`'s comment ("deliberately does not scale dt for anything else... world keeps simulating at its normal real-time pace underneath") is now doubly wrong (it was already wrong before this change, and after this change NPC/fauna don't tick *at all* during a skip, not even at real-time pace). Rewrite to state: NPC/fauna are frozen entirely during an active skip (`gameLoop.ts` gates their `update()` calls behind `timeSkip.isActive()`); only `dayNight`/player-needs consume the boosted multiplier; `hours`/`startTimeOfDay` on `justFinished` drive the one-shot deterministic catch-up in `SettlementsManager.resolveTimeSkip`/`Fauna.resolveTimeSkip`.

## Verification checklist (not started)

- [ ] Update the two stale comments above.
- [ ] Add `AnimalAgent.resolveTimeSkip` + `Fauna.resolveTimeSkip`, wire into `gameLoop.ts`.
- [ ] Gate NPC/fauna/traps per §"gameLoop.ts edit plan" above.
- [ ] `docs/ARCHITECTURE.md` / `docs/STATE.md`: update whatever currently describes time-skip behavior to match (search both files for "time-skip"/"timeSkip"/"resolveTimeSkip" — not yet located precisely, do this in the next session).
- [ ] Tests: extend/add coverage for — no double NPC/household/economy mutation across a skip; fauna frozen during skip (no movement/combat/damage callbacks fire while `timeSkip.isActive()`); fauna corpse/needs catch-up applies exactly once on `justFinished`; existing `NpcAgent.resolveTimeSkip` tests still pass unchanged (its own logic doesn't change, only when it's the *sole* mutator).
- [ ] `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test`.
- [ ] Browser verification per plan §"Weryfikacja" (8 numbered checks) — ask the user to run these against the dev server; do not launch headless Chrome per `CLAUDE.md`.
- [ ] `docs/plans/README.md`: plan 196 is not yet listed in any status table (confirmed — file exists but `README.md` still shows "Next plan ID: 196" and has no row for it). Add a row (domain likely `settlements-npcs` with `tags: [fauna]`, or check plan's own frontmatter if it has one — it didn't appear to when read) to "In progress" while work is ongoing, then move per normal convention when done. Bump "Next plan ID" only if this session also creates a new plan (it doesn't, so leave as `196`… actually re ‑check: since 196 itself now exists, "Next plan ID" should become `197` — verify against how prior plans handled this, e.g. check the diff when plan 195 was added).
- [ ] Git commit + push to `main` (rebase if needed) — required by the plan's closing line.

## Key file:line reference index (for fast resume)

- `src/app/gameLoop.ts:1426-1437` — stale comment + `worldDt` computation.
- `src/app/gameLoop.ts:531-566` — time-skip tick handling, `resolveTimeSkip` call site (`:551`).
- `src/app/gameLoop.ts:1559-1657` — NPC/fauna/traps update block to gate.
- `src/world/timeSkip.ts:1-110` — full file, small; comment at `:45-61` needs rewrite.
- `src/settlement/SettlementsManager.ts:408-413` — `resolveTimeSkip` passthrough to each NPC.
- `src/ai/NpcAgent.ts:2099-2160` — `NpcAgent.resolveTimeSkip` (stepped replay, keep unchanged).
- `src/fauna/AnimalAgent.ts:717` (`timeSinceDeath` field), `:1060-1064` (`readyToRemove`), `:1204-1228` (`advanceCorpseDecay`), `:1280-1313` (top of `update()`, dead-branch early return), `:1411-1413` (`tickAnimalLife` call for live agents).
- `src/fauna/AnimalLife.ts:53-67` — `tickAnimalLife`, pure/linear, safe to call once with a large `dt`.
- `src/world/timeConversion.ts` — `gameHoursToRealSeconds` helper, reuse for fauna catch-up exactly like `NpcAgent.ts:2113` does.
- Not yet located: `createFauna.ts`'s `Fauna` factory (where `update`/`resolveTimeSkip` should be added) and its corpse-removal filter (need to find where `readyToRemove()` is consulted to confirm fauna catch-up's corpse-age bump is sufficient, no other removal-timing code needs touching).

## Prior audits already read in full (don't re-read unless verifying a specific claim)

- `docs/plans/2026-08-22--193--arch--simulation-architecture-consistency-implementation-notes.md` — the primary source for the root-cause analysis above (§10 "Time Skip Execution Map", §14 Finding 0/1/2/3/9).
- `docs/plans/2026-08-22--192--arch--time-and-simulation-consistency-implementation-notes.md` — referenced but not re-read in full this session; mentioned in 193's notes as the first place the NPC-needs double-count was logged (narrower scope than 193's).
- `docs/STATE.md`, `docs/plans/README.md` — read in full for orientation; nothing else time-skip-specific found there beyond what's summarized above.

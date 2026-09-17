# Implementation Notes: npc-049 — NPC contextual life barks and local voice limiter

**Plan:** `docs/plans/npc-049-npc-contextual-life-barks-and-local-voice-limiter.md`  
**Reviewed:** 2026-09-17  
**Source:** current `main` + targeted voice/NPC-needs/weather/threat/playback recon

## Verified ownership and architecture

### Voice identity/resolution already has the correct boundary

`src/ai/npcVoiceLines.ts` owns generated voice identity and `resolveNpcVoiceLine(...)`. Keep all new bark semantic intents and generated-asset manifest entries there; do not add URL tables to `NpcAgent`, settlements or UI code.

The current resolver input is already intentionally small (`id`, `gender`, `role`, `age`, `voiceActor`) and `NpcAgent` exposes exactly those identity fields. Reuse the resolver unchanged except for adding the new semantic intents/assets.

`npc-044` deliberately left world reactions on legacy pools; `npc-049` is the extension point for contextual life/world barks rather than a replacement for greeting/farewell/quest-complete behavior.

### Existing playback is spatial, but its binding currently lives in the Vue store

`src/ui-vue/store.ts` currently owns:

```ts
let npcVoicePlayAt: PlayAt | null = null
export function configureNpcVoiceSounds(playAt: PlayAt | null): void

function playNpcVoice(npc: NpcAgent | null, url: string | undefined): void {
  if (npc && url && npcVoicePlayAt) npcVoicePlayAt(url, npc.mesh.position, NPC_VOICE_VOLUME)
}
```

This is suitable spatial playback (`PlayAt` + live NPC position), but world bark producers must not depend on the Vue store.

Extract the smallest reusable voice playback boundary from the store, rather than duplicating audio setup in `NpcAgent`. A good shape is a small module under `src/audio/` or `src/ai/` that owns the configured `PlayAt` callback and exposes semantic/spatial playback; the store then delegates to it for dialogue voices.

Do not create a second audio bus or construct browser `Audio` objects inside NPC simulation code.

### `NpcAgent` owns transition knowledge, not settlement-wide bark budgets

`NpcAgent` is the per-NPC integration point and owns `NpcAuthoritativeState`. It already exposes stable identity:

- `id` is settlement-scoped (`${settlementId}:npc:${i}`),
- `gender`, `role`, `age`, `voiceActor`,
- `mesh.position` for spatial playback.

It also owns the runtime transition state needed for several bark triggers (`phase`, `activeNeed`, `pendingAction`, `currentWeather`, threat/combat state).

Do not put rolling settlement budgets/maps on each `NpcAgent`. The agent should only request a bark at a verified transition.

## Locality key

Loaded settlements already have an authoritative `SettlementEconomy.settlementId`. Use that existing ID as the bark budget area key for settlement NPCs.

Prefer passing/retaining the settlement ID explicitly at the composition/constructor seam if `NpcAgent` does not currently retain the economy itself. Do not parse the settlement ID back out of `NpcAgent.id` unless current construction code makes an explicit helper for that contract.

V1 does not need a generic spatial hash for settlement NPCs. If a future non-settlement NPC caller needs barks, add a bounded local-area key then; do not generalize `npc-049` pre-emptively.

## Recommended module split

Keep the limiter pure/testable and playback separate:

```text
src/ai/npcVoiceLines.ts
  semantic intents + generated voice manifest/resolver

src/ai/npcBarkPolicies.ts
  policy constants/types only

src/ai/npcBarkLimiter.ts
  transient rolling-window / per-NPC / episode accounting

src/audio/npcVoicePlayback.ts   (or closest existing audio naming)
  configured PlayAt + spatial voice playback

composition layer / NpcAgent deps
  one shared limiter/request function wired into loaded settlement NPCs
```

The exact playback filename may follow the existing audio directory conventions, but keep the responsibilities separated: resolver ≠ limiter ≠ playback.

## Bark request contract

Prefer injecting a narrow callback into `NpcAgent`/settlement construction rather than importing a singleton manager into simulation code.

Conceptual contract:

```ts
type NpcBarkRequest = {
  npc: Pick<NpcVoiceResolveInput, 'id' | 'gender' | 'role' | 'age' | 'voiceActor'>
  position: Readonly<{ x: number; y: number; z: number }>
  areaKey: string
  intent: NpcBarkIntent
  episodeKey?: string
}

type RequestNpcBark = (request: NpcBarkRequest) => NpcBarkDecision
```

The actual position type may remain `THREE.Vector3` if that matches existing `PlayAt`; do not introduce DTO conversion just for style.

Caller decides **when/why** a bark event happened. Shared bark code decides policy, throttling, resolver lookup and playback.

A rejected/no-asset request must be side-effect-free for simulation.

## Time source

`NpcAgent` and existing transient presentation cues already use simulation clock (`simClock`, e.g. campfire voice cue timing). Use an injected/current simulation-time number for bark limiter timestamps and tests rather than `Date.now()` or real timers.

This keeps cooldown/window behavior deterministic under paused/scaled simulation and allows pure tests.

The limiter API should accept `nowSim` (seconds is preferable if matching existing NPC timers) or receive a time function from composition. Convert the plan's minute values to centralized constants once; do not mix wall-clock milliseconds with simulation seconds at call-sites.

## Limiter data ownership

One limiter instance should be shared across the loaded world/settlement composition, not one per NPC.

Transient state can be maps/queues keyed by:

```text
npc + intent
area + intent
area optional-global
area + intent + episodeKey
```

Keep only timestamps still inside the longest relevant rolling window. Prune lazily on request; no background tick is needed.

Do not persist this state and do not add it to `NpcAuthoritativeState`, household, economy or SaveData.

## Policy resolution

Keep policy in one data table keyed by bark intent. Initial policy should encode concrete values rather than leaving caller choices.

Recommended starting values (simulation seconds):

| Intent | Priority | NPC cooldown | Area limit | Area window | Episode |
|---|---|---:|---:|---:|---|
| `exhausted` | optional | 1200 | 2 | 300 | no |
| `hungry` | optional | 1200 | 2 | 300 | no |
| `weather_shelter` | optional | 900 | 2 | 300 | yes when stable weather episode exists |
| `work_finished` | optional | 1200 | 1 | 300 | no |
| `danger_alert` | required | 60 | 2 | 60 | yes |
| `call_for_help` | required | 60 | 1 | 60 | yes |
| `livestock_danger` | required | 60 | 1 | 60 | yes |
| `guard_response` | required | 60 | 2 | 60 | yes |
| `combat_start` | required | 60 | 2 | 60 | combat-entry episode |

Shared optional ambient budget: **4 accepted optional barks / area / 300 s**.

These are tuning defaults, not simulation rules. Keep them easy to adjust in one file.

Required barks bypass the optional-global budget, but they still obey their own per-NPC/area/episode anti-spam rules.

## Trigger seams

### `exhausted`

`NpcAgent` already has a real `phase === 'exhausted'`; `REST_PHASES` treats it as a resting phase. Trigger only on **entry** into exhausted caused by an interruption/transition from meaningful activity.

Do not trigger from every tick where vigor remains low.

Capture the previous activity/phase before the code commits the exhaustion transition. Suppress bark when the NPC was already idle/resting/sleeping and merely remains exhausted; the user-facing intent is "I had to stop what I was doing."

### `hungry`

Needs are authoritative through `NeedState` / `activeNeed`, with selection occurring through the existing need/decision pipeline. Trigger when hunger wins control and begins its satisfaction path after interrupting/redirecting meaningful routine/work.

Do not trigger from `tickNeeds`, `FOOD_THRESHOLD_NORMAL`, or raw hunger threshold crossings. Those functions own pressure/state, not the behavioral transition.

The useful seam is the transition where `activeNeed` becomes hunger and `beginNeed()` commits the eat/food strategy/action.

Avoid barking repeatedly if hunger strategy retries/repaths while the same need remains active.

### `weather_shelter`

`npc-012` already implements weather as decision pressure and uses existing action lifecycle (`startAction` → `goTo` → `execute`) to seek the NPC's home shelter. `currentWeather` is forwarded once per frame and `shelterSettled` prevents restarting an already completed shelter reaction.

Request the bark only when `choose()` actually selects `seekShelter` and the shelter action is newly started. Do not trigger from `currentWeather`, rain amount or repeated choose ticks.

If there is no actual shelter action/behavior change (already sheltered/settled or another critical need wins), there is no bark.

Weather episode ID is optional in V1. If the weather system exposes no stable episode identity, the existing area window + NPC cooldown + `shelterSettled` transition is sufficient; do not invent persisted weather episodes just for voice.

### `danger_alert`

Use the existing bounded `nearbyAnimalThreats` / `senseImmediateAnimalThreat()` pipeline. The trigger belongs where a threat becomes a newly meaningful immediate threat/response, not in the raw candidate forwarding layer and not on every perception tick.

Reuse the threatening animal's stable candidate/target identity for `episodeKey` when available.

The bark limiter is presentation-only; it must not become the source of local assistance propagation.

### `livestock_danger`

`npc-047` already owns shepherd recognition of an owned-flock threat through `senseOwnedFlockThreat(...)`. That result includes the real threatening candidate/target and prey ownership context.

Request `livestock_danger` exactly when the flock threat is promoted into the shepherd's immediate response/interruption path. Use predator identity + owned flock/household context for the episode key if both are available.

Do not add another flock scan for audio.

### `call_for_help` / `guard_response`

`npc-048` defines local assistance as a transient derived candidate flow built once from live threat facts and forwarded to NPCs. Attach voice requests to that system's semantic transitions:

- source/victim enters a local-assistance episode → `call_for_help`,
- guard actually accepts/responds to the assistance danger after its own perception/arbitration → `guard_response`.

Do not play `guard_response` merely because a guard perceived an alarm; it should correspond to an actual response decision.

Do not make bark emission create or extend an assistance candidate.

### `combat_start`

`NpcAgent` already has one combat entry path (`beginCombat()` / shared action lifecycle). Request on successful transition into `phase === 'combat'` from a non-combat phase.

Do not attach to melee/ranged attack timers, hit windows or target refresh.

Use NPC id + target handle identity (or target id exposed by the handle/candidate) as the transient episode key. If the same combat target is lost and later a new combat commitment is created, a later bark may be eligible after policy cooldown.

### `work_finished`

This is the least universal trigger and should stay narrow in V1. Use only a completion seam that can distinguish a **meaningful work block** from ordinary tiny `execute` completions.

Prefer an existing scheduled/work action completion classification (`classifyPendingActivity(...)=work`, schedule work boundary, or profession work action marked as meaningful) rather than every `ActionLifecycle` completion.

Do not fire for:

- gathering sub-actions,
- path arrival,
- every production tick,
- interrupted work,
- exhaustion-driven stop,
- needs taking over.

If current code has no reliable single "work block completed normally" seam, implement the other intents first and leave `work_finished` wired only where classification is unambiguous. Do not broaden semantics to satisfy asset usage.

## Threat dependencies and ordering

`npc-047` / `npc-048` may still be planned/in-progress while `npc-049` is implemented. Do not duplicate their missing simulation behavior inside this plan.

Implementation should:

- wire barks to existing seams that already exist on current `main`,
- add narrow hook points where dependency code exposes a transition,
- leave `livestock_danger`, `call_for_help`, `guard_response` dormant/no-op until their authoritative dependency seam exists if necessary.

The voice plan must remain independently safe if one dependency is not yet implemented.

## Asset manifest and fallback nuance

`resolveNpcVoiceLine()` currently resolves exact semantic intent keys through profession/gender/age/general hierarchy. A profession-specific `livestock_danger` does **not** automatically mean falling back to a differently named `danger_alert` intent.

Implement one of these explicit choices:

1. include general `livestock_danger` assets in the manifest, or
2. in the bark request layer only, map missing shepherd `livestock_danger` to a second resolver attempt for `danger_alert`.

Prefer option 2 if the intended initial content truly has only shepherd-specific `livestock_danger` plus general `danger_alert`. Keep that semantic fallback explicit and tested; do not silently teach the generic resolver that unrelated intents are aliases.

Similarly, missing audio remains a safe no-op.

## Diagnostics

Return a small decision object from limiter/request rather than console logging by default, e.g.:

```ts
type NpcBarkDecision =
  | { accepted: true; url: string }
  | { accepted: false; reason: 'npc-cooldown' | 'area-intent-budget' | 'optional-global-budget' | 'episode-already-spoken' | 'no-voice-asset' }
```

This supports unit tests and future debug tooling without production spam.

Do not add a permanent per-frame debug overlay in this plan.

## Tests to add

### Pure limiter tests

Create focused tests for:

- 5 `exhausted` requests in one area/300 s → only first 2 intent-budget admissions (and never >4 optional total),
- same requests in another settlement ID remain independent,
- same NPC + same intent rejected inside NPC cooldown,
- expiry/pruning after window/cooldown,
- mixed optional intents share the area ambient budget,
- required bark still eligible after optional ambient budget is exhausted,
- same threat episode suppresses repeated alarm requests,
- a different threat episode is independently eligible,
- missing asset does not mutate simulation state and should not consume a bark budget unless implementation deliberately resolves before admission (prefer resolve-before-record so missing files do not spend budget).

Use explicit numeric `nowSim` values; no fake/real timers required.

### Resolver tests

Extend `npcVoiceLines` tests for each new intent present in the manifest and profession/general fallback. Include the explicit `livestock_danger` → `danger_alert` fallback if option 2 above is used.

### Integration tests

Keep integration coverage narrow and transition-focused:

- exhaustion entry requests once, not once per exhausted tick,
- hunger takeover requests once, not on threshold ticking,
- newly started seek-shelter requests once,
- combat entry requests once, not per attack,
- threat episode requests feed the shared limiter rather than direct playback.

Do not test actual WebAudio/browser playback in unit tests.

## Files to inspect first during implementation

- `src/ai/npcVoiceLines.ts`
  - `NpcVoiceSemanticIntent`
  - `NpcVoiceResolveInput`
  - generated manifest
  - `resolveNpcVoiceLine()`
- `src/ui-vue/store.ts`
  - `npcVoicePlayAt`
  - `configureNpcVoiceSounds()`
  - `playNpcVoice()`
- `src/ai/NpcAgent.ts`
  - stable identity fields
  - `phase`, `activeNeed`, `currentWeather`, `shelterSettled`
  - exhaustion transition
  - `choose()` / `beginNeed()`
  - weather `seekShelter` action start
  - immediate animal-threat response
  - `beginCombat()`
  - meaningful work completion classification
- `src/ai/Needs.ts`
  - pressure/need IDs only; do not attach voice to raw ticking
- `src/ai/npcAnimalThreat.ts`
  - `ThreateningAnimalCandidate`
  - `senseImmediateAnimalThreat()`
- `src/fauna/shepherdFlock.ts`
  - dependency seam for `npc-047`
- `src/settlement/SettlementsManager.ts`
- `src/settlement/createSettlement.ts`
  - settlement ID / shared dependency injection / bounded threat forwarding
- `src/economy/settlementEconomy.ts`
  - authoritative `settlementId`
- `docs/plans/implementation-notes/npc-047-shepherd-livestock-threat-response-implementation-notes.md`
- `docs/plans/implementation-notes/npc-048-local-threat-assistance-and-guard-response-implementation-notes.md`

## Performance guardrails

- no new per-frame NPC scan for bark eligibility,
- no NPC × fauna scan,
- no background limiter tick; prune lazily on bark requests,
- one shared transient limiter, bounded by accepted/recent requests,
- no Web Worker,
- no persistence churn,
- do not gate simulation decisions on player/camera/audibility,
- resolving/playing a voice may fail silently without affecting state.

## Suggested implementation order

1. Add new semantic intents + real existing asset manifest entries/tests.
2. Extract/reuse spatial NPC voice playback outside the Vue-store-only helper; keep store dialogue behavior unchanged.
3. Add `npcBarkPolicies.ts` + pure `npcBarkLimiter.ts` with injected simulation time and tests.
4. Create one shared request/play composition boundary keyed by existing settlement ID.
5. Wire low-risk authoritative transitions first: `exhausted`, `weather_shelter`, `combat_start`.
6. Wire `hungry` after verifying the exact `beginNeed()` commitment seam.
7. Wire `work_finished` only at a genuinely meaningful normal-work completion seam.
8. Wire threat/shepherd/assistance intents onto current `npc-047`/`npc-048` seams without recreating dependency logic.
9. Update `docs/assets/SOUNDS.md` / `docs/dialogue/NPC-VOICE-CATALOG.md` with actual shipped assets and bark semantics.
10. Automated tests + `pnpm type-check`; browser verification remains with the User.

## Documentation follow-up

After implementation:

- update `docs/state/npc.md` with contextual barks as presentation-only, transient local throttling,
- update `docs/assets/SOUNDS.md` with wired/new voice assets,
- update `docs/dialogue/NPC-VOICE-CATALOG.md` with generated filenames/phrases actually shipped,
- do not describe ungenerated assets as runtime-supported.

## Manual verification boundary

AI implementation should run automated/type checks only. Browser gameplay/audio verification is the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
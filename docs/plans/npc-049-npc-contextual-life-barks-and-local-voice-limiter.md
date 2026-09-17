# Plan: NPC contextual life barks and local voice limiter

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** npc-044
**Domain:** `npc`
**Subdomains:** `dialogue` `behavior` `needs` `combat`
**Tags:** `voice` `audio` `barks` `needs` `threats`
**Roadmap:** -

## Goal

Extend the existing NPC voice system with short contextual barks driven by real simulation events:

- needs and condition,
- interruption or completion of work,
- weather-driven shelter seeking,
- local danger,
- combat,
- calls for help,
- livestock danger,
- guard response.

Barks should make NPC life and world-state changes audible without affecting simulation decisions. The system must distinguish:

1. **required barks** — gameplay-relevant alerts and responses,
2. **optional barks** — ambient life comments.

Voice remains presentation only. A denied/missing bark must never change NPC behavior.

## Existing mechanisms to reuse

### Voice resolver

Reuse `src/ai/npcVoiceLines.ts` and the existing `resolveNpcVoiceLine(...)` hierarchy from `npc-044`:

```text
specific NPC
→ profession + gender + age
→ profession + gender
→ general + gender + age
→ general + gender
→ fallback
```

Do not create a parallel resolver for world/life barks.

### NPC simulation

Attach bark requests to authoritative transitions/events already owned by NPC systems, including:

- `NpcAgent` fatigue/vigor and the `exhausted` phase,
- needs and work interruption,
- `npc-012` weather `seekShelter`,
- NPC combat entry,
- threat perception/response,
- shepherd livestock-threat response from `npc-047`,
- local assistance and guard response from `npc-048`.

Do not poll presentation state or numeric thresholds independently if an existing state transition already expresses the event.

## Bark categories

### Required barks

#### `danger_alert`

NPC detects a meaningful immediate local threat.

Example phrase:

```text
Wolf! Everyone, watch out!
```

Suggested general asset:

```text
general_male_danger_alert_01.mp3
```

Trigger on discovery/escalation of a threat episode, not every perception tick.

#### `call_for_help`

NPC is personally threatened and local assistance is relevant.

Example phrase:

```text
Help! Someone, quickly!
```

Suggested general asset:

```text
general_male_call_for_help_01.mp3
```

#### `livestock_danger`

Profession-aware shepherd reaction when owned livestock is threatened.

Example phrase:

```text
Wolf in the flock! Get away from the sheep!
```

Suggested profession asset:

```text
shepherd_male_livestock_danger_01.mp3
```

Fallback to a suitable general danger bark if no shepherd-specific asset exists.

#### `guard_response`

Guard begins responding to a local threat/help episode.

Example phrase:

```text
Hold on! I'm coming!
```

Suggested profession asset:

```text
guard_male_guard_response_01.mp3
```

This is a responder bark, not a duplicate initial alarm.

#### `combat_start`

NPC commits to combat.

Example phrase:

```text
Alright then. Come on!
```

Suggested general asset:

```text
general_male_combat_start_01.mp3
```

Fire on actual combat entry only, not per attack animation/target refresh.

### Optional barks

#### `exhausted`

NPC interrupts meaningful activity because fatigue/vigor requires recovery.

Example phrase:

```text
I need to sit down for a while.
```

Suggested general asset:

```text
general_male_exhausted_01.mp3
```

Do not trigger merely because vigor is low. Prefer a meaningful transition such as:

```text
work/activity → exhausted/rest
```

#### `hungry`

NPC interrupts work/routine because hunger becomes the active need and starts seeking food.

Example phrase:

```text
I can't work on an empty stomach.
```

Suggested general asset:

```text
general_male_hungry_01.mp3
```

Do not trigger on threshold crossing alone.

#### `weather_shelter`

NPC interrupts a low-priority activity and starts seeking shelter because of actual weather pressure.

Example phrase:

```text
Rain's coming down hard. Better get inside.
```

Suggested general asset:

```text
general_male_weather_shelter_01.mp3
```

This bark must only fire when weather causes a real behavior change, reusing `npc-012` `seekShelter`. Do not trigger simply because `rain === true`.

#### `work_finished`

NPC completes meaningful work or a substantial work block normally.

Example phrase:

```text
There. That's enough work for today.
```

Suggested general asset:

```text
general_male_work_finished_01.mp3
```

This intent is not for exhaustion-driven interruption; `exhausted` owns that case. Do not emit for every small work action/tick.

## Bark policy

Introduce explicit policy per semantic bark intent.

Suggested contract:

```ts
type NpcBarkPriority = 'required' | 'optional'

type NpcBarkPolicy = {
  priority: NpcBarkPriority
  npcCooldownMs: number
  areaWindowMs: number
  maxPerAreaWindow: number
  usesOptionalBudget: boolean
  episodeScoped?: boolean
}
```

Exact representation may differ if current code offers a better fit, but policy should remain data-driven rather than scattered constants in call-sites.

## Local bark limiter

Add one shared mechanism responsible for deciding whether a bark may be presented.

Suggested responsibility name:

```text
NpcBarkLimiter
```

or an equivalent module that matches current ownership boundaries.

It must not own NPC simulation state. It owns only transient voice-presentation throttling.

A bark request should pass through:

```text
simulation event occurs
→ resolve bark policy
→ NPC cooldown check
→ local/settlement intent budget check
→ optional shared ambient budget check
→ episode suppression if applicable
→ resolveNpcVoiceLine(...)
→ playback
```

## Locality

Budgets must be local, not world-global.

Preferred scope:

1. settlement ID when NPC belongs to a settlement,
2. otherwise a bounded spatial/local-area key.

An event in a remote settlement must not silence NPCs near another settlement/player.

Simulation events remain independent of camera/player presence even when no bark is eventually played.

## Optional bark budget

Initial tuning target:

```text
window: 5 minutes
```

Per-intent examples:

```text
exhausted:       max 2 / settlement / 5 min
hungry:          max 2 / settlement / 5 min
weather_shelter: max 2 / settlement / weather episode
work_finished:   max 1–2 / settlement / 5 min
```

Additionally add a shared optional/ambient budget:

```text
max 3–4 optional NPC barks
per settlement
per 5-minute rolling window
```

Therefore five NPCs becoming exhausted together still produce only a small number of lines.

## Per-NPC cooldown

Optional barks should also have a substantially longer cooldown per NPC.

Initial defaults:

```text
exhausted:       15–30 min
hungry:          15–30 min
weather_shelter: per weather episode + cooldown
work_finished:   15–30 min
```

Exact values should be centralized and easy to tune.

## Required bark throttling

Required does **not** mean unlimited.

Threat barks need episode-aware suppression.

Desired shape:

```text
wolf approaches settlement
→ shepherd: livestock danger bark
→ nearby guard: response bark
→ combat starts
```

Avoid an alarm chorus from every nearby NPC.

For one threat episode allow only:

- one or a very small number of initial alarms,
- optionally one relevant profession-specific bark,
- optionally one responder bark.

Reuse existing threat/event identity when available. Do not create a second authoritative threat lifecycle only for audio.

## Episode keys

Where the underlying system exposes stable context, bark requests may include an episode key such as:

```text
threat:<threat-id>
livestock-threat:<threat-id>:<household-or-flock-id>
weather:<weather-episode-id>
combat:<npc-id>:<opponent-id>:<combat-entry>
```

Episode state is transient presentation state and should not require persistence.

## Semantic voice intents

Extend `NpcVoiceSemanticIntent` with the minimum initial set:

```ts
| 'exhausted'
| 'hungry'
| 'weather_shelter'
| 'danger_alert'
| 'combat_start'
| 'call_for_help'
| 'livestock_danger'
| 'guard_response'
| 'work_finished'
```

Do not duplicate existing quest-complete semantics.

Generated asset resolver continues using the existing hierarchy.

Initial filenames should follow the current flat voice asset convention, e.g.:

```text
general_male_exhausted_01.mp3
general_female_exhausted_01.mp3

general_male_danger_alert_01.mp3
general_female_danger_alert_01.mp3

shepherd_male_livestock_danger_01.mp3
shepherd_female_livestock_danger_01.mp3

guard_male_guard_response_01.mp3
guard_female_guard_response_01.mp3
```

## Playback architecture

Do not add another audio subsystem.

Reuse the existing NPC voice playback path if it can accept world-triggered bark requests.

If current playback is coupled to Vue/dialogue UI, extract the smallest reusable NPC voice playback boundary rather than duplicating audio handling inside `NpcAgent`.

Simulation code should preferably request:

```ts
requestNpcBark(npc, intent, context)
```

rather than hardcoding audio URLs.

The caller owns knowledge of **why** the event happened.

The bark system owns:

- throttling,
- semantic asset resolution,
- presentation.

## Trigger ownership

Triggers stay with systems that own the underlying state transition.

Examples:

```text
fatigue/work interruption
→ NPC behavior owner requests `exhausted`

hunger need takes control
→ needs/decision transition requests `hungry`

weather seekShelter starts
→ weather/NPC reaction requests `weather_shelter`

threat detected
→ threat response requests `danger_alert`

combat entry
→ combat owner requests `combat_start`

shepherd flock response
→ npc-047 seam requests `livestock_danger`

local assistance request
→ npc-048 seam requests `call_for_help`

guard accepts/responds to assistance
→ npc-048 seam requests `guard_response`

normal meaningful work completion
→ work owner requests `work_finished`
```

Do not add a central manager that periodically scans every NPC looking for conditions to narrate.

## Simulation independence

Voice must never affect:

- decisions,
- needs,
- goals,
- combat,
- threat propagation,
- schedules,
- work execution,
- quest state.

Failure to resolve an asset or rejection by limiter is always a silent presentation no-op.

Example:

```text
NPC gets exhausted
→ work stops regardless
→ bark denied because settlement budget exhausted
→ NPC still rests normally
```

## Off-screen behavior

Do not require player/camera proximity for the simulation trigger itself.

Actual audio playback may reuse existing audibility/spatial rules so distant NPCs are not heard.

Do not create separate observed-NPC behavior.

## Initial content scope

Minimum useful initial asset batch:

```text
general male + female:
- exhausted
- hungry
- weather_shelter
- danger_alert
- combat_start
- call_for_help
- work_finished

shepherd male + female:
- livestock_danger

guard male + female:
- guard_response
```

If one gender/profession is not currently a meaningful runtime combination, resolver fallback may be used rather than blocking implementation.

Audio generation itself is manual asset work and may be completed separately from runtime wiring.

## Diagnostics

Add lightweight diagnostics sufficient to tune limiter behavior.

Useful information:

```text
intent
npc id
area/settlement key
accepted / rejected
reason:
- npc-cooldown
- area-intent-budget
- optional-global-budget
- episode-already-spoken
- no-voice-asset
```

Avoid noisy production logging. Prefer existing debug tooling/patterns if available.

## Persistence

Limiter history should initially remain transient.

Do not persist:

- optional bark cooldown timestamps,
- local rolling-window budgets,
- spoken episode cache.

These are presentation details, not authoritative world history.

## Tests

Add deterministic unit tests for limiter behavior independently of actual audio.

Minimum coverage:

### Optional area cap

Five NPCs request `exhausted` inside one settlement/window.

Expected: only the configured maximum is accepted.

### Different settlement

Settlement A exhausts its budget; settlement B must still be allowed.

### NPC cooldown

Same NPC requests `exhausted` twice inside cooldown; second request is rejected.

### Rolling-window expiration

Request becomes valid after the configured window expires.

Prefer injected/current simulation-time abstraction; avoid real timers in tests.

### Shared optional budget

Different optional intents compete for the common ambient budget.

Example:

```text
exhausted
hungry
weather_shelter
work_finished
```

must not collectively exceed the configured cap.

### Required vs optional

Optional budget exhaustion must not automatically suppress a required danger bark.

### Threat episode suppression

Several NPCs observe the same threat episode; only the configured alarm count is accepted.

### Resolver fallback

New semantic intents continue to follow the existing profession/gender/age/general lookup hierarchy.

## Manual verification

User verifies in browser.

Suggested scenarios:

1. Make several NPCs work until fatigue interrupts them.
   - only 1–2 appropriate barks should be heard,
   - every NPC must still enter correct rest behavior.
2. Trigger hunger-driven interruption for several NPCs.
   - behavior remains correct,
   - voice remains sparse.
3. Start bad weather while several NPCs are outdoors.
   - many NPCs may seek shelter,
   - only limited `weather_shelter` barks are heard,
   - no bark if weather did not actually change NPC behavior.
4. Bring a wolf close to livestock.
   - shepherd may issue profession-specific warning,
   - nearby NPCs do not create an alarm chorus.
5. Trigger local help/guard response.
   - initial alarm and responder bark are distinguishable.
6. Trigger combat.
   - combat-start line occurs at entry only, not per attack.
7. Complete a meaningful normal work block.
   - `work_finished` can occur sparsely,
   - exhaustion-driven stopping still uses `exhausted` instead.

No AI/browser automated verification.

## Non-goals

- Dynamic runtime TTS.
- LLM-generated bark text.
- Persistent bark history.
- Lip sync.
- Subtitles for ambient bark in this plan.
- New authoritative threat/event system.
- Player-specific versions of the same NPC event systems.
- Per-frame scanning of all NPCs for bark eligibility.
- Large voice-content batch.
- Reworking dialogue-panel voice behavior from `npc-044`.
- Quest completion voice changes.

## Implementation guidance

Prefer a small dedicated presentation-domain module rather than growing `NpcAgent` with settlement-wide audio-budget state.

Likely responsibilities:

```text
npcVoiceLines.ts
  semantic asset identity + resolver

npcBarkPolicies.ts
  data-driven bark policies

npcBarkLimiter.ts
  transient cooldown/window/episode accounting

existing NPC systems
  request semantic barks at authoritative transitions

existing audio playback
  plays accepted resolved clip
```

Exact filenames/locations should follow current architecture found during implementation-notes recon.

Do not introduce a God Object combining NPC needs, threat state, audio, settlement state and cooldowns.

Add JSDoc for the bark limiter/request boundary and important public policy types, with `@domain npc` where useful for preflight discovery.

## Acceptance criteria

- Existing `resolveNpcVoiceLine()` is reused.
- New contextual voice intents are semantic, not hardcoded URLs at call-sites.
- Required and optional bark policies are distinct.
- Optional barks have:
  - per-NPC cooldown,
  - per-intent local rolling budget,
  - shared local optional budget.
- Threat-related required barks have episode-aware anti-spam.
- Limits are settlement/local rather than world-global.
- Five simultaneous exhausted NPCs cannot create five simultaneous exhaustion lines.
- `weather_shelter` only triggers when weather actually causes a shelter-seeking behavior change.
- `work_finished` is distinct from exhaustion-driven interruption.
- Audio denial never changes simulation behavior.
- Bark triggers originate from existing authoritative state transitions.
- No player/camera-owned simulation mechanism is introduced.
- Unit tests cover limiter behavior.
- `pnpm type-check` passes.
- Browser verification remains with the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Implementation Notes: npc-045 — Campfire spoken conversation pairs

**Plan:** `docs/plans/npc-045-campfire-spoken-conversation-pairs.md`  
**Reviewed:** 2026-09-17  
**Source:** current `main` + targeted social/campfire/audio recon

## Existing ownership

### Pair formation and shared conversation data

`src/ai/socialBehaviour.ts::advanceSocialPairing()` is the correct owner for choosing one spoken exchange because it already sees both participants before either side starts.

Current responsibilities there:

- gather available `socialCandidate()` views,
- deterministic same-place partner selection,
- reserve both IDs in one pass,
- generate one shared `durationSec`,
- generate one shared relationship outcome closure,
- call `beginConversation()` once on each participant.

Do not move presentation selection into `NpcAgent` independently per side.

### Participant lifecycle

`src/ai/NpcAgent.ts::beginConversation()` owns each NPC's half of the existing `conversation` action. It already has:

- `this.gender`,
- `this.playAt`,
- current mesh/world position,
- conversation partner identity,
- early-exit callback,
- existing cleanup paths for conversation reservation and time-skip reset.

Today it also contains the old S25 friendly-talk hook:

```ts
const talkUrl = pickNpcFriendlyTalkSound(this.gender)
if (talkUrl) this.playAt(talkUrl, this.mesh.position, FRIENDLY_TALK_SOUND_VOLUME)
```

That is the existing presentation seam to replace/demote when a structured campfire exchange is present.

### Campfire/Social Place lifecycle

`src/settlement/places.ts::socialPlaceFor()` wraps the existing settlement campfire as a `Place` and accepts an `isAvailable` predicate. `src/settlement/createSettlement.ts` supplies live fire availability and calls `advanceSocialPairing(agents, relations, dayLengthSec)` after NPC updates.

No new campfire registry, global scan or update loop is needed.

## Recommended data model

Create `src/ai/campfireTalk.ts` as presentation data + pure selection only.

Keep complete authored pairs together. Do not derive answer filenames from question filenames or choose question/answer independently.

Useful shape:

```ts
export type CampfireTalkTopic = 'weather' | 'work' | 'road'

export type CampfireTalkDefinition = {
  topic: CampfireTalkTopic
  questionerGender: NpcGender
  responderGender: NpcGender
  questionUrl: string
  answerUrl: string
  answerDelaySec: number
}
```

The current 12 files form six complete opposite-gender pairs across the three topics:

- female weather question 01 → male weather answer 01,
- male weather question 02 → female weather answer 02,
- male work question 01 → female work answer 01,
- female work question 02 → male work answer 02,
- female road question 01 → male road answer 01,
- male road question 02 → female road answer 02.

A resolver should filter by `(questionerGender, responderGender)`, then pick one compatible definition with injectable RNG. If the filtered pool is empty, return `undefined`.

## Pair speaker order

`advanceSocialPairing()` already has stable entry/partner ordering after its deterministic candidate selection. Use:

- `entry` = questioner,
- `partnerEntry` = responder.

Do not introduce a role/personality/relationship-based choice of who speaks first in npc-045.

This keeps one deterministic pairing authority and avoids another selection layer.

## SocialParticipant contract

The narrow structural `SocialParticipant` type currently exposes `id`, `personality`, `socialCandidate`, `beginConversation`, `releaseConversationPartner`.

Add only what campfire audio needs:

- `gender: NpcGender`,
- optional per-participant conversation voice cue on `beginConversation`.

Prefer passing each side its own cue rather than a whole pair object into `NpcAgent`.

Conceptually:

```ts
type ConversationVoiceCue = {
  url: string
  delaySec: number
}
```

Questioner receives `delaySec: 0`; responder receives `delaySec: answerDelaySec`.

When no compatible `CampfireTalk` exists, pass no structured cue.

## Delayed playback ownership

Do not use `setTimeout` and do not extend `WorldAudio.playAt` for completion callbacks in this plan.

The responder should hold a tiny transient pending cue in `NpcAgent`, e.g. URL + target simulation timestamp. This is presentation state tied to the active conversation and does not belong in persistence.

Playback condition should require that the same conversation is still active when the target time is reached. A stale cue must never play after cancellation.

Clear pending cue on every existing path that tears down conversation ownership. Verify at least:

- normal conversation completion,
- `releaseConversationPartner()`,
- early exit initiated by this NPC,
- `finishTimeSkipMovementReset()`,
- death/dispose/reset paths that already clear `conversationPartnerId` or pending action state.

When implementing, prefer one helper that clears transient conversation presentation state together with partner/callback state rather than duplicating assignments across multiple cleanup paths, but do not widen this into an unrelated `NpcAgent` refactor.

## Friendly-talk fallback

`npcVoiceLines.ts` currently owns empty `NPC_FRIENDLY_TALK_SOUND_URLS` pools and `pickNpcFriendlyTalkSound(gender)`.

Recommended V1 behaviour:

1. structured cue supplied → play/schedule it; do not also play friendly-talk,
2. no structured cue → preserve existing `pickNpcFriendlyTalkSound` fallback,
3. empty fallback pool → silence.

This preserves future support for non-campfire Social Places or same-gender conversations without creating duplicate foreground speech.

Do not delete the old API merely because its current pools are empty unless code inspection during implementation shows it has no remaining useful contract.

## Audio API boundary

`src/audio/createWorldAudio.ts::PlayAt` is:

```ts
(url, position, volume?, bus?, maxDistance?) => void
```

It is fire-and-forget. No completion/duration information is exposed.

Keep it unchanged for npc-045. The authored `answerDelaySec` metadata is the bounded POC solution.

Use the same positional NPC voice volume currently used by friendly-talk unless current `NpcAgent` voice presentation has a newer shared constant by implementation time.

## Tests worth adding

### `campfireTalk.test.ts`

Test pure resolver behaviour:

- female→male can resolve only authored female→male definitions,
- male→female can resolve only authored male→female definitions,
- male→male and female→female return `undefined` with the current catalog,
- RNG 0 / near-1 selects predictable first/last compatible definitions,
- returned question and answer always come from one definition.

### `socialBehaviour.test.ts`

Existing mocks implement `SocialParticipant`; update them with `gender` and capture voice cues passed to `beginConversation()`.

Verify:

- one resolver decision is shared by the pair,
- first participant gets question cue with zero delay,
- partner gets answer cue with authored delay,
- unsupported pairing still begins simulation conversation with no structured cues,
- relationship outcome closure remains exactly-once.

If practical, inject the campfire talk resolver or RNG rather than mocking modules globally. Keep `advanceSocialPairing` deterministic-given-RNG like the existing duration/outcome helpers.

### `NpcAgent` tests

Use existing test seams if available; avoid constructing a full world only for audio. Verify the smallest observable lifecycle:

- zero-delay cue plays at conversation start,
- delayed cue does not play before its simulation timestamp,
- delayed cue plays once while conversation is active,
- partner release/early exit clears it,
- time-skip reset clears it.

## Performance

No additional settlement/NPC scans are needed. Resolver work is O(number of authored campfire exchanges), currently tiny, and occurs only when an actual pair is formed.

Do not evaluate campfire talk choices per frame or during `socialCandidate()` calls.

## Documentation follow-up

When wired:

- mark S25 in `docs/assets/SOUNDS.md` as structured campfire voice available rather than only a missing murmur,
- keep `docs/dialogue/NPC-VOICE-CATALOG.md` as the content/voice-generation source of truth,
- do not duplicate all transcripts into runtime code comments.

## Implementation order

1. Add pure `campfireTalk.ts` manifest/resolver + tests.
2. Extend `SocialParticipant` with gender/cue contract and select one exchange in `advanceSocialPairing()`.
3. Add immediate/delayed transient playback handling in `NpcAgent.beginConversation()` and cleanup paths.
4. Preserve friendly-talk only as fallback when no structured cue exists.
5. Update targeted tests and sound docs.
6. Run targeted Vitest and `pnpm type-check`.

## Guardrails

- No new manager/FSM/action kind.
- No player/camera condition in simulation selection.
- No runtime filesystem/network probing.
- No runtime Fish Audio/TTS calls.
- No `setTimeout` for simulation-owned delayed speech.
- No new relationship consequences from spoken topic.
- No change to partner ranking or conversation duration/outcome semantics.
- No `createWorldAudio` redesign for this POC.

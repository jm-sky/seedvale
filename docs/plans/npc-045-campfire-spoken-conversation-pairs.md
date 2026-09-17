# Plan: Campfire spoken conversation pairs

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** S
**Depends on:** ~~npc-013~~, ~~npc-044~~
**Domain:** `npc`
**Subdomains:** `dialogue` `relationships`
**Tags:** `campfire` `voice` `social`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Extend the existing NPC Social Place `conversation` flow so a paired campfire conversation can play one compatible spoken question/answer exchange from `public/sounds/voices/`, without introducing a second social system, campfire manager or conversation FSM.

The simulation remains authoritative: pairing, duration, interruption and relationship outcome continue to come from the existing social system. Spoken campfire lines are presentation attached to a conversation that already exists.

## Current system to reuse

Current code already provides the full simulation path:

```text
scheduled/idle social opportunity
→ Social Place backed by the settlement campfire
→ socialCandidate()
→ advanceSocialPairing()
→ one paired conversation duration + one relationship outcome
→ beginConversation() on both NPCs
→ existing conversation action lifecycle
```

Relevant ownership:

- `src/ai/socialBehaviour.ts` owns pair selection, the shared conversation duration and relationship outcome.
- `src/ai/NpcAgent.ts` owns each participant's `conversation` action lifecycle and positional `playAt` audio access.
- `src/settlement/createSettlement.ts` already calls `advanceSocialPairing()` once per settlement after NPC updates; do not add another pairing/update pass.
- `src/settlement/places.ts::socialPlaceFor()` already represents the campfire Social Place and uses live availability supplied by settlement fire state.
- `src/ai/npcVoiceLines.ts` currently contains the old empty `NPC_FRIENDLY_TALK_SOUND_URLS` placeholder called from `NpcAgent.beginConversation()`.

## Assets

Current POC assets live flat under `public/sounds/voices/` and use:

```text
campfire_<gender>_<topic>_<question|answer>_<variant>.mp3
```

Current topics:

- `weather`
- `work`
- `road`

Current batch intentionally contains compatible female→male and male→female exchanges only. It does not yet provide a complete male→male or female→female Cartesian set.

The implementation must therefore resolve **whole compatible exchanges**, not independently choose a question and answer.

## Conversation presentation contract

Add one small campfire-talk resolver, preferably:

```text
src/ai/campfireTalk.ts
src/ai/campfireTalk.test.ts
```

It owns static metadata for available spoken exchanges and selects one compatible exchange for two participant genders.

Suggested public shape:

```ts
export type CampfireTalkTopic = 'weather' | 'work' | 'road'

export type CampfireTalk = {
  topic: CampfireTalkTopic
  questionUrl: string
  answerUrl: string
  answerDelaySec: number
}

resolveCampfireTalk(
  questionerGender: NpcGender,
  responderGender: NpcGender,
  rng?: () => number,
): CampfireTalk | undefined
```

Exact internal representation is implementation detail, but the resolver must:

- select from complete authored pairs,
- never synthesize filenames or probe the filesystem/network at runtime,
- return `undefined` when no compatible pair exists,
- accept injectable RNG for deterministic unit tests,
- keep topic/asset selection presentation-only.

Add JSDoc with `@domain npc` on the public resolver.

## Pair ownership and speaker order

The exchange must be selected **once per paired conversation** in `advanceSocialPairing()`, because this is the owner that sees both participants before either `beginConversation()` call.

Do not let each `NpcAgent` independently choose a campfire line; independent selection can produce two questions, mismatched topics or incompatible gender variants.

For V1, the first participant in the already-deterministic pair order is the questioner and the second participant is the responder. Do not add a second speaker-ranking mechanism.

Extend the narrow `SocialParticipant` contract so pairing can see the speaker data required by the resolver (at minimum `gender`) and can pass an optional voice cue into each side's `beginConversation()`.

## Playback sequencing

`WorldAudio.playAt` is fire-and-forget and currently provides no completion callback. Do not redesign the shared audio API for this plan.

V1 uses authored delay metadata:

- question plays immediately when the conversation begins,
- answer is scheduled after `answerDelaySec`,
- the delayed answer is owned by the responder's existing NPC lifecycle and must not fire after the conversation is cancelled/interrupted.

The implementation may use a small participant-local pending conversation voice cue keyed to simulation time. Reuse the existing `NpcAgent.update()` cadence; do not use `setTimeout`, browser timers or a new global audio scheduler.

Clearing/cancellation must follow existing conversation lifecycle boundaries, including early exit, partner release, time-skip reset, death/disposal where relevant, and normal completion.

## Existing friendly-talk placeholder

Do not run the old generic friendly-talk bark in parallel with a structured campfire exchange.

Preferred behaviour:

```text
conversation starts
→ compatible campfire exchange exists?
  → yes: question + delayed answer
  → no: optional existing friendly-talk fallback
    → no clip: silence
```

Keep `NPC_FRIENDLY_TALK_SOUND_URLS` only if it still serves as a genuine fallback/future non-campfire Social Place hook. Do not maintain two foreground voice systems for the same conversation event.

## Relationship and simulation semantics

Do not change:

- `findConversationPartner`,
- `conversationDurationSec`,
- `conversationOutcome`,
- relationship deltas,
- Social Place eligibility,
- schedules/night opportunity logic,
- player/camera-dependent simulation behaviour.

`weather`, `work` and `road` are presentation topics only in this plan. They must not create needs, memories, reputation changes, weather reactions or additional relationship effects.

## Scope

Implementation should touch only the smallest coherent set, expected to include:

- `src/ai/campfireTalk.ts` — new pair resolver/manifest,
- `src/ai/campfireTalk.test.ts` — resolver tests,
- `src/ai/socialBehaviour.ts` — select one exchange at pair creation and pass participant cues,
- `src/ai/socialBehaviour.test.ts` — pairing contract tests,
- `src/ai/NpcAgent.ts` — immediate/delayed cue playback and lifecycle cleanup,
- `src/ai/npcVoiceLines.ts` only if needed to demote/remove the old friendly-talk foreground hook,
- relevant sound documentation if runtime wiring status changes.

`src/settlement/createSettlement.ts`, `src/settlement/places.ts` and `src/audio/createWorldAudio.ts` should remain unchanged unless current code at implementation time contradicts this recon.

## Non-goals

- Runtime TTS / Fish Audio API integration.
- Dynamic text generation.
- Lip sync or subtitle bubbles.
- Player participation in campfire conversations.
- New Social Place types.
- Male→male / female→female audio generation.
- Topic effects on simulation state.
- New conversation manager, event bus, worker or audio scheduler.
- Refactoring generic world audio APIs.

## Verification

Automated:

- resolver returns only complete compatible exchanges,
- female→male and male→female asset pairs resolve,
- unsupported gender direction returns `undefined` instead of mismatched audio,
- injected RNG deterministically selects among compatible variants/topics,
- pairing selects one shared exchange rather than two independent lines,
- question cue is immediate and answer cue is delayed,
- delayed cue is cleared on early conversation exit / partner release,
- existing relationship outcome is still applied exactly once,
- existing social pairing tests remain valid,
- `pnpm type-check`,
- targeted Vitest for `campfireTalk` and `socialBehaviour` / relevant `NpcAgent` tests.

Manual browser verification belongs to the User:

- two compatible opposite-gender NPCs at a lit settlement campfire can pair and produce question → answer audio,
- audio is positional at the speaking NPC,
- same-gender pair still converses normally even if no spoken exchange is available,
- interrupting one participant before the delayed answer prevents stale answer playback,
- relationship/social behaviour remains unchanged aside from presentation audio.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
# Plan: NPC voice full migration and legacy cleanup

**Created:** 2026-09-18
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** M
**Depends on:** npc-044, npc-049
**Domain:** `npc`
**Type:** `refactor`
**Subdomains:** `dialogue`
**Tags:** `voice` `audio` `cleanup` `migration`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Complete the NPC voice migration so all runtime NPC speech uses the semantic Fish Audio voice system and the old Super Dialogue / gender-only bark paths disappear from runtime, code, tests, assets and current documentation.

After this plan:

- `resolveNpcVoiceLine(...)` is the single semantic resolver for ordinary NPC voice events,
- NPCs have a deterministic `voiceProfileId` foundation independent of the removed Super Dialogue actor names,
- existing player-reaction and quest voice moments use semantic intents,
- the old Super Dialogue actor system, legacy reaction/hmm pools, gender-only quest-complete pools and empty friendly-talk fallback are removed,
- obsolete legacy sound files are removed from `public/sounds/`,
- Fish Audio manual browser generation/download is the documented workflow,
- the obsolete Chatterbox tooling draft is removed,
- campfire authored Q/A remains a specialized content resolver, not flattened into bark intents.

This is a migration/cleanup plan. Do not invent new NPC speech events merely because semantic intents or audio files exist.

## Current verified state

The repository currently contains three overlapping NPC voice layers:

1. **Semantic generated voice**
   - `src/ai/npcVoiceLines.ts`
   - `resolveNpcVoiceLine(...)`
   - generated Fish Audio assets under `public/sounds/voices/`
   - dialogue greeting/farewell/confirmation and npc-049 contextual life/world barks already use this direction.

2. **Super Dialogue legacy actor system**
   - `NpcVoiceActor = alex | ian | sean | karen | meghan`
   - `voiceActorForIndex()`
   - actor-keyed greeting/farewell/confirmation/hmm pools
   - still used by legacy fallback and `NpcAgent.playReactionSound()`.

3. **Older gender-only voice pools**
   - `NPC_REACTION_SOUND_URLS`
   - `NPC_QUEST_COMPLETE_SOUND_URLS`
   - old male/female hmm/thank-you assets
   - `QuestManager.playQuestCompleteSound(giverName)` currently derives only gender from giver name.

`NPC_FRIENDLY_TALK_SOUND_URLS` / `pickNpcFriendlyTalkSound()` also remain as an empty legacy fallback around social conversations.

The generated voice catalog already contains semantic material beyond what is wired at runtime, including attention, thanks, refusal, warning, acknowledgement, well-wish and quest events. This plan migrates only existing runtime voice moments; it does not add new behavior for currently unwired semantic intents.

## Product decisions

- Remove Super Dialogue completely from runtime and repository assets.
- Remove old gender-only reaction/hmm/quest-complete runtime paths.
- Existing player `lookAtPlayer` reaction keeps its existing gameplay trigger/chance/cooldown behavior; only voice resolution changes.
- Initial player-reaction mapping:
  - normal → `attention`
  - warm → `greeting`
  - enthusiastic → `greeting`
- Future relationship/reputation-specific reaction clips may refine this without restoring parallel audio pools.
- Existing quest voice moments migrate to semantic intents:
  - offer → `quest_offer`
  - accepted → `quest_accepted`
  - declined → `quest_declined`
  - completed → `quest_complete`
- Do not add semantic voice playback at unrelated call-sites merely because `thanks`, `warning`, `refusal`, etc. exist.
- Campfire authored Q/A remains owned by `campfireTalk.ts`; do not convert its question/answer content into `NpcVoiceSemanticIntent`.
- Campfire may continue using shared NPC spatial playback infrastructure, but must not be forced through `npcBarkLimiter` in a way that can drop the paired answer.
- Fish Audio is the current manual generation source. No runtime TTS, Chatterbox, local ML generator or browser automation is introduced.

## Stage 1 — Introduce deterministic voice profile identity

Replace the legacy actor identity with a reusable generated-voice profile identity.

Add a narrow presentation concept, for example:

```ts
type NpcVoiceProfileId = string
```

and a deterministic resolver/selector based on stable NPC identity and compatible presentation attributes.

Required properties:

- `NpcAgent` exposes `voiceProfileId`, not `voiceActor`.
- Voice profile identity is presentation-only; it must not become personality, profession state or quest state.
- Selection uses existing stable NPC identity plus compatible attributes such as role/gender/age.
- Today a scope may have only one profile; architecture must still support multiple profiles later without reintroducing hard-coded actor fields into `NpcAgent`.
- Keep profile definitions separate from semantic line intent.
- Existing role fallback remains valid: professions without a dedicated Fish Audio profile may use compatible general profiles.
- Do not create one unique audio file set per NPC.

The resolver input should become approximately:

```ts
type NpcVoiceResolveInput = {
  id: string
  gender: NpcGender
  role: Role
  age: number
  voiceProfileId: NpcVoiceProfileId
}
```

The exact profile data shape should stay minimal and data-driven.

## Stage 2 — Make semantic resolver legacy-free

Refactor `src/ai/npcVoiceLines.ts` so `resolveNpcVoiceLine(...)` no longer falls back to Super Dialogue.

Remove:

- `NpcVoiceActor`,
- `NPC_VOICE_ACTORS`,
- `voiceActorForIndex()`,
- actor-specific `voiceLinePool(...)` legacy infrastructure where no longer used,
- `NPC_GREETING_SOUND_URLS`,
- `NPC_FAREWELL_SOUND_URLS`,
- `NPC_CONFIRMATION_SOUND_URLS`,
- `NPC_HMM_VOICE_URLS`,
- `NPC_REACTION_SOUND_URLS`,
- `NPC_QUEST_COMPLETE_SOUND_URLS`,
- legacy greeting/farewell/confirmation pickers,
- `NPC_FRIENDLY_TALK_SOUND_URLS`,
- `pickNpcFriendlyTalkSound()`,
- `pickLegacyVoiceLine()`.

Required resolution direction:

```text
semantic event
+ NPC identity
+ voice profile / role / gender / age
→ static generated manifest
→ URL or undefined
```

Missing generated audio must result in silence for that voice event, not a fallback to the removed packs and never a simulation change.

Keep the existing static/no-network runtime contract.

## Stage 3 — Migrate player approach/reaction voice

Keep the existing reaction decision logic, social chance, relation tier, crowd/group suppression and cancelable playback behavior.

Change only voice selection.

`NpcAgent.playReactionSound(tier)` should resolve the selected semantic intent through the shared voice resolver rather than selecting from legacy pools.

Preserve:

- one reaction per existing `lookAtPlayer` transition,
- existing `ReactionTier` computation,
- cancelable playback,
- `stopPlayerReactionVoice()` so opening dialogue can cut an in-flight reaction,
- current spatial playback semantics and volume unless a concrete bug is found.

Do not add new relationship/reputation simulation. A later plan may add dedicated relationship/reputation voice variants behind the same semantic/profile mechanism.

## Stage 4 — Migrate all existing quest voice moments

Remove the special gender-only quest-complete path.

`QuestManager` must no longer infer a voice from `giverName` using `genderForName()` for audio.

Provide QuestManager only the narrow NPC voice identity lookup/callback it needs. Preserve dependency direction: QuestManager must not import or own `NpcAgent` runtime state.

Preferred ownership:

```text
QuestManager owns quest progression
→ emits/requests semantic quest voice for a stable NpcId
→ injected world/UI voice identity resolver finds current NPC voice presentation
→ resolveNpcVoiceLine(...)
→ shared NPC voice playback
```

Use the real stable giver/target NPC id already present in quest data/progress wherever available. Do not pass whole NPC instances into QuestManager.

Wire existing quest voice moments only:

- quest presented/offered → `quest_offer` where an existing voice moment exists,
- accepted → `quest_accepted`,
- player decline → `quest_declined`,
- completion/turn-in → `quest_complete`.

Avoid duplicate playback when the dialogue store already owns the same transition. One semantic event should have one presentation owner.

## Stage 5 — Preserve campfire as specialized authored conversation

Keep:

- `src/ai/campfireTalk.ts`,
- topic/question/answer pairing,
- speaker-gender compatibility,
- delayed answer sequencing,
- interruption/cancellation semantics from npc-045.

Remove only the old empty generic friendly-talk fallback.

Do not route the paired Q/A through `npcBarkLimiter` if doing so can accept the question and reject the answer.

It is valid to reuse the same shared spatial NPC voice playback helper underneath.

## Stage 6 — Manifest and asset coverage required for migrated events

Before deleting legacy assets, verify that each migrated runtime event has a generated Fish Audio path for the NPC categories that currently need to speak.

At minimum verify coverage/fallback for:

- general male/female player reaction intents,
- general male/female greeting/farewell/confirmation paths already used by dialogue,
- guard/hunter/merchant overrides already present,
- quest offer/accepted/declined/complete for current quest-giver categories,
- npc-049 contextual bark intents already wired,
- shepherd livestock-danger and guard-response paths already wired.

Do not create a full role × gender × age Cartesian asset matrix.

Professions without dedicated voice profiles should resolve through compatible general profiles.

If a required Fish Audio asset is genuinely absent, record the missing file explicitly in `docs/assets/SOUNDS.md` / voice catalog and keep that event silent until the file is manually supplied. Do not retain legacy audio just to hide missing coverage.

## Stage 7 — Physical legacy asset cleanup

After runtime references are gone, remove obsolete legacy files from `public/sounds/`, including the old Super Dialogue greeting/farewell/confirmation/hmm/thank-you material and the older gender-only reaction/thank-you files that no longer have consumers.

Do not delete:

- current Fish Audio files under `public/sounds/voices/`,
- currently used campfire Fish Audio,
- reference/provenance material that is intentionally retained and legally appropriate,
- unrelated NPC/action/audio assets.

Update `public/sounds/README.md` to remove claims that deleted pools are wired or available as fallback.

## Stage 8 — Documentation cleanup

Update current documentation so it describes the post-migration architecture, not historical transitions.

At minimum inspect/update:

- `docs/dialogue/NPC-VOICE-CATALOG.md`,
- `docs/dialogue/README.md` if present/relevant,
- `docs/assets/SOUNDS.md`,
- `public/sounds/README.md`,
- `docs/state/npc.md`,
- current voice plan cross-references where they claim Super Dialogue remains a runtime fallback.

Historical archived plans may remain historical, but current docs must clearly mark old Super Dialogue work as obsolete.

Delete:

```text
docs/plans/tools-015-chatterbox-local-voice-generation-pipeline.md
```

because Chatterbox is no longer the intended workflow.

Document the actual workflow:

```text
canonical voice catalog
→ manually generate/select in Fish Audio browser
→ download clip
→ normalize/name/place under public/sounds/voices/
→ update manifest + source/provenance docs
→ test runtime
```

Do not introduce Fish Audio API integration or automated scraping/download.

## Files/systems expected to change

Primary:

- `src/ai/npcVoiceLines.ts`
- `src/ai/NpcAgent.ts`
- `src/ai/npcBarkRequest.ts`
- `src/quests/QuestManager.ts`
- `src/ui-vue/store.ts`
- `src/audio/npcVoicePlayback.ts` only if a small shared playback seam is required
- relevant voice/dialogue/quest tests
- `public/sounds/`
- `public/sounds/voices/` manifest references
- current NPC voice/audio docs
- `docs/plans/tools-015-chatterbox-local-voice-generation-pipeline.md` deletion

Also inspect composition/injection call-sites that construct QuestManager or configure NPC audio; extend existing seams instead of adding global managers.

## Guardrails

- No new voice manager God Object.
- No runtime TTS.
- No Fish Audio API/runtime dependency.
- No Chatterbox/Python tooling.
- No new gameplay voice events beyond migration of existing ones.
- No duplicated quest state in voice code.
- No whole `NpcAgent` dependency inside QuestManager.
- No behavior/simulation consequence from missing audio.
- No player-centric simulation changes.
- No migration of campfire authored content into generic semantic bark slots.
- Preserve spatial playback and cancellation semantics.
- Keep static asset manifests; never probe filesystem/network at runtime.
- Do not run `pnpm docs:sync`.

## Verification

Automated:

- resolver tests cover profile-specific → role/general fallback and no legacy fallback,
- player-reaction tests verify semantic resolution and cancelable stop behavior,
- bark limiter/request tests compile without `voiceActor`,
- dialogue voice tests compile/use `voiceProfileId`,
- quest tests cover offer/accepted/declined/complete semantic callbacks without name→gender guessing,
- repo search finds no runtime references to:
  - `NpcVoiceActor`
  - `voiceActorForIndex`
  - legacy `NPC_*_SOUND_URLS` voice pools
  - `pickNpcFriendlyTalkSound`
  - deleted Super Dialogue asset filenames,
- `pnpm type-check`,
- relevant Vitest suites,
- build if touched composition code requires it.

Manual browser verification by the User:

- approach neutral/warm/enthusiastic NPCs and hear the expected Fish Audio reaction family,
- opening dialogue cuts an in-progress approach reaction and plays Fish Audio greeting,
- farewell and confirmation remain correct,
- guard/hunter/merchant/general NPCs resolve expected voices,
- quest offer/accept/decline/complete voice moments play once and from the correct NPC,
- contextual npc-049 barks still work,
- campfire question/answer pairing still works,
- no old Super Dialogue/hmm/thank-you clips are heard.

Add JSDoc to new public/architectural voice-profile and quest-voice integration functions where it materially improves preflight discovery; use `@domain npc` / `@domain quests-progression` as appropriate.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

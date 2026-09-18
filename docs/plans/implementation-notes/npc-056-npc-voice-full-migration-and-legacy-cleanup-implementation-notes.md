# Implementation Notes: npc-056 — NPC voice full migration and legacy cleanup

**Plan:** `docs/plans/npc-056-npc-voice-full-migration-and-legacy-cleanup.md`
**Reviewed:** 2026-09-18
**Source:** current `main` + targeted NPC voice/dialogue/quest/audio recon

## 1. Current ownership and the legacy split

`src/ai/npcVoiceLines.ts` currently mixes the new semantic Fish Audio resolver with both legacy systems.

New/current direction in that file:

- `NpcVoiceSemanticIntent`
- `NpcVoiceAgeBand`
- `NpcVoiceResolveInput`
- `voiceAgeBandForAge()`
- `voiceScopeForRole()`
- `GENERATED_VOICE_MANIFEST`
- `buildNpcVoiceLookupKeys()`
- `resolveNpcVoiceLine()`
- `resolveNpcVoiceLineWithManifest()`

Legacy still co-located there:

- `NpcVoiceActor`
- actor pool `alex | ian | sean | karen | meghan`
- `voiceActorForIndex()`
- Super Dialogue actor-keyed pools/pickers
- gender-only reaction pools
- gender-only quest-complete pools
- empty friendly-talk pools/picker
- `pickLegacyVoiceLine()` final fallback.

Do not create a second voice resolver. Shrink this file toward semantic/profile data + resolution only.

## 2. NpcAgent is the main legacy runtime consumer

`src/ai/NpcAgent.ts` currently imports:

- `NPC_GREETING_SOUND_URLS`
- `NPC_HMM_VOICE_URLS`
- `NPC_QUEST_COMPLETE_SOUND_URLS`
- `NPC_REACTION_SOUND_URLS`
- `NpcVoiceActor`
- `pickNpcFriendlyTalkSound`
- `voiceActorForIndex`

and stores:

```ts
readonly voiceActor: NpcVoiceActor
```

assigned at construction from `treeIndex`.

`playReactionSound(tier)` is the critical active legacy call-site:

- warm → legacy greeting actor pool,
- enthusiastic → legacy quest-complete gender pool,
- normal → legacy reaction + actor hmm pool.

The trigger is inside the existing `lookAtPlayer` transition after the existing social/group-suppression chance. Preserve that logic exactly; replace only URL selection.

`playerReactionVoice` uses the cancelable spatial playback seam and `stopPlayerReactionVoice()` is called when dialogue opens. Keep this lifecycle.

## 3. Dialogue store already uses the semantic resolver

`src/ui-vue/store.ts` is already mostly on the target architecture:

- dialogue open calls `resolveNpcVoiceLine(npc, 'greeting')`,
- close resolves `quest_declined` or `farewell`,
- playback is spatial through the shared NPC voice callback,
- opening dialogue calls `npc.stopPlayerReactionVoice()`.

Do not reintroduce picker functions here.

Tests currently mock `voiceActor`; they will need the new `voiceProfileId` shape.

Also note: `selectNpcDialogueHelpAction` intentionally has no generic automatic confirmation voice because an arbitrary quest action is not necessarily an NPC confirmation. Preserve that semantic distinction.

## 4. QuestManager is the other major exception

`src/quests/QuestManager.ts` currently imports:

```ts
genderForName
NPC_QUEST_COMPLETE_SOUND_URLS
```

and `playQuestCompleteSound(giverName)`:

1. derives gender from the giver's name,
2. randomly picks from the gender-only pool,
3. plays the clip.

This is explicitly the old workaround documented in plan 116.

Do not solve migration by importing `NpcAgent` into QuestManager.

Quest data already carries stable giver identity (`giverNpcId` appears in quest-facing types). Extend/inject a narrow voice presentation seam keyed by stable `NpcId` or emit a semantic voice event that composition/UI resolves.

Preferred integration is a callback/type owned at the boundary, conceptually:

```ts
type QuestNpcVoiceRequest = (npcId: NpcId, intent: QuestVoiceIntent) => void
```

or an equivalent narrow lookup + playback pair.

The exact seam should match existing QuestManager constructor/configuration style discovered during implementation, but must not make quests own NPC runtime objects.

## 5. Quest semantic event ownership must avoid duplicates

Existing dialogue code already owns some close/accept presentation.

Before wiring each quest semantic intent, trace the exact transition owner:

- offer surfaced,
- offer accepted,
- offer declined,
- outcome completed/turned in.

Ensure one owner per voice moment.

In particular, current dialogue close can already resolve `quest_declined`; do not add a second QuestManager playback for the same decline if the UI path already fires it.

The plan requires all existing quest voice moments to use semantic intents, not that every quest transition gains a new sound.

## 6. Voice profile foundation

The old actor names are pack-specific and must not survive as the new identity abstraction.

Add a profile catalog/selector near the semantic voice resolver, not in simulation/quest state.

The initial profiles can represent the Fish Audio identities already documented in `docs/dialogue/NPC-VOICE-CATALOG.md`, for example compatible IDs such as:

- general male,
- general female,
- guard male,
- hunter male,
- merchant female,
- shepherd male.

Use repository naming conventions discovered during implementation; do not copy these labels mechanically if a better stable ID scheme already exists.

Important separation:

```text
voiceProfileId = who/how this NPC sounds
semantic intent = what presentation event is being spoken
role/gender/age = compatibility/fallback context
```

Profile selection should be deterministic from stable NPC identity/context. It does not need save persistence if it is fully derived and stable, but do not make it depend on ephemeral array order or random runtime state.

Future addition of profiles should not require adding pack-specific fields back to `NpcAgent`.

## 7. Generated manifest coverage currently differs from catalog coverage

Verified runtime manifest coverage includes, among others:

- general female: greeting, farewell,
- general male: greeting, farewell,
- merchant female: greeting, farewell, confirmation, thanks,
- guard male: greeting, farewell, attention, refusal, thanks, quest accepted/declined/complete,
- hunter male: greeting, farewell, confirmation, attention, thanks, warning, well-wish, quest offer/accepted/declined/complete,
- contextual npc-049 intents for general/guard/hunter/shepherd subsets.

`docs/dialogue/NPC-VOICE-CATALOG.md` documents more intended Fish Audio lines than the runtime manifest currently lists.

During implementation, verify actual files in `public/sounds/voices/` before adding manifest entries. Repository files are truth; catalog text alone does not prove an asset exists.

Do not synthesize filenames or probe at runtime.

## 8. Bark path should lose voiceActor only

`src/ai/npcBarkRequest.ts` currently defines:

```ts
npc: Pick<NpcVoiceResolveInput, 'id' | 'gender' | 'role' | 'age' | 'voiceActor'>
```

Once the resolver moves to `voiceProfileId`, update this narrow input accordingly.

Do not change:

- limiter policy semantics,
- area budgets,
- per-intent cooldowns,
- npc-049 event triggers,
- `livestock_danger` semantic fallback to `danger_alert` if still required.

This plan is not a bark-behavior retune.

## 9. Campfire is not legacy semantic voice

`src/ai/campfireTalk.ts` is a valid specialized authored conversation system:

- explicit topics,
- paired question/answer,
- gender compatibility,
- authored delays,
- static Fish Audio URLs.

Keep it.

The old `NPC_FRIENDLY_TALK_SOUND_URLS` / `pickNpcFriendlyTalkSound()` fallback is the cleanup target, not `campfireTalk.ts`.

Do not force campfire through `npcBarkLimiter`; the delayed answer must not disappear because a bark budget was consumed by the question.

## 10. Shared playback

`src/audio/npcVoicePlayback.ts` already exists specifically as shared spatial NPC voice playback for npc-044 dialogue + npc-049 barks.

Reuse it where practical.

Do not create another audio bus or large voice manager.

If quest voice needs a new composition seam, prefer a thin injected callback that ultimately uses the same playback helper.

## 11. Asset cleanup procedure

Do asset deletion after code/test migration, not before.

Use repo search to build the exact deletion set from files that:

1. belong to old Super Dialogue or old gender-only reaction/thank-you systems,
2. have zero runtime consumers after migration,
3. are not intentionally retained reference/provenance assets.

Then update `public/sounds/README.md`.

Current generated Fish Audio under `public/sounds/voices/` is not legacy even when its semantic intent overlaps an old pack category.

## 12. Documentation discrepancy to resolve

Current docs still describe Super Dialogue as a legacy fallback in places including:

- `docs/assets/SOUNDS.md`,
- `public/sounds/README.md`,
- voice plan notes/state docs.

After migration, current documentation should state that missing Fish Audio resolves to silence, not old-pack fallback.

`docs/plans/tools-015-chatterbox-local-voice-generation-pipeline.md` is a draft based on an abandoned direction. Delete it as part of implementation.

The canonical practical generation workflow is manual Fish Audio browser generation/download. No Fish API/tooling work is required.

Historical archived plans can remain unchanged except where current navigation falsely presents them as active truth.

## 13. Tests already tied to the legacy field

At minimum inspect/update:

- `src/ai/npcVoiceLines.test.ts`
- `src/ai/npcBarkLimiter.test.ts`
- `src/ai/npcPlayerReactionVoice.test.ts`
- `src/ui-vue/npcDialogueVoice.test.ts`
- `src/ui-vue/npcDialogueTrade.test.ts`
- `src/ui-vue/npcDialogueOpen.test.ts`
- QuestManager tests that cover completion/offer transitions.

Several test fixtures currently provide `voiceActor: 'alex'` / `'karen'`.

Replace with the new profile identity rather than leaving compatibility aliases.

Add negative coverage proving no legacy fallback occurs when the generated manifest has no matching line.

## 14. Suggested implementation order

1. Introduce profile ID/catalog/selector and update `NpcVoiceResolveInput`.
2. Update generated resolver/tests to remove legacy fallback.
3. Update `NpcAgent` identity + player reaction voice.
4. Update bark request/tests.
5. Migrate quest voice via narrow injected identity/playback seam.
6. Reconcile dialogue quest transitions to prevent duplicate quest voice.
7. Remove friendly-talk fallback while preserving campfire Q/A.
8. Run targeted tests/type-check.
9. Repo-search for all legacy symbols/files.
10. Delete unused legacy audio.
11. Update current docs and delete tools-015.
12. Final repo-search + tests/type-check/build as appropriate.

This order keeps the project compiling in small steps and postpones destructive asset deletion until runtime ownership is fully migrated.

## 15. Key guardrails for the implementing agent

- Current code beats old plans.
- Migration only: do not add new speech triggers for currently unwired semantic intents.
- No runtime Fish Audio integration.
- No Chatterbox tooling.
- No direct `NpcAgent` dependency from QuestManager.
- No random voice selection per playback.
- Missing asset must remain presentation-only silence.
- Preserve cancelable player-reaction behavior.
- Preserve npc-049 limiter behavior.
- Preserve campfire paired sequencing.
- Do not run browser verification.
- Do not run `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

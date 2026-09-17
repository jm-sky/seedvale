# Plan: Chatterbox NPC voice proof of concept

**Created:** 2026-09-16
**Status:** `done` ✅
**Type:** feature
**Priority:** high · **Effort:** XS
**Depends on:** none
**Domain:** `npc`
**Subdomains:** `dialogue`
**Tags:** `voice` `audio` `chatterbox`
**Roadmap:** -

## Goal

Validate whether locally generated Chatterbox speech is good enough for Seedvale NPC dialogue before investing in a larger voice/dialogue catalog.

The POC must reuse the existing NPC voice playback path rather than introducing a second audio system. Chatterbox is an offline asset-generation tool only; it is not a runtime dependency of the game.

## Current mechanism to reuse

- `src/ai/npcVoiceLines.ts` owns the current NPC voice-line pools and per-NPC deterministic `NpcVoiceActor` assignment.
- Existing runtime hooks already cover greeting, farewell and confirmation.
- `src/ui-vue/store.ts` triggers greeting/farewell/confirmation through the configured NPC voice playback callback.
- `src/app/createApp.ts` wires NPC voice playback into `worldAudio.playAt`.
- `public/sounds/README.md` is the source/license inventory for shipped sound files.

Do not add another NPC audio manager, bus or dialogue playback channel.

## Test material

Generate one coherent test voice and exactly six short English lines that map to wording already represented by the current voice categories:

| Category | Phrase |
|---|---|
| greeting | `Hello.` |
| greeting | `Welcome.` |
| farewell | `Goodbye.` |
| farewell | `Take care.` |
| confirmation | `Yes.` |
| confirmation | `Alright.` |

The reference voice and generation settings are chosen manually for this POC. The purpose is to judge realism, tone and fit with Seedvale, not to automate voice design.

## Scope

1. Generate the six lines locally with Chatterbox from one selected legal reference voice.
2. Convert/export them to the format already used by NPC voice assets in `public/sounds/` (mono OGG, matching the existing repository convention).
3. Wire the POC clips through the existing `npcVoiceLines.ts` pools without changing dialogue lifecycle semantics.
4. Keep the change trivially removable/reversible if the voice is rejected.
5. Record source/reference provenance and Chatterbox generation notes next to the sound inventory so the test can be reproduced.

## Constraints

- No Chatterbox package/model inside the browser application.
- No network/API dependency at runtime.
- No new audio bus or playback abstraction.
- Do not redesign `NpcVoiceActor` in this POC.
- Do not migrate dialogue text to English here beyond the six spoken test phrases.
- Generated clips must have a reference/source whose use is legally safe for the intended project use.

## Success criteria

Manual browser verification by the user should answer:

- Does the voice sound sufficiently human and believable in-game?
- Is the accent/style appropriate for Seedvale?
- Do short lines avoid obvious TTS artefacts?
- Does the voice remain consistent across all six phrases?
- Is generation simple enough to repeat for many voices/lines?

If the result is accepted, continue with `npc-042` rather than expanding this POC.

## Verification

Automated:

- `pnpm typecheck` / repository equivalent if source wiring changes.
- Existing audio/voice tests if affected.
- Build verifies all referenced asset paths.

Manual browser verification is performed by the user: open/close NPC dialogue and accept an offer until all six POC phrases have been heard.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

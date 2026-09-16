# Plan: NPC voice and dialogue catalog infrastructure

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** infrastructure
**Priority:** high · **Effort:** M
**Depends on:** npc-041
**Domain:** `npc`
**Subdomains:** `dialogue`
**Tags:** `voice` `dialogue` `audio` `documentation`
**Roadmap:** -

## Goal

Create one maintainable source of truth for NPC spoken content and voice assets so Seedvale can scale from a few universal barks to profession-specific and quest-specific dialogue without duplicating text, filenames or playback rules.

This plan is documentation/data infrastructure first. It does not introduce runtime TTS.

## Existing mechanisms to reuse

- `src/ai/npcVoiceLines.ts` already owns runtime voice pools and deterministic per-NPC voice assignment.
- `src/ui-vue/store.ts` already owns dialogue-panel voice trigger moments.
- `public/sounds/` remains the shipped runtime asset location.
- `public/sounds/README.md` remains the authoritative source/license inventory for actual audio files.
- `docs/assets/SOUNDS.md` remains the backlog/status index for required sounds.

The new catalog must describe and feed these mechanisms rather than replacing them.

## Required documentation structure

Create a dedicated NPC dialogue/voice documentation area, for example:

```text
docs/dialogue/
  README.md
  NPC-DIALOGUE-CATALOG.md
  NPC-VOICE-GUIDE.md
```

Exact filenames may adapt to repository conventions discovered during implementation, but ownership must remain clear:

- `README.md` — navigation, terminology and editing rules.
- dialogue catalog — canonical list of spoken/text dialogue needs.
- voice guide — voice archetypes, reference-audio rules, generation/export/naming instructions.

Do not duplicate license/source attribution from `public/sounds/README.md`; link to it.

## Dialogue catalog model

The catalog must separate three content layers:

### A. Universal NPC dialogue

Reusable by most NPCs regardless of profession:

- greeting,
- farewell,
- thanks,
- confirmation/agreement,
- refusal/negative response,
- attention/callout,
- generic positive reaction,
- generic negative/warning reaction.

Each semantic slot may have several textual variants, but every variant needs a stable semantic identity independent from the final filename.

### B. Profession dialogue

Reusable by any NPC of a profession, for example:

- Blacksmith,
- Hunter,
- Merchant/Trader,
- Guard,
- Farmer,
- Woodcutter,
- Miner,
- Fisher,
- Shepherd,
- Textile worker,
- other implemented professions found during recon.

For each profession distinguish at least:

- greeting/context lines,
- work/activity reactions,
- trade/service lines where applicable,
- warnings/advice,
- generic profession problem/need lines.

Profession content must describe actual implemented profession/world concepts where possible; avoid decorative lines that contradict simulation state.

### C. Key / authored NPC dialogue

Maintain an explicit list of important authored NPCs and their additional dialogue needs.

For each key NPC capture:

- identity and role,
- voice profile/archetype,
- universal lines inherited from the general pool,
- profession lines inherited from the profession pool,
- character-specific lines,
- quest-specific lines grouped by quest/quest stage,
- optional world-state conditions relevant to delivery.

Quest-specific dialogue must point to actual quest IDs/data rather than creating a second quest-state model in the voice documentation.

## Key NPC baseline

Start the catalog with at least the current important/authored NPCs discovered in code and active quest plans. Include Blacksmith and Hunter-oriented content as reference examples because they exercise both trade/profession and quest/world-state dialogue.

Implementation recon must enumerate the actual authored/reserved NPCs and quest givers before finalizing the list; do not infer implementation from roadmap plans alone.

## Voice profile catalog

Define reusable voice profiles separately from individual NPC text. A profile should capture only useful generation traits, for example:

- perceived age band,
- gender/voice presentation,
- vocal weight/timbre,
- accent/region style,
- pace,
- temperament/energy,
- reference-audio provenance,
- Chatterbox generation settings that materially affect consistency.

Avoid one voice model per line. A key NPC should keep one stable voice profile; generic NPCs may draw deterministically from compatible profiles.

## Runtime asset directory and naming rules

Keep runtime files below `public/sounds/`, but stop relying on an ever-growing flat filename namespace for new generated dialogue.

Adopt a predictable hierarchy for new NPC voice assets, e.g.:

```text
public/sounds/npc/
  common/<voice-profile>/<semantic-id>-NN.ogg
  profession/<profession>/<voice-profile>/<semantic-id>-NN.ogg
  quest/<quest-id>/<npc-id>/<semantic-id>-NN.ogg
```

The exact path shape may be adjusted if Vite/audio loading constraints make another structure preferable, but it must preserve:

- stable semantic IDs,
- clear ownership (`common` / `profession` / `quest`),
- stable voice profile identity,
- multiple variants without ambiguous filenames.

Document conversion/export requirements and recommended source/reference storage policy. Do not ship large model checkpoints or generator environments inside game assets.

## Generation instructions

Document a repeatable local Chatterbox workflow covering:

1. selecting/legal-checking reference audio,
2. preparing a clean reference clip,
3. generating a line,
4. keeping settings consistent for one voice profile,
5. trimming/normalizing only where needed,
6. converting to repository audio format,
7. placing/naming the runtime file,
8. recording source/reference attribution/provenance,
9. updating the dialogue catalog and runtime pool mapping.

The instructions should be usable manually first; generation automation is optional future work, not required here.

## Runtime integration direction

Refactor `src/ai/npcVoiceLines.ts` only as much as necessary to consume the organized catalog/assets without creating parallel dialogue ownership.

Preferred direction:

```text
semantic dialogue event
  + NPC identity/profession/voice profile
  -> eligible voice-line asset pool
  -> existing world audio playback
```

Do not encode quest progression inside the audio resolver. Quest/dialogue systems decide which semantic line/event is appropriate; the voice layer resolves audio for that already-selected content.

## Non-goals

- Runtime speech synthesis.
- LLM-generated live dialogue.
- Lip sync.
- Replacing the quest system.
- Full localization framework.
- Migrating all existing Polish text to English — owned by `npc-043`.

## Verification

Automated:

- typecheck/build/tests for any runtime mapping changes,
- asset-path validation if an existing repository mechanism exists or can be cheaply extended.

Manual browser verification by the user:

- at least one generic NPC,
- one Blacksmith-like profession path,
- one Hunter-like profession/quest path,
- stable voice for the same NPC across multiple lines.

Add JSDoc to any new architectural/public resolver functions that materially help preflight discover ownership; use `@domain npc` where useful.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

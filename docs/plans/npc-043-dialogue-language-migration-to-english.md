# Plan: Dialogue language migration to English

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** refactor
**Priority:** high · **Effort:** L
**Depends on:** npc-042
**Domain:** `npc`
**Subdomains:** `dialogue`
**Tags:** `dialogue` `english` `localization`
**Roadmap:** -

## Goal

Migrate player-facing NPC dialogue content from Polish to English so written dialogue and generated English voice assets share one canonical language and do not drift apart.

This plan covers NPC/dialogue-facing text, not a blanket translation of the entire UI/application.

## Why this is separate

English voice generation has materially better reference-voice availability and TTS quality/options. Migrating dialogue first lets Seedvale use one authored English line as the source for both on-screen dialogue and spoken asset generation.

The migration must not create a second dialogue/content system. Existing quest, profession, relationship and dialogue-action ownership remains unchanged.

## Scope discovery

Before editing, identify all player-facing dialogue strings from current code, including at minimum:

- `src/ui-vue/NpcDialogueMenu.vue`,
- `src/ui-vue/store.ts`,
- `src/ai/` dialogue/social helpers,
- `src/quests/QuestManager.ts`, `src/quests/quests.ts` and authored quest modules/data,
- settlement/authored NPC modules that provide dialogue/action text,
- profession/trade interaction prompts that are presented as NPC speech,
- active plans already introducing authored dialogue that would otherwise land in Polish.

Do not translate labels that are merely UI chrome unless they are semantically part of NPC dialogue. A broader whole-application language migration should be planned separately if later desired.

## Canonical language rule

After this plan, newly authored NPC dialogue is English-first.

For any line that also has voice audio:

```text
canonical dialogue text
  -> semantic dialogue ID from npc-042
  -> generated voice asset variant(s)
```

Do not maintain an unrelated transcription inside filenames, audio code comments or a second spreadsheet/document.

## Migration strategy

### 1. Inventory and classify

Classify current NPC-facing strings into:

- universal/general dialogue,
- profession dialogue,
- authored/key-NPC dialogue,
- quest-specific dialogue,
- interaction/UI labels that are not spoken dialogue.

Map the first four categories into the catalog introduced by `npc-042` where applicable.

### 2. Translate meaning, not syntax

English lines should preserve gameplay meaning, conditions, choices and consequences, but should be concise and natural for spoken dialogue.

Prefer short game-dialogue English over literal Polish translations. Avoid modern slang or wording that clashes with Seedvale's setting.

### 3. Preserve runtime contracts

Translation must not change:

- quest IDs,
- objective IDs,
- NPC IDs,
- action IDs,
- profession/role IDs,
- state-machine conditions,
- relationship/reputation effects,
- trade or quest availability logic.

Only player-facing text/content changes unless a small structural extraction is required to establish one canonical dialogue source.

### 4. Align voice-triggered lines

Existing generic voice categories in `src/ai/npcVoiceLines.ts` already use English concepts such as greeting/farewell/confirmation. Ensure visible dialogue and spoken assets no longer create obvious Polish/English mismatches at the same interaction moment.

### 5. New-content guardrail

Update the relevant dialogue documentation/contributor instructions so future NPC/quest dialogue is authored in English by default and cataloged using the infrastructure from `npc-042`.

## Localization decision

Do **not** introduce a full i18n framework solely for this migration unless recon shows one already exists or the current hard-coded text structure makes extraction necessary for correctness.

The immediate target is one canonical English dialogue language. A future Polish localization can be layered on top deliberately rather than retaining mixed-language source text now.

## Non-goals

- Translating every menu/HUD/settings string in Seedvale.
- Runtime machine translation.
- LLM-generated live dialogue.
- Rewriting quest mechanics or outcomes.
- Regenerating every voice asset in the same implementation unless explicitly required by the migrated line set.

## Verification

Automated:

- typecheck,
- tests covering dialogue/quest actions,
- build,
- targeted search for remaining Polish NPC-dialogue strings in the migrated scope.

Manual browser verification by the user should cover:

- opening/closing ordinary NPC dialogue,
- trade/service dialogue,
- at least one profession-specific interaction,
- at least one active quest chain with choices/turn-in,
- spoken generic lines matching the English presentation context.

Any remaining Polish player-facing text should be classified explicitly as either outside dialogue scope or a migration miss; do not silently leave mixed-language dialogue.

Add JSDoc to any new architectural/public dialogue-source functions introduced during extraction when useful for preflight discovery; use `@domain npc` where useful.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

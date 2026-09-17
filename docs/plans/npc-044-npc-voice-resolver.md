# Plan: NPC hierarchical voice resolver

**Created:** 2026-09-17
**Status:** `verification needed` 🔍 — implemented 2026-09-17 (`vitest` npcVoiceLines + `type-check`). Browser/manual verification not performed — belongs to the User.
**Type:** feature
**Priority:** high · **Effort:** S
**Depends on:** -
**Domain:** `npc`
**Subdomains:** `dialogue`
**Tags:** `voice` `audio`
**Roadmap:** -
**Model:** Composer, Sonnet
**Implemented at:** 2026-09-17 10:09

## Goal

Resolve spoken NPC voice clips from semantic intent + NPC identity via a static hierarchical manifest, while reusing the existing dialogue playback path and keeping the Super Dialogue Audio Pack as legacy fallback for greeting/farewell/confirmation.

Spoken samples are English; visible dialogue text stays Polish. No runtime TTS or Chatterbox in the app.

## Existing mechanisms to reuse

- [`src/ai/npcVoiceLines.ts`](../src/ai/npcVoiceLines.ts) — voice pools, `NpcVoiceActor`, pickers
- [`src/ui-vue/store.ts`](../src/ui-vue/store.ts) — dialogue open/close/accept voice triggers + `playNpcVoice`
- [`src/ai/characters.ts`](../src/ai/characters.ts) — `NpcGender`, `Role` (no duplicate enums)
- [`src/settlement/npcPhysicalProfile.ts`](../src/settlement/npcPhysicalProfile.ts) — `lifeStageForAge` for presentation age-band derivation only
- Assets remain flat under `public/sounds/voices/` (do not move into a nested hierarchy in this plan)

## Product decisions (supersede older voice-plan assumptions)

- Generated assets live in `public/sounds/voices/` (`.wav` / `.mp3` URLs as shipped)
- Naming: `<scope>_<gender>_[<age>]_<semantic-keyword>_<variant>.ext` or `npc_<npc-id>_<semantic-keyword>_<variant>.ext`
- Simulation role `trader` maps to voice scope `merchant`
- Semantic intents for this plan: `greeting`, `farewell`, `confirmation`, `quest_declined`
- Filename keyword for confirmation assets may be `agree`; resolver intent stays `confirmation`

## Public API

```ts
resolveNpcVoiceLine(npc, semanticIntent): string | undefined
```

Caller supplies NPC identity/context + semantic event. Resolver owns profession/gender/age-band hierarchy, manifest lookup, variant pick, and legacy fallback.

Prefer a small resolve input (`id`, `gender`, `role`, `age`, `voiceActor`) over importing `NpcAgent`.

## Fallback hierarchy

1. specific NPC
2. profession + gender + age band
3. profession + gender
4. general + gender + age band
5. general + gender
6. legacy `voiceActor` pool (greeting / farewell / confirmation only)
7. `undefined`

Voice age band is presentation-only: `young | old | null`, derived from `lifeStageForAge` (not a new lifecycle state).

## Integration

- Dialogue greeting / confirmation → `resolveNpcVoiceLine`
- Dialogue close: offer present → `quest_declined`; otherwise → `farewell`
- Do not migrate quest-complete / reaction / hmm / friendly-talk in this plan

## Non-goals

- Runtime TTS / Chatterbox in the browser
- Migrating Polish dialogue text to English
- New audio bus or voice manager
- Network/filesystem asset probing
- Moving existing files into a nested directory tree
- Wiring `thanks` / `attention` / `refusal` without call-sites

## Verification

- Unit tests for resolver hierarchy (no audio/network)
- `pnpm type-check`
- No browser automation in this task

## Implementation notes

See [`implementation-notes/npc-044-npc-voice-resolver-implementation-notes.md`](./implementation-notes/npc-044-npc-voice-resolver-implementation-notes.md).

Add JSDoc with `@domain npc` on the public resolver.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

# Implementation Notes: npc-044 — NPC hierarchical voice resolver

**Plan:** `docs/plans/npc-044-npc-voice-resolver.md`  
**Reviewed:** 2026-09-17  
**Source:** current `main` + plan recon

## Ownership

- Voice pools / selection: `src/ai/npcVoiceLines.ts` (extend; do not create a manager)
- Dialogue trigger moments + `playNpcVoice`: `src/ui-vue/store.ts`
- Types: `NpcGender`, `Role` from `src/ai/characters.ts`
- Age presentation band: derive via `lifeStageForAge` from `src/settlement/npcPhysicalProfile.ts`; do not invent a second lifecycle authority

## Current call-sites

| Event | Location | Today |
|---|---|---|
| greeting | `openNpcDialogueMenu` | `pickNpcGreetingSound(npc.voiceActor)` |
| confirmation | `acceptNpcDialogueOffer`, `selectNpcDialogueHelpAction` | `pickNpcConfirmationSound` |
| close | `closeNpcDialogueMenu` | always farewell; also `offer.onDecline` when offer exists |

Change close to: offer present → `quest_declined`, else `farewell`. Keep `onDecline` semantics.

## Leave on legacy

- `NpcAgent.playReactionSound` / hmm pools
- `QuestManager.playQuestCompleteSound` (gender-only, no full NPC identity)
- `pickNpcFriendlyTalkSound`

## Manifest (only files that exist)

Under `/sounds/voices/`:

- general male: greeting, farewell (`.wav`)
- merchant female: greeting ×3, farewell, agree→confirmation, thanks (thanks unwired)
- guard male: greeting ×2, farewell, quest_declined ×2 (`.mp3`); attention/refusal/thanks unwired

`trader` → scope `merchant`. Other roles use role id as scope.

Confirmation intent keys map to `*_agree_*` URLs. `quest_declined` has no Super Dialogue legacy pool.

## Pitfalls

- Do not import `NpcAgent` into `npcVoiceLines.ts` (coupling / cycles)
- Do not probe files at runtime
- Do not duplicate gender/role/lifecycle enums
- npc-042 nested `public/sounds/npc/` layout and Polish-first batch are superseded; flat `voices/` wins
- Variant pick may keep presentation `Math.random()` like existing pickers

## Suggested order

1. Types + age-band helper + static manifest + `resolveNpcVoiceLine`
2. Wire `store.ts`
3. Unit tests
4. Minimal sounds docs + npc-042 supersession note + plan status

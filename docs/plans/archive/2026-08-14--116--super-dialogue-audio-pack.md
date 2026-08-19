# Super Dialogue Audio Pack v1 — NPC voice lines

Status: `done` ✅ — playtest accepted 2026-08-18

## Context

NPCs had two small, gender-keyed voice pools in `src/ai/NpcAgent.ts`: a "hmm" pool (2 clips
per gender, played on `lookAtPlayer`) and a "thank you" pool (2–3 clips per gender, played on
quest turn-in). This plan broadens that to greeting / farewell / confirmation / more "hmm"
variety, matched to NPCs by gender **and voice actor** (the "other factor" requested) —
deterministic per NPC, the same way `modelUrlFor(gender, treeIndex)` already picks a body
model, so each NPC keeps one consistent voice all session instead of sounding random per line.

Source: `Super Dialogue Audio Pack V1` by Dillon Becker (dillonbecker.com), staged at
`_temp/Sounds/Super Dialogue Audio Pack v1/` — **CC BY 4.0**, the first non-CC0 sound source in
this repo (see `public/sounds/README.md` license notes). 3 male voice actors (Alex, Ian, Sean)
+ 2 female (Karen, Meghan), each recorded the same categories: Completion, Confirmation,
Greeting, Farewell, Refusal, Miscellaneous (10 lines each, 20 for Miscellaneous) — plus
Damage/Death/Grunting/Shouting (combat SFX, out of scope here).

Curated **3–4 lines per category** (not the full 10/20), village-appropriate wording only (no
modern slang / anachronisms):

| Category | Picked lines |
|---|---|
| Greeting | Hello, Hey, Welcome, Greetings |
| Farewell | Goodbye, Take care, Farewell, Good luck |
| Confirmation | Yes, You got it, On my way, Alright |
| Completion → folded into thank-you pool | All done, Finished, Complete, Ready |
| Miscellaneous → folded into hmm pool | Hmm…, Huh?, Wow! |

**Refusal was scoped out** — no existing UI moment maps to it cleanly (the closest candidate,
declining an NPC's offer, already plays a farewell — see below).

19 phrase-slots × 5 actors = 95 clips, converted WAV → mono 48 kHz OGG Vorbis (same pipeline as
the rest of `public/sounds/`), ~1.1 MB total. Full attribution + per-file source mapping:
`public/sounds/README.md` ("NPC voice lines — Super Dialogue Audio Pack v1" section, "License
notes (2026-08-14 batch)").

## What changed

- `src/ai/NpcAgent.ts` — new `NpcVoiceActor` type + `voiceActorForIndex()` (mirrors
  `modelUrlFor`); new `readonly voiceActor` field set in the constructor; new
  `NPC_GREETING_SOUND_URLS` / `NPC_FAREWELL_SOUND_URLS` / `NPC_CONFIRMATION_SOUND_URLS` pools
  (keyed by voice actor) + exported `pickNpcGreetingSound` / `pickNpcFarewellSound` /
  `pickNpcConfirmationSound`; `NPC_REACTION_SOUND_URLS` picks now also draw from a new
  actor-keyed hmm pool; `NPC_QUEST_COMPLETE_SOUND_URLS` gained 4 more clips per gender
  (Completion category, stays gender-keyed — see below for why).
- `src/ui-vue/store.ts` — new `configureNpcVoiceSounds(playAt)` (mirrors `configureUiSounds`);
  `openNpcDialogueMenu` plays a greeting; `closeNpcDialogueMenu` plays a farewell (skipped when
  `decline: false`, i.e. when the close is really a transition into trade, not the player
  leaving — `openMerchantFromDialogue` already uses that flag for `onDecline()` too, same
  guard reused); `acceptNpcDialogueOffer` plays a confirmation instead.
- `src/app/createApp.ts` — wires `configureNpcVoiceSounds(worldAudio.playAt)` next to
  `configureUiSounds`, tears down the same way.

`NPC_QUEST_COMPLETE_SOUND_URLS` stays **gender-keyed, not actor-keyed**:
`QuestManager.playQuestCompleteSound(giverName)` only has the giver's name
(`genderForName(giverName)`), no `treeIndex`/`NpcAgent` reference to resolve a `voiceActor`
from — wiring that through would mean passing NPC instances into `QuestManager`, out of scope
here.

## Open question (not blocking)

CC BY 4.0 requires attribution "in any reasonable manner" — `public/sounds/README.md` satisfies
the repo-record requirement. If the game gets a public release, an in-game credits screen may
eventually be expected too; none exists in `src/ui-vue` today. Not built as part of this plan.

## Verification

- `npx tsc --noEmit`, `npm run lint` (clean on changed files — pre-existing unrelated errors in
  `_temp/asset-audit/inspect.mjs` only), `npm run build`, `npm run test` (700/700) — all green.
- Confirmed all 95 referenced `public/sounds/*.ogg` files exist on disk.
- **Browser/manual verified** — accepted 2026-08-18 (playtest).

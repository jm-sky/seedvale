# Plan: NPC voice and dialogue catalog infrastructure

**Created:** 2026-09-16
**Status:** `done` ✅
**Type:** infrastructure
**Priority:** high · **Effort:** M
**Depends on:** npc-041
**Domain:** `npc`
**Subdomains:** `dialogue`
**Tags:** `voice` `dialogue` `audio` `documentation`
**Roadmap:** -

> **Supersession (npc-044, 2026-09-17):** Spoken NPC samples are English; visible dialogue stays Polish. Runtime assets for the generated batch live flat under `public/sounds/voices/` (`.wav`/`.mp3` as shipped) — do not treat the nested `public/sounds/npc/...` layout below as the current runtime contract. Hierarchical resolve + dialogue wiring for greeting/farewell/confirmation/`quest_declined` is owned by [`npc-044-npc-voice-resolver.md`](./npc-044-npc-voice-resolver.md). The Polish-first universal batch size below is historical planning context only.

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

## Agreed first catalog baseline

The first generated/reference-tested batch is intentionally small and Polish-first. English migration is not a prerequisite for validating the voice approach.

### Dimension 1 — universal spoken intents

Start with exactly 10 universal semantic intents:

| Semantic id | Polish baseline text | Purpose |
|---|---|---|
| `greeting` | `Dzień dobry.` | neutral greeting |
| `farewell` | `Do widzenia.` | neutral farewell |
| `thanks` | `Dziękuję.` | gratitude |
| `confirmation` | `Dobrze.` | agreement / confirmation |
| `refusal` | `Nie, dziękuję.` | polite refusal |
| `attention` | `Hej, ty!` | getting attention |
| `warning` | `Uważaj.` | generic warning |
| `acknowledgement` | `Rozumiem.` | acknowledgement |
| `smalltalk` | `Jak mija dzień?` | generic small talk |
| `well_wish` | `Powodzenia.` | generic positive farewell/wish |

These are semantic slots, not final immutable wording. The catalog/generator data should keep semantic ids stable even if wording is later refined.

### Dimension 2 — initial voice archetypes

Use 7 initial voice archetypes:

| Voice archetype | Presentation | Reference-search description |
|---|---|---|
| `guard` | male, middle-aged | Firm and authoritative, medium-deep voice, restrained emotion, slightly rough. |
| `merchant` | female, middle-aged | Warm and expressive, clear speech, friendly, energetic, slightly persuasive. |
| `hunter` | male, adult | Quiet and rough, lower voice, restrained, outdoorsman feel, slightly raspy. |
| `male_young` | male, young adult | Clear natural voice, lighter tone, relaxed, friendly, not theatrical. |
| `male_old` | male, older | Deep or worn voice, slower speech, calm, slightly rough, experienced. |
| `female_young` | female, young adult | Clear natural voice, light-to-medium tone, warm, relaxed, not theatrical. |
| `female_old` | female, older | Warm but worn voice, slower speech, calm, experienced, slightly husky. |

Useful search phrases for finding legal reference material:

```text
middle-aged male deep rough authoritative
middle-aged female warm expressive clear
adult male quiet rough raspy outdoorsman
young male natural relaxed
aolder male calm raspy deep
young female warm natural
older female husky calm
```

The final voice archetype definition should store provenance for the selected reference sample and must not silently rely on an unidentified person/voice source.

### Initial universal batch size

Generate every universal intent for every initial voice archetype:

```text
10 universal intents × 7 voice archetypes = 70 samples
```

This is the minimum useful batch for judging voice consistency across different roles and demographic archetypes.

### Campfire conversation baseline

Campfire content is deliberately longer than universal barks. Start with 2 topics; each topic is one question and one answer.

#### Weather

```text
weather.question
"Zimno dziś wieczorem. Myślisz, że jutro będzie padać?"

weather.answer
"Możliwe. Wiatr zmienił się przed zmrokiem. Lepiej nie zostawiać niczego na zewnątrz."
```

#### Work

```text
work.question
"Długo dziś pracowałeś? Wyglądasz, jakbyś ledwo trzymał się na nogach."

work.answer
"Od samego rana. Bywały gorsze dni, ale dobrze będzie wreszcie usiąść przy ogniu."
```

For the first batch, campfire lines are generated only as generic male/female variants rather than for all 7 role archetypes:

```text
2 topics × 2 turns × 2 voice presentations = 8 samples
```

Initial catalog total:

```text
70 universal + 8 campfire = 78 samples
```

### Optional contextual dimension — deferred

Some semantic intents may later vary by world/NPC context, for example:

- relationship: friendly / neutral / cold,
- needs: hungry / thirsty / otherwise pressured,
- vigor: energetic / tired / exhausted,
- injury or other meaningful state.

Do **not** generate the full Cartesian product. Add a contextual variant only where it materially changes delivery or wording. Example future shape:

```text
greeting.neutral
greeting.friendly
greeting.cold
farewell.neutral
farewell.friendly
```

The simulation remains authoritative for relationship/needs/vigor. Voice/dialogue data may select a presentation variant from those states but must not duplicate them.

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

Reusable by most NPCs regardless of profession. Start with the 10 agreed semantic intents above.

Each semantic slot may later have several textual variants, but every variant needs a stable semantic identity independent from the final filename.

### B. Profession dialogue

Reusable by any NPC of a profession, for example:

- Hunter,
- Merchant/Trader,
- Guard,
- Blacksmith,
- Farmer,
- Woodcutter,
- Miner,
- Fisher,
- Shepherd,
- Textile worker,
- other implemented professions found during recon.

The first three profession-focused voices are **Guard, Merchant and Hunter**. They are the initial important profession archetypes for voice/reference work.

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

## Voice profile catalog

Define reusable voice profiles separately from individual NPC text. A profile should capture only useful generation traits, for example:

- perceived age band,
- gender/voice presentation,
- vocal weight/timbre,
- accent/region style when deliberately selected,
- pace,
- temperament/energy,
- reference-audio provenance,
- Chatterbox generation settings that materially affect consistency.

Do not conflate a voice archetype with the simulation's personality/traits. `guard`, `merchant`, `hunter`, `male_young`, etc. are voice/reference archetypes, not replacements for NPC personality.

Avoid one voice model per line. A key NPC should keep one stable voice profile; generic NPCs may draw deterministically from compatible profiles.

## Generator data direction

The catalog should be representable directly as JSON/data consumed by a local generator. Keep text definitions separate from voice archetype definitions so the generator combines them rather than duplicating strings.

Conceptual shape:

```json
{
  "universal": {
    "greeting": "Dzień dobry.",
    "farewell": "Do widzenia.",
    "thanks": "Dziękuję.",
    "confirmation": "Dobrze.",
    "refusal": "Nie, dziękuję.",
    "attention": "Hej, ty!",
    "warning": "Uważaj.",
    "acknowledgement": "Rozumiem.",
    "smalltalk": "Jak mija dzień?",
    "well_wish": "Powodzenia."
  },
  "campfire": {
    "weather": {
      "question": "Zimno dziś wieczorem. Myślisz, że jutro będzie padać?",
      "answer": "Możliwe. Wiatr zmienił się przed zmrokiem. Lepiej nie zostawiać niczego na zewnątrz."
    },
    "work": {
      "question": "Długo dziś pracowałeś? Wyglądasz, jakbyś ledwo trzymał się na nogach.",
      "answer": "Od samego rana. Bywały gorsze dni, ale dobrze będzie wreszcie usiąść przy ogniu."
    }
  }
}
```

Voice archetypes/reference paths/settings should live in a separate data object/file and be joined by the generator.

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

The instructions should be usable manually first; generation automation may then consume the same catalog JSON/data rather than introducing a second list of phrases.

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
- Requiring English before the Polish voice POC proves useful.
- Generating every relationship/need/vigor combination up front.

## Verification

Automated:

- typecheck/build/tests for any runtime mapping changes,
- asset-path validation if an existing repository mechanism exists or can be cheaply extended.

Manual browser verification by the user:

- compare the 7 selected reference archetypes,
- judge Polish pronunciation/naturalness before deciding whether English migration is necessary,
- at least one generic NPC,
- one Guard/Merchant/Hunter profession path,
- stable voice for the same NPC across multiple lines,
- one male and one female campfire exchange.

Add JSDoc to any new architectural/public resolver functions that materially help preflight discover ownership; use `@domain npc` where useful.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

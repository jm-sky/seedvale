# Required sounds

Living backlog of sound effects Seedvale still needs (or has but must wire).

Inventory of files already in the repo: [`public/sounds/README.md`](../../public/sounds/README.md). One-shot research snapshot that seeded this list: [research 007](../research/2026-08-11--007--sound-needs.md).

**Last updated:** 2026-09-02

## How to use

During feature planning or implementation:

1. Ask whether the work needs a new SFX (or an unused file wired in).
2. If yes — add a row here (or update an existing one).
3. When the clip is in `public/sounds/` and played from code, set status to `wired` and add a source row in `public/sounds/README.md`.

If the feature needs no new sound, do nothing to this file.

## Status values

| Status | Meaning |
|--------|---------|
| `needed` | Not acquired yet |
| `in repo` | File exists under `public/sounds/`, not wired (or only partially) |
| `wired` | Played from runtime audio helpers |

## Already wired (summary)

| Category | Files | Notes |
|----------|-------|-------|
| NPC | hmm / thank-you / greeting / farewell / confirmation (M/F, per-actor voice) | Dialogue reactions + Super Dialogue Audio Pack v1 (plan 116) — greeting on dialogue open, farewell on close, confirmation on offer accept, extra hmm/thank-you variety |
| Animals | chicken, cow, wolf, horse, sheep | `[E]` on animal (donkey still silent, no clip). Cow/sheep/chicken also: spontaneous per-animal ambient vocalization with cooldown + concurrent-play cap (plan settlements-npcs-004 §1), milking completion (§2), chicken egg-laid (§2) — all reuse this same `[E]` clip/volume via `animalSounds.ts`'s `playSpontaneousAnimalSound`/`playAnimalSound` |
| Ambient | forest, night crickets, coast, wind, meadow, soft waves, birds, fire loop, rain loop, owl one-shot | Area / time / mountain / campfire loops; rain loop gain = weather intensity (plan 040 Etap 1); birds + crickets also scale with time-of-day profile and weather (clear/cloudy/fog/rain/snow) per biome weight (plan world-006); owl is a random one-shot (not a loop) — cooldown-gated on night + forest weight in `audio/createAmbientAudio.ts` |
| Inventory | pick-up ×4, drop ×1 | Collect / drop |
| UI | `ui-click-01` | Inventory / pause / dialog (open + click) |
| Actions | dig ×4, wood-chop ×2 (variant pool), branch-break ×1, tree-fall ×1, melee hit/kill, well ×1, well-construction ×1, fishing-cast ×1, fire ignite/extinguish | Shovel / axe (delimb + fell + buck steps, player + NPC) / melee / well draw / well roof construction / fishing rod cast / campfire. NPC/animal combat impact+death (plan npc-009, `playCombatHit`/`playNpcCombatDeath`/`playAnimalCombatDeath`) and NPC ranged draw/release (`playCombatBowDraw`/`playActionBowRelease`) reuse these same clips — see S26 for the still-open melee-swing/animal-death-vocal gap |
| Player move | footsteps × terrain sets (grass/sand/stone/road; dirt aliases sand), jump cloth, land = louder surface footstep, water-lap, door open/close/latch/creak | Walk/sprint/land terrain-classified (Anton Z default, plans 121/158); jump stand-in, enter water, house threshold |

## Backlog

### P0 — noticeable in play now

| ID | Sound | Context | Status | Related |
|----|-------|---------|--------|---------|
| S01 | Footsteps (grass / dirt / sand / stone / road) | Player move; terrain-classified via `src/terrain/footstepSurface.ts`, sprint variant | `wired` | Default pack Anton Z `footstep-{grass,sand,stone}-01…07` + existing road gravel (plan 121). Beach **and** desert biome play sand. A/B: `?footsteps=legacy\|mayra`. Jump-land uses the same pack (plan 158); Kenney `footstep-01…04` unwired. Swamp/mud still open (falls back to grass). Snow clip in repo as `footstep-snow-alt-mayra-01` — not wired (no snow surface yet). |
| S02 | Splash / wade | Enter water / swim | `wired` | `water-lap-01` candidate only — true splash/wade still open. Anton Z `footstep-water-01…06` in repo, not wired. |
| S03 | Fire (loop + ignite) | Campfire / torch / fire pit | `wired` | `ambient-fire-loop-01` + `action-fire-ignite-01` / `action-fire-extinguish-01` |
| S04 | Melee hit (knife/axe) | Player → animal melee | `wired` | `action-melee-hit-01` / `action-melee-kill-01` |
| S05 | UI click / open-close | Inventory, pause, dialog | `wired` | `ui-click-01` (Kenney metalClick) for click and open; `ui-open-01` unused |

### P1 — world feels alive

| ID | Sound | Context | Status | Related |
|----|-------|---------|--------|---------|
| S06 | Wind (light loop) | Open / mountain; fade with ridge | `wired` | `ambient-wind-loop-01` + `ambient-meadow-loop-01` + `ambient-waves-soft-01` |
| S07 | Rain | Weather = `rain` (plan 040 Etap 1, `audio/weatherSounds.ts`) | `wired` | `ambient-rain-loop-01` |
| S08 | Well / draw water | NPC or player at well | `wired` | `action-well-01` |
| S09 | Door / enter house | Optional on house proximity | `wired` | `door-open-01` / `door-close-01` + latch/creak |
| S10 | Fauna: deer / fox / stag one-shot | Today only chicken/cow/wolf SFX | `needed` | `animal-dog-01` in repo (village dog — does not close deer/fox) |
| S11 | Wolf distant (bark/howl) vs contact growl | Distinguish threat distance | `needed` | Existing `animal-wolf-01` is growl |

### P2 — settlement / economy

| ID | Sound | Context | Status | Related |
|----|-------|---------|--------|---------|
| S12 | Market / crowd bed | Near market / larger village | `in repo` | `ambient-crowd-kids-01` weak stand-in (playground walla) |
| S13 | Smithing / woodwork (workplace) | When NPCs really work | `needed` | [plan 060](../plans/archive/2026-08-11--060--npc-schedule-actions-and-trait-overlays.md)+ |
| S14 | Gate / creak | Palisade / future fortifications | `wired` | `door-creak-01…02` / `door-latch-01` (with S09 house threshold) |
| S15 | Stone find (distinct from dig) | Dig notice — today reuses dig SFX | `needed` | — |
| S16 | Pickaxe / ore strike | Mine channel — today reuses dig clips via `playActionMine` | `needed` | [plan 090](../plans/archive/2026-08-12--090--sword-merchant-tent-caves-pickaxe.md) |
| S17 | Jump / land (player) | New jump mechanic — takeoff + landing thud | `wired` | Stand-in: Kenney `cloth1` (`action-jump-cloth-01`) + louder **terrain-pack** footstep land (plan 158; Kenney `footstep-01…04` unwired). Dedicated jump/land clip still open |
| S18 | Eat (bite/chew) | Consume food item (inventory Zjedz) | `needed` | plan 106 — currently silent |
| S19 | Drink / gulp | Consume waterskin, well/lake `[E]` | `needed` | plan 106 — currently reuses `action-well-01` (S08) |
| S20 | Sizzle / cook | `[R]` cooking raw_meat at a lit campfire | `needed` | plan 106 — currently silent |
| S21 | Snow ambience (wind flurry) | Weather = `snow` (plan 040 Etap 1) | `needed` | No asset yet — snow stays visual-only (`world/weatherParticles.ts`) until acquired |
| S22 | Bow draw / release (twang) | Ranged attack draw start / arrow release (plan 162) | `wired` | `public/sounds/bow-draw.ogg`/`bow-release.ogg` via `playActionBowDraw`/`playActionBowRelease` (`src/audio/actionSounds.ts`) — draw plays on a successful `requestDraw()`, release plays on the frame the shot actually fires (not on an early-release cancel). Arrow hit/kill still reuses `playActionMeleeHit`/`playActionMeleeKill` (S-none — no dedicated arrow-impact clip) |
| S23 | Whetstone sharpening (scrape) | Inventory "Naostrz" action (plan 161) | `needed` | Currently silent |
| S24 | Bear growl (aggro) | Plays once a bear commits to chasing a human (`animalSounds.ts`'s `playAnimalAggroSound`, wired through `Fauna`'s `onAnimalAggro`) | `needed` | plan 188 (`sounds/bear-growl.ogg`), silent until the clip is wired in |
| S25 | NPC friendly-talk murmur | Short, non-verbal chatter when a Social Place `conversation` actually begins (plan settlements-npcs-004 §3) | `needed` | Plumbing wired (`ai/npcVoiceLines.ts`'s `NPC_FRIENDLY_TALK_SOUND_URLS`/`pickNpcFriendlyTalkSound`, called from `NpcAgent.beginConversation()`), pools left empty — silent no-op until clips are added. Suggested naming once acquired: `/sounds/npc-talk-{gender}-{NN}.ogg` (male/female pools, no per-actor split) |
| S26 | Melee attack swing (whoosh/grunt) + animal death vocal | Melee attack-start presentation for NPC/animal combat; a species-agnostic animal death sound (plan npc-009) | `needed` | No swing/whoosh asset exists — melee attack start is animation-only (ranged reuses `bow-draw`/`bow-release` via `playCombatBowDraw`/`playActionBowRelease`). No dedicated animal death/whimper clip exists either — `AnimalAgent.collapse()`'s death sound (`playAnimalCombatDeath`, `src/audio/actionSounds.ts`) deliberately reuses the vocal-free `action-melee-hit-01` impact clip instead of the human moan+fall `action-melee-kill-01` (NPC-only, via `playNpcCombatDeath`) |

## Acquisition rules

- Prefer **CC0 / freesound with a clear license**; add a row to `public/sounds/README.md`.
- Short one-shots (~0.2–2 s); ambient as loopable WAV.
- Reuse `worldAudio.playOnce` / `playAt` / `createLoop` — no second audio bus.
- **World-sourced one-shots** (well, NPC reaction, melee, animal, chop) → `worldAudio.playAt` (distance gain at play start). **UI / inventory / quest thank-you** → `playOnce`.
- Per-category gain as in `actionSounds` / `inventorySounds`.

## Out of scope for this list

- Music / soundtrack.
- Full HRTF / 3D stereo pan (`THREE.PositionalAudio` may come later for fire loops). Distance gain via `playAt` is in.

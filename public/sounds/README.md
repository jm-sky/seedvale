# Sounds

Shipped as OGG Vorbis (48 kHz; one-shots downmixed to mono, ambient loops kept
stereo) — converted from the original WAV recordings for the perf review
(`docs/reviews/2026-08-12--005--performance-architecture-and-assets.md`, AS1;
22 MB → ~1.1 MB). The `oryginal filename` column below is the untouched
upstream download name (still WAV/whatever the source provided), kept for
attribution/provenance — it does **not** describe what's in `public/sounds/`
today. The pre-conversion WAVs are recoverable from git history/the
`audio-glb-originals-2026-08-12` tag, not kept in the tree. `male-hmm-01.m4a`,
`male-thank-you-01.mp3` and `female-thank-you-01.mp3` were already lossy-compressed
and were left as-is.

Backlog status: [`docs/assets/SOUNDS.md`](../../docs/assets/SOUNDS.md). Staging
candidates still under review: [`_temp/Sounds/README.md`](../../_temp/Sounds/README.md).

## NPC

| filename         | oryginal filename | source url | notes |
|------------------|-------------------|------------|-------|
| female-hmm-01.ogg    | 266292__montblanccandies__hmm-2.wav |  https://freesound.org/ | - |
| female-hmm-02.ogg    | 170768__esperar__hmm-question.wav | https://freesound.org/people/esperar/sounds/170768/ | - |
| male-hmm-01.m4a      | 592839__elcharrua__hmm-2-sos-paranormal.m4a | https://freesound.org/ ? | - |
| male-hmm-02.ogg      | 519112__trimono__approving-hm.wav | https://freesound.org/people/trimono/sounds/519112/ | - |
| male-thank-you-01.mp3 | 579675__kain0025__ey-thank-you.mp3 | https://freesound.org/people/Kain0025/sounds/579675/ | Cheerful |
| male-thank-you-02.ogg | 429036__theuncertainman__thank-you-npc-british-male.wav | https://freesound.org/  | generic |
| female-thank-you-01.mp3       | 624079__djhamsammich__thank-you-anne.mp3 | https://freesound.org/ | Simple, short |

### NPC voice lines — Super Dialogue Audio Pack v1 (plan 116)

95 clips, curated from `Super Dialogue Audio Pack V1` by **Dillon Becker**
(dillonbecker.com) — **CC BY 4.0**, attribution + license link required (see
`## License notes` below; this is the first CC-BY, non-CC0 source in this
folder). Original pack (WAV, staged, not kept in the tree beyond git history):
`_temp/Sounds/Super Dialogue Audio Pack v1/`.

Naming: `{gender}-{slug}-{actor}-{NN}.ogg`. Actor = one of the 5 recorded voice
actors, assigned deterministically per NPC (`voiceActorForIndex` in
`src/ai/NpcAgent.ts`, same pattern as the body-model pool) so each NPC keeps
one consistent voice: male → `alex` (Alex Brodie) / `ian` (Ian Lampert) /
`sean` (Sean Lenhart); female → `karen` (Karen Cenon) / `meghan` (Meghan
Christian). `NN` is our curated sequence, not the pack's original line number
— mapping back to the pack's `Reference Sheet.pdf` below. Each row ×5 actors.

| slug (our category) | NN | pack category | pack line # | transcript | used for |
|---|---|---|---|---|---|
| greeting | 01–04 | Greeting | 1, 3, 6, 7 | Hello / Hey / Welcome / Greetings | `NPC_GREETING_SOUND_URLS` — dialogue panel opens (`openNpcDialogueMenu`, `src/ui-vue/store.ts`) |
| farewell | 01–04 | Farewell | 1, 6, 8, 9 | Goodbye / Take care / Farewell / Good luck | `NPC_FAREWELL_SOUND_URLS` — dialogue panel closes without accepting (`closeNpcDialogueMenu`) |
| confirmation | 01–04 | Confirmation | 3, 4, 5, 9 | Yes / You got it / On my way / Alright | `NPC_CONFIRMATION_SOUND_URLS` — player accepts the NPC's offer (`acceptNpcDialogueOffer`) |
| thank-you | 01–04 | Completion | 1, 2, 3, 4 | All done / Finished / Complete / Ready | merged into `NPC_QUEST_COMPLETE_SOUND_URLS` (`src/ai/NpcAgent.ts`) — extra variety for quest turn-in |
| hmm | 01–03 | Miscellaneous | 2, 3, 10 | Hmm… / Huh? / Wow! | merged into `NPC_REACTION_SOUND_URLS` picks in `playReactionSound()` — extra variety for the `lookAtPlayer` reaction |

## Animals

| filename         | oryginal filename | source url | notes |
|------------------|-------------------|------------|-------|
| animal-chicken-01.ogg | 724216__nickmaysoundmusic__chickens_waiting_to_be_fed_farm_light_wind_bird_song.wav | https://freesound.org/people/nickmaysoundmusic/sounds/724216/ | Farm chickens + light wind/birds; longer bed (~17 s) |
| animal-cow-01.ogg | 513565__spurioustransients__cow-moo-8.wav | https://freesound.org/people/spurioustransients/sounds/513565/ | Cow moo |
| animal-wolf-01.ogg | 338674__newagesoup__wolf-growl.wav | https://freesound.org/people/newagesoup/sounds/338674/ | Wolf growl |
| animal-dog-01.ogg | ANMLDog_Dog Barks, Multiple, Indoors…_344 Audio_Dog Vocalisations_02.wav | Sonniss GDC 2026 — 344 Audio Dog Vocalisations | **not wired**; village dog; not deer/fox (S10 still open) |

## Ambient / background

| filename         | oryginal filename | source url | notes |
|------------------|-------------------|------------|-------|
| ambient-forest-loop-01.ogg | 170515__rolandasb__forest_ambient_01_loop.wav | https://freesound.org/people/rolandasb/sounds/170515/ | Loopable forest ambience (birds/wind) |
| ambient-night-crickets-loop-01.ogg | 521843__mrfossy__outdoors_night_cricketsloop.wav | https://freesound.org/people/mrfossy/sounds/521843/ | Loopable night crickets |
| ambient-coast-seagulls-waves-01.ogg | 56531__juskiddink__seagullswavesjuly-084of4freesound.wav | https://freesound.org/people/juskiddink/sounds/56531/ | Seagulls + waves, coastline |
| ambient-fire-loop-01.ogg | FIREBurn_Loop Elements Fire Crackling…_ESM_SNLS.wav | Sonniss GDC 2026 — Epic Stock Media Synthesized Nature | S03 fire loop (~12 s); gain from nearest lit campfire |
| ambient-wind-loop-01.ogg | WINDInt_Loop Weather Wind Whipping…_ESM_SNLS.wav | Sonniss GDC 2026 — Epic Stock Media Synthesized Nature | S06 mountain / highland |
| ambient-rain-loop-01.ogg | RAINInt_Heavy Rain on Window, Constant _JF_INT Storm.wav | Sonniss GDC 2026 — Jake Fielding Interior Wind Rain | wired (plan 040 Etap 1, `audio/weatherSounds.ts`); S07; rain-on-window bed (~31 s) |
| ambient-meadow-loop-01.ogg | AMBSwmp_Meadow Pipits…Wind blowing through Grass_JSE_HoN_Stereo.wav | Sonniss GDC 2026 — Just Sound Effects Highlands of Norway | Open / meadow bed (trimmed ~25 s) |
| ambient-waves-soft-01.ogg | WATRWave_Soft Waves Cliffs_JSE_RCoN_Stereo.wav | Sonniss GDC 2026 — Just Sound Effects Rocky Coast of Norway | Soft coast waves (trimmed ~20 s); supplement to seagulls coast |
| ambient-crowd-kids-01.ogg | CRWDChld_Walla Children Kids…Playground 01_ESM_CPS.wav | Sonniss GDC 2026 — Epic Stock Media Crowds Walla | **not wired**; weak S12 stand-in (kids playground walla, trimmed ~25 s) |
| meadowsinging-birds-1.ogg | — | **TODO: source/license not recorded** | wired (plan world-006, `audio/createAmbientAudio.ts`); day/forest+meadow bird bed |
| meadowsinging-birds-2.ogg | — | **TODO: source/license not recorded** | **not wired**; staged for a future random-variant crossfade (plan world-006 "poza zakresem") |
| meadowsinging-birds-3.ogg | — | **TODO: source/license not recorded** | **not wired**; staged for a future random-variant crossfade (plan world-006 "poza zakresem") |
| ambient-owl-at-night.ogg | — | — (TBD — provided directly in `public/sounds/`, source/license not yet recorded) | Random one-shot (not a loop) — night + forest-weight-gated cooldown timer in `audio/createAmbientAudio.ts` |

## Items / Inventory

| filename         | oryginal filename | source url | notes |
|------------------|-------------------|------------|-------|
| inventory-pick-up-01…04.ogg | 831642__ienba__generic-game-pick-up.wav | https://freesound.org/people/IENBA/sounds/831642/ | 4 variants split from one pack; random pick on collect |
| inventory-drop-01.ogg | 791150__randbsoundbites__dropping-an-item-from-inventory.wav | https://freesound.org/people/randbsoundbites/sounds/791150/ | |

## UI

| filename | oryginal filename | source url | notes |
|----------|-------------------|------------|-------|
| ui-click-01.ogg | metalClick.ogg | Kenney RPG sounds (CC0) — https://kenney.nl | S05 click + panel open |
| ui-click-02.ogg | UIMisc_Kalimba 3 Up_CB Sounddesign_APPlicable Sounds.wav | Sonniss GDC 2026 — CB Sounddesign Organic UI | unused (soft confirm) |
| ui-click-03.ogg | interface1.wav | RPG Sound Pack (artisticdude / OpenGameArt; verify CC0) | unused (short blip) |
| ui-open-01.ogg | TOONMisc_Bird Flutes 3_CB Sounddesign_APPlicable Sounds.wav | Sonniss GDC 2026 — CB Sounddesign Organic UI | unused (too cartoon for panel open) |

## Player / world interaction

| filename | oryginal filename | source url | notes |
|----------|-------------------|------------|-------|
| footstep-01…04.ogg | footstep00…03.ogg | Kenney RPG sounds (CC0) — https://kenney.nl | **not wired** (plan 158); was jump-land thud |
| door-open-01.ogg | doorOpen_1.ogg | Kenney RPG sounds (CC0) | S09 |
| door-close-01.ogg | doorClose_1.ogg | Kenney RPG sounds (CC0) | S09 |
| door-creak-01.ogg | creak1.ogg | Kenney RPG sounds (CC0) | S09 / S14 gate |
| door-creak-02.ogg | creak2.ogg | Kenney RPG sounds (CC0) | S14 variant |
| door-latch-01.ogg | metalLatch.ogg | Kenney RPG sounds (CC0) | S14 latch |
| water-lap-01.ogg | WATRLap_Summer Tennessee Lake Dock Water Ripples…_ESM_CPS.wav | Sonniss GDC 2026 — Epic Stock Media Storms Lakes Parks | **S02 candidate** only (gentle lap trimmed ~2 s — not a true splash/wade yet) |
| action-jump-cloth-01.ogg | cloth1.ogg | Kenney RPG sounds (CC0) | S17 jump takeoff stand-in (cloth whoosh) |

## Footsteps (terrain)

Per-surface player footstep variants (S01), replacing the single generic
`footstep-01…04.ogg` set above for walking/sprinting **and** jump-land (plan
158). That Kenney set stays in the tree unwired. Terrain classification and
wiring: `src/terrain/footstepSurface.ts`, `src/audio/playerMoveSounds.ts`.

**Default pack (`anton`, plan 121):** Anton Z Walk one-shots, peak-normalized
mono 48 kHz. Beach **and** desert biome play `sand` (previously desert used
concrete-derived `dirt` and Fantozzi sand sounded like a hard floor). A/B
without rebuild: `?footsteps=anton|legacy|mayra` or lil-gui → Audio.

| filename | oryginal filename | source url | notes |
|----------|-------------------|------------|-------|
| footstep-grass-01…07.ogg | Antons_Footsteps_FS_Grass_Walk_01…07.wav | https://trade-a-chest.itch.io/footstep-sound-effects | **wired default**; Anton Z; grass/forest/meadow |
| footstep-sand-01…07.ogg | Antons_Footsteps_FS_Sand_Walk_01…07.wav | j.w. | **wired default**; beach + desert. Soft grain, not a floor thud |
| footstep-stone-01…07.ogg | Antons_Footsteps_FS_Stone_Walk_01…07.wav | j.w. | **wired default**; rock / mountain ridge |
| footstep-road-01…10.ogg | Gravel Footsteps pack, Ali_6868 | https://freesound.org/people/Ali_6868/packs/21608/ | CC0; unchanged — Anton Z has no gravel |
| footstep-wood-01…07.ogg | Antons_Footsteps_FS_Wood_Walk_01…07.wav | Anton Z (same itch page) | **not wired**; candidate for house interiors |
| footstep-water-01…06.ogg | Antons_Footsteps_FS_Water_Walk_01…06.wav | j.w. | **not wired**; S02 wade candidate (better than `water-lap-01`) |

### Footsteps — A/B alts (not the default)

Kept so a playtest can pick a better option without reconverting. Switch via
`?footsteps=legacy` / `?footsteps=mayra`.

| filename | oryginal filename | source url | notes |
|----------|-------------------|------------|-------|
| footstep-grass-legacy-01…09.ogg | footstep-grass.wav (derivative), swuing | https://freesound.org/people/swuing/sounds/38874/ | CC-BY 3.0; previous default grass |
| footstep-dirt-legacy-01…09.ogg | footstep-concrete.wav (derivative), swuing | https://freesound.org/people/swuing/sounds/38873/ | CC-BY 3.0; previous desert fallback — sounds like floor |
| footstep-sand-legacy-01…06.ogg | Fantozzi-Sand{L,R}{1,2,3}.ogg | unknown (staged as "Fantozzi footsteps") | **license unverified**; previous sand — the floor-thud set |
| footstep-stone-legacy-01…06.ogg | Fantozzi-Stone{L,R}{1,2,3}.ogg | unknown (staged as "Fantozzi footsteps") | **license unverified**; previous stone |
| footstep-sand-alt-mayra-01.ogg | Sand.wav | https://mayragandra.itch.io/free-footsteps-sound-effects | Mayra Free Footsteps Pack; 1 clip — A/B only |
| footstep-grass-alt-mayra-01.ogg / `-run-01` | Grass 1.wav / Grass Running.wav | j.w. | Mayra |
| footstep-forest-alt-mayra-01…02.ogg | Forest 1.wav / Forest 2.wav | j.w. | Mayra; used as mayra grass/dirt extras |
| footstep-gravel-alt-mayra-01.ogg / `-run-01` | Gravel 1.wav / Gravel - Run.wav | j.w. | Mayra; mayra `road` |
| footstep-stone-alt-mayra-01…02.ogg | Concrete 1.wav / Concrete 2.wav | j.w. | Mayra; mayra `stone` |
| footstep-snow-alt-mayra-01.ogg | Snow.wav | j.w. | **not wired**; S01 snow still open |

`BVKER-Footsteps` (CC0 foley library) was staged and **not promoted** — mixed
lighters/coins/forest beds, not per-surface walk one-shots.

Swamp/mud-specific footstep variants are still open — that ground currently
falls back to grass. See `docs/assets/SOUNDS.md` S01.

## Actions

| filename         | oryginal filename | source url | notes |
|------------------|-------------------|------------|-------|
| action-dig-01…04.ogg | 486228__ruben_uitenweerde__digging-sand-with-a-shovel.wav | https://freesound.org/people/Ruben_Uitenweerde/sounds/486228/ | 4× ~2 s strokes split from 27 s pack; random on shovel dig |
| action-wood-chop-01.ogg | 847818__elschorscho__chopping-wood_medium-459.wav | https://freesound.org/people/ElSchorscho/sounds/847818/ | Axe / tree harvest (plan 057); play on chop channel start |
| action-melee-hit-01.ogg | 420673__sypherzent__basic-melee-hit.wav | https://freesound.org/people/SypherZent/sounds/420673/ | Short punch/impact; player melee hit (animal stays up); converted mono 16-bit 44.1 kHz |
| action-melee-kill-01.ogg | 264062__paul368__melee-weapon-hit-with-male-moan-body-fall.wav | https://freesound.org/people/Paul368/sounds/264062/ | Hit + moan + body fall; player melee kill; converted mono 16-bit 44.1 kHz |
| action-well-01.ogg | 146947__macferret_20__uoa_120217_kcqwell.wav | https://freesound.org/people/MacFerret_20/sounds/146947/ | Stone/water in well; player `[E]` at well + NPC drink at well; converted mono 16-bit 44.1 kHz |
| action-fire-ignite-01.ogg | 24 Campfire, Dropping Fresh Pine Branches in Fire…Close 02.wav | Sonniss GDC 2026 — Ivo Vicic Campfire Bonfire FX | S03 ignite (trimmed ~2.5 s from long take) |
| action-fire-extinguish-01.ogg | 42 Campfire, Putting Out Fire, Water from Bottle…Close.wav | Sonniss GDC 2026 — Ivo Vicic Campfire Bonfire FX | S03 extinguish (trimmed ~2.8 s) |
| bow-draw.ogg | — | — (TBD — provided directly in `public/sounds/`, source/license not yet recorded) | S22 draw; play on a successful ranged `requestDraw()` |
| bow-release.ogg | — | — (TBD — provided directly in `public/sounds/`, source/license not yet recorded) | S22 release; play on the frame a shot actually fires |
| axe-chopping-wood.ogg | — | — (TBD — provided directly in `public/sounds/`, source/license not yet recorded) | Chop swing variant, random-picked alongside `action-wood-chop-01.ogg` by `playActionChop`; player + NPC |
| action-branch-breaking.ogg | — | — (TBD — provided directly in `public/sounds/`, source/license not yet recorded) | `playActionBranchBreak` — delimbing chop step only (mature/old → limbed), player |
| pine-tree-falling.ogg | — | — (TBD — provided directly in `public/sounds/`, source/license not yet recorded) | `playActionTreeFall` — the fell transition (limbed → felled); player per-step, NPC once per felling `harvestWorldTreeFully` call |
| action-building-wood-construction.ogg | — | — (TBD — provided directly in `public/sounds/`, source/license not yet recorded) | `playActionWellConstruction` — well `roof` ("daszek") work-bout start only |
| action-casting-fishing-rod.ogg | — | — (TBD — provided directly in `public/sounds/`, source/license not yet recorded) | `playActionFishingCast` — rod cast start, `startFishing` |

## License notes (2026-08-12 batch)

| Source | License posture |
|--------|-----------------|
| Kenney RPG sounds | **CC0** (see `_temp/Sounds/RPGsounds_Kenney/license.txt`) |
| RPG Sound Pack (`ui-click-03`) | Typically CC0 on OpenGameArt (artisticdude) — **verify before commercial ship** |
| Sonniss.com GDC 2026 Game Audio Bundle samples | Promo/eval samples — **confirm Sonniss GDC license terms before shipping** the fire/wind/rain/meadow/waves/dog/crowd/UI clips |

## License notes (2026-08-14 batch)

| Source | License posture |
|--------|-----------------|
| Super Dialogue Audio Pack V1 — Dillon Becker (dillonbecker.com) | **CC BY 4.0** — attribution required. Credit: "Super Dialogue Audio Pack V1 by Dillon Becker (dillonbecker.com), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode)." First non-CC0 source in this folder — every prior entry above is CC0 or promo/eval-only; if the game gets a public release, this credit needs to appear somewhere player-visible (no in-game credits screen exists yet — open item, not solved by plan 116). |

## License notes (2026-08-15 batch)

| Source | License posture |
|--------|-----------------|
| Footstep Sound Effects — Anton Z. (trade-a-chest.itch.io) | Custom itch license: **use in commercial/non-commercial projects OK**; do not resell/redistribute the assets themselves (including edited as a pack). Not CC0. Credit not required; pack page: https://trade-a-chest.itch.io/footstep-sound-effects |
| Free Footsteps Sound Effects — Mayra (mayragandra.itch.io) | Commercial/non-commercial use OK; credit not required but appreciated. Do not treat as CC0. https://mayragandra.itch.io/free-footsteps-sound-effects |
| BVKER Foley / Footsteps (bvker.com) | Staged only, **not shipped**. Pack page claims CC0; contents are mixed foley, not terrain walk one-shots. |

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
| ambient-rain-loop-01.ogg | RAINInt_Heavy Rain on Window, Constant _JF_INT Storm.wav | Sonniss GDC 2026 — Jake Fielding Interior Wind Rain | **not wired**; S07; rain-on-window bed (~31 s) |
| ambient-meadow-loop-01.ogg | AMBSwmp_Meadow Pipits…Wind blowing through Grass_JSE_HoN_Stereo.wav | Sonniss GDC 2026 — Just Sound Effects Highlands of Norway | Open / meadow bed (trimmed ~25 s) |
| ambient-waves-soft-01.ogg | WATRWave_Soft Waves Cliffs_JSE_RCoN_Stereo.wav | Sonniss GDC 2026 — Just Sound Effects Rocky Coast of Norway | Soft coast waves (trimmed ~20 s); supplement to seagulls coast |
| ambient-crowd-kids-01.ogg | CRWDChld_Walla Children Kids…Playground 01_ESM_CPS.wav | Sonniss GDC 2026 — Epic Stock Media Crowds Walla | **not wired**; weak S12 stand-in (kids playground walla, trimmed ~25 s) |

## Items / Inventory

| filename         | oryginal filename | source url | notes |
|------------------|-------------------|------------|-------|
| inventory-pick-up-01…04.ogg | 831642__ienba__generic-game-pick-up.wav | https://freesound.org/people/IENBA/sounds/831642/ | 4 variants split from one pack; random pick on collect |
| inventory-drop-01.ogg | 791150__randbsoundbites__dropping-an-item-from-inventory.wav | https://freesound.org/people/randbsoundbites/sounds/791150/ | |

## UI

| filename | oryginal filename | source url | notes |
|----------|-------------------|------------|-------|
| ui-click-01.ogg | metalClick.ogg | Kenney RPG sounds (CC0) — https://kenney.nl | S05 hard click |
| ui-click-02.ogg | UIMisc_Kalimba 3 Up_CB Sounddesign_APPlicable Sounds.wav | Sonniss GDC 2026 — CB Sounddesign Organic UI | S05 soft confirm |
| ui-click-03.ogg | interface1.wav | RPG Sound Pack (artisticdude / OpenGameArt; verify CC0) | S05 short UI blip |
| ui-open-01.ogg | TOONMisc_Bird Flutes 3_CB Sounddesign_APPlicable Sounds.wav | Sonniss GDC 2026 — CB Sounddesign Organic UI | S05 open / positive |

## Player / world interaction

| filename | oryginal filename | source url | notes |
|----------|-------------------|------------|-------|
| footstep-01…04.ogg | footstep00…03.ogg | Kenney RPG sounds (CC0) — https://kenney.nl | S01; generic hard surface — not grass/dirt variants yet |
| door-open-01.ogg | doorOpen_1.ogg | Kenney RPG sounds (CC0) | S09 |
| door-close-01.ogg | doorClose_1.ogg | Kenney RPG sounds (CC0) | S09 |
| door-creak-01.ogg | creak1.ogg | Kenney RPG sounds (CC0) | S09 / S14 gate |
| door-creak-02.ogg | creak2.ogg | Kenney RPG sounds (CC0) | S14 variant |
| door-latch-01.ogg | metalLatch.ogg | Kenney RPG sounds (CC0) | S14 latch |
| water-lap-01.ogg | WATRLap_Summer Tennessee Lake Dock Water Ripples…_ESM_CPS.wav | Sonniss GDC 2026 — Epic Stock Media Storms Lakes Parks | **S02 candidate** only (gentle lap trimmed ~2 s — not a true splash/wade yet) |
| action-jump-cloth-01.ogg | cloth1.ogg | Kenney RPG sounds (CC0) | S17 jump takeoff stand-in (cloth whoosh) |

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

## License notes (2026-08-12 batch)

| Source | License posture |
|--------|-----------------|
| Kenney RPG sounds | **CC0** (see `_temp/Sounds/RPGsounds_Kenney/license.txt`) |
| RPG Sound Pack (`ui-click-03`) | Typically CC0 on OpenGameArt (artisticdude) — **verify before commercial ship** |
| Sonniss.com GDC 2026 Game Audio Bundle samples | Promo/eval samples — **confirm Sonniss GDC license terms before shipping** the fire/wind/rain/meadow/waves/dog/crowd/UI clips |

# Required sounds

Living backlog of sound effects Seedvale still needs (or has but must wire).

Inventory of files already in the repo: [`public/sounds/README.md`](../../public/sounds/README.md). One-shot research snapshot that seeded this list: [research 007](../research/2026-08-11--007--sound-needs.md).

**Last updated:** 2026-08-14

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
| NPC | hmm / thank-you (M/F) | Dialogue reactions |
| Animals | chicken, cow, wolf | `[E]` on animal (donkey/horse/sheep reuse silence until clips exist) |
| Ambient | forest, night crickets, coast, wind, meadow, soft waves, fire loop | Area / time / mountain / campfire loops |
| Inventory | pick-up ×4, drop ×1 | Collect / drop |
| UI | `ui-click-01` | Inventory / pause / dialog (open + click) |
| Actions | dig ×4, wood-chop ×1, melee hit/kill, well ×1, fire ignite/extinguish | Shovel / axe / melee / well / campfire |
| Player move | footsteps ×4, jump cloth, water-lap, door open/close/latch/creak | Walk/sprint, jump stand-in, enter water, house threshold |

## Backlog

### P0 — noticeable in play now

| ID | Sound | Context | Status | Related |
|----|-------|---------|--------|---------|
| S01 | Footsteps (grass / dirt / wood) | Player move; 2–3 variants + light sprint | `wired` | `footstep-01…04` (Kenney hard surface — grass/dirt still open) |
| S02 | Splash / wade | Enter water / swim | `wired` | `water-lap-01` candidate only — true splash/wade still open |
| S03 | Fire (loop + ignite) | Campfire / torch / fire pit | `wired` | `ambient-fire-loop-01` + `action-fire-ignite-01` / `action-fire-extinguish-01` |
| S04 | Melee hit (knife/axe) | Player → animal melee | `wired` | `action-melee-hit-01` / `action-melee-kill-01` |
| S05 | UI click / open-close | Inventory, pause, dialog | `wired` | `ui-click-01` (Kenney metalClick) for click and open; `ui-open-01` unused |

### P1 — world feels alive

| ID | Sound | Context | Status | Related |
|----|-------|---------|--------|---------|
| S06 | Wind (light loop) | Open / mountain; fade with ridge | `wired` | `ambient-wind-loop-01` + `ambient-meadow-loop-01` + `ambient-waves-soft-01` |
| S07 | Rain | When weather exists | `in repo` | `ambient-rain-loop-01` |
| S08 | Well / draw water | NPC or player at well | `wired` | `action-well-01` |
| S09 | Door / enter house | Optional on house proximity | `wired` | `door-open-01` / `door-close-01` + latch/creak |
| S10 | Fauna: deer / fox / stag one-shot | Today only chicken/cow/wolf SFX | `needed` | `animal-dog-01` in repo (village dog — does not close deer/fox) |
| S11 | Wolf distant (bark/howl) vs contact growl | Distinguish threat distance | `needed` | Existing `animal-wolf-01` is growl |

### P2 — settlement / economy

| ID | Sound | Context | Status | Related |
|----|-------|---------|--------|---------|
| S12 | Market / crowd bed | Near market / larger village | `in repo` | `ambient-crowd-kids-01` weak stand-in (playground walla) |
| S13 | Smithing / woodwork (workplace) | When NPCs really work | `needed` | [plan 060](../plans/2026-08-11--060--npc-schedule-actions-and-trait-overlays.md)+ |
| S14 | Gate / creak | Palisade / future fortifications | `wired` | `door-creak-01…02` / `door-latch-01` (with S09 house threshold) |
| S15 | Stone find (distinct from dig) | Dig notice — today reuses dig SFX | `needed` | — |
| S16 | Pickaxe / ore strike | Mine channel — today reuses dig clips via `playActionMine` | `needed` | [plan 090](../plans/2026-08-12--090--sword-merchant-tent-caves-pickaxe.md) |
| S17 | Jump / land (player) | New jump mechanic — takeoff + landing thud | `wired` | Stand-in: Kenney `cloth1` (`action-jump-cloth-01`) + louder footstep land — dedicated jump clip still open |

## Acquisition rules

- Prefer **CC0 / freesound with a clear license**; add a row to `public/sounds/README.md`.
- Short one-shots (~0.2–2 s); ambient as loopable WAV.
- Reuse `worldAudio.playOnce` / `playAt` / `createLoop` — no second audio bus.
- **World-sourced one-shots** (well, NPC reaction, melee, animal, chop) → `worldAudio.playAt` (distance gain at play start). **UI / inventory / quest thank-you** → `playOnce`.
- Per-category gain as in `actionSounds` / `inventorySounds`.

## Out of scope for this list

- Music / soundtrack.
- Full HRTF / 3D stereo pan (`THREE.PositionalAudio` may come later for fire loops). Distance gain via `playAt` is in.

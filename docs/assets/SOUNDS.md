# Required sounds

Living backlog of sound effects Seedvale still needs (or has but must wire).

Inventory of files already in the repo: [`public/sounds/README.md`](../../public/sounds/README.md). One-shot research snapshot that seeded this list: [research 007](../research/2026-08-11--007--sound-needs.md).

**Last updated:** 2026-08-13

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
| Ambient | forest, night crickets, coast | Area / time loops |
| Inventory | pick-up ×4, drop ×1 | Collect / drop |
| Actions | dig ×4, wood-chop ×1, melee hit/kill, well ×1 | Shovel / axe / melee / well |

## Backlog

### P0 — noticeable in play now

| ID | Sound | Context | Status | Related |
|----|-------|---------|--------|---------|
| S01 | Footsteps (grass / dirt / wood) | Player move; 2–3 variants + light sprint | `in repo` | `footstep-01…04` (Kenney hard surface — grass/dirt still open) |
| S02 | Splash / wade | Enter water / swim | `in repo` | `water-lap-01` candidate only — true splash/wade still open |
| S03 | Fire (loop + ignite) | Campfire / torch / fire pit | `in repo` | `ambient-fire-loop-01` + `action-fire-ignite-01` / `action-fire-extinguish-01` |
| S04 | Melee hit (knife/axe) | Player → animal melee | `wired` | `action-melee-hit-01` / `action-melee-kill-01` |
| S05 | UI click / open-close | Inventory, pause, dialog (coherent set) | `in repo` | `ui-click-01…03` + `ui-open-01` |

### P1 — world feels alive

| ID | Sound | Context | Status | Related |
|----|-------|---------|--------|---------|
| S06 | Wind (light loop) | Open / mountain; fade with ridge | `in repo` | `ambient-wind-loop-01` (+ `ambient-meadow-loop-01` open bed) |
| S07 | Rain | When weather exists | `in repo` | `ambient-rain-loop-01` |
| S08 | Well / draw water | NPC or player at well | `wired` | `action-well-01` |
| S09 | Door / enter house | Optional on house proximity | `in repo` | `door-open-01` / `door-close-01` / `door-creak-01` |
| S10 | Fauna: deer / fox / stag one-shot | Today only chicken/cow/wolf SFX | `needed` | `animal-dog-01` in repo (village dog — does not close deer/fox) |
| S11 | Wolf distant (bark/howl) vs contact growl | Distinguish threat distance | `needed` | Existing `animal-wolf-01` is growl |

### P2 — settlement / economy

| ID | Sound | Context | Status | Related |
|----|-------|---------|--------|---------|
| S12 | Market / crowd bed | Near market / larger village | `in repo` | `ambient-crowd-kids-01` weak stand-in (playground walla) |
| S13 | Smithing / woodwork (workplace) | When NPCs really work | `needed` | [plan 060](../plans/2026-08-11--060--npc-schedule-actions-and-trait-overlays.md)+ |
| S14 | Gate / creak | Palisade / future fortifications | `in repo` | `door-creak-01…02` / `door-latch-01` |
| S15 | Stone find (distinct from dig) | Dig notice — today reuses dig SFX | `needed` | — |
| S16 | Pickaxe / ore strike | Mine channel — today reuses dig clips via `playActionMine` | `needed` | [plan 090](../plans/2026-08-12--090--sword-merchant-tent-caves-pickaxe.md) |

## Acquisition rules

- Prefer **CC0 / freesound with a clear license**; add a row to `public/sounds/README.md`.
- Short one-shots (~0.2–2 s); ambient as loopable WAV.
- Reuse `worldAudio.playOnce` / `playAt` / `createLoop` — no second audio bus.
- **World-sourced one-shots** (well, NPC reaction, melee, animal, chop) → `worldAudio.playAt` (distance gain at play start). **UI / inventory / quest thank-you** → `playOnce`.
- Per-category gain as in `actionSounds` / `inventorySounds`.

## Out of scope for this list

- Music / soundtrack.
- Full HRTF / 3D stereo pan (`THREE.PositionalAudio` may come later for fire loops). Distance gain via `playAt` is in.

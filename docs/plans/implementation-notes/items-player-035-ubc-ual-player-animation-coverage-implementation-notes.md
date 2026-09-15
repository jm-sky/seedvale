# Implementation notes: UBC UAL player animation coverage

**Plan:** `items-player-035-ubc-ual-player-animation-coverage.md`

## Assets

`prepare-ubc-player-alpha.sh` keeps a gameplay UAL1 subset (not `_RM`) in `public/models/characters/ubc/ual1_player.glb`. Outfit GLBs are unchanged. `list-character-animations.ts` indexes root character GLBs and `ubc/` separately; `parked/` is skipped.

## Mixer

`PlayerController.bindMixer` aliases Adventurer and UAL names onto the same slots. Bow aim no longer falls back to `Sword_Idle` (that clip is melee idle). Jump uses `Jump_Start` / `Jump_Loop` / `Jump_Land` and mixer `finished`; tilt remains only when those clips are missing. Sneak and swim replace walk/idle when their clips exist. `enterDowned` plays `Death`/`Death01` without the procedural lie tip. Camp `lieDown()` is still a root rotation.

## Out of scope (still LOOSE-ENDS)

UAL2 labour clips, Interact one-shot in gameplay, player hit-react, NPC retarget.

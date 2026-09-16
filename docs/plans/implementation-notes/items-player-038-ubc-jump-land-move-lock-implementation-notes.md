# Implementation notes: UBC jump land move lock

**Plan:** `items-player-038-ubc-jump-land-move-lock.md`

`Jump_Land` is in-place (~1.27 s). While `jumpPhase === 'land'`, `update()` still reads WASD (`moving` / facing) but skips XZ displacement. Lock length is always `min(0.12, clip)`. The lock timer ends the phase (and calls `syncAnimation()` so walk/run starts immediately) only while a wish is held; idle land plays the full clip until mixer `finished`.

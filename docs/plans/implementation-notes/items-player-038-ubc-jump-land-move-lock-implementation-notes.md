# Implementation notes: UBC jump land move lock

**Plan:** `items-player-038-ubc-jump-land-move-lock.md`

`Jump_Land` is in-place (~1.27 s). While `jumpPhase === 'land'`, `update()` still reads WASD (`moving` / facing) but skips XZ displacement. Lock length is `min(0.5, clip)` when there is a wish, otherwise the full clip. Unlock calls `syncAnimation()` so walk/run starts immediately.

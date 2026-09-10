# B3 recon — player Y surface snap at passage→chamber (2026-09-10)

> Plan: `docs/plans/world-terrain-008-underground-caves-v2.md`
> Against current `main` source only. No commit archaeology.
> Harness: `src/world/caves/caveGameplayQuery.b3-chamber-snap-recon.test.ts`
> **B3 remains in progress.** Do not treat automated tests as closing it.
> **DO NOT IMPLEMENT YET.**

Manual evidence (User, `seedvale.debug.player.position()` = `PlayerController.mesh.position`):

## Case A — Grota Czarnego Kamienia (`seed=1136726869`)

`cave:0e3cce97` entrance `(135.843, 7.461, -17.814)` yaw `1.571` opening `+X`.

```text
last cave sample     (120.385, 1.445, -16.459)  along=-15.46  lat=+1.35
after surface snap   (119.137, 11.179, -16.365) along=-16.71  lat=+1.45
ΔY ≈ +9.73 m   (matches analytic surfaceY 11.18 at the after-snap XZ)
```

Topology at this seed:

| node | along | floor y | w×h |
|---|---|---|---|
| entrance | 0.00 | 7.46 | 3.00×2.60 |
| transition | -3.75 | 4.57 | 4.45×4.75 |
| passage | -11.37 | 3.25 | 4.30×4.76 |
| widening-bend | **-16.34** | 2.62 | 5.37×5.52 |
| chamber | -21.88 | -3.51 | 9.58×10.96 |

The manual snap sits on the **widening-bend**, not the chamber primitive centre. Chamber is offset (`z=-13.74` vs last-good `z=-16.46`).

## Spatial trace (0.05 m, last-good → after-snap, query Y = 1.445)

**No column gap.** Every sample is a single walkable interval, occupancy true, `queryInterior` true, SDF negative at player Y.

```text
along -15.46  ivl=[1.45..8.59]  raw floor=1.445
along -16.08  ivl=[0.70..8.60]  raw floor=0.697   Δfloor=-0.75
along -16.71  ivl=[0.27..8.60]  raw floor=0.275   Δfloor=-1.17
```

`FLOOR_GRACE=2` still contains player Y. `pickInterval` does **not** return a surface-height floor at Y=1.445 (that would require `floorY ≤ 3.45`).

Along-axis sweep at last-good lateral, Y=1.445, along -12 → -24: still cave. At along≈-21.25 the column **splits**:

```text
[-2.51..0.03],[0.62..7.59]
```

That is a shelf/feature subtraction (rock band), not an empty column. At Y=1.445 `pickInterval` takes the **upper** interval (floor 0.62), still cave, not surface.

Index bounds cover the region (`origin=(101.6,-26)`, chamber x=114 is inside).

**Presentation vs gameplay:** at the reported last-good / after-snap XZ, gameplay SDF/query **does** cover cave void. A “mesh looks like cave but index is empty” hole is **not** present on this 1.25 m segment.

## PlayerController-order walk (primed lastHit)

Production order reconstructed:

```text
wish XZ (8 m/s, dt=1/60)
→ resolvePosition (occupancy-derived beads at current Y)
→ queryColumnIndex + applyCaveGroundHysteresis
→ groundAt: cave floor or sampleHeight
→ integrateVerticalMotion
→ mesh.position.y = next.y
```

On the manual segment, with `lastGroundHit` primed from last-good:

* `src=cave` every tick
* no surface takeover
* floors descend faster than `STEP_DOWN_MAX` (0.45) after ~0.75 m → player becomes **airborne and falls into the chamber**, Y goes **down**, not up
* centerline walk last-good → chamber centre: also no surface takeover

**The deterministic harness does not reproduce the manual +9.73 m snap** when hysteresis has a previous cave hit.

## Who *would* write Y ≈ 11.18

Current code has a single per-frame Y writer while walking:

```text
file:     src/player/PlayerController.ts
function: updateVerticalMotion
          → groundAt
          → integrateVerticalMotion
          → this.mesh.position.y = next.y
```

`groundAt` (`PlayerController.ts`):

```text
cave = caveGround(x, mesh.position.y, z)   // Caves.queryGround
if (cave) return { height: cave.floorY, ceiling: cave.ceilingY }
return { height: sampleHeight(x, z), ceiling: null }   // analytic/chunk surface
```

`integrateVerticalMotion` (`verticalMotion.ts`), grounded branch:

```text
if (grounded && groundY >= y - STEP_DOWN_MAX) {
  return { y: groundY, ... }   // NO step-up cap
}
```

`STEP_DOWN_MAX` (0.45 m) only limits snap **down**. Any `groundY` **above** the player teleports them there in one tick.

Harness check: if `groundAt` ever returns `sampleHeight` ≈ 11.25 at last-good XZ while grounded at Y=1.445, `integrateVerticalMotion` assigns **Y=11.25** (`ΔY>+8`). That matches the manual after-snap Y (surface).

`queryColumnIndex` **cannot** itself return floor≈11.18 at Y=1.445.

So the +9.7 m assignment is:

```text
queryGround returned null (and hysteresis did not keep lastHit)
→ groundAt used sampleHeight ≈ 11.18
→ integrateVerticalMotion groundedSnap wrote mesh.position.y = 11.18
```

`snapToGround()` (`setPosition` / `setGround` / `gapClose`) is the same `groundAt` + direct `mesh.position.y = groundY` path. Not on the walking hot path unless a rebuild/teleport/melee hop ran.

## LAST GOOD / FIRST BAD

Harness **cannot name a production FIRST BAD TICK** for Case A: with primed cave hysteresis the walk never takes surface ground.

```text
HARNESS LAST GOOD (still cave, descending):
  last-good XZ, Y=1.445, src=cave, floor=1.445, occupancy true

HARNESS FIRST BAD:
  none on the manual segment / centerline

COUNTERFACTUAL FIRST BAD (lastHit=null AND raw miss, not observed on this XZ):
  position before: (120.385, 1.445, -16.459)
  groundAt height: sampleHeight ≈ 11.25
  writer: PlayerController.updateVerticalMotion
          → integrateVerticalMotion groundedSnap
  position after: Y ≈ 11.25
```

Runtime state the harness does **not** have:

* live `Caves.lastGroundHit` at the failing frame
* whether `queryGround` was invoked at a non-player Y that frame (only `PlayerController.groundAt` calls it)
* chunk `sampleHeight` vs analytic `sampleBaseHeight` (index uses base; fallback uses `sampleHeight`)
* `collidersNear` from the full world (harness uses cave beads only)
* slope constraint using **surface** heightfield (production `update()` does; XZ only, does not write Y)

## Why existing hysteresis should have stopped Case A, but we cannot prove it fired

```text
Czy istniejący underground-miss / cave hysteresis powinien zatrzymać Case A?
YES — if lastGroundHit was a cave interval and player Y was still ~1.45.
```

`applyCaveGroundHysteresis`: on raw miss, keep `lastHit` when `surfaceY - y > CAVE_UNDERGROUND_MISS` (1.5 m). At last-good, `11.25 - 1.445 ≈ 9.8 > 1.5`.

It fails only when:

1. `lastHit` is already `null`, or
2. `surfaceY - y ≤ 1.5` (player already near the meadow)

`Caves.contains` no longer calls `queryGround` (occupancy only), so torch cannot clear `lastGroundHit`. `queryGround` callers on current `main`: `createApp` adapter → `PlayerController.groundAt` only.

**Contract gap:** cave→surface takeover is “raw miss + (no lastHit or not underground enough)”. There is **no** mouth-exit vs deep-interior-miss distinction beyond the 1.5 m height gap, and no “moving deeper / established interior” term.

If production snapped, the missing runtime fact is **why `lastGroundHit` was null (or why query Y was already near surface)** on that frame — not a hole in the column index on the sampled XZ.

## Passage → chamber continuity (Case A)

SDF/index along the **bent** route is continuous. Chamber centre is off the opening axis. Feature subtraction creates **stacked** intervals near along=-21 (shelf), not an empty gap on the User’s 1.25 m segment.

Walking **opening-axis** past the bend is the wrong centreline; Case A’s last-good lateral (+1.35) still hits widening void.

## Moving-deeper guard

```text
MOVING-DEEPER GUARD: B
```

Useful **secondary** safety net after the spatial/`lastHit` fact is known. At the FIRST BAD counterfactual: distance from entrance ≈ 16 m inward, movement · opening axis < 0 (deeper), `surfaceY - playerY ≈ 9.8 m`, previous ownership was cave. Forbidding surface takeover in that state is exactly what hysteresis already intends (`CAVE_UNDERGROUND_MISS`). A parallel helper is **C** if it only papers over a cleared `lastHit` or a real column gap. Prefer extending `applyCaveGroundHysteresis` (require last cave hit + interior side + large overburden) rather than a new detector.

Do **not** implement a literal “>2 m inside ⇒ never surface” without a mouth-exit path (standing in the portal looking out / walking out the mouth).

## Case B — Jaskinia Milcząca (`seed=4185154392`)

Production name is **Jaskinia** Milcząca (not Grota), id `cave:cf109eda`, entrance ≈ `(152.4, -121.2)`.

Opening-axis (lat=0) sweep:

```text
along=-16  ivl=[-0.72..2.73]  src=cave
along=-17  ivl=[0.69..1.40] then []   raw miss, sdf>0 (solid)
           src=hysteresis (surface takeover NONE in harness)
chamber along=-22.25 is off-axis (bend)
```

```text
CASE B SAME ROOT CAUSE? PARTIAL
```

Same **class**: descent / bend, then gameplay void ends on the path the player is walking. Case B has a **real opening-axis SDF/column gap** before the chamber (straight-along walk misses the bent chamber). Case A’s sampled 1.25 m segment does **not** have that gap. Both would surface-teleport only if hysteresis `lastHit` is missing; harness keeps Y via hysteresis on Case B.

## Cross-seed invariant (from recon, not yet implemented)

A player with established interior cave ground, on the interior side of the mouth, with `surfaceY - y` clearly larger than a mouth exit, must not be assigned outdoor `sampleHeight` in one tick because of a raw column miss — including when walking deeper along a bend/descent.

Also: `integrateVerticalMotion` must not treat an outdoor heightfield 9 m above the player as a legal grounded snap.

## Recommended fix direction (not done)

1. Add a **one-frame debug capture** (below) — harness cannot see `lastGroundHit` in the live session.
2. Once `lastHit` vs raw miss is known: extend `applyCaveGroundHysteresis` so a deep interior miss cannot clear to surface; do not add a second ground detector.
3. Cap grounded snap-**up** (or refuse surface `groundY` when previous tick was cave with large overburden).
4. Case B: occupancy/colliders on the opening-axis pinch should stop the body at rock; empty columns after the bend are a spatial leftover of walking off the centreline, not a reason to take meadow Y.

### Minimal `seedvale.debug` tick capture (User)

If the next manual pass still snaps, log **the failing frame** (not just two positions):

```text
player.x/y/z
surfaceY
queryGround raw floor/ceiling/openSky (or null)
lastGroundHit floor (or null)
hysteresis result source cave|hysteresis|surface
occupancy / queryInterior
grounded, verticalVelocity
along / lateral vs entrance
```

Without `lastGroundHit` + raw query on that exact tick, Case A’s +9.7 m writer is identified **conditionally** (surface fallback + unlimited grounded snap-up), not observed.

## Live capture (`seedvale.debug`, 2026-09-10)

Debug-only ring of the last ~60 player ground-resolution ticks. No gameplay change.

Before entering the cave:

```js
seedvale.debug.clearPlayerGroundTrace()
```

After the snap, copy JSON (pasteable into the next prompt):

```js
copy(JSON.stringify(seedvale.debug.getPlayerGroundTrace(), null, 2))
```

Aliases: `seedvale.debug.player.groundTrace()` / `seedvale.debug.player.clearGroundTrace()`.

Each record is one `updateVerticalMotion` / `snapToGround` / swim tick: `before` (after XZ, before vertical) → `raw` / `lastGroundHit` / `source` (`cave|hysteresis|surface`) / `groundY` → `after` (mesh Y after `integrateVerticalMotion`). `queryInterior` here is raw occupancy on the interior mouth side, not hysteretic `Caves.queryInterior`.

## Classification (Case A)

```text
PRIMARY (assignment path, if miss): D — unsafe surface fallback / unlimited grounded snap-up
PRIMARY (why miss would stick):     C — hysteresis lastHit missing (not observed in harness)
SPATIAL on sampled segment:         not A (no gap at last-good→snap XZ)
SECONDARY / related:                H — bend/chamber off opening axis (clear in Case B)
                                    F — not on Case A sampled XZ
                                    G — verticalMotion snap-up has no cap (enabler, not the miss)
```

I — combination **if** production lastHit was null; harness alone is **not** A.

DO NOT IMPLEMENT YET.

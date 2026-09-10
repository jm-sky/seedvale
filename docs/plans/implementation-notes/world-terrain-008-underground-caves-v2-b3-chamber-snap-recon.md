# B3 recon — player Y surface snap at passage→chamber (2026-09-10)

> Plan: `docs/plans/world-terrain-008-underground-caves-v2.md`
> Against current `main` source only. No commit archaeology.
> Harness: `src/world/caves/caveGameplayQuery.b3-chamber-snap-recon.test.ts`
> **B3 remains in progress.** Do not treat automated tests as closing it.
> Swim-path ownership for this Case A snap is implemented (`worldWaterEligibility.ts`); doorway seam / other B3 work is not.

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

Debug-only ring of the last ~120 player ground-resolution ticks. Auto-latches on a vertical snap (`after.y - before.y > 2`, or cave/hysteresis → surface with overburden > 2 m), keeps 10 post ticks, then ignores further walking. No gameplay change.

Before entering the cave:

```js
seedvale.debug.clearPlayerGroundTrace()
```

After the snap you can stand still; then copy JSON (pasteable into the next prompt):

```js
copy(JSON.stringify(seedvale.debug.getPlayerGroundTrace(), null, 2))
```

The object has `frozen: true`, `triggerReason`, `triggerSeq`, and `ticks`. The triggering sample has `triggerReason` set. `clearPlayerGroundTrace()` resets the latch.

Aliases: `seedvale.debug.player.groundTrace()` / `seedvale.debug.player.clearGroundTrace()`.

Each tick: `before` (after XZ, before vertical) → `raw` / `lastGroundHit` / `source` (`cave|hysteresis|surface`) / `groundY` → `after` (mesh Y after `integrateVerticalMotion`). `queryInterior` here is raw occupancy on the interior mouth side, not hysteretic `Caves.queryInterior`.

## Live failing tick (2026-09-10, latched ground trace)

Root cause is **swim-path vertical ownership**, not cave query / hysteresis.

```text
seq 274  writer=vertical  source=cave  floor=0.56  occupancy=true  falling (vy=-0.68)
seq 275  writer=swim      source=cave  floor=0.11  occupancy=true  after.y=11.19  ΔY=+10.12
seq 276  writer=vertical  source=surface  raw=null   (already outdoors)
```

`Caves.queryGround` / hysteresis stayed `source=cave` on the failing tick. `PlayerController.updateVerticalMotion` took the swim branch because **cave floor Y (0.11) ≤ global `waterLevel` (0.45)**. That predicate was written for heightfield beaches: `groundAt` now returns the cave floor, which is a different vertical space than the ocean plane. `swimFeetY` then used outdoor `sampleFloor` (~11.19) and assigned `mesh.position.y` to the hillside / water mesh.

The same class hits any closed cave whose floor crosses below `waterLevel` (chamber descent, tunnel under a river/lake). Surface-world water is not physically in that void.

**Fix (2026-09-10):** `worldWaterAppliesInCurrentSpace` — resolved **closed cave ground** (rock ceiling from `queryGround` / hysteresis) does not hand vertical ownership to world water, even when strict occupancy / `queryInterior` are briefly false (player a few cm below the floor). Occupancy-closed remains a second guard. Open-sky mouth/approach pits still wade/swim. Underground water bodies need their own occupancy later; this is not a permanent cave-swim ban.

Live follow-up (seq 124): occupancy=false, queryInterior=false, but `source=cave`, ceiling≈-0.02, player Y≈-2.70 (5.9 cm below floor). Occupancy-only guard let swim assign outdoor Y≈10.62. Ceiling/cave-ground ownership is now the primary block.

B3 remains in progress (doorway seam / other entrance work). Manual check: seed `1136726869`, Grota Czarnego Kamienia, walk the passage→chamber descent **into the lower chamber** (Y≈-2.7). Player Y must stay on the cave floor / fall in-cave, not jump to ~10.6. Outdoor swimming/wading must still work.

---

## Chamber ↔ tunnel floor continuity (2026-09-10)

Surface teleports are manually confirmed. New issue: the player can *enter*
the chamber but cannot walk back into the tunnel — the floor is too steep.
Not player movement. Floor profile / topology shaping.

### Recon (this seed, before the ramp)

| node | along | floor y | w×h |
|---|---|---|---|
| widening-bend | -16.34 | 2.62 | 5.37×5.52 |
| chamber | -21.88 | -3.51 | 9.58×10.96 |

ΔY ≈ 6.13 m over ≈ 5.54 m (~48° average). Spatial trace on the last metres:
Δfloor −0.75 m / 0.62 m then −1.17 m / 0.63 m (~62°), above
`SLOPE_MAX_WALKABLE_DEG` (55°). `STEP_DOWN_MAX` (0.45 m) still lets the
player fall *in*. Snap-up does not help a 55°+ wall on the way *out*.

`NOMINAL_DESCENT_PER_METER` (0.12) is not the cliff. `unconstrainedFloorY`
dumps `y = min(y, allowedCeiling - height)` when the chamber is 9–11 m tall
vs widening ~5.5–6.5 m. `seg-chamber` was `[bendPoint, chamberPoint]`.
SDF ellipsoids (`rx = width/2`) overlap that short corridor; smooth union
makes a bowl. Same class for other chamber/branch segments.

Column quantization / shelf-overhang subtraction are not the walk-back
blocker (shelf splits the column later, along≈-21).

### Fix

`walkSegment` in `productionTopology.ts`:

- plan dest Y (nominal + overburden) then **lengthen** XZ so grade ≤
  `MAX_TRAVERSABLE_FLOOR_GRADE` (tan 40°) plus `toWidth * 0.45` when the
  dest is ≥1.5 m wider (chamber ellipsoid must not swallow the ramp);
- densify interiors every `FLOOR_RAMP_STATION_SPACING` (1.5 m);
- lerp floor along the ramp; grow width/height with floor-drop (`tShape`),
  matching `caveSdfField.ts` `segmentStations`;
- `transitionLength` starts at `MOUTH_TRANSITION_RANGE + 1.2` so the mouth
  overburden step (0.35 → 1.4 m at 4 m) is on the entrance ramp.

Player slope/step constants are unchanged. Chamber depth on this seed stays
~5.7 m below the widening (y=2.13 → −3.57). After: `seg-chamber` span 11.1 m,
topology 34.5°, gameplay SDF 46.3°, max 0.36 m step at 0.4 m samples.

Tests: `productionTopology.floor-continuity.test.ts` (topology grade on
several seeds; this seed's gameplay SDF on passage / widening / chamber /
branch). Mouth lip (`seg-transition`) is portal/carve, not this invariant.

B3 still in progress. Manual: same cave, walk **chamber → tunnel and back**
on ordinary movement. Other caves: any chamber entrance that used to dump
height in one station.

## Classification (Case A)

```text
PRIMARY: swim path treated cave floor <= waterLevel as "underwater"
         and assigned outdoor sampleFloor / water mesh Y
NOT:     cave query miss / hysteresis lastHit / surface fallback (those were
         consequences of the swim teleport, seq 276)
```

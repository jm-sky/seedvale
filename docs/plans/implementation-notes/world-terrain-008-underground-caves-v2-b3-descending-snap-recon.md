# Implementation Notes: Underground Caves V2 — B3 Descending-Snap Recon

> Plan: `docs/plans/world-terrain-008-underground-caves-v2.md`
> Recon date: **2026-09-09**
> Scope: remaining “player/camera pops to the surface a few metres past the
> mouth, as the tunnel starts descending” after `ef420657` and `f5bacadb`.
> Diagnostic: `src/world/caves/caveGameplayQuery.b3-descending-trace.test.ts`
> No browser. No fix. B3 stays open.

Current code is source of truth. The 2026-09-08 B3 recon is the collision /
camera *architecture* map. The 2026-09-09 third-pass note in
`world-terrain-008-underground-caves-v2-implementation-notes.md` is
**superseded** for this symptom: its static path sample was right about
`queryGround`, wrong that closing interior `openSky` mouth-exit would remove
the remaining snap.

---

## REPRO

```text
seed = 1136726869
cave = cave:0e3cce97   Grota Czarnego Kamienia
entrance = (135.84259216988767, 7.461348738877641, -17.813611096688362)
yaw = π/2
openingDirection = (+X, 0)     walk inward = −X
mouth width × height = 3.00 × 2.60
```

Production topology (current `buildProductionCaveTopology`, not cached numbers):

| node | along (m) | floor Y | w × h |
|---|---:|---:|---|
| entrance | 0.00 | 7.46 | 3.00 × 2.60 |
| transition | −3.75 | 4.57 | 4.45 × 4.75 |
| passage | −11.37 | 3.25 | 4.30 × 4.76 |
| widening-bend | −16.34 | 2.62 | 5.37 × 5.52 |
| chamber | −21.88 | −3.51 | 9.58 × 10.96 |

Secondary sanity cave on the same seed: `cave:7fd14c30` Grota Mroczna,
opening `+Z`. Same player contracts. Same behind-mouth boom parking in the
throat.

Harness reconstructs `PlayerController.update` order (no THREE player):

```text
wish × MOVE_SPEED × dt
 → applySlopeMovementConstraint(sampleHeight = carved analytic)
 → resolvePosition(collidersActiveAtY)
 → queryColumnIndex + applyCaveGroundHysteresis   (mutates lastGroundHit)
 → caveGroundQuery adapter (openSky → ceilingY null)
 → integrateVerticalMotion + rockCeilingMaxY
 → queryInterior hysteresis (audio only)
 → syncCamera: origin = (x, playerY + lookAtOffset 0.9, z)
               desired = origin + default pitch 0.35 × 12 m boom
               resolveCameraBoom(occupancyAt, carved sampleHeight)
```

`dt = 1/60`, walk speed 8 m/s, start along = +8 m on carved surface, wish
always inward. Camera modes: boom toward mouth (typical walk-in), default
yaw=0, boom toward chamber.

---

## Classification answers

```text
Does player world-space Y change incorrectly?     NO
Does queryGround change cave → surface?           NO
Does strict occupancy fail?                       NO  (feet / look-at)
Does queryInterior fail?                          NO  (after along < −0.5)
Does camera world-space Y jump independently?     YES
Does terrain render become visible despite
  player+camera remaining underground?            YES (can; see E)
```

**CLASSIFICATION: F = B + E**

Not A/C/D. The previous “camera-only because openSky mouth-exit” story is
only **partially** the remaining bug.

---

## LAST GOOD / FIRST BAD / NEXT

Typical walk-in camera = boom **behind the player, toward the mouth**
(opening `+X`), production look (`pitch=0.35`, `distance=12`, look-at +0.9).

User-described station: “kilka metrów od wejścia, gdy tunel zaczyna
schodzić” = topology `transition` at along ≈ −3.75.

### LAST GOOD TICK — tick 214, along = −3.498

```text
player     x=132.211  y=4.106  z=-18.023   (lat -0.21)
           y jump 0.000
surfaceY   10.395     carvedY 10.395      player 6.29 m underground
raw query  hit        hysteresis kept? no
floorY     4.106      ceilingY 9.928      openSky false
ground     cave
occupancy  feet true  look-at true
interior   true (raw true)
vy 0      grounded true
slope      6.43°      wish (-0.133, 0)    collider push 0
lookAtY    5.006      desiredCamY 9.121
camera     (135.405, 6.650, -18.023)
camT       0.283      camAlong -0.437     (parked in the mouth throat)
camSurface 9.969      cam 3.32 m under surface
camOcc     true
boom       originInCave true  originOpenSky false
           march solid  marchT 0.30  missStep 7  missY 6.446
           resolvedOcc true  heightfieldClamp false
sdf        player -0.89  look-at -0.81  camera -0.45
```

### FIRST BAD TICK — tick 218, along = −4.031

Same contracts for the **player**. Camera Y jumps **+1.70 m toward the
hillside** while remaining underground. Camera XZ stays in the throat.

```text
player     x=131.678  y=3.867  z=-18.023
           y jump -0.145   (down the cave floor, not a snap up)
surfaceY   10.452     player 6.59 m underground
raw query  hit        hysteresis kept? no
floorY     3.867      ceilingY 9.751      openSky false
ground     cave
occupancy  feet true  look-at true
interior   true
vy 0      grounded true
lookAtY    4.767      desiredCamY 8.882
camera     (135.436, 8.345, -18.023)
camT       0.333      camAlong -0.407
camSurface 9.962      cam 1.62 m under surface   ← was 3.32 m
camOcc     true
boom       originInCave true  originOpenSky false
           march solid  marchT 0.35  missStep 8  missY 6.413
           classifier resolvedOcc false  heightfieldClamp false
           (final Y matches occupancy.floorY + CAMERA_GROUND_CLEARANCE
            on the throat column, not sampleHeight + 0.45)
sdf        player -0.84  camera -1.48
```

Broken contract on this tick: **third-person camera Y continuity along a
descending interior route**. Player ground / occupancy / interior do not
flip.

### NEXT TICK — tick 225, along = −4.965

```text
player     y=3.664   still cave ground, occupancy true, interior true
camera     (135.066, 6.308, -18.023)
camAlong   -0.777    cam 3.74 m under surface   (Y falls back)
boom       solid, origin still interior, not a mouth exit
```

Camera Y bounces toward the surface at the descent, then drops. It never
hands the player the meadow.

---

## Second failing sample (not the user station, same contract family)

Default look `yaw=0` sends the 12 m boom along **+Z**, across the tunnel
(cave opens +X). First full **surface** camera Y:

### LAST GOOD — tick 268, along = −10.698

```text
player     y=2.792   8.59 m underground   ground cave   occ true   interior true
camera     (125.011, 4.446, -15.957)   6.72 m under surface   camOcc true
boom       originInCave true  originOpenSky false  march solid  t=0.183
```

### FIRST BAD — tick 269, along = −10.831

```text
player     y=2.747   still 8.63 m underground   ground cave   occ true
camera     (124.878, 11.570, -15.393)
camSurface 11.120    camOver -0.45     (= surface + CAMERA_GROUND_CLEARANCE)
camOcc     false
boom       originInCave true  originOpenSky false
           march solid  marchT 0.25  missStep 6  missY 4.881  (still 6 m under surface — a WALL miss)
           resolvedOccupancy false
           heightfieldClamped true
```

### NEXT — tick 270

Same surface-clamped camera Y; player unchanged.

This is the occupancy-null → heightfield clamp. It is independent of the
`f5bacadb` openSky/mouth-exit branch (`interiorExitMarch` is empty on both
caves after that fix).

---

## ROOT CAUSE 1 — occupancy-null heightfield clamp

Evidence:

- Tick 269 (yaw=0): march `solid` at t=0.25, miss still 6 m below the
  heightfield. Final `(x, yAlong, z)` is not in `occupancyIntervalAt`.
- `resolveCameraBoom` then does `y = max(yAlong, sampleHeight + 0.45)`.
- Player Y, `queryGround`, occupancy-at-feet, `queryInterior` unchanged.

Exact code path:

```text
PlayerController.syncCamera
  originY = playerY + lookAtOffset          // 0.9 at default zoom
  resolveCameraBoom
    originOccupancy = occupancyAt(origin)   // true
    marchCaveOccupancy → kind 'solid'       // wall / ceiling, not mouth exit
    t = hitT - PULL_IN
    occupancy = occupancyAt(x, yAlong, z)   // NULL on this sample
    y = sampleHeight(x,z) + CAMERA_GROUND_CLEARANCE   // hillside
```

```109:113:src/player/cameraBoom.ts
  const occupancy = originInCave ? input.occupancyAt?.(x, yAlong, z) ?? null : null
  const y = occupancy
    ? Math.max(yAlong, occupancy.floorY + CAMERA_GROUND_CLEARANCE)
    : Math.max(yAlong, input.sampleHeight(x, z) + CAMERA_GROUND_CLEARANCE)
```

Affected contract: while `originInCave`, a solid-march pull-in must keep the
lens in cave void. Missing occupancy at the discrete final sample must **not**
fall through to the outdoor heightfield. `sampleHeight` here is carved
terrain (hillside above the tunnel).

---

## ROOT CAUSE 2 — 12 m boom parked in the mouth throat (user station)

Evidence:

- From along −1 through −8, behind-mouth `camAlong` stays in `≈ −0.4 … −0.8`
  (mouth throat), while the player walks to −5 / −8.
- Default boom is 12 m; the occupancy march hits the shallow interior /
  surface-clipped roof after a few metres and shortens `t` to 0.18–0.38.
- At along −4 the throat sample lifts camera Y by +1.70 m (6.65 → 8.35),
  shrinking camera overburden 3.32 m → 1.62 m. Next metres drop it back.
- `marchKind` is `solid`, `originOpenSky` is false — this is **not** the
  `f5bacadb` mouth-exit branch.

Exact code path: same `syncCamera` → `marchCaveOccupancy` solid pull-in, then
the occupancy floor clamp (`floorY + 0.45`) on a throat column whose floor is
much higher than the descending player's floor.

Affected contract: interior third-person follow along a descending centreline.
The lens is not allowed to remain a 12 m mouth-look while the body goes down,
nor to inherit the mouth-throat floor as camera Y.

---

## ROOT CAUSE 3 — presentation can produce the same perceived snap (E)

Evidence (no art fix):

- Dual-disc carve crater still extends to along ≈ +5.4 m; mesh aperture
  maxAlong ≲ 1 m (already pinned in
  `caveGameplayQuery.b3-entrance-regression.test.ts`).
- Behind-mouth camera at the descent sits in that throat (`camAlong ≈ −0.4`),
  1.6 m under the local heightfield at the first-bad tick.
- Terrain material is default `FrontSide` (`createTerrainMaterial`). From
  underground, missing cave shell → culled heightfield underside → **sky**.
- Cave material is `DoubleSide`; it only hides sky where the shell exists.
- Entrance overburden is still negative (roof pokes through). Transition
  overburden is only 1.11 m. A throat camera looking slightly up / through
  the doorway leftover sees grass/sky while player+camera coordinates stay
  cave-owned.

Affected contract: hillside doorway / interior sky seam (already a recorded
B3 leftover). It can be the *perceived* snap even when ROOT CAUSE 2’s Y bounce
never reaches `surface + 0.45`.

---

## queryGround / occupancy / queryInterior (current semantics)

`queryGround` (`queryColumnIndex` + one global `lastGroundHit`):

- nearest 0.4 m column, Y-dependent `pickInterval` with `CAVE_FLOOR_GRACE=2`;
- `openSky` only on portal intervals (SDF heightfield-clip is **not** tagged);
- SDF-only interior columns; portal used only where SDF is empty;
- underground miss (`surfaceY − y > 1.5`) retains last cave hit;
- adapter in `createApp.ts` maps `openSky` → `ceilingY: null`.

Strict occupancy / `contains`: **same columns**, `CAVE_OCCUPANCY_EPS=0.05`,
**no** floor grace, **no** hysteresis, **no** portal-vs-interior split other
than what is already in the column. Empty / above clipped ceiling / below
floor → solid. Camera occupancy is this, keyed by **sample Y**.

`queryInterior`: `mouthAlong > MOUTH_INTERIOR_ALONG (0.05)` → false, else
`occupancyContains`. Two-sample hysteresis. Audio / rain only
(`gameLoop.ts`). Does **not** reuse hysteretic `queryGround`. Can disagree
with gameplay ground on the portal (ground cave+openSky, interior false) —
by design.

| State | queryGround | occupancy | queryInterior | expected |
| ----- | ----------- | --------- | ------------- | -------- |
| outside (along +8) | null → surface | false | false | surface |
| mouth (along +2.2) | portal, `openSky` | true | false | walkable pit, not cave interior |
| shallow interior (along −1) | cave, not openSky | true | true | cave |
| descending (along −5) | cave, not openSky | true | true | cave |
| deep interior (along −12) | cave, not openSky | true | true | cave |

On the walking strip these three stay aligned once inward of the mouth plane.
The snap is not a column miss.

---

## Vertical movement (actual order)

```text
1. horizontal wish
2. slope constraint on carved *surface* sampleHeight   // not cave floor
3. resolvePosition (Y-filtered cave beads)
4. groundAt = queryGround(x, currentY, z) or carved surface
5. integrateVerticalMotion
     grounded + groundY >= y − 0.45  → y = groundY (unlimited snap UP)
     else gravity; land on groundY
     maxY = rockCeilingMaxY(ceiling, floor)  // ignored if maxY < floor
6. final (x,y,z)
7. syncCamera
```

No ceiling-below-floor clamp on this path (`openSky` is portal-only; interior
`ceiling − PLAYER_HEIGHT > floor`). No `queryGround` miss, so no surface
fallback. The along 0.00 → −0.40 portal→SDF floor drop is −0.95 m: player
goes airborne (`STEP_DOWN_MAX` 0.45) and **falls**, does not snap up.

Leftover (not the snap): inside the cave, slope still samples the hillside.
At along −1 the carved/analytic slope is ~53° (`SLOPE_MAX_WALKABLE` 55°), so
inward wish collapses to centimetres/tick. Stall, not teleport.

---

## Camera (independent of movement)

```text
player origin (x, playerY + 0.9, z)
 → unconstrained boom (sin/cos yaw/pitch × 12)
 → if origin occupancy: marchCaveOccupancy
      void sample → continue
      miss + y ≥ surface − 0.05 → exit only if originOpenSky else solid
      miss + prev openSky ceiling ≈ surface → exit only if originOpenSky else solid
 → house cylinders (cave beads skipped, r=0.5 < 1.2)
 → t = hitT − 0.2/dist, clamped to minT
 → if occupancy at (x, yAlong, z): y = max(yAlong, floor+0.45)
   else: y = max(yAlong, sampleHeight+0.45)     // ROOT CAUSE 1
```

`withCaveFloorFallback` is **not** on the live `syncCamera` path.

Interior origin can no longer take the mouth-exit branch (`f5bacadb` valid
for that branch). It **can** still sit on the hillside via ROOT CAUSE 1, or
jump toward the hillside via ROOT CAUSE 2 without leaving occupancy.

---

## Grota Mroczna — sanity

`cave:7fd14c30`, opening +Z. Player: no Y snap, no cave→surface, occupancy
and interior hold through along −6. Behind-mouth camera stays below the
local surface into the descent; `camAlong` similarly lags in the throat.
Same two camera contracts, same doorway leftover. No second full recon.

---

## PREVIOUS DIAGNOSIS CHECK

- `ef420657` (open-sky ceilings, portal/SDF stacking, mouth-corridor seals):
  **valid** for those contracts. Descent columns are single walkable
  intervals, not openSky, occupancy true. Did not claim to close this snap.
- `f5bacadb` camera-only / interior `openSky` mouth-exit:
  **partially valid**. That branch existed (static along −0.5…−3.0 openSky
  tags; 12 m boom then followed the heightfield). It is closed
  (`originOpenSky` required; interior SDF clip is not a portal). Manual
  verification after the fix showed no noticeable improvement because the
  remaining symptom is ROOT CAUSE 2 at the user station and ROOT CAUSE 1
  when the boom hits a wall, plus ROOT CAUSE 3 presentation.

---

## RECOMMENDED FIX DIRECTION

Do **not** raise `FLOOR_GRACE`, hysteresis, or column neighbor lookup. The
index is continuous. Do **not** another doorway clip tweak (leftover needs
the rectangular heightfield cut).

Minimal local fix (camera contract, same occupancy owner):

1. If `originInCave` and march is `solid`, **never** heightfield-clamp Y.
   Keep the last void sample, or clamp Y to that sample’s `ceilingY − ε` /
   `floorY + CAMERA_GROUND_CLEARANCE`. Outdoor `sampleHeight` is the wrong
   fallback underground.
2. Optional but likely needed for the user station: when origin is interior
   (`!openSky`), do not let the follow camera remain in the mouth throat
   while the look-at has descended — pull in on occupancy, then keep a
   follow offset along the void, not along the 12 m unconstrained boom that
   immediately hits the shallow roof.

Doorway / terrain-hole / interior sky seam stays the separate leftover
(ROOT CAUSE 3). Fog/darkness must not mask it.

**DO NOT IMPLEMENT YET.**

---

## Harness

`src/world/caves/caveGameplayQuery.b3-descending-trace.test.ts` pins:

- identity / topology for `cave:0e3cce97`;
- player contracts through the descent;
- behind-mouth camera Y bounce at along ≈ −4;
- yaw=0 heightfield clamp leftover at along ≈ −11;
- query table stations;
- Grota Mroczna player contracts.

No Playwright. Browser verification remains the Player’s.

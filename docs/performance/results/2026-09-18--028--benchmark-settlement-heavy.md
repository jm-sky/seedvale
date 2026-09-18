# Seedvale Performance Benchmark Report

> Generated: 2026-09-18T11:31:59.688Z
> Sections:
> - [Seedvale Benchmark]
> - [Seedvale Agent CPU]
> - [Seedvale Grass Finalization]
> - [Seedvale Long Frame Attribution]
> - [Seedvale Render Isolation]

---

[Seedvale Benchmark]

Scenario: settlement-heavy
Duration: 30s
Quality: High
Pixel ratio: 1.25

Reproducibility:
  fixture: tools-001-v1
  seed: 42
  elapsedDays: 0
  timeOfDay: 0.292
  season: spring
  weather: rain
  terrainResolution: 193
  loadRadius: 3
  grassMacroVariation: ON
  viewport: 1536x826
  anchor: (-572.2, -1158.1)
  settlement: Podgórze Górska (-2_-4) terrain=mountain size=XL families=8 residents=15 pos=(-572.2, -1158.1)

FPS:
  avg: 12.9
  min: 8
  p1: 8

Frame time:
  avg: 77.4 ms
  p95: 97.1 ms
  max: 132.6 ms

Rendering:
  draw calls: 2261 avg / 2685 max
  triangles: 7.65M avg
  mirror draws: 395 avg
  geometries: 1030
  textures: 868

Scene (one-pass estimate):
  terrain          draws=76 tris=5.60M meshes=76 inst=76
  grass            draws=89 tris=1.21M meshes=89 inst=118278
  vegetation       draws=214 tris=760.9k meshes=214 inst=617
  environment      draws=265 tris=47.3k meshes=265 inst=279
  settlement       draws=1607 tris=1.38M meshes=1607 inst=3577
  water            draws=49 tris=3.55M meshes=49 inst=49
  npc              draws=458 tris=693.3k meshes=458 inst=458
  fauna            draws=397 tris=151.6k meshes=397 inst=397
  items            draws=405 tris=28.6k meshes=405 inst=405
  other            draws=498 tris=36.3k meshes=498 inst=500

Shadow casters (one-pass estimate):
  terrain          draws=76 tris=5.60M meshes=76 inst=76
  vegetation       draws=202 tris=738.4k meshes=202 inst=605
  environment      draws=265 tris=47.3k meshes=265 inst=279
  settlement       draws=810 tris=831.6k meshes=810 inst=2696
  npc              draws=19 tris=12.8k meshes=19 inst=19
  fauna            draws=8 tris=2.6k meshes=8 inst=8
  items            draws=36 tris=20.2k meshes=36 inst=36
  other            draws=114 tris=25.1k meshes=114 inst=114

Settlement shadow casters (one-pass estimate):
  houseStatic      draws=145 tris=259.2k meshes=145 inst=1577
  houseInteractive draws=56 tris=8.8k meshes=56 inst=56
  fence            draws=14 tris=54.5k meshes=14 inst=270
  storageWoodSettlementPrimary draws=10 tris=8.2k meshes=10 inst=10
  storageWoodSettlementSecondary draws=6 tris=16.9k meshes=6 inst=6
  storageWoodHousehold draws=56 tris=24.9k meshes=56 inst=56
  storageContainer draws=76 tris=9.0k meshes=76 inst=122
  storageHay       draws=8 tris=3.9k meshes=8 inst=8
  storageTrough    draws=24 tris=7.0k meshes=24 inst=70
  workplace        draws=25 tris=15.8k meshes=25 inst=25
  landmarkWellCentral draws=25 tris=9.3k meshes=25 inst=25
  landmarkWellPasture draws=20 tris=7.5k meshes=20 inst=20
  landmarkGarden   draws=11 tris=8.8k meshes=11 inst=11
  landmarkNoticeBoard draws=10 tris=180 meshes=10 inst=10
  fireHouseInteriorLamp draws=28 tris=3.0k meshes=28 inst=28
  fireCampfire     draws=40 tris=1.1k meshes=40 inst=40
  decor            draws=197 tris=391.6k meshes=197 inst=303
  other            draws=59 tris=1.8k meshes=59 inst=59

Systems:
  WATER          8.0 ms
  NPC            7.3 ms
  FAUNA          3.7 ms
  PHYSICS        0.1 ms
  RENDER         45.8 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=45.0 ms draws=2255 tris=7.64M
  hide-grass         render=45.6 ms draws=2168 tris=7.18M
  hide-vegetation    render=43.8 ms draws=2125 tris=6.67M
  hide-vegetation-grass render=47.0 ms draws=2048 tris=6.24M
  hide-environment   render=43.5 ms draws=1977 tris=7.62M
  hide-settlement    render=37.0 ms draws=1271 tris=6.87M
  hide-water         render=45.0 ms draws=2193 tris=6.54M
  hide-terrain       render=41.4 ms draws=2253 tris=3.61M
  hide-npc-fauna     render=28.3 ms draws=1914 tris=7.27M
  no-shadows         render=34.7 ms draws=1929 tris=5.63M
  no-ao              render=45.0 ms draws=2333 tris=7.82M
  no-bloom           render=44.2 ms draws=2329 tris=7.83M
  no-smaa            render=32.7 ms draws=2288 tris=7.68M
  no-god-rays        render=27.4 ms draws=2277 tris=7.67M
  no-film-grade      render=25.0 ms draws=2274 tris=7.67M
  no-postprocessing  render=23.7 ms draws=2250 tris=7.67M
  no-reflections     render=29.6 ms draws=1877 tris=6.63M

Frame attribution:
  frame max: 132.6 ms
  largest labelled hitch: 0 ms
  unattributed: 132.6 ms

Long frames:
  threshold: 80 ms
  count: 154
  worst: 132.6 ms

Recommendation:
RENDER is the largest sustained CPU-measured category, but composer submission time can include GPU wait — not confirmed as a CPU bottleneck without isolation probes.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 53
  Fauna (agents): 31

NPC:
  total: 7.3 ms/frame
  crowd pass: 0.0 ms/frame (15.0 ms cumulative)
  agent updates: 4.0 ms/frame (1490.4 ms cumulative)
  livestock: 2.5 ms/frame (934.4 ms cumulative)
    loaded tick: 2.5 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 2.5 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.3 ms/frame
      life/presentation: 0.7 ms/frame
      other update: 0.3 ms/frame
    update calls/frame: 55.3
    unique animals/frame: 49.4
    duplicate updates/frame: 5.9
    detached animals/frame: 0.0
    dog updates/frame: 12.8
    dog guard scans: 12.8/frame (89.6 predator candidates/frame)
    pest scans: 7.2/frame (7.2 rat candidates/frame)
    nearest scans: 29.4/frame (0.0 candidates/frame)
    water samples: 59.5/frame, 0.10 ms/frame (worst call 1.60 ms)
    collider queries: 59.5/frame, 0.10 ms/frame (worst call 0.20 ms, 12718.3 colliders/frame)
    full-rate agents/frame: 0.6
    reduced-cadence agents/frame: 54.7
    behaviour executions/frame: 29.5
    presentation executions/frame: 29.5
  rats: 0.3 ms/frame (102.0 ms cumulative)
  social: 0.0 ms/frame (6.6 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.4 ms/frame (144.3 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 3.7 ms/frame
  agent updates: 3.7 ms/frame (1374.3 ms cumulative)
  forest sampling: 0.1 ms/frame (54.9 ms cumulative)
  other (spawners/forage/cleanup/...): 0.0 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (16.2 ms cumulative)
    targeting: 0.0 ms/frame (16.8 ms cumulative)
    decision: 0.0 ms/frame (6.6 ms cumulative)
    behaviour: 2.7 ms/frame (998.9 ms cumulative)
    life/presentation: 0.6 ms/frame (216.1 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 19.6
    full-rate agents/frame: 8.3
    reduced-cadence agents/frame: 22.7
    behaviour executions/frame: 19.6
    presentation executions/frame: 19.6

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 122.0
    village scan candidates/frame: 2092.2
    player perception checks/frame: 31.0

  nearest scans: 28.4/frame (10597 calls)
  nearest candidates checked: 778.1/frame (290223 total)
  herd leader scans: 0.3/frame (103 calls)
  herd candidates checked: 8.6/frame (3193 total)

  movement hot-path (plan fauna-033):
    water samples: 319.0/frame, 0.50 ms/frame (worst call 1.30 ms)
    collider queries: 319.0/frame, 0.30 ms/frame (worst call 20.00 ms, 4983.0 colliders/frame)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 53
  Fauna (agents): 31

NPC:
  total: 7.3 ms/frame
  crowd pass: 0.0 ms/frame (15.0 ms cumulative)
  agent updates: 4.0 ms/frame (1490.4 ms cumulative)
  livestock: 2.5 ms/frame (934.4 ms cumulative)
    loaded tick: 2.5 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 2.5 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.3 ms/frame
      life/presentation: 0.7 ms/frame
      other update: 0.3 ms/frame
    update calls/frame: 55.3
    unique animals/frame: 49.4
    duplicate updates/frame: 5.9
    detached animals/frame: 0.0
    dog updates/frame: 12.8
    dog guard scans: 12.8/frame (89.6 predator candidates/frame)
    pest scans: 7.2/frame (7.2 rat candidates/frame)
    nearest scans: 29.4/frame (0.0 candidates/frame)
    water samples: 59.5/frame, 0.10 ms/frame (worst call 1.60 ms)
    collider queries: 59.5/frame, 0.10 ms/frame (worst call 0.20 ms, 12718.3 colliders/frame)
    full-rate agents/frame: 0.6
    reduced-cadence agents/frame: 54.7
    behaviour executions/frame: 29.5
    presentation executions/frame: 29.5
  rats: 0.3 ms/frame (102.0 ms cumulative)
  social: 0.0 ms/frame (6.6 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.4 ms/frame (144.3 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 3.7 ms/frame
  agent updates: 3.7 ms/frame (1374.3 ms cumulative)
  forest sampling: 0.1 ms/frame (54.9 ms cumulative)
  other (spawners/forage/cleanup/...): 0.0 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (16.2 ms cumulative)
    targeting: 0.0 ms/frame (16.8 ms cumulative)
    decision: 0.0 ms/frame (6.6 ms cumulative)
    behaviour: 2.7 ms/frame (998.9 ms cumulative)
    life/presentation: 0.6 ms/frame (216.1 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 19.6
    full-rate agents/frame: 8.3
    reduced-cadence agents/frame: 22.7
    behaviour executions/frame: 19.6
    presentation executions/frame: 19.6

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 122.0
    village scan candidates/frame: 2092.2
    player perception checks/frame: 31.0

  nearest scans: 28.4/frame (10597 calls)
  nearest candidates checked: 778.1/frame (290223 total)
  herd leader scans: 0.3/frame (103 calls)
  herd candidates checked: 8.6/frame (3193 total)

  movement hot-path (plan fauna-033):
    water samples: 319.0/frame, 0.50 ms/frame (worst call 1.30 ms)
    collider queries: 319.0/frame, 0.30 ms/frame (worst call 20.00 ms, 4983.0 colliders/frame)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 15
  empty builds (no instances): 0
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 0.19 ms
    max 0.40 ms

  allocation/setup:
    avg 0.13 ms
    max 0.20 ms
  instanceMatrix bind:
    avg 0.00 ms
    max 0.00 ms
  bounds/finalize (apply worker bounds):
    avg 0.01 ms
    max 0.10 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.03 ms
    max 0.10 ms
  scene attach (`scene.add`):
    avg 0.01 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 0.59 ms
    max 1.20 ms

  per chunk:
    instances avg/max 85433.1 / 266667
    meshes avg/max 3.80 / 4
    geometries avg/max 3.80 / 4
    geometries after lod apply avg/max 6.60 / 7
    instances full/filler: 409748 / 871749
    matrix instances bound: 1281497
    instanced attributes created: 285
    shared material refs: 57
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 14/14
    instances: 153633 (max 32075)
    allocation/setup avg/max: 0.07 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  grain:
    buckets/meshes: 14/14
    instances: 51785 (max 10670)
    allocation/setup avg/max: 0.04 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.01 / 0.10 ms
  herb:
    buckets/meshes: 14/14
    instances: 204330 (max 42240)
    allocation/setup avg/max: 0.01 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  filler:
    buckets/meshes: 15/15
    instances: 871749 (max 181682)
    allocation/setup avg/max: 0.01 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms

---

[Seedvale Long Frame Attribution]

Threshold: 80 ms
Long frames: 154
Shown: 5 worst (by frame ms)

Read: category rows are `withCategory()` spans on that frame; OTHER is
frame total minus those categories (measurement gap, overlapping work,
or unwrapped tick code). Stages are coarse streaming/finalize labels
from the same frame; hitches are existing `recordHitch` events (>= 8 ms).

Worst frame (#1 of 5 shown, 154 total):

[LONG FRAME] 132.6ms
simulate        69.1ms
render          63.0ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           16.0ms
STREAMING        0.0ms
NPC              7.1ms
FAUNA           49.0ms
PHYSICS          0.1ms
RENDER          47.2ms
OTHER           13.2ms

Long frame #2:

[LONG FRAME] 132.5ms
simulate        71.9ms
render          60.0ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           15.3ms
STREAMING        0.0ms
NPC              6.9ms
FAUNA           53.3ms
PHYSICS          0.2ms
RENDER          44.7ms
OTHER           12.1ms

Long frame #3:

[LONG FRAME] 127.6ms
simulate        66.8ms
render          60.5ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           16.0ms
STREAMING        0.0ms
NPC              6.9ms
FAUNA           48.0ms
PHYSICS          0.1ms
RENDER          44.7ms
OTHER           11.9ms

Long frame #4:

[LONG FRAME] 127.1ms
simulate        71.9ms
render          54.8ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           14.9ms
STREAMING        0.0ms
NPC              7.3ms
FAUNA           52.7ms
PHYSICS          0.1ms
RENDER          39.9ms
OTHER           12.2ms

Long frame #5:

[LONG FRAME] 124.7ms
simulate        74.1ms
render          50.1ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.1ms
STREAMING        0.0ms
NPC              9.5ms
FAUNA           50.7ms
PHYSICS          0.2ms
RENDER          50.0ms
OTHER           14.2ms

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=45.0 ms  p95=50.8 ms  max=51.0 ms  Δavg vs baseline=—
  hide-grass           avg=45.6 ms  p95=50.7 ms  max=51.7 ms  Δavg vs baseline=+0.6 ms (+1%)
  hide-vegetation      avg=43.8 ms  p95=46.1 ms  max=46.2 ms  Δavg vs baseline=-1.3 ms (-3%)
  no vegetation/grass  avg=47.0 ms  p95=56.3 ms  max=58.8 ms  Δavg vs baseline=+2.0 ms (+4%)
  hide-environment     avg=43.5 ms  p95=46.4 ms  max=46.7 ms  Δavg vs baseline=-1.5 ms (-3%)
  hide-settlement      avg=37.0 ms  p95=44.2 ms  max=47.0 ms  Δavg vs baseline=-8.0 ms (-18%)
  no water             avg=45.0 ms  p95=49.2 ms  max=49.2 ms  Δavg vs baseline=-0.0 ms (-0%)
  hide-terrain         avg=41.4 ms  p95=43.9 ms  max=44.3 ms  Δavg vs baseline=-3.6 ms (-8%)
  hide-npc-fauna       avg=28.3 ms  p95=31.9 ms  max=32.3 ms  Δavg vs baseline=-16.7 ms (-37%)
  no-shadows           avg=34.7 ms  p95=40.0 ms  max=41.5 ms  Δavg vs baseline=-10.4 ms (-23%)
  no-ao                avg=45.0 ms  p95=53.5 ms  max=55.9 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-bloom             avg=44.2 ms  p95=49.1 ms  max=49.5 ms  Δavg vs baseline=-0.8 ms (-2%)
  no-smaa              avg=32.7 ms  p95=45.0 ms  max=46.1 ms  Δavg vs baseline=-12.3 ms (-27%)
  no-god-rays          avg=27.4 ms  p95=36.6 ms  max=37.3 ms  Δavg vs baseline=-17.6 ms (-39%)
  no-film-grade        avg=25.0 ms  p95=31.6 ms  max=32.8 ms  Δavg vs baseline=-20.0 ms (-44%)
  no postprocessing    avg=23.7 ms  p95=26.3 ms  max=26.6 ms  Δavg vs baseline=-21.3 ms (-47%)
  no mirrors           avg=29.6 ms  p95=39.8 ms  max=42.5 ms  Δavg vs baseline=-15.4 ms (-34%)

CPU/GPU separation (baseline, same RENDER span):
  NOT MEASURED — EXT_disjoint_timer_query_webgl2 is unavailable in this WebGL2 context (unsupported by the GPU/driver/browser, or no query resolved during the baseline window).
  Every render time above is CPU-side wall-clock time only (performance.now() around the render call) — it may include driver/GPU wait and must not be read as isolated CPU cost.

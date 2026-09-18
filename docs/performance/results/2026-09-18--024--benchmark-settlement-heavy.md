# Seedvale Performance Benchmark Report

> Generated: 2026-09-18T09:25:12.455Z
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
  avg: 12.8
  min: 7
  p1: 8

Frame time:
  avg: 77.9 ms
  p95: 104.5 ms
  max: 135.8 ms

Rendering:
  draw calls: 2382 avg / 2804 max
  triangles: 7.75M avg
  mirror draws: 392 avg
  geometries: 1050
  textures: 892

Scene (one-pass estimate):
  terrain          draws=76 tris=5.60M meshes=76 inst=76
  grass            draws=89 tris=1.21M meshes=89 inst=118278
  vegetation       draws=214 tris=760.9k meshes=214 inst=617
  environment      draws=265 tris=47.3k meshes=265 inst=279
  settlement       draws=1901 tris=1.84M meshes=1901 inst=3871
  water            draws=49 tris=3.55M meshes=49 inst=49
  npc              draws=487 tris=694.0k meshes=487 inst=487
  fauna            draws=397 tris=151.6k meshes=397 inst=397
  items            draws=405 tris=28.6k meshes=405 inst=405
  other            draws=497 tris=36.2k meshes=497 inst=499

Shadow casters (one-pass estimate):
  terrain          draws=76 tris=5.60M meshes=76 inst=76
  vegetation       draws=202 tris=738.4k meshes=202 inst=605
  environment      draws=265 tris=47.3k meshes=265 inst=279
  settlement       draws=1496 tris=1.72M meshes=1496 inst=3382
  npc              draws=12 tris=12.3k meshes=12 inst=12
  fauna            draws=17 tris=5.6k meshes=17 inst=17
  items            draws=36 tris=20.2k meshes=36 inst=36
  other            draws=113 tris=25.0k meshes=113 inst=113

Settlement shadow casters (one-pass estimate):
  houseStatic      draws=145 tris=259.2k meshes=145 inst=1577
  houseInteractive draws=56 tris=8.8k meshes=56 inst=56
  fence            draws=14 tris=54.5k meshes=14 inst=270
  storage          draws=474 tris=535.4k meshes=474 inst=566
  workplace        draws=25 tris=15.8k meshes=25 inst=25
  landmark         draws=206 tris=434.6k meshes=206 inst=206
  fireLight        draws=320 tris=21.6k meshes=320 inst=320
  decor            draws=197 tris=391.6k meshes=197 inst=303
  other            draws=59 tris=1.8k meshes=59 inst=59

Systems:
  WATER          8.1 ms
  NPC            7.2 ms
  FAUNA          3.8 ms
  PHYSICS        0.2 ms
  RENDER         46.0 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=47.5 ms draws=2390 tris=7.77M
  hide-grass         render=46.0 ms draws=2357 tris=7.46M
  hide-vegetation    render=42.6 ms draws=2140 tris=6.53M
  hide-vegetation-grass render=46.6 ms draws=2218 tris=6.47M
  hide-environment   render=46.3 ms draws=2146 tris=7.88M
  hide-settlement    render=33.0 ms draws=1289 tris=6.88M
  hide-water         render=41.7 ms draws=2335 tris=6.69M
  hide-terrain       render=44.2 ms draws=2406 tris=3.77M
  hide-npc-fauna     render=31.6 ms draws=2071 tris=7.51M
  no-shadows         render=34.6 ms draws=1836 tris=5.34M
  no-ao              render=40.0 ms draws=2326 tris=7.63M
  no-bloom           render=43.8 ms draws=2377 tris=7.77M
  no-smaa            render=42.4 ms draws=2399 tris=7.80M
  no-god-rays        render=42.6 ms draws=2343 tris=7.64M
  no-film-grade      render=40.8 ms draws=2455 tris=7.93M
  no-postprocessing  render=40.5 ms draws=2319 tris=7.63M
  no-reflections     render=39.7 ms draws=2008 tris=6.76M

Frame attribution:
  frame max: 135.8 ms
  largest labelled hitch: 0 ms
  unattributed: 135.8 ms

Long frames:
  threshold: 80 ms
  count: 125
  worst: 135.8 ms

Recommendation:
RENDER is the largest sustained CPU-measured category, but composer submission time can include GPU wait — not confirmed as a CPU bottleneck without isolation probes.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 53
  Fauna (agents): 31

NPC:
  total: 7.2 ms/frame
  crowd pass: 0.0 ms/frame (15.7 ms cumulative)
  agent updates: 3.8 ms/frame (1414.4 ms cumulative)
  livestock: 2.4 ms/frame (897.6 ms cumulative)
    loaded tick: 2.4 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 2.4 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.2 ms/frame
      life/presentation: 0.7 ms/frame
      other update: 0.3 ms/frame
    update calls/frame: 55.0
    unique animals/frame: 49.2
    duplicate updates/frame: 5.9
    detached animals/frame: 0.0
    dog updates/frame: 12.7
    dog guard scans: 12.7/frame (89.2 predator candidates/frame)
    pest scans: 7.1/frame (7.1 rat candidates/frame)
    nearest scans: 29.5/frame (0.0 candidates/frame)
    water samples: 54.1/frame, 0.10 ms/frame (worst call 0.20 ms)
    collider queries: 54.1/frame, 0.10 ms/frame (worst call 1.30 ms, 11578.6 colliders/frame)
    full-rate agents/frame: 0.5
    reduced-cadence agents/frame: 54.6
    behaviour executions/frame: 29.7
    presentation executions/frame: 29.7
  rats: 0.4 ms/frame (137.5 ms cumulative)
  social: 0.0 ms/frame (4.5 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.4 ms/frame (152.9 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 3.8 ms/frame
  agent updates: 3.8 ms/frame (1399.8 ms cumulative)
  forest sampling: 0.2 ms/frame (55.9 ms cumulative)
  other (spawners/forage/cleanup/...): 0.0 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (15.8 ms cumulative)
    targeting: 0.1 ms/frame (20.1 ms cumulative)
    decision: 0.0 ms/frame (6.6 ms cumulative)
    behaviour: 2.8 ms/frame (1032.2 ms cumulative)
    life/presentation: 0.5 ms/frame (201.5 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 19.5
    full-rate agents/frame: 8.0
    reduced-cadence agents/frame: 23.0
    behaviour executions/frame: 19.5
    presentation executions/frame: 19.5

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 121.6
    village scan candidates/frame: 2085.9
    player perception checks/frame: 31.0

  nearest scans: 28.7/frame (10591 calls)
  nearest candidates checked: 785.1/frame (289705 total)
  herd leader scans: 0.4/frame (133 calls)
  herd candidates checked: 11.2/frame (4123 total)

  movement hot-path (plan fauna-033):
    water samples: 346.6/frame, 0.50 ms/frame (worst call 1.30 ms)
    collider queries: 346.6/frame, 0.30 ms/frame (worst call 1.00 ms, 5551.5 colliders/frame)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 53
  Fauna (agents): 31

NPC:
  total: 7.2 ms/frame
  crowd pass: 0.0 ms/frame (15.7 ms cumulative)
  agent updates: 3.8 ms/frame (1414.4 ms cumulative)
  livestock: 2.4 ms/frame (897.6 ms cumulative)
    loaded tick: 2.4 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 2.4 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.2 ms/frame
      life/presentation: 0.7 ms/frame
      other update: 0.3 ms/frame
    update calls/frame: 55.0
    unique animals/frame: 49.2
    duplicate updates/frame: 5.9
    detached animals/frame: 0.0
    dog updates/frame: 12.7
    dog guard scans: 12.7/frame (89.2 predator candidates/frame)
    pest scans: 7.1/frame (7.1 rat candidates/frame)
    nearest scans: 29.5/frame (0.0 candidates/frame)
    water samples: 54.1/frame, 0.10 ms/frame (worst call 0.20 ms)
    collider queries: 54.1/frame, 0.10 ms/frame (worst call 1.30 ms, 11578.6 colliders/frame)
    full-rate agents/frame: 0.5
    reduced-cadence agents/frame: 54.6
    behaviour executions/frame: 29.7
    presentation executions/frame: 29.7
  rats: 0.4 ms/frame (137.5 ms cumulative)
  social: 0.0 ms/frame (4.5 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.4 ms/frame (152.9 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 3.8 ms/frame
  agent updates: 3.8 ms/frame (1399.8 ms cumulative)
  forest sampling: 0.2 ms/frame (55.9 ms cumulative)
  other (spawners/forage/cleanup/...): 0.0 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (15.8 ms cumulative)
    targeting: 0.1 ms/frame (20.1 ms cumulative)
    decision: 0.0 ms/frame (6.6 ms cumulative)
    behaviour: 2.8 ms/frame (1032.2 ms cumulative)
    life/presentation: 0.5 ms/frame (201.5 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 19.5
    full-rate agents/frame: 8.0
    reduced-cadence agents/frame: 23.0
    behaviour executions/frame: 19.5
    presentation executions/frame: 19.5

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 121.6
    village scan candidates/frame: 2085.9
    player perception checks/frame: 31.0

  nearest scans: 28.7/frame (10591 calls)
  nearest candidates checked: 785.1/frame (289705 total)
  herd leader scans: 0.4/frame (133 calls)
  herd candidates checked: 11.2/frame (4123 total)

  movement hot-path (plan fauna-033):
    water samples: 346.6/frame, 0.50 ms/frame (worst call 1.30 ms)
    collider queries: 346.6/frame, 0.30 ms/frame (worst call 1.00 ms, 5551.5 colliders/frame)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 16
  empty builds (no instances): 2
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 0.43 ms
    max 3.10 ms

  allocation/setup:
    avg 0.32 ms
    max 3.10 ms
  instanceMatrix bind:
    avg 0.00 ms
    max 0.00 ms
  bounds/finalize (apply worker bounds):
    avg 0.00 ms
    max 0.00 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.03 ms
    max 0.10 ms
  scene attach (`scene.add`):
    avg 0.03 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 0.92 ms
    max 3.50 ms

  per chunk:
    instances avg/max 78892.8 / 266667
    meshes avg/max 4.00 / 4
    geometries avg/max 4.00 / 4
    geometries after lod apply avg/max 7.00 / 7
    instances full/filler: 404230 / 858054
    matrix instances bound: 1262284
    instanced attributes created: 320
    shared material refs: 64
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 16/16
    instances: 151553 (max 32075)
    allocation/setup avg/max: 0.11 / 0.60 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  grain:
    buckets/meshes: 16/16
    instances: 50967 (max 10670)
    allocation/setup avg/max: 0.02 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  herb:
    buckets/meshes: 16/16
    instances: 201710 (max 42240)
    allocation/setup avg/max: 0.17 / 2.40 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  filler:
    buckets/meshes: 16/16
    instances: 858054 (max 181682)
    allocation/setup avg/max: 0.01 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms

---

[Seedvale Long Frame Attribution]

Threshold: 80 ms
Long frames: 125
Shown: 5 worst (by frame ms)

Read: category rows are `withCategory()` spans on that frame; OTHER is
frame total minus those categories (measurement gap, overlapping work,
or unwrapped tick code). Stages are coarse streaming/finalize labels
from the same frame; hitches are existing `recordHitch` events (>= 8 ms).

Worst frame (#1 of 5 shown, 125 total):

[LONG FRAME] 135.8ms
simulate        67.2ms
render          68.2ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           16.8ms
STREAMING        0.0ms
NPC              7.4ms
FAUNA           47.4ms
PHYSICS          0.3ms
RENDER          51.4ms
OTHER           12.5ms

Long frame #2:

[LONG FRAME] 135.4ms
simulate        63.5ms
render          71.5ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           19.0ms
STREAMING        0.0ms
NPC              5.6ms
FAUNA           43.3ms
PHYSICS          0.1ms
RENDER          52.6ms
OTHER           14.8ms

Long frame #3:

[LONG FRAME] 135.2ms
simulate        66.1ms
render          68.6ms
TERRAIN          0.0ms
GRASS            0.1ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           16.7ms
STREAMING        0.0ms
NPC              6.1ms
FAUNA           47.3ms
PHYSICS          0.2ms
RENDER          51.9ms
OTHER           12.9ms

Long frame #4:

[LONG FRAME] 131ms
simulate        61.6ms
render          68.9ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           17.1ms
STREAMING        0.0ms
NPC              5.8ms
FAUNA           43.6ms
PHYSICS          0.1ms
RENDER          51.5ms
OTHER           12.9ms

Long frame #5:

[LONG FRAME] 129.2ms
simulate        74.3ms
render          54.6ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.1ms
STREAMING        0.0ms
NPC              9.0ms
FAUNA           51.8ms
PHYSICS          0.1ms
RENDER          54.5ms
OTHER           13.7ms

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=47.5 ms  p95=50.9 ms  max=51.6 ms  Δavg vs baseline=—
  hide-grass           avg=46.0 ms  p95=49.4 ms  max=50.0 ms  Δavg vs baseline=-1.5 ms (-3%)
  hide-vegetation      avg=42.6 ms  p95=47.8 ms  max=48.6 ms  Δavg vs baseline=-4.9 ms (-10%)
  no vegetation/grass  avg=46.6 ms  p95=50.9 ms  max=51.7 ms  Δavg vs baseline=-1.0 ms (-2%)
  hide-environment     avg=46.3 ms  p95=51.0 ms  max=51.3 ms  Δavg vs baseline=-1.2 ms (-3%)
  hide-settlement      avg=33.0 ms  p95=35.3 ms  max=35.4 ms  Δavg vs baseline=-14.5 ms (-31%)
  no water             avg=41.7 ms  p95=44.4 ms  max=44.4 ms  Δavg vs baseline=-5.9 ms (-12%)
  hide-terrain         avg=44.2 ms  p95=62.0 ms  max=70.9 ms  Δavg vs baseline=-3.3 ms (-7%)
  hide-npc-fauna       avg=31.6 ms  p95=38.2 ms  max=40.4 ms  Δavg vs baseline=-15.9 ms (-33%)
  no-shadows           avg=34.6 ms  p95=37.1 ms  max=37.8 ms  Δavg vs baseline=-12.9 ms (-27%)
  no-ao                avg=40.0 ms  p95=42.8 ms  max=43.3 ms  Δavg vs baseline=-7.6 ms (-16%)
  no-bloom             avg=43.8 ms  p95=47.2 ms  max=47.8 ms  Δavg vs baseline=-3.8 ms (-8%)
  no-smaa              avg=42.4 ms  p95=45.5 ms  max=45.8 ms  Δavg vs baseline=-5.1 ms (-11%)
  no-god-rays          avg=42.6 ms  p95=45.1 ms  max=45.6 ms  Δavg vs baseline=-4.9 ms (-10%)
  no-film-grade        avg=40.8 ms  p95=43.7 ms  max=44.8 ms  Δavg vs baseline=-6.7 ms (-14%)
  no postprocessing    avg=40.5 ms  p95=42.9 ms  max=43.3 ms  Δavg vs baseline=-7.1 ms (-15%)
  no mirrors           avg=39.7 ms  p95=43.2 ms  max=44.2 ms  Δavg vs baseline=-7.8 ms (-16%)

CPU/GPU separation (baseline, same RENDER span):
  NOT MEASURED — EXT_disjoint_timer_query_webgl2 is unavailable in this WebGL2 context (unsupported by the GPU/driver/browser, or no query resolved during the baseline window).
  Every render time above is CPU-side wall-clock time only (performance.now() around the render call) — it may include driver/GPU wait and must not be read as isolated CPU cost.

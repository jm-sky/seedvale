# Seedvale Performance Benchmark Report

> Generated: 2026-09-18T09:10:00.778Z
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
  min: 3
  p1: 8

Frame time:
  avg: 78 ms
  p95: 91.5 ms
  max: 287 ms

Rendering:
  draw calls: 2437 avg / 2868 max
  triangles: 7.76M avg
  mirror draws: 394 avg
  geometries: 1050
  textures: 887

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
  settlement       draws=1702 tris=1.77M meshes=1702 inst=3588
  npc              draws=12 tris=12.3k meshes=12 inst=12
  fauna            draws=10 tris=3.2k meshes=10 inst=10
  items            draws=36 tris=20.2k meshes=36 inst=36
  other            draws=113 tris=25.0k meshes=113 inst=113

Settlement shadow casters (one-pass estimate):
  houseStatic      draws=145 tris=259.2k meshes=145 inst=1577
  houseInteractive draws=56 tris=8.8k meshes=56 inst=56
  fence            draws=14 tris=54.5k meshes=14 inst=270
  storage          draws=418 tris=534.7k meshes=418 inst=510
  workplace        draws=25 tris=15.8k meshes=25 inst=25
  landmark         draws=206 tris=434.6k meshes=206 inst=206
  fireLight        draws=40 tris=1.1k meshes=40 inst=40
  decor            draws=197 tris=391.6k meshes=197 inst=303
  other            draws=601 tris=65.4k meshes=601 inst=601

Systems:
  WATER          7.9 ms
  NPC            7.6 ms
  FAUNA          3.7 ms
  PHYSICS        0.2 ms
  RENDER         45.9 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=45.8 ms draws=2446 tris=7.78M
  hide-grass         render=45.3 ms draws=2429 tris=7.49M
  hide-vegetation    render=42.4 ms draws=2269 tris=6.69M
  hide-vegetation-grass render=43.7 ms draws=2236 tris=6.37M
  hide-environment   render=40.9 ms draws=2160 tris=7.74M
  hide-settlement    render=36.3 ms draws=1316 tris=6.99M
  hide-water         render=44.6 ms draws=2436 tris=6.81M
  hide-terrain       render=44.7 ms draws=2395 tris=3.69M
  hide-npc-fauna     render=30.6 ms draws=2073 tris=7.37M
  no-shadows         render=35.4 ms draws=1950 tris=5.63M
  no-ao              render=41.4 ms draws=2442 tris=7.78M
  no-bloom           render=46.1 ms draws=2448 tris=7.80M
  no-smaa            render=43.0 ms draws=2452 tris=7.80M
  no-god-rays        render=44.2 ms draws=2452 tris=7.80M
  no-film-grade      render=22.8 ms draws=2441 tris=7.78M
  no-postprocessing  render=21.0 ms draws=2470 tris=7.91M
  no-reflections     render=22.4 ms draws=2062 tris=6.78M

Frame attribution:
  frame max: 287 ms
  largest labelled hitch: 0 ms
  unattributed: 287 ms

Long frames:
  threshold: 80 ms
  count: 127
  worst: 287 ms

Recommendation:
Largest frame (287 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 53
  Fauna (agents): 31

NPC:
  total: 7.6 ms/frame
  crowd pass: 0.0 ms/frame (15.7 ms cumulative)
  agent updates: 3.9 ms/frame (1391.7 ms cumulative)
  livestock: 2.7 ms/frame (964.9 ms cumulative)
    loaded tick: 2.7 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 2.7 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.5 ms/frame
      life/presentation: 0.7 ms/frame
      other update: 0.3 ms/frame
    update calls/frame: 54.7
    unique animals/frame: 48.9
    duplicate updates/frame: 5.8
    detached animals/frame: 0.0
    dog updates/frame: 12.6
    dog guard scans: 12.6/frame (88.5 predator candidates/frame)
    pest scans: 7.1/frame (7.1 rat candidates/frame)
    nearest scans: 29.1/frame (0.0 candidates/frame)
    water samples: 68.5/frame, 0.10 ms/frame (worst call 0.10 ms)
    collider queries: 68.5/frame, 0.10 ms/frame (worst call 1.80 ms, 15227.0 colliders/frame)
    full-rate agents/frame: 0.4
    reduced-cadence agents/frame: 54.3
    behaviour executions/frame: 29.2
    presentation executions/frame: 29.2
  rats: 0.4 ms/frame (148.9 ms cumulative)
  social: 0.0 ms/frame (6.5 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.4 ms/frame (148.3 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 3.7 ms/frame
  agent updates: 3.7 ms/frame (1312.9 ms cumulative)
  forest sampling: 0.1 ms/frame (49.3 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (16.8 ms cumulative)
    targeting: 0.1 ms/frame (22.4 ms cumulative)
    decision: 0.0 ms/frame (6.4 ms cumulative)
    behaviour: 2.7 ms/frame (946.7 ms cumulative)
    life/presentation: 0.6 ms/frame (202.7 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 19.4
    full-rate agents/frame: 7.9
    reduced-cadence agents/frame: 23.1
    behaviour executions/frame: 19.4
    presentation executions/frame: 19.4

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 120.7
    village scan candidates/frame: 2068.2
    player perception checks/frame: 31.0

  nearest scans: 28.7/frame (10243 calls)
  nearest candidates checked: 783.8/frame (279816 total)
  herd leader scans: 0.3/frame (118 calls)
  herd candidates checked: 10.2/frame (3658 total)

  movement hot-path (plan fauna-033):
    water samples: 109.2/frame, 0.10 ms/frame (worst call 1.30 ms)
    collider queries: 109.2/frame, 0.10 ms/frame (worst call 0.20 ms, 1975.8 colliders/frame)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 53
  Fauna (agents): 31

NPC:
  total: 7.6 ms/frame
  crowd pass: 0.0 ms/frame (15.7 ms cumulative)
  agent updates: 3.9 ms/frame (1391.7 ms cumulative)
  livestock: 2.7 ms/frame (964.9 ms cumulative)
    loaded tick: 2.7 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 2.7 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.5 ms/frame
      life/presentation: 0.7 ms/frame
      other update: 0.3 ms/frame
    update calls/frame: 54.7
    unique animals/frame: 48.9
    duplicate updates/frame: 5.8
    detached animals/frame: 0.0
    dog updates/frame: 12.6
    dog guard scans: 12.6/frame (88.5 predator candidates/frame)
    pest scans: 7.1/frame (7.1 rat candidates/frame)
    nearest scans: 29.1/frame (0.0 candidates/frame)
    water samples: 68.5/frame, 0.10 ms/frame (worst call 0.10 ms)
    collider queries: 68.5/frame, 0.10 ms/frame (worst call 1.80 ms, 15227.0 colliders/frame)
    full-rate agents/frame: 0.4
    reduced-cadence agents/frame: 54.3
    behaviour executions/frame: 29.2
    presentation executions/frame: 29.2
  rats: 0.4 ms/frame (148.9 ms cumulative)
  social: 0.0 ms/frame (6.5 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.4 ms/frame (148.3 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 3.7 ms/frame
  agent updates: 3.7 ms/frame (1312.9 ms cumulative)
  forest sampling: 0.1 ms/frame (49.3 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (16.8 ms cumulative)
    targeting: 0.1 ms/frame (22.4 ms cumulative)
    decision: 0.0 ms/frame (6.4 ms cumulative)
    behaviour: 2.7 ms/frame (946.7 ms cumulative)
    life/presentation: 0.6 ms/frame (202.7 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 19.4
    full-rate agents/frame: 7.9
    reduced-cadence agents/frame: 23.1
    behaviour executions/frame: 19.4
    presentation executions/frame: 19.4

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 120.7
    village scan candidates/frame: 2068.2
    player perception checks/frame: 31.0

  nearest scans: 28.7/frame (10243 calls)
  nearest candidates checked: 783.8/frame (279816 total)
  herd leader scans: 0.3/frame (118 calls)
  herd candidates checked: 10.2/frame (3658 total)

  movement hot-path (plan fauna-033):
    water samples: 109.2/frame, 0.10 ms/frame (worst call 1.30 ms)
    collider queries: 109.2/frame, 0.10 ms/frame (worst call 0.20 ms, 1975.8 colliders/frame)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 22
  empty builds (no instances): 2
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 0.19 ms
    max 0.40 ms

  allocation/setup:
    avg 0.10 ms
    max 0.20 ms
  instanceMatrix bind:
    avg 0.01 ms
    max 0.10 ms
  bounds/finalize (apply worker bounds):
    avg 0.00 ms
    max 0.10 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.05 ms
    max 0.60 ms
  scene attach (`scene.add`):
    avg 0.03 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 0.52 ms
    max 1.30 ms

  per chunk:
    instances avg/max 67166.8 / 266667
    meshes avg/max 3.86 / 4
    geometries avg/max 3.86 / 4
    geometries after lod apply avg/max 6.73 / 7
    instances full/filler: 472605 / 1005065
    matrix instances bound: 1477670
    instanced attributes created: 425
    shared material refs: 85
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 21/21
    instances: 177261 (max 32075)
    allocation/setup avg/max: 0.05 / 0.20 ms
    instanceMatrix bind avg/max: 0.00 / 0.10 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  grain:
    buckets/meshes: 21/21
    instances: 59510 (max 10670)
    allocation/setup avg/max: 0.03 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  herb:
    buckets/meshes: 21/21
    instances: 235834 (max 42240)
    allocation/setup avg/max: 0.02 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.10 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  filler:
    buckets/meshes: 22/22
    instances: 1005065 (max 181682)
    allocation/setup avg/max: 0.01 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.10 ms

---

[Seedvale Long Frame Attribution]

Threshold: 80 ms
Long frames: 127
Shown: 5 worst (by frame ms)

Read: category rows are `withCategory()` spans on that frame; OTHER is
frame total minus those categories (measurement gap, overlapping work,
or unwrapped tick code). Stages are coarse streaming/finalize labels
from the same frame; hitches are existing `recordHitch` events (>= 8 ms).

Worst frame (#1 of 5 shown, 127 total):

[LONG FRAME] 287ms
simulate        16.4ms
render         269.8ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           20.6ms
STREAMING        0.0ms
NPC              0.8ms
FAUNA            1.8ms
PHYSICS          0.2ms
RENDER         249.4ms
OTHER           14.2ms

Long frame #2:

[LONG FRAME] 129.8ms
simulate        39.2ms
render          90.0ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           15.5ms
STREAMING        0.0ms
NPC             14.5ms
FAUNA            2.8ms
PHYSICS          0.3ms
RENDER          74.7ms
OTHER           22.0ms

Long frame #3:

[LONG FRAME] 128.4ms
simulate        37.4ms
render          89.1ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           16.9ms
STREAMING        0.0ms
NPC             15.9ms
FAUNA            1.7ms
PHYSICS          0.2ms
RENDER          72.3ms
OTHER           21.4ms

Long frame #4:

[LONG FRAME] 127.5ms
simulate        64.6ms
render          62.5ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           14.5ms
STREAMING        0.1ms
NPC              7.6ms
FAUNA           46.0ms
PHYSICS          0.2ms
RENDER          48.1ms
OTHER           11.0ms

streaming / stages:
  chunkFinalize                0.1ms
  chunkUpdate                  0.1ms

Long frame #5:

[LONG FRAME] 124.1ms
simulate        65.3ms
render          58.5ms
TERRAIN          0.0ms
GRASS            0.1ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           13.9ms
STREAMING        0.0ms
NPC              7.7ms
FAUNA           43.7ms
PHYSICS          0.2ms
RENDER          44.6ms
OTHER           13.9ms

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=45.8 ms  p95=52.5 ms  max=53.1 ms  Δavg vs baseline=—
  hide-grass           avg=45.3 ms  p95=50.8 ms  max=50.9 ms  Δavg vs baseline=-0.5 ms (-1%)
  hide-vegetation      avg=42.4 ms  p95=46.3 ms  max=47.2 ms  Δavg vs baseline=-3.4 ms (-7%)
  no vegetation/grass  avg=43.7 ms  p95=47.6 ms  max=48.3 ms  Δavg vs baseline=-2.2 ms (-5%)
  hide-environment     avg=40.9 ms  p95=43.7 ms  max=43.9 ms  Δavg vs baseline=-4.9 ms (-11%)
  hide-settlement      avg=36.3 ms  p95=41.6 ms  max=42.9 ms  Δavg vs baseline=-9.5 ms (-21%)
  no water             avg=44.6 ms  p95=47.9 ms  max=48.3 ms  Δavg vs baseline=-1.2 ms (-3%)
  hide-terrain         avg=44.7 ms  p95=51.1 ms  max=51.4 ms  Δavg vs baseline=-1.1 ms (-2%)
  hide-npc-fauna       avg=30.6 ms  p95=32.2 ms  max=32.4 ms  Δavg vs baseline=-15.2 ms (-33%)
  no-shadows           avg=35.4 ms  p95=38.3 ms  max=38.4 ms  Δavg vs baseline=-10.5 ms (-23%)
  no-ao                avg=41.4 ms  p95=43.7 ms  max=44.1 ms  Δavg vs baseline=-4.4 ms (-10%)
  no-bloom             avg=46.1 ms  p95=48.8 ms  max=48.8 ms  Δavg vs baseline=+0.3 ms (+1%)
  no-smaa              avg=43.0 ms  p95=46.6 ms  max=46.8 ms  Δavg vs baseline=-2.8 ms (-6%)
  no-god-rays          avg=44.2 ms  p95=48.5 ms  max=48.5 ms  Δavg vs baseline=-1.6 ms (-4%)
  no-film-grade        avg=22.8 ms  p95=26.1 ms  max=27.9 ms  Δavg vs baseline=-23.0 ms (-50%)
  no postprocessing    avg=21.0 ms  p95=24.0 ms  max=24.9 ms  Δavg vs baseline=-24.8 ms (-54%)
  no mirrors           avg=22.4 ms  p95=28.7 ms  max=33.3 ms  Δavg vs baseline=-23.4 ms (-51%)

CPU/GPU separation (baseline, same RENDER span):
  NOT MEASURED — EXT_disjoint_timer_query_webgl2 is unavailable in this WebGL2 context (unsupported by the GPU/driver/browser, or no query resolved during the baseline window).
  Every render time above is CPU-side wall-clock time only (performance.now() around the render call) — it may include driver/GPU wait and must not be read as isolated CPU cost.

# Seedvale Performance Benchmark Report

> Generated: 2026-09-18T09:56:04.836Z
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
  avg: 7.9
  min: 1
  p1: 2

Frame time:
  avg: 126 ms
  p95: 267.7 ms
  max: 681.5 ms

Rendering:
  draw calls: 2263 avg / 2787 max
  triangles: 7.61M avg
  mirror draws: 370 avg
  geometries: 909
  textures: 604

Scene (one-pass estimate):
  terrain          draws=76 tris=5.60M meshes=76 inst=76
  grass            draws=89 tris=1.21M meshes=89 inst=118278
  vegetation       draws=214 tris=760.9k meshes=214 inst=617
  environment      draws=265 tris=47.3k meshes=265 inst=279
  settlement       draws=2406 tris=2.23M meshes=2406 inst=4771
  water            draws=49 tris=3.55M meshes=49 inst=49
  npc              draws=619 tris=927.0k meshes=619 inst=619
  fauna            draws=469 tris=177.9k meshes=469 inst=469
  items            draws=424 tris=38.9k meshes=424 inst=424
  other            draws=507 tris=36.1k meshes=507 inst=507

Shadow casters (one-pass estimate):
  terrain          draws=76 tris=5.60M meshes=76 inst=76
  vegetation       draws=202 tris=738.4k meshes=202 inst=605
  environment      draws=265 tris=47.3k meshes=265 inst=279
  settlement       draws=1885 tris=2.08M meshes=1885 inst=4142
  npc              draws=12 tris=12.3k meshes=12 inst=12
  fauna            draws=12 tris=7.2k meshes=12 inst=12
  items            draws=55 tris=30.5k meshes=55 inst=55
  other            draws=123 tris=24.9k meshes=123 inst=123

Settlement shadow casters (one-pass estimate):
  houseStatic      draws=193 tris=300.0k meshes=193 inst=1943
  houseInteractive draws=72 tris=11.3k meshes=72 inst=72
  fence            draws=18 tris=61.0k meshes=18 inst=302
  storageWood      draws=478 tris=674.8k meshes=478 inst=478
  storageContainer draws=100 tris=11.7k meshes=100 inst=158
  storageHay       draws=10 tris=4.9k meshes=10 inst=10
  storageTrough    draws=30 tris=8.8k meshes=30 inst=88
  workplace        draws=30 tris=18.3k meshes=30 inst=30
  landmark         draws=273 tris=556.8k meshes=273 inst=273
  fireHouseExteriorLamp draws=324 tris=22.5k meshes=324 inst=324
  fireHouseInteriorLamp draws=36 tris=3.9k meshes=36 inst=36
  fireCampfire     draws=44 tris=1.7k meshes=44 inst=44
  decor            draws=198 tris=398.6k meshes=198 inst=305
  other            draws=79 tris=2.2k meshes=79 inst=79

Systems:
  WATER          19.7 ms
  NPC            11.5 ms
  FAUNA          3.6 ms
  PHYSICS        0.2 ms
  RENDER         76.6 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=0.0 ms draws=0 tris=0
  hide-grass         render=0.0 ms draws=0 tris=0
  hide-vegetation    render=48.1 ms draws=2538 tris=7.48M
  hide-vegetation-grass render=0.0 ms draws=0 tris=0
  hide-environment   render=47.4 ms draws=1734 tris=6.70M
  hide-settlement    render=0.0 ms draws=0 tris=0
  hide-water         render=57.3 ms draws=2766 tris=7.83M
  hide-terrain       render=0.0 ms draws=0 tris=0
  hide-npc-fauna     render=0.0 ms draws=0 tris=0
  no-shadows         render=121.2 ms draws=2287 tris=6.51M
  no-ao              render=0.0 ms draws=0 tris=0
  no-bloom           render=0.0 ms draws=0 tris=0
  no-smaa            render=54.7 ms draws=2776 tris=8.80M
  no-god-rays        render=0.0 ms draws=0 tris=0
  no-film-grade      render=54.3 ms draws=1990 tris=6.75M
  no-postprocessing  render=0.0 ms draws=0 tris=0
  no-reflections     render=60.1 ms draws=1990 tris=6.75M

Frame attribution:
  frame max: 681.5 ms
  largest labelled hitch: 0 ms
  unattributed: 681.5 ms

Long frames:
  threshold: 80 ms
  count: 26
  worst: 681.5 ms

Recommendation:
Largest frame (681.5 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 69
  Fauna (agents): 31

NPC:
  total: 11.5 ms/frame
  crowd pass: 0.1 ms/frame (2.5 ms cumulative)
  agent updates: 5.0 ms/frame (151.2 ms cumulative)
  livestock: 4.5 ms/frame (136.3 ms cumulative)
    loaded tick: 4.5 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 4.5 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.1 ms/frame
      behaviour: 2.3 ms/frame
      life/presentation: 1.2 ms/frame
      other update: 0.6 ms/frame
    update calls/frame: 68.1
    unique animals/frame: 55.3
    duplicate updates/frame: 12.8
    detached animals/frame: 0.0
    dog updates/frame: 15.9
    dog guard scans: 15.9/frame (111.5 predator candidates/frame)
    pest scans: 8.7/frame (8.7 rat candidates/frame)
    nearest scans: 36.5/frame (0.0 candidates/frame)
    water samples: 46.6/frame, 0.10 ms/frame (worst call 0.70 ms)
    collider queries: 46.6/frame, 0.10 ms/frame (worst call 1.00 ms, 8761.3 colliders/frame)
    full-rate agents/frame: 0.6
    reduced-cadence agents/frame: 67.5
    behaviour executions/frame: 36.7
    presentation executions/frame: 36.7
  rats: 0.9 ms/frame (25.7 ms cumulative)
  social: 0.0 ms/frame (0.7 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.8 ms/frame (23.6 ms cumulative)
  unattributed: 0.2 ms/frame

FAUNA:
  total: 3.6 ms/frame
  agent updates: 3.2 ms/frame (94.6 ms cumulative)
  forest sampling: 0.2 ms/frame (6.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.4 ms/frame

  AnimalAgent sections:
    sensing: 0.1 ms/frame (1.7 ms cumulative)
    targeting: 0.1 ms/frame (3.5 ms cumulative)
    decision: 0.0 ms/frame (1.4 ms cumulative)
    behaviour: 1.3 ms/frame (37.9 ms cumulative)
    life/presentation: 1.0 ms/frame (30.9 ms cumulative)
    other update: 0.4 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 19.5
    full-rate agents/frame: 7.9
    reduced-cadence agents/frame: 23.1
    behaviour executions/frame: 19.5
    presentation executions/frame: 19.5

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 144.7
    village scan candidates/frame: 3554.2
    player perception checks/frame: 31.0

  nearest scans: 28.6/frame (857 calls)
  nearest candidates checked: 839.1/frame (25172 total)
  herd leader scans: 0.0/frame (1 calls)
  herd candidates checked: 1.0/frame (31 total)

  movement hot-path (plan fauna-033):
    water samples: 28.0/frame, 0.10 ms/frame (worst call 0.10 ms)
    collider queries: 28.0/frame, 0.10 ms/frame (worst call 0.60 ms, 354.4 colliders/frame)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 69
  Fauna (agents): 31

NPC:
  total: 11.5 ms/frame
  crowd pass: 0.1 ms/frame (2.5 ms cumulative)
  agent updates: 5.0 ms/frame (151.2 ms cumulative)
  livestock: 4.5 ms/frame (136.3 ms cumulative)
    loaded tick: 4.5 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 4.5 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.1 ms/frame
      behaviour: 2.3 ms/frame
      life/presentation: 1.2 ms/frame
      other update: 0.6 ms/frame
    update calls/frame: 68.1
    unique animals/frame: 55.3
    duplicate updates/frame: 12.8
    detached animals/frame: 0.0
    dog updates/frame: 15.9
    dog guard scans: 15.9/frame (111.5 predator candidates/frame)
    pest scans: 8.7/frame (8.7 rat candidates/frame)
    nearest scans: 36.5/frame (0.0 candidates/frame)
    water samples: 46.6/frame, 0.10 ms/frame (worst call 0.70 ms)
    collider queries: 46.6/frame, 0.10 ms/frame (worst call 1.00 ms, 8761.3 colliders/frame)
    full-rate agents/frame: 0.6
    reduced-cadence agents/frame: 67.5
    behaviour executions/frame: 36.7
    presentation executions/frame: 36.7
  rats: 0.9 ms/frame (25.7 ms cumulative)
  social: 0.0 ms/frame (0.7 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.8 ms/frame (23.6 ms cumulative)
  unattributed: 0.2 ms/frame

FAUNA:
  total: 3.6 ms/frame
  agent updates: 3.2 ms/frame (94.6 ms cumulative)
  forest sampling: 0.2 ms/frame (6.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.4 ms/frame

  AnimalAgent sections:
    sensing: 0.1 ms/frame (1.7 ms cumulative)
    targeting: 0.1 ms/frame (3.5 ms cumulative)
    decision: 0.0 ms/frame (1.4 ms cumulative)
    behaviour: 1.3 ms/frame (37.9 ms cumulative)
    life/presentation: 1.0 ms/frame (30.9 ms cumulative)
    other update: 0.4 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 19.5
    full-rate agents/frame: 7.9
    reduced-cadence agents/frame: 23.1
    behaviour executions/frame: 19.5
    presentation executions/frame: 19.5

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 144.7
    village scan candidates/frame: 3554.2
    player perception checks/frame: 31.0

  nearest scans: 28.6/frame (857 calls)
  nearest candidates checked: 839.1/frame (25172 total)
  herd leader scans: 0.0/frame (1 calls)
  herd candidates checked: 1.0/frame (31 total)

  movement hot-path (plan fauna-033):
    water samples: 28.0/frame, 0.10 ms/frame (worst call 0.10 ms)
    collider queries: 28.0/frame, 0.10 ms/frame (worst call 0.60 ms, 354.4 colliders/frame)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 14
  empty builds (no instances): 2
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 0.21 ms
    max 0.40 ms

  allocation/setup:
    avg 0.12 ms
    max 0.30 ms
  instanceMatrix bind:
    avg 0.01 ms
    max 0.10 ms
  bounds/finalize (apply worker bounds):
    avg 0.00 ms
    max 0.00 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.04 ms
    max 0.10 ms
  scene attach (`scene.add`):
    avg 0.04 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 0.44 ms
    max 1.10 ms

  per chunk:
    instances avg/max 95645.0 / 266667
    meshes avg/max 4.00 / 4
    geometries avg/max 4.00 / 4
    geometries after lod apply avg/max 7.00 / 7
    instances full/filler: 428142 / 910888
    matrix instances bound: 1339030
    instanced attributes created: 280
    shared material refs: 56
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 14/14
    instances: 160861 (max 32075)
    allocation/setup avg/max: 0.06 / 0.20 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  grain:
    buckets/meshes: 14/14
    instances: 53996 (max 10670)
    allocation/setup avg/max: 0.03 / 0.20 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  herb:
    buckets/meshes: 14/14
    instances: 213285 (max 42240)
    allocation/setup avg/max: 0.01 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  filler:
    buckets/meshes: 14/14
    instances: 910888 (max 181682)
    allocation/setup avg/max: 0.01 / 0.10 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms

---

[Seedvale Long Frame Attribution]

Threshold: 80 ms
Long frames: 26
Shown: 5 worst (by frame ms)

Read: category rows are `withCategory()` spans on that frame; OTHER is
frame total minus those categories (measurement gap, overlapping work,
or unwrapped tick code). Stages are coarse streaming/finalize labels
from the same frame; hitches are existing `recordHitch` events (>= 8 ms).

Worst frame (#1 of 5 shown, 26 total):

[LONG FRAME] 681.5ms
simulate        36.4ms
render         643.0ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER          329.3ms
STREAMING        0.0ms
NPC             13.7ms
FAUNA            3.9ms
PHYSICS          0.2ms
RENDER         313.8ms
OTHER           20.6ms

Long frame #2:

[LONG FRAME] 323.2ms
simulate        42.0ms
render         278.9ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.1ms
STREAMING        0.2ms
NPC             18.7ms
FAUNA            4.5ms
PHYSICS          0.3ms
RENDER         278.9ms
OTHER           20.5ms

streaming / stages:
  chunkUpdate                  0.1ms

Long frame #3:

[LONG FRAME] 199.8ms
simulate        33.1ms
render         166.0ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.2ms
STREAMING        0.0ms
NPC             11.9ms
FAUNA            6.0ms
PHYSICS          0.1ms
RENDER         166.0ms
OTHER           15.6ms

Long frame #4:

[LONG FRAME] 172.4ms
simulate        36.2ms
render         135.5ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           17.7ms
STREAMING        0.0ms
NPC             16.0ms
FAUNA            2.2ms
PHYSICS          0.3ms
RENDER         117.9ms
OTHER           18.3ms

Long frame #5:

[LONG FRAME] 118.8ms
simulate        34.5ms
render          83.9ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           22.2ms
STREAMING        0.0ms
NPC             15.2ms
FAUNA            2.6ms
PHYSICS          0.2ms
RENDER          61.7ms
OTHER           16.9ms

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=—
  hide-grass           avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  hide-vegetation      avg=48.1 ms  p95=48.1 ms  max=48.1 ms  Δavg vs baseline=+48.1 ms (+0%)
  no vegetation/grass  avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  hide-environment     avg=47.4 ms  p95=47.4 ms  max=47.4 ms  Δavg vs baseline=+47.4 ms (+0%)
  hide-settlement      avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no water             avg=57.3 ms  p95=57.3 ms  max=57.3 ms  Δavg vs baseline=+57.3 ms (+0%)
  hide-terrain         avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  hide-npc-fauna       avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-shadows           avg=121.2 ms  p95=121.2 ms  max=121.2 ms  Δavg vs baseline=+121.2 ms (+0%)
  no-ao                avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-bloom             avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-smaa              avg=54.7 ms  p95=54.7 ms  max=54.7 ms  Δavg vs baseline=+54.7 ms (+0%)
  no-god-rays          avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-film-grade        avg=54.3 ms  p95=54.3 ms  max=54.3 ms  Δavg vs baseline=+54.3 ms (+0%)
  no postprocessing    avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no mirrors           avg=60.1 ms  p95=60.1 ms  max=60.1 ms  Δavg vs baseline=+60.1 ms (+0%)

CPU/GPU separation (baseline, same RENDER span):
  NOT MEASURED — EXT_disjoint_timer_query_webgl2 is unavailable in this WebGL2 context (unsupported by the GPU/driver/browser, or no query resolved during the baseline window).
  Every render time above is CPU-side wall-clock time only (performance.now() around the render call) — it may include driver/GPU wait and must not be read as isolated CPU cost.

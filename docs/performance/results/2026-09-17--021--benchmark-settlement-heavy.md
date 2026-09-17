# Seedvale Performance Benchmark Report

> Generated: 2026-09-17T12:37:03.063Z
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
Pixel ratio: 1

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
  viewport: 1920x945
  anchor: (-572.2, -1158.1)
  settlement: Podgórze Górska (-2_-4) terrain=mountain size=XL families=8 residents=15 pos=(-572.2, -1158.1)

FPS:
  avg: 17.1
  min: 5
  p1: 9

Frame time:
  avg: 58.5 ms
  p95: 85.4 ms
  max: 203.2 ms

Rendering:
  draw calls: 2399 avg / 2825 max
  triangles: 7.77M avg
  mirror draws: 394 avg
  geometries: 1062
  textures: 892

Scene (one-pass estimate):
  terrain        draws=76 tris=5.60M meshes=76 inst=76
  grass          draws=89 tris=1.21M meshes=89 inst=118278
  vegetation     draws=214 tris=760.9k meshes=214 inst=617
  environment    draws=191 tris=40.0k meshes=191 inst=205
  settlement     draws=1901 tris=1.84M meshes=1901 inst=3871
  water          draws=49 tris=3.55M meshes=49 inst=49
  npc            draws=487 tris=694.0k meshes=487 inst=487
  fauna          draws=397 tris=151.6k meshes=397 inst=397
  items          draws=405 tris=28.6k meshes=405 inst=405
  other          draws=498 tris=36.3k meshes=498 inst=500

Systems:
  WATER          5.6 ms
  NPC            6.2 ms
  FAUNA          2.8 ms
  PHYSICS        0.1 ms
  RENDER         33.0 ms

Detected bottlenecks:
  1. RENDER
  2. NPC
  3. WATER

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=46.5 ms draws=2416 tris=7.82M
  hide-grass         render=48.5 ms draws=2386 tris=7.51M
  hide-vegetation    render=28.7 ms draws=2161 tris=6.57M
  hide-vegetation-grass render=27.1 ms draws=2129 tris=6.25M
  hide-environment   render=28.3 ms draws=2200 tris=7.78M
  hide-settlement    render=22.9 ms draws=1248 tris=6.89M
  hide-water         render=26.8 ms draws=2416 tris=6.86M
  hide-terrain       render=33.2 ms draws=2314 tris=3.68M
  hide-npc-fauna     render=18.3 ms draws=2089 tris=7.54M
  no-shadows         render=22.7 ms draws=1892 tris=5.60M
  no-ao              render=27.1 ms draws=2418 tris=7.83M
  no-bloom           render=31.2 ms draws=2450 tris=7.93M
  no-smaa            render=34.3 ms draws=2411 tris=7.80M
  no-god-rays        render=35.9 ms draws=2411 tris=7.80M
  no-film-grade      render=36.3 ms draws=2362 tris=7.66M
  no-postprocessing  render=40.6 ms draws=2452 tris=7.96M
  no-reflections     render=38.0 ms draws=2023 tris=6.78M

Frame attribution:
  frame max: 203.2 ms
  largest labelled hitch: 0 ms
  unattributed: 203.2 ms

Long frames:
  threshold: 80 ms
  count: 36
  worst: 203.2 ms

Recommendation:
Largest frame (203.2 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 53
  Fauna (agents): 31

NPC:
  total: 6.2 ms/frame
  crowd pass: 0.0 ms/frame (13.7 ms cumulative)
  agent updates: 3.5 ms/frame (1609.5 ms cumulative)
  livestock: 2.2 ms/frame (999.3 ms cumulative)
    loaded tick: 2.2 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 2.1 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.2 ms/frame
      life/presentation: 0.6 ms/frame
      other update: 0.2 ms/frame
    update calls/frame: 55.0
    unique animals/frame: 49.1
    duplicate updates/frame: 5.9
    detached animals/frame: 0.0
    dog updates/frame: 12.7
    dog guard scans: 12.7/frame (89.2 predator candidates/frame)
    pest scans: 7.1/frame (7.1 rat candidates/frame)
    nearest scans: 29.5/frame (0.0 candidates/frame)
    water samples: 64.1/frame, 0.10 ms/frame (worst call 1.00 ms)
    collider queries: 64.1/frame, 0.10 ms/frame (worst call 0.70 ms, 13932.9 colliders/frame)
    full-rate agents/frame: 0.4
    reduced-cadence agents/frame: 54.6
    behaviour executions/frame: 29.5
    presentation executions/frame: 29.3
  rats: 0.2 ms/frame (86.4 ms cumulative)
  social: 0.0 ms/frame (4.6 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.3 ms/frame (128.0 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 2.8 ms/frame
  agent updates: 2.7 ms/frame (1253.3 ms cumulative)
  forest sampling: 0.1 ms/frame (67.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.0 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (17.2 ms cumulative)
    targeting: 0.0 ms/frame (22.9 ms cumulative)
    decision: 0.0 ms/frame (10.0 ms cumulative)
    behaviour: 1.7 ms/frame (788.1 ms cumulative)
    life/presentation: 0.6 ms/frame (278.7 ms cumulative)
    other update: 0.1 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 20.1
    full-rate agents/frame: 9.2
    reduced-cadence agents/frame: 21.8
    behaviour executions/frame: 20.1
    presentation executions/frame: 20.1

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 121.7
    village scan candidates/frame: 2090.6
    player perception checks/frame: 31.0

  nearest scans: 28.4/frame (13111 calls)
  nearest candidates checked: 770.8/frame (355347 total)
  herd leader scans: 0.2/frame (96 calls)
  herd candidates checked: 6.5/frame (2976 total)

  movement hot-path (plan fauna-033):
    water samples: 40.5/frame, 0.10 ms/frame (worst call 1.00 ms)
    collider queries: 40.5/frame, 0.10 ms/frame (worst call 6.70 ms, 603.7 colliders/frame)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 53
  Fauna (agents): 31

NPC:
  total: 6.2 ms/frame
  crowd pass: 0.0 ms/frame (13.7 ms cumulative)
  agent updates: 3.5 ms/frame (1609.5 ms cumulative)
  livestock: 2.2 ms/frame (999.3 ms cumulative)
    loaded tick: 2.2 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 2.1 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.2 ms/frame
      life/presentation: 0.6 ms/frame
      other update: 0.2 ms/frame
    update calls/frame: 55.0
    unique animals/frame: 49.1
    duplicate updates/frame: 5.9
    detached animals/frame: 0.0
    dog updates/frame: 12.7
    dog guard scans: 12.7/frame (89.2 predator candidates/frame)
    pest scans: 7.1/frame (7.1 rat candidates/frame)
    nearest scans: 29.5/frame (0.0 candidates/frame)
    water samples: 64.1/frame, 0.10 ms/frame (worst call 1.00 ms)
    collider queries: 64.1/frame, 0.10 ms/frame (worst call 0.70 ms, 13932.9 colliders/frame)
    full-rate agents/frame: 0.4
    reduced-cadence agents/frame: 54.6
    behaviour executions/frame: 29.5
    presentation executions/frame: 29.3
  rats: 0.2 ms/frame (86.4 ms cumulative)
  social: 0.0 ms/frame (4.6 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.3 ms/frame (128.0 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 2.8 ms/frame
  agent updates: 2.7 ms/frame (1253.3 ms cumulative)
  forest sampling: 0.1 ms/frame (67.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.0 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (17.2 ms cumulative)
    targeting: 0.0 ms/frame (22.9 ms cumulative)
    decision: 0.0 ms/frame (10.0 ms cumulative)
    behaviour: 1.7 ms/frame (788.1 ms cumulative)
    life/presentation: 0.6 ms/frame (278.7 ms cumulative)
    other update: 0.1 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 20.1
    full-rate agents/frame: 9.2
    reduced-cadence agents/frame: 21.8
    behaviour executions/frame: 20.1
    presentation executions/frame: 20.1

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 121.7
    village scan candidates/frame: 2090.6
    player perception checks/frame: 31.0

  nearest scans: 28.4/frame (13111 calls)
  nearest candidates checked: 770.8/frame (355347 total)
  herd leader scans: 0.2/frame (96 calls)
  herd candidates checked: 6.5/frame (2976 total)

  movement hot-path (plan fauna-033):
    water samples: 40.5/frame, 0.10 ms/frame (worst call 1.00 ms)
    collider queries: 40.5/frame, 0.10 ms/frame (worst call 6.70 ms, 603.7 colliders/frame)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 17
  empty builds (no instances): 2
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 0.19 ms
    max 0.80 ms

  allocation/setup:
    avg 0.12 ms
    max 0.80 ms
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
    avg 0.05 ms
    max 0.40 ms
  callback total (build + lod + attach):
    avg 0.56 ms
    max 1.50 ms

  per chunk:
    instances avg/max 70361.1 / 266667
    meshes avg/max 3.82 / 4
    geometries avg/max 3.82 / 4
    geometries after lod apply avg/max 6.65 / 7
    instances full/filler: 383192 / 812947
    matrix instances bound: 1196139
    instanced attributes created: 325
    shared material refs: 65
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 16/16
    instances: 143530 (max 32075)
    allocation/setup avg/max: 0.04 / 0.20 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  grain:
    buckets/meshes: 16/16
    instances: 48344 (max 10670)
    allocation/setup avg/max: 0.02 / 0.20 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  herb:
    buckets/meshes: 16/16
    instances: 191318 (max 42240)
    allocation/setup avg/max: 0.06 / 0.60 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  filler:
    buckets/meshes: 17/17
    instances: 812947 (max 181682)
    allocation/setup avg/max: 0.02 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms

---

[Seedvale Long Frame Attribution]

Threshold: 80 ms
Long frames: 36
Shown: 5 worst (by frame ms)

Read: category rows are `withCategory()` spans on that frame; OTHER is
frame total minus those categories (measurement gap, overlapping work,
or unwrapped tick code). Stages are coarse streaming/finalize labels
from the same frame; hitches are existing `recordHitch` events (>= 8 ms).

Worst frame (#1 of 5 shown, 36 total):

[LONG FRAME] 203.2ms
simulate        18.8ms
render         183.4ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.2ms
STREAMING        0.1ms
NPC              3.0ms
FAUNA            3.2ms
PHYSICS          0.2ms
RENDER         183.4ms
OTHER           13.1ms

Long frame #2:

[LONG FRAME] 128.6ms
simulate        31.8ms
render          96.3ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.1ms
STREAMING        0.0ms
NPC             11.3ms
FAUNA            3.2ms
PHYSICS          0.1ms
RENDER          96.2ms
OTHER           17.7ms

Long frame #3:

[LONG FRAME] 127.7ms
simulate        35.3ms
render          91.8ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.1ms
STREAMING        0.0ms
NPC             14.2ms
FAUNA            3.2ms
PHYSICS          0.2ms
RENDER          91.7ms
OTHER           18.3ms

Long frame #4:

[LONG FRAME] 125.1ms
simulate        28.3ms
render          96.5ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           13.6ms
STREAMING        0.0ms
NPC              7.3ms
FAUNA            2.9ms
PHYSICS          0.2ms
RENDER          83.0ms
OTHER           18.1ms

Long frame #5:

[LONG FRAME] 114.4ms
simulate        60.2ms
render          54.0ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           13.7ms
STREAMING        0.0ms
NPC              8.8ms
FAUNA           36.9ms
PHYSICS          0.0ms
RENDER          40.3ms
OTHER           14.7ms

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=46.5 ms  p95=50.8 ms  max=52.0 ms  Δavg vs baseline=—
  hide-grass           avg=48.5 ms  p95=69.1 ms  max=75.6 ms  Δavg vs baseline=+2.0 ms (+4%)
  hide-vegetation      avg=28.7 ms  p95=31.5 ms  max=31.9 ms  Δavg vs baseline=-17.7 ms (-38%)
  no vegetation/grass  avg=27.1 ms  p95=30.1 ms  max=30.2 ms  Δavg vs baseline=-19.4 ms (-42%)
  hide-environment     avg=28.3 ms  p95=33.1 ms  max=34.9 ms  Δavg vs baseline=-18.1 ms (-39%)
  hide-settlement      avg=22.9 ms  p95=27.6 ms  max=28.9 ms  Δavg vs baseline=-23.5 ms (-51%)
  no water             avg=26.8 ms  p95=31.0 ms  max=31.3 ms  Δavg vs baseline=-19.6 ms (-42%)
  hide-terrain         avg=33.2 ms  p95=39.5 ms  max=40.3 ms  Δavg vs baseline=-13.2 ms (-28%)
  hide-npc-fauna       avg=18.3 ms  p95=22.0 ms  max=23.0 ms  Δavg vs baseline=-28.1 ms (-61%)
  no-shadows           avg=22.7 ms  p95=29.8 ms  max=34.3 ms  Δavg vs baseline=-23.8 ms (-51%)
  no-ao                avg=27.1 ms  p95=29.4 ms  max=30.2 ms  Δavg vs baseline=-19.3 ms (-42%)
  no-bloom             avg=31.2 ms  p95=38.8 ms  max=39.2 ms  Δavg vs baseline=-15.3 ms (-33%)
  no-smaa              avg=34.3 ms  p95=42.7 ms  max=45.0 ms  Δavg vs baseline=-12.1 ms (-26%)
  no-god-rays          avg=35.9 ms  p95=38.0 ms  max=38.2 ms  Δavg vs baseline=-10.6 ms (-23%)
  no-film-grade        avg=36.3 ms  p95=44.2 ms  max=44.9 ms  Δavg vs baseline=-10.1 ms (-22%)
  no postprocessing    avg=40.6 ms  p95=46.0 ms  max=46.2 ms  Δavg vs baseline=-5.9 ms (-13%)
  no mirrors           avg=38.0 ms  p95=45.0 ms  max=45.6 ms  Δavg vs baseline=-8.4 ms (-18%)

CPU/GPU separation (baseline, same RENDER span):
  NOT MEASURED — EXT_disjoint_timer_query_webgl2 is unavailable in this WebGL2 context (unsupported by the GPU/driver/browser, or no query resolved during the baseline window).
  Every render time above is CPU-side wall-clock time only (performance.now() around the render call) — it may include driver/GPU wait and must not be read as isolated CPU cost.

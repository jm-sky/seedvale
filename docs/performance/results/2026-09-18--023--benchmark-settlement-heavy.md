# Seedvale Performance Benchmark Report

> Generated: 2026-09-18T08:25:22.468Z
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
  avg: 13.6
  min: 6
  p1: 9

Frame time:
  avg: 73.5 ms
  p95: 98.2 ms
  max: 155.5 ms

Rendering:
  draw calls: 2447 avg / 2862 max
  triangles: 7.79M avg
  mirror draws: 394 avg
  geometries: 1050
  textures: 892

Scene (one-pass estimate):
  terrain        draws=76 tris=5.60M meshes=76 inst=76
  grass          draws=89 tris=1.21M meshes=89 inst=118278
  vegetation     draws=214 tris=760.9k meshes=214 inst=617
  environment    draws=265 tris=47.3k meshes=265 inst=279
  settlement     draws=1901 tris=1.84M meshes=1901 inst=3871
  water          draws=49 tris=3.55M meshes=49 inst=49
  npc            draws=487 tris=694.0k meshes=487 inst=487
  fauna          draws=397 tris=151.6k meshes=397 inst=397
  items          draws=405 tris=28.6k meshes=405 inst=405
  other          draws=497 tris=36.2k meshes=497 inst=499

Shadow casters (one-pass estimate):
  terrain        draws=76 tris=5.60M meshes=76 inst=76
  vegetation     draws=202 tris=738.4k meshes=202 inst=605
  environment    draws=265 tris=47.3k meshes=265 inst=279
  settlement     draws=1702 tris=1.77M meshes=1702 inst=3588
  npc            draws=12 tris=12.3k meshes=12 inst=12
  fauna          draws=15 tris=5.1k meshes=15 inst=15
  items          draws=36 tris=20.2k meshes=36 inst=36
  other          draws=113 tris=25.0k meshes=113 inst=113

Systems:
  WATER          7.6 ms
  NPC            6.8 ms
  FAUNA          2.2 ms
  PHYSICS        0.2 ms
  RENDER         44.8 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=47.6 ms draws=2444 tris=7.78M
  hide-grass         render=50.5 ms draws=2413 tris=7.47M
  hide-vegetation    render=49.7 ms draws=2245 tris=6.66M
  hide-vegetation-grass render=47.8 ms draws=2208 tris=6.34M
  hide-environment   render=48.4 ms draws=2139 tris=7.72M
  hide-settlement    render=41.2 ms draws=1299 tris=6.99M
  hide-water         render=48.8 ms draws=2437 tris=6.84M
  hide-terrain       render=50.1 ms draws=2400 tris=3.72M
  hide-npc-fauna     render=35.4 ms draws=2073 tris=7.38M
  no-shadows         render=42.0 ms draws=1890 tris=5.48M
  no-ao              render=51.2 ms draws=2435 tris=7.78M
  no-bloom           render=51.0 ms draws=2434 tris=7.80M
  no-smaa            render=49.4 ms draws=2447 tris=7.81M
  no-god-rays        render=52.7 ms draws=2456 tris=7.81M
  no-film-grade      render=53.0 ms draws=2445 tris=7.79M
  no-postprocessing  render=51.7 ms draws=2422 tris=7.79M
  no-reflections     render=52.6 ms draws=2056 tris=6.78M

Frame attribution:
  frame max: 155.5 ms
  largest labelled hitch: 0 ms
  unattributed: 155.5 ms

Long frames:
  threshold: 80 ms
  count: 152
  worst: 155.5 ms

Recommendation:
RENDER is the largest sustained CPU-measured category, but composer submission time can include GPU wait — not confirmed as a CPU bottleneck without isolation probes.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 53
  Fauna (agents): 31

NPC:
  total: 6.8 ms/frame
  crowd pass: 0.0 ms/frame (11.0 ms cumulative)
  agent updates: 3.7 ms/frame (1427.1 ms cumulative)
  livestock: 2.3 ms/frame (903.4 ms cumulative)
    loaded tick: 2.3 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 2.3 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.2 ms/frame
      life/presentation: 0.7 ms/frame
      other update: 0.3 ms/frame
    update calls/frame: 55.5
    unique animals/frame: 49.6
    duplicate updates/frame: 5.9
    detached animals/frame: 0.0
    dog updates/frame: 12.9
    dog guard scans: 12.9/frame (90.0 predator candidates/frame)
    pest scans: 7.2/frame (7.2 rat candidates/frame)
    nearest scans: 29.7/frame (0.0 candidates/frame)
    water samples: 59.1/frame, 0.10 ms/frame (worst call 0.10 ms)
    collider queries: 59.1/frame, 0.10 ms/frame (worst call 1.50 ms, 12796.4 colliders/frame)
    full-rate agents/frame: 0.3
    reduced-cadence agents/frame: 55.2
    behaviour executions/frame: 29.7
    presentation executions/frame: 28.9
  rats: 0.3 ms/frame (121.0 ms cumulative)
  social: 0.0 ms/frame (4.4 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.3 ms/frame (133.3 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 2.2 ms/frame
  agent updates: 2.1 ms/frame (823.0 ms cumulative)
  forest sampling: 0.1 ms/frame (53.4 ms cumulative)
  other (spawners/forage/cleanup/...): 0.0 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (15.4 ms cumulative)
    targeting: 0.0 ms/frame (17.8 ms cumulative)
    decision: 0.0 ms/frame (7.5 ms cumulative)
    behaviour: 1.2 ms/frame (449.6 ms cumulative)
    life/presentation: 0.6 ms/frame (215.9 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 20.1
    full-rate agents/frame: 9.1
    reduced-cadence agents/frame: 21.9
    behaviour executions/frame: 20.1
    presentation executions/frame: 19.9

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 122.6
    village scan candidates/frame: 2103.3
    player perception checks/frame: 31.0

  nearest scans: 29.3/frame (11278 calls)
  nearest candidates checked: 797.9/frame (307200 total)
  herd leader scans: 0.3/frame (115 calls)
  herd candidates checked: 9.3/frame (3565 total)

  movement hot-path (plan fauna-033):
    water samples: 97.9/frame, 0.10 ms/frame (worst call 2.50 ms)
    collider queries: 97.9/frame, 0.10 ms/frame (worst call 0.20 ms, 1728.8 colliders/frame)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 53
  Fauna (agents): 31

NPC:
  total: 6.8 ms/frame
  crowd pass: 0.0 ms/frame (11.0 ms cumulative)
  agent updates: 3.7 ms/frame (1427.1 ms cumulative)
  livestock: 2.3 ms/frame (903.4 ms cumulative)
    loaded tick: 2.3 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 2.3 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.2 ms/frame
      life/presentation: 0.7 ms/frame
      other update: 0.3 ms/frame
    update calls/frame: 55.5
    unique animals/frame: 49.6
    duplicate updates/frame: 5.9
    detached animals/frame: 0.0
    dog updates/frame: 12.9
    dog guard scans: 12.9/frame (90.0 predator candidates/frame)
    pest scans: 7.2/frame (7.2 rat candidates/frame)
    nearest scans: 29.7/frame (0.0 candidates/frame)
    water samples: 59.1/frame, 0.10 ms/frame (worst call 0.10 ms)
    collider queries: 59.1/frame, 0.10 ms/frame (worst call 1.50 ms, 12796.4 colliders/frame)
    full-rate agents/frame: 0.3
    reduced-cadence agents/frame: 55.2
    behaviour executions/frame: 29.7
    presentation executions/frame: 28.9
  rats: 0.3 ms/frame (121.0 ms cumulative)
  social: 0.0 ms/frame (4.4 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.3 ms/frame (133.3 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 2.2 ms/frame
  agent updates: 2.1 ms/frame (823.0 ms cumulative)
  forest sampling: 0.1 ms/frame (53.4 ms cumulative)
  other (spawners/forage/cleanup/...): 0.0 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (15.4 ms cumulative)
    targeting: 0.0 ms/frame (17.8 ms cumulative)
    decision: 0.0 ms/frame (7.5 ms cumulative)
    behaviour: 1.2 ms/frame (449.6 ms cumulative)
    life/presentation: 0.6 ms/frame (215.9 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 20.1
    full-rate agents/frame: 9.1
    reduced-cadence agents/frame: 21.9
    behaviour executions/frame: 20.1
    presentation executions/frame: 19.9

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 122.6
    village scan candidates/frame: 2103.3
    player perception checks/frame: 31.0

  nearest scans: 29.3/frame (11278 calls)
  nearest candidates checked: 797.9/frame (307200 total)
  herd leader scans: 0.3/frame (115 calls)
  herd candidates checked: 9.3/frame (3565 total)

  movement hot-path (plan fauna-033):
    water samples: 97.9/frame, 0.10 ms/frame (worst call 2.50 ms)
    collider queries: 97.9/frame, 0.10 ms/frame (worst call 0.20 ms, 1728.8 colliders/frame)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 7
  empty builds (no instances): 1
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 0.16 ms
    max 0.20 ms

  allocation/setup:
    avg 0.09 ms
    max 0.20 ms
  instanceMatrix bind:
    avg 0.01 ms
    max 0.10 ms
  bounds/finalize (apply worker bounds):
    avg 0.01 ms
    max 0.10 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.01 ms
    max 0.10 ms
  scene attach (`scene.add`):
    avg 0.01 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 0.37 ms
    max 0.70 ms

  per chunk:
    instances avg/max 70905.0 / 230082
    meshes avg/max 4.00 / 4
    geometries avg/max 4.00 / 4
    geometries after lod apply avg/max 7.00 / 7
    instances full/filler: 159422 / 336913
    matrix instances bound: 496335
    instanced attributes created: 140
    shared material refs: 28
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 7/7
    instances: 60251 (max 27623)
    allocation/setup avg/max: 0.00 / 0.00 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  grain:
    buckets/meshes: 7/7
    instances: 20270 (max 9306)
    allocation/setup avg/max: 0.03 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.01 / 0.10 ms
  herb:
    buckets/meshes: 7/7
    instances: 78901 (max 36739)
    allocation/setup avg/max: 0.04 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  filler:
    buckets/meshes: 7/7
    instances: 336913 (max 156414)
    allocation/setup avg/max: 0.01 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms

---

[Seedvale Long Frame Attribution]

Threshold: 80 ms
Long frames: 152
Shown: 5 worst (by frame ms)

Read: category rows are `withCategory()` spans on that frame; OTHER is
frame total minus those categories (measurement gap, overlapping work,
or unwrapped tick code). Stages are coarse streaming/finalize labels
from the same frame; hitches are existing `recordHitch` events (>= 8 ms).

Worst frame (#1 of 5 shown, 152 total):

[LONG FRAME] 155.5ms
simulate        46.5ms
render         108.6ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           31.5ms
STREAMING        0.0ms
NPC             12.2ms
FAUNA            2.6ms
PHYSICS          0.1ms
RENDER          77.2ms
OTHER           31.9ms

Long frame #2:

[LONG FRAME] 122.2ms
simulate        35.1ms
render          86.8ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           16.0ms
STREAMING        0.2ms
NPC             15.0ms
FAUNA            3.8ms
PHYSICS          0.2ms
RENDER          70.9ms
OTHER           16.1ms

streaming / stages:
  chunkUpdate                  0.2ms
  chunkFinalize                0.1ms

Long frame #3:

[LONG FRAME] 115.2ms
simulate        50.7ms
render          64.2ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           18.4ms
STREAMING        0.0ms
NPC              6.9ms
FAUNA           32.2ms
PHYSICS          0.2ms
RENDER          45.8ms
OTHER           11.7ms

Long frame #4:

[LONG FRAME] 113.8ms
simulate        20.3ms
render          93.0ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           17.1ms
STREAMING        0.0ms
NPC              6.9ms
FAUNA            1.9ms
PHYSICS          0.1ms
RENDER          76.1ms
OTHER           11.7ms

Long frame #5:

[LONG FRAME] 113ms
simulate        38.2ms
render          74.6ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           26.0ms
STREAMING        0.0ms
NPC             15.3ms
FAUNA            6.2ms
PHYSICS          0.3ms
RENDER          48.7ms
OTHER           16.5ms

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=47.6 ms  p95=50.0 ms  max=50.3 ms  Δavg vs baseline=—
  hide-grass           avg=50.5 ms  p95=54.8 ms  max=55.7 ms  Δavg vs baseline=+2.9 ms (+6%)
  hide-vegetation      avg=49.7 ms  p95=52.8 ms  max=53.3 ms  Δavg vs baseline=+2.1 ms (+4%)
  no vegetation/grass  avg=47.8 ms  p95=52.8 ms  max=54.0 ms  Δavg vs baseline=+0.3 ms (+1%)
  hide-environment     avg=48.4 ms  p95=52.2 ms  max=52.6 ms  Δavg vs baseline=+0.9 ms (+2%)
  hide-settlement      avg=41.2 ms  p95=44.1 ms  max=44.7 ms  Δavg vs baseline=-6.4 ms (-13%)
  no water             avg=48.8 ms  p95=52.9 ms  max=53.9 ms  Δavg vs baseline=+1.2 ms (+3%)
  hide-terrain         avg=50.1 ms  p95=57.6 ms  max=58.3 ms  Δavg vs baseline=+2.6 ms (+5%)
  hide-npc-fauna       avg=35.4 ms  p95=37.7 ms  max=38.1 ms  Δavg vs baseline=-12.2 ms (-26%)
  no-shadows           avg=42.0 ms  p95=46.0 ms  max=47.0 ms  Δavg vs baseline=-5.6 ms (-12%)
  no-ao                avg=51.2 ms  p95=57.5 ms  max=59.2 ms  Δavg vs baseline=+3.7 ms (+8%)
  no-bloom             avg=51.0 ms  p95=55.1 ms  max=55.7 ms  Δavg vs baseline=+3.4 ms (+7%)
  no-smaa              avg=49.4 ms  p95=52.4 ms  max=53.0 ms  Δavg vs baseline=+1.8 ms (+4%)
  no-god-rays          avg=52.7 ms  p95=58.6 ms  max=59.4 ms  Δavg vs baseline=+5.1 ms (+11%)
  no-film-grade        avg=53.0 ms  p95=56.3 ms  max=56.5 ms  Δavg vs baseline=+5.5 ms (+11%)
  no postprocessing    avg=51.7 ms  p95=58.2 ms  max=59.6 ms  Δavg vs baseline=+4.1 ms (+9%)
  no mirrors           avg=52.6 ms  p95=55.8 ms  max=56.2 ms  Δavg vs baseline=+5.0 ms (+10%)

CPU/GPU separation (baseline, same RENDER span):
  NOT MEASURED — EXT_disjoint_timer_query_webgl2 is unavailable in this WebGL2 context (unsupported by the GPU/driver/browser, or no query resolved during the baseline window).
  Every render time above is CPU-side wall-clock time only (performance.now() around the render call) — it may include driver/GPU wait and must not be read as isolated CPU cost.

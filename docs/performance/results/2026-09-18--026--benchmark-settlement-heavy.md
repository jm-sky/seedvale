# Seedvale Performance Benchmark Report

> Generated: 2026-09-18T10:33:15.985Z
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
  avg: 11.6
  min: 4
  p1: 8

Frame time:
  avg: 86.4 ms
  p95: 103.4 ms
  max: 256.1 ms

Rendering:
  draw calls: 2299 avg / 2727 max
  triangles: 7.71M avg
  mirror draws: 392 avg
  geometries: 932
  textures: 690

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
  other            draws=509 tris=36.4k meshes=509 inst=509

Shadow casters (one-pass estimate):
  terrain          draws=76 tris=5.60M meshes=76 inst=76
  vegetation       draws=202 tris=738.4k meshes=202 inst=605
  environment      draws=265 tris=47.3k meshes=265 inst=279
  settlement       draws=1561 tris=2.05M meshes=1561 inst=3818
  npc              draws=12 tris=12.3k meshes=12 inst=12
  fauna            draws=10 tris=3.2k meshes=10 inst=10
  items            draws=55 tris=30.5k meshes=55 inst=55
  other            draws=125 tris=25.2k meshes=125 inst=125

Settlement shadow casters (one-pass estimate):
  houseStatic      draws=193 tris=300.0k meshes=193 inst=1943
  houseInteractive draws=72 tris=11.3k meshes=72 inst=72
  fence            draws=18 tris=61.0k meshes=18 inst=302
  storageWoodSettlementPrimary draws=70 tris=87.8k meshes=70 inst=70
  storageWoodSettlementOverflow draws=42 tris=118.3k meshes=42 inst=42
  storageWoodSettlementSecondary draws=6 tris=16.9k meshes=6 inst=6
  storageWoodHousehold draws=360 tris=451.8k meshes=360 inst=360
  storageContainer draws=100 tris=11.7k meshes=100 inst=158
  storageHay       draws=10 tris=4.9k meshes=10 inst=10
  storageTrough    draws=30 tris=8.8k meshes=30 inst=88
  workplace        draws=30 tris=18.3k meshes=30 inst=30
  landmarkWell     draws=175 tris=65.5k meshes=175 inst=175
  landmarkGarden   draws=84 tris=491.1k meshes=84 inst=84
  landmarkNoticeBoard draws=14 tris=252 meshes=14 inst=14
  fireHouseInteriorLamp draws=36 tris=3.9k meshes=36 inst=36
  fireCampfire     draws=44 tris=1.7k meshes=44 inst=44
  decor            draws=198 tris=398.6k meshes=198 inst=305
  other            draws=79 tris=2.2k meshes=79 inst=79

Systems:
  WATER          8.9 ms
  NPC            9.8 ms
  FAUNA          2.2 ms
  PHYSICS        0.2 ms
  RENDER         52.7 ms

Detected bottlenecks:
  1. RENDER
  2. NPC
  3. WATER

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=29.1 ms draws=2352 tris=7.88M
  hide-grass         render=30.8 ms draws=2319 tris=7.56M
  hide-vegetation    render=49.0 ms draws=2116 tris=6.66M
  hide-vegetation-grass render=50.2 ms draws=2076 tris=6.32M
  hide-environment   render=50.2 ms draws=2011 tris=7.71M
  hide-settlement    render=43.7 ms draws=1314 tris=7.02M
  hide-water         render=53.0 ms draws=2312 tris=6.83M
  hide-terrain       render=49.1 ms draws=2261 tris=3.69M
  hide-npc-fauna     render=36.8 ms draws=1943 tris=7.36M
  no-shadows         render=43.2 ms draws=1948 tris=5.63M
  no-ao              render=54.5 ms draws=2316 tris=7.79M
  no-bloom           render=52.6 ms draws=2302 tris=7.78M
  no-smaa            render=54.3 ms draws=2310 tris=7.77M
  no-god-rays        render=56.3 ms draws=2312 tris=7.77M
  no-film-grade      render=51.6 ms draws=2313 tris=7.77M
  no-postprocessing  render=54.4 ms draws=2290 tris=7.77M
  no-reflections     render=58.5 ms draws=1925 tris=6.75M

Frame attribution:
  frame max: 256.1 ms
  largest labelled hitch: 0 ms
  unattributed: 256.1 ms

Long frames:
  threshold: 80 ms
  count: 222
  worst: 256.1 ms

Recommendation:
Largest frame (256.1 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 69
  Fauna (agents): 31

NPC:
  total: 9.8 ms/frame
  crowd pass: 0.0 ms/frame (14.5 ms cumulative)
  agent updates: 5.1 ms/frame (1687.7 ms cumulative)
  livestock: 3.4 ms/frame (1106.3 ms cumulative)
    loaded tick: 3.4 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 3.3 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.8 ms/frame
      life/presentation: 0.9 ms/frame
      other update: 0.4 ms/frame
    update calls/frame: 70.6
    unique animals/frame: 56.9
    duplicate updates/frame: 13.6
    detached animals/frame: 0.0
    dog updates/frame: 16.6
    dog guard scans: 16.6/frame (116.4 predator candidates/frame)
    pest scans: 8.7/frame (8.7 rat candidates/frame)
    nearest scans: 37.4/frame (0.0 candidates/frame)
    water samples: 82.3/frame, 0.10 ms/frame (worst call 1.20 ms)
    collider queries: 82.3/frame, 0.10 ms/frame (worst call 0.10 ms, 14355.4 colliders/frame)
    full-rate agents/frame: 0.5
    reduced-cadence agents/frame: 70.0
    behaviour executions/frame: 37.5
    presentation executions/frame: 37.4
  rats: 0.5 ms/frame (174.4 ms cumulative)
  social: 0.0 ms/frame (6.5 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.5 ms/frame (176.5 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 2.2 ms/frame
  agent updates: 2.1 ms/frame (704.5 ms cumulative)
  forest sampling: 0.1 ms/frame (39.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (13.3 ms cumulative)
    targeting: 0.1 ms/frame (26.9 ms cumulative)
    decision: 0.0 ms/frame (4.6 ms cumulative)
    behaviour: 1.1 ms/frame (367.3 ms cumulative)
    life/presentation: 0.6 ms/frame (190.8 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 19.2
    full-rate agents/frame: 7.3
    reduced-cadence agents/frame: 23.7
    behaviour executions/frame: 19.2
    presentation executions/frame: 19.1

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 151.6
    village scan candidates/frame: 3773.6
    player perception checks/frame: 31.0

  nearest scans: 29.4/frame (9686 calls)
  nearest candidates checked: 890.2/frame (292882 total)
  herd leader scans: 0.3/frame (113 calls)
  herd candidates checked: 10.6/frame (3503 total)

  movement hot-path (plan fauna-033):
    water samples: 65.7/frame, 0.10 ms/frame (worst call 0.20 ms)
    collider queries: 65.7/frame, 0.10 ms/frame (worst call 1.30 ms, 998.5 colliders/frame)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 69
  Fauna (agents): 31

NPC:
  total: 9.8 ms/frame
  crowd pass: 0.0 ms/frame (14.5 ms cumulative)
  agent updates: 5.1 ms/frame (1687.7 ms cumulative)
  livestock: 3.4 ms/frame (1106.3 ms cumulative)
    loaded tick: 3.4 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 3.3 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.8 ms/frame
      life/presentation: 0.9 ms/frame
      other update: 0.4 ms/frame
    update calls/frame: 70.6
    unique animals/frame: 56.9
    duplicate updates/frame: 13.6
    detached animals/frame: 0.0
    dog updates/frame: 16.6
    dog guard scans: 16.6/frame (116.4 predator candidates/frame)
    pest scans: 8.7/frame (8.7 rat candidates/frame)
    nearest scans: 37.4/frame (0.0 candidates/frame)
    water samples: 82.3/frame, 0.10 ms/frame (worst call 1.20 ms)
    collider queries: 82.3/frame, 0.10 ms/frame (worst call 0.10 ms, 14355.4 colliders/frame)
    full-rate agents/frame: 0.5
    reduced-cadence agents/frame: 70.0
    behaviour executions/frame: 37.5
    presentation executions/frame: 37.4
  rats: 0.5 ms/frame (174.4 ms cumulative)
  social: 0.0 ms/frame (6.5 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.5 ms/frame (176.5 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 2.2 ms/frame
  agent updates: 2.1 ms/frame (704.5 ms cumulative)
  forest sampling: 0.1 ms/frame (39.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (13.3 ms cumulative)
    targeting: 0.1 ms/frame (26.9 ms cumulative)
    decision: 0.0 ms/frame (4.6 ms cumulative)
    behaviour: 1.1 ms/frame (367.3 ms cumulative)
    life/presentation: 0.6 ms/frame (190.8 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 19.2
    full-rate agents/frame: 7.3
    reduced-cadence agents/frame: 23.7
    behaviour executions/frame: 19.2
    presentation executions/frame: 19.1

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 151.6
    village scan candidates/frame: 3773.6
    player perception checks/frame: 31.0

  nearest scans: 29.4/frame (9686 calls)
  nearest candidates checked: 890.2/frame (292882 total)
  herd leader scans: 0.3/frame (113 calls)
  herd candidates checked: 10.6/frame (3503 total)

  movement hot-path (plan fauna-033):
    water samples: 65.7/frame, 0.10 ms/frame (worst call 0.20 ms)
    collider queries: 65.7/frame, 0.10 ms/frame (worst call 1.30 ms, 998.5 colliders/frame)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 21
  empty builds (no instances): 2
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 0.21 ms
    max 0.60 ms

  allocation/setup:
    avg 0.12 ms
    max 0.50 ms
  instanceMatrix bind:
    avg 0.00 ms
    max 0.10 ms
  bounds/finalize (apply worker bounds):
    avg 0.01 ms
    max 0.10 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.03 ms
    max 0.10 ms
  scene attach (`scene.add`):
    avg 0.04 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 0.57 ms
    max 1.20 ms

  per chunk:
    instances avg/max 70056.0 / 266667
    meshes avg/max 3.86 / 4
    geometries avg/max 3.86 / 4
    geometries after lod apply avg/max 6.71 / 7
    instances full/filler: 470444 / 1000732
    matrix instances bound: 1471176
    instanced attributes created: 405
    shared material refs: 81
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 20/20
    instances: 176424 (max 32075)
    allocation/setup avg/max: 0.07 / 0.30 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 0.01 / 0.10 ms
  grain:
    buckets/meshes: 20/20
    instances: 59214 (max 10670)
    allocation/setup avg/max: 0.03 / 0.20 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  herb:
    buckets/meshes: 20/20
    instances: 234806 (max 42240)
    allocation/setup avg/max: 0.00 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  filler:
    buckets/meshes: 21/21
    instances: 1000732 (max 181682)
    allocation/setup avg/max: 0.02 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms

---

[Seedvale Long Frame Attribution]

Threshold: 80 ms
Long frames: 222
Shown: 5 worst (by frame ms)

Read: category rows are `withCategory()` spans on that frame; OTHER is
frame total minus those categories (measurement gap, overlapping work,
or unwrapped tick code). Stages are coarse streaming/finalize labels
from the same frame; hitches are existing `recordHitch` events (>= 8 ms).

Worst frame (#1 of 5 shown, 222 total):

[LONG FRAME] 256.1ms
simulate        22.5ms
render         231.9ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.1ms
STREAMING        0.1ms
NPC              6.2ms
FAUNA            4.0ms
PHYSICS          0.3ms
RENDER         231.8ms
OTHER           13.6ms

Long frame #2:

[LONG FRAME] 195.7ms
simulate        51.9ms
render         143.0ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.1ms
STREAMING        0.0ms
NPC             26.3ms
FAUNA            3.5ms
PHYSICS          0.2ms
RENDER         142.8ms
OTHER           22.8ms

Long frame #3:

[LONG FRAME] 154.6ms
simulate        49.9ms
render         103.8ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.3ms
STREAMING        0.0ms
NPC             25.0ms
FAUNA            2.8ms
PHYSICS          0.2ms
RENDER         103.6ms
OTHER           22.7ms

Long frame #4:

[LONG FRAME] 130.7ms
simulate        64.3ms
render          66.1ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           18.7ms
STREAMING        0.1ms
NPC              8.8ms
FAUNA           42.8ms
PHYSICS          0.4ms
RENDER          47.4ms
OTHER           12.5ms

streaming / stages:
  chunkFinalize                0.1ms
  chunkUpdate                  0.1ms

Long frame #5:

[LONG FRAME] 123.2ms
simulate        70.5ms
render          52.4ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            0.1ms
STREAMING        0.0ms
NPC             13.9ms
FAUNA           44.8ms
PHYSICS          0.2ms
RENDER          52.3ms
OTHER           11.9ms

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=29.1 ms  p95=31.5 ms  max=32.5 ms  Δavg vs baseline=—
  hide-grass           avg=30.8 ms  p95=33.1 ms  max=34.1 ms  Δavg vs baseline=+1.7 ms (+6%)
  hide-vegetation      avg=49.0 ms  p95=52.0 ms  max=52.0 ms  Δavg vs baseline=+19.9 ms (+69%)
  no vegetation/grass  avg=50.2 ms  p95=54.8 ms  max=55.6 ms  Δavg vs baseline=+21.1 ms (+73%)
  hide-environment     avg=50.2 ms  p95=57.5 ms  max=59.0 ms  Δavg vs baseline=+21.2 ms (+73%)
  hide-settlement      avg=43.7 ms  p95=47.5 ms  max=47.8 ms  Δavg vs baseline=+14.6 ms (+50%)
  no water             avg=53.0 ms  p95=58.0 ms  max=58.5 ms  Δavg vs baseline=+24.0 ms (+83%)
  hide-terrain         avg=49.1 ms  p95=50.8 ms  max=50.8 ms  Δavg vs baseline=+20.0 ms (+69%)
  hide-npc-fauna       avg=36.8 ms  p95=40.3 ms  max=40.6 ms  Δavg vs baseline=+7.7 ms (+27%)
  no-shadows           avg=43.2 ms  p95=48.5 ms  max=49.7 ms  Δavg vs baseline=+14.1 ms (+49%)
  no-ao                avg=54.5 ms  p95=61.2 ms  max=61.9 ms  Δavg vs baseline=+25.4 ms (+88%)
  no-bloom             avg=52.6 ms  p95=58.3 ms  max=59.7 ms  Δavg vs baseline=+23.5 ms (+81%)
  no-smaa              avg=54.3 ms  p95=60.0 ms  max=60.4 ms  Δavg vs baseline=+25.3 ms (+87%)
  no-god-rays          avg=56.3 ms  p95=60.0 ms  max=60.2 ms  Δavg vs baseline=+27.2 ms (+94%)
  no-film-grade        avg=51.6 ms  p95=58.2 ms  max=58.8 ms  Δavg vs baseline=+22.6 ms (+78%)
  no postprocessing    avg=54.4 ms  p95=59.9 ms  max=60.5 ms  Δavg vs baseline=+25.4 ms (+87%)
  no mirrors           avg=58.5 ms  p95=61.1 ms  max=61.6 ms  Δavg vs baseline=+29.5 ms (+101%)

CPU/GPU separation (baseline, same RENDER span):
  NOT MEASURED — EXT_disjoint_timer_query_webgl2 is unavailable in this WebGL2 context (unsupported by the GPU/driver/browser, or no query resolved during the baseline window).
  Every render time above is CPU-side wall-clock time only (performance.now() around the render call) — it may include driver/GPU wait and must not be read as isolated CPU cost.

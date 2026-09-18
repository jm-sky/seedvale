# Seedvale Performance Benchmark Report

> Generated: 2026-09-18T11:03:23.906Z
> Sections:
> - [Seedvale Benchmark]
> - [Seedvale Agent CPU]
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
  avg: 10.4
  min: 5
  p1: 5

Frame time:
  avg: 96 ms
  p95: 167.8 ms
  max: 200.2 ms

Rendering:
  draw calls: 2307 avg / 2725 max
  triangles: 7.78M avg
  mirror draws: 392 avg
  geometries: 995
  textures: 734

Scene (one-pass estimate):
  terrain          draws=76 tris=5.60M meshes=76 inst=76
  grass            draws=89 tris=1.21M meshes=89 inst=118278
  vegetation       draws=214 tris=760.9k meshes=214 inst=617
  environment      draws=265 tris=47.3k meshes=265 inst=279
  settlement       draws=1852 tris=1.53M meshes=1852 inst=4098
  water            draws=49 tris=3.55M meshes=49 inst=49
  npc              draws=543 tris=818.3k meshes=543 inst=543
  fauna            draws=430 tris=163.9k meshes=430 inst=430
  items            draws=407 tris=29.8k meshes=407 inst=407
  other            draws=500 tris=36.1k meshes=500 inst=500

Shadow casters (one-pass estimate):
  terrain          draws=76 tris=5.60M meshes=76 inst=76
  vegetation       draws=202 tris=738.4k meshes=202 inst=605
  environment      draws=265 tris=47.3k meshes=265 inst=279
  settlement       draws=1081 tris=1.37M meshes=1081 inst=3228
  npc              draws=19 tris=12.8k meshes=19 inst=19
  fauna            draws=10 tris=3.2k meshes=10 inst=10
  items            draws=38 tris=21.4k meshes=38 inst=38
  other            draws=116 tris=24.9k meshes=116 inst=116

Settlement shadow casters (one-pass estimate):
  houseStatic      draws=170 tris=285.3k meshes=170 inst=1818
  houseInteractive draws=66 tris=10.4k meshes=66 inst=66
  fence            draws=18 tris=61.0k meshes=18 inst=302
  storageWoodSettlementPrimary draws=12 tris=9.1k meshes=12 inst=12
  storageWoodSettlementSecondary draws=6 tris=16.9k meshes=6 inst=6
  storageWoodHousehold draws=66 tris=29.4k meshes=66 inst=66
  storageContainer draws=90 tris=10.6k meshes=90 inst=144
  storageHay       draws=9 tris=4.4k meshes=9 inst=9
  storageTrough    draws=28 tris=8.2k meshes=28 inst=82
  workplace        draws=28 tris=18.0k meshes=28 inst=28
  landmarkWellCentral draws=30 tris=11.2k meshes=30 inst=30
  landmarkWellHousehold draws=100 tris=37.4k meshes=100 inst=100
  landmarkWellPasture draws=25 tris=9.3k meshes=25 inst=25
  landmarkGarden   draws=78 tris=456.0k meshes=78 inst=78
  landmarkNoticeBoard draws=12 tris=216 meshes=12 inst=12
  fireHouseInteriorLamp draws=33 tris=3.6k meshes=33 inst=33
  fireCampfire     draws=44 tris=1.7k meshes=44 inst=44
  decor            draws=198 tris=398.6k meshes=198 inst=305
  other            draws=68 tris=2.0k meshes=68 inst=68

Systems:
  WATER          9.5 ms
  NPC            10.2 ms
  FAUNA          7.3 ms
  PHYSICS        0.1 ms
  RENDER         55.0 ms

Detected bottlenecks:
  1. RENDER
  2. NPC
  3. WATER

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=88.3 ms draws=2302 tris=7.77M
  hide-grass         render=95.4 ms draws=2265 tris=7.45M
  hide-vegetation    render=80.2 ms draws=2095 tris=6.64M
  hide-vegetation-grass render=81.0 ms draws=1999 tris=6.16M
  hide-environment   render=93.2 ms draws=2008 tris=7.72M
  hide-settlement    render=84.2 ms draws=1247 tris=6.71M
  hide-water         render=96.3 ms draws=2293 tris=6.80M
  hide-terrain       render=98.0 ms draws=2255 tris=3.68M
  hide-npc-fauna     render=63.1 ms draws=1921 tris=7.30M
  no-shadows         render=71.7 ms draws=1880 tris=5.49M
  no-ao              render=86.0 ms draws=2326 tris=7.80M
  no-bloom           render=95.7 ms draws=2325 tris=7.80M
  no-smaa            render=120.6 ms draws=2460 tris=8.14M
  no-god-rays        render=87.8 ms draws=2335 tris=7.80M
  no-film-grade      render=79.1 ms draws=2334 tris=7.80M
  no-postprocessing  render=96.0 ms draws=2300 tris=7.79M
  no-reflections     render=87.6 ms draws=1933 tris=6.77M

Frame attribution:
  frame max: 200.2 ms
  largest labelled hitch: 0 ms
  unattributed: 200.2 ms

Long frames:
  threshold: 80 ms
  count: 184
  worst: 200.2 ms

Recommendation:
RENDER is the largest sustained CPU-measured category, but composer submission time can include GPU wait — not confirmed as a CPU bottleneck without isolation probes.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 62
  Fauna (agents): 31

NPC:
  total: 10.2 ms/frame
  crowd pass: 0.0 ms/frame (13.8 ms cumulative)
  agent updates: 5.5 ms/frame (1665.1 ms cumulative)
  livestock: 3.5 ms/frame (1047.3 ms cumulative)
    loaded tick: 3.4 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 3.4 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.8 ms/frame
      life/presentation: 1.0 ms/frame
      other update: 0.4 ms/frame
    update calls/frame: 62.2
    unique animals/frame: 51.4
    duplicate updates/frame: 10.8
    detached animals/frame: 0.0
    dog updates/frame: 15.8
    dog guard scans: 15.8/frame (110.3 predator candidates/frame)
    pest scans: 8.2/frame (8.2 rat candidates/frame)
    nearest scans: 32.7/frame (0.0 candidates/frame)
    water samples: 65.7/frame, 0.10 ms/frame (worst call 3.70 ms)
    collider queries: 65.7/frame, 0.20 ms/frame (worst call 2.20 ms, 13474.2 colliders/frame)
    full-rate agents/frame: 0.7
    reduced-cadence agents/frame: 61.4
    behaviour executions/frame: 33.2
    presentation executions/frame: 33.2
  rats: 0.5 ms/frame (161.9 ms cumulative)
  social: 0.0 ms/frame (3.7 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.5 ms/frame (148.3 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 7.3 ms/frame
  agent updates: 7.2 ms/frame (2188.1 ms cumulative)
  forest sampling: 0.2 ms/frame (49.1 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (14.6 ms cumulative)
    targeting: 0.1 ms/frame (25.4 ms cumulative)
    decision: 0.0 ms/frame (7.4 ms cumulative)
    behaviour: 6.0 ms/frame (1817.8 ms cumulative)
    life/presentation: 0.7 ms/frame (211.7 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 18.9
    full-rate agents/frame: 6.9
    reduced-cadence agents/frame: 24.1
    behaviour executions/frame: 18.9
    presentation executions/frame: 18.9

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 152.6
    village scan candidates/frame: 2932.4
    player perception checks/frame: 31.0

  nearest scans: 28.3/frame (8582 calls)
  nearest candidates checked: 805.4/frame (244028 total)
  herd leader scans: 0.3/frame (80 calls)
  herd candidates checked: 8.2/frame (2480 total)

  movement hot-path (plan fauna-033):
    water samples: 425.4/frame, 0.60 ms/frame (worst call 1.20 ms)
    collider queries: 425.4/frame, 0.30 ms/frame (worst call 0.90 ms, 7034.9 colliders/frame)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 62
  Fauna (agents): 31

NPC:
  total: 10.2 ms/frame
  crowd pass: 0.0 ms/frame (13.8 ms cumulative)
  agent updates: 5.5 ms/frame (1665.1 ms cumulative)
  livestock: 3.5 ms/frame (1047.3 ms cumulative)
    loaded tick: 3.4 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 3.4 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.1 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.8 ms/frame
      life/presentation: 1.0 ms/frame
      other update: 0.4 ms/frame
    update calls/frame: 62.2
    unique animals/frame: 51.4
    duplicate updates/frame: 10.8
    detached animals/frame: 0.0
    dog updates/frame: 15.8
    dog guard scans: 15.8/frame (110.3 predator candidates/frame)
    pest scans: 8.2/frame (8.2 rat candidates/frame)
    nearest scans: 32.7/frame (0.0 candidates/frame)
    water samples: 65.7/frame, 0.10 ms/frame (worst call 3.70 ms)
    collider queries: 65.7/frame, 0.20 ms/frame (worst call 2.20 ms, 13474.2 colliders/frame)
    full-rate agents/frame: 0.7
    reduced-cadence agents/frame: 61.4
    behaviour executions/frame: 33.2
    presentation executions/frame: 33.2
  rats: 0.5 ms/frame (161.9 ms cumulative)
  social: 0.0 ms/frame (3.7 ms cumulative)
  streaming: 0.0 ms/frame (0.0 ms cumulative)
  maintenance: 0.5 ms/frame (148.3 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 7.3 ms/frame
  agent updates: 7.2 ms/frame (2188.1 ms cumulative)
  forest sampling: 0.2 ms/frame (49.1 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (14.6 ms cumulative)
    targeting: 0.1 ms/frame (25.4 ms cumulative)
    decision: 0.0 ms/frame (7.4 ms cumulative)
    behaviour: 6.0 ms/frame (1817.8 ms cumulative)
    life/presentation: 0.7 ms/frame (211.7 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 18.9
    full-rate agents/frame: 6.9
    reduced-cadence agents/frame: 24.1
    behaviour executions/frame: 18.9
    presentation executions/frame: 18.9

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 152.6
    village scan candidates/frame: 2932.4
    player perception checks/frame: 31.0

  nearest scans: 28.3/frame (8582 calls)
  nearest candidates checked: 805.4/frame (244028 total)
  herd leader scans: 0.3/frame (80 calls)
  herd candidates checked: 8.2/frame (2480 total)

  movement hot-path (plan fauna-033):
    water samples: 425.4/frame, 0.60 ms/frame (worst call 1.20 ms)
    collider queries: 425.4/frame, 0.30 ms/frame (worst call 0.90 ms, 7034.9 colliders/frame)

---

[Seedvale Long Frame Attribution]

Threshold: 80 ms
Long frames: 184
Shown: 5 worst (by frame ms)

Read: category rows are `withCategory()` spans on that frame; OTHER is
frame total minus those categories (measurement gap, overlapping work,
or unwrapped tick code). Stages are coarse streaming/finalize labels
from the same frame; hitches are existing `recordHitch` events (>= 8 ms).

Worst frame (#1 of 5 shown, 184 total):

[LONG FRAME] 200.2ms
simulate        57.3ms
render         142.5ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           34.9ms
STREAMING        0.0ms
NPC             21.3ms
FAUNA           20.0ms
PHYSICS          0.1ms
RENDER         107.8ms
OTHER           16.1ms

Long frame #2:

[LONG FRAME] 197.9ms
simulate        53.6ms
render         144.0ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           42.8ms
STREAMING        0.0ms
NPC             15.2ms
FAUNA           18.9ms
PHYSICS          0.1ms
RENDER         101.2ms
OTHER           19.7ms

Long frame #3:

[LONG FRAME] 192.5ms
simulate        57.6ms
render         134.1ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           39.0ms
STREAMING        0.1ms
NPC             16.0ms
FAUNA           18.7ms
PHYSICS          0.2ms
RENDER          98.3ms
OTHER           20.2ms

streaming / stages:
  chunkUpdate                  0.1ms

Long frame #4:

[LONG FRAME] 186.9ms
simulate        69.9ms
render         116.4ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           30.2ms
STREAMING        0.0ms
NPC             18.8ms
FAUNA           17.8ms
PHYSICS          0.2ms
RENDER          86.4ms
OTHER           33.5ms

Long frame #5:

[LONG FRAME] 179ms
simulate        47.2ms
render         129.8ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           23.9ms
STREAMING        0.0ms
NPC             15.6ms
FAUNA           15.9ms
PHYSICS          0.2ms
RENDER         106.0ms
OTHER           17.4ms

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=88.3 ms  p95=103.3 ms  max=106.9 ms  Δavg vs baseline=—
  hide-grass           avg=95.4 ms  p95=106.0 ms  max=108.4 ms  Δavg vs baseline=+7.1 ms (+8%)
  hide-vegetation      avg=80.2 ms  p95=87.6 ms  max=88.5 ms  Δavg vs baseline=-8.1 ms (-9%)
  no vegetation/grass  avg=81.0 ms  p95=85.1 ms  max=85.4 ms  Δavg vs baseline=-7.3 ms (-8%)
  hide-environment     avg=93.2 ms  p95=109.6 ms  max=112.8 ms  Δavg vs baseline=+5.0 ms (+6%)
  hide-settlement      avg=84.2 ms  p95=115.9 ms  max=124.7 ms  Δavg vs baseline=-4.0 ms (-5%)
  no water             avg=96.3 ms  p95=99.6 ms  max=99.7 ms  Δavg vs baseline=+8.0 ms (+9%)
  hide-terrain         avg=98.0 ms  p95=115.0 ms  max=117.6 ms  Δavg vs baseline=+9.8 ms (+11%)
  hide-npc-fauna       avg=63.1 ms  p95=79.5 ms  max=84.3 ms  Δavg vs baseline=-25.2 ms (-29%)
  no-shadows           avg=71.7 ms  p95=80.5 ms  max=81.5 ms  Δavg vs baseline=-16.5 ms (-19%)
  no-ao                avg=86.0 ms  p95=92.3 ms  max=93.1 ms  Δavg vs baseline=-2.3 ms (-3%)
  no-bloom             avg=95.7 ms  p95=114.4 ms  max=117.6 ms  Δavg vs baseline=+7.4 ms (+8%)
  no-smaa              avg=120.6 ms  p95=133.8 ms  max=135.7 ms  Δavg vs baseline=+32.4 ms (+37%)
  no-god-rays          avg=87.8 ms  p95=91.5 ms  max=91.8 ms  Δavg vs baseline=-0.5 ms (-1%)
  no-film-grade        avg=79.1 ms  p95=83.3 ms  max=83.8 ms  Δavg vs baseline=-9.2 ms (-10%)
  no postprocessing    avg=96.0 ms  p95=103.8 ms  max=103.9 ms  Δavg vs baseline=+7.7 ms (+9%)
  no mirrors           avg=87.6 ms  p95=93.2 ms  max=94.4 ms  Δavg vs baseline=-0.7 ms (-1%)

CPU/GPU separation (baseline, same RENDER span):
  NOT MEASURED — EXT_disjoint_timer_query_webgl2 is unavailable in this WebGL2 context (unsupported by the GPU/driver/browser, or no query resolved during the baseline window).
  Every render time above is CPU-side wall-clock time only (performance.now() around the render call) — it may include driver/GPU wait and must not be read as isolated CPU cost.

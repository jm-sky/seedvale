# Seedvale Performance Benchmark Report

> Generated: 2026-09-17T12:40:02.914Z
> Sections:
> - [Seedvale Benchmark]
> - [Seedvale Agent CPU]
> - [Seedvale Grass Finalization]
> - [Seedvale Long Frame Attribution]
> - [Seedvale Program Census]
> - [Seedvale Program Attribution]
> - [Seedvale Program Compile Cost]
> - [Seedvale Render Isolation]

---

[Seedvale Benchmark]

Scenario: stream
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
  anchor: (-8.1, -11.5)
  route: start=(-8.1, -11.5) speed=14.4 m/s duration=30s

FPS:
  avg: 34.2
  min: 8
  p1: 12

Frame time:
  avg: 29.2 ms
  p95: 59.7 ms
  max: 125.5 ms

Rendering:
  draw calls: 778 avg / 2247 max
  triangles: 9.66M avg
  mirror draws: 152 avg
  geometries: 779
  textures: 609

Scene (one-pass estimate):
  terrain        draws=71 tris=5.23M meshes=71 inst=71
  grass          draws=56 tris=1.14M meshes=56 inst=117872
  vegetation     draws=201 tris=1.33M meshes=201 inst=875
  environment    draws=127 tris=25.5k meshes=127 inst=143
  settlement     draws=809 tris=860.4k meshes=809 inst=1302
  water          draws=53 tris=3.84M meshes=53 inst=53
  npc            draws=174 tris=278.3k meshes=174 inst=174
  fauna          draws=195 tris=85.8k meshes=195 inst=195
  items          draws=186 tris=15.5k meshes=186 inst=186
  other          draws=215 tris=32.3k meshes=215 inst=215

Systems:
  WATER          3.3 ms
  STREAMING      1.3 ms
  NPC            2.6 ms
  FAUNA          2.0 ms
  PHYSICS        0.1 ms
  RENDER         15.0 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  STREAMING: 10
  WATER: 6

Hitches (>= 8 ms):
  chunk mesh             n=10 avg=9.3 max=11.9
  chunk water            n=6 avg=8.9 max=10.3

Isolation probes:
  full               render=10.8 ms draws=313 tris=6.33M
  hide-grass         render=7.6 ms draws=279 tris=5.19M
  hide-vegetation    render=6.8 ms draws=163 tris=4.46M
  hide-vegetation-grass render=7.0 ms draws=126 tris=3.28M
  hide-environment   render=8.0 ms draws=275 tris=6.07M
  hide-settlement    render=8.8 ms draws=285 tris=6.20M
  hide-water         render=9.1 ms draws=277 tris=5.08M
  hide-terrain       render=8.3 ms draws=269 tris=3.86M
  hide-npc-fauna     render=7.9 ms draws=297 tris=6.12M
  no-shadows         render=8.5 ms draws=288 tris=5.93M
  no-ao              render=7.3 ms draws=289 tris=6.13M
  no-bloom           render=9.2 ms draws=284 tris=6.12M
  no-smaa            render=7.9 ms draws=301 tris=6.21M
  no-god-rays        render=9.7 ms draws=301 tris=6.17M
  no-film-grade      render=9.3 ms draws=305 tris=6.21M
  no-postprocessing  render=8.6 ms draws=274 tris=6.12M
  no-reflections     render=7.3 ms draws=227 tris=5.28M

Frame attribution:
  frame max: 125.5 ms
  largest labelled hitch: 11.9 ms
  unattributed: 113.6 ms

Long frames:
  threshold: 80 ms
  count: 11
  worst: 125.5 ms

Recommendation:
RENDER is the largest sustained CPU-measured category, but composer submission time can include GPU wait — not confirmed as a CPU bottleneck without isolation probes.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 31

NPC:
  total: 2.6 ms/frame
  crowd pass: 0.0 ms/frame (9.8 ms cumulative)
  agent updates: 1.3 ms/frame (1110.1 ms cumulative)
  livestock: 0.6 ms/frame (485.7 ms cumulative)
    loaded tick: 0.6 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 0.6 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.0 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 0.3 ms/frame
      life/presentation: 0.1 ms/frame
      other update: 0.1 ms/frame
    update calls/frame: 13.6
    unique animals/frame: 13.4
    duplicate updates/frame: 0.2
    detached animals/frame: 0.0
    dog updates/frame: 2.6
    dog guard scans: 2.6/frame (18.1 predator candidates/frame)
    pest scans: 1.0/frame (1.0 rat candidates/frame)
    nearest scans: 5.3/frame (0.0 candidates/frame)
    water samples: 10.9/frame, 0.00 ms/frame (worst call 0.80 ms)
    collider queries: 10.9/frame, 0.00 ms/frame (worst call 0.30 ms, 691.2 colliders/frame)
    full-rate agents/frame: 0.1
    reduced-cadence agents/frame: 13.5
    behaviour executions/frame: 5.3
    presentation executions/frame: 4.7
  rats: 0.2 ms/frame (159.6 ms cumulative)
  social: 0.0 ms/frame (7.1 ms cumulative)
  streaming: 0.2 ms/frame (157.1 ms cumulative)
  maintenance: 0.2 ms/frame (153.4 ms cumulative)
  unattributed: 0.0 ms/frame

FAUNA:
  total: 2.0 ms/frame
  agent updates: 1.9 ms/frame (1602.8 ms cumulative)
  forest sampling: 0.1 ms/frame (115.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (33.8 ms cumulative)
    targeting: 0.0 ms/frame (21.8 ms cumulative)
    decision: 0.0 ms/frame (20.6 ms cumulative)
    behaviour: 1.0 ms/frame (811.1 ms cumulative)
    life/presentation: 0.6 ms/frame (458.6 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.3
    expensive behaviour agents/frame: 17.8
    full-rate agents/frame: 10.0
    reduced-cadence agents/frame: 21.0
    behaviour executions/frame: 18.1
    presentation executions/frame: 17.0

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 20.4
    village scan candidates/frame: 338.1
    player perception checks/frame: 31.0

  nearest scans: 25.6/frame (21331 calls)
  nearest candidates checked: 379.8/frame (315971 total)
  herd leader scans: 0.1/frame (102 calls)
  herd candidates checked: 3.8/frame (3162 total)

  movement hot-path (plan fauna-033):
    water samples: 39.6/frame, 0.10 ms/frame (worst call 1.80 ms)
    collider queries: 39.6/frame, 0.10 ms/frame (worst call 1.30 ms, 1179.6 colliders/frame)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 31

NPC:
  total: 2.6 ms/frame
  crowd pass: 0.0 ms/frame (9.8 ms cumulative)
  agent updates: 1.3 ms/frame (1110.1 ms cumulative)
  livestock: 0.6 ms/frame (485.7 ms cumulative)
    loaded tick: 0.6 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 0.6 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.0 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 0.3 ms/frame
      life/presentation: 0.1 ms/frame
      other update: 0.1 ms/frame
    update calls/frame: 13.6
    unique animals/frame: 13.4
    duplicate updates/frame: 0.2
    detached animals/frame: 0.0
    dog updates/frame: 2.6
    dog guard scans: 2.6/frame (18.1 predator candidates/frame)
    pest scans: 1.0/frame (1.0 rat candidates/frame)
    nearest scans: 5.3/frame (0.0 candidates/frame)
    water samples: 10.9/frame, 0.00 ms/frame (worst call 0.80 ms)
    collider queries: 10.9/frame, 0.00 ms/frame (worst call 0.30 ms, 691.2 colliders/frame)
    full-rate agents/frame: 0.1
    reduced-cadence agents/frame: 13.5
    behaviour executions/frame: 5.3
    presentation executions/frame: 4.7
  rats: 0.2 ms/frame (159.6 ms cumulative)
  social: 0.0 ms/frame (7.1 ms cumulative)
  streaming: 0.2 ms/frame (157.1 ms cumulative)
  maintenance: 0.2 ms/frame (153.4 ms cumulative)
  unattributed: 0.0 ms/frame

FAUNA:
  total: 2.0 ms/frame
  agent updates: 1.9 ms/frame (1602.8 ms cumulative)
  forest sampling: 0.1 ms/frame (115.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (33.8 ms cumulative)
    targeting: 0.0 ms/frame (21.8 ms cumulative)
    decision: 0.0 ms/frame (20.6 ms cumulative)
    behaviour: 1.0 ms/frame (811.1 ms cumulative)
    life/presentation: 0.6 ms/frame (458.6 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.3
    expensive behaviour agents/frame: 17.8
    full-rate agents/frame: 10.0
    reduced-cadence agents/frame: 21.0
    behaviour executions/frame: 18.1
    presentation executions/frame: 17.0

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 20.4
    village scan candidates/frame: 338.1
    player perception checks/frame: 31.0

  nearest scans: 25.6/frame (21331 calls)
  nearest candidates checked: 379.8/frame (315971 total)
  herd leader scans: 0.1/frame (102 calls)
  herd candidates checked: 3.8/frame (3162 total)

  movement hot-path (plan fauna-033):
    water samples: 39.6/frame, 0.10 ms/frame (worst call 1.80 ms)
    collider queries: 39.6/frame, 0.10 ms/frame (worst call 1.30 ms, 1179.6 colliders/frame)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 23
  empty builds (no instances): 17
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 0.36 ms
    max 2.60 ms

  allocation/setup:
    avg 0.30 ms
    max 2.50 ms
  instanceMatrix bind:
    avg 0.00 ms
    max 0.00 ms
  bounds/finalize (apply worker bounds):
    avg 0.00 ms
    max 0.10 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.03 ms
    max 0.10 ms
  scene attach (`scene.add`):
    avg 0.05 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 0.56 ms
    max 2.70 ms

  per chunk:
    instances avg/max 152062.5 / 271541
    meshes avg/max 4.00 / 4
    geometries avg/max 4.00 / 4
    geometries after lod apply avg/max 7.00 / 7
    instances full/filler: 1119931 / 2377506
    matrix instances bound: 3497437
    instanced attributes created: 460
    shared material refs: 92
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 23/23
    instances: 420395 (max 32465)
    allocation/setup avg/max: 0.20 / 2.50 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.10 ms
  grain:
    buckets/meshes: 23/23
    instances: 140375 (max 10763)
    allocation/setup avg/max: 0.03 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  herb:
    buckets/meshes: 23/23
    instances: 559161 (max 44129)
    allocation/setup avg/max: 0.04 / 0.80 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  filler:
    buckets/meshes: 23/23
    instances: 2377506 (max 184184)
    allocation/setup avg/max: 0.01 / 0.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms

---

[Seedvale Long Frame Attribution]

Threshold: 80 ms
Long frames: 11
Shown: 5 worst (by frame ms)

Read: category rows are `withCategory()` spans on that frame; OTHER is
frame total minus those categories (measurement gap, overlapping work,
or unwrapped tick code). Stages are coarse streaming/finalize labels
from the same frame; hitches are existing `recordHitch` events (>= 8 ms).

Worst frame (#1 of 5 shown, 11 total):

[LONG FRAME] 125.5ms
simulate        38.7ms
render          83.4ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           53.2ms
STREAMING        0.0ms
NPC              8.1ms
FAUNA           15.2ms
PHYSICS          0.1ms
RENDER          30.2ms
OTHER           18.7ms

Long frame #2:

[LONG FRAME] 111.4ms
simulate        11.9ms
render          97.9ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           19.8ms
STREAMING        0.0ms
NPC              1.3ms
FAUNA            1.6ms
PHYSICS          0.1ms
RENDER          78.2ms
OTHER           10.4ms

Long frame #3:

[LONG FRAME] 106.1ms
simulate        80.5ms
render          25.4ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            6.8ms
STREAMING       65.2ms
NPC              4.0ms
FAUNA            3.1ms
PHYSICS          0.2ms
RENDER          18.5ms
OTHER            8.3ms

streaming / stages:
  chunkUpdate                  65.2ms
  riverTileBuild               52.6ms
  terrainPrepare               1.6ms
  riverChannelSegmentsNear     0.3ms

Long frame #4:

[LONG FRAME] 97.4ms
simulate        85.2ms
render          11.9ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            3.8ms
STREAMING        0.0ms
NPC             82.1ms
FAUNA            1.4ms
PHYSICS          0.0ms
RENDER           8.1ms
OTHER            2.0ms

streaming / stages:
  riverTileBuild               58.7ms
  terrainPrepare               8.9ms
  riverChannelSegmentsNear     0.7ms

Long frame #5:

[LONG FRAME] 94.7ms
simulate        75.4ms
render          19.0ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            4.1ms
STREAMING       69.1ms
NPC              3.1ms
FAUNA            1.2ms
PHYSICS          0.1ms
RENDER          14.9ms
OTHER            2.2ms

streaming / stages:
  chunkUpdate                  69.0ms
  riverTileBuild               54.3ms
  terrainPrepare               1.7ms
  riverChannelSegmentsNear     0.6ms

---

[Seedvale Program Census]

Programs created: 112
Program count: final=110 max=112

By frame:
  frame 0   +68 programs   <== largest transition
  frame 27   +2 programs
  frame 29   +1 program
  frame 73   +2 programs
  frame 87   +1 program
  frame 100   +1 program
  frame 126   +1 program
  frame 138   +1 program
  frame 310   +1 program
  frame 1264   +10 programs
  frame 1265   +4 programs
  frame 1300   +4 programs
  frame 1519   +16 programs

Largest transition — frame 0 (+68 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=a20f6e63-5286-41c1-af12-7d0ff38fcf65 (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=44856e9f-d769-45d3-861e-bf552013386e
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=a1daa357 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=2c30ca3c-88f8-44d2-bb5d-29ac79490c1d
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=mirror-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=fcbda148-1d64-4f1f-9e2c-b4d7f5ddd888
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=2cf9fa62 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=507192bc-453c-42d7-a241-2a6341647e2f
  #5 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=0bbc2dce-f60a-4da6-89f5-efd0bec971ae
  #6 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=5efd8b76 fHash=9b2a34e4 stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=c04b8c09-310d-439d-af54-33ed3ba5f7d0
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=669a2940-8754-41af-85c2-265c7ff75b70
  #8 type=MeshStandardMaterial name='Wood' bucket=other cacheKey=physical,STANDARD,,highp… vHash=d38f15a4 fHash=6578c10d stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=500fc3d8-cbe1-45fe-bd9f-dfcc2cc08af4 (Wood)
  #9 type=MeshStandardMaterial name='None' bucket=environment cacheKey=physical,STANDARD,,highp… vHash=6db98a06 fHash=efed8e98 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=04fd7d79-2ad9-4350-9cc9-02745791678e (None)
  #10 type=MeshStandardMaterial name='Green' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=c0d790d1 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=01a0f4ba-d775-4fb0-b3a9-73f33d28422f (Green)
  #11 type=MeshStandardMaterial name='Pink' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=d3fd7a87 fHash=2eae9a54 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=26283f1d-5a9f-4c80-b401-3c50b4718182 (Pink)
  #12 type=MeshStandardMaterial name='Stone' bucket=environment cacheKey=physical,STANDARD,,highp… vHash=a9733c9d fHash=bd723c8a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=f532de74-52d0-4026-9a08-8e022d35bfc5 (Stone)
  #13 type=MeshStandardMaterial name='Flowers' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=e4cbf8ca fHash=135696d3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0.45","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=e7627943-116e-465a-bda4-775a5ef02ef9 (Flowers)
  #14 type=MeshStandardMaterial name='Wood_Light' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=f3a1039e fHash=c7daf23 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=245b2f4b-1a4a-4112-8499-c257aa258d58 (Wood)
  #15 type=MeshStandardMaterial name='Green' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=36c0231b fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=5b56f28b-60a3-4766-ba82-aeb0f88bc5fa (Green)
  #16 type=MeshStandardMaterial name='MI_WoodTrim' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=c5e73b05 fHash=d4c95125 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=bf9a4c46-880b-4d62-9d4c-3600973d9bd9 (MI_WoodTrim)
  #17 type=MeshStandardMaterial name='MI_WindowGlass' cacheKey=physical,STANDARD,,highp… vHash=13a74ec7 fHash=3ab4c629 stage=mirror-render
  #18 type=MeshStandardMaterial name='MI_WindowGlass' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=9dcf1cb4 fHash=2d1aa4a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=10055713-175a-4895-9b7a-0b1e2560bc93 (MI_WindowGlass)
  #19 type=MeshStandardMaterial name='MI_WoodTrim' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=12873951 fHash=d4c95125 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=31eaa3b0-882b-4f62-99f0-9057e8ee763f (MI_WoodTrim)
  #20 type=MeshStandardMaterial name='MI_WindowGlass' cacheKey=physical,STANDARD,,highp… vHash=fc941d05 fHash=3ab4c629 stage=mirror-render
  #21 type=MeshStandardMaterial name='MI_WindowGlass' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=e551c572 fHash=2d1aa4a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=983072f8-b74a-4504-905a-71b96cda73d8 (MI_WindowGlass)
  #22 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=df7c703d fHash=236b3b0b stage=mirror-render
  #23 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=f92c8d8c fHash=87d053eb stage=mirror-render
  #24 type=MeshStandardMaterial name='Flowers' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=d9d07622 fHash=135696d3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0.45","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=d2411d85-1e0f-4c72-a366-8a1fc6b9dd1e (MapleTree_Leaves)
  #25 type=MeshStandardMaterial name='Green' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=190d3a9c fHash=633146b4 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=a38a20c7-040e-4281-8182-a20b6a0c8487 (Green)
  #26 type=MeshStandardMaterial name='MapleTree_Bark' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=9dbe8ee7 fHash=8dba9dd stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=96262cef-b052-4ad9-ba89-8db102058120 (MapleTree_Bark)
  #27 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=fd8301ed fHash=2f2885d5 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=94e8156e-391d-474d-95a2-5c11467d9d40 (Main)
  #28 type=MeshStandardMaterial name='Handle' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=88cdd138 fHash=f2ad9521 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=a63a15c0-5082-4c42-977a-ebada7c72f93 (Handle)
  #29 type=MeshStandardMaterial name='PathRocks' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=b643916d fHash=754b87bd stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=e046a581-17c0-4865-bbfd-a933e96fbdc9 (PathRocks)
  #30 type=MeshStandardMaterial name='Skin' bucket=npc cacheKey=physical,STANDARD,,highp… vHash=9b5bd39e fHash=314bad96 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=73acd52a-7ff7-4c6e-bae2-6cdd901eafae (Skin)
  #31 type=MeshStandardMaterial name='LimeGreen' bucket=npc cacheKey=physical,STANDARD,,highp… vHash=60935e0a fHash=7e862ff5 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=3361ceb5-5010-4fc6-9bd5-988a132e2eac (LimeGreen)
  #32 type=MeshStandardMaterial name='MI_Peasant' bucket=npc cacheKey=physical,STANDARD,,highp… vHash=f618dfff fHash=4057772 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=6985ac2d-af12-47ac-a509-9254c5f292cf (MI_Peasant)
  #33 type=MeshStandardMaterial name='MI_Hair_2' bucket=npc cacheKey=physical,STANDARD,,highp… vHash=5ed1ec8c fHash=80443a73 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=779b2c42-1eb8-43ba-bea6-e1442426207a (MI_Hair_2)
  #34 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=5b43c776 fHash=70b71dad stage=mirror-render
  #35 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=mirror-render
  #36 type=MeshBasicMaterial name='' cacheKey=basic,highp,srgb-linear,… vHash=d459e49b fHash=a8a9bac3 stage=mirror-render
  #37 type=MeshBasicMaterial name='' bucket=other cacheKey=basic,highp,srgb-linear,… vHash=b6911298 fHash=73a25d1e stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"true","normalMap":"false","envMap":"false"}
      material=ecc640eb-a7d0-4ce5-995d-5c4db6be799c
  #38 type=MeshStandardMaterial name='lambert2SG' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=7bb77142 fHash=87728b15 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=2d12d7be-83c5-4a53-bee2-426dd6cb526b (lambert2SG)
  #39 type=MeshPhysicalMaterial name='Material #55' bucket=fauna cacheKey=physical,STANDARD,,PHYSI… vHash=a344732e fHash=16869b56 stage=mirror-render
      defines={"STANDARD":"","PHYSICAL":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=f6bb8122-054a-43a8-8c6b-6c7bea8ee9cd (Material #55)
  #40 type=MeshStandardMaterial name='Pond_Pack_MAT' bucket=other cacheKey=physical,STANDARD,,highp… vHash=c3bc6325 fHash=ded4be89 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=32b9e4f5-51dc-4fb0-ada4-7e6134714f49 (Pond_Pack_MAT)
  #41 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=94297e69 fHash=aa0735a8 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=999ddd0a-a74a-4791-bd11-755bb5660c7f
  #42 type=MeshDepthMaterial name='' cacheKey=depth,highp,srgb-linear,… vHash=59ed5d71 fHash=d729897e stage=postprocess-render
  #43 type=MeshDepthMaterial name='' cacheKey=depth,highp,srgb-linear,… vHash=585a1ea4 fHash=41e40a66 stage=postprocess-render
  #44 type=MeshDepthMaterial name='' cacheKey=depth,highp,srgb-linear,… vHash=b69ba143 fHash=d729897e stage=postprocess-render
  #45 type=MeshDepthMaterial name='' cacheKey=depth,highp,srgb-linear,… vHash=c203b19a fHash=41e40a66 stage=postprocess-render
  #46 type=MeshDepthMaterial name='' cacheKey=depth,highp,srgb-linear,… vHash=c203b19a fHash=a9dd0dee stage=postprocess-render
  #47 type=MeshDepthMaterial name='' cacheKey=depth,highp,srgb-linear,… vHash=585a1ea4 fHash=a9dd0dee stage=postprocess-render
  #48 type=MeshDepthMaterial name='' cacheKey=depth,highp,srgb-linear,… vHash=263c45d6 fHash=d729897e stage=postprocess-render
  #49 type=MeshDepthMaterial name='' cacheKey=depth,highp,srgb-linear,… vHash=e4717b03 fHash=41e40a66 stage=postprocess-render
  #50 type=ShaderMaterial name='' cacheKey=16,17,highp,srgb-linear,… vHash=279cec18 fHash=4d6bcede stage=postprocess-render
  #51 type=ShaderMaterial name='' cacheKey=18,19,highp,srgb-linear,… vHash=84736a68 fHash=ffecb62a stage=postprocess-render
  #52 type=ShaderMaterial name='' cacheKey=20,21,highp,srgb-linear,… vHash=aa2edbee fHash=76ced00a stage=postprocess-render
  #53 type=ShaderMaterial name='' cacheKey=22,23,highp,srgb-linear,… vHash=7bae0bb2 fHash=fb55b3c0 stage=postprocess-render
  #54 type=ShaderMaterial name='' cacheKey=24,25,highp,srgb-linear,… vHash=436caea4 fHash=2d687ef1 stage=postprocess-render
  #55 type=ShaderMaterial name='' cacheKey=26,27,SMAA_THRESHOLD,0.1… vHash=886438e7 fHash=dc2a89b5 stage=postprocess-render
  #56 type=ShaderMaterial name='' cacheKey=28,29,SMAA_MAX_SEARCH_ST… vHash=d99a5b29 fHash=109e33fc stage=postprocess-render
  #57 type=ShaderMaterial name='' cacheKey=30,31,highp,srgb-linear,… vHash=2003ced8 fHash=db0f470a stage=postprocess-render
  #58 type=ShaderMaterial name='' cacheKey=32,33,highp,srgb-linear,… vHash=28dfa407 fHash=9775cd0e stage=postprocess-render
  #59 type=ShaderMaterial name='' cacheKey=34,35,KERNEL_RADIUS,6,hi… vHash=756a0b19 fHash=5c741650 stage=postprocess-render
  #60 type=ShaderMaterial name='' cacheKey=34,35,KERNEL_RADIUS,10,h… vHash=b2354ff2 fHash=2aad9943 stage=postprocess-render
  #61 type=ShaderMaterial name='' cacheKey=34,35,KERNEL_RADIUS,14,h… vHash=ea82969e fHash=a2297d9f stage=postprocess-render
  #62 type=ShaderMaterial name='' cacheKey=34,35,KERNEL_RADIUS,18,h… vHash=7dab8d9a fHash=1022767b stage=postprocess-render
  #63 type=ShaderMaterial name='' cacheKey=34,35,KERNEL_RADIUS,22,h… vHash=378e1fb7 fHash=ce0bf6b4 stage=postprocess-render
  #64 type=ShaderMaterial name='' cacheKey=34,36,NUM_MIPS,5,highp,s… vHash=78acf7ea fHash=707f290c stage=postprocess-render
  #65 type=ShaderMaterial name='' cacheKey=37,38,highp,srgb-linear,… vHash=a312c579 fHash=c05e2256 stage=postprocess-render
  #66 type=ShaderMaterial name='GodRaysShader' cacheKey=39,40,highp,srgb-linear,… vHash=b817515d fHash=ccc98549 stage=postprocess-render
  #67 type=RawShaderMaterial name='OutputShader' cacheKey=41,42,SRGB_TRANSFER,,ACE… vHash=5d2c950f fHash=3f479486 stage=postprocess-render

Differences within frame 0 (grouped by material type):
  ShaderMaterial (26 programs):
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=e6d01ae7, #6=5efd8b76, #22=df7c703d, #23=f92c8d8c, #34=5b43c776, #50=279cec18, #51=84736a68, #52=aa2edbee, #53=7bae0bb2, #54=436caea4, #55=886438e7, #56=d99a5b29, #57=2003ced8, #58=28dfa407, #59=756a0b19, #60=b2354ff2, #61=ea82969e, #62=7dab8d9a, #63=378e1fb7, #64=78acf7ea, #65=a312c579, #66=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=2cf9fa62, #5=e34491ff, #6=9b2a34e4, #22=236b3b0b, #23=87d053eb, #34=70b71dad, #50=4d6bcede, #51=ffecb62a, #52=76ced00a, #53=fb55b3c0, #54=2d687ef1, #55=dc2a89b5, #56=109e33fc, #57=db0f470a, #58=9775cd0e, #59=5c741650, #60=2aad9943, #61=a2297d9f, #62=1022767b, #63=ce0bf6b4, #64=707f290c, #65=c05e2256, #66=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=water, #6=grass, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #22=(unset), #23=(unset), #34=(unset), #50=(unset), #51=(unset), #52=(unset), #53=(unset), #54=(unset), #55=(unset), #56=(unset), #57=(unset), #58=(unset), #59=(unset), #60=(unset), #61=(unset), #62=(unset), #63=(unset), #64=(unset), #65=(unset), #66=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
  MeshStandardMaterial (29 programs):
    vertexShaderHash differs: #2=5c2c57a3, #7=e3408c64, #8=d38f15a4, #9=6db98a06, #10=c0d790d1, #11=d3fd7a87, #12=a9733c9d, #13=e4cbf8ca, #14=f3a1039e, #15=36c0231b, #16=c5e73b05, #17=13a74ec7, #18=9dcf1cb4, #19=12873951, #20=fc941d05, #21=e551c572, #24=d9d07622, #25=190d3a9c, #26=9dbe8ee7, #27=fd8301ed, #28=88cdd138, #29=b643916d, #30=9b5bd39e, #31=60935e0a, #32=f618dfff, #33=5ed1ec8c, #38=7bb77142, #40=c3bc6325, #41=94297e69
    fragmentShaderHash differs: #2=a1daa357, #7=c0b8fc9f, #8=6578c10d, #9=efed8e98, #10=a81023c3, #11=2eae9a54, #12=bd723c8a, #13=135696d3, #14=c7daf23, #15=a81023c3, #16=d4c95125, #17=3ab4c629, #18=2d1aa4a, #19=d4c95125, #20=3ab4c629, #21=2d1aa4a, #24=135696d3, #25=633146b4, #26=8dba9dd, #27=2f2885d5, #28=f2ad9521, #29=754b87bd, #30=314bad96, #31=7e862ff5, #32=4057772, #33=80443a73, #38=87728b15, #40=ded4be89, #41=aa0735a8
    bucket differs: #2=terrain, #7=other, #8=other, #9=environment, #10=vegetation, #11=vegetation, #12=environment, #13=vegetation, #14=settlement, #15=settlement, #16=settlement, #17=(unknown), #18=settlement, #19=settlement, #20=(unknown), #21=settlement, #24=settlement, #25=settlement, #26=settlement, #27=fauna, #28=settlement, #29=settlement, #30=npc, #31=npc, #32=npc, #33=npc, #38=fauna, #40=other, #41=other
    define STANDARD differs: #2=, #7=, #8=, #9=, #10=, #11=, #12=, #13=, #14=, #15=, #16=, #17=(unset), #18=, #19=, #20=(unset), #21=, #24=, #25=, #26=, #27=, #28=, #29=, #30=, #31=, #32=, #33=, #38=, #40=, #41=
    flag alphaTest differs: #2=0, #7=0, #8=0, #9=0, #10=0, #11=0, #12=0, #13=0.45, #14=0, #15=0, #16=0, #17=(unknown), #18=0, #19=0, #20=(unknown), #21=0, #24=0.45, #25=0, #26=0, #27=0, #28=0, #29=0, #30=0, #31=0, #32=0, #33=0, #38=0, #40=0, #41=0
    flag envMap differs: #2=false, #7=false, #8=false, #9=false, #10=false, #11=false, #12=false, #13=false, #14=false, #15=false, #16=false, #17=(unknown), #18=false, #19=false, #20=(unknown), #21=false, #24=false, #25=false, #26=false, #27=false, #28=false, #29=false, #30=false, #31=false, #32=false, #33=false, #38=false, #40=false, #41=false
    flag flatShading differs: #2=false, #7=true, #8=false, #9=false, #10=false, #11=false, #12=false, #13=false, #14=false, #15=false, #16=false, #17=(unknown), #18=false, #19=false, #20=(unknown), #21=false, #24=false, #25=false, #26=false, #27=false, #28=true, #29=false, #30=false, #31=false, #32=false, #33=false, #38=false, #40=false, #41=true
    flag fog differs: #2=true, #7=true, #8=true, #9=true, #10=true, #11=true, #12=true, #13=true, #14=true, #15=true, #16=true, #17=(unknown), #18=true, #19=true, #20=(unknown), #21=true, #24=true, #25=true, #26=true, #27=true, #28=true, #29=true, #30=true, #31=true, #32=true, #33=true, #38=true, #40=true, #41=true
    flag map differs: #2=false, #7=false, #8=false, #9=true, #10=false, #11=false, #12=false, #13=true, #14=false, #15=false, #16=true, #17=(unknown), #18=false, #19=true, #20=(unknown), #21=false, #24=true, #25=false, #26=true, #27=false, #28=false, #29=true, #30=false, #31=false, #32=true, #33=true, #38=true, #40=true, #41=false
    flag normalMap differs: #2=true, #7=false, #8=false, #9=false, #10=false, #11=false, #12=false, #13=false, #14=false, #15=false, #16=true, #17=(unknown), #18=false, #19=true, #20=(unknown), #21=false, #24=false, #25=false, #26=true, #27=false, #28=false, #29=false, #30=false, #31=false, #32=true, #33=true, #38=false, #40=false, #41=false
    flag transparent differs: #2=false, #7=false, #8=false, #9=false, #10=false, #11=false, #12=false, #13=false, #14=false, #15=false, #16=false, #17=(unknown), #18=true, #19=false, #20=(unknown), #21=true, #24=false, #25=false, #26=false, #27=false, #28=false, #29=false, #30=false, #31=false, #32=false, #33=false, #38=false, #40=false, #41=false
    flag vertexColors differs: #2=true, #7=false, #8=false, #9=false, #10=false, #11=false, #12=false, #13=false, #14=false, #15=false, #16=false, #17=(unknown), #18=false, #19=false, #20=(unknown), #21=false, #24=false, #25=false, #26=false, #27=false, #28=false, #29=false, #30=false, #31=false, #32=false, #33=false, #38=false, #40=true, #41=false
    flag wireframe differs: #2=false, #7=false, #8=false, #9=false, #10=false, #11=false, #12=false, #13=false, #14=false, #15=false, #16=false, #17=(unknown), #18=false, #19=false, #20=(unknown), #21=false, #24=false, #25=false, #26=false, #27=false, #28=false, #29=false, #30=false, #31=false, #32=false, #33=false, #38=false, #40=false, #41=false
  SpriteMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)
  MeshBasicMaterial (2 programs):
    vertexShaderHash differs: #36=d459e49b, #37=b6911298
    fragmentShaderHash differs: #36=a8a9bac3, #37=73a25d1e
    bucket differs: #36=(unknown), #37=other
    flag alphaTest differs: #36=(unknown), #37=0
    flag envMap differs: #36=(unknown), #37=false
    flag fog differs: #36=(unknown), #37=false
    flag map differs: #36=(unknown), #37=true
    flag normalMap differs: #36=(unknown), #37=false
    flag transparent differs: #36=(unknown), #37=true
    flag vertexColors differs: #36=(unknown), #37=false
    flag wireframe differs: #36=(unknown), #37=false
  MeshPhysicalMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)
  MeshDepthMaterial (8 programs):
    vertexShaderHash differs: #42=59ed5d71, #43=585a1ea4, #44=b69ba143, #45=c203b19a, #46=c203b19a, #47=585a1ea4, #48=263c45d6, #49=e4717b03
    fragmentShaderHash differs: #42=d729897e, #43=41e40a66, #44=d729897e, #45=41e40a66, #46=a9dd0dee, #47=a9dd0dee, #48=d729897e, #49=41e40a66
  RawShaderMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)

---

[Seedvale Program Attribution]



Frame 1264 (+10):
  Program #78
    material: MeshStandardMaterial ''
    materialUuid: 2c30ca3c-88f8-44d2-bb5d-29ac79490c1d
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 89831d77
  Program #79
    material: MeshStandardMaterial 'Wood'
    materialUuid: 3c686c9d-cf72-4e3c-9d8a-f7ff3e3fdf5b
    object: Mesh 'mesh_0'
    asset: /models/settlement/crate.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 320d0e37
    fragmentShaderHash: 65cafcc2
  Program #80
    material: MeshStandardMaterial 'Green'
    materialUuid: 71558f96-df78-47e0-a5d4-0351b7ef2bde
    object: Mesh 'mesh_0_1'
    asset: /models/nature/tree_b.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,(shader, renderer) => {
    prevCompile?.(shader, renderer);
    shader.uniforms.uFoliageTime = uFoliageTime;
    if (!shader.vertexShader.includes("uFoliageTime")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform float uFoliageTime;"
      ).replace("#include <begin_vertex>", BEGIN_VERTEX_WIND);
    }
  }|foliage-wind-v3
    defines: {"STANDARD":""}
    vertexShaderHash: 780f6dcc
    fragmentShaderHash: dbb99308
  Program #81
    material: MeshStandardMaterial 'Green'
    materialUuid: bc5a1f80-c940-44ac-8e04-98d6a4eaa086
    object: Mesh 'settlement-bushes-6:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,(shader, renderer) => {
    prevCompile?.(shader, renderer);
    shader.uniforms.uFoliageTime = uFoliageTime;
    if (!shader.vertexShader.includes("uFoliageTime")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform float uFoliageTime;"
      ).replace("#include <begin_vertex>", BEGIN_VERTEX_WIND);
    }
  }|foliage-wind-v3
    defines: {"STANDARD":""}
    vertexShaderHash: d0069e25
    fragmentShaderHash: c94ff2d5
  Program #82
    material: MeshStandardMaterial 'Berry'
    materialUuid: 69925a6a-d866-4473-b9f2-27bc9475bed3
    object: Mesh 'Barrel_1'
    asset: /models/settlement/barrel.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 798c4bf5
    fragmentShaderHash: c37cc244
  Program #83
    material: MeshStandardMaterial 'MapleTree_Bark'
    materialUuid: 96262cef-b052-4ad9-ba89-8db102058120
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 2c216b4f
    fragmentShaderHash: 47812acb
  Program #84
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: e7627943-116e-465a-bda4-775a5ef02ef9
    object: Mesh 'mesh_0'
    asset: /models/nature/flower_clump_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389121,8521731,srgb,(shader, renderer) => {
    prevCompile?.(shader, renderer);
    shader.uniforms.uFoliageTime = uFoliageTime;
    if (!shader.vertexShader.includes("uFoliageTime")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform float uFoliageTime;"
      ).replace("#include <begin_vertex>", BEGIN_VERTEX_WIND);
    }
  }|foliage-wind-v3
    defines: {"STANDARD":""}
    vertexShaderHash: 6d95624c
    fragmentShaderHash: 5a74547b
  Program #85
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: 2f0b10d1-ddb7-4a3f-bbf7-08d7dc038708
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #86
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 81a7926c-431e-4a26-8051-d4fc10d990f4
    object: Mesh 'chunk-vegetation-region-1,0|fern-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8392193,8519683,srgb,(shader, renderer) => {
    prevCompile?.(shader, renderer);
    shader.uniforms.uFoliageTime = uFoliageTime;
    if (!shader.vertexShader.includes("uFoliageTime")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform float uFoliageTime;"
      ).replace("#include <begin_vertex>", BEGIN_VERTEX_WIND);
    }
  }|foliage-wind-v3
    defines: {"STANDARD":""}
    vertexShaderHash: 3858a100
    fragmentShaderHash: 4abfdd1b
  Program #87
    material: MeshStandardMaterial 'MI_Regular_Male'
    materialUuid: eb959b57-d37f-4eae-a822-f904ca53556c
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/ubc/male_peasant.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,uv,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388672,8521763,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: de7c9827
    fragmentShaderHash: 4fa0b088

Frame 1519 (+16):
  Program #96
    material: ShaderMaterial 'SkyShader'
    materialUuid: a20f6e63-5286-41c1-af12-7d0ff38fcf65
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #97
    material: ShaderMaterial ''
    materialUuid: c04b8c09-310d-439d-af54-33ed3ba5f7d0
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 5efd8b76
    fragmentShaderHash: 8c624cc7
  Program #98
    material: MeshStandardMaterial ''
    materialUuid: 2c30ca3c-88f8-44d2-bb5d-29ac79490c1d
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: 6b931360
  Program #99
    material: MeshStandardMaterial 'Wood'
    materialUuid: 3c686c9d-cf72-4e3c-9d8a-f7ff3e3fdf5b
    object: Mesh 'mesh_0'
    asset: /models/settlement/crate.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5cee842b
    fragmentShaderHash: 1683d5db
  Program #100
    material: MeshStandardMaterial 'Green'
    materialUuid: 71558f96-df78-47e0-a5d4-0351b7ef2bde
    object: Mesh 'mesh_0_1'
    asset: /models/nature/tree_b.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,(shader, renderer) => {
    prevCompile?.(shader, renderer);
    shader.uniforms.uFoliageTime = uFoliageTime;
    if (!shader.vertexShader.includes("uFoliageTime")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform float uFoliageTime;"
      ).replace("#include <begin_vertex>", BEGIN_VERTEX_WIND);
    }
  }|foliage-wind-v3
    defines: {"STANDARD":""}
    vertexShaderHash: 80917d5e
    fragmentShaderHash: 3414bdd9
  Program #101
    material: MeshStandardMaterial 'Green'
    materialUuid: bc5a1f80-c940-44ac-8e04-98d6a4eaa086
    object: Mesh 'settlement-bushes-6:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,(shader, renderer) => {
    prevCompile?.(shader, renderer);
    shader.uniforms.uFoliageTime = uFoliageTime;
    if (!shader.vertexShader.includes("uFoliageTime")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform float uFoliageTime;"
      ).replace("#include <begin_vertex>", BEGIN_VERTEX_WIND);
    }
  }|foliage-wind-v3
    defines: {"STANDARD":""}
    vertexShaderHash: c0d790d1
    fragmentShaderHash: 3aaee6d6
  Program #102
    material: MeshStandardMaterial 'Berry'
    materialUuid: 69925a6a-d866-4473-b9f2-27bc9475bed3
    object: Mesh 'Barrel_1'
    asset: /models/settlement/barrel.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: c8368f61
    fragmentShaderHash: 8142f955
  Program #103
    material: MeshStandardMaterial 'MapleTree_Bark'
    materialUuid: 96262cef-b052-4ad9-ba89-8db102058120
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: d612cf03
    fragmentShaderHash: 2a64e35c
  Program #104
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: e7627943-116e-465a-bda4-775a5ef02ef9
    object: Mesh 'mesh_0'
    asset: /models/nature/flower_clump_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389121,8522755,srgb,(shader, renderer) => {
    prevCompile?.(shader, renderer);
    shader.uniforms.uFoliageTime = uFoliageTime;
    if (!shader.vertexShader.includes("uFoliageTime")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform float uFoliageTime;"
      ).replace("#include <begin_vertex>", BEGIN_VERTEX_WIND);
    }
  }|foliage-wind-v3
    defines: {"STANDARD":""}
    vertexShaderHash: 5641a2de
    fragmentShaderHash: ac9d73ac
  Program #105
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: 2f0b10d1-ddb7-4a3f-bbf7-08d7dc038708
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #106
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 81a7926c-431e-4a26-8051-d4fc10d990f4
    object: Mesh 'chunk-vegetation-region-1,0|fern-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8392193,8520707,srgb,(shader, renderer) => {
    prevCompile?.(shader, renderer);
    shader.uniforms.uFoliageTime = uFoliageTime;
    if (!shader.vertexShader.includes("uFoliageTime")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform float uFoliageTime;"
      ).replace("#include <begin_vertex>", BEGIN_VERTEX_WIND);
    }
  }|foliage-wind-v3
    defines: {"STANDARD":""}
    vertexShaderHash: 984eda2a
    fragmentShaderHash: d65a968c
  Program #107
    material: MeshStandardMaterial 'MI_Regular_Male'
    materialUuid: eb959b57-d37f-4eae-a822-f904ca53556c
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/ubc/male_peasant.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,uv,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388672,8522787,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: bd5799fb
    fragmentShaderHash: b5666e59
  Program #108
    material: ShaderMaterial ''
    materialUuid: 0bbc2dce-f60a-4da6-89f5-efd0bec971ae
    object: Mesh 'ocean'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: e6d01ae7
    fragmentShaderHash: 215382b6
  Program #109
    material: ShaderMaterial ''
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 14,15,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,0,8389635,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 5b43c776
    fragmentShaderHash: 34e03bb0
  Program #110
    material: ShaderMaterial ''
    materialUuid: 31b785c5-87ce-4e5e-a2a9-303f822f431d
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
  Program #111
    material: ShaderMaterial ''
    materialUuid: 8add63e5-7a3d-4c78-9ad4-f3dd02f2aaa3
    object: Mesh 'chunk-river'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 6,7,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,0,8391683,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 22690955
    fragmentShaderHash: 593d20b7

---

[Seedvale Program Compile Cost]

No isolated per-program GPU compile/link timer exists in the public Three.js/WebGL API without patching internals (out of scope here). Each number below is the wall-clock duration of the renderer.render() call (mirror-render/postprocess-render) that first-used the program, reported ONLY when that program was the single new program created during that specific call — an upper bound that also includes the rest of that call's render cost, not an isolated compile/link timer.
Excluded — no reliable per-program timing: 106 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 29
  #70
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 42.7 ms  (upper bound — whole postprocess-render call, see note above)

Frame 87
  #73
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 31.6 ms  (upper bound — whole postprocess-render call, see note above)

Frame 100
  #74
      material: MeshStandardMaterial 'MapleTree_Bark'
      object: Mesh 'mesh_0'
      asset: /models/nature/maple_1.glb
      compile/link: 17.5 ms  (upper bound — whole mirror-render call, see note above)

Frame 126
  #75
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 21.1 ms  (upper bound — whole postprocess-render call, see note above)

Frame 138
  #76
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,0|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 49.7 ms  (upper bound — whole mirror-render call, see note above)

Frame 310
  #77
      material: MeshStandardMaterial 'Green'
      object: Mesh 'mesh_0_1'
      asset: /models/nature/tree_b.glb
      foliage-wind-v3
      compile/link: 38.7 ms  (upper bound — whole mirror-render call, see note above)

Summary:
  total measured compile/link time: 201.3 ms
  programs >1 ms: 6
  max: 49.7 ms (#76)

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=10.8 ms  p95=15.8 ms  max=19.4 ms  Δavg vs baseline=—
  hide-grass           avg=7.6 ms  p95=10.4 ms  max=10.8 ms  Δavg vs baseline=-3.2 ms (-29%)
  hide-vegetation      avg=6.8 ms  p95=8.4 ms  max=9.0 ms  Δavg vs baseline=-4.0 ms (-37%)
  no vegetation/grass  avg=7.0 ms  p95=10.0 ms  max=10.6 ms  Δavg vs baseline=-3.8 ms (-35%)
  hide-environment     avg=8.0 ms  p95=9.9 ms  max=10.5 ms  Δavg vs baseline=-2.8 ms (-26%)
  hide-settlement      avg=8.8 ms  p95=11.9 ms  max=14.6 ms  Δavg vs baseline=-2.0 ms (-19%)
  no water             avg=9.1 ms  p95=11.1 ms  max=12.7 ms  Δavg vs baseline=-1.7 ms (-16%)
  hide-terrain         avg=8.3 ms  p95=10.2 ms  max=10.7 ms  Δavg vs baseline=-2.5 ms (-23%)
  hide-npc-fauna       avg=7.9 ms  p95=10.4 ms  max=12.3 ms  Δavg vs baseline=-2.9 ms (-27%)
  no-shadows           avg=8.5 ms  p95=12.9 ms  max=13.2 ms  Δavg vs baseline=-2.3 ms (-21%)
  no-ao                avg=7.3 ms  p95=9.5 ms  max=9.5 ms  Δavg vs baseline=-3.5 ms (-32%)
  no-bloom             avg=9.2 ms  p95=13.5 ms  max=14.6 ms  Δavg vs baseline=-1.6 ms (-15%)
  no-smaa              avg=7.9 ms  p95=10.0 ms  max=11.1 ms  Δavg vs baseline=-2.9 ms (-27%)
  no-god-rays          avg=9.7 ms  p95=12.8 ms  max=15.0 ms  Δavg vs baseline=-1.1 ms (-10%)
  no-film-grade        avg=9.3 ms  p95=11.0 ms  max=11.0 ms  Δavg vs baseline=-1.5 ms (-14%)
  no postprocessing    avg=8.6 ms  p95=12.8 ms  max=13.5 ms  Δavg vs baseline=-2.2 ms (-20%)
  no mirrors           avg=7.3 ms  p95=8.6 ms  max=8.9 ms  Δavg vs baseline=-3.4 ms (-32%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (24 samples resolved during the baseline window)
  GPU elapsed   avg=21.9 ms  p95=24.7 ms  max=26.8 ms
  CPU wall      avg=10.8 ms  p95=15.8 ms  max=19.4 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

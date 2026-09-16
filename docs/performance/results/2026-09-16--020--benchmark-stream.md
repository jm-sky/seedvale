# Seedvale Performance Benchmark Report

> Generated: 2026-09-16T11:54:49.454Z
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
  avg: 9.5
  min: 1
  p1: 2

Frame time:
  avg: 104.9 ms
  p95: 139.6 ms
  max: 1119.4 ms

Rendering:
  draw calls: 1577 avg / 2286 max
  triangles: 11.79M avg
  mirror draws: 269 avg
  geometries: 831
  textures: 439

Scene (one-pass estimate):
  terrain        draws=53 tris=3.91M meshes=53 inst=53
  grass          draws=96 tris=11.35M meshes=96 inst=840685
  vegetation     draws=108 tris=887.4k meshes=108 inst=582
  environment    draws=117 tris=23.7k meshes=117 inst=126
  settlement     draws=866 tris=894.1k meshes=866 inst=1438
  water          draws=28 tris=2.00M meshes=28 inst=28
  npc            draws=182 tris=308.7k meshes=182 inst=182
  fauna          draws=210 tris=87.7k meshes=210 inst=210
  items          draws=106 tris=15.7k meshes=106 inst=106
  other          draws=363 tris=33.5k meshes=363 inst=363

Systems:
  WATER          5.2 ms
  STREAMING      2.8 ms
  NPC            15.4 ms
  FAUNA          42.9 ms
  PHYSICS        0.1 ms
  RENDER         30.6 ms

Detected bottlenecks:
  1. FAUNA
  2. RENDER
  3. NPC

Critical spikes:
  WATER: 1
  STREAMING: 1

Hitches (>= 8 ms):
  chunk mesh             n=1 avg=10.5 max=10.5
  chunk water            n=1 avg=8.6 max=8.6

Isolation probes:
  full               render=0.0 ms draws=0 tris=0
  hide-grass         render=0.0 ms draws=0 tris=0
  hide-vegetation    render=0.0 ms draws=0 tris=0
  hide-vegetation-grass render=0.0 ms draws=0 tris=0
  hide-environment   render=0.0 ms draws=0 tris=0
  hide-settlement    render=0.0 ms draws=0 tris=0
  hide-water         render=0.0 ms draws=0 tris=0
  hide-terrain       render=0.0 ms draws=0 tris=0
  hide-npc-fauna     render=0.0 ms draws=0 tris=0
  no-shadows         render=0.0 ms draws=0 tris=0
  no-ao              render=0.0 ms draws=0 tris=0
  no-bloom           render=0.0 ms draws=0 tris=0
  no-smaa            render=0.0 ms draws=0 tris=0
  no-god-rays        render=0.0 ms draws=0 tris=0
  no-film-grade      render=0.0 ms draws=0 tris=0
  no-postprocessing  render=0.0 ms draws=0 tris=0
  no-reflections     render=0.0 ms draws=0 tris=0

Frame attribution:
  frame max: 1119.4 ms
  largest labelled hitch: 10.5 ms
  unattributed: 1108.9 ms

Long frames:
  threshold: 80 ms
  count: 51
  worst: 1119.4 ms

Recommendation:
Largest frame (1119.4 ms) is not explained by labelled hitches (largest 10.5 ms) — unattributed frame spike, not a category bottleneck.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 20
  Fauna (agents): 31

NPC:
  total: 15.4 ms/frame
  crowd pass: 0.0 ms/frame (1.8 ms cumulative)
  agent updates: 2.0 ms/frame (166.2 ms cumulative)
  livestock: 8.7 ms/frame (723.4 ms cumulative)
    loaded tick: 8.7 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 8.7 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 6.2 ms/frame
      life/presentation: 2.1 ms/frame
      other update: 0.2 ms/frame
    update calls/frame: 19.0
    unique animals/frame: 19.0
    duplicate updates/frame: 0.0
    detached animals/frame: 0.0
    dog updates/frame: 4.0
    dog guard scans: 4.0/frame (28.0 predator candidates/frame)
    pest scans: 2.0/frame (2.0 rat candidates/frame)
    nearest scans: 10.0/frame (0.0 candidates/frame)
    full-rate agents/frame: 0.3
    reduced-cadence agents/frame: 18.7
    behaviour executions/frame: 10.0
    presentation executions/frame: 9.9
  rats: 4.2 ms/frame (350.4 ms cumulative)
  social: 0.0 ms/frame (3.9 ms cumulative)
  streaming: 0.0 ms/frame (0.2 ms cumulative)
  maintenance: 0.3 ms/frame (21.6 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 42.9 ms/frame
  agent updates: 42.8 ms/frame (3548.4 ms cumulative)
  forest sampling: 0.2 ms/frame (15.9 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.1 ms/frame (11.5 ms cumulative)
    targeting: 0.0 ms/frame (4.1 ms cumulative)
    decision: 0.1 ms/frame (5.5 ms cumulative)
    behaviour: 37.1 ms/frame (3083.0 ms cumulative)
    life/presentation: 4.7 ms/frame (389.3 ms cumulative)
    other update: 0.5 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.4
    expensive behaviour agents/frame: 20.5
    full-rate agents/frame: 7.8
    reduced-cadence agents/frame: 23.2
    behaviour executions/frame: 20.9
    presentation executions/frame: 20.9

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 31.0
    village scan candidates/frame: 484.9
    player perception checks/frame: 31.0

  nearest scans: 29.5/frame (2445 calls)
  nearest candidates checked: 491.6/frame (40805 total)
  herd leader scans: 0.3/frame (29 calls)
  herd candidates checked: 10.8/frame (899 total)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 20
  Fauna (agents): 31

NPC:
  total: 15.4 ms/frame
  crowd pass: 0.0 ms/frame (1.8 ms cumulative)
  agent updates: 2.0 ms/frame (166.2 ms cumulative)
  livestock: 8.7 ms/frame (723.4 ms cumulative)
    loaded tick: 8.7 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 8.7 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 6.2 ms/frame
      life/presentation: 2.1 ms/frame
      other update: 0.2 ms/frame
    update calls/frame: 19.0
    unique animals/frame: 19.0
    duplicate updates/frame: 0.0
    detached animals/frame: 0.0
    dog updates/frame: 4.0
    dog guard scans: 4.0/frame (28.0 predator candidates/frame)
    pest scans: 2.0/frame (2.0 rat candidates/frame)
    nearest scans: 10.0/frame (0.0 candidates/frame)
    full-rate agents/frame: 0.3
    reduced-cadence agents/frame: 18.7
    behaviour executions/frame: 10.0
    presentation executions/frame: 9.9
  rats: 4.2 ms/frame (350.4 ms cumulative)
  social: 0.0 ms/frame (3.9 ms cumulative)
  streaming: 0.0 ms/frame (0.2 ms cumulative)
  maintenance: 0.3 ms/frame (21.6 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 42.9 ms/frame
  agent updates: 42.8 ms/frame (3548.4 ms cumulative)
  forest sampling: 0.2 ms/frame (15.9 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.1 ms/frame (11.5 ms cumulative)
    targeting: 0.0 ms/frame (4.1 ms cumulative)
    decision: 0.1 ms/frame (5.5 ms cumulative)
    behaviour: 37.1 ms/frame (3083.0 ms cumulative)
    life/presentation: 4.7 ms/frame (389.3 ms cumulative)
    other update: 0.5 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.4
    expensive behaviour agents/frame: 20.5
    full-rate agents/frame: 7.8
    reduced-cadence agents/frame: 23.2
    behaviour executions/frame: 20.9
    presentation executions/frame: 20.9

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 31.0
    village scan candidates/frame: 484.9
    player perception checks/frame: 31.0

  nearest scans: 29.5/frame (2445 calls)
  nearest candidates checked: 491.6/frame (40805 total)
  herd leader scans: 0.3/frame (29 calls)
  herd candidates checked: 10.8/frame (899 total)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 12
  empty builds (no instances): 4
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 0.28 ms
    max 1.60 ms

  allocation/setup:
    avg 0.19 ms
    max 1.40 ms
  instanceMatrix bind:
    avg 0.02 ms
    max 0.10 ms
  bounds/finalize (apply worker bounds):
    avg 0.02 ms
    max 0.20 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.03 ms
    max 0.10 ms
  scene attach (`scene.add`):
    avg 0.02 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 0.47 ms
    max 1.90 ms

  per chunk:
    instances avg/max 158554.2 / 271541
    meshes avg/max 4.00 / 4
    geometries avg/max 4.00 / 4
    geometries after lod apply avg/max 7.00 / 7
    instances full/filler: 610335 / 1292315
    matrix instances bound: 1902650
    instanced attributes created: 240
    shared material refs: 48
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 12/12
    instances: 229803 (max 32465)
    allocation/setup avg/max: 0.17 / 1.40 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 0.02 / 0.20 ms
  grain:
    buckets/meshes: 12/12
    instances: 76451 (max 10763)
    allocation/setup avg/max: 0.00 / 0.00 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  herb:
    buckets/meshes: 12/12
    instances: 304081 (max 44129)
    allocation/setup avg/max: 0.03 / 0.10 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  filler:
    buckets/meshes: 12/12
    instances: 1292315 (max 184184)
    allocation/setup avg/max: 0.00 / 0.00 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms

---

[Seedvale Long Frame Attribution]

Threshold: 80 ms
Long frames: 51
Shown: 5 worst (by frame ms)

Read: category rows are `withCategory()` spans on that frame; OTHER is
frame total minus those categories (measurement gap, overlapping work,
or unwrapped tick code). Stages are coarse streaming/finalize labels
from the same frame; hitches are existing `recordHitch` events (>= 8 ms).

Worst frame (#1 of 5 shown, 51 total):

[LONG FRAME] 1119.4ms
simulate      1096.7ms
render          22.5ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            5.1ms
STREAMING        0.0ms
NPC             10.6ms
FAUNA         1068.3ms
PHYSICS          0.3ms
RENDER          17.5ms
OTHER           17.6ms

Long frame #2:

[LONG FRAME] 371.3ms
simulate        58.5ms
render         312.6ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            9.0ms
STREAMING        0.0ms
NPC              8.2ms
FAUNA           42.2ms
PHYSICS          0.1ms
RENDER         303.5ms
OTHER            8.3ms

Long frame #3:

[LONG FRAME] 173.9ms
simulate       136.5ms
render          37.1ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER            8.9ms
STREAMING       58.0ms
NPC              9.2ms
FAUNA           62.8ms
PHYSICS          0.1ms
RENDER          28.2ms
OTHER            6.7ms

streaming / stages:
  chunkUpdate                  57.9ms
  riverTileBuild               51.6ms
  terrainPrepare               1.7ms
  riverChannelSegmentsNear     0.4ms

Long frame #4:

[LONG FRAME] 167.5ms
simulate        80.5ms
render          86.6ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           33.0ms
STREAMING        0.0ms
NPC              8.6ms
FAUNA           62.2ms
PHYSICS          0.1ms
RENDER          53.6ms
OTHER           10.0ms

Long frame #5:

[LONG FRAME] 139.9ms
simulate        77.4ms
render          56.6ms
TERRAIN          0.0ms
GRASS            0.0ms
VEGETATION       0.0ms
PROPS            0.0ms
SHADOWS          0.0ms
POSTPROCESS      0.0ms
WATER           26.3ms
STREAMING       12.0ms
NPC              8.2ms
FAUNA           58.3ms
PHYSICS          0.1ms
RENDER          30.3ms
OTHER            4.7ms

streaming / stages:
  waterFinalize                5.7ms
  terrainFinalize              4.4ms
  contentFinalize              1.7ms
  chunkFinalize                1.7ms
  chunkUpdate                  1.7ms
  riverFinalize                0.2ms

---

[Seedvale Program Census]

Programs created: 77
Program count: final=77 max=77

By frame:
  frame 0   +68 programs   <== largest transition
  frame 16   +2 programs
  frame 19   +1 program
  frame 37   +1 program
  frame 47   +2 programs
  frame 62   +1 program
  frame 66   +1 program
  frame 88   +1 program

Largest transition — frame 0 (+68 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=73c68265-c37d-4ac1-9782-e3a593f05fc6 (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=f44e34a9-5055-412c-8940-340011f3ab2b
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=a1daa357 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=0000fe73-dc98-469c-b4b2-f62e7bd7ad20
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=mirror-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=371e69ab-113c-47a1-91e4-379a486e6ebf
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=2cf9fa62 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=79cfcfb5-6d72-44a0-a280-242d2f21f333
  #5 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=5efd8b76 fHash=9b2a34e4 stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=bc1600b4-9637-4d6c-8512-4c58d62b8d2f
  #6 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=f5ef50c0-ae8d-4bf9-95d6-3c4af64c2c98
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=86466075-10aa-41c7-bb38-818f3f47dd9f
  #8 type=MeshStandardMaterial name='Wood' bucket=other cacheKey=physical,STANDARD,,highp… vHash=d38f15a4 fHash=6578c10d stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=f6ea01c5-5915-46d8-8208-6e0765615f90 (Wood)
  #9 type=MeshStandardMaterial name='Green' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=c0d790d1 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=60b275d7-8197-4721-9b04-3c5959ef0cf7 (Green)
  #10 type=MeshStandardMaterial name='Pink' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=d3fd7a87 fHash=2eae9a54 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=814d5a4b-8bc9-4b2c-b82f-78a2dae20233 (Pink)
  #11 type=MeshStandardMaterial name='Stone' bucket=environment cacheKey=physical,STANDARD,,highp… vHash=a9733c9d fHash=bd723c8a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=6740d304-0fed-4742-93d4-0c11e2f80567 (Stone)
  #12 type=MeshStandardMaterial name='None' bucket=environment cacheKey=physical,STANDARD,,highp… vHash=6db98a06 fHash=efed8e98 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=4d51aa55-1c44-4f5f-be92-f1a37c23fd55 (None)
  #13 type=MeshStandardMaterial name='Flowers' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=e4cbf8ca fHash=135696d3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0.45","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=9aac0afe-7551-4735-9cf7-44654dee9472 (Flowers)
  #14 type=MeshStandardMaterial name='Wood_Light' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=f3a1039e fHash=c7daf23 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=a5f81aa2-2744-4d10-b762-ddbbfdd7fd9e (Wood)
  #15 type=MeshStandardMaterial name='Green' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=36c0231b fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=8f46f1dc-e2ec-44db-8cfd-f726665369f9 (Green)
  #16 type=MeshStandardMaterial name='MI_WoodTrim' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=c5e73b05 fHash=d4c95125 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=e2756a5c-2691-4468-84e7-59fd200a16fe (MI_WoodTrim)
  #17 type=MeshStandardMaterial name='MI_WindowGlass' cacheKey=physical,STANDARD,,highp… vHash=13a74ec7 fHash=3ab4c629 stage=mirror-render
  #18 type=MeshStandardMaterial name='MI_WindowGlass' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=9dcf1cb4 fHash=2d1aa4a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=bdee7d7b-f199-4c6a-8d50-258e54a08526 (MI_WindowGlass)
  #19 type=MeshStandardMaterial name='MI_WoodTrim' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=12873951 fHash=d4c95125 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=bbb90500-d4f0-4faa-a40b-e787a71ffc82 (MI_WoodTrim)
  #20 type=MeshStandardMaterial name='MI_WindowGlass' cacheKey=physical,STANDARD,,highp… vHash=fc941d05 fHash=3ab4c629 stage=mirror-render
  #21 type=MeshStandardMaterial name='MI_WindowGlass' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=e551c572 fHash=2d1aa4a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=7fedb103-155c-4aad-96ff-88ea69345a31 (MI_WindowGlass)
  #22 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=df7c703d fHash=236b3b0b stage=mirror-render
  #23 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=f92c8d8c fHash=87d053eb stage=mirror-render
  #24 type=MeshStandardMaterial name='Handle' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=88cdd138 fHash=f2ad9521 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=29503fc4-a5ba-424f-bc7c-ca93f8d10078 (Handle)
  #25 type=MeshStandardMaterial name='PathRocks' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=b643916d fHash=754b87bd stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=f96157ee-9bf3-4dbd-86bd-2fceab133a1e (PathRocks)
  #26 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=fd8301ed fHash=2f2885d5 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=4ffdfaf9-125b-4234-8a5c-46520132ae96 (Main)
  #27 type=MeshStandardMaterial name='Flowers' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=d9d07622 fHash=135696d3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0.45","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=ae9f5070-bed2-490e-92fd-f0b640684b08 (MapleTree_Leaves)
  #28 type=MeshStandardMaterial name='Green' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=190d3a9c fHash=633146b4 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=1c3b7fbd-07bd-46fc-9095-6bcf4fffff6f (Green)
  #29 type=MeshStandardMaterial name='MapleTree_Bark' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=9dbe8ee7 fHash=8dba9dd stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=88e6509b-9a1b-4d40-80f6-58e036d0e455 (MapleTree_Bark)
  #30 type=MeshStandardMaterial name='Skin' bucket=npc cacheKey=physical,STANDARD,,highp… vHash=9b5bd39e fHash=314bad96 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=f43ec37c-cc94-4106-98b9-be03dab4b78f (Skin)
  #31 type=MeshStandardMaterial name='LimeGreen' bucket=npc cacheKey=physical,STANDARD,,highp… vHash=60935e0a fHash=7e862ff5 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=9301e8d0-708e-4639-9882-43727b64a000 (LimeGreen)
  #32 type=MeshStandardMaterial name='MI_Knight' bucket=npc cacheKey=physical,STANDARD,,highp… vHash=28e9fec2 fHash=e80c20f9 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=30ba1ff9-de89-4273-8226-8a518407f3ab (MI_Knight)
  #33 type=MeshStandardMaterial name='MI_Hair_1' bucket=npc cacheKey=physical,STANDARD,,highp… vHash=c1043a29 fHash=5ca0fd5a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=b9059879-57bb-460b-bf8f-a56cafe85c8d (MI_Hair_1)
  #34 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=5b43c776 fHash=70b71dad stage=mirror-render
  #35 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=mirror-render
  #36 type=MeshBasicMaterial name='' cacheKey=basic,highp,srgb-linear,… vHash=d459e49b fHash=a8a9bac3 stage=mirror-render
  #37 type=MeshBasicMaterial name='' bucket=other cacheKey=basic,highp,srgb-linear,… vHash=b6911298 fHash=73a25d1e stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"true","normalMap":"false","envMap":"false"}
      material=bb36d311-6252-4dbc-ab48-0de50931daf8
  #38 type=MeshStandardMaterial name='lambert2SG' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=7bb77142 fHash=87728b15 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=32966b83-940c-462f-a3ee-114ecda17574 (lambert2SG)
  #39 type=MeshPhysicalMaterial name='Material #55' bucket=fauna cacheKey=physical,STANDARD,,PHYSI… vHash=a344732e fHash=16869b56 stage=mirror-render
      defines={"STANDARD":"","PHYSICAL":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=4b29ca59-9c5c-4c09-b83a-921dac3432a2 (Material #55)
  #40 type=MeshStandardMaterial name='Pond_Pack_MAT' bucket=other cacheKey=physical,STANDARD,,highp… vHash=c3bc6325 fHash=ded4be89 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=0138243f-c14a-4f60-9d2d-141ea36ed2a0 (Pond_Pack_MAT)
  #41 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=94297e69 fHash=aa0735a8 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=88d641d8-cd16-4755-ab55-42c260e7480a
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
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=5efd8b76, #6=e6d01ae7, #22=df7c703d, #23=f92c8d8c, #34=5b43c776, #50=279cec18, #51=84736a68, #52=aa2edbee, #53=7bae0bb2, #54=436caea4, #55=886438e7, #56=d99a5b29, #57=2003ced8, #58=28dfa407, #59=756a0b19, #60=b2354ff2, #61=ea82969e, #62=7dab8d9a, #63=378e1fb7, #64=78acf7ea, #65=a312c579, #66=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=2cf9fa62, #5=9b2a34e4, #6=e34491ff, #22=236b3b0b, #23=87d053eb, #34=70b71dad, #50=4d6bcede, #51=ffecb62a, #52=76ced00a, #53=fb55b3c0, #54=2d687ef1, #55=dc2a89b5, #56=109e33fc, #57=db0f470a, #58=9775cd0e, #59=5c741650, #60=2aad9943, #61=a2297d9f, #62=1022767b, #63=ce0bf6b4, #64=707f290c, #65=c05e2256, #66=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=grass, #6=water, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #22=(unset), #23=(unset), #34=(unset), #50=(unset), #51=(unset), #52=(unset), #53=(unset), #54=(unset), #55=(unset), #56=(unset), #57=(unset), #58=(unset), #59=(unset), #60=(unset), #61=(unset), #62=(unset), #63=(unset), #64=(unset), #65=(unset), #66=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=false, #6=true, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #22=(unknown), #23=(unknown), #34=(unknown), #50=(unknown), #51=(unknown), #52=(unknown), #53=(unknown), #54=(unknown), #55=(unknown), #56=(unknown), #57=(unknown), #58=(unknown), #59=(unknown), #60=(unknown), #61=(unknown), #62=(unknown), #63=(unknown), #64=(unknown), #65=(unknown), #66=(unknown)
  MeshStandardMaterial (29 programs):
    vertexShaderHash differs: #2=5c2c57a3, #7=e3408c64, #8=d38f15a4, #9=c0d790d1, #10=d3fd7a87, #11=a9733c9d, #12=6db98a06, #13=e4cbf8ca, #14=f3a1039e, #15=36c0231b, #16=c5e73b05, #17=13a74ec7, #18=9dcf1cb4, #19=12873951, #20=fc941d05, #21=e551c572, #24=88cdd138, #25=b643916d, #26=fd8301ed, #27=d9d07622, #28=190d3a9c, #29=9dbe8ee7, #30=9b5bd39e, #31=60935e0a, #32=28e9fec2, #33=c1043a29, #38=7bb77142, #40=c3bc6325, #41=94297e69
    fragmentShaderHash differs: #2=a1daa357, #7=c0b8fc9f, #8=6578c10d, #9=a81023c3, #10=2eae9a54, #11=bd723c8a, #12=efed8e98, #13=135696d3, #14=c7daf23, #15=a81023c3, #16=d4c95125, #17=3ab4c629, #18=2d1aa4a, #19=d4c95125, #20=3ab4c629, #21=2d1aa4a, #24=f2ad9521, #25=754b87bd, #26=2f2885d5, #27=135696d3, #28=633146b4, #29=8dba9dd, #30=314bad96, #31=7e862ff5, #32=e80c20f9, #33=5ca0fd5a, #38=87728b15, #40=ded4be89, #41=aa0735a8
    bucket differs: #2=terrain, #7=other, #8=other, #9=vegetation, #10=vegetation, #11=environment, #12=environment, #13=vegetation, #14=settlement, #15=settlement, #16=settlement, #17=(unknown), #18=settlement, #19=settlement, #20=(unknown), #21=settlement, #24=settlement, #25=settlement, #26=fauna, #27=settlement, #28=settlement, #29=settlement, #30=npc, #31=npc, #32=npc, #33=npc, #38=fauna, #40=other, #41=other
    define STANDARD differs: #2=, #7=, #8=, #9=, #10=, #11=, #12=, #13=, #14=, #15=, #16=, #17=(unset), #18=, #19=, #20=(unset), #21=, #24=, #25=, #26=, #27=, #28=, #29=, #30=, #31=, #32=, #33=, #38=, #40=, #41=
    flag alphaTest differs: #2=0, #7=0, #8=0, #9=0, #10=0, #11=0, #12=0, #13=0.45, #14=0, #15=0, #16=0, #17=(unknown), #18=0, #19=0, #20=(unknown), #21=0, #24=0, #25=0, #26=0, #27=0.45, #28=0, #29=0, #30=0, #31=0, #32=0, #33=0, #38=0, #40=0, #41=0
    flag envMap differs: #2=false, #7=false, #8=false, #9=false, #10=false, #11=false, #12=false, #13=false, #14=false, #15=false, #16=false, #17=(unknown), #18=false, #19=false, #20=(unknown), #21=false, #24=false, #25=false, #26=false, #27=false, #28=false, #29=false, #30=false, #31=false, #32=false, #33=false, #38=false, #40=false, #41=false
    flag flatShading differs: #2=false, #7=true, #8=false, #9=false, #10=false, #11=false, #12=false, #13=false, #14=false, #15=false, #16=false, #17=(unknown), #18=false, #19=false, #20=(unknown), #21=false, #24=true, #25=false, #26=false, #27=false, #28=false, #29=false, #30=false, #31=false, #32=false, #33=false, #38=false, #40=false, #41=true
    flag fog differs: #2=true, #7=true, #8=true, #9=true, #10=true, #11=true, #12=true, #13=true, #14=true, #15=true, #16=true, #17=(unknown), #18=true, #19=true, #20=(unknown), #21=true, #24=true, #25=true, #26=true, #27=true, #28=true, #29=true, #30=true, #31=true, #32=true, #33=true, #38=true, #40=true, #41=true
    flag map differs: #2=false, #7=false, #8=false, #9=false, #10=false, #11=false, #12=true, #13=true, #14=false, #15=false, #16=true, #17=(unknown), #18=false, #19=true, #20=(unknown), #21=false, #24=false, #25=true, #26=false, #27=true, #28=false, #29=true, #30=false, #31=false, #32=true, #33=true, #38=true, #40=true, #41=false
    flag normalMap differs: #2=true, #7=false, #8=false, #9=false, #10=false, #11=false, #12=false, #13=false, #14=false, #15=false, #16=true, #17=(unknown), #18=false, #19=true, #20=(unknown), #21=false, #24=false, #25=false, #26=false, #27=false, #28=false, #29=true, #30=false, #31=false, #32=true, #33=true, #38=false, #40=false, #41=false
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



Frame 16 (+2):
  Program #68
    material: MeshDepthMaterial ''
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: depth,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,false,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,0,0,0,3200,8388609,8532992,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 1c1d4a6
    fragmentShaderHash: ddb1b5d4
  Program #69
    material: MeshDepthMaterial ''
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: depth,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,false,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,0,0,0,3200,8389121,8532992,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 1c1d4a6
    fragmentShaderHash: 97cbbbfc

Frame 47 (+2):
  Program #72
    material: MeshDepthMaterial ''
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: depth,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,false,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,0,0,0,3200,8388608,8530976,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: bc2d5094
    fragmentShaderHash: 758a4164
  Program #73
    material: MeshDepthMaterial ''
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: depth,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,false,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,0,0,0,3200,8388608,8530944,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 2e7a6fcb
    fragmentShaderHash: 758a4164

---

[Seedvale Program Compile Cost]

No isolated per-program GPU compile/link timer exists in the public Three.js/WebGL API without patching internals (out of scope here). Each number below is the wall-clock duration of the renderer.render() call (mirror-render/postprocess-render) that first-used the program, reported ONLY when that program was the single new program created during that specific call — an upper bound that also includes the rest of that call's render cost, not an isolated compile/link timer.
Excluded — no reliable per-program timing: 72 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 19
  #70
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 34.5 ms  (upper bound — whole postprocess-render call, see note above)

Frame 37
  #71
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 32.5 ms  (upper bound — whole postprocess-render call, see note above)

Frame 62
  #74
      material: MeshStandardMaterial 'MapleTree_Bark'
      object: Mesh 'mesh_0'
      asset: /models/nature/maple_1.glb
      compile/link: 15.3 ms  (upper bound — whole mirror-render call, see note above)

Frame 66
  #75
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 18.0 ms  (upper bound — whole postprocess-render call, see note above)

Frame 88
  #76
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 23.0 ms  (upper bound — whole mirror-render call, see note above)

Summary:
  total measured compile/link time: 123.3 ms
  programs >1 ms: 5
  max: 34.5 ms (#70)

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=—
  hide-grass           avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  hide-vegetation      avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no vegetation/grass  avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  hide-environment     avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  hide-settlement      avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no water             avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  hide-terrain         avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  hide-npc-fauna       avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-shadows           avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-ao                avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-bloom             avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-smaa              avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-god-rays          avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-film-grade        avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no postprocessing    avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no mirrors           avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=+0.0 ms (+0%)

CPU/GPU separation (baseline, same RENDER span):
  NOT MEASURED — EXT_disjoint_timer_query_webgl2 is unavailable in this WebGL2 context (unsupported by the GPU/driver/browser, or no query resolved during the baseline window).
  Every render time above is CPU-side wall-clock time only (performance.now() around the render call) — it may include driver/GPU wait and must not be read as isolated CPU cost.

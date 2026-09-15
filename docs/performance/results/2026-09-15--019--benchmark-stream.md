# Seedvale Performance Benchmark Report

> Generated: 2026-09-15T19:50:47.192Z
> Sections:
> - [Seedvale Benchmark]
> - [Seedvale Agent CPU]
> - [Seedvale Grass Finalization]
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
  avg: 18.1
  min: 1
  p1: 4

Frame time:
  avg: 55.2 ms
  p95: 89.1 ms
  max: 779.3 ms

Rendering:
  draw calls: 897 avg / 2258 max
  triangles: 10.65M avg
  mirror draws: 174 avg
  geometries: 805
  textures: 619

Scene (one-pass estimate):
  terrain        draws=61 tris=4.50M meshes=61 inst=61
  grass          draws=60 tris=837.5k meshes=60 inst=98841
  vegetation     draws=123 tris=1.47M meshes=123 inst=937
  environment    draws=42 tris=18.5k meshes=42 inst=65
  settlement     draws=564 tris=650.8k meshes=564 inst=866
  water          draws=43 tris=3.10M meshes=43 inst=43
  npc            draws=100 tris=121.2k meshes=100 inst=100
  fauna          draws=156 tris=70.3k meshes=156 inst=156
  items          draws=164 tris=13.0k meshes=164 inst=164
  other          draws=211 tris=32.2k meshes=211 inst=211

Systems:
  TERRAIN        0.7 ms
  WATER          2.6 ms
  NPC            9.5 ms
  FAUNA          26.1 ms
  PHYSICS        0.1 ms
  RENDER         11.9 ms

Detected bottlenecks:
  1. FAUNA
  2. RENDER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=4.8 ms draws=207 tris=4.92M
  hide-grass         render=8.1 ms draws=274 tris=5.93M
  hide-vegetation    render=9.8 ms draws=169 tris=3.83M
  hide-vegetation-grass render=6.5 ms draws=127 tris=3.19M
  hide-environment   render=7.9 ms draws=280 tris=5.72M
  hide-settlement    render=8.6 ms draws=303 tris=6.11M
  hide-water         render=8.1 ms draws=286 tris=4.77M
  hide-terrain       render=8.4 ms draws=277 tris=3.48M
  hide-npc-fauna     render=9.3 ms draws=300 tris=5.73M
  no-shadows         render=12.3 ms draws=299 tris=5.59M
  no-ao              render=10.9 ms draws=303 tris=5.86M
  no-bloom           render=8.8 ms draws=296 tris=5.86M
  no-smaa            render=8.8 ms draws=317 tris=6.01M
  no-god-rays        render=8.5 ms draws=300 tris=5.73M
  no-film-grade      render=9.5 ms draws=307 tris=5.81M
  no-postprocessing  render=7.2 ms draws=284 tris=5.81M
  no-reflections     render=8.1 ms draws=224 tris=4.84M

Frame attribution:
  frame max: 779.3 ms
  largest labelled hitch: 0 ms
  unattributed: 779.3 ms

Recommendation:
Largest frame (779.3 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 31

NPC:
  total: 9.5 ms/frame
  crowd pass: 0.0 ms/frame (4.5 ms cumulative)
  agent updates: 1.0 ms/frame (518.8 ms cumulative)
  livestock: 4.7 ms/frame (2404.6 ms cumulative)
    loaded tick: 4.7 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 4.7 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.0 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 3.6 ms/frame
      life/presentation: 1.0 ms/frame
      other update: 0.1 ms/frame
    update calls/frame: 14.6
    unique animals/frame: 14.6
    duplicate updates/frame: 0.0
    detached animals/frame: 0.0
    dog updates/frame: 3.2
    dog guard scans: 3.2/frame (22.7 predator candidates/frame)
    pest scans: 1.5/frame (1.5 rat candidates/frame)
    nearest scans: 7.0/frame (0.0 candidates/frame)
    full-rate agents/frame: 0.1
    reduced-cadence agents/frame: 14.5
    behaviour executions/frame: 7.0
    presentation executions/frame: 6.4
  rats: 3.3 ms/frame (1688.0 ms cumulative)
  social: 0.0 ms/frame (2.5 ms cumulative)
  streaming: 0.3 ms/frame (139.7 ms cumulative)
  maintenance: 0.1 ms/frame (75.6 ms cumulative)
  unattributed: 0.0 ms/frame

FAUNA:
  total: 26.1 ms/frame
  agent updates: 26.0 ms/frame (13336.4 ms cumulative)
  forest sampling: 0.1 ms/frame (61.2 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (24.3 ms cumulative)
    targeting: 0.0 ms/frame (14.3 ms cumulative)
    decision: 0.0 ms/frame (13.2 ms cumulative)
    behaviour: 22.6 ms/frame (11603.8 ms cumulative)
    life/presentation: 3.0 ms/frame (1527.1 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.2
    expensive behaviour agents/frame: 18.8
    full-rate agents/frame: 7.7
    reduced-cadence agents/frame: 23.3
    behaviour executions/frame: 19.1
    presentation executions/frame: 18.0

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 25.1
    village scan candidates/frame: 381.2
    player perception checks/frame: 31.0

  nearest scans: 27.7/frame (14232 calls)
  nearest candidates checked: 421.3/frame (216118 total)
  herd leader scans: 0.2/frame (114 calls)
  herd candidates checked: 6.9/frame (3534 total)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 31

NPC:
  total: 9.5 ms/frame
  crowd pass: 0.0 ms/frame (4.5 ms cumulative)
  agent updates: 1.0 ms/frame (518.8 ms cumulative)
  livestock: 4.7 ms/frame (2404.6 ms cumulative)
    loaded tick: 4.7 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 4.7 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.0 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 3.6 ms/frame
      life/presentation: 1.0 ms/frame
      other update: 0.1 ms/frame
    update calls/frame: 14.6
    unique animals/frame: 14.6
    duplicate updates/frame: 0.0
    detached animals/frame: 0.0
    dog updates/frame: 3.2
    dog guard scans: 3.2/frame (22.7 predator candidates/frame)
    pest scans: 1.5/frame (1.5 rat candidates/frame)
    nearest scans: 7.0/frame (0.0 candidates/frame)
    full-rate agents/frame: 0.1
    reduced-cadence agents/frame: 14.5
    behaviour executions/frame: 7.0
    presentation executions/frame: 6.4
  rats: 3.3 ms/frame (1688.0 ms cumulative)
  social: 0.0 ms/frame (2.5 ms cumulative)
  streaming: 0.3 ms/frame (139.7 ms cumulative)
  maintenance: 0.1 ms/frame (75.6 ms cumulative)
  unattributed: 0.0 ms/frame

FAUNA:
  total: 26.1 ms/frame
  agent updates: 26.0 ms/frame (13336.4 ms cumulative)
  forest sampling: 0.1 ms/frame (61.2 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (24.3 ms cumulative)
    targeting: 0.0 ms/frame (14.3 ms cumulative)
    decision: 0.0 ms/frame (13.2 ms cumulative)
    behaviour: 22.6 ms/frame (11603.8 ms cumulative)
    life/presentation: 3.0 ms/frame (1527.1 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 31.0
    sensing passes/frame: 31.0
    decision passes/frame: 31.0
    high-priority agents/frame: 0.2
    expensive behaviour agents/frame: 18.8
    full-rate agents/frame: 7.7
    reduced-cadence agents/frame: 23.3
    behaviour executions/frame: 19.1
    presentation executions/frame: 18.0

  sensing/cache:
    forest samples/frame: 31.0
    fire scan candidates/frame: 25.1
    village scan candidates/frame: 381.2
    player perception checks/frame: 31.0

  nearest scans: 27.7/frame (14232 calls)
  nearest candidates checked: 421.3/frame (216118 total)
  herd leader scans: 0.2/frame (114 calls)
  herd candidates checked: 6.9/frame (3534 total)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 15
  empty builds (no instances): 15
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 0.13 ms
    max 0.20 ms

  allocation/setup:
    avg 0.07 ms
    max 0.20 ms
  instanceMatrix bind:
    avg 0.01 ms
    max 0.10 ms
  bounds/finalize (apply worker bounds):
    avg 0.00 ms
    max 0.00 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.01 ms
    max 0.10 ms
  scene attach (`scene.add`):
    avg 0.02 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 0.27 ms
    max 0.70 ms

  per chunk:
    instances avg/max 151027.1 / 271541
    meshes avg/max 4.00 / 4
    geometries avg/max 4.00 / 4
    geometries after lod apply avg/max 7.00 / 7
    instances full/filler: 724882 / 1540524
    matrix instances bound: 2265406
    instanced attributes created: 300
    shared material refs: 60
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 15/15
    instances: 271779 (max 32465)
    allocation/setup avg/max: 0.05 / 0.20 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  grain:
    buckets/meshes: 15/15
    instances: 90329 (max 10763)
    allocation/setup avg/max: 0.00 / 0.00 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  herb:
    buckets/meshes: 15/15
    instances: 362774 (max 44129)
    allocation/setup avg/max: 0.00 / 0.00 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms
  filler:
    buckets/meshes: 15/15
    instances: 1540524 (max 184184)
    allocation/setup avg/max: 0.02 / 0.20 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 0.00 / 0.00 ms

---

[Seedvale Program Census]

Programs created: 112
Program count: final=110 max=112

By frame:
  frame 0   +52 programs   <== largest transition
  frame 1   +5 programs
  frame 9   +3 programs
  frame 10   +1 program
  frame 12   +6 programs
  frame 18   +2 programs
  frame 40   +1 program
  frame 48   +3 programs
  frame 76   +1 program
  frame 104   +1 program
  frame 108   +1 program
  frame 140   +1 program
  frame 178   +1 program
  frame 270   +1 program
  frame 741   +10 programs
  frame 742   +4 programs
  frame 756   +3 programs
  frame 856   +16 programs

Largest transition — frame 0 (+52 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=bcb08833-d85e-4ad3-8b27-01ffbb6af9bc (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=9d484780-5076-4a0c-8f7c-4cc71c40ff61
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=a1daa357 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=37e42fe1-80a2-41e0-b4e5-ad23c88dc5f9
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=mirror-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=9e0f8cbc-e7c9-464b-b7db-eadf846cef67
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=2cf9fa62 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=0b0cdbce-a4fd-45be-ae52-12e6a0929078
  #5 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=29fa4022-a550-4199-a997-a49af781c46f
  #6 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=5efd8b76 fHash=9b2a34e4 stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=d2b5f07d-0e46-45f7-b4df-9993ccbdb594
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=83cecd6d-6b68-41da-baa5-a7afa136bf8b
  #8 type=MeshStandardMaterial name='Wood' bucket=other cacheKey=physical,STANDARD,,highp… vHash=d38f15a4 fHash=6578c10d stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=1188e279-fae7-49a8-a0dc-da3798d27984 (Wood)
  #9 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=5b43c776 fHash=70b71dad stage=mirror-render
  #10 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=mirror-render
  #11 type=MeshBasicMaterial name='' cacheKey=basic,highp,srgb-linear,… vHash=d459e49b fHash=a8a9bac3 stage=mirror-render
  #12 type=MeshBasicMaterial name='' bucket=other cacheKey=basic,highp,srgb-linear,… vHash=b6911298 fHash=73a25d1e stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"true","normalMap":"false","envMap":"false"}
      material=872efaf6-a8b5-40bb-a042-1608f7043b85
  #13 type=MeshStandardMaterial name='None' bucket=environment cacheKey=physical,STANDARD,,highp… vHash=6db98a06 fHash=efed8e98 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=b52c2d5b-aabe-453b-a67f-ab75b2dc72d7 (None)
  #14 type=MeshStandardMaterial name='Flowers' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=e4cbf8ca fHash=135696d3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0.45","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=ec0a2a1f-d0e8-434f-bada-a697c1adeab0 (Flowers)
  #15 type=MeshStandardMaterial name='Green' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=c0d790d1 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=7e44fda5-30d2-4134-ad93-46ddc330b180 (Green)
  #16 type=MeshStandardMaterial name='Pink' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=d3fd7a87 fHash=2eae9a54 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=b572af2e-2b0f-4676-965e-18da76a5df09 (Pink)
  #17 type=MeshStandardMaterial name='Stone' bucket=environment cacheKey=physical,STANDARD,,highp… vHash=a9733c9d fHash=bd723c8a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=b844398e-c03b-4617-88b9-e21c1283d7e6 (Stone)
  #18 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=54e03756 fHash=d391c52 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=79ac98a0-a845-47f5-a785-1a8ff7ce58e4 (Main)
  #19 type=MeshStandardMaterial name='Material.001' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=a99aa494 fHash=63f9c0d1 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=2a29cd04-3f71-4e9b-a4ad-7c39cba2d0fd (Material.001)
  #20 type=MeshStandardMaterial name='lambert2SG' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=7bb77142 fHash=87728b15 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=8e042254-4097-467c-a974-fdefadf0cdd2 (lambert2SG)
  #21 type=MeshPhysicalMaterial name='Material #55' bucket=fauna cacheKey=physical,STANDARD,,PHYSI… vHash=a344732e fHash=16869b56 stage=mirror-render
      defines={"STANDARD":"","PHYSICAL":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=5f6b4901-bf13-4921-b10a-b6ef416c72ae (Material #55)
  #22 type=MeshStandardMaterial name='Green' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=36c0231b fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=0be742be-0aa8-42d6-9583-b09dc022f9bc (Green)
  #23 type=MeshStandardMaterial name='MI_WoodTrim' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=c5e73b05 fHash=d4c95125 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=c71514dd-9fa4-4d63-8610-8a5a62ae72c6 (MI_WoodTrim)
  #24 type=MeshStandardMaterial name='MI_WindowGlass' cacheKey=physical,STANDARD,,highp… vHash=13a74ec7 fHash=3ab4c629 stage=mirror-render
  #25 type=MeshStandardMaterial name='MI_WindowGlass' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=9dcf1cb4 fHash=2d1aa4a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=47d7eea6-d502-4da0-8951-6d944e83ab5e (MI_WindowGlass)
  #26 type=MeshStandardMaterial name='MI_WoodTrim' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=12873951 fHash=d4c95125 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=b2ae010e-ac80-4395-90b9-c41b270990e8 (MI_WoodTrim)
  #27 type=MeshStandardMaterial name='MI_WindowGlass' cacheKey=physical,STANDARD,,highp… vHash=fc941d05 fHash=3ab4c629 stage=mirror-render
  #28 type=MeshStandardMaterial name='MI_WindowGlass' bucket=settlement cacheKey=physical,STANDARD,,highp… vHash=e551c572 fHash=2d1aa4a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=5c057700-00aa-45fc-ac51-6426d3543c2a (MI_WindowGlass)
  #29 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=df7c703d fHash=236b3b0b stage=mirror-render
  #30 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=f92c8d8c fHash=87d053eb stage=mirror-render
  #31 type=MeshStandardMaterial name='MI_Peasant' bucket=other cacheKey=physical,STANDARD,,highp… vHash=f618dfff fHash=4057772 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=057be0a2-9be4-48a8-9f61-20855559932e (MI_Peasant)
  #32 type=MeshStandardMaterial name='MI_Hair_1' bucket=other cacheKey=physical,STANDARD,,highp… vHash=c1043a29 fHash=5ca0fd5a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"true","envMap":"false"}
      material=9d538483-da45-4776-829a-9223abfedc82 (MI_Hair_1)
  #33 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=94297e69 fHash=aa0735a8 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=0494c06e-5264-42cb-b4ed-7c523584af54
  #34 type=ShaderMaterial name='' cacheKey=16,17,highp,srgb-linear,… vHash=279cec18 fHash=4d6bcede stage=postprocess-render
  #35 type=ShaderMaterial name='' cacheKey=18,19,highp,srgb-linear,… vHash=84736a68 fHash=ffecb62a stage=postprocess-render
  #36 type=ShaderMaterial name='' cacheKey=20,21,highp,srgb-linear,… vHash=aa2edbee fHash=76ced00a stage=postprocess-render
  #37 type=ShaderMaterial name='' cacheKey=22,23,highp,srgb-linear,… vHash=7bae0bb2 fHash=fb55b3c0 stage=postprocess-render
  #38 type=ShaderMaterial name='' cacheKey=24,25,highp,srgb-linear,… vHash=436caea4 fHash=2d687ef1 stage=postprocess-render
  #39 type=ShaderMaterial name='' cacheKey=26,27,SMAA_THRESHOLD,0.1… vHash=886438e7 fHash=dc2a89b5 stage=postprocess-render
  #40 type=ShaderMaterial name='' cacheKey=28,29,SMAA_MAX_SEARCH_ST… vHash=d99a5b29 fHash=109e33fc stage=postprocess-render
  #41 type=ShaderMaterial name='' cacheKey=30,31,highp,srgb-linear,… vHash=2003ced8 fHash=db0f470a stage=postprocess-render
  #42 type=ShaderMaterial name='' cacheKey=32,33,highp,srgb-linear,… vHash=28dfa407 fHash=9775cd0e stage=postprocess-render
  #43 type=ShaderMaterial name='' cacheKey=34,35,KERNEL_RADIUS,6,hi… vHash=756a0b19 fHash=5c741650 stage=postprocess-render
  #44 type=ShaderMaterial name='' cacheKey=34,35,KERNEL_RADIUS,10,h… vHash=b2354ff2 fHash=2aad9943 stage=postprocess-render
  #45 type=ShaderMaterial name='' cacheKey=34,35,KERNEL_RADIUS,14,h… vHash=ea82969e fHash=a2297d9f stage=postprocess-render
  #46 type=ShaderMaterial name='' cacheKey=34,35,KERNEL_RADIUS,18,h… vHash=7dab8d9a fHash=1022767b stage=postprocess-render
  #47 type=ShaderMaterial name='' cacheKey=34,35,KERNEL_RADIUS,22,h… vHash=378e1fb7 fHash=ce0bf6b4 stage=postprocess-render
  #48 type=ShaderMaterial name='' cacheKey=34,36,NUM_MIPS,5,highp,s… vHash=78acf7ea fHash=707f290c stage=postprocess-render
  #49 type=ShaderMaterial name='' cacheKey=37,38,highp,srgb-linear,… vHash=a312c579 fHash=c05e2256 stage=postprocess-render
  #50 type=ShaderMaterial name='GodRaysShader' cacheKey=39,40,highp,srgb-linear,… vHash=b817515d fHash=ccc98549 stage=postprocess-render
  #51 type=RawShaderMaterial name='OutputShader' cacheKey=41,42,SRGB_TRANSFER,,ACE… vHash=5d2c950f fHash=c1247d7 stage=postprocess-render

Differences within frame 0 (grouped by material type):
  ShaderMaterial (26 programs):
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=e6d01ae7, #6=5efd8b76, #9=5b43c776, #29=df7c703d, #30=f92c8d8c, #34=279cec18, #35=84736a68, #36=aa2edbee, #37=7bae0bb2, #38=436caea4, #39=886438e7, #40=d99a5b29, #41=2003ced8, #42=28dfa407, #43=756a0b19, #44=b2354ff2, #45=ea82969e, #46=7dab8d9a, #47=378e1fb7, #48=78acf7ea, #49=a312c579, #50=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=2cf9fa62, #5=e34491ff, #6=9b2a34e4, #9=70b71dad, #29=236b3b0b, #30=87d053eb, #34=4d6bcede, #35=ffecb62a, #36=76ced00a, #37=fb55b3c0, #38=2d687ef1, #39=dc2a89b5, #40=109e33fc, #41=db0f470a, #42=9775cd0e, #43=5c741650, #44=2aad9943, #45=a2297d9f, #46=1022767b, #47=ce0bf6b4, #48=707f290c, #49=c05e2256, #50=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=water, #6=grass, #9=(unknown), #29=(unknown), #30=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown), #42=(unknown), #43=(unknown), #44=(unknown), #45=(unknown), #46=(unknown), #47=(unknown), #48=(unknown), #49=(unknown), #50=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #9=(unset), #29=(unset), #30=(unset), #34=(unset), #35=(unset), #36=(unset), #37=(unset), #38=(unset), #39=(unset), #40=(unset), #41=(unset), #42=(unset), #43=(unset), #44=(unset), #45=(unset), #46=(unset), #47=(unset), #48=(unset), #49=(unset), #50=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #9=(unknown), #29=(unknown), #30=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown), #42=(unknown), #43=(unknown), #44=(unknown), #45=(unknown), #46=(unknown), #47=(unknown), #48=(unknown), #49=(unknown), #50=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #29=(unknown), #30=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown), #42=(unknown), #43=(unknown), #44=(unknown), #45=(unknown), #46=(unknown), #47=(unknown), #48=(unknown), #49=(unknown), #50=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #9=(unknown), #29=(unknown), #30=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown), #42=(unknown), #43=(unknown), #44=(unknown), #45=(unknown), #46=(unknown), #47=(unknown), #48=(unknown), #49=(unknown), #50=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #29=(unknown), #30=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown), #42=(unknown), #43=(unknown), #44=(unknown), #45=(unknown), #46=(unknown), #47=(unknown), #48=(unknown), #49=(unknown), #50=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #29=(unknown), #30=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown), #42=(unknown), #43=(unknown), #44=(unknown), #45=(unknown), #46=(unknown), #47=(unknown), #48=(unknown), #49=(unknown), #50=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=false, #9=(unknown), #29=(unknown), #30=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown), #42=(unknown), #43=(unknown), #44=(unknown), #45=(unknown), #46=(unknown), #47=(unknown), #48=(unknown), #49=(unknown), #50=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #29=(unknown), #30=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown), #42=(unknown), #43=(unknown), #44=(unknown), #45=(unknown), #46=(unknown), #47=(unknown), #48=(unknown), #49=(unknown), #50=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #29=(unknown), #30=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown), #42=(unknown), #43=(unknown), #44=(unknown), #45=(unknown), #46=(unknown), #47=(unknown), #48=(unknown), #49=(unknown), #50=(unknown)
  MeshStandardMaterial (21 programs):
    vertexShaderHash differs: #2=5c2c57a3, #7=e3408c64, #8=d38f15a4, #13=6db98a06, #14=e4cbf8ca, #15=c0d790d1, #16=d3fd7a87, #17=a9733c9d, #18=54e03756, #19=a99aa494, #20=7bb77142, #22=36c0231b, #23=c5e73b05, #24=13a74ec7, #25=9dcf1cb4, #26=12873951, #27=fc941d05, #28=e551c572, #31=f618dfff, #32=c1043a29, #33=94297e69
    fragmentShaderHash differs: #2=a1daa357, #7=c0b8fc9f, #8=6578c10d, #13=efed8e98, #14=135696d3, #15=a81023c3, #16=2eae9a54, #17=bd723c8a, #18=d391c52, #19=63f9c0d1, #20=87728b15, #22=a81023c3, #23=d4c95125, #24=3ab4c629, #25=2d1aa4a, #26=d4c95125, #27=3ab4c629, #28=2d1aa4a, #31=4057772, #32=5ca0fd5a, #33=aa0735a8
    bucket differs: #2=terrain, #7=other, #8=other, #13=environment, #14=vegetation, #15=vegetation, #16=vegetation, #17=environment, #18=fauna, #19=fauna, #20=fauna, #22=settlement, #23=settlement, #24=(unknown), #25=settlement, #26=settlement, #27=(unknown), #28=settlement, #31=other, #32=other, #33=other
    define STANDARD differs: #2=, #7=, #8=, #13=, #14=, #15=, #16=, #17=, #18=, #19=, #20=, #22=, #23=, #24=(unset), #25=, #26=, #27=(unset), #28=, #31=, #32=, #33=
    flag alphaTest differs: #2=0, #7=0, #8=0, #13=0, #14=0.45, #15=0, #16=0, #17=0, #18=0, #19=0, #20=0, #22=0, #23=0, #24=(unknown), #25=0, #26=0, #27=(unknown), #28=0, #31=0, #32=0, #33=0
    flag envMap differs: #2=false, #7=false, #8=false, #13=false, #14=false, #15=false, #16=false, #17=false, #18=false, #19=false, #20=false, #22=false, #23=false, #24=(unknown), #25=false, #26=false, #27=(unknown), #28=false, #31=false, #32=false, #33=false
    flag flatShading differs: #2=false, #7=true, #8=false, #13=false, #14=false, #15=false, #16=false, #17=false, #18=false, #19=false, #20=false, #22=false, #23=false, #24=(unknown), #25=false, #26=false, #27=(unknown), #28=false, #31=false, #32=false, #33=true
    flag fog differs: #2=true, #7=true, #8=true, #13=true, #14=true, #15=true, #16=true, #17=true, #18=true, #19=true, #20=true, #22=true, #23=true, #24=(unknown), #25=true, #26=true, #27=(unknown), #28=true, #31=true, #32=true, #33=true
    flag map differs: #2=false, #7=false, #8=false, #13=true, #14=true, #15=false, #16=false, #17=false, #18=false, #19=false, #20=true, #22=false, #23=true, #24=(unknown), #25=false, #26=true, #27=(unknown), #28=false, #31=true, #32=true, #33=false
    flag normalMap differs: #2=true, #7=false, #8=false, #13=false, #14=false, #15=false, #16=false, #17=false, #18=false, #19=false, #20=false, #22=false, #23=true, #24=(unknown), #25=false, #26=true, #27=(unknown), #28=false, #31=true, #32=true, #33=false
    flag transparent differs: #2=false, #7=false, #8=false, #13=false, #14=false, #15=false, #16=false, #17=false, #18=false, #19=false, #20=false, #22=false, #23=false, #24=(unknown), #25=true, #26=false, #27=(unknown), #28=true, #31=false, #32=false, #33=false
    flag vertexColors differs: #2=true, #7=false, #8=false, #13=false, #14=false, #15=false, #16=false, #17=false, #18=false, #19=false, #20=false, #22=false, #23=false, #24=(unknown), #25=false, #26=false, #27=(unknown), #28=false, #31=false, #32=false, #33=false
    flag wireframe differs: #2=false, #7=false, #8=false, #13=false, #14=false, #15=false, #16=false, #17=false, #18=false, #19=false, #20=false, #22=false, #23=false, #24=(unknown), #25=false, #26=false, #27=(unknown), #28=false, #31=false, #32=false, #33=false
  SpriteMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)
  MeshBasicMaterial (2 programs):
    vertexShaderHash differs: #11=d459e49b, #12=b6911298
    fragmentShaderHash differs: #11=a8a9bac3, #12=73a25d1e
    bucket differs: #11=(unknown), #12=other
    flag alphaTest differs: #11=(unknown), #12=0
    flag envMap differs: #11=(unknown), #12=false
    flag fog differs: #11=(unknown), #12=false
    flag map differs: #11=(unknown), #12=true
    flag normalMap differs: #11=(unknown), #12=false
    flag transparent differs: #11=(unknown), #12=true
    flag vertexColors differs: #11=(unknown), #12=false
    flag wireframe differs: #11=(unknown), #12=false
  MeshPhysicalMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)
  RawShaderMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)

---

[Seedvale Program Attribution]



Frame 741 (+10):
  Program #79
    material: MeshStandardMaterial ''
    materialUuid: 37e42fe1-80a2-41e0-b4e5-ad23c88dc5f9
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 89831d77
  Program #80
    material: MeshStandardMaterial 'Wood'
    materialUuid: d27eddcd-54f3-4184-8618-5a64d4deec8c
    object: Mesh 'mesh_0'
    asset: /models/settlement/crate.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 320d0e37
    fragmentShaderHash: 65cafcc2
  Program #81
    material: MeshStandardMaterial 'Green'
    materialUuid: b1a1937d-2b18-4d03-a909-36ac115c8616
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
  Program #82
    material: MeshStandardMaterial 'Green'
    materialUuid: 05e46187-b932-4bd4-ac40-674985600e93
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
  Program #83
    material: MeshStandardMaterial 'Berry'
    materialUuid: bdbd3ab2-b437-442a-8ff5-78d75ee3a182
    object: Mesh 'Barrel_1'
    asset: /models/settlement/barrel.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 798c4bf5
    fragmentShaderHash: c37cc244
  Program #84
    material: MeshStandardMaterial 'MapleTree_Bark'
    materialUuid: 4d2d2e8b-a826-4af4-b412-7ccc6b36b95b
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 2c216b4f
    fragmentShaderHash: 47812acb
  Program #85
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: ec0a2a1f-d0e8-434f-bada-a697c1adeab0
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
  Program #86
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: c042ab73-f986-45b0-8488-1c9d1d948b65
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #87
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 8bf4f32d-9b22-4c94-af7e-1220ca7fedfd
    object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
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
  Program #88
    material: MeshStandardMaterial 'MI_Regular_Male'
    materialUuid: 057be0a2-9be4-48a8-9f61-20855559932e
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/ubc/male_peasant.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,uv,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388672,8521763,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: de7c9827
    fragmentShaderHash: 4fa0b088

Frame 856 (+16):
  Program #96
    material: ShaderMaterial 'SkyShader'
    materialUuid: bcb08833-d85e-4ad3-8b27-01ffbb6af9bc
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #97
    material: ShaderMaterial ''
    materialUuid: d2b5f07d-0e46-45f7-b4df-9993ccbdb594
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 5efd8b76
    fragmentShaderHash: 8c624cc7
  Program #98
    material: MeshStandardMaterial ''
    materialUuid: 37e42fe1-80a2-41e0-b4e5-ad23c88dc5f9
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: 6b931360
  Program #99
    material: MeshStandardMaterial 'Wood'
    materialUuid: d27eddcd-54f3-4184-8618-5a64d4deec8c
    object: Mesh 'mesh_0'
    asset: /models/settlement/crate.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5cee842b
    fragmentShaderHash: 1683d5db
  Program #100
    material: MeshStandardMaterial 'Green'
    materialUuid: b1a1937d-2b18-4d03-a909-36ac115c8616
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
    materialUuid: 05e46187-b932-4bd4-ac40-674985600e93
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
    materialUuid: bdbd3ab2-b437-442a-8ff5-78d75ee3a182
    object: Mesh 'Barrel_1'
    asset: /models/settlement/barrel.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: c8368f61
    fragmentShaderHash: 8142f955
  Program #103
    material: MeshStandardMaterial 'MapleTree_Bark'
    materialUuid: 4d2d2e8b-a826-4af4-b412-7ccc6b36b95b
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: d612cf03
    fragmentShaderHash: 2a64e35c
  Program #104
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: ec0a2a1f-d0e8-434f-bada-a697c1adeab0
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
    materialUuid: c042ab73-f986-45b0-8488-1c9d1d948b65
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #106
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 8bf4f32d-9b22-4c94-af7e-1220ca7fedfd
    object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
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
    materialUuid: 057be0a2-9be4-48a8-9f61-20855559932e
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/ubc/male_peasant.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,uv,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388672,8522787,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: bd5799fb
    fragmentShaderHash: b5666e59
  Program #108
    material: ShaderMaterial ''
    materialUuid: 29fa4022-a550-4199-a997-a49af781c46f
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
    cacheKey: 10,11,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,0,8389635,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 5b43c776
    fragmentShaderHash: 34e03bb0
  Program #110
    material: ShaderMaterial ''
    materialUuid: c64e0747-fe3e-4e51-8c41-d486665caab6
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
  Program #111
    material: ShaderMaterial ''
    materialUuid: 303e20d6-6fd6-446a-9171-abad27d49cfa
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
Excluded — no reliable per-program timing: 103 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 10
  #60
      material: MeshStandardMaterial 'Main'
      object: SkinnedMesh 'mesh_0'
      asset: /models/fauna/horse.glb
      compile/link: 54.8 ms  (upper bound — whole postprocess-render call, see note above)

Frame 40
  #69
      material: MeshStandardMaterial 'LimeGreen'
      object: SkinnedMesh 'mesh_1'
      asset: /models/characters/Female_Formal.glb
      foliage-wind-v3
      compile/link: 25.2 ms  (upper bound — whole postprocess-render call, see note above)

Frame 48
  #70
      material: MeshStandardMaterial 'Pond_Pack_MAT'
      object: Mesh 'Branch_2b'
      asset: /models/items/branch.glb
      compile/link: 68.7 ms  (upper bound — whole mirror-render call, see note above)

Frame 76
  #73
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 15.0 ms  (upper bound — whole postprocess-render call, see note above)

Frame 104
  #74
      material: MeshStandardMaterial 'MapleTree_Bark'
      object: Mesh 'mesh_0'
      asset: /models/nature/maple_1.glb
      compile/link: 14.5 ms  (upper bound — whole mirror-render call, see note above)

Frame 108
  #75
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 18.4 ms  (upper bound — whole postprocess-render call, see note above)

Frame 140
  #76
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 12.5 ms  (upper bound — whole mirror-render call, see note above)

Frame 178
  #77
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 23.4 ms  (upper bound — whole postprocess-render call, see note above)

Frame 270
  #78
      material: MeshStandardMaterial 'Green'
      object: Mesh 'mesh_0_1'
      asset: /models/nature/tree_b.glb
      foliage-wind-v3
      compile/link: 10.8 ms  (upper bound — whole mirror-render call, see note above)

Summary:
  total measured compile/link time: 243.3 ms
  programs >1 ms: 9
  max: 68.7 ms (#70)

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=4.8 ms  p95=6.4 ms  max=6.6 ms  Δavg vs baseline=—
  hide-grass           avg=8.1 ms  p95=9.8 ms  max=9.9 ms  Δavg vs baseline=+3.2 ms (+67%)
  hide-vegetation      avg=9.8 ms  p95=16.2 ms  max=19.7 ms  Δavg vs baseline=+5.0 ms (+103%)
  no vegetation/grass  avg=6.5 ms  p95=8.0 ms  max=8.3 ms  Δavg vs baseline=+1.7 ms (+35%)
  hide-environment     avg=7.9 ms  p95=11.0 ms  max=11.1 ms  Δavg vs baseline=+3.1 ms (+64%)
  hide-settlement      avg=8.6 ms  p95=11.2 ms  max=11.9 ms  Δavg vs baseline=+3.8 ms (+79%)
  no water             avg=8.1 ms  p95=11.5 ms  max=13.9 ms  Δavg vs baseline=+3.3 ms (+68%)
  hide-terrain         avg=8.4 ms  p95=10.5 ms  max=10.7 ms  Δavg vs baseline=+3.6 ms (+75%)
  hide-npc-fauna       avg=9.3 ms  p95=14.3 ms  max=14.7 ms  Δavg vs baseline=+4.4 ms (+92%)
  no-shadows           avg=12.3 ms  p95=13.9 ms  max=14.1 ms  Δavg vs baseline=+7.5 ms (+154%)
  no-ao                avg=10.9 ms  p95=13.1 ms  max=13.2 ms  Δavg vs baseline=+6.1 ms (+126%)
  no-bloom             avg=8.8 ms  p95=14.7 ms  max=15.4 ms  Δavg vs baseline=+3.9 ms (+81%)
  no-smaa              avg=8.8 ms  p95=12.5 ms  max=13.1 ms  Δavg vs baseline=+4.0 ms (+82%)
  no-god-rays          avg=8.5 ms  p95=10.7 ms  max=10.8 ms  Δavg vs baseline=+3.7 ms (+76%)
  no-film-grade        avg=9.5 ms  p95=14.4 ms  max=15.0 ms  Δavg vs baseline=+4.7 ms (+97%)
  no postprocessing    avg=7.2 ms  p95=8.4 ms  max=8.5 ms  Δavg vs baseline=+2.4 ms (+50%)
  no mirrors           avg=8.1 ms  p95=10.4 ms  max=11.2 ms  Δavg vs baseline=+3.3 ms (+67%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (18 samples resolved during the baseline window)
  GPU elapsed   avg=23.2 ms  p95=28.4 ms  max=29.1 ms
  CPU wall      avg=4.8 ms  p95=6.4 ms  max=6.6 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

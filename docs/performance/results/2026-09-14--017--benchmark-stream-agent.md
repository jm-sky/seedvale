# Seedvale Performance Benchmark Report

> Generated: 2026-09-14T11:11:27.870Z
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
  avg: 17.8
  min: 8
  p1: 9

Frame time:
  avg: 56.1 ms
  p95: 86.9 ms
  max: 130.3 ms

Rendering:
  draw calls: 809 avg / 1947 max
  triangles: 11.50M avg
  mirror draws: 144 avg
  geometries: 793
  textures: 606

Scene (one-pass estimate):
  terrain        draws=65 tris=4.79M meshes=65 inst=65
  grass          draws=48 tris=1.11M meshes=48 inst=113076
  vegetation     draws=171 tris=1.55M meshes=171 inst=902
  environment    draws=103 tris=26.7k meshes=103 inst=124
  settlement     draws=744 tris=784.4k meshes=744 inst=1211
  water          draws=47 tris=3.40M meshes=47 inst=47
  npc            draws=161 tris=115.8k meshes=161 inst=161
  fauna          draws=184 tris=83.3k meshes=184 inst=184
  items          draws=176 tris=17.7k meshes=176 inst=176
  other          draws=192 tris=23.3k meshes=192 inst=192

Systems:
  TERRAIN        0.8 ms
  WATER          4.1 ms
  NPC            10.8 ms
  FAUNA          14.3 ms
  PHYSICS        0.1 ms
  RENDER         19.8 ms

Detected bottlenecks:
  1. RENDER
  2. FAUNA
  3. NPC

Critical spikes:
  GRASS: 17
  STREAMING: 16
  WATER: 15

Hitches (>= 8 ms):
  grass generation       n=17 avg=19.5 max=31.9
  chunk mesh             n=16 avg=10.0 max=19.1
  chunk water            n=15 avg=9.8 max=11.5

Isolation probes:
  full               render=17.2 ms draws=286 tris=6.52M
  hide-grass         render=13.0 ms draws=258 tris=5.62M
  hide-vegetation    render=13.2 ms draws=162 tris=4.35M
  hide-vegetation-grass render=10.8 ms draws=136 tris=3.41M
  hide-environment   render=11.2 ms draws=266 tris=6.50M
  hide-settlement    render=11.7 ms draws=270 tris=6.70M
  hide-water         render=12.5 ms draws=272 tris=5.67M
  hide-terrain       render=12.7 ms draws=259 tris=4.31M
  hide-npc-fauna     render=11.6 ms draws=286 tris=6.64M
  no-shadows         render=13.4 ms draws=277 tris=6.38M
  no-ao              render=18.0 ms draws=282 tris=6.71M
  no-bloom           render=13.3 ms draws=272 tris=6.51M
  no-smaa            render=12.1 ms draws=283 tris=6.64M
  no-god-rays        render=13.6 ms draws=285 tris=6.51M
  no-film-grade      render=10.8 ms draws=286 tris=6.64M
  no-postprocessing  render=10.6 ms draws=263 tris=6.64M
  no-reflections     render=22.7 ms draws=1037 tris=6.37M

Frame attribution:
  frame max: 130.3 ms
  largest labelled hitch: 31.9 ms
  unattributed: 98.4 ms

Recommendation:
RENDER is the largest sustained CPU-measured category, but composer submission time can include GPU wait — not confirmed as a CPU bottleneck without isolation probes.

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 28

NPC:
  total: 10.8 ms/frame
  crowd pass: 0.0 ms/frame (7.4 ms cumulative)
  agent updates: 1.7 ms/frame (710.4 ms cumulative)
  livestock: 6.7 ms/frame (2849.9 ms cumulative)
    loaded tick: 6.7 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 6.7 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 3.2 ms/frame
      life/presentation: 3.2 ms/frame
      other update: 0.2 ms/frame
    update calls/frame: 13.5
    unique animals/frame: 13.3
    duplicate updates/frame: 0.2
    detached animals/frame: 0.0
    dog updates/frame: 2.2
    dog guard scans: 2.2/frame (15.1 predator candidates/frame)
    pest scans: 2.2/frame (2.2 rat candidates/frame)
    nearest scans: 13.5/frame (0.0 candidates/frame)
  rats: 1.8 ms/frame (744.3 ms cumulative)
  social: 0.0 ms/frame (17.3 ms cumulative)
  streaming: 0.3 ms/frame (140.2 ms cumulative)
  maintenance: 0.2 ms/frame (91.8 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 14.3 ms/frame
  agent updates: 14.2 ms/frame (6031.9 ms cumulative)
  forest sampling: 0.2 ms/frame (94.9 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.1 ms/frame (53.7 ms cumulative)
    targeting: 0.0 ms/frame (20.1 ms cumulative)
    decision: 0.1 ms/frame (21.4 ms cumulative)
    behaviour: 6.0 ms/frame (2557.7 ms cumulative)
    life/presentation: 7.4 ms/frame (3131.0 ms cumulative)
    other update: 0.4 ms/frame

  adaptive candidates:
    agent updates/frame: 28.0
    sensing passes/frame: 28.0
    decision passes/frame: 28.0
    high-priority agents/frame: 0.2
    expensive behaviour agents/frame: 27.8

  sensing/cache:
    forest samples/frame: 28.0
    fire scan candidates/frame: 20.4
    village scan candidates/frame: 339.9
    player perception checks/frame: 28.0

  nearest scans: 41.2/frame (17494 calls)
  nearest candidates checked: 564.0/frame (239702 total)
  herd leader scans: 0.2/frame (71 calls)
  herd candidates checked: 4.7/frame (1988 total)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 28

NPC:
  total: 10.8 ms/frame
  crowd pass: 0.0 ms/frame (7.4 ms cumulative)
  agent updates: 1.7 ms/frame (710.4 ms cumulative)
  livestock: 6.7 ms/frame (2849.9 ms cumulative)
    loaded tick: 6.7 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 6.7 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.1 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 3.2 ms/frame
      life/presentation: 3.2 ms/frame
      other update: 0.2 ms/frame
    update calls/frame: 13.5
    unique animals/frame: 13.3
    duplicate updates/frame: 0.2
    detached animals/frame: 0.0
    dog updates/frame: 2.2
    dog guard scans: 2.2/frame (15.1 predator candidates/frame)
    pest scans: 2.2/frame (2.2 rat candidates/frame)
    nearest scans: 13.5/frame (0.0 candidates/frame)
  rats: 1.8 ms/frame (744.3 ms cumulative)
  social: 0.0 ms/frame (17.3 ms cumulative)
  streaming: 0.3 ms/frame (140.2 ms cumulative)
  maintenance: 0.2 ms/frame (91.8 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 14.3 ms/frame
  agent updates: 14.2 ms/frame (6031.9 ms cumulative)
  forest sampling: 0.2 ms/frame (94.9 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.1 ms/frame (53.7 ms cumulative)
    targeting: 0.0 ms/frame (20.1 ms cumulative)
    decision: 0.1 ms/frame (21.4 ms cumulative)
    behaviour: 6.0 ms/frame (2557.7 ms cumulative)
    life/presentation: 7.4 ms/frame (3131.0 ms cumulative)
    other update: 0.4 ms/frame

  adaptive candidates:
    agent updates/frame: 28.0
    sensing passes/frame: 28.0
    decision passes/frame: 28.0
    high-priority agents/frame: 0.2
    expensive behaviour agents/frame: 27.8

  sensing/cache:
    forest samples/frame: 28.0
    fire scan candidates/frame: 20.4
    village scan candidates/frame: 339.9
    player perception checks/frame: 28.0

  nearest scans: 41.2/frame (17494 calls)
  nearest candidates checked: 564.0/frame (239702 total)
  herd leader scans: 0.2/frame (71 calls)
  herd candidates checked: 4.7/frame (1988 total)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 28
  empty builds: 21
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 14.34 ms
    max 31.90 ms

  allocation/setup:
    avg 4.08 ms
    max 8.90 ms
  instanceMatrix bind:
    avg 0.01 ms
    max 0.10 ms
  bounds/finalize (`computeBoundingSphere`):
    avg 10.12 ms
    max 23.00 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.26 ms
    max 1.80 ms
  scene attach (`scene.add`):
    avg 0.03 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 8.56 ms
    max 33.00 ms

  per chunk:
    instances avg/max 140111.6 / 271541
    meshes avg/max 4.00 / 4
    geometries avg/max 4.00 / 4
    geometries after lod apply avg/max 7.00 / 7
    instances full/filler: 1262076 / 2661049
    matrix instances bound: 3923125
    instanced attributes created: 560
    shared material refs: 112
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 28/28
    instances: 473484 (max 32465)
    allocation/setup avg/max: 0.62 / 2.60 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 1.27 / 4.00 ms
  grain:
    buckets/meshes: 28/28
    instances: 158220 (max 10763)
    allocation/setup avg/max: 0.20 / 0.50 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.42 / 1.10 ms
  herb:
    buckets/meshes: 28/28
    instances: 630372 (max 44129)
    allocation/setup avg/max: 0.80 / 3.90 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 1.63 / 3.60 ms
  filler:
    buckets/meshes: 28/28
    instances: 2661049 (max 184184)
    allocation/setup avg/max: 2.46 / 6.30 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 6.80 / 14.30 ms

---

[Seedvale Program Census]

Programs created: 109
Program count: final=107 max=109

By frame:
  frame 0   +43 programs   <== largest transition
  frame 1   +4 programs
  frame 55   +8 programs
  frame 56   +4 programs
  frame 67   +4 programs
  frame 76   +1 program
  frame 77   +6 programs
  frame 115   +1 program
  frame 121   +1 program
  frame 151   +1 program
  frame 153   +1 program
  frame 154   +1 program
  frame 193   +1 program
  frame 683   +13 programs
  frame 699   +4 programs
  frame 784   +16 programs

Largest transition — frame 0 (+43 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=ba24a729-ad79-41e1-a82e-af1d9b85d752 (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=a0eac729-d7c1-41b8-9cc8-8c2cc5949e9f
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=a1daa357 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=42873679-bb8e-4fba-95eb-3e23378c67c6
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=mirror-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=2cfad586-ecbd-4e12-90a2-a73b94dae426
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=2cf9fa62 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=cdcef4ca-33fd-4175-ade2-5b13fec7b7c7
  #5 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=ae169224 fHash=9b2a34e4 stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=77041cd3-3769-4445-8e12-a9be99368155
  #6 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=6af7b75b-06f3-4cc4-9948-0f33a12ecbf2
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=6530da86-d1af-4ca3-9d61-e629196a722d
  #8 type=MeshStandardMaterial name='Wood' bucket=other cacheKey=physical,STANDARD,,highp… vHash=d38f15a4 fHash=6578c10d stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=492b7101-1852-4467-b9a2-0f03e4f564a9 (Wood)
  #9 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=5b43c776 fHash=70b71dad stage=mirror-render
  #10 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=mirror-render
  #11 type=MeshBasicMaterial name='' cacheKey=basic,highp,srgb-linear,… vHash=d459e49b fHash=a8a9bac3 stage=mirror-render
  #12 type=MeshBasicMaterial name='' bucket=other cacheKey=basic,highp,srgb-linear,… vHash=b6911298 fHash=73a25d1e stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"true","normalMap":"false","envMap":"false"}
      material=311d5c2f-e405-4ee6-a114-a10ce4830c18
  #13 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=54e03756 fHash=d391c52 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=64c11d0f-3c27-487a-b7aa-abbc71a514b2 (Main)
  #14 type=MeshStandardMaterial name='Material.001' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=a99aa494 fHash=63f9c0d1 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=16b6343d-01ad-4c54-bdd3-d5421571e26d (Material.001)
  #15 type=MeshStandardMaterial name='lambert2SG' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=7bb77142 fHash=87728b15 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=64f557f9-ca40-4bcb-b081-a9a7c02f8746 (lambert2SG)
  #16 type=MeshPhysicalMaterial name='Material #55' bucket=fauna cacheKey=physical,STANDARD,,PHYSI… vHash=a344732e fHash=16869b56 stage=mirror-render
      defines={"STANDARD":"","PHYSICAL":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=7146ab1a-9ecb-46e2-9507-cd10187dff3d (Material #55)
  #17 type=MeshStandardMaterial name='Green' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=c0d790d1 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=7ca077bd-6292-4443-952d-b6c438fa0ad4 (Green)
  #18 type=MeshStandardMaterial name='Pink' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=d3fd7a87 fHash=2eae9a54 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=47d0457b-7d90-470d-a562-0a4614bbc675 (Pink)
  #19 type=MeshStandardMaterial name='Stone' bucket=environment cacheKey=physical,STANDARD,,highp… vHash=a9733c9d fHash=bd723c8a stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=4f34cc6d-8998-402f-b64d-0d7a4ceee90d (Stone)
  #20 type=MeshStandardMaterial name='Bush_Leaves' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=6e8e36b1 fHash=69a54c52 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0.45","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=ab80b6b1-6610-4173-8658-ed7ca616f5cb (Bush_Leaves)
  #21 type=MeshStandardMaterial name='Black' bucket=other cacheKey=physical,STANDARD,,highp… vHash=deee2625 fHash=497d8e73 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=cf33cfc6-c3f1-442e-98a7-ee3f698f02b0 (Black)
  #22 type=MeshStandardMaterial name='Green' bucket=other cacheKey=physical,STANDARD,,highp… vHash=589b45c0 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=2b552d84-ade3-440d-aeca-1e17eaf65cc4 (Green)
  #23 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=76538ae1 fHash=a61fc7cc stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=eec963e2-bc00-4c12-bb47-c61732dc2667
  #24 type=MeshStandardMaterial name='None' bucket=environment cacheKey=physical,STANDARD,,highp… vHash=6db98a06 fHash=efed8e98 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=c41f85f1-9562-4936-b988-55af205cfc4b (None)
  #25 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=279cec18 fHash=4d6bcede stage=postprocess-render
  #26 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=84736a68 fHash=ffecb62a stage=postprocess-render
  #27 type=ShaderMaterial name='' cacheKey=16,17,highp,srgb-linear,… vHash=aa2edbee fHash=76ced00a stage=postprocess-render
  #28 type=ShaderMaterial name='' cacheKey=18,19,highp,srgb-linear,… vHash=7bae0bb2 fHash=fb55b3c0 stage=postprocess-render
  #29 type=ShaderMaterial name='' cacheKey=20,21,highp,srgb-linear,… vHash=436caea4 fHash=2d687ef1 stage=postprocess-render
  #30 type=ShaderMaterial name='' cacheKey=22,23,SMAA_THRESHOLD,0.1… vHash=886438e7 fHash=dc2a89b5 stage=postprocess-render
  #31 type=ShaderMaterial name='' cacheKey=24,25,SMAA_MAX_SEARCH_ST… vHash=d99a5b29 fHash=109e33fc stage=postprocess-render
  #32 type=ShaderMaterial name='' cacheKey=26,27,highp,srgb-linear,… vHash=2003ced8 fHash=db0f470a stage=postprocess-render
  #33 type=ShaderMaterial name='' cacheKey=28,29,highp,srgb-linear,… vHash=28dfa407 fHash=9775cd0e stage=postprocess-render
  #34 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,6,hi… vHash=756a0b19 fHash=5c741650 stage=postprocess-render
  #35 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,10,h… vHash=b2354ff2 fHash=2aad9943 stage=postprocess-render
  #36 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,14,h… vHash=ea82969e fHash=a2297d9f stage=postprocess-render
  #37 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,18,h… vHash=7dab8d9a fHash=1022767b stage=postprocess-render
  #38 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,22,h… vHash=378e1fb7 fHash=ce0bf6b4 stage=postprocess-render
  #39 type=ShaderMaterial name='' cacheKey=30,32,NUM_MIPS,5,highp,s… vHash=78acf7ea fHash=707f290c stage=postprocess-render
  #40 type=ShaderMaterial name='' cacheKey=33,34,highp,srgb-linear,… vHash=a312c579 fHash=c05e2256 stage=postprocess-render
  #41 type=ShaderMaterial name='GodRaysShader' cacheKey=35,36,highp,srgb-linear,… vHash=b817515d fHash=ccc98549 stage=postprocess-render
  #42 type=RawShaderMaterial name='OutputShader' cacheKey=37,38,SRGB_TRANSFER,,ACE… vHash=5d2c950f fHash=c1247d7 stage=postprocess-render

Differences within frame 0 (grouped by material type):
  ShaderMaterial (24 programs):
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=ae169224, #6=e6d01ae7, #9=5b43c776, #25=279cec18, #26=84736a68, #27=aa2edbee, #28=7bae0bb2, #29=436caea4, #30=886438e7, #31=d99a5b29, #32=2003ced8, #33=28dfa407, #34=756a0b19, #35=b2354ff2, #36=ea82969e, #37=7dab8d9a, #38=378e1fb7, #39=78acf7ea, #40=a312c579, #41=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=2cf9fa62, #5=9b2a34e4, #6=e34491ff, #9=70b71dad, #25=4d6bcede, #26=ffecb62a, #27=76ced00a, #28=fb55b3c0, #29=2d687ef1, #30=dc2a89b5, #31=109e33fc, #32=db0f470a, #33=9775cd0e, #34=5c741650, #35=2aad9943, #36=a2297d9f, #37=1022767b, #38=ce0bf6b4, #39=707f290c, #40=c05e2256, #41=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=grass, #6=water, #9=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #9=(unset), #25=(unset), #26=(unset), #27=(unset), #28=(unset), #29=(unset), #30=(unset), #31=(unset), #32=(unset), #33=(unset), #34=(unset), #35=(unset), #36=(unset), #37=(unset), #38=(unset), #39=(unset), #40=(unset), #41=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #9=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #9=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=false, #6=true, #9=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown), #37=(unknown), #38=(unknown), #39=(unknown), #40=(unknown), #41=(unknown)
  MeshStandardMaterial (14 programs):
    vertexShaderHash differs: #2=5c2c57a3, #7=e3408c64, #8=d38f15a4, #13=54e03756, #14=a99aa494, #15=7bb77142, #17=c0d790d1, #18=d3fd7a87, #19=a9733c9d, #20=6e8e36b1, #21=deee2625, #22=589b45c0, #23=76538ae1, #24=6db98a06
    fragmentShaderHash differs: #2=a1daa357, #7=c0b8fc9f, #8=6578c10d, #13=d391c52, #14=63f9c0d1, #15=87728b15, #17=a81023c3, #18=2eae9a54, #19=bd723c8a, #20=69a54c52, #21=497d8e73, #22=a81023c3, #23=a61fc7cc, #24=efed8e98
    bucket differs: #2=terrain, #7=other, #8=other, #13=fauna, #14=fauna, #15=fauna, #17=vegetation, #18=vegetation, #19=environment, #20=vegetation, #21=other, #22=other, #23=other, #24=environment
    flag alphaTest differs: #2=0, #7=0, #8=0, #13=0, #14=0, #15=0, #17=0, #18=0, #19=0, #20=0.45, #21=0, #22=0, #23=0, #24=0
    flag flatShading differs: #2=false, #7=true, #8=false, #13=false, #14=false, #15=false, #17=false, #18=false, #19=false, #20=false, #21=false, #22=false, #23=true, #24=false
    flag fog differs: #2=true, #7=true, #8=true, #13=true, #14=true, #15=true, #17=true, #18=true, #19=true, #20=true, #21=true, #22=true, #23=false, #24=true
    flag map differs: #2=false, #7=false, #8=false, #13=false, #14=false, #15=true, #17=false, #18=false, #19=false, #20=true, #21=false, #22=false, #23=false, #24=true
    flag normalMap differs: #2=true, #7=false, #8=false, #13=false, #14=false, #15=false, #17=false, #18=false, #19=false, #20=false, #21=false, #22=false, #23=false, #24=false
    flag vertexColors differs: #2=true, #7=false, #8=false, #13=false, #14=false, #15=false, #17=false, #18=false, #19=false, #20=false, #21=false, #22=false, #23=false, #24=false
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



Frame 683 (+13):
  Program #76
    material: MeshStandardMaterial ''
    materialUuid: 42873679-bb8e-4fba-95eb-3e23378c67c6
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 89831d77
  Program #77
    material: MeshStandardMaterial 'Wood'
    materialUuid: d2ffe13c-4e6a-4926-93c5-83d39973a694
    object: Mesh 'mesh_0'
    asset: /models/settlement/crate.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 320d0e37
    fragmentShaderHash: 65cafcc2
  Program #78
    material: MeshStandardMaterial 'Green'
    materialUuid: 54686985-a99d-4ea3-9f3a-7c304c6e34d8
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
  Program #79
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 0780bcb0-1b5b-48e3-848d-3d3777cfade5
    object: Mesh 'Barrel_1'
    asset: /models/settlement/barrel.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ca65e7f6
    fragmentShaderHash: ed8c9b61
  Program #80
    material: MeshStandardMaterial 'NormalTree_Bark'
    materialUuid: 9a610a21-f5b1-4124-a0e3-70ad02a5b893
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 1bd8d9e3
    fragmentShaderHash: e2f189d1
  Program #81
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: 6b5b5daf-cfbc-481f-be40-7a7ae56b7802
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
    vertexShaderHash: 7db7358f
    fragmentShaderHash: 800accd2
  Program #82
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: fdb693c4-5b31-4d38-8e41-10f379d95ce4
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #83
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 28d12ca4-afa6-4fb0-90f4-36978ed07260
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
  Program #84
    material: MeshStandardMaterial 'Brown'
    materialUuid: 7bc299bf-87a2-41ea-906d-99e92bb269cb
    object: SkinnedMesh 'mesh_1_1'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 27e30ee8
    fragmentShaderHash: 731f1f78
  Program #85
    material: MeshStandardMaterial 'Green'
    materialUuid: 2b552d84-ade3-440d-aeca-1e17eaf65cc4
    object: SkinnedMesh 'mesh_3'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,(shader, renderer) => {
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
    vertexShaderHash: 189e14ce
    fragmentShaderHash: c94ff2d5
  Program #86
    material: MeshStandardMaterial 'MI_WoodTrim'
    materialUuid: ea3e3a0c-4a91-467b-853a-27f4837a0a9b
    object: Mesh 'house-static-batch:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,uv,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3c9f4a85
    fragmentShaderHash: dd9a9763
  Program #87
    material: MeshStandardMaterial 'MI_WindowGlass'
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8392707,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 30e685d1
    fragmentShaderHash: 53dde5bb
  Program #88
    material: MeshStandardMaterial 'MI_WindowGlass'
    materialUuid: 195e815d-3ce9-4178-b90a-602c851beecd
    object: Mesh 'house-static-batch:20'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8388611,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5f2e9b54
    fragmentShaderHash: 372a363a

Frame 784 (+16):
  Program #93
    material: ShaderMaterial 'SkyShader'
    materialUuid: ba24a729-ad79-41e1-a82e-af1d9b85d752
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #94
    material: ShaderMaterial ''
    materialUuid: 77041cd3-3769-4445-8e12-a9be99368155
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: ae169224
    fragmentShaderHash: 8c624cc7
  Program #95
    material: MeshStandardMaterial ''
    materialUuid: 42873679-bb8e-4fba-95eb-3e23378c67c6
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: 6b931360
  Program #96
    material: MeshStandardMaterial 'Wood'
    materialUuid: d2ffe13c-4e6a-4926-93c5-83d39973a694
    object: Mesh 'mesh_0'
    asset: /models/settlement/crate.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5cee842b
    fragmentShaderHash: 1683d5db
  Program #97
    material: MeshStandardMaterial 'Green'
    materialUuid: 54686985-a99d-4ea3-9f3a-7c304c6e34d8
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
  Program #98
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 0780bcb0-1b5b-48e3-848d-3d3777cfade5
    object: Mesh 'Barrel_1'
    asset: /models/settlement/barrel.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3e42e9c4
    fragmentShaderHash: d48c36b2
  Program #99
    material: MeshStandardMaterial 'NormalTree_Bark'
    materialUuid: 9a610a21-f5b1-4124-a0e3-70ad02a5b893
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ab1dd48f
    fragmentShaderHash: 8661e8c2
  Program #100
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: 6b5b5daf-cfbc-481f-be40-7a7ae56b7802
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
    vertexShaderHash: 79ee70f3
    fragmentShaderHash: 559e694b
  Program #101
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: fdb693c4-5b31-4d38-8e41-10f379d95ce4
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #102
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 28d12ca4-afa6-4fb0-90f4-36978ed07260
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
  Program #103
    material: MeshStandardMaterial 'Black'
    materialUuid: cf33cfc6-c3f1-442e-98a7-ee3f698f02b0
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: deee2625
    fragmentShaderHash: da938326
  Program #104
    material: MeshStandardMaterial 'Green'
    materialUuid: 2b552d84-ade3-440d-aeca-1e17eaf65cc4
    object: SkinnedMesh 'mesh_3'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,(shader, renderer) => {
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
    vertexShaderHash: 589b45c0
    fragmentShaderHash: 3aaee6d6
  Program #105
    material: ShaderMaterial ''
    materialUuid: 6af7b75b-06f3-4cc4-9948-0f33a12ecbf2
    object: Mesh 'ocean'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: e6d01ae7
    fragmentShaderHash: 215382b6
  Program #106
    material: ShaderMaterial ''
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 10,11,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,0,8389635,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 5b43c776
    fragmentShaderHash: 34e03bb0
  Program #107
    material: ShaderMaterial ''
    materialUuid: 4b91dfde-65a2-425c-b0d4-9126d8cb819d
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
  Program #108
    material: ShaderMaterial ''
    materialUuid: 16e33e73-ff58-41b5-bd96-6cd054182a9b
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
Excluded — no reliable per-program timing: 101 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 67
  #62
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 36.7 ms  (upper bound — whole postprocess-render call, see note above)

Frame 76
  #63
      material: MeshStandardMaterial 'LimeGreen'
      object: SkinnedMesh 'mesh_1'
      asset: /models/characters/Female_Formal.glb
      foliage-wind-v3
      compile/link: 87.7 ms  (upper bound — whole postprocess-render call, see note above)

Frame 115
  #70
      material: MeshStandardMaterial 'Pond_Pack_MAT'
      object: Mesh 'Branch_2b'
      asset: /models/items/branch.glb
      compile/link: 39.3 ms  (upper bound — whole postprocess-render call, see note above)

Frame 121
  #71
      material: MeshStandardMaterial 'BirchTree_Bark'
      object: Mesh 'mesh_0'
      asset: /models/nature/birch_1.glb
      compile/link: 25.3 ms  (upper bound — whole mirror-render call, see note above)

Frame 151
  #72
      material: MeshStandardMaterial 'Green'
      object: Mesh 'mesh_0_1'
      asset: /models/nature/tree_b.glb
      foliage-wind-v3
      compile/link: 24.6 ms  (upper bound — whole mirror-render call, see note above)

Frame 153
  #73
      material: MeshStandardMaterial 'PineTree_Bark'
      object: Mesh 'mesh_0'
      asset: /models/nature/pine_1.glb
      compile/link: 26.1 ms  (upper bound — whole mirror-render call, see note above)

Frame 154
  #74
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 43.7 ms  (upper bound — whole postprocess-render call, see note above)

Frame 193
  #75
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 23.4 ms  (upper bound — whole postprocess-render call, see note above)

Summary:
  total measured compile/link time: 306.8 ms
  programs >1 ms: 8
  max: 87.7 ms (#63)

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=17.2 ms  p95=24.5 ms  max=25.5 ms  Δavg vs baseline=—
  hide-grass           avg=13.0 ms  p95=15.3 ms  max=15.4 ms  Δavg vs baseline=-4.2 ms (-24%)
  hide-vegetation      avg=13.2 ms  p95=16.2 ms  max=17.1 ms  Δavg vs baseline=-4.1 ms (-24%)
  no vegetation/grass  avg=10.8 ms  p95=13.3 ms  max=13.5 ms  Δavg vs baseline=-6.4 ms (-37%)
  hide-environment     avg=11.2 ms  p95=15.7 ms  max=15.9 ms  Δavg vs baseline=-6.0 ms (-35%)
  hide-settlement      avg=11.7 ms  p95=14.8 ms  max=15.1 ms  Δavg vs baseline=-5.5 ms (-32%)
  no water             avg=12.5 ms  p95=14.6 ms  max=14.9 ms  Δavg vs baseline=-4.7 ms (-27%)
  hide-terrain         avg=12.7 ms  p95=21.5 ms  max=22.5 ms  Δavg vs baseline=-4.6 ms (-26%)
  hide-npc-fauna       avg=11.6 ms  p95=14.7 ms  max=14.8 ms  Δavg vs baseline=-5.6 ms (-33%)
  no-shadows           avg=13.4 ms  p95=18.5 ms  max=20.3 ms  Δavg vs baseline=-3.8 ms (-22%)
  no-ao                avg=18.0 ms  p95=22.0 ms  max=22.4 ms  Δavg vs baseline=+0.7 ms (+4%)
  no-bloom             avg=13.3 ms  p95=17.2 ms  max=17.6 ms  Δavg vs baseline=-3.9 ms (-23%)
  no-smaa              avg=12.1 ms  p95=14.0 ms  max=14.5 ms  Δavg vs baseline=-5.1 ms (-30%)
  no-god-rays          avg=13.6 ms  p95=18.0 ms  max=19.3 ms  Δavg vs baseline=-3.6 ms (-21%)
  no-film-grade        avg=10.8 ms  p95=13.4 ms  max=14.2 ms  Δavg vs baseline=-6.5 ms (-37%)
  no postprocessing    avg=10.6 ms  p95=12.8 ms  max=12.8 ms  Δavg vs baseline=-6.6 ms (-38%)
  no mirrors           avg=22.7 ms  p95=36.3 ms  max=43.8 ms  Δavg vs baseline=+5.4 ms (+32%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (11 samples resolved during the baseline window)
  GPU elapsed   avg=37.0 ms  p95=40.3 ms  max=41.4 ms
  CPU wall      avg=17.2 ms  p95=24.5 ms  max=25.5 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

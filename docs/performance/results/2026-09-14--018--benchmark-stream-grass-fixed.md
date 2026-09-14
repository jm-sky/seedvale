# Seedvale Performance Benchmark Report

> Generated: 2026-09-14T11:19:46.264Z
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
  avg: 26.3
  min: 5
  p1: 10

Frame time:
  avg: 38.1 ms
  p95: 60.5 ms
  max: 191 ms

Rendering:
  draw calls: 771 avg / 1974 max
  triangles: 10.82M avg
  mirror draws: 142 avg
  geometries: 715
  textures: 506

Scene (one-pass estimate):
  terrain        draws=72 tris=5.31M meshes=72 inst=72
  grass          draws=60 tris=837.5k meshes=60 inst=98841
  vegetation     draws=191 tris=1.84M meshes=191 inst=1076
  environment    draws=107 tris=31.5k meshes=107 inst=134
  settlement     draws=744 tris=784.4k meshes=744 inst=1211
  water          draws=51 tris=3.69M meshes=51 inst=51
  npc            draws=161 tris=115.8k meshes=161 inst=161
  fauna          draws=184 tris=83.3k meshes=184 inst=184
  items          draws=207 tris=18.5k meshes=207 inst=207
  other          draws=199 tris=23.8k meshes=199 inst=199

Systems:
  TERRAIN        0.4 ms
  WATER          2.8 ms
  NPC            7.0 ms
  FAUNA          10.2 ms
  PHYSICS        0.1 ms
  RENDER         12.8 ms

Detected bottlenecks:
  1. RENDER
  2. FAUNA
  3. NPC

Critical spikes:
  GRASS: 3
  STREAMING: 3
  WATER: 1

Hitches (>= 8 ms):
  grass generation       n=3 avg=9.2 max=9.8
  chunk mesh             n=3 avg=8.9 max=9.5
  chunk water            n=1 avg=8.2 max=8.2

Isolation probes:
  full               render=7.4 ms draws=286 tris=6.15M
  hide-grass         render=7.2 ms draws=260 tris=5.88M
  hide-vegetation    render=7.0 ms draws=166 tris=3.80M
  hide-vegetation-grass render=6.2 ms draws=137 tris=3.36M
  hide-environment   render=7.3 ms draws=262 tris=5.95M
  hide-settlement    render=9.6 ms draws=266 tris=6.27M
  hide-water         render=6.8 ms draws=267 tris=5.09M
  hide-terrain       render=10.0 ms draws=254 tris=3.85M
  hide-npc-fauna     render=8.1 ms draws=276 tris=6.01M
  no-shadows         render=7.6 ms draws=281 tris=5.95M
  no-ao              render=8.6 ms draws=280 tris=6.15M
  no-bloom           render=8.6 ms draws=268 tris=6.08M
  no-smaa            render=6.9 ms draws=278 tris=6.06M
  no-god-rays        render=9.0 ms draws=281 tris=6.08M
  no-film-grade      render=9.6 ms draws=281 tris=6.08M
  no-postprocessing  render=6.1 ms draws=261 tris=6.20M
  no-reflections     render=7.1 ms draws=209 tris=5.01M

Frame attribution:
  frame max: 191 ms
  largest labelled hitch: 9.8 ms
  unattributed: 181.2 ms

Recommendation:
Largest frame (191 ms) is not explained by labelled hitches (largest 9.8 ms) — unattributed frame spike, not a category bottleneck.

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 28

NPC:
  total: 7.0 ms/frame
  crowd pass: 0.0 ms/frame (5.9 ms cumulative)
  agent updates: 1.1 ms/frame (833.9 ms cumulative)
  livestock: 4.1 ms/frame (3027.9 ms cumulative)
    loaded tick: 4.1 ms/frame
    detached tick: 0.0 ms/frame
    unattributed: 0.0 ms/frame
    animal updates: 4.1 ms/frame
    post-update (egg/readyToRemove): 0.0 ms/frame
    detached bookkeeping: 0.0 ms/frame
    AnimalAgent sections:
      sensing: 0.0 ms/frame
      targeting: 0.0 ms/frame
      decision: 0.0 ms/frame
      behaviour: 1.6 ms/frame
      life/presentation: 2.3 ms/frame
      other update: 0.1 ms/frame
    update calls/frame: 14.9
    unique animals/frame: 14.7
    duplicate updates/frame: 0.2
    detached animals/frame: 0.0
    dog updates/frame: 2.6
    dog guard scans: 2.6/frame (18.2 predator candidates/frame)
    pest scans: 2.6/frame (2.6 rat candidates/frame)
    nearest scans: 14.9/frame (0.0 candidates/frame)
  rats: 1.4 ms/frame (1000.2 ms cumulative)
  social: 0.0 ms/frame (6.6 ms cumulative)
  streaming: 0.2 ms/frame (129.2 ms cumulative)
  maintenance: 0.2 ms/frame (113.4 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 10.2 ms/frame
  agent updates: 10.2 ms/frame (7484.7 ms cumulative)
  forest sampling: 0.2 ms/frame (113.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.0 ms/frame (34.7 ms cumulative)
    targeting: 0.0 ms/frame (26.0 ms cumulative)
    decision: 0.0 ms/frame (19.2 ms cumulative)
    behaviour: 3.8 ms/frame (2790.7 ms cumulative)
    life/presentation: 5.9 ms/frame (4370.5 ms cumulative)
    other update: 0.2 ms/frame

  adaptive candidates:
    agent updates/frame: 28.0
    sensing passes/frame: 26.7
    decision passes/frame: 26.7
    high-priority agents/frame: 1.3
    expensive behaviour agents/frame: 25.4

  sensing/cache:
    forest samples/frame: 28.0
    fire scan candidates/frame: 26.1
    village scan candidates/frame: 408.7
    player perception checks/frame: 26.7

  nearest scans: 38.2/frame (28112 calls)
  nearest candidates checked: 523.2/frame (385048 total)
  herd leader scans: 0.1/frame (90 calls)
  herd candidates checked: 3.4/frame (2520 total)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 20
  empty builds (no instances): 20
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 4.51 ms
    max 9.80 ms

  allocation/setup:
    avg 4.43 ms
    max 9.60 ms
  instanceMatrix bind:
    avg 0.01 ms
    max 0.10 ms
  bounds/finalize (apply worker bounds):
    avg 0.03 ms
    max 0.20 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.24 ms
    max 1.50 ms
  scene attach (`scene.add`):
    avg 0.03 ms
    max 0.10 ms
  callback total (build + lod + attach):
    avg 4.91 ms
    max 10.70 ms

  per chunk:
    instances avg/max 152970.6 / 271541
    meshes avg/max 4.00 / 4
    geometries avg/max 4.00 / 4
    geometries after lod apply avg/max 7.00 / 7
    instances full/filler: 980195 / 2079216
    matrix instances bound: 3059411
    instanced attributes created: 400
    shared material refs: 80
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 20/20
    instances: 367370 (max 32465)
    allocation/setup avg/max: 0.66 / 2.30 ms
    instanceMatrix bind avg/max: 0.00 / 0.10 ms
    bounds/finalize avg/max: 0.01 / 0.10 ms
  grain:
    buckets/meshes: 20/20
    instances: 122570 (max 10763)
    allocation/setup avg/max: 0.25 / 0.90 ms
    instanceMatrix bind avg/max: 0.00 / 0.10 ms
    bounds/finalize avg/max: 0.00 / 0.10 ms
  herb:
    buckets/meshes: 20/20
    instances: 490255 (max 44129)
    allocation/setup avg/max: 0.67 / 1.40 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.01 / 0.10 ms
  filler:
    buckets/meshes: 20/20
    instances: 2079216 (max 184184)
    allocation/setup avg/max: 2.85 / 7.10 ms
    instanceMatrix bind avg/max: 0.00 / 0.00 ms
    bounds/finalize avg/max: 0.00 / 0.10 ms

---

[Seedvale Program Census]

Programs created: 109
Program count: final=107 max=109

By frame:
  frame 0   +38 programs   <== largest transition
  frame 1   +4 programs
  frame 2   +4 programs
  frame 63   +1 program
  frame 70   +8 programs
  frame 78   +8 programs
  frame 86   +4 programs
  frame 94   +3 programs
  frame 117   +1 program
  frame 131   +1 program
  frame 173   +2 programs
  frame 174   +1 program
  frame 253   +1 program
  frame 1081   +13 programs
  frame 1105   +4 programs
  frame 1241   +16 programs

Largest transition — frame 0 (+38 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=f75e027a-510d-466c-b1c8-e26eced523ad (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=89dc42b5-685b-4acb-b583-59639a779765
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=a1daa357 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=8d201395-0f4f-4d19-953f-cfbe7ec73b1d
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=mirror-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=210c438c-0a5e-4b14-beb7-3c99c12eea81
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=2cf9fa62 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=c256d055-8a9b-4f28-8580-3e7008031382
  #5 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=ae169224 fHash=9b2a34e4 stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=81a2f4af-1fa6-4845-a48f-88d674e25cee
  #6 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=611d99e6-9dad-4ab6-988d-93802d52ccfc
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=33c10be0-c55b-452a-a209-5aed575ef2a9
  #8 type=MeshStandardMaterial name='Wood' bucket=other cacheKey=physical,STANDARD,,highp… vHash=d38f15a4 fHash=6578c10d stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=b23f9411-9909-4913-90bc-455a43670bf6 (Wood)
  #9 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=5b43c776 fHash=70b71dad stage=mirror-render
  #10 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=mirror-render
  #11 type=MeshBasicMaterial name='' cacheKey=basic,highp,srgb-linear,… vHash=d459e49b fHash=a8a9bac3 stage=mirror-render
  #12 type=MeshBasicMaterial name='' bucket=other cacheKey=basic,highp,srgb-linear,… vHash=b6911298 fHash=73a25d1e stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"true","normalMap":"false","envMap":"false"}
      material=7d39e3b6-15ab-4fdd-b5ee-f5e873ed6ea0
  #13 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=54e03756 fHash=d391c52 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=d281cefe-7f3d-4681-a594-1e9dce451edb (Main)
  #14 type=MeshStandardMaterial name='Material.001' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=a99aa494 fHash=63f9c0d1 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=2b416a86-efbb-4a7d-bd3a-ca6409b086df (Material.001)
  #15 type=MeshStandardMaterial name='lambert2SG' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=7bb77142 fHash=87728b15 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=4ab40931-82fe-4cac-822c-f9800a695692 (lambert2SG)
  #16 type=MeshPhysicalMaterial name='Material #55' bucket=fauna cacheKey=physical,STANDARD,,PHYSI… vHash=a344732e fHash=16869b56 stage=mirror-render
      defines={"STANDARD":"","PHYSICAL":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=a9325ee7-f24d-4ffd-bd5b-adbd185062c2 (Material #55)
  #17 type=MeshStandardMaterial name='Black' bucket=other cacheKey=physical,STANDARD,,highp… vHash=deee2625 fHash=497d8e73 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=0c3efcf7-064f-4168-b28d-8578d6ae648b (Black)
  #18 type=MeshStandardMaterial name='Green' bucket=other cacheKey=physical,STANDARD,,highp… vHash=589b45c0 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=0bd2b693-ff8c-426d-ba2e-29d793b12bea (Green)
  #19 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=76538ae1 fHash=a61fc7cc stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=5c24cd6a-b9d9-4350-8c0d-11d43832151f
  #20 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=279cec18 fHash=4d6bcede stage=postprocess-render
  #21 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=84736a68 fHash=ffecb62a stage=postprocess-render
  #22 type=ShaderMaterial name='' cacheKey=16,17,highp,srgb-linear,… vHash=aa2edbee fHash=76ced00a stage=postprocess-render
  #23 type=ShaderMaterial name='' cacheKey=18,19,highp,srgb-linear,… vHash=7bae0bb2 fHash=fb55b3c0 stage=postprocess-render
  #24 type=ShaderMaterial name='' cacheKey=20,21,highp,srgb-linear,… vHash=436caea4 fHash=2d687ef1 stage=postprocess-render
  #25 type=ShaderMaterial name='' cacheKey=22,23,SMAA_THRESHOLD,0.1… vHash=886438e7 fHash=dc2a89b5 stage=postprocess-render
  #26 type=ShaderMaterial name='' cacheKey=24,25,SMAA_MAX_SEARCH_ST… vHash=d99a5b29 fHash=109e33fc stage=postprocess-render
  #27 type=ShaderMaterial name='' cacheKey=26,27,highp,srgb-linear,… vHash=2003ced8 fHash=db0f470a stage=postprocess-render
  #28 type=ShaderMaterial name='' cacheKey=28,29,highp,srgb-linear,… vHash=28dfa407 fHash=9775cd0e stage=postprocess-render
  #29 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,6,hi… vHash=756a0b19 fHash=5c741650 stage=postprocess-render
  #30 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,10,h… vHash=b2354ff2 fHash=2aad9943 stage=postprocess-render
  #31 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,14,h… vHash=ea82969e fHash=a2297d9f stage=postprocess-render
  #32 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,18,h… vHash=7dab8d9a fHash=1022767b stage=postprocess-render
  #33 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,22,h… vHash=378e1fb7 fHash=ce0bf6b4 stage=postprocess-render
  #34 type=ShaderMaterial name='' cacheKey=30,32,NUM_MIPS,5,highp,s… vHash=78acf7ea fHash=707f290c stage=postprocess-render
  #35 type=ShaderMaterial name='' cacheKey=33,34,highp,srgb-linear,… vHash=a312c579 fHash=c05e2256 stage=postprocess-render
  #36 type=ShaderMaterial name='GodRaysShader' cacheKey=35,36,highp,srgb-linear,… vHash=b817515d fHash=ccc98549 stage=postprocess-render
  #37 type=RawShaderMaterial name='OutputShader' cacheKey=37,38,SRGB_TRANSFER,,ACE… vHash=5d2c950f fHash=c1247d7 stage=postprocess-render

Differences within frame 0 (grouped by material type):
  ShaderMaterial (24 programs):
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=ae169224, #6=e6d01ae7, #9=5b43c776, #20=279cec18, #21=84736a68, #22=aa2edbee, #23=7bae0bb2, #24=436caea4, #25=886438e7, #26=d99a5b29, #27=2003ced8, #28=28dfa407, #29=756a0b19, #30=b2354ff2, #31=ea82969e, #32=7dab8d9a, #33=378e1fb7, #34=78acf7ea, #35=a312c579, #36=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=2cf9fa62, #5=9b2a34e4, #6=e34491ff, #9=70b71dad, #20=4d6bcede, #21=ffecb62a, #22=76ced00a, #23=fb55b3c0, #24=2d687ef1, #25=dc2a89b5, #26=109e33fc, #27=db0f470a, #28=9775cd0e, #29=5c741650, #30=2aad9943, #31=a2297d9f, #32=1022767b, #33=ce0bf6b4, #34=707f290c, #35=c05e2256, #36=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=grass, #6=water, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #9=(unset), #20=(unset), #21=(unset), #22=(unset), #23=(unset), #24=(unset), #25=(unset), #26=(unset), #27=(unset), #28=(unset), #29=(unset), #30=(unset), #31=(unset), #32=(unset), #33=(unset), #34=(unset), #35=(unset), #36=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=false, #6=true, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
  MeshStandardMaterial (9 programs):
    vertexShaderHash differs: #2=5c2c57a3, #7=e3408c64, #8=d38f15a4, #13=54e03756, #14=a99aa494, #15=7bb77142, #17=deee2625, #18=589b45c0, #19=76538ae1
    fragmentShaderHash differs: #2=a1daa357, #7=c0b8fc9f, #8=6578c10d, #13=d391c52, #14=63f9c0d1, #15=87728b15, #17=497d8e73, #18=a81023c3, #19=a61fc7cc
    bucket differs: #2=terrain, #7=other, #8=other, #13=fauna, #14=fauna, #15=fauna, #17=other, #18=other, #19=other
    flag flatShading differs: #2=false, #7=true, #8=false, #13=false, #14=false, #15=false, #17=false, #18=false, #19=true
    flag fog differs: #2=true, #7=true, #8=true, #13=true, #14=true, #15=true, #17=true, #18=true, #19=false
    flag map differs: #2=false, #7=false, #8=false, #13=false, #14=false, #15=true, #17=false, #18=false, #19=false
    flag normalMap differs: #2=true, #7=false, #8=false, #13=false, #14=false, #15=false, #17=false, #18=false, #19=false
    flag vertexColors differs: #2=true, #7=false, #8=false, #13=false, #14=false, #15=false, #17=false, #18=false, #19=false
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



Frame 1081 (+13):
  Program #76
    material: MeshStandardMaterial ''
    materialUuid: 8d201395-0f4f-4d19-953f-cfbe7ec73b1d
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 89831d77
  Program #77
    material: MeshStandardMaterial 'Wood'
    materialUuid: 118419cb-5e59-499c-983b-fdc7ff754ddc
    object: Mesh 'mesh_0'
    asset: /models/settlement/crate.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 320d0e37
    fragmentShaderHash: 65cafcc2
  Program #78
    material: MeshStandardMaterial 'Green'
    materialUuid: eb3e8377-4b53-443a-970c-d13872ada9c9
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
    materialUuid: 050aa9d2-98f3-4f4b-902b-f90db47db88d
    object: Mesh 'Barrel_1'
    asset: /models/settlement/barrel.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ca65e7f6
    fragmentShaderHash: ed8c9b61
  Program #80
    material: MeshStandardMaterial 'BirchTree_Bark'
    materialUuid: fdbafcce-0a7c-40fd-a462-3fabfa2c5ab7
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a920e788
    fragmentShaderHash: 3c40f72c
  Program #81
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: fc8ced4e-3878-4bf1-a27f-29251302b650
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
    materialUuid: bcffdfdc-7950-4405-8658-f646bee2ae14
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #83
    material: MeshStandardMaterial 'Leaves'
    materialUuid: a7ed3ebe-69ed-40da-9350-c8d0db94fba0
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
  Program #84
    material: MeshStandardMaterial 'Brown'
    materialUuid: fba88d1a-d0fb-4be0-83ea-0e4d9b679c75
    object: SkinnedMesh 'mesh_1_1'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 27e30ee8
    fragmentShaderHash: 731f1f78
  Program #85
    material: MeshStandardMaterial 'Green'
    materialUuid: 0bd2b693-ff8c-426d-ba2e-29d793b12bea
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
    materialUuid: f03f6728-fcaf-409d-8275-a96cd22133cc
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
    materialUuid: e180862f-c5f5-45c9-a644-0f0df949e815
    object: Mesh 'house-static-batch:20'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8388611,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5f2e9b54
    fragmentShaderHash: 372a363a

Frame 1241 (+16):
  Program #93
    material: ShaderMaterial 'SkyShader'
    materialUuid: f75e027a-510d-466c-b1c8-e26eced523ad
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #94
    material: ShaderMaterial ''
    materialUuid: 81a2f4af-1fa6-4845-a48f-88d674e25cee
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: ae169224
    fragmentShaderHash: 8c624cc7
  Program #95
    material: MeshStandardMaterial ''
    materialUuid: 8d201395-0f4f-4d19-953f-cfbe7ec73b1d
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: 6b931360
  Program #96
    material: MeshStandardMaterial 'Wood'
    materialUuid: 118419cb-5e59-499c-983b-fdc7ff754ddc
    object: Mesh 'mesh_0'
    asset: /models/settlement/crate.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5cee842b
    fragmentShaderHash: 1683d5db
  Program #97
    material: MeshStandardMaterial 'Green'
    materialUuid: eb3e8377-4b53-443a-970c-d13872ada9c9
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
    materialUuid: 050aa9d2-98f3-4f4b-902b-f90db47db88d
    object: Mesh 'Barrel_1'
    asset: /models/settlement/barrel.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3e42e9c4
    fragmentShaderHash: d48c36b2
  Program #99
    material: MeshStandardMaterial 'BirchTree_Bark'
    materialUuid: fdbafcce-0a7c-40fd-a462-3fabfa2c5ab7
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a282481e
    fragmentShaderHash: 21c5c77d
  Program #100
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: fc8ced4e-3878-4bf1-a27f-29251302b650
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
    materialUuid: bcffdfdc-7950-4405-8658-f646bee2ae14
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #102
    material: MeshStandardMaterial 'Leaves'
    materialUuid: a7ed3ebe-69ed-40da-9350-c8d0db94fba0
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
  Program #103
    material: MeshStandardMaterial 'Black'
    materialUuid: 0c3efcf7-064f-4168-b28d-8578d6ae648b
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: deee2625
    fragmentShaderHash: da938326
  Program #104
    material: MeshStandardMaterial 'Green'
    materialUuid: 0bd2b693-ff8c-426d-ba2e-29d793b12bea
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
    materialUuid: 611d99e6-9dad-4ab6-988d-93802d52ccfc
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
    materialUuid: 16cf2210-3125-45e5-b1c4-a889c04394fd
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
  Program #108
    material: ShaderMaterial ''
    materialUuid: 20ad5a99-6cf2-4d1b-b6f6-ba10509bcd3b
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
Excluded — no reliable per-program timing: 104 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 63
  #46
      material: MeshStandardMaterial 'None'
      object: Mesh 'mesh_0'
      asset: /models/nature/cemetery.glb
      compile/link: 15.2 ms  (upper bound — whole postprocess-render call, see note above)

Frame 117
  #70
      material: MeshStandardMaterial 'Pond_Pack_MAT'
      object: Mesh 'Branch_2b'
      asset: /models/items/branch.glb
      compile/link: 22.1 ms  (upper bound — whole postprocess-render call, see note above)

Frame 131
  #71
      material: MeshStandardMaterial 'BirchTree_Bark'
      object: Mesh 'mesh_0'
      asset: /models/nature/birch_1.glb
      compile/link: 13.9 ms  (upper bound — whole mirror-render call, see note above)

Frame 174
  #74
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 33.5 ms  (upper bound — whole postprocess-render call, see note above)

Frame 253
  #75
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 13.3 ms  (upper bound — whole postprocess-render call, see note above)

Summary:
  total measured compile/link time: 98.0 ms
  programs >1 ms: 5
  max: 33.5 ms (#74)

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=7.4 ms  p95=8.9 ms  max=9.0 ms  Δavg vs baseline=—
  hide-grass           avg=7.2 ms  p95=9.4 ms  max=11.1 ms  Δavg vs baseline=-0.2 ms (-3%)
  hide-vegetation      avg=7.0 ms  p95=9.1 ms  max=9.1 ms  Δavg vs baseline=-0.4 ms (-6%)
  no vegetation/grass  avg=6.2 ms  p95=8.0 ms  max=9.4 ms  Δavg vs baseline=-1.2 ms (-17%)
  hide-environment     avg=7.3 ms  p95=9.4 ms  max=9.7 ms  Δavg vs baseline=-0.2 ms (-2%)
  hide-settlement      avg=9.6 ms  p95=12.7 ms  max=12.8 ms  Δavg vs baseline=+2.2 ms (+29%)
  no water             avg=6.8 ms  p95=8.6 ms  max=10.6 ms  Δavg vs baseline=-0.6 ms (-8%)
  hide-terrain         avg=10.0 ms  p95=11.7 ms  max=12.1 ms  Δavg vs baseline=+2.6 ms (+35%)
  hide-npc-fauna       avg=8.1 ms  p95=11.1 ms  max=12.9 ms  Δavg vs baseline=+0.6 ms (+9%)
  no-shadows           avg=7.6 ms  p95=9.9 ms  max=10.1 ms  Δavg vs baseline=+0.2 ms (+3%)
  no-ao                avg=8.6 ms  p95=14.4 ms  max=14.7 ms  Δavg vs baseline=+1.2 ms (+16%)
  no-bloom             avg=8.6 ms  p95=11.0 ms  max=11.0 ms  Δavg vs baseline=+1.2 ms (+16%)
  no-smaa              avg=6.9 ms  p95=9.3 ms  max=9.9 ms  Δavg vs baseline=-0.6 ms (-8%)
  no-god-rays          avg=9.0 ms  p95=14.3 ms  max=15.7 ms  Δavg vs baseline=+1.6 ms (+21%)
  no-film-grade        avg=9.6 ms  p95=13.6 ms  max=13.9 ms  Δavg vs baseline=+2.2 ms (+29%)
  no postprocessing    avg=6.1 ms  p95=7.4 ms  max=7.8 ms  Δavg vs baseline=-1.4 ms (-18%)
  no mirrors           avg=7.1 ms  p95=9.5 ms  max=10.2 ms  Δavg vs baseline=-0.4 ms (-5%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (21 samples resolved during the baseline window)
  GPU elapsed   avg=22.5 ms  p95=26.1 ms  max=26.3 ms
  CPU wall      avg=7.4 ms  p95=8.9 ms  max=9.0 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

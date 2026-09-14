# Seedvale Performance Benchmark Report

> Generated: 2026-09-14T10:49:30.262Z
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
  avg: 24.9
  min: 4
  p1: 9

Frame time:
  avg: 40.2 ms
  p95: 79.6 ms
  max: 251.8 ms

Rendering:
  draw calls: 585 avg / 1504 max
  triangles: 10.06M avg
  mirror draws: 106 avg
  geometries: 655
  textures: 496

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
  other          draws=198 tris=23.7k meshes=198 inst=198

Systems:
  TERRAIN        0.8 ms
  WATER          3.1 ms
  NPC            7.0 ms
  FAUNA          9.0 ms
  PHYSICS        0.1 ms
  RENDER         14.8 ms

Detected bottlenecks:
  1. RENDER
  2. FAUNA
  3. NPC

Critical spikes:
  GRASS: 16
  STREAMING: 5
  WATER: 3

Hitches (>= 8 ms):
  grass generation       n=16 avg=20.4 max=33.3
  chunk mesh             n=5 avg=11.2 max=13.9
  chunk water            n=3 avg=10.8 max=13.8

Isolation probes:
  full               render=15.4 ms draws=285 tris=6.65M
  hide-grass         render=15.2 ms draws=248 tris=5.47M
  hide-vegetation    render=7.5 ms draws=166 tris=4.45M
  hide-vegetation-grass render=7.4 ms draws=132 tris=3.33M
  hide-environment   render=10.6 ms draws=267 tris=6.50M
  hide-settlement    render=9.9 ms draws=271 tris=6.71M
  hide-water         render=9.5 ms draws=272 tris=5.68M
  hide-terrain       render=11.6 ms draws=247 tris=4.14M
  hide-npc-fauna     render=7.8 ms draws=284 tris=6.57M
  no-shadows         render=9.4 ms draws=284 tris=6.47M
  no-ao              render=7.2 ms draws=273 tris=6.50M
  no-bloom           render=7.9 ms draws=284 tris=6.88M
  no-smaa            render=8.4 ms draws=290 tris=6.73M
  no-god-rays        render=8.1 ms draws=284 tris=6.57M
  no-film-grade      render=7.3 ms draws=295 tris=6.81M
  no-postprocessing  render=8.5 ms draws=256 tris=6.49M
  no-reflections     render=8.6 ms draws=210 tris=5.48M

Frame attribution:
  frame max: 251.8 ms
  largest labelled hitch: 33.3 ms
  unattributed: 218.5 ms

Recommendation:
Largest frame (251.8 ms) is not explained by labelled hitches (largest 33.3 ms) — unattributed frame spike, not a category bottleneck.

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 28

NPC:
  total: 7.0 ms/frame
  crowd pass: 0.0 ms/frame (5.5 ms cumulative)
  agent updates: 1.2 ms/frame (701.6 ms cumulative)
  livestock: 4.0 ms/frame (2321.4 ms cumulative)
  rats: 1.3 ms/frame (768.5 ms cumulative)
  social: 0.0 ms/frame (5.3 ms cumulative)
  streaming: 0.3 ms/frame (149.5 ms cumulative)
  maintenance: 0.2 ms/frame (91.0 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 9.0 ms/frame
  agent updates: 8.9 ms/frame (5187.8 ms cumulative)
  forest sampling: 0.2 ms/frame (93.0 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.1 ms/frame (51.3 ms cumulative)
    targeting: 0.1 ms/frame (29.9 ms cumulative)
    decision: 0.1 ms/frame (35.4 ms cumulative)
    behaviour: 4.9 ms/frame (2882.3 ms cumulative)
    life/presentation: 8.5 ms/frame (4969.1 ms cumulative)

  adaptive candidates:
    agent updates/frame: 37.1
    sensing passes/frame: 36.0
    decision passes/frame: 36.0
    high-priority agents/frame: 0.7
    expensive behaviour agents/frame: 35.3

  sensing/cache:
    forest samples/frame: 24.3
    fire scan candidates/frame: 22.8
    village scan candidates/frame: 262.0
    player perception checks/frame: 36.0

  nearest scans: 47.1/frame (27436 calls)
  nearest candidates checked: 446.6/frame (260350 total)
  herd leader scans: 0.2/frame (96 calls)
  herd candidates checked: 4.6/frame (2688 total)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 28

NPC:
  total: 7.0 ms/frame
  crowd pass: 0.0 ms/frame (5.5 ms cumulative)
  agent updates: 1.2 ms/frame (701.6 ms cumulative)
  livestock: 4.0 ms/frame (2321.4 ms cumulative)
  rats: 1.3 ms/frame (768.5 ms cumulative)
  social: 0.0 ms/frame (5.3 ms cumulative)
  streaming: 0.3 ms/frame (149.5 ms cumulative)
  maintenance: 0.2 ms/frame (91.0 ms cumulative)
  unattributed: 0.1 ms/frame

FAUNA:
  total: 9.0 ms/frame
  agent updates: 8.9 ms/frame (5187.8 ms cumulative)
  forest sampling: 0.2 ms/frame (93.0 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame

  AnimalAgent sections:
    sensing: 0.1 ms/frame (51.3 ms cumulative)
    targeting: 0.1 ms/frame (29.9 ms cumulative)
    decision: 0.1 ms/frame (35.4 ms cumulative)
    behaviour: 4.9 ms/frame (2882.3 ms cumulative)
    life/presentation: 8.5 ms/frame (4969.1 ms cumulative)

  adaptive candidates:
    agent updates/frame: 37.1
    sensing passes/frame: 36.0
    decision passes/frame: 36.0
    high-priority agents/frame: 0.7
    expensive behaviour agents/frame: 35.3

  sensing/cache:
    forest samples/frame: 24.3
    fire scan candidates/frame: 22.8
    village scan candidates/frame: 262.0
    player perception checks/frame: 36.0

  nearest scans: 47.1/frame (27436 calls)
  nearest candidates checked: 446.6/frame (260350 total)
  herd leader scans: 0.2/frame (96 calls)
  herd candidates checked: 4.6/frame (2688 total)

---

[Seedvale Grass Finalization]

Grass finalization:
  chunks: 26
  empty builds: 21
  discarded unloaded/out-of-range: 0/0

  build total (`buildGrassChunkMeshes`):
    avg 14.96 ms
    max 33.30 ms

  allocation/setup:
    avg 4.72 ms
    max 13.20 ms
  instanceMatrix bind:
    avg 0.03 ms
    max 0.20 ms
  bounds/finalize (`computeBoundingSphere`):
    avg 10.12 ms
    max 23.00 ms
  lod apply (`setLodFraction` / `setGeometryLod`):
    avg 0.12 ms
    max 0.50 ms
  scene attach (`scene.add`):
    avg 0.04 ms
    max 0.20 ms
  callback total (build + lod + attach):
    avg 8.73 ms
    max 36.00 ms

  per chunk:
    instances avg/max 140988.5 / 271541
    meshes avg/max 4.00 / 4
    geometries avg/max 4.00 / 4
    geometries after lod apply avg/max 7.00 / 7
    instances full/filler: 1178070 / 2487631
    matrix instances bound: 3665701
    instanced attributes created: 520
    shared material refs: 104
  heap delta avg/max: 0.0 / 0.0 KB

  by species bucket:
  tri:
    buckets/meshes: 26/26
    instances: 441935 (max 32465)
    allocation/setup avg/max: 0.60 / 3.30 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 1.18 / 2.80 ms
  grain:
    buckets/meshes: 26/26
    instances: 147464 (max 10763)
    allocation/setup avg/max: 0.35 / 1.90 ms
    instanceMatrix bind avg/max: 0.00 / 0.10 ms
    bounds/finalize avg/max: 0.40 / 0.90 ms
  herb:
    buckets/meshes: 26/26
    instances: 588671 (max 44129)
    allocation/setup avg/max: 0.70 / 1.90 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 1.62 / 3.70 ms
  filler:
    buckets/meshes: 26/26
    instances: 2487631 (max 184184)
    allocation/setup avg/max: 3.07 / 9.40 ms
    instanceMatrix bind avg/max: 0.01 / 0.10 ms
    bounds/finalize avg/max: 6.91 / 17.00 ms

---

[Seedvale Program Census]

Programs created: 108
Program count: final=106 max=107

By frame:
  frame 0   +38 programs   <== largest transition
  frame 1   +8 programs
  frame 2   +1 program
  frame 12   +4 programs
  frame 13   +8 programs
  frame 23   +3 programs
  frame 33   +3 programs
  frame 72   +1 program
  frame 106   +1 program
  frame 108   +1 program
  frame 114   +1 program
  frame 116   +1 program
  frame 126   +4 programs
  frame 809   +10 programs
  frame 810   +3 programs
  frame 831   +4 programs
  frame 962   +16 programs
  frame 1011   +1 program

Largest transition — frame 0 (+38 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=88194831-775b-4a37-a5a3-cb526396cdd6 (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=0b4e0666-0d46-4a60-897e-83f4f9f49bab
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=a1daa357 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=4169c362-c278-4efb-8b22-dff9683b96a0
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=mirror-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=fde89529-3abe-497f-bdaa-d3d444075d78
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=2cf9fa62 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=c602e4da-a189-40dc-a934-1a55fcd4396d
  #5 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=ace5e075-4218-43d9-82b6-b7baa77e24c8
  #6 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=ae169224 fHash=9b2a34e4 stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=e2b087a3-020c-4133-a4ae-890566feb9d0
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=f4f989d2-d041-4189-8d6c-e51f7f8bb7ed
  #8 type=MeshStandardMaterial name='Wood' bucket=other cacheKey=physical,STANDARD,,highp… vHash=d38f15a4 fHash=6578c10d stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=405f2344-56e1-4eeb-b466-f8479e6b89b0 (Wood)
  #9 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=5b43c776 fHash=70b71dad stage=mirror-render
  #10 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=mirror-render
  #11 type=MeshBasicMaterial name='' cacheKey=basic,highp,srgb-linear,… vHash=d459e49b fHash=a8a9bac3 stage=mirror-render
  #12 type=MeshBasicMaterial name='' bucket=other cacheKey=basic,highp,srgb-linear,… vHash=b6911298 fHash=73a25d1e stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"true","normalMap":"false","envMap":"false"}
      material=00398b29-fc38-4876-9d31-21cdf3f83edc
  #13 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=54e03756 fHash=d391c52 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=390bcbf0-0d5b-4dff-9754-e171bbb3dcea (Main)
  #14 type=MeshStandardMaterial name='Material.001' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=a99aa494 fHash=63f9c0d1 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=ee770f67-1309-423f-a2b8-21e199da7653 (Material.001)
  #15 type=MeshStandardMaterial name='lambert2SG' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=7bb77142 fHash=87728b15 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=097e00f0-0e3f-40ad-9cc0-aeb837de1692 (lambert2SG)
  #16 type=MeshPhysicalMaterial name='Material #55' bucket=fauna cacheKey=physical,STANDARD,,PHYSI… vHash=a344732e fHash=16869b56 stage=mirror-render
      defines={"STANDARD":"","PHYSICAL":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=3af990fd-9fd9-42f1-984f-bb529c80ee10 (Material #55)
  #17 type=MeshStandardMaterial name='Black' bucket=other cacheKey=physical,STANDARD,,highp… vHash=deee2625 fHash=497d8e73 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=1fd72549-38e8-471c-8083-7e636cd50973 (Black)
  #18 type=MeshStandardMaterial name='Green' bucket=other cacheKey=physical,STANDARD,,highp… vHash=589b45c0 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=c01930f8-2806-4bac-b314-1c559740ddbb (Green)
  #19 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=76538ae1 fHash=a61fc7cc stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=e08d2eda-768f-4644-81fa-55793c3b887a
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
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=e6d01ae7, #6=ae169224, #9=5b43c776, #20=279cec18, #21=84736a68, #22=aa2edbee, #23=7bae0bb2, #24=436caea4, #25=886438e7, #26=d99a5b29, #27=2003ced8, #28=28dfa407, #29=756a0b19, #30=b2354ff2, #31=ea82969e, #32=7dab8d9a, #33=378e1fb7, #34=78acf7ea, #35=a312c579, #36=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=2cf9fa62, #5=e34491ff, #6=9b2a34e4, #9=70b71dad, #20=4d6bcede, #21=ffecb62a, #22=76ced00a, #23=fb55b3c0, #24=2d687ef1, #25=dc2a89b5, #26=109e33fc, #27=db0f470a, #28=9775cd0e, #29=5c741650, #30=2aad9943, #31=a2297d9f, #32=1022767b, #33=ce0bf6b4, #34=707f290c, #35=c05e2256, #36=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=water, #6=grass, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #9=(unset), #20=(unset), #21=(unset), #22=(unset), #23=(unset), #24=(unset), #25=(unset), #26=(unset), #27=(unset), #28=(unset), #29=(unset), #30=(unset), #31=(unset), #32=(unset), #33=(unset), #34=(unset), #35=(unset), #36=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=false, #9=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown), #35=(unknown), #36=(unknown)
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



Frame 809 (+10):
  Program #74
    material: MeshStandardMaterial ''
    materialUuid: 4169c362-c278-4efb-8b22-dff9683b96a0
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 89831d77
  Program #75
    material: MeshStandardMaterial 'Wood'
    materialUuid: 39c3358b-8bd2-48a3-95c4-e0b804a47c5b
    object: Mesh 'chunk-environment-region-1,0|fallenLog-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 320d0e37
    fragmentShaderHash: 65cafcc2
  Program #76
    material: MeshStandardMaterial 'Green'
    materialUuid: 9ba1f98e-17e7-48dc-a9a9-9cfec6a4fd96
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
  Program #77
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 8349c419-c76e-4445-9bc6-86dfb6e8b077
    object: Mesh 'chunk-vegetation-region-1,0|reed-1:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ca65e7f6
    fragmentShaderHash: ed8c9b61
  Program #78
    material: MeshStandardMaterial 'NormalTree_Bark'
    materialUuid: a2e4ab48-c021-438b-b72a-cfd8e9d53957
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 1bd8d9e3
    fragmentShaderHash: e2f189d1
  Program #79
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: e28a21b8-a70a-4cbb-a6dc-346d90237145
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
  Program #80
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: 866dbbb7-8300-47ec-b9b2-aa78b367504e
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #81
    material: MeshStandardMaterial 'Leaves'
    materialUuid: b0ecf3cb-d39b-4513-a9da-7cdf8fe6e0e2
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
  Program #82
    material: MeshStandardMaterial 'Black'
    materialUuid: 1fd72549-38e8-471c-8083-7e636cd50973
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ee36271
    fragmentShaderHash: ab5efdc5
  Program #83
    material: MeshStandardMaterial 'Green'
    materialUuid: c01930f8-2806-4bac-b314-1c559740ddbb
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

Frame 962 (+16):
  Program #91
    material: ShaderMaterial 'SkyShader'
    materialUuid: 88194831-775b-4a37-a5a3-cb526396cdd6
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #92
    material: ShaderMaterial ''
    materialUuid: e2b087a3-020c-4133-a4ae-890566feb9d0
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: ae169224
    fragmentShaderHash: 8c624cc7
  Program #93
    material: MeshStandardMaterial ''
    materialUuid: 4169c362-c278-4efb-8b22-dff9683b96a0
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: 6b931360
  Program #94
    material: MeshStandardMaterial 'Wood'
    materialUuid: 39c3358b-8bd2-48a3-95c4-e0b804a47c5b
    object: Mesh 'chunk-environment-region-1,0|fallenLog-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5cee842b
    fragmentShaderHash: 1683d5db
  Program #95
    material: MeshStandardMaterial 'Green'
    materialUuid: 9ba1f98e-17e7-48dc-a9a9-9cfec6a4fd96
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
  Program #96
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 8349c419-c76e-4445-9bc6-86dfb6e8b077
    object: Mesh 'chunk-vegetation-region-1,0|reed-1:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3e42e9c4
    fragmentShaderHash: d48c36b2
  Program #97
    material: MeshStandardMaterial 'NormalTree_Bark'
    materialUuid: a2e4ab48-c021-438b-b72a-cfd8e9d53957
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ab1dd48f
    fragmentShaderHash: 8661e8c2
  Program #98
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: e28a21b8-a70a-4cbb-a6dc-346d90237145
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
  Program #99
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: 866dbbb7-8300-47ec-b9b2-aa78b367504e
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #100
    material: MeshStandardMaterial 'Leaves'
    materialUuid: b0ecf3cb-d39b-4513-a9da-7cdf8fe6e0e2
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
  Program #101
    material: MeshStandardMaterial 'Black'
    materialUuid: 1fd72549-38e8-471c-8083-7e636cd50973
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: deee2625
    fragmentShaderHash: da938326
  Program #102
    material: MeshStandardMaterial 'Green'
    materialUuid: c01930f8-2806-4bac-b314-1c559740ddbb
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
  Program #103
    material: ShaderMaterial ''
    materialUuid: ace5e075-4218-43d9-82b6-b7baa77e24c8
    object: Mesh 'ocean'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: e6d01ae7
    fragmentShaderHash: 215382b6
  Program #104
    material: ShaderMaterial ''
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 10,11,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,0,8389635,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 5b43c776
    fragmentShaderHash: 34e03bb0
  Program #105
    material: ShaderMaterial ''
    materialUuid: f28315b2-68d5-4ddc-afbb-f4384f528089
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
  Program #106
    material: ShaderMaterial ''
    materialUuid: 9c6316cb-79a9-435f-85a3-b24202c857a4
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
Excluded — no reliable per-program timing: 100 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 2
  #46
      material: MeshStandardMaterial 'Pink'
      object: Mesh 'chunk-vegetation-region-0,-2|cactus-1:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 31.5 ms  (upper bound — whole mirror-render call, see note above)

Frame 72
  #65
      material: MeshStandardMaterial 'BirchTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-3:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 35.1 ms  (upper bound — whole mirror-render call, see note above)

Frame 106
  #66
      material: MeshStandardMaterial 'Pond_Pack_MAT'
      object: Mesh 'Branch_2b'
      asset: /models/items/branch.glb
      compile/link: 69.6 ms  (upper bound — whole postprocess-render call, see note above)

Frame 108
  #67
      material: MeshStandardMaterial 'Green'
      object: Mesh 'chunk-vegetation-region-1,-1|tree-living-1:1'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 18.1 ms  (upper bound — whole mirror-render call, see note above)

Frame 114
  #68
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 22.0 ms  (upper bound — whole mirror-render call, see note above)

Frame 116
  #69
      material: MeshStandardMaterial 'PineTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-6:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 17.6 ms  (upper bound — whole mirror-render call, see note above)

Frame 126
  #73
      material: MeshStandardMaterial 'LimeGreen'
      object: SkinnedMesh 'mesh_1'
      asset: /models/characters/Female_Formal.glb
      foliage-wind-v3
      compile/link: 141.7 ms  (upper bound — whole postprocess-render call, see note above)

Frame 1011
  #107
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 36.7 ms  (upper bound — whole postprocess-render call, see note above)

Summary:
  total measured compile/link time: 372.3 ms
  programs >1 ms: 8
  max: 141.7 ms (#73)

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=15.4 ms  p95=23.7 ms  max=27.1 ms  Δavg vs baseline=—
  hide-grass           avg=15.2 ms  p95=24.4 ms  max=27.3 ms  Δavg vs baseline=-0.2 ms (-1%)
  hide-vegetation      avg=7.5 ms  p95=9.8 ms  max=10.9 ms  Δavg vs baseline=-7.9 ms (-51%)
  no vegetation/grass  avg=7.4 ms  p95=9.2 ms  max=10.6 ms  Δavg vs baseline=-7.9 ms (-52%)
  hide-environment     avg=10.6 ms  p95=14.0 ms  max=14.6 ms  Δavg vs baseline=-4.7 ms (-31%)
  hide-settlement      avg=9.9 ms  p95=13.6 ms  max=13.9 ms  Δavg vs baseline=-5.5 ms (-36%)
  no water             avg=9.5 ms  p95=12.6 ms  max=14.0 ms  Δavg vs baseline=-5.9 ms (-38%)
  hide-terrain         avg=11.6 ms  p95=16.5 ms  max=16.9 ms  Δavg vs baseline=-3.8 ms (-24%)
  hide-npc-fauna       avg=7.8 ms  p95=9.0 ms  max=9.2 ms  Δavg vs baseline=-7.6 ms (-49%)
  no-shadows           avg=9.4 ms  p95=14.6 ms  max=14.8 ms  Δavg vs baseline=-6.0 ms (-39%)
  no-ao                avg=7.2 ms  p95=8.6 ms  max=8.7 ms  Δavg vs baseline=-8.2 ms (-53%)
  no-bloom             avg=7.9 ms  p95=9.4 ms  max=10.7 ms  Δavg vs baseline=-7.5 ms (-49%)
  no-smaa              avg=8.4 ms  p95=12.3 ms  max=13.7 ms  Δavg vs baseline=-7.0 ms (-46%)
  no-god-rays          avg=8.1 ms  p95=11.7 ms  max=12.1 ms  Δavg vs baseline=-7.3 ms (-48%)
  no-film-grade        avg=7.3 ms  p95=8.5 ms  max=8.9 ms  Δavg vs baseline=-8.1 ms (-53%)
  no postprocessing    avg=8.5 ms  p95=11.4 ms  max=12.5 ms  Δavg vs baseline=-6.9 ms (-45%)
  no mirrors           avg=8.6 ms  p95=11.4 ms  max=12.7 ms  Δavg vs baseline=-6.8 ms (-44%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (12 samples resolved during the baseline window)
  GPU elapsed   avg=32.7 ms  p95=34.2 ms  max=35.0 ms
  CPU wall      avg=15.4 ms  p95=23.7 ms  max=27.1 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

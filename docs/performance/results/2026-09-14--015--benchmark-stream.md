# Seedvale Performance Benchmark Report

> Generated: 2026-09-14T08:19:07.340Z
> Sections:
> - [Seedvale Benchmark]
> - [Seedvale Agent CPU]
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
  avg: 11.1
  min: 2
  p1: 3

Frame time:
  avg: 90 ms
  p95: 187.5 ms
  max: 423.6 ms

Rendering:
  draw calls: 651 avg / 1280 max
  triangles: 11.34M avg
  mirror draws: 109 avg
  geometries: 642
  textures: 361

Scene (one-pass estimate):
  terrain        draws=60 tris=4.42M meshes=60 inst=60
  grass          draws=60 tris=837.5k meshes=60 inst=98841
  vegetation     draws=98 tris=1.08M meshes=98 inst=603
  environment    draws=15 tris=15.4k meshes=15 inst=32
  settlement     draws=537 tris=593.2k meshes=537 inst=832
  water          draws=42 tris=3.03M meshes=42 inst=42
  npc            draws=95 tris=67.7k meshes=95 inst=95
  fauna          draws=157 tris=66.2k meshes=157 inst=157
  items          draws=137 tris=8.4k meshes=137 inst=137
  other          draws=281 tris=23.8k meshes=281 inst=281

Systems:
  TERRAIN        9.4 ms
  WATER          15.5 ms
  NPC            9.5 ms
  FAUNA          8.9 ms
  PHYSICS        0.1 ms
  RENDER         37.7 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  GRASS: 15

Hitches (>= 8 ms):
  grass generation       n=15 avg=17.5 max=24.4

Isolation probes:
  full               render=17.4 ms draws=226 tris=5.64M
  hide-grass         render=0.0 ms draws=0 tris=0
  hide-vegetation    render=36.0 ms draws=120 tris=3.27M
  hide-vegetation-grass render=12.1 ms draws=168 tris=3.79M
  hide-environment   render=0.0 ms draws=0 tris=0
  hide-settlement    render=0.0 ms draws=0 tris=0
  hide-water         render=13.8 ms draws=335 tris=6.24M
  hide-terrain       render=0.0 ms draws=0 tris=0
  hide-npc-fauna     render=0.0 ms draws=0 tris=0
  no-shadows         render=15.9 ms draws=383 tris=7.24M
  no-ao              render=0.0 ms draws=0 tris=0
  no-bloom           render=14.9 ms draws=370 tris=7.24M
  no-smaa            render=0.0 ms draws=0 tris=0
  no-god-rays        render=0.0 ms draws=0 tris=0
  no-film-grade      render=18.6 ms draws=468 tris=10.16M
  no-postprocessing  render=1377.1 ms draws=197 tris=4.83M
  no-reflections     render=16.6 ms draws=220 tris=4.83M

Frame attribution:
  frame max: 423.6 ms
  largest labelled hitch: 24.4 ms
  unattributed: 399.2 ms

Recommendation:
Largest frame (423.6 ms) is not explained by labelled hitches (largest 24.4 ms) — unattributed frame spike, not a category bottleneck.

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 28

NPC:
  total: 9.5 ms/frame
  crowd pass: 0.0 ms/frame (0.8 ms cumulative)
  agent updates: 1.6 ms/frame (46.8 ms cumulative)
  other (livestock/rats/social/...): 7.8 ms/frame

FAUNA:
  total: 8.9 ms/frame
  agent updates: 8.7 ms/frame (253.4 ms cumulative)
  forest sampling: 0.1 ms/frame (4.2 ms cumulative)
  other (spawners/forage/cleanup/...): 0.2 ms/frame

  AnimalAgent sections:
    sensing: 0.2 ms/frame (5.2 ms cumulative)
    targeting: 0.1 ms/frame (2.8 ms cumulative)
    decision: 0.1 ms/frame (3.4 ms cumulative)
    behaviour: 5.0 ms/frame (144.2 ms cumulative)
    life/presentation: 7.4 ms/frame (213.9 ms cumulative)

  adaptive candidates:
    agent updates/frame: 33.2
    sensing passes/frame: 33.2
    decision passes/frame: 33.2
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 33.2

  sensing/cache:
    forest samples/frame: 20.3
    fire scan candidates/frame: 26.2
    village scan candidates/frame: 196.5
    player perception checks/frame: 33.2

  nearest scans: 42.7/frame (1239 calls)
  nearest candidates checked: 381.2/frame (11056 total)
  herd leader scans: 0.0/frame (0 calls)
  herd candidates checked: 0.0/frame (0 total)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 19
  Fauna (agents): 28

NPC:
  total: 9.5 ms/frame
  crowd pass: 0.0 ms/frame (0.8 ms cumulative)
  agent updates: 1.6 ms/frame (46.8 ms cumulative)
  other (livestock/rats/social/...): 7.8 ms/frame

FAUNA:
  total: 8.9 ms/frame
  agent updates: 8.7 ms/frame (253.4 ms cumulative)
  forest sampling: 0.1 ms/frame (4.2 ms cumulative)
  other (spawners/forage/cleanup/...): 0.2 ms/frame

  AnimalAgent sections:
    sensing: 0.2 ms/frame (5.2 ms cumulative)
    targeting: 0.1 ms/frame (2.8 ms cumulative)
    decision: 0.1 ms/frame (3.4 ms cumulative)
    behaviour: 5.0 ms/frame (144.2 ms cumulative)
    life/presentation: 7.4 ms/frame (213.9 ms cumulative)

  adaptive candidates:
    agent updates/frame: 33.2
    sensing passes/frame: 33.2
    decision passes/frame: 33.2
    high-priority agents/frame: 0.0
    expensive behaviour agents/frame: 33.2

  sensing/cache:
    forest samples/frame: 20.3
    fire scan candidates/frame: 26.2
    village scan candidates/frame: 196.5
    player perception checks/frame: 33.2

  nearest scans: 42.7/frame (1239 calls)
  nearest candidates checked: 381.2/frame (11056 total)
  herd leader scans: 0.0/frame (0 calls)
  herd candidates checked: 0.0/frame (0 total)

---

[Seedvale Program Census]

Programs created: 103
Program count: final=101 max=101

By frame:
  frame 0   +38 programs   <== largest transition
  frame 1   +8 programs
  frame 3   +1 program
  frame 6   +4 programs
  frame 8   +12 programs
  frame 9   +1 program
  frame 10   +2 programs
  frame 11   +1 program
  frame 12   +1 program
  frame 14   +1 program
  frame 16   +1 program
  frame 42   +13 programs
  frame 47   +16 programs
  frame 49   +4 programs

Largest transition — frame 0 (+38 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=008ac6d2-a40c-44f3-aee3-7a21faeafb20 (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=b6509a48-79fa-4b14-8d25-ec2a07ceed5a
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=a1daa357 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=6fc1c398-e37e-4a3e-97f9-4e6e2d6542da
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=mirror-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=cdad5d22-ee01-4ba4-86c7-454ac421ddac
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=2cf9fa62 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=84fda396-d5a0-4f2b-ba82-ff5163d5e58f
  #5 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=ae169224 fHash=9b2a34e4 stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=70131dbe-eff9-429e-b34e-0da9ce3ec212
  #6 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=f0a0fc42-aab6-478f-8567-a5b1df3932a8
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=b6164c2e-e21c-40dc-832e-060b6bc94320
  #8 type=MeshStandardMaterial name='Wood' bucket=other cacheKey=physical,STANDARD,,highp… vHash=d38f15a4 fHash=6578c10d stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=7038bd28-32a3-4303-a481-71133f36bb90 (Wood)
  #9 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=5b43c776 fHash=70b71dad stage=mirror-render
  #10 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=mirror-render
  #11 type=MeshBasicMaterial name='' cacheKey=basic,highp,srgb-linear,… vHash=d459e49b fHash=a8a9bac3 stage=mirror-render
  #12 type=MeshBasicMaterial name='' bucket=other cacheKey=basic,highp,srgb-linear,… vHash=b6911298 fHash=73a25d1e stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"true","normalMap":"false","envMap":"false"}
      material=d456cac4-b03f-448c-a642-1574093a4ac0
  #13 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=54e03756 fHash=d391c52 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=e8286e95-0eb5-46fb-89a6-87ea99612d87 (Main)
  #14 type=MeshStandardMaterial name='Material.001' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=a99aa494 fHash=63f9c0d1 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=cae06d1b-42a6-4e2a-a870-7b85971ddd39 (Material.001)
  #15 type=MeshPhysicalMaterial name='Material #55' bucket=fauna cacheKey=physical,STANDARD,,PHYSI… vHash=a344732e fHash=16869b56 stage=mirror-render
      defines={"STANDARD":"","PHYSICAL":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=18e2d578-19d5-47ea-9f1b-e77591d0aa1a (Material #55)
  #16 type=MeshStandardMaterial name='BlackBear_mat' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=9ef75116 fHash=bc151936 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=49475ff2-60c0-4cc9-99f2-ccb6bb4b385d (BlackBear_mat)
  #17 type=MeshStandardMaterial name='Black' bucket=other cacheKey=physical,STANDARD,,highp… vHash=deee2625 fHash=497d8e73 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=eaa90945-a229-40fc-b9dc-d6a9be025988 (Black)
  #18 type=MeshStandardMaterial name='Green' bucket=other cacheKey=physical,STANDARD,,highp… vHash=589b45c0 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=d99805b8-5550-4702-bd28-79d8b91c8eaa (Green)
  #19 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=76538ae1 fHash=a61fc7cc stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=b486058c-5edc-42b7-9f79-f8d17a53214b
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
    vertexShaderHash differs: #2=5c2c57a3, #7=e3408c64, #8=d38f15a4, #13=54e03756, #14=a99aa494, #16=9ef75116, #17=deee2625, #18=589b45c0, #19=76538ae1
    fragmentShaderHash differs: #2=a1daa357, #7=c0b8fc9f, #8=6578c10d, #13=d391c52, #14=63f9c0d1, #16=bc151936, #17=497d8e73, #18=a81023c3, #19=a61fc7cc
    bucket differs: #2=terrain, #7=other, #8=other, #13=fauna, #14=fauna, #16=fauna, #17=other, #18=other, #19=other
    flag flatShading differs: #2=false, #7=true, #8=false, #13=false, #14=false, #16=false, #17=false, #18=false, #19=true
    flag fog differs: #2=true, #7=true, #8=true, #13=true, #14=true, #16=true, #17=true, #18=true, #19=false
    flag map differs: #2=false, #7=false, #8=false, #13=false, #14=false, #16=true, #17=false, #18=false, #19=false
    flag normalMap differs: #2=true, #7=false, #8=false, #13=false, #14=false, #16=false, #17=false, #18=false, #19=false
    flag vertexColors differs: #2=true, #7=false, #8=false, #13=false, #14=false, #16=false, #17=false, #18=false, #19=false
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



Frame 42 (+13):
  Program #70
    material: MeshStandardMaterial ''
    materialUuid: 6fc1c398-e37e-4a3e-97f9-4e6e2d6542da
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 89831d77
  Program #71
    material: MeshStandardMaterial 'Wood'
    materialUuid: f6594c2f-74bf-4159-94b8-802c866ff08f
    object: Mesh 'chunk-environment-region-0,0|rockCluster-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 320d0e37
    fragmentShaderHash: 65cafcc2
  Program #72
    material: MeshStandardMaterial 'Green'
    materialUuid: fbe90b59-f9c7-4bcc-9921-468d311121da
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
  Program #73
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 0bdc64e6-7b65-4ecd-8fc7-5add7b0f6851
    object: Mesh 'chunk-vegetation-region-1,0|reed-1:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ca65e7f6
    fragmentShaderHash: ed8c9b61
  Program #74
    material: MeshStandardMaterial 'MapleTree_Bark'
    materialUuid: 7d39e604-426b-4e5d-be25-0097d5ac7096
    object: Mesh 'chunk-vegetation-region-0,0|tree-living-4:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 2c216b4f
    fragmentShaderHash: 47812acb
  Program #75
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: 07207d76-4424-453d-9ef1-cdc14d40b354
    object: Mesh 'chunk-vegetation-region-0,0|bush-2:0'
    asset: (no GLB — procedural geometry or unattributed)
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
  Program #76
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: 776dce5e-a3d6-440b-8a64-bde869425c0b
    object: Mesh 'chunk-vegetation-region-0,0|tree-living-6:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #77
    material: MeshStandardMaterial 'Leaves'
    materialUuid: e34b1efc-6603-439b-8cb6-1c8d5252eaa3
    object: Mesh 'chunk-vegetation-region-0,0|fern-0:0'
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
  Program #78
    material: MeshStandardMaterial 'Brown'
    materialUuid: 046af4c1-4379-40de-bbc8-9618e8af65d7
    object: SkinnedMesh 'mesh_1_1'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 27e30ee8
    fragmentShaderHash: 731f1f78
  Program #79
    material: MeshStandardMaterial 'Green'
    materialUuid: d99805b8-5550-4702-bd28-79d8b91c8eaa
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
  Program #80
    material: MeshStandardMaterial 'MI_WoodTrim'
    materialUuid: 38fe5138-bad6-4a9f-be1f-a18a08bcab98
    object: Mesh 'house-static-batch:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,uv,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3c9f4a85
    fragmentShaderHash: dd9a9763
  Program #81
    material: MeshStandardMaterial 'MI_WindowGlass'
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8392707,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 30e685d1
    fragmentShaderHash: 53dde5bb
  Program #82
    material: MeshStandardMaterial 'MI_WindowGlass'
    materialUuid: 6b4df363-ee2b-4678-8474-f06e266dc6dd
    object: Mesh 'house-static-batch:20'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8388611,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5f2e9b54
    fragmentShaderHash: 372a363a

Frame 47 (+16):
  Program #83
    material: ShaderMaterial 'SkyShader'
    materialUuid: 008ac6d2-a40c-44f3-aee3-7a21faeafb20
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #84
    material: ShaderMaterial ''
    materialUuid: 70131dbe-eff9-429e-b34e-0da9ce3ec212
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: ae169224
    fragmentShaderHash: 8c624cc7
  Program #85
    material: MeshStandardMaterial ''
    materialUuid: 6fc1c398-e37e-4a3e-97f9-4e6e2d6542da
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v7
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: 6b931360
  Program #86
    material: MeshStandardMaterial 'Wood'
    materialUuid: f6594c2f-74bf-4159-94b8-802c866ff08f
    object: Mesh 'chunk-environment-region-0,0|rockCluster-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5cee842b
    fragmentShaderHash: 1683d5db
  Program #87
    material: MeshStandardMaterial 'Green'
    materialUuid: fbe90b59-f9c7-4bcc-9921-468d311121da
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
  Program #88
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 0bdc64e6-7b65-4ecd-8fc7-5add7b0f6851
    object: Mesh 'chunk-vegetation-region-1,0|reed-1:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3e42e9c4
    fragmentShaderHash: d48c36b2
  Program #89
    material: MeshStandardMaterial 'MapleTree_Bark'
    materialUuid: 7d39e604-426b-4e5d-be25-0097d5ac7096
    object: Mesh 'chunk-vegetation-region-0,0|tree-living-4:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: d612cf03
    fragmentShaderHash: 2a64e35c
  Program #90
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: 07207d76-4424-453d-9ef1-cdc14d40b354
    object: Mesh 'chunk-vegetation-region-0,0|bush-2:0'
    asset: (no GLB — procedural geometry or unattributed)
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
  Program #91
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: 776dce5e-a3d6-440b-8a64-bde869425c0b
    object: Mesh 'chunk-vegetation-region-0,0|tree-living-6:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #92
    material: MeshStandardMaterial 'Leaves'
    materialUuid: e34b1efc-6603-439b-8cb6-1c8d5252eaa3
    object: Mesh 'chunk-vegetation-region-0,0|fern-0:0'
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
  Program #93
    material: MeshStandardMaterial 'Black'
    materialUuid: eaa90945-a229-40fc-b9dc-d6a9be025988
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: deee2625
    fragmentShaderHash: da938326
  Program #94
    material: MeshStandardMaterial 'Green'
    materialUuid: d99805b8-5550-4702-bd28-79d8b91c8eaa
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
  Program #95
    material: ShaderMaterial ''
    materialUuid: f0a0fc42-aab6-478f-8567-a5b1df3932a8
    object: Mesh 'ocean'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: e6d01ae7
    fragmentShaderHash: 215382b6
  Program #96
    material: ShaderMaterial ''
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 10,11,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,0,8389635,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 5b43c776
    fragmentShaderHash: 34e03bb0
  Program #97
    material: ShaderMaterial ''
    materialUuid: dfd3110c-8361-4d7c-9d28-cca057159c62
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
  Program #98
    material: ShaderMaterial ''
    materialUuid: dcfe1e3e-cc78-4cb2-9bc5-79e54042078a
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
Excluded — no reliable per-program timing: 93 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 3
  #46
      material: MeshStandardMaterial 'Pink'
      object: Mesh 'chunk-vegetation-region-0,-1|cactus-1:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 280.7 ms  (upper bound — whole postprocess-render call, see note above)

Frame 8
  #62
      material: MeshStandardMaterial 'LimeGreen'
      object: SkinnedMesh 'mesh_1'
      asset: /models/characters/Female_Formal.glb
      foliage-wind-v3
      compile/link: 109.4 ms  (upper bound — whole postprocess-render call, see note above)

Frame 9
  #63
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 24.6 ms  (upper bound — whole postprocess-render call, see note above)

Frame 10
  #64
      material: MeshStandardMaterial 'Green'
      object: Mesh 'chunk-vegetation-region-1,-1|tree-living-1:1'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 22.8 ms  (upper bound — whole mirror-render call, see note above)

  #65
      material: MeshStandardMaterial 'Pond_Pack_MAT'
      object: Mesh 'Branch_2b'
      asset: /models/items/branch.glb
      compile/link: 81.6 ms  (upper bound — whole postprocess-render call, see note above)

Frame 11
  #66
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,0|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 29.9 ms  (upper bound — whole postprocess-render call, see note above)

Frame 12
  #67
      material: MeshStandardMaterial 'PineTree_Bark'
      object: Mesh 'chunk-vegetation-region--1,-1|tree-living-7:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 22.5 ms  (upper bound — whole mirror-render call, see note above)

Frame 14
  #68
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 101.0 ms  (upper bound — whole postprocess-render call, see note above)

Frame 16
  #69
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 24.7 ms  (upper bound — whole postprocess-render call, see note above)

Frame 49
  #102
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 25.0 ms  (upper bound — whole postprocess-render call, see note above)

Summary:
  total measured compile/link time: 722.2 ms
  programs >1 ms: 10
  max: 280.7 ms (#46)

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=17.4 ms  p95=17.4 ms  max=17.4 ms  Δavg vs baseline=—
  hide-grass           avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=-17.4 ms (-100%)
  hide-vegetation      avg=36.0 ms  p95=36.0 ms  max=36.0 ms  Δavg vs baseline=+18.6 ms (+107%)
  no vegetation/grass  avg=12.1 ms  p95=12.1 ms  max=12.1 ms  Δavg vs baseline=-5.3 ms (-30%)
  hide-environment     avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=-17.4 ms (-100%)
  hide-settlement      avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=-17.4 ms (-100%)
  no water             avg=13.8 ms  p95=13.8 ms  max=13.8 ms  Δavg vs baseline=-3.6 ms (-21%)
  hide-terrain         avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=-17.4 ms (-100%)
  hide-npc-fauna       avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=-17.4 ms (-100%)
  no-shadows           avg=15.9 ms  p95=15.9 ms  max=15.9 ms  Δavg vs baseline=-1.5 ms (-9%)
  no-ao                avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=-17.4 ms (-100%)
  no-bloom             avg=14.9 ms  p95=14.9 ms  max=14.9 ms  Δavg vs baseline=-2.5 ms (-14%)
  no-smaa              avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=-17.4 ms (-100%)
  no-god-rays          avg=0.0 ms  p95=0.0 ms  max=0.0 ms  Δavg vs baseline=-17.4 ms (-100%)
  no-film-grade        avg=18.6 ms  p95=18.6 ms  max=18.6 ms  Δavg vs baseline=+1.2 ms (+7%)
  no postprocessing    avg=1377.1 ms  p95=1377.1 ms  max=1377.1 ms  Δavg vs baseline=+1359.7 ms (+7814%)
  no mirrors           avg=16.6 ms  p95=16.6 ms  max=16.6 ms  Δavg vs baseline=-0.8 ms (-5%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (2 samples resolved during the baseline window)
  GPU elapsed   avg=24.2 ms  p95=29.5 ms  max=30.1 ms
  CPU wall      avg=17.4 ms  p95=17.4 ms  max=17.4 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

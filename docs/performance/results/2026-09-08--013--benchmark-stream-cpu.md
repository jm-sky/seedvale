# Seedvale Performance Benchmark Report

> Generated: 2026-09-08T10:07:58.566Z
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
  anchor: (-8.1, -11.5)
  route: start=(-8.1, -11.5) speed=14.4 m/s duration=30s

FPS:
  avg: 23.2
  min: 4
  p1: 10

Frame time:
  avg: 43 ms
  p95: 75.4 ms
  max: 233.8 ms

Rendering:
  draw calls: 654 avg / 1727 max
  triangles: 10.96M avg
  mirror draws: 126 avg
  geometries: 675
  textures: 486

Scene (one-pass estimate):
  terrain        draws=65 tris=4.79M meshes=65 inst=65
  grass          draws=56 tris=1.14M meshes=56 inst=117872
  vegetation     draws=169 tris=1.55M meshes=169 inst=900
  environment    draws=49 tris=22.2k meshes=49 inst=70
  settlement     draws=631 tris=685.9k meshes=631 inst=1145
  water          draws=47 tris=3.40M meshes=47 inst=47
  npc            draws=181 tris=127.9k meshes=181 inst=181
  fauna          draws=211 tris=58.7k meshes=211 inst=211
  items          draws=169 tris=19.5k meshes=169 inst=169
  other          draws=137 tris=20.2k meshes=137 inst=137

Systems:
  TERRAIN        0.7 ms
  WATER          3.3 ms
  NPC            8.5 ms
  FAUNA          10.0 ms
  PHYSICS        0.1 ms
  RENDER         14.9 ms

Detected bottlenecks:
  1. RENDER
  2. FAUNA
  3. NPC

Critical spikes:
  GRASS: 18
  WATER: 8
  STREAMING: 7

Hitches (>= 8 ms):
  grass generation       n=18 avg=16.8 max=28.0
  chunk mesh             n=7 avg=10.5 max=15.4
  chunk water            n=8 avg=9.7 max=13.4

Isolation probes:
  full               render=15.7 ms draws=271 tris=6.25M
  hide-grass         render=9.7 ms draws=259 tris=5.56M
  hide-vegetation    render=8.3 ms draws=166 tris=4.48M
  hide-vegetation-grass render=10.0 ms draws=134 tris=3.31M
  hide-environment   render=8.8 ms draws=273 tris=6.53M
  hide-settlement    render=10.8 ms draws=259 tris=6.46M
  hide-water         render=10.3 ms draws=265 tris=5.52M
  hide-terrain       render=11.6 ms draws=249 tris=4.20M
  hide-npc-fauna     render=7.1 ms draws=287 tris=6.60M
  no-shadows         render=8.1 ms draws=277 tris=6.34M
  no-ao              render=11.0 ms draws=281 tris=6.60M
  no-bloom           render=9.1 ms draws=260 tris=6.27M
  no-smaa            render=10.0 ms draws=278 tris=6.53M
  no-god-rays        render=8.5 ms draws=290 tris=6.68M
  no-film-grade      render=10.0 ms draws=281 tris=6.39M
  no-postprocessing  render=8.8 ms draws=250 tris=6.38M
  no-reflections     render=9.0 ms draws=210 tris=5.52M

Frame attribution:
  frame max: 233.8 ms
  largest labelled hitch: 28 ms
  unattributed: 205.8 ms

Recommendation:
Largest frame (233.8 ms) is not explained by labelled hitches (largest 28 ms) — unattributed frame spike, not a category bottleneck.

[Seedvale Agent CPU]

Population:
  NPC (loaded): 21
  Fauna (agents): 22

NPC:
  total: 8.5 ms/frame
  crowd pass: 0.0 ms/frame (7.3 ms cumulative)
  agent updates: 1.7 ms/frame (908.8 ms cumulative)
  other (livestock/rats/social/...): 6.8 ms/frame

FAUNA:
  total: 10.0 ms/frame
  agent updates: 10.0 ms/frame (5362.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame
  nearest scans: 31.7/frame (17059 calls)
  nearest candidates checked: 198.3/frame (106710 total)
  herd leader scans: 0.1/frame (47 calls)
  herd candidates checked: 1.9/frame (1034 total)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 21
  Fauna (agents): 22

NPC:
  total: 8.5 ms/frame
  crowd pass: 0.0 ms/frame (7.3 ms cumulative)
  agent updates: 1.7 ms/frame (908.8 ms cumulative)
  other (livestock/rats/social/...): 6.8 ms/frame

FAUNA:
  total: 10.0 ms/frame
  agent updates: 10.0 ms/frame (5362.5 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame
  nearest scans: 31.7/frame (17059 calls)
  nearest candidates checked: 198.3/frame (106710 total)
  herd leader scans: 0.1/frame (47 calls)
  herd candidates checked: 1.9/frame (1034 total)

---

[Seedvale Program Census]

Programs created: 107
Program count: final=103 max=107

By frame:
  frame 0   +35 programs   <== largest transition
  frame 1   +4 programs
  frame 2   +4 programs
  frame 56   +4 programs
  frame 65   +10 programs
  frame 67   +3 programs
  frame 75   +2 programs
  frame 91   +4 programs
  frame 95   +1 program
  frame 97   +1 program
  frame 115   +1 program
  frame 136   +2 programs
  frame 137   +1 program
  frame 817   +14 programs
  frame 841   +4 programs
  frame 936   +17 programs

Largest transition — frame 0 (+35 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=postprocess-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=2ec4525a-5d6d-4112-bb03-fddff4cb79de (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=postprocess-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=cf473742-b672-4ab5-a3af-979baef2a041
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=6e92caaf stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=f577fd32-1565-446a-8041-9138bccc7643
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=postprocess-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=a3aedd8c-068c-4cbd-8e37-8882d8785dc6
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=2cf9fa62 stage=postprocess-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=8f17d9c0-919d-4bae-a474-66d61e0a3643
  #5 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=ae169224 fHash=9b2a34e4 stage=postprocess-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=ca0438b0-e2a4-41c1-b49d-8927e0bff9d3
  #6 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=postprocess-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=fcd4cf2b-9b81-467b-b557-c4d1f4167aa4
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=adc44931-ed14-420e-8aba-44b2a50cd210
  #8 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=5b43c776 fHash=7a30d838 stage=postprocess-render
  #9 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=postprocess-render
  #10 type=MeshBasicMaterial name='' cacheKey=basic,highp,srgb-linear,… vHash=d459e49b fHash=a8a9bac3 stage=postprocess-render
  #11 type=MeshBasicMaterial name='' bucket=other cacheKey=basic,highp,srgb-linear,… vHash=b6911298 fHash=73a25d1e stage=postprocess-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"true","normalMap":"false","envMap":"false"}
      material=c07b7460-3a73-42c4-b6d0-e00516a8dea2
  #12 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=54e03756 fHash=d391c52 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=92b9239f-b0e9-4a13-9cbe-b0abd7e08eb0 (Main)
  #13 type=MeshStandardMaterial name='Material.001' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=a99aa494 fHash=63f9c0d1 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=99c76b16-159a-4449-9ca5-53fad17487b3 (Material.001)
  #14 type=MeshStandardMaterial name='BlackBear_mat' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=9ef75116 fHash=bc151936 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=f5934f78-de16-48de-b825-7169a78ff61b (BlackBear_mat)
  #15 type=MeshStandardMaterial name='Black' bucket=other cacheKey=physical,STANDARD,,highp… vHash=deee2625 fHash=497d8e73 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=8f023c59-8a42-4331-b7b0-6c109146871a (Black)
  #16 type=MeshStandardMaterial name='Green' bucket=other cacheKey=physical,STANDARD,,highp… vHash=589b45c0 fHash=a81023c3 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=2f07911a-70fd-4e73-8f82-def1fb24c135 (Green)
  #17 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=279cec18 fHash=4d6bcede stage=postprocess-render
  #18 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=84736a68 fHash=ffecb62a stage=postprocess-render
  #19 type=ShaderMaterial name='' cacheKey=16,17,highp,srgb-linear,… vHash=aa2edbee fHash=76ced00a stage=postprocess-render
  #20 type=ShaderMaterial name='' cacheKey=18,19,highp,srgb-linear,… vHash=7bae0bb2 fHash=fb55b3c0 stage=postprocess-render
  #21 type=ShaderMaterial name='' cacheKey=20,21,highp,srgb-linear,… vHash=436caea4 fHash=2d687ef1 stage=postprocess-render
  #22 type=ShaderMaterial name='' cacheKey=22,23,SMAA_THRESHOLD,0.1… vHash=886438e7 fHash=dc2a89b5 stage=postprocess-render
  #23 type=ShaderMaterial name='' cacheKey=24,25,SMAA_MAX_SEARCH_ST… vHash=d99a5b29 fHash=109e33fc stage=postprocess-render
  #24 type=ShaderMaterial name='' cacheKey=26,27,highp,srgb-linear,… vHash=2003ced8 fHash=db0f470a stage=postprocess-render
  #25 type=ShaderMaterial name='' cacheKey=28,29,highp,srgb-linear,… vHash=28dfa407 fHash=9775cd0e stage=postprocess-render
  #26 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,6,hi… vHash=756a0b19 fHash=5c741650 stage=postprocess-render
  #27 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,10,h… vHash=b2354ff2 fHash=2aad9943 stage=postprocess-render
  #28 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,14,h… vHash=ea82969e fHash=a2297d9f stage=postprocess-render
  #29 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,18,h… vHash=7dab8d9a fHash=1022767b stage=postprocess-render
  #30 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,22,h… vHash=378e1fb7 fHash=ce0bf6b4 stage=postprocess-render
  #31 type=ShaderMaterial name='' cacheKey=30,32,NUM_MIPS,5,highp,s… vHash=78acf7ea fHash=707f290c stage=postprocess-render
  #32 type=ShaderMaterial name='' cacheKey=33,34,highp,srgb-linear,… vHash=a312c579 fHash=c05e2256 stage=postprocess-render
  #33 type=ShaderMaterial name='GodRaysShader' cacheKey=35,36,highp,srgb-linear,… vHash=b817515d fHash=ccc98549 stage=postprocess-render
  #34 type=RawShaderMaterial name='OutputShader' cacheKey=37,38,SRGB_TRANSFER,,ACE… vHash=5d2c950f fHash=c1247d7 stage=postprocess-render

Differences within frame 0 (grouped by material type):
  ShaderMaterial (24 programs):
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=ae169224, #6=e6d01ae7, #8=5b43c776, #17=279cec18, #18=84736a68, #19=aa2edbee, #20=7bae0bb2, #21=436caea4, #22=886438e7, #23=d99a5b29, #24=2003ced8, #25=28dfa407, #26=756a0b19, #27=b2354ff2, #28=ea82969e, #29=7dab8d9a, #30=378e1fb7, #31=78acf7ea, #32=a312c579, #33=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=2cf9fa62, #5=9b2a34e4, #6=e34491ff, #8=7a30d838, #17=4d6bcede, #18=ffecb62a, #19=76ced00a, #20=fb55b3c0, #21=2d687ef1, #22=dc2a89b5, #23=109e33fc, #24=db0f470a, #25=9775cd0e, #26=5c741650, #27=2aad9943, #28=a2297d9f, #29=1022767b, #30=ce0bf6b4, #31=707f290c, #32=c05e2256, #33=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=grass, #6=water, #8=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #8=(unset), #17=(unset), #18=(unset), #19=(unset), #20=(unset), #21=(unset), #22=(unset), #23=(unset), #24=(unset), #25=(unset), #26=(unset), #27=(unset), #28=(unset), #29=(unset), #30=(unset), #31=(unset), #32=(unset), #33=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #8=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #8=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=false, #6=true, #8=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown)
  MeshStandardMaterial (7 programs):
    vertexShaderHash differs: #2=5c2c57a3, #7=e3408c64, #12=54e03756, #13=a99aa494, #14=9ef75116, #15=deee2625, #16=589b45c0
    fragmentShaderHash differs: #2=6e92caaf, #7=c0b8fc9f, #12=d391c52, #13=63f9c0d1, #14=bc151936, #15=497d8e73, #16=a81023c3
    bucket differs: #2=terrain, #7=other, #12=fauna, #13=fauna, #14=fauna, #15=other, #16=other
    flag flatShading differs: #2=false, #7=true, #12=false, #13=false, #14=false, #15=false, #16=false
    flag map differs: #2=false, #7=false, #12=false, #13=false, #14=true, #15=false, #16=false
    flag normalMap differs: #2=true, #7=false, #12=false, #13=false, #14=false, #15=false, #16=false
    flag vertexColors differs: #2=true, #7=false, #12=false, #13=false, #14=false, #15=false, #16=false
  SpriteMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)
  MeshBasicMaterial (2 programs):
    vertexShaderHash differs: #10=d459e49b, #11=b6911298
    fragmentShaderHash differs: #10=a8a9bac3, #11=73a25d1e
    bucket differs: #10=(unknown), #11=other
    flag alphaTest differs: #10=(unknown), #11=0
    flag envMap differs: #10=(unknown), #11=false
    flag fog differs: #10=(unknown), #11=false
    flag map differs: #10=(unknown), #11=true
    flag normalMap differs: #10=(unknown), #11=false
    flag transparent differs: #10=(unknown), #11=true
    flag vertexColors differs: #10=(unknown), #11=false
    flag wireframe differs: #10=(unknown), #11=false
  RawShaderMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)

---

[Seedvale Program Attribution]



Frame 817 (+14):
  Program #72
    material: MeshStandardMaterial ''
    materialUuid: f577fd32-1565-446a-8041-9138bccc7643
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 6ab20547
  Program #73
    material: MeshStandardMaterial 'Wood'
    materialUuid: f7ebdb3c-81ac-4fca-9b0a-61953c95378a
    object: Mesh 'chunk-environment-region-1,0|fallenLog-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 320d0e37
    fragmentShaderHash: 65cafcc2
  Program #74
    material: MeshStandardMaterial 'Green'
    materialUuid: 09af952e-9136-415b-bdd8-07b25a86b2ad
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
  Program #75
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 71cd53e1-a15b-4252-b33d-efca8de1c109
    object: Mesh 'chunk-vegetation-region-1,0|reed-1:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ca65e7f6
    fragmentShaderHash: ed8c9b61
  Program #76
    material: MeshStandardMaterial 'NormalTree_Bark'
    materialUuid: 7eb4af51-0724-4720-ab3a-e08fafc28f6b
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 1bd8d9e3
    fragmentShaderHash: e2f189d1
  Program #77
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: 49c05a32-fce4-4e74-98bf-7856d3a3f067
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
  Program #78
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: c47d4327-baa4-4a2c-9707-aa68819f6392
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #79
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 6547b758-7fb6-4a00-890d-37f5c082ccb5
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
  Program #80
    material: MeshStandardMaterial 'Brown'
    materialUuid: 7632ff5b-549c-4dab-8409-540ea1078b4d
    object: SkinnedMesh 'mesh_1_1'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 27e30ee8
    fragmentShaderHash: 731f1f78
  Program #81
    material: MeshStandardMaterial 'Green'
    materialUuid: 2f07911a-70fd-4e73-8f82-def1fb24c135
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
  Program #82
    material: MeshStandardMaterial 'MI_WoodTrim'
    materialUuid: b71435e8-73eb-4488-8310-00f4ae97f6a9
    object: Mesh 'house-static-batch:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,uv,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3c9f4a85
    fragmentShaderHash: dd9a9763
  Program #83
    material: MeshStandardMaterial ''
    materialUuid: be8aa35c-b402-43fc-855e-ac408359ac6a
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519687,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: d7607dd2
    fragmentShaderHash: 83e94369
  Program #84
    material: MeshStandardMaterial 'MI_WindowGlass'
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8392707,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 30e685d1
    fragmentShaderHash: 53dde5bb
  Program #85
    material: MeshStandardMaterial 'MI_WindowGlass'
    materialUuid: 741da49e-a781-4ab3-9233-e5f1c5c0eb89
    object: Mesh 'house-static-batch:20'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8388611,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5f2e9b54
    fragmentShaderHash: 372a363a

Frame 936 (+17):
  Program #90
    material: ShaderMaterial 'SkyShader'
    materialUuid: 2ec4525a-5d6d-4112-bb03-fddff4cb79de
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #91
    material: ShaderMaterial ''
    materialUuid: ca0438b0-e2a4-41c1-b49d-8927e0bff9d3
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: ae169224
    fragmentShaderHash: 8c624cc7
  Program #92
    material: MeshStandardMaterial ''
    materialUuid: f577fd32-1565-446a-8041-9138bccc7643
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: b3121184
  Program #93
    material: MeshStandardMaterial 'Wood'
    materialUuid: f7ebdb3c-81ac-4fca-9b0a-61953c95378a
    object: Mesh 'chunk-environment-region-1,0|fallenLog-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5cee842b
    fragmentShaderHash: 1683d5db
  Program #94
    material: MeshStandardMaterial 'Green'
    materialUuid: 09af952e-9136-415b-bdd8-07b25a86b2ad
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
  Program #95
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 71cd53e1-a15b-4252-b33d-efca8de1c109
    object: Mesh 'chunk-vegetation-region-1,0|reed-1:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3e42e9c4
    fragmentShaderHash: d48c36b2
  Program #96
    material: MeshStandardMaterial 'NormalTree_Bark'
    materialUuid: 7eb4af51-0724-4720-ab3a-e08fafc28f6b
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ab1dd48f
    fragmentShaderHash: 8661e8c2
  Program #97
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: 49c05a32-fce4-4e74-98bf-7856d3a3f067
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
  Program #98
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: c47d4327-baa4-4a2c-9707-aa68819f6392
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #99
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 6547b758-7fb6-4a00-890d-37f5c082ccb5
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
  Program #100
    material: MeshStandardMaterial 'Black'
    materialUuid: 8f023c59-8a42-4331-b7b0-6c109146871a
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: deee2625
    fragmentShaderHash: da938326
  Program #101
    material: MeshStandardMaterial 'Green'
    materialUuid: 2f07911a-70fd-4e73-8f82-def1fb24c135
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
  Program #102
    material: MeshStandardMaterial ''
    materialUuid: be8aa35c-b402-43fc-855e-ac408359ac6a
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520711,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 66d360c8
    fragmentShaderHash: 4e17aba
  Program #103
    material: ShaderMaterial ''
    materialUuid: fcd4cf2b-9b81-467b-b557-c4d1f4167aa4
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
    fragmentShaderHash: 8decad4f
  Program #105
    material: ShaderMaterial ''
    materialUuid: 54eeadf1-a607-4672-a978-aa1b3bfa8e9d
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
  Program #106
    material: ShaderMaterial ''
    materialUuid: 38194769-e7cb-4648-9700-e7522619fa7d
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
Excluded — no reliable per-program timing: 102 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 91
  #65
      material: MeshStandardMaterial 'LimeGreen'
      object: SkinnedMesh 'mesh_1'
      asset: /models/characters/Female_Formal.glb
      foliage-wind-v3
      compile/link: 76.1 ms  (upper bound — whole postprocess-render call, see note above)

Frame 95
  #66
      material: MeshStandardMaterial 'Pond_Pack_MAT'
      object: Mesh 'Branch_2b'
      asset: /models/items/branch.glb
      compile/link: 32.5 ms  (upper bound — whole postprocess-render call, see note above)

Frame 97
  #67
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 19.8 ms  (upper bound — whole postprocess-render call, see note above)

Frame 115
  #68
      material: MeshStandardMaterial 'BirchTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-3:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 24.6 ms  (upper bound — whole mirror-render call, see note above)

Frame 137
  #71
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 24.4 ms  (upper bound — whole mirror-render call, see note above)

Summary:
  total measured compile/link time: 177.4 ms
  programs >1 ms: 5
  max: 76.1 ms (#65)

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=15.7 ms  p95=25.2 ms  max=28.4 ms  Δavg vs baseline=—
  hide-grass           avg=9.7 ms  p95=14.1 ms  max=16.0 ms  Δavg vs baseline=-6.0 ms (-38%)
  hide-vegetation      avg=8.3 ms  p95=11.8 ms  max=11.9 ms  Δavg vs baseline=-7.3 ms (-47%)
  no vegetation/grass  avg=10.0 ms  p95=12.4 ms  max=12.5 ms  Δavg vs baseline=-5.6 ms (-36%)
  hide-environment     avg=8.8 ms  p95=12.6 ms  max=13.0 ms  Δavg vs baseline=-6.9 ms (-44%)
  hide-settlement      avg=10.8 ms  p95=17.2 ms  max=18.1 ms  Δavg vs baseline=-4.9 ms (-31%)
  no water             avg=10.3 ms  p95=12.6 ms  max=13.0 ms  Δavg vs baseline=-5.4 ms (-35%)
  hide-terrain         avg=11.6 ms  p95=16.4 ms  max=18.4 ms  Δavg vs baseline=-4.0 ms (-26%)
  hide-npc-fauna       avg=7.1 ms  p95=10.7 ms  max=10.8 ms  Δavg vs baseline=-8.6 ms (-55%)
  no-shadows           avg=8.1 ms  p95=11.6 ms  max=12.5 ms  Δavg vs baseline=-7.5 ms (-48%)
  no-ao                avg=11.0 ms  p95=15.4 ms  max=15.5 ms  Δavg vs baseline=-4.6 ms (-29%)
  no-bloom             avg=9.1 ms  p95=13.6 ms  max=13.6 ms  Δavg vs baseline=-6.6 ms (-42%)
  no-smaa              avg=10.0 ms  p95=14.8 ms  max=16.8 ms  Δavg vs baseline=-5.7 ms (-36%)
  no-god-rays          avg=8.5 ms  p95=12.8 ms  max=14.0 ms  Δavg vs baseline=-7.1 ms (-45%)
  no-film-grade        avg=10.0 ms  p95=15.7 ms  max=16.5 ms  Δavg vs baseline=-5.6 ms (-36%)
  no postprocessing    avg=8.8 ms  p95=12.7 ms  max=14.6 ms  Δavg vs baseline=-6.8 ms (-43%)
  no mirrors           avg=9.0 ms  p95=12.1 ms  max=14.4 ms  Δavg vs baseline=-6.7 ms (-43%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (12 samples resolved during the baseline window)
  GPU elapsed   avg=35.4 ms  p95=38.7 ms  max=39.1 ms
  CPU wall      avg=15.7 ms  p95=25.2 ms  max=28.4 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

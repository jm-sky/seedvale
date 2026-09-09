# Seedvale Performance Benchmark Report

> Generated: 2026-09-09T07:40:57.936Z
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
  avg: 27.5
  min: 1
  p1: 10

Frame time:
  avg: 36.4 ms
  p95: 56.6 ms
  max: 1412.9 ms

Rendering:
  draw calls: 591 avg / 1511 max
  triangles: 10.67M avg
  mirror draws: 116 avg
  geometries: 705
  textures: 487

Scene (one-pass estimate):
  terrain        draws=72 tris=5.31M meshes=72 inst=72
  grass          draws=60 tris=837.5k meshes=60 inst=98841
  vegetation     draws=189 tris=1.84M meshes=189 inst=1074
  environment    draws=53 tris=27.0k meshes=53 inst=80
  settlement     draws=630 tris=686.3k meshes=630 inst=1144
  water          draws=51 tris=3.69M meshes=51 inst=51
  npc            draws=181 tris=127.9k meshes=181 inst=181
  fauna          draws=211 tris=58.7k meshes=211 inst=211
  items          draws=185 tris=21.3k meshes=185 inst=185
  other          draws=140 tris=20.3k meshes=140 inst=140

Systems:
  TERRAIN        0.5 ms
  WATER          4.6 ms
  NPC            7.1 ms
  FAUNA          8.0 ms
  PHYSICS        0.1 ms
  RENDER         11.7 ms

Detected bottlenecks:
  1. RENDER
  2. FAUNA
  3. NPC

Critical spikes:
  GRASS: 16
  STREAMING: 7
  WATER: 5

Hitches (>= 8 ms):
  grass generation       n=16 avg=17.0 max=28.1
  chunk water            n=5 avg=9.2 max=10.9
  chunk mesh             n=7 avg=9.0 max=10.3

Isolation probes:
  full               render=5.9 ms draws=279 tris=6.11M
  hide-grass         render=10.7 ms draws=247 tris=5.67M
  hide-vegetation    render=5.9 ms draws=165 tris=3.88M
  hide-vegetation-grass render=6.6 ms draws=138 tris=3.46M
  hide-environment   render=7.4 ms draws=272 tris=6.18M
  hide-settlement    render=6.5 ms draws=265 tris=6.33M
  hide-water         render=6.5 ms draws=266 tris=5.21M
  hide-terrain       render=10.2 ms draws=248 tris=3.81M
  hide-npc-fauna     render=6.0 ms draws=274 tris=6.06M
  no-shadows         render=6.3 ms draws=269 tris=5.85M
  no-ao              render=6.8 ms draws=278 tris=6.30M
  no-bloom           render=7.8 ms draws=266 tris=6.14M
  no-smaa            render=7.7 ms draws=277 tris=6.17M
  no-god-rays        render=6.4 ms draws=288 tris=6.30M
  no-film-grade      render=5.6 ms draws=279 tris=6.11M
  no-postprocessing  render=6.3 ms draws=256 tris=6.11M
  no-reflections     render=6.0 ms draws=204 tris=4.92M

Frame attribution:
  frame max: 1412.9 ms
  largest labelled hitch: 28.1 ms
  unattributed: 1384.8 ms

Recommendation:
Largest frame (1412.9 ms) is not explained by labelled hitches (largest 28.1 ms) — unattributed frame spike, not a category bottleneck.

[Seedvale Agent CPU]

Population:
  NPC (loaded): 21
  Fauna (agents): 22

NPC:
  total: 7.1 ms/frame
  crowd pass: 0.0 ms/frame (8.2 ms cumulative)
  agent updates: 1.2 ms/frame (747.6 ms cumulative)
  other (livestock/rats/social/...): 5.9 ms/frame

FAUNA:
  total: 8.0 ms/frame
  agent updates: 8.0 ms/frame (4878.0 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame
  nearest scans: 32.8/frame (20032 calls)
  nearest candidates checked: 207.8/frame (126758 total)
  herd leader scans: 0.1/frame (75 calls)
  herd candidates checked: 2.7/frame (1650 total)

---

[Seedvale Agent CPU]

Population:
  NPC (loaded): 21
  Fauna (agents): 22

NPC:
  total: 7.1 ms/frame
  crowd pass: 0.0 ms/frame (8.2 ms cumulative)
  agent updates: 1.2 ms/frame (747.6 ms cumulative)
  other (livestock/rats/social/...): 5.9 ms/frame

FAUNA:
  total: 8.0 ms/frame
  agent updates: 8.0 ms/frame (4878.0 ms cumulative)
  other (spawners/forage/cleanup/...): 0.1 ms/frame
  nearest scans: 32.8/frame (20032 calls)
  nearest candidates checked: 207.8/frame (126758 total)
  herd leader scans: 0.1/frame (75 calls)
  herd candidates checked: 2.7/frame (1650 total)

---

[Seedvale Program Census]

Programs created: 105
Program count: final=101 max=105

By frame:
  frame 0   +31 programs   <== largest transition
  frame 1   +4 programs
  frame 2   +2 programs
  frame 35   +2 programs
  frame 45   +4 programs
  frame 46   +1 program
  frame 56   +1 program
  frame 61   +10 programs
  frame 63   +3 programs
  frame 65   +2 programs
  frame 66   +5 programs
  frame 67   +2 programs
  frame 75   +1 program
  frame 76   +2 programs
  frame 918   +11 programs
  frame 919   +3 programs
  frame 941   +4 programs
  frame 1061   +17 programs

Largest transition — frame 0 (+31 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=eede8e83-eff8-4d56-9f88-ce36453d557b (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=73d2e2ad-fd44-4c35-981d-0ac29ca4d810
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=6e92caaf stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=718c6cac-828f-41c0-89fc-295b2256ffd4
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=mirror-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=731839ca-d9b6-415b-8d67-cad7ba00e6e0
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=2cf9fa62 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=482313a5-7bd1-4135-b4a4-54f0bbc15efc
  #5 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=608aad36-c35b-4f9c-b456-d3b5818deafa
  #6 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=5314f187-3448-4cf8-89eb-509612c1d9b7
  #7 type=ShaderMaterial name='' cacheKey=8,9,highp,srgb-linear,fa… vHash=5b43c776 fHash=7a30d838 stage=mirror-render
  #8 type=ShaderMaterial name='' bucket=grass cacheKey=10,11,highp,srgb-linear,… vHash=ae169224 fHash=9b2a34e4 stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=45c765bb-463e-40bc-9d7d-c0d6de7bec3d
  #9 type=MeshStandardMaterial name='Black' bucket=other cacheKey=physical,STANDARD,,highp… vHash=deee2625 fHash=497d8e73 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=962002fb-c576-4514-bb5a-03655ec1dbf3 (Black)
  #10 type=MeshStandardMaterial name='Green' bucket=other cacheKey=physical,STANDARD,,highp… vHash=589b45c0 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=a12c15f3-7be9-4c03-bc2e-d3bcb739f87f (Green)
  #11 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=mirror-render
  #12 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=54e03756 fHash=d391c52 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=449d2020-67a5-4d43-aa2a-2985197c0a96 (Main)
  #13 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=279cec18 fHash=4d6bcede stage=postprocess-render
  #14 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=84736a68 fHash=ffecb62a stage=postprocess-render
  #15 type=ShaderMaterial name='' cacheKey=16,17,highp,srgb-linear,… vHash=aa2edbee fHash=76ced00a stage=postprocess-render
  #16 type=ShaderMaterial name='' cacheKey=18,19,highp,srgb-linear,… vHash=7bae0bb2 fHash=fb55b3c0 stage=postprocess-render
  #17 type=ShaderMaterial name='' cacheKey=20,21,highp,srgb-linear,… vHash=436caea4 fHash=2d687ef1 stage=postprocess-render
  #18 type=ShaderMaterial name='' cacheKey=22,23,SMAA_THRESHOLD,0.1… vHash=886438e7 fHash=dc2a89b5 stage=postprocess-render
  #19 type=ShaderMaterial name='' cacheKey=24,25,SMAA_MAX_SEARCH_ST… vHash=d99a5b29 fHash=109e33fc stage=postprocess-render
  #20 type=ShaderMaterial name='' cacheKey=26,27,highp,srgb-linear,… vHash=2003ced8 fHash=db0f470a stage=postprocess-render
  #21 type=ShaderMaterial name='' cacheKey=28,29,highp,srgb-linear,… vHash=28dfa407 fHash=9775cd0e stage=postprocess-render
  #22 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,6,hi… vHash=756a0b19 fHash=5c741650 stage=postprocess-render
  #23 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,10,h… vHash=b2354ff2 fHash=2aad9943 stage=postprocess-render
  #24 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,14,h… vHash=ea82969e fHash=a2297d9f stage=postprocess-render
  #25 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,18,h… vHash=7dab8d9a fHash=1022767b stage=postprocess-render
  #26 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,22,h… vHash=378e1fb7 fHash=ce0bf6b4 stage=postprocess-render
  #27 type=ShaderMaterial name='' cacheKey=30,32,NUM_MIPS,5,highp,s… vHash=78acf7ea fHash=707f290c stage=postprocess-render
  #28 type=ShaderMaterial name='' cacheKey=33,34,highp,srgb-linear,… vHash=a312c579 fHash=c05e2256 stage=postprocess-render
  #29 type=ShaderMaterial name='GodRaysShader' cacheKey=35,36,highp,srgb-linear,… vHash=b817515d fHash=ccc98549 stage=postprocess-render
  #30 type=RawShaderMaterial name='OutputShader' cacheKey=37,38,SRGB_TRANSFER,,ACE… vHash=5d2c950f fHash=c1247d7 stage=postprocess-render

Differences within frame 0 (grouped by material type):
  ShaderMaterial (24 programs):
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=e6d01ae7, #7=5b43c776, #8=ae169224, #13=279cec18, #14=84736a68, #15=aa2edbee, #16=7bae0bb2, #17=436caea4, #18=886438e7, #19=d99a5b29, #20=2003ced8, #21=28dfa407, #22=756a0b19, #23=b2354ff2, #24=ea82969e, #25=7dab8d9a, #26=378e1fb7, #27=78acf7ea, #28=a312c579, #29=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=2cf9fa62, #5=e34491ff, #7=7a30d838, #8=9b2a34e4, #13=4d6bcede, #14=ffecb62a, #15=76ced00a, #16=fb55b3c0, #17=2d687ef1, #18=dc2a89b5, #19=109e33fc, #20=db0f470a, #21=9775cd0e, #22=5c741650, #23=2aad9943, #24=a2297d9f, #25=1022767b, #26=ce0bf6b4, #27=707f290c, #28=c05e2256, #29=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=water, #7=(unknown), #8=grass, #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #7=(unset), #8=(unset), #13=(unset), #14=(unset), #15=(unset), #16=(unset), #17=(unset), #18=(unset), #19=(unset), #20=(unset), #21=(unset), #22=(unset), #23=(unset), #24=(unset), #25=(unset), #26=(unset), #27=(unset), #28=(unset), #29=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #7=(unknown), #8=0, #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #7=(unknown), #8=false, #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #7=(unknown), #8=true, #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #7=(unknown), #8=false, #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #7=(unknown), #8=false, #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=true, #7=(unknown), #8=false, #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #7=(unknown), #8=false, #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #7=(unknown), #8=false, #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
  MeshStandardMaterial (5 programs):
    vertexShaderHash differs: #2=5c2c57a3, #6=e3408c64, #9=deee2625, #10=589b45c0, #12=54e03756
    fragmentShaderHash differs: #2=6e92caaf, #6=c0b8fc9f, #9=497d8e73, #10=a81023c3, #12=d391c52
    bucket differs: #2=terrain, #6=other, #9=other, #10=other, #12=fauna
    flag flatShading differs: #2=false, #6=true, #9=false, #10=false, #12=false
    flag normalMap differs: #2=true, #6=false, #9=false, #10=false, #12=false
    flag vertexColors differs: #2=true, #6=false, #9=false, #10=false, #12=false
  SpriteMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)
  RawShaderMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)

---

[Seedvale Program Attribution]



Frame 918 (+11):
  Program #70
    material: MeshStandardMaterial ''
    materialUuid: 718c6cac-828f-41c0-89fc-295b2256ffd4
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 6ab20547
  Program #71
    material: MeshStandardMaterial 'Wood'
    materialUuid: 5ce6f542-ae52-4148-a3b7-00361c502406
    object: Mesh 'chunk-environment-region-0,0|rockCluster-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 320d0e37
    fragmentShaderHash: 65cafcc2
  Program #72
    material: MeshStandardMaterial 'Green'
    materialUuid: f97491dd-450d-4fea-ba30-bb8f19c31e01
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
    materialUuid: d7a7c461-1347-4158-aad6-22db77ffb2f8
    object: Mesh 'chunk-vegetation-region-1,0|reed-1:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ca65e7f6
    fragmentShaderHash: ed8c9b61
  Program #74
    material: MeshStandardMaterial 'BirchTree_Bark'
    materialUuid: 921e5b30-beca-4506-99aa-5880c437721a
    object: Mesh 'chunk-vegetation-region-0,0|tree-living-4:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a920e788
    fragmentShaderHash: 3c40f72c
  Program #75
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: fb6706cf-dc71-466e-82c1-3a9d07a2883d
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
    vertexShaderHash: 7db7358f
    fragmentShaderHash: 800accd2
  Program #76
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: e8e30705-2290-4b3a-a78b-573148c75224
    object: Mesh 'chunk-vegetation-region-0,0|tree-living-6:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #77
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 5890f535-5204-4340-8089-7d5d55523f37
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
  Program #78
    material: MeshStandardMaterial 'Black'
    materialUuid: 962002fb-c576-4514-bb5a-03655ec1dbf3
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ee36271
    fragmentShaderHash: ab5efdc5
  Program #79
    material: MeshStandardMaterial 'Green'
    materialUuid: a12c15f3-7be9-4c03-bc2e-d3bcb739f87f
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
    material: MeshStandardMaterial ''
    materialUuid: fd2997f0-43f2-452e-a2d5-ba3a2f6f8462
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519687,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: d7607dd2
    fragmentShaderHash: 83e94369

Frame 1061 (+17):
  Program #88
    material: ShaderMaterial 'SkyShader'
    materialUuid: eede8e83-eff8-4d56-9f88-ce36453d557b
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #89
    material: ShaderMaterial ''
    materialUuid: 45c765bb-463e-40bc-9d7d-c0d6de7bec3d
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 10,11,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: ae169224
    fragmentShaderHash: 8c624cc7
  Program #90
    material: MeshStandardMaterial ''
    materialUuid: 718c6cac-828f-41c0-89fc-295b2256ffd4
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: b3121184
  Program #91
    material: MeshStandardMaterial 'Wood'
    materialUuid: 5ce6f542-ae52-4148-a3b7-00361c502406
    object: Mesh 'chunk-environment-region-0,0|rockCluster-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5cee842b
    fragmentShaderHash: 1683d5db
  Program #92
    material: MeshStandardMaterial 'Green'
    materialUuid: f97491dd-450d-4fea-ba30-bb8f19c31e01
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
  Program #93
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: d7a7c461-1347-4158-aad6-22db77ffb2f8
    object: Mesh 'chunk-vegetation-region-1,0|reed-1:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3e42e9c4
    fragmentShaderHash: d48c36b2
  Program #94
    material: MeshStandardMaterial 'BirchTree_Bark'
    materialUuid: 921e5b30-beca-4506-99aa-5880c437721a
    object: Mesh 'chunk-vegetation-region-0,0|tree-living-4:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a282481e
    fragmentShaderHash: 21c5c77d
  Program #95
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: fb6706cf-dc71-466e-82c1-3a9d07a2883d
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
    vertexShaderHash: 79ee70f3
    fragmentShaderHash: 559e694b
  Program #96
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: e8e30705-2290-4b3a-a78b-573148c75224
    object: Mesh 'chunk-vegetation-region-0,0|tree-living-6:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #97
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 5890f535-5204-4340-8089-7d5d55523f37
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
  Program #98
    material: MeshStandardMaterial 'Black'
    materialUuid: 962002fb-c576-4514-bb5a-03655ec1dbf3
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: deee2625
    fragmentShaderHash: da938326
  Program #99
    material: MeshStandardMaterial 'Green'
    materialUuid: a12c15f3-7be9-4c03-bc2e-d3bcb739f87f
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
  Program #100
    material: MeshStandardMaterial ''
    materialUuid: fd2997f0-43f2-452e-a2d5-ba3a2f6f8462
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520711,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 66d360c8
    fragmentShaderHash: 4e17aba
  Program #101
    material: ShaderMaterial ''
    materialUuid: 608aad36-c35b-4f9c-b456-d3b5818deafa
    object: Mesh 'ocean'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: e6d01ae7
    fragmentShaderHash: 215382b6
  Program #102
    material: ShaderMaterial ''
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,0,8389635,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 5b43c776
    fragmentShaderHash: 8decad4f
  Program #103
    material: ShaderMaterial ''
    materialUuid: b9cdd932-0bab-42c7-acff-1079ad14ff1b
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
  Program #104
    material: ShaderMaterial ''
    materialUuid: 3cb2046d-9672-411f-aa58-b5d36bf6e281
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

Frame 46
  #43
      material: MeshStandardMaterial 'Mushrooms'
      object: Mesh 'mesh_0'
      asset: /models/nature/mushroom_a.glb
      compile/link: 465.7 ms  (upper bound — whole postprocess-render call, see note above)

Frame 56
  #44
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 14.4 ms  (upper bound — whole postprocess-render call, see note above)

Frame 67
  #65
      material: MeshStandardMaterial 'BirchTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-3:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 19.0 ms  (upper bound — whole mirror-render call, see note above)

  #66
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 84.6 ms  (upper bound — whole postprocess-render call, see note above)

Frame 75
  #67
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 23.9 ms  (upper bound — whole mirror-render call, see note above)

Summary:
  total measured compile/link time: 607.6 ms
  programs >1 ms: 5
  max: 465.7 ms (#43)

---

[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=5.9 ms  p95=8.1 ms  max=8.5 ms  Δavg vs baseline=—
  hide-grass           avg=10.7 ms  p95=13.9 ms  max=14.3 ms  Δavg vs baseline=+4.8 ms (+80%)
  hide-vegetation      avg=5.9 ms  p95=7.1 ms  max=8.6 ms  Δavg vs baseline=-0.0 ms (-1%)
  no vegetation/grass  avg=6.6 ms  p95=7.9 ms  max=9.3 ms  Δavg vs baseline=+0.7 ms (+12%)
  hide-environment     avg=7.4 ms  p95=11.2 ms  max=14.3 ms  Δavg vs baseline=+1.4 ms (+24%)
  hide-settlement      avg=6.5 ms  p95=8.0 ms  max=8.1 ms  Δavg vs baseline=+0.5 ms (+9%)
  no water             avg=6.5 ms  p95=8.3 ms  max=8.9 ms  Δavg vs baseline=+0.6 ms (+10%)
  hide-terrain         avg=10.2 ms  p95=13.5 ms  max=15.2 ms  Δavg vs baseline=+4.2 ms (+72%)
  hide-npc-fauna       avg=6.0 ms  p95=9.5 ms  max=11.8 ms  Δavg vs baseline=+0.1 ms (+2%)
  no-shadows           avg=6.3 ms  p95=8.9 ms  max=9.7 ms  Δavg vs baseline=+0.4 ms (+7%)
  no-ao                avg=6.8 ms  p95=8.3 ms  max=8.4 ms  Δavg vs baseline=+0.8 ms (+14%)
  no-bloom             avg=7.8 ms  p95=11.4 ms  max=11.6 ms  Δavg vs baseline=+1.8 ms (+31%)
  no-smaa              avg=7.7 ms  p95=11.2 ms  max=11.9 ms  Δavg vs baseline=+1.8 ms (+30%)
  no-god-rays          avg=6.4 ms  p95=7.8 ms  max=8.0 ms  Δavg vs baseline=+0.5 ms (+9%)
  no-film-grade        avg=5.6 ms  p95=7.1 ms  max=7.3 ms  Δavg vs baseline=-0.3 ms (-5%)
  no postprocessing    avg=6.3 ms  p95=8.0 ms  max=10.0 ms  Δavg vs baseline=+0.4 ms (+7%)
  no mirrors           avg=6.0 ms  p95=7.2 ms  max=9.4 ms  Δavg vs baseline=+0.1 ms (+2%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (24 samples resolved during the baseline window)
  GPU elapsed   avg=21.5 ms  p95=24.2 ms  max=24.4 ms
  CPU wall      avg=5.9 ms  p95=8.1 ms  max=8.5 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

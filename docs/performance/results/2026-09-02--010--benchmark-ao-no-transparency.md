# AO-NO-TRANSPARENCY-AWARE

> http://localhost:5577/?benchmark=stream&seed=42&res=193&aoNoTransparencyAware=1

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
  viewport: 1536x826
  anchor: (-8.1, -11.5)
  route: start=(-8.1, -11.5) speed=14.4 m/s duration=30s

FPS:
  avg: 42.4
  min: 5
  p1: 10

Frame time:
  avg: 23.6 ms
  p95: 60.8 ms
  max: 195.5 ms

Rendering:
  draw calls: 702 avg / 1735 max
  triangles: 8.07M avg
  mirror draws: 151 avg
  geometries: 814
  textures: 433

Scene (one-pass estimate):
  terrain        draws=68 tris=5.01M meshes=68 inst=68
  grass          draws=60 tris=803.3k meshes=60 inst=94116
  vegetation     draws=165 tris=1.49M meshes=165 inst=876
  environment    draws=67 tris=24.8k meshes=67 inst=91
  settlement     draws=640 tris=679.4k meshes=640 inst=1151
  water          draws=47 tris=3.40M meshes=47 inst=47
  npc            draws=181 tris=127.9k meshes=181 inst=181
  fauna          draws=167 tris=46.9k meshes=167 inst=167
  items          draws=172 tris=19.7k meshes=172 inst=172
  other          draws=376 tris=23.8k meshes=376 inst=376

Systems:
  TERRAIN        2.7 ms
  WATER          3.0 ms
  NPC            2.0 ms
  FAUNA          0.6 ms
  PHYSICS        0.1 ms
  RENDER         12.1 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. TERRAIN

Critical spikes:
  STREAMING: 59
  GRASS: 8

Hitches (>= 8 ms):
  chunk mesh             n=59 avg=43.2 max=83.2
  grass generation       n=8 avg=9.6 max=11.3

Isolation probes:
  full               render=7.3 ms draws=262 tris=5.74M
  hide-grass         render=7.0 ms draws=235 tris=5.07M
  hide-vegetation    render=5.9 ms draws=141 tris=3.70M
  hide-vegetation-grass render=5.6 ms draws=117 tris=3.07M
  hide-environment   render=7.8 ms draws=254 tris=5.76M
  hide-settlement    render=6.9 ms draws=246 tris=5.73M
  hide-water         render=8.6 ms draws=244 tris=4.83M
  hide-terrain       render=7.1 ms draws=227 tris=3.49M
  hide-npc-fauna     render=6.8 ms draws=263 tris=5.74M
  no-shadows         render=9.0 ms draws=258 tris=5.58M
  no-ao              render=7.3 ms draws=257 tris=5.80M
  no-bloom           render=7.4 ms draws=249 tris=5.74M
  no-smaa            render=8.3 ms draws=261 tris=5.74M
  no-god-rays        render=11.8 ms draws=266 tris=5.80M
  no-film-grade      render=9.2 ms draws=262 tris=5.74M
  no-postprocessing  render=6.2 ms draws=243 tris=5.85M
  no-reflections     render=7.8 ms draws=202 tris=4.93M

Frame attribution:
  frame max: 195.5 ms
  largest labelled hitch: 83.2 ms
  unattributed: 112.3 ms

Recommendation:
RENDER is the largest sustained CPU-measured category, but composer submission time can include GPU wait — not confirmed as a CPU bottleneck without isolation probes.


[Seedvale Program Census]

Programs created: 107
Program count: final=106 max=106

By frame:
  frame 0   +30 programs   <== largest transition
  frame 1   +2 programs
  frame 5   +1 program
  frame 12   +10 programs
  frame 64   +11 programs
  frame 67   +2 programs
  frame 73   +7 programs
  frame 83   +1 program
  frame 87   +1 program
  frame 89   +1 program
  frame 128   +1 program
  frame 173   +1 program
  frame 198   +2 programs
  frame 449   +1 program
  frame 660   +1 program
  frame 1459   +15 programs
  frame 1495   +4 programs
  frame 1690   +16 programs

Largest transition — frame 0 (+30 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=postprocess-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=6f35c468-102f-4e99-8b88-b0e8e0051ad6 (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=postprocess-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=e02e3d53-b681-42a0-92ff-629d7b42f8d5
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=6e92caaf stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=0225d12b-3c45-4566-a1d8-8ebad8666eea
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=postprocess-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=6a123d74-750f-42bf-b131-d79546981e1b
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=bd95ed9d stage=postprocess-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=65903b9a-d596-4d27-85a5-70dabbb98049
  #5 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=ae169224 fHash=9b2a34e4 stage=postprocess-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=dbc4c573-1127-427f-b592-819d51a71e57
  #6 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=postprocess-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=ddd78ee3-4708-4715-87bd-2fa27ec5c1a7
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=940d6eed-b6da-45b4-a268-39f49805fddb
  #8 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=5b43c776 fHash=7a30d838 stage=postprocess-render
  #9 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=postprocess-render
  #10 type=MeshStandardMaterial name='Black' bucket=other cacheKey=physical,STANDARD,,highp… vHash=deee2625 fHash=497d8e73 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=09367e63-7c75-4cba-a33a-074c044f8352 (Black)
  #11 type=MeshStandardMaterial name='Green' bucket=other cacheKey=physical,STANDARD,,highp… vHash=589b45c0 fHash=a81023c3 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=d1f87b83-237d-4193-ba93-b2b796092fb3 (Green)
  #12 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=279cec18 fHash=4d6bcede stage=postprocess-render
  #13 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=84736a68 fHash=ffecb62a stage=postprocess-render
  #14 type=ShaderMaterial name='' cacheKey=16,17,highp,srgb-linear,… vHash=aa2edbee fHash=76ced00a stage=postprocess-render
  #15 type=ShaderMaterial name='' cacheKey=18,19,highp,srgb-linear,… vHash=7bae0bb2 fHash=fb55b3c0 stage=postprocess-render
  #16 type=ShaderMaterial name='' cacheKey=20,21,highp,srgb-linear,… vHash=436caea4 fHash=2d687ef1 stage=postprocess-render
  #17 type=ShaderMaterial name='' cacheKey=22,23,SMAA_THRESHOLD,0.1… vHash=886438e7 fHash=dc2a89b5 stage=postprocess-render
  #18 type=ShaderMaterial name='' cacheKey=24,25,SMAA_MAX_SEARCH_ST… vHash=d99a5b29 fHash=109e33fc stage=postprocess-render
  #19 type=ShaderMaterial name='' cacheKey=26,27,highp,srgb-linear,… vHash=2003ced8 fHash=db0f470a stage=postprocess-render
  #20 type=ShaderMaterial name='' cacheKey=28,29,highp,srgb-linear,… vHash=28dfa407 fHash=9775cd0e stage=postprocess-render
  #21 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,6,hi… vHash=756a0b19 fHash=5c741650 stage=postprocess-render
  #22 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,10,h… vHash=b2354ff2 fHash=2aad9943 stage=postprocess-render
  #23 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,14,h… vHash=ea82969e fHash=a2297d9f stage=postprocess-render
  #24 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,18,h… vHash=7dab8d9a fHash=1022767b stage=postprocess-render
  #25 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,22,h… vHash=378e1fb7 fHash=ce0bf6b4 stage=postprocess-render
  #26 type=ShaderMaterial name='' cacheKey=30,32,NUM_MIPS,5,highp,s… vHash=78acf7ea fHash=707f290c stage=postprocess-render
  #27 type=ShaderMaterial name='' cacheKey=33,34,highp,srgb-linear,… vHash=a312c579 fHash=c05e2256 stage=postprocess-render
  #28 type=ShaderMaterial name='GodRaysShader' cacheKey=35,36,highp,srgb-linear,… vHash=b817515d fHash=ccc98549 stage=postprocess-render
  #29 type=RawShaderMaterial name='OutputShader' cacheKey=37,38,SRGB_TRANSFER,,ACE… vHash=5d2c950f fHash=c1247d7 stage=postprocess-render

Differences within frame 0 (grouped by material type):
  ShaderMaterial (24 programs):
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=ae169224, #6=e6d01ae7, #8=5b43c776, #12=279cec18, #13=84736a68, #14=aa2edbee, #15=7bae0bb2, #16=436caea4, #17=886438e7, #18=d99a5b29, #19=2003ced8, #20=28dfa407, #21=756a0b19, #22=b2354ff2, #23=ea82969e, #24=7dab8d9a, #25=378e1fb7, #26=78acf7ea, #27=a312c579, #28=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=bd95ed9d, #5=9b2a34e4, #6=e34491ff, #8=7a30d838, #12=4d6bcede, #13=ffecb62a, #14=76ced00a, #15=fb55b3c0, #16=2d687ef1, #17=dc2a89b5, #18=109e33fc, #19=db0f470a, #20=9775cd0e, #21=5c741650, #22=2aad9943, #23=a2297d9f, #24=1022767b, #25=ce0bf6b4, #26=707f290c, #27=c05e2256, #28=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=grass, #6=water, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #8=(unset), #12=(unset), #13=(unset), #14=(unset), #15=(unset), #16=(unset), #17=(unset), #18=(unset), #19=(unset), #20=(unset), #21=(unset), #22=(unset), #23=(unset), #24=(unset), #25=(unset), #26=(unset), #27=(unset), #28=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=false, #6=true, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown)
  MeshStandardMaterial (4 programs):
    vertexShaderHash differs: #2=5c2c57a3, #7=e3408c64, #10=deee2625, #11=589b45c0
    fragmentShaderHash differs: #2=6e92caaf, #7=c0b8fc9f, #10=497d8e73, #11=a81023c3
    bucket differs: #2=terrain, #7=other, #10=other, #11=other
    flag flatShading differs: #2=false, #7=true, #10=false, #11=false
    flag normalMap differs: #2=true, #7=false, #10=false, #11=false
    flag vertexColors differs: #2=true, #7=false, #10=false, #11=false
  SpriteMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)
  RawShaderMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)


[Seedvale Program Attribution]



Frame 1459 (+15):
  Program #72
    material: MeshStandardMaterial ''
    materialUuid: 0225d12b-3c45-4566-a1d8-8ebad8666eea
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 6ab20547
  Program #73
    material: MeshStandardMaterial 'Wood'
    materialUuid: 26f392b8-b205-451d-8a8a-8dd863752572
    object: Mesh 'chunk-environment-region-1,0|largeRock-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 320d0e37
    fragmentShaderHash: 65cafcc2
  Program #74
    material: MeshStandardMaterial 'Green'
    materialUuid: 60bf98b5-7a36-4c9b-8023-db52b6715c02
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
    materialUuid: e7c2b85e-f871-4813-8678-343911ce2429
    object: Mesh 'chunk-vegetation-region-1,0|reed-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,1,8519687,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 99d3d263
    fragmentShaderHash: d45a24e0
  Program #76
    material: MeshStandardMaterial 'BirchTree_Bark'
    materialUuid: ec8a3fd0-0912-412a-bf7e-6dd030a129a3
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a920e788
    fragmentShaderHash: 3c40f72c
  Program #77
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: 8024498a-0573-4bef-8d28-4c242654faa7
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
  Program #78
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: 40e72ba3-01a6-449e-958d-739bfaa411fe
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #79
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 33cd23bf-981b-4bb1-a775-bf7b3ddb8915
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
    materialUuid: fa6eb33b-2bea-415c-9fca-4ba3669c46ec
    object: SkinnedMesh 'mesh_1_1'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 27e30ee8
    fragmentShaderHash: 731f1f78
  Program #81
    material: MeshStandardMaterial 'Green'
    materialUuid: d1f87b83-237d-4193-ba93-b2b796092fb3
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
    material: MeshStandardMaterial 'White'
    materialUuid: ef5ca6bd-44f7-434b-818b-a325fde1fcfb
    object: Mesh 'house-static-batch:16'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ad51b98e
    fragmentShaderHash: dcc05553
  Program #83
    material: MeshStandardMaterial 'MI_WoodTrim'
    materialUuid: d14bdd22-c057-47cb-8ae0-d090155fd226
    object: Mesh 'house-static-batch:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,uv,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3c9f4a85
    fragmentShaderHash: dd9a9763
  Program #84
    material: MeshStandardMaterial ''
    materialUuid: c073b4c1-fd7f-4706-8eab-fd639386ac56
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519687,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: d7607dd2
    fragmentShaderHash: 83e94369
  Program #85
    material: MeshStandardMaterial 'MI_WindowGlass'
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8392707,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 30e685d1
    fragmentShaderHash: 53dde5bb
  Program #86
    material: MeshStandardMaterial 'MI_WindowGlass'
    materialUuid: b2626488-8817-4421-aeed-80128c8aaa35
    object: Mesh 'house-static-batch:20'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8388611,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5f2e9b54
    fragmentShaderHash: 372a363a

Frame 1690 (+16):
  Program #91
    material: ShaderMaterial 'SkyShader'
    materialUuid: 6f35c468-102f-4e99-8b88-b0e8e0051ad6
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #92
    material: ShaderMaterial ''
    materialUuid: dbc4c573-1127-427f-b592-819d51a71e57
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: ae169224
    fragmentShaderHash: 8c624cc7
  Program #93
    material: MeshStandardMaterial ''
    materialUuid: 0225d12b-3c45-4566-a1d8-8ebad8666eea
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: b3121184
  Program #94
    material: MeshStandardMaterial 'Wood'
    materialUuid: 26f392b8-b205-451d-8a8a-8dd863752572
    object: Mesh 'chunk-environment-region-1,0|largeRock-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5cee842b
    fragmentShaderHash: 1683d5db
  Program #95
    material: MeshStandardMaterial 'Green'
    materialUuid: 60bf98b5-7a36-4c9b-8023-db52b6715c02
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
    materialUuid: e7c2b85e-f871-4813-8678-343911ce2429
    object: Mesh 'chunk-vegetation-region-1,0|reed-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8520711,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a369060f
    fragmentShaderHash: dc6ebbb1
  Program #97
    material: MeshStandardMaterial 'BirchTree_Bark'
    materialUuid: ec8a3fd0-0912-412a-bf7e-6dd030a129a3
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a282481e
    fragmentShaderHash: 21c5c77d
  Program #98
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: 8024498a-0573-4bef-8d28-4c242654faa7
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
  Program #99
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: 40e72ba3-01a6-449e-958d-739bfaa411fe
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #100
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 33cd23bf-981b-4bb1-a775-bf7b3ddb8915
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
    materialUuid: 09367e63-7c75-4cba-a33a-074c044f8352
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: deee2625
    fragmentShaderHash: da938326
  Program #102
    material: MeshStandardMaterial 'Green'
    materialUuid: d1f87b83-237d-4193-ba93-b2b796092fb3
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
    material: MeshStandardMaterial ''
    materialUuid: c073b4c1-fd7f-4706-8eab-fd639386ac56
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520711,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 66d360c8
    fragmentShaderHash: 4e17aba
  Program #104
    material: ShaderMaterial ''
    materialUuid: ddd78ee3-4708-4715-87bd-2fa27ec5c1a7
    object: Mesh 'ocean'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: e6d01ae7
    fragmentShaderHash: 215382b6
  Program #105
    material: ShaderMaterial ''
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 10,11,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,0,8389635,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 5b43c776
    fragmentShaderHash: 8decad4f
  Program #106
    material: ShaderMaterial ''
    materialUuid: 77761e19-a238-4a4b-b2cd-f96d16441375
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
    

[Seedvale Program Compile Cost]

No isolated per-program GPU compile/link timer exists in the public Three.js/WebGL API without patching internals (out of scope here). Each number below is the wall-clock duration of the renderer.render() call (mirror-render/postprocess-render) that first-used the program, reported ONLY when that program was the single new program created during that specific call — an upper bound that also includes the rest of that call's render cost, not an isolated compile/link timer.
Excluded — no reliable per-program timing: 99 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 5
  #32
      material: MeshStandardMaterial 'Main'
      object: SkinnedMesh 'mesh_0'
      asset: /models/fauna/wolf.glb
      compile/link: 74.2 ms  (upper bound — whole postprocess-render call, see note above)

Frame 83
  #63
      material: MeshBasicMaterial ''
      object: Mesh 'Fire_Cube001'
      asset: /models/fx/fire.glb
      compile/link: 12.5 ms  (upper bound — whole postprocess-render call, see note above)

Frame 87
  #64
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 13.5 ms  (upper bound — whole postprocess-render call, see note above)

Frame 89
  #65
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 13.2 ms  (upper bound — whole postprocess-render call, see note above)

Frame 128
  #66
      material: MeshStandardMaterial 'BirchTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-3:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 13.5 ms  (upper bound — whole mirror-render call, see note above)

Frame 173
  #67
      material: MeshStandardMaterial 'PineTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-6:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 31.5 ms  (upper bound — whole postprocess-render call, see note above)

Frame 449
  #70
      material: MeshStandardMaterial 'lambert2SG'
      object: Mesh 'chunk-vegetation-region-1,0|reed-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 34.6 ms  (upper bound — whole mirror-render call, see note above)

Frame 660
  #71
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 60.7 ms  (upper bound — whole postprocess-render call, see note above)

Summary:
  total measured compile/link time: 253.7 ms
  programs >1 ms: 8
  max: 74.2 ms (#32)


[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=7.3 ms  p95=11.5 ms  max=12.2 ms  Δavg vs baseline=—
  hide-grass           avg=7.0 ms  p95=10.9 ms  max=14.3 ms  Δavg vs baseline=-0.2 ms (-3%)
  hide-vegetation      avg=5.9 ms  p95=8.3 ms  max=11.2 ms  Δavg vs baseline=-1.4 ms (-19%)
  no vegetation/grass  avg=5.6 ms  p95=7.8 ms  max=8.5 ms  Δavg vs baseline=-1.7 ms (-23%)
  hide-environment     avg=7.8 ms  p95=12.1 ms  max=12.3 ms  Δavg vs baseline=+0.5 ms (+7%)
  hide-settlement      avg=6.9 ms  p95=10.9 ms  max=11.5 ms  Δavg vs baseline=-0.4 ms (-5%)
  no water             avg=8.6 ms  p95=16.2 ms  max=16.9 ms  Δavg vs baseline=+1.3 ms (+18%)
  hide-terrain         avg=7.1 ms  p95=11.0 ms  max=11.2 ms  Δavg vs baseline=-0.1 ms (-2%)
  hide-npc-fauna       avg=6.8 ms  p95=12.3 ms  max=13.0 ms  Δavg vs baseline=-0.5 ms (-7%)
  no-shadows           avg=9.0 ms  p95=16.7 ms  max=18.7 ms  Δavg vs baseline=+1.8 ms (+24%)
  no-ao                avg=7.3 ms  p95=11.0 ms  max=16.0 ms  Δavg vs baseline=+0.0 ms (+0%)
  no-bloom             avg=7.4 ms  p95=13.4 ms  max=14.3 ms  Δavg vs baseline=+0.2 ms (+2%)
  no-smaa              avg=8.3 ms  p95=13.0 ms  max=13.8 ms  Δavg vs baseline=+1.0 ms (+14%)
  no-god-rays          avg=11.8 ms  p95=16.5 ms  max=21.6 ms  Δavg vs baseline=+4.5 ms (+62%)
  no-film-grade        avg=9.2 ms  p95=13.6 ms  max=15.0 ms  Δavg vs baseline=+1.9 ms (+26%)
  no postprocessing    avg=6.2 ms  p95=7.6 ms  max=9.2 ms  Δavg vs baseline=-1.1 ms (-15%)
  no mirrors           avg=7.8 ms  p95=13.8 ms  max=18.7 ms  Δavg vs baseline=+0.5 ms (+8%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (27 samples resolved during the baseline window)
  GPU elapsed   avg=18.6 ms  p95=22.1 ms  max=23.4 ms
  CPU wall      avg=7.3 ms  p95=11.5 ms  max=12.2 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

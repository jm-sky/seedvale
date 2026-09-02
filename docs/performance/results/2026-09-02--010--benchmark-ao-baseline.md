# BASELINE

> http://localhost:5577/?benchmark=stream&seed=42&res=193

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
  avg: 39.3
  min: 3
  p1: 11

Frame time:
  avg: 25.4 ms
  p95: 59 ms
  max: 309.8 ms

Rendering:
  draw calls: 780 avg / 1836 max
  triangles: 8.59M avg
  mirror draws: 166 avg
  geometries: 817
  textures: 452

Scene (one-pass estimate):
  terrain        draws=70 tris=5.16M meshes=70 inst=70
  grass          draws=60 tris=803.3k meshes=60 inst=94116
  vegetation     draws=165 tris=1.49M meshes=165 inst=876
  environment    draws=67 tris=24.8k meshes=67 inst=91
  settlement     draws=640 tris=679.4k meshes=640 inst=1151
  water          draws=49 tris=3.55M meshes=49 inst=49
  npc            draws=181 tris=127.9k meshes=181 inst=181
  fauna          draws=167 tris=46.9k meshes=167 inst=167
  items          draws=172 tris=19.7k meshes=172 inst=172
  other          draws=375 tris=23.7k meshes=375 inst=375

Systems:
  TERRAIN        2.3 ms
  WATER          2.8 ms
  NPC            1.6 ms
  FAUNA          0.5 ms
  PHYSICS        0.1 ms
  RENDER         15.6 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. TERRAIN

Critical spikes:
  STREAMING: 61
  GRASS: 2

Hitches (>= 8 ms):
  chunk mesh             n=61 avg=35.8 max=50.8
  grass generation       n=2 avg=9.4 max=10.3

Isolation probes:
  full               render=21.3 ms draws=292 tris=6.72M
  hide-grass         render=12.1 ms draws=259 tris=6.00M
  hide-vegetation    render=12.7 ms draws=161 tris=4.58M
  hide-vegetation-grass render=12.4 ms draws=136 tris=3.93M
  hide-environment   render=9.5 ms draws=271 tris=6.59M
  hide-settlement    render=10.6 ms draws=257 tris=6.47M
  hide-water         render=14.4 ms draws=253 tris=4.86M
  hide-terrain       render=12.4 ms draws=249 tris=4.35M
  hide-npc-fauna     render=10.0 ms draws=270 tris=6.43M
  no-shadows         render=18.8 ms draws=280 tris=6.47M
  no-ao              render=8.6 ms draws=256 tris=5.76M
  no-bloom           render=12.6 ms draws=277 tris=6.73M
  no-smaa            render=12.9 ms draws=280 tris=6.62M
  no-god-rays        render=16.8 ms draws=297 tris=6.86M
  no-film-grade      render=12.5 ms draws=283 tris=6.62M
  no-postprocessing  render=10.9 ms draws=252 tris=5.91M
  no-reflections     render=15.1 ms draws=215 tris=5.68M

Frame attribution:
  frame max: 309.8 ms
  largest labelled hitch: 50.8 ms
  unattributed: 259 ms

Recommendation:
Largest frame (309.8 ms) is not explained by labelled hitches (largest 50.8 ms) — unattributed frame spike, not a category bottleneck.


[Seedvale Program Census]

Programs created: 108
Program count: final=107 max=107

By frame:
  frame 0   +31 programs   <== largest transition
  frame 1   +2 programs
  frame 6   +1 program
  frame 12   +5 programs
  frame 13   +2 programs
  frame 23   +3 programs
  frame 43   +11 programs
  frame 45   +3 programs
  frame 46   +6 programs
  frame 62   +1 program
  frame 85   +1 program
  frame 88   +1 program
  frame 133   +1 program
  frame 171   +1 program
  frame 201   +1 program
  frame 203   +1 program
  frame 441   +1 program
  frame 713   +1 program
  frame 1438   +15 programs
  frame 1462   +4 programs
  frame 1655   +16 programs

Largest transition — frame 0 (+31 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=postprocess-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=a942f30c-0a58-4a67-809e-ca873a7bbb1d (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=postprocess-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=54b7fe92-9eb4-492d-8edd-0a2d8132e24d
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=6e92caaf stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=879c4768-2008-4a52-9750-b62a4f39ea08
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=postprocess-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=f0636917-c580-4fd8-a5be-54b88bd6718d
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=bd95ed9d stage=postprocess-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=4be9e7a7-a733-4d10-a9a7-75c28f69ffe5
  #5 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=ae169224 fHash=9b2a34e4 stage=postprocess-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=abd1bc7b-98f6-45a9-a661-0f04b1619f0d
  #6 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=postprocess-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=124b36cc-8f19-48e7-943b-b98129eb5ed2
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=99b0bdc0-cd9d-4d38-accf-6fca319a5b38
  #8 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=5b43c776 fHash=7a30d838 stage=postprocess-render
  #9 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=postprocess-render
  #10 type=MeshStandardMaterial name='Black' bucket=other cacheKey=physical,STANDARD,,highp… vHash=deee2625 fHash=497d8e73 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=7a06bf89-630b-443d-af5a-60008ba4f911 (Black)
  #11 type=MeshStandardMaterial name='Green' bucket=other cacheKey=physical,STANDARD,,highp… vHash=589b45c0 fHash=a81023c3 stage=postprocess-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=64c4d3b6-e553-41a9-8fee-df9cf1958b06 (Green)
  #12 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=8ebba168 fHash=48d333a9 stage=postprocess-render
  #13 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=279cec18 fHash=4d6bcede stage=postprocess-render
  #14 type=ShaderMaterial name='' cacheKey=16,17,highp,srgb-linear,… vHash=84736a68 fHash=ffecb62a stage=postprocess-render
  #15 type=ShaderMaterial name='' cacheKey=18,19,highp,srgb-linear,… vHash=aa2edbee fHash=76ced00a stage=postprocess-render
  #16 type=ShaderMaterial name='' cacheKey=20,21,highp,srgb-linear,… vHash=7bae0bb2 fHash=fb55b3c0 stage=postprocess-render
  #17 type=ShaderMaterial name='' cacheKey=22,23,highp,srgb-linear,… vHash=436caea4 fHash=2d687ef1 stage=postprocess-render
  #18 type=ShaderMaterial name='' cacheKey=24,25,SMAA_THRESHOLD,0.1… vHash=886438e7 fHash=dc2a89b5 stage=postprocess-render
  #19 type=ShaderMaterial name='' cacheKey=26,27,SMAA_MAX_SEARCH_ST… vHash=d99a5b29 fHash=109e33fc stage=postprocess-render
  #20 type=ShaderMaterial name='' cacheKey=28,29,highp,srgb-linear,… vHash=2003ced8 fHash=db0f470a stage=postprocess-render
  #21 type=ShaderMaterial name='' cacheKey=30,31,highp,srgb-linear,… vHash=28dfa407 fHash=9775cd0e stage=postprocess-render
  #22 type=ShaderMaterial name='' cacheKey=32,33,KERNEL_RADIUS,6,hi… vHash=756a0b19 fHash=5c741650 stage=postprocess-render
  #23 type=ShaderMaterial name='' cacheKey=32,33,KERNEL_RADIUS,10,h… vHash=b2354ff2 fHash=2aad9943 stage=postprocess-render
  #24 type=ShaderMaterial name='' cacheKey=32,33,KERNEL_RADIUS,14,h… vHash=ea82969e fHash=a2297d9f stage=postprocess-render
  #25 type=ShaderMaterial name='' cacheKey=32,33,KERNEL_RADIUS,18,h… vHash=7dab8d9a fHash=1022767b stage=postprocess-render
  #26 type=ShaderMaterial name='' cacheKey=32,33,KERNEL_RADIUS,22,h… vHash=378e1fb7 fHash=ce0bf6b4 stage=postprocess-render
  #27 type=ShaderMaterial name='' cacheKey=32,34,NUM_MIPS,5,highp,s… vHash=78acf7ea fHash=707f290c stage=postprocess-render
  #28 type=ShaderMaterial name='' cacheKey=35,36,highp,srgb-linear,… vHash=a312c579 fHash=c05e2256 stage=postprocess-render
  #29 type=ShaderMaterial name='GodRaysShader' cacheKey=37,38,highp,srgb-linear,… vHash=b817515d fHash=ccc98549 stage=postprocess-render
  #30 type=RawShaderMaterial name='OutputShader' cacheKey=39,40,SRGB_TRANSFER,,ACE… vHash=5d2c950f fHash=c1247d7 stage=postprocess-render

Differences within frame 0 (grouped by material type):
  ShaderMaterial (25 programs):
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=ae169224, #6=e6d01ae7, #8=5b43c776, #12=8ebba168, #13=279cec18, #14=84736a68, #15=aa2edbee, #16=7bae0bb2, #17=436caea4, #18=886438e7, #19=d99a5b29, #20=2003ced8, #21=28dfa407, #22=756a0b19, #23=b2354ff2, #24=ea82969e, #25=7dab8d9a, #26=378e1fb7, #27=78acf7ea, #28=a312c579, #29=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=bd95ed9d, #5=9b2a34e4, #6=e34491ff, #8=7a30d838, #12=48d333a9, #13=4d6bcede, #14=ffecb62a, #15=76ced00a, #16=fb55b3c0, #17=2d687ef1, #18=dc2a89b5, #19=109e33fc, #20=db0f470a, #21=9775cd0e, #22=5c741650, #23=2aad9943, #24=a2297d9f, #25=1022767b, #26=ce0bf6b4, #27=707f290c, #28=c05e2256, #29=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=grass, #6=water, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #8=(unset), #12=(unset), #13=(unset), #14=(unset), #15=(unset), #16=(unset), #17=(unset), #18=(unset), #19=(unset), #20=(unset), #21=(unset), #22=(unset), #23=(unset), #24=(unset), #25=(unset), #26=(unset), #27=(unset), #28=(unset), #29=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=false, #6=true, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #12=(unknown), #13=(unknown), #14=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown)
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



Frame 1438 (+15):
  Program #73
    material: MeshStandardMaterial ''
    materialUuid: 879c4768-2008-4a52-9750-b62a4f39ea08
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 6ab20547
  Program #74
    material: MeshStandardMaterial 'Stone'
    materialUuid: a315f451-d159-4f93-8237-4c0f2715fc50
    object: Mesh 'chunk-environment-region-1,0|largeRock-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: b3c52649
    fragmentShaderHash: acd7dae2
  Program #75
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 85736f02-5c05-401e-b07e-9ae1e530c4d1
    object: Mesh 'chunk-vegetation-region-1,0|reed-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,1,8519687,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 99d3d263
    fragmentShaderHash: d45a24e0
  Program #76
    material: MeshStandardMaterial 'Green'
    materialUuid: 5da5c5b7-3501-47ee-9c43-b566c326d39b
    object: Mesh 'mesh_0_1'
    asset: /models/nature/tree_a.glb
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
    material: MeshStandardMaterial 'BirchTree_Bark'
    materialUuid: 8c881262-b649-4096-80bd-d1f9d9222977
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a920e788
    fragmentShaderHash: 3c40f72c
  Program #78
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: e18df32c-26ab-48db-a509-34bbb879eb52
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
  Program #79
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: cb2db80b-6e46-4250-b25b-551e34fc96db
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #80
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 99098154-6b50-48c5-bc28-da34259c985b
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
  Program #81
    material: MeshStandardMaterial 'Brown'
    materialUuid: 4457c6e6-a516-4a1a-a0bb-6ad7e663730f
    object: SkinnedMesh 'mesh_1_1'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 27e30ee8
    fragmentShaderHash: 731f1f78
  Program #82
    material: MeshStandardMaterial 'Green'
    materialUuid: 64c4d3b6-e553-41a9-8fee-df9cf1958b06
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
  Program #83
    material: MeshStandardMaterial 'White'
    materialUuid: cd5b87a1-4068-45ef-9510-5b887396bc79
    object: Mesh 'house-static-batch:16'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ad51b98e
    fragmentShaderHash: dcc05553
  Program #84
    material: MeshStandardMaterial 'MI_WoodTrim'
    materialUuid: e3fcdce7-b97d-4e86-b1c5-e6329128f550
    object: Mesh 'house-static-batch:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,uv,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3c9f4a85
    fragmentShaderHash: dd9a9763
  Program #85
    material: MeshStandardMaterial ''
    materialUuid: ea004606-bde9-4499-b3fd-9c0bf4888593
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519687,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: d7607dd2
    fragmentShaderHash: 83e94369
  Program #86
    material: MeshStandardMaterial 'MI_WindowGlass'
    materialUuid: unknown
    object: unknown ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8392707,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 30e685d1
    fragmentShaderHash: 53dde5bb
  Program #87
    material: MeshStandardMaterial 'MI_WindowGlass'
    materialUuid: 590cd295-fdb8-47cc-9798-7661dce6d414
    object: Mesh 'house-static-batch:20'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8388611,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5f2e9b54
    fragmentShaderHash: 372a363a

Frame 1655 (+16):
  Program #92
    material: ShaderMaterial 'SkyShader'
    materialUuid: a942f30c-0a58-4a67-809e-ca873a7bbb1d
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #93
    material: ShaderMaterial ''
    materialUuid: abd1bc7b-98f6-45a9-a661-0f04b1619f0d
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: ae169224
    fragmentShaderHash: 8c624cc7
  Program #94
    material: MeshStandardMaterial ''
    materialUuid: 879c4768-2008-4a52-9750-b62a4f39ea08
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: b3121184
  Program #95
    material: MeshStandardMaterial 'Stone'
    materialUuid: a315f451-d159-4f93-8237-4c0f2715fc50
    object: Mesh 'chunk-environment-region-1,0|largeRock-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a9733c9d
    fragmentShaderHash: 80dabd3b
  Program #96
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 85736f02-5c05-401e-b07e-9ae1e530c4d1
    object: Mesh 'chunk-vegetation-region-1,0|reed-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8520711,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a369060f
    fragmentShaderHash: dc6ebbb1
  Program #97
    material: MeshStandardMaterial 'Green'
    materialUuid: 5da5c5b7-3501-47ee-9c43-b566c326d39b
    object: Mesh 'mesh_0_1'
    asset: /models/nature/tree_a.glb
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
    material: MeshStandardMaterial 'BirchTree_Bark'
    materialUuid: 8c881262-b649-4096-80bd-d1f9d9222977
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a282481e
    fragmentShaderHash: 21c5c77d
  Program #99
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: e18df32c-26ab-48db-a509-34bbb879eb52
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
  Program #100
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: cb2db80b-6e46-4250-b25b-551e34fc96db
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #101
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 99098154-6b50-48c5-bc28-da34259c985b
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
  Program #102
    material: MeshStandardMaterial 'Black'
    materialUuid: 7a06bf89-630b-443d-af5a-60008ba4f911
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: deee2625
    fragmentShaderHash: da938326
  Program #103
    material: MeshStandardMaterial 'Green'
    materialUuid: 64c4d3b6-e553-41a9-8fee-df9cf1958b06
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
  Program #104
    material: MeshStandardMaterial ''
    materialUuid: ea004606-bde9-4499-b3fd-9c0bf4888593
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520711,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 66d360c8
    fragmentShaderHash: 4e17aba
  Program #105
    material: ShaderMaterial ''
    materialUuid: 124b36cc-8f19-48e7-943b-b98129eb5ed2
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
    fragmentShaderHash: 8decad4f
  Program #107
    material: ShaderMaterial ''
    materialUuid: ddc6a7c5-6a0b-4e4a-9232-12f860eae0f7
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
    
[Seedvale Program Compile Cost]

No isolated per-program GPU compile/link timer exists in the public Three.js/WebGL API without patching internals (out of scope here). Each number below is the wall-clock duration of the renderer.render() call (mirror-render/postprocess-render) that first-used the program, reported ONLY when that program was the single new program created during that specific call — an upper bound that also includes the rest of that call's render cost, not an isolated compile/link timer.
Excluded — no reliable per-program timing: 98 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 6
  #33
      material: MeshStandardMaterial 'Main'
      object: SkinnedMesh 'mesh_0'
      asset: /models/fauna/wolf.glb
      compile/link: 74.3 ms  (upper bound — whole postprocess-render call, see note above)

Frame 62
  #64
      material: MeshBasicMaterial ''
      object: Mesh 'Fire_Cube001'
      asset: /models/fx/fire.glb
      compile/link: 19.3 ms  (upper bound — whole postprocess-render call, see note above)

Frame 85
  #65
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 15.8 ms  (upper bound — whole postprocess-render call, see note above)

Frame 88
  #66
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 14.8 ms  (upper bound — whole postprocess-render call, see note above)

Frame 133
  #67
      material: MeshStandardMaterial 'BirchTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-3:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 11.6 ms  (upper bound — whole mirror-render call, see note above)

Frame 171
  #68
      material: MeshStandardMaterial 'PineTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-6:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 15.1 ms  (upper bound — whole mirror-render call, see note above)

Frame 201
  #69
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 13.1 ms  (upper bound — whole mirror-render call, see note above)

Frame 203
  #70
      material: MeshStandardMaterial 'Green'
      object: Mesh 'chunk-vegetation-region--1,0|tree-living-1:1'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 10.8 ms  (upper bound — whole mirror-render call, see note above)

Frame 441
  #71
      material: MeshStandardMaterial 'lambert2SG'
      object: Mesh 'chunk-vegetation-region-1,0|reed-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 10.7 ms  (upper bound — whole mirror-render call, see note above)

Frame 713
  #72
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 37.3 ms  (upper bound — whole postprocess-render call, see note above)

Summary:
  total measured compile/link time: 222.8 ms
  programs >1 ms: 10
  max: 74.3 ms (#33)
  
[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=21.3 ms  p95=30.1 ms  max=33.0 ms  Δavg vs baseline=—
  hide-grass           avg=12.1 ms  p95=21.9 ms  max=23.9 ms  Δavg vs baseline=-9.2 ms (-43%)
  hide-vegetation      avg=12.7 ms  p95=22.5 ms  max=24.1 ms  Δavg vs baseline=-8.6 ms (-40%)
  no vegetation/grass  avg=12.4 ms  p95=17.5 ms  max=20.3 ms  Δavg vs baseline=-8.9 ms (-42%)
  hide-environment     avg=9.5 ms  p95=11.0 ms  max=13.7 ms  Δavg vs baseline=-11.7 ms (-55%)
  hide-settlement      avg=10.6 ms  p95=16.8 ms  max=18.9 ms  Δavg vs baseline=-10.7 ms (-50%)
  no water             avg=14.4 ms  p95=32.9 ms  max=36.1 ms  Δavg vs baseline=-6.9 ms (-32%)
  hide-terrain         avg=12.4 ms  p95=19.4 ms  max=22.3 ms  Δavg vs baseline=-8.9 ms (-42%)
  hide-npc-fauna       avg=10.0 ms  p95=15.8 ms  max=17.9 ms  Δavg vs baseline=-11.3 ms (-53%)
  no-shadows           avg=18.8 ms  p95=24.5 ms  max=26.0 ms  Δavg vs baseline=-2.4 ms (-11%)
  no-ao                avg=8.6 ms  p95=11.9 ms  max=13.8 ms  Δavg vs baseline=-12.7 ms (-60%)
  no-bloom             avg=12.6 ms  p95=22.9 ms  max=23.6 ms  Δavg vs baseline=-8.7 ms (-41%)
  no-smaa              avg=12.9 ms  p95=18.8 ms  max=19.1 ms  Δavg vs baseline=-8.4 ms (-39%)
  no-god-rays          avg=16.8 ms  p95=24.0 ms  max=25.6 ms  Δavg vs baseline=-4.4 ms (-21%)
  no-film-grade        avg=12.5 ms  p95=24.0 ms  max=24.4 ms  Δavg vs baseline=-8.8 ms (-41%)
  no postprocessing    avg=10.9 ms  p95=13.9 ms  max=20.9 ms  Δavg vs baseline=-10.4 ms (-49%)
  no mirrors           avg=15.1 ms  p95=23.7 ms  max=23.9 ms  Δavg vs baseline=-6.2 ms (-29%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (21 samples resolved during the baseline window)
  GPU elapsed   avg=23.3 ms  p95=31.5 ms  max=37.9 ms
  CPU wall      avg=21.3 ms  p95=30.1 ms  max=33.0 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

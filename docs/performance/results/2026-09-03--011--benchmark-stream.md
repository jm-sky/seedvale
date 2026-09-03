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
  viewport: 1920x945
  anchor: (-8.1, -11.5)
  route: start=(-8.1, -11.5) speed=14.4 m/s duration=30s

FPS:
  avg: 48.4
  min: 5
  p1: 19

Frame time:
  avg: 20.7 ms
  p95: 38.4 ms
  max: 202.3 ms

Rendering:
  draw calls: 752 avg / 1825 max
  triangles: 8.32M avg
  mirror draws: 165 avg
  geometries: 825
  textures: 450

Scene (one-pass estimate):
  terrain        draws=66 tris=4.87M meshes=66 inst=66
  grass          draws=56 tris=755.6k meshes=56 inst=86924
  vegetation     draws=165 tris=1.49M meshes=165 inst=876
  environment    draws=67 tris=24.8k meshes=67 inst=91
  settlement     draws=646 tris=679.5k meshes=646 inst=1157
  water          draws=45 tris=3.25M meshes=45 inst=45
  npc            draws=181 tris=127.9k meshes=181 inst=181
  fauna          draws=167 tris=46.9k meshes=167 inst=167
  items          draws=172 tris=19.7k meshes=172 inst=172
  other          draws=372 tris=23.4k meshes=372 inst=372

Systems:
  TERRAIN        0.3 ms
  WATER          3.0 ms
  NPC            1.9 ms
  FAUNA          0.6 ms
  PHYSICS        0.1 ms
  RENDER         11.8 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  GRASS: 8
  STREAMING: 5
  WATER: 1

Hitches (>= 8 ms):
  chunk mesh             n=5 avg=9.8 max=14.7
  grass generation       n=8 avg=9.8 max=12.1
  chunk water            n=1 avg=8.2 max=8.2

Isolation probes:
  full               render=6.9 ms draws=267 tris=5.81M
  hide-grass         render=6.2 ms draws=232 tris=5.06M
  hide-vegetation    render=5.5 ms draws=152 tris=3.86M
  hide-vegetation-grass render=7.6 ms draws=120 tris=3.16M
  hide-environment   render=7.7 ms draws=259 tris=5.83M
  hide-settlement    render=5.0 ms draws=254 tris=5.85M
  hide-water         render=5.4 ms draws=249 tris=4.90M
  hide-terrain       render=10.4 ms draws=245 tris=3.63M
  hide-npc-fauna     render=5.7 ms draws=264 tris=5.77M
  no-shadows         render=5.1 ms draws=268 tris=5.72M
  no-ao              render=8.9 ms draws=264 tris=5.86M
  no-bloom           render=10.8 ms draws=264 tris=5.96M
  no-smaa            render=8.3 ms draws=264 tris=5.81M
  no-god-rays        render=6.1 ms draws=261 tris=5.72M
  no-film-grade      render=7.8 ms draws=267 tris=5.81M
  no-postprocessing  render=5.4 ms draws=242 tris=5.77M
  no-reflections     render=5.7 ms draws=205 tris=4.93M

Frame attribution:
  frame max: 202.3 ms
  largest labelled hitch: 14.7 ms
  unattributed: 187.6 ms

Recommendation:
Largest frame (202.3 ms) is not explained by labelled hitches (largest 14.7 ms) — unattributed frame spike, not a category bottleneck.

[Seedvale Program Census]

Programs created: 107
Program count: final=106 max=106

By frame:
  frame 0   +33 programs   <== largest transition
  frame 1   +4 programs
  frame 2   +4 programs
  frame 56   +5 programs
  frame 71   +10 programs
  frame 74   +2 programs
  frame 78   +6 programs
  frame 87   +1 program
  frame 120   +1 program
  frame 128   +1 program
  frame 196   +1 program
  frame 204   +1 program
  frame 218   +1 program
  frame 486   +1 program
  frame 778   +1 program
  frame 1638   +15 programs
  frame 1670   +4 programs
  frame 1881   +16 programs

Largest transition — frame 0 (+33 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=c7d91b87-ccab-4335-a2c9-6db39432e284 (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=bcb6795c-82f5-4bea-9fdf-e62a5d90eefe
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=6e92caaf stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=030f47dd-6227-4dc7-ba3d-356cf31e485b
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=mirror-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=d66f2c83-4f2e-422f-9c7a-599fd4f61a88
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=bd95ed9d stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=69dc4691-926b-4d43-8a02-26f7ab157ffc
  #5 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=ae169224 fHash=9b2a34e4 stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=d1713971-f86e-45e0-81b7-7cc44557395e
  #6 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=bffc5c1f-7c76-4860-aa45-03612323b8fe
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=1df095d3-25bf-4172-9ac8-adaf892875ea
  #8 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=5b43c776 fHash=7a30d838 stage=mirror-render
  #9 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=54e03756 fHash=d391c52 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=7616030c-3e29-4241-a105-c67a6a791a98 (Main)
  #10 type=MeshStandardMaterial name='Material.001' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=a99aa494 fHash=63f9c0d1 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=bbb03a04-1099-4880-a368-321e75bff9d7 (Material.001)
  #11 type=MeshStandardMaterial name='BlackBear_mat' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=9ef75116 fHash=bc151936 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=e8ad9ead-5132-40f3-948a-fb2688a1b15a (BlackBear_mat)
  #12 type=MeshStandardMaterial name='Black' bucket=other cacheKey=physical,STANDARD,,highp… vHash=deee2625 fHash=497d8e73 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=7e47aa56-b0aa-4430-8df3-699aeb019302 (Black)
  #13 type=MeshStandardMaterial name='Green' bucket=other cacheKey=physical,STANDARD,,highp… vHash=589b45c0 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=da16094d-dbe6-4862-a2aa-83a6d76d7cd5 (Green)
  #14 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=mirror-render
  #15 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=279cec18 fHash=4d6bcede stage=postprocess-render
  #16 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=84736a68 fHash=ffecb62a stage=postprocess-render
  #17 type=ShaderMaterial name='' cacheKey=16,17,highp,srgb-linear,… vHash=aa2edbee fHash=76ced00a stage=postprocess-render
  #18 type=ShaderMaterial name='' cacheKey=18,19,highp,srgb-linear,… vHash=7bae0bb2 fHash=fb55b3c0 stage=postprocess-render
  #19 type=ShaderMaterial name='' cacheKey=20,21,highp,srgb-linear,… vHash=436caea4 fHash=2d687ef1 stage=postprocess-render
  #20 type=ShaderMaterial name='' cacheKey=22,23,SMAA_THRESHOLD,0.1… vHash=886438e7 fHash=dc2a89b5 stage=postprocess-render
  #21 type=ShaderMaterial name='' cacheKey=24,25,SMAA_MAX_SEARCH_ST… vHash=d99a5b29 fHash=109e33fc stage=postprocess-render
  #22 type=ShaderMaterial name='' cacheKey=26,27,highp,srgb-linear,… vHash=2003ced8 fHash=db0f470a stage=postprocess-render
  #23 type=ShaderMaterial name='' cacheKey=28,29,highp,srgb-linear,… vHash=28dfa407 fHash=9775cd0e stage=postprocess-render
  #24 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,6,hi… vHash=756a0b19 fHash=5c741650 stage=postprocess-render
  #25 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,10,h… vHash=b2354ff2 fHash=2aad9943 stage=postprocess-render
  #26 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,14,h… vHash=ea82969e fHash=a2297d9f stage=postprocess-render
  #27 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,18,h… vHash=7dab8d9a fHash=1022767b stage=postprocess-render
  #28 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,22,h… vHash=378e1fb7 fHash=ce0bf6b4 stage=postprocess-render
  #29 type=ShaderMaterial name='' cacheKey=30,32,NUM_MIPS,5,highp,s… vHash=78acf7ea fHash=707f290c stage=postprocess-render
  #30 type=ShaderMaterial name='' cacheKey=33,34,highp,srgb-linear,… vHash=a312c579 fHash=c05e2256 stage=postprocess-render
  #31 type=ShaderMaterial name='GodRaysShader' cacheKey=35,36,highp,srgb-linear,… vHash=b817515d fHash=ccc98549 stage=postprocess-render
  #32 type=RawShaderMaterial name='OutputShader' cacheKey=37,38,SRGB_TRANSFER,,ACE… vHash=5d2c950f fHash=c1247d7 stage=postprocess-render

Differences within frame 0 (grouped by material type):
  ShaderMaterial (24 programs):
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=ae169224, #6=e6d01ae7, #8=5b43c776, #15=279cec18, #16=84736a68, #17=aa2edbee, #18=7bae0bb2, #19=436caea4, #20=886438e7, #21=d99a5b29, #22=2003ced8, #23=28dfa407, #24=756a0b19, #25=b2354ff2, #26=ea82969e, #27=7dab8d9a, #28=378e1fb7, #29=78acf7ea, #30=a312c579, #31=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=bd95ed9d, #5=9b2a34e4, #6=e34491ff, #8=7a30d838, #15=4d6bcede, #16=ffecb62a, #17=76ced00a, #18=fb55b3c0, #19=2d687ef1, #20=dc2a89b5, #21=109e33fc, #22=db0f470a, #23=9775cd0e, #24=5c741650, #25=2aad9943, #26=a2297d9f, #27=1022767b, #28=ce0bf6b4, #29=707f290c, #30=c05e2256, #31=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=grass, #6=water, #8=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #8=(unset), #15=(unset), #16=(unset), #17=(unset), #18=(unset), #19=(unset), #20=(unset), #21=(unset), #22=(unset), #23=(unset), #24=(unset), #25=(unset), #26=(unset), #27=(unset), #28=(unset), #29=(unset), #30=(unset), #31=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #8=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #8=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=false, #6=true, #8=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #15=(unknown), #16=(unknown), #17=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown)
  MeshStandardMaterial (7 programs):
    vertexShaderHash differs: #2=5c2c57a3, #7=e3408c64, #9=54e03756, #10=a99aa494, #11=9ef75116, #12=deee2625, #13=589b45c0
    fragmentShaderHash differs: #2=6e92caaf, #7=c0b8fc9f, #9=d391c52, #10=63f9c0d1, #11=bc151936, #12=497d8e73, #13=a81023c3
    bucket differs: #2=terrain, #7=other, #9=fauna, #10=fauna, #11=fauna, #12=other, #13=other
    flag flatShading differs: #2=false, #7=true, #9=false, #10=false, #11=false, #12=false, #13=false
    flag map differs: #2=false, #7=false, #9=false, #10=false, #11=true, #12=false, #13=false
    flag normalMap differs: #2=true, #7=false, #9=false, #10=false, #11=false, #12=false, #13=false
    flag vertexColors differs: #2=true, #7=false, #9=false, #10=false, #11=false, #12=false, #13=false
  SpriteMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)
  RawShaderMaterial (1 program):
    (only one program of this type in this frame — nothing to diff)


[Seedvale Program Attribution]



Frame 1638 (+15):
  Program #72
    material: MeshStandardMaterial ''
    materialUuid: 030f47dd-6227-4dc7-ba3d-356cf31e485b
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 6ab20547
  Program #73
    material: MeshStandardMaterial 'Wood'
    materialUuid: ac378c78-a204-4b0b-ae8f-23be64ef2662
    object: Mesh 'chunk-environment-region-1,0|largeRock-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 320d0e37
    fragmentShaderHash: 65cafcc2
  Program #74
    material: MeshStandardMaterial 'Green'
    materialUuid: 0a7b1609-1dab-48c5-9c39-cb4b8b28db76
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
  Program #75
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 48b87c47-0cce-4151-8a3e-7b1c1e56a6c0
    object: Mesh 'chunk-vegetation-region-1,0|reed-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,1,8519687,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 99d3d263
    fragmentShaderHash: d45a24e0
  Program #76
    material: MeshStandardMaterial 'MapleTree_Bark'
    materialUuid: 440e7f0a-2a56-4aff-8611-a5d3260004b9
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 2c216b4f
    fragmentShaderHash: 47812acb
  Program #77
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: 73f87f32-3160-4480-aded-5814c518452a
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
    materialUuid: 647a1f2b-7151-4633-bab9-083e680addc1
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #79
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 33cba7fa-fd42-496d-b5b8-17d692d4c9e9
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
    materialUuid: 7455f18a-29f5-4ce4-9a4d-2e94241e9742
    object: SkinnedMesh 'mesh_1_1'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 27e30ee8
    fragmentShaderHash: 731f1f78
  Program #81
    material: MeshStandardMaterial 'Green'
    materialUuid: da16094d-dbe6-4862-a2aa-83a6d76d7cd5
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
    materialUuid: 37339072-30e0-4563-be12-3b9c9f365d51
    object: Mesh 'house-static-batch:16'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ad51b98e
    fragmentShaderHash: dcc05553
  Program #83
    material: MeshStandardMaterial 'MI_WoodTrim'
    materialUuid: c58d50b3-9ea2-4209-b06d-e02a466732b0
    object: Mesh 'house-static-batch:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,uv,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3c9f4a85
    fragmentShaderHash: dd9a9763
  Program #84
    material: MeshStandardMaterial ''
    materialUuid: 119448e8-9d70-47c1-980e-0be3e3bc9250
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
    materialUuid: ceced66e-da69-49ab-8682-74e0d4af9708
    object: Mesh 'house-static-batch:20'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8388611,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5f2e9b54
    fragmentShaderHash: 372a363a

Frame 1881 (+16):
  Program #91
    material: ShaderMaterial 'SkyShader'
    materialUuid: c7d91b87-ccab-4335-a2c9-6db39432e284
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #92
    material: ShaderMaterial ''
    materialUuid: d1713971-f86e-45e0-81b7-7cc44557395e
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: ae169224
    fragmentShaderHash: 8c624cc7
  Program #93
    material: MeshStandardMaterial ''
    materialUuid: 030f47dd-6227-4dc7-ba3d-356cf31e485b
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: b3121184
  Program #94
    material: MeshStandardMaterial 'Wood'
    materialUuid: ac378c78-a204-4b0b-ae8f-23be64ef2662
    object: Mesh 'chunk-environment-region-1,0|largeRock-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 5cee842b
    fragmentShaderHash: 1683d5db
  Program #95
    material: MeshStandardMaterial 'Green'
    materialUuid: 6ceaa096-7036-4c31-9204-7cd30a86145a
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
    materialUuid: 48b87c47-0cce-4151-8a3e-7b1c1e56a6c0
    object: Mesh 'chunk-vegetation-region-1,0|reed-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8520711,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a369060f
    fragmentShaderHash: dc6ebbb1
  Program #97
    material: MeshStandardMaterial 'MapleTree_Bark'
    materialUuid: 440e7f0a-2a56-4aff-8611-a5d3260004b9
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: d612cf03
    fragmentShaderHash: 2a64e35c
  Program #98
    material: MeshStandardMaterial 'MapleTree_Leaves'
    materialUuid: 73f87f32-3160-4480-aded-5814c518452a
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
    materialUuid: 647a1f2b-7151-4633-bab9-083e680addc1
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #100
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 33cba7fa-fd42-496d-b5b8-17d692d4c9e9
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
    materialUuid: 7e47aa56-b0aa-4430-8df3-699aeb019302
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: deee2625
    fragmentShaderHash: da938326
  Program #102
    material: MeshStandardMaterial 'Green'
    materialUuid: da16094d-dbe6-4862-a2aa-83a6d76d7cd5
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
    materialUuid: 119448e8-9d70-47c1-980e-0be3e3bc9250
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520711,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 66d360c8
    fragmentShaderHash: 4e17aba
  Program #104
    material: ShaderMaterial ''
    materialUuid: bffc5c1f-7c76-4860-aa45-03612323b8fe
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
    materialUuid: d8e595b2-e0e6-4876-99b7-bfb2b28251ad
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1


[Seedvale Program Compile Cost]

No isolated per-program GPU compile/link timer exists in the public Three.js/WebGL API without patching internals (out of scope here). Each number below is the wall-clock duration of the renderer.render() call (mirror-render/postprocess-render) that first-used the program, reported ONLY when that program was the single new program created during that specific call — an upper bound that also includes the rest of that call's render cost, not an isolated compile/link timer.
Excluded — no reliable per-program timing: 97 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 74
  #56
      material: ShaderMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 17.3 ms  (upper bound — whole mirror-render call, see note above)

  #57
      material: MeshStandardMaterial 'LimeGreen'
      object: SkinnedMesh 'mesh_1'
      asset: /models/characters/Female_Formal.glb
      foliage-wind-v3
      compile/link: 39.5 ms  (upper bound — whole postprocess-render call, see note above)

Frame 87
  #64
      material: MeshBasicMaterial ''
      object: Mesh 'Fire_Cube001'
      asset: /models/fx/fire.glb
      compile/link: 15.8 ms  (upper bound — whole postprocess-render call, see note above)

Frame 120
  #65
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 17.0 ms  (upper bound — whole postprocess-render call, see note above)

Frame 128
  #66
      material: MeshStandardMaterial 'BirchTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-3:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 17.3 ms  (upper bound — whole mirror-render call, see note above)

Frame 196
  #67
      material: MeshStandardMaterial 'PineTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-6:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 15.2 ms  (upper bound — whole mirror-render call, see note above)

Frame 204
  #68
      material: MeshStandardMaterial 'Green'
      object: Mesh 'chunk-vegetation-region--1,0|tree-living-1:1'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 17.4 ms  (upper bound — whole mirror-render call, see note above)

Frame 218
  #69
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 14.8 ms  (upper bound — whole mirror-render call, see note above)

Frame 486
  #70
      material: MeshStandardMaterial 'lambert2SG'
      object: Mesh 'chunk-vegetation-region-1,0|reed-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 14.8 ms  (upper bound — whole mirror-render call, see note above)

Frame 778
  #71
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 33.8 ms  (upper bound — whole postprocess-render call, see note above)

Summary:
  total measured compile/link time: 202.9 ms
  programs >1 ms: 10
  max: 39.5 ms (#57)


[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=6.9 ms  p95=8.9 ms  max=9.0 ms  Δavg vs baseline=—
  hide-grass           avg=6.2 ms  p95=8.1 ms  max=8.2 ms  Δavg vs baseline=-0.7 ms (-10%)
  hide-vegetation      avg=5.5 ms  p95=7.3 ms  max=7.5 ms  Δavg vs baseline=-1.4 ms (-21%)
  no vegetation/grass  avg=7.6 ms  p95=11.1 ms  max=12.6 ms  Δavg vs baseline=+0.7 ms (+10%)
  hide-environment     avg=7.7 ms  p95=12.0 ms  max=12.7 ms  Δavg vs baseline=+0.8 ms (+11%)
  hide-settlement      avg=5.0 ms  p95=6.2 ms  max=6.2 ms  Δavg vs baseline=-1.9 ms (-28%)
  no water             avg=5.4 ms  p95=6.4 ms  max=6.4 ms  Δavg vs baseline=-1.5 ms (-21%)
  hide-terrain         avg=10.4 ms  p95=13.9 ms  max=15.4 ms  Δavg vs baseline=+3.5 ms (+50%)
  hide-npc-fauna       avg=5.7 ms  p95=8.2 ms  max=8.8 ms  Δavg vs baseline=-1.1 ms (-17%)
  no-shadows           avg=5.1 ms  p95=7.1 ms  max=7.4 ms  Δavg vs baseline=-1.8 ms (-26%)
  no-ao                avg=8.9 ms  p95=13.2 ms  max=14.5 ms  Δavg vs baseline=+2.0 ms (+29%)
  no-bloom             avg=10.8 ms  p95=13.8 ms  max=14.4 ms  Δavg vs baseline=+3.9 ms (+57%)
  no-smaa              avg=8.3 ms  p95=14.3 ms  max=16.5 ms  Δavg vs baseline=+1.5 ms (+21%)
  no-god-rays          avg=6.1 ms  p95=7.4 ms  max=7.6 ms  Δavg vs baseline=-0.8 ms (-11%)
  no-film-grade        avg=7.8 ms  p95=15.7 ms  max=20.4 ms  Δavg vs baseline=+0.9 ms (+14%)
  no postprocessing    avg=5.4 ms  p95=7.3 ms  max=8.2 ms  Δavg vs baseline=-1.5 ms (-22%)
  no mirrors           avg=5.7 ms  p95=7.4 ms  max=9.4 ms  Δavg vs baseline=-1.2 ms (-17%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (33 samples resolved during the baseline window)
  GPU elapsed   avg=16.0 ms  p95=18.0 ms  max=18.8 ms
  CPU wall      avg=6.9 ms  p95=8.9 ms  max=9.0 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

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
  avg: 24.3
  min: 2
  p1: 10

Frame time:
  avg: 41.2 ms
  p95: 67.9 ms
  max: 650.6 ms

Rendering:
  draw calls: 673 avg / 1799 max
  triangles: 11.06M avg
  mirror draws: 133 avg
  geometries: 682
  textures: 487

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
  TERRAIN        0.6 ms
  WATER          3.6 ms
  NPC            8.6 ms
  FAUNA          9.6 ms
  PHYSICS        0.1 ms
  RENDER         13.4 ms

Detected bottlenecks:
  1. RENDER
  2. FAUNA
  3. NPC

Critical spikes:
  GRASS: 15
  WATER: 3
  STREAMING: 3

Hitches (>= 8 ms):
  grass generation       n=15 avg=16.0 max=22.5
  chunk mesh             n=3 avg=9.6 max=10.8
  chunk water            n=3 avg=8.2 max=8.3

Isolation probes:
  full               render=12.6 ms draws=290 tris=6.64M
  hide-grass         render=9.6 ms draws=266 tris=5.64M
  hide-vegetation    render=8.2 ms draws=170 tris=4.46M
  hide-vegetation-grass render=8.5 ms draws=142 tris=3.47M
  hide-environment   render=10.1 ms draws=280 tris=6.65M
  hide-settlement    render=7.2 ms draws=273 tris=6.65M
  hide-water         render=8.6 ms draws=269 tris=5.53M
  hide-terrain       render=9.5 ms draws=256 tris=4.23M
  hide-npc-fauna     render=9.8 ms draws=282 tris=6.50M
  no-shadows         render=8.8 ms draws=282 tris=6.39M
  no-ao              render=9.6 ms draws=276 tris=6.50M
  no-bloom           render=11.1 ms draws=283 tris=6.82M
  no-smaa            render=9.2 ms draws=285 tris=6.57M
  no-god-rays        render=9.2 ms draws=294 tris=6.67M
  no-film-grade      render=9.5 ms draws=299 tris=6.80M
  no-postprocessing  render=9.2 ms draws=269 tris=6.63M
  no-reflections     render=10.5 ms draws=213 tris=5.51M

Frame attribution:
  frame max: 650.6 ms
  largest labelled hitch: 22.5 ms
  unattributed: 628.1 ms

Recommendation:
Largest frame (650.6 ms) is not explained by labelled hitches (largest 22.5 ms) — unattributed frame spike, not a category bottleneck.


[Seedvale Program Census]

Programs created: 107
Program count: final=107 max=107

By frame:
  frame 0   +36 programs   <== largest transition
  frame 1   +4 programs
  frame 2   +3 programs
  frame 45   +1 program
  frame 56   +3 programs
  frame 64   +9 programs
  frame 69   +3 programs
  frame 71   +7 programs
  frame 86   +1 program
  frame 90   +1 program
  frame 97   +1 program
  frame 131   +2 programs
  frame 132   +1 program
  frame 946   +11 programs
  frame 947   +3 programs
  frame 969   +4 programs
  frame 1089   +17 programs

Largest transition — frame 0 (+36 programs):
  #0 type=ShaderMaterial name='SkyShader' bucket=other cacheKey=0,1,highp,srgb-linear,fa… vHash=603d22a7 fHash=c6043ced stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=feb98e19-07c6-48f4-9051-4cd4e1e852c4 (SkyShader)
  #1 type=ShaderMaterial name='' bucket=other cacheKey=2,3,highp,srgb-linear,fa… vHash=72aec116 fHash=ae17ade6 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=220149e9-06d4-4cf9-a595-a2816cb16087
  #2 type=MeshStandardMaterial name='' bucket=terrain cacheKey=physical,STANDARD,,highp… vHash=5c2c57a3 fHash=6e92caaf stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"true","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"true","envMap":"false"}
      material=a406df00-ee16-4896-b81f-afde3ce8c0cf
  #3 type=ShaderMaterial name='' bucket=water cacheKey=4,5,USE_CHUNK_MASK,1,hig… vHash=1bb00362 fHash=a38bbf04 stage=mirror-render
      defines={"USE_CHUNK_MASK":1}
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=b79dad95-bf83-48e8-b7fd-9a23cc5be199
  #4 type=ShaderMaterial name='' bucket=other cacheKey=6,7,highp,srgb-linear,fa… vHash=22690955 fHash=2cf9fa62 stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=7418dc41-0330-436f-9af2-3ce8127a2887
  #5 type=ShaderMaterial name='' bucket=grass cacheKey=8,9,highp,srgb-linear,fa… vHash=ae169224 fHash=9b2a34e4 stage=mirror-render
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=66379ec7-6264-4ca4-9059-90a801602c35
  #6 type=ShaderMaterial name='' bucket=water cacheKey=4,5,highp,srgb-linear,fa… vHash=e6d01ae7 fHash=e34491ff stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","map":"false","normalMap":"false","envMap":"false"}
      material=69059ad9-9a46-445b-b5c2-c11600b7937e
  #7 type=MeshStandardMaterial name='' bucket=other cacheKey=physical,STANDARD,,highp… vHash=e3408c64 fHash=c0b8fc9f stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"true","map":"false","normalMap":"false","envMap":"false"}
      material=2e8ba88e-327d-4f2a-9e07-22248bf85d90
  #8 type=ShaderMaterial name='' cacheKey=10,11,highp,srgb-linear,… vHash=5b43c776 fHash=7a30d838 stage=mirror-render
  #9 type=SpriteMaterial name='' cacheKey=sprite,highp,srgb-linear… vHash=b0067b0d fHash=84786b6f stage=mirror-render
  #10 type=MeshBasicMaterial name='' cacheKey=basic,highp,srgb-linear,… vHash=d459e49b fHash=a8a9bac3 stage=mirror-render
  #11 type=MeshBasicMaterial name='' bucket=other cacheKey=basic,highp,srgb-linear,… vHash=b6911298 fHash=73a25d1e stage=mirror-render
      flags={"transparent":"true","alphaTest":"0","vertexColors":"false","fog":"false","wireframe":"false","map":"true","normalMap":"false","envMap":"false"}
      material=429c4dac-7990-492e-854a-54e4fa8283f8
  #12 type=MeshStandardMaterial name='Main' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=54e03756 fHash=d391c52 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=a2c5bfc2-c939-418e-abef-4696c0acc5f3 (Main)
  #13 type=MeshStandardMaterial name='Material.001' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=a99aa494 fHash=63f9c0d1 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=d2a57b33-9457-430c-9cf0-d4dffe3744c9 (Material.001)
  #14 type=MeshStandardMaterial name='BlackBear_mat' bucket=fauna cacheKey=physical,STANDARD,,highp… vHash=9ef75116 fHash=bc151936 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=4d95337e-41d1-418b-a478-c6b30380b27f (BlackBear_mat)
  #15 type=MeshStandardMaterial name='Black' bucket=other cacheKey=physical,STANDARD,,highp… vHash=deee2625 fHash=497d8e73 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=6ecf4983-ec9f-4a98-beb1-dcacee3aadba (Black)
  #16 type=MeshStandardMaterial name='Green' bucket=other cacheKey=physical,STANDARD,,highp… vHash=589b45c0 fHash=a81023c3 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"false","normalMap":"false","envMap":"false"}
      material=05b1a9f1-41c6-4098-8203-9d23b0c627b1 (Green)
  #17 type=MeshStandardMaterial name='Bush_Leaves' bucket=vegetation cacheKey=physical,STANDARD,,highp… vHash=6e8e36b1 fHash=69a54c52 stage=mirror-render
      defines={"STANDARD":""}
      flags={"transparent":"false","alphaTest":"0.45","vertexColors":"false","fog":"true","wireframe":"false","flatShading":"false","map":"true","normalMap":"false","envMap":"false"}
      material=9427ef59-059b-45f1-8409-72f113eec080 (Bush_Leaves)
  #18 type=ShaderMaterial name='' cacheKey=12,13,highp,srgb-linear,… vHash=279cec18 fHash=4d6bcede stage=postprocess-render
  #19 type=ShaderMaterial name='' cacheKey=14,15,highp,srgb-linear,… vHash=84736a68 fHash=ffecb62a stage=postprocess-render
  #20 type=ShaderMaterial name='' cacheKey=16,17,highp,srgb-linear,… vHash=aa2edbee fHash=76ced00a stage=postprocess-render
  #21 type=ShaderMaterial name='' cacheKey=18,19,highp,srgb-linear,… vHash=7bae0bb2 fHash=fb55b3c0 stage=postprocess-render
  #22 type=ShaderMaterial name='' cacheKey=20,21,highp,srgb-linear,… vHash=436caea4 fHash=2d687ef1 stage=postprocess-render
  #23 type=ShaderMaterial name='' cacheKey=22,23,SMAA_THRESHOLD,0.1… vHash=886438e7 fHash=dc2a89b5 stage=postprocess-render
  #24 type=ShaderMaterial name='' cacheKey=24,25,SMAA_MAX_SEARCH_ST… vHash=d99a5b29 fHash=109e33fc stage=postprocess-render
  #25 type=ShaderMaterial name='' cacheKey=26,27,highp,srgb-linear,… vHash=2003ced8 fHash=db0f470a stage=postprocess-render
  #26 type=ShaderMaterial name='' cacheKey=28,29,highp,srgb-linear,… vHash=28dfa407 fHash=9775cd0e stage=postprocess-render
  #27 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,6,hi… vHash=756a0b19 fHash=5c741650 stage=postprocess-render
  #28 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,10,h… vHash=b2354ff2 fHash=2aad9943 stage=postprocess-render
  #29 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,14,h… vHash=ea82969e fHash=a2297d9f stage=postprocess-render
  #30 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,18,h… vHash=7dab8d9a fHash=1022767b stage=postprocess-render
  #31 type=ShaderMaterial name='' cacheKey=30,31,KERNEL_RADIUS,22,h… vHash=378e1fb7 fHash=ce0bf6b4 stage=postprocess-render
  #32 type=ShaderMaterial name='' cacheKey=30,32,NUM_MIPS,5,highp,s… vHash=78acf7ea fHash=707f290c stage=postprocess-render
  #33 type=ShaderMaterial name='' cacheKey=33,34,highp,srgb-linear,… vHash=a312c579 fHash=c05e2256 stage=postprocess-render
  #34 type=ShaderMaterial name='GodRaysShader' cacheKey=35,36,highp,srgb-linear,… vHash=b817515d fHash=ccc98549 stage=postprocess-render
  #35 type=RawShaderMaterial name='OutputShader' cacheKey=37,38,SRGB_TRANSFER,,ACE… vHash=5d2c950f fHash=c1247d7 stage=postprocess-render

Differences within frame 0 (grouped by material type):
  ShaderMaterial (24 programs):
    vertexShaderHash differs: #0=603d22a7, #1=72aec116, #3=1bb00362, #4=22690955, #5=ae169224, #6=e6d01ae7, #8=5b43c776, #18=279cec18, #19=84736a68, #20=aa2edbee, #21=7bae0bb2, #22=436caea4, #23=886438e7, #24=d99a5b29, #25=2003ced8, #26=28dfa407, #27=756a0b19, #28=b2354ff2, #29=ea82969e, #30=7dab8d9a, #31=378e1fb7, #32=78acf7ea, #33=a312c579, #34=b817515d
    fragmentShaderHash differs: #0=c6043ced, #1=ae17ade6, #3=a38bbf04, #4=2cf9fa62, #5=9b2a34e4, #6=e34491ff, #8=7a30d838, #18=4d6bcede, #19=ffecb62a, #20=76ced00a, #21=fb55b3c0, #22=2d687ef1, #23=dc2a89b5, #24=109e33fc, #25=db0f470a, #26=9775cd0e, #27=5c741650, #28=2aad9943, #29=a2297d9f, #30=1022767b, #31=ce0bf6b4, #32=707f290c, #33=c05e2256, #34=ccc98549
    bucket differs: #0=other, #1=other, #3=water, #4=other, #5=grass, #6=water, #8=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown)
    define USE_CHUNK_MASK differs: #0=(unset), #1=(unset), #3=1, #4=(unset), #5=(unset), #6=(unset), #8=(unset), #18=(unset), #19=(unset), #20=(unset), #21=(unset), #22=(unset), #23=(unset), #24=(unset), #25=(unset), #26=(unset), #27=(unset), #28=(unset), #29=(unset), #30=(unset), #31=(unset), #32=(unset), #33=(unset), #34=(unset)
    flag alphaTest differs: #0=0, #1=0, #3=0, #4=0, #5=0, #6=0, #8=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown)
    flag envMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown)
    flag fog differs: #0=false, #1=true, #3=true, #4=true, #5=true, #6=true, #8=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown)
    flag map differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown)
    flag normalMap differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown)
    flag transparent differs: #0=false, #1=true, #3=true, #4=true, #5=false, #6=true, #8=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown)
    flag vertexColors differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown)
    flag wireframe differs: #0=false, #1=false, #3=false, #4=false, #5=false, #6=false, #8=(unknown), #18=(unknown), #19=(unknown), #20=(unknown), #21=(unknown), #22=(unknown), #23=(unknown), #24=(unknown), #25=(unknown), #26=(unknown), #27=(unknown), #28=(unknown), #29=(unknown), #30=(unknown), #31=(unknown), #32=(unknown), #33=(unknown), #34=(unknown)
  MeshStandardMaterial (8 programs):
    vertexShaderHash differs: #2=5c2c57a3, #7=e3408c64, #12=54e03756, #13=a99aa494, #14=9ef75116, #15=deee2625, #16=589b45c0, #17=6e8e36b1
    fragmentShaderHash differs: #2=6e92caaf, #7=c0b8fc9f, #12=d391c52, #13=63f9c0d1, #14=bc151936, #15=497d8e73, #16=a81023c3, #17=69a54c52
    bucket differs: #2=terrain, #7=other, #12=fauna, #13=fauna, #14=fauna, #15=other, #16=other, #17=vegetation
    flag alphaTest differs: #2=0, #7=0, #12=0, #13=0, #14=0, #15=0, #16=0, #17=0.45
    flag flatShading differs: #2=false, #7=true, #12=false, #13=false, #14=false, #15=false, #16=false, #17=false
    flag map differs: #2=false, #7=false, #12=false, #13=false, #14=true, #15=false, #16=false, #17=true
    flag normalMap differs: #2=true, #7=false, #12=false, #13=false, #14=false, #15=false, #16=false, #17=false
    flag vertexColors differs: #2=true, #7=false, #12=false, #13=false, #14=false, #15=false, #16=false, #17=false
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


[Seedvale Program Attribution]



Frame 946 (+11):
  Program #72
    material: MeshStandardMaterial ''
    materialUuid: a406df00-ee16-4896-b81f-afde3ce8c0cf
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8389696,8519683,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 2ec22bd5
    fragmentShaderHash: 6ab20547
  Program #73
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 1b2148e3-dfad-49bc-83f9-bf4c8ff83b01
    object: Mesh 'chunk-vegetation-region-1,0|reed-1:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ca65e7f6
    fragmentShaderHash: ed8c9b61
  Program #74
    material: MeshStandardMaterial 'Stone'
    materialUuid: fa7db3ec-53fe-455d-a1c8-c46ed4d1163b
    object: Mesh 'chunk-environment-region-1,0|fallenLog-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: b3c52649
    fragmentShaderHash: acd7dae2
  Program #75
    material: MeshStandardMaterial 'Green'
    materialUuid: 84e1626d-98fe-4b6d-9bcd-dc396ecf6707
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
  Program #76
    material: MeshStandardMaterial 'NormalTree_Bark'
    materialUuid: 5ae337b3-82ae-4068-a7f1-c0e728d1fa0c
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388673,8521731,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 1bd8d9e3
    fragmentShaderHash: e2f189d1
  Program #77
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: 5a27362c-4af7-45d8-9856-a98f2748c814
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
    materialUuid: 7587a966-4547-4658-85d5-6a389779042f
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519683,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: f485db97
    fragmentShaderHash: 3c5226a1
  Program #79
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 3ee20362-6865-44cd-9329-d648327c7037
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
    material: MeshStandardMaterial 'Black'
    materialUuid: 6ecf4983-ec9f-4a98-beb1-dcacee3aadba
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388608,8519715,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ee36271
    fragmentShaderHash: ab5efdc5
  Program #81
    material: MeshStandardMaterial 'Green'
    materialUuid: 05b1a9f1-41c6-4098-8203-9d23b0c627b1
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
    material: MeshStandardMaterial ''
    materialUuid: 6fe86a23-2223-4740-9804-95e47b84903d
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb-linear,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,0,0,0,0,0,1,0,0,0,0,8388609,8519687,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: d7607dd2
    fragmentShaderHash: 83e94369

Frame 1089 (+17):
  Program #90
    material: ShaderMaterial 'SkyShader'
    materialUuid: feb98e19-07c6-48f4-9051-4cd4e1e852c4
    object: Mesh ''
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 0,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8524801,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 603d22a7
    fragmentShaderHash: 5bec192c
  Program #91
    material: ShaderMaterial ''
    materialUuid: 66379ec7-6264-4ca4-9059-90a801602c35
    object: Mesh 'chunk-grass-tri'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 8,9,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,1,8522755,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: ae169224
    fragmentShaderHash: 8c624cc7
  Program #92
    material: MeshStandardMaterial ''
    materialUuid: a406df00-ee16-4896-b81f-afde3ce8c0cf
    object: Mesh 'chunk'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8389696,8520707,srgb,chunk-terrain-surface-detail-v6
    defines: {"STANDARD":""}
    vertexShaderHash: 5c2c57a3
    fragmentShaderHash: b3121184
  Program #93
    material: MeshStandardMaterial 'lambert2SG'
    materialUuid: 1b2148e3-dfad-49bc-83f9-bf4c8ff83b01
    object: Mesh 'chunk-vegetation-region-1,0|reed-1:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 3e42e9c4
    fragmentShaderHash: d48c36b2
  Program #94
    material: MeshStandardMaterial 'Stone'
    materialUuid: fa7db3ec-53fe-455d-a1c8-c46ed4d1163b
    object: Mesh 'chunk-environment-region-1,0|fallenLog-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: a9733c9d
    fragmentShaderHash: 80dabd3b
  Program #95
    material: MeshStandardMaterial 'Green'
    materialUuid: 84e1626d-98fe-4b6d-9bcd-dc396ecf6707
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
    material: MeshStandardMaterial 'NormalTree_Bark'
    materialUuid: 5ae337b3-82ae-4068-a7f1-c0e728d1fa0c
    object: Mesh 'mesh_0'
    asset: /models/nature/tree_c.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388673,8522755,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: ab1dd48f
    fragmentShaderHash: 8661e8c2
  Program #97
    material: MeshStandardMaterial 'BirchTree_Leaves'
    materialUuid: 5a27362c-4af7-45d8-9856-a98f2748c814
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
  Program #98
    material: MeshStandardMaterial 'PineTree_Bark'
    materialUuid: 7587a966-4547-4658-85d5-6a389779042f
    object: Mesh 'mesh_0'
    asset: /models/nature/pine_1.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,uv,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520707,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 86d8050b
    fragmentShaderHash: 33b94cf2
  Program #99
    material: MeshStandardMaterial 'Leaves'
    materialUuid: 3ee20362-6865-44cd-9329-d648327c7037
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
    materialUuid: 6ecf4983-ec9f-4a98-beb1-dcacee3aadba
    object: SkinnedMesh 'mesh_0'
    asset: /models/characters/Adventurer.glb
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8520739,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: deee2625
    fragmentShaderHash: da938326
  Program #101
    material: MeshStandardMaterial 'Green'
    materialUuid: 05b1a9f1-41c6-4098-8203-9d23b0c627b1
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
    materialUuid: 6fe86a23-2223-4740-9804-95e47b84903d
    object: Mesh 'settlement-household-troughs-0:0'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: physical,STANDARD,,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388609,8520711,srgb,onBeforeCompile() {
  }
    defines: {"STANDARD":""}
    vertexShaderHash: 66d360c8
    fragmentShaderHash: 4e17aba
  Program #103
    material: ShaderMaterial ''
    materialUuid: 69059ad9-9a46-445b-b5c2-c11600b7937e
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
    materialUuid: 24373d16-e4f9-4f42-994c-3d9e95fea226
    object: Mesh 'chunk-water'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 4,5,USE_CHUNK_MASK,1,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,8388608,8391683,srgb,onBeforeCompile() {
  }
    defines: {"USE_CHUNK_MASK":1}
    vertexShaderHash: 1bb00362
    fragmentShaderHash: a02c63f1
  Program #106
    material: ShaderMaterial ''
    materialUuid: 2413628c-6292-4ed5-97d9-c59e3f7f4a1b
    object: Mesh 'chunk-river'
    asset: (no GLB — procedural geometry or unattributed)
    cacheKey: 6,7,highp,srgb,false,,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,,,false,0,,1,16,0,0,1,0,1,0,0,0,0,1,4,0,0,0,0,8391683,srgb,onBeforeCompile() {
  }
    defines: none
    vertexShaderHash: 22690955
    fragmentShaderHash: 593d20b7

[Seedvale Program Compile Cost]

No isolated per-program GPU compile/link timer exists in the public Three.js/WebGL API without patching internals (out of scope here). Each number below is the wall-clock duration of the renderer.render() call (mirror-render/postprocess-render) that first-used the program, reported ONLY when that program was the single new program created during that specific call — an upper bound that also includes the rest of that call's render cost, not an isolated compile/link timer.
Excluded — no reliable per-program timing: 102 shared a render call with other new programs, 0 first-used outside a mirror/postprocess stage boundary.

Programs with measurable cost > 1 ms:

Frame 45
  #43
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 14.5 ms  (upper bound — whole postprocess-render call, see note above)

Frame 86
  #66
      material: MeshStandardMaterial 'Pond_Pack_MAT'
      object: Mesh 'Branch_2b'
      asset: /models/items/branch.glb
      compile/link: 21.1 ms  (upper bound — whole postprocess-render call, see note above)

Frame 90
  #67
      material: MeshDepthMaterial ''
      object: unknown ''
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 28.8 ms  (upper bound — whole postprocess-render call, see note above)

Frame 97
  #68
      material: MeshStandardMaterial 'BirchTree_Bark'
      object: Mesh 'chunk-vegetation-region-0,0|tree-living-3:0'
      asset: (no GLB — procedural geometry or unattributed)
      compile/link: 30.3 ms  (upper bound — whole mirror-render call, see note above)

Frame 132
  #71
      material: MeshStandardMaterial 'Leaves'
      object: Mesh 'chunk-vegetation-region-0,-1|fern-0:0'
      asset: (no GLB — procedural geometry or unattributed)
      foliage-wind-v3
      compile/link: 31.6 ms  (upper bound — whole postprocess-render call, see note above)

Summary:
  total measured compile/link time: 126.3 ms
  programs >1 ms: 5
  max: 31.6 ms (#71)


[Seedvale Render Isolation]

Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.

  baseline             avg=12.6 ms  p95=17.3 ms  max=18.4 ms  Δavg vs baseline=—
  hide-grass           avg=9.6 ms  p95=13.6 ms  max=14.4 ms  Δavg vs baseline=-3.0 ms (-24%)
  hide-vegetation      avg=8.2 ms  p95=12.5 ms  max=13.5 ms  Δavg vs baseline=-4.4 ms (-35%)
  no vegetation/grass  avg=8.5 ms  p95=11.5 ms  max=11.6 ms  Δavg vs baseline=-4.1 ms (-32%)
  hide-environment     avg=10.1 ms  p95=12.4 ms  max=12.6 ms  Δavg vs baseline=-2.5 ms (-20%)
  hide-settlement      avg=7.2 ms  p95=10.9 ms  max=11.5 ms  Δavg vs baseline=-5.4 ms (-43%)
  no water             avg=8.6 ms  p95=10.5 ms  max=10.7 ms  Δavg vs baseline=-4.0 ms (-32%)
  hide-terrain         avg=9.5 ms  p95=12.1 ms  max=12.4 ms  Δavg vs baseline=-3.1 ms (-24%)
  hide-npc-fauna       avg=9.8 ms  p95=13.7 ms  max=14.2 ms  Δavg vs baseline=-2.8 ms (-22%)
  no-shadows           avg=8.8 ms  p95=11.2 ms  max=11.3 ms  Δavg vs baseline=-3.8 ms (-30%)
  no-ao                avg=9.6 ms  p95=12.5 ms  max=13.3 ms  Δavg vs baseline=-3.0 ms (-24%)
  no-bloom             avg=11.1 ms  p95=15.0 ms  max=16.5 ms  Δavg vs baseline=-1.5 ms (-12%)
  no-smaa              avg=9.2 ms  p95=11.6 ms  max=11.7 ms  Δavg vs baseline=-3.4 ms (-27%)
  no-god-rays          avg=9.2 ms  p95=13.2 ms  max=14.2 ms  Δavg vs baseline=-3.4 ms (-27%)
  no-film-grade        avg=9.5 ms  p95=13.8 ms  max=14.9 ms  Δavg vs baseline=-3.1 ms (-24%)
  no postprocessing    avg=9.2 ms  p95=12.3 ms  max=12.6 ms  Δavg vs baseline=-3.4 ms (-27%)
  no mirrors           avg=10.5 ms  p95=13.5 ms  max=13.9 ms  Δavg vs baseline=-2.1 ms (-17%)

CPU/GPU separation (baseline, same RENDER span):
  EXT_disjoint_timer_query_webgl2: available (14 samples resolved during the baseline window)
  GPU elapsed   avg=36.4 ms  p95=38.4 ms  max=38.8 ms
  CPU wall      avg=12.6 ms  p95=17.3 ms  max=18.4 ms
  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.

[Seedvale Benchmark]

Scenario: water
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
  anchor: (-8.1, 100.5)

FPS:
  avg: 34.4
  min: 1
  p1: 21

Frame time:
  avg: 29.1 ms
  p95: 38.9 ms
  max: 941.7 ms

Rendering:
  draw calls: 267 avg / 572 max
  triangles: 4.36M avg
  mirror draws: 79 avg
  geometries: 373
  textures: 180

Scene (one-pass estimate):
  terrain        draws=54 tris=3.98M meshes=54 inst=54
  grass          draws=56 tris=1.16M meshes=56 inst=113690
  vegetation     draws=77 tris=265.9k meshes=77 inst=160
  environment    draws=21 tris=8.0k meshes=21 inst=22
  settlement     draws=650 tris=701.5k meshes=650 inst=1171
  water          draws=38 tris=2.74M meshes=38 inst=38
  npc            draws=182 tris=129.4k meshes=182 inst=182
  fauna          draws=166 tris=45.0k meshes=166 inst=166
  items          draws=73 tris=9.8k meshes=73 inst=73
  other          draws=418 tris=26.0k meshes=418 inst=418

Systems:
  WATER          3.5 ms
  NPC            2.1 ms
  FAUNA          0.7 ms
  PHYSICS        0.1 ms
  RENDER         21.5 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=20.0 ms draws=262 tris=4.30M
  hide-grass         render=19.7 ms draws=223 tris=3.15M
  hide-vegetation    render=21.8 ms draws=226 tris=4.01M
  hide-environment   render=23.0 ms draws=273 tris=4.39M
  hide-settlement    render=19.5 ms draws=174 tris=4.20M
  hide-water         render=26.3 ms draws=248 tris=3.40M
  hide-terrain       render=21.5 ms draws=248 tris=2.48M
  hide-npc-fauna     render=19.9 ms draws=278 tris=4.43M
  no-shadows         render=14.1 ms draws=244 tris=4.16M
  no-ao              render=8.5 ms draws=239 tris=3.83M
  no-bloom           render=15.0 ms draws=248 tris=4.29M
  no-smaa            render=13.8 ms draws=272 tris=4.40M
  no-god-rays        render=20.4 ms draws=270 tris=4.36M
  no-film-grade      render=21.7 ms draws=261 tris=4.29M
  no-reflections     render=21.8 ms draws=185 tris=3.71M

Frame attribution:
  frame max: 941.7 ms
  largest labelled hitch: 0 ms
  unattributed: 941.7 ms

Recommendation:
Largest frame (941.7 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

[Seedvale Benchmark]

Scenario: stress
Duration: 30s
Quality: High
Pixel ratio: 1

Reproducibility:
  fixture: tools-001-v1
  seed: 42
  elapsedDays: 0
  timeOfDay: 0.050
  season: spring
  weather: rain
  terrainResolution: 193
  loadRadius: 3
  viewport: 1920x945
  anchor: (-8.1, 20.5)

FPS:
  avg: 20.9
  min: 3
  p1: 14

Frame time:
  avg: 47.7 ms
  p95: 63 ms
  max: 287.7 ms

Rendering:
  draw calls: 1876 avg / 2300 max
  triangles: 9.86M avg
  mirror draws: 378 avg
  geometries: 666
  textures: 327

Scene (one-pass estimate):
  terrain        draws=55 tris=4.06M meshes=55 inst=55
  grass          draws=84 tris=4.52M meshes=84 inst=314861
  vegetation     draws=83 tris=268.3k meshes=83 inst=166
  environment    draws=34 tris=10.2k meshes=34 inst=35
  settlement     draws=649 tris=701.9k meshes=649 inst=1170
  water          draws=24 tris=1.70M meshes=24 inst=24
  npc            draws=182 tris=129.4k meshes=182 inst=182
  fauna          draws=166 tris=45.0k meshes=166 inst=166
  items          draws=93 tris=12.0k meshes=93 inst=93
  other          draws=412 tris=25.7k meshes=412 inst=412

Systems:
  WATER          5.5 ms
  NPC            1.7 ms
  FAUNA          0.9 ms
  PHYSICS        0.1 ms
  RENDER         34.3 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=38.8 ms draws=1856 tris=9.81M
  hide-grass         render=34.8 ms draws=1793 tris=5.68M
  hide-vegetation    render=33.0 ms draws=1804 tris=9.57M
  hide-environment   render=38.3 ms draws=1820 tris=9.78M
  hide-settlement    render=27.1 ms draws=852 tris=8.73M
  hide-water         render=33.8 ms draws=1940 tris=9.72M
  hide-terrain       render=37.8 ms draws=1838 tris=5.96M
  hide-npc-fauna     render=28.7 ms draws=1699 tris=9.80M
  no-shadows         render=33.6 ms draws=1470 tris=7.93M
  no-ao              render=27.8 ms draws=1849 tris=9.75M
  no-bloom           render=35.6 ms draws=1937 tris=10.04M
  no-smaa            render=34.3 ms draws=1894 tris=9.91M
  no-god-rays        render=37.5 ms draws=1953 tris=10.04M
  no-film-grade      render=37.5 ms draws=1947 tris=10.04M
  no-reflections     render=34.6 ms draws=1511 tris=9.02M

Frame attribution:
  frame max: 287.7 ms
  largest labelled hitch: 0 ms
  unattributed: 287.7 ms

Recommendation:
Largest frame (287.7 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

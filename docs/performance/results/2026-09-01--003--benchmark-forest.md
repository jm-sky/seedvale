[Seedvale Benchmark]

Scenario: forest
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
  anchor: (-8.1, 20.5)

FPS:
  avg: 29.7
  min: 4
  p1: 13

Frame time:
  avg: 33.7 ms
  p95: 56.9 ms
  max: 243.6 ms

Rendering:
  draw calls: 1878 avg / 2297 max
  triangles: 9.84M avg
  mirror draws: 377 avg
  geometries: 845
  textures: 360

Scene (one-pass estimate):
  terrain        draws=55 tris=4.06M meshes=55 inst=55
  grass          draws=84 tris=4.52M meshes=84 inst=314861
  vegetation     draws=83 tris=268.3k meshes=83 inst=166
  environment    draws=34 tris=10.2k meshes=34 inst=35
  settlement     draws=649 tris=701.9k meshes=649 inst=1170
  water          draws=24 tris=1.70M meshes=24 inst=24
  npc            draws=182 tris=129.4k meshes=182 inst=182
  fauna          draws=166 tris=45.0k meshes=166 inst=166
  items          draws=93 tris=12.3k meshes=93 inst=93
  other          draws=410 tris=25.5k meshes=410 inst=410

Systems:
  WATER          6.3 ms
  NPC            0.4 ms
  FAUNA          0.1 ms
  RENDER         25.7 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=25.7 ms draws=1899 tris=9.91M
  hide-grass         render=24.9 ms draws=1884 tris=5.89M
  hide-vegetation    render=24.5 ms draws=1831 tris=9.63M
  hide-environment   render=18.8 ms draws=1880 tris=9.90M
  hide-settlement    render=14.6 ms draws=837 tris=8.64M
  hide-water         render=23.0 ms draws=1918 tris=9.66M
  hide-terrain       render=23.4 ms draws=1845 tris=5.97M
  hide-npc-fauna     render=19.4 ms draws=1722 tris=9.85M
  no-shadows         render=16.1 ms draws=1404 tris=7.78M
  no-ao              render=14.5 ms draws=1876 tris=9.81M
  no-bloom           render=23.5 ms draws=1886 tris=9.91M
  no-smaa            render=26.2 ms draws=1896 tris=9.91M
  no-god-rays        render=24.8 ms draws=1927 tris=9.98M
  no-film-grade      render=26.3 ms draws=1899 tris=9.91M
  no-reflections     render=31.1 ms draws=1517 tris=9.03M

Frame attribution:
  frame max: 243.6 ms
  largest labelled hitch: 0 ms
  unattributed: 243.6 ms

Recommendation:
Largest frame (243.6 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

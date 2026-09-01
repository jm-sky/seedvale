[Seedvale Benchmark]

Scenario: current (non-canonical)
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

FPS:
  avg: 26.3
  min: 2
  p1: 15

Frame time:
  avg: 38 ms
  p95: 54.1 ms
  max: 585.2 ms

Rendering:
  draw calls: 1498 avg / 1788 max
  triangles: 9.18M avg
  mirror draws: 266 avg
  geometries: 621
  textures: 312

Scene (one-pass estimate):
  terrain        draws=61 tris=4.50M meshes=61 inst=61
  grass          draws=84 tris=4.52M meshes=84 inst=314861
  vegetation     draws=87 tris=269.8k meshes=87 inst=170
  environment    draws=39 tris=11.7k meshes=39 inst=40
  settlement     draws=650 tris=701.5k meshes=650 inst=1171
  water          draws=24 tris=1.70M meshes=24 inst=24
  npc            draws=182 tris=129.4k meshes=182 inst=182
  fauna          draws=166 tris=45.0k meshes=166 inst=166
  items          draws=124 tris=19.3k meshes=124 inst=124
  other          draws=410 tris=25.5k meshes=410 inst=410

Systems:
  WATER          4.0 ms
  NPC            1.7 ms
  FAUNA          0.7 ms
  PHYSICS        0.1 ms
  RENDER         26.7 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=34.5 ms draws=1519 tris=9.22M
  hide-grass         render=31.5 ms draws=1475 tris=5.44M
  hide-vegetation    render=25.0 ms draws=1454 tris=8.95M
  hide-environment   render=24.7 ms draws=1499 tris=9.22M
  hide-settlement    render=16.5 ms draws=735 tris=8.35M
  hide-water         render=26.5 ms draws=1516 tris=9.06M
  hide-terrain       render=19.8 ms draws=1446 tris=5.16M
  hide-npc-fauna     render=14.3 ms draws=1378 tris=9.13M
  no-shadows         render=29.4 ms draws=1035 tris=7.14M
  no-ao              render=18.0 ms draws=1471 tris=9.13M
  no-bloom           render=24.2 ms draws=1499 tris=9.22M
  no-smaa            render=22.5 ms draws=1513 tris=9.22M
  no-god-rays        render=22.4 ms draws=1527 tris=9.23M
  no-film-grade      render=21.2 ms draws=1529 tris=9.23M
  no-reflections     render=21.4 ms draws=1261 tris=8.48M

Frame attribution:
  frame max: 585.2 ms
  largest labelled hitch: 0 ms
  unattributed: 585.2 ms

Recommendation:
Largest frame (585.2 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

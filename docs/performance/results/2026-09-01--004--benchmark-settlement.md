[Seedvale Benchmark]

Scenario: settlement
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

FPS:
  avg: 23.3
  min: 5
  p1: 15

Frame time:
  avg: 42.9 ms
  p95: 57.1 ms
  max: 197.9 ms

Rendering:
  draw calls: 1513 avg / 1817 max
  triangles: 9.13M avg
  mirror draws: 274 avg
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
  WATER          4.3 ms
  NPC            2.0 ms
  FAUNA          0.6 ms
  PHYSICS        0.1 ms
  RENDER         30.4 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=34.7 ms draws=1566 tris=9.26M
  hide-grass         render=32.7 ms draws=1493 tris=5.39M
  hide-vegetation    render=29.4 ms draws=1471 tris=8.89M
  hide-environment   render=24.6 ms draws=1523 tris=9.17M
  hide-settlement    render=19.4 ms draws=741 tris=8.28M
  hide-water         render=19.8 ms draws=1521 tris=8.96M
  hide-terrain       render=21.6 ms draws=1499 tris=5.20M
  hide-npc-fauna     render=22.5 ms draws=1393 tris=9.08M
  no-shadows         render=30.4 ms draws=1092 tris=7.28M
  no-ao              render=22.8 ms draws=1520 tris=9.20M
  no-bloom           render=36.0 ms draws=1580 tris=9.36M
  no-smaa            render=33.2 ms draws=1547 tris=9.20M
  no-god-rays        render=28.4 ms draws=1521 tris=9.11M
  no-film-grade      render=28.2 ms draws=1547 tris=9.18M
  no-reflections     render=24.0 ms draws=1269 tris=8.42M

Frame attribution:
  frame max: 197.9 ms
  largest labelled hitch: 0 ms
  unattributed: 197.9 ms

Recommendation:
Largest frame (197.9 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

[Seedvale Benchmark]

Scenario: night
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

FPS:
  avg: 24.4
  min: 1
  p1: 17

Frame time:
  avg: 41 ms
  p95: 51.5 ms
  max: 760.9 ms

Rendering:
  draw calls: 1510 avg / 1785 max
  triangles: 9.22M avg
  mirror draws: 267 avg
  geometries: 618
  textures: 310

Scene (one-pass estimate):
  terrain        draws=61 tris=4.50M meshes=61 inst=61
  grass          draws=84 tris=4.52M meshes=84 inst=314861
  vegetation     draws=87 tris=269.8k meshes=87 inst=170
  environment    draws=39 tris=11.7k meshes=39 inst=40
  settlement     draws=649 tris=701.9k meshes=649 inst=1170
  water          draws=24 tris=1.70M meshes=24 inst=24
  npc            draws=182 tris=129.4k meshes=182 inst=182
  fauna          draws=166 tris=45.0k meshes=166 inst=166
  items          draws=130 tris=14.5k meshes=130 inst=130
  other          draws=412 tris=25.7k meshes=412 inst=412

Systems:
  WATER          3.9 ms
  NPC            1.6 ms
  FAUNA          0.8 ms
  PHYSICS        0.1 ms
  RENDER         29.7 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. NPC

Critical spikes:
  (none)

Hitches (>= 8 ms):
  (none)

Isolation probes:
  full               render=19.7 ms draws=1515 tris=9.22M
  hide-grass         render=18.2 ms draws=1471 tris=5.43M
  hide-vegetation    render=16.6 ms draws=1458 tris=8.97M
  hide-environment   render=18.6 ms draws=1494 tris=9.21M
  hide-settlement    render=15.9 ms draws=738 tris=8.38M
  hide-water         render=32.8 ms draws=1511 tris=9.06M
  hide-terrain       render=22.6 ms draws=1440 tris=5.15M
  hide-npc-fauna     render=17.5 ms draws=1380 tris=9.13M
  no-shadows         render=13.4 ms draws=1039 tris=7.15M
  no-ao              render=11.3 ms draws=1472 tris=9.14M
  no-bloom           render=17.4 ms draws=1502 tris=9.22M
  no-smaa            render=15.1 ms draws=1496 tris=9.18M
  no-god-rays        render=15.2 ms draws=1499 tris=9.18M
  no-film-grade      render=16.8 ms draws=1497 tris=9.17M
  no-reflections     render=16.9 ms draws=1247 tris=8.47M

Frame attribution:
  frame max: 760.9 ms
  largest labelled hitch: 0 ms
  unattributed: 760.9 ms

Recommendation:
Largest frame (760.9 ms) is not explained by labelled hitches (largest 0 ms) — unattributed frame spike, not a category bottleneck.

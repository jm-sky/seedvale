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
  avg: 24.3
  min: 1
  p1: 10

Frame time:
  avg: 41.1 ms
  p95: 79.3 ms
  max: 945.5 ms

Rendering:
  draw calls: 830 avg / 1828 max
  triangles: 9.44M avg
  mirror draws: 177 avg
  geometries: 823
  textures: 451

Scene (one-pass estimate):
  terrain        draws=70 tris=5.16M meshes=70 inst=70
  grass          draws=60 tris=803.3k meshes=60 inst=94116
  vegetation     draws=165 tris=1.49M meshes=165 inst=876
  environment    draws=67 tris=24.8k meshes=67 inst=91
  settlement     draws=647 tris=701.0k meshes=647 inst=1164
  water          draws=49 tris=3.55M meshes=49 inst=49
  npc            draws=181 tris=127.9k meshes=181 inst=181
  fauna          draws=167 tris=46.9k meshes=167 inst=167
  items          draws=172 tris=19.7k meshes=172 inst=172
  other          draws=408 tris=24.4k meshes=408 inst=408

Systems:
  TERRAIN        4.0 ms
  WATER          5.5 ms
  NPC            2.2 ms
  FAUNA          0.7 ms
  PHYSICS        0.1 ms
  RENDER         25.1 ms

Detected bottlenecks:
  1. RENDER
  2. WATER
  3. TERRAIN

Critical spikes:
  STREAMING: 61
  GRASS: 7
  WATER: 1

Hitches (>= 8 ms):
  chunk mesh             n=61 avg=40.3 max=58.2
  chunk water            n=1 avg=12.7 max=12.7
  grass generation       n=7 avg=8.8 max=10.7

Isolation probes:
  (not run)

Frame attribution:
  frame max: 945.5 ms
  largest labelled hitch: 58.2 ms
  unattributed: 887.3 ms

Recommendation:
Largest frame (945.5 ms) is not explained by labelled hitches (largest 58.2 ms) — unattributed frame spike, not a category bottleneck.

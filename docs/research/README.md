# Research

Analyses, spikes, comparisons, and notes collected before implementation decisions.

## Status values

`todo` · `planned` · `in progress` · `done` · `verification needed`

## Index

| File | Summary | Status |
|------|---------|--------|
| [2026-08-07--001--threejs-terrain-ai-tech-research.md](2026-08-07--001--threejs-terrain-ai-tech-research.md) | Three.js + procedural terrain + character AI — libraries, patterns, product directions | `done` |
| [2026-08-07--003--3d-portfolio-library-audit.md](2026-08-07--003--3d-portfolio-library-audit.md) | Audit `../3d-portfolio/src/library` — SimonDev terrain patterns reusable for Seedvale | `done` |
| [2026-08-07--002--3d-asset-sources.md](2026-08-07--002--3d-asset-sources.md) | Źródła modeli 3D (CC0 glTF) bez Blendera — Kenney / Quaternius, pipeline, mapowanie v0.2–v0.3 | `done` |
| [2026-08-07--005--simodev-refs-review.md](2026-08-07--005--simodev-refs-review.md) | Audyt `docs/refs/` (SimonDev: ProceduralTerrain_Part10, Quick_FPS1, BasicPhysics) — nic adopt-now, 2 triggery na przyszłość | `done` |
| [2026-08-07--004--grass-generation.md](2026-08-07--004--grass-generation.md) | Prompt/research: architektura instanced trawy (AAA-style) — pytania odpowiedziane w [plans/archive/2026-08-07--008--grass-rendering.md](../plans/archive/2026-08-07--008--grass-rendering.md) | `done` |
| [2026-08-11--006--medieval-model-library-complement.md](2026-08-11--006--medieval-model-library-complement.md) | Uzupełniająca paczka modeli: Quaternius Medieval Village MegaKit (CC0) | `done` |
| [2026-08-11--007--sound-needs.md](2026-08-11--007--sound-needs.md) | Inwentarz SFX + lista braków (kroki, ogień, melee, UI…) | `done` |
| [2026-08-13--008--real-caves-in-three-js--brief.md](2026-08-13--008--real-caves-in-three-js--brief.md) | Brief: prawdziwe jaskinie podziemne — pytania i zakres researchu (odpowiedź: [009](2026-08-13--009--underground-caves.md)) | `done` |
| [2026-08-13--009--underground-caves.md](2026-08-13--009--underground-caves.md) | Jaskinie podziemne: osobny mesh wnętrza (technika B), tabela technik A–F, couplingi; §11 = uzupełnienie po odpowiedziach; plan: [104](../plans/2026-08-14--104--underground-caves.md) | `done` |
| [2026-08-15--010--mobile-black-flicker-instancedmesh-foliage-wind.md](2026-08-15--010--mobile-black-flicker-instancedmesh-foliage-wind.md) | Mobile black flicker (issue 032 follow-up): isolation narrows cause to `InstancedMesh` + foliage-wind shader (commit cee1a4c); disabling wind on InstancedMesh confirmed fix, exact GLSL defect still open | `verification needed` |

When adding a new entry: create `YYYY-MM-DD--{NNN}--slug.md` (next sequential number in research), add a row here.

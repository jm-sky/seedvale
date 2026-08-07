# Plans

Implementation plans for features and larger changes.

## Status values

`todo` · `planned` · `in progress` · `done` · `verification needed`

## Index

| File | Summary | Status |
|------|---------|--------|
| [2026-08-07--v01-terrain-walking.md](./2026-08-07--v01-terrain-walking.md) | v0.1: teren + chodzenie 3rd person | `done` |
| [2026-08-07--v02-settlement-npc.md](./2026-08-07--v02-settlement-npc.md) | v0.2: osada + NPC (woda / drewno / jedzenie) | `done` |
| [2026-08-07--v03-fauna-chase-flee.md](./2026-08-07--v03-fauna-chase-flee.md) | v0.3: fauna chase/flee (logika done; GLB open) | `done` |
| [2026-08-07--day-night-clock.md](./2026-08-07--day-night-clock.md) | Zegar dnia/nocy + time multiplier | `done` |
| [2026-08-07--game-ui-screens.md](./2026-08-07--game-ui-screens.md) | Ekrany/dialogi/modale jak w grach | `in progress` |
| [2026-08-07--terrain-worker-pool.md](./2026-08-07--terrain-worker-pool.md) | Worker pool dla generacji terenu (offload heightmap) | `done` |
| [2026-08-07--world-visual-overhaul.md](./2026-08-07--world-visual-overhaul.md) | Rośliny (krzewy), niebo/chmury, góry w tle (insp. SimonDev) | `in progress` |
| [2026-08-07--world-streaming-persistence.md](./2026-08-07--world-streaming-persistence.md) | Chunk streaming (kierunek: duży/sferyczny świat) + zapis | `done` |
| [2026-08-07--post-processing-pipeline.md](./2026-08-07--post-processing-pipeline.md) | Post-processing pipeline (EffectComposer) + N8AO ambient occlusion | `planned` |
| [2026-08-07--grass-rendering.md](./2026-08-07--grass-rendering.md) | Trawa: instanced ground cover per chunk, reużycie chunk/worker systemu | `done` |
| [2026-08-07--npc-interactions.md](./2026-08-07--npc-interactions.md) | Interakcje gracz↔NPC: proximity prompt + prosty dialog ([E]) | `done` |
| [2026-08-07--npc-gender-models.md](./2026-08-07--npc-gender-models.md) | Modele NPC zsynchronizowane z płcią imienia (żeńskie & męskie) | `planned` |
| [2026-08-07--npc-reaction-sounds.md](./2026-08-07--npc-reaction-sounds.md) | Dźwięki reakcji NPC (Hmm/Tak? przy lookAtPlayer, męskie/żeńskie) | `planned` |
| [2026-08-07--npc-character-depth.md](./2026-08-07--npc-character-depth.md) | Character DB: szersze osobowości, abilities, HP (współdzielony z fauną) + ekran „Mieszkańcy” | `planned` |
| [2026-08-07--quests-v1.md](./2026-08-07--quests-v1.md) | Questy v1: minimalny relay quest nad istniejącym dialogiem | `planned` |
| [2026-08-07--ambient-world-audio.md](./2026-08-07--ambient-world-audio.md) | Ambient audio zależne od obszaru (świerszcze/ptaki dzień-noc, szum fal blisko oceanu) | `planned` |
| [2026-08-07--minimap.md](./2026-08-07--minimap.md) | Mini-mapa (bottom-left, collapsible, kierunek do osady) | `done` |
| [2026-08-07--predator-prey-system.md](./2026-08-07--predator-prey-system.md) | Predator-prey z HP, damage na kontakt, spawner + respawn | `done` |

When adding a new plan: create `YYYY-MM-DD--slug.md`, add a row here.

## Related

- [research/README.md](../research/README.md)
- [reviews/README.md](../reviews/README.md) — m.in. `to-do--water-quality.md`
- [issues/README.md](../issues/README.md)

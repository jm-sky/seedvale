# Issues

Tracked work items (bugs, improvements) live here — not in GitHub Issues.

## Status values

| Status | Meaning |
|--------|---------|
| `todo` | Identified, not started |
| `planned` | Scoped and scheduled |
| `in progress` | Actively being worked on |
| `done` | Fix merged / accepted |
| `verification needed` | Fix applied; needs manual or QA check |

## Index

| ID | File | Summary | Status |
|----|------|---------|--------|
| 001 | [2026-08-07--001--water-shore-color-banding.md](./2026-08-07--001--water-shore-color-banding.md) | Brzeg jeziora w schodkach — twarde progi koloru terenu | `done` |
| 002 | [2026-08-07--002--water-daynight-integration.md](./2026-08-07--002--water-daynight-integration.md) | Woda nie reaguje na dzień/noc | `done` |
| 003 | [2026-08-07--003--ocean-shoreline-artifacts.md](./2026-08-07--003--ocean-shoreline-artifacts.md) | Ostre krawędzie/artefakty na styku oceanu z lądem | `todo` |
| 004 | [2026-08-08--004--mobile-modals-untappable-pointer-events.md](./2026-08-08--004--mobile-modals-untappable-pointer-events.md) | Modale (pauza/zadania/mieszkańcy/dialog) nie reagują na dotyk ani nie scrollują — `pointer-events: none` odziedziczone z `<body>` | `done` |
| 005 | [2026-08-08--005--mobile-touch-ui-icon-library.md](./2026-08-08--005--mobile-touch-ui-icon-library.md) | Guziki dotykowe (☰/mapa/G/L/RUN/E) używają gołego tekstu/emoji — rozważyć bibliotekę ikon | `todo` |
| 006 | [2026-08-08--006--villagers-list-virtualization.md](./2026-08-08--006--villagers-list-virtualization.md) | Ekran Mieszkańcy renderuje całą listę naraz — dodać paginację/infinite/virtual scroll przy większej liczbie NPC | `todo` |
| 007 | [2026-08-08--007--npc-labels-over-modals.md](./2026-08-08--007--npc-labels-over-modals.md) | Etykiety NPC widoczne nad otwartym menu (pauza/quest log/Mieszkańcy/dialog) — brak `z-index` na `labelRenderer.domElement` | `verification needed` |
| 008 | [2026-08-09--008--npc-missing-surname.md](./2026-08-09--008--npc-missing-surname.md) | NPC-e nie mają nazwiska — brak pola w danych, nie tylko w UI; etykieta uproszczona (bez potrzeby) przy okazji | `verification needed` |
| 009 | [2026-08-10--009--ocean-normal-map-reflection-blotches.md](./2026-08-10--009--ocean-normal-map-reflection-blotches.md) | Ocean pokazuje gęste, "chmurowe" odbicia z twardymi krawędziami między kolorami — regresja po zagęszczeniu normal-mapy terenu | `verification needed` |
| 010 | [2026-08-10--010--npc-group-reaction-dampening.md](./2026-08-10--010--npc-group-reaction-dampening.md) | NPC w grupie reagują ("Hmm?") tak samo często jak samotne — brak tłumienia zależnego od liczby pobliskich NPC/openness | `verification needed` |
| 011 | [2026-08-10--011--item-label-visibility-distance-darkness.md](./2026-08-10--011--item-label-visibility-distance-darkness.md) | Etykiety drobnych przedmiotów widoczne za daleko i w ciemności — te same progi co etykiety NPC | `verification needed` |
| 012 | [2026-08-10--012--toast-notifications-for-quick-feedback.md](./2026-08-10--012--toast-notifications-for-quick-feedback.md) | Krótkie akcje (ognisko, znaleziona gałąź) niepotrzebnie blokują grę pełnym dialogiem zamiast toastu | `verification needed` |
| 013 | [2026-08-10--013--npc-label-gaze-cone-dimming.md](./2026-08-10--013--npc-label-gaze-cone-dimming.md) | NPC labels przygasają do 50%, gdy gracz nie patrzy w ich stronę (~90° stożek) | `verification needed` |

When adding a new issue, create `YYYY-MM-DD--NNN--short-slug.md` and add a row to this table.

**Next ID:** `014`

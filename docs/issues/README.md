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
| 003 | [2026-08-07--003--ocean-shoreline-artifacts.md](./2026-08-07--003--ocean-shoreline-artifacts.md) | Ostre krawędzie/artefakty na styku oceanu z lądem | `done` |
| 004 | [2026-08-08--004--mobile-modals-untappable-pointer-events.md](./2026-08-08--004--mobile-modals-untappable-pointer-events.md) | Modale (pauza/zadania/mieszkańcy/dialog) nie reagują na dotyk ani nie scrollują — `pointer-events: none` odziedziczone z `<body>` | `done` |
| 005 | [2026-08-08--005--mobile-touch-ui-icon-library.md](./2026-08-08--005--mobile-touch-ui-icon-library.md) | Guziki dotykowe — Lucide w Faza 4 planu 046 | `verification needed` |
| 006 | [2026-08-08--006--villagers-list-virtualization.md](./2026-08-08--006--villagers-list-virtualization.md) | Ekran Mieszkańcy renderuje całą listę naraz — dodać paginację/infinite/virtual scroll przy większej liczbie NPC | `todo` |
| 007 | [2026-08-08--007--npc-labels-over-modals.md](./2026-08-08--007--npc-labels-over-modals.md) | Etykiety NPC widoczne nad otwartym menu (pauza/quest log/Mieszkańcy/dialog) — brak `z-index` na `labelRenderer.domElement` | `verification needed` |
| 008 | [2026-08-09--008--npc-missing-surname.md](./2026-08-09--008--npc-missing-surname.md) | NPC-e nie mają nazwiska — brak pola w danych, nie tylko w UI; etykieta uproszczona (bez potrzeby) przy okazji | `verification needed` |
| 009 | [2026-08-10--009--ocean-normal-map-reflection-blotches.md](./2026-08-10--009--ocean-normal-map-reflection-blotches.md) | Ocean pokazuje gęste, "chmurowe" odbicia z twardymi krawędziami między kolorami — regresja po zagęszczeniu normal-mapy terenu | `verification needed` |
| 010 | [2026-08-10--010--npc-group-reaction-dampening.md](./2026-08-10--010--npc-group-reaction-dampening.md) | NPC w grupie reagują ("Hmm?") tak samo często jak samotne — brak tłumienia zależnego od liczby pobliskich NPC/openness | `verification needed` |
| 011 | [2026-08-10--011--item-label-visibility-distance-darkness.md](./2026-08-10--011--item-label-visibility-distance-darkness.md) | Etykiety drobnych przedmiotów widoczne za daleko i w ciemności — te same progi co etykiety NPC | `verification needed` |
| 012 | [2026-08-10--012--toast-notifications-for-quick-feedback.md](./2026-08-10--012--toast-notifications-for-quick-feedback.md) | Krótkie akcje (ognisko, znaleziona gałąź) niepotrzebnie blokują grę pełnym dialogiem zamiast toastu | `verification needed` |
| 013 | [2026-08-10--013--npc-label-gaze-cone-dimming.md](./2026-08-10--013--npc-label-gaze-cone-dimming.md) | NPC labels przygasają do 50%, gdy gracz nie patrzy w ich stronę (~90° stożek) | `verification needed` |
| 014 | [2026-08-10--014--terrain-detail-normal-map-green-channel.md](./2026-08-10--014--terrain-detail-normal-map-green-channel.md) | Normal-mapa terenu pieczona z „górą" w kanale G zamiast B — „camo" na ziemi, którego obniżanie `normalScale` tylko pogarszało; przy okazji: wyłączenie AO gasiło całą scenę | `verification needed` |
| 015 | — | Fauna jedzenie/woda dla sytości/nawodnienia — **przeniesione** do [planu 094](../plans/archive/2026-08-13--094--fauna-food-water-for-satiety-hydration.md) | `verification needed` |
| 016 | [2026-08-11--016--god-rays-mountain-whiteout.md](./2026-08-11--016--god-rays-mountain-whiteout.md) | God rays: biały whiteout na wyżynach / przy kamerze zza postaci (clamp 0.8 niewystarczający) | `done` |
| 017 | [2026-08-12--017--nearby-status-bars.md](./2026-08-12--017--nearby-status-bars.md) | Paski HP/stamina NPC i mobów widoczne tylko w pobliżu gracza, aby ograniczyć clutter | `done` |
| 018 | [2026-08-12--018--house-scale-vs-npc.md](./2026-08-12--018--house-scale-vs-npc.md) | Domki są zazwyczaj zbyt małe względem rozmiaru NPC | `verification needed` |
| 019 | [2026-08-12--019--configuration-localstorage-domains.md](./2026-08-12--019--configuration-localstorage-domains.md) | Rozdzielenie localStorage na niezależne domeny konfiguracji | `done` |
| 020 | [2026-08-12--020--world-configuration-options.md](./2026-08-12--020--world-configuration-options.md) | Dodatkowe opcje świata, m.in. wielkość osady startowej/domowej | `done` |
| 021 | [2026-08-12--021--development-asset-lists.md](./2026-08-12--021--development-asset-lists.md) | Lista modeli i dźwięków jako stały element development flow | `done` |
| 022 | [2026-08-12--022--ocean-through-tree-foliage.md](./2026-08-12--022--ocean-through-tree-foliage.md) | Ocean/jeziora malują się przez korony drzew (BLEND liście + depthWrite wody) | `done` |
| 023 | [2026-08-12--023--road-grass-ground-cover.md](./2026-08-12--023--road-grass-ground-cover.md) | Droga/trawa: ziarno dirtu, soft edge, filler blisko kamery | `done` |
| 024 | [2026-08-12--024--wild-fauna-enters-village-and-spawns-too-close.md](./2026-08-12--024--wild-fauna-enters-village-and-spawns-too-close.md) | Dzikie zwierzęta wchodzą do wioski; spawn-pointy za blisko osady i siebie nawzajem | `verification needed` |
| 025 | [2026-08-12--025--npc-react-to-stolen-village-tools.md](./2026-08-12--025--npc-react-to-stolen-village-tools.md) | NPC protestują, gdy gracz bierze widły/sierp z wioski | `todo` |
| 026 | [2026-08-12--026--cave-mouth-flat-prop-not-a-hole.md](./2026-08-12--026--cave-mouth-flat-prop-not-a-hole.md) | Jaskinia: płaski czarny „daszek" zamiast realnej dziury w terenie | `verification needed` |
| 027 | [2026-08-13--027--settlement-streaming-main-thread-freeze.md](./2026-08-13--027--settlement-streaming-main-thread-freeze.md) | Osada streamuje się synchronicznie — ~89 ms freeze przy pojawieniu się wioski w polu widzenia | `verification needed` |
| 028 | [2026-08-13--028--inland-water-dual-material.md](./2026-08-13--028--inland-water-dual-material.md) | Śródlądowy staw/ciek: shader jeziora + ocean Water.js na jednym zbiorniku | `done` |
| 029 | [2026-08-13--029--village-in-open-ocean.md](./2026-08-13--029--village-in-open-ocean.md) | Wioska na otwartym oceanie / zalewanej ławicy | `verification needed` |
| 030 | [2026-08-14--030--perf-render-bottlenecks.md](./2026-08-14--030--perf-render-bottlenecks.md) | Diagnostyka 012: N8AO + draw calle osady/NPC + shadow/mirror + hitch `chunk mesh` — bez optymalizacji jeszcze | `todo` |
| 031 | [2026-08-15--031--unbounded-proximity-scans-fauna-settlement.md](./2026-08-15--031--unbounded-proximity-scans-fauna-settlement.md) | Audyt 013: O(N²) proximity scany bez spatial index — `AnimalAgent.nearest()` i `createSettlement.ts` `nearbyNpcCount` (drugi bez gatingu w ogóle) | `todo` |
| 032 | [2026-08-15--032--mobile-black-world-screen.md](./2026-08-15--032--mobile-black-world-screen.md) | Telefon: sporadyczny czarny świat 3D przy działającym UI/HUD — kamera w terenie/domu + 0-size composer resize | `verification needed` |
| 033 | [2026-08-17--033--bloom-whiteout-threejs-185-upgrade.md](./2026-08-17--033--bloom-whiteout-threejs-185-upgrade.md) | Patrząc w słońce cały ekran biały — `UnrealBloomPass` composite shader zmieniony w three r18x (upstream PR #31528, 3× RGB + alpha skalująca się z jasnością zamiast stałej); `bloomStrength` obniżony 0.28→0.09 jako kompensacja | `verification needed` |
| 034 | [2026-08-19--034--hud-player-health-bar.md](./2026-08-19--034--hud-player-health-bar.md) | HUD pod zegarem: brak paska HP — dodać Zdrowie nad kondycją | `done` |
| 035 | [2026-08-19--035--playtest-coins-placement-inventory.md](./2026-08-19--035--playtest-coins-placement-inventory.md) | Playtest: Kupiec w monetach + rzadki spawn, ukrycie „Poproś o miecz”, namiot/pułapka na drodze, Zastaw z ekwipunku | `done` |
| 036 | [2026-08-19--036--settlement-prop-colliders.md](./2026-08-19--036--settlement-prop-colliders.md) | Koń kupca, wóz i sterta drewna bez kolizji — dyski w `ColliderRegistry` | `verification needed` |
| 037 | [2026-08-19--037--village-campfire-flat-pad.md](./2026-08-19--037--village-campfire-flat-pad.md) | Ognisko wioskowe bez równego kawałka terenu | `todo` |
| 038 | `2026-08-20--038--npc-labels-and-sound-query-param.md` | Ukryć dalsze NPC labels; dodać `noSound=true` query param | `todo` |
| 039 | [2026-08-24--039--terrain-prepare-level-floorheights-not-updated.md](./2026-08-24--039--terrain-prepare-level-floorheights-not-updated.md) | Wyrównaj/Przygotuj teren (i zwykłe kopanie) nie zmieniają wizualnie terenu — `applyModificationToTile` pisze tylko do `tile.heights`, mesh czyta `tile.floorHeights` | `todo` |

When adding a new issue, create `YYYY-MM-DD--NNN--short-slug.md` and add a row to this table.

**Next ID:** `040`

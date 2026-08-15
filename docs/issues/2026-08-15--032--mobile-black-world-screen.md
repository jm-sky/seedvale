# 032 — Sporadyczny czarny świat 3D na telefonie (UI/HUD zostają)

**Status:** `verification needed`
**Date:** 2026-08-15
**Source:** zgłoszenie użytkownika (telefon: UI Seedvale + etykiety NPC/HUD widoczne, obszar świata 3D całkowicie czarny)

Nie jest to „teleport kamery gdy ekran czarny”. Dwie niezależne luki w istniejących systemach mogły dać ten sam objaw (czarny canvas WebGL + działający DOM: Vue UI i CSS2D etykiety).

## Przyczyna 1 — kamera w geometrii (✅ kod)

Third-person boom w `PlayerController.syncCamera()` był czystą orbitą (`yaw` / `pitch` / `distance`). **Zero** kolizji z heightfieldem i **zero** kolizji z colliderami planu 097.

- `pitch` min = −0.9, `distance` default 12 → `camera.y ≈ lookAt.y + sin(−0.9)·12 ≈ −8 m` pod płaskim terenem. Teren jest `FrontSide`; z pod spodu widać backface’y (cull) + `clearColor` czarny.
- Domyślny boom 12 m w wiosce regularnie przecina bryłę domu (collider to koło `footprintRadius` tylko dla *ciała* gracza). Kamera w dachu/ścianie: near plane 0.1 tnie bryłę → czarna klatka. Etykiety NPC to HTML (`CSS2DRenderer`), więc nadal się rysują.
- Potwierdzone wcześniej w researchu jaskiń: [009](../research/2026-08-13--009--underground-caves.md) („zero raycastu/collision”).

Reprodukcja (deterministyczna, unit test): pitch −0.9, distance 12, look-at y=1, płaski teren y=0 → unconstrained `cam.y < −8`.

## Przyczyna 2 — resize / composer na mobile (✅ kod, 🟡 czy to ten screen)

`window.visualViewport` `resize` wołał `renderer.setSize` + `postProcessing.setSize` przy **każdej** klatce animacji paska adresu i przy blipie `height=0` podczas `orientationchange`. Target 0-wysokości w EffectComposer/N8AO + `camera.aspect = Inf` = czarny świat, UI bez zmian. Brakło też odtworzenia targetów composera po `webglcontextrestored` (Three.js re-inituje GL, ale nie RT N8AO/bloom).

## Poprawka (2026-08-15)

1. `src/player/cameraBoom.ts` — `resolveCameraBoom` ciągnie kamerę wzdłuż boomu (nie teleportuje) nad teren i przed cylindry colliderów o `radius ≥ 1.2` (domy/studnia; pnie drzew 0.4 zostają).
2. `src/render/rendererResize.ts` — skip rozmiaru `< 16 px` i no-op gdy integer size się nie zmienił; `createApp` scala eventy do jednej klatki i po restore kontekstu woła `setSize` composera.
3. `?camdebug=1` — tymczasowy overlay (pozycja kamery, terrainY, calls/tris, contextLost). Nie w HUD produkcyjnym.

## Weryfikacja

- Techniczna: `npx tsc --noEmit` · `npm run lint` · `npm run test` · `npm run build`.
- Przeglądarka (otwarta): desktop + mobile viewport — orbit przy domach, look-up, orientacja, dłuższa sesja. Kroki w [plans/README.md](../plans/README.md) quick notes.

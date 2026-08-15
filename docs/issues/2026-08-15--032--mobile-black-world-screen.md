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

## Kontrolowany audyt (2026-08-15, po ed44858) — czarne mruganie nadal występuje na otwartym terenie

Użytkownik zgłosił, że mruganie na czarno nadal występuje **poza wioską, bez drzew/domów, na otwartym terenie** — czyli poza zakresem obu przyczyn z tego issue (kamera w geometrii, resize 0-height). Audyt (~40 min, bez browser repro) prześledził cały render pipeline zamiast zakładać, że to znów `cameraBoom`.

### Findings

1. **Najbardziej prawdopodobna przyczyna: przejściowa utrata kontekstu WebGL (`webglcontextlost`/`restored`)**, typowa na mobile pod presją pamięci GPU/termiczną — ten pipeline jest ciężki (EffectComposer + N8AO half-res + bloom + SMAA + god rays + shadow map + water mirror RT 128², wszystko w osobnych render targetach). Zweryfikowane w `node_modules/three/src/renderers/WebGLRenderer.js` (three 0.180.0):
   - `renderer.render()` ma wbudowaną strażnicę `if (_isContextLost === true) return;` (linia ~1532) — więc podczas utraty kontekstu żadne wywołanie render nie rzuca błędu, po prostu nic nie rysuje. To dokładnie pasuje do objawu: canvas WebGL czarny, DOM UI (Vue + CSS2D etykiety) dalej działa.
   - `onContextRestore()` woła `initGLContext()`, które tworzy **nowy** `properties = new WebGLProperties()` (świeży WeakMap) — więc wszystkie tekstury/geometrie/render targety (włącznie z N8AO/bloom/EffectComposer RT) są automatycznie traktowane jako nie-zainicjalizowane i leniwie odtwarzane przy najbliższym renderze. To dzieje się **niezależnie** od tego, co robi kod aplikacji.
   - Wniosek: samo Three.js już się "samo-leczy" po context restore. Fix z ed44858 (`applyViewportSize(true)` po `webglcontextrestored`, wymuszający `composer.setSize`) jest defensywny i nieszkodliwy, ale nie jest jedynym mechanizmem odtwarzania stanu — a jeśli utrata kontekstu jest rzeczywistą przyczyną, krótkie, samoistnie znikające czarne miganie (a nie trwały czarny ekran) jest dokładnie tym, czego należy się spodziewać: trwa tylko tyle, ile trwa sama utrata kontekstu (od ułamka sekundy do kilku sekund na słabszym mobile), po czym renderer wraca sam.
   - To nie zostało potwierdzone logami z realnego urządzenia — patrz "Next step" niżej.

2. **Alternatywne hipotezy rozważone i uznane za mniej prawdopodobne:**
   - Resize / `visualViewport` 0-height blip — `shouldApplyRendererResize` (`src/render/rendererResize.ts`) poprawnie odrzuca `NaN`/`Infinity`/`< 16px` i jest no-op gdy rozmiar całkowity się nie zmienił. Wygląda solidnie.
   - `camera.aspect` = `Infinity`/`NaN` — `applyViewportSize` w `createApp.ts` gwarantuje `width`/`height ≥ MIN_RENDERER_SIZE` przed przeliczeniem `camera.aspect = width/height`, więc dzielenie przez zero nie powinno wystąpić przez tę ścieżkę.
   - `cameraBoom` (`resolveCameraBoom`) generujący `NaN`/`Infinity` w pozycji kamery — prześledzone matematycznie: `sampleHeight` (przez `ChunkManager.readField`) zawsze zwraca skończoną wartość (albo interpolacja z załadowanego kafla przez `sampleApronGrid` z indeksami zaciskanymi `clampi` do `[0, apronRes-1]`, albo proceduralny fallback `sampleHeightAt` gdy chunk nie jest gotowy — obie ścieżki deterministyczne i skończone). `segmentCircleOverlapT`/`firstCylinderHitT` mają porównania (`<`) które nigdy nie przypisują `NaN` do `hitT` (bo `NaN < x` jest zawsze `false`). Nie znaleziono realnej ścieżki do `NaN`/`Infinity` w pozycji kamery przez ten kod.
   - N8AO/bloom/SMAA konfiguracja — `RenderPass` jest jawnym fallbackiem gdy AO jest wyłączone (`renderPass.enabled = !aoOn`), więc nie ma stanu, w którym baza sceny w ogóle się nie renderuje z powodu wyłączonych passów.
   - `WaterMirror.render()` poprawnie zapisuje/przywraca `renderer.getRenderTarget()`, `xr.enabled`, `shadowMap.autoUpdate` wokół własnego renderu do RT — nie zostawia rendererowi złego stanu przed `composer.render()`.

3. **Wykluczone:** `cameraBoom` jako źródło NaN/Infinity (patrz wyżej — matematycznie prześledzone, brak ścieżki). Resize-guard dla `< 16px`/`NaN`/`Infinity` (wygląda kompletny, brak dowodu na lukę).

4. **Czy `cameraBoom` nadal wygląda podejrzanie?** Nie w sensie generowania złych liczb. Nie zmieniono go w tym audycie — brak dowodu uzasadniającego zmianę.

5. **Czy renderer/composer/context/resize wygląda poprawnie?** Tak, z jednym zastrzeżeniem: dotychczasowa diagnostyka (`?camdebug=1`) pokazywała tylko *żywy* stan co 250ms — mignięcie krótsze niż to okno mogło nigdy nie zostać zaobserwowane, nawet gdyby użytkownik patrzył na overlay w momencie wystąpienia.

### Changes

- `src/debug/createCameraDebugOverlay.ts` — `CameraDebugSnapshot` przyjmuje teraz `events: readonly string[]`; overlay renderuje sekcję `events:` (ostatnie zdarzenia, nie tylko żywy stan).
- `src/app/createApp.ts` — dodano lepki log zdarzeń (max 6, tylko gdy `?camdebug=1`, więc zero kosztu w produkcji):
  - `contextLost` / `contextRestored after <ms>ms` (z realnym czasem trwania utraty kontekstu),
  - `invalid viewport <w>x<h>` gdy `applyViewportSize` odrzuca lub podstawia rozmiar,
  - `camera invalid: pos=... aspect=...` gdy pozycja kamery lub aspect przestają być skończone (edge-triggered — loguje tylko przejście, nie co klatkę).
  - Brak zmian w logice renderowania/kamery — czysto diagnostyczne, gated za istniejącą flagą debug.

### Verification

- `npx tsc --noEmit` — pass.
- `npx eslint .` — 11 pre-existing błędów w niepowiązanym `_temp/asset-audit/inspect.mjs` (poza zakresem tej zmiany); `npx eslint src/app/createApp.ts src/debug/createCameraDebugOverlay.ts` — czysto.
- `npm run test` — 805/805 pass.
- `npm run build` — pass (`vue-tsc --noEmit && vite build`).

### Browser verification

`NOT VERIFIED — requires live browser/device reproduction`

### Next step

Przy następnym wystąpieniu migotania: otwórz grę z `?camdebug=1` na telefonie, zagraj normalnie do momentu wystąpienia migotania, następnie **bez odświeżania strony** spójrz na sekcję `events:` w overlayu w lewym dolnym rogu. Jeśli pojawi się linia `contextLost` / `contextRestored after Nms` — to potwierdza hipotezę #1 (utrata kontekstu WebGL) i uzasadnia dalszą pracę (np. redukcję liczby jednoczesnych render targetów na słabszych urządzeniach). Jeśli overlay pokaże `camera invalid` lub `invalid viewport` — to wskazuje inną, jeszcze nieprzewidzianą ścieżkę i wymaga dalszego śledztwa w tym konkretnym miejscu. Jeśli `events:` pozostanie puste mimo zaobserwowanego migotania — przyczyna leży poza tym, co ten audyt potrafił tanio zdiagnozować (np. sterownik GPU/kompozytor przeglądarki poza kontrolą Three.js) i potrzebna będzie inna metoda (np. `chrome://gpu` po incydencie, albo nagranie ekranu z overlayem widocznym).

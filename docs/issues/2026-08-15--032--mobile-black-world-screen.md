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

## Audyt render pipeline (2026-08-15, po realnym screenshocie z telefonu) — hipoteza #1 (context loss) NIE potwierdzona

Użytkownik dostarczył **realny screenshot** z telefonu Android zrobiony w momencie czarnego ekranu, z `?camdebug=1` aktywnym. Zawartość overlayu:

```text
pos 123.86 8.94 -25.92 / rot -2.60 -1.31 -2.61
clip near 0.1 far 300 aspect=2.52
terrainY 2.20  cam-ground 6.74
scene 8169  calls 1058  tris 1786147
dpr 2.00  size 1504x596
gl error NONE  contextLost false
events: (none)
```

Czyli w momencie realnego czarnego ekranu: kamera poprawna, viewport poprawny, brak `gl error`, brak `contextLost`, **i sticky event log — dodany właśnie po to, by złapać krótkie miganie między odświeżeniami overlayu — jest pusty**. To bezpośrednio podważa hipotezę #1 z poprzedniego audytu (przejściowa utrata kontekstu WebGL): gdyby `webglcontextlost` faktycznie wystąpił, `onWebglContextLost` (`src/app/createApp.ts:1540`) pushowałby `contextLost` do tego samego logu przed jakimkolwiek kolejnym renderem — a listener jest zarejestrowany od startu aplikacji, nie tylko w oknie 250ms. Pusty `events:` przy jednocześnie czarnym canvasie to silny dowód **przeciw** context loss jako przyczynie tego konkretnego incydentu.

### Nowa wiodąca hipoteza: render targety EffectComposer/N8AO/Bloom są `HalfFloatType`/`FloatType`, a ich poprawne renderowanie zależy od rozszerzeń WebGL2, które nie są gwarantowane na każdym mobilnym GPU

Zweryfikowane w kodzie (three 0.180.0 w `node_modules`):

- `EffectComposer` (`node_modules/three/examples/jsm/postprocessing/EffectComposer.js`) tworzy swoje dwa główne render targety (`renderTarget1`/`renderTarget2`) jako `{ type: HalfFloatType }`, gdy `createPostProcessing` (`src/render/createPostProcessing.ts:63`) nie przekazuje własnego RT do konstruktora — a nie przekazuje.
- `UnrealBloomPass` (`node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js`) alokuje **11 dodatkowych** `HalfFloatType` render targetów (bright pass + 5-poziomowy separable blur w obu osiach).
- `n8ao` (`node_modules/n8ao/dist/N8AO.js`) używa zarówno `HalfFloatType`, jak i `FloatType` dla swoich wewnętrznych buforów (depth/normal do obliczeń GTAO).
- Razem to ~15 jednocześnie żywych float/half-float render targetów, poza `WaterMirror` (128², `UnsignedByteType` domyślnie — bezpieczny) i shadow mapą.
- Renderowanie *do* takiego RT w WebGL2 (nie samo próbkowanie) wymaga `EXT_color_buffer_half_float` lub `EXT_color_buffer_float` (`node_modules/three/src/renderers/webgl/WebGLCapabilities.js:41`, `WebGLExtensions.js:56-59`). **Three.js nie sprawdza tego przed renderowaniem do custom `WebGLRenderTarget`** — `textureTypeReadable()` (jedyne miejsce, które w ogóle patrzy na te rozszerzenia) jest używane tylko przy `readRenderTargetPixels`, nie przy zwykłym `renderer.render()` do docelowego RT. Nie ma więc żadnego preflight-guarda ani fallbacku w samym Three.js.
- Jeśli sterownik/GPU danego telefonu nie wspiera (albo pod presją pamięci/termiczną chwilowo nie dostarcza) tego rozszerzenia poprawnie, skutek zależy od implementacji drivera: niektóre GPU zgłaszają `INVALID_FRAMEBUFFER_OPERATION` przy próbie rysowania do niekompletnego framebuffera (co *powinno* zostać złapane przez istniejący `gl.getError()` poll co 250ms w `createCameraDebugOverlay.ts:55`), ale inne (typowe dla części Android ANGLE/GLES ścieżek) po cichu tworzą framebuffer z downgradowanym formatem (np. RGBA16F → RGBA8) albo zostawiają go pustym/czarnym **bez zgłoszenia błędu WebGL**. To dokładnie pasuje do obserwacji: `gl error NONE` + `contextLost false` + całkowicie czarny finalny frame.
- Sporadyczność objawu pasuje do tej hipotezy: to nie stały brak wsparcia (bo wtedy ekran byłby czarny cały czas), tylko prawdopodobnie chwilowa niestabilność drivera pod obciążeniem — scena ze screenshotu jest bardzo ciężka jak na telefon (`tris 1786147`, `calls 1058`, `dpr 2.00`), co zwiększa presję pamięci GPU dokładnie w момencie, gdy te ~15 float RT + shadow map + wszystkie tekstury sceny muszą współistnieć.

### Sprawdzone i wykluczone/uznane za bezpieczne w tym audycie

- **`EffectComposer.render()` (kolejność passów, swap, `renderToScreen`)** — przeanalizowane linia po linii. `pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i)` jest przeliczane przy każdym `render()`, więc niezależnie od tego, które passy są aktualnie włączone (np. `godRaysPass`/`bloomPass` wyłączone w danej klatce), ostatni **włączony** pass zawsze poprawnie renderuje na ekran. `outputPass` (grading + tone mapping + output color space) jest zawsze dodany i nigdy nie jest programowo wyłączany w tym kodzie (`setPassEnabled` nie ma gałęzi dla `outputPass`) — więc zawsze jest ostatnim włączonym passem. Brak state-leak w samym composerze.
- **`renderPass`/`aoPass` wzajemne wykluczanie (`syncAoPass()`, `src/render/createPostProcessing.ts:112`)** — `aoPass.enabled` i `renderPass.enabled = !aoOn` są ustawiane synchronicznie w jednej funkcji, wywoływanej z każdego miejsca, które zmienia stan AO (`applyConfig`, `applyFrameBudget`, `setPassEnabled`). Nie ma ścieżki kodu, w której oba są `false` jednocześnie (scena w ogóle nie renderowana) ani oba `true` (podwójny render).
- **`WaterMirror.render()`** — zapisuje i przywraca `renderer.getRenderTarget()`, `xr.enabled`, `shadowMap.autoUpdate` wokół własnego renderu; `renderer.setRenderTarget(currentTarget)` na końcu gwarantuje, że `composer.render()` zawsze zaczyna z poprawnym target = null (ekran) / właściwym RT. Nie zostawia scissor/viewport w złym stanie (nie modyfikuje ich w ogóle). Bezpieczne.
- **`createRenderer.ts`** — `antialias: false` (celowe, AA robi SMAA w composerze), `renderer.info.autoReset = false` (celowe, patrz komentarz w pliku) — obie decyzje nieszkodliwe dla czarnego frame'a.

### Changes

- `src/app/createApp.ts` — jednorazowy (przy starcie, tylko gdy `?camdebug=1`) sticky event log: `float RT support: half=<bool> full=<bool>`, sprawdzający `renderer.extensions.has('EXT_color_buffer_half_float' | 'EXT_color_buffer_float')`. Zero kosztu w produkcji (gated za `cameraDebug`), zero kosztu per-frame (liczone raz). Cel: przy następnym repro na telefonie użytkownika, ten wpis w `events:` bezpośrednio potwierdzi lub obali powyższą hipotezę — jeśli obie flagi są `false` na tym urządzeniu, to bardzo mocny dowód na przyczynę. Jeśli obie `true`, hipoteza się nie utrzymuje i trzeba szukać dalej (np. chwilowa utrata rozszerzenia pod presją pamięci — do tego potrzebny byłby per-frame check, celowo pominięty tutaj jako zbyt kosztowny bez dowodu, że jest potrzebny).
- Brak zmian w logice renderowania, passach, composerze czy `WaterMirror` — czysto diagnostyczne, jak nakazywał zakres audytu.

### Verification

- `npx tsc --noEmit` — pass.
- `npx eslint src/app/createApp.ts` — czysto.
- `npm run test` — 831/831 pass.
- `npm run build` — pass (`vue-tsc --noEmit && vite build`).

### Browser verification

`NOT VERIFIED`

### Next step

1. Przy następnym wystąpieniu migotania na telefonie z `?camdebug=1` aktywnym od startu sesji: sprawdzić linię `float RT support: half=... full=...` w `events:`. `false`/`false` (lub nawet tylko `half=false`, bo half-float jest głównym typem używanym w tym pipeline) silnie potwierdza hipotezę powyżej i uzasadnia fallback — np. wykrycie braku wsparcia i przekazanie do `EffectComposer`/`UnrealBloomPass`/`N8AOPass` `WebGLRenderTarget` z `type: UnsignedByteType` zamiast domyślnego float/half-float na dotkniętych urządzeniach (osobna zmiana, poza zakresem tego audytu — wymaga najpierw potwierdzenia na realnym urządzeniu).
2. Jeśli `half=true`/`full=true` na dotkniętym telefonie mimo to: hipoteza przesuwa się z "brak wsparcia rozszerzenia" na "chwilowa niestabilność sterownika pod presją pamięci GPU przy tej scenie" (`tris 1786147`, ~15 float RT jednocześnie) — wtedy warto rozważyć per-frame (lub co N klatek, tanio) `gl.checkFramebufferStatus` na aktualnie bindowanym framebufferze tuż po `composer.render()`, gated za `?camdebug=1`, jako kolejny krok diagnostyczny (celowo NIE dodane w tym audycie, bo nie ma jeszcze dowodu, że jest potrzebne, i wymagałoby sięgnięcia po prywatne `renderer.properties` API Three.js).

## Aktualizacja (2026-08-15, [review 017](../reviews/2026-08-15--017--rendering-regression-audit.md)) — nowa wiodąca hipoteza: main-thread stall, nie GPU/driver

Użytkownik dostarczył kolejny debug capture w trakcie czarnego ekranu z dokładnie `float RT support: half=true full=true` (potwierdza next-step #2 wyżej — driver *wspiera* float RT, więc hipoteza "brak rozszerzenia" jest wykluczona; scena była ciężka: `tris 5308409`, `calls 1847`, `dpr 2.00`).

Static-analysis regression audit (nie ten sam wątek co czarny-ekran-w-domu z Przyczyny 1 wyżej) znalazł niezależną ścieżkę, która pasuje do wszystkich dotychczasowych obserwacji (`gl error NONE`, `contextLost false`, UI/HUD działa, świat 3D czarny 1-3s) **bez wymagania utraty kontekstu ani driver-niestabilności**: `SettlementsManager.ensureLoaded()` → `waitForChunks()` (`src/terrain/chunkManager.ts:1385-1396`) może przy przerwie >48ms w game loop (typowe na mobile: background/foreground, throttling termiczny) zdrenować całą kolejkę finalizacji chunków **synchronicznie, bez żadnego `await`** (od `e25cce9` finalize nie ma już punktu yield), po czym `createSettlement()` buduje wszystkie propsy osady też synchronicznie (`080fd3f` usunął frame-yielding z planu 102 — patrz [issue 027](./2026-08-13--027--settlement-streaming-main-thread-freeze.md)). To może zablokować main thread na tyle długo, że przeglądarka na mobile pomija kilka klatek renderu — z zewnątrz nieodróżnialne od "czarnego ekranu", ale przyczyna to CPU stall, nie GPU/render-target failure. Szczegóły i dokładna ścieżka kodu: [review 017](../reviews/2026-08-15--017--rendering-regression-audit.md), sekcja "Most likely regression / A".

Nie potwierdzone w przeglądarce. Następny krok: powtórzyć next-experiment #1 z review 017 (wejście w zasięg nieodwiedzonej osady + backgrounding taba na mobile tuż przed rozwiązaniem `waitForChunks`) i sprawdzić, czy czarny ekran koreluje z tym momentem, niezależnie od `?camdebug=1`'s `events:` (ta ścieżka nie jest utratą kontekstu, więc `events:` pozostanie puste nawet jeśli to jest przyczyna — co samo w sobie jest zgodne z dotychczasową obserwacją "events: (none)" przy czarnym ekranie).

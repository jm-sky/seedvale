# Full-screen white-out looking toward the sun after three@0.185 upgrade

**Status:** `verification needed` (fix #3 applied, bloom confirmed the sole cause via user isolation testing; awaiting final browser confirmation)
**Created:** 2026-08-17
**Źródło:** User report po planie [136](../plans/2026-08-16--136--threejs-180-to-185-upgrade.md) (three.js 0.180→0.185)
**Powiązane:** issue [016](./2026-08-11--016--god-rays-mountain-whiteout.md) (poprzedni, innej przyczyny, whiteout od god rays), `src/render/createPostProcessing.ts`, `src/config/worldConfig.ts`, `src/world/createSky.ts`

## Update (2026-08-17, po pierwszym fixie)

Pierwszy fix (`bloomStrength` 0.28→0.09, patrz niżej) **nie usunął problemu w pełni**. Drugi user report doprecyzował objaw: jasne obszary rosnące wraz z widocznym niebem/horyzontem **plus ostre krawędzie/prostokątne artefakty na niebie**, nieobecne przy kamerze odwróconej od słońca. To wskazało na **drugą, bardziej bezpośrednią przyczynę pominiętą w pierwotnym audycie migracji planu 136**: `three`'s `Sky` addon (`three/examples/jsm/objects/Sky.js`) dostał między r180 a r185 **wbudowane proceduralne chmury, domyślnie włączone** (`cloudCoverage: 0.4`). `src/world/createSky.ts` nigdy nie ustawiał tego uniformu, więc po upgrade'zie te chmury renderowały się bez wiedzy Seedvale.

Fragment shadera (`node_modules/three/examples/jsm/objects/Sky.js`):

```glsl
if ( direction.y > 0.0 && cloudCoverage > 0.0 ) {
    float elevation = mix( 1.0, 0.1, cloudElevation );
    vec2 cloudUV = direction.xz / ( direction.y * elevation );  // ⚠ blows up as direction.y → 0
    cloudUV *= cloudScale;
    cloudUV += time * cloudSpeed;
    float cloudNoise = fbm( cloudUV * 1000.0 );  // sin()-based hash noise
    ...
    float sunInfluence = dot( direction, vSunDirection ) * 0.5 + 0.5;  // ⚠ brighter facing sun
    ...
    cloudColor *= vSunE * 0.00002;
    texColor = mix( texColor, cloudColor, cloudMask * cloudDensity );
}
```

Dwa mechanizmy dokładnie pasujące do zgłoszenia:

1. **Ostre/prostokątne artefakty** — `cloudUV = direction.xz / direction.y` dąży do nieskończoności, gdy `direction.y → 0` (patrzenie w stronę horyzontu). `fbm()` korzysta z `sin()`-owej funkcji hash (`hash(p) = fract(sin(dot(p, ...)) * 43758.5...)`) — dla dużych argumentów `sin()` na GPU traci precyzję, dając bloczkowe/kanciaste artefakty. Im więcej nieba blisko horyzontu w kadrze, tym więcej pikseli trafia w ten zakres — pasuje do "powiększają się wraz ze wzrostem widocznego obszaru nieba".
2. **Jaśniej patrząc w stronę słońca** — `sunInfluence` i finalne `cloudColor *= vSunE * 0.00002` jawnie podbijają jasność chmur, gdy kamera patrzy w stronę słońca, niezależnie od i dodatkowo do ścieżki bloomu opisanej niżej. To wyjaśnia, dlaczego sama redukcja `bloomStrength` nie usunęła efektu do końca — działa on równolegle, nie tylko przez pipeline post-processingu.

### Fix #2 (2026-08-17)

`src/world/createSky.ts` — jawnie ustawiony `uniforms['cloudCoverage'].value = 0`, wyłączając cały branch chmur w shaderze (`if (... && cloudCoverage > 0.0)` — `0` pomija go całkowicie, żadnego kosztu obliczeniowego). Seedvale ma już własny system pogody/chmur (`weatherVisuals.ts`/`weatherParticles.ts`) — wbudowane chmury z addonu `Sky` nigdy nie były zamierzoną funkcją.

To jest teraz **główna** poprawiona przyczyna; fix #1 (bloom) zostaje jako uzupełniający, bo opisana niżej zmiana w `UnrealBloomPass` jest realna i niezależna.

## Objaw

Patrząc w stronę słońca, cały ekran robi się biały. Zgłoszone natychmiast po merge planu 136 (three.js upgrade), więc podejrzenie padło na tę zmianę, nie na god rays (issue 016, naprawione i zweryfikowane w przeglądarce 2026-08-11 — inny mechanizm).

## Root cause

`UnrealBloomPass` (`three/examples/jsm/postprocessing/UnrealBloomPass.js`) dostał w upstreamie między r180 a r185 przepisany composite shader (upstream PR #31528, oficjalnie o "kernel size / blockiness fix", ale niosący też zmianę formuły intensywności). Zdiffowano `three@0.180.0` vs `three@0.185.1` z npm:

**Stare (r180):**
```glsl
gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) + ... );
```
`gl_FragColor.a` = `bloomStrength * Σ(lerpBloomFactor(factor_i) * blurTex_i.a)` — blur textures mają `alpha = 1.0` (stały), więc **alpha_old jest praktycznie stałe** (~`bloomStrength × constant`), niezależne od jasności sceny.

**Nowe (r185):**
```glsl
// 3.0 for backwards compatibility with previous alpha-based intensity
vec3 bloom = 3.0 * bloomStrength * ( lerpBloomFactor(...) * tint * texture2D(...).rgb + ... );
float bloomAlpha = max(bloom.r, max(bloom.g, bloom.b));
gl_FragColor = vec4(bloom, bloomAlpha);
```
Dwie zmiany naraz:

1. RGB wyjścia jest teraz **3× większe** dla tego samego `bloomStrength` (jawnie udokumentowane w komentarzu upstream).
2. `alpha` **przestała być stała** — jest teraz równa jasności samego `bloom` (`max(r,g,b)`), czyli **skaluje się razem ze sceną**, zamiast być ograniczonym stałym współczynnikiem.

Composite pass renderuje z `AdditiveBlending` (`blendSrc = SrcAlphaFactor`, `blendDst = OneFactor`), czyli `dst += src.rgb * src.alpha`. Przed zmianą ten drugi czynnik (`alpha`) był praktycznie stały niezależnie od tego, jak jasny był dany piksel źródłowy. Po zmianie **alpha rośnie razem z color**, więc wkład bloomu do bufora skaluje się w przybliżeniu z kwadratem jasności źródła (`color × alpha ≈ color²`), zamiast liniowo jak wcześniej.

`src/world/createSky.ts` (`three/addons/objects/Sky.js`) renderuje tarczę słońca z surową jasnością `vSunE * 19000.0 * Fex` — rzędu tysięcy w przestrzeni liniowej HDR, długo zanim dotrze do `OutputPass`/ACES na końcu łańcucha (`AO → SMAA → Bloom → God rays → ACES`, patrz `createPostProcessing.ts`). Bright-pass bloomu (`bloomThreshold`) i tak przepuszcza tę wartość (próg działa w nieztonemapowanym HDR, nie w `[0,1]` — już ustalone w issue 016). Nowa, kwadratowo rosnąca formuła kompozytu wzmacnia tę i tak ekstremalną wartość znacznie mocniej niż przed upgrade'em, dając pełny white-out zamiast miękkiego halo wokół tarczy słońca.

To jest **inny mechanizm niż issue 016** (który dotyczył god rays, nie bloomu, i był już naprawiony/zweryfikowany 2026-08-11) — regresja wprowadzona wyłącznie przez wewnętrzną zmianę w addonie `UnrealBloomPass.js` między wersjami three.js, nieudokumentowana w oficjalnym Migration Guide (Migration Guide opisuje tylko core API, nie wewnętrzne shadery przykładów/addonów).

## Fix #1 — bloom (2026-08-17, pierwsza próba, niewystarczająca sama w sobie)

`src/config/worldConfig.ts` — domyślny `bloomStrength: 0.28 → 0.09` (podzielone przez udokumentowany mnożnik `3.0`, żeby przywrócić dokładnie tę samą wielkość RGB co przed upgrade'em). Zsynchronizowano też wartość startową w konstruktorze `UnrealBloomPass` (`createPostProcessing.ts`) — kosmetyczne, `applyConfig()` i tak nadpisuje ją natychmiast po utworzeniu passu.

To przywraca RGB część kompozytu 1:1. Nie kompensuje w pełni kwadratowego zachowania nowego `alpha` dla ekstremalnych outlierów (dokładna tarcza słońca) — matematycznie `strength/3` daje ~9× mniejszy wkład blendingu dla tego samego pikselu źródłowego (bo `alpha` też spada 3×, a wkład to `color × alpha`), co powinno wystarczyć w praktyce, ale wymaga potwierdzenia w przeglądarce.

## Update #2 (2026-08-17, izolacja przez użytkownika)

Fix #2 (chmury) nie usunął problemu w pełni. Użytkownik zrobił własną izolację przez debug GUI (istniejące toggle per-pass, `createDebugGui.ts` → `config.postProcessing`):

- **Bloom OFF → efekt znika całkowicie**, niebo czyste.
- **God rays ON/OFF, AO ON/OFF → brak wpływu**, biała plama zostaje.
- Objaw obserwowany o 14:00 (słońce wysoko, nie tylko świt/zmierzch) — co dodatkowo wyklucza god rays (`updateGodRays()` w `createPostProcessing.ts` fade'uje do 0 przed południem, `fadeOut = 1 - smoothstep(elev, 0.12, 0.5)`).
- Opis doprecyzowany: nie czysta biel, tylko **bardzo jasne/prześwietlone highlighty** ("bright/blown highlights").

To jednoznacznie potwierdza: **wyłącznie bloom**, dokładnie zgodnie z Root cause opisanym niżej.

Ważne odkrycie przy tej okazji: **`bloomThreshold`'s GUI slider jest ograniczony do `[0, 1]`** (`createDebugGui.ts`), a surowa jasność tarczy słońca w `createSky.ts`'s `Sky` shaderze to rząd **tysięcy** w przestrzeni liniowej HDR (`vSunE * 19000.0 * Fex`, już ustalone w issue 016 — próg działa pre-tonemap, nie w `[0,1]`). Żadna wartość w tym zakresie suwaka nie wyklucza tego piksela z bright-passu — `bloomThreshold` jest praktycznie martwym gałkiem dla tego konkretnego problemu, niezależnie od tego, jak wysoko go ustawić w GUI.

Dodatkowy eksperyment użytkownika: podniesienie `rayleigh` (Sky folder w GUI) też wizualnie wpływało na efekt (0.85–1.0 wygląda dobrze z widocznym gradientem nieba, ~4 daje niemal białe niebo). **Odkryto jednak, że dotknięcie dowolnego suwaka w folderze Sky wywołuje `updateSkyFromGui()` (`createApp.ts:641`), które ustawia `dayNight.enabled = false`** — permanentnie wyłączając automatyczny cykl dnia/nocy i zamrażając niebo na ręcznie ustawionych wartościach `config.sky`. W normalnej rozgrywce (`dayNight.enabled === true`, domyślne), `dayNight.ts`'s `skyParamsFromTime()` przelicza **własny, dynamiczny** `rayleigh` co resync z pory dnia (`0.7 + dayFactor*0.45`, capped ~1.15 w pełni dnia — patrz komentarz w `dayNight.ts` opisujący **dokładnie ten sam typ whiteoutu z planu 066**), nadpisując statyczny `config.sky.rayleigh` niemal natychmiast po starcie świata. Czyli:

- Statyczny `config.sky.rayleigh` (default `2.4`) praktycznie **nie jest tym, co renderuje się podczas normalnej rozgrywki** — to efemeryczna wartość początkowa, nadpisywana w ułamku sekundy.
- Test rayleigh użytkownika był realny i wartościowy, ale wykonany w innym trybie (`dayNight.enabled = false`) niż oryginalny zgłoszony bug (14:00, zwykła rozgrywka, automatyczny cykl — czyli rayleigh już był dynamicznie ~1.15, blisko "dobrego" zakresu 0.85–1.0 znalezionego przez użytkownika).
- **Wniosek: rayleigh nie jest realną przyczyną oryginalnego zgłoszenia** — `dayNight.ts` już trzyma go w rozsądnym zakresie podczas zwykłej gry. Statyczny default **nie został zmieniony** (zostaje `2.4`, z komentarzem wyjaśniającym dlaczego), żeby nie sugerować fałszywej przyczynowości.

## Fix #3 — bloom, finalne wartości (2026-08-17, browser-verified przez użytkownika)

Użytkownik przetestował kombinację w GUI i potwierdził, że usuwa efekt przy zachowaniu widocznego bloomu gdzie indziej (ogniska, pochodnie, okna):

- `bloomStrength`: `0.09 → 0.02`
- `bloomRadius`: `0.35 → 0.05`
- `bloomThreshold`: `0.92 → 0.95` (drobna korekta — jak ustalono wyżej, nie jest to główny działający czynnik, `bloomThreshold`'s zakres `[0,1]` i tak nie może wykluczyć tarczy słońca)

Zaimplementowane jako nowe domyślne wartości w `src/config/worldConfig.ts` (`postProcessing.bloomStrength/bloomRadius/bloomThreshold`) i zsynchronizowane w konstruktorze `UnrealBloomPass` (`createPostProcessing.ts`). `src/config/worldConfig.ts`'s `sky.rayleigh` default **pozostał bez zmian** (`2.4`) — patrz uzasadnienie wyżej.

## Do zrobienia

1. **Finalna weryfikacja w przeglądarce** fixu #3 — spojrzeć wprost w słońce o różnych porach dnia (świt/południe/zmierzch), z kilku pozycji kamery (pierwsza/trzecia osoba), potwierdzić brak white-outu/blown highlightów, i że bloom nadal widocznie działa gdzie indziej (ogniska, pochodnie, okna nocą).
2. **Jeśli użytkownik wcześniej zmieniał bloom w GUI**, `localStorage` (`applyStoredPostProcessing` w `worldConfig.ts`) nadpisze nowe defaulty zapisaną starą wartością — trzeba albo wyczyścić zapisany config graficzny, albo ręcznie ustawić suwaki na nowe wartości (`0.02`/`0.05`/`0.95`).
3. Jeśli fix #3 nadal nie wystarcza przy bezpośrednim spojrzeniu w tarczę słońca: kolejny krok to nie dalsze kręcenie `bloomStrength`/`bloomRadius` (diminishing returns, i psuje bloom wszędzie indziej), tylko ograniczenie samej jasności HDR trafiającej do bright-passu bloomu u źródła (np. dedykowany clamp/soft-knee na scenie przed AO/bloom) — patrz Root cause dla mechanizmu (kwadratowe skalowanie `color × alpha`).
4. `bloomThreshold`'s GUI slider (`createDebugGui.ts`) jest ograniczony do `[0,1]`, mimo że bloom operuje w pre-tonemap liniowym HDR gdzie realne wartości sięgają tysięcy (już ustalone w issue 016, potwierdzone ponownie tutaj) — osobny, mniejszy porządkowy fix do rozważenia: albo rozszerzyć zakres suwaka, albo poprawić opis w `worldConfig.ts` (obecny komentarz "post tone-map ~0-1" jest błędny).
5. Jeśli w przyszłości Seedvale chciałoby użyć wbudowanych chmur `Sky` addonu zamiast/obok własnego systemu pogody — świadoma decyzja projektowa, nie przypadkowy default; na razie zostają wyłączone (fix #2).

## Pliki

- `src/config/worldConfig.ts` (`postProcessing.bloomStrength/bloomRadius/bloomThreshold` — główny fix; `sky.rayleigh` celowo **nie** zmieniony, patrz Update #2)
- `src/render/createPostProcessing.ts` (konstruktor `UnrealBloomPass`)
- `src/world/createSky.ts` (`cloudCoverage` uniform — fix #2, osobna, realna przyczyna artefaktów/dodatkowej jasności)
- `src/app/createApp.ts` (`updateSkyFromGui` — `dayNight.enabled = false` side effect, wyjaśnia dlaczego test rayleigh w GUI nie odzwierciedlał normalnej rozgrywki)
- `src/world/dayNight.ts` (`skyParamsFromTime` — już istniejący dynamiczny cap rayleigh ~1.15, z komentarzem o wcześniejszym whiteoucie z planu 066)
- `node_modules/three/examples/jsm/objects/Sky.js`, `node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js` (przyczyny, kod vendorowany przez three.js — nie edytowany)

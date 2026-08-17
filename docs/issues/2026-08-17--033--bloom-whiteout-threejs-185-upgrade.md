# Full-screen white-out looking toward the sun after three@0.185 upgrade

**Status:** `verification needed`
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

## Do zrobienia

1. **Weryfikacja w przeglądarce** — spojrzeć wprost w słońce o różnych porach dnia (świt/południe/zmierzch), z kilku pozycji kamery (pierwsza/trzecia osoba), blisko horyzontu i wysoko, potwierdzić brak white-outu i brak prostokątnych artefaktów.
2. Jeśli po fixie #2 (`cloudCoverage = 0`) nadal widać white-out patrząc bezpośrednio w tarczę słońca: dalsze obniżenie `bloomStrength` nie rozwiąże problemu proporcjonalnie (bo wkład bloomu skaluje się kwadratowo z jasnością źródła, nie liniowo — patrz Root cause) — następny krok to ograniczenie samej jasności HDR trafiającej do bright-passu bloomu (np. clamp sceny przed AO/bloom), a nie dalsze kręcenie `bloomStrength`.
3. **Jeśli użytkownik wcześniej zmieniał bloom w GUI**, `localStorage` (`applyStoredPostProcessing` w `worldConfig.ts`) nadpisze nowy default zapisaną starą wartością — nowy default zadziała tylko dla świeżego/wyczyszczonego configu graphics, albo trzeba ręcznie przesunąć suwak "Bloom Strength" w debug GUI. `cloudCoverage` nie jest w ogóle wystawione w GUI/configu (ustawione raz na stałe w `createSky.ts`), więc fix #2 nie ma tego problemu.
4. God rays (issue 016) i bloom są w tym samym łańcuchu (`Bloom → God rays`) — po potwierdzeniu fixu warto też sprawdzić, czy god rays nadal wygląda OK.
5. Jeśli w przyszłości Seedvale chciałoby użyć wbudowanych chmur `Sky` addonu zamiast/obok własnego systemu pogody — świadoma decyzja projektowa, nie przypadkowy default; na razie zostają wyłączone.

## Pliki

- `src/world/createSky.ts` (`cloudCoverage` uniform — główny fix)
- `src/config/worldConfig.ts` (`bloomStrength` default — uzupełniający fix)
- `src/render/createPostProcessing.ts` (konstruktor `UnrealBloomPass`)
- `node_modules/three/examples/jsm/objects/Sky.js`, `node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js` (przyczyny, kod vendorowany przez three.js — nie edytowany)
